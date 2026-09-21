// Pass C.5.2 — rendered proofs for loan-repayment ENTRY parity (founder Option A).
// Real AppStateProvider, real persistence, real reminder engine, the real single
// ReminderDetailSheet and the real loan-repayment form. `today` is passed in
// explicitly (never the system clock): 19 Sep 2026 makes the 20 Sep repayment
// "due tomorrow" (the tier that used to offer "Mark as paid"); 20 Sep 2026 makes
// the same repayment "due today" (the long-established loan-form entry).
// NOT proven here: pixels, VoiceOver speech, native Modal timing, real backgrounding.

import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TodayBriefingCard } from '../../src/components/today/TodayBriefingCard';
import { ReminderDetailSheet } from '../../src/components/today/ReminderDetailSheet';
import { computeRankedReminder } from '../../src/lib/calculations/reminders';
import { createSuppressionPredicate } from '../../src/lib/calculations/reminderSuppression';
import { ReminderOpenRequest, createReminderOpenRequest } from '../../src/lib/calculations/reminderInteractionLifecycle';
import { selectTodayBriefingEventRows } from '../../src/lib/calculations/todayBriefing';
import { computeMoneyTimeline } from '../../src/lib/calculations/moneyTimeline';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation } from '../../src/lib/calculations/safeToSpendPresentation';
import { LOAN_BALANCE_DECLINED_COPY, LOAN_BALANCE_EXPLAINER_COPY } from '../../src/lib/reminderPresentation';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData, Asset, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const REMINDER_ROW = /^briefing-priority-row-reminder-/;
const DUE_TOMORROW = new Date(2026, 8, 19);
const DUE_TODAY = new Date(2026, 8, 20);
const flat = (st: any) => StyleSheet.flatten(st) as any;
const setWindow = (fontScale: number, width = 390) => Dimensions.set({ window: { width, height: 844, scale: 3, fontScale }, screen: { width, height: 844, scale: 3, fontScale } } as any);
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);

function parityData(theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, theme } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset,
    { id: 'Cash', type: 'cash', label: 'Cash', currentValue: 200 } as Asset,
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: new Date(2026, 8, 28).toISOString(), isFixed: false, active: true } as RecurringItem,
    { id: 'richmond', type: 'expense', label: 'Richmond repayment', amount: 3000, frequency: 'monthly', nextDueDate: new Date(2026, 8, 20).toISOString(), isFixed: true, active: true, linkedLiabilityId: 'richmond-loan' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}

function TodayHarness({ today }: { today: Date }) {
  const { data } = useAppState();
  const topReminder = useMemo(() => computeRankedReminder(data, today, createSuppressionPredicate(data, today)), [data, today]);
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, today), [data, today]);
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data, today), [data, today]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const presentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  const idRef = useRef(0);
  const [openRequest, setOpenRequest] = useState<ReminderOpenRequest | null>(null);
  return (
    <>
      <TodayBriefingCard
        presentation={presentation}
        eventRows={briefingEventRows}
        timelineEvents={timelineEvents}
        timeframeLine={null}
        topReminder={topReminder}
        onPressAup={() => {}}
        onPressEventRow={() => {}}
        onPressReminderTile={() => {
          if (!topReminder) return;
          idRef.current += 1;
          setOpenRequest(createReminderOpenRequest(idRef.current, topReminder));
        }}
      />
      <ReminderDetailSheet openRequest={openRequest} today={today} />
    </>
  );
}
function Harness({ today }: { today: Date }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <NavigationContainer>
        <AppStateProvider>
          <ThemeProvider>
            <TodayHarness today={today} />
          </ThemeProvider>
        </AppStateProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const presentedSheets = () => (screen as any).root.queryAll((i: any) => i.props?.visible === true && typeof i.props?.onRequestClose === 'function');
const amountInput = () => screen.getAllByPlaceholderText('$0.00')[0];
const balanceInput = () => screen.getAllByPlaceholderText('$0.00')[1];

async function openForm(today: Date, data: AppData = parityData()) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const user = userEvent.setup();
  await render(<Harness today={today} />);
  await user.press(await screen.findByTestId(REMINDER_ROW));
  const action = await screen.findByRole('button', { name: 'Record repayment' });
  expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
  await user.press(action);
  await screen.findByText('How much did you pay in total?');
  return user;
}
/** The financially meaningful result, without ids, timestamps or derived history. */
async function effects() {
  const s = await stored();
  const t = s.transactions.filter((x) => x.recurringItemId === 'richmond');
  return {
    main: Math.round(s.assets.find((a) => a.id === 'Main')!.currentValue * 100),
    cash: Math.round(s.assets.find((a) => a.id === 'Cash')!.currentValue * 100),
    liability: Math.round(s.liabilities[0].currentBalance * 100),
    due: s.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate,
    transactions: t.map((x) => ({ amount: x.amount, categoryId: x.categoryId, note: x.note, principalAmount: x.principalAmount, isLoanRepayment: x.isLoanRepayment, repaymentLiabilityId: x.repaymentLiabilityId, recurringOccurrenceKey: x.recurringOccurrenceKey, occurrenceResolution: x.occurrenceResolution, appliedBalanceEffect: x.appliedBalanceEffect, paymentSource: x.paymentSource, targetAssetId: x.targetAssetId })),
  };
}
async function record(today: Date, latestBalance: string | null, expectedMessage: string) {
  const user = await openForm(today);
  await user.press(screen.getByTestId('account-choice-Main'));
  if (latestBalance !== null) {
    await user.press(screen.getByTestId('loan-balance-choice-update'));
    await fireEvent.changeText(balanceInput(), latestBalance);
  } else {
    await user.press(screen.getByTestId('loan-balance-choice-skip'));
  }
  const before = writes();
  await user.press(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByTestId('payment-recorded-message')).toHaveTextContent(expectedMessage);
  expect(writes()).toBe(before + 1);
  return effects();
}

