import { Asset, Liability } from '../../types/models';

export interface MortgageEquity {
  propertyValue: number;
  loanBalance: number;
  equity: number;
  equityPct: number;
}

/** Always call this "estimated equity," never "available equity" (PRD ask,
 * §B5) — this is a paper calculation from entered figures, not a lending
 * or borrowing-eligibility assessment. */
export const PROPERTY_EQUITY_DISCLAIMER =
  'Estimated from the property value and loan balance entered. This does not represent an approved borrowing amount.';

/**
 * Real, deterministic equity math from the user's own entered property
 * value and loan balance — never an estimated market valuation (PRD's
 * no-fake-data rule). Distinguishes "$1M property, $500k mortgage" from
 * "$500k of unsecured debt," which the debt-only view couldn't show.
 */
export function computeMortgageEquity(liability: Liability, property: Asset): MortgageEquity {
  const propertyValue = property.currentValue;
  const loanBalance = liability.currentBalance;
  const equity = propertyValue - loanBalance;
  const equityPct = propertyValue > 0 ? equity / propertyValue : 0;
  return { propertyValue, loanBalance, equity, equityPct };
}
