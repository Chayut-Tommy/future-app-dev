import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeCreditAggregate } from './creditHealth';
import { computeAssetAllocation, computeDiversificationScore } from './wealthProjection';
import { computeMonthlySummary } from './monthlySummary';
import { computeCategoryDeltas } from './spendingInsights';
import { computeLiquidCash } from './liquidAssets';
import { requiredMonthlyForGoal } from './goalAllocation';
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
 * Factual, reference-style insights derived from the user's real data —
 * never a fabricated claim, never phrased as a directive (PRD ask, Voice
 * guide §0.1a: "current state + general reference," not "problem +
 * directive"; action labels describe navigation, not commands). Always
 * framed as an observation Navilo made, not a deficiency in the user.
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
    const monthsCoveredLabel = Math.round(monthsCovered * 10) / 10;
    const investmentAssets = assets
      .filter((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type))
      .reduce((sum, a) => sum + a.currentValue, 0);
    const superAssets = assets.filter((a) => a.type === 'super').reduce((sum, a) => sum + a.currentValue, 0);

    if (monthsCovered < 3) {
      opportunities.push({
        icon: 'shield-checkmark-outline',
        title: 'Emergency savings',
        body: `Current: ${monthsCoveredLabel} month${monthsCoveredLabel === 1 ? '' : 's'} of expenses saved. General reference: many people aim for 3–6 months.`,
        actionLabel: 'View options',
        action: 'add_asset',
      });
    } else if (monthsCovered >= 3 && monthsCovered < 6) {
      opportunities.push({
        icon: 'shield-checkmark-outline',
        title: 'Emergency savings',
        body: `Current: ${monthsCoveredLabel} months of expenses saved. General reference: many people extend to 6 months for extra buffer.`,
        actionLabel: 'View options',
        action: 'add_asset',
      });
    } else if (monthsCovered > 8 && investmentAssets < monthlyIncome * 3) {
      opportunities.push({
        icon: 'cash-outline',
        title: 'Cash reserves',
        body: `Current: ${monthsCoveredLabel} months of expenses held in cash. General reference: many people invest cash beyond roughly 6 months of expenses.`,
        actionLabel: 'Explore investing',
        action: 'add_asset',
      });
    }

    if (investmentAssets === 0) {
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Investments',
        body: 'Current: no investments recorded yet. General reference: investing is one way people grow wealth over the long term.',
        actionLabel: 'Explore investing',
        action: 'add_asset',
        investingRelated: true,
      });
    } else if (investmentAssets / (monthlyIncome * 12) < 0.1) {
      const investPct = Math.round((investmentAssets / (monthlyIncome * 12)) * 100);
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Investment contribution rate',
        body: `Current: investments are about ${investPct}% of annual income. General reference: contribution rates vary widely by goal and risk tolerance.`,
        actionLabel: 'Explore investing',
        action: 'add_asset',
        investingRelated: true,
      });
    }

    if (superAssets === 0 || superAssets < monthlyIncome * 6) {
      opportunities.push({
        icon: 'shield-outline',
        title: 'Retirement savings',
        body: `Current: $${Math.round(superAssets).toLocaleString()} recorded. General reference: retirement balances vary widely by age and country.`,
        actionLabel: 'View options',
        action: 'add_asset',
        investingRelated: true,
      });
    }

    if (summary.savingsRate < 0.1) {
      const ratePct = Math.round(summary.savingsRate * 100);
      opportunities.push({
        icon: 'trending-up-outline',
        title: 'Savings rate',
        body: `Current: ${ratePct}% of income. General reference: many people aim for around 10–20%.`,
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
        title: 'Portfolio concentration',
        body: `Current: concentrated in ${allocation[0]?.label ?? 'one area'}. General reference: many people spread holdings across multiple asset types.`,
        actionLabel: 'View details',
        action: 'add_asset',
        investingRelated: true,
      });
    }
    const assetTypesPresent = new Set(assets.map((a) => a.type)).size;
    if (assetTypesPresent < 2) {
      opportunities.push({
        icon: 'map-outline',
        title: 'Wealth Map coverage',
        body: `Current: ${assetTypesPresent} asset type recorded. A fuller picture can include property, retirement, and investments where relevant.`,
        actionLabel: 'View options',
        action: 'add_asset',
      });
    }
  }

  if (creditCards.length > 0) {
    const { utilisation } = computeCreditAggregate(creditCards);
    if (utilisation > 0.3) {
      opportunities.push({
        icon: 'card-outline',
        title: 'Credit utilisation',
        body: `Current: ${Math.round(utilisation * 100)}% utilisation. General reference: many people aim to stay under 30%.`,
        actionLabel: 'Review',
        action: 'manage_cards',
      });
    }
    const withApr = creditCards.filter((c) => typeof c.apr === 'number');
    if (withApr.length > 1) {
      const highest = withApr.reduce((max, c) => ((c.apr ?? 0) > (max.apr ?? 0) ? c : max), withApr[0]);
      opportunities.push({
        icon: 'flame-outline',
        title: 'Card interest rates',
        body: `${highest.label} carries the highest recorded rate among your cards (${Math.round((highest.apr ?? 0) * 100)}%).`,
        actionLabel: 'Review',
        action: 'manage_cards',
      });
    }
  }

  if (goals.length === 0) {
    opportunities.push({
      icon: 'flag-outline',
      title: 'Goals',
      body: `No goals recorded yet. Add one and ${brand.name} will track your progress toward it.`,
      actionLabel: 'Set a goal',
      action: 'add_goal',
    });
  }

  if (transactions.length > 0) {
    opportunities.push({
      icon: 'search-outline',
      title: 'Spending patterns',
      body: `${brand.name} tracks patterns in your logged transactions.`,
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
    title: 'Insurance coverage',
    body: 'General reference: many people review policies periodically as circumstances change.',
    actionLabel: 'Review',
    action: 'none',
  });
  opportunities.push({
    icon: 'stats-chart-outline',
    title: 'Net worth history',
    body: `${brand.name} keeps a running history you can view anytime.`,
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

  // Derived live from the goal's current fields via the same canonical
  // helper GoalDetailSheet/Available Until Payday/What Happens Next all
  // read (Stream A follow-up §6) — never the cached
  // Goal.estimatedMonthlyContribution snapshot, which can go stale after a
  // progress-only update (neither Today's quick-contribute buttons nor
  // GoalDetailSheet's "Update goal progress" refresh that cache, since
  // they're deliberately a planning action only, not a field edit).
  const goal = data.goals.find((g) => g.status === 'active' && g.targetAmount && requiredMonthlyForGoal(g) > 0);
  if (!goal || !goal.targetAmount) return null;

  const canonicalMonthly = requiredMonthlyForGoal(goal);
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const currentMonths = remaining / canonicalMonthly;
  const potentialMonthlySaving = biggestIncrease.delta;
  const improvedMonths = remaining / (canonicalMonthly + potentialMonthlySaving);
  const monthsSaved = Math.round(currentMonths - improvedMonths);

  if (monthsSaved < 1) return null;

  return {
    icon: 'bulb-outline',
    title: `${biggestIncrease.categoryName} spending is up`,
    body: `If this returns to its previous level (about $${Math.round(potentialMonthlySaving)}/mo), "${goal.name}" could be reached roughly ${monthsSaved} month${monthsSaved === 1 ? '' : 's'} sooner.`,
    actionLabel: 'Review',
    action: 'review_spending',
  };
}
