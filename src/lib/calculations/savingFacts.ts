import { Ionicons } from '@expo/vector-icons';
import { computeCompoundGrowth, ContributionFrequency } from './compoundCalculator';

export interface SavingFact {
  icon: keyof typeof Ionicons.glyphMap;
  scenario: string;
  resultBig?: string;
  resultCaption?: string;
  tipText?: string;
  calculatorParams?: { contribution: number; frequency: ContributionFrequency; annualRatePct: number; years: number };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function calcFact(icon: keyof typeof Ionicons.glyphMap, scenario: string, contribution: number, frequency: ContributionFrequency, annualRatePct: number, years: number): SavingFact {
  const { futureValue } = computeCompoundGrowth({ initial: 0, contribution, frequency, annualRatePct, years });
  return {
    icon,
    scenario,
    resultBig: money(futureValue),
    resultCaption: `in ${years} years`,
    calculatorParams: { contribution, frequency, annualRatePct, years },
  };
}

/**
 * "Saving Facts" — one big number, minimal reading (PRD ask). Every
 * scenario uses an assumed, clearly-labelled illustrative rate — never a
 * real bank's advertised rate or a fabricated market return — computed with
 * the same formula as the Compound Calculator, so "Try calculator" always
 * matches what's shown here exactly.
 */
const FACT_POOL: SavingFact[] = [
  calcFact('trending-up', 'Saving $10/week at 5% return', 10, 'weekly', 5, 10),
  calcFact('trending-up', 'Saving $50/week at 6% return', 50, 'weekly', 6, 20),
  calcFact('trending-up', '$200/month at 7% return', 200, 'monthly', 7, 30),
  calcFact('cafe', 'Skipping a $5 daily coffee (~$35/week) at 7%', 35, 'weekly', 7, 30),
  {
    icon: 'calculator',
    scenario: 'The "Rule of 72" at a 6% return',
    resultBig: '~12 years',
    resultCaption: 'to double your money',
  },
  {
    icon: 'shield-checkmark',
    scenario: 'Emergency fund basics',
    tipText: 'Keep 3–6 months of expenses in an easy-access account before investing further.',
  },
  {
    icon: 'layers',
    scenario: 'What compounding really means',
    tipText: 'You earn returns on your returns — the longer money stays invested, the bigger the effect.',
  },
];

export function pickDailySavingFacts(date: Date = new Date(), count: number = 1): SavingFact[] {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const result: SavingFact[] = [];
  for (let i = 0; i < count && i < FACT_POOL.length; i++) {
    result.push(FACT_POOL[(dayOfYear + i) % FACT_POOL.length]);
  }
  return result;
}
