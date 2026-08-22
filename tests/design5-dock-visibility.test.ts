// ---------------------------------------------------------------------------
// RECONCILED — Design 5.1 Wave 8 closure.
//
// OLD CLAUSES: EmergencyFund was classified dock-VISIBLE (a "passive
// review"), so the counts were 10 visible / 7 hidden.
//
// SUPERSEDED BECAUSE the owner's recording showed the global shell bleeding
// onto Emergency Fund. Wave 2 classified it before it became one of Grow's
// four CALCULATOR tiles; the other three were always hidden. The closure
// brief requires that the shell reach none of the four. PRESERVED INTENT:
// the matrix is exhaustive, fails closed, and every route is classified
// exactly once — all still asserted, with the corrected counts.
// ---------------------------------------------------------------------------

// Nolie Design 5.1 Wave 2 — dock/"+" visibility matrix, exhaustively.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): src/navigation/dockVisibility.ts and
//   src/navigation/floatingNavGeometry.ts are both pure and RN-free, so
//   every assertion runs the real production function.
// - NOT proven here: that FloatingNavBar actually consults this matrix on a
//   device, or that the fade renders. Device evidence.
//
// Run with: ./node_modules/.bin/tsx tests/design5-dock-visibility.test.ts

import {
  ALL_DOCK_ROUTES,
  ALL_DOCK_OVERLAY_STATES,
  DOCK_VISIBLE_ROUTES,
  DOCK_HIDDEN_ROUTES,
  DockRoute,
  resolveDockVisibility,
  isDockVisible,
  isDockVisibleForRouteName,
  toDockRoute,
} from '../src/navigation/dockVisibility';
import {
  DOCK_MAX_WIDTH,
  HORIZONTAL_MARGIN,
  FAB_SIZE,
  DOCK_FAB_GAP,
  DOCK_HEIGHT,
  combinedAssemblyWidth,
  capsuleWidth,
  assemblyHorizontalInset,
  dockBottomOffset,
  screenBottomClearance,
} from '../src/navigation/floatingNavGeometry';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. The matrix is exhaustive: every route x keyboard x overlay ===');
{
  const combos = ALL_DOCK_ROUTES.length * 2 * ALL_DOCK_OVERLAY_STATES.length;
  assert(`1a. 17 routes x 2 keyboard states x 6 overlay states = ${combos} combinations`, combos === 17 * 2 * 6);

  let evaluated = 0;
  let visibleCount = 0;
  for (const route of ALL_DOCK_ROUTES) {
    for (const keyboardVisible of [false, true]) {
      for (const overlay of ALL_DOCK_OVERLAY_STATES) {
        const r = resolveDockVisibility({ route, keyboardVisible, overlay });
        evaluated++;
        if (r.visible) visibleCount++;
        if (typeof r.visible !== 'boolean' || !r.reason) failures++;
      }
    }
  }
  assert(`1b. all ${evaluated} combinations resolve to a boolean plus a reason`, evaluated === combos);
  // Visible only when: route is one of the 10, keyboard down, overlay none.
  assert('1c. exactly 9 combinations are visible (9 routes x keyboard-down x overlay-none)', visibleCount === 9);
}

