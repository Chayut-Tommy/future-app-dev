/**
 * Pass 2D device-test correction round — bill payment funding sources,
 * credit-card repayment engine, reminder exhaustion/briefing reflow,
 * Financial Rebuild action mapping, and the AUP double-count fix.
 *
 * CLASSIFICATION (per tests/README.md's evidence taxonomy):
 * - Real import (Class A): confirmRecurringOccurrenceTransition,
 *   confirmCreditCardRepaymentTransition, reverseCreditCardRepaymentTransaction,
 *   computeSafeToSpend, computeSummaryForMonth, resolveEligibleBillPaymentSources,
 *   resolveFinancialRebuildGoalActionLabel, computeTopReminder,
 *   selectTodayBriefingEventRows — all imported and executed directly.
 * - Structural: regex/string matches against SmartReminderCard.tsx,
 *   ReminderDetailSheet.tsx, FinancialStateCard.tsx, TodayScreen.tsx (.tsx
 *   files cannot be imported by tsx — see tests/README.md). Rendered-UI
 *   proof (the picker actually appearing, the sheet actually closing) is
 *   left to the physical-device checklist.
 */
import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import {
  confirmRecurringOccurrenceTransition,
  confirmCreditCardRepaymentTransition,
  reverseCreditCardRepaymentTransaction,
} from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeSummaryForMonth } from '../src/lib/calculations/monthlySummary';
import { resolveEligibleBillPaymentSources } from '../src/lib/calculations/billPaymentSources';
import { resolveFinancialRebuildGoalActionLabel, computeFinancialState } from '../src/lib/calculations/financialState';
import { computeTopReminder } from '../src/lib/calculations/reminders';
import { selectTodayBriefingEventRows } from '../src/lib/calculations/todayBriefing';
import type { AppData } from '../src/types/models';

let total = 0;
let failures = 0;
function assert(label: string, condition: boolean) {
  total++;
  if (!condition) {
    failures++;
    console.log(`FAIL — ${label}`);
  } else {
    console.log(`PASS — ${label}`);
  }
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'fortnightly';
  d.user.nextPayday = daysFromNow(10);
  return d;
}

const SMART_REMINDER_SRC = readFileSync('src/components/today/SmartReminderCard.tsx', 'utf8');
const REMINDER_SHEET_SRC = readFileSync('src/components/today/ReminderDetailSheet.tsx', 'utf8');
const FINANCIAL_STATE_CARD_SRC = readFileSync('src/components/today/FinancialStateCard.tsx', 'utf8');
const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');

