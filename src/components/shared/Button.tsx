import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          minHeight: minTouchTarget,
          borderRadius: radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
        },
        primary: {
          backgroundColor: colors.accent,
        },
        secondary: {
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderStrong,
        },
        ghost: {
          backgroundColor: 'transparent',
        },
        disabled: {
          opacity: 0.4,
        },
        label: {
          ...typography.heading,
          fontSize: 15,
        },
        labelPrimary: {
          color: colors.onAccent,
        },
        labelSecondary: {
          color: colors.textPrimary,
        },
        labelGhost: {
          color: colors.textSecondary,
        },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accent} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant === 'secondary' && styles.labelSecondary,
            variant === 'ghost' && styles.labelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
