import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { RecurringItem, PayFrequency, LiabilityType } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { parseMoneyInput } from '../../lib/calculations/money';
import { anchoredMonthlyDate } from '../../lib/calculations/recurringSchedule';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';

// Rent and Mortgage are deliberately separate presets, not one combined
// entry (PRD ask): rent is a pure expense, mortgage also builds/reduces a
// real liability, so only Mortgage triggers the loan-balance fields below.
// `handoffLoanType` (Stream C — generalized from the previous mortgage-only
// hand-off) marks the presets that need liability linking (property/
// vehicle) and explicit repayment scheduling, not this generic bill form —
// picking one of these hands off to the one shared loan flow
// (AddWealthItemModal) instead of duplicating that logic here (PRD ask,
// §B4: "all entry points should use one shared mortgage creation/update
// function"). Icons for Car Loan/Personal Loan match the icons
// AddWealthItemModal itself already assigns those bill types, so the
// picker and the eventual bill never visually disagree.
const BILL_PRESETS: { label: string; icon: keyof typeof Ionicons.glyphMap; emoji: string; handoffLoanType?: LiabilityType }[] = [
  { label: 'Rent', icon: 'home-outline', emoji: '🏠' },
  { label: 'Mortgage', icon: 'home', emoji: '🏠', handoffLoanType: 'mortgage' },
  { label: 'Utilities', icon: 'flash-outline', emoji: '⚡' },
  { label: 'Phone', icon: 'phone-portrait-outline', emoji: '📱' },
  { label: 'Internet', icon: 'wifi-outline', emoji: '🌐' },
  { label: 'Gym', icon: 'barbell-outline', emoji: '🏋️' },
  { label: 'Subscription', icon: 'play-circle-outline', emoji: '🎬' },
  { label: 'Car', icon: 'car-outline', emoji: '🚗' },
  // Distinct icon from the plain 'Car' expense preset above — both were
  // briefly 'car-outline', which made the details-step header's
  // `BILL_PRESETS.find(p => p.icon === icon)` lookup ambiguous and always
  // resolve to 'Car' instead of 'Car Loan' when editing a car-loan bill.
  { label: 'Car Loan', icon: 'car-sport-outline', emoji: '🚙', handoffLoanType: 'car_loan' },
  { label: 'Personal Loan', icon: 'document-text-outline', emoji: '📄', handoffLoanType: 'personal_loan' },
  { label: 'Insurance', icon: 'shield-checkmark-outline', emoji: '🛡️' },
  { label: 'Other', icon: 'ellipse-outline', emoji: '➕' },
];

// Deferred loan handoff (Stream D, D1, corrected): chooseBillType() used to
// call onClose() and onSelectLoan() in the same synchronous handler,
// batching this sheet's own Modal dismissal and AddWealthItemModal's
// presentation into one React commit — the same same-tick dual-native-
// Modal-transition defect fixed in AddAnythingSheet.tsx/OptionsSheet.tsx.
// KeyboardSheet now forwards RN's real onDismiss (native-dismissal-complete
// signal) through to its own underlying Modal, so on iOS this sheet defers
// onSelectLoan to that real event — never a timer. RN's Modal never calls
// onDismiss on Android, so LOAN_HANDOFF_DEFER_MS below is an Android-only
// fallback HEURISTIC, not a documented or guaranteed RN transition
// duration — it matches OptionsSheet.tsx's own long-standing Android
// fallback constant purely for consistency with an existing, already-
// accepted approximation in this codebase.
const LOAN_HANDOFF_DEFER_MS = 300;

const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

