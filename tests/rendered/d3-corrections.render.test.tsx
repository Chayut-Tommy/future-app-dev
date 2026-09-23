// Pass D.3 — rendered proofs for the final corrections, against the REAL navigator,
// provider, storage adapter, engines, sheets and editors. The clock is FROZEN to the
// local date 2026-09-22 (Date only — timers stay real). The fixture is the 22 Sep
// device shape and reproduces its recorded figures (see tests/d3-corrections.test.ts).
//   §1 F1 — the negative forecast keeps its sign on the card, the sheet headline and the breakdown
//   §2 F2 — a negative Available until payday keeps Change date; look ahead and back
//   §3 F3 — the Income Sources sheet: Design 5.1 type, one coherent exit, rapid taps, Back/Cancel
//   §4 F4 — pay-cycle markers open the same bounded detail; excluded income is said in words
//   §5 F5 — the reveal keeps the marker band on screen and happens once per opening
//   §6 zero writes and restart
// NOT proven here: native animation timing, real VoiceOver, device layout.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { MoneyEngineCard } from '../../src/components/wealth/MoneyEngineCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { formatCentsCentsAware } from '../../src/lib/calculations/money';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { AUP_EXPECTED_INCOME_STATUS, AUP_INCLUDED_STATUS, AUP_PAYDAY_STATUS, BALANCE_PATH_MIN_TARGET, DETAIL_VIEWPORT_GAP, resolveDetailMaxHeight } from '../../src/lib/calculations/balancePathInteraction';
import { screenBottomClearance } from '../../src/navigation/floatingNavGeometry';
import { designSpacing } from '../../src/theme/semanticTokens';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 22, 10, 0);
const TODAY = new Date(2026, 8, 22);
const ASOF = localDate(2026, 9, 22);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => (StyleSheet.flatten(st) ?? {}) as Record<string, unknown>;
const setWindow = (fontScale: number, width = 430, height = 932) => Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } } as never);
const VIEWPORT = { windowHeight: 932, topInset: 59, bottomClearance: screenBottomClearance(34) };

/** The 22 Sep device shape; `car` adds the recorded $15,000 "Car test" bill on the 27th. */
function seed(car: number | null = null): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary', savingsAllocation: { mode: 'percent', percent: 0.05 } } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 8650, includeInMoneyCalculations: true } as Asset, { id: 'Sav', type: 'savings', label: 'Savings', currentValue: 7500, includeInMoneyCalculations: false } as Asset];
  d.liabilities = [
    { id: 'zip', type: 'bnpl', label: 'Zip pay', currentBalance: 280 } as Liability,
    { id: 'home', type: 'mortgage', label: 'Richmond', currentBalance: 497000 } as Liability,
    { id: 'loan', type: 'personal_loan', label: 'Personal test', currentBalance: 12000 } as Liability,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true },
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true },
    { id: 'dividends', type: 'income', label: 'Dividends', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true },
    { id: 'interest', type: 'income', label: 'Bank interest', amount: 250, frequency: 'weekly', nextDueDate: iso(2026, 9, 23), isFixed: false, active: true },
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1500, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' },
    { id: 'gym', type: 'expense', label: 'Gym', amount: 250, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-health' },
    // BNPL-linked schedules are isFixed: false by convention (safeToSpend.ts counts BNPL through its own window, never as a bill).
    { id: 'zip-bill', type: 'expense', label: 'Zip pay repayment', amount: 70, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 25), isFixed: false, active: true, linkedLiabilityId: 'zip' },
    { id: 'insurance', type: 'expense', label: 'Insurance', amount: 300, frequency: 'monthly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, categoryId: 'cat-insurance' },
    { id: 'internet', type: 'expense', label: 'Internet', amount: 50, frequency: 'weekly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, categoryId: 'cat-utilities' },
    { id: 'phone', type: 'expense', label: 'Phone', amount: 250, frequency: 'monthly', nextDueDate: iso(2026, 10, 10), isFixed: true, active: true, categoryId: 'cat-utilities' },
    { id: 'mortgage-bill', type: 'expense', label: 'Richmond repayment', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 10, 20), isFixed: true, active: true, linkedLiabilityId: 'home' },
    { id: 'loan-bill', type: 'expense', label: 'Personal test repayment', amount: 1500, frequency: 'monthly', nextDueDate: iso(2026, 10, 15), isFixed: true, active: true, linkedLiabilityId: 'loan' },
    ...(car ? [{ id: 'car', type: 'expense', label: 'Car test', amount: car, frequency: 'monthly', nextDueDate: iso(2026, 9, 27), isFixed: true, active: true, categoryId: 'cat-transport' }] : []),
  ] as RecurringItem[];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: iso(2029, 9, 1), status: 'active', priority: 'medium' } as unknown as Goal];
  return syncIncomeAggregate(d);
}

