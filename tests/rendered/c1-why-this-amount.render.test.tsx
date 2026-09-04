// Pass C.1 — the refactored "Why this amount?" detail (LookAheadSheet).
// Controlled: the parent owns asOf + target; the sheet only explains the
// Pass B estimate. Real Pass B engine + selector; zero persistence writes.
// Run under TZ=UTC and TZ=Australia/Melbourne — identical. Run: npm run test:render

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { localDateFromDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const isoT = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const local = (y: number, m: number, d: number) => localDateFromDate(new Date(y, m - 1, d));
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const protectedSave = (id: string, v: number): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: false } as Asset);
const income = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'income', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: false, active: true } as RecurringItem);
const bill = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'expense', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: true, active: true } as RecurringItem);

function Harness({ data, asOf, target }: { data: AppData; asOf: Date; target: Date }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <LookAheadSheet visible data={data} asOf={localDateFromDate(asOf)} target={localDateFromDate(target)} onClose={() => {}} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function approvedData(): AppData {
  const d = base();
  d.assets = [everyday('cba', 1200), protectedSave('house', 6000)];
  d.recurringItems = [income('wage', 2500, isoT(2026, 8, 25)), bill('rent', 2150, isoT(2026, 9, 20))];
  d.user = { ...d.user, savingsAllocation: { mode: 'amount', amount: 387.5 } as any };
  return d;
}

describe('Pass C.1 — Why this amount? detail', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('title is "Why this amount?"; shows the Pass B result for the controlled target', async () => {
    await render(<Harness data={approvedData()} asOf={new Date(2026, 7, 15)} target={new Date(2026, 8, 30)} />);
    expect(await screen.findByText('Why this amount?')).toBeOnTheScreen();
    expect(await screen.findByTestId('look-ahead-result')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-amount')).toHaveTextContent('$4,050.00');
  }, 30000);

  test('§3 breakdown reconciles: both salaries once (+$5,000), bills −$2,150, over starting $1,200', async () => {
    const user = userEvent.setup();
    await render(<Harness data={approvedData()} asOf={new Date(2026, 7, 15)} target={new Date(2026, 8, 30)} />);
    await user.press(await screen.findByTestId('look-ahead-breakdown-toggle'));
    expect(await screen.findByText('$1,200.00')).toBeOnTheScreen();
    expect(screen.getByText('$5,000.00')).toBeOnTheScreen();
    expect(screen.getByText('-$2,150.00')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-assumed')).toHaveTextContent('Includes 2 assumed income payments');
    expect(screen.getByTestId('look-ahead-savings')).toHaveTextContent(/not subtracted here/);
    expect(screen.getByTestId('look-ahead-protected')).toBeOnTheScreen();
  }, 30000);

  test('no persistence write occurs while the detail is open', async () => {
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    await render(<Harness data={approvedData()} asOf={new Date(2026, 7, 15)} target={new Date(2026, 8, 30)} />);
    await screen.findByTestId('look-ahead-result');
    const after = await AsyncStorage.getItem(STORAGE_KEY);
    expect(after).toBe(before); // untouched (null === null here — nothing written)
  }, 30000);

  test('unavailable target (no eligible balance) renders the calm unavailable state, not a $0 result', async () => {
    const d = base();
    d.assets = []; // nothing opted in
    await render(<Harness data={d} asOf={new Date(2026, 7, 15)} target={new Date(2026, 8, 30)} />);
    expect(await screen.findByTestId('look-ahead-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('look-ahead-amount')).toBeNull();
  }, 30000);
});
