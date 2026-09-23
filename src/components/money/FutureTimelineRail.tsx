import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { TimelineMarkerTrack, TimelineTrackCluster } from './TimelineMarkerTrack';
import { TimelineHitTargets } from './TimelineHitTargets';
import { ANCHORED_DETAIL_WIDTH, RailReviewRow, RailSourceReview, TimelineEventDetail } from './TimelineEventDetail';
import { useTimelineSelection } from '../../hooks/useTimelineSelection';
import { BalancePath, BalancePathMarkerGroup } from '../../lib/calculations/balancePath';
import { BALANCE_PATH_MIN_TARGET, BalancePathHitTarget, describeHitTarget, plotX, resolveCalloutMode, resolveHitTargets } from '../../lib/calculations/balancePathInteraction';
import { ESTIMATED_CYCLE_START_LABEL, formatMoneyDate } from '../../lib/calculations/moneyComposition';
import { LocalDate, localDatesEqual, toISODate } from '../../lib/calculations/localCalendar';
import { RailMarkerKind } from '../../lib/calculations/timelineMarkers';
import { sendFocusEvent } from '../../lib/a11yFocus';
import { designSpacing } from '../../theme/semanticTokens';
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

const KIND: Record<'income' | 'outgoing' | 'shortfall', RailMarkerKind> = { income: 'income', outgoing: 'bill', shortfall: 'shortfall' };
const asJsDate = (d: LocalDate) => new Date(d.year, d.month - 1, d.day);

export type { RailReviewRow, RailSourceReview } from './TimelineEventDetail';

/** Pass D.1 / D.3 — what the rail reports so the page can bring an opened detail
 * clear of the dock without losing the marker band: the detail's window frame and
 * the band's window top (`anchorY`). */
export interface RailDetailFrame {
  y: number;
  height: number;
  anchorY?: number;
}

