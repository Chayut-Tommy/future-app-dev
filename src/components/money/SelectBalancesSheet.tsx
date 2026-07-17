import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { resolveIncludeInMoneyCalculations } from '../../lib/calculations/liquidAssets';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * The actual "select balances" flow for Available Money's empty state
 * (PRD ask, §Empty-state correction: the previous version of this action
 * only opened an add-new-asset form, which didn't match its own label or
 * copy — a user with an existing but excluded Cash/Savings account had no
 * way to include it from here). Lists every Cash/Savings asset with its
 * current included/excluded state; tapping a row toggles
 * `includeInMoneyCalculations` immediately, the same field
 * `resolveIncludeInMoneyCalculations` already reads everywhere else, so
 * there's no separate "save" step to forget.
 */
export function SelectBalancesSheet({
  visible,
  onClose,
  onAddBalance,
}: {
  visible: boolean;
  onClose: () => void;
  /** Hand off to the add-asset flow — called after this sheet has asked to
   * close, mirroring the existing bill→mortgage handoff in
   * AddRecurringItemModal.tsx rather than inventing a new pattern. */
  onAddBalance: () => void;
}) {
  const { data, updateAsset } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();

  const balances = data.assets.filter((a) => a.type === 'cash' || a.type === 'savings');

  function toggleIncluded(assetId: string, currentlyIncluded: boolean) {
    updateAsset(assetId, { includeInMoneyCalculations: !currentlyIncluded });
  }

  function handleAddBalance() {
    onClose();
    onAddBalance();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
          marginBottom: spacing.sm,
        },
        rowTextBlock: { flex: 1, marginRight: spacing.sm },
        rowLabel: { ...typography.body, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        rowValue: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
        toggle: {
          paddingHorizontal: spacing.md,
          paddingVertical: 7,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        toggleActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        toggleText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        toggleTextActive: { color: colors.accentStrong },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        addButton: { alignSelf: 'flex-start' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet visible={visible} onClose={onClose} title="Select balances" footer={<Button label="Done" onPress={onClose} style={styles.footerButton} />}>
      <Text style={styles.intro}>
        Choose which Cash or Savings balances Navilo includes when estimating your available money. You can change this at any time.
      </Text>
      {balances.length === 0 ? (
        <Text style={styles.emptyText}>You don't have any Cash or Savings balances recorded yet.</Text>
      ) : (
        balances.map((asset) => {
          const included = resolveIncludeInMoneyCalculations(asset);
          return (
            <View key={asset.id} style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowLabel}>{asset.label}</Text>
                <Text style={styles.rowValue}>{formatMoney(asset.currentValue)}</Text>
              </View>
              <TouchableOpacity style={[styles.toggle, included ? styles.toggleActive : null]} onPress={() => toggleIncluded(asset.id, included)}>
                <Text style={[styles.toggleText, included ? styles.toggleTextActive : null]}>{included ? 'Included' : 'Excluded'}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <TouchableOpacity style={styles.addButton} onPress={handleAddBalance}>
        <Text style={[styles.toggleText, { color: colors.accent, fontSize: 13 }]}>+ Add a Cash or Savings balance</Text>
      </TouchableOpacity>
    </KeyboardSheet>
  );
}
