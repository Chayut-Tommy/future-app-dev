import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamilyForWeight, AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** Design 5.1 Wave 4 — `danger` added for destructive confirmations, which
 * previously each hand-rolled their own red TouchableOpacity. The three
 * pre-existing variants are unchanged, and `primary` is still the default,
 * so every existing call site renders exactly as before. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  icon,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  /** Design 5.1 Wave 4 — optional leading glyph. Decorative: the label
   * still carries the whole accessible name. */
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;
  // Design 5.1 Wave 9a — family-only migration (Wave 1B pattern): the
  // existing heading size/weight stay verbatim; only the matching bundled
  // face is declared so a button label never renders in the platform font.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

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
        danger: {
          backgroundColor: colors.danger,
        },
        disabled: {
          opacity: 0.4,
        },
        label: {
          ...typography.heading,
          fontSize: 15,
          fontFamily: fontFamilyForWeight(600, locale),
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
        labelDanger: {
          color: colors.onAccent,
        },
        icon: {
          marginRight: spacing.sm,
        },
      }),
    [colors, minTouchTarget, radius, spacing, typography, locale]
  );

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.onAccent : colors.accent} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={17}
              style={styles.icon}
              color={
                variant === 'primary' || variant === 'danger'
                  ? colors.onAccent
                  : variant === 'ghost'
                    ? colors.textSecondary
                    : colors.textPrimary
              }
            />
          ) : null}
          <Text
            style={[
              styles.label,
              variant === 'primary' && styles.labelPrimary,
              variant === 'secondary' && styles.labelSecondary,
              variant === 'ghost' && styles.labelGhost,
              variant === 'danger' && styles.labelDanger,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
