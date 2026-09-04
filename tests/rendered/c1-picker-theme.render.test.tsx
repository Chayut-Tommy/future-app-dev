// Pass C.1 closure — C1-04 (visible Cancel) and C1-05 (neutral date selection
// uses Ocean Blue, never success green). Renders the real DatePickerModal on
// the iOS surface and inspects the confirm/cancel actions and accent token.

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import { DatePickerModal } from '../../src/components/shared/DatePickerModal';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

let tokens: { interactive: string; accent: string } = { interactive: '', accent: '' };
function TokenProbe() {
  const { semantic, colors } = useTheme();
  tokens = { interactive: semantic.interactive, accent: colors.accent };
  return <Text testID="tokens">{semantic.interactive}</Text>;
}

function Picker(props: Partial<React.ComponentProps<typeof DatePickerModal>>) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <TokenProbe />
          <DatePickerModal
            visible
            value={new Date(2026, 7, 16)}
            minimumDate={new Date(2026, 7, 16)}
            maximumDate={new Date(2026, 10, 13)}
            onChange={() => {}}
            onConfirm={() => {}}
            onCancel={() => {}}
            onClose={() => {}}
            {...props}
          />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Pass C.1 — C1-04 / C1-05 date picker cancel + neutral theme', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('a visible Cancel button is present, is a ≥44pt button, and routes to onCancel', async () => {
    let cancelled = 0;
    await render(<Picker onCancel={() => { cancelled++; }} onClose={() => { cancelled++; }} />);
    const cancel = await screen.findByTestId('date-picker-cancel');
    expect(cancel).toBeOnTheScreen();
    expect(cancel.props.accessibilityRole).toBe('button');
    const cancelStyle = StyleSheet.flatten(cancel.props.style);
    expect(cancelStyle.minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(cancel);
    expect(cancelled).toBe(1);
  }, 30000);

  test('the confirm (Done) action uses the Ocean Blue interactive token, NOT success green', async () => {
    await render(<Picker />);
    const done = await screen.findByTestId('date-picker-done');
    const doneStyle = StyleSheet.flatten(done.props.style);
    expect(doneStyle.backgroundColor).toBe(tokens.interactive);
    expect(doneStyle.backgroundColor).not.toBe(tokens.accent); // never the positive/success green
  }, 30000);

  test('the calendar accent (selected date / navigation emphasis) is the interactive token', async () => {
    await render(<Picker />);
    const picker = await screen.findByTestId('native-date-picker');
    expect(picker.props.accentColor).toBe(tokens.interactive);
    expect(picker.props.accentColor).not.toBe(tokens.accent);
  }, 30000);
});
