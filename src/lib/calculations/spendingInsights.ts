import { Ionicons } from '@expo/vector-icons';
import { AppData, Transaction } from '../../types/models';
import { resolveTransactionCategoryCoachingAmount } from './repaymentAccounting';

export interface SpendingInsight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const PERIOD_DAYS = 30;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A confirmed expense transaction paired with its resolved eligible
 * category-coaching amount (2D-NARROW correction, final debt-cost pass) —
 * an ordinary bill's full amount, a credit-card/BNPL repayment's $0, or a
 * loan repayment's $0 (every loan repayment — known-split, interest-only,
 * and unknown-split alike — is excluded from category-based coaching; see
 * resolveTransactionCategoryCoachingAmount's own doc comment for why: no
 * established debt-interest category exists in this codebase, so a loan
 * repayment's known interest/fees still count in aggregate spending
 * elsewhere, but must never be fabricated into 'cat-debt' here). Every
 * category/trend/pattern insight below derives from this resolved amount,
 * never the transaction's raw `t.amount`. */
interface ResolvedExpense {
  t: Transaction;
  amount: number;
}

/** Every expense transaction with a non-zero eligible category-coaching
 * amount — a repayment (or any loan repayment) that resolves to exactly $0
 * is excluded entirely here (not kept as a zero-amount row), since it
 * contributes nothing to any of this file's category/trend/pattern/
 * count-based insights and would only pad transaction counts (e.g. the
 * weekday-pattern minimum-count check) with a non-eligible event. */
function resolvedExpenses(data: AppData): ResolvedExpense[] {
  return data.transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({ t, amount: resolveTransactionCategoryCoachingAmount(data, t) }))
    .filter((e) => e.amount > 0);
}

