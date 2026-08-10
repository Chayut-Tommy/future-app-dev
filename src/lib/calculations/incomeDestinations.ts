import { AppData, Asset } from '../../types/models';

/**
 * Shared eligible-income-destination selector — the single source of truth
 * for "which real balances can a received/backfilled income transaction be
 * credited to," reused by both the recurring-income setup reconciliation
 * (AddIncomeModal.tsx's mid-cycle step) and the Today-tab salary-due
 * confirmation (SmartReminderCard.tsx). Correction round, 2026-08-10 —
 * previously each flow had its own narrower, ad-hoc destination list (setup
 * offered Cash+Savings only; the reminder offered no choice at all and
 * silently credited Cash). Both problems shared the same root cause: no
 * shared, exhaustive, ID-based destination resolver existed.
 *
 * Deliberately scoped to the three liquid balance types that can
 * participate in Available Until Payday / Money calculations — the exact
 * same set `resolveIncludeInMoneyCalculations` (liquidAssets.ts) and
 * `SelectBalancesSheet.tsx` already operate over. Credit cards,
 * liabilities, investments, property, goals and every other asset/liability
 * type are never eligible destinations for income.
 */
export interface IncomeDestinationOption {
  /** The real, stable Asset.id — never a sentinel/undefined value. Every
   * caller must route by this id, never by label or type alone. */
  id: string;
  type: 'cash' | 'savings' | 'everyday';
  /** Customer-facing label, disambiguated with an "Account N" suffix only
   * when two eligible destinations would otherwise render identical text
   * (same label, same balance) — mirrors QuickAddModal.tsx's
   * disambiguateEverydayAccountLabels contract exactly, generalised here
   * to the full cash/savings/everyday set. */
  label: string;
  currentValue: number;
}

const ELIGIBLE_DESTINATION_TYPES: Asset['type'][] = ['cash', 'savings', 'everyday'];

function baseDestinationText(a: Asset): string {
  return `${a.label}${a.provider ? ` · ${a.provider}` : ''} (${a.currentValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`;
}

/**
 * Every real, existing Cash/Savings/Everyday asset, individually named and
 * keyed by stable id — never a phantom/implicit Cash entry for a Cash
 * balance that doesn't exist yet (avoids silently defaulting to Cash: a
 * brand-new profile with zero balances returns an empty array, and the
 * caller must show a neutral "add a money balance" route instead of
 * conjuring one). Order: Cash first (if present), then Everyday Accounts,
 * then Savings — a stable, predictable presentation order, not insertion
 * order in `assets`.
 */
export function resolveEligibleIncomeDestinations(assets: Asset[]): IncomeDestinationOption[] {
  const eligible = assets.filter((a) => ELIGIBLE_DESTINATION_TYPES.includes(a.type));
  const cash = eligible.filter((a) => a.type === 'cash');
  const everyday = eligible.filter((a) => a.type === 'everyday');
  const savings = eligible.filter((a) => a.type === 'savings');
  const ordered = [...cash, ...everyday, ...savings];

  const counts = new Map<string, number>();
  ordered.forEach((a) => {
    const key = baseDestinationText(a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const seen = new Map<string, number>();

  return ordered.map((a) => {
    const key = baseDestinationText(a);
    let label = key;
    if ((counts.get(key) ?? 0) > 1) {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      label = `${key} — Account ${n}`;
    }
    return { id: a.id, type: a.type as 'cash' | 'savings' | 'everyday', label, currentValue: a.currentValue };
  });
}

/**
 * Resolves and validates a caller-supplied destination id against the
 * exact same eligible set `resolveEligibleIncomeDestinations` would offer
 * — the shared validation half of this module, used by AppStateContext's
 * income transitions so an invalid/stale/foreign id (an id that no longer
 * exists, or that names a credit card/liability/investment/etc.) is always
 * rejected the same way regardless of which transition is asking.
 */
export function resolveIncomeDestinationAsset(data: AppData, targetAssetId: string): Asset | undefined {
  const asset = data.assets.find((a) => a.id === targetAssetId);
  if (!asset || !ELIGIBLE_DESTINATION_TYPES.includes(asset.type)) return undefined;
  return asset;
}
