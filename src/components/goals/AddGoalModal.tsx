import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { TextField } from '../shared/fields/TextField';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { Button } from '../shared/Button';
import { Segmented } from '../shared/Segmented';
import { AddIcon } from '../shared/AddIcon';
import { MonthYearField } from '../shared/fields/MonthYearField';
import { GoalFormFields } from './GoalFormFields';
import { GOAL_PURPOSES, resolveGoalNameOnPurposeChange, resolveGoalPaceSummary } from '../../lib/goalFormState';
import { goalPurposeIcon } from '../../lib/addIcons';
import { LifeGoalType, GoalPriority } from '../../types/models';
import { requiredMonthlyForGoal, classifyGoalDateFields, GoalDateFieldState } from '../../lib/calculations/goalAllocation';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';

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

export type AddGoalModalHandle = EmbeddedStepHandle;

export const AddGoalModal = forwardRef<
  AddGoalModalHandle,
  {
    visible: boolean;
    onClose: () => void;
    /** True only when rendered inside the embedded Add Anything -> Goal
     * route — activates real dirty-detection and a "Discard this goal?"
     * confirmation on Cancel/backdrop/swipe/Android Back, and returns bare
     * content instead of owning its own KeyboardSheet. Omitted (the
     * default) preserves this modal's original, unconditional-discard-on-
     * any-dismissal standalone behaviour exactly, so standalone
     * Today/Goals -> Add goal UX is never silently changed by embedding. */
    embedded?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
    onCanSaveChange?: (canSave: boolean) => void;
    onSaveSuccess?: () => void;
    onConfirmedClose?: (reason: EmbeddedCloseReason) => void;
  }
