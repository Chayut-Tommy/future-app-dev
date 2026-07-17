import { PayFrequency, RecurringItem } from '../../types/models';

function stepDate(date: Date, frequency: PayFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      break;
    default:
      d.setMonth(d.getMonth() + 1); // monthly, and irregular repeats monthly for projection purposes
      break;
  }
  return d;
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
    let date = new Date(item.nextDueDate);
    let iterations = 0;
    while (date.getTime() <= to.getTime() && iterations < 400) {
      if (date.getTime() >= from.getTime()) occurrences.push({ item, date: new Date(date) });
      const next = stepDate(date, item.frequency);
      if (next.getTime() <= date.getTime()) break; // safety against a non-advancing frequency
      date = next;
      iterations++;
    }
  }
  return occurrences;
}
