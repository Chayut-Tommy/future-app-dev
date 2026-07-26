import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Goal, GoalPriority } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { GoalProgressRing } from './GoalProgressRing';
import { requiredMonthlyForGoal, computeGoalAllocation, classifyGoalDateFields } from '../../lib/calculations/goalAllocation';
import { computeFixedCosts } from '../../lib/calculations/safeToSpend';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { spacing } from '../../theme/tokens';

const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: 'high', label: '⭐ High' },
  { value: 'medium', label: 'Medium' },
  { value: 'flexible', label: 'Flexible' },
];

// KeyboardSheet's footer sits as an in-flow sibling directly below the
// ScrollView, not an overlay — so this margin is the entire gap between
// Delete goal and the footer regardless of how much content sits above it.
// One layout interval (spacing.xxl) is enough.
const DELETE_ROW_BOTTOM_CLEARANCE = spacing.xxl;

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// AUD has no sub-cent denomination — every amount in the contribution flow
// below is normalised to whole cents before arithmetic or comparison, so
// raw binary floating-point drift (e.g. 0.10 + 0.20 === 0.30000000000000004
// in plain JS) can never misclassify an exact target as over-target, or
// silently round a genuine one-cent overage away to nothing (currency-
// precision correction). Local to this sheet's contribution/over-target
// flow only — no shared calculation engine touched, no historical data
// migrated, no other money field in this file changed.
function toCents(value: number): number {
  return Math.round(value * 100);
}
function fromCents(cents: number): number {
  return cents / 100;
}

