import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';
import { computeLiquidCash } from './liquidAssets';
import { computeSafeToSpend, computeFixedCosts } from './safeToSpend';
import { computeGoalAllocation } from './goalAllocation';
import { ACCESSIBLE_INVESTMENT_TYPES, isAccessibleInvestment } from './assetGroups';
import { computeAccessibleNetWorth, computeRetirementSavings, computeDebtRepaymentsMonthly } from './wealthDefinitions';
import { computeCreditAggregate } from './creditHealth';
import { computeMortgageEquity } from './propertyEquity';
import { brand } from '../brand';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lulu Score v2 (PRD ask: "measure how financially healthy a user is, not
 * how many Lulu features they've completed"). Five weighted categories —
 * Money Flow Health 30 / Financial Resilience 20 / Debt Health 25 /
 * Wealth Building 15 / Goal Progress 10 — each built from real,
 * deterministic factors reusing the app's existing shared calculation
 * engines (income, Safe to Spend, liquid cash, accessible net worth,
 * goal allocation, credit health, property equity). Rules calculate the
 * score; nothing here is AI-generated or user-entry-triggered.
 */

export type FactorStatus = 'healthy' | 'improving' | 'not_started' | 'needs_attention' | 'not_enough_info' | 'not_relevant_yet' | 'not_applicable';

export interface ScoreFactor {
  key: string;
  label: string;
  /** Points actually awarded (already rescaled if sibling factors in the
   * same category were not applicable — see buildCategory). */
  points: number;
  /** This factor's effective max within its category (rescaled). */
  maxPoints: number;
  potentialPoints: number;
  status: FactorStatus;
  applicable: boolean;
  current: string;
  target: string;
  action: string;
}

export type ScoreCategoryKey = 'moneyFlow' | 'resilience' | 'debt' | 'wealthBuilding' | 'goals';

export interface ScoreCategory {
  key: ScoreCategoryKey;
  label: string;
  points: number;
  maxPoints: number;
  factors: ScoreFactor[];
}

export interface MoneyPictureCompleteness {
  percent: number;
  missing: string[];
}

export type ScoreConfidence = 'low' | 'medium' | 'high';

export type LifeStage = 'starting_out' | 'building_stability' | 'reducing_debt' | 'building_wealth' | 'optimising_wealth' | 'preparing_for_future';

export const LIFE_STAGE_LABEL: Record<LifeStage, string> = {
  starting_out: 'Starting Out',
  building_stability: 'Building Stability',
  reducing_debt: 'Reducing Debt',
  building_wealth: 'Building Wealth',
  optimising_wealth: 'Optimising Wealth',
  preparing_for_future: 'Preparing for the Future',
};

export interface LuluScoreResult {
  locked: boolean;
  score: number;
  categories: ScoreCategory[];
  completeness: MoneyPictureCompleteness;
  confidence: ScoreConfidence;
  lifeStage: LifeStage | null;
}

const LOCKED_RESULT: LuluScoreResult = {
  locked: true,
  score: 0,
  categories: [],
  completeness: { percent: 0, missing: [] },
  confidence: 'low',
  lifeStage: null,
};

// --- Category builder — the redistribution mechanism that lets "not
// applicable" factors (no credit cards, no debt, no goals) never drag a
// category down: their weight is redistributed across whatever factors
// DO apply, so a debt-free user can still reach the full 25 Debt Health
// points from just the factors that make sense for them (PRD ask: "no
// debt" should score strongly, never be penalised for N/A sub-factors). ---
interface FactorDef {
  key: string;
  label: string;
  weight: number; // out of the category's maxPoints, before redistribution
  applicable: boolean;
  /** 0-1 quality fraction; ignored when !applicable. A "not enough info"
   * factor should use ~0.5 here, never 0 (PRD ask: never silently award
   * zero just because data is missing). */
  fraction: number;
  status: FactorStatus;
  current: string;
  target: string;
  action: string;
}

function buildCategory(key: ScoreCategoryKey, label: string, maxPoints: number, defs: FactorDef[]): ScoreCategory {
  const applicableDefs = defs.filter((d) => d.applicable);
  const applicableWeightSum = applicableDefs.reduce((sum, d) => sum + d.weight, 0) || 1;
  const factors: ScoreFactor[] = defs.map((d) => {
    if (!d.applicable) {
      return { ...d, points: 0, maxPoints: 0, potentialPoints: 0 };
    }
    const effectiveMax = (d.weight / applicableWeightSum) * maxPoints;
    const points = clamp(d.fraction, 0, 1) * effectiveMax;
    return { ...d, points, maxPoints: effectiveMax, potentialPoints: Math.max(0, effectiveMax - points) };
  });
  const points = factors.reduce((sum, f) => sum + f.points, 0);
  return { key, label, points, maxPoints, factors };
}

function money(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function monthsLabel(months: number): string {
  if (!isFinite(months)) return 'a strong buffer';
  if (months < 0.1) return 'no buffer yet';
  if (months < 1) return `${Math.round(months * 4.33)} weeks`;
  return `${Math.round(months * 10) / 10} months`;
}

// ==================================================
// A3. Money Flow Health — 30 points
// ==================================================
function buildMoneyFlowCategory(data: AppData): ScoreCategory {
  const { user } = data;
  const monthlyIncome = user.monthlyIncome;
  const commitments = computeFixedCosts(data);
  const surplusRatio = monthlyIncome > 0 ? (monthlyIncome - commitments) / monthlyIncome : 0;

  // 1. Income vs Commitments — 10
  function incomeVsCommitmentsFraction(ratio: number): number {
    if (ratio < 0) return ratio < -0.1 ? 0 : 0.15;
    if (ratio < 0.05) return 0.4;
    if (ratio < 0.1) return 0.65;
    if (ratio < 0.2) return 0.85;
    return 1;
  }
  const incomeStatus: FactorStatus = surplusRatio < 0 ? 'needs_attention' : surplusRatio < 0.1 ? 'improving' : 'healthy';

  // 2. Spending Control — 10
  const safeToSpend = computeSafeToSpend(data);
  const cycleTotalDays = Math.max(1, Math.round((safeToSpend.cycleEnd.getTime() - safeToSpend.cycleStart.getTime()) / 86400000));
  const elapsedDays = clamp(cycleTotalDays - safeToSpend.daysRemaining, 0, cycleTotalDays);
  const cycleExpenseCount = data.transactions.filter(
    (t) => t.type === 'expense' && new Date(t.date) >= safeToSpend.cycleStart && new Date(t.date) <= new Date()
  ).length;
  const hasEnoughSpendingHistory = cycleExpenseCount >= 3;
  let spendingFraction = 0.5;
  let spendingStatus: FactorStatus = 'not_enough_info';
  if (hasEnoughSpendingHistory && elapsedDays > 0) {
    const expectedByNow = safeToSpend.discretionaryPool * (elapsedDays / cycleTotalDays);
    const overspendRatio = expectedByNow > 0 ? (safeToSpend.spendSoFarThisCycle - expectedByNow) / expectedByNow : 0;
    spendingFraction = clamp(1 - Math.max(0, overspendRatio) * 1.25, 0, 1);
    spendingStatus = spendingFraction >= 0.75 ? 'healthy' : spendingFraction >= 0.4 ? 'improving' : 'needs_attention';
  }

  // 3. Savings Behaviour — 10
  const plannedRate = monthlyIncome > 0 ? safeToSpend.defaultSavingsBuffer / monthlyIncome : 0;
  function savingsRateFraction(rate: number): number {
    if (rate <= 0) return 0;
    if (rate < 0.05) return 0.2;
    if (rate < 0.1) return 0.5;
    if (rate < 0.2) return 0.8;
    return 1;
  }
  const hasSavingsEvidence = data.assets.some((a) => a.type === 'savings' && a.currentValue > 0) || user.savingsBufferOverride !== undefined;
  const rawSavingsFraction = savingsRateFraction(plannedRate);
  const savingsFraction = hasSavingsEvidence ? rawSavingsFraction : rawSavingsFraction * 0.5;
  const savingsStatus: FactorStatus = plannedRate <= 0 ? 'not_started' : hasSavingsEvidence ? (savingsFraction >= 0.75 ? 'healthy' : 'improving') : 'improving';

  return buildCategory('moneyFlow', 'Money Flow Health', 30, [
    {
      key: 'income_vs_commitments',
      label: 'Income vs Commitments',
      weight: 10,
      applicable: monthlyIncome > 0,
      fraction: incomeVsCommitmentsFraction(surplusRatio),
      status: incomeStatus,
      current: `${money(monthlyIncome - commitments)}/month left after bills (${Math.round(surplusRatio * 100)}% of income)`,
      target: 'A surplus of 20%+ of income after essential bills and debt repayments',
      action: surplusRatio < 0.2 ? 'Review Money Flow' : 'Keep it up',
    },
    {
      key: 'spending_control',
      label: 'Spending Control',
      weight: 10,
      applicable: true,
      fraction: spendingFraction,
      status: spendingStatus,
      current: hasEnoughSpendingHistory ? `${Math.round(spendingFraction * 100)}% on pace with your ${brand.name} Money Plan` : 'Not enough spending history yet',
      target: `Staying within your ${brand.name} Money Plan for the full cycle`,
      action: hasEnoughSpendingHistory ? 'Review Spending Tracker' : 'Log a few more transactions',
    },
    {
      key: 'savings_behaviour',
      label: 'Savings Behaviour',
      weight: 10,
      applicable: true,
      fraction: savingsFraction,
      status: savingsStatus,
      current: `${brand.name} Savings Plan set at ${Math.round(plannedRate * 100)}% of income${hasSavingsEvidence ? '' : ' (not yet evidenced in a savings balance)'}`,
      target: 'Saving 10-20%+ of income, with a real savings balance behind it',
      action: `Adjust ${brand.name} Savings Plan`,
    },
  ]);
}

// ==================================================
// A4. Financial Resilience — 20 points
// ==================================================
function buildResilienceCategory(data: AppData): ScoreCategory {
  const { user } = data;
  const monthlyIncome = user.monthlyIncome;
  const liquid = computeLiquidCash(data.assets);
  const essential = computeFixedCosts(data);
  const hasEssentialData = essential > 0;
  const monthsCovered = hasEssentialData ? liquid / essential : monthlyIncome > 0 ? liquid / monthlyIncome : 0;

  function bufferFraction(months: number): number {
    if (months >= 6) return 1;
    if (months >= 3) return 0.75 + (0.25 * (months - 3)) / 3;
    if (months >= 1) return 0.4 + (0.35 * (months - 1)) / 2;
    if (months >= 0.5) return 0.15 + (0.25 * (months - 0.5)) / 0.5;
    return liquid > 0 ? 0.1 : 0;
  }
  const bufferStatus: FactorStatus = !hasEssentialData && monthlyIncome <= 0 ? 'not_enough_info' : monthsCovered >= 3 ? 'healthy' : monthsCovered >= 1 ? 'improving' : 'needs_attention';

  const safeToSpend = computeSafeToSpend(data);
  const upcomingBillsBeforePayday = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && user.nextPayday && new Date(r.nextDueDate) <= new Date(user.nextPayday))
    .reduce((sum, r) => sum + r.amount, 0);
  const hasPaydaySafetyData = !!user.nextPayday && data.recurringItems.some((r) => r.active && r.type === 'expense');
  const notOverspent = safeToSpend.remainingPool >= 0;
  const coversUpcomingBills = liquid >= upcomingBillsBeforePayday;
  let paydayFraction = 0.5;
  let paydayStatus: FactorStatus = 'not_enough_info';
  if (hasPaydaySafetyData) {
    paydayFraction = notOverspent && coversUpcomingBills ? 1 : notOverspent || coversUpcomingBills ? 0.5 : 0;
    paydayStatus = paydayFraction >= 1 ? 'healthy' : paydayFraction > 0 ? 'improving' : 'needs_attention';
  }

  const isIrregular = user.payFrequency === 'irregular';
  let stabilityFraction: number;
  let stabilityStatus: FactorStatus;
  if (monthlyIncome <= 0) {
    stabilityFraction = 0.5;
    stabilityStatus = 'not_enough_info';
  } else if (!isIrregular) {
    stabilityFraction = liquid > 0 ? 1 : 0.5;
    stabilityStatus = liquid > 0 ? 'healthy' : 'improving';
  } else {
    // Irregular income needs a bigger buffer to earn the same marks —
    // never simply penalised for being irregular (PRD ask).
    stabilityFraction = clamp(monthsCovered / 4, 0, 1);
    stabilityStatus = stabilityFraction >= 0.75 ? 'healthy' : 'improving';
  }

  return buildCategory('resilience', 'Financial Resilience', 20, [
    {
      key: 'emergency_buffer',
      label: 'Emergency Buffer',
      weight: 12,
      applicable: true,
      fraction: bufferFraction(monthsCovered),
      status: bufferStatus,
      current: `${monthsLabel(monthsCovered)} of essential expenses in cash and savings`,
      target: '3 months of essential expenses (6+ months is excellent)',
      action: `Adjust ${brand.name} Savings Plan`,
    },
    {
      key: 'payday_safety',
      label: 'Bill and Payday Safety',
      weight: 4,
      applicable: true,
      fraction: paydayFraction,
      status: paydayStatus,
      current: hasPaydaySafetyData ? (paydayFraction >= 1 ? 'On track to cover bills until next payday' : 'Tight until next payday') : 'Not enough information yet',
      target: 'Enough liquid cash to cover bills through to your next payday',
      action: 'Review Bills Calendar',
    },
    {
      key: 'income_stability',
      label: 'Income Stability and Buffer',
      weight: 4,
      applicable: true,
      fraction: stabilityFraction,
      status: stabilityStatus,
      current: isIrregular ? `Irregular income — ${monthsLabel(monthsCovered)} buffer built` : 'Regular income confirmed',
      target: isIrregular ? 'A larger cash buffer to smooth out irregular income' : 'Keep a cash buffer alongside regular income',
      action: 'Build cash buffer',
    },
  ]);
}

// ==================================================
// A5. Debt Health — 25 points
// ==================================================
function buildDebtCategory(data: AppData): ScoreCategory {
  const { user, liabilities, creditCards } = data;
  const monthlyIncome = user.monthlyIncome;
  const annualIncome = monthlyIncome * 12;
  const hasAnyDebt = liabilities.length > 0 || creditCards.length > 0;
  const confirmedNoDebt = !!user.confirmedNoDebt && !hasAnyDebt;

  // 1. High-Interest Debt Risk — 8
  const highInterestBalance =
    creditCards.reduce((sum, c) => sum + c.currentBalance, 0) +
    liabilities.filter((l) => l.type === 'personal_loan').reduce((sum, l) => sum + l.currentBalance, 0);
  const highInterestRatio = annualIncome > 0 ? highInterestBalance / annualIncome : 0;
  function highInterestFraction(ratio: number): number {
    if (ratio <= 0) return 1;
    if (ratio < 0.05) return 0.85;
    if (ratio < 0.15) return 0.6;
    if (ratio < 0.3) return 0.3;
    return 0.1;
  }

  // 2. Credit Utilisation — 5 (N/A with no cards)
  const hasCards = creditCards.length > 0;
  const utilisation = hasCards ? computeCreditAggregate(creditCards).utilisation : 0;
  function utilisationFraction(u: number): number {
    if (u <= 0.1) return 1;
    if (u <= 0.3) return 0.8;
    if (u <= 0.5) return 0.4;
    return 0.1;
  }

  // 3. Repayment Pressure — 6
  const debtRepayments = computeDebtRepaymentsMonthly(data);
  const repaymentRatio = monthlyIncome > 0 ? debtRepayments / monthlyIncome : 0;
  function repaymentFraction(ratio: number): number {
    if (ratio <= 0) return 1;
    if (ratio < 0.2) return 0.9;
    if (ratio < 0.3) return 0.6;
    if (ratio < 0.35) return 0.3;
    return 0.05;
  }

  // 4. Repayment Behaviour — 4 (N/A with no debt-linked bills)
  const linkedBills = data.recurringItems.filter((r) => r.active && r.type === 'expense' && !!r.linkedLiabilityId);
  const hasRepaymentBehaviourData = linkedBills.length > 0;
  const now = new Date();
  const overdueBills = linkedBills.filter((r) => new Date(r.nextDueDate) < now);
  const maxOverdueDays = overdueBills.length
    ? Math.max(...overdueBills.map((r) => Math.round((now.getTime() - new Date(r.nextDueDate).getTime()) / 86400000)))
    : 0;
  let repaymentBehaviourFraction = 1;
  let repaymentBehaviourStatus: FactorStatus = 'healthy';
  if (hasRepaymentBehaviourData) {
    if (maxOverdueDays > 7) {
      repaymentBehaviourFraction = 0.2;
      repaymentBehaviourStatus = 'needs_attention';
    } else if (maxOverdueDays > 0) {
      repaymentBehaviourFraction = 0.6;
      repaymentBehaviourStatus = 'improving';
    }
  }

  // 5. Secured Debt Position — 2 (N/A with no mortgage)
  const mortgages = liabilities.filter((l) => l.type === 'mortgage');
  const hasMortgage = mortgages.length > 0;
  const linkedMortgages = mortgages.filter((l) => l.linkedPropertyAssetId);
  let securedFraction = 0.5;
  let securedStatus: FactorStatus = 'not_enough_info';
  let securedCurrent = 'Mortgage not yet linked to a property';
  if (hasMortgage && linkedMortgages.length > 0) {
    const equities = linkedMortgages
      .map((l) => {
        const property = data.assets.find((a) => a.id === l.linkedPropertyAssetId);
        return property ? computeMortgageEquity(l, property) : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (equities.length > 0) {
      const avgEquityPct = equities.reduce((sum, e) => sum + e.equityPct, 0) / equities.length;
      securedFraction = avgEquityPct >= 0.4 ? 1 : avgEquityPct >= 0.2 ? 0.75 : avgEquityPct >= 0.1 ? 0.5 : 0.25;
      securedStatus = securedFraction >= 0.75 ? 'healthy' : 'improving';
      securedCurrent = `Estimated ${Math.round(avgEquityPct * 100)}% equity across linked property`;
    }
  }

  return buildCategory('debt', 'Debt Health', 25, [
    {
      key: 'high_interest_risk',
      label: 'High-Interest Debt Risk',
      weight: 8,
      applicable: true,
      fraction: confirmedNoDebt || highInterestBalance === 0 ? 1 : highInterestFraction(highInterestRatio),
      status: highInterestBalance === 0 ? 'healthy' : highInterestRatio < 0.15 ? 'improving' : 'needs_attention',
      current: highInterestBalance === 0 ? 'No high-interest debt reported' : `${money(highInterestBalance)} recorded in credit-card or personal-loan debt`,
      target: 'Explore how different repayment amounts may affect time and estimated interest.',
      action: 'Model repayment options',
    },
    {
      key: 'credit_utilisation',
      label: 'Credit Utilisation',
      weight: 5,
      applicable: hasCards,
      fraction: utilisationFraction(utilisation),
      status: !hasCards ? 'not_applicable' : utilisation <= 0.3 ? 'healthy' : 'needs_attention',
      current: hasCards ? `${Math.round(utilisation * 100)}% of the credit limit entered` : 'No credit cards',
      target: 'General reference range: lower utilisation may reduce repayment pressure. Credit reporting and lender treatment vary.',
      action: 'Explore balance scenarios',
    },
    {
      key: 'repayment_pressure',
      label: 'Repayment Pressure',
      weight: 6,
      applicable: true,
      fraction: repaymentFraction(repaymentRatio),
      status: repaymentRatio === 0 ? 'healthy' : repaymentRatio < 0.3 ? 'improving' : 'needs_attention',
      current: monthlyIncome > 0 ? `Recorded repayments equal approximately ${Math.round(repaymentRatio * 100)}% of recorded monthly income` : 'Not enough information',
      target: 'Higher committed repayments may leave less flexibility for other expenses.',
      action: 'Review recorded repayments',
    },
    {
      key: 'repayment_behaviour',
      label: 'Repayment Behaviour',
      weight: 4,
      applicable: hasRepaymentBehaviourData,
      fraction: repaymentBehaviourFraction,
      status: !hasRepaymentBehaviourData ? 'not_applicable' : repaymentBehaviourStatus,
      current: hasRepaymentBehaviourData ? (maxOverdueDays > 0 ? `A repayment is ${maxOverdueDays} day(s) overdue` : 'Repayments confirmed on schedule') : 'No repayment schedule tracked yet',
      target: 'Repayments confirmed paid on or before the due date',
      action: 'Confirm bill payments',
    },
    {
      key: 'secured_debt_position',
      label: 'Secured Debt Position',
      weight: 2,
      applicable: hasMortgage,
      fraction: securedFraction,
      status: !hasMortgage ? 'not_applicable' : linkedMortgages.length === 0 ? 'not_enough_info' : securedStatus,
      current: hasMortgage ? securedCurrent : 'No mortgage',
      target: '20%+ equity in a property securing the mortgage',
      action: 'Link mortgage to property',
    },
  ]);
}

// ==================================================
// A6. Wealth Building — 15 points
// ==================================================
function buildWealthBuildingCategory(data: AppData): ScoreCategory {
  const { user } = data;
  const monthlyIncome = user.monthlyIncome;
  const annualIncome = monthlyIncome * 12;
  const safeToSpend = computeSafeToSpend(data);
  const liquid = computeLiquidCash(data.assets);
  const essential = computeFixedCosts(data);
  const monthsCovered = essential > 0 ? liquid / essential : monthlyIncome > 0 ? liquid / monthlyIncome : 0;
  const surplusRatio = monthlyIncome > 0 ? safeToSpend.remainingPool / monthlyIncome : 0;
  const isFinanciallyReady = monthlyIncome > 0 && surplusRatio >= 0 && monthsCovered >= 1;
  const isStronglyReady = isFinanciallyReady && monthsCovered >= 1 && surplusRatio > 0.1;

  // 1. Wealth Contribution Habit — 6
  const plannedRate = monthlyIncome > 0 ? safeToSpend.defaultSavingsBuffer / monthlyIncome : 0;
  const hasAnyWealthAsset = data.assets.some((a) => a.currentValue > 0 && a.type !== 'cash');
  const habitFraction = plannedRate <= 0 ? 0.15 : hasAnyWealthAsset ? clamp(0.5 + plannedRate * 2, 0, 1) : 0.4;
  const habitStatus: FactorStatus = plannedRate <= 0 ? 'not_started' : hasAnyWealthAsset ? 'healthy' : 'improving';

  // 2. Personal Investing — 4
  const investmentAssets = data.assets.filter((a) => isAccessibleInvestment(a.type));
  const investmentValue = investmentAssets.reduce((sum, a) => sum + a.currentValue, 0);
  let investingFraction: number;
  let investingStatus: FactorStatus;
  let investingCurrent: string;
  let investingTarget: string;
  if (investmentValue > 0) {
    investingFraction = annualIncome > 0 ? clamp(investmentValue / annualIncome / 0.5, 0.3, 1) : 0.5;
    investingStatus = 'healthy';
    investingCurrent = `${money(investmentValue)} in personal investments`;
    investingTarget = 'Consistent contributions to accessible investments';
  } else if (!isFinanciallyReady) {
    investingFraction = 0.6;
    investingStatus = 'not_relevant_yet';
    investingCurrent = 'Foundation first — building emergency savings before investing';
    investingTarget = 'Build a 1-3 month emergency buffer, then consider investing';
  } else if (isStronglyReady) {
    investingFraction = 0.3;
    investingStatus = 'needs_attention';
    investingCurrent = 'Cashflow and emergency savings suggest you may be ready to invest';
    investingTarget = 'Start with a small, regular contribution to an accessible investment';
  } else {
    investingFraction = 0.5;
    investingStatus = 'not_started';
    investingCurrent = 'Not investing yet';
    investingTarget = 'Consider starting once your buffer and surplus are stronger';
  }

  // 3. Diversification — 3 (only when enough investment info exists)
  let diversificationFraction = 0.5;
  let diversificationStatus: FactorStatus = 'not_applicable';
  let diversificationApplicable = false;
  let diversificationCurrent = 'No investments yet';
  if (investmentAssets.length === 1) {
    diversificationApplicable = true;
    diversificationFraction = 0.5;
    diversificationStatus = 'not_enough_info';
    diversificationCurrent = 'Limited information — only one investment entered';
  } else if (investmentAssets.length >= 2) {
    diversificationApplicable = true;
    const byType: Record<string, number> = {};
    for (const a of investmentAssets) byType[a.type] = (byType[a.type] ?? 0) + a.currentValue;
    const total = Object.values(byType).reduce((sum, v) => sum + v, 0);
    const hhi = total > 0 ? Object.values(byType).reduce((sum, v) => sum + Math.pow(v / total, 2), 0) : 1;
    const diversificationScore = Math.round((1 - hhi) * 100);
    diversificationFraction = clamp(diversificationScore / 60, 0, 1);
    diversificationStatus = diversificationScore >= 40 ? 'healthy' : 'improving';
    diversificationCurrent = `Spread across ${Object.keys(byType).length} investment type(s)`;
  }

  // 4. Retirement Preparation — 2
  const retirementSavings = computeRetirementSavings(data);
  const retirementFraction = retirementSavings <= 0 ? 0.2 : annualIncome > 0 ? clamp(0.5 + retirementSavings / (annualIncome * 2), 0.5, 1) : 0.6;
  const retirementStatus: FactorStatus = retirementSavings > 0 ? 'healthy' : 'not_started';

  return buildCategory('wealthBuilding', 'Wealth Building', 15, [
    {
      key: 'contribution_habit',
      label: 'Wealth Contribution Habit',
      weight: 6,
      applicable: true,
      fraction: habitFraction,
      status: habitStatus,
      current: `Setting aside ${Math.round(plannedRate * 100)}% of income toward savings, investing, or debt reduction`,
      target: 'A consistent contribution habit, evidenced by a growing balance',
      action: `Adjust ${brand.name} Savings Plan`,
    },
    {
      key: 'personal_investing',
      label: 'Personal Investing',
      weight: 4,
      applicable: true,
      fraction: investingFraction,
      status: investingStatus,
      current: investingCurrent,
      target: investingTarget,
      action: investmentValue > 0 ? 'Review investments' : 'Learn about investing',
    },
    {
      key: 'diversification',
      label: 'Diversification',
      weight: 3,
      applicable: diversificationApplicable,
      fraction: diversificationFraction,
      status: diversificationStatus,
      current: diversificationCurrent,
      target: 'Spread across more than one investment type',
      action: 'Explore investment types',
    },
    {
      key: 'retirement_preparation',
      label: 'Retirement Preparation',
      weight: 2,
      applicable: true,
      fraction: retirementFraction,
      status: retirementStatus,
      current: retirementSavings > 0 ? `${money(retirementSavings)} in Retirement Savings` : 'No Retirement Savings added yet',
      target: 'Regular contributions to a retirement account',
      action: 'Add Retirement Savings',
    },
  ]);
}

// ==================================================
// A7. Goal Progress — 10 points
// ==================================================
function buildGoalsCategory(data: AppData): ScoreCategory {
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) {
    // A user without a formal goal can still be financially healthy (PRD
    // ask) — a generous, non-punishing neutral default, not a 0.
    return buildCategory('goals', 'Goal Progress', 10, [
      {
        key: 'no_goals',
        label: 'Goals',
        weight: 10,
        applicable: true,
        fraction: 0.7,
        status: 'not_started',
        current: 'No goals set yet',
        target: `A clear goal helps ${brand.name} plan your money more precisely`,
        action: 'Add a goal',
      },
    ]);
  }

  const safeToSpend = computeSafeToSpend(data);
  const availableForGoals = data.user.monthlyIncome - computeFixedCosts(data);
  const allocation = computeGoalAllocation(data, availableForGoals);

  // 1. Goal Quality — 3
  const qualityScores = activeGoals.map((g) => {
    let score = 0;
    if (g.targetAmount && g.targetAmount > 0) score += 0.4;
    if (g.targetDate) score += 0.3;
    if (g.lifeGoalType) score += 0.15;
    if (g.priority) score += 0.15;
    return score;
  });
  const qualityFraction = qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length;

  // 2. Contribution Consistency — 4 (funded per the goal allocation engine)
  const fundedCount = allocation.allocations.filter((a) => a.isFullyFunded).length;
  const consistencyFraction = allocation.allocations.length > 0 ? fundedCount / allocation.allocations.length : 0.5;

  // 3. Progress and Feasibility — 3 (reuses the same allocation engine, so
  // an unrealistic goal like "$1M in 12 months" scores low automatically —
  // its required monthly is capped by available money, so isFullyFunded
  // stays false and progress can't outrun what's actually achievable).
  const progressScores = activeGoals.map((g) => {
    if (!g.targetAmount || g.targetAmount <= 0) return 0.5;
    return clamp(g.currentAmount / g.targetAmount, 0, 1);
  });
  const avgProgress = progressScores.reduce((sum, s) => sum + s, 0) / progressScores.length;
  const feasibilityFraction = clamp(avgProgress * 0.6 + (allocation.isFullyFunded ? 0.4 : 0.1), 0, 1);

  return buildCategory('goals', 'Goal Progress', 10, [
    {
      key: 'goal_quality',
      label: 'Goal Quality',
      weight: 3,
      applicable: true,
      fraction: qualityFraction,
      status: qualityFraction >= 0.75 ? 'healthy' : 'improving',
      current: `${activeGoals.length} active goal${activeGoals.length === 1 ? '' : 's'}`,
      target: 'A clear amount, target date, and purpose for each goal',
      action: 'Review goal details',
    },
    {
      key: 'contribution_consistency',
      label: 'Contribution Consistency',
      weight: 4,
      applicable: true,
      fraction: consistencyFraction,
      status: consistencyFraction >= 0.75 ? 'healthy' : 'improving',
      current: `${fundedCount}/${allocation.allocations.length} goals fully funded by your ${brand.name} Money Plan`,
      target: 'Every active goal fully funded by your plan',
      action: 'Review goal contributions',
    },
    {
      key: 'progress_feasibility',
      label: 'Progress and Feasibility',
      weight: 3,
      applicable: true,
      fraction: feasibilityFraction,
      status: feasibilityFraction >= 0.6 ? 'healthy' : 'improving',
      current: allocation.isFullyFunded ? 'Your goals are on a feasible timeline' : 'One or more goals need more time or a higher contribution',
      target: 'Goals sized to what you can realistically contribute',
      action: 'Adjust goal timeline',
    },
  ]);
}

// ==================================================
// Money Picture completeness + confidence
// ==================================================
function computeCompleteness(data: AppData): MoneyPictureCompleteness {
  const { user } = data;
  const inputs: { label: string; known: boolean }[] = [
    { label: 'Income status', known: user.monthlyIncome > 0 || !!user.confirmedNoIncome },
    { label: 'Regular bills', known: data.recurringItems.some((r) => r.type === 'expense') || data.transactions.some((t) => t.type === 'expense') },
    { label: 'Cash and savings balance', known: data.assets.some((a) => a.type === 'cash' || a.type === 'savings') || !!user.confirmedCashOnly },
    { label: 'Debt status', known: data.liabilities.length > 0 || data.creditCards.length > 0 || !!user.confirmedNoDebt },
    { label: 'Investments and other assets', known: data.assets.some((a) => a.type !== 'cash' && a.type !== 'savings' && a.type !== 'super') || !!user.confirmedCashOnly },
    { label: 'Retirement savings', known: data.assets.some((a) => a.type === 'super') || !!user.confirmedCashOnly },
  ];
  const missing = inputs.filter((i) => !i.known).map((i) => i.label);
  const percent = Math.round((100 * (inputs.length - missing.length)) / inputs.length);
  return { percent, missing };
}

/**
 * Confidence is reliability, not completeness — knowing every static fact
 * (income, debts, assets) doesn't mean Lulu has actually observed enough
 * real behaviour (spending, repayments) to trust the behavioural factors
 * built on top of it. A profile can reach 100% Money Picture completeness
 * on day one with zero transaction history; confidence must stay capped
 * until that history exists, so "Not enough information" on an individual
 * factor never coexists with an unexplained "High confidence" headline
 * (PRD ask, §Completeness).
 */
function computeConfidence(completeness: MoneyPictureCompleteness, categories: ScoreCategory[]): ScoreConfidence {
  const hasUnresolvedFactor = categories.some((c) => c.factors.some((f) => f.applicable && f.status === 'not_enough_info'));
  if (completeness.percent < 50) return 'low';
  if (completeness.percent < 85 || hasUnresolvedFactor) return 'medium';
  return 'high';
}

// ==================================================
// Financial life stage — coaching classification only, never feeds back
// into the numeric score (PRD ask: "the score formula should remain
// consistent across stages").
// ==================================================
function computeLifeStage(data: AppData, categories: ScoreCategory[]): LifeStage {
  const byKey = (key: ScoreCategoryKey) => categories.find((c) => c.key === key)!;
  const moneyFlowRatio = byKey('moneyFlow').points / byKey('moneyFlow').maxPoints;
  const resilienceRatio = byKey('resilience').points / byKey('resilience').maxPoints;
  const debtRatio = byKey('debt').points / byKey('debt').maxPoints;
  const wealthRatio = byKey('wealthBuilding').points / byKey('wealthBuilding').maxPoints;
  const accessibleNetWorth = computeAccessibleNetWorth(data);
  const totalWealth = accessibleNetWorth + computeRetirementSavings(data);
  const annualIncome = data.user.monthlyIncome * 12;

  const hasRiskyDebt = data.creditCards.some((c) => c.currentBalance > 0) || data.liabilities.some((l) => l.type === 'personal_loan' && l.currentBalance > 0);

  if (moneyFlowRatio < 0.4 && resilienceRatio < 0.3) return 'starting_out';
  if (hasRiskyDebt && debtRatio < 0.6) return 'reducing_debt';
  if (resilienceRatio < 0.6) return 'building_stability';
  if (wealthRatio < 0.6) return 'building_wealth';
  if (annualIncome > 0 && totalWealth >= annualIncome * 10) return 'optimising_wealth';
  return 'preparing_for_future';
}

export function computeLuluScore(data: AppData): LuluScoreResult {
  if (data.user.monthlyIncome <= 0) return LOCKED_RESULT;

  const categories = [
    buildMoneyFlowCategory(data),
    buildResilienceCategory(data),
    buildDebtCategory(data),
    buildWealthBuildingCategory(data),
    buildGoalsCategory(data),
  ];
  const score = Math.round(categories.reduce((sum, c) => sum + c.points, 0));
  const completeness = computeCompleteness(data);
  const confidence = computeConfidence(completeness, categories);
  const lifeStage = computeLifeStage(data, categories);

  return { locked: false, score: clamp(score, 0, 100), categories, completeness, confidence, lifeStage };
}

// ==================================================
// Presentation helpers (unchanged public surface where possible, so
// screens that only need "a score and a colour" keep working).
// ==================================================
export type ScoreVisualTone = 'warning' | 'accent' | 'successBright' | 'gold';

/**
 * The 4 color bands for the circular Lulu Score ring (PRD ask): never red,
 * even at the low end — amber ("starting"), Lulu green, a brighter green,
 * then a gold "premium" tier. Always paired with an encouraging message,
 * never a judgment.
 */
export function scoreVisualBand(score: number): { tone: ScoreVisualTone; message: string } {
  if (score >= 90) return { tone: 'gold', message: 'Financial champion' };
  if (score >= 70) return { tone: 'successBright', message: 'Growing strong' };
  if (score >= 40) return { tone: 'accent', message: 'Building good habits' };
  return { tone: 'warning', message: 'Starting your journey' };
}

export function luluScoreBand(score: number): { label: string; tone: 'success' | 'accent' | 'warning' } {
  if (score >= 80) return { label: "You're doing incredibly well with your finances.", tone: 'success' };
  if (score >= 60) return { label: "You're making great progress.", tone: 'accent' };
  if (score >= 40) return { label: "You're building healthy money habits.", tone: 'warning' };
  // Never a "danger"/red framing for a low score — coaching tone always (PRD §0.1).
  return { label: "You're building a strong financial future.", tone: 'warning' };
}

/** Aspirational level name for the gamified Health screen — same bands as luluScoreBand. */
export function luluScoreLevel(score: number): string {
  if (score >= 80) return 'Wealth Architect';
  if (score >= 60) return 'Wealth Builder';
  if (score >= 40) return 'Foundation Builder';
  return 'Getting Started';
}

export interface ScoreIndicator {
  label: string;
  met: boolean;
}

/**
 * "Apple Fitness rings: simple upfront" (PRD ask) — three quick pulse
 * checks, one per headline category, derived straight from the real
 * category ratios the formula already computed.
 */
export function computeScoreIndicators(result: LuluScoreResult): ScoreIndicator[] {
  if (result.locked) return [];
  function band(key: ScoreCategoryKey, strong: string, improving: string, starting: string): ScoreIndicator {
    const cat = result.categories.find((c) => c.key === key);
    const ratio = cat && cat.maxPoints > 0 ? cat.points / cat.maxPoints : 0;
    if (ratio >= 0.75) return { label: strong, met: true };
    if (ratio >= 0.4) return { label: improving, met: true };
    return { label: starting, met: false };
  }
  return [
    band('moneyFlow', 'Money Flow strong', 'Money Flow improving', 'Building Money Flow'),
    band('resilience', 'Resilience strong', 'Resilience improving', 'Building resilience'),
    band('debt', 'Debt under control', 'Debt improving', 'Debt needs attention'),
  ];
}

export const FACTOR_STATUS_GLYPH: Record<FactorStatus, string> = {
  healthy: '✓',
  improving: '◐',
  not_started: '○',
  needs_attention: '!',
  not_enough_info: '—',
  not_relevant_yet: '🔒',
  not_applicable: 'N/A',
};

export const FACTOR_STATUS_LABEL: Record<FactorStatus, string> = {
  healthy: 'Healthy',
  improving: 'Improving',
  not_started: 'Not started',
  needs_attention: 'Needs attention',
  not_enough_info: 'Not enough information',
  not_relevant_yet: 'Not relevant yet',
  not_applicable: 'Not applicable',
};

/** For each category, the single strongest factor and the single biggest
 * opportunity — real numbers only, formatted for the "Strong / Improve /
 * Potential / Action" card layout (PRD ask, §A13). Never invented text;
 * every line traces back to a factor already computed above. */
export function summariseCategory(category: ScoreCategory): { strong: ScoreFactor | null; improve: ScoreFactor | null } {
  const applicable = category.factors.filter((f) => f.applicable);
  const strong = [...applicable].sort((a, b) => b.points / (b.maxPoints || 1) - a.points / (a.maxPoints || 1))[0] ?? null;
  const improve = [...applicable].filter((f) => f.potentialPoints > 0.4).sort((a, b) => b.potentialPoints - a.potentialPoints)[0] ?? null;
  return { strong, improve };
}
