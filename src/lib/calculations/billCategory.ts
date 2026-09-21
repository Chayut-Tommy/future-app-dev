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
import { AppData, LiabilityType, RecurringItem, Transaction } from '../../types/models';
import { OCCURRENCE_ID_NAMESPACE } from './occurrenceIdentity';

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

// ---------------------------------------------------------------------------
// Pass C.5 — repayment families (the SAME taxonomy, no new categories)
// ---------------------------------------------------------------------------

/**
 * THE DEFECT THIS CORRECTS (19 Sep device recording). "Richmond repayment" —
 * a $3,000 monthly bill LINKED to a mortgage liability — was marked paid from
 * its ordinary "due tomorrow" reminder. That reminder runs the ordinary bill
 * transition, which classified by the bill's own `categoryId` alone. A
 * liability-linked repayment bill is created by the liability flow, not by
 * the bill-purpose picker, so it never had one: the transaction was PERSISTED
 * as `cat-other-expense` and Transactions / This Month showed "Other". The
 * dedicated loan transition had the sibling gap: it stamped every loan,
 * mortgage included, `cat-debt`.
 *
 * THE MAPPING IS NOT NEW. It is the bill-preset table above, read by the
 * liability's own structured subtype instead of by a preset the customer was
 * never asked for: Mortgage → `cat-mortgage`, Car Loan → `cat-transport`,
 * Personal Loan → `cat-debt`. A supported "other" loan, a credit-card
 * repayment and a BNPL repayment keep the `cat-debt` they already carried.
 * No category is added and no accounting path is selected here: repayment
 * accounting keys on structured flags, never on `categoryId`.
 */
export type RepaymentFamily = Extract<LiabilityType, 'mortgage' | 'car_loan' | 'personal_loan' | 'other'> | 'credit_card' | 'bnpl';

const REPAYMENT_FAMILY_CATEGORY: Readonly<Record<RepaymentFamily, string>> = {
  mortgage: BILL_PRESET_CATEGORY.Mortgage,
  car_loan: BILL_PRESET_CATEGORY['Car Loan'],
  personal_loan: BILL_PRESET_CATEGORY['Personal Loan'],
  other: 'cat-debt',
  credit_card: 'cat-debt',
  bnpl: 'cat-debt',
};

/** The loan subtypes a repayment can be linked to (never card or BNPL). */
/** A proven loan repayment whose family can no longer be resolved. */
const CONSERVATIVE_LOAN_CATEGORY = 'cat-debt';

export const LOAN_REPAYMENT_FAMILIES: readonly LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];

export function categoryForRepaymentFamily(family: RepaymentFamily): string {
  const id = REPAYMENT_FAMILY_CATEGORY[family];
  return isCanonicalExpenseCategoryId(id) ? id : 'cat-debt';
}

/** The loan liability a recurring item repays, from STRUCTURED state only
 * (`linkedLiabilityId` → `Liability.type`); never its label, amount or date. */
function linkedLoanFamily(data: Pick<AppData, 'liabilities'>, item: Pick<RecurringItem, 'linkedLiabilityId'> | undefined): RepaymentFamily | null {
  if (!item?.linkedLiabilityId) return null;
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  if (!liability || !LOAN_REPAYMENT_FAMILIES.includes(liability.type)) return null;
  return liability.type as RepaymentFamily;
}

/**
 * THE ONE RESOLVER for a confirmed recurring EXPENSE at RECORDING time — the
 * ordinary bill transition and the dedicated loan transition both call it, so
 * the two paths can no longer disagree, whichever reminder tier recorded the
 * payment. A repayment LINKED to a loan liability takes that liability's
 * family category — from the structured subtype alone, so a bill's own
 * purpose can never redirect a repayment (the Wave 9a-D boundary, kept). Any
 * other bill keeps the purpose the customer chose, else the explicit
 * `cat-other-expense` fallback, exactly as before.
 */
export function resolveRecurringExpenseCategory(data: Pick<AppData, 'liabilities'>, item: Pick<RecurringItem, 'categoryId' | 'linkedLiabilityId'>): string {
  const family = linkedLoanFamily(data, item);
  if (family) return categoryForRepaymentFamily(family);
  return resolveBillTransactionCategory(item);
}

