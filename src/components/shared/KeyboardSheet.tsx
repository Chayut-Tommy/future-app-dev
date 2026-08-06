import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import {
  computeKeyboardAdjustedHeight,
  computeKeyboardOverlap,
  MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN,
} from '../navigation/addWorkspaceGeometry';

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

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
  fixedSheetHeight,
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
}) {
  const insets = useSafeAreaInsets();
  const { colors, radius, spacing, typography } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;
  const windowHeight = useWindowDimensions().height;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

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
    Animated.timing(translateY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
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
    confirmDiscardIfDirty(isDirty, dismiss, discardTitle, discardMessage);
  }

  function springBack() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
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
  const gesturesEnabledRef = useRef(gesturesEnabled);
  gesturesEnabledRef.current = gesturesEnabled;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesturesEnabledRef.current && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          if (isDirtyRef.current) {
            springBack();
            confirmDiscardIfDirty(true, dismiss, discardTitleRef.current, discardMessageRef.current);
          } else {
            dismiss();
          }
        } else {
          springBack();
        }
      },
      // If responder ownership is revoked mid-drag (e.g. the ScrollView
      // reclaims it during a rapid direction change) rather than released
      // cleanly, onPanResponderRelease never fires — without this, translateY
      // stays wherever onPanResponderMove last left it, stranding the sheet
      // (and its footer, since both are inside the same transformed view)
      // below its intended position (regression-protection review: rapid
      // up/down swiping reported leaving Cancel/Save unreachable).
      onPanResponderTerminate: () => springBack(),
    })
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(10,12,20,0.45)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          maxHeight: '85%',
        },
        grabber: {
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          marginBottom: spacing.md,
        },
        title: {
          ...typography.heading,
          color: colors.textPrimary,
          marginBottom: spacing.md,
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
    [colors, radius, spacing, typography]
  );

  return (
    <Modal visible={visible} animationType={animationType} transparent onRequestClose={requestClose} onDismiss={handleNativeDismissComplete}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={requestClose} disabled={!gesturesEnabled} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY }] },
            minSheetHeight ? { minHeight: minSheetHeight } : null,
            adjustedFixedHeight !== undefined ? { height: adjustedFixedHeight, maxHeight: adjustedFixedHeight } : null,
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {fixedSheetHeight !== undefined ? (
            <View style={styles.fixedContentArea}>{children}</View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scrollArea}>
              {children}
            </ScrollView>
          )}
          <View style={styles.footer}>{footer}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
