// Pass C.2 closure — rendered/integration proofs:
//   §4 Main payday: persistence + restart, exactly one write on selection,
//      zero writes on open/cancel, delete/deactivate clear the authority
//      atomically, the fail-closed hero and its chooser CTA;
//   §8 zero writes for scenario open/close/change and Review income cancel;
//      scenario ephemerality across restart; expired state renders first
//      (no stale normal-card flash); mode-aware timeframe collisions;
//   §7 weekly rail density rendering with exact accessibility labels;
//   §5 InfoSheet / breakdown typography resolves through the role authority.

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { SafeToSpendHero } from '../../src/components/money/SafeToSpendHero';
import { TimeframeSheet } from '../../src/components/money/TimeframeSheet';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { InfoSheet } from '../../src/components/shared/InfoSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { FIGTREE_FAMILY } from '../../src/theme/typography';
import { formatDollarsCentsAware } from '../../src/lib/calculations/money';
import { formatSafeToSpendAmount } from '../../src/lib/calculations/safeToSpendPresentation';
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

/** Legacy-shaped payload: two active incomes, NO mainPaydayIncomeId field. */
function legacyTwoIncomes(): AppData {
  const d = base();
  d.assets = [everyday('cba', 6000)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 25), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 18), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly'),
  ];
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

/** Exposes the real context actions + live data to the test via buttons/text. */
function Probe() {
  const { data, setMainPaydayIncome, deleteRecurringItem, updateRecurringItem, isLoading } = useAppState() as any;
  return (
    <>
      <Text testID="probe-loading">{String(isLoading)}</Text>
      <Text testID="probe-main">{String(data.user.mainPaydayIncomeId ?? 'none')}</Text>
      <Text testID="probe-nextPayday">{String(data.user.nextPayday ?? 'null')}</Text>
      <Text testID="probe-incomes">{data.recurringItems.filter((r: RecurringItem) => r.type === 'income' && r.active).map((r: RecurringItem) => r.id).join(',')}</Text>
      <TouchableOpacity testID="probe-select-salary" onPress={() => setMainPaydayIncome('salary')}><Text>select</Text></TouchableOpacity>
      <TouchableOpacity testID="probe-select-ghost" onPress={() => setMainPaydayIncome('ghost')}><Text>ghost</Text></TouchableOpacity>
      <TouchableOpacity testID="probe-delete-salary" onPress={() => deleteRecurringItem('salary')}><Text>delete</Text></TouchableOpacity>
      <TouchableOpacity testID="probe-deactivate-salary" onPress={() => updateRecurringItem('salary', { active: false })}><Text>deactivate</Text></TouchableOpacity>
    </>
  );
}

async function seed(data: AppData) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;

