// A1 — canonical occurrence identity stamped by every confirmation family (pure).
// Real-import of the ACTUAL confirmation transitions. Run:
//   ./node_modules/.bin/tsx tests/a1-confirmation-identity.test.ts

import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import {
  confirmRecurringOccurrenceTransition,
  confirmBnplRepaymentTransition,
  confirmLoanRepaymentTransition,
  confirmCreditCardRepaymentTransition,
} from '../src/state/AppStateContext';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';
import { classifyTransaction } from '../src/lib/calculations/occurrenceResolution';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const dISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};
function withCash(data: AppData, amount = 5000): AppData {
  return { ...data, assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: amount } as Asset] };
}

console.log('=== income confirmation (previously had NO durable occurrence identity) ===');
{
  let data = withCash(createEmptyAppData());
  data = { ...data, recurringItems: [{ id: 'inc1', type: 'income', label: 'Salary', amount: 2000, frequency: 'monthly', nextDueDate: dISO('2026-08-25'), isFixed: false, active: true } as RecurringItem] };
  const r = confirmRecurringOccurrenceTransition(data, { recurringItemId: 'inc1', expectedNextDueDate: dISO('2026-08-25'), transactionId: 'tx-inc', date: dISO('2026-08-25'), targetAssetId: 'cash1' });
  assert('1a. income confirm applies', r.applied);
  if (r.applied) {
    const txn = r.data.transactions.find((t) => t.id === 'tx-inc')!;
    const expected = buildOccurrenceId({ sourceKind: 'income', sourceId: 'inc1', occurrenceDate: new Date(2026, 7, 25), cadence: 'monthly' });
    assert('1b. income now carries a linked canonical occurrence id (oid1:income:…:2026-08)', txn.occurrenceResolution?.state === 'linked' && (txn.occurrenceResolution as any).occurrenceId === expected);
    assert('1c. income still carries NO recurringOccurrenceKey (legacy behaviour preserved)', txn.recurringOccurrenceKey === undefined);
    assert('1d. balance-effect snapshot preserved', !!txn.appliedBalanceEffect);
    assert('1e. classifies linked', classifyTransaction(txn).classification === 'linked');
  }
}

console.log('\n=== bill confirmation (monthly + weekly) ===');
{
  let data = withCash(createEmptyAppData());
  data = { ...data, recurringItems: [{ id: 'bill1', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: dISO('2026-08-03'), isFixed: true, active: true } as RecurringItem] };
  const r = confirmRecurringOccurrenceTransition(data, { recurringItemId: 'bill1', expectedNextDueDate: dISO('2026-08-03'), paymentSource: 'cash', transactionId: 'tx-bill', date: dISO('2026-08-03') });
  assert('2a. monthly bill confirm applies', r.applied);
  if (r.applied) {
    const txn = r.data.transactions.find((t) => t.id === 'tx-bill')!;
    const expected = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'bill1', occurrenceDate: new Date(2026, 7, 3), cadence: 'monthly' });
    assert('2b. monthly bill linked to oid1:bill:…:2026-08', (txn.occurrenceResolution as any)?.occurrenceId === expected);
    assert('2c. legacy recurringOccurrenceKey preserved', txn.recurringOccurrenceKey === `bill1:${dISO('2026-08-03')}`);
  }
  let wdata = withCash(createEmptyAppData());
  wdata = { ...wdata, recurringItems: [{ id: 'gym', type: 'expense', label: 'Gym', amount: 20, frequency: 'weekly', nextDueDate: dISO('2026-08-14'), isFixed: true, active: true } as RecurringItem] };
  const wr = confirmRecurringOccurrenceTransition(wdata, { recurringItemId: 'gym', expectedNextDueDate: dISO('2026-08-14'), paymentSource: 'cash', transactionId: 'tx-gym', date: dISO('2026-08-14') });
  if (wr.applied) {
    const txn = wr.data.transactions.find((t) => t.id === 'tx-gym')!;
    const expected = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'gym', occurrenceDate: new Date(2026, 7, 14), cadence: 'sub_monthly' });
    assert('2d. weekly bill linked to a DATE-anchored id (oid1:bill:…:2026-08-14)', (txn.occurrenceResolution as any)?.occurrenceId === expected);
  }
}

