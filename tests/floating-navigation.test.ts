// Floating navigation design pass — real-import (Class A) coverage for the
// pure logic modules the new dock/FAB/tray assembly is built on:
// floatingNavGeometry.ts (shared layout math), quickActions.ts (tray tile
// -> AddAnythingSheet destination mapping), askNolie.ts (centre-tile
// capability resolver). None of this touches RN/Animated/Modal rendering —
// see tests/rendered/floating-navigation.render.test.tsx for that.
//
// Run with: npx tsx tests/floating-navigation.test.ts

import {
  capsuleWidth,
  combinedAssemblyWidth,
  DOCK_HEIGHT,
  dockBottomOffset,
  FAB_SIZE,
  HORIZONTAL_MARGIN,
  screenBottomClearance,
  trayBottomOffset,
} from '../src/navigation/floatingNavGeometry';
import { buildQuickActionTiles, QUICK_ACTION_ORDER, resolveQuickAction } from '../src/components/navigation/quickActions';
import { readFileSync } from 'fs';
import { askNolieCapability, resolveCenterTileConfig } from '../src/lib/askNolie';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. floatingNavGeometry.ts — shared layout math (Class A) ===');
{
  assert('1a. dockBottomOffset adds the fixed bottom spacing on top of a genuine device inset', dockBottomOffset(34) === 34 + 8);
  assert('1b. dockBottomOffset never goes negative for a device with no bottom inset (Android nav-bar-less devices)', dockBottomOffset(0) === 8);
  assert('1c. dockBottomOffset floors a defensively-negative inset at 0 rather than producing a negative offset', dockBottomOffset(-5) === 8);
  assert(
    '1d. screenBottomClearance is strictly greater than dockBottomOffset + DOCK_HEIGHT (content needs a cushion beyond the assembly itself, not just enough to clear it exactly)',
    screenBottomClearance(34) > dockBottomOffset(34) + DOCK_HEIGHT
  );
  assert(
    '1e. capsuleWidth + FAB_SIZE + the inter-gap fits exactly within the window width minus both margins',
    (() => {
      const windowWidth = 390;
      const gap = 8; // DOCK_FAB_GAP, mirrored here only to prove the arithmetic, not to duplicate the constant's value
      return capsuleWidth(windowWidth) + FAB_SIZE + gap === windowWidth - HORIZONTAL_MARGIN * 2;
    })()
  );
  assert('1f. capsuleWidth never goes negative on an implausibly narrow window', capsuleWidth(10) === 0);
  assert(
    '1g. combinedAssemblyWidth (what the tray aligns its own width to) equals the window width minus both margins — capsule+gap+FAB combined',
    combinedAssemblyWidth(390) === 390 - HORIZONTAL_MARGIN * 2
  );
  assert(
    '1h. trayBottomOffset sits strictly above the top edge of the dock/FAB assembly (dockBottomOffset + DOCK_HEIGHT), never overlapping it',
    trayBottomOffset(34) > dockBottomOffset(34) + DOCK_HEIGHT
  );
}

console.log('\n=== 2. quickActions.ts — tray tile -> AddAnythingSheet destination mapping (Class A) ===');
{
  assert('2a. QUICK_ACTION_ORDER has exactly 9 tiles (the 3x3 grid)', QUICK_ACTION_ORDER.length === 9);
  assert('2b. QUICK_ACTION_ORDER has no duplicate keys', new Set(QUICK_ACTION_ORDER).size === 9);
  assert(
    "2c. Record income opens AddAnythingSheet at 'income_received' (a recorded payment, not a new recurring income source)",
    resolveQuickAction('recordIncome', false).sheet?.initialKind === 'income_received'
  );
  assert("2d. Record spending opens AddAnythingSheet at 'expense'", resolveQuickAction('recordSpending', false).sheet?.initialKind === 'expense');
  assert("2e. Add bill opens AddAnythingSheet at 'bill'", resolveQuickAction('addBill', false).sheet?.initialKind === 'bill');
  assert(
    '2f. Add account opens the existing balance-scoped chooser (onlyBalances) — reuses Select Balances\' own "Add a money balance" entry point, not a new form',
    resolveQuickAction('addAccount', false).sheet?.onlyBalances === true && resolveQuickAction('addAccount', false).sheet?.initialKind === undefined
  );
  assert("2g. Move money opens AddAnythingSheet at 'transfer'", resolveQuickAction('moveMoney', false).sheet?.initialKind === 'transfer');
  assert(
    "2h. Add debt opens AddAnythingSheet at 'liability' — that route's own internal type picker already includes credit card/BNPL/car loan/personal loan/mortgage (existing behaviour, not duplicated here)",
    resolveQuickAction('addDebt', false).sheet?.initialKind === 'liability'
  );
  assert("2i. Add asset opens AddAnythingSheet at a concrete asset preset ('investment'), landing in the existing always-visible type-chip form", resolveQuickAction('addAsset', false).sheet?.initialKind === 'investment');
  assert("2j. Add goal opens AddAnythingSheet at 'goal'", resolveQuickAction('addGoal', false).sheet?.initialKind === 'goal');
  assert(
    '2k. centreAction falls back to the generic Add Anything chooser (no initialKind, no onlyBalances) when Ask Nolie is not enabled',
    (() => {
      const r = resolveQuickAction('centerAction', false).sheet;
      return r !== null && r?.initialKind === undefined && r?.onlyBalances === undefined;
    })()
  );
  assert('2l. centreAction opens nothing (sheet: null) when Ask Nolie IS enabled — the caller routes to the real capability instead', resolveQuickAction('centerAction', true).sheet === null);
}