export function FutureTimelineRail({
  path,
  testID,
  resolveReview,
  onReviewSource,
  focusRequest,
  detailMaxHeight,
  onDetailFrame,
}: {
  path: BalancePath;
  testID?: string;
  /** Pass D — returns the review affordance for a row, or null when its source cannot be reviewed. */
  resolveReview?: (row: RailReviewRow) => RailSourceReview | null;
  onReviewSource?: (row: RailReviewRow) => void;
  /** Pass D — after an editor closes, return focus to that row's action (or the heading if it is gone). */
  focusRequest?: { occurrenceId: string | null; nonce: number } | null;
  /** Pass D.1 — the tallest the detail may be (host-derived from the dock/safe-area geometry). */
  detailMaxHeight?: number;
  /** Pass D.1 — the detail's measured window frame, so the host can bring it clear of the dock. */
  onDetailFrame?: (frame: RailDetailFrame) => void;
}) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [width, setWidth] = useState(0);
  const reviewRefs = useRef(new Map<string, View | null>());
  const headingRef = useRef<View | null>(null);
  const bandRef = useRef<View | null>(null);
  const detailRef = useRef<View | null>(null);
  const [detailHeaderHeight, setDetailHeaderHeight] = useState(BALANCE_PATH_MIN_TARGET);
  // Pass D.3 (F5) — where the band and the detail sit inside this block, so the
  // host's bound can subtract everything BETWEEN them (endpoint and Today rows).
  const bandTop = useRef(0);
  const [detailTop, setDetailTop] = useState<number | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginTop: designSpacing.lg },
        titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm, flexWrap: 'wrap' },
        title: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', flexShrink: 1 },
        away: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 0 },
        band: { height: BALANCE_PATH_MIN_TARGET, justifyContent: 'center' },
        decor: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
        labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: designSpacing.sm },
        endBlock: { flexShrink: 1 },
        endBlockRight: { flexShrink: 1, alignItems: 'flex-end' },
        endpoint: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        sublabel: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        todayRow: { height: 20, marginTop: 2 },
        todayLabel: { ...typeStyle('meta', locale), color: semantic.interactive, fontWeight: '700', position: 'absolute', top: 0, width: 72, textAlign: 'center' },
      }),
    [semantic, locale]
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const clusters: TimelineTrackCluster[] = useMemo(() => path.markers.map((m) => ({ key: m.key, position: m.x, kinds: m.kinds.map((k) => KIND[k]) })), [path]);
  const targets = useMemo(() => resolveHitTargets(path, width), [path, width]);
  const describe = useCallback((t: BalancePathHitTarget<BalancePathMarkerGroup>) => describeHitTarget(t, path), [path]);
  // The selection belongs to ONE horizon: a new target (or as-of) date clears it.
  const identity = `${toISODate(path.asOf)}>${toISODate(path.target)}`;
  const { selectedKey, selected, inspection, labels, toggle, close, clear, targetRefs } = useTimelineSelection(targets, describe, identity);

  // Pass D — deterministic focus return: the row's own action if it survived the
  // edit, otherwise the timeline heading. Runs once per request.
  const handledFocusNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || handledFocusNonce.current === focusRequest.nonce) return;
    handledFocusNonce.current = focusRequest.nonce;
    const node = focusRequest.occurrenceId ? reviewRefs.current.get(focusRequest.occurrenceId) : null;
    sendFocusEvent({ current: node ?? headingRef.current });
  }, [focusRequest]);

  const rowCount = inspection ? inspection.sections.reduce((n, s) => n + s.rows.length, 0) + inspection.sections.length : 0;
  const calloutMode = resolveCalloutMode({ plotWidth: width, fontScale, rowCount });
  const selectedCentre = selected ? selected.left + selected.width / 2 : 0;
  const anchoredWidth = Math.min(ANCHORED_DETAIL_WIDTH, width);
  const anchoredLeft = Math.min(Math.max(0, selectedCentre - anchoredWidth / 2), Math.max(0, width - anchoredWidth));
  const caretLeft = Math.min(Math.max(8, selectedCentre - anchoredLeft - 7), Math.max(8, anchoredWidth - 22));
  // Pass D.1 — what is left for the rows once the pinned heading, the card's own
  // padding/border and the caret are taken out of the host's bound. Pass D.3 (F5):
  // the rows between the band and the detail (endpoints, Today) are taken out too,
  // so band + detail fit the clear viewport together. Never below two full 44pt rows.
  const detailChrome = detailHeaderHeight + designSpacing.md * 2 + 2 + designSpacing.sm + (calloutMode === 'anchored' ? 7 : 0);
  const betweenBandAndDetail = detailTop === null ? 0 : Math.max(0, detailTop - bandTop.current - BALANCE_PATH_MIN_TARGET);
  const detailBodyMaxHeight = detailMaxHeight === undefined ? undefined : Math.max(detailMaxHeight - betweenBandAndDetail - detailChrome, BALANCE_PATH_MIN_TARGET * 2);

  // Pass D.3 (F5) — report the frame ONCE per opened selection (never on later
  // re-layouts), so the page moves at most once and never fights a user scroll.
  const revealedKey = useRef<string | null>(null);
  const onDetailLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setDetailTop(e.nativeEvent.layout.y);
      if (!onDetailFrame || !selectedKey || revealedKey.current === selectedKey) return;
      revealedKey.current = selectedKey;
      const detail = detailRef.current;
      if (!detail) return;
      detail.measureInWindow((_x, y, _w, height) => {
        const band = bandRef.current;
        if (band) band.measureInWindow((_bx, by) => onDetailFrame({ y, height, anchorY: by }));
        else onDetailFrame({ y, height });
      });
    },
    [onDetailFrame, selectedKey]
  );
  useEffect(() => {
    if (!selectedKey) revealedKey.current = null;
  }, [selectedKey]);

  const { rail } = path;
  const startIsToday = localDatesEqual(rail.startDate, path.asOf);
  const todayPx = plotX(rail.todayX, width);
  const away = path.horizonDays === 1 ? 'Tomorrow' : `${path.horizonDays} days away`;

  return (
    <View style={styles.block} testID={testID ? `${testID}-container` : undefined}>
      {/* The ONE summary element (also the visible heading). */}
      <View ref={headingRef} style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={path.summary} accessibilityValue={path.disclosure ? { text: path.disclosure } : undefined} testID={testID}>
        <Text style={styles.title} maxFontSizeMultiplier={2} importantForAccessibility="no" testID={testID ? `${testID}-title` : undefined}>
          {path.title}
        </Text>
        <Text style={styles.away} maxFontSizeMultiplier={2} importantForAccessibility="no">
          {away}
        </Text>
      </View>

      <View
        ref={bandRef}
        style={styles.band}
        onLayout={(e) => {
          bandTop.current = e.nativeEvent.layout.y;
          onLayout(e);
        }}
        testID={testID ? `${testID}-band` : undefined}
      >
        {/* Decorative rail — the shared payday-bar primitive, hidden from AT. */}
        <View style={styles.decor} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID={testID ? `${testID}-decor` : undefined}>
          <TimelineMarkerTrack rail={null} clusters={clusters} elapsedFraction={rail.todayX} remainderColor={semantic.interactiveTint} showTodayTick suppressA11y testID={testID ? `${testID}-track` : undefined} />
        </View>
        <TimelineHitTargets targets={targets} selected={selected} selectedKey={selectedKey} labels={labels} width={width} targetRefs={targetRefs} onToggle={toggle} onClear={clear} testID={testID} />
      </View>

      {/* Endpoint labels — the same two-ended row the payday bar uses. */}
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.endBlock} testID={testID ? `${testID}-start` : undefined}>
          <Text style={styles.endpoint} maxFontSizeMultiplier={2}>{formatMoneyDate(asJsDate(rail.startDate))}</Text>
          <Text style={styles.sublabel} maxFontSizeMultiplier={2}>{startIsToday ? 'Today' : ESTIMATED_CYCLE_START_LABEL}</Text>
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

      {inspection ? (
        <TimelineEventDetail
          inspection={inspection}
          calloutMode={calloutMode}
          anchoredWidth={anchoredWidth}
          anchoredLeft={anchoredLeft}
          caretLeft={caretLeft}
          bodyMaxHeight={detailBodyMaxHeight}
          onClose={close}
          onHeaderHeight={setDetailHeaderHeight}
          wrapperRef={detailRef}
          onWrapperLayout={onDetailLayout}
          resolveReview={resolveReview}
          onReviewSource={onReviewSource}
          reviewRefs={reviewRefs}
          testID={testID}
        />
      ) : null}
    </View>
  );
}
