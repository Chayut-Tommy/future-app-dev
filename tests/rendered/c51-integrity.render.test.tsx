// Pass C.5.1 — rendered proofs. Clock FROZEN to the local date 2026-09-20 (Date
// only; timers stay real). Real engines, real components, real navigator.
//   §1 the This Month card never says "Rent is your largest category" beside a
//      $3,000 Mortgage row when the two are tied to the cent.
//   §2 the "Use as my main payday" helper copy: text, screen-reader hint, largest
//      Dynamic Type on a small iPhone, dark theme.
//   §3 the opt-in late-timer drain helper: contract review.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { AddIncomeModal } from '../../src/components/income/AddIncomeModal';
import { MAIN_PAYDAY_EFFECT_COPY } from '../../src/lib/calculations/incomeEngine';
import { createEmptyAppData } from '../../src/lib/storage';
import { installLateTimerDrain } from './helpers/drainLateTimers';
import type { AppData, Asset, Liability, RecurringItem, Transaction } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 20, 16, 17);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const flat = (st: any) => StyleSheet.flatten(st) as any;
const setWindow = (fontScale: number, width = 390) => Dimensions.set({ window: { width, height: 844, scale: 3, fontScale }, screen: { width, height: 844, scale: 3, fontScale } } as any);
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true, savingsAllocationPromptHandled: true } as any });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none', ...extra } as Transaction);

function deviceData(theme: 'light' | 'dark' | 'system' = 'system', mortgageAmount = 3000): AppData {
  const d = base();
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 7650, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('richmond', 'expense', 3000, iso(2026, 10, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.transactions = [
    txn('t-sal', 'income', 7000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-rent-0', 'expense', 1000, iso(2026, 8, 31), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-1', 'expense', 1000, iso(2026, 9, 7), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-2', 'expense', 1000, iso(2026, 9, 14), 'cat-rent', { note: 'Rent' }),
    txn('t-other', 'expense', 500, iso(2026, 9, 15), 'cat-other-expense', { note: 'Sundries' }),
    txn('tx-richmond', 'expense', mortgageAmount, iso(2026, 9, 19), 'cat-mortgage', { note: 'Richmond repayment', recurringItemId: 'richmond', recurringOccurrenceKey: `richmond:${iso(2026, 9, 20)}`, occurrenceResolution: { version: 1, state: 'linked', occurrenceId: 'oid1:loan:richmond:2026-09' } as never }),
  ];
  d.user = { ...d.user, mainPaydayIncomeId: 'salary-boq', theme } as typeof d.user;
  return syncIncomeAggregate(d);
}

function App() {
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
function Editor({ editId }: { editId: string }) {
  const { data, isLoading } = useAppState() as any;
  const editItem = data.recurringItems.find((r: RecurringItem) => r.id === editId) ?? null;
  return isLoading || !editItem ? <Text>loading</Text> : <AddIncomeModal visible editItem={editItem} onClose={() => {}} />;
}
function EditorHarness({ editId, width = 390 }: { editId: string; width?: number }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 568 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <Editor editId={editId} />
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });

describe('C.5.1 §1 — This Month never calls a tie "Rent"', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setWindow(1); });

  test('tied to the cent: the card names BOTH categories beside the Mortgage row; totals unchanged', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData()));
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-this-month-card');
    expect(screen.getByTestId('this-month-recent-tx-richmond').props.accessibilityLabel).toMatch(/^Mortgage, .*-\$3,000/);
    const strip = screen.getByTestId('this-month-insights');
    expect(strip).toHaveTextContent(/Rent and Mortgage are tied · \$3,000 each over 30 days\./); // C.5.2 wording + shared formatter
    expect(strip).not.toHaveTextContent(/\$3000/);
    expect(strip).not.toHaveTextContent(/Rent is your largest category/);
    expect(screen.getByTestId('this-month-income')).toHaveTextContent(/\$7,000/);
    expect(screen.getByTestId('this-month-spending')).toHaveTextContent(/\$5,500/);
    expect(screen.getByTestId('this-month-net')).toHaveTextContent(/\$1,500/);
    // Genuine Other stays Other; genuine Rent stays Rent.
    fireEvent.press(screen.getByTestId('money-view-transactions-action'));
    expect((await screen.findByLabelText(/Richmond repayment/)).props.accessibilityLabel).toMatch(/3,000 dollars\. Mortgage, /);
    expect(screen.getByLabelText(/Sundries/).props.accessibilityLabel).toMatch(/500 dollars\. Other, /);
    expect(screen.getAllByLabelText(/^Expense\. Rent\. 1,000 dollars\. Rent, /).length).toBeGreaterThanOrEqual(2);
  }, 90000);

  test('a true leader is named on its own: a larger mortgage reads "Mortgage is your largest category"', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData('system', 3200)));
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    const strip = await screen.findByTestId('this-month-insights');
    expect(strip).toHaveTextContent(/Mortgage is your largest category/);
    expect(strip).toHaveTextContent(/\$3,200 in the last 30 days\./);
    expect(strip).not.toHaveTextContent(/Rent/);
  }, 90000);
});

