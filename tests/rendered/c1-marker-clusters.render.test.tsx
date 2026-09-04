// Pass C.1 closure — C1-01 (same-day marker clustering) and C1-02 (conditional
// shortfall legend). Renders the real TimelineMarkerTrack / TimelineLegend with
// hand-built rails so same-date positioning is exercised deterministically.

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TimelineMarkerTrack } from '../../src/components/money/TimelineMarkerTrack';
import { TimelineLegend } from '../../src/components/money/TimelineLegend';
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

const D = (y: number, m: number, d: number) => ({ year: y, month: m, day: d });
const marker = (kind: RailMarker['kind'], m: number, d: number, position: number, extra: Partial<RailMarker> = {}): RailMarker => ({
  key: `${kind}:${m}-${d}`,
  kind,
  position,
  date: D(2026, m, d),
  count: 1,
  included: kind !== 'payday_endpoint' && kind !== 'shortfall',
  label: kind,
  ...extra,
});
const rail = (markers: RailMarker[], mode: 'aup' | 'scenario' = 'scenario'): TimelineRail => ({
  mode,
  startDate: D(2026, 8, 31),
  endDate: D(2026, 9, 30),
  spanDays: 30,
  markers,
  spoken: 'test rail',
});

describe('Pass C.1 — C1-01 same-day marker clusters', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('income + bill on the same MIDDLE date render both glyphs in one cluster, neither hidden', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([marker('income', 9, 10, 0.33), marker('bill', 9, 10, 0.33)])} testID="rail" />
      </Wrap>
    );
    const cluster = await screen.findByTestId('timeline-cluster-2026-09-10', { includeHiddenElements: true });
    // Both distinct shapes are present as separate nodes (side by side, not one over the other).
    expect(within(cluster).getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(cluster).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeOnTheScreen();
  }, 30000);

  test('income + bill on the TARGET ENDPOINT still render both (cluster shifted inward, not clipped)', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([marker('income', 9, 30, 1), marker('bill', 9, 30, 1)])} testID="rail" />
      </Wrap>
    );
    const cluster = await screen.findByTestId('timeline-cluster-2026-09-30', { includeHiddenElements: true });
    expect(within(cluster).getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(cluster).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeOnTheScreen();
  }, 30000);

  test('a same-date cluster is ONE accessible group announcing its date and kinds', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([marker('income', 9, 10, 0.33), marker('bill', 9, 10, 0.33)])} testID="rail" />
      </Wrap>
    );
    expect(await screen.findByLabelText('10 September: assumed income and bills or repayments')).toBeOnTheScreen();
  }, 30000);

  test('a start-boundary cluster with three kinds stays bounded and all glyphs render', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([marker('income', 8, 31, 0), marker('bill', 8, 31, 0), marker('shortfall', 8, 31, 0)])} testID="rail" />
      </Wrap>
    );
    const cluster = await screen.findByTestId('timeline-cluster-2026-08-31', { includeHiddenElements: true });
    expect(within(cluster).getByTestId('timeline-marker-income', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(cluster).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(cluster).getByTestId('timeline-marker-shortfall', { includeHiddenElements: true })).toBeOnTheScreen();
  }, 30000);

  test('two same-type (aggregated) events remain one understandable marker with a count in the label', async () => {
    await render(
      <Wrap>
        <TimelineMarkerTrack rail={rail([marker('bill', 9, 10, 0.33, { count: 2, label: '2 payments on 2026-09-10 — -$1,000.00' })])} testID="rail" />
      </Wrap>
    );
    const cluster = await screen.findByTestId('timeline-cluster-2026-09-10', { includeHiddenElements: true });
    expect(within(cluster).getByTestId('timeline-marker-bill', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('10 September: bills or repayments')).toBeOnTheScreen();
  }, 30000);
});

describe('Pass C.1 — C1-02 conditional shortfall legend', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  test('a healthy scenario legend omits the potential-shortfall item', async () => {
    await render(
      <Wrap>
        <TimelineLegend mode="scenario" hasShortfall={false} />
      </Wrap>
    );
    expect(await screen.findByText('Assumed income')).toBeOnTheScreen();
    expect(screen.getByText(/Bills/)).toBeOnTheScreen();
    expect(screen.queryByTestId('timeline-legend-shortfall')).toBeNull();
    expect(screen.queryByText('Potential shortfall')).toBeNull();
  }, 30000);

  test('a shortfall scenario legend includes the caution marker and text', async () => {
    await render(
      <Wrap>
        <TimelineLegend mode="scenario" hasShortfall />
      </Wrap>
    );
    expect(await screen.findByTestId('timeline-legend-shortfall')).toBeOnTheScreen();
    expect(screen.getByText('Potential shortfall')).toBeOnTheScreen();
  }, 30000);
});
