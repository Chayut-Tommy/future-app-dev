/**
 * Nolie Design 5.1 Wave 4 device correction — how date and recurring-day
 * fields DESCRIBE themselves.
 *
 * Presentation only, and deliberately pure/RN-free so the whole matrix is
 * testable under plain tsx. It computes no schedule, resolves no recurrence
 * and stores nothing: `anchoredMonthlyDate`, `nextOccurrence` and every
 * bill/income recurrence rule are untouched and stay exactly where they are.
 *
 * The correction it serves: the forms conflated two genuinely different
 * concepts behind the same raw numeric boxes —
 *
 *   1. a RECURRING DAY (an anchor: "the 25th of each month"), which is a
 *      number between 1 and 31 and is not a date at all; and
 *   2. a real CALENDAR DATE (a next due date, a target date, the date a
 *      transaction happened), which is a specific day in a specific month.
 *
 * A month calendar is the wrong control for the first, and three raw
 * DD/MM/YYYY boxes are the wrong control for the second.
 */

/** Every day a monthly anchor may fall on. Short months are handled by the
 * existing `anchoredMonthlyDate` clamp — this list never shortens itself,
 * because the anchor is the customer's stated intent, not a date. */
export const DAY_OF_MONTH_VALUES: readonly number[] = Array.from({ length: 31 }, (_, i) => i + 1);

/** "1st", "2nd", "3rd", "11th", "21st", "31st". */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** What the collapsed day-of-month row shows: "25th of each month". */
export function describeDayOfMonth(day: number | null): string {
  if (day === null || !Number.isInteger(day) || day < 1 || day > 31) return 'Not set';
  return `${ordinalDay(day)} of each month`;
}

export interface DateDescription {
  /** The headline: "Today", "Yesterday", or the weekday. */
  primary: string;
  /** The unambiguous date underneath, always present when a date is set. */
  secondary: string | null;
}

/** Local-date comparison only — both sides are compared on their own
 * year/month/day, never on UTC instants, so an evening in a negative-offset
 * timezone is still "Today". This mirrors the app's existing local-date
 * semantics rather than introducing a new one. */
function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addLocalDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** Long, unambiguous form: "18 August 2026". */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The collapsed date row's two lines. `today` is injected rather than read
 * from the clock so this is deterministic under test.
 */
export function describeDate(date: Date | null, today: Date): DateDescription {
  if (date === null) return { primary: 'Not set', secondary: null };
  const secondary = formatFullDate(date);
  if (sameLocalDay(date, today)) return { primary: 'Today', secondary };
  if (sameLocalDay(date, addLocalDays(today, -1))) return { primary: 'Yesterday', secondary };
  // Wave 4 closure — `Tomorrow` is named for the same reason `Yesterday` is:
  // the forward pickers (a bill's next due date, a loan repayment) offer a
  // choice labelled "Tomorrow", and the collapsed row must not then call the
  // very same date "Thursday". One vocabulary, both directions.
  if (sameLocalDay(date, addLocalDays(today, 1))) return { primary: 'Tomorrow', secondary };
  return { primary: date.toLocaleDateString(undefined, { weekday: 'long' }), secondary };
}

export interface QuickDateChoice {
  key: string;
  label: string;
  /** Local midnight of the chosen day. */
  date: Date;
}

/**
 * The shortcuts the picker offers. These are exactly the offsets the
 * transaction form already had as permanently-visible chips (today, 1 day,
 * 2 days, 7 days) — the same date OUTCOMES, moved inside the picker so the
 * main form shows one row instead of a chip rail.
 */
export function quickDateChoices(today: Date): QuickDateChoice[] {
  return [
    { key: 'today', label: 'Today', date: addLocalDays(today, 0) },
    { key: 'yesterday', label: 'Yesterday', date: addLocalDays(today, -1) },
    { key: 'two-days-ago', label: '2 days ago', date: addLocalDays(today, -2) },
    { key: 'last-week', label: 'Last week', date: addLocalDays(today, -7) },
  ];
}

/**
 * Whether opening a picker must first wait for the keyboard to go away.
 *
 * The rule is event-driven by design: when a keyboard is up the caller
 * dismisses it and reveals the picker only once the platform reports the
 * hide, never after a guessed delay. When no keyboard is up there is nothing
 * to wait for and the picker reveals in the same commit.
 */
export function shouldWaitForKeyboardHide(keyboardVisible: boolean): boolean {
  return keyboardVisible;
}

/**
 * Forward-looking day choices, for a date that must be today or later — a
 * bill's next due date, a loan repayment date. Offered as a real run of
 * consecutive days rather than four shortcuts, because "when is this next
 * due" genuinely needs an arbitrary date; the surface scrolls internally.
 *
 * `minimumDate` semantics are preserved by construction: the list starts at
 * `today` and only goes forward, so a past date is unreachable.
 */
export function upcomingDateChoices(today: Date, count = 60): QuickDateChoice[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addLocalDays(today, i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' });
    return { key: `plus-${i}`, label, date };
  });
}

/** Every month, in order, for a month/year picker. */
export const MONTH_VALUES: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);

/** The month's own name, from the device locale. */
export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
}

/** The years a target may reasonably fall in: this year plus the next ten.
 * `today` is injected so this is deterministic under test. */