console.log('\n=== BNPL confirmation ===');
{
  let data = withCash(createEmptyAppData(), 500);
  data = {
    ...data,
    liabilities: [{ id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 200 } as Liability],
    recurringItems: [{ id: 'bnItem', type: 'expense', label: 'Afterpay', amount: 50, frequency: 'fortnightly', nextDueDate: dISO('2026-08-10'), isFixed: false, active: true, linkedLiabilityId: 'bnpl1' } as RecurringItem],
  };
  const r = confirmBnplRepaymentTransition(data, { liabilityId: 'bnpl1', recurringItemId: 'bnItem', expectedNextDueDate: dISO('2026-08-10'), paymentSource: 'cash', transactionId: 'tx-bn', date: dISO('2026-08-10') });
  assert('3a. BNPL confirm applies', r.applied);
  if (r.applied) {
    const txn = r.data.transactions.find((t) => t.id === 'tx-bn')!;
    const expected = buildOccurrenceId({ sourceKind: 'bnpl', sourceId: 'bnItem', occurrenceDate: new Date(2026, 7, 10), cadence: 'sub_monthly' });
    assert('3b. BNPL linked to oid1:bnpl:… (date-anchored, fortnightly)', (txn.occurrenceResolution as any)?.occurrenceId === expected);
    assert('3c. legacy recurringOccurrenceKey preserved', txn.recurringOccurrenceKey === `bnItem:${dISO('2026-08-10')}`);
  }
}

console.log('\n=== loan / mortgage confirmation ===');
{
  let data = withCash(createEmptyAppData(), 3000);
  data = {
    ...data,
    liabilities: [{ id: 'loan1', type: 'mortgage', label: 'Home Loan', currentBalance: 10000 } as Liability],
    recurringItems: [{ id: 'loanItem', type: 'expense', label: 'Home Loan', amount: 1000, frequency: 'monthly', nextDueDate: dISO('2026-08-25'), isFixed: true, active: true, linkedLiabilityId: 'loan1' } as RecurringItem],
  };
  const r = confirmLoanRepaymentTransition(data, { recurringItemId: 'loanItem', liabilityId: 'loan1', expectedNextDueDate: dISO('2026-08-25'), amount: 1000, paymentSource: 'cash', updateBalance: true, newBalance: 9000, expectedCurrentBalance: 10000, transactionId: 'tx-loan', date: dISO('2026-08-25') });
  assert('4a. loan confirm applies', r.applied);
  if (r.applied) {
    const txn = r.data.transactions.find((t) => t.id === 'tx-loan')!;
    const expected = buildOccurrenceId({ sourceKind: 'loan', sourceId: 'loanItem', occurrenceDate: new Date(2026, 7, 25), cadence: 'monthly' });
    assert('4b. mortgage linked to the canonical loan kind (oid1:loan:…:2026-08)', (txn.occurrenceResolution as any)?.occurrenceId === expected);
    assert('4c. isLoanRepayment + principalAmount preserved', txn.isLoanRepayment === true && txn.principalAmount === 1000);
    assert('4d. legacy recurringOccurrenceKey preserved', txn.recurringOccurrenceKey === `loanItem:${dISO('2026-08-25')}`);
  }
}

console.log('\n=== credit-card confirmation ===');
{
  let data = withCash(createEmptyAppData(), 1500);
  data = { ...data, creditCards: [{ id: 'card1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 1000, dueDay: 25, minimumPayment: 0 } as CreditCard] };
  const r = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 200, paymentSource: 'cash', expectedCardBalance: 1000, transactionId: 'tx-card', date: dISO('2026-08-25'), reminderOccurrenceDate: '2026-08-25' });
  assert('5a. card confirm applies', r.applied);
  if (r.applied) {
    const txn = r.data.transactions.find((t) => t.id === 'tx-card')!;
    const expected = buildOccurrenceId({ sourceKind: 'card', sourceId: 'card1', occurrenceDate: new Date(2026, 7, 25), cadence: 'monthly' });
    assert('5b. card linked to oid1:card:…:2026-08 (billing-month keyed)', (txn.occurrenceResolution as any)?.occurrenceId === expected);
    assert('5c. isRepayment + reminderOccurrenceCompleted preserved', txn.isRepayment === true && txn.reminderOccurrenceCompleted === '2026-08-25');
    assert('5d. classifies linked', classifyTransaction(txn).classification === 'linked');
  }
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