console.log('=== 1. BILL PAYMENT FUNDING SOURCES (real import) ===');
{
  // 1a. Eligible source resolver — cash, everyday, credit cards; never savings.
  {
    const data = baseData();
    data.assets = [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 } as any,
      { id: 'ed1', type: 'everyday', label: 'Everyday', currentValue: 300 } as any,
      { id: 'sav1', type: 'savings', label: 'Savings', currentValue: 1000 } as any,
    ];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 200, dueDay: 15, minimumPayment: 25 } as any];
    const sources = resolveEligibleBillPaymentSources(data.assets, data.creditCards);
    assert('resolver includes the Cash asset', sources.some((s) => s.kind === 'asset' && s.assetType === 'cash' && s.id === 'cash1'));
    assert('resolver includes the Everyday asset', sources.some((s) => s.kind === 'asset' && s.assetType === 'everyday' && s.id === 'ed1'));
    assert('resolver includes the credit card, showing its owed balance', sources.some((s) => s.kind === 'credit_card' && s.id === 'card1' && s.currentValue === 200));
    assert('resolver NEVER includes the Savings asset — no paymentSource value supports funding an expense from savings', !sources.some((s) => s.kind === 'asset' && (s as any).assetType === 'savings'));
    assert('resolver returns exactly 3 eligible sources (cash, everyday, 1 card) for this fixture', sources.length === 3);
  }

  // 1b. Real transition — cash-funded bill: exact balance/transaction effect, occurrence advances.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Internet', amount: 79.99, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const before = data.recurringItems[0].nextDueDate;
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: before,
      paymentSource: 'cash',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('cash-funded bill confirmation applies', result.applied);
    if (result.applied) {
      const cash = result.data.assets.find((a) => a.id === 'cash1')!;
      assert('cash balance decreases by exactly the bill amount (exact cents)', Math.round((500 - cash.currentValue) * 100) === Math.round(79.99 * 100));
      const tx = result.data.transactions.find((t) => t.id === 'tx1')!;
      assert('exactly one expense transaction created, correct payment-source snapshot', tx.type === 'expense' && tx.paymentSource === 'cash' && tx.amount === 79.99);
      assert('recurring occurrence advances past the confirmed date (next occurrence preserved, not deleted)', new Date(result.data.recurringItems[0].nextDueDate).getTime() > new Date(before).getTime());
      assert('the recurring item itself still exists (only this occurrence completed, not the schedule)', result.data.recurringItems.length === 1);
    }
  }

  // 1c. Real transition — everyday-account-funded bill (device-test correction: previously unreachable for ordinary bills).
  {
    const data = baseData();
    data.assets = [{ id: 'ed1', type: 'everyday', label: 'Everyday', currentValue: 200 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Phone', amount: 45, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'everyday',
      targetAssetId: 'ed1',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('everyday-account-funded bill confirmation applies (was previously rejected — invalid_source)', result.applied);
    if (result.applied) {
      const ed = result.data.assets.find((a) => a.id === 'ed1')!;
      assert('everyday account balance decreases by exactly the bill amount', ed.currentValue === 155);
      const tx = result.data.transactions.find((t) => t.id === 'tx1')!;
      assert('transaction records paymentSource=everyday and the correct targetAssetId', tx.paymentSource === 'everyday' && tx.targetAssetId === 'ed1');
    }
  }

  // 1d. Real transition — credit-card-funded bill now uses the EXPLICITLY
  // chosen card, never a hard-coded data.creditCards[0].
  {
    const data = baseData();
    data.creditCards = [
      { id: 'card1', issuer: 'Bank A', label: 'Card A', creditLimit: 5000, currentBalance: 0, dueDay: 10, minimumPayment: 25 } as any,
      { id: 'card2', issuer: 'Bank B', label: 'Card B', creditLimit: 5000, currentBalance: 0, dueDay: 20, minimumPayment: 25 } as any,
    ];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Streaming', amount: 15, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'credit_card',
      creditCardId: 'card2',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('credit-card-funded bill confirmation applies with an explicit second card', result.applied);
    if (result.applied) {
      const card1 = result.data.creditCards.find((c) => c.id === 'card1')!;
      const card2 = result.data.creditCards.find((c) => c.id === 'card2')!;
      assert('the chosen card (card2) increases by exactly the bill amount', card2.currentBalance === 15);
      assert('the OTHER card (card1, the array[0]) is completely untouched — proves no more data.creditCards[0] hardcoding', card1.currentBalance === 0);
    }
  }

  // 1e. Missing/deleted credit card fails safely — no partial mutation.
  {
    const data = baseData();
    data.creditCards = [];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Streaming', amount: 15, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const result = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'credit_card',
      creditCardId: 'nonexistent',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('credit-card bill confirmation with a non-existent/disappeared card fails safely (balance_target_missing), no mutation', !result.applied && result.reason === 'balance_target_missing');
  }

  // 1f. Duplicate-confirmation protection — a second, rapid confirmation
  // against the SAME pre-tap snapshot (same expectedNextDueDate) rejects
  // as stale once the first has been applied against a fresh data object.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Internet', amount: 50, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const expectedDate = data.recurringItems[0].nextDueDate;
    const first = confirmRecurringOccurrenceTransition(data, { recurringItemId: 'bill1', expectedNextDueDate: expectedDate, paymentSource: 'cash', transactionId: 'tx1', date: daysFromNow(0) });
    assert('first confirmation applies', first.applied);
    const second = confirmRecurringOccurrenceTransition(first.applied ? first.data : data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: expectedDate,
      paymentSource: 'cash',
      transactionId: 'tx2',
      date: daysFromNow(0),
    });
    assert('a second confirmation against the same pre-tap expectedNextDueDate is rejected as stale (rapid duplicate-tap protection)', !second.applied && second.reason === 'stale');
    if (first.applied) {
      const cash = first.data.assets.find((a) => a.id === 'cash1')!;
      assert('cash was only ever debited once ($450, not $400 from a double-application)', cash.currentValue === 450);
    }
  }
}

