import { AppData } from '../../types/models';
import { FlowPeriod, fromMonthlyAmount, toMonthlyAmount } from './incomeEngine';
import { computeSafeToSpend } from './safeToSpend';
import { resolveExpectedMonthlyRepayment } from './creditHealth';
import { listBnplLiabilities, projectBnplOccurrencesForLiability } from './bnpl';
import { reconcileDisplayedAmounts } from './displayReconciliation';

/**
 * The shared, itemised sibling to Typical Money Flow / Typical Monthly
 * Allocation's existing category totals (correction round, 2026-08-10).
 * Reuses `computeSafeToSpend`'s own already-produced totals as the
 * authoritative source of truth for every category (never re-derives
 * `fixedExpensesMonthly`/`bnplMonthlyExpected`/`savingsAllocationMonthly`/
 * `goalContributionsMonthly` independently) — this function only adds
 * itemisation and whole-dollar display reconciliation on top of numbers
 * that already exist. Both Typical Money Flow (parameterised by the
 * selected period) and Typical Monthly Allocation (always `'monthly'`)
 * call this one function; neither computes its own total separately.
 */
export type MoneyFlowCategory = 'income' | 'bills' | 'savings' | 'goals';
export type MoneyFlowPeriod = FlowPeriod;

export interface MoneyFlowBreakdownItem {
  key: string;
  label: string;
  supportingText?: string;
  /** Whole-dollar, non-negative, customer-facing contribution magnitude —
   * always a multiple of 100. Reconciled against `totalCents` via
   * `reconcileDisplayedAmounts` (the same largest-remainder helper already
   * used for goal rows in What Happens Next) — never independently
   * rounded per item. */
  amountCents: number;
  sourceKind: 'recurring_income' | 'recurring_bill' | 'credit_card_repayment' | 'bnpl' | 'savings_allocation' | 'goal';
}

export interface MoneyFlowCategoryBreakdown {
  category: MoneyFlowCategory;
  period: MoneyFlowPeriod;
  /** Sum of every item's amountCents, exactly — never a synthetic
   * balancing row. */
  totalCents: number;
  items: MoneyFlowBreakdownItem[];
  configurationState: 'not_configured' | 'configured_zero' | 'configured_nonzero' | 'inactive_or_excluded';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'weekly':
      return 'Weekly';
    case 'fortnightly':
      return 'Fortnightly';
    case 'monthly':
      return 'Monthly';
    default:
      return 'Irregular timing';
  }
}

function billSupportingText(frequency: string, nextDueDate: string): string {
  if (frequency === 'monthly') {
    const day = new Date(nextDueDate).getDate();
    return Number.isFinite(day) ? `Monthly, due on the ${ordinal(day)}` : 'Monthly';
  }
  return frequencyLabel(frequency);
}

/** Reconciles a list of {key, rawMagnitude} pairs (same period, same sign,
 * already period-scaled) into whole-dollar item rows plus the exact total
 * they sum to — the ONE place this function ever rounds anything. */
function reconcileToItems(
  entries: { key: string; label: string; supportingText?: string; sourceKind: MoneyFlowBreakdownItem['sourceKind']; rawMagnitude: number }[]
): { items: MoneyFlowBreakdownItem[]; totalCents: number } {
  const positive = entries.filter((e) => e.rawMagnitude > 0);
  if (positive.length === 0) return { items: [], totalCents: 0 };
  const reconciled = reconcileDisplayedAmounts(positive.map((e) => ({ id: e.key, amount: e.rawMagnitude })));
  const byId = new Map(reconciled.map((r) => [r.id, r.displayAmount]));
  const items = positive.map((e) => ({
    key: e.key,
    label: e.label,
    supportingText: e.supportingText,
    amountCents: Math.round((byId.get(e.key) ?? 0) * 100),
    sourceKind: e.sourceKind,
  }));
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  return { items, totalCents };
}

function buildIncomeBreakdown(data: AppData, period: MoneyFlowPeriod): MoneyFlowCategoryBreakdown {
  const allIncomeItems = data.recurringItems.filter((r) => r.type === 'income');
  const activeIncomeItems = allIncomeItems.filter((r) => r.active);

  const entries = activeIncomeItems.map((r) => ({
    key: r.id,
    label: r.label,
    supportingText: frequencyLabel(r.frequency),
    sourceKind: 'recurring_income' as const,
    rawMagnitude: fromMonthlyAmount(toMonthlyAmount(r.amount, r.frequency), period),
  }));

  const { items, totalCents } = reconcileToItems(entries);

  const configurationState: MoneyFlowCategoryBreakdown['configurationState'] =
    activeIncomeItems.length === 0
      ? allIncomeItems.length > 0
        ? 'inactive_or_excluded'
        : 'not_configured'
      : totalCents === 0
      ? 'configured_zero'
      : 'configured_nonzero';

  return { category: 'income', period, totalCents, items, configurationState };
}

