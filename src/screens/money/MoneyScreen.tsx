import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { OptionsSheet } from '../../components/shared/OptionsSheet';
import { InfoSheet } from '../../components/shared/InfoSheet';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddRecurringItemModal } from '../../components/money/AddRecurringItemModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { SafeToSpendHero } from '../../components/money/SafeToSpendHero';
import { SelectBalancesSheet } from '../../components/money/SelectBalancesSheet';
import { SavingsAllocationDetailSheet } from '../../components/money/SavingsAllocationDetailSheet';
import { EditSavingsAllocationModal } from '../../components/wealth/EditSavingsAllocationModal';
import { MoneyPlanCard } from '../../components/money/MoneyPlanCard';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { computeMonthlySummary, describeCashflowMessage, computeAdHocIncome } from '../../lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../../lib/calculations/spendingInsights';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { computeMoneyPlan } from '../../lib/calculations/moneyPlan';
import { FlowPeriod, flowPeriodNoun, fromMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { computeMoneyHeroCopy } from '../../lib/calculations/moneyPersona';
import { computeMoneyTimeline, computeAttentionItems } from '../../lib/calculations/moneyTimeline';
import { MoneyTimelineCard } from '../../components/money/MoneyTimelineCard';
import { computeDebtCoachSummary, computeHasAnyDebt } from '../../lib/calculations/debtCoach';
import { DebtCoachSheet } from '../../components/debt/DebtCoachSheet';
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
  const { colors, spacing, typography, radius, cardShadow } = useTheme();
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [editIncome, setEditIncome] = useState<RecurringItem | null>(null);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [editBill, setEditBill] = useState<RecurringItem | null>(null);
  const [mortgageModalVisible, setMortgageModalVisible] = useState(false);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriod>('monthly');
  const [spentSheetVisible, setSpentSheetVisible] = useState(false);
  const [flowInfoVisible, setFlowInfoVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [selectBalancesVisible, setSelectBalancesVisible] = useState(false);
  const [addBalanceModalVisible, setAddBalanceModalVisible] = useState(false);
  const [savingsAllocationDetailVisible, setSavingsAllocationDetailVisible] = useState(false);
  const [savingsAllocationDetailDate, setSavingsAllocationDetailDate] = useState<Date | null>(null);
  const [editSavingsAllocationVisible, setEditSavingsAllocationVisible] = useState(false);

  const summary = useMemo(() => computeMonthlySummary(data), [data]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data), [data]);
  // Single source of truth for every "remaining"/"unallocated" figure this
  // screen shows (Money Breakdown and End of Month Outlook both read
  // plan.available/plan.surplus, never a separately-computed number) —
  // fixes the two figures previously disagreeing (PRD bug report, §3/§4).
  const plan = useMemo(() => computeMoneyPlan(data), [data]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const hasActiveGoals = data.goals.some((g) => g.status === 'active');
  // Starts at the same 30-day planning horizon as before; growing this as
  // the user scrolls near the bottom of the (now fixed-height) timeline box
  // is what lets recurring events keep appearing further out instead of the
  // list just stopping (PRD ask, §2). Capped well short of the simulation's
  // own 400-iteration ceiling in recurringSchedule.ts.
  const [timelineHorizonDays, setTimelineHorizonDays] = useState(30);
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, new Date(), timelineHorizonDays), [data, timelineHorizonDays]);
  const extendTimelineHorizon = useCallback(() => {
    setTimelineHorizonDays((days) => Math.min(180, days + 30));
  }, []);
  const attentionItems = useMemo(
    () => computeAttentionItems(timelineEvents, safeToSpend.cycleRemainingPool),
    [timelineEvents, safeToSpend.cycleRemainingPool]
  );
  const insights = useMemo(() => computeSpendingInsights(data), [data]);
  const hasExpenseTransactions = data.transactions.some((t) => t.type === 'expense');
  const hasDebt = computeHasAnyDebt(data);
  const debtSummary = useMemo(() => computeDebtCoachSummary(data), [data]);
  // Ad-hoc income logged this month (bonus, gift, refund) — added to Money
  // Flow's income figure directly, alongside recurring income, so a
  // one-off windfall is visibly reflected here too (PRD ask, §5).
  const adHocIncomeThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return computeAdHocIncome(data.transactions, monthStart, now);
  }, [data.transactions]);

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

  function handleTimelineEventPress(event: { kind: string; id: string; date: Date; recurringItemId?: string }) {
    // A Savings Allocation row is a display of the one shared user-level
    // setting on a given cycle date, not an independently editable
    // transaction (PRD ask) — handled before the recurringItemId guard
    // below, since these events never have one.
    if (event.kind === 'savings') {
      setSavingsAllocationDetailDate(event.date);
      setSavingsAllocationDetailVisible(true);
      return;
    }
    // Matched by recurringItemId, not the event id — the timeline now
    // repeats a recurring item across every occurrence in the horizon
    // (PRD ask, §2), so its id includes a per-occurrence date and can't be
    // reverse-matched to the source item by string equality any more.
    if (!event.recurringItemId) return;
    if (event.kind === 'bill' || event.kind === 'mortgage') {
      const item = data.recurringItems.find((r) => r.id === event.recurringItemId);
      if (item) {
        setEditBill(item);
        setBillModalVisible(true);
      }
    } else if (event.kind === 'income') {
      // Income events behave the same as bills (PRD ask, §4) — tapping one
      // opens that specific source's editor, not the generic "add income" flow.
      const item = data.recurringItems.find((r) => r.id === event.recurringItemId);
      if (item) {
        setEditIncome(item);
        setIncomeModalVisible(true);
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
  // Ad-hoc income is added after period conversion, not before — it's a
  // real amount that landed this calendar month, not a rate to be scaled
  // up/down by whichever period is selected (PRD ask, §5).
  const periodIncome = fromMonthlyAmount(data.user.monthlyIncome, flowPeriod) + adHocIncomeThisMonth;
  const periodBills = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly, flowPeriod);
  const periodSpent = fromMonthlyAmount(safeToSpend.spendSoFarThisCycle, flowPeriod);
  const periodAvailable = fromMonthlyAmount(plan.available, flowPeriod);
  // Raw (unfloored) monthly remainder including ad-hoc income — the same
  // figure plan.available/plan.surplus are built from, so End of Month
  // Outlook and Money Breakdown can never disagree (PRD bug report, §3/§4).
  const monthOutlookRaw = safeToSpend.remainingPool + adHocIncomeThisMonth;
  const flowRows = [
    {
      key: 'income',
      label: `Income this ${periodNoun}`,
      value: periodIncome,
      color: colors.accent,
      onPress: () => {
        setEditIncome(null);
        setIncomeModalVisible(true);
      },
    },
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
        flowInfoText: { ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },

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

        // Debt Overview
        debtTotalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
        debtTotalsLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
        debtTotalsValue: { ...typography.heading, fontSize: 18, color: colors.textPrimary },
        debtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
        debtTextBlock: { flex: 1 },
        debtLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        debtSub: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
      }),
    [colors, spacing, typography, radius, cardShadow]
  );

  return (
    <Screen title="Money" scrollRef={tabScrollRefs.Money}>
      <SafeToSpendHero
        safeToSpend={safeToSpend}
        hasActiveGoals={hasActiveGoals}
        onCreateGoal={() => setGoalModalVisible(true)}
        onAddPayday={() => {
          setEditIncome(null);
          setIncomeModalVisible(true);
        }}
        onSelectBalances={() => setSelectBalancesVisible(true)}
        heroCopy={heroCopy}
      />

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
          <MoneyTimelineCard events={timelineEvents} onEventPress={handleTimelineEventPress} onNearEnd={extendTimelineHorizon} />
        </SectionCard>
      )}

      {/* Spending Tracker — add, review, and understand spending in one
          place (PRD ask: users care about the outcome, not data entry).
          Comes right after the timeline: "what's happening" then "what
          have I already spent," before the cashflow/allocation views below
          that assume spending-to-date as an input. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending Tracker</Text>
        <TouchableOpacity onPress={() => setTransactionModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {!hasExpenseTransactions ? (
        <SectionCard>
          <Text style={styles.emptyText}>Add transactions to unlock spending insights.</Text>
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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Money Flow</Text>
        <TouchableOpacity onPress={() => setFlowInfoVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
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
                {monthOutlookRaw >= 0
                  ? `Approximately ${formatMoney(plan.available)} unallocated`
                  : `Approximately ${formatMoney(Math.abs(monthOutlookRaw))} short`}
              </Text>
              <Text style={styles.outlookExplainer}>
                {monthOutlookRaw >= 0
                  ? "Based on your current plan — income, bills, goals, and your savings plan already accounted for."
                  : describeCashflowMessage(summary)}
              </Text>
            </View>
          </SectionCard>
        </>
      ) : null}

      {hasDebt ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Debt Overview</Text>
          </View>
          <SectionCard>
            <View style={styles.debtTotalsRow}>
              <View>
                <Text style={styles.debtTotalsLabel}>Total debt</Text>
                <Text style={styles.debtTotalsValue}>{formatMoney(debtSummary.totalDebt)}</Text>
              </View>
              <View>
                <Text style={styles.debtTotalsLabel}>Monthly repayments</Text>
                <Text style={styles.debtTotalsValue}>{formatMoney(debtSummary.totalMonthlyRepayment)}</Text>
              </View>
            </View>
            {debtSummary.debts.map((d) => (
              <View key={d.id} style={styles.debtRow}>
                <Ionicons name={d.icon} size={16} color={colors.textSecondary} />
                <View style={styles.debtTextBlock}>
                  <Text style={styles.debtLabel}>{d.label}</Text>
                  <Text style={styles.debtSub}>
                    {formatMoney(d.balance)} remaining
                    {d.monthlyRepayment ? ` · ${formatMoney(d.monthlyRepayment)}/month` : ''}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.trackerFooterRow} onPress={() => setDebtCoachVisible(true)} activeOpacity={0.7}>
              <Text style={styles.flowLabel}>View full debt overview</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          </SectionCard>
        </>
      ) : null}

      <AddIncomeModal
        visible={incomeModalVisible}
        editItem={editIncome}
        onClose={() => {
          setIncomeModalVisible(false);
          setEditIncome(null);
        }}
      />
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
      <SelectBalancesSheet
        visible={selectBalancesVisible}
        onClose={() => setSelectBalancesVisible(false)}
        onAddBalance={() => setAddBalanceModalVisible(true)}
      />
      <AddWealthItemModal
        visible={addBalanceModalVisible}
        kind="asset"
        presetAssetType="cash"
        onClose={() => setAddBalanceModalVisible(false)}
      />
      <SavingsAllocationDetailSheet
        visible={savingsAllocationDetailVisible}
        onClose={() => setSavingsAllocationDetailVisible(false)}
        occurrenceDate={savingsAllocationDetailDate}
        onEditAllocation={() => setEditSavingsAllocationVisible(true)}
      />
      <EditSavingsAllocationModal visible={editSavingsAllocationVisible} onClose={() => setEditSavingsAllocationVisible(false)} />
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
      <InfoSheet visible={flowInfoVisible} onClose={() => setFlowInfoVisible(false)} title="About Money Flow">
        <Text style={styles.flowInfoText}>
          This view converts your recurring income, bills and spending into the selected time period so you can compare your cash flow
          consistently.
        </Text>
        <Text style={styles.flowInfoText}>Your actual payment dates remain unchanged — this only changes how the numbers are displayed.</Text>
      </InfoSheet>
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
    </Screen>
  );
}
