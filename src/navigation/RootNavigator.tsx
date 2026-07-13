import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppState } from '../state/AppStateContext';
import { useTheme } from '../theme/ThemeContext';
import { MainTabNavigator } from './MainTabNavigator';
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