function App() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 430, height: 932 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
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
let api: ReturnType<typeof useAppState> | null = null;
function EngineHost() {
  const state = useAppState();
  api = state;
  if (state.isLoading) return <Text testID="probe-ready">loading</Text>;
  return (
    <>
      <Text testID="probe-ready">ready</Text>
      <MoneyEngineCard data={state.data} />
    </>
  );
}
function EngineTree() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 430, height: 932 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <EngineHost />
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

let root: Awaited<ReturnType<typeof render>> | null = null;
let announce: jest.SpyInstance; let focus: jest.SpyInstance; let reduce: jest.SpyInstance;
let detailFrames: Record<string, { y: number; height: number }> = {};
const measure = () => (View as any).prototype.measureInWindow as jest.Mock;
const scrollTo = () => (ScrollView as any).prototype.scrollTo as jest.Mock;
const presentedHosts = () => (screen as any).root.queryAll((i: any) => i.props?.visible === true && typeof i.props?.onRequestClose === 'function').length;
/** The presented native sheet hosts (Jest's Modal renders nothing while hidden). */
const presented = () => (screen as any).root.queryAll((i: any) => i.props?.visible === true && typeof i.props?.onRequestClose === 'function') as any[];
const focusedNodes = () => focus.mock.calls.filter((c) => c[1] === 'focus').map((c) => c[0]);

async function seedStorage(data: AppData) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
async function launchMoney(data: AppData | null, reduceMotion = false) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(reduceMotion);
  if (data) await seedStorage(data);
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId(/^money-aup-hero(-commitments|-overspend)?$/);
  await settle();
}
async function launchEngine(data: AppData, reduceMotion = false) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(reduceMotion);
  api = null;
  await seedStorage(data);
  root = await render(<EngineTree />);
  await waitFor(() => expect(screen.getByTestId('probe-ready')).toHaveTextContent('ready'));
  await settle();
}
async function layoutBand(testID: string, width = 340, y = 0) {
  await fireEvent(screen.getByTestId(testID, H), 'layout', { nativeEvent: { layout: { x: 0, y, width, height: BALANCE_PATH_MIN_TARGET } } });
}
async function openMonthEnd() {
  await fireEvent.press(screen.getByTestId('money-timeframe-row'));
  await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
  await screen.findByTestId('money-scenario-card');
  await layoutBand('money-scenario-timeline-band');
  await fireEvent(screen.getByTestId(/^timeline-density-/, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 8 } } });
  await screen.findAllByTestId(/^timeline-target-/);
}
const targetFor = (container: any, text: RegExp) => within(container).getAllByTestId(/^timeline-target-/).find((t) => text.test(String(t.props.accessibilityLabel)))!;

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2, 390, 844); });
beforeEach(() => {
  setWindow(1);
  detailFrames = {};
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
  measure().mockImplementation(function (this: { props: { testID?: string } }, cb: (x: number, y: number, w: number, h: number) => void) {
    const f = this.props.testID ? detailFrames[this.props.testID] : undefined;
    if (f) cb(40, f.y, 300, f.height);
  });
  scrollTo().mockClear();
});
afterEach(async () => {
  await settle(60);
  if (root) { await root.unmount(); root = null; }
  setItem().mockClear();
  measure().mockReset();
  jest.restoreAllMocks();
});

