import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass C.1 — the timeline rail's legend.
 *
 * Explains the marker shapes so the rail is never read by colour alone
 * (WCAG 1.4.1): each entry pairs a distinct SHAPE with a text label. It also
 * states, in one line, that markers show only DATED events — so the rail is
 * not mistaken for a complete picture of undated, plan-only amounts (savings
 * and goals), which are informational and never placed on the rail.
 *
 * AUP mode shows bills/repayments and the not-included payday endpoint, plus
 * (Pass C.3) the expected-income marker ONLY when the rail actually carries
 * one — an honest legend never lists a shape that is not drawn. Scenario mode
 * adds assumed income, and the potential-shortfall item ONLY when the rail
 * actually carries a shortfall marker (C1-02). (Pass C.5 retired the C.3
 * graph-only entries — estimated-balance area and $0 line — with the graph.)
 */
const SWATCH = 12;

export function TimelineLegend({
  mode,
  hasShortfall = false,
  hasExpectedIncome = false,
  showNote = true,
}: {
  mode: 'aup' | 'scenario';
  hasShortfall?: boolean;
  /** AUP mode only — true when at least one expected-income marker is drawn. */
  hasExpectedIncome?: boolean;
  /** Pass C.2 — the selected-date card moves this technical marker note into
   * "Why this amount?" (progressive disclosure); AUP mode keeps it unchanged. */
  showNote?: boolean;
}) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginTop: designSpacing.sm, gap: designSpacing.xs },
        row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: designSpacing.md, rowGap: designSpacing.xs },
        // Pass D.2 — an item wraps to the next line as a COMPLETE unit; at very large
        // text its own label may wrap inside it, but a swatch is never separated from its words.
        item: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, maxWidth: '100%' },
        swatchBox: { width: SWATCH + 4, alignItems: 'center', justifyContent: 'center' },
        circle: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: semantic.success },
        diamond: { width: SWATCH - 2, height: SWATCH - 2, backgroundColor: semantic.warningAccent, transform: [{ rotate: '45deg' }], borderRadius: 2 },
        ring: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, borderWidth: 2, borderColor: semantic.success, backgroundColor: 'transparent' },
        label: { ...typeStyle('meta', locale), color: semantic.textTertiary, flexShrink: 1 },
        note: { ...typeStyle('meta', locale), color: semantic.textTertiary, fontStyle: 'italic' },
      }),
    [semantic, locale]
  );

  return (
    <View style={styles.wrap} testID="timeline-legend">
      <View style={styles.row}>
        {mode === 'scenario' ? (
          <View style={styles.item} accessible accessibilityLabel="Green circle: assumed income">
            <View style={styles.swatchBox} importantForAccessibility="no">
              <View style={styles.circle} />
            </View>
            <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
              Assumed income
            </Text>
          </View>
        ) : null}
        {mode === 'aup' && hasExpectedIncome ? (
          <View style={styles.item} accessible accessibilityLabel="Green circle: expected income, not included in Available until payday" testID="timeline-legend-expected-income">
            <View style={styles.swatchBox} importantForAccessibility="no">
              <View style={styles.circle} />
            </View>
            <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
              Expected income (not included)
            </Text>
          </View>
        ) : null}
        <View style={styles.item} accessible accessibilityLabel="Gold diamond: bills and repayments">
          <View style={styles.swatchBox} importantForAccessibility="no">
            <View style={styles.diamond} />
          </View>
          <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
            Bills &amp; repayments
          </Text>
        </View>
        {mode === 'aup' ? (
          <View style={styles.item} accessible accessibilityLabel="Hollow green ring: expected payday, not included in this amount">
            <View style={styles.swatchBox} importantForAccessibility="no">
              <View style={styles.ring} />
            </View>
            <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
              Payday (not included)
            </Text>
          </View>
        ) : hasShortfall ? (
          <View style={styles.item} accessible accessibilityLabel="Amber alert: first potential shortfall" testID="timeline-legend-shortfall">
            <View style={styles.swatchBox} importantForAccessibility="no">
              <Ionicons name="alert-circle" size={SWATCH + 2} color={semantic.warning} />
            </View>
            <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
              Potential shortfall
            </Text>
          </View>
        ) : null}
      </View>
      {showNote ? (
        <Text style={styles.note} importantForAccessibility="no" maxFontSizeMultiplier={2}>
          Markers show dated events only. Planned savings and goals aren’t shown here.
        </Text>
      ) : null}
    </View>
  );
}
