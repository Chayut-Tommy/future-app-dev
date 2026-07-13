import { Ionicons } from '@expo/vector-icons';
import { ConfidenceLevel, MoneyGoal } from '../types/models';

/** Shared between onboarding (WelcomeFlow) and Settings' Profile section —
 * one definition so the two pickers never drift apart. */
export const MONEY_GOALS: { value: MoneyGoal; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'save_more', label: 'Save more money', icon: 'wallet-outline' },
  { value: 'buy_home', label: 'Buy a home', icon: 'home-outline' },
  { value: 'build_investments', label: 'Build investments', icon: 'trending-up-outline' },
  { value: 'pay_debt', label: 'Pay debt', icon: 'card-outline' },
  { value: 'understand_spending', label: 'Understand spending', icon: 'receipt-outline' },
  { value: 'build_wealth', label: 'Build wealth', icon: 'diamond-outline' },
];

export const CONFIDENCE_LEVELS: { value: ConfidenceLevel; label: string; emoji: string }[] = [
  { value: 'beginner', label: 'Beginner', emoji: '😟' },
  { value: 'learning', label: 'Learning', emoji: '🙂' },
  { value: 'confident', label: 'Confident', emoji: '😎' },
];
