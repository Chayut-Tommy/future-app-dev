/* RECONCILED — Design 5.1 Wave 8: Grow's section titles are now
 * consistently sentence case, so the Journey header reads "Your journey".
 * Every clause below is otherwise unchanged — the property each one
 * protects (local state retention, pushed-destination context, dock
 * continuity) is untouched by a title's casing. */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, act } from '@testing-library/react-native';
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
 * Motion reconciliation task — MainTabNavigator render-callback state
 * retention, split into its own file (separate Jest module/worker state)
 * from briefing-motion-reconciliation.render.test.tsx after cross-test
 * pollution was observed when these tests ran in the same file as the
 * section-focus-scroll tests (a React Test Renderer `act()` overlap
 * surfaced only when many renders/mocks preceded these two specific tests
 * in sequence — reproducible only in that ordering, not in isolation, and
 * not present in this file's own smaller, self-contained suite). This
 * keeps the coverage identical while removing the flake; it does not
 * change what's being proven.
 *
 * Proves MainTabNavigator's render-callback threading of `reduceMotion`
 * into Money/Grow (`<Tab.Screen>{() => <MoneyScreen reduceMotion={...} />}
 * </Tab.Screen>`) does not cause those screens to lose local state or
 * remount when MainTabNavigator itself re-renders (e.g. from a live
 * Reduce Motion preference change) — source inspection (this round's
 * investigation, cross-checked against React Navigation's own
 * StaticContainer/SceneView implementation in node_modules) found this is
 * React Navigation's own documented, sanctioned alternative to the real
 * anti-pattern (`component={() => ...}`), never a source of remounting;
 * this test proves that empirically too, not just by source reading.
 */
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

async function seedData() {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  // RootNavigator gates the main experience behind this flag.
  data.user.hasSeenIntro = true;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function mockReduceMotion(enabled: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
  let changeHandler: ((enabled: boolean) => void) | null = null;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (enabled: boolean) => void) => {
    changeHandler = handler;
    return { remove: jest.fn() } as any;
  }) as any);
  return { getChangeHandler: () => changeHandler };
}

describe('Motion reconciliation — MainTabNavigator render-callback state retention', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Money retains local UI state (period toggle selection) across a MainTabNavigator rerender triggered by a live Reduce Motion change', async () => {
    const { getChangeHandler } = mockReduceMotion(false);
    await AsyncStorage.clear();
    await seedData();

    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Money,/ }));
    await screen.findByText('Typical money flow');
    await user.press(screen.getByText('Weekly'));
    // Wave 6 final pass — the flow rows no longer repeat the period in
    // every label ("Typical weekly income" -> "Income"), because the
    // selector already states it once. The selected period is now read
    // from the control's own announced state, which is a stronger signal
    // than a row label and is what a screen reader actually hears.
    await screen.findByRole('radio', { name: 'Weekly view' });

    // Flip the live OS Reduce Motion preference — this changes
    // MainTabNavigator's own `reduceMotion` state, forcing it to re-render
    // and recreate the inline `() => <MoneyScreen reduceMotion={...} />`
    // render-callback passed to `<Tab.Screen>`. If that pattern caused
    // MoneyScreen to remount, its local `flowPeriod` state would reset to
    // the 'monthly' default.
    const changeHandler = getChangeHandler();
    expect(changeHandler).not.toBeNull();
    await act(async () => {
      changeHandler!(true);
    });

    // Local state survived — Weekly is still the selected period, and
    // Monthly is not, so the toggle genuinely did not reset.
    const weekly = await screen.findByRole('radio', { name: 'Weekly view' });
    expect(weekly.props.accessibilityState?.selected).toBe(true);
    expect(screen.getByRole('radio', { name: 'Monthly view' }).props.accessibilityState?.selected).toBe(false);
  });

  test('Grow retains local UI state (Journey expanded) across a MainTabNavigator rerender triggered by a live Reduce Motion change', async () => {
    // Pass 2E final correction — Today's Journey snapshot now pushes the
    // root stack's GrowDetail route (unreachable from this MainTabNavigator-
    // only harness, which intentionally mounts no RootStack — see this
    // file's own doc comment: it isolates MainTabNavigator's render-callback
    // behaviour specifically). Reaching Grow's local `journeyExpanded` state
    // therefore goes through the ordinary, unrelated direct-tab-tap path
    // (still exercising the exact render-callback pattern under test) and
    // JourneyTimeline's own "View full journey" expand toggle, rather than
    // a focus-request fulfilment — journeySubview already defaults to
    // 'milestones', so that alone would prove nothing about remounting.
    const { getChangeHandler } = mockReduceMotion(false);
    await AsyncStorage.clear();
    await seedData();

    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));
    await screen.findByText('Your journey');
    await user.press(await screen.findByRole('button', { name: 'View full journey' }));
    await screen.findByRole('button', { name: 'Show less' });

    const changeHandler = getChangeHandler();
    expect(changeHandler).not.toBeNull();
    await act(async () => {
      changeHandler!(true);
    });

    // Still expanded ("Show less" is the expanded-state label) — DiscoverScreen
    // did not remount and reset back to its default collapsed state.
    expect(await screen.findByRole('button', { name: 'Show less' })).toBeOnTheScreen();
  });
});
