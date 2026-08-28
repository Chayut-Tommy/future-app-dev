/**
 * A2 — the ONE authoritative local-calendar boundary for Look Ahead date math.
 *
 * Business dates are validated LOCAL calendar dates (year / month 1-12 / day),
 * never UTC instants and never millisecond day counts. All arithmetic here is
 * pure integer civil-day math (Howard Hinnant's algorithms) — it constructs no
 * `Date` for addition or differencing, so it is deterministic and identical
 * under any process timezone and across Australian DST transitions (a local day
 * is a calendar day here, never 23 or 25 elapsed hours). It NEVER divides an
 * elapsed-millisecond difference by 86_400_000 and NEVER relies on
 * `new Date('YYYY-MM-DD')` UTC parsing for business semantics.
 *
 * Month length and monthly-anchor clamping are DELEGATED to the existing
 * recurrence-anchoring owner (`recurringSchedule.daysInMonth` /
 * `anchoredMonthlyDate`) — this module never reimplements them, so a single
 * source of truth governs "how long is this month" and "where does day 31 land
 * in a short month, and does it restore later".
 *
 * Pure and side-effect free. No React, AppState, persistence, current-time
 * dependency, or customer-facing copy. Callers inject the as-of local date.
 */

import { anchoredMonthlyDate, daysInMonth } from './recurringSchedule';

/** A validated local calendar date. `month` is 1-12; `day` is 1..daysInMonth.
 * Construct only via the validating helpers below — never by hand. */
export interface LocalDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31 (valid for the month)
}

/** Typed fail-closed error for every invalid-date path. */
export class LocalCalendarError extends Error {
  constructor(public readonly code: LocalCalendarErrorCode, message: string) {
    super(message);
    this.name = 'LocalCalendarError';
  }
}
export type LocalCalendarErrorCode =
  | 'invalid_format'
  | 'invalid_calendar_date'
  | 'invalid_components'
  | 'not_finite';

/** The inclusive Look Ahead horizon: a target may be from tomorrow through the
 * as-of date plus this many local calendar days, inclusive of the target day. */
export const LOOK_AHEAD_MAX_HORIZON_DAYS = 90;

// --- pure integer civil-day core (no Date, no ms) ------------------------

/** Days since 1970-01-01 for a proleptic-Gregorian (y, m 1-12, d). Integer. */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + (d - 1);
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil: an integer day-count back to (y, m 1-12, d). */
function civilFromDays(z: number): { year: number; month: number; day: number } {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// --- validation / construction -------------------------------------------

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a strict `YYYY-MM-DD` string that is also a real calendar
 * date (correct month length, leap-year aware). No timezone, no time part. */
export function isValidLocalDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month - 1)) return false;
  return true;
}

/** Validate raw components into a LocalDate, or throw a typed error. */
export function localDate(year: number, month: number, day: number): LocalDate {
  if (![year, month, day].every((n) => Number.isInteger(n))) {
    throw new LocalCalendarError('invalid_components', `local date components must be integers: ${year}-${month}-${day}`);
  }
  if (month < 1 || month > 12) {
    throw new LocalCalendarError('invalid_calendar_date', `month out of range: ${month}`);
  }
  if (day < 1 || day > daysInMonth(year, month - 1)) {
    throw new LocalCalendarError('invalid_calendar_date', `day ${day} is invalid for ${year}-${pad2(month)}`);
  }
  return { year, month, day };
}

