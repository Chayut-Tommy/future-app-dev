// Pass 2D — final device-test payment-integrity correction round.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): every section imports and directly executes the
//   actual production functions — confirmCreditCardRepaymentTransition,
//   reverseCreditCardRepaymentTransaction, confirmLoanRepaymentTransition,
//   reverseLoanRepaymentTransaction, isLatestLoanRepaymentTransaction
//   (src/state/AppStateContext.tsx), computeTopReminder (reminders.ts),
//   computeSafeToSpend (safeToSpend.ts), computeMonthToDateActivity /
//   computeThisMonthRecordedSummary (monthlySummary.ts), computeCategoryDeltas
//   / computeSpendingInsights (spendingInsights.ts), computeLuluScore
//   (luluScore.ts), selectSafeToSpendPresentation (safeToSpendPresentation.ts),
//   selectBriefingTiles (briefingTiles.ts), resolveEligibleBillPaymentSources
//   (billPaymentSources.ts).
// - Structural (regex/string match against source text): a few UI-copy and
//   component-wiring claims that can't be exercised via real import because
//   the source is React Native TSX (Flow syntax) — explicitly labelled at
//   each site below.
//
// Run with: npx tsx tests/pass-2d-final-correction.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { computeTopReminder } from '../src/lib/calculations/reminders';
import {
  confirmCreditCardRepaymentTransition,
  reverseCreditCardRepaymentTransaction,
  confirmLoanRepaymentTransition,
  reverseLoanRepaymentTransaction,
  isLatestLoanRepaymentTransaction,
  confirmRecurringOccurrenceTransition,
  ConfirmCreditCardRepaymentInput,
  ConfirmLoanRepaymentInput,
} from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMonthToDateActivity, computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeCategoryDeltas, computeSpendingInsights } from '../src/lib/calculations/spendingInsights';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { selectBriefingTiles } from '../src/lib/calculations/briefingTiles';
import { resolveEligibleBillPaymentSources } from '../src/lib/calculations/billPaymentSources';
import type { AppData, CreditCard, Liability, RecurringItem, Asset } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function dISO(iso: string): string {
  return d(iso).toISOString();
}

