import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CardResultRegions } from './CardResultRegions';
import { FutureTimelineRail, RailReviewRow, RailSourceReview } from './FutureTimelineRail';
import { TimelineLegend } from './TimelineLegend';
import { CardAction, CardActionGroup, CashPathStatus } from './MoneyCardLowerRegion';
import { buildBalancePath } from '../../lib/calculations/balancePath';
import { ProjectedEvent } from '../../lib/calculations/projectedEvents';
import { LookAheadPresentation, selectDailyGuidePresentation } from '../../lib/calculations/lookAheadPresentation';
import { VIEW_UPCOMING_EVENTS_SUBTITLE, VIEW_UPCOMING_EVENTS_TITLE, WHY_THIS_AMOUNT_SUBTITLE, WHY_THIS_AMOUNT_TITLE } from '../../lib/calculations/moneyComposition';
import { LookAheadResult } from '../../lib/calculations/lookAheadProjection';
import { DailyGuideResult } from '../../lib/calculations/dailyGuide';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { LocalDate } from '../../lib/calculations/localCalendar';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

const HERO_TILE_SIZE = 36;

/**
 * Pass C.1 / C.2 / C.3 — the selected-date ("Look ahead") presentation of the
 * ONE Money card.
 *
 * Rendered IN PLACE of the Available-Until-Payday hero when the customer has
 * chosen a specific date, inside the SAME Design 5.1 hero shell, so it reads
 * as the same card in a different mode — never a second card.
 *
 * C.2 (Specification v1.3 §5.4, §16): two amounts of equal standing —
 * LEFT "Estimated balance" (the projected balance at the selected date,
 * captioned "Before everyday spending") and RIGHT "About per day" (the
 * guarded, illustrative daily guide, captioned "For the next N days").
 *
 * C.5: the future-date drawing is ONE extended time rail in the accepted Pay
 * cycle progress language — "Timeline to [date]", from the authoritative
 * cycle start through Today to the selected date (see FutureTimelineRail). It
 * shows calendar time, not balance movement; the C.3/C.4 monetary graph is
 * retired. The customer's risk insight is unchanged: the cash-flow status
 * (no scheduled shortfall / lowest scheduled end-of-day balance / first
 * possible shortfall / a positive ending after an earlier shortfall) still
 * sits BELOW the rail and still comes from Pass B's complete daily cash path.
 * Complete occurrences stay in "View upcoming events". This
 * component owns NO maths: it never divides the estimated balance by the
 * number of days and never deducts the daily guide from the path.
 */
