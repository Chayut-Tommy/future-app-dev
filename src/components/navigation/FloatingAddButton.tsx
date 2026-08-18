import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { dockBottomOffset, FAB_SIZE, HORIZONTAL_MARGIN } from '../../navigation/floatingNavGeometry';
import { floatingTrayCloseRef } from '../../navigation/floatingTrayRef';
import { focusElement } from '../../lib/a11yFocus';
import { AddAnythingSheet, AddAnythingKind } from './AddAnythingSheet';
import { QuickActionsTray } from './QuickActionsTray';
import { QuickActionKey, resolveQuickAction } from './quickActions';
import { askNolieCapability } from '../../lib/askNolie';
import { INITIAL_FLOATING_ADD_PHASE, isSheetOpen, isTrayMounted, isTrayInteractive, reduceFloatingAddPhase } from './floatingAddTransition';

const ICON_ROTATE_MS_OPEN = 220;
const ICON_ROTATE_MS_CLOSE = 165;

type SheetProps = { initialKind?: AddAnythingKind; onlyBalances?: boolean };

/**
 * The global "+"/"×" FAB (floating navigation design pass) — persistent,
 * mounted once at RootNavigator level, reachable from every screen exactly
 * like the button it replaces. Deliberately a SEPARATE component from
 * FloatingNavBar.tsx's four-tab capsule, which only mounts inside the tab
 * navigator — see that file's own doc comment. Both read the same shared
 * geometry (floatingNavGeometry.ts) so they align into one visually
 * seamless assembly on the Main tab screen.
 *
 * CORRECTION ROUND — this component is now the ONE deterministic owner of
 * the tray-to-AddAnythingSheet hand-off, via floatingAddTransition.ts's
 * pure phase machine. It no longer opens AddAnythingSheet as a side effect
 * of a tile's own onSelect callback firing early; it waits for
 * QuickActionsTray's own onClosed (its close animation genuinely finished,
 * never a guessed timeout) before ever touching AddAnythingSheet's
 * `visible` prop. AddAnythingSheet remains the ONE native Modal anywhere in
 * this flow (QuickActionsTray is a plain overlay, never a Modal) — see
 * QuickActionsTray.tsx's own doc comment for the confirmed device root
 * cause this replaces.
 */