function baseData(): AppData {
  return createEmptyAppData();
}
function withCash(data: AppData, amount: number, id = 'cash1'): AppData {
  return { ...data, assets: [...data.assets, { id, type: 'cash', label: 'Cash', currentValue: amount }] };
}
function withEveryday(data: AppData, amount: number, id = 'ed1', includeInMoney = true): AppData {
  return {
    ...data,
    assets: [...data.assets, { id, type: 'everyday', label: 'Everyday', currentValue: amount, includeInMoneyCalculations: includeInMoney }],
  };
}
function withCard(data: AppData, patch: Partial<CreditCard> = {}): AppData {
  const card: CreditCard = { id: 'card1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 0, ...patch };
  return { ...data, creditCards: [...data.creditCards, card] };
}

console.log('=== SECTION 1: Credit-card Reminder occurrence contract ===');
{
  // Fixed "today" so daysUntilDue/occurrenceDate math is deterministic.
  const today = new Date(2026, 7, 13); // 13 Aug 2026
  let data = baseData();
  data = withCash(data, 2000);
  data = withCard(data, { currentBalance: 1000, dueDay: 15, minimumPayment: 40 });

  const reminder1 = computeTopReminder(data, today);
  assert('1a. card_due_soon reminder fires for a card due within 3 days with a positive balance', reminder1?.kind === 'card_due_soon');
  assert('1b. reminder carries a real occurrenceDate (date-key derivable)', typeof reminder1?.occurrenceDate === 'string');
  const occurrenceKey = reminder1!.occurrenceDate!.slice(0, 10);

  const input: ConfirmCreditCardRepaymentInput = {
    creditCardId: 'card1',
    amount: 200,
    paymentSource: 'cash',
    expectedCardBalance: 1000,
    reminderOccurrenceDate: occurrenceKey,
    transactionId: 'txn1',
    date: dISO('2026-08-13'),
  };
  const confirm1 = confirmCreditCardRepaymentTransition(data, input);
  assert('1c. reminder-initiated PARTIAL repayment applies successfully', confirm1.applied);
  if (confirm1.applied) {
    const card = confirm1.data.creditCards.find((c) => c.id === 'card1')!;
    assert('1d. card balance reduced by exactly the partial payment', card.currentBalance === 800);
    assert('1e. handledReminderOccurrenceDate stamped with the exact occurrence key', card.handledReminderOccurrenceDate === occurrenceKey);

    const reminderAfter = computeTopReminder(confirm1.data, today);
    assert('1f. the SAME card_due_soon occurrence never re-surfaces after a partial payment (occurrence removed)', reminderAfter === null || reminderAfter.kind !== 'card_due_soon');

    // Reversal restores the Reminder occurrence.
    const txn = confirm1.data.transactions.find((t) => t.id === 'txn1')!;
    assert('1g. transaction carries reminderOccurrenceCompleted matching the stamp', txn.reminderOccurrenceCompleted === occurrenceKey);
    const reversed1 = reverseCreditCardRepaymentTransaction(confirm1.data, 'txn1');
    assert('1h. reversal applies successfully', reversed1.applied);
    if (reversed1.applied) {
      const cardRestored = reversed1.data.creditCards.find((c) => c.id === 'card1')!;
      assert('1i. reversal restores the card balance exactly', cardRestored.currentBalance === 1000);
      assert('1j. reversal clears handledReminderOccurrenceDate', cardRestored.handledReminderOccurrenceDate === undefined);
      const reminderRestored = computeTopReminder(reversed1.data, today);
      assert('1k. reversal restores the Reminder for that same occurrence', reminderRestored?.kind === 'card_due_soon');
    }
  }

  // A repayment recorded WITHOUT reminderOccurrenceDate (simulating any future
  // non-Reminder entry point) must never touch occurrence-handled state.
  const inputNoOccurrence: ConfirmCreditCardRepaymentInput = {
    creditCardId: 'card1',
    amount: 100,
    paymentSource: 'cash',
    expectedCardBalance: 1000,
    transactionId: 'txn2',
    date: dISO('2026-08-13'),
  };
  const confirm2 = confirmCreditCardRepaymentTransition(data, inputNoOccurrence);
  assert('1l. repayment without reminderOccurrenceDate applies', confirm2.applied);
  if (confirm2.applied) {
    const card = confirm2.data.creditCards.find((c) => c.id === 'card1')!;
    assert('1m. repayment without reminderOccurrenceDate never sets handledReminderOccurrenceDate', card.handledReminderOccurrenceDate === undefined);
    const reminderStill = computeTopReminder(confirm2.data, today);
    assert('1n. the occurrence remains open — a repayment "entered elsewhere" never silently completes it', reminderStill?.kind === 'card_due_soon');
  }

  // Duplicate-tap protection (staleness) — unchanged, re-proven with the
  // reminderOccurrenceDate field present. Mirrors the real double-tap
  // architecture: the second call reads the first call's already-committed
  // result (dataRef.current), so its stale `expectedCardBalance` (1000,
  // from `input`) no longer matches.
  const secondTap = confirmCreditCardRepaymentTransition(confirm1.applied ? confirm1.data : data, input);
  assert('1o. a second rapid tap with a now-stale expectedCardBalance is rejected', secondTap.applied === false && (!secondTap.applied ? secondTap.reason === 'stale' : true));
}

console.log('=== SECTION 2: Mortgage/personal-loan/car-loan repayment engine ===');
{
  let data = baseData();
  data = withCash(data, 5000);
  const liabilityId = 'mortgage1';
  const recurringItemId = 'mrec1';
  data = {
    ...data,
    liabilities: [{ id: liabilityId, type: 'mortgage', label: 'Home Loan', currentBalance: 420000 }],
    recurringItems: [
      { id: recurringItemId, type: 'expense', label: 'Home Loan repayment', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true, linkedLiabilityId: liabilityId },
    ],
  };

  // 2a. Repayment WITHOUT balance update — ordinary bill-like effect only.
  const inputNoUpdate: ConfirmLoanRepaymentInput = {
    recurringItemId,
    liabilityId,
    expectedNextDueDate: dISO('2026-08-15'),
    amount: 1500,
    paymentSource: 'cash',
    updateBalance: false,
    expectedCurrentBalance: 420000,
    transactionId: 'lt1',
    date: dISO('2026-08-15'),
  };
  const r2a = confirmLoanRepaymentTransition(data, inputNoUpdate);
  assert('2a. loan repayment without balance update applies', r2a.applied);
  if (r2a.applied) {
    const cash = r2a.data.assets.find((a) => a.id === 'cash1')!;
    assert('2a-i. funding cash reduced by the full amount paid', cash.currentValue === 3500);
    const liab = r2a.data.liabilities.find((l) => l.id === liabilityId)!;
    assert('2a-ii. recorded loan balance is UNCHANGED (no principal/interest invented)', liab.currentBalance === 420000);
    const item = r2a.data.recurringItems.find((r) => r.id === recurringItemId)!;
    assert('2a-iii. occurrence schedule advanced past this due date', new Date(item.nextDueDate).getTime() > new Date('2026-08-15').getTime());
    const txn = r2a.data.transactions.find((t) => t.id === 'lt1')!;
    assert('2a-iv. transaction carries no principalAmount (unknown split)', txn.principalAmount === undefined);
  }

  // 2b. Repayment WITH balance update — known principal/interest split.
  const inputUpdate: ConfirmLoanRepaymentInput = {
    recurringItemId,
    liabilityId,
    expectedNextDueDate: dISO('2026-08-15'),
    amount: 1500,
    paymentSource: 'cash',
    updateBalance: true,
    newBalance: 419300,
    expectedCurrentBalance: 420000,
    transactionId: 'lt2',
    date: dISO('2026-08-15'),
  };
  const r2b = confirmLoanRepaymentTransition(data, inputUpdate);
  assert('2b. loan repayment with balance update applies', r2b.applied);
  if (r2b.applied) {
    const liab = r2b.data.liabilities.find((l) => l.id === liabilityId)!;
    assert('2b-i. recorded balance reduced by the derived principal ($700)', liab.currentBalance === 419300);
    const txn = r2b.data.transactions.find((t) => t.id === 'lt2')!;
    assert('2b-ii. transaction carries the exact known principal ($700)', txn.principalAmount === 700);
    assert('2b-iii. net worth movement equals only the known interest/fees portion (-$1500 asset, -$700 liability => -$800 net)', (r2b.data.assets.find((a)=>a.id==='cash1')!.currentValue - data.assets.find((a)=>a.id==='cash1')!.currentValue) === -1500 && (liab.currentBalance - 420000) === -700);
  }

  // 2c. Interest-only payment — same before/after balance, principal = $0 (KNOWN, not unknown).
  const inputInterestOnly: ConfirmLoanRepaymentInput = {
    recurringItemId,
    liabilityId,
    expectedNextDueDate: dISO('2026-08-15'),
    amount: 1500,
    paymentSource: 'cash',
    updateBalance: true,
    newBalance: 420000,
    expectedCurrentBalance: 420000,
    transactionId: 'lt3',
    date: dISO('2026-08-15'),
  };
  const r2c = confirmLoanRepaymentTransition(data, inputInterestOnly);
  assert('2c. interest-only payment (same before/after balance) applies', r2c.applied);
  if (r2c.applied) {
    const txn = r2c.data.transactions.find((t) => t.id === 'lt3')!;
    assert('2c-i. principalAmount is KNOWN $0, distinct from undefined/unknown', txn.principalAmount === 0);
    const liab = r2c.data.liabilities.find((l) => l.id === liabilityId)!;
    assert('2c-ii. recorded balance genuinely unchanged', liab.currentBalance === 420000);
  }

  // 2d. Derived principal exceeding the amount paid is rejected.
  const inputBadPrincipal: ConfirmLoanRepaymentInput = {
    recurringItemId,
    liabilityId,
    expectedNextDueDate: dISO('2026-08-15'),
    amount: 500,
    paymentSource: 'cash',
    updateBalance: true,
    newBalance: 418000, // implies $2000 principal reduction on a $500 payment
    expectedCurrentBalance: 420000,
    transactionId: 'lt4',
    date: dISO('2026-08-15'),
  };
  const r2d = confirmLoanRepaymentTransition(data, inputBadPrincipal);
  assert('2d. derived principal greater than amount paid is rejected', r2d.applied === false && (!r2d.applied ? r2d.reason === 'invalid_principal' : true));

  // 2e. New balance above old balance is rejected (no capitalised-interest support).
  const inputBadBalance: ConfirmLoanRepaymentInput = {
    recurringItemId,
    liabilityId,
    expectedNextDueDate: dISO('2026-08-15'),
    amount: 500,
    paymentSource: 'cash',
    updateBalance: true,
    newBalance: 425000,
    expectedCurrentBalance: 420000,
    transactionId: 'lt5',
    date: dISO('2026-08-15'),
  };
  const r2e = confirmLoanRepaymentTransition(data, inputBadBalance);
  assert('2e. a new balance ABOVE the old recorded balance is rejected', r2e.applied === false && (!r2e.applied ? r2e.reason === 'invalid_balance' : true));

  // 2f. Stale liability balance rejected.
  const inputStale: ConfirmLoanRepaymentInput = { ...inputNoUpdate, expectedCurrentBalance: 419999, transactionId: 'lt6' };
  const r2f = confirmLoanRepaymentTransition(data, inputStale);
  assert('2f. stale expectedCurrentBalance rejected', r2f.applied === false && (!r2f.applied ? r2f.reason === 'stale_balance' : true));

  // 2g. Duplicate-tap: chaining the real double-tap architecture.
  const first2g = confirmLoanRepaymentTransition(data, { ...inputNoUpdate, transactionId: 'lt7' });
  assert('2g-setup. first confirmation applies', first2g.applied);
  const second2g = confirmLoanRepaymentTransition(first2g.applied ? first2g.data : data, { ...inputNoUpdate, transactionId: 'lt8' });
  assert('2g. a second rapid confirmation (occurrence already advanced) is rejected as stale', second2g.applied === false && (!second2g.applied ? second2g.reason === 'stale' : true));

  // 2h. Reversal — WITH balance update — restores both source and liability, and the Reminder occurrence.
  if (r2b.applied) {
    const reversed2h = reverseLoanRepaymentTransaction(r2b.data, 'lt2');
    assert('2h. reversal of a balance-updating repayment applies', reversed2h.applied);
    if (reversed2h.applied) {
      const cash = reversed2h.data.assets.find((a) => a.id === 'cash1')!;
      assert('2h-i. funding cash restored exactly', cash.currentValue === 5000);
      const liab = reversed2h.data.liabilities.find((l) => l.id === liabilityId)!;
      assert('2h-ii. liability balance restored exactly', liab.currentBalance === 420000);
      const item = reversed2h.data.recurringItems.find((r) => r.id === recurringItemId)!;
      assert('2h-iii. Reminder occurrence restored (nextDueDate rolled back)', new Date(item.nextDueDate).getTime() === d('2026-08-15').getTime());
    }
  }

  // 2i. Reversal — WITHOUT balance update — restores only the funding source, leaves recorded balance untouched.
  if (r2a.applied) {
    const reversed2i = reverseLoanRepaymentTransaction(r2a.data, 'lt1');
    assert('2i. reversal of a non-balance-updating repayment applies', reversed2i.applied);
    if (reversed2i.applied) {
      const cash = reversed2i.data.assets.find((a) => a.id === 'cash1')!;
      assert('2i-i. funding cash restored exactly', cash.currentValue === 5000);
      const liab = reversed2i.data.liabilities.find((l) => l.id === liabilityId)!;
      assert('2i-ii. recorded loan balance stays exactly as it was (never touched by this repayment)', liab.currentBalance === 420000);
    }
  }

  // 2j. "Only the latest is safe to reverse" — two sequential repayments, earlier one blocked.
  {
    let seqData = baseData();
    seqData = withCash(seqData, 10000);
    seqData = {
      ...seqData,
      liabilities: [{ id: 'l2', type: 'car_loan', label: 'Car Loan', currentBalance: 20000 }],
      recurringItems: [{ id: 'r2', type: 'expense', label: 'Car Loan repayment', amount: 500, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: true, active: true, linkedLiabilityId: 'l2' }],
    };
    const first = confirmLoanRepaymentTransition(seqData, { recurringItemId: 'r2', liabilityId: 'l2', expectedNextDueDate: dISO('2026-08-01'), amount: 500, paymentSource: 'cash', updateBalance: true, newBalance: 19600, expectedCurrentBalance: 20000, transactionId: 'seq1', date: dISO('2026-08-01') });
    assert('2j-setup1. first sequential repayment applies', first.applied);
    if (first.applied) {
      const itemAfterFirst = first.data.recurringItems.find((r) => r.id === 'r2')!;
      const second = confirmLoanRepaymentTransition(first.data, { recurringItemId: 'r2', liabilityId: 'l2', expectedNextDueDate: itemAfterFirst.nextDueDate, amount: 500, paymentSource: 'cash', updateBalance: true, newBalance: 19100, expectedCurrentBalance: 19600, transactionId: 'seq2', date: dISO('2026-09-01') });
      assert('2j-setup2. second sequential repayment applies', second.applied);
      if (second.applied) {
        assert('2j-i. the FIRST (earlier) repayment is no longer the latest', isLatestLoanRepaymentTransaction(second.data, 'seq1') === false);
        assert('2j-ii. the SECOND (latest) repayment is correctly identified as latest', isLatestLoanRepaymentTransaction(second.data, 'seq2') === true);
        const reverseEarlier = reverseLoanRepaymentTransaction(second.data, 'seq1');
        assert('2j-iii. reversing the earlier (non-latest) repayment is rejected', reverseEarlier.applied === false && (!reverseEarlier.applied ? reverseEarlier.reason === 'not_latest' : true));
      }
    }
  }
}

console.log('=== SECTION 3: Credit-card overpayment cap ===');
{
  let data = baseData();
  data = withCash(data, 5000);
  data = withCard(data, { currentBalance: 500 });

  const overpay = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 500.01, paymentSource: 'cash', expectedCardBalance: 500, transactionId: 't1', date: dISO('2026-08-13') });
  assert('3a. an amount exceeding the current balance is rejected', overpay.applied === false && (!overpay.applied ? overpay.reason === 'exceeds_balance' : true));

  const exact = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 500, paymentSource: 'cash', expectedCardBalance: 500, transactionId: 't2', date: dISO('2026-08-13') });
  assert('3b. an amount exactly equal to the current balance is accepted', exact.applied);
  if (exact.applied) {
    const card = exact.data.creditCards.find((c) => c.id === 'card1')!;
    assert('3c. card balance reaches exactly $0, never negative', card.currentBalance === 0);
  }
}

