import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import type { BnplScheduleInput } from '../../state/AppStateContext';
import { Asset, AssetType, Liability, LiabilityType, PayFrequency, RecurringItem } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Chip } from '../shared/Chip';
import { InlineSelect } from '../shared/fields/InlineSelect';
import { hapticRigid, hapticWarning } from '../../lib/haptics';
import { assetTypeIcon, liabilityTypeIcon } from '../../lib/addIcons';
import { DayOfMonthField } from '../shared/fields/DayOfMonthField';
import { DateTriggerField } from '../shared/fields/DateTriggerField';
import { TextField } from '../shared/fields/TextField';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { Button } from '../shared/Button';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { brand } from '../../lib/brand';
import { resolveIncludeInMoneyCalculations } from '../../lib/calculations/liquidAssets';
import { parseMoneyInputAllowZero } from '../../lib/calculations/money';
import { generateId } from '../../lib/id';

// The three liquid-balance types that share this form's cash/savings-style
// branch (interest-rate-adjacent fields, "Count this balance in available
// money" toggle) and must use the SAME strict, zero-allowing money parser
// (Everyday Account correction, 2026-08-08) — never a looser parseFloat,
// and never diverge from one another within this shared branch.
const LIQUID_BALANCE_TYPES: AssetType[] = ['cash', 'savings', 'everyday'];

// The "smart loan" types — the only ones with an optional asset link
// (vehicle/property) and an auto-managed repayment bill. Membership only,
// never used as an identity/dedup key (Stream C correction — liability
// type is a classification, never an identity).
const SMART_LOAN_TYPES: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan'];

// Deferred credit-card handoff (Stream D, D1, corrected): the credit_card
// type chip used to call onClose() and onSelectCreditCard() in the same
// synchronous handler, batching this sheet's own Modal dismissal and
// AddCreditCardModal's presentation into one React commit — the same
// same-tick dual-native-Modal-transition defect fixed in
// AddAnythingSheet.tsx/OptionsSheet.tsx. KeyboardSheet now forwards RN's
// real onDismiss (native-dismissal-complete signal) through to its own
// underlying Modal, so on iOS this sheet defers onSelectCreditCard to that
// real event — never a timer. RN's Modal never calls onDismiss on Android,
// so CREDIT_CARD_HANDOFF_DEFER_MS below is an Android-only fallback
// HEURISTIC, not a documented or guaranteed RN transition duration — it
// matches OptionsSheet.tsx's own long-standing Android fallback constant
// purely for consistency with an existing, already-accepted approximation
// in this codebase.
const CREDIT_CARD_HANDOFF_DEFER_MS = 300;

// Type-aware field/placeholder wording (Stream C correction §5) — "Value"/
// "Label" read as generic and, for a liability, "Value" can be confused
// with the linked asset's own value. Every liability type gets its own
// name field + placeholder; credit_card's is unused today (credit cards
// route to their own dedicated form) but kept for completeness/consistency.
const LIABILITY_NAME_FIELD: Record<LiabilityType, { field: string; placeholder: string }> = {
  mortgage: { field: 'Mortgage name', placeholder: 'e.g. Richmond home loan' },
  car_loan: { field: 'Car loan name', placeholder: 'e.g. Toyota finance' },
  personal_loan: { field: 'Personal loan name', placeholder: 'e.g. Renovation loan' },
  credit_card: { field: 'Card name', placeholder: 'e.g. AMEX' },
  other: { field: 'Liability name', placeholder: 'e.g. Tax debt' },
  bnpl: { field: 'Plan or purchase name', placeholder: 'e.g. New laptop' },
};

// Display name used in titles ("Add Car Loan" / "Update Car Loan") and the
// repayment-selector step's heading — also the single source of truth
// AddAnythingSheet.tsx's own routeDisplayName reuses for its discard/switch
// alert copy, so a loan-type label can never drift between the two files.
export const LIABILITY_DISPLAY_NAME: Record<LiabilityType, string> = {
  mortgage: 'Mortgage',
  car_loan: 'Car Loan',
  personal_loan: 'Personal Loan',
  credit_card: 'Card',
  other: 'Liability',
  bnpl: 'Buy Now, Pay Later Plan',
};

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
  { value: 'everyday', label: 'Everyday Account' },
  { value: 'etf', label: 'ETF' },
  { value: 'shares', label: 'Shares' },
  { value: 'super', label: 'Retirement Savings' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'property', label: 'Property' },
  { value: 'car', label: 'Car' },
  { value: 'business', label: 'Business' },
  { value: 'furniture', label: 'Furniture/Valuables' },
  { value: 'collectibles', label: 'Collectibles/Luxury' },
  { value: 'other', label: 'Other' },
];

// A friendlier, grouped entry point (PRD ask: "beautiful selectable cards"
// instead of text-first) — picking a card lands on the matching type chip
// below, which still lets the user refine e.g. Investments into ETF vs.
// Shares vs. Crypto. Wealth Map calculations are untouched; this only
// changes how picking an asset type feels.
const ASSET_CARD_GROUPS: { value: AssetType; label: string; description: string }[] = [
  { value: 'cash', label: 'Cash', description: 'Money in your wallet' },
  { value: 'savings', label: 'Savings', description: 'Money earning interest' },
  { value: 'everyday', label: 'Everyday Account', description: 'A bank account you use for everyday spending, usually through a debit card' },
  { value: 'etf', label: 'Investments', description: 'Stocks, ETFs, crypto, funds' },
  { value: 'property', label: 'Property', description: 'Home or investment property' },
  { value: 'super', label: 'Retirement Savings', description: 'Superannuation, 401(k), IRA, pension' },
  { value: 'car', label: 'Vehicle', description: 'Car, motorbike, boat' },
  { value: 'other', label: 'Other assets', description: 'Everything else you own' },
];

/**
 * Wave 7 correction C — the six debt types.
 *
 * The list itself is UNCHANGED: same six values, same order, same
 * discriminators. Only the presentation moved, from a wrapping chip row to
 * the same InlineSelect field-and-focused-picker the asset side already
 * uses. Chips forced six labels of wildly different widths onto two ragged
 * lines, gave no helper text, and were ~30pt tall; the shared picker gives
 * each type a full row, an icon, a description and a real target.
 *
 * `description` is new and presentational only — it never affects which
 * form, controller or validation a type reaches.
 */
const LIABILITY_TYPES: { value: LiabilityType; label: string; description: string }[] = [
  { value: 'mortgage', label: 'Mortgage', description: 'A home or investment property loan' },
  { value: 'credit_card', label: 'Credit card', description: 'Has its own form for limit, due day and rate' },
  { value: 'car_loan', label: 'Car loan', description: 'A loan secured against a vehicle' },
  { value: 'personal_loan', label: 'Personal loan', description: 'An unsecured loan or line of credit' },
  { value: 'bnpl', label: 'Buy now, pay later', description: 'An instalment plan you are still paying off' },
  { value: 'other', label: 'Other debt', description: 'Anything else you owe' },
];

const REPAYMENT_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Never assume a repayment is due today or one month from today (PRD ask,
 * §B4) — this only runs once the user has actually chosen a day. */
function nextOccurrenceFromDay(dayOfMonth: number): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (candidate.getTime() < now.getTime()) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.toISOString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBalance(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Round-5 correction (Issue 1/5) — carries WHY a liability-transition
// action failed from the try block through to the catch block, so the
// catch can show the exact reason instead of one generic message. Thrown
// only for a `LiabilityTransitionResult` with `applied: false`; every
// other failure in handleSave still falls through to the generic message.
class LiabilityFailure extends Error {
  constructor(
    public reason:
      | 'target_not_found'
      | 'target_wrong_type'
      | 'duplicate_linked_repayment'
      | 'ambiguous_schedule'
      | 'invalid_balance'
      | 'incomplete_schedule'
  ) {
    super(reason);
  }
}

const GENERIC_SAVE_ERROR = 'Something went wrong saving this — nothing was lost. Your details are still here; tap Save to try again.';
// Round-5 correction (Issue 1) — the required neutral wording for an
// ambiguous exact-linked repayment: Navilo must not guess which of
// several linked repayment records to update, so nothing is written and
// the user is told exactly what to go check.
const DUPLICATE_REPAYMENT_ERROR = 'Nolie found more than one repayment linked to this loan. Review the existing repayments before updating this schedule.';
// BNPL — the safest narrow behaviour for a corrupted/legacy plan with more
// than one active linked repayment: never guess which one, never confirm
// or project against it, surface a recoverable state instead. Reachable
// only from imported/legacy data — the normal add/edit form's own
// duplicate guard (upsertLinkedRecurringItem) already prevents creating
// this state.
const BNPL_AMBIGUOUS_SCHEDULE_ERROR = 'Nolie found more than one repayment schedule linked to this plan. Check your repayment details before saving.';

function messageForSaveFailure(err: unknown): string {
  if (!(err instanceof LiabilityFailure)) return GENERIC_SAVE_ERROR;
  if (err.reason === 'duplicate_linked_repayment') return DUPLICATE_REPAYMENT_ERROR;
  if (err.reason === 'ambiguous_schedule') return BNPL_AMBIGUOUS_SCHEDULE_ERROR;
  return GENERIC_SAVE_ERROR;
}

export type LinkedRepaymentLookup = { status: 'none' } | { status: 'one'; repayment: RecurringItem } | { status: 'ambiguous' };

/** VID-001 correction — resolves the existing repayment (if any) linked to
 * a liability, using the exact same "any recurring item with this exact
 * linkedLiabilityId" definition upsertLinkedRecurringItem itself uses
 * (AppStateContext.tsx) — no additional active/type filter, since the
 * canonical persistence and duplicate-detection path applies none either.
 * A narrower filter here would let this form's notion of "the" linked
 * repayment silently disagree with what Save actually reads/writes. */
export function findLinkedRepayment(recurringItems: RecurringItem[], liabilityId: string): LinkedRepaymentLookup {
  const matches = recurringItems.filter((r) => r.linkedLiabilityId === liabilityId);
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'one', repayment: matches[0] };
}

export interface RepaymentPrefill {
  amount: string;
  frequency: PayFrequency;
  dayOfMonth: string;
  nextDueDate: string | null;
}

/** VID-001 correction — derives the exact repayment form-field values to
 * prefill from an existing linked RecurringItem. Monthly: prefers the
 * preserved scheduleAnchorDay over deriving a day from nextDueDate, which
 * may already be clamped to a short month (e.g. a day-31 anchor's most
 * recent occurrence landing on Feb 28) — mirrors RecurringItem's own
 * documented fallback (models.ts): "absent on data created before this
 * field existed; every reader falls back to the current nextDueDate's own
 * day-of-month in that case." Weekly/fortnightly: prefills the raw
 * nextDueDate unchanged, matching both the exact shape the date picker
 * itself already writes (date.toISOString()) and what performSave already
 * reads back out for that branch. */
export function prefillValuesFromRepayment(repayment: RecurringItem): RepaymentPrefill {
  if (repayment.frequency === 'monthly') {
    const day = repayment.scheduleAnchorDay ?? new Date(repayment.nextDueDate).getDate();
    return { amount: String(repayment.amount), frequency: repayment.frequency, dayOfMonth: String(day), nextDueDate: null };
  }
  return { amount: String(repayment.amount), frequency: repayment.frequency, dayOfMonth: '', nextDueDate: repayment.nextDueDate };
}

/** Navigation Transitions, Option B pilot — why a requested close happened,
 * mirroring TransferForm's own TransferCloseReason shape so the embedded
 * host (AddAnythingSheet) can decide what "closing" means (return to the
 * chooser vs. discard-confirm-then-close the whole sheet) without this
 * form needing to know which context it's rendered in. Only meaningfully
 * used when `embedded` is true — every existing standalone caller never
 * holds a ref, so these reasons are never observed there. */
export type AddWealthItemCloseReason = 'cancel' | 'back' | 'backdrop' | 'swipe' | 'androidBack';

