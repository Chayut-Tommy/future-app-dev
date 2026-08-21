import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { AppData, RecurringItem } from '../../types/models';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { frequencyAdverb, toMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { computeRetirementSavings, computeTotalWealth } from '../../lib/calculations/wealthDefinitions';
import { formatWealthAmount } from '../../lib/calculations/wealthComposition';
import { AddIncomeModal } from '../income/AddIncomeModal';
import { EditSavingsAllocationModal } from './EditSavingsAllocationModal';
import { OptionsSheet } from '../shared/OptionsSheet';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/** Makes clear the user chose this, Navilo didn't (PRD ask). */
function savingsAllocationSub(user: AppData['user'], monthlyAmount: number): string {
  const setting = user.savingsAllocation;
  if (!setting || setting.mode === 'off') return 'Not set';
  if (setting.mode === 'percent') return `${Math.round((setting.percent ?? 0) * 100)}% selected by you`;
  return `${formatMoney(monthlyAmount)} selected by you`;
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
  const { colors, radius, spacing, typography, semantic } = useTheme();
  // Wave 7 correction B — the same shipped role resolver Money and Today use.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const safeToSpend = useMemo(() => computeSafeToSpend(data), [data]);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [incomeSourcesSheetVisible, setIncomeSourcesSheetVisible] = useState(false);
  const [editIncomeItem, setEditIncomeItem] = useState<RecurringItem | null>(null);
  const [savingsPlanModalVisible, setSavingsPlanModalVisible] = useState(false);

  // Multiple income sources (PRD ask, §3) — tapping "Monthly income" opens
  // this list rather than jumping straight into a single editor, so a
  // second/third source is exactly as easy to add or edit as the first.
  const incomeItems = data.recurringItems.filter((r) => r.type === 'income' && r.active);

  function openIncome() {
    if (incomeItems.length === 0) {
      setEditIncomeItem(null);
      setIncomeModalVisible(true);
    } else {
      setIncomeSourcesSheetVisible(true);
    }
  }

  function selectIncomeSource(key: string) {
    if (key === 'add') {
      setEditIncomeItem(null);
    } else {
      setEditIncomeItem(incomeItems.find((r) => r.id === key) ?? null);
    }
    setIncomeModalVisible(true);
  }

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
    incomeItems.length > 1
      ? `${incomeItems.length} income sources`
      : data.user.incomeAmount && data.user.payFrequency !== 'monthly'
      ? `${formatMoney(data.user.incomeAmount)} paid ${frequencyAdverb(data.user.payFrequency)}`
      : null;

  // Colour is used for icon circles and supporting labels only — main
  // values stay dark/readable, never a different bright colour per row
  // (PRD ask, §B6: "visual hierarchy without making it overly colourful").
  /* Wave 7 correction B — two visual groups, no nested cards.

     The five rows answer two different questions: the first two are the
     customer's monthly PACE, the last three are the wealth BASE they have
     built. Reading them as one undifferentiated list is why the total
     underneath invited a false sum. Grouping is presentational only — the
     rows, values, handlers and destinations are unchanged. */
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
      onPress: openIncome,
    },
    {
      icon: 'trending-up-outline' as const,
      label: 'Savings allocation',
      sub: savingsAllocationSub(data.user, safeToSpend.savingsAllocationMonthly),
      value: safeToSpend.savingsAllocationMonthly,
      flow: true,
      iconColor: colors.aiBlue,
      iconBg: colors.aiBlueSoft,
      info: `An optional amount you choose to set aside — off by default. Feeds Available Until Payday, Money Flow, and ${brand.name} Money Allocation as an estimate only.`,
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
      label: 'Retirement savings',
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
        caption: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.md },
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
        identityTile: { width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.interactiveTint, alignItems: 'center', justifyContent: 'center' },
        identityTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        /* Wave 7 correction B — calm title case, not a shouted micro
           heading. Two all-caps labels inside one card read as system
           chrome rather than as the customer's own money. */
        groupLabel: { ...typeStyle('support', locale), fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingVertical: 2, marginBottom: spacing.xs },
        iconBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        labelBlock: { flex: 1 },
        label: { ...typeStyle('body', locale), color: colors.textPrimary, fontWeight: '600' },
        labelSub: { ...typeStyle('meta', locale), color: colors.textMuted, marginTop: 1 },
        value: { ...typeStyle('figureRow', locale), color: colors.textPrimary, fontVariant: ['tabular-nums'] },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
        totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        totalIconBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' },
        totalLabel: { ...typeStyle('titleCard', locale), color: colors.textPrimary, flex: 1 },
        totalValue: { ...typeStyle('figureLarge', locale), color: semantic.textFigure, fontVariant: ['tabular-nums'] },
      }),
    [colors, radius, spacing, typography, semantic, locale]
  );

  return (
    <View>
      {/* Wave 7 correction B — a Design 5.1 identity row, so the card names
          itself the way every other Wave 5–7 surface does. */}
      <View style={styles.identityRow}>
        <View style={styles.identityTile}>
          <Ionicons name="speedometer-outline" size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        <Text style={styles.identityTitle} accessibilityRole="header">Your money engine</Text>
      </View>
      {/* Shortened: the original sentence explained the metaphor twice. */}
      <Text style={styles.caption}>Your income and saving build wealth; your assets hold it.</Text>
      {rows.map((r, i) => (
        <React.Fragment key={r.label}>
          {i === 0 ? <Text style={styles.groupLabel}>Your monthly pace</Text> : null}
          {i === 2 ? <Text style={styles.groupLabel}>What you’ve built</Text> : null}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={r.onPress ? 0.7 : 1}
          disabled={!r.onPress}
          onPress={r.onPress}
          accessibilityRole={r.onPress ? 'button' : undefined}
          accessibilityLabel={`${r.label}. ${formatWealthAmount(r.value)}.`}
        >
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
            {formatWealthAmount(r.value)}
            {r.flow ? '/mo' : ''}
          </Text>
          {/* Chevron only where the row genuinely goes somewhere. */}
          {r.onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 2 }} accessibilityElementsHidden importantForAccessibility="no" /> : null}
        </TouchableOpacity>
        </React.Fragment>
      ))}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <View style={styles.totalIconBadge}>
          <Ionicons name="diamond-outline" size={15} color={colors.textSecondary} />
        </View>
        {/* Wave 7 correction B — the leading "=" is gone, and so is
            "Total Wealth Today".

            The equals sign asserted an equation the rows above do not make.
            `totalWealth` is assets minus LIABILITIES, and no liability is
            displayed here at all; the first two rows are monthly flows, not
            wealth components. Five rows and a total joined by "=" told the
            customer to add them up and get that figure, which they cannot.
            The figure and its source are unchanged — only the false
            arithmetic claim and the superseded name are. */}
        <Text style={styles.totalLabel}>Net worth today</Text>
        <Text style={styles.totalValue}>{formatWealthAmount(totalWealth)}</Text>
      </View>
      <OptionsSheet
        visible={incomeSourcesSheetVisible}
        onClose={() => setIncomeSourcesSheetVisible(false)}
        title="💼 Income sources"
        subtitle="Tap a source to edit it, or add another."
        options={[
          ...incomeItems.map((item) => ({
            key: item.id,
            icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? 'cash-outline',
            label: item.label,
            description: `${formatMoney(toMonthlyAmount(item.amount, item.frequency))}/mo · ${frequencyAdverb(item.frequency)}`,
          })),
          { key: 'add', icon: 'add-circle-outline' as const, label: 'Add income source', description: 'Salary, rental, dividends, and more' },
        ]}
        onSelect={selectIncomeSource}
      />
      <AddIncomeModal
        visible={incomeModalVisible}
        editItem={editIncomeItem}
        onClose={() => {
          setIncomeModalVisible(false);
          setEditIncomeItem(null);
        }}
      />
      <EditSavingsAllocationModal visible={savingsPlanModalVisible} onClose={() => setSavingsPlanModalVisible(false)} />
    </View>
  );
}