console.log('\n=== 2. CREDIT CARD REPAYMENT ENGINE (real import) ===');
{
  // 2a. Full payment — atomic two-target effect, correct transaction shape.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 2000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 40 } as any];
    const netWorthBefore = data.assets[0].currentValue - data.creditCards[0].currentBalance;

    const result = confirmCreditCardRepaymentTransition(data, {
      creditCardId: 'card1',
      amount: 1000,
      paymentSource: 'cash',
      expectedCardBalance: 1000,
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('full repayment applies', result.applied);
    if (result.applied) {
      const cash = result.data.assets.find((a) => a.id === 'cash1')!;
      const card = result.data.creditCards.find((c) => c.id === 'card1')!;
      assert('funding cash asset decreases by exactly the payment amount', cash.currentValue === 1000);
      assert('card balance decreases by exactly the payment amount (fully paid off)', card.currentBalance === 0);
      const tx = result.data.transactions.find((t) => t.id === 'tx1')!;
      assert('exactly one transaction created, marked isRepayment, with source+destination snapshot', tx.isRepayment === true && tx.paymentSource === 'cash' && tx.creditCardId === 'card1' && tx.amount === 1000);
      const netWorthAfter = cash.currentValue - card.currentBalance;
      assert('net worth is unchanged by the repayment (equal asset/liability movement)', Math.abs(netWorthAfter - netWorthBefore) < 0.001);
    }
  }

  // 2b. Partial payment — everyday-account-funded, no cap needed (< balance).
  {
    const data = baseData();
    data.assets = [{ id: 'ed1', type: 'everyday', label: 'Everyday', currentValue: 500 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 40 } as any];
    const result = confirmCreditCardRepaymentTransition(data, {
      creditCardId: 'card1',
      amount: 40,
      paymentSource: 'everyday',
      targetAssetId: 'ed1',
      expectedCardBalance: 1000,
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('partial (minimum) payment applies', result.applied);
    if (result.applied) {
      const ed = result.data.assets.find((a) => a.id === 'ed1')!;
      const card = result.data.creditCards.find((c) => c.id === 'card1')!;
      assert('everyday account decreases by exactly $40', ed.currentValue === 460);
      assert('card balance decreases by exactly $40, leaving $960 owed', card.currentBalance === 960);
    }
  }

  // 2c. Final Pass 2D device-test correction — supersedes this transition's
  // own ORIGINAL decision (documented in the comment this replaces): an
  // overpayment beyond the current balance is now REJECTED, per an explicit
  // product decision this later round made ("The dedicated Record Payment
  // flow must not create a negative credit-card liability"). This is a
  // strengthening, not a weakening — it proves the new 'exceeds_balance'
  // cap is real and enforced, superseding the earlier-round assertion that
  // (correctly, at the time) proved the opposite. applyEffectDelta's own
  // 'credit_card' branch is UNCHANGED and still never floors — the cap
  // lives here, as this transition's own pre-validation, not in the shared
  // effect engine (see confirmCreditCardRepaymentTransition's own doc
  // comment for the full contract).
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 2000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 100, dueDay: 15, minimumPayment: 25 } as any];
    const result = confirmCreditCardRepaymentTransition(data, {
      creditCardId: 'card1',
      amount: 150,
      paymentSource: 'cash',
      expectedCardBalance: 100,
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert(
      'final Pass 2D device-test correction: an overpayment beyond the current balance is now REJECTED (exceeds_balance) — the dedicated MVP repayment flow must never create a negative card balance',
      result.applied === false && (!result.applied ? result.reason === 'exceeds_balance' : true)
    );
  }

  // 2d. Invalid amounts rejected — zero, negative, NaN.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 2000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 500, dueDay: 15, minimumPayment: 25 } as any];
    for (const badAmount of [0, -50, NaN]) {
      const result = confirmCreditCardRepaymentTransition(data, {
        creditCardId: 'card1',
        amount: badAmount,
        paymentSource: 'cash',
        expectedCardBalance: 500,
        transactionId: 'tx-bad',
        date: daysFromNow(0),
      });
      assert(`amount ${badAmount} is rejected as invalid_amount, no mutation`, !result.applied && result.reason === 'invalid_amount');
    }
  }

  // 2e. Insufficient source balance rejected.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 10 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 500, dueDay: 15, minimumPayment: 25 } as any];
    const result = confirmCreditCardRepaymentTransition(data, {
      creditCardId: 'card1',
      amount: 100,
      paymentSource: 'cash',
      expectedCardBalance: 500,
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('repayment beyond the funding account balance is rejected (insufficient_source_balance)', !result.applied && result.reason === 'insufficient_source_balance');
  }

  // 2f. Duplicate-tap protection — stale expectedCardBalance.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 2000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 500, dueDay: 15, minimumPayment: 25 } as any];
    const first = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 100, paymentSource: 'cash', expectedCardBalance: 500, transactionId: 'tx1', date: daysFromNow(0) });
    assert('first repayment applies', first.applied);
    // Mirrors the real double-tap architecture: the context wrapper reads
    // dataRef.current fresh for every call, so a second, rapid tap's
    // transition runs against the FIRST call's already-committed result
    // (first.data) while still carrying the stale expectedCardBalance the
    // UI captured before either tap (500, not the now-reduced $400).
    const second = confirmCreditCardRepaymentTransition(first.applied ? first.data : data, {
      creditCardId: 'card1',
      amount: 100,
      paymentSource: 'cash',
      expectedCardBalance: 500,
      transactionId: 'tx2',
      date: daysFromNow(0),
    });
    assert("a second confirmation carrying the stale (pre-first-tap) expectedCardBalance rejects once run against the first call's already-committed state (rapid duplicate-tap protection, mirrors confirmBnplRepayment's staleness guard)", !second.applied && second.reason === 'stale');
  }

  // 2g. Reversal restores both balances atomically.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 2000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 500, dueDay: 15, minimumPayment: 25 } as any];
    const confirmed = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 200, paymentSource: 'cash', expectedCardBalance: 500, transactionId: 'tx1', date: daysFromNow(0) });
    assert('repayment to reverse applies', confirmed.applied);
    if (confirmed.applied) {
      const reversed = reverseCreditCardRepaymentTransaction(confirmed.data, 'tx1');
      assert('reversal applies', reversed.applied);
      if (reversed.applied) {
        const cash = reversed.data.assets.find((a) => a.id === 'cash1')!;
        const card = reversed.data.creditCards.find((c) => c.id === 'card1')!;
        assert('cash balance fully restored to $2000', cash.currentValue === 2000);
        assert('card balance fully restored to $500', card.currentBalance === 500);
        assert('the repayment transaction itself is removed', !reversed.data.transactions.some((t) => t.id === 'tx1'));
      }
    }
  }

  // 2h. Reversal on a non-repayment transaction is rejected.
  {
    const data = baseData();
    data.transactions = [{ id: 'tx1', type: 'expense', amount: 50, categoryId: 'cat-other-expense', date: daysFromNow(0) } as any];
    const reversed = reverseCreditCardRepaymentTransaction(data, 'tx1');
    assert('reversing an ordinary (non-repayment) transaction is rejected (not_a_credit_card_repayment)', !reversed.applied && reversed.reason === 'not_a_credit_card_repayment');
  }
}

