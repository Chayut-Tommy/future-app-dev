import { AppData } from '../../types/models';
import { computeAdHocIncome } from './monthlySummary';
import { computeSafeToSpend } from './safeToSpend';
import { projectBnplOccurrences } from './bnpl';

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
  /** The user's chosen Savings allocation this month — $0 unless they've
   * explicitly turned it on. Field name kept for API stability; value now
   * sourced from safeToSpend.savingsAllocationMonthly, not an automatic
   * percentage. */
  emergencySetAside: number;
  available: number;
  /** Only set when there's a real, meaningfully positive gap after every
   * known bill, goal and buffer — never a fabricated "extra" figure. */
  surplus: number | null;
  /** Pure recurring-rate remainder — income minus fixed costs, goals and
   * Savings Allocation, with no actual-transaction activity mixed in
   * (passthrough of safeToSpend.discretionaryPool). The basis "Typical
   * Monthly Allocation"'s Unallocated row must use, never `available` (PRD
   * ask: that field blends this rate with pay-cycle-to-date spend and
   * calendar-month ad-hoc income from two different time windows). */
  discretionaryPool: number;
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
  const monthStart = new Date(year, month, 1);

  if (data.user.nextPayday) {
    const payday = new Date(data.user.nextPayday);
    if (payday.getFullYear() === year && payday.getMonth() === month) {
      dated.push({ date: data.user.nextPayday, label: 'Salary', amount: data.user.monthlyIncome, icon: 'cash-outline' });
    }
  }

  // BNPL, current calendar month — same window safeToSpend.ts's own
  // bnplMonthlyExpected uses (both derived from this same `today`), so
  // billsSetAside below (which reads that exact figure) can never disagree
  // with the sum of these individual line items. Handled as its own pass,
  // BEFORE the generic per-item loop below, because a BNPL plan can have
  // MULTIPLE occurrences due within one calendar month regardless of
  // frequency (a weekly BNPL repayment isn't a single "next due date," the
  // way an ordinary monthly bill is) — the generic loop's "one dated entry
  // per monthly item, or one recurring bucket per weekly/fortnightly item"
  // shape doesn't fit that, and raw `item.amount` would show the wrong,
  // uncapped figure regardless. `monthWalkEnd` is 1ms before the first
  // instant of the FOLLOWING month — an inclusive bound for the raw walk —
  // and every returned occurrence is still re-checked against the exact
  // year/month predicate below as a second, independent safeguard against
  // ever pulling in a next-month occurrence.
  const monthWalkEnd = new Date(new Date(year, month + 1, 1).getTime() - 1);
  const bnplLinkedItemIds = new Set<string>();
  for (const liability of data.liabilities) {
    if (liability.type !== 'bnpl') continue;
    const activeLinks = data.recurringItems.filter((r) => r.active && r.linkedLiabilityId === liability.id && r.type === 'expense');
    if (activeLinks.length !== 1) continue; // none or ambiguous — show nothing, never double-count (see resolveBnplLinkedItems's doc comment in bnpl.ts)
    const item = activeLinks[0];
    bnplLinkedItemIds.add(item.id);
    for (const occurrence of projectBnplOccurrences(item, liability, monthStart, monthWalkEnd)) {
      if (occurrence.date.getFullYear() !== year || occurrence.date.getMonth() !== month) continue;
      dated.push({
        date: occurrence.date.toISOString(),
        label: item.label,
        amount: -(occurrence.amountCents / 100),
        icon: item.icon ?? 'bag-handle-outline',
      });
    }
  }

  const recurring: MoneyPlanRecurring[] = [];
  data.recurringItems
    .filter((item) => item.active && !bnplLinkedItemIds.has(item.id))
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

  const safeToSpend = computeSafeToSpend(data, today);

  // Ad-hoc income already logged this month (a bonus, gift, refund) counts
  // toward what's actually available this month, same as it does for
  // Available Until Payday — but it's added here, not folded into
  // safeToSpend.remainingPool itself, so a one-off windfall never inflates
  // Lulu Score's read on ongoing, sustainable income (PRD ask, §5).
  const adHocIncomeThisMonth = computeAdHocIncome(data.transactions, monthStart, today);
  const available = Math.max(0, safeToSpend.remainingPool + adHocIncomeThisMonth);

  // "Surplus" must be the exact same figure as `available` — previously
  // this used a separate, incomplete calculation (monthly income minus
  // expenses only) that never subtracted goals or the savings plan, so it
  // could show a materially larger number than every other "remaining"
  // figure on the page (PRD bug report: surplus read $5,067 while Available
  // Until Payday and End of Month Outlook both correctly read $2,699).
  const surplus = available > 50 ? available : null;

  return {
    monthLabel,
    dated,
    recurring,
    // Includes bnplMonthlyExpected — the exact same current-calendar-month
    // figure the BNPL `dated` entries above were built from, so this total
    // can never disagree with the sum of those line items.
    billsSetAside: safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected,
    goalsSetAside: safeToSpend.goalContributionsMonthly,
    emergencySetAside: safeToSpend.savingsAllocationMonthly,
    available,
    surplus,
    discretionaryPool: safeToSpend.discretionaryPool,
  };
}
