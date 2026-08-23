// RNTL unmounts every root after each test by default. This suite mounts
// ONE root in beforeAll and asserts across many tests, which auto-cleanup
// would tear down after the first.
//
// DELIBERATELY ITS OWN FILE: the standalone Wave 9a calculator mounts (see
// design5-wave9a-calculators.render.test.tsx) register their own navigator
// state in module-level shell singletons, which poisons a RootNavigator
// mounted afterwards in the same jest module realm — verified empirically:
// this describe passes alone and fails after those roots. A fresh module
// registry per file keeps the evidence honest.
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
 * Nolie Design 5.1 Wave 9a — the calculators sit OUTSIDE the global shell,
 * and Back restores Grow with the full shell, rendered against the real
 * RootNavigator. The classification itself (all four calculator routes
 * dock-hidden, Cards dock-visible) is proven pure in
 * tests/design5-wave9a-cards-calculators.test.ts §8 and the Wave 6 dock
 * matrix; this file proves the mounted assembly actually obeys it.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

describe('Wave 9a — calculators sit outside the shell; Back restores Grow', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    root = await render(
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
    const user = userEvent.setup();
    // The dock only becomes queryable once the boot state settles and the
    // assembly reveals — allow it real time rather than the 1s default.
    await user.press(await screen.findByRole('button', { name: /Grow/i }, { timeout: 15000 }));
    await screen.findByTestId('grow-tools', {}, { timeout: 15000 });
  }, 60000);

  afterAll(() => root?.unmount());

  test('opening Compound growth hides dock, "+" and Settings gear', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('grow-tool-compound'));
    await screen.findByText('Compound growth');
    // The dock stays MOUNTED (Wave 8's one-commit reveal) but is gated out
    // of the accessibility tree — so default queries must not reach it,
    // while an includeHiddenElements query proves the gate, not an unmount.
    expect(screen.queryByTestId('floating-nav-bar')).toBeNull();
    expect(screen.getByTestId('floating-nav-bar', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByLabelText('Open quick actions')).toBeNull();
    expect(screen.queryAllByTestId('global-settings-button')).toHaveLength(0);
  });

  test('Back restores Grow immediately with the full shell', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByLabelText('Back'));
    await screen.findByTestId('grow-tools');
    expect(screen.getByTestId('floating-nav-bar').props.accessibilityElementsHidden).toBe(false);
    expect(screen.getByLabelText('Open quick actions')).toBeOnTheScreen();
    expect(await screen.findByTestId('global-settings-button')).toBeOnTheScreen();
  });

  test('the same holds for Home loan repayments', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('grow-tool-homeloan'));
    await screen.findByText('Home loan repayments');
    expect(screen.queryByTestId('floating-nav-bar')).toBeNull();
    expect(screen.queryByLabelText('Open quick actions')).toBeNull();
    await user.press(screen.getByLabelText('Back'));
    await screen.findByTestId('grow-tools');
    expect(screen.getByTestId('floating-nav-bar').props.accessibilityElementsHidden).toBe(false);
  });
});