console.log('\n=== 3. REPAYMENT EXCLUSION FROM SPENDING (real import) ===');
{
  // 3a. This Month (computeSummaryForMonth) — repayment excluded from
  // recorded expenses, matching the recurringItemId exclusion pattern.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 5000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 40 } as any];
    const before = computeSummaryForMonth(data, new Date().getFullYear(), new Date().getMonth());
    const confirmed = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 500, paymentSource: 'cash', expectedCardBalance: 1000, transactionId: 'tx1', date: daysFromNow(0) });
    assert('repayment applies for This Month exclusion test', confirmed.applied);
    if (confirmed.applied) {
      const after = computeSummaryForMonth(confirmed.data, new Date().getFullYear(), new Date().getMonth());
      assert('This Month recorded expenses are UNCHANGED by a $500 repayment — it is never counted as new consumer spending', after.expenses === before.expenses);
    }
  }

  // 3b. AUP remainingPool — the confirmed pre-existing double-count bug for
  // recurringItemId-linked bill transactions, now fixed.
  {
    const data = baseData();
    data.user.monthlyIncome = 4000;
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 3000 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Rent', amount: 1500, frequency: 'monthly', isFixed: true, active: true, nextDueDate: daysFromNow(0) } as any,
    ];
    const before = computeSafeToSpend(data, new Date());
    const confirmed = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('bill confirmation applies for remainingPool double-count test', confirmed.applied);
    if (confirmed.applied) {
      const after = computeSafeToSpend(confirmed.data, new Date());
      // Before the fix: remainingPool would drop by the bill amount a SECOND
      // time (once via fixedCosts already baked into discretionaryPool,
      // again via variableSpendSoFar counting the new transaction) — i.e.
      // after.remainingPool would be roughly discretionaryPool - 2*1500
      // instead of discretionaryPool - 0 (fixedCosts already reflects a
      // recurring bill regardless of whether it's been confirmed this
      // instant). Confirming a bill must not change remainingPool at all,
      // since fixedCosts (a RATE) already assumed it happens every month.
      assert('remainingPool is unaffected by confirming a bill whose cost is already a recurring fixed-cost RATE (double-count fixed)', after.remainingPool === before.remainingPool);
    }
  }

  // 3c. AUP remainingPool — a confirmed credit-card repayment is likewise excluded.
  {
    const data = baseData();
    data.user.monthlyIncome = 4000;
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 3000 } as any];
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 40, expectedMonthlyRepayment: 100 } as any];
    const before = computeSafeToSpend(data, new Date());
    const confirmed = confirmCreditCardRepaymentTransition(data, { creditCardId: 'card1', amount: 100, paymentSource: 'cash', expectedCardBalance: 1000, transactionId: 'tx1', date: daysFromNow(0) });
    assert('repayment applies for remainingPool exclusion test', confirmed.applied);
    if (confirmed.applied) {
      const after = computeSafeToSpend(confirmed.data, new Date());
      assert('remainingPool is unaffected by confirming a card repayment whose cost is already reflected via resolveExpectedMonthlyRepayment', after.remainingPool === before.remainingPool);
    }
  }
}