console.log('\n=== 2. Route classification matches the design exactly ===');
{
  assert('2a. 9 visible routes', DOCK_VISIBLE_ROUTES.length === 9);
  assert('2b. 8 hidden routes', DOCK_HIDDEN_ROUTES.length === 8);
  assert('2c. the two sets do not overlap', DOCK_VISIBLE_ROUTES.every((r) => !DOCK_HIDDEN_ROUTES.includes(r)));

  for (const r of ['Today', 'Money', 'Wealth', 'Grow'] as DockRoute[]) {
    assert(`2d. ${r} root is visible`, isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' }));
  }
  for (const r of ['MoneyDetail', 'GrowDetail', 'Goals', 'Cards', 'Transactions'] as DockRoute[]) {
    assert(`2e. ${r} (passive review) is visible`, isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' }));
  }
  assert('2e-i. EmergencyFund is HIDDEN — it is a calculator, not a passive review', !isDockVisible({ route: 'EmergencyFund', keyboardVisible: false, overlay: 'none' }));
  assert('2e-ii. and all four calculators are now classified identically', (['CompoundCalculator', 'HomeLoanCalculator', 'SavingsComparison', 'EmergencyFund'] as DockRoute[]).every((r) => !isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' })));
  for (const r of ['Settings', 'Language', 'ResetLulu'] as DockRoute[]) {
    assert(`2f. ${r} (administrative) is hidden`, !isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' }));
  }
  for (const r of ['CompoundCalculator', 'HomeLoanCalculator', 'SavingsComparison'] as DockRoute[]) {
    assert(`2g. ${r} (input-focused calculator) is hidden`, !isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' }));
  }
  assert('2h. Onboarding is hidden (no global actions before consent)', !isDockVisible({ route: 'Onboarding', keyboardVisible: false, overlay: 'none' }));
}

console.log('\n=== 3. The keyboard hides the assembly on EVERY route ===');
{
  let wrong = 0;
  for (const route of ALL_DOCK_ROUTES) {
    if (isDockVisible({ route, keyboardVisible: true, overlay: 'none' })) wrong++;
  }
  assert('3a. keyboard up => hidden on all 17 routes', wrong === 0);
  assert('3b. and the reason names the keyboard', resolveDockVisibility({ route: 'Today', keyboardVisible: true, overlay: 'none' }).reason === 'hidden-keyboard');
}

console.log('\n=== 4. Every blocking overlay hides the assembly ===');
{
  let wrong = 0;
  for (const route of ALL_DOCK_ROUTES) {
    for (const overlay of ALL_DOCK_OVERLAY_STATES) {
      if (overlay === 'none') continue;
      if (isDockVisible({ route, keyboardVisible: false, overlay })) wrong++;
    }
  }
  assert('4a. any overlay => hidden, on every route', wrong === 0);
  for (const o of ['taskWorkspace', 'picker', 'alert', 'infoSheet', 'blocking'] as const) {
    assert(`4b. ${o} hides the dock even on a visible root`, !isDockVisible({ route: 'Today', keyboardVisible: false, overlay: o }));
  }
  assert('4c. overlay takes precedence over the route rule', resolveDockVisibility({ route: 'Today', keyboardVisible: false, overlay: 'alert' }).reason === 'hidden-overlay');
  assert('4d. overlay takes precedence over the keyboard rule', resolveDockVisibility({ route: 'Today', keyboardVisible: true, overlay: 'alert' }).reason === 'hidden-overlay');
}

console.log('\n=== 5. The tray is NOT an overlay state — it dims the dock, never hides it ===');
{
  // The quick tray is the dock's own surface: "+" morphs to "x" in place.
  assert('5a. no tray member exists in the overlay union', !(ALL_DOCK_OVERLAY_STATES as readonly string[]).includes('tray'));
}

console.log('\n=== 6. Unknown routes fail closed (hidden), never open ===');
{
  assert('6a. an unclassified route name maps to null', toDockRoute('SomeFutureScreen') === null);
  assert('6b. undefined maps to null', toDockRoute(undefined) === null);
  assert('6c. an unknown route is HIDDEN, not visible', isDockVisibleForRouteName('SomeFutureScreen', false, 'none') === false);
  assert('6d. a known route still resolves normally', isDockVisibleForRouteName('Today', false, 'none') === true);
  assert('6e. a known hidden route still resolves hidden', isDockVisibleForRouteName('Settings', false, 'none') === false);
}

console.log('\n=== 7. Visibility never depends on scroll ===');
{
  // Structural: the module must expose no scroll input at all.
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../src/navigation/dockVisibility.ts'), 'utf8');
  assert('7a. no scroll/offset/velocity input anywhere in the module', !/scroll|offsetY|velocity/i.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log('\n=== 8. Tablet: the assembly is capped at 500pt and centred ===');
{
  assert('8a. cap is 500', DOCK_MAX_WIDTH === 500);
  // Phone widths are unchanged by the cap.
  for (const w of [320, 360, 390, 430]) {
    const expected = w - HORIZONTAL_MARGIN * 2;
    assert(`8b. ${w}pt phone: assembly spans the margins (${expected}pt), uncapped`, combinedAssemblyWidth(w) === expected);
    assert(`8c. ${w}pt phone: no centring inset`, assemblyHorizontalInset(w) === 0);
  }
  // Tablet widths are capped and centred.
  for (const w of [768, 834, 1024]) {
    assert(`8d. ${w}pt tablet: assembly capped at 500`, combinedAssemblyWidth(w) === 500);
    const available = w - HORIZONTAL_MARGIN * 2;
    assert(`8e. ${w}pt tablet: centred with inset ${(available - 500) / 2}`, assemblyHorizontalInset(w) === (available - 500) / 2);
  }
  assert('8f. capsule + gap + FAB exactly fills the assembly at 390pt', capsuleWidth(390) + DOCK_FAB_GAP + FAB_SIZE === combinedAssemblyWidth(390));
  assert('8g. capsule + gap + FAB exactly fills the capped assembly at 1024pt', capsuleWidth(1024) + DOCK_FAB_GAP + FAB_SIZE === combinedAssemblyWidth(1024));
  assert('8h. capsule width never goes negative on a tiny window', capsuleWidth(100) >= 0);
}

console.log('\n=== 9. Safe-area and bottom-clearance contracts are unchanged ===');
{
  // Wave 2 must not alter what Wave 1 and earlier passes already guarantee.
  assert('9a. dock height still 64', DOCK_HEIGHT === 64);
  assert('9b. horizontal margin still 16', HORIZONTAL_MARGIN === 16);
  assert('9c. gap still 8', DOCK_FAB_GAP === 8);
  assert('9d. FAB is a circle the same height as the capsule', FAB_SIZE === DOCK_HEIGHT);
  assert('9e. bottom offset adds the safe-area inset', dockBottomOffset(34) === 34 + 8);
  assert('9f. bottom offset floors a negative inset at 0', dockBottomOffset(-10) === 8);
  assert('9g. clearance = offset + height + cushion', screenBottomClearance(34) === 34 + 8 + 64 + 8);
  assert('9h. clearance on a device with no inset', screenBottomClearance(0) === 8 + 64 + 8);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
