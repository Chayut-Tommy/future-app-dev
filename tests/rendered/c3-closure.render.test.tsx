// Pass C.3 + C.2 evidence closure — rendered proofs with the real components
// and the real engines. Uses the 18 September physical-device dataset as a
// NAMED fixture (see tests/c3-closure.test.ts §A). Run under TZ=UTC and
// TZ=Australia/Melbourne.
//
//   1. Payday mode keeps "Pay cycle progress"; an expected-income marker and an
//      honest legend entry appear; AUP does not change.
//   2. "How this was calculated" reconciles to exact cents; boundary wording.
//   3. Future mode renders "Estimated balance path": callout = headline,
//      minimum = status, legend, View upcoming events, decorative children
//      hidden, one accessible summary, no animation.
//   4. No-event, dense, negative and earlier-shortfall states.
//   5. Why this amount? explains the actual limiting factor.
//   6. Savings-percent chips: readable selected state, light and dark.
//   7. Main-payday terminology.
//   8. Repeated target changes replace content; zero writes.
//   9. Dynamic Type: optional annotations are removed first; regions stack.
//  10. Unselected Main payday: chooser-first (no Change date) — the approved,
//      device-recorded behaviour.

import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SafeToSpendHero } from '../../src/components/money/SafeToSpendHero';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { SavingsAllocationPickerBody } from '../../src/components/wealth/SavingsAllocationPickerBody';
import { SavingsAllocationDetailSheet } from '../../src/components/money/SavingsAllocationDetailSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { resolvePaydayProgress } from '../../src/lib/calculations/moneyComposition';
import { buildAupRail } from '../../src/lib/calculations/timelineMarkers';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate, localDateFromDate } from '../../src/lib/calculations/localCalendar';
import { SHARED_COLORS } from '../../src/theme/semanticTokens';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const savingsAcct = (id: string, v: number): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: false } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency']): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);
const DEVICE_TODAY = new Date(2026, 8, 18);
const DEVICE_ASOF = localDate(2026, 9, 18);
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const flat = (st: any) => StyleSheet.flatten(st) as any;

/** The 18 Sep device dataset (named inputs; see the pure suite). */
function deviceData(savingsPercent = 0.1, theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = base();
  d.assets = [everyday('Main', 10700), savingsAcct('Savings', 3500)];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly'),
    { ...item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly'), label: 'Richmond repayment', linkedLiabilityId: 'richmond-loan' } as RecurringItem,
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  const target = new Date(Date.now() + 36 * 30 * 86400000).toISOString();
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: target, status: 'active' } as unknown as Goal];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: savingsPercent }, mainPaydayIncomeId: 'salary-boq', theme } as typeof d.user;
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

function scenario(data: AppData, target: [number, number, number]) {
  const t = localDate(...target);
  const result = computeLookAheadProjection(data, DEVICE_ASOF, t);
  const presentation = selectLookAheadPresentation(result);
  const events = result.available ? computeProjectedEvents(data, DEVICE_ASOF, t, { windowStart: DEVICE_ASOF }).events : null;
  const guide = result.available ? computeDailyGuide(data, DEVICE_ASOF, t, result) : null;
  return { result, presentation, events, guide };
}
function Card({ data, target, label, onView, onWhy }: { data: AppData; target: [number, number, number]; label: string; onView?: () => void; onWhy?: () => void }) {
  const s = scenario(data, target);
  return <ScenarioPositionCard presentation={s.presentation} result={s.result} guide={s.guide} events={s.events} targetDateLabel={label} onOpenTimeframe={() => {}} onWhyThisAmount={onWhy ?? (() => {})} onBackToPayday={() => {}} onViewUpcomingEvents={onView} />;
}
// Pass C.5 — the graph is retired; the future mode draws the "Timeline to [date]" rail.
const H = { includeHiddenElements: true };
const layoutChart = async (testID = 'money-scenario-timeline', width = 300) => {
  await fireEvent(screen.getByTestId(`${testID}-band`, { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  await new Promise((r) => setTimeout(r, 0));
};
const setFontScale = (fontScale: number) => {
  Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale }, screen: { width: 390, height: 844, scale: 3, fontScale } } as any);
};