function buildBillsBreakdown(data: AppData, period: MoneyFlowPeriod, today: Date): MoneyFlowCategoryBreakdown {
  const allOrdinaryBills = data.recurringItems.filter((r) => r.type === 'expense' && r.isFixed);
  const activeOrdinaryBills = allOrdinaryBills.filter((r) => r.active);

  const billEntries = activeOrdinaryBills.map((r) => ({
    key: r.id,
    label: r.label,
    supportingText: billSupportingText(r.frequency, r.nextDueDate),
    sourceKind: 'recurring_bill' as const,
    rawMagnitude: fromMonthlyAmount(toMonthlyAmount(r.amount, r.frequency), period),
  }));

  const cardEntries = data.creditCards.map((c) => ({
    key: `card:${c.id}`,
    label: c.label,
    supportingText: 'Credit-card repayment',
    sourceKind: 'credit_card_repayment' as const,
    rawMagnitude: fromMonthlyAmount(resolveExpectedMonthlyRepayment(c), period),
  }));

  // Identical current-calendar-month window computeSafeToSpend/
  // computeBnplCostsForWindow use — local month start (included), the
  // instant before the first day of next month (included), first day of
  // next month itself excluded. Built from the caller's own `today`, never
  // `new Date()`.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthEndInclusive = new Date(monthEnd.getTime() - 1);

  const bnplEntries = listBnplLiabilities(data).flatMap((liability) => {
    const occurrences = projectBnplOccurrencesForLiability(data, liability, monthStart, monthEndInclusive);
    if (occurrences.length === 0) return [];
    const cents = occurrences.reduce((sum, o) => sum + o.amountCents, 0);
    const isFinal = occurrences.some((o) => o.isFinal);
    return [
      {
        key: `bnpl:${liability.id}`,
        label: liability.label,
        supportingText: isFinal ? 'Final repayment on this plan' : 'BNPL repayment',
        sourceKind: 'bnpl' as const,
        rawMagnitude: fromMonthlyAmount(cents / 100, period),
      },
    ];
  });

  const { items, totalCents } = reconcileToItems([...billEntries, ...cardEntries, ...bnplEntries]);

  const hasAnyBillRecord = allOrdinaryBills.length > 0 || data.creditCards.length > 0 || listBnplLiabilities(data).length > 0;
  const hasActiveContribution =
    activeOrdinaryBills.length > 0 || data.creditCards.some((c) => resolveExpectedMonthlyRepayment(c) > 0) || bnplEntries.length > 0;
  const configurationState: MoneyFlowCategoryBreakdown['configurationState'] = !hasAnyBillRecord
    ? 'not_configured'
    : totalCents === 0
    ? hasActiveContribution
      ? 'configured_zero'
      : 'inactive_or_excluded'
    : 'configured_nonzero';

  return { category: 'bills', period, totalCents, items, configurationState };
}

function buildSavingsBreakdown(data: AppData, period: MoneyFlowPeriod, today: Date): MoneyFlowCategoryBreakdown {
  const setting = data.user.savingsAllocation;
  if (!setting || setting.mode === 'off') {
    return { category: 'savings', period, totalCents: 0, items: [], configurationState: 'not_configured' };
  }
  const safeToSpend = computeSafeToSpend(data, today);
  const supportingText =
    setting.mode === 'percent'
      ? `${Math.round((setting.percent ?? 0) * 100)}% of income`
      : 'Fixed monthly amount';
  const entries = [
    {
      key: 'savings-allocation',
      label: 'Savings allocation',
      supportingText,
      sourceKind: 'savings_allocation' as const,
      rawMagnitude: fromMonthlyAmount(safeToSpend.savingsAllocationMonthly, period),
    },
  ];
  const { items, totalCents } = reconcileToItems(entries);
  return {
    category: 'savings',
    period,
    totalCents,
    items,
    configurationState: totalCents === 0 ? 'configured_zero' : 'configured_nonzero',
  };
}

function buildGoalsBreakdown(data: AppData, period: MoneyFlowPeriod, today: Date): MoneyFlowCategoryBreakdown {
  if (data.goals.length === 0) {
    return { category: 'goals', period, totalCents: 0, items: [], configurationState: 'not_configured' };
  }
  const safeToSpend = computeSafeToSpend(data, today);
  const entries = safeToSpend.goalAllocation.allocations.map((a) => ({
    key: a.goal.id,
    label: a.goal.name,
    supportingText:
      a.goal.priority === 'high' ? 'High priority' : a.goal.priority === 'flexible' ? 'Flexible priority' : 'Medium priority',
    sourceKind: 'goal' as const,
    rawMagnitude: fromMonthlyAmount(a.allocatedMonthly, period),
  }));
  const { items, totalCents } = reconcileToItems(entries);
  const activeGoalsExist = data.goals.some((g) => g.status === 'active');
  const configurationState: MoneyFlowCategoryBreakdown['configurationState'] =
    items.length === 0 ? (activeGoalsExist ? 'configured_zero' : 'inactive_or_excluded') : 'configured_nonzero';
  return { category: 'goals', period, totalCents, items, configurationState };
}

export function computeMoneyFlowCategoryBreakdown(
  data: AppData,
  category: MoneyFlowCategory,
  period: MoneyFlowPeriod,
  today: Date
): MoneyFlowCategoryBreakdown {
  switch (category) {
    case 'income':
      return buildIncomeBreakdown(data, period);
    case 'bills':
      return buildBillsBreakdown(data, period, today);
    case 'savings':
      return buildSavingsBreakdown(data, period, today);
    case 'goals':
      return buildGoalsBreakdown(data, period, today);
  }
}
