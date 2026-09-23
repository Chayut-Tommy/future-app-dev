// Pass D0.1 — rendered proofs with the REAL provider, storage adapter and hydration.
//   §1 Income sources → Change main payday is ONE native sheet with internal views
//   §2 Main-payday selection is one durable, atomic, idempotent mutation
//   §3 an editor never re-renders as its Add form while it is being dismissed
//   §4 Select Balances uses the Design 5.1 type roles; behaviour unchanged
//   §5 deterministic timeout and late-write integrity
// NOT proven here: native slide/dim animation, real swipe gestures, VoiceOver speech.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, DurableWriteTimeout, durableWriteConfig, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { MoneyEngineCard } from '../../src/components/wealth/MoneyEngineCard';
import { SelectBalancesSheet } from '../../src/components/money/SelectBalancesSheet';
import { AddIncomeModal } from '../../src/components/income/AddIncomeModal';
import { useLatchedWhileHidden } from '../../src/hooks/useLatchedWhileHidden';
import { EDITOR_SAVE_FAILED_COPY, EDITOR_UNCONFIRMED_COPY } from '../../src/lib/editorCompletion';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { fontFamilyForWeight } from '../../src/theme/typography';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const TODAY = new Date(2026, 8, 21);
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => StyleSheet.flatten(st) as Record<string, unknown>;

function seedData(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'rental' } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset,
    { id: 'Rainy', type: 'savings', label: 'Rainy day', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 28), isFixed: false, active: true } as RecurringItem,
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true } as RecurringItem,
    { id: 'dividends', type: 'income', label: 'Dividends', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}

