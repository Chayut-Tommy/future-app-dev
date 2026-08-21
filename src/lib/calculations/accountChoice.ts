/**
 * Nolie Design 5.1 Wave 6 final — one shared presentation model for
 * "which account?", used by every journey that asks the question.
 *
 * WHY THIS EXISTS. Four journeys asked the same question four different
 * ways: bill payment and income each had their own wrapping-chip picker,
 * and the card and loan repayment forms each rolled a third. A customer
 * choosing an account saw a different control depending on which reminder
 * they happened to be looking at, and none of the four showed the account's
 * type or told a screen reader which one was selected.
 *
 * WHAT THIS IS NOT. It is not an eligibility rule. Eligibility differs
 * legitimately between consumers and is decided by the existing resolvers —
 * income can credit Savings but never a card; a bill can be charged to a
 * card but never paid from Savings, because `computeBalanceEffect` has no
 * savings-funded-expense branch. Those contracts are read here, never
 * rewritten. This module turns whatever a consumer's own resolver returned
 * into rows that look and read the same.
 *
 * Pure and RN-free: it computes no balances, creates no transactions and
 * selects nothing.
 */

import { IncomeDestinationOption } from './incomeDestinations';
import { BillPaymentSourceOption } from './billPaymentSources';

/** Which visual family a row belongs to. Drives the icon and tint, and is
 * never the ONLY signal — every row also carries its type in words. */
export type AccountChoiceKind = 'cash' | 'everyday' | 'savings' | 'credit_card';

export interface AccountChoiceRow {
  id: string;
  kind: AccountChoiceKind;
  /** The account's own name, as the customer entered it — never
   * re-cased, and never wrapped in a template. */
  name: string;
  /** "Everyday account", "Credit card" — the plain-words type, so the
   * distinction never rests on an icon tint alone. */
  typeLabel: string;
  /** "Balance · $22,500" or "$1,150 owed". */
  balanceLabel: string;
  /** True when the figure is money OWED rather than money held. The row
   * reads differently, and a customer must never mistake one for the
   * other. */
  owed: boolean;
}

export interface AccountChoiceGroup {
  /** Null for the ungrouped default; a heading otherwise. */
  title: string | null;
  /** Shown under the heading when the group needs explaining. */
  note: string | null;
  rows: AccountChoiceRow[];
}

const TYPE_LABEL: Record<AccountChoiceKind, string> = {
  cash: 'Cash balance',
  everyday: 'Everyday account',
  savings: 'Savings account',
  credit_card: 'Credit card',
};

export function accountTypeLabel(kind: AccountChoiceKind): string {
  return TYPE_LABEL[kind];
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * The resolvers format their own `label` as "Name · Provider ($1,234)",
 * because their old chip UI had one line to work with. The row layout has
 * three slots, so the figure is split back out rather than being repeated
 * inside the name.
 *
 * The de-duplication suffix the resolvers append when two accounts share a
 * name ("— Account 2") is deliberately KEPT on the name: it is the only
 * thing distinguishing two otherwise identical rows.
 */
export function splitResolverLabel(label: string): string {
  const withoutAmount = label.replace(/\s*\((?:-?\$)[^)]*\)/, '');
  return withoutAmount.trim();
}

export function incomeDestinationRows(options: readonly IncomeDestinationOption[]): AccountChoiceRow[] {
  return options.map((o) => ({
    id: o.id,
    kind: o.type,
    name: splitResolverLabel(o.label),
    typeLabel: TYPE_LABEL[o.type],
    balanceLabel: `Balance · ${money(o.currentValue)}`,
    owed: false,
  }));
}

export function billPaymentSourceRows(options: readonly BillPaymentSourceOption[]): AccountChoiceRow[] {
  return options.map((o) => {
    const kind: AccountChoiceKind = o.kind === 'credit_card' ? 'credit_card' : (o.assetType as AccountChoiceKind);
    return {
      id: o.id,
      kind,
      name: splitResolverLabel(o.label),
      typeLabel: TYPE_LABEL[kind],
      // A card's figure is what the customer OWES, and calling that a
      // "balance" next to a real balance would be actively misleading.
      balanceLabel: kind === 'credit_card' ? `${money(o.currentValue)} owed` : `Balance · ${money(o.currentValue)}`,
      owed: kind === 'credit_card',
    };
  });
}

/** Context for the credit-card group. Cards ARE a correctly-classified bill
 * payment source (`computeBalanceEffect` increases the card's recorded
 * balance and its mirrored liability), but choosing one is a materially
 * different act from paying out of a balance, so it is said plainly. */
export const CREDIT_CARD_GROUP_NOTE = 'Choosing a card records the bill against that card balance.';

/**
 * Groups rows for display. Money accounts stay ungrouped — they are the
 * ordinary answer — and cards are separated under their own heading so a
 * customer cannot pick one by accident while scanning for their everyday
 * account. A list with no cards has exactly one, unheaded group.
 */
export function groupAccountChoices(rows: readonly AccountChoiceRow[]): AccountChoiceGroup[] {
  const money = rows.filter((r) => r.kind !== 'credit_card');
  const cards = rows.filter((r) => r.kind === 'credit_card');
  const groups: AccountChoiceGroup[] = [];
  if (money.length > 0) groups.push({ title: cards.length > 0 ? 'Money accounts' : null, note: null, rows: money });
  if (cards.length > 0) groups.push({ title: 'Credit cards', note: CREDIT_CARD_GROUP_NOTE, rows: cards });
  return groups;
}

/** The row's single spoken string: name, type and figure, once each — never
 * the figure twice because it also appears in a visual column. */
export function accountChoiceAccessibilityLabel(row: AccountChoiceRow): string {
  return `${row.name}. ${row.typeLabel}. ${row.balanceLabel}.`;
}

/**
 * Whether a row's balance sits beside the name or beneath it. Beneath is
 * not a degraded fallback — it is the correct layout once the name and the
 * figure can no longer share a line without one of them truncating, and
 * truncating an account name is how a customer picks the wrong account.
 */
export function accountRowStacksBalance(width: number, fontScale: number): boolean {
  return fontScale >= 1.3 || width < 340;
}

/** Minimum row height. Above the 44pt floor because these rows carry three
 * lines of information and choose where money comes from. */
export const ACCOUNT_ROW_MIN_HEIGHT = 56;
