import { AppData, Goal } from '../../types/models';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, flexible: 2 };
// Used only when a goal has no target date yet, so a goal is never
// silently dropped from the calculation just because a date wasn't set
// (PRD ask: "do not silently ignore goals").
const DEFAULT_HORIZON_MONTHS = 36;

export interface GoalAllocation {
  goal: Goal;
  requiredMonthly: number;
  allocatedMonthly: number;
  isFullyFunded: boolean;
  /** Only set when underfunded — the real projected completion at what
   * Lulu could actually allocate, not the date the user asked for. */
  projectedCompletionLabel: string | null;
}

export interface GoalAllocationResult {
  allocations: GoalAllocation[];
  totalRequiredMonthly: number;
  totalAllocatedMonthly: number;
  isFullyFunded: boolean;
  availableForGoals: number;
}

function monthsUntil(targetDate: string | null): number {
  if (!targetDate) return DEFAULT_HORIZON_MONTHS;
  const months = (new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
  return Math.max(1, months);
}

/** The monthly amount Lulu calculates is needed to hit this goal on time —
 * works even without a target date (falls back to a 3-year horizon) so
 * every goal with a target amount is always part of the calculation. */
export function requiredMonthlyForGoal(goal: Goal): number {
  if (!goal.targetAmount || goal.status !== 'active') return 0;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return 0;
  return remaining / monthsUntil(goal.targetDate);
}

function formatProjectedCompletion(goal: Goal, allocatedMonthly: number): string | null {
  const remaining = (goal.targetAmount ?? 0) - goal.currentAmount;
  if (remaining <= 0 || allocatedMonthly <= 0) return null;
  const months = Math.ceil(remaining / allocatedMonthly);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  // A goal that's years away reads better as just a year ("around 2032")
  // than a specific month.
  return months > 18 ? String(date.getFullYear()) : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/**
 * Allocates whatever's available (income after fixed costs) across active
 * goals in priority order — high-priority goals are funded first, so if
 * money runs out it's the flexible goals that slip, never a silent,
 * unexplained shortfall (PRD ask).
 */
export function computeGoalAllocation(data: AppData, availableForGoals: number): GoalAllocationResult {
  const candidates = data.goals
    .filter((g) => g.status === 'active' && g.targetAmount && g.targetAmount > g.currentAmount)
    .map((g) => ({ goal: g, requiredMonthly: requiredMonthlyForGoal(g) }))
    .filter((c) => c.requiredMonthly > 0)
    .sort((a, b) => (PRIORITY_ORDER[a.goal.priority ?? 'medium'] ?? 1) - (PRIORITY_ORDER[b.goal.priority ?? 'medium'] ?? 1));

  let remainingBudget = Math.max(0, availableForGoals);
  const allocations: GoalAllocation[] = candidates.map(({ goal, requiredMonthly }) => {
    const allocatedMonthly = Math.min(requiredMonthly, remainingBudget);
    remainingBudget -= allocatedMonthly;
    const isFullyFunded = allocatedMonthly >= requiredMonthly - 0.5;
    return {
      goal,
      requiredMonthly,
      allocatedMonthly,
      isFullyFunded,
      projectedCompletionLabel: isFullyFunded ? null : formatProjectedCompletion(goal, allocatedMonthly),
    };
  });

  const totalRequiredMonthly = allocations.reduce((sum, a) => sum + a.requiredMonthly, 0);
  const totalAllocatedMonthly = allocations.reduce((sum, a) => sum + a.allocatedMonthly, 0);

  return {
    allocations,
    totalRequiredMonthly,
    totalAllocatedMonthly,
    isFullyFunded: allocations.every((a) => a.isFullyFunded),
    availableForGoals,
  };
}
