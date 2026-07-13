import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { Goal, GoalPriority } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { GoalProgressRing } from './GoalProgressRing';
import { requiredMonthlyForGoal, computeGoalAllocation } from '../../lib/calculations/goalAllocation';
import { computeFixedCosts } from '../../lib/calculations/safeToSpend';
import { brand } from '../../lib/brand';
import { buildGoalMilestoneCelebration } from '../../lib/celebrations';

const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: 'high', label: '⭐ High' },
  { value: 'medium', label: 'Medium' },
  { value: 'flexible', label: 'Flexible' },
];

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function dateParts(iso: string | null): { month: string; year: string } {
  if (!iso) return { month: '', year: '' };
  const d = new Date(iso);
  return { month: String(d.getMonth() + 1), year: String(d.getFullYear()) };
}

export function GoalDetailSheet({
  goal,
  onClose,
  onCreateAnother,
}: {
  goal: Goal | null;
  onClose: () => void;
  /** Present = the caller can open a fresh "New goal" flow — shown as an
   * option once this goal is completed. */
  onCreateAnother?: () => void;
}) {
  const { data, updateGoal, deleteGoal } = useAppState();
  const { celebrate } = useCelebration();
  const { colors, radius, spacing, typography } = useTheme();
  const [contribution, setContribution] = useState('');
  const [name, setName] = useState(goal?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ? String(goal.targetAmount) : '');
  const [targetMonth, setTargetMonth] = useState(dateParts(goal?.targetDate ?? null).month);
  const [targetYear, setTargetYear] = useState(dateParts(goal?.targetDate ?? null).year);
  const [priority, setPriority] = useState<GoalPriority>(goal?.priority ?? 'medium');

  useEffect(() => {
    setContribution('');
    setName(goal?.name ?? '');
    setTargetAmount(goal?.targetAmount ? String(goal.targetAmount) : '');
    const parts = dateParts(goal?.targetDate ?? null);
    setTargetMonth(parts.month);
    setTargetYear(parts.year);
    setPriority(goal?.priority ?? 'medium');
  }, [goal?.id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        ringRow: { alignItems: 'center', marginBottom: spacing.lg },
        amounts: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
        row: { flexDirection: 'row', gap: spacing.sm },
        input: {
          flex: 1,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        addButton: { paddingHorizontal: spacing.lg },
        calcBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginTop: spacing.sm },
        calcText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600', lineHeight: 18 },
        calcBoxWarning: { backgroundColor: colors.warningSoft },
        calcTextWarning: { color: colors.warning },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
        tile: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        tileActive: { backgroundColor: colors.accentSoft },
        tileLabel: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '600' },
        deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl, alignSelf: 'center' },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        footerButton: { flex: 1 },
        completedBanner: { backgroundColor: colors.goldSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        completedTitle: { ...typography.body, fontSize: 14, color: colors.gold, fontWeight: '700', marginBottom: 2 },
        completedBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        completedActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
        completedAction: { flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: 10, borderRadius: radius.control, backgroundColor: colors.surface },
        completedActionText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  const monthValue = parseInt(targetMonth, 10);
  const yearValue = parseInt(targetYear, 10);
  const dateValid = !isNaN(monthValue) && monthValue >= 1 && monthValue <= 12 && !isNaN(yearValue) && yearValue >= new Date().getFullYear();
  const amountValue = parseFloat(targetAmount);

  // Live preview using the form's current values, synced to the goal on
  // every edit — Lulu calculates this, the user never hand-types it
  // (PRD ask). Null-safe: this sheet stays mounted with goal=null between
  // uses, and every hook below must still run in that case (hooks must run
  // in the same order on every render — no hooks after an early return).
  const previewGoal: Goal | null = goal
    ? {
        ...goal,
        targetAmount: isNaN(amountValue) ? null : amountValue,
        targetDate: dateValid ? new Date(yearValue, monthValue - 1, 1).toISOString() : goal.targetDate,
      }
    : null;
  const requiredMonthly = previewGoal ? requiredMonthlyForGoal(previewGoal) : 0;

  // How this goal actually fares against the user's real budget and every
  // other active goal, in priority order — never silently pretend it's on
  // track (PRD ask).
  const fixedCosts = useMemo(() => computeFixedCosts(data), [data]);
  const availableForGoals = data.user.monthlyIncome - fixedCosts;
  const allocation = useMemo(() => {
    if (!goal || !previewGoal) return null;
    return computeGoalAllocation({ ...data, goals: data.goals.map((g) => (g.id === goal.id ? previewGoal : g)) }, availableForGoals);
  }, [data, goal, previewGoal, availableForGoals]);
  const thisGoalAllocation = allocation?.allocations.find((a) => a.goal.id === goal?.id) ?? null;

  if (!goal) return null;

  const progress = goal.targetAmount ? goal.currentAmount / goal.targetAmount : 0;

  function persistCalculatedFields(patch: Partial<Omit<Goal, 'id'>>) {
    const merged: Goal = { ...goal!, ...patch };
    updateGoal(goal!.id, { ...patch, estimatedMonthlyContribution: requiredMonthlyForGoal(merged) || undefined });
  }

  function handleAddContribution() {
    const amount = parseFloat(contribution);
    if (isNaN(amount) || amount <= 0) return;
    const newAmount = goal!.currentAmount + amount;
    const wasComplete = goal!.targetAmount !== null && goal!.currentAmount >= goal!.targetAmount;
    const isNowComplete = goal!.targetAmount !== null && newAmount >= goal!.targetAmount;
    updateGoal(goal!.id, { currentAmount: newAmount, status: isNowComplete ? 'completed' : goal!.status });
    if (isNowComplete && !wasComplete) celebrate(buildGoalMilestoneCelebration(goal!.name));
    setContribution('');
  }

  function handleExtend() {
    // Reopens the goal so its existing target date/amount fields become
    // editable again — the user sets a bigger or further target using the
    // same inputs already on this sheet (PRD ask: "extend this goal").
    updateGoal(goal!.id, { status: 'active' });
  }

  function handleArchive() {
    updateGoal(goal!.id, { status: 'archived' });
    onClose();
  }

  function handleDelete() {
    deleteGoal(goal!.id);
    onClose();
  }

  function handleSaveName(text: string) {
    setName(text);
    if (text.trim().length > 0) updateGoal(goal!.id, { name: text.trim() });
  }

  function handleSaveTarget(text: string) {
    setTargetAmount(text);
    const value = parseFloat(text);
    persistCalculatedFields({ targetAmount: isNaN(value) ? null : value });
  }

  function handleSaveDate(month: string, year: string) {
    setTargetMonth(month);
    setTargetYear(year);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!isNaN(m) && m >= 1 && m <= 12 && !isNaN(y) && y >= new Date().getFullYear()) {
      persistCalculatedFields({ targetDate: new Date(y, m - 1, 1).toISOString() });
    }
  }

  function handleSavePriority(value: GoalPriority) {
    setPriority(value);
    updateGoal(goal!.id, { priority: value });
  }

  return (
    <KeyboardSheet
      visible={!!goal}
      onClose={onClose}
      title="Goal details"
      footer={<Button label="Close" variant="secondary" onPress={onClose} style={styles.footerButton} />}
    >
      <View style={styles.ringRow}>
        <GoalProgressRing progress={progress} size={110} />
        <Text style={styles.amounts}>
          {formatMoney(goal.currentAmount)} of {goal.targetAmount ? formatMoney(goal.targetAmount) : 'no target set'}
        </Text>
      </View>

      {goal.status === 'completed' ? (
        <View style={styles.completedBanner}>
          <Text style={styles.completedTitle}>🎉 Goal achieved — {goal.name} completed!</Text>
          <Text style={styles.completedBody}>This goal is saved in your history. What's next?</Text>
          <View style={styles.completedActionsRow}>
            {onCreateAnother ? (
              <TouchableOpacity
                style={styles.completedAction}
                onPress={() => {
                  onClose();
                  onCreateAnother();
                }}
              >
                <Text style={styles.completedActionText}>Create another</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.completedAction} onPress={handleExtend}>
              <Text style={styles.completedActionText}>Extend this goal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.completedAction} onPress={handleArchive}>
              <Text style={styles.completedActionText}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>Goal name</Text>
      <TextInput style={styles.input} value={name} onChangeText={handleSaveName} placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Target amount</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={targetAmount}
        onChangeText={handleSaveTarget}
        returnKeyType="done"
      />

      <Text style={styles.label}>Target date</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="MM"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={targetMonth}
          onChangeText={(m) => handleSaveDate(m, targetYear)}
          maxLength={2}
        />
        <TextInput
          style={styles.input}
          placeholder="YYYY"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={targetYear}
          onChangeText={(y) => handleSaveDate(targetMonth, y)}
          maxLength={4}
          returnKeyType="done"
        />
      </View>

      <Text style={styles.label}>Add a contribution</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="$0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={contribution}
          onChangeText={setContribution}
          returnKeyType="done"
        />
        <Button label="Add" onPress={handleAddContribution} style={styles.addButton} />
      </View>

      {goal.targetAmount ? (
        <>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.grid}>
            {PRIORITIES.map((p) => {
              const active = priority === p.value;
              return (
                <TouchableOpacity key={p.value} style={[styles.tile, active ? styles.tileActive : null]} onPress={() => handleSavePriority(p.value)}>
                  <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {requiredMonthly > 0 ? (
            thisGoalAllocation?.isFullyFunded !== false ? (
              <View style={styles.calcBox}>
                <Text style={styles.calcText}>{brand.name} calculates you need {formatMoney(requiredMonthly)}/month to reach this goal.</Text>
              </View>
            ) : (
              <View style={[styles.calcBox, styles.calcBoxWarning]}>
                <Text style={[styles.calcText, styles.calcTextWarning]}>
                  At your current pace, this goal may take longer.
                  {thisGoalAllocation?.projectedCompletionLabel ? ` You can reach it around ${thisGoalAllocation.projectedCompletionLabel}.` : ''}
                </Text>
              </View>
            )
          ) : null}
        </>
      ) : null}

      <TouchableOpacity style={styles.deleteRow} onPress={handleDelete}>
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Delete goal</Text>
      </TouchableOpacity>
    </KeyboardSheet>
  );
}
