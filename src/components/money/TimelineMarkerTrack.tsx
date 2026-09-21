import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ProgressBar } from '../shared/ProgressBar';
import { RailMarkerKind, TimelineRail, resolveRailDensity } from '../../lib/calculations/timelineMarkers';
import { designSpacing } from '../../theme/semanticTokens';

/**
 * Pass C.1 — the event-aware pay-cycle / scenario timeline.
 *
 * A single decorative track carrying the markers the pure `timelineMarkers`
 * adapter produced. It performs NO date math and no financial logic: every
 * marker's position (0..1) and meaning already came from authoritative data.
 * Meaning is carried primarily by SHAPE, never colour alone (Design 5.1 +
 * WCAG 1.4.1): a filled green circle is included income, a gold diamond is a
 * scheduled bill/repayment deducted, a hollow green ring is the next payday
 * (explicitly NOT included), and an amber alert glyph is the first potential
 * shortfall.
 *
 * C1-01 — events on the SAME local day are drawn as ONE bounded cluster with
 * their glyphs side by side (never one covering another), centred on the date
 * coordinate and shifted inward at the track's edges so nothing is clipped at
 * the endpoint. The event date is never moved to another day. Each cluster is
 * a single accessibility group announcing its date and the kinds it holds;
 * when this track is embedded in a surface that already carries the composed
 * summary (MoneyPaydayBar in AUP mode), the clusters stay decorative instead.
 *
 * Pass C.2 closure — DENSITY. Long horizons (> 35 days) previously drew an
 * almost continuous line of glyphs. The pure `resolveRailDensity` adapter now
 * groups markers into 7-day bins for such spans: one bounded cluster per week
 * showing each KIND present once (circle for income, diamond for bills,
 * alert for a shortfall), centred on the week's midpoint. Nothing is dropped
 * from any calculation; the cluster's accessibility label carries the exact
 * counts, amounts and date range ("21 September to 27 September: 2 assumed
 * income payments totalling $6,000.00 and 3 bills or repayments totalling
 * -$1,300.00"). Short horizons keep exact per-date clusters. The owning card
 * discloses grouping ("Events grouped by week") beside the legend.
 *
 * Rail refinement — the markers are IN the line, not floating above it. Every
 * glyph's visual height equals the rail's visible height (`RAIL_HEIGHT`).
 */

/** The one governing dimension: rail height AND every marker's visual height. */
export const RAIL_HEIGHT = 8;
/** Rotated-square side whose diagonal equals RAIL_HEIGHT (so the diamond's
 * visual height matches the rail exactly). */
const DIAMOND_SIDE = RAIL_HEIGHT / Math.SQRT2;
const CLUSTER_GAP = 2;

function MarkerGlyph({ kind }: { kind: RailMarkerKind }) {
  const { semantic } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        circle: { width: RAIL_HEIGHT, height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, backgroundColor: semantic.success },
        diamond: { width: DIAMOND_SIDE, height: DIAMOND_SIDE, backgroundColor: semantic.warningAccent, transform: [{ rotate: '45deg' }], borderRadius: 1 },
        endpoint: { width: RAIL_HEIGHT, height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, borderWidth: 1.5, borderColor: semantic.success, backgroundColor: 'transparent' },
      }),
    [semantic]
  );

  switch (kind) {
    case 'income':
      return <View style={styles.circle} testID="timeline-marker-income" />;
    case 'expected_income':
      // Pass C.3 — expected income on the pay-cycle rail: a filled green circle
      // (a different shape from the hollow payday ring), labelled by its
      // cluster as "not included in Available until payday".
      return <View style={styles.circle} testID="timeline-marker-expected_income" />;
    case 'bill':
      return <View style={styles.diamond} testID="timeline-marker-bill" />;
    case 'payday_endpoint':
      return <View style={styles.endpoint} testID="timeline-marker-payday_endpoint" />;
    case 'shortfall':
      return <Ionicons name="alert-circle" size={RAIL_HEIGHT} color={semantic.warning} testID="timeline-marker-shortfall" />;
    default:
      return null;
  }
}

/** Pass C.5 — a pre-grouped cluster for the future-date timeline. The groups
 * come from the ONE inspection mapper (`balancePath`), so the glyphs drawn here
 * and the groups a customer can inspect can never disagree. */
export interface TimelineTrackCluster {
  key: string;
  /** 0..1 position along the rail. */
  position: number;
  kinds: RailMarkerKind[];
}

