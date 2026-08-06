import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, findNodeHandle, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { brand } from '../../lib/brand';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { TransferForm, TransferFormHandle } from '../wealth/TransferForm';
import { AddWealthItemModal, AddWealthItemModalHandle } from '../wealth/AddWealthItemModal';
import { AssetType } from '../../types/models';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import {
  reduceAddAssetTransition,
  initialAddAssetTransitionState,
  decideAssetTileSelection,
} from './addAssetTransitionController';
import { computeAddWorkspaceGeometry } from './addWorkspaceGeometry';

export type AddAnythingKind =
  | 'income'
  | 'income_received'
  | 'expense'
  | 'bill'
  | 'transfer'
  | 'cash'
  | 'savings'
  | 'investment'
  | 'property'
  | 'retirement'
  | 'liability'
  | 'creditCard'
  | 'goal';

interface AddAnythingOption {
  key: AddAnythingKind;
  label: string;
  emoji: string;
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
    title: 'Money',
    options: [
      { key: 'expense', label: 'Add expense', emoji: '🛒' },
      { key: 'income', label: 'Add income source', emoji: '💼' },
      { key: 'income_received', label: 'Record income received', emoji: '💰' },
      { key: 'bill', label: 'Add bill', emoji: '📅' },
      { key: 'transfer', label: 'Transfer money', emoji: '🔁' },
    ],
  },
  {
    title: 'Wealth',
    options: [
      { key: 'cash', label: 'Add cash', emoji: '💵' },
      { key: 'savings', label: 'Add savings', emoji: '🏦' },
      { key: 'investment', label: 'Add investment', emoji: '📈' },
      { key: 'property', label: 'Add property', emoji: '🏠' },
      { key: 'retirement', label: 'Add retirement savings', emoji: '🛡' },
    ],
  },
  {
    title: 'Debt and planning',
    options: [
      { key: 'liability', label: 'Add liability', emoji: '📄' },
      { key: 'creditCard', label: 'Add credit card', emoji: '💳' },
      { key: 'goal', label: 'Add goal', emoji: '🎯' },
    ],
  },
];

// RN Modal's onDismiss (fires once native dismissal has actually finished)
// is iOS-only — this approximates the same wait on Android, which never
// fires it. Still load-bearing for every kind EXCEPT 'transfer' (Stream D,
// persistent-host proof-of-pattern): choosing one of those destinations
// closes this whole sheet and defers the actual onSelect() call until this
// Modal's own dismissal has genuinely completed, so the destination Modal
// is never presented while this one is still mid-close.
const ANDROID_DISMISS_FALLBACK_MS = 300;

// Navigation Transitions, Option B premium-transition correction — the
// fixed-workspace rework retires the old natural-height-measurement scheme
// entirely (chooserNaturalHeight/addAssetNaturalHeight/combinedStableHeight/
// the invisible probe/every destination-content onLayout height handler).
// The sheet's own outer height is now content-independent, computed by
// addWorkspaceGeometry.ts's computeAddWorkspaceGeometry and passed straight
// to KeyboardSheet's fixedSheetHeight prop — it never changes as the
// internal step changes, so there is nothing left to measure or stabilise
// at this level. Each of the three steps (chooser/Transfer/Add Asset) is
// instead one opaque, absolutely-positioned, independently-scrolling layer
// that a single shared Animated.Value "push progress" per transition
// translates horizontally by the workspace's own measured viewport width —
// never opacity, never simultaneously-visible/"ghosted" layers.
const PUSH_TRANSITION_DURATION_MS = 220;

type Screen = 'chooser' | 'transfer';
type TransitionPhase = 'idle' | 'chooser-to-transfer' | 'transfer-to-chooser';

// Navigation Transitions, Option B pilot — the exact same five tiles that
// today each close this whole sheet and open a SEPARATE, standalone
// AddWealthItemModal via FloatingAddButton's dismiss-and-defer fallback
// (choose()) instead progressively transition, inside this persistent
// host, into one embedded AddWealthItemModal (kind="asset") — mirroring
// exactly how "Transfer money" already does this for embedded Transfer.
// Every other tile (income/expense/bill/liability/creditCard/goal) is
// completely unaffected and still routes through the unchanged choose()
// fallback. Values match FloatingAddButton.tsx's own existing
// kind->presetAssetType mapping exactly, so the type a user lands on here
// is identical to what they'd have gotten from the now-bypassed fallback.
const ASSET_PRESET_MAP: Partial<Record<AddAnythingKind, AssetType>> = {
  cash: 'cash',
  savings: 'savings',
  investment: 'etf',
  property: 'property',
  retirement: 'super',
};

// Correction pass — accessibility focus movement. iOS VoiceOver and Android
// TalkBack need genuinely different native calls (there is no single RN API
// that moves focus correctly on both): AccessibilityInfo.setAccessibilityFocus
// posts a real UIAccessibility focus notification but is iOS-only (per RN's
// own type/behaviour) and needs a legacy numeric node handle
// (findNodeHandle); AccessibilityInfo.sendAccessibilityEvent(handle,'focus')
// is the modern, correctly-typed way to dispatch a native TalkBack focus
// event on Android, taking the host instance directly. Deliberately not
// using accessibilityLiveRegion for either platform — the correction
// explicitly requires not assuming that alone handles iOS focus, and it
// does not.
function focusElement(node: React.Component<unknown> | React.ElementRef<any> | null) {
  if (!node) return;
  if (Platform.OS === 'ios') {
    const tag = findNodeHandle(node as never);
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
  } else {
    AccessibilityInfo.sendAccessibilityEvent(node as never, 'focus');
  }
}

