// Pass D.1 — rendered proofs that the timeline's event detail stays clear of the
// floating dock/FAB. REAL navigator, provider, storage adapter, rail and editors; the
// clock is FROZEN to the local date 2026-09-21 (Date only — timers stay real).
//   §1 the detail is bounded from the shared dock/safe-area geometry; heading and Close
//      stay pinned; every row, Review action and end-of-day balance sits in the body
//   §2 the page moves just far enough to clear the dock (Reduce Motion: not animated)
//   §3 interaction protection: one detail, replace, close once, identities, no writes
// Jest has no layout engine: window frames are supplied through the same
// `measureInWindow` / `onLayout` / `onScroll` seams the device uses. NOT proven here:
// real Yoga sizing of the scrolling body, native nested-scroll gestures, VoiceOver.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { BALANCE_PATH_MIN_TARGET, DETAIL_VIEWPORT_GAP, resolveDetailMaxHeight } from '../../src/lib/calculations/balancePathInteraction';
import { screenBottomClearance } from '../../src/navigation/floatingNavGeometry';
import type { AppData, Asset, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 21, 17, 25);
const H = { includeHiddenElements: true };
const P = 'money-scenario-timeline';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => (StyleSheet.flatten(st) ?? {}) as Record<string, unknown>;

type Device = { width: number; height: number; top: number; bottom: number; fontScale: number };
const PRO_MAX: Device = { width: 430, height: 932, top: 59, bottom: 34, fontScale: 1 };
const SE_MAX_TYPE: Device = { width: 320, height: 568, top: 20, bottom: 0, fontScale: 3.1 };
let device: Device = PRO_MAX;
const setDevice = (d: Device) => {
  device = d;
  Dimensions.set({ window: { width: d.width, height: d.height, scale: 3, fontScale: d.fontScale }, screen: { width: d.width, height: d.height, scale: 3, fontScale: d.fontScale } } as never);
};
const expectedMax = (d: Device) => resolveDetailMaxHeight({ windowHeight: d.height, topInset: d.top, bottomClearance: screenBottomClearance(d.bottom) });

/** The recording's shape: a weekly Main payday (short cycle), Gym alone, Zip pay 25 Sep + Internet 26 Sep sharing one marker, and a busy 30th. */
function seed(theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary', theme } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 8650, includeInMoneyCalculations: true } as Asset];
  d.liabilities = [{ id: 'zip', type: 'bnpl', label: 'Zip pay', currentBalance: 280 } as Liability];
  const bill = (id: string, label: string, amount: number, day: number, extra: Partial<RecurringItem> = {}) =>
    ({ id, type: 'expense', label, amount, frequency: 'monthly', nextDueDate: iso(2026, 9, day), isFixed: true, active: true, categoryId: 'cat-utilities', ...extra } as RecurringItem);
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: false, active: true } as RecurringItem,
    bill('gym', 'Gym', 250, 23),
    bill('zip-bill', 'Zip pay repayment', 70, 25, { linkedLiabilityId: 'zip', categoryId: undefined }),
    bill('internet', 'Internet', 50, 26),
    bill('rent', 'Rent', 1000, 30),
    bill('power', 'Power', 180, 30),
    bill('phone', 'Phone', 60, 30),
    bill('water', 'Water', 90, 30),
  ];
  return syncIncomeAggregate(d);
}

function App() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: device.width, height: device.height }, insets: { top: device.top, left: 0, right: 0, bottom: device.bottom } }}>
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
let focus: jest.SpyInstance; let reduce: jest.SpyInstance;
// The window frame the "device" reports for the detail; null = measurement never answers.
let detailFrame: { y: number; height: number } | null = null;
const measure = () => (View as any).prototype.measureInWindow as jest.Mock;
const scrollTo = () => (ScrollView as any).prototype.scrollTo as jest.Mock;

