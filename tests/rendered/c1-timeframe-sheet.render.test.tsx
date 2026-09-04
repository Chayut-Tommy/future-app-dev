// Pass C.1 correction — the Timeframe chooser. It no longer owns the native
// picker (that would present a second modal over this one); "Choose a date"
// now REQUESTS the picker via onChooseDate. Real KeyboardSheet; writes nothing.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TimeframeSheet } from '../../src/components/money/TimeframeSheet';
import { localDateFromDate, LocalDate } from '../../src/lib/calculations/localCalendar';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const localOf = (y: number, m: number, d: number) => localDateFromDate(new Date(y, m - 1, d));

function Harness({
  asOf,
  onSelect = () => {},
  onChooseDate = () => {},
}: {
  asOf: Date;
  onSelect?: (t: LocalDate | null) => void;
  onChooseDate?: () => void;
}) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <TimeframeSheet visible asOf={asOf} paydayDate={localOf(2026, 9, 10)} onSelect={onSelect} onChooseDate={onChooseDate} onClose={() => {}} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Pass C.1 — Timeframe chooser sheet', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('offers Until payday, End of this month (real date), Choose a date; nothing will be saved', async () => {
    await render(<Harness asOf={new Date(2026, 7, 15)} />);
    expect(await screen.findByTestId('timeframe-choice')).toBeOnTheScreen();
    expect(screen.getByText('Until payday')).toBeOnTheScreen();
    expect(screen.getByText('10 Sep 2026')).toBeOnTheScreen();
    expect(screen.getByText('End of this month')).toBeOnTheScreen();
    expect(screen.getByText('31 Aug 2026')).toBeOnTheScreen();
    expect(screen.getByText('Choose a date')).toBeOnTheScreen();
    expect(screen.getByText('Nothing will be saved.')).toBeOnTheScreen();
    // The chooser does NOT itself mount a native picker (no second modal).
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
  }, 30000);

  test('on month-end today, the quick choice becomes End of next month', async () => {
    await render(<Harness asOf={new Date(2026, 7, 31)} />);
    expect(await screen.findByText('End of next month')).toBeOnTheScreen();
    expect(screen.getByText('30 Sep 2026')).toBeOnTheScreen();
  }, 30000);

  test('"Until payday" reports null (reset to AUP), never a projected date', async () => {
    const user = userEvent.setup();
    let selected: LocalDate | null | undefined;
    await render(<Harness asOf={new Date(2026, 7, 15)} onSelect={(t) => { selected = t; }} />);
    await user.press(await screen.findByTestId('timeframe-until-payday'));
    expect(selected).toBeNull();
  }, 30000);

  test('"End of this month" reports the local end-of-month date', async () => {
    const user = userEvent.setup();
    let selected: LocalDate | null | undefined;
    await render(<Harness asOf={new Date(2026, 7, 15)} onSelect={(t) => { selected = t; }} />);
    await user.press(await screen.findByTestId('timeframe-month-end'));
    expect(selected).toEqual(localOf(2026, 8, 31));
  }, 30000);

  test('"Choose a date" requests the picker (does not open one inside this sheet)', async () => {
    const user = userEvent.setup();
    let requested = false;
    await render(<Harness asOf={new Date(2026, 7, 15)} onChooseDate={() => { requested = true; }} />);
    await user.press(await screen.findByTestId('timeframe-choose-date'));
    expect(requested).toBe(true);
    expect(screen.queryByTestId('native-date-picker')).toBeNull();
  }, 30000);

  test('choosing a timeframe writes nothing to persistence', async () => {
    const user = userEvent.setup();
    await render(<Harness asOf={new Date(2026, 7, 15)} />);
    await user.press(await screen.findByTestId('timeframe-month-end'));
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  }, 30000);
});
