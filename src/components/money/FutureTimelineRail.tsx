import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { TimelineMarkerTrack, TimelineTrackCluster } from './TimelineMarkerTrack';
import { BalancePath } from '../../lib/calculations/balancePath';
import { BALANCE_PATH_MIN_TARGET, BalancePathHitTarget, describeHitTarget, plotX, resolveCalloutMode, resolveHitTargets } from '../../lib/calculations/balancePathInteraction';
import { formatMoneyDate } from '../../lib/calculations/moneyComposition';
import { LocalDate, localDatesEqual, toISODate } from '../../lib/calculations/localCalendar';
import { RailMarkerKind } from '../../lib/calculations/timelineMarkers';
import { sendFocusEvent } from '../../lib/a11yFocus';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass C.5 — "Timeline to [date]": the future-date presentation of the ONE
 * Money card, in the accepted Pay cycle progress visual language.
 *
 * It replaces the C.3/C.4 monetary graph. It is a CALENDAR-TIME rail, not a
 * balance chart: the left end is the authoritative current pay-cycle start,
 * the right end is the selected date (sublabelled "Selected date", never
 * "Payday"), deep Ocean Blue runs from the cycle start to Today, and pale
 * Ocean Blue runs from Today to the selected date. It is never called "Pay
 * cycle progress" — a future horizon can span several paydays.
 *
 * ONE shared rail primitive. The line, the glyphs (green circle = assumed
 * income, gold diamond = bills and repayments, alert = first possible
 * shortfall — shape as well as colour) and their edge-safe clustering are the
 * SAME `TimelineMarkerTrack` the payday bar uses, so the two modes cannot
 * drift. This component adds only what the future mode needs: truthful labels
 * and the read-only inspection layer.
 *
 * ONE inspection implementation. Groups, exact-cent totals, end-of-day
 * balances, weekly buckets, collision slots, the 44pt targets and the detail
 * card all come from the graph-independent `balancePath` /
 * `balancePathInteraction` mappers (C.4), which read only the Pass B
 * projection and the canonical A3 occurrences. Nothing is enumerated,
 * summed or ordered here. Selection is component state: re-tap, Close, a tap
 * elsewhere on the rail, a target-date change and unmount (Back to payday) all
 * clear it; nothing is written and no editor opens. Nothing animates.
 *
 * Accessibility: the drawn rail is decorative and hidden. The heading row is
 * the one summary element; the targets follow it as real buttons in
 * chronological order with complete labels, a selected state and a hint;
 * opening a card is announced, and Close returns focus to the marker that
 * opened it. At accessibility text sizes or on a narrow rail the detail is a
 * full-width card; otherwise it is anchored under the marker.
 */

const ANCHORED_WIDTH = 248;
const HALO = 22;

const KIND: Record<'income' | 'outgoing' | 'shortfall', RailMarkerKind> = { income: 'income', outgoing: 'bill', shortfall: 'shortfall' };
const asJsDate = (d: LocalDate) => new Date(d.year, d.month - 1, d.day);

