import { SafeToSpendResult } from './safeToSpend';
import { MonthlySummary } from './monthlySummary';
import { brand } from '../brand';

export type GreetingPeriod = 'lateNight' | 'morning' | 'afternoon' | 'evening';

/** Returns a translation key suffix (today.greeting.<period>) rather than
 * English text, so callers can localise it via i18next. */
function greetingPeriod(hour: number): GreetingPeriod {
  if (hour < 5) return 'lateNight';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatMoney(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * A short, data-driven briefing line — the thing that makes the dashboard
 * feel like a coach rather than a spreadsheet. Falls back to a plain
 * statement when there isn't enough history yet for a comparison.
 */
export function buildBriefing(
  safeToSpend: SafeToSpendResult,
  thisMonth: MonthlySummary,
  lastMonth: MonthlySummary | null
): string {
  const dayWord = safeToSpend.daysRemaining === 1 ? 'day' : 'days';
  const base = `You have ${formatMoney(safeToSpend.remainingPool)} available until payday in ${safeToSpend.daysRemaining} ${dayWord}.`;

  if (!lastMonth || lastMonth.income === 0) {
    return base;
  }

  const savingsRateDelta = thisMonth.savingsRate - lastMonth.savingsRate;
  if (savingsRateDelta > 0.02) {
    return `${base} ${brand.name} noticed you're tracking better than last month.`;
  }
  if (savingsRateDelta < -0.02) {
    return `${base} ${brand.name} noticed spending is running a bit higher than last month.`;
  }
  return `${base} You're tracking about the same as last month.`;
}

export function timeAwareGreeting(name: string, t: (key: string) => string, hour: number = new Date().getHours()): string {
  const prefix = t(`today.greeting.${greetingPeriod(hour)}`);
  return name ? `${prefix}, ${name} 👋` : `${prefix} 👋`;
}

/** Sentence-form greeting for the Lulu Daily Message card — no emoji, since
 * that card already carries its own icon badge. */
export function dailyMessageGreeting(name: string, t: (key: string) => string, hour: number = new Date().getHours()): string {
  const prefix = t(`today.greeting.${greetingPeriod(hour)}`);
  return name ? `${prefix}, ${name}.` : `${prefix}.`;
}

export interface CheckInLine {
  topLine: string;
  /** Replaces the normal rotating daily insight for tiers where showing
   * one would be premature or contradict the top line. */
  insightOverride: string | null;
}

/**
 * Lulu's check-in line must stay honest about what it's actually done
 * (PRD bug report: "Lulu checked your money overnight" showed up right
 * after onboarding, before Lulu had checked anything). Brand new and
 * still-learning users get an honest, forward-looking line instead of a
 * claim about analysis that never happened; a real in-session action gets
 * acknowledged directly; only an established, returning user gets the
 * time-of-day "checked overnight" framing.
 */
export function computeCheckInLine(params: { firstOpenedAt?: string; actedThisSession: boolean; hour?: number }): CheckInLine {
  const hour = params.hour ?? new Date().getHours();
  if (params.actedThisSession) {
    return { topLine: 'Nice progress. Your money picture is getting clearer.', insightOverride: null };
  }
  if (params.firstOpenedAt) {
    const hoursSince = (Date.now() - new Date(params.firstOpenedAt).getTime()) / (60 * 60 * 1000);
    if (hoursSince < 1) {
      return { topLine: `Welcome to ${brand.name} 👋`, insightOverride: "Let's build your money picture together." };
    }
    if (hoursSince < 24 * 3) {
      return { topLine: "I'm learning about your money.", insightOverride: 'Add more details so I can guide you better.' };
    }
  }
  return {
    topLine: hour < 12 ? `${brand.name} checked your money overnight.` : "Here's how your money is looking today.",
    insightOverride: null,
  };
}
