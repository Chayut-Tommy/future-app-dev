// Pass C.2 correction and hardening — rendered proofs:
//   §5 the expired-payday AUP hero fails closed, offers only "Review your
//      income", and viewing/pressing it writes nothing;
//   §6 the Timeframe sheet shows the active choice (selected state, check,
//      custom date) and Cancel changes nothing;
//   §7 "Why this amount?" is concise by default and keeps every disclosure
//      behind the two accordions; one-day coverage copy names the date.
// Real engines and components; TZ=UTC and Australia/Melbourne identical.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SafeToSpendHero } from '../../src/components/money/SafeToSpendHero';
import { TimeframeSheet } from '../../src/components/money/TimeframeSheet';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { resolvePaydayProgress } from '../../src/lib/calculations/moneyComposition';
import { localDate, LocalDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency']): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);
const TODAY = new Date(2026, 8, 14);

function beforeFixture(): AppData {
  const d = base();
  d.assets = [everyday('cba', 6000)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 11), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 11), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 14), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 17), 'weekly'),
  ];
  d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user; // explicit Main payday (Pass C.2 closure)
  return syncIncomeAggregate(d);
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('§5 — expired payday AUP hero fails closed', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('shows "Income not confirmed" + "Payday expected 11 Sep", no amount, no daily figure, no rail; CTA opens the review handoff; nothing is written', async () => {
    const user = userEvent.setup();
    const data = beforeFixture();
    const snapshot = JSON.stringify(data);
    const sts = computeSafeToSpend(data, TODAY);
    const progress = resolvePaydayProgress({ cycleStart: sts.cycleStart, cycleEnd: sts.cycleEnd, daysRemaining: sts.daysRemaining, hasKnownPayday: sts.hasKnownPayday, today: TODAY });
    let reviewed = 0;
    await render(
      <Wrap>
        <SafeToSpendHero safeToSpend={sts} hasActiveGoals={false} onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} paydayProgress={progress} onOpenTimeframe={() => {}} onReviewIncome={() => { reviewed++; }} showManageBalancesLink={false} />
      </Wrap>
    );
    expect(await screen.findByTestId('money-aup-hero-payday-expired')).toBeOnTheScreen();
    expect(screen.getByText('Income not confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Payday expected 11 Sep. Review your income to refresh this estimate.')).toBeOnTheScreen();
    expect(screen.queryByText('AVAILABLE')).toBeNull();
    expect(screen.queryByText('ABOUT PER DAY')).toBeNull();
    expect(screen.queryByText(/days left/)).toBeNull();
    expect(screen.queryByText(/\$5,/)).toBeNull();
    expect(screen.queryByTestId('money-aup-hero-payday')).toBeNull();
    expect(screen.queryByTestId('money-timeframe-row')).toBeNull();
    await user.press(screen.getByTestId('money-aup-cta-review-income'));
    expect(reviewed).toBe(1);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 30000);
});

describe('§6 — Timeframe sheet shows the active choice', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  const payday = localDate(2026, 9, 25);
  const Sheet = ({ current, onSelect = () => {}, onClose = () => {} }: { current: LocalDate | null; onSelect?: (t: LocalDate | null) => void; onClose?: () => void }) => (
    <Wrap>
      <TimeframeSheet visible asOf={TODAY} paydayDate={payday} currentTarget={current} onSelect={onSelect} onChooseDate={() => {}} onClose={onClose} />
    </Wrap>
  );

  test('Until payday active → its row is selected (state + check); others are not', async () => {
    await render(<Sheet current={null} />);
    const row = await screen.findByTestId('timeframe-until-payday');
    expect((row).props.accessibilityState).toEqual({ selected: true });
    expect((row).props.accessibilityLabel).toMatch(/Until payday, 25 Sep 2026, currently selected/);
    expect(screen.getByTestId('timeframe-selected-payday')).toBeTruthy();
    expect((screen.getByTestId('timeframe-month-end')).props.accessibilityState).toEqual({ selected: false });
    expect((screen.getByTestId('timeframe-choose-date')).props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByTestId('timeframe-custom-date')).toBeNull();
  }, 30000);

  test('End of this month active → that row is selected', async () => {
    await render(<Sheet current={localDate(2026, 9, 30)} />);
    expect((await screen.findByTestId('timeframe-month-end')).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('timeframe-selected-month-end')).toBeTruthy();
    expect((screen.getByTestId('timeframe-until-payday')).props.accessibilityState).toEqual({ selected: false });
  }, 30000);

  test('custom date active → Choose a date is selected and shows the date beneath it', async () => {
    await render(<Sheet current={localDate(2026, 9, 24)} />);
    const row = await screen.findByTestId('timeframe-choose-date');
    expect((row).props.accessibilityState).toEqual({ selected: true });
    expect((row).props.accessibilityLabel).toMatch(/Choose a date, currently 24 Sep 2026, currently selected/);
    expect(screen.getByTestId('timeframe-custom-date')).toHaveTextContent('24 Sep 2026');
    expect(screen.getByTestId('timeframe-selected-custom')).toBeTruthy();
    expect((screen.getByTestId('timeframe-month-end')).props.accessibilityState).toEqual({ selected: false });
  }, 30000);

  test('Cancel changes nothing: onClose fires, onSelect never fires, nothing persisted', async () => {
    const user = userEvent.setup();
    let selected = 0, closed = 0;
    await render(<Sheet current={localDate(2026, 9, 24)} onSelect={() => { selected++; }} onClose={() => { closed++; }} />);
    await user.press(await screen.findByText('Cancel'));
    expect(closed).toBe(1);
    expect(selected).toBe(0);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 30000);
});

