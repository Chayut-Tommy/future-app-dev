import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  isLatestBnplRepaymentTransaction,
  isLatestLoanRepaymentTransaction,
  isLatestRecurringOccurrenceTransaction,
  useAppState,
} from '../../state/AppStateContext';
import { AppData, Asset, BalanceEffectMode, PaymentSource, Transaction } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { categoryEmoji } from '../../lib/categoryEmoji';
import { brand } from '../../lib/brand';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';

const DATE_PRESETS = [
  { label: 'Today', daysAgo: 0 },
  { label: 'Yesterday', daysAgo: 1 },
  { label: '2 days ago', daysAgo: 2 },
  { label: 'Last week', daysAgo: 7 },
];

// "Loan-funded purchase" (not "Loan / debt") — this option records a
// purchase made using borrowed money, which increases the selected loan's
// balance. It is not a repayment concept and never decreases a liability
// (regression-protection review, Stream B1 §6).
const PAYMENT_SOURCES: { value: PaymentSource; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'everyday', label: 'Everyday account' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'loan', label: 'Loan-funded purchase' },
  { value: 'other', label: 'Other' },
];

function dateParts(date: Date): { day: string; month: string; year: string } {
  return { day: String(date.getDate()), month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
}

// Everyday Account expense routing — same-name accounts must stay
// distinguishable (they're already distinguished internally by id; this
// makes that visible to the customer, since two identical labels would
// otherwise be indistinguishable chips).
function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Deletion-confirmation reversal target — 2026-08-09 correction. Identifies
// the REAL account/card a transaction's stored effect would reverse, or
// null when there is nothing to reverse (Record only, or a floored effect
// that truly moved $0 — see AppStateContext's floor-then-reverse
// correction). Never derives this from the transaction's CURRENT
// paymentSource/creditCardId fields — those can diverge from what was
// actually applied (the same invariant applyTransactionUpdate/Delete
// already follow: "a reversal must always negate the last balance delta
// Navilo actually applied"). Legacy transactions (balanceEffect undefined,
// no appliedBalanceEffect ever captured) fall back to the exact same
// target-resolution rule legacyApplyTransactionEffect uses internally, so
// old transaction history keeps offering a meaningful reversal choice.
function describeReversalTarget(data: AppData, t: Transaction): { label: string; amount: number } | null {
  if (t.balanceEffect === undefined) {
    if (t.type === 'income') {
      const cash = data.assets.find((a) => a.type === 'cash');
      return cash ? { label: cash.label, amount: t.amount } : null;
    }
    const source = t.paymentSource ?? 'cash';
    if (source === 'cash') {
      const cash = data.assets.find((a) => a.type === 'cash');
      return cash ? { label: cash.label, amount: t.amount } : null;
    }
    if (source === 'credit_card' && t.creditCardId) {
      const card = data.creditCards.find((c) => c.id === t.creditCardId);
      return card ? { label: card.label, amount: t.amount } : null;
    }
    if (source === 'loan' && t.liabilityId) {
      const liability = data.liabilities.find((l) => l.id === t.liabilityId);
      return liability ? { label: liability.label, amount: t.amount } : null;
    }
    return null;
  }

  const effect = t.appliedBalanceEffect;
  if (!effect) return null;
  const amount = Math.abs(effect.delta);
  if (amount === 0) return null;
  if (effect.targetKind === 'asset') {
    const asset = data.assets.find((a) => a.id === effect.targetId);
    return asset ? { label: asset.label, amount } : null;
  }
  if (effect.targetKind === 'credit_card') {
    const card = data.creditCards.find((c) => c.id === effect.targetId);
    return card ? { label: card.label, amount } : null;
  }
  if (effect.targetKind === 'liability') {
    const liability = data.liabilities.find((l) => l.id === effect.targetId);
    return liability ? { label: liability.label, amount } : null;
  }
  return null;
}

// Correction pass, 2026-08-09 — identifies a BNPL repayment transaction by
// tracing its linked recurring item to a liability of type 'bnpl', exactly
// mirroring the same predicate reverseBnplRepaymentTransaction itself uses
// internally. `recurringItemId`/`recurringOccurrenceKey` alone are NOT
// sufficient — every confirmed recurring bill/income transaction carries
// them too, so a bare presence check would misclassify an ordinary
// recurring bill payment as a BNPL repayment.
function isBnplRepaymentTransaction(data: AppData, t: Transaction): boolean {
  if (!t.recurringItemId || !t.recurringOccurrenceKey) return false;
  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item || !item.linkedLiabilityId) return false;
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  return liability?.type === 'bnpl';
}

// Final Pass 2D device-test correction — the mortgage/personal-loan/
// car-loan sibling of isBnplRepaymentTransaction, same predicate shape,
// disambiguated by the linked liability's own type (never a separate flag
// on the transaction — recurringOccurrenceKey's format is shared by both).
const LOAN_REPAYMENT_LIABILITY_TYPES = ['mortgage', 'car_loan', 'personal_loan', 'other'];
function isLoanRepaymentTransaction(data: AppData, t: Transaction): boolean {
  if (!t.recurringItemId || !t.recurringOccurrenceKey) return false;
  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item || !item.linkedLiabilityId) return false;
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  return !!liability && LOAN_REPAYMENT_LIABILITY_TYPES.includes(liability.type);
}

// Final Pass 2D device-test correction — a confirmed credit-card repayment
// (isRepayment + creditCardId) never goes through the generic single-target
// describeReversalTarget/deleteTransaction path either, for the exact same
// reason a BNPL repayment doesn't: that path only reverses the transaction's
// own appliedBalanceEffect (the funding side), never the second, card-side
// effect confirmCreditCardRepaymentTransition also applied — silently
// leaving the card's balance under-stated by the repayment amount forever.
// No "latest only" restriction (mirrors reverseCreditCardRepaymentTransaction's
// own contract): each credit-card repayment is an independent event.
function isCreditCardRepaymentTransaction(t: Transaction): boolean {
  return !!t.isRepayment && !!t.creditCardId;
}

