// A1 — editor relationship-correction lifecycle (rendered).
// The ordinary transaction editor shows the current relationship and lets the
// customer correct it (Link / Change / Unlink). Locked repayments never show it.
// Run: npm run test:render

import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { QuickAddModal } from '../../src/components/dashboard/QuickAddModal';
import { createEmptyAppData } from '../../src/lib/storage';
import { buildOccurrenceId, OccurrenceId } from '../../src/lib/calculations/occurrenceIdentity';
import { classifyTransaction } from '../../src/lib/calculations/occurrenceResolution';
import type { Transaction } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const todayISO = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(); };
const AUG: OccurrenceId = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: new Date(2026, 7, 25), cadence: 'monthly' });

const linkedTxn: Transaction = { id: 'sal', type: 'income', amount: 2000, categoryId: 'c', date: iso(2026, 8, 25), occurrenceResolution: { version: 1, state: 'linked', occurrenceId: AUG } };
const plainTxn: Transaction = { id: 'plain', type: 'income', amount: 2000, categoryId: 'c', date: todayISO() };

async function seed(txns: Transaction[], withWage: boolean) {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  data.transactions = txns as typeof data.transactions;
  if (withWage) data.recurringItems = [{ id: 'wage', type: 'income', label: 'Salary', amount: 2000, frequency: 'monthly', nextDueDate: todayISO(), isFixed: false, active: true }] as typeof data.recurringItems;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function Probe() {
  const { data } = useAppState();
  const t = data.transactions.find((x) => x.id === 'sal');
  return <Text testID="sal-class">{`sal:${t ? classifyTransaction(t).classification : 'none'}`}</Text>;
}

function Harness({ editTransaction }: { editTransaction: Transaction }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <Probe />
            <QuickAddModal visible editTransaction={editTransaction} onClose={() => {}} />
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('A1 — editor relationship correction (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('a linked ordinary transaction shows the relationship and can be unlinked', async () => {
    const user = userEvent.setup();
    await seed([linkedTxn], false);
    await render(<Harness editTransaction={linkedTxn} />);
    expect(await screen.findByText('Scheduled item — linked')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Unlink from scheduled item')).toBeOnTheScreen();
    // Unlink → the live record becomes unclassified (occurrence re-exposed).
    await user.press(screen.getByLabelText('Unlink from scheduled item'));
    await waitFor(() => expect(screen.getByTestId('sal-class')).toHaveTextContent(/sal:unclassified/));
    // Settle the persist write so it does not leak into a following suite.
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}').transactions?.find((t: any) => t.id === 'sal')?.occurrenceResolution).toBeUndefined());
  }, 30000);

  test('an unclassified ordinary transaction with a matching candidate offers Link', async () => {
    await seed([plainTxn], true);
    await render(<Harness editTransaction={plainTxn} />);
    expect(await screen.findByText('Not linked to a scheduled item')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/Link scheduled item link/)).toBeOnTheScreen();
  }, 30000);
});
