import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeCreditAggregate } from './creditHealth';
import { computeAssetAllocation, computeDiversificationScore } from './wealthProjection';
import { computeMonthlySummary } from './monthlySummary';
import { computeCategoryDeltas } from './spendingInsights';
import { computeLiquidCash } from './liquidAssets';
import { ACCESSIBLE_INVESTMENT_TYPES } from './assetGroups';
import { brand } from '../brand';

export type OpportunityAction = 'add_asset' | 'add_goal' | 'review_spending' | 'manage_cards' | 'open_discover' | 'open_wealth' | 'none';

export interface Opportunity {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  action: OpportunityAction;
  /** Show the "New to investing? Learn the basics with Lulu" pathway
   * (PRD ask: guide first, then ask for action — many users are beginners). */
  investingRelated?: boolean;
}

/**
 * Lulu's coaching engine — a stand-in for the full Recommendation Engine v2
 * (PRD §8). Every rule here is either derived from the user's real data or
 * is a clearly generic, evergreen educational nudge — never a fabricated
 * claim. Always framed as an opportunity (PRD §0.1), never a deficiency.
 * Copy is deliberately short — one punchy line, Apple-Fitness-card style —
 * with `action` telling the card what the button should actually do.
 */
export function findOpportunities(data: AppData): Opportunity[] {
  const opportunities: Opportunity[] = [];
  const { user, assets, goals, creditCards, transactions } = data;
  const monthlyIncome = user.monthlyIncome;

  // --- The single most important message: behavior explained against a goal ---
  const goalImpact = buildGoalImpactOpportunity(data);
  if (goalImpact) opportunities.push(goalImpact);

  if (monthlyIncome > 0) {
    const summary = computeMonthlySummary(data);
    const cash = computeLiquidCash(assets);
    const monthsCovered = cash / monthlyIncome;
    const investmentAssets = assets
      .filter((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type))
      .reduce((sum, a) => sum + a.currentValue, 0);
    const superAssets = assets.filter((a) => a.type === 'super').reduce((sum, a) => sum + a.currentValue, 0);

    if (monthsCovered < 3) {
      opportunities.push({
        icon: 'shield-checkmark-outline',
        title: 'Build emergency fund 🛡️',
        body: 'Grow toward 3 months of expenses.',
        actionLabel: 'Add now',
        action: 'add_asset',
      });
    } else if (monthsCovered >= 3 && monthsCovered < 6) {
      opportunities.push({
        icon: 'shield-checkmark-outline',
        title: 'Extend your buffer',
        body: 'Stretch to 6 months for extra safety.',
        actionLabel: 'Add now',
        action: 'add_asset',
      });
    } else if (monthsCovered > 8 && investmentAssets < monthlyIncome * 3) {
      opportunities.push({
        icon: 'cash-outline',
        title: 'Put idle cash to work',
        body: 'Some of your cash could be invested.',
        actionLabel: 'Invest',
        action: 'add_asset',
      });
    }

    if (investmentAssets === 0) {
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Start investing 📈',
        body: 'Investing may help build your score over time.',
        actionLabel: 'Invest',
        action: 'add_asset',
        investingRelated: true,
      });
    } else if (investmentAssets / (monthlyIncome * 12) < 0.1) {
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Invest a little more',
        body: 'Small increases compound over years.',
        actionLabel: 'Invest',
        action: 'add_asset',
        investingRelated: true,
      });
    }

    if (superAssets === 0 || superAssets < monthlyIncome * 6) {
      opportunities.push({
        icon: 'shield-outline',
        title: 'Boost retirement 🚀',
        body: 'Small increases today grow future wealth.',
        actionLabel: 'Improve',
        action: 'add_asset',
        investingRelated: true,
      });
    }

    if (summary.savingsRate < 0.1) {
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Save a bit more',
        body: 'A few extra percent compounds fast.',
        actionLabel: 'Review',
        action: 'review_spending',
      });
    }
  }

  if (assets.length > 0) {
    const allocation = computeAssetAllocation(assets);
    const diversification = computeDiversificationScore(allocation);
    if (allocation.length >= 1 && diversification < 40) {
      opportunities.push({
        icon: 'pie-chart-outline',
        title: 'Diversify your wealth',
        body: `Concentrated in ${allocation[0]?.label ?? 'one area'} right now.`,
        actionLabel: 'Improve',
        action: 'add_asset',
        investingRelated: true,
      });
    }
    const assetTypesPresent = new Set(assets.map((a) => a.type)).size;
    if (assetTypesPresent < 2) {
      opportunities.push({
        icon: 'map-outline',
        title: 'Complete your Wealth Map',
        body: 'Add property, super, or investments.',
        actionLabel: 'Add now',
        action: 'add_asset',
      });
    }
  }

  if (creditCards.length > 0) {
    const { utilisation } = computeCreditAggregate(creditCards);
    if (utilisation > 0.3) {
      opportunities.push({
        icon: 'card-outline',
        title: 'Lower card balance',
        body: 'Reducing your balance may help your score.',
        actionLabel: 'Review',
        action: 'manage_cards',
      });
    }
    const withApr = creditCards.filter((c) => typeof c.apr === 'number');
    if (withApr.length > 1) {
      const highest = withApr.reduce((max, c) => ((c.apr ?? 0) > (max.apr ?? 0) ? c : max), withApr[0]);
      opportunities.push({
        icon: 'flame-outline',
        title: 'Tackle high-interest debt',
        body: `${highest.label} costs you the most.`,
        actionLabel: 'Review',
        action: 'manage_cards',
      });
    }
  }

  if (goals.length === 0) {
    opportunities.push({
      icon: 'flag-outline',
      title: 'Set your first goal 🎯',
      body: `A clear goal makes ${brand.name}'s suggestions more relevant.`,
      actionLabel: 'Set goal',
      action: 'add_goal',
    });
  }

  if (transactions.length > 0) {
    opportunities.push({
      icon: 'search-outline',
      title: 'Review your spending',
      body: `Spot patterns ${brand.name} already noticed.`,
      actionLabel: 'Review',
      action: 'review_spending',
    });
  }

  // Evergreen educational nudges — generic by design, never a specific
  // financial claim, just enough to keep the list feeling alive.
  opportunities.push({
    icon: 'book-outline',
    title: "Today's 5-min lesson 📚",
    body: 'A quick read, chosen just for today.',
    actionLabel: 'Read',
    action: 'open_discover',
  });
  opportunities.push({
    icon: 'umbrella-outline',
    title: 'Check your coverage',
    body: 'Make sure policies still fit your life.',
    actionLabel: 'Review',
    action: 'none',
  });
  opportunities.push({
    icon: 'stats-chart-outline',
    title: 'Track your net worth',
    body: `${brand.name} is already keeping the history.`,
    actionLabel: 'View',
    action: 'open_wealth',
  });

  return opportunities;
}