export function targetYearValues(today: Date, span = 11): number[] {
  const first = today.getFullYear();
  return Array.from({ length: span }, (_, i) => first + i);
}

/** "August 2026", or "Not set". Presentation only — the caller keeps the
 * month/year strings its own validator already reads. */
export function describeMonthYear(month: number | null, year: number | null): string {
  if (month === null || year === null) return 'Not set';
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'Not set';
  if (!Number.isInteger(year) || year < 1000) return 'Not set';
  return `${monthName(month)} ${year}`;
}

// ---------------------------------------------------------------------------
// Arbitrary historical dates
// ---------------------------------------------------------------------------

/**
 * Wave 6 correction A — the transaction date field offered only four
 * shortcuts (today, yesterday, 2 days ago, last week), so a customer
 * recording something from three weeks ago simply could not say so.
 *
 * The shortcuts stay — they are the overwhelmingly common cases and one tap
 * each. Below them sits one more row that opens a real calendar for any
 * valid past date. This is the SAME field and the SAME committed value; the
 * calendar is a second view of the same picker, not a second date system.
 */
export const CHOOSE_ANOTHER_DATE_KEY = 'choose-another';
export const CHOOSE_ANOTHER_DATE_LABEL = 'Choose another date…';

export interface MonthGridDay {
  /** Local midnight of this day. */
  date: Date;
  /** 1-31. */
  dayOfMonth: number;
  /** False for the leading/trailing blanks that pad the grid to whole weeks. */
  inMonth: boolean;
  /** True when this day is after the maximum selectable date. Disabled, and
   * announced as such — never silently coerced to something else. */
  disabled: boolean;
  isToday: boolean;
}

/** Local midnight — never UTC. A transaction dated "3 August" must stay 3
 * August regardless of the device's offset from UTC, so every date this
 * module produces is constructed from local Y/M/D parts rather than from an
 * ISO instant. */
export function localMidnight(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

export function startOfLocalMonth(date: Date): Date {
  return localMidnight(date.getFullYear(), date.getMonth(), 1);
}

/** Month arithmetic that cannot overflow: setting month 12 rolls the year,
 * and a day-of-month beyond the target month's length is impossible because
 * every grid day is constructed from the target month's own length. */
export function addLocalMonths(date: Date, delta: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth() + delta;
  return localMidnight(y + Math.floor(m / 12), ((m % 12) + 12) % 12, 1);
}

export function daysInLocalMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one — which is how
  // 29 February in a leap year is obtained without a leap-year rule here.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * One month as a 6x7 grid of days, padded with out-of-month blanks so every
 * month renders at the same height and the weekday columns always line up.
 *
 * `maximumDate` is inclusive: a day after it is `disabled`, present and
 * announced, never hidden and never quietly replaced by a different date.
 */
/**
 * Wave 6 (reminder snooze) — `minimumDate` is optional and defaults to
 * null, so every existing caller keeps its exact previous behaviour. It
 * exists because Snooze is the first date field in this app that looks
 * FORWARD: a transaction date can never be in the future, and a snooze
 * return day can never be in the past.
 */
export function buildMonthGrid(
  monthAnchor: Date,
  today: Date,
  maximumDate: Date | null,
  minimumDate: Date | null = null
): MonthGridDay[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = localMidnight(year, month, 1);
  const leading = first.getDay();
  const length = daysInLocalMonth(year, month);
  const maxMs = maximumDate ? localMidnight(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate()).getTime() : null;
  const todayMs = localMidnight(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const minMs = minimumDate ? localMidnight(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate()).getTime() : null;

  const cells: MonthGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - leading;
    const inMonth = dayOffset >= 0 && dayOffset < length;
    const date = localMidnight(year, month, dayOffset + 1);
    const ms = date.getTime();
    cells.push({
      date,
      dayOfMonth: date.getDate(),
      inMonth,
      disabled: (maxMs !== null && ms > maxMs) || (minMs !== null && ms < minMs),
      isToday: ms === todayMs,
    });
  }
  return cells;
}

/** Whether the calendar may step back/forward from this month. Forward is
 * barred once the month already contains the maximum selectable date, so a
 * customer never lands on a month with nothing selectable in it. */
export function canStepMonth(
  monthAnchor: Date,
  delta: number,
  maximumDate: Date | null,
  minimumDate: Date | null = null
): boolean {
  if (delta < 0) {
    // Symmetric to the forward rule: stepping back is barred once the
    // previous month holds nothing selectable.
    if (!minimumDate) return true;
    const previous = addLocalMonths(monthAnchor, delta);
    return previous.getTime() >= startOfLocalMonth(minimumDate).getTime();
  }
  if (!maximumDate) return true;
  const next = addLocalMonths(monthAnchor, delta);
  return next.getTime() <= startOfLocalMonth(maximumDate).getTime();
}

/** "August 2026" — the calendar's own heading. */
export function formatMonthHeading(monthAnchor: Date): string {
  return monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** The full, locale-appropriate spoken form of a selectable day. */
export function spokenGridDay(day: MonthGridDay): string {
  const full = day.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (day.disabled) return `${full}, unavailable — a transaction cannot be dated in the future`;
  return day.isToday ? `${full}, today` : full;
}
