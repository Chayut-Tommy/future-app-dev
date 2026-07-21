import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  AppData,
  AppliedBalanceEffect,
  Asset,
  BalanceEffectMode,
  CreditCard,
  Goal,
  Liability,
  LiabilityType,
  RecurringItem,
  SavingsComparisonEntry,
  Transaction,
  UserProfile,
} from '../types/models';
import { createEmptyAppData, loadAppData, saveAppData } from '../lib/storage';
import { generateId } from '../lib/id';
import { computeLuluScore } from '../lib/calculations/luluScore';
import { computeTotalMonthlyIncome, findPrimaryIncomeItem } from '../lib/calculations/incomeEngine';

export type TransferTarget = { kind: 'asset'; assetId: string } | { kind: 'liability'; liabilityId: string };

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeNetWorth(data: AppData): number {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  return totalAssets - totalLiabilities;
}

// One entry per calendar day, upserted — this is how the Wealth Map's net
// worth history starts accumulating real data from today onward, rather
// than faking a past trend line we never actually recorded.
function upsertNetWorthHistory(data: AppData): AppData {
  const date = todayISODate();
  const netWorth = computeNetWorth(data);
  const idx = data.netWorthHistory.findIndex((e) => e.date === date);
  let history = data.netWorthHistory;
  if (idx >= 0) {
    history = [...history];
    history[idx] = { date, netWorth };
  } else {
    history = [...history, { date, netWorth }];
    if (history.length > 180) history = history.slice(history.length - 180);
  }
  return { ...data, netWorthHistory: history };
}

// Keeps `user.monthlyIncome`/`incomeAmount`/`payFrequency`/`nextPayday` in
// sync with the real source of truth — active income-type recurringItems
// (PRD ask, §3: multiple income sources). Every existing reader of these
// fields (Money Engine, Safe to Spend, Lulu Score, Money Plan, timeline,
// reminders — ~25 files) keeps working unmodified, since it's still just
// one aggregate number/date; only how that number gets produced changed,
// from direct user entry to a live sum over however many sources exist.
function syncIncomeAggregate(data: AppData): AppData {
  const monthlyIncome = computeTotalMonthlyIncome(data.recurringItems);
  const primary = findPrimaryIncomeItem(data.recurringItems);
  return {
    ...data,
    user: {
      ...data.user,
      monthlyIncome,
      incomeAmount: primary?.amount,
      payFrequency: primary?.frequency ?? 'monthly',
      nextPayday: primary && !primary.nextDueDateUnknown ? primary.nextDueDate : null,
    },
  };
}

// Same pattern as net worth history — one real entry per calendar day,
// starting from today, never backfilled. This is what lets "Improved Lulu
// Score by 10 points" be a genuine, honestly-computed milestone later.
function upsertLuluScoreHistory(data: AppData): AppData {
  const result = computeLuluScore(data);
  if (result.locked) return data;
  const date = todayISODate();
  // Category-level snapshot, not just the total — lets the Score Movement
  // view explain WHICH category moved and by how much, by diffing two real
  // stored snapshots rather than fabricating an explanation (PRD ask, §A10).
  const categories = result.categories.map((c) => ({ key: c.key, points: Math.round(c.points) }));
  const idx = data.luluScoreHistory.findIndex((e) => e.date === date);
  let history = data.luluScoreHistory;
  if (idx >= 0) {
    history = [...history];
    history[idx] = { date, score: result.score, categories };
  } else {
    history = [...history, { date, score: result.score, categories }];
    if (history.length > 180) history = history.slice(history.length - 180);
  }
  return { ...data, luluScoreHistory: history };
}

// Every credit card balance is mirrored into a linked Liability so it
// actually reduces net worth and shows up on the Wealth Map (PRD ask: debt
// reduces net worth — previously credit cards were tracked in isolation and
// never touched the wealth picture at all). `creditCardId` marks the link
// so this liability is never confused with a manually-added one.
function upsertCreditCardLiability(data: AppData, card: CreditCard): AppData {
  const idx = data.liabilities.findIndex((l) => l.creditCardId === card.id);
  const entry: Liability = { id: idx >= 0 ? data.liabilities[idx].id : generateId(), type: 'credit_card', label: card.label, currentBalance: card.currentBalance, creditCardId: card.id };
  const liabilities = idx >= 0 ? data.liabilities.map((l, i) => (i === idx ? entry : l)) : [...data.liabilities, entry];
  return { ...data, liabilities };
}

