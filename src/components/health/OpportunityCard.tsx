import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Opportunity } from '../../lib/calculations/opportunities';

/**
 * Quick-action coaching card (PRD ask: Apple Fitness achievement-card style
 * — short, visual, action-based, not a paragraph to read). Always framed as
 * an opportunity, never a warning; amber accent for "worth your attention,"
 * never red.
 */
export function OpportunityCard({ opportunity, onAction }: { opportunity: Opportunity; onAction?: (action: Opportunity['action']) => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.warningSoft,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        iconBadge: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.warning, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        button: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: spacing.md },
        buttonText: { ...typography.micro, fontSize: 11, color: colors.warning, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <View style={styles.iconBadge}>
        <Ionicons name={opportunity.icon} size={18} color={colors.warning} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {opportunity.title}
        </Text>
        <Text style={styles.body} numberOfLines={1}>
          {opportunity.body}
        </Text>
      </View>
      {opportunity.action !== 'none' && onAction ? (
        <TouchableOpacity style={styles.button} onPress={() => onAction(opportunity.action)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.buttonText}>{opportunity.actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
