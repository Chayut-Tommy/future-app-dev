import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { CreditCard } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { TextField } from '../shared/fields/TextField';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { DayOfMonthField } from '../shared/fields/DayOfMonthField';
import { Button } from '../shared/Button';
import { buildDebtReducedCelebration, buildSaveConfirmation } from '../../lib/celebrations';
import { brand } from '../../lib/brand';
import { CARD_DETAILS_PANEL, PURCHASE_RATE_FIELD, purchaseRateBlankHelper } from '../../lib/creditCardPresentation';
import { ASSUMED_CREDIT_CARD_APR } from '../../lib/calculations/creditHealth';
import { resolveExpectedMonthlyRepayment } from '../../lib/calculations/creditHealth';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';
import { EditorCompletionStatus } from '../shared/EditorCompletionStatus';
import { useDurableEditorCompletion } from '../../hooks/useDurableEditorCompletion';
import { EDITOR_DELETING_LABEL, EDITOR_SAVING_LABEL, EditorOutcome } from '../../lib/editorCompletion';
import { generateId } from '../../lib/id';
import { useLatchedWhileHidden } from '../../hooks/useLatchedWhileHidden';

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
    /** Pass D0 — the structured, durable completion (see lib/editorCompletion). */
    onOutcome?: (outcome: EditorOutcome) => void;
  }
