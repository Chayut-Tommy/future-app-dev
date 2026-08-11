import { Asset, AssetType, Liability } from '../../types/models';

/**
 * The single shared source of truth for generic Move Money eligibility
 * (correction round, 2026-08-10) — every tracked liquid balance type that
 * can participate as either a source or a destination of an ordinary
 * asset-to-asset transfer. Deliberately excludes every non-liquid asset
 * type (investments, property, retirement/super, goals-as-assets, credit
 * cards represented as assets, or any other/unknown type) — those are
 * never eligible generic Move Money destinations or sources, by omission
 * from this list rather than a separate exclusion check, so a future asset
 * type never silently becomes eligible by accident.
 *
 * Imported by BOTH `TransferForm.tsx` (to decide what the UI offers) and
 * `transferFundsTransition` (to independently re-validate the same rule) —
 * the two must never define separate allowlists that could drift apart.
 */
export const LIQUID_BALANCE_TYPES: AssetType[] = ['cash', 'everyday', 'savings'];

export function isEligibleLiquidBalance(asset: Pick<Asset, 'type'>): boolean {
  return LIQUID_BALANCE_TYPES.includes(asset.type);
}

/** Every owned liquid balance eligible as a generic Move Money source or
 * destination — same filter, reused for both sides (the UI additionally
 * excludes the exact selected source from the destination list; see
 * `excludingAssetId`). */
export function listEligibleLiquidBalances(assets: Asset[]): Asset[] {
  return assets.filter(isEligibleLiquidBalance);
}

/** Destination-side convenience: every eligible liquid balance except the
 * one currently selected as the source — the exact "excluding the exact
 * selected source" rule, expressed once so the UI and any future caller
 * never have to remember to exclude it manually. */
export function listEligibleLiquidDestinations(assets: Asset[], excludingAssetId: string | null): Asset[] {
  return listEligibleLiquidBalances(assets).filter((a) => a.id !== excludingAssetId);
}

/**
 * Every liability eligible as a generic Move Money debt-payment
 * destination — every currently-supported liability type except BNPL,
 * which is deliberately excluded from generic `transferFunds` and instead
 * reached only through the dedicated BNPL handoff (see
 * `bnplHandoff.ts`/`resolveBnplHandoffState`). A linked credit-card
 * liability remains fully eligible here — its own linked-card healing is
 * handled inside `transferFundsTransition`, not by this eligibility
 * predicate.
 */
export function listEligibleDebtDestinations(liabilities: Liability[]): Liability[] {
  return liabilities.filter((l) => l.type !== 'bnpl');
}

/**
 * Customer-facing label disambiguation for Move Money's asset chips —
 * reuses the exact convention already established for Everyday Accounts
 * elsewhere in this codebase (`QuickAddModal.tsx`'s
 * disambiguateEverydayAccountLabels, `incomeDestinations.ts`'s
 * resolveEligibleIncomeDestinations): the customer's own label, plus the
 * account's `provider` (bank/institution name) when present, and only a
 * further "— Account N" ordinal suffix (ordered by stable array position,
 * never by selection/transaction order) when even that combined text still
 * collides with another eligible balance. Never exposes a full account
 * number or any other sensitive field — `provider` is the same free-text,
 * non-sensitive descriptor already collected on the Everyday Account form.
 */
export function disambiguateBalanceLabels(assets: Asset[]): Map<string, string> {
  function baseText(a: Asset): string {
    return a.provider ? `${a.label} · ${a.provider}` : a.label;
  }
  const counts = new Map<string, number>();
  assets.forEach((a) => {
    const key = baseText(a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  assets.forEach((a) => {
    const key = baseText(a);
    if ((counts.get(key) ?? 0) <= 1) {
      labels.set(a.id, key);
      return;
    }
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    labels.set(a.id, `${key} — Account ${n}`);
  });
  return labels;
}