console.log('\n=== 4. FINANCIAL REBUILD VS CASHFLOW FOCUS ACTIONS ===');
{
  assert("resolveFinancialRebuildGoalActionLabel(false) returns 'Add a goal'", resolveFinancialRebuildGoalActionLabel(false) === 'Add a goal');
  assert("resolveFinancialRebuildGoalActionLabel(true) returns 'Review goals'", resolveFinancialRebuildGoalActionLabel(true) === 'Review goals');

  assert(
    'FinancialStateCard.tsx branches on state.key === financial_rebuild to select a distinct 2-action set (reviewNetWorth/goal), never the generic 3-action set for that state',
    /state\.key === 'financial_rebuild'/.test(FINANCIAL_STATE_CARD_SRC) && /reviewNetWorth/.test(FINANCIAL_STATE_CARD_SRC) && /resolveFinancialRebuildGoalActionLabel/.test(FINANCIAL_STATE_CARD_SRC)
  );
  assert(
    'Cashflow Focus (the non-financial_rebuild branch) still renders exactly the original three actions (income/bills/spending) — untouched',
    /'Add income'/.test(FINANCIAL_STATE_CARD_SRC) && /'Add bills'/.test(FINANCIAL_STATE_CARD_SRC) && /'Review spending'/.test(FINANCIAL_STATE_CARD_SRC)
  );
  assert(
    'TodayScreen.tsx wires reviewNetWorth to the existing Wealth route and goal to the existing Goals route/AddGoalModal — no new/duplicate destination',
    /reviewNetWorth: \(\) => navigation\.navigate\('Wealth'\)/.test(TODAY_SCREEN_SRC) &&
      /goal: \(\) => \(hasActiveGoal \? navigation\.navigate\('Goals'\) : setGoalModalVisible\(true\)\)/.test(TODAY_SCREEN_SRC)
  );

  // Real proof computeFinancialState/its thresholds are untouched by this
  // pass — same state matrix, same inputs, unmodified.
  {
    const data = baseData();
    data.liabilities = [{ id: 'l1', type: 'personal_loan', label: 'Loan', currentBalance: 50000 } as any];
    const state = computeFinancialState(data);
    assert('computeFinancialState still correctly classifies a large-liability/no-asset account as financial_rebuild — threshold logic unchanged', state.key === 'financial_rebuild');
  }
}