let api: ReturnType<typeof useAppState> | null = null;
type Surface = 'engine' | 'balances' | 'income-editor' | null;
let editorCloses = 0;
function Host({ surface }: { surface: Surface }) {
  const state = useAppState();
  api = state;
  const [balancesOpen, setBalancesOpen] = React.useState(true);
  // The exact host pattern that caused D01-01: hide the editor and clear its target in ONE update.
  const [editorOpen, setEditorOpen] = React.useState(true);
  const [editId, setEditId] = React.useState<string | null>('rental');
  if (state.isLoading) return <Text testID="probe-ready">loading</Text>;
  return (
    <>
      <Text testID="probe-ready">ready</Text>
      {surface === 'engine' ? <MoneyEngineCard data={state.data} /> : null}
      {surface === 'balances' ? <SelectBalancesSheet visible={balancesOpen} onClose={() => setBalancesOpen(false)} onAddBalance={() => {}} /> : null}
      {surface === 'income-editor' ? (
        <AddIncomeModal
          visible={editorOpen}
          editItem={editId ? state.data.recurringItems.find((r) => r.id === editId) ?? null : null}
          onClose={() => { editorCloses += 1; setEditorOpen(false); setEditId(null); }}
        />
      ) : null}
    </>
  );
}
function Tree({ surface }: { surface: Surface }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <Host surface={surface} />
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
let root: Awaited<ReturnType<typeof render>> | null = null;
async function launch(surface: Surface = null) {
  if (root) { await root.unmount(); root = null; }
  api = null; editorCloses = 0;
  root = await render(<Tree surface={surface} />);
  await waitFor(() => expect(screen.getByTestId('probe-ready')).toHaveTextContent('ready'));
  await settle();
}
async function seedAndLaunch(surface: Surface = null, data: AppData = seedData()) {
  if (root) { await root.unmount(); root = null; }
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await launch(surface);
}
afterEach(async () => { durableWriteConfig.timeoutMs = 20000; openGates.splice(0).forEach((r) => r()); await settle(60); setItem().mockClear(); if (root) { await root.unmount(); root = null; } });

const rejectNextWrite = () => setItem().mockImplementationOnce(() => Promise.reject(new Error('disk full')));
const openGates: (() => void)[] = [];
function gateNextWrite() {
  const real = setItem().getMockImplementation()!;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  openGates.push(() => release());
  setItem().mockImplementationOnce(async (k: string, v: string) => { await gate; return real(k, v); });
  return () => release();
}
/** The horizons a Main payday anchors. */
function horizons(d: AppData) {
  const s = computeSafeToSpend(d, TODAY);
  const asOf = localDate(2026, 9, 21); const target = localDate(2026, 10, 24);
  const look = computeLookAheadProjection(d, asOf, target);
  const guide = look.available ? computeDailyGuide(d, asOf, target, look) : null;
  return JSON.stringify({ main: d.user.mainPaydayIncomeId, nextPayday: d.user.nextPayday, payFrequency: d.user.payFrequency, cycleEnd: s.cycleEnd.toISOString(), daysRemaining: s.daysRemaining, look: look.available ? look.targetCents : null, guide: guide?.displayCents ?? null });
}
/** Native sheet hosts currently presented (a Modal with visible === true). */
const presentedHosts = () => (screen as any).root.queryAll((i: any) => i.props?.visible === true && typeof i.props?.onRequestClose === 'function').length;
const primaries = (d: AppData) => d.recurringItems.filter((r) => r.id === d.user.mainPaydayIncomeId).length;

describe('D0.1 §1 — Income sources is one continuous sheet', () => {
  let announce: jest.SpyInstance; let focus: jest.SpyInstance;
  beforeEach(() => { announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {}); focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {}); });
  afterEach(() => { announce.mockRestore(); focus.mockRestore(); });

  test('Change main payday swaps content inside the SAME host: never zero hosts, never two; Back returns; nothing is written', async () => {
    const user = userEvent.setup();
    await seedAndLaunch('engine');
    await user.press(await screen.findByText('Monthly income'));
    expect(await screen.findByText('💼 Income sources')).toBeOnTheScreen();
    expect(presentedHosts()).toBe(1);
    const w = writes();
    // Rapid taps cannot duplicate the transition.
    const change = screen.getByTestId('options-sheet-row-main-payday');
    await user.press(change);
    expect(screen.getByText('Choose your main payday')).toBeOnTheScreen(); // same tick: no dismissal in between
    expect(presentedHosts()).toBe(1);
    expect(screen.queryByText('💼 Income sources')).toBeNull();
    expect(screen.getByTestId('options-sheet-row-rental').props.accessibilityLabel).toMatch(/^Rental income\. \$3,000 · .*Main payday$/);
    expect(focus).toHaveBeenCalledTimes(1); // the new view's heading, once
    expect(screen.getByTestId('options-sheet-cancel').props.accessibilityLabel).toBe('Back');
    // Back → Income sources, still the same host, still zero writes.
    await user.press(screen.getByTestId('options-sheet-cancel'));
    expect(screen.getByText('💼 Income sources')).toBeOnTheScreen();
    expect(presentedHosts()).toBe(1);
    expect(focus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('options-sheet-cancel').props.accessibilityLabel).toBe('Cancel');
    // Full dismissal; the next opening starts on Income sources again.
    await user.press(screen.getByTestId('options-sheet-row-main-payday'));
    await user.press(screen.getByTestId('options-sheet-cancel')); // Back
    await user.press(screen.getByTestId('options-sheet-cancel')); // Cancel
    await settle(400);
    expect(writes()).toBe(w);
    expect(api!.data.user.mainPaydayIncomeId).toBe('rental');
  }, 60000);
});

