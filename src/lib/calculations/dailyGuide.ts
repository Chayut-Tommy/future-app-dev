/**
 * Pass C.2 — the pure, guarded "About per day" daily-guide engine.
 *
 * Answers ONE question for a selected Look Ahead date T: "if I spent the same
 * amount on every day from today until the day before T, what is the largest
 * such amount that keeps my modelled cash position at or above zero on EVERY
 * local day through the next payday after T, given everything Nolie knows is
 * scheduled?" (Specification v1.3 §7.11.)
 *
 * It is composed ONLY from existing authoritative owners:
 *   - the Pass B projection (`computeLookAheadProjection`) — the target
 *     estimate, opening spendable money and horizon are read from it, never
 *     recomputed;
 *   - the A3 canonical event stream (`computeProjectedEvents`) — the SAME
 *     generator, extended through the guard payday (no second enumerator);
 *   - AUP's payday-boundary selection (`paydayBoundaryAfter`) — the SAME
 *     primary-cycle cadence, never an individual income item;
 *   - A2 local-calendar arithmetic (integer civil days; DST-irrelevant).
 *
 * PROHIBITED by contract (§7.12) and by construction: the guide is NEVER
 * `targetCents / N`. It is the minimum, over every day of the actual dated
 * event path through the guard payday, of floor(cash available at that day ÷
 * daily allocations applied by that day). Integer cents throughout; the
 * whole-dollar display rounds DOWN and never exceeds the exact capacity.
 *
 * Pure and read-only: no React, no AppData/persistence writes, inputs never
 * mutated; the as-of date is injected.
 */

import { AppData } from '../../types/models';
import { LocalDate, addCalendarDays, compareLocalDates, daysBetween, eachLocalDateInclusive, toISODate } from './localCalendar';
import { computeProjectedEvents } from './projectedEvents';
import { LookAheadIssue, LookAheadResult, computeLookAheadProjection, mapProjectedIssueToLookAhead } from './lookAheadProjection';
import { paydayBoundaryAfter } from './paydayBoundary';
import { mainPaydayNeedsChoice, resolveMainPayday } from './incomeEngine';

export type DailyGuideStatus =
  | 'available'
  | 'zero'
  | 'existing_shortfall'
  | 'missing_guard_payday'
  | 'invalid_material_input'
  | 'unavailable';

export type MissingGuardPaydayReason = 'no_payday' | 'invalid_payday' | 'irregular_beyond_next' | 'main_payday_unselected';

export interface DailyGuideResult {
  status: DailyGuideStatus;
  asOf: LocalDate;
  target: LocalDate;
  /** N — local-calendar days from as-of to target (≥ 1); the number of
   * allocation dates (as-of through the day before target). */
  allocationDays: number;
  /** G — the next authoritative AUP payday boundary strictly after target. */
  guardPayday: LocalDate | null;
  guardPaydaySource: 'next_payday' | 'projected_cycle' | null;
  /** Exact guide in integer cents (null unless available/zero). */
  exactCents: number | null;
  /** Whole-dollar display value in cents, rounded DOWN from exactCents. */
  displayCents: number | null;
  /** The earliest day on the guarded path that limits the guide. */
  limitingDate: LocalDate | null;
  /** Pass C.3 — narrowly scoped explanation metadata (presentation reads it,
   * never recomputes it): the scheduled end-of-day position on the limiting
   * date with NO daily spending applied, and how many daily allocations are
   * counted by that date (k). The guide is floor(limitingPositionCents ÷
   * limitingAllocationDays). Null unless the guide is available or zero. */
  limitingPositionCents: number | null;
  limitingAllocationDays: number | null;
  /** First day the guarded path (with NO daily spending) is below zero. */
  shortfall: { date: LocalDate; cents: number } | null;
  /** Outflows falling after target through the guard payday (positive cents)
   * — the money the guide keeps back. */
  obligationsAfterTargetCents: number;
  /** Positive scheduled income after target through the guard payday that
   * the guard path deliberately EXCLUDES (payday income at G included). */
  incomeExcludedAfterTargetCents: number;
  /** The Pass B target estimate the guide is paired with (null when unavailable). */
  targetCents: number | null;
  /** Same-date events are netted at end of local day; no intraday ordering. */
  batchedEndOfDay: true;
  /** Plain, customer-safe reason for the status. */
  reason: string;
  missingGuardPaydayReason?: MissingGuardPaydayReason;
  issues?: LookAheadIssue[];
}

