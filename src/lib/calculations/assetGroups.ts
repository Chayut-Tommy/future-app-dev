import { AssetType } from '../../types/models';

/**
 * Investment types the user can actually access and trade themselves —
 * deliberately excludes 'super'. Superannuation is technically invested,
 * but from the user's perspective it's employer retirement savings,
 * generally inaccessible until retirement, and shouldn't unlock the same
 * "first investment added" milestone or drive investing recommendations
 * that an ETF/shares purchase would (PRD bug report). Super still counts
 * toward net worth and the long-term wealth picture — just not this list.
 */
export const ACCESSIBLE_INVESTMENT_TYPES: AssetType[] = ['etf', 'shares', 'crypto'];

export function isAccessibleInvestment(type: AssetType): boolean {
  return (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(type);
}
