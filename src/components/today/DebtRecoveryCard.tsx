import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { DebtRecoveryStatus } from '../../lib/calculations/debtRecovery';
import { brand } from '../../lib/brand';

export interface DebtRecoveryAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

/**
 * Replaces the usual recommendation card whenever Debt Recovery Mode is
 * active (PRD ask: "you are rebuilding," not "you are failing" — calm
 * amber wording, never red, always paired with concrete next steps).
 */
export function DebtRecoveryCard({ status, actions }: { status: DebtRecoveryStatus; actions: DebtRecoveryAction[] }) {
  const { colors, radius, spacing, typography } = useTheme();

  const body = status.expensesExceedIncome
    ? `${brand.name}'s focus is to help you improve your cashflow and reduce debt.`
    : `${brand.name}'s focus is to help you reduce debt and grow your assets.`;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.warningSoft, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg },
        eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
        eyebrow: { ...typography.micro, fontSize: 11, color: colors.warning, fontWeight: '700', letterSpacing: 0.5 },
        headline: { ...typography.heading, fontSize: 16, color: colors.textPrimary, marginBottom: 4 },
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        actionChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
        },
        actionText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <View style={styles.eyebrowRow}>
        <Ionicons name="heart" size={14} color={colors.warning} />
        <Text style={styles.eyebrow}>DEBT RECOVERY MODE</Text>
      </View>
      <Text style={styles.headline}>You're in rebuild mode.</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actionsRow}>
        {actions.map((a) => (
          <TouchableOpacity key={a.key} style={styles.actionChip} onPress={a.onPress} activeOpacity={0.7}>
            <Ionicons name={a.icon} size={14} color={colors.warning} />
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
