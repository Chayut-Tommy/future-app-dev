/**
 * Nolie Design 5.1 Wave 4 — the shared list row.
 *
 * One row shape for every list in the app: a leading glyph slot, a title,
 * an optional supporting line, a trailing slot, and an optional chevron.
 * A row with an `onPress` is a real button with a 44pt minimum height; a
 * row without one is inert and carries no interactive semantics at all.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';

export function Row({
  title,
  supporting,
  leading,
  trailing,
  onPress,
  chevron = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: {
  title: string;
  supporting?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        disabled: { opacity: 0.5 },
        leading: { marginRight: spacing.md },
        body: { flex: 1 },
        title: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        supporting: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        trailing: { marginLeft: spacing.md },
      }),
    [colors, minTouchTarget, spacing, typography]
  );

  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {supporting ? <Text style={styles.supporting}>{supporting}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </>
  );

  if (!onPress) {
    // Inert row — no role, no state, nothing for a screen reader to try to
    // activate. The text itself is still read.
    return (
      <View style={[styles.row, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="button"
      // One announcement for the whole row: title, then its supporting line.
      accessibilityLabel={accessibilityLabel ?? (supporting ? `${title}. ${supporting}` : title)}
      accessibilityState={{ disabled }}
    >
      {content}
    </TouchableOpacity>
  );
}
