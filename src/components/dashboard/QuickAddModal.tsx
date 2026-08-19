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
import { categoryIcon, accountSourceIcon } from '../../lib/addIcons';
import { brand } from '../../lib/brand';
import { EmbeddedCloseReason, EmbeddedStepHandle } from '../navigation/addWorkspaceTransitionController';
import { Segmented } from '../shared/Segmented';
import { InlineSelect } from '../shared/fields/InlineSelect';
import { TextField } from '../shared/fields/TextField';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { AccountChoice, AccountSelectionField } from '../shared/fields/AccountSelectionField';
import { BalanceUpdateField } from '../shared/fields/BalanceUpdateField';
import { DateTriggerField } from '../shared/fields/DateTriggerField';
import { resolveEligibleIncomeDestinations } from '../../lib/calculations/incomeDestinations';

/** Design 5.1 Wave 4 — the two segments the removed "What's this for?"
 * page used to own. Same two values, same labels. */
const TRANSACTION_TYPE_OPTIONS = [
  { value: 'expense' as const, label: 'Expense' },
  { value: 'income' as const, label: 'Income' },
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
  // Wave 4 device correction — derived SYNCHRONOUSLY from the canonical
  // route preset, not repaired by an effect after the workspace opens. An
  // `income_received` entry previously rendered once as an EXPENSE form
  // (wrong categories, wrong placeholder) before the reset effect flipped
  // it. The workspace remounts this component on every fresh open (the
  // host bumps `instanceKey`), so a lazy initial value is the correct
  // single source for the opening mode; `editTransaction` still wins in
  // the reset effect below, exactly as before.
  const [type, setType] = useState<'income' | 'expense'>(() => editTransaction?.type ?? initialType ?? 'expense');
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
  // Wave 4 device correction — an expense's funding source must be an
  // EXPLICIT choice. `paymentSource` still defaults to 'cash' so every
  // downstream derivation (hasValidBalanceTarget, the save payload, the
  // insufficient-funds check) keeps working exactly as before; this flag is
  // purely "has the customer actually decided yet", and Save is blocked
  // until they have. Editing an existing transaction starts already chosen.
  const [sourceChosen, setSourceChosen] = useState(!!editTransaction);
  // Wave 4 device correction — an income transaction's destination. Maps
  // straight onto the EXISTING Transaction.targetAssetId field, which the
  // engine already honours for income (computeBalanceEffect credits this
  // asset instead of falling back to the default Cash lookup). No schema
  // change, no new engine path.
  const [incomeTargetAssetId, setIncomeTargetAssetId] = useState<string | null>(null);
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
  // Design 5.1 Wave 4 — the preliminary "What's this for?" page is gone.
  // The customer lands directly on the form and picks the category in it,
  // via the inline `InlineSelect` below. `canSave` already required
  // `!!categoryId` before this change, so Save stays disabled until a
  // category is chosen exactly as it did when the page gated it; no
  // validator was altered to make this work.
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
  const cashAsset = data.assets.find((a) => a.type === 'cash') ?? null;
  const hasCashAsset = !!cashAsset;
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
  const isDirty =
    amount !== initialSnapshot.current.amount ||
    categoryId !== initialSnapshot.current.categoryId ||
    // Wave 4 device correction — choosing a source or a destination is a
    // genuine unsaved change, so the existing discard guard must see it.
    sourceChosen !== !!editTransaction ||
    incomeTargetAssetId !== (editTransaction?.type === 'income' ? editTransaction.targetAssetId ?? null : null);

  // Correction pass (Defect 2 fix) — while embedded, the host's global
  // parked-draft guard must see this form as dirty for as long as ANY
  // unsaved change has ever existed this session, not only while `isDirty`
  // is momentarily true. A plain live-recomputed boolean is correct in
  // principle, but the host also reads it while this form's OWN layer is
  // hidden behind the chooser mid-transition/animation — a one-way latch
  // is what actually guarantees the aggregate draft can never be
  // misreported as clean by a stale/mid-transition read, regardless of
  // internal form state, route animation, or hidden-layer status.
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
    onTitleChange?.(isEditing ? 'Edit transaction' : 'Add transaction');
  }, [isEditing, onTitleChange]);

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
  // ---------------------------------------------------------------------
  // Wave 4 device correction — the flattened, prominent source/destination
  // lists. Both are built ENTIRELY from lists this form already derived
  // from the existing financial rules: no new eligibility rule is invented
  // here, and no balance is reinterpreted. They only change how the same
  // choices are presented and how explicitly they must be made.
  // ---------------------------------------------------------------------

  /** Encodes a concrete funding source as one selectable id. The two-level
   * "pick a kind, then pick which one" model the chips used is flattened to
   * a single decision, which is what made it unreadable at chip size. */
  const expenseSourceChoices: AccountChoice[] = useMemo(() => {
    const rows: AccountChoice[] = [
      {
        id: 'cash',
        name: 'Cash',
        typeLabel: 'Cash on hand',
        icon: accountSourceIcon('cash'),
        balanceLabel: cashAsset ? formatMoney(cashAsset.currentValue) : undefined,
        note: cashAsset ? undefined : 'No cash balance recorded yet',
      },
    ];
    for (const a of everydayAccounts) {
      rows.push({
        id: `everyday:${a.id}`,
        name: everydayAccountLabels.get(a.id) ?? everydayChipBaseText(a),
        typeLabel: 'Everyday account',
        icon: accountSourceIcon('everyday'),
        balanceLabel: formatMoney(a.currentValue),
      });
    }
    for (const c of data.creditCards) {
      rows.push({ id: `card:${c.id}`, name: c.label, typeLabel: 'Credit card', icon: accountSourceIcon('credit_card'), balanceLabel: formatMoney(c.currentBalance) });
    }
    for (const l of nonCreditLiabilities) {
      rows.push({ id: `loan:${l.id}`, name: l.label, typeLabel: 'Loan-funded purchase', icon: accountSourceIcon('loan'), balanceLabel: formatMoney(l.currentBalance) });
    }
    rows.push({ id: 'other', name: 'Something else', typeLabel: 'Record the spending only', icon: accountSourceIcon('other'), note: 'No balance is changed' });
    return rows;
  }, [cashAsset, everydayAccounts, everydayAccountLabels, data.creditCards, nonCreditLiabilities]);

  /** The current selection, derived from the states that already existed —
   * so a parked draft and an edited transaction both restore exactly. */
  const expenseSourceChoiceId = !sourceChosen
    ? null
    : paymentSource === 'everyday'
    ? everydayAccountId
      ? `everyday:${everydayAccountId}`
      : null
    : paymentSource === 'credit_card'
    ? creditCardId
      ? `card:${creditCardId}`
      : null
    : paymentSource === 'loan'
    ? liabilityId
      ? `loan:${liabilityId}`
      : null
    : paymentSource;

  function chooseExpenseSource(choiceId: string) {
    setSourceChosen(true);
    if (choiceId.startsWith('everyday:')) {
      setPaymentSource('everyday');
      setEverydayAccountId(choiceId.slice('everyday:'.length));
      setCreditCardId(null);
      setLiabilityId(null);
      return;
    }
    if (choiceId.startsWith('card:')) {
      setPaymentSource('credit_card');
      setCreditCardId(choiceId.slice('card:'.length));
      setEverydayAccountId(null);
      setLiabilityId(null);
      return;
    }
    if (choiceId.startsWith('loan:')) {
      setPaymentSource('loan');
      setLiabilityId(choiceId.slice('loan:'.length));
      setEverydayAccountId(null);
      setCreditCardId(null);
      return;
    }
    setPaymentSource(choiceId as PaymentSource);
    setEverydayAccountId(null);
    setCreditCardId(null);
    setLiabilityId(null);
  }

  /** Income destinations come from the SHARED engine helper the recurring-
   * income and Today-reminder flows already use — never a second list. */
  const incomeDestinationOptions = useMemo(() => resolveEligibleIncomeDestinations(data.assets), [data.assets]);
  const incomeDestinationChoices: AccountChoice[] = useMemo(
    () =>
      // `d.label` is the shared helper's own already-disambiguated text and
      // already carries the balance, so no `balanceLabel` is added here —
      // showing the same figure twice would be worse, and re-deriving it
      // would be a second, divergent formatting path.
      incomeDestinationOptions.map((d) => ({
        id: d.id,
        name: d.label,
        typeLabel: d.type === 'cash' ? 'Cash on hand' : d.type === 'savings' ? 'Savings' : 'Everyday account',
        icon: accountSourceIcon(d.type),
      })),
    [incomeDestinationOptions]
  );
  /**
   * The one missing-balance card's copy, per selected source. Only ever
   * reached when `hasValidBalanceTarget` is false, and only ever rendered
   * once — the duplicate "Add cash balance" prompt that used to sit above
   * the section is gone.
   */
  /** The currently-entered date as a real local Date, or null while the
   * three parts do not yet form one. Derived from the SAME day/month/year
   * state the form has always kept — no new source of truth. */
  const selectedDate = (() => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    const candidate = new Date(y, m - 1, d);
    if (candidate.getDate() !== d || candidate.getMonth() !== m - 1 || candidate.getFullYear() !== y) return null;
    return candidate;
  })();
  /** Local midnight today — what "Today"/"Yesterday" are measured against. */
  const startOfTodayLocal = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  const missingBalanceCopy = (() => {
    if (paymentSource === 'cash') {
      return {
        title: "Cash balance isn't set up",
        body: 'Add a cash balance to update it, or record this transaction without changing a balance.',
        actionLabel: 'Add cash balance',
        onAction: () => setAddCashVisible(true),
      };
    }
    if (paymentSource === 'credit_card') {
      return {
        title: data.creditCards.length > 0 ? 'No card selected' : "You haven't added a card yet",
        body:
          data.creditCards.length > 0
            ? 'Choose a card above to update its balance, or record this transaction without changing a balance.'
            : 'Add a credit card in Wealth to update its balance, or record this transaction without changing a balance.',
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (paymentSource === 'loan') {
      return {
        title: nonCreditLiabilities.length > 0 ? 'No loan selected' : "You haven't added a loan yet",
        body:
          nonCreditLiabilities.length > 0
            ? 'Choose a loan above to update its balance, or record this transaction without changing a balance.'
            : 'Add a loan in Wealth to update its balance, or record this transaction without changing a balance.',
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (paymentSource === 'everyday') {
      return {
        title: 'No everyday account selected',
        body: 'Choose an account above to update its balance, or record this transaction without changing a balance.',
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    return {
      title: 'No balance to update',
      body: 'This transaction will be recorded without changing a balance.',
      actionLabel: undefined,
      onAction: undefined,
    };
  })();

  /** An income transaction only needs a destination when it is actually
   * meant to move a balance. `Record only` is a complete, valid answer. */
  const incomeSelectedDestination = incomeTargetAssetId ? incomeDestinationOptions.find((d) => d.id === incomeTargetAssetId) ?? null : null;
  const incomeNeedsDestination = type === 'income' && balanceEffect === 'update' && incomeDestinationChoices.length > 0;
  const incomeDestinationMissing = incomeNeedsDestination && !incomeTargetAssetId;

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
      setSourceChosen(true);
      setIncomeTargetAssetId(editTransaction.type === 'income' ? editTransaction.targetAssetId ?? null : null);
      // Round 6 correction — only a genuinely manual transaction's note is
      // ever editable here; a recurring-confirmed transaction keeps using
      // the existing read-only "Source: X" display instead (see
      // editTransactionDisplayLabel/isEditingRecurringLinked below), so
      // this value is only ever shown for the manual case.
      setTransactionName(editTransaction.note ?? '');
      initialSnapshot.current = { amount: String(editTransaction.amount), categoryId: editTransaction.categoryId };
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
      setSourceChosen(false);
      setIncomeTargetAssetId(null);
      setTransactionName('');
      initialSnapshot.current = { amount: '', categoryId: null };
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

  const categories = data.categories.filter((c) => c.type === type);
  // Exactly the list the removed page rendered as a grid — same source,
  // same filter, same emoji helper — now shown inline.
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name, icon: categoryIcon(c.id) })),
    [categories]
  );
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
    !insufficientEverydayFunds &&
    // Wave 4 device correction, owner-authorised. An expense must say where
    // the money came FROM, and an income that is meant to move a balance
    // must say where it went INTO. Both were previously allowed to fall
    // through to a silent Cash assumption. Neither term relaxes any existing
    // rule — they only add a required, explicit choice.
    (type !== 'expense' || sourceChosen) &&
    !incomeDestinationMissing;

  // Design 5.1 Wave 4 — there is no longer a step to gate on. `canSave`
  // itself still requires a chosen category (`!!categoryId` above), which
  // is the same guarantee the removed page provided.
  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);

  function handleSave() {
    if (isEditingBnplRepayment) return;
    if (!canSave || !categoryId) return;
    if (type === 'expense' && !sourceChosen) return;
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
    // The income equivalent of the same defensive re-check: 'update' is only
    // honoured when a real, chosen destination exists to apply it against.
    const incomeBalanceEffect: BalanceEffectMode = balanceEffect === 'update' && incomeTargetAssetId ? 'update' : 'none';
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
        : {
            type,
            amount: amountValue,
            categoryId,
            date: isoDate,
            // The engine's own income branch: with targetAssetId set it
            // credits exactly that asset; without it, it falls back to the
            // default Cash lookup, unchanged. `Record only` resolves to
            // balanceEffect 'none' and no asset is touched at all.
            targetAssetId: incomeBalanceEffect === 'update' ? incomeTargetAssetId ?? undefined : undefined,
            balanceEffect: incomeBalanceEffect,
            ...notePayload,
          };

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
        footerButton: {
          flex: 1,
        },
        deleteButton: { alignSelf: 'center', marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        // Design 5.1 Wave 4 — now a CONTAINER style for a TextField, not a
        // TextInput style: the surface, radius, padding and text colour all
        // come from the shared field primitive. Only the layout share
        // remains here; the centring is passed as a real TextInput prop.
        hintText: { ...typography.micro, color: colors.textSecondary, marginTop: -4, marginBottom: spacing.md, lineHeight: 15 },
        // Selection is signalled by both the icon swap (checkmark vs
        // outline) and the label's weight/colour — never by colour alone.
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
      {/* Wave 4 device correction — `autoFocus` is DELIBERATELY not applied
          while embedded. This is the body-vs-container contract: the Add
          workspace owns presentation, focus and the keyboard, and it already
          moves accessibility focus to the destination heading once its push
          transition settles.

          Before Wave 4 this field sat on the details step, which a direct
          quick entry could not reach without a tap — so autoFocus only ever
          fired on an already-presented, already-settled sheet. Removing the
          preliminary page made it fire DURING the native Modal presentation
          and the workspace push, raising the keyboard before layout had
          settled; KeyboardAvoidingView then padded the not-yet-measured
          backdrop and the absolutely-positioned destination layer collapsed
          — the blank "Add transaction" workspace the owner recorded. It is
          origin-specific for exactly that reason: from the catalogue the
          sheet is already presented and settled before this field mounts,
          which is why that path always worked. This is also why the Bill,
          Goal, Transfer and Asset tasks were unaffected — none of them
          autofocuses anything.

          Standalone (non-embedded) usage is unchanged: there is no push
          transition there and it has always worked. */}
      {!isEditingRecurringLinked ? (
        <TextField
          label="Transaction name"
          required={requiresTransactionName}
          placeholder={type === 'income' ? 'e.g. August salary' : 'e.g. Woolworths groceries'}
          value={transactionName}
          onChangeText={setTransactionName}
          autoFocus={!embedded}
        />
      ) : null}

      {/* The one primary amount in this task. Validity is decided by the
          same `amountValue`/`canSave` terms as before — CurrencyField only
          describes a malformed entry on blur; it never parses for Save. */}
      <CurrencyField
        label="Amount"
        required
        large
        value={amount}
        onChangeText={setAmount}
        autoFocus={!embedded && isEditingRecurringLinked}
      />

      {/* Design 5.1 Wave 4 — what used to be a whole preliminary page is
          now these two controls, in the form. Switching type clears the
          category exactly as the removed page's segment did, because the
          two category lists are disjoint. `isEditing` locks the type: an
          existing transaction's expense/income nature is not editable
          here, which is unchanged behaviour — the removed page was never
          reachable when editing either. */}
      {!isEditing ? (
        <Segmented
          accessibilityLabel="Transaction type"
          options={TRANSACTION_TYPE_OPTIONS}
          value={type}
          onChange={(next) => {
            if (next === type) return;
            setType(next);
            setCategoryId(null);
          }}
        />
      ) : null}

      <InlineSelect
        label="Category"
        required
        placeholder="Select a category"
        value={categoryId}
        onChange={setCategoryId}
        options={categoryOptions}
        testID="quick-add-category"
      />

      {type === 'expense' ? (
        <>
          {/* Wave 4 device correction — one prominent, readable decision in
              place of the small chip row plus a second chip row for "which
              card/account". Every row here comes from a list this form
              already derived; the selector owns no eligibility of its own. */}
          <AccountSelectionField
            label="Paid from"
            helper="Choose the account, card or cash you used for this payment."
            required
            choices={expenseSourceChoices}
            selectedId={expenseSourceChoiceId}
            onSelect={chooseExpenseSource}
            message={sourceChosen ? null : 'Choose where this money came from.'}
            testID="expense-source"
          />

          {/* Wave 4 device correction — one coherent section, immediately
              after the chosen account. What was here before: a duplicate
              "Add cash balance" card, four separate conditional hint
              paragraphs, a "Tracked balance" heading using internal wording,
              two unlabelled radio lines and a fifth hint paragraph beneath
              them. The financial choice is identical; only its presentation
              changed. */}
          <BalanceUpdateField
            mode="expense"
            accountName={hasValidBalanceTarget ? trackedBalanceTargetLabel ?? null : null}
            value={hasValidBalanceTarget && balanceEffect === 'update' ? 'update' : 'none'}
            onChange={(next) => {
              if (next === 'update' && !hasValidBalanceTarget) return;
              setBalanceEffect(next);
            }}
            missingTitle={missingBalanceCopy.title}
            missingBody={missingBalanceCopy.body}
            addBalanceLabel={missingBalanceCopy.actionLabel}
            onAddBalance={missingBalanceCopy.onAction}
            testID="expense-balance-update"
          />

          {/* The one genuinely transaction-specific warning that is NOT a
              restatement of the choice above: this expense is larger than
              the selected account holds. */}
          {insufficientEverydayFunds ? (
            <Text style={[styles.hintText, { color: colors.danger }]}>
              This is more than the {formatMoney(everydayAvailableBalance ?? 0)} available in {selectedEverydayAccount?.label}.
            </Text>
          ) : null}
        </>
      ) : null}

      {/* Wave 4 device correction — recorded income previously offered no
          destination at all and silently fell back to the engine's default
          Cash lookup. This selects the EXISTING Transaction.targetAssetId
          field, which computeBalanceEffect already honours for income, using
          the SAME shared eligibility helper the recurring-income and
          Today-reminder flows use. No engine path and no schema is new. */}
      {type === 'income' ? (
        <>
          <AccountSelectionField
            label="Received into"
            helper="Choose where this money was received."
            required={incomeNeedsDestination}
            choices={incomeDestinationChoices}
            selectedId={incomeTargetAssetId}
            onSelect={setIncomeTargetAssetId}
            message={incomeDestinationMissing ? 'Choose where this money was received.' : null}
            emptyBody={`Add a cash, everyday or savings balance and ${brand.name} can add this income to it.`}
            emptyActionLabel="Add an account"
            onEmptyAction={() => setAddCashVisible(true)}
            testID="income-destination"
          />

          {/* The same one section an expense uses, in the same words. */}
          <BalanceUpdateField
            mode="income"
            accountName={incomeSelectedDestination?.label ?? null}
            value={incomeSelectedDestination && balanceEffect === 'update' ? 'update' : 'none'}
            onChange={(next) => {
              if (next === 'update' && !incomeSelectedDestination) return;
              setBalanceEffect(next);
            }}
            missingTitle={incomeDestinationChoices.length === 0 ? "You haven't added a balance yet" : 'No account selected'}
            missingBody={
              incomeDestinationChoices.length === 0
                ? 'Add a cash, everyday or savings balance to update it, or record this income without changing a balance.'
                : 'Choose an account above to update its balance, or record this income without changing a balance.'
            }
            addBalanceLabel={incomeDestinationChoices.length === 0 ? 'Add cash balance' : undefined}
            onAddBalance={incomeDestinationChoices.length === 0 ? () => setAddCashVisible(true) : undefined}
            testID="income-balance-update"
          />
        </>
      ) : null}

      {/* Wave 4 device correction — "When did this happen?" replaces a
          four-chip shortcut rail plus three permanently-visible raw
          DD/MM/YYYY boxes. The shortcuts still exist and still produce the
          SAME local dates; they moved inside the picker, which the row below
          reveals only when asked. Local-date semantics are unchanged: the
          day/month/year state this form already kept is still the single
          source of truth, and `handleSave` still builds
          `new Date(year, month - 1, day)` exactly as before. */}
      <Text style={styles.sectionLabel}>When did this happen?</Text>
      <DateTriggerField
        label="Date"
        value={selectedDate}
        today={startOfTodayLocal}
        onChange={(next) => {
          setDay(String(next.getDate()));
          setMonth(String(next.getMonth() + 1));
          setYear(String(next.getFullYear()));
        }}
        testID="transaction-date"
      />

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
