import { AppData, Asset } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';

export interface WealthProjection {
  currentNetWorth: number;
  projectedValue: number;
  yearsAhead: number;
  assumedAnnualReturn: number;
  /** The monthly contribution actually assumed going forward — always 0
   * when cashflow is zero or negative, never inferred from existing asset
   * balances (PRD ask, §Projections: "existing assets must not be treated
   * as new monthly contributions"). Exposed so callers can explain what's
   * driving the number instead of implying an active "pace" that isn't
   * really there. */
  monthlyContribution: number;
  /** True when the user's real recorded cashflow is negative — the
   * projection still floors the assumed contribution at 0 either way, but
   * callers should say so rather than showing an unexplained optimistic
   * growth line (PRD ask: "negative monthly cashflow must not produce
   * unexplained 'current pace' optimism"). */
  cashflowIsNegative: boolean;
}

/**
 * A single, always-visible projection milestone (PRD §15.1, simplified for
 * Phase 1A — a fixed "N years ahead" horizon rather than "at age X", since
 * the app doesn't collect birthdate). The assumed annual return is a
 * clearly-labeled, editable-in-spirit illustrative assumption, never a
 * guarantee — this is general-market framing, not personalized advice.
 */
export function computeWealthProjection(data: AppData, yearsAhead = 10, assumedAnnualReturn = 0.06): WealthProjection {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  const currentNetWorth = totalAssets - totalLiabilities;

  const summary = computeMonthlySummary(data);
  const monthlyContribution = Math.max(0, summary.netCashflow);
  const monthlyRate = assumedAnnualReturn / 12;
  const months = yearsAhead * 12;
  const growthFactor = Math.pow(1 + monthlyRate, months);
  const projectedValue = currentNetWorth * growthFactor + monthlyContribution * ((growthFactor - 1) / monthlyRate);

  return { currentNetWorth, projectedValue, yearsAhead, assumedAnnualReturn, monthlyContribution, cashflowIsNegative: summary.netCashflow < 0 };
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
}

const ALLOCATION_LABELS: Record<string, string> = {
  cash: 'Cash',
  investments: 'Investments',
  super: 'Super',
  property: 'Property',
  business: 'Business',
  car: 'Vehicles',
  furniture: 'Furniture & valuables',
  collectibles: 'Collectibles & luxury',
  other: 'Other',
};

export function computeAssetAllocation(assets: Asset[]): AllocationSlice[] {
  const groups: Record<string, number> = {};
  for (const a of assets) {
    const key = a.type === 'etf' || a.type === 'shares' || a.type === 'crypto' ? 'investments' : a.type;
    groups[key] = (groups[key] ?? 0) + a.currentValue;
  }
  return Object.entries(groups)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ key, label: ALLOCATION_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Simple concentration-based diversification score (0-100, higher =
 * more spread out), derived from a Herfindahl-Hirschman Index over the
 * allocation slices. Illustrative, not a formal risk metric.
 */
export function computeDiversificationScore(slices: AllocationSlice[]): number {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0 || slices.length === 0) return 0;
  const hhi = slices.reduce((sum, s) => sum + Math.pow(s.value / total, 2), 0);
  return Math.round((1 - hhi) * 100);
}

export function findLargestAsset(assets: Asset[]): Asset | null {
  if (assets.length === 0) return null;
  return assets.reduce((max, a) => (a.currentValue > max.currentValue ? a : max), assets[0]);
}