// Correction pass — asset-type switching (§3). Reuses Alert.alert directly,
// in the exact cancel/destructive shape confirmDiscardIfDirty already
// standardises on, because this one confirmation needs button wording
// confirmDiscardIfDirty's fixed "Keep editing"/"Discard" labels don't
// provide ("Continue editing"/"Discard and switch" — the specific,
// requested, neutral, coaching-not-shaming wording for switching TYPE,
// distinct from discarding entirely).
function confirmSwitchAssetType(onDiscardAndSwitch: () => void, onContinueEditing: () => void) {
  Alert.alert('Switch asset type?', 'Your current asset details will be discarded.', [
    { text: 'Continue editing', style: 'cancel', onPress: onContinueEditing },
    { text: 'Discard and switch', style: 'destructive', onPress: onDiscardAndSwitch },
  ]);
}

/**
 * "+" = add or update my money, "Lulu" = ask for guidance — a clear
 * separation (PRD ask). This sheet is the single entry point for every
 * kind of manual entry, reachable from anywhere via the global floating +
 * button, so Today no longer needs its own Quick Actions row.
 *
 * Stream D, persistent-host proof-of-pattern: this is the public host
 * boundary FloatingAddButton renders. It now owns one internal screen
 * transition (chooser <-> embedded Transfer, rendered through the SAME
 * KeyboardSheet-owned Modal/backdrop/swipe/Android-Back/keyboard/scroll/
 * footer this sheet delegates to below) alongside its pre-existing dismiss-
 * and-defer fallback for every other destination, unchanged. Every other
 * kind still closes this sheet and hands off to its own standalone Modal,
 * exactly as before.
 */
