// Pass D — rendered proofs for Look Ahead source review. REAL navigator, provider,
// storage adapter, engines and the four EXISTING editors. The clock is FROZEN to the
// local date 2026-09-21 (Date only — timers stay real).
//   §1 Save: the existing editor, durable success first, ONE refresh, ONE announcement
//   §2 Cancel / rejected write / retry
//   §3 Delete, income, and routing for card / loan / BNPL
//   §4 rapid taps, the unavailable-estimate correction, restart discards the scenario
//   §5 320pt + maximum Dynamic Type
// NOT proven here: native sheet animation, real VoiceOver speech/focus, device layout.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { EDITOR_SAVE_FAILED_COPY } from '../../src/lib/editorCompletion';
import { ESTIMATE_UPDATED_COPY } from '../../src/lib/calculations/sourceReview';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 21, 10, 15);
const H = { includeHiddenElements: true };
const P = 'money-scenario-timeline';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => StyleSheet.flatten(st) as Record<string, unknown>;
const setWindow = (fontScale: number, width = 390) => Dimensions.set({ window: { width, height: 844, scale: 3, fontScale }, screen: { width, height: 844, scale: 3, fontScale } } as never);

/** Opening $1,200.00 + assumed income $2,500.00 − bill $500.00 = $3,200.00 by 30 Sep. */
function seed(rich = false): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 1200, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2500, frequency: 'monthly', nextDueDate: iso(2026, 9, 25), isFixed: false, active: true } as RecurringItem,
    { id: 'power', type: 'expense', label: 'Power', amount: 500, frequency: 'monthly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-utilities' } as RecurringItem,
  ];
  if (rich) {
    d.liabilities = [
      { id: 'home-loan', type: 'mortgage', label: 'Home loan', currentBalance: 400000 } as Liability,
      { id: 'zip', type: 'bnpl', label: 'Zip', currentBalance: 300 } as Liability,
    ];
    d.recurringItems.push(
      { id: 'mortgage-bill', type: 'expense', label: 'Mortgage repayment', amount: 800, frequency: 'monthly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, linkedLiabilityId: 'home-loan' } as RecurringItem,
      { id: 'zip-bill', type: 'expense', label: 'Zip instalment', amount: 75, frequency: 'monthly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, linkedLiabilityId: 'zip' } as RecurringItem,
    );
    d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 29, expectedMonthlyRepayment: 120 } as unknown as CreditCard];
  }
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

let root: Awaited<ReturnType<typeof render>> | null = null;
let announce: jest.SpyInstance; let focus: jest.SpyInstance;
const openGates: (() => void)[] = [];
const rejectNextWrite = () => setItem().mockImplementationOnce(() => Promise.reject(new Error('disk full')));
function gateNextWrite() {
  const real = setItem().getMockImplementation()!;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  openGates.push(() => release());
  setItem().mockImplementationOnce(async (k: string, v: string) => { await gate; return real(k, v); });
  return () => release();
}
const said = (text: string | RegExp) => announce.mock.calls.filter((c) => (typeof text === 'string' ? c[0] === text : text.test(String(c[0])))).length;
const focusedNodes = () => focus.mock.calls.filter((c) => c[1] === 'focus').map((c) => c[0]);
/** Native sheet hosts currently presented. */
const presentedHosts = () => (screen as any).root.queryAll((i: any) => i.props?.visible === true && typeof i.props?.onRequestClose === 'function').length;

async function launchMoney(data: AppData | null) {
  if (root) { await root.unmount(); root = null; }
  if (data) { await AsyncStorage.clear(); await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-timeframe-row');
  await settle(); // app start performs its own pre-existing housekeeping write
}
async function openMonthEnd(width = 340) {
  await fireEvent.press(screen.getByTestId('money-timeframe-row'));
  await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
  await screen.findByTestId('money-scenario-card');
  await fireEvent(screen.getByTestId(`${P}-band`, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  await fireEvent(screen.getByTestId(/^timeline-density-/, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 8 } } });
  await screen.findAllByTestId(/^timeline-target-/);
}
/** Select markers until the review action for `sourceId` is showing; returns it. */
async function revealReview(sourceId: string) {
  const match = new RegExp(`^timeline-review-oid1:[a-z]+:${sourceId}:`);
  if (screen.queryByTestId(match)) return screen.getByTestId(match);
  for (const target of screen.getAllByTestId(/^timeline-target-/)) {
    await fireEvent.press(target);
    await settle(20);
    if (screen.queryByTestId(match)) return screen.getByTestId(match);
  }
  throw new Error(`no review action for ${sourceId}`);
}
const amount = () => screen.getByTestId('money-scenario-amount');

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });
beforeEach(() => {
  setWindow(1);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});
