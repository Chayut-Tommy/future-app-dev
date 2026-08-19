/**
 * Nolie Design 5.1 Wave 4 — the shell every field primitive shares.
 *
 * Owns exactly three things and nothing else: the label, the control slot,
 * and a RESERVED error line. "Reserved" is the point of this component —
 * the message row occupies its height whether or not a message is showing,
 * so a field that fails validation never shifts the fields below it (doc A
 * p.11, Wave 4 acceptance: "error line is reserved so layout never jumps").
 *
 * It deliberately owns no sheet chrome, no title, no footer and no keyboard
 * avoidance — those belong to the container (KeyboardSheet standalone, or
 * the Add workspace when a body renders `embedded`). See the Wave 4
 * body-vs-container contract in the implementation plan.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';

/** Height the message row always occupies. 13pt caption at the RN default
 * ~1.3 line-height rounds to 17; the extra 2pt is the gap above it, so the
 * reservation holds at any Dynamic Type scale via `minHeight` rather than a
 * fixed `height` (a longer wrapped message may grow, an absent one may
 * not shrink). */
export const RESERVED_MESSAGE_MIN_HEIGHT = 19;

export type FieldMessageTone = 'error' | 'hint';

export function FieldShell({
  label,
  message,
  tone = 'error',
  required = false,
  style,
  children,
}: {
  label?: string;
  /** The message to show in the reserved row. `null`/`undefined` keeps the
   * row reserved but empty — it never removes the row. */
  message?: string | null;
  tone?: FieldMessageTone;
  required?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const { colors, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: { marginBottom: spacing.md },
        label: {
          ...typography.caption,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.xs,
        },
        required: { color: colors.danger },
        message: {
          ...typography.caption,
          marginTop: spacing.xs,
        },
        messageRow: { minHeight: RESERVED_MESSAGE_MIN_HEIGHT },
        error: { color: colors.danger },
        hint: { color: colors.textMuted },
      }),
    [colors, spacing, typography]
  );

  return (
    <View style={[styles.wrapper, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {/* Always rendered. An absent message leaves the row reserved and
          empty rather than collapsing it. */}
      <View style={styles.messageRow}>
        {message ? (
          <Text
            style={[styles.message, tone === 'error' ? styles.error : styles.hint]}
            accessibilityLiveRegion={tone === 'error' ? 'polite' : 'none'}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
