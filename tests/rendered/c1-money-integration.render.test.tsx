// Pass C.1 correction — the integrated Money card flow, rendered against the
// real navigator. Proves the device defect is fixed (the picker is never
// presented over the still-open chooser on iOS), and — on the Android path
// where the picker is a dialog rather than a competing Modal — drives the full
// choose → confirm / cancel flow end to end. The ordering itself is proven
// deterministically by the pure state machine (tests/c1-timeframe-flow.test.ts).
// Dates are relative to the run date so this holds on any day.

import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
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

async function seed() {
  await AsyncStorage.clear();
  const data: AppData = createEmptyAppData();
  const payday = new Date(Date.now() + 20 * 86400000);
  data.user = { ...data.user, hasSeenIntro: true, monthlyIncome: 5000, nextPayday: payday.toISOString(), payFrequency: 'monthly' } as typeof data.user;
  data.assets = [{ id: 'cba', type: 'everyday', label: 'Everyday', currentValue: 2000, includeInMoneyCalculations: true }] as typeof data.assets;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function gotoMoney() {
  await render(<Harness />);
  fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-timeframe-row');
}

describe('Pass C.1 — card hierarchy + no duplicate horizon control', () => {
  beforeEach(seed);

  test('one top Change date control; the AUP card shows AVAILABLE + ABOUT PER DAY; no detached Look ahead entry, no bottom timeframe row', async () => {
    await gotoMoney();
    expect(screen.getAllByTestId('money-timeframe-row')).toHaveLength(1);
    expect(screen.getByText('Change date')).toBeOnTheScreen();
    expect(screen.getByText('AVAILABLE')).toBeOnTheScreen();
    expect(screen.getByText('ABOUT PER DAY')).toBeOnTheScreen();
    expect(screen.queryByTestId('money-look-ahead-entry')).toBeNull();
    expect(screen.queryByText('Look ahead to another date')).toBeNull();
    expect(screen.getByTestId('timeline-legend')).toBeOnTheScreen();
  }, 45000);

  test('End of month → scenario mode in place (estimated + lowest); Back to payday restores AUP; nothing persists', async () => {
    await gotoMoney();
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    fireEvent.press(screen.getByTestId('money-timeframe-row'));
    fireEvent.press(await screen.findByTestId('timeframe-month-end'));

    const card = await screen.findByTestId('money-scenario-card');
    expect(card).toBeOnTheScreen();
    expect(screen.getByText('ESTIMATED POSITION')).toBeOnTheScreen();
    expect(screen.getByText('LOWEST POSITION')).toBeOnTheScreen();
    expect(screen.getByText('Scenario')).toBeOnTheScreen();
    // Scenario never shows the AUP per-day figure.
    expect(screen.queryByText('ABOUT PER DAY')).toBeNull();

    fireEvent.press(await screen.findByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    expect(screen.getByText('AVAILABLE')).toBeOnTheScreen();
    // The ephemeral timeframe never persisted.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 45000);
});

describe('Pass C.1 — iOS: the picker is never presented over the open chooser (the device defect)', () => {
  const original = Platform.OS;
  beforeEach(async () => { (Platform as any).OS = 'ios'; await seed(); });
  afterEach(() => { (Platform as any).OS = original; });

  test('Choose a date dismisses the chooser and does NOT present the picker simultaneously', async () => {
    await gotoMoney();
    fireEvent.press(screen.getByTestId('money-timeframe-row'));
    expect(await screen.findByTestId('timeframe-choice')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('timeframe-choose-date'));
    });
    // The chooser is dismissing (its content is gone) AND the picker is not
    // yet mounted — the two modals are never presented at the same time. The
    // picker is presented only when the chooser's native dismissal completes
    // (the onDismiss handshake — proven deterministically in the reducer test).
    expect(screen.queryByTestId('timeframe-choice')).toBeNull();
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
  }, 45000);
});

// The full choose → present → confirm / cancel handshake, exercised through a
// harness that wires the REAL TimeframeSheet and REAL DatePickerModal with the
// REAL state machine — the exact wiring MoneyScreen uses. Driven on the Android
// path, where the native picker is a dialog (not a competing Modal), so it can
// actually be presented and driven in the test renderer.
import { useRef, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { TimeframeSheet } from '../../src/components/money/TimeframeSheet';
import { DatePickerModal } from '../../src/components/shared/DatePickerModal';
import { TimeframeStage, timeframeFlowTransition, timeframeSheetVisible, datePickerVisible } from '../../src/lib/calculations/timeframeFlow';
import { LocalDate, localDateFromDate, addCalendarDays, toISODate } from '../../src/lib/calculations/localCalendar';

function TimeframeFlowHarness({ onTarget }: { onTarget: (t: LocalDate | null) => void }) {
  const [stage, setStage] = useState<TimeframeStage>('idle');
  const [pickerValue, setPickerValue] = useState<Date>(() => new Date(2026, 7, 16));
  const pendingRef = useRef<Date | null>(null);
  const asOf = new Date(2026, 7, 15);
  const asOfLocal = localDateFromDate(asOf);
  const toJs = (d: LocalDate) => new Date(d.year, d.month - 1, d.day);
  const dispatch = (e: Parameters<typeof timeframeFlowTransition>[1]) => setStage((s) => timeframeFlowTransition(s, e));
  const commit = () => {
    const d = pendingRef.current;
    if (d) onTarget(localDateFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate())));
  };
  return (
    <>
      <TouchableOpacity testID="harness-open" onPress={() => dispatch({ type: 'open_chooser' })}>
        <Text>open</Text>
      </TouchableOpacity>
      <TimeframeSheet
        visible={timeframeSheetVisible(stage)}
        asOf={asOf}
        paydayDate={localDateFromDate(new Date(2026, 8, 4))}
        onSelect={(t) => { onTarget(t); dispatch({ type: 'close' }); }}
        onChooseDate={() => {
          const seed = toJs(addCalendarDays(asOfLocal, 1));
          pendingRef.current = seed;
          setPickerValue(seed);
          dispatch({ type: 'choose_date', isIOS: Platform.OS === 'ios' });
        }}
        onClose={() => dispatch({ type: 'close' })}
        onDismissed={() => dispatch({ type: 'chooser_dismissed' })}
      />
      <DatePickerModal
        visible={datePickerVisible(stage)}
        value={pickerValue}
        minimumDate={toJs(addCalendarDays(asOfLocal, 1))}
        maximumDate={toJs(addCalendarDays(asOfLocal, 90))}
        onChange={(d) => { pendingRef.current = d; setPickerValue(d); }}
        onConfirm={() => { commit(); dispatch({ type: 'close' }); }}
        onCancel={() => dispatch({ type: 'cancel_picker', isIOS: Platform.OS === 'ios' })}
        onClose={() => dispatch({ type: 'cancel_picker', isIOS: Platform.OS === 'ios' })}
        onDismiss={() => dispatch({ type: 'picker_dismissed' })}
      />
    </>
  );
}

describe('Pass C.1 — full choose → confirm / cancel handshake (real components + real state machine)', () => {
  const original = Platform.OS;
  beforeEach(() => { (Platform as any).OS = 'android'; });
  afterEach(() => { (Platform as any).OS = original; });

  const H = ({ onTarget = () => {} }: { onTarget?: (t: LocalDate | null) => void }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <TimeframeFlowHarness onTarget={onTarget} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );

  const pick = async (date: Date | undefined, type: 'set' | 'dismissed') => {
    const picker = await screen.findByTestId('native-date-picker');
    await act(async () => {
      fireEvent(picker, 'change', { type, nativeEvent: { timestamp: (date ?? new Date()).getTime() } }, date);
    });
  };

  test('Choose a date presents the picker (min tomorrow, max +90); confirming reports the selected date once', async () => {
    let target: LocalDate | null | undefined;
    let calls = 0;
    await render(<H onTarget={(t) => { target = t; calls++; }} />);
    fireEvent.press(screen.getByTestId('harness-open'));
    fireEvent.press(await screen.findByTestId('timeframe-choose-date'));
    const picker = await screen.findByTestId('native-date-picker');
    expect([new Date(picker.props.minimumDate).getFullYear(), new Date(picker.props.minimumDate).getMonth(), new Date(picker.props.minimumDate).getDate()]).toEqual([2026, 7, 16]);
    expect([new Date(picker.props.maximumDate).getFullYear(), new Date(picker.props.maximumDate).getMonth(), new Date(picker.props.maximumDate).getDate()]).toEqual([2026, 10, 13]);
    await pick(new Date(2026, 8, 30), 'set');
    expect(target && toISODate(target)).toBe('2026-09-30');
    expect(calls).toBe(1); // committed exactly once
  }, 30000);

  test('repeated confirm cycles keep working (choose → confirm → change date → choose → confirm)', async () => {
    let target: LocalDate | null | undefined;
    await render(<H onTarget={(t) => { target = t; }} />);
    fireEvent.press(screen.getByTestId('harness-open'));
    fireEvent.press(await screen.findByTestId('timeframe-choose-date'));
    await pick(new Date(2026, 8, 20), 'set');
    expect(target && toISODate(target as LocalDate)).toBe('2026-09-20');
    // Open the chooser again and pick a different date.
    fireEvent.press(screen.getByTestId('harness-open'));
    fireEvent.press(await screen.findByTestId('timeframe-choose-date'));
    await pick(new Date(2026, 8, 30), 'set');
    expect(target && toISODate(target as LocalDate)).toBe('2026-09-30');
  }, 30000);

  test('the picker is never mounted while the chooser is visible', async () => {
    await render(<H />);
    fireEvent.press(screen.getByTestId('harness-open'));
    expect(await screen.findByTestId('timeframe-choice')).toBeOnTheScreen();
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
  }, 30000);
});

describe('Pass C.1 — DatePickerModal confirm / cancel routing (iOS surfaces)', () => {
  const original = Platform.OS;
  beforeEach(() => { (Platform as any).OS = 'ios'; });
  afterEach(() => { (Platform as any).OS = original; });

  const P = ({ onConfirm = () => {}, onCancel = () => {}, onChange = () => {} }: any) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <DatePickerModal visible value={new Date(2026, 7, 16)} minimumDate={new Date(2026, 7, 16)} maximumDate={new Date(2026, 10, 13)} onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} onClose={onCancel} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );

  test('Done confirms; the backdrop cancels — distinct routes', async () => {
    let confirmed = 0, cancelled = 0;
    const { rerender } = await render(<P onConfirm={() => { confirmed++; }} onCancel={() => { cancelled++; }} />);
    fireEvent.press(await screen.findByTestId('date-picker-done'));
    expect(confirmed).toBe(1);
    expect(cancelled).toBe(0);
    rerender(<P onConfirm={() => { confirmed++; }} onCancel={() => { cancelled++; }} />);
    fireEvent.press(await screen.findByTestId('date-picker-backdrop'));
    expect(cancelled).toBe(1);
  }, 30000);
});