export function AddAnythingSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (kind: AddAnythingKind) => void }) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();

  // Synchronous, ref-based, cross-path chooser-selection lock (correction
  // pass). React state (transitionPhase) is only visible to a new render —
  // two taps arriving in the same tick, before that render happens, could
  // both read the same stale value from their own closures. A ref read-
  // then-write is atomic within one JS tick (RN dispatches each tap as its
  // own synchronous callback; there is no interleaving between two
  // handlers), so this ref — checked FIRST and set synchronously before any
  // state setter, animation, or dismissal begins — is the ONLY correct
  // first-tap-wins gate shared between embedded Transfer entry
  // (enterTransfer) and every Option B fallback selection (choose). It
  // stays held for the entire time a selection is "in progress": through a
  // fallback's dismiss-and-defer delivery (released in runPendingSelection,
  // after delivery), or through the whole time Transfer is the active
  // screen (released only once backToChooser has safely restored the
  // chooser, or the flow closes and a fresh open resets it).
  const selectionLockRef = useRef(false);
  // Dedicated re-entrancy guard for backToChooser() specifically — it runs
  // while selectionLockRef is (correctly) still held, so it cannot use that
  // same ref as its own gate; a rapid double-tap on the Back control needs
  // its own atomic check.
  const returningToChooserRef = useRef(false);

  // ---- Fallback path for every kind except 'transfer' (Stream D, Option B
  // — unchanged in spirit, still load-bearing; onClose target is now
  // KeyboardSheet's own `onClose` prop rather than a raw Modal's). ----
  // Retained alongside selectionLockRef above for Option B's own dismiss-
  // and-defer completion lifecycle (still read/reset by runPendingSelection
  // below), but it is no longer, by itself, the first-tap-wins gate —
  // Transfer never touches it, so it could never have protected a Transfer-
  // vs-fallback race on its own. selectionLockRef is the authoritative gate
  // for both paths; this ref is Option-B-internal bookkeeping only.
  const handoffInProgressRef = useRef(false);
  const pendingKindRef = useRef<AddAnythingKind | null>(null);
  const androidFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Option B's animationType='none' runtime spike (skip the native dismiss
  // animation on an accepted fallback tile) is RETIRED as of this
  // correction pass — device testing showed it exposes a real native
  // compositing gap during a non-animated UIKit dismissal (dismissViewController
  // Animated:NO's completion block fires asynchronously, after the view
  // hierarchy may already have begun detaching, while RN's Modal keeps
  // reporting itself as still rendering until that completion fires) —
  // visible as chooser content disappearing while an empty white sheet
  // host remained on screen. This sheet's Modal now always dismisses with
  // KeyboardSheet's own default, real, animated `animationType="slide"`
  // (the same as ordinary Cancel/backdrop/swipe already used, and the same
  // as every other destination's own Modal presentation in this app) —
  // the animated transition, not the "none" one, is what reliably keeps
  // content visible for the sheet's entire physical closing animation.

  // ---- Internal chooser <-> embedded-Transfer transition state (Stream D,
  // persistent-host proof-of-pattern). Scoped to exactly these two screens
  // for this proof — no route stack, no nested handoffs. ----
  const [screen, setScreen] = useState<Screen>('chooser');
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
  // Opening-cycle / stale-completion guard: incremented on every push/pop
  // request and on every fresh open. A transition's own .start() callback
  // only applies its effect if this still matches the generation captured
  // when it began — an interrupted, superseded, or late-firing completion
  // can never touch state again once invalidated this way.
  const generationRef = useRef(0);
  // Premium-transition correction — one shared "push progress" Animated.Value
  // per transition (chooser<->transfer, chooser<->addAsset), 0 = chooser is
  // the settled front step, 1 = the destination is. Each drives BOTH sides'
  // translateX via interpolation against the workspace's own measured
  // viewport width (see chooserAwayProgress/render below) — never opacity,
  // so the two layers are always opaque and adjacent, never simultaneously
  // "ghosted" mid-transition. Replaces the old chooserAnim/transferAnim pair
  // (which drove an opacity+24px cross-fade).
  const chooserTransferProgress = useRef(new Animated.Value(0)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const transferFormRef = useRef<TransferFormHandle>(null);
  const [transferCanSave, setTransferCanSave] = useState(false);
  const [transferIsDirty, setTransferIsDirty] = useState(false);
  // The workspace's own clipped viewport width, in points — measured via a
  // non-height-affecting onLayout on the absolutely-positioned layers'
  // container (see handleViewportLayout/styles.viewport below), since the
  // correction's design reconciliation explicitly rejected assuming
  // `windowWidth - spacing.lg*2` as the definitive value. That same formula
  // is kept ONLY as a transient pre-measurement fallback — the sheet's own
  // opening animation (well over 250ms) always finishes, and this layout
  // always fires, before the user can possibly tap a tile and start a real
  // transition, so the fallback is never actually the value a real
  // transition animates against; it exists purely so an interpolation range
  // is never mistakenly zero-width in the instant before that first layout.
  const windowDimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredViewportWidth, setMeasuredViewportWidth] = useState<number | null>(null);
  const viewportWidth = measuredViewportWidth ?? Math.max(windowDimensions.width - spacing.lg * 2, 0);

  // ---- Navigation Transitions, Option B pilot: chooser <-> embedded Add
  // Asset. Deliberately NOT wired into screen/transitionPhase/
  // chooserTransferProgress/generationRef above — every one of those stays
  // completely untouched by this pilot, and every Transfer-only code path
  // that reads them keeps its exact existing behaviour. This is a second,
  // independent application of the same reusable pattern: a settled
  // "current" step plus an exiting "outgoing" one, driven by the pure
  // addAssetTransitionController reducer (real-import tested), pointerEvents/
  // accessibility-hidden while not the settled front step, and the workspace's
  // own content-independent fixed height (never derived from this step's own
  // content). selectionLockRef/returningToChooserRef ARE reused (shared
  // first-tap-wins gate and Back re-entrancy guard, exactly as
  // choose()/enterTransfer() already share them with each other) — safe
  // because only one of {Transfer, Add Asset} can ever be entered at a
  // time. chooserTransferProgress and chooserAddAssetProgress (below) are
  // summed (chooserAwayProgress) to drive the chooser layer's own single
  // translateX regardless of which destination it's swapping with — never
  // simultaneously non-zero, since selectionLockRef guarantees only one
  // transition is ever in flight.
  const [addAssetTransition, dispatchAddAssetTransition] = useReducer(reduceAddAssetTransition, initialAddAssetTransitionState);
  // Own dedicated generation counter (not generationRef above) — guards a
  // stale Animated.timing completion from a transition that was itself
  // superseded by a LATER Add Asset transition after an intervening RESET
  // (dismiss + reopen + re-enter), which a shared counter could not
  // distinguish from "still the same in-flight attempt".
  const addAssetGenerationRef = useRef(0);
  // Session-persistent — true from the first Forward until this whole
  // sheet is fully dismissed and reopened fresh. Unlike showTransfer's
  // conditional-unmount, this is what keeps the embedded AddWealthItemModal
  // instance (and therefore its internal draft state) mounted across an
  // in-session Back, satisfying "the user's valid draft is preserved" /
  // "reselecting Add Asset restores the preserved draft".
  const addAssetEverEnteredRef = useRef(false);
  const [addAssetPresetType, setAddAssetPresetType] = useState<AssetType>('cash');
  // See chooserTransferProgress above — the same shared-progress push
  // mechanism, dedicated to the chooser<->Add Asset pair. Never shared with
  // chooserTransferProgress itself (only one of the two is ever away from 0
  // at a time, enforced by selectionLockRef).
  const chooserAddAssetProgress = useRef(new Animated.Value(0)).current;
  const addAssetModalRef = useRef<AddWealthItemModalHandle>(null);
  const [addAssetCanSave, setAddAssetCanSave] = useState(false);
  const [addAssetIsDirty, setAddAssetIsDirty] = useState(false);
  const [addAssetTitle, setAddAssetTitle] = useState('Add asset');
  // Correction pass — accessibility focus. Ref to the Add Asset step's own
  // in-content heading (a real, always-present, never-unmounted-mid-session
  // element once entered), and a per-tile ref map keyed by AddAnythingKind
  // so Back can restore focus to the EXACT tile that opened the current
  // draft, not a generic control.
  const addAssetHeadingRef = useRef<Text>(null);
  const assetTileRefs = useRef<Partial<Record<AddAnythingKind, React.ElementRef<typeof TouchableOpacity> | null>>>({});
  // Which tile's preset the currently-open (or currently-preserved) draft
  // actually belongs to — distinct from addAssetPresetType (a value, not an
  // origin) because two different tiles can never map to the same
  // AssetType in ASSET_PRESET_MAP today, but tracking the tile explicitly
  // (not derived) keeps focus-restoration correct even if that ever
  // changes. Updated only when a genuinely fresh session/type begins (see
  // chooseAssetTile), never on a same-type restore.
  const addAssetOriginTileKeyRef = useRef<AddAnythingKind | null>(null);
  // A focus request scheduled by a transition's own completion (animated or
  // reduced-motion), consumed by the effect below only once the transition
  // has genuinely settled AND only if nothing has superseded it since
  // (generation check) — see beginAddAssetTransitionAnimation/
  // backToChooserFromAddAsset/handleAddAssetSaveSuccess for every place
  // that can invalidate a still-pending request.
  const pendingFocusRef = useRef<{ generation: number; target: 'addAsset' | 'chooser' } | null>(null);
  // Bumped to force a full remount of the embedded AddWealthItemModal
  // instance (see the `key` prop below) — the only two triggers are a fresh
  // RESET (full sheet dismissal + reopen) and a confirmed "Discard and
  // switch" between two different asset types (§3.C/§3.D) — never on a
  // same-type restore, which must keep the SAME instance/state alive.
  const [addAssetInstanceKey, setAddAssetInstanceKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      // A fresh open must never carry over a stale in-progress handoff,
      // pending selection, selection lock, or Transfer screen/transition
      // state from a previous time this sheet was shown — always starts
      // back on the chooser with a fresh lock.
      selectionLockRef.current = false;
      returningToChooserRef.current = false;
      handoffInProgressRef.current = false;
      pendingKindRef.current = null;
      generationRef.current++;
      setScreen('chooser');
      setTransitionPhase('idle');
      chooserTransferProgress.setValue(0);
      // Navigation Transitions, Option B pilot — a fresh open must also
      // discard any preserved Add Asset draft from a previous session
      // (this is the ONLY place that draft is ever actually cleared; see
      // addAssetEverEnteredRef's own declaration comment). The embedded
      // AddWealthItemModal instance itself unmounts as a result (its
      // wrapping layer is only rendered while addAssetEverEnteredRef.current
      // is true), so the next Forward mounts it fresh, which in turn runs
      // ITS OWN reset-on-open effect exactly as every other fresh open of
      // that component already does.
      addAssetGenerationRef.current++;
      addAssetEverEnteredRef.current = false;
      dispatchAddAssetTransition({ type: 'RESET' });
      chooserAddAssetProgress.setValue(0);
      setAddAssetCanSave(false);
      setAddAssetIsDirty(false);
      setAddAssetTitle('Add asset');
      setAddAssetPresetType('cash');
      // Correction pass — RESET must invalidate any focus work a still-
      // in-flight (now-superseded) transition might have scheduled, and
      // must force the NEXT entry into a genuinely fresh embedded instance
      // (belt-and-braces alongside the wrapping layer's own unmount when
      // addAssetEverEnteredRef.current goes false — see that ref's
      // declaration comment) rather than depending solely on that unmount.
      pendingFocusRef.current = null;
      addAssetOriginTileKeyRef.current = null;
      setAddAssetInstanceKey((k) => k + 1);
    }
  }, [visible, chooserTransferProgress, chooserAddAssetProgress]);

  // Correction pass — accessibility focus. Consumes a request scheduled by
  // a transition's own completion (see beginAddAssetTransitionAnimation and
  // backToChooserFromAddAsset below) only once addAssetTransition has
  // genuinely settled (status 'idle') — guaranteeing the target element's
  // pointerEvents/accessibilityElementsHidden props have already committed
  // to their new, visible/interactive values by the time focus is
  // requested, so this can never focus a still-hidden element. The
  // generation check discards a request superseded by ANY later event
  // (a newer transition, Back, RESET, or Save — all of which bump
  // addAssetGenerationRef.current at their own start) before it can act.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (addAssetTransition.status !== 'idle') return;
    pendingFocusRef.current = null;
    if (pending.generation !== addAssetGenerationRef.current) return; // stale — superseded since it was scheduled
    if (pending.target === 'addAsset') {
      focusElement(addAssetHeadingRef.current);
      AccessibilityInfo.announceForAccessibility(`${addAssetTitle} opened`);
    } else {
      const tileKey = addAssetOriginTileKeyRef.current;
      focusElement(tileKey ? assetTileRefs.current[tileKey] ?? null : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAssetTransition]);

  useEffect(() => {
    return () => {
      if (androidFallbackTimerRef.current) clearTimeout(androidFallbackTimerRef.current);
    };
  }, []);

  // Invoked once this sheet's own native Modal dismissal has actually
  // completed (iOS: via onDismiss below; Android: via the timed fallback,
  // since RN never fires onDismiss there) — fires after EVERY dismissal
  // (backdrop tap, swipe, Cancel/back, or a chosen non-Transfer tile), so
  // an ordinary dismissal with nothing pending is always a safe no-op here.
  function runPendingSelection() {
    const kind = pendingKindRef.current;
    pendingKindRef.current = null;
    handoffInProgressRef.current = false;
    if (kind !== null) onSelect(kind);
    // Release the shared selection lock only now that delivery (if any) is
    // complete — this Modal's own native dismissal is already complete
    // (that's what triggered this function). A no-op when nothing was
    // pending. Never released merely on `visible` becoming false.
    selectionLockRef.current = false;
  }

  // Accepted-handoff dismissal for every kind except 'transfer' — calls
  // onClose() directly (bypassing KeyboardSheet's own swipe/backdrop-
  // triggered dismiss()), same as always; the resulting close now always
  // uses KeyboardSheet's default, real, animated `animationType="slide"`
  // (see the retirement note above) rather than a JS pre-close animation.
  function choose(kind: AddAnythingKind) {
    if (selectionLockRef.current) return; // synchronous first-tap-wins — shared with enterTransfer()
    selectionLockRef.current = true;
    handoffInProgressRef.current = true;
    pendingKindRef.current = kind;
    onClose();
    if (Platform.OS === 'android') {
      if (androidFallbackTimerRef.current) clearTimeout(androidFallbackTimerRef.current);
      androidFallbackTimerRef.current = setTimeout(runPendingSelection, ANDROID_DISMISS_FALLBACK_MS);
    }
  }

  // ---- Internal chooser <-> Transfer transition (Stream D, persistent-
  // host proof-of-pattern). For this proof, the chooser unmounts once
  // Transfer is fully entered — no parent draft needs preserving here.
  // LATER nested phases (Bill Type -> Mortgage/Car Loan/Personal Loan,
  // Liability -> Credit Card) CANNOT reuse this same unmount rule: their
  // parent route can hold typed field values before the nested hop, so its
  // draft must stay mounted (or be fully preserved) across the hop instead
  // of being discarded here. Not implemented in this pass. ----

  function enterTransfer() {
    if (selectionLockRef.current) return; // synchronous first-tap-wins — shared with choose()
    selectionLockRef.current = true; // held for the entire time Transfer is the active screen (req #6)
    const myGeneration = ++generationRef.current;
    if (reduceMotionEnabled) {
      chooserTransferProgress.setValue(1);
      setScreen('transfer');
      setTransitionPhase('idle');
      return;
    }
    setTransitionPhase('chooser-to-transfer');
    chooserTransferProgress.setValue(0);
    Animated.timing(chooserTransferProgress, { toValue: 1, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== generationRef.current) return; // stale-completion guard
      setScreen('transfer');
      setTransitionPhase('idle');
    });
  }

  function backToChooser() {
    if (returningToChooserRef.current) return; // synchronous re-entrancy guard for Back itself
    returningToChooserRef.current = true;
    const myGeneration = ++generationRef.current;
    if (reduceMotionEnabled) {
      chooserTransferProgress.setValue(0);
      setScreen('chooser');
      setTransitionPhase('idle');
      selectionLockRef.current = false; // released only once the chooser is restored (req #7)
      returningToChooserRef.current = false;
      return;
    }
    setTransitionPhase('transfer-to-chooser');
    chooserTransferProgress.setValue(1);
    Animated.timing(chooserTransferProgress, { toValue: 0, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== generationRef.current) return;
      setScreen('chooser');
      setTransitionPhase('idle');
      selectionLockRef.current = false; // released only once the chooser is restored (req #7)
      returningToChooserRef.current = false;
    });
  }

  // ---- Navigation Transitions, Option B pilot: chooser <-> embedded Add
  // Asset. The actual Forward animation/dispatch/focus-scheduling is a
  // separate function (below) so every proceed-path in chooseAssetTile
  // (first entry, same-type restore, clean switch, confirmed
  // discard-and-switch) can trigger it uniformly. ----
  function beginAddAssetTransitionAnimation() {
    const myGeneration = ++addAssetGenerationRef.current;
    if (reduceMotionEnabled) {
      chooserAddAssetProgress.setValue(1);
      dispatchAddAssetTransition({ type: 'FORWARD' });
      dispatchAddAssetTransition({ type: 'TRANSITION_COMPLETE' });
      pendingFocusRef.current = { generation: myGeneration, target: 'addAsset' };
      return;
    }
    dispatchAddAssetTransition({ type: 'FORWARD' });
    chooserAddAssetProgress.setValue(0);
    Animated.timing(chooserAddAssetProgress, { toValue: 1, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== addAssetGenerationRef.current) return; // stale-completion guard
      dispatchAddAssetTransition({ type: 'TRANSITION_COMPLETE' });
      pendingFocusRef.current = { generation: myGeneration, target: 'addAsset' };
    });
  }

  // Correction pass (§3) — the single place that actually commits to a
  // (possibly fresh) Add Asset session and begins the Forward transition.
  // `freshInstance` forces a full remount of the embedded AddWealthItemModal
  // (via the `key` prop below) — set only when genuinely starting over with
  // a new type (first-ever entry, a clean switch, or a confirmed discard-
  // and-switch), never for a same-type restore.
  function proceedIntoAddAsset(tileKey: AddAnythingKind, presetType: AssetType, freshInstance: boolean) {
    if (selectionLockRef.current) return; // synchronous first-tap-wins — shared with choose()/enterTransfer()
    selectionLockRef.current = true; // held for the entire time Add Asset is the active step (mirrors req #6 for Transfer)
    if (freshInstance) {
      setAddAssetInstanceKey((k) => k + 1);
    }
    setAddAssetPresetType(presetType);
    addAssetOriginTileKeyRef.current = tileKey;
    addAssetEverEnteredRef.current = true;
    beginAddAssetTransitionAnimation();
  }

  // Correction pass (§3) — the chooser tile's own onPress target. Resolves
  // exactly one of four required outcomes:
  // A. never entered this session -> plain first entry;
  // B. same asset type already open/preserved -> restore it exactly, no
  //    reset, no save;
  // C. a different type, current draft clean -> silently re-initialise
  //    with the newly selected type (nothing of value is lost);
  // D. a different type, current draft dirty -> "Switch asset type?"
  //    confirmation; Continue editing returns to the existing draft
  //    unchanged; Discard and switch clears it immediately (via
  //    freshInstance's key bump, not deferred to a future reopen) and opens
  //    a fresh form for the newly selected type. No asset is ever persisted
  //    by any path here — only addAsset/updateAsset (inside
  //    AddWealthItemModal's own unchanged Save path) ever persists one.
  function chooseAssetTile(tileKey: AddAnythingKind) {
    const presetType = ASSET_PRESET_MAP[tileKey];
    if (!presetType) return;

    // The actual branching decision is the pure, real-import-tested
    // decideAssetTileSelection (addAssetTransitionController.ts) — this
    // function only supplies the current React state as plain values and
    // carries out whichever outcome it returns; no decision logic is
    // duplicated here.
    const outcome = decideAssetTileSelection({
      everEntered: addAssetEverEnteredRef.current,
      currentPresetType: addAssetPresetType,
      selectedPresetType: presetType,
      isDirty: addAssetIsDirty,
    });

    switch (outcome.action) {
      case 'proceed':
        proceedIntoAddAsset(tileKey, presetType, false);
        return;
      case 'switchClean':
        proceedIntoAddAsset(tileKey, presetType, true);
        return;
      case 'confirmSwitch': {
        const currentPresetType = addAssetPresetType;
        const currentOriginTileKey = addAssetOriginTileKeyRef.current ?? tileKey;
        confirmSwitchAssetType(
          () => proceedIntoAddAsset(tileKey, presetType, true),
          () => proceedIntoAddAsset(currentOriginTileKey, currentPresetType, false)
        );
        return;
      }
    }
  }

  // Back never discards (req #7/#8) — the embedded AddWealthItemModal stays
  // mounted (see addAssetEverEnteredRef), so there is nothing to lose here;
  // this only moves the chooser back to front, and returns accessibility
  // focus to the exact tile that opened the current draft.
  function backToChooserFromAddAsset() {
    if (returningToChooserRef.current) return; // synchronous re-entrancy guard — shared with Transfer's own Back
    returningToChooserRef.current = true;
    const myGeneration = ++addAssetGenerationRef.current;
    if (reduceMotionEnabled) {
      chooserAddAssetProgress.setValue(0);
      dispatchAddAssetTransition({ type: 'BACK' });
      dispatchAddAssetTransition({ type: 'TRANSITION_COMPLETE' });
      pendingFocusRef.current = { generation: myGeneration, target: 'chooser' };
      selectionLockRef.current = false;
      returningToChooserRef.current = false;
      return;
    }
    dispatchAddAssetTransition({ type: 'BACK' });
    chooserAddAssetProgress.setValue(1);
    Animated.timing(chooserAddAssetProgress, { toValue: 0, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== addAssetGenerationRef.current) return;
      dispatchAddAssetTransition({ type: 'TRANSITION_COMPLETE' });
      pendingFocusRef.current = { generation: myGeneration, target: 'chooser' };
      selectionLockRef.current = false;
      returningToChooserRef.current = false;
    });
  }

  // Correction pass — a successful Save bypasses handleRequestClose (it
  // calls the parent's onClose directly, matching Transfer's own
  // onSaveSuccess wiring), so it must independently invalidate any
  // still-pending focus work and any in-flight transition generation on its
  // own, exactly as handleRequestClose already does for every other close
  // path — "no stale focus callback moves focus after ... Save".
  function handleAddAssetSaveSuccess() {
    addAssetGenerationRef.current++;
    pendingFocusRef.current = null;
    onClose();
  }

  // req #7 — closing the whole sheet, swiping it away, tapping the
  // backdrop, or selecting a different destination while a dirty Add Asset
  // draft is preserved must confirm before that draft is actually lost.
  // Reselecting Add Asset itself is explicitly NOT routed through this
  // guard (see the tile onPress wiring below) — that path restores the
  // draft rather than discarding it.
  function guardNavigateAwayFromAddAsset(proceed: () => void) {
    if (addAssetEverEnteredRef.current && addAssetIsDirty) {
      confirmDiscardIfDirty(true, proceed, 'Discard this asset?', 'Your new asset details will be lost.');
    } else {
      proceed();
    }
  }

  // KeyboardSheet's own backdrop/swipe/Android-Back path — always closes
  // the whole Add flow (never "internal Back", which is its own explicit
  // control below), matching every other destination's existing swipe/
  // backdrop/Android-Back behaviour. Also invalidates any in-flight
  // chooser<->Transfer transition so a stale completion callback can never
  // fire after this sheet has started closing.
  function handleRequestClose() {
    generationRef.current++;
    addAssetGenerationRef.current++;
    pendingFocusRef.current = null;
    onClose();
  }

  const activeScreen: Screen = transitionPhase === 'chooser-to-transfer' ? 'transfer' : transitionPhase === 'transfer-to-chooser' ? 'chooser' : screen;

  // Navigation Transitions, Option B pilot — which of the three possible
  // front steps (chooser/transfer/addAsset) chrome (title/footer/isDirty)
  // should reflect right now. addAssetTransition.current flips immediately
  // on FORWARD/BACK dispatch (before any animation completes), mirroring
  // activeScreen's own "switch chrome the instant the transition begins"
  // semantics for Transfer above.
  const activeStep: Screen | 'addAsset' = activeScreen === 'transfer' ? 'transfer' : addAssetTransition.current === 'addAsset' ? 'addAsset' : 'chooser';

  const chooserVisibleForAddAsset = addAssetTransition.current === 'chooser' || addAssetTransition.outgoing === 'chooser';
  const showChooser = (screen === 'chooser' || transitionPhase === 'transfer-to-chooser') && chooserVisibleForAddAsset;
  const showTransfer = screen === 'transfer' || transitionPhase === 'chooser-to-transfer';
  const showAddAsset = addAssetEverEnteredRef.current;
  // Premium-transition correction — a layer is only interactive/visible to
  // assistive technology while it is genuinely the settled (not mid-
  // transition) front step; every other mounted layer (parked off-screen,
  // or actively animating) is pointerEvents 'none' and hidden from
  // VoiceOver/TalkBack. Same underlying settled-state checks the previous
  // (retired) height-measurement gates used — chooserSettledFront/
  // addAssetSettledFront are the direct renames of chooserIsSoloAndSettled/
  // addAssetIsSoloAndSettled; transferSettledFront is newly derived from
  // the SAME pre-existing screen/transitionPhase state, no new state added.
  const chooserSettledFront =
    screen === 'chooser' && transitionPhase === 'idle' && addAssetTransition.current === 'chooser' && addAssetTransition.status === 'idle';
  const transferSettledFront = screen === 'transfer' && transitionPhase === 'idle';
  const addAssetSettledFront = addAssetTransition.current === 'addAsset' && addAssetTransition.status === 'idle';

  // Premium-transition correction — the sheet's own outer height is fixed
  // and content-independent (never derived from chooser/Transfer/Add Asset
  // content), computed once per render from the window's own reactive
  // dimensions and the device's current top safe-area inset. Passed
  // straight to KeyboardSheet's fixedSheetHeight prop, which itself derives
  // the actual keyboard-adjusted render height.
  const { fixedSheetHeight } = computeAddWorkspaceGeometry({ windowHeight: windowDimensions.height, topInset: insets.top });

  // Premium-transition correction — chooser's own translateX is driven by
  // whichever of the two per-transition progress values is currently away
  // from 0 (never both at once, enforced by selectionLockRef) — summing
  // them gives one combined "how far chooser has been pushed away" value
  // regardless of which destination caused it.
  const chooserAwayProgress = useRef(Animated.add(chooserTransferProgress, chooserAddAssetProgress)).current;
  const chooserTranslateX = chooserAwayProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -viewportWidth] });
  const transferTranslateX = chooserTransferProgress.interpolate({ inputRange: [0, 1], outputRange: [viewportWidth, 0] });
  const addAssetTranslateX = chooserAddAssetProgress.interpolate({ inputRange: [0, 1], outputRange: [viewportWidth, 0] });

  // Non-height-affecting measurement of the workspace's own clipped
  // viewport width (see viewportWidth's declaration above) — only ever
  // reads/stores layout.width; never influences any style that could feed
  // back into this View's own height, since every child it measures is
  // position:'absolute' and therefore already excluded from this View's
  // own layout contribution.
  function handleViewportLayout(e: { nativeEvent: { layout: { width: number } } }) {
    const measured = e.nativeEvent.layout.width;
    setMeasuredViewportWidth((prev) => (prev === measured ? prev : measured));
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.lg },
        groupTitle: { ...typography.caption, fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm, marginTop: spacing.md },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        tile: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        iconBadge: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
          ...cardShadow,
        },
        emoji: { fontSize: 20 },
        tileLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        viewport: { flex: 1, overflow: 'hidden' },
        pushLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
        pushLayerScroll: { flex: 1 },
        backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
        backRowText: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '600' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleRequestClose}
      title={activeStep === 'transfer' ? 'Move money' : activeStep === 'addAsset' ? addAssetTitle : `Add to ${brand.name}`}
      isDirty={activeStep === 'transfer' ? transferIsDirty : addAssetEverEnteredRef.current ? addAssetIsDirty : false}
      discardTitle={activeStep === 'addAsset' ? 'Discard this asset?' : 'Discard transfer?'}
      discardMessage={activeStep === 'addAsset' ? 'Your new asset details will be lost.' : 'Your transfer details will be lost.'}
      footer={
        activeStep === 'transfer' ? (
          <>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => transferFormRef.current?.requestClose('cancel')}
              style={styles.footerButton}
            />
            <Button
              label="Transfer"
              onPress={() => transferFormRef.current?.requestSave()}
              disabled={!transferCanSave}
              style={styles.footerButton}
            />
          </>
        ) : activeStep === 'addAsset' ? (
          <>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => addAssetModalRef.current?.requestClose('cancel')}
              style={styles.footerButton}
            />
            <Button
              label="Save"
              onPress={() => addAssetModalRef.current?.requestSave()}
              disabled={!addAssetCanSave}
              style={styles.footerButton}
            />
          </>
        ) : null
      }
      onDismiss={Platform.OS === 'ios' ? runPendingSelection : undefined}
      fixedSheetHeight={fixedSheetHeight}
    >
      <View style={styles.viewport} onLayout={handleViewportLayout}>
        {showChooser ? (
          <Animated.View
            style={[styles.pushLayer, { transform: [{ translateX: chooserTranslateX }] }]}
            pointerEvents={chooserSettledFront ? 'auto' : 'none'}
            accessibilityElementsHidden={!chooserSettledFront}
            importantForAccessibility={chooserSettledFront ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView style={styles.pushLayerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.body}>What would you like to update?</Text>
              {GROUPS.map((group) => (
                <View key={group.title}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  <View style={styles.grid}>
                    {group.options.map((o) => {
                      const assetPresetType = ASSET_PRESET_MAP[o.key];
                      return (
                        <TouchableOpacity
                          key={o.key}
                          ref={(el) => {
                            // Correction pass — accessibility focus restoration
                            // target for Back (§2). Harmless for every non-
                            // asset tile (never looked up by key for those).
                            assetTileRefs.current[o.key] = el;
                          }}
                          style={styles.tile}
                          activeOpacity={0.8}
                          onPress={() => {
                            if (o.key === 'transfer') {
                              guardNavigateAwayFromAddAsset(enterTransfer);
                            } else if (assetPresetType) {
                              // Navigation Transitions, Option B pilot —
                              // resolves same-tile restore / different-tile
                              // clean-switch / different-tile dirty-confirm
                              // (§3) — never routed through
                              // guardNavigateAwayFromAddAsset, which is only
                              // for navigating AWAY to a non-asset destination
                              // or closing the whole sheet.
                              chooseAssetTile(o.key);
                            } else {
                              guardNavigateAwayFromAddAsset(() => choose(o.key));
                            }
                          }}
                        >
                          <View style={styles.iconBadge}>
                            <Text style={styles.emoji}>{o.emoji}</Text>
                          </View>
                          <Text style={styles.tileLabel}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
        {showTransfer ? (
          <Animated.View
            style={[styles.pushLayer, { transform: [{ translateX: transferTranslateX }] }]}
            pointerEvents={transferSettledFront ? 'auto' : 'none'}
            accessibilityElementsHidden={!transferSettledFront}
            importantForAccessibility={transferSettledFront ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView style={styles.pushLayerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.backRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => transferFormRef.current?.requestClose('back')}
              >
                <Ionicons name="chevron-back" size={18} color={colors.accentStrong} />
                <Text style={styles.backRowText}>Back</Text>
              </TouchableOpacity>
              <TransferForm
                ref={transferFormRef}
                embedded
                onCanSaveChange={setTransferCanSave}
                onDirtyChange={setTransferIsDirty}
                onSaveSuccess={onClose}
                onConfirmedClose={(reason) => {
                  if (reason === 'back') {
                    backToChooser();
                  } else {
                    onClose();
                  }
                }}
              />
            </ScrollView>
          </Animated.View>
        ) : null}
        {showAddAsset ? (
          <Animated.View
            style={[styles.pushLayer, { transform: [{ translateX: addAssetTranslateX }] }]}
            pointerEvents={addAssetSettledFront ? 'auto' : 'none'}
            accessibilityElementsHidden={!addAssetSettledFront}
            importantForAccessibility={addAssetSettledFront ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView style={styles.pushLayerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.backRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => addAssetModalRef.current?.requestClose('back')}
              >
                <Ionicons name="chevron-back" size={18} color={colors.accentStrong} />
                <Text style={styles.backRowText}>Back</Text>
              </TouchableOpacity>
              {/* Correction pass — accessibility focus target for Forward
                  (§2). A real, visible, always-present heading for the Add
                  Asset step (distinct from the outer KeyboardSheet's own
                  title, which is a separate native element this component
                  cannot ref into) — the one stable element focusElement can
                  reliably target and VoiceOver/TalkBack can land on and
                  speak, satisfying "step heading or first appropriate
                  field" without auto-focusing (and unexpectedly raising the
                  keyboard for) the Label text input. */}
              <Text ref={addAssetHeadingRef} style={styles.body} accessibilityRole="header">
                {addAssetTitle}
              </Text>
              <AddWealthItemModal
                key={addAssetInstanceKey}
                ref={addAssetModalRef}
                visible
                embedded
                kind="asset"
                presetAssetType={addAssetPresetType}
                onClose={onClose}
                onDirtyChange={setAddAssetIsDirty}
                onCanSaveChange={setAddAssetCanSave}
                onTitleChange={setAddAssetTitle}
                onSaveSuccess={handleAddAssetSaveSuccess}
                onConfirmedClose={(reason) => {
                  if (reason === 'back') {
                    backToChooserFromAddAsset();
                  } else {
                    onClose();
                  }
                }}
              />
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </KeyboardSheet>
  );
}
