import { PayFrequency, RecurringItem } from '../../types/models';

/** Monthly and irregular (which repeats monthly for projection purposes) are
 * the only frequencies that need an anchor day — weekly/fortnightly are
 * always exact day-count steps with no month-length ambiguity. */
export function usesScheduleAnchor(frequency: PayFrequency): boolean {
  return frequency === 'monthly' || frequency === 'irregular';
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** A stored scheduleAnchorDay is only ever safe to use in month math when it
 * is a whole number 1-31 — anything else (undefined, 0, a value above 31, a
 * fraction) either has no defined meaning or, worse, can push
 * anchoredMonthlyDate's `new Date(year, month, day)` into the wrong month
 * entirely (day 0 resolves to the last day of the PREVIOUS month in JS,
 * which is a real cross-month overflow, not just an odd clamp). */
export function isValidScheduleAnchorDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31;
}

/** The single place an anchor day is read for date math — falls back to the
 * given date's own day-of-month whenever the stored anchor is missing or
 * fails isValidScheduleAnchorDay, so a corrupt/legacy value can never reach
 * anchoredMonthlyDate. */
export function resolveValidAnchorDay(anchorDay: number | undefined, fallbackDateISO: string): number {
  if (isValidScheduleAnchorDay(anchorDay)) return anchorDay;
  return new Date(fallbackDateISO).getDate();
}

/** The single implementation of "what date is the anchor day in this target
 * month" — clamped to that month's last valid day when the anchor doesn't
 * exist there (e.g. day 31 in April), and restored automatically the next
 * time the target month is long enough, because every call recomputes from
 * (year, month0, day) directly rather than from a previously clamped date. */
export function anchoredMonthlyDate(year: number, month0: number, day: number): Date {
  const targetYear = year + Math.floor(month0 / 12);
  const targetMonth0 = ((month0 % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth0));
  return new Date(targetYear, targetMonth0, clampedDay);
}

/** The minimal shape the anchor-aware date functions below actually need —
 * narrower than the full RecurringItem so a caller with just these three
 * fields doesn't need to fabricate a fake RecurringItem. */
export interface RecurrenceAnchorInput {
  nextDueDate: string;
  frequency: PayFrequency;
  scheduleAnchorDay?: number;
}

/** Occurrence number `n` (n=0 is nextDueDate itself), computed independently
 * from item.nextDueDate's own (year, month) plus n intervals — never fed
 * from a previously computed/clamped occurrence, which is exactly what let
 * the old sequential stepDate() implementation permanently lose a day-29/30/31
 * anchor the first time it landed in a shorter month. */
function occurrenceDateAt(item: RecurrenceAnchorInput, n: number): Date {
  const base = new Date(item.nextDueDate);
  switch (item.frequency) {
    case 'weekly':
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n * 7);
    case 'fortnightly':
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n * 14);
    default: {
      // monthly, and irregular repeats monthly for projection purposes
      const anchorDay = resolveValidAnchorDay(item.scheduleAnchorDay, item.nextDueDate);
      return anchoredMonthlyDate(base.getFullYear(), base.getMonth() + n, anchorDay);
    }
  }
}

/** One step past this item's current nextDueDate, anchor-preserving — used
 * when advancing nextDueDate after a confirmed occurrence. */
export function advanceOneOccurrence(item: RecurrenceAnchorInput): Date {
  return occurrenceDateAt(item, 1);
}

export interface RecurringOccurrence {
  item: RecurringItem;
  date: Date;
}

/**
 * Every occurrence of an active recurring item (income or bill) that falls
 * within [from, to] inclusive, repeating forward from its own nextDueDate
 * at its own frequency — not just the first/next one (PRD bug report: "What
 * Happens Next" only ever showed a recurring item's very next occurrence,
 * then it vanished, and a multi-week Available Until Payday cycle only
 * counted one week of a weekly bill instead of all of them). The one shared
 * source both the Money Timeline and Available Until Payday read from, so
 * they can never disagree about what's due when.
 */
export function recurringOccurrencesInRange(items: RecurringItem[], from: Date, to: Date): RecurringOccurrence[] {
  const occurrences: RecurringOccurrence[] = [];
  for (const item of items) {
    if (!item.active) continue;
    if (item.nextDueDateUnknown) continue;
    let n = 0;
    let date = occurrenceDateAt(item, n);
    let iterations = 0;
    while (date.getTime() <= to.getTime() && iterations < 400) {
      if (date.getTime() >= from.getTime()) occurrences.push({ item, date });
      n++;
      const next = occurrenceDateAt(item, n);
      if (next.getTime() <= date.getTime()) break; // safety against a non-advancing frequency
      date = next;
      iterations++;
    }
  }
  return occurrences;
}