beforeEach(() => setWindow(1));
afterAll(() => setWindow(2));

describe('C.5.2 §1 — the due-tomorrow loan reminder opens the ONE repayment form', () => {
  test('"Record repayment" (never "Mark as paid"); one sheet only; source, amount, date, liability prefilled; explanation shown; nothing written', async () => {
    await openForm(DUE_TOMORROW);
    await new Promise((r) => setTimeout(r, 150)); // let app start's own housekeeping write settle
    const before = writes();
    expect(presentedSheets()).toHaveLength(1); // content swapped inside the single sheet — never a second Modal
    expect(screen.getByText('Richmond · Mortgage')).toBeOnTheScreen();
    expect(screen.getByText('Your recorded expected repayment')).toBeOnTheScreen();
    expect(screen.getByText('$300,000.00')).toBeOnTheScreen(); // current recorded balance
    expect(amountInput().props.value).toBe('3000'); // scheduled amount, editable
    expect(amountInput().props.editable).toBe(true);
    expect(screen.getByTestId('loan-balance-explainer')).toHaveTextContent(LOAN_BALANCE_EXPLAINER_COPY);
    // C.5.2.1 — the balance decision starts UNANSWERED: no default is read as consent.
    const update = screen.getByTestId('loan-balance-choice-update');
    const skip = screen.getByTestId('loan-balance-choice-skip');
    expect(update.props.accessibilityRole).toBe('radio');
    expect(update.props.accessibilityLabel).toBe('Update my lender balance');
    expect(update.props.accessibilityHint).toBe(LOAN_BALANCE_EXPLAINER_COPY);
    expect(skip.props.accessibilityLabel).toBe('Record without updating the balance');
    expect(skip.props.accessibilityHint).toBe(LOAN_BALANCE_DECLINED_COPY);
    expect(update.props.accessibilityState).toMatchObject({ selected: false, checked: false });
    expect(skip.props.accessibilityState).toMatchObject({ selected: false, checked: false });
    expect(screen.queryByTestId('loan-balance-declined')).toBeNull(); // shown only once it is deliberately chosen
    expect(screen.getByRole('button', { name: 'Record payment' }).props.accessibilityState?.disabled).toBe(true); // no account chosen yet
    expect(writes()).toBe(before); // opening the form writes nothing
    expect((await stored()).transactions).toHaveLength(0);
  }, 60000);
});