// `new Date(year, month, dayOfMonth).getTime() < now.getTime()` compared a
// midnight-of-today candidate against a live timestamp — for
// dayOfMonth === today's date, midnight is always earlier than "now" (any
// time after 00:00:00), so a same-day bill was always incorrectly rolled to
// next month (confirmed device defect, B2.0B due-today boundary
// correction). Comparing against start-of-day instead makes today resolve
// to today, not next month.
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Reuses recurringSchedule.ts's anchoredMonthlyDate — the same
// B2.0A-established clamp-and-restore helper already used for every later
// schedule advancement — instead of the bare `new Date(year, month, day)`
// constructor, which silently overflows past the end of a short month
// (e.g. day 31 in February rolling into March) rather than clamping. Using
// the same shared helper for this first-occurrence date means a
// short-month day-of-month is clamped exactly the same way a later
// advancement would clamp it — never an unrelated day in the following
// month (regression-protection review, B2.0B due-today boundary
// correction §5 — month-end safety).
function nextOccurrence(dayOfMonth: number): string {
  const today = startOfToday();
  const candidate = anchoredMonthlyDate(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (candidate.getTime() < today.getTime()) {
    return anchoredMonthlyDate(today.getFullYear(), today.getMonth() + 1, dayOfMonth).toISOString();
  }
  return candidate.toISOString();
}

function dayOfMonthFrom(iso: string): string {
  return String(new Date(iso).getDate());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export type AddRecurringItemModalHandle = EmbeddedStepHandle;

export const AddRecurringItemModal = forwardRef<
  AddRecurringItemModalHandle,
  {
    visible: boolean;
    onClose: () => void;
    /** Present = editing this existing bill instead of creating a new one. */
    editItem?: RecurringItem | null;
    /** A mortgage/car loan/personal loan needs liability linking (property or
     * vehicle) and an explicit repayment date, not this generic bill form —
     * picking one of those presets hands off to the one shared loan flow
     * (AddWealthItemModal) instead of duplicating loan-specific logic in two
     * places (PRD ask, §B4: "all entry points should use one shared mortgage
     * creation/update function" — generalized to every loan type, Stream C).
     * Receives the exact LiabilityType so the shared flow lands directly on
     * the matching type chip. STANDALONE only — never called when
     * `embedded` is true (see onRequestLoan below). */
    onSelectLoan?: (type: LiabilityType) => void;
    /** Full-workspace extension — the embedded equivalent of onSelectLoan
     * above. Called synchronously, directly, the instant a loan preset is
     * tapped while embedded — no Modal dismissal to sequence, so no defer/
     * timer dance is needed; the host (AddAnythingSheet) forwards this into
     * its own route controller (chooser<->bill<->liability are routes in
     * the SAME persistent workspace, never separate Modal presentations).
     * Never called when `embedded` is false. */
    onRequestLoan?: (type: LiabilityType) => void;
    /** True only when rendered inside the embedded Add Anything -> Bill
     * route — activates real dirty-detection and a "Discard this bill?"
     * confirmation on Cancel/backdrop/swipe/Android Back (this form has
     * NEVER had discard confirmation for any dismissal path standalone —
     * that stays completely unchanged; this is new, embedded-only
     * protection, not a fix applied everywhere), and returns bare content
     * for both the category and details steps instead of each owning its
     * own KeyboardSheet. Omitted (the default) preserves 100% of the
     * standalone rendering. */
    embedded?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
    onCanSaveChange?: (canSave: boolean) => void;
    onTitleChange?: (title: string) => void;
    onSaveSuccess?: () => void;
    onConfirmedClose?: (reason: EmbeddedCloseReason) => void;
  }
>(function AddRecurringItemModal(
  { visible, onClose, editItem, onSelectLoan, onRequestLoan, embedded = false, onDirtyChange, onCanSaveChange, onTitleChange, onSaveSuccess, onConfirmedClose },
  ref
) {
  const { addRecurringItem, updateRecurringItem, deleteRecurringItem } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('home-outline');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  // Only meaningful for weekly/fortnightly — a "day of month" can't express
  // a real weekly/fortnightly cadence (PRD bug report: a fortnightly bill
  // with "day of month = 10" silently behaved like a monthly one). Mirrors
  // Income's own "Next expected payday" picker for the same frequencies.
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Category-first, like the other add flows (PRD ask) — picking what kind
  // of bill this is comes before the amount/date details. Editing an
  // existing bill already has a type, so it skips straight to details.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');

  const isEditing = !!editItem;
  const usesDayOfMonth = frequency === 'monthly';

  // UX correction — full-workspace extension. Genuine-change detection,
  // relative to the values this form opened with — embedded mode only,
  // mirroring TransferForm's/AddWealthItemModal's own established
  // isDirty-gated-behind-`embedded` pattern. Standalone always reports
  // false, preserving the pre-existing (always unconditional) dismissal
  // behaviour exactly — this form has never had discard confirmation
  // standalone, and that stays true here.
  const initialSnapshot = useRef({ label: '', amount: '', frequency: 'monthly' as PayFrequency, dayOfMonth: '1', nextDueDate: null as string | null });
  const isDirty =
    embedded &&
    (label !== initialSnapshot.current.label ||
      amount !== initialSnapshot.current.amount ||
      frequency !== initialSnapshot.current.frequency ||
      dayOfMonth !== initialSnapshot.current.dayOfMonth ||
      nextDueDate !== initialSnapshot.current.nextDueDate);

  // Correction pass (Defect 2 fix) — same one-way latch as QuickAddModal.tsx
  // and AddIncomeModal.tsx: the host's global parked-draft guard must see
  // this form as dirty for as long as ANY unsaved change has ever existed
  // this session, not only while isDirty is momentarily true (internal
  // Back from 'details' to 'category' must not clear it). isDirty above is
  // already hard-false whenever !embedded, so latching it directly (rather
  // than re-gating on `embedded`) still correctly leaves standalone at its
  // existing, unconditional-dismissal behaviour. The Cancel-while-active
  // gate below (confirmDiscardIfDirty) intentionally keeps reading the raw
  // isDirty — the latch only changes what the HOST is told via
  // onDirtyChange.
  const hasBeenDirtyRef = useRef(false);
  if (isDirty) hasBeenDirtyRef.current = true;
  const reportedDirty = embedded ? hasBeenDirtyRef.current : isDirty;

  useEffect(() => {
    onDirtyChange?.(reportedDirty);
  }, [reportedDirty, onDirtyChange]);

  // First-accepted-tap-wins deferred loan handoff (Stream D, D1, corrected).
  // On iOS, runPendingLoanHandoff is passed to KeyboardSheet's onDismiss —
  // the real native Modal dismissal-complete event, no timer involved. RN
  // never calls onDismiss on Android, so handoffTimerRef below is an
  // Android-only fallback there, owned by this ref, cleared before every
  // reschedule and on unmount. visible is intentionally NOT a trigger for
  // clearing pendingLoanTypeRef — the selection must survive the visible
  // prop turning false so it can still be delivered when the real iOS
  // onDismiss (or the Android fallback) fires shortly after.
  const pendingLoanTypeRef = useRef<LiabilityType | null>(null);
  const handoffInProgressRef = useRef(false);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stream D, Option B runtime spike: KeyboardSheet's animationType for its
  // NEXT dismissal transition. Stays 'slide' for every ordinary close
  // (Cancel/backdrop/swipe/Android-Back). chooseBillType's loan branch
  // below flips it to 'none' and calls onClose() synchronously in the same
  // handler, so React batches both into the same commit — the native Modal
  // (owned by KeyboardSheet) receives animationType='none' and visible=
  // false together, making that one dismissal instant instead of animated.
  // Must NOT be reset merely because `visible` became false — see
  // runPendingLoanHandoff() and the fresh-open effect below for the only
  // two places it resets.
  const [dismissAnimationType, setDismissAnimationType] = useState<'slide' | 'none'>('slide');

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    };
  }, []);

  // Invoked once either the real iOS onDismiss fires or the Android
  // fallback timer elapses. Fires on EVERY dismissal (backdrop/swipe/
  // Cancel/back included, since KeyboardSheet's onDismiss is unconditional
  // once wired), so an ordinary dismissal with nothing pending is always a
  // safe no-op here.
  function runPendingLoanHandoff() {
    const type = pendingLoanTypeRef.current;
    pendingLoanTypeRef.current = null;
    handoffInProgressRef.current = false;
    if (type !== null) onSelectLoan?.(type);
    // Reset only now that the pending handoff (if any) has been delivered
    // and this sheet's own native dismissal is already complete (that's
    // what triggered this function) — never merely on `visible` becoming
    // false. A no-op when nothing was pending, since dismissAnimationType
    // is already 'slide' for every ordinary dismissal.
    setDismissAnimationType('slide');
  }

  useEffect(() => {
    if (!visible) return;
    // A fresh open must never carry over a stale in-progress handoff,
    // pending loan type, or non-animated dismissal override from a
    // previous time this sheet was shown.
    handoffInProgressRef.current = false;
    pendingLoanTypeRef.current = null;
    setDismissAnimationType('slide');
    if (editItem) {
      const itemFrequency = editItem.frequency === 'irregular' ? 'monthly' : editItem.frequency;
      setIcon((editItem.icon as keyof typeof Ionicons.glyphMap) ?? 'home-outline');
      setLabel(editItem.label);
      setAmount(String(editItem.amount));
      setFrequency(itemFrequency);
      const day = dayOfMonthFrom(editItem.nextDueDate);
      setDayOfMonth(day);
      const due = itemFrequency === 'monthly' ? null : editItem.nextDueDate;
      setNextDueDate(due);
      setFormStep('details');
      initialSnapshot.current = { label: editItem.label, amount: String(editItem.amount), frequency: itemFrequency, dayOfMonth: day, nextDueDate: due };
    } else {
      setIcon('home-outline');
      setLabel('');
      setAmount('');
      setFrequency('monthly');
      setDayOfMonth('1');
      setNextDueDate(null);
      setFormStep('category');
      initialSnapshot.current = { label: '', amount: '', frequency: 'monthly', dayOfMonth: '1', nextDueDate: null };
    }
    setPickerOpen(false);
  }, [visible, editItem]);

  useEffect(() => {
    onTitleChange?.(formStep === 'category' ? "What's this bill for?" : isEditing ? 'Edit bill' : 'Add a bill');
  }, [formStep, isEditing, onTitleChange]);

  function chooseFrequency(f: PayFrequency) {
    setFrequency(f);
    // Switching frequency invalidates whatever date/day was picked under the
    // old schedule — never leave a stale value sitting behind a newly-chosen
    // frequency (same rule Income already follows).
    setDayOfMonth('1');
    setNextDueDate(null);
    setPickerOpen(false);
  }

  // Strict money-input contract (regression-protection review, B2.0B
  // recurring-money precision correction §2/§3) — same replacement as
  // AddIncomeModal.tsx: no trailing-garbage prefix parsing, no multiple
  // decimal points, no more than two typed decimal places.
  const parsedAmount = parseMoneyInput(amount);
  const amountError = amount.trim().length > 0 && !parsedAmount.valid;
  const dayValue = parseInt(dayOfMonth, 10);
  const canSave =
    label.trim().length > 0 &&
    parsedAmount.valid &&
    (usesDayOfMonth ? dayValue >= 1 && dayValue <= 31 : !!nextDueDate);

  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);

  function chooseBillType(p: (typeof BILL_PRESETS)[number]) {
    // Mortgage/car loan/personal loan need liability linking and an
    // explicit repayment date — one shared flow handles that
    // (AddWealthItemModal), so hand off instead of duplicating loan logic
    // here (PRD ask, §B4; generalized from mortgage-only, Stream C).
    if (p.handoffLoanType) {
      // Full-workspace extension — embedded: no Modal to dismiss, so no
      // defer/timer dance at all. Directly and synchronously hands off to
      // the host's own route controller.
      if (embedded) {
        onRequestLoan?.(p.handoffLoanType);
        return;
      }
      // Standalone — unchanged. First-accepted-tap-wins (Stream D, D1,
      // corrected) — a second loan-preset tap while a handoff is already
      // in progress is dropped, not queued or substituted. onSelectLoan is
      // never called in the same tick as onClose(): on iOS it's deferred
      // to KeyboardSheet's real onDismiss (wired below); only on Android —
      // where RN never calls onDismiss — is the LOAN_HANDOFF_DEFER_MS
      // fallback timer scheduled.
      if (handoffInProgressRef.current) return;
      handoffInProgressRef.current = true;
      pendingLoanTypeRef.current = p.handoffLoanType;
      // Skip the animated dismissal for an accepted handoff (Stream D,
      // Option B) — flips animationType to 'none' in the SAME synchronous
      // call as onClose(), so React 18's automatic batching lands both in
      // one commit (verified against RN's own Fabric
      // RCTModalHostViewComponentView.mm: updateProps applies
      // animationType before ensurePresentedOnlyIfNeeded checks visible,
      // within one synchronous native call per commit).
      setDismissAnimationType('none');
      onClose();
      if (Platform.OS === 'android') {
        if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = setTimeout(runPendingLoanHandoff, LOAN_HANDOFF_DEFER_MS);
      }
      return;
    }
    setIcon(p.icon);
    setLabel(p.label);
    setFormStep('details');
  }

  // UX correction — full-workspace extension. Embedded Cancel/backdrop/
  // swipe/Android Back funnel through here. 'back' never discards — the
  // embedded host preserves this draft across Back (mirroring the existing
  // Add Asset pattern), so there is nothing to confirm losing.
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(isDirty, () => onConfirmedClose?.(reason), 'Discard this bill?', 'Your new bill details will be lost.');
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

  function handleSave() {
    if (!canSave || !parsedAmount.valid) return;
    const payload = {
      type: 'expense' as const,
      label: label.trim(),
      amount: parsedAmount.amount,
      frequency,
      nextDueDate: usesDayOfMonth ? nextOccurrence(dayValue) : (nextDueDate as string),
      // Explicit, not re-derived from nextDueDate's own day-of-month — a
      // short-month first occurrence can be clamped (e.g. day 31 requested
      // in February resolves to Feb 28), and without this the anchor would
      // silently become 28 instead of the user's true selected day (31),
      // permanently losing it. resolveScheduleAnchorDay (AppStateContext.tsx,
      // unmodified) already treats an explicitly-supplied scheduleAnchorDay
      // as authoritative, so this alone is sufficient — no change needed
      // there (regression-protection review, B2.0B due-today boundary
      // correction §5 — month-end safety).
      scheduleAnchorDay: usesDayOfMonth ? dayValue : undefined,
      isFixed: true,
      active: true,
      icon,
    };
    if (editItem) {
      updateRecurringItem(editItem.id, payload);
    } else {
      addRecurringItem(payload);
    }
    // Successful Save never goes through requestClose/confirmDiscardIfDirty
    // — it must never produce a discard prompt. Embedded: hand control back
    // to the host (which closes the whole Add Anything journey exactly
    // once). Standalone: unchanged direct onClose().
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function handleDelete() {
    if (editItem) deleteRecurringItem(editItem.id);
    onClose();
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
        chipRow: { flexDirection: 'row', gap: spacing.sm },
        chip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
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
        dateHint: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
        footerButton: { flex: 1 },
        deleteButton: { alignSelf: 'center', marginTop: spacing.lg },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        amountError: { ...typography.caption, fontSize: 12, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.sm },
        categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        categoryCard: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        categoryCardEmoji: { fontSize: 26, marginBottom: spacing.xs },
        categoryCardLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        selectedTypeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        selectedTypeEmoji: { fontSize: 20 },
        selectedTypeLabel: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', flex: 1 },
        selectedTypeChange: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  const selectedPreset = BILL_PRESETS.find((p) => p.icon === icon) ?? null;

  if (formStep === 'category') {
    const categoryContent = (
      <View style={styles.categoryGrid}>
        {BILL_PRESETS.map((p) => (
          <TouchableOpacity key={p.label} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseBillType(p)}>
            <Text style={styles.categoryCardEmoji}>{p.emoji}</Text>
            <Text style={styles.categoryCardLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );

    if (embedded) return categoryContent;

    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="📅 What's this bill for?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
        onDismiss={Platform.OS === 'ios' ? runPendingLoanHandoff : undefined}
        animationType={dismissAnimationType}
      >
        {categoryContent}
      </KeyboardSheet>
    );
  }

  const content = (
    <>
      <View style={styles.selectedTypeRow}>
        <Text style={styles.selectedTypeEmoji}>{selectedPreset?.emoji ?? '📅'}</Text>
        <Text style={styles.selectedTypeLabel}>{selectedPreset?.label ?? 'Bill'}</Text>
        <TouchableOpacity onPress={() => setFormStep('category')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.selectedTypeChange}>Change</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Netflix" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />

      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} placeholder="$0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      {amountError ? (
        <Text style={styles.amountError} accessibilityLiveRegion="polite">
          Enter an amount to the nearest cent (up to 2 decimal places).
        </Text>
      ) : null}

      <Text style={styles.label}>How often</Text>
      <View style={styles.chipRow}>
        {FREQUENCIES.map((f) => {
          const active = frequency === f.value;
          return (
            <TouchableOpacity key={f.value} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => chooseFrequency(f.value)}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {usesDayOfMonth ? (
        <>
          <Text style={styles.label}>Day of month due</Text>
          <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={dayOfMonth} onChangeText={setDayOfMonth} />
        </>
      ) : (
        <>
          <Text style={styles.label}>Next due date</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.dateButtonText, !nextDueDate ? styles.dateButtonPlaceholder : null]}>
              {nextDueDate ? formatDate(nextDueDate) : 'Choose a date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dateHint}>
            {frequency === 'weekly' ? 'Repeats every 7 days from this date.' : 'Repeats every 14 days from this date.'}
          </Text>
          {pickerOpen ? (
            <DateTimePicker
              value={nextDueDate ? new Date(nextDueDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setPickerOpen(false);
                if (event.type === 'dismissed') return;
                if (date) setNextDueDate(date.toISOString());
              }}
            />
          ) : null}
        </>
      )}

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete bill</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit bill' : 'Add a bill'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      {content}
    </KeyboardSheet>
  );
});
