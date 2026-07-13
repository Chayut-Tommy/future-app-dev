import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { AppData } from '../../types/models';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { frequencyAdverb } from '../../lib/calculations/incomeEngine';
import { computeRetirementSavings, computeTotalWealth } from '../../lib/calculations/wealthDefinitions';
import { AddIncomeModal } from '../income/AddIncomeModal';
import { EditSavingsPlanModal } from './EditSavingsPlanModal';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * "Your Money Engine" — replaces the Net Worth Trend chart, which stayed
 * confusing even with an explanation (PRD ask: users didn't know what
 * action to take, and the empty state felt like missing data). This is
 * educational instead: how income and saving actually turn into assets,
 * using the user's own real numbers. Income/Savings are monthly flow —
 * shown as the "engine" feeding the total — while the final total (Your
 * Wealth Today) is a real, correct sum: investments + other assets minus
 * liabilities, not a literal addition of monthly flow to stock balances.
 */
export function MoneyEngineCard({ data }: { data: AppData }) {
  const { colors, radius, spacing, typography } = useTheme();
  const safeToSpend = useMemo(() => computeSafeToSpend(data), [data]);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [savingsPlanModalVisible, setSavingsPlanModalVisible] = useState(false);

  // Retirement Savings kept separate from Investments — most people can't
  // actually access it, so folding it into the same total made a $200k-
  // retirement/$5k-cash user feel like they had $205k available today,
  // which they don't (PRD ask). Uses the same shared Accessible Net Worth /
  // Retirement Savings / Total Wealth split as the Wealth Map hero, so the
  // two can never disagree (PRD ask, §B1/§B6).
  const investmentAssets = data.assets.filter((a) => ['etf', 'shares', 'crypto'].includes(a.type)).reduce((sum, a) => sum + a.currentValue, 0);
  const retirementSavings = computeRetirementSavings(data);
  const otherAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0) - investmentAssets - retirementSavings;
  const totalWealth = computeTotalWealth(data);

  // Users should never feel trapped with whatever they entered at
  // onboarding (PRD ask) — income and savings are the two flow rows, so
  // they're the two that open a real editor instead of sitting static.
  // The raw amount the user actually entered, shown as a small caption so
  // "$4,333/mo" never reads as a mysterious number they didn't type
  // themselves (PRD bug report: weekly/fortnightly income was previously
  // shown and calculated as if it were already monthly).
  const incomeSub =
    data.user.incomeAmount && data.user.payFrequency !== 'monthly'
      ? `${formatMoney(data.user.incomeAmount)} paid ${frequencyAdverb(data.user.payFrequency)}`
      : null;

  // Colour is used for icon circles and supporting labels only — main
  // values stay dark/readable, never a different bright colour per row
  // (PRD ask, §B6: "visual hierarchy without making it overly colourful").
  const rows = [
    {
      icon: 'cash-outline' as const,
      label: 'Monthly income',
      sub: incomeSub ?? 'Money coming in',
      value: data.user.monthlyIncome,
      flow: true,
      iconColor: colors.accent,
      iconBg: colors.accentSoft,
      info: null as string | null,
      onPress: () => setIncomeModalVisible(true),
    },
    {
      icon: 'trending-up-outline' as const,
      label: `${brand.name} Savings Plan`,
      sub: `${data.user.monthlyIncome > 0 ? Math.round((safeToSpend.defaultSavingsBuffer / data.user.monthlyIncome) * 100) : 0}% of monthly income`,
      value: safeToSpend.defaultSavingsBuffer,
      flow: true,
      iconColor: colors.aiBlue,
      iconBg: colors.aiBlueSoft,
      info: `What ${brand.name} sets aside for you each month — 10% of income by default, or your own target. Feeds Available Until Payday, Money Flow, and ${brand.name} Money Plan.`,
      onPress: () => setSavingsPlanModalVisible(true),
    },
    {
      icon: 'bar-chart-outline' as const,
      label: 'Investments',
      sub: 'Accessible invested assets',
      value: investmentAssets,
      flow: false,
      iconColor: colors.market,
      iconBg: colors.marketSoft,
      info: null,
      onPress: undefined,
    },
    {
      icon: 'briefcase-outline' as const,
      label: 'Other assets',
      sub: 'Cash, property, vehicles, valuables',
      value: otherAssets,
      flow: false,
      iconColor: colors.purple,
      iconBg: colors.purpleSoft,
      info: null,
      onPress: undefined,
    },
    {
      icon: 'lock-closed' as const,
      label: 'Retirement Savings',
      sub: 'Long-term restricted wealth',
      value: retirementSavings,
      flow: false,
      iconColor: colors.gold,
      iconBg: colors.goldSoft,
      info: 'Retirement savings are included in your total wealth but are usually not available for everyday spending.',
      onPress: undefined,
    },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        caption: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 17 },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        iconBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        labelBlock: { flex: 1 },
        label: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        labelSub: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: 1 },
        value: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
        totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        totalIconBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' },
        totalLabel: { ...typography.heading, fontSize: 14, color: colors.textPrimary, flex: 1 },
        totalValue: { ...typography.title, fontSize: 19, color: colors.textPrimary },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View>
      <Text style={styles.caption}>How your wealth is built — your income and saving are the engine, your investments and assets are the fuel.</Text>
      {rows.map((r) => (
        <TouchableOpacity key={r.label} style={styles.row} activeOpacity={r.onPress ? 0.7 : 1} disabled={!r.onPress} onPress={r.onPress}>
          <View style={[styles.iconBadge, { backgroundColor: r.iconBg }]}>
            <Ionicons name={r.icon} size={15} color={r.iconColor} />
          </View>
          <View style={styles.labelBlock}>
            <Text style={styles.label}>{r.label}</Text>
            {r.sub ? <Text style={styles.labelSub}>{r.sub}</Text> : null}
          </View>
          {r.info ? (
            <TouchableOpacity onPress={() => Alert.alert(r.label, r.info!)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} style={{ marginRight: 4 }} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.value}>
            {formatMoney(r.value)}
            {r.flow ? '/mo' : ''}
          </Text>
          {r.onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 2 }} /> : null}
        </TouchableOpacity>
      ))}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <View style={styles.totalIconBadge}>
          <Ionicons name="diamond-outline" size={15} color={colors.textSecondary} />
        </View>
        <Text style={styles.totalLabel}>= Total Wealth Today</Text>
        <Text style={styles.totalValue}>{formatMoney(totalWealth)}</Text>
      </View>
      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <EditSavingsPlanModal visible={savingsPlanModalVisible} onClose={() => setSavingsPlanModalVisible(false)} />
    </View>
  );
}
