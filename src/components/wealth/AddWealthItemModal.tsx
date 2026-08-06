import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Asset, AssetType, Liability, LiabilityType, PayFrequency, RecurringItem } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { DatePickerModal } from '../shared/DatePickerModal';
import { Button } from '../shared/Button';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { brand } from '../../lib/brand';
import { resolveIncludeInMoneyCalculations } from '../../lib/calculations/liquidAssets';
import { generateId } from '../../lib/id';

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
};

// Display name used in titles ("Add Car Loan" / "Update Car Loan") and the
// repayment-selector step's heading.
const LIABILITY_DISPLAY_NAME: Record<LiabilityType, string> = {
  mortgage: 'Mortgage',
  car_loan: 'Car Loan',
  personal_loan: 'Personal Loan',
  credit_card: 'Card',
  other: 'Liability',
};

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
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
const ASSET_CARD_GROUPS: { value: AssetType; emoji: string; label: string; description: string }[] = [
  { value: 'cash', emoji: '💵', label: 'Cash', description: 'Money in your wallet' },
  { value: 'savings', emoji: '🏦', label: 'Savings', description: 'Money earning interest' },
  { value: 'etf', emoji: '📈', label: 'Investments', description: 'Stocks, ETFs, crypto, funds' },
  { value: 'property', emoji: '🏠', label: 'Property', description: 'Home or investment property' },
  { value: 'super', emoji: '🛡', label: 'Retirement Savings', description: 'Superannuation, 401(k), IRA, pension' },
  { value: 'car', emoji: '🚗', label: 'Vehicle', description: 'Car, motorbike, boat' },
  { value: 'other', emoji: '💎', label: 'Other assets', description: 'Everything else you own' },
];

const LIABILITY_TYPES: { value: LiabilityType; label: string }[] = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'car_loan', label: 'Car loan' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'other', label: 'Other' },
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
  constructor(public reason: 'target_not_found' | 'target_wrong_type' | 'duplicate_linked_repayment') {
    super(reason);
  }
}

const GENERIC_SAVE_ERROR = 'Something went wrong saving this — nothing was lost. Your details are still here; tap Save to try again.';
// Round-5 correction (Issue 1) — the required neutral wording for an
// ambiguous exact-linked repayment: Navilo must not guess which of
// several linked repayment records to update, so nothing is written and
// the user is told exactly what to go check.
const DUPLICATE_REPAYMENT_ERROR = 'Navilo found more than one repayment linked to this loan. Review the existing repayments before updating this schedule.';