/**
 * This is where Lulu explains behavior, not just displays numbers: when a
 * category spend has meaningfully increased AND an active goal with a
 * contribution pace exists, connect the two. The math is real (derived
 * from the user's own transaction and goal data), not a canned line.
 */
export function buildGoalImpactOpportunity(data: AppData): Opportunity | null {
  const deltas = computeCategoryDeltas(data);
  const biggestIncrease = deltas.find((d) => d.changePct >= 0.15 && d.delta > 0);
  if (!biggestIncrease) return null;

  const goal = data.goals.find(
    (g) => g.status === 'active' && g.targetAmount && g.estimatedMonthlyContribution && g.estimatedMonthlyContribution > 0
  );
  if (!goal || !goal.targetAmount || !goal.estimatedMonthlyContribution) return null;

  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const currentMonths = remaining / goal.estimatedMonthlyContribution;
  const potentialMonthlySaving = biggestIncrease.delta;
  const improvedMonths = remaining / (goal.estimatedMonthlyContribution + potentialMonthlySaving);
  const monthsSaved = Math.round(currentMonths - improvedMonths);

  if (monthsSaved < 1) return null;

  return {
    icon: 'bulb-outline',
    title: `${biggestIncrease.categoryName} spending is up`,
    body: `Cut $${Math.round(potentialMonthlySaving)}/mo, reach "${goal.name}" ~${monthsSaved}mo sooner.`,
    actionLabel: 'Review',
    action: 'review_spending',
  };
}