describe('C.5.2 §2 — Scenarios A / B / C: reminder entry equals the established entry', () => {
  test('Scenario A — latest balance $297,000: funding $7,650.00, liability $297,000.00, principal $3,000; identical through both entries', async () => {
    const viaReminder = await record(DUE_TOMORROW, '297000', 'Repayment recorded · Liability updated');
    expect(viaReminder.main).toBe(765000);
    expect(viaReminder.cash).toBe(20000);
    expect(viaReminder.liability).toBe(29700000);
    expect(viaReminder.transactions).toHaveLength(1);
    expect(viaReminder.transactions[0]).toMatchObject({ amount: 3000, categoryId: 'cat-mortgage', note: 'Richmond repayment', principalAmount: 3000, isLoanRepayment: true, repaymentLiabilityId: 'richmond-loan', paymentSource: 'everyday', targetAssetId: 'Main' });
    expect(viaReminder.transactions[0].occurrenceResolution).toEqual({ version: 1, state: 'linked', occurrenceId: 'oid1:loan:richmond:2026-09' });
    expect(new Date(viaReminder.due).getMonth()).toBe(9); // advanced once, to 20 Oct
    const viaDueToday = await record(DUE_TODAY, '297000', 'Repayment recorded · Liability updated');
    expect(viaDueToday).toEqual(viaReminder);
  }, 120000);

  test('Scenario B — latest balance $299,200: liability $299,200.00, principal $800 (the other $2,200 is interest); identical through both entries', async () => {
    const viaReminder = await record(DUE_TOMORROW, '299200', 'Repayment recorded · Liability updated');
    expect(viaReminder.main).toBe(765000);
    expect(viaReminder.liability).toBe(29920000);
    expect(viaReminder.transactions[0].principalAmount).toBe(800);
    expect(await record(DUE_TODAY, '299200', 'Repayment recorded · Liability updated')).toEqual(viaReminder);
  }, 120000);

  test('Scenario C — balance deliberately not supplied: liability unchanged, no principal inferred; identical through both entries', async () => {
    const viaReminder = await record(DUE_TOMORROW, null, 'Repayment recorded · Balance not updated');
    expect(viaReminder.main).toBe(765000);
    expect(viaReminder.liability).toBe(30000000);
    expect(viaReminder.transactions).toHaveLength(1);
    expect(viaReminder.transactions[0].principalAmount).toBeUndefined();
    expect(viaReminder.transactions[0].isLoanRepayment).toBe(true);
    expect(await record(DUE_TODAY, null, 'Repayment recorded · Balance not updated')).toEqual(viaReminder);
  }, 120000);

  test('the split the form shows before saving matches what is recorded', async () => {
    const user = await openForm(DUE_TOMORROW);
    await user.press(screen.getByTestId('account-choice-Main'));
    await user.press(screen.getByTestId('loan-balance-choice-update'));
    await fireEvent.changeText(balanceInput(), '299200');
    expect(await screen.findByTestId('loan-split-estimate')).toHaveTextContent('Estimated split based on the balances you entered.');
    expect(screen.getByText('Principal reduction based on your entries: $800.00')).toBeOnTheScreen();
    expect(screen.getByText('Remaining payment treated as interest/fees: $2,200.00')).toBeOnTheScreen();
    expect(screen.getByText('Recorded mortgage balance: $300,000.00 → $299,200.00')).toBeOnTheScreen();
    expect(screen.queryByTestId('loan-balance-declined')).toBeNull();
  }, 60000);
});