async function launchMoney(data: AppData, reduceMotion = false) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(reduceMotion);
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-timeframe-row');
  await settle();
}
async function openMonthEnd() {
  const width = device.width - 104;
  await fireEvent.press(screen.getByTestId('money-timeframe-row'));
  await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
  await screen.findByTestId('money-scenario-card');
  await fireEvent(screen.getByTestId(`${P}-band`, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  await fireEvent(screen.getByTestId(/^timeline-density-/, H), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 8 } } });
  await screen.findAllByTestId(/^timeline-target-/);
}
/** Press targets until the detail lists exactly these sources (by stable id). */
async function openDetailWith(sourceIds: string[], exact = true) {
  for (const target of screen.getAllByTestId(/^timeline-target-/)) {
    await fireEvent.press(target);
    const rows = screen.queryAllByTestId(/^timeline-row-/).map((r) => String(r.props.testID).split(':')[2]);
    if ((!exact || rows.length === sourceIds.length) && sourceIds.every((id) => rows.includes(id))) return target;
  }
  throw new Error(`no marker lists exactly ${sourceIds.join(', ')}`);
}
const detailLayout = async (height: number) => fireEvent(screen.getByTestId(`${P}-detail`), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } });
const body = () => screen.getByTestId(`${P}-detail-body`);
const bodyMax = () => Number(flat(body().props.style).maxHeight);

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setDevice({ width: 390, height: 844, top: 47, bottom: 34, fontScale: 2 }); });
beforeEach(() => {
  setDevice(PRO_MAX);
  detailFrame = null;
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
  measure().mockImplementation(function (this: { props: { testID?: string } }, cb: (x: number, y: number, w: number, h: number) => void) {
    if (this.props.testID === `${P}-detail` && detailFrame) cb(40, detailFrame.y, 300, detailFrame.height);
    // Pass D.3 — the band is measured too; the "device" places it 110pt above the detail.
    if (this.props.testID === `${P}-band` && detailFrame) cb(40, detailFrame.y - 110, 300, 44);
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

describe('D.1 §1 — the detail is bounded by the shared dock geometry; nothing is clipped', () => {
  test('the seams exist in this environment (otherwise every proof below would be vacuous)', () => {
    expect(jest.isMockFunction(measure())).toBe(true);
    expect(jest.isMockFunction(scrollTo())).toBe(true);
    expect(expectedMax(PRO_MAX)).toBe(932 - 59 - 114 - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP * 2);
  });

  test.each([
    ['one short event (Gym, 23 Sep)', ['gym']],
    ['grouped adjacent dates (Zip pay 25 Sep + Internet 26 Sep — the recording)', ['zip-bill', 'internet']],
  ])('%s: heading and Close are pinned OUTSIDE the scrolling body; every row, Review action and balance is INSIDE it', async (_n, ids) => {
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(ids);
    const card = screen.getByTestId(new RegExp(`^${P}-detail-(anchored|inline)$`));
    const b = within(body());
    // Pinned chrome.
    expect(within(card).getByTestId(`${P}-detail-title`)).toBeTruthy();
    expect(within(card).getByTestId(`${P}-detail-close`)).toBeTruthy();
    expect(b.queryByTestId(`${P}-detail-title`)).toBeNull();
    expect(b.queryByTestId(`${P}-detail-close`)).toBeNull();
    // Everything the customer needs is in the body, in source order, by stable identity.
    expect(b.getAllByTestId(/^timeline-row-/).map((r) => String(r.props.testID).split(':')[2])).toEqual(ids);
    expect(b.getAllByTestId(/^timeline-review-/).map((r) => String(r.props.testID).split(':')[2])).toEqual(ids);
    expect(b.getAllByText(/^End-of-day balance: \$/)).toHaveLength(ids.length > 1 ? 2 : 1);
    for (const review of b.getAllByTestId(/^timeline-review-/)) {
      expect(Number(flat(review.props.style).minHeight)).toBeGreaterThanOrEqual(44);
      expect(Number(flat(review.props.style).minWidth)).toBeGreaterThanOrEqual(44);
    }
    // Bounded, never clipped or shrunk.
    expect(bodyMax()).toBeGreaterThanOrEqual(BALANCE_PATH_MIN_TARGET * 2);
    expect(bodyMax()).toBeLessThan(expectedMax(PRO_MAX));
    expect(flat(card.props.style).overflow).toBeUndefined();
    expect(flat(card.props.style).height).toBeUndefined(); // short details take only the space they need
    expect(flat(body().props.style).height).toBeUndefined();
    expect(body().props.bounces).toBe(false);
    expect(body().props.nestedScrollEnabled).toBe(true);
    expect(body().props.showsVerticalScrollIndicator).toBe(true);
    for (const t of b.getAllByText(/./)) { expect(t.props.numberOfLines).toBeUndefined(); expect(t.props.adjustsFontSizeToFit).toBeUndefined(); }
  }, 120000);

  test('four source rows on one date: all four rows, four Review actions and the balance are in the body; identities are exact', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(['rent', 'power', 'phone', 'water']);
    const b = within(body());
    expect(b.getAllByTestId(/^timeline-row-/)).toHaveLength(4);
    // The engine's canonical order is preserved, and each action sits with ITS row.
    const rowIds = b.getAllByTestId(/^timeline-row-/).map((r) => String(r.props.testID).replace('timeline-row-', ''));
    expect(b.getAllByTestId(/^timeline-review-/).map((r) => String(r.props.testID).replace('timeline-review-', ''))).toEqual(rowIds);
    expect(b.getAllByTestId(/^timeline-review-/).map((r) => r.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Review bill: Phone, /), expect.stringMatching(/^Review bill: Power, /), expect.stringMatching(/^Review bill: Rent, /), expect.stringMatching(/^Review bill: Water, /),
    ]);
    expect(b.getByText(/^End-of-day balance: \$/)).toBeTruthy();
    expect(screen.queryByTestId(`${P}-detail-more`)).toBeNull(); // nothing summarised away
  }, 120000);

  test('the body bound follows the pinned heading: a taller (wrapped) heading leaves less for the rows, never less than two 44pt rows', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(['zip-bill', 'internet']);
    const before = bodyMax();
    const header = screen.getByTestId(`${P}-detail-title`).parent!.parent!;
    await fireEvent(screen.getByTestId(`${P}-detail-title`), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 10 } } }).catch(() => {});
    // The header View owns the onLayout; find it as the nearest ancestor that has one.
    let node: any = screen.getByTestId(`${P}-detail-title`);
    while (node && typeof node.props?.onLayout !== 'function') node = node.parent;
    expect(node).toBeTruthy();
    await act(async () => { node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 260, height: 120 } } }); });
    expect(bodyMax()).toBe(before - (120 - BALANCE_PATH_MIN_TARGET));
    await act(async () => { node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 260, height: 5000 } } }); });
    expect(bodyMax()).toBe(BALANCE_PATH_MIN_TARGET * 2);
    expect(header).toBeTruthy();
  }, 120000);

  test('320pt class at maximum Dynamic Type: the bound comes from THAT device (no bottom inset, 568pt), stays reachable, and the inline layout is used', async () => {
    setDevice(SE_MAX_TYPE);
    await launchMoney(seed());
    await openMonthEnd();
    // On this rail the 28th and the 30th share one marker: FIVE sources across two dates —
    // a larger grouped detail than the recording's.
    await openDetailWith(['salary', 'rent', 'power', 'phone', 'water'], false);
    expect(expectedMax(SE_MAX_TYPE)).toBe(568 - 20 - 80 - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP * 2);
    expect(screen.getByTestId(`${P}-detail-inline`)).toBeTruthy();
    expect(screen.queryByTestId(`${P}-detail-caret`)).toBeNull();
    expect(bodyMax()).toBeGreaterThanOrEqual(BALANCE_PATH_MIN_TARGET * 2);
    // chrome + body can never exceed what is clear of the dock on this device.
    expect(bodyMax() + BALANCE_PATH_MIN_TARGET).toBeLessThanOrEqual(expectedMax(SE_MAX_TYPE));
    const rows = within(body()).getAllByTestId(/^timeline-row-/);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(within(body()).getAllByTestId(/^timeline-review-/)).toHaveLength(rows.length); // every source keeps its action
    expect(within(body()).getAllByText(/^End-of-day balance: \$/)).toHaveLength(within(body()).getAllByTestId(/^timeline-section-/).length);
    for (const review of within(body()).getAllByTestId(/^timeline-review-/)) expect(Number(flat(review.props.style).minHeight)).toBeGreaterThanOrEqual(44);
  }, 120000);

  test.each(['light', 'dark', 'system'] as const)('%s theme: same structure and bound', async (theme) => {
    await launchMoney(seed(theme));
    await openMonthEnd();
    await openDetailWith(['zip-bill', 'internet']);
    expect(within(body()).getAllByTestId(/^timeline-review-/)).toHaveLength(2);
    expect(bodyMax()).toBeGreaterThan(400);
  }, 120000);
});

