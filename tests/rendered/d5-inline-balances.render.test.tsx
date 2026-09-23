// Pass D.5 — rendered proofs for the inline balance selector and the closed explanation
// sheets. REAL navigator, provider, storage adapter, engines and sheets; the clock is
// FROZEN to the local date 2026-09-23 (Date only — timers stay real).
//   §1 the selector in BOTH modes, inside the card, once
//   §2 open → cancel → reopen → save: one write, correct figures, date preserved
//   §3 zero / one / several selections
//   §4 the picker's copy describes the REAL persisted scope
//   §5 focus returns to the control that opened each sheet, exactly once
//   §6 the consolidated sheets keep every disclosure that still carries meaning
//   §7 long names, 320pt and maximum Dynamic Type
// NOT proven here: native sheet animation, real VoiceOver speech, device layout.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { useReturnFocus } from '../../src/hooks/useReturnFocus';
import { designLayout } from '../../src/theme/semanticTokens';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 23, 9, 0);
const TODAY = new Date(2026, 8, 23);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const lastWrite = (): AppData => JSON.parse(setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).slice(-1)[0][1]);
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => (StyleSheet.flatten(st) ?? {}) as Record<string, unknown>;
const setWindow = (fontScale: number, width = 390, height = 844) =>
  Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } } as never);

/** Everyday $7,500 + Cash $1,150 = $8,650 included; a savings balance stays out. */
function seed(opts: { cashIn?: boolean; longName?: boolean; noneIncluded?: boolean } = {}): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    {
      id: 'Everyday',
      type: 'everyday',
      label: opts.longName ? 'Joint Everyday Account — Tommy and Sam (offset)' : 'Everyday',
      currentValue: 7500,
      includeInMoneyCalculations: !opts.noneIncluded,
    } as Asset,
    { id: 'Cash', type: 'cash', label: 'Cash', currentValue: 1150, includeInMoneyCalculations: opts.noneIncluded ? false : opts.cashIn !== false } as Asset,
    { id: 'Rainy', type: 'savings', label: 'Rainy day', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
  ];
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
let reduce: jest.SpyInstance;
async function launchMoney(data: AppData) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(false);
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-section-this-month');
  await settle();
  setItem().mockClear();
}
async function openMonthEnd() {
  await fireEvent.press(screen.getByTestId('money-timeframe-row'));
  await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
  await screen.findByTestId('money-scenario-card');
}
async function openPicker() {
  await fireEvent.press(screen.getByTestId('money-inline-balances'));
  await screen.findByTestId('select-balances-intro');
}
/** testIDs in document order, restricted to the ones named. */
function orderOf(container: any, ids: string[]): string[] {
  const seen: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node === 'string') return;
    const id = node.props?.testID;
    if (typeof id === 'string' && ids.includes(id) && !seen.includes(id)) seen.push(id);
    (node.children ?? []).forEach(walk);
  };
  walk(container);
  return seen;
}

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });
beforeEach(() => {
  setWindow(1);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
});
afterEach(async () => {
  await settle(60);
  if (root) { await root.unmount(); root = null; }
  setItem().mockClear();
  jest.restoreAllMocks();
});

