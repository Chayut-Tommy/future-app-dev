import { Asset } from '../../types/models';

/**
 * Cash (everyday spending) and Savings (interest-bearing) are shown
 * separately everywhere in the UI (PRD ask: "cash and savings behave
 * differently"), but for wealth-reporting math that genuinely needs the
 * total real, accessible balance regardless of whether the user has
 * earmarked it for everyday spending — Net Wealth, Wealth Map, Emergency
 * Fund coverage, Lulu Score's resilience factor, savings-amount
 * achievements — both are equally real liquid money. One shared helper so
 * every *wealth* calculation treats the split consistently.
 *
 * This is deliberately NOT the same concept as "money available for bills
 * right now" — see `computeMoneyAvailableBalances` below for that. A
 * savings account can correctly count here (it's real, accessible wealth)
 * without counting there (PRD bug report: Available Until Payday was
 * silently treating every cash/savings asset as spendable, including
 * balances the user may be holding for a house deposit, taxes, or an
 * emergency fund they don't want eaten into by everyday spending
 * estimates). Never use this function as the source for a short-term
 * Money calculation.
 */
export function computeLiquidCash(assets: Asset[]): number {
  return assets.filter((a) => a.type === 'cash' || a.type === 'savings').reduce((sum, a) => sum + a.currentValue, 0);
}

/**
 * Whether one cash/savings/everyday asset counts toward short-term Money
 * calculations, resolving `includeInMoneyCalculations` against its
 * type-based default when unset — never re-derive this default inline.
 * Defaults: cash = included (it's what transactions already auto-sync
 * into, so it already behaves like an everyday account); everyday =
 * included (Everyday Account correction, 2026-08-08 — the feature's own
 * MVP spec: "Count this balance in available money" defaults on); savings
 * = excluded until the user explicitly opts in, so an existing savings
 * balance is never silently pooled into "available for bills" the moment
 * this field ships (PRD ask, migration rule). Every other asset type is
 * never eligible regardless of this field — this deliberately does NOT
 * include `computeLiquidCash`'s savings-reporting concept (wealth
 * achievements, buffer milestones, Savings Coach, emergency-fund/ready-to-
 * invest opportunities remain untouched by this function on purpose; an
 * everyday spending balance is not necessarily savings).
 */
export function resolveIncludeInMoneyCalculations(asset: Pick<Asset, 'type' | 'includeInMoneyCalculations'>): boolean {
  if (asset.type !== 'cash' && asset.type !== 'savings' && asset.type !== 'everyday') return false;
  return asset.includeInMoneyCalculations ?? (asset.type === 'cash' || asset.type === 'everyday');
}

/**
 * The authoritative source for "money available for short-term Money
 * calculations" (Available Until Payday, Money Flow, Money Allocation,
 * cash-runway estimates) — only cash/savings balances the user has
 * confirmed (or defaulted, per `resolveIncludeInMoneyCalculations`) as
 * available for everyday spending, distinct from `computeLiquidCash`'s
 * total-wealth reading. Never use `computeLiquidCash` for a Money-tab
 * calculation, and never use this function for a wealth-reporting one.
 *
 * A `NaN`/`Infinity`/`-Infinity` `currentValue` is excluded from this sum
 * (never propagated into it) — see `computeMoneyBalanceStatus` below, the
 * companion function that flags when this has happened so a caller never
 * presents the resulting (necessarily incomplete) total as a normal,
 * authoritative figure.
 */
export function computeMoneyAvailableBalances(assets: Asset[]): number {
  return assets
    .filter(resolveIncludeInMoneyCalculations)
    .filter((a) => Number.isFinite(a.currentValue))
    .reduce((sum, a) => sum + a.currentValue, 0);
}

/** Per-account breakdown backing `computeMoneyAvailableBalances`, for
 * surfaces that need to show the user which accounts make up the total
 * (PRD ask: "allow the user to see which accounts make up the amount").
 * Excludes the same non-finite entries `computeMoneyAvailableBalances`
 * excludes, so a breakdown row never shows `$NaN`. */
export function listMoneyAvailableAccounts(assets: Asset[]): { id: string; label: string; value: number }[] {
  return assets
    .filter(resolveIncludeInMoneyCalculations)
    .filter((a) => Number.isFinite(a.currentValue))
    .map((a) => ({ id: a.id, label: a.label, value: a.currentValue }));
}

/** Distinguishes the three ways "how much money is available" can fail to
 * be a normal, trustworthy figure — collapsed into one `0` by
 * `computeMoneyAvailableBalances` alone until now, which made a legitimate
 * $0 balance, "no balance opted in at all," and "a recorded balance is
 * corrupted" indistinguishable to any caller. Order matters: no eligible
 * assets is checked before invalid-data, so an empty list is always
 * `'no_eligible_balance'`, never `'invalid_data'`. */
export type MoneyBalanceStatus = 'valid' | 'invalid_data' | 'no_eligible_balance';

export function computeMoneyBalanceStatus(assets: Asset[]): MoneyBalanceStatus {
  const eligible = assets.filter(resolveIncludeInMoneyCalculations);
  if (eligible.length === 0) return 'no_eligible_balance';
  if (eligible.some((a) => !Number.isFinite(a.currentValue))) return 'invalid_data';
  return 'valid';
}
