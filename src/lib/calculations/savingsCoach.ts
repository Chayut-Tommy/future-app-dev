import { Asset, SavingsComparisonEntry } from '../../types/models';

export interface SavingsSummary {
  balance: number;
  rate: number;
  annualInterest: number;
  monthlyInterest: number;
  afterTaxAnnual: number;
}

const DEFAULT_TAX_RATE = 0.325; // a common illustrative marginal rate — editable, never asserted as the user's actual rate

/** The user's savings account — any 'savings'-typed asset counts, even
 * without a rate set yet (PRD bug report: previously only matched a 'cash'
 * asset that already had a rate, so a plain cash/savings entry from the
 * onboarding checklist went unrecognised and Savings Coach kept prompting
 * "Add savings," creating a duplicate). Falls back to a rated 'cash' asset
 * for data saved before the cash/savings split existed. */
export function findSavingsAsset(assets: Asset[]): Asset | undefined {
  return assets.find((a) => a.type === 'savings') ?? assets.find((a) => a.type === 'cash' && typeof a.interestRate === 'number');
}

export function computeSavingsSummary(asset: Asset, taxRate: number = DEFAULT_TAX_RATE): SavingsSummary {
  const balance = asset.currentValue;
  const rate = asset.interestRate ?? 0;
  const annualInterest = balance * rate;
  return {
    balance,
    rate,
    annualInterest,
    monthlyInterest: annualInterest / 12,
    afterTaxAnnual: annualInterest * (1 - taxRate),
  };
}

/**
 * Compares the user's own savings rate against rates THEY entered from
 * their own research (never a Lulu-asserted "best current rate" — that's a
 * real, checkable financial-product fact this app has no live source for).
 */
export function findBestComparison(
  comparisons: SavingsComparisonEntry[],
  currentRate: number
): SavingsComparisonEntry | null {
  const better = comparisons.filter((c) => c.rate > currentRate);
  if (better.length === 0) return null;
  return better.reduce((best, c) => (c.rate > best.rate ? c : best), better[0]);
}

export function annualInterestDifference(balance: number, currentRate: number, comparisonRate: number): number {
  return balance * (comparisonRate - currentRate);
}

export interface RankedSavingsOption {
  id: string;
  label: string;
  rate: number;
  annualInterest: number;
  isCurrent: boolean;
}

/**
 * A real ranked comparison (PRD ask: "this is not actually comparing" —
 * previously just a sorted list of rates with no connection to the user's
 * own money). Every option's annual interest is computed against the
 * user's actual current savings balance, so "switching" numbers are a real
 * apples-to-apples comparison, not a guess.
 */
export function rankSavingsOptions(assets: Asset[], comparisons: SavingsComparisonEntry[]): RankedSavingsOption[] {
  const savingsAsset = findSavingsAsset(assets);
  const balance = savingsAsset?.currentValue ?? 0;
  const options: RankedSavingsOption[] = [];

  if (savingsAsset) {
    const summary = computeSavingsSummary(savingsAsset);
    options.push({ id: 'current', label: savingsAsset.label, rate: summary.rate, annualInterest: summary.annualInterest, isCurrent: true });
  }
  comparisons.forEach((c) => {
    options.push({ id: c.id, label: c.bankName, rate: c.rate, annualInterest: balance * c.rate, isCurrent: false });
  });

  return options.sort((a, b) => b.annualInterest - a.annualInterest);
}

/** The gap between the user's current account and the best-ranked option —
 * null when there's no current account to compare against, or the current
 * account is already the best. */
export function computePotentialImprovement(ranked: RankedSavingsOption[]): number | null {
  const current = ranked.find((o) => o.isCurrent);
  const best = ranked[0];
  if (!current || !best || best.isCurrent) return null;
  const diff = best.annualInterest - current.annualInterest;
  return diff > 0 ? diff : null;
}

export { DEFAULT_TAX_RATE };
