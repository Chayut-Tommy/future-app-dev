// Pass C.1 correction — the ONE card's two modes and two-region layout, at
// component level with a controlled as-of date. Real engines feed the real
// cards. Run under TZ=UTC and TZ=Australia/Melbourne — identical.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { SafeToSpendHero } from '../../src/components/money/SafeToSpendHero';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { buildAupRail } from '../../src/lib/calculations/timelineMarkers';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { localDateFromDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const isoT = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const local = (y: number, m: number, d: number) => localDateFromDate(new Date(y, m - 1, d));
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const income = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'income', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: false, active: true } as RecurringItem);
const bill = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'expense', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: true, active: true } as RecurringItem);

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function buildScenario(data: AppData, asOfY: number, asOfM: number, asOfD: number, tY: number, tM: number, tD: number) {
  const asOf = local(asOfY, asOfM, asOfD);
  const target = local(tY, tM, tD);
  const result = computeLookAheadProjection(data, asOf, target);
  if (!result.available) throw new Error('fixture should be available');
  const presentation = selectLookAheadPresentation(result);
  const events = computeProjectedEvents(data, asOf, target, { windowStart: asOf }).events;
  const guide = computeDailyGuide(data, asOf, target, result);
  return { result, presentation, events, guide };
}

describe('Pass C.1 — scenario card (two-region, selected-date mode) — C.2 hierarchy', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('shows Estimated balance + About per day regions, rail, legend and actions; no Scenario badge; no AUP-only content', async () => {
    const data = base();
    data.user = { ...data.user, monthlyIncome: 5000, payFrequency: 'monthly', nextPayday: isoT(2026, 9, 10) } as typeof data.user;
    data.assets = [everyday('cba', 6300)];
    data.recurringItems = [bill('rent', 1000, isoT(2026, 8, 31))];
    const { result, presentation, events, guide } = buildScenario(data, 2026, 8, 30, 2026, 8, 31);
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Mon, 31 Aug 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    expect(await screen.findByTestId('money-scenario-card')).toBeOnTheScreen();
    expect(screen.getByText('Estimated balance by')).toBeOnTheScreen();
    expect(screen.getByText('Mon, 31 Aug 2026')).toBeOnTheScreen();
    expect(screen.getByText('ESTIMATED BALANCE')).toBeOnTheScreen();
    expect(screen.getByText('ABOUT PER DAY')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$5,300$/);
    // Guarded guide for ONE allocation day (30 Aug): ($6,300 − $1,000 rent on 31 Aug) ÷ 1 — never $5,300 ÷ 1 of the estimate.
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$5,300$/);
    expect(screen.getByText('For tomorrow')).toBeOnTheScreen(); // C.2 closure: natural one-day wording
    expect(screen.queryByText('Scenario')).toBeNull();
    expect(screen.queryByText('LOWEST POSITION')).toBeNull();
    expect(screen.getByTestId('money-scenario-timeline')).toBeOnTheScreen(); // C.5: Timeline to [date] rail
    expect(screen.getByTestId('timeline-legend')).toBeOnTheScreen();
    expect(screen.getByTestId('money-back-to-payday')).toBeOnTheScreen();
    expect(screen.getByTestId('money-why-this-amount')).toBeOnTheScreen();
    // Never AUP-only content.
    expect(screen.queryByText(/available until payday/i)).toBeNull();
    expect(screen.queryByText('AVAILABLE')).toBeNull();
    expect(screen.queryByText(/pay cycle/i)).toBeNull();
  }, 30000);

  test('shortfall: the cash-flow status carries the possible shortfall; the guide defers to it', async () => {
    const data = base();
    data.user = { ...data.user, monthlyIncome: 3000, payFrequency: 'monthly', nextPayday: isoT(2026, 9, 20) } as typeof data.user;
    data.assets = [everyday('cba', 500)];
    data.recurringItems = [bill('rent', 1200, isoT(2026, 9, 5)), income('salary', 3000, isoT(2026, 9, 20))];
    const { result, presentation, events, guide } = buildScenario(data, 2026, 8, 31, 2026, 9, 25);
    if (!result.available || !result.firstShortfall) throw new Error('fixture should have a shortfall');
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Fri, 25 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    await screen.findByTestId('money-scenario-card');
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^Possible shortfall of \$700 on 5 Sep$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^—$/);
    expect(screen.queryByText('POTENTIAL SHORTFALL')).toBeNull();
    expect(screen.queryByText('LOWEST POSITION')).toBeNull();
  }, 30000);

  test('Back to payday and Why this amount fire their callbacks', async () => {
    const user = userEvent.setup();
    const data = base();
    data.assets = [everyday('cba', 6300)];
    data.recurringItems = [bill('rent', 1000, isoT(2026, 8, 31))];
    const { result, presentation, events, guide } = buildScenario(data, 2026, 8, 30, 2026, 8, 31);
    let back = false, why = false;
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Mon, 31 Aug 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => { why = true; }} onBackToPayday={() => { back = true; }} />
      </Wrap>
    );
    await user.press(await screen.findByTestId('money-back-to-payday'));
    await user.press(screen.getByTestId('money-why-this-amount'));
    expect(back).toBe(true);
    expect(why).toBe(true);
  }, 30000);
});

describe('Pass C.1 — AUP hero two-region + top Change date + legend', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  function aupData(): AppData {
    const d = base();
    d.user = { ...d.user, monthlyIncome: 5000, payFrequency: 'monthly', nextPayday: isoT(2026, 9, 10) } as typeof d.user;
    d.assets = [everyday('cba', 6300)];
    d.recurringItems = [{ id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: isoT(2026, 8, 31), isFixed: true, active: true } as RecurringItem];
    return d;
  }

  test('renders AVAILABLE + ABOUT PER DAY regions, a top Change date control, the marker rail and a legend — and no bottom timeframe row', async () => {
    const user = userEvent.setup();
    const data = aupData();
    const asOf = new Date(2026, 7, 30);
    const sts = computeSafeToSpend(data, asOf);
    const rail = buildAupRail(sts, localDateFromDate(asOf));
    let opened = false;
    await render(
      <Wrap>
        <SafeToSpendHero
          safeToSpend={sts}
          hasActiveGoals={false}
          onCreateGoal={() => {}}
          heroCopy={computeMoneyHeroCopy(data)}
          paydayProgress={{ fraction: 0.6, startLabel: '11 Aug', endLabel: '10 Sep', daysRemaining: 11, unknown: false, spoken: 'Pay cycle' } as any}
          aupRail={rail}
          onOpenTimeframe={() => { opened = true; }}
          timeframeValueLabel="Until payday · 10 Sep 2026"
          showManageBalancesLink={false}
        />
      </Wrap>
    );
    expect(await screen.findByText('AVAILABLE')).toBeOnTheScreen();
    expect(screen.getByText('ABOUT PER DAY')).toBeOnTheScreen();
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent('$4,300'); // cents-aware, no ".00"
    expect(screen.getByTestId('money-aup-hero-daily')).toBeOnTheScreen();
    expect(screen.getByTestId('money-payday-bar-markers', { includeHiddenElements: true })).toBeOnTheScreen(); // Pass D.3 — the track is decorative under the press band (hidden from AT, like the selected-date rail's)
    expect(screen.getByTestId('timeline-legend')).toBeOnTheScreen();
    // The Change date control is the single in-card horizon entry.
    const row = screen.getByTestId('money-timeframe-row');
    expect(screen.getByText('Change date')).toBeOnTheScreen();
    await user.press(row);
    expect(opened).toBe(true);
  }, 30000);
});