export function FloatingAddButton({ routeHidden = false }: { routeHidden?: boolean } = {}) {
  const { colors, semantic, glow } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const keyboardVisible = useKeyboardVisible();

  const [phase, dispatch] = useReducer(reduceFloatingAddPhase, INITIAL_FLOATING_ADD_PHASE);
  // Holds the resolved destination between SELECT_ACTION (tile tapped) and
  // SHEET_CLOSED (AddAnythingSheet itself closes) — set once per selection,
  // read directly as AddAnythingSheet's props (see the JSX below), and
  // cleared once actually consumed. CORRECTION — this used to be mirrored
  // into a separate `sheetProps` state via a `useEffect` keyed on `phase`,
  // which introduced a genuine one-render lag: `visible` (derived
  // synchronously from `phase`) turned true a full render before that
  // effect had run, so AddAnythingSheet's own reset-effect (which reads
  // `initialKind` exactly once, the instant `visible` becomes true) fired
  // against the STALE, still-empty sheetProps and landed on the generic
  // chooser instead of the intended destination. Reading the ref directly
  // during render is synchronous with `visible` turning true, in the exact
  // same render — no lag possible.
  const pendingSheetPropsRef = useRef<SheetProps | null>(null);

  const fabRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    floatingTrayCloseRef.current = () => dispatch('REQUEST_DISMISS');
    return () => {
      floatingTrayCloseRef.current = null;
    };
  }, []);

  // The "×" reverts to "+" the instant closing starts, for either reason —
  // matches the tray itself no longer being interactive from that same
  // instant (isTrayInteractive), so the icon and the tray's own touchable
  // state always agree.
  useEffect(() => {
    const open = isTrayInteractive(phase);
    if (reduceMotion) {
      rotation.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(rotation, {
      toValue: open ? 1 : 0,
      duration: open ? ICON_ROTATE_MS_OPEN : ICON_ROTATE_MS_CLOSE,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [phase, reduceMotion, rotation]);

  // Keyboard visibility correction — a keyboard rising elsewhere on screen
  // (an inline text field, not this sheet's own KeyboardSheet) should never
  // leave the tray floating over it. REQUEST_DISMISS is a no-op unless the
  // tray is genuinely 'trayOpen', so this can fire freely without its own
  // guard duplicating the reducer's.
  useEffect(() => {
    if (keyboardVisible) dispatch('REQUEST_DISMISS');
  }, [keyboardVisible]);

  function handleFabPress() {
    dispatch('PRESS_FAB');
  }

  function handleTrayClosed() {
    // The ONLY place phase leaves 'closingForAction'/'closingForDismiss' —
    // fired by QuickActionsTray exactly once its own close animation (or
    // immediate Reduce-Motion equivalent) has genuinely completed. Never a
    // guessed timeout.
    dispatch('TRAY_CLOSED');
    if (!pendingSheetPropsRef.current) {
      // Closed for dismissal (backdrop/×/Back/tab-switch/keyboard), not for
      // an action — nothing more to open; return focus to the FAB.
      focusElement(fabRef.current);
    }
  }

  function handleTileSelect(key: QuickActionKey) {
    const resolution = resolveQuickAction(key, askNolieCapability.enabled);
    if (resolution.sheet === null) {
      // The centre tile with Ask Nolie enabled — no sheet is ever involved,
      // so this behaves exactly like an ordinary dismiss: no second modal
      // is ever at risk of racing anything.
      askNolieCapability.open?.();
      dispatch('REQUEST_DISMISS');
      return;
    }
    pendingSheetPropsRef.current = resolution.sheet;
    dispatch('SELECT_ACTION');
  }

  function handleSheetClose() {
    dispatch('SHEET_CLOSED');
    // "Cleared when the sheet closes" — the pending destination has now
    // been fully consumed for this session; nothing left to read it.
    pendingSheetPropsRef.current = null;
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          right: HORIZONTAL_MARGIN,
          bottom: dockBottomOffset(insets.bottom),
        },
        button: {
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          // Design 5.1 doc B p.3 — the detached "+" carries the featured
          // treatment, not the retired green brand accent. featured[0] is
          // the gradient's light stop; using it solid keeps the 64pt circle
          // a single flat shape while the gradient itself lands with the
          // hero work in a later wave.
          backgroundColor: semantic.featured[0],
          alignItems: 'center',
          justifyContent: 'center',
          ...glow(semantic.featured[0]),
        },
      }),
    [colors, semantic, glow, insets.bottom]
  );

  const rotateStyle = {
    transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }],
  };

  // Only the FAB itself (and the tray, which a keyboard-triggered dismiss
  // above already closes) hide while a keyboard is up elsewhere on screen —
  // AddAnythingSheet stays mounted unconditionally below, regardless of
  // this flag, so its own in-progress draft (and its own keyboard) is never
  // affected by this.
  // Design 5.1 Wave 2 — `routeHidden` is an independent OR so the existing
  // keyboard/sheet interaction above is byte-identical. This is a purely
  // visual gate on the FAB's own View: the five-phase machine, the tray and
  // AddAnythingSheet below are untouched and still mount exactly as before.
  const hideDock = (keyboardVisible && !isSheetOpen(phase)) || routeHidden;

  return (
    <>
      {!hideDock ? (
        <View style={styles.container} pointerEvents="box-none">
          <TouchableOpacity
            ref={fabRef}
            style={styles.button}
            onPress={handleFabPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isTrayInteractive(phase) ? 'Close quick actions' : 'Open quick actions'}
            accessibilityHint="Opens quick actions to add money, bills, goals, and more"
            // Design 5.1 doc A p.4 requires the "+" to announce its expanded
            // state so a screen-reader user knows the tray opened. Derived
            // from the EXISTING phase machine via its own isTrayInteractive
            // predicate — no new state, no phase or timing change.
            accessibilityState={{ expanded: isTrayInteractive(phase) }}
          >
            <Animated.View style={rotateStyle}>
              <Ionicons name="add" size={34} color={semantic.onInteractive} importantForAccessibility="no" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      ) : null}
      {isTrayMounted(phase) ? (
        <QuickActionsTray phase={phase} reduceMotion={reduceMotion} onSelect={handleTileSelect} onRequestDismiss={() => dispatch('REQUEST_DISMISS')} onClosed={handleTrayClosed} />
      ) : null}
      <AddAnythingSheet
        visible={isSheetOpen(phase)}
        onClose={handleSheetClose}
        onlyBalances={pendingSheetPropsRef.current?.onlyBalances}
        initialKind={pendingSheetPropsRef.current?.initialKind}
      />
    </>
  );
}