console.log('=== SECTION 4: Factual credit-card + loan Reminder copy (real function, exact strings) ===');
{
  const today = new Date(2026, 7, 13);
  function cardReminderBody(patch: Partial<CreditCard>): string {
    let data = baseData();
    data = withCard(data, { currentBalance: 1000, dueDay: 15, minimumPayment: 0, ...patch });
    const r = computeTopReminder(data, today);
    return r?.body ?? '';
  }

  const bothBody = cardReminderBody({ minimumPayment: 40, expectedMonthlyRepayment: 120 });
  assert('4a. [minimum + expected both present] no "Pay $" framing', !bothBody.includes('Pay $'));
  assert('4a-i. states "Current recorded balance"', bothBody.includes('Current recorded balance: $1,000'));
  assert('4a-ii. states "Recorded minimum payment"', bothBody.includes('Recorded minimum payment: $40'));
  assert('4a-iii. states "Your expected monthly payment"', bothBody.includes('Your expected monthly payment: $120'));
  assert('4a-iv. never says "amount due"/"statement balance"/"payment required"', !/amount due|statement balance|payment required/i.test(bothBody));

  const minOnlyBody = cardReminderBody({ minimumPayment: 40 });
  assert('4b. [minimum only] includes minimum line', minOnlyBody.includes('Recorded minimum payment: $40'));
  assert('4b-i. [minimum only] never includes an expected-payment line', !minOnlyBody.includes('Your expected monthly payment'));

  const expectedOnlyBody = cardReminderBody({ expectedMonthlyRepayment: 120 });
  assert('4c. [expected only] includes expected-payment line', expectedOnlyBody.includes('Your expected monthly payment: $120'));
  assert('4c-i. [expected only] never includes a minimum-payment line', !expectedOnlyBody.includes('Recorded minimum payment'));

  const neitherBody = cardReminderBody({});
  assert('4d. [neither present] never includes minimum or expected-payment lines', !neitherBody.includes('Recorded minimum payment') && !neitherBody.includes('Your expected monthly payment'));
  assert('4d-i. [neither present] still states the recorded balance factually', neitherBody.includes('Current recorded balance: $1,000'));

  // 4e. Zero-balance card — reminder never fires at all (existing, confirmed-unchanged gate).
  let zeroData = baseData();
  zeroData = withCard(zeroData, { currentBalance: 0, dueDay: 15 });
  const zeroReminder = computeTopReminder(zeroData, today);
  assert('4e. a card at $0 balance never produces a card_due_soon reminder', zeroReminder === null || zeroReminder.kind !== 'card_due_soon');

  // 4f. Loan reminder — factual "Did you pay" pattern, no amount claim.
  let loanData = baseData();
  loanData = {
    ...loanData,
    liabilities: [{ id: 'lm1', type: 'mortgage', label: 'Home Loan', currentBalance: 400000 }],
    recurringItems: [{ id: 'rm1', type: 'expense', label: 'Home Loan repayment', amount: 1800, frequency: 'monthly', nextDueDate: dISO('2026-08-12'), isFixed: true, active: true, linkedLiabilityId: 'lm1' }],
  };
  const overdueLoanReminder = computeTopReminder(loanData, today);
  assert('4f. overdue loan bill routes to the dedicated loan_repayment_due kind', overdueLoanReminder?.kind === 'loan_repayment_due');
  assert('4f-i. no dollar amount stated in the overdue loan reminder body (factual, non-authoritative)', !/\$\d/.test(overdueLoanReminder?.body ?? ''));
  assert('4f-ii. carries the correct liabilityType for sheet labelling', overdueLoanReminder?.liabilityType === 'mortgage');
}

