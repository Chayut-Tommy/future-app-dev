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

// Every 10-point band gets its own encouraging line (PRD ask, §6) — the
// full-screen confetti tier is reserved for 100 alone, since that's the one
// genuinely rare, "made it all the way" moment; every other milestone stays
// a bottom sheet so ten possible celebrations never feel intrusive.
export const SCORE_MILESTONES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const SCORE_MILESTONE_COPY: Record<number, string> = {
  10: 'Great start! Every journey begins with a first step.',
  20: "You're building momentum. Keep adding to your financial picture.",
  30: `Nice progress! ${brand.name} is beginning to understand your finances.`,
  40: "You're developing healthy financial habits.",
  50: 'Halfway there! Your financial picture is becoming much clearer.',
  60: "Looking good. You're making meaningful progress.",
  70: 'Great work! Your financial foundation is getting stronger.',
  80: "Excellent! You're well on your way to strong financial health.",
  90: 'Outstanding! Only a few more improvements to reach the top.',
  100: "You've built an exceptional financial foundation. Keep maintaining these great habits.",
};

/**
 * Finds the highest milestone the score has newly crossed since the last
 * one celebrated (never re-fires for a milestone already shown, never
 * skipped over silently if the score jumped past more than one at once —
 * only the highest of the newly-crossed ones is shown, so a big single
 * jump still reads as one celebration, not a stack of them).
 */
export function computeScoreMilestoneCelebration(
  score: number,
  previouslyCelebrated: number
): { event: CelebrationEvent; milestone: number } | null {
  const crossed = SCORE_MILESTONES.filter((m) => m <= score && m > previouslyCelebrated);
  if (crossed.length === 0) return null;
  const milestone = Math.max(...crossed);
  const isMax = milestone === 100;
  return {
    milestone,
    event: {
      id: `score_milestone_${milestone}`,
      tier: isMax ? 'big' : 'medium',
      icon: isMax ? 'trophy' : 'sparkles',
      title: isMax ? 'Congratulations! 🏆' : `${brand.scoreName}: ${milestone}/100 🎉`,
      body: SCORE_MILESTONE_COPY[milestone],
    },
  };
}
