// Pass C.5 — rendered proofs for the unified "Timeline to [date]" rail, the
// repayment classification on the customer-facing surfaces, and the one
// Main-payday eligibility authority. Real engines, real components, real
// navigator. The clock is FROZEN to the local date 2026-09-19 (Date only —
// timers stay real so React Native Testing Library keeps working).
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, confirmRecurringOccurrenceTransition, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate, localDateFromDate } from '../../src/lib/calculations/localCalendar';
import { SHARED_COLORS } from '../../src/theme/semanticTokens';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem, Transaction } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 19, 15, 46);
const TODAY = new Date(2026, 8, 19);
const ASOF = localDate(2026, 9, 19);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true, savingsAllocationPromptHandled: true } as any });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none', ...extra } as Transaction);
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
const flat = (st: any) => StyleSheet.flatten(st) as any;
const setWindow = (fontScale: number, width = 390) => Dimensions.set({ window: { width, height: 844, scale: 3, fontScale }, screen: { width, height: 844, scale: 3, fontScale } } as any);

/** The 19 Sep device dataset, before Internet and Richmond are recorded. */
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
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly', 'Gym', { categoryId: 'cat-health' }),
    item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
    item('internet', 'expense', 50, iso(2026, 9, 19), 'weekly', 'Internet', { categoryId: 'cat-utilities' }),
    item('utilities', 'expense', 250, iso(2026, 10, 1), 'monthly', 'Utilities', { categoryId: 'cat-utilities' }),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: new Date(FROZEN.getTime() + 36 * 30 * 86400000).toISOString(), status: 'active' } as unknown as Goal];
  d.transactions = [
    txn('t-sal', 'income', 6000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-oth', 'income', 1000, iso(2026, 9, 14), 'cat-other-income'),
    txn('t-rent', 'expense', 1000, iso(2026, 9, 14), 'cat-rent'),
    txn('t-gym', 'expense', 150, iso(2026, 9, 17), 'cat-health'),
    txn('t-groc', 'expense', 1300, iso(2026, 9, 10), 'cat-groceries'),
  ];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: 0.05 }, mainPaydayIncomeId: 'salary-boq', theme } as typeof d.user;
  return syncIncomeAggregate(d);
}
function record(data: AppData, id: string, transactionId: string): AppData {
  const it = data.recurringItems.find((r) => r.id === id)!;
  const r = confirmRecurringOccurrenceTransition(data, { recurringItemId: id, expectedNextDueDate: it.nextDueDate, paymentSource: 'everyday', targetAssetId: 'Main', transactionId, date: FROZEN.toISOString() });
  if (!r.applied) throw new Error(`record ${id} failed`);
  return r.data;
}
const afterRecording = () => record(record(deviceData(), 'internet', 'tx-internet'), 'richmond', 'tx-richmond');

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
function Card({ data, target, onBack }: { data: AppData; target: [number, number, number]; onBack?: () => void }) {
  const t = localDate(...target);
  const result = computeLookAheadProjection(data, ASOF, t);
  const events = result.available ? computeProjectedEvents(data, ASOF, t, { windowStart: ASOF }).events : null;
  const guide = result.available ? computeDailyGuide(data, ASOF, t, result) : null;
  const cycleStart = localDateFromDate(computeSafeToSpend(data, TODAY).cycleStart);
  return <ScenarioPositionCard presentation={selectLookAheadPresentation(result)} result={result} guide={guide} events={events} cycleStart={cycleStart} targetDateLabel="x" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={onBack ?? (() => {})} onViewUpcomingEvents={() => {}} />;
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
// Jest never fires the iOS-only native Modal onDismiss that OptionsSheet defers its
// selection to; invoke the presented sheet's own onDismiss to stand in for it (the
// same stand-in the A1 classification-lifecycle suites use).
function presentedSheet(): any {
  const all = (screen as any).root.queryAll((i: any) => typeof i.props?.onDismiss === 'function' && i.props?.visible === true);
  return all.length ? all[all.length - 1] : null;
}
const P = 'money-scenario-timeline';
const layoutRail = async (width: number) => {
  await fireEvent(screen.getByTestId(`${P}-band`, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  await fireEvent(screen.getByTestId(/^timeline-density-/, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 8 } } });
  await screen.findAllByTestId(/^timeline-target-/);
};
/** Every flattened style in a subtree (the shared ProgressBar carries no testID). */
function stylesUnder(node: any): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    if (n.props?.style) out.push(flat(n.props.style));
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return out;
}

