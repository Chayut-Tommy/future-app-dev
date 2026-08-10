import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { ThisMonthSpendingSource } from '../../lib/calculations/monthlySummary';

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
}: {
  visible: boolean;
  onClose: () => void;
  sources: ThisMonthSpendingSource[];
  spendingCents: number;
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
      footer={<Button label="Close" onPress={onClose} style={styles.footerButton} />}
    >
      <Text style={styles.intro}>Every funding source recorded this month, ranked by amount.</Text>
      {sources.map((source) => (
        <View key={source.key} style={styles.row}>
          <View style={styles.labelBlock}>
            <Text style={styles.label} accessibilityLabel={source.label}>
              {source.label}
            </Text>
            <Text style={styles.percentage}>{source.percentage}%</Text>
          </View>
          <Text style={styles.value} accessibilityLabel={`${source.label} ${formatCents(source.amountCents)}`}>
            {formatCents(source.amountCents)}
          </Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Spending recorded</Text>
        <Text style={styles.totalValue} accessibilityLabel={`Spending recorded total ${formatCents(spendingCents)}`}>
          {formatCents(spendingCents)}
        </Text>
      </View>
    </KeyboardSheet>
  );
}
