// Pass C.1 closure — C1-03. Recording a due-today bill from the reminder must
// refresh Today's month summary IN PLACE (same render cycle), matching Money.
// Uses the REAL navigator, the REAL reminder confirmation and the REAL month
// selectors — not a mocked write. Run: npm run test:render

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

async function seed() {
  await AsyncStorage.clear();
  const d: AppData = createEmptyAppData();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).toISOString();
  const todayIso = new Date(y, m, now.getDate()).toISOString();
  d.user = { ...d.user, hasSeenIntro: true, monthlyIncome: 5500, payFrequency: 'monthly', nextPayday: new Date(y, m, now.getDate() + 8).toISOString() } as typeof d.user;
  d.assets = [{ id: 'main', type: 'everyday', label: 'Main account', currentValue: 6300, includeInMoneyCalculations: true }] as typeof d.assets;
  d.transactions = [
    { id: 'inc1', type: 'income', amount: 5500, date: first, description: 'Salary' } as any,
    { id: 'exp1', type: 'expense', amount: 500, date: first, description: 'Groceries', paymentSource: 'everyday', targetAssetId: 'main' } as any,
  ];
  d.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'monthly', nextDueDate: todayIso, isFixed: true, active: true } as any,
  ];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

describe('Pass C.1 — C1-03 Today month-summary refresh after recording a bill', () => {
  beforeEach(seed);

  test('recording the due-today rent updates Today’s "so far" (Spent $500 → $1,500) in place, matching Money', async () => {
    await render(<Harness />);

    // Start on Today; the month card shows Spent $500 before the payment. The
    // measures sit inside the card's single accessible element, so query them
    // with hidden elements included.
    const spent = () => screen.getByTestId('month-measure-spendingRecorded', { includeHiddenElements: true });
    await waitFor(() => expect(spent()).toHaveTextContent(/\$500/));

    // Open the due-today rent reminder from the Briefing and record it from Main.
    fireEvent.press(await screen.findByTestId(/^briefing-priority-row-reminder-/));
    fireEvent.press(await screen.findByTestId('reminder-primary-action')); // -> choose a source
    fireEvent.press(await screen.findByTestId('account-choice-main')); // Main account
    // Wait for the selection to enable the confirm before recording.
    await waitFor(() => expect(screen.getByTestId('bill-confirm-action', { includeHiddenElements: true }).props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('bill-confirm-action', { includeHiddenElements: true })); // record the payment

    // Today's month summary must reflect the recorded rent WITHOUT navigating.
    await waitFor(() => expect(spent()).toHaveTextContent(/\$1,500/));
    expect(screen.getByTestId('month-measure-netRecorded', { includeHiddenElements: true })).toHaveTextContent(/\$4,000/);

    // Money's This Month card shows the identical totals.
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    expect(await screen.findByTestId('this-month-spending', { includeHiddenElements: true })).toHaveTextContent(/\$1,500/);

    // Exactly one rent payment persisted (no duplicate) and the schedule advanced.
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const persisted = JSON.parse(raw!);
    const rentTx = persisted.transactions.filter((t: any) => t.amount === 1000 && t.type === 'expense');
    expect(rentTx).toHaveLength(1);
    const rent = persisted.recurringItems.find((r: any) => r.id === 'rent');
    expect(new Date(rent.nextDueDate).getTime()).toBeGreaterThan(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime());
  }, 60000);

  test('cancelling the reminder before confirming records nothing and leaves Today unchanged', async () => {
    await render(<Harness />);
    const spent = () => screen.getByTestId('month-measure-spendingRecorded', { includeHiddenElements: true });
    await waitFor(() => expect(spent()).toHaveTextContent(/\$500/));
    const before = await AsyncStorage.getItem(STORAGE_KEY);

    fireEvent.press(await screen.findByTestId(/^briefing-priority-row-reminder-/));
    fireEvent.press(await screen.findByTestId('reminder-primary-action'));
    // Back out of the source step instead of confirming.
    fireEvent.press(await screen.findByTestId('bill-source-back'));

    // No mutation, no persistence write, Today still $500.
    expect(spent()).toHaveTextContent(/\$500/);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 60000);
});
