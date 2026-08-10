import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState, MidCycleIncomeOccurrenceChoice } from '../../state/AppStateContext';
import { useSavingsAllocationPrompt } from '../../state/SavingsAllocationPromptContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { DatePickerModal } from '../shared/DatePickerModal';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { PayFrequency, RecurringItem } from '../../types/models';
import { toMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { parseMoneyInput } from '../../lib/calculations/money';
import { precedingOccurrence, isPrecedingOccurrenceEligibleForPrompt } from '../../lib/calculations/recurringSchedule';
import { resolveEligibleIncomeDestinations } from '../../lib/calculations/incomeDestinations';
import { IncomeDestinationPicker } from '../shared/IncomeDestinationPicker';
import { generateId } from '../../lib/id';
import { categoryEmoji } from '../../lib/categoryEmoji';
import { brand } from '../../lib/brand';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';

const INCOME_SOURCE_IDS = ['cat-salary', 'cat-side-hustle', 'cat-investment-income', 'cat-rental-income', 'cat-gift', 'cat-other-income'];

const INCOME_SOURCE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'cat-salary': 'briefcase-outline',
  'cat-side-hustle': 'laptop-outline',
  'cat-investment-income': 'trending-up-outline',
  'cat-rental-income': 'home-outline',
  'cat-gift': 'gift-outline',
  'cat-other-income': 'cash-outline',
};

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// B2.4 — the mid-cycle prompt's day/month references ("did you receive
// your 10 July income?") deliberately omit the weekday/year formatDate
// carries, matching the plain "10 July" / "10 August" phrasing in the
// product spec.
function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

// `minimumDate={new Date()}` compares the picker's date-only value against a
// live timestamp — on a date-only picker that treats "today" as today's
// local midnight, that midnight value is always earlier than the current
// moment (any time after 00:00:00), so today was incorrectly excluded and
// the earliest selectable date became tomorrow (confirmed device defect,
// B2.0B due-today boundary correction). Start-of-day is unambiguous
// regardless of what time the modal happens to be opened, so today remains
// selectable while yesterday and earlier stay excluded.
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// "Irregular" is real, recurring-but-unpredictable income (freelance,
// casual shifts, commission) — distinct from a one-off amount, which is
// recorded as an income transaction instead (PRD ask, §1: "Record income
// received") and never touches these fields at all.
const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'irregular', label: 'Irregular recurring' },
];

/**
 * One income source, added/edited/deleted independently of every other one
 * (PRD ask, §3: "support multiple recurring income sources" — Salary,
 * rental, dividends, side business, etc., each with its own name, amount,
 * frequency and next expected payment). Each source is a `RecurringItem`
 * of type 'income', the same shape and CRUD bills already use — Money
 * Engine, Safe to Spend, Lulu Score, and everything else still only ever
 * see one aggregate `monthlyIncome`, kept in sync automatically in
 * AppStateContext (`syncIncomeAggregate`) from however many sources exist.
 */
export type AddIncomeModalHandle = EmbeddedStepHandle;

export const AddIncomeModal = forwardRef<
  AddIncomeModalHandle,
  {
    visible: boolean;
    onClose: () => void;
    /** Present = editing this existing income source instead of adding a new one. */
    editItem?: RecurringItem | null;
    /** True only when rendered inside the embedded Add Anything -> Income
     * source route — activates real dirty-detection and a "Discard income?"
     * confirmation on Cancel/backdrop/swipe/Android Back, and reroutes the
     * three internal steps (category/details/midCycle) into plain content
     * returned to the host instead of each wrapping its own KeyboardSheet.
     * All three steps stay internal to this one embedded route — the host
     * never sees or manages formStep itself. */
    embedded?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
    onCanSaveChange?: (canSave: boolean) => void;
    onTitleChange?: (title: string) => void;
    onSaveSuccess?: () => void;
    onConfirmedClose?: (reason: EmbeddedCloseReason) => void;
  }
