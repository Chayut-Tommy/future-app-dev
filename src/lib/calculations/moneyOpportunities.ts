import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';
import { computeLiquidCash } from './liquidAssets';
import { ACCESSIBLE_INVESTMENT_TYPES } from './assetGroups';

export type MoneyOpportunityAction = 'compare_savings' | 'open_money' | 'open_investing_path' | 'debt_coach' | 'add_cash';

export interface MoneyOpportunity {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  actionLabel: string;
  action: MoneyOpportunityAction;
}

function idleCashOpportunity(data: AppData): MoneyOpportunity | null {
  // Specifically savings, not everyday spending cash — comparing rates
  // only makes sense for an interest-bearing account (PRD ask: cash and
  // savings behave, and get coached, differently).
  const cashAssets = data.assets.filter((a) => a.type === 'savings' && a.currentValue > 0);
  if (cashAssets.length === 0 || data.savingsComparisons.length === 0) return null;
  const totalCash = cashAssets.reduce((sum, a) => sum + a.currentValue, 0);
  const weightedRate = cashAssets.reduce((sum, a) => sum + (a.interestRate ?? 0) * a.currentValue, 0) / totalCash;
  const bestComparison = data.savingsComparisons.reduce((max, c) => (c.rate > max.rate ? c : max), data.savingsComparisons[0]);
  if (bestComparison.rate <= weightedRate) return null;
  const annualExtra = totalCash * (bestComparison.rate - weightedRate);
  if (annualExtra < 1) return null;
  return {
    id: 'idle_cash',
    icon: 'trending-up-outline',
    title: 'Savings account rate',
    detail: `Current: ${(weightedRate * 100).toFixed(1)}% · ${bestComparison.bankName} lists ${(bestComparison.rate * 100).toFixed(1)}% — a difference of about $${Math.round(annualExtra).toLocaleString()} a year on this balance.`,
    actionLabel: 'Compare rates',
    action: 'compare_savings',
  };
}

function savingsRateOpportunity(data: AppData): MoneyOpportunity | null {
  if (data.user.monthlyIncome <= 0) return null;
  const summary = computeMonthlySummary(data);
  if (summary.savingsRate <= 0 || summary.savingsRate >= 0.25) return null;
  const ratePct = Math.round(summary.savingsRate * 100);
  return {
    id: 'savings_rate',
    icon: 'bar-chart-outline',
    title: 'Savings rate',
    detail: `Current: ${ratePct}% of income · General reference: many people aim for around 20–25%.`,
    actionLabel: 'Review spending',
    action: 'open_money',
  };
}

function readyToInvestOpportunity(data: AppData): MoneyOpportunity | null {
  const hasInvestments = data.assets.some((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type));
  if (hasInvestments) return null;
  const cash = computeLiquidCash(data.assets);
  if (cash < 1000 && data.user.monthlyIncome <= 0) return null;
  return {
    id: 'ready_to_invest',
    icon: 'rocket-outline',
    title: 'Investment learning',
    detail: "You haven't recorded any investments yet — explore the fundamentals whenever you're curious.",
    actionLabel: 'Explore basics',
    action: 'open_investing_path',
  };
}

function cardDebtOpportunity(data: AppData): MoneyOpportunity | null {
  const hasCardDebt = data.creditCards.some((c) => c.currentBalance > 0);
  if (!hasCardDebt) return null;
  return {
    id: 'card_debt',
    icon: 'card-outline',
    title: 'Credit card balance',
    detail: "You're carrying a balance that's accruing interest.",
    actionLabel: 'View debt overview',
    action: 'debt_coach',
  };
}

function emergencyFundOpportunity(data: AppData): MoneyOpportunity | null {
  if (data.user.monthlyIncome <= 0) return null;
  const cash = computeLiquidCash(data.assets);
  const target = data.user.monthlyIncome * 3;
  if (cash >= target) return null;
  const monthsCovered = Math.round((cash / data.user.monthlyIncome) * 10) / 10;
  return {
    id: 'emergency_fund',
    icon: 'shield-outline',
    title: 'Emergency savings',
    detail: `Current: ${monthsCovered} month${monthsCovered === 1 ? '' : 's'} of expenses · General reference: many people aim for 3–6 months.`,
    actionLabel: 'Add savings',
    action: 'add_cash',
  };
}

/**
 * Factual, reference-style insights from the user's own data — never a
 * fabricated dollar figure, and never phrased as a directive (PRD ask:
 * Grow should read as educational reference points — "current" vs. "a
 * general reference" — not as personalised recommendations). The
 * savings-rate comparison specifically uses a rate the user themselves
 * entered in Compare Savings, not an invented "market best rate."
 */
export function computeMoneyOpportunities(data: AppData): MoneyOpportunity[] {
  return [
    cardDebtOpportunity(data),
    emergencyFundOpportunity(data),
    idleCashOpportunity(data),
    savingsRateOpportunity(data),
    readyToInvestOpportunity(data),
  ].filter((o): o is MoneyOpportunity => o !== null);
}