describe('D.5 §1 — the selector lives inside the card', () => {
  test('payday mode: one selector, beneath the amount, describing the accounts the engine actually used; the standalone card is gone', async () => {
    const data = seed();
    await launchMoney(data);
    const s = computeSafeToSpend(data, TODAY);
    expect(s.includedMoneyBalance).toBe(8650);

    // One entry point, not two.
    expect(screen.getAllByTestId('money-inline-balances', H)).toHaveLength(1);
    expect(screen.queryByTestId('money-included-balances-row', H)).toBeNull();

    const pill = screen.getByTestId('money-inline-balances');
    expect(pill).toHaveTextContent('2 accounts · $8,650', { exact: false });
    expect(pill.props.accessibilityLabel).toBe('Balances used: 2 accounts, $8,650');
    expect(pill.props.accessibilityRole).toBe('button');

    // Inside the card, after the figure it qualifies.
    const hero = screen.getByTestId('money-aup-hero');
    expect(within(hero).getByTestId('money-inline-balances')).toBeTruthy();
    expect(orderOf(hero, ['money-aup-hero-figure', 'money-inline-balances'])).toEqual(['money-aup-hero-figure', 'money-inline-balances']);

    // It describes; it does not become part of the accessible figure group.
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$/);
    expect(writes()).toBe(0);
  }, 30000);

  test('selected-date mode: the SAME single selector, inside the scenario card, above the "Why this amount?" action', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    expect(screen.getAllByTestId('money-inline-balances', H)).toHaveLength(1);
    const card = screen.getByTestId('money-scenario-card');
    expect(within(card).getByTestId('money-inline-balances')).toHaveTextContent('2 accounts · $8,650', { exact: false });
    expect(orderOf(card, ['money-inline-balances', 'money-why-this-amount'])).toEqual(['money-inline-balances', 'money-why-this-amount']);
    expect(writes()).toBe(0);
  }, 30000);

  test('the control meets the 44pt floor on both axes and does not truncate a long account name', async () => {
    await launchMoney(seed({ longName: true, cashIn: false }));
    const pill = screen.getByTestId('money-inline-balances');
    const st = flat(pill.props.style);
    expect(st.minHeight).toBe(designLayout.touchTargetMin);
    expect(st.minWidth).toBe(designLayout.touchTargetMin);
    expect(pill).toHaveTextContent('Joint Everyday Account — Tommy and Sam (offset) · $7,500', { exact: false });
    const label = within(pill).getByText(/Joint Everyday Account/);
    expect(label.props.numberOfLines).toBeUndefined(); // wraps, never clips
    expect(flat(label.props.style).flexShrink).toBe(1);
  }, 30000);
});

describe('D.5 §2 — open, cancel, reopen, save', () => {
  test('cancelling writes nothing and changes no figure; saving writes ONCE and moves the included balance by exactly the toggled amount', async () => {
    const data = seed();
    await launchMoney(data);
    const before = screen.getByTestId('money-aup-hero-figure').props.children;

    await openPicker();
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$8,650', { exact: false });
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash')); // draft only
    await fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();
    expect(writes()).toBe(0);
    expect(screen.getByTestId('money-aup-hero-figure').props.children).toEqual(before);
    expect(screen.getByTestId('money-inline-balances')).toHaveTextContent('2 accounts · $8,650', { exact: false });

    // Reopening shows the SAVED state, not the discarded draft.
    await openPicker();
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$8,650', { exact: false });
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$7,500', { exact: false });
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();

    expect(writes()).toBe(1); // one persist() for the whole selection
    const saved = lastWrite();
    expect(saved.assets.find((a) => a.id === 'Cash')?.includeInMoneyCalculations).toBe(false);
    expect(saved.assets.find((a) => a.id === 'Everyday')?.includeInMoneyCalculations).toBe(true);
    expect(saved.assets.find((a) => a.id === 'Cash')?.currentValue).toBe(1150); // the balance itself is untouched
    expect(screen.getByTestId('money-inline-balances')).toHaveTextContent('Everyday · $7,500', { exact: false });

    const after = computeSafeToSpend({ ...data, assets: saved.assets }, TODAY);
    expect(after.includedMoneyBalance).toBe(7500);
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(String(Math.round(after.cycleRemainingPool)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), { exact: false });
  }, 40000);

  test('no scenario writes: changing the selection from selected-date mode keeps the chosen date and writes only the inclusion change', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    const dateLabel = screen.getByTestId('money-timeframe-row').props.accessibilityLabel;
    setItem().mockClear();

    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();

    expect(writes()).toBe(1);
    const saved = lastWrite();
    // The write carries the inclusion change and nothing about the scenario.
    expect(saved.assets.find((a) => a.id === 'Cash')?.includeInMoneyCalculations).toBe(false);
    expect(JSON.stringify(saved)).not.toMatch(/scenario/i);
    // The card is still in selected-date mode, on the same date.
    expect(screen.getByTestId('money-scenario-card')).toBeTruthy();
    expect(screen.getByTestId('money-timeframe-row').props.accessibilityLabel).toBe(dateLabel);
    expect(screen.getByTestId('money-inline-balances')).toHaveTextContent('Everyday · $7,500', { exact: false });
  }, 40000);
});