function removeCreditCardLiability(data: AppData, cardId: string): AppData {
  return { ...data, liabilities: data.liabilities.filter((l) => l.creditCardId !== cardId) };
}

// Finds the user's Cash asset, creating one on first use — this is what
// lets income transactions automatically move the cash balance without the
// user maintaining it by hand. Only used for income: expenses never fabricate
// a Cash asset (see applyTransactionEffect below), since a negative balance
// conjured out of nowhere is confusing, not helpful.
function ensureCashAsset(data: AppData): { assets: Asset[]; cashAssetId: string } {
  const existing = data.assets.find((a) => a.type === 'cash');
  if (existing) return { assets: data.assets, cashAssetId: existing.id };
  const created: Asset = { id: generateId(), type: 'cash', label: 'Cash', currentValue: 0 };
  return { assets: [...data.assets, created], cashAssetId: created.id };
}

// Legacy fallback ONLY (regression-protection review, Stream B1): re-derives
// an effect from a transaction's current fields, byte-for-byte the same
// logic every transaction was handled with before appliedBalanceEffect
// existed. Used exclusively when reversing a transaction whose
// balanceEffect is undefined — i.e. it predates this model and never had a
// snapshot captured. Every transaction created or edited from here on
// always carries an explicit balanceEffect and a maintained
// appliedBalanceEffect, so this path never runs for new data; it exists
// purely so old, unmigrated data keeps behaving exactly as it always has.
function legacyApplyTransactionEffect(data: AppData, t: Omit<Transaction, 'id'> | Transaction, sign: 1 | -1): AppData {
  if (t.type === 'income') {
    const { assets, cashAssetId } = ensureCashAsset(data);
    const updatedAssets = assets.map((a) => (a.id === cashAssetId ? { ...a, currentValue: a.currentValue + sign * t.amount } : a));
    return { ...data, assets: updatedAssets };
  }

  const source = t.paymentSource ?? 'cash';

  if (source === 'cash') {
    const existing = data.assets.find((a) => a.type === 'cash');
    if (!existing) return data;
    const updatedAssets = data.assets.map((a) =>
      a.id === existing.id ? { ...a, currentValue: Math.max(0, a.currentValue - sign * t.amount) } : a
    );
    return { ...data, assets: updatedAssets };
  }

  if (source === 'credit_card' && t.creditCardId) {
    const card = data.creditCards.find((c) => c.id === t.creditCardId);
    if (!card) return data;
    const updatedCard: CreditCard = { ...card, currentBalance: card.currentBalance + sign * t.amount };
    const withCard = { ...data, creditCards: data.creditCards.map((c) => (c.id === card.id ? updatedCard : c)) };
    return upsertCreditCardLiability(withCard, updatedCard);
  }

  if (source === 'loan' && t.liabilityId) {
    const updatedLiabilities = data.liabilities.map((l) =>
      l.id === t.liabilityId ? { ...l, currentBalance: Math.max(0, l.currentBalance + sign * t.amount) } : l
    );
    return { ...data, liabilities: updatedLiabilities };
  }

  return data;
}

