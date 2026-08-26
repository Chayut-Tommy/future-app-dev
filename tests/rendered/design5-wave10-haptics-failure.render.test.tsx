// Wave 10 closure — the FAILED save's haptic contract, behaviourally, at
// the real seam (doc C: warning = blocked action / destructive confirm
// shown / save failure; softSuccess only after the authoritative
// transition succeeds). ITS OWN FILE: a fresh WelcomeFlow root in a used
// module realm does not reliably process its first press (the documented
// multi-root pathology design5-wave9c-onboarding-skip.render.test.tsx
// exists for).
//
// The journey is the proven skip path; the failure is forced exactly where
// the onboarding suite forces it — the next app-data write rejects — so
// the counts come from the REAL completion catch, not a simulated error.
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
import { hapticLight, hapticRigid, hapticSoftSuccess, hapticWarning } from '../../src/lib/haptics';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../src/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticSoftSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticRigid: jest.fn(),
}));

const soft = hapticSoftSuccess as jest.Mock;
const light = hapticLight as jest.Mock;
const warning = hapticWarning as jest.Mock;
const rigid = hapticRigid as jest.Mock;

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

describe('Failed save: one warning, zero softSuccess; the retried success earns exactly one', () => {
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

  test('the journey to the completion CTA dispatches nothing', async () => {
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
    fireEvent.press(screen.getByTestId('onboarding-acknowledge'));
    await waitFor(() => expect(screen.getByTestId('onboarding-acknowledge').props.accessibilityState?.checked).toBe(true));
    expect(soft).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(rigid).not.toHaveBeenCalled();
    expect(light).not.toHaveBeenCalled();
  }, 60000);

  test('a FAILED completion fires ONE warning and NO softSuccess', async () => {
    setItemSpy.mockRejectedValueOnce(new Error('disk full'));
    fireEvent.press(screen.getByTestId('onboarding-finish'));
    await screen.findByTestId('onboarding-error-banner', {}, { timeout: 20000 });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(soft).not.toHaveBeenCalled();
    expect(rigid).not.toHaveBeenCalled();
  }, 60000);

  test('the successful retry earns exactly ONE softSuccess — carried by its real first celebration, not by the failure', async () => {
    fireEvent.press(screen.getByTestId('onboarding-finish'));
    await screen.findByLabelText(/^Today, tab,/, {}, { timeout: 20000 });
    // Landing on Today unlocks the first milestone through the real
    // effect -> celebrate() path: the run's single haptic.
    await waitFor(() => expect(soft).toHaveBeenCalledTimes(1), { timeout: 20000 });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(rigid).not.toHaveBeenCalled();
    expect(light).not.toHaveBeenCalled();
  }, 60000);
});