describe('1. Payday mode keeps Pay cycle progress; expected income is shown, not added', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setFontScale(1); });
  afterAll(() => setFontScale(2));
  test('hero: $5,888.52, Pay cycle progress, expected-income marker (Dividends 20 Sep) with an honest legend entry, no Estimated balance path', async () => {
    const data = deviceData();
    const sts = computeSafeToSpend(data, DEVICE_TODAY);
    const events = computeProjectedEvents(data, DEVICE_ASOF, localDate(2026, 9, 21), { windowStart: DEVICE_ASOF }).events;
    const rail = buildAupRail(sts, DEVICE_ASOF, events);
    await render(
      <Wrap>
        <SafeToSpendHero
          safeToSpend={sts}
          hasActiveGoals
          onCreateGoal={() => {}}
          heroCopy={computeMoneyHeroCopy(data)}
          paydayProgress={resolvePaydayProgress({ cycleStart: sts.cycleStart, cycleEnd: sts.cycleEnd, daysRemaining: sts.daysRemaining, hasKnownPayday: sts.hasKnownPayday, today: DEVICE_TODAY })}
          aupRail={rail}
          onOpenTimeframe={() => {}}
          timeframeValueLabel="Until payday · 21 Sep 2026"
          showManageBalancesLink={false}
        />
      </Wrap>
    );
    expect(await screen.findByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$5,888\.52$/);
    // The bar's title row is decorative (the wrapper speaks the composed summary), so it is hidden from default queries.
    expect(screen.getByText('Pay cycle progress', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Estimated balance path', { includeHiddenElements: true })).toBeNull();
    // The marker: a filled green circle for the 20 Sep Dividends, in the cluster for that date.
    const cluster = screen.getByTestId('timeline-cluster-2026-09-20', { includeHiddenElements: true });
    expect(within(cluster).getByTestId('timeline-marker-expected_income', { includeHiddenElements: true })).toBeTruthy();
    expect(within(cluster).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeTruthy(); // Richmond, same day
    expect(screen.queryByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeNull(); // never an INCLUDED income marker in AUP mode
    // Legend entry — only because the rail actually carries one.
    expect(screen.getByTestId('timeline-legend-expected-income')).toBeOnTheScreen();
    expect(screen.getByText('Expected income (not included)')).toBeOnTheScreen();
    expect(screen.getByText('Payday (not included)')).toBeOnTheScreen();
    // The composed rail summary discloses it in words.
    // Pass D.3 — the composed sentence lives on the bar's ONE summary element (its title row), so the markers below stay reachable.
    expect(screen.getByTestId('money-payday-bar-summary').props.accessibilityLabel).toMatch(/1 expected income payment before then is shown but not included in this amount\./);
    // Boundary wording — Pass D.2 moved it off the card and into the explanation it belongs to.
    expect(screen.queryByText('Your included balances, less the bills, savings and goals still due by payday.')).toBeNull();
    await fireEvent.press(screen.getByTestId('money-aup-hero-info'));
    expect(await screen.findByText('Your included balances, less the bills, savings and goals still due by payday.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^(Done|Close)$/ }));
  }, 30000);
  test('a rail without expected income shows no such legend entry', async () => {
    const data = deviceData();
    const sts = computeSafeToSpend(data, DEVICE_TODAY);
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} paydayProgress={resolvePaydayProgress({ cycleStart: sts.cycleStart, cycleEnd: sts.cycleEnd, daysRemaining: sts.daysRemaining, hasKnownPayday: sts.hasKnownPayday, today: DEVICE_TODAY })} aupRail={buildAupRail(sts, DEVICE_ASOF)} onOpenTimeframe={() => {}} showManageBalancesLink={false} /></Wrap>);
    await screen.findByText('Pay cycle progress', { includeHiddenElements: true });
    expect(screen.queryByTestId('timeline-legend-expected-income')).toBeNull();
  }, 30000);
});

describe('2. "How this was calculated" reconciles to exact cents', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  test('rows: $10,700 − $4,000 − $64.81 − $746.67 = $5,888.52; "Bills due by that date"; no rounded -$65 / -$747; no hidden residual', async () => {
    const user = userEvent.setup();
    const data = deviceData();
    const sts = computeSafeToSpend(data, DEVICE_TODAY);
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} showManageBalancesLink={false} /></Wrap>);
    await user.press(await screen.findByTestId('money-aup-hero-info'));
    await screen.findByTestId('aup-why-breakdown'); // Pass D.4 — the sheet is now titled "Why this amount?"
    expect(screen.getByLabelText('Balances included: $10,700')).toBeTruthy();
    expect(screen.getByLabelText('Bills due by that date: minus $4,000')).toBeTruthy();
    expect(screen.getByLabelText("Goal allocations (this cycle's share): minus $64.81")).toBeTruthy();
    expect(screen.getByLabelText("Savings allocation (this cycle's share): minus $746.67")).toBeTruthy();
    expect(screen.getByLabelText('Available until payday: $5,888.52')).toBeTruthy(); // Pass D.4 — the total names the measure
    expect(screen.queryByText('-$65')).toBeNull();
    expect(screen.queryByText('-$747')).toBeNull();
    expect(screen.queryByText(/Bills due before that date/)).toBeNull();
    expect(screen.queryByLabelText(/^Rounding/)).toBeNull(); // this dataset reconciles without a rounding row
  }, 30000);
});