console.log('=== SECTION 5: Repayment exclusion from spending, across consumers ===');
{
  // Shared fixture: a cycle whose ONLY activity is a $500 credit-card
  // repayment (isRepayment, no recurringItemId) confirmed today.
  let data = baseData();
  data = withCash(data, 5000);
  data = withCard(data, { currentBalance: 1000 });
  const repay = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 500, paymentSource: 'cash', expectedCardBalance: 1000, transactionId: 'rp1', date: new Date().toISOString() });
  assert('5-setup. repayment applies', repay.applied);
  const afterRepay = repay.applied ? repay.data : data;

  const activity = computeMonthToDateActivity(afterRepay);
  assert('5a. computeMonthToDateActivity excludes the repayment from spend', activity.spend === 0);
  assert('5a-i. computeMonthToDateActivity excludes the repayment from cashSpend', activity.cashSpend === 0);

  const recorded = computeThisMonthRecordedSummary(afterRepay);
  assert('5b. computeThisMonthRecordedSummary excludes the repayment from spendingCents', recorded.spendingCents === 0);
  assert('5b-i. computeThisMonthRecordedSummary produces no spending-source row for it', recorded.spendingSources.length === 0);

  const deltas = computeCategoryDeltas(afterRepay);
  assert('5c. computeCategoryDeltas has no entry attributable to the repayment (cat-debt)', !deltas.some((c) => c.categoryId === 'cat-debt'));

  const insights = computeSpendingInsights(afterRepay);
  assert('5d. computeSpendingInsights produces no insight from a repayment-only cycle', insights.length === 0);

  const safe = computeSafeToSpend(afterRepay, new Date());
  assert("5e. safeToSpend.todaysSpend excludes the repayment", safe.todaysSpend === 0);

  const score = computeLuluScore(afterRepay);
  if (!score.locked) {
    const spendingFactor = score.categories.find((c) => c.key === 'moneyFlow')?.factors.find((f) => f.key === 'spending_control');
    assert('5f. Spending Control factor treats a repayment-only cycle as "not enough spending history" (never penalised for a repayment)', spendingFactor?.status === 'not_enough_info');
  } else {
    assert('5f. (score locked — not applicable for this profile, skipped safely)', true);
  }

  // 5g. Structural — TransactionsScreen.tsx's groupByMonth month-header
  // total (React Native TSX, not real-importable). SUPERSEDED TWICE now:
  // first by the 2D-NARROW correction round (the blanket `!t.recurringItemId
  // && !t.isRepayment` exclusion this assertion originally checked for was
  // itself the defect the user's device test caught, incorrectly excluding
  // ordinary confirmed bills too), then by the final three-measure
  // accounting correction (the month header is an AGGREGATE-SPENDING
  // presentation, not a cashflow one — it now reads
  // resolveTransactionAggregateSpendingAmount, never
  // resolveTransactionCashflowAmount, so it correctly excludes an
  // unknown-split loan repayment while Financial State's cashflow still
  // counts it) — see pass-2d-narrow-correction.test.ts §5/§6 for the real,
  // behavioural proof of both.
  const txScreenSrc = fs.readFileSync(path.join(__dirname, '../src/screens/transactions/TransactionsScreen.tsx'), 'utf8');
  assert(
    "5g. TransactionsScreen.tsx's month-header expenses total uses the shared resolveTransactionAggregateSpendingAmount resolver (final three-measure correction — never the cashflow resolver, which is reserved for Financial State alone)",
    /const expenses = txns\.filter\(\(t\) => t\.type === 'expense'\)\.reduce\(\(sum, t\) => sum \+ resolveTransactionAggregateSpendingAmount\(data, t\), 0\)/.test(txScreenSrc)
  );
}

