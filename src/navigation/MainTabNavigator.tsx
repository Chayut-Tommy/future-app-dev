import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TodayScreen } from '../screens/today/TodayScreen';
import { WealthScreen } from '../screens/wealth/WealthScreen';
import { MoneyScreen } from '../screens/money/MoneyScreen';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import { useTheme } from '../theme/ThemeContext';
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

// Outcome-organized navigation (PRD §3.0) — Today/Wealth/Money/Grow.
// Money replaces the old Health tab: users interact with day-to-day money
// behavior (spending, bills, cashflow) far more often than score mechanics,
// which now live one tap away from the Lulu Score card on Today instead of
// a dedicated tab. Grow (formerly Discover) is Lulu's coaching/education
// hub — renamed so it reads as "Lulu growing me," not a content library.
export function MainTabNavigator() {
  const { colors } = useTheme();

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
      <Tab.Screen name="Wealth" component={WealthScreen} listeners={scrollToTopOnRepeatPress('Wealth')} />
      <Tab.Screen name="Money" component={MoneyScreen} listeners={scrollToTopOnRepeatPress('Money')} />
      <Tab.Screen name="Grow" component={DiscoverScreen} listeners={scrollToTopOnRepeatPress('Grow')} />
    </Tab.Navigator>
  );
}