describe('D.3 §1/§2 — F1 sign agreement and F2 Change date during an AUP shortfall', () => {
  test('negative AUP keeps its warning AND Change date; End of month gives a signed card, sheet headline (spoken minus) and breakdown; Back restores the same shortfall; zero writes', async () => {
    const user = userEvent.setup();
    const data = seed(15000);
    await launchMoney(data);
    const settled = await AsyncStorage.getItem(STORAGE_KEY); const w = writes();
    // F2 — the recorded shape: the commitments warning with the date control still present.
    const hero = screen.getByTestId('money-aup-hero-commitments');
    const warning = within(hero).getByTestId('money-aup-hero-commitments-warning');
    expect(warning).toHaveTextContent(/above the balance included in this estimate/);
    expect(within(hero).getByTestId('money-timeframe-row')).toBeTruthy();
    expect(within(hero).queryByTestId('money-aup-hero-figure')).toBeNull(); // no misleading positive amount
    // F1 — 30 Sep: 10,930 − 15,000 = −4,070 on the card…
    const r = computeLookAheadProjection(data, ASOF, localDate(2026, 9, 30)); if (!r.available) throw new Error('fixture');
    expect(r.targetCents).toBe(-407000);
    await openMonthEnd();
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(/^-\$4,070$/);
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent('Possible shortfall of $5,770 on 27 Sep');
    expect(screen.getByTestId('money-scenario-deficit')).toHaveTextContent('Your scheduled commitments may be about $4,070.00 more than your cash by 30 Sep 2026');
    // …and on the sheet: the headline keeps the sign, is spoken as minus, and the breakdown agrees.
    await user.press(screen.getByTestId('money-why-this-amount'));
    const amount = await screen.findByTestId('look-ahead-amount');
    expect(amount).toHaveTextContent(/^-\$4,070\.00$/);
    // Pass D.4 — label and value are ONE accessible group, so the sign is spoken with the measure.
    expect(screen.getByTestId('look-ahead-amount-figure').props.accessibilityLabel).toBe('Estimated balance: minus $4,070.00');
    expect(screen.getByTestId('look-ahead-cashflow')).toHaveTextContent('Possible shortfall of $5,770 on 27 Sep', { exact: false }); // first shortfall ≠ target deficit (the notice also carries it)
    expect(screen.getByTestId('look-ahead-deficit')).toHaveTextContent(/about \$4,070\.00 more than your cash/);
    const breakdown = await screen.findByTestId('look-ahead-breakdown'); // Pass D.4 — visible by default
    expect(within(breakdown).getAllByText('-$4,070.00').length).toBeGreaterThanOrEqual(1);
    expect(within(breakdown).queryByText('$4,070.00')).toBeNull();
    await user.press(screen.getByRole('button', { name: /^(Done|Close)$/ }));
    await waitFor(() => expect(screen.queryByTestId('look-ahead-amount')).toBeNull());
    // F2 — Back to payday restores the authoritative shortfall, once.
    await user.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    expect(screen.getByTestId('money-aup-hero-commitments-warning')).toHaveTextContent(/above the balance included in this estimate/);
    expect(screen.getAllByTestId('money-aup-hero-commitments')).toHaveLength(1);
    expect(screen.getByTestId('money-timeframe-row')).toBeTruthy();
    await settle();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(settled);
  }, 120000);

  test('a positive AUP keeps Change date exactly as before (the normal state is unchanged)', async () => {
    await launchMoney(seed());
    const s = computeSafeToSpend(seed(), TODAY);
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(formatCentsCentsAware(Math.round(s.cycleRemainingPool * 100)));
    expect(screen.getByTestId('money-timeframe-row')).toBeTruthy();
  }, 120000);
});