// Decides what balance effect a transaction SHOULD have — pure, never
// mutates anything, and never itself decides what was already applied
// (that's what appliedBalanceEffect records, and applyEffectDelta below
// acts on). paymentSource stays a purely factual record of how the money
// moved regardless of this decision; balanceEffect is the separate,
// independent question of whether Navilo should act on that fact by
// updating a stored balance (regression-protection review, Stream B1 §1-2).
// Returns undefined when balanceEffect is 'none', or when the relevant
// target (Cash asset / linked card / linked liability) doesn't exist —
// never fabricates one on the expense side (matches the long-standing rule
// that an expense never conjures a Cash asset out of nowhere).
function computeBalanceEffect(
  data: AppData,
  t: { type: 'income' | 'expense'; amount: number; paymentSource?: Transaction['paymentSource']; creditCardId?: string; liabilityId?: string; balanceEffect: BalanceEffectMode }
): AppliedBalanceEffect | undefined {
  if (t.balanceEffect === 'none') return undefined;

  if (t.type === 'income') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return undefined;
    return { targetKind: 'asset', targetId: cashAsset.id, delta: t.amount };
  }

  const source = t.paymentSource ?? 'cash';

  if (source === 'cash') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return undefined;
    return { targetKind: 'asset', targetId: cashAsset.id, delta: -t.amount };
  }

  if (source === 'credit_card' && t.creditCardId) {
    const card = data.creditCards.find((c) => c.id === t.creditCardId);
    if (!card) return undefined;
    return { targetKind: 'credit_card', targetId: card.id, delta: t.amount };
  }

  if (source === 'loan' && t.liabilityId) {
    const liability = data.liabilities.find((l) => l.id === t.liabilityId);
    if (!liability) return undefined;
    return { targetKind: 'liability', targetId: liability.id, delta: t.amount };
  }

  return undefined;
}

// Applies (sign=1) or reverses (sign=-1) an already-decided effect — never
// re-derives what the effect should be (computeBalanceEffect's job), and
// never re-derives it from a transaction's current fields either, which is
// exactly the gap that let a "record only" edit's stale effect get reversed
// against the wrong balance (regression-protection review, Stream B1 §2-3:
// "a reversal must always negate the last balance delta Navilo actually
// applied, not derive an effect from the transaction's current editable
// fields"). A target that no longer exists (deleted independently) is a
// safe, silent no-op — never an error, never redirected to a different
// target, never fabricated against a new one.
function applyEffectDelta(data: AppData, effect: AppliedBalanceEffect | undefined, sign: 1 | -1): AppData {
  if (!effect) return data;

  if (effect.targetKind === 'asset') {
    const existing = data.assets.find((a) => a.id === effect.targetId);
    if (!existing) return data;
    // Floored at 0 — Cash should never read as a negative asset (PRD ask).
    const updatedAssets = data.assets.map((a) =>
      a.id === existing.id ? { ...a, currentValue: Math.max(0, a.currentValue + sign * effect.delta) } : a
    );
    return { ...data, assets: updatedAssets };
  }

  if (effect.targetKind === 'credit_card') {
    const card = data.creditCards.find((c) => c.id === effect.targetId);
    if (!card) return data;
    const updatedCard: CreditCard = { ...card, currentBalance: card.currentBalance + sign * effect.delta };
    const withCard = { ...data, creditCards: data.creditCards.map((c) => (c.id === card.id ? updatedCard : c)) };
    return upsertCreditCardLiability(withCard, updatedCard);
  }

  if (effect.targetKind === 'liability') {
    const existing = data.liabilities.find((l) => l.id === effect.targetId);
    if (!existing) return data;
    const updatedLiabilities = data.liabilities.map((l) =>
      l.id === existing.id ? { ...l, currentBalance: Math.max(0, l.currentBalance + sign * effect.delta) } : l
    );
    return { ...data, liabilities: updatedLiabilities };
  }

  return data;
}

// The three functions below are the entire transaction-effect orchestration,
// deliberately lifted out of the AppStateProvider component and exported as
// plain, pure (data in, data out) functions — not because the app needs them
// outside the provider, but so the invariants documented above (regression-
// protection review, Stream B1) can be exercised directly in a standalone
// test harness against the exact code the app runs, rather than a
// re-implementation that could silently drift from it. Each React callback
// below is a thin wrapper: call the pure function, then persist.

