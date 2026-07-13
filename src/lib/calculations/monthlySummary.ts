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

  const loggedExpenses = data.transactions
    .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart && new Date(t.date) < monthEnd)
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
