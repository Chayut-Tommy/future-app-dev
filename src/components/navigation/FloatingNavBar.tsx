import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { capsuleWidth, dockBottomOffset, DOCK_HEIGHT, HORIZONTAL_MARGIN } from '../../navigation/floatingNavGeometry';
import { floatingTrayCloseRef } from '../../navigation/floatingTrayRef';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';

const PILL_TRANSITION_MS = 180;
const PILL_INSET = 4;

/**
 * The floating rounded capsule replacing the default bottom-tab bar
 * (floating navigation design pass) — a `tabBar` render-prop passed to
 * `Tab.Navigator` in MainTabNavigator.tsx, React Navigation's own
 * customisation point. This is why it only ever mounts inside the tab
 * navigator (exactly like the default tab bar it replaces, hidden on every
 * pushed screen) while the "+"/tray assembly it visually pairs with
 * (FloatingAddButton.tsx) is a separate, persistent root-level singleton —
 * see that file's own doc comment for why. Both read the same shared
 * geometry (floatingNavGeometry.ts) so they align into one seamless
 * assembly without being the same React tree.
 *
 * Implements the standard custom-tab-bar contract (emit `tabPress`, honour
 * `defaultPrevented`, then `navigate`) so every existing per-tab listener —
 * MainTabNavigator's own `scrollToTopOnRepeatPress` — keeps firing exactly
 * as it did against the default tab bar. Route names, order, and
 * navigation state are untouched; only the visual presentation changes.
 */
export function FloatingNavBar({ state, descriptors, navigation, reduceMotion }: BottomTabBarProps & { reduceMotion: boolean }) {
  const { colors, spacing, radius, typography, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();

  const pillPosition = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    if (reduceMotion) {
      pillPosition.setValue(state.index);
      return;
    }
    Animated.timing(pillPosition, {
      toValue: state.index,
      duration: PILL_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state.index, pillPosition, reduceMotion]);

  const width = capsuleWidth(windowWidth);
  const tabWidth = width / Math.max(state.routes.length, 1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        capsule: {
          position: 'absolute',
          left: HORIZONTAL_MARGIN,
          bottom: dockBottomOffset(insets.bottom),
          width,
          height: DOCK_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          flexDirection: 'row',
          ...cardShadow,
        },
        pill: {
          position: 'absolute',
          top: PILL_INSET,
          bottom: PILL_INSET,
          left: PILL_INSET,
          width: tabWidth - PILL_INSET * 2,
          borderRadius: radius.pill,
          backgroundColor: colors.secondarySoft,
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
    [colors, spacing, radius, typography, cardShadow, width, tabWidth, insets.bottom]
  );

  if (keyboardVisible) return null;

  return (
    <View style={styles.capsule} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { transform: [{ translateX: Animated.multiply(pillPosition, tabWidth) }] }]}
      />
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string | undefined) ?? options.title ?? route.name;
        const isFocused = state.index === index;
        const color = isFocused ? colors.secondary : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
          // Floating navigation design pass — any tab press (including a
          // repeat press on the already-focused tab) closes a currently
          // open quick-actions tray, so switching tabs never leaves it
          // hanging over the newly-selected screen.
          floatingTrayCloseRef.current?.();
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
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
          typeof label === 'string' && Platform.OS === 'ios' ? `${label}, tab, ${index + 1} of ${state.routes.length}` : label;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.75}
            accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={typeof accessibleLabel === 'string' ? accessibleLabel : route.name}
          >
            {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
            <Text style={[styles.label, { color, fontWeight: isFocused ? '700' : '600' }]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
