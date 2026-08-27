// Wave 10 closure — the defect that motivated ACTION-scoped ownership,
// proven live: a second successful Save completing WHILE the first Save's
// toast queue is still presenting must earn its own haptic (queue state is
// not Save identity), and a rapid double-tap of one Save stays one action.
// Fresh realm; real actions, real persistence, real queue; the central
// dispatcher is mocked to count. Save A is the press-only no-debt
// confirmation and Save B the savings form journey — this ordering keeps
// the root's ONE workspace modal cycle for Save B, inside the documented
// post-modal-cycle commit-wedge budget (a second form journey in the same
// root stops committing TextInput values — reproduced on this file's
// earlier shape).
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
import { AppData } from '../../src/types/models';
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

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

function counts() {
  return { light: light.mock.calls.length, soft: soft.mock.calls.length, warning: warning.mock.calls.length, rigid: rigid.mock.calls.length };
}

describe('Two Saves sharing one visible queue — each action keeps its own haptic', () => {
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

  test('Save A (press-only no-debt confirmation) earns its one haptic and starts the queue', async () => {
    fireEvent.press(screen.getByTestId('checklist-debt'));
    const noDebt = await screen.findByLabelText("I don't have any debt", {}, { timeout: 20000 });
    fireEvent.press(noDebt);
    await waitFor(async () => expect((await stored()).user.confirmedNoDebt).toBe(true), { timeout: 20000 });
    await screen.findByText(/staying debt free/, {}, { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });
  }, 60000);

  test('Save B (a double-tapped form Save) completes while Save A\'s toast is STILL VISIBLE: one action, softSuccess increments to 2', async () => {
    // Save A's toast is presenting; Save B's whole journey runs before the
    // queue drains.
    expect(screen.getByText(/staying debt free/)).toBeTruthy();
    // The no-debt resolution compacted the checklist; open the full list
    // (a plain in-place disclosure) to reach the savings task.
    fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-cash', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('checklist-cash'));
    const nameInput = await screen.findByPlaceholderText('e.g. Emergency fund', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Rainy day');
    await screen.findByDisplayValue('Rainy day');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '500');
    await screen.findByDisplayValue('500');
    // Two Save presses in one synchronous burst — the form's submittingRef
    // latch keeps this ONE action: one persisted record, one haptic.
    const save = screen.getByText('Save');
    fireEvent.press(save);
    fireEvent.press(save);
    await waitFor(async () => expect((await stored()).assets).toHaveLength(1), { timeout: 20000 });

    // The action's haptic fired even though the shared queue was mid-run —
    // queue state is not Save identity.
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 0, rigid: 0 });
    // Save A's toast is still the one presenting; Save B's milestones wait
    // their turn behind it (sequential, never stacked).
    expect(screen.getByText(/staying debt free/)).toBeTruthy();
    expect(screen.queryByText('Added First Asset')).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
  }, 60000);

  test('advancing the shared queue hands Save A\'s slot to Save B\'s first milestone — with no further haptic', async () => {
    // Dismissing Save A's toast advances the shared queue to Save B's
    // first milestone (which claimed Save B's factual toast — no duplicate
    // plain confirmation), and the advancement itself fires nothing.
    // HARNESS LIMIT, documented: this root stops committing one step after
    // its workspace modal cycle (the post-modal-cycle wedge), so only this
    // first advancement is drivable here — the identical full sequential
    // drain (milestone -> milestone -> empty, and milestone -> factual ->
    // empty) is proven in the part-1 and actions haptics suites.
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await screen.findByText('Added First Asset', {}, { timeout: 20000 });
    expect(screen.queryByText(/staying debt free/)).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
    // Advancement and presentation added nothing.
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 0, rigid: 0 });
  }, 60000);
});
