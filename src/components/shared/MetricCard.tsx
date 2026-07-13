import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function MetricCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
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
        },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}
