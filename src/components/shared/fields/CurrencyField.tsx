/**
 * Nolie Design 5.1 Wave 4 — the single money input primitive.
 *
 * Validity is NOT decided here. The field holds a raw string, reports every
 * keystroke to its caller unchanged, and on BLUR asks `describeMoneyInput`
 * (which delegates to the shared strict grammar in
 * src/lib/calculations/money.ts) for words to show. It never rewrites,
 * reformats, truncates or clamps what was typed, and it never shakes — doc A
 * p.11, and the Wave 4 device script's `189.001` case.
 *
 * A caller that already runs its own validator keeps it: passing `message`
 * overrides anything this field would say, so no existing validation is
 * bypassed or duplicated.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { moneyFontFamily, MONEY_TYPOGRAPHY } from '../../../theme/typography';
import { FieldShell } from './FieldShell';
import { describeMoneyInput } from './moneyFieldMessage';

export function CurrencyField({
  label,
  value,
  onChangeText,
  message,
  required = false,
  allowZero = false,
  disabled = false,
  large = false,
  containerStyle,
  accessibilityLabel,
  ...rest
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  /** Caller-owned message. When provided it wins outright — the field shows
   * it and does not derive its own. */
  message?: string | null;
  required?: boolean;
  /** Mirrors the caller's shared parser: `parseMoneyInputAllowZero` when
   * true, `parseMoneyInput` when false. Presentation only. */
  allowZero?: boolean;
  disabled?: boolean;
  /** Hero amount treatment for the one primary amount in a task. */
  large?: boolean;
  containerStyle?: ViewStyle;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'editable' | 'keyboardType' | 'style'>) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const [blurMessage, setBlurMessage] = useState<string | null>(null);

  const shown = message !== undefined && message !== null ? message : blurMessage;
  const hasError = !!shown;

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
          // Design 5.1 Wave 9a — family-only migration, existing size and
          // weight verbatim. A typed amount is a financial figure, so it is
          // Figtree tabular in BOTH locales (typography.ts money grammar),
          // never the platform default and never the Thai prose face.
          fontFamily: moneyFontFamily(400),
          fontVariant: [...MONEY_TYPOGRAPHY.fontVariant],
        },
        large: { ...typography.title, minHeight: minTouchTarget + 12, paddingVertical: spacing.md, fontFamily: moneyFontFamily(700) },
        focused: { borderColor: colors.accent, borderWidth: 1 },
        errored: { borderColor: colors.danger, borderWidth: 1 },
        disabled: { opacity: 0.5 },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <FieldShell label={label} message={shown} tone="error" required={required} style={containerStyle}>
      <TextInput
        {...rest}
        style={[
          styles.input,
          large && styles.large,
          focused && !hasError && styles.focused,
          hasError && styles.errored,
          disabled && styles.disabled,
        ]}
        value={value}
        onChangeText={(next) => {
          // A message earned on a previous blur is cleared as soon as the
          // customer starts correcting it, so the field never argues while
          // they are fixing it.
          if (blurMessage) setBlurMessage(null);
          onChangeText(next);
        }}
        editable={!disabled}
        keyboardType="decimal-pad"
        placeholder={rest.placeholder ?? '$0.00'}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setBlurMessage(describeMoneyInput({ raw: value, allowZero, required }));
          rest.onBlur?.(e);
        }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
      />
    </FieldShell>
  );
}
