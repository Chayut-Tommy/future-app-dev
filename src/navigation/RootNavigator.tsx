import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppState } from '../state/AppStateContext';
import { useTheme } from '../theme/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { MainTabNavigator } from './MainTabNavigator';
import { MoneyScreen } from '../screens/money/MoneyScreen';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { LanguageScreen } from '../screens/settings/LanguageScreen';
import { ResetLuluScreen } from '../screens/settings/ResetLuluScreen';
import { GoalsScreen } from '../screens/goals/GoalsScreen';
import { CardsScreen } from '../screens/cards/CardsScreen';
import { TransactionsScreen } from '../screens/transactions/TransactionsScreen';
import { SavingsComparisonScreen } from '../screens/discover/SavingsComparisonScreen';
import { CompoundCalculatorScreen } from '../screens/discover/CompoundCalculatorScreen';
import { EmergencyFundScreen } from '../screens/discover/EmergencyFundScreen';
import { HomeLoanCalculatorScreen } from '../screens/discover/HomeLoanCalculatorScreen';
import { FloatingAddButton } from '../components/navigation/FloatingAddButton';
import { GlobalNavDock } from '../components/navigation/GlobalNavDock';
import { resolveRootNavAssembly, resolveTabPress } from './rootNavAssembly';
import { TabName } from './tabDefinitions';
import { tabScrollRefs } from './tabScrollRefs';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { getActiveTab, subscribeActiveTab } from './activeTabStore';
import { WelcomeFlow } from '../screens/welcome/WelcomeFlow';
import { isDockVisibleForRouteName } from './dockVisibility';

const RootStack = createNativeStackNavigator();

