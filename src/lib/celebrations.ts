import { Ionicons } from '@expo/vector-icons';
import { brand } from './brand';

export type CelebrationTier = 'small' | 'medium' | 'big';

export interface CelebrationEvent {
  id: string;
  tier: CelebrationTier;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/** Every contribution gets a small reaction — the most frequent celebration,
 * so it stays light-touch (sparkle + haptic, not a modal). */
export function buildSavingCelebration(amount: number, goalName?: string): CelebrationEvent {
  return {
    id: 'saving',
    tier: 'small',
    icon: 'trophy',
    title: 'You did it! 🎉',
    body: goalName ? `You just added another ${formatMoney(amount)} towards "${goalName}".` : `You just added another ${formatMoney(amount)} towards your goal.`,
  };
}

/** A goal actually reaching 100% — a genuinely big, emotionally-attached
 * moment (PRD ask), so it earns the full-screen confetti tier, not just
 * the bottom sheet. */
export function buildGoalMilestoneCelebration(goalName: string): CelebrationEvent {
  return { id: 'goal_milestone', tier: 'big', icon: 'trophy', title: `Goal achieved — ${goalName} completed! 🎉`, body: 'Your future self will thank you.' };
}

export function buildDebtReducedCelebration(): CelebrationEvent {
  return { id: 'debt_reduced', tier: 'small', icon: 'shield-checkmark', title: 'Debt reduced! 💪', body: 'One step closer to financial freedom.' };
}

export function buildDebtFreeCelebration(): CelebrationEvent {
  return { id: 'debt_free_confirmed', tier: 'small', icon: 'shield-checkmark', title: 'Great — staying debt free helps your financial health.', body: '' };
}

export function buildProfileCompleteCelebration(): CelebrationEvent {
  return { id: 'profile_complete', tier: 'small', icon: 'sparkles', title: `${brand.name} understands you better now. ✨`, body: '' };
}
