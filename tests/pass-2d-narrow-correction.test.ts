// Pass 2D — "2D-NARROW" final accounting correction round.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): every section imports and directly executes the
//   actual production functions — confirmRecurringOccurrenceTransition,
//   reverseRecurringOccurrenceTransaction, isLatestRecurringOccurrenceTransaction,
//   confirmLoanRepaymentTransition, reverseLoanRepaymentTransaction,
//   confirmCreditCardRepaymentTransition, reverseCreditCardRepaymentTransaction,
//   applyTransactionDelete (src/state/AppStateContext.tsx), computeTopReminder
//   (reminders.ts), computeMonthToDateActivity / computeThisMonthRecordedSummary /
//   computeRecordedMonthlyCashflow (monthlySummary.ts), computeCategoryDeltas /
//   computeSpendingInsights (spendingInsights.ts), buildGoalImpactOpportunity
//   (opportunities.ts), resolveTransactionCashflowAmount /
//   resolveTransactionCategoryCoachingAmount (repaymentAccounting.ts).
// - Structural (regex/string match against source text): TransactionsScreen.tsx's
//   repaymentBadge presentation (React Native TSX, not real-importable).
//
// Run with: npx tsx tests/pass-2d-narrow-correction.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { computeTopReminder } from '../src/lib/calculations/reminders';
import {
  confirmRecurringOccurrenceTransition,
  reverseRecurringOccurrenceTransaction,
  isLatestRecurringOccurrenceTransaction,
  confirmLoanRepaymentTransition,
  reverseLoanRepaymentTransaction,
  confirmCreditCardRepaymentTransition,
  reverseCreditCardRepaymentTransaction,
  applyTransactionDelete,
  ConfirmLoanRepaymentInput,
  ConfirmCreditCardRepaymentInput,
} from '../src/state/AppStateContext';
import { computeMonthToDateActivity, computeThisMonthRecordedSummary, computeRecordedMonthlyCashflow } from '../src/lib/calculations/monthlySummary';
import { computeCategoryDeltas, computeSpendingInsights } from '../src/lib/calculations/spendingInsights';
import { buildGoalImpactOpportunity } from '../src/lib/calculations/opportunities';
import {
  resolveTransactionCashflowAmount,
  resolveTransactionAggregateSpendingAmount,
  resolveTransactionCategoryCoachingAmount,
} from '../src/lib/calculations/repaymentAccounting';
import type { AppData, CreditCard, Transaction } from '../src/types/models';

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

