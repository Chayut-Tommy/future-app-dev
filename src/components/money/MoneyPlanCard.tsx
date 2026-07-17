import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeMoneyPlan } from '../../lib/calculations/moneyPlan';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { DebtCoachSheet } from '../debt/DebtCoachSheet';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * "{brand.name} Money Allocation" — a waterfall, not a ledger: Income → Bills →
 * Savings → Goals → Unallocated, so it's immediately obvious where every
 * dollar is currently allocated (PRD ask, §6). The concrete dated view of
 * salary/bills already lives in the "What happens next" timeline above
 * this card — repeating it here just duplicated the same information, so
 * this card now only answers "where does it go," not "when." Every number
 * reuses the exact same computeMoneyPlan/computeSafeToSpend engines as
 * Money Flow and the hero, so nothing here can contradict them.
 */
export function MoneyPlanCard() {
  const { data } = useAppState();
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const [investVisible, setInvestVisible] = useState(false);
  const [savingsVisible, setSavingsVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);

  const plan = useMemo(() => computeMoneyPlan(data), [data]);
  const hasDebt = data.liabilities.length > 0;
  const income = data.user.monthlyIncome;

  const steps = [
    { key: 'income', label: 'Income', value: income, icon: 'cash' as const, iconColor: colors.accent, iconBg: colors.accentSoft, sign: 1 },
    { key: 'bills', label: 'Bills', value: plan.billsSetAside, icon: 'calendar' as const, iconColor: colors.navy, iconBg: colors.navySoft, sign: -1 },
    { key: 'savings', label: 'Savings', value: plan.emergencySetAside, icon: 'trending-up' as const, iconColor: colors.aiBlue, iconBg: colors.aiBlueSoft, sign: -1 },
    { key: 'goals', label: 'Goals', value: plan.goalsSetAside, icon: 'flag' as const, iconColor: colors.purple, iconBg: colors.purpleSoft, sign: -1 },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
        stepIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        stepLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, flex: 1, fontWeight: '600' },
        stepValue: { ...typography.heading, fontSize: 14 },
        arrowRow: { alignItems: 'center', paddingVertical: 1 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
        unallocatedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        unallocatedLabel: { ...typography.body, fontSize: 15, color: colors.textPrimary, fontWeight: '700' },
        unallocatedValue: { ...typography.heading, fontSize: 18, color: colors.accentStrong },
        unallocatedExplainer: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
        surplusBox: {
          marginTop: spacing.md,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          padding: spacing.md,
        },
        surplusText: { ...typography.body, fontSize: 13, color: colors.accentStrong, fontWeight: '600', marginBottom: spacing.sm },
        surplusActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
        surplusButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: 7,
          paddingHorizontal: spacing.md,
          ...cardShadow,
        },
        surplusButtonText: { ...typography.micro, fontSize: 11, color: colors.textPrimary, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  return (
    <SectionCard>
      <Text style={styles.title}>{brand.name} Money Allocation</Text>
      <Text style={styles.subtitle}>{plan.monthLabel} — where every dollar is currently allocated</Text>

      {income <= 0 ? (
        <Text style={styles.emptyText}>Add your income and {brand.name} will map out your money plan here.</Text>
      ) : (
        <>
          {steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              <View style={styles.stepRow}>
                <View style={[styles.stepIcon, { backgroundColor: step.iconBg }]}>
                  <Ionicons name={step.icon} size={15} color={step.iconColor} />
                </View>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={[styles.stepValue, { color: step.sign > 0 ? colors.accentStrong : colors.textPrimary }]}>
                  {step.sign > 0 ? '+' : '-'}
                  {formatMoney(Math.abs(step.value))}
                </Text>
              </View>
              {idx < steps.length - 1 ? (
                <View style={styles.arrowRow}>
                  <Ionicons name="arrow-down" size={14} color={colors.textMuted} />
                </View>
              ) : null}
            </React.Fragment>
          ))}

          <View style={styles.divider} />

          <View style={styles.unallocatedRow}>
            <Text style={styles.unallocatedLabel}>Unallocated</Text>
            <Text style={styles.unallocatedValue}>{formatMoney(plan.available)}</Text>
          </View>
          <Text style={styles.unallocatedExplainer}>Available after planned bills, savings and goals.</Text>

          {plan.surplus ? (
            <View style={styles.surplusBox}>
              <Text style={styles.surplusText}>Consider putting this toward investing, extra savings or your goals.</Text>
              <View style={styles.surplusActions}>
                <TouchableOpacity style={styles.surplusButton} onPress={() => setInvestVisible(true)}>
                  <Ionicons name="trending-up-outline" size={13} color={colors.accentStrong} />
                  <Text style={styles.surplusButtonText}>Explore investing</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.surplusButton} onPress={() => setSavingsVisible(true)}>
                  <Ionicons name="lock-closed-outline" size={13} color={colors.accentStrong} />
                  <Text style={styles.surplusButtonText}>Explore saving more</Text>
                </TouchableOpacity>
                {hasDebt ? (
                  <TouchableOpacity style={styles.surplusButton} onPress={() => setDebtCoachVisible(true)}>
                    <Ionicons name="card-outline" size={13} color={colors.accentStrong} />
                    <Text style={styles.surplusButtonText}>Compare repayment options</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}
        </>
      )}

      <AddWealthItemModal visible={investVisible} kind="asset" presetAssetType="etf" onClose={() => setInvestVisible(false)} />
      <AddWealthItemModal visible={savingsVisible} kind="asset" presetAssetType="savings" onClose={() => setSavingsVisible(false)} />
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
    </SectionCard>
  );
}
