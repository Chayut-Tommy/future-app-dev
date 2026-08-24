// Nolie Design 5.1 Wave 9b — BNPL category integrity.
//
// THE CARRY-OVER. `confirmBnplRepaymentTransition` stamped its transaction
// `cat-other-expense`, so a genuine specialised BNPL liability repayment
// displayed as "Other" in Transactions and in every category list — the
// same class of defect Wave 9a-D corrected for ordinary bills.
//
// TWO THINGS MUST BOTH BE TRUE for the correction to be safe:
//   1. the transaction is DETERMINISTICALLY a BNPL repayment, established
//      from structured state and never from a name or label; and
//   2. changing the category changes NO accounting, because every resolver
//      keys on repayment metadata rather than on `categoryId`.
// Both are proven below against the REAL transition and the REAL accounting
// resolvers — not mirrors.
//
// CLASSIFICATION: Class A throughout. Paths resolve from this worktree.
// Run with: ./node_modules/.bin/tsx tests/design5-wave9b-bnpl-category.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { confirmBnplRepaymentTransition } from '../src/state/AppStateContext';
import {
  resolveTransactionCashflowAmount,
  resolveTransactionAggregateSpendingAmount,
  resolveTransactionCategoryCoachingAmount,
} from '../src/lib/calculations/repaymentAccounting';
import { createEmptyAppData } from '../src/lib/storage';
import { DEFAULT_CATEGORIES } from '../src/lib/defaultCategories';
import { AppData, Asset, Liability, RecurringItem, Transaction } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const DUE = '2026-09-15';
const STAMP = '2026-09-15T10:00:00.000Z';

function world(outstanding = 400, scheduled = 100): AppData {
  const d = createEmptyAppData();
  const liability: Liability = { id: 'bnpl1', type: 'bnpl', label: 'Afterpay order', currentBalance: outstanding };
  const item: RecurringItem = {
    id: 'r-bnpl',
    type: 'expense',
    label: 'Afterpay instalment',
    amount: scheduled,
    frequency: 'fortnightly',
    nextDueDate: DUE,
    isFixed: true,
    active: true,
    linkedLiabilityId: 'bnpl1',
  };
  const account: Asset = { id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 2000 } as Asset;
  d.liabilities = [liability];
  d.recurringItems = [item];
  d.assets = [account];
  return d;
}

function confirmBnpl(data: AppData, over: Record<string, unknown> = {}) {
  return confirmBnplRepaymentTransition(data, {
    recurringItemId: 'r-bnpl',
    liabilityId: 'bnpl1',
    expectedNextDueDate: DUE,
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    transactionId: 'txn-bnpl',
    date: STAMP,
    ...over,
  } as never);
}

function addedTxns(before: AppData, after: AppData): Transaction[] {
  const seen = new Set(before.transactions.map((t) => t.id));
  return after.transactions.filter((t) => !seen.has(t.id));
}