console.log('=== SECTION 1: Insufficient-funding validation for bills (Gate 1) ===');
{
  // 1a. The exact required test: a $1,000 source and a $1,500 payment proves nothing changes.
  let data = baseData();
  data = withCash(data, 1000);
  data = {
    ...data,
    recurringItems: [{ id: 'b1', type: 'expense', label: 'Big bill', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const before = JSON.stringify(data);
  const result = confirmRecurringOccurrenceTransition(data, {
    recurringItemId: 'b1', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'cash', transactionId: 't1', date: dISO('2026-08-15'),
  });
  assert('1a. bill payment exceeding Cash balance is rejected', result.applied === false);
  assert("1a-i. rejection reason is 'insufficient_source_balance'", !result.applied && result.reason === 'insufficient_source_balance');
  assert('1a-ii. nothing in AppData changed (no transaction, no balance mutation, no Reminder completion)', JSON.stringify(data) === before);

  // 1b. Same proof for an Everyday Account source.
  let dataEd = baseData();
  dataEd = withEveryday(dataEd, 1000, 'ed1');
  dataEd = {
    ...dataEd,
    recurringItems: [{ id: 'b2', type: 'expense', label: 'Big bill', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const resultEd = confirmRecurringOccurrenceTransition(dataEd, {
    recurringItemId: 'b2', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'everyday', targetAssetId: 'ed1', transactionId: 't2', date: dISO('2026-08-15'),
  });
  assert('1b. Everyday-funded bill payment exceeding the account balance is rejected', resultEd.applied === false);
  assert("1b-i. rejection reason is 'insufficient_source_balance'", !resultEd.applied && resultEd.reason === 'insufficient_source_balance');

  // 1c. Exact-cent boundary — a payment EQUAL to the balance succeeds.
  let dataExact = baseData();
  dataExact = withCash(dataExact, 1500);
  dataExact = {
    ...dataExact,
    recurringItems: [{ id: 'b3', type: 'expense', label: 'Big bill', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const resultExact = confirmRecurringOccurrenceTransition(dataExact, {
    recurringItemId: 'b3', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'cash', transactionId: 't3', date: dISO('2026-08-15'),
  });
  assert('1c. a payment exactly equal to the available balance succeeds (floors to $0, never rejected)', resultExact.applied);

  // 1d. Credit-card-funded bills are exempt (liability source, no floor) — a $1,500 bill charged to a card with plenty of limit still applies, and the card's balance correctly INCREASES.
  let dataCard = baseData();
  dataCard = withCard(dataCard, { currentBalance: 0, creditLimit: 5000 });
  dataCard = {
    ...dataCard,
    recurringItems: [{ id: 'b4', type: 'expense', label: 'Big bill', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const resultCard = confirmRecurringOccurrenceTransition(dataCard, {
    recurringItemId: 'b4', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'credit_card', creditCardId: 'card1', transactionId: 't4', date: dISO('2026-08-15'),
  });
  assert('1d. a credit-card-funded bill is never subject to the sufficiency check', resultCard.applied);
  if (resultCard.applied) {
    const card = resultCard.data.creditCards.find((c) => c.id === 'card1')!;
    assert('1d-i. the card balance correctly INCREASES by the full bill amount (preserved existing contract)', card.currentBalance === 1500);
  }

  // 1e. Stale source balance — confirming twice back-to-back off the SAME
  // stale snapshot is impossible via this transition (it re-derives the
  // live balance from `data` each call, never a caller-supplied snapshot),
  // so the real protection is duplicate-occurrence rejection: confirming
  // the same due occurrence a second time is rejected outright.
  let dataDup = baseData();
  dataDup = withCash(dataDup, 1000);
  dataDup = {
    ...dataDup,
    recurringItems: [{ id: 'b5', type: 'expense', label: 'Bill', amount: 100, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const firstConfirm = confirmRecurringOccurrenceTransition(dataDup, {
    recurringItemId: 'b5', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'cash', transactionId: 't5', date: dISO('2026-08-15'),
  });
  assert('1e-setup. first confirmation applies', firstConfirm.applied);
  if (firstConfirm.applied) {
    // Mirrors the real double-tap architecture (see pass-2d-final-correction
    // §1o): the second call reads the first call's already-committed result
    // (dataRef.current in the real app), so its stale expectedNextDueDate
    // (captured before the first confirm completed) no longer matches.
    const secondConfirm = confirmRecurringOccurrenceTransition(firstConfirm.data, {
      recurringItemId: 'b5', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'cash', transactionId: 't6', date: dISO('2026-08-15'),
    });
    assert("1e. a rapid duplicate confirmation off the same pre-confirm snapshot is rejected as stale ('stale', nextDueDate already moved in the real committed data)", secondConfirm.applied === false && !secondConfirm.applied && secondConfirm.reason === 'stale');
  }

  // 1f. The existing overdraft/negative-balance contract is untouched — a
  // NEGATIVE Cash balance (already possible via a prior transaction chain
  // in this codebase's own model, e.g. floor-at-zero elsewhere) is simply
  // treated as $0 available; no NEW overdraft facility is invented, and the
  // rejection path is identical to the $1,000/$1,500 case.
  let dataNeg = baseData();
  dataNeg = withCash(dataNeg, 0);
  dataNeg = {
    ...dataNeg,
    recurringItems: [{ id: 'b6', type: 'expense', label: 'Bill', amount: 50, frequency: 'monthly', nextDueDate: dISO('2026-08-15'), isFixed: true, active: true }],
  };
  const resultZero = confirmRecurringOccurrenceTransition(dataNeg, {
    recurringItemId: 'b6', expectedNextDueDate: dISO('2026-08-15'), paymentSource: 'cash', transactionId: 't7', date: dISO('2026-08-15'),
  });
  assert('1f. a bill funded from an exactly-$0 Cash balance is rejected (no overdraft facility invented)', resultZero.applied === false && !resultZero.applied && resultZero.reason === 'insufficient_source_balance');
}

console.log('=== SECTION 2: Cashflow vs classified-spending resolvers (Gate 2) ===');
{
  function ordinaryBill(): Transaction {
    return { id: 'x', type: 'expense', amount: 50, categoryId: 'cat-other', date: dISO('2026-08-13') } as Transaction;
  }
  function cardRepayment(): Transaction {
    return { id: 'x', type: 'expense', amount: 500, categoryId: 'cat-debt', date: dISO('2026-08-13'), isRepayment: true, creditCardId: 'card1' } as Transaction;
  }
  function loanRepaymentKnownSplit(): Transaction {
    return { id: 'x', type: 'expense', amount: 1500, categoryId: 'cat-debt', date: dISO('2026-08-13'), isLoanRepayment: true, principalAmount: 700 } as Transaction;
  }
  function loanRepaymentInterestOnly(): Transaction {
    return { id: 'x', type: 'expense', amount: 1500, categoryId: 'cat-debt', date: dISO('2026-08-13'), isLoanRepayment: true, principalAmount: 0 } as Transaction;
  }
  function loanRepaymentUnknownSplit(): Transaction {
    return { id: 'x', type: 'expense', amount: 1500, categoryId: 'cat-debt', date: dISO('2026-08-13'), isLoanRepayment: true } as Transaction;
  }

  const data = baseData();

  assert('2a. ordinary bill: cashflow = full amount', resolveTransactionCashflowAmount(data, ordinaryBill()) === 50);
  assert('2a-ii. ordinary bill: aggregate-spending amount = full amount', resolveTransactionAggregateSpendingAmount(data, ordinaryBill()) === 50);
  assert('2a-i. ordinary bill: category-coaching amount = full amount', resolveTransactionCategoryCoachingAmount(data, ordinaryBill()) === 50);

  assert('2b. credit-card repayment: cashflow = $0', resolveTransactionCashflowAmount(data, cardRepayment()) === 0);
  assert('2b-ii. credit-card repayment: aggregate-spending amount = $0', resolveTransactionAggregateSpendingAmount(data, cardRepayment()) === 0);
  assert('2b-i. credit-card repayment: category-coaching amount = $0', resolveTransactionCategoryCoachingAmount(data, cardRepayment()) === 0);

  assert('2c. loan repayment, known split ($700 principal of $1500): cashflow = known interest/fees ($800)', resolveTransactionCashflowAmount(data, loanRepaymentKnownSplit()) === 800);
  // Final debt-cost correction — a known interest/fees amount still counts
  // in AGGREGATE spending (2c above) but must NEVER drive category
  // coaching: the only category a loan repayment carries ('cat-debt',
  // "Debt repayments") is a generic, pre-existing, customer-selectable
  // category — not a genuine debt-interest category (it never distinguishes
  // interest from principal, and a credit-card repayment shares the exact
  // same id). See resolveTransactionCategoryCoachingAmount's own doc
  // comment for the full investigation.
  assert('2c-i. loan repayment, known split: category-coaching amount = $0 (no established debt-interest category exists)', resolveTransactionCategoryCoachingAmount(data, loanRepaymentKnownSplit()) === 0);
  assert('2c-ii. loan repayment, known split: aggregate-spending amount = same known interest/fees ($800) — identical to cashflow here', resolveTransactionAggregateSpendingAmount(data, loanRepaymentKnownSplit()) === 800);

  assert('2d. interest-only loan repayment (principal $0): cashflow = full amount (all interest)', resolveTransactionCashflowAmount(data, loanRepaymentInterestOnly()) === 1500);
  assert('2d-i. interest-only loan repayment: category-coaching amount = $0 (same reasoning as 2c-i — every dollar is still interest, but still excluded from coaching)', resolveTransactionCategoryCoachingAmount(data, loanRepaymentInterestOnly()) === 0);
  assert('2d-ii. interest-only loan repayment: aggregate-spending amount = full amount — identical to cashflow here', resolveTransactionAggregateSpendingAmount(data, loanRepaymentInterestOnly()) === 1500);

  assert('2e. unknown-split loan repayment: cashflow = FULL amount (real money left, never understated)', resolveTransactionCashflowAmount(data, loanRepaymentUnknownSplit()) === 1500);
  assert('2e-i. unknown-split loan repayment: category-coaching amount = $0 (no safe split to attribute to a category — doubly excluded)', resolveTransactionCategoryCoachingAmount(data, loanRepaymentUnknownSplit()) === 0);
  // The final, authoritative distinction this round establishes: cashflow
  // and aggregate spending DIVERGE for the unknown-split case specifically
  // — real cash left the account (2e above, full amount), but Navilo
  // cannot identify any of it as interest or an expense, so it must never
  // be PRESENTED as spending.
  assert('2e-ii. unknown-split loan repayment: aggregate-spending amount = $0 — DIVERGES from cashflow (2e), the one deliberate exception in the whole matrix', resolveTransactionAggregateSpendingAmount(data, loanRepaymentUnknownSplit()) === 0);

  // 2f. The device test's own proof, exercised end-to-end through the real
  // confirmation transition and the real "pure recorded activity" consumer.
  let liveData = baseData();
  liveData = withCash(liveData, 1000);
  liveData = {
    ...liveData,
    recurringItems: [{ id: 'bf', type: 'expense', label: 'Groceries', amount: 50, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: false, active: true }],
  };
  const confirmed = confirmRecurringOccurrenceTransition(liveData, {
    recurringItemId: 'bf', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'tf', date: dISO('2026-08-13'),
  });
  assert('2f-setup. ordinary bill confirms', confirmed.applied);
  if (confirmed.applied) {
    const activity = computeMonthToDateActivity(confirmed.data, d('2026-08-13'));
    assert('2f. an ordinary confirmed $50 bill correctly increases This Month recorded spend by $50 (the device test proof, now permanently held)', activity.spend === 50);
    const summary = computeThisMonthRecordedSummary(confirmed.data, d('2026-08-13'));
    assert('2f-i. This Month spending-source breakdown attributes the full $50 to Cash', summary.spendingSources.some((s) => s.key === 'cash' && s.amountCents === 5000));
    const deltas = computeCategoryDeltas(confirmed.data);
    // No prior-period baseline exists in this fixture, so no delta row is expected — this only proves the function runs cleanly against a live-confirmed bill without throwing or silently excluding it via the old blanket filter.
    assert('2f-ii. computeCategoryDeltas runs cleanly against a live-confirmed ordinary bill', Array.isArray(deltas));
    const insights = computeSpendingInsights(confirmed.data);
    assert('2f-iii. computeSpendingInsights runs cleanly against a live-confirmed ordinary bill', Array.isArray(insights));
  }

  // 2g. A confirmed credit-card repayment is excluded from This Month spend.
  let cardData = baseData();
  cardData = withCash(cardData, 1000);
  cardData = withCard(cardData, { currentBalance: 500 });
  // Simulate a confirmed repayment transaction directly (isolating the
  // resolver-consumer wiring from confirmCreditCardRepaymentTransition's
  // own already-tested contract).
  cardData = {
    ...cardData,
    transactions: [
      { id: 'crep', type: 'expense', amount: 200, categoryId: 'cat-debt', date: dISO('2026-08-13'), isRepayment: true, creditCardId: 'card1', note: 'Test Card repayment' },
    ],
  };
  const activityAfterRepay = computeMonthToDateActivity(cardData, d('2026-08-13'));
  assert('2g. a confirmed credit-card repayment does not inflate This Month spend', activityAfterRepay.spend === 0);
}

console.log('=== SECTION 3: Ordinary-bill Reminder restoration on reversal (Gate 3) ===');
{
  // 3a. Confirm, then fully reverse — the exact due occurrence is restored.
  let data = baseData();
  data = withCash(data, 1000);
  data = {
    ...data,
    recurringItems: [{ id: 'r1', type: 'expense', label: 'Internet', amount: 60, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
  };
  const confirm1 = confirmRecurringOccurrenceTransition(data, {
    recurringItemId: 'r1', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'rt1', date: dISO('2026-08-13'),
  });
  assert('3a-setup. bill confirms', confirm1.applied);
  if (confirm1.applied) {
    const itemAfterConfirm = confirm1.data.recurringItems.find((r) => r.id === 'r1')!;
    assert('3a-i. nextDueDate advanced past the confirmed occurrence', new Date(itemAfterConfirm.nextDueDate).getTime() > new Date('2026-08-13').getTime());

    const reversed = reverseRecurringOccurrenceTransaction(confirm1.data, 'rt1');
    assert('3a. reversal of the latest occurrence applies', reversed.applied);
    if (reversed.applied) {
      const itemRestored = reversed.data.recurringItems.find((r) => r.id === 'r1')!;
      assert('3a-ii. nextDueDate restored to the exact original due date', itemRestored.nextDueDate === dISO('2026-08-13'));
      const cashRestored = reversed.data.assets.find((a) => a.id === 'cash1')!;
      assert('3a-iii. funding balance restored exactly', cashRestored.currentValue === 1000);
      assert('3a-iv. the transaction is removed', reversed.data.transactions.find((t) => t.id === 'rt1') === undefined);
    }
  }

  // 3b. Later-occurrence guard — an EARLIER confirmed occurrence can no
  // longer be safely reversed once a LATER one has moved the schedule
  // forward (mirrors BNPL/loan's own established guard).
  let data2 = baseData();
  data2 = withCash(data2, 1000);
  data2 = {
    ...data2,
    recurringItems: [{ id: 'r2', type: 'expense', label: 'Rent', amount: 100, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
  };
  const occ1 = confirmRecurringOccurrenceTransition(data2, {
    recurringItemId: 'r2', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'rt2a', date: dISO('2026-08-13'),
  });
  assert('3b-setup1. first occurrence confirms', occ1.applied);
  if (occ1.applied) {
    const itemAfterOcc1 = occ1.data.recurringItems.find((r) => r.id === 'r2')!;
    const occ2 = confirmRecurringOccurrenceTransition(occ1.data, {
      recurringItemId: 'r2', expectedNextDueDate: itemAfterOcc1.nextDueDate, paymentSource: 'cash', transactionId: 'rt2b', date: itemAfterOcc1.nextDueDate,
    });
    assert('3b-setup2. second occurrence confirms', occ2.applied);
    if (occ2.applied) {
      assert('3b-i. the earlier transaction is no longer the latest', isLatestRecurringOccurrenceTransaction(occ2.data, 'rt2a') === false);
      const reverseEarlier = reverseRecurringOccurrenceTransaction(occ2.data, 'rt2a');
      assert("3b. reversing the EARLIER occurrence is rejected ('not_latest')", reverseEarlier.applied === false && !reverseEarlier.applied && reverseEarlier.reason === 'not_latest');
      assert('3b-ii. the latest transaction IS still safely reversible', isLatestRecurringOccurrenceTransaction(occ2.data, 'rt2b'));
    }
  }

  // 3c. Record-only deletion never reverses balances or restores the Reminder.
  let data3 = baseData();
  data3 = withCash(data3, 1000);
  data3 = {
    ...data3,
    recurringItems: [{ id: 'r3', type: 'expense', label: 'Gym', amount: 40, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
  };
  const confirm3 = confirmRecurringOccurrenceTransition(data3, {
    recurringItemId: 'r3', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'rt3', date: dISO('2026-08-13'),
  });
  assert('3c-setup. bill confirms', confirm3.applied);
  if (confirm3.applied) {
    const recordOnly = applyTransactionDelete(confirm3.data, 'rt3', false);
    const cashAfterRecordOnly = recordOnly.assets.find((a) => a.id === 'cash1')!;
    assert('3c. record-only deletion leaves the funding balance untouched', cashAfterRecordOnly.currentValue === 960);
    const itemAfterRecordOnly = recordOnly.recurringItems.find((r) => r.id === 'r3')!;
    const itemBeforeDelete = confirm3.data.recurringItems.find((r) => r.id === 'r3')!;
    assert('3c-i. record-only deletion never restores the Reminder occurrence', itemAfterRecordOnly.nextDueDate === itemBeforeDelete.nextDueDate);
    assert('3c-ii. the transaction itself is removed', recordOnly.transactions.find((t) => t.id === 'rt3') === undefined);
  }

  // 3d. Duplicate reversal is harmless — the second attempt finds nothing to reverse.
  let data4 = baseData();
  data4 = withCash(data4, 1000);
  data4 = {
    ...data4,
    recurringItems: [{ id: 'r4', type: 'expense', label: 'Streaming', amount: 15, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true }],
  };
  const confirm4 = confirmRecurringOccurrenceTransition(data4, {
    recurringItemId: 'r4', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'rt4', date: dISO('2026-08-13'),
  });
  assert('3d-setup. bill confirms', confirm4.applied);
  if (confirm4.applied) {
    const firstReversal = reverseRecurringOccurrenceTransaction(confirm4.data, 'rt4');
    assert('3d-i. first reversal applies', firstReversal.applied);
    if (firstReversal.applied) {
      const secondReversal = reverseRecurringOccurrenceTransaction(firstReversal.data, 'rt4');
      assert("3d. a second reversal attempt on the same transaction is harmless ('not_found', no crash, no double-restore)", secondReversal.applied === false && !secondReversal.applied && secondReversal.reason === 'not_found');
    }
  }

  // 3e. A BNPL/loan-linked transaction is rejected by this function (routes
  // through its own dedicated reverse function instead).
  let data5 = baseData();
  data5 = withCash(data5, 5000);
  data5 = {
    ...data5,
    liabilities: [{ id: 'loan5', type: 'car_loan', label: 'Car Loan', currentBalance: 20000 }],
    recurringItems: [{ id: 'r5', type: 'expense', label: 'Car Loan repayment', amount: 400, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'loan5' }],
  };
  const loanInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'r5', liabilityId: 'loan5', expectedNextDueDate: dISO('2026-08-13'), amount: 400, paymentSource: 'cash', updateBalance: false, expectedCurrentBalance: 20000, transactionId: 'rt5', date: dISO('2026-08-13'),
  };
  const loanConfirm = confirmLoanRepaymentTransition(data5, loanInput);
  assert('3e-setup. loan repayment confirms', loanConfirm.applied);
  if (loanConfirm.applied) {
    const wrongReverse = reverseRecurringOccurrenceTransaction(loanConfirm.data, 'rt5');
    assert("3e. reverseRecurringOccurrenceTransaction rejects a loan-linked transaction ('not_a_recurring_occurrence')", wrongReverse.applied === false && !wrongReverse.applied && wrongReverse.reason === 'not_a_recurring_occurrence');
    const rightReverse = reverseLoanRepaymentTransaction(loanConfirm.data, 'rt5');
    assert('3e-i. the loan-linked transaction correctly reverses through its OWN dedicated function instead', rightReverse.applied);
  }
}

console.log('=== SECTION 4: Zero-balance loan reminder suppression (Gate 4) ===');
{
  const today = d('2026-08-13');

  // 4a. A loan with $0 recorded balance, overdue occurrence — no loan_repayment_due reminder, and no fallback to a generic bill reminder either.
  let data = baseData();
  data = {
    ...data,
    liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 0 }],
    recurringItems: [{ id: 'lr1', type: 'expense', label: 'Personal Loan repayment', amount: 200, frequency: 'monthly', nextDueDate: dISO('2026-08-10'), isFixed: true, active: true, linkedLiabilityId: 'loan1' }],
  };
  const reminderZero = computeTopReminder(data, today);
  assert('4a. an overdue occurrence on a $0-balance loan produces no loan_repayment_due reminder', reminderZero?.kind !== 'loan_repayment_due');
  assert('4a-i. it also never falls back to a generic bill_overdue reminder for the same item', !(reminderZero?.kind === 'bill_overdue' && reminderZero.recurringItemId === 'lr1'));

  // 4b. The same loan with a positive balance DOES produce the reminder.
  let dataPositive = { ...data, liabilities: [{ id: 'loan1', type: 'personal_loan' as const, label: 'Personal Loan', currentBalance: 200 }] };
  const reminderPositive = computeTopReminder(dataPositive, today);
  assert('4b. the identical overdue occurrence on a POSITIVE-balance loan correctly produces loan_repayment_due', reminderPositive?.kind === 'loan_repayment_due');

  // 4c. Due-today, $0 balance — also suppressed.
  let dataDueToday = {
    ...data,
    recurringItems: [{ id: 'lr1', type: 'expense' as const, label: 'Personal Loan repayment', amount: 200, frequency: 'monthly' as const, nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'loan1' }],
  };
  const reminderDueTodayZero = computeTopReminder(dataDueToday, today);
  assert('4c. a due-TODAY occurrence on a $0-balance loan also produces no loan_repayment_due reminder', reminderDueTodayZero?.kind !== 'loan_repayment_due');

  // 4d. Due-tomorrow, $0 balance — the informational bill_due_soon tier is also suppressed entirely for this item.
  let dataDueTomorrow = {
    ...data,
    recurringItems: [{ id: 'lr1', type: 'expense' as const, label: 'Personal Loan repayment', amount: 200, frequency: 'monthly' as const, nextDueDate: dISO('2026-08-14'), isFixed: true, active: true, linkedLiabilityId: 'loan1' }],
  };
  const reminderDueTomorrowZero = computeTopReminder(dataDueTomorrow, today);
  assert('4d. a due-TOMORROW occurrence on a $0-balance loan produces no reminder at all for that item (not even the informational tier)', !(reminderDueTomorrowZero?.recurringItemId === 'lr1'));

  // 4e. Reversal restoring a positive balance resumes reminder behaviour.
  let dataForReversal = baseData();
  dataForReversal = withCash(dataForReversal, 5000);
  dataForReversal = {
    ...dataForReversal,
    liabilities: [{ id: 'loan2', type: 'personal_loan', label: 'Personal Loan 2', currentBalance: 500 }],
    recurringItems: [{ id: 'lr2', type: 'expense', label: 'Personal Loan 2 repayment', amount: 500, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'loan2' }],
  };
  const payoffInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'lr2', liabilityId: 'loan2', expectedNextDueDate: dISO('2026-08-13'), amount: 500, paymentSource: 'cash', updateBalance: true, newBalance: 0, expectedCurrentBalance: 500, transactionId: 'payoff1', date: dISO('2026-08-13'),
  };
  const payoffConfirm = confirmLoanRepaymentTransition(dataForReversal, payoffInput);
  assert('4e-setup1. loan fully paid off ($0 balance) applies', payoffConfirm.applied);
  if (payoffConfirm.applied) {
    const liabAfterPayoff = payoffConfirm.data.liabilities.find((l) => l.id === 'loan2')!;
    assert('4e-setup2. recorded balance is now exactly $0', liabAfterPayoff.currentBalance === 0);
    const itemAfterPayoff = payoffConfirm.data.recurringItems.find((r) => r.id === 'lr2')!;
    const reminderAfterPayoff = computeTopReminder(
      { ...payoffConfirm.data, recurringItems: payoffConfirm.data.recurringItems.map((r) => (r.id === 'lr2' ? { ...r, nextDueDate: dISO('2026-08-13') } : r)) },
      today
    );
    assert('4e-i. immediately after payoff, no loan_repayment_due reminder for the next occurrence', reminderAfterPayoff?.kind !== 'loan_repayment_due');

    const reversedPayoff = reverseLoanRepaymentTransaction(payoffConfirm.data, 'payoff1');
    assert('4e. reversing the payoff applies', reversedPayoff.applied);
    if (reversedPayoff.applied) {
      const liabRestored = reversedPayoff.data.liabilities.find((l) => l.id === 'loan2')!;
      assert('4e-ii. reversal restores the positive recorded balance', liabRestored.currentBalance === 500);
      const reminderRestored = computeTopReminder(reversedPayoff.data, today);
      assert('4e-iii. reversal restoring a positive balance resumes correct reminder behaviour (occurrence + balance both restored)', reminderRestored?.kind === 'loan_repayment_due');
    }
  }

  // 4f. A manual edit of the recorded balance back above $0 resumes reminders (live-check design, no extra state).
  let dataManualEdit = { ...data, liabilities: [{ id: 'loan1', type: 'personal_loan' as const, label: 'Personal Loan', currentBalance: 0 }] };
  const beforeEdit = computeTopReminder(dataManualEdit, today);
  assert('4f-setup. still suppressed at $0', beforeEdit?.kind !== 'loan_repayment_due');
  const dataAfterManualEdit = { ...dataManualEdit, liabilities: [{ id: 'loan1', type: 'personal_loan' as const, label: 'Personal Loan', currentBalance: 150 }] };
  const afterEdit = computeTopReminder(dataAfterManualEdit, today);
  assert('4f. a manual balance edit above $0 resumes reminders on the very next read (no frozen flag, no extra state to keep in sync)', afterEdit?.kind === 'loan_repayment_due');

  // 4g. Gate 4's explicit clarification — an unknown-split repayment that
  // happens to zero the balance is NOT treated as a payoff: a later manual
  // edit above $0 still resumes reminders exactly as any other case would
  // (already proven generically by 4f; this just confirms the unknown-split
  // path doesn't set any special "payoff" flag the live-balance check would
  // need to bypass).
  let dataUnknownSplitZero = baseData();
  dataUnknownSplitZero = withCash(dataUnknownSplitZero, 5000);
  dataUnknownSplitZero = {
    ...dataUnknownSplitZero,
    liabilities: [{ id: 'loan3', type: 'personal_loan', label: 'Personal Loan 3', currentBalance: 300 }],
    recurringItems: [{ id: 'lr3', type: 'expense', label: 'Personal Loan 3 repayment', amount: 300, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'loan3' }],
  };
  const unknownSplitInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'lr3', liabilityId: 'loan3', expectedNextDueDate: dISO('2026-08-13'), amount: 300, paymentSource: 'cash', updateBalance: false, expectedCurrentBalance: 300, transactionId: 'unk1', date: dISO('2026-08-13'),
  };
  const unknownSplitConfirm = confirmLoanRepaymentTransition(dataUnknownSplitZero, unknownSplitInput);
  assert('4g-setup. unknown-split repayment applies', unknownSplitConfirm.applied);
  if (unknownSplitConfirm.applied) {
    const liab = unknownSplitConfirm.data.liabilities.find((l) => l.id === 'loan3')!;
    assert('4g. an unknown-split repayment never touches the recorded balance, even when the payment equals it exactly (must not be treated as a payoff)', liab.currentBalance === 300);
  }
}

console.log('=== SECTION 5: Transaction History row presentation (Gate 5, structural) ===');
{
  const src = fs.readFileSync(path.join(__dirname, '../src/screens/transactions/TransactionsScreen.tsx'), 'utf8');
  assert('5a. a repaymentBadge function exists', /function repaymentBadge\(/.test(src));
  assert("5b. a credit-card repayment is labelled 'not counted as spending'", /Repayment — not counted as spending/.test(src));
  assert("5c. an unknown-split loan repayment is labelled 'Balance not updated'", /Balance not updated — split unknown/.test(src));
  assert("5d. an interest-only loan repayment is labelled distinctly from a principal-bearing one", /All interest — no change to recorded balance/.test(src));
  assert('5e. a known-split loan repayment shows both the principal and interest amounts (never just the raw total)', /principal, \$\$\{Math\.round\(interest\)\.toLocaleString\(\)\} interest/.test(src));
  assert('5f. the badge is wired into the row JSX (rendered, not just defined)', /repaymentBadge\(data, item\)/.test(src) && /styles\.txnBadge/.test(src));
  assert('5g. a BNPL repayment gets the same not-counted-as-spending badge (consistent with credit-card treatment)', /liability\?\.type === 'bnpl'\) return 'Repayment/.test(src));
  assert('5h. the monthly header total uses resolveTransactionAggregateSpendingAmount (never the cashflow resolver) — real behaviour proven directly against this same resolver in SECTION 6 (6k-iv)', /const expenses = txns\.filter\(\(t\) => t\.type === 'expense'\)\.reduce\(\(sum, t\) => sum \+ resolveTransactionAggregateSpendingAmount\(data, t\), 0\)/.test(src));
}

console.log('=== SECTION 6: Aggregate debt cost vs category-based coaching (final debt-cost correction) ===');
{
  // Category investigation (reported here, proven structurally): every
  // loan-repayment transaction confirmLoanRepaymentTransition creates is
  // stamped categoryId: 'cat-debt' — the SAME id a confirmed credit-card
  // repayment carries. defaultCategories.ts resolves 'cat-debt' to
  // { name: 'Debt repayments', type: 'expense' } — established (present
  // in the protected baseline, not created by this round), freely
  // customer-selectable for an ordinary ad-hoc entry, but NOT a category
  // specific to interest/fees, and automatically assigned (never
  // customer-chosen) for a repayment transaction.
  const appStateSrc = fs.readFileSync(path.join(__dirname, '../src/state/AppStateContext.tsx'), 'utf8');
  const defaultCategoriesSrc = fs.readFileSync(path.join(__dirname, '../src/lib/defaultCategories.ts'), 'utf8');
  assert("6-cat-a. confirmLoanRepaymentTransition stamps categoryId: 'cat-debt' on every loan repayment", /categoryId: 'cat-debt',[\s\S]{0,40}date: input\.date,[\s\S]{0,40}note: `\$\{liability\.label\} repayment`/.test(appStateSrc));
  assert("6-cat-b. confirmCreditCardRepaymentTransition stamps the SAME categoryId: 'cat-debt'", /categoryId: 'cat-debt',[\s\S]{0,40}date: input\.date,[\s\S]{0,40}note: `\$\{card\.label\} repayment`/.test(appStateSrc));
  assert("6-cat-c. 'cat-debt' resolves to the generic, pre-existing 'Debt repayments' label — not a dedicated interest/fees category", /\{ id: 'cat-debt', name: 'Debt repayments', type: 'expense'/.test(defaultCategoriesSrc));
  assert('6-cat-d. no dedicated debt-interest category (e.g. an id/name containing "interest") exists anywhere in the category list', !/interest/i.test(defaultCategoriesSrc));

  // 6-cat-e through 6-cat-h — REAL-FUNCTION proof (not source regex) that
  // suppression is keyed on repayment METADATA, never bare
  // `categoryId === 'cat-debt'`: a manual, non-repayment expense the
  // customer files under "Debt repayments" carries none of
  // isRepayment/isLoanRepayment/the BNPL-liability link, so it must
  // resolve and behave exactly like any other ordinary category.
  {
    const manualDebtCatData = baseData();
    const manualTxn: Transaction = { id: 'manual-debt', type: 'expense', amount: 120, categoryId: 'cat-debt', date: dISO('2026-08-13') };
    assert('6-cat-e. resolveTransactionCashflowAmount treats a manual cat-debt expense as full, ordinary cashflow', resolveTransactionCashflowAmount(manualDebtCatData, manualTxn) === 120);
    assert('6-cat-f. resolveTransactionAggregateSpendingAmount treats it as full, ordinary aggregate spending', resolveTransactionAggregateSpendingAmount(manualDebtCatData, manualTxn) === 120);
    assert('6-cat-g. resolveTransactionCategoryCoachingAmount treats it as full, ordinary category-coaching spending (never suppressed merely for its category)', resolveTransactionCategoryCoachingAmount(manualDebtCatData, manualTxn) === 120);

    // End-to-end through the real category-delta/insight engine: a manual
    // cat-debt expense with a real prior-period cat-debt baseline DOES
    // produce a real category delta — unlike every loan/card repayment
    // above, which never does regardless of baseline (proven in 6c/6j/6m).
    const manualDebtCatWithBaseline: AppData = {
      ...manualDebtCatData,
      transactions: [
        { id: 'manual-debt-prior', type: 'expense', amount: 100, categoryId: 'cat-debt', date: dISO('2026-06-20') },
        { id: 'manual-debt-current', type: 'expense', amount: 140, categoryId: 'cat-debt', date: dISO('2026-08-13') },
      ],
    };
    const manualDeltas = computeCategoryDeltas(manualDebtCatWithBaseline);
    assert('6-cat-h. a manual, non-repayment cat-debt expense DOES produce a real category delta given a real prior-period baseline — category reporting/coaching remains normal for it', manualDeltas.some((dd) => dd.categoryId === 'cat-debt' && dd.amount === 140 && dd.priorAmount === 100));
  }

  function loanFixture(principalCents: number | undefined, paymentCents: number, oldBalance: number) {
    let data = baseData();
    data = withCash(data, 10000);
    data = {
      ...data,
      liabilities: [{ id: 'loanX', type: 'mortgage', label: 'Home Loan', currentBalance: oldBalance }],
      recurringItems: [{ id: 'lrX', type: 'expense', label: 'Home Loan repayment', amount: paymentCents / 100, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: true, active: true, linkedLiabilityId: 'loanX' }],
    };
    return data;
  }

  // 6a-6g. A $1,500 mortgage repayment with a known $700 principal ($800 interest).
  let mortgageData = loanFixture(70000, 150000, 420000);
  const mortgageInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'lrX', liabilityId: 'loanX', expectedNextDueDate: dISO('2026-08-13'), amount: 1500, paymentSource: 'cash', updateBalance: true, newBalance: 419300, expectedCurrentBalance: 420000, transactionId: 'm1', date: dISO('2026-08-13'),
  };
  const mortgageConfirm = confirmLoanRepaymentTransition(mortgageData, mortgageInput);
  assert('6a-setup. known-split mortgage repayment confirms', mortgageConfirm.applied);
  if (mortgageConfirm.applied) {
    const activity = computeMonthToDateActivity(mortgageConfirm.data, d('2026-08-13'));
    assert('6a. This Month aggregate spending includes ONLY the known interest/fees ($800), never the $700 principal or the $1,500 total', activity.spend === 800);

    const cashflow = computeRecordedMonthlyCashflow(mortgageConfirm.data, d('2026-08-13'));
    assert('6b. Financial State recorded cashflow is reduced by exactly the same $800 known interest/fees (income $0 - spend $800 = -$800)', cashflow === -800);

    // 6c. A real prior-period 'cat-debt' baseline exists (so a category
    // delta WOULD form if the loan repayment's interest leaked into
    // category coaching) — proving the absence of a 'cat-debt' delta row
    // is a genuine exclusion, not merely "no baseline to compare against".
    const withPriorBaseline: AppData = {
      ...mortgageConfirm.data,
      transactions: [
        ...mortgageConfirm.data.transactions,
        { id: 'prior-debt', type: 'expense', amount: 100, categoryId: 'cat-debt', date: dISO('2026-06-20'), note: 'Prior-period debt entry' },
      ],
    };
    const deltas = computeCategoryDeltas(withPriorBaseline);
    assert("6c. principal and interest from a known-split loan repayment never enter computeCategoryDeltas — no 'cat-debt' delta row exists despite a real prior-period baseline", !deltas.some((dd) => dd.categoryId === 'cat-debt'));

    // 6d. With ONLY the loan repayment present, no Spending Insight or
    // goal-impact opportunity can be generated from it.
    const insights = computeSpendingInsights(mortgageConfirm.data);
    assert('6d. a principal-and-interest mortgage repayment alone cannot generate a Spending Insight', insights.length === 0);

    const dataWithGoal: AppData = {
      ...withPriorBaseline,
      goals: [{ id: 'g1', name: 'Emergency fund', lifeGoalType: 'emergency_fund', targetAmount: 6000, currentAmount: 0, targetDate: dISO('2027-08-13'), status: 'active' }],
    };
    const opportunity = buildGoalImpactOpportunity(dataWithGoal);
    assert('6e. a known-split loan repayment cannot generate a goal-impact "reduce this category" opportunity (no qualifying category delta exists to drive it, even with a real active goal present)', opportunity === null);

    // 6f-6g. Reversing restores the original (pre-confirmation) totals.
    const reversedMortgage = reverseLoanRepaymentTransaction(mortgageConfirm.data, 'm1');
    assert('6f. reversing the known-split mortgage repayment applies', reversedMortgage.applied);
    if (reversedMortgage.applied) {
      const activityAfter = computeMonthToDateActivity(reversedMortgage.data, d('2026-08-13'));
      assert('6g. reversal restores This Month aggregate spending to $0 (the original, pre-confirmation total)', activityAfter.spend === 0);
      const liabAfter = reversedMortgage.data.liabilities.find((l) => l.id === 'loanX')!;
      assert('6g-i. reversal restores the recorded loan balance exactly ($420,000)', liabAfter.currentBalance === 420000);
    }
  }

  // 6h-6j. Interest-only repayment (principal $0) — counts FULLY in
  // aggregate spending/cashflow, but still cannot drive category coaching.
  let interestOnlyData = loanFixture(0, 150000, 420000);
  const interestOnlyInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'lrX', liabilityId: 'loanX', expectedNextDueDate: dISO('2026-08-13'), amount: 1500, paymentSource: 'cash', updateBalance: true, newBalance: 420000, expectedCurrentBalance: 420000, transactionId: 'm2', date: dISO('2026-08-13'),
  };
  const interestOnlyConfirm = confirmLoanRepaymentTransition(interestOnlyData, interestOnlyInput);
  assert('6h-setup. interest-only repayment confirms', interestOnlyConfirm.applied);
  if (interestOnlyConfirm.applied) {
    const activity = computeMonthToDateActivity(interestOnlyConfirm.data, d('2026-08-13'));
    assert('6h. an interest-only repayment counts its FULL $1,500 in This Month aggregate spending (every dollar is known interest)', activity.spend === 1500);
    const cashflow = computeRecordedMonthlyCashflow(interestOnlyConfirm.data, d('2026-08-13'));
    assert('6h-i. Financial State recorded cashflow is reduced by the full $1,500', cashflow === -1500);
    const insights = computeSpendingInsights(interestOnlyConfirm.data);
    assert('6i. an interest-only repayment alone still cannot generate discretionary category coaching (Spending Insights empty)', insights.length === 0);
    const deltas = computeCategoryDeltas(interestOnlyConfirm.data);
    assert('6j. an interest-only repayment never produces a category delta', deltas.length === 0);
  }

  // 6k. Unknown-split repayment — the FINAL, authoritative resolution: an
  // unknown-split loan repayment is a real recorded cash outflow, so
  // Financial State/recorded cashflow conservatively uses the full amount;
  // but Navilo cannot identify any of it as interest or an expense, so it
  // must NEVER be presented as This Month "Spent", a spending-source total,
  // Transaction History's monthly header, or any category/coaching input.
  // Aggregate spending and recorded cashflow are deliberately DIFFERENT
  // measures for this one case — see repaymentAccounting.ts's module
  // header for the full three-measure contract.
  let unknownSplitData = loanFixture(undefined, 150000, 420000);
  const unknownSplitInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'lrX', liabilityId: 'loanX', expectedNextDueDate: dISO('2026-08-13'), amount: 1500, paymentSource: 'cash', updateBalance: false, expectedCurrentBalance: 420000, transactionId: 'm3', date: dISO('2026-08-13'),
  };
  const unknownSplitConfirm = confirmLoanRepaymentTransition(unknownSplitData, unknownSplitInput);
  assert('6k-setup. unknown-split repayment confirms', unknownSplitConfirm.applied);
  if (unknownSplitConfirm.applied) {
    const cashflow = computeRecordedMonthlyCashflow(unknownSplitConfirm.data, d('2026-08-13'));
    assert('6k. Financial State recorded cashflow counts the FULL $1,500 (real cash left the account, never understated)', cashflow === -1500);

    const activity = computeMonthToDateActivity(unknownSplitConfirm.data, d('2026-08-13'));
    assert('6k-i. This Month "Spent" (aggregate spending) is $0 — DIVERGES from recorded cashflow (6k) — Navilo cannot identify any of it as an expense', activity.spend === 0);

    const summary = computeThisMonthRecordedSummary(unknownSplitConfirm.data, d('2026-08-13'));
    assert('6k-ii. This Month spending-source breakdown totals $0 for this transaction', summary.spendingCents === 0);
    assert('6k-iii. no spending-source row is generated from it (no fabricated $0 bucket either)', summary.spendingSources.length === 0);

    // Transaction History's monthly header (TransactionsScreen.tsx's
    // groupByMonth) is not real-importable (React Native TSX) — proven
    // structurally in SECTION 5 below that it uses
    // resolveTransactionAggregateSpendingAmount (the SAME resolver 6k-i
    // just proved resolves to $0 here), so the header total is
    // structurally guaranteed to be $0 too, without a duplicate resolver.
    assert('6k-iv. the resolver TransactionsScreen.tsx uses for its monthly header independently confirms $0 for this exact transaction', resolveTransactionAggregateSpendingAmount(unknownSplitConfirm.data, unknownSplitConfirm.data.transactions.find((t) => t.id === 'm3')!) === 0);

    const insights = computeSpendingInsights(unknownSplitConfirm.data);
    assert('6l. an unknown-split repayment alone cannot generate discretionary category coaching (Spending Insights empty)', insights.length === 0);
    const deltas = computeCategoryDeltas(unknownSplitConfirm.data);
    assert('6m. an unknown-split repayment never produces a category delta', deltas.length === 0);
    const dataWithGoalUnknown: AppData = {
      ...unknownSplitConfirm.data,
      goals: [{ id: 'gU', name: 'Emergency fund', lifeGoalType: 'emergency_fund', targetAmount: 6000, currentAmount: 0, targetDate: dISO('2027-08-13'), status: 'active' }],
    };
    assert('6m-i. an unknown-split repayment cannot generate a goal-impact opportunity either', buildGoalImpactOpportunity(dataWithGoalUnknown) === null);

    // The full payment remains visible as its OWN individual Transaction
    // History row — only the aggregate/category TOTALS exclude it, never
    // the row itself.
    const rawTxn = unknownSplitConfirm.data.transactions.find((t) => t.id === 'm3')!;
    assert('6m-ii. the full $1,500 payment remains visible as its own individual transaction record (row-level exclusion never happens)', rawTxn.amount === 1500);
    assert('6m-iii. the row carries no principalAmount (the unknown-split identity Transaction History keys its "Balance not updated" badge on)', rawTxn.principalAmount === undefined);

    // Reversal restores every affected measure and balance to its exact
    // prior value.
    const reversedUnknown = reverseLoanRepaymentTransaction(unknownSplitConfirm.data, 'm3');
    assert('6m-iv. reversing the unknown-split repayment applies', reversedUnknown.applied);
    if (reversedUnknown.applied) {
      const cashflowAfter = computeRecordedMonthlyCashflow(reversedUnknown.data, d('2026-08-13'));
      assert('6m-v. reversal restores Financial State recorded cashflow to $0', cashflowAfter === 0);
      const activityAfter = computeMonthToDateActivity(reversedUnknown.data, d('2026-08-13'));
      assert('6m-vi. reversal leaves This Month aggregate spending at $0 (unchanged — it was already $0)', activityAfter.spend === 0);
      const cashAfter = reversedUnknown.data.assets.find((a) => a.id === 'cash1')!;
      assert('6m-vii. reversal restores the funding Cash balance exactly ($10,000)', cashAfter.currentValue === 10000);
      const liabAfter = reversedUnknown.data.liabilities.find((l) => l.id === 'loanX')!;
      assert('6m-viii. reversal leaves the recorded loan balance untouched at $420,000 (it was never touched by an unknown-split repayment to begin with)', liabAfter.currentBalance === 420000);
    }
  }

  // 6n. Control case — an ordinary bill still fully participates in BOTH
  // aggregate spending AND real category-delta coaching (proves the
  // exclusion is scoped to loan/card repayments only, never overreaching
  // into ordinary bills).
  let ordinaryData = baseData();
  ordinaryData = withCash(ordinaryData, 5000);
  ordinaryData = {
    ...ordinaryData,
    transactions: [{ id: 'prior-groceries', type: 'expense', amount: 200, categoryId: 'cat-groceries', date: dISO('2026-06-20') }],
    recurringItems: [{ id: 'billX', type: 'expense', label: 'Groceries run', amount: 300, frequency: 'monthly', nextDueDate: dISO('2026-08-13'), isFixed: false, active: true }],
  };
  const billConfirm = confirmRecurringOccurrenceTransition(ordinaryData, {
    recurringItemId: 'billX', expectedNextDueDate: dISO('2026-08-13'), paymentSource: 'cash', transactionId: 'billX-t', date: dISO('2026-08-13'),
  });
  assert('6n-setup. ordinary bill confirms', billConfirm.applied);
  if (billConfirm.applied) {
    const activity = computeMonthToDateActivity(billConfirm.data, d('2026-08-13'));
    assert('6n. an ordinary bill still counts fully in This Month aggregate spending', activity.spend === 300);
    const dataForCategoryId: AppData = billConfirm.data;
    const groceriesTxn = dataForCategoryId.transactions.find((t) => t.id === 'billX-t')!;
    // The confirmed bill's categoryId is the RecurringItem's own (absent
    // here, defaults through whatever confirmRecurringOccurrenceTransition
    // assigns) — for this control case we only need to prove a real,
    // non-repayment expense still participates in category coaching, so we
    // directly check the resolver rather than depending on which category
    // id the confirmation transition happens to assign.
    assert('6n-i. an ordinary bill resolves to its full amount for category-coaching eligibility (unlike every loan repayment above)', resolveTransactionCategoryCoachingAmount(billConfirm.data, groceriesTxn) === 300);
  }

  // 6o-6p. Credit-card repayment remains excluded from BOTH aggregate
  // spending and category coaching, and reversal restores original totals.
  let cardData = baseData();
  cardData = withCash(cardData, 5000);
  cardData = withCard(cardData, { currentBalance: 1000 });
  const cardInput: ConfirmCreditCardRepaymentInput = {
    creditCardId: 'card1', amount: 300, paymentSource: 'cash', expectedCardBalance: 1000, transactionId: 'crep1', date: dISO('2026-08-13'),
  };
  const cardConfirm = confirmCreditCardRepaymentTransition(cardData, cardInput);
  assert('6o-setup. credit-card repayment confirms', cardConfirm.applied);
  if (cardConfirm.applied) {
    const activity = computeMonthToDateActivity(cardConfirm.data, d('2026-08-13'));
    assert('6o. a credit-card repayment remains fully excluded from This Month aggregate spending', activity.spend === 0);
    const deltas = computeCategoryDeltas(cardConfirm.data);
    assert('6o-i. a credit-card repayment produces no category delta', deltas.length === 0);

    const reversedCard = reverseCreditCardRepaymentTransaction(cardConfirm.data, 'crep1');
    assert('6p. reversing the credit-card repayment applies', reversedCard.applied);
    if (reversedCard.applied) {
      const activityAfter = computeMonthToDateActivity(reversedCard.data, d('2026-08-13'));
      assert('6p-i. reversal leaves This Month aggregate spending at $0 (unchanged — it was already excluded)', activityAfter.spend === 0);
      const cardAfter = reversedCard.data.creditCards.find((c) => c.id === 'card1')!;
      assert('6p-ii. reversal restores the card balance exactly ($1,000)', cardAfter.currentBalance === 1000);
    }
  }
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
