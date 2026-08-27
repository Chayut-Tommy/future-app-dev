// Wave 11 — iOS focus contracts, rendered through the REAL Today root and
// the consolidated focus authority. The native mechanism
// (AccessibilityInfo.sendAccessibilityEvent(host, 'focus')) is spied so
// every genuine dispatch is counted; everything upstream — the checklist
// card, the canonical income form, the shared focused-picker host and
// trigger — is real. Proves the picker heading-in/trigger-back contract
// (whose return half was dead code before this wave), the checklist origin
// restoration, and that no focus or announcement fires after unmount.
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

describe('Focus contracts through the one consolidated authority', () => {
  let view: any;
  let focusSpy: jest.SpyInstance;
  let announceSpy: jest.SpyInstance;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    focusSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu'];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('cancelling a clean task restores focus to the initiating checklist control', async () => {
    fireEvent.press(screen.getByTestId('checklist-income'));
    await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });
    const before = focusSpy.mock.calls.length;
    // The form is untouched, so Cancel closes without a discard confirm.
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByPlaceholderText('e.g. Salary')).toBeNull(), { timeout: 20000 });
    await waitFor(() => expect(focusSpy.mock.calls.length).toBeGreaterThan(before), { timeout: 20000 });
    expect(focusSpy.mock.calls.at(-1)![1]).toBe('focus');
  }, 60000);

  test('opening the focused payday picker moves focus to its heading, announces once, and Done returns focus to the TRIGGER', async () => {
    // Reopen the same canonical task (the row stays the origin).
    fireEvent.press(screen.getByTestId('checklist-income'));
    await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });

    const beforeOpen = focusSpy.mock.calls.length;
    const announceBefore = announceSpy.mock.calls.length;
    fireEvent.press(screen.getByTestId('income-next-due-date'));
    await screen.findByTestId('income-next-due-date-choice-plus-1', {}, { timeout: 20000 });
    // Heading focus dispatched through the one authority, with a node.
    await waitFor(() => expect(focusSpy.mock.calls.length).toBeGreaterThan(beforeOpen), { timeout: 20000 });
    expect(focusSpy.mock.calls.at(-1)![0]).toBeTruthy();
    expect(focusSpy.mock.calls.at(-1)![1]).toBe('focus');
    // Announced exactly once per opening.
    const opened = announceSpy.mock.calls.slice(announceBefore).map((c) => c[0]);
    expect(opened.filter((m) => /opened/i.test(String(m)))).toHaveLength(1);

    fireEvent.press(screen.getByTestId('income-next-due-date-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('income-next-due-date-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    const beforeDone = focusSpy.mock.calls.length;
    fireEvent.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(() => expect(screen.queryByTestId('income-next-due-date-done')).toBeNull(), { timeout: 20000 });
    // The RETURN half of the contract — dead before Wave 11 — now fires,
    // with a real node, through the same single authority.
    await waitFor(() => expect(focusSpy.mock.calls.length).toBeGreaterThan(beforeDone), { timeout: 20000 });
    expect(focusSpy.mock.calls.at(-1)![0]).toBeTruthy();
    expect(focusSpy.mock.calls.at(-1)![1]).toBe('focus');
  }, 60000);

  test('unmounting dispatches NO late focus and NO late announcement', async () => {
    const focusAt = focusSpy.mock.calls.length;
    const announceAt = announceSpy.mock.calls.length;
    view.unmount();
    view = null;
    await new Promise((r) => setTimeout(r, 250));
    expect(focusSpy.mock.calls.length).toBe(focusAt);
    expect(announceSpy.mock.calls.length).toBe(announceAt);
  }, 60000);
});
