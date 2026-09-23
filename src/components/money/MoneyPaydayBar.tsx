import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { ProgressBar } from '../shared/ProgressBar';
import { TimelineMarkerTrack, RAIL_HEIGHT } from './TimelineMarkerTrack';
import { TimelineRail } from '../../lib/calculations/timelineMarkers';
import { TimelineHitTargets } from './TimelineHitTargets';
import { ANCHORED_DETAIL_WIDTH, TimelineEventDetail } from './TimelineEventDetail';
import type { RailDetailFrame } from './FutureTimelineRail';
import { useTimelineSelection } from '../../hooks/useTimelineSelection';
import { AupRailGroup, BALANCE_PATH_MIN_TARGET, BalancePathHitTarget, buildAupRailGroups, describeAupHitTarget, resolveCalloutMode, resolveHitTargets } from '../../lib/calculations/balancePathInteraction';
import { toISODate } from '../../lib/calculations/localCalendar';
import { ESTIMATED_CYCLE_START_LABEL, PaydayProgress } from '../../lib/calculations/moneyComposition';
import { designLayout, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Design 5.1 Wave 6 — payday progress, directly attached to the Available
 * Until Payday hero.
 *
 * Every value comes from `progress`, which resolvePaydayProgress derived
 * from the SafeToSpendResult the hero is already showing. This component
 * performs NO date arithmetic and infers no payday: when none is recorded
 * it says so and shows no bar rather than filling an invented cycle.
 *
 * The bar is decorative — one composed sentence on the wrapper carries the
 * dates, the day count and the estimate caveat, so a screen reader gets
 * the whole state in one stop instead of three fragments. Nothing here
 * depends on an animation having run.
 */
export function MoneyPaydayBar({
  progress,
  rail,
  detailMaxHeight,
  onDetailFrame,
}: {
  progress: PaydayProgress;
  rail?: TimelineRail | null;
  /** Pass D.3 — the same D.1 dock-clearance contract the selected-date rail honours. */
  detailMaxHeight?: number;
  onDetailFrame?: (frame: RailDetailFrame) => void;
}) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [width, setWidth] = useState(0);
  const bandRef = useRef<View | null>(null);
  const detailRef = useRef<View | null>(null);
  const bandTop = useRef(0);
  const [detailTop, setDetailTop] = useState<number | null>(null);
  const [detailHeaderHeight, setDetailHeaderHeight] = useState(BALANCE_PATH_MIN_TARGET);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginTop: designSpacing.md },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: designSpacing.sm },
        titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm },
        title: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', flexShrink: 1 },
        daysLeft: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 0 },
        endpoint: { ...typeStyle('meta', locale), color: semantic.textSecondary, flexShrink: 1 },
        barWrap: { marginTop: designSpacing.sm, marginBottom: designSpacing.xs },
        // Pass D.3 — the marker band is the same 44pt press band the selected-date rail
        // uses; the track (unchanged glyphs, unchanged line) is centred inside it.
        band: { height: BALANCE_PATH_MIN_TARGET, justifyContent: 'center' },
        decor: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
        endBlock: { flexShrink: 1 },
        endBlockRight: { flexShrink: 1, alignItems: 'flex-end' },
        sublabel: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        unknown: { ...typeStyle('support', locale), color: semantic.textSecondary, minHeight: designLayout.touchTargetMin, paddingTop: designSpacing.sm },
      }),
    [semantic, locale]
  );

  // Pass D.3 (F4) — the pay-cycle markers become press targets through the SAME
  // slot rule, selection owner and detail surface as the selected-date rail. The
  // groups are the rail's own canonical events; nothing is re-enumerated here.
  const groups = useMemo(() => (rail ? buildAupRailGroups(rail) : []), [rail]);
  const targets = useMemo(() => resolveHitTargets({ markers: groups }, width), [groups, width]);
  const describe = useCallback((t: BalancePathHitTarget<AupRailGroup>) => describeAupHitTarget(t), []);
  const identity = rail ? `${toISODate(rail.startDate)}>${toISODate(rail.endDate)}` : 'none';
  const { selectedKey, selected, inspection, labels, toggle, close, clear, targetRefs } = useTimelineSelection(targets, describe, identity);

  const rowCount = inspection ? inspection.sections.reduce((n, s) => n + s.rows.length, 0) + inspection.sections.length : 0;
  const calloutMode = resolveCalloutMode({ plotWidth: width, fontScale, rowCount });
  const selectedCentre = selected ? selected.left + selected.width / 2 : 0;
  const anchoredWidth = Math.min(ANCHORED_DETAIL_WIDTH, width);
  const anchoredLeft = Math.min(Math.max(0, selectedCentre - anchoredWidth / 2), Math.max(0, width - anchoredWidth));
  const caretLeft = Math.min(Math.max(8, selectedCentre - anchoredLeft - 7), Math.max(8, anchoredWidth - 22));
  const detailChrome = detailHeaderHeight + designSpacing.md * 2 + 2 + designSpacing.sm + (calloutMode === 'anchored' ? 7 : 0);
  const betweenBandAndDetail = detailTop === null ? 0 : Math.max(0, detailTop - bandTop.current - BALANCE_PATH_MIN_TARGET);
  const detailBodyMaxHeight = detailMaxHeight === undefined ? undefined : Math.max(detailMaxHeight - betweenBandAndDetail - detailChrome, BALANCE_PATH_MIN_TARGET * 2);

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

  if (progress.unknown) {
    return (
      <View style={styles.block} accessible accessibilityLabel={progress.spoken} testID="money-payday-bar-unknown">
        <Text style={styles.unknown} importantForAccessibility="no">
          Next payday not recorded yet
        </Text>
      </View>
    );
  }

  const spoken = rail ? `${progress.spoken} ${rail.spoken}` : progress.spoken;

  return (
    <View style={styles.block} testID="money-payday-bar">
      {/* Wave 6 Correction C — the rail is NAMED. Pass D.3: this title row is the ONE
          summary element (the composed sentence lives here, as on the selected-date
          rail), so the press targets below it stay reachable to assistive technology. */}
      <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={spoken} testID="money-payday-bar-summary">
        <Text style={styles.title} importantForAccessibility="no">Pay cycle progress</Text>
        <Text style={styles.daysLeft} importantForAccessibility="no">
          {progress.daysRemaining} {progress.daysRemaining === 1 ? 'day' : 'days'} left
        </Text>
      </View>
      {rail ? (
        // Pass C.1 — the same elapsed-time bar, carrying event markers for the exact
        // commitments AUP subtracted plus the payday endpoint. Pass D.3 — each real
        // event marker is a press target; the decorative endpoint is not.
        <View
          ref={bandRef}
          style={styles.band}
          onLayout={(e) => {
            bandTop.current = e.nativeEvent.layout.y;
            setWidth(e.nativeEvent.layout.width);
          }}
          testID="money-payday-bar-band"
        >
          <View style={styles.decor} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <TimelineMarkerTrack rail={rail} elapsedFraction={progress.fraction} suppressA11y testID="money-payday-bar-markers" />
          </View>
          <TimelineHitTargets targets={targets} selected={selected} selectedKey={selectedKey} labels={labels} width={width} targetRefs={targetRefs} onToggle={toggle} onClear={clear} testID="money-payday-bar" />
        </View>
      ) : (
        <View style={styles.barWrap} importantForAccessibility="no-hide-descendants">
          <ProgressBar progress={progress.fraction} color={semantic.interactive} height={RAIL_HEIGHT} />
        </View>
      )}
      {/* Pass D.2 — the estimate qualification lives ON the endpoint it qualifies,
          stated once in words, instead of a detached caption under the bar. */}
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <View style={styles.endBlock}>
          <Text style={styles.endpoint}>{progress.startLabel}</Text>
          <Text style={styles.sublabel} testID="money-payday-bar-start-sublabel">{ESTIMATED_CYCLE_START_LABEL}</Text>
        </View>
        <View style={styles.endBlockRight}>
          <Text style={styles.endpoint}>{progress.endLabel}</Text>
          <Text style={styles.sublabel}>Payday</Text>
        </View>
      </View>
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
          testID="money-payday-bar"
        />
      ) : null}
    </View>
  );
}