describe('D0.1 §2 — Main-payday selection: one durable, atomic, idempotent mutation', () => {
  let announce: jest.SpyInstance;
  beforeEach(() => { announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {}); });
  afterEach(() => announce.mockRestore());
  async function openChooser() {
    const user = userEvent.setup();
    await user.press(await screen.findByText('Monthly income'));
    await user.press(await screen.findByTestId('options-sheet-row-main-payday'));
    await screen.findByText('Choose your main payday');
    return user;
  }

  test('rejected → previous primary everywhere (memory, horizons, storage, restart); retry → pending, ONE write, one close, one success; survives restart', async () => {
    await seedAndLaunch('engine');
    const before = horizons(api!.data); const storedBefore = await AsyncStorage.getItem(STORAGE_KEY);
    const user = await openChooser();
    rejectNextWrite();
    await user.press(screen.getByTestId('options-sheet-row-salary'));
    expect(await screen.findByTestId('options-sheet-status-error')).toHaveTextContent(EDITOR_SAVE_FAILED_COPY, { exact: false });
    expect(screen.getByText('Choose your main payday')).toBeOnTheScreen(); // chooser stays open
    expect(horizons(api!.data)).toBe(before); // AUP and Look Ahead stay on their previous horizons
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(storedBefore);
    // A later unrelated write cannot carry it; a restart shows the previous primary.
    await act(async () => { api!.updateUser({ name: 'Later' }); });
    await settle();
    expect((await stored()).user.mainPaydayIncomeId).toBe('rental');
    await launch('engine');
    expect(horizons(api!.data)).toBe(before);

    // Retry, held pending.
    announce.mockClear();
    const again = await openChooser();
    const release = gateNextWrite();
    const w = writes();
    await again.press(screen.getByTestId('options-sheet-row-salary'));
    expect(await screen.findByTestId('options-sheet-status-pending')).toHaveTextContent('Saving…');
    expect(screen.getByTestId('options-sheet-row-dividends').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await again.press(screen.getByTestId('options-sheet-row-dividends')); // duplicate selection refused
    await again.press(screen.getByTestId('options-sheet-cancel')); // unsafe dismissal refused
    expect(screen.getByText('Choose your main payday')).toBeOnTheScreen();
    expect(api!.data.user.mainPaydayIncomeId).toBe('rental'); // not yet — persistence first
    expect(announce.mock.calls.filter((c) => /Main payday updated/i.test(String(c[0]))).length).toBe(0);
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText('Choose your main payday')).toBeNull());
    expect(writes()).toBe(w + 1); // ONE logical durable mutation
    expect(api!.data.user.mainPaydayIncomeId).toBe('salary');
    expect(primaries(api!.data)).toBe(1); // exactly one primary source
    expect(horizons(api!.data)).not.toBe(before);
    expect(announce.mock.calls.filter((c) => c[0] === 'Saving…')).toHaveLength(1);
    await settle();
    await launch('engine');
    expect(api!.data.user.mainPaydayIncomeId).toBe('salary');
    expect(primaries(api!.data)).toBe(1);
  }, 120000);

  test('choosing the CURRENT source is a clean no-op: no write, no success message, the only primary is never removed', async () => {
    await seedAndLaunch('engine');
    const before = horizons(api!.data);
    const user = await openChooser();
    const w = writes();
    await user.press(screen.getByTestId('options-sheet-row-rental'));
    await waitFor(() => expect(screen.queryByText('Choose your main payday')).toBeNull());
    await settle();
    expect(writes()).toBe(w);
    expect(horizons(api!.data)).toBe(before);
    expect(primaries(api!.data)).toBe(1);
    expect(announce.mock.calls.some((c) => /updated/i.test(String(c[0])))).toBe(false);
  }, 60000);

  test('the provider action itself: atomic, idempotent, refuses ineligible ids without writing; the income editor option rides the same owner', async () => {
    await seedAndLaunch();
    const w = writes();
    await act(async () => { await api!.setMainPaydayIncome('rental'); }); // already main
    expect(writes()).toBe(w);
    for (const bad of ['rent', 'nope']) {
      let refused = false;
      await act(async () => { await api!.setMainPaydayIncome(bad).catch(() => { refused = true; }); });
      expect(refused).toBe(true);
    }
    expect(writes()).toBe(w);
    // Two rapid selections: serialised, one primary, memory = storage.
    await act(async () => { await Promise.all([api!.setMainPaydayIncome('salary'), api!.setMainPaydayIncome('dividends')]); });
    expect(api!.data.user.mainPaydayIncomeId).toBe('dividends');
    expect(primaries(api!.data)).toBe(1);
    expect((await stored()).user.mainPaydayIncomeId).toBe('dividends');
    // The editor's "Use as my main payday" is the same write-first contract.
    rejectNextWrite();
    let rejected = false;
    await act(async () => { await api!.updateRecurringItem('salary', { amount: 4100 }, { setAsMainPayday: true }).catch(() => { rejected = true; }); });
    expect(rejected).toBe(true);
    expect([api!.data.user.mainPaydayIncomeId, api!.data.recurringItems.find((r) => r.id === 'salary')!.amount]).toEqual(['dividends', 4000]);
    await act(async () => { await api!.updateRecurringItem('salary', { amount: 4100 }, { setAsMainPayday: true }); });
    expect([api!.data.user.mainPaydayIncomeId, api!.data.recurringItems.find((r) => r.id === 'salary')!.amount]).toEqual(['salary', 4100]);
    await launch();
    expect(api!.data.user.mainPaydayIncomeId).toBe('salary');
  }, 60000);
});