export function TimelineMarkerTrack({
  rail,
  clusters,
  elapsedFraction,
  remainderColor,
  showTodayTick = false,
  testID,
  suppressA11y = false,
}: {
  /** Payday / legacy scenario rails. Null when `clusters` is supplied. */
  rail: TimelineRail | null;
  /** Pass C.5 — pre-grouped clusters (future-date timeline). When present the
   * track draws exactly these and performs no grouping of its own. */
  clusters?: TimelineTrackCluster[];
  /** Pass C.5 — colour of the not-yet-elapsed remainder (pale Ocean Blue in
   * future-date mode). Omitted in payday mode, which is unchanged. */
  remainderColor?: string;
  /** Pass C.5 — a small tick where the elapsed segment ends (Today). */
  showTodayTick?: boolean;
  /** AUP mode only — the elapsed-time fill (0..1). Omitted in scenario mode,
   * where the track is a future-only span with no "progress" meaning. */
  elapsedFraction?: number;
  testID?: string;
  /** When embedded in a surface that already carries the composed spoken
   * summary (e.g. MoneyPaydayBar), suppress this track's own a11y so a
   * screen reader gets exactly one summary, not two. */
  suppressA11y?: boolean;
}) {
  const { semantic } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  // Exact per-date clusters (C1-01) or weekly bins (C.2 closure) — decided by
  // the pure adapter from the rail's span; nothing is dropped either way.
  const density = useMemo(() => (rail ? resolveRailDensity(rail) : null), [rail]);
  const drawn = useMemo(
    () =>
      clusters
        ? clusters.map((c) => ({ key: c.key, position: c.position, label: '', glyphs: c.kinds.map((k) => ({ key: k, kind: k })) }))
        : (density?.bins ?? []).map((bin) => ({
            key: bin.key,
            position: bin.position,
            label: bin.label,
            // Exact mode draws every marker in the cluster (C1-01); weekly mode
            // draws each KIND present once so a week reads as its categories.
            glyphs: density!.mode === 'weekly' ? bin.kinds.map((k) => ({ key: k as string, kind: k })) : bin.markers.map((m) => ({ key: m.key, kind: m.kind })),
          })),
    [clusters, density]
  );
  const weeklyMode = !clusters && density?.mode === 'weekly';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { minHeight: RAIL_HEIGHT + designSpacing.md, justifyContent: 'center' },
        barWrap: { height: RAIL_HEIGHT, justifyContent: 'center' },
        markerLayer: { ...StyleSheet.absoluteFillObject },
        cluster: {
          position: 'absolute',
          top: '50%',
          marginTop: -RAIL_HEIGHT / 2,
          height: RAIL_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: CLUSTER_GAP,
        },
        glyphSlot: { width: RAIL_HEIGHT, height: RAIL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
      }),
    []
  );

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
  const clusterWidth = (n: number) => n * RAIL_HEIGHT + Math.max(0, n - 1) * CLUSTER_GAP;

  return (
    <View style={styles.wrap} testID={testID} accessibilityValue={weeklyMode ? { text: density?.disclosure ?? undefined } : undefined}>
      <View style={styles.barWrap}>
        <View importantForAccessibility="no-hide-descendants">
          <ProgressBar progress={elapsedFraction ?? 0} color={semantic.interactive} height={RAIL_HEIGHT} trackColor={remainderColor} />
        </View>
        <View style={styles.markerLayer} onLayout={onLayout} pointerEvents="box-none" testID={weeklyMode ? 'timeline-density-weekly' : 'timeline-density-exact'}>
          {showTodayTick && trackWidth > 0 && (elapsedFraction ?? 0) > 0 && (elapsedFraction ?? 0) < 1 ? (
            <View
              style={{ position: 'absolute', top: -3, width: 2, height: RAIL_HEIGHT + 6, borderRadius: 1, left: Math.min(Math.max(0, (elapsedFraction ?? 0) * trackWidth - 1), trackWidth - 2), backgroundColor: semantic.interactive }}
              importantForAccessibility="no"
              testID="timeline-today-tick"
            />
          ) : null}
          {drawn.map((bin) => {
            const glyphs = bin.glyphs;
            const w = clusterWidth(glyphs.length);
            const positioned =
              trackWidth > 0
                ? { left: Math.min(Math.max(0, bin.position * trackWidth - w / 2), Math.max(0, trackWidth - w)) }
                : { left: (`${bin.position * 100}%` as unknown) as number, marginLeft: -w / 2 };
            return (
              <View
                key={bin.key}
                style={[styles.cluster, positioned]}
                testID={`timeline-cluster-${bin.key}`}
                {...(suppressA11y
                  ? { importantForAccessibility: 'no-hide-descendants' as const }
                  : { accessible: true, accessibilityLabel: bin.label })}
              >
                {glyphs.map((g) => (
                  <View key={g.key} style={styles.glyphSlot} importantForAccessibility="no">
                    <MarkerGlyph kind={g.kind} />
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
