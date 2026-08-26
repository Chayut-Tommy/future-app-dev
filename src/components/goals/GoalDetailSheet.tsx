import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View, findNodeHandle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { Goal, GoalPriority, LifeGoalType } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { GoalFormFields } from './GoalFormFields';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { MOTION_MS, MOTION_TRAVEL_PT } from '../../theme/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { hapticRigid, hapticWarning } from '../../lib/haptics';
import { resolveGoalNameOnPurposeChange, resolveGoalPaceSummary, resolveGoalProgressState } from '../../lib/goalFormState';
import { Button } from '../shared/Button';
import { GoalProgressRing } from './GoalProgressRing';
import { requiredMonthlyForGoal, computeGoalAllocation, classifyGoalDateFields } from '../../lib/calculations/goalAllocation';
import { computeFixedCosts } from '../../lib/calculations/safeToSpend';
import { parseMoneyInput } from '../../lib/calculations/money';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { spacing } from '../../theme/tokens';

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

export type TargetAmountResolution = { kind: 'clear' } | { kind: 'invalid' } | { kind: 'set'; amount: number };

/** Target Amount correction — the single, pure decision made from a raw
 * draft string, shared by both the explicit commit action and the dirty-
 * state check below (one definition, so they can never silently disagree
 * about what a given draft means). Empty/whitespace-only -> 'clear'
 * (preserves the existing "blank clears the target" rule). Anything else
 * is validated with Navilo's strict money grammar (parseMoneyInput) —
 * never parseFloat's permissive prefix-matching — so "12.345" / " abc" /
 * "-5" / "1,200" all resolve to 'invalid', never a silently truncated or
 * wrong number. */
export function resolveTargetAmountDraft(draft: string): TargetAmountResolution {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return { kind: 'clear' };
  const parsed = parseMoneyInput(trimmed);
  if (!parsed.valid) return { kind: 'invalid' };
  return { kind: 'set', amount: parsed.amount };
}

/** Whether the current draft differs from what's actually persisted —
 * drives isDirty (and therefore every dismissal path's existing discard-
 * protection, unmodified) so an uncommitted amount edit is protected the
 * same way an uncommitted partial/invalid Target Date already is. An
 * invalid, non-empty draft is always dirty — there is unresolved input
 * sitting in the field regardless of whether it could ever be committed. */