beforeAll(() => {
  // Date only: timers, microtasks and animation frames stay real.
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });

describe('C.5 §1 — the future-date card draws ONE "Timeline to [date]" rail', () => {
  let announce: jest.SpyInstance; let focus: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear(); setWindow(1);
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  });
  afterEach(() => { announce.mockRestore(); focus.mockRestore(); });

  test('30 Sep: heading, cycle start → Today deep blue, Today → selected date pale blue, truthful labels, no graph, locked figures unchanged', async () => {
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} /></Wrap>);
    expect(await screen.findByTestId('money-scenario-amount')).toHaveTextContent(/^\$14,400$/);
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(/^No scheduled shortfall detected · Lowest scheduled end-of-day balance \$8,650 on 20 Sep$/);
    await layoutRail(286);
    expect(screen.getByTestId(`${P}-title`, H)).toHaveTextContent('Timeline to 30 Sep');
    expect(screen.getAllByTestId(P)).toHaveLength(1);
    // Never the payday name, never a graph.
    expect(screen.queryByText('Pay cycle progress', H)).toBeNull();
    expect(screen.queryByText('Estimated balance path', H)).toBeNull();
    expect(screen.queryByTestId(/^money-scenario-path|^balance-path-/, H)).toBeNull();
    // Segments: the elapsed fill ends at Today = 12/23 of 7 Sep → 30 Sep; the remainder is the pale tint.
    const styles = stylesUnder(screen.getByTestId(`${P}-track`, H));
    const fill = styles.find((s) => s.backgroundColor === SHARED_COLORS.light.interactive && typeof s.width === 'string');
    const track = styles.find((s) => s.backgroundColor === SHARED_COLORS.light.interactiveTint && s.overflow === 'hidden');
    expect(parseFloat(fill.width)).toBeCloseTo((12 / 23) * 100, 6);
    expect(fill.height).toBe(8);
    expect(track.height).toBe(8);
    // Labels.
    expect(screen.getByTestId(`${P}-start`, H)).toHaveTextContent(/(7 Sep|Sep 7)Cycle start$/);
    expect(screen.getByTestId(`${P}-end`, H)).toHaveTextContent(/(30 Sep|Sep 30)Selected date$/);
    expect(within(screen.getByTestId(`${P}-container`)).queryByText(/^Payday/, H)).toBeNull();
    const today = screen.getByTestId(`${P}-today`, H);
    expect(today).toHaveTextContent('Today');
    expect(flat(today.props.style).left + 36).toBeCloseTo((12 / 23) * 286, 6); // centred on the end of the deep segment
    // Markers: glyph height = rail height; nothing drawn in the elapsed segment.
    for (const c of screen.getAllByTestId(/^timeline-cluster-/, H)) expect(flat(c.props.style).height).toBe(8);
    expect(screen.queryByTestId('timeline-cluster-2026-09-14', H)).toBeNull();
    const c20 = screen.getByTestId('timeline-cluster-2026-09-20', H);
    expect(within(c20).getByTestId('timeline-marker-income', H)).toBeTruthy(); // green circle
    expect(within(c20).getByTestId('timeline-marker-bill', H)).toBeTruthy(); // gold diamond
    // One summary.
    expect(screen.getByTestId(P).props.accessibilityLabel).toBe('Timeline from your pay-cycle start on 7 Sep, through today, 19 Sep, to your selected date, 30 Sep, 11 days away. 4 assumed income payments and 7 bills or repayments are scheduled. Estimated balance $14,400 on 30 Sep. Lowest scheduled end-of-day balance $8,650 on 20 Sep. No scheduled shortfall detected.');
  }, 60000);

  test('phone width: ≥ 44×44, non-overlapping, chronological buttons; open, replace, re-tap, backdrop; Close returns focus to the initiating marker; zero writes', async () => {
    const user = userEvent.setup();
    const before = writes();
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} /></Wrap>);
    await screen.findByTestId(P);
    await layoutRail(286);
    const targets = screen.getAllByTestId(/^timeline-target-/);
    expect(targets.map((t) => String(t.props.testID).replace('timeline-target-', ''))).toEqual(['2026-09-19+2026-09-20+2026-09-21', '2026-09-24+2026-09-26', '2026-09-27+2026-09-28+2026-09-30']);
    let right = -1;
    for (const t of targets) {
      const st = flat(t.props.style);
      expect(st.width).toBeGreaterThanOrEqual(44); expect(st.height).toBeGreaterThanOrEqual(44);
      expect(st.left).toBeGreaterThanOrEqual(right - 1e-6); right = st.left + st.width;
      expect(st.left).toBeGreaterThanOrEqual((12 / 23) * 286 - 44); // only the future part of the rail is interactive
      expect(t.props.accessibilityRole).toBe('button');
      expect(t.props.accessibilityState).toEqual({ selected: false });
    }
    // Open.
    await user.press(targets[1]);
    expect(await screen.findByTestId(`${P}-detail-title`)).toHaveTextContent('24 Sep – 26 Sep · 2 scheduled events');
    const detail = screen.getByTestId(`${P}-detail`);
    expect(within(detail).getByText('Gym', H)).toBeOnTheScreen();
    expect(within(detail).getByText('-$150', H)).toBeOnTheScreen();
    expect(within(detail).getByText('Internet', H)).toBeOnTheScreen();
    expect(within(detail).getByText('End-of-day balance: $11,500')).toBeOnTheScreen();
    expect(within(detail).getByText('End-of-day balance: $11,450')).toBeOnTheScreen();
    expect(screen.getByTestId('timeline-target-2026-09-24+2026-09-26').props.accessibilityState).toEqual({ selected: true });
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Showing 24 Sep – 26 Sep · 2 scheduled events\. /));
    // Replace (one selection at a time).
    await user.press(screen.getByTestId('timeline-target-2026-09-27+2026-09-28+2026-09-30'));
    expect(await screen.findByText('27 Sep – 30 Sep · 4 scheduled events')).toBeOnTheScreen();
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    expect(within(screen.getByTestId(`${P}-detail`)).getByText('End-of-day balance: $14,400')).toBeOnTheScreen(); // target-date events included
    expect(screen.queryByTestId('timeline-halo-2026-09-24', H)).toBeNull();
    // Re-tap dismisses; focus is NOT moved for a pointer dismissal.
    await user.press(screen.getByTestId('timeline-target-2026-09-27+2026-09-28+2026-09-30'));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    // Backdrop dismisses.
    await user.press(screen.getByTestId('timeline-target-2026-09-24+2026-09-26'));
    await screen.findByTestId(`${P}-detail`);
    await user.press(screen.getByTestId(`${P}-backdrop`, H));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    // Close dismisses AND returns accessibility focus to the marker that opened the card.
    await user.press(screen.getByTestId('timeline-target-2026-09-24+2026-09-26'));
    await user.press(await screen.findByTestId(`${P}-detail-close`));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][1]).toBe('focus');
    expect(focus.mock.calls[0][0]).toBeTruthy(); // a live host node, not null
    // Nothing moved, nothing written.
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$14,400$/);
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(/^\$1,040$/);
    expect(writes()).toBe(before);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 60000);

  test('30 Oct across several paydays: weekly groups on the same rail; never "Pay cycle progress"; the whole horizon is never coloured as elapsed', async () => {
    const user = userEvent.setup();
    await render(<Wrap><Card data={deviceData()} target={[2026, 10, 30]} /></Wrap>);
    await screen.findByTestId(P);
    await fireEvent(screen.getByTestId(`${P}-band`, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 286, height: 44 } } });
    await screen.findAllByTestId(/^timeline-target-/);
    expect(screen.getByTestId(`${P}-title`, H)).toHaveTextContent('Timeline to 30 Oct');
    expect(screen.queryByText('Pay cycle progress', H)).toBeNull();
    expect(screen.getByTestId('money-scenario-rail-density')).toHaveTextContent('Events grouped by week');
    const fill = stylesUnder(screen.getByTestId(`${P}-track`, H)).find((s) => s.backgroundColor === SHARED_COLORS.light.interactive && typeof s.width === 'string');
    expect(parseFloat(fill.width)).toBeCloseTo((12 / 53) * 100, 6);
    const first = screen.getAllByTestId(/^timeline-target-/)[0];
    await user.press(first);
    expect(await screen.findByTestId(`${P}-detail-inline`)).toBeOnTheScreen();
    expect(within(screen.getByTestId(`${P}-detail`)).getAllByText(/^End-of-week balance: /).length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByTestId(`${P}-detail`)).getAllByText(/^Net effect: /).length).toBeGreaterThanOrEqual(1);
  }, 60000);

  test('selection clears on a date change and on Back to payday (unmount)', async () => {
    const user = userEvent.setup();
    const data = deviceData();
    function Host() {
      const [target, setTarget] = React.useState<[number, number, number] | null>([2026, 9, 30]);
      return target ? (
        <>
          <Card data={data} target={target} onBack={() => setTarget(null)} />
          <TouchableOpacity testID="switch-date" onPress={() => setTarget([2026, 10, 1])}><Text>switch</Text></TouchableOpacity>
        </>
      ) : null;
    }
    await render(<Wrap><Host /></Wrap>);
    await screen.findByTestId(P);
    await layoutRail(600);
    await user.press(screen.getAllByTestId(/^timeline-target-/)[0]);
    await screen.findByTestId(`${P}-detail`);
    expect(screen.getAllByTestId(/^timeline-halo-/, H).length).toBeGreaterThanOrEqual(1);
    await user.press(screen.getByTestId('switch-date'));
    await waitFor(() => expect(screen.getByTestId(`${P}-title`, H)).toHaveTextContent('Timeline to 1 Oct'));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(screen.queryByTestId(/^timeline-halo-/, H)).toBeNull();
    await user.press(screen.getAllByTestId(/^timeline-target-/)[0]);
    await screen.findByTestId(`${P}-detail`);
    await user.press(screen.getByTestId('money-back-to-payday'));
    expect(screen.queryByTestId(P)).toBeNull();
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 60000);

  test('largest Dynamic Type on a small iPhone: full-width detail card, no caret, labels may grow, Today label capped', async () => {
    const user = userEvent.setup();
    setWindow(2, 320);
    await render(<Wrap><Card data={deviceData()} target={[2026, 9, 30]} /></Wrap>);
    await screen.findByTestId(P);
    await layoutRail(222);
    await user.press(screen.getAllByTestId(/^timeline-target-/)[0]);
    expect(await screen.findByTestId(`${P}-detail-inline`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`${P}-detail-caret`, H)).toBeNull();
    expect(flat(screen.getByTestId(`${P}-detail`).props.style).width).toBeUndefined();
    expect(screen.getByTestId(`${P}-today`, H).props.maxFontSizeMultiplier).toBe(1.6);
    const close = flat(screen.getByTestId(`${P}-detail-close`).props.style);
    expect(close.minWidth).toBeGreaterThanOrEqual(44); expect(close.minHeight).toBeGreaterThanOrEqual(44);
  }, 60000);

  test('dark theme: deep and pale segments resolve to the dark semantic roles', async () => {
    setWindow(1);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData('dark')));
    await render(<Wrap><Card data={deviceData('dark')} target={[2026, 9, 30]} /></Wrap>);
    await screen.findByTestId(P);
    await new Promise((r) => setTimeout(r, 60)); // hydration applies the stored dark preference
    await layoutRail(286);
    const styles = stylesUnder(screen.getByTestId(`${P}-track`, H));
    expect(styles.some((s) => s.backgroundColor === SHARED_COLORS.dark.interactive && typeof s.width === 'string')).toBe(true);
    expect(styles.some((s) => s.backgroundColor === SHARED_COLORS.dark.interactiveTint && s.overflow === 'hidden')).toBe(true);
  }, 60000);

  test('structure: one rail primitive, one inspection implementation, no animation, no writes, no new dependency', () => {
    const strip = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const rail = strip('components/money/FutureTimelineRail.tsx');
    expect(/TimelineMarkerTrack/.test(rail)).toBe(true);
    expect(/resolveHitTargets/.test(rail) && /describeHitTarget/.test(rail)).toBe(true);
    expect(/Animated|reanimated|withTiming|LayoutAnimation|ScrollView|PanResponder|Gesture/.test(rail)).toBe(false);
    expect(/useAppState|AsyncStorage|updateUser|navigation/.test(rail)).toBe(false);
    expect(/react-native-svg/.test(rail)).toBe(false);
    const bar = strip('components/money/MoneyPaydayBar.tsx');
    expect(/TimelineMarkerTrack/.test(bar)).toBe(true); // the payday bar uses the SAME primitive
    expect(/remainderColor|showTodayTick|clusters=/.test(bar)).toBe(false); // …and is untouched by the future-mode options
  });
});