describe('D.3 §3 — F3 the Income Sources sheet', () => {
  test('Design 5.1 type on every app-owned line; one host per open; Cancel exits ONCE (scrim fades with the sheet, then the Modal hides without a second animation); no write', async () => {
    const user = userEvent.setup();
    await launchEngine(seed());
    const before = await AsyncStorage.getItem(STORAGE_KEY); const w = writes();
    await user.press(screen.getByText('Monthly income'));
    expect(presentedHosts()).toBe(1);
    expect(presented()[0].props.animationType).toBe('slide');
    // Typography: app-owned text resolves to the bundled family, never the platform font.
    const title = screen.getByText('💼 Income sources');
    expect(String(flat(title.props.style).fontFamily)).toMatch(/^Figtree/);
    expect(String(flat(screen.getByText('Tap a source to edit it, or add another.').props.style).fontFamily)).toMatch(/^Figtree/);
    for (const label of ['Salary boq', 'Change main payday', 'Add income source', 'Cancel']) {
      expect(String(flat(screen.getByText(label, H).props.style).fontFamily)).toMatch(/^Figtree/);
    }
    expect(String(flat(screen.getByText('Salary boq').props.style).fontFamily)).toBe('Figtree_600SemiBold'); // an overridden weight declares its family
    // One exit: Cancel → the JS slide-out runs, then the host hides the Modal (the instant
    // native hide is pinned structurally in tests/d3-corrections.test.ts — Jest renders no
    // hidden Modal to read). Nothing re-presents, nothing is written.
    await user.press(screen.getByTestId('options-sheet-cancel'));
    await waitFor(() => expect(presentedHosts()).toBe(0));
    await settle(400);
    expect(presentedHosts()).toBe(0);
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
    // Re-open: the fresh open restores the slide entrance.
    await user.press(screen.getByText('Monthly income'));
    expect(presentedHosts()).toBe(1);
    expect(presented()[0].props.animationType).toBe('slide');
  }, 120000);

  test('rapid repeated taps present ONE sheet; Change main payday → Back returns to Income sources; backdrop dismissal writes nothing; Reduce Motion exits instantly', async () => {
    const user = userEvent.setup();
    await launchEngine(seed());
    const w = writes();
    // Two presses in the SAME tick (before any re-render).
    let node: any = screen.getByText('Monthly income');
    while (node && typeof node.props?.onClick !== 'function') node = node.parent;
    await act(async () => { node.props.onClick({}); node.props.onClick({}); });
    await settle();
    expect(presentedHosts()).toBe(1);
    await user.press(screen.getByTestId('options-sheet-row-main-payday'));
    expect(presentedHosts()).toBe(1);
    expect(screen.getByText('Choose your main payday')).toBeTruthy();
    await user.press(screen.getByTestId('options-sheet-cancel')); // "Back"
    expect(presentedHosts()).toBe(1);
    expect(screen.getByText('💼 Income sources')).toBeTruthy();
    // Backdrop tap: one dismissal, nothing written.
    const backdrop = screen.getByTestId('options-sheet-backdrop');
    await fireEvent.press((backdrop.children[0] as any));
    await waitFor(() => expect(presentedHosts()).toBe(0));
    await settle();
    expect(writes()).toBe(w);
    expect(api!.data.user.mainPaydayIncomeId).toBe('salary');
    // Reduce Motion: the same final state, immediately, and the Modal hides without animation.
    await launchEngine(seed(), true);
    await user.press(screen.getByText('Monthly income'));
    expect(presented()[0].props.animationType).toBe('none');
    await user.press(screen.getByTestId('options-sheet-cancel'));
    await waitFor(() => expect(presentedHosts()).toBe(0));
  }, 120000);
});

