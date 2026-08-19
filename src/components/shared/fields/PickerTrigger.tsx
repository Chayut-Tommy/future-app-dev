/**
 * Nolie Design 5.1 Wave 4 — the row that opens a choice, in-form.
 *
 * This primitive is what replaces the removed preliminary chooser pages
 * ("What's this for?", "What's this bill for?", the income-kind and
 * asset-type pages). The customer now lands on the form with the choice
 * shown as a filled row they can change, instead of being asked one
 * question on a page of its own before the task begins.
 *
 * It is a BUTTON, not a text input: it declares `accessibilityRole="button"`
 * and reports its current selection in its label, so a screen reader
 * announces "Category, Groceries, button" as one item.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { FieldShell } from './FieldShell';
import { AddIcon } from '../AddIcon';
import { AddIconSpec } from '../../../lib/addIcons';

export function PickerTrigger({
  label,
  value,
  placeholder = 'Select',
  icon,
  onPress,
  message,
  tone = 'error',
  required = false,
  disabled = false,
  containerStyle,
  testID,
}: {
  label?: string;
  /** The current selection, or `null` when nothing is chosen yet. */
  value: string | null;
  placeholder?: string;
  /** Wave 4 device correction — a designed Ionicons glyph name from
   * `lib/addIcons.ts`, never an emoji. Decorative. */
  icon?: AddIconSpec | null;
  onPress: () => void;
  message?: string | null;
  tone?: 'error' | 'hint';
  required?: boolean;
  disabled?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const hasError = tone === 'error' && !!message;
  const isEmpty = value === null || value === '';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        trigger: {
          minHeight: minTouchTarget,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
        },
        errored: { borderColor: colors.danger, borderWidth: 1 },
        disabled: { opacity: 0.5 },
        leadingIcon: { marginRight: spacing.sm },
        value: { ...typography.body, color: colors.textPrimary, flex: 1 },
        placeholder: { color: colors.textMuted },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <FieldShell label={label} message={message} tone={tone} required={required} style={containerStyle}>
      <TouchableOpacity
        style={[styles.trigger, hasError && styles.errored, disabled && styles.disabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.75}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}, ${isEmpty ? placeholder : value}` : (isEmpty ? placeholder : (value as string))}
        accessibilityHint="Opens the list of choices"
        accessibilityState={{ disabled }}
      >
        {icon ? <AddIcon icon={icon} style={styles.leadingIcon} /> : null}
        <Text style={[styles.value, isEmpty && styles.placeholder]} numberOfLines={1}>
          {isEmpty ? placeholder : value}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </FieldShell>
  );
}