/** Creates a transaction and applies its balance effect, exactly once. */
export function applyNewTransaction(data: AppData, t: Omit<Transaction, 'id'>): AppData {
  const balanceEffect: BalanceEffectMode = t.balanceEffect ?? 'update';
  // Income always ensures a Cash asset exists first, even when balanceEffect
  // is 'none' — so a later edit back to 'update' has something to resolve
  // against. Matches ensureCashAsset's existing, income-only fabrication
  // rule; expenses never create a Cash asset.
  let workingData = data;
  if (t.type === 'income') {
    const { assets } = ensureCashAsset(workingData);
    workingData = { ...workingData, assets };
  }
  const effect = computeBalanceEffect(workingData, { ...t, balanceEffect });
  const withEffect = applyEffectDelta(workingData, effect, 1);
  const newTransaction: Transaction = { ...t, id: generateId(), balanceEffect, appliedBalanceEffect: effect };
  return { ...withEffect, transactions: [...workingData.transactions, newTransaction] };
}

/** Always reconciles — see the updateTransaction doc comment on
 * AppStateContextValue below for the full invariant this implements. */
export function applyTransactionUpdate(data: AppData, id: string, patch: Partial<Omit<Transaction, 'id'>>): AppData {
  const old = data.transactions.find((t) => t.id === id);
  if (!old) return data;
  const merged: Transaction = { ...old, ...patch };

  // Reverse whatever was actually applied before, from the stored snapshot
  // — never from old's current fields, which may have already diverged from
  // what was actually applied. Legacy transactions (balanceEffect ===
  // undefined) fall back to re-deriving from old's fields instead, the one
  // narrow, documented exception.
  let workingData: AppData =
    old.balanceEffect === undefined ? legacyApplyTransactionEffect(data, old, -1) : applyEffectDelta(data, old.appliedBalanceEffect, -1);

  const balanceEffect: BalanceEffectMode = merged.balanceEffect ?? 'update';
  if (merged.type === 'income' && balanceEffect === 'update') {
    const { assets } = ensureCashAsset(workingData);
    workingData = { ...workingData, assets };
  }
  const effect = computeBalanceEffect(workingData, { ...merged, balanceEffect });
  workingData = applyEffectDelta(workingData, effect, 1);

  const finalTransaction: Transaction = { ...merged, balanceEffect, appliedBalanceEffect: effect };
  return { ...workingData, transactions: data.transactions.map((t) => (t.id === id ? finalTransaction : t)) };
}

/** `reverseEffect` (default true) — false deliberately leaves whatever
 * balance effect the transaction last had applied in place, discarding only
 * the record itself. */
export function applyTransactionDelete(data: AppData, id: string, reverseEffect: boolean = true): AppData {
  const old = data.transactions.find((t) => t.id === id);
  if (!old || !reverseEffect) {
    return { ...data, transactions: data.transactions.filter((t) => t.id !== id) };
  }
  const reverted =
    old.balanceEffect === undefined ? legacyApplyTransactionEffect(data, old, -1) : applyEffectDelta(data, old.appliedBalanceEffect, -1);
  return { ...reverted, transactions: data.transactions.filter((t) => t.id !== id) };
}