// 2D-NARROW correction — an ordinary occurrence-tracked bill transaction:
// recurringOccurrenceKey is stamped (so its Reminder occurrence can be
// restored on reversal), but it is deliberately NOT BNPL or a mortgage/
// personal-loan/car-loan repayment — both of those always have a linked
// liability and are always caught by the two predicates above first. This
// only matches ordinary confirmed bills, which never do.
function isOrdinaryOccurrenceBillTransaction(data: AppData, t: Transaction): boolean {
  if (!t.recurringItemId || !t.recurringOccurrenceKey) return false;
  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  return !!item && !item.linkedLiabilityId;
}

// The base chip text before any disambiguation suffix — label, optional
// provider, and balance. Two accounts only ever produce the identical
// string here when their name, provider (including both blank), AND
// balance all match.
function everydayChipBaseText(a: Asset): string {
  return `${a.label}${a.provider ? ` · ${a.provider}` : ''} (${formatMoney(a.currentValue)})`;
}

// Same-name disambiguation — provider alone doesn't guarantee uniqueness
// (it's optional and can be blank on both accounts, PRD ask §3). Only
// accounts whose full chip text collides get a minimal, accessible suffix
// ("Account 1"/"Account 2", stable by array order) — a unique-looking
// account is never touched. Keyed by stable account id, never a technical
// id string exposed to the customer. Real routing always stays by `id`
// (the map key here, and everydayAccountId elsewhere) — this only affects
// what's displayed and announced, never which account gets debited.
function disambiguateEverydayAccountLabels(accounts: Asset[]): Map<string, string> {
  const counts = new Map<string, number>();
  accounts.forEach((a) => {
    const key = everydayChipBaseText(a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  accounts.forEach((a) => {
    const key = everydayChipBaseText(a);
    if ((counts.get(key) ?? 0) <= 1) {
      labels.set(a.id, key);
      return;
    }
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    labels.set(a.id, `${key} — Account ${n}`);
  });
  return labels;
}

export type QuickAddModalHandle = EmbeddedStepHandle;

export const QuickAddModal = forwardRef<
  QuickAddModalHandle,
  {
    visible: boolean;
    onClose: () => void;
    /** Present = editing this existing transaction instead of creating a new one. */
    editTransaction?: Transaction | null;
    /** Opens straight into this segment — used for "Record income received"
     * (PRD ask, §2), a one-off/ad-hoc amount that only ever updates cash via
     * a normal income Transaction, and never touches user.monthlyIncome or
     * payFrequency the way "Add income source" does. Also used to pick
     * which embedded route (expense/incomeReceived) this instance renders. */
    initialType?: 'income' | 'expense';
    /** True only when rendered inside the embedded Add Anything -> Expense
     * or -> Income received route — activates real dirty-detection and a
     * "Discard changes?" confirmation, and reroutes both internal steps
     * (category/details) into plain content returned to the host instead of
     * each wrapping its own KeyboardSheet. The nested "Add cash balance
     * first" AddWealthItemModal below stays a genuine standalone overlay
     * either way (same as this form's own DatePickerModal-style secondary
     * sheets elsewhere) — it is never itself embedded, so it is unaffected
     * by this prop. */
    embedded?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
    onCanSaveChange?: (canSave: boolean) => void;
    onTitleChange?: (title: string) => void;
    onSaveSuccess?: () => void;
    onConfirmedClose?: (reason: EmbeddedCloseReason) => void;
  }
>(function QuickAddModal(
  { visible, onClose, editTransaction, initialType, embedded = false, onDirtyChange, onCanSaveChange, onTitleChange, onSaveSuccess, onConfirmedClose },
  ref
) {
  const {
    data,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    reverseBnplRepayment,
    reverseCreditCardRepayment,
    reverseLoanRepayment,
    reverseRecurringOccurrence,
  } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [creditCardId, setCreditCardId] = useState<string | null>(null);
  const [liabilityId, setLiabilityId] = useState<string | null>(null);
  // Everyday Account expense routing (2026-08-08) — mirrors creditCardId/
  // liabilityId exactly: the specific account this expense is paid from,
  // by stable id (never by label, so two identically-named accounts stay
  // distinguishable).
  const [everydayAccountId, setEverydayAccountId] = useState<string | null>(null);
  // The user's explicit choice, independent of paymentSource (regression-
  // protection review, Stream B1 UI integration) — expense-only; income
  // stays implicitly 'update' this pass (record-only income is out of
  // scope). Synced from the edited transaction, or defaulted, below.
  const [balanceEffect, setBalanceEffect] = useState<BalanceEffectMode>('update');
  // Round 6 correction — the manual transaction's own primary name, reusing
  // the existing Transaction.note field rather than adding a new one (it
  // already has a display-fallback consumer in TransactionsScreen and is
  // already read, just never written for a manually-entered transaction).
  // Blank for a brand-new transaction and for editing a transaction that
  // never had one (legacy data remains valid, never forced to backfill a
  // name); pre-filled from the existing note when editing a transaction
  // that already has one, so it can't be silently blanked out.
  const [transactionName, setTransactionName] = useState('');
  const [addCashVisible, setAddCashVisible] = useState(false);
  // Category-first flow (PRD ask: "adding money should feel quick and
  // satisfying, not like accounting software") — picking a category is its
  // own step with large tappable cards, then amount/date/payment source.
  // Editing an existing transaction already has a category, so it skips
  // straight to the details step.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');
  const initialSnapshot = useRef({ amount: '', categoryId: null as string | null });
  // Round 6 correction — a synchronous rapid-submit guard was not actually
  // present here before this pass despite being assumed to exist; adopts
  // the exact same ref-guard pattern already established and reviewed in
  // AddWealthItemModal.tsx (a ref, not state, so a second Save tap landing
  // in the same tick is blocked before it can call addTransaction/
  // updateTransaction a second time). Reset only when a genuinely new form
  // session begins, mirroring that same convention.
  const submittingRef = useRef(false);

  const isEditing = !!editTransaction;
  const hasCashAsset = data.assets.some((a) => a.type === 'cash');
  const nonCreditLiabilities = data.liabilities.filter((l) => l.type !== 'credit_card');
  // Everyday Account expense routing — the 'everyday' Paid-from tile is
  // only ever OFFERED (per the accepted spec) when at least one account
  // exists, OR when the session already has 'everyday' selected (editing
  // a legacy transaction whose account was later deleted must still show
  // its own selection rather than silently vanishing from the row).
  const everydayAccounts = data.assets.filter((a) => a.type === 'everyday');
  const everydayAccountLabels = disambiguateEverydayAccountLabels(everydayAccounts);
  const paymentSourceOptions = PAYMENT_SOURCES.filter((s) => s.value !== 'everyday' || everydayAccounts.length > 0 || paymentSource === 'everyday');
  const selectedEverydayAccount = everydayAccountId ? everydayAccounts.find((a) => a.id === everydayAccountId) ?? null : null;
  // The amount already charged to THIS SAME account by the transaction
  // being edited (0 for a new transaction, or if editing a different
  // source/account) — added back before the insufficient-funds check,
  // mirroring exactly what applyTransactionUpdate's reverse-then-reapply
  // will actually do, so this pre-Save check can never be stricter or
  // looser than the real engine behaviour.
  const editedTransactionPriorAmountOnSameAccount =
    editTransaction && editTransaction.paymentSource === 'everyday' && editTransaction.targetAssetId === everydayAccountId
      ? editTransaction.amount
      : 0;
  const everydayAvailableBalance = selectedEverydayAccount ? selectedEverydayAccount.currentValue + editedTransactionPriorAmountOnSameAccount : null;
  const isDirty = amount !== initialSnapshot.current.amount || categoryId !== initialSnapshot.current.categoryId;

  // Correction pass (Defect 2 fix) — while embedded, the host's global
  // parked-draft guard must see this form as dirty for as long as ANY
  // unsaved change has ever existed this session, not only while `isDirty`
  // is momentarily true. A plain live-recomputed boolean is correct in
  // principle, but the host also reads it while this form's OWN layer is
  // hidden behind the chooser mid-transition/animation — a one-way latch
  // is what actually guarantees the aggregate draft can never be
  // misreported as clean by a stale/mid-transition read, regardless of
  // internal step (`formStep`), route animation, or hidden-layer status.
  // Clears only via a fresh mount (a new `instanceKey` from the host's own
  // resetDraft) or this whole journey closing on save — both already
  // unmount this component, which destroys the ref along with everything
  // else, so no explicit clearing logic is needed here. The STANDALONE
  // <KeyboardSheet isDirty={isDirty}> usage below is intentionally left on
  // the raw, live value — the latch is an embedded-only correction.
  const hasBeenDirtyRef = useRef(false);
  if (embedded && isDirty) hasBeenDirtyRef.current = true;
  const reportedDirty = embedded ? hasBeenDirtyRef.current : isDirty;

  useEffect(() => {
    onDirtyChange?.(reportedDirty);
  }, [reportedDirty, onDirtyChange]);

  useEffect(() => {
    onTitleChange?.(formStep === 'category' ? "What's this for?" : isEditing ? 'Edit transaction' : 'Add transaction');
  }, [formStep, isEditing, onTitleChange]);

  // Whether a real, addressable balance exists for the currently-selected
  // funding source — 'other' never has one; 'cash'/'credit_card'/'loan' only
  // have one once their respective target (Cash asset / selected card /
  // selected liability) actually exists (regression-protection review,
  // Stream B1 UI integration §3: never silently offer or apply "update" with
  // no real target).
  const hasValidBalanceTarget =
    paymentSource === 'cash'
      ? hasCashAsset
      : paymentSource === 'credit_card'
      ? !!creditCardId
      : paymentSource === 'loan'
      ? !!liabilityId
      : paymentSource === 'everyday'
      ? !!selectedEverydayAccount
      : false;
  // The customer-facing name of whatever hasValidBalanceTarget resolved to
  // — 2026-08-09 correction, so the "Record only" hint can name the actual
  // selected card/account ("...without changing your AMEX balance.")
  // instead of only ever using generic wording.
  const trackedBalanceTargetLabel = !hasValidBalanceTarget
    ? undefined
    : paymentSource === 'cash'
    ? 'Cash'
    : paymentSource === 'credit_card'
    ? data.creditCards.find((c) => c.id === creditCardId)?.label
    : paymentSource === 'loan'
    ? nonCreditLiabilities.find((l) => l.id === liabilityId)?.label
    : paymentSource === 'everyday'
    ? selectedEverydayAccount?.label
    : undefined;
  const prevHasValidBalanceTarget = useRef(hasValidBalanceTarget);

  useEffect(() => {
    if (!visible) return;
    // A genuinely new form session — see submittingRef's own comment.
    submittingRef.current = false;
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(String(editTransaction.amount));
      setCategoryId(editTransaction.categoryId);
      const parts = dateParts(new Date(editTransaction.date));
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setPaymentSource(editTransaction.paymentSource ?? 'cash');
      setCreditCardId(editTransaction.creditCardId ?? null);
      setLiabilityId(editTransaction.liabilityId ?? null);
      setEverydayAccountId(editTransaction.paymentSource === 'everyday' ? editTransaction.targetAssetId ?? null : null);
      setBalanceEffect(editTransaction.balanceEffect ?? 'update');
      // Round 6 correction — only a genuinely manual transaction's note is
      // ever editable here; a recurring-confirmed transaction keeps using
      // the existing read-only "Source: X" display instead (see
      // editTransactionDisplayLabel/isEditingRecurringLinked below), so
      // this value is only ever shown for the manual case.
      setTransactionName(editTransaction.note ?? '');
      initialSnapshot.current = { amount: String(editTransaction.amount), categoryId: editTransaction.categoryId };
      setFormStep('details');
    } else {
      setType(initialType ?? 'expense');
      setAmount('');
      setCategoryId(null);
      const parts = dateParts(new Date());
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setPaymentSource('cash');
      setCreditCardId(null);
      setLiabilityId(null);
      setEverydayAccountId(null);
      setBalanceEffect('update');
      setTransactionName('');
      initialSnapshot.current = { amount: '', categoryId: null };
      setFormStep('category');
    }
  }, [visible, editTransaction, initialType]);

  // Keeps the tracked-balance choice honest as the user changes funding
  // source or which card/liability is selected: force it to "record only"
  // the moment there's no real target to update, and default it back to
  // "update" the moment a target newly becomes available — never leaving a
  // stale "update" selection pointed at nothing (regression-protection
  // review, Stream B1 UI integration §3/§8: "no stale selection remains when
  // changing to a source without a valid target").
  useEffect(() => {
    if (!hasValidBalanceTarget) {
      setBalanceEffect('none');
    } else if (!prevHasValidBalanceTarget.current) {
      setBalanceEffect('update');
    }
    prevHasValidBalanceTarget.current = hasValidBalanceTarget;
  }, [hasValidBalanceTarget]);

  function chooseCategory(id: string) {
    setCategoryId(id);
    setFormStep('details');
  }

  function applyDatePreset(daysAgo: number) {
    const parts = dateParts(new Date(Date.now() - daysAgo * 86400000));
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
  }

  const categories = data.categories.filter((c) => c.type === type);
  const amountValue = parseFloat(amount);
  const dayValue = parseInt(day, 10);
  const monthValue = parseInt(month, 10);
  const yearValue = parseInt(year, 10);
  const dateValid = !isNaN(dayValue) && !isNaN(monthValue) && !isNaN(yearValue) && dayValue >= 1 && dayValue <= 31 && monthValue >= 1 && monthValue <= 12;
  // Round 6 correction — a recurring-confirmed transaction (has
  // recurringItemId) never gets the editable name field at all; it keeps
  // the existing read-only "Source: X" display, and its naming is
  // unaffected by this correction. A brand-new manual expense always
  // requires a name; editing an existing manual expense that already had
  // one requires it stay non-blank; editing a legacy manual expense that
  // never had one does not retroactively force one (no migration, no
  // forced backfill).
  // Correction round, 2026-08-10 — the same name field, gating and
  // fallback rules now apply to a manual INCOME transaction too (previously
  // expense-only): "Record income received" and any other manual income
  // entry can carry a customer-typed name exactly like an expense can,
  // reusing the identical requiresTransactionName/notePayload/render-gate
  // logic below rather than a parallel income-specific implementation.
  const isEditingRecurringLinked = !!editTransaction?.recurringItemId;
  // Correction pass, §1 — a BNPL repayment transaction is never editable
  // via the generic amount/date/paid-from fields (changing its amount here
  // would desynchronise the liability and schedule, which only the atomic
  // confirm/reverse transitions are allowed to touch). Blocking generic
  // editing entirely is the smallest safe MVP treatment now that a
  // dedicated atomic reversal exists for deletion — see handleDelete.
  const isEditingBnplRepayment = !!editTransaction && isBnplRepaymentTransaction(data, editTransaction);
  const hadExistingNote = !!editTransaction?.note;
  const requiresTransactionName = !isEditingRecurringLinked && (!isEditing || hadExistingNote);
  // Everyday Account expense routing — negative balances are unsupported
  // in the MVP (unlike Cash, which the engine silently floors at 0). Blocks
  // Save with clear, neutral feedback rather than silently clamping,
  // per the explicit requirement. `everydayAvailableBalance` already
  // accounts for reversing this same transaction's own prior effect on
  // the same account when editing (see its own declaration comment).
  const insufficientEverydayFunds =
    paymentSource === 'everyday' && !!selectedEverydayAccount && !isNaN(amountValue) && amountValue > (everydayAvailableBalance ?? 0);
  const canSave =
    !isEditingBnplRepayment &&
    !isNaN(amountValue) &&
    amountValue > 0 &&
    !!categoryId &&
    dateValid &&
    (!requiresTransactionName || transactionName.trim().length > 0) &&
    !insufficientEverydayFunds;

  // Save is only ever reachable from the details step (category has no
  // categoryId yet, so canSave is already false there in practice — this
  // makes that gate explicit for the host's embedded footer too).
  useEffect(() => {
    onCanSaveChange?.(canSave && formStep === 'details');
  }, [canSave, formStep, onCanSaveChange]);

  function handleSave() {
    if (isEditingBnplRepayment) return;
    if (!canSave || !categoryId || formStep !== 'details') return;
    // Must be checked+set synchronously before anything else touches state
    // or calls a persistence action — see submittingRef's own comment.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const isoDate = new Date(yearValue, monthValue - 1, dayValue).toISOString();
    // Defensive re-check, not just a read of state: never let balanceEffect
    // resolve to 'update' when there's no real target, even if the
    // auto-defaulting effect above hasn't re-run yet for some reason
    // (regression-protection review, Stream B1 UI integration §3: "do not
    // silently use balanceEffect: 'update' when no balance target exists").
    const effectiveBalanceEffect: BalanceEffectMode = hasValidBalanceTarget ? balanceEffect : 'none';
    // Round 6 correction, extended in the correction round, 2026-08-10 —
    // reuses the existing Transaction.note field as the manual
    // transaction's own name (no new schema field), now for both expense
    // and income. Only ever set for the manual case this form actually
    // exposes an editable name field for; a recurring-confirmed
    // transaction's own note (its immutable confirmation-time snapshot) is
    // never touched here, since editTransaction.note simply isn't read for
    // that case.
    const notePayload = !isEditingRecurringLinked && transactionName.trim().length > 0 ? { note: transactionName.trim() } : {};
    const payload =
      type === 'expense'
        ? {
            type,
            amount: amountValue,
            categoryId,
            date: isoDate,
            paymentSource,
            creditCardId: paymentSource === 'credit_card' ? creditCardId ?? undefined : undefined,
            liabilityId: paymentSource === 'loan' ? liabilityId ?? undefined : undefined,
            targetAssetId: paymentSource === 'everyday' ? everydayAccountId ?? undefined : undefined,
            balanceEffect: effectiveBalanceEffect,
            ...notePayload,
          }
        : { type, amount: amountValue, categoryId, date: isoDate, ...notePayload };

    // The tracked-balance choice is now made explicitly, inline, before Save
    // is ever pressed — updateTransaction always reconciles correctly from
    // it (regression-protection review, Stream B1), so the old post-save
    // "should we also adjust your balance?" alert is no longer the only way
    // to reach or change this choice, and keeping both would leave two
    // mechanisms answering the same question. Retired here; deleting a
    // transaction still asks separately, below — a genuinely different,
    // destructive-action decision.
    if (editTransaction) {
      updateTransaction(editTransaction.id, payload);
    } else {
      addTransaction(payload);
    }
    // Embedded: hand control back to the host, which closes the whole Add
    // Anything journey exactly once. Standalone: unchanged direct onClose().
    if (embedded) onSaveSuccess?.();
    else onClose();
  }

  function handleDelete() {
    if (!editTransaction) return;
    // Correction pass, §1 — a BNPL repayment transaction never goes through
    // the generic single-target describeReversalTarget/deleteTransaction
    // path below: that path only ever reverses the transaction's own
    // appliedBalanceEffect (the source side), never the linked BNPL
    // liability it also decreased, which produced the confirmed
    // financial-integrity defect this pass exists to fix. "Delete record
    // only" (no reversal at all) stays safe and available regardless —
    // it never touches a balance, so it can never desynchronise anything.
    // Only the latest confirmed repayment on its plan is safe to fully
    // reverse (see isLatestBnplRepaymentTransaction's own contract: an
    // earlier repayment's occurrence date/liability amount can't be
    // reconstructed once a later repayment has already moved the schedule
    // and balance forward), so an earlier one is offered record-only
    // deletion with an explanation instead.
    if (isBnplRepaymentTransaction(data, editTransaction)) {
      const isLatest = isLatestBnplRepaymentTransaction(data, editTransaction.id);
      if (!isLatest) {
        Alert.alert(
          'Delete transaction?',
          "Only the most recent BNPL repayment can be undone. Deleting this one will remove it from Transaction History, but won't change your BNPL balance or payment source — update the BNPL plan if its recorded balance is incorrect.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete transaction', style: 'destructive', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          ]
        );
        return;
      }
      Alert.alert(
        'Delete this repayment?',
        'This repayment updated both your payment source and BNPL balance. Deleting it will reverse both — your payment source will go back up and your BNPL balance will go back up by the same amount.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete record only',
            onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); },
          },
          {
            text: 'Delete & reverse',
            style: 'destructive',
            onPress: () => {
              const result = reverseBnplRepayment(editTransaction.id);
              if (!result.applied) {
                Alert.alert('Could not reverse this repayment', "This repayment can no longer be safely reversed. You can still delete the record only, or update the BNPL plan if its recorded balance is incorrect.");
                return;
              }
              onClose();
            },
          },
        ]
      );
      return;
    }
    // Final Pass 2D device-test correction — a confirmed credit-card
    // repayment routes through its own dedicated atomic reversal for the
    // same reason BNPL does above (see isCreditCardRepaymentTransaction's
    // own doc comment for the exact defect this closes: the generic path
    // silently under-states the card's balance on delete&reverse). No
    // "latest only" restriction — each repayment is independent.
    if (isCreditCardRepaymentTransaction(editTransaction)) {
      Alert.alert(
        'Delete this repayment?',
        'This repayment updated both your payment source and card balance. Deleting it will reverse both — your payment source will go back up and what you owe on the card will go back up by the same amount.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete record only', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          {
            text: 'Delete & reverse',
            style: 'destructive',
            onPress: () => {
              const result = reverseCreditCardRepayment(editTransaction.id);
              if (!result.applied) {
                Alert.alert('Could not reverse this repayment', 'This repayment could no longer be safely reversed. You can still delete the record only.');
                return;
              }
              onClose();
            },
          },
        ]
      );
      return;
    }
    // Final Pass 2D device-test correction — a confirmed mortgage/personal-
    // loan/car-loan repayment mirrors the BNPL branch above exactly,
    // including the same "only the latest is safe to fully reverse"
    // restriction and reasoning (see reverseLoanRepaymentTransaction's own
    // doc comment).
    if (isLoanRepaymentTransaction(data, editTransaction)) {
      const isLatest = isLatestLoanRepaymentTransaction(data, editTransaction.id);
      if (!isLatest) {
        Alert.alert(
          'Delete transaction?',
          "Only the most recent repayment on this loan can be undone. Deleting this one will remove it from Transaction History, but won't change your recorded loan balance or payment source — update the loan's recorded balance directly if it's incorrect.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete transaction', style: 'destructive', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          ]
        );
        return;
      }
      const reversesBalance = typeof editTransaction.principalAmount === 'number' && editTransaction.principalAmount > 0;
      Alert.alert(
        'Delete this repayment?',
        reversesBalance
          ? 'This repayment updated both your payment source and recorded loan balance. Deleting it will reverse both — your payment source will go back up and your recorded loan balance will go back up by the same principal amount.'
          : 'This repayment updated your payment source (your recorded loan balance was not changed by it). Deleting it will reverse your payment source.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete record only', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          {
            text: 'Delete & reverse',
            style: 'destructive',
            onPress: () => {
              const result = reverseLoanRepayment(editTransaction.id);
              if (!result.applied) {
                Alert.alert('Could not reverse this repayment', 'This repayment can no longer be safely reversed. You can still delete the record only.');
                return;
              }
              onClose();
            },
          },
        ]
      );
      return;
    }
    // 2D-NARROW correction, Gate 3 — an ordinary occurrence-tracked bill
    // mirrors the BNPL/loan branches above: only the latest confirmed
    // occurrence on its RecurringItem is safe to fully reverse (an earlier
    // one's due occurrence can't be reconstructed once a later occurrence
    // has already moved nextDueDate forward). "Delete record only" stays
    // safe and available regardless — it never touches a balance or the
    // Reminder, so it can never desynchronise anything.
    if (isOrdinaryOccurrenceBillTransaction(data, editTransaction)) {
      const isLatest = isLatestRecurringOccurrenceTransaction(data, editTransaction.id);
      if (!isLatest) {
        Alert.alert(
          'Delete transaction?',
          "Only the most recent occurrence of this bill can be undone. Deleting this one will remove it from Transaction History, but won't change your payment source or restore its Reminder.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete transaction', style: 'destructive', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          ]
        );
        return;
      }
      Alert.alert(
        'Delete this payment?',
        'This payment updated your payment source and completed a bill Reminder. Deleting it will reverse both — your payment source will go back up and the Reminder will return to due.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete record only', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
          {
            text: 'Delete & reverse',
            style: 'destructive',
            onPress: () => {
              const result = reverseRecurringOccurrence(editTransaction.id);
              if (!result.applied) {
                Alert.alert('Could not reverse this payment', 'This payment could no longer be safely reversed. You can still delete the record only.');
                return;
              }
              onClose();
            },
          },
        ]
      );
      return;
    }
    // 2026-08-09 correction (revised) — every delete still shows an
    // ordinary destructive-action confirmation (a single accidental tap
    // must never silently delete a record). The only thing that changes on
    // whether describeReversalTarget found a real applied effect is WHICH
    // confirmation: a Record-only/zero-effect transaction is offered a
    // plain delete with no balance-reversal choice at all (there is
    // nothing to reverse); a transaction with a real applied effect keeps
    // the existing choice between deleting only the record and deleting
    // while reversing that exact effect. The account/card name is never
    // put in a button label (could be arbitrarily long) — only in the
    // message body.
    const reversal = describeReversalTarget(data, editTransaction);
    if (!reversal) {
      Alert.alert('Delete transaction?', `Delete this transaction from ${brand.name}? No tracked balance will change.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete transaction', style: 'destructive', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
      ]);
      return;
    }
    Alert.alert(
      'Delete transaction?',
      `This transaction changed ${reversal.label} by ${formatMoney(reversal.amount)}. Would you like ${brand.name} to reverse that balance change?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete record only', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
        { text: 'Delete & reverse', style: 'destructive', onPress: () => { deleteTransaction(editTransaction.id, true); onClose(); } },
      ]
    );
  }

  // Full-workspace extension — 'back' never discards (draft preserved
  // across Back); every other reason routes through the same dirty check
  // the standalone Cancel button already uses inline below.
  function handleRequestClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(isDirty, () => onConfirmedClose?.(reason));
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        segment: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: 4,
          marginBottom: spacing.md,
        },
        segmentButton: {
          flex: 1,
          paddingVertical: 10,
          alignItems: 'center',
          borderRadius: radius.control - 2,
        },
        segmentActive: {
          backgroundColor: colors.surface,
        },
        segmentText: {
          ...typography.body,
          fontSize: 14,
          color: colors.textSecondary,
        },
        segmentTextActive: {
          color: colors.textPrimary,
          fontWeight: '600',
        },
        amountInput: {
          fontSize: 36,
          fontWeight: '700',
          textAlign: 'center',
          paddingVertical: spacing.md,
          color: colors.textPrimary,
        },
        sectionLabel: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        categoryRow: {
          marginBottom: spacing.md,
        },
        categoryChip: {
          paddingHorizontal: spacing.md,
          paddingVertical: 9,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
          marginRight: spacing.sm,
        },
        categoryChipActive: {
          backgroundColor: colors.accentSoft,
        },
        categoryText: {
          ...typography.caption,
          fontSize: 13,
          color: colors.textSecondary,
        },
        categoryTextActive: {
          color: colors.accentStrong,
          fontWeight: '600',
        },
        footerButton: {
          flex: 1,
        },
        deleteButton: { alignSelf: 'center', marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
        presetChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        presetChipActive: { backgroundColor: colors.accentSoft },
        presetText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        presetTextActive: { color: colors.accentStrong, fontWeight: '600' },
        nameInput: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          marginBottom: spacing.md,
          color: colors.textPrimary,
        },
        dateRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        dateInput: {
          flex: 1,
          textAlign: 'center',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: 10,
          fontSize: 15,
          color: colors.textPrimary,
        },
        hintText: { ...typography.micro, color: colors.textSecondary, marginTop: -4, marginBottom: spacing.md, lineHeight: 15 },
        balanceEffectGroup: { gap: spacing.xs, marginBottom: spacing.xs },
        // Selection is signalled by both the icon swap (checkmark vs
        // outline) and the label's weight/colour — never by colour alone.
        balanceEffectOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 9 },
        balanceEffectOptionDisabled: { opacity: 0.4 },
        balanceEffectLabel: { ...typography.body, fontSize: 14, color: colors.textSecondary },
        balanceEffectLabelActive: { color: colors.textPrimary, fontWeight: '600' },
        cashPromptBox: { backgroundColor: colors.warningSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        cashPromptTitle: { ...typography.caption, fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
        cashPromptBody: { ...typography.micro, color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.sm },
        cashPromptButton: { paddingVertical: 9, alignItems: 'center' },
        cashPromptButtonPrimary: { backgroundColor: colors.surface, borderRadius: radius.control, marginBottom: spacing.xs },
        cashPromptButtonText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        cashPromptButtonTextMuted: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
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
        selectedCategoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        selectedCategoryEmoji: { fontSize: 20 },
        selectedCategoryLabel: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', flex: 1 },
        selectedCategoryChange: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        sourceLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        sourceLabelValue: { fontWeight: '700', color: colors.textPrimary },
      }),
    [colors, radius, spacing, typography]
  );

  const selectedCategory = categoryId ? data.categories.find((c) => c.id === categoryId) ?? null : null;
  // Read-only — the transaction's own primary identity (e.g. "Internet
  // test"), kept visibly separate from the editable category picker below
  // (regression-protection review, B2.0B transaction-identity correction
  // §1). Round 6 correction — now rendered ONLY for a recurring-confirmed
  // transaction (isEditingRecurringLinked); a manual transaction's note is
  // shown via the editable "Transaction name" field below instead, never
  // duplicated as a second, read-only copy of the same value. Recurring
  // naming itself is unchanged by this correction.
  const editTransactionDisplayLabel =
    editTransaction && isEditingRecurringLinked
      ? editTransaction.note ?? (editTransaction.recurringItemId ? data.recurringItems.find((r) => r.id === editTransaction.recurringItemId)?.label ?? null : null)
      : null;

  if (formStep === 'category') {
    const categoryContent = (
      <>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentButton, type === 'expense' ? styles.segmentActive : null]}
            onPress={() => {
              setType('expense');
              setCategoryId(null);
            }}
          >
            <Text style={[styles.segmentText, type === 'expense' ? styles.segmentTextActive : null]}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, type === 'income' ? styles.segmentActive : null]}
            onPress={() => {
              setType('income');
              setCategoryId(null);
            }}
          >
            <Text style={[styles.segmentText, type === 'income' ? styles.segmentTextActive : null]}>Income</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.categoryGrid}>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseCategory(c.id)}>
              <Text style={styles.categoryCardEmoji}>{categoryEmoji(c.id)}</Text>
              <Text style={styles.categoryCardLabel}>{c.name}</Text>
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
        title="What's this for?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        {categoryContent}
      </KeyboardSheet>
    );
  }

  // Correction pass, §1 — a BNPL repayment transaction is view-only here:
  // no amount/date/paid-from/category field is rendered at all, so there
  // is no path through this screen that can edit its amount without also
  // updating the linked liability and schedule (which only confirm/reverse
  // are allowed to do). Delete remains available, routed through
  // handleDelete's own BNPL-aware branch above.
  if (isEditingBnplRepayment && editTransaction) {
    const bnplLockedContent = (
      <>
        <Text style={styles.sourceLabel}>
          Source: <Text style={styles.sourceLabelValue}>{editTransactionDisplayLabel ?? 'BNPL repayment'}</Text>
        </Text>
        <Text style={styles.amountInput}>{formatMoney(editTransaction.amount)}</Text>
        <Text style={styles.hintText}>
          This repayment updated both your payment source and BNPL balance. It can't be edited here — update the BNPL plan if its recorded
          balance is incorrect.
        </Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete transaction</Text>
        </TouchableOpacity>
      </>
    );

    if (embedded) return bnplLockedContent;

    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="Edit transaction"
        footer={<Button label="Close" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        {bnplLockedContent}
      </KeyboardSheet>
    );
  }

  const content = (
    <>
      {/* Read-only — this transaction's own primary identity, kept visibly
          separate from the editable category picker below (regression-
          protection review, B2.0B transaction-identity correction §1). Only
          shown when editing a recurring-confirmed transaction; never shown
          for a manual transaction (which gets the editable name field
          below instead), and never itself editable. */}
      {editTransactionDisplayLabel ? (
        <Text style={styles.sourceLabel}>
          Source: <Text style={styles.sourceLabelValue}>{editTransactionDisplayLabel}</Text>
        </Text>
      ) : null}

      {/* Round 6 correction, extended in the correction round, 2026-08-10 —
          required field order for a manual transaction: 1. Transaction
          name, 2. Amount, 3. Category, 4. Paid from/tracked balance (expense
          only) or destination (income, not yet offered from this form),
          5. Date. Now shown for BOTH expense and income — a
          recurring-confirmed transaction of either type keeps its existing
          read-only Source line above instead of this editable field. */}
      {!isEditingRecurringLinked ? (
        <>
          <Text style={styles.sectionLabel}>Transaction name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder={type === 'income' ? 'e.g. August salary' : 'e.g. Woolworths groceries'}
            placeholderTextColor={colors.textMuted}
            value={transactionName}
            onChangeText={setTransactionName}
            autoFocus
          />
        </>
      ) : null}

      <TextInput
        style={styles.amountInput}
        placeholder="$0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        autoFocus={isEditingRecurringLinked}
      />

      <View style={styles.selectedCategoryRow}>
        <Text style={styles.selectedCategoryEmoji}>{selectedCategory ? categoryEmoji(selectedCategory.id) : '💰'}</Text>
        <Text style={styles.selectedCategoryLabel}>{selectedCategory?.name ?? 'Select a category'}</Text>
        <TouchableOpacity onPress={() => setFormStep('category')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.selectedCategoryChange}>Change</Text>
        </TouchableOpacity>
      </View>

      {type === 'expense' ? (
        <>
          <Text style={styles.sectionLabel}>Paid from</Text>
          <View style={styles.presetRow}>
            {paymentSourceOptions.map((s) => {
              const active = paymentSource === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.presetChip, active ? styles.presetChipActive : null]}
                  onPress={() => setPaymentSource(s.value)}
                >
                  <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentSource === 'cash' && !hasCashAsset ? (
            <View style={styles.cashPromptBox}>
              <Text style={styles.cashPromptTitle}>Add your cash balance first</Text>
              <Text style={styles.cashPromptBody}>{brand.name} needs to know how much cash you have before reducing it.</Text>
              <TouchableOpacity style={[styles.cashPromptButton, styles.cashPromptButtonPrimary]} onPress={() => setAddCashVisible(true)}>
                <Text style={styles.cashPromptButtonText}>Add cash balance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cashPromptButton} onPress={() => setPaymentSource('credit_card')}>
                <Text style={styles.cashPromptButtonTextMuted}>Use credit card instead</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cashPromptButton} onPress={() => setPaymentSource('other')}>
                <Text style={styles.cashPromptButtonTextMuted}>Record as spending only</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {paymentSource === 'credit_card' ? (
            data.creditCards.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {data.creditCards.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.categoryChip, creditCardId === c.id ? styles.categoryChipActive : null]}
                      onPress={() => setCreditCardId(c.id)}
                    >
                      <Text style={[styles.categoryText, creditCardId === c.id ? styles.categoryTextActive : null]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.hintText}>This card's balance will increase — {brand.name} keeps it in sync with your Wealth liabilities.</Text>
              </>
            ) : (
              <Text style={styles.hintText}>No cards added yet — add one in Wealth to link this expense to a card balance.</Text>
            )
          ) : null}

          {paymentSource === 'loan' ? (
            nonCreditLiabilities.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {nonCreditLiabilities.map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={[styles.categoryChip, liabilityId === l.id ? styles.categoryChipActive : null]}
                      onPress={() => setLiabilityId(l.id)}
                    >
                      <Text style={[styles.categoryText, liabilityId === l.id ? styles.categoryTextActive : null]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.hintText}>Record a purchase that increased a selected loan balance.</Text>
              </>
            ) : (
              <Text style={styles.hintText}>No loans added yet — add one in Wealth to link this expense to a liability.</Text>
            )
          ) : null}

          {paymentSource === 'everyday' ? (
            everydayAccounts.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {everydayAccounts.map((a) => {
                    const label = everydayAccountLabels.get(a.id) ?? everydayChipBaseText(a);
                    const selected = everydayAccountId === a.id;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.categoryChip, selected ? styles.categoryChipActive : null]}
                        onPress={() => setEverydayAccountId(a.id)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.categoryText, selected ? styles.categoryTextActive : null]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {everydayAccountId && !selectedEverydayAccount ? (
                  <Text style={styles.hintText}>
                    The original account for this transaction no longer exists. Choose an account above, or this transaction will be recorded
                    without changing a balance.
                  </Text>
                ) : insufficientEverydayFunds ? (
                  <Text style={[styles.hintText, { color: colors.danger }]}>
                    This is more than the {formatMoney(everydayAvailableBalance ?? 0)} available in {selectedEverydayAccount?.label}.
                  </Text>
                ) : (
                  <Text style={styles.hintText}>This account's balance will decrease — {brand.name} keeps it in sync with your Wealth picture.</Text>
                )}
              </>
            ) : (
              <Text style={styles.hintText}>This account is no longer available. This transaction will be recorded without changing a balance.</Text>
            )
          ) : null}

          {/* Tracked balance — deliberately its own, separately-labelled
              section (regression-protection review, Stream B1 UI
              integration §2): funding source is a factual record of how the
              money moved; this is the separate, independent choice of
              whether Navilo also updates a stored balance to match. Inline,
              always visible before Save — never a post-save alert. */}
          <Text style={styles.sectionLabel}>Tracked balance</Text>
          <View style={styles.balanceEffectGroup}>
            <TouchableOpacity
              style={[styles.balanceEffectOption, !hasValidBalanceTarget ? styles.balanceEffectOptionDisabled : null]}
              onPress={() => hasValidBalanceTarget && setBalanceEffect('update')}
              disabled={!hasValidBalanceTarget}
              accessibilityRole="radio"
              accessibilityState={{ selected: hasValidBalanceTarget && balanceEffect === 'update', disabled: !hasValidBalanceTarget }}
              accessibilityLabel="Update tracked balance"
            >
              <Ionicons
                name={hasValidBalanceTarget && balanceEffect === 'update' ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={hasValidBalanceTarget && balanceEffect === 'update' ? colors.accentStrong : colors.textMuted}
              />
              <Text style={[styles.balanceEffectLabel, hasValidBalanceTarget && balanceEffect === 'update' ? styles.balanceEffectLabelActive : null]}>
                Update tracked balance
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.balanceEffectOption}
              onPress={() => setBalanceEffect('none')}
              accessibilityRole="radio"
              accessibilityState={{ selected: !hasValidBalanceTarget || balanceEffect === 'none' }}
              accessibilityLabel="Record only"
            >
              <Ionicons
                name={!hasValidBalanceTarget || balanceEffect === 'none' ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={!hasValidBalanceTarget || balanceEffect === 'none' ? colors.accentStrong : colors.textMuted}
              />
              <Text style={[styles.balanceEffectLabel, !hasValidBalanceTarget || balanceEffect === 'none' ? styles.balanceEffectLabelActive : null]}>
                Record only
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hintText}>
            {hasValidBalanceTarget
              ? balanceEffect === 'none' && trackedBalanceTargetLabel
                ? `Record this transaction without changing your ${trackedBalanceTargetLabel} balance.`
                : `Record only saves this transaction without changing a balance tracked in ${brand.name}.`
              : paymentSource === 'credit_card'
              ? data.creditCards.length > 0
                ? 'Select a card above to track this against it, or continue recording only.'
                : 'No cards added yet. This transaction will be recorded without changing a card balance.'
              : paymentSource === 'loan'
              ? nonCreditLiabilities.length > 0
                ? 'Select a loan above to track this against it, or continue recording only.'
                : 'No loans added yet. This transaction will be recorded without changing a liability balance.'
              : paymentSource === 'cash'
              ? 'Add a cash balance above to track this against it, or continue recording only.'
              : paymentSource === 'everyday'
              ? 'Choose which everyday account this was paid from above to track this against it.'
              : `Record only saves this transaction without changing a balance tracked in ${brand.name}.`}
          </Text>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Date</Text>
      <View style={styles.presetRow}>
        {DATE_PRESETS.map((preset) => {
          const presetParts = dateParts(new Date(Date.now() - preset.daysAgo * 86400000));
          const active = day === presetParts.day && month === presetParts.month && year === presetParts.year;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetChip, active ? styles.presetChipActive : null]}
              onPress={() => applyDatePreset(preset.daysAgo)}
            >
              <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>{preset.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.dateRow}>
        <TextInput style={styles.dateInput} placeholder="DD" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={day} onChangeText={setDay} maxLength={2} />
        <TextInput style={styles.dateInput} placeholder="MM" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={month} onChangeText={setMonth} maxLength={2} />
        <TextInput style={styles.dateInput} placeholder="YYYY" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={year} onChangeText={setYear} maxLength={4} />
      </View>

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete transaction</Text>
        </TouchableOpacity>
      ) : null}

      {/* Full-workspace extension — deliberately left as a standalone
          overlay even when this form itself is embedded: it is a genuine
          secondary sheet (same category as this form's own date/category
          pickers elsewhere in the app), not a sibling Add Anything
          destination, so it is never itself given `embedded`. RN's Modal
          always renders in its own native top-level layer, so it still
          appears correctly above the embedded workspace either way. */}
      <AddWealthItemModal visible={addCashVisible} kind="asset" presetAssetType="cash" onClose={() => setAddCashVisible(false)} />
    </>
  );

  if (embedded) return content;

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit transaction' : 'Add transaction'}
      isDirty={isDirty}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={() => confirmDiscardIfDirty(isDirty, onClose)} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      {content}
    </KeyboardSheet>
  );
});