describe('C.5 §2 — Money screen: payday mode unchanged; future mode uses AUP\'s cycle start', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setWindow(1); });

  test('Pay cycle progress in payday mode → End of month shows "Timeline to 30 Sep" from 7 Sep with $14,400 → Back to payday restores; nothing is written', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deviceData()));
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-timeframe-row');
    // App start performs its own pre-existing housekeeping write (score history, schedule anchors);
    // measure the timeline flow from the settled state.
    await new Promise((r) => setTimeout(r, 150));
    const settled = await AsyncStorage.getItem(STORAGE_KEY);
    const before = writes();
    // Payday mode: locked AUP, the accepted bar, no future timeline.
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$6,211\.85$/);
    expect(screen.getByText('Pay cycle progress', H)).toBeTruthy();
    expect(screen.queryByTestId(P)).toBeNull();
    expect(screen.queryByText(/^Timeline to/, H)).toBeNull();
    // Future mode.
    fireEvent.press(screen.getByTestId('money-timeframe-row'));
    fireEvent.press(await screen.findByTestId('timeframe-month-end'));
    await screen.findByTestId('money-scenario-card');
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^\$14,400$/);
    expect(screen.getByTestId(`${P}-title`, H)).toHaveTextContent('Timeline to 30 Sep');
    expect(screen.getByTestId(`${P}-start`, H)).toHaveTextContent(/(7 Sep|Sep 7)Cycle start$/);
    expect(screen.getByTestId(`${P}-end`, H)).toHaveTextContent(/(30 Sep|Sep 30)Selected date$/);
    expect(screen.queryByText('Pay cycle progress', H)).toBeNull();
    expect(screen.getAllByTestId(P)).toHaveLength(1);
    expect(screen.queryByTestId(/^money-scenario-path|^balance-path-/, H)).toBeNull();
    expect(screen.getByTestId('money-view-upcoming-events')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    expect(screen.getByText('Pay cycle progress', H)).toBeTruthy();
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$6,211\.85$/);
    await new Promise((r) => setTimeout(r, 150));
    expect(writes()).toBe(before);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(settled);
  }, 90000);
});