function sumByCategory(expenses: ResolvedExpense[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    map.set(e.t.categoryId, (map.get(e.t.categoryId) ?? 0) + e.amount);
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
  // 2D-NARROW correction — every category/trend/pattern insight in this
  // file derives from resolvedExpenses' resolved ELIGIBLE CATEGORY-COACHING
  // amount, not the transaction's raw `t.amount` and not the (wider)
  // aggregate cashflow amount used elsewhere (see resolvedExpenses' own doc
  // comment for the full per-type contract, and repaymentAccounting.ts's
  // module header for why the two concepts are deliberately separate). This
  // both (a) replaces a prior round's blanket `!t.recurringItemId &&
  // !t.isRepayment` exclusion, which incorrectly caught ordinary bills too
  // — the device test's own proof (a confirmed $50 bill correctly increased
  // recorded spending by $50) applies identically to category coaching
  // here — and (b) excludes every loan repayment (not just unknown-split)
  // from category coaching, since no established debt-interest category
  // exists to honestly attribute a known interest/fees amount to.
  const expenses = resolvedExpenses(data);
  const now = Date.now();
  const periodStart = now - PERIOD_DAYS * 86400000;
  const priorStart = now - PERIOD_DAYS * 2 * 86400000;
  const thisPeriod = expenses.filter((e) => new Date(e.t.date).getTime() >= periodStart);
  const priorPeriod = expenses.filter((e) => {
    const time = new Date(e.t.date).getTime();
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
 * Real, derived spending patterns from the user's own transactions — never
 * a technically-true-but-meaningless comparison (PRD bug report: "Weekend
 * spending is higher than weekdays" fired off $60/day weekend vs $0/day
 * weekday, which is noise, not a pattern). Every insight here requires a
 * real baseline and a clear enough margin before it's shown; empty until
 * enough transactions exist, never fabricated.
 */
export function computeSpendingInsights(data: AppData): SpendingInsight[] {
  // 2D-NARROW correction, Gate 2 — same resolvedExpenses base set as
  // computeCategoryDeltas above (its own doc comment has the full
  // reasoning), used here too since this function's overall-trend,
  // subscription-total, weekday-pattern, and average-daily-spend insights
  // all derive from this same base set independently of computeCategoryDeltas.
  const expenses = resolvedExpenses(data);
  if (expenses.length === 0) return [];

  const now = Date.now();
  const periodStart = now - PERIOD_DAYS * 86400000;
  const priorStart = now - PERIOD_DAYS * 2 * 86400000;

  const thisPeriod = expenses.filter((e) => new Date(e.t.date).getTime() >= periodStart);
  const priorPeriod = expenses.filter((e) => {
    const time = new Date(e.t.date).getTime();
    return time >= priorStart && time < periodStart;
  });

  if (thisPeriod.length === 0) return [];

  const insights: SpendingInsight[] = [];
  const thisMap = sumByCategory(thisPeriod);
  const totalThisPeriod = [...thisMap.values()].reduce((sum, v) => sum + v, 0);

  // Overall trend vs. the prior period — the single most useful "am I
  // tracking okay?" signal, shown before any per-category detail.
  const totalPriorPeriod = priorPeriod.reduce((sum, e) => sum + e.amount, 0);
  if (totalPriorPeriod >= 20) {
    const changePct = (totalThisPeriod - totalPriorPeriod) / totalPriorPeriod;
    if (Math.abs(changePct) >= 0.1) {
      const pct = Math.round(Math.abs(changePct) * 100);
      insights.push({
        icon: changePct < 0 ? 'trending-down-outline' : 'trending-up-outline',
        title: changePct < 0 ? 'Tracking lower than last month' : 'Tracking higher than last month',
        body: `$${Math.round(totalThisPeriod)} in the last ${PERIOD_DAYS} days — ${pct}% ${changePct < 0 ? 'less' : 'more'} than the period before.`,
      });
    }
  }

  // Category trend changes (only where there's a meaningful prior baseline)
  for (const d of computeCategoryDeltas(data)) {
    if (Math.abs(d.changePct) >= 0.15) {
      const pct = Math.round(Math.abs(d.changePct) * 100);
      insights.push({
        icon: d.changePct > 0 ? 'trending-up-outline' : 'trending-down-outline',
        title: `${d.categoryName} spending ${d.changePct > 0 ? 'increased' : 'decreased'} ${pct}%`,
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
      title: `${category?.name ?? 'This category'} is your largest category`,
      body: `$${Math.round(largestAmount)} in the last ${PERIOD_DAYS} days.`,
    });
  }

  // Subscription total — a real, recurring cost worth surfacing on its own,
  // not buried inside a general category comparison.
  const subscriptionTotal = thisPeriod.filter((e) => e.t.categoryId === 'cat-subscriptions').reduce((sum, e) => sum + e.amount, 0);
  if (subscriptionTotal > 0) {
    insights.push({
      icon: 'card-outline',
      title: 'Subscription costs',
      body: `About $${Math.round(subscriptionTotal)} over the last ${PERIOD_DAYS} days.`,
    });
  }

  // Which single weekday sees the most spending — only surfaced with a
  // real, repeated pattern behind it (at least 3 separate purchases on that
  // day, and a clear margin over the average across all seven days), never
  // from one or two purchases landing on the same day by chance.
  const dayOccurrences = new Array(7).fill(0);
  for (let i = 0; i < PERIOD_DAYS; i++) {
    dayOccurrences[new Date(now - i * 86400000).getDay()] += 1;
  }
  const dayTotals = new Array(7).fill(0);
  const dayTxnCounts = new Array(7).fill(0);
  for (const e of thisPeriod) {
    const day = new Date(e.t.date).getDay();
    dayTotals[day] += e.amount;
    dayTxnCounts[day] += 1;
  }
  const dayAverages = dayTotals.map((total, i) => (dayOccurrences[i] > 0 ? total / dayOccurrences[i] : 0));
  const overallDayAverage = dayAverages.reduce((sum, v) => sum + v, 0) / 7;
  let topDay = 0;
  for (let d = 1; d < 7; d++) {
    if (dayAverages[d] > dayAverages[topDay]) topDay = d;
  }
  if (thisPeriod.length >= 10 && dayTxnCounts[topDay] >= 3 && overallDayAverage > 0 && dayAverages[topDay] >= overallDayAverage * 1.5) {
    insights.push({
      icon: 'calendar-outline',
      title: `You usually spend the most on ${DAY_NAMES[topDay]}s`,
      body: `About $${Math.round(dayAverages[topDay])} on an average ${DAY_NAMES[topDay]}, vs $${Math.round(overallDayAverage)}/day overall.`,
    });
  }

  // Average daily spend — a neutral baseline figure, kept last since it
  // describes rather than surfaces a pattern.
  insights.push({
    icon: 'today-outline',
    title: 'Average daily spend',
    body: `About $${Math.round(totalThisPeriod / PERIOD_DAYS)}/day over the last ${PERIOD_DAYS} days.`,
  });

  return insights.slice(0, 6);
}
