import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeAssetAllocation, computeDiversificationScore } from './wealthProjection';
import { computeLuluScore } from './luluScore';
import { computeMonthlySummary } from './monthlySummary';
import { computeLiquidCash } from './liquidAssets';
import { ACCESSIBLE_INVESTMENT_TYPES } from './assetGroups';
import { brand } from '../brand';

export interface Achievement {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  unlocked: boolean;
  /** Present only for milestones with a meaningful dollar (or score) progress bar. */
  current?: number;
  target?: number;
}

function hasLoggedActivityStreak(data: AppData, days: number): boolean {
  const loggedDates = new Set(data.transactions.map((t) => t.date.slice(0, 10)));
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (!loggedDates.has(d.toISOString().slice(0, 10))) return false;
  }
  return true;
}

/**
 * "Your Journey" — frequent, small wins rather than a few huge ones (PRD
 * ask: users need frequent wins), and personalised rather than a generic
 * checklist (PRD ask): debt milestones only appear if the user actually
 * carries that kind of debt, so someone with no credit card never sees
 * "Pay off credit card" as a locked placeholder. Every threshold is
 * derived from current state, never a persisted streak/history claim we
 * can't verify. "Financial Freedom" uses the well-known 25x-annual-expenses
 * safe-withdrawal-rate rule of thumb (a standard FIRE benchmark, not a Lulu
 * invention).
 */
