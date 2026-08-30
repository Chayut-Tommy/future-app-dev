/**
 * Pass B — the pure Look Ahead projection engine.
 *
 * Deterministic, cents-native, read-only. It composes validated inputs from the
 * existing authoritative owners, folds the A3 canonical INCLUDED events into a
 * daily end-of-day cash path, and returns a discriminated available/unavailable
 * result. It owns the projection ARITHMETIC only — no customer screen, sheet,
 * navigation or persistence, and it never re-enumerates recurrence, re-resolves
 * occurrence identity, duplicates repayment maths, calls AUP, or broadens
 * `computeSafeToSpend`.
 *
 * Reused owners:
 *   - opening spendable / protected savings: liquidAssets (the SAME
 *     account-inclusion rule AUP uses — never AUP's final result, never a
 *     private account filter);
 *   - dated events + issues: A3 `computeProjectedEvents` (windowStart = asOf);
 *   - dates: A2 localCalendar; informational plan: A2 monthlyCentAllocation;
 *   - plan resolvers: resolveSavingsAllocationMonthly, computeGoalAllocation.
 *
 * Option B: savings and goals are INFORMATIONAL — allocated separately and
 * never subtracted from the target, the daily path, the lowest point or any
 * shortfall. Zero AppData writes; inputs are never mutated.
 */

import { AppData, Asset } from '../../types/models';
import { computeMoneyBalanceStatus, listMoneyAvailableAccounts, resolveIncludeInMoneyCalculations } from './liquidAssets';
import { resolveSavingsAllocationMonthly } from './savingsAllocation';
import { computeGoalAllocation } from './goalAllocation';
import {
  LocalDate,
  compareLocalDates,
  eachLocalDateInclusive,
  localDatesEqual,
  parseLocalDate,
  toISODate,
  validateLookAheadTarget,
} from './localCalendar';
import { allocateInclusiveRangeCents } from './monthlyCentAllocation';
import { computeProjectedEvents, ProjectedEditDestination, ProjectedEvent } from './projectedEvents';
import { OccurrenceId, OccurrenceSourceKind } from './occurrenceIdentity';

// --- result contract ------------------------------------------------------

export interface LookAheadCheckpoint {
  date: LocalDate;
  /** Net cents of all events on this local date (one end-of-day batch). */
  netCents: number;
  /** End-of-day cash position after applying this date's net. */
  endOfDayCents: number;
}

export interface LookAheadBreakdown {
  openingCents: number;
  assumedIncomeCents: number; // positive
  billsCents: number; // negative
  cardCents: number; // negative
  bnplCents: number; // negative
  mortgageCents: number; // negative
  otherLoanCents: number; // negative
  netEventsCents: number;
  targetCents: number;
}

export interface AssumedIncomeOccurrence {
  sourceId: string;
  occurrenceId: OccurrenceId;
  date: LocalDate;
  cents: number; // positive
}
export interface LookAheadAssumptions {
  count: number;
  occurrences: AssumedIncomeOccurrence[];
  /** True when an assumed income occurrence falls on the selected target day. */
  targetIsPayday: boolean;
}

export interface InformationalPlan {
  /** Range-allocated planned savings / goals cents (Option B). `null` with a
   * notice when the monthly figure is not a valid non-negative amount — never
   * coerced to zero, never allowed to touch cash arithmetic. */
  savingsCents: number | null;
  goalsCents: number | null;
  combinedCents: number | null;
  notice?: string;
}

export interface ProtectedSavings {
  cents: number;
  accounts: { id: string; label: string; value: number }[];
}

export interface LookAheadNotice {
  code: string;
  sourceKind?: OccurrenceSourceKind;
  sourceId?: string;
  reason: string;
}

export type LookAheadIssueCode =
  | 'invalid_target'
  | 'no_eligible_balance'
  | 'invalid_opening_balance'
  | 'unsafe_arithmetic'
  | 'commitment_invalid_date'
  | 'commitment_invalid_amount'
  | 'occurrence_unresolved'
  | 'occurrence_conflict'
  | 'occurrence_unknown_version'
  | 'occurrence_invalid';

export interface LookAheadIssue {
  code: LookAheadIssueCode;
  sourceKind?: OccurrenceSourceKind;
  sourceId?: string;
  reason: string;
  editDestination?: ProjectedEditDestination;
}

export interface LookAheadAvailable {
  available: true;
  asOf: LocalDate;
  target: LocalDate;
  horizonDays: number;
  /** Signed target cash position cents (may be negative; the presentation
   * selector never surfaces a raw negative as the dominant headline). */
  targetCents: number;
  checkpoints: LookAheadCheckpoint[];
  lowest: { date: LocalDate; cents: number };
  firstShortfall: { date: LocalDate; shortfallCents: number } | null;
  recovers: boolean;
  breakdown: LookAheadBreakdown;
  assumptions: LookAheadAssumptions;
  informationalPlan: InformationalPlan;
  protectedSavings: ProtectedSavings;
  notices: LookAheadNotice[];
}
export interface LookAheadUnavailable {
  available: false;
  issues: LookAheadIssue[];
}
export type LookAheadResult = LookAheadAvailable | LookAheadUnavailable;

