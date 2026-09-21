// Pass C.2 — "Why this amount?" gains the Estimated balance section (with the
// explicit "future everyday spending isn't deducted yet" note) and the About
// per day section with its plain explanation and disclosures. Real engines;
// zero persistence writes. Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { DAILY_GUIDE_EXPLANATION } from '../../src/lib/calculations/lookAheadPresentation';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const savingsExcluded = (id: string, v: number): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: false } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string): RecurringItem =>
  ({ id, type, label: id, amount, frequency: 'monthly', nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);

function exampleB(): AppData {
  const d = base();
  d.user = { ...d.user, monthlyIncome: 5000, payFrequency: 'monthly', nextPayday: iso(2026, 9, 10), savingsAllocation: { mode: 'amount', amount: 386.3 } as any } as typeof d.user;
  d.assets = [everyday('main', 6000), savingsExcluded('house', 3500)];
  d.recurringItems = [item('rent', 'expense', 1000, iso(2026, 9, 7)), item('gym', 'expense', 150, iso(2026, 9, 10)), item('pay', 'income', 5000, iso(2026, 9, 10))];
  return d;
}

function Harness({ data, target }: { data: AppData; target: [number, number, number] }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <LookAheadSheet visible data={data} asOf={localDate(2026, 9, 4)} target={localDate(...target)} onClose={() => {}} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
const FORBIDDEN = /safe to spend|safely spend|guaranteed|recommended spending|your daily spend|prefix constraint|guard path|cash-path fold|scenario engine/i;

describe('Pass C.2 — Why this amount? sections', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('Estimated balance section: headline $6,000.00, cash-flow status, breakdown total "Estimated balance", and the not-yet-deducted note', async () => {
    const user = userEvent.setup();
    await render(<Harness data={exampleB()} target={[2026, 9, 6]} />);
    expect(await screen.findByText('Why this amount?')).toBeOnTheScreen();
    expect(screen.getByText('Estimated balance by 6 Sep 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-amount')).toHaveTextContent(/^\$6,000\.00$/);
    expect(screen.getByTestId('look-ahead-cashflow')).toHaveTextContent(/^No scheduled shortfall detected · No dip below your estimated balance before 6 Sep$/);
    expect(screen.queryByTestId('look-ahead-not-yet-deducted')).toBeNull(); // inside the collapsed calculation
    await user.press(screen.getByTestId('look-ahead-breakdown-toggle'));
    expect(await screen.findByText('Starting included money')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-not-yet-deducted')).toHaveTextContent(/Future everyday spending isn’t deducted yet/);
    expect(screen.getAllByText('Estimated balance').length).toBeGreaterThanOrEqual(2); // section title + total row
    expect(screen.queryByText('Estimated position')).toBeNull();
  }, 30000);

  test('About per day section: $2,425 for the next 2 days, coverage + protected lines, and every disclosure behind Assumptions and limits', async () => {
    const user = userEvent.setup();
    await render(<Harness data={exampleB()} target={[2026, 9, 6]} />);
    expect(await screen.findByTestId('look-ahead-daily-guide')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent(/^\$2,425$/);
    expect(screen.getByTestId('look-ahead-daily-caption')).toHaveTextContent(/^For the next 2 days$/);
    expect(screen.getByTestId('look-ahead-daily-coverage')).toHaveTextContent(/^This guide covers 4 Sep to 5 Sep, before your 6 Sep target\.$/);
    expect(screen.getByTestId('look-ahead-daily-protected')).toHaveTextContent(/^Keeps \$1,150 for commitments due after 6 Sep through your 10 Sep payday\.$/);
    await user.press(screen.getByTestId('look-ahead-assumptions-toggle'));
    await screen.findByTestId('look-ahead-assumptions-body');
    const disclosures = screen.getAllByTestId(/^look-ahead-(daily-disclosure-|savings)/).map((el) => el.props.children.join(''));
    expect(disclosures.join('\n')).toMatch(DAILY_GUIDE_EXPLANATION);
    expect(disclosures.join('\n')).toMatch(/next payday after 6 Sep is assumed to be 10 Sep/);
    expect(disclosures.join('\n')).toMatch(/Income on that payday isn’t counted/);
    expect(disclosures.join('\n')).toMatch(/assumed, not received/);
    expect(disclosures.join('\n')).toMatch(/not subtracted/);
    expect(disclosures.join('\n')).toMatch(/stay outside the starting amount/);
    expect(disclosures.join('\n')).toMatch(/Following the guide changes your estimated balance/);
    expect(disclosures.join('\n')).toMatch(/counted together at the end of that day/);
    expect(disclosures.join('\n')).toMatch(/markers show dated events only/); // C.3 wording
    expect(disclosures.join('\n')).toMatch(/planning estimate, not a guarantee/);
    // The assumed-income count lives inside the calculation; none in Example B.
    expect(screen.queryByTestId('look-ahead-assumed')).toBeNull();
    // Excluded-savings provenance is preserved.
    expect(screen.getByTestId('look-ahead-excluded-savings')).toHaveTextContent(/\$3,500 across 1 savings account isn’t counted in the \$6,000 starting amount\./);
    expect(screen.getByTestId('look-ahead-savings')).toHaveTextContent(/set aside about \$38\.63 for savings and goals\. That plan is shown for information only — the money may not have moved yet, and it is not subtracted from this estimated balance\./);
    // Pass C.3 — stated ONCE: no second "not subtracted" sentence anywhere in the assumptions.
    expect(disclosures.join('\n').match(/not subtracted/g)?.length).toBe(1);
    expect(screen.queryByText(FORBIDDEN)).toBeNull();
  }, 30000);

  test('assumed income before the target is disclosed inside the expanded Estimated balance section', async () => {
    const user = userEvent.setup();
    await render(<Harness data={exampleB()} target={[2026, 9, 12]} />);
    await screen.findByTestId('look-ahead-result');
    await user.press(screen.getByTestId('look-ahead-breakdown-toggle'));
    expect(await screen.findByTestId('look-ahead-assumed')).toHaveTextContent(/Includes 1 assumed income payment\. Future income is assumed, not received\./);
  }, 30000);

  test('missing guard payday: the sheet explains it while the estimate remains', async () => {
    const d = exampleB(); d.user = { ...d.user, nextPayday: null } as typeof d.user;
    await render(<Harness data={d} target={[2026, 9, 6]} />);
    expect(await screen.findByTestId('look-ahead-amount')).toHaveTextContent(/^\$6,000\.00$/);
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('look-ahead-daily-explanation')).toHaveTextContent(/Nolie doesn’t have your next payday yet/);
  }, 30000);

  test('no persistence write occurs while the sheet is open', async () => {
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    await render(<Harness data={exampleB()} target={[2026, 9, 6]} />);
    await screen.findByTestId('look-ahead-daily-guide');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 30000);
});
