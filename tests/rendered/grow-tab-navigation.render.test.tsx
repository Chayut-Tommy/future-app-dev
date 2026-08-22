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
 * Wave 6 correction A — this harness now mounts the REAL RootNavigator.
 *
 * It previously mounted MainTabNavigator alone, which was sufficient while
 * the dock was that navigator's own tabBar. The dock is now a root-level
 * sibling of the detached "+" (a tabBar-mounted dock structurally could not
 * exist on MoneyDetail, GrowDetail, Transactions, Goals, Cards or
 * EmergencyFund, which are all root-stack routes), so the tab controls this
 * file presses live at root. Mounting half the production tree can no
 * longer drive navigation.
 *
 * Nothing this file asserts about tab CONTENT or state retention changed —
 * only the amount of the real tree it has to mount to exercise it.
 */

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
                <RootNavigator />
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
  // RootNavigator gates the main experience behind this flag.
  data.user.hasSeenIntro = true;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* RECONCILED — Design 5.1 Wave 8. OLD CLAUSE looked for the header
 * "Your Journey". SUPERSEDED BECAUSE the owner-locked hierarchy gives every
 * section one consistent sentence-case title, so it now reads "Your
 * journey". PRESERVED INTENT verbatim: this suite proves DiscoverScreen's
 * canonical content renders on every navigation path — the header it looks
 * for is still the Journey section's own, and still found by ROLE. */

/** Asserts DiscoverScreen's own canonical, always-rendered content is
 * present — the screen's own title (Screen component) and the "Your
 * Journey" section header (present regardless of achievement state, per
 * DiscoverScreen's own doc comment: "an empty achievements list still
 * renders the Journey header"). */
async function expectCanonicalGrowContent() {
  // 'Grow' itself is ambiguous (it also matches the bottom-tab label), so
  // assert the Screen title renders via getAllByText, then assert Grow's
  // own "Your Journey" section header — always rendered, per
  // DiscoverScreen's own doc comment.
  //
  // Wave 5 correction: this previously asserted the plain TEXT "Your
  // Journey", which TODAY's own section header also rendered — so on any
  // path where Grow was never actually reached, this helper matched
  // Today's header and reported success. Asserting the HEADER ROLE pins it
  // to Grow's section heading specifically; Today's Journey is now a named
  // row, not a header, so the two can no longer be confused.
  expect((await screen.findAllByText('Grow')).length).toBeGreaterThan(0);
  expect(await screen.findByRole('header', { name: 'Your journey' })).toBeOnTheScreen();
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

    // Today's Score footnote PUSHES GrowDetail — a root-stack route this
    // tab-only harness deliberately does not register (the pushed
    // destinations have their own full-RootNavigator coverage in
    // pass-2e-pushed-destinations.render.test.tsx). So the press is made
    // here only to exercise the focus-request side effect it leaves behind;
    // the navigation itself does not and should not resolve in this tree.
    // The regression this test actually guards is the SECOND half: a later
    // plain tab tap must still render canonical Grow content.
    await user.press(await screen.findByRole('button', { name: /^Nolie Score/ }));

    // Now return via a DIRECT tab press (no params this time) —
    // the exact confirmed repro shape (Score request first, then a later
    // plain tab tap).
    await user.press(await screen.findByRole('button', { name: /^Wealth,/ }));
    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await expectCanonicalGrowContent();
  });

  test('direct Grow navigation after a prior Journey focus request still renders canonical content', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    // As above: this pushes GrowDetail, which this tab-only harness does
    // not register. The press exercises the focus-request side effect; the
    // guarded regression is the direct tab tap that follows.
    await user.press(await screen.findByRole('button', { name: /^Your Journey\.|not available yet/ }));

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
