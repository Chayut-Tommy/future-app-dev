import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, findNodeHandle, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { buildSaveConfirmation } from '../../lib/celebrations';
import { useCelebration } from '../../state/CelebrationContext';
import { brand } from '../../lib/brand';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { AddIcon } from '../shared/AddIcon';
import { addTaskIcon } from '../../lib/addIcons';
import { Button } from '../shared/Button';
import { TransferForm, TransferFormHandle } from '../wealth/TransferForm';
import { AddWealthItemModal, AddWealthItemModalHandle, LIABILITY_DISPLAY_NAME } from '../wealth/AddWealthItemModal';
import { AddRecurringItemModal, AddRecurringItemModalHandle } from '../money/AddRecurringItemModal';
import { AddIncomeModal, AddIncomeModalHandle } from '../income/AddIncomeModal';
import { QuickAddModal, QuickAddModalHandle } from '../dashboard/QuickAddModal';
import { AddCreditCardModal, AddCreditCardModalHandle } from '../credit/AddCreditCardModal';
import { AddGoalModal, AddGoalModalHandle } from '../goals/AddGoalModal';
import { AssetType, LiabilityType } from '../../types/models';
import { focusElement } from '../../lib/a11yFocus';
import { decideAssetTileSelection } from './addAssetTransitionController';
import {
  AddWorkspaceRoute,
  reduceAddWorkspaceTransition,
  initialAddWorkspaceTransitionState,
  isRouteActiveInTransition,
  isRouteSettledFront,
  EmbeddedCloseReason,
} from './addWorkspaceTransitionController';
import { computeAddWorkspaceGeometry } from './addWorkspaceGeometry';
import { designRadius } from '../../theme/semanticTokens';

export type AddAnythingKind =
  | 'income'
  | 'income_received'
  | 'expense'
  | 'bill'
  | 'transfer'
  | 'cash'
  | 'savings'
  | 'everyday'
  | 'investment'
  | 'property'
  | 'retirement'
  /** Wave 9c visual/checklist correction — a DIRECT-ENTRY-ONLY kind for the
   * checklist's "Add an asset" row: opens the one asset form preset to the
   * canonical Vehicle type ('car'), fully changeable in the form's own
   * type selector. Deliberately absent from GROUPS, so the global "+"
   * chooser is unchanged — only an explicit `initialKind` reaches it. */
  | 'vehicle'
  | 'liability'
  | 'creditCard'
  | 'goal';

interface AddAnythingOption {
  key: AddAnythingKind;
  label: string;
  /** Design 5.1 doc A p.5 — the small right-aligned qualifier that
   * disambiguates two similar tasks (recurring vs one-off income, the debt
   * subtypes, super). Presentation only. */
  qualifier?: string;
}

interface AddAnythingGroup {
  title: string;
  options: AddAnythingOption[];
}

// Grouped by real-world intent (PRD ask, §2): Income and Expense are
// separate top-level actions rather than one hidden behind the other, and
// "income source" (salary — feeds Money Plan/payday math) is kept visibly
// distinct from "income received" (a one-off or ad-hoc amount — updates
// cash only, never silently becomes a recurring salary).
const GROUPS: AddAnythingGroup[] = [
  {
    title: 'Everyday money',
    options: [
      { key: 'expense', label: 'Record spending' },
      { key: 'income', label: 'Add income source', qualifier: 'recurring' },
      { key: 'income_received', label: 'Record income received', qualifier: 'one-off' },
      { key: 'bill', label: 'Add bill' },
      { key: 'transfer', label: 'Move money' },
    ],
  },
  {
    title: 'Accounts and wealth',
    options: [
      { key: 'cash', label: 'Add cash' },
      { key: 'savings', label: 'Add savings' },
      { key: 'everyday', label: 'Add everyday account' },
      { key: 'investment', label: 'Add investment' },
      { key: 'property', label: 'Add property' },
      { key: 'retirement', label: 'Add retirement savings', qualifier: 'super' },
    ],
  },
  {
    title: 'Debt and planning',
    options: [
      { key: 'liability', label: 'Add debt', qualifier: 'loan / BNPL' },
      { key: 'creditCard', label: 'Add credit card' },
      { key: 'goal', label: 'Add goal' },
    ],
  },
];

// Full-workspace extension — every tile now transitions, inside this
// persistent host, into its own embedded destination (see
// addWorkspaceTransitionController.ts). No tile any longer closes this
// sheet and hands off to a separate, standalone Modal — the old dismiss-
// and-defer fallback (choose()/onSelect/ANDROID_DISMISS_FALLBACK_MS) is
// fully retired along with it, satisfying the explicit Phase 2 acceptance
// criterion "no remaining destination opens a second Modal".

// Navigation Transitions, Option B premium-transition correction — the
// fixed-workspace rework retires the old natural-height-measurement scheme
// entirely (chooserNaturalHeight/addAssetNaturalHeight/combinedStableHeight/
// the invisible probe/every destination-content onLayout height handler).
// The sheet's own outer height is now content-independent, computed by
// addWorkspaceGeometry.ts's computeAddWorkspaceGeometry and passed straight
// to KeyboardSheet's fixedSheetHeight prop — it never changes as the
// internal step changes, so there is nothing left to measure or stabilise
// at this level. Every step is one opaque, absolutely-positioned,
// independently-scrolling layer that a single shared Animated.Value "push
// progress" per transition translates horizontally by the workspace's own
// measured viewport width — never opacity, never simultaneously-visible/
// "ghosted" layers.
const PUSH_TRANSITION_DURATION_MS = 220;

// Navigation Transitions — full-workspace extension. The exact same tiles
// that used to each close this whole sheet and open a SEPARATE, standalone
// Modal (via FloatingAddButton's dismiss-and-defer fallback) now
// progressively transition, inside this persistent host, into one embedded
// destination form each — generalising the pattern first proven for
// Transfer and Add Asset to the remaining seven destinations (Expense,
// Income source, Income received, Bill, Liability, Credit card, Goal).
// Values match FloatingAddButton.tsx's own former kind->presetAssetType
// mapping exactly, so the type a user lands on here is identical to what
// they'd have gotten from the now-retired fallback.
const ASSET_PRESET_MAP: Partial<Record<AddAnythingKind, AssetType>> = {
  cash: 'cash',
  savings: 'savings',
  everyday: 'everyday',
  investment: 'etf',
  property: 'property',
  retirement: 'super',
  vehicle: 'car',
};

// The seven destinations with a plain, unambiguous 1:1 tile<->route
// mapping (Asset is deliberately excluded — five different tiles can open
// it, so its own origin tile is tracked separately via
// assetOriginTileKeyRef, exactly as the Option B pilot already did).
const TILE_TO_ROUTE: Partial<Record<AddAnythingKind, Exclude<AddWorkspaceRoute, 'chooser' | 'transfer' | 'asset'>>> = {
  income: 'incomeSource',
  income_received: 'incomeReceived',
  expense: 'expense',
  bill: 'bill',
  liability: 'liability',
  creditCard: 'creditCard',
  goal: 'goal',
};

const ROUTE_TILE_KEY: Partial<Record<AddWorkspaceRoute, AddAnythingKind>> = {
  transfer: 'transfer',
  incomeSource: 'income',
  incomeReceived: 'income_received',
  expense: 'expense',
  bill: 'bill',
  liability: 'liability',
  creditCard: 'creditCard',
  goal: 'goal',
};

// focusElement (accessibility focus movement, iOS VoiceOver vs Android
// TalkBack) now lives in src/lib/a11yFocus.ts, shared with
// QuickActionsTray.tsx (floating navigation design pass) — see that file's
// own doc comment for why the two platforms need genuinely different calls.

// Correction pass (§3) — asset-type switching. Reuses Alert.alert directly,
// in the exact cancel/destructive shape confirmDiscardIfDirty already
// standardises on, because this one confirmation needs button wording
// confirmDiscardIfDirty's fixed "Keep editing"/"Discard" labels don't
// provide ("Continue editing"/"Discard and switch" — the specific,
// requested, neutral, coaching-not-shaming wording for switching TYPE,
// distinct from discarding entirely). Unchanged from the Option B pilot.
function confirmSwitchAssetType(onDiscardAndSwitch: () => void, onContinueEditing: () => void) {
  const { Alert } = require('react-native') as typeof import('react-native');
  Alert.alert('Switch asset type?', 'Your current asset details will be discarded.', [
    { text: 'Continue editing', style: 'cancel', onPress: onContinueEditing },
    { text: 'Discard and switch', style: 'destructive', onPress: onDiscardAndSwitch },
  ]);
}

// Full-workspace extension — the per-destination discard-confirmation copy
// used whenever the HOST itself needs to warn about losing a draft (tile-
// switching while a different destination is dirty, or dismissing the
// whole sheet while any draft is dirty). Every embedded form ALSO has its
// own internal copy for its own Cancel/backdrop path — this table is a
// separate, host-level layer, only reached when the host itself is the one
// intercepting the action before it reaches the form's own requestClose.
const DISCARD_COPY: Record<Exclude<AddWorkspaceRoute, 'chooser'>, { title: string; message: string }> = {
  transfer: { title: 'Discard transfer?', message: 'Your transfer details will be lost.' },
  asset: { title: 'Discard this asset?', message: 'Your new asset details will be lost.' },
  expense: { title: 'Discard changes?', message: 'You have unsaved changes that will be lost.' },
  incomeSource: { title: 'Discard income?', message: 'Your entered income details will be lost.' },
  incomeReceived: { title: 'Discard changes?', message: 'You have unsaved changes that will be lost.' },
  bill: { title: 'Discard this bill?', message: 'Your new bill details will be lost.' },
  liability: { title: 'Discard this liability?', message: 'Your new liability details will be lost.' },
  creditCard: { title: 'Discard this card?', message: 'Your new card details will be lost.' },
  goal: { title: 'Discard this goal?', message: 'Your new goal details will be lost.' },
};

