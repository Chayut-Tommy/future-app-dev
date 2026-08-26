// Wave 10 closure — action-scoped haptic ownership, part 2: the routine
// save's factual confirmation, a second separate action, destructive
// confirm warning/rigid, and excluded interactions. ITS OWN
// FILE (fresh root over a seeded mid-journey state): the documented
// post-modal-cycle commit wedge stops RNTL committing updates after the
// part-1 root's modal cycles, so these journeys run in a fresh realm —
// the same split design5-savings-allocation-save.render.test.tsx uses.
// The central dispatcher is mocked to count REAL invocations; everything
// downstream (forms, persistence, unlock effect, queue) is real.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData, Asset } from '../../src/types/models';
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

describe('Separate actions, deletions and excluded interactions', () => {
  let view: any;
  let alertSpy: jest.SpyInstance;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    alertSpy = jest.spyOn(Alert, 'alert');
    // Mid-journey state: a savings asset exists and its unlocks are seen —
    // the exact state part 1's root persisted.
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu', 'added_first_asset', 'added_savings'];
    d.assets = [{ id: 'sv1', type: 'savings', label: 'Rainy day', currentValue: 500 } as Asset];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('a routine confirmed Save (no achievement) gets ONE softSuccess and ONE calm factual confirmation', async () => {
    // Closure correction — doc C: softSuccess = engine-confirmed save,
    // with calm factual feedback. The Add workspace's shared success
    // authority now fires the action's haptic and queues the factual
    // toast (no unlock claims it here: first-asset/savings are seen).
    fireEvent.press(screen.getByTestId('checklist-everyday'));
    const nameInput = await screen.findByPlaceholderText('e.g. Main everyday account', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Everyday');
    await screen.findByDisplayValue('Everyday');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '4000');
    await screen.findByDisplayValue('4000');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(async () => expect((await stored()).assets).toHaveLength(2), { timeout: 20000 });

    // The factual confirmation: canonical display name, no MILESTONE
    // capsule, no Undo — and exactly one haptic, at the Save.
    await screen.findByText('Everyday Account added', {}, { timeout: 20000 });
    expect(screen.getByText('Saved to your money picture.')).toBeTruthy();
    expect(screen.queryByText('MILESTONE')).toBeNull();
    expect(screen.queryByText(/undo/i)).toBeNull();
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });

    // Dismissal is presentation only — no further haptic.
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 1, warning: 0, rigid: 0 });
  }, 60000);

  test('a genuinely separate Save earns exactly one haptic of its own; navigating mid-toast adds nothing', async () => {
    fireEvent.press(screen.getByTestId('checklist-income'));
    const nameInput = await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Salary');
    await screen.findByDisplayValue('Salary');
    fireEvent.changeText(screen.getByPlaceholderText('$6,000'), '2500');
    await screen.findByDisplayValue('2500');
    // Typing and date selection produced no warning and no light haptic.
    expect(warning).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('income-next-due-date'));
    await screen.findByTestId('income-next-due-date-choice-plus-1');
    fireEvent.press(screen.getByTestId('income-next-due-date-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('income-next-due-date-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    fireEvent.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(() => expect(screen.queryByTestId('income-next-due-date-done')).toBeNull(), { timeout: 20000 });
    fireEvent.press(screen.getByText('Save'));

    // A separate action, a separate single haptic — and the milestone the
    // save unlocked CLAIMS the factual toast, so only 'Added Income'
    // presents (no duplicate plain confirmation behind it).
    await screen.findByText('Added Income', {}, { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 0, rigid: 0 });

    // Ordinary navigation while the toast is visible: no echo, no repeat.
    fireEvent.press(screen.getByLabelText(/^Wealth, tab,/));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    expect(screen.queryByText('Income source added')).toBeNull();
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 0, rigid: 0 });
  }, 60000);

  test('a destructive confirmation SHOWN or CANCELLED fires no rigid; the CONFIRMED deletion fires exactly one', async () => {
    // The Everyday account's removal is the canonical confirmed deletion
    // in the wealth editor. Open its edit form from the real Wealth list.
    fireEvent.press(screen.getByText('Everyday'));
    await screen.findByText('Delete asset', {}, { timeout: 20000 });
    const alertsBefore = alertSpy.mock.calls.length;
    fireEvent.press(screen.getByText('Delete asset'));
    await waitFor(() => expect(alertSpy.mock.calls.length).toBe(alertsBefore + 1));
    // The confirm is SHOWING: exactly one warning, and no rigid yet.
    expect(warning).toHaveBeenCalledTimes(1);
    expect(rigid).not.toHaveBeenCalled();
    // Cancel it (the cancel button carries no handler — dismissal alone).
    const cancelled = alertSpy.mock.calls.at(-1)![2].find((b: any) => b.text === 'Cancel');
    await act(async () => {
      cancelled.onPress?.();
    });
    // Cancelling adds nothing — no rigid, no second warning.
    expect(rigid).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
    expect((await stored()).assets).toHaveLength(2);

    // Re-presenting the confirm warns once more; confirming fires exactly
    // one rigid at the post-confirmation boundary.
    fireEvent.press(screen.getByText('Delete asset'));
    await waitFor(() => expect(alertSpy.mock.calls.length).toBe(alertsBefore + 2));
    expect(warning).toHaveBeenCalledTimes(2);
    const remove = alertSpy.mock.calls.at(-1)![2].find((b: any) => b.text === 'Remove');
    await act(async () => {
      remove.onPress();
    });
    await waitFor(async () => expect((await stored()).assets).toHaveLength(1), { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 2, rigid: 1 });
  }, 60000);

  test('a STANDALONE edit save is outside the canonical Add boundary: its milestone presents silently — pinned honestly', async () => {
    // Editing the savings balance 500 -> 1500 from the Wealth list is a
    // standalone edit journey that does not (yet) route through the Add
    // workspace's shared save-success authority, so the action fires no
    // haptic and its saved_1000 celebration presents silently. Pinned
    // as-is: extending the action boundary to standalone edit journeys is
    // an owner decision (Wave 11 candidate), not a silent expansion.
    fireEvent.press(screen.getByText('Rainy day'));
    const balance = await screen.findByDisplayValue('500', {}, { timeout: 20000 });
    fireEvent.changeText(balance, '1500');
    await screen.findByDisplayValue('1500');
    fireEvent.press(screen.getByText('Save'));
    await screen.findByText('Saved First $1,000', {}, { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 2, rigid: 1 });
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 2, rigid: 1 });
  }, 60000);

  test('excluded interactions — tab taps and plain navigation — dispatch nothing', async () => {
    fireEvent.press(screen.getByLabelText(/^Today, tab,/));
    await screen.findByLabelText(/^Wealth, tab,/, {}, { timeout: 20000 });
    fireEvent.press(screen.getByLabelText(/^Wealth, tab,/));
    fireEvent.press(screen.getByLabelText(/^Today, tab,/));
    expect(counts()).toEqual({ light: 0, soft: 2, warning: 2, rigid: 1 });
  }, 60000);
});
