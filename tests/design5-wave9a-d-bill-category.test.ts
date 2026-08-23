// Nolie Design 5.1 Wave 9a-D — recurring-bill purpose is preserved when a
// reminder payment creates a transaction.
//
// THE DEFECT. A customer picks a purpose when they create a bill ("Rent",
// "Car Loan", "Gym"). Nothing structured was persisted from that choice:
// RecurringItem carried only `icon`, documented on the model as "purely
// visual". So confirmRecurringOccurrenceTransition had no purpose to read
// and stamped every generated expense `cat-other-expense` — not as a
// fallback, as an unconditional literal. Amounts were right; every category
// insight silently under-reported.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): §1-§2 run the real billCategory module; §3-§7
//   run the REAL confirmRecurringOccurrenceTransition and the REAL
//   specialised repayment transitions against real AppData. These are not
//   mirrored reimplementations — a regression in the engine fails here.
// - Class C (structural): §8 reads the real sources.
//
// Paths resolve from THIS worktree — no external shim.
// Run with: ./node_modules/.bin/tsx tests/design5-wave9a-d-bill-category.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  BILL_PRESET_CATEGORY,
  BILL_PRESET_LABELS,
  CANONICAL_EXPENSE_CATEGORY_IDS,
  UNCATEGORISED_EXPENSE_ID,
  categoryForBillPreset,
  isCanonicalExpenseCategoryId,
  resolveBillTransactionCategory,
  billNeedsCategoryChoice,
} from '../src/lib/calculations/billCategory';
import { confirmRecurringOccurrenceTransition, confirmLoanRepaymentTransition } from '../src/state/AppStateContext';
import { createEmptyAppData } from '../src/lib/storage';
import { DEFAULT_CATEGORIES } from '../src/lib/defaultCategories';
import { AppData, RecurringItem, CreditCard, Asset, Liability, Transaction } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

// ---------------------------------------------------------------------------
// Fixtures — real model shapes, every field a declared interface member.
// ---------------------------------------------------------------------------
const DUE = '2026-09-15';

function bill(over: Partial<RecurringItem> & { id: string; label: string; amount: number }): RecurringItem {
  return {
    type: 'expense',
    frequency: 'monthly',
    nextDueDate: DUE,
    isFixed: true,
    active: true,
    ...over,
  } as RecurringItem;
}

function amex(balance = 0): CreditCard {
  return { id: 'amex', issuer: 'AMEX', label: 'AMEX', creditLimit: 10000, currentBalance: balance, dueDay: 20, minimumPayment: 0, apr: 0.2 };
}

function everyday(balance: number): Asset {
  return { id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: balance } as Asset;
}

function world(over: Partial<AppData>): AppData {
  return { ...createEmptyAppData(), ...over };
}

/** The transactions this confirmation added, in order. */
function added(before: AppData, after: AppData): Transaction[] {
  const seen = new Set(before.transactions.map((t) => t.id));
  return after.transactions.filter((t) => !seen.has(t.id));
}

function confirm(data: AppData, itemId: string, source: 'credit_card' | 'everyday', extra: Record<string, string> = {}) {
  return confirmRecurringOccurrenceTransition(data, {
    recurringItemId: itemId,
    expectedNextDueDate: DUE,
    paymentSource: source,
    transactionId: 'txn-new',
    date: DUE,
    ...extra,
  });
}