console.log('\n=== 3. askNolie.ts — typed capability/feature-flag integration point (Class A) ===');
{
  assert('3a. askNolieCapability defaults to disabled — no real Ask Nolie route exists yet', askNolieCapability.enabled === false);
  assert(
    '3b. resolveCenterTileConfig falls back to "Add anything" when the capability is disabled',
    (() => {
      const c = resolveCenterTileConfig({ enabled: false }, 'Nolie');
      return c.kind === 'addAnything' && c.label === 'Add anything';
    })()
  );
  assert(
    '3c. resolveCenterTileConfig switches to the branded "Ask {assistantName}" label once the capability is enabled — proves the integration point is genuinely wired, not hardcoded false everywhere',
    (() => {
      const c = resolveCenterTileConfig({ enabled: true }, 'Nolie');
      return c.kind === 'askNolie' && c.label === 'Ask Nolie';
    })()
  );
}

console.log('\n=== 4. buildQuickActionTiles — tile copy/ambient-styling resolution (Class A) ===');
{
  const disabledTiles = buildQuickActionTiles({ enabled: false }, 'Nolie');
  const enabledTiles = buildQuickActionTiles({ enabled: true }, 'Nolie');
  assert('4a. exactly 9 tiles are built, in QUICK_ACTION_ORDER order', disabledTiles.length === 9 && disabledTiles.every((t, i) => t.key === QUICK_ACTION_ORDER[i]));
  assert(
    '4b. the centre tile reads "Add anything" and is NOT ambient-styled while Ask Nolie is disabled — the strongest branded treatment is reserved for the real capability, never shown for the fallback',
    (() => {
      const center = disabledTiles.find((t) => t.key === 'centerAction')!;
      return center.label === 'Add anything' && center.ambient === false;
    })()
  );
  assert(
    '4c. the centre tile reads "Ask Nolie" and IS ambient-styled once the capability is enabled',
    (() => {
      const center = enabledTiles.find((t) => t.key === 'centerAction')!;
      return center.label === 'Ask Nolie' && center.ambient === true;
    })()
  );
  assert('4d. no tile other than the centre one is ever ambient-styled, in either capability state', [...disabledTiles, ...enabledTiles].filter((t) => t.key !== 'centerAction').every((t) => t.ambient === false));
}

console.log('\n=== 5. Correction round — structural evidence for backgrounding/foregrounding safety (Class C) ===');
{
  // Item 20 of the required behavioural list ("the form remains reachable
  // after backgrounding and foregrounding") cannot be genuinely simulated
  // in this test environment — RN's AppState has no real background/
  // foreground transition to fire under Jest. What CAN be proven: none of
  // the three files driving this flow contain any AppState-based logic
  // that could unmount, hide, or reset anything on such a transition —
  // there is structurally nothing here that COULD break under
  // backgrounding, unlike the confirmed native-Modal-stacking defect this
  // round fixes, which was real, wiring-level, and now removed.
  const FLOATING_ADD_BUTTON_SRC = readFileSync('src/components/navigation/FloatingAddButton.tsx', 'utf-8');
  const QUICK_ACTIONS_TRAY_SRC = readFileSync('src/components/navigation/QuickActionsTray.tsx', 'utf-8');
  const ADD_ANYTHING_SRC = readFileSync('src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
  assert(
    '5a. FloatingAddButton.tsx has no AppState coupling — nothing here can unmount/reset AddAnythingSheet on app background/foreground',
    !/AppState/.test(FLOATING_ADD_BUTTON_SRC)
  );
  assert('5b. QuickActionsTray.tsx has no AppState coupling', !/AppState/.test(QUICK_ACTIONS_TRAY_SRC));
  assert(
    '5c. AddAnythingSheet.tsx has no AppState coupling — its own visible/draft state is owned entirely by its `visible` prop and internal form state, neither of which reacts to backgrounding',
    !/AppState/.test(ADD_ANYTHING_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