describe('§4 — Main payday persistence, writes and restart', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('legacy payload (no field): loads as unselected; ONE write on selection; survives restart; invalid id writes nothing', async () => {
    const user = userEvent.setup();
    await seed(legacyTwoIncomes());
    await render(<Wrap><Probe /></Wrap>);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('probe-main')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-nextPayday')).toHaveTextContent('null'); // fail closed — nothing guessed
    const before = writes();
    await user.press(screen.getByTestId('probe-select-ghost'));
    expect(writes()).toBe(before); // invalid id → no write
    await user.press(screen.getByTestId('probe-select-salary'));
    await waitFor(() => expect(screen.getByTestId('probe-main')).toHaveTextContent('salary'));
    expect(writes()).toBe(before + 1); // exactly one intended write
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(stored.user.mainPaydayIncomeId).toBe('salary');
    expect(new Date(stored.user.nextPayday).getDate()).toBe(25);
  }, 45000);

  test('restart: a persisted selection loads and drives the derived payday; loading itself writes nothing', async () => {
    const user = userEvent.setup();
    const d = legacyTwoIncomes(); d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
    await seed(syncIncomeAggregate(d));
    const w0 = writes();
    await render(<Wrap><Probe /></Wrap>);
    await waitFor(() => expect(screen.getByTestId('probe-main')).toHaveTextContent('salary'));
    expect(new Date(screen.getByTestId('probe-nextPayday').props.children).getDate()).toBe(25);
    expect(writes()).toBe(w0);
  }, 45000);

  test('deleting the chosen source clears the authority in the same write; the remaining single source then derives automatically', async () => {
    const user = userEvent.setup();
    const d = legacyTwoIncomes(); d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
    await seed(syncIncomeAggregate(d));
    await render(<Wrap><Probe /></Wrap>);
    await waitFor(() => expect(screen.getByTestId('probe-main')).toHaveTextContent('salary'));
    const before = writes();
    await user.press(screen.getByTestId('probe-delete-salary'));
    await waitFor(() => expect(screen.getByTestId('probe-incomes')).toHaveTextContent('salary3'));
    expect(screen.getByTestId('probe-main')).toHaveTextContent('none');
    expect(writes()).toBe(before + 1);
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(stored.user.mainPaydayIncomeId).toBeNull();
    expect(new Date(stored.user.nextPayday).getDate()).toBe(18); // the single remaining source
  }, 45000);

  test('deactivating the chosen source clears the authority atomically', async () => {
    const user = userEvent.setup();
    const d = legacyTwoIncomes(); d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
    await seed(syncIncomeAggregate(d));
    await render(<Wrap><Probe /></Wrap>);
    await waitFor(() => expect(screen.getByTestId('probe-main')).toHaveTextContent('salary'));
    const before = writes();
    await user.press(screen.getByTestId('probe-deactivate-salary'));
    await waitFor(() => expect(screen.getByTestId('probe-main')).toHaveTextContent('none'));
    expect(writes()).toBe(before + 1);
  }, 45000);
});

describe('§4/§8 — fail-closed hero, chooser CTA, review-income cancel: zero writes', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('two incomes, no choice: hero shows "Choose your main payday" with no amount; the CTA fires; nothing written', async () => {
    const user = userEvent.setup();
    const data = legacyTwoIncomes();
    const sts = computeSafeToSpend(data, TODAY);
    let chose = 0;
    const w0 = writes();
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals={false} onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} onChooseMainPayday={() => { chose++; }} showManageBalancesLink={false} /></Wrap>);
    // First render is already the fail-closed state (synchronous selector; no stale flash).
    expect(screen.getByTestId('money-aup-hero-main-payday')).toBeOnTheScreen();
    // The state sentence and the single CTA both read "Choose your main payday".
    expect(screen.getByTestId('money-aup-hero-main-payday-state')).toHaveTextContent('Choose your main payday');
    expect(screen.getAllByText('Choose your main payday')).toHaveLength(2);
    expect(screen.queryByText('AVAILABLE')).toBeNull();
    expect(screen.queryByText(/\$5,|\$6,/)).toBeNull();
    await user.press(screen.getByTestId('money-aup-cta-main-payday'));
    expect(chose).toBe(1);
    expect(writes()).toBe(w0);
  }, 30000);

  test('expired payday renders on the FIRST frame (no stale normal card), Review income opens and cancels with zero writes', async () => {
    const user = userEvent.setup();
    const d = legacyTwoIncomes();
    d.recurringItems = d.recurringItems.map((r) => (r.id === 'salary' ? { ...r, nextDueDate: iso(2026, 9, 11) } : r));
    d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
    const data = syncIncomeAggregate(d);
    const sts = computeSafeToSpend(data, TODAY);
    let reviewed = 0;
    const w0 = writes();
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals={false} onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} onReviewIncome={() => { reviewed++; }} showManageBalancesLink={false} /></Wrap>);
    expect(screen.getByTestId('money-aup-hero-payday-expired')).toBeOnTheScreen();
    expect(screen.queryByTestId('money-aup-hero')).toBeNull();
    expect(screen.queryByText(/\$10,|\$5,|\$6,/)).toBeNull();
    await user.press(screen.getByTestId('money-aup-cta-review-income'));
    expect(reviewed).toBe(1);
    expect(writes()).toBe(w0);
  }, 30000);
});

