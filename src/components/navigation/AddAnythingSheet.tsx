import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { brand } from '../../lib/brand';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { TransferForm, TransferFormHandle } from '../wealth/TransferForm';

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

// Layout-defect correction (physical-device retest): the previous fixed
// guesses (ADD_FLOW_MIN_HEIGHT=560, ADD_FLOW_CONTENT_MIN_HEIGHT=400) are
// retired. Root cause: `position: 'absolute'` children never contribute to
// their parent's own height in RN's layout engine (Yoga) — the chooser's
// content Animated.View was ALWAYS absolutely positioned, so `contentArea`
// had no real height source other than the guessed 400 constant, which was
// shorter than the chooser's actual content (13 tiles across 3 groups).
// Result: tiles past 400px were clipped (never reachable, since the outer
// ScrollView only ever saw a 400px-tall content report), while the OUTER
// sheet was still held to the unrelated 560px floor, leaving a blank gap
// below the clipped, too-short content area — both symptoms from one cause.
// Fixed below by measuring the chooser's own natural height via onLayout
// whenever it's the sole, settled, NORMALLY-positioned screen (so Yoga can
// size it correctly), then reusing that real measurement — never a guess —
// as both the content area's explicit height and the sheet's own
// minSheetHeight for every other state (Transfer active, or transitioning),
// where the chooser/Transfer layers must be absolutely positioned to
// overlap for the cross-fade.

type Screen = 'chooser' | 'transfer';
type TransitionPhase = 'idle' | 'chooser-to-transfer' | 'transfer-to-chooser';

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
  const chooserAnim = useRef(new Animated.Value(1)).current;
  const transferAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const transferFormRef = useRef<TransferFormHandle>(null);
  const [transferCanSave, setTransferCanSave] = useState(false);
  const [transferIsDirty, setTransferIsDirty] = useState(false);
  // The chooser's own real, measured content height (layout-defect
  // correction) — captured via onLayout whenever the chooser renders
  // normally positioned (solo + settled), then reused as the explicit
  // height for every other state, where it must be absolutely positioned
  // instead to overlap with Transfer during the cross-fade. Chooser content
  // is static, so once measured this stays valid for the component's
  // entire lifetime (AddAnythingSheet is never remounted between opens).
  const [chooserNaturalHeight, setChooserNaturalHeight] = useState<number | null>(null);

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
      chooserAnim.setValue(1);
      transferAnim.setValue(0);
    }
  }, [visible, chooserAnim, transferAnim]);

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
      setScreen('transfer');
      setTransitionPhase('idle');
      return;
    }
    setTransitionPhase('chooser-to-transfer');
    chooserAnim.setValue(1);
    transferAnim.setValue(0);
    Animated.parallel([
      Animated.timing(chooserAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(40),
        Animated.timing(transferAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
    ]).start(() => {
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
      setScreen('chooser');
      setTransitionPhase('idle');
      selectionLockRef.current = false; // released only once the chooser is restored (req #7)
      returningToChooserRef.current = false;
      return;
    }
    setTransitionPhase('transfer-to-chooser');
    transferAnim.setValue(1);
    chooserAnim.setValue(0);
    Animated.parallel([
      Animated.timing(transferAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(40),
        Animated.timing(chooserAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
    ]).start(() => {
      if (myGeneration !== generationRef.current) return;
      setScreen('chooser');
      setTransitionPhase('idle');
      selectionLockRef.current = false; // released only once the chooser is restored (req #7)
      returningToChooserRef.current = false;
    });
  }

  // KeyboardSheet's own backdrop/swipe/Android-Back path — always closes
  // the whole Add flow (never "internal Back", which is its own explicit
  // control below), matching every other destination's existing swipe/
  // backdrop/Android-Back behaviour. Also invalidates any in-flight
  // chooser<->Transfer transition so a stale completion callback can never
  // fire after this sheet has started closing.
  function handleRequestClose() {
    generationRef.current++;
    onClose();
  }

  const activeScreen: Screen = transitionPhase === 'chooser-to-transfer' ? 'transfer' : transitionPhase === 'transfer-to-chooser' ? 'chooser' : screen;

  const showChooser = screen === 'chooser' || transitionPhase === 'transfer-to-chooser';
  const showTransfer = screen === 'transfer' || transitionPhase === 'chooser-to-transfer';
  // Only while the chooser is the ONLY thing shown, settled (not mid-
  // transition), can it render in normal layout flow — the one state where
  // Yoga can correctly compute its real content height. Every other state
  // (Transfer active, or actively transitioning) needs the chooser and/or
  // Transfer layers absolutely positioned so they can overlap for the
  // cross-fade, which requires contentArea to already have an explicit,
  // real (not guessed) height — chooserNaturalHeight, once measured.
  const chooserIsSoloAndSettled = screen === 'chooser' && transitionPhase === 'idle';

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
        screenLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
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
      title={activeScreen === 'transfer' ? 'Move money' : `Add to ${brand.name}`}
      isDirty={activeScreen === 'transfer' ? transferIsDirty : false}
      discardTitle="Discard transfer?"
      discardMessage="Your transfer details will be lost."
      footer={
        activeScreen === 'transfer' ? (
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
        ) : null
      }
      onDismiss={Platform.OS === 'ios' ? runPendingSelection : undefined}
      minSheetHeight={chooserNaturalHeight ?? undefined}
    >
      <View style={chooserIsSoloAndSettled ? null : chooserNaturalHeight !== null ? { height: chooserNaturalHeight } : null}>
        {showChooser ? (
          <Animated.View
            style={[
              chooserIsSoloAndSettled ? null : styles.screenLayer,
              { opacity: chooserAnim, transform: [{ translateX: chooserAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
            ]}
            onLayout={
              chooserIsSoloAndSettled
                ? (e) => {
                    const measured = e.nativeEvent.layout.height;
                    setChooserNaturalHeight((prev) => (prev === measured ? prev : measured));
                  }
                : undefined
            }
          >
            <Text style={styles.body}>What would you like to update?</Text>
            {GROUPS.map((group) => (
              <View key={group.title}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <View style={styles.grid}>
                  {group.options.map((o) => (
                    <TouchableOpacity
                      key={o.key}
                      style={styles.tile}
                      activeOpacity={0.8}
                      onPress={() => (o.key === 'transfer' ? enterTransfer() : choose(o.key))}
                    >
                      <View style={styles.iconBadge}>
                        <Text style={styles.emoji}>{o.emoji}</Text>
                      </View>
                      <Text style={styles.tileLabel}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </Animated.View>
        ) : null}
        {showTransfer ? (
          <Animated.View
            style={[
              styles.screenLayer,
              { opacity: transferAnim, transform: [{ translateX: transferAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
            ]}
          >
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
          </Animated.View>
        ) : null}
      </View>
    </KeyboardSheet>
  );
}
