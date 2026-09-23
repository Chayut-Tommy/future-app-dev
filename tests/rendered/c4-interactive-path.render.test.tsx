// Pass C.4B — rendered proofs for read-only event inspection. Pass C.5 retired
// the Estimated balance path graph: the SAME inspection behaviour is now proven
// on the "Timeline to [date]" rail. Real engines, real components, the 18 Sep
// 18:49 device fixture (no cycle start supplied → the rail starts at Today).
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { SHARED_COLORS } from '../../src/theme/semanticTokens';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);
const ASOF = localDate(2026, 9, 18);
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const flat = (st: any) => StyleSheet.flatten(st) as any;
// Row label/amount/type texts sit inside ONE accessible row element, so they are hidden from default queries.
const H = { includeHiddenElements: true };

function deviceData(theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = base();
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 10700, includeInMoneyCalculations: true } as Asset,
    { id: 'Savings', type: 'savings', label: 'Savings', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly', 'Dividends'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent'),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly', 'Gym'),
    { ...item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment'), linkedLiabilityId: 'richmond-loan' } as RecurringItem,
    item('internet', 'expense', 50, iso(2026, 9, 19), 'weekly', 'Internet'),
    item('utilities', 'expense', 250, iso(2026, 10, 1), 'monthly', 'Utilities'),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: 0.05 }, mainPaydayIncomeId: 'salary-boq', theme } as typeof d.user;
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
function Card({ data, target, label, onBack }: { data: AppData; target: [number, number, number]; label: string; onBack?: () => void }) {
  const t = localDate(...target);
  const result = computeLookAheadProjection(data, ASOF, t);
  const events = result.available ? computeProjectedEvents(data, ASOF, t, { windowStart: ASOF }).events : null;
  const guide = result.available ? computeDailyGuide(data, ASOF, t, result) : null;
  return <ScenarioPositionCard presentation={selectLookAheadPresentation(result)} result={result} guide={guide} events={events} targetDateLabel={label} onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={onBack ?? (() => {})} onViewUpcomingEvents={() => {}} />;
}
const P = 'money-scenario-timeline';
const layoutChart = async (width: number) => {
  await fireEvent(screen.getByTestId(`${P}-band`, { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  await screen.findAllByTestId(/^timeline-target-/);
};
const setWindow = (fontScale: number, width = 390) => Dimensions.set({ window: { width, height: 844, scale: 3, fontScale }, screen: { width, height: 844, scale: 3, fontScale } } as any);

describe('C.4B — inspecting markers', () => {
  let announce: jest.SpyInstance;
  beforeEach(async () => { await AsyncStorage.clear(); setWindow(1); announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {}); });
  afterEach(() => announce.mockRestore());
  afterAll(() => setWindow(2));

  test('individual outgoing and income markers; same-date mixed group; replace; re-tap, Close and outside-tap dismissal; zero writes; estimate unchanged', async () => {
    const user = userEvent.setup();
    const before = writes();
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(600); // wide enough that every date has its own 44pt slot
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();

    // 1. Individual outgoing marker — 19 Sep Internet.
    await user.press(screen.getByTestId('timeline-target-2026-09-19'));
    expect(await screen.findByTestId(`${P}-detail-title`)).toHaveTextContent('19 Sep · 1 scheduled event');
    const d19 = screen.getByTestId(`${P}-detail`);
    expect(within(d19).getByText('Internet', H)).toBeOnTheScreen();
    expect(within(d19).getByText('-$50', H)).toBeOnTheScreen();
    expect(within(d19).getByText('Scheduled bill', H)).toBeOnTheScreen();
    expect(within(d19).getByText('End-of-day balance: $10,650')).toBeOnTheScreen();
    expect(within(d19).queryByText(/Same-day net/)).toBeNull();
    expect(screen.getByTestId('timeline-target-2026-09-19').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('timeline-halo-2026-09-19', { includeHiddenElements: true })).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Showing 19 Sep · 1 scheduled event\. 19 September: Internet, scheduled bill, minus \$50\. End-of-day balance \$10,650\.$/));

    // 2. Same-date mixed group REPLACES the previous selection (only one at a time).
    await user.press(screen.getByTestId('timeline-target-2026-09-20'));
    expect(await screen.findByText('20 Sep · 2 scheduled events')).toBeOnTheScreen();
    const d20 = screen.getByTestId(`${P}-detail`);
    expect(within(d20).getByText('Dividends', H)).toBeOnTheScreen();
    expect(within(d20).getByText('+$1,000', H)).toBeOnTheScreen();
    expect(within(d20).getByText('Assumed income, not received', H)).toBeOnTheScreen();
    expect(within(d20).getByText('Richmond repayment', H)).toBeOnTheScreen();
    expect(within(d20).getByText('-$3,000', H)).toBeOnTheScreen();
    expect(within(d20).getByText('Scheduled mortgage repayment', H)).toBeOnTheScreen();
    expect(within(d20).getByText('Same-day net: -$2,000')).toBeOnTheScreen();
    expect(within(d20).getByText('End-of-day balance: $8,650')).toBeOnTheScreen();
    expect(within(d20).queryByText(/first|then|before|after/i)).toBeNull(); // no invented order
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    expect(screen.queryByTestId('timeline-halo-2026-09-19', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('timeline-target-2026-09-19').props.accessibilityState).toEqual({ selected: false });
    // Rows carry canonical occurrence identities.
    expect(screen.getByTestId('timeline-row-oid1:income:dividends:2026-09-20')).toBeTruthy();

    // 3. Individual income marker — 27 Sep Dividends.
    await user.press(screen.getByTestId('timeline-target-2026-09-27'));
    expect(await screen.findByText('27 Sep · 1 scheduled event')).toBeOnTheScreen();
    expect(within(screen.getByTestId(`${P}-detail`)).getByText('End-of-day balance: $12,450')).toBeOnTheScreen();

    // 4. Dismissal: tapping the selected marker again…
    await user.press(screen.getByTestId('timeline-target-2026-09-27'));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    // …the accessible Close button…
    await user.press(screen.getByTestId('timeline-target-2026-09-24'));
    await user.press(await screen.findByTestId(`${P}-detail-close`));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    // …and tapping the plot outside the callout.
    await user.press(screen.getByTestId('timeline-target-2026-09-24'));
    await screen.findByTestId(`${P}-detail`);
    await user.press(screen.getByTestId(`${P}-backdrop`, { includeHiddenElements: true }));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();

    // The hero figures never moved, and nothing was written.
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$14,400$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$954$/);
    expect(screen.getByTestId('money-scenario-cashflow-detail')).toHaveTextContent(/^Lowest scheduled end-of-day balance: \$8,650 on 20 Sep$/); // Pass D.2 — the status's supporting line
    expect(writes()).toBe(before);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 60000);

  test('targets: ≥ 44×44, non-overlapping, chronological accessibility order, button role, complete labels, hint; the drawn rail stays hidden', async () => {
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(266); // an iPhone-width rail
    const targets = screen.getAllByTestId(/^timeline-target-/);
    expect(targets.length).toBeGreaterThanOrEqual(4);
    let prevRight = -1; let prevKey = '';
    for (const t of targets) {
      const st = flat(t.props.style);
      expect(st.width).toBeGreaterThanOrEqual(44);
      expect(st.height).toBeGreaterThanOrEqual(44);
      expect(st.left).toBeGreaterThanOrEqual(prevRight - 1e-6);
      prevRight = st.left + st.width;
      expect(t.props.accessibilityRole).toBe('button');
      expect(t.props.accessibilityState).toEqual({ selected: false });
      expect(t.props.accessibilityHint).toBe('Shows the details for these scheduled events');
      const key = String(t.props.testID);
      expect(key > prevKey).toBe(true); // ISO keys → chronological order in the tree
      prevKey = key;
    }
    // 19 and 20 Sep are too close to separate at this width → ONE collision target.
    expect(targets.map((t) => t.props.testID)).toEqual(['timeline-target-2026-09-19+2026-09-20', 'timeline-target-2026-09-21', 'timeline-target-2026-09-24+2026-09-26', 'timeline-target-2026-09-27', 'timeline-target-2026-09-28+2026-09-30']);
    const collision = screen.getByTestId('timeline-target-2026-09-19+2026-09-20');
    expect(collision.props.accessibilityLabel).toBe('19 September: Internet, scheduled bill, minus $50. End-of-day balance $10,650. 20 September: Dividends, assumed income, not received, plus $1,000. Richmond repayment, scheduled mortgage repayment, minus $3,000. Same-day net minus $2,000. End-of-day balance $8,650.');
    // The drawn glyphs remain decorative: found only with includeHiddenElements.
    expect(screen.queryByTestId('timeline-cluster-2026-09-20')).toBeNull();
    expect(screen.getByTestId('timeline-cluster-2026-09-20', { includeHiddenElements: true })).toBeTruthy();
    const decor = screen.getByTestId(`${P}-decor`, { includeHiddenElements: true });
    expect(decor.props.accessibilityElementsHidden).toBe(true);
    expect(decor.props.pointerEvents).toBe('none');
    // The summary element is still one accessible stop.
    expect(screen.getByTestId(P).props.accessibilityLabel).toMatch(/^Timeline from today, 18 Sep, to your selected date, 30 Sep, 12 days away\. /);
  }, 60000);

  test('collision group on a phone-width plot shows a section per date, each with its own end-of-day balance; anchored callout with a caret', async () => {
    const user = userEvent.setup();
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(266);
    await user.press(screen.getByTestId('timeline-target-2026-09-21'));
    expect(await screen.findByTestId(`${P}-detail-anchored`)).toBeOnTheScreen(); // fits → anchored
    expect(screen.getByTestId(`${P}-detail-caret`, { includeHiddenElements: true })).toBeTruthy();
    const wrap = flat(screen.getByTestId(`${P}-detail`).props.style);
    expect(wrap.marginLeft).toBeGreaterThanOrEqual(0);
    expect(wrap.marginLeft + wrap.width).toBeLessThanOrEqual(266 + 44 + 1e-6); // never clips past the card
    await user.press(screen.getByTestId('timeline-target-2026-09-19+2026-09-20'));
    expect(await screen.findByText('19 Sep – 20 Sep · 3 scheduled events')).toBeOnTheScreen();
    expect(screen.getByTestId(`${P}-detail-inline`)).toBeOnTheScreen(); // many rows → full-width inline card
    expect(screen.getByText('End-of-day balance: $10,650')).toBeOnTheScreen();
    expect(screen.getByText('End-of-day balance: $8,650')).toBeOnTheScreen();
    expect(screen.getByText('Richmond repayment', H)).toBeOnTheScreen();
  }, 60000);

  test('weekly group (69 days): range, counts, exact totals, net, dated sources and the route to the full list — never one transaction', async () => {
    const user = userEvent.setup();
    await render(<Wrap><Card data={deviceData()} target={[2026, 11, 26]} label="Thu, 26 Nov 2026" /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$25,150$/);
    await layoutChart(600);
    const first = screen.getAllByTestId(/^timeline-target-week-/)[0];
    expect(first.props.accessibilityLabel).toMatch(/^18 September to 24 September: \d+ scheduled events\. Assumed income plus \$5,000\. Outgoing commitments minus \$4,200\. Net effect plus \$800\. End-of-week balance \$11,500\.$/);
    await user.press(first);
    const detail = await screen.findByTestId(`${P}-detail`);
    expect(screen.getByTestId(`${P}-detail-title`)).toHaveTextContent('18 Sep – 24 Sep · 6 scheduled events');
    expect(within(detail).getByText('Assumed income (2): +$5,000')).toBeOnTheScreen();
    expect(within(detail).getByText('Outgoing commitments (4): -$4,200')).toBeOnTheScreen();
    expect(within(detail).getByText('Net effect: +$800')).toBeOnTheScreen();
    expect(within(detail).getByText('End-of-week balance: $11,500')).toBeOnTheScreen();
    expect(within(detail).getByText('20 Sep · Dividends', H)).toBeOnTheScreen();
    expect(within(detail).getByText('19 Sep · Internet', H)).toBeOnTheScreen();
    expect(screen.getByTestId('money-scenario-rail-density')).toHaveTextContent('Events grouped by week');
    expect(screen.getByTestId('money-view-upcoming-events')).toBeOnTheScreen(); // the complete timeline stays one tap away
  }, 60000);

  test('selection clears when the target date changes and when Back to payday leaves the scenario', async () => {
    const user = userEvent.setup();
    const data = deviceData();
    function Host() {
      const [target, setTarget] = React.useState<[number, number, number] | null>([2026, 9, 30]);
      return target ? (
        <>
          <Card data={data} target={target} label="x" onBack={() => setTarget(null)} />
          <ScenarioSwitch onPress={() => setTarget([2026, 10, 24])} />
        </>
      ) : null;
    }
    const ScenarioSwitch = ({ onPress }: { onPress: () => void }) => {
      const { Text, TouchableOpacity } = require('react-native');
      return <TouchableOpacity testID="switch-date" onPress={onPress}><Text>switch</Text></TouchableOpacity>;
    };
    await render(<Wrap><Host /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(600);
    await user.press(screen.getByTestId('timeline-target-2026-09-20'));
    await screen.findByTestId(`${P}-detail`);
    await user.press(screen.getByTestId('switch-date'));
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$18,350$/);
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull(); // cleared by the date change
    expect(screen.queryByTestId(/^timeline-halo-/, { includeHiddenElements: true })).toBeNull();
    await user.press(screen.getAllByTestId(/^timeline-target-week-/)[0]);
    await screen.findByTestId(`${P}-detail`);
    await user.press(screen.getByTestId('money-back-to-payday'));
    expect(screen.queryByTestId(P)).toBeNull(); // scenario left → nothing survives
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 60000);

  test('long source name and a large negative amount stay inside the card (wrap, never truncate)', async () => {
    const user = userEvent.setup();
    const d = base();
    d.assets = [{ id: 'cba', type: 'everyday', label: 'cba', currentValue: 100, includeInMoneyCalculations: true } as Asset];
    d.recurringItems = [item('long', 'expense', 1234567.89, iso(2026, 9, 22), 'monthly', 'A very long source name that a customer typed in full for their strata and body corporate levy')];
    await render(<Wrap><Card data={syncIncomeAggregate(d)} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(222); // 320pt-class iPhone plot
    await user.press(screen.getByTestId('timeline-target-2026-09-22'));
    const detail = await screen.findByTestId(`${P}-detail-inline`); // narrow plot → inline card
    const label = within(detail).getByText(/A very long source name/, H);
    expect(label.props.numberOfLines).toBeUndefined();
    expect(flat(label.props.style).flexShrink).toBe(1);
    expect(within(detail).getByText('-$1,234,567.89', H)).toBeOnTheScreen();
    expect(within(detail).getByText('End-of-day balance: -$1,234,467.89')).toBeOnTheScreen();
    expect(within(detail).getByText('Possible shortfall of $1,234,467.89 on 22 Sep')).toBeOnTheScreen();
  }, 60000);
});

describe('C.4B — Dynamic Type, themes, Reduce Motion', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  afterAll(() => setWindow(2));
  test('largest Dynamic Type: the detail is a full-width inline card below the plot; text may grow to 2×; close target ≥ 44pt', async () => {
    const user = userEvent.setup();
    setWindow(2);
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await layoutChart(266);
    await user.press(screen.getByTestId('timeline-target-2026-09-21'));
    expect(await screen.findByTestId(`${P}-detail-inline`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`${P}-detail-caret`, { includeHiddenElements: true })).toBeNull();
    expect(flat(screen.getByTestId(`${P}-detail`).props.style).width).toBeUndefined(); // full width
    const close = flat(screen.getByTestId(`${P}-detail-close`).props.style);
    expect(close.minWidth).toBeGreaterThanOrEqual(44);
    expect(close.minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByTestId(`${P}-detail-title`).props.maxFontSizeMultiplier).toBe(2);
  }, 60000);
  test('dark theme: halo, card border and text resolve to the dark semantic roles', async () => {
    const user = userEvent.setup();
    setWindow(1);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData('dark')));
    await render(<Wrap><Card data={deviceData('dark')} target={[2026, 9, 30]} label="Wed, 30 Sep 2026" /></Wrap>);
    await screen.findByTestId(P);
    await new Promise((r) => setTimeout(r, 60)); // hydration applies the stored dark preference
    await layoutChart(600);
    await user.press(screen.getByTestId('timeline-target-2026-09-20'));
    await screen.findByTestId(`${P}-detail`);
    expect(screen.getByTestId('timeline-halo-2026-09-20', { includeHiddenElements: true })).toBeTruthy();
    const card = flat(screen.getByTestId(`${P}-detail-anchored`).props.style);
    expect([SHARED_COLORS.dark.interactive, SHARED_COLORS.light.interactive]).toContain(card.borderColor);
  }, 60000);
  test('Reduce Motion / structure: selection is plain state — no animation, gesture, scroll, pan or zoom code exists in the rail', () => {
    const src = readFileSync(join(__dirname, '../../src/components/money/FutureTimelineRail.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(/Animated|reanimated|withTiming|withSpring|LayoutAnimation|ScrollView|PanResponder|Gesture|onPanResponder|pinch|zoom/i.test(src)).toBe(false);
    expect(/useAppState|AsyncStorage|persist|updateUser/.test(src)).toBe(false); // cannot write anything
    expect(/navigation|editItem|AddIncomeModal|AddRecurringItemModal/.test(src)).toBe(false); // opens no editor
  });
});
