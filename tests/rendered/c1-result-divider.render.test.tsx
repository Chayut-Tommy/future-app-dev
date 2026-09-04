// Pass C.1 presentation — the shared result divider (§4/§8). One subtle
// divider between the two regions: vertical hairline in the row layout,
// horizontal rule when stacked, never both, never without a right region,
// from the shared border token.

import React from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import { CardResultRegions } from '../../src/components/money/CardResultRegions';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const rnActual = jest.requireActual('react-native');
const useWindowDimSpy = jest.spyOn(require('react-native'), 'useWindowDimensions');

let borderToken = '';
function BorderProbe() {
  borderToken = useTheme().semantic.border;
  return <Text testID="b">{borderToken}</Text>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <BorderProbe />
          {children}
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const L = { label: 'AVAILABLE', value: '$5,300', caption: 'Total remaining' };
const R = { label: 'ABOUT PER DAY', value: '$1,191', caption: 'For the next 4 days' };
const dividerStyle = () => StyleSheet.flatten(screen.getByTestId('card-result-divider', { includeHiddenElements: true }).props.style);

describe('Pass C.1 — shared result divider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useWindowDimSpy.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  });
  afterAll(() => useWindowDimSpy.mockRestore());

  test('row layout: a 1pt VERTICAL divider from the shared border token', async () => {
    await render(<Wrap><CardResultRegions left={L} right={R} /></Wrap>);
    const s = dividerStyle();
    expect(s.width).toBe(1);
    expect(s.height).toBeUndefined();
    expect(s.backgroundColor).toBe(borderToken);
    expect(screen.getAllByTestId('card-result-divider', { includeHiddenElements: true })).toHaveLength(1); // never both
  }, 30000);

  test('no right region → no divider', async () => {
    await render(<Wrap><CardResultRegions left={L} right={null} /></Wrap>);
    expect(screen.queryByTestId('card-result-divider', { includeHiddenElements: true })).toBeNull();
  }, 30000);

  test('shortfall variant still gets exactly one divider', async () => {
    await render(<Wrap><CardResultRegions left={{ label: 'ESTIMATED POSITION', value: '$9,850', caption: 'By 17 Sep' }} right={{ label: 'POTENTIAL SHORTFALL', value: '$180', caption: 'First expected on 24 Sep', tone: 'warning' }} /></Wrap>);
    expect(screen.getAllByTestId('card-result-divider', { includeHiddenElements: true })).toHaveLength(1);
    expect(dividerStyle().width).toBe(1);
  }, 30000);

  test('stacked layout (accessibility text scale): a 1pt HORIZONTAL divider, not vertical', async () => {
    useWindowDimSpy.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1.4 });
    await render(<Wrap><CardResultRegions left={L} right={R} /></Wrap>);
    const s = dividerStyle();
    expect(s.height).toBe(1);
    expect(s.width).toBe('100%');
    expect(screen.getAllByTestId('card-result-divider', { includeHiddenElements: true })).toHaveLength(1);
  }, 30000);

  test('narrow width also stacks to a horizontal divider', async () => {
    useWindowDimSpy.mockReturnValue({ width: 320, height: 700, scale: 2, fontScale: 1 });
    await render(<Wrap><CardResultRegions left={L} right={R} /></Wrap>);
    expect(dividerStyle().height).toBe(1);
  }, 30000);
});

// Keep a reference to the real module so the spy restores cleanly.
void rnActual;
void useWindowDimensions;
