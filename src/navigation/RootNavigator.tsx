import React from 'react';
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
import { FloatingLuluButton } from '../components/navigation/FloatingLuluButton';
import { FloatingAddButton } from '../components/navigation/FloatingAddButton';
import { WelcomeFlow } from '../screens/welcome/WelcomeFlow';

const RootStack = createNativeStackNavigator();

// No forced onboarding wizard (PRD §2.1, §20): every user lands straight on
// the main experience as a Guest. The only gate is a one-time, skippable
// welcome (WelcomeFlow) — not a data-collection form, just a hello. The
// floating "Talk to Lulu" button lives here, outside the tab navigator, so
// it persists across every tab and screen.
export function RootNavigator() {
  const { data, isLoading } = useAppState();
  const { colors } = useTheme();

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
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
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
      {/* "+" = add/update my money, Lulu = ask for guidance (PRD ask) — the
          larger + button is the primary action; the smaller Lulu bubble
          sits beside it, not stacked, so the two don't visually compete. */}
      <FloatingAddButton />
      <FloatingLuluButton />
    </View>
  );
}