export interface AddWealthItemModalHandle {
  /** Invoked by the embedded host's own Save control. No-op (via the
   * existing !canSave guard inside performSave) when the form isn't
   * currently valid. Embedded-only; standalone callers never hold a ref to
   * reach this. */
  requestSave: () => void;
  /** Invoked by the embedded host's Back/Cancel controls. `'back'` never
   * discards (the embedded host preserves this form's draft across an
   * in-session Back — nothing is lost, so no confirmation is shown); every
   * other reason applies the existing "Discard changes?" confirmation
   * (confirmDiscardIfDirty) whenever this session has genuine changes,
   * exactly like every other Navilo form's Cancel/swipe/backdrop path. */
  requestClose: (reason: AddWealthItemCloseReason) => void;
}

export const AddWealthItemModal = forwardRef<AddWealthItemModalHandle, {
  visible: boolean;
  kind: 'asset' | 'liability' | null;
  /** Present = editing this existing asset instead of creating a new one. */
  editAsset?: Asset | null;
  editLiability?: Liability | null;
  /** Pre-select a type when opening to add — e.g. tapping an empty "Property"
   * category on the Wealth Map lands straight on the Property type chip. */
  presetAssetType?: AssetType;
  /** Correction round, 2026-08-10 — when true, the "Count this balance in
   * available money" toggle seeds to true regardless of asset type
   * (overriding Savings' own ordinarily-excluded default), for Select
   * Balances' scoped "Add a money balance" journey specifically: a balance
   * the user reaches this way is being added FOR that calculation, so it
   * starts included — the user can still opt out before saving, exactly
   * like any other value on this form. Every other AddWealthItemModal
   * entry point omits this and keeps the existing resolveIncludeInMoney-
   * Calculations-derived default unchanged. */
  forcedIncludeInMoneyDefault?: boolean;
  /** Correction round, 2026-08-10 review — restricts the initial category
   * step (kind="asset", no presetAssetType) to Cash/Everyday/Savings only,
   * for entry points where every other asset type would be meaningless —
   * currently, AddIncomeModal's "Add a money balance" empty-destination
   * route. Reuses the SAME ASSET_CARD_GROUPS list and chooseAssetCategory
   * handler, just filtered — never a second category chooser. Has no effect
   * when presetAssetType is set (that already skips the category step
   * entirely) or for kind="liability". */
  onlyLiquidCategories?: boolean;
  /** Same idea for liabilities — e.g. Debt Coach's "what kind of debt?"
   * chooser lands straight on the matching type chip. */
  presetLiabilityType?: LiabilityType;
  /** Explicit entry intent (Stream C correction) — the withdrawn one-
   * liability-per-type MVP model used to infer intent from presetLiabilityType
   * plus how many liabilities already existed, which is exactly what let
   * "Add Bill → Car Loan" silently overwrite an unrelated existing loan.
   * Intent must instead be stated by the caller:
   * - 'create' (default, omit for this) — Wealth "+Add", Global Add →
   *   Liability, Debt Coach's "what kind of debt?" — always a blank form,
   *   always a fresh liability id, never preselects or targets an existing
   *   same-type liability.
   * - 'select_or_create_for_repayment' — Add Bill → Mortgage/Car Loan/
   *   Personal Loan and any other bill-centric entry point whose real
   *   purpose is scheduling a repayment. When matching liabilities already
   *   exist, shows an explicit selector ("Which Car Loan is this repayment
   *   for?") rather than guessing.
   * `editLiability` (present) always wins over either — it targets the
   * exact supplied liability id regardless of intent. */
  liabilityFlowIntent?: 'create' | 'select_or_create_for_repayment';
  /** Credit cards need their own fields (limit, due day, minimum payment)
   * that don't fit this generic form — picking "Credit card" here hands
   * off to the dedicated AddCreditCardModal instead (PRD ask: credit card
   * is just one of the liability types you can add, not a separate flow
   * to discover). STANDALONE only — the defer-to-onDismiss/Android-timer
   * dance below exists purely to sequence two separate native Modal
   * presentations, which an embedded session never has (see
   * onRequestCreditCard for the embedded equivalent). Never called when
   * `embedded` is true. */
  onSelectCreditCard?: () => void;
  /** Full-workspace extension — the embedded equivalent of
   * onSelectCreditCard above. Called synchronously, directly, the instant
   * the "Credit card" chip is tapped while embedded — no Modal dismissal
   * to sequence, so no defer/timer dance is needed; the host (AddAnythingSheet)
   * simply forwards this into its own route controller (chooser<->liability
   * <->creditCard are all routes in the SAME persistent workspace, never
   * separate Modal presentations). Never called when `embedded` is false. */
  onRequestCreditCard?: () => void;
  onClose: () => void;
  /** Navigation Transitions — Add Anything, full-workspace extension. True
   * only for the embedded host that renders this component without its own
   * Modal/KeyboardSheet chrome, supplying that chrome itself and driving
   * Save/Close through the ref handle above. Every existing standalone
   * caller omits this (defaults to false), which preserves 100% of the
   * standalone rendering (own KeyboardSheet, own footer, own Cancel/Save
   * wiring) unchanged. Originally scoped to kind="asset" only (Option B
   * pilot); now also reachable with kind="liability", including its own
   * type-selector step ("Which Car Loan is this repayment for?") and the
   * credit-card handoff above — both now embedded-aware rather than always
   * standalone. */
  embedded?: boolean;
  /** Live dirty-state report for the embedded host's own KeyboardSheet
   * isDirty gate (swipe/backdrop/Android-Back). Mirrored every render
   * regardless of `embedded`, matching TransferForm's own established
   * mirror-unconditionally, no-op-if-omitted pattern. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Live validity report, so the embedded host's own Save button can be
   * enabled/disabled correctly. */
  onCanSaveChange?: (canSave: boolean) => void;
  /** Live title report (e.g. "Add cash account" vs "Add savings account"),
   * so the embedded host's own KeyboardSheet title stays in sync as the
   * user changes the asset type chip inside this form. */
  onTitleChange?: (title: string) => void;
  /** Called instead of `onClose` on a successful Save, only when embedded —
   * lets the host close its own persistent sheet exactly once, the same way
   * TransferForm's onSaveSuccess does for the embedded Transfer route. */
  onSaveSuccess?: () => void;
  /** Called instead of `onClose`, only when embedded, once a requested close
   * has been confirmed (or immediately for `reason === 'back'`, which never
   * confirms — see AddWealthItemModalHandle.requestClose above). */
  onConfirmedClose?: (reason: AddWealthItemCloseReason) => void;
}>(function AddWealthItemModal({
  visible,
  kind: kindProp,
  editAsset,
  editLiability,
  presetAssetType,
  forcedIncludeInMoneyDefault,
  onlyLiquidCategories,
  presetLiabilityType,
  liabilityFlowIntent,
  onSelectCreditCard,
  onRequestCreditCard,
  onClose,
  embedded = false,
  onDirtyChange,
  onCanSaveChange,
  onTitleChange,
  onSaveSuccess,
  onConfirmedClose,
}, ref) {
  const {
    data,
    addAsset,
    updateAsset,
    deleteAsset,
    addLiability,
    updateLiability,
    deleteLiability,
    linkBillToLiability,
    addMortgageWithProperty,
    addCarLoanWithVehicle,
    updateLinkedRepaymentOnly,
    saveBnplPlan,
  } = useAppState();
  const { colors, radius, spacing, typography, semantic } = useTheme();
  // Dismissal-lifecycle correction — `kind` shadows the `kindProp` prop with
  // a local, frozen copy used by every render/title/form-identity decision
  // below (unchanged call sites — this is a rename of what `kind` refers
  // to, not a rewrite of its ~25 read sites). Synced from `kindProp` ONLY
  // inside the reset-on-open effect below, which already gates on
  // `if (!visible) return`. Without this, a caller that clears its own
  // routing state in the same synchronous call as onClose() (e.g.
  // FloatingAddButton's `onClose={() => setWealthModal(null)}`, which
  // flips `kind` to `null` on the very next render) would cause this
  // form's own title/type-chip identity to visibly change to a DIFFERENT
  // kind's content while RN's Modal is still genuinely rendering it during
  // the physical dismissal — e.g. an "Add asset" form flashing to "Add
  // Personal Loan" as it closes. Freezing `kind` the same way `liabilityType`/
  // `assetType`/etc. (all local state, already correctly frozen) already
  // were means the outgoing form's identity now stays stable for the whole
  // dismissal, exactly like those other fields already did.
  const [kind, setKind] = useState<'asset' | 'liability' | null>(kindProp);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [interestRate, setInterestRate] = useState('');
  // Only meaningful for type === 'everyday' — the free-text "Bank or
  // provider" field (Everyday Account correction, 2026-08-08).
  const [provider, setProvider] = useState('');
  const [liabilityInterestRate, setLiabilityInterestRate] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('cash');
  // Only meaningful for cash/savings — whether this balance counts toward
  // Available Until Payday and other short-term Money calculations, as
  // distinct from wealth reporting (which always includes it). Defaults
  // per `resolveIncludeInMoneyCalculations` (PRD ask): cash starts
  // included, savings starts excluded until the user opts in.
  const [includeInMoney, setIncludeInMoney] = useState(true);
  const [liabilityType, setLiabilityType] = useState<LiabilityType>('personal_loan');
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentFrequency, setRepaymentFrequency] = useState<PayFrequency>('monthly');
  // Correction pass (repayment-schedule UX fix) — purely cosmetic: whether
  // the user has actually interacted with the frequency chips this session,
  // kept deliberately separate from repaymentScheduleTouched/Complete/
  // Incomplete (the existing, tested validation signals, which must stay
  // driven only by the amount/day/date fields). Without this, the chip row's
  // `active` prop keyed directly on `repaymentFrequency === f.value` made
  // "Monthly" render as selected even on a genuinely untouched, blank
  // schedule, contradicting the helper text ("leave every field blank to
  // skip this for now").
  const [repaymentFrequencyTouched, setRepaymentFrequencyTouched] = useState(false);
  // Never assume a repayment is due today or one month from today (PRD
  // ask, §B4) — the user picks a real day of month, or explicitly defers
  // scheduling it. Both start unset so nothing is silently pre-filled.
  const [repaymentDayOfMonth, setRepaymentDayOfMonth] = useState('');
  // Only meaningful for weekly/fortnightly — a "day of month" can't express
  // a real weekly/fortnightly cadence (mirrors Income's and Bills' own
  // "next due date" picker for the same frequencies, PRD bug report: a
  // fortnightly car loan repayment still asked for "day of month").
  const [repaymentNextDueDate, setRepaymentNextDueDate] = useState<string | null>(null);
  const [propertyLinkMode, setPropertyLinkMode] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [newPropertyValue, setNewPropertyValue] = useState('');
  // Round 6 correction — a new secured-loan asset's own name, entered by
  // the user, never inferred from the liability's name (asset and
  // liability labels are display values, not identity). Persisted as
  // Asset.label on save, replacing the old hardcoded 'Property'/'Car'
  // literal that made every new asset indistinguishable from every other.
  const [newPropertyName, setNewPropertyName] = useState('');
  // Same idea as propertyLinkMode/selectedPropertyId/newPropertyValue, for a
  // car loan's linked vehicle (Asset type 'car') instead of a mortgage's
  // property.
  const [vehicleLinkMode, setVehicleLinkMode] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [newVehicleValue, setNewVehicleValue] = useState('');
  const [newVehicleName, setNewVehicleName] = useState('');
  // Category-first, like the other add flows (PRD ask) — only for a brand
  // new asset with no preset already chosen (most entry points already
  // preset a type, e.g. tapping "Property" on the Wealth Map, so there's
  // nothing to pick). Liabilities keep their existing single-step flow.
  // Design 5.1 Wave 4 — the preliminary "What are you adding?" page is
  // removed. Its ASSET_CARD_GROUPS list (labels, emoji AND descriptions) is
  // now the in-form asset-type selector below, and `onlyLiquidCategories`
  // filters that selector instead of the page — the restriction is carried
  // over intact, not dropped.
  // Stream C correction (Correction 1) — the "select or create for
  // repayment" step. Shown only for liabilityFlowIntent ===
  // 'select_or_create_for_repayment' sessions where at least one same-type
  // liability already exists; skipped entirely (falls straight to a blank
  // create form) otherwise.
  const [showLiabilitySelector, setShowLiabilitySelector] = useState(false);
  // Correction pass (blank-Bill-after-Back-from-loan-handoff fix) — whether
  // the picker above was genuinely offered THIS session, reset once per
  // fresh open/instanceKey by the same effect that computes
  // shouldOfferSelector below. Lets requestEmbeddedClose's own internal
  // Back distinguish "there's a picker step to return to" from "this was
  // always a plain single-step liability entry" without re-deriving
  // shouldOfferSelector's own matching-liabilities lookup a second time.
  const selectorEverShownRef = useRef(false);
  // The liability explicitly chosen from that selector — null means
  // "add a new one" (either the user tapped "+ Add a new X", or no
  // selector was ever shown because none existed, or intent is 'create').
  // Distinct from `editLiability`: this is an in-modal choice for the
  // repayment-scheduling flow, not the caller supplying a specific row to
  // edit.
  const [targetLiabilityId, setTargetLiabilityId] = useState<string | null>(null);
  // Stream C correction (Correction 1, §3) — selecting an existing
  // liability from the repayment selector must only add/update ITS
  // repayment by default; balance/name/asset-link stay locked (read-only)
  // until the user explicitly opts in here. Always true for editLiability
  // (full edit, unrelated flow) and for a brand-new liability (nothing to
  // protect yet).
  const [editingLoanDetails, setEditingLoanDetails] = useState(true);
  // `provider` correction (2026-08-08) — added to the SAME existing
  // snapshot/isDirty contract used by label/value/interestRate, not a
  // second dirty-state mechanism. Only ever non-'' during an 'everyday'
  // session (every reset/type-switch path below clears it back to '');
  // for liability and every non-everyday asset session it stays '' on
  // both sides of the comparison, so the added clause is a safe no-op
  // there, exactly like interestRate's existing comparison already is for
  // liability sessions.
  const initialSnapshot = useRef({ label: '', value: '', interestRate: '', provider: '' });
  // Synchronous double-submission guard (Stream C correction). A ref, not
  // state — state only takes effect on the next render, so two Save taps
  // landing in the same tick (or the second landing during the brief window
  // before onClose()'s parent state update actually hides this modal) would
  // both read a stale `false` and both proceed, each independently creating
  // a new liability/asset/bill. Checked and set synchronously at the very
  // top of the actual submission attempt in handleSave — set BEFORE any
  // transition/persistence action is called, and NEVER cleared inside
  // handleSave itself on the success path (clearing it there would reopen
  // exactly the same modal-close-timing race this guard exists to close;
  // it IS cleared in handleSave's own catch block — see Issue 6 below).
  // Reset only in the reset-on-open effect, i.e. only when a genuinely new
  // form session begins (opening fresh, opening to edit a different item,
  // or reopening after close) — never for a re-render of the same open
  // session.
  const submittingRef = useRef(false);
  // First-accepted-tap-wins deferred credit-card handoff (Stream D, D1,
  // corrected). On iOS, runPendingCreditCardHandoff is passed to
  // KeyboardSheet's onDismiss — the real native Modal dismissal-complete
  // event, no timer involved. RN never calls onDismiss on Android, so
  // ccHandoffTimerRef below is an Android-only fallback there, owned by
  // this ref, cleared before every reschedule and on unmount. visible is
  // intentionally NOT a trigger for clearing the guard/pending state — the
  // selection must survive the visible prop turning false so it can still
  // be delivered once the real iOS onDismiss (or the Android fallback)
  // fires shortly after.
  const ccHandoffInProgressRef = useRef(false);
  const ccHandoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stream D, Option B runtime spike: KeyboardSheet's animationType for its
  // NEXT dismissal transition. Stays 'slide' for every ordinary close
  // (Cancel/backdrop/swipe/Android-Back). The credit-card type-chip
  // handler below flips it to 'none' and calls onClose() synchronously in
  // the same handler, so React batches both into the same commit — the
  // native Modal (owned by KeyboardSheet) receives animationType='none'
  // and visible=false together, making that one dismissal instant instead
  // of animated. Must NOT be reset merely because `visible` became false —
  // see runPendingCreditCardHandoff() and the fresh-open effect below for
  // the only two places it resets.
  const [dismissAnimationType, setDismissAnimationType] = useState<'slide' | 'none'>('slide');
  // Stream C correction (Issue 6), Round-5 correction (Issue 1) — if the
  // guarded mutation below ever throws OR the production transition
  // reports `applied: false` (an update target that no longer exists,
  // resolved to the wrong liability type, or found more than one exact-
  // linked repayment — see LiabilityTransitionTarget's and
  // upsertLinkedRecurringItem's doc comments in AppStateContext.tsx), the
  // guard must not leave the form permanently unresponsive: submittingRef
  // is reset so Save is tappable again, and this surfaces the EXACT reason
  // (not one generic string) as a brief inline error. Never auto-retried —
  // only a deliberate subsequent tap re-attempts the save, which the guard
  // still protects against duplicating.
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const isNewLoan = kind === 'liability' && SMART_LOAN_TYPES.includes(liabilityType) && !editLiability;
  // Everyday Account correction (2026-08-08) — Cash/Savings/Everyday
  // Account share this one balance-entry branch and must use the SAME
  // strict, zero-allowing parser (never diverge within the shared branch).
  // Every OTHER asset type (etf/property/etc.) and every liability keep
  // the existing, unchanged parseFloat-based validation — this is a
  // narrowly scoped parser swap, not a redesign of Asset/Liability
  // storage or validation generally.
  const usesStrictLiquidParser = kind === 'asset' && LIQUID_BALANCE_TYPES.includes(assetType);
  const parsedLiquidValue = usesStrictLiquidParser ? parseMoneyInputAllowZero(value) : null;
  // A mortgage can be secured against a property (PRD ask: "$1M property,
  // $500k mortgage" is a very different picture than "$500k unsecured
  // debt"). New properties are only created on the add-mortgage path — the
  // atomic addMortgageWithProperty call needs a single persist(), and
  // editing an existing liability already has that guarantee via
  // updateLiability, so editing only re-links to an existing property.
  const isMortgage = kind === 'liability' && liabilityType === 'mortgage';
  // Same idea as isMortgage/propertyAssets, generalized to car loans and
  // their linked vehicle — new vehicles are only created on the add-car-
  // loan path via the atomic addCarLoanWithVehicle call, for the same
  // single-persist() reason.
  const isCarLoan = kind === 'liability' && liabilityType === 'car_loan';
  // BNPL is deliberately NOT a SMART_LOAN_TYPES member (no asset link, no
  // equity view, no "select or create for repayment" wizard) — a single-
  // step create/edit form, closer in shape to Personal Loan/Other, but with
  // its own optional-schedule contract (reusing the identical repayment
  // fields/validation smart loans already use) and its own required-
  // positive-balance-for-new-plans rule.
  const isBnpl = kind === 'liability' && liabilityType === 'bnpl';
  const parsedBnplBalance = isBnpl ? parseMoneyInputAllowZero(value) : null;
  const propertyAssets = data.assets.filter((a) => a.type === 'property');
  const vehicleAssets = data.assets.filter((a) => a.type === 'car');
  const usesRepaymentDayOfMonth = repaymentFrequency === 'monthly';
  // Correction pass — replaces the removed "I'll add the repayment
  // schedule later" checkbox with an explicit optional-schedule contract:
  // blank saves the liability with no linked bill; ANY field entered
  // requires the full set (amount + day-of-month or next-date, depending
  // on frequency) before Save is allowed; a complete set always creates or
  // updates exactly one linked bill. "Touched" reads only the two fields
  // that start genuinely blank (amount, day/date) — frequency always has a
  // valid default and is never itself evidence the user began a schedule.
  const repaymentScheduleTouched = repaymentAmount.trim().length > 0 || repaymentDayOfMonth.trim().length > 0 || repaymentNextDueDate !== null;
  const repaymentScheduleComplete = (() => {
    const repaymentValue = parseFloat(repaymentAmount);
    const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
    return !isNaN(repaymentValue) && repaymentValue > 0 && (usesRepaymentDayOfMonth ? repaymentDayValue >= 1 && repaymentDayValue <= 31 : !!repaymentNextDueDate);
  })();
  // BNPL reuses this same all-or-nothing contract, but — unlike smart loans
  // — the check applies on EDIT too (a smart loan never supports removing
  // an existing schedule via this form, so touching it while editing
  // already can't reach an incomplete state there; BNPL's edit form is
  // reused for adding/editing/clearing a schedule on an existing plan, so
  // a partially-cleared schedule must still block Save).
  const repaymentScheduleIncomplete = (isNewLoan || isBnpl) && repaymentScheduleTouched && !repaymentScheduleComplete;
  const resolvedIntent = liabilityFlowIntent ?? 'create';
  // The exact liability this session is updating (via the repayment
  // selector), if any — distinct from editLiability. Its own existing
  // linked asset / repayment bill drive the locked-details summary and the
  // "already has a repayment" copy below.
  const targetLiability = targetLiabilityId ? data.liabilities.find((l) => l.id === targetLiabilityId) ?? null : null;
  const targetHasExistingRepayment = targetLiability ? data.recurringItems.some((r) => r.linkedLiabilityId === targetLiability.id) : false;
  // VID-001 correction — the single source of truth for whether the
  // target's linked repayment can be safely prefilled (exactly one match)
  // or must instead block the whole repayment-update session (more than
  // one match, an already-anomalous state). Recomputed fresh every render
  // from live data, so it can never drift from what chooseExistingLiability
  // ForRepayment prefilled at selection time.
  const linkedRepaymentLookup = targetLiability ? findLinkedRepayment(data.recurringItems, targetLiability.id) : null;
  const hasAmbiguousLinkedRepayment = linkedRepaymentLookup?.status === 'ambiguous';
  // BNPL edits directly via editLiability (never via the smart-loan
  // targetLiability wizard above), so it needs its own ambiguity check keyed
  // the same way — the safest narrow behaviour for corrupted/legacy data
  // with more than one active linked item: suppress the schedule form,
  // block Save, and surface a recoverable "check repayment details" state,
  // never silently pick one or project against the full outstanding balance
  // twice (see resolveBnplLinkedItems's doc comment in bnpl.ts).
  const editLiabilityRepaymentLookup = isBnpl && editLiability ? findLinkedRepayment(data.recurringItems, editLiability.id) : null;
  const hasAmbiguousBnplRepayment = editLiabilityRepaymentLookup?.status === 'ambiguous';
  // Correction pass (existing linked-schedule safety) — no atomic "detach
  // this bill, keep the liability" transition exists yet (upsertLinkedRecurringItem
  // in AppStateContext.tsx is an unconditional no-op when handed no
  // recurringItem, and no other liability transition supports removal
  // either). Clearing the local form fields never touches the real linked
  // RecurringItem, so offering "Clear repayment details" here — for a
  // target with a real, already-saved linked repayment — would let the
  // form visually show "no schedule" while that bill keeps affecting Money
  // calculations undisclosed. Editing individual fields and Save is
  // unaffected (that already correctly updates the same linked bill via
  // updateLinkedRepaymentOnly); only the "clear to blank" affordance is
  // hidden. Safe atomic removal is tracked as a separate backlog item, not
  // implemented this round.
  const hasSavedLinkedRepayment = !!targetLiabilityId && linkedRepaymentLookup?.status === 'one';
  const targetLinkedAssetLabel = targetLiability
    ? targetLiability.type === 'car_loan' && targetLiability.linkedVehicleAssetId
      ? data.assets.find((a) => a.id === targetLiability.linkedVehicleAssetId)?.label ?? null
      : targetLiability.type === 'mortgage' && targetLiability.linkedPropertyAssetId
      ? data.assets.find((a) => a.id === targetLiability.linkedPropertyAssetId)?.label ?? null
      : null
    : null;
  // Loan-detail fields (name/balance/rate/asset-link) are locked to the
  // selected target's own values, editable only once the user explicitly
  // opts in via "Edit loan details" — never for a brand-new liability or a
  // direct row-tap edit, where there's nothing to protect.
  const loanDetailsLocked = !!targetLiabilityId && !editLiability && !editingLoanDetails;

  function prefillFromLiability(l: Liability) {
    setLabel(l.label);
    setValue(String(l.currentBalance));
    setLiabilityInterestRate(l.interestRate ? String(Math.round(l.interestRate * 10000) / 100) : '');
    setPropertyLinkMode(l.linkedPropertyAssetId ? 'existing' : 'none');
    setSelectedPropertyId(l.linkedPropertyAssetId ?? null);
    setNewPropertyValue('');
    setNewPropertyName('');
    setVehicleLinkMode(l.linkedVehicleAssetId ? 'existing' : 'none');
    setSelectedVehicleId(l.linkedVehicleAssetId ?? null);
    setNewVehicleValue('');
    setNewVehicleName('');
    initialSnapshot.current = { ...initialSnapshot.current, label: l.label, value: String(l.currentBalance) };
  }

  function resetLiabilityFieldsBlank() {
    setLabel('');
    setValue('');
    setLiabilityInterestRate('');
    setPropertyLinkMode('none');
    setSelectedPropertyId(null);
    setNewPropertyValue('');
    setNewPropertyName('');
    setVehicleLinkMode('none');
    setSelectedVehicleId(null);
    setNewVehicleValue('');
    setNewVehicleName('');
    initialSnapshot.current = { ...initialSnapshot.current, label: '', value: '' };
  }

  // Correction pass (parked-draft-loss fix) — both picker-row handlers below
  // used to overwrite this form's own draft fields (label/value/interestRate/
  // asset links/repayment fields) unconditionally, even when a dirty,
  // unsaved draft from an earlier "Add a new X" session was already sitting
  // here in this same mounted instance. That's reachable specifically
  // because the host's own same-type-reselect guard (AddAnythingSheet.tsx)
  // correctly re-enters this exact instance without resetting anything,
  // leaving these two handlers as the only remaining place that could still
  // silently destroy it. Reuses the existing isDirty signal below (declared
  // later in the file, but only ever read once these handlers are actually
  // invoked from an event, by which point the full render — and isDirty's
  // assignment — has already completed) rather than inventing a second dirty
  // check. "Keep editing" restores the parked draft directly (hides the
  // selector; nothing else has been mutated yet at that point) rather than
  // being a no-op, satisfying "re-entering must restore the parked form
  // directly."
  function confirmPickerSelectionIfDirty(onDiscard: () => void) {
    if (!isDirty) {
      onDiscard();
      return;
    }
    Alert.alert(
      `Discard this ${LIABILITY_DISPLAY_NAME[liabilityType]}?`,
      `Your unsaved ${LIABILITY_DISPLAY_NAME[liabilityType]} details will be lost.`,
      [
        { text: 'Keep editing', style: 'cancel', onPress: () => setShowLiabilitySelector(false) },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ]
    );
  }

  // Stream C correction (Correction 1) — the "select or create for
  // repayment" step's own choice handlers.
  function chooseExistingLiabilityForRepayment(l: Liability) {
    confirmPickerSelectionIfDirty(() => {
      setTargetLiabilityId(l.id);
      setEditingLoanDetails(false);
      prefillFromLiability(l);
      // VID-001 correction — prefillFromLiability only ever populated the
      // LIABILITY's own fields (balance/rate/link); the repayment amount/
      // frequency/day/date live entirely on a separate, linked RecurringItem
      // and were never read here, so this "Update" form previously always
      // rendered them blank even when a correct schedule already existed.
      // Exactly one linked match: prefill it. Zero matches: leave blank — a
      // genuine first-ever schedule. More than one match: also leave blank
      // here (never guess which one) — hasAmbiguousLinkedRepayment blocks
      // the session below instead.
      const lookup = findLinkedRepayment(data.recurringItems, l.id);
      if (lookup.status === 'one') {
        const prefill = prefillValuesFromRepayment(lookup.repayment);
        setRepaymentAmount(prefill.amount);
        setRepaymentFrequency(prefill.frequency);
        setRepaymentDayOfMonth(prefill.dayOfMonth);
        setRepaymentNextDueDate(prefill.nextDueDate);
        setRepaymentFrequencyTouched(true);
      } else {
        setRepaymentAmount('');
        setRepaymentFrequency('monthly');
        setRepaymentDayOfMonth('');
        setRepaymentNextDueDate(null);
        setRepaymentFrequencyTouched(false);
      }
      setShowLiabilitySelector(false);
    });
  }
  function chooseAddNewLiabilityForRepayment() {
    confirmPickerSelectionIfDirty(() => {
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
      resetLiabilityFieldsBlank();
      setShowLiabilitySelector(false);
    });
  }

  function chooseRepaymentFrequency(f: PayFrequency) {
    setRepaymentFrequency(f);
    setRepaymentFrequencyTouched(true);
    // Switching frequency invalidates whatever day/date was picked under
    // the old schedule (same rule Income and Bills already follow).
    setRepaymentDayOfMonth('');
    setRepaymentNextDueDate(null);
  }

  // Correction pass (repayment-schedule contract) — returns the section to
  // its blank state, matching the required "Clear repayment details"
  // affordance. Purely local to this form session: it does not delete or
  // touch any already-saved linked repayment on its own — only Save,
  // afterwards, decides what (if anything) to persist, exactly like every
  // other field in this form.
  function clearRepaymentSchedule() {
    setRepaymentAmount('');
    setRepaymentFrequency('monthly');
    setRepaymentFrequencyTouched(false);
    setRepaymentDayOfMonth('');
    setRepaymentNextDueDate(null);
  }

  const isEditing = !!(editAsset || editLiability);
  const isDirty =
    label !== initialSnapshot.current.label ||
    value !== initialSnapshot.current.value ||
    interestRate !== initialSnapshot.current.interestRate ||
    provider !== initialSnapshot.current.provider;

  useEffect(() => {
    if (!visible) return;
    // A genuinely new form session — see submittingRef's own comment for
    // why this is the only place it's ever cleared.
    submittingRef.current = false;
    // Reset before the branches below — only the 'create' branch's own
    // shouldOfferSelector computation (further down) may set this true
    // again; editAsset/editLiability sessions never offer this picker.
    selectorEverShownRef.current = false;
    // Sync the frozen `kind` (see its own declaration comment above) from
    // the live `kindProp` — only reachable here, past the `!visible` guard,
    // so a close that clears the caller's own routing state can never pull
    // this form's rendered identity out from under it mid-dismissal.
    setKind(kindProp);
    // A fresh open must never carry over a stale in-progress credit-card
    // handoff (Stream D, D1) or non-animated dismissal override (Stream D,
    // Option B) from a previous time this sheet was shown.
    ccHandoffInProgressRef.current = false;
    setDismissAnimationType('slide');
    setSaveErrorMessage(null);
    if (editAsset) {
      setLabel(editAsset.label);
      setValue(String(editAsset.currentValue));
      setAssetType(editAsset.type);
      const rate = editAsset.interestRate ? String(Math.round(editAsset.interestRate * 10000) / 100) : '';
      setInterestRate(rate);
      const editProvider = editAsset.provider ?? '';
      setProvider(editProvider);
      setIncludeInMoney(resolveIncludeInMoneyCalculations(editAsset));
      initialSnapshot.current = { label: editAsset.label, value: String(editAsset.currentValue), interestRate: rate, provider: editProvider };
      setShowLiabilitySelector(false);
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
    } else if (editLiability) {
      // CORRECTION 1, "EDIT LIABILITY" — targets the supplied exact id
      // only; never selects/preselects any other liability by type.
      setLabel(editLiability.label);
      setValue(String(editLiability.currentBalance));
      setLiabilityType(editLiability.type);
      setLiabilityInterestRate(editLiability.interestRate ? String(Math.round(editLiability.interestRate * 10000) / 100) : '');
      setPropertyLinkMode(editLiability.linkedPropertyAssetId ? 'existing' : 'none');
      setSelectedPropertyId(editLiability.linkedPropertyAssetId ?? null);
      setNewPropertyValue('');
      setNewPropertyName('');
      setVehicleLinkMode(editLiability.linkedVehicleAssetId ? 'existing' : 'none');
      setSelectedVehicleId(editLiability.linkedVehicleAssetId ?? null);
      setNewVehicleValue('');
      setNewVehicleName('');
      // BNPL — unlike the smart-loan types, whose repayment editing only
      // happens via the separate "select or create for repayment" wizard
      // (targetLiability-based, not editLiability-based), BNPL's schedule
      // is edited directly here, so it must be prefilled from whatever is
      // currently linked (mirrors chooseExistingLiabilityForRepayment's own
      // prefill logic exactly — same lookup, same prefill helper).
      const editLiabilityProvider = editLiability.type === 'bnpl' ? editLiability.provider ?? '' : '';
      setProvider(editLiabilityProvider);
      if (editLiability.type === 'bnpl') {
        const lookup = findLinkedRepayment(data.recurringItems, editLiability.id);
        if (lookup.status === 'one') {
          const prefill = prefillValuesFromRepayment(lookup.repayment);
          setRepaymentAmount(prefill.amount);
          setRepaymentFrequency(prefill.frequency);
          setRepaymentDayOfMonth(prefill.dayOfMonth);
          setRepaymentNextDueDate(prefill.nextDueDate);
          setRepaymentFrequencyTouched(true);
        } else {
          setRepaymentAmount('');
          setRepaymentFrequency('monthly');
          setRepaymentDayOfMonth('');
          setRepaymentNextDueDate(null);
          setRepaymentFrequencyTouched(false);
        }
      }
      initialSnapshot.current = {
        label: editLiability.label,
        value: String(editLiability.currentBalance),
        interestRate: '',
        provider: editLiabilityProvider,
      };
      setShowLiabilitySelector(false);
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
    } else {
      setInterestRate('');
      setProvider('');
      setAssetType(presetAssetType ?? 'cash');
      setIncludeInMoney(
        forcedIncludeInMoneyDefault ?? resolveIncludeInMoneyCalculations({ type: presetAssetType ?? 'cash', includeInMoneyCalculations: undefined })
      );
      const resolvedType = presetLiabilityType ?? 'personal_loan';
      setLiabilityType(resolvedType);
      setRepaymentAmount('');
      setRepaymentFrequency('monthly');
      setRepaymentFrequencyTouched(false);
      setRepaymentDayOfMonth('');
      setRepaymentNextDueDate(null);
      resetLiabilityFieldsBlank();
      setLabel('');
      setValue('');
      initialSnapshot.current = { label: '', value: '', interestRate: '', provider: '' };
      // CORRECTION 1, "SELECT OR CREATE FOR REPAYMENT" — only for the
      // explicit intent, and only when at least one same-type liability
      // already exists; otherwise (0 existing, or intent is 'create')
      // this falls straight through to a blank "Add [Type]" form, exactly
      // like every other liability type already worked.
      // Reads kindProp (the live prop), not the local `kind` — `setKind`
      // above hasn't taken effect yet within this same synchronous callback
      // (React state updates apply on the next render), so `kind` here
      // would still be the PREVIOUS session's frozen value. This effect is
      // exactly where fresh state is established FROM the live prop.
      const matching = kindProp === 'liability' ? data.liabilities.filter((l) => l.type === resolvedType) : [];
      const shouldOfferSelector = kindProp === 'liability' && (liabilityFlowIntent ?? 'create') === 'select_or_create_for_repayment' && matching.length > 0;
      setShowLiabilitySelector(shouldOfferSelector);
      selectorEverShownRef.current = shouldOfferSelector;
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
    }
    // data.liabilities is read only to decide whether to offer the
    // selector on open — deliberately not a dependency, matching the
    // established convention for this effect (it always reflects data at
    // the moment the effect fires, via closure, same as every other field
    // here that reads `data`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, kindProp, editAsset, editLiability, presetAssetType, presetLiabilityType, liabilityFlowIntent]);

  useEffect(() => {
    return () => {
      if (ccHandoffTimerRef.current) clearTimeout(ccHandoffTimerRef.current);
    };
  }, []);

  // Invoked once either the real iOS onDismiss fires or the Android
  // fallback timer elapses. Fires on EVERY dismissal (Cancel/backdrop/
  // swipe/back included, since KeyboardSheet's onDismiss is unconditional
  // once wired) — ccHandoffInProgressRef doubles as the "is a handoff
  // actually pending" check, so an ordinary dismissal with no credit-card
  // tap ever having occurred is always a safe no-op here.
  function runPendingCreditCardHandoff() {
    if (!ccHandoffInProgressRef.current) return;
    ccHandoffInProgressRef.current = false;
    onSelectCreditCard?.();
    // Reset only now that the pending handoff has been delivered and this
    // sheet's own native dismissal is already complete (that's what
    // triggered this function) — never merely on `visible` becoming false.
    setDismissAnimationType('slide');
  }

  /**
   * Wave 7 correction C — the debt-type handler.
   *
   * Every branch below is the chip handler's own, moved verbatim. The
   * credit-card path in particular is untouched: embedded hands off
   * synchronously to the host's route controller; standalone takes the
   * first-accepted-tap-wins deferred handoff, skipping the animated
   * dismissal in the same synchronous call as onClose(), with the Android
   * fallback timer that exists because RN never fires onDismiss there.
   *
   * Dirty data is NOT silently erased. Switching type keeps whatever the
   * customer has entered, exactly as the chips did — the form's own
   * existing discard guard (`Discard this ...?`) still owns the one place
   * where entered detail can be lost, and this pass does not weaken it.
   */
  function chooseLiabilityType(type: LiabilityType) {
    if (type === 'credit_card') {
      if (embedded) {
        onRequestCreditCard?.();
        return;
      }
      if (ccHandoffInProgressRef.current) return;
      ccHandoffInProgressRef.current = true;
      setDismissAnimationType('none');
      onClose();
      if (Platform.OS === 'android') {
        if (ccHandoffTimerRef.current) clearTimeout(ccHandoffTimerRef.current);
        ccHandoffTimerRef.current = setTimeout(runPendingCreditCardHandoff, CREDIT_CARD_HANDOFF_DEFER_MS);
      }
      return;
    }
    setLiabilityType(type);
  }

  function chooseAssetCategory(type: AssetType) {
    setAssetType(type);
    setIncludeInMoney(forcedIncludeInMoneyDefault ?? resolveIncludeInMoneyCalculations({ type, includeInMoneyCalculations: undefined }));
    // `provider` correction — only ever meaningful for 'everyday'; switching
    // to any other type (or back to 'everyday' from one) must never retain a
    // stale value from whatever type was previously selected. Identical to
    // the type-chip handler's own reset, which this now shares.
    setProvider('');
  }

  // Round 6 correction — creating a brand-new secured-loan asset (never an
  // existing/not-linked selection, and never while loan details are
  // locked, which hides these fields entirely) now requires its own
  // non-blank name, so Save cannot silently persist another generic
  // "Property"/"Car" record.
  const requiresNewPropertyName = isMortgage && !loanDetailsLocked && propertyLinkMode === 'new';
  const requiresNewVehicleName = isCarLoan && !loanDetailsLocked && vehicleLinkMode === 'new';
  const canSave =
    label.trim().length > 0 &&
    (usesStrictLiquidParser
      ? !!parsedLiquidValue?.valid
      : isBnpl
      ? // Strict shared money parser (never parseFloat) — allows a genuine
        // $0 balance only when EDITING an already-existing plan (a manual
        // correction toward payoff); a brand-new plan requires a real,
        // strictly positive outstanding balance (approved product scope §1).
        !!parsedBnplBalance?.valid && (!!editLiability || parsedBnplBalance.amount > 0)
      : !isNaN(parseFloat(value))) &&
    (!requiresNewPropertyName || newPropertyName.trim().length > 0) &&
    (!requiresNewVehicleName || newVehicleName.trim().length > 0) &&
    // VID-001 correction — an ambiguous linked repayment must block Save
    // entirely, not merely rely on the reactive duplicate_linked_repayment
    // guard inside updateLinkedRepaymentOnlyTransition, which never even
    // runs when the submitted repaymentPayload is undefined (a blank
    // repayment session is a safe no-op there, not a duplicate check).
    // Gating canSave here — checked both by the Save button's own
    // `disabled` and defensively again at the top of performSave — is what
    // actually guarantees this session can never mutate the liability or
    // its linked recurring item while ambiguous, regardless of what (if
    // anything) the user types.
    !hasAmbiguousLinkedRepayment &&
    !hasAmbiguousBnplRepayment &&
    // Correction pass (repayment-schedule contract) — a PARTIALLY entered
    // schedule (e.g. an amount with no frequency/date yet) must block Save
    // with inline validation rather than either silently discarding it
    // (the old "later" checkbox's effect) or silently persisting an
    // incomplete one. A genuinely blank schedule, or a genuinely complete
    // one, both leave this true.
    !repaymentScheduleIncomplete;
  const title =
    kind === 'asset'
      ? assetType === 'savings'
        ? isEditing
          ? 'Update savings account'
          : 'Add savings account'
        : assetType === 'cash'
        ? isEditing
          ? 'Update cash account'
          : 'Add cash account'
        : assetType === 'everyday'
        ? isEditing
          ? 'Update everyday account'
          : 'Add everyday account'
        : isEditing
        ? 'Edit asset'
        : 'Add asset'
      : // Full-workspace extension — computed here too (not just inline in
      // the selector step's own standalone KeyboardSheet below) so an
      // embedded session's onTitleChange reports the exact same string via
      // one single source of truth, never a second copy that could drift.
      showLiabilitySelector
      ? `Which ${LIABILITY_DISPLAY_NAME[liabilityType]} is this repayment for?`
      : editLiability
      ? `Edit ${LIABILITY_DISPLAY_NAME[liabilityType]}`
      : targetLiabilityId
      ? `Update ${LIABILITY_DISPLAY_NAME[liabilityType]}`
      : `Add ${LIABILITY_DISPLAY_NAME[liabilityType]}`;

  // Used for KeyboardSheet's own onClose prop — its internal swipe/tap-
  // outside handlers already gate on `isDirty` before calling this, so
  // this must stay a raw close (no second confirmation).
  function handleClose() {
    onClose();
  }

  // Used by the footer Cancel button, a separate dismiss path that bypasses
  // KeyboardSheet's gesture handling entirely — needs its own gate.
  function requestCancel() {
    confirmDiscardIfDirty(isDirty, onClose);
  }

  // Navigation Transitions, Option B pilot — the embedded host's ref-
  // exposed close, invoked by its own Back/Cancel controls (never by this
  // form's own now-unreachable-when-embedded KeyboardSheet gesture
  // handling, since no KeyboardSheet is rendered in that branch at all).
  // 'back' never discards — the embedded host preserves this session's
  // draft across an in-session Back, so nothing is lost and no confirmation
  // is appropriate; every other reason applies the same "Discard changes?"
  // gate requestCancel already uses for the standalone Cancel button.
  function requestEmbeddedClose(reason: AddWealthItemCloseReason) {
    if (reason === 'back') {
      // Correction pass (blank-Bill-after-Back-from-loan-handoff fix) —
      // this form's own internal "which existing X is this for?" picker,
      // once offered, is itself a real navigation step with its own Back
      // target: a session that picked a row OR "Add a new X" and is now on
      // the ordinary details form must Back INTERNALLY to that picker
      // first, never straight out to the host. Only once genuinely ON the
      // picker (or when it was never offered this session at all —
      // liabilityFlowIntent 'create', the ordinary single-step liability
      // entry) does Back forward to the host's own generic handleBack,
      // exactly like every other single-step embedded destination. Modeled
      // as an explicit step (selectorEverShownRef + showLiabilitySelector),
      // not a remount or a deferred/timed close — the picker's own list and
      // the "Add a new X" details form are simply two states of the one
      // already-mounted instance, so returning to it is instant and keeps
      // whatever was on it.
      if (kind === 'liability' && selectorEverShownRef.current && !showLiabilitySelector) {
        setShowLiabilitySelector(true);
        return;
      }
      onConfirmedClose?.(reason);
      return;
    }
    confirmDiscardIfDirty(isDirty, () => onConfirmedClose?.(reason));
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: requestEmbeddedClose,
  }));

  // Navigation Transitions, Option B pilot — mirrored every render
  // regardless of `embedded` (matching TransferForm's own established,
  // no-op-if-omitted mirroring pattern), so the embedded host's own
  // KeyboardSheet chrome (title/isDirty-gated dismissal/Save-enabled state)
  // always reflects this form's real, live values.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);
  useEffect(() => {
    onTitleChange?.(title);
  }, [title, onTitleChange]);

  // Round-6 correction (Group E) — the Round-5 disclosure step is removed
  // entirely: the current data model has no field distinguishing an
  // unlinked LOAN repayment from an ordinary unlinked bill (rent,
  // Internet, subscriptions), so any candidate list built from
  // `!linkedLiabilityId` alone is structurally over-broad and falsely
  // implies Navilo detected a specific duplicate. `wouldCreateNewLinkedRepayment`
  // is kept only to gate a small NON-BLOCKING reminder (rendered inline in
  // the form below, never a separate screen) — true only for "select or
  // create for repayment" sessions genuinely about to create a brand-new
  // linked repayment (never for editLiability or an already-selected
  // target). It names no record, lists nothing, and never prevents Save.
  function wouldCreateNewLinkedRepayment(): boolean {
    if (kind !== 'liability' || editLiability || targetLiabilityId) return false;
    if (resolvedIntent !== 'select_or_create_for_repayment' || !SMART_LOAN_TYPES.includes(liabilityType)) return false;
    return repaymentScheduleComplete;
  }

  function handleSave() {
    performSave();
  }

  function performSave() {
    // Everyday Account correction (2026-08-08) — Cash/Savings/Everyday
    // Account go through the strict, zero-allowing parser; canSave above
    // has already verified parsedLiquidValue.valid for this branch, so
    // `.amount` is safe here without a redundant NaN check.
    const amount = usesStrictLiquidParser && parsedLiquidValue?.valid ? parsedLiquidValue.amount : parseFloat(value);
    if (!canSave) return;
    // Must be checked+set synchronously before anything else in this
    // function touches state or calls a persistence action — see
    // submittingRef's declaration comment.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaveErrorMessage(null);
    try {
      if (kind === 'asset') {
        const rateValue = parseFloat(interestRate);
        // Everyday Account has no interest-rate field (per the MVP form
        // spec) — deliberately NOT added to this gate.
        const interestRatePayload =
          (assetType === 'cash' || assetType === 'savings') && !isNaN(rateValue) && rateValue >= 0 ? rateValue / 100 : undefined;
        // Everyday Account correction — the "Count this balance in
        // available money" toggle also applies to 'everyday', reusing
        // LIQUID_BALANCE_TYPES so this stays in lockstep with the JSX gate
        // and the strict-parser gate above.
        const includeInMoneyPayload = LIQUID_BALANCE_TYPES.includes(assetType) ? includeInMoney : undefined;
        const providerPayload = assetType === 'everyday' ? provider.trim() || undefined : undefined;
        if (editAsset) {
          updateAsset(editAsset.id, {
            type: assetType,
            label: label.trim(),
            currentValue: amount,
            interestRate: interestRatePayload,
            includeInMoneyCalculations: includeInMoneyPayload,
            provider: providerPayload,
          });
        } else {
          addAsset({
            type: assetType,
            label: label.trim(),
            currentValue: amount,
            interestRate: interestRatePayload,
            includeInMoneyCalculations: includeInMoneyPayload,
            provider: providerPayload,
          });
        }
      } else if (kind === 'liability' && isBnpl) {
        // BNPL — a single atomic transition, never the smart-loan
        // target/wizard machinery above (no asset link, no equity view).
        // canSave has already verified parsedBnplBalance.valid (and, for a
        // new plan, .amount > 0) — safe to use directly here.
        if (!parsedBnplBalance?.valid) return; // canSave already guarantees this; defensive only.
        const bnplBalance = parsedBnplBalance.amount;
        const bnplProviderPayload = provider.trim() || undefined;
        const schedule: BnplScheduleInput | 'remove' | undefined = repaymentScheduleComplete
          ? {
              amount: parseFloat(repaymentAmount),
              frequency: repaymentFrequency,
              nextDueDate: usesRepaymentDayOfMonth ? nextOccurrenceFromDay(parseInt(repaymentDayOfMonth, 10)) : (repaymentNextDueDate as string),
            }
          : editLiability
          ? 'remove'
          : undefined;
        const result = editLiability
          ? saveBnplPlan({
              mode: 'update',
              liabilityId: editLiability.id,
              liability: { label: label.trim(), provider: bnplProviderPayload, currentBalance: bnplBalance },
              schedule: schedule as 'unchanged' | 'remove' | BnplScheduleInput,
              newRecurringItemId: generateId(),
            })
          : saveBnplPlan({
              mode: 'create',
              liability: { label: label.trim(), provider: bnplProviderPayload, currentBalance: bnplBalance },
              schedule: schedule as BnplScheduleInput | undefined,
              ids: { liabilityId: generateId(), recurringItemId: generateId() },
            });
        if (!result.applied) throw new LiabilityFailure(result.reason);
      } else if (kind === 'liability') {
        const liabRateValue = parseFloat(liabilityInterestRate);
        const liabInterestRatePayload = !isNaN(liabRateValue) && liabRateValue >= 0 ? liabRateValue / 100 : undefined;
        if (editLiability) {
          // CORRECTION 1, "EDIT LIABILITY" — exact-id update, unchanged
          // from prior behaviour.
          updateLiability(editLiability.id, {
            type: liabilityType,
            label: label.trim(),
            currentBalance: amount,
            interestRate: liabInterestRatePayload,
            linkedPropertyAssetId: isMortgage && propertyLinkMode === 'existing' ? selectedPropertyId ?? undefined : undefined,
            linkedVehicleAssetId: isCarLoan && vehicleLinkMode === 'existing' ? selectedVehicleId ?? undefined : undefined,
          });
        } else {
          // CORRECTION 2 — the exact target contract: 'create' always gets
          // a freshly generated id; 'update' carries the exact id the user
          // explicitly selected from the repayment selector. Generated
          // once, as plain calls, right here at the moment of actual
          // submission — never inside a setState updater, never
          // regenerated on a subsequent render.
          const target: { mode: 'create'; liabilityId: string } | { mode: 'update'; liabilityId: string } = targetLiabilityId
            ? { mode: 'update', liabilityId: targetLiabilityId }
            : { mode: 'create', liabilityId: generateId() };
          // Loan-details lock (Correction 1 §3) — while locked, the
          // liability payload is the target's OWN current values, never
          // whatever might be sitting in the (hidden, disabled) form
          // fields, so a repayment-only submission can never drift the
          // balance/name/link.
          const liabilityPayload =
            loanDetailsLocked && targetLiability
              ? { label: targetLiability.label, currentBalance: targetLiability.currentBalance, interestRate: targetLiability.interestRate }
              : { label: label.trim(), currentBalance: amount, interestRate: liabInterestRatePayload };
          // Unified across all three branches below (Round-5 simplification
          // that also fixed a latent inconsistency: the repayment-only path
          // needs the identical computation the isMortgage/isCarLoan/else
          // branches already had, so it is now computed once). Only creates
          // a repayment definition once the user has actually entered a
          // complete schedule (reuses the same repaymentScheduleComplete
          // canSave already gates on) — never silently assumes "due one
          // month from today" (PRD bug report, §B4). A genuinely blank
          // schedule leaves any already-scheduled repayment untouched,
          // exactly as the removed "I'll add this later" checkbox did.
          const repaymentValue = parseFloat(repaymentAmount);
          const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
          const hasRepaymentSchedule = SMART_LOAN_TYPES.includes(liabilityType) && repaymentScheduleComplete;
          const repaymentPayload = hasRepaymentSchedule
            ? {
                type: 'expense' as const,
                // CORRECTION 5 — distinguishable automatic repayment names
                // ("[Liability name] repayment"), never a static per-type
                // string.
                label: `${liabilityPayload.label} repayment`,
                amount: repaymentValue,
                frequency: repaymentFrequency,
                nextDueDate: usesRepaymentDayOfMonth ? nextOccurrenceFromDay(repaymentDayValue) : (repaymentNextDueDate as string),
                isFixed: true,
                active: true,
                // Mortgage gets the filled 'home' icon (never the outline
                // icon Rent uses — a mortgage bill must never be visually
                // confused with rent, PRD bug report §B4); Car Loan matches
                // AddRecurringItemModal's own "Car Loan" preset icon
                // (distinct from the plain 'Car' expense preset's
                // 'car-outline'); everything else gets the generic bill icon.
                icon: isMortgage ? 'home' : isCarLoan ? 'car-sport-outline' : 'document-text-outline',
              }
            : undefined;

          if (loanDetailsLocked && targetLiabilityId) {
            // Round-5 correction (Issue 3) — repayment-only path, routed
            // through the dedicated production action that structurally
            // cannot touch the liability record (see
            // updateLinkedRepaymentOnlyTransition's doc comment) — not the
            // three actions below, which always rewrite liability fields
            // on an update target even when passed identical-looking
            // values.
            const result = updateLinkedRepaymentOnly(targetLiabilityId, repaymentPayload, generateId());
            if (!result.applied) throw new LiabilityFailure(result.reason);
          } else if (isMortgage) {
            const newPropertyValueNum = parseFloat(newPropertyValue);
            const propertyLink: Parameters<typeof addMortgageWithProperty>[1] =
              propertyLinkMode === 'existing' && selectedPropertyId
                ? { mode: 'existing', assetId: selectedPropertyId }
                : propertyLinkMode === 'new' && !isNaN(newPropertyValueNum) && newPropertyValueNum > 0 && newPropertyName.trim().length > 0
                ? { mode: 'new', value: newPropertyValueNum, label: newPropertyName.trim() }
                : { mode: 'none' };
            const result = addMortgageWithProperty(liabilityPayload, propertyLink, repaymentPayload, target, {
              newPropertyAssetId: generateId(),
              newRecurringItemId: generateId(),
            });
            if (!result.applied) throw new LiabilityFailure(result.reason);
          } else if (isCarLoan) {
            const newVehicleValueNum = parseFloat(newVehicleValue);
            const vehicleLink: Parameters<typeof addCarLoanWithVehicle>[1] =
              vehicleLinkMode === 'existing' && selectedVehicleId
                ? { mode: 'existing', assetId: selectedVehicleId }
                : vehicleLinkMode === 'new' && !isNaN(newVehicleValueNum) && newVehicleValueNum > 0 && newVehicleName.trim().length > 0
                ? { mode: 'new', value: newVehicleValueNum, label: newVehicleName.trim() }
                : { mode: 'none' };
            const result = addCarLoanWithVehicle(liabilityPayload, vehicleLink, repaymentPayload, target, {
              newVehicleAssetId: generateId(),
              newRecurringItemId: generateId(),
            });
            if (!result.applied) throw new LiabilityFailure(result.reason);
          } else {
            const isLoan = SMART_LOAN_TYPES.includes(liabilityType);
            if (hasRepaymentSchedule) {
              // Atomic: creates (or updates the exact targeted) liability
              // and links this bill to it in one state write — addLiability
              // then addRecurringItem back-to-back silently drops the
              // liability (PRD bug report: "liability does not appear in
              // Wealth").
              const result = linkBillToLiability({ type: liabilityType, ...liabilityPayload }, repaymentPayload, target, generateId());
              if (!result.applied) throw new LiabilityFailure(result.reason);
            } else if (targetLiabilityId) {
              // "Select or create for repayment", existing target chosen,
              // but "I'll add this later"/no valid schedule entered — still
              // must not silently no-op or fall back to addLiability
              // (which would create a DUPLICATE liability of this type).
              // Route through the same target-aware transition with no
              // recurringItem — updates only the targeted liability
              // (its balance/name/rate only if loan details were
              // explicitly unlocked, per liabilityPayload above).
              const result = linkBillToLiability({ type: liabilityType, ...liabilityPayload }, undefined, target, generateId());
              if (!result.applied) throw new LiabilityFailure(result.reason);
            } else {
              addLiability({
                type: liabilityType,
                label: label.trim(),
                currentBalance: amount,
                interestRate: liabInterestRatePayload,
                createdAt: isLoan ? new Date().toISOString() : undefined,
              });
            }
          }
        }
      }
      // Navigation Transitions, Option B pilot — the embedded host closes
      // its own persistent sheet via onSaveSuccess (mirrors TransferForm's
      // own onSaveSuccess wiring exactly); every existing standalone caller
      // never passes `embedded`, so this is unconditionally onClose() for
      // them, byte-identical to before this pilot.
      if (embedded) {
        onSaveSuccess?.();
      } else {
        onClose();
      }
    } catch (err) {
      // Smallest safe recovery (Stream C correction, Issue 6; Round-5
      // correction, Issue 1/5): reset the guard so a deliberate next tap
      // can retry, surface the EXACT reason (not a generic string) as a
      // brief inline error, and — critically — do NOT call onClose(), so
      // the user's entered data stays on screen instead of being silently
      // lost behind a closed modal they'd have to reopen and re-enter from
      // scratch. Never auto-retried; this is a pure recovery path, not a
      // loop.
      submittingRef.current = false;
      setSaveErrorMessage(messageForSaveFailure(err));
    }
  }

  function handleDelete() {
    // Everyday Account correction (2026-08-08) — the only asset/liability
    // type in this file with a delete confirmation; every other existing
    // type's immediate-delete behavior below is deliberately unchanged.
    if (editAsset?.type === 'everyday') {
      // Wave 10 closure — destructive confirm shown = one warning.
      hapticWarning();
      Alert.alert('Remove this Everyday Account from Nolie?', 'Your Nolie totals will update, but this will not affect your real bank account.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // Wave 10 closure — rigid at the confirmed removal only; the
            // immediate-delete paths for other types stay silent (no
            // destructive confirm is shown for them, so there is no
            // confirmed-deletion boundary to mark).
            hapticRigid();
            deleteAsset(editAsset.id);
            onClose();
          },
        },
      ]);
      return;
    }
    if (editLiability?.type === 'bnpl') {
      hapticWarning();
      Alert.alert(
        'Remove this BNPL plan from Nolie?',
        'Future repayment estimates will stop. This will not change your account with the provider.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              // Wave 10 closure — rigid at the confirmed removal.
              hapticRigid();
              deleteLiability(editLiability.id);
              onClose();
            },
          },
        ]
      );
      return;
    }
    if (editAsset) deleteAsset(editAsset.id);
    if (editLiability) deleteLiability(editLiability.id);
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        typeChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        typeChipActive: { backgroundColor: colors.accentSoft },
        typeChipText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        typeChipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        inputLocked: { opacity: 0.55 },
        /* Wave 7 correction D — Save is an INTERACTIVE action, not a
           completed positive outcome. `Button`'s own `primary` variant uses
           `colors.accent`, which is green in every theme; on a Wealth form
           that made "Save" look like a confirmation that had already
           happened. Scoped to this one control — the global Button
           primitive and every other screen are untouched. Green stays
           reserved for money genuinely received. */
        saveAction: { backgroundColor: semantic.interactive },
        footerButton: { flex: 1 },
        deleteButton: { marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, textAlign: 'center', fontWeight: '600' },
        row: { flexDirection: 'row', gap: spacing.sm },
        rowInput: { flex: 1 },
        helperBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        helperText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, lineHeight: 17 },
        freqRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        freqChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
        freqChipActive: { backgroundColor: colors.accentSoft },
        freqText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        freqTextActive: { color: colors.accentStrong },
        dateHint: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
        deferRepaymentLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md },
        deferRepaymentText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        moneyIncludeBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        moneyIncludeTitle: { ...typography.body, fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
        moneyIncludeCopy: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        moneyIncludeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
        moneyIncludeToggleText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        selectorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        selectorRowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        selectorRowSub: { ...typography.micro, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
        selectorRowValue: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        addNewRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          justifyContent: 'center',
          borderRadius: radius.control,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.accentStrong,
          borderStyle: 'dashed',
        },
        addNewRowText: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '600' },
        lockedSummaryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        },
        editDetailsLink: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  // CORRECTION 1, "SELECT OR CREATE FOR REPAYMENT" — the new explicit
  // selection step. Only ever shown for liabilityFlowIntent ===
  // 'select_or_create_for_repayment' sessions where matching liabilities
  // already exist (computed once on open — see the reset effect).
  if (kind === 'liability' && showLiabilitySelector) {
    const matching = data.liabilities.filter((l) => l.type === liabilityType);
    const selectorContent = (
      <>
        {matching.map((l) => {
          const linkedAssetLabel =
            l.type === 'car_loan' && l.linkedVehicleAssetId
              ? data.assets.find((a) => a.id === l.linkedVehicleAssetId)?.label
              : l.type === 'mortgage' && l.linkedPropertyAssetId
              ? data.assets.find((a) => a.id === l.linkedPropertyAssetId)?.label
              : undefined;
          return (
            <TouchableOpacity key={l.id} style={styles.selectorRow} activeOpacity={0.8} onPress={() => chooseExistingLiabilityForRepayment(l)}>
              <View>
                <Text style={styles.selectorRowLabel}>{l.label}</Text>
                {linkedAssetLabel ? <Text style={styles.selectorRowSub}>Linked to {linkedAssetLabel}</Text> : null}
              </View>
              <Text style={styles.selectorRowValue}>{formatBalance(l.currentBalance)}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.addNewRow} activeOpacity={0.8} onPress={chooseAddNewLiabilityForRepayment}>
          <Ionicons name="add" size={16} color={colors.accentStrong} />
          <Text style={styles.addNewRowText}>Add a new {LIABILITY_DISPLAY_NAME[liabilityType]}</Text>
        </TouchableOpacity>
      </>
    );
    // Full-workspace extension — this internal sub-step (a choice made
    // BEFORE the ordinary details form below is even reached) now stays
    // inside the persistent embedded workspace exactly like the ordinary
    // details form already does, rather than always opening its own
    // standalone Modal. The host never needs to know this sub-step exists
    // — canSave is already naturally false here (label/value are still
    // blank; see resetLiabilityFieldsBlank), so the host's own Save button
    // is correctly disabled without any extra wiring, and the shared
    // `title` computation above already reports this step's exact heading.
    // Tapping a row or "Add a new X" transitions straight into the ordinary
    // details content below via existing internal state changes
    // (chooseExistingLiabilityForRepayment/chooseAddNewLiabilityForRepayment)
    // — no host involvement, same pattern the details form's own field
    // changes already use.
    if (embedded) {
      return selectorContent;
    }
    return (
      <KeyboardSheet visible={visible} onClose={onClose} isDirty={false} title={title} footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}>
        {selectorContent}
      </KeyboardSheet>
    );
  }


  const nameField = kind === 'liability' ? LIABILITY_NAME_FIELD[liabilityType] : null;
  // Type chips are hidden for the repayment-selection flow once a target
  // (or "add new") has been chosen — the entry point already told Navilo
  // exactly which type this is; letting the user wander to a different
  // type mid-flow would reopen the same ambiguity this correction closes.
  const showTypeChips = kind === 'asset' || resolvedIntent !== 'select_or_create_for_repayment';
  // Correction pass (2026-08-08) — a session opened via the "Add everyday
  // account"/"Add cash"/"Add savings" Add Anything tiles (or the
  // equivalent Wealth shortcuts) presets exactly one of the three liquid
  // types; showing the full ETF/Shares/Property/Car/etc. chip row there is
  // unrelated noise the user never asked for. Narrowed to the three
  // liquid-balance chips only, still letting the user self-correct between
  // Cash/Savings/Everyday without leaving the form. Every OTHER preset
  // (etf/property/super/...) and the generic, no-preset "Add asset" flow
  // (reached via the category-card grid) are completely unaffected — same
  // full ASSET_TYPES row as before. Reuses the existing form; no new
  // component.
  const isLiquidPresetJourney = kind === 'asset' && !!presetAssetType && LIQUID_BALANCE_TYPES.includes(presetAssetType);
  // Design 5.1 Wave 4 — the in-form asset-type selector. Same
  // ASSET_CARD_GROUPS list the removed page rendered as cards, including its
  // descriptions, and BOTH restrictions are carried over: the liquid-preset
  // journey, and `onlyLiquidCategories` (which used to filter the page).
  // Dropping the second one would silently let the Income "Add a money
  // balance" route create a property or an ETF.
  /** Local midnight today — where the forward repayment-date list starts. */
  const startOfTodayLocal = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();
  const restrictToLiquid = isLiquidPresetJourney || !!onlyLiquidCategories;
  const assetTypeSelectOptions = (restrictToLiquid ? ASSET_CARD_GROUPS.filter((g) => LIQUID_BALANCE_TYPES.includes(g.value)) : ASSET_CARD_GROUPS).map(
    (g) => ({ value: g.value, label: g.label, supporting: g.description, icon: assetTypeIcon(g.value) })
  );
  /* Wave 7 correction C — the debt side of the same shape. Built from the
     unchanged LIABILITY_TYPES list, so a type can never appear here without
     also existing as a real discriminator. */
  const liabilityTypeSelectOptions = LIABILITY_TYPES.map((t) => ({
    value: t.value,
    label: t.label,
    supporting: t.description,
    icon: liabilityTypeIcon(t.value),
  }));

  // Navigation Transitions, Option B pilot — the exact same field/section
  // JSX every standalone caller already renders, now also reused verbatim
  // (not copied) by the embedded branch below. Nothing inside this content
  // block changed: it's the same conditionals, same components, same order
  // as before this pilot, only lifted into its own variable so it can be
  // returned either wrapped in this form's own KeyboardSheet (standalone,
  // unchanged) or bare (embedded, chrome supplied by the host).
  const content = (
    <>
      {saveErrorMessage ? (
        <View style={styles.helperBox}>
          <Text style={[styles.helperText, { color: colors.danger }]}>{saveErrorMessage}</Text>
        </View>
      ) : null}
      {targetLiability ? (
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>
            You're updating {targetLiability.label}'s repayment.{' '}
            {targetHasExistingRepayment
              ? 'Its existing repayment schedule will be updated with what you enter below — not added as a second one.'
              : "This adds its first repayment schedule."}
          </Text>
        </View>
      ) : null}
      {/* Round-6 correction (Group E) — a small, non-blocking reminder,
          never a candidate list: the current data model has no reliable
          way to distinguish an unlinked LOAN repayment from an ordinary
          bill, so this deliberately names nothing, lists nothing, and
          never claims Navilo detected a duplicate. Shown only while
          genuinely about to create a brand-new linked repayment; never
          prevents Save. */}
      {wouldCreateNewLinkedRepayment() ? (
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>Already track this repayment as a regular bill? Check your bills first to avoid counting it twice.</Text>
        </View>
      ) : null}
      {showTypeChips && kind === 'asset' ? (
        <InlineSelect
          label="What are you adding?"
          placeholder="Choose a type"
          value={assetType}
          onChange={chooseAssetCategory}
          options={assetTypeSelectOptions}
          testID="add-asset-type"
        />
      ) : null}
      {showTypeChips && kind === 'liability' ? (
        /* Wave 7 correction C — the SAME InlineSelect the asset side uses.
           Choosing a type still routes through the identical branches: the
           credit-card handoff below is byte-for-byte the chip handler's own
           logic (embedded → onRequestCreditCard, standalone → deferred
           handoff with the Android fallback), and every other type still
           just sets `liabilityType`, the one discriminator the whole form
           reads. No second Modal: InlineSelect owns its own focused list,
           and it dismisses the keyboard before that list is interactive. */
        <InlineSelect
          label="What are you adding?"
          placeholder="Choose a debt type"
          value={liabilityType}
          onChange={chooseLiabilityType}
          options={liabilityTypeSelectOptions}
          testID="add-liability-type"
        />
      ) : null}
      {loanDetailsLocked ? (
        <View style={styles.lockedSummaryRow}>
          <View>
            <Text style={styles.selectorRowLabel}>{label}</Text>
            <Text style={styles.selectorRowSub}>
              {formatBalance(parseFloat(value) || 0)}
              {targetLinkedAssetLabel ? ` · Linked to ${targetLinkedAssetLabel}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditingLoanDetails(true)}>
            <Text style={styles.editDetailsLink}>Edit loan details</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextField
            label={kind === 'liability' && nameField ? nameField.field : kind === 'asset' && assetType === 'everyday' ? 'Account name' : 'Label'}
            required
            placeholder={
              kind === 'asset'
                ? assetType === 'everyday'
                  ? 'e.g. Main everyday account'
                  : 'e.g. Vanguard ETF'
                : nameField?.placeholder ?? 'e.g. Home loan'
            }
            value={label}
            onChangeText={setLabel}
          />
          {kind === 'asset' && assetType === 'everyday' ? (
            <>
              <TextField label="Bank or provider (optional)" placeholder="e.g. Commonwealth Bank" value={provider} onChangeText={setProvider} />
            </>
          ) : null}
          {isBnpl ? (
            <>
              <TextField label="Provider (optional)" placeholder="e.g. Afterpay" value={provider} onChangeText={setProvider} />
              <View style={styles.helperBox}>
                <Text style={styles.helperText}>Track what you still owe and what's due next.</Text>
                <Text style={[styles.helperText, { marginTop: spacing.xs }]}>
                  {brand.name} will estimate future repayments from the details you enter. Check your provider if the amounts or dates change.
                </Text>
                <Text style={[styles.helperText, { marginTop: spacing.xs }]}>
                  Do not enter account passwords, card details or banking login information.
                </Text>
              </View>
            </>
          ) : null}
          {/* `allowZero` mirrors this form's OWN existing parser choice
              (`usesStrictLiquidParser` selects parseMoneyInputAllowZero for
              the three liquid-balance types) so the field describes exactly
              what Save already accepts. It decides nothing. */}
          <CurrencyField
            label={kind === 'liability' ? 'Amount you still owe today' : kind === 'asset' && assetType === 'everyday' ? 'Current balance' : 'Value'}
            required
            large
            allowZero={usesStrictLiquidParser}
            placeholder="$0"
            value={value}
            onChangeText={setValue}
          />
          {kind === 'asset' && assetType === 'everyday' ? (
            <View style={styles.helperBox}>
              <Text style={styles.helperText}>• Update this balance when it changes.</Text>
              <Text style={[styles.helperText, { marginTop: spacing.xs }]}>
                • To avoid double-counting, don't enter the same balance under both Cash and Everyday Account.
              </Text>
              <Text style={[styles.helperText, { marginTop: spacing.xs }]}>• Enter the balance only—never card or banking login details.</Text>
            </View>
          ) : null}
        </>
      )}
      {kind === 'asset' && (assetType === 'cash' || assetType === 'savings') ? (
        <>
          {/* A rate, NOT a money amount — never a CurrencyField. */}
          <TextField
            label="Interest rate % (optional)"
            placeholder="e.g. 4.50"
            keyboardType="decimal-pad"
            value={interestRate}
            onChangeText={setInterestRate}
          />
        </>
      ) : null}
      {kind === 'asset' && LIQUID_BALANCE_TYPES.includes(assetType) ? (
        <View style={styles.moneyIncludeBox}>
          <Text style={styles.moneyIncludeTitle}>Should {brand.name} include this balance when estimating your available money?</Text>
          <Text style={styles.moneyIncludeCopy}>
            {assetType === 'everyday'
              ? `${brand.name} will include it when estimating Available Until Payday.`
              : 'Include it if this money is available for everyday bills and spending. You can change this later. This never affects your recorded net wealth — only short-term estimates like Available Until Payday.'}
          </Text>
          <TouchableOpacity style={styles.moneyIncludeToggleRow} onPress={() => setIncludeInMoney((v) => !v)}>
            <Ionicons
              name={includeInMoney ? 'checkbox' : 'square-outline'}
              size={20}
              color={includeInMoney ? colors.accentStrong : colors.textMuted}
            />
            <Text style={styles.moneyIncludeToggleText}>
              {includeInMoney ? 'Yes, include this balance' : 'No, keep it separate'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {kind === 'liability' && !loanDetailsLocked ? (
        <>
          {/* A rate, NOT a money amount — never a CurrencyField. */}
          <TextField
            label="Interest rate % (optional)"
            placeholder="e.g. 6.50"
            keyboardType="decimal-pad"
            value={liabilityInterestRate}
            onChangeText={setLiabilityInterestRate}
          />
        </>
      ) : null}
      {isMortgage && !loanDetailsLocked ? (
        <>
          <Text style={styles.label}>Is this linked to a property?</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, propertyLinkMode === 'none' ? styles.typeChipActive : null]}
              onPress={() => setPropertyLinkMode('none')}
            >
              <Text style={[styles.typeChipText, propertyLinkMode === 'none' ? styles.typeChipTextActive : null]}>Not linked</Text>
            </TouchableOpacity>
            {propertyAssets.length > 0 ? (
              <TouchableOpacity
                style={[styles.typeChip, propertyLinkMode === 'existing' ? styles.typeChipActive : null]}
                onPress={() => setPropertyLinkMode('existing')}
              >
                <Text style={[styles.typeChipText, propertyLinkMode === 'existing' ? styles.typeChipTextActive : null]}>Existing property</Text>
              </TouchableOpacity>
            ) : null}
            {!editLiability ? (
              <TouchableOpacity
                style={[styles.typeChip, propertyLinkMode === 'new' ? styles.typeChipActive : null]}
                onPress={() => setPropertyLinkMode('new')}
              >
                <Text style={[styles.typeChipText, propertyLinkMode === 'new' ? styles.typeChipTextActive : null]}>Add property value</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {propertyLinkMode === 'existing' ? (
            <View style={styles.typeRow}>
              {propertyAssets.map((p) => {
                const active = selectedPropertyId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.typeChip, active ? styles.typeChipActive : null]}
                    onPress={() => setSelectedPropertyId(p.id)}
                  >
                    <Text style={[styles.typeChipText, active ? styles.typeChipTextActive : null]}>
                      {p.label} · {formatBalance(p.currentValue)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {propertyLinkMode === 'new' ? (
            <>
              <TextField
                label="Property name or address"
                required
                placeholder="e.g. Richmond home"
                value={newPropertyName}
                onChangeText={setNewPropertyName}
              />
              <CurrencyField label="Current property value" placeholder="e.g. 1,000,000" value={newPropertyValue} onChangeText={setNewPropertyValue} />
            </>
          ) : null}
        </>
      ) : null}
      {isCarLoan && !loanDetailsLocked ? (
        <>
          <Text style={styles.label}>Is this linked to a vehicle?</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, vehicleLinkMode === 'none' ? styles.typeChipActive : null]}
              onPress={() => setVehicleLinkMode('none')}
            >
              <Text style={[styles.typeChipText, vehicleLinkMode === 'none' ? styles.typeChipTextActive : null]}>Not linked</Text>
            </TouchableOpacity>
            {vehicleAssets.length > 0 ? (
              <TouchableOpacity
                style={[styles.typeChip, vehicleLinkMode === 'existing' ? styles.typeChipActive : null]}
                onPress={() => setVehicleLinkMode('existing')}
              >
                <Text style={[styles.typeChipText, vehicleLinkMode === 'existing' ? styles.typeChipTextActive : null]}>Existing vehicle</Text>
              </TouchableOpacity>
            ) : null}
            {!editLiability ? (
              <TouchableOpacity
                style={[styles.typeChip, vehicleLinkMode === 'new' ? styles.typeChipActive : null]}
                onPress={() => setVehicleLinkMode('new')}
              >
                <Text style={[styles.typeChipText, vehicleLinkMode === 'new' ? styles.typeChipTextActive : null]}>Add vehicle value</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {vehicleLinkMode === 'existing' ? (
            <View style={styles.typeRow}>
              {vehicleAssets.map((v) => {
                const active = selectedVehicleId === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.typeChip, active ? styles.typeChipActive : null]}
                    onPress={() => setSelectedVehicleId(v.id)}
                  >
                    <Text style={[styles.typeChipText, active ? styles.typeChipTextActive : null]}>
                      {v.label} · {formatBalance(v.currentValue)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {vehicleLinkMode === 'new' ? (
            <>
              <TextField label="Vehicle name" required placeholder="e.g. Toyota Camry" value={newVehicleName} onChangeText={setNewVehicleName} />
              <CurrencyField label="Current vehicle value" placeholder="e.g. 25,000" value={newVehicleValue} onChangeText={setNewVehicleValue} />
            </>
          ) : null}
        </>
      ) : null}
      {isNewLoan || isBnpl ? (
        hasAmbiguousLinkedRepayment || hasAmbiguousBnplRepayment ? (
          // VID-001 correction — more than one recurring item already links
          // to this liability (an already-anomalous state). Never guess
          // which one to show or let this look like an ordinary blank
          // first-time-schedule form: the input fields are not rendered at
          // all, canSave is false (blocking Save above this render), and
          // this reuses the SAME copy Save's own duplicate_linked_repayment
          // failure already shows elsewhere in this file — one message,
          // not a second, differently-worded one.
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>{DUPLICATE_REPAYMENT_ERROR}</Text>
          </View>
        ) : (
        <>
          <Text style={styles.label}>Repayment schedule (optional)</Text>
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              Add your repayment amount and next repayment date and {brand.name} will automatically add "{label.trim() || LIABILITY_DISPLAY_NAME[liabilityType]}{' '}
              repayment" to your Bills Calendar. Leave every field blank to skip this for now.
            </Text>
          </View>
          <CurrencyField label="Repayment amount" placeholder="e.g. 3,000" value={repaymentAmount} onChangeText={setRepaymentAmount} />
          <Text style={styles.label}>Repayment frequency</Text>
          <View style={styles.freqRow}>
            {REPAYMENT_FREQUENCIES.map((f) => {
              // Correction pass (repayment-schedule UX fix) — an untouched
              // schedule must not show "Monthly" as visually selected, even
              // though repaymentFrequency's own state default is 'monthly'
              // (needed so the amount/day fields below have a valid
              // frequency to key off before the user ever touches this row).
              const active = (repaymentScheduleTouched || repaymentFrequencyTouched) && repaymentFrequency === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.freqChip, active ? styles.freqChipActive : null]}
                  onPress={() => chooseRepaymentFrequency(f.value)}
                >
                  <Text style={[styles.freqText, active ? styles.freqTextActive : null]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {usesRepaymentDayOfMonth ? (
            <>
              {/* Wave 4 device correction — a recurring anchor, not a date.
                  `repaymentDayOfMonth` stays a string and
                  `nextOccurrenceFromDay` is untouched. */}
              <DayOfMonthField
                label="Day of month due"
                value={repaymentDayOfMonth.trim() === '' ? null : parseInt(repaymentDayOfMonth, 10)}
                onChange={(day) => setRepaymentDayOfMonth(String(day))}
                testID="repayment-day-of-month"
              />
            </>
          ) : (
            <>
              {/* Wave 4 closure — the SAME shared focused picker surface the
                  bill, income, transaction and goal now use. Previously its
                  own native <Modal>; the keyboard-dismissal and gesture-
                  isolation behaviour it existed for are preserved by the
                  shared trigger, without a second modal. */}
              <DateTriggerField
                label="Next repayment date"
                direction="future"
                value={repaymentNextDueDate ? new Date(repaymentNextDueDate) : null}
                today={startOfTodayLocal}
                optional
                onChange={(next) => setRepaymentNextDueDate(next.toISOString())}
                testID="repayment-next-due-date"
              />
              <Text style={styles.dateHint}>
                {repaymentFrequency === 'weekly' ? 'Repeats every 7 days from this date.' : 'Repeats every 14 days from this date.'}
              </Text>
            </>
          )}
          {/* Correction pass (repayment-schedule contract) — replaces the
              removed "I'll add the repayment schedule later" checkbox.
              Shown only once the user has started a schedule but not yet
              completed it, naming exactly what's still missing; Save stays
              disabled (canSave's own repaymentScheduleIncomplete check)
              until it clears. */}
          {repaymentScheduleIncomplete ? (
            <View style={styles.helperBox}>
              <Text style={[styles.helperText, { color: colors.danger }]}>
                {!repaymentAmount.trim()
                  ? 'Enter a repayment amount.'
                  : usesRepaymentDayOfMonth
                  ? 'Enter a day from 1 to 31.'
                  : 'Choose a next repayment date.'}
              </Text>
            </View>
          ) : null}
          {repaymentScheduleTouched && !hasSavedLinkedRepayment ? (
            <TouchableOpacity onPress={clearRepaymentSchedule} style={styles.deferRepaymentLink}>
              <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.deferRepaymentText}>Clear repayment details</Text>
            </TouchableOpacity>
          ) : null}
          {/* Correction pass (existing linked-schedule safety) — this
              schedule is already saved as a real linked bill; clearing the
              fields here can't safely remove it (no atomic detach
              transition exists yet, see hasSavedLinkedRepayment above), so
              the Clear action is hidden rather than left able to mislead. */}
          {hasSavedLinkedRepayment ? (
            <View style={styles.helperBox}>
              <Text style={styles.helperText}>
                This repayment is already saved to your Bills. To remove it, manage the linked bill from Money — editing the fields above and saving still updates it.
              </Text>
            </View>
          ) : null}
        </>
        )
      ) : null}
      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete {kind}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  // Embedded — no Modal, no KeyboardSheet, no footer of its own. The host
  // supplies all of that and drives Save/Close through the ref handle
  // above. Reachable with kind="asset" (Option B pilot — the category-step
  // early return above stays unreachable here since the embedded host
  // always supplies a presetAssetType) AND, since the full-workspace
  // extension, with kind="liability" too (the type-selector step above is
  // now embedded-aware in its own right, via its own `if (embedded)`
  // return — this final check is only ever reached AFTER that step has
  // already settled into the ordinary details content, for both kinds).
  if (embedded) {
    return content;
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleClose}
      isDirty={isDirty}
      title={title}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={requestCancel} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={{ ...styles.footerButton, ...styles.saveAction }} />
        </>
      }
      onDismiss={Platform.OS === 'ios' ? runPendingCreditCardHandoff : undefined}
      animationType={dismissAnimationType}
    >
      {content}
    </KeyboardSheet>
  );
});
