/**
 * Nolie Design 5.1 Wave 4 — a two-to-four-way segmented control.
 *
 * Replaces the hand-rolled `segment` / `segmentButton` / `segmentActive`
 * blocks in the form bodies. Every segment is a `radio` inside a
 * `radiogroup`, so the set is announced as one control with a current
 * selection rather than as N unrelated buttons.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        group: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.xs,
          marginBottom: spacing.md,
        },
        segment: {
          flex: 1,
          minHeight: minTouchTarget - spacing.xs * 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.control - 2,
          paddingHorizontal: spacing.sm,
        },
        active: { backgroundColor: colors.surface },
        disabled: { opacity: 0.5 },
        label: { ...typography.body, color: colors.textSecondary },
        labelActive: { color: colors.textPrimary, fontWeight: '600' },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <View
      style={[styles.group, disabled && styles.disabled, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segment, active && styles.active]}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: active, selected: active, disabled }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