console.log('\n=== 5. REMINDER EXHAUSTION AND BRIEFING REFLOW (real import) ===');
{
  // 5a. Confirming the only reminder removes it immediately — the next
  // computeTopReminder call (same data-driven recomputation every render
  // already uses) can no longer select it.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Internet', amount: 50, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const before = computeTopReminder(data, new Date());
    assert('fixture sanity: a reminder is genuinely selected before confirmation', before !== null && before.recurringItemId === 'bill1');
    const confirmed = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('confirmation applies', confirmed.applied);
    if (confirmed.applied) {
      const after = computeTopReminder(confirmed.data, new Date());
      assert('the SAME occurrence is never selected again immediately after confirmation (no lingering reminder)', after === null || after.recurringItemId !== 'bill1' || after.occurrenceDate !== before!.occurrenceDate);
    }
  }

  // 5b. Confirming does not remove FUTURE recurring occurrences — the
  // recurring item itself, and its next due date, survive.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 } as any];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Internet', amount: 50, frequency: 'monthly', nextDueDate: daysFromNow(0), isFixed: true, active: true } as any,
    ];
    const confirmed = confirmRecurringOccurrenceTransition(data, {
      recurringItemId: 'bill1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      transactionId: 'tx1',
      date: daysFromNow(0),
    });
    assert('confirmation applies for future-occurrence-retained test', confirmed.applied);
    if (confirmed.applied) {
      assert('the RecurringItem still exists and is still active — only the ONE occurrence completed, future occurrences remain scheduled', confirmed.data.recurringItems.some((r) => r.id === 'bill1' && r.active));
    }
  }

  // 5c. Zero, one, two contextual Briefing rows — real reflow, no filler.
  // Real TimelineEvent shape: selectUrgentOutflowEvents requires amount<0,
  // daysUntil<=7, kind in {bill,mortgage,credit_card}.
  {
    assert('zero contextual rows: no reminder, no events -> zero event rows selected', selectTodayBriefingEventRows([], null).length === 0);
    const oneEvent = [
      { id: 'e1', date: new Date(daysFromNow(1)), daysUntil: 1, kind: 'bill' as const, icon: 'calendar-outline' as const, label: 'Rent due', amount: -1500, recurringItemId: 'b1' },
    ];
    assert('one contextual row: no reminder, one real (eligible) event -> exactly one event row, no filler added', selectTodayBriefingEventRows(oneEvent as any, null).length === 1);
    const twoEvents = [
      { id: 'e1', date: new Date(daysFromNow(1)), daysUntil: 1, kind: 'bill' as const, icon: 'calendar-outline' as const, label: 'Rent due', amount: -1500, recurringItemId: 'b1' },
      { id: 'e2', date: new Date(daysFromNow(2)), daysUntil: 2, kind: 'bill' as const, icon: 'calendar-outline' as const, label: 'Phone due', amount: -45, recurringItemId: 'b2' },
    ];
    assert('two contextual rows: no reminder, two real (eligible, distinct) events -> exactly two event rows (the maximum for the no-reminder case)', selectTodayBriefingEventRows(twoEvents as any, null).length === 2);
    const reminder = { id: 'r1', kind: 'bill_overdue' as const, title: 'Rent overdue', body: 'It is overdue.', recurringItemId: 'bill1', occurrenceDate: daysFromNow(-1), amount: 100 };
    assert('with a reminder present, event rows are capped at 1 (AUP + reminder + 1 event = 3 max, never a 4th filler row)', selectTodayBriefingEventRows(twoEvents as any, reminder as any).length <= 1);
  }
}