function messageForSaveFailure(err: unknown): string {
  return err instanceof LiabilityFailure && err.reason === 'duplicate_linked_repayment' ? DUPLICATE_REPAYMENT_ERROR : GENERIC_SAVE_ERROR;
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
   * to discover). */
  onSelectCreditCard?: () => void;
  onClose: () => void;
  /** Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
   * True only for the one embedded host that renders this component without
   * its own Modal/KeyboardSheet chrome, supplying that chrome itself and
   * driving Save/Close through the ref handle above. Every existing caller
   * omits this (defaults to false), which preserves 100% of the standalone
   * rendering (own KeyboardSheet, own footer, own Cancel/Save wiring)
   * unchanged. MUST only ever be combined with kind="asset" — liability and
   * credit-card sessions always render standalone regardless of this flag
   * (enforced by the embedded host, which only ever mounts this component
   * with kind="asset"; see AddAnythingSheet.tsx). */
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
  presetLiabilityType,
  liabilityFlowIntent,
  onSelectCreditCard,
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
  } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
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
  // Never assume a repayment is due today or one month from today (PRD
  // ask, §B4) — the user picks a real day of month, or explicitly defers
  // scheduling it. Both start unset so nothing is silently pre-filled.
  const [repaymentDayOfMonth, setRepaymentDayOfMonth] = useState('');
  // Only meaningful for weekly/fortnightly — a "day of month" can't express
  // a real weekly/fortnightly cadence (mirrors Income's and Bills' own
  // "next due date" picker for the same frequencies, PRD bug report: a
  // fortnightly car loan repayment still asked for "day of month").
  const [repaymentNextDueDate, setRepaymentNextDueDate] = useState<string | null>(null);
  const [repaymentPickerOpen, setRepaymentPickerOpen] = useState(false);
  const [addRepaymentLater, setAddRepaymentLater] = useState(false);
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
  const [formStep, setFormStep] = useState<'category' | 'details'>('details');
  // Stream C correction (Correction 1) — the "select or create for
  // repayment" step. Shown only for liabilityFlowIntent ===
  // 'select_or_create_for_repayment' sessions where at least one same-type
  // liability already exists; skipped entirely (falls straight to a blank
  // create form) otherwise.
  const [showLiabilitySelector, setShowLiabilitySelector] = useState(false);
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
  const initialSnapshot = useRef({ label: '', value: '', interestRate: '' });
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
  const propertyAssets = data.assets.filter((a) => a.type === 'property');
  const vehicleAssets = data.assets.filter((a) => a.type === 'car');
  const usesRepaymentDayOfMonth = repaymentFrequency === 'monthly';
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

  // Stream C correction (Correction 1) — the "select or create for
  // repayment" step's own choice handlers.
  function chooseExistingLiabilityForRepayment(l: Liability) {
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
    } else {
      setRepaymentAmount('');
      setRepaymentFrequency('monthly');
      setRepaymentDayOfMonth('');
      setRepaymentNextDueDate(null);
    }
    setShowLiabilitySelector(false);
  }
  function chooseAddNewLiabilityForRepayment() {
    setTargetLiabilityId(null);
    setEditingLoanDetails(true);
    resetLiabilityFieldsBlank();
    setShowLiabilitySelector(false);
  }

  function chooseRepaymentFrequency(f: PayFrequency) {
    setRepaymentFrequency(f);
    // Switching frequency invalidates whatever day/date was picked under
    // the old schedule (same rule Income and Bills already follow).
    setRepaymentDayOfMonth('');
    setRepaymentNextDueDate(null);
    setRepaymentPickerOpen(false);
  }

  const isEditing = !!(editAsset || editLiability);
  const isDirty =
    label !== initialSnapshot.current.label ||
    value !== initialSnapshot.current.value ||
    interestRate !== initialSnapshot.current.interestRate;

  useEffect(() => {
    if (!visible) return;
    // A genuinely new form session — see submittingRef's own comment for
    // why this is the only place it's ever cleared.
    submittingRef.current = false;
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
      setIncludeInMoney(resolveIncludeInMoneyCalculations(editAsset));
      initialSnapshot.current = { label: editAsset.label, value: String(editAsset.currentValue), interestRate: rate };
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
      initialSnapshot.current = { label: editLiability.label, value: String(editLiability.currentBalance), interestRate: '' };
      setShowLiabilitySelector(false);
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
    } else {
      setInterestRate('');
      setAssetType(presetAssetType ?? 'cash');
      setIncludeInMoney(resolveIncludeInMoneyCalculations({ type: presetAssetType ?? 'cash', includeInMoneyCalculations: undefined }));
      const resolvedType = presetLiabilityType ?? 'personal_loan';
      setLiabilityType(resolvedType);
      setRepaymentAmount('');
      setRepaymentFrequency('monthly');
      setRepaymentDayOfMonth('');
      setRepaymentNextDueDate(null);
      setRepaymentPickerOpen(false);
      setAddRepaymentLater(false);
      resetLiabilityFieldsBlank();
      setLabel('');
      setValue('');
      initialSnapshot.current = { label: '', value: '', interestRate: '' };
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
      setTargetLiabilityId(null);
      setEditingLoanDetails(true);
    }
    setFormStep(kindProp === 'asset' && !editAsset && !presetAssetType ? 'category' : 'details');
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

  function chooseAssetCategory(type: AssetType) {
    setAssetType(type);
    setIncludeInMoney(resolveIncludeInMoneyCalculations({ type, includeInMoneyCalculations: undefined }));
    setFormStep('details');
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
    !isNaN(parseFloat(value)) &&
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
    !hasAmbiguousLinkedRepayment;
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
        : isEditing
        ? 'Edit asset'
        : 'Add asset'
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
    const repaymentValue = parseFloat(repaymentAmount);
    const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
    return (
      !addRepaymentLater &&
      !isNaN(repaymentValue) &&
      repaymentValue > 0 &&
      (usesRepaymentDayOfMonth ? repaymentDayValue >= 1 && repaymentDayValue <= 31 : !!repaymentNextDueDate)
    );
  }

  function handleSave() {
    performSave();
  }

  function performSave() {
    const amount = parseFloat(value);
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
        const interestRatePayload =
          (assetType === 'cash' || assetType === 'savings') && !isNaN(rateValue) && rateValue >= 0 ? rateValue / 100 : undefined;
        const includeInMoneyPayload = assetType === 'cash' || assetType === 'savings' ? includeInMoney : undefined;
        if (editAsset) {
          updateAsset(editAsset.id, {
            type: assetType,
            label: label.trim(),
            currentValue: amount,
            interestRate: interestRatePayload,
            includeInMoneyCalculations: includeInMoneyPayload,
          });
        } else {
          addAsset({
            type: assetType,
            label: label.trim(),
            currentValue: amount,
            interestRate: interestRatePayload,
            includeInMoneyCalculations: includeInMoneyPayload,
          });
        }
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
          // a repayment definition once the user has actually chosen a
          // day/date — never silently assumes "due one month from today"
          // (PRD bug report, §B4). "I'll add this later" leaves any
          // already-scheduled repayment untouched.
          const repaymentValue = parseFloat(repaymentAmount);
          const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
          const hasRepaymentSchedule =
            SMART_LOAN_TYPES.includes(liabilityType) &&
            !addRepaymentLater &&
            !isNaN(repaymentValue) &&
            repaymentValue > 0 &&
            (usesRepaymentDayOfMonth ? repaymentDayValue >= 1 && repaymentDayValue <= 31 : !!repaymentNextDueDate);
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
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          marginBottom: spacing.md,
          color: colors.textPrimary,
        },
        inputLocked: { opacity: 0.55 },
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
        deferRepaymentLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md },
        deferRepaymentText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        moneyIncludeBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        moneyIncludeTitle: { ...typography.body, fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
        moneyIncludeCopy: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        moneyIncludeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
        moneyIncludeToggleText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        categoryCard: {
          flexBasis: '46%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.lg,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        categoryCardEmoji: { fontSize: 30, marginBottom: spacing.xs },
        categoryCardLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
        categoryCardDescription: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
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

  if (kind === 'asset' && formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💎 What are you adding?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <View style={styles.categoryGrid}>
          {ASSET_CARD_GROUPS.map((g) => (
            <TouchableOpacity key={g.value} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseAssetCategory(g.value)}>
              <Text style={styles.categoryCardEmoji}>{g.emoji}</Text>
              <Text style={styles.categoryCardLabel}>{g.label}</Text>
              <Text style={styles.categoryCardDescription}>{g.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardSheet>
    );
  }

  // CORRECTION 1, "SELECT OR CREATE FOR REPAYMENT" — the new explicit
  // selection step. Only ever shown for liabilityFlowIntent ===
  // 'select_or_create_for_repayment' sessions where matching liabilities
  // already exist (computed once on open — see the reset effect).
  if (kind === 'liability' && showLiabilitySelector) {
    const matching = data.liabilities.filter((l) => l.type === liabilityType);
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title={`Which ${LIABILITY_DISPLAY_NAME[liabilityType]} is this repayment for?`}
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
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
      </KeyboardSheet>
    );
  }


  const nameField = kind === 'liability' ? LIABILITY_NAME_FIELD[liabilityType] : null;
  // Type chips are hidden for the repayment-selection flow once a target
  // (or "add new") has been chosen — the entry point already told Navilo
  // exactly which type this is; letting the user wander to a different
  // type mid-flow would reopen the same ambiguity this correction closes.
  const showTypeChips = kind === 'asset' || resolvedIntent !== 'select_or_create_for_repayment';

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
      {showTypeChips ? (
        <View style={styles.typeRow}>
          {(kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES).map((t) => {
            const active = kind === 'asset' ? assetType === t.value : liabilityType === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, active ? styles.typeChipActive : null]}
                onPress={() => {
                  // First-accepted-tap-wins deferred handoff (Stream D,
                  // D1, corrected) — onSelectCreditCard is never called in
                  // the same tick as onClose(): on iOS it's deferred to
                  // KeyboardSheet's real onDismiss (wired below); only on
                  // Android — where RN never calls onDismiss — is the
                  // CREDIT_CARD_HANDOFF_DEFER_MS fallback timer scheduled.
                  if (kind === 'liability' && t.value === 'credit_card') {
                    if (ccHandoffInProgressRef.current) return;
                    ccHandoffInProgressRef.current = true;
                    // Skip the animated dismissal for an accepted handoff
                    // (Stream D, Option B) — flips animationType to 'none'
                    // in the SAME synchronous call as onClose(), so React
                    // 18's automatic batching lands both in one commit
                    // (verified against RN's own Fabric
                    // RCTModalHostViewComponentView.mm: updateProps applies
                    // animationType before ensurePresentedOnlyIfNeeded
                    // checks visible, within one synchronous native call
                    // per commit).
                    setDismissAnimationType('none');
                    onClose();
                    if (Platform.OS === 'android') {
                      if (ccHandoffTimerRef.current) clearTimeout(ccHandoffTimerRef.current);
                      ccHandoffTimerRef.current = setTimeout(runPendingCreditCardHandoff, CREDIT_CARD_HANDOFF_DEFER_MS);
                    }
                    return;
                  }
                  if (kind === 'asset') {
                    setAssetType(t.value as AssetType);
                    setIncludeInMoney(resolveIncludeInMoneyCalculations({ type: t.value as AssetType, includeInMoneyCalculations: undefined }));
                  } else {
                    setLiabilityType(t.value as LiabilityType);
                  }
                }}
              >
                <Text style={[styles.typeChipText, active ? styles.typeChipTextActive : null]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
          <Text style={styles.label}>{kind === 'liability' && nameField ? nameField.field : 'Label'}</Text>
          <TextInput
            style={styles.input}
            placeholder={kind === 'asset' ? 'e.g. Vanguard ETF' : nameField?.placeholder ?? 'e.g. Home loan'}
            placeholderTextColor={colors.textMuted}
            value={label}
            onChangeText={setLabel}
          />
          <Text style={styles.label}>{kind === 'liability' ? 'Amount you still owe today' : 'Value'}</Text>
          <TextInput
            style={styles.input}
            placeholder="$0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={value}
            onChangeText={setValue}
          />
        </>
      )}
      {kind === 'asset' && (assetType === 'cash' || assetType === 'savings') ? (
        <>
          <Text style={styles.label}>Interest rate % (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 4.50"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={interestRate}
            onChangeText={setInterestRate}
          />
          <View style={styles.moneyIncludeBox}>
            <Text style={styles.moneyIncludeTitle}>Should {brand.name} include this balance when estimating your available money?</Text>
            <Text style={styles.moneyIncludeCopy}>
              Include it if this money is available for everyday bills and spending. You can change this later. This never affects your
              recorded net wealth — only short-term estimates like Available Until Payday.
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
        </>
      ) : null}
      {kind === 'liability' && !loanDetailsLocked ? (
        <>
          <Text style={styles.label}>Interest rate % (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 6.50"
            placeholderTextColor={colors.textMuted}
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
              <Text style={styles.label}>Property name or address</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Richmond home"
                placeholderTextColor={colors.textMuted}
                value={newPropertyName}
                onChangeText={setNewPropertyName}
              />
              <Text style={styles.label}>Current property value</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1,000,000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={newPropertyValue}
                onChangeText={setNewPropertyValue}
              />
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
              <Text style={styles.label}>Vehicle name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Toyota Camry"
                placeholderTextColor={colors.textMuted}
                value={newVehicleName}
                onChangeText={setNewVehicleName}
              />
              <Text style={styles.label}>Current vehicle value</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 25,000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={newVehicleValue}
                onChangeText={setNewVehicleValue}
              />
            </>
          ) : null}
        </>
      ) : null}
      {isNewLoan ? (
        hasAmbiguousLinkedRepayment ? (
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
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              Add your repayment amount and next repayment date and {brand.name} will automatically add "{label.trim() || LIABILITY_DISPLAY_NAME[liabilityType]}{' '}
              repayment" to your Bills Calendar.
            </Text>
          </View>
          <Text style={styles.label}>Repayment amount (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 3,000"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={repaymentAmount}
            onChangeText={setRepaymentAmount}
          />
          <Text style={styles.label}>Repayment frequency</Text>
          <View style={styles.freqRow}>
            {REPAYMENT_FREQUENCIES.map((f) => {
              const active = repaymentFrequency === f.value;
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
          {!addRepaymentLater ? (
            usesRepaymentDayOfMonth ? (
              <>
                <Text style={styles.label}>Day of month due</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  value={repaymentDayOfMonth}
                  onChangeText={setRepaymentDayOfMonth}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Next repayment date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    // Same gesture-isolation/keyboard-dismissal correction as
                    // Income's date field (UX correction round) — a dedicated
                    // modal instead of an inline calendar sharing this sheet's
                    // own swipe-to-dismiss surface, so scrolling the calendar
                    // can never be read as "close the whole loan form" and
                    // silently discard entered name/amount/vehicle-link data.
                    Keyboard.dismiss();
                    setRepaymentPickerOpen(true);
                  }}
                >
                  <Text style={[styles.dateButtonText, !repaymentNextDueDate ? styles.dateButtonPlaceholder : null]}>
                    {repaymentNextDueDate ? formatDate(repaymentNextDueDate) : 'Choose a date'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.dateHint}>
                  {repaymentFrequency === 'weekly' ? 'Repeats every 7 days from this date.' : 'Repeats every 14 days from this date.'}
                </Text>
              </>
            )
          ) : null}
          <TouchableOpacity onPress={() => setAddRepaymentLater((v) => !v)} style={styles.deferRepaymentLink}>
            <Ionicons
              name={addRepaymentLater ? 'checkbox' : 'square-outline'}
              size={16}
              color={addRepaymentLater ? colors.accentStrong : colors.textMuted}
            />
            <Text style={styles.deferRepaymentText}>I'll add the repayment schedule later</Text>
          </TouchableOpacity>
        </>
        )
      ) : null}
      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete {kind}</Text>
        </TouchableOpacity>
      ) : null}
      <DatePickerModal
        visible={repaymentPickerOpen}
        value={repaymentNextDueDate ? new Date(repaymentNextDueDate) : new Date()}
        minimumDate={new Date()}
        onChange={(date) => setRepaymentNextDueDate(date.toISOString())}
        onClose={() => setRepaymentPickerOpen(false)}
      />
    </>
  );

  // Embedded (Navigation Transitions, Option B pilot) — no Modal, no
  // KeyboardSheet, no footer of its own. The host supplies all of that and
  // drives Save/Close through the ref handle above. Only ever reached with
  // kind="asset" (see AddWealthItemModalHandle's own doc comment) — the
  // category-step and liability-selector-step early returns above remain
  // completely unreachable here for exactly that reason (both require
  // conditions this pilot's caller never creates: no presetAssetType/
  // editAsset for the category step, kind==='liability' for the selector
  // step), so neither of those two branches needed any change at all.
  if (embedded) {
    return content;
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleClose}
      isDirty={isDirty}
      gesturesEnabled={!repaymentPickerOpen}
      title={title}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={requestCancel} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
      onDismiss={Platform.OS === 'ios' ? runPendingCreditCardHandoff : undefined}
      animationType={dismissAnimationType}
    >
      {content}
    </KeyboardSheet>
  );
});
