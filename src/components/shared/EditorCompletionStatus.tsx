import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { EditorPendingKind, pendingLabel } from '../../lib/editorCompletion';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass D0 — the one status line the four shared editors show for a durable Save
 * or Delete: `Saving…` / `Deleting…` while the write is unresolved, or the calm,
 * retryable error after a rejected write. Nothing else: no success state lives
 * here, because a successful editor simply closes.
 *
 * The error never relies on colour alone (an alert glyph accompanies it), wraps
 * at any Dynamic Type size, and is a polite live region so a screen reader hears
 * it once. The spoken announcement itself is made once by the shared hook.
 */
export function EditorCompletionStatus({ pending, errorText, testID = 'editor-completion' }: { pending: EditorPendingKind | null; errorText: string | null; testID?: string }) {
  const { colors, spacing } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
        // Pass D.3 (F3) — the Design 5.1 meta role (Figtree), not the legacy caption token.
        pendingText: { ...typeStyle('meta', locale), color: colors.textSecondary, flex: 1 },
        errorText: { ...typeStyle('meta', locale), color: colors.textPrimary, flex: 1 },
      }),
    [colors, spacing, locale]
  );
  if (pending) {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite" testID={`${testID}-pending`}>
        <Text style={styles.pendingText}>{pendingLabel(pending)}</Text>
      </View>
    );
  }
  if (!errorText) return null;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessibilityRole="alert" testID={`${testID}-error`}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.warning} importantForAccessibility="no" />
      <Text style={styles.errorText}>{errorText}</Text>
    </View>
  );
}
