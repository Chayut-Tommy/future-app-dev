/**
 * Nolie Design 5.1 Wave 4 — a single selectable chip.
 *
 * Replaces the `presetChip` / `categoryChip` / `presetText` style blocks
 * that six of the seven form bodies each carried their own near-identical
 * copy of. Declares `accessibilityRole="button"` with a `selected` state
 * (rather than a bare TouchableOpacity), and meets the 44pt target.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          minHeight: minTouchTarget,
          justifyContent: 'center',
          borderRadius: radius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.lg,
          marginRight: spacing.sm,
          marginBottom: spacing.sm,
        },
        selected: { backgroundColor: colors.accent, borderColor: colors.accent },
        disabled: { opacity: 0.5 },
        label: { ...typography.body, color: colors.textPrimary },
        labelSelected: { color: colors.onAccent, fontWeight: '600' },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}
