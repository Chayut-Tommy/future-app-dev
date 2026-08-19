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