describe('C.5 §3 — repayment classification on the customer-facing surfaces', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setWindow(1); });

  test('after recording: This Month $7,000 / $5,500 / $1,500; recent activity and Transactions both say Mortgage and Utilities', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(afterRecording()));
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-this-month-card');
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$6,211\.85$/);
    expect(screen.getByTestId('this-month-income')).toHaveTextContent(/\$7,000/);
    expect(screen.getByTestId('this-month-spending')).toHaveTextContent(/\$5,500/);
    expect(screen.getByTestId('this-month-net')).toHaveTextContent(/\$1,500/);
    expect(screen.getByTestId('this-month-recent-tx-richmond').props.accessibilityLabel).toMatch(/^Mortgage, .*-\$3,000/);
    expect(screen.getByTestId('this-month-recent-tx-internet').props.accessibilityLabel).toMatch(/^Utilities, .*-\$50/);
    fireEvent.press(screen.getByTestId('money-view-transactions-action'));
    expect((await screen.findByLabelText(/Richmond repayment/)).props.accessibilityLabel).toMatch(/^Expense\. Richmond repayment\. 3,000 dollars\. Mortgage, /);
    expect(screen.getByLabelText(/^Expense\. Internet\. 50 dollars\. Utilities, /)).toBeTruthy();
    expect((await stored()).transactions.find((t) => t.id === 'tx-richmond')!.categoryId).toBe('cat-mortgage'); // persisted, not only presented
  }, 90000);

  test('an existing record persisted as Other shows Mortgage only on proof; a manual Other look-alike stays Other; storage is not rewritten', async () => {
    const data = deviceData();
    // Pre-C.5 shape: persisted as Other, carrying its canonical loan occurrence identity.
    const legacy = txn('tx-legacy', 'expense', 3000, iso(2026, 9, 2), 'cat-other-expense', { note: 'Richmond repayment', recurringItemId: 'richmond', occurrenceResolution: { version: 1, state: 'linked', occurrenceId: 'oid1:loan:richmond:2026-08' } as any });
    const manual = txn('tx-manual', 'expense', 3000, iso(2026, 9, 3), 'cat-other-expense', { note: 'Richmond repayment' });
    data.transactions = [...data.transactions, legacy, manual];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    fireEvent.press(await screen.findByTestId('money-view-transactions-action'));
    const rows = await screen.findAllByLabelText(/Richmond repayment/);
    const labels = rows.map((r) => String(r.props.accessibilityLabel)).sort();
    expect(labels).toHaveLength(2);
    expect(labels.filter((l) => /3,000 dollars\. Mortgage, /.test(l))).toHaveLength(1);
    expect(labels.filter((l) => /3,000 dollars\. Other, /.test(l))).toHaveLength(1);
    const after = await stored();
    expect(after.transactions.find((t) => t.id === 'tx-legacy')!.categoryId).toBe('cat-other-expense');
    expect(after.transactions.find((t) => t.id === 'tx-manual')!.categoryId).toBe('cat-other-expense');
  }, 90000);
});

