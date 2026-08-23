import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { DebtCoachSheet } from '../../src/components/debt/DebtCoachSheet';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 9a closure, Correction A — the eligibility boundary
 * for the "View credit cards" action, rendered.
 *
 * The sibling suite proves the whole journey against the real RootNavigator
 * with the owner's two-card device data. This one isolates the boundary the
 * journey cannot show from a single seed: no cards at all, and exactly one.
 *
 * REDUCE MOTION IS FORCED ON for this entire file. The action must be
 * reachable and fully rendered with animation suppressed — reachability can
 * never depend on a transition the customer has asked the OS to remove.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const Stack = createNativeStackNavigator();

/** A liability with no card behind it — present in every seed so the debt
 * overview always has content, and so a LOAN row can never be what makes
 * the action appear. */
const LOAN = { id: 'loan1', type: 'car_loan' as const, label: 'Car loan', currentBalance: 20000, interestRate: 0.07 };

function seed(mutate: (d: AppData) => void): Promise<void> {
  const d = createEmptyAppData();
  d.user.name = 'Jamie';
  d.user.hasSeenIntro = true;
  d.liabilities = [LOAN];
  mutate(d);
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function Host() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <NavigationContainer>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Host">{() => <DebtCoachSheet visible onClose={() => undefined} />}</Stack.Screen>
                <Stack.Screen name="Cards">{() => null}</Stack.Screen>
              </Stack.Navigator>
            </NavigationContainer>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Wave 9a closure — "View credit cards" eligibility, under Reduce Motion', () => {
  test('NO credit card on file → the action is not rendered at all', async () => {
    await AsyncStorage.clear();
    await seed((d) => {
      d.creditCards = [];
    });
    const root = await render(<Host />);
    // The debt overview itself is present (the car loan is real debt)…
    await screen.findByText('Your debt overview', {}, { timeout: 20000 });
    // …but there is nothing to view, so no action and no false affordance.
    expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(0);
    expect(screen.queryAllByLabelText('View credit cards')).toHaveLength(0);
    expect(screen.queryAllByText('View credit cards')).toHaveLength(0);
    // The loan row is still there, and still not pretending to navigate.
    expect(screen.getAllByText('Car loan').length).toBeGreaterThan(0);
    root.unmount();
  }, 60000);

  test('exactly ONE credit card → exactly one action, reachable with motion off', async () => {
    await AsyncStorage.clear();
    await seed((d) => {
      d.creditCards = [
        { id: 'amex1', issuer: 'AMEX', label: 'AMEX1', creditLimit: 10000, currentBalance: 10, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 50, apr: 0.2 },
      ];
      d.liabilities = [LOAN, { id: 'lam1', type: 'other', label: 'AMEX1', currentBalance: 10, creditCardId: 'amex1' }];
    });
    const root = await render(<Host />);
    await screen.findByText('Your debt overview', {}, { timeout: 20000 });
    await waitFor(() => expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(1), { timeout: 20000 });

    // One action for the whole card set, even though a loan row sits beside
    // the card row — the action is not per-row.
    expect(screen.getAllByLabelText('View credit cards')).toHaveLength(1);
    expect(screen.getAllByText('Car loan').length).toBeGreaterThan(0);

    // Reduce Motion is on for this file; the action is fully present and
    // hittable regardless.
    const action = screen.getByTestId('debt-overview-view-cards');
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.onStartShouldSetResponder ?? action.props.onClick ?? action.props.onResponderRelease).toBeDefined();
    root.unmount();
  }, 60000);
});

/**
 * Wave 9a closure, FINAL correction — the $0-balance states.
 *
 * A card at $0 is not debt, so the sheet correctly shows its calm no-debt
 * presentation. It is still a card the customer owns, so the route to Cards
 * must survive. Before this correction the action lived inside the debt
 * branch and vanished here, which was the same reachability defect arriving
 * from the opposite direction.
 */
describe('Wave 9a closure — a $0 card is not debt, but it is still a card', () => {
  const zeroCard = (id: string) => ({
    id,
    issuer: 'AMEX',
    label: `Card ${id}`,
    creditLimit: 10000,
    currentBalance: 0,
    dueDay: 15,
    minimumPayment: 0,
    apr: 0.2,
  });

  test('ONE $0 card and no other debt → calm no-debt copy AND one action', async () => {
    await AsyncStorage.clear();
    await seed((d) => {
      d.creditCards = [zeroCard('amex')];
      d.liabilities = [];
    });
    const root = await render(<Host />);

    // The no-debt presentation is preserved exactly — a $0 card is never
    // relabelled as debt, and no debt overview is fabricated for it.
    await screen.findByText("Let's understand your debt first", {}, { timeout: 20000 });
    expect(screen.getAllByText('Do you currently have any debt?').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Your debt overview')).toHaveLength(0);
    expect(screen.queryAllByText(/remaining/)).toHaveLength(0);

    // …and the route to Cards still exists, exactly once.
    await waitFor(() => expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(1), { timeout: 20000 });
    expect(screen.getAllByLabelText('View credit cards')).toHaveLength(1);
    root.unmount();
  }, 60000);

  test('MULTIPLE $0 cards and no other debt → still exactly one action', async () => {
    await AsyncStorage.clear();
    await seed((d) => {
      d.creditCards = [zeroCard('amex'), zeroCard('amex1'), zeroCard('visa')];
      d.liabilities = [];
    });
    const root = await render(<Host />);

    await screen.findByText("Let's understand your debt first", {}, { timeout: 20000 });
    await waitFor(() => expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(1), { timeout: 20000 });
    // Three cards, one action — never one per card.
    expect(screen.getAllByLabelText('View credit cards')).toHaveLength(1);
    expect(screen.queryAllByText('Your debt overview')).toHaveLength(0);
    root.unmount();
  }, 60000);

  test('NO cards and no debt at all → no action, no-debt copy intact', async () => {
    await AsyncStorage.clear();
    await seed((d) => {
      d.creditCards = [];
      d.liabilities = [];
    });
    const root = await render(<Host />);

    await screen.findByText("Let's understand your debt first", {}, { timeout: 20000 });
    expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(0);
    expect(screen.queryAllByLabelText('View credit cards')).toHaveLength(0);
    // The no-debt affordances the customer does have are untouched.
    expect(screen.getAllByText(/I have no debt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credit card').length).toBeGreaterThan(0);
    root.unmount();
  }, 60000);
});
