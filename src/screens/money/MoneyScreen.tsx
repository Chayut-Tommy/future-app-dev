import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { OptionsSheet } from '../../components/shared/OptionsSheet';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddRecurringItemModal } from '../../components/money/AddRecurringItemModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { SafeToSpendHero } from '../../components/money/SafeToSpendHero';
import { MoneyPlanCard } from '../../components/money/MoneyPlanCard';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { computeMonthlySummary, describeCashflowMessage } from '../../lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../../lib/calculations/spendingInsights';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { FlowPeriod, flowPeriodNoun, fromMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { computeMoneyHeroCopy } from '../../lib/calculations/moneyPersona';
import { computeMoneyTimeline, computeAttentionItems } from '../../lib/calculations/moneyTimeline';
import { MoneyTimelineCard } from '../../components/money/MoneyTimelineCard';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { RecurringItem } from '../../types/models';
import { brand } from '../../lib/brand';

const FLOW_PERIODS: { key: FlowPeriod; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'fortnightly', label: 'Fortnightly' },
  { key: 'monthly', label: 'Monthly' },
];

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * Money — Navilo's financial command centre (PRD ask: "I know exactly what
 * is happening with my money over the next 30 days," not "another
 * budgeting app"). The emphasis is forward-looking: a "what happens next"
 * timeline is the centrepiece, with only the highest-priority items
 * surfaced up front, rather than a wall of equally-weighted cards about
 * what already happened. Every figure here reads from the same shared
 * engines (computeSafeToSpend, computeMoneyTimeline) used across Wealth,
 * Today, and Grow — this screen only changes how they're presented.
 */