export function computeAchievements(data: AppData): Achievement[] {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const investmentAssets = data.assets
    .filter((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type))
    .reduce((sum, a) => sum + a.currentValue, 0);
  const superAssets = data.assets.filter((a) => a.type === 'super').reduce((sum, a) => sum + a.currentValue, 0);
  const cash = computeLiquidCash(data.assets);
  const homeDepositGoal = data.goals.find((g) => g.lifeGoalType === 'house_deposit' && g.targetAmount);
  // Financial freedom means your assets can sustain your actual spending —
  // 25x annual EXPENSES (the standard safe-withdrawal-rate benchmark), not
  // 25x income, which previously produced an inconsistent, too-low target
  // for high-saving users (PRD bug report).
  const annualExpenses = computeMonthlySummary(data).expenses * 12;
  const allocation = computeAssetAllocation(data.assets);
  const diversification = computeDiversificationScore(allocation);
  const emergencyTarget = data.user.monthlyIncome * 3;
  const luluScore = computeLuluScore(data);

  const list: Achievement[] = [
    // --- Starter ---
    { id: 'started_lulu', icon: 'rocket', title: `Started ${brand.name}`, subtitle: 'Welcome — your journey begins.', unlocked: data.user.hasSeenIntro },
    { id: 'added_income', icon: 'cash', title: 'Added Income', subtitle: `Unlocked your ${brand.scoreName}.`, unlocked: data.user.monthlyIncome > 0 },
    { id: 'added_first_asset', icon: 'briefcase-outline', title: 'Added First Asset', subtitle: `${brand.name} can see more of your financial picture.`, unlocked: data.assets.length > 0 },
    { id: 'created_first_goal', icon: 'flag', title: 'Created First Goal', subtitle: `A clear target for ${brand.name} to track.`, unlocked: data.goals.length > 0 },

    // --- Saving ---
    { id: 'added_savings', icon: 'wallet', title: 'Added Savings', subtitle: 'Started tracking your cash.', unlocked: data.assets.some((a) => a.type === 'cash' || a.type === 'savings') },
    { id: 'saved_1000', icon: 'trending-up-outline', title: 'Saved First $1,000', subtitle: 'A real first step.', unlocked: cash >= 1000, current: cash, target: 1000 },
    { id: 'saved_5000', icon: 'trending-up-outline', title: 'Saved First $5,000', subtitle: 'Momentum is building.', unlocked: cash >= 5000, current: cash, target: 5000 },
    { id: 'saved_10000', icon: 'trending-up', title: 'Saved First $10,000', subtitle: 'A serious milestone.', unlocked: cash >= 10000, current: cash, target: 10000 },
    { id: 'saved_50000', icon: 'diamond-outline', title: 'Saved First $50,000', subtitle: 'A major savings milestone.', unlocked: cash >= 50000, current: cash, target: 50000 },
    { id: 'saved_100000', icon: 'diamond', title: 'Saved First $100,000', subtitle: 'A remarkable savings achievement.', unlocked: cash >= 100000, current: cash, target: 100000 },
    {
      id: 'emergency_fund',
      icon: 'shield-checkmark',
      title: '🛡 Safety net unlocked!',
      subtitle: 'You reached 1 month of expenses.',
      unlocked: data.user.monthlyIncome > 0 && cash >= data.user.monthlyIncome,
      current: cash,
      target: data.user.monthlyIncome,
    },
    {
      id: 'emergency_fund_3mo',
      icon: 'shield-checkmark',
      title: 'Built Emergency Fund',
      subtitle: '3 months of expenses set aside.',
      unlocked: data.user.monthlyIncome > 0 && cash >= emergencyTarget,
      current: cash,
      target: emergencyTarget,
    },

    // --- Investing (accessible investments only — see assetGroups.ts) ---
    { id: 'first_investment', icon: 'leaf', title: '🌱 Your first investment added!', subtitle: 'Your money journey is growing.', unlocked: investmentAssets > 0 },
    { id: 'invested_1000', icon: 'trending-up', title: 'Invested First $1,000', subtitle: 'Your portfolio is taking shape.', unlocked: investmentAssets >= 1000, current: investmentAssets, target: 1000 },
    { id: 'invested_10000', icon: 'trending-up', title: 'Invested First $10,000', subtitle: 'Serious investing momentum.', unlocked: investmentAssets >= 10000, current: investmentAssets, target: 10000 },
    {
      id: 'diversified_portfolio',
      icon: 'pie-chart',
      title: 'Diversified Portfolio',
      subtitle: 'Spread across asset types.',
      unlocked: diversification >= 50,
      current: diversification,
      target: 50,
    },

    // --- Retirement Savings — its own journey, not an investing milestone
    // (PRD bug report): retirement savings (Superannuation/401(k)/IRA/
    // pension) are generally inaccessible until retirement, so they
    // shouldn't unlock "first investment added" the way buying shares or
    // an ETF would (PRD ask, §B3). ---
    { id: 'started_super', icon: 'shield-checkmark', title: '🛡 Started your retirement journey', subtitle: 'Your first Retirement Savings balance has been added.', unlocked: superAssets > 0 },
    { id: 'super_10000', icon: 'shield-checkmark', title: '$10k Retirement Savings reached', subtitle: 'A real start on your retirement.', unlocked: superAssets >= 10000, current: superAssets, target: 10000 },
    { id: 'super_50000', icon: 'shield-checkmark', title: '$50k Retirement Savings reached', subtitle: 'Your retirement savings are building.', unlocked: superAssets >= 50000, current: superAssets, target: 50000 },
    { id: 'super_100000', icon: 'shield-checkmark', title: '$100k Retirement Savings reached', subtitle: 'A serious retirement milestone.', unlocked: superAssets >= 100000, current: superAssets, target: 100000 },
    {
      id: 'super_one_year_income',
      icon: 'shield-checkmark',
      title: 'Retirement Savings reached one year of income',
      subtitle: 'A meaningful long-term milestone.',
      unlocked: data.user.monthlyIncome > 0 && superAssets >= data.user.monthlyIncome * 12,
      current: superAssets,
      target: data.user.monthlyIncome > 0 ? data.user.monthlyIncome * 12 : undefined,
    },
  ];

  // --- Debt — only shown for debt the user actually carries (PRD ask:
  // personalised, not a generic checklist of things that don't apply). ---
  if (data.creditCards.length > 0) {
    list.push({
      id: 'paid_off_card',
      icon: 'card',
      title: 'Paid Off Credit Card',
      subtitle: 'Debt-free on your cards.',
      unlocked: data.creditCards.every((c) => c.currentBalance === 0),
    });
  }
  if (data.liabilities.some((l) => l.type === 'car_loan')) {
    list.push({
      id: 'paid_off_car_loan',
      icon: 'car',
      title: 'Paid Off Car Loan',
      subtitle: 'One less thing to owe on.',
      unlocked: data.liabilities.filter((l) => l.type === 'car_loan').every((l) => l.currentBalance === 0),
    });
  }
  if (data.liabilities.some((l) => l.type === 'mortgage')) {
    list.push({
      id: 'paid_off_mortgage',
      icon: 'home',
      title: 'Paid Off Home Loan',
      subtitle: 'Your home, fully yours.',
      unlocked: data.liabilities.filter((l) => l.type === 'mortgage').every((l) => l.currentBalance === 0),
    });
  }

  // --- Habits ---
  list.push({ id: 'activity_streak_7', icon: 'flame', title: '🔥 7 day streak!', subtitle: 'You checked your money every day.', unlocked: hasLoggedActivityStreak(data, 7) });
  if (!luluScore.locked && data.luluScoreHistory.length > 0) {
    const earliest = data.luluScoreHistory[0].score;
    list.push({
      id: 'score_improved_10',
      icon: 'star',
      title: `Improved ${brand.scoreName} by 10 Points`,
      subtitle: 'Real progress, tracked over time.',
      unlocked: luluScore.score - earliest >= 10,
      current: luluScore.score - earliest,
      target: 10,
    });
  }
  list.push({ id: 'score_80', icon: 'trophy', title: `Reached ${brand.scoreName} 80+`, subtitle: 'Elite money habits.', unlocked: !luluScore.locked && luluScore.score >= 80 });

  // --- Goals ---
  list.push({
    id: 'completed_first_goal',
    icon: 'checkmark-done-circle',
    title: 'Completed First Goal',
    subtitle: 'You said you would. You did.',
    unlocked: data.goals.some((g) => g.status === 'completed' || (g.targetAmount !== null && g.currentAmount >= g.targetAmount)),
  });
  list.push({
    id: 'home_deposit',
    icon: 'home',
    title: 'First Home Deposit',
    subtitle: 'Reached your property deposit goal.',
    unlocked: !!homeDepositGoal && homeDepositGoal.targetAmount !== null && homeDepositGoal.currentAmount >= homeDepositGoal.targetAmount,
    current: homeDepositGoal?.currentAmount,
    target: homeDepositGoal?.targetAmount ?? undefined,
  });

  // --- Wealth tiers ---
  list.push(
    { id: 'net_worth_100k', icon: 'diamond-outline', title: '$100k Net Worth', subtitle: 'A major compounding milestone.', unlocked: netWorth >= 100000, current: netWorth, target: 100000 },
    { id: 'net_worth_250k', icon: 'diamond-outline', title: '$250k Net Worth', subtitle: 'Keep building.', unlocked: netWorth >= 250000, current: netWorth, target: 250000 },
    { id: 'net_worth_500k', icon: 'diamond', title: '$500k Net Worth', subtitle: 'Serious wealth territory.', unlocked: netWorth >= 500000, current: netWorth, target: 500000 },
    {
      id: 'financial_freedom',
      icon: 'ribbon',
      title: 'Financial independence target',
      subtitle: 'Current accessible net worth at 25x annual expenses — a common reference benchmark, not a personalised plan.',
      unlocked: annualExpenses > 0 && netWorth >= annualExpenses * 25,
      current: netWorth,
      target: annualExpenses > 0 ? annualExpenses * 25 : undefined,
    }
  );

  return list;
}

export interface NextMilestone {
  achievement: Achievement;
  remaining: number;
}

/** The next locked, dollar-quantified milestone — powers both the Journey
 * "next up" highlight and the "$X away from your next milestone" daily
 * insight (real math, not a canned line). */
export function getNextMilestone(data: AppData): NextMilestone | null {
  const achievements = computeAchievements(data);
  const next = achievements.find((a) => !a.unlocked && typeof a.current === 'number' && typeof a.target === 'number');
  if (!next || typeof next.current !== 'number' || typeof next.target !== 'number') return null;
  return { achievement: next, remaining: Math.max(0, next.target - next.current) };
}