// Full-workspace extension — the small, repeated bundle of state every
// persistent (draft-preserving) destination needs: whether it has ever
// been entered this session (governs whether its layer is mounted at
// all — the actual draft-preservation mechanism), its own reported
// dirty/canSave/title, and a heading ref for accessibility focus on
// Forward. A real, non-speculative abstraction: it replaces eight
// near-identical blocks of useRef/useState that would otherwise be
// hand-duplicated below. Transfer deliberately does NOT use this bundle —
// it is exempt from draft preservation (Phase 2's explicit "Move Money
// logic" exclusion) and unmounts on Back exactly as it already did before
// this extension.
function useEmbeddedDestinationState(initialTitle: string) {
  const everEnteredRef = useRef(false);
  const [canSave, setCanSave] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const headingRef = useRef<Text>(null);
  // Discard-orchestration correction — bumped exactly once by resetDraft()
  // when "Discard & continue" is confirmed, forcing React to fully unmount
  // and remount the embedded component (its own reset-on-open effect then
  // runs fresh, exactly as any genuinely new mount already does) — the
  // only way to guarantee a COMPLETE reset of a form's internal state, not
  // just the fields its own isDirty computation happens to track. Never
  // bumped by Back, by a same-destination restore, or by anything other
  // than an explicit, user-confirmed "Discard & continue".
  const [instanceKey, setInstanceKey] = useState(0);
  return { everEnteredRef, canSave, setCanSave, isDirty, setIsDirty, title, setTitle, headingRef, instanceKey, setInstanceKey };
}

type EmbeddedDestinationState = ReturnType<typeof useEmbeddedDestinationState>;

/**
 * "+" = add or update my money, "Lulu" = ask for guidance — a clear
 * separation (PRD ask). This sheet is the single entry point for every
 * kind of manual entry, reachable from anywhere via the global floating +
 * button, so Today no longer needs its own Quick Actions row.
 *
 * Full-workspace extension — this is the public host boundary
 * FloatingAddButton renders. It now owns ALL thirteen tiles' navigation
 * (chooser <-> Transfer/Asset/Expense/Income source/Income received/Bill/
 * Liability/Credit card/Goal), rendered through the SAME KeyboardSheet-
 * owned Modal/backdrop/swipe/Android-Back/keyboard/scroll/footer this
 * sheet delegates to below, driven by ONE shared route-transition reducer
 * (reduceAddWorkspaceTransition) and ONE shared "push progress"
 * Animated.Value — not one independent transition mechanism per
 * destination. Every destination except Transfer preserves its draft
 * across an in-session Back; Transfer is deliberately exempt (Phase 2's
 * "Move Money logic" exclusion) and keeps its pre-existing
 * unmounts-on-Back behaviour unchanged.
 */
