// P0 — repayment edit-lock (rendered component evidence).
//
// CLASSIFICATION: rendered (RNTL / jest-expo). Mounts the REAL QuickAddModal
// with the production AppState/Theme/Celebration providers and an
// `editTransaction`, then asserts the ACTUAL view-only body that P0 renders
// for a recorded card / loan / BNPL repayment — no editable Amount field and
// no financial Save affordance — while ordinary transactions stay editable.
// Also drives the imperative `requestSave` handle to prove the handler guard
// is a no-op for a locked repayment (defence in depth beyond the missing UI).
//
// Run with: npm run test:render  (jest.render.config.cjs; maxWorkers:1)
//
// NOT proven here: native iOS Modal presentation, VoiceOver focus order and
// real keyboard behaviour — those remain physical-iPhone evidence.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { QuickAddModal, QuickAddModalHandle } from '../../src/components/dashboard/QuickAddModal';
import { createEmptyAppData } from '../../src/lib/storage';
import type { Transaction } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const ISO = new Date(2026, 7, 13).toISOString();
const KEY_LOAN = 'ri-loan:' + ISO;
const KEY_BNPL = 'ri-bnpl:' + ISO;
const KEY_BILL = 'ri-bill:' + ISO;

async function seed() {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1500, includeInMoneyCalculations: true }] as typeof data.assets;
  data.creditCards = [{ id: 'card1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 0 }] as typeof data.creditCards;
  data.liabilities = [
    { id: 'loan1', type: 'mortgage', label: 'Home Loan', currentBalance: 10000 },
    { id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 200 },
  ] as typeof data.liabilities;
  data.recurringItems = [
    { id: 'ri-loan', type: 'expense', label: 'Home Loan Repayment', amount: 1000, frequency: 'monthly', nextDueDate: ISO, isFixed: true, active: true, linkedLiabilityId: 'loan1' },
    { id: 'ri-bnpl', type: 'expense', label: 'Afterpay repayment', amount: 50, frequency: 'fortnightly', nextDueDate: ISO, isFixed: false, active: true, linkedLiabilityId: 'bnpl1' },
    { id: 'ri-bill', type: 'expense', label: 'Internet', amount: 60, frequency: 'monthly', nextDueDate: ISO, isFixed: true, active: true },
  ] as typeof data.recurringItems;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const cardRepayment: Transaction = { id: 'ccr1', type: 'expense', amount: 200, categoryId: 'cat-debt', date: ISO, paymentSource: 'cash', creditCardId: 'card1', isRepayment: true, balanceEffect: 'update' };
const loanRepayment: Transaction = { id: 'lr1', type: 'expense', amount: 1000, categoryId: 'cat-debt', date: ISO, paymentSource: 'cash', recurringItemId: 'ri-loan', recurringOccurrenceKey: KEY_LOAN, isLoanRepayment: true, balanceEffect: 'update' };
const bnplRepayment: Transaction = { id: 'br1', type: 'expense', amount: 50, categoryId: 'cat-debt', date: ISO, paymentSource: 'cash', recurringItemId: 'ri-bnpl', recurringOccurrenceKey: KEY_BNPL, balanceEffect: 'update' };
const ordinaryCardPurchase: Transaction = { id: 'op1', type: 'expense', amount: 40, categoryId: 'cat-food', date: ISO, paymentSource: 'credit_card', creditCardId: 'card1', balanceEffect: 'update' };
const ordinaryExpense: Transaction = { id: 'oe1', type: 'expense', amount: 30, categoryId: 'cat-food', date: ISO, paymentSource: 'cash', note: 'Groceries', balanceEffect: 'update' };
const ordinaryIncome: Transaction = { id: 'oi1', type: 'income', amount: 100, categoryId: 'cat-other-income', date: ISO, note: 'Gift', balanceEffect: 'none' };
const ordinaryBill: Transaction = { id: 'ob1', type: 'expense', amount: 60, categoryId: 'cat-bills', date: ISO, paymentSource: 'cash', recurringItemId: 'ri-bill', recurringOccurrenceKey: KEY_BILL, balanceEffect: 'update' };

function Harness({ txn, modalRef, onClose }: { txn: Transaction; modalRef?: React.Ref<QuickAddModalHandle>; onClose?: () => void }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <QuickAddModal ref={modalRef} visible editTransaction={txn} onClose={onClose ?? (() => {})} />
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('P0 — recorded repayments are view-only in QuickAddModal (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seed();
  });

  // --- LOCKED: no editable Amount, no Save; Delete + Close present ---
  test.each([
    ['credit-card repayment', cardRepayment],
    ['loan/mortgage repayment', loanRepayment],
    ['BNPL repayment', bnplRepayment],
  ])('%s is locked (view-only)', async (_label, txn) => {
    await render(<Harness txn={txn} />);
    // The view-only body's Delete affordance appears once data has loaded and
    // the repayment is classified (loan/BNPL need the seeded recurring item).
    expect(await screen.findByText('Delete transaction')).toBeOnTheScreen();
    // No editable Amount field, and no financial Save action — only Close.
    expect(screen.queryByLabelText('Amount')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.getByText('Close')).toBeOnTheScreen();
  });

  // --- EDITABLE: ordinary transactions still render the editable Amount ---
  test.each([
    ['ordinary card purchase (not a repayment)', ordinaryCardPurchase],
    ['ordinary cash expense', ordinaryExpense],
    ['ordinary income', ordinaryIncome],
    ['ordinary recurring bill', ordinaryBill],
  ])('%s stays editable', async (_label, txn) => {
    await render(<Harness txn={txn} />);
    expect(await screen.findByLabelText('Amount')).toBeOnTheScreen();
    // And an ordinary edit is not shown the repayment view-only Delete row.
    expect(screen.queryByText('This repayment is recorded. To change it, delete it and record it again.')).toBeNull();
  });

  // --- HANDLER GUARD (defence in depth): requestSave is a no-op when locked ---
  test('requestSave() on a locked card repayment does not save or close', async () => {
    const ref = React.createRef<QuickAddModalHandle>();
    const onClose = jest.fn();
    await render(<Harness txn={cardRepayment} modalRef={ref} onClose={onClose} />);
    await screen.findByText('Delete transaction');
    await act(async () => {
      ref.current?.requestSave();
    });
    // A successful save would call onClose (non-embedded success path). The
    // guard returns first, so it must not have been called.
    expect(onClose).not.toHaveBeenCalled();
    // Still view-only, still no Amount to edit.
    expect(screen.queryByLabelText('Amount')).toBeNull();
    expect(screen.getByText('Delete transaction')).toBeOnTheScreen();
  });
});
