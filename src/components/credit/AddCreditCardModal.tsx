import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { CreditCard } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { buildDebtReducedCelebration } from '../../lib/celebrations';
import { brand } from '../../lib/brand';

export function AddCreditCardModal({
  visible,
  onClose,
  editCard,
}: {
  visible: boolean;
  onClose: () => void;
  /** Present = editing this existing card instead of creating a new one. */
  editCard?: CreditCard | null;
}) {
  const { addCreditCard, updateCreditCard, deleteCreditCard } = useAppState();
  const { celebrate } = useCelebration();
  const { colors, radius, spacing, typography } = useTheme();
  const [issuer, setIssuer] = useState('');
  const [limit, setLimit] = useState('');
  const [balance, setBalance] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [apr, setApr] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = !!editCard;

  useEffect(() => {
    if (!visible) return;
    if (editCard) {
      setIssuer(editCard.issuer);
      setLimit(String(editCard.creditLimit));
      setBalance(String(editCard.currentBalance));
      setDueDay(String(editCard.dueDay));
      setMinPayment(String(editCard.minimumPayment));
      setApr(editCard.apr ? String(Math.round(editCard.apr * 10000) / 100) : '');
    } else {
      setIssuer('');
      setLimit('');
      setBalance('');
      setDueDay('');
      setMinPayment('');
      setApr('');
    }
    setSaving(false);
  }, [visible, editCard]);

  const creditLimit = parseFloat(limit);
  const due = parseInt(dueDay, 10);
  const aprValue = parseFloat(apr);
  const canSave = issuer.trim().length > 0 && !isNaN(creditLimit) && !isNaN(due) && due >= 1 && due <= 31;

  function handleSave() {
    // Guards against a fast double-tap creating two identical cards before
    // the sheet has a chance to close (PRD bug report, §10: "duplicate
    // credit cards").
    if (!canSave || saving) return;
    setSaving(true);
    const payload = {
      issuer: issuer.trim(),
      label: issuer.trim(),
      creditLimit,
      currentBalance: parseFloat(balance) || 0,
      dueDay: due,
      minimumPayment: parseFloat(minPayment) || 0,
      apr: !isNaN(aprValue) && aprValue > 0 ? aprValue / 100 : undefined,
    };
    if (editCard) {
      updateCreditCard(editCard.id, payload);
      if (payload.currentBalance < editCard.currentBalance) celebrate(buildDebtReducedCelebration());
    } else {
      addCreditCard(payload);
    }
    onClose();
  }

  function handleDelete() {
    if (editCard) deleteCreditCard(editCard.id);
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
          marginTop: spacing.sm,
        },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          marginBottom: spacing.md,
          color: colors.textPrimary,
        },
        row: {
          flexDirection: 'row',
          gap: spacing.md,
        },
        half: {
          flex: 1,
        },
        footerButton: {
          flex: 1,
        },
        deleteButton: { alignSelf: 'center', marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        benefitBox: { backgroundColor: colors.marketSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        benefitTitle: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.xs },
        benefitLine: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit credit card' : 'Add credit card'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave || saving} style={styles.footerButton} />
        </>
      }
    >
      {!isEditing ? (
        <View style={styles.benefitBox}>
          <Text style={styles.benefitTitle}>Add your card so {brand.name} can help you:</Text>
          <Text style={styles.benefitLine}>✓ Reduce interest{'\n'}✓ Improve credit utilisation{'\n'}✓ Create a payoff plan{'\n'}✓ Avoid missed payments</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Issuer / name</Text>
      <TextInput style={styles.input} placeholder="e.g. AMEX Platinum" placeholderTextColor={colors.textMuted} value={issuer} onChangeText={setIssuer} />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Credit limit</Text>
          <TextInput style={styles.input} placeholder="$10,000" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={limit} onChangeText={setLimit} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Current balance</Text>
          <TextInput style={styles.input} placeholder="$0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={balance} onChangeText={setBalance} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Due day of month</Text>
          <TextInput style={styles.input} placeholder="25" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={dueDay} onChangeText={setDueDay} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Minimum payment</Text>
          <TextInput style={styles.input} placeholder="$0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={minPayment} onChangeText={setMinPayment} />
        </View>
      </View>

      <Text style={styles.label}>Interest rate / APR % (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 19.99"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={apr}
        onChangeText={setApr}
        returnKeyType="done"
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm, marginBottom: spacing.sm }]}>
        {apr.trim().length > 0
          ? `Lets ${brand.name} show a real payoff-acceleration estimate.`
          : `Leave blank and ${brand.name} will use an estimated rate (~19.5% p.a.) until you add your own — update it anytime for better accuracy.`}
      </Text>

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete card</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}
