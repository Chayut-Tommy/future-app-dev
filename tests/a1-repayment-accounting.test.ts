// A1 — repayment ACCOUNTING integrity (pure, real transitions).
//
// The financial-integrity boundary between a GENERIC one-sided manual record
// and a TWO-SIDED dedicated repayment. Proves, with exact dollar figures via the
// REAL accounting transitions, that:
//   - a generic manual expense near a card/loan due date is NEVER offered the
//     repayment cycle and only ever moves the funding account (one side);
//   - each dedicated repayment flow moves BOTH sides (funding + liability/card),
//     stamps the canonical occurrence relationship, and its dedicated reversal
//     restores both balances exactly once;
//   - every supported loan subtype (mortgage / car_loan / personal_loan / other)
//     plus BNPL and credit card carries correct identity + two-sided accounting.
//
// Run: ./node_modules/.bin/tsx tests/a1-repayment-accounting.test.ts

import type { AppData, Asset, CreditCard, Liability, LiabilityType, RecurringItem } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import {
  applyNewTransaction,
  applyLinkTransactionToOccurrence,
  applyTransactionDelete,
  confirmBnplRepaymentTransition,
  confirmCreditCardRepaymentTransition,
  confirmLoanRepaymentTransition,
  reverseBnplRepaymentTransaction,
  reverseCreditCardRepaymentTransaction,
  reverseLoanRepaymentTransaction,
} from '../src/state/AppStateContext';
import { deriveOccurrenceCandidates } from '../src/lib/calculations/occurrenceCandidates';
import { occurrenceIdForCard, occurrenceIdForRecurringItem } from '../src/lib/calculations/occurrenceSources';
import { resolveOccurrence, OccurrenceDescriptor } from '../src/lib/calculations/occurrenceResolution';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (y: number, m: number, d: number) => D(y, m, d).toISOString();
const everyday = (id: string, value: number): Asset => ({ id, type: 'everyday', label: 'Everyday', currentValue: value } as Asset);
const bal = (data: AppData, assetId: string) => data.assets.find((a) => a.id === assetId)!.currentValue;
const cardBal = (data: AppData, cardId: string) => data.creditCards.find((c) => c.id === cardId)!.currentBalance;
const liaBal = (data: AppData, liaId: string) => data.liabilities.find((l) => l.id === liaId)!.currentBalance;

// ---------------------------------------------------------------------------
console.log('=== PROOF 1 — ordinary expense near a card due date is ONE-SIDED ===');
{
  let data: AppData = {
    ...createEmptyAppData(),
    assets: [everyday('ev', 2000)],
    creditCards: [{ id: 'card1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 3, minimumPayment: 0, expectedMonthlyRepayment: 200 } as CreditCard],
  };
  // The card cycle is squarely within the candidate window of a 3 Aug expense.
  const { candidates } = deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 3), amount: 200 });
  assert('1a. the card repayment is NOT offered as a generic-expense candidate', !candidates.some((c) => c.label.startsWith('Visa')));

  // Record it as an ordinary everyday expense (the exact one-sided payload the
  // manual form builds), independent.
  data = applyNewTransaction(data, { type: 'expense', amount: 200, categoryId: 'c', date: iso(2026, 8, 3), paymentSource: 'everyday', targetAssetId: 'ev', balanceEffect: 'update', occurrenceResolution: { version: 1, state: 'independent' } } as any, 'tx-ord');
  assert('1b. everyday account fell by exactly $200 (2000 → 1800)', bal(data, 'ev') === 1800);
  assert('1c. the card balance is UNCHANGED (no phantom two-sided effect)', cardBal(data, 'card1') === 1000);
  const txn = data.transactions.find((t) => t.id === 'tx-ord')!;
  assert('1d. the record carries NO repayment metadata', txn.isRepayment === undefined && txn.creditCardId === undefined && txn.isLoanRepayment === undefined);
  // The card cycle remains eligible — nothing satisfied it.
  const cardOcc: OccurrenceDescriptor = { id: occurrenceIdForCard({ id: 'card1' }, D(2026, 8, 3)), sourceKind: 'card', sourceId: 'card1', isRepayment: true, expectedCents: 20000 };
  assert('1e. the card repayment cycle remains ELIGIBLE (unsatisfied by the ordinary expense)', resolveOccurrence(cardOcc, data.transactions).state === 'eligible');
}