describe('C.5.1 §2 — "Use as my main payday" helper copy', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('text and screen-reader hint both name Available until payday AND the daily-spend guide', async () => {
    setWindow(1);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData()));
    await render(<EditorHarness editId="rental" />);
    const support = await screen.findByTestId('income-main-payday-support', H);
    expect(support).toHaveTextContent('Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.');
    expect(MAIN_PAYDAY_EFFECT_COPY).toBe('Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.');
    const toggle = screen.getByTestId('income-main-payday-toggle');
    expect(toggle.props.accessibilityRole).toBe('radio');
    expect(toggle.props.accessibilityLabel).toBe('Use as my main payday');
    expect(toggle.props.accessibilityHint).toBe(MAIN_PAYDAY_EFFECT_COPY);
    expect(screen.queryByText(/Sets the pay-cycle date for Available until payday\./, H)).toBeNull(); // the old, incomplete line is gone
  }, 60000);

  test('largest Dynamic Type on a 320pt iPhone, dark theme: the copy wraps (never truncates or shrinks) inside a flexible text block', async () => {
    setWindow(2, 320);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData('dark')));
    await render(<EditorHarness editId="rental" width={320} />);
    const support = await screen.findByTestId('income-main-payday-support', H);
    expect(support).toHaveTextContent(MAIN_PAYDAY_EFFECT_COPY);
    expect(support.props.numberOfLines).toBeUndefined();
    expect(support.props.adjustsFontSizeToFit).toBeUndefined();
    expect(support.props.allowFontScaling).not.toBe(false);
    expect(flat(support.props.style).lineHeight).toBeGreaterThanOrEqual(flat(support.props.style).fontSize);
    // The text block flexes beside the radio glyph, so long copy grows downward, not off-screen.
    expect(flat(support.parent?.props.style).flex).toBe(1);
  }, 60000);
});

describe('C.5.1 §3 — late-timer drain helper: contract review', () => {
  const helperPath = join(__dirname, 'helpers/drainLateTimers.ts');
  const code = readFileSync(helperPath, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  test('cannot swallow failures, rejections or warnings: no try/catch, no promise catch, no console or process hooks', () => {
    expect(/\btry\b|\bcatch\b|\.catch\(/.test(code)).toBe(false);
    expect(/console\.|process\.on|unhandledRejection|uncaughtException|jest\.spyOn|mockImplementation/.test(code)).toBe(false);
    expect(/advanceTimers|runAllTimers|runOnlyPendingTimers|useFakeTimers/.test(code)).toBe(false); // never fast-forwards production work
  });
  test('waits only for ALREADY-QUEUED work (setImmediate ticks) and cancels only inside afterAll — after the final assertion of the suite', () => {
    expect((code.match(/afterAll\(/g) ?? []).length).toBe(1);
    expect(/beforeEach|afterEach|beforeAll/.test(code)).toBe(false);
    const afterAllBody = code.slice(code.indexOf('afterAll('));
    expect(/realClearTimeout\(handle\)/.test(afterAllBody)).toBe(true);
    expect(code.slice(0, code.indexOf('afterAll(')).includes('realClearTimeout(')).toBe(false); // nothing is cancelled while tests run
    expect(/setImmediate\(resolve\)/.test(afterAllBody)).toBe(true);
    expect(/setTimeout\(resolve|sleep|delay/i.test(afterAllBody)).toBe(false); // no arbitrary waiting
  });
  test('while tests run, a tracked timer behaves exactly like the real one: real handle, arguments passed, clearTimeout works, nothing cancelled before the suite-end drain', async () => {
    const before = global.setTimeout;
    let registered: (() => unknown) | undefined;
    const realAfterAll = (global as any).afterAll;
    (global as any).afterAll = (fn: () => unknown) => { registered = fn; };
    try { installLateTimerDrain(); } finally { (global as any).afterAll = realAfterAll; }
    try {
      expect(global.setTimeout).not.toBe(before);
      const got: unknown[] = [];
      await new Promise<void>((resolve) => { global.setTimeout((a: number, b: string) => { got.push(a, b); resolve(); }, 5, 7, 'x'); });
      expect(got).toEqual([7, 'x']);
      let fired = false;
      const handle = global.setTimeout(() => { fired = true; }, 5);
      clearTimeout(handle);
      await new Promise((r) => before(r, 30));
      expect(fired).toBe(false);
      // A pending production-style timer is left alone until the drain runs…
      let late = false;
      global.setTimeout(() => { late = true; }, 40);
      await new Promise((r) => before(r, 10));
      expect(late).toBe(false);
      await registered!(); // …and only the suite-end drain cancels it.
      await new Promise((r) => before(r, 60));
      expect(late).toBe(false);
      expect(global.setTimeout).toBe(before); // restored
    } finally {
      global.setTimeout = before;
    }
  }, 20000);
  test('test-only and opt-in: lives under tests/, imported by no production file, and only by the five suites that demonstrably need it', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const production = walk(join(__dirname, '../../src')).filter((f) => /\.tsx?$/.test(f));
    expect(production.some((f) => /drainLateTimers|installLateTimerDrain/.test(readFileSync(f, 'utf8')))).toBe(false);
    const users = readdirSync(__dirname).filter((f) => f.endsWith('.render.test.tsx') && /^installLateTimerDrain\(\);$/m.test(readFileSync(join(__dirname, f), 'utf8'))).sort();
    expect(users).toEqual([
      'a1-classification-lifecycle-2.render.test.tsx',
      'a1-classification-lifecycle-3.render.test.tsx',
      'design5-checklist-redesign-2.render.test.tsx',
      'design5-wave10-haptics-concurrent.render.test.tsx',
      'design5-wave9a-cards-reachability.render.test.tsx',
    ]);
  });
});
