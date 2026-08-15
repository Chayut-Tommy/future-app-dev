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
import { MainTabNavigator } from '../../src/navigation/MainTabNavigator';
import { createEmptyAppData } from '../../src/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Pass 2E correction — genuine rendered navigation regression coverage for
 * the confirmed Grow direct-tab blank-screen defect, mounted with the REAL
 * MainTabNavigator (real Today/Money/Wealth/Grow screens, real
 * AppStateProvider, real bottom-tab bar buttons pressed via their own
 * accessible roles) inside a real NavigationContainer — never a mock
 * navigator or a source-regex proxy.
 *
 * What this file CAN prove: DiscoverScreen's own JS render output is
 * genuinely populated with canonical content immediately after every one of
 * the required navigation paths settles — ruling out a JS-level cause (a
 * stuck loading gate, a stale focus-request effect, a conditional render
 * bug) independent of the confirmed native cause.
 *
 * What this file CANNOT prove (see the accompanying physical-device
 * checklist in the final report): the actual native fade/opacity/
 * activityState handoff in react-native-screens — Jest has no native
 * rendering surface, and the animation itself is driven with
 * useNativeDriver, which is invisible to a JS-only render tree. This is why
 * MainTabNavigator no longer sets `animation` at all (restoring the
 * pre-Pass-2E instant-cut default) — these tests guard the JS layer; the
 * device checklist guards the native layer these tests structurally cannot
 * reach.
 */
function Harness() {
  // Provider order matches App.tsx exactly: SafeAreaProvider >
  // AppStateProvider > ThemeProvider > CelebrationProvider >
  // SavingsAllocationPromptProvider > NavigationContainer.
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer>
                <MainTabNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

async function seedEmptyData() {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Asserts DiscoverScreen's own canonical, always-rendered content is
 * present — the screen's own title (Screen component) and the "Your
 * Journey" section header (present regardless of achievement state, per
 * DiscoverScreen's own doc comment: "an empty achievements list still
 * renders the Journey header"). */
async function expectCanonicalGrowContent() {
  // 'Grow' itself is ambiguous (it also matches the bottom-tab label), so
  // assert the Screen title renders via getAllByText, then assert the
  // "Your Journey" section header — always rendered, per DiscoverScreen's
  // own doc comment, and unique on screen.
  expect((await screen.findAllByText('Grow')).length).toBeGreaterThan(0);
  expect(await screen.findByText('Your Journey')).toBeOnTheScreen();
}

describe('Grow tab navigation — rendered regression coverage (Pass 2E correction)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedEmptyData();
  });

  test('direct bottom-tab navigation to Grow with no section parameters renders canonical content', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });

  test('direct Grow navigation after a prior Score focus request still renders canonical content', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    // Today's own Score chip navigates to Grow WITH scrollTo/scrollToRequestId params.
    await user.press(await screen.findByRole('button', { name: /^Nolie Score/ }));
    await expectCanonicalGrowContent();

    // Leave Grow, then return via a DIRECT tab press (no params this time) —
    // the exact confirmed repro shape (Score request first, then a later
    // plain tab tap).
    await user.press(await screen.findByRole('button', { name: /^Wealth,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });

  test('direct Grow navigation after a prior Journey focus request still renders canonical content', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /milestones completed|not available yet/ }));
    await expectCanonicalGrowContent();

    await user.press(await screen.findByRole('button', { name: /^Wealth,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });

  test('leaving and revisiting Grow (Today -> Grow -> Today -> Grow) keeps canonical content present', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();

    await user.press(await screen.findByRole('button', { name: /^Today,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });

  test('canonical Grow content remains present after direct Money -> Grow and Wealth -> Grow tab taps', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Money,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();

    await user.press(await screen.findByRole('button', { name: /^Wealth,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });
});
