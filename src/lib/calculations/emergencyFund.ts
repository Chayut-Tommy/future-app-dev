import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';
import { computeLiquidCash } from './liquidAssets';

export interface EmergencyFundResult {
  monthlyExpenses: number;
  recommendedMin: number;
  recommendedMax: number;
  currentCash: number;
  /** null when monthly expenses are unknown (no income/bills logged yet).
   * Floored at 0 — Lulu never shows negative months covered (PRD ask). */
  monthsCovered: number | null;
}

/** Real numbers only: current Cash assets vs. actual monthly expenses
 * (fixed bills + logged spending). No fabricated "recommended balance" —
 * just the standard 3-6 months guideline applied to the user's own data.
 * Cash and months-covered are floored at 0 for display, regardless of how
 * a negative balance got there — a safety net can't be less than empty. */
export function computeEmergencyFund(data: AppData): EmergencyFundResult {
  const summary = computeMonthlySummary(data);
  const currentCash = Math.max(0, computeLiquidCash(data.assets));
  return {
    monthlyExpenses: summary.expenses,
    recommendedMin: summary.expenses * 3,
    recommendedMax: summary.expenses * 6,
    currentCash,
    monthsCovered: summary.expenses > 0 ? Math.max(0, currentCash / summary.expenses) : null,
  };
}
