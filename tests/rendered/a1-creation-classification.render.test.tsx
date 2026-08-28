// A1 — creation-flow classification (rendered).
// Proves the CRITICAL guarantee: a new manual transaction that matches a
// scheduled occurrence opens the classification sheet on Save and writes
// NOTHING until the customer chooses; and a transaction with no compatible
// candidate saves once, without an unnecessary sheet.
// Run: npm run test:render

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { QuickAddModal } from '../../src/components/dashboard/QuickAddModal';
import { createEmptyAppData } from '../../src/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const todayISO = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
};

function Probe() {
  const { data, isLoading } = useAppState();
  return <Text testID="txn-count">{`count:${data.transactions.length}|items:${data.recurringItems.length}|loading:${isLoading}`}</Text>;
}

async function seed(withBill: boolean) {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  data.assets = [{ id: 'CASH', label: 'Cash', type: 'cash', currentValue: 500, includeInMoneyCalculations: true }] as typeof data.assets;
  if (withBill) {
    // Same category as the expense recorded below (Groceries) so it is a
    // relevant candidate under the category-compatibility gate.
    data.recurringItems = [
      { id: 'rent', type: 'expense', label: 'Groceries plan', amount: 900, frequency: 'monthly', nextDueDate: todayISO(), isFixed: true, active: true, categoryId: 'cat-groceries' },
    ] as typeof data.recurringItems;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <Probe />
            <QuickAddModal visible initialType="expense" onClose={() => {}} />
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

async function fillExpense(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Transaction name'), 'Rent payment');
  await user.type(screen.getByLabelText('Amount'), '900');
  await user.press(screen.getByLabelText('Category, Select a category'));
  await user.press(await screen.findByLabelText(/Groceries/));
  await user.press(await screen.findByTestId('expense-source-choice-cash'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false));
}

describe('A1 — creation-flow classification (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('a matching scheduled occurrence opens classification on Save and writes NOTHING yet', async () => {
    const user = userEvent.setup();
    await seed(true);
    await render(<Harness />);
    // Wait for hydration so the seeded bill is actually in `data` before Save.
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/items:1/));
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/loading:false/));

    await fillExpense(user);
    await user.press(screen.getByRole('button', { name: 'Save' }));

    // The classification sheet appears (its title) and NO transaction has been
    // written before the customer chooses. (The sheet's row content is proven
    // separately in a1-occurrence-classification.render — an OptionsSheet at
    // top level — to avoid nested-Modal query flakiness here.)
    expect(await screen.findByText('Is this payment for a scheduled bill?')).toBeOnTheScreen();
    expect(screen.getByTestId('txn-count')).toHaveTextContent(/count:0\|/);
  }, 30000);

  test('no compatible candidate → the transaction is saved once, with no classification sheet', async () => {
    const user = userEvent.setup();
    await seed(false); // no recurring items → no candidates
    await render(<Harness />);
    await fillExpense(user);
    await user.press(screen.getByRole('button', { name: 'Save' }));

    // One transaction created; no classification sheet shown.
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/count:1\|/));
    expect(screen.queryByText('Keep separate')).toBeNull();
    expect(screen.queryByText(/This is /)).toBeNull();
    // Settle the persist write so it does not leak into a following suite.
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}').transactions?.length).toBe(1));
  }, 30000);

  test('§6 — an unrelated MALFORMED scheduled source never blocks recording', async () => {
    const user = userEvent.setup();
    // A bill with an invalid nextDueDate: it can never be enumerated, so it is
    // neither offered nor allowed to prevent an otherwise valid expense.
    const data = createEmptyAppData();
    data.user.hasSeenIntro = true;
    data.assets = [{ id: 'CASH', label: 'Cash', type: 'cash', currentValue: 500, includeInMoneyCalculations: true }] as typeof data.assets;
    data.recurringItems = [
      { id: 'broken', type: 'expense', label: 'Broken', amount: 10, frequency: 'monthly', nextDueDate: 'not-a-date', isFixed: true, active: true },
    ] as typeof data.recurringItems;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    await render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/items:1/));
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/loading:false/));
    await fillExpense(user);
    await user.press(screen.getByRole('button', { name: 'Save' }));

    // Records once, no classification sheet, no blocking notice.
    await waitFor(() => expect(screen.getByTestId('txn-count')).toHaveTextContent(/count:1\|/));
    expect(screen.queryByText('Is this payment for a scheduled bill?')).toBeNull();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}').transactions?.length).toBe(1));
  }, 30000);
});
