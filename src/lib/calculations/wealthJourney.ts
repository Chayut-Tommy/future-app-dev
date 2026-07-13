import { AppData } from '../../types/models';
import { computeAchievements } from './achievements';
import { ACCESSIBLE_INVESTMENT_TYPES } from './assetGroups';

export interface WealthJourneyStage {
  id: string;
  emoji: string;
  label: string;
  done: boolean;
}

export type WealthPathKey = 'foundation' | 'debt' | 'wealth' | 'retirement';

export interface WealthPath {
  key: WealthPathKey;
  label: string;
  /** Whether this path is meaningfully relevant to this user right now —
   * e.g. the debt path only matters once real debt exists (PRD ask, §8:
   * "do not create one universal path where everyone must [...]"). Always
   * still explorable, just not the one shown by default when irrelevant. */
  relevant: boolean;
  stages: WealthJourneyStage[];
}

/**
 * "Your Money Path" — split into separate, life-situation-specific paths
 * instead of one universal 7-step line everyone is forced through (PRD ask,
 * §8): a renter who doesn't invest and a mortgage-holder who does aren't on
 * the same journey, and pretending otherwise either shames one or flatters
 * the other. Every stage that overlaps a real achievement reads its `done`
 * state directly from computeAchievements — the one canonical engine —
 * rather than recomputing the same threshold with separate local logic
 * (PRD bug report, §9: two independent implementations of the same
 * "financial_freedom"-style formula previously drifted out of sync).
 */
export function computeWealthPaths(data: AppData): WealthPath[] {
  const achievements = computeAchievements(data);
  const byId = (id: string) => achievements.find((a) => a.id === id)?.unlocked ?? false;
  const hasInvestments = data.assets.some((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type));
  const hasProperty = data.assets.some((a) => a.type === 'property');
  const hasAnyDebt = data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0);
  const hasNonMortgageDebt =
    data.liabilities.some((l) => l.type !== 'mortgage' && l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0);
  const hasRetirementSavings = data.assets.some((a) => a.type === 'super' && a.currentValue > 0);

  const foundation: WealthPath = {
    key: 'foundation',
    label: 'Foundation',
    relevant: true,
    stages: [
      { id: 'start', emoji: '🟢', label: 'Started', done: data.user.hasSeenIntro },
      { id: 'income', emoji: '💼', label: 'Added income or confirmed no income', done: data.user.monthlyIncome > 0 || !!data.user.confirmedNoIncome },
      { id: 'cash', emoji: '💵', label: 'Added cash/savings', done: byId('added_savings') },
      { id: 'bills', emoji: '📅', label: 'Added regular bills', done: data.recurringItems.some((r) => r.type === 'expense') || !!data.user.confirmedBillsLater },
      { id: 'goal', emoji: '🎯', label: 'Created first goal', done: byId('created_first_goal') },
      { id: 'buffer_500', emoji: '💰', label: 'Built first $500 buffer', done: byId('saved_1000') || data.assets.some((a) => (a.type === 'cash' || a.type === 'savings') && a.currentValue >= 500) },
      { id: 'emergency_1mo', emoji: '🛡', label: 'Built one month of essential expenses', done: byId('emergency_fund') },
      { id: 'emergency_3mo', emoji: '🛡', label: 'Built three months of essential expenses', done: byId('emergency_fund_3mo') },
    ],
  };

  const debt: WealthPath = {
    key: 'debt',
    label: 'Debt',
    relevant: hasAnyDebt || !!data.user.confirmedNoDebt,
    stages: [
      { id: 'debt_picture', emoji: '📋', label: 'Added debt picture', done: hasAnyDebt || !!data.user.confirmedNoDebt },
      { id: 'card_reduced', emoji: '💳', label: 'Credit-card balance reduced', done: byId('paid_off_card') },
      { id: 'liability_repaid', emoji: '✅', label: 'Repaid a liability', done: byId('paid_off_car_loan') || byId('paid_off_mortgage') },
      { id: 'non_mortgage_debt_free', emoji: '🏁', label: 'Became free of non-mortgage debt', done: !hasNonMortgageDebt },
    ],
  };

  const wealth: WealthPath = {
    key: 'wealth',
    label: 'Wealth',
    relevant: true,
    stages: [
      { id: 'first_investment', emoji: '📈', label: 'Added first personal investment', done: hasInvestments },
      { id: 'invested_1000', emoji: '📈', label: '$1,000 invested', done: byId('invested_1000') },
      { id: 'invested_10000', emoji: '📈', label: '$10,000 invested', done: byId('invested_10000') },
      ...(hasProperty ? [{ id: 'first_property', emoji: '🏠', label: 'First property', done: true }] : []),
      { id: 'positive_net_worth', emoji: '⚖️', label: 'Positive accessible net worth', done: byId('net_worth_100k') || (data.assets.reduce((s, a) => s + a.currentValue, 0) - data.liabilities.reduce((s, l) => s + l.currentBalance, 0) > 0) },
      { id: 'net_worth_50k', emoji: '💎', label: '$50,000 accessible net worth', done: byId('saved_50000') || byId('net_worth_100k') },
      { id: 'net_worth_100k', emoji: '💎', label: '$100,000 accessible net worth', done: byId('net_worth_100k') },
    ],
  };

  const retirement: WealthPath = {
    key: 'retirement',
    label: 'Retirement',
    relevant: hasRetirementSavings,
    stages: [
      { id: 'retirement_added', emoji: '🛡', label: 'Added retirement account', done: byId('started_super') },
      { id: 'retirement_10k', emoji: '🛡', label: '$10,000 retirement savings', done: byId('super_10000') },
      { id: 'retirement_50k', emoji: '🛡', label: '$50,000 retirement savings', done: byId('super_50000') },
      { id: 'retirement_100k', emoji: '🛡', label: '$100,000 retirement savings', done: byId('super_100000') },
      { id: 'retirement_one_year', emoji: '🏆', label: 'One year of income saved for retirement', done: byId('super_one_year_income') },
    ],
  };

  return [foundation, debt, wealth, retirement];
}

/** Which path to show by default — the one the user's actual situation
 * makes most relevant right now, never a one-size-fits-all default (PRD
 * ask, §8: "present one personalised Current Path... with other paths
 * available to explore"). */
export function computeCurrentPathKey(paths: WealthPath[]): WealthPathKey {
  const foundation = paths.find((p) => p.key === 'foundation')!;
  const foundationIncomplete = foundation.stages.some((s) => !s.done);
  if (foundationIncomplete) return 'foundation';

  const debt = paths.find((p) => p.key === 'debt')!;
  if (debt.relevant && debt.stages.some((s) => !s.done)) return 'debt';

  const retirement = paths.find((p) => p.key === 'retirement')!;
  if (retirement.relevant) return 'retirement';

  return 'wealth';
}

/** Backward-compatible flat view for callers that just want one
 * personalised path (Today's compact preview, e.g.) — always the current
 * path's stages. */
export function computeWealthJourneyStages(data: AppData): WealthJourneyStage[] {
  const paths = computeWealthPaths(data);
  const currentKey = computeCurrentPathKey(paths);
  return paths.find((p) => p.key === currentKey)!.stages;
}
