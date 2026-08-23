import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamilyForWeight, AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Design 5.1 Wave 4 — ADDITIVE. A second, lower-commitment way out of an
   * empty or failed state ("Try again" beside "Add your first bill").
   * Omitted by every pre-existing caller, which render unchanged. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** `error` tints only the icon badge — the copy stays in the normal
   * reading colour so a failure is never harder to read than a success. */
  tone?: 'neutral' | 'error';
}) {
  const { colors, spacing, typography } = useTheme();
  // Design 5.1 Wave 9a — family-only migration (Wave 1B pattern): existing
  // sizes and weights verbatim, matching bundled faces declared alongside.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: 'center',
          paddingVertical: spacing.xxl,
          paddingHorizontal: spacing.lg,
        },
        iconBadge: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        },
        title: {
          ...typography.heading,
          fontFamily: fontFamilyForWeight(600, locale),
          color: colors.textPrimary,
          marginBottom: spacing.xs,
          textAlign: 'center',
        },
        body: {
          ...typography.caption,
          fontFamily: fontFamilyForWeight(400, locale),
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 19,
          marginBottom: spacing.lg,
        },
        button: {
          minWidth: 160,
        },
        secondaryButton: {
          minWidth: 160,
          marginTop: spacing.sm,
        },
        iconBadgeError: {
          backgroundColor: colors.dangerSoft,
        },
      }),
    [colors, spacing, typography, locale]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.iconBadge, tone === 'error' && styles.iconBadgeError]}>
        <Ionicons name={icon} size={28} color={tone === 'error' ? colors.danger : colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.button} /> : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Button label={secondaryActionLabel} variant="ghost" onPress={onSecondaryAction} style={styles.secondaryButton} />
      ) : null}
    </View>
  );
}
