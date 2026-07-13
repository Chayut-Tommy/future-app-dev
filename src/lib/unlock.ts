import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../types/models';
import { isAccessibleInvestment } from './calculations/assetGroups';
import { brand } from './brand';

export type UnlockFeature = 'lulu_score' | 'wealth_projection' | 'portfolio_insight' | 'lulu_cards_health' | 'goal_tracking';

export interface UnlockStatus {
  lulu_score: boolean;
  wealth_projection: boolean;
  portfolio_insight: boolean;
  lulu_cards_health: boolean;
  goal_tracking: boolean;
}

/**
 * Progressive unlock system (PRD §20): every feature is derivable from
 * whether the relevant data exists — there's no separate "completed
 * onboarding" gate, just per-feature availability that improves as the
 * user adds things, whenever they want, in any order.
 */
export function getUnlockStatus(data: AppData): UnlockStatus {
  return {
    lulu_score: data.user.monthlyIncome > 0,
    wealth_projection: data.assets.length > 0,
    portfolio_insight: data.assets.some((a) => isAccessibleInvestment(a.type)),
    lulu_cards_health: data.creditCards.length > 0,
    goal_tracking: data.goals.length > 0,
  };
}

export const UNLOCK_COPY: Record<
  UnlockFeature,
  { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; actionLabel: string }
> = {
  lulu_score: {
    icon: 'bulb-outline',
    title: `Unlock your ${brand.scoreName}`,
    body: `Add your salary to unlock your ${brand.scoreName}.`,
    actionLabel: 'Add income',
  },
  wealth_projection: {
    icon: 'trending-up-outline',
    title: 'See your wealth projection',
    body: 'Add your assets to see your wealth projection.',
    actionLabel: 'Add assets',
  },
  portfolio_insight: {
    icon: 'compass-outline',
    title: 'Understand your portfolio',
    body: 'Add investments to understand your portfolio.',
    actionLabel: 'Add investments',
  },
  lulu_cards_health: {
    icon: 'card-outline',
    title: 'Monitor your cards',
    body: `Add credit cards so ${brand.name} can monitor your financial health.`,
    actionLabel: 'Add a card',
  },
  goal_tracking: {
    icon: 'flag-outline',
    title: 'Track a goal',
    body: `Add a financial goal and ${brand.name} will track your progress toward it.`,
    actionLabel: 'Add a goal',
  },
};
