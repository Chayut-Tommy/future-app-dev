// Pass C.2 — the Look-ahead card: Estimated balance + About per day regions,
// subordinate cash-flow status, no Scenario badge, approved copy only. Real
// engines feed the real card. Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string): RecurringItem =>
  ({ id, type, label: id, amount, frequency: 'monthly', nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);

function exampleB(): AppData {
  const d = base();
  d.user = { ...d.user, monthlyIncome: 5000, payFrequency: 'monthly', nextPayday: iso(2026, 9, 10) } as typeof d.user;
  d.assets = [everyday('main', 6000)];
  d.recurringItems = [item('rent', 'expense', 1000, iso(2026, 9, 7)), item('gym', 'expense', 150, iso(2026, 9, 10)), item('pay', 'income', 5000, iso(2026, 9, 10))];
  return d;
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

function build(data: AppData, asOf: [number, number, number], target: [number, number, number]) {
  const a = localDate(...asOf), t = localDate(...target);
  const result = computeLookAheadProjection(data, a, t);
  const presentation = selectLookAheadPresentation(result);
  const guide = result.available ? computeDailyGuide(data, a, t, result) : null;
  const events = result.available ? computeProjectedEvents(data, a, t, { windowStart: a }).events : null;
  return { result, presentation, guide, events };
}
const FORBIDDEN = /safe to spend|safely spend|guaranteed|recommended spending|your daily spend|prefix constraint|guard path|cash-path fold|scenario engine/i;

describe('Pass C.2 — Look-ahead card regions and status', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('Example B: Estimated balance $6,000 (Before everyday spending) + About per day $2,425 (For the next 2 days); healthy status; no Scenario badge; no lowest region', async () => {
    const { result, presentation, guide, events } = build(exampleB(), [2026, 9, 4], [2026, 9, 6]);
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Sun, 6 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    expect(await screen.findByTestId('money-scenario-card')).toBeOnTheScreen();
    expect(screen.getByText('Estimated balance by')).toBeOnTheScreen();
    expect(screen.getByText('ESTIMATED BALANCE')).toBeOnTheScreen();
    expect(screen.getByText('Before everyday spending')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$6,000$/);
    expect(screen.getByText('ABOUT PER DAY')).toBeOnTheScreen();
    expect(screen.getByText('For the next 2 days')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$2,425$/);
    // Never the naive $3,000.
    expect(screen.queryByText(/\$3,000/)).toBeNull();
    // Subordinate cash-flow status, neutral tone.
    // The lowest position is the EARLIEST minimum of a flat $6,000 path → 4 Sep (Pass B contract).
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^No scheduled shortfall detected$/);
    expect(screen.getByTestId('money-scenario-cashflow-detail')).toHaveTextContent(/^No dip below your estimated balance before 6 Sep$/);
    // Pass D.2 (founder decision) — a PROVEN no-shortfall path uses the healthy treatment.
    expect(screen.getByTestId('money-scenario-cashflow-icon-healthy', { includeHiddenElements: true })).toBeTruthy();
    // Removed: the Scenario badge, the dominant lowest region, the on-card marker note and assumed count.
    expect(screen.queryByText('Scenario')).toBeNull();
    expect(screen.queryByText('LOWEST POSITION')).toBeNull();
    expect(screen.queryByText('ESTIMATED POSITION')).toBeNull();
    expect(screen.queryByText(/Markers show dated events only/)).toBeNull();
    expect(screen.queryByTestId('money-scenario-assumed')).toBeNull();
    // Kept: the timeline rail (C.5), provenance, actions. Example B has no dated event on or before 6 Sep, so
    // the rail carries no markers and the legend is replaced by the P3 "no events" line.
    expect(screen.getByTestId('money-scenario-timeline')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-timeline-title', { includeHiddenElements: true })).toHaveTextContent(/^Timeline to \d+ \w{3}$/);
    expect(screen.queryByText('Estimated balance path', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('timeline-legend')).toBeNull();
    expect(screen.getByTestId('money-scenario-no-events')).toHaveTextContent('No scheduled events before this date');
    expect(screen.getByTestId('money-scenario-provenance')).toHaveTextContent(/Based on what you've recorded and scheduled/);
    expect(screen.getByTestId('money-back-to-payday')).toBeOnTheScreen();
    expect(screen.getByTestId('money-why-this-amount')).toBeOnTheScreen();
    expect(screen.queryByText(FORBIDDEN)).toBeNull();
  }, 30000);

  test('the About per day region is one accessibility element: amount, period and that it is an estimate', async () => {
    const { result, presentation, guide, events } = build(exampleB(), [2026, 9, 4], [2026, 9, 6]);
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Sun, 6 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    await screen.findByTestId('money-scenario-card');
    const region = screen.getByLabelText(/About per day: \$2,425\. For the next 2 days\. An estimate\./);
    expect(region).toBeTruthy();
    expect(screen.getByLabelText(/ESTIMATED BALANCE: \$6,000\. Before everyday spending/)).toBeTruthy();
    expect(screen.getByLabelText(/Cash-flow status: No scheduled shortfall detected/)).toBeTruthy();
  }, 30000);

  test('shortfall: status reads "Possible shortfall of $X on D Mon" in the caution tone; the guide shows — and defers to it', async () => {
    const d = base();
    d.user = { ...d.user, monthlyIncome: 3000, payFrequency: 'monthly', nextPayday: iso(2026, 9, 20) } as typeof d.user;
    d.assets = [everyday('main', 500)];
    d.recurringItems = [item('rent', 'expense', 1200, iso(2026, 9, 5)), item('pay', 'income', 3000, iso(2026, 9, 20))];
    const { result, presentation, guide, events } = build(d, [2026, 9, 4], [2026, 9, 25]);
    if (!result.available || !result.firstShortfall) throw new Error('fixture should have a shortfall');
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Fri, 25 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    await screen.findByTestId('money-scenario-card');
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^Possible shortfall of \$700 on 5 Sep$/);
    expect(screen.getByTestId('money-scenario-cashflow-icon-caution', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^—$/);
    expect(screen.getByText('Unavailable while a shortfall is expected')).toBeOnTheScreen();
    expect(screen.queryByText('POTENTIAL SHORTFALL')).toBeNull();
    expect(screen.getByTestId('timeline-legend-shortfall')).toBeOnTheScreen();
  }, 30000);

  test('zero capacity: "$0" with "No additional daily room found"', async () => {
    const d = exampleB(); d.assets = [everyday('main', 1150)];
    const { result, presentation, guide, events } = build(d, [2026, 9, 4], [2026, 9, 6]);
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Sun, 6 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    await screen.findByTestId('money-scenario-card');
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$0$/);
    expect(screen.getByText('No additional daily room found')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$1,150$/);
  }, 30000);

  test('no payday after the selected date: "Daily guide unavailable" while the Estimated balance still shows', async () => {
    const d = exampleB(); d.user = { ...d.user, nextPayday: null } as typeof d.user;
    const { result, presentation, guide, events } = build(d, [2026, 9, 4], [2026, 9, 6]);
    await render(
      <Wrap>
        <ScenarioPositionCard presentation={presentation} result={result} guide={guide} events={events} targetDateLabel="Sun, 6 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} />
      </Wrap>
    );
    await screen.findByTestId('money-scenario-card');
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$6,000$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^—$/);
    expect(screen.getByText('Daily guide unavailable')).toBeOnTheScreen();
    expect(screen.getByLabelText(/About per day: daily guide unavailable\. Nolie doesn’t have your next payday yet/)).toBeTruthy();
  }, 30000);
});
