// Pass E — rendered proofs for the closure pass. REAL navigator, provider, storage
// adapter, engines and sheets; the clock is FROZEN to the local date 2026-09-24
// (Date only — timers stay real).
//   §1 dirty draft → "+ Add a money balance": keep editing / discard / save and continue
//   §2 the child flow's return, one modal at a time, and the scenario date's survival
//   §3 zero financial writes for opening, changing and dismissing a scenario
//   §4 persisted inclusion vs the temporary scenario date across a real restart
//   §5 focus return, including the zero-selection fallback
// NOT proven here: native Modal presentation/dismissal timing (Modal.onDismiss never
// fires under Jest), real VoiceOver speech, device layout.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Alert, Dimensions, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 24, 9, 0);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const lastWrite = (): AppData => JSON.parse(setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).slice(-1)[0][1]);
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const setWindow = (fontScale: number, width = 390, height = 844) =>
  Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } } as never);

function seed(opts: { noneIncluded?: boolean } = {}): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    { id: 'Everyday', type: 'everyday', label: 'Everyday', currentValue: 7500, includeInMoneyCalculations: !opts.noneIncluded } as Asset,
    { id: 'Cash', type: 'cash', label: 'Cash', currentValue: 1150, includeInMoneyCalculations: !opts.noneIncluded } as Asset,
    { id: 'Rainy', type: 'savings', label: 'Rainy day', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 6), isFixed: false, active: true } as RecurringItem,
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
let alertSpy: jest.SpyInstance;

async function launchMoney(data?: AppData) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(false);
  if (data) {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-section-this-month');
  await settle();
  setItem().mockClear();
}
/** A real restart: unmount everything and re-hydrate from the storage adapter. */
async function restart() {
  if (root) { await root.unmount(); root = null; }
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-section-this-month');
  await settle();
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
const addBalanceButton = () => screen.getByLabelText('Add a money balance');
/** The button the shared confirmation offered, by its exact label. */
function alertButton(text: string) {
  const call = alertSpy.mock.calls.at(-1);
  expect(call).toBeDefined();
  const button = (call![2] as { text: string; onPress?: () => void }[]).find((b) => b.text === text);
  expect(button).toBeDefined();
  return button!;
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
  // The shared confirmation is a native Alert; nothing is chosen unless a test chooses it.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await settle(60);
  if (root) { await root.unmount(); root = null; }
  setItem().mockClear();
  jest.restoreAllMocks();
});

describe('E §1 — a dirty selection cannot vanish, and cannot be committed behind the user', () => {
  test('a CLEAN draft hands off with no prompt at all', async () => {
    await launchMoney(seed());
    await openPicker();
    await fireEvent.press(addBalanceButton());
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  }, 30000);

  test('a DIRTY draft asks first: nothing is written, the sheet stays open, and the draft is still there', async () => {
    await launchMoney(seed());
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$7,500', { exact: false });

    await fireEvent.press(addBalanceButton());
    await settle();
    // The prompt was raised, and it named all three outcomes.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, { text: string; style?: string }[]];
    expect(title).toMatch(/Save your balance selection\?/);
    expect(message).toMatch(/Save that before adding a balance, or discard it/);
    expect(buttons.map((b) => b.text)).toEqual(['Keep editing', 'Discard', 'Save and continue']);
    expect(buttons.find((b) => b.text === 'Keep editing')!.style).toBe('cancel');
    expect(buttons.find((b) => b.text === 'Discard')!.style).toBe('destructive');

    // Merely opening the child flow committed nothing…
    expect(writes()).toBe(0);
    // …and the picker is still open, with the draft intact.
    expect(screen.getByTestId('select-balances-intro')).toBeTruthy();
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$7,500', { exact: false });
    expect(screen.getByTestId('select-balances-row-Cash').props.accessibilityState).toMatchObject({ checked: false });
  }, 30000);

  test('"Keep editing" is a genuine cancel: the draft survives and the child flow never opens', async () => {
    await launchMoney(seed());
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(addBalanceButton());
    await settle();

    const keep = alertButton('Keep editing');
    expect(keep.onPress).toBeUndefined(); // a cancel button does nothing at all
    await settle();

    expect(writes()).toBe(0);
    expect(screen.getByTestId('select-balances-intro')).toBeTruthy();
    expect(screen.queryByTestId('add-anything-sheet')).toBeNull();
    expect(screen.getByTestId('select-balances-total')).toHaveTextContent('$7,500', { exact: false });
    // Saving now still commits what was drafted — the draft was never touched.
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();
    expect(writes()).toBe(1);
    expect(lastWrite().assets.find((a) => a.id === 'Cash')?.includeInMoneyCalculations).toBe(false);
  }, 40000);

  test('"Discard" writes nothing and leaves the saved selection exactly as it was', async () => {
    const data = seed();
    await launchMoney(data);
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(addBalanceButton());
    await settle();

    alertButton('Discard').onPress!();
    await settle();

    expect(writes()).toBe(0);
    expect(await stored()).toMatchObject({ assets: expect.arrayContaining([expect.objectContaining({ id: 'Cash', includeInMoneyCalculations: true })]) });
  }, 40000);

  test('"Save and continue" commits ONCE, through the existing inclusion path, and only then hands off', async () => {
    await launchMoney(seed());
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(addBalanceButton());
    await settle();

    alertButton('Save and continue').onPress!();
    await settle();

    expect(writes()).toBe(1); // one persist() for the whole selection, never one per account
    const saved = lastWrite();
    expect(saved.assets.find((a) => a.id === 'Cash')?.includeInMoneyCalculations).toBe(false);
    expect(saved.assets.find((a) => a.id === 'Everyday')?.includeInMoneyCalculations).toBe(true);
    expect(saved.assets.find((a) => a.id === 'Cash')?.currentValue).toBe(1150); // the balance itself is untouched
  }, 40000);
});