afterEach(async () => {
  openGates.splice(0).forEach((r) => r());
  await settle(60);
  if (root) { await root.unmount(); root = null; }
  setItem().mockClear();
  announce.mockRestore(); focus.mockRestore();
});

describe('D §1 — Save through the existing Bill editor', () => {
  test('$3,200 → review Power → $700 → durable success FIRST, then one refresh to $3,000, one "Estimate updated", focus back on the source; nothing about the scenario is stored', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    expect(amount()).toHaveTextContent(/^\$3,200$/);
    const review = await revealReview('power');
    expect(review.props.accessibilityRole).toBe('button');
    expect(review.props.accessibilityLabel).toMatch(/^Review bill: Power, /);
    expect(review.props.accessibilityHint).toMatch(/every future occurrence/);
    expect(Number(flat(review.props.style).minHeight)).toBeGreaterThanOrEqual(44);
    expect(Number(flat(review.props.style).minWidth)).toBeGreaterThanOrEqual(44);
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
    const hostsBefore = presentedHosts();
    announce.mockClear(); focus.mockClear();
    const w = writes();

    await user.press(review);
    await screen.findByTestId('bill-editor-save');
    expect(presentedHosts()).toBe(hostsBefore + 1); // ONE sheet host: the existing Bill editor
    expect(screen.getByDisplayValue('Power')).toBeTruthy(); // the source itself, never an Add form
    expect(writes()).toBe(w); // opening writes nothing
    await fireEvent.changeText(screen.getByDisplayValue(/^\$?500(\.00)?$/), '700');

    const release = gateNextWrite();
    await user.press(screen.getByTestId('bill-editor-save'));
    expect(await screen.findByTestId('bill-editor-status-pending')).toHaveTextContent('Saving…');
    // Not durable yet: the estimate has NOT moved and nothing is announced as updated.
    expect(amount()).toHaveTextContent(/^\$3,200$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(0);
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());

    expect(amount()).toHaveTextContent(/^\$3,000$/);
    expect(screen.getByTestId('money-scenario-review-notice')).toHaveTextContent(ESTIMATE_UPDATED_COPY);
    await settle();
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
    expect(said(/\$3,000/)).toBe(0); // the position is not announced a second time over it
    expect(writes()).toBe(w + 1); // the editor's ONE durable write; the review wrote nothing
    // Same transient target, same marker detail, focus back on the surviving source action.
    expect(screen.getByTestId(`${P}-title`, H)).toHaveTextContent('Timeline to 30 Sep');
    const after = await revealReview('power');
    expect(focusedNodes().length).toBeGreaterThanOrEqual(1);
    expect(after.props.accessibilityLabel).toMatch(/^Review bill: Power, /);
    const disk = await stored();
    expect(disk.recurringItems.find((r) => r.id === 'power')!.amount).toBe(700);
    expect(JSON.stringify(disk)).not.toMatch(/timeframe|scenario|lookAhead|reviewTarget/i);
  }, 120000);

  test('a second review of the same source announces once more — and only once', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    for (const [from, to] of [[/^\$?500(\.00)?$/, '700'], [/^\$?700(\.00)?$/, '500']] as const) {
      announce.mockClear();
      await user.press(await revealReview('power'));
      await screen.findByTestId('bill-editor-save');
      await fireEvent.changeText(screen.getByDisplayValue(from), to);
      await user.press(screen.getByTestId('bill-editor-save'));
      await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
      await settle();
      expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
    }
    expect(amount()).toHaveTextContent(/^\$3,200$/);
  }, 120000);
});

