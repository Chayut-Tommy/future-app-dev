import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing, typography } = useTheme();
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
          color: colors.textPrimary,
          marginBottom: spacing.xs,
          textAlign: 'center',
        },
        body: {
          ...typography.caption,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 19,
          marginBottom: spacing.lg,
        },
        button: {
          minWidth: 160,
        },
      }),
    [colors, spacing, typography]
  );

  return (
    <View style={styles.container}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={28} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </View>
  );
}