describe('§7 — Why this amount? progressive disclosure', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  const Sheet = ({ target }: { target: LocalDate }) => (
    <Wrap>
      <LookAheadSheet visible data={beforeFixture()} asOf={localDate(2026, 9, 14)} target={target} onClose={() => {}} />
    </Wrap>
  );

  test('default view: summary, collapsed Estimated balance, concise About per day with one-day coverage and protected commitments, collapsed Assumptions and limits', async () => {
    await render(<Sheet target={localDate(2026, 9, 15)} />);
    expect(await screen.findByTestId('look-ahead-amount')).toHaveTextContent(/^\$5,000\.00$/);
    expect(screen.getByTestId('look-ahead-cashflow')).toHaveTextContent(/No dip below your estimated balance before 15 Sep/);
    // Calculation collapsed by default.
    expect((screen.getByTestId('look-ahead-breakdown-toggle')).props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText('Starting included money')).toBeNull();
    // Concise guide summary.
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent(/^\$3,700$/);
    expect(screen.getByTestId('look-ahead-daily-caption')).toHaveTextContent(/^For tomorrow$/);
    expect(screen.getByTestId('look-ahead-daily-coverage')).toHaveTextContent(/^This guide covers 14 Sep, before your 15 Sep target\.$/);
    expect(screen.getByTestId('look-ahead-daily-protected')).toHaveTextContent(/^Keeps \$1,300 for commitments due after 15 Sep through your 25 Sep payday\.$/);
    // Detailed caveats live behind the collapsed accordion — not on the default view.
    expect((screen.getByTestId('look-ahead-assumptions-toggle')).props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('look-ahead-assumptions-body')).toBeNull();
    expect(screen.queryByText(/planning estimate, not a guarantee/)).toBeNull();
    expect(screen.queryByText(/counted together at the end of that day/)).toBeNull();
  }, 30000);

  test('expanding both sections reveals the calculation, the not-yet-deducted note and every disclosure; collapsing hides them again', async () => {
    const user = userEvent.setup();
    await render(<Sheet target={localDate(2026, 9, 24)} />);
    await user.press(await screen.findByTestId('look-ahead-breakdown-toggle'));
    expect(await screen.findByText('Starting included money')).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-not-yet-deducted')).toHaveTextContent(/isn’t deducted yet/);
    expect(screen.getByTestId('look-ahead-assumed')).toHaveTextContent(/Includes 1 assumed income payment/);
    expect(screen.getByTestId('look-ahead-daily-coverage')).toHaveTextContent(/^This guide covers 14 Sep to 23 Sep, before your 24 Sep target\.$/);
    await user.press(screen.getByTestId('look-ahead-assumptions-toggle'));
    const body = await screen.findByTestId('look-ahead-assumptions-body');
    expect(body).toHaveTextContent(/next payday after 24 Sep is assumed to be 25 Sep/);
    expect(body).toHaveTextContent(/Income on that payday isn’t counted/);
    expect(body).toHaveTextContent(/assumed, not received/);
    expect(body).toHaveTextContent(/not subtracted/);
    expect(body).toHaveTextContent(/stay outside the starting amount/);
    expect(body).toHaveTextContent(/counted together at the end of that day/);
    expect(body).toHaveTextContent(/markers show dated events only/); // C.3: "The Estimated balance path and its markers…"
    expect(body).toHaveTextContent(/planning estimate, not a guarantee/);
    expect(body).toHaveTextContent(/Based on what you've recorded and scheduled/);
    await user.press(screen.getByTestId('look-ahead-assumptions-toggle'));
    expect(screen.queryByTestId('look-ahead-assumptions-body')).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 30000);
});
