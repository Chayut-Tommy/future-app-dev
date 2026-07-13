import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState, TransferTarget } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';

/**
 * Moves money the user already has — cash into an investment, or cash onto
 * a liability paydown. Both sides update atomically (AppStateContext.transferFunds)
 * so the user never has to remember to update a second place by hand.
 */
export function TransferModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, transferFunds } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();

  const cashAssets = data.assets.filter((a) => a.type === 'cash' || a.type === 'savings');
  const nonCashAssets = data.assets.filter((a) => a.type !== 'cash' && a.type !== 'savings');

  const [fromId, setFromId] = useState<string | null>(null);
  const [toTarget, setToTarget] = useState<TransferTarget | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFromId(cashAssets[0]?.id ?? null);
    setToTarget(null);
    setAmount('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const amountValue = parseFloat(amount);
  const canSave = !!fromId && !!toTarget && !isNaN(amountValue) && amountValue > 0;

  function handleSave() {
    if (!canSave || !fromId || !toTarget) return;
    transferFunds(fromId, toTarget, amountValue);
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 20,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        empty: { ...typography.caption, fontSize: 12, color: colors.textMuted },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  const isSameTarget = (t: TransferTarget) =>
    (toTarget?.kind === 'asset' && t.kind === 'asset' && toTarget.assetId === t.assetId) ||
    (toTarget?.kind === 'liability' && t.kind === 'liability' && toTarget.liabilityId === t.liabilityId);

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title="Move money"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Transfer" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <Text style={styles.label}>From</Text>
      {cashAssets.length === 0 ? (
        <Text style={styles.empty}>Add a cash or savings asset first to transfer from it.</Text>
      ) : (
        <View style={styles.chipRow}>
          {cashAssets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.chip, fromId === a.id ? styles.chipActive : null]}
              onPress={() => setFromId(a.id)}
            >
              <Text style={[styles.chipText, fromId === a.id ? styles.chipTextActive : null]}>
                {a.label} (${a.currentValue.toLocaleString()})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>To</Text>
      <View style={styles.chipRow}>
        {nonCashAssets.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'asset', assetId: a.id })}
          >
            <Text style={[styles.chipText, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipTextActive : null]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
        {data.liabilities.map((l) => (
          <TouchableOpacity
            key={l.id}
            style={[styles.chip, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'liability', liabilityId: l.id })}
          >
            <Text
              style={[styles.chipText, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipTextActive : null]}
            >
              Pay down {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {nonCashAssets.length === 0 && data.liabilities.length === 0 ? (
        <Text style={styles.empty}>Add an investment or a liability first to transfer to it.</Text>
      ) : null}

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        returnKeyType="done"
      />
    </KeyboardSheet>
  );
}
