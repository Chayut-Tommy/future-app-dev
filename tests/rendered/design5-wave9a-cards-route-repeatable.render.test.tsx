import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';

/**
 * Nolie Design 5.1 Wave 9a closure, Correction A — the Money route to Cards
 * is REPEATABLE, not one-shot.
 *
 * This matters specifically because the route it replaces was one-shot by
 * nature: a `card_due_soon` reminder disappears once snoozed or dismissed.
 * A replacement that only worked once would not actually fix the defect.
 *
 * DELIBERATELY ITS OWN FILE with ONE root and ONE test: the sibling
 * reachability suite keeps a single long-lived root across many tests, and
 * a second full journey through the same root does not reliably re-present
 * the native Modal under RNTL. That is a harness limitation, not product
 * behaviour — proven here, where a fresh root completes the journey twice.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const navRef = createNavigationContainerRef<any>();

function stack(): string[] {
  return navRef.isReady() ? (navRef.getRootState().routes as any[]).map((r) => r.name) : [];
}

test('Money → debt overview → Cards works twice in a row', async () => {
  await AsyncStorage.clear();
  const d = createEmptyAppData();
  d.user.name = 'Jamie';
  d.user.hasSeenIntro = true;
  // Owner's device data after the recording.
  d.creditCards = [
    { id: 'amex', issuer: 'AMEX', label: 'AMEX', creditLimit: 10000, currentBalance: 0, dueDay: 15, minimumPayment: 0, apr: 0.2 },
    { id: 'amex1', issuer: 'AMEX', label: 'AMEX1', creditLimit: 10000, currentBalance: 10, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 50, apr: 0.2 },
  ];
  d.liabilities = [{ id: 'lam1', type: 'other', label: 'AMEX1', currentBalance: 10, creditCardId: 'amex1' }];
  await AsyncStorage.setItem('moneycoach.appdata.v1', JSON.stringify(d));

  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer ref={navRef}>
                <RootNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );

  fireEvent.press(await screen.findByLabelText(/^Money, tab,/, {}, { timeout: 20000 }));
  await screen.findByText('View full debt overview', {}, { timeout: 20000 });

  // --- first journey ---
  fireEvent.press(screen.getByText('View full debt overview'));
  fireEvent.press(await screen.findByTestId('debt-overview-view-cards', {}, { timeout: 20000 }));
  await waitFor(() => expect(stack()).toContain('Cards'), { timeout: 20000 });
  expect(stack().filter((n) => n === 'Cards')).toHaveLength(1);

  // --- back ---
  await act(async () => {
    navRef.goBack();
  });
  await waitFor(() => expect(screen.queryAllByText('View full debt overview').length).toBeGreaterThan(0), { timeout: 20000 });
  expect(stack()).toEqual(['Main']);
  // No empty sheet left layered underneath.
  expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(0);
  expect(screen.queryAllByText('Your debt overview')).toHaveLength(0);

  // --- second journey: the latch reset, so this must work identically ---
  fireEvent.press(screen.getAllByText('View full debt overview')[0]);
  await new Promise((r) => setImmediate(r));
  expect(screen.queryAllByTestId('debt-overview-view-cards')).toHaveLength(1);

  fireEvent.press(screen.getByTestId('debt-overview-view-cards'));
  await waitFor(() => expect(stack()).toContain('Cards'), { timeout: 20000 });
  expect(stack().filter((n) => n === 'Cards')).toHaveLength(1);
}, 90000);
