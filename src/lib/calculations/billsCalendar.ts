import { RecurringItem } from '../../types/models';

export interface UpcomingBill {
  item: RecurringItem;
  daysUntil: number;
}

/** Upcoming recurring expenses, soonest first — the same "due date" idea
 * already used for credit cards, applied to any bill the user has added. */
export function computeUpcomingBills(items: RecurringItem[], withinDays: number = 31): UpcomingBill[] {
  const now = Date.now();
  return items
    .filter((i) => i.type === 'expense' && i.active)
    .map((i) => ({ item: i, daysUntil: Math.round((new Date(i.nextDueDate).getTime() - now) / 86400000) }))
    .filter((b) => b.daysUntil >= -1 && b.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
