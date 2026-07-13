import { Asset } from '../../types/models';

/**
 * Cash (everyday spending) and Savings (interest-bearing) are shown
 * separately everywhere in the UI (PRD ask: "cash and savings behave
 * differently"), but for "how much money can this person actually reach
 * right now" math — Lulu Score, emergency fund coverage, safe-to-spend,
 * achievements — both are equally real, accessible liquid money. One
 * shared helper so every calculation treats the split consistently.
 */
export function computeLiquidCash(assets: Asset[]): number {
  return assets.filter((a) => a.type === 'cash' || a.type === 'savings').reduce((sum, a) => sum + a.currentValue, 0);
}