describe('C.5 §4 — one Main-payday eligibility authority', () => {
  beforeEach(async () => { await AsyncStorage.clear(); setWindow(1); });

  function unselected(): AppData {
    const d = deviceData();
    d.recurringItems = [...d.recurringItems, item('gig', 'income', 500, iso(2026, 9, 22), 'irregular', 'Gig work', { nextDueDateUnknown: true } as any)];
    d.user = { ...d.user, mainPaydayIncomeId: undefined } as typeof d.user;
    return syncIncomeAggregate(d);
  }

  test('Money chooser lists exactly the editor-eligible sources and explains the exclusion; dismissing writes nothing; choosing writes ONE identity that survives restart', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unselected()));
    const view = await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    fireEvent.press(await screen.findByTestId('money-aup-cta-main-payday'));
    expect(await screen.findByText(/Gig work can’t be chosen: a main payday needs a regular schedule and a next expected payment date\./)).toBeOnTheScreen();
    // Options are buttons labelled "<name>. <amount> · <frequency>".
    expect(screen.getByLabelText(/^Salary boq\. \$4,000/)).toBeTruthy();
    expect(screen.getByLabelText(/^Rental income\. \$3,000/)).toBeTruthy();
    expect(screen.getByLabelText(/^Dividends\. \$1,000/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Gig work\. /)).toBeNull(); // not offered as an option
    // Cancel writes nothing.
    await new Promise((r) => setTimeout(r, 150));
    const idle = writes();
    let modal = presentedSheet();
    fireEvent.press(screen.getByLabelText('Cancel'));
    await new Promise((r) => setTimeout(r, 400));
    await act(async () => { modal.props.onDismiss?.(); });
    expect(writes()).toBe(idle);
    expect((await stored()).user.mainPaydayIncomeId).toBeUndefined();
    // Choose.
    fireEvent.press(await screen.findByTestId('money-aup-cta-main-payday'));
    const before = writes();
    const option = await screen.findByLabelText(/^Rental income\. \$3,000/);
    modal = presentedSheet();
    fireEvent.press(option);
    await new Promise((r) => setTimeout(r, 400));
    await act(async () => { modal.props.onDismiss?.(); });
    await waitFor(async () => expect((await stored()).user.mainPaydayIncomeId).toBe('rental'));
    expect(writes()).toBe(before + 1);
    const s = await stored();
    expect(s.recurringItems.some((r) => (r as any).isMainPayday !== undefined)).toBe(false); // no per-income Boolean
    // Restart.
    await view.unmount();
    await render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-timeframe-row');
    expect(screen.queryByTestId('money-aup-cta-main-payday')).toBeNull();
    expect((await stored()).user.mainPaydayIncomeId).toBe('rental');
  }, 90000);

  test('the setter refuses an ineligible or unknown id through the SAME predicate (zero writes)', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unselected()));
    let api: ReturnType<typeof useAppState> | null = null;
    const Probe = () => { api = useAppState(); return <Text testID="probe">{api.isLoading ? 'loading' : 'ready'}</Text>; };
    await render(<Wrap><Probe /></Wrap>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready'));
    const before = writes();
    await api!.setMainPaydayIncome('gig');
    await api!.setMainPaydayIncome('rent'); // an expense
    await api!.setMainPaydayIncome('nope');
    await new Promise((r) => setTimeout(r, 30));
    expect(writes()).toBe(before);
    expect((await stored()).user.mainPaydayIncomeId).toBeUndefined();
  }, 60000);

  test('both choosers consume the shared list and subtitle (structural)', () => {
    for (const f of ['screens/money/MoneyScreen.tsx', 'components/wealth/MoneyEngineCard.tsx']) {
      const src = readFileSync(join(__dirname, '../../src', f), 'utf8');
      expect(/listMainPaydayChoices\(/.test(src)).toBe(true);
      expect(/mainPaydayChooserSubtitle\(/.test(src)).toBe(true);
    }
    const ctx = readFileSync(join(__dirname, '../../src/state/AppStateContext.tsx'), 'utf8');
    expect(/r\.id === id && isEligibleMainPaydaySource\(r\)/.test(ctx)).toBe(true);
  });
});
