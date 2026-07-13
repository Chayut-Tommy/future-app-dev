import { AppData, PayFrequency } from '../../types/models';
import { computeGoalAllocation, GoalAllocationResult } from './goalAllocation';
import { toMonthlyAmount } from './incomeEngine';
import { computeLiquidCash } from './liquidAssets';
import { computeMonthlySummary } from './monthlySummary';

export interface SafeToSpendResult {
  discretionaryPool: number;
  remainingPool: number;
  daysRemaining: number;
  dailyAllowance: number;
  cycleStart: Date;
  cycleEnd: Date;
  fixedExpensesMonthly: number;
  goalContributionsMonthly: number;
  /** Automatically reserved when no goal is claiming a contribution, so
   * Lulu never implies 100% of income is "safe to spend" (PRD ask). */
  defaultSavingsBuffer: number;
  /** Per-goal breakdown of what's funded vs. requested, in priority order
   * (PRD ask: never silently ignore a goal, and multi-goal math must be
   * transparent). */
  goalAllocation: GoalAllocationResult;
  /** Expenses logged with today's date — what's driving today's plan vs.
   * actual (PRD ask: Safe to Spend should react to spending as it happens). */
  todaysSpend: number;
  /** What today's allowance would have been without today's spend — the
   * "before" figure the reactive messaging compares against. */
  plannedDailyAllowance: number;
  /** Total expense transactions logged so far this cycle — a named field
   * for the "how Lulu calculated this" breakdown, rather than making
   * callers reverse-engineer it from discretionaryPool - remainingPool. */
  spendSoFarThisCycle: number;
  /** True only when the user has an actual confirmed next-payday date.
   * Everything else (irregular income, or a regular income with no date
   * yet entered) must never present a daily figure as if a real payday
   * cycle backs it (PRD ask, §4: "do not invent one"). */
  hasKnownPayday: boolean;
  /** Cash-runway estimate for when there's no known payday to anchor a
   * cycle to — "at recent spending, current cash could last about N days"
   * — a genuinely different calculation from the payday-based daily
   * allowance above, not just a relabelling of it (PRD ask, §4: "for
   * irregular income, show a current-cash runway calculation rather than
   * pretending another payment is scheduled"). Null when there isn't
   * enough real spending history to estimate a daily rate.
   */
  cashRunwayDays: number | null;
}

// One pay cycle's length in days, used to derive a cycle start when we only
// know the next payday. Irregular income falls back to a rolling 30-day
// window per the PRD's documented MVP limitation.
function cycleLengthDays(frequency: PayFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 7;
    case 'fortnightly':
      return 14;
    case 'monthly':
      return 30;
    case 'irregular':
    default:
      return 30;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeFixedCosts(data: AppData): number {
  const fixedExpensesMonthly = data.recurringItems
    .filter((item) => item.type === 'expense' && item.isFixed && item.active)
    .reduce((sum, item) => sum + toMonthlyAmount(item.amount, item.frequency), 0);
  const creditCardMinimums = data.creditCards.reduce((sum, card) => sum + card.minimumPayment, 0);
  return fixedExpensesMonthly + creditCardMinimums;
}

export function computeSafeToSpend(data: AppData, today: Date = new Date()): SafeToSpendResult {
  const { user } = data;
  const cycleDays = cycleLengthDays(user.payFrequency);

  // With a known payday, the cycle is the cycleDays leading up to it. With
  // no known payday, we don't know the real cycle boundaries — the safest
  // assumption is "a fresh cycle started today," anchored at midnight so a
  // transaction logged today is never accidentally excluded (a transaction
  // dated "today" is stored at midnight, not the current time of day).
  let cycleStart: Date;
  let cycleEnd: Date;
  if (user.nextPayday) {
    cycleEnd = new Date(user.nextPayday);
    cycleStart = new Date(cycleEnd.getTime() - cycleDays * 86400000);
  } else {
    cycleStart = startOfDay(today);
    cycleEnd = new Date(cycleStart.getTime() + cycleDays * 86400000);
  }

  const fixedCosts = computeFixedCosts(data);
  const availableForGoals = user.monthlyIncome - fixedCosts;
  const goalAllocation = computeGoalAllocation(data, availableForGoals);
  const goalContributionsMonthly = goalAllocation.totalAllocatedMonthly;

  // Lulu always encourages saving, alongside goals rather than instead of
  // them (PRD ask) — a default 10% of income, or the user's own target if
  // they've set one. This is the one savings figure Safe to Spend, Money
  // Flow, and Lulu Money Plan all read from, so they can never contradict
  // each other.
  const defaultSavingsBuffer = user.savingsBufferOverride ?? user.monthlyIncome * 0.1;

  const discretionaryPool = Math.max(
    0,
    user.monthlyIncome - fixedCosts - goalContributionsMonthly - defaultSavingsBuffer
  );

  // Transactions the user logs are treated as variable/discretionary spend —
  // fixed expenses are already accounted for via recurring items above.
  const variableSpendSoFar = data.transactions
    .filter(
      (t) => t.type === 'expense' && new Date(t.date) >= cycleStart && new Date(t.date) <= today
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const remainingPool = discretionaryPool - variableSpendSoFar;

  const daysRemaining = Math.max(
    1,
    Math.ceil((cycleEnd.getTime() - today.getTime()) / 86400000)
  );

  const dailyAllowance = remainingPool / daysRemaining;

  // Today's spend, isolated, so Safe to Spend can react to it directly
  // rather than only moving the number tomorrow (PRD ask: "Lulu should
  // feel alive"). Comparing against the allowance with today's spend
  // added back gives a fair "before vs. after" for the day.
  const todaysSpend = data.transactions
    .filter((t) => t.type === 'expense' && startOfDay(new Date(t.date)).getTime() === startOfDay(today).getTime())
    .reduce((sum, t) => sum + t.amount, 0);
  const plannedDailyAllowance = (remainingPool + todaysSpend) / daysRemaining;

  const hasKnownPayday = !!user.nextPayday;
  let cashRunwayDays: number | null = null;
  if (!hasKnownPayday) {
    const liquidCash = computeLiquidCash(data.assets);
    const averageDailySpend = computeMonthlySummary(data, today).expenses / 30;
    if (liquidCash > 0 && averageDailySpend > 0) {
      cashRunwayDays = Math.floor(liquidCash / averageDailySpend);
    }
  }

  return {
    discretionaryPool,
    remainingPool,
    daysRemaining,
    dailyAllowance,
    cycleStart,
    cycleEnd,
    fixedExpensesMonthly: fixedCosts,
    goalContributionsMonthly,
    defaultSavingsBuffer,
    goalAllocation,
    todaysSpend,
    plannedDailyAllowance,
    spendSoFarThisCycle: variableSpendSoFar,
    hasKnownPayday,
    cashRunwayDays,
  };
}