describe('D §2 — Cancel, rejection and retry', () => {
  test('Cancel: zero writes, no announcement, no notice, the estimate and storage are byte-identical', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    const w = writes();
    await user.press(await revealReview('power'));
    await screen.findByTestId('bill-editor-save');
    await fireEvent.changeText(screen.getByDisplayValue(/^\$?500(\.00)?$/), '900');
    announce.mockClear(); focus.mockClear();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    // The editor may ask before discarding a changed draft; that is its own accepted behaviour.
    const discard = screen.queryByRole('button', { name: /Discard/i });
    if (discard) await user.press(discard);
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    await settle();
    expect(amount()).toHaveTextContent(/^\$3,200$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(0);
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(focusedNodes().length).toBeGreaterThanOrEqual(1); // focus returns to the source action
    // The review is not left locked: it opens again.
    await user.press(await revealReview('power'));
    expect(await screen.findByTestId('bill-editor-save')).toBeTruthy();
  }, 120000);

  test('a rejected write keeps the editor and the estimate; the retry applies ONCE', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    await user.press(await revealReview('power'));
    await screen.findByTestId('bill-editor-save');
    await fireEvent.changeText(screen.getByDisplayValue(/^\$?500(\.00)?$/), '700');
    announce.mockClear();
    rejectNextWrite();
    await user.press(screen.getByTestId('bill-editor-save'));
    expect(await screen.findByTestId('bill-editor-status-error')).toHaveTextContent(EDITOR_SAVE_FAILED_COPY, { exact: false });
    expect(screen.getByDisplayValue(/^\$?700(\.00)?$/)).toBeTruthy(); // the draft is still here
    expect(amount()).toHaveTextContent(/^\$3,200$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(0);
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
    const w = writes();
    await user.press(screen.getByTestId('bill-editor-save'));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    await settle();
    expect(writes()).toBe(w + 1);
    expect(amount()).toHaveTextContent(/^\$3,000$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
    expect((await stored()).recurringItems.filter((r) => r.id === 'power')).toHaveLength(1);
  }, 120000);
});

describe('D §3 — Delete, income and routing by stable identity', () => {
  test('Delete: $3,200 → $3,700, one announcement, the source row is gone and focus goes to the timeline heading', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    await user.press(await revealReview('power'));
    await screen.findByTestId('bill-editor-delete');
    announce.mockClear(); focus.mockClear();
    const w = writes();
    await user.press(screen.getByTestId('bill-editor-delete'));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-delete')).toBeNull());
    await settle();
    expect(amount()).toHaveTextContent(/^\$3,700$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
    expect(writes()).toBe(w + 1);
    expect(screen.queryByTestId(/^timeline-review-oid1:[a-z]+:power:/)).toBeNull();
    expect(focusedNodes().length).toBeGreaterThanOrEqual(1);
    expect((await stored()).recurringItems.some((r) => r.id === 'power')).toBe(false);
  }, 120000);

  test('income $2,500 → $2,600 through the Income editor adds exactly $100', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    const review = await revealReview('salary');
    expect(review.props.accessibilityLabel).toMatch(/^Review income: Salary, /);
    await user.press(review);
    await screen.findByTestId('income-editor-save');
    expect(screen.queryByTestId('bill-editor-save')).toBeNull();
    await fireEvent.changeText(screen.getByDisplayValue(/^\$?2,?500(\.00)?$/), '2600');
    announce.mockClear();
    await user.press(screen.getByTestId('income-editor-save'));
    await waitFor(() => expect(screen.queryByTestId('income-editor-save')).toBeNull());
    await settle();
    expect(amount()).toHaveTextContent(/^\$3,300$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
  }, 120000);

  test.each([
    ['card', 'amex', 'card-editor-save', /^Review card: AMEX, /],
    ['loan schedule', 'mortgage-bill', 'bill-editor-save', /^Review repayment: Mortgage repayment, /],
    ['BNPL', 'zip-bill', 'wealth-editor-save', /^Review repayment: Zip, /],
  ])('%s opens ITS existing editor exactly once; Cancel writes nothing', async (_n, sourceId, saveId, label) => {
    const user = userEvent.setup();
    await launchMoney(seed(true));
    await openMonthEnd();
    const review = await revealReview(sourceId);
    expect(review.props.accessibilityLabel).toMatch(label);
    const hosts = presentedHosts(); const w = writes();
    await user.press(review);
    await screen.findByTestId(saveId);
    expect(presentedHosts()).toBe(hosts + 1);
    expect(['card-editor-save', 'bill-editor-save', 'wealth-editor-save', 'income-editor-save'].filter((id) => screen.queryByTestId(id))).toEqual([saveId]);
    await user.press(screen.getAllByRole('button', { name: /^(Cancel|Close)$/ })[0]);
    await waitFor(() => expect(screen.queryByTestId(saveId)).toBeNull());
    await settle();
    expect(writes()).toBe(w);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(0);
  }, 120000);
});

describe('D §4 — rapid taps, correction from an unavailable estimate, restart', () => {
  test('two fast presses open ONE editor', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    const review = await revealReview('power');
    const hosts = presentedHosts();
    // Two presses in the SAME tick (before any re-render), then a third after the editor is up.
    await act(async () => { review.props.onClick({}); review.props.onClick({}); });
    await screen.findByTestId('bill-editor-save');
    await fireEvent.press(review);
    await settle();
    expect(presentedHosts()).toBe(hosts + 1);
    expect(screen.getAllByTestId('bill-editor-save')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
  }, 120000);

  test('an estimate the engine cannot produce offers ONLY the source the engine named; correcting it restores exactly $3,200', async () => {
    const user = userEvent.setup();
    const broken = seed();
    broken.recurringItems = broken.recurringItems.map((r) => (r.id === 'power' ? { ...r, amount: 0 } : r));
    await launchMoney(broken);
    await fireEvent.press(screen.getByTestId('money-timeframe-row'));
    await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
    await screen.findByTestId('money-scenario-unavailable');
    expect(screen.queryByTestId('money-scenario-amount')).toBeNull(); // fail closed: no invented figure
    const fix = screen.getByTestId('money-scenario-correct-power');
    expect(fix.props.accessibilityLabel).toBe('Review bill: Power');
    expect(screen.queryByTestId('money-scenario-correct-salary')).toBeNull();
    await user.press(fix);
    await screen.findByTestId('bill-editor-save');
    await fireEvent.changeText(screen.getByPlaceholderText('$0'), '500');
    announce.mockClear();
    await user.press(screen.getByTestId('bill-editor-save'));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    await settle();
    expect(amount()).toHaveTextContent(/^\$3,200$/);
    expect(said(ESTIMATE_UPDATED_COPY)).toBe(1);
  }, 120000);

  test('a cold restart discards the scenario and the review, and keeps the saved edit', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    await user.press(await revealReview('power'));
    await screen.findByTestId('bill-editor-save');
    await fireEvent.changeText(screen.getByDisplayValue(/^\$?500(\.00)?$/), '700');
    await user.press(screen.getByTestId('bill-editor-save'));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    await settle();
    await launchMoney(null); // unmount + re-render over the same storage
    expect(screen.queryByTestId('money-scenario-card')).toBeNull();
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
    expect(screen.getByTestId('money-aup-hero-figure')).toBeOnTheScreen();
    expect((await stored()).recurringItems.find((r) => r.id === 'power')!.amount).toBe(700);
    await openMonthEnd();
    expect(amount()).toHaveTextContent(/^\$3,000$/);
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
  }, 120000);

  test('Back to payday clears the notice; the next scenario starts clean', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    await user.press(await revealReview('power'));
    await screen.findByTestId('bill-editor-save');
    await user.press(screen.getByTestId('bill-editor-save'));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    expect(await screen.findByTestId('money-scenario-review-notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    await openMonthEnd();
    expect(screen.queryByTestId('money-scenario-review-notice')).toBeNull();
  }, 120000);
});

describe('D §5 — 320pt and maximum Dynamic Type', () => {
  test('the review action keeps a 44pt target, wraps rather than truncates, and still opens the editor', async () => {
    const user = userEvent.setup();
    setWindow(3.1, 320);
    await launchMoney(seed());
    await openMonthEnd(272);
    const review = await revealReview('power');
    const st = flat(review.props.style);
    expect(Number(st.minHeight)).toBeGreaterThanOrEqual(44);
    expect(st.height).toBeUndefined(); // grows with text
    const label = screen.getByText('Review bill');
    expect(label.props.numberOfLines).toBeUndefined();
    await user.press(review);
    expect(await screen.findByTestId('bill-editor-save')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
  }, 120000);
});