describe('D.5 §3 — zero, one and several', () => {
  test('with nothing included there is ONE entry point — the card\'s own call to action, not a second identical pill — and choosing balances brings the estimate back', async () => {
    await launchMoney(seed({ noneIncluded: true }));
    // The no-balances state already asks for a choice, so the inline pill is suppressed
    // rather than repeated beside it.
    expect(screen.getByTestId('money-aup-hero-no-balances-state')).toBeTruthy();
    expect(screen.getAllByTestId('money-aup-cta-balances', H)).toHaveLength(1);
    expect(screen.queryByTestId('money-inline-balances', H)).toBeNull();
    expect(screen.queryByTestId('money-aup-hero-figure', H)).toBeNull(); // never "$0" for "unknown"

    await fireEvent.press(screen.getByTestId('money-aup-cta-balances'));
    await screen.findByTestId('select-balances-intro');
    await fireEvent.press(screen.getByTestId('select-balances-row-Everyday'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();

    expect(writes()).toBe(1);
    // One account: NAMED, with its own balance.
    expect(await screen.findByTestId('money-inline-balances')).toHaveTextContent('Everyday · $7,500', { exact: false });
    expect(screen.queryByTestId('money-aup-cta-balances', H)).toBeNull();

    // Several: COUNTED, with the engine's total.
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();
    expect(screen.getByTestId('money-inline-balances')).toHaveTextContent('2 accounts · $8,650', { exact: false });
    expect(writes()).toBe(2); // exactly one write per save, never one per account
  }, 40000);
});

describe('D.5 §4 — the picker tells the truth about scope', () => {
  test('it says the choice applies everywhere and persists, never that it changes one estimate; and that what you own is unchanged', async () => {
    await launchMoney(seed());
    await openPicker();
    const intro = screen.getByTestId('select-balances-intro');
    expect(intro).toHaveTextContent(/applies everywhere Nolie estimates your money/, { exact: false });
    expect(intro).toHaveTextContent(/stays this way until you change it/, { exact: false });
    expect(intro).toHaveTextContent(/Your account balances and Wealth total never change/, { exact: false });
    expect(intro).not.toHaveTextContent(/this estimate only/, { exact: false });
    const row = screen.getByTestId('select-balances-row-Cash');
    expect(row.props.accessibilityRole).toBe('checkbox');
    expect(row.props.accessibilityState?.checked).toBe(true);
  }, 30000);
});

describe('D.5 §5 — focus returns to the control that opened the sheet', () => {
  // The native dismissal callback itself (Modal.onDismiss) is not simulated by Jest, so
  // what is proven here is the hook that consumes it: armed once, fired once, never
  // stranded. The end-to-end restoration is a device check.
  function Harness({ onReady }: { onReady: (api: { arm: () => void; fire: () => void }) => void }) {
    const focus = useReturnFocus();
    React.useEffect(() => { onReady({ arm: focus.arm, fire: focus.fire }); }, [focus.arm, focus.fire, onReady]);
    return <View ref={focus.ref} testID="origin" accessible accessibilityRole="button" accessibilityLabel="Balances used" />;
  }

  test('firing without arming does nothing; armed, it moves focus to the origin exactly once however many times dismissal reports', async () => {
    let api: { arm: () => void; fire: () => void } = { arm: () => {}, fire: () => {} };
    root = await render(<Harness onReady={(a) => { api = a; }} />);
    const send = AccessibilityInfo.sendAccessibilityEvent as unknown as jest.Mock;
    send.mockClear();

    await act(async () => { api.fire(); });
    expect(send).not.toHaveBeenCalled(); // no sheet was opened

    await act(async () => { api.arm(); });
    await act(async () => { api.fire(); api.fire(); }); // iOS onDismiss + the visibility fallback
    const focused = send.mock.calls.filter((c) => c[1] === 'focus');
    expect(focused).toHaveLength(1);
    expect(focused[0][0]).toBeTruthy(); // the origin's own node, not a sheet node
    expect(screen.getByTestId('origin')).toBeTruthy();

    // A second open/close cycle moves focus again — the guard is per cycle, not once ever.
    await act(async () => { api.arm(); api.fire(); });
    expect(send.mock.calls.filter((c) => c[1] === 'focus')).toHaveLength(2);
  }, 30000);

  test('the invoking controls expose a ref for that return: the pill in both modes, and "Why this amount?"', async () => {
    await launchMoney(seed());
    expect(screen.getByTestId('money-inline-balances')).toBeTruthy();
    await openMonthEnd();
    expect(screen.getByTestId('money-inline-balances')).toBeTruthy();
    const why = screen.getByTestId('money-why-this-amount');
    await fireEvent.press(why);
    await screen.findByTestId('look-ahead-result');
    await fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByTestId('look-ahead-result')).toBeNull());
    await settle();
    // Closing the explanation changes nothing and writes nothing.
    expect(screen.getByTestId('money-why-this-amount')).toBeTruthy();
    expect(writes()).toBe(0);
  }, 30000);
});