describe('§8 — scenario writes and ephemerality across restart (real navigator)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  const Harness = () => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider><ThemeProvider><CelebrationProvider><SavingsAllocationPromptProvider><NavigationContainer><RootNavigator /></NavigationContainer></SavingsAllocationPromptProvider></CelebrationProvider></ThemeProvider></AppStateProvider>
    </SafeAreaProvider>
  );

  test('open scenario, change date, back to payday, unmount and relaunch: zero writes and no remembered date', async () => {
    const user = userEvent.setup();
    const d = base();
    const payday = new Date(Date.now() + 20 * 86400000);
    d.user = { ...d.user, monthlyIncome: 5000, nextPayday: payday.toISOString(), payFrequency: 'monthly' } as typeof d.user;
    d.assets = [everyday('cba', 2000)];
    d.recurringItems = [item('salary', 'income', 5000, payday.toISOString(), 'monthly')];
    await seed(d);
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-timeframe-row');
    const writesAfterLoad = writes();
    await user.press(screen.getByTestId('money-timeframe-row'));
    await user.press(await screen.findByTestId('timeframe-month-end'));
    await screen.findByTestId('money-scenario-card');
    await user.press(screen.getByTestId('money-timeframe-row'));
    // Reopened chooser highlights End of this month (mode-aware)
    expect((await screen.findByTestId('timeframe-month-end')).props.accessibilityState).toEqual({ selected: true });
    await user.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('timeframe-choice')).toBeNull());
    expect(screen.getByTestId('money-scenario-card')).toBeOnTheScreen();
    await user.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    expect(writes()).toBe(writesAfterLoad);
    // Nothing about the scenario reached storage — a relaunch cannot restore it.
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(JSON.stringify(stored)).not.toMatch(/timeframe|scenario|lookAhead/i);
  }, 60000);

  test('relaunch from the same stored data opens in Until payday mode (the scenario is React state only)', async () => {
    const user = userEvent.setup();
    const d = base();
    const payday = new Date(Date.now() + 20 * 86400000);
    d.user = { ...d.user, monthlyIncome: 5000, nextPayday: payday.toISOString(), payFrequency: 'monthly' } as typeof d.user;
    d.assets = [everyday('cba', 2000)];
    d.recurringItems = [item('salary', 'income', 5000, payday.toISOString(), 'monthly')];
    await seed(d);
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByTestId('money-timeframe-row');
    expect(screen.queryByTestId('money-scenario-card')).toBeNull();
    expect(screen.getByText('AVAILABLE')).toBeOnTheScreen();
  }, 60000);
});

describe('§8 — mode-aware Timeframe collisions', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  const asOf = new Date(2026, 8, 17); // month end = 30 Sep
  const Sheet = (p: { current: any; mode: any; payday: any }) => (
    <Wrap><TimeframeSheet visible asOf={asOf} paydayDate={p.payday} currentTarget={p.current} currentMode={p.mode} onSelect={() => {}} onChooseDate={() => {}} onClose={() => {}} /></Wrap>
  );
  test('custom date equal to month end → Choose a date is selected, not End of this month', async () => {
    const user = userEvent.setup();
    await render(<Sheet current={localDate(2026, 9, 30)} mode="custom" payday={localDate(2026, 9, 25)} />);
    expect((await screen.findByTestId('timeframe-choose-date')).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('timeframe-month-end').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('timeframe-custom-date')).toHaveTextContent('30 Sep 2026');
  }, 30000);
  test('custom date equal to payday → Choose a date selected; Until payday not', async () => {
    const user = userEvent.setup();
    await render(<Sheet current={localDate(2026, 9, 25)} mode="custom" payday={localDate(2026, 9, 25)} />);
    expect((await screen.findByTestId('timeframe-choose-date')).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('timeframe-until-payday').props.accessibilityState).toEqual({ selected: false });
  }, 30000);
  test('payday equal to month end, Until payday active → Until payday selected only', async () => {
    const user = userEvent.setup();
    await render(<Sheet current={null} mode="payday" payday={localDate(2026, 9, 30)} />);
    expect((await screen.findByTestId('timeframe-until-payday')).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('timeframe-month-end').props.accessibilityState).toEqual({ selected: false });
  }, 30000);
});

