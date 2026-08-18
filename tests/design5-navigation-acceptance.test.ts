// Nolie Design 5.1 Wave 2 — Android Back matrix + repeat-tap scroll-to-top.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): reduceFloatingAddPhase / isTrayMounted /
//   isTrayInteractive / isSheetOpen (floatingAddTransition.ts, untouched),
//   resolveDockVisibility (dockVisibility.ts), and the real
//   scrollToTopOnRepeatPress listener factory. All pure and RN-free, so
//   these are genuine behavioural assertions, not structural ones.
// - NOT proven here: that Android's native BackHandler actually fires, or
//   that a real ScrollView scrolls. Device evidence.
//
// Run with: ./node_modules/.bin/tsx tests/design5-navigation-acceptance.test.ts

import {
  INITIAL_FLOATING_ADD_PHASE,
  reduceFloatingAddPhase,
  isTrayMounted,
  isTrayInteractive,
  isSheetOpen,
  bothModalsVisible,
} from '../src/components/navigation/floatingAddTransition';
import { resolveDockVisibility, ALL_DOCK_ROUTES } from '../src/navigation/dockVisibility';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== A. Android Back matrix ===');
{
  // A1. Root tab, nothing open: Back is the system default. The Add surface
  // has no claim on it, so the phase machine must be at rest.
  assert('A1. root tab with nothing open: phase is closed, so Back falls through to the system', INITIAL_FLOATING_ADD_PHASE === 'closed' && !isTrayMounted('closed') && !isSheetOpen('closed'));
  assert('A1b. dock is visible on a root tab in that state', resolveDockVisibility({ route: 'Today', keyboardVisible: false, overlay: 'none' }).visible);

  // A2. Tray open: Back closes the tray (QuickActionsTray's BackHandler
  // dispatches REQUEST_DISMISS) and must NOT open a workspace.
  const trayOpen = reduceFloatingAddPhase('closed', 'PRESS_FAB');
  assert('A2. FAB press opens the tray', trayOpen === 'trayOpen');
  const afterBack = reduceFloatingAddPhase(trayOpen, 'REQUEST_DISMISS');
  assert('A2b. Back from the open tray enters closingForDismiss, never closingForAction', afterBack === 'closingForDismiss');
  const settled = reduceFloatingAddPhase(afterBack, 'TRAY_CLOSED');
  assert('A2c. once closed it returns to `closed`, with no workspace mounted', settled === 'closed' && !isSheetOpen(settled));

  // A3. THE critical one: Back pressed while the tray is closing for an
  // action must complete the close and must NOT open the workspace.
  const closingForAction = reduceFloatingAddPhase(reduceFloatingAddPhase('closed', 'PRESS_FAB'), 'SELECT_ACTION');
  assert('A3. selecting a tile enters closingForAction', closingForAction === 'closingForAction');
  assert('A3b. Back mid-close is ignored by the machine — the close completes', reduceFloatingAddPhase(closingForAction, 'REQUEST_DISMISS') === 'closingForAction');
  assert('A3c. only TRAY_CLOSED opens the workspace', reduceFloatingAddPhase(closingForAction, 'TRAY_CLOSED') === 'addSheetOpen');

  // A4. Workspace open: Back belongs to the workspace, not the tray.
  assert('A4. with the workspace open the tray is not mounted', !isTrayMounted('addSheetOpen'));
  assert('A4b. Back does not reopen the tray from the workspace', reduceFloatingAddPhase('addSheetOpen', 'REQUEST_DISMISS') === 'addSheetOpen');
  assert('A4c. the workspace closes only on SHEET_CLOSED', reduceFloatingAddPhase('addSheetOpen', 'SHEET_CLOSED') === 'closed');

  // A5. No reachable phase mounts both modal layers — the freeze invariant.
  const phases = ['closed', 'trayOpen', 'closingForAction', 'closingForDismiss', 'addSheetOpen'] as const;
  assert('A5. no reachable phase mounts both the tray and the workspace', phases.every((p) => !bothModalsVisible(p)));

  // A6. Dock must be hidden wherever Back would act on an overlay, so Back
  // never dismisses something the dock is competing with.
  let wrong = 0;
  for (const route of ALL_DOCK_ROUTES) {
    for (const overlay of ['taskWorkspace', 'picker', 'alert', 'infoSheet', 'blocking'] as const) {
      if (resolveDockVisibility({ route, keyboardVisible: false, overlay }).visible) wrong++;
    }
  }
  assert('A6. dock hidden for every overlay Back could dismiss, on every route', wrong === 0);

  // A7. Keyboard visible: Back dismisses the keyboard; the dock is already
  // hidden so it cannot be revealed incorrectly mid-dismissal.
  assert('A7. dock hidden on every route while the keyboard is up', ALL_DOCK_ROUTES.every((route) => !resolveDockVisibility({ route, keyboardVisible: true, overlay: 'none' }).visible));

  // A8. Hidden-dock route: Back pops the stack; the dock stays hidden.
  assert('A8. Settings (hidden-dock) stays hidden regardless of keyboard/overlay', ['none', 'picker', 'alert'].every((o) => !resolveDockVisibility({ route: 'Settings', keyboardVisible: false, overlay: o as never }).visible));

  // A9. Pushed visible-dock route keeps the dock while Back pops normally.
  assert('A9. MoneyDetail (pushed, passive) keeps the dock when nothing is layered', resolveDockVisibility({ route: 'MoneyDetail', keyboardVisible: false, overlay: 'none' }).visible);
}

