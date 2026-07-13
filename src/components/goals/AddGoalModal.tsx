import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { LifeGoalType, GoalPriority } from '../../types/models';
import { requiredMonthlyForGoal } from '../../lib/calculations/goalAllocation';
import { brand } from '../../lib/brand';

const GOAL_TYPES: { value: LifeGoalType; label: string; emoji: string }[] = [
  { value: 'house_deposit', label: 'Buy property', emoji: '🏠' },
  { value: 'holiday', label: 'Travel', emoji: '✈️' },
  { value: 'investment_target', label: 'Build wealth', emoji: '📈' },
  { value: 'debt_payoff', label: 'Pay debt', emoji: '💳' },
  { value: 'financial_freedom', label: 'Financial freedom', emoji: '🚀' },
  { value: 'emergency_fund', label: 'Emergency fund', emoji: '💰' },
  { value: 'car', label: 'New car', emoji: '🚗' },
  { value: 'custom', label: 'Custom', emoji: '⭐' },
];

const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: 'high', label: '⭐ High' },
  { value: 'medium', label: 'Medium' },
  { value: 'flexible', label: 'Flexible' },
];

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function AddGoalModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addGoal } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [type, setType] = useState<LifeGoalType | null>(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [targetYear, setTargetYear] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('medium');

  const canSave = type !== null && name.trim().length > 0;

  const monthValue = parseInt(targetMonth, 10);
  const yearValue = parseInt(targetYear, 10);
  const dateValid = !isNaN(monthValue) && monthValue >= 1 && monthValue <= 12 && !isNaN(yearValue) && yearValue >= new Date().getFullYear();
  const amountValue = parseFloat(targetAmount);

  const previewRequiredMonthly = useMemo(() => {
    if (isNaN(amountValue) || amountValue <= 0) return null;
    const targetDate = dateValid ? new Date(yearValue, monthValue - 1, 1).toISOString() : null;
    return requiredMonthlyForGoal({
      id: 'preview',
      name: '',
      lifeGoalType: 'custom',
      targetAmount: amountValue,
      currentAmount: 0,
      targetDate,
      status: 'active',
    });
  }, [amountValue, dateValid, monthValue, yearValue]);

  function reset() {
    setType(null);
    setName('');
    setTargetAmount('');
    setTargetMonth('');
    setTargetYear('');
    setPriority('medium');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function selectType(value: LifeGoalType, label: string) {
    setType(value);
    if (!name.trim()) setName(label);
  }

  function handleSave() {
    if (!canSave || !type) return;
    const amount = parseFloat(targetAmount);
    const targetDate = dateValid ? new Date(yearValue, monthValue - 1, 1).toISOString() : null;
    const finalTargetAmount = isNaN(amount) ? null : amount;
    addGoal({
      name: name.trim(),
      lifeGoalType: type,
      targetAmount: finalTargetAmount,
      currentAmount: 0,
      targetDate,
      priority,
      estimatedMonthlyContribution: finalTargetAmount
        ? requiredMonthlyForGoal({
            id: 'new',
            name: name.trim(),
            lifeGoalType: type,
            targetAmount: finalTargetAmount,
            currentAmount: 0,
            targetDate,
            status: 'active',
          })
        : undefined,
      status: 'active',
    });
    reset();
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
        tile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
        },
        tileActive: { backgroundColor: colors.accentSoft },
        tileEmoji: { fontSize: 15 },
        tileLabel: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '600' },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 16,
          marginBottom: spacing.md,
          color: colors.textPrimary,
        },
        row: { flexDirection: 'row', gap: spacing.sm },
        dateInput: { flex: 1 },
        helperText: { ...typography.micro, color: colors.textSecondary, marginTop: -4, marginBottom: spacing.md, lineHeight: 15 },
        previewBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        previewText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleClose}
      title="New goal"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={handleClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <Text style={styles.label}>What are you working towards?</Text>
      <View style={styles.grid}>
        {GOAL_TYPES.map((g) => {
          const active = type === g.value;
          return (
            <TouchableOpacity
              key={g.value}
              style={[styles.tile, active ? styles.tileActive : null]}
              onPress={() => selectType(g.value, g.label)}
            >
              <Text style={styles.tileEmoji}>{g.emoji}</Text>
              <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Goal name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. House deposit"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        returnKeyType="next"
      />
      <Text style={styles.label}>Target amount (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={targetAmount}
        onChangeText={setTargetAmount}
        returnKeyType="done"
      />

      <Text style={styles.label}>Target date (optional)</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.dateInput]}
          placeholder="MM"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={targetMonth}
          onChangeText={setTargetMonth}
          maxLength={2}
        />
        <TextInput
          style={[styles.input, styles.dateInput]}
          placeholder="YYYY"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={targetYear}
          onChangeText={setTargetYear}
          maxLength={4}
          returnKeyType="done"
        />
      </View>
      <Text style={styles.helperText}>Add a target date and {brand.name} will calculate exactly how much to set aside each month.</Text>

      {previewRequiredMonthly && previewRequiredMonthly > 0 ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewText}>{brand.name} calculates you'll need {formatMoney(previewRequiredMonthly)}/month to reach this goal.</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Priority</Text>
      <View style={styles.grid}>
        {PRIORITIES.map((p) => {
          const active = priority === p.value;
          return (
            <TouchableOpacity key={p.value} style={[styles.tile, active ? styles.tileActive : null]} onPress={() => setPriority(p.value)}>
              <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </KeyboardSheet>
  );
}