export function FutureTimelineRail({ path, testID }: { path: BalancePath; testID?: string }) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [width, setWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const targetRefs = useRef(new Map<string, View | null>());

  // The selection belongs to ONE horizon: a new target (or as-of) date clears it.
  const identity = `${toISODate(path.asOf)}>${toISODate(path.target)}`;
  useEffect(() => {
    setSelectedKey(null);
  }, [identity]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginTop: designSpacing.lg },
        titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm, flexWrap: 'wrap' },
        title: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', flexShrink: 1 },
        away: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 0 },
        band: { height: BALANCE_PATH_MIN_TARGET, justifyContent: 'center' },
        decor: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
        halo: { position: 'absolute', top: (BALANCE_PATH_MIN_TARGET - HALO) / 2, width: HALO, height: HALO, borderRadius: HALO / 2, borderWidth: 1.5, borderColor: semantic.interactive, backgroundColor: semantic.interactiveTint },
        backdrop: { ...StyleSheet.absoluteFillObject },
        target: { position: 'absolute', top: 0, height: BALANCE_PATH_MIN_TARGET },
        labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: designSpacing.sm },
        endBlock: { flexShrink: 1 },
        endBlockRight: { flexShrink: 1, alignItems: 'flex-end' },
        endpoint: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        sublabel: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        todayRow: { height: 20, marginTop: 2 },
        todayLabel: { ...typeStyle('meta', locale), color: semantic.interactive, fontWeight: '700', position: 'absolute', top: 0, width: 72, textAlign: 'center' },
        caption: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.xs },
        detailWrap: { marginTop: designSpacing.sm },
        caret: { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: semantic.interactive },
        detailCard: { borderRadius: designRadius.card, borderWidth: 1, borderColor: semantic.interactive, backgroundColor: semantic.bgSurface, padding: designSpacing.md },
        detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: designSpacing.sm },
        detailTitle: { ...typeStyle('titleCard', locale), color: semantic.textPrimary, flexShrink: 1 },
        closeButton: { minWidth: designLayout.touchTargetMin, minHeight: designLayout.touchTargetMin, alignItems: 'flex-end', justifyContent: 'flex-start' },
        sectionHeading: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', marginTop: designSpacing.sm },
        row: { marginTop: designSpacing.xs },
        rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm, flexWrap: 'wrap' },
        rowLabel: { ...typeStyle('support', locale), color: semantic.textPrimary, flexShrink: 1 },
        rowAmount: { ...typeStyle('figureRow', locale), color: semantic.textPrimary, flexShrink: 0 },
        rowType: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        summaryLine: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
        balanceLine: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', marginTop: designSpacing.xs },
        cautionLine: { ...typeStyle('support', locale), color: semantic.warning, marginTop: designSpacing.xs },
      }),
    [semantic, locale]
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const clusters: TimelineTrackCluster[] = useMemo(() => path.markers.map((m) => ({ key: m.key, position: m.x, kinds: m.kinds.map((k) => KIND[k]) })), [path]);
  const targets = useMemo(() => resolveHitTargets(path, width), [path, width]);
  const selected = useMemo(() => targets.find((t) => t.key === selectedKey) ?? null, [targets, selectedKey]);
  const inspection = useMemo(() => (selected ? describeHitTarget(selected, path) : null), [selected, path]);
  const labels = useMemo(() => new Map(targets.map((t) => [t.key, describeHitTarget(t, path).targetLabel])), [targets, path]);

  const close = useCallback(() => {
    const key = selectedKey;
    setSelectedKey(null);
    // Return assistive focus to the marker that opened the card.
    if (key) sendFocusEvent({ current: targetRefs.current.get(key) ?? null });
  }, [selectedKey]);
  const clear = useCallback(() => setSelectedKey(null), []);
  const toggle = useCallback(
    (t: BalancePathHitTarget) => {
      setSelectedKey((cur) => {
        if (cur === t.key) return null;
        AccessibilityInfo.announceForAccessibility(describeHitTarget(t, path).announcement);
        return t.key;
      });
    },
    [path]
  );

  const rowCount = inspection ? inspection.sections.reduce((n, s) => n + s.rows.length, 0) + inspection.sections.length : 0;
  const calloutMode = resolveCalloutMode({ plotWidth: width, fontScale, rowCount });
  const selectedCentre = selected ? selected.left + selected.width / 2 : 0;
  const anchoredWidth = Math.min(ANCHORED_WIDTH, width);
  const anchoredLeft = Math.min(Math.max(0, selectedCentre - anchoredWidth / 2), Math.max(0, width - anchoredWidth));
  const caretLeft = Math.min(Math.max(8, selectedCentre - anchoredLeft - 7), Math.max(8, anchoredWidth - 22));

  const { rail } = path;
  const startIsToday = localDatesEqual(rail.startDate, path.asOf);
  const todayPx = plotX(rail.todayX, width);
  const away = path.horizonDays === 1 ? 'Tomorrow' : `${path.horizonDays} days away`;

  return (
    <View style={styles.block} testID={testID ? `${testID}-container` : undefined}>
      {/* The ONE summary element (also the visible heading). */}
      <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={path.summary} accessibilityValue={path.disclosure ? { text: path.disclosure } : undefined} testID={testID}>
        <Text style={styles.title} maxFontSizeMultiplier={2} importantForAccessibility="no" testID={testID ? `${testID}-title` : undefined}>
          {path.title}
        </Text>
        <Text style={styles.away} maxFontSizeMultiplier={2} importantForAccessibility="no">
          {away}
        </Text>
      </View>

      <View style={styles.band} onLayout={onLayout} testID={testID ? `${testID}-band` : undefined}>
        {/* Decorative rail — the shared payday-bar primitive, hidden from AT. */}
        <View style={styles.decor} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID={testID ? `${testID}-decor` : undefined}>
          {selected && width > 0
            ? selected.groups.map((g) => (
                <View key={`halo-${g.key}`} style={[styles.halo, { left: Math.min(Math.max(0, plotX(g.x, width) - HALO / 2), Math.max(0, width - HALO)) }]} testID={`timeline-halo-${g.key}`} />
              ))
            : null}
          <TimelineMarkerTrack rail={null} clusters={clusters} elapsedFraction={rail.todayX} remainderColor={semantic.interactiveTint} showTodayTick suppressA11y testID={testID ? `${testID}-track` : undefined} />
        </View>

        {/* A tap elsewhere on the rail clears the selection. Close is the accessible dismissal. */}
        {selected ? <Pressable style={styles.backdrop} onPress={clear} accessible={false} importantForAccessibility="no" testID={testID ? `${testID}-backdrop` : undefined} /> : null}

        {/* Real, accessible press targets — one per slot, chronological, never overlapping. */}
        {targets.map((t) => {
          const isSelected = t.key === selectedKey;
          return (
            <Pressable
              key={t.key}
              ref={(node) => {
                targetRefs.current.set(t.key, node as unknown as View | null);
              }}
              style={[styles.target, { left: t.left, width: t.width }]}
              onPress={() => toggle(t)}
              accessibilityRole="button"
              accessibilityLabel={labels.get(t.key)}
              accessibilityHint={isSelected ? 'Hides the details for these scheduled events' : 'Shows the details for these scheduled events'}
              accessibilityState={{ selected: isSelected }}
              testID={`timeline-target-${t.key}`}
            />
          );
        })}
      </View>

      {/* Endpoint labels — the same two-ended row the payday bar uses. */}
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.endBlock} testID={testID ? `${testID}-start` : undefined}>
          <Text style={styles.endpoint} maxFontSizeMultiplier={2}>{formatMoneyDate(asJsDate(rail.startDate))}</Text>
          <Text style={styles.sublabel} maxFontSizeMultiplier={2}>{startIsToday ? 'Today' : 'Cycle start'}</Text>
        </View>
        <View style={styles.endBlockRight} testID={testID ? `${testID}-end` : undefined}>
          <Text style={styles.endpoint} maxFontSizeMultiplier={2}>{formatMoneyDate(asJsDate(rail.endDate))}</Text>
          <Text style={styles.sublabel} maxFontSizeMultiplier={2}>Selected date</Text>
        </View>
      </View>
      {!startIsToday && width > 0 ? (
        <View style={styles.todayRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={[styles.todayLabel, { left: Math.min(Math.max(0, todayPx - 36), Math.max(0, width - 72)) }]} maxFontSizeMultiplier={1.6} numberOfLines={1} testID={testID ? `${testID}-today` : undefined}>
            Today
          </Text>
        </View>
      ) : null}
      {rail.startIsCycleStart ? (
        <Text style={styles.caption} importantForAccessibility="no" maxFontSizeMultiplier={2}>
          Cycle start estimated
        </Text>
      ) : null}

      {inspection ? (
        <View style={[styles.detailWrap, calloutMode === 'anchored' ? { width: anchoredWidth, marginLeft: anchoredLeft } : null]} testID={testID ? `${testID}-detail` : undefined} accessibilityLiveRegion="polite">
          {calloutMode === 'anchored' ? <View style={[styles.caret, { marginLeft: caretLeft }]} importantForAccessibility="no" testID={testID ? `${testID}-detail-caret` : undefined} /> : null}
          <View style={styles.detailCard} testID={testID ? `${testID}-detail-${calloutMode}` : undefined}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle} accessibilityRole="header" maxFontSizeMultiplier={2} testID={testID ? `${testID}-detail-title` : undefined}>
                {inspection.title}
              </Text>
              <TouchableOpacity style={styles.closeButton} onPress={close} accessibilityRole="button" accessibilityLabel="Close event details" testID={testID ? `${testID}-detail-close` : undefined}>
                <Ionicons name="close" size={18} color={semantic.interactive} importantForAccessibility="no" />
              </TouchableOpacity>
            </View>
            {inspection.sections.map((s) => (
              <View key={s.key} testID={`timeline-section-${s.key}`}>
                {inspection.sections.length > 1 ? (
                  <Text style={styles.sectionHeading} maxFontSizeMultiplier={2}>
                    {s.heading}
                  </Text>
                ) : null}
                {s.incomeTotal ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.incomeTotal}</Text> : null}
                {s.outgoingTotal ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.outgoingTotal}</Text> : null}
                {s.rows.map((r) => (
                  <View key={r.key} style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.amount.replace('+', 'plus ').replace('-', 'minus ')}. ${r.typeLabel}`} testID={`timeline-row-${r.occurrenceId}`}>
                    <View style={styles.rowTop} importantForAccessibility="no-hide-descendants">
                      <Text style={styles.rowLabel} maxFontSizeMultiplier={2}>{r.label}</Text>
                      <Text style={styles.rowAmount} maxFontSizeMultiplier={2}>{r.amount}</Text>
                    </View>
                    <Text style={styles.rowType} maxFontSizeMultiplier={2} importantForAccessibility="no">{r.typeLabel}</Text>
                  </View>
                ))}
                {s.netLine ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.netLine}</Text> : null}
                <Text style={styles.balanceLine} maxFontSizeMultiplier={2}>{s.balanceLine}</Text>
                {s.shortfallLine ? <Text style={styles.cautionLine} maxFontSizeMultiplier={2}>{s.shortfallLine}</Text> : null}
              </View>
            ))}
            {inspection.moreLine ? (
              <Text style={styles.summaryLine} maxFontSizeMultiplier={2} testID={testID ? `${testID}-detail-more` : undefined}>
                {inspection.moreLine}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
