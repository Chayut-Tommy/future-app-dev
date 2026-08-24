import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { Button } from '../../components/shared/Button';
import { computeSpendingInsights } from '../../lib/calculations/spendingInsights';
import { resolveTransactionAggregateSpendingAmount } from '../../lib/calculations/repaymentAccounting';
import { AppData, Transaction } from '../../types/models';
import { brand } from '../../lib/brand';

interface MonthGroup {
  key: string;
  label: string;
  transactions: Transaction[];
  income: number;
  expenses: number;
  net: number;
}

/** 2D-NARROW correction, Gate 5 — a clarifying line for a repayment-type
 * transaction's row, so it stays visible and understandable even where it's
 * excluded wholly or partly from the month's spending header (see
 * repaymentAccounting.ts's own doc comment for the underlying accounting
 * contract this describes). Returns null for an ordinary bill/income/ad-hoc
 * transaction — no badge, no change from existing presentation. The row's
 * own amount is always the transaction's full recorded payment (the real
 * money that moved) — this only explains how much, if any, of it counts as
 * spending; it never re-labels the amount field itself. */
function repaymentBadge(data: AppData, t: Transaction): string | null {
  if (t.isRepayment) return 'Repayment — not counted as spending';
  if (t.isLoanRepayment) {
    if (t.principalAmount === undefined) return 'Balance not updated — split unknown';
    if (t.principalAmount === 0) return 'All interest — no change to recorded balance';
    const interest = Math.max(0, t.amount - t.principalAmount);
    if (interest === 0) return `$${Math.round(t.principalAmount).toLocaleString()} to principal — no interest`;
    return `$${Math.round(t.principalAmount).toLocaleString()} principal, $${Math.round(interest).toLocaleString()} interest`;
  }
  if (t.recurringItemId) {
    const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
    if (item?.linkedLiabilityId) {
      const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
      if (liability?.type === 'bnpl') return 'Repayment — not counted as spending';
    }
  }
  return null;
}

function groupByMonth(data: AppData): MonthGroup[] {
  const transactions = data.transactions;
  const map = new Map<string, Transaction[]>();
  transactions.forEach((t) => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, txns]) => {
      const sorted = [...txns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const income = txns.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      // Final three-measure accounting correction — the month HEADER total
      // is an AGGREGATE-SPENDING presentation ("this month you spent $X"),
      // so it uses resolveTransactionAggregateSpendingAmount, the SAME
      // resolver monthlySummary.ts's computeMonthToDateActivity uses for
      // This Month's own "Spent" figure — never the cashflow resolver
      // (reserved for Financial State's Recorded Cashflow alone). An
      // ordinary bill counts in full (proven correct by the device test), a
      // credit-card/BNPL repayment resolves to $0, a loan repayment
      // resolves to its known interest/fees portion (or the full amount
      // when interest-only), and an UNKNOWN-split loan repayment resolves
      // to $0 here specifically — real cash left the account, but Navilo
      // cannot identify any of it as an expense, so it must never inflate
      // this "spending" header (see repaymentAccounting.ts's module header
      // for the full three-measure contract). The individual transaction
      // ROW for that payment is completely unaffected — it still shows the
      // full amount paid, labelled "Balance not updated — split unknown"
      // (repaymentBadge below) — only this month total's composition
      // changed.
      const expenses = txns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + resolveTransactionAggregateSpendingAmount(data, t), 0);
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return { key, label, transactions: sorted, income, expenses, net: income - expenses };
    });
}

/**
 * Transactions — a monthly money timeline, not a spreadsheet (PRD ask):
 * grouped by month with an income/expense/net summary per month, most
 * recent month expanded by default, older months collapsed to their totals.
 */
