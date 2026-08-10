import { AppData, Liability, RecurringItem } from '../../types/models';
import { moneyAmountToCents } from './money';
import { recurringOccurrencesInRange } from './recurringSchedule';

/**
 * BNPL (Buy Now, Pay Later) projection — the shared calculation module for
 * every surface that needs to know "what does this plan actually still owe,
 * and when." Deliberately separate from AppStateContext.tsx (a calculation
 * engine, not a state-transition file) so both display surfaces
 * (safeToSpend.ts, moneyPlan.ts, moneyTimeline.ts) and the atomic
 * confirmation transition (AppStateContext.tsx) can consume the identical
 * capped-projection logic without a circular import.
 *
 * Reuses the EXISTING public `recurringOccurrencesInRange` for all raw
 * occurrence-date generation — the private `occurrenceDateAt` in
 * recurringSchedule.ts is never exported or duplicated. Passing
 * `from = new Date(item.nextDueDate)` (the item's own current occurrence)
 * as the lower bound makes `recurringOccurrencesInRange` generate starting
 * exactly at the first currently-unconfirmed occurrence — the same n=0
 * invariant `advanceOneOccurrence`/`confirmRecurringOccurrenceTransition`
 * already rely on — through the caller-supplied `windowEnd`, inclusive
 * (matching that function's own existing `<=` boundary convention exactly,
 * no new convention introduced). This module then walks that raw,
 * chronologically-ordered list once, consuming each occurrence's capped
 * amount against the live outstanding balance BEFORE filtering to the
 * caller's own visible `[windowStart, windowEnd]` — so a later window
 * always reflects what earlier, un-queried occurrences already consumed
 * (the corrected finite-projection contract).
 *
 * Boundary contract: both `windowStart` and `windowEnd` are INCLUSIVE,
 * mirroring `recurringOccurrencesInRange`'s own convention. A caller whose
 * own boundary is exclusive (e.g. moneyPlan.ts's calendar-month `monthEnd`,
 * which is the first instant of the FOLLOWING month) must adjust before
 * calling — either by passing `windowEnd` 1ms earlier, or by doing raw
 * generation through a safely-later bound and then applying its own exact
 * per-occurrence predicate against the returned dates (both patterns are
 * used by this round's callers; see each call site's own comment for which
 * one it uses and why).
 */

export interface BnplProjectedOccurrence {
  /** `bnpl-${item.id}-${date.getTime()}` — depends only on (item.id, date),
   * never on the requested window or the occurrence's position in the
   * result array, mirroring moneyTimeline.ts's existing
   * `bill-${item.id}-${date.getTime()}` convention (a distinct prefix, same
   * shape) so the same calendar occurrence always gets the same id
   * regardless of which screen asks for it. */
  id: string;
  date: Date;
  /** min(scheduledOccurrenceCents, remaining outstanding cents immediately
   * before this occurrence in the chronological walk) — integer cents. */
  amountCents: number;
  /** True exactly when this occurrence brings the outstanding balance to
   * precisely zero (integer-cents comparison, never a float-equality
   * check) — not merely "this occurrence's amount was capped smaller than
   * the scheduled amount." An occurrence that exactly exhausts the balance
   * at its full scheduled amount is also final. */
  isFinal: boolean;
}

/**
 * Validates an already-numeric stored amount through the existing strict
 * cents helper (`moneyAmountToCents`) — used for a RecurringItem's own
 * repayment amount, which must always be genuinely positive (mirrors every
 * other recurring-item amount in the app; `moneyAmountToCents` already
 * rejects zero/negative/fractional-cent/non-finite values). Returns
 * `undefined` on any invalid input — callers must treat that as "cannot
 * project this item," never fall back to an unvalidated number.
 */
function toScheduledCents(amount: number): number | undefined {
  const validated = moneyAmountToCents(amount);
  return validated.valid ? validated.cents : undefined;
}

/**
 * Validates a Liability's stored `currentBalance` through the same strict
 * cents helper, with one explicit, narrow carve-out: `moneyAmountToCents`
 * rejects `value <= 0` by design (every other caller — Goal target, Income,
 * Bill amounts — genuinely requires a positive value), but a BNPL
 * liability's `currentBalance` legitimately reaches exactly 0 the moment a
 * plan is paid off (`applyEffectDelta`'s own `Math.max(0, ...)` floor
 * already guarantees that value is an exact integer 0 when it occurs, never
 * float noise needing epsilon tolerance). A literal `=== 0` is handled here
 * directly, before ever calling `moneyAmountToCents`; every other value —
 * including anything negative, fractional-cent, or non-finite — is routed
 * through the real strict helper and rejected exactly as it would reject
 * any other stored money value. This is the one explicitly-justified
 * divergence from "convert every BNPL amount through the existing strict
 * cents helper" — documented here rather than silently bypassed.
 *
 * Exported (not just used for `Liability.currentBalance`) because the
 * confirmation transition in AppStateContext.tsx needs the IDENTICAL
 * zero-allowing conversion for a Cash asset's `currentValue` when checking
 * whether it can supply a repayment in full — a Cash balance can just as
 * legitimately be exactly $0 as a paid-off BNPL balance can.
 */
export function toBalanceCentsAllowingZero(value: number): number | undefined {
  if (value === 0) return 0;
  const validated = moneyAmountToCents(value);
  return validated.valid ? validated.cents : undefined;
}

/**
 * Core finite-projection helper — see this file's own header comment for
 * the full contract. Returns `[]` (never throws, never partially applies)
 * whenever the item/liability pairing is not a valid, active, positively-
 * scheduled BNPL link, or the liability is already paid off, or the window
 * simply contains no occurrence — every one of these is a legitimate "there
 * is nothing to show" result, not an error.
 */
