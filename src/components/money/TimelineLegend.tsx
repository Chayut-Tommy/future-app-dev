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
 * AUP mode shows bills/repayments and the not-included payday endpoint (AUP
 * adds no future income, so there is no income marker to explain). Scenario
 * mode adds assumed income, and the potential-shortfall item ONLY when the
 * rail actually carries a shortfall marker — a healthy estimate never shows a
 * shortfall legend entry with no corresponding marker (C1-02).
 */
const SWATCH = 12;

export function TimelineLegend({ mode, hasShortfall = false }: { mode: 'aup' | 'scenario'; hasShortfall?: boolean }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginTop: designSpacing.sm, gap: designSpacing.xs },
        row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: designSpacing.md, rowGap: designSpacing.xs },
        item: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs },
        swatchBox: { width: SWATCH + 4, alignItems: 'center', justifyContent: 'center' },
        circle: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: semantic.success },
        diamond: { width: SWATCH - 2, height: SWATCH - 2, backgroundColor: semantic.warningAccent, transform: [{ rotate: '45deg' }], borderRadius: 2 },
        ring: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, borderWidth: 2, borderColor: semantic.success, backgroundColor: 'transparent' },
        label: { ...typeStyle('meta', locale), color: semantic.textTertiary },
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
      <Text style={styles.note} importantForAccessibility="no" maxFontSizeMultiplier={2}>
        Markers show dated events only. Planned savings and goals aren’t shown here.
      </Text>
    </View>
  );
}