export function isTargetAmountDraftDirty(draft: string, committedTargetAmount: number | null): boolean {
  const resolution = resolveTargetAmountDraft(draft);
  if (resolution.kind === 'clear') return committedTargetAmount !== null;
  if (resolution.kind === 'invalid') return true;
  return resolution.amount !== committedTargetAmount;
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
  const { colors, radius, spacing, typography, minTouchTarget } = useTheme();
  // Wave 9b — the shipped role resolver; tokens.typography carries no fontFamily.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [contribution, setContribution] = useState('');
  // Inline validation feedback for a non-empty contribution that fails
  // parsePositiveContributionAmount (invalid-contribution-handling
  // correction) — deliberately separate from isDirty/discardConfirmation,
  // since an invalid amount must never be routed through the generic
  // "Discard changes?" prompt (§2).
  const [contributionError, setContributionError] = useState(false);
  const [name, setName] = useState(goal?.name ?? '');
  // Target Amount correction — a local draft only, never persisted per
  // keystroke (see commitTargetAmount below). Deliberately named
  // differently from the old `targetAmount` state it replaces: everywhere
  // else in this file that needs "the target amount" now means
  // goal.targetAmount (the last committed value), never this draft.
  const [targetAmountDraft, setTargetAmountDraft] = useState(goal?.targetAmount ? String(goal.targetAmount) : '');
  // Inline validation feedback for a non-empty draft that fails
  // resolveTargetAmountDraft — mirrors contributionError's existing
  // pattern (deliberately separate from isDirty/discardConfirmation, same
  // reasoning as contributionError above).
  const [targetAmountError, setTargetAmountError] = useState(false);
  const [targetMonth, setTargetMonth] = useState(dateParts(goal?.targetDate ?? null).month);
  const [targetYear, setTargetYear] = useState(dateParts(goal?.targetDate ?? null).year);
  const [priority, setPriority] = useState<GoalPriority>(goal?.priority ?? 'medium');
  /** Wave 4 closure — the goal's purpose is already persisted on the model
   * (`Goal.lifeGoalType`), so it needs no migration to be editable here. */
  const [purpose, setPurpose] = useState<LifeGoalType | null>(goal?.lifeGoalType ?? null);
  /** Synchronous exact-once guard for the metadata commit, mirroring the
   * contribution guard already in this file. */
  const metadataSaveRef = useRef(false);
  /** A completed goal opened from history is read-only until explicitly
   * extended. Archived goals keep their own existing recovery banner. */
  const isReadOnlyCompleted = goal?.status === 'completed';

  // --- Wave 4 closure: the inline progress editor -------------------------
  const [progressEditorOpen, setProgressEditorOpen] = useState(false);
  const [progressConfirmation, setProgressConfirmation] = useState<string | null>(null);
  const editorEntrance = useRef(new Animated.Value(0)).current;
  const confirmEntrance = useRef(new Animated.Value(0)).current;
  const reduceMotionEnabled = useReduceMotion();
  /** A restrained 6pt lift, from the shared travel token — no bounce, no
   * scale, no height animation. */
  const editorTranslateY = editorEntrance.interpolate({ inputRange: [0, 1], outputRange: [MOTION_TRAVEL_PT.rowPlaceRise, 0] });

  /** What Record will actually write, using the SAME strict parser the
   * handler uses — so the button never promises an amount the write would
   * reject, and it stays disabled for zero, negative, empty and malformed. */
  const pendingContributionAmount = parsePositiveContributionAmount(contribution);

  /** Remaining to the target, or 0 when there is no target — never an
   * invented remainder for a goal that has none. */
  const remainingToTarget =
    goal && goal.targetAmount !== null ? Math.max(0, fromCents(toCents(goal.targetAmount) - toCents(goal.currentAmount))) : 0;

  function openProgressEditor() {
    setProgressConfirmation(null);
    setProgressEditorOpen(true);
    // Feedback only. The editor occupies its final layout immediately; only
    // its content fades and lifts into place, so there is no height
    // animation and no layout flash.
    if (reduceMotionEnabled) {
      editorEntrance.setValue(1);
      return;
    }
    editorEntrance.setValue(0);
    Animated.timing(editorEntrance, {
      toValue: 1,
      duration: MOTION_MS.sheetInfoIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeProgressEditor() {
    setProgressEditorOpen(false);
    setContribution('');
    setContributionError(false);
  }

  /** The single completion heading — focus lands here, once, when a goal is
   * complete, whether that happened just now or on a previous session. */
  const completionHeadingRef = useRef<Text>(null);
  /** Local midnight today — what the month/year picker measures against. */
  const startOfTodayLocal = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  /**
   * The SAME generated-name rule the create adapter uses. A SAVED name is
   * treated as the customer's unless it exactly matches its own saved
   * purpose's default — the only evidence available without persisting a
   * flag the model does not have. The failure mode is deliberately "we kept
   * their name", never "we overwrote it".
   */
  function choosePurpose(next: LifeGoalType) {
    setName((current) => resolveGoalNameOnPurposeChange({ currentName: current, previousPurpose: purpose, nextPurpose: next }));
    setPurpose(next);
  }
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
    setTargetAmountDraft(goal?.targetAmount ? String(goal.targetAmount) : '');
    setTargetAmountError(false);
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

  /**
   * Wave 4 closure — every metadata field is now a LOCAL draft, seeded from
   * the saved goal each time the sheet opens on a different goal. Before,
   * name, priority and a complete date autosaved the instant they changed,
   * which is why the legacy sheet had no Save button and why Cancel could
   * not restore anything. Nothing is written until "Save changes".
   */
  /**
   * Wave 4 closure — completion was reached while the numeric keyboard was
   * still visible. The keyboard is dismissed BEFORE the completion state is
   * announced, accessibility focus moves to the single completion heading,
   * and the announcement fires exactly once per completed goal.
   */
  const announcedCompletionForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!goal || goal.status !== 'completed') return;
    if (announcedCompletionForRef.current === goal.id) return;
    announcedCompletionForRef.current = goal.id;
    Keyboard.dismiss();
    const node = findNodeHandle(completionHeadingRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
    AccessibilityInfo.announceForAccessibility(`${goal.name} completed`);
  }, [goal?.id, goal?.status, goal?.name]);

  useEffect(() => {
    if (!goal) return;
    if (goal.status !== 'completed') announcedCompletionForRef.current = null;
    setName(goal.name);
    setPurpose(goal.lifeGoalType ?? null);
    setPriority(goal.priority ?? 'medium');
    setTargetAmountDraft(goal.targetAmount ? String(goal.targetAmount) : '');
    const parts = dateParts(goal.targetDate ?? null);
    setTargetMonth(parts.month);
    setTargetYear(parts.year);
    setTargetAmountError(false);
    metadataSaveRef.current = false;
  }, [goal?.id]);

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
        ringRow: { alignItems: 'center', marginBottom: spacing.md },
        amountsRemaining: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
        progressPrimary: { marginBottom: spacing.sm },
        progressEditor: {
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        progressEditorHeading: { ...typeStyle('titleCard', locale), fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
        progressEditorMeta: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        progressShortcut: { minHeight: minTouchTarget, justifyContent: 'center', marginBottom: spacing.sm },
        progressShortcutText: { ...typeStyle('body', locale), fontWeight: '600', color: colors.accentStrong },
        progressConfirm: {
          backgroundColor: colors.successSoft,
          borderRadius: radius.control,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        progressConfirmText: { ...typeStyle('meta', locale), color: colors.textPrimary, fontWeight: '600' },
        amounts: { ...typeStyle('meta', locale), fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
        label: { ...typeStyle('meta', locale), fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
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
        hintText: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        calcBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginTop: spacing.sm },
        calcText: { ...typeStyle('meta', locale), fontSize: 13, color: colors.accentStrong, fontWeight: '600', lineHeight: 18 },
        calcSubtext: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.accentStrong, marginTop: 2, lineHeight: 15 },
        calcBoxWarning: { backgroundColor: colors.warningSoft },
        calcTextWarning: { color: colors.warning },
        dateValidationText: { ...typeStyle('meta', locale), fontSize: 12, color: colors.warning, marginTop: spacing.sm, lineHeight: 16 },
        // Extra scroll-content bottom padding (Stream A follow-up §2) — the
        // scrollable area inside the shared KeyboardSheet isn't
        // flex-bounded (it sizes to its own content rather than the
        // remaining space above the fixed Done footer), so once this
        // sheet's content grew long enough, Delete goal rendered too close
        // to the footer on some screens. This is a local, content-side fix
        // only — KeyboardSheet itself is untouched, and so are its other 14
        // consumers.
        deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl, marginBottom: DELETE_ROW_BOTTOM_CLEARANCE, alignSelf: 'center' },
        deleteText: { ...typeStyle('meta', locale), color: colors.danger, fontWeight: '600' },
        footerButton: { flex: 1 },
        // Signalled by both an icon and text, never colour alone (PRD ask,
        // Stream A §5/§8 accessibility).
        savedCueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginBottom: spacing.sm },
        savedCueText: { ...typeStyle('meta', locale), fontSize: 12, color: colors.success, fontWeight: '600' },
        // Wave 4 closure — restrained success, not the previous gold. Green
        // is reserved for genuine positive achievement, which this is.
        completedBanner: {
          backgroundColor: colors.successSoft,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.success,
          padding: spacing.lg,
          marginBottom: spacing.md,
        },
        completedPrimary: { flex: 1 },
        completedTertiary: { minHeight: minTouchTarget, justifyContent: 'center', marginTop: spacing.xs },
        completedTertiaryText: { ...typeStyle('meta', locale), color: colors.textSecondary, fontWeight: '600' },
        completedTitle: { ...typeStyle('body', locale), fontSize: 14, color: colors.gold, fontWeight: '700', marginBottom: 2 },
        completedBody: { ...typeStyle('meta', locale), fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        completedActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
        completedAction: { flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: 10, borderRadius: radius.control, backgroundColor: colors.surface },
        completedActionText: { ...typeStyle('meta', locale), fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
        // Neutral, not celebratory — an archived goal isn't necessarily an
        // achievement (it may have been archived below target), so this
        // deliberately doesn't reuse completedBanner's gold treatment.
        archivedBanner: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        archivedTitle: { ...typeStyle('body', locale), fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
        archivedBody: { ...typeStyle('meta', locale), fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, radius, spacing, typography, locale]
  );

  // Classifies the two raw date-input strings — 'empty'/'valid'/'partial'/
  // 'past' (Stream A follow-up §3). Shared with handleSaveDate below and
  // with the regression tests via the same exported helper, so there is
  // exactly one definition of "what counts as a valid future date."
  const dateFieldsState = classifyGoalDateFields(targetMonth, targetYear);

  // Live preview using the form's current TARGET DATE values only, synced
  // to the goal on every date-field edit — Lulu calculates this, the user
  // never hand-types it (PRD ask). Deliberately never falls back to
  // goal.targetDate when the visible fields are partial or a rejected past
  // date (Stream A follow-up §3C/§3D: "do not show a monthly amount
  // calculated from a hidden old date") — only a currently-valid field pair
  // drives the estimate; anything else previews as "no date" (the existing
  // 36-month fallback), never a stale committed value the user can no
  // longer see. Null-safe: this sheet stays mounted with goal=null between
  // uses, and every hook below must still run in that case (hooks must run
  // in the same order on every render — no hooks after an early return).
  // Target Amount correction — this NO LONGER live-previews from a typed
  // draft. `targetAmount` here comes from the `...goal` spread alone, i.e.
  // the last COMMITTED value, exactly matching the required behaviour that
  // the progress ring / required-monthly / allocation calculations must
  // keep using the last committed target while an amount edit is in
  // progress, and only change once via commitTargetAmount below. (Stream D,
  // D2 — still memoized on exactly its true logical inputs, now goal,
  // dateFieldsState, targetYear, targetMonth; amountValue no longer exists
  // as an input.)
  const previewGoal: Goal | null = useMemo(
    () =>
      goal
        ? {
            ...goal,
            targetDate:
              dateFieldsState === 'valid'
                ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString()
                : null,
          }
        : null,
    [goal, dateFieldsState, targetYear, targetMonth]
  );
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

  /**
   * Wave 4 closure — the LIVE pace summary, shared verbatim with Add Goal.
   * It reads the DRAFT target amount and DRAFT date, so picking a date
   * updates the estimate immediately rather than only after Save (the
   * recorded defect), and it shows the same three-year planning guide the
   * create form always showed when no date is set.
   */
  const paceSummary = resolveGoalPaceSummary(
    {
      targetAmount: (() => {
        const resolution = resolveTargetAmountDraft(targetAmountDraft);
        if (resolution.kind === 'set') return resolution.amount;
        if (resolution.kind === 'clear') return null;
        return goal?.targetAmount ?? null;
      })(),
      targetDate:
        dateFieldsState === 'valid' ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString() : null,
      dateState: dateFieldsState,
      currentAmount: goal?.currentAmount ?? 0,
      isFullyFunded: thisGoalAllocation?.isFullyFunded,
      projectedCompletionLabel: thisGoalAllocation?.projectedCompletionLabel,
    },
    // The SHARED engine — never a second monthly formula.
    (input) =>
      requiredMonthlyForGoal({
        id: goal?.id ?? 'draft',
        name: goal?.name ?? '',
        lifeGoalType: goal?.lifeGoalType ?? 'custom',
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        targetDate: input.targetDate,
        status: 'active',
      })
  );

  if (!goal) return null;

  /**
   * Wave 4 closure — the recorded `0%` defect. This used to be
   * `goal.targetAmount ? current / target : 0`, and that 0 went straight to
   * the progress ring, so a goal with no target claimed the customer had
   * made no progress. Without a target there is no denominator and therefore
   * no percentage to report — a fact the shared rule now states explicitly.
   */
  const progressState = resolveGoalProgressState(goal.targetAmount, goal.currentAmount);
  const progress = progressState.kind === 'measured' ? progressState.fraction : 0;
  // Target Amount correction — whether the current draft differs from what
  // goal.targetAmount actually holds (see isTargetAmountDraftDirty above).
  // Feeds both isDirty and hasOtherDirtyField below, exactly like a
  // partial/invalid/past target date already does, so an uncommitted
  // amount edit gets the identical protection an uncommitted date edit
  // already had — including from "Add & close" (see hasOtherDirtyField's
  // own comment: that path calls onClose() directly, bypassing
  // confirmDiscardIfDirty entirely, so it must never be offered while an
  // uncommitted amount draft is sitting in the field).
  const targetAmountDirty = isTargetAmountDraftDirty(targetAmountDraft, goal.targetAmount);
  // What can genuinely be lost by closing this sheet: an in-progress
  // contribution amount, an uncommitted Target Amount draft, or a date edit
  // that was never fully valid and so never autosaved (Stream A follow-up
  // §3C: "closing must not silently replace the visible partial entry with
  // an undisclosed active date" — reusing this same established discard-
  // confirmation mechanism, not a new one). Name/priority, and any
  // *committed* target amount or *complete, valid* date, already autosaved
  // the instant they changed, so there is nothing to protect for those
  // (regression-protection review, Stream A §6).
  /**
   * Wave 4 closure — metadata no longer autosaves, so an uncommitted edit to
   * ANY supported field is now genuinely at risk on dismissal and must reach
   * the existing discard guard. Previously only a pending contribution or a
   * half-valid date could be lost, because name/priority/date had already
   * been written the instant they changed.
   */
  const metadataDirty =
    !!goal &&
    (name.trim() !== goal.name ||
      (purpose ?? goal.lifeGoalType) !== goal.lifeGoalType ||
      priority !== (goal.priority ?? 'medium') ||
      targetAmountDirty ||
      targetMonth !== dateParts(goal.targetDate ?? null).month ||
      targetYear !== dateParts(goal.targetDate ?? null).year);
  const isDirty =
    contribution.trim().length > 0 ||
    dateFieldsState === 'partial' ||
    dateFieldsState === 'invalid' ||
    dateFieldsState === 'past' ||
    metadataDirty ||
    targetAmountDirty;
  // Drives the footer's state-aware label (pending-contribution UX
  // correction) — the same strict parse handleAddContribution itself
  // uses, so the button's presence never promises something the handler
  // wouldn't actually apply. A dirty target date (partial/invalid/past) or
  // an uncommitted target amount draft deliberately keeps the footer at
  // "Done" even with a valid pending contribution amount — "Add & close"
  // only ever shows when it can safely deliver exactly what it says
  // (invalid-contribution-handling correction, §3D): it must never close
  // over a still-unresolved date OR amount issue.
  const hasOtherDirtyField =
    dateFieldsState === 'partial' || dateFieldsState === 'invalid' || dateFieldsState === 'past' || targetAmountDirty;
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
    /**
     * Wave 4 closure — the post-write sequence. Every step here is
     * state-driven and happens immediately; the ring's own travel is
     * feedback that runs alongside, and nothing below waits for it.
     *
     *   1. the write above has already landed;
     *   2. dismiss the keyboard;
     *   3. collapse the editor, leaving the updated summary visible;
     *   4. confirm, stating that the update is ALREADY recorded — so
     *      "Save changes" can never be read as still pending.
     */
    Keyboard.dismiss();
    setContribution('');
    setContributionError(false);
    setProgressEditorOpen(false);
    const target = goal!.targetAmount;
    setProgressConfirmation(
      target !== null
        ? `Progress updated to ${formatCurrencyPrecise(newAmount)} of ${formatCurrencyPrecise(target)} — already recorded.`
        : `Progress updated to ${formatCurrencyPrecise(newAmount)} — already recorded.`
    );
    if (reduceMotionEnabled) {
      confirmEntrance.setValue(1);
    } else {
      confirmEntrance.setValue(0);
      Animated.timing(confirmEntrance, {
        toValue: 1,
        duration: MOTION_MS.sheetInfoIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
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
    // Wave 10 closure — destructive confirm shown = one warning.
    hapticWarning();
    Alert.alert(
      `Delete "${goal!.name}"?`,
      'This removes the goal from Nolie. It does not change any transactions, balances or history already recorded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          // Wave 10 closure — rigid fires only on the CONFIRMED deletion,
          // after the exact-once latch, never on show/cancel.
          onPress: () => {
            if (deletingRef.current) return;
            deletingRef.current = true;
            hapticRigid();
            deleteGoal(goal!.id);
            onClose();
          },
        },
      ]
    );
  }

  /**
   * Wave 4 closure — the single, atomic metadata commit. Every supported
   * field goes in ONE `updateGoal` call, so a saved edit can never land
   * half-applied, and `estimatedMonthlyContribution` is recomputed by the
   * SHARED engine exactly as the legacy per-field autosaves did.
   *
   * Progress (`currentAmount`) is deliberately NOT included: it is a
   * separate persisted event with its own completion semantics, and merging
   * it into a metadata Save would change what the button means.
   */
  /** A metadata Save is refused while the date is half-entered or the
   * amount is malformed — the same states the legacy sheet blocked on. */
  const canSaveMetadata =
    name.trim().length > 0 && dateFieldsState !== 'partial' && dateFieldsState !== 'invalid' && dateFieldsState !== 'past' && !targetAmountError;

  function handleSaveChanges() {
    if (!goal) return;
    if (!canSaveMetadata) return;
    if (metadataSaveRef.current) return; // synchronous exact-once guard
    metadataSaveRef.current = true;

    // The SAME resolver the legacy "Set" button used — never a second
    // parsing rule. `clear` genuinely clears the target; `invalid` refuses.
    const resolution = resolveTargetAmountDraft(targetAmountDraft);
    if (resolution.kind === 'invalid') {
      metadataSaveRef.current = false;
      setTargetAmountError(true);
      return;
    }
    const nextTargetAmount = resolution.kind === 'clear' ? null : resolution.amount;
    const nextTargetDate =
      dateFieldsState === 'valid'
        ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString()
        : dateFieldsState === 'empty'
          ? null
          : goal.targetDate;

    const patch = {
      name: name.trim() || goal.name,
      lifeGoalType: purpose ?? goal.lifeGoalType,
      targetAmount: nextTargetAmount,
      targetDate: nextTargetDate,
      priority,
    };
    const merged: Goal = { ...goal, ...patch };
    updateGoal(goal.id, { ...patch, estimatedMonthlyContribution: requiredMonthlyForGoal(merged) || undefined });
    flashSaved();
    onClose();
  }

  // Target Amount correction — keystrokes only ever update the local
  // draft; nothing is persisted here (contrast with the old
  // handleSaveTarget this replaces, which called persistCalculatedFields
  // on every keystroke — the confirmed root cause of intermediate values
  // reaching AppStateContext/AsyncStorage and the connected calculations).
  function handleTargetAmountChange(text: string) {
    setTargetAmountDraft(text);
    if (targetAmountError) setTargetAmountError(false);
  }

  // The explicit completion action — reachable ONLY from the "Set" button
  // below, never from any dismissal path (Close/backdrop/swipe all route
  // through confirmDiscardIfDirty using isDirty/targetAmountDirty above,
  // none of which ever calls this function). This is deliberately NOT an
  // onBlur handler: blur can fire as a side effect of the very interactions
  // that dismiss this sheet (tapping the backdrop, swiping), which would
  // make "did the dirty-check run before persistence" an event-order
  // assumption rather than a structural guarantee. An explicit, separate
  // tap can never race against a close tap, since they are two different
  // taps by construction.

  // Keeps the visible MM/YYYY fields and the stored targetDate in agreement
  // (Stream A follow-up §3): a complete valid future date persists
  // immediately, same as every other autosaved field; both fields empty
  // clears the stored date outright, so an old date can never keep
  // influencing calculations invisibly; a partial or rejected-past entry
  // persists nothing at all — it stays local, unsaved, edit-protected input
  // (see isDirty above) until it's either completed or discarded.


  return (
    <KeyboardSheet
      visible={!!goal}
      onClose={onClose}
      title="Edit goal"
      isDirty={isDirty}
      footer={
        // Wave 4 closure — the modern fixed footer, matching Add Goal. The
        // legacy sheet offered only "Close" (or "Add & close"), because
        // every metadata field autosaved as it changed and there was
        // nothing to commit. Metadata is now a local draft, so Cancel and
        // Save changes both mean something.
        // A read-only completed goal has nothing to save; its own action
        // hierarchy lives in the completion state above.
        isReadOnlyCompleted ? (
          <Button label="Done" onPress={onClose} style={styles.footerButton} testID="goal-completed-footer-done" />
        ) : (
          <>
            <Button label="Cancel" variant="secondary" onPress={handleClosePress} style={styles.footerButton} />
            <Button label="Save changes" onPress={handleSaveChanges} disabled={!canSaveMetadata} style={styles.footerButton} testID="goal-edit-save" />
          </>
        )
      }
    >
      {showSaved ? (

        <View style={styles.savedCueRow} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.savedCueText}>Updated</Text>
        </View>
      ) : null}

      {/* Wave 4 closure — the progress summary now sits directly beneath the
          ring and BEFORE every metadata field. Recording progress used to
          mean scrolling past purpose, name, target, date and priority to
          reach a bare field paired with an ambiguous "Add" button; the one
          genuinely rewarding action in this sheet was the hardest to find. */}
      {progressState.kind === 'measured' ? (
        <View style={styles.ringRow}>
          <GoalProgressRing progress={progress} size={110} isCompletion={goal.status === 'completed'} />
          {/* One element carries the whole state, so a screen reader hears
              "3 percent, $250 of $10,000" rather than three fragments — and
              the interpolating ring above stays out of the tree entirely. */}
          <Text
            style={styles.amounts}
            accessibilityLabel={`${Math.round(progress * 100)} percent, ${formatCurrencyPrecise(goal.currentAmount)} of ${formatCurrencyPrecise(
              goal.targetAmount as number
            )}`}
          >
            {formatCurrencyPrecise(goal.currentAmount)} of {formatCurrencyPrecise(goal.targetAmount as number)}
          </Text>
          {remainingToTarget > 0 ? (
            <Text style={styles.amountsRemaining}>{formatCurrencyPrecise(remainingToTarget)} to go</Text>
          ) : null}
        </View>
      ) : (
        // No denominator, so no ring and no percentage — visually OR to a
        // screen reader, which must never hear "zero percent" for a goal
        // that simply has no target. Recorded progress is still shown, and
        // no remaining amount is invented.
        <View style={styles.ringRow} testID="goal-no-target-state">
          <Text style={styles.amounts} accessibilityLabel={`No target set. ${formatCurrencyPrecise(goal.currentAmount)} recorded so far.`}>
            No target set — {formatCurrencyPrecise(goal.currentAmount)} recorded so far
          </Text>
        </View>
      )}

      {/* The labelled, full-width way in. The ring is also tappable, but it
          is never the only route. Hidden entirely on a completed goal, which
          is read-only. */}
      {isReadOnlyCompleted ? null : progressEditorOpen ? (
        <Animated.View
          style={[styles.progressEditor, { opacity: editorEntrance, transform: [{ translateY: editorTranslateY }] }]}
          testID="goal-progress-editor"
        >
          <Text style={styles.progressEditorHeading} accessibilityRole="header">
            Record progress
          </Text>
          <CurrencyField
            label="Amount to record"
            required
            large
            value={contribution}
            onChangeText={(text) => {
              setContribution(text);
              if (contributionError) setContributionError(false);
            }}
            message={contributionError ? 'Enter a valid amount greater than $0, using up to two decimal places.' : null}
            testID="goal-progress-amount"
          />
          <Text style={styles.progressEditorMeta}>
            {formatCurrencyPrecise(goal.currentAmount)} recorded so far
            {remainingToTarget > 0 ? ` · ${formatCurrencyPrecise(remainingToTarget)} to go` : ''}
          </Text>
          {remainingToTarget > 0 ? (
            <TouchableOpacity
              style={styles.progressShortcut}
              onPress={() => setContribution(String(remainingToTarget))}
              accessibilityRole="button"
              accessibilityLabel={`Record remaining ${formatCurrencyPrecise(remainingToTarget)}`}
              testID="goal-progress-record-remaining"
            >
              <Text style={styles.progressShortcutText}>Record remaining {formatCurrencyPrecise(remainingToTarget)}</Text>
            </TouchableOpacity>
          ) : null}
          <Button
            label={pendingContributionAmount !== null ? `Record ${formatCurrencyPrecise(pendingContributionAmount)}` : 'Record progress'}
            onPress={() => handleAddContribution(false)}
            disabled={pendingContributionAmount === null}
            style={styles.progressPrimary}
            testID="goal-progress-submit"
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={closeProgressEditor}
            style={styles.progressPrimary}
            testID="goal-progress-cancel"
          />
          <Text style={styles.hintText}>This records goal progress; it does not move money between accounts.</Text>
        </Animated.View>
      ) : (
        <Button
          label="Update progress"
          onPress={openProgressEditor}
          style={styles.progressPrimary}
          testID="goal-update-progress"
        />
      )}

      {/* Already recorded — never pending a metadata Save. */}
      {progressConfirmation ? (
        <Animated.View style={[styles.progressConfirm, { opacity: confirmEntrance }]} accessibilityLiveRegion="polite" testID="goal-progress-confirmation">
          <Text style={styles.progressConfirmText}>{progressConfirmation}</Text>
        </Animated.View>
      ) : null}

      {goal.status === 'completed' ? (
        // Wave 4 closure — ONE completed state, identical immediately after
        // completion and when reopened from history. The keyboard is
        // dismissed and focus moved to this heading by the effect above, so
        // the completion is never announced from behind a number pad, and
        // the action hierarchy is the same in both cases.
        <View style={styles.completedBanner} testID="goal-completed-state">
          <Text ref={completionHeadingRef} style={styles.completedTitle} accessibilityRole="header">
            {goal.name} completed
          </Text>
          {/* Over-target is manually recorded goal progress, not investment
              performance or a verified balance — factual, not celebratory
              (over-target confirmation correction, §4). Compared in whole
              cents so binary drift can never push an exactly-equal pair
              into the over-target branch. */}
          <Text style={styles.completedBody}>
            {goal.targetAmount !== null && toCents(goal.currentAmount) > toCents(goal.targetAmount)
              ? `You recorded ${formatCurrencyPrecise(goal.currentAmount)} against your ${formatCurrencyPrecise(goal.targetAmount)} target — ${formatCurrencyPrecise(
                  fromCents(toCents(goal.currentAmount) - toCents(goal.targetAmount))
                )} over.`
              : `${formatCurrencyPrecise(goal.currentAmount)} of ${
                  goal.targetAmount !== null ? formatCurrencyPrecise(goal.targetAmount) : formatCurrencyPrecise(goal.currentAmount)
                } · 100%`}
          </Text>
          <Text style={styles.completedBody}>This goal is saved in your history.</Text>
          <View style={styles.completedActionsRow}>
            <Button label="Done" onPress={onClose} style={styles.completedPrimary} testID="goal-completed-done" />
            {onCreateAnother ? (
              <Button
                label="Create another goal"
                variant="secondary"
                onPress={() => {
                  onClose();
                  onCreateAnother();
                }}
                style={styles.completedPrimary}
                testID="goal-completed-create-another"
              />
            ) : null}
          </View>
          {/* Tertiary, and explicit: extending is a deliberate return to an
              active goal using the existing supported status, never a silent
              mutation of the completion. */}
          <TouchableOpacity
            style={styles.completedTertiary}
            onPress={handleExtend}
            accessibilityRole="button"
            accessibilityLabel="Extend goal"
            accessibilityHint="Returns this goal to active planning so you can raise its target"
            testID="goal-completed-extend"
          >
            <Text style={styles.completedTertiaryText}>Extend goal</Text>
          </TouchableOpacity>
          {/* Archive has its own persisted meaning (a separate 'archived'
              status with its own recovery path below), so it is preserved —
              but as a quiet tertiary action with copy that says what it
              does, never an unexplained co-primary. */}
          <TouchableOpacity
            style={styles.completedTertiary}
            onPress={handleArchive}
            accessibilityRole="button"
            accessibilityLabel="Archive goal"
            accessibilityHint="Hides this goal from your lists. Its history is kept and it can be restored."
            testID="goal-completed-archive"
          >
            <Text style={styles.completedTertiaryText}>Archive — hide from lists, keep history</Text>
          </TouchableOpacity>
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

      {/* Wave 4 closure — a COMPLETED goal is read-only by default. The
          editable fields and the progress editor below are hidden entirely,
          so progress can never be pushed past 100% through this view;
          `Extend goal` is the one explicit route back to an editable,
          active goal. */}
      {isReadOnlyCompleted ? null : (
      <>
      {/* Wave 4 closure — the SAME field system Add Goal renders. This
          replaces the legacy editor the owner recorded: raw MM/YYYY boxes,
          an isolated "Set" button for the target amount, emoji priority
          chips and a Close-only footer. Every field is prepopulated from the
          saved goal, and nothing here writes: edits are held locally and
          committed exactly once by "Save changes" below. */}
      <GoalFormFields
        testIDPrefix="goal-edit"
        today={startOfTodayLocal}
        values={{ purpose, name, targetAmount: targetAmountDraft, targetMonth, targetYear, priority }}
        onChangePurpose={choosePurpose}
        onChangeName={setName}
        onChangeTargetAmount={handleTargetAmountChange}
        onChangeTargetDate={(next) => {
          setTargetMonth(next.month === null ? '' : String(next.month));
          setTargetYear(next.year === null ? '' : String(next.year));
        }}
        onChangePriority={setPriority}
        amountMessage={
          targetAmountError
            ? 'Enter a valid amount greater than $0, using up to two decimal places, or leave it blank to clear the target.'
            : null
        }
        dateMessage={
          dateFieldsState === 'partial'
            ? 'Enter both month and year.'
            : dateFieldsState === 'invalid'
              ? 'Enter a valid month and four-digit year.'
              : dateFieldsState === 'past'
                ? 'Choose this month or a future month.'
                : null
        }
      />

      </>
      )}

      {goal.targetAmount ? (
        <>
          {dateFieldsState === 'partial' || dateFieldsState === 'invalid' || dateFieldsState === 'past' ? (
            <Text style={styles.dateValidationText} accessibilityLiveRegion="polite">
              {dateFieldsState === 'partial'
                ? 'Enter both month and year.'
                : dateFieldsState === 'invalid'
                  ? 'Enter a valid month and four-digit year.'
                  : 'Choose this month or a future month.'}
            </Text>
          ) : (
            // Wave 4 closure — the recorded pace defect. The caution used to
            // appear whenever the allocation engine reported this goal not
            // fully funded, but `requiredMonthlyForGoal` divides by
            // `monthsUntil(targetDate)`, which falls back to a THREE-YEAR
            // planning horizon when no date is set. A goal with a target
            // amount and no date was therefore warned about missing a
            // deadline the customer never gave. The shared rule now gates
            // the caution on a real, stated target date; it recreates no
            // formula — the engine's own requiredMonthly and isFullyFunded
            // are passed in and simply not consulted when their inputs were
            // never supplied.
            (() => {
              // Wave 4 closure — one shared, LIVE summary. A caution now
              // SUPPLEMENTS the estimate instead of swallowing it, and the
              // no-date case shows the same planning guide the create form
              // has always shown rather than only an instruction.
              if (paceSummary.kind === 'invalid-date' || paceSummary.kind === 'none') return null;
              if (paceSummary.kind === 'needs-target-amount') {
                return (
                  <View style={styles.calcBox} testID="goal-pace-needs-amount">
                    <Text style={styles.calcSubtext}>{paceSummary.message}</Text>
                  </View>
                );
              }
              if (paceSummary.kind === 'planning-guide') {
                return (
                  <View style={styles.calcBox} testID="goal-pace-planning-guide">
                    <Text style={styles.calcText}>{paceSummary.message}</Text>
                    <Text style={styles.calcSubtext}>{paceSummary.hint}</Text>
                  </View>
                );
              }
              return (
                <View style={[styles.calcBox, paceSummary.caution ? styles.calcBoxWarning : null]} testID="goal-pace-estimate">
                  <Text style={[styles.calcText, paceSummary.caution ? styles.calcTextWarning : null]}>{paceSummary.message}</Text>
                  <Text style={styles.calcSubtext}>Based on your target amount and target date.</Text>
                  {paceSummary.caution ? <Text style={styles.calcSubtext}>{paceSummary.caution}</Text> : null}
                </View>
              );
            })()
          )}
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
