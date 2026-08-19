/**
 * Nolie Design 5.1 Wave 4 — a row that represents one choice in a set.
 *
 * Distinct from `Row` because the semantics are genuinely different: this
 * declares `accessibilityRole="radio"` and reports `checked`, so a screen
 * reader announces the selection state rather than offering a plain button.
 * Used by the consolidated options sheet and by the in-form category and
 * type pickers that replaced the removed chooser pages.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { AddIcon } from '../AddIcon';
import { AddIconSpec } from '../../../lib/addIcons';

export function SelectableRow({
  title,
  supporting,
  icon,
  selected,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: {
  title: string;
  supporting?: string | null;
  /** Wave 4 device correction — a designed Ionicons glyph name from
   * `lib/addIcons.ts`, never an emoji. Decorative: `AddIcon` hides it from
   * the accessibility tree and this row's own label carries everything. */
  icon?: AddIconSpec | null;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.control,
        },
        selected: { backgroundColor: colors.accentSoft },
        disabled: { opacity: 0.5 },
        leadingIcon: { marginRight: spacing.md },
        body: { flex: 1 },
        title: { ...typography.body, color: colors.textPrimary },
        titleSelected: { fontWeight: '600' },
        supporting: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.selected, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? (supporting ? `${title}. ${supporting}` : title)}
      accessibilityState={{ checked: selected, disabled, selected }}
    >
      {icon ? <AddIcon icon={icon} emphasis={selected ? 'selected' : 'domain'} style={styles.leadingIcon} /> : null}
      <View style={styles.body}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {supporting ? <Text style={styles.supporting}>{supporting}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
    </TouchableOpacity>
  );
}