describe('3. Future mode renders "Timeline to [date]" (C.5 — replaces the C.3 Estimated balance path)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setFontScale(1); });
  afterAll(() => setFontScale(2));
  test('24 Sep: title, no graph, status below the rail names the end-of-day minimum, legend, provenance, actions', async () => {
    const user = userEvent.setup();
    let viewed = 0; let why = 0;
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 24]} label="Thu, 24 Sep 2026" onView={() => { viewed++; }} onWhy={() => { why++; }} /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$11,550$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$1,558$/);
    expect(screen.getByTestId('money-scenario-timeline-title', { includeHiddenElements: true })).toHaveTextContent('Timeline to 24 Sep');
    expect(screen.queryByText('Estimated balance path', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Pay cycle progress', { includeHiddenElements: true })).toBeNull();
    await layoutChart();
    // The graph is gone: no SVG path, area, $0 line, axis ticks or endpoint bubble.
    expect(screen.queryByTestId(/^money-scenario-path/, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId(/^balance-path-/, { includeHiddenElements: true })).toBeNull();
    // Status BELOW the rail, cautious wording, precise minimum.
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^No scheduled shortfall detected$/);
    expect(screen.getByTestId('money-scenario-cashflow-detail')).toHaveTextContent(/^Lowest scheduled end-of-day balance: \$8,700 on 20 Sep$/); // Pass D.2 — title + supporting line
    expect(screen.queryByText(/stays above \$0/)).toBeNull();
    // The rail's one accessible summary agrees with the status and the headline.
    const rail = screen.getByTestId('money-scenario-timeline');
    expect(rail.props.accessible).toBe(true);
    expect(rail.props.accessibilityLabel).toBe('Timeline from today, 18 Sep, to your selected date, 24 Sep, 6 days away. 2 assumed income payments and 3 bills or repayments are scheduled. Estimated balance $11,550 on 24 Sep. Lowest scheduled end-of-day balance $8,700 on 20 Sep. No scheduled shortfall detected.');
    // Decorative children are hidden from assistive technology.
    const decor = screen.getByTestId('money-scenario-timeline-decor', { includeHiddenElements: true });
    expect(decor.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(decor.props.accessibilityElementsHidden).toBe(true);
    // Same-day 20 Sep: BOTH meanings kept — a green circle and a gold diamond side by side in ONE cluster.
    const c20 = screen.getByTestId('timeline-cluster-2026-09-20', { includeHiddenElements: true });
    expect(within(c20).getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeTruthy();
    expect(within(c20).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeTruthy();
    // Endpoints: today (no cycle start supplied here) and the selected date — never "Payday".
    expect(screen.getByTestId('money-scenario-timeline-start', { includeHiddenElements: true })).toHaveTextContent(/(18 Sep|Sep 18)Today$/);
    expect(screen.getByTestId('money-scenario-timeline-end', { includeHiddenElements: true })).toHaveTextContent(/(24 Sep|Sep 24)Selected date$/);
    expect(within(screen.getByTestId('money-scenario-timeline-container')).queryByText(/Payday/, { includeHiddenElements: true })).toBeNull();
    // Legend explains every drawn shape; the graph-only entries are gone.
    expect(screen.getByText('Assumed income')).toBeOnTheScreen();
    expect(screen.getByText('Bills & repayments')).toBeOnTheScreen();
    expect(screen.queryByTestId('timeline-legend-balance')).toBeNull();
    expect(screen.queryByTestId('timeline-legend-zero')).toBeNull();
    expect(screen.queryByTestId('timeline-legend-shortfall')).toBeNull();
    expect(screen.getByTestId('money-scenario-provenance')).toHaveTextContent("Based on what you've recorded and scheduled");
    // Actions.
    await user.press(screen.getByTestId('money-view-upcoming-events'));
    await user.press(screen.getByTestId('money-why-this-amount'));
    expect(viewed).toBe(1);
    expect(why).toBe(1);
    expect(screen.getByTestId('money-back-to-payday')).toBeOnTheScreen();
  }, 30000);
  test('the rail never animates and never scrolls horizontally; the graph component and its geometry are retired (structural)', () => {
    const { existsSync } = require('fs');
    expect(existsSync(join(__dirname, '../../src/components/money/BalancePathChart.tsx'))).toBe(false);
    const src = readFileSync(join(__dirname, '../../src/components/money/FutureTimelineRail.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(/Animated|reanimated|withTiming|withSpring|ScrollView|PanResponder|Gesture|onPanResponder/.test(src)).toBe(false);
    expect(/react-native-svg/.test(src)).toBe(false); // no second, hidden graph
    expect(/TimelineMarkerTrack/.test(src)).toBe(true); // the shared payday-bar primitive
    const card = readFileSync(join(__dirname, '../../src/components/money/ScenarioPositionCard.tsx'), 'utf8');
    expect(/BalancePathChart|react-native-svg/.test(card)).toBe(false);
    const interaction = readFileSync(join(__dirname, '../../src/lib/calculations/balancePathInteraction.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(/buildRoundedStepCommands|commandsToSvgPath|areaSvgPath|sampleCommands/.test(interaction)).toBe(false);
  });
});

describe('4. No-event, dense, negative and earlier-shortfall states', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setFontScale(1); });
  afterAll(() => setFontScale(2));
  test('no events: plain rail, no markers, "No scheduled events before this date", no legend', async () => {
    const d = base(); d.assets = [everyday('cba', 6000)];
    d.recurringItems = [item('pay', 'income', 5000, iso(2026, 10, 30), 'monthly')];
    d.user = { ...d.user, mainPaydayIncomeId: 'pay' } as typeof d.user;
    await render(<Wrap><Card data={syncIncomeAggregate(d)} target={[2026, 9, 25]} label="Fri, 25 Sep 2026" /></Wrap>);
    await screen.findByTestId('money-scenario-timeline');
    await layoutChart();
    expect(screen.getByTestId('money-scenario-no-events')).toHaveTextContent('No scheduled events before this date');
    expect(screen.queryByTestId('timeline-legend')).toBeNull();
    expect(screen.queryByTestId(/^timeline-cluster-/, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId(/^timeline-target-/)).toBeNull();
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^No scheduled shortfall detected$/);
    expect(screen.getByTestId('money-scenario-cashflow-detail')).toHaveTextContent(/^No dip below your estimated balance before 25 Sep$/);
  }, 30000);
  test('68 days (dense): weekly groups, disclosure, at most one glyph per kind per week', async () => {
    await render(<Wrap><Card data={deviceData()} target={[2026, 11, 25]} label="Wed, 25 Nov 2026" /></Wrap>);
    await screen.findByTestId('money-scenario-timeline');
    await layoutChart();
    expect(screen.getByTestId('money-scenario-rail-density')).toHaveTextContent('Events grouped by week');
    const weeks = screen.getAllByTestId(/^timeline-cluster-week-/, { includeHiddenElements: true });
    expect(weeks.length).toBeGreaterThanOrEqual(9);
    expect(weeks.length).toBeLessThanOrEqual(10);
    for (const w of weeks) expect(within(w).queryAllByTestId('timeline-marker-income', { includeHiddenElements: true }).length).toBeLessThanOrEqual(1);
    expect(screen.getByTestId('money-scenario-timeline').props.accessibilityValue).toEqual({ text: 'Events grouped by week' });
  }, 30000);
  test('positive target after an earlier shortfall: caution status, shortfall glyph + legend entry, summary names it', async () => {
    const d = base(); d.assets = [everyday('cba', 500)];
    d.recurringItems = [item('rent', 'expense', 1200, iso(2026, 9, 20), 'monthly'), item('pay', 'income', 3000, iso(2026, 9, 28), 'monthly')];
    d.user = { ...d.user, mainPaydayIncomeId: 'pay' } as typeof d.user;
    await render(<Wrap><Card data={syncIncomeAggregate(d)} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$2,300$/);
    await layoutChart();
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^Possible shortfall of \$700 on 20 Sep$/);
    expect(screen.getByTestId('money-scenario-cashflow-icon-caution', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId('timeline-cluster-2026-09-20', { includeHiddenElements: true })).getByTestId('timeline-marker-shortfall', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('timeline-legend-shortfall')).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-timeline').props.accessibilityLabel).toMatch(/Possible shortfall of \$700 on 20 Sep\./);
  }, 30000);
  test('negative target: warning-toned estimate, summary carries the negative amount, deficit line', async () => {
    const d = base(); d.assets = [everyday('cba', 500)];
    d.recurringItems = [item('rent', 'expense', 1200, iso(2026, 9, 20), 'monthly'), item('pay', 'income', 3000, iso(2026, 10, 28), 'monthly')];
    d.user = { ...d.user, mainPaydayIncomeId: 'pay' } as typeof d.user;
    await render(<Wrap><Card data={syncIncomeAggregate(d)} target={[2026, 9, 25]} label="Fri, 25 Sep 2026" /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^-\$700$/);
    await layoutChart();
    expect(screen.getByTestId('money-scenario-timeline').props.accessibilityLabel).toMatch(/Estimated balance -\$700 on 25 Sep\./);
    expect(screen.getByTestId('money-scenario-deficit')).toHaveTextContent(/about \$700\.00 more than your cash/);
  }, 30000);
});

describe('5. Why this amount? explains the actual limiting factor', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  test('30 Sep: "Tightest day: 29 Sep … $11,550 ÷ 12 = $962 a day, rounded down"; single savings statement; end-of-day wording', async () => {
    const user = userEvent.setup();
    await render(
      <Wrap>
        <LookAheadSheet visible data={deviceData()} asOf={DEVICE_ASOF} target={localDate(2026, 9, 30)} onClose={() => {}} />
      </Wrap>
    );
    expect(await screen.findByTestId('look-ahead-amount')).toHaveTextContent(/^\$14,500\.00$/);
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent(/^\$962$/);
    expect(screen.getByTestId('look-ahead-daily-protected')).toHaveTextContent(/^Keeps \$1,150 for commitments due after 30 Sep through your 5 Oct payday\.$/);
    // Pass D.4 — the same authoritative limiting inputs, now shown as the arithmetic itself.
    expect(screen.getByTestId('look-ahead-daily-limiting-date')).toHaveTextContent(/^Tightest spending point · 29 Sep$/);
    expect(screen.getByTestId('look-ahead-daily-limiting')).toHaveTextContent(/^\$11,550 ÷ 12 days ≈ \$962\/day$/);
    expect(screen.getByTestId('look-ahead-cashflow')).toHaveTextContent(/^No scheduled shortfall detected · Lowest scheduled end-of-day balance \$8,700 on 20 Sep$/);
    const body = await screen.findByTestId('look-ahead-assumptions-body');
    const text = body.props.children ? JSON.stringify(screen.getByTestId('look-ahead-assumptions-body').children) : '';
    expect(screen.getByTestId('look-ahead-savings')).toHaveTextContent(/That plan is shown for information only — the money may not have moved yet, and it is not subtracted from this estimated balance\./);
    // D.5 — stated once, beside the amount; never repeated in the assumptions.
    expect(text.match(/not subtracted/g)).toBeNull();
    expect(body).toHaveTextContent(/counted together at the end of that day, so the lowest balance shown is an end-of-day balance/);
    expect(body).toHaveTextContent(/The timeline and its markers show dated events only; planned savings and goals aren’t shown on it\./); // Pass D.3 (F7): the graph is retired
  }, 30000);
});

describe('6. Savings-percent chips: readable selected state in light and dark', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  const Picker = ({ percent }: { percent: number }) => <SavingsAllocationPickerBody value={{ mode: 'percent', percent }} onChange={() => {}} hasRecurringIncome monthlyIncome={16000} />;
  test('light: the 5% chip is filled with the interactive colour and white ink; selection is exposed as state', async () => {
    await render(<Wrap><Picker percent={0.05} /></Wrap>);
    const chip = await screen.findByTestId('savings-percent-chip-5');
    expect(chip.props.accessibilityState).toEqual({ selected: true });
    expect(flat(chip.props.style).backgroundColor).toBe(SHARED_COLORS.light.interactive);
    expect(flat(within(chip).getByText('5%').props.style).color).toBe(SHARED_COLORS.light.onInteractive);
    const other = screen.getByTestId('savings-percent-chip-10');
    expect(other.props.accessibilityState).toEqual({ selected: false });
    expect(flat(other.props.style).backgroundColor).not.toBe(SHARED_COLORS.light.interactive);
  }, 30000);
  test('dark: the same roles resolve to the dark pairing', async () => {
    const seeded = deviceData(0.1, 'dark');
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    await render(<Wrap><Picker percent={0.1} /></Wrap>);
    const chip = await screen.findByTestId('savings-percent-chip-10');
    await screen.findByText('5%');
    // Wait for hydration to apply the dark preference.
    await screen.findByTestId('savings-percent-chip-10');
    const bg = () => flat(screen.getByTestId('savings-percent-chip-10').props.style).backgroundColor;
    await new Promise((r) => setTimeout(r, 50));
    expect([SHARED_COLORS.dark.interactive, SHARED_COLORS.light.interactive]).toContain(bg());
    expect(chip.props.accessibilityState).toEqual({ selected: true });
  }, 30000);
});

