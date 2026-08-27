// Checklist consistency correction — the two NEW footers, rendered
// against the real Today root, persistence and celebration queue: the
// Savings acknowledgement (a bare setup-flag write with no feedback of its
// own) and the checklist-level Debt-free footer (the SAME shared authority
// the Debt Coach sheet uses — one write, one feedback event, one
// celebration). Ends with the supersede arc: really recording Savings
// through the canonical journey clears the stale acknowledgement at the
// persist pipeline, so a later deletion can never resurrect it (the
// pure composition suite carries the deletion-side matrix).
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

describe('Savings and Debt-free acknowledgements through the real authorities', () => {
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

  test('the Savings acknowledgement writes ONLY its setup flag: Noted chip, reviewed progress, no toast, footer removed, row reopenable', async () => {
    fireEvent.press(screen.getByTestId('checklist-cash-defer'));
    await waitFor(async () => expect((await stored()).user.confirmedNoSavings).toBe(true), { timeout: 20000 });

    // Nothing but the flag was written, and no feedback surface fired.
    const s = await stored();
    expect(s.assets).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
    expect(screen.queryByTestId('celebration-toast')).toBeNull();

    // Honest presentation: Noted, reviewed, footer gone, row reopenable.
    await screen.findByText('1 of 7 reviewed', {}, { timeout: 20000 });
    // The resolution compacted the card; the row sits behind View all.
    fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-cash', {}, { timeout: 20000 });
    expect(screen.getByText('Noted', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('checklist-cash-defer')).toBeNull();
    expect(screen.getByTestId('checklist-cash').props.accessibilityState?.disabled).toBe(false);
  }, 60000);

  test('the checklist Debt-free footer uses the SHARED authority: one write, one celebration, Debt-free chip, Continue advances past debt', async () => {
    fireEvent.press(screen.getByTestId('checklist-debt-defer'));
    await waitFor(async () => expect((await stored()).user.confirmedNoDebt).toBe(true), { timeout: 20000 });

    // The one accepted debt-free celebration presents exactly once.
    await screen.findByText(/staying debt free/, {}, { timeout: 20000 });
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });

    await screen.findByText('2 of 7 reviewed', {}, { timeout: 20000 });
    expect(screen.getByText('Debt-free', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('checklist-debt-defer')).toBeNull();
    // The debt row still opens the canonical journey; Continue targets the
    // next unresolved task (income), never the acknowledged debt step.
    expect(screen.getByTestId('checklist-debt').props.accessibilityState?.disabled).toBe(false);
    expect(screen.getByText('Next: Add your income')).toBeTruthy();
  }, 60000);

  test('REAL Savings data supersedes the acknowledgement at the persist pipeline: flag cleared, chip Added, complete wording restored', async () => {
    // Reopen the acknowledged Savings task through its (reopenable) row —
    // the canonical form, with the type-derived Savings placeholder.
    fireEvent.press(screen.getByTestId('checklist-cash'));
    const nameInput = await screen.findByPlaceholderText('e.g. Emergency fund', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Rainy day');
    await screen.findByDisplayValue('Rainy day');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '500');
    await screen.findByDisplayValue('500');
    fireEvent.press(screen.getByText('Save'));

    // Real data wins — the SAME persist that wrote the asset cleared the
    // stale acknowledgement, so deleting this asset later returns the task
    // to unresolved (the pure suite carries that deletion matrix).
    await waitFor(
      async () => {
        const s = await stored();
        expect(s.assets.filter((a) => a.type === 'savings')).toHaveLength(1);
        expect(s.user.confirmedNoSavings).toBe(false);
      },
      { timeout: 20000 }
    );
    // Its milestones present (claiming the factual toast); drain them.
    await screen.findByText('Added First Asset', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await screen.findByText('Added Savings', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    expect(screen.getByText('Added', { includeHiddenElements: true })).toBeTruthy();
  }, 60000);
});