/** True when the transaction's PERSISTED canonical occurrence identity names a
 * loan repayment (`oid1:loan:<sourceId>:…`) for its own recorded source. That
 * identity is written once at confirmation and never rewritten. */
function hasPersistedLoanIdentity(t: Pick<Transaction, 'occurrenceResolution' | 'recurringItemId'>): boolean {
  const r = t.occurrenceResolution;
  if (!r || r.state !== 'linked' || !t.recurringItemId) return false;
  // Structured fields of the canonical id (namespace : source kind : source id
  // : period) — compared exactly, never pattern-matched. A source id can never
  // contain the ':' delimiter (occurrenceIdentity.ts's own contract).
  const [namespace, sourceKind, sourceId] = String(r.occurrenceId).split(':');
  return namespace === OCCURRENCE_ID_NAMESPACE && sourceKind === 'loan' && sourceId === t.recurringItemId;
}

/**
 * THE ONE RESOLVER every surface that SHOWS or GROUPS a recorded transaction's
 * category must use (Transactions, This Month recent activity, spending
 * insights, Worth Knowing). It returns the persisted category untouched for
 * everything except a repayment that is PROVABLY a loan repayment and was
 * recorded before this correction:
 *
 *   - proof of "loan repayment" is persisted on the transaction itself — the
 *     canonical occurrence identity (`oid1:loan:…`) or the `isLoanRepayment`
 *     flag — never a label, amount or date;
 *   - the subtype then comes from the still-present structured link
 *     (recurring item → liability type). Pass C.5.1 — if the source or
 *     liability is gone, the persisted identity still proves "a loan
 *     repayment" but no longer which family, so the record shows the existing
 *     conservative "Debt repayments" category: never "Other", never "Rent",
 *     never a family guessed from its name, amount or date.
 *
 * A manually entered "Other" expense has neither proof and always stays
 * "Other". Nothing is migrated or rewritten; deleting and re-recording (the
 * established P0 correction) persists the right category going forward.
 */
export function resolveRecordedTransactionCategoryId(data: Pick<AppData, 'recurringItems' | 'liabilities'>, t: Transaction): string {
  if (t.type !== 'expense') return t.categoryId;
  const legacyLoanShape = (t.categoryId === UNCATEGORISED_EXPENSE_ID && hasPersistedLoanIdentity(t)) || (t.categoryId === 'cat-debt' && t.isLoanRepayment === true);
  if (!legacyLoanShape) return t.categoryId;
  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  const family = linkedLoanFamily(data, item);
  return family ? categoryForRepaymentFamily(family) : CONSERVATIVE_LOAN_CATEGORY;
}

/**
 * Pass C.5.1 — the ONE "largest category" rule, shared by the Money spending
 * insight and Worth Knowing.
 *
 * Device finding (20 Sep): "Rent is your largest category · $3000" appeared
 * beside a $3,000 Mortgage row. Nothing was mislabelled — three $1,000 rent
 * payments and one $3,000 mortgage repayment were TIED to the cent, and each
 * consumer silently named one of them (Map insertion order in one, category-id
 * order in the other, so the two surfaces could even disagree). A tie has no
 * single "largest" category, so this returns EVERY category at the exact-cent
 * maximum, in the category registry's own order, and each caller words the
 * tie honestly. Totals are integer cents; nothing is inferred from a label.
 */
export function resolveLeadingCategoryIds(totalsCents: ReadonlyMap<string, number>, categories: ReadonlyArray<{ id: string }>): string[] {
  let maxCents = 0;
  for (const cents of totalsCents.values()) if (cents > maxCents) maxCents = cents;
  if (maxCents <= 0) return [];
  const registryOrder = new Map(categories.map((c, index) => [c.id, index]));
  const position = (id: string) => registryOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...totalsCents]
    .filter(([, cents]) => cents === maxCents)
    .map(([id]) => id)
    .sort((a, b) => position(a) - position(b) || (a < b ? -1 : a > b ? 1 : 0));
}
