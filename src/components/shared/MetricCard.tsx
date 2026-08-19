import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function MetricCard({
  label,
  value,
  valueColor,
  supporting,
  tone,
}: {
  label: string;
  value: string;
  valueColor?: string;
  /** Design 5.1 Wave 4 — ADDITIVE. A short qualifier under the figure
   * ("since 1 August"). Omitted by every pre-existing caller. */
  supporting?: string;
  /** Design 5.1 Wave 4 — ADDITIVE semantic alternative to `valueColor`.
   * `valueColor` still wins when both are given, so no existing caller's
   * colour changes. This decides nothing about the number itself. */
  tone?: 'positive' | 'negative' | 'muted';
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexBasis: '48%',
          flexGrow: 1,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        },
        label: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: 4,
        },
        value: {
          ...typography.heading,
          fontSize: 19,
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
        },
        supporting: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 2,
        },
      }),
    [colors, radius, spacing, typography]
  );

  const toneColor =
    tone === 'positive' ? colors.success : tone === 'negative' ? colors.danger : tone === 'muted' ? colors.textSecondary : undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.value, toneColor ? { color: toneColor } : null, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {supporting ? (
        <Text style={styles.supporting} numberOfLines={1}>
          {supporting}
        </Text>
      ) : null}
    </View>
  );
}
