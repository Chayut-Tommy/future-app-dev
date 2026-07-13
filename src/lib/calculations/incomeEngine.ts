import { PayFrequency } from '../../types/models';

const WEEKS_PER_MONTH = 52 / 12;
const FORTNIGHTS_PER_MONTH = 26 / 12;

/**
 * One shared income calculation engine (PRD ask) — every feature (Money
 * Engine, Safe to Spend, bills, goals, Lulu Score, recommendations) must
 * normalize a frequency-based amount to its true monthly equivalent the
 * same way. Previously each caller re-implemented this inline, and the
 * income entry flow didn't convert at all — "$1,000 weekly" was stored and
 * treated as "$1,000/month" everywhere (PRD bug report).
 */
export function toMonthlyAmount(amount: number, frequency: PayFrequency | string): number {
  switch (frequency) {
    case 'weekly':
      return amount * WEEKS_PER_MONTH;
    case 'fortnightly':
      return amount * FORTNIGHTS_PER_MONTH;
    default:
      return amount; // monthly, or irregular — already a monthly-scale figure
  }
}

export function frequencyAdverb(frequency: PayFrequency): string {
  switch (frequency) {
    case 'weekly':
      return 'weekly';
    case 'fortnightly':
      return 'fortnightly';
    case 'monthly':
      return 'monthly';
    case 'irregular':
    default:
      return 'irregularly';
  }
}

/** The planning periods Money Flow can be viewed in — deliberately just
 * these three, matching Australian pay cycles (PRD ask: "not everyone
 * plans monthly"). */
export type FlowPeriod = 'weekly' | 'fortnightly' | 'monthly';

/** Inverse of toMonthlyAmount — scales a normalized monthly figure down to
 * a given planning period so Money Flow can be viewed weekly/fortnightly
 * without re-deriving every underlying calculation. */
export function fromMonthlyAmount(monthlyAmount: number, period: FlowPeriod): number {
  switch (period) {
    case 'weekly':
      return monthlyAmount / WEEKS_PER_MONTH;
    case 'fortnightly':
      return monthlyAmount / FORTNIGHTS_PER_MONTH;
    default:
      return monthlyAmount;
  }
}

export function flowPeriodNoun(period: FlowPeriod): string {
  switch (period) {
    case 'weekly':
      return 'week';
    case 'fortnightly':
      return 'fortnight';
    default:
      return 'month';
  }
}