describe('D.5 §6 — the consolidated sheet still carries every meaning', () => {
  test('each disclosure appears exactly once, in the section it belongs to, and nothing is left saying the same thing twice', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    await fireEvent.press(screen.getByTestId('money-why-this-amount'));
    const body = await screen.findByTestId('look-ahead-result');

    // The guide's method is shown as arithmetic and its coverage, not restated as prose.
    expect(screen.getByTestId('look-ahead-daily-guide')).toBeTruthy();
    expect(body).not.toHaveTextContent(/spreads an equal amount across the days/, { exact: false });

    // The excluded savings statement is stated once, beside the amount it excludes.
    expect(screen.getAllByTestId('look-ahead-excluded-savings', H)).toHaveLength(1);
    expect(screen.getByTestId('look-ahead-excluded-savings')).toHaveTextContent(/isn’t counted in the .* starting amount/, { exact: false });

    // The estimate disclaimer is said once, by the closing provenance.
    expect(screen.getAllByTestId('look-ahead-provenance', H)).toHaveLength(1);
    expect(screen.getByTestId('look-ahead-provenance')).toHaveTextContent(/An estimate, not a guarantee/, { exact: false });
    expect(body).not.toHaveTextContent(/planning estimate, not a guarantee/, { exact: false });

    // The assumptions that survive are the ones nothing else says.
    const assumptions = screen.getByTestId('look-ahead-assumptions-body');
    expect(assumptions).toHaveTextContent(/end-of-day balance/, { exact: false });
    expect(assumptions).toHaveTextContent(/it’s spending, not extra money/, { exact: false });
    expect(assumptions).not.toHaveTextContent(/not subtracted/, { exact: false });
    expect(writes()).toBe(0);
  }, 40000);
});

describe('D.5 §7 — narrow screens and large text', () => {
  test('at 320pt and maximum Dynamic Type the selector is still present, still reaches the 44pt floor, and still names the accounts', async () => {
    setWindow(1.9, 320, 568);
    await launchMoney(seed({ longName: true }));
    const pill = screen.getByTestId('money-inline-balances');
    const st = flat(pill.props.style);
    expect(st.minHeight).toBe(designLayout.touchTargetMin);
    expect(pill).toHaveTextContent('2 accounts · $8,650', { exact: false });
    expect(within(pill).getByText(/2 accounts/).props.maxFontSizeMultiplier).toBe(2);
    expect(writes()).toBe(0);
  }, 30000);
});