console.log('=== SECTION 6: AUP selected/excluded-source numerical reconciliation (cases A-H) ===');
{
  function cycleFixture(): AppData {
    let data = baseData();
    data.user = { ...data.user, nextPayday: dISO('2026-08-20'), payFrequency: 'weekly', monthlyIncome: 4000 };
    return data;
  }

  // Case A — bill paid from an INCLUDED account (cash, default-included).
  {
    let data = cycleFixture();
    data = withCash(data, 1000);
    data = {
      ...data,
      recurringItems: [{ id: 'bA', type: 'expense', label: 'Internet', amount: 50, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
    };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bA', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'cA', date: dISO('2026-08-13'),
    });
    assert('6A-setup. bill confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      assert('6A. paying from an INCLUDED account: selected balance drops by $50, expected bills drop by $50 — pool unchanged', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 0);
      assert('6A-i. included balance itself dropped by $50', Math.round((before.includedMoneyBalance - after.includedMoneyBalance) * 100) / 100 === 50);
    }
  }

  // Case B — bill paid from an EXCLUDED account (everyday, includeInMoneyCalculations:false).
  {
    let data = cycleFixture();
    data = withEveryday(data, 1000, 'edB', false);
    data = {
      ...data,
      recurringItems: [{ id: 'bB', type: 'expense', label: 'Internet', amount: 50, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
    };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bB', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'everyday', targetAssetId: 'edB', transactionId: 'cB', date: dISO('2026-08-13'),
    });
    assert('6B-setup. bill confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      assert('6B. paying from an EXCLUDED account: the selected pool is unchanged, but the bill disappears from cycleBillsExpected — pool genuinely INCREASES by $50', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 50);
      assert('6B-i. included balance (which never included this account) is unchanged', after.includedMoneyBalance === before.includedMoneyBalance);
      assert('6B-ii. confirms the hypothesis: excluded-account payment can legitimately raise AUP', after.cycleRemainingPool > before.cycleRemainingPool);
    }
  }

  // Case C — bill paid by credit card (never reduces includedMoneyBalance either).
  {
    let data = cycleFixture();
    data = withCash(data, 1000);
    data = withCard(data, { currentBalance: 0 });
    data = {
      ...data,
      recurringItems: [{ id: 'bC', type: 'expense', label: 'Internet', amount: 50, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
    };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bC', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'credit_card', creditCardId: 'card1', transactionId: 'cC', date: dISO('2026-08-13'),
    });
    assert('6C-setup. bill confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      assert('6C. paying by credit card: same increase as an excluded account (+$50) — cash on hand never moved, obligation disappeared', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 50);
    }
  }

  // Case D — next recurrence stays inside the cycle (weekly bill, cycle 7 days) — bill reappears, pool nets back down.
  {
    let data = cycleFixture();
    data.user = { ...data.user, nextPayday: dISO('2026-08-27'), payFrequency: 'weekly' }; // 14-day-ish window via windowFrom logic; use fortnightly for clarity
    data.user.payFrequency = 'fortnightly';
    data = withCash(data, 1000);
    data = {
      ...data,
      recurringItems: [{ id: 'bD', type: 'expense', label: 'Weekly bill', amount: 20, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
    };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bD', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'cD', date: dISO('2026-08-13'),
    });
    assert('6D-setup. weekly bill confirms inside a fortnightly cycle', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      // Cash-paid, and the window (13-27 Aug) still holds the SAME number of
      // weekly occurrences either way (3 before: 13/20/27 Aug; 2 after the
      // paid one drops off: 20/27 Aug) — cycleBillsExpected drops by exactly
      // the $20 just paid, matching the $20 cash decrease exactly: pool
      // change is $0, the same conservation as case A (nothing left the
      // window on either side).
      assert('6D. next occurrence still inside the cycle: pool is UNCHANGED (paid bill and its own obligation cancel exactly, same as case A)', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 0);
    }
  }

  // Case E — next recurrence moves OUTSIDE the cycle (bill due right at cycle end, weekly, short cycle).
  {
    let data = cycleFixture();
    data.user = { ...data.user, nextPayday: dISO('2026-08-14'), payFrequency: 'weekly' }; // 7-day cycle ending 14 Aug
    data = withCash(data, 1000);
    data = {
      ...data,
      recurringItems: [{ id: 'bE', type: 'expense', label: 'Weekly bill', amount: 20, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
    };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bE', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'cE', date: dISO('2026-08-13'),
    });
    assert('6E-setup. weekly bill confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      // Next occurrence (20 Aug) now falls OUTSIDE the 7-day cycle ending 14 Aug, so cycleBillsExpected drops the whole $20 obligation while cash also dropped $20 (paid) — pool unchanged.
      assert('6E. next occurrence moves outside the cycle: paid cash-funded bill nets to $0 pool change', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 0);
    }
  }

  // Case F — loan repayment from an INCLUDED account, no balance update (bill-like — same as case A pattern).
  {
    let data = cycleFixture();
    data = withCash(data, 5000);
    data = { ...data, liabilities: [{ id: 'lF', type: 'personal_loan', label: 'Personal Loan', currentBalance: 3000 }], recurringItems: [{ id: 'rF', type: 'expense', label: 'Personal Loan repayment', amount: 200, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'lF' }] };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmLoanRepaymentTransition(data, { recurringItemId: 'rF', liabilityId: 'lF', expectedNextDueDate: dISO('2026-08-13'), amount: 200, paymentSource: 'cash', updateBalance: false, expectedCurrentBalance: 3000, transactionId: 'cF', date: dISO('2026-08-13') });
    assert('6F-setup. loan repayment confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      assert('6F. loan repayment from an INCLUDED account: pool unchanged (balance drop offsets bill-obligation drop)', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 0);
    }
  }

  // Case G — loan repayment from an EXCLUDED account — pool increases.
  {
    let data = cycleFixture();
    data = withEveryday(data, 5000, 'edG', false);
    data = { ...data, liabilities: [{ id: 'lG', type: 'personal_loan', label: 'Personal Loan', currentBalance: 3000 }], recurringItems: [{ id: 'rG', type: 'expense', label: 'Personal Loan repayment', amount: 200, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'lG' }] };
    const before = computeSafeToSpend(data, d('2026-08-13'));
    const result = confirmLoanRepaymentTransition(data, { recurringItemId: 'rG', liabilityId: 'lG', expectedNextDueDate: dISO('2026-08-13'), amount: 200, paymentSource: 'everyday', targetAssetId: 'edG', updateBalance: false, expectedCurrentBalance: 3000, transactionId: 'cG', date: dISO('2026-08-13') });
    assert('6G-setup. loan repayment confirms', result.applied);
    if (result.applied) {
      const after = computeSafeToSpend(result.data, d('2026-08-13'));
      assert('6G. loan repayment from an EXCLUDED account: pool increases by $200, mirroring case B', Math.round((after.cycleRemainingPool - before.cycleRemainingPool) * 100) / 100 === 200);
    }
  }

  // Case H — loan repayment WITH vs WITHOUT a recorded principal reduction: AUP itself is identical either way (balance-based term, cycleBillsExpected unaffected by principal/interest split).
  {
    let dataNoUpdate = cycleFixture();
    dataNoUpdate = withCash(dataNoUpdate, 5000);
    dataNoUpdate = { ...dataNoUpdate, liabilities: [{ id: 'lH', type: 'mortgage', label: 'Home Loan', currentBalance: 400000 }], recurringItems: [{ id: 'rH', type: 'expense', label: 'Home Loan repayment', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'lH' }] };
    const beforeH = computeSafeToSpend(dataNoUpdate, d('2026-08-13'));
    const noUpdate = confirmLoanRepaymentTransition(dataNoUpdate, { recurringItemId: 'rH', liabilityId: 'lH', expectedNextDueDate: dISO('2026-08-13'), amount: 1500, paymentSource: 'cash', updateBalance: false, expectedCurrentBalance: 400000, transactionId: 'cH1', date: dISO('2026-08-13') });
    const withUpdate = confirmLoanRepaymentTransition(dataNoUpdate, { recurringItemId: 'rH', liabilityId: 'lH', expectedNextDueDate: dISO('2026-08-13'), amount: 1500, paymentSource: 'cash', updateBalance: true, newBalance: 399300, expectedCurrentBalance: 400000, transactionId: 'cH2', date: dISO('2026-08-13') });
    assert('6H-setup. both variants confirm', noUpdate.applied && withUpdate.applied);
    if (noUpdate.applied && withUpdate.applied) {
      const afterNoUpdate = computeSafeToSpend(noUpdate.data, d('2026-08-13'));
      const afterWithUpdate = computeSafeToSpend(withUpdate.data, d('2026-08-13'));
      assert('6H. AUP (cycleRemainingPool) delta is IDENTICAL whether or not the recorded loan balance is updated — it never reads Liability.currentBalance at all', Math.round((afterNoUpdate.cycleRemainingPool - beforeH.cycleRemainingPool) * 100) === Math.round((afterWithUpdate.cycleRemainingPool - beforeH.cycleRemainingPool) * 100));
    }
  }
}