export function ScenarioPositionCard({
  presentation,
  result,
  guide,
  events,
  cycleStart = null,
  targetDateLabel,
  onOpenTimeframe,
  onWhyThisAmount,
  onBackToPayday,
  onViewUpcomingEvents,
  headingRef,
  resolveReview,
  onReviewSource,
  focusRequest,
  reviewNotice,
  detailMaxHeight,
  onDetailFrame,
  balancesSelector,
  whyActionRef,
}: {
  presentation: LookAheadPresentation;
  /** The Pass B projection for the selected date (or the unavailable result). */
  result: LookAheadResult;
  /** The C.2 guarded daily guide for the same date — null when the estimate
   * itself is unavailable. */
  guide: DailyGuideResult | null;
  /** The SAME canonical A3 event stream Pass B consumed
   * (`computeProjectedEvents(data, asOf, target, { windowStart: asOf })`), or
   * null when the estimate is unavailable. Read for marker grouping only. */
  events: ProjectedEvent[] | null;
  /** Pass C.5 — AUP's own authoritative current pay-cycle start (the left end
   * of the timeline). Null when no payday is known; the rail then starts at
   * today. Read only for positioning — never recomputed here. */
  cycleStart?: LocalDate | null;
  /** The selected-date label for the date subline, e.g. "Mon, 31 Aug 2026". */
  targetDateLabel: string;
  onOpenTimeframe: () => void;
  onWhyThisAmount: () => void;
  onBackToPayday: () => void;
  /** Pass C.3 — scrolls to the existing "What happens next" list, where every
   * occurrence behind the chart is listed in full. */
  onViewUpcomingEvents?: () => void;
  headingRef?: React.Ref<View>;
  /** Pass D — source review. All optional: without them the card is exactly as before. */
  resolveReview?: (row: RailReviewRow) => RailSourceReview | null;
  onReviewSource?: (row: RailReviewRow) => void;
  focusRequest?: { occurrenceId: string | null; nonce: number } | null;
  /** "Estimate updated" (after a durable Save/Delete) or the calm stale-source message. */
  reviewNotice?: string | null;
  /** Pass D.1 — forwarded to the timeline so its event detail stays clear of the dock. */
  detailMaxHeight?: number;
  onDetailFrame?: (frame: { y: number; height: number }) => void;
  /** Pass D.5 — the same compact inline balances control the payday card shows. */
  balancesSelector?: React.ReactNode;
  /** Pass D.5 — the explanation sheet returns assistive focus to this action. */
  whyActionRef?: React.Ref<View>;
}) {
  const { colors, semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const available = result.available;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        heroShell: {
          borderRadius: designRadius.hero,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
          padding: designLayout.heroPadding,
          marginBottom: designLayout.cardGap,
        },
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.md },
        identityTile: {
          width: HERO_TILE_SIZE,
          height: HERO_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        identityTitle: { ...typeStyle('titleSection', locale), color: semantic.interactive, flexShrink: 1 },
        dateControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: designSpacing.sm, marginTop: designSpacing.xs, flexWrap: 'wrap' },
        dateText: { ...typeStyle('titleSection', locale), color: semantic.textPrimary, flexShrink: 1 },
        changeDateButton: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, minHeight: designLayout.touchTargetMin, paddingHorizontal: designSpacing.sm },
        changeDateText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        provenance: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.sm },
        // Pass D.2 — the quiet tertiary foot of the card: the one-tap route back to
        // Available until payday, then the single provenance line. It never competes
        // with the two grouped information actions above it.
        tertiary: { marginTop: designSpacing.sm },
        backLink: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, alignSelf: 'flex-start', minHeight: designLayout.touchTargetMin, minWidth: designLayout.touchTargetMin },
        backLinkText: { ...typeStyle('support', locale), color: semantic.interactive },
        footProvenance: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        action: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, minHeight: designLayout.touchTargetMin },
        actionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        reviewNotice: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        unavailableBody: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.md },
      }),
    [colors, semantic, locale]
  );

  const guidePresentation = useMemo(() => (guide ? selectDailyGuidePresentation(guide) : null), [guide]);
  // Pass C.3 — the drawable forecast, mapped (never computed) from the Pass B
  // Pass D — the sources the engine itself named as the cause of an unavailable estimate.
  const correctionRows: RailReviewRow[] = useMemo(() => {
    if (result.available) return [];
    const seen = new Set<string>();
    const rows: RailReviewRow[] = [];
    for (const issue of result.issues) {
      if (!issue.sourceKind || !issue.sourceId) continue;
      const key = `${issue.sourceKind}:${issue.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ occurrenceId: '', sourceId: issue.sourceId, sourceKind: issue.sourceKind, dateLabel: '' });
    }
    return rows;
  }, [result]);

  // result and the canonical events. Null when the estimate is unavailable.
  const balancePath = useMemo(() => (result.available && events ? buildBalancePath(result, events, { cycleStart }) : null), [result, events, cycleStart]);

  // The two result regions (available only). LEFT is always the estimated
  // balance at the target (sign-aware) BEFORE everyday spending. RIGHT is the
  // guarded About-per-day guide — an amount, "$0", or a placeholder with the
  // reason — never a per-day figure derived from the left amount.
  const regions = useMemo(() => {
    if (!result.available) return null;
    const left = {
      label: 'ESTIMATED BALANCE',
      value: formatCentsCentsAware(result.targetCents),
      caption: 'Before everyday spending',
      tone: (result.targetCents < 0 ? 'warning' : 'default') as 'warning' | 'default',
      testID: 'money-scenario-amount',
      footer: balancesSelector,
    };
    const right = guidePresentation
      ? {
          label: guidePresentation.label,
          value: guidePresentation.value,
          caption: guidePresentation.caption,
          tone: guidePresentation.tone,
          testID: 'money-scenario-daily',
          accessibilityLabel: guidePresentation.accessibilityLabel,
        }
      : null;
    return { left, right };
  }, [result, guidePresentation, balancesSelector]);

  // Pass D.2 — the two grouped information actions. Same handlers, same destinations
  // as before (Pass D.3: the events row names its unfiltered destination truthfully).
  const actions: CardAction[] = useMemo(() => {
    if (!result.available) return [];
    const list: CardAction[] = [];
    if (onViewUpcomingEvents) {
      list.push({
        key: 'events',
        icon: 'calendar-number-outline',
        title: VIEW_UPCOMING_EVENTS_TITLE,
        subtitle: VIEW_UPCOMING_EVENTS_SUBTITLE,
        hint: 'Scrolls to the full list of scheduled bills, income and repayments',
        onPress: onViewUpcomingEvents,
        testID: 'money-view-upcoming-events',
      });
    }
    list.push({
      key: 'why',
      icon: 'calculator-outline',
      title: WHY_THIS_AMOUNT_TITLE,
      subtitle: WHY_THIS_AMOUNT_SUBTITLE,
      hint: 'Opens the breakdown, assumptions and limits behind this estimate',
      onPress: onWhyThisAmount,
      testID: 'money-why-this-amount',
      controlRef: whyActionRef,
    });
    return list;
  }, [result, onViewUpcomingEvents, onWhyThisAmount, whyActionRef]);
  const hasEvents = balancePath ? balancePath.eventCounts.income + balancePath.eventCounts.outgoing > 0 : false;

  return (
    <LinearGradient
      colors={semantic.heroSurface as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.heroShell}
      testID="money-scenario-card"
    >
      <View style={styles.identityRow}>
        <View style={styles.identityTile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="calendar-outline" size={20} color={semantic.interactive} />
        </View>
        <View ref={headingRef} style={{ flexShrink: 1 }} accessible accessibilityRole="header" accessibilityLabel={`Estimated balance by ${targetDateLabel}`} testID="money-scenario-heading">
          <Text style={styles.identityTitle} maxFontSizeMultiplier={1.8} importantForAccessibility="no">
            Estimated balance by
          </Text>
        </View>
      </View>

      {/* Top horizon control — the date and a single "Change date" button. */}
      <View style={styles.dateControlRow}>
        <Text style={styles.dateText} maxFontSizeMultiplier={1.8} testID="money-scenario-date">
          {targetDateLabel}
        </Text>
        <TouchableOpacity
          style={styles.changeDateButton}
          onPress={onOpenTimeframe}
          accessibilityRole="button"
          accessibilityLabel={`Change date. Currently by ${targetDateLabel}`}
          accessibilityHint="Choose a different date, or return to your payday view"
          testID="money-timeframe-row"
        >
          <Ionicons name="calendar-outline" size={16} color={semantic.interactive} importantForAccessibility="no" />
          <Text style={styles.changeDateText}>Change date</Text>
        </TouchableOpacity>
      </View>

      {available && regions ? (
        <>
          <CardResultRegions left={regions.left} right={regions.right} />

          {balancePath ? (
            <>
              {/* Pass C.5 — ONE extended time rail in the Pay cycle progress
                  language ("Timeline to 30 Oct"); the monetary graph is retired. */}
              <FutureTimelineRail path={balancePath} testID="money-scenario-timeline" resolveReview={resolveReview} onReviewSource={onReviewSource} focusRequest={focusRequest} detailMaxHeight={detailMaxHeight} onDetailFrame={onDetailFrame} />
              {hasEvents ? (
                <TimelineLegend mode="scenario" hasShortfall={result.available && result.firstShortfall !== null} showNote={false} />
              ) : (
                // Pass C.2 correction (P3) — an empty path has no markers to
                // explain; say so instead of showing a legend for markers that
                // aren't there.
                <Text style={styles.provenance} maxFontSizeMultiplier={2} testID="money-scenario-no-events">
                  No scheduled events before this date
                </Text>
              )}
              {balancePath.disclosure ? (
                <Text style={styles.provenance} maxFontSizeMultiplier={2} testID="money-scenario-rail-density">
                  {balancePath.disclosure}
                </Text>
              ) : null}
            </>
          ) : null}

          {/* Pass D.2 — ONE contained status surface (the existing Pass B status; the
              final-deficit explanation is its supporting line), then ONE grouped
              action surface. Order for assistive technology: result, timeline,
              legend, status, actions, tertiary. */}
          {presentation.cashFlowStatus ? <CashPathStatus status={presentation.cashFlowStatus} /> : null}
          <CardActionGroup actions={actions} testID="money-scenario-actions" />
        </>
      ) : (
        <>
          <Text style={styles.unavailableBody} testID="money-scenario-unavailable">
            {presentation.subtext ?? "This estimate isn't available right now."}
          </Text>
          {/* Pass D.5 — reachable even when no estimate can be shown. */}
          {balancesSelector}
          {/* Pass D — data-gap correction. ONLY sources the authoritative engine itself
              identified (a stable id on the issue) are offered; nothing is inferred, and
              the estimate returns only if the engine then considers the inputs valid. */}
          {correctionRows.map((row) => {
            const review = resolveReview ? resolveReview(row) : null;
            if (!review || !onReviewSource) return null;
            return (
              <TouchableOpacity
                key={`${row.sourceKind}:${row.sourceId}`}
                style={styles.action}
                onPress={() => onReviewSource(row)}
                accessibilityRole="button"
                accessibilityLabel={review.accessibilityLabel}
                accessibilityHint={review.hint}
                testID={`money-scenario-correct-${row.sourceId}`}
              >
                <Ionicons name="create-outline" size={16} color={semantic.interactive} importantForAccessibility="no" />
                <Text style={styles.actionText}>{review.label}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      {reviewNotice ? (
        <Text style={styles.reviewNotice} testID="money-scenario-review-notice">
          {reviewNotice}
        </Text>
      ) : null}

      <View style={styles.tertiary} testID="money-scenario-tertiary">
        <TouchableOpacity
          style={styles.backLink}
          onPress={onBackToPayday}
          accessibilityRole="button"
          accessibilityLabel="Back to payday"
          accessibilityHint="Returns to Available until payday. Nothing is saved."
          testID="money-back-to-payday"
        >
          <Ionicons name="arrow-back" size={14} color={semantic.interactive} importantForAccessibility="no" />
          <Text style={styles.backLinkText} maxFontSizeMultiplier={2}>Back to payday</Text>
        </TouchableOpacity>
        {available && presentation.subtext ? (
          <Text style={styles.footProvenance} maxFontSizeMultiplier={2} testID="money-scenario-provenance">
            {presentation.subtext}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
}
