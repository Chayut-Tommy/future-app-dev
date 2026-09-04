import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ProgressBar } from '../shared/ProgressBar';
import { RailMarker, RailMarkerKind, TimelineRail } from '../../lib/calculations/timelineMarkers';
import { LocalDate, toISODate } from '../../lib/calculations/localCalendar';
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
 * a single accessibility group announcing its date and the kinds it holds
 * (e.g. "10 September: assumed income and bills or repayments"); when this
 * track is embedded in a surface that already carries the composed summary
 * (MoneyPaydayBar in AUP mode), the clusters stay decorative instead.
 *
 * Rail refinement — the markers are IN the line, not floating above it. Every
 * glyph's visual height equals the rail's visible height (`RAIL_HEIGHT`), and
 * every glyph is vertically centred on the rail, so the timeline reads as one
 * continuous line rather than a row of large symbols. The rail and the glyphs
 * are sized from ONE shared constant, so "marker height == rail height" holds
 * by construction. A ~6pt exact glyph reads as a dot on device, so the rail
 * and markers are adjusted TOGETHER to 8pt (the governing rule preserved): the
 * gold diamond is a rotated square whose DIAGONAL — its visual height — is
 * exactly `RAIL_HEIGHT`, so nothing is taller than the line.
 */

/** The one governing dimension: rail height AND every marker's visual height. */
export const RAIL_HEIGHT = 8;
/** Rotated-square side whose diagonal equals RAIL_HEIGHT (so the diamond's
 * visual height matches the rail exactly). */
const DIAMOND_SIDE = RAIL_HEIGHT / Math.SQRT2;
const CLUSTER_GAP = 2;
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Fixed left-to-right order within a cluster, so layout is deterministic. */
const KIND_ORDER: Record<RailMarkerKind, number> = { income: 0, bill: 1, shortfall: 2, payday_endpoint: 3 };

function kindPhrase(kind: RailMarkerKind): string {
  switch (kind) {
    case 'income':
      return 'assumed income';
    case 'bill':
      return 'bills or repayments';
    case 'shortfall':
      return 'a potential shortfall';
    case 'payday_endpoint':
      return 'your payday, not included';
  }
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function clusterLabel(date: LocalDate, kinds: RailMarkerKind[]): string {
  const dateLabel = `${date.day} ${MONTHS_FULL[date.month - 1]}`;
  return `${dateLabel}: ${joinAnd(kinds.map(kindPhrase))}`;
}

function MarkerGlyph({ kind }: { kind: RailMarkerKind }) {
  const { semantic } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Every glyph's visual height is RAIL_HEIGHT: the circle/ring by
        // diameter, the diamond by its rotated diagonal, the shortfall glyph
        // by its icon size.
        circle: { width: RAIL_HEIGHT, height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, backgroundColor: semantic.success },
        diamond: { width: DIAMOND_SIDE, height: DIAMOND_SIDE, backgroundColor: semantic.warningAccent, transform: [{ rotate: '45deg' }], borderRadius: 1 },
        endpoint: { width: RAIL_HEIGHT, height: RAIL_HEIGHT, borderRadius: RAIL_HEIGHT / 2, borderWidth: 1.5, borderColor: semantic.success, backgroundColor: 'transparent' },
      }),
    [semantic]
  );

  switch (kind) {
    case 'income':
      return <View style={styles.circle} testID="timeline-marker-income" />;
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

interface MarkerCluster {
  iso: string;
  date: LocalDate;
  position: number;
  markers: RailMarker[];
}

export function TimelineMarkerTrack({
  rail,
  elapsedFraction,
  testID,
  suppressA11y = false,
}: {
  rail: TimelineRail;
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

  // Group markers that fall on the SAME local day into one cluster (C1-01).
  const clusters = useMemo<MarkerCluster[]>(() => {
    const byDate = new Map<string, MarkerCluster>();
    for (const m of rail.markers) {
      const iso = toISODate(m.date);
      const existing = byDate.get(iso);
      if (existing) existing.markers.push(m);
      else byDate.set(iso, { iso, date: m.date, position: m.position, markers: [m] });
    }
    for (const c of byDate.values()) c.markers.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    return [...byDate.values()];
  }, [rail.markers]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Comfortable breathing room around a slim rail, with the rail (and its
        // in-line markers) vertically centred in the band.
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
    <View style={styles.wrap} testID={testID}>
      {/* Not itself an accessibility element: in scenario mode the per-date
          clusters below are the accessible groups (C1-01), and in AUP mode the
          embedding MoneyPaydayBar already carries the composed rail summary. */}
      <View style={styles.barWrap}>
        {/* The bar itself is decorative; only the marker clusters below carry
            accessibility. In AUP mode the clusters suppress their own a11y
            (the embedding MoneyPaydayBar owns the summary). */}
        <View importantForAccessibility="no-hide-descendants">
          <ProgressBar progress={elapsedFraction ?? 0} color={semantic.interactive} height={RAIL_HEIGHT} />
        </View>
        <View style={styles.markerLayer} onLayout={onLayout} pointerEvents="box-none">
          {clusters.map((c) => {
            const w = clusterWidth(c.markers.length);
            // Centre on the date coordinate, then clamp inward so the whole
            // cluster stays on the track — nothing is clipped at either edge.
            // Before the width is measured, fall back to a percentage anchor.
            const positioned =
              trackWidth > 0
                ? { left: Math.min(Math.max(0, c.position * trackWidth - w / 2), Math.max(0, trackWidth - w)) }
                : { left: (`${c.position * 100}%` as unknown) as number, marginLeft: -w / 2 };
            const kinds = c.markers.map((m) => m.kind);
            return (
              <View
                key={c.iso}
                style={[styles.cluster, positioned]}
                testID={`timeline-cluster-${c.iso}`}
                {...(suppressA11y
                  ? { importantForAccessibility: 'no-hide-descendants' as const }
                  : { accessible: true, accessibilityLabel: clusterLabel(c.date, kinds) })}
              >
                {c.markers.map((m) => (
                  <View key={m.key} style={styles.glyphSlot} importantForAccessibility="no">
                    <MarkerGlyph kind={m.kind} />
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