describe('D.3 §4 — F4 interactive pay-cycle markers', () => {
  test('a bill marker opens ONE bounded detail with name, date, signed amount, type and "Included"; income says "not included"; the payday endpoint explains itself; no balance, no review action; replace, Close → focus; AUP unchanged; zero writes', async () => {
    const user = userEvent.setup();
    const data = seed();
    await launchMoney(data);
    const settled = await AsyncStorage.getItem(STORAGE_KEY); const w = writes();
    const s = computeSafeToSpend(data, TODAY);
    const figure = formatCentsCentsAware(Math.round(s.cycleRemainingPool * 100));
    const hero = screen.getByTestId('money-aup-hero');
    await layoutBand('money-payday-bar-band');
    const targets = within(hero).getAllByTestId(/^timeline-target-/);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    for (const t of targets) { expect(t.props.accessibilityRole).toBe('button'); expect(Number(flat(t.props.style).width)).toBeGreaterThanOrEqual(44); }
    // The summary sentence lives on the bar's header, so the targets are reachable.
    expect(screen.getByTestId('money-payday-bar-summary').props.accessibilityLabel).toMatch(/^Pay cycle from/);
    // Bill: Gym, 24 Sep.
    const gym = targets.find((t) => /Gym, scheduled bill, minus \$250/.test(String(t.props.accessibilityLabel)))!;
    expect(gym).toBeTruthy();
    await user.press(gym);
    const detail = await screen.findByTestId('money-payday-bar-detail');
    expect(within(detail).getByTestId('money-payday-bar-detail-title')).toHaveTextContent(/24 Sep/); // (a slot may also hold the 23 Sep income)
    const gymRow = within(detail).getByTestId(/^timeline-row-oid1:bill:gym:/);
    expect(gymRow.props.accessibilityLabel).toBe(`Gym: minus $250. Scheduled bill. ${AUP_INCLUDED_STATUS}`);
    expect(within(detail).getByText('-$250', H)).toBeTruthy();
    expect(within(detail).getByText(AUP_INCLUDED_STATUS, H)).toBeTruthy();
    expect(within(detail).queryByText(/balance/i, H)).toBeNull();
    expect(within(detail).queryByTestId(/^timeline-review-/)).toBeNull();
    expect(within(detail).getByTestId('money-payday-bar-detail-close')).toBeTruthy();
    expect(within(detail).getByTestId('money-payday-bar-detail-body').props.bounces).toBe(false);
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Showing .*24 Sep/));
    // Income in the SAME slot (Bank interest, 23 Sep): its row is in this detail, marked not included.
    expect(within(detail).getByTestId(/^timeline-row-oid1:income:interest:/).props.accessibilityLabel).toBe(`Bank interest: plus $250. Expected income. ${AUP_EXPECTED_INCOME_STATUS}`);
    expect(within(detail).getByText(AUP_EXPECTED_INCOME_STATUS, H)).toBeTruthy();
    // Another marker (Rent, 28 Sep) REPLACES the open detail — never a second one.
    // (Rent may share its slot with a neighbouring date depending on the rail's day grid — never with Gym.)
    const rent = targets.find((t) => /28 September: Rent, scheduled bill, minus \$1,500/.test(String(t.props.accessibilityLabel)) && !/Gym/.test(String(t.props.accessibilityLabel)))!;
    expect(rent).toBeTruthy();
    await user.press(rent);
    expect(screen.getAllByTestId('money-payday-bar-detail')).toHaveLength(1);
    expect(screen.queryByTestId(/^timeline-row-oid1:bill:gym:/)).toBeNull();
    expect(screen.getByTestId(/^timeline-row-oid1:bill:rent:/)).toBeTruthy();
    // The payday endpoint: a real excluded event (Salary boq on 5 Oct) explains the exclusion.
    const payday = targets.find((t) => /Salary boq/.test(String(t.props.accessibilityLabel)) && /Expected payday — not included/.test(String(t.props.accessibilityLabel)))!;
    expect(payday).toBeTruthy();
    await user.press(payday);
    expect(screen.getByText(AUP_PAYDAY_STATUS, H)).toBeTruthy();
    expect(screen.getByText('+$4,000', H)).toBeTruthy();
    // Close returns focus to the marker that opened the detail.
    focus.mockClear();
    await user.press(screen.getByTestId('money-payday-bar-detail-close'));
    expect(screen.queryByTestId('money-payday-bar-detail')).toBeNull();
    expect(focusedNodes()).toHaveLength(1);
    // Nothing financial moved; nothing was written.
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(figure);
    await settle();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(settled);
    // The selected-date rail is unchanged: its detail still carries the end-of-day balance.
    await openMonthEnd();
    await user.press(screen.getAllByTestId(/^timeline-target-/).find((t) => /Gym/.test(String(t.props.accessibilityLabel)))!);
    expect(within(await screen.findByTestId('money-scenario-timeline-detail')).getAllByText(/^End-of-day balance: \$/).length).toBeGreaterThanOrEqual(1);
  }, 120000);

});

