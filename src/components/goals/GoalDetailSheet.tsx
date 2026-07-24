import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { Goal, GoalPriority } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { GoalProgressRing } from './GoalProgressRing';
import { requiredMonthlyForGoal, computeGoalAllocation, classifyGoalDateFields } from '../../lib/calculations/goalAllocation';
import { computeFixedCosts } from '../../lib/calculations/safeToSpend';
import { buildGoalMilestoneCelebration } from '../../lib/celebrations';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';

const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: 'high', label: '⭐ High' },
  { value: 'medium', label: 'Medium' },
  { value: 'flexible', label: 'Flexible' },
];

// Generous, content-agnostic clearance below Delete goal so it's never too
// close to the shared KeyboardSheet's fixed Done footer (Stream A final
// correction pass §5). KeyboardSheet's ScrollView isn't flex-bounded (see
// its own implementation), so it doesn't reliably reserve exact space above
// the footer — the amount of content above Delete varies by state (an
// undated goal's two-line planning-horizon copy, a visible date-validation
// message, larger accessibility text all change the total height
// differently). Rather than sizing this margin to the shortest case (as the
// prior, insufficient fix did), this is deliberately oversized to clear the
// footer across all of those states — a local, content-side buffer, not a
// KeyboardSheet change.
const DELETE_ROW_BOTTOM_CLEARANCE = 96;

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
  // A small, non-blocking cue shown right after a field autosaves — never
  // before persistence is actually attempted (regression-protection review,
  // Stream A §5). Cleared automatically ~1s later.
  const [showSaved, setShowSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a double-tap on Delete firing the confirmation (and the
  // deletion itself) twice (regression-protection review, Stream A §7).
  const deletingRef = useRef(false);

  useEffect(() => {
    setContribution('');
    setName(goal?.name ?? '');
    setTargetAmount(goal?.targetAmount ? String(goal.targetAmount) : '');
    const parts = dateParts(goal?.targetDate ?? null);
    setTargetMonth(parts.month);
    setTargetYear(parts.year);
    setPriority(goal?.priority ?? 'medium');
    setShowSaved(false);
    deletingRef.current = false;
  }, [goal?.id]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // Called only once a field has actually been handed to updateGoal — never
  // claims a save happened before that call is made (regression-protection
  // review, Stream A §5: "do not claim an edit was saved before persistence
  // succeeds"). Known, stated limitation: like every other autosave path
  // already shipped in this app, the underlying AsyncStorage write is
  // fire-and-forget past this point — this cue reflects the in-memory state
  // update (which is what every other screen reads), not a confirmed disk
  // write. Building true disk-write-failure detection would be a
  // persistence-layer change affecting the whole app, out of Stream A's
  // bounded scope.
  function flashSaved() {
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setShowSaved(false), 1000);
  }

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
        // Positive, token-based spacing only (Stream A follow-up §1) — 8px
        // clear of the input/button row above, 12px before whatever follows
        // (Priority's own marginTop of spacing.md brings that gap to ~20px
        // total), never a negative offset.
        hintText: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        calcBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginTop: spacing.sm },
        calcText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600', lineHeight: 18 },
        calcSubtext: { ...typography.micro, fontSize: 11, color: colors.accentStrong, marginTop: 2, lineHeight: 15 },
        calcBoxWarning: { backgroundColor: colors.warningSoft },
        calcTextWarning: { color: colors.warning },
        dateValidationText: { ...typography.caption, fontSize: 12, color: colors.warning, marginTop: spacing.sm, lineHeight: 16 },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
        tile: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        tileActive: { backgroundColor: colors.accentSoft },
        tileLabel: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '600' },
        // Extra scroll-content bottom padding (Stream A follow-up §2) — the
        // scrollable area inside the shared KeyboardSheet isn't
        // flex-bounded (it sizes to its own content rather than the
        // remaining space above the fixed Done footer), so once this
        // sheet's content grew long enough, Delete goal rendered too close
        // to the footer on some screens. This is a local, content-side fix
        // only — KeyboardSheet itself is untouched, and so are its other 14
        // consumers.
        deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl, marginBottom: DELETE_ROW_BOTTOM_CLEARANCE, alignSelf: 'center' },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        footerButton: { flex: 1 },
        // Signalled by both an icon and text, never colour alone (PRD ask,
        // Stream A §5/§8 accessibility).
        savedCueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginBottom: spacing.sm },
        savedCueText: { ...typography.caption, fontSize: 12, color: colors.success, fontWeight: '600' },
        completedBanner: { backgroundColor: colors.goldSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        completedTitle: { ...typography.body, fontSize: 14, color: colors.gold, fontWeight: '700', marginBottom: 2 },
        completedBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        completedActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
        completedAction: { flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: 10, borderRadius: radius.control, backgroundColor: colors.surface },
        completedActionText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  const amountValue = parseFloat(targetAmount);
  // Classifies the two raw date-input strings — 'empty'/'valid'/'partial'/
  // 'past' (Stream A follow-up §3). Shared with handleSaveDate below and
  // with the regression tests via the same exported helper, so there is
  // exactly one definition of "what counts as a valid future date."
  const dateFieldsState = classifyGoalDateFields(targetMonth, targetYear);

  // Live preview using the form's current values, synced to the goal on
  // every edit — Lulu calculates this, the user never hand-types it
  // (PRD ask). Deliberately never falls back to goal.targetDate when the
  // visible fields are partial or a rejected past date (Stream A follow-up
  // §3C/§3D: "do not show a monthly amount calculated from a hidden old
  // date") — only a currently-valid field pair drives the estimate; anything
  // else previews as "no date" (the existing 36-month fallback), never a
  // stale committed value the user can no longer see. Null-safe: this sheet
  // stays mounted with goal=null between uses, and every hook below must
  // still run in that case (hooks must run in the same order on every
  // render — no hooks after an early return).
  const previewGoal: Goal | null = goal
    ? {
        ...goal,
        targetAmount: isNaN(amountValue) ? null : amountValue,
        targetDate:
          dateFieldsState === 'valid'
            ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString()
            : null,
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
  // What can genuinely be lost by closing this sheet: an in-progress
  // contribution amount, or a date edit that was never fully valid and so
  // never autosaved (Stream A follow-up §3C: "closing must not silently
  // replace the visible partial entry with an undisclosed active date" —
  // reusing this same established discard-confirmation mechanism, not a new
  // one). Name/target amount/priority, and any *complete, valid* date,
  // already autosaved the instant they changed, so there is nothing to
  // protect for those (regression-protection review, Stream A §6).
  const isDirty =
    contribution.trim().length > 0 || dateFieldsState === 'partial' || dateFieldsState === 'invalid' || dateFieldsState === 'past';

  function persistCalculatedFields(patch: Partial<Omit<Goal, 'id'>>) {
    const merged: Goal = { ...goal!, ...patch };
    updateGoal(goal!.id, { ...patch, estimatedMonthlyContribution: requiredMonthlyForGoal(merged) || undefined });
    flashSaved();
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

  // Deleting a goal is a planning action only — it never touches
  // transactions, assets or liabilities (regression-protection review,
  // Stream A §7: "deletion of a planning goal and deletion or reversal of
  // historical financial activity are separate actions"). deleteGoal itself
  // is a bare array filter with no cascade (confirmed in the approved
  // investigation), so no cascade-deletion behaviour is introduced here.
  function handleDelete() {
    Alert.alert(
      `Delete "${goal!.name}"?`,
      'This removes the goal from Navilo. It does not change any transactions, balances or history already recorded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (deletingRef.current) return;
            deletingRef.current = true;
            deleteGoal(goal!.id);
            onClose();
          },
        },
      ]
    );
  }

  function handleSaveName(text: string) {
    setName(text);
    if (text.trim().length > 0) {
      updateGoal(goal!.id, { name: text.trim() });
      flashSaved();
    }
  }

  function handleSaveTarget(text: string) {
    setTargetAmount(text);
    const value = parseFloat(text);
    persistCalculatedFields({ targetAmount: isNaN(value) ? null : value });
  }

  // Keeps the visible MM/YYYY fields and the stored targetDate in agreement
  // (Stream A follow-up §3): a complete valid future date persists
  // immediately, same as every other autosaved field; both fields empty
  // clears the stored date outright, so an old date can never keep
  // influencing calculations invisibly; a partial or rejected-past entry
  // persists nothing at all — it stays local, unsaved, edit-protected input
  // (see isDirty above) until it's either completed or discarded.
  function handleSaveDate(month: string, year: string) {
    setTargetMonth(month);
    setTargetYear(year);
    const state = classifyGoalDateFields(month, year);
    if (state === 'empty') {
      persistCalculatedFields({ targetDate: null });
    } else if (state === 'valid') {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      persistCalculatedFields({ targetDate: new Date(y, m - 1, 1).toISOString() });
    }
    // 'partial' and 'past': never persisted — see the inline validation
    // copy rendered below the Priority section.
  }

  function handleSavePriority(value: GoalPriority) {
    setPriority(value);
    updateGoal(goal!.id, { priority: value });
    flashSaved();
  }

  return (
    <KeyboardSheet
      visible={!!goal}
      onClose={onClose}
      title="Goal details"
      isDirty={isDirty}
      footer={
        <Button
          label="Done"
          variant="secondary"
          onPress={() => confirmDiscardIfDirty(isDirty, onClose)}
          style={styles.footerButton}
        />
      }
    >
      {showSaved ? (
        <View style={styles.savedCueRow} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.savedCueText}>Updated</Text>
        </View>
      ) : null}

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
          accessibilityLabel="Target month"
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
          accessibilityLabel="Target year"
        />
      </View>

      {/* "Update goal progress" (Stream A §8) — a planning action only:
          changes currentAmount alone, creates no transaction, touches no
          asset or liability. "Record a money contribution" was deferred by
          product decision (not a Stream A implementation gap) — it needs a
          source/destination and activity-classification model this app
          doesn't have yet. */}
      <Text style={styles.label}>Update goal progress</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="$0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={contribution}
          onChangeText={setContribution}
          returnKeyType="done"
          accessibilityLabel="Amount to update goal progress by"
        />
        <Button label="Update" onPress={handleAddContribution} style={styles.addButton} />
      </View>
      <Text style={styles.hintText}>This updates your progress only. It does not move money or change a balance tracked in Navilo.</Text>

      {goal.targetAmount ? (
        <>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.grid}>
            {PRIORITIES.map((p) => {
              const active = priority === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.tile, active ? styles.tileActive : null]}
                  onPress={() => handleSavePriority(p.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Priority: ${p.label}${active ? ', selected' : ''}`}
                >
                  <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {dateFieldsState === 'partial' || dateFieldsState === 'invalid' || dateFieldsState === 'past' ? (
            <Text style={styles.dateValidationText} accessibilityLiveRegion="polite">
              {dateFieldsState === 'partial'
                ? 'Enter both month and year.'
                : dateFieldsState === 'invalid'
                  ? 'Enter a valid month and four-digit year.'
                  : 'Choose this month or a future month.'}
            </Text>
          ) : requiredMonthly > 0 ? (
            thisGoalAllocation?.isFullyFunded !== false ? (
              <View style={styles.calcBox}>
                <Text style={styles.calcText}>Estimated monthly goal amount: {formatMoney(requiredMonthly)}</Text>
                <Text style={styles.calcSubtext}>
                  {dateFieldsState === 'valid'
                    ? 'Based on your target amount and target date.'
                    : 'Based on a 3-year planning horizon. Add a target date for a date-based estimate.'}
                </Text>
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

      <TouchableOpacity
        style={styles.deleteRow}
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${goal.name}`}
        accessibilityHint="Asks for confirmation before removing this goal"
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Delete goal</Text>
      </TouchableOpacity>
    </KeyboardSheet>
  );
}
