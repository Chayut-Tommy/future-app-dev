import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';

export interface SpendingInsight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const PERIOD_DAYS = 30;

function sumByCategory(transactions: AppData['transactions']): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  }
  return map;
}

export interface CategoryDelta {
  categoryId: string;
  categoryName: string;
  amount: number;
  priorAmount: number;
  delta: number;
  changePct: number;
}

/** The category-vs-prior-period comparison, exposed on its own so behavior
 * coaching (goal-impact messages) can reuse the exact same numbers shown
 * in the Spending Insights panel, rather than recomputing separately. */
export function computeCategoryDeltas(data: AppData): CategoryDelta[] {
  const expenses = data.transactions.filter((t) => t.type === 'expense');
  const now = Date.now();
  const periodStart = now - PERIOD_DAYS * 86400000;
  const priorStart = now - PERIOD_DAYS * 2 * 86400000;
  const thisPeriod = expenses.filter((t) => new Date(t.date).getTime() >= periodStart);
  const priorPeriod = expenses.filter((t) => {
    const time = new Date(t.date).getTime();
    return time >= priorStart && time < periodStart;
  });
  const thisMap = sumByCategory(thisPeriod);
  const priorMap = sumByCategory(priorPeriod);

  const deltas: CategoryDelta[] = [];
  for (const [categoryId, amount] of thisMap) {
    const priorAmount = priorMap.get(categoryId) ?? 0;
    if (priorAmount < 20) continue;
    const category = data.categories.find((c) => c.id === categoryId);
    deltas.push({
      categoryId,
      categoryName: category?.name ?? 'Spending',
      amount,
      priorAmount,
      delta: amount - priorAmount,
      changePct: (amount - priorAmount) / priorAmount,
    });
  }
  return deltas.sort((a, b) => b.delta - a.delta);
}

/**
 * Real, derived spending patterns from the user's own transactions — this
 * period vs. the prior period, largest category, daily average, and a
 * weekend-vs-weekday comparison. Empty until enough transactions exist;
 * never fabricated.
 */
export function computeSpendingInsights(data: AppData): SpendingInsight[] {
  const expenses = data.transactions.filter((t) => t.type === 'expense');
  if (expenses.length === 0) return [];

  const now = Date.now();
  const periodStart = now - PERIOD_DAYS * 86400000;
  const priorStart = now - PERIOD_DAYS * 2 * 86400000;

  const thisPeriod = expenses.filter((t) => new Date(t.date).getTime() >= periodStart);
  const priorPeriod = expenses.filter((t) => {
    const time = new Date(t.date).getTime();
    return time >= priorStart && time < periodStart;
  });

  if (thisPeriod.length === 0) return [];

  const insights: SpendingInsight[] = [];
  const thisMap = sumByCategory(thisPeriod);

  // Category trend changes (only where there's a meaningful prior baseline)
  for (const d of computeCategoryDeltas(data)) {
    if (Math.abs(d.changePct) >= 0.15) {
      const pct = Math.round(Math.abs(d.changePct) * 100);
      insights.push({
        icon: d.changePct > 0 ? 'trending-up-outline' : 'trending-down-outline',
        title: `${d.categoryName} ${d.changePct > 0 ? 'increased' : 'decreased'} ${pct}%`,
        body: `$${Math.round(d.amount)} in the last ${PERIOD_DAYS} days, vs $${Math.round(d.priorAmount)} the period before.`,
      });
    }
  }

  // Largest category this period
  let largestCategoryId: string | null = null;
  let largestAmount = 0;
  for (const [categoryId, amount] of thisMap) {
    if (amount > largestAmount) {
      largestAmount = amount;
      largestCategoryId = categoryId;
    }
  }
  if (largestCategoryId) {
    const category = data.categories.find((c) => c.id === largestCategoryId);
    insights.push({
      icon: 'pie-chart-outline',
      title: 'Largest category',
      body: `${category?.name ?? 'This category'} is your biggest spend area — $${Math.round(largestAmount)} in the last ${PERIOD_DAYS} days.`,
    });
  }

  // Average daily spend
  const totalThisPeriod = [...thisMap.values()].reduce((sum, v) => sum + v, 0);
  insights.push({
    icon: 'today-outline',
    title: 'Average daily spend',
    body: `About $${Math.round(totalThisPeriod / PERIOD_DAYS)}/day over the last ${PERIOD_DAYS} days.`,
  });

  // Weekend vs. weekday
  let weekendTotal = 0;
  let weekdayTotal = 0;
  let weekendDays = 0;
  let weekdayDays = 0;
  for (let i = 0; i < PERIOD_DAYS; i++) {
    const day = new Date(now - i * 86400000).getDay();
    if (day === 0 || day === 6) weekendDays++;
    else weekdayDays++;
  }
  for (const t of thisPeriod) {
    const day = new Date(t.date).getDay();
    if (day === 0 || day === 6) weekendTotal += t.amount;
    else weekdayTotal += t.amount;
  }
  const weekendAvg = weekendDays > 0 ? weekendTotal / weekendDays : 0;
  const weekdayAvg = weekdayDays > 0 ? weekdayTotal / weekdayDays : 0;
  if (weekendAvg > 0 && weekendAvg > weekdayAvg * 1.15) {
    insights.push({
      icon: 'calendar-outline',
      title: 'Weekend spending is higher',
      body: `You spend about $${Math.round(weekendAvg)}/day on weekends, vs $${Math.round(weekdayAvg)}/day on weekdays.`,
    });
  } else if (weekdayAvg > 0 && weekdayAvg > weekendAvg * 1.15) {
    insights.push({
      icon: 'calendar-outline',
      title: 'Weekday spending is higher',
      body: `You spend about $${Math.round(weekdayAvg)}/day on weekdays, vs $${Math.round(weekendAvg)}/day on weekends.`,
    });
  }

  return insights.slice(0, 6);
}