/** Strict parse of `YYYY-MM-DD` → LocalDate, or throw a typed error. */
export function parseLocalDate(value: string): LocalDate {
  if (typeof value !== 'string' || !YMD_RE.test(value)) {
    throw new LocalCalendarError('invalid_format', `expected YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  return localDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)));
}

/** Non-throwing parse — null on any invalid input. */
export function tryParseLocalDate(value: unknown): LocalDate | null {
  return isValidLocalDateString(value) ? parseLocalDate(value as string) : null;
}

/** `YYYY-MM-DD` for a LocalDate. */
export function toISODate(d: LocalDate): string {
  return `${String(d.year).padStart(4, '0')}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** Derive the as-of LOCAL date from a Date (the ONLY Date boundary — used once
 * at the edge to read the device's local calendar day; pure tests inject a
 * LocalDate instead and never call this). */
export function localDateFromDate(d: Date): LocalDate {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new LocalCalendarError('not_finite', 'cannot derive a local date from an invalid Date');
  }
  return localDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// --- comparison / arithmetic ---------------------------------------------

/** -1 if a<b, 0 if equal, 1 if a>b (by calendar order). */
export function compareLocalDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  const da = daysFromCivil(a.year, a.month, a.day);
  const db = daysFromCivil(b.year, b.month, b.day);
  return da < db ? -1 : da > db ? 1 : 0;
}

export function localDatesEqual(a: LocalDate, b: LocalDate): boolean {
  return compareLocalDates(a, b) === 0;
}

/** Add (or subtract, for negative n) whole calendar days. Pure integer math;
 * rolls across month/year boundaries and is DST-irrelevant. */
export function addCalendarDays(d: LocalDate, n: number): LocalDate {
  if (!Number.isInteger(n)) {
    throw new LocalCalendarError('invalid_components', `days to add must be an integer: ${n}`);
  }
  const { year, month, day } = civilFromDays(daysFromCivil(d.year, d.month, d.day) + n);
  return { year, month, day };
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return daysFromCivil(to.year, to.month, to.day) - daysFromCivil(from.year, from.month, from.day);
}

/** The next calendar day. */
export function tomorrow(d: LocalDate): LocalDate {
  return addCalendarDays(d, 1);
}

// --- month boundaries / anchoring ----------------------------------------

/** Calendar days in a LocalDate's month (1-12), delegated to the recurrence
 * owner so month-length has a single source of truth. */
export function daysInLocalMonth(year: number, month: number): number {
  return daysInMonth(year, month - 1);
}

/** Last day of the given date's own month. */
export function endOfMonth(d: LocalDate): LocalDate {
  return { year: d.year, month: d.month, day: daysInLocalMonth(d.year, d.month) };
}

/** Last day of the month AFTER the given date's month. */
export function endOfNextMonth(d: LocalDate): LocalDate {
  const month0 = d.month - 1 + 1; // next month, 0-based
  const year = d.year + Math.floor(month0 / 12);
  const m0 = ((month0 % 12) + 12) % 12;
  return { year, month: m0 + 1, day: daysInMonth(year, m0) };
}

/** Where a monthly anchor day lands in a target (year, month 1-12) — clamped to
 * that month's last valid day and restored automatically in longer months.
 * Delegated to the recurrence-anchoring owner (no competing implementation). */
export function clampAnchorToMonth(year: number, month: number, anchorDay: number): LocalDate {
  const d = anchoredMonthlyDate(year, month - 1, anchorDay);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// --- inclusive ranges -----------------------------------------------------

export interface TouchedMonth {
  year: number;
  month: number; // 1-12
  /** First day-of-month covered by the range within this month. */
  firstDay: number;
  /** Last day-of-month covered by the range within this month. */
  lastDay: number;
  /** Total calendar days in this month. */
  daysInMonth: number;
}

/** Decompose an inclusive [start, end] range into the per-month day spans it
 * touches (start ≤ end required). The building block for range allocation and
 * iteration; never divides elapsed time. */
export function monthsTouched(start: LocalDate, end: LocalDate): TouchedMonth[] {
  if (compareLocalDates(start, end) > 0) {
    throw new LocalCalendarError('invalid_components', `range start ${toISODate(start)} is after end ${toISODate(end)}`);
  }
  const out: TouchedMonth[] = [];
  let year = start.year;
  let month = start.month;
  // Guard against any pathological non-advancing loop (a range is at most ~91
  // days for Look Ahead, but this is generic; 1200 months = 100 years cap).
  for (let i = 0; i < 1200; i++) {
    const dim = daysInLocalMonth(year, month);
    const isFirst = year === start.year && month === start.month;
    const isLast = year === end.year && month === end.month;
    out.push({
      year,
      month,
      firstDay: isFirst ? start.day : 1,
      lastDay: isLast ? end.day : dim,
      daysInMonth: dim,
    });
    if (isLast) return out;
    if (month === 12) {
      month = 1;
      year += 1;
    } else {
      month += 1;
    }
  }
  throw new LocalCalendarError('invalid_components', 'range spans more months than supported');
}

/** Inclusive iteration of every LocalDate from start to end. */
export function eachLocalDateInclusive(start: LocalDate, end: LocalDate): LocalDate[] {
  if (compareLocalDates(start, end) > 0) {
    throw new LocalCalendarError('invalid_components', `range start ${toISODate(start)} is after end ${toISODate(end)}`);
  }
  const days = daysBetween(start, end);
  const out: LocalDate[] = [];
  for (let i = 0; i <= days; i++) out.push(addCalendarDays(start, i));
  return out;
}

// --- Look Ahead target validation ----------------------------------------

export type LookAheadTargetValidation =
  | { ok: true; target: LocalDate; horizonDays: number }
  | { ok: false; reason: 'before_tomorrow' | 'beyond_horizon' };

/** The Look Ahead target rule: earliest target is TOMORROW (as-of + 1),
 * latest is as-of + 90 local calendar days, and the target is inclusive
 * through the end of that local day. Fails closed for out-of-range targets. */
export function validateLookAheadTarget(asOf: LocalDate, target: LocalDate): LookAheadTargetValidation {
  const horizonDays = daysBetween(asOf, target);
  if (horizonDays < 1) return { ok: false, reason: 'before_tomorrow' };
  if (horizonDays > LOOK_AHEAD_MAX_HORIZON_DAYS) return { ok: false, reason: 'beyond_horizon' };
  return { ok: true, target, horizonDays };
}
