import { AppData } from '../../types/models';
import { computeAssetAllocation, computeDiversificationScore } from './wealthProjection';
import { ACCESSIBLE_INVESTMENT_TYPES } from './assetGroups';
import { brand } from '../brand';

export interface PortfolioInsight {
  kind: 'no_investments' | 'cash_only' | 'has_investments';
  title: string;
  body: string;
  lines: string[];
}

/**
 * Not currently rendered on Wealth (PRD ask: MVP keeps Wealth to Net
 * Worth/Money Engine/Your Future/Journey — this reads as investment advice
 * too early). Kept for a future "Lulu Portfolio Review" premium feature.
 * Every branch is derived from real data — asset mix, concentration, and
 * total invested value — never a fabricated return or percentage.
 */
export function computePortfolioInsight(data: AppData): PortfolioInsight {
  const investmentAssets = data.assets.filter((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type));
  const cashAssets = data.assets.filter((a) => (a.type === 'cash' || a.type === 'savings') && a.currentValue > 0);
  const totalInvested = investmentAssets.reduce((sum, a) => sum + a.currentValue, 0);

  if (investmentAssets.length === 0) {
    if (cashAssets.length > 0) {
      const totalCash = cashAssets.reduce((sum, a) => sum + a.currentValue, 0);
      const rated = cashAssets.filter((a) => typeof a.interestRate === 'number' && (a.interestRate ?? 0) > 0);
      if (rated.length > 0 && totalCash > 0) {
        const weightedRate = rated.reduce((sum, a) => sum + (a.interestRate ?? 0) * a.currentValue, 0) / totalCash;
        return {
          kind: 'cash_only',
          title: `Your cash is working at ${(weightedRate * 100).toFixed(2)}% interest.`,
          body: 'Investing even a portion of it could put your money to work harder over the long term.',
          lines: [],
        };
      }
      return {
        kind: 'cash_only',
        title: 'How much is your cash really earning?',
        body: `Add an interest rate to your savings account and ${brand.name} can show you what it's actually earning.`,
        lines: [],
      };
    }
    return {
      kind: 'no_investments',
      title: 'Ready to start investing?',
      body: 'Learn how investing works before you begin.',
      lines: [],
    };
  }

  const allocation = computeAssetAllocation(investmentAssets);
  const diversification = computeDiversificationScore(allocation);
  const largest = allocation[0];
  const largestPct = totalInvested > 0 ? Math.round((largest.value / totalInvested) * 100) : 0;

  return {
    kind: 'has_investments',
    title: `${brand.name} analysed your portfolio`,
    body: '',
    lines: [
      `Asset mix: ${allocation.length} categor${allocation.length === 1 ? 'y' : 'ies'}, led by ${largest.label} (${largestPct}%).`,
      largestPct >= 60
        ? `Concentration: ${largestPct}% is in ${largest.label} — consider spreading this out.`
        : `Concentration: well spread out (diversification score ${diversification}/100).`,
      `Growth: $${Math.round(totalInvested).toLocaleString()} invested — time in the market compounds this for you.`,
    ],
  };
}
