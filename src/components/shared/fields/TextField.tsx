/**
 * Nolie Design 5.1 Wave 4 — the single text input primitive.
 *
 * Replaces the per-form `TextInput` + ad-hoc style object that each of the
 * seven form bodies previously carried its own copy of. It owns presentation
 * and the focus state only: it holds no value, runs no validation and knows
 * nothing about money, dates or categories. Validation stays in the callers'
 * existing validators, which Wave 4 reuses verbatim.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { FieldShell } from './FieldShell';

export function TextField({
  label,
  value,
  onChangeText,
  message,
  tone = 'error',
  required = false,
  disabled = false,
  multiline = false,
  containerStyle,
  accessibilityLabel,
  ...rest
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  message?: string | null;
  tone?: 'error' | 'hint';
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  containerStyle?: ViewStyle;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'editable' | 'multiline' | 'style'>) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = tone === 'error' && !!message;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        input: {
          minHeight: minTouchTarget,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          color: colors.textPrimary,
          ...typography.body,
        },
        focused: { borderColor: colors.accent, borderWidth: 1 },
        errored: { borderColor: colors.danger, borderWidth: 1 },
        disabled: { opacity: 0.5 },
        multiline: { minHeight: minTouchTarget * 2, textAlignVertical: 'top' },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <FieldShell label={label} message={message} tone={tone} required={required} style={containerStyle}>
      <TextInput
        {...rest}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && !hasError && styles.focused,
          hasError && styles.errored,
          disabled && styles.disabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
      />
    </FieldShell>
  );
}