>(function AddCreditCardModal({ visible, onClose, editCard: editCardProp, embedded = false, onDirtyChange, onCanSaveChange, onTitleChange, onSaveSuccess, onConfirmedClose, onOutcome }, ref) {
  // Pass D0.1 — keep showing what was presented until native dismissal finishes (never the Add form mid-close).
  const editCard = useLatchedWhileHidden(visible, editCardProp);
  const { addCreditCard, updateCreditCard, deleteCreditCard } = useAppState();
  const completion = useDurableEditorCompletion({ visible, onOutcome });
  const draftIdRef = useRef<string>(generateId());
  const { celebrate, confirmSaveSuccess } = useCelebration();
  const { colors, radius, spacing, typography, semantic } = useTheme();
  const [issuer, setIssuer] = useState('');
  const [limit, setLimit] = useState('');
  const [balance, setBalance] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [expectedRepayment, setExpectedRepayment] = useState('');
  const [minRequiredPayment, setMinRequiredPayment] = useState('');
  const [apr, setApr] = useState('');
  // Pass D0 — pending, double-submission and failure state now live in the ONE
  // shared lifecycle (useDurableEditorCompletion), which also resets its guard on
  // every new presentation — the Pass 2B lesson (a guard that is never reset
  // leaves Save silently inert) is preserved there for all four editors.

  const isEditing = !!editCard;

  // UX correction — full-workspace extension. Genuine-change detection,
  // relative to the values this form opened with — embedded mode only,
  // mirroring TransferForm's/AddWealthItemModal's own established
  // isDirty-gated-behind-`embedded` pattern exactly, so standalone
  // behaviour (no snapshot taken, isDirty always false) is byte-identical
  // to before this correction.
  const initialSnapshot = useRef({ issuer: '', limit: '', balance: '', dueDay: '', expectedRepayment: '', minRequiredPayment: '', apr: '' });

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
    draftIdRef.current = generateId(); // a new presentation is a new draft
  }, [visible, editCard]);

  useEffect(() => {
    onTitleChange?.(isEditing ? 'Edit credit card' : 'Add credit card');
  }, [isEditing, onTitleChange]);

  const creditLimit = parseFloat(limit);
  const due = parseInt(dueDay, 10);
  const aprValue = parseFloat(apr);
  const canSave = issuer.trim().length > 0 && !isNaN(creditLimit) && !isNaN(due) && due >= 1 && due <= 31;

  useEffect(() => {
    onCanSaveChange?.(canSave && !completion.isPending);
  }, [canSave, onCanSaveChange, completion.isPending]);

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
    if (!canSave || completion.isPendingRef.current) return;
    const payload = {
      issuer: issuer.trim(),
      label: issuer.trim(),
      creditLimit,
      currentBalance: parseFloat(balance) || 0,
      dueDay: due,
      minimumPayment: parseRepaymentAmount(minRequiredPayment),
      expectedMonthlyRepayment: parseRepaymentAmount(expectedRepayment),
      apr: !isNaN(aprValue) && aprValue > 0 ? aprValue / 100 : undefined,
    };
    // Pass D0 — durable. The confirmation, the celebration, the structured
    // `saved` outcome and the close ALL wait for the stored write; a rejected
    // write shows none of them and leaves the draft on screen for a retry. One
    // identity per draft means a retried Add can only ever create one card.
    // Successful Save never goes through requestClose/confirmDiscardIfDirty.
    const id = editCard ? editCard.id : draftIdRef.current;
    void completion.run(
      'saving',
      () => (editCard ? updateCreditCard(editCard.id, payload) : addCreditCard({ ...payload, id })),
      { outcome: 'saved', operation: editCard ? 'update' : 'add', entity: 'credit_card', id },
      () => {
        if (!embedded) confirmSaveSuccess(buildSaveConfirmation('Credit card', editCard ? 'updated' : 'added'));
        if (editCard && payload.currentBalance < editCard.currentBalance) celebrate(buildDebtReducedCelebration());
        if (embedded) onSaveSuccess?.();
        else onClose();
      }
    );
  }

  function handleDelete() {
    if (!editCard) return;
    void completion.run('deleting', () => deleteCreditCard(editCard.id), { outcome: 'deleted', operation: 'delete', entity: 'credit_card', id: editCard.id }, onClose);
  }

  // Cancel / Back / swipe / backdrop: zero writes, one `dismissed` outcome — and
  // refused while a durable write is unresolved.
  function handleDismiss() {
    completion.dismiss(onClose);
  }

  // Cancel/backdrop/swipe/Android Back (embedded, via the host's own
  // KeyboardSheet chrome) funnel through here when embedded. Standalone
  // callers never invoke this — their own footer Cancel button still calls
  // onClose directly, byte-identical to before this correction. 'back'
  // never discards — the embedded host preserves this draft (the card
  // stays mounted, exactly like the existing Add Asset pattern) whenever
  // the user returns to the chooser, so there is nothing to confirm losing.
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (completion.isPendingRef.current) return; // never an ambiguous dismissal mid-write
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
        row: {
          flexDirection: 'row',
          gap: spacing.md,
        },
        half: {
          flex: 1,
        },
        /* Wave 7 correction D — Save is an INTERACTIVE action, not a
           completed positive outcome. `Button`'s own `primary` variant uses
           `colors.accent`, which is green in every theme. Scoped to this one
           control; the global primitive is untouched. */
        saveAction: { backgroundColor: semantic.interactive },
        footerButton: {
          flex: 1,
        },
        deleteButton: { alignSelf: 'center', marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        benefitBox: { backgroundColor: colors.marketSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        benefitTitle: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.xs },
        benefitLine: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
        // Pass 2B correction — same helperBox/helperText pattern
        // AddWealthItemModal uses for its own saveErrorMessage.
        helperBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        helperText: { ...typography.caption, fontSize: 12, color: colors.danger, lineHeight: 17 },
      }),
    [colors, radius, spacing, typography]
  );

  const content = (
    <>
      <EditorCompletionStatus pending={completion.pending} errorText={completion.errorText} testID="card-editor-status" />

      {/* Wave 9a closure, Correction A — the checkmarked benefit panel
          ("Reduce interest / Improve credit utilisation / Create a payoff
          plan / Avoid missed payments") promised outcomes a manual-recording
          app cannot deliver, and implied Nolie acts on the card. Replaced by
          one factual description of what recording the card actually does.
          The copy lives in lib/creditCardPresentation.ts so it cannot drift
          from the Cards empty state, which carried the same promises. */}
      {!isEditing ? (
        <View style={styles.benefitBox}>
          <Text style={styles.benefitTitle}>{CARD_DETAILS_PANEL.title}</Text>
          <Text style={styles.benefitLine}>{CARD_DETAILS_PANEL.body}</Text>
        </View>
      ) : null}

      <TextField label="Issuer / name" required placeholder="e.g. AMEX Platinum" value={issuer} onChangeText={setIssuer} />

      <View style={styles.row}>
        <View style={styles.half}>
          {/* A credit limit and a balance are both genuine money amounts, so
              both accept a zero — `allowZero` mirrors that and changes
              nothing about what Save accepts: this form's own validation is
              untouched. */}
          <CurrencyField label="Credit limit" allowZero placeholder="$10,000" value={limit} onChangeText={setLimit} />
        </View>
        <View style={styles.half}>
          <CurrencyField label="Current balance" allowZero placeholder="$0" value={balance} onChangeText={setBalance} />
        </View>
      </View>

      {/* Wave 4 closure — a recurring anchor, not a date, and no longer a
          bare number pad. Same focused picker shell as every other Add date
          field. `dueDay` stays the same string the validator reads. */}
      <DayOfMonthField
        label="Due day of month"
        value={dueDay.trim() === '' ? null : parseInt(dueDay, 10)}
        onChange={(day) => setDueDay(String(day))}
        testID="card-due-day"
      />

      <CurrencyField
        label="Expected monthly repayment"
        allowZero
        placeholder="$0"
        value={expectedRepayment}
        onChangeText={setExpectedRepayment}
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm }]}>How much do you normally expect to repay each month?</Text>
      <Text style={[styles.benefitLine, { marginBottom: spacing.sm }]}>This amount will appear as an upcoming cash outflow in What Happens Next.</Text>

      <CurrencyField
        label="Minimum required payment (optional)"
        allowZero
        placeholder="$0"
        value={minRequiredPayment}
        onChangeText={setMinRequiredPayment}
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm, marginBottom: spacing.sm }]}>
        The minimum amount shown on your statement — used only for minimum-payment interest warnings and payoff comparisons, separate
        from what you expect to actually repay.
      </Text>

      {/* A rate, NOT a money amount — deliberately a TextField, so the
          strict money grammar is never applied to a percentage. */}
      {/* Wave 9a closure, Correction C — this single stored field
          (`CreditCard.apr`) drives the purchase-balance interest
          illustration only; it models no cash-advance, promotional or wider
          contract rate, so it is named for what it actually feeds. The
          assumed-rate figure is read from the engine constant rather than
          written out again. */}
      <TextField
        label={PURCHASE_RATE_FIELD.label}
        placeholder="e.g. 19.99"
        keyboardType="decimal-pad"
        value={apr}
        onChangeText={setApr}
      />
      <Text style={[styles.benefitLine, { marginTop: -spacing.sm, marginBottom: spacing.sm }]}>
        {apr.trim().length > 0 ? PURCHASE_RATE_FIELD.helper : purchaseRateBlankHelper(ASSUMED_CREDIT_CARD_APR)}
      </Text>

      {isEditing ? (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={completion.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: completion.isPending, busy: completion.pending === 'deleting' }}
          testID="card-editor-delete"
        >
          <Text style={styles.deleteText}>{completion.pending === 'deleting' ? EDITOR_DELETING_LABEL : 'Delete card'}</Text>
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
      onClose={handleDismiss}
      isDirty={isDirty}
      title={isEditing ? 'Edit credit card' : 'Add credit card'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={handleDismiss} disabled={completion.isPending} style={styles.footerButton} />
          <Button
            label={completion.pending === 'saving' ? EDITOR_SAVING_LABEL : 'Save'}
            onPress={handleSave}
            disabled={!canSave || completion.isPending}
            loading={completion.pending === 'saving'}
            style={{ ...styles.footerButton, ...styles.saveAction }}
            testID="card-editor-save"
          />
        </>
      }
    >
      {content}
    </KeyboardSheet>
  );
});
