import { AppData, Asset, CreditCard } from '../../types/models';

/**
 * Shared eligible-bill-payment-source selector — the expense-side sibling
 * of incomeDestinations.ts's resolveEligibleIncomeDestinations. "Which
 * account did you pay from?" for an ordinary bill confirmation, reused by
 * SmartReminderCard.tsx instead of that component's own previous
 * hard-coded "From cash" / "From credit card" pair.
 *
 * Deliberately scoped to what computeBalanceEffect's EXPENSE side actually
 * supports today: `paymentSource: 'cash'` (the single Cash asset),
 * `paymentSource: 'everyday'` (a specific Everyday Account, by id), and
 * `paymentSource: 'credit_card'` (a specific card, by id). There is no
 * `paymentSource` value for a Savings account on the expense side of the
 * balance-effect engine — unlike income, which can credit any eligible
 * asset by id — so Savings is never offered here. Widening
 * computeBalanceEffect to add a genuine savings-funded-expense concept
 * would be a real financial-model decision outside this module's scope;
 * this resolver reports what the existing model already supports, it does
 * not invent a new source type to fill the gap.
 */
export interface BillPaymentSourceOption {
  kind: 'asset' | 'credit_card';
  /** The real, stable Asset.id or CreditCard.id — never a sentinel value. */
  id: string;
  /** Only present for kind 'asset' — 'cash' or 'everyday'; distinguishes
   * which computeBalanceEffect branch a caller must route through. */
  assetType?: 'cash' | 'everyday';
  label: string;
  /** Cash/Everyday: the current balance being paid FROM. Credit card: the
   * current recorded balance, shown so the customer can see what they
   * already owe before choosing to add to it. */
  currentValue: number;
}

const ELIGIBLE_ASSET_TYPES: Asset['type'][] = ['cash', 'everyday'];

function baseSourceText(a: Asset): string {
  return `${a.label}${a.provider ? ` · ${a.provider}` : ''} (${a.currentValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`;
}

/**
 * Every real, existing Cash/Everyday asset (never Savings — see this
 * module's own doc comment), plus every real, existing credit card,
 * individually named and keyed by stable id. Order: Cash first (if
 * present), then Everyday Accounts, then credit cards — mirrors
 * resolveEligibleIncomeDestinations' own Cash-first convention. A brand
 * new profile with no eligible cash-like balance and no credit card
 * returns an empty array — never a phantom Cash entry.
 */
export function resolveEligibleBillPaymentSources(assets: Asset[], creditCards: CreditCard[]): BillPaymentSourceOption[] {
  const eligibleAssets = assets.filter((a) => ELIGIBLE_ASSET_TYPES.includes(a.type));
  const cash = eligibleAssets.filter((a) => a.type === 'cash');
  const everyday = eligibleAssets.filter((a) => a.type === 'everyday');
  const orderedAssets = [...cash, ...everyday];

  const counts = new Map<string, number>();
  orderedAssets.forEach((a) => {
    const key = baseSourceText(a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const seen = new Map<string, number>();

  const assetOptions: BillPaymentSourceOption[] = orderedAssets.map((a) => {
    const key = baseSourceText(a);
    let label = key;
    if ((counts.get(key) ?? 0) > 1) {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      label = `${key} — Account ${n}`;
    }
    return { kind: 'asset', id: a.id, assetType: a.type as 'cash' | 'everyday', label, currentValue: a.currentValue };
  });

  const cardOptions: BillPaymentSourceOption[] = creditCards.map((c) => ({
    kind: 'credit_card',
    id: c.id,
    label: `${c.label} (${c.currentBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} owed)`,
    currentValue: c.currentBalance,
  }));

  return [...assetOptions, ...cardOptions];
}

/**
 * Resolves and validates a caller-supplied (kind, id) pair against the
 * exact same eligible set resolveEligibleBillPaymentSources would offer —
 * the shared validation half of this module. Returns undefined for a
 * stale/foreign/deleted id, exactly the "fail safely if the selected
 * source disappears before confirmation" contract every caller needs.
 */
export function resolveBillPaymentSource(
  data: AppData,
  kind: 'asset' | 'credit_card',
  id: string
): { kind: 'asset'; asset: Asset } | { kind: 'credit_card'; card: CreditCard } | undefined {
  if (kind === 'asset') {
    const asset = data.assets.find((a) => a.id === id && ELIGIBLE_ASSET_TYPES.includes(a.type));
    return asset ? { kind: 'asset', asset } : undefined;
  }
  const card = data.creditCards.find((c) => c.id === id);
  return card ? { kind: 'credit_card', card } : undefined;
}
