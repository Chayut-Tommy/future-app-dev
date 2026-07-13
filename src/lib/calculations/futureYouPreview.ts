import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';
import { computeCompoundGrowth } from './compoundCalculator';

export interface FutureYouPoint {
  yearsAhead: number;
  age: number | null;
  futureValue: number;
}

export interface FutureYouPreview {
  monthlyContribution: number;
  /** True when there isn't enough real cashflow data yet, so a clearly
   * labelled illustrative $500/month scenario is shown instead (PRD
   * no-fake-data rule: never silently present an assumption as real). */
  isIllustrative: boolean;
  points: FutureYouPoint[];
}

const HORIZONS = [10, 20, 30];
const ILLUSTRATIVE_MONTHLY = 500;
const ASSUMED_ANNUAL_RETURN_PCT = 6;

/** "Future You 🔮" — a compact preview of the full Compound Calculator,
 * using the user's own real monthly surplus when available. */
export function computeFutureYouPreview(data: AppData): FutureYouPreview {
  const summary = computeMonthlySummary(data);
  const realContribution = Math.max(0, summary.netCashflow);
  const isIllustrative = realContribution <= 0;
  const monthlyContribution = isIllustrative ? ILLUSTRATIVE_MONTHLY : realContribution;
  const startAge = data.user.age ?? null;

  const points = HORIZONS.map((yearsAhead) => {
    const result = computeCompoundGrowth({
      initial: 0,
      contribution: monthlyContribution,
      frequency: 'monthly',
      annualRatePct: ASSUMED_ANNUAL_RETURN_PCT,
      years: yearsAhead,
    });
    return { yearsAhead, age: startAge ? startAge + yearsAhead : null, futureValue: result.futureValue };
  });

  return { monthlyContribution, isIllustrative, points };
}
