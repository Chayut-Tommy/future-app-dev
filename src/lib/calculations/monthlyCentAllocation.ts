/**
 * A2 — the ONE exact monthly-cent prefix allocator.
 *
 * For a non-negative authoritative monthly amount `C` cents and a month with
 * `D` calendar days, the CUMULATIVE allocation through day `n` (0 ≤ n ≤ D) is
 *
 *     prefix(C, D, n) = round-half-up(C · n / D)
 *
 * and an inclusive date range's allocation is the difference between the
 * cumulative prefix at the range end and the prefix immediately before its
 * start, computed separately for every touched month and summed.
 *
 * Properties this guarantees (all proven by tests):
 *   - integer cents at the public boundary;
 *   - deterministic positive round-half-up (a half-cent tie rounds up);
 *   - a full month returns exactly C; a full year returns exactly 12·C;
 *   - adjacent subranges telescope EXACTLY to the whole range;
 *   - zero cents returns zero.
 *
 * All intermediate arithmetic is BigInt, so half-cent ties and very large safe
 * values are exact — no floating-point authoritative arithmetic, no `days/30`,
 * no daily-rounded-amount-times-days. Inputs are validated as non-negative safe
 * integers and the result is validated as a safe integer; anything else FAILS
 * CLOSED with a typed error rather than returning a wrong number.
 *
 * Under Specification v1.2 Option B, savings and goal cents are INFORMATIONAL:
 * each is allocated independently here and their informational total is a plain
 * sum. Nothing in this module subtracts them from any cash position, alters a
 * daily path, or implies money has moved — it only allocates a monthly figure
 * across calendar days.
 */

import { LocalDate, monthsTouched } from './localCalendar';

export class MonthlyAllocationError extends Error {
  constructor(public readonly code: MonthlyAllocationErrorCode, message: string) {
    super(message);
    this.name = 'MonthlyAllocationError';
  }
}
export type MonthlyAllocationErrorCode =
  | 'invalid_monthly_cents'
  | 'invalid_days_in_month'
  | 'invalid_day_index'
  | 'unsafe_result';

function assertNonNegativeSafeIntCents(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new MonthlyAllocationError('invalid_monthly_cents', `${label} must be a non-negative safe integer number of cents: ${value}`);
  }
}

/**
 * Cumulative cents allocated through day `n` of a month with `daysInMonth` days:
 * round-half-up(monthlyCents · n / daysInMonth). Exact via BigInt.
 *
 * round-half-up(p / q) for non-negative integers p, q>0 equals
 * floor((2p + q) / (2q)) — a half-cent tie (2p = (2k+1)q) yields k+1.
 */
export function cumulativeCentsThroughDay(monthlyCents: number, daysInMonthCount: number, n: number): number {
  assertNonNegativeSafeIntCents(monthlyCents, 'monthlyCents');
  if (!Number.isInteger(daysInMonthCount) || daysInMonthCount < 28 || daysInMonthCount > 31) {
    throw new MonthlyAllocationError('invalid_days_in_month', `daysInMonth must be 28-31: ${daysInMonthCount}`);
  }
  if (!Number.isInteger(n) || n < 0 || n > daysInMonthCount) {
    throw new MonthlyAllocationError('invalid_day_index', `day index must be 0..${daysInMonthCount}: ${n}`);
  }
  const C = BigInt(monthlyCents);
  const D = BigInt(daysInMonthCount);
  const nB = BigInt(n);
  // floor((2·C·n + D) / (2·D)); all terms ≥ 0 so BigInt division floors.
  const result = (2n * C * nB + D) / (2n * D);
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) {
    throw new MonthlyAllocationError('unsafe_result', `cumulative cents overflowed the safe-integer range: ${result.toString()}`);
  }
  return asNumber;
}

/**
 * Exact cents allocated over an INCLUSIVE local-date range for an authoritative
 * monthly amount. Sums, per touched month, prefix(lastDay) − prefix(firstDay−1).
 */
export function allocateInclusiveRangeCents(monthlyCents: number, start: LocalDate, end: LocalDate): number {
  assertNonNegativeSafeIntCents(monthlyCents, 'monthlyCents');
  let totalCents = 0n; // accumulate in BigInt; validate the boundary result
  for (const m of monthsTouched(start, end)) {
    const upTo = cumulativeCentsThroughDay(monthlyCents, m.daysInMonth, m.lastDay);
    const before = cumulativeCentsThroughDay(monthlyCents, m.daysInMonth, m.firstDay - 1);
    totalCents += BigInt(upTo) - BigInt(before);
  }
  const asNumber = Number(totalCents);
  if (!Number.isSafeInteger(asNumber) || asNumber < 0) {
    throw new MonthlyAllocationError('unsafe_result', `range allocation is not a non-negative safe integer: ${totalCents.toString()}`);
  }
  return asNumber;
}

/**
 * Informational savings + goals allocation over the same inclusive range (Option
 * B). Each is allocated INDEPENDENTLY and the informational total is their exact
 * sum — never a value that is subtracted from any cash position.
 */
export interface InformationalPlanAllocation {
  savingsCents: number;
  goalsCents: number;
  /** savingsCents + goalsCents — informational only. */
  informationalTotalCents: number;
}
export function allocateInformationalPlan(
  savingsMonthlyCents: number,
  goalsMonthlyCents: number,
  start: LocalDate,
  end: LocalDate
): InformationalPlanAllocation {
  const savingsCents = allocateInclusiveRangeCents(savingsMonthlyCents, start, end);
  const goalsCents = allocateInclusiveRangeCents(goalsMonthlyCents, start, end);
  const informationalTotalCents = savingsCents + goalsCents;
  if (!Number.isSafeInteger(informationalTotalCents)) {
    throw new MonthlyAllocationError('unsafe_result', 'informational total overflowed the safe-integer range');
  }
  return { savingsCents, goalsCents, informationalTotalCents };
}