console.log('\n=== 6. BLANK REMINDER SHEET (Structural) ===');
{
  // ORIGINAL PROTECTION (this section): an effect reacting to topReminder
  // transitioning non-null -> null WHILE visible, later superseded by a
  // pinned displayedReminder + handleSettled()/topReminderRef mechanism
  // (the immediately prior device-test round's own fix).
  // WHY STALE (again): the final Pass 2D device-test correction (native-
  // Modal-lifecycle round) replaced THAT mechanism too — not because it was
  // reactive/wrong (it wasn't), but because the user identified a deeper,
  // independent defect: LoanRepaymentSheet.tsx/CreditCardRepaymentSheet.tsx
  // each still owned a SECOND native Modal stacked underneath
  // ReminderDetailSheet.tsx's own. handleSettled()/displayedReminder/
  // topReminderRef are gone; ReminderDetailSheet.tsx is now driven by
  // useReducer(reduceReminderLifecycle, ...) — see
  // reminderInteractionLifecycle.ts and pass-2d-interaction-lifecycle-
  // correction.test.ts §2 for the full real-function reducer test suite.
  // REPLACEMENT: the exact same "no blank sheet after the last reminder"
  // guarantee this assertion originally verified is now proven by
  // pass-2d-interaction-lifecycle-correction.test.ts's own §2c (a REAL call
  // to reduceReminderLifecycle with a SETTLED/null event, not a regex) — a
  // strictly stronger form of proof. This assertion is retargeted at the
  // NEW mechanism's own equivalent structural facts instead of duplicating
  // that real-function coverage here.
  assert(
    // WHY STALE: Reminder queue correction round generalized handleSettled
    // into advanceToNextEligible, which additionally excludes this
    // session's deferred/acknowledged occurrences via computeRankedReminder
    // — same single settlement decision point, still dispatches SETTLED
    // with a freshly computed next-eligible reminder, never a reactive
    // effect on the live topReminder prop.
    "ReminderDetailSheet.tsx's advanceToNextEligible dispatches SETTLED with the freshly computed next-eligible reminder — the single settlement decision point, never a reactive effect on the live topReminder prop",
    /function advanceToNextEligible\(latestData: AppData\) \{\s*const next = computeRankedReminder\(latestData, today, isSessionExcluded\);\s*dispatch\(\{ type: 'SETTLED', latestTopReminder: next \}\);\s*\}/.test(
      REMINDER_SHEET_SRC
    )
  );
  // WHY STALE (Reminder-opening correction round): this effect — and the
  // external `visible`/`onClose` boolean it reconciled against — was the
  // CONFIRMED root cause of the blank-sheet device-test defect this round
  // fixes (see ReminderDetailSheet.tsx's own doc comment for the full
  // effect-ordering trace: two effects racing on the same stale
  // `state.kind` closure within one commit). REPLACEMENT: visibility is
  // now derived directly from `isReminderLifecycleVisible(state)` — there
  // is no external boolean left to reconcile, so this effect (and the
  // parent notification it performed) no longer exists at all. The
  // underlying invariant this assertion protected ("closed always means
  // not visible") is now enforced structurally, proven for real in
  // pass-reminder-opening-correction.test.ts.
  assert(
    'ReminderDetailSheet.tsx derives native-Modal visibility directly from the reducer (isReminderLifecycleVisible(state)) — no external boolean left to race',
    /const visible = isReminderLifecycleVisible\(state\);/.test(REMINDER_SHEET_SRC)
  );
  // WHY STALE: the confirmed blank-sheet defect removed the external
  // `onClose` prop entirely; `onNavigateAway` is now the local
  // `handleForceClose` — same semantic, sourced locally.
  assert(
    "ReminderDetailSheet.tsx threads handleForceClose down to SmartReminderCard as onNavigateAway",
    /<SmartReminderCard[\s\S]{0,400}onNavigateAway=\{handleForceClose\}[\s\S]{0,200}onOutcome=\{handleReminderOutcome\}/.test(REMINDER_SHEET_SRC)
  );
  assert(
    "SmartReminderCard.tsx's 'Review card' calls onNavigateAway BEFORE navigating to Cards, never after or never at all — the exact fix for the blank-sheet-over-Cards defect",
    (() => {
      const idx = SMART_REMINDER_SRC.indexOf('Review card');
      const before = SMART_REMINDER_SRC.slice(Math.max(0, idx - 400), idx);
      return /onNavigateAway\?\.\(\);\s*navigation\.navigate\('Cards'\);/.test(before);
    })()
  );
  // WHY STALE: "opens the dedicated CreditCardRepaymentSheet" described the
  // PRIOR architecture, where SmartReminderCard mounted a second, separate
  // native-Modal-owning component directly. This round's native-Modal-
  // lifecycle correction deleted CreditCardRepaymentSheet.tsx entirely —
  // SmartReminderCard.tsx now only REQUESTS the transition
  // (onRequestCreditCardRepayment?.()); ReminderDetailSheet.tsx (the single
  // Modal owner) decides whether to honour it and renders
  // CreditCardRepaymentFormFields as plain content inside its own one Modal.
  assert(
    "the credit-card reminder action is labelled 'Record payment' (more accurate than 'Mark as paid', which implied an automatic balance clear) and requests the dedicated repayment form via onRequestCreditCardRepayment — never mounts a second Modal-owning component itself, and never opens the generic AddCreditCardModal edit form",
    /Record payment/.test(SMART_REMINDER_SRC) &&
      /onRequestCreditCardRepayment\?\.\(\)/.test(SMART_REMINDER_SRC) &&
      !/<CreditCardRepaymentSheet/.test(SMART_REMINDER_SRC) &&
      !/<AddCreditCardModal/.test(SMART_REMINDER_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