>(function AddIncomeModal(
  { visible, onClose, editItem, embedded = false, onDirtyChange, onCanSaveChange, onTitleChange, onSaveSuccess, onConfirmedClose },
  ref
) {
  const { data, addRecurringItem, updateRecurringItem, deleteRecurringItem, addRecurringIncomeWithMidCycleOccurrence } = useAppState();
  const { requestPrompt } = useSavingsAllocationPrompt();
  const { colors, radius, spacing, typography } = useTheme();
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('cash-outline');
  const [label, setLabel] = useState('');
  const [income, setIncome] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [unknownDate, setUnknownDate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Category-first, like the transaction flow (PRD ask: "make it
  // friendlier") — picking what kind of income this is comes before the
  // amount. Editing an existing source already has a name, so it skips
  // straight to details. 'midCycle' (B2.4) — the "did you receive your
  // <date> income?" prompt, shown instead of saving immediately when a new
  // monthly income source's immediately preceding expected occurrence is
  // still within the current calendar month (see handleSave below).
  const [formStep, setFormStep] = useState<'category' | 'details' | 'midCycle'>('category');
  // B2.4 — the fully-built payload, derived preceding-occurrence date, and
  // the new recurring item's own stable id, all captured once when
  // handleSave decides to show the prompt instead of saving immediately —
  // never re-derived by any option handler, so the date shown to the user
  // and the date actually recorded can never disagree. midCycleRecurringItemId
  // is generated exactly once here (a plain function call, never inside a
  // setState updater) and reused for every option this same prompt session
  // might go on to produce — this is what makes the duplicate-occurrence
  // guard inside createRecurringIncomeWithMidCycleOccurrence meaningful
  // against a rapid double-tap (regression-protection review, B2.4
  // duplicate-identity correction).
  const [midCyclePayload, setMidCyclePayload] = useState<Omit<RecurringItem, 'id'> | null>(null);
  const [midCycleDate, setMidCycleDate] = useState<string | null>(null);
  const [midCycleRecurringItemId, setMidCycleRecurringItemId] = useState<string | null>(null);
  const [awaitingDestination, setAwaitingDestination] = useState(false);
  // Correction round, 2026-08-10 review — a genuine standalone
  // AddWealthItemModal overlay, never itself embedded, reusing the real
  // asset-creation form/persistence unconditionally. Previously this opened
  // AddWealthItemModal with no category restriction, so the FULL asset
  // chooser (including investment/property/retirement/etc., none of which
  // can ever receive income) was reachable from an income-destination
  // prompt — a real defect. onlyLiquidCategories restricts the category
  // step to the same Cash/Everyday/Savings set as the scoped
  // "Add a money balance" AddAnythingSheet journey (requirement 5), without
  // importing AddAnythingSheet itself — AddAnythingSheet already imports
  // AddIncomeModal (to embed the income-source destination), so importing
  // it back here would create a circular module dependency.
  const [addBalanceVisible, setAddBalanceVisible] = useState(false);
  // Synchronous submission guard (B2.4: "so repeated taps cannot create
  // duplicate transactions or balance effects") — every one of the four
  // option handlers checks and sets this before doing anything else, the
  // same presentation-level pattern SmartReminderCard's isSubmitting
  // already uses for the analogous confirm-tap risk.
  const [midCycleSubmitting, setMidCycleSubmitting] = useState(false);

  const isEditing = !!editItem;
  const isIrregular = frequency === 'irregular';

  // UX correction — draft protection. Snapshot of the details step's own
  // fields as they stood the moment the sheet opened (blank for a new
  // source, pre-filled for an edit) — compared against current values below
  // to decide whether a dismiss attempt is actually discarding something.
  // A ref, not state: it must never itself trigger a re-render, and must
  // stay stable for the sheet's whole open session regardless of how many
  // times the user edits a field afterward (same pattern already
  // established in AddWealthItemModal.tsx).
  const initialSnapshot = useRef({ label: '', income: '', frequency: 'monthly' as PayFrequency, nextDueDate: null as string | null, unknownDate: false });

  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      setIcon((editItem.icon as keyof typeof Ionicons.glyphMap) ?? 'cash-outline');
      setLabel(editItem.label);
      setIncome(String(editItem.amount));
      setFrequency(editItem.frequency);
      setNextDueDate(editItem.nextDueDateUnknown ? null : editItem.nextDueDate);
      setUnknownDate(!!editItem.nextDueDateUnknown);
      setFormStep('details');
      initialSnapshot.current = {
        label: editItem.label,
        income: String(editItem.amount),
        frequency: editItem.frequency,
        nextDueDate: editItem.nextDueDateUnknown ? null : editItem.nextDueDate,
        unknownDate: !!editItem.nextDueDateUnknown,
      };
    } else {
      setIcon('cash-outline');
      setLabel('');
      setIncome('');
      setFrequency('monthly');
      setNextDueDate(null);
      setUnknownDate(false);
      setFormStep('category');
      initialSnapshot.current = { label: '', income: '', frequency: 'monthly', nextDueDate: null, unknownDate: false };
    }
    setPickerOpen(false);
    setMidCyclePayload(null);
    setMidCycleDate(null);
    setMidCycleRecurringItemId(null);
    setAwaitingDestination(false);
    setMidCycleSubmitting(false);
  }, [visible, editItem]);

  // True once any field genuinely differs from the snapshot captured when
  // the sheet opened — gates the details step's swipe/tap-outside/Cancel
  // dismissal behind a "Discard income?" confirmation. An untouched form
  // (nothing typed on Add, nothing changed on Edit) stays false and closes
  // normally, matching the required "an empty, untouched form may close
  // normally" behaviour.
  const isDetailsDirty =
    label !== initialSnapshot.current.label ||
    income !== initialSnapshot.current.income ||
    frequency !== initialSnapshot.current.frequency ||
    nextDueDate !== initialSnapshot.current.nextDueDate ||
    unknownDate !== initialSnapshot.current.unknownDate;

  // Correction pass (Defect 2 fix) — while embedded, the host's global
  // parked-draft guard must see this form as dirty for as long as ANY
  // unsaved change has ever existed this session across ALL THREE internal
  // steps, not only while isDetailsDirty is momentarily true — see
  // QuickAddModal.tsx's identical correction for the full reasoning. The
  // STANDALONE requestCancel/handleRequestClose paths above intentionally
  // keep reading the raw isDetailsDirty — the latch only changes what the
  // HOST is told via onDirtyChange.
  const hasBeenDirtyRef = useRef(false);
  if (embedded && isDetailsDirty) hasBeenDirtyRef.current = true;
  const reportedDirty = embedded ? hasBeenDirtyRef.current : isDetailsDirty;

  useEffect(() => {
    onDirtyChange?.(reportedDirty);
  }, [reportedDirty, onDirtyChange]);

  useEffect(() => {
    onTitleChange?.(formStep === 'category' ? 'Add income source' : formStep === 'midCycle' ? 'One more thing' : isEditing ? 'Edit income source' : 'Add income source');
  }, [formStep, isEditing, onTitleChange]);

  // Correction round, 2026-08-10 — the shared eligible-income-destination
  // selector (incomeDestinations.ts), the same one SmartReminderCard's
  // salary-due confirmation now uses. Replaces the previous Cash(implicit)+
  // Savings-only list: every existing Cash, Everyday and Savings asset is
  // offered individually by its real id, with balances shown and same-name
  // accounts disambiguated. No phantom "Cash" entry — an empty result
  // (brand-new profile, zero eligible balances) is a real, handled state
  // (see the empty-state branch in the destination sub-step below), never
  // silently backed by an auto-created Cash asset.
  const eligibleDestinations = useMemo(() => resolveEligibleIncomeDestinations(data.assets), [data.assets]);

  // Strict money-input contract (regression-protection review, B2.0B
  // recurring-money precision correction §2/§3) — replaces the old
  // permissive parseFloat-based check, which accepted trailing garbage,
  // multiple decimal points, and more than two decimal places with no
  // signal that anything was silently dropped. `income.trim().length > 0`
  // gates the inline error so an untouched/empty field never shows one.
  const parsedIncome = parseMoneyInput(income);
  const incomeAmountError = income.trim().length > 0 && !parsedIncome.valid;
  // A known next payment is required for regular/predictable frequencies
  // (Navilo needs a real date to schedule Money Plan and Available Until
  // Payday around) but is genuinely optional for irregular income — never
  // invented when the user says they don't know it (PRD ask, §1/§5).
  const canSave = label.trim().length > 0 && parsedIncome.valid && (isIrregular || unknownDate || !!nextDueDate);
  const monthlyPreview = parsedIncome.valid ? toMonthlyAmount(parsedIncome.amount, frequency) : null;

  // Save is only ever reachable from the details step — standalone has no
  // Save button on 'category'/'midCycle' at all, and embedded must not
  // expose one either (a stray tap while the mid-cycle prompt's own
  // dedicated option buttons are the only valid next action must not
  // silently re-trigger the mid-cycle branch below and mint a fresh,
  // unused midCycleRecurringItemId).
  useEffect(() => {
    onCanSaveChange?.(canSave && formStep === 'details');
  }, [canSave, formStep, onCanSaveChange]);

  function handleSave() {
    if (!canSave || !parsedIncome.valid || formStep !== 'details') return;
    // Qualification and the request itself are computed and fired
    // synchronously, before any state mutation below — the request must
    // survive regardless of what happens to this component afterward
    // (PRD ask: some hosts, e.g. MoneyPictureChecklistCard, can unmount
    // this modal abruptly as a side effect of the very save below, so the
    // signal cannot depend on this component's own close lifecycle
    // completing). Never applies to editing an existing source, only a
    // genuine 0 -> 1 active-income transition, and never re-fires once
    // the disclosure has been handled or a real allocation already exists.
    const activeIncomeCountBefore = data.recurringItems.filter((r) => r.type === 'income' && r.active).length;
    const qualifiesForSavingsAllocationPrompt =
      !editItem &&
      activeIncomeCountBefore === 0 &&
      !data.user.savingsAllocationPromptHandled &&
      (!data.user.savingsAllocation || data.user.savingsAllocation.mode === 'off');
    if (qualifiesForSavingsAllocationPrompt) requestPrompt();

    const payload = {
      type: 'income' as const,
      label: label.trim(),
      amount: parsedIncome.amount,
      frequency,
      nextDueDate: unknownDate || !nextDueDate ? new Date().toISOString() : nextDueDate,
      nextDueDateUnknown: unknownDate,
      isFixed: true,
      active: true,
      icon,
    };

    // B2.4 mid-cycle recurring-income initialisation — TRIGGER RULES:
    // "Apply only when creating new recurring monthly income... Do not show
    // the prompt during ordinary edits." Never for editing, never for a
    // frequency other than monthly, never when the user doesn't know the
    // next payment date (unknownDate) — there is no future date to derive
    // "one month before" from.
    if (!editItem && frequency === 'monthly' && !unknownDate && nextDueDate) {
      const preceding = precedingOccurrence({ nextDueDate, frequency: 'monthly' });
      const today = startOfToday();
      // "Show the prompt only if that preceding occurrence is on or before
      // today and falls within the current calendar month."
      if (isPrecedingOccurrenceEligibleForPrompt(preceding, today)) {
        // B2.4 duplicate-identity correction — the recurring item's own id
        // is generated exactly once, right here, as a plain function call
        // (never inside a setState updater), before either option can be
        // tapped. This is the ONLY correct place to generate it: it must
        // exist before the prompt shows so every option handler for this
        // same session reuses the identical value, which is what lets the
        // duplicate-occurrence guard inside
        // createRecurringIncomeWithMidCycleOccurrence recognise a rapid
        // double-tap as a no-op rather than two differently-identified
        // sources. There is deliberately no "already recorded" pre-check
        // here — a freshly generated id can never already appear on an
        // existing transaction, so that check would be vacuous at this
        // point; the meaningful check happens once an id is actually
        // committed, inside the atomic creation function itself.
        const recurringItemId = generateId();
        setMidCyclePayload(payload);
        setMidCycleDate(preceding.toISOString());
        setMidCycleRecurringItemId(recurringItemId);
        setAwaitingDestination(false);
        setFormStep('midCycle');
        return;
      }
    }

    if (editItem) {
      updateRecurringItem(editItem.id, payload);
    } else {
      addRecurringItem(payload);
    }
    // Embedded: hand control back to the host, which closes the whole Add
    // Anything journey exactly once. Standalone: unchanged direct onClose().
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function handleDelete() {
    if (editItem) deleteRecurringItem(editItem.id);
    onClose();
  }

  // UX correction — the details step's footer Cancel button, a separate
  // dismiss path from swipe/tap-outside that must go through the same
  // dirty check rather than closing unconditionally (mirrors
  // AddWealthItemModal's existing requestCancel pattern). A plain function
  // call, evaluated fresh on every press — unlike KeyboardSheet's own
  // swipe gesture, a button's onPress handler is never captured inside a
  // one-time useRef closure, so this needs no ref-based staleness guard.
  function requestCancel() {
    confirmDiscardIfDirty(isDetailsDirty, onClose, 'Discard income?', 'Your entered income details will be lost.');
  }

  // Full-workspace extension — 'back' never discards (draft preserved
  // across Back, matching every other newly-embedded destination); every
  // other reason routes through the same dirty check requestCancel above
  // already uses standalone, reusing isDetailsDirty as the single source of
  // truth across all three internal steps (it is correctly false on
  // 'category' and correctly still reflects the details fields on
  // 'midCycle', since those fields are never cleared until a genuine save).
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(isDetailsDirty, () => onConfirmedClose?.(reason), 'Discard income?', 'Your entered income details will be lost.');
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

  // B2.4 — options 3/4 ("first payment is later" / "not sure") both save
  // the recurring item exactly as the ordinary path already would: no
  // transaction, no balance effect, the entered next-payment date
  // untouched. Kept as one shared handler since the two answers are
  // identical in effect, differing only in the copy that led to them.
  function chooseMidCycleNoOccurrence() {
    if (!midCyclePayload || midCycleSubmitting) return;
    setMidCycleSubmitting(true);
    addRecurringItem(midCyclePayload);
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function chooseMidCycleAlreadyIncluded() {
    if (!midCyclePayload || !midCycleDate || !midCycleRecurringItemId || midCycleSubmitting) return;
    setMidCycleSubmitting(true);
    const choice: MidCycleIncomeOccurrenceChoice = { kind: 'already_included' };
    addRecurringIncomeWithMidCycleOccurrence(midCyclePayload, midCycleRecurringItemId, choice, midCycleDate);
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function chooseMidCycleAddToBalance(targetAssetId: string) {
    if (!midCyclePayload || !midCycleDate || !midCycleRecurringItemId || midCycleSubmitting) return;
    setMidCycleSubmitting(true);
    const choice: MidCycleIncomeOccurrenceChoice = { kind: 'add_to_balance', targetAssetId };
    addRecurringIncomeWithMidCycleOccurrence(midCyclePayload, midCycleRecurringItemId, choice, midCycleDate);
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function chooseSource(sourceId: string) {
    setIcon(INCOME_SOURCE_ICON[sourceId] ?? 'cash-outline');
    setLabel((prev) => prev || SOURCE_LABEL[sourceId] || 'Income');
    setFormStep('details');
  }

  function chooseFrequency(f: PayFrequency) {
    setFrequency(f);
    // Switching frequency invalidates whatever date was picked under the
    // old schedule — never leave a stale date sitting behind a newly-chosen
    // frequency (PRD ask, §5: "do not allow contradictory states").
    setNextDueDate(null);
    setUnknownDate(f === 'irregular');
    setPickerOpen(false);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        amountInput: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
          fontSize: 26,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        chip: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        footerButton: { flex: 1 },
        deleteButton: { alignSelf: 'center', marginTop: spacing.lg },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        preview: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.sm },
        amountError: { ...typography.caption, fontSize: 12, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.sm },
        sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        sourceCard: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        sourceCardEmoji: { fontSize: 26, marginBottom: spacing.xs },
        sourceCardLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        midCycleTitle: { ...typography.title, fontSize: 18, color: colors.textPrimary, marginBottom: spacing.xs },
        midCycleBody: { ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
        midCycleOption: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: 14,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        midCycleOptionDisabled: { opacity: 0.5 },
        midCycleOptionText: { ...typography.body, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
        dateButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
        },
        dateButtonText: { ...typography.body, fontSize: 15, color: colors.textPrimary },
        dateButtonPlaceholder: { color: colors.textMuted },
        toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
        toggleText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
        irregularNote: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 15 },
      }),
    [colors, radius, spacing, typography]
  );

  if (formStep === 'midCycle' && midCyclePayload && midCycleDate) {
    const midCycleContent = (
      <>
        <Text style={styles.midCycleTitle}>{`Did you receive your ${formatDayMonth(midCycleDate)} income?`}</Text>
        <Text style={styles.midCycleBody}>Recording it helps Navilo understand this month more accurately.</Text>

        {!awaitingDestination ? (
          <>
            <TouchableOpacity
              style={[styles.midCycleOption, midCycleSubmitting ? styles.midCycleOptionDisabled : null]}
              onPress={chooseMidCycleAlreadyIncluded}
              disabled={midCycleSubmitting}
            >
              <Text style={styles.midCycleOptionText}>Yes, it's already included in my balances</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.midCycleOption, midCycleSubmitting ? styles.midCycleOptionDisabled : null]}
              onPress={() => setAwaitingDestination(true)}
              disabled={midCycleSubmitting}
            >
              <Text style={styles.midCycleOptionText}>Yes, add it to a balance</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.midCycleOption, midCycleSubmitting ? styles.midCycleOptionDisabled : null]}
              onPress={chooseMidCycleNoOccurrence}
              disabled={midCycleSubmitting}
            >
              <Text style={styles.midCycleOptionText}>{`No, my first payment is ${formatDayMonth(midCyclePayload.nextDueDate)}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.midCycleOption, midCycleSubmitting ? styles.midCycleOptionDisabled : null]}
              onPress={chooseMidCycleNoOccurrence}
              disabled={midCycleSubmitting}
            >
              <Text style={styles.midCycleOptionText}>I'm not sure</Text>
            </TouchableOpacity>
          </>
        ) : (
          <IncomeDestinationPicker
            destinations={eligibleDestinations}
            onSelect={chooseMidCycleAddToBalance}
            onBack={() => setAwaitingDestination(false)}
            disabled={midCycleSubmitting}
            onAddBalance={() => setAddBalanceVisible(true)}
          />
        )}
        <AddWealthItemModal visible={addBalanceVisible} kind="asset" onClose={() => setAddBalanceVisible(false)} onlyLiquidCategories />
      </>
    );

    if (embedded) return midCycleContent;

    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💼 One more thing"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} disabled={midCycleSubmitting} />}
      >
        {midCycleContent}
      </KeyboardSheet>
    );
  }

  if (formStep === 'category') {
    const categoryContent = (
      <>
        {/* UX correction — the helper copy was rewritten to "Tell Navilo
            where your income comes from." (shorter, more direct). No
            numberOfLines/ellipsizeMode is set — RN's numberOfLines={n}
            genuinely truncates content beyond n lines (default ellipsizeMode
            'tail'), so a "cap" would actively clip long/scaled text rather
            than protect it. Left fully unbounded instead: the Text wraps to
            however many lines accessibility font scaling requires, never
            truncated. No width/height constraint is applied beyond the
            sheet's own existing horizontal padding (styles.preview has never
            set either), so it already uses the full available content width
            and never clips at either edge. */}
        <Text style={styles.preview}>Tell {brand.name} where your income comes from.</Text>
        <View style={styles.sourceGrid}>
          {INCOME_SOURCE_IDS.map((id) => (
            <TouchableOpacity key={id} style={styles.sourceCard} activeOpacity={0.8} onPress={() => chooseSource(id)}>
              <Text style={styles.sourceCardEmoji}>{categoryEmoji(id)}</Text>
              <Text style={styles.sourceCardLabel}>{SOURCE_LABEL[id]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );

    if (embedded) return categoryContent;

    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💼 Add income source"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        {categoryContent}
      </KeyboardSheet>
    );
  }

  const content = (
    <>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Salary" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />

      <Text style={styles.label}>{isIrregular ? 'Typical amount' : 'Amount'}</Text>
      <TextInput
        style={styles.amountInput}
        placeholder="$6,000"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={income}
        onChangeText={setIncome}
      />
      {incomeAmountError ? (
        <Text style={styles.amountError} accessibilityLiveRegion="polite">
          Enter an amount to the nearest cent (up to 2 decimal places).
        </Text>
      ) : null}
      {monthlyPreview !== null && frequency !== 'monthly' ? <Text style={styles.preview}>≈ {formatMoney(monthlyPreview)}/month estimated</Text> : null}

      <Text style={styles.label}>Pay frequency</Text>
      <View style={styles.row}>
        {FREQUENCIES.map((f) => (
          <TouchableOpacity key={f.value} style={[styles.chip, frequency === f.value ? styles.chipActive : null]} onPress={() => chooseFrequency(f.value)}>
            <Text style={[styles.chipText, frequency === f.value ? styles.chipTextActive : null]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isIrregular ? (
        <>
          <Text style={styles.label}>Next expected payment</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              // UX correction — blur/dismiss the keyboard before the date
              // picker opens, so the field it replaces gets the full
              // available viewport rather than fighting the keyboard for
              // space (device defect: keyboard remained open behind the
              // calendar).
              Keyboard.dismiss();
              setPickerOpen(true);
            }}
          >
            <Text style={[styles.dateButtonText, !nextDueDate ? styles.dateButtonPlaceholder : null]}>
              {nextDueDate ? formatDate(nextDueDate) : 'Choose a date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.label}>Expected date (optional)</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              Keyboard.dismiss();
              setPickerOpen(true);
            }}
            disabled={unknownDate}
          >
            <Text style={[styles.dateButtonText, !nextDueDate || unknownDate ? styles.dateButtonPlaceholder : null]}>
              {!unknownDate && nextDueDate ? formatDate(nextDueDate) : 'No date set'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => {
              setUnknownDate((v) => !v);
              setPickerOpen(false);
              if (!unknownDate) setNextDueDate(null);
            }}
          >
            <Ionicons name={unknownDate ? 'checkbox' : 'square-outline'} size={20} color={unknownDate ? colors.accentStrong : colors.textMuted} />
            <Text style={styles.toggleText}>I don't know when the next payment will arrive</Text>
          </TouchableOpacity>
          <Text style={styles.irregularNote}>
            {brand.name} won't guess a payday for irregular income — Available Until Payday will show a cash-runway estimate instead.
          </Text>
        </>
      )}

      {/* UX correction — a dedicated modal, isolated from this sheet's own
          swipe-to-dismiss gesture (device defect: scrolling/swiping inside
          the previously-inline calendar could be captured as "close the
          whole form", silently discarding name/amount/frequency already
          entered). Shared between both frequency branches above since only
          one is ever mounted at a time and both drive the same nextDueDate
          field. gesturesEnabled={!pickerOpen} on the KeyboardSheet above
          additionally disables this sheet's own pan-to-close for as long as
          this is open. */}
      <DatePickerModal
        visible={pickerOpen}
        value={nextDueDate ? new Date(nextDueDate) : new Date()}
        minimumDate={startOfToday()}
        onChange={(date) => setNextDueDate(date.toISOString())}
        onClose={() => setPickerOpen(false)}
      />

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete income source</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit income source' : 'Add income source'}
      isDirty={isDetailsDirty}
      discardTitle="Discard income?"
      discardMessage="Your entered income details will be lost."
      gesturesEnabled={!pickerOpen}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={requestCancel} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      {content}
    </KeyboardSheet>
  );
});

const SOURCE_LABEL: Record<string, string> = {
  'cat-salary': 'Salary',
  'cat-side-hustle': 'Side hustle',
  'cat-investment-income': 'Dividends',
  'cat-rental-income': 'Rental income',
  'cat-gift': 'Gift',
  'cat-other-income': 'Other',
};
