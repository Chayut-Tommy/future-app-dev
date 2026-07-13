import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Contextual, dismissible invitation to unlock a feature by adding data —
 * never a blocking step (PRD §20). Framed as "unlock this," not "fill out
 * this form."
 */
export function UnlockPromptCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  learnLabel,
  onLearn,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Optional education pathway (PRD ask: guide first, then ask for
   * action — many users are beginners and don't yet know what to do with
   * an "add investments" prompt). */
  learnLabel?: string;
  onLearn?: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.accentSoft,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        iconBadge: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textBlock: {
          flex: 1,
        },
        title: {
          ...typography.heading,
          fontSize: 14,
          color: colors.accentStrong,
          marginBottom: 2,
        },
        body: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
        },
        action: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: colors.accent,
        },
        actionText: {
          ...typography.micro,
          color: colors.onAccent,
          fontWeight: '700',
        },
        learnRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderStrong,
        },
        learnText: {
          ...typography.caption,
          fontSize: 12,
          color: colors.accentStrong,
          fontWeight: '700',
        },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <TouchableOpacity style={styles.action} onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
      {learnLabel && onLearn ? (
        <TouchableOpacity style={styles.learnRow} onPress={onLearn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="school-outline" size={14} color={colors.accentStrong} />
          <Text style={styles.learnText}>{learnLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
