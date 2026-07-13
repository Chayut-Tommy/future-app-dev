import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { Button } from '../../components/shared/Button';
import { computeSpendingInsights } from '../../lib/calculations/spendingInsights';
import { Transaction } from '../../types/models';
import { brand } from '../../lib/brand';

interface MonthGroup {
  key: string;
  label: string;
  transactions: Transaction[];
  income: number;
  expenses: number;
  net: number;
}

function groupByMonth(transactions: Transaction[]): MonthGroup[] {
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
      const expenses = txns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
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

  const categoryMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const monthGroups = useMemo(() => groupByMonth(data.transactions), [data.transactions]);
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
        monthLabel: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        summaryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        summaryBlock: { flex: 1, alignItems: 'center' },
        summaryLabel: { ...typography.micro, color: colors.textSecondary },
        summaryValue: { ...typography.heading, fontSize: 14, marginTop: 2 },
        txnList: { marginTop: spacing.sm, paddingTop: spacing.xs },
        txnRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        txnLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
        categoryChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        categoryChipText: { ...typography.micro, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
        txnDate: { ...typography.micro, color: colors.textMuted },
        rowAmount: { ...typography.heading, fontSize: 14, marginRight: 6 },
        insightsTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm },
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
        insightHeading: { ...typography.caption, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
        insightBody: { ...typography.micro, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
        teaserBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, spacing, typography, cardShadow, radius]
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
                          <View style={styles.categoryChip}>
                            <Text style={styles.categoryChipText}>{category?.name ?? 'Other'}</Text>
                          </View>
                          <Text style={styles.txnDate}>{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
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