// ---------------------------------------------------------------------------
console.log('\n=== PROOF 2 — dedicated card repayment is TWO-SIDED ===');
{
  let data: AppData = {
    ...createEmptyAppData(),
    assets: [everyday('ev', 2000)],
    creditCards: [{ id: 'card1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 25, minimumPayment: 0, expectedMonthlyRepayment: 200 } as CreditCard],
  };
  const r = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 200, paymentSource: 'everyday', targetAssetId: 'ev', expectedCardBalance: 1000, transactionId: 'tx-card', date: iso(2026, 8, 25), reminderOccurrenceDate: '2026-08-25' });
  assert('2a. dedicated card repayment applies', r.applied);
  if (r.applied) {
    data = r.data;
    assert('2b. everyday account fell by $200 (2000 → 1800)', bal(data, 'ev') === 1800);
    assert('2c. card owing fell by $200 (1000 → 800) — the SECOND side', cardBal(data, 'card1') === 800);
    const txn = data.transactions.find((t) => t.id === 'tx-card')!;
    const expectedId = buildOccurrenceId({ sourceKind: 'card', sourceId: 'card1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
    assert('2d. carries canonical card occurrence identity + repayment metadata', (txn.occurrenceResolution as any)?.occurrenceId === expectedId && txn.isRepayment === true);
    const cardOcc: OccurrenceDescriptor = { id: expectedId, sourceKind: 'card', sourceId: 'card1', isRepayment: true, expectedCents: 20000 };
    assert('2e. the card cycle is SATISFIED per the expected-payment contract ($200 of $200)', resolveOccurrence(cardOcc, data.transactions).state === 'satisfied');
    const rev = reverseCreditCardRepaymentTransaction(data, 'tx-card');
    assert('2f. dedicated reversal restores 2000 / 1000 exactly once', rev.applied && bal(rev.data, 'ev') === 2000 && cardBal(rev.data, 'card1') === 1000 && rev.data.transactions.every((t) => t.id !== 'tx-card'));
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== PROOF 3 — ordinary bill link is ONE-SIDED (no liability moves) ===');
{
  let data: AppData = {
    ...createEmptyAppData(),
    assets: [everyday('ev', 2000)],
    liabilities: [{ id: 'loan1', type: 'mortgage', label: 'Home Loan', currentBalance: 10000 } as Liability],
    recurringItems: [{ id: 'rent', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true } as RecurringItem],
  };
  const billOcc: OccurrenceDescriptor = { id: occurrenceIdForRecurringItem(data, data.recurringItems[0], D(2026, 8, 3)), sourceKind: 'bill', sourceId: 'rent', isRepayment: false };
  // Record a $200 everyday expense, then explicitly link it to the bill.
  data = applyNewTransaction(data, { type: 'expense', amount: 200, categoryId: 'c', date: iso(2026, 8, 3), paymentSource: 'everyday', targetAssetId: 'ev', balanceEffect: 'update' } as any, 'tx-bill');
  const linked = applyLinkTransactionToOccurrence(data, 'tx-bill', billOcc.id!, false);
  assert('3a. linking to an ordinary bill applies (no conflict)', linked.applied);
  if (linked.applied) {
    data = linked.data;
    assert('3b. spendable balance fell by exactly $200 once (2000 → 1800)', bal(data, 'ev') === 1800);
    assert('3c. NO liability moved (linking a bill is not a repayment)', liaBal(data, 'loan1') === 10000);
    assert('3d. the bill occurrence is now SATISFIED', resolveOccurrence(billOcc, data.transactions).state === 'satisfied');
    // Delete restores the balance and re-exposes the bill occurrence.
    const del = applyTransactionDelete(data, 'tx-bill', true);
    assert('3e. delete restores 2000 and re-exposes the bill occurrence (eligible)', bal(del, 'ev') === 2000 && resolveOccurrence(billOcc, del.transactions).state === 'eligible');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== PROOF 4 — loan repayment is TWO-SIDED (canonical loan identity) ===');
{
  let data: AppData = {
    ...createEmptyAppData(),
    assets: [everyday('ev', 2000)],
    liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 10000 } as Liability],
    recurringItems: [{ id: 'loanItem', type: 'expense', label: 'Personal Loan', amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 8, 25), isFixed: true, active: true, linkedLiabilityId: 'loan1' } as RecurringItem],
  };
  const r = confirmLoanRepaymentTransition(data, { recurringItemId: 'loanItem', liabilityId: 'loan1', expectedNextDueDate: iso(2026, 8, 25), amount: 1000, paymentSource: 'everyday', targetAssetId: 'ev', updateBalance: true, newBalance: 9000, expectedCurrentBalance: 10000, transactionId: 'tx-loan', date: iso(2026, 8, 25) });
  assert('4a. loan repayment applies', r.applied);
  if (r.applied) {
    data = r.data;
    assert('4b. funding fell by $1000 (2000 → 1000)', bal(data, 'ev') === 1000);
    assert('4c. loan owing fell by $1000 (10000 → 9000) — the SECOND side', liaBal(data, 'loan1') === 9000);
    const txn = data.transactions.find((t) => t.id === 'tx-loan')!;
    const expectedId = buildOccurrenceId({ sourceKind: 'loan', sourceId: 'loanItem', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
    assert('4d. carries canonical loan identity (oid1:loan:…) + isLoanRepayment', (txn.occurrenceResolution as any)?.occurrenceId === expectedId && txn.isLoanRepayment === true);
    const rev = reverseLoanRepaymentTransaction(data, 'tx-loan');
    assert('4e. reversal restores 2000 / 10000', rev.applied && bal(rev.data, 'ev') === 2000 && liaBal(rev.data, 'loan1') === 10000);
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== PROOF 5 — loan-subtype identity + accounting matrix ===');
{
  const subtypes: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];
  const ids: string[] = [];
  for (const subtype of subtypes) {
    let data: AppData = {
      ...createEmptyAppData(),
      assets: [everyday('ev', 2000)],
      liabilities: [{ id: `lia-${subtype}`, type: subtype, label: subtype, currentBalance: 10000 } as Liability],
      recurringItems: [{ id: `item-${subtype}`, type: 'expense', label: subtype, amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 8, 25), isFixed: true, active: true, linkedLiabilityId: `lia-${subtype}` } as RecurringItem],
    };
    const r = confirmLoanRepaymentTransition(data, { recurringItemId: `item-${subtype}`, liabilityId: `lia-${subtype}`, expectedNextDueDate: iso(2026, 8, 25), amount: 1000, paymentSource: 'everyday', targetAssetId: 'ev', updateBalance: true, newBalance: 9000, expectedCurrentBalance: 10000, transactionId: `tx-${subtype}`, date: iso(2026, 8, 25) });
    assert(`5.${subtype}-applies`, r.applied);
    if (r.applied) {
      data = r.data;
      const txn = data.transactions.find((t) => t.id === `tx-${subtype}`)!;
      const expectedId = buildOccurrenceId({ sourceKind: 'loan', sourceId: `item-${subtype}`, occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
      const idOk = (txn.occurrenceResolution as any)?.occurrenceId === expectedId;
      ids.push(expectedId);
      assert(`5.${subtype}-identity is oid1:loan:item-${subtype}:2026-08 (subtype is metadata, not identity)`, idOk);
      assert(`5.${subtype}-two-sided (funding 2000→1000, liability 10000→9000)`, bal(data, 'ev') === 1000 && liaBal(data, `lia-${subtype}`) === 9000);
      assert(`5.${subtype}-view-only correction: reversal restores both`, (() => { const rev = reverseLoanRepaymentTransaction(data, `tx-${subtype}`); return rev.applied && bal(rev.data, 'ev') === 2000 && liaBal(rev.data, `lia-${subtype}`) === 10000; })());
    }
  }
  assert('5z. all four loan subtypes produce DISTINCT canonical ids (no collision under the loan kind)', new Set(ids).size === subtypes.length);
}

// ---------------------------------------------------------------------------
console.log('\n=== PROOF 6 — BNPL repayment is TWO-SIDED (canonical bnpl identity) ===');
{
  let data: AppData = {
    ...createEmptyAppData(),
    assets: [everyday('ev', 2000)],
    liabilities: [{ id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 200 } as Liability],
    recurringItems: [{ id: 'bnItem', type: 'expense', label: 'Afterpay', amount: 50, frequency: 'fortnightly', nextDueDate: iso(2026, 8, 10), isFixed: false, active: true, linkedLiabilityId: 'bnpl1' } as RecurringItem],
  };
  const r = confirmBnplRepaymentTransition(data, { liabilityId: 'bnpl1', recurringItemId: 'bnItem', expectedNextDueDate: iso(2026, 8, 10), paymentSource: 'everyday', targetAssetId: 'ev', transactionId: 'tx-bn', date: iso(2026, 8, 10) });
  assert('6a. BNPL repayment applies', r.applied);
  if (r.applied) {
    data = r.data;
    assert('6b. funding fell by $50 (2000 → 1950)', bal(data, 'ev') === 1950);
    assert('6c. BNPL balance fell by $50 (200 → 150) — the SECOND side', liaBal(data, 'bnpl1') === 150);
    const txn = data.transactions.find((t) => t.id === 'tx-bn')!;
    const expectedId = buildOccurrenceId({ sourceKind: 'bnpl', sourceId: 'bnItem', occurrenceDate: D(2026, 8, 10), cadence: 'sub_monthly' });
    assert('6d. carries canonical bnpl identity (date-anchored)', (txn.occurrenceResolution as any)?.occurrenceId === expectedId);
    const rev = reverseBnplRepaymentTransaction(data, 'tx-bn');
    assert('6e. reversal restores 2000 / 200', rev.applied && bal(rev.data, 'ev') === 2000 && liaBal(rev.data, 'bnpl1') === 200);
  }
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