describe('D.1 §2 — the page moves just far enough to clear the dock', () => {
  test('the recording: a detail whose lower edge is behind the dock scrolls the page by exactly its overflow, once per layout, animated', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 3000, width: 430 }, layoutMeasurement: { height: 873, width: 430 } } });
    await openDetailWith(['zip-bill', 'internet']);
    scrollTo().mockClear();
    detailFrame = { y: 690, height: 420 }; // lower edge at 1110 on a 932pt screen
    await detailLayout(420);
    const clearBottom = 932 - screenBottomClearance(34) - DETAIL_VIEWPORT_GAP;
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    expect(scrollTo()).toHaveBeenCalledWith({ y: 690 + 420 - clearBottom, animated: true });
    // After that move the detail rests above the dock and the marker band is still on screen.
    const moved = 690 + 420 - clearBottom;
    expect(690 - moved + 420).toBeLessThanOrEqual(clearBottom);
    expect(690 - moved - BALANCE_PATH_MIN_TARGET).toBeGreaterThan(59);
  }, 120000);

  test('it moves from the CURRENT offset the page reports; a detail already clear of the dock moves nothing; a re-layout of the SAME open detail never moves it again (Pass D.3, F5)', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { y: 137 }, contentSize: { height: 3000, width: 430 }, layoutMeasurement: { height: 873, width: 430 } } });
    detailFrame = { y: 300, height: 180 };
    await openDetailWith(['gym']);
    scrollTo().mockClear();
    await detailLayout(180);
    expect(scrollTo()).not.toHaveBeenCalled();
    // The same open detail re-laying out (even if it now overflowed) is NOT a second reveal.
    detailFrame = { y: 700, height: 180 };
    await detailLayout(181);
    expect(scrollTo()).not.toHaveBeenCalled();
    // A fresh opening reveals once, from the current offset.
    await fireEvent.press(screen.getByTestId(`${P}-detail-close`));
    await openDetailWith(['gym']);
    scrollTo().mockClear();
    await detailLayout(180);
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    expect(scrollTo()).toHaveBeenCalledWith({ y: 137 + (700 + 180 - (932 - 114 - DETAIL_VIEWPORT_GAP)), animated: true });
  }, 120000);

  test('Reduce Motion: the SAME position, reached without animation', async () => {
    await launchMoney(seed(), true);
    await openMonthEnd();
    await openDetailWith(['zip-bill', 'internet']);
    scrollTo().mockClear();
    detailFrame = { y: 690, height: 420 };
    await detailLayout(420);
    expect(scrollTo()).toHaveBeenCalledWith({ y: 690 + 420 - (932 - 114 - DETAIL_VIEWPORT_GAP), animated: false });
  }, 120000);

  test('a measurement that never answers is harmless: nothing scrolls, nothing throws, the detail still works', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(['zip-bill', 'internet']);
    scrollTo().mockClear();
    detailFrame = null;
    await detailLayout(420);
    expect(scrollTo()).not.toHaveBeenCalled();
    expect(within(body()).getAllByTestId(/^timeline-review-/)).toHaveLength(2);
  }, 120000);
});

