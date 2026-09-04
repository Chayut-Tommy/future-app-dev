import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { resultRegionsStack } from '../../lib/calculations/moneyComposition';
import { spokenSignedDisplay } from '../../lib/a11yStrings';
import { designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass C.1 — the Available-Until-Payday card's two result regions.
 *
 * One region (LEFT) is always present; the RIGHT region is optional. Each
 * region is a single accessibility element reading "LABEL: VALUE. CAPTION",
 * in a logical left-then-right order. The layout is responsive through the
 * shared `resultRegionsStack` authority: side-by-side where two large money
 * figures fit, and stacked to one column on a narrow iPhone or at
 * accessibility text sizes. It never shrinks a value to force two columns and
 * never fixes a height, so nothing clips at maximum Dynamic Type — the row
 * also `flexWrap`s as a final safety net so an unusually long value drops the
 * right region below rather than clipping it.
 *
 * When a RIGHT region is present the two are separated by ONE subtle divider
 * (the shared `semantic.border` token, never a hard-coded colour): a 1pt
 * VERTICAL hairline between the columns (inset so it begins around the label
 * and ends after the caption, never touching the card edges), or — when the
 * regions stack — a 1pt HORIZONTAL rule instead. Never both. It is decorative
 * and subordinate to the figures, and implies no arithmetic between them.
 */
export interface CardResultRegion {
  label: string;
  value: string;
  caption: string;
  /** Optional emphasis tone for the value (e.g. a shortfall). */
  tone?: 'default' | 'warning';
  testID?: string;
}

export function CardResultRegions({ left, right }: { left: CardResultRegion; right?: CardResultRegion | null }) {
  const { semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const stack = resultRegionsStack(width, fontScale);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: stack ? 'column' : 'row',
          flexWrap: stack ? 'nowrap' : 'wrap',
          gap: designSpacing.lg,
          marginTop: designSpacing.md,
        },
        region: stack ? { width: '100%' } : { flexGrow: 1, flexShrink: 1, flexBasis: '42%', minWidth: 140 },
        label: { ...typeStyle('meta', locale), color: semantic.textSecondary, letterSpacing: 0.5, fontWeight: '700', textTransform: 'uppercase' },
        value: { ...typeStyle('figureHero', locale), fontSize: 30, fontWeight: '700', color: semantic.interactive, marginTop: designSpacing.xs },
        valueWarning: { color: semantic.warning },
        caption: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.xs },
        // A 1pt vertical hairline between columns, inset so it spans label →
        // caption without touching the card edges (the row's `gap` gives the
        // horizontal breathing room on each side).
        dividerVertical: { width: 1, alignSelf: 'stretch', marginVertical: designSpacing.xs, backgroundColor: semantic.border },
        // A 1pt horizontal rule when the regions stack; natural vertical space.
        dividerHorizontal: { height: 1, width: '100%', marginVertical: designSpacing.xs, backgroundColor: semantic.border },
      }),
    [semantic, locale, stack]
  );

  const renderRegion = (r: CardResultRegion) => (
    <View
      style={styles.region}
      accessible
      accessibilityLabel={`${r.label}: ${spokenSignedDisplay(r.value)}. ${r.caption}`}
    >
      <Text style={styles.label} importantForAccessibility="no" maxFontSizeMultiplier={2}>
        {r.label}
      </Text>
      <Text style={[styles.value, r.tone === 'warning' ? styles.valueWarning : null]} importantForAccessibility="no" maxFontSizeMultiplier={2} testID={r.testID}>
        {r.value}
      </Text>
      <Text style={styles.caption} importantForAccessibility="no" maxFontSizeMultiplier={2}>
        {r.caption}
      </Text>
    </View>
  );

  return (
    <View style={styles.row}>
      {renderRegion(left)}
      {right ? (
        <View
          style={stack ? styles.dividerHorizontal : styles.dividerVertical}
          importantForAccessibility="no"
          accessibilityElementsHidden
          testID="card-result-divider"
        />
      ) : null}
      {right ? renderRegion(right) : null}
    </View>
  );
}
