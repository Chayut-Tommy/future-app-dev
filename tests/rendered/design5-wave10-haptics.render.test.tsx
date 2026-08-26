// Wave 10 closure — haptic OWNERSHIP, proven behaviourally. The central
// dispatcher module (src/lib/haptics) is mocked so every REAL invocation
// is counted, while the REAL orchestration runs end to end: checklist ->
// real forms -> real persistence -> TodayScreen's unlock effect ->
// CelebrationContext's single queue -> keyed toast mounts -> dismissal.
// Nothing here mirrors production logic; the counts come out of the same
// boundary the device vibrates from.
//
// The confirmed defect: one Save that queues TWO celebrations produced
// TWO softSuccess haptics (one per keyed renderer mount). The corrected
// ownership: celebrate()'s enqueue boundary fires the action's single
// softSuccess only when it STARTS a presentation run (queue was empty);
// renderers are haptically silent.
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
import { createEmptyAppData } from '../../src/lib/storage';
import { hapticLight, hapticRigid, hapticSoftSuccess, hapticWarning } from '../../src/lib/haptics';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// The central dispatcher — the ONLY module allowed to touch expo-haptics —
// is replaced with counters. Everything downstream of it is real.
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

function counts() {
  return { light: light.mock.calls.length, soft: soft.mock.calls.length, warning: warning.mock.calls.length, rigid: rigid.mock.calls.length };
}

describe('One action, one haptic — through the real queue', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu'];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('app mount and data load dispatch nothing', () => {
    expect(counts()).toEqual({ light: 0, soft: 0, warning: 0, rigid: 0 });
  });

  test('opening a form and cancelling dispatches nothing', async () => {
    fireEvent.press(screen.getByTestId('checklist-cash'));
    await screen.findByPlaceholderText('e.g. Vanguard ETF', {}, { timeout: 20000 });
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByPlaceholderText('e.g. Vanguard ETF')).toBeNull(), { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 0, warning: 0, rigid: 0 });
  }, 60000);

  test('ONE Save queuing TWO celebrations fires exactly ONE softSuccess; dismissal, second mount and rerender add nothing', async () => {
    // The savings save unlocks added_first_asset AND added_savings in the
    // same persist — the exact double-haptic defect scenario.
    fireEvent.press(screen.getByTestId('checklist-cash'));
    const nameInput = await screen.findByPlaceholderText('e.g. Vanguard ETF', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Rainy day');
    await screen.findByDisplayValue('Rainy day');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '500');
    await screen.findByDisplayValue('500');
    // Typing produced no warning (calm validation stays haptically silent).
    expect(warning).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Added First Asset', {}, { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });

    // Manual dismissal advances the queue; the SECOND event's own keyed
    // mount must not vibrate — the run already carried its one haptic.
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await screen.findByText('Added Savings', {}, { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });

    // An unrelated rerender over the visible toast changes nothing.
    view.rerender(<Harness />);
    expect(screen.getByText('Added Savings')).toBeTruthy();
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });

    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });
  }, 60000);
});
