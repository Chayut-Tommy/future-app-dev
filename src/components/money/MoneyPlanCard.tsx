import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeMoneyPlan } from '../../lib/calculations/moneyPlan';
import { deriveDisplayedWaterfall } from '../../lib/calculations/moneyWaterfall';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { DebtCoachSheet } from '../debt/DebtCoachSheet';
import { MoneyFlowCategoryDetailSheet } from './MoneyFlowCategoryDetailSheet';
import { computeMoneyFlowCategoryBreakdown, MoneyFlowCategory } from '../../lib/calculations/moneyFlowBreakdown';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import { brand } from '../../lib/brand';

const CATEGORY_LABELS: Record<MoneyFlowCategory, string> = { income: 'Income', bills: 'Bills', savings: 'Savings', goals: 'Goals' };

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * "Typical Monthly Allocation" — a waterfall, not a ledger: Income → Bills →
 * Savings → Goals → Unallocated, so it's immediately obvious where every
 * dollar of a typical month is allocated (PRD ask, §6). The concrete dated
 * view of salary/bills already lives in the "What happens next" timeline
 * above this card — repeating it here just duplicated the same information,
 * so this card now only answers "where does it typically go," not "when."
 *
 * Every row here is a pure recurring-rate figure (income/bills/savings/
 * goals/unallocated-or-shortfall) — deliberately never blended with actual
 * transaction activity from any calendar window (PRD ask: "Typical" must not
 * silently mix in ad-hoc income or pay-cycle-to-date spend, which is what the
 * old `plan.available` did — `plan.available` stays untouched for Wealth's
 * "Estimated wealth change this month," which intentionally wants the
 * actual-activity-inclusive figure). Unallocated/Plan shortfall reads a
 * locally derived signed `typicalNet` (income − bills − savings − goals),
 * not `plan.discretionaryPool` — that field floors at 0 for callers that
 * need a non-negative allowance (e.g. the hero's cycle math), which would
 * hide a genuine shortfall behind a misleading $0 here (PRD ask).
 *
 * Correction pass, 2026-08-10 — this card is only ever rendered as a child
 * of MoneyScreen (`{data.user.monthlyIncome > 0 ? <MoneyPlanCard /> : null}`),
 * which already owns AddIncomeModal/AddRecurringItemModal/AddGoalModal/
 * EditSavingsAllocationModal for its own equivalent CTAs. An earlier draft
 * of this round mounted a second, independent instance of each of those
 * four forms here — the smallest-shared-callback architecture below
 * removes that duplication: the four zero-state CTAs below call up to
 * parent-owned callbacks instead of managing local visibility state and a
 * second copy of each form.
 */
export function MoneyPlanCard({
  onAddIncome,
  onAddBill,
  onAddGoal,
  onManageSavingsAllocation,
}: {
  onAddIncome: () => void;
  onAddBill: () => void;
  onAddGoal: () => void;
  onManageSavingsAllocation: () => void;
}) {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const [investVisible, setInvestVisible] = useState(false);
  const [savingsVisible, setSavingsVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  // Correction round, 2026-08-10 — Typical Monthly Allocation's own
  // instance of the shared MoneyFlowCategoryDetailSheet, always at
  // 'monthly' — never inherits Typical Money Flow's Weekly/Fortnightly
  // toggle, since the two are entirely separate state.
  const [flowDetailCategory, setFlowDetailCategory] = useState<MoneyFlowCategory | null>(null);
  const currentDate = useCurrentLocalDate();

  const plan = useMemo(() => computeMoneyPlan(data), [data]);
  const hasDebt = data.liabilities.length > 0;
  const income = data.user.monthlyIncome;
  // Bills/Savings/Goals rounded INDEPENDENTLY (never as a combined figure —
  // Savings and Goals are separate displayed rows here, unlike Typical
  // Money Flow's single combined row), then Unallocated/Plan shortfall is
  // derived as a balancing plug from those already-rounded values —
  // guarantees the five numbers actually on screen always sum exactly (PRD
  // bug report: independently rounding a combined Savings+Goals figure, or
  // independently rounding the raw net, can each disagree from the sum of
  // the separately-displayed rows by $1). Shared with Typical Money Flow
  // via deriveDisplayedWaterfall so the two cards can't drift onto
  // different rounding behaviour.
  const { displayedIncome, displayedDeductions, displayedNet: typicalNet } = deriveDisplayedWaterfall(income, [
    plan.billsSetAside,
    plan.emergencySetAside,
    plan.goalsSetAside,
  ]);
  const [displayedBills, displayedSavings, displayedGoals] = displayedDeductions;

  const steps = [
    { key: 'income', label: 'Income', value: displayedIncome, icon: 'cash' as const, iconColor: colors.accent, iconBg: colors.accentSoft, sign: 1 },
    { key: 'bills', label: 'Bills', value: displayedBills, icon: 'calendar' as const, iconColor: colors.navy, iconBg: colors.navySoft, sign: -1 },
    { key: 'savings', label: 'Savings', value: displayedSavings, icon: 'trending-up' as const, iconColor: colors.aiBlue, iconBg: colors.aiBlueSoft, sign: -1 },
    { key: 'goals', label: 'Goals', value: displayedGoals, icon: 'flag' as const, iconColor: colors.purple, iconBg: colors.purpleSoft, sign: -1 },
  ];

  // Correction round, 2026-08-10 — the same shared, itemised breakdown
  // Typical Money Flow uses, always parameterised 'monthly' here. Never
  // recomputes fixedExpensesMonthly/bnplMonthlyExpected/etc independently —
  // computeMoneyFlowCategoryBreakdown itself reuses computeSafeToSpend's
  // own totals.
  const flowDetailBreakdown = useMemo(
    () => (flowDetailCategory ? computeMoneyFlowCategoryBreakdown(data, flowDetailCategory, 'monthly', currentDate) : null),
    [flowDetailCategory, data, currentDate]
  );

  function flowDetailEmptyState(): { text: string; ctaLabel: string | null; onCta: (() => void) | null } {
    if (!flowDetailCategory || !flowDetailBreakdown) return { text: '', ctaLabel: null, onCta: null };
    const state = flowDetailBreakdown.configurationState;
    switch (flowDetailCategory) {
      case 'income':
        return state === 'not_configured'
          ? { text: 'No regular income is set up yet.', ctaLabel: 'Add income', onCta: onAddIncome }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'Your income sources are currently inactive.'
                  : "Your income is currently $0 once rounded — it's still set up.",
              ctaLabel: 'Manage income',
              onCta: onAddIncome,
            };
      case 'bills':
        return state === 'not_configured'
          ? { text: 'No regular bills are set up yet.', ctaLabel: 'Add bill', onCta: onAddBill }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'Your bills are currently inactive.'
                  : "Your bills are currently $0 once rounded — they're still set up.",
              ctaLabel: 'Manage bills',
              onCta: onAddBill,
            };
      case 'savings':
        return state === 'not_configured'
          ? { text: 'No savings allocation is set up yet.', ctaLabel: 'Set up savings allocation', onCta: onManageSavingsAllocation }
          : {
              text: "Your savings allocation is currently $0 because there's no regular income to calculate it from.",
              ctaLabel: 'Manage savings allocation',
              onCta: onManageSavingsAllocation,
            };
      case 'goals':
        return state === 'not_configured'
          ? { text: 'No goals are set up yet.', ctaLabel: 'Add goal', onCta: onAddGoal }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'You have goals set up, but none are currently active.'
                  : 'You have goals set up, but nothing is currently allocated to them each month.',
              ctaLabel: 'View goals',
              onCta: () => navigation.navigate('Goals'),
            };
    }
  }
  const flowDetailEmpty = flowDetailEmptyState();

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
      <Text style={styles.title}>Typical Monthly Allocation</Text>
      <Text style={styles.subtitle}>Based on your typical monthly setup.</Text>

      {income <= 0 ? (
        <Text style={styles.emptyText}>Add your income and {brand.name} will map out your money plan here.</Text>
      ) : (
        <>
          {steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              <TouchableOpacity
                style={styles.stepRow}
                activeOpacity={0.7}
                onPress={() => setFlowDetailCategory(step.key as MoneyFlowCategory)}
                accessibilityRole="button"
                accessibilityLabel={`${step.label}, ${formatMoney(Math.abs(step.value))}`}
                accessibilityHint="Opens a breakdown of what makes up this amount"
              >
                <View style={[styles.stepIcon, { backgroundColor: step.iconBg }]}>
                  <Ionicons name={step.icon} size={15} color={step.iconColor} />
                </View>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={[styles.stepValue, { color: step.sign > 0 ? colors.accentStrong : colors.textPrimary }]}>
                  {step.sign > 0 ? '+' : '-'}
                  {formatMoney(Math.abs(step.value))}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
              {idx < steps.length - 1 ? (
                <View style={styles.arrowRow}>
                  <Ionicons name="arrow-down" size={14} color={colors.textMuted} />
                </View>
              ) : null}
            </React.Fragment>
          ))}

          <View style={styles.divider} />

          <View style={styles.unallocatedRow}>
            <Text style={styles.unallocatedLabel}>{typicalNet >= 0 ? 'Unallocated' : 'Plan shortfall'}</Text>
            <Text style={[styles.unallocatedValue, typicalNet < 0 ? { color: colors.warning } : null]}>{formatMoney(Math.abs(typicalNet))}</Text>
          </View>
          <Text style={styles.unallocatedExplainer}>
            {typicalNet >= 0
              ? 'Typically left over after planned bills, savings and goals.'
              : 'Planned bills, savings and goals typically add up to more than a normal month\'s income.'}
          </Text>

          {typicalNet > 50 ? (
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

      <MoneyFlowCategoryDetailSheet
        visible={flowDetailCategory !== null}
        onClose={() => setFlowDetailCategory(null)}
        categoryLabel={flowDetailCategory ? CATEGORY_LABELS[flowDetailCategory] : ''}
        periodLabel="Monthly"
        totalCents={flowDetailBreakdown?.totalCents ?? 0}
        items={flowDetailBreakdown?.items ?? []}
        emptyStateText={flowDetailEmpty.text || null}
        ctaLabel={flowDetailEmpty.ctaLabel}
        onCta={flowDetailEmpty.onCta}
      />
    </SectionCard>
  );
}
