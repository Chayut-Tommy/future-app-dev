import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { FinancialState, FinancialStateActionSpec, describeFinancialStateForToday } from '../../lib/calculations/financialState';

export interface FinancialStateActionHandlers {
  income: () => void;
  bills: () => void;
  spending: () => void;
}

/**
 * Replaces the old DebtRecoveryCard — one shared, factual card for both
 * non-standard financial states (Cashflow Focus, Financial Rebuild),
 * reading its label/headline/body entirely from
 * describeFinancialStateForToday (PRD ask: no screen invents its own
 * copy). Deliberately only ever offers the three neutral actions — never a
 * debt- or savings-specific action, which would read as Navilo
 * prescribing a strategy rather than stating a fact.
 */
export function FinancialStateCard({ state, actions }: { state: FinancialState; actions: FinancialStateActionHandlers }) {
  const { colors, radius, spacing, typography } = useTheme();
  const copy = describeFinancialStateForToday(state);

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

  if (!copy) return null;

  const actionSpecs: (FinancialStateActionSpec & { icon: keyof typeof Ionicons.glyphMap; onPress: () => void })[] = [
    { key: 'income', label: 'Add income', icon: 'cash-outline', onPress: actions.income },
    { key: 'bills', label: 'Add bills', icon: 'calendar-outline', onPress: actions.bills },
    { key: 'spending', label: 'Review spending', icon: 'search-outline', onPress: actions.spending },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.eyebrowRow}>
        <Ionicons name="heart" size={14} color={colors.warning} />
        <Text style={styles.eyebrow}>{copy.label.toUpperCase()}</Text>
      </View>
      <Text style={styles.headline}>{copy.headline}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <View style={styles.actionsRow}>
        {actionSpecs.map((a) => (
          <TouchableOpacity key={a.key} style={styles.actionChip} onPress={a.onPress} activeOpacity={0.7}>
            <Ionicons name={a.icon} size={14} color={colors.warning} />
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
