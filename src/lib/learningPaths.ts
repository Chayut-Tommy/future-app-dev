import { Ionicons } from '@expo/vector-icons';
import { LEARNING_CARDS, LearningCard } from './learningCards';

export type LearningPathId = 'buying_a_home' | 'investing' | 'debt_free' | 'saving';

export interface LearningPath {
  id: LearningPathId;
  title: string;
  emoji: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Ordered lesson ids — the sequence a user works through, not just a
   * category dump (PRD ask: "each journey contains lessons"). */
  cardIds: string[];
}

// Discover as "Grow with Lulu": a handful of named journeys instead of a
// flat article list (PRD ask). Card ids reference LEARNING_CARDS — kept as
// ids (not duplicated content) so there is one source of truth per lesson.
export const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'investing',
    title: 'Investing Journey',
    emoji: '📈',
    icon: 'trending-up-outline',
    cardIds: [
      'what-is-an-etf',
      'understanding-index-funds',
      'dollar-cost-averaging',
      'how-to-start-investing',
      'why-diversification-matters',
      'compound-growth',
      'shares-vs-property',
      'dividend-investing',
    ],
  },
  {
    id: 'buying_a_home',
    title: 'Buying a Home Journey',
    emoji: '🏠',
    icon: 'home-outline',
    cardIds: ['home-deposit-basics', 'loan-to-value-ratio', 'property-vs-shares'],
  },
  {
    id: 'debt_free',
    title: 'Debt Free Journey',
    emoji: '💳',
    icon: 'card-outline',
    cardIds: ['avalanche-vs-snowball', 'minimum-payments-cost-more', 'good-debt-vs-bad-debt', 'debt-to-income'],
  },
  {
    id: 'saving',
    title: 'Saving Journey',
    emoji: '💰',
    icon: 'wallet-outline',
    cardIds: ['pay-yourself-first', '50-30-20-method'],
  },
];

export function learningPathCards(path: LearningPath): LearningCard[] {
  return path.cardIds.map((id) => LEARNING_CARDS.find((c) => c.id === id)).filter((c): c is LearningCard => !!c);
}

/** Real, derived-from-actual-taps progress — never a fabricated fraction. */
export function learningPathProgress(path: LearningPath, completedIds: string[]): { completed: number; total: number } {
  const total = path.cardIds.length;
  const completed = path.cardIds.filter((id) => completedIds.includes(id)).length;
  return { completed, total };
}

// Wave 9c — `recommendedLearningPath` and its GOAL_TO_PATH map were
// retired: the resolver had ZERO production consumers (verified by
// repository-wide search), and its only input was the retired Main Money
// Goal profile enum. No replacement recommendation path was invented.