export function projectBnplOccurrences(
  item: RecurringItem,
  liability: Liability,
  windowStart: Date,
  windowEnd: Date
): BnplProjectedOccurrence[] {
  if (item.type !== 'expense' || !item.active) return [];
  if (item.linkedLiabilityId !== liability.id) return [];
  if (liability.type !== 'bnpl') return [];

  const scheduledCents = toScheduledCents(item.amount);
  if (scheduledCents === undefined) return [];

  const outstandingCents = toBalanceCentsAllowingZero(liability.currentBalance);
  if (outstandingCents === undefined || outstandingCents === 0) return [];

  // Raw, chronologically-ordered occurrences from the item's own first
  // currently-unconfirmed date (n=0) through windowEnd inclusive — the
  // EXISTING public generator, reused unmodified. This deliberately walks
  // occurrences BEFORE windowStart too (never trimmed at the generation
  // step), because an earlier un-queried occurrence must still consume its
  // share of the outstanding balance before this window's own occurrences
  // are capped — the exact correction this module exists to make.
  const raw = recurringOccurrencesInRange([item], new Date(item.nextDueDate), windowEnd);

  let remainingCents = outstandingCents;
  const result: BnplProjectedOccurrence[] = [];
  for (const occurrence of raw) {
    if (remainingCents <= 0) break;
    const amountCents = Math.min(scheduledCents, remainingCents);
    remainingCents -= amountCents;
    if (occurrence.date.getTime() >= windowStart.getTime() && occurrence.date.getTime() <= windowEnd.getTime()) {
      result.push({
        id: `bnpl-${item.id}-${occurrence.date.getTime()}`,
        date: occurrence.date,
        amountCents,
        isFinal: remainingCents === 0,
      });
    }
  }
  return result;
}

/** Dollar-sum convenience wrapper over `projectBnplOccurrences` — for
 * callers that only want a single total for a window (computeFixedCosts-
 * adjacent consumers), not the individual occurrence list. Returns dollars
 * (2dp), matching every other calculation-engine return in this codebase. */
export function sumBnplOccurrencesInWindow(item: RecurringItem, liability: Liability, windowStart: Date, windowEnd: Date): number {
  const occurrences = projectBnplOccurrences(item, liability, windowStart, windowEnd);
  return occurrences.reduce((sum, o) => sum + o.amountCents, 0) / 100;
}

export type BnplLinkedItemsResolution =
  | { status: 'none' }
  | { status: 'single'; item: RecurringItem }
  | { status: 'ambiguous'; items: RecurringItem[] };

/**
 * Resolves the ACTIVE recurring item(s) linked to a BNPL liability. Normal
 * creation/editing already enforces "zero or one active linked item per
 * liability" (`upsertLinkedRecurringItem`'s existing "more than one
 * existing match -> refused outright" guard, unmodified, reused as-is) —
 * `'ambiguous'` should only ever be reachable from corrupted or externally
 * imported data. Only `active` items count: a deactivated (paid-off or
 * removed) item never contributes to ambiguity, matching
 * `recurringOccurrencesInRange`'s own existing `!item.active` skip.
 */
export function resolveBnplLinkedItems(data: AppData, liabilityId: string): BnplLinkedItemsResolution {
  const items = data.recurringItems.filter((r) => r.active && r.linkedLiabilityId === liabilityId && r.type === 'expense');
  if (items.length === 0) return { status: 'none' };
  if (items.length === 1) return { status: 'single', item: items[0] };
  return { status: 'ambiguous', items };
}

/**
 * Display-surface convenience: resolves a BNPL liability's single active
 * linked item (if any) and projects it — returning `[]`, never a partial or
 * double-counted result, whenever the schedule is missing, ambiguous, or
 * the liability isn't type `'bnpl'`. This is the safest default for every
 * read-only display surface (Available Until Payday, Money Plan, What
 * Happens Next, Typical Money Flow): an ambiguous or corrupted schedule
 * shows nothing rather than risking two independent full-balance
 * projections summing to more than what's actually owed.
 */
export function projectBnplOccurrencesForLiability(
  data: AppData,
  liability: Liability,
  windowStart: Date,
  windowEnd: Date
): BnplProjectedOccurrence[] {
  if (liability.type !== 'bnpl') return [];
  const resolution = resolveBnplLinkedItems(data, liability.id);
  if (resolution.status !== 'single') return [];
  return projectBnplOccurrences(resolution.item, liability, windowStart, windowEnd);
}

/** Every BNPL liability, alongside its resolved (possibly ambiguous, possibly
 * absent) linked-item state — the one shared source safeToSpend.ts,
 * moneyPlan.ts and moneyTimeline.ts each iterate to avoid re-deriving this
 * filter independently three times. */
export function listBnplLiabilities(data: AppData): Liability[] {
  return data.liabilities.filter((l) => l.type === 'bnpl');
}

/** Sums `sumBnplOccurrencesInWindow` (dollars) across every BNPL liability
 * for a given window — the single figure `computeBnplCostsForWindow`'s
 * callers in safeToSpend.ts/moneyPlan.ts/MoneyScreen.tsx each need, each
 * with their own window per this file's boundary contract. */
export function computeBnplCostsForWindow(data: AppData, windowStart: Date, windowEnd: Date): number {
  return listBnplLiabilities(data).reduce((sum, liability) => {
    const resolution = resolveBnplLinkedItems(data, liability.id);
    if (resolution.status !== 'single') return sum;
    return sum + sumBnplOccurrencesInWindow(resolution.item, liability, windowStart, windowEnd);
  }, 0);
}
