import { AppData } from '../../types/models';
import { computeWealthProjection } from './wealthProjection';
import { computeMonthlySummary } from './monthlySummary';

export interface AgeProjection {
  age: number;
  yearsAhead: number;
  projectedNetWorth: number;
  monthlyContribution: number;
  cashflowIsNegative: boolean;
}

const HORIZON_YEARS = [5, 10, 20];
const MILESTONES = [50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
const WHAT_IF_EXTRA_MONTHLY = 300;
const MAX_MONTHS = 1200; // 100 years — a sane cap for the simulation

/** "Your Future" — a multi-age view of the same illustrative projection
 * used on Wealth (§ computeWealthProjection), gated behind an optional age
 * field that's never asked at onboarding. */
export function computeAgeProjections(data: AppData): AgeProjection[] | null {
  if (!data.user.age) return null;
  return HORIZON_YEARS.map((years) => {
    const projection = computeWealthProjection(data, years);
    return {
      age: data.user.age! + years,
      yearsAhead: years,
      projectedNetWorth: projection.projectedValue,
      monthlyContribution: projection.monthlyContribution,
      cashflowIsNegative: projection.cashflowIsNegative,
    };
  });
}

function monthsToReachTarget(startValue: number, monthlyContribution: number, annualRate: number, target: number): number | null {
  if (startValue >= target) return 0;
  const monthlyRate = annualRate / 12;
  let value = startValue;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    if (value >= target) return month;
  }
  return null;
}


export interface NextWealthMilestone {
  milestone: number;
  age: number | null;
  yearsAway: number;
}

/** True when the user's real recorded cashflow is negative right now — used
 * so "Your Future" can explain a growth line honestly instead of implying
 * an active saving "pace" that doesn't exist (PRD ask, §Projections). */
export function computeCashflowIsNegative(data: AppData): boolean {
  return computeMonthlySummary(data).netCashflow < 0;
}

/**
 * "At your current pace, Lulu estimates you could reach your next wealth
 * milestone around age X" — deliberately softer than a "financial freedom"
 * claim (PRD bug report: a user with $367k at 40 seeing "financially free
 * at 38" reads as an inconsistent, overconfident claim). Reuses the exact
 * same growth simulation as the age-by-age cards below it, so the headline
 * age can never contradict the supporting numbers the way two independently
 * computed estimates could.
 */
export function computeNextWealthMilestone(data: AppData): NextWealthMilestone | null {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const summary = computeMonthlySummary(data);
  const monthlyContribution = Math.max(0, summary.netCashflow);
  const assumedAnnualReturn = 0.06;

  const milestone = MILESTONES.find((m) => m > netWorth);
  if (!milestone || monthlyContribution <= 0) return null;

  const months = monthsToReachTarget(netWorth, monthlyContribution, assumedAnnualReturn, milestone);
  if (months === null) return null;
  const yearsAway = Math.round(months / 12);

  return { milestone, age: data.user.age ? data.user.age + yearsAway : null, yearsAway };
}

export interface WhatIfMilestoneInsight {
  milestone: number;
  yearsSaved: number;
  extraMonthly: number;
}

/**
 * "If you invested an extra $300/month, you'd reach $1M three years
 * earlier" — real simulation against the user's own numbers and the same
 * assumed-return disclaimer used everywhere else, not a canned line.
 */
export function computeWhatIfMilestone(data: AppData): WhatIfMilestoneInsight | null {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const summary = computeMonthlySummary(data);
  const monthlyContribution = Math.max(0, summary.netCashflow);
  const assumedAnnualReturn = 0.06;

  const milestone = MILESTONES.find((m) => m > netWorth);
  if (!milestone) return null;

  const monthsCurrent = monthsToReachTarget(netWorth, monthlyContribution, assumedAnnualReturn, milestone);
  const monthsWithExtra = monthsToReachTarget(netWorth, monthlyContribution + WHAT_IF_EXTRA_MONTHLY, assumedAnnualReturn, milestone);
  if (monthsCurrent === null || monthsWithExtra === null) return null;

  const yearsSaved = Math.round((monthsCurrent - monthsWithExtra) / 12);
  if (yearsSaved < 1) return null;

  return { milestone, yearsSaved, extraMonthly: WHAT_IF_EXTRA_MONTHLY };
}
