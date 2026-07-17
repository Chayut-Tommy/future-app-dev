import { AppData } from '../../types/models';
import { toMonthlyAmount } from './incomeEngine';
import { brand } from '../brand';

export interface MonthlySummary {
  income: number;
  expenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  netCashflow: number;
  savingsRate: number;
}


export function computeMonthlySummary(data: AppData, today: Date = new Date()): MonthlySummary {
  return computeSummaryForMonth(data, today.getFullYear(), today.getMonth());
}

// Computes a summary bounded to one specific calendar month (used for
// "vs. last month" comparisons) rather than "month-to-date from today".
export function computeSummaryForMonth(data: AppData, year: number, month: number): MonthlySummary {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  // Excludes transactions auto-created by confirming a recurring bill
  // (recurringItemId set) — that bill's cost is already counted below via
  // fixedExpensesMonthly's recurring rate, so including the confirmation
  // transaction too would count the same bill twice (mirrors
  // computeAdHocIncome's identical exclusion on the income side).
  const loggedExpenses = data.transactions
    .filter((t) => t.type === 'expense' && !t.recurringItemId && new Date(t.date) >= monthStart && new Date(t.date) < monthEnd)
    .reduce((sum, t) => sum + t.amount, 0);

  const fixedExpensesMonthly = data.recurringItems
    .filter((item) => item.type === 'expense' && item.isFixed && item.active)
    .reduce((sum, item) => sum + toMonthlyAmount(item.amount, item.frequency), 0);

  const income = data.user.monthlyIncome;
  const expenses = loggedExpenses + fixedExpensesMonthly;
  const netCashflow = income - expenses;
  const savingsRate = income > 0 ? netCashflow / income : 0;

  return { income, expenses, fixedExpenses: fixedExpensesMonthly, variableExpenses: loggedExpenses, netCashflow, savingsRate };
}

/**
 * One-off income the user has actually logged in a date range — a bonus,
 * gift, tax refund, sale of shares — deliberately excluding transactions
 * auto-created by confirming a recurring income source arrived (PRD ask,
 * §5: recurring income and one-off income transactions must stay
 * completely separate, never double-counted). This is real cash that has
 * already landed, so it's added directly to "what's available right now"
 * views (Available Until Payday, Money Flow, Money Breakdown) — but never
 * folded into `monthlyIncome` itself, which stays a measure of ongoing,
 * sustainable income for Lulu Score and month-to-month comparisons.
 */
export function computeAdHocIncome(transactions: AppData['transactions'], from: Date, to: Date): number {
  return transactions
    .filter((t) => t.type === 'income' && !t.recurringItemId && new Date(t.date) >= from && new Date(t.date) <= to)
    .reduce((sum, t) => sum + t.amount, 0);
}

export interface MonthToDateActivity {
  income: number;
  spend: number;
}

/**
 * A literal "what's actually happened since the 1st" pulse check — every
 * logged transaction this calendar month, recurring-confirmed or ad-hoc
 * alike (PRD ask: Today's live month snapshot). Deliberately not the same
 * as MonthlySummary above: that one blends a monthly income *rate* with
 * logged expenses for budgeting math; this one is pure recorded activity,
 * so it naturally reads lower than the rate mid-month and matches Money
 * tab's Spending Tracker totals exactly.
 */
export function computeMonthToDateActivity(data: AppData, today: Date = new Date()): MonthToDateActivity {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const income = data.transactions
    .filter((t) => t.type === 'income' && new Date(t.date) >= monthStart && new Date(t.date) <= today)
    .reduce((sum, t) => sum + t.amount, 0);
  const spend = data.transactions
    .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart && new Date(t.date) <= today)
    .reduce((sum, t) => sum + t.amount, 0);
  return { income, spend };
}

/**
 * The single authoritative "recorded cashflow this month" figure — every
 * logged income transaction this calendar month minus every logged expense
 * transaction, recurring-confirmed or ad-hoc alike (thin wrapper over
 * `computeMonthToDateActivity`, never reconstructed independently). This is
 * *recorded* activity, distinct from `computeMonthlySummary`'s
 * `netCashflow`, which blends the recurring monthly income *rate* with
 * logged expenses for budgeting/Lulu-Score math — the two answer different
 * questions and must not be swapped (PRD bug report: Financial State copy
 * said "recorded cashflow" while actually reading the recurring-rate
 * figure, so a user with a one-off $50,000 income transaction still saw
 * "this month's cashflow is also tight," even though July So Far, Available
 * Until Payday, and Estimated Wealth Change — all of which already use this
 * same recorded-activity source — showed a strongly positive month).
 *
 * Any copy that says "recorded cashflow" (Financial State's Cashflow Focus
 * / Financial Rebuild variants) must use this function, not
 * `computeMonthlySummary`.
 */
export function computeRecordedMonthlyCashflow(data: AppData, today: Date = new Date()): number {
  const activity = computeMonthToDateActivity(data, today);
  return activity.income - activity.spend;
}

/**
 * Plain-language cashflow coaching (PRD ask: never show a raw extreme
 * percentage like "-937%" — that reads as broken, not helpful). Framed as
 * "you're spending more than you earn," a real gap in dollars, and a
 * supportive next step — never a shaming number.
 */
export function describeCashflowMessage(summary: MonthlySummary): string | null {
  if (summary.income <= 0) return null;
  if (summary.netCashflow < 0) {
    const gap = Math.round(Math.abs(summary.netCashflow)).toLocaleString();
    return `${brand.name} noticed your spending is higher than your income this month. Your current gap is about $${gap}. Reducing expenses or increasing income may help how much you can safely spend.`;
  }
  if (summary.savingsRate >= 0.01) {
    return `${brand.name} noticed you're saving about ${Math.round(summary.savingsRate * 100)}% of your income this month${
      summary.savingsRate >= 0.2 ? ' — a strong rate.' : '.'
    }`;
  }
  return "You're breaking even this month — every extra dollar saved helps.";
}
