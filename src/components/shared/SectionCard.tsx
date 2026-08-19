import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Design 5.1 Wave 4 — `title`, `supporting` and `footer` are ADDITIVE. Every
 * pre-existing caller passes none of them and renders byte-identically to
 * before: without a title the card is still exactly a padded surface with
 * its children. The slots exist so the migrated forms stop hand-rolling a
 * heading Text above each card with their own private spacing.
 */
export function SectionCard({
  title,
  supporting,
  footer,
  style,
  children,
  ...rest
}: ViewProps & {
  title?: string;
  supporting?: string;
  footer?: React.ReactNode;
}) {
  const { colors, radius, spacing, cardShadow, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.lg,
          marginBottom: spacing.md,
          ...cardShadow,
        },
        title: {
          ...typography.heading,
          color: colors.textPrimary,
        },
        supporting: {
          ...typography.caption,
          color: colors.textSecondary,
          marginTop: 2,
        },
        header: {
          marginBottom: spacing.md,
        },
        footer: {
          marginTop: spacing.md,
        },
      }),
    [colors, radius, spacing, cardShadow, typography]
  );

  return (
    <View style={[styles.card, style]} {...rest}>
      {title || supporting ? (
        <View style={styles.header}>
          {title ? (
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {supporting ? <Text style={styles.supporting}>{supporting}</Text> : null}
        </View>
      ) : null}
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}