// Navilo's established whole-dollar convention (formatMoney) is kept for
// any amount that's actually a whole number of dollars — this only adds
// cents when the value genuinely has them, so a $0.01 overage reads as
// "$0.01" rather than being silently rounded to "$0" the way formatMoney
// alone would (currency-precision correction, §4). Local to this sheet's
// contribution/over-target flow only — the rest of the app's whole-dollar
// planning figures are untouched.
function formatCurrencyPrecise(value: number): string {
  const cents = toCents(value);
  if (cents % 100 === 0) return formatMoney(value);
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateParts(iso: string | null): { month: string; year: string } {
  if (!iso) return { month: '', year: '' };
  const d = new Date(iso);
  return { month: String(d.getMonth() + 1), year: String(d.getFullYear()) };
}

// Stricter than parseFloat's permissive numeric-prefix parsing, which would
// accept "2500abc" as 2500 or treat the "Infinity" keyword as a valid
// finite number (invalid-contribution-handling correction). The whole
// trimmed string must be a plain non-negative decimal number with at most
// two decimal places — AUD has no smaller denomination, so "10.123" or
// "0.001" are rejected outright rather than silently truncated (currency-
// precision correction, §2). Local to the contribution field only — the
// sibling targetAmount field keeps its existing, unrelated parseFloat
// convention unchanged this pass.
function parsePositiveContributionAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isFinite(value) && value > 0 ? value : null;
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
  const { colors, radius, spacing, typography } = useTheme();
  const [contribution, setContribution] = useState('');
  // Inline validation feedback for a non-empty contribution that fails
  // parsePositiveContributionAmount (invalid-contribution-handling
  // correction) — deliberately separate from isDirty/discardConfirmation,
  // since an invalid amount must never be routed through the generic
  // "Discard changes?" prompt (§2).
  const [contributionError, setContributionError] = useState(false);
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
  // Guards against two same-frame Update presses both running
  // handleAddContribution off the same pre-update goal/contribution
  // snapshot (freeze-correction follow-up: neither the Button nor a
  // synchronous release at the end of the handler can prevent this, since
  // a second native press is dispatched as its own JS event — by the time
  // it runs, a same-call `finally` reset would already have cleared the
  // guard). Deliberately NOT released synchronously inside the handler,
  // and NOT keyed to goal.id (which stays the same across a contribution
  // and would otherwise lock out every later update in this sheet
  // session) — released instead by the effect below once either side of
  // what the update actually changed has come back around: the
  // authoritative currentAmount, or a fresh contribution value.
  const submittingContributionRef = useRef(false);

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
    submittingContributionRef.current = false;
    setContributionError(false);
  }, [goal?.id]);

  useEffect(() => {
    submittingContributionRef.current = false;
  }, [goal?.currentAmount, contribution]);

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
        // Neutral, not celebratory — an archived goal isn't necessarily an
        // achievement (it may have been archived below target), so this
        // deliberately doesn't reuse completedBanner's gold treatment.
        archivedBanner: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        archivedTitle: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
        archivedBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
  // Drives the footer's state-aware label (pending-contribution UX
  // correction) — the same strict parse handleAddContribution itself
  // uses, so the button's presence never promises something the handler
  // wouldn't actually apply. A dirty target date (partial/invalid/past)
  // deliberately keeps the footer at "Done" even with a valid pending
  // amount — "Add & close" only ever shows when it can safely deliver
  // exactly what it says (invalid-contribution-handling correction, §3D):
  // it must never close over a still-unresolved date issue.
  const hasOtherDirtyField = dateFieldsState === 'partial' || dateFieldsState === 'invalid' || dateFieldsState === 'past';
  const hasValidPendingContribution = parsePositiveContributionAmount(contribution) !== null;
  const hasInvalidPendingContribution = contribution.trim().length > 0 && !hasValidPendingContribution;
  const showAddAndClose = hasValidPendingContribution && !hasOtherDirtyField;

  function persistCalculatedFields(patch: Partial<Omit<Goal, 'id'>>) {
    const merged: Goal = { ...goal!, ...patch };
    updateGoal(goal!.id, { ...patch, estimatedMonthlyContribution: requiredMonthlyForGoal(merged) || undefined });
    flashSaved();
  }

  // A completion reached from in here is announced by the in-sheet "Goal
  // achieved" banner below only — not the global BigCelebrationOverlay.
  // That overlay is itself a native Modal, and presenting it while this
  // sheet's own KeyboardSheet Modal is still open is the two-native-
  // Modals-in-one-tick freeze this app has hit before (see
  // CelebrationContext.tsx's comment on the same class of bug). Today's
  // inline quick-contribute buttons aren't inside a Modal, so they keep
  // the global celebration unaffected by this.
  // Single submission path for both the inline "Add" button and the
  // footer's state-aware "Add & close" button (pending-contribution UX
  // correction) — `closeAfter` is the only difference between them, so the
  // calculation/guard/completion logic is never duplicated. Invalid input
  // returns above without touching the guard or closing the sheet, so
  // neither button can silently discard or apply a bad entry.
  // The actual write, shared by the direct (no-confirmation) path and the
  // "Add anyway" confirmation path below — never duplicated. `newAmount` is
  // passed in rather than recomputed, so both paths are guaranteed to
  // apply the exact figure the user was told about (over-target
  // confirmation correction).
  // `newAmount` is a whole-cent-normalised dollar figure already (see
  // handleAddContribution below) — re-normalised here again defensively so
  // this function's own completion comparison never depends on the
  // caller having done so (currency-precision correction).
  function applyContribution(newAmount: number, closeAfter: boolean) {
    try {
      const newAmountCents = toCents(newAmount);
      const targetCents = goal!.targetAmount !== null ? toCents(goal!.targetAmount) : null;
      const isNowComplete = targetCents !== null && newAmountCents >= targetCents;
      updateGoal(goal!.id, { currentAmount: fromCents(newAmountCents), status: isNowComplete ? 'completed' : goal!.status });
    } catch (e) {
      submittingContributionRef.current = false;
      throw e;
    }
    setContribution('');
    if (closeAfter) onClose();
  }

  function handleAddContribution(closeAfter: boolean) {
    const amount = parsePositiveContributionAmount(contribution);
    if (amount === null) {
      // A non-empty-but-invalid entry gets inline feedback instead of
      // silently no-opping; a genuinely empty field stays a silent no-op,
      // same as before (invalid-contribution-handling correction, §2) —
      // the guard below is never touched either way.
      if (contribution.trim().length > 0) setContributionError(true);
      return;
    }
    setContributionError(false);
    // Engaged here — before the over-target confirmation, not just before
    // the eventual updateGoal call — so a rapid repeated tap is rejected
    // immediately and can never open a second confirmation alert (over-
    // target confirmation correction). Once engaged, only the effect above
    // (goal's currentAmount or contribution actually changing) releases it
    // on the applied path; Cancel below releases it synchronously instead,
    // since neither of those would otherwise change.
    if (submittingContributionRef.current) return;
    submittingContributionRef.current = true;

    // Whole-cents arithmetic throughout — see toCents/fromCents above for
    // why (currency-precision correction, §1). newAmount is derived back
    // to a dollar figure only for display/storage; every comparison below
    // operates on the integer cent values.
    const amountCents = toCents(amount);
    const currentCents = toCents(goal!.currentAmount);
    const newAmountCents = currentCents + amountCents;
    const newAmount = fromCents(newAmountCents);
    const targetCents = goal!.targetAmount !== null ? toCents(goal!.targetAmount) : null;
    const goesOverTarget = targetCents !== null && newAmountCents > targetCents;

    if (goesOverTarget) {
      const overage = fromCents(newAmountCents - targetCents!);
      Alert.alert(
        'This goes above your target',
        `Adding ${formatCurrencyPrecise(amount)} will bring this goal to ${formatCurrencyPrecise(newAmount)}, which is ${formatCurrencyPrecise(overage)} above your ${formatCurrencyPrecise(goal!.targetAmount!)} target.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              submittingContributionRef.current = false;
            },
          },
          { text: 'Add anyway', onPress: () => applyContribution(newAmount, closeAfter) },
        ]
      );
      return;
    }

    applyContribution(newAmount, closeAfter);
  }

  // The footer's non-"Add & close" state (empty contribution, invalid
  // contribution, or a valid contribution alongside a still-dirty target
  // date — see showAddAndClose above). An invalid contribution is caught
  // here FIRST and unconditionally, before the generic dirty check, so it
  // never falls through to the generic "Discard changes?" prompt (§2) —
  // the only way to reach that prompt from this button is an empty field
  // (closes immediately) or a genuinely dirty *other* field with a valid
  // or empty contribution (protects both, §3D, reusing the existing,
  // unmodified confirmDiscardIfDirty exactly as before "Add & close"
  // existed).
  function handleClosePress() {
    if (hasInvalidPendingContribution) {
      setContributionError(true);
      return;
    }
    confirmDiscardIfDirty(isDirty, onClose);
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

  // Archived-goal recovery (visibility correction follow-up): Archive
  // organises a goal, it must not be a dead end. Both actions are a single
  // status-only updateGoal call — same id, name, target, currentAmount,
  // targetDate and priority preserved untouched; no transaction, asset or
  // liability; persisted once, same as handleArchive/handleExtend above.
  function handleRestoreToCompleted() {
    Alert.alert(
      'Restore completed goal?',
      'This will move the goal back to Completed Goals. It will not add it to your active goal plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => updateGoal(goal!.id, { status: 'completed' }) },
      ]
    );
  }

  // Only for an archived goal that never reached its target — returning it
  // to 'active' makes it eligible for active goal allocation again
  // (goalAllocation.ts's existing status==='active' filter), so this is
  // flagged to the user before applying, unlike Restore (which never
  // re-enters active allocation).
  function handleReopenAsActive() {
    Alert.alert(
      'Reopen this goal?',
      'This returns the goal to active planning and may affect your goal allocations.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => updateGoal(goal!.id, { status: 'active' }) },
      ]
    );
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
        // State-aware bottom action (pending-contribution UX correction):
        // "Add & close" only ever shows when it can safely deliver exactly
        // what it says — a valid amount AND no other dirty field (see
        // showAddAndClose above) — so the label never promises a close
        // that a still-dirty date would then have to silently swallow.
        // Every other case (empty, invalid, or valid-but-date-dirty)
        // renders "Close" (renamed from "Done" so it reads distinctly from
        // the keyboard's own "Done" accessory when both are visible at
        // once — keyboard-vs-sheet-action correction); handleClosePress
        // itself distinguishes an invalid entry (inline error, never the
        // generic prompt) from everything else (the existing, unmodified
        // confirmDiscardIfDirty).
        showAddAndClose ? (
          <Button label="Add & close" onPress={() => handleAddContribution(true)} style={styles.footerButton} />
        ) : (
          <Button label="Close" variant="secondary" onPress={handleClosePress} style={styles.footerButton} />
        )
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
          {formatCurrencyPrecise(goal.currentAmount)} of {goal.targetAmount !== null ? formatCurrencyPrecise(goal.targetAmount) : 'no target set'}
        </Text>
      </View>

      {goal.status === 'completed' ? (
        <View style={styles.completedBanner}>
          {/* Over-target is manually recorded goal progress, not investment
              performance or a verified balance — factual, not celebratory
              (over-target confirmation correction, §4). Falls back to the
              exact-target treatment if targetAmount somehow became null
              after completion (e.g. cleared via the Target amount field
              below) — overage can't be computed without one. Compared in
              whole cents, not raw currentAmount/targetAmount floats, so
              this can never be pushed into the over-target branch by
              binary drift on values that are actually exactly equal
              (currency-precision correction). */}
          {goal.targetAmount !== null && toCents(goal.currentAmount) > toCents(goal.targetAmount) ? (
            <>
              <Text style={styles.completedTitle}>Target exceeded by {formatCurrencyPrecise(fromCents(toCents(goal.currentAmount) - toCents(goal.targetAmount)))}</Text>
              <Text style={styles.completedBody}>You recorded {formatCurrencyPrecise(goal.currentAmount)} against your {formatCurrencyPrecise(goal.targetAmount)} target.</Text>
            </>
          ) : (
            <>
              <Text style={styles.completedTitle}>🎉 Goal achieved — {goal.name} completed!</Text>
              <Text style={styles.completedBody}>This goal is saved in your history. What's next?</Text>
            </>
          )}
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

      {/* Archived-goal recovery (visibility correction follow-up) — Archive
          organises a goal, it must not be a dead end. Which recovery
          action applies depends only on the goal's own recorded amounts,
          never on invented previous-status metadata: an archived goal that
          had already reached its target offers Restore (back to
          Completed), one that hadn't offers Reopen (back to active
          planning, which re-enters active goal allocation — flagged in the
          confirmation copy below, unlike Restore). */}
      {goal.status === 'archived' ? (
        <View style={styles.archivedBanner}>
          <Text style={styles.archivedTitle}>Archived</Text>
          {goal.targetAmount !== null && goal.currentAmount >= goal.targetAmount ? (
            <>
              <Text style={styles.archivedBody}>This goal was archived after being completed. It stays out of Completed Goals unless you restore it.</Text>
              <View style={styles.completedActionsRow}>
                <TouchableOpacity style={styles.completedAction} onPress={handleRestoreToCompleted}>
                  <Text style={styles.completedActionText}>Restore to completed</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.archivedBody}>This goal was archived before reaching its target. Reopening it returns it to active planning.</Text>
              <View style={styles.completedActionsRow}>
                <TouchableOpacity style={styles.completedAction} onPress={handleReopenAsActive}>
                  <Text style={styles.completedActionText}>Reopen as active</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
          accessibilityLabel="Target year"
        />
      </View>

      {/* "Add to goal progress" (Stream A §8, pending-contribution UX
          correction) — a planning action only: adds the entered amount to
          currentAmount, creates no transaction, touches no asset or
          liability. "Record a money contribution" was deferred by product
          decision (not an implementation gap) — it needs a
          source/destination and activity-classification model this app
          doesn't have yet. */}
      <Text style={styles.label}>Add to goal progress</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="$0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={contribution}
          onChangeText={(text) => {
            setContribution(text);
            if (contributionError) setContributionError(false);
          }}
          accessibilityLabel="Amount to add to goal progress"
        />
        <Button label="Add" onPress={() => handleAddContribution(false)} style={styles.addButton} />
      </View>
      {contributionError ? (
        <Text style={styles.dateValidationText} accessibilityLiveRegion="polite">
          Enter a valid amount greater than $0, using up to two decimal places.
        </Text>
      ) : null}
      <Text style={styles.hintText}>Enter the amount to add. This records progress only—it does not move money or change a balance tracked in Navilo.</Text>

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
