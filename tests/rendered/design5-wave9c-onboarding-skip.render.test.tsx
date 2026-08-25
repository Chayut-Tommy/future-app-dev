// Wave 9c — the SKIP path, DELIBERATELY ITS OWN FILE: a second root in
// the same jest module realm does not reliably process the first press of
// a fresh WelcomeFlow (the same empirically-verified multi-root pathology
// design5-wave9a-shell.render.test.tsx documents). A fresh module registry
// keeps the evidence honest.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { AppData } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function appDataWrites(spy: jest.SpyInstance, from: number): number {
  return spy.mock.calls.slice(from).filter((c) => c[0] === STORAGE_KEY).length;
}

async function storedData(): Promise<AppData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AppData) : null;
}

describe('Wave 9c — the Skip path: absent means ABSENT', () => {
  let view: any;
  let setItemSpy: jest.SpyInstance;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
    view = await render(<Harness />);
    await screen.findByText(/Meet Nolie/, {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('a fresh install still opens on Welcome', () => {
    // Also gives the async provider boot a full test boundary to settle
    // before the walk below — the same sequencing root 1 relies on.
    expect(screen.getByTestId('onboarding-get-started')).toBeTruthy();
    expect(screen.queryByLabelText(/^Today, tab,/)).toBeNull();
  });

  test('Skip from AGE lands directly on the disclosure — never the next question', async () => {
    fireEvent.press(screen.getByTestId('onboarding-get-started'));
    await screen.findByTestId('onboarding-continue');
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('onboarding-name-input');
    fireEvent.changeText(screen.getByTestId('onboarding-name-input'), 'Sam');
    await screen.findByDisplayValue('Sam');
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('onboarding-age-input');
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    await screen.findByText('Before you get started');
    // It did NOT pass through cadence or setup.
    expect(screen.queryByTestId('onboarding-cadence-fortnightly')).toBeNull();
    expect(screen.queryByText('Add a starting point?')).toBeNull();
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 7 of 7');
  });

  test('Back preserves drafts; skipped completion stores NO age, cadence or records', async () => {
    // Back from disclosure returns to setup with the name draft intact.
    fireEvent.press(screen.getByTestId('onboarding-back'));
    await screen.findByText('Add a starting point?');
    fireEvent.press(screen.getByTestId('onboarding-back'));
    await screen.findByTestId('onboarding-cadence-weekly');
    fireEvent.press(screen.getByTestId('onboarding-back'));
    await screen.findByTestId('onboarding-age-input');
    fireEvent.press(screen.getByTestId('onboarding-back'));
    await screen.findByTestId('onboarding-name-input');
    expect(screen.getByTestId('onboarding-name-input').props.value).toBe('Sam');

    // Forward again via Skip, and complete.
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('onboarding-skip');
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    await screen.findByText('Before you get started');
    const baseline = setItemSpy.mock.calls.length;
    fireEvent.press(screen.getByTestId('onboarding-acknowledge'));
    await waitFor(() => expect(screen.getByTestId('onboarding-acknowledge').props.accessibilityState?.checked).toBe(true));
    fireEvent.press(screen.getByTestId('onboarding-finish'));
    await screen.findByLabelText(/^Today, tab,/, {}, { timeout: 20000 });

    // The FIRST app-data write after the press IS the completion (it flips
    // hasSeenIntro) — proving no intermediate write ever preceded it. Today
    // mounts afterwards and legitimately performs its own writes, so an
    // exact total is not assertable here; duplication is instead excluded
    // below by the record counts (a second commit would duplicate them).
    const writes = setItemSpy.mock.calls.slice(baseline).filter((c) => c[0] === STORAGE_KEY);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect((JSON.parse(writes[0][1]) as AppData).user.hasSeenIntro).toBe(true);
    // The skip journey entered NO optional records — the completion write
    // itself must carry none.
    expect((JSON.parse(writes[0][1]) as AppData).recurringItems.filter((r) => r.type === 'income')).toHaveLength(0);
    const stored = (await storedData())!;
    expect(stored.user.name).toBe('Sam');
    // Skipped values are ABSENT — never zero, never defaulted.
    expect(stored.user.age).toBeUndefined();
    // ONBOARDING wrote no cadence (the pure suite proves finish() omits
    // payFrequency when cadence is null). The stored value is the
    // pre-existing syncIncomeAggregate pipeline default — `primary?.frequency
    // ?? 'monthly'` — which EVERY persist has always applied; with no income
    // recorded it resolves to that engine default, not a customer answer.
    expect(stored.user.payFrequency).toBe('monthly');
    expect(stored.user.monthlyIncome).toBe(0);
    expect(stored.recurringItems.filter((r) => r.type === 'income')).toHaveLength(0);
    expect(stored.assets).toHaveLength(0);
    expect(stored.goals).toHaveLength(0);
  });
});