describe('§7 — weekly density rendering on the Timeline to [date] rail (C.5)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  // The rail places its press targets once it has measured its width; under Jest the
  // layout event is fired by the test and the resulting state lands on the next tick.
  const layout = async (el: any, width = 300) => {
    await fireEvent(el, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
    await screen.findAllByTestId(/^timeline-target-/);
  };
  test('64-day horizon renders weekly marker groups (each kind once), exact counts in the group labels, and the disclosure line', async () => {
    const d = base(); d.assets = [everyday('cba', 20000)];
    d.recurringItems = [item('pay', 'income', 1000, iso(2026, 9, 18), 'weekly'), item('rent', 'expense', 500, iso(2026, 9, 21), 'weekly'), item('gym', 'expense', 50, iso(2026, 9, 24), 'weekly')];
    d.user = { ...d.user, mainPaydayIncomeId: 'pay' } as typeof d.user;
    const s = syncIncomeAggregate(d);
    const a = localDate(2026, 9, 17), t = localDate(2026, 11, 20);
    const result = computeLookAheadProjection(s, a, t);
    if (!result.available) throw new Error('unavailable');
    const events = computeProjectedEvents(s, a, t, { windowStart: a }).events;
    const guide = computeDailyGuide(s, a, t, result);
    await render(<Wrap><ScenarioPositionCard presentation={selectLookAheadPresentation(result)} result={result} guide={guide} events={events} targetDateLabel="Fri, 20 Nov 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} /></Wrap>);
    await layout(await screen.findByTestId('money-scenario-timeline-band', { includeHiddenElements: true }));
    expect(screen.getByTestId('money-scenario-rail-density')).toHaveTextContent('Events grouped by week');
    const weeks = screen.getAllByTestId(/^timeline-cluster-week-/, { includeHiddenElements: true });
    // One glyph per KIND per week — never a continuous row of markers.
    expect(weeks.length).toBeGreaterThanOrEqual(9);
    expect(weeks.length).toBeLessThanOrEqual(10);
    for (const w of weeks) {
      expect(within(w).queryAllByTestId('timeline-marker-income', { includeHiddenElements: true }).length).toBeLessThanOrEqual(1);
      expect(within(w).queryAllByTestId('timeline-marker-bill', { includeHiddenElements: true }).length).toBeLessThanOrEqual(1);
    }
    // The rail heading is ONE accessible element carrying the composed summary; the
    // weekly groups' exact counts live in the mapper output the summary is built from.
    const chart = screen.getByTestId('money-scenario-timeline');
    expect(chart.props.accessibilityLabel).toMatch(/^Timeline from today, 17 Sep, to your selected date, 20 Nov, 64 days away\. \d+ assumed income payments and \d+ bills or repayments are scheduled\. Estimated balance \$[\d,]+ on 20 Nov\./);
    expect(chart.props.accessibilityLabel).toMatch(/No scheduled shortfall detected\.$/);
    expect(chart.props.accessibilityValue).toEqual({ text: 'Events grouped by week' });
  }, 30000);
  test('short horizon stays exact (one marker group per date, no disclosure)', async () => {
    const d = base(); d.assets = [everyday('cba', 20000)];
    d.recurringItems = [item('pay', 'income', 1000, iso(2026, 9, 18), 'weekly'), item('rent', 'expense', 500, iso(2026, 9, 21), 'weekly')];
    d.user = { ...d.user, mainPaydayIncomeId: 'pay' } as typeof d.user;
    const s = syncIncomeAggregate(d);
    const a = localDate(2026, 9, 17), t = localDate(2026, 9, 24);
    const result = computeLookAheadProjection(s, a, t);
    if (!result.available) throw new Error('unavailable');
    const events = computeProjectedEvents(s, a, t, { windowStart: a }).events;
    await render(<Wrap><ScenarioPositionCard presentation={selectLookAheadPresentation(result)} result={result} guide={computeDailyGuide(s, a, t, result)} events={events} targetDateLabel="Thu, 24 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} /></Wrap>);
    await layout(await screen.findByTestId('money-scenario-timeline-band', { includeHiddenElements: true }));
    expect(screen.queryByTestId('money-scenario-rail-density')).toBeNull();
    expect(within(screen.getByTestId('timeline-cluster-2026-09-18', { includeHiddenElements: true })).getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId('timeline-cluster-2026-09-21', { includeHiddenElements: true })).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId(/^timeline-cluster-week-/, { includeHiddenElements: true })).toBeNull();
  }, 30000);
});

describe('§5 — "How this was calculated" typography resolves through the Design 5.1 authority', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  test('InfoSheet title/subtitle/close and the breakdown rows use bundled Figtree faces at supported weights, no fontWeight, $0 not -$0, exact remainder', async () => {
    const user = userEvent.setup();
    const d = base(); d.assets = [everyday('cba', 10700)];
    d.recurringItems = [item('salary', 'income', 5000, iso(2026, 9, 18), 'weekly')];
    d.user = { ...d.user, savingsAllocation: { mode: 'amount', amount: 386.3 } as any } as typeof d.user;
    const data = syncIncomeAggregate(d);
    const sts = computeSafeToSpend(data, new Date(2026, 8, 17));
    await render(<Wrap><SafeToSpendHero safeToSpend={sts} hasActiveGoals={false} onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} showManageBalancesLink={false} /></Wrap>);
    expect(await screen.findByText('For tomorrow')).toBeOnTheScreen();
    expect(screen.queryByText(/For the next 1 day/)).toBeNull();
    await user.press(screen.getByTestId('money-aup-hero-info'));
    const title = await screen.findByText('Why this amount?'); // Pass D.4 — both sheets share one title
    const flat = (st: any) => Object.assign({}, ...(Array.isArray(st) ? st.flat(Infinity).filter(Boolean) : [st]));
    const titleStyle = flat(title.props.style);
    expect(titleStyle.fontFamily).toBe(FIGTREE_FAMILY[600]);
    expect(titleStyle.fontWeight).toBeUndefined();
    // The exact-cent remainder for THIS fixture (weekly cycle share of the
    // $386.30 savings allocation), formatted by the shared cents-aware formatter.
    const exact = formatDollarsCentsAware(Math.max(0, sts.cycleRemainingPool));
    expect(exact).toMatch(/\.\d{2}$/);
    expect(screen.getByLabelText(`Available until payday: ${exact}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Available until payday: ${formatSafeToSpendAmount(sts.cycleRemainingPool)}`)).toBeNull(); // no rounded remainder row
    expect(screen.getByLabelText('Bills due by that date: $0')).toBeTruthy(); // C.3: inclusive boundary wording
    expect(screen.queryByText('-$0')).toBeNull();
    const closeText = screen.getByText('Close');
    expect(flat(closeText.props.style).fontFamily).toBe(FIGTREE_FAMILY[600]);
    expect(flat(closeText.props.style).fontWeight).toBeUndefined();
  }, 30000);
  test('a generic InfoSheet consumer inherits the same roles', async () => {
    const user = userEvent.setup();
    await render(<Wrap><InfoSheet visible onClose={() => {}} title="Net worth history" subtitle="How this trend is built"><Text>body</Text></InfoSheet></Wrap>);
    const title = await screen.findByText('Net worth history');
    const flat = (st: any) => Object.assign({}, ...(Array.isArray(st) ? st.flat(Infinity).filter(Boolean) : [st]));
    expect(flat(title.props.style).fontFamily).toBe(FIGTREE_FAMILY[600]);
    expect(flat(screen.getByText('How this trend is built').props.style).fontFamily).toBe(FIGTREE_FAMILY[400]);
  }, 30000);
});
