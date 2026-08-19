/**
 * Nolie Design 5.1 Wave 4 — progressive disclosure.
 *
 * The mechanism that lets the consolidated forms show a short primary set of
 * fields and keep the rest one tap away, instead of pushing them onto a
 * preliminary page (doc A p.11). Presentation only: the children stay
 * mounted-on-demand, and collapsing does not clear any value the caller
 * holds — nothing here touches form state.
 *
 * The header is a `button` reporting `expanded`, so a screen reader
 * announces the state rather than leaving a customer unsure what happened.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export function Disclosure({
  label,
  supporting,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  style,
  testID,
  children,
}: {
  label: string;
  supporting?: string | null;
  defaultExpanded?: boolean;
  /** Optional controlled mode. When provided the caller owns the state. */
  expanded?: boolean;
  onToggle?: (next: boolean) => void;
  style?: ViewStyle;
  testID?: string;
  children: React.ReactNode;
}) {
  const { colors, minTouchTarget, spacing, typography } = useTheme();
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? (controlledExpanded as boolean) : uncontrolled;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: { marginBottom: spacing.md },
        header: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm,
        },
        body: { flex: 1 },
        label: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        supporting: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        content: { paddingTop: spacing.sm },
      }),
    [colors, minTouchTarget, spacing, typography]
  );

  return (
    <View style={[styles.wrapper, style]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          const next = !expanded;
          if (!isControlled) setUncontrolled(next);
          onToggle?.(next);
        }}
        activeOpacity={0.75}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={supporting ? `${label}. ${supporting}` : label}
        accessibilityState={{ expanded }}
      >
        <View style={styles.body}>
          <Text style={styles.label}>{label}</Text>
          {supporting ? <Text style={styles.supporting}>{supporting}</Text> : null}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}