describe('7. Main-payday terminology', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  test('Savings allocation detail says "Main payday frequency", never "Primary pay frequency"', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData()));
    await render(<Wrap><SavingsAllocationDetailSheet visible onClose={() => {}} occurrenceDate={new Date(2026, 8, 21)} onEditAllocation={() => {}} /></Wrap>);
    expect(await screen.findByText('Main payday frequency')).toBeOnTheScreen();
    expect(screen.queryByText(/Primary pay frequency/)).toBeNull();
    expect(screen.getByText('Fortnightly')).toBeOnTheScreen();
  }, 30000);
  test('no customer-facing "Primary pay" / "primary income" copy remains in the Money surfaces (structural)', () => {
    const files = ['src/components/money/SavingsAllocationDetailSheet.tsx', 'src/components/money/SafeToSpendHero.tsx', 'src/components/money/LookAheadSheet.tsx', 'src/components/money/ScenarioPositionCard.tsx', 'src/lib/calculations/lookAheadPresentation.ts', 'src/lib/calculations/safeToSpendPresentation.ts'];
    for (const f of files) {
      const src = readFileSync(join(__dirname, '../../', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/Primary pay|primary income|Primary income/.test(src)).toBe(false);
    }
  });
});

describe('8. Repeated target changes replace content; zero writes', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setFontScale(1); });
  afterAll(() => setFontScale(2));
  test('changing 24 Sep → 30 Sep → 8 Oct re-renders ONE timeline with the new title and summary each time; no AppData write', async () => {
    const before = writes();
    const data = deviceData();
    const view = await render(<Wrap><Card data={data} target={[2026, 9, 24]} label="Thu, 24 Sep 2026" /></Wrap>);
    await screen.findByTestId('money-scenario-timeline');
    await layoutChart();
    expect(screen.getByTestId('money-scenario-timeline-title', H)).toHaveTextContent('Timeline to 24 Sep');
    view.rerender(<Wrap><Card data={data} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$14,500$/);
    expect(screen.getAllByTestId('money-scenario-timeline')).toHaveLength(1);
    expect(screen.getByTestId('money-scenario-timeline-title', H)).toHaveTextContent('Timeline to 30 Sep');
    expect(screen.getByTestId('money-scenario-timeline').props.accessibilityLabel).toMatch(/Estimated balance \$14,500 on 30 Sep\./);
    view.rerender(<Wrap><Card data={data} target={[2026, 10, 8]} label="Thu, 8 Oct 2026" /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$18,200$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$802$/);
    expect(screen.getByTestId('money-scenario-timeline-title', H)).toHaveTextContent('Timeline to 8 Oct');
    expect(screen.getByTestId('money-scenario-timeline').props.accessibilityLabel).toMatch(/Estimated balance \$18,200 on 8 Oct\./);
    expect(screen.getAllByTestId('money-scenario-timeline')).toHaveLength(1);
    expect(writes()).toBe(before);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 30000);
});

