/**
 * Nolie Design 5.1 Wave 4 — one way to render a money value.
 *
 * Presentation ONLY. It formats nothing itself: the caller passes an
 * already-formatted string produced by the app's existing formatters, so
 * this component can never introduce a rounding, currency or sign
 * difference into a displayed figure. `tone` selects a colour role and
 * nothing else — it does not decide, and must never decide, whether a
 * number is positive.
 *
 * Design 5.1 doc A p.9: financial figures are always tabular so digits line
 * up column-to-column, and a figure's screen-reader label may be overridden
 * so "-$42.00" can be spoken as "42 dollars out" where that reads better.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export type FinancialFigureTone = 'neutral' | 'positive' | 'negative' | 'muted';
export type FinancialFigureSize = 'hero' | 'title' | 'body' | 'caption';

export function FinancialFigure({
  value,
  tone = 'neutral',
  size = 'body',
  accessibilityLabel,
  style,
  testID,
}: {
  /** Already formatted by the caller — e.g. `formatMoney(item.amount)`. */
  value: string;
  tone?: FinancialFigureTone;
  size?: FinancialFigureSize;
  accessibilityLabel?: string;
  style?: TextStyle;
  testID?: string;
}) {
  const { colors, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          // Digits keep a constant advance width so a column of amounts
          // aligns regardless of which digits appear.
          fontVariant: ['tabular-nums'],
        },
        hero: { fontSize: 32, fontWeight: '700' },
        title: { ...typography.title },
        body: { ...typography.body, fontWeight: '600' },
        caption: { ...typography.caption, fontWeight: '600' },
        neutral: { color: colors.textPrimary },
        positive: { color: colors.success },
        negative: { color: colors.danger },
        muted: { color: colors.textSecondary },
      }),
    [colors, typography]
  );

  return (
    <Text
      style={[styles.base, styles[size], styles[tone], style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      // The figure is data, not a heading — it must not be announced as one.
      accessibilityRole="text"
    >
      {value}
    </Text>
  );
}