describe('D.3 §5 — F5 the reveal keeps the marker band on screen', () => {
  test('recording shape: a grouped detail below the fold moves the page by its overflow but never above the band; the body bound subtracts the rows between band and detail; ONE move per opening', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 3000, width: 430 }, layoutMeasurement: { height: 873, width: 430 } } });
    // The busiest target (the 25–26 Sep group: Zip pay, Insurance, Internet).
    const targets = screen.getAllByTestId(/^timeline-target-/);
    const busiest = targets.map((t) => ({ t, n: (String(t.props.accessibilityLabel).match(/, (scheduled|assumed|expected)/g) ?? []).length })).sort((a, b) => b.n - a.n)[0].t;
    const P = 'money-scenario-timeline';
    const max = resolveDetailMaxHeight(VIEWPORT);
    detailFrames = { [`${P}-band`]: { y: 640, height: 44 }, [`${P}-detail`]: { y: 750, height: max } };
    scrollTo().mockClear();
    await fireEvent.press(busiest);
    const detail = await screen.findByTestId(`${P}-detail`);
    expect(within(detail).getAllByTestId(/^timeline-row-/).length).toBeGreaterThanOrEqual(3);
    // Body bound: the host bound minus the 66pt of endpoint/Today rows between band and detail minus the chrome.
    await fireEvent(screen.getByTestId(`${P}-band`, H), 'layout', { nativeEvent: { layout: { x: 0, y: 100, width: 340, height: 44 } } });
    await fireEvent(detail, 'layout', { nativeEvent: { layout: { x: 0, y: 210, width: 300, height: max } } });
    const chrome = 44 + designSpacing.md * 2 + 2 + designSpacing.sm; // header + card padding + border + wrap margin (inline mode → no caret)
    expect(Number(flat(screen.getByTestId(`${P}-detail-body`).props.style).maxHeight)).toBe(max - 66 - chrome);
    // The page moved exactly once, by min(overflow, headroom to the BAND), never further.
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    const clearBottom = 932 - VIEWPORT.bottomClearance - DETAIL_VIEWPORT_GAP;
    const overflow = 750 + max - clearBottom;
    const headroom = 640 - DETAIL_VIEWPORT_GAP - 59;
    expect(scrollTo()).toHaveBeenCalledWith({ y: Math.round(Math.min(overflow, headroom)), animated: true });
    expect(640 - Math.min(overflow, headroom)).toBeGreaterThanOrEqual(59 + DETAIL_VIEWPORT_GAP);
    // A later re-layout of the same open detail (the header measuring, the body settling) never moves the page again.
    await fireEvent(detail, 'layout', { nativeEvent: { layout: { x: 0, y: 212, width: 300, height: max - 10 } } });
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    // The page is still the customer's to scroll.
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { y: 900 }, contentSize: { height: 3000, width: 430 }, layoutMeasurement: { height: 873, width: 430 } } });
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    expect(scrollTo()).toHaveBeenCalledTimes(1);
  }, 120000);

  test('maximum Dynamic Type: the same bound and one move, on the pay-cycle rail too', async () => {
    setWindow(3.1, 320, 568);
    await launchMoney(seed());
    await layoutBand('money-payday-bar-band', 216);
    const hero = screen.getByTestId('money-aup-hero');
    const gym = targetFor(hero, /Gym/);
    detailFrames = { 'money-payday-bar-band': { y: 300, height: 44 }, 'money-payday-bar-detail': { y: 410, height: 500 } };
    scrollTo().mockClear();
    await fireEvent.press(gym);
    const detail = await screen.findByTestId('money-payday-bar-detail');
    await fireEvent(detail, 'layout', { nativeEvent: { layout: { x: 0, y: 154, width: 200, height: 500 } } });
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    // The insets are the provider's (59 / 34); only the window shrank.
    const clearBottom = 568 - screenBottomClearance(34) - DETAIL_VIEWPORT_GAP;
    expect(scrollTo()).toHaveBeenCalledWith({ y: Math.round(Math.min(410 + 500 - clearBottom, 300 - DETAIL_VIEWPORT_GAP - 59)), animated: true });
    expect(Number(flat(within(detail).getByTestId('money-payday-bar-detail-body').props.style).maxHeight)).toBeGreaterThanOrEqual(BALANCE_PATH_MIN_TARGET * 2);
  }, 120000);
});

describe('D.3 §6 — restart', () => {
  test('a cold restart discards the scenario and any open detail; nothing scenario-only was ever stored', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    await user.press(screen.getAllByTestId(/^timeline-target-/)[0]);
    await screen.findByTestId('money-scenario-timeline-detail');
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    expect(stored).not.toMatch(/timeframe|scenario|selectedKey|reviewTarget/i);
    await launchMoney(null);
    expect(screen.queryByTestId('money-scenario-card')).toBeNull();
    expect(screen.queryByTestId(/-detail$/)).toBeNull();
    expect(screen.getByTestId('money-aup-hero-figure')).toBeOnTheScreen();
  }, 120000);
});
