/**
 * Nolie Design 5.1 Wave 9a-D — the bill-purpose → transaction-category
 * contract.
 *
 * THE DEFECT THIS CORRECTS. A customer picks a purpose when they create a
 * bill ("Rent", "Car Loan", "Gym"). Nothing structured was ever persisted
 * from that choice: `RecurringItem` carried only `icon`, documented on the
 * model as "purely visual", and the details step recovered the label by
 * searching the presets for that icon. So when a reminder was marked paid,
 * AppStateContext had no purpose to read and stamped every generated
 * expense `cat-other-expense` unconditionally — not as a fallback, as a
 * literal. Amounts were right; classification was not, so category
 * analytics silently under-reported every real category.
 *
 * THE DATA CONTRACT. Bill purposes and transaction categories are the SAME
 * taxonomy in substance — every preset has a canonical expense equivalent —
 * so this stores the canonical `Category.id` itself on the recurring item
 * rather than inventing a second parallel enum plus a runtime mapper. That
 * is the smallest truthful model: the customer's choice IS the category,
 * payment-time propagation is a copy rather than a translation, and the two
 * vocabularies cannot drift apart because there is only one.
 *
 * The preset table below is the ONLY place a purpose becomes a category,
 * and it runs at bill-creation time. `icon` stays exactly what its own doc
 * comment says it is — decoration — and is never read here.
 *
 * ACCOUNTING BOUNDARY. Nothing in this module selects an accounting path.
 * Repayment treatment keys on `Transaction.isRepayment` and never on
 * `categoryId` (see repaymentAccounting.ts's own doc comment, which states
 * this explicitly). A liability-linked repayment continues through the
 * specialised engine and keeps `cat-debt`; this module is not consulted on
 * that path at all.
 */

import { DEFAULT_CATEGORIES } from '../defaultCategories';
import { RecurringItem } from '../../types/models';

/** The canonical id used when a purpose is genuinely absent, legacy,
 * invalid or unmapped. Never a convenience default. */
export const UNCATEGORISED_EXPENSE_ID = 'cat-other-expense';

/** Every canonical EXPENSE category id the app ships. Derived from the one
 * registry so a category added there is automatically valid here. */
export const CANONICAL_EXPENSE_CATEGORY_IDS: readonly string[] = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense').map((c) => c.id);

export function isCanonicalExpenseCategoryId(id: string | undefined | null): id is string {
  return typeof id === 'string' && CANONICAL_EXPENSE_CATEGORY_IDS.includes(id);
}

/**
 * The twelve bill presets, by their stable preset label, mapped to the
 * canonical expense category each one means.
 *
 * The KEY is the preset's identity in the form, not customer-entered text —
 * a customer's own bill NAME ("Toyota", "Netflix") is never consulted.
 * This table is exhaustive over the shipped presets; the test suite asserts
 * that every preset appears exactly once, so a future preset cannot be
 * added and silently fall through to Other.
 */
export type BillPresetLabel =
  | 'Rent'
  | 'Mortgage'
  | 'Utilities'
  | 'Phone'
  | 'Internet'
  | 'Gym'
  | 'Subscription'
  | 'Car'
  | 'Car Loan'
  | 'Personal Loan'
  | 'Insurance'
  | 'Other';

export const BILL_PRESET_CATEGORY: Readonly<Record<BillPresetLabel, string>> = {
  Rent: 'cat-rent',
  Mortgage: 'cat-mortgage',
  Utilities: 'cat-utilities',
  // A phone or internet bill is a recurring household utility; the registry
  // ships no narrower category, and inventing one is outside this scope.
  Phone: 'cat-utilities',
  Internet: 'cat-utilities',
  // "Health / gym" is the shipped category name.
  Gym: 'cat-health',
  Subscription: 'cat-subscriptions',
  Car: 'cat-transport',
  // An ORDINARY car-loan bill is transport spending. It is not routed to
  // 'cat-debt': that id belongs to the specialised liability-repayment
  // path, which this bill does not take. The category does not and must not
  // decide that — see the accounting-boundary note above.
  'Car Loan': 'cat-transport',
  // A personal loan has no transport or housing equivalent; 'Debt
  // repayments' is its genuine canonical meaning. This still does NOT make
  // it take the repayment path — accounting keys on isRepayment.
  'Personal Loan': 'cat-debt',
  Insurance: 'cat-insurance',
  // The customer explicitly chose "Other"; that is a real choice, and it
  // happens to resolve to the same id as the absent-purpose fallback.
  Other: UNCATEGORISED_EXPENSE_ID,
};

/** Every preset label, for exhaustive iteration in tests and in the form. */
export const BILL_PRESET_LABELS: readonly BillPresetLabel[] = Object.keys(BILL_PRESET_CATEGORY) as BillPresetLabel[];

/**
 * The canonical category a preset means. Unknown labels resolve to the
 * explicit fallback rather than throwing — a persisted preset label from a
 * future build must never crash an older reader.
 */
export function categoryForBillPreset(label: string | undefined | null): string {
  if (typeof label !== 'string') return UNCATEGORISED_EXPENSE_ID;
  const mapped = (BILL_PRESET_CATEGORY as Record<string, string | undefined>)[label];
  return isCanonicalExpenseCategoryId(mapped) ? mapped : UNCATEGORISED_EXPENSE_ID;
}

/**
 * THE ONE RESOLVER every transaction-creating path must use for an ordinary
 * recurring EXPENSE.
 *
 * Reads only the structured `categoryId` the customer's own choice
 * persisted. It never looks at `label`, `icon`, or any free text, so a bill
 * named "Toyota" cannot be classified by its name and a legacy bill's
 * leftover icon cannot be mistaken for a category the customer chose.
 *
 * Falls back to `cat-other-expense` — explicitly, and only — when the field
 * is absent (a bill created before this field existed), or holds a value
 * that is not a canonical expense category.
 */
export function resolveBillTransactionCategory(item: Pick<RecurringItem, 'categoryId'>): string {
  return isCanonicalExpenseCategoryId(item.categoryId) ? item.categoryId : UNCATEGORISED_EXPENSE_ID;
}

/** Whether this bill still needs the customer to choose a purpose — true
 * for a legacy bill saved before the field existed. Used only to decide
 * whether the form should treat the stored value as authoritative; a
 * leftover icon is never promoted into a category on the customer's
 * behalf. */
export function billNeedsCategoryChoice(item: Pick<RecurringItem, 'categoryId'>): boolean {
  return !isCanonicalExpenseCategoryId(item.categoryId);
}