// --- helpers --------------------------------------------------------------

/** Exact signed cents for a balance (allows zero and negative); undefined when
 * non-finite, not an exact cent, or not a safe integer. */
function balanceToCents(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return 0;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) return undefined;
  return Number.isSafeInteger(cents) ? cents : undefined;
}
/** Checked integer-cent addition; undefined on unsafe result. */
function addChecked(a: number, b: number): number | undefined {
  const sum = a + b;
  return Number.isSafeInteger(sum) ? sum : undefined;
}
/** Informational (non-authoritative) monthly cents; null when not a valid
 * non-negative safe amount. Rounding is acceptable here — it never touches cash. */
function informationalMonthlyCents(dollars: number): number | null {
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

const A3_ISSUE_TO_B: Record<string, LookAheadIssueCode> = {
  invalid_date: 'commitment_invalid_date',
  invalid_amount: 'commitment_invalid_amount',
  unsafe_amount: 'commitment_invalid_amount',
  unresolved: 'occurrence_unresolved',
  conflict: 'occurrence_conflict',
  unknown_resolution_version: 'occurrence_unknown_version',
  invalid_occurrence: 'occurrence_invalid',
};

// --- the engine -----------------------------------------------------------

export function computeLookAheadProjection(data: AppData, asOf: LocalDate, target: LocalDate): LookAheadResult {
  // 1. Target contract (tomorrow .. asOf + 90, inclusive). Never clamps.
  const targetCheck = validateLookAheadTarget(asOf, target);
  if (!targetCheck.ok) {
    return { available: false, issues: [{ code: 'invalid_target', reason: targetCheck.reason === 'before_tomorrow' ? 'target must be tomorrow or later' : 'target must be within 90 local calendar days of the as-of date' }] };
  }
  const horizonDays = targetCheck.horizonDays;

  // 2. Opening spendable money — the SAME account-inclusion owner AUP uses.
  const status = computeMoneyBalanceStatus(data.assets);
  if (status === 'no_eligible_balance') {
    return { available: false, issues: [{ code: 'no_eligible_balance', reason: 'no account is opted in to spendable money' }] };
  }
  if (status === 'invalid_data') {
    return { available: false, issues: [{ code: 'invalid_opening_balance', reason: 'an included account balance is not a finite number' }] };
  }
  const includedAccounts = listMoneyAvailableAccounts(data.assets);
  let openingCents = 0;
  for (const acc of includedAccounts) {
    const cents = balanceToCents(acc.value);
    if (cents === undefined) return { available: false, issues: [{ code: 'invalid_opening_balance', sourceId: acc.id, reason: `account ${acc.label} balance is not a valid exact-cent amount` }] };
    const next = addChecked(openingCents, cents);
    if (next === undefined) return { available: false, issues: [{ code: 'unsafe_arithmetic', reason: 'opening balance sum exceeds the safe integer range' }] };
    openingCents = next;
  }

  // 3. Canonical A3 events (windowStart = asOf). Any BLOCKING issue → fail closed.
  const projected = computeProjectedEvents(data, asOf, target, { windowStart: asOf });
  const blocking = projected.issues.filter((i) => i.blocking);
  if (blocking.length > 0) {
    return {
      available: false,
      issues: blocking.map((i) => ({ code: A3_ISSUE_TO_B[i.code] ?? 'occurrence_invalid', sourceKind: i.sourceKind, sourceId: i.sourceId, reason: i.reason, editDestination: i.editDestination })),
    };
  }
  const notices: LookAheadNotice[] = projected.issues.filter((i) => !i.blocking).map((i) => ({ code: i.code, sourceKind: i.sourceKind, sourceId: i.sourceId, reason: i.reason }));

  // 4. Daily fold — one net end-of-day batch per local date, asOf..target.
  const eventsByDate = new Map<string, ProjectedEvent[]>();
  for (const ev of projected.events) {
    const k = toISODate(ev.date);
    (eventsByDate.get(k) ?? eventsByDate.set(k, []).get(k)!).push(ev);
  }
  const checkpoints: LookAheadCheckpoint[] = [];
  let running = openingCents;
  for (const day of eachLocalDateInclusive(asOf, target)) {
    const dayEvents = eventsByDate.get(toISODate(day)) ?? [];
    let netCents = 0;
    for (const ev of dayEvents) {
      const n = addChecked(netCents, ev.signedCents);
      if (n === undefined) return { available: false, issues: [{ code: 'unsafe_arithmetic', reason: 'a daily net batch exceeds the safe integer range' }] };
      netCents = n;
    }
    const eod = addChecked(running, netCents);
    if (eod === undefined) return { available: false, issues: [{ code: 'unsafe_arithmetic', reason: 'the daily cash path exceeds the safe integer range' }] };
    running = eod;
    checkpoints.push({ date: day, netCents, endOfDayCents: eod });
  }
  const targetCents = running;

  // 5. Lowest (earliest minimum), first shortfall, recovery.
  let lowest = { date: checkpoints[0].date, cents: checkpoints[0].endOfDayCents };
  for (const c of checkpoints) if (c.endOfDayCents < lowest.cents) lowest = { date: c.date, cents: c.endOfDayCents };
  let firstShortfall: { date: LocalDate; shortfallCents: number } | null = null;
  let firstShortfallIndex = -1;
  for (let i = 0; i < checkpoints.length; i++) {
    if (checkpoints[i].endOfDayCents < 0) { firstShortfall = { date: checkpoints[i].date, shortfallCents: -checkpoints[i].endOfDayCents }; firstShortfallIndex = i; break; }
  }
  const recovers = firstShortfall !== null && checkpoints.slice(firstShortfallIndex + 1).some((c) => c.endOfDayCents >= 0);

  // 6. Breakdown — every event affects exactly one category.
  const breakdown: LookAheadBreakdown = { openingCents, assumedIncomeCents: 0, billsCents: 0, cardCents: 0, bnplCents: 0, mortgageCents: 0, otherLoanCents: 0, netEventsCents: 0, targetCents };
  for (const ev of projected.events) {
    switch (ev.sourceKind) {
      case 'income': breakdown.assumedIncomeCents += ev.signedCents; break;
      case 'bill': breakdown.billsCents += ev.signedCents; break;
      case 'card': breakdown.cardCents += ev.signedCents; break;
      case 'bnpl': breakdown.bnplCents += ev.signedCents; break;
      case 'loan': if (ev.liabilitySubtype === 'mortgage') breakdown.mortgageCents += ev.signedCents; else breakdown.otherLoanCents += ev.signedCents; break;
    }
  }
  breakdown.netEventsCents = breakdown.assumedIncomeCents + breakdown.billsCents + breakdown.cardCents + breakdown.bnplCents + breakdown.mortgageCents + breakdown.otherLoanCents;

  // 7. Assumptions — assumed future income remains identifiable.
  const assumedOccs: AssumedIncomeOccurrence[] = projected.events
    .filter((e) => e.sourceKind === 'income')
    .map((e) => ({ sourceId: e.sourceId, occurrenceId: e.occurrenceId, date: e.date, cents: e.signedCents }));
  const assumptions: LookAheadAssumptions = { count: assumedOccs.length, occurrences: assumedOccs, targetIsPayday: assumedOccs.some((o) => localDatesEqual(o.date, target)) };

  // 8. Informational savings/goals (Option B) — range-allocated, never cash.
  const savingsMonthly = informationalMonthlyCents(resolveSavingsAllocationMonthly(data.user));
  const goalsMonthly = informationalMonthlyCents(computeGoalAllocation(data, Number.MAX_SAFE_INTEGER).totalRequiredMonthly);
  const informationalPlan: InformationalPlan = { savingsCents: null, goalsCents: null, combinedCents: null };
  if (savingsMonthly === null || goalsMonthly === null) {
    informationalPlan.notice = 'planned savings or goals could not be shown from the current plan';
  }
  if (savingsMonthly !== null) informationalPlan.savingsCents = allocateInclusiveRangeCents(savingsMonthly, asOf, target);
  if (goalsMonthly !== null) informationalPlan.goalsCents = allocateInclusiveRangeCents(goalsMonthly, asOf, target);
  if (informationalPlan.savingsCents !== null && informationalPlan.goalsCents !== null) {
    informationalPlan.combinedCents = informationalPlan.savingsCents + informationalPlan.goalsCents;
  }

  // 9. Protected savings — excluded from opening, reported for transparency.
  const protectedAccounts = data.assets.filter((a: Asset) => a.type === 'savings' && !resolveIncludeInMoneyCalculations(a) && Number.isFinite(a.currentValue));
  let protectedCents = 0;
  for (const a of protectedAccounts) { const c = balanceToCents(a.currentValue); if (c !== undefined) protectedCents += c; }
  const protectedSavings: ProtectedSavings = { cents: protectedCents, accounts: protectedAccounts.map((a) => ({ id: a.id, label: a.label, value: a.currentValue })) };

  return {
    available: true,
    asOf,
    target,
    horizonDays,
    targetCents,
    checkpoints,
    lowest,
    firstShortfall,
    recovers,
    breakdown,
    assumptions,
    informationalPlan,
    protectedSavings,
    notices,
  };
}

/** Convenience: project from ISO `YYYY-MM-DD` bounds. */
export function computeLookAheadProjectionFromISO(data: AppData, asOfISO: string, targetISO: string): LookAheadResult {
  return computeLookAheadProjection(data, parseLocalDate(asOfISO), parseLocalDate(targetISO));
}