describe('D.1 §3 — interaction protection', () => {
  test('one detail at a time; another marker replaces it; Close dismisses once and returns focus to the marker; zero writes throughout', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    const w = writes();
    const first = await openDetailWith(['gym']);
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    await openDetailWith(['zip-bill', 'internet']);
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    expect(screen.queryByTestId(/^timeline-row-oid1:[a-z]+:gym:/)).toBeNull();
    // Scroll the body and the page: neither dismisses the detail nor writes.
    await fireEvent.scroll(body(), { nativeEvent: { contentOffset: { y: 80 }, contentSize: { height: 600, width: 300 }, layoutMeasurement: { height: 300, width: 300 } } });
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { y: 220 }, contentSize: { height: 3000, width: 430 }, layoutMeasurement: { height: 873, width: 430 } } });
    expect(screen.getAllByTestId(`${P}-detail`)).toHaveLength(1);
    focus.mockClear();
    await fireEvent.press(screen.getByTestId(`${P}-detail-close`));
    expect(screen.queryByTestId(`${P}-detail`)).toBeNull();
    expect(focus.mock.calls.filter((c) => c[1] === 'focus')).toHaveLength(1);
    expect(first).toBeTruthy();
    await settle();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 120000);

  test('from the GROUPED detail each Review action opens ITS OWN source — never "the first" — and rapid taps open one editor', async () => {
    const user = userEvent.setup();
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(['zip-bill', 'internet']);
    const second = within(body()).getByTestId(/^timeline-review-oid1:[a-z]+:internet:/);
    expect(second.props.accessibilityLabel).toMatch(/^Review bill: Internet, /);
    const w = writes();
    await act(async () => { second.props.onClick({}); second.props.onClick({}); });
    await screen.findByTestId('bill-editor-save');
    expect(screen.getAllByTestId('bill-editor-save')).toHaveLength(1);
    expect(screen.getByDisplayValue('Internet')).toBeTruthy();
    expect(screen.queryByDisplayValue('Zip pay repayment')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('bill-editor-save')).toBeNull());
    // Back in the same grouped detail; the other source routes to ITS editor.
    const firstReview = within(body()).getByTestId(/^timeline-review-oid1:[a-z]+:zip-bill:/);
    expect(firstReview.props.accessibilityLabel).toMatch(/^Review repayment: Zip pay, /);
    await user.press(firstReview);
    await screen.findByTestId('wealth-editor-save');
    expect(screen.queryByTestId('bill-editor-save')).toBeNull();
    await user.press(screen.getAllByRole('button', { name: /^(Cancel|Close)$/ })[0]);
    await waitFor(() => expect(screen.queryByTestId('wealth-editor-save')).toBeNull());
    await settle();
    expect(writes()).toBe(w);
  }, 120000);

  test('overflowing rows cue the system scroll indicator once; rows that fit cue nothing', async () => {
    const flash = (ScrollView as any).prototype.flashScrollIndicators as jest.Mock;
    expect(jest.isMockFunction(flash)).toBe(true);
    await launchMoney(seed());
    await openMonthEnd();
    await openDetailWith(['gym']);
    flash.mockClear();
    await fireEvent(body(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 160 } } });
    await fireEvent(body(), 'contentSizeChange', 300, 160);
    expect(flash).not.toHaveBeenCalled();
    await openDetailWith(['rent', 'power', 'phone', 'water']);
    flash.mockClear();
    await fireEvent(body(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } } });
    await fireEvent(body(), 'contentSizeChange', 300, 640);
    await fireEvent(body(), 'contentSizeChange', 300, 641);
    expect(flash).toHaveBeenCalledTimes(1);
  }, 120000);
});
