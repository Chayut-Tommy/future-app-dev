// Post-Wave-10 checklist UX closure, part 2 — the bills journey and the
// goal deferral, IN THEIR OWN FILE: a third root in the part-1 realm stops
// committing the toast queue's advance (the documented multi-root/module
// realm pathology), so these journeys get a fresh realm — the same split
// design5-savings-allocation-save.render.test.tsx established.
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
import { AppData, Asset } from '../../src/types/models';

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

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

describe('Bills and deferral — canonical journeys with factual confirmation', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu', 'added_first_asset', 'added_savings'];
    d.assets = [
      { id: 'sv1', type: 'savings', label: 'Rainy day', currentValue: 500 } as Asset,
      { id: 'pr1', type: 'property', label: 'Home', currentValue: 3000 } as Asset,
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the goal deferral is its own quiet action; afterwards progress honestly reads "reviewed", the chip reads Later, and the row stays reopenable', async () => {
    expect(screen.getByText('2 of 7 complete')).toBeTruthy();
    fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-goal-defer', {}, { timeout: 20000 });
    // One press defers. (Rapid-tap idempotence is pinned structurally in
    // the composition suite: every footer writer sets a constant boolean
    // flag, so repeated taps cannot duplicate anything — a rendered
    // same-tick double-press trips the documented realm commit wedge, so
    // it is not driven here.)
    fireEvent.press(screen.getByTestId('checklist-goal-defer'));
    await screen.findByText('3 of 7 reviewed', {}, { timeout: 20000 });
    expect(screen.getByText('Later', { includeHiddenElements: true })).toBeTruthy();
    expect((await stored()).user.confirmedGoalLater).toBe(true);
    // Never called complete once an acknowledgement is in the numerator.
    expect(screen.queryByText('3 of 7 complete')).toBeNull();
    // The deferred row remains an enabled, reopenable control, and the
    // resolved footer is REMOVED from its group (no orphaned action).
    expect(screen.getByTestId('checklist-goal').props.accessibilityState?.disabled).toBe(false);
    expect(screen.queryByTestId('checklist-goal-defer')).toBeNull();
    // Exactly one goal-less write happened: the flag alone, nothing else.
    const after = await stored();
    expect(after.goals).toHaveLength(0);
    expect(after.user.confirmedGoalLater).toBe(true);
  }, 60000);

  test('the bills task runs the canonical recurring-bill flow and confirms factually', async () => {
    fireEvent.press(screen.getByTestId('checklist-bills'));
    const nameInput = await screen.findByPlaceholderText('e.g. Netflix', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Internet');
    await screen.findByDisplayValue('Internet');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '80');
    await screen.findByDisplayValue('80');
    // Weekly needs no day-of-month anchor; the date is optional.
    fireEvent.press(screen.getByText('Weekly'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(async () => expect((await stored()).recurringItems.filter((r) => r.type === 'expense')).toHaveLength(1), { timeout: 20000 });
    // The calm factual confirmation, sequential and singular.
    await screen.findByText('Bill added', {}, { timeout: 20000 });
    expect(screen.getByText('Saved to your money picture.')).toBeTruthy();
    expect(screen.queryByText('MILESTONE')).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
    // HARNESS LIMIT, documented: after this root's bill-form modal cycle
    // the realm stops committing the toast queue's advance, so dismissal
    // and the post-save progress label are not assertable here — dismissal
    // mechanics are proven in the part-1/haptics suites and the progress
    // math exhaustively in the pure composition suite.
  }, 60000);


});
