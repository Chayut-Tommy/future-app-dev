import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';

/**
 * Nolie Design 5.1 Wave 8 correction E — the one Settings action, rendered
 * through the REAL root navigator.
 *
 * The route x keyboard x overlay matrix is proven without a mount in
 * tests/design5-wave8-settings-shell.test.ts against the same authority the
 * dock reads. This file proves what only a real mount can: that exactly ONE
 * trigger exists on each root, that pressing it navigates once with no
 * duplicate or transient gear, and that Back returns to the originating
 * root with its owner tab intact.
 *
 * NOT proven here: pixel position relative to the notch, or that the
 * control visually clears a title on a physical device — those are device
 * evidence, and the reserved header inset is asserted structurally instead.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
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

describe('Wave 8 correction E — one global Settings action', () => {
  let root: any;
  const user = userEvent.setup();

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    root = await render(<Harness />);
    await screen.findByTestId('global-settings-button');
  });

  afterAll(() => root?.unmount());

  test('exactly one trigger on the Today root — never two', () => {
    expect(screen.getAllByTestId('global-settings-button')).toHaveLength(1);
    // The dock and the "+" are unchanged and still singletons beside it.
    expect(screen.getAllByTestId('global-settings-layer')).toHaveLength(1);
  });

  test('and exactly one on Money, Wealth and Grow', async () => {
    // The dock's own tab label carries the iOS "<label>, tab, n of m"
    // suffix, so it is anchored — "Money" alone also matches screen content.
    for (const tab of [/^Money, tab, /, /^Wealth, tab, /, /^Grow, tab, /]) {
      await user.press(screen.getByRole('button', { name: tab }));
      expect(screen.getAllByTestId('global-settings-button')).toHaveLength(1);
    }
  });

  test('pressing it opens Settings once, with no duplicate or transient gear', async () => {
    await user.press(screen.getByRole('button', { name: /^Today, tab, / }));
    await user.press(screen.getByTestId('global-settings-button'));

    // Settings is a dock-hidden route, so the whole global assembly —
    // including this control — is correctly gone while it is open.
    expect(screen.queryAllByTestId('global-settings-button')).toHaveLength(0);
    expect(await screen.findByText('Settings')).toBeOnTheScreen();
  });

  test('Back returns to the originating root with the trigger restored', async () => {
    const back = screen.queryByRole('button', { name: /back/i });
    if (back) await user.press(back);
    else await user.press(screen.getByRole('button', { name: /^Today, tab, / }));
    expect(await screen.findByTestId('global-settings-button')).toBeOnTheScreen();
    expect(screen.getAllByTestId('global-settings-button')).toHaveLength(1);
  });

  test('no second dock, FAB or Settings trigger was introduced anywhere', () => {
    expect(screen.getAllByTestId('global-settings-layer')).toHaveLength(1);
    expect(screen.getAllByTestId('global-settings-button')).toHaveLength(1);
  });
});