export function AddAnythingSheet({
  visible,
  onClose,
  onlyBalances,
  initialKind,
  suppressIncomePlannerPrompt = false,
}: {
  visible: boolean;
  onClose: () => void;
  /** Correction round, 2026-08-10 — scopes the chooser to only the balance
   * types that can participate in the selected-balance/available-money
   * engine (Cash, Savings, Everyday Account), for Select Balances' own
   * "Add a money balance" entry point. Reuses this exact same chooser/
   * embedded-workspace machinery (Back, Cancel-without-mutation, the real
   * AddWealthItemModal asset-creation form) — never a duplicate,
   * parallel implementation. Every other destination (expense, income,
   * bill, liability, credit card, goal, etc.) is filtered out of the tile
   * grid entirely, not merely hidden. Absent/false renders the full,
   * unscoped chooser exactly as before. */
  onlyBalances?: boolean;
  /** Floating navigation design pass — lets a caller (QuickActionsTray's
   * per-tile actions) land directly on a specific destination instead of
   * the chooser grid, by programmatically firing the exact same
   * `handleTilePress` a real tap on that tile would — never a second,
   * duplicate entry path into any destination's own form. Applied once
   * per fresh open, immediately after the same reset effect every other
   * open already runs (below), so a stale value from a previous open can
   * never re-fire. Ignored while `onlyBalances` is set (that scoped
   * journey has its own fixed entry: the balance-only chooser grid). */
  initialKind?: AddAnythingKind;
  /** Wave 9c visual/checklist correction (Correction E) — explicit caller
   * context from the Today checklist: an income saved from THAT flow must
   * return straight to the checklist, so the embedded income form is told
   * not to request the one-time "Plan around your income?" prompt. Every
   * other host omits this and keeps the accepted prompt behaviour. */
  suppressIncomePlannerPrompt?: boolean;
}) {
  const { colors, semantic, radius, spacing, typography, cardShadow, minTouchTarget } = useTheme();

  // Correction round, 2026-08-10 — the balance-only tile set for the
  // scoped "Add a money balance" journey, derived from the SAME GROUPS
  // array the full chooser uses (never a second, hand-maintained list),
  // so a future addition/removal in GROUPS never needs a parallel update
  // here. Filters out any now-empty group entirely (none currently would
  // be, since 'Wealth' always contains cash/savings/everyday, but this
  // stays correct if that ever changes).
  const visibleGroups = useMemo(
    () =>
      onlyBalances
        ? GROUPS.map((g) => ({ ...g, options: g.options.filter((o) => o.key === 'cash' || o.key === 'savings' || o.key === 'everyday') })).filter(
            (g) => g.options.length > 0
          )
        : GROUPS,
    [onlyBalances]
  );

  // Synchronous, ref-based, cross-path first-tap-wins gate (correction
  // pass, generalised). React state (the transition reducer) is only
  // visible to a new render — two taps arriving in the same tick, before
  // that render happens, could both read the same stale value from their
  // own closures. A ref read-then-write is atomic within one JS tick, so
  // this ref — checked FIRST and set synchronously before any state
  // setter, animation, or dismissal begins — is the ONE first-tap-wins
  // gate shared by every entry (enterRoute), handoff (handoffToRoute), and
  // Back (backToChooser) path in this file. It stays held for the entire
  // time a transition is "in progress", including the two-step BACK-then-
  // FORWARD chain a cross-destination handoff uses internally.
  const selectionLockRef = useRef(false);
  // Dedicated re-entrancy guard for backToChooser()/handoffToRoute()
  // specifically — they run while selectionLockRef is (correctly) still
  // held, so they cannot use that same ref as their own gate; a rapid
  // double-tap on the Back control needs its own atomic check.
  const returningToChooserRef = useRef(false);

  // ---- Shared route-transition state (full-workspace extension). ONE
  // reducer, ONE generation counter, ONE progress value govern every
  // destination — replacing the Option B pilot's separate
  // screen/transitionPhase/chooserTransferProgress (Transfer-only) and
  // addAssetTransition/addAssetGenerationRef/chooserAddAssetProgress
  // (Asset-only) pairs. Only one non-chooser route is ever "current" at a
  // time (enforced by selectionLockRef), so one shared progress value is
  // sufficient and correct — never one Animated.Value per destination. ----
  const [transition, dispatchTransition] = useReducer(reduceAddWorkspaceTransition, initialAddWorkspaceTransitionState);
  const { confirmSaveSuccess } = useCelebration();
  const generationRef = useRef(0);
  const workspaceProgress = useRef(new Animated.Value(0)).current;
  // Wave 10 — Reduced Motion now comes from the ONE application authority
  // (hooks/useReduceMotion) instead of this sheet's own listener. The
  // hook's conservative pre-resolution default (true) means the very first
  // frames after mount favour no motion — every transition path already
  // commits its final state identically with or without animation
  // (runTransition's own RM branch), so behaviour is unchanged.
  const reduceMotionEnabled = useReduceMotion();
  // A focus request scheduled by a transition's own completion (animated or
  // reduced-motion), consumed by the effect below only once `transition`
  // has genuinely settled AND only if nothing has superseded it since
  // (generation check). `fromRoute` is only meaningful when
  // target === 'chooser' (Back) — it names the route just left, so the
  // right tile can be refocused. Transfer deliberately never schedules a
  // focus request (see backToChooser/beginForwardTransition below) — it
  // had none before this extension, and this correction pass does not add
  // one, preserving its exact existing accessibility footprint.
  const pendingFocusRef = useRef<{ generation: number; target: AddWorkspaceRoute; fromRoute?: AddWorkspaceRoute } | null>(null);

  // The workspace's own clipped viewport width, in points — measured via a
  // non-height-affecting onLayout on the absolutely-positioned layers'
  // container (see handleViewportLayout/styles.viewport below). The
  // `windowWidth - spacing.lg*2` formula is kept ONLY as a transient
  // pre-measurement fallback — the sheet's own opening animation (well
  // over 250ms) always finishes, and this layout always fires, before the
  // user can possibly tap a tile and start a real transition.
  const windowDimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredViewportWidth, setMeasuredViewportWidth] = useState<number | null>(null);
  const viewportWidth = measuredViewportWidth ?? Math.max(windowDimensions.width - spacing.lg * 2, 0);

  // ---- Transfer — unchanged in spirit from the Stream D proof-of-pattern:
  // no draft preservation across Back (Phase 2's explicit "Move Money
  // logic" exclusion), so no everEnteredRef/useEmbeddedDestinationState
  // bundle for it. ----
  const transferFormRef = useRef<TransferFormHandle>(null);
  // Design 5.1 Wave 3 — Move money now parks like every other task (handoff
  // §2: "Transfer drafts are parked like all others"). It gains the SAME
  // useEmbeddedDestinationState the other seven destinations use — including
  // instanceKey, which is what makes a confirmed discard a genuine full
  // remount rather than a partial field clear. No new persistence: the draft
  // lives exactly where every other parked draft lives, in the still-mounted
  // form behind the chooser.
  const transferState = useEmbeddedDestinationState('Move money');
  const [transferCanSave, setTransferCanSave] = useState(false);
  const [transferIsDirty, setTransferIsDirty] = useState(false);
  const transferHeadingRef = useRef<Text>(null);

  // ---- Asset (cash/savings/investment/property/retirement) — the Option
  // B pilot, now replumbed onto the shared reducer/progress value above
  // but otherwise behaviourally unchanged: same multi-type-within-one-
  // route switching (decideAssetTileSelection), same freshInstance/key-
  // bump-on-confirmed-switch mechanism, same dedicated origin-tile
  // tracking (five different tiles can open this one route). ----
  const assetState = useEmbeddedDestinationState('Add asset');
  const assetModalRef = useRef<AddWealthItemModalHandle>(null);
  const [assetPresetType, setAssetPresetType] = useState<AssetType>('cash');
  const assetOriginTileKeyRef = useRef<AddAnythingKind | null>(null);

  // ---- The seven newly-embedded destinations (full-workspace extension).
  // Each gets its own useEmbeddedDestinationState bundle (draft
  // preservation) and its own concretely-typed imperative-handle ref. ----
  const expenseState = useEmbeddedDestinationState('Add transaction');
  const expenseModalRef = useRef<QuickAddModalHandle>(null);
  const incomeReceivedState = useEmbeddedDestinationState('Add transaction');
  const incomeReceivedModalRef = useRef<QuickAddModalHandle>(null);
  const incomeSourceState = useEmbeddedDestinationState('Add income source');
  const incomeSourceModalRef = useRef<AddIncomeModalHandle>(null);
  const billState = useEmbeddedDestinationState('Add a bill');
  const billModalRef = useRef<AddRecurringItemModalHandle>(null);
  const liabilityState = useEmbeddedDestinationState('Add liability');
  const liabilityModalRef = useRef<AddWealthItemModalHandle>(null);
  // Bill -> Liability handoff (onRequestLoan) preset — null for the plain
  // "Add liability" tile (a genuine 'create' intent), a real LiabilityType
  // when arriving via the handoff (mirrors the standalone loanHandoff
  // mechanism FloatingAddButton used to own).
  const [liabilityHandoffType, setLiabilityHandoffType] = useState<LiabilityType | null>(null);
  const creditCardState = useEmbeddedDestinationState('Add credit card');
  const creditCardModalRef = useRef<AddCreditCardModalHandle>(null);
  const goalState = useEmbeddedDestinationState('Add a goal');
  const goalModalRef = useRef<AddGoalModalHandle>(null);

  // Correction pass — accessibility focus restoration target for Back:
  // which tile's own ref to focus once the chooser is settled again.
  // Harmless for every tile never looked up by key.
  const assetTileRefs = useRef<Partial<Record<AddAnythingKind, React.ElementRef<typeof TouchableOpacity> | null>>>({});

  // A fresh open must never carry over any stale in-progress transition,
  // selection lock, or preserved draft from a previous time this sheet was
  // shown — always starts back on the chooser with a fresh lock and no
  // mounted destinations.
  useEffect(() => {
    if (!visible) return;
    selectionLockRef.current = false;
    returningToChooserRef.current = false;
    generationRef.current++;
    dispatchTransition({ type: 'RESET' });
    workspaceProgress.setValue(0);
    pendingFocusRef.current = null;
    pendingSwitchRef.current = null;
    pendingDismissRef.current = null;
    setTransferCanSave(false);
    setTransferIsDirty(false);
    setAssetPresetType('cash');
    assetOriginTileKeyRef.current = null;
    setLiabilityHandoffType(null);
    const initialTitles: Record<Exclude<AddWorkspaceRoute, 'chooser' | 'transfer'>, string> = {
      asset: 'Add asset',
      expense: 'Add transaction',
      incomeSource: 'Add income source',
      incomeReceived: 'Add transaction',
      bill: 'Add a bill',
      liability: 'Add liability',
      creditCard: 'Add credit card',
      goal: 'Add a goal',
    };
    (Object.keys(initialTitles) as (keyof typeof initialTitles)[]).forEach((route) => {
      const state = draftStateFor(route);
      state.everEnteredRef.current = false;
      state.setCanSave(false);
      state.setIsDirty(false);
      state.setTitle(initialTitles[route]);
      state.setInstanceKey((k) => k + 1);
    });
    // Floating navigation design pass — fires the SAME tile-press path a
    // real tap would, immediately after the resets above land, so it
    // behaves exactly like "the chooser opened and the user instantly
    // tapped this tile" rather than a separate entry mechanism. Guarded by
    // handleTilePress's own selectionLockRef (just cleared above) and the
    // reducer's own FORWARD precondition, so this can never double-fire or
    // race a real tap. `onlyBalances` always wins (it has its own fixed,
    // scoped entry surface — the balance-only chooser grid, not a specific
    // destination).
    if (initialKind && !onlyBalances) {
      // `initialKind` means the workspace was entered DIRECTLY — a quick tile
      // or a contextual screen action. No chooser step, no Back control.
      handleTilePress(initialKind, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Correction pass — accessibility focus, generalised. Consumes a request
  // scheduled by a transition's own completion (see beginForwardTransition/
  // backToChooser below) only once `transition` has genuinely settled
  // (status 'idle') — guaranteeing the target element's pointerEvents/
  // accessibilityElementsHidden props have already committed to their new,
  // visible/interactive values by the time focus is requested. The
  // generation check discards a request superseded by ANY later event (a
  // newer transition, Back, RESET, or Save — all of which bump
  // generationRef.current at their own start) before it can act.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (transition.status !== 'idle') return;
    pendingFocusRef.current = null;
    if (pending.generation !== generationRef.current) return; // stale — superseded since it was scheduled
    if (pending.target === 'chooser') {
      const fromRoute = pending.fromRoute;
      const tileKey = fromRoute === 'asset' ? assetOriginTileKeyRef.current : fromRoute ? ROUTE_TILE_KEY[fromRoute] ?? null : null;
      focusElement(tileKey ? assetTileRefs.current[tileKey] ?? null : null);
    } else {
      const heading = destinationHeadingRefFor(pending.target);
      focusElement(heading?.current ?? null);
      AccessibilityInfo.announceForAccessibility(`${destinationTitleFor(pending.target)} opened`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition]);

  function destinationHeadingRefFor(route: AddWorkspaceRoute): React.RefObject<Text | null> | null {
    switch (route) {
      case 'asset':
        return assetState.headingRef;
      case 'expense':
        return expenseState.headingRef;
      case 'incomeSource':
        return incomeSourceState.headingRef;
      case 'incomeReceived':
        return incomeReceivedState.headingRef;
      case 'bill':
        return billState.headingRef;
      case 'liability':
        return liabilityState.headingRef;
      case 'creditCard':
        return creditCardState.headingRef;
      case 'goal':
        return goalState.headingRef;
      default:
        return null;
    }
  }

  function destinationTitleFor(route: AddWorkspaceRoute): string {
    switch (route) {
      case 'asset':
        return assetState.title;
      case 'expense':
        return expenseState.title;
      case 'incomeSource':
        return incomeSourceState.title;
      case 'incomeReceived':
        return incomeReceivedState.title;
      case 'bill':
        return billState.title;
      case 'liability':
        return liabilityState.title;
      case 'creditCard':
        return creditCardState.title;
      case 'goal':
        return goalState.title;
      default:
        return '';
    }
  }

  function draftStateFor(route: Exclude<AddWorkspaceRoute, 'chooser'>): EmbeddedDestinationState {
    switch (route) {
      case 'transfer':
        return transferState;
      case 'asset':
        return assetState;
      case 'expense':
        return expenseState;
      case 'incomeSource':
        return incomeSourceState;
      case 'incomeReceived':
        return incomeReceivedState;
      case 'bill':
        return billState;
      case 'liability':
        return liabilityState;
      case 'creditCard':
        return creditCardState;
      case 'goal':
        return goalState;
    }
  }

  // Full-workspace extension — every destination that can hold a draft
  // across Back (i.e. every one except Transfer, which is exempt).
  function draftDestinations(): { route: Exclude<AddWorkspaceRoute, 'chooser'>; state: EmbeddedDestinationState }[] {
    // 'transfer' joins the parked-draft set in Wave 3 — it is no longer
    // the one destination excluded from switch/discard/parking protection.
    return (['asset', 'expense', 'incomeSource', 'incomeReceived', 'bill', 'liability', 'creditCard', 'goal', 'transfer'] as const).map((route) => ({
      route,
      state: draftStateFor(route),
    }));
  }

  // `excludeRoute` lets a caller ask "is any OTHER destination dirty" —
  // used by Asset's own tile-tap guard, which must not treat Asset's own
  // dirty state (a separate, already-handled concern via
  // decideAssetTileSelection) as if it were a different destination.
  function findParkedDirtyDraft(excludeRoute?: AddWorkspaceRoute) {
    return draftDestinations().find((d) => d.route !== excludeRoute && d.state.everEnteredRef.current && d.state.isDirty);
  }

  // Discard-orchestration correction — a human-readable name for the
  // switching-confirmation copy ("Switch to {destination}?" / "Your
  // unsaved {source} changes will be discarded."). Fixed per route, except
  // 'asset', which represents five different preset types sharing one
  // route — uses whichever preset is actually loaded/being requested.
  function routeDisplayName(route: AddWorkspaceRoute, presetType?: AssetType | LiabilityType): string {
    if (route === 'asset') {
      switch ((presetType as AssetType | undefined) ?? assetPresetType) {
        case 'cash':
          return 'Cash';
        case 'savings':
          return 'Savings';
        case 'everyday':
          return 'Everyday Account';
        case 'etf':
          return 'Investment';
        case 'property':
          return 'Property';
        case 'super':
          return 'Retirement savings';
        case 'car':
          return 'Vehicle';
        default:
          return 'Asset';
      }
    }
    // Correction pass — a liability's customer-facing name is its loan
    // TYPE (Personal Loan/Mortgage/Car Loan/...), never the generic
    // "Liability" the reducer's own route name would otherwise produce.
    // Falls back to the currently handed-off type (the type this
    // workspace's own dirty/parked liability draft is FOR) when no
    // explicit type is passed, mirroring the asset branch above exactly —
    // reuses AddWealthItemModal's own LIABILITY_DISPLAY_NAME table so the
    // two files can never drift.
    if (route === 'liability') {
      const type = (presetType as LiabilityType | undefined) ?? liabilityHandoffType ?? undefined;
      return type ? LIABILITY_DISPLAY_NAME[type] : 'Liability';
    }
    switch (route) {
      case 'chooser':
        return 'chooser';
      case 'transfer':
        return 'Transfer';
      case 'expense':
        return 'Expense';
      case 'incomeSource':
        return 'Income source';
      case 'incomeReceived':
        return 'Income received';
      case 'bill':
        return 'Bill';
      case 'creditCard':
        return 'Credit card';
      case 'goal':
        return 'Goal';
    }
  }

  // Discard-orchestration correction — the ONE place Alert.alert is ever
  // invoked for a cross-destination switch (asset-type switching keeps its
  // own separate, already-accepted confirmSwitchAssetType/wording, unifed
  // by the same underlying principle but not this same call site). Called
  // ONLY from an explicit destructive-intent handler (a tile tap, never a
  // reactive effect or a side effect of Back/transition-completion).
  // Presents the warning immediately, before any transition starts (the
  // chooser — or whichever route the tap originated from — stays visually
  // stationary throughout); `onKeepEditing` reopens the exact dirty source
  // draft; `onDiscardAndContinue` resets that source exactly once and
  // proceeds to the requested target exactly once. Generation-guarded
  // against rapid taps producing duplicate alerts, and against a stale
  // callback (from an alert that should no longer apply) acting after a
  // newer request has already superseded it.
  const pendingSwitchRef = useRef<number | null>(null);
  const pendingSwitchGenerationRef = useRef(0);
  function presentSwitchGuard(sourceLabel: string, targetLabel: string, onKeepEditing: () => void, onDiscardAndContinue: () => void) {
    if (pendingSwitchRef.current !== null) return; // an alert is already showing — rapid-tap guard
    const myGeneration = ++pendingSwitchGenerationRef.current;
    pendingSwitchRef.current = myGeneration;
    Alert.alert(`Switch to ${targetLabel}?`, `Your unsaved ${sourceLabel} changes will be discarded.`, [
      {
        text: 'Keep editing',
        style: 'cancel',
        onPress: () => {
          if (pendingSwitchRef.current !== myGeneration) return; // stale — superseded since this alert was shown
          pendingSwitchRef.current = null;
          onKeepEditing();
        },
      },
      {
        text: 'Discard & continue',
        style: 'destructive',
        onPress: () => {
          if (pendingSwitchRef.current !== myGeneration) return;
          pendingSwitchRef.current = null;
          onDiscardAndContinue();
        },
      },
    ]);
  }

  // Resets one destination's underlying form state completely, by forcing
  // a full unmount+remount (see useEmbeddedDestinationState's own
  // instanceKey comment) — the ONLY thing "Discard & continue" ever does
  // to the source besides transitioning away from it.
  function resetDraft(route: Exclude<AddWorkspaceRoute, 'chooser'>) {
    draftStateFor(route).setInstanceKey((k) => k + 1);
  }

  // "Keep editing" reopens the exact dirty source draft — a plain restore
  // (the destination is already everEntered, so this is the same "same
  // destination reselect" path every ordinary restore already uses).
  // Correction pass — when this is invoked from the CHOOSER (every
  // existing caller: reselectOrEnter, chooseAssetTile, the transfer
  // branch of handleTilePress), a plain enterRoute is correct — the
  // reducer's own FORWARD precondition requires chooser as the origin,
  // which already holds. But presentSwitchGuard can ALSO be triggered
  // from WITHIN another active destination (handleRequestLoanFromBill,
  // called while Bill itself — not chooser — is current), where a plain
  // enterRoute would silently no-op against that same precondition.
  // Reuses the SAME handoff mechanism an ordinary cross-destination
  // handoff already uses for exactly this reason.
  function reopenSource(route: Exclude<AddWorkspaceRoute, 'chooser'>) {
    if (transition.current === 'chooser') {
      // Reopening a parked draft is by definition a catalogue-origin entry.
      enterRoute(route, true);
    } else {
      handoffToRoute(route, () => {});
    }
  }

  // Discard-orchestration correction (Defect 1 fix) — the outer
  // KeyboardSheet's OWN dismiss attempts (swipe/backdrop/Android-back/
  // native onRequestClose) are delegated here in full (see KeyboardSheet's
  // own onRequestDismiss prop) rather than letting KeyboardSheet run its
  // own isDirty-gated confirmDiscardIfDirty flow, because only the HOST
  // knows whether the at-risk draft is the ACTIVE route or one PARKED
  // behind the chooser — and only the host can push a parked route back
  // open. Mirrors presentSwitchGuard's own generation-safe mechanism
  // (rapid-tap guard + stale-callback guard), so repeated dismiss attempts
  // can never stack duplicate alerts and a callback from an alert that's
  // since been superseded (e.g. by the sheet closing and reopening for a
  // later session — see the fresh-open effect above, which nulls this ref)
  // can never act.
  const pendingDismissRef = useRef<number | null>(null);
  const pendingDismissGenerationRef = useRef(0);
  function presentDismissGuard(dirtyRoute: Exclude<AddWorkspaceRoute, 'chooser'>, wasActive: boolean) {
    if (pendingDismissRef.current !== null) return; // an alert is already showing — rapid-tap guard
    const myGeneration = ++pendingDismissGenerationRef.current;
    pendingDismissRef.current = myGeneration;
    const copy = DISCARD_COPY[dirtyRoute];
    Alert.alert(copy.title, copy.message, [
      {
        text: 'Keep editing',
        style: 'cancel',
        onPress: () => {
          if (pendingDismissRef.current !== myGeneration) return; // stale — superseded since this alert was shown
          pendingDismissRef.current = null;
          // Only a PARKED draft needs pushing back open — an already-
          // ACTIVE dirty route just needed the dismissal cancelled; the
          // user is already looking at it.
          if (!wasActive) reopenSource(dirtyRoute);
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (pendingDismissRef.current !== myGeneration) return;
          pendingDismissRef.current = null;
          resetDraft(dirtyRoute); // transfer now parks and resets like every other draft
          handleRequestClose();
        },
      },
    ]);
  }

  // The single entry point KeyboardSheet's onRequestDismiss calls for
  // every dismiss attempt against the complete Add Anything sheet. A
  // clean sheet closes immediately, exactly like before; a dirty one is
  // routed through presentDismissGuard using the SAME at-risk-draft
  // computation (activeRouteIsDirty/parkedDirtyDraft, declared below) the
  // sheet's own chrome already relies on, so this can never disagree with
  // what the user is actually looking at.
  function handleRequestDismiss() {
    if (!sheetIsDirty) {
      handleRequestClose();
      return;
    }
    const dirtyRoute = (activeRouteIsDirty ? transition.current : parkedDirtyDraft?.route) as Exclude<AddWorkspaceRoute, 'chooser'>;
    presentDismissGuard(dirtyRoute, activeRouteIsDirty);
  }

  // Runs the shared push-progress animation (or, under Reduced Motion, an
  // immediate content swap with no animation) for one FORWARD or BACK
  // transition, then invokes `onSettled` once genuinely complete — guarded
  // by `myGeneration` so a stale/interrupted completion can never act.
  function runTransition(direction: 'forward' | 'back', myGeneration: number, onSettled: () => void) {
    const fromValue = direction === 'forward' ? 0 : 1;
    const toValue = direction === 'forward' ? 1 : 0;
    if (reduceMotionEnabled) {
      workspaceProgress.setValue(toValue);
      onSettled();
      return;
    }
    workspaceProgress.setValue(fromValue);
    Animated.timing(workspaceProgress, { toValue, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== generationRef.current) return; // stale-completion guard
      onSettled();
    });
  }

  // The actual FORWARD dispatch/animation/focus-scheduling, shared by every
  // entry path (enterRoute, chooseAssetTile's proceedIntoAddAsset,
  // handoffToRoute). Does NOT itself check/set selectionLockRef — every
  // caller either checks it first (enterRoute) or is already holding it
  // for the duration of a handoff (handoffToRoute).
  function beginForwardTransition(route: AddWorkspaceRoute, returnStack?: AddWorkspaceRoute[]) {
    const myGeneration = ++generationRef.current;
    dispatchTransition({ type: 'FORWARD', route, returnStack });
    runTransition('forward', myGeneration, () => {
      dispatchTransition({ type: 'TRANSITION_COMPLETE' });
      if (route !== 'transfer') {
        pendingFocusRef.current = { generation: myGeneration, target: route };
      }
    });
  }

  /**
   * Design 5.1 Wave 3 — origin-aware entry (audit D5-001).
   *
   * `fromCatalogue` IS the origin contract. A task picked from the catalogue
   * seeds ['chooser'], so Back returns there with the draft parked. A task
   * entered directly — a quick tile or a contextual screen action — seeds [],
   * so it renders no Back control at all and the catalogue it never opened
   * can never be revealed.
   */
  function enterRoute(route: AddWorkspaceRoute, fromCatalogue: boolean, onCommit?: () => void) {
    if (selectionLockRef.current) return; // synchronous first-tap-wins
    selectionLockRef.current = true;
    onCommit?.();
    beginForwardTransition(route, fromCatalogue ? ['chooser'] : []);
  }

  function enterTransfer(fromCatalogue: boolean) {
    enterRoute('transfer', fromCatalogue);
  }

  // "Reselecting the same destination restores its draft; selecting a
  // different destination while dirty needs accurate switch/discard
  // confirmation" — generalised across all seven plain 1:1 destinations.
  // Restoring an already-open draft never confirms (matches Asset's own
  // 'proceed' outcome for a same-type reselect); entering a route for the
  // first time (or after it was never dirty) proceeds directly unless some
  // OTHER destination is currently dirty-and-parked, in which case
  // presentSwitchGuard confirms BEFORE any transition starts — the current
  // settled route (chooser, always, for this call site) stays visually
  // stationary until the user answers.
  function reselectOrEnter(route: Exclude<AddWorkspaceRoute, 'chooser' | 'transfer' | 'asset'>, fromCatalogue: boolean) {
    const state = draftStateFor(route);
    const commit = () => {
      state.everEnteredRef.current = true;
    };
    if (state.everEnteredRef.current) {
      enterRoute(route, fromCatalogue, commit);
      return;
    }
    const dirty = findParkedDirtyDraft();
    if (dirty) {
      presentSwitchGuard(
        routeDisplayName(dirty.route),
        routeDisplayName(route),
        () => reopenSource(dirty.route),
        () => {
          resetDraft(dirty.route);
          enterRoute(route, fromCatalogue, commit);
        }
      );
      return;
    }
    enterRoute(route, fromCatalogue, commit);
  }

  // Discard-orchestration correction — Back pops transition.returnStack[0]
  // as its target: 'chooser' for an ordinary entry, or a specific other
  // destination for a cross-destination handoff, correctly preserving
  // every deeper ancestor level for the NEXT Back too (the reducer's own
  // returnStack field — see its declaration comment for why a single
  // scalar field cannot represent a nested handoff chain). Never itself
  // shows a discard prompt — Back is always non-destructive, preserving
  // whatever draft it leaves behind exactly as-is.
  function handleBack() {
    if (returningToChooserRef.current) return; // synchronous re-entrancy guard for Back itself
    returningToChooserRef.current = true;
    const leavingRoute = transition.current;
    const targetRoute = transition.returnStack[0];
    const myGeneration = ++generationRef.current;
    dispatchTransition({ type: 'BACK' });
    runTransition('back', myGeneration, () => {
      dispatchTransition({ type: 'TRANSITION_COMPLETE' });
      if (leavingRoute !== 'transfer') {
        pendingFocusRef.current = { generation: myGeneration, target: targetRoute, fromRoute: leavingRoute };
      }
      selectionLockRef.current = false; // released only once the target route is settled
      returningToChooserRef.current = false;
    });
  }

  // Full-workspace extension — the two cross-destination handoffs (Bill ->
  // Liability, Liability -> Credit card). Expressed as a FORCE_TO_CHOOSER
  // step immediately chained into a FORWARD, both using the same accepted
  // reducer contract that governs every other transition in this
  // workspace (FORWARD only accepts a settled chooser as its origin) — so
  // a direct non-chooser-to-non-chooser hop is a two-step chain rather
  // than a special-cased third transition primitive. Nested-handoff
  // amendment — the route being LEFT and its own full returnStack are
  // captured HERE, before FORCE_TO_CHOOSER discards them from the reducer
  // state, then threaded through as the next FORWARD's explicit
  // returnStack override ([leavingRoute, ...its own stack]) — this is what
  // lets a SECOND-level handoff (e.g. Liability -> Credit card, where
  // Liability itself was entered via the Bill handoff) preserve BOTH
  // ancestor levels rather than losing Bill entirely. selectionLockRef is
  // deliberately never released between the two steps (the workspace is
  // "busy" handing off; the chooser is never actually presented as an
  // interactive resting state mid-handoff) — no Modal dismissal to
  // sequence, no defer/timer dance.
  function handoffToRoute(nextRoute: AddWorkspaceRoute, prepare: () => void) {
    if (returningToChooserRef.current) return;
    returningToChooserRef.current = true;
    const leavingRoute = transition.current;
    const inheritedStack = transition.returnStack;
    const backGeneration = ++generationRef.current;
    dispatchTransition({ type: 'FORCE_TO_CHOOSER' });
    runTransition('back', backGeneration, () => {
      dispatchTransition({ type: 'TRANSITION_COMPLETE' });
      returningToChooserRef.current = false;
      prepare();
      beginForwardTransition(nextRoute, [leavingRoute, ...inheritedStack]);
    });
  }

  // Bill's own "Mortgage/Car loan/Personal loan" presets hand off here with
  // the exact LiabilityType, mirroring the standalone loanHandoff mechanism
  // FloatingAddButton used to own. Narrowly guarded against silently
  // overwriting an existing, separately-dirty parked Liability draft — the
  // one genuine new risk this in-host handoff introduces relative to the
  // old separate-Modal version, where no such shared draft could exist.
  // Uses the same presentSwitchGuard primitive as an ordinary tile switch
  // (source and target both read "Liability" here, since re-entering with
  // a different loan type discards and replaces the SAME route's draft).
  function handleRequestLoanFromBill(type: LiabilityType) {
    const proceed = () =>
      handoffToRoute('liability', () => {
        setLiabilityHandoffType(type);
        liabilityState.everEnteredRef.current = true;
      });
    // Correction pass — re-tapping the SAME loan preset that is already
    // the dirty, parked Liability draft (e.g. backing out of an unsaved
    // Personal Loan to the picker, then to the Bill grid, then tapping
    // "Personal Loan" again to continue) is a same-destination reselect,
    // exactly like reselectOrEnter's own same-route branch below — nothing
    // would be discarded by proceeding, so it must restore silently and
    // never warn. Only a genuinely DIFFERENT loan type risks discarding
    // that OTHER draft, and still warns — now correctly naming both the
    // dirty source's own type and the newly-requested type instead of the
    // generic "Liability" for both.
    if (liabilityState.everEnteredRef.current && liabilityState.isDirty && liabilityHandoffType !== type) {
      presentSwitchGuard(
        routeDisplayName('liability', liabilityHandoffType ?? undefined),
        routeDisplayName('liability', type),
        () => reopenSource('liability'),
        () => {
          resetDraft('liability');
          proceed();
        }
      );
      return;
    }
    proceed();
  }

  // Liability's own credit-card type chip hands off here, mirroring the
  // standalone onSelectCreditCard mechanism AddWealthItemModal already
  // supports for the non-embedded case.
  // Correction pass — Credit Card has no type variants (unlike Liability's
  // loan types), so a dirty, parked Credit Card draft can only ever be
  // THIS SAME draft — tapping the "Credit card" chip again is always a
  // same-destination reselect (there is no "other" credit card it could be
  // switching away from), matching handleRequestLoanFromBill's own
  // same-type branch above. Never warns; always hands off, preserving
  // whatever is already typed (handoffToRoute never resets the draft).
  function handleRequestCreditCardFromLiability() {
    handoffToRoute('creditCard', () => {
      creditCardState.everEnteredRef.current = true;
    });
  }

  // ---- Asset (cash/savings/investment/property/retirement) — Option B
  // pilot logic, unchanged in behaviour, replumbed onto the shared
  // primitives above. ----
  function proceedIntoAddAsset(tileKey: AddAnythingKind, presetType: AssetType, freshInstance: boolean, fromCatalogue: boolean) {
    if (selectionLockRef.current) return; // synchronous first-tap-wins
    selectionLockRef.current = true;
    if (freshInstance) {
      assetState.setInstanceKey((k) => k + 1);
    }
    setAssetPresetType(presetType);
    assetOriginTileKeyRef.current = tileKey;
    assetState.everEnteredRef.current = true;
    // Design 5.1 Wave 3 — the six asset destinations (cash, savings,
    // everyday, investment, property, retirement) reach the workspace
    // through this path rather than enterRoute, so they need the SAME
    // origin seeding. Omitting it here is what left a catalogue-selected
    // "Add everyday account" with no Back control on device.
    beginForwardTransition('asset', fromCatalogue ? ['chooser'] : []);
  }

  // Correction pass (§3) — the chooser tile's own onPress target for the
  // five asset presets. Resolves exactly one of four required outcomes:
  // A. never entered this session -> plain first entry;
  // B. same asset type already open/preserved -> restore it exactly, no
  //    reset, no save;
  // C. a different type, current draft clean -> silently re-initialise
  //    with the newly selected type (nothing of value is lost);
  // D. a different type, current draft dirty -> "Switch asset type?"
  //    confirmation. No asset is ever persisted by any path here — only
  //    addAsset/updateAsset (inside AddWealthItemModal's own unchanged
  //    Save path) ever persists one. This inner decision (Asset's own
  //    type-vs-type dirty check) is the Option B pilot's own
  //    already-tested logic, preserved exactly, not re-authored by this
  //    extension. Discard-orchestration correction, item 7 — closes the
  //    previously-disclosed Asset gap: every asset tile now ALSO passes
  //    through the SAME global dirty-destination guard every other tile
  //    uses, before ever reaching the inner decision above, so tapping an
  //    asset tile can no longer silently bypass a dirty Expense/Income/
  //    Bill/Liability/Credit Card/Goal draft.
  function chooseAssetTile(tileKey: AddAnythingKind, fromCatalogue: boolean) {
    const presetType = ASSET_PRESET_MAP[tileKey];
    if (!presetType) return;

    const otherDirty = findParkedDirtyDraft('asset');
    if (otherDirty) {
      presentSwitchGuard(
        routeDisplayName(otherDirty.route),
        routeDisplayName('asset', presetType),
        () => reopenSource(otherDirty.route),
        () => {
          resetDraft(otherDirty.route);
          proceedWithAssetTileDecision(tileKey, presetType, fromCatalogue);
        }
      );
      return;
    }
    proceedWithAssetTileDecision(tileKey, presetType, fromCatalogue);
  }

  function proceedWithAssetTileDecision(tileKey: AddAnythingKind, presetType: AssetType, fromCatalogue: boolean) {
    const outcome = decideAssetTileSelection({
      everEntered: assetState.everEnteredRef.current,
      currentPresetType: assetPresetType,
      selectedPresetType: presetType,
      isDirty: assetState.isDirty,
    });

    switch (outcome.action) {
      case 'proceed':
        proceedIntoAddAsset(tileKey, presetType, false, fromCatalogue);
        return;
      case 'switchClean':
        proceedIntoAddAsset(tileKey, presetType, true, fromCatalogue);
        return;
      case 'confirmSwitch': {
        const currentPresetType = assetPresetType;
        const currentOriginTileKey = assetOriginTileKeyRef.current ?? tileKey;
        confirmSwitchAssetType(
          () => proceedIntoAddAsset(tileKey, presetType, true, fromCatalogue),
          () => proceedIntoAddAsset(currentOriginTileKey, currentPresetType, false, fromCatalogue)
        );
        return;
      }
    }
  }

  // Successful Save on ANY destination bypasses the outer KeyboardSheet's
  // own dismiss/discard gating entirely (it calls this directly, matching
  // Transfer's and Asset's own established onSaveSuccess wiring) — so it
  // must independently invalidate any still-pending focus work and any
  // in-flight transition generation, exactly as backToChooser/the sheet's
  // own onClose already do for every other close path.
  function handleSaveSuccessClose() {
    // Wave 10 closure — the ONE shared successful-Save authority for every
    // Add task (all nine embedded destinations wire this exact callback,
    // covering the full 14-kind catalogue plus the direct-entry Vehicle
    // kind). Fires the action's single softSuccess and hands over the calm
    // factual confirmation, whose title derives from the destination's own
    // canonical display name; a richer celebration unlocked by this same
    // save claims and replaces that toast (see CelebrationContext).
    const savedRoute = transition.current;
    confirmSaveSuccess(
      buildSaveConfirmation(
        routeDisplayName(savedRoute),
        savedRoute === 'transfer' || savedRoute === 'incomeReceived' ? 'recorded' : 'added'
      )
    );
    generationRef.current++;
    pendingFocusRef.current = null;
    onClose();
  }

  function handleConfirmedClose(reason: EmbeddedCloseReason) {
    if (reason === 'back') {
      handleBack();
    } else {
      onClose();
    }
  }

  // Full-workspace extension — the chooser tile grid's own dispatch table.
  // The five asset presets keep their own dedicated decision function
  // (chooseAssetTile); Transfer keeps its own dedicated entry (no draft to
  // restore, ever, so a same-destination reselect never applies to it);
  // the remaining seven share one generic reselectOrEnter path. Every
  // branch here routes through the SAME presentSwitchGuard primitive
  // before starting any transition (discard-orchestration correction).
  function handleTilePress(key: AddAnythingKind, fromCatalogue = true) {
    const assetPresetType = ASSET_PRESET_MAP[key];
    if (assetPresetType) {
      chooseAssetTile(key, fromCatalogue);
      return;
    }
    if (key === 'transfer') {
      const dirty = findParkedDirtyDraft();
      if (dirty) {
        presentSwitchGuard(
          routeDisplayName(dirty.route),
          routeDisplayName('transfer'),
          () => reopenSource(dirty.route),
          () => {
            resetDraft(dirty.route);
            enterTransfer(fromCatalogue);
          }
        );
        return;
      }
      enterTransfer(fromCatalogue);
      return;
    }
    const route = TILE_TO_ROUTE[key];
    if (!route) return;
    if (route === 'liability' && !liabilityState.everEnteredRef.current) {
      // A genuinely fresh entry via the plain tile is always a 'create'
      // intent — clears any Bill-handoff preset left over from a previous
      // session so the plain tile never silently inherits a stale handoff
      // type. Restoring an already-open liability draft (handled by
      // reselectOrEnter below) preserves whatever intent it already had.
      setLiabilityHandoffType(null);
    }
    reselectOrEnter(route, fromCatalogue);
  }

  // KeyboardSheet's own backdrop/swipe/Android-Back path — always closes
  // the whole Add flow (never "internal Back", which is its own explicit
  // control per destination below). Also invalidates any in-flight
  // transition so a stale completion callback can never fire after this
  // sheet has started closing.
  function handleRequestClose() {
    generationRef.current++;
    pendingFocusRef.current = null;
    onClose();
  }

  // Full-workspace extension — the outer KeyboardSheet's own isDirty (and,
  // via handleRequestDismiss above, its dismiss-guard copy) must reflect
  // ANY currently-at-risk draft: the actively-open route's own dirty
  // state, or (while resting on the chooser) any OTHER destination's
  // parked-but-dirty draft — "backdrop/swipe follow the same dirty-state
  // protection" applies to whichever one is genuinely at risk, not only
  // the literal active route.
  const activeRouteIsDirty = (() => {
    if (transition.current === 'chooser') return false;
    if (transition.current === 'transfer') return transferIsDirty;
    return draftStateFor(transition.current).isDirty;
  })();
  // The first genuine parent step, if any. 'chooser' is deliberately not a
  // parent — returning to the catalogue is not a nested journey.
  const nestedParentRoute = (() => {
    const parent = transition.returnStack.find((r) => r !== 'chooser');
    return parent && transition.current !== 'chooser' ? parent : null;
  })();
  // A catalogue row shows DRAFT when its destination is holding a parked,
  // dirty draft — the same state findParkedDirtyDraft already tracks.
  function hasParkedDraft(key: AddAnythingKind): boolean {
    if (key === 'transfer') return transition.current !== 'transfer' && transferState.isDirty;
    const assetPreset = ASSET_PRESET_MAP[key];
    if (assetPreset) {
      return transition.current !== 'asset' && assetState.isDirty && assetPresetType === assetPreset;
    }
    const route = TILE_TO_ROUTE[key];
    if (!route) return false;
    return transition.current !== route && draftStateFor(route).isDirty;
  }
  const parkedDirtyDraft = findParkedDirtyDraft();
  const sheetIsDirty = activeRouteIsDirty || !!parkedDirtyDraft;

  type ActiveChrome = { title: string; canSave: boolean; primaryLabel: string; showFooter: boolean };
  function computeActiveChrome(): ActiveChrome {
    switch (transition.current) {
      case 'chooser':
        return { title: onlyBalances ? 'Add a money balance' : `Add to ${brand.name}`, canSave: false, primaryLabel: 'Save', showFooter: false };
      case 'transfer':
        return { title: 'Move money', canSave: transferCanSave, primaryLabel: 'Transfer', showFooter: true };
      case 'asset':
        return { title: assetState.title, canSave: assetState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'expense':
        return { title: expenseState.title, canSave: expenseState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'incomeSource':
        return { title: incomeSourceState.title, canSave: incomeSourceState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'incomeReceived':
        return { title: incomeReceivedState.title, canSave: incomeReceivedState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'bill':
        return { title: billState.title, canSave: billState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'liability':
        return { title: liabilityState.title, canSave: liabilityState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'creditCard':
        return { title: creditCardState.title, canSave: creditCardState.canSave, primaryLabel: 'Save', showFooter: true };
      case 'goal':
        return { title: goalState.title, canSave: goalState.canSave, primaryLabel: 'Save', showFooter: true };
    }
  }
  const activeChrome = computeActiveChrome();

  function callActiveSave() {
    switch (transition.current) {
      case 'transfer':
        transferFormRef.current?.requestSave();
        return;
      case 'asset':
        assetModalRef.current?.requestSave();
        return;
      case 'expense':
        expenseModalRef.current?.requestSave();
        return;
      case 'incomeSource':
        incomeSourceModalRef.current?.requestSave();
        return;
      case 'incomeReceived':
        incomeReceivedModalRef.current?.requestSave();
        return;
      case 'bill':
        billModalRef.current?.requestSave();
        return;
      case 'liability':
        liabilityModalRef.current?.requestSave();
        return;
      case 'creditCard':
        creditCardModalRef.current?.requestSave();
        return;
      case 'goal':
        goalModalRef.current?.requestSave();
        return;
      default:
        return;
    }
  }

  function callActiveRequestCancel() {
    switch (transition.current) {
      case 'transfer':
        transferFormRef.current?.requestClose('cancel');
        return;
      case 'asset':
        assetModalRef.current?.requestClose('cancel');
        return;
      case 'expense':
        expenseModalRef.current?.requestClose('cancel');
        return;
      case 'incomeSource':
        incomeSourceModalRef.current?.requestClose('cancel');
        return;
      case 'incomeReceived':
        incomeReceivedModalRef.current?.requestClose('cancel');
        return;
      case 'bill':
        billModalRef.current?.requestClose('cancel');
        return;
      case 'liability':
        liabilityModalRef.current?.requestClose('cancel');
        return;
      case 'creditCard':
        creditCardModalRef.current?.requestClose('cancel');
        return;
      case 'goal':
        goalModalRef.current?.requestClose('cancel');
        return;
      default:
        return;
    }
  }

  // Premium-transition correction — the sheet's own outer height is fixed
  // and content-independent (never derived from any step's own content),
  // computed once per render from the window's own reactive dimensions and
  // the device's current top safe-area inset. Passed straight to
  // KeyboardSheet's fixedSheetHeight prop, which itself derives the actual
  // keyboard-adjusted render height.
  const { fixedSheetHeight } = computeAddWorkspaceGeometry({ windowHeight: windowDimensions.height, topInset: insets.top });

  // Premium-transition correction, generalised — the chooser's own
  // translateX is driven by the ONE shared progress value; whichever
  // destination is currently the transition's "active side" (current or
  // outgoing) shares that exact same value (mirrored, entering from the
  // right as chooser exits left); every OTHER, merely-parked destination
  // is pinned fully off-screen right regardless of the live progress value
  // — never sharing the animated position of an unrelated, currently-
  // active transition.
  //
  // Nested-handoff geometry correction, corrected round — every one of
  // these four interpolations (including the two "stationary" ones added
  // below) is memoized on viewportWidth alone, and destinationTranslateX
  // (further down) now returns ONE of these four for every possible route
  // state — never a bare JS number. The first attempt at this fix pinned
  // a settled/back-entered route to a literal `0` and left every
  // "uninvolved" route on a literal `viewportWidth` (both pre-existing,
  // in the "uninvolved" case's case, since before any of this round's
  // changes). On the physical device that meant certain routes' `<Animated.
  // View>` transform prop flipped, across a single commit, from a plain
  // number to a brand-new interpolation object newly connecting to an
  // ALREADY-RUNNING native-driven animation (Liability's own exit,
  // starting the instant Bill's Back fires) — the exact case React
  // Native's Animated/native-driver bridge is least reliable at
  // catching up on the very first frame. The device recording's
  // "persistent blank Bill body, thin tile slivers, several seconds"
  // symptom is consistent with the LATER-rendered, higher-stacked
  // Liability layer failing to visibly complete that catch-up and
  // remaining near its old resting position, covering Bill underneath —
  // even though Bill's own position had by then become correct. Every
  // interpolation below is therefore live for the FULL mounted lifetime
  // of every destination layer — settled-and-onscreen and settled-and-
  // offscreen are now constant-valued interpolations, not numbers — so no
  // route's transform prop ever crosses that number-to-animated-node
  // boundary again, on entry OR exit, in any direction.
  const chooserTranslateX = useMemo(() => workspaceProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -viewportWidth] }), [workspaceProgress, viewportWidth]);
  const activeDestinationTranslateX = useMemo(() => workspaceProgress.interpolate({ inputRange: [0, 1], outputRange: [viewportWidth, 0] }), [workspaceProgress, viewportWidth]);
  // Constant-valued (both ends of the range are the same number) but still
  // a genuine AnimatedInterpolation — used for a route that is settled
  // on-screen (front, at rest) regardless of whether it arrived via an
  // ordinary forward entry or a cross-destination Back.
  const stationaryOnscreenTranslateX = useMemo(() => workspaceProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0] }), [workspaceProgress]);
  // Same idea for a route that is not involved in the current transition
  // at all — parked fully off-screen, but as a live node rather than a
  // bare number, so a route's LATER entry (when it does become involved)
  // switches between two live interpolations, never from a plain number.
  const stationaryOffscreenTranslateX = useMemo(() => workspaceProgress.interpolate({ inputRange: [0, 1], outputRange: [viewportWidth, viewportWidth] }), [workspaceProgress, viewportWidth]);

  function handleViewportLayout(e: { nativeEvent: { layout: { width: number } } }) {
    const measured = e.nativeEvent.layout.width;
    setMeasuredViewportWidth((prev) => (prev === measured ? prev : measured));
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.lg },
        groupTitle: { ...typography.caption, fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm, marginTop: spacing.md },
        // Design 5.1 doc A p.5 — the catalogue is full-width rows grouped in
        // cards, not a tile grid: 52pt rows, leading icon, label, qualifier,
        // trailing DRAFT badge.
        rowGroup: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          overflow: 'hidden',
          marginBottom: spacing.md,
        },
        taskRow: {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
        taskRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
        rowLabel: { ...typography.body, fontSize: 15, fontWeight: '600', color: semantic.textPrimary, flex: 1 },
        rowQualifier: { ...typography.micro, fontSize: 11, color: semantic.textTertiary },
        draftBadge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 5,
          backgroundColor: semantic.bgRaised,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
        },
        draftBadgeText: { ...typography.micro, fontSize: 9, fontWeight: '700', color: semantic.textSecondary, letterSpacing: 0.5 },
        rowChevron: { ...typography.body, fontSize: 18, color: semantic.textTertiary },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        tile: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        tileLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        // Design 5.1 doc A p.5 — the disambiguating qualifier ("recurring",
        // "one-off", "super", "loan / BNPL"), quieter than the label itself.
        breadcrumbText: { ...typography.micro, fontSize: 11, color: semantic.textTertiary },
        headerCloseButton: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'flex-end', justifyContent: 'center' },
        headerCloseLabel: { ...typography.body, fontSize: 15, fontWeight: '600', color: semantic.interactive },
        tileQualifier: { ...typography.micro, fontSize: 10, color: semantic.textTertiary, textAlign: 'center', marginTop: 1 },
        viewport: { flex: 1, overflow: 'hidden' },
        pushLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
        pushLayerScroll: { flex: 1 },
        backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
        backRowText: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '600' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  const showChooser = isRouteActiveInTransition(transition, 'chooser');

  // Full-workspace extension — the shared wrapper every persistent
  // destination layer uses: an opaque, absolutely-positioned,
  // independently-scrolling layer with its own Back row and accessibility
  // heading, mounted only while `mounted` is true (draft preservation),
  // positioned by the shared progress value only while genuinely the
  // transition's active side, and pointerEvents/accessibility-hidden
  // unless genuinely the settled front step. A plain render-helper
  // function (called inline, not used as a JSX component tag), so it
  // carries no remount risk despite being defined inside this component's
  // body.
  // Nested-handoff geometry correction — a cross-destination Back (e.g.
  // Liability -> Bill, via handleBack popping transition.returnStack
  // straight to a non-chooser route) lands DIRECTLY on that route without
  // ever passing back through chooser — unlike every transition this
  // geometry was originally built for, which always has chooser on one
  // side. activeDestinationTranslateX assumes ITS route is always ENTERING
  // FROM OFF-SCREEN-RIGHT: workspaceProgress rests at 1 after an ordinary
  // forward-settle, where the formula correctly evaluates to 0. A route
  // that becomes `current` via BACK instead rests at workspaceProgress 0,
  // where that SAME formula evaluates to viewportWidth — fully OFF-SCREEN
  // — even once genuinely settled. Left uncorrected, that silently and
  // permanently hides the returned-to route's content behind its own
  // still-visible host chrome (title/footer, driven independently by
  // transition.current).
  //
  // Every branch below returns one of the four live interpolations
  // declared above — never a bare number (see their own shared comment
  // for why: a route's transform prop must never cross the plain-number-
  // to-freshly-attached-animated-node boundary, which is what actually
  // broke on device the first time this was attempted). A settled/front
  // route is always stationaryOnscreenTranslateX, regardless of whether it
  // arrived via an ordinary forward entry or a cross-destination Back. The
  // outgoing (exiting) route keeps the existing, unchanged
  // activeDestinationTranslateX animation. A route becoming current via an
  // ordinary FORWARD keeps its existing slide-in animation
  // (activeDestinationTranslateX); one becoming current via a BACK is
  // instead held at stationaryOnscreenTranslateX for the ENTIRE
  // transition, not just once settled — it is revealed instantly and held
  // there while the exiting sibling slides away above it. A route not
  // involved at all stays on stationaryOffscreenTranslateX.
  function destinationTranslateX(route: Exclude<AddWorkspaceRoute, 'chooser'>) {
    if (isRouteSettledFront(transition, route)) return stationaryOnscreenTranslateX;
    if (transition.outgoing === route) return activeDestinationTranslateX;
    if (transition.current === route) return transition.direction === 'back' ? stationaryOnscreenTranslateX : activeDestinationTranslateX;
    return stationaryOffscreenTranslateX;
  }

  function renderDestinationLayer(
    route: Exclude<AddWorkspaceRoute, 'chooser'>,
    mounted: boolean,
    headingRef: React.RefObject<Text | null>,
    title: string,
    onBack: () => void,
    children: React.ReactNode
  ) {
    if (!mounted) return null;
    const settled = isRouteSettledFront(transition, route);
    const translateX = destinationTranslateX(route);
    return (
      <Animated.View
        key={route}
        style={[styles.pushLayer, { transform: [{ translateX }] }]}
        pointerEvents={settled ? 'auto' : 'none'}
        accessibilityElementsHidden={!settled}
        importantForAccessibility={settled ? 'auto' : 'no-hide-descendants'}
      >
        <ScrollView style={styles.pushLayerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Design 5.1 doc A p.5 — a Back control exists ONLY when there is
              a genuine previous step. A direct quick or contextual entry
              renders nothing here: not a hidden control, not an empty
              container, so it never reaches the accessibility tree. */}
          {transition.returnStack.length > 0 ? (
            <TouchableOpacity style={styles.backRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={18} color={colors.accentStrong} />
              <Text style={styles.backRowText}>Back</Text>
            </TouchableOpacity>
          ) : null}
          <Text ref={headingRef} style={styles.body} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </ScrollView>
      </Animated.View>
    );
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleRequestClose}
      title={activeChrome.title}
      isDirty={sheetIsDirty}
      onRequestDismiss={handleRequestDismiss}
      breadcrumb={
        // Only a GENUINE nested handoff gets a breadcrumb: the return stack
        // must contain a real parent workspace step. A catalogue-origin task
        // has only ['chooser'] — a chooser is not a parent step, so no
        // fabricated "Add to Nolie ·" crumb is ever shown. A workspace root
        // (empty stack) shows nothing at all.
        nestedParentRoute ? (
          <Text style={styles.breadcrumbText} accessibilityRole="text">
            {`${routeDisplayName(nestedParentRoute)} · ${destinationTitleFor(transition.current)}`}
          </Text>
        ) : null
      }
      headerRight={
        // Design 5.1 doc A p.5 — the catalogue carries a VISIBLE Close.
        // Swipe-down and Android Back already worked but are invisible
        // affordances, so the recording showed no way out of the catalogue.
        // Routes through the same journey-level dismiss path everything else
        // uses, so the existing dirty-discard protection applies unchanged;
        // no new dismissal state, no timeout.
        transition.current === 'chooser' ? (
          <TouchableOpacity
            onPress={handleRequestDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerCloseButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.headerCloseLabel}>Close</Text>
          </TouchableOpacity>
        ) : null
      }
      footer={
        activeChrome.showFooter ? (
          <>
            <Button label="Cancel" variant="secondary" onPress={callActiveRequestCancel} style={styles.footerButton} />
            <Button label={activeChrome.primaryLabel} onPress={callActiveSave} disabled={!activeChrome.canSave} style={styles.footerButton} />
          </>
        ) : null
      }
      fixedSheetHeight={fixedSheetHeight}
    >
      <View style={styles.viewport} onLayout={handleViewportLayout}>
        {showChooser ? (
          <Animated.View
            style={[styles.pushLayer, { transform: [{ translateX: chooserTranslateX }] }]}
            pointerEvents={isRouteSettledFront(transition, 'chooser') ? 'auto' : 'none'}
            accessibilityElementsHidden={!isRouteSettledFront(transition, 'chooser')}
            importantForAccessibility={isRouteSettledFront(transition, 'chooser') ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView style={styles.pushLayerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Design 5.1 doc A p.5 — the catalogue's own standing
                  subtitle. Scoped choosers (e.g. Money's "Add a balance")
                  keep their existing narrower prompt. */}
              <Text style={styles.body}>{onlyBalances ? 'Which kind of balance would you like to add?' : 'Everything you can record, in one place.'}</Text>
              {visibleGroups.map((group) => (
                <View key={group.title}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  <View style={styles.rowGroup}>
                    {group.options.map((o, i) => {
                      const parked = hasParkedDraft(o.key);
                      return (
                        <TouchableOpacity
                          key={o.key}
                          ref={(el) => {
                            // Accessibility focus restoration target for Back.
                            assetTileRefs.current[o.key] = el;
                          }}
                          style={[styles.taskRow, i > 0 && styles.taskRowDivided]}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          // One announcement per row: label, qualifier, draft.
                          accessibilityLabel={[o.label, o.qualifier, parked ? 'draft saved' : null].filter(Boolean).join(', ')}
                          onPress={() => handleTilePress(o.key)}
                        >
                          {/* Wave 4 device correction — one designed icon
                              language in place of platform emoji. Decorative:
                              the row's own accessibilityLabel above is the
                              complete announcement. */}
                          <AddIcon icon={addTaskIcon(o.key)} tile />
                          <Text style={styles.rowLabel} numberOfLines={2}>
                            {o.label}
                          </Text>
                          {o.qualifier ? <Text style={styles.rowQualifier}>{o.qualifier}</Text> : null}
                          {parked ? (
                            <View style={styles.draftBadge}>
                              <Text style={styles.draftBadgeText}>DRAFT</Text>
                            </View>
                          ) : null}
                          <Text style={styles.rowChevron}>›</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        {renderDestinationLayer(
          'transfer',
          isRouteActiveInTransition(transition, 'transfer'),
          transferHeadingRef,
          'Move money',
          () => transferFormRef.current?.requestClose('back'),
          <TransferForm
            key={transferState.instanceKey}
            ref={transferFormRef}
            embedded
            onCanSaveChange={(v) => {
              setTransferCanSave(v);
              transferState.setCanSave(v);
            }}
            onDirtyChange={(v) => {
              setTransferIsDirty(v);
              transferState.setIsDirty(v);
            }}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'asset',
          assetState.everEnteredRef.current,
          assetState.headingRef,
          assetState.title,
          () => assetModalRef.current?.requestClose('back'),
          <AddWealthItemModal
            key={assetState.instanceKey}
            ref={assetModalRef}
            visible
            embedded
            kind="asset"
            presetAssetType={assetPresetType}
            forcedIncludeInMoneyDefault={onlyBalances}
            onDirtyChange={assetState.setIsDirty}
            onCanSaveChange={assetState.setCanSave}
            onTitleChange={assetState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'expense',
          expenseState.everEnteredRef.current,
          expenseState.headingRef,
          expenseState.title,
          () => expenseModalRef.current?.requestClose('back'),
          <QuickAddModal
            key={expenseState.instanceKey}
            ref={expenseModalRef}
            visible
            embedded
            initialType="expense"
            onDirtyChange={expenseState.setIsDirty}
            onCanSaveChange={expenseState.setCanSave}
            onTitleChange={expenseState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'incomeReceived',
          incomeReceivedState.everEnteredRef.current,
          incomeReceivedState.headingRef,
          incomeReceivedState.title,
          () => incomeReceivedModalRef.current?.requestClose('back'),
          <QuickAddModal
            key={incomeReceivedState.instanceKey}
            ref={incomeReceivedModalRef}
            visible
            embedded
            initialType="income"
            onDirtyChange={incomeReceivedState.setIsDirty}
            onCanSaveChange={incomeReceivedState.setCanSave}
            onTitleChange={incomeReceivedState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'incomeSource',
          incomeSourceState.everEnteredRef.current,
          incomeSourceState.headingRef,
          incomeSourceState.title,
          () => incomeSourceModalRef.current?.requestClose('back'),
          <AddIncomeModal
            key={incomeSourceState.instanceKey}
            ref={incomeSourceModalRef}
            visible
            embedded
            suppressSavingsAllocationPrompt={suppressIncomePlannerPrompt}
            onDirtyChange={incomeSourceState.setIsDirty}
            onCanSaveChange={incomeSourceState.setCanSave}
            onTitleChange={incomeSourceState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'bill',
          billState.everEnteredRef.current,
          billState.headingRef,
          billState.title,
          () => billModalRef.current?.requestClose('back'),
          <AddRecurringItemModal
            key={billState.instanceKey}
            ref={billModalRef}
            visible
            embedded
            onRequestLoan={handleRequestLoanFromBill}
            onDirtyChange={billState.setIsDirty}
            onCanSaveChange={billState.setCanSave}
            onTitleChange={billState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'liability',
          liabilityState.everEnteredRef.current,
          liabilityState.headingRef,
          liabilityState.title,
          () => liabilityModalRef.current?.requestClose('back'),
          <AddWealthItemModal
            key={liabilityState.instanceKey}
            ref={liabilityModalRef}
            visible
            embedded
            kind="liability"
            presetLiabilityType={liabilityHandoffType ?? undefined}
            liabilityFlowIntent={liabilityHandoffType ? 'select_or_create_for_repayment' : 'create'}
            onRequestCreditCard={handleRequestCreditCardFromLiability}
            onDirtyChange={liabilityState.setIsDirty}
            onCanSaveChange={liabilityState.setCanSave}
            onTitleChange={liabilityState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'creditCard',
          creditCardState.everEnteredRef.current,
          creditCardState.headingRef,
          creditCardState.title,
          () => creditCardModalRef.current?.requestClose('back'),
          <AddCreditCardModal
            key={creditCardState.instanceKey}
            ref={creditCardModalRef}
            visible
            embedded
            onDirtyChange={creditCardState.setIsDirty}
            onCanSaveChange={creditCardState.setCanSave}
            onTitleChange={creditCardState.setTitle}
            onClose={onClose}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}

        {renderDestinationLayer(
          'goal',
          goalState.everEnteredRef.current,
          goalState.headingRef,
          goalState.title,
          () => goalModalRef.current?.requestClose('back'),
          <AddGoalModal
            key={goalState.instanceKey}
            ref={goalModalRef}
            visible
            embedded
            onClose={onClose}
            onDirtyChange={goalState.setIsDirty}
            onCanSaveChange={goalState.setCanSave}
            onSaveSuccess={handleSaveSuccessClose}
            onConfirmedClose={handleConfirmedClose}
          />
        )}
      </View>
    </KeyboardSheet>
  );
}
