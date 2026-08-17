import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { focusElement } from '../../lib/a11yFocus';
import { combinedAssemblyWidth, HORIZONTAL_MARGIN, trayBottomOffset } from '../../navigation/floatingNavGeometry';
import { buildQuickActionTiles, QuickActionKey } from './quickActions';
import { askNolieCapability } from '../../lib/askNolie';
import { brand } from '../../lib/brand';
import { TrayPhase } from './floatingAddTransition';

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 165;

/**
 * The anchored 3x3 quick-actions panel (floating navigation design pass).
 *
 * CORRECTION ROUND — root cause of the release-blocking device defect: the
 * previous version of this component was wrapped in a native RN `Modal`.
 * Selecting a tile called the parent's `onSelect` (synchronously presenting
 * AddAnythingSheet's OWN native Modal) BEFORE this tray's Modal had even
 * begun closing — briefly presenting a second native modal on top of a
 * still-fully-presented first one, then, ~165ms later, asking that
 * first (no-longer-topmost) modal to dismiss itself. iOS does not support
 * dismissing a presented view controller that itself has something
 * presented on top of it; the confirmed on-device result was a silently
 * failed AddAnythingSheet presentation and an orphaned, invisible,
 * fully touch-intercepting tray view — every subsequent tap in the app was
 * swallowed by it, while OS-level chrome (AssistiveTouch, screen
 * recording) stayed responsive, confirming the native view hierarchy (not
 * JS) had wedged.
 *
 * The fix: this component is now NEVER a native modal. It is a plain
 * absolutely-positioned overlay, mounted by the parent (FloatingAddButton)
 * ONLY while its own phase machine (floatingAddTransition.ts) has the tray
 * mounted, and unmounted the instant `phase` moves to 'addSheetOpen' —
 * AddAnythingSheet remains the ONE AND ONLY native Modal anywhere in this
 * flow, so there is structurally nothing left for it to race against.
 * `phase` is fully owned by the parent; this component only ever runs its
 * own visual open/close animation and reports completion via `onClosed` —
 * it never itself decides when AddAnythingSheet opens, and never calls
 * `onSelect`+"close" as two independent actions the way the old version
 * did.
 */
export function QuickActionsTray({
  phase,
  reduceMotion,
  onSelect,
  onRequestDismiss,
  onClosed,
}: {
  /** Owned entirely by the parent. This component is only ever mounted
   * while `isTrayMounted(phase)` is true, so every mount starts fresh in
   * 'trayOpen' — there is no "reopen without remount" path to guard here. */
  phase: TrayPhase;
  reduceMotion: boolean;
  onSelect: (key: QuickActionKey) => void;
  /** Backdrop tap / × is handled by the FAB, not this component / Android
   * Back / accessibility escape / an external close request (tab switch,
   * keyboard). Never closes anything directly — only ever asks the parent
   * to move the phase machine to 'closingForDismiss'. */
  onRequestDismiss: () => void;
  /** Fired exactly once, when this component's own close animation
   * (opacity/scale/translate, or its immediate Reduce-Motion equivalent)
   * has genuinely finished — the parent's SOLE signal that it is now safe
   * to unmount this component and, if a tile was selected, open
   * AddAnythingSheet. Never a guessed timeout. */
  onClosed: () => void;
}) {
  const { colors, spacing, radius, typography, cardShadow, glow, aiAccentColor, onAiAccent, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const progress = useRef(new Animated.Value(0)).current;
  const panelRef = useRef<View>(null);
  const selectionLockRef = useRef(false);
  const closingHandledRef = useRef(false);

  const interactive = phase === 'trayOpen';

  // Mount-time open animation. This component is only ever mounted by the
  // parent starting in the 'trayOpen' phase (never remounted mid-session),
  // so a plain mount-effect is correct here — there is no "same instance,
  // fresh open" case to distinguish, unlike the previous Modal-based
  // version which had to guard against exactly that.
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
    } else {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    AccessibilityInfo.announceForAccessibility('Quick actions opened');
    // A fresh overlay frame needs a beat to mount before focus can land in
    // it — matches AddAnythingSheet's own settle-then-focus pattern. This
    // is an accessibility-focus nicety, unrelated to (and not part of) the
    // modal hand-off this round corrects.
    const timer = setTimeout(() => focusElement(panelRef.current), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs the close animation exactly once per mount, whenever the parent
  // moves `phase` away from 'trayOpen' (for any reason — selection or
  // dismiss) — then reports completion via onClosed. closingHandledRef
  // guards against this firing twice if `phase` changes again while already
  // closing (it can't, per the reducer, but this stays correct regardless).
  useEffect(() => {
    if (phase === 'trayOpen') return;
    if (closingHandledRef.current) return;
    closingHandledRef.current = true;
    if (reduceMotion) {
      onClosed();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onClosed();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Android Back — previously free from RN Modal's own onRequestClose; now
  // explicit, active only while genuinely open/interactive.
  useEffect(() => {
    if (!interactive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestDismiss();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  function handleSelect(key: QuickActionKey) {
    if (!interactive) return; // pointer events are already disabled via style below; this is the same-tick backstop
    if (selectionLockRef.current) return; // fires the action once only, even under rapid tapping
    selectionLockRef.current = true;
    onSelect(key);
  }

  function handleBackdropPress() {
    if (!interactive) return;
    onRequestDismiss();
  }

  const tiles = useMemo(() => buildQuickActionTiles(askNolieCapability, brand.assistantName), []);
  const trayWidth = combinedAssemblyWidth(windowWidth);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1 },
        panel: {
          position: 'absolute',
          left: HORIZONTAL_MARGIN,
          bottom: trayBottomOffset(insets.bottom),
          width: trayWidth,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.sm,
          ...cardShadow,
        },
        row: { flexDirection: 'row' },
        tile: {
          flex: 1,
          minHeight: Math.max(minTouchTarget, 72),
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.xs,
          margin: 2,
          borderRadius: radius.control,
        },
        tileIcon: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          marginBottom: spacing.xs,
        },
        tileIconAmbient: {
          backgroundColor: aiAccentColor,
          ...glow(aiAccentColor),
        },
        tileLabel: {
          ...typography.micro,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        tileLabelAmbient: {
          color: aiAccentColor,
          fontWeight: '700',
        },
      }),
    [colors, spacing, radius, typography, cardShadow, glow, aiAccentColor, minTouchTarget, insets.bottom, trayWidth]
  );

  const animatedStyle = {
    opacity: progress,
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  };

  const rows = [tiles.slice(0, 3), tiles.slice(3, 6), tiles.slice(6, 9)];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? 'box-none' : 'none'}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleBackdropPress}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Animated.View
        ref={panelRef}
        style={[styles.panel, animatedStyle]}
        accessible
        accessibilityViewIsModal
        accessibilityRole="menu"
        accessibilityLabel="Quick actions"
        onAccessibilityEscape={onRequestDismiss}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((tile) => (
              <TouchableOpacity
                key={tile.key}
                style={styles.tile}
                onPress={() => handleSelect(tile.key)}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={tile.label}
              >
                <View style={[styles.tileIcon, tile.ambient && styles.tileIconAmbient]}>
                  <Ionicons name={tile.icon as never} size={18} color={tile.ambient ? onAiAccent : colors.textPrimary} importantForAccessibility="no" />
                </View>
                <Text style={[styles.tileLabel, tile.ambient && styles.tileLabelAmbient]} numberOfLines={2}>
                  {tile.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
