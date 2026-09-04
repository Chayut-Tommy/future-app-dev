import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CardResultRegions } from './CardResultRegions';
import { TimelineMarkerTrack } from './TimelineMarkerTrack';
import { TimelineLegend } from './TimelineLegend';
import { TimelineRail } from '../../lib/calculations/timelineMarkers';
import { LookAheadPresentation } from '../../lib/calculations/lookAheadPresentation';
import { LookAheadResult } from '../../lib/calculations/lookAheadProjection';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { LocalDate } from '../../lib/calculations/localCalendar';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

const HERO_TILE_SIZE = 36;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: LocalDate) => `${d.day} ${MONTHS[d.month - 1]}`;

/**
 * Pass C.1 — the selected-date (scenario) presentation of the ONE Money card.
 *
 * Rendered IN PLACE of the Available-Until-Payday hero when the customer has
 * chosen a specific date, inside the SAME Design 5.1 hero shell, so it reads
 * as the same card in a different mode — never a second card. It shows ONLY
 * the Pass B estimate and its honest scenario framing: it never shows AUP-only
 * content (no "available", no daily amount, no pay-cycle wording, no claim
 * that savings/goals are subtracted, no implication that assumed income has
 * been received). Crucially it NEVER divides a future position into a daily
 * spend — the right region uses the existing Pass B lowest-position or
 * shortfall output instead. All numbers come from the Pass B result via one
 * cents-aware formatter; this component owns no maths.
 */
export function ScenarioPositionCard({
  presentation,
  result,
  rail,
  targetDateLabel,
  onOpenTimeframe,
  onWhyThisAmount,
  onBackToPayday,
  headingRef,
}: {
  presentation: LookAheadPresentation;
  /** The Pass B projection for the selected date (or the unavailable result). */
  result: LookAheadResult;
  /** Scenario rail (green assumed income, gold bills, coral shortfall) — or
   * null when the estimate is unavailable. */
  rail: TimelineRail | null;
  /** The selected-date label for the date subline, e.g. "Mon, 31 Aug 2026". */
  targetDateLabel: string;
  onOpenTimeframe: () => void;
  onWhyThisAmount: () => void;
  onBackToPayday: () => void;
  headingRef?: React.Ref<View>;
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
        scenarioChip: { paddingHorizontal: designSpacing.sm, paddingVertical: 2, borderRadius: designRadius.tile, backgroundColor: semantic.interactiveTint },
        scenarioChipText: { ...typeStyle('meta', locale), color: semantic.interactive, fontWeight: '700' },
        dateControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: designSpacing.sm, marginTop: designSpacing.xs, flexWrap: 'wrap' },
        dateText: { ...typeStyle('titleSection', locale), color: semantic.textPrimary, flexShrink: 1 },
        changeDateButton: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, minHeight: designLayout.touchTargetMin, paddingHorizontal: designSpacing.sm },
        changeDateText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        railTitle: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', marginTop: designSpacing.lg },
        assumed: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.sm },
        footerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: designSpacing.md,
          marginTop: designSpacing.md,
          paddingTop: designSpacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.border,
          flexWrap: 'wrap',
        },
        action: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, minHeight: designLayout.touchTargetMin },
        actionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        unavailableBody: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.md },
      }),
    [colors, semantic, locale]
  );

  // The two result regions (available only). LEFT is always the estimated
  // position at the target (sign-aware). RIGHT is the lowest projected
  // position, or — when a shortfall is projected — the positive shortfall
  // amount and its first date. NEVER a per-day figure.
  const regions = useMemo(() => {
    if (!result.available) return null;
    const left = {
      label: 'ESTIMATED POSITION',
      value: formatCentsCentsAware(result.targetCents),
      caption: `By ${shortDate(result.target)}`,
      tone: (result.targetCents < 0 ? 'warning' : 'default') as 'warning' | 'default',
      testID: 'money-scenario-amount',
    };
    const right = result.firstShortfall
      ? {
          label: 'POTENTIAL SHORTFALL',
          value: formatCentsCentsAware(result.firstShortfall.shortfallCents),
          caption: `First expected on ${shortDate(result.firstShortfall.date)}`,
          tone: 'warning' as const,
          testID: 'money-scenario-shortfall',
        }
      : {
          label: 'LOWEST POSITION',
          value: formatCentsCentsAware(result.lowest.cents),
          caption: `On ${shortDate(result.lowest.date)}`,
          tone: (result.lowest.cents < 0 ? 'warning' : 'default') as 'warning' | 'default',
          testID: 'money-scenario-lowest',
        };
    return { left, right };
  }, [result]);

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
        <View ref={headingRef} style={{ flexShrink: 1 }} accessible accessibilityRole="header" accessibilityLabel={`Estimated position by ${targetDateLabel}`} testID="money-scenario-heading">
          <Text style={styles.identityTitle} maxFontSizeMultiplier={1.8} importantForAccessibility="no">
            Estimated position by
          </Text>
        </View>
        <View style={styles.scenarioChip}>
          <Text style={styles.scenarioChipText}>Scenario</Text>
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
          {presentation.cashFlowLine ? (
            <Text style={styles.assumed} testID="money-scenario-cashflow">
              {presentation.cashFlowLine}
            </Text>
          ) : null}

          {rail ? (
            <>
              <Text style={styles.railTitle}>Timeline to {shortDate((result as Extract<LookAheadResult, { available: true }>).target)}</Text>
              <TimelineMarkerTrack rail={rail} testID="money-scenario-rail" />
              <TimelineLegend mode="scenario" hasShortfall={result.available && result.firstShortfall !== null} />
            </>
          ) : null}

          {presentation.assumedLine ? (
            <Text style={styles.assumed} testID="money-scenario-assumed">
              {presentation.assumedLine}
            </Text>
          ) : null}
          {presentation.subtext ? <Text style={styles.assumed}>{presentation.subtext}</Text> : null}
        </>
      ) : (
        <Text style={styles.unavailableBody} testID="money-scenario-unavailable">
          {presentation.subtext ?? "This estimate isn't available right now."}
        </Text>
      )}

      <View style={styles.footerRow}>
        <TouchableOpacity style={styles.action} onPress={onBackToPayday} accessibilityRole="button" accessibilityLabel="Back to payday" testID="money-back-to-payday">
          <Ionicons name="arrow-back" size={16} color={semantic.interactive} importantForAccessibility="no" />
          <Text style={styles.actionText}>Back to payday</Text>
        </TouchableOpacity>
        {available ? (
          <TouchableOpacity style={styles.action} onPress={onWhyThisAmount} accessibilityRole="button" accessibilityLabel="Why this amount?" testID="money-why-this-amount">
            <Text style={styles.actionText}>Why this amount?</Text>
            <Ionicons name="chevron-forward" size={16} color={semantic.interactive} importantForAccessibility="no" />
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );
}
