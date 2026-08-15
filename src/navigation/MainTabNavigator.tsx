import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TodayScreen } from '../screens/today/TodayScreen';
import { WealthScreen } from '../screens/wealth/WealthScreen';
import { MoneyScreen } from '../screens/money/MoneyScreen';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import { useTheme } from '../theme/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { tabScrollRefs } from './tabScrollRefs';

const Tab = createBottomTabNavigator();

// Tapping the already-active tab scrolls it back to top (PRD ask: matches
// Instagram/Apple apps). `navigation.isFocused()` distinguishes "switching
// to this tab" from "already here, tapped again" — only the latter scrolls.
function scrollToTopOnRepeatPress(tab: keyof typeof tabScrollRefs) {
  return ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
    tabPress: () => {
      if (navigation.isFocused()) {
        tabScrollRefs[tab].current?.scrollTo({ y: 0, animated: true });
      }
    },
  });
}

const ICONS: Record<string, { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  Today: { outline: 'sunny-outline', filled: 'sunny' },
  Wealth: { outline: 'trending-up-outline', filled: 'trending-up' },
  Money: { outline: 'wallet-outline', filled: 'wallet' },
  Grow: { outline: 'compass-outline', filled: 'compass' },
};

// Outcome-organized navigation (PRD §3.0) — Today/Money/Wealth/Grow. Money
// sits second, not third (PRD ask): day-to-day cashflow is where users
// spend most of their time, while Wealth is more useful once they've
// already entered data and want to check their longer-term position. Money
// replaces the old Health tab: users interact with day-to-day money
// behavior (spending, bills, cashflow) far more often than score mechanics,
// which now live one tap away from the Lulu Score card on Today instead of
// a dedicated tab. Grow (formerly Discover) is Lulu's coaching/education
// hub — renamed so it reads as "Lulu growing me," not a content library.
export function MainTabNavigator() {
  const { colors } = useTheme();
  // Read once here, at the top of the whole tab session, and threaded down
  // to the tab-hosted Money/Grow instances as a prop — the same pattern
  // RootNavigator.tsx's own MoneyDetail/GrowDetail routes use for their own,
  // separately-mounted pushed instances (each calls useReduceMotion() fresh,
  // since a push is a brand new screen instance every time, not a long-lived
  // lazily-mounted tab).
  const reduceMotion = useReduceMotion();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tabBar: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 10,
        },
        label: { fontSize: 10.5, fontWeight: '600' },
        // Explicit equal-width flex per tab — without this, label/icon
        // width differences ("Wealth" vs "Grow") can make the four tabs
        // read as unevenly spaced (PRD bug report).
        item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      }),
    [colors]
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Animated bottom-tab transitions ('fade'/'shift') were trialled in
        // Pass 2E and reverted: they caused a device-reproduced blank-scene
        // compatibility defect under the current Expo 54 / navigation
        // stack, tracked through React Navigation #12755 and Expo #39514.
        // `animation` is intentionally left unset (bottom-tabs' own
        // documented default is 'none') to retain the accepted,
        // non-animated behaviour — do not re-enable 'fade' or 'shift' here.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.item,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? ICONS[route.name].filled : ICONS[route.name].outline} size={size ?? 22} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} listeners={scrollToTopOnRepeatPress('Today')} />
      <Tab.Screen name="Money" listeners={scrollToTopOnRepeatPress('Money')}>
        {() => <MoneyScreen reduceMotion={reduceMotion} />}
      </Tab.Screen>
      <Tab.Screen name="Wealth" component={WealthScreen} listeners={scrollToTopOnRepeatPress('Wealth')} />
      <Tab.Screen name="Grow" listeners={scrollToTopOnRepeatPress('Grow')}>
        {() => <DiscoverScreen reduceMotion={reduceMotion} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
