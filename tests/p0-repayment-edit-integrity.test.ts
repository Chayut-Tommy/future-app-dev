// P0 — repayment edit-integrity (pure engine evidence).
//
// CLASSIFICATION: real-import / pure-function execution. Imports the ACTUAL
// production transaction engine from src/state/AppStateContext.tsx
// (applyTransactionUpdate / applyTransactionDelete and the dedicated
// confirm/reverse repayment transitions), exactly as the accepted
// tests/pass-2d-final-correction.test.ts and design5-wave4-device-corrections.test.ts
// already do. Run with: ./node_modules/.bin/tsx tests/p0-repayment-edit-integrity.test.ts
//
// PURPOSE: this file proves the FINANCIAL FACTS behind P0 — it does NOT test
// the QuickAddModal view-only lock itself (that is a rendered component test,
// tests/rendered/p0-repayment-edit-lock.render.test.tsx). It establishes:
//   1. ROOT CAUSE — the generic single-target update path
//      (applyTransactionUpdate) that P0's UI lock prevents a customer from
//      reaching does corrupt a card/loan repayment: it moves only the
//      funding-asset side and leaves the card/liability side stale.
//   2. SUPPORTED RECOVERY — the dedicated two-sided reversal restores BOTH
//      sides exactly, so "delete then record again" (the only path P0 leaves
//      open for changing a repayment) is financially correct to the cent.
// P0 changes NO engine behaviour; it only stops the UI from invoking (1).

import { createEmptyAppData } from '../src/lib/storage';
import {
  applyTransactionUpdate,
  confirmCreditCardRepaymentTransition,
  reverseCreditCardRepaymentTransaction,
  confirmLoanRepaymentTransition,
  reverseLoanRepaymentTransaction,
} from '../src/state/AppStateContext';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
function dISO(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day).toISOString();
}
const cents = (v: number) => Math.round(v * 100);

