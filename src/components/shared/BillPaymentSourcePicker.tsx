import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { BillPaymentSourceOption } from '../../lib/calculations/billPaymentSources';

/**
 * Device-test correction round — the shared eligible-bill-payment-source
 * selector, the expense-side sibling of IncomeDestinationPicker.tsx.
 * "Which account did you pay from?" for an ordinary bill, replacing the
 * previous "From cash" / "From credit card" only pair. Mirrors
 * IncomeDestinationPicker's own structure (dense chip row, plain
 * tap-to-choose, no auto-confirm) so the two read as one consistent
 * pattern, just with correct copy for the expense direction and real
 * account balances/card-owed amounts shown per row (already formatted
 * into each option's own `label` by resolveEligibleBillPaymentSources).
 */
export function BillPaymentSourcePicker({
  sources,
  onSelect,
  onBack,
  disabled,
}: {
  sources: BillPaymentSourceOption[];
  onSelect: (source: BillPaymentSourceOption) => void;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
        chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.pill,
          paddingVertical: 9,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
          marginRight: spacing.sm,
        },
        rowText: { ...typography.body, fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
        emptyBody: { ...typography.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        backButton: { alignSelf: 'flex-start', paddingVertical: 6 },
        backButtonText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  if (sources.length === 0) {
    return (
      <View>
        <Text style={styles.emptyBody}>You don't have an eligible account or credit card to pay this from yet.</Text>
        {onBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={disabled}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>Which account did you pay from?</Text>
      <View style={styles.chipWrap}>
        {sources.map((s) => (
          <TouchableOpacity
            key={`${s.kind}:${s.id}`}
            style={styles.row}
            onPress={() => onSelect(s)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={s.label}
          >
            <Text style={styles.rowText}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={disabled}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
