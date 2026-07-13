import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * "Lulu Savings Plan" editor — the one place the savings target changes,
 * which then ripples into Safe to Spend, Money Flow, and Lulu Money Plan
 * automatically since they all read the same field (PRD ask: "avoid having
 * different savings numbers across the app").
 */
export function EditSavingsPlanModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [amount, setAmount] = useState('');

  const defaultTarget = data.user.monthlyIncome * 0.1;

  useEffect(() => {
    if (!visible) return;
    setAmount(data.user.savingsBufferOverride !== undefined ? String(data.user.savingsBufferOverride) : String(Math.round(defaultTarget)));
  }, [visible, data.user.savingsBufferOverride, defaultTarget]);

  function handleSave() {
    const value = parseFloat(amount);
    if (isNaN(value) || value < 0) return;
    updateUser({ savingsBufferOverride: value });
    onClose();
  }

  function useDefault() {
    updateUser({ savingsBufferOverride: undefined });
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 18,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        helperBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        helperText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, lineHeight: 17 },
        defaultLink: { alignSelf: 'flex-start', marginBottom: spacing.md },
        defaultLinkText: { ...typography.caption, fontSize: 13, color: colors.accent, fontWeight: '700' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={`${brand.name} Savings Plan`}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} style={styles.footerButton} />
        </>
      }
    >
      <View style={styles.helperBox}>
        <Text style={styles.helperText}>
          {brand.name} sets aside 10% of your income by default ({formatMoney(defaultTarget)}/month) — you can save more or less.
        </Text>
      </View>
      <Text style={styles.label}>I want to save this much per month</Text>
      <TextInput
        style={styles.input}
        placeholder={formatMoney(defaultTarget)}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        returnKeyType="done"
      />
      {data.user.savingsBufferOverride !== undefined ? (
        <TouchableOpacity style={styles.defaultLink} onPress={useDefault}>
          <Text style={styles.defaultLinkText}>Reset to default (10%)</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}