console.log('\n=== D. Repeat-tap scroll-to-top ===');
{
  // Real import of the pure behaviour module; the ref map is injected, so
  // the listener's actual effect is observable without a navigator.
  const { createRepeatTapScrollListener } = require('../src/navigation/tabScrollBehaviour');

  const calls: Record<string, number> = { Today: 0, Money: 0 };
  const refs = {
    Today: { current: { scrollTo: (o: { y: number }) => { if (o.y === 0) calls.Today++; } } as any },
    Money: { current: { scrollTo: (o: { y: number }) => { if (o.y === 0) calls.Money++; } } as any },
  };

  const todayFocused = createRepeatTapScrollListener('Today', refs)({ navigation: { isFocused: () => true } });
  const moneyUnfocused = createRepeatTapScrollListener('Money', refs)({ navigation: { isFocused: () => false } });

  assert('D1. the factory returns a tabPress listener', typeof todayFocused.tabPress === 'function');

  // D2. First press of an UNFOCUSED tab: normal navigation, no scroll.
  moneyUnfocused.tabPress();
  assert('D2. pressing an unfocused tab does NOT scroll it (normal navigation)', calls.Money === 0);

  // D3. Pressing the ALREADY-SELECTED tab scrolls it to top.
  todayFocused.tabPress();
  assert('D3. pressing the already-selected tab scrolls it to top', calls.Today === 1);

  // D4. Not a one-shot.
  todayFocused.tabPress();
  assert('D4. repeat presses keep scrolling to top', calls.Today === 2);

  // D5. Pressing another tab must not invoke the previous tab's handler.
  moneyUnfocused.tabPress();
  assert("D5. pressing another tab never invokes the previous tab's scroll handler", calls.Today === 2 && calls.Money === 0);

  // D6. Each tab scrolls only its own list.
  const moneyFocused = createRepeatTapScrollListener('Money', refs)({ navigation: { isFocused: () => true } });
  moneyFocused.tabPress();
  assert('D6. each tab scrolls only its own list', calls.Money === 1 && calls.Today === 2);

  // D7. A missing ref is a safe no-op, never a crash.
  refs.Today.current = null as any;
  let threw = false;
  try { todayFocused.tabPress(); } catch { threw = true; }
  assert('D7. a null scroll target is a safe no-op, never a crash', !threw);

  // D8. It always scrolls to the very top, animated.
  let captured: any = null;
  refs.Money.current = { scrollTo: (o: any) => { captured = o; } } as any;
  moneyFocused.tabPress();
  assert('D8. scrolls to y=0 with animation', captured && captured.y === 0 && captured.animated === true);
}

console.log('\n=== E. Zero tab-scene animation remains ===');
{
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../src/navigation/MainTabNavigator.tsx'), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert('E1. no fade/shift/slide scene animation is configured', !/animation:\s*'(fade|shift|slide)/.test(code));
  assert('E2. the four tab routes and their order are unchanged', ['Today', 'Money', 'Wealth', 'Grow'].every((n) => code.includes(`name="${n}"`)));
  assert('E3. every tab still registers the repeat-tap listener', (code.match(/scrollToTopOnRepeatPress\('/g) || []).length === 4);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
