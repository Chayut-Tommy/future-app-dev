import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  AppData,
  AppliedBalanceEffect,
  Asset,
  BalanceEffectMode,
  CreditCard,
  Goal,
  Liability,
  LiabilityType,
  PayFrequency,
  PaymentSource,
  RecurringItem,
  SavingsComparisonEntry,
  Transaction,
  UserProfile,
} from '../types/models';
import { createEmptyAppData, loadAppData, saveAppData } from '../lib/storage';
import { generateId } from '../lib/id';
import { computeLuluScore } from '../lib/calculations/luluScore';
import { computeTotalMonthlyIncome, findPrimaryIncomeItem } from '../lib/calculations/incomeEngine';
import { resolveValidAnchorDay, usesScheduleAnchor } from '../lib/calculations/recurringSchedule';
import { advanceRecurringItemSchedule } from '../lib/calculations/reminders';
import { moneyAmountToCents } from '../lib/calculations/money';
import {
  initialPersistenceState,
  issueWrite,
  settleWrite,
  canIssueReset,
  canRetry,
  retryWriteKind,
  PersistenceState,
  WriteKind,
} from '../lib/persistenceState';

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
  t: {
    type: 'income' | 'expense';
    amount: number;
    paymentSource?: Transaction['paymentSource'];
    creditCardId?: string;
    liabilityId?: string;
    targetAssetId?: string;
    balanceEffect: BalanceEffectMode;
  }
): AppliedBalanceEffect | undefined {
  if (t.balanceEffect === 'none') return undefined;

  if (t.type === 'income') {
    // B2.4 — targetAssetId lets a caller credit a SPECIFIC asset (e.g. a
    // Savings account the user explicitly picked for a backfilled mid-cycle
    // income occurrence) instead of the default Cash asset. Absent — every
    // existing caller, unchanged — falls back to the original Cash-only
    // lookup exactly as before; fully backward compatible.
    const targetAsset = t.targetAssetId ? data.assets.find((a) => a.id === t.targetAssetId) : data.assets.find((a) => a.type === 'cash');
    if (!targetAsset) return undefined;
    return { targetKind: 'asset', targetId: targetAsset.id, delta: t.amount };
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

/** Resolves what scheduleAnchorDay a recurring item should have after being
 * created (`existing: null`) or patched (`existing`: the item as it is
 * before this patch) — the single source of truth for whether an edit
 * should preserve, replace, or freshly derive the stored monthly/irregular
 * anchor day (regression-protection review, B2.0A). Exported and pure, same
 * pattern as applyNewTransaction below, so the anchor-preservation
 * invariants can be tested directly against the exact code the app runs.
 *
 * Explicit contract (B2.0A follow-up §3 — no calendar-shape heuristics):
 *  A. Ordinary full-form resubmission — patch.nextDueDate is exactly equal to
 *     the currently stored nextDueDate (both modals always resend the full
 *     form, whether or not the user touched the date field): preserve the
 *     existing anchor.
 *  B. Intentional user date edit — patch.nextDueDate differs from the stored
 *     date, and the caller did not pass its own scheduleAnchorDay: the new
 *     day-of-month becomes the new anchor, even if it happens to be the
 *     final day of a shorter month. There is no way to distinguish "the user
 *     picked this day on purpose" from "this looks like a clamp" using the
 *     date alone, so this resolver no longer tries to — see rule C.
 *  C. Internal automatic advancement — the caller (e.g.
 *     advanceRecurringItemSchedule's result) passes its own
 *     scheduleAnchorDay explicitly in the patch: that value always wins,
 *     regardless of what day-of-month the advanced date landed on. This is
 *     how automatic advancement is kept out of rule B's "new day = new
 *     anchor" path — the caller states its intent instead of the resolver
 *     inferring it. A frequency that doesn't use an anchor (weekly/
 *     fortnightly) leaves whatever anchor is already stored untouched
 *     (dormant, not read by anything). Entering monthly/irregular from a
 *     different frequency always derives a fresh anchor from the
 *     now-effective nextDueDate, never reusing a stale anchor from the last
 *     time this item was monthly. Every anchor value this function reads
 *     back off `existing` is validated via resolveValidAnchorDay first, so a
 *     corrupt/out-of-range stored value can never propagate forward. */
export function resolveScheduleAnchorDay(
  existing: Pick<RecurringItem, 'frequency' | 'nextDueDate' | 'scheduleAnchorDay'> | null,
  patch: { frequency?: PayFrequency; nextDueDate?: string; scheduleAnchorDay?: number }
): number | undefined {
  const newFrequency = patch.frequency ?? existing?.frequency;
  if (!newFrequency || !usesScheduleAnchor(newFrequency)) return existing?.scheduleAnchorDay;

  // Rule C — an explicitly passed anchor always wins, validated.
  if (patch.scheduleAnchorDay !== undefined) {
    const fallbackDate = patch.nextDueDate ?? existing?.nextDueDate;
    return fallbackDate ? resolveValidAnchorDay(patch.scheduleAnchorDay, fallbackDate) : undefined;
  }

  if (!existing) {
    return patch.nextDueDate ? new Date(patch.nextDueDate).getDate() : undefined;
  }

  const frequencyBecameAnchored = !usesScheduleAnchor(existing.frequency) && usesScheduleAnchor(newFrequency);
  if (frequencyBecameAnchored) {
    const effectiveNextDueDate = patch.nextDueDate ?? existing.nextDueDate;
    return new Date(effectiveNextDueDate).getDate();
  }

  const existingAnchor = resolveValidAnchorDay(existing.scheduleAnchorDay, existing.nextDueDate);
  if (patch.nextDueDate === undefined) return existingAnchor;

  // Rule A — exact resubmission of the same date preserves the anchor.
  if (patch.nextDueDate === existing.nextDueDate) return existingAnchor;

  // Rule B — any other date change is a genuine, intentional edit.
  return new Date(patch.nextDueDate).getDate();
}

// The three functions below are the entire transaction-effect orchestration,
// deliberately lifted out of the AppStateProvider component and exported as
// plain, pure (data in, data out) functions — not because the app needs them
// outside the provider, but so the invariants documented above (regression-
// protection review, Stream B1) can be exercised directly in a standalone
// test harness against the exact code the app runs, rather than a
// re-implementation that could silently drift from it. Each React callback
// below is a thin wrapper: call the pure function, then persist.

/** Creates a transaction and applies its balance effect, exactly once.
 * `transactionId` defaults to a freshly generated id, exactly as before —
 * every existing caller that omits it keeps its current behaviour
 * unchanged. A caller that has already generated its own id ahead of time
 * (confirmRecurringOccurrenceTransition below, which needs the id fixed
 * before this call so it can look up the exact transaction just appended)
 * may supply it instead. This function remains the SOLE owner of
 * ensureCashAsset / computeBalanceEffect / applyEffectDelta / Transaction
 * construction / appliedBalanceEffect — nothing else in this file
 * re-implements this pipeline (regression-protection review, B2.0B
 * correction §1). */
export function applyNewTransaction(data: AppData, t: Omit<Transaction, 'id'>, transactionId: string = generateId()): AppData {
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
  const newTransaction: Transaction = { ...t, id: transactionId, balanceEffect, appliedBalanceEffect: effect };
  return { ...withEffect, transactions: [...workingData.transactions, newTransaction] };
}

export type ConfirmRecurringOccurrenceResult =
  | { applied: true; data: AppData }
  | {
      applied: false;
      reason: 'not_found' | 'stale' | 'invalid_date' | 'invalid_amount' | 'invalid_input' | 'invalid_source' | 'balance_target_missing';
    };

/** B2.0C — the context action's return shape, separate from the pure
 * transition's result above. `persistence` is the exact Promise the
 * confirmation's own write produced (via `persist`), so a caller can know
 * precisely when ITS OWN confirmation lands on disk without re-running
 * confirmRecurringOccurrenceTransition or inferring durability from the
 * coarse app-wide persistence status. Pre-resolved when the transition
 * itself did not apply (nothing was written). Never used by
 * SmartReminderCard's own UI today (see its caller for why: the confirmed
 * occurrence's reminder is already gone from view the instant the schedule
 * advances in memory, independent of persistence timing) — the type exists
 * so any caller, now or later, can await its own write's durability. */
export type ConfirmationCommitResult = {
  transition: ConfirmRecurringOccurrenceResult;
  persistence: Promise<void>;
};

/** Days in `month` (1-12) of `year`, via Date.UTC so it never depends on the
 * runtime's local offset — used only to bound-check a literal day-of-month
 * digit before trusting it, never to construct the date being validated
 * (regression-protection review, B2.0B correction §3). */
function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const CANONICAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** Strict validity check for Navilo's canonical recurring-schedule date
 * format — a full ISO datetime string from Date.prototype.toISOString(),
 * which is what RecurringItem.nextDueDate is always set to (see
 * AddRecurringItemModal.tsx/AddIncomeModal.tsx, both call a real
 * DateTimePicker selection's .toISOString()).
 *
 * `!Number.isNaN(new Date(x).getTime())` is NOT sufficient here: JS's Date
 * constructor does not reject an impossible calendar date such as
 * "2026-02-30" — it silently rolls it forward into the next month
 * ("2026-03-02"), and does so even with a full "...T00:00:00.000Z" suffix
 * (confirmed empirically this round). This function instead bound-checks
 * the literal year/month/day digits from the string itself — before they
 * are ever handed to the Date constructor — so an impossible date is
 * rejected outright rather than silently renormalized. It never
 * reinterprets the string through a different UTC/local frame to decide
 * validity, so it cannot itself introduce a local-day shift
 * (regression-protection review, B2.0B correction §3). */
function isValidCanonicalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CANONICAL_DATE_RE.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInCalendarMonth(year, month)) return false;
  if (h !== undefined && (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/** Looser check for the generated transaction timestamp only — a technical
 * bookkeeping value (always `new Date().toISOString()` from the calling
 * context action, never user-picked), not a calendar date the user chose,
 * so it only needs to be a genuine parseable instant. Never read back as a
 * calendar day for schedule purposes (regression-protection review, B2.0B
 * correction §3 — "do not reinterpret it as the scheduled local date"). */
function isValidISOTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

/** The entire B2.0B combined transition: confirming that a recurring
 * income/bill occurrence happened, as one atomic AppData result — the same
 * transaction/balance-effect pipeline addTransaction uses (via
 * applyNewTransaction itself, not a re-implementation of it),
 * upsertNetWorthHistory, and the recurring item's schedule advancement, all
 * in one committed state (regression-protection review, B2.0B correction).
 * Exported and pure, same testability pattern as applyNewTransaction above.
 *
 * Every source-owned fact — type, amount, label-derived category, schedule
 * — is read from `data`'s LATEST matching recurring item, never trusted
 * from the caller. The caller supplies only recurringItemId (which
 * occurrence), expectedNextDueDate (the staleness check), and
 * paymentSource (the one genuine confirmation-time choice that cannot be
 * derived from the source — bills only). `transactionId` and `date` are
 * generated once by the calling context action (never inside this pure
 * function, and never by the component), so this function stays fully
 * deterministic and directly testable.
 *
 * Calls applyNewTransaction exactly once, passing its own pre-generated
 * transactionId so the transaction it appends can be located
 * deterministically afterward. applyNewTransaction remains the SOLE owner
 * of ensureCashAsset / computeBalanceEffect / applyEffectDelta / Transaction
 * construction / appliedBalanceEffect — this function no longer
 * re-orchestrates that pipeline independently, so the ordinary transaction
 * path and this recurring-confirmation path can never diverge (regression-
 * protection review, B2.0B correction §1). A defensive assertion
 * immediately after that call catches the case where a requested 'update'
 * balanceEffect could not actually be resolved (missing target) — the
 * prevalidation below should make this unreachable, but it must never
 * silently proceed if it somehow is, and on failure discards
 * applyNewTransaction's result in full rather than partially retaining it
 * (regression-protection review, B2.0B correction §2). upsertNetWorthHistory
 * is applied on the result, matching addTransaction's existing composition
 * exactly — never omitted.
 *
 * Validates before mutating anything; every rejected path returns the
 * original `data` object unchanged by reference, with no transaction, no
 * balance effect, no schedule advancement, and no scheduleAnchorDay
 * change. */
export function confirmRecurringOccurrenceTransition(
  data: AppData,
  input: {
    recurringItemId: string;
    expectedNextDueDate: string;
    paymentSource?: PaymentSource;
    transactionId: string;
    date: string;
  }
): ConfirmRecurringOccurrenceResult {
  const item = data.recurringItems.find((r) => r.id === input.recurringItemId);
  if (!item) return { applied: false, reason: 'not_found' };

  if (!isValidCanonicalDate(item.nextDueDate) || !isValidCanonicalDate(input.expectedNextDueDate)) {
    return { applied: false, reason: 'invalid_date' };
  }
  if (item.nextDueDate !== input.expectedNextDueDate) return { applied: false, reason: 'stale' };

  if (!isValidISOTimestamp(input.date)) return { applied: false, reason: 'invalid_date' };

  // Defensive — TypeScript already constrains RecurringItem.type, but this
  // function must never trust unmodelled/corrupt data over its own checks.
  if (item.type !== 'income' && item.type !== 'expense') return { applied: false, reason: 'invalid_input' };
  // Boundary safeguard for legacy or otherwise malformed data — NOT a
  // storage migration. A stored amount that fails this (e.g. a pre-existing
  // 120.1234 saved before the strict form-level contract existed) is
  // rejected outright rather than silently rounded; the source itself is
  // never rewritten here (regression-protection review, B2.0B recurring-
  // money precision correction §4/§5). The validated integer-cent amount is
  // what the transaction/balance-effect path below actually uses, never the
  // raw item.amount float.
  const validatedAmount = moneyAmountToCents(item.amount);
  if (!validatedAmount.valid) return { applied: false, reason: 'invalid_amount' };

  if (item.type === 'income' && input.paymentSource !== undefined) return { applied: false, reason: 'invalid_input' };
  if (item.type === 'expense' && input.paymentSource !== 'cash' && input.paymentSource !== 'credit_card') {
    return { applied: false, reason: 'invalid_source' };
  }

  let creditCardId: string | undefined;
  if (item.type === 'expense' && input.paymentSource === 'cash' && !data.assets.some((a) => a.type === 'cash')) {
    return { applied: false, reason: 'balance_target_missing' };
  }
  if (item.type === 'expense' && input.paymentSource === 'credit_card') {
    creditCardId = data.creditCards[0]?.id;
    if (!creditCardId) return { applied: false, reason: 'balance_target_missing' };
  }

  const advance = advanceRecurringItemSchedule(item);
  if (!isValidCanonicalDate(advance.nextDueDate)) return { applied: false, reason: 'invalid_date' };
  // Forward-only — an advancement that lands on or before the current
  // nextDueDate is a defect in the schedule math, not a legitimate result;
  // never advance backward or in place (regression-protection review,
  // B2.0B correction §3).
  if (new Date(advance.nextDueDate).getTime() <= new Date(item.nextDueDate).getTime()) {
    return { applied: false, reason: 'invalid_date' };
  }

  // --- success path only from here; nothing above this line ever mutates,
  // and no rejection above ever calls applyNewTransaction. ---
  const categoryId =
    item.type === 'income'
      ? data.categories.find((c) => c.type === 'income' && c.name.toLowerCase() === item.label.toLowerCase())?.id ?? 'cat-other-income'
      : 'cat-other-expense';

  const transactionInput: Omit<Transaction, 'id'> = {
    type: item.type,
    amount: validatedAmount.cents / 100,
    categoryId,
    date: input.date,
    // An immutable snapshot of the source's label AT CONFIRMATION TIME —
    // the transaction's primary display identity (e.g. "Internet test"),
    // kept entirely separate from categoryId (still real spending-category
    // analytics, e.g. "Other"). Never rewritten afterward: renaming or
    // deleting the RecurringItem later has no effect on this already-
    // created Transaction, since nothing re-reads item.label once this
    // transaction exists (regression-protection review, B2.0B transaction-
    // identity correction §1). Reuses the existing, previously-unused
    // Transaction.note field — no model or storage change.
    note: item.label,
    paymentSource: input.paymentSource,
    creditCardId,
    recurringItemId: item.id,
    balanceEffect: 'update',
  };

  const withTransaction = applyNewTransaction(data, transactionInput, input.transactionId);

  const appended = withTransaction.transactions.find((t) => t.id === input.transactionId);
  if (!appended || appended.appliedBalanceEffect === undefined) {
    // applyNewTransaction's result is discarded here in full — data (the
    // original, untouched input) is what gets returned, never a partial
    // mix of the two.
    return { applied: false, reason: 'balance_target_missing' };
  }

  const withHistory = upsertNetWorthHistory(withTransaction);

  const scheduleAnchorDay = resolveScheduleAnchorDay(item, advance);
  const updatedItem: RecurringItem = { ...item, nextDueDate: advance.nextDueDate, scheduleAnchorDay };

  const finalData: AppData = {
    ...withHistory,
    recurringItems: withHistory.recurringItems.map((r) => (r.id === item.id ? updatedItem : r)),
  };

  return { applied: true, data: finalData };
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

/** B2.4 mid-cycle recurring-income initialisation — the choice a user makes
 * about a newly-created monthly income source's immediately preceding
 * expected occurrence. Only these two variants ever construct a
 * transaction; declining ("no, my first payment is later") or being unsure
 * both go through the ordinary, completely unmodified addRecurringItem
 * path instead — see AddIncomeModal.tsx, which never calls
 * createRecurringIncomeWithMidCycleOccurrence for those two answers. */
export type MidCycleIncomeOccurrenceChoice =
  | { kind: 'already_included' }
  | { kind: 'add_to_balance'; targetAssetId?: string };

/** B2.4 correction — duplicate identity for a mid-cycle backfilled income
 * occurrence is the exact (recurringItemId, calendar day) pair, never
 * label/amount/date alone or in combination. Navilo supports multiple
 * legitimate income sources that can share a label, a payment date, an
 * amount, or all three — and a manual (non-recurring) income transaction
 * can independently share a label and date too — so none of those alone
 * ever identifies "the same source occurrence" (regression-protection
 * review, B2.4 duplicate-identity correction; the prior label+day rule this
 * replaces could wrongly suppress a second, genuinely distinct source). A
 * transaction only counts as this exact occurrence if its own
 * `recurringItemId` equals the one being checked. */
export function hasRecurringItemOccurrenceRecorded(data: AppData, recurringItemId: string, occurrenceDateISO: string): boolean {
  const target = new Date(occurrenceDateISO);
  return data.transactions.some((t) => {
    if (t.recurringItemId !== recurringItemId) return false;
    const d = new Date(t.date);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
  });
}

/** B2.4 — creates a new recurring income source together with exactly one
 * backfilled transaction for its immediately preceding expected occurrence,
 * as one atomic AppData result. Only ever invoked for the two
 * MidCycleIncomeOccurrenceChoice variants that actually record a
 * transaction.
 *
 * `recurringItemId` is generated exactly once by the caller
 * (AddIncomeModal, outside any React state updater) the moment it decides
 * to show the mid-cycle prompt — before either option can be tapped — and
 * is reused for every subsequent call this same prompt session might
 * produce; it is never generated inside this function or inside the
 * confirmRecurringOccurrenceTransition-style context-action wrapper around
 * it (regression-protection review, B2.4 duplicate-identity correction).
 * That stability is exactly what makes the defensive guard below
 * meaningful: a rapid double-tap that somehow gets past the UI's
 * isSubmitting guard presents the SAME recurringItemId both times (a fresh
 * transactionId each time doesn't matter — the check below never looks at
 * it), so the second call is recognised as a no-op rather than a second,
 * differently-identified source. `transactionId` is generated once per
 * call by the calling context action, matching
 * confirmRecurringOccurrenceTransition's existing convention.
 * `precedingOccurrenceDate` is likewise computed once by the caller from
 * the shared, unmodified recurringSchedule.ts anchor/clamping logic
 * (precedingOccurrence) — this function never recomputes it, so the date
 * shown to the user before they chose an option and the date actually
 * recorded can never disagree.
 *
 * The recurring item's own nextDueDate is stored exactly as entered — this
 * function never advances or otherwise touches the future schedule; the
 * backfilled transaction is a separate, independent record dated in the
 * past (B2.4: "Keep the entered next-payment date unchanged" / "Do not
 * advance the future recurring schedule when recording the preceding
 * occurrence").
 *
 * Reuses applyNewTransaction exactly once — its SOLE owner of
 * ensureCashAsset/computeBalanceEffect/applyEffectDelta/Transaction
 * construction/appliedBalanceEffect (regression-protection review, B2.0B
 * correction §1, preserved here, never re-implemented). "already_included"
 * passes balanceEffect: 'none' — the existing, already-safe-to-reverse
 * mechanism (see BalanceEffectMode/AppliedBalanceEffect doc comments in
 * models.ts): appliedBalanceEffect ends up undefined, so any later edit or
 * delete of this transaction reverses nothing, ever — no new field was
 * needed for that case. "add_to_balance" passes balanceEffect: 'update' and
 * an optional targetAssetId, crediting exactly the one asset the user
 * selected (or the default Cash asset when omitted), once. */
export function createRecurringIncomeWithMidCycleOccurrence(
  data: AppData,
  itemInput: Omit<RecurringItem, 'id'>,
  recurringItemId: string,
  choice: MidCycleIncomeOccurrenceChoice,
  precedingOccurrenceDate: string,
  transactionId: string
): AppData {
  // Defensive duplicate guard — see hasRecurringItemOccurrenceRecorded's
  // doc comment. A full no-op: neither the recurring item nor the
  // transaction is touched a second time, since the first call already
  // committed both under this exact recurringItemId (regression-protection
  // review, B2.4 duplicate-identity correction — "preserve the one-
  // transition/one-persistence-write behaviour").
  if (hasRecurringItemOccurrenceRecorded(data, recurringItemId, precedingOccurrenceDate)) {
    return data;
  }

  const newItem: RecurringItem = { ...itemInput, id: recurringItemId };
  const withItem: AppData = { ...data, recurringItems: [...data.recurringItems, newItem] };

  const categoryId =
    data.categories.find((c) => c.type === 'income' && c.name.toLowerCase() === newItem.label.toLowerCase())?.id ?? 'cat-other-income';

  const transactionInput: Omit<Transaction, 'id'> = {
    type: 'income',
    amount: newItem.amount,
    categoryId,
    date: precedingOccurrenceDate,
    note: newItem.label,
    recurringItemId,
    balanceEffect: choice.kind === 'already_included' ? 'none' : 'update',
    targetAssetId: choice.kind === 'add_to_balance' ? choice.targetAssetId : undefined,
  };

  const withTransaction = applyNewTransaction(withItem, transactionInput, transactionId);
  return upsertNetWorthHistory(withTransaction);
}

/** Shared one-repayment-per-liability rule (Stream C correction, Issue 2):
 * a liability may have at most one active recurring repayment definition
 * representing its scheduled contractual repayment. A repeat submission
 * updates that definition in place — same id, unrelated bills untouched —
 * never appended as a second active repayment representing the same
 * commitment. Recorded historical Transactions are a completely separate
 * concept from this RecurringItem definition and are never touched here;
 * `undefined` (e.g. "I'll add this later") leaves any already-scheduled
 * definition exactly as it was, never deletes it. `newRecurringItemId` is
 * only used when no existing definition is found for this liability —
 * supplied by the caller, never generated internally here (mirrors
 * createCarLoanWithVehicleTransition's id-generation discipline below).
 * Used identically by Car Loan (createCarLoanWithVehicleTransition),
 * Personal Loan (linkBillToLiability), and Mortgage
 * (addMortgageWithProperty) — the one small shared helper, not three
 * independently-drifting copies of the same rule.
 *
 * Round-5 correction: previously picked the FIRST array match when more
 * than one recurring item already carried this exact linkedLiabilityId —
 * an array-order choice with no financial meaning, capable of silently
 * updating the wrong repayment record. Now: zero matches creates a new
 * item; exactly one match updates that exact id; more than one match is
 * refused outright (`ok: false`) — nothing is read, deleted, merged or
 * chosen by position. The caller must surface this to the user rather
 * than resolve it automatically. */
export type UpsertLinkedRecurringItemResult =
  | { ok: true; recurringItems: RecurringItem[] }
  | { ok: false; reason: 'duplicate_linked_repayment' };

export function upsertLinkedRecurringItem(
  recurringItems: RecurringItem[],
  linkedLiabilityId: string,
  recurringItem: Omit<RecurringItem, 'id'> | undefined,
  newRecurringItemId: string
): UpsertLinkedRecurringItemResult {
  if (!recurringItem) return { ok: true, recurringItems };
  const matches = recurringItems.filter((r) => r.linkedLiabilityId === linkedLiabilityId);
  if (matches.length > 1) return { ok: false, reason: 'duplicate_linked_repayment' };
  const existing = matches[0];
  const next = existing
    ? recurringItems.map((r) => (r.id === existing.id ? { ...r, ...recurringItem, linkedLiabilityId } : r))
    : [...recurringItems, { ...recurringItem, id: newRecurringItemId, linkedLiabilityId }];
  return { ok: true, recurringItems: next };
}

/** Round-5 correction (Issue 4, rename propagation) — when a liability is
 * renamed and no full repayment definition is being resubmitted this call
 * (i.e. `recurringItem` was undefined so `upsertLinkedRecurringItem` never
 * ran), the linked repayment's display name still needs to track the new
 * liability name. Applies the SAME "never choose by array order" rule as
 * upsertLinkedRecurringItem: renames only when EXACTLY one recurring item
 * carries this exact linkedLiabilityId; zero matches is a no-op; more than
 * one match is also a no-op (skipped, not blocked — renaming the liability
 * itself is always safe and must not be held hostage by an unrelated
 * repayment-identity ambiguity that Issue 1's duplicate check already
 * surfaces on its own save path). The current data model has no field
 * distinguishing a manually-customised repayment name from an
 * automatically-generated one, so this applies uniformly — see the Round-5
 * report for why no such field was added. */
export function renameLinkedRepaymentIfUnambiguous(recurringItems: RecurringItem[], linkedLiabilityId: string, newLiabilityLabel: string): RecurringItem[] {
  const matches = recurringItems.filter((r) => r.linkedLiabilityId === linkedLiabilityId);
  if (matches.length !== 1) return recurringItems;
  return recurringItems.map((r) => (r.id === matches[0].id ? { ...r, label: `${newLiabilityLabel} repayment` } : r));
}

/** Stream C — liability type is a CLASSIFICATION, never an identity
 * (regression-protection review: the withdrawn one-liability-per-type MVP
 * limitation used to resolve "the liability to write to" via
 * `liabilities.find(l => l.type === X)`, which silently overwrote a
 * genuinely different liability of the same type — e.g. adding "Mazda
 * Finance" would find and overwrite "Toyota Finance"). Every liability-
 * creating/updating transition below instead takes an explicit `target`:
 * `{ mode: 'create'; liabilityId }` always makes a new record at that
 * (caller-supplied) id; `{ mode: 'update'; liabilityId }` must match an
 * EXISTING liability of the exact expected type — if it doesn't exist, or
 * exists as a different type, the transition fails safely (`applied:
 * false`) and mutates nothing; it never falls back to finding some other
 * record by type. */
export type LiabilityTransitionTarget = { mode: 'create'; liabilityId: string } | { mode: 'update'; liabilityId: string };
/** Round-5 addition: `duplicate_linked_repayment` — the update target has
 * more than one recurring item sharing its exact linkedLiabilityId (see
 * upsertLinkedRecurringItem's doc comment). Nothing is mutated; the caller
 * must surface this and let the user resolve the ambiguity themselves. */
export type LiabilityTransitionResult =
  | { applied: true; data: AppData }
  | { applied: false; reason: 'target_not_found' | 'target_wrong_type' | 'duplicate_linked_repayment' };

/** Stream C — the atomic vehicle+car-loan+bill transition, extracted as its
 * own pure, exported, directly-testable function (regression-protection
 * review: this mirrors addMortgageWithProperty's shape, but that action has
 * never itself been split out this way — done here specifically so the
 * production transition can be imported and executed directly in tests,
 * rather than only reachable through the useCallback closure).
 *
 * Every candidate id (`target.liabilityId` for a create, plus
 * `ids.newVehicleAssetId`/`newRecurringItemId`) is supplied by the caller,
 * generated exactly once — never internally via generateId() — so this
 * function is fully deterministic: whether a candidate id actually gets
 * used, versus an existing entity being reused instead, is decided here,
 * but the id VALUES themselves never vary across calls with the same
 * input. This is what lets the caller (AddWealthItemModal's handleSave)
 * generate every id up front, before its own synchronous submission guard
 * is set — a rapid repeated tap is blocked by that guard before this
 * function is ever invoked a second time for one submission.
 *
 * Dedup rules: the car_loan liability is resolved by the caller's explicit
 * `target`, never by type (see LiabilityTransitionTarget's doc comment).
 * The repayment bill is SEPARATELY reused by `linkedLiabilityId` — a
 * repeated visit to the loan flow for an already-linked liability updates
 * the existing bill's terms in place rather than appending a second
 * recurring item representing the same commitment (the same
 * dedup-by-linkedLiabilityId rule is applied identically to
 * addMortgageWithProperty and linkBillToLiability via the one shared
 * upsertLinkedRecurringItem helper). A car-loan liability with no bill in
 * `recurringItem` (e.g. "I'll add this later") leaves any already-
 * scheduled bill untouched — it is never deleted here. */
export function createCarLoanWithVehicleTransition(
  data: AppData,
  liability: { label: string; currentBalance: number; interestRate?: number },
  vehicleLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
  recurringItem: Omit<RecurringItem, 'id'> | undefined,
  target: LiabilityTransitionTarget,
  ids: { newVehicleAssetId: string; newRecurringItemId: string }
): LiabilityTransitionResult {
  if (target.mode === 'update') {
    const existing = data.liabilities.find((l) => l.id === target.liabilityId);
    if (!existing) return { applied: false, reason: 'target_not_found' };
    if (existing.type !== 'car_loan') return { applied: false, reason: 'target_wrong_type' };
  }

  let assets = data.assets;
  let linkedVehicleAssetId: string | undefined;
  if (vehicleLink.mode === 'existing') {
    linkedVehicleAssetId = vehicleLink.assetId;
  } else if (vehicleLink.mode === 'new') {
    assets = [...assets, { id: ids.newVehicleAssetId, type: 'car', label: vehicleLink.label, currentValue: vehicleLink.value }];
    linkedVehicleAssetId = ids.newVehicleAssetId;
  }

  const linkedLiabilityId = target.liabilityId;
  let liabilities: Liability[];
  if (target.mode === 'update') {
    liabilities = data.liabilities.map((l) =>
      l.id === linkedLiabilityId
        ? {
            ...l,
            label: liability.label,
            currentBalance: liability.currentBalance,
            interestRate: liability.interestRate ?? l.interestRate,
            linkedVehicleAssetId: linkedVehicleAssetId ?? l.linkedVehicleAssetId,
          }
        : l
    );
  } else {
    liabilities = [
      ...data.liabilities,
      {
        id: linkedLiabilityId,
        type: 'car_loan',
        label: liability.label,
        currentBalance: liability.currentBalance,
        interestRate: liability.interestRate,
        createdAt: new Date().toISOString(),
        linkedVehicleAssetId,
      },
    ];
  }

  const upserted = upsertLinkedRecurringItem(data.recurringItems, linkedLiabilityId, recurringItem, ids.newRecurringItemId);
  if (!upserted.ok) return { applied: false, reason: upserted.reason };
  let recurringItems = upserted.recurringItems;
  if (target.mode === 'update' && !recurringItem) {
    const previousLabel = data.liabilities.find((l) => l.id === linkedLiabilityId)?.label;
    if (previousLabel !== undefined && previousLabel !== liability.label) {
      recurringItems = renameLinkedRepaymentIfUnambiguous(recurringItems, linkedLiabilityId, liability.label);
    }
  }
  return { applied: true, data: upsertNetWorthHistory({ ...data, assets, liabilities, recurringItems }) };
}

/** Mortgage sibling of createCarLoanWithVehicleTransition — identical
 * target/id-generation/dedup discipline, generalized to property links
 * instead of vehicle links. See that function's doc comment for the full
 * rationale; not repeated here. */
export function createMortgageWithPropertyTransition(
  data: AppData,
  liability: { label: string; currentBalance: number; interestRate?: number },
  propertyLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
  recurringItem: Omit<RecurringItem, 'id'> | undefined,
  target: LiabilityTransitionTarget,
  ids: { newPropertyAssetId: string; newRecurringItemId: string }
): LiabilityTransitionResult {
  if (target.mode === 'update') {
    const existing = data.liabilities.find((l) => l.id === target.liabilityId);
    if (!existing) return { applied: false, reason: 'target_not_found' };
    if (existing.type !== 'mortgage') return { applied: false, reason: 'target_wrong_type' };
  }

  let assets = data.assets;
  let linkedPropertyAssetId: string | undefined;
  if (propertyLink.mode === 'existing') {
    linkedPropertyAssetId = propertyLink.assetId;
  } else if (propertyLink.mode === 'new') {
    assets = [...assets, { id: ids.newPropertyAssetId, type: 'property', label: propertyLink.label, currentValue: propertyLink.value }];
    linkedPropertyAssetId = ids.newPropertyAssetId;
  }

  const linkedLiabilityId = target.liabilityId;
  let liabilities: Liability[];
  if (target.mode === 'update') {
    liabilities = data.liabilities.map((l) =>
      l.id === linkedLiabilityId
        ? {
            ...l,
            label: liability.label,
            currentBalance: liability.currentBalance,
            interestRate: liability.interestRate ?? l.interestRate,
            linkedPropertyAssetId: linkedPropertyAssetId ?? l.linkedPropertyAssetId,
          }
        : l
    );
  } else {
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

  const upserted = upsertLinkedRecurringItem(data.recurringItems, linkedLiabilityId, recurringItem, ids.newRecurringItemId);
  if (!upserted.ok) return { applied: false, reason: upserted.reason };
  let recurringItems = upserted.recurringItems;
  if (target.mode === 'update' && !recurringItem) {
    const previousLabel = data.liabilities.find((l) => l.id === linkedLiabilityId)?.label;
    if (previousLabel !== undefined && previousLabel !== liability.label) {
      recurringItems = renameLinkedRepaymentIfUnambiguous(recurringItems, linkedLiabilityId, liability.label);
    }
  }
  return { applied: true, data: upsertNetWorthHistory({ ...data, assets, liabilities, recurringItems }) };
}

/** Generic sibling of createCarLoanWithVehicleTransition for liability
 * types with no dedicated asset link (Personal Loan, Other) — same
 * target/id-generation/dedup discipline, no vehicle/property step. */
export function linkBillToLiabilityTransition(
  data: AppData,
  liability: { type: LiabilityType; label: string; currentBalance: number; interestRate?: number },
  recurringItem: Omit<RecurringItem, 'id'> | undefined,
  target: LiabilityTransitionTarget,
  newRecurringItemId: string
): LiabilityTransitionResult {
  if (target.mode === 'update') {
    const existing = data.liabilities.find((l) => l.id === target.liabilityId);
    if (!existing) return { applied: false, reason: 'target_not_found' };
    if (existing.type !== liability.type) return { applied: false, reason: 'target_wrong_type' };
  }

  const linkedLiabilityId = target.liabilityId;
  let liabilities: Liability[];
  if (target.mode === 'update') {
    liabilities = data.liabilities.map((l) =>
      l.id === linkedLiabilityId
        ? { ...l, label: liability.label, currentBalance: liability.currentBalance, interestRate: liability.interestRate ?? l.interestRate }
        : l
    );
  } else {
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

  const upserted = upsertLinkedRecurringItem(data.recurringItems, linkedLiabilityId, recurringItem, newRecurringItemId);
  if (!upserted.ok) return { applied: false, reason: upserted.reason };
  let recurringItems = upserted.recurringItems;
  if (target.mode === 'update' && !recurringItem) {
    const previousLabel = data.liabilities.find((l) => l.id === linkedLiabilityId)?.label;
    if (previousLabel !== undefined && previousLabel !== liability.label) {
      recurringItems = renameLinkedRepaymentIfUnambiguous(recurringItems, linkedLiabilityId, liability.label);
    }
  }
  return { applied: true, data: upsertNetWorthHistory({ ...data, liabilities, recurringItems }) };
}

/** Round-5 addition (Issue 3, repayment-only immutability) — the dedicated
 * transition for "select an existing liability from Add Bill, leave loan
 * details locked, change only the repayment schedule." Unlike the three
 * transitions above, this NEVER touches `data.liabilities` at all — not
 * even by re-writing it with identical values — so the guarantee is
 * structural (the returned `liabilities` array is the exact same
 * reference as the input), not dependent on the caller happening to pass
 * back unchanged values. A UI layer that merely disables form fields is
 * not sufficient evidence of this on its own (regression-protection
 * review); this function is what makes it actually true regardless of
 * what the (disabled) form fields hold. */
export function updateLinkedRepaymentOnlyTransition(
  data: AppData,
  liabilityId: string,
  recurringItem: Omit<RecurringItem, 'id'> | undefined,
  newRecurringItemId: string
): LiabilityTransitionResult {
  const existing = data.liabilities.find((l) => l.id === liabilityId);
  if (!existing) return { applied: false, reason: 'target_not_found' };
  const upserted = upsertLinkedRecurringItem(data.recurringItems, liabilityId, recurringItem, newRecurringItemId);
  if (!upserted.ok) return { applied: false, reason: upserted.reason };
  return { applied: true, data: { ...data, recurringItems: upserted.recurringItems } };
}

interface AppStateContextValue {
  data: AppData;
  isLoading: boolean;
  /** B2.0C — app-wide AppData persistence bookkeeping (pendingCount/status/
   * resetState). Drives the app-level unsaved-change surface and the
   * reset-pending blocking overlay (both rendered from App.tsx's AppShell,
   * not from any individual screen — see resetAllData/retryPersist below
   * for why no screen-local state can be trusted for this). */
  persistenceState: PersistenceState;
  /** Re-issues a save of the CURRENT dataRef.current — never a captured/
   * stale snapshot, and never a business-transition replay. Safe to call
   * repeatedly; a no-op while the relevant write is already pending
   * (ordinary retry while nothing is in `'error'`, or a duplicate tap while
   * a reset write is already `'pending'`). */
  retryPersist: () => void;
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
  /** The B2.0B combined confirmation action — creates the transaction,
   * applies the existing B1 balance effect, and advances the recurring
   * schedule (preserving scheduleAnchorDay) as one committed transition.
   * Every source-owned fact (type, amount, category, schedule) is read
   * from the latest matching recurring item, never trusted from the
   * caller. Returns the full result so the caller can branch on
   * `applied`/`reason` for dismissal and error-messaging decisions. */
  confirmRecurringOccurrence: (input: {
    recurringItemId: string;
    expectedNextDueDate: string;
    paymentSource?: PaymentSource;
  }) => ConfirmationCommitResult;
  /** B2.4 mid-cycle recurring-income initialisation — creates a brand-new
   * monthly income source together with exactly one backfilled transaction
   * for its immediately preceding expected occurrence, in one atomic
   * commit. Only ever called for the "already included in my balances" /
   * "add it to a balance" choices — declining or being unsure both go
   * through the ordinary `addRecurringItem` instead, since neither creates
   * a transaction. `recurringItemId` is generated exactly once by the
   * caller (AddIncomeModal, outside any React state updater) the moment it
   * decides to show the mid-cycle prompt, and reused for every option the
   * user might go on to pick — never generated here — so a rapid double-
   * tap that somehow gets past the UI's isSubmitting guard still presents
   * the SAME id to this action both times, letting the duplicate-occurrence
   * guard inside createRecurringIncomeWithMidCycleOccurrence recognise the
   * second call as a no-op rather than a second, differently-identified
   * source (regression-protection review, B2.4 duplicate-identity
   * correction). `precedingOccurrenceDate` is likewise the exact ISO date
   * the caller already computed and displayed to the user — never
   * recomputed here. */
  addRecurringIncomeWithMidCycleOccurrence: (
    itemInput: Omit<RecurringItem, 'id'>,
    recurringItemId: string,
    choice: MidCycleIncomeOccurrenceChoice,
    precedingOccurrenceDate: string
  ) => void;
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
  /** Atomically creates-or-updates a liability (per the explicit `target` —
   * see LiabilityTransitionTarget's doc comment; type is never used as an
   * identity/dedup key) and links a new/updated recurring bill to it in a
   * single state write. Calling `addLiability` then `addRecurringItem`
   * back-to-back in the same handler silently drops the liability — both
   * close over the same pre-update `data`, so the second `persist`
   * overwrites the first (PRD bug report: "mortgage bill is created but
   * liability doesn't appear in Wealth"). Round-5 correction: returns the
   * full LiabilityTransitionResult (not a bare boolean) so a caller can
   * distinguish WHY a write didn't apply — `target_not_found`/
   * `target_wrong_type` (see LiabilityTransitionTarget's doc comment) or
   * `duplicate_linked_repayment` (see upsertLinkedRecurringItem's doc
   * comment) — and show the correct message instead of one generic
   * failure string. */
  linkBillToLiability: (
    liability: { type: LiabilityType; label: string; currentBalance: number; interestRate?: number },
    recurringItem: Omit<RecurringItem, 'id'> | undefined,
    target: LiabilityTransitionTarget,
    newRecurringItemId: string
  ) => LiabilityTransitionResult;
  /** Same atomicity/target contract as linkBillToLiability — creating a new
   * Property asset, the mortgage liability, and an optional recurring bill
   * all in one persist() call so none of them get silently dropped by a
   * stale-closure overwrite. `ids` must be generated exactly once by the
   * caller, never regenerated per call. Returns the full
   * LiabilityTransitionResult — see linkBillToLiability's doc comment. */
  addMortgageWithProperty: (
    liability: { label: string; currentBalance: number; interestRate?: number },
    propertyLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
    recurringItem: Omit<RecurringItem, 'id'> | undefined,
    target: LiabilityTransitionTarget,
    ids: { newPropertyAssetId: string; newRecurringItemId: string }
  ) => LiabilityTransitionResult;
  /** Same atomicity concern and shape as addMortgageWithProperty, generalized
   * to car loans and their linked vehicle (Asset type 'car'). `target`
   * decides create-vs-update (see LiabilityTransitionTarget's doc comment
   * — type is never used as an identity/dedup key); a repayment bill is
   * separately reused (updated in place) by `linkedLiabilityId` instead of
   * ever representing the same commitment twice. `ids` must be generated
   * exactly once by the caller (see createCarLoanWithVehicleTransition's
   * doc comment) — never regenerated per call. Returns the full
   * LiabilityTransitionResult — see linkBillToLiability's doc comment. */
  addCarLoanWithVehicle: (
    liability: { label: string; currentBalance: number; interestRate?: number },
    vehicleLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
    recurringItem: Omit<RecurringItem, 'id'> | undefined,
    target: LiabilityTransitionTarget,
    ids: { newVehicleAssetId: string; newRecurringItemId: string }
  ) => LiabilityTransitionResult;
  /** Round-5 addition (Issue 3, repayment-only immutability) — updates ONLY
   * the recurring repayment linked to `liabilityId`; never touches the
   * liability record itself, regardless of what any caller's own state
   * currently holds for it. Use this instead of the three actions above
   * when the user selected an existing liability from Add Bill and has not
   * explicitly unlocked "Edit loan details". Returns the full
   * LiabilityTransitionResult — see linkBillToLiability's doc comment. */
  updateLinkedRepaymentOnly: (
    liabilityId: string,
    recurringItem: Omit<RecurringItem, 'id'> | undefined,
    newRecurringItemId: string
  ) => LiabilityTransitionResult;
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

  // Always holds the latest AppData accepted by this provider, updated
  // synchronously — never via a React state updater — so a context action
  // that fires immediately after another one in the same handler (before
  // React has re-rendered) reads the first action's already-applied result
  // instead of a stale closure (regression-protection review, B2.0B §5).
  // commitData is the ONLY place setData is called in this component; every
  // path that replaces `data` (initial load, persist, reset) routes through
  // it, so the invariant holds by construction rather than by convention at
  // each call site.
  const dataRef = useRef(data);
  const commitData = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  // B2.0C — same dataRef pattern as above, applied to persistence
  // bookkeeping: persistenceStateRef always holds the latest value
  // synchronously, so resetAllData/retryPersist can guard against a
  // duplicate submission/tap without waiting for a re-render (regression-
  // protection review, B2.0C mandatory correction 1 §E). setPersistenceState
  // is the only place persistenceStateRef is written, mirroring commitData.
  const [persistenceState, setPersistenceStateRaw] = useState<PersistenceState>(initialPersistenceState);
  const persistenceStateRef = useRef(persistenceState);
  const setPersistenceState = useCallback((updater: (s: PersistenceState) => PersistenceState) => {
    persistenceStateRef.current = updater(persistenceStateRef.current);
    setPersistenceStateRaw(persistenceStateRef.current);
  }, []);

  // Tracks one write's full lifecycle against the shared PersistenceState —
  // `kind` is captured here, at issue time, and never re-read from state
  // later, since a different write may change `lastWriteKind` before this
  // one settles (regression-protection review, B2.0C corrected design §1).
  // issueWrite/settleWrite are the real, pure, exported functions from
  // persistenceState.ts — this is a thin wrapper, not a reimplementation.
  const trackWrite = useCallback(
    (promise: Promise<void>, kind: WriteKind) => {
      setPersistenceState((s) => issueWrite(s, kind));
      promise.then(
        () => setPersistenceState((s) => settleWrite(s, kind, 'success')),
        () => setPersistenceState((s) => settleWrite(s, kind, 'error'))
      );
    },
    [setPersistenceState]
  );

  useEffect(() => {
    loadAppData().then(async ({ data: loaded, migrated }) => {
      // Only write back when a migration actually changed something (e.g.
      // B2.0A's scheduleAnchorDay default) — an unmigrated load is a no-op,
      // never a write (regression-protection review, B2.0A follow-up §1).
      // The write is awaited and its rejection handled BEFORE isLoading
      // becomes false: RootNavigator renders nothing interactive while
      // isLoading is true, so no user action can schedule a newer
      // persist() call while this migration write is still in flight —
      // the race is removed by this ordering, not by assuming anything
      // about AsyncStorage's own write ordering (regression-protection
      // review, B2.0A follow-up §4).
      if (migrated) {
        try {
          await saveAppData(loaded);
        } catch (error) {
          // Don't crash, don't fall back to defaults, don't show a
          // misleading success state — the correctly migrated `loaded`
          // object is still used for this session below. Nothing durable
          // was written, so on-disk data still lacks (or still has an
          // invalid) scheduleAnchorDay, meaning the exact same migration
          // will be attempted again next launch with no extra bookkeeping
          // needed. console.warn is the smallest existing diagnostic
          // convention in this codebase — no error-reporting service
          // exists to route through, and adding one is explicitly out of
          // scope for this pass (B2.0C).
          console.warn('Migration write failed; will retry next launch', error);
        }
      }
      commitData(loaded);
      setIsLoading(false);
    });
  }, [commitData]);

  // B2.0C — now returns the exact Promise<void> the write produced (was
  // void), so confirmRecurringOccurrence can hand its own caller that exact
  // result (§ConfirmationCommitResult) without re-deriving anything. Every
  // other caller of persist() still ignores the return value, exactly as
  // before — this is additive, not a behaviour change for them.
  const persist = useCallback(
    (next: AppData): Promise<void> => {
      const withIncome = syncIncomeAggregate(next);
      const withScoreHistory = upsertLuluScoreHistory(withIncome);
      commitData(withScoreHistory);
      const write = saveAppData(withScoreHistory);
      trackWrite(write, 'ordinary');
      return write;
    },
    [commitData, trackWrite]
  );

  const updateUser = useCallback(
    (patch: Partial<UserProfile>) => {
      persist({ ...data, user: { ...data.user, ...patch } });
    },
    [data, persist]
  );

  const addRecurringItem = useCallback(
    (item: Omit<RecurringItem, 'id'>) => {
      const scheduleAnchorDay = resolveScheduleAnchorDay(null, item);
      persist({ ...data, recurringItems: [...data.recurringItems, { ...item, scheduleAnchorDay, id: generateId() }] });
    },
    [data, persist]
  );

  const updateRecurringItem = useCallback(
    (id: string, patch: Partial<Omit<RecurringItem, 'id'>>) => {
      persist({
        ...data,
        recurringItems: data.recurringItems.map((r) =>
          r.id === id ? { ...r, ...patch, scheduleAnchorDay: resolveScheduleAnchorDay(r, patch) } : r
        ),
      });
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

  // The B2.0B combined confirmation action (regression-protection review) —
  // reads dataRef.current, not `data`, so a call fired immediately after
  // another one in the same handler sees that prior call's already-applied
  // result rather than a stale render closure. transactionId and date are
  // generated exactly once here, in a plain callback React never
  // re-invokes speculatively — never inside confirmRecurringOccurrenceTransition
  // itself. persist is only called when the transition actually applied;
  // a rejected result never touches storage.
  // B2.0C — persist() now returns the exact write Promise, so it's handed
  // straight to the caller as `persistence` (ConfirmationCommitResult)
  // rather than discarded. No re-derivation: this is the SAME persist()
  // call every other confirmed path already used, not a second pipeline.
  // Pre-resolved when the transition didn't apply — nothing was written.
  const confirmRecurringOccurrence = useCallback(
    (input: { recurringItemId: string; expectedNextDueDate: string; paymentSource?: PaymentSource }): ConfirmationCommitResult => {
      const transactionId = generateId();
      const date = new Date().toISOString();
      const transition = confirmRecurringOccurrenceTransition(dataRef.current, { ...input, transactionId, date });
      if (!transition.applied) return { transition, persistence: Promise.resolve() };
      const persistence = persist(transition.data);
      return { transition, persistence };
    },
    [persist]
  );

  // B2.4 — mirrors the other creation actions (addRecurringItem etc.): a
  // brand-new item's id has never existed before this call, so there is no
  // "staleness" concept to guard against the way confirmRecurringOccurrence
  // guards against re-confirming an existing item. The synchronous
  // submission guard against a rapid double-tap creating two recurring
  // items/transactions lives in AddIncomeModal.tsx (isSubmitting), the same
  // presentation-level pattern SmartReminderCard already uses.
  const addRecurringIncomeWithMidCycleOccurrence = useCallback(
    (itemInput: Omit<RecurringItem, 'id'>, recurringItemId: string, choice: MidCycleIncomeOccurrenceChoice, precedingOccurrenceDate: string) => {
      const transactionId = generateId();
      const next = createRecurringIncomeWithMidCycleOccurrence(data, itemInput, recurringItemId, choice, precedingOccurrenceDate, transactionId);
      persist(next);
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

  // Round-5 correction (Issue 4 + Issue 5): reads dataRef.current rather
  // than the closed-over `data` (the same established pattern
  // confirmRecurringOccurrence already uses — see its own doc comment —
  // so a call fired immediately after another one in the same handler
  // never derives its result from a stale render closure). Also now
  // propagates a genuine label change to the liability's own linked
  // repayment's display name (renameLinkedRepaymentIfUnambiguous — a
  // no-op when there is no linked repayment, or more than one, per its
  // own doc comment) — this is the only place a full "Edit liability" row-
  // tap rename ever reaches a repayment name, since that path never goes
  // through the smart-loan target-based transitions at all.
  const updateLiability = useCallback(
    (id: string, patch: Partial<Omit<Liability, 'id'>>) => {
      const current = dataRef.current;
      const existing = current.liabilities.find((l) => l.id === id);
      const liabilities = current.liabilities.map((l) => (l.id === id ? { ...l, ...patch } : l));
      let recurringItems = current.recurringItems;
      if (existing && typeof patch.label === 'string' && patch.label !== existing.label) {
        recurringItems = renameLinkedRepaymentIfUnambiguous(recurringItems, id, patch.label);
      }
      persist(upsertNetWorthHistory({ ...current, liabilities, recurringItems }));
    },
    [persist]
  );

  const deleteLiability = useCallback(
    (id: string) => {
      persist(upsertNetWorthHistory({ ...data, liabilities: data.liabilities.filter((l) => l.id !== id) }));
    },
    [data, persist]
  );

  // Round-5 correction (Issue 5): now returns the full
  // LiabilityTransitionResult (not a bare boolean) and reads
  // dataRef.current instead of the closed-over `data` — same rationale as
  // updateLiability above. A `false`-shaped failure ('target_not_found' /
  // 'target_wrong_type' / 'duplicate_linked_repayment', see
  // LiabilityTransitionTarget's and upsertLinkedRecurringItem's doc
  // comments) is a pure no-write; the caller (AddWealthItemModal) surfaces
  // the exact reason via its existing recovery UI rather than silently
  // doing nothing or guessing.
  const linkBillToLiability = useCallback(
    (
      liability: { type: LiabilityType; label: string; currentBalance: number; interestRate?: number },
      recurringItem: Omit<RecurringItem, 'id'> | undefined,
      target: LiabilityTransitionTarget,
      newRecurringItemId: string
    ): LiabilityTransitionResult => {
      const result = linkBillToLiabilityTransition(dataRef.current, liability, recurringItem, target, newRecurringItemId);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  const addMortgageWithProperty = useCallback(
    (
      liability: { label: string; currentBalance: number; interestRate?: number },
      propertyLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
      recurringItem: Omit<RecurringItem, 'id'> | undefined,
      target: LiabilityTransitionTarget,
      ids: { newPropertyAssetId: string; newRecurringItemId: string }
    ): LiabilityTransitionResult => {
      const result = createMortgageWithPropertyTransition(dataRef.current, liability, propertyLink, recurringItem, target, ids);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  const addCarLoanWithVehicle = useCallback(
    (
      liability: { label: string; currentBalance: number; interestRate?: number },
      vehicleLink: { mode: 'existing'; assetId: string } | { mode: 'new'; value: number; label: string } | { mode: 'none' },
      recurringItem: Omit<RecurringItem, 'id'> | undefined,
      target: LiabilityTransitionTarget,
      ids: { newVehicleAssetId: string; newRecurringItemId: string }
    ): LiabilityTransitionResult => {
      const result = createCarLoanWithVehicleTransition(dataRef.current, liability, vehicleLink, recurringItem, target, ids);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  // Round-5 addition (Issue 3) — see updateLinkedRepaymentOnlyTransition's
  // doc comment for why this exists as its own action instead of routing
  // repayment-only saves through the three actions above.
  const updateLinkedRepaymentOnly = useCallback(
    (liabilityId: string, recurringItem: Omit<RecurringItem, 'id'> | undefined, newRecurringItemId: string): LiabilityTransitionResult => {
      const result = updateLinkedRepaymentOnlyTransition(dataRef.current, liabilityId, recurringItem, newRecurringItemId);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
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
  //
  // B2.0C mandatory correction 1 — RootNavigator switches to the Welcome
  // flow the instant commitData(fresh) runs (it reads data.user.hasSeenIntro
  // directly), which is before this reset write has even started, let alone
  // settled. ResetLuluScreen itself is therefore torn down by that
  // navigation switch almost immediately — there is no screen left to host
  // a local pending/error state, so this routes through the same tracked
  // write as every other action and leaves the app-level ResetPendingOverlay
  // (App.tsx) to show progress/failure — it is the one surface guaranteed to
  // survive the navigation switch. Guarded against a duplicate submission
  // (resetState !== 'none' means a reset write is already pending or
  // awaiting retry) — a second tap while one is already in flight is a
  // no-op, never a second AsyncStorage.setItem race against the first.
  const resetAllData = useCallback(() => {
    if (!canIssueReset(persistenceStateRef.current)) return;
    const fresh = createEmptyAppData();
    commitData(fresh);
    trackWrite(saveAppData(fresh), 'reset');
  }, [commitData, trackWrite]);

  // B2.0C — re-issues a save of dataRef.current (never a captured snapshot,
  // never createEmptyAppData() called again — for a reset retry this is the
  // SAME already-committed fresh object, not a freshly regenerated one, so
  // no generated value can ever differ between the original attempt and a
  // retry). Never calls confirmRecurringOccurrenceTransition/
  // applyNewTransaction or any other business-transition function — this
  // only ever touches the storage layer. Guarded against a duplicate tap:
  // a no-op while a reset write is already 'pending', and a no-op for the
  // ordinary (ConfirmationCommitResult/UnsavedChangesBanner) path unless the
  // app is actually in `'error'` with no reset outstanding.
  const retryPersist = useCallback(() => {
    const s0 = persistenceStateRef.current;
    if (!canRetry(s0)) return;
    const kind: WriteKind = retryWriteKind(s0);
    trackWrite(saveAppData(dataRef.current), kind);
  }, [trackWrite]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      persistenceState,
      retryPersist,
      updateUser,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      confirmRecurringOccurrence,
      addRecurringIncomeWithMidCycleOccurrence,
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
      addCarLoanWithVehicle,
      updateLinkedRepaymentOnly,
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
      persistenceState,
      retryPersist,
      updateUser,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      confirmRecurringOccurrence,
      addRecurringIncomeWithMidCycleOccurrence,
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
      addCarLoanWithVehicle,
      updateLinkedRepaymentOnly,
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