describe('D0.1 §3 — no Add form flashes while an editor is dismissed', () => {
  test('Save with "Use as my main payday": the closing editor keeps its Edit identity, closes once, never shows "Add income source"', async () => {
    const user = userEvent.setup();
    await seedAndLaunch('income-editor', (() => { const d = seedData(); d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user; return syncIncomeAggregate(d); })());
    expect(await screen.findByText('Edit income source')).toBeOnTheScreen();
    await user.press(screen.getByTestId('income-main-payday-toggle'));
    const seen: string[] = [];
    const sample = () => { if (screen.queryByText('Add income source')) seen.push('ADD'); };
    const release = gateNextWrite();
    await user.press(screen.getByTestId('income-editor-save'));
    expect(await screen.findByTestId('income-editor-status-pending')).toHaveTextContent('Saving…');
    sample();
    await act(async () => { release(); });
    await waitFor(() => expect(editorCloses).toBe(1));
    sample();
    // (Jest's Modal renders nothing once hidden, so the closing frames are proven on the latch itself below.)
    await settle(300);
    sample();
    expect(seen).toEqual([]);
    expect(editorCloses).toBe(1);
    expect(api!.data.user.mainPaydayIncomeId).toBe('rental');
  }, 60000);
});

describe('D0.1 §3b — the latch that keeps a closing editor on what it was presented with', () => {
  test('hide + clear target in ONE update → still the presented value; adopts the new value only when next presented', async () => {
    const seenValues: (string | null)[] = [];
    function Probe({ visible, value }: { visible: boolean; value: string | null }) {
      const latched = useLatchedWhileHidden(visible, value);
      seenValues.push(latched);
      return <Text testID="latched">{String(latched)}</Text>;
    }
    const view = await render(<Probe visible value="rental" />);
    await view.rerender(<Probe visible={false} value={null} />); // exactly what every host does on close
    expect(screen.getByTestId('latched')).toHaveTextContent('rental');
    await view.rerender(<Probe visible={false} value={null} />);
    expect(screen.getByTestId('latched')).toHaveTextContent('rental');
    await view.rerender(<Probe visible value={null} />); // next presentation: Add
    expect(screen.getByTestId('latched')).toHaveTextContent('null');
    await view.rerender(<Probe visible value="salary" />);
    expect(screen.getByTestId('latched')).toHaveTextContent('salary');
    expect(seenValues.includes(null) && seenValues.indexOf(null) < seenValues.indexOf('rental')).toBe(false); // never null while closing
    await view.unmount();
  });
  test('all four shared editors read their edit target through the latch', () => {
    const { readFileSync } = require('fs'); const { join } = require('path');
    for (const [file, line] of [
      ['income/AddIncomeModal.tsx', 'const editItem = useLatchedWhileHidden(visible, editItemProp);'],
      ['money/AddRecurringItemModal.tsx', 'const editItem = useLatchedWhileHidden(visible, editItemProp);'],
      ['credit/AddCreditCardModal.tsx', 'const editCard = useLatchedWhileHidden(visible, editCardProp);'],
      ['wealth/AddWealthItemModal.tsx', 'const editLiability = useLatchedWhileHidden(visible, editLiabilityProp);'],
      ['wealth/AddWealthItemModal.tsx', 'const editAsset = useLatchedWhileHidden(visible, editAssetProp);'],
    ]) expect(readFileSync(join(__dirname, '../../src/components', file), 'utf8').includes(line)).toBe(true);
  });
});

