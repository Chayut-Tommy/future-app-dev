// Pass C.1 presentation — excluded-savings provenance & wording (§5/§8).
// The disclosure only shows the amount when it reconciles EXACTLY to the
// current balances of identifiable excluded savings accounts; it is omitted
// from the opening once, never subtracted; it fails closed when untraceable;
// and it never claims the customer chose it or that money was moved/locked.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { createEmptyAppData } from '../../src/lib/storage';
import { localDateFromDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const local = (y: number, m: number, d: number) => localDateFromDate(new Date(y, m - 1, d));
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const savingsExcluded = (id: string, label: string, v: number): Asset => ({ id, type: 'savings', label, currentValue: v, includeInMoneyCalculations: false } as Asset);
const income = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'income', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: false, active: true } as RecurringItem);

function Sheet({ data }: { data: AppData }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <LookAheadSheet visible data={data} asOf={local(2026, 8, 30)} target={local(2026, 9, 30)} onClose={() => {}} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Pass C.1 — excluded-savings provenance & wording', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('the $2,000 reconciles to the excluded savings account, is omitted from the $5,300 opening, and is never subtracted', () => {
    const d = base();
    d.assets = [everyday('main', 5300), savingsExcluded('house', 'House deposit', 2000)];
    d.recurringItems = [income('salary', 3000, iso(2026, 9, 20))];
    const r = computeLookAheadProjection(d, local(2026, 8, 30), local(2026, 9, 30));
    if (!r.available) throw new Error('should be available');
    // Provenance: exactly the excluded savings account, summing to the shown amount.
    expect(r.protectedSavings.cents).toBe(200000);
    expect(r.protectedSavings.accounts).toEqual([{ id: 'house', label: 'House deposit', value: 2000 }]);
    expect(r.protectedSavings.accounts.reduce((s, a) => s + Math.round(a.value * 100), 0)).toBe(r.protectedSavings.cents);
    // Omitted from opening exactly once ($5,300 = the included everyday only).
    expect(r.breakdown.openingCents).toBe(530000);
    // Never subtracted from the projection: target = opening + the net of the
    // dated events, with NO protected-savings term anywhere in that sum.
    expect(r.targetCents).toBe(r.breakdown.openingCents + r.breakdown.netEventsCents);
  });

  test('singular copy: "$2,000 across 1 savings account isn’t counted in the $5,300 starting amount", with the account name', async () => {
    const d = base();
    d.assets = [everyday('main', 5300), savingsExcluded('house', 'House deposit', 2000)];
    d.recurringItems = [income('salary', 3000, iso(2026, 9, 20))];
    await render(<Sheet data={d} />);
    const line = await screen.findByTestId('look-ahead-excluded-savings', { includeHiddenElements: true });
    expect(line).toHaveTextContent(/\$2,000 across 1 savings account isn.t counted in the \$5,300 starting amount\./);
    expect(screen.getByTestId('look-ahead-excluded-account-house', { includeHiddenElements: true })).toHaveTextContent(/House deposit/);
    // Forbidden claims never appear.
    expect(screen.queryByText(/protected|kept out|locked|untouchable|moved|reserved|you chose|safe/i)).toBeNull();
  }, 30000);

  test('plural copy: two excluded savings accounts → "across 2 savings accounts"', async () => {
    const d = base();
    d.assets = [everyday('main', 5300), savingsExcluded('house', 'House', 1500), savingsExcluded('rainy', 'Rainy day', 500)];
    d.recurringItems = [income('salary', 3000, iso(2026, 9, 20))];
    await render(<Sheet data={d} />);
    expect(await screen.findByTestId('look-ahead-excluded-savings', { includeHiddenElements: true })).toHaveTextContent(/\$2,000 across 2 savings accounts isn.t counted/);
  }, 30000);

  test('zero excluded savings → no callout at all', async () => {
    const d = base();
    d.assets = [everyday('main', 5300)];
    d.recurringItems = [income('salary', 3000, iso(2026, 9, 20))];
    await render(<Sheet data={d} />);
    await screen.findByTestId('look-ahead-result', { includeHiddenElements: true });
    expect(screen.queryByTestId('look-ahead-protected', { includeHiddenElements: true })).toBeNull();
  }, 30000);

  test('untraceable amount fails closed: no numeric figure is shown', async () => {
    const d = base();
    // One valid excluded savings ($2,000) plus one with a fractional-cent value
    // the engine cannot validate — so protectedSavings.cents ($2,000) no longer
    // equals the sum of the listed account balances → fail closed.
    d.assets = [everyday('main', 5300), savingsExcluded('house', 'House', 2000), savingsExcluded('odd', 'Odd', 0.005)];
    d.recurringItems = [income('salary', 3000, iso(2026, 9, 20))];
    await render(<Sheet data={d} />);
    expect(await screen.findByTestId('look-ahead-excluded-savings-untraceable', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('look-ahead-excluded-savings', { includeHiddenElements: true })).toBeNull();
  }, 30000);
});
