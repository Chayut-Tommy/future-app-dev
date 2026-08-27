import { AssetType } from '../types/models';

/**
 * Pre-checkpoint copy correction — the ONE exhaustive label-placeholder
 * authority for the asset/account form, keyed by the STRUCTURED selected
 * type only (never the entry tile, route title or original preset).
 * `Record<AssetType, string>` makes the mapping exhaustive by type-check:
 * adding a new structured type without an example fails compilation, so an
 * unrelated type can never silently fall back to the Investment example.
 * Presentation copy only — no validator, persistence or calculation reads
 * this, and the customer's entered text is never touched by a type change
 * (the placeholder is a hint, not a value).
 */
export const ASSET_LABEL_PLACEHOLDER: Record<AssetType, string> = {
  cash: 'e.g. Wallet cash',
  savings: 'e.g. Emergency fund',
  everyday: 'e.g. Main everyday account',
  etf: 'e.g. Vanguard ETF',
  shares: 'e.g. CBA shares',
  super: 'e.g. AustralianSuper',
  crypto: 'e.g. Bitcoin',
  property: 'e.g. Richmond home',
  business: 'e.g. Family business',
  car: 'e.g. Toyota Corolla',
  furniture: 'e.g. Antique dresser',
  collectibles: 'e.g. Watch collection',
  other: 'e.g. Asset name',
};