interface AppStateContextValue {
  data: AppData;
  isLoading: boolean;
  updateUser: (patch: Partial<UserProfile>) => void;
  addRecurringItem: (item: Omit<RecurringItem, 'id'>) => void;
  updateRecurringItem: (id: string, patch: Partial<Omit<RecurringItem, 'id'>>) => void;
  deleteRecurringItem: (id: string) => void;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  /** Always reconciles: reverses whatever balance effect the transaction's
   * prior state actually had applied (via its stored appliedBalanceEffect
   * snapshot — or, only for a transaction that predates that field, by
   * re-deriving from its previous fields), then applies whatever the merged
   * fields newly resolve to, including a fresh balanceEffect if the patch
   * changes it. Reconciliation is now always correct, so there is no longer
   * a separate "skip touching balances" toggle for edits — changing
   * balanceEffect to 'none' is itself how an edit stops affecting a balance,
   * and it does so by properly reversing whatever was there rather than
   * leaving a stale effect under a since-changed funding source
   * (regression-protection review, Stream B1 §3/§5). See deleteTransaction
   * for the one remaining, deliberate "leave the balance as-is" capability. */
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, 'id'>>) => void;
  /** `reverseEffect` (default true) — false deliberately leaves whatever
   * balance effect this transaction last had applied in place, discarding
   * only the record itself, for when the user has already accounted for the
   * money elsewhere. */
  deleteTransaction: (id: string, reverseEffect?: boolean) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void;
  deleteGoal: (id: string) => void;
  addAsset: (a: Omit<Asset, 'id'>) => void;
  updateAsset: (id: string, patch: Partial<Omit<Asset, 'id'>>) => void;
  deleteAsset: (id: string) => void;
  /** `id` may be pre-supplied so a caller can immediately reference the new
   * liability's id in the same action (e.g. linking an auto-created
   * recurring bill to the loan it pays down). */
  addLiability: (l: Omit<Liability, 'id'> & { id?: string }) => void;
  updateLiability: (id: string, patch: Partial<Omit<Liability, 'id'>>) => void;
  deleteLiability: (id: string) => void;
  /** Atomically creates-or-reuses a liability and links a new recurring
   * bill to it in a single state write. Calling `addLiability` then
   * `addRecurringItem` back-to-back in the same handler silently drops the
   * liability — both close over the same pre-update `data`, so the second
   * `persist` overwrites the first (PRD bug report: "mortgage bill is
   * created but liability doesn't appear in Wealth"). Reuses an existing
   * liability of the same type instead of creating a duplicate. */
  linkBillToLiability: (
    liability: { type: LiabilityType; label: string; currentBalance: number; interestRate?: number },
    recurringItem: Omit<RecurringItem, 'id'>
  ) => void;
  /** Same atomicity concern as linkBillToLiability — creating a new
   * Property asset, the mortgage liability, and an optional recurring bill
   * all in one persist() call so none of them get silently dropped by a
   * stale-closure overwrite. Reuses an existing property/mortgage instead
   * of creating a duplicate. */
  addMortgageWithProperty: (
    liability: { label: string; currentBalance: number; interestRate?: number },
    propertyLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
    recurringItem?: Omit<RecurringItem, 'id'>
  ) => void;
  addCreditCard: (c: Omit<CreditCard, 'id'>) => void;
  updateCreditCard: (id: string, patch: Partial<Omit<CreditCard, 'id'>>) => void;
  deleteCreditCard: (id: string) => void;
  /** Same atomicity concern as linkBillToLiability — onboarding's Wealth
   * Map step used to call addAsset up to 4 times, then addLiability, then
   * updateUser, all back-to-back in one handler. Every one of those closes
   * over the same pre-update `data`, so only the very last persist() call
   * actually stuck — onboarding-entered cash/savings/investments/property
   * were silently dropped (PRD bug report: "onboarding data does not
   * appear correctly, checklist asks user to add again"). One persist()
   * call combining the user patch and every new asset/liability. */
  completeOnboarding: (userPatch: Partial<UserProfile>, assets: Omit<Asset, 'id'>[], liabilities: Omit<Liability, 'id'>[]) => void;
  transferFunds: (fromAssetId: string, to: TransferTarget, amount: number) => void;
  addSavingsComparison: (entry: Omit<SavingsComparisonEntry, 'id'>) => void;
  updateSavingsComparison: (id: string, patch: Partial<Omit<SavingsComparisonEntry, 'id'>>) => void;
  deleteSavingsComparison: (id: string) => void;
  markAchievementsSeen: (ids: string[]) => void;
  markLearningCardCompleted: (id: string) => void;
  /** Wipes all local data back to a fresh install (Settings → Reset Lulu). */
  resetAllData: () => void;
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(createEmptyAppData());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAppData().then((loaded) => {
      setData(loaded);
      setIsLoading(false);
    });
  }, []);

  const persist = useCallback((next: AppData) => {
    const withIncome = syncIncomeAggregate(next);
    const withScoreHistory = upsertLuluScoreHistory(withIncome);
    setData(withScoreHistory);
    saveAppData(withScoreHistory);
  }, []);

  const updateUser = useCallback(
    (patch: Partial<UserProfile>) => {
      persist({ ...data, user: { ...data.user, ...patch } });
    },
    [data, persist]
  );

  const addRecurringItem = useCallback(
    (item: Omit<RecurringItem, 'id'>) => {
      persist({ ...data, recurringItems: [...data.recurringItems, { ...item, id: generateId() }] });
    },
    [data, persist]
  );

  const updateRecurringItem = useCallback(
    (id: string, patch: Partial<Omit<RecurringItem, 'id'>>) => {
      persist({ ...data, recurringItems: data.recurringItems.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    },
    [data, persist]
  );

  const deleteRecurringItem = useCallback(
    (id: string) => {
      persist({ ...data, recurringItems: data.recurringItems.filter((r) => r.id !== id) });
    },
    [data, persist]
  );

  // Transactions automatically move the relevant part of the Wealth
  // picture — this is the "automatic financial model" behavior: log
  // +$5,000 income, cash goes up by $5,000; log an expense paid by credit
  // card, that card's balance (and its linked liability) goes up instead.
  // The actual logic lives in the exported, directly-testable
  // applyNewTransaction/applyTransactionUpdate/applyTransactionDelete
  // functions above — these callbacks are thin wrappers over them.
  const addTransaction = useCallback(
    (t: Omit<Transaction, 'id'>) => {
      persist(upsertNetWorthHistory(applyNewTransaction(data, t)));
    },
    [data, persist]
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Omit<Transaction, 'id'>>) => {
      persist(upsertNetWorthHistory(applyTransactionUpdate(data, id, patch)));
    },
    [data, persist]
  );

  const deleteTransaction = useCallback(
    (id: string, reverseEffect: boolean = true) => {
      persist(upsertNetWorthHistory(applyTransactionDelete(data, id, reverseEffect)));
    },
    [data, persist]
  );

  const addGoal = useCallback(
    (g: Omit<Goal, 'id'>) => {
      persist({ ...data, goals: [...data.goals, { ...g, id: generateId() }] });
    },
    [data, persist]
  );

  const updateGoal = useCallback(
    (id: string, patch: Partial<Omit<Goal, 'id'>>) => {
      persist({ ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
    },
    [data, persist]
  );

  const deleteGoal = useCallback(
    (id: string) => {
      persist({ ...data, goals: data.goals.filter((g) => g.id !== id) });
    },
    [data, persist]
  );

  const addAsset = useCallback(
    (a: Omit<Asset, 'id'>) => {
      persist(upsertNetWorthHistory({ ...data, assets: [...data.assets, { ...a, id: generateId() }] }));
    },
    [data, persist]
  );

  const updateAsset = useCallback(
    (id: string, patch: Partial<Omit<Asset, 'id'>>) => {
      persist(upsertNetWorthHistory({ ...data, assets: data.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    },
    [data, persist]
  );

  const deleteAsset = useCallback(
    (id: string) => {
      persist(upsertNetWorthHistory({ ...data, assets: data.assets.filter((a) => a.id !== id) }));
    },
    [data, persist]
  );

  const addLiability = useCallback(
    (l: Omit<Liability, 'id'> & { id?: string }) => {
      persist(upsertNetWorthHistory({ ...data, liabilities: [...data.liabilities, { ...l, id: l.id ?? generateId() }] }));
    },
    [data, persist]
  );

  const updateLiability = useCallback(
    (id: string, patch: Partial<Omit<Liability, 'id'>>) => {
      persist(
        upsertNetWorthHistory({ ...data, liabilities: data.liabilities.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
      );
    },
    [data, persist]
  );

  const deleteLiability = useCallback(
    (id: string) => {
      persist(upsertNetWorthHistory({ ...data, liabilities: data.liabilities.filter((l) => l.id !== id) }));
    },
    [data, persist]
  );

  const linkBillToLiability = useCallback(
    (
      liability: { type: LiabilityType; label: string; currentBalance: number; interestRate?: number },
      recurringItem: Omit<RecurringItem, 'id'>
    ) => {
      const existing = data.liabilities.find((l) => l.type === liability.type);
      let liabilities: Liability[];
      let linkedLiabilityId: string;
      if (existing) {
        linkedLiabilityId = existing.id;
        liabilities = data.liabilities.map((l) =>
          l.id === existing.id ? { ...l, currentBalance: liability.currentBalance, interestRate: liability.interestRate ?? l.interestRate } : l
        );
      } else {
        linkedLiabilityId = generateId();
        liabilities = [
          ...data.liabilities,
          {
            id: linkedLiabilityId,
            type: liability.type,
            label: liability.label,
            currentBalance: liability.currentBalance,
            interestRate: liability.interestRate,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      const recurringItems = [...data.recurringItems, { ...recurringItem, id: generateId(), linkedLiabilityId }];
      persist(upsertNetWorthHistory({ ...data, liabilities, recurringItems }));
    },
    [data, persist]
  );

  const addMortgageWithProperty = useCallback(
    (
      liability: { label: string; currentBalance: number; interestRate?: number },
      propertyLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
      recurringItem?: Omit<RecurringItem, 'id'>
    ) => {
      let assets = data.assets;
      let linkedPropertyAssetId: string | undefined;
      if (propertyLink.mode === 'existing') {
        linkedPropertyAssetId = propertyLink.assetId;
      } else if (propertyLink.mode === 'new') {
        const newPropertyId = generateId();
        assets = [...assets, { id: newPropertyId, type: 'property', label: propertyLink.label, currentValue: propertyLink.value }];
        linkedPropertyAssetId = newPropertyId;
      }

      const existing = data.liabilities.find((l) => l.type === 'mortgage');
      let liabilities: Liability[];
      let linkedLiabilityId: string;
      if (existing) {
        linkedLiabilityId = existing.id;
        liabilities = data.liabilities.map((l) =>
          l.id === existing.id
            ? {
                ...l,
                currentBalance: liability.currentBalance,
                interestRate: liability.interestRate ?? l.interestRate,
                linkedPropertyAssetId: linkedPropertyAssetId ?? l.linkedPropertyAssetId,
              }
            : l
        );
      } else {
        linkedLiabilityId = generateId();
        liabilities = [
          ...data.liabilities,
          {
            id: linkedLiabilityId,
            type: 'mortgage',
            label: liability.label,
            currentBalance: liability.currentBalance,
            interestRate: liability.interestRate,
            createdAt: new Date().toISOString(),
            linkedPropertyAssetId,
          },
        ];
      }

      const recurringItems = recurringItem ? [...data.recurringItems, { ...recurringItem, id: generateId(), linkedLiabilityId }] : data.recurringItems;
      persist(upsertNetWorthHistory({ ...data, assets, liabilities, recurringItems }));
    },
    [data, persist]
  );

  const completeOnboarding = useCallback(
    (userPatch: Partial<UserProfile>, assets: Omit<Asset, 'id'>[], liabilities: Omit<Liability, 'id'>[]) => {
      persist(
        upsertNetWorthHistory({
          ...data,
          user: { ...data.user, ...userPatch },
          assets: [...data.assets, ...assets.map((a) => ({ ...a, id: generateId() }))],
          liabilities: [...data.liabilities, ...liabilities.map((l) => ({ ...l, id: generateId() }))],
        })
      );
    },
    [data, persist]
  );

  const addCreditCard = useCallback(
    (c: Omit<CreditCard, 'id'>) => {
      const newCard: CreditCard = { ...c, id: generateId() };
      persist(upsertCreditCardLiability({ ...data, creditCards: [...data.creditCards, newCard] }, newCard));
    },
    [data, persist]
  );

  const updateCreditCard = useCallback(
    (id: string, patch: Partial<Omit<CreditCard, 'id'>>) => {
      const updatedCard = { ...data.creditCards.find((c) => c.id === id), ...patch } as CreditCard;
      const withCard = { ...data, creditCards: data.creditCards.map((c) => (c.id === id ? updatedCard : c)) };
      persist(upsertCreditCardLiability(withCard, updatedCard));
    },
    [data, persist]
  );

  const deleteCreditCard = useCallback(
    (id: string) => {
      const withoutCard = { ...data, creditCards: data.creditCards.filter((c) => c.id !== id) };
      persist(removeCreditCardLiability(withoutCard, id));
    },
    [data, persist]
  );

  // Moves money between two places the user already owns — buying
  // investments with cash, or paying down a liability with cash. Both
  // sides update atomically so net worth only changes by what actually
  // changed (paying debt) or stays flat (an internal transfer).
  const transferFunds = useCallback(
    (fromAssetId: string, to: TransferTarget, amount: number) => {
      let assets = data.assets.map((a) => (a.id === fromAssetId ? { ...a, currentValue: a.currentValue - amount } : a));
      let liabilities = data.liabilities;
      if (to.kind === 'asset') {
        assets = assets.map((a) => (a.id === to.assetId ? { ...a, currentValue: a.currentValue + amount } : a));
      } else {
        liabilities = liabilities.map((l) =>
          l.id === to.liabilityId ? { ...l, currentBalance: Math.max(0, l.currentBalance - amount) } : l
        );
      }
      persist(upsertNetWorthHistory({ ...data, assets, liabilities }));
    },
    [data, persist]
  );

  const addSavingsComparison = useCallback(
    (entry: Omit<SavingsComparisonEntry, 'id'>) => {
      persist({ ...data, savingsComparisons: [...data.savingsComparisons, { ...entry, id: generateId() }] });
    },
    [data, persist]
  );

  const updateSavingsComparison = useCallback(
    (id: string, patch: Partial<Omit<SavingsComparisonEntry, 'id'>>) => {
      persist({ ...data, savingsComparisons: data.savingsComparisons.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    },
    [data, persist]
  );

  const deleteSavingsComparison = useCallback(
    (id: string) => {
      persist({ ...data, savingsComparisons: data.savingsComparisons.filter((s) => s.id !== id) });
    },
    [data, persist]
  );

  const markAchievementsSeen = useCallback(
    (ids: string[]) => {
      const merged = Array.from(new Set([...data.seenAchievementIds, ...ids]));
      persist({ ...data, seenAchievementIds: merged });
    },
    [data, persist]
  );

  // Real, derived-from-actual-usage progress for Discover's Learning Paths
  // ("2/8 lessons completed") — never a fabricated percentage.
  const markLearningCardCompleted = useCallback(
    (id: string) => {
      if (data.completedLearningCardIds.includes(id)) return;
      persist({ ...data, completedLearningCardIds: [...data.completedLearningCardIds, id] });
    },
    [data, persist]
  );

  // "Reset Lulu" (Settings) — wipes everything back to a fresh install,
  // including `hasSeenIntro`, so the user genuinely starts the Lulu
  // journey again rather than landing on an empty-but-onboarded app.
  const resetAllData = useCallback(() => {
    const fresh = createEmptyAppData();
    setData(fresh);
    saveAppData(fresh);
  }, []);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      updateUser,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addGoal,
      updateGoal,
      deleteGoal,
      addAsset,
      updateAsset,
      deleteAsset,
      addLiability,
      updateLiability,
      deleteLiability,
      linkBillToLiability,
      addMortgageWithProperty,
      completeOnboarding,
      addCreditCard,
      updateCreditCard,
      deleteCreditCard,
      transferFunds,
      addSavingsComparison,
      updateSavingsComparison,
      deleteSavingsComparison,
      markAchievementsSeen,
      markLearningCardCompleted,
      resetAllData,
    }),
    [
      data,
      isLoading,
      updateUser,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addGoal,
      updateGoal,
      deleteGoal,
      addAsset,
      updateAsset,
      deleteAsset,
      addLiability,
      updateLiability,
      deleteLiability,
      linkBillToLiability,
      addMortgageWithProperty,
      completeOnboarding,
      addCreditCard,
      updateCreditCard,
      deleteCreditCard,
      transferFunds,
      addSavingsComparison,
      updateSavingsComparison,
      deleteSavingsComparison,
      markAchievementsSeen,
      markLearningCardCompleted,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
