import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Opportunity, OpportunityAction } from '../../lib/calculations/opportunities';
import { brand } from '../../lib/brand';

/**
 * One recommendation at a time, framed as Lulu talking rather than a
 * checklist item (PRD ask: "Lulu noticed something 💡" — personal,
 * actionable, simple). Replaces the old multi-card Opportunities list.
 */
export function LuluRecommendationCard({
  opportunity,
  onAction,
  onLearn,
}: {
  opportunity: Opportunity;
  onAction: (action: OpportunityAction) => void;
  onLearn?: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.warningSoft, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg },
        eyebrow: { ...typography.micro, fontSize: 11, color: colors.warning, fontWeight: '700', letterSpacing: 0.3, marginBottom: spacing.sm },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        iconBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
        body: { ...typography.body, fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
        buttonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
        button: {
          alignSelf: 'flex-start',
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.lg,
        },
        buttonText: { ...typography.caption, fontSize: 13, color: colors.warning, fontWeight: '700' },
        learnLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        learnText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>💡 {brand.name.toUpperCase()} NOTICED SOMETHING</Text>
      <View style={styles.row}>
        <View style={styles.iconBadge}>
          <Ionicons name={opportunity.icon} size={19} color={colors.warning} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{opportunity.title}</Text>
          <Text style={styles.body}>{opportunity.body}</Text>
        </View>
      </View>
      {opportunity.action !== 'none' || (opportunity.investingRelated && onLearn) ? (
        <View style={styles.buttonRow}>
          {opportunity.action !== 'none' ? (
            <TouchableOpacity style={styles.button} onPress={() => onAction(opportunity.action)}>
              <Text style={styles.buttonText}>{opportunity.actionLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {opportunity.investingRelated && onLearn ? (
            <TouchableOpacity style={styles.learnLink} onPress={onLearn}>
              <Ionicons name="school-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.learnText}>New to investing?</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
