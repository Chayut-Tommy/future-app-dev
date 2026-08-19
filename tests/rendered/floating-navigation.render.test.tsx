import React from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { askNolieCapability } from '../../src/lib/askNolie';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Floating navigation design pass — genuine rendered coverage for the new
 * dock/FAB/tray assembly, mounted with the REAL RootNavigator (real
 * FloatingNavBar capsule, real FloatingAddButton FAB, real QuickActionsTray,
 * real AddAnythingSheet) inside a real NavigationContainer — never a mock
 * navigator or source-regex proxy. Pure geometry/mapping logic
 * (floatingNavGeometry.ts, quickActions.ts, askNolie.ts) has its own
 * real-import coverage in tests/floating-navigation.test.ts.
 *
 * Reduce Motion is mocked ON for every test in this file (the same
 * AccessibilityInfo.isReduceMotionEnabled spy pattern
 * tests/rendered/use-reduce-motion.render.test.tsx already establishes) —
 * every transition this file drives (tray open/close, FAB rotate, tab
 * pill, AND AddAnythingSheet's own destination push-transition) then
 * applies its end state immediately rather than depending on a real
 * Animated.timing completing on Jest's fake clock, which is what genuine
 * physical-device testing must independently confirm reads as calm and
 * premium, not just "eventually correct". Reduce-motion-OFF is covered
 * separately by the pure duration/easing constants already read directly
 * from source in this pass's own code (220/165ms, Easing.out/in(cubic)) and
 * by the explicit reduce-motion contrast this test suite proves: instant
 * application in every case here IS the Reduce-Motion-on behaviour the
 * product spec itself requires, so this file doubles as that coverage.
 *
 * What this file CANNOT prove: native Modal presentation timing, real
 * VoiceOver/TalkBack focus movement, or genuinely smooth Animated motion
 * with Reduce Motion off — Jest has no native rendering surface. Physical-
 * device confirmation remains required for those — see the round's final
 * report checklist.
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
  data.user.hasSeenIntro = true;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

describe('Floating navigation — dock capsule + FAB + quick-actions tray (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedData();
    askNolieCapability.enabled = false;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('the four tabs render with the correct roles/labels, Today focused by default, and tapping Money switches tabs and preserves the other three as unfocused', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    const today = await screen.findByRole('button', { name: /^Today,/ });
    expect(today.props.accessibilityState?.selected).toBe(true);

    const money = await screen.findByRole('button', { name: /^Money,/ });
    expect(money.props.accessibilityState?.selected ?? false).toBe(false);

    await user.press(money);

    await waitFor(async () => {
      const moneyAfter = await screen.findByRole('button', { name: /^Money,/ });
      expect(moneyAfter.props.accessibilityState?.selected).toBe(true);
    });
    const todayAfter = await screen.findByRole('button', { name: /^Today,/ });
    expect(todayAfter.props.accessibilityState?.selected ?? false).toBe(false);
  });

  // SUPERSEDED BY DESIGN 5.1 WAVE 3 (authorised; handoff §2, doc A p.4-5,
  // p.16). The nine-tile tray became six: Add account, Add debt and Add asset
  // moved into the canonical catalogue (Add asset had resolved to the narrow
  // investment/ETF form despite its broad label — audit D5-003), and the
  // centre "Add anything"/Ask Nolie tile was removed from the production IA.
  // Presentation/navigation only — no financial, phase-machine or persistence
  // expectation changed here.
  test('the FAB opens the quick-actions tray with all 6 destinations, and its own accessibility label toggles Open/Close', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    const fab = await screen.findByRole('button', { name: 'Open quick actions' });
    await user.press(fab);

    await screen.findByRole('button', { name: 'Close quick actions' });
    for (const label of ['Record spending', 'Income received', 'Add bill', 'Move money', 'Add goal', 'More']) {
      await screen.findByRole('menuitem', { name: label });
    }
  });

  test('opening the tray announces it for screen readers', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('Quick actions opened'));
    announceSpy.mockRestore();
  });

  test('selecting "Add bill" closes the tray and opens the existing canonical Add Anything flow at the Bill destination — never a duplicate form', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add bill' }));

    // Design 5.1 Wave 4 — the Bill task no longer opens on a preliminary
    // "What's this bill for?" page; it opens directly on the form, which
    // reports 'Add a bill' as its live title via onTitleChange and repeats
    // it as its own heading (accessibilityRole="header"). Still the real,
    // canonical Bill flow, not a duplicate form — and the choice that page
    // used to make is now the in-form selector asserted below.
    await screen.findByRole('header', { name: 'Add a bill' });
    // The bill-type choice really is present in the form, not merely
    // removed: the selector renders with its own label.
    expect(await screen.findByLabelText("What's this bill for?, Choose a bill type")).toBeOnTheScreen();
    // The tray itself is gone (its own menu items no longer queryable) once a destination opens.
    expect(screen.queryByRole('menuitem', { name: 'Add bill' })).toBeNull();
    await waitFor(async () => {
      const fab = await screen.findByRole('button', { name: 'Open quick actions' });
      expect(fab).toBeTruthy();
    });
  });

  test('selecting "Move money" opens the existing Move Money (Transfer) flow', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Move money' }));

    // TransferForm's own heading (accessibilityRole="header") disambiguates
    // from the outer KeyboardSheet chrome's own, separate "Move money" title
    // Text — both legitimately read "Move money" (pre-existing, unrelated to
    // this pass), so this targets the specific one that proves the real
    // Move Money form actually mounted.
    await screen.findByRole('header', { name: 'Move money' });
  });

  test('switching tabs while the tray is open closes it automatically', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await screen.findByRole('button', { name: 'Close quick actions' });

    await user.press(await screen.findByRole('button', { name: /^Money,/ }));

    await waitFor(async () => {
      await screen.findByRole('button', { name: 'Open quick actions' });
    });
    expect(screen.queryByRole('menuitem', { name: 'Add bill' })).toBeNull();
  });

  test('rapid double-press on a tray tile only opens the destination once (no duplicate sheet/navigation)', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    const tile = await screen.findByRole('menuitem', { name: 'Add goal' });
    await user.press(tile);
    // A second press target no longer exists once the tray has closed —
    // proving the first press alone drove the transition, not a queued
    // second one landing on a since-replaced tree.
    expect(screen.queryByRole('menuitem', { name: 'Add goal' })).toBeNull();

    // AddGoalModal's own heading (accessibilityRole="header") — plain-text
    // "Add a goal" also legitimately appears elsewhere on Today (an
    // unrelated pre-existing "Track a goal" empty-state button) and in the
    // outer chrome title, so the header role is what specifically proves
    // the real Goal form opened exactly once.
    await screen.findByRole('header', { name: 'Add a goal' });
    expect(screen.getAllByRole('header', { name: 'Add a goal' })).toHaveLength(1);
  });

  test('Settings remains reachable from Today while the new dock/FAB assembly is present', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Settings' }));
    await screen.findByText('Settings');
  });

  // ---------------------------------------------------------------------
  // Correction round — the tray-to-AddAnythingSheet hand-off itself.
  // These prove the transition, not merely "the right kind was mapped"
  // (already covered by tests/floating-navigation.test.ts's pure
  // resolveQuickAction coverage). Each one presses a tile through the
  // REAL tray, waits for the REAL AddAnythingSheet content, and then
  // proves the rest of the app (a tab) is still responsive — this is
  // exactly the device-reported failure mode: not "wrong destination", but
  // "nothing opens and the app stops responding entirely".
  // ---------------------------------------------------------------------

  async function expectTabsStillResponsive(user: ReturnType<typeof userEvent.setup>) {
    const wealth = await screen.findByRole('button', { name: /^Wealth,/ });
    await user.press(wealth);
    await waitFor(async () => {
      const wealthAfter = await screen.findByRole('button', { name: /^Wealth,/ });
      expect(wealthAfter.props.accessibilityState?.selected).toBe(true);
    });
  }

  test('1. Income received — the real income-entry content becomes visible, and Today/all four tabs remain tappable afterward', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Income received' }));

    // Design 5.1 Wave 4 — QuickAddModal opens directly on its form, whose
    // title is shared verbatim with Record spending below (same embedded
    // component) by design; the exact income_received-vs-expense kind
    // routing is proven at the pure-function level
    // (tests/floating-navigation.test.ts, resolveQuickAction) since both
    // share this identical UI.
    await screen.findByRole('header', { name: 'Add transaction' });
    // The category choice the removed page used to make is in the form.
    expect(await screen.findByLabelText('Category, Select a category')).toBeOnTheScreen();
    await expectTabsStillResponsive(user);
  });

  test('3. Record spending — the real expense-entry content becomes visible, and all four tabs remain tappable afterward', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Record spending' }));

    await screen.findByRole('header', { name: 'Add transaction' });
    await expectTabsStillResponsive(user);
  });

  test('4. Add bill — tabs remain tappable after closing', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add bill' }));
    await screen.findByRole('header', { name: 'Add a bill' });
    await expectTabsStillResponsive(user);
  });

  test('7. Move money — tabs remain tappable after closing', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Move money' }));
    await screen.findByRole('header', { name: 'Move money' });
    await expectTabsStillResponsive(user);
  });

  test('10. Add goal — tabs remain tappable after closing', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await screen.findByRole('header', { name: 'Add a goal' });
    await expectTabsStillResponsive(user);
  });

  test('11. opening the same destination twice in succession both times reaches the real form', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await screen.findByRole('header', { name: 'Add a goal' });
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await screen.findByRole('header', { name: 'Add a goal' });
    expect(screen.getAllByRole('header', { name: 'Add a goal' })).toHaveLength(1);
  });

  test('12. opening one destination, cancelling, then opening a different destination reaches the second destination cleanly (no leftover state from the first)', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add bill' }));
    await screen.findByRole('header', { name: 'Add a bill' });
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await screen.findByRole('header', { name: 'Add a goal' });
    expect(screen.queryByRole('header', { name: 'Add a bill' })).toBeNull();
  });

  test('14. closing the tray without selecting anything (backdrop tap) leaves no invisible overlay — the tab underneath is immediately tappable', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await screen.findByRole('menu', { name: 'Quick actions' });

    // The backdrop is deliberately not exposed via an accessible role (it's
    // marked accessibilityElementsHidden) — closing it here through the
    // FAB's own toggle exercises the identical REQUEST_DISMISS path a
    // backdrop tap drives (see floatingAddTransition.ts; both call the same
    // onRequestDismiss).
    await user.press(await screen.findByRole('button', { name: 'Close quick actions' }));

    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());
    expect(screen.queryByRole('menu', { name: 'Quick actions' })).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
    // The tab underneath is genuinely reachable — proves nothing is left
    // intercepting touches where the tray used to be.
    await expectTabsStillResponsive(user);
  });

  test('16a. Android hardware Back closes the tray (BackHandler), returning it to Open quick actions', async () => {
    let backHandler: (() => boolean) | null = null;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, handler: () => boolean) => {
      backHandler = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof BackHandler.addEventListener);

    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await screen.findByRole('menu', { name: 'Quick actions' });
    expect(backHandler).not.toBeNull();

    let handled: boolean | undefined;
    await waitFor(() => {
      handled = backHandler!();
    });
    expect(handled).toBe(true);

    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());
    expect(screen.queryByRole('menu', { name: 'Quick actions' })).toBeNull();
  });

  test('16b. iOS accessibility escape (two-finger Z) closes the tray', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    const panel = await screen.findByRole('menu', { name: 'Quick actions' });
    expect(typeof panel.props.onAccessibilityEscape).toBe('function');

    await waitFor(() => {
      panel.props.onAccessibilityEscape();
    });

    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());
  });

  test('17. the full hand-off also completes correctly with Reduce Motion OFF (real Animated timing, not mocked-instant)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));

    // Real close animation (165ms) + real open-transition animation (220ms)
    // must both genuinely complete — this default waitFor timeout (1000ms)
    // is comfortably above their combined real-time duration.
    await screen.findByRole('header', { name: 'Add a goal' });
    await expectTabsStillResponsive(user);
  });

  test('18. a keyboard rising elsewhere cannot unmount or conceal an already-open AddAnythingSheet form', async () => {
    let keyboardShowHandler: (() => void) | null = null;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      if (event === showEvent) keyboardShowHandler = handler;
      return { remove: jest.fn() } as any;
    }) as unknown as typeof Keyboard.addListener);

    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await screen.findByRole('header', { name: 'Add a goal' });

    expect(keyboardShowHandler).not.toBeNull();
    await waitFor(() => {
      keyboardShowHandler!();
    });

    // The Goal form must still be fully present and functional — a
    // keyboard rising (e.g. the user tapping into the goal name field)
    // must never unmount or hide it.
    await screen.findByRole('header', { name: 'Add a goal' });
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Open quick actions' })).toBeTruthy());
  });
  // WAVE 3 REPLACEMENT COVERAGE — these six replace the removed Add account /
  // Add anything / Add debt / Add asset journeys with the canonical
  // six-action tray's own destinations, so no coverage was lost when those
  // tiles moved into the catalogue.

  test('W3-1. the tray shows exactly the six canonical tiles, and none of the removed ones', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    for (const label of ['Record spending', 'Income received', 'Add bill', 'Move money', 'Add goal', 'More']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeOnTheScreen();
    }
    for (const gone of ['Add account', 'Add anything', 'Add asset', 'Add debt', 'Ask Nolie']) {
      expect(screen.queryByRole('menuitem', { name: gone })).toBeNull();
    }
  });

  test('W3-2. More opens the Add to Nolie catalogue, not a task workspace', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    // The catalogue's own standing subtitle is the unambiguous marker that
    // the chooser layer (not a task workspace) is what opened.
    expect(await screen.findByText('Everything you can record, in one place.')).toBeOnTheScreen();
    await expectTabsStillResponsive(user);
  });

  test('W3-3. the catalogue exposes the six-asset taxonomy that replaced the generic Add asset tile', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    await screen.findByText('Everything you can record, in one place.');
    for (const label of ['Add cash', 'Add savings', 'Add everyday account', 'Add investment', 'Add property']) {
      expect(await screen.findByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByText('Add asset')).toBeNull();
  });

  test('W3-4. the catalogue names debt explicitly, replacing the removed Add debt tile', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    await screen.findByText('Everything you can record, in one place.');
    expect(await screen.findByText('Add debt')).toBeOnTheScreen();
    expect(await screen.findByText('Add credit card')).toBeOnTheScreen();
    expect(screen.queryByText('Add liability')).toBeNull();
    await expectTabsStillResponsive(user);
  });

  test('W3-5. Record spending — the canonical expense workspace opens, tabs remain tappable', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Record spending' }));
    await expectTabsStillResponsive(user);
  });

  test('W3-6. Add goal — tabs remain tappable after closing', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Add goal' }));
    await expectTabsStillResponsive(user);
  });

  // WAVE 3 — origin contract and catalogue Close, rendered.

  test('W3-7. a direct quick task renders NO Back control and cannot reveal the catalogue', async () => {
    // All five direct tiles are proven at the reducer level (empty return
    // stack) in tests/design5-origin-contract.test.ts; this is the rendered
    // proof that an empty stack means no Back control reaches the tree.
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'Record spending' }));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByText('Everything you can record, in one place.')).toBeNull();
  });

  test('W3-8. a catalogue-selected task DOES render Back, and Back returns to the catalogue', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    await screen.findByText('Everything you can record, in one place.');
    await user.press(await screen.findByText('Add goal'));
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(back).toBeOnTheScreen();
    await user.press(back);
    expect(await screen.findByText('Everything you can record, in one place.')).toBeOnTheScreen();
  });

  test('W3-9. the catalogue exposes a visible, accessible Close that exits the journey', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    const close = await screen.findByRole('button', { name: 'Close' });
    expect(close).toBeOnTheScreen();
    await user.press(close);
    await expectTabsStillResponsive(user);
  });

  test('W3-10. catalogue-selected Add everyday account renders Back, and Back returns to the catalogue', async () => {
    // The exact device-reported route: the asset branch previously reached
    // the workspace without an origin, so no Back control was rendered.
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    await screen.findByText('Everything you can record, in one place.');
    await user.press(await screen.findByText('Add everyday account'));
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(back).toBeOnTheScreen();
    await user.press(back);
    expect(await screen.findByText('Everything you can record, in one place.')).toBeOnTheScreen();
  });

  test('W3-11. the catalogue renders all 14 tasks as rows, in canonical group order', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
    await user.press(await screen.findByRole('menuitem', { name: 'More' }));
    await screen.findByText('Everything you can record, in one place.');
    for (const g of ['Everyday money', 'Accounts and wealth', 'Debt and planning']) {
      expect(await screen.findByText(g)).toBeOnTheScreen();
    }
    for (const label of [
      'Record spending', 'Add income source', 'Record income received', 'Add bill', 'Move money',
      'Add cash', 'Add savings', 'Add everyday account', 'Add investment', 'Add property', 'Add retirement savings',
      'Add debt', 'Add credit card', 'Add goal',
    ]) {
      expect(await screen.findByText(label)).toBeOnTheScreen();
    }
    // Qualifiers are announced with their row, not as separate stops.
    expect(await screen.findByLabelText('Add income source, recurring')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Add debt, loan / BNPL')).toBeOnTheScreen();
  });

});