>(function AddGoalModal({ visible, onClose, embedded = false, onDirtyChange, onCanSaveChange, onSaveSuccess, onConfirmedClose }, ref) {
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

  // UX correction — full-workspace extension. This is a create-only form
  // (no editItem — see the props above), so its "opened with" values are
  // always this same fixed set; no snapshot ref is needed to know what to
  // compare against, unlike AddCreditCardModal/AddWealthItemModal which
  // also support editing an existing record. Embedded-gated exactly like
  // every other embedded destination — standalone always reports false.
  const isDirty =
    embedded && (type !== null || name !== '' || targetAmount !== '' || targetMonth !== '' || targetYear !== '' || priority !== 'medium');

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const amountState = classifyTargetAmount(targetAmount);
  // Shared with GoalDetailSheet and its regression tests via the same
  // exported classifier — never a second date-validation implementation
  // (Stream A New Goal correction pass §3).
  const dateState = classifyGoalDateFields(targetMonth, targetYear);
  const dateMessage = dateValidationMessage(dateState);

  const canSave = type !== null && name.trim().length > 0 && amountState !== 'invalid' && dateState !== 'partial' && dateState !== 'invalid' && dateState !== 'past';

  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);

  // Live preview using the shared canonical helper only — never a
  // reimplementation of the formula, the 36-month fallback, or the
  // whole-dollar rounding (all of those stay inside requiredMonthlyForGoal /
  // formatMoney, identical to GoalDetailSheet). No estimate is computed at
  // all while the amount is blank/invalid or the date is partial/invalid/past
  // — those states show validation guidance instead (see the render below).
  /**
   * Wave 4 closure — the SAME shared summary the edit sheet renders, so the
   * same inputs produce the same copy and the same amount in both modes.
   * Still the shared `requiredMonthlyForGoal` engine; nothing about the
   * three-year horizon or the arithmetic moved into the UI.
   */
  const paceSummary = useMemo(
    () =>
      resolveGoalPaceSummary(
        {
          targetAmount: amountState === 'valid' ? parseFloat(targetAmount) : null,
          targetDate:
            dateState === 'valid' ? new Date(parseInt(targetYear, 10), parseInt(targetMonth, 10) - 1, 1).toISOString() : null,
          dateState,
          // A goal being created has no recorded progress yet.
          currentAmount: 0,
        },
        (input) =>
          requiredMonthlyForGoal({
            id: 'preview',
            name: '',
            lifeGoalType: 'custom',
            targetAmount: input.targetAmount,
            currentAmount: input.currentAmount,
            targetDate: input.targetDate,
            status: 'active',
          })
      ),
    [amountState, targetAmount, dateState, targetMonth, targetYear]
  );

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
    // Standalone only (embedded never calls this — see handleRequestClose
    // below). Cancel, swipe-down and backdrop press all resolve to this
    // same path — no goal is ever created on any dismissal route (Stream A
    // New Goal correction pass §8). Unchanged by this correction.
    reset();
    onClose();
  }

  // UX correction — full-workspace extension. Embedded Cancel/backdrop/
  // swipe/Android Back funnel through here. 'back' never discards (and
  // never resets) — the embedded host preserves this draft across Back
  // (the form stays mounted, mirroring the existing Add Asset pattern),
  // so there is nothing to confirm losing and no reason to wipe fields the
  // user will see again immediately on reselecting Goal. Every other
  // reason only resets AFTER a confirmed discard (or immediately, if the
  // form was never dirty) — never pre-emptively, unlike the standalone
  // handleClose above.
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(
      isDirty,
      () => {
        reset();
        onConfirmedClose?.(reason);
      },
      'Discard this goal?',
      'Your new goal details will be lost.'
    );
  }

  /**
   * Wave 4 closure — the recorded defect. The old rule only filled an EMPTY
   * name, so picking `Buy property` and then `New car` left the stale
   * "Buy property" behind for the customer to correct by hand. The shared
   * rule replaces a name that is still a generated default and never touches
   * one the customer typed.
   */
  function selectType(value: LifeGoalType) {
    setName((current) => resolveGoalNameOnPurposeChange({ currentName: current, previousPurpose: type, nextPurpose: value }));
    setType(value);
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
      // The same engine value the summary displays — read from the shared
      // summary rather than a second, parallel preview calculation.
      estimatedMonthlyContribution:
        paceSummary.kind === 'estimate' || paceSummary.kind === 'planning-guide' ? paceSummary.monthly : undefined,
      status: 'active',
    });
    reset();
    // Successful Save never goes through requestClose/confirmDiscardIfDirty
    // — it must never produce a discard prompt. Embedded: hand control back
    // to the host (which closes the whole Add Anything journey exactly
    // once). Standalone: unchanged direct onClose().
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        // Wave 4 device correction — a real, readable card per purpose,
        // replacing the tiny visually-equal chip cloud the owner recorded.
        // Two columns at normal width; one at compact width or a large
        // accessibility font size, where two would clip the label.

        summaryCard: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.md,
          marginTop: spacing.md,
          marginBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        },
        summaryName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        summaryMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        row: { flexDirection: 'row', gap: spacing.sm },
        dateFieldHalf: { flex: 1 },
        helperText: { ...typography.micro, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        dateValidationText: { ...typography.caption, fontSize: 12, color: colors.warning, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
        previewBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        previewText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600', lineHeight: 18 },
        previewSubtext: { ...typography.micro, fontSize: 11, color: colors.accentStrong, marginTop: 2, lineHeight: 15 },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  const startOfTodayLocal = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  /** A restatement of the choices already made — never a new calculation.
   * Appears only once the goal has both a purpose and a name to confirm. */
  const summary = (() => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const selectedType = GOAL_PURPOSES.find((g) => g.value === type);
    if (!selectedType) return null;
    const amountLabel = amountState === 'valid' ? formatMoney(parseFloat(targetAmount.trim())) : 'No target set';
    const dateLabel = dateState === 'valid' ? `${targetMonth.padStart(2, '0')}/${targetYear}` : 'No target date';
    return {
      icon: goalPurposeIcon(selectedType.value),
      name: trimmedName,
      meta: `${selectedType.label} · ${amountLabel} · ${dateLabel}`,
      spoken: `${trimmedName}. ${selectedType.label}. ${amountLabel}. ${dateLabel}.`,
    };
  })();

  const content = (
    <>
      {/* Wave 4 closure — the SAME field system the edit adapter renders.
          Create and edit can no longer drift into two designs for the same
          five fields; this component is now purely the CREATE adapter,
          holding its own state and deciding what saving means. */}
      <GoalFormFields
        testIDPrefix="goal"
        today={startOfTodayLocal}
        values={{ purpose: type, name, targetAmount, targetMonth, targetYear, priority }}
        onChangePurpose={selectType}
        onChangeName={setName}
        onChangeTargetAmount={setTargetAmount}
        onChangeTargetDate={(next) => {
          setTargetMonth(next.month === null ? '' : String(next.month));
          setTargetYear(next.year === null ? '' : String(next.year));
        }}
        onChangePriority={setPriority}
        amountMessage={amountState === 'invalid' ? 'Enter a valid target amount, or leave it blank.' : null}
        // Factual, and deliberately NOT a recommendation — Navilo never
        // suggests how much a goal should be worth.
        amountHelper={amountState === 'blank' ? 'You can add or change the target later.' : null}
        dateMessage={dateMessage}
      />

      {/* Wave 4 closure — the shared, live pace summary. Identical wording
          and identical amount to the edit sheet, from the same rule and the
          same engine. */}
      {paceSummary.kind === 'planning-guide' ? (
        <View style={styles.previewBox} testID="goal-pace-planning-guide">
          <Text style={styles.previewText}>{paceSummary.message}</Text>
          <Text style={styles.previewSubtext}>{paceSummary.hint}</Text>
        </View>
      ) : paceSummary.kind === 'estimate' ? (
        <View style={styles.previewBox} testID="goal-pace-estimate">
          <Text style={styles.previewText}>{paceSummary.message}</Text>
          <Text style={styles.previewSubtext}>Based on your target amount and target date.</Text>
          {paceSummary.caution ? <Text style={styles.previewSubtext}>{paceSummary.caution}</Text> : null}
        </View>
      ) : null}

      {/* ---- Confirmation summary --------------------------------------- */}
      {/* A restatement of what is about to be saved — no new calculation,
          no advice, no urgency. Only appears once there is something real
          to confirm. */}
      {summary ? (
        <View style={styles.summaryCard} accessible accessibilityLabel={summary.spoken}>
          <AddIcon icon={summary.icon} tile emphasis="selected" />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryName}>{summary.name}</Text>
            <Text style={styles.summaryMeta}>{summary.meta}</Text>
          </View>
        </View>
      ) : null}
    </>
  );

  // Embedded — no Modal, no KeyboardSheet, no footer of its own. The host
  // supplies all of that and drives Save/Close through the ref handle
  // above, exactly mirroring AddWealthItemModal's own established
  // embedded-mode contract.
  if (embedded) {
    return content;
  }

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
      {content}
    </KeyboardSheet>
  );
});
