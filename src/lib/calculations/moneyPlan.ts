import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';
import { computeSafeToSpend } from './safeToSpend';

export interface MoneyPlanEntry {
  date: string; // ISO
  label: string;
  amount: number; // signed — positive for income, negative for a bill
  icon: string;
}

export interface MoneyPlanRecurring {
  label: string;
  amount: number;
  frequencyNoun: 'week' | 'fortnight';
  icon: string;
}

export interface MoneyPlan {
  monthLabel: string;
  /** This calendar month's known dated entries — salary and bills whose
   * due date actually falls this month, sorted chronologically. Never a
   * projected/guessed date (PRD's no-fake-data rule). */
  dated: MoneyPlanEntry[];
  /** Weekly/fortnightly recurring items shown separately since they don't
   * have a single date within the month. */
  recurring: MoneyPlanRecurring[];
  billsSetAside: number;
  goalsSetAside: number;
  emergencySetAside: number;
  available: number;
  /** Only set when there's a real, meaningfully positive gap after every
   * known bill, goal and buffer — never a fabricated "extra" figure. */
  surplus: number | null;
}

/**
 * "Lulu Money Plan" — organizes the month ahead from data Lulu already has
 * (salary date, bills, goals, savings buffer), rather than asking the user
 * to plan it themselves (PRD ask: "less manual tracking, more prediction").
 * Every figure here is pulled from the same engines that power Safe to
 * Spend and Money Flow, so the numbers never contradict each other.
 */
export function computeMoneyPlan(data: AppData, today: Date = new Date()): MoneyPlan {
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long' });
  const year = today.getFullYear();
  const month = today.getMonth();

  const dated: MoneyPlanEntry[] = [];

  if (data.user.nextPayday) {
    const payday = new Date(data.user.nextPayday);
    if (payday.getFullYear() === year && payday.getMonth() === month) {
      dated.push({ date: data.user.nextPayday, label: 'Salary', amount: data.user.monthlyIncome, icon: 'cash-outline' });
    }
  }

  const recurring: MoneyPlanRecurring[] = [];
  data.recurringItems
    .filter((item) => item.active)
    .forEach((item) => {
      if (item.frequency === 'weekly' || item.frequency === 'fortnightly') {
        recurring.push({
          label: item.label,
          amount: item.amount,
          frequencyNoun: item.frequency === 'weekly' ? 'week' : 'fortnight',
          icon: item.icon ?? 'repeat-outline',
        });
        return;
      }
      const due = new Date(item.nextDueDate);
      if (due.getFullYear() === year && due.getMonth() === month) {
        dated.push({
          date: item.nextDueDate,
          label: item.label,
          amount: item.type === 'income' ? item.amount : -item.amount,
          icon: item.icon ?? (item.type === 'income' ? 'cash-outline' : 'calendar-outline'),
        });
      }
    });

  dated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const summary = computeMonthlySummary(data);
  const safeToSpend = computeSafeToSpend(data, today);

  const surplus = summary.netCashflow > 50 ? summary.netCashflow : null;

  return {
    monthLabel,
    dated,
    recurring,
    billsSetAside: safeToSpend.fixedExpensesMonthly,
    goalsSetAside: safeToSpend.goalContributionsMonthly,
    emergencySetAside: safeToSpend.defaultSavingsBuffer,
    available: Math.max(0, safeToSpend.remainingPool),
    surplus,
  };
}
