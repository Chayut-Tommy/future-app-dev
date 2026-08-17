import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TodayScreen } from '../screens/today/TodayScreen';
import { WealthScreen } from '../screens/wealth/WealthScreen';
import { MoneyScreen } from '../screens/money/MoneyScreen';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { tabScrollRefs } from './tabScrollRefs';
import { FloatingNavBar } from '../components/navigation/FloatingNavBar';

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
  // Read once here, at the top of the whole tab session, and threaded down
  // to the tab-hosted Money/Grow instances as a prop — the same pattern
  // RootNavigator.tsx's own MoneyDetail/GrowDetail routes use for their own,
  // separately-mounted pushed instances (each calls useReduceMotion() fresh,
  // since a push is a brand new screen instance every time, not a long-lived
  // lazily-mounted tab). Also threaded into FloatingNavBar's own tabBar
  // prop below, for its selected-tab pill transition.
  const reduceMotion = useReduceMotion();

  return (
    <Tab.Navigator
      // Floating navigation design pass — replaces ONLY the default tab
      // bar's visual presentation with FloatingNavBar's rounded capsule.
      // Route names/order/navigation state are untouched; `tabBarIcon`
      // below is still the single source of truth FloatingNavBar reads via
      // `descriptors[route.key].options.tabBarIcon` (React Navigation's own
      // custom-tab-bar contract), so the outline/filled icon mapping is
      // never duplicated. `tabBarActiveTintColor`/`tabBarInactiveTintColor`/
      // `tabBarStyle`/`tabBarLabelStyle`/`tabBarItemStyle` are the DEFAULT
      // tab bar's own styling hooks — meaningless once a custom `tabBar` is
      // supplied, so they're deliberately no longer set here.
      tabBar={(props) => <FloatingNavBar {...props} reduceMotion={reduceMotion} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        // Animated bottom-tab transitions ('fade'/'shift') were trialled in
        // Pass 2E and reverted: they caused a device-reproduced blank-scene
        // compatibility defect under the current Expo 54 / navigation
        // stack, tracked through React Navigation #12755 and Expo #39514.
        // `animation` is intentionally left unset (bottom-tabs' own
        // documented default is 'none') to retain the accepted,
        // non-animated behaviour — do not re-enable 'fade' or 'shift' here.
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
