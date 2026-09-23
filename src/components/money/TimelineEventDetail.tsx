import React, { useMemo } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { TimelineDetailBody } from './TimelineDetailBody';
import { BALANCE_PATH_MIN_TARGET, BalancePathInspection, InspectionRow } from '../../lib/calculations/balancePathInteraction';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** Pass D — what a detail row needs to offer "Review …" for its source. Resolved by
 * the owning screen from stable identity; the detail routes nothing itself. */
export interface RailSourceReview {
  label: string;
  accessibilityLabel: string;
  hint: string;
}
export interface RailReviewRow {
  occurrenceId: string;
  sourceId: string;
  sourceKind: InspectionRow['sourceKind'];
  dateLabel: string;
}

export const ANCHORED_DETAIL_WIDTH = 248;

/**
 * Pass D.3 — the ONE event-detail surface both marker rails present (C.4B inspection
 * card, Pass D review actions, D.1 pinned heading + bounded scrolling body). It is
 * handed an already-described inspection and renders it; no date or money logic.
 *
 * A pay-cycle detail carries a status line per row and no balance line; a
 * selected-date detail carries the Pass B end-of-day balance. The shape decides —
 * nothing here knows which rail it is on.
 */
export function TimelineEventDetail({
  inspection,
  calloutMode,
  anchoredWidth,
  anchoredLeft,
  caretLeft,
  bodyMaxHeight,
  onClose,
  onHeaderHeight,
  wrapperRef,
  onWrapperLayout,
  resolveReview,
  onReviewSource,
  reviewRefs,
  testID,
}: {
  inspection: BalancePathInspection;
  calloutMode: 'anchored' | 'inline';
  anchoredWidth: number;
  anchoredLeft: number;
  caretLeft: number;
  bodyMaxHeight?: number;
  onClose: () => void;
  onHeaderHeight: (height: number) => void;
  wrapperRef: React.RefObject<View | null>;
  onWrapperLayout: (e: LayoutChangeEvent) => void;
  resolveReview?: (row: RailReviewRow) => RailSourceReview | null;
  onReviewSource?: (row: RailReviewRow) => void;
  reviewRefs?: React.MutableRefObject<Map<string, View | null>>;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
        rowStatus: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        reviewAction: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, minHeight: designLayout.touchTargetMin, minWidth: designLayout.touchTargetMin, paddingRight: designSpacing.sm },
        reviewActionText: { ...typeStyle('meta', locale), color: semantic.interactive, fontWeight: '600' },
        summaryLine: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
        balanceLine: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', marginTop: designSpacing.xs },
        cautionLine: { ...typeStyle('support', locale), color: semantic.warning, marginTop: designSpacing.xs },
      }),
    [semantic, locale]
  );

  return (
    <View
      ref={wrapperRef}
      onLayout={onWrapperLayout}
      style={[styles.detailWrap, calloutMode === 'anchored' ? { width: anchoredWidth, marginLeft: anchoredLeft } : null]}
      testID={testID ? `${testID}-detail` : undefined}
      accessibilityLiveRegion="polite"
    >
      {calloutMode === 'anchored' ? <View style={[styles.caret, { marginLeft: caretLeft }]} importantForAccessibility="no" testID={testID ? `${testID}-detail-caret` : undefined} /> : null}
      <View style={styles.detailCard} testID={testID ? `${testID}-detail-${calloutMode}` : undefined}>
        <View style={styles.detailHeader} onLayout={(e) => onHeaderHeight(Math.max(e.nativeEvent.layout.height, BALANCE_PATH_MIN_TARGET / 2))}>
          <Text style={styles.detailTitle} accessibilityRole="header" maxFontSizeMultiplier={2} testID={testID ? `${testID}-detail-title` : undefined}>
            {inspection.title}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close event details" testID={testID ? `${testID}-detail-close` : undefined}>
            <Ionicons name="close" size={18} color={semantic.interactive} importantForAccessibility="no" />
          </TouchableOpacity>
        </View>
        {/* Pass D.1 — the heading and Close stay pinned; only the rows scroll, and only when they must. */}
        <TimelineDetailBody maxHeight={bodyMaxHeight} testID={testID ? `${testID}-detail-body` : undefined}>
          {inspection.sections.map((s) => (
            <View key={s.key} testID={`timeline-section-${s.key}`}>
              {inspection.sections.length > 1 ? (
                <Text style={styles.sectionHeading} maxFontSizeMultiplier={2}>
                  {s.heading}
                </Text>
              ) : null}
              {s.incomeTotal ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.incomeTotal}</Text> : null}
              {s.outgoingTotal ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.outgoingTotal}</Text> : null}
              {s.rows.map((r) => {
                // The row is ONE accessible element; its review action is a sibling so a
                // screen reader can reach it as its own button.
                const review = onReviewSource && resolveReview ? resolveReview(r) : null;
                const spokenAmount = r.amount.replace('+', 'plus ').replace('-', 'minus ');
                return (
                  <React.Fragment key={r.key}>
                    <View style={styles.row} accessible accessibilityLabel={`${r.label}: ${spokenAmount}. ${r.typeLabel}${r.statusLabel ? `. ${r.statusLabel}` : ''}`} testID={`timeline-row-${r.occurrenceId}`}>
                      <View style={styles.rowTop} importantForAccessibility="no-hide-descendants">
                        <Text style={styles.rowLabel} maxFontSizeMultiplier={2}>{r.label}</Text>
                        <Text style={styles.rowAmount} maxFontSizeMultiplier={2}>{r.amount}</Text>
                      </View>
                      <Text style={styles.rowType} maxFontSizeMultiplier={2} importantForAccessibility="no">{r.typeLabel}</Text>
                      {r.statusLabel ? (
                        <Text style={styles.rowStatus} maxFontSizeMultiplier={2} importantForAccessibility="no" testID={`timeline-row-status-${r.occurrenceId}`}>
                          {r.statusLabel}
                        </Text>
                      ) : null}
                    </View>
                    {/* Pass D — a SECONDARY action on each individual source. A grouped marker never
                        opens "the first" source: the customer picks the exact one. */}
                    {review ? (
                      <TouchableOpacity
                        ref={(node) => {
                          reviewRefs?.current.set(r.occurrenceId, node as unknown as View | null);
                        }}
                        style={styles.reviewAction}
                        onPress={() => onReviewSource?.(r)}
                        accessibilityRole="button"
                        accessibilityLabel={review.accessibilityLabel}
                        accessibilityHint={review.hint}
                        testID={`timeline-review-${r.occurrenceId}`}
                      >
                        <Text style={styles.reviewActionText} maxFontSizeMultiplier={2}>{review.label}</Text>
                        <Ionicons name="chevron-forward" size={14} color={semantic.interactive} importantForAccessibility="no" />
                      </TouchableOpacity>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {s.netLine ? <Text style={styles.summaryLine} maxFontSizeMultiplier={2}>{s.netLine}</Text> : null}
              {s.balanceLine ? <Text style={styles.balanceLine} maxFontSizeMultiplier={2}>{s.balanceLine}</Text> : null}
              {s.shortfallLine ? <Text style={styles.cautionLine} maxFontSizeMultiplier={2}>{s.shortfallLine}</Text> : null}
            </View>
          ))}
          {inspection.moreLine ? (
            <Text style={styles.summaryLine} maxFontSizeMultiplier={2} testID={testID ? `${testID}-detail-more` : undefined}>
              {inspection.moreLine}
            </Text>
          ) : null}
        </TimelineDetailBody>
      </View>
    </View>
  );
}
