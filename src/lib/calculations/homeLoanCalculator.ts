export type RepaymentFrequency = 'monthly' | 'fortnightly' | 'weekly';

const PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 };

export interface HomeLoanInput {
  loanAmount: number;
  annualRatePct: number;
  years: number;
  frequency: RepaymentFrequency;
}

export interface HomeLoanResult {
  repaymentPerPeriod: number;
  totalInterest: number;
  totalCost: number;
  periodsPerYear: number;
}

/** Standard amortising-loan repayment formula — the same math a bank uses
 * for a fixed-rate loan, applied only to the numbers the user enters
 * (illustrative, not a lending offer). */
export function computeHomeLoanRepayment(input: HomeLoanInput): HomeLoanResult {
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency];
  const periodRate = input.annualRatePct / 100 / periodsPerYear;
  const n = periodsPerYear * input.years;
  const repaymentPerPeriod =
    periodRate === 0 || n <= 0
      ? input.loanAmount / Math.max(1, n)
      : (input.loanAmount * periodRate * Math.pow(1 + periodRate, n)) / (Math.pow(1 + periodRate, n) - 1);
  const totalCost = repaymentPerPeriod * n;
  const totalInterest = totalCost - input.loanAmount;
  return { repaymentPerPeriod, totalInterest, totalCost, periodsPerYear };
}