console.log('=== 1. The path is DETERMINISTICALLY a BNPL repayment (structured only) ===');
{
  const src = read('src/state/AppStateContext.tsx');
  const fn = src.slice(src.indexOf('export function confirmBnplRepaymentTransition'));
  // Executable code only — the doc comment added by this correction quotes
  // the very patterns 1d/1e ban, in order to explain why they are banned.
  const body = fn.slice(0, fn.indexOf('\n}\n')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert('1a. it requires the liability to be typed bnpl', body.includes("liability.type !== 'bnpl'"));
  assert('1b. it requires the recurring item to be linked to that liability', body.includes('item.linkedLiabilityId !== liability.id'));
  assert('1c. it rejects an ambiguous schedule resolution', body.includes("resolution.status === 'ambiguous'"));
  assert('1d. it never reads the label/name to decide', !/label\.toLowerCase\(|\.label\.includes|name\.toLowerCase/.test(body));
  assert('1e. …and never infers from the category', !/categoryId ===/.test(body));

  // Behavioural: a non-BNPL liability of the same shape is refused.
  const notBnpl = world();
  notBnpl.liabilities = [{ id: 'bnpl1', type: 'car_loan', label: 'Afterpay order', currentBalance: 400 }];
  assert('1f. a car_loan liability is refused, however it is labelled', confirmBnpl(notBnpl).applied === false);
  const unlinked = world();
  unlinked.recurringItems = [{ ...unlinked.recurringItems[0], linkedLiabilityId: undefined }];
  assert('1g. an unlinked recurring item is refused', confirmBnpl(unlinked).applied === false);
}

console.log('\n=== 2. The corrected category, and exactly one transaction ===');
{
  const before = world();
  const r = confirmBnpl(before);
  assert('2a. the transition applies', r.applied === true);
  if (r.applied) {
    const after = (r as unknown as { data: AppData }).data;
    const txns = addedTxns(before, after);
    assert('2b. exactly ONE transaction is created', txns.length === 1);
    assert('2c. at exact cents', txns[0].amount === 100);
    assert('2d. categorised cat-debt, not Other', txns[0].categoryId === 'cat-debt');
    assert('2e. …which is the shipped "Debt repayments" category', DEFAULT_CATEGORIES.find((c) => c.id === 'cat-debt')?.name === 'Debt repayments');
    assert('2f. the old Other stamp is gone', txns[0].categoryId !== 'cat-other-expense');
    // Specialised path preserved.
    assert('2g. the liability reduced by exactly the instalment', after.liabilities[0].currentBalance === 300);
    assert('2h. the funding account reduced exactly once', after.assets[0].currentValue === 1900);
    assert('2i. the occurrence advanced', after.recurringItems[0].nextDueDate !== DUE);
    assert('2j. the occurrence key was stamped for idempotency', typeof txns[0].recurringOccurrenceKey === 'string' && txns[0].recurringOccurrenceKey!.startsWith('r-bnpl:'));
    // Double-confirm guard.
    assert('2k. a repeat confirmation is refused as already confirmed', confirmBnpl(after).applied === false);
  }
}

console.log('\n=== 3. ACCOUNTING IS UNCHANGED — the category decides nothing ===');
{
  const before = world();
  const r = confirmBnpl(before);
  if (r.applied) {
    const after = (r as unknown as { data: AppData }).data;
    const txn = addedTxns(before, after)[0];

    // The three resolvers exclude a BNPL repayment via the STRUCTURED
    // liability lookup, so the new category cannot have moved them.
    assert('3a. excluded from aggregate spending', resolveTransactionAggregateSpendingAmount(after, txn) === 0);
    assert('3b. excluded from category coaching', resolveTransactionCategoryCoachingAmount(after, txn) === 0);
    assert('3c. excluded from recorded cashflow', resolveTransactionCashflowAmount(after, txn) === 0);

    // Proof it is the LOOKUP and not the category: the identical
    // transaction with the OLD category resolves identically.
    const asOldCategory: Transaction = { ...txn, categoryId: 'cat-other-expense' };
    assert('3d. the same transaction under the OLD category resolves identically', resolveTransactionAggregateSpendingAmount(after, asOldCategory) === resolveTransactionAggregateSpendingAmount(after, txn));
    assert('3e. …for coaching too', resolveTransactionCategoryCoachingAmount(after, asOldCategory) === resolveTransactionCategoryCoachingAmount(after, txn));
    assert('3f. …and for cashflow', resolveTransactionCashflowAmount(after, asOldCategory) === resolveTransactionCashflowAmount(after, txn));

    // And the converse: a MANUAL expense the customer files under
    // "Debt repayments" is NOT silently excluded — it carries no BNPL link.
    const manual: Transaction = { id: 'm1', type: 'expense', amount: 100, categoryId: 'cat-debt', date: STAMP };
    assert('3g. a manual cat-debt expense still counts as spending', resolveTransactionAggregateSpendingAmount(after, manual) === 100);
    assert('3h. …and still participates in category coaching', resolveTransactionCategoryCoachingAmount(after, manual) === 100);
    assert('3i. …and still counts as cashflow', resolveTransactionCashflowAmount(after, manual) === 100);
    assert('3j. so the category genuinely decides no accounting', resolveTransactionAggregateSpendingAmount(after, manual) !== resolveTransactionAggregateSpendingAmount(after, txn));
  }
}

console.log('\n=== 4. No migration, no historical rewrite ===');
{
  const before = world();
  // A historical BNPL transaction saved under the OLD category.
  const historical: Transaction = { id: 'old1', type: 'expense', amount: 100, categoryId: 'cat-other-expense', date: '2026-07-15T10:00:00.000Z', recurringItemId: 'r-bnpl' };
  before.transactions = [historical];
  const r = confirmBnpl(before);
  assert('4a. the transition still applies alongside historical data', r.applied === true);
  if (r.applied) {
    const after = (r as unknown as { data: AppData }).data;
    const still = after.transactions.find((t) => t.id === 'old1');
    assert('4b. the historical transaction is untouched', still !== undefined && still.categoryId === 'cat-other-expense');
    assert('4c. it was not rewritten to cat-debt', still?.categoryId !== 'cat-debt');
    assert('4d. and it is still excluded from spending by the structured lookup', resolveTransactionAggregateSpendingAmount(after, still!) === 0);
    assert('4e. exactly one NEW transaction exists', after.transactions.length === 2);
  }
  assert('4f. storage performs no BNPL category migration', !/cat-debt|cat-other-expense/.test(read('src/lib/storage.ts')));
}

console.log('\n=== 5. The accounting engine itself was not edited ===');
{
  const RA = read('src/lib/calculations/repaymentAccounting.ts');
  assert('5a. the BNPL lookup is still a structured liability-type check', RA.includes("return liability?.type === 'bnpl';"));
  assert('5b. aggregate spending still excludes BNPL first', RA.includes('if (isBnplLinkedTransaction(data, t)) return 0;'));
  assert('5c. the resolvers still key on isRepayment, never the category', RA.includes('if (t.isRepayment) return 0;') && !/categoryId === 'cat-debt'/.test(RA.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert('5d. loan-repayment principal handling is unchanged', RA.includes('t.principalAmount !== undefined ? Math.max(0, t.amount - t.principalAmount) : 0'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
