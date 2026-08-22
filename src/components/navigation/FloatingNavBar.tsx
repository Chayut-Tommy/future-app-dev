import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { capsuleWidth, dockBottomOffset, DOCK_HEIGHT, HORIZONTAL_MARGIN } from '../../navigation/floatingNavGeometry';
import { floatingTrayCloseRef } from '../../navigation/floatingTrayRef';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { BlurView } from 'expo-blur';
import { assemblyHorizontalInset } from '../../navigation/floatingNavGeometry';
import { designElevation, designRadius } from '../../theme/semanticTokens';
import { MOTION_MS } from '../../theme/motion';

/** Design 5.1 doc B p.3 — blur is used in exactly ONE place, the dock
 * capsule. Ordinary cards, sheets and screen content never become glass.
 * Android SDK 54 uses the documented solid fallback instead: the
 * experimental dimezisBlurView path is deliberately NOT enabled in this
 * wave. */
const DOCK_BLUR_INTENSITY = 24;

const PILL_TRANSITION_MS = 180;
const PILL_INSET = 4;

/**
 * The floating rounded capsule that replaces the default bottom-tab bar.
 *
 * WAVE 6 CORRECTION A — this was a `tabBar` render-prop on Tab.Navigator,
 * which meant it could only ever exist while the tab navigator was the
 * visible root-stack screen. Every eligible detail route (MoneyDetail,
 * GrowDetail, Transactions, Goals, Cards, EmergencyFund) is a ROOT-STACK
 * route, so pushing one unmounted the dock while the root-level "+"
 * survived — a route that dockVisibility.ts classifies VISIBLE rendered a
 * "+" with no dock beside it. The matrix was right; the dock simply was
 * not there to consult it.
 *
 * It is now a PRESENTATION component with a plain props contract, mounted
 * once at root beside FloatingAddButton so the two are genuinely one
 * assembly. It interprets no navigation state: the active tab and what a
 * press means are decided by rootNavAssembly.ts, a pure module, and handed
 * in. Everything visual — capsule, blur, pill, icons, labels, tablet cap,
 * touch targets, accessibility contract, Reduce Motion — is unchanged.
 */
export interface DockTab {
  name: string;
  label: string;
  /** Already resolved for the tab's own focused/unfocused state by the
   * caller, from the single shared definition in tabDefinitions.ts. */
  icon: (args: { focused: boolean; color: string; size: number }) => React.ReactNode;
}