console.log('=== SECTION 7: AUP compact-tile readability ===');
{
  function presentationFor(safe: ReturnType<typeof computeSafeToSpend>, data: AppData) {
    const heroCopy = computeMoneyHeroCopy(data);
    return selectSafeToSpendPresentation(safe, heroCopy);
  }

  // 7a. commitments_exceed_cash — the exact state from the device screenshot.
  {
    let data = baseData();
    data.user = { ...data.user, nextPayday: dISO('2026-08-20'), payFrequency: 'weekly', monthlyIncome: 2000 };
    data = withCash(data, 10); // tiny balance
    data = { ...data, recurringItems: [{ id: 'big', type: 'expense', label: 'Rent', amount: 2000, frequency: 'weekly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }] };
    const safe = computeSafeToSpend(data, d('2026-08-13'));
    const presentation = presentationFor(safe, data);
    assert('7a. commitments_exceed_cash state reproduced', presentation.heroState === 'commitments_exceed_cash');
    const tiles = selectBriefingTiles(presentation, null, []);
    const aup = tiles.find((t) => t.kind === 'aup')!;
    assert('7a-i. compact tile value is SHORT (never the long explanatory sentence)', aup.value.length < 30 && !aup.value.includes('planned bills'));
    assert('7a-ii. compact tile value differs from the full primaryCopy sentence', aup.value !== presentation.primaryCopy);
    assert('7a-iii. full primaryCopy sentence is still intact and unmodified for the Money screen hero', presentation.primaryCopy.includes('planned bills, savings and goals'));
  }

  // 7b. missing_balance — the other long-sentence state.
  {
    let data = baseData();
    data.user = { ...data.user, nextPayday: dISO('2026-08-20'), payFrequency: 'weekly' };
    const safe = computeSafeToSpend(data, d('2026-08-13'));
    const presentation = presentationFor(safe, data);
    assert('7b. missing_balance state reproduced', presentation.heroState === 'missing_balance');
    const tiles = selectBriefingTiles(presentation, null, []);
    const aup = tiles.find((t) => t.kind === 'aup')!;
    assert('7b-i. compact tile value is short for missing_balance too', aup.value.length < 30);
    assert('7b-ii. never fabricates/reveals an amount in this unavailable state', !presentation.amountVisible && aup.value !== '');
  }

  // 7c. normal (authoritative positive amount) — unaffected, still shows the real amount.
  {
    let data = baseData();
    data.user = { ...data.user, nextPayday: dISO('2026-08-20'), payFrequency: 'weekly' };
    data = withCash(data, 500);
    const safe = computeSafeToSpend(data, d('2026-08-13'));
    const presentation = presentationFor(safe, data);
    assert('7c. normal state still shows the real formatted amount, not compactSummary', presentation.amountVisible && presentation.displayAmount !== null);
    const tiles = selectBriefingTiles(presentation, null, []);
    const aup = tiles.find((t) => t.kind === 'aup')!;
    assert('7c-i. compact tile shows the dollar amount for the normal state', aup.value === presentation.displayAmount);
  }

  // 7d. Structural — the fallback in aupTile() itself no longer references primaryCopy.
  const briefingTilesSrc = fs.readFileSync(path.join(__dirname, '../src/lib/calculations/briefingTiles.ts'), 'utf8');
  assert('7d. aupTile() falls back to compactSummary, never primaryCopy, in the compact value slot', /presentation\.displayAmount : presentation\.compactSummary/.test(briefingTilesSrc));

  // 7e. Structural — the Text element's typography/auto-shrink props are unchanged (no new minimumFontScale floor introduced).
  const tileRowSrc = fs.readFileSync(path.join(__dirname, '../src/components/today/BriefingTileRow.tsx'), 'utf8');
  assert('7e. the shared value Text element still uses the same minimumFontScale as Reminder/Next tiles (0.75, unchanged)', /minimumFontScale=\{0\.75\}/.test(tileRowSrc));
}

console.log('=== SECTION 8: Supported payment-source matrix ===');
{
  let data = baseData();
  data = withCash(data, 100);
  data = withEveryday(data, 100, 'ed1');
  data = withCard(data, { currentBalance: 200 });
  data = { ...data, assets: [...data.assets, { id: 'sav1', type: 'savings', label: 'Savings', currentValue: 500 }] };

  const sources = resolveEligibleBillPaymentSources(data.assets, data.creditCards);
  assert('8a. ordinary bill payment offers Cash', sources.some((s) => s.assetType === 'cash'));
  assert('8b. ordinary bill payment offers Everyday', sources.some((s) => s.assetType === 'everyday'));
  assert('8c. ordinary bill payment offers the credit card', sources.some((s) => s.kind === 'credit_card'));
  assert('8d. ordinary bill payment never offers Savings (no PaymentSource value supports it)', !sources.some((s) => 'assetType' in s && (s as any).assetType === 'savings'));

  // 8e/8f WHY STALE: LoanRepaymentSheet.tsx/CreditCardRepaymentSheet.tsx
  // were deleted by the final Pass 2D native-Modal-lifecycle correction —
  // their entire state/validation logic (including this exact eligible-
  // source filter) moved verbatim into useLoanRepaymentForm.ts/
  // useCreditCardRepaymentForm.ts (relocated, not reimplemented — see
  // those files' own doc comments). REPLACEMENT: identical assertion,
  // re-pointed at the two hooks that now actually own this filter.
  const loanHookSrc = fs.readFileSync(path.join(__dirname, '../src/hooks/useLoanRepaymentForm.ts'), 'utf8');
  assert("8e. useLoanRepaymentForm.ts filters eligible sources to 'asset' kind only (no credit-card funding offered) — deliberate scope decision, unchanged from the deleted LoanRepaymentSheet.tsx", /resolveEligibleBillPaymentSources\(data\.assets, \[\]\)\.filter\(\(o\) => o\.kind === 'asset'\)/.test(loanHookSrc));

  const cardHookSrc = fs.readFileSync(path.join(__dirname, '../src/hooks/useCreditCardRepaymentForm.ts'), 'utf8');
  assert("8f. useCreditCardRepaymentForm.ts also filters to 'asset' kind only (cash/everyday only — paying a card from another card is unmodelled), unchanged from the deleted CreditCardRepaymentSheet.tsx", /resolveEligibleBillPaymentSources\(data\.assets, \[\]\)\.filter\(\(o\) => o\.kind === 'asset'\)/.test(cardHookSrc));
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
