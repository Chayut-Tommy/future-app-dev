import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { IncomeDestinationOption } from '../../lib/calculations/incomeDestinations';
import { brand } from '../../lib/brand';

/**
 * The one shared eligible-income-destination selector, rendered identically
 * from recurring-income setup reconciliation (AddIncomeModal.tsx) and the
 * Today-tab salary-due reminder (SmartReminderCard.tsx) — correction round,
 * 2026-08-10. Neither flow builds its own destination list UI; both pass
 * the same `resolveEligibleIncomeDestinations(data.assets)` result here.
 *
 * Never pre-selects or auto-confirms a destination — every row is a plain
 * tap-to-choose option, and the caller's `onSelect` is the only thing that
 * ever changes a balance. `dense` switches between AddIncomeModal's
 * full-width rows (more vertical room, a sheet of its own) and
 * SmartReminderCard's compact inline chips (a small card among several
 * others on Today) — the underlying list, labels, ordering and disambiguation
 * are identical either way; only row chrome differs.
 */
export function IncomeDestinationPicker({
  destinations,
  onSelect,
  onBack,
  disabled,
  dense = false,
  onAddBalance,
}: {
  destinations: IncomeDestinationOption[];
  onSelect: (assetId: string) => void;
  onBack?: () => void;
  disabled?: boolean;
  dense?: boolean;
  /** Present only when the host has a real route to a balance-creation
   * journey (e.g. Money tab's scoped "Add a money balance" chooser).
   * Absent hosts (e.g. a Today-tab card with no such journey available)
   * simply omit the button and fall back to plain guidance text. */
  onAddBalance?: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: dense ? 12 : 13, color: colors.textSecondary, marginBottom: spacing.sm },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: dense ? colors.surfaceMuted : colors.accentSoft,
          borderRadius: dense ? radius.pill : radius.control,
          paddingVertical: dense ? 9 : 12,
          paddingHorizontal: dense ? spacing.md : spacing.md,
          marginBottom: spacing.sm,
          marginRight: dense ? spacing.sm : 0,
        },
        rowText: { ...typography.body, fontSize: dense ? 12 : 14, color: colors.textPrimary, fontWeight: dense ? '700' : '600' },
        chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
        emptyBody: { ...typography.body, fontSize: dense ? 12 : 14, color: colors.textSecondary, lineHeight: dense ? 17 : 20, marginBottom: spacing.sm },
        addBalanceButton: {
          alignSelf: 'flex-start',
          backgroundColor: colors.accent,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        addBalanceButtonText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
        backButton: { alignSelf: 'flex-start', paddingVertical: 6 },
        backButtonText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, dense]
  );

  if (destinations.length === 0) {
    return (
      <View>
        <Text style={styles.emptyBody}>
          {`You don't have a money balance to add this to yet. Add a Cash, Everyday or Savings balance in ${brand.name} first.`}
        </Text>
        {onAddBalance ? (
          <TouchableOpacity style={styles.addBalanceButton} onPress={onAddBalance} disabled={disabled}>
            <Text style={styles.addBalanceButtonText}>Add a money balance</Text>
          </TouchableOpacity>
        ) : null}
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
      <Text style={styles.label}>Where did this income arrive?</Text>
      <View style={dense ? styles.chipWrap : undefined}>
        {destinations.map((dest) => (
          <TouchableOpacity
            key={dest.id}
            style={styles.row}
            onPress={() => onSelect(dest.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={dest.label}
          >
            <Text style={styles.rowText}>{dest.label}</Text>
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
