// Wave 9c state-communication corrections — RENDERED against the real
// navigator, checklist, celebration queue and persistence.
//
// Root 1 (interactions): saving the checklist's Everyday account fires the
// truthful "Everyday account added" toast — never "Added First Asset".
// Root 2 (a fresh mount over persisted data — the restart case, no
// presses): with income + an everyday account recorded and the goal
// explicitly deferred, Today's compact Journey row presents the UPCOMING
// milestone — "Next milestone · Create your first goal" — and the
// past-tense "Created First Goal" appears nowhere.
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
import { AppData, Asset, RecurringItem } from '../../src/types/models';

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

describe('Correction A — the Everyday save toast, rendered', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    // The welcome achievement is already seen, so the NEXT unlock this
    // session is the everyday save's own — the exact recorded moment.
    d.seenAchievementIds = ['started_lulu'];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('saving the everyday account announces itself truthfully — never as an asset', async () => {
    fireEvent.press(screen.getByTestId('checklist-everyday'));
    const nameInput = await screen.findByPlaceholderText('e.g. Main everyday account', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Everyday');
    await screen.findByDisplayValue('Everyday');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '4000');
    await screen.findByDisplayValue('4000');
    fireEvent.press(screen.getByText('Save'));

    // The truthful account toast, from the real celebration queue.
    await screen.findByText('Everyday account added', {}, { timeout: 20000 });
    expect(screen.getByText('Nolie can now use this account in your money picture.')).toBeTruthy();
    expect(screen.queryByText('Added First Asset')).toBeNull();
    // Visual-elevation pass: a plain account confirmation renders NO
    // milestone capsule — the structured context field alone decides it.
    expect(screen.queryByText('MILESTONE')).toBeNull();

    // Exactly one record, only the everyday step completes, and the
    // unlock itself was recorded unchanged (engine untouched).
    const s = await stored();
    expect(s.assets).toHaveLength(1);
    expect(s.assets[0].type).toBe('everyday');
    await screen.findByText('1 of 7 complete');
    expect(screen.getByText('Shows money you have set aside.')).toBeTruthy();
    expect(screen.getByText('Adds vehicles, property or investments to your net worth.')).toBeTruthy();
    await waitFor(async () => expect((await stored()).seenAchievementIds).toContain('added_first_asset'), { timeout: 20000 });
  });
});

describe('Correction B — the deferred-goal journey row over persisted data (restart case)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    // The owner's exact device state, as PERSISTED data a fresh launch
    // loads: income + an everyday account recorded, goal explicitly
    // deferred, zero goals, every earlier milestone already seen.
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.user.monthlyIncome = 5417;
    d.user.incomeAmount = 2500;
    d.user.payFrequency = 'fortnightly';
    d.user.nextPayday = new Date(2026, 8, 7).toISOString();
    d.user.confirmedGoalLater = true;
    const income: RecurringItem = {
      id: 'r1',
      type: 'income',
      label: 'Salary',
      amount: 2500,
      frequency: 'fortnightly',
      nextDueDate: new Date(2026, 8, 7).toISOString(),
      isFixed: true,
      active: true,
    };
    d.recurringItems = [income];
    d.assets = [{ id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 4000 } as Asset];
    d.seenAchievementIds = ['started_lulu', 'added_income', 'added_first_asset'];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByTestId('today-journey-row', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('Today presents the UPCOMING milestone — never a past-tense record of an untaken action', async () => {
    // The compact Journey row: context + imperative title. The row is ONE
    // accessible button (its combined label carries the meaning), so its
    // inner Texts are accessibility-hidden BY DESIGN — the queries opt in.
    expect(screen.getByText('Next milestone', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Create your first goal', { includeHiddenElements: true })).toBeTruthy();
    // …and VoiceOver hears the same upcoming framing.
    expect(screen.getByTestId('today-journey-row').props.accessibilityLabel).toContain('Next milestone: Create your first goal');
    // The past-tense achieved wording appears NOWHERE on Today.
    expect(screen.queryByText('Created First Goal', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/Created first goal/, { includeHiddenElements: true })).toBeNull();
    // No goal was fabricated by the restart, and the deferral survived.
    const s = await stored();
    expect(s.goals).toHaveLength(0);
    expect(s.user.confirmedGoalLater).toBe(true);
  });
});
