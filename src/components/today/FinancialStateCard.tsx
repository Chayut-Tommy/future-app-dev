import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { WARNING_TEXT_LIGHT_OVERRIDE } from '../../theme/contrastOverrides';
import {
  FinancialState,
  describeFinancialStateForToday,
  resolveFinancialRebuildGoalActionLabel,
} from '../../lib/calculations/financialState';

export interface FinancialStateActionHandlers {
  income: () => void;
  bills: () => void;
  spending: () => void;
  /** Financial Rebuild only — routes to the existing Wealth/net-worth
   * destination. */
  reviewNetWorth: () => void;
  /** Financial Rebuild only — opens the existing Add Goal route/sheet, or
   * routes to the existing Goals list, depending on hasActiveGoal (see
   * resolveFinancialRebuildGoalActionLabel). */
  goal: () => void;
}

/**
 * Replaces the old DebtRecoveryCard — one shared, factual card for both
 * non-standard financial states (Cashflow Focus, Financial Rebuild),
 * reading its label/headline/body entirely from
 * describeFinancialStateForToday (PRD ask: no screen invents its own
 * copy). Deliberately only ever offers neutral, state-relevant actions —
 * never a debt- or savings-specific action, which would read as Navilo
 * prescribing a strategy rather than stating a fact.
 *
 * Device-test correction round — Cashflow Focus and Financial Rebuild no
 * longer share one generic three-action set. Add income/Add bills/Review
 * spending are cashflow-relevant and stay exclusive to Cashflow Focus;
 * Financial Rebuild (a negative-NET-WORTH state — income/bills/spending
 * are largely beside the point there) now shows exactly two actions:
 * Review net worth, and Add a goal/Review goals depending on whether an
 * active goal already exists. computeFinancialState and its thresholds
 * are unchanged — only this presentation layer's action mapping.
 */
export function FinancialStateCard({
  state,
  actions,
  hasActiveGoal,
}: {
  state: FinancialState;
  actions: FinancialStateActionHandlers;
  /** Only consulted for the financial_rebuild action label — ignored
   * (may be omitted) for cashflow_focus. */
  hasActiveGoal?: boolean;
}) {
  const { colors, radius, spacing, typography, scheme } = useTheme();
  const copy = describeFinancialStateForToday(state);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.warningSoft, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg },
        eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
        // Pass 2E contrast correction — see WARNING_TEXT_LIGHT_OVERRIDE.
        eyebrow: { ...typography.micro, fontSize: 11, color: scheme === 'light' ? WARNING_TEXT_LIGHT_OVERRIDE : colors.warning, fontWeight: '700', letterSpacing: 0.5 },
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
    [colors, radius, spacing, typography, scheme]
  );

  if (!copy) return null;

  // Device-test correction round — Financial Rebuild (negative net worth)
  // gets its own two-action set, genuinely relevant to that state; every
  // other non-standard state (Cashflow Focus) keeps the original three.
  const actionSpecs: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] =
    state.key === 'financial_rebuild'
      ? [
          { key: 'reviewNetWorth', label: 'Review net worth', icon: 'bar-chart-outline', onPress: actions.reviewNetWorth },
          { key: 'goal', label: resolveFinancialRebuildGoalActionLabel(!!hasActiveGoal), icon: 'flag-outline', onPress: actions.goal },
        ]
      : [
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
          <TouchableOpacity
            key={a.key}
            style={styles.actionChip}
            onPress={a.onPress}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <Ionicons name={a.icon} size={14} color={colors.warning} importantForAccessibility="no" />
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
