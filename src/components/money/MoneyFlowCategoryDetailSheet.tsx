import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { MoneyFlowBreakdownItem } from '../../lib/calculations/moneyFlowBreakdown';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return remainder === 0 ? `${sign}$${whole.toLocaleString()}` : `${sign}$${whole.toLocaleString()}.${String(remainder).padStart(2, '0')}`;
}

/**
 * The one shared, read-only detail sheet for all four Typical Money Flow /
 * Typical Monthly Allocation category rows (correction round, 2026-08-10)
 * — reused by both surfaces, never four separate sheet implementations.
 * Purely presentational: receives an already-computed item list and total,
 * never calls `computeMoneyFlowCategoryBreakdown` itself and never mutates
 * anything — viewing this sheet has zero persistence side effects. Reuses
 * the established `KeyboardSheet` primitive, matching
 * `ThisMonthSourcesSheet.tsx`'s own precedent.
 */
export function MoneyFlowCategoryDetailSheet({
  visible,
  onClose,
  categoryLabel,
  periodLabel,
  totalCents,
  items,
  emptyStateText,
  ctaLabel,
  onCta,
}: {
  visible: boolean;
  onClose: () => void;
  categoryLabel: string;
  periodLabel: string;
  totalCents: number;
  items: MoneyFlowBreakdownItem[];
  /** Non-null only when `items` is empty — the factual configured/not-
   * configured copy the caller has already resolved from the underlying
   * `configurationState`, never derived inside this component. */
  emptyStateText: string | null;
  ctaLabel: string | null;
  onCta: (() => void) | null;
}) {
  const { colors, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        periodLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
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
        supportingText: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
        value: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, marginTop: spacing.sm },
        totalLabel: { ...typography.body, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        totalValue: { ...typography.heading, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
        footerButton: { flex: 1 },
        ctaButton: { marginTop: spacing.sm },
      }),
    [colors, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={categoryLabel}
      footer={<Button label="Close" onPress={onClose} style={styles.footerButton} />}
    >
      <Text style={styles.periodLabel}>{periodLabel}</Text>
      {items.length === 0 ? (
        <>
          {emptyStateText ? <Text style={styles.emptyText}>{emptyStateText}</Text> : null}
          {ctaLabel && onCta ? <Button label={ctaLabel} onPress={onCta} style={styles.ctaButton} /> : null}
        </>
      ) : (
        <>
          {items.map((item) => (
            <View key={item.key} style={styles.row}>
              <View style={styles.labelBlock}>
                <Text style={styles.label} accessibilityLabel={item.label}>
                  {item.label}
                </Text>
                {item.supportingText ? <Text style={styles.supportingText}>{item.supportingText}</Text> : null}
              </View>
              <Text style={styles.value} accessibilityLabel={`${item.label} ${formatCents(item.amountCents)}`}>
                {formatCents(item.amountCents)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{categoryLabel}</Text>
            <Text style={styles.totalValue} accessibilityLabel={`${categoryLabel} total ${formatCents(totalCents)}`}>
              {formatCents(totalCents)}
            </Text>
          </View>
        </>
      )}
    </KeyboardSheet>
  );
}