export function FloatingNavBar({
  tabs,
  activeIndex,
  onSelectTab,
  reduceMotion,
  hidden = false,
}: {
  tabs: readonly DockTab[];
  /** -1 when no tab should be lit. */
  activeIndex: number;
  onSelectTab: (tab: DockTab, index: number) => void;
  reduceMotion: boolean;
  /** Wave 8 closure — visual gate only. The bar stays mounted so its
   * pill animation is never re-created and its entry never replays. */
  hidden?: boolean;
}) {
  const { colors, semantic, scheme, spacing, radius, typography, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();

  // A negative index means "light nothing"; the pill parks at 0 and is
  // hidden, so it never animates in from off-screen when a tab regains
  // ownership.
  const pillIndex = Math.max(activeIndex, 0);
  const pillPosition = useRef(new Animated.Value(pillIndex)).current;

  useEffect(() => {
    if (reduceMotion) {
      pillPosition.setValue(pillIndex);
      return;
    }
    Animated.timing(pillPosition, {
      toValue: pillIndex,
      duration: PILL_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pillIndex, pillPosition, reduceMotion]);

  const width = capsuleWidth(windowWidth);
  const tabWidth = width / Math.max(tabs.length, 1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        capsuleHidden: { opacity: 0 },
        capsule: {
          position: 'absolute',
          // Tablet: the assembly is capped and centred, so the capsule's own
          // left edge moves in by the shared inset (phones: 0).
          left: HORIZONTAL_MARGIN + assemblyHorizontalInset(windowWidth),
          bottom: dockBottomOffset(insets.bottom),
          width,
          height: DOCK_HEIGHT,
          borderRadius: designRadius.pill,
          // Semi-opaque Design 5.1 surface ABOVE the blur (doc B p.3:
          // "dock capsule background at 92% opacity + 12 pt blur"). On
          // Android this same surface is the documented solid fallback.
          backgroundColor: semantic.bgSurface,
          opacity: Platform.OS === 'ios' ? undefined : 1,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          flexDirection: 'row',
          // Clips the BlurView to the capsule radius.
          overflow: 'hidden',
          ...cardShadow,
        },
        // iOS only. Sits beneath the tabs but above the scrolling content
        // behind the dock, so it samples live content as the screen moves.
        blurLayer: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: designRadius.pill,
        },
        // The semi-opaque veil that keeps Design 5.1's surface reading as a
        // surface rather than raw glass.
        capsuleVeil: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: semantic.bgSurface,
          opacity: designElevation.blur.dockCapsule.opacity,
        },
        pill: {
          position: 'absolute',
          top: PILL_INSET,
          bottom: PILL_INSET,
          left: PILL_INSET,
          width: tabWidth - PILL_INSET * 2,
          borderRadius: designRadius.pill,
          backgroundColor: semantic.interactiveTint,
        },
        tab: {
          width: tabWidth,
          alignItems: 'center',
          justifyContent: 'center',
        },
        label: {
          ...typography.micro,
          marginTop: 2,
        },
      }),
    [colors, semantic, scheme, spacing, radius, typography, cardShadow, width, tabWidth, insets.bottom, windowWidth]
  );

  if (keyboardVisible) return null;

  return (
    /* Wave 8 closure — a VISUAL gate. The bar keeps its mount, its
       Animated.Value and its pill position; while hidden it is fully
       transparent, takes no touches and is removed from the accessibility
       tree, so it can never be reached on Settings or a calculator. */
    <View
      style={[styles.capsule, hidden ? styles.capsuleHidden : null]}
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID="floating-nav-bar"
    >
      {/* iOS only. Declared FIRST so it paints beneath the tabs, and it is
          inside the capsule (which sets overflow:'hidden') so the pill
          radius clips it. Android SDK 54 takes the documented solid
          fallback — the capsule's own semantic surface — rather than the
          experimental native blur, which is not enabled in this wave. */}
      {Platform.OS === 'ios' ? (
        <>
          <BlurView
            intensity={DOCK_BLUR_INTENSITY}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={styles.blurLayer}
            pointerEvents="none"
          />
          <View style={styles.capsuleVeil} pointerEvents="none" />
        </>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          { opacity: activeIndex < 0 ? 0 : 1, transform: [{ translateX: Animated.multiply(pillPosition, tabWidth) }] },
        ]}
      />
      {tabs.map((tab, index) => {
        const label = tab.label;
        const isFocused = activeIndex === index;
        // Design 5.1: selected uses the interactive role (Ocean Blue in
        // every colour style); inactive uses tertiary ink.
        const color = isFocused ? semantic.interactive : semantic.textTertiary;

        const onPress = () => {
          onSelectTab(tab, index);
          // Any tab press (including a repeat press on the already-focused
          // tab) closes a currently open quick-actions tray, so switching
          // tabs never leaves it hanging over the newly-selected screen.
          floatingTrayCloseRef.current?.();
        };

        // Matches @react-navigation/bottom-tabs' own default tab bar
        // exactly (BottomTabBar.tsx) — VoiceOver doesn't reliably honour
        // role:"tab" on iOS (a known RN/iOS accessibility gap, not
        // something specific to this custom bar), so the upstream
        // default tab bar falls back to role:"button" plus a spoken
        // "<label>, tab, <n> of <total>" accessibilityLabel there
        // instead; Android keeps the semantically correct role:"tab" and
        // no added suffix. Preserving this exact contract (not just
        // "a" tab role) keeps every existing accessibility-role query
        // and VoiceOver's already-correct announcement unchanged.
        const accessibleLabel =
          typeof label === 'string' && Platform.OS === 'ios' ? `${label}, tab, ${index + 1} of ${tabs.length}` : label;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.75}
            accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={typeof accessibleLabel === 'string' ? accessibleLabel : tab.name}
          >
            {tab.icon({ focused: isFocused, color, size: 22 })}
            <Text style={[styles.label, { color, fontWeight: isFocused ? '700' : '600' }]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