// No forced onboarding wizard (PRD §2.1, §20): every user lands straight on
// the main experience as a Guest. The only gate is a one-time, skippable
// welcome (WelcomeFlow) — not a data-collection form, just a hello. The
// global "+"/quick-actions FAB lives here, outside the tab navigator, so
// it persists across every tab and screen.
export function RootNavigator() {
  const { data, isLoading } = useAppState();
  const { colors } = useTheme();
  // Design 5.1 Wave 2 — the detached "+" is a root-level singleton, so it
  // was previously present on every pushed screen (audit D5-013). Its
  // visibility now comes from the pure route matrix in dockVisibility.ts.
  // 'Main' is the tab navigator: all four tab roots are visible routes, so
  // it resolves visible without needing the tab's own name here.
  // Observed through the navigator's OWN screenListeners rather than
  // useNavigationState: this component renders the root navigator, so it has
  // no parent navigator state to read and the hook would throw.
  const [activeRootRoute, setActiveRootRoute] = useState<string | undefined>(undefined);
  // Wave 6 correction A — the tab selected INSIDE `Main`. Read from the
  // same state event, because the dock now lives out here and can no longer
  // learn it from React Navigation's tab-bar props.
  const [activeTabRoute, setActiveTabRoute] = useState<string | undefined>(() => getActiveTab());
  // Published by MainTabNavigator from React Navigation's own tab state
  // event — the root stack does not re-emit for a change confined to the
  // nested navigator, which would otherwise leave the pill stale after a
  // cross-tab move made from a pushed route.
  useEffect(() => subscribeActiveTab(setActiveTabRoute), []);
  // Captured from React Navigation itself the first time it reports state.
  // This component renders the root navigator, so it has no parent
  // navigator context and no hook can supply one; a screen's own navigation
  // object is the smallest thing that can dispatch here, and is strictly
  // less than a global container ref.
  const rootNavigationRef = useRef<any>(null);
  const keyboardVisible = useKeyboardVisible();

  // ONE projection for the whole assembly. The dock and the "+" both read
  // it, so a route classified visible can never render one without the
  // other — which is exactly the defect this correction fixes.
  const assembly = resolveRootNavAssembly({
    rootRoute: activeRootRoute,
    nestedTab: activeTabRoute,
    keyboardVisible,
    overlay: 'none',
  });
  const fabRouteHidden = !assembly.visible;

  function handleTabPress(tab: TabName) {
    const outcome = resolveTabPress(tab, activeRootRoute, activeTabRoute);
    if (outcome.kind === 'scrollToTop') {
      // The same pure behaviour MainTabNavigator's per-tab listener used —
      // the dock no longer emits `tabPress`, so it calls the behaviour
      // directly rather than duplicating it.
      tabScrollRefs[tab].current?.scrollTo({ y: 0, animated: true });
      return;
    }
    // Both `returnToRoot` and `navigate` are the same dispatch: reveal that
    // tab's root inside Main. From a detail route this also pops it, so the
    // detail never stays layered above the revealed root.
    rootNavigationRef.current?.navigate('Main', { screen: tab });
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!data.user.hasSeenIntro) {
    return <WelcomeFlow />;
  }

  return (
    <View style={{ flex: 1 }}>
      <RootStack.Navigator
        screenListeners={({ navigation }) => ({
          state: (e) => {
            rootNavigationRef.current = navigation;
            const st = e.data?.state as
              | { index: number; routes: { name: string; state?: { index?: number; routes?: { name: string }[] } }[] }
              | undefined;
            if (!st) return;
            // ONLY the root route is read here. The selected tab comes
            // from activeTabStore, published by the tab navigator's own
            // state event — reading the nested snapshot here as well gave
            // two writers for one value, and this event can fire AFTER the
            // tab event carrying a stale snapshot, clobbering the correct
            // one. One writer, one value.
            setActiveRootRoute(st.routes[st.index]?.name);
          },
        })} screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabNavigator} />
        <RootStack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="Language" component={LanguageScreen} />
        {/* Reachable from any tab (PRD ask: expanded screens are temporary
            layers on top of whichever tab is active, not a jump to the tab
            that "owns" the feature — back always returns to where the user
            started, never switches tabs on its own). */}
        <RootStack.Screen name="Goals" component={GoalsScreen} />
        <RootStack.Screen name="Cards" component={CardsScreen} />
        <RootStack.Screen name="Transactions" component={TransactionsScreen} />
        {/* Pass 2E final correction (destination-reveal replacement) — Today
            Briefing's four destinations (Available Until Payday, an outflow
            event row, Score, Journey) push onto this exact same root stack,
            the identical mechanism Transactions already uses (no navigator
            options beyond the stack's own headerShown:false — pure native-
            stack push defaults: slide-in-from-right, swipe-back enabled).
            Each renders the exact existing canonical Money/Grow screen
            component (never a duplicate/rebuilt content surface) in its
            `pushed` mode — see MoneyScreen.tsx/DiscoverScreen.tsx for what
            that mode changes (a real Back header instead of none, a private
            ScrollView ref instead of the shared tab one, and non-animated
            initial-section positioning instead of DestinationReveal's
            retired opacity fade). reduceMotion is read fresh here, once per
            push, via its own useReduceMotion() call — this route is a brand
            new screen instance every time (never the long-lived, lazily-
            mounted tab instance MainTabNavigator's own single call already
            serves), so there is no mount-order race to avoid here. */}
        <RootStack.Screen name="MoneyDetail">
          {() => {
            const reduceMotion = useReduceMotion();
            return <MoneyScreen reduceMotion={reduceMotion} pushed />;
          }}
        </RootStack.Screen>
        <RootStack.Screen name="GrowDetail">
          {() => {
            const reduceMotion = useReduceMotion();
            return <DiscoverScreen reduceMotion={reduceMotion} pushed />;
          }}
        </RootStack.Screen>
        <RootStack.Screen name="SavingsComparison" component={SavingsComparisonScreen} />
        <RootStack.Screen name="CompoundCalculator" component={CompoundCalculatorScreen} />
        <RootStack.Screen name="EmergencyFund" component={EmergencyFundScreen} />
        <RootStack.Screen name="HomeLoanCalculator" component={HomeLoanCalculatorScreen} />
        <RootStack.Screen name="ResetLulu" component={ResetLuluScreen} />
      </RootStack.Navigator>
      {/* Floating navigation design pass — the standalone "Ask Lulu" bubble
          (FloatingLuluButton, its own separate corner button opening a
          "Coming with Premium" teaser sheet) is retired: the quick-actions
          tray's own centre tile now owns that slot (falling back to
          "Add anything" while Ask Nolie itself remains unbuilt — see
          src/lib/askNolie.ts), and the two buttons would otherwise overlap
          in the same bottom-right corner this FAB now occupies. */}
      {/* Wave 6 correction A — the dock and the "+" are ONE root-level
          assembly. Both are siblings of the navigator, so an eligible
          root-stack push changes the scene beneath them without either
          unmounting, and both are driven by the same `assembly`
          projection so the "+" can never appear orphaned. */}
      <GlobalNavDock assembly={assembly} onTabPress={handleTabPress} />
      <FloatingAddButton routeHidden={fabRouteHidden} />
    </View>
  );
}