describe('D0.1 §4 — Select Balances typography', () => {
  afterAll(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 2 }, screen: { width: 390, height: 844, scale: 3, fontScale: 2 } } as any));
  test('every body text style resolves to the Design 5.1 Figtree roles; behaviour, targets and semantics unchanged; toggle then Cancel changes nothing', async () => {
    const user = userEvent.setup();
    Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } } as any);
    await seedAndLaunch('balances');
    const regular = fontFamilyForWeight(400, 'en'); const semibold = fontFamilyForWeight(600, 'en');
    // D.5 — the WHOLE row is now one accessible checkbox, so its inner text is hidden
    // from assistive technology by design; the typography contract below still applies
    // to those nodes, so they are queried with hidden elements included.
    const HIDDEN = { includeHiddenElements: true };
    const row = await screen.findByTestId('select-balances-row-Main');
    const name = within(row).getByText('Main-CBA', HIDDEN);
    const rowValue = within(row).getByText('$10,650', HIDDEN); // the total row shows it too
    expect(flat(name.props.style)).toMatchObject({ fontFamily: semibold, fontSize: 14 });
    expect(flat(rowValue.props.style)).toMatchObject({ fontFamily: regular, fontSize: 13, fontVariant: ['tabular-nums'] });
    expect(flat(screen.getByText('Selected balance', HIDDEN).props.style).fontFamily).toBe(semibold);
    expect(flat(screen.getByText('+ Add a money balance', HIDDEN).props.style).fontFamily).toBe(semibold);
    for (const t of [name, rowValue, screen.getByText('Selected balance', HIDDEN), screen.getByText('+ Add a money balance', HIDDEN)]) {
      expect(t.props.numberOfLines).toBeUndefined(); // wraps at maximum Dynamic Type, never truncates
      expect(flat(t.props.style).fontFamily).toBeTruthy(); // never the platform default
    }
    // D.5 — one checkbox target per row, carrying the name and balance; the selection
    // state is exposed as state and echoed by a SHAPE (a filled check or an empty ring),
    // never by the words "Included"/"Excluded" or by colour alone.
    const toggle = row;
    expect(toggle.props.accessibilityRole).toBe('checkbox');
    expect(toggle.props.accessibilityLabel).toBe('Main-CBA, $10,650');
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    // The included and excluded rows render DIFFERENT glyphs, so selection is legible
    // without colour vision.
    const glyph = (id: string) => JSON.stringify(screen.getByTestId(`select-balances-mark-${id}`, HIDDEN).props.children);
    expect(screen.getByTestId('select-balances-row-Rainy').props.accessibilityState).toMatchObject({ checked: false });
    expect(glyph('Main')).not.toBe(glyph('Rainy'));
    expect(Number(flat(toggle.props.style).minWidth ?? 44)).toBeGreaterThanOrEqual(44);
    expect(Number(flat(toggle.props.style).minHeight)).toBeGreaterThanOrEqual(44);
    // Toggle then Cancel: nothing changes.
    const w = writes();
    await user.press(toggle);
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await settle(300);
    expect(api!.data.assets.find((a) => a.id === 'Main')!.includeInMoneyCalculations).toBe(true);
  }, 60000);
});