describe('C.5.2 §3 — cancel, repeated taps, validation and persistence failure', () => {
  test('Cancel on the untouched (prefilled) form dismisses without a discard prompt, writes nothing, and the reminder is still offered', async () => {
    const user = await openForm(DUE_TOMORROW);
    const before = writes();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('How much did you pay in total?')).toBeNull());
    expect(screen.queryByText(/Discard/i)).toBeNull();
    expect(screen.queryByTestId('payment-recorded-message')).toBeNull();
    expect(writes()).toBe(before);
    const s = await stored();
    expect(s.transactions).toHaveLength(0);
    expect(s.assets.find((a) => a.id === 'Main')!.currentValue).toBe(10650);
    expect(s.liabilities[0].currentBalance).toBe(300000);
    expect(s.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate).toBe(new Date(2026, 8, 20).toISOString());
    expect(screen.getByTestId(REMINDER_ROW)).toBeOnTheScreen(); // the reminder is preserved
  }, 60000);

  test('invalid lender balance keeps Save disabled (principal above the payment; balance above the current balance); nothing is written', async () => {
    const user = await openForm(DUE_TOMORROW);
    await user.press(screen.getByTestId('account-choice-Main'));
    await user.press(screen.getByTestId('loan-balance-choice-update'));
    const before = writes();
    for (const bad of ['296000', '300000.01', '', '-5']) {
      await fireEvent.changeText(balanceInput(), bad);
      expect(screen.getByRole('button', { name: 'Record payment' }).props.accessibilityState?.disabled).toBe(true);
    }
    await fireEvent.changeText(balanceInput(), '297000');
    expect(screen.getByRole('button', { name: 'Record payment' }).props.accessibilityState?.disabled).toBeFalsy();
    expect(writes()).toBe(before);
  }, 60000);

  test('a refused transition (more than the account holds) keeps the customer in the form with the existing error, entries preserved, no success, no write', async () => {
    const user = await openForm(DUE_TOMORROW);
    await fireEvent.changeText(amountInput(), '20000');
    await user.press(screen.getByTestId('account-choice-Main'));
    await user.press(screen.getByTestId('loan-balance-choice-skip'));
    const before = writes();
    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText(/The recorded balance for Main-CBA is \$10,650\.00\./)).toBeOnTheScreen();
    expect(screen.getByText('How much did you pay in total?')).toBeOnTheScreen();
    expect(amountInput().props.value).toBe('20000');
    expect(screen.queryByTestId('payment-recorded-message')).toBeNull();
    expect(writes()).toBe(before);
    expect((await stored()).transactions).toHaveLength(0);
  }, 60000);

  test('a failed storage write shows no success confirmation and keeps the customer in the form', async () => {
    const user = await openForm(DUE_TOMORROW);
    await user.press(screen.getByTestId('account-choice-Main'));
    await user.press(screen.getByTestId('loan-balance-choice-skip'));
    const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warns = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await user.press(screen.getByRole('button', { name: 'Record payment' }));
      expect(await screen.findByText("We couldn't save that repayment, so nothing was recorded. Please try again.")).toBeOnTheScreen();
      expect(screen.queryByTestId('payment-recorded-message')).toBeNull();
      expect(screen.getByText('How much did you pay in total?')).toBeOnTheScreen();
      expect((await stored()).transactions).toHaveLength(0); // storage was never updated
    } finally {
      errors.mockRestore(); warns.mockRestore();
      if (original) (AsyncStorage.setItem as jest.Mock).mockImplementation(original);
    }
  }, 60000);
});

describe('C.5.2 §4 — accessibility, Dynamic Type, theme; structure', () => {
  test('largest Dynamic Type on a 320pt iPhone, dark theme: the explanation and decline copy wrap, never truncate or shrink', async () => {
    setWindow(2, 320);
    const user = await openForm(DUE_TOMORROW, parityData('dark'));
    await user.press(screen.getByTestId('loan-balance-choice-skip'));
    for (const id of ['loan-balance-explainer', 'loan-balance-declined']) {
      const el = screen.getByTestId(id);
      expect(el.props.numberOfLines).toBeUndefined();
      expect(el.props.adjustsFontSizeToFit).toBeUndefined();
      expect(el.props.allowFontScaling).not.toBe(false);
      expect(flat(el.props.style).fontSize).toBeGreaterThanOrEqual(12);
    }
  }, 60000);

  test('structure: one transition, one form, one Modal owner; no timers coordinate the sheets; the reminder card cannot reach the bill transition for a loan', () => {
    const read = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8');
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const sheet = strip(read('components/today/ReminderDetailSheet.tsx'));
    expect((sheet.match(/<KeyboardSheet\b/g) ?? []).length).toBe(1);
    expect(/<Modal\b/.test(sheet)).toBe(false);
    expect(/setTimeout|setInterval/.test(strip(read('hooks/useLoanRepaymentForm.ts')))).toBe(false);
    const callers = ['components/today/SmartReminderCard.tsx', 'components/today/ReminderDetailSheet.tsx', 'hooks/useLoanRepaymentForm.ts'].filter((f) => /confirmLoanRepayment\(/.test(strip(read(f))));
    expect(callers).toEqual(['hooks/useLoanRepaymentForm.ts']); // the ONE caller of the ONE transition
    const engine = strip(read('lib/calculations/reminders.ts'));
    // Every ordinary-bill tier excludes loan-linked items structurally.
    expect((engine.match(/!bnplItemIds\.has\(r\.id\) && !loanItemIds\.has\(r\.id\)/g) ?? []).length).toBe(3);
    expect(/loanItemIds\.has\(r\.id\) \|\| loanItemHasPositiveBalance/.test(engine)).toBe(false); // the old mixed due-soon filter is gone
    const history = read('screens/transactions/TransactionsScreen.tsx');
    expect(/Repayment — not counted as spending · Balance not updated — split unknown/.test(history)).toBe(true);
  });
});

// Duplicate submission is proven in tests/rendered/c521-integrity.render.test.tsx (C.5.2.1),
// at the provider's own in-flight guard, without overlapping act() calls.