export function TransactionsScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const { colors, spacing, typography, cardShadow, radius } = useTheme();
  // Wave 9b — the shipped role resolver; tokens.typography carries no fontFamily.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const categoryMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const recurringItemsMap = useMemo(() => new Map(data.recurringItems.map((r) => [r.id, r])), [data.recurringItems]);
  // The transaction's own primary display identity (e.g. "Internet test"),
  // separate from its spending category — never overloads categoryId with
  // an arbitrary bill name (regression-protection review, B2.0B transaction-
  // identity correction §1). `note` is an immutable snapshot taken at
  // confirmation time, so a later rename/delete of the source never changes
  // it. Pre-existing linked transactions from before this snapshot existed
  // fall back to the recurring item's CURRENT label, purely for display —
  // this never writes anything back to the transaction itself. Manual,
  // non-recurring transactions have neither, so this returns null and the
  // row falls back to category-only display exactly as before.
  function transactionDisplayLabel(t: Transaction): string | null {
    if (t.note) return t.note;
    if (t.recurringItemId) return recurringItemsMap.get(t.recurringItemId)?.label ?? null;
    return null;
  }
  const monthGroups = useMemo(() => groupByMonth(data), [data]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set(monthGroups[0] ? [monthGroups[0].key] : []));
  const insights = useMemo(() => computeSpendingInsights(data), [data]);

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openAdd() {
    setEditTransaction(null);
    setVisible(true);
  }

  function closeModal() {
    setVisible(false);
    setEditTransaction(null);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        listContent: { paddingBottom: spacing.xxl * 2 },
        emptyContainer: { flexGrow: 1, justifyContent: 'center' },
        monthCard: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        monthLabel: { ...typeStyle('titleCard', locale), fontSize: 15, color: colors.textPrimary },
        summaryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        summaryBlock: { flex: 1, alignItems: 'center' },
        summaryLabel: { ...typeStyle('labelTab', locale), color: colors.textSecondary },
        summaryValue: { ...typeStyle('titleCard', locale), fontSize: 14, marginTop: 2 },
        txnList: { marginTop: spacing.sm, paddingTop: spacing.xs },
        txnRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        txnLeft: { flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: 1 },
        txnDescription: { ...typeStyle('body', locale), fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        txnMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        categoryChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        categoryChipText: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
        txnDate: { ...typeStyle('labelTab', locale), color: colors.textMuted },
        txnBadge: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', marginTop: 1 },
        rowAmount: { ...typeStyle('titleCard', locale), fontSize: 14, marginRight: 6 },
        insightsTitle: { ...typeStyle('titleCard', locale), fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm },
        insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
        insightIconBadge: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.marketSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        insightTextBlock: { flex: 1 },
        insightHeading: { ...typeStyle('meta', locale), fontSize: 13, fontWeight: '600', color: colors.textPrimary },
        insightBody: { ...typeStyle('labelTab', locale), color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
        teaserBody: { ...typeStyle('meta', locale), fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, spacing, typography, locale, cardShadow, radius]
  );

  const insightsPanel =
    data.transactions.filter((t) => t.type === 'expense').length === 0 ? (
      <SectionCard>
        <Text style={styles.insightsTitle}>Want personalised spending insights?</Text>
        <Text style={styles.teaserBody}>Add transactions and {brand.name} will identify patterns, opportunities, and habits.</Text>
      </SectionCard>
    ) : insights.length > 0 ? (
      <SectionCard>
        <Text style={styles.insightsTitle}>Spending Insights</Text>
        {insights.map((insight) => (
          <View key={insight.title} style={styles.insightRow}>
            <View style={styles.insightIconBadge}>
              <Ionicons name={insight.icon} size={15} color={colors.market} />
            </View>
            <View style={styles.insightTextBlock}>
              <Text style={styles.insightHeading}>{insight.title}</Text>
              <Text style={styles.insightBody}>{insight.body}</Text>
            </View>
          </View>
        ))}
      </SectionCard>
    ) : null;

  return (
    <Screen
      scroll={false}
      title="Transactions"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      headerRight={<Button label="+ Add" onPress={openAdd} />}
    >
      <FlatList
        data={monthGroups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={insightsPanel}
        contentContainerStyle={monthGroups.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No transactions yet"
            body={`Transactions are optional — ${brand.name} already works from your income and balances. Log one here anytime you want spending-level detail.`}
            actionLabel="Add transaction"
            onAction={openAdd}
          />
        }
        renderItem={({ item: group }) => {
          const expanded = expandedMonths.has(group.key);
          return (
            <View style={styles.monthCard}>
              <TouchableOpacity style={styles.monthHeader} onPress={() => toggleMonth(group.key)} activeOpacity={0.7}>
                <Text style={styles.monthLabel}>{group.label}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.summaryRow}>
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryLabel}>Income</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>+${group.income.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryLabel}>Expenses</Text>
                  <Text style={[styles.summaryValue, { color: colors.danger }]}>-${group.expenses.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryLabel}>Net</Text>
                  <Text style={[styles.summaryValue, { color: group.net >= 0 ? colors.success : colors.danger }]}>
                    {group.net >= 0 ? '+' : '-'}${Math.abs(group.net).toLocaleString()}
                  </Text>
                </View>
              </View>

              {expanded ? (
                <View style={styles.txnList}>
                  {group.transactions.map((item) => {
                    const category = categoryMap.get(item.categoryId);
                    const displayLabel = transactionDisplayLabel(item);
                    const badge = repaymentBadge(data, item);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.txnRow}
                        activeOpacity={0.7}
                        onPress={() => {
                          setEditTransaction(item);
                          setVisible(true);
                        }}
                      >
                        <View style={styles.txnLeft}>
                          {displayLabel ? <Text style={styles.txnDescription}>{displayLabel}</Text> : null}
                          <View style={styles.txnMetaRow}>
                            <View style={styles.categoryChip}>
                              <Text style={styles.categoryChipText}>{category?.name ?? 'Other'}</Text>
                            </View>
                            <Text style={styles.txnDate}>{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                          </View>
                          {badge ? <Text style={styles.txnBadge}>{badge}</Text> : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.rowAmount, { color: item.type === 'income' ? colors.success : colors.danger }]}>
                            {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        }}
      />
      <QuickAddModal visible={visible} onClose={closeModal} editTransaction={editTransaction} />
    </Screen>
  );
}
