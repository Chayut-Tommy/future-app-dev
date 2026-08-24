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
import { resolveBillTransactionCategory } from '../lib/calculations/billCategory';
import { computeTotalMonthlyIncome, findPrimaryIncomeItem } from '../lib/calculations/incomeEngine';
import { resolveValidAnchorDay, usesScheduleAnchor } from '../lib/calculations/recurringSchedule';
import { advanceRecurringItemSchedule } from '../lib/calculations/reminders';
import {
  snoozedOccurrences,
  dismissedOccurrences,
  pruneSnoozes,
  pruneDismissals,
} from '../lib/calculations/reminderSuppression';
import { moneyAmountToCents } from '../lib/calculations/money';
import { resolveBnplLinkedItems, toBalanceCentsAllowingZero } from '../lib/calculations/bnpl';
import { resolveIncomeDestinationAsset } from '../lib/calculations/incomeDestinations';
import { isEligibleLiquidBalance, listEligibleDebtDestinations } from '../lib/calculations/moveMoneyEligibility';
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

  // Everyday Account expense routing (2026-08-08) — a debit-card expense
  // charged against a SPECIFIC Everyday Account, identified by
  // `targetAssetId` (never a default lookup, unlike 'cash'). Reuses the
  // exact same `targetKind: 'asset'` shape the 'cash' branch above and the
  // income targetAssetId branch already use — inherits the SAME
  // applyEffectDelta mutation, the SAME reverse-then-reapply edit/delete
  // pipeline, and the SAME Math.max(0, ...) floor, with no new engine
  // logic. Global Cash is never touched by this branch.
  if (source === 'everyday' && t.targetAssetId) {
    const account = data.assets.find((a) => a.id === t.targetAssetId && a.type === 'everyday');
    if (!account) return undefined;
    return { targetKind: 'asset', targetId: account.id, delta: -t.amount };
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
//
// Returns `actualDelta` — the effect-shaped delta (same sign convention as
// AppliedBalanceEffect.delta) that the target's stored value ACTUALLY moved
// by, after the Math.max(0, ...) floor below is accounted for. When the
// floor doesn't bind, actualDelta === effect.delta exactly. When it does
// (an insufficient source: Cash or Everyday debited below what it holds,
// or a liability repaid below what's owed), actualDelta reflects only what
// truly moved — floor-then-reverse phantom-credit correction, 2026-08-08:
// every caller that is APPLYING a freshly-computed effect (sign=1, in
// applyNewTransaction and applyTransactionUpdate's re-apply step) must
// store this actualDelta as the transaction's appliedBalanceEffect, never
// the effect's own intended delta — otherwise a later reversal negates the
// INTENDED delta instead of what was truly removed, over-crediting the
// target by exactly the amount the floor absorbed (regression-protection
// review: "start Everyday $100, expense $50, change source to a $0 Cash —
// Cash floors at $0 having only truly moved $0, but the stored intended
// delta was -$50; changing back would then credit Cash the full $50 it
// never actually lost"). This single choice — store what happened, not
// what was intended — is the entire fix; nothing else about this function,
// or about how reversals themselves apply, changes.
function applyEffectDelta(data: AppData, effect: AppliedBalanceEffect | undefined, sign: 1 | -1): { data: AppData; actualDelta: number } {
  if (!effect) return { data, actualDelta: 0 };

  if (effect.targetKind === 'asset') {
    const existing = data.assets.find((a) => a.id === effect.targetId);
    if (!existing) return { data, actualDelta: 0 };
    // Floored at 0 — Cash and Everyday should never read as a negative asset (PRD ask).
    const clamped = Math.max(0, existing.currentValue + sign * effect.delta);
    const updatedAssets = data.assets.map((a) => (a.id === existing.id ? { ...a, currentValue: clamped } : a));
    return { data: { ...data, assets: updatedAssets }, actualDelta: sign * (clamped - existing.currentValue) };
  }

  if (effect.targetKind === 'credit_card') {
    const card = data.creditCards.find((c) => c.id === effect.targetId);
    if (!card) return { data, actualDelta: 0 };
    const updatedCard: CreditCard = { ...card, currentBalance: card.currentBalance + sign * effect.delta };
    const withCard = { ...data, creditCards: data.creditCards.map((c) => (c.id === card.id ? updatedCard : c)) };
    // No floor on a credit card's balance (it may legitimately go negative —
    // "in credit" — see ThisMonthCard's cardsInCredit handling), so the
    // actual delta always equals the intended one.
    return { data: upsertCreditCardLiability(withCard, updatedCard), actualDelta: effect.delta };
  }

  if (effect.targetKind === 'liability') {
    const existing = data.liabilities.find((l) => l.id === effect.targetId);
    if (!existing) return { data, actualDelta: 0 };
    const clamped = Math.max(0, existing.currentBalance + sign * effect.delta);
    const updatedLiabilities = data.liabilities.map((l) => (l.id === existing.id ? { ...l, currentBalance: clamped } : l));
    return { data: { ...data, liabilities: updatedLiabilities }, actualDelta: sign * (clamped - existing.currentBalance) };
  }

  return { data, actualDelta: 0 };
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
  const { data: withEffect, actualDelta } = applyEffectDelta(workingData, effect, 1);
  // Stores what was ACTUALLY applied (post-floor), not the intended effect
  // — see applyEffectDelta's own doc comment (floor-then-reverse phantom-
  // credit correction, 2026-08-08). Identical to `effect` whenever the
  // floor didn't bind.
  const appliedEffect: AppliedBalanceEffect | undefined = effect ? { ...effect, delta: actualDelta } : undefined;
  const newTransaction: Transaction = { ...t, id: transactionId, balanceEffect, appliedBalanceEffect: appliedEffect };
  return { ...withEffect, transactions: [...workingData.transactions, newTransaction] };
}

export type ConfirmRecurringOccurrenceResult =
  | { applied: true; data: AppData }
  | {
      applied: false;
      reason:
        | 'not_found'
        | 'stale'
        | 'invalid_date'
        | 'invalid_amount'
        | 'invalid_input'
        | 'invalid_source'
        | 'balance_target_missing'
        | 'insufficient_source_balance';
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
  /** Reminder queue correction round — additive field mirroring
   * confirmLoanRepayment/confirmCreditCardRepayment's own established
   * `transactionId` contract, so SmartReminderCard's mutation-success paths
   * can report a `ReminderReviewOutcome` of kind 'completed' carrying the
   * real id (never a synthesized one). The transactionId this file already
   * generates internally for every confirmation attempt (see
   * confirmRecurringOccurrence's own comment) — present even when the
   * transition did not apply, since it's generated before the transition
   * runs; callers should only rely on it when `transition.applied` is true. */
  transactionId: string;
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
    /** Two independent uses, matching Transaction.targetAssetId's own
     * doc comment exactly:
     * (1) Income only — correction round, 2026-08-10. The specific Cash/
     * Everyday/Savings asset this confirmed income is credited to, chosen
     * explicitly by the user via the shared IncomeDestinationPicker (never
     * a caller-side default).
     * (2) Expense with paymentSource === 'everyday' only (device-test
     * correction round) — the specific Everyday Account this bill payment
     * debits, chosen via the shared BillPaymentSourcePicker. Required
     * whenever paymentSource is 'everyday', exactly like creditCardId is
     * required for 'credit_card'. */
    targetAssetId?: string;
    /** Expense with paymentSource === 'credit_card' only (device-test
     * correction round) — the specific card this bill is charged to,
     * chosen explicitly via BillPaymentSourcePicker. Previously this
     * transition silently used `data.creditCards[0]` regardless of which
     * card (if any) the user actually has multiple of — a real defect a
     * device test surfaced. Required whenever paymentSource is
     * 'credit_card'; never defaulted. */
    creditCardId?: string;
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
  if (
    item.type === 'expense' &&
    input.paymentSource !== 'cash' &&
    input.paymentSource !== 'credit_card' &&
    input.paymentSource !== 'everyday'
  ) {
    return { applied: false, reason: 'invalid_source' };
  }

  let creditCardId: string | undefined;
  let expenseTargetAssetId: string | undefined;
  // Final narrow Pass 2D correction — a Cash/Everyday funding source must
  // have ENOUGH recorded balance to cover the bill in full before this
  // transition ever applies, mirroring the same sufficiency check
  // confirmBnplRepaymentTransition / confirmCreditCardRepaymentTransition /
  // confirmLoanRepaymentTransition already established (reused here, not
  // reinvented). Previously this branch only checked that a Cash asset
  // EXISTED, never that it held enough — applyEffectDelta's own floor-at-0
  // would then silently absorb the shortfall, leaving the recorded
  // transaction amount (the full bill) disagreeing with what actually left
  // the account. A named credit card is a LIABILITY source, not a balance
  // that floors, so this check is deliberately scoped to cash/everyday
  // only — see the 'credit_card' branch below, unchanged.
  if (item.type === 'expense' && input.paymentSource === 'cash') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return { applied: false, reason: 'balance_target_missing' };
    const cashCents = toBalanceCentsAllowingZero(cashAsset.currentValue);
    if (cashCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (cashCents < validatedAmount.cents) return { applied: false, reason: 'insufficient_source_balance' };
  }
  // Device-test correction round — 'everyday' is now a real bill-payment
  // source (previously only reachable for BNPL): same routed-spending
  // contract computeBalanceEffect's own 'everyday' branch already requires
  // — targetAssetId must identify one specific, currently-existing
  // Everyday Account, never a default lookup.
  if (item.type === 'expense' && input.paymentSource === 'everyday') {
    const account = data.assets.find((a) => a.id === input.targetAssetId && a.type === 'everyday');
    if (!account) return { applied: false, reason: 'balance_target_missing' };
    // Final narrow Pass 2D correction — same sufficiency check as cash
    // above, reused for the same reason.
    const accountCents = toBalanceCentsAllowingZero(account.currentValue);
    if (accountCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (accountCents < validatedAmount.cents) return { applied: false, reason: 'insufficient_source_balance' };
    expenseTargetAssetId = account.id;
  }
  // Device-test correction round — creditCardId is now caller-supplied
  // (via BillPaymentSourcePicker), never `data.creditCards[0]`. A caller
  // that omits it, or names a card that no longer exists, is rejected the
  // same way an everyday account with no matching id is.
  if (item.type === 'expense' && input.paymentSource === 'credit_card') {
    const card = data.creditCards.find((c) => c.id === input.creditCardId);
    if (!card) return { applied: false, reason: 'balance_target_missing' };
    creditCardId = card.id;
  }

  // Correction round, 2026-08-10 — income must always name an explicit,
  // real, currently-eligible destination asset; never silently defaults to
  // Cash. Reuses the exact same eligible-destination validator the mid-
  // cycle backfill transition below uses, so "which balances can income be
  // credited to" can never disagree between the two entry points.
  if (item.type === 'income' && (!input.targetAssetId || !resolveIncomeDestinationAsset(data, input.targetAssetId))) {
    return { applied: false, reason: 'balance_target_missing' };
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
  // Wave 9a-D — an ordinary confirmed EXPENSE occurrence keeps the purpose
  // the customer chose on the bill. This was previously the literal
  // 'cat-other-expense' with no input at all, so Rent, Car Loan and Gym
  // bills all produced "Other" transactions and every category insight
  // under-reported. `resolveBillTransactionCategory` reads ONLY the
  // structured `categoryId`; it never consults the bill's name, label or
  // icon, and it falls back to 'cat-other-expense' explicitly for a legacy
  // bill that has no purpose recorded yet.
  //
  // This changes CLASSIFICATION only. It does not select an accounting
  // path: repayment treatment keys on `isRepayment` (see
  // repaymentAccounting.ts), and a liability-linked repayment never reaches
  // this branch at all.
  //
  // The income branch is deliberately untouched. It resolves by lower-cased
  // label match, which is the same name-matching anti-pattern — recorded as
  // follow-up risk rather than widened into here, because correcting it
  // would change which category existing income confirmations land in.
  const categoryId =
    item.type === 'income'
      ? data.categories.find((c) => c.type === 'income' && c.name.toLowerCase() === item.label.toLowerCase())?.id ?? 'cat-other-income'
      : resolveBillTransactionCategory(item);

  // Final narrow Pass 2D correction — an ordinary confirmed EXPENSE
  // (bill) occurrence now gets the same stable, durable occurrence
  // identity BNPL/loan repayments already have — reused verbatim, not a
  // new mechanism (see Transaction.recurringOccurrenceKey's own doc
  // comment for the shared format/disambiguation contract). This is what
  // lets a full reversal restore the exact Reminder occurrence it
  // completed. Deliberately scoped to expense only — income (salary)
  // confirmation reversal-restoration is unchanged and out of this
  // round's authorised scope.
  const occurrenceKey = item.type === 'expense' ? `${item.id}:${item.nextDueDate}` : undefined;

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
    targetAssetId: item.type === 'income' ? input.targetAssetId : expenseTargetAssetId,
    recurringItemId: item.id,
    recurringOccurrenceKey: occurrenceKey,
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
    old.balanceEffect === undefined ? legacyApplyTransactionEffect(data, old, -1) : applyEffectDelta(data, old.appliedBalanceEffect, -1).data;

  const balanceEffect: BalanceEffectMode = merged.balanceEffect ?? 'update';
  if (merged.type === 'income' && balanceEffect === 'update') {
    const { assets } = ensureCashAsset(workingData);
    workingData = { ...workingData, assets };
  }
  const effect = computeBalanceEffect(workingData, { ...merged, balanceEffect });
  const { data: reapplied, actualDelta } = applyEffectDelta(workingData, effect, 1);
  workingData = reapplied;
  // Stores what was ACTUALLY applied (post-floor), not the intended effect —
  // see applyEffectDelta's own doc comment (floor-then-reverse phantom-
  // credit correction, 2026-08-08).
  const appliedEffect: AppliedBalanceEffect | undefined = effect ? { ...effect, delta: actualDelta } : undefined;

  const finalTransaction: Transaction = { ...merged, balanceEffect, appliedBalanceEffect: appliedEffect };
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
    old.balanceEffect === undefined
      ? legacyApplyTransactionEffect(data, old, -1)
      : applyEffectDelta(data, old.appliedBalanceEffect, -1).data;
  return { ...reverted, transactions: data.transactions.filter((t) => t.id !== id) };
}

/** B2.4 mid-cycle recurring-income initialisation — the choice a user makes
 * about a newly-created monthly income source's immediately preceding
 * expected occurrence. Only these two variants ever construct a
 * transaction; declining ("no, my first payment is later") or being unsure
 * both go through the ordinary, completely unmodified addRecurringItem
 * path instead — see AddIncomeModal.tsx, which never calls
 * createRecurringIncomeWithMidCycleOccurrence for those two answers. */
// Correction round, 2026-08-10 — targetAssetId is now REQUIRED for
// 'add_to_balance' (was optional, with `undefined` meaning an implicit,
// silently-conjured Cash asset). The shared IncomeDestinationPicker always
// supplies a real, existing eligible asset id; there is no longer a UI
// path that omits one, and this type change makes that contract explicit
// rather than merely conventional (avoid silently defaulting to Cash).
export type MidCycleIncomeOccurrenceChoice =
  | { kind: 'already_included' }
  | { kind: 'add_to_balance'; targetAssetId: string };

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

/** Correction, 2026-08-10 review — applies every changed
 * includeInMoneyCalculations entry from one Select Balances Save against a
 * SINGLE AppData snapshot, in one pass, so a Save that both includes
 * Account A and excludes Account B commits both instead of the second
 * write silently discarding the first (which is what happened when the
 * caller looped plain updateAsset() calls, each closing over the same
 * pre-loop `data`). Pure and exported so it has real, direct test coverage
 * — the same convention every other multi-field financial transition in
 * this file (confirmRecurringOccurrenceTransition, createCarLoanWith-
 * VehicleTransition, etc.) already follows, not a special case invented
 * for this one. Touches only the listed ids' includeInMoneyCalculations
 * field — currentValue, label, type and every other Asset field are
 * untouched, and assets not present in `updates` are returned unchanged. */
export function applyAssetsIncludeInMoneyUpdate(data: AppData, updates: { id: string; included: boolean }[]): AppData {
  if (updates.length === 0) return data;
  const updateMap = new Map(updates.map((u) => [u.id, u.included]));
  return {
    ...data,
    assets: data.assets.map((a) => (updateMap.has(a.id) ? { ...a, includeInMoneyCalculations: updateMap.get(a.id) } : a)),
  };
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
 * the required targetAssetId, crediting exactly the one asset the user
 * explicitly selected via the shared IncomeDestinationPicker, once — never
 * an implicit/default Cash asset (correction round, 2026-08-10). */
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

  // Correction round, 2026-08-10 — the same shared validator
  // confirmRecurringOccurrenceTransition uses for the reminder-confirmation
  // path: an 'add_to_balance' choice must always name a real, currently-
  // eligible destination asset. The UI only ever offers ids from
  // resolveEligibleIncomeDestinations, so this should be unreachable in
  // practice; it exists so the transition itself never silently applies an
  // invalid/stale destination, mirroring the existing duplicate-guard no-op
  // convention immediately above rather than throwing.
  if (choice.kind === 'add_to_balance' && !resolveIncomeDestinationAsset(data, choice.targetAssetId)) {
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

// ============================================================================
// BNPL (Buy Now, Pay Later) — atomic create/edit and repayment transitions.
// Both follow the exact pure-function, snapshot-in/snapshot-out convention
// every transition above already uses: validate fully before mutating
// anything, construct the entire resulting AppData in one shot, and let the
// calling useCallback commit it via exactly one persist() call. Neither
// function is a smart-loan variant (BNPL is deliberately NOT in
// SMART_LOAN_TYPES — no asset link, no equity view, no target-picker
// wizard) — this is closer in shape to updateLinkedRepaymentOnlyTransition
// plus the create-path of linkBillToLiabilityTransition, but with two
// capabilities neither of those support: a genuine "remove the schedule,
// keep the plan" transition, and BNPL-specific validation (a required
// positive balance for a brand-new plan, and defense-in-depth re-validation
// of an all-or-nothing schedule even though the UI is expected to enforce
// that first).
// ============================================================================

const VALID_PAY_FREQUENCIES: PayFrequency[] = ['weekly', 'fortnightly', 'monthly', 'irregular'];

function isValidBnplSchedule(schedule: { amount: number; frequency: PayFrequency; nextDueDate: string }): boolean {
  if (!moneyAmountToCents(schedule.amount).valid) return false;
  if (!VALID_PAY_FREQUENCIES.includes(schedule.frequency)) return false;
  return isValidCanonicalDate(schedule.nextDueDate);
}

export interface BnplScheduleInput {
  amount: number;
  frequency: PayFrequency;
  nextDueDate: string;
}

export type SaveBnplPlanInput =
  | {
      mode: 'create';
      liability: { label: string; provider?: string; currentBalance: number };
      /** `undefined` = balance-only plan. A defined value must be a
       * COMPLETE schedule — there is no partial/optional-field variant at
       * this boundary; the caller's own form is responsible for only ever
       * constructing this object once every field is genuinely filled in
       * (mirroring AddWealthItemModal's existing "optional-schedule
       * contract" for smart loans), and this function re-validates it
       * regardless (see isValidBnplSchedule) before mutating anything. */
      schedule: BnplScheduleInput | undefined;
      ids: { liabilityId: string; recurringItemId: string };
    }
  | {
      mode: 'update';
      liabilityId: string;
      liability: { label: string; provider?: string; currentBalance: number };
      /** `'unchanged'` — the recurringItems array reference is returned
       * unchanged (same structural guarantee updateLinkedRepaymentOnlyTransition
       * already gives for its own undefined-payload case), even though the
       * liability's own fields may still change. `'remove'` — deactivates
       * the existing single linked item (never deletes it — its id remains
       * available for a later re-add, and any historical transaction that
       * references it by recurringItemId stays intact), leaving a valid
       * balance-only plan. A `BnplScheduleInput` — creates the first linked
       * item if none exists yet, or updates the existing one in place
       * (reactivating it if it had previously been removed). */
      schedule: 'unchanged' | 'remove' | BnplScheduleInput;
      newRecurringItemId: string;
    };

export type SaveBnplPlanResult =
  | { applied: true; data: AppData }
  | {
      applied: false;
      reason: 'target_not_found' | 'target_wrong_type' | 'ambiguous_schedule' | 'invalid_balance' | 'incomplete_schedule';
    };

/**
 * The single atomic create-or-edit transition for a BNPL plan and its
 * optional linked repayment schedule — one coherent state change, one
 * persistence operation (via the caller's single persist() call), never two
 * sequential writes for "create the liability" then "create its schedule."
 * Validates every rule before constructing any part of the result; every
 * rejected path returns without touching `data`.
 */
export function saveBnplPlanTransition(data: AppData, input: SaveBnplPlanInput): SaveBnplPlanResult {
  if (input.mode === 'create') {
    // Required outstanding balance greater than $0 for new plans — a
    // brand-new BNPL plan with nothing owed is not a valid state (balance-
    // only entry means "no schedule yet," never "no balance yet").
    if (!moneyAmountToCents(input.liability.currentBalance).valid) return { applied: false, reason: 'invalid_balance' };
    if (input.schedule !== undefined && !isValidBnplSchedule(input.schedule)) return { applied: false, reason: 'incomplete_schedule' };

    const liabilityId = input.ids.liabilityId;
    const newLiability: Liability = {
      id: liabilityId,
      type: 'bnpl',
      label: input.liability.label,
      provider: input.liability.provider,
      currentBalance: input.liability.currentBalance,
      createdAt: new Date().toISOString(),
    };

    let recurringItems = data.recurringItems;
    if (input.schedule) {
      const scheduleAnchorDay = resolveScheduleAnchorDay(null, { frequency: input.schedule.frequency, nextDueDate: input.schedule.nextDueDate });
      const newItem: RecurringItem = {
        id: input.ids.recurringItemId,
        type: 'expense',
        label: `${input.liability.label} repayment`,
        amount: input.schedule.amount,
        frequency: input.schedule.frequency,
        nextDueDate: input.schedule.nextDueDate,
        // Deliberately NOT isFixed — computeFixedCosts (and every consumer
        // that reads it: Navilo Score's commitments/essential-expense
        // factors, computeSummaryForMonth's achievements/emergency-fund/
        // wealth-projection chain, GoalDetailSheet's feasibility check)
        // treats isFixed items as an ONGOING, INDEFINITE monthly
        // commitment — exactly what a finite, capped, payoff-bound BNPL
        // plan is not. Keeping this false means computeFixedCosts and
        // every one of those consumers stay byte-for-byte unaffected by
        // BNPL's mere existence, with zero code change to any of them —
        // the explicit "Navilo Score/achievements/life-stage/coaching
        // unchanged" requirement is satisfied structurally, not by
        // carving BNPL back out of a shared function after the fact.
        // Money-tab surfaces that DO need BNPL's cost (Available Until
        // Payday, Money Plan, Typical Money Flow, What Happens Next) read
        // it through the dedicated, capped bnpl.ts helpers instead — see
        // safeToSpend.ts/moneyPlan.ts/moneyTimeline.ts/MoneyScreen.tsx.
        isFixed: false,
        active: true,
        linkedLiabilityId: liabilityId,
        scheduleAnchorDay,
      };
      recurringItems = [...recurringItems, newItem];
    }

    return {
      applied: true,
      data: upsertNetWorthHistory({ ...data, liabilities: [...data.liabilities, newLiability], recurringItems }),
    };
  }

  // mode === 'update'
  const existing = data.liabilities.find((l) => l.id === input.liabilityId);
  if (!existing) return { applied: false, reason: 'target_not_found' };
  if (existing.type !== 'bnpl') return { applied: false, reason: 'target_wrong_type' };
  // Editing balance downward to exactly $0 is allowed here (a manual
  // correction) — only a genuinely negative/invalid/fractional-cent value
  // is rejected, via the same zero-allowing strict conversion the
  // projection engine itself uses for a live outstanding balance.
  if (toBalanceCentsAllowingZero(input.liability.currentBalance) === undefined) return { applied: false, reason: 'invalid_balance' };

  const resolution = resolveBnplLinkedItems(data, input.liabilityId);
  if (resolution.status === 'ambiguous') return { applied: false, reason: 'ambiguous_schedule' };

  if (typeof input.schedule === 'object' && !isValidBnplSchedule(input.schedule)) {
    return { applied: false, reason: 'incomplete_schedule' };
  }

  const liabilities = data.liabilities.map((l) =>
    l.id === input.liabilityId
      ? { ...l, label: input.liability.label, provider: input.liability.provider, currentBalance: input.liability.currentBalance }
      : l
  );

  let recurringItems = data.recurringItems;
  if (input.schedule === 'remove') {
    if (resolution.status === 'single') {
      recurringItems = data.recurringItems.map((r) => (r.id === resolution.item.id ? { ...r, active: false } : r));
    }
    // status === 'none': already balance-only, nothing to remove — safe no-op.
  } else if (typeof input.schedule === 'object') {
    const scheduleAnchorDay = resolveScheduleAnchorDay(
      resolution.status === 'single' ? resolution.item : null,
      { frequency: input.schedule.frequency, nextDueDate: input.schedule.nextDueDate }
    );
    if (resolution.status === 'single') {
      recurringItems = data.recurringItems.map((r) =>
        r.id === resolution.item.id
          ? {
              ...r,
              label: `${input.liability.label} repayment`,
              amount: (input.schedule as BnplScheduleInput).amount,
              frequency: (input.schedule as BnplScheduleInput).frequency,
              nextDueDate: (input.schedule as BnplScheduleInput).nextDueDate,
              scheduleAnchorDay,
              active: true,
            }
          : r
      );
    } else {
      const newItem: RecurringItem = {
        id: input.newRecurringItemId,
        type: 'expense',
        label: `${input.liability.label} repayment`,
        amount: (input.schedule as BnplScheduleInput).amount,
        frequency: (input.schedule as BnplScheduleInput).frequency,
        nextDueDate: (input.schedule as BnplScheduleInput).nextDueDate,
        isFixed: false,
        active: true,
        linkedLiabilityId: input.liabilityId,
        scheduleAnchorDay,
      };
      recurringItems = [...data.recurringItems, newItem];
    }
  }
  // input.schedule === 'unchanged': recurringItems stays the SAME reference
  // as data.recurringItems — a structural guarantee, not merely "the form
  // fields were disabled" (same reasoning updateLinkedRepaymentOnlyTransition's
  // own doc comment gives for its own undefined-payload case).

  return { applied: true, data: upsertNetWorthHistory({ ...data, liabilities, recurringItems }) };
}

// BNPL scope, 2026-08-09: deleting a BNPL plan must deactivate every ACTIVE
// recurring item linked to it — plural, never assuming a single item
// (corrupted/legacy data may have more than one; see
// resolveBnplLinkedItems's own doc comment). Scoped strictly to
// `type === 'bnpl'`: every other liability type's existing (unchanged,
// pre-existing, out-of-scope-to-fix-generally) orphaning behaviour is
// untouched — deleting a mortgage/car/personal loan still never touches
// recurringItems, exactly as before this round. Pulled out as its own pure,
// exported, directly-testable function — same rationale as every other
// transition in this file: a production behaviour this important must be
// exercisable against the exact code the app runs, not only through the
// useCallback wrapper.
export function deleteLiabilityTransition(data: AppData, id: string): AppData {
  const target = data.liabilities.find((l) => l.id === id);
  const recurringItems =
    target?.type === 'bnpl'
      ? data.recurringItems.map((r) => (r.linkedLiabilityId === id && r.active ? { ...r, active: false } : r))
      : data.recurringItems;
  return upsertNetWorthHistory({ ...data, liabilities: data.liabilities.filter((l) => l.id !== id), recurringItems });
}

export type TransferFundsResult =
  | { applied: true; data: AppData; effectiveAmountCents: number }
  | {
      applied: false;
      data: AppData;
      reason:
        | 'invalid_amount'
        | 'source_missing'
        | 'destination_missing'
        | 'source_not_eligible'
        | 'destination_not_eligible'
        | 'same_balance'
        | 'invalid_recorded_balance'
        | 'insufficient_source'
        | 'exceeds_liability_balance';
      /** Only set when reason === 'invalid_recorded_balance' — internal
       * diagnostic detail (which stored record failed conversion), never
       * surfaced verbatim to the customer; the UI maps every value of this
       * reason to one neutral message regardless of side. */
      invalidBalanceSide?: 'source' | 'destination' | 'liability';
    };

/**
 * Moves money between two places the user already owns — buying
 * investments with cash, or paying down a liability with cash. Both sides
 * update atomically so net worth only changes by what actually changed
 * (paying debt) or stays flat (an internal transfer). Never creates a
 * Transaction — This Month's recorded-spending figures are correctly
 * unaffected by a transfer (see computeThisMonthRecordedSummary/
 * computeMonthToDateActivity in monthlySummary.ts, neither of which reads
 * anything but data.transactions).
 *
 * Correction, 2026-08-10 — This Month round: pulled out as its own pure,
 * exported, directly-testable function (same rationale as every other
 * transition in this file — a production behaviour this important must be
 * exercisable against the exact code the app runs). Also fixed a confirmed
 * pre-existing defect: when the target liability is a credit card's
 * mirrored liability (`creditCardId` set), the matching
 * `CreditCard.currentBalance` is healed to the liability's own EXACT
 * resulting balance, not decremented from the card's own (possibly
 * already-stale) currentBalance.
 *
 * Correction round, 2026-08-10 (Move Money architecture correction) — two
 * further fixes, both CRITICAL:
 *
 * 1. Eligibility is now independently re-validated here against the exact
 *    same shared allowlist `TransferForm.tsx` uses to build its own
 *    chips (`LIQUID_BALANCE_TYPES`/`listEligibleDebtDestinations` in
 *    `moveMoneyEligibility.ts`) — the UI and this transition can never
 *    drift onto two different eligibility rules.
 *
 * 2. Every amount, stored balance, and resulting balance is handled in
 *    integer cents throughout — never `currentValue - amount` on raw
 *    decimal dollars. The requested amount is parsed through the existing
 *    strict `moneyAmountToCents` (rejects zero/negative/non-finite/
 *    over-precision); every stored balance this transition reads is
 *    converted through the existing zero-allowing `toBalanceCentsAllowingZero`
 *    (rejects NaN/Infinity/over-precision, but correctly allows an exact
 *    stored $0). A conversion failure on ANY side rejects with
 *    `invalid_recorded_balance` before any mutation. An amount that would
 *    overdraw the source, or a liability payment larger than what's
 *    recorded as owed, is rejected BEFORE mutation — never silently
 *    clamped via `Math.max(0, ...)`, which previously destroyed value by
 *    debiting the source in full while flooring the liability at zero (a
 *    confirmed, reachable net-worth-losing defect). Conversion back to a
 *    stored decimal-dollar value happens exactly once per touched record,
 *    at the point of constructing the new `assets`/`liabilities`/
 *    `creditCards` arrays — `wholeCents / 100`, never an intermediate
 *    floating add/subtract on a dollar value.
 */
export function transferFundsTransition(data: AppData, fromAssetId: string, to: TransferTarget, amount: number): TransferFundsResult {
  const parsedAmount = moneyAmountToCents(amount);
  if (!parsedAmount.valid) return { applied: false, data, reason: 'invalid_amount' };
  const requestedCents = parsedAmount.cents;

  const source = data.assets.find((a) => a.id === fromAssetId);
  if (!source) return { applied: false, data, reason: 'source_missing' };
  if (!isEligibleLiquidBalance(source)) return { applied: false, data, reason: 'source_not_eligible' };

  const sourceCents = toBalanceCentsAllowingZero(source.currentValue);
  if (sourceCents === undefined) return { applied: false, data, reason: 'invalid_recorded_balance', invalidBalanceSide: 'source' };

  if (to.kind === 'asset') {
    if (to.assetId === fromAssetId) return { applied: false, data, reason: 'same_balance' };
    const dest = data.assets.find((a) => a.id === to.assetId);
    if (!dest) return { applied: false, data, reason: 'destination_missing' };
    if (!isEligibleLiquidBalance(dest)) return { applied: false, data, reason: 'destination_not_eligible' };

    const destCents = toBalanceCentsAllowingZero(dest.currentValue);
    if (destCents === undefined) return { applied: false, data, reason: 'invalid_recorded_balance', invalidBalanceSide: 'destination' };

    if (requestedCents > sourceCents) return { applied: false, data, reason: 'insufficient_source' };

    const newSourceCents = sourceCents - requestedCents;
    const newDestCents = destCents + requestedCents;

    const assets = data.assets.map((a) =>
      a.id === fromAssetId
        ? { ...a, currentValue: newSourceCents / 100 }
        : a.id === to.assetId
        ? { ...a, currentValue: newDestCents / 100 }
        : a
    );
    return { applied: true, data: upsertNetWorthHistory({ ...data, assets }), effectiveAmountCents: requestedCents };
  }

  const target = data.liabilities.find((l) => l.id === to.liabilityId);
  if (!target) return { applied: false, data, reason: 'destination_missing' };
  if (!listEligibleDebtDestinations([target]).length) return { applied: false, data, reason: 'destination_not_eligible' };

  const liabilityCents = toBalanceCentsAllowingZero(target.currentBalance);
  if (liabilityCents === undefined) return { applied: false, data, reason: 'invalid_recorded_balance', invalidBalanceSide: 'liability' };

  if (requestedCents > sourceCents) return { applied: false, data, reason: 'insufficient_source' };
  if (requestedCents > liabilityCents) return { applied: false, data, reason: 'exceeds_liability_balance' };

  const newSourceCents = sourceCents - requestedCents;
  const resultingLiabilityCents = liabilityCents - requestedCents;

  const assets = data.assets.map((a) => (a.id === fromAssetId ? { ...a, currentValue: newSourceCents / 100 } : a));
  const liabilities = data.liabilities.map((l) =>
    l.id === to.liabilityId ? { ...l, currentBalance: resultingLiabilityCents / 100 } : l
  );
  const creditCards =
    target.creditCardId !== undefined
      ? data.creditCards.map((c) => (c.id === target.creditCardId ? { ...c, currentBalance: resultingLiabilityCents / 100 } : c))
      : data.creditCards;

  return {
    applied: true,
    data: upsertNetWorthHistory({ ...data, assets, liabilities, creditCards }),
    effectiveAmountCents: requestedCents,
  };
}

export type ConfirmBnplRepaymentInput = {
  liabilityId: string;
  recurringItemId: string;
  expectedNextDueDate: string;
  // Correction pass, 2026-08-09 — 'everyday' added, reusing the exact same
  // routed-spending source contract QuickAddModal's own expense flow
  // already uses (paymentSource + targetAssetId identifying one specific
  // account, never a default lookup — see computeBalanceEffect's existing
  // 'everyday' branch, unmodified and reused directly below).
  paymentSource: 'cash' | 'everyday' | 'credit_card';
  creditCardId?: string;
  targetAssetId?: string;
  transactionId: string;
  date: string;
};

export type ConfirmBnplRepaymentResult =
  | { applied: true; data: AppData; effectivePaymentCents: number; isPaidOff: boolean }
  | {
      applied: false;
      reason:
        | 'not_found'
        | 'missing_liability'
        | 'ambiguous_schedule'
        | 'stale'
        | 'already_confirmed'
        | 'invalid_date'
        | 'invalid_amount'
        | 'invalid_source'
        | 'balance_target_missing'
        | 'insufficient_source_balance';
    };

/**
 * The atomic BNPL repayment confirmation — mirrors
 * confirmRecurringOccurrenceTransition's own structure exactly (validate
 * fully before mutating; construct the whole result from one snapshot;
 * nothing above the "success path only from here" line ever mutates), with
 * two capabilities that function does not need: a coordinated SECOND
 * balance effect (the linked liability decreases, not just the funding
 * source), and an explicit insufficient-source-balance rejection (ordinary
 * recurring confirmation has never needed this, because nothing it funds
 * can be "not enough" in a way that should block confirmation outright —
 * applyEffectDelta's own floor was always considered an acceptable outcome
 * there; for BNPL it is not, per this round's explicit requirement).
 *
 * `effectivePaymentCents = min(scheduledOccurrenceCents, outstandingCents)`
 * is computed exactly once and reused, unmodified, for every one of: the
 * funding-source effect, the transaction amount, the liability reduction,
 * and the final-payoff determination — never re-derived independently for
 * any of the four.
 *
 * Engine-level duplicate protection: a stable `recurringOccurrenceKey`
 * (`${recurringItemId}:${item.nextDueDate}`) is checked directly against
 * `data.transactions` BEFORE any mutation — independent of whether the
 * schedule's own `nextDueDate` cursor still looks "not yet confirmed" (the
 * `stale` check below is the first, cheaper guard; this is the second,
 * ledger-based one that also catches a cursor that was somehow left
 * inconsistent with the transaction history, e.g. by a partial write that
 * predates this round's atomic single-persist guarantee).
 */
export function confirmBnplRepaymentTransition(data: AppData, input: ConfirmBnplRepaymentInput): ConfirmBnplRepaymentResult {
  const item = data.recurringItems.find((r) => r.id === input.recurringItemId);
  if (!item) return { applied: false, reason: 'not_found' };

  const liability = data.liabilities.find((l) => l.id === input.liabilityId);
  if (!liability || liability.type !== 'bnpl' || item.linkedLiabilityId !== liability.id) {
    return { applied: false, reason: 'missing_liability' };
  }

  const resolution = resolveBnplLinkedItems(data, liability.id);
  if (resolution.status === 'ambiguous') return { applied: false, reason: 'ambiguous_schedule' };
  if (resolution.status === 'none' || resolution.item.id !== item.id) return { applied: false, reason: 'missing_liability' };

  if (!isValidCanonicalDate(item.nextDueDate) || !isValidCanonicalDate(input.expectedNextDueDate)) {
    return { applied: false, reason: 'invalid_date' };
  }
  if (item.nextDueDate !== input.expectedNextDueDate) return { applied: false, reason: 'stale' };
  if (!isValidISOTimestamp(input.date)) return { applied: false, reason: 'invalid_date' };

  const occurrenceKey = `${item.id}:${item.nextDueDate}`;
  if (data.transactions.some((t) => t.recurringOccurrenceKey === occurrenceKey)) {
    return { applied: false, reason: 'already_confirmed' };
  }

  const scheduledCents = moneyAmountToCents(item.amount);
  if (!scheduledCents.valid) return { applied: false, reason: 'invalid_amount' };
  const outstandingCents = toBalanceCentsAllowingZero(liability.currentBalance);
  if (outstandingCents === undefined || outstandingCents <= 0) return { applied: false, reason: 'invalid_amount' };

  const effectivePaymentCents = Math.min(scheduledCents.cents, outstandingCents);

  let creditCardId: string | undefined;
  let targetAssetId: string | undefined;
  if (input.paymentSource === 'cash') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return { applied: false, reason: 'balance_target_missing' };
    const cashCents = toBalanceCentsAllowingZero(cashAsset.currentValue);
    if (cashCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (cashCents < effectivePaymentCents) return { applied: false, reason: 'insufficient_source_balance' };
  } else if (input.paymentSource === 'everyday') {
    // Same routed-spending contract computeBalanceEffect's own 'everyday'
    // branch requires: targetAssetId identifies ONE specific account,
    // never a default lookup — a missing id or a non-existent/non-everyday
    // account is balance_target_missing, exactly like credit_card without
    // creditCardId.
    if (!input.targetAssetId) return { applied: false, reason: 'invalid_source' };
    const account = data.assets.find((a) => a.id === input.targetAssetId && a.type === 'everyday');
    if (!account) return { applied: false, reason: 'balance_target_missing' };
    const accountCents = toBalanceCentsAllowingZero(account.currentValue);
    if (accountCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (accountCents < effectivePaymentCents) return { applied: false, reason: 'insufficient_source_balance' };
    targetAssetId = account.id;
  } else if (input.paymentSource === 'credit_card') {
    if (!input.creditCardId) return { applied: false, reason: 'invalid_source' };
    const card = data.creditCards.find((c) => c.id === input.creditCardId);
    if (!card) return { applied: false, reason: 'balance_target_missing' };
    creditCardId = card.id;
    // No floor concern for a credit card — applyEffectDelta never floors a
    // credit_card target (it may legitimately go negative, "in credit"),
    // so there is no insufficient-balance case to pre-check here.
  } else {
    return { applied: false, reason: 'invalid_source' };
  }

  // --- success path only from here; nothing above this line ever mutates. ---
  const transactionInput: Omit<Transaction, 'id'> = {
    type: 'expense',
    amount: effectivePaymentCents / 100,
    // Wave 9b — a BNPL instalment is a genuine specialised liability
    // repayment, established from STRUCTURED state alone before this point:
    // `liability.type === 'bnpl'`, `item.linkedLiabilityId === liability.id`,
    // and an unambiguous `resolveBnplLinkedItems` resolution. It was stamped
    // 'cat-other-expense', so a real debt repayment displayed as "Other" in
    // Transactions and in category lists.
    //
    // It now carries the SAME canonical id a loan and a credit-card
    // repayment already carry. This is a DISPLAY correction only: every
    // accounting resolver in repaymentAccounting.ts keys on the structured
    // `isRepayment` flag, the `isBnplLinkedTransaction` liability lookup, or
    // `isLoanRepayment` — and explicitly NEVER on `categoryId === 'cat-debt'`
    // (see that file's own doc comment). This transaction is already
    // excluded from aggregate spending, category coaching and recorded
    // cashflow through that lookup, and remains so, unchanged.
    categoryId: 'cat-debt',
    date: input.date,
    note: item.label,
    paymentSource: input.paymentSource,
    creditCardId,
    targetAssetId,
    recurringItemId: item.id,
    balanceEffect: 'update',
    recurringOccurrenceKey: occurrenceKey,
  };

  const withTransaction = applyNewTransaction(data, transactionInput, input.transactionId);
  const appended = withTransaction.transactions.find((t) => t.id === input.transactionId);
  if (!appended || appended.appliedBalanceEffect === undefined) {
    return { applied: false, reason: 'balance_target_missing' };
  }

  // The SECOND, liability-side effect — applied directly via the same
  // applyEffectDelta primitive every other balance mutation in this file
  // uses, never a re-implementation of its floor/actualDelta logic. Signed
  // negative (the liability's stored value decreases), the opposite
  // convention from computeBalanceEffect's existing 'loan' branch (a
  // loan-funded PURCHASE increases what's owed — an unrelated feature,
  // never reused here; see this round's implementation report for why).
  // effectivePaymentCents was already capped to outstandingCents above, so
  // this floor is mathematically guaranteed not to bind — actualDelta
  // always equals exactly -(effectivePaymentCents / 100).
  const { data: withLiabilityReduced } = applyEffectDelta(
    withTransaction,
    { targetKind: 'liability', targetId: liability.id, delta: -(effectivePaymentCents / 100) },
    1
  );

  const advance = advanceRecurringItemSchedule(item);
  const scheduleAnchorDay = resolveScheduleAnchorDay(item, advance);
  const isPaidOff = outstandingCents - effectivePaymentCents === 0;
  const updatedItem: RecurringItem = { ...item, nextDueDate: advance.nextDueDate, scheduleAnchorDay, active: !isPaidOff };

  const finalData: AppData = upsertNetWorthHistory({
    ...withLiabilityReduced,
    recurringItems: withLiabilityReduced.recurringItems.map((r) => (r.id === item.id ? updatedItem : r)),
  });

  return { applied: true, data: finalData, effectivePaymentCents, isPaidOff };
}

export type ReverseBnplRepaymentResult =
  | { applied: true; data: AppData }
  | { applied: false; reason: 'not_found' | 'not_a_bnpl_repayment' | 'missing_liability' | 'not_latest' };

/**
 * Correction pass, 2026-08-09 — root cause: `applyTransactionUpdate`/
 * `applyTransactionDelete` only ever reverse a transaction's OWN stored
 * `appliedBalanceEffect`, a SINGLE target (see their own doc comments —
 * unmodified, and correct for every transaction type that only ever
 * touches one balance). A BNPL repayment transaction is the one exception
 * in this codebase: confirmBnplRepaymentTransition deliberately applies a
 * SECOND effect (the linked liability decreasing) that is never recorded
 * on the transaction's own `appliedBalanceEffect` — see that function's
 * own doc comment for why (the generic `AppliedBalanceEffect` model is
 * single-target; widening it was judged out of this feature's authorised
 * scope). Routing a BNPL repayment through the generic delete/update path
 * would therefore reverse the source side only, silently leaving the
 * liability under-stated — the exact defect this function exists to
 * close, by providing a SEPARATE, BNPL-aware, fully atomic reversal that
 * QuickAddModal.tsx calls instead of deleteTransaction for this one
 * transaction shape (see its own handleDelete for the routing decision).
 *
 * Only ever reverses the LATEST confirmed repayment for its plan — never
 * silently rewinds the schedule through later repayments that may already
 * exist (an earlier repayment's own principal is already "inside" every
 * later repayment's own effectivePaymentCents computation, via the live
 * outstanding balance each one read at ITS OWN confirmation time; undoing
 * an earlier one without also undoing every later one would leave the
 * liability at a value inconsistent with what those later confirmations
 * actually computed against). "Latest" is derived from the stable
 * `recurringOccurrenceKey` embedded due-date, comparing every transaction
 * that shares this one's `recurringItemId` — never from transaction
 * insertion order or `date` (the confirmation date), which need not match
 * occurrence order.
 *
 * Reuses `applyEffectDelta` for BOTH the source-side reversal (identical
 * to the generic path's own single-target reversal) and the liability
 * increase — no new balance-mutation logic. Restores `nextDueDate` to the
 * exact due-date the deleted occurrence's own key encodes (its
 * `scheduleAnchorDay` was never touched by confirmation in the first
 * place — `resolveScheduleAnchorDay`'s own "internal automatic
 * advancement" rule always threads the item's existing anchor through
 * unchanged — so nothing needs restoring there). Removing the transaction
 * makes a second call against the resulting data fail at `not_found`,
 * which is the whole duplicate-reversal guard — no separate bookkeeping.
 */
/**
 * The exact due-date a transaction's `recurringOccurrenceKey` encodes —
 * sliced by the transaction's own `recurringItemId` prefix length rather
 * than split on ':' (an ISO timestamp's own time portion contains colons).
 * `undefined` for any transaction with no such key, or no recurringItemId
 * to derive the prefix length from. Shared by BOTH BNPL and loan
 * (mortgage/personal-loan/car-loan) repayments — final Pass 2D device-test
 * correction — since `recurringOccurrenceKey`'s format is identical for
 * both; which one a given transaction is gets disambiguated elsewhere (via
 * its linked liability's own `type`), never by this helper.
 */
function occurrenceKeyDueDate(t: Transaction): string | undefined {
  if (!t.recurringOccurrenceKey || !t.recurringItemId) return undefined;
  return t.recurringOccurrenceKey.slice(t.recurringItemId.length + 1);
}

/**
 * True only when `transactionId` is the chronologically LATEST confirmed
 * repayment sharing its own `recurringItemId` (compares every sibling
 * transaction with the same `recurringItemId` by their own encoded
 * occurrence due-date, never by array/insertion order or by `date`) — the
 * general form both `isLatestBnplRepaymentTransaction` and
 * `isLatestLoanRepaymentTransaction` delegate to (final Pass 2D device-test
 * correction; previously BNPL-only, generalised rather than duplicated).
 * `false` for anything with no `recurringOccurrenceKey` at all.
 */
function isLatestOccurrenceKeyTransaction(data: AppData, transactionId: string): boolean {
  const t = data.transactions.find((x) => x.id === transactionId);
  if (!t) return false;
  const dueDate = occurrenceKeyDueDate(t);
  if (!dueDate || !isValidCanonicalDate(dueDate)) return false;
  const siblingDueDates = data.transactions
    .filter((x) => x.recurringItemId === t.recurringItemId && !!x.recurringOccurrenceKey)
    .map((x) => occurrenceKeyDueDate(x))
    .filter((d): d is string => !!d);
  const latest = siblingDueDates.reduce((max, key) => (new Date(key).getTime() > new Date(max).getTime() ? key : max), dueDate);
  return new Date(latest).getTime() === new Date(dueDate).getTime();
}

/**
 * Exported so the UI (QuickAddModal's delete confirmation) can decide which
 * dialog variant to show BEFORE calling the reversal — reusing this exact
 * derivation rather than a second, potentially-drifting reimplementation.
 * `false` for anything that isn't a BNPL repayment transaction at all (see
 * `isBnplRepaymentTransaction` in QuickAddModal.tsx for that check).
 */
export function isLatestBnplRepaymentTransaction(data: AppData, transactionId: string): boolean {
  return isLatestOccurrenceKeyTransaction(data, transactionId);
}

/**
 * Loan (mortgage/personal-loan/car-loan) sibling of
 * isLatestBnplRepaymentTransaction — same contract, same shared derivation.
 * `false` for anything that isn't a loan repayment transaction at all (see
 * `isLoanRepaymentTransaction` in QuickAddModal.tsx for that check).
 */
export function isLatestLoanRepaymentTransaction(data: AppData, transactionId: string): boolean {
  return isLatestOccurrenceKeyTransaction(data, transactionId);
}

export function reverseBnplRepaymentTransaction(data: AppData, transactionId: string): ReverseBnplRepaymentResult {
  const t = data.transactions.find((x) => x.id === transactionId);
  if (!t) return { applied: false, reason: 'not_found' };
  if (!t.recurringOccurrenceKey || !t.recurringItemId) return { applied: false, reason: 'not_a_bnpl_repayment' };

  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item || !item.linkedLiabilityId) return { applied: false, reason: 'missing_liability' };
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  if (!liability || liability.type !== 'bnpl') return { applied: false, reason: 'missing_liability' };

  const restoredDueDate = occurrenceKeyDueDate(t);
  if (!restoredDueDate || !isValidCanonicalDate(restoredDueDate)) return { applied: false, reason: 'not_a_bnpl_repayment' };

  if (!isLatestBnplRepaymentTransaction(data, transactionId)) return { applied: false, reason: 'not_latest' };

  // --- success path only from here; nothing above this line ever mutates. ---
  const { data: withSourceReversed } = applyEffectDelta(data, t.appliedBalanceEffect, -1);
  const { data: withLiabilityRestored } = applyEffectDelta(
    withSourceReversed,
    { targetKind: 'liability', targetId: liability.id, delta: t.amount },
    1
  );
  const restoredItem: RecurringItem = { ...item, nextDueDate: restoredDueDate, active: true };

  const finalData: AppData = upsertNetWorthHistory({
    ...withLiabilityRestored,
    recurringItems: withLiabilityRestored.recurringItems.map((r) => (r.id === item.id ? restoredItem : r)),
    transactions: withLiabilityRestored.transactions.filter((x) => x.id !== transactionId),
  });

  return { applied: true, data: finalData };
}

export interface ConfirmCreditCardRepaymentInput {
  creditCardId: string;
  /** Dollars, strictly positive — validated via moneyAmountToCents, the
   * same exact-cent validator every other confirmed money amount in this
   * file uses. Zero, negative, NaN, or more than 2 decimal places are all
   * rejected as 'invalid_amount', never silently coerced. */
  amount: number;
  paymentSource: 'cash' | 'everyday';
  /** Required when paymentSource === 'everyday' — mirrors
   * confirmBnplRepaymentTransition's own 'everyday' contract exactly: one
   * specific, currently-existing Everyday Account, never a default. */
  targetAssetId?: string;
  /** Staleness guard, same shape as expectedNextDueDate elsewhere in this
   * file — the card's currentBalance the caller last observed. A second,
   * rapid confirmation (double-tap) reads dataRef.current fresh and sees
   * the first call's already-reduced balance, so this mismatches and the
   * second call is safely rejected as 'stale' rather than applying twice. */
  expectedCardBalance: number;
  /** Final Pass 2D device-test correction — set ONLY by the caller that
   * initiated this repayment from a specific `card_due_soon` Reminder
   * occurrence (the reminder's own `occurrenceDate`, truncated to a
   * `YYYY-MM-DD` date-key). When present, a successful confirmation stamps
   * `CreditCard.handledReminderOccurrenceDate` with this exact value, and
   * `Transaction.reminderOccurrenceCompleted` with the same value (so a
   * later reversal can restore it) — see both fields' own doc comments.
   * Absent for any repayment recorded without that specific Reminder
   * context, which never touches occurrence-handled state at all: this is
   * the whole mechanism that keeps "a repayment entered somewhere other
   * than the due Reminder" from silently completing an unrelated
   * occurrence — there is simply nothing to mark handled unless the caller
   * explicitly names one. */
  reminderOccurrenceDate?: string;
  transactionId: string;
  date: string;
}

export type ConfirmCreditCardRepaymentResult =
  | { applied: true; data: AppData }
  | {
      applied: false;
      reason:
        | 'not_found'
        | 'stale'
        | 'invalid_amount'
        | 'invalid_date'
        | 'invalid_source'
        | 'balance_target_missing'
        | 'insufficient_source_balance'
        | 'exceeds_balance';
    };

/**
 * Atomic credit-card repayment — device-test correction round. "Mark as
 * paid" previously only opened the generic Edit Credit Card form (a raw,
 * untracked balance overwrite, no transaction, no source-account effect —
 * see AddCreditCardModal.tsx). This is the dedicated, transaction-backed
 * repayment transition CreditCardRepaymentSheet.tsx calls instead: one
 * committed state change moving money from a real funding account to the
 * card, symmetric with confirmBnplRepaymentTransition's own two-target
 * shape (same applyNewTransaction + second applyEffectDelta pattern,
 * reused, not reinvented).
 *
 * Overpayment cap (final Pass 2D device-test correction — supersedes this
 * function's own original decision, which deliberately allowed an
 * uncapped overpayment): this dedicated MVP repayment flow must never
 * create a negative ("in credit") card balance, per an explicit product
 * decision. `applyEffectDelta`'s 'credit_card' branch itself still never
 * floors (unchanged — a card CAN legitimately go negative via other,
 * separately-accepted paths, e.g. the generic Edit Credit Card form), so
 * this is enforced here, as a pre-validation on `paymentCents` against the
 * card's own current balance, not by changing the shared effect engine.
 *
 * Occurrence-completion (final Pass 2D device-test correction — supersedes
 * this function's own original scope note, which is now out of date): a
 * successful repayment initiated from a specific `card_due_soon` Reminder
 * occurrence (`input.reminderOccurrenceDate` present) marks that exact
 * occurrence handled on the card (`CreditCard.handledReminderOccurrenceDate`)
 * and stamps the transaction (`Transaction.reminderOccurrenceCompleted`) so
 * a later full reversal can restore it — see both fields' own doc
 * comments. A repayment recorded without that context (the field absent)
 * never touches occurrence-handled state — see `reminderOccurrenceDate`'s
 * own doc comment for why this is safe by construction rather than an
 * unresolved ambiguity. Whether a PARTIAL payment should be treated
 * differently from a full one for occurrence-completion purposes was
 * explicitly decided this round: ANY successful repayment initiated from
 * the Reminder — full or partial — clears that occurrence, because a
 * partial payment is still a factual, completed action the customer took;
 * Navilo has no authoritative statement-balance data to judge whether it
 * was "enough," and the below-minimum warning (UI layer,
 * CreditCardRepaymentSheet.tsx) is the mechanism for surfacing that
 * concern before confirmation, not a silent non-completion afterward.
 */
export function confirmCreditCardRepaymentTransition(data: AppData, input: ConfirmCreditCardRepaymentInput): ConfirmCreditCardRepaymentResult {
  const card = data.creditCards.find((c) => c.id === input.creditCardId);
  if (!card) return { applied: false, reason: 'not_found' };
  if (card.currentBalance !== input.expectedCardBalance) return { applied: false, reason: 'stale' };
  if (!isValidISOTimestamp(input.date)) return { applied: false, reason: 'invalid_date' };

  const validatedAmount = moneyAmountToCents(input.amount);
  if (!validatedAmount.valid) return { applied: false, reason: 'invalid_amount' };
  const paymentCents = validatedAmount.cents;

  const balanceCents = toBalanceCentsAllowingZero(card.currentBalance);
  if (balanceCents === undefined) return { applied: false, reason: 'invalid_amount' };
  if (paymentCents > balanceCents) return { applied: false, reason: 'exceeds_balance' };

  let targetAssetId: string | undefined;
  if (input.paymentSource === 'cash') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return { applied: false, reason: 'balance_target_missing' };
    const cashCents = toBalanceCentsAllowingZero(cashAsset.currentValue);
    if (cashCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (cashCents < paymentCents) return { applied: false, reason: 'insufficient_source_balance' };
  } else if (input.paymentSource === 'everyday') {
    if (!input.targetAssetId) return { applied: false, reason: 'invalid_source' };
    const account = data.assets.find((a) => a.id === input.targetAssetId && a.type === 'everyday');
    if (!account) return { applied: false, reason: 'balance_target_missing' };
    const accountCents = toBalanceCentsAllowingZero(account.currentValue);
    if (accountCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (accountCents < paymentCents) return { applied: false, reason: 'insufficient_source_balance' };
    targetAssetId = account.id;
  } else {
    return { applied: false, reason: 'invalid_source' };
  }

  // --- success path only from here; nothing above this line ever mutates. ---
  const transactionInput: Omit<Transaction, 'id'> = {
    type: 'expense',
    amount: paymentCents / 100,
    // "Debt repayments" — the existing, real category (defaultCategories.ts),
    // never a fabricated new one; an honest label if this transaction is
    // ever viewed in Transactions/Spending Insights.
    categoryId: 'cat-debt',
    date: input.date,
    note: `${card.label} repayment`,
    paymentSource: input.paymentSource,
    targetAssetId,
    // The DESTINATION card — see Transaction.creditCardId's own doc
    // comment for why a repayment reuses this field for the opposite
    // role a card-funded purchase uses it for (paymentSource distinguishes
    // the two: 'credit_card' means charged-to, isRepayment+creditCardId
    // means repaid-to).
    creditCardId: card.id,
    balanceEffect: 'update',
    isRepayment: true,
    reminderOccurrenceCompleted: input.reminderOccurrenceDate,
  };

  const withTransaction = applyNewTransaction(data, transactionInput, input.transactionId);
  const appended = withTransaction.transactions.find((t) => t.id === input.transactionId);
  if (!appended || appended.appliedBalanceEffect === undefined) {
    return { applied: false, reason: 'balance_target_missing' };
  }

  // The second, card-side effect — reuses the exact same
  // applyEffectDelta('credit_card', ...) branch a card-funded PURCHASE
  // already uses (computeBalanceEffect's own 'credit_card' branch), just
  // with the opposite sign: a repayment DECREASES what's owed, a purchase
  // increases it. upsertCreditCardLiability (inside applyEffectDelta)
  // keeps the mirrored Liability record in sync automatically, exactly as
  // it already does for every other credit-card balance mutation.
  const { data: withCardReduced } = applyEffectDelta(
    withTransaction,
    { targetKind: 'credit_card', targetId: card.id, delta: -(paymentCents / 100) },
    1
  );

  // Occurrence-completion stamp — only when this repayment was initiated
  // from a specific Reminder occurrence (see reminderOccurrenceDate's own
  // doc comment). Applied to the card's LATEST record inside
  // withCardReduced (post-upsertCreditCardLiability), never a stale
  // reference to `card` captured before the effect above.
  let withOccurrenceHandled = withCardReduced;
  if (input.reminderOccurrenceDate) {
    withOccurrenceHandled = {
      ...withCardReduced,
      creditCards: withCardReduced.creditCards.map((c) =>
        c.id === card.id ? { ...c, handledReminderOccurrenceDate: input.reminderOccurrenceDate } : c
      ),
    };
  }

  const finalData = upsertNetWorthHistory(withOccurrenceHandled);
  return { applied: true, data: finalData };
}

export type ReverseCreditCardRepaymentResult =
  | { applied: true; data: AppData }
  | { applied: false; reason: 'not_found' | 'not_a_credit_card_repayment' | 'missing_card' };

/**
 * Atomic reversal — mirrors reverseBnplRepaymentTransaction's own
 * contract: the generic applyTransactionDelete only ever reverses a
 * transaction's own single-target appliedBalanceEffect (the funding-asset
 * side here), which would silently leave the card's balance under-stated
 * by the same amount confirmCreditCardRepaymentTransition's second effect
 * applied. This restores BOTH sides atomically instead — the funding side
 * via the transaction's own stored appliedBalanceEffect snapshot (same
 * post-floor-exact convention every other reversal in this file uses),
 * and the card side via t.creditCardId (the repayment's DESTINATION,
 * stored precisely so this lookup never has to guess) plus t.amount (the
 * exact cents originally moved). No "latest only" restriction (unlike
 * BNPL): an ordinary credit card has no repayment schedule/occurrence
 * chain whose consistency a specific reversal could break — each
 * repayment is an independent event, safe to reverse on its own
 * regardless of any other repayment made before or after it.
 */
export function reverseCreditCardRepaymentTransaction(data: AppData, transactionId: string): ReverseCreditCardRepaymentResult {
  const t = data.transactions.find((x) => x.id === transactionId);
  if (!t) return { applied: false, reason: 'not_found' };
  if (!t.isRepayment || !t.creditCardId) return { applied: false, reason: 'not_a_credit_card_repayment' };

  const card = data.creditCards.find((c) => c.id === t.creditCardId);
  if (!card) return { applied: false, reason: 'missing_card' };

  // --- success path only from here; nothing above this line ever mutates. ---
  const { data: withSourceReversed } = applyEffectDelta(data, t.appliedBalanceEffect, -1);
  const { data: withCardRestored } = applyEffectDelta(
    withSourceReversed,
    { targetKind: 'credit_card', targetId: card.id, delta: t.amount },
    1
  );

  // Restore the Reminder occurrence this repayment completed — only when
  // it actually completed one (t.reminderOccurrenceCompleted set), and only
  // when the card's stamp still matches this exact transaction's value
  // (never clobbering a DIFFERENT, later completion that may have already
  // superseded it — "unless another valid completion already covers it").
  let withOccurrenceRestored = withCardRestored;
  if (t.reminderOccurrenceCompleted) {
    withOccurrenceRestored = {
      ...withCardRestored,
      creditCards: withCardRestored.creditCards.map((c) =>
        c.id === card.id && c.handledReminderOccurrenceDate === t.reminderOccurrenceCompleted
          ? { ...c, handledReminderOccurrenceDate: undefined }
          : c
      ),
    };
  }

  const finalData: AppData = upsertNetWorthHistory({
    ...withOccurrenceRestored,
    transactions: withOccurrenceRestored.transactions.filter((x) => x.id !== transactionId),
  });

  return { applied: true, data: finalData };
}

/** Liability types this round's dedicated repayment flow covers — every
 * amortising-loan type EXCEPT credit_card (its own separate, already-built
 * engine above) and bnpl (its own separate, already-built engine). */
const LOAN_REPAYMENT_LIABILITY_TYPES: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];

export interface ConfirmLoanRepaymentInput {
  recurringItemId: string;
  liabilityId: string;
  expectedNextDueDate: string;
  /** Dollars, strictly positive — the TOTAL amount actually paid, validated
   * via the same moneyAmountToCents every other confirmed money amount in
   * this file uses. */
  amount: number;
  paymentSource: 'cash' | 'everyday';
  targetAssetId?: string;
  /** Whether the customer opted in to "Update my recorded loan balance" —
   * see this input's own `newBalance` field and confirmLoanRepaymentTransition's
   * doc comment for the full contract. */
  updateBalance: boolean;
  /** Required, and only meaningful, when updateBalance is true — the
   * recorded balance AFTER this payment, as entered by the customer. Never
   * inferred from a rate/amortisation schedule. */
  newBalance?: number;
  /** Staleness guard for the liability's own recorded balance — mirrors
   * `expectedCardBalance` in ConfirmCreditCardRepaymentInput exactly. */
  expectedCurrentBalance: number;
  transactionId: string;
  date: string;
}

export type ConfirmLoanRepaymentResult =
  | { applied: true; data: AppData; principalAmount?: number }
  | {
      applied: false;
      reason:
        | 'not_found'
        | 'missing_liability'
        | 'wrong_type'
        | 'stale'
        | 'stale_balance'
        | 'already_confirmed'
        | 'invalid_date'
        | 'invalid_amount'
        | 'invalid_balance'
        | 'invalid_principal'
        | 'invalid_source'
        | 'balance_target_missing'
        | 'insufficient_source_balance';
    };

/**
 * The atomic mortgage/personal-loan/car-loan repayment confirmation —
 * final Pass 2D device-test correction, item 2. Mirrors
 * confirmBnplRepaymentTransition's own shape closely (same "validate fully
 * before mutating," same reused `recurringOccurrenceKey` duplicate-
 * confirmation ledger check, same two-target atomic effect pattern), but
 * is a SEPARATE function — never merged into one undifferentiated
 * mutation with BNPL/credit-card repayment, per this round's explicit
 * instruction, because the three have genuinely different accounting
 * contracts (BNPL always reduces its liability by the full effective
 * payment; a credit-card repayment always reduces its liability by the
 * full payment; a loan repayment's liability effect is OPTIONAL and, when
 * elected, is a customer-ENTERED principal figure, never derived from the
 * payment amount itself).
 *
 * Occurrence identity/completion reuses the exact same mechanism ordinary
 * bills already have — this liability's one linked RecurringItem
 * (`item.linkedLiabilityId`, enforced 1:1 by `upsertLinkedRecurringItem`)
 * advances its own `nextDueDate` on confirmation, exactly like
 * confirmRecurringOccurrenceTransition already does for a plain bill. This
 * is a genuinely small extension of existing Reminder-completion state,
 * not a new persistence framework — the one addition, `recurringOccurrenceKey`
 * (borrowed unmodified from BNPL), exists solely so a reversal can restore
 * the exact due-date that was confirmed, the same way BNPL's own reversal
 * already does.
 *
 * Balance-update contract: when `input.updateBalance` is false, this
 * behaves exactly like an ordinary confirmed bill — the funding account is
 * debited, a transaction is recorded, and `Liability.currentBalance` is
 * left completely untouched (no principal/interest split is invented).
 * When true, `input.newBalance` must be a real number between 0 and the
 * liability's current recorded balance (a repayment can never legitimately
 * INCREASE what's owed in this MVP flow — no capitalised-interest contract
 * exists anywhere in this codebase to justify allowing that); the derived
 * principal (`previousBalance - newBalance`) must itself be between $0 and
 * the total amount paid (rejected as 'invalid_principal' otherwise — a
 * loan repayment can never reduce the liability by MORE than was actually
 * paid). The derived principal is the only KNOWN split ever recorded
 * (`Transaction.principalAmount`); the remaining payment (if any) is never
 * separately typed/stored as "interest" — it is simply `amount - principalAmount`,
 * derivable by any consumer that needs it, so nothing is inferred that
 * wasn't entered.
 */
export function confirmLoanRepaymentTransition(data: AppData, input: ConfirmLoanRepaymentInput): ConfirmLoanRepaymentResult {
  const item = data.recurringItems.find((r) => r.id === input.recurringItemId);
  if (!item) return { applied: false, reason: 'not_found' };

  const liability = data.liabilities.find((l) => l.id === input.liabilityId);
  if (!liability || item.linkedLiabilityId !== liability.id) return { applied: false, reason: 'missing_liability' };
  if (!LOAN_REPAYMENT_LIABILITY_TYPES.includes(liability.type)) return { applied: false, reason: 'wrong_type' };

  if (!isValidCanonicalDate(item.nextDueDate) || !isValidCanonicalDate(input.expectedNextDueDate)) {
    return { applied: false, reason: 'invalid_date' };
  }
  if (item.nextDueDate !== input.expectedNextDueDate) return { applied: false, reason: 'stale' };
  if (!isValidISOTimestamp(input.date)) return { applied: false, reason: 'invalid_date' };
  if (liability.currentBalance !== input.expectedCurrentBalance) return { applied: false, reason: 'stale_balance' };

  const occurrenceKey = `${item.id}:${item.nextDueDate}`;
  if (data.transactions.some((t) => t.recurringOccurrenceKey === occurrenceKey)) {
    return { applied: false, reason: 'already_confirmed' };
  }

  const validatedAmount = moneyAmountToCents(input.amount);
  if (!validatedAmount.valid) return { applied: false, reason: 'invalid_amount' };
  const paymentCents = validatedAmount.cents;

  let principalCents: number | undefined;
  if (input.updateBalance) {
    if (typeof input.newBalance !== 'number' || !Number.isFinite(input.newBalance) || input.newBalance < 0) {
      return { applied: false, reason: 'invalid_balance' };
    }
    const oldBalanceCents = Math.round(liability.currentBalance * 100);
    const newBalanceCents = Math.round(input.newBalance * 100);
    // Never allow an ordinary repayment to increase the recorded balance —
    // no capitalised-interest contract is separately accepted anywhere in
    // this codebase (Agent investigation, this round: no principal/interest
    // split concept exists against any real tracked liability at all).
    if (newBalanceCents > oldBalanceCents) return { applied: false, reason: 'invalid_balance' };
    principalCents = oldBalanceCents - newBalanceCents;
    if (principalCents < 0 || principalCents > paymentCents) return { applied: false, reason: 'invalid_principal' };
  }

  let targetAssetId: string | undefined;
  if (input.paymentSource === 'cash') {
    const cashAsset = data.assets.find((a) => a.type === 'cash');
    if (!cashAsset) return { applied: false, reason: 'balance_target_missing' };
    const cashCents = toBalanceCentsAllowingZero(cashAsset.currentValue);
    if (cashCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (cashCents < paymentCents) return { applied: false, reason: 'insufficient_source_balance' };
  } else if (input.paymentSource === 'everyday') {
    if (!input.targetAssetId) return { applied: false, reason: 'invalid_source' };
    const account = data.assets.find((a) => a.id === input.targetAssetId && a.type === 'everyday');
    if (!account) return { applied: false, reason: 'balance_target_missing' };
    const accountCents = toBalanceCentsAllowingZero(account.currentValue);
    if (accountCents === undefined) return { applied: false, reason: 'balance_target_missing' };
    if (accountCents < paymentCents) return { applied: false, reason: 'insufficient_source_balance' };
    targetAssetId = account.id;
  } else {
    return { applied: false, reason: 'invalid_source' };
  }

  // --- success path only from here; nothing above this line ever mutates. ---
  const transactionInput: Omit<Transaction, 'id'> = {
    type: 'expense',
    amount: paymentCents / 100,
    categoryId: 'cat-debt',
    date: input.date,
    note: `${liability.label} repayment`,
    paymentSource: input.paymentSource,
    targetAssetId,
    recurringItemId: item.id,
    recurringOccurrenceKey: occurrenceKey,
    balanceEffect: 'update',
    principalAmount: principalCents !== undefined ? principalCents / 100 : undefined,
    isLoanRepayment: true,
  };

  const withTransaction = applyNewTransaction(data, transactionInput, input.transactionId);
  const appended = withTransaction.transactions.find((t) => t.id === input.transactionId);
  if (!appended || appended.appliedBalanceEffect === undefined) {
    return { applied: false, reason: 'balance_target_missing' };
  }

  // The second, liability-side effect — applied only when a known
  // principal reduction exists (a $0 known-interest-only payment correctly
  // applies no effect at all, since there is nothing to reduce). Reuses the
  // exact same applyEffectDelta('liability', ...) primitive BNPL's own
  // second effect uses, never a re-implementation of its floor/actualDelta
  // logic. `principalCents` was already validated <= the liability's own
  // current balance above, so this floor is mathematically guaranteed not
  // to bind.
  let withLiabilityMaybeReduced = withTransaction;
  if (principalCents !== undefined && principalCents > 0) {
    const { data: reduced } = applyEffectDelta(
      withTransaction,
      { targetKind: 'liability', targetId: liability.id, delta: -(principalCents / 100) },
      1
    );
    withLiabilityMaybeReduced = reduced;
  }

  const advance = advanceRecurringItemSchedule(item);
  const scheduleAnchorDay = resolveScheduleAnchorDay(item, advance);
  const updatedItem: RecurringItem = { ...item, nextDueDate: advance.nextDueDate, scheduleAnchorDay };

  const finalData: AppData = upsertNetWorthHistory({
    ...withLiabilityMaybeReduced,
    recurringItems: withLiabilityMaybeReduced.recurringItems.map((r) => (r.id === item.id ? updatedItem : r)),
  });

  return { applied: true, data: finalData, principalAmount: principalCents !== undefined ? principalCents / 100 : undefined };
}

export type ReverseLoanRepaymentResult =
  | { applied: true; data: AppData }
  | { applied: false; reason: 'not_found' | 'not_a_loan_repayment' | 'missing_liability' | 'not_latest' };

/**
 * Atomic reversal — mirrors reverseBnplRepaymentTransaction's own contract
 * exactly, including the same "only the latest confirmed repayment on this
 * liability is safe to fully reverse" restriction and the same reasoning
 * (an earlier repayment's principal can't be reconstructed once a later
 * repayment has already moved the schedule/balance forward from it).
 * Restores the funding side via the transaction's own stored
 * appliedBalanceEffect snapshot, the liability side via
 * `t.principalAmount` (only when it was actually known/applied — a
 * repayment recorded without updating the balance has nothing to restore
 * there, exactly mirroring how it had nothing to reduce), and the
 * Reminder occurrence via `RecurringItem.nextDueDate` (restored to the
 * exact due-date `t.recurringOccurrenceKey` encodes) — satisfying "restore
 * the associated current Reminder when appropriate... and leave future
 * recurring occurrences intact" (there are none here to disturb: this is
 * the only occurrence being restored).
 */
export function reverseLoanRepaymentTransaction(data: AppData, transactionId: string): ReverseLoanRepaymentResult {
  const t = data.transactions.find((x) => x.id === transactionId);
  if (!t) return { applied: false, reason: 'not_found' };
  if (!t.recurringOccurrenceKey || !t.recurringItemId) return { applied: false, reason: 'not_a_loan_repayment' };

  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item || !item.linkedLiabilityId) return { applied: false, reason: 'missing_liability' };
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  if (!liability || !LOAN_REPAYMENT_LIABILITY_TYPES.includes(liability.type)) {
    return { applied: false, reason: 'missing_liability' };
  }

  const restoredDueDate = occurrenceKeyDueDate(t);
  if (!restoredDueDate || !isValidCanonicalDate(restoredDueDate)) return { applied: false, reason: 'not_a_loan_repayment' };

  if (!isLatestLoanRepaymentTransaction(data, transactionId)) return { applied: false, reason: 'not_latest' };

  // --- success path only from here; nothing above this line ever mutates. ---
  const { data: withSourceReversed } = applyEffectDelta(data, t.appliedBalanceEffect, -1);
  let withLiabilityRestored = withSourceReversed;
  if (typeof t.principalAmount === 'number' && t.principalAmount > 0) {
    const { data: restored } = applyEffectDelta(
      withSourceReversed,
      { targetKind: 'liability', targetId: liability.id, delta: t.principalAmount },
      1
    );
    withLiabilityRestored = restored;
  }

  const restoredItem: RecurringItem = { ...item, nextDueDate: restoredDueDate };
  const finalData: AppData = upsertNetWorthHistory({
    ...withLiabilityRestored,
    recurringItems: withLiabilityRestored.recurringItems.map((r) => (r.id === item.id ? restoredItem : r)),
    transactions: withLiabilityRestored.transactions.filter((x) => x.id !== transactionId),
  });

  return { applied: true, data: finalData };
}

export type ReverseRecurringOccurrenceResult =
  | { applied: true; data: AppData }
  | { applied: false; reason: 'not_found' | 'not_a_recurring_occurrence' | 'not_latest' };

/**
 * Final narrow Pass 2D correction, item 3 — an ordinary confirmed bill
 * occurrence never had a dedicated reversal before this: the generic
 * `applyTransactionDelete` only ever reverses the transaction's own
 * `appliedBalanceEffect` (the funding side), never restoring
 * `RecurringItem.nextDueDate` — so a full "Delete & reverse" left the
 * schedule advanced forever, and the Reminder for that occurrence never
 * came back. This closes that gap using the exact same reused pattern
 * BNPL/loan repayment reversal already established: a stable
 * `recurringOccurrenceKey` (now stamped by confirmRecurringOccurrenceTransition
 * for expense confirmations only — see that function's own doc comment),
 * the SAME shared `isLatestOccurrenceKeyTransaction` "only the latest is
 * safe to restore" guard (so a later, still-standing completion is never
 * silently overwritten), and the SAME shared `occurrenceKeyDueDate`
 * extraction.
 *
 * Deliberately REJECTS (`not_a_recurring_occurrence`) whenever the linked
 * RecurringItem has a `linkedLiabilityId` — that is always BNPL's or a
 * loan's own domain (their dedicated reversal functions additionally
 * restore a liability-side effect this function knows nothing about);
 * this function only ever reverses a plain bill's single funding-side
 * effect, exactly like the generic path it replaces for this one case.
 *
 * A transaction with no `recurringOccurrenceKey` at all (either a manual
 * transaction, or a bill confirmed by an older build before this field
 * existed on ordinary bills) is safely rejected the same way — such a
 * transaction keeps using the unmodified generic `applyTransactionDelete`
 * path exactly as it always has; this function is purely additive, never
 * a replacement for that existing, still-correct behaviour.
 */
export function reverseRecurringOccurrenceTransaction(data: AppData, transactionId: string): ReverseRecurringOccurrenceResult {
  const t = data.transactions.find((x) => x.id === transactionId);
  if (!t) return { applied: false, reason: 'not_found' };
  if (!t.recurringOccurrenceKey || !t.recurringItemId) return { applied: false, reason: 'not_a_recurring_occurrence' };

  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item) return { applied: false, reason: 'not_a_recurring_occurrence' };
  if (item.linkedLiabilityId) return { applied: false, reason: 'not_a_recurring_occurrence' };

  const restoredDueDate = occurrenceKeyDueDate(t);
  if (!restoredDueDate || !isValidCanonicalDate(restoredDueDate)) return { applied: false, reason: 'not_a_recurring_occurrence' };

  if (!isLatestRecurringOccurrenceTransaction(data, transactionId)) return { applied: false, reason: 'not_latest' };

  // --- success path only from here; nothing above this line ever mutates. ---
  const reverted =
    t.balanceEffect === undefined ? legacyApplyTransactionEffect(data, t, -1) : applyEffectDelta(data, t.appliedBalanceEffect, -1).data;

  const restoredItem: RecurringItem = { ...item, nextDueDate: restoredDueDate };
  const finalData: AppData = upsertNetWorthHistory({
    ...reverted,
    recurringItems: reverted.recurringItems.map((r) => (r.id === item.id ? restoredItem : r)),
    transactions: reverted.transactions.filter((x) => x.id !== transactionId),
  });

  return { applied: true, data: finalData };
}

/**
 * Ordinary-bill sibling of isLatestBnplRepaymentTransaction/
 * isLatestLoanRepaymentTransaction — same shared derivation, same
 * contract. `false` for anything that isn't a recurring-occurrence
 * transaction at all.
 */
export function isLatestRecurringOccurrenceTransaction(data: AppData, transactionId: string): boolean {
  return isLatestOccurrenceKeyTransaction(data, transactionId);
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
    targetAssetId?: string;
    creditCardId?: string;
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
  /** Applies every included/excluded toggle from one Select Balances Save in
   * a single persisted transition, reading dataRef.current (not the closed-
   * over `data`) so it composes correctly with any other change already
   * committed this tick. Exists because looping plain updateAsset() calls —
   * each closing over the same pre-loop `data` — silently drops all but the
   * last change in a multi-account save (correction, 2026-08-10 review). */
  updateAssetsIncludeInMoney: (updates: { id: string; included: boolean }[]) => void;
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
  /** Atomic create-or-edit for a BNPL plan and its optional linked
   * repayment schedule — see saveBnplPlanTransition's own doc comment for
   * the full contract. Reads dataRef.current, same rationale as
   * updateLiability/linkBillToLiability above. */
  saveBnplPlan: (input: SaveBnplPlanInput) => SaveBnplPlanResult;
  /** Atomic BNPL repayment confirmation — see confirmBnplRepaymentTransition's
   * own doc comment. transactionId/date are generated exactly once here,
   * never inside the pure transition, mirroring confirmRecurringOccurrence's
   * own established contract. Reminder queue correction round — additively
   * returns transactionId, mirroring confirmLoanRepayment/
   * confirmCreditCardRepayment's own established contract. */
  confirmBnplRepayment: (
    input: Omit<ConfirmBnplRepaymentInput, 'transactionId' | 'date'>
  ) => { transition: ConfirmBnplRepaymentResult; persistence: Promise<void>; transactionId: string };
  /** Correction pass — atomic reversal of the latest confirmed BNPL
   * repayment transaction. See reverseBnplRepaymentTransaction's own doc
   * comment for the full contract. Reads dataRef.current, same rationale
   * as confirmBnplRepayment above; one persist() call. */
  reverseBnplRepayment: (transactionId: string) => ReverseBnplRepaymentResult;
  /** Atomic credit-card repayment confirmation — device-test correction
   * round. See confirmCreditCardRepaymentTransition's own doc comment.
   * transactionId/date generated exactly once here, mirroring
   * confirmBnplRepayment's own established contract. */
  confirmCreditCardRepayment: (
    input: Omit<ConfirmCreditCardRepaymentInput, 'transactionId' | 'date'>
  ) => { transition: ConfirmCreditCardRepaymentResult; persistence: Promise<void>; transactionId: string };
  /** Atomic reversal of a confirmed credit-card repayment transaction. See
   * reverseCreditCardRepaymentTransaction's own doc comment. Reads
   * dataRef.current, same rationale as confirmCreditCardRepayment above;
   * one persist() call. */
  reverseCreditCardRepayment: (transactionId: string) => ReverseCreditCardRepaymentResult;
  /** Atomic mortgage/personal-loan/car-loan repayment confirmation — final
   * Pass 2D device-test correction. See confirmLoanRepaymentTransition's
   * own doc comment. transactionId/date generated exactly once here,
   * mirroring confirmBnplRepayment/confirmCreditCardRepayment's own
   * established contract. */
  confirmLoanRepayment: (
    input: Omit<ConfirmLoanRepaymentInput, 'transactionId' | 'date'>
  ) => { transition: ConfirmLoanRepaymentResult; persistence: Promise<void>; transactionId: string };
  /** Atomic reversal of a confirmed loan repayment transaction. See
   * reverseLoanRepaymentTransaction's own doc comment. Reads
   * dataRef.current, same rationale as confirmLoanRepayment above; one
   * persist() call. */
  reverseLoanRepayment: (transactionId: string) => ReverseLoanRepaymentResult;
  /** 2D-NARROW correction — atomic reversal of an ordinary occurrence-tracked
   * bill transaction, restoring its exact handled Reminder occurrence when
   * safe. See reverseRecurringOccurrenceTransaction's own doc comment for
   * the full contract (rejects BNPL/loan transactions, which route through
   * their own dedicated reverse functions above). Reads dataRef.current,
   * same rationale as reverseLoanRepayment above; one persist() call. */
  reverseRecurringOccurrence: (transactionId: string) => ReverseRecurringOccurrenceResult;
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
  transferFunds: (fromAssetId: string, to: TransferTarget, amount: number) => TransferFundsResult;
  addSavingsComparison: (entry: Omit<SavingsComparisonEntry, 'id'>) => void;
  updateSavingsComparison: (id: string, patch: Partial<Omit<SavingsComparisonEntry, 'id'>>) => void;
  deleteSavingsComparison: (id: string) => void;
  markAchievementsSeen: (ids: string[]) => void;
  /**
   * Design 5.1 Wave 6 — hide ONE reminder occurrence until a local calendar
   * day. Records nothing financial: no transaction, no balance change, no
   * occurrence resolution. The underlying bill stays an upcoming commitment
   * everywhere it already was, and every future recurrence is untouched
   * (a later occurrence has a different key).
   */
  snoozeReminderOccurrence: (occurrenceKey: string, returnOn: string, today?: Date) => void;
  /**
   * Design 5.1 Wave 6 — permanently hide ONE reminder occurrence. Same
   * non-financial contract as snooze: it does not mark anything paid,
   * delete a bill, delete a transaction, or stop future reminders.
   */
  dismissReminderOccurrence: (occurrenceKey: string, today?: Date) => void;
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
    (input: {
      recurringItemId: string;
      expectedNextDueDate: string;
      paymentSource?: PaymentSource;
      targetAssetId?: string;
      creditCardId?: string;
    }): ConfirmationCommitResult => {
      const transactionId = generateId();
      const date = new Date().toISOString();
      const transition = confirmRecurringOccurrenceTransition(dataRef.current, { ...input, transactionId, date });
      if (!transition.applied) return { transition, persistence: Promise.resolve(), transactionId };
      const persistence = persist(transition.data);
      return { transition, persistence, transactionId };
    },
    [persist]
  );

  // Correction, 2026-08-10 review: a brand-new recurring item's id has never
  // existed before this call, so there is no external "staleness" concept to
  // guard against the way confirmRecurringOccurrence guards against
  // re-confirming an already-advanced item. But the internal duplicate guard
  // (hasRecurringItemOccurrenceRecorded, inside
  // createRecurringIncomeWithMidCycleOccurrence) can only see a prior call's
  // effect if it's given that prior call's actual committed result. Reading
  // the closed-over `data` — as this previously did — hands every
  // synchronous call in the same render the SAME pre-mutation snapshot, so a
  // genuine double-tap (both taps dispatched before React re-renders, which
  // also stales the presentation-level `midCycleSubmitting` guard in
  // AddIncomeModal.tsx the same way) would let the duplicate guard see no
  // prior occurrence twice and double-apply. Reading dataRef.current instead
  // — the exact pattern confirmRecurringOccurrence already uses below —
  // fixes this: commitData (inside persist) writes dataRef.current
  // synchronously before returning, so a second synchronous call always sees
  // the first call's already-recorded occurrence and is correctly rejected
  // as a no-op by the existing, unmodified duplicate-identity guard.
  const addRecurringIncomeWithMidCycleOccurrence = useCallback(
    (itemInput: Omit<RecurringItem, 'id'>, recurringItemId: string, choice: MidCycleIncomeOccurrenceChoice, precedingOccurrenceDate: string) => {
      const transactionId = generateId();
      const next = createRecurringIncomeWithMidCycleOccurrence(dataRef.current, itemInput, recurringItemId, choice, precedingOccurrenceDate, transactionId);
      persist(next);
    },
    [persist]
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

  // Thin wrapper over the pure, exported applyAssetsIncludeInMoneyUpdate —
  // reads dataRef.current (not the closed-over `data`), same established
  // pattern confirmRecurringOccurrence uses, so a call fired immediately
  // after another one in the same handler never derives its result from a
  // stale render closure.
  const updateAssetsIncludeInMoney = useCallback(
    (updates: { id: string; included: boolean }[]) => {
      if (updates.length === 0) return;
      persist(upsertNetWorthHistory(applyAssetsIncludeInMoneyUpdate(dataRef.current, updates)));
    },
    [persist]
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
      persist(deleteLiabilityTransition(data, id));
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

  const saveBnplPlan = useCallback(
    (input: SaveBnplPlanInput): SaveBnplPlanResult => {
      const result = saveBnplPlanTransition(dataRef.current, input);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  // Mirrors confirmRecurringOccurrence's own contract exactly: reads
  // dataRef.current (not the closed-over `data`), generates transactionId/
  // date exactly once here, and only calls persist() when the transition
  // actually applied — a rejected result never touches storage.
  const confirmBnplRepayment = useCallback(
    (input: Omit<ConfirmBnplRepaymentInput, 'transactionId' | 'date'>): { transition: ConfirmBnplRepaymentResult; persistence: Promise<void>; transactionId: string } => {
      const transactionId = generateId();
      const date = new Date().toISOString();
      const transition = confirmBnplRepaymentTransition(dataRef.current, { ...input, transactionId, date });
      if (!transition.applied) return { transition, persistence: Promise.resolve(), transactionId };
      const persistence = persist(transition.data);
      return { transition, persistence, transactionId };
    },
    [persist]
  );

  // Correction pass — mirrors confirmBnplRepayment's own contract: reads
  // dataRef.current, one persist() call, only on the success path.
  const reverseBnplRepayment = useCallback(
    (transactionId: string): ReverseBnplRepaymentResult => {
      const result = reverseBnplRepaymentTransaction(dataRef.current, transactionId);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  // Device-test correction round — mirrors confirmBnplRepayment's own
  // contract exactly: reads dataRef.current fresh, transactionId/date
  // generated exactly once here, one persist() call, only on the success
  // path.
  const confirmCreditCardRepayment = useCallback(
    (
      input: Omit<ConfirmCreditCardRepaymentInput, 'transactionId' | 'date'>
    ): { transition: ConfirmCreditCardRepaymentResult; persistence: Promise<void>; transactionId: string } => {
      const transactionId = generateId();
      const date = new Date().toISOString();
      const transition = confirmCreditCardRepaymentTransition(dataRef.current, { ...input, transactionId, date });
      if (!transition.applied) return { transition, persistence: Promise.resolve(), transactionId };
      const persistence = persist(transition.data);
      // Final Pass 2D device-test correction (native-Modal-lifecycle round)
      // — also returns the transactionId this call itself generated, so a
      // caller's own interaction-lifecycle state machine can carry the REAL
      // id in its 'completed' result (never a synthetic/placeholder one),
      // without needing a second lookup. Purely additive — every existing
      // caller destructuring only `{ transition }` is unaffected.
      return { transition, persistence, transactionId };
    },
    [persist]
  );

  // Mirrors reverseBnplRepayment's own contract: reads dataRef.current,
  // one persist() call, only on the success path.
  const reverseCreditCardRepayment = useCallback(
    (transactionId: string): ReverseCreditCardRepaymentResult => {
      const result = reverseCreditCardRepaymentTransaction(dataRef.current, transactionId);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  // Final Pass 2D device-test correction — mirrors confirmBnplRepayment's
  // own contract exactly: reads dataRef.current fresh, transactionId/date
  // generated exactly once here, one persist() call, only on the success
  // path.
  const confirmLoanRepayment = useCallback(
    (
      input: Omit<ConfirmLoanRepaymentInput, 'transactionId' | 'date'>
    ): { transition: ConfirmLoanRepaymentResult; persistence: Promise<void>; transactionId: string } => {
      const transactionId = generateId();
      const date = new Date().toISOString();
      const transition = confirmLoanRepaymentTransition(dataRef.current, { ...input, transactionId, date });
      if (!transition.applied) return { transition, persistence: Promise.resolve(), transactionId };
      const persistence = persist(transition.data);
      // Final Pass 2D device-test correction (native-Modal-lifecycle round)
      // — see confirmCreditCardRepayment's identical own comment above.
      return { transition, persistence, transactionId };
    },
    [persist]
  );

  // Mirrors reverseBnplRepayment/reverseCreditCardRepayment's own contract:
  // reads dataRef.current, one persist() call, only on the success path.
  const reverseLoanRepayment = useCallback(
    (transactionId: string): ReverseLoanRepaymentResult => {
      const result = reverseLoanRepaymentTransaction(dataRef.current, transactionId);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
  );

  // 2D-NARROW correction — mirrors reverseLoanRepayment's own contract:
  // reads dataRef.current, one persist() call, only on the success path.
  const reverseRecurringOccurrence = useCallback(
    (transactionId: string): ReverseRecurringOccurrenceResult => {
      const result = reverseRecurringOccurrenceTransaction(dataRef.current, transactionId);
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

  // Thin wrapper over the pure, exported, directly-testable
  // transferFundsTransition — see its own doc comment above for the full
  // exact-cent/eligibility contract, including the credit-card-mirror fix.
  // Correction round, 2026-08-10 — reads dataRef.current (not the closed-
  // over `data`), the same established latest-state pattern every other
  // transition wrapper in this file already uses, so a second call fired
  // immediately after a first one in the same handler validates against
  // the first call's already-committed result rather than a stale
  // snapshot. Only calls persist() on the success path — a rejected
  // result never touches storage.
  const transferFunds = useCallback(
    (fromAssetId: string, to: TransferTarget, amount: number): TransferFundsResult => {
      const result = transferFundsTransition(dataRef.current, fromAssetId, to, amount);
      if (result.applied) persist(result.data);
      return result;
    },
    [persist]
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

  // Design 5.1 Wave 6 — the two reminder-suppression writes. Both follow
  // markAchievementsSeen's own established shape exactly (read the current
  // data, build the next value, hand it to `persist`), so they inherit the
  // same write bookkeeping, the same failure surface and the same
  // dataRef discipline as every other additive action here.
  //
  // Retention is folded into the write path because nothing in this app
  // runs on a schedule: each suppression prunes entries whose day is long
  // past. An elapsed snooze is already eligible again, so pruning it can
  // change no behaviour — it only stops the map growing without bound.
  const snoozeReminderOccurrence = useCallback(
    (occurrenceKey: string, returnOn: string, today: Date = new Date()) => {
      if (!occurrenceKey || !returnOn) return;
      const current = snoozedOccurrences(data);
      const next = { ...pruneSnoozes(current, today), [occurrenceKey]: returnOn };
      persist({
        ...data,
        snoozedReminderOccurrences: next,
        // A snoozed occurrence is no longer dismissed — the two are
        // mutually exclusive answers to the same question, and leaving a
        // stale dismissal behind would silently outrank the snooze.
        dismissedReminderOccurrences: pruneDismissals(dismissedOccurrences(data), today).filter((k) => k !== occurrenceKey),
      });
    },
    [data, persist]
  );

  const dismissReminderOccurrence = useCallback(
    (occurrenceKey: string, today: Date = new Date()) => {
      if (!occurrenceKey) return;
      const kept = pruneDismissals(dismissedOccurrences(data), today);
      if (kept.includes(occurrenceKey)) return; // already dismissed — never a duplicate write
      const remainingSnoozes = { ...pruneSnoozes(snoozedOccurrences(data), today) };
      // A dismissal supersedes any snooze on the same occurrence, so the
      // now-meaningless snooze entry is cleared rather than left to rot.
      delete remainingSnoozes[occurrenceKey];
      persist({
        ...data,
        dismissedReminderOccurrences: [...kept, occurrenceKey],
        snoozedReminderOccurrences: remainingSnoozes,
      });
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
      updateAssetsIncludeInMoney,
      deleteAsset,
      addLiability,
      updateLiability,
      deleteLiability,
      linkBillToLiability,
      addMortgageWithProperty,
      addCarLoanWithVehicle,
      updateLinkedRepaymentOnly,
      saveBnplPlan,
      confirmBnplRepayment,
      reverseBnplRepayment,
      confirmCreditCardRepayment,
      reverseCreditCardRepayment,
      confirmLoanRepayment,
      reverseLoanRepayment,
      reverseRecurringOccurrence,
      completeOnboarding,
      addCreditCard,
      updateCreditCard,
      deleteCreditCard,
      transferFunds,
      addSavingsComparison,
      updateSavingsComparison,
      deleteSavingsComparison,
      markAchievementsSeen,
      snoozeReminderOccurrence,
      dismissReminderOccurrence,
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
      updateAssetsIncludeInMoney,
      deleteAsset,
      addLiability,
      updateLiability,
      deleteLiability,
      linkBillToLiability,
      addMortgageWithProperty,
      addCarLoanWithVehicle,
      updateLinkedRepaymentOnly,
      saveBnplPlan,
      confirmBnplRepayment,
      reverseBnplRepayment,
      confirmCreditCardRepayment,
      reverseCreditCardRepayment,
      confirmLoanRepayment,
      reverseLoanRepayment,
      reverseRecurringOccurrence,
      completeOnboarding,
      addCreditCard,
      updateCreditCard,
      deleteCreditCard,
      transferFunds,
      addSavingsComparison,
      updateSavingsComparison,
      deleteSavingsComparison,
      markAchievementsSeen,
      snoozeReminderOccurrence,
      dismissReminderOccurrence,
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