// ---------------------------------------------------------------------------
console.log('=== SECTION 1: Credit-card repayment ($1,500 funding / $1,000 owing) ===');
{
  let data = createEmptyAppData();
  data = {
    ...data,
    assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1500 } as Asset],
    creditCards: [{ id: 'card1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 0 } as CreditCard],
  };

  const confirm = confirmCreditCardRepaymentTransition(data, {
    creditCardId: 'card1',
    amount: 200,
    paymentSource: 'cash',
    expectedCardBalance: 1000,
    transactionId: 'ccr1',
    date: dISO('2026-08-13'),
  });
  assert('1a. $200 repayment applies', confirm.applied);
  if (!confirm.applied) throw new Error('cannot continue section 1');

  const cashAfter = confirm.data.assets.find((a) => a.id === 'cash1')!.currentValue;
  const cardAfter = confirm.data.creditCards.find((c) => c.id === 'card1')!.currentBalance;
  assert('1b. funding account reduced to $1,300.00', cents(cashAfter) === cents(1300));
  assert('1c. card balance owing reduced to $800.00', cents(cardAfter) === cents(800));

  // ROOT CAUSE — the generic edit path P0 blocks in the UI. Change the amount
  // $200 -> $250 via applyTransactionUpdate (what handleSave would have run).
  const corrupted = applyTransactionUpdate(confirm.data, 'ccr1', { amount: 250 });
  const cashCorrupt = corrupted.assets.find((a) => a.id === 'cash1')!.currentValue;
  const cardCorrupt = corrupted.creditCards.find((c) => c.id === 'card1')!.currentBalance;
  // The funding side moved (single-target reverse + reapply) ...
  assert('1d. generic edit MOVES the funding side (now $1,250.00)', cents(cashCorrupt) === cents(1250));
  // ... but the card side is left STALE at $800 instead of the correct $750.
  assert('1e. generic edit LEAVES the card side stale at $800.00 (should be $750.00) — the exact corruption P0 prevents', cents(cardCorrupt) === cents(800));
  assert('1f. the result is internally inconsistent (funding says $250 repaid, card says $200)', cents(cardCorrupt) !== cents(750));

  // SUPPORTED RECOVERY — delete (dedicated two-sided reversal) restores BOTH.
  const reversed = reverseCreditCardRepaymentTransaction(confirm.data, 'ccr1');
  assert('1g. dedicated reversal applies', reversed.applied);
  if (reversed.applied) {
    const cashR = reversed.data.assets.find((a) => a.id === 'cash1')!.currentValue;
    const cardR = reversed.data.creditCards.find((c) => c.id === 'card1')!.currentBalance;
    assert('1h. reversal restores funding to $1,500.00', cents(cashR) === cents(1500));
    assert('1i. reversal restores card to $1,000.00', cents(cardR) === cents(1000));

    // Re-record the intended $250 through the supported flow — both sides correct.
    const reRecord = confirmCreditCardRepaymentTransition(reversed.data, {
      creditCardId: 'card1',
      amount: 250,
      paymentSource: 'cash',
      expectedCardBalance: 1000,
      transactionId: 'ccr2',
      date: dISO('2026-08-13'),
    });
    assert('1j. re-recording $250 applies', reRecord.applied);
    if (reRecord.applied) {
      const cash2 = reRecord.data.assets.find((a) => a.id === 'cash1')!.currentValue;
      const card2 = reRecord.data.creditCards.find((c) => c.id === 'card1')!.currentBalance;
      assert('1k. funding correctly $1,250.00 after re-record', cents(cash2) === cents(1250));
      assert('1l. card correctly $750.00 after re-record (both sides consistent)', cents(card2) === cents(750));
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== SECTION 2: Loan/mortgage repayment ($2,000 funding / $10,000 loan) ===');
{
  let data = createEmptyAppData();
  data = {
    ...data,
    assets: [{ id: 'cash2', type: 'cash', label: 'Cash', currentValue: 2000 } as Asset],
    liabilities: [{ id: 'loan1', type: 'mortgage', label: 'Home Loan', currentBalance: 10000 } as Liability],
    recurringItems: [
      {
        id: 'ri-loan',
        type: 'expense',
        label: 'Home Loan Repayment',
        amount: 1000,
        frequency: 'monthly',
        nextDueDate: dISO('2026-08-25'),
        isFixed: true,
        active: true,
        linkedLiabilityId: 'loan1',
      } as RecurringItem,
    ],
  };

  const confirm = confirmLoanRepaymentTransition(data, {
    recurringItemId: 'ri-loan',
    liabilityId: 'loan1',
    expectedNextDueDate: dISO('2026-08-25'),
    amount: 1000,
    paymentSource: 'cash',
    updateBalance: true,
    newBalance: 9000,
    expectedCurrentBalance: 10000,
    transactionId: 'lr1',
    date: dISO('2026-08-13'),
  });
  assert('2a. $1,000 loan repayment (principal $1,000) applies', confirm.applied);
  if (!confirm.applied) throw new Error('cannot continue section 2');

  const cashAfter = confirm.data.assets.find((a) => a.id === 'cash2')!.currentValue;
  const loanAfter = confirm.data.liabilities.find((l) => l.id === 'loan1')!.currentBalance;
  assert('2b. funding account reduced to $1,000.00', cents(cashAfter) === cents(1000));
  assert('2c. loan balance reduced to $9,000.00', cents(loanAfter) === cents(9000));

  // ROOT CAUSE — generic edit of the total paid $1,000 -> $1,200.
  const corrupted = applyTransactionUpdate(confirm.data, 'lr1', { amount: 1200 });
  const cashCorrupt = corrupted.assets.find((a) => a.id === 'cash2')!.currentValue;
  const loanCorrupt = corrupted.liabilities.find((l) => l.id === 'loan1')!.currentBalance;
  assert('2d. generic edit MOVES the funding side (now $800.00)', cents(cashCorrupt) === cents(800));
  assert('2e. generic edit LEAVES the loan side stale at $9,000.00 — the corruption P0 prevents', cents(loanCorrupt) === cents(9000));

  // SUPPORTED RECOVERY — dedicated reversal restores both sides exactly.
  const reversed = reverseLoanRepaymentTransaction(confirm.data, 'lr1');
  assert('2f. dedicated loan reversal applies', reversed.applied);
  if (reversed.applied) {
    const cashR = reversed.data.assets.find((a) => a.id === 'cash2')!.currentValue;
    const loanR = reversed.data.liabilities.find((l) => l.id === 'loan1')!.currentBalance;
    assert('2g. reversal restores funding to $2,000.00', cents(cashR) === cents(2000));
    assert('2h. reversal restores loan to $10,000.00', cents(loanR) === cents(10000));
  }
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