describe('D0.1 §5 — timeout and late-write integrity (deterministic)', () => {
  const addBill = (id: string) => api!.addRecurringItem({ type: 'expense', label: id, amount: 10, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true } as Omit<RecurringItem, 'id'>, { id });
  const has = (d: AppData, id: string) => d.recurringItems.some((r) => r.id === id);

  test('a write that times out and LATER lands cannot resurrect the mutation: storage is rewritten from accepted memory; all three agree', async () => {
    await seedAndLaunch();
    durableWriteConfig.timeoutMs = 40;
    const release = gateNextWrite();
    let error: unknown = null;
    await act(async () => { await addBill('late').catch((e) => { error = e; }); });
    expect(error).toBeInstanceOf(DurableWriteTimeout);
    expect(has(api!.data, 'late')).toBe(false); // nothing committed
    await act(async () => { release(); await settle(200); }); // the abandoned write now lands…
    expect(has(api!.data, 'late')).toBe(false);
    expect(has(await stored(), 'late')).toBe(false); // …and is reconciled away
    await launch();
    expect(has(api!.data, 'late')).toBe(false);
  }, 60000);

  test('a NEWER durable write is never overwritten by an older, timed-out one: the adapter lands writes strictly in issue order, so the newer snapshot is always last', async () => {
    await seedAndLaunch();
    durableWriteConfig.timeoutMs = 40;
    const releaseOld = gateNextWrite();
    await act(async () => { await addBill('old').catch(() => undefined); }); // times out, abandoned
    durableWriteConfig.timeoutMs = 20000;
    let newer: Promise<void>;
    await act(async () => { newer = addBill('newer'); await settle(80); });
    expect(has(api!.data, 'newer')).toBe(false); // queued behind the unsettled older write — cannot jump it
    await act(async () => { releaseOld(); await newer!; await settle(200); });
    expect([has(api!.data, 'old'), has(api!.data, 'newer')]).toEqual([false, true]);
    const s = await stored();
    expect([has(s, 'old'), has(s, 'newer')]).toEqual([false, true]); // the older result did not survive
    await launch();
    expect([has(api!.data, 'old'), has(api!.data, 'newer')]).toEqual([false, true]);
  }, 60000);

  test('if the compensating rewrite ALSO fails, memory adopts what storage now holds — memory, storage and rehydration still agree', async () => {
    await seedAndLaunch();
    durableWriteConfig.timeoutMs = 40;
    const release = gateNextWrite();
    rejectNextWrite(); // the compensating rewrite
    await act(async () => { await addBill('late').catch(() => undefined); });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { release(); await settle(250); });
    errors.mockRestore();
    expect(has(await stored(), 'late')).toBe(true); // storage could not be corrected
    expect(has(api!.data, 'late')).toBe(true); // so memory adopted it
    expect(api!.data.recurringItems.filter((r) => r.id === 'late')).toHaveLength(1);
    await launch();
    expect(api!.data.recurringItems.filter((r) => r.id === 'late')).toHaveLength(1);
  }, 60000);

  test('customer copy never claims "Nothing was changed" while the outcome is unknown; a retry after a timeout is idempotent', async () => {
    expect(EDITOR_UNCONFIRMED_COPY).toBe('This is taking longer than expected, so we couldn’t confirm it. Check whether it went through before trying again.');
    expect(/nothing was changed/i.test(EDITOR_UNCONFIRMED_COPY)).toBe(false);
    await seedAndLaunch();
    durableWriteConfig.timeoutMs = 40;
    const release = gateNextWrite();
    rejectNextWrite();
    await act(async () => { await addBill('twice').catch(() => undefined); });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { release(); await settle(250); });
    errors.mockRestore();
    durableWriteConfig.timeoutMs = 20000;
    const w = writes();
    await act(async () => { await addBill('twice'); }); // the customer retries the same draft
    expect(writes()).toBe(w); // already in place — nothing written
    expect(api!.data.recurringItems.filter((r) => r.id === 'twice')).toHaveLength(1);
  }, 60000);
});
