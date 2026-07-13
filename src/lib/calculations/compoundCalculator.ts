export type ContributionFrequency = 'weekly' | 'fortnightly' | 'monthly';

const PERIODS_PER_YEAR: Record<ContributionFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

export interface CompoundGrowthInput {
  initial: number;
  contribution: number;
  frequency: ContributionFrequency;
  annualRatePct: number;
  years: number;
}

export interface CompoundGrowthResult {
  futureValue: number;
  totalContributed: number;
  totalGrowth: number;
}

/** Standard future-value-of-an-annuity math, shared by the Compound
 * Calculator screen and Saving Facts — one real formula, no invented
 * numbers, only the scenario inputs vary. */
export function computeCompoundGrowth(input: CompoundGrowthInput): CompoundGrowthResult {
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency];
  const periodRate = input.annualRatePct / 100 / periodsPerYear;
  const n = periodsPerYear * input.years;

  const fvInitial = input.initial * Math.pow(1 + periodRate, n);
  const fvContributions = periodRate === 0 ? input.contribution * n : input.contribution * ((Math.pow(1 + periodRate, n) - 1) / periodRate);

  const futureValue = fvInitial + fvContributions;
  const totalContributed = input.initial + input.contribution * n;
  const totalGrowth = futureValue - totalContributed;

  return { futureValue, totalContributed, totalGrowth };
}
