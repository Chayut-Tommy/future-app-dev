import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { ThisMonthSpendingSource } from '../../lib/calculations/monthlySummary';
import {
  CARD_BALANCE_DISCLOSURE,
  OtherCardBalance,
  SourceCardContext,
} from '../../lib/calculations/moneyComposition';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return remainder === 0 ? `${sign}$${whole.toLocaleString()}` : `${sign}$${whole.toLocaleString()}.${String(remainder).padStart(2, '0')}`;
}

/**
 * The full, untruncated "View all" detail for This Month's back face — every
 * ranked funding source individually, no compact-view overflow collapsing
 * (PRD ask, "View-all sheet"). Reuses the established KeyboardSheet
 * primitive, not a new modal framework. Read-only: no balance mutation, no
 * persistence call anywhere in this file — it only ever renders the
 * `sources`/`spendingCents` it's given.
 */
export function ThisMonthSourcesSheet({
  visible,
  onClose,
  sources,
  spendingCents,
  cardContexts = [],
  otherCardBalances = [],
}: {
  visible: boolean;
  onClose: () => void;
  sources: ThisMonthSpendingSource[];
  spendingCents: number;
  /** Wave 6 final refinement — each credit-card source's CURRENT balance,
   * joined by its own stable key. Context only: never summed, never added
   * to the recorded-spending total. */
  cardContexts?: SourceCardContext[];
  /** Cards carrying a balance that funded none of this month's spending.
   * Listed separately so retiring This Month's standalone balance line
   * could not make an existing snapshot unreachable. */
  otherCardBalances?: OtherCardBalance[];
}) {
  const { colors, spacing, typography, radius } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        labelBlock: { flex: 1, marginRight: spacing.sm },
        label: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        percentage: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
        value: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, marginTop: spacing.sm },
        totalLabel: { ...typography.body, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        totalValue: { ...typography.heading, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
        footerButton: { flex: 1 },
      }),
    [colors, spacing, typography, radius]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title="How spending was paid"
      // Wave 6 correction E — Close is a neutral dismissal, so it takes the
      // secondary (interactive-ink) treatment rather than the filled
      // confirmation treatment a Save would use.
      footer={<Button label="Close" variant="secondary" onPress={onClose} style={styles.footerButton} />}
    >
      <Text style={styles.intro}>Every funding source recorded this month, ranked by amount.</Text>
      {sources.map((source) => {
        const card = cardContexts.find((c) => c.sourceKey === source.key);
        // Two labelled lines, so "paid this month" and "current balance"
        // are unmistakably different concepts on the same row.
        const paidLine = `Paid this month · ${formatCents(source.amountCents)} · ${source.percentage}%`;
        return (
          <View
            key={source.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${source.label}. ${paidLine}.${card?.balanceLabel ? ` Current card balance ${card.balanceLabel}.` : ''}`}
            testID={`sources-row-${source.key}`}
          >
            <View style={styles.labelBlock}>
              <Text style={styles.label}>{source.label}</Text>
              <Text style={styles.percentage}>{paidLine}</Text>
              {card?.balanceLabel ? (
                <Text style={styles.percentage} testID={`sources-balance-${source.key}`}>
                  Current card balance · {card.balanceLabel}
                </Text>
              ) : null}
            </View>
            <Text style={styles.value}>{formatCents(source.amountCents)}</Text>
          </View>
        );
      })}
      {/* Cards with a balance that funded none of this month's spending.
          Listed apart from the sources above and never counted. */}
      {otherCardBalances.length > 0 ? (
        <View testID="sources-other-card-balances">
          <Text style={styles.intro}>Other card balances</Text>
          {otherCardBalances.map((c) => (
            <View key={c.id} style={styles.row} accessible accessibilityLabel={`${c.label}, current card balance ${c.balanceLabel}`}>
              <View style={styles.labelBlock}>
                <Text style={styles.label}>{c.label}</Text>
                <Text style={styles.percentage}>No spending recorded this month</Text>
              </View>
              <Text style={styles.value}>{c.balanceLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Spending recorded</Text>
        <Text style={styles.totalValue} accessibilityLabel={`Spending recorded total ${formatCents(spendingCents)}`}>
          {formatCents(spendingCents)}
        </Text>
      </View>
      {/* One clarification, once — never repeated per row. */}
      <Text style={styles.intro} testID="sources-card-disclosure">{CARD_BALANCE_DISCLOSURE}</Text>
    </KeyboardSheet>
  );
}
