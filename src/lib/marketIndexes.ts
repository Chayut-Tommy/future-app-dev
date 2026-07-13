import { Ionicons } from '@expo/vector-icons';

export interface MarketIndex {
  symbol: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Names only — no fabricated prices or % moves. Live figures need the
// licensed market-data provider flagged in the PRD Appendix as unbuilt
// infrastructure; showing a fake number in a finance app is worse than
// showing none.
export const MARKET_INDEXES: MarketIndex[] = [
  { symbol: 'S&P 500', icon: 'bar-chart-outline' },
  { symbol: 'NASDAQ', icon: 'trending-up-outline' },
  { symbol: 'ASX 200', icon: 'globe-outline' },
  { symbol: 'Bitcoin', icon: 'diamond-outline' },
];