console.log('=== 1. Every preset maps to exactly one valid canonical category (Class A) ===');
{
  assert('1a. all twelve shipped presets are mapped', BILL_PRESET_LABELS.length === 12);
  // Exhaustive: the mapper's keys must be exactly the form's preset labels,
  // so a preset added later cannot silently fall through to Other.
  const formPresets = [...code(read('src/components/money/AddRecurringItemModal.tsx')).matchAll(/\{ label: '([^']+)', icon:/g)].map((m) => m[1]);
  assert('1b. the form ships exactly twelve presets', formPresets.length === 12);
  assert('1c. every form preset has a mapping', formPresets.every((l) => Object.prototype.hasOwnProperty.call(BILL_PRESET_CATEGORY, l)));
  assert('1d. and the mapper declares no preset the form does not ship', BILL_PRESET_LABELS.every((l) => formPresets.includes(l)));

  for (const label of BILL_PRESET_LABELS) {
    const id = BILL_PRESET_CATEGORY[label];
    assert(`1e. "${label}" → ${id} exists in the canonical registry`, CANONICAL_EXPENSE_CATEGORY_IDS.includes(id));
    assert(`1f. "${label}" → ${id} is a real EXPENSE category`, DEFAULT_CATEGORIES.some((c) => c.id === id && c.type === 'expense'));
  }

  // The exact required semantic mappings.
  const REQUIRED: [string, string][] = [
    ['Rent', 'cat-rent'],
    ['Mortgage', 'cat-mortgage'],
    ['Car Loan', 'cat-transport'],
    ['Car', 'cat-transport'],
    ['Gym', 'cat-health'],
    ['Utilities', 'cat-utilities'],
    ['Insurance', 'cat-insurance'],
    ['Subscription', 'cat-subscriptions'],
    ['Phone', 'cat-utilities'],
    ['Internet', 'cat-utilities'],
    ['Personal Loan', 'cat-debt'],
    ['Other', 'cat-other-expense'],
  ];
  for (const [label, id] of REQUIRED) {
    assert(`1g. required mapping ${label} → ${id}`, categoryForBillPreset(label) === id);
  }
  assert('1h. every required mapping is covered', REQUIRED.length === BILL_PRESET_LABELS.length);
}

console.log('\n=== 2. Unknown / absent / invalid resolve EXPLICITLY to Other (Class A) ===');
{
  assert('2a. an unknown preset label', categoryForBillPreset('Yacht mooring') === UNCATEGORISED_EXPENSE_ID);
  assert('2b. undefined', categoryForBillPreset(undefined) === UNCATEGORISED_EXPENSE_ID);
  assert('2c. null', categoryForBillPreset(null) === UNCATEGORISED_EXPENSE_ID);
  assert('2d. empty string', categoryForBillPreset('') === UNCATEGORISED_EXPENSE_ID);

  assert('2e. a bill with no categoryId', resolveBillTransactionCategory({}) === UNCATEGORISED_EXPENSE_ID);
  assert('2f. a bill with an unknown categoryId', resolveBillTransactionCategory({ categoryId: 'cat-not-real' }) === UNCATEGORISED_EXPENSE_ID);
  assert('2g. a bill carrying an INCOME category is rejected', resolveBillTransactionCategory({ categoryId: 'cat-salary' }) === UNCATEGORISED_EXPENSE_ID);
  assert('2h. a valid one is passed through exactly', resolveBillTransactionCategory({ categoryId: 'cat-rent' }) === 'cat-rent');
  assert('2i. income ids are not canonical expense ids', !isCanonicalExpenseCategoryId('cat-salary') && !isCanonicalExpenseCategoryId(undefined));
  assert('2j. a legacy bill is flagged as needing a choice', billNeedsCategoryChoice({}) && !billNeedsCategoryChoice({ categoryId: 'cat-rent' }));

  // The resolver must not be able to read free text at all.
  const SRC = code(read('src/lib/calculations/billCategory.ts'));
  const fn = SRC.slice(SRC.indexOf('export function resolveBillTransactionCategory'));
  assert('2k. the resolver reads no label', !fn.includes('.label'));
  assert('2l. the resolver reads no icon', !fn.includes('.icon'));
  assert('2m. no string matching anywhere in the module', !/toLowerCase\(|\.startsWith\(|\.match\(/.test(SRC));
}

console.log('\n=== 3. Toyota / Car Loan ordinary bill paid from AMEX (Class A, real engine) ===');
{
  const toyota = bill({ id: 'b-toyota', label: 'Toyota', amount: 500, categoryId: 'cat-transport', icon: 'car-sport-outline' });
  const before = world({ recurringItems: [toyota], creditCards: [amex(0)] });

  assert('3a. AMEX starts at $0', before.creditCards[0].currentBalance === 0);
  assert('3b. selection alone writes nothing — no transaction exists yet', before.transactions.length === 0);

  const r = confirm(before, 'b-toyota', 'credit_card', { creditCardId: 'amex' });
  assert('3c. the confirmation applies', r.applied === true);
  if (r.applied) {
    const txns = added(before, r.data);
    assert('3d. exactly ONE transaction is created', txns.length === 1);
    assert('3e. at exact cents', txns[0].amount === 500);
    assert('3f. categorised cat-transport, NOT Other', txns[0].categoryId === 'cat-transport');
    assert('3g. …and definitively not the old literal', txns[0].categoryId !== UNCATEGORISED_EXPENSE_ID);
    assert('3h. it is an ordinary expense', txns[0].type === 'expense');
    // ACCOUNTING BOUNDARY — the category did not select a repayment path.
    assert('3i. it is NOT flagged as a repayment of either kind', txns[0].isRepayment !== true && (txns[0] as { isLoanRepayment?: boolean }).isLoanRepayment !== true);
    assert('3i-i. and carries no principal allocation', (txns[0] as { principalAmount?: number }).principalAmount === undefined);
    // Charging a card maintains that CARD's own mirror liability (the
    // existing upsertCreditCardLiability contract, so the card counts
    // toward net worth). That is not a loan, and no loan liability appears.
    assert('3j. the only liability is the card\'s own mirror', r.data.liabilities.length === 1 && r.data.liabilities[0].creditCardId === 'amex');
    assert('3j-i. no LOAN liability was created', r.data.liabilities.every((l) => l.type !== 'car_loan' && l.type !== 'personal_loan' && l.type !== 'mortgage'));
    assert('3j-ii. the mirror tracks the card exactly, once', r.data.liabilities[0].currentBalance === 500);
    assert('3k. AMEX balance becomes $500', r.data.creditCards[0].currentBalance === 500);
    assert('3l. the occurrence advanced exactly once', r.data.recurringItems[0].nextDueDate !== DUE);
    assert('3m. …forward, never backward', new Date(r.data.recurringItems[0].nextDueDate).getTime() > new Date(DUE).getTime());
    assert('3n. the bill remains active, so a future occurrence stays', r.data.recurringItems[0].active === true);
    assert('3o. the bill keeps its purpose for next time', r.data.recurringItems[0].categoryId === 'cat-transport');
    assert('3p. monthly spending rises by exactly $500 once', txns.reduce((s, t) => s + t.amount, 0) === 500);

    // A second confirmation against the SAME expected date must not apply —
    // the rapid double-confirm guard.
    const again = confirm(r.data, 'b-toyota', 'credit_card', { creditCardId: 'amex' });
    assert('3q. a rapid double-confirm is rejected as stale', again.applied === false);
    assert('3r. …so no second transaction and no double charge', again.applied === false && r.data.transactions.length === 1);
  }
}

console.log('\n=== 4. Rent paid from an everyday account (Class A, real engine) ===');
{
  const rent = bill({ id: 'b-rent', label: 'Rent', amount: 250, categoryId: 'cat-rent', icon: 'home-outline' });
  const before = world({ recurringItems: [rent], assets: [everyday(1000)] });

  const r = confirm(before, 'b-rent', 'everyday', { targetAssetId: 'ev1' });
  assert('4a. the confirmation applies', r.applied === true);
  if (r.applied) {
    const txns = added(before, r.data);
    assert('4b. exactly ONE transaction', txns.length === 1);
    assert('4c. categorised cat-rent, NOT Other', txns[0].categoryId === 'cat-rent');
    assert('4d. at exact cents', txns[0].amount === 250);
    assert('4e. the everyday balance decreases by $250 exactly once', r.data.assets[0].currentValue === 750);
    assert('4f. the occurrence advanced once', r.data.recurringItems[0].nextDueDate !== DUE);
    assert('4g. not a repayment of either kind', txns[0].isRepayment !== true && (txns[0] as { isLoanRepayment?: boolean }).isLoanRepayment !== true);
  }

  // Cancel / selection-only: calling nothing mutates nothing.
  assert('4h. selection alone leaves the balance untouched', before.assets[0].currentValue === 1000);
  assert('4i. selection alone creates no transaction', before.transactions.length === 0);
  // A stale expected date (what a cancelled-then-changed occurrence looks
  // like) is rejected without mutating.
  const stale = confirmRecurringOccurrenceTransition(before, {
    recurringItemId: 'b-rent',
    expectedNextDueDate: '2026-01-01',
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    transactionId: 'txn-x',
    date: DUE,
  });
  assert('4j. a stale confirmation is rejected', stale.applied === false);
  assert('4k. …and wrote nothing', before.transactions.length === 0 && before.assets[0].currentValue === 1000);
}

console.log('\n=== 5. Gym resolves to Health / gym automatically (Class A) ===');
{
  const gym = bill({ id: 'b-gym', label: 'Fitness First', amount: 50, categoryId: categoryForBillPreset('Gym'), icon: 'barbell-outline' });
  const before = world({ recurringItems: [gym], assets: [everyday(500)] });
  const r = confirm(before, 'b-gym', 'everyday', { targetAssetId: 'ev1' });
  assert('5a. the confirmation applies', r.applied === true);
  if (r.applied) {
    const txns = added(before, r.data);
    assert('5b. exactly one transaction', txns.length === 1);
    assert('5c. categorised cat-health with no manual edit', txns[0].categoryId === 'cat-health');
    assert('5d. which is the shipped "Health / gym" category', DEFAULT_CATEGORIES.find((c) => c.id === 'cat-health')?.name === 'Health / gym');
    assert('5e. the bill NAME ("Fitness First") played no part', txns[0].categoryId === categoryForBillPreset('Gym'));
  }
}

console.log('\n=== 6. Legacy bill — explicit Other fallback, then an explicit choice (Class A) ===');
{
  // A bill saved before the field existed: no categoryId, only a leftover
  // icon. The icon must NOT be promoted into a category.
  const legacy = bill({ id: 'b-legacy', label: 'Old rent', amount: 300, icon: 'home-outline' });
  assert('6a. it has no structured purpose', legacy.categoryId === undefined);
  assert('6b. it still loads and is flagged as needing a choice', billNeedsCategoryChoice(legacy));

  const before = world({ recurringItems: [legacy], assets: [everyday(1000)] });
  const r = confirm(before, 'b-legacy', 'everyday', { targetAssetId: 'ev1' });
  assert('6c. payment still succeeds', r.applied === true);
  if (r.applied) {
    const txns = added(before, r.data);
    assert('6d. exactly one transaction', txns.length === 1);
    assert('6e. through the EXPLICIT Other fallback', txns[0].categoryId === UNCATEGORISED_EXPENSE_ID);
    assert('6f. the home-outline icon was NOT read as Rent', txns[0].categoryId !== 'cat-rent');
  }

  // The customer edits the bill and explicitly picks Rent.
  const chosen: RecurringItem = { ...legacy, categoryId: categoryForBillPreset('Rent'), nextDueDate: DUE };
  const after = world({ recurringItems: [chosen], assets: [everyday(1000)] });
  const r2 = confirm(after, 'b-legacy', 'everyday', { targetAssetId: 'ev1' });
  assert('6g. a later occurrence uses the chosen category', r2.applied === true && added(after, (r2 as { applied: true; data: AppData }).data)[0].categoryId === 'cat-rent');

  // And the earlier Other transaction is untouched by any of this.
  if (r.applied) {
    const historical = r.data.transactions.find((t) => t.categoryId === UNCATEGORISED_EXPENSE_ID);
    assert('6h. the historical Other transaction still exists, unrewritten', historical !== undefined && historical.categoryId === UNCATEGORISED_EXPENSE_ID);
  }
  assert('6i. no automatic icon-based backfill exists anywhere', !/icon[\s\S]{0,80}categoryId|categoryId[\s\S]{0,80}p\.icon/.test(code(read('src/lib/calculations/billCategory.ts'))));
  assert('6j. storage performs no category migration', !/categoryId/.test(read('src/lib/storage.ts')));
}

console.log('\n=== 7. The specialised repayment path is untouched (Class A) ===');
{
  const liability: Liability = { id: 'l1', type: 'car_loan', label: 'Toyota loan', currentBalance: 20000, interestRate: 0.07 };
  // A GENUINELY linked repayment: the bill points at the liability. Note it
  // also carries an ordinary purpose — proving the mapper cannot redirect
  // this path even when a category is present.
  const linked = bill({ id: 'b-linked', label: 'Toyota', amount: 500, categoryId: 'cat-transport', linkedLiabilityId: 'l1' });
  const data = world({ liabilities: [liability], assets: [everyday(5000)], recurringItems: [linked] });
  const r = confirmLoanRepaymentTransition(data, {
    recurringItemId: 'b-linked',
    liabilityId: 'l1',
    expectedNextDueDate: DUE,
    amount: 500,
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    updateBalance: false,
    expectedCurrentBalance: 20000,
    transactionId: 'txn-loan',
    date: DUE,
  } as never);
  assert('7a. the specialised transition still applies', (r as { applied: boolean }).applied === true);
  if ((r as { applied: boolean }).applied) {
    const after = (r as unknown as { data: AppData }).data;
    const txns = added(data, after);
    assert('7b. exactly one transaction', txns.length === 1);
    assert('7c. it keeps cat-debt (Debt repayments)', txns[0].categoryId === 'cat-debt');
    assert('7d. …even though the bill carries an ordinary cat-transport purpose', linked.categoryId === 'cat-transport' && txns[0].categoryId === 'cat-debt');
    assert('7e. it IS flagged as a loan repayment', (txns[0] as { isLoanRepayment?: boolean }).isLoanRepayment === true);
    assert('7f. the source reduced exactly once', after.assets[0].currentValue === 4500);
    assert('7g. the liability is reconciled by the unchanged engine', after.liabilities[0].id === 'l1');
  }
  assert('7h. the specialised engines were not modified', !/resolveBillTransactionCategory/.test(code(read('src/lib/calculations/repaymentAccounting.ts'))));
}

console.log('\n=== 8. Structural — one resolver, in the shared domain module (Class C) ===');
{
  const CTX = code(read('src/state/AppStateContext.tsx'));
  assert('8a. the expense branch calls the shared resolver', CTX.includes('resolveBillTransactionCategory(item)'));
  assert('8b. the unconditional literal is gone from that branch', !/: 'cat-other-expense';/.test(CTX));
  // No screen may hold its own copy of this decision.
  for (const rel of [
    'src/components/today/ReminderDetailSheet.tsx',
    'src/screens/today/TodayScreen.tsx',
    'src/components/today/SmartReminderCard.tsx',
    'src/screens/money/MoneyScreen.tsx',
  ]) {
    const c = code(read(rel));
    assert(`8c. ${rel.split('/').pop()} holds no category mapping`, !/cat-rent|cat-transport|cat-health|BILL_PRESET_CATEGORY/.test(c));
  }
  const FORM = code(read('src/components/money/AddRecurringItemModal.tsx'));
  assert('8d. the form persists the structured id', FORM.includes('categoryId: billCategoryId'));
  assert('8e. it seeds only from the STORED value, never the icon', FORM.includes('setBillCategoryId(editItem.categoryId)'));
  assert('8f. an explicit preset choice is what sets it', FORM.includes('setBillCategoryId(categoryForBillPreset(p.label))'));
  assert('8g. the form derives no category from an icon', !/categoryForBillPreset\([^)]*icon/.test(FORM));
  assert('8h. the model field is optional and additive', /categoryId\?: string;/.test(read('src/types/models.ts')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
