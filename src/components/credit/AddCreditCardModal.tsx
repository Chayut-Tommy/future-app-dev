import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { CreditCard } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { buildDebtReducedCelebration } from '../../lib/celebrations';
import { brand } from '../../lib/brand';
import { resolveExpectedMonthlyRepayment } from '../../lib/calculations/creditHealth';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';

// Strips $, commas, spaces and other non-numeric characters before parsing
// (PRD ask: handle pasted formatted currency) — scoped to the repayment
// fields rather than applied app-wide, since the other numeric inputs in
// this form share a pre-existing, unrelated raw-parseFloat pattern not in
// scope here. Rejects negative/non-finite values outright — neither
// repayment field represents a refund or reversal.
function parseRepaymentAmount(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export type { EmbeddedCloseReason as AddCreditCardCloseReason };
export type AddCreditCardModalHandle = EmbeddedStepHandle;

export const AddCreditCardModal = forwardRef<
  AddCreditCardModalHandle,
  {
    visible: boolean;
    onClose: () => void;
    /** Present = editing this existing card instead of creating a new one. */
    editCard?: CreditCard | null;
    /** True only when rendered inside the embedded Add Anything -> Credit
     * Card route — activates real dirty-detection and a "Discard this
     * card?" confirmation on Cancel/backdrop/swipe/Android Back, and
     * returns bare content instead of owning its own KeyboardSheet.
     * Omitted (the default) preserves this modal's original, unconditional-
     * close standalone behaviour exactly (no discard confirmation existed
     * before this — see the file-level note above), so standalone
     * Money -> Add credit card UX is never silently changed by embedding. */
    embedded?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
    onCanSaveChange?: (canSave: boolean) => void;
    onTitleChange?: (title: string) => void;
    onSaveSuccess?: () => void;
    onConfirmedClose?: (reason: EmbeddedCloseReason) => void;
  }
>(function AddCreditCardModal({ visible, onClose, editCard, embedded = false, onDirtyChange, onCanSaveChange, onTitleChange, onSaveSuccess, onConfirmedClose }, ref) {
  const { addCreditCard, updateCreditCard, deleteCreditCard } = useAppState();
  const { celebrate } = useCelebration();
  const { colors, radius, spacing, typography } = useTheme();
  const [issuer, setIssuer] = useState('');
  const [limit, setLimit] = useState('');
  const [balance, setBalance] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [expectedRepayment, setExpectedRepayment] = useState('');
  const [minRequiredPayment, setMinRequiredPayment] = useState('');
  const [apr, setApr] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = !!editCard;

  // UX correction — full-workspace extension. Genuine-change detection,
  // relative to the values this form opened with — embedded mode only,
  // mirroring TransferForm's/AddWealthItemModal's own established
  // isDirty-gated-behind-`embedded` pattern exactly, so standalone
  // behaviour (no snapshot taken, isDirty always false) is byte-identical
  // to before this correction.
  const initialSnapshot = useRef({ issuer: '', limit: '', balance: '', dueDay: '', expectedRepayment: '', minRequiredPayment: '', apr: '' });
  // Synchronous double-submission guard, alongside the existing `saving`
  // state guard below (kept as-is — it already correctly blocks a second
  // Save while the first is in flight; this ref additionally protects the
  // imperative requestSave() entry point the embedded host calls, the same
  // belt-and-braces pattern AddWealthItemModal's submittingRef uses).
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    if (editCard) {
      setIssuer(editCard.issuer);
      setLimit(String(editCard.creditLimit));
      setBalance(String(editCard.currentBalance));
      setDueDay(String(editCard.dueDay));
      // Legacy compatibility bridge, not an equivalence (PRD ask, §3): pre-
      // fills from whichever the resolver finds — the new field if already
      // set, otherwise the legacy minimumPayment value — so an existing
      // user's prior figure is visible and editable here rather than
      // appearing to have reset to blank, and What Happens Next doesn't
      // silently lose a commitment the user already told Navilo about. This
      // does NOT claim the legacy minimum IS the user's normal repayment —
      // it's shown for the user to confirm or correct, and every save from
      // this point writes their explicit answer to expectedMonthlyRepayment.
      const resolved = resolveExpectedMonthlyRepayment(editCard);
      setExpectedRepayment(resolved > 0 ? String(resolved) : '');
      // The true contractual minimum — its own field, shown and edited
      // independently of the above (PRD ask, §2: the two concepts must stay
      // separate, never merged into one input).
      setMinRequiredPayment(editCard.minimumPayment > 0 ? String(editCard.minimumPayment) : '');
      setApr(editCard.apr ? String(Math.round(editCard.apr * 10000) / 100) : '');
      const resolvedRepayment = resolved > 0 ? String(resolved) : '';
      const resolvedMin = editCard.minimumPayment > 0 ? String(editCard.minimumPayment) : '';
      const resolvedApr = editCard.apr ? String(Math.round(editCard.apr * 10000) / 100) : '';
      initialSnapshot.current = {
        issuer: editCard.issuer,
        limit: String(editCard.creditLimit),
        balance: String(editCard.currentBalance),
        dueDay: String(editCard.dueDay),
        expectedRepayment: resolvedRepayment,
        minRequiredPayment: resolvedMin,
        apr: resolvedApr,
      };
    } else {
      setIssuer('');
      setLimit('');
      setBalance('');
      setDueDay('');
      setExpectedRepayment('');
      setMinRequiredPayment('');
      setApr('');
      initialSnapshot.current = { issuer: '', limit: '', balance: '', dueDay: '', expectedRepayment: '', minRequiredPayment: '', apr: '' };
    }
    setSaving(false);
  }, [visible, editCard]);

  useEffect(() => {
    onTitleChange?.(isEditing ? 'Edit credit card' : 'Add credit card');
  }, [isEditing, onTitleChange]);

  const creditLimit = parseFloat(limit);
  const due = parseInt(dueDay, 10);
  const aprValue = parseFloat(apr);
  const canSave = issuer.trim().length > 0 && !isNaN(creditLimit) && !isNaN(due) && due >= 1 && due <= 31;

  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);

  // Embedded-only genuine-change detection — see initialSnapshot's own
  // declaration comment. Standalone (embedded=false) always reports false,
  // preserving the original unconditional-close Cancel/dismiss behaviour.
  const isDirty =
    embedded &&
    (issuer !== initialSnapshot.current.issuer ||
      limit !== initialSnapshot.current.limit ||
      balance !== initialSnapshot.current.balance ||
      dueDay !== initialSnapshot.current.dueDay ||
      expectedRepayment !== initialSnapshot.current.expectedRepayment ||
      minRequiredPayment !== initialSnapshot.current.minRequiredPayment ||
      apr !== initialSnapshot.current.apr);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function handleSave() {
    // Guards against a fast double-tap creating two identical cards before
    // the sheet has a chance to close (PRD bug report, §10: "duplicate
    // credit cards").
    if (!canSave || saving || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    const payload = {
      issuer: issuer.trim(),
      label: issuer.trim(),
      creditLimit,
      currentBalance: parseFloat(balance) || 0,
      dueDay: due,
      // Two separate, independently-entered figures (PRD ask, §2) — neither
      // is derived from or overwrites the other. minimumPayment is the true
      // contractual minimum (feeds reminders.ts's minimum-payment warning
      // and computeCardPayoffInsight); expectedMonthlyRepayment is the
      // user's own planned amount (feeds What Happens Next, Available
      // Until Payday's in-cycle commitment, Typical Money Flow/Allocation).
      minimumPayment: parseRepaymentAmount(minRequiredPayment),
      expectedMonthlyRepayment: parseRepaymentAmount(expectedRepayment),
      apr: !isNaN(aprValue) && aprValue > 0 ? aprValue / 100 : undefined,
    };
    if (editCard) {
      updateCreditCard(editCard.id, payload);
      if (payload.currentBalance < editCard.currentBalance) celebrate(buildDebtReducedCelebration());
    } else {
      addCreditCard(payload);
    }
    // Successful Save never goes through requestClose/confirmDiscardIfDirty
    // — it must never produce a discard prompt. Embedded: hand control back
    // to the host (which closes the whole Add Anything journey exactly
    // once). Standalone: unchanged direct onClose().
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function handleDelete() {
    if (editCard) deleteCreditCard(editCard.id);
    onClose();
  }

  // Cancel/backdrop/swipe/Android Back (embedded, via the host's own
  // KeyboardSheet chrome) funnel through here when embedded. Standalone
  // callers never invoke this — their own footer Cancel button still calls
  // onClose directly, byte-identical to before this correction. 'back'
  // never discards — the embedded host preserves this draft (the card
  // stays mounted, exactly like the existing Add Asset pattern) whenever
  // the user returns to the chooser, so there is nothing to confirm losing.
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(isDirty, () => onConfirmedClose?.(reason), 'Discard this card?', 'Your credit card details will be lost.');
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

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

  const content = (
    <>
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

      <Text style={styles.label}>Due day of month</Text>
      <TextInput style={styles.input} placeholder="25" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={dueDay} onChangeText={setDueDay} />

      <Text style={styles.label}>Expected monthly repayment</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={expectedRepayment}
        onChangeText={setExpectedRepayment}
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm }]}>How much do you normally expect to repay each month?</Text>
      <Text style={[styles.benefitLine, { marginBottom: spacing.sm }]}>This amount will appear as an upcoming cash outflow in What Happens Next.</Text>

      <Text style={styles.label}>Minimum required payment (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={minRequiredPayment}
        onChangeText={setMinRequiredPayment}
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm, marginBottom: spacing.sm }]}>
        The minimum amount shown on your statement — used only for minimum-payment interest warnings and payoff comparisons, separate
        from what you expect to actually repay.
      </Text>

      <Text style={styles.label}>Interest rate / APR % (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 19.99"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={apr}
        onChangeText={setApr}
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
      onClose={onClose}
      isDirty={isDirty}
      title={isEditing ? 'Edit credit card' : 'Add credit card'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave || saving} style={styles.footerButton} />
        </>
      }
    >
      {content}
    </KeyboardSheet>
  );
});
