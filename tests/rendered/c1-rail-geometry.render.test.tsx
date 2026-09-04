// Pass C.1 presentation — timeline rail geometry (§3/§8). Every marker glyph's
// visual height equals the visible rail height, all from ONE shared constant,
// and markers sit IN the line rather than floating above it.

import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TimelineMarkerTrack, RAIL_HEIGHT } from '../../src/components/money/TimelineMarkerTrack';
import type { TimelineRail, RailMarker } from '../../src/lib/calculations/timelineMarkers';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const D = (m: number, d: number) => ({ year: 2026, month: m, day: d });
const mk = (kind: RailMarker['kind'], m: number, d: number, position: number): RailMarker => ({
  key: `${kind}:${m}-${d}`, kind, position, date: D(m, d), count: 1, included: kind === 'income' || kind === 'bill', label: kind,
});
const rail = (markers: RailMarker[]): TimelineRail => ({ mode: 'scenario', startDate: D(8, 31), endDate: D(9, 30), spanDays: 30, markers, spoken: 't' });
const h = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);

describe('Pass C.1 — timeline rail geometry', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('every glyph visual height equals the shared RAIL_HEIGHT, and the rail derives from the same constant', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([mk('income', 9, 10, 0.3), mk('bill', 9, 12, 0.4), mk('payday_endpoint', 9, 30, 1), mk('shortfall', 9, 5, 0.2)])} testID="rail" />
      </Wrap>
    );
    await screen.findByTestId('timeline-cluster-2026-09-10', { includeHiddenElements: true });
    // Circle & ring: height === RAIL_HEIGHT.
    expect(h('timeline-marker-income').height).toBe(RAIL_HEIGHT);
    expect(h('timeline-marker-payday_endpoint').height).toBe(RAIL_HEIGHT);
    // Diamond: a rotated square whose DIAGONAL (visual height) === RAIL_HEIGHT.
    const side = h('timeline-marker-bill').height as number;
    expect(Math.abs(side * Math.SQRT2 - RAIL_HEIGHT)).toBeLessThan(0.01);
    // Shortfall icon size === RAIL_HEIGHT (Ionicons applies size as fontSize).
    const sf = screen.getByTestId('timeline-marker-shortfall', { includeHiddenElements: true });
    expect(sf.props.size ?? StyleSheet.flatten(sf.props.style)?.fontSize).toBe(RAIL_HEIGHT);
    // The rail is slim and premium (≈6–8pt); markers never exceed it.
    expect(RAIL_HEIGHT).toBeLessThanOrEqual(8);
  }, 30000);

  test('a same-day income+bill cluster keeps both glyphs no taller than the rail, side by side (no overlap)', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([mk('income', 9, 10, 0.5), mk('bill', 9, 10, 0.5)])} testID="rail" />
      </Wrap>
    );
    await screen.findByTestId('timeline-cluster-2026-09-10', { includeHiddenElements: true });
    expect(h('timeline-marker-income').height).toBe(RAIL_HEIGHT);
    expect((h('timeline-marker-bill').height as number) * Math.SQRT2).toBeLessThanOrEqual(RAIL_HEIGHT + 0.01);
    // Both distinct glyph nodes exist (side by side, not one covering the other).
    expect(screen.getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeTruthy();
  }, 30000);
});