export function MoneyScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, spacing, typography, radius, cardShadow, aiAccentColor } = useTheme();
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [editBill, setEditBill] = useState<RecurringItem | null>(null);
  const [mortgageModalVisible, setMortgageModalVisible] = useState(false);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriod>('monthly');
  const [spentSheetVisible, setSpentSheetVisible] = useState(false);

  const summary = useMemo(() => computeMonthlySummary(data), [data]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data), [data]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const hasActiveGoals = data.goals.some((g) => g.status === 'active');
  const timelineEvents = useMemo(() => computeMoneyTimeline(data), [data]);
  const attentionItems = useMemo(() => computeAttentionItems(timelineEvents, safeToSpend.remainingPool), [timelineEvents, safeToSpend.remainingPool]);
  const insights = useMemo(() => computeSpendingInsights(data), [data]);
  const hasExpenseTransactions = data.transactions.some((t) => t.type === 'expense');

  function openAddBill() {
    setEditBill(null);
    setBillModalVisible(true);
  }

  function closeBillModal() {
    setBillModalVisible(false);
    setEditBill(null);
  }

  function handleSpentTap() {
    setSpentSheetVisible(true);
  }

  function handleSpentSheetSelect(key: string) {
    if (key === 'view') navigation.navigate('Transactions');
    else if (key === 'add') setTransactionModalVisible(true);
  }

  function handleTimelineEventPress(event: { kind: string; id: string }) {
    if (event.kind === 'bill' || event.kind === 'mortgage') {
      const item = data.recurringItems.find((r) => `bill-${r.id}` === event.id);
      if (item) {
        setEditBill(item);
        setBillModalVisible(true);
      }
    }
  }

  // Every underlying calculation stays monthly (Safe to Spend, bills,
  // goals) — the period toggle only rescales how Money Flow displays those
  // same numbers (PRD ask: "not everyone plans monthly," most relevant in
  // Australia where many are paid weekly/fortnightly).
  //
  // Bills/Spent/Available all read from the same computeSafeToSpend result
  // that powers the Safe to Spend hero and Lulu Money Plan below — not a
  // separately-computed monthly summary. Money Flow and Money Plan used to
  // show two different "Available" figures because they came from two
  // different calculations (fixed costs excluding credit card minimums vs.
  // including them, calendar-month spend vs. pay-cycle spend, and no goals/
  // savings buffer deducted at all) — one shared engine now, so they can
  // never contradict each other (PRD bug report).
  const periodNoun = flowPeriodNoun(flowPeriod);
  const periodIncome = fromMonthlyAmount(data.user.monthlyIncome, flowPeriod);
  const periodBills = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly, flowPeriod);
  const periodSpent = fromMonthlyAmount(safeToSpend.spendSoFarThisCycle, flowPeriod);
  const periodAvailable = fromMonthlyAmount(Math.max(0, safeToSpend.remainingPool), flowPeriod);
  const flowRows = [
    { key: 'income', label: `Income this ${periodNoun}`, value: periodIncome, color: colors.accent, onPress: () => setIncomeModalVisible(true) },
    { key: 'bills', label: `Bills this ${periodNoun}`, value: periodBills, color: colors.navy, onPress: undefined },
    { key: 'spent', label: `Spent this ${periodNoun}`, value: periodSpent, color: colors.warning, onPress: handleSpentTap },
    { key: 'available', label: `Available this ${periodNoun}`, value: periodAvailable, color: colors.successBright },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        link: { ...typography.micro, color: colors.accent, fontWeight: '700' },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

        // Money Flow period toggle
        periodToggleRow: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.pill,
          padding: 3,
          marginBottom: spacing.md,
        },
        periodToggleOption: { flex: 1, paddingVertical: 7, borderRadius: radius.pill, alignItems: 'center' },
        periodToggleOptionActive: { backgroundColor: colors.accent },
        periodToggleText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
        periodToggleTextActive: { color: colors.onAccent },

        // Money Flow bars
        barBlock: { marginBottom: spacing.md },
        barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
        barLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
        barValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },

        // Needs Your Attention
        attentionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        attentionIconBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        attentionText: { ...typography.body, fontSize: 13, color: colors.textPrimary, flex: 1 },

        // End of Month Outlook
        outlookBox: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
        },
        outlookLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: spacing.xs },
        outlookValue: { ...typography.title, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.xs },
        outlookExplainer: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

        // Spending Tracker insight cards
        trackerMessage: { ...typography.caption, fontSize: 12, fontStyle: 'italic', color: aiAccentColor, marginBottom: spacing.sm },
        insightCard: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          ...cardShadow,
        },
        insightIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.marketSoft, alignItems: 'center', justifyContent: 'center' },
        insightTextBlock: { flex: 1 },
        insightHeading: { ...typography.caption, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
        insightBody: { ...typography.micro, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
        trackerFooterRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: spacing.sm,
          marginTop: spacing.xs,
        },
        flowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
      }),
    [colors, spacing, typography, radius, cardShadow, aiAccentColor]
  );

  return (
    <Screen title="Money" scrollRef={tabScrollRefs.Money}>
      {data.user.monthlyIncome > 0 ? (
        <SafeToSpendHero
          safeToSpend={safeToSpend}
          monthlyIncome={data.user.monthlyIncome}
          hasActiveGoals={hasActiveGoals}
          onCreateGoal={() => setGoalModalVisible(true)}
          onAddPayday={() => setIncomeModalVisible(true)}
          heroCopy={heroCopy}
        />
      ) : null}

      {attentionItems.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs your attention</Text>
          </View>
          {attentionItems.map((item) => (
            <View key={item.id} style={styles.attentionRow}>
              <View style={[styles.attentionIconBadge, { backgroundColor: item.tone === 'warning' ? colors.warningSoft : colors.surfaceMuted }]}>
                <Ionicons name={item.icon} size={15} color={item.tone === 'warning' ? colors.warning : colors.textSecondary} />
              </View>
              <Text style={styles.attentionText}>{item.title}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>What happens next</Text>
        <TouchableOpacity onPress={openAddBill} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>+ Add bill</Text>
        </TouchableOpacity>
      </View>
      {timelineEvents.length === 0 ? (
        <SectionCard>
          <MoneyTimelineCard events={timelineEvents} />
        </SectionCard>
      ) : (
        <SectionCard>
          <MoneyTimelineCard events={timelineEvents} onEventPress={handleTimelineEventPress} />
        </SectionCard>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Money Flow</Text>
      </View>
      <SectionCard>
        <View style={styles.periodToggleRow}>
          {FLOW_PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodToggleOption, flowPeriod === p.key ? styles.periodToggleOptionActive : null]}
              onPress={() => setFlowPeriod(p.key)}
            >
              <Text style={[styles.periodToggleText, flowPeriod === p.key ? styles.periodToggleTextActive : null]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {flowRows.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={styles.barBlock}
            activeOpacity={row.onPress ? 0.7 : 1}
            onPress={row.onPress}
            disabled={!row.onPress}
          >
            <View style={styles.barLabelRow}>
              <Text style={styles.barLabel}>{row.label}</Text>
              <Text style={styles.barValue}>{row.key === 'income' && row.value <= 0 ? 'Add income' : formatMoney(row.value)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </SectionCard>

      {data.user.monthlyIncome > 0 ? <MoneyPlanCard /> : null}

      {data.user.monthlyIncome > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>End of month outlook</Text>
          </View>
          <SectionCard>
            <View style={styles.outlookBox}>
              <Text style={styles.outlookLabel}>Estimated end-of-cycle position</Text>
              <Text style={styles.outlookValue}>
                {safeToSpend.remainingPool >= 0
                  ? `Approximately ${formatMoney(safeToSpend.remainingPool)} unallocated`
                  : `Approximately ${formatMoney(Math.abs(safeToSpend.remainingPool))} short`}
              </Text>
              <Text style={styles.outlookExplainer}>
                {safeToSpend.remainingPool >= 0
                  ? "Based on your current plan — income, bills, goals, and your savings plan already accounted for."
                  : describeCashflowMessage(summary)}
              </Text>
            </View>
          </SectionCard>
        </>
      ) : null}

      {/* Spending Tracker — add, review, and understand spending in one
          place (PRD ask: users care about the outcome, not data entry). */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending Tracker</Text>
        <TouchableOpacity onPress={() => setTransactionModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {!hasExpenseTransactions ? (
        <SectionCard>
          <Text style={styles.trackerMessage}>Track spending and {brand.name} will find patterns for you.</Text>
          <Text style={styles.emptyText}>Log a few transactions and {brand.name} will start noticing patterns here.</Text>
        </SectionCard>
      ) : (
        <>
          {insights.map((insight) => (
            <View key={insight.title} style={styles.insightCard}>
              <View style={styles.insightIconBadge}>
                <Ionicons name={insight.icon} size={15} color={colors.market} />
              </View>
              <View style={styles.insightTextBlock}>
                <Text style={styles.insightHeading}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.trackerFooterRow} onPress={() => navigation.navigate('Transactions')} activeOpacity={0.7}>
            <Text style={styles.flowLabel}>View transaction history</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </TouchableOpacity>
        </>
      )}

      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <AddRecurringItemModal
        visible={billModalVisible}
        editItem={editBill}
        onClose={closeBillModal}
        onSelectMortgage={() => setMortgageModalVisible(true)}
      />
      <AddWealthItemModal
        visible={mortgageModalVisible}
        kind="liability"
        presetLiabilityType="mortgage"
        onClose={() => setMortgageModalVisible(false)}
      />
      <QuickAddModal visible={transactionModalVisible} onClose={() => setTransactionModalVisible(false)} />
      <AddGoalModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <OptionsSheet
        visible={spentSheetVisible}
        onClose={() => setSpentSheetVisible(false)}
        title="🛍 Spending"
        options={[
          { key: 'view', icon: 'bar-chart-outline', label: 'Spending Tracker', description: 'Review where it went' },
          { key: 'add', icon: 'add-circle-outline', label: 'Add Transaction', description: 'Log a new expense' },
        ]}
        onSelect={handleSpentSheetSelect}
      />
    </Screen>
  );
}
