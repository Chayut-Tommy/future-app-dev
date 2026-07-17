import { UserProfile } from '../../types/models';

/**
 * The single source of truth for "how much has the user chosen to set
 * aside per month" (PRD ask: "one shared user-selected Savings allocation
 * model rather than separate defaults across different screens"). Off, or
 * the setting being absent, always resolves to $0 — Navilo never assumes a
 * percentage on the user's behalf. Percentage mode only applies against
 * real recurring income: with no recurring income there is nothing for a
 * percentage to be a share of, so it resolves to $0 even if a stale
 * percentage is still stored (PRD ask: "an ad-hoc transaction must not
 * silently create or alter a percentage-based allocation" — this also
 * covers a recurring income source being removed after a percentage was
 * chosen). Fixed-amount mode is always a monthly figure — callers prorate
 * it per cycle themselves (see safeToSpend.ts's cycleFraction), the same
 * way a percentage-derived monthly figure is prorated.
 *
 * This is a forecasting input only. Nothing here is evidence of actual
 * saved money — luluScore.ts's Recorded Cashflow, Emergency Buffer, and
 * Wealth Assets Recorded factors deliberately never call this function.
 */
export function resolveSavingsAllocationMonthly(user: Pick<UserProfile, 'savingsAllocation' | 'monthlyIncome'>): number {
  const setting = user.savingsAllocation;
  if (!setting || setting.mode === 'off') return 0;
  if (setting.mode === 'percent') {
    if (user.monthlyIncome <= 0) return 0;
    return Math.max(0, user.monthlyIncome * (setting.percent ?? 0));
  }
  return Math.max(0, setting.amount ?? 0);
}