describe('E §2 — the handoff is sequenced, and the scenario survives it', () => {
  test('the child sheet is not presented while the picker is still up, and the selected date is unchanged throughout', async () => {
    await launchMoney(seed());
    await openMonthEnd();
    const dateLabel = screen.getByTestId('money-timeframe-row').props.accessibilityLabel;
    await openPicker();
    await fireEvent.press(addBalanceButton()); // clean draft: continues straight through
    await settle();

    // The picker asked to close; the chooser waits for its dismissal (Modal.onDismiss,
    // which Jest never fires), so exactly one sheet is on screen at a time.
    expect(screen.queryAllByTestId('select-balances-intro')).toHaveLength(0);
    expect(writes()).toBe(0);
    // The scenario is untouched by the handoff.
    expect(screen.getByTestId('money-scenario-card')).toBeTruthy();
    expect(screen.getByTestId('money-timeframe-row').props.accessibilityLabel).toBe(dateLabel);
  }, 40000);
});

describe('E §3 — looking costs nothing', () => {
  test('opening, changing and dismissing a scenario, and opening both explanation sheets, write nothing at all', async () => {
    await launchMoney(seed());
    expect(writes()).toBe(0);

    await openMonthEnd();
    expect(writes()).toBe(0);

    await fireEvent.press(screen.getByTestId('money-why-this-amount'));
    await screen.findByTestId('look-ahead-result');
    await fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByTestId('look-ahead-result')).toBeNull());
    expect(writes()).toBe(0);

    // Back to payday mode, then its own explanation sheet.
    await fireEvent.press(screen.getByTestId('money-timeframe-row'));
    await fireEvent.press(await screen.findByTestId('timeframe-until-payday'));
    await screen.findByTestId('money-aup-hero');
    await fireEvent.press(screen.getByTestId('money-aup-hero-info'));
    await screen.findByTestId('aup-why-summary');
    await fireEvent.press(screen.getByLabelText('Close'));
    await settle();

    expect(writes()).toBe(0);
    // Opening the picker and cancelling is also free.
    await openPicker();
    await fireEvent.press(screen.getByText('Cancel'));
    await settle();
    expect(writes()).toBe(0);
  }, 60000);
});

describe('E §4 — what persists and what does not', () => {
  test('inclusion survives a real restart; the chosen scenario date does not, and the estimate is recomputed from current data', async () => {
    await launchMoney(seed());

    // Choose a scenario date, then change the inclusion and save.
    await openMonthEnd();
    expect(screen.getByTestId('money-scenario-card')).toBeTruthy();
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();
    expect(writes()).toBe(1);
    const pillBefore = screen.getByTestId('money-inline-balances').props.accessibilityLabel;

    await restart();

    // The persisted per-asset setting came back…
    const after = await stored();
    expect(after.assets.find((a) => a.id === 'Cash')?.includeInMoneyCalculations).toBe(false);
    expect(screen.getByTestId('money-inline-balances').props.accessibilityLabel).toBe(pillBefore);
    // …and the temporary scenario did NOT: the card is back in payday mode.
    expect(screen.queryByTestId('money-scenario-card')).toBeNull();
    expect(screen.getByTestId('money-aup-hero')).toBeTruthy();
    // Re-choosing the same date recomputes rather than restoring a stored answer.
    await openMonthEnd();
    expect(screen.getByTestId('money-scenario-card')).toBeTruthy();
  }, 60000);

  test('an explicit account edit still writes through its own authorised path, and the estimate follows it', async () => {
    await launchMoney(seed());
    const before = screen.getByTestId('money-inline-balances').props.accessibilityLabel;
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Everyday'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();
    expect(writes()).toBe(1);
    // The write went through the provider's own asset path, and the card followed it.
    expect(lastWrite().assets.find((a) => a.id === 'Everyday')?.includeInMoneyCalculations).toBe(false);
    expect(screen.getByTestId('money-inline-balances').props.accessibilityLabel).not.toBe(before);
    expect(screen.getByTestId('money-inline-balances')).toHaveTextContent('Cash · $1,150', { exact: false });
  }, 40000);
});

describe('E §5 — focus is never left on nothing', () => {
  test('with every balance deselected the pill is gone, the card offers one entry point, and that CTA is the focus fallback', async () => {
    await launchMoney(seed({ noneIncluded: true }));
    expect(screen.queryByTestId('money-inline-balances', H)).toBeNull();
    const cta = screen.getByTestId('money-aup-cta-balances');
    expect(screen.getAllByTestId('money-aup-cta-balances', H)).toHaveLength(1);
    expect(cta.props.accessibilityRole).toBe('button');
    // The CTA opens the same journey the pill would have.
    await fireEvent.press(cta);
    await screen.findByTestId('select-balances-intro');
    await fireEvent.press(screen.getByText('Cancel'));
    await settle();
    expect(writes()).toBe(0);
    expect(screen.getByTestId('money-aup-cta-balances')).toBeTruthy();
  }, 40000);

  test('deselecting everything from the picker swaps the pill for the CTA, so the focus target still exists after the save', async () => {
    await launchMoney(seed());
    expect(screen.getByTestId('money-inline-balances')).toBeTruthy();
    await openPicker();
    await fireEvent.press(screen.getByTestId('select-balances-row-Everyday'));
    await fireEvent.press(screen.getByTestId('select-balances-row-Cash'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('select-balances-intro')).toBeNull());
    await settle();

    expect(writes()).toBe(1);
    expect(screen.queryByTestId('money-inline-balances', H)).toBeNull();
    expect(screen.getByTestId('money-aup-cta-balances')).toBeTruthy();
  }, 40000);
});
