import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamilyForWeight, AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import {
  computeKeyboardAdjustedHeight,
  computeKeyboardOverlap,
  MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN,
} from '../navigation/addWorkspaceGeometry';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { shouldClaimSheetGesture, shouldDismissSheet } from './sheetDismissal';
import { FocusedPickerProvider } from './fields/FocusedPickerHost';
import { focusElement } from '../../lib/a11yFocus';


/**
 * Bottom-sheet modal that stays usable when the keyboard is open: the sheet
 * rides up above the keyboard (KeyboardAvoidingView), the field area scrolls
 * independently, and the action buttons (`footer`) are pinned outside the
 * scroll area so Save/Cancel never gets pushed off-screen. Also swipe-down
 * and tap-outside to dismiss (PRD ask: "same behaviour as Talk to Lulu" —
 * mirrors AskLuluSheet's gesture pattern), gated behind a "Discard changes?"
 * confirmation whenever `isDirty` is true.
 */
export function KeyboardSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  isDirty = false,
  discardTitle,
  discardMessage,
  gesturesEnabled = true,
  onDismiss,
  animationType = 'slide',
  minSheetHeight,
  onRequestDismiss,
  fixedSheetHeight,
  headerRight,
  breadcrumb,
  animateContentEntrance = false,
  focusTitleOnShow = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** True once the user has changed something from where the sheet opened —
   * gates swipe/tap-outside dismissal behind a confirmation. */
  isDirty?: boolean;
  /** Optional form-specific "Discard ___?" wording — omit to keep the
   * existing generic "Discard changes?" copy every other caller already
   * uses. */
  discardTitle?: string;
  discardMessage?: string;
  /** False while a child overlay (e.g. DatePickerModal) owns the screen —
   * disables this sheet's own swipe-to-dismiss so a gesture intended for
   * that overlay can never be read as "close the whole form" underneath it
   * (defense-in-depth: a top-level Modal already isolates its own touches
   * from whatever's rendered behind it, but this makes the same guarantee
   * explicit and independently verifiable at this layer too). */
  gesturesEnabled?: boolean;
  /** Forwarded unchanged to the underlying native Modal's own onDismiss
   * (Stream D, D1 follow-up) — fires once RN reports this Modal's native
   * dismissal has actually finished. iOS only; RN never calls this on
   * Android. Optional and forwarded as-is so every existing caller that
   * doesn't pass it behaves exactly as before. Never invoked manually from
   * this component's own JS-driven slide animation — it must reflect the
   * real native event, not an approximation of it. */
  onDismiss?: () => void;
  /** Pre-Wave-10 Savings-Allocation handoff correction — when true, native
   * `onShow` moves accessibility focus to this sheet's own title through
   * the ESTABLISHED focus utility (lib/a11yFocus), so a customer arriving
   * from another sheet's dismissal lands on the new heading rather than a
   * stale element. Opt-in and state-driven (the native present signal,
   * never a timer); sighted behaviour is unchanged. */
  focusTitleOnShow?: boolean;
  /** Forwarded to the underlying native Modal's own animationType (Stream
   * D, Option B runtime spike) — defaults to 'slide' so every existing
   * caller that doesn't pass this renders exactly as before. A caller sets
   * this to 'none' only for the one render where it is also flipping
   * `visible` to false as an accepted-handoff dismissal, so that specific
   * native dismissal transition is instant instead of animated. This
   * component never changes the value itself — the owning form (which
   * knows whether the current close is an ordinary dismissal or an
   * accepted handoff) is solely responsible for choosing it. */
  animationType?: 'slide' | 'none';
  /** Optional fixed minimum sheet height (Stream D, persistent-host proof-
   * of-pattern) — omitted by every existing caller, which keeps today's
   * purely intrinsic/capped-at-85% sizing unchanged. A caller that embeds
   * more than one screen's worth of swappable content inside this one
   * sheet (so the sheet's own Modal/backdrop never re-presents between
   * screens) sets this to hold the sheet at one stable height across every
   * internal screen change, avoiding a visible height jump when content is
   * swapped without a fresh Modal presentation. */
  minSheetHeight?: number;
  /** Mortgage-repayment keyboard/dismissal correction — an optional control
   * (typically a 44×44pt header Close button) rendered alongside `title`,
   * OUTSIDE the scrollable content area, so it stays visible even while the
   * keyboard is open and the content below it is scrolled. Every existing
   * caller omits this and keeps today's title-only header byte-for-byte:
   * `title` still renders as the sole content of the header row, at full
   * width, exactly as it did as a lone Text node. A caller needing a
   * permanently-reachable escape beyond the footer's own Cancel (e.g. a
   * form whose Cancel/Save footer can still be scrolled past a tall
   * keyboard-open content area on some viewports) supplies this instead of
   * inventing a second, parallel dismiss mechanism. */
  headerRight?: React.ReactNode;
  /** Design 5.1 Wave 3 — optional context line for a genuine NESTED step
   * (e.g. "Add bill · Linked loan"). Rendered directly beneath the title so
   * the reading order is title -> context -> fields -> actions, and above the
   * scrolling body so it can never obscure a field, the keyboard, Cancel or
   * Save. Omitted by every existing consumer, whose header stays byte-for-
   * byte as it was. */
  breadcrumb?: React.ReactNode;
  /** Host-delegated dismiss decision (correction pass, Defect 1 fix) — when
   * supplied, this component hands the ENTIRE dismiss decision to the host
   * instead of using its own isDirty/discardTitle/discardMessage-driven
   * confirmDiscardIfDirty flow: backdrop-tap, Android back, and the native
   * Modal's own onRequestClose call this immediately; an interactive swipe
   * dismiss first plays springBack() to completion (so the sheet is fully
   * settled, never mid-motion, before any host-owned alert can appear) and
   * only then calls this — never both at once, per the correction's
   * dismissal-presentation requirement. The host is solely responsible for
   * deciding whether anything needs confirming and for reopening any
   * parked draft; this component makes no assumption about what "dismiss"
   * ends up meaning. `isDirty` is still read (via isDirtyRef) purely to
   * decide whether a swipe should spring back before delegating, or just
   * dismiss immediately like an ordinary clean swipe-to-close — the host,
   * not this component, still decides what actually happens once called.
   * Every existing caller that omits this keeps its own original
   * isDirty-gated confirmDiscardIfDirty behavior unchanged. */
  onRequestDismiss?: () => void;
  /** Opt-in fixed total sheet height, in points (Option B premium-transition
   * correction) — omitted by every existing caller, which keeps today's
   * intrinsic/85%-capped/optional-minSheetHeight sizing byte-identical. A
   * caller that owns several independently-scrolling, push-transitioning
   * "screens" inside one persistent sheet host (Add Anything's chooser /
   * Add Asset / Move Money) passes this so the sheet's own outer height
   * never changes as its internal screen changes — see
   * addWorkspaceGeometry.ts for how this value is derived. When provided,
   * this component also takes over keyboard handling for the sheet's own
   * height (see the keyboard-overlap effect below) and swaps its single
   * owned ScrollView for a plain clipped View, since the caller owns its
   * own per-screen ScrollView(s) instead. */
  fixedSheetHeight?: number;
  /** Pass 2E final correction — opts this sheet into a restrained default
   * opening transition (backdrop fade + a small ~14pt content rise/opacity
   * settle, ~200ms, timing, native-driver where supported) instead of
   * appearing instantly. Omitted (the default) by every existing caller —
   * Add Wealth Item, Add Income, Add Recurring Item, Goal Detail, and every
   * other KeyboardSheet consumer keeps today's byte-identical instant
   * appearance; only ReminderDetailSheet (the sole modal owner for the
   * whole Reminder experience — Credit Card Due Today and every other
   * Reminder entry point) opts in, since that was the specific customer-
   * visible "opens too abruptly" defect. Triggers exactly once per genuine
   * fresh open (the `visible` prop's false->true transition) via the same
   * effect that already resets translateY on open — content swaps within
   * an already-open sheet (e.g. "Not yet"/"Got it" advancing to the next
   * reminder) never flip `visible` false first, so they never replay this.
   * Honours reduceMotion exactly like this component's existing dismiss/
   * springBack animations (instant settle instead of the timed transition). */
  animateContentEntrance?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const titleFocusRef = useRef<Text>(null);
  const { colors, semantic, radius, spacing, typography } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const translateY = useRef(new Animated.Value(0)).current;
  const windowHeight = useWindowDimensions().height;
  // Pass 2E — Reduce Motion: no native Modal slide, zero-duration dismissal,
  // instant reset instead of spring-back. Never affects the animationType a
  // caller explicitly requests for its own accepted-handoff dismissal
  // ('none' either way); only overrides the default 'slide' presentation
  // and this component's own JS-driven dismiss/spring-back animations.
  const reduceMotion = useReduceMotion();

  // Pass 2E final correction — the opt-in opening transition (see
  // animateContentEntrance doc comment above). Initial values (1, 0, 1) are
  // each already the "settled/no-op" state, so a caller that never sets
  // animateContentEntrance never sees these move — the entrance-animation
  // branch in the effect below is the only place that reads or writes them.
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
    if (!animateContentEntrance) return;
    if (reduceMotion) {
      contentOpacity.setValue(1);
      contentTranslateY.setValue(0);
      backdropOpacity.setValue(1);
      return;
    }
    contentOpacity.setValue(0.94);
    contentTranslateY.setValue(14);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(contentTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    // Deliberately keyed only on `visible` (plus the stable refs/flags) —
    // this effect re-runs on the visible false->true transition (a genuine
    // fresh open), never on a content swap within an already-open sheet
    // ("Not yet"/"Got it" advancing to the next reminder keeps `visible`
    // true throughout, per ReminderDetailSheet's own SETTLED transition —
    // see that file's doc comment), so the entrance never replays for those.
  }, [visible, animateContentEntrance, reduceMotion, translateY, contentOpacity, contentTranslateY, backdropOpacity]);

  // Fixed-height keyboard tracking (Option B premium-transition correction)
  // — entirely gated behind fixedSheetHeight so every existing caller is
  // unaffected. One value (keyboardOverlap) drives BOTH the existing
  // whole-sheet KeyboardAvoidingView (unchanged, still wraps the whole
  // backdrop below) and this component's own height reduction, so the two
  // can never diverge into independently-timed systems — the invariant is
  // `newTop = (oldBottom - overlap) - (fixedSheetHeight - overlap) =
  // oldTop`: shrinking height by exactly the same amount the sheet's
  // bottom-anchor rises keeps its top edge stationary. Overlap is computed
  // from the keyboard frame's own screen coordinates (endCoordinates.screenY)
  // rather than assumed equal to the event's reported height, per the
  // correction's explicit requirement. iOS uses keyboardWillChangeFrame,
  // which reports every frame change including the keyboard sliding fully
  // off-screen (screenY reaching windowHeight yields zero overlap on its
  // own) — keyboardWillHide is kept alongside it purely as an explicit
  // zeroing safety net. Android has no *WillChangeFrame equivalent, so it
  // uses keyboardDidShow/keyboardDidHide instead.
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  useEffect(() => {
    if (fixedSheetHeight === undefined) return undefined;

    const applyFrame = (event: { endCoordinates?: { screenY?: number } }) => {
      const screenY = event?.endCoordinates?.screenY;
      if (typeof screenY === 'number') {
        setKeyboardOverlap(computeKeyboardOverlap(windowHeight, screenY));
      }
    };
    const clear = () => setKeyboardOverlap(0);

    if (Platform.OS === 'ios') {
      const changeSub = Keyboard.addListener('keyboardWillChangeFrame', applyFrame);
      const hideSub = Keyboard.addListener('keyboardWillHide', clear);
      return () => {
        changeSub.remove();
        hideSub.remove();
      };
    }
    const showSub = Keyboard.addListener('keyboardDidShow', applyFrame);
    const hideSub = Keyboard.addListener('keyboardDidHide', clear);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [fixedSheetHeight, windowHeight]);

  const adjustedFixedHeight =
    fixedSheetHeight !== undefined
      ? computeKeyboardAdjustedHeight(fixedSheetHeight, keyboardOverlap, MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN)
      : undefined;

  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: reduceMotion ? 0 : 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  }

  // Correction pass — the sheet's own JS-driven position must NOT be reset
  // to 0 (fully on-screen) until the REAL native dismissal has actually
  // finished. RN's Modal keeps rendering `children` on iOS until this fires
  // (its internal `isRendered` flag only flips false here), not merely
  // until `visible` becomes false — resetting translateY any earlier (e.g.
  // inside dismiss()'s own JS-animation-complete callback, immediately
  // before calling onClose()) snapped the sheet back to its fully-visible
  // position while the native Modal could still be genuinely presenting
  // it, producing a visible flash/blank-content artifact between the JS
  // animation finishing and the native dismissal actually completing.
  // Always forwarded to the underlying Modal's own onDismiss regardless of
  // whether this component's own caller supplied one, so this reset fires
  // for every dismissal path (swipe, backdrop, Cancel, and any caller-
  // driven close) — iOS only, since RN never calls onDismiss on Android;
  // Android already resets translateY safely via the fresh-open effect
  // above, since Android's own Modal has no equivalent post-`visible=false`
  // rendering lag to guard against.
  function handleNativeDismissComplete() {
    translateY.setValue(0);
    onDismiss?.();
  }

  function requestClose() {
    if (onRequestDismiss) {
      onRequestDismiss();
      return;
    }
    confirmDiscardIfDirty(isDirty, dismiss, discardTitle, discardMessage);
  }

  function springBack(onComplete?: () => void) {
    // Reduce Motion: an instant reset, never a spring/bounce/positional
    // animation — still uses Animated.timing (duration 0) rather than a
    // bare translateY.setValue(0) so the same onComplete-callback contract
    // every caller already relies on (springBack(() => ...)) stays uniform
    // across both branches.
    const animation = reduceMotion
      ? Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true })
      : Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 });
    animation.start(() => {
      onComplete?.();
    });
  }

  // PanResponder.create is only ever invoked once, on the first render (its
  // argument is re-evaluated every render, but useRef discards every value
  // after the first) — so every handler closure below is permanently bound
  // to whichever isDirty/discardTitle/discardMessage/gesturesEnabled values
  // happened to be in scope on THAT render, never updated again for the
  // lifetime of this component instance. Reading through refs instead is
  // what makes the gesture always see the current values (regression-
  // protection review: this pre-existing gap already meant AddWealthItemModal's
  // dynamically-computed isDirty could never actually gate its own swipe-to-
  // dismiss correctly; fixed here since it's the exact mechanism this
  // round's draft-protection correction depends on — dismiss/springBack
  // themselves stay safe to call from a stale closure, since they only ever
  // reach a stable Animated.Value ref and the parent's always-stable
  // setState-backed onClose). isDirtyRef.current is read (not the isDirty
  // prop directly) so this stays correct however many times isDirty changes
  // after mount.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const discardTitleRef = useRef(discardTitle);
  discardTitleRef.current = discardTitle;
  const discardMessageRef = useRef(discardMessage);
  discardMessageRef.current = discardMessage;
  /** Wave 4 closure — true while a focused picker owns the screen. The
   * sheet's own drag-to-dismiss is suspended for exactly that long, so a
   * downward gesture can never close the whole Add journey out from under
   * an open picker. */
  const [pickerActive, setPickerActive] = useState(false);
  const gesturesEnabledRef = useRef(gesturesEnabled);
  gesturesEnabledRef.current = gesturesEnabled && !pickerActive;
  const onRequestDismissRef = useRef(onRequestDismiss);
  onRequestDismissRef.current = onRequestDismiss;

  /**
   * Wave 4 device correction — the sheet's own scroll offset, tracked so a
   * dismissal can be refused while the customer is reading their content.
   * Zero is the only offset at which a pull-down means anything else.
   */
  const contentOffsetYRef = useRef(0);
  /** Exactly one dismissal request per gesture sequence, however rapidly
   * the gesture is repeated. */
  const dismissingRef = useRef(false);

  /**
   * Wave 4 device correction — these handlers are now attached ONLY to the
   * drag handle, never to the sheet body.
   *
   * Previously they were spread across the whole sheet, which made every
   * form a dismissal target and put this responder in direct competition
   * with each form's own ScrollView for the same touches. An ordinary
   * downward scroll could be claimed here and then satisfy the old release
   * threshold, closing the screen — and on a dirty form, raising a discard
   * alert the customer never asked for. With the handle owning the gesture
   * and the ScrollView owning the content, the two can no longer compete.
   *
   * Every decision below is delegated to the pure rules in
   * `sheetDismissal.ts` so the matrix is testable without a gesture system.
   */
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesturesEnabledRef.current && shouldClaimSheetGesture({ dy: gesture.dy, dx: gesture.dx, fromHandle: true }),
      onPanResponderGrant: () => {
        dismissingRef.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        const dismissNow = shouldDismissSheet({
          dy: gesture.dy,
          dx: gesture.dx,
          vy: gesture.vy,
          contentOffsetY: contentOffsetYRef.current,
          fromHandle: true,
          alreadyDismissing: dismissingRef.current,
        });
        if (!dismissNow) {
          springBack();
          return;
        }
        dismissingRef.current = true;
        if (onRequestDismissRef.current) {
          // Delegated dismiss — never show a host-owned alert while the
          // sheet still looks like it's mid-swipe. A clean (non-dirty)
          // swipe still dismisses immediately, exactly like the
          // non-delegated branch below, so an ordinary swipe-to-close
          // isn't punished with an extra spring-back-then-close beat.
          if (isDirtyRef.current) {
            springBack(() => onRequestDismissRef.current?.());
          } else {
            dismiss();
          }
        } else if (isDirtyRef.current) {
          springBack();
          confirmDiscardIfDirty(true, dismiss, discardTitleRef.current, discardMessageRef.current);
        } else {
          dismiss();
        }
      },
      // If responder ownership is revoked mid-drag (e.g. the ScrollView
      // reclaims it during a rapid direction change) rather than released
      // cleanly, onPanResponderRelease never fires — without this, translateY
      // stays wherever onPanResponderMove last left it, stranding the sheet
      // (and its footer, since both are inside the same transformed view)
      // below its intended position (regression-protection review: rapid
      // up/down swiping reported leaving Cancel/Save unreachable).
      onPanResponderTerminate: () => {
        dismissingRef.current = false;
        springBack();
      },
    })
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
        },
        // Pass 2E final correction — split out from `backdrop` so its tint
        // can be opacity-animated (native-driver-compatible) for the opt-in
        // entrance transition without touching backdrop's own flex layout.
        // `backdropOpacity` is pinned at 1 unless animateContentEntrance is
        // true, so this renders the same static scrim every existing
        // caller already sees (Design 5.1 Wave 1B: the literal became the
        // scheme-aware `semantic.scrim` role; the opacity animation and
        // every other behaviour here are unchanged).
        backdropTint: {
          backgroundColor: semantic.scrim,
        },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          maxHeight: '85%',
        },
        // Wave 4 device correction — the touch target for the ONLY dismissal
        // gesture. Generous vertical padding so a deliberate pull is easy to
        // start, while the visible pill stays the same 36x4.
        grabberTarget: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
        grabber: {
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          marginBottom: spacing.md,
        },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        },
        breadcrumbRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
        title: {
          ...typography.heading,
          // Design 5.1 Wave 9a — family-only migration (Wave 1B pattern):
          // size and weight verbatim, bundled face declared alongside.
          fontFamily: fontFamilyForWeight(600, locale),
          color: colors.textPrimary,
          flex: 1,
        },
        scrollArea: {
          flexGrow: 0,
        },
        fixedContentArea: {
          flex: 1,
          overflow: 'hidden',
        },
        footer: {
          flexDirection: 'row',
          gap: spacing.md,
          paddingTop: spacing.md,
          flexShrink: 0,
        },
      }),
    [colors, semantic, radius, spacing, typography, locale]
  );

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : animationType}
      transparent
      onRequestClose={requestClose}
      onDismiss={handleNativeDismissComplete}
      onShow={focusTitleOnShow ? () => focusElement(titleFocusRef.current) : undefined}
    >
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.backdropTint, { opacity: backdropOpacity }]} />
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={requestClose} disabled={!gesturesEnabled} />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY }, { translateY: contentTranslateY }],
              opacity: contentOpacity,
            },
            minSheetHeight ? { minHeight: minSheetHeight } : null,
            adjustedFixedHeight !== undefined ? { height: adjustedFixedHeight, maxHeight: adjustedFixedHeight } : null,
          ]}
        >
          {/* The ONLY dismissal gesture target. Padded well beyond the
              visible 4pt pill so it is comfortably grabbable, and given an
              explicit accessibility role so the affordance is discoverable
              rather than purely visual. */}
          <View style={styles.grabberTarget} {...panResponder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Drag down to close">
            <View style={styles.grabber} />
          </View>
          <FocusedPickerProvider onActiveChange={setPickerActive}>
          <View style={styles.titleRow}>
            <Text ref={titleFocusRef} style={styles.title}>
              {title}
            </Text>
            {headerRight}
          </View>
          {breadcrumb ? <View style={styles.breadcrumbRow}>{breadcrumb}</View> : null}
          {fixedSheetHeight !== undefined ? (
            <View style={styles.fixedContentArea}>{children}</View>
          ) : (
            <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scrollArea}
            scrollEventThrottle={16}
            onScroll={(e) => {
              contentOffsetYRef.current = e.nativeEvent.contentOffset.y;
            }}
          >
              {children}
            </ScrollView>
          )}
          <View style={styles.footer}>{footer}</View>
          </FocusedPickerProvider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