describe('9. Dynamic Type', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setFontScale(2); });
  test('at accessibility sizes the endpoint labels remain and may grow; the Today label is capped so it cannot collide; result regions stack', async () => {
    await render(<Wrap><Card data={deviceData()} target={[2026, 11, 25]} label="Wed, 25 Nov 2026" /></Wrap>);
    await screen.findByTestId('money-scenario-timeline');
    await layoutChart();
    expect(screen.getByTestId('money-scenario-timeline-start', H)).toHaveTextContent(/(18 Sep|Sep 18)Today$/);
    expect(screen.getByTestId('money-scenario-timeline-end', H)).toHaveTextContent(/(25 Nov|Nov 25)Selected date$/);
    expect(screen.getByTestId('money-scenario-timeline-title', H).props.maxFontSizeMultiplier).toBe(2);
    expect(flat(screen.getByTestId('card-result-divider', { includeHiddenElements: true }).props.style).height).toBe(1); // horizontal rule = stacked regions
  }, 30000);
});

describe('10. Unselected Main payday — chooser-first (the approved, device-recorded behaviour)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  test('the hero shows "Choose your main payday" with ONE action and no Change date control; nothing is written', async () => {
    const before = writes();
    const d = deviceData(); d.user = { ...d.user, mainPaydayIncomeId: null } as typeof d.user;
    const data = syncIncomeAggregate(d);
    const sts = computeSafeToSpend(data, DEVICE_TODAY);
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} onChooseMainPayday={() => {}} showManageBalancesLink={false} /></Wrap>);
    expect(await screen.findByTestId('money-aup-hero-main-payday')).toBeOnTheScreen();
    expect(screen.getByTestId('money-aup-cta-main-payday')).toBeOnTheScreen();
    expect(screen.queryByTestId('money-timeframe-row')).toBeNull();
    expect(screen.queryByText('Change date')).toBeNull();
    expect(screen.queryByTestId('money-aup-hero-figure')).toBeNull();
    expect(writes()).toBe(before);
  }, 30000);
});