/** Checked integer-cent addition; undefined on unsafe result. */
function addChecked(a: number, b: number): number | undefined {
  const sum = a + b;
  return Number.isSafeInteger(sum) ? sum : undefined;
}

export function computeDailyGuide(data: AppData, asOf: LocalDate, target: LocalDate, projection?: LookAheadResult): DailyGuideResult {
  const base = {
    asOf,
    target,
    allocationDays: Math.max(1, daysBetween(asOf, target)),
    guardPayday: null as LocalDate | null,
    guardPaydaySource: null as 'next_payday' | 'projected_cycle' | null,
    exactCents: null as number | null,
    displayCents: null as number | null,
    limitingDate: null as LocalDate | null,
    limitingPositionCents: null as number | null,
    limitingAllocationDays: null as number | null,
    shortfall: null as { date: LocalDate; cents: number } | null,
    obligationsAfterTargetCents: 0,
    incomeExcludedAfterTargetCents: 0,
    targetCents: null as number | null,
    batchedEndOfDay: true as const,
  };

  // 1. The target estimate itself must be available (same engine, same inputs).
  const result = projection ?? computeLookAheadProjection(data, asOf, target);
  if (!result.available) {
    return { ...base, status: 'unavailable', reason: 'The estimate for this date isn’t available yet.', issues: result.issues };
  }
  const N = result.horizonDays; // validated ≥ 1 by the projection's target contract
  const openingCents = result.breakdown.openingCents;
  const targetCents = result.targetCents;

  // 2. G — the next authoritative payday boundary strictly after T. The
  //    boundary belongs to the customer's EXPLICIT Main payday (Pass C.2
  //    closure): with several income sources and no valid choice, no guard
  //    can be asserted — fail closed and ask, while the estimate itself stays
  //    available. The same resolver the persist pipeline uses, read-only.
  if (mainPaydayNeedsChoice(resolveMainPayday(data.recurringItems, data.user.mainPaydayIncomeId).status)) {
    return { ...base, allocationDays: N, targetCents, status: 'missing_guard_payday', reason: 'Choose your main payday to see a daily guide for this date.', missingGuardPaydayReason: 'main_payday_unselected' };
  }
  const guard = paydayBoundaryAfter(data.user, target);
  if (guard.kind !== 'known') {
    const reason =
      guard.kind === 'no_payday'
        ? 'Nolie doesn’t have your next payday yet, so it can’t work out a daily guide for this date.'
        : guard.kind === 'invalid_payday'
          ? 'Your next payday date isn’t valid, so Nolie can’t work out a daily guide for this date.'
          : 'Your income is irregular, so Nolie can’t assume a payday after this date.';
    return { ...base, allocationDays: N, targetCents, status: 'missing_guard_payday', reason, missingGuardPaydayReason: guard.kind };
  }
  const G = guard.date;

  // 3. The SAME canonical event stream, extended through G. Any blocking issue
  //    fails closed with the same source attribution the estimate would use.
  const projected = computeProjectedEvents(data, asOf, G, { windowStart: asOf });
  const blocking = projected.issues.filter((i) => i.blocking);
  if (blocking.length > 0) {
    const issues = blocking.map(mapProjectedIssueToLookAhead);
    const first = issues[0];
    return {
      ...base,
      allocationDays: N,
      guardPayday: G,
      guardPaydaySource: guard.source,
      targetCents,
      status: 'invalid_material_input',
      reason: first.reason,
      issues,
    };
  }

  // 4. Integrity: folding every event through T from the same opening must
  //    reproduce the Pass B target exactly — otherwise fail closed rather than
  //    pair a guide with an estimate it does not share a path with.
  let reconcile = openingCents;
  for (const ev of projected.events) {
    if (compareLocalDates(ev.date, target) <= 0) {
      const next = addChecked(reconcile, ev.signedCents);
      if (next === undefined) return { ...base, allocationDays: N, guardPayday: G, guardPaydaySource: guard.source, targetCents, status: 'invalid_material_input', reason: 'The cash path exceeds the safe amount range.' };
      reconcile = next;
    }
  }
  if (reconcile !== targetCents) {
    return { ...base, allocationDays: N, guardPayday: G, guardPaydaySource: guard.source, targetCents, status: 'invalid_material_input', reason: 'The daily guide could not be reconciled with the estimated balance.' };
  }

  // 5. The guard path: income only on/before T (never after T, never at G);
  //    every outflow through G inclusive; one end-of-day net batch per date.
  const netByDate = new Map<string, number>();
  let obligationsAfterTargetCents = 0;
  let incomeExcludedAfterTargetCents = 0;
  for (const ev of projected.events) {
    const afterTarget = compareLocalDates(ev.date, target) > 0;
    if (ev.signedCents > 0 && afterTarget) {
      incomeExcludedAfterTargetCents += ev.signedCents;
      continue;
    }
    if (ev.signedCents < 0 && afterTarget) obligationsAfterTargetCents += -ev.signedCents;
    const k = toISODate(ev.date);
    const cur = netByDate.get(k) ?? 0;
    const next = addChecked(cur, ev.signedCents);
    if (next === undefined) return { ...base, allocationDays: N, guardPayday: G, guardPaydaySource: guard.source, targetCents, status: 'invalid_material_input', reason: 'A daily batch exceeds the safe amount range.' };
    netByDate.set(k, next);
  }

  // 6. Prefix bound: q ≤ floor(cash(d) / k(d)) for every day d in [asOf, G],
  //    where k(d) = allocations applied by end of day d = min(N, d − asOf + 1).
  //    A negative cash(d) with no daily spending is an existing shortfall.
  let running = openingCents;
  let bound: number | null = null;
  let limitingDate: LocalDate | null = null;
  let limitingPositionCents: number | null = null;
  let limitingAllocationDays: number | null = null;
  for (const day of eachLocalDateInclusive(asOf, G)) {
    const net = netByDate.get(toISODate(day)) ?? 0;
    const eod = addChecked(running, net);
    if (eod === undefined) return { ...base, allocationDays: N, guardPayday: G, guardPaydaySource: guard.source, targetCents, status: 'invalid_material_input', reason: 'The cash path exceeds the safe amount range.' };
    running = eod;
    if (running < 0) {
      return {
        ...base,
        allocationDays: N,
        guardPayday: G,
        guardPaydaySource: guard.source,
        targetCents,
        obligationsAfterTargetCents,
        incomeExcludedAfterTargetCents,
        status: 'existing_shortfall',
        shortfall: { date: day, cents: -running },
        reason:
          compareLocalDates(day, target) <= 0
            ? 'Your scheduled commitments already take the estimate below $0 before your selected date.'
            : 'A scheduled commitment between your selected date and your next payday already takes the estimate below $0.',
      };
    }
    const k = Math.min(N, daysBetween(asOf, day) + 1);
    const dayBound = Math.floor(running / k);
    if (bound === null || dayBound < bound) {
      bound = dayBound;
      limitingDate = day;
      limitingPositionCents = running;
      limitingAllocationDays = k;
    }
  }
  const exactCents = bound ?? 0;
  const displayCents = Math.floor(exactCents / 100) * 100;
  const common = {
    ...base,
    allocationDays: N,
    guardPayday: G,
    guardPaydaySource: guard.source,
    targetCents,
    obligationsAfterTargetCents,
    incomeExcludedAfterTargetCents,
    exactCents,
    displayCents,
    limitingDate,
    limitingPositionCents,
    limitingAllocationDays,
  };
  if (exactCents === 0) {
    return { ...common, status: 'zero', reason: 'Everything Nolie knows is scheduled through your next payday uses up the money available, so there’s no additional daily room.' };
  }
  return {
    ...common,
    status: 'available',
    reason: `Spreads an equal amount across the ${N} day${N === 1 ? '' : 's'} before ${toISODate(target)} while keeping enough for scheduled commitments through ${toISODate(G)}.`,
  };
}

/** The day after G is never part of the guard; exported for tests that want to
 * assert the window edge without re-deriving it. */
export function dayAfter(d: LocalDate): LocalDate {
  return addCalendarDays(d, 1);
}
