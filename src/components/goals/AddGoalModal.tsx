import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { LifeGoalType, GoalPriority } from '../../types/models';
import { requiredMonthlyForGoal, classifyGoalDateFields, GoalDateFieldState } from '../../lib/calculations/goalAllocation';

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

type TargetAmountState = 'blank' | 'valid' | 'invalid';

// Simple form-level input validation only — never a reimplementation of the
// canonical monthly-amount formula, which stays entirely in
// requiredMonthlyForGoal (Stream A New Goal correction pass §3/§4).
function classifyTargetAmount(raw: string): TargetAmountState {
  const trimmed = raw.trim();
  if (trimmed === '') return 'blank';
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return 'valid';
}

function dateValidationMessage(state: GoalDateFieldState): string | null {
  if (state === 'partial') return 'Enter both month and year.';
  if (state === 'invalid') return 'Enter a valid month and four-digit year.';
  if (state === 'past') return 'Choose this month or a future month.';
  return null;
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
  // Guards a rapid double-tap on Save from creating two goals (Stream A New
  // Goal correction pass §8) — same one-shot-ref pattern already used for
  // GoalDetailSheet's Delete confirmation.
  const savingRef = useRef(false);

  const amountState = classifyTargetAmount(targetAmount);
  // Shared with GoalDetailSheet and its regression tests via the same
  // exported classifier — never a second date-validation implementation
  // (Stream A New Goal correction pass §3).
  const dateState = classifyGoalDateFields(targetMonth, targetYear);
  const dateMessage = dateValidationMessage(dateState);

  const canSave = type !== null && name.trim().length > 0 && amountState !== 'invalid' && dateState !== 'partial' && dateState !== 'invalid' && dateState !== 'past';

  // Live preview using the shared canonical helper only — never a
  // reimplementation of the formula, the 36-month fallback, or the
  // whole-dollar rounding (all of those stay inside requiredMonthlyForGoal /
  // formatMoney, identical to GoalDetailSheet). No estimate is computed at
  // all while the amount is blank/invalid or the date is partial/invalid/past
  // — those states show validation guidance instead (see the render below).
  const previewMonthly = useMemo(() => {
    if (amountState !== 'valid') return null;
    if (dateState !== 'empty' && dateState !== 'valid') return null;
    const amount = parseFloat(targetAmount);
    const targetDate = dateState === 'valid' ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString() : null;
    return requiredMonthlyForGoal({
      id: 'preview',
      name: '',
      lifeGoalType: 'custom',
      targetAmount: amount,
      currentAmount: 0,
      targetDate,
      status: 'active',
    });
  }, [amountState, targetAmount, dateState, targetMonth, targetYear]);

  function reset() {
    setType(null);
    setName('');
    setTargetAmount('');
    setTargetMonth('');
    setTargetYear('');
    setPriority('medium');
    savingRef.current = false;
  }

  function handleClose() {
    // Cancel, swipe-down and backdrop press all resolve to this same path —
    // no goal is ever created on any dismissal route (Stream A New Goal
    // correction pass §8).
    reset();
    onClose();
  }

  function selectType(value: LifeGoalType, label: string) {
    setType(value);
    if (!name.trim()) setName(label);
  }

  function handleSave() {
    if (!canSave || !type) return;
    if (savingRef.current) return;
    savingRef.current = true;
    const amount = amountState === 'valid' ? parseFloat(targetAmount) : null;
    const targetDate = dateState === 'valid' ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString() : null;
    addGoal({
      name: name.trim(),
      lifeGoalType: type,
      targetAmount: amount,
      currentAmount: 0,
      targetDate,
      priority,
      // Retained for backward compatibility only — no live calculation
      // reads this cached field any more (Stream A follow-up §6); every
      // consumer, including this preview, calls requiredMonthlyForGoal
      // fresh.
      estimatedMonthlyContribution: previewMonthly ?? undefined,
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
        helperText: { ...typography.micro, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        dateValidationText: { ...typography.caption, fontSize: 12, color: colors.warning, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        previewBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        previewText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600', lineHeight: 18 },
        previewSubtext: { ...typography.micro, fontSize: 11, color: colors.accentStrong, marginTop: 2, lineHeight: 15 },
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
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${g.label}${active ? ', selected' : ''}`}
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
        accessibilityLabel="Target amount, optional"
      />
      {/* Amount guidance sits directly beneath its own field, driven only by
          amountState — independent of whatever the date fields are doing
          (Stream A final correction pass §4/§2). */}
      {amountState === 'blank' ? (
        <Text style={styles.helperText}>Add a target amount to see an estimated monthly goal amount.</Text>
      ) : amountState === 'invalid' ? (
        <Text style={styles.dateValidationText} accessibilityLiveRegion="polite">
          Enter a valid target amount, or leave it blank.
        </Text>
      ) : null}

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
          accessibilityLabel="Target month"
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
          accessibilityLabel="Target year"
        />
      </View>
      {/* Date validation sits directly beneath its own fields, driven only
          by dateState — shown whenever the date itself is broken, whether
          or not the amount is also invalid, so the two errors can appear
          simultaneously without either masking the other. */}
      {dateMessage ? (
        <Text style={styles.dateValidationText} accessibilityLiveRegion="polite">
          {dateMessage}
        </Text>
      ) : null}

      {/* The combined estimate only ever appears once both fields are
          independently valid — previewMonthly is already null whenever
          amountState isn't 'valid' or dateState isn't 'empty'/'valid', so
          no further gating is needed here. */}
      {previewMonthly && previewMonthly > 0 ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewText}>Estimated monthly goal amount: {formatMoney(previewMonthly)}</Text>
          <Text style={styles.previewSubtext}>
            {dateState === 'valid'
              ? 'Based on your target amount and target date.'
              : 'Based on a 3-year planning horizon. Add a target date for a date-based estimate.'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>Priority</Text>
      <View style={styles.grid}>
        {PRIORITIES.map((p) => {
          const active = priority === p.value;
          return (
            <TouchableOpacity
              key={p.value}
              style={[styles.tile, active ? styles.tileActive : null]}
              onPress={() => setPriority(p.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Priority: ${p.label}${active ? ', selected' : ''}`}
            >
              <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </KeyboardSheet>
  );
}
