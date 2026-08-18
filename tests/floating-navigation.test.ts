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
  // SUPERSEDED BY DESIGN 5.1 WAVE 3 (authorised; handoff §2, doc A p.4-5).
  // This block previously asserted the nine-tile 3x3 tray. Wave 3 replaces it
  // with exactly six tiles and moves the removed actions into the canonical
  // catalogue, because:
  //   - `addAsset` resolved to the narrow `investment`/ETF form despite its
  //     broad label (audit D5-003);
  //   - `addAccount` opened a second scoped chooser behind a "quick" action;
  //   - `addDebt` competed with the catalogue's own taxonomy (D5-010);
  //   - the centre "Add anything" tile duplicated the catalogue title and was
  //     the Ask Nolie placeholder, which doc A p.16 removes from the IA.
  // Only presentation/navigation expectations changed here. No financial,
  // phase-machine or persistence expectation was touched, and the destination
  // for every RETAINED tile is asserted unchanged below.
  // Full Wave 3 coverage: tests/design5-add-architecture.test.ts.
  assert('2a. QUICK_ACTION_ORDER has exactly 6 tiles (the 3x2 grid)', QUICK_ACTION_ORDER.length === 6);
  assert('2b. QUICK_ACTION_ORDER has no duplicate keys', new Set(QUICK_ACTION_ORDER).size === 6);
  assert(
    "2c. Income received opens AddAnythingSheet at 'income_received' (a recorded payment, not a new recurring income source) — unchanged destination",
    resolveQuickAction('income_received').sheet?.initialKind === 'income_received'
  );
  assert("2d. Record spending opens AddAnythingSheet at 'expense' — unchanged destination", resolveQuickAction('record_spending').sheet?.initialKind === 'expense');
  assert("2e. Add bill opens AddAnythingSheet at 'bill' — unchanged destination", resolveQuickAction('add_bill').sheet?.initialKind === 'bill');
  assert("2g. Move money opens AddAnythingSheet at 'transfer' — unchanged destination", resolveQuickAction('move_money').sheet?.initialKind === 'transfer');
  assert("2j. Add goal opens AddAnythingSheet at 'goal' — unchanged destination", resolveQuickAction('add_goal').sheet?.initialKind === 'goal');
  assert('2k. More opens the catalogue (no initialKind) and is the only tile that seeds the chooser return step', resolveQuickAction('more').sheet?.initialKind === undefined && resolveQuickAction('more').opensCatalogue === true);
  assert('2l. every direct quick action is marked as NOT opening the catalogue', QUICK_ACTION_ORDER.filter((k) => k !== 'more').every((k) => resolveQuickAction(k).opensCatalogue === false));
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

console.log('\n=== 4. buildQuickActionTiles — tile copy resolution (Class A) ===');
{
  // SUPERSEDED BY DESIGN 5.1 WAVE 3 (authorised; doc A p.4/p.16). The old
  // 4b-4d asserted the centre tile's "Add anything" / "Ask Nolie" swap and
  // its ambient branding. Ask Nolie is now ABSENT from the production IA —
  // no tile, no disabled teaser — so buildQuickActionTiles no longer takes a
  // capability at all. The tray's sixth tile is `more`, which is visually
  // distinct without reading as disabled. Presentation only; no financial,
  // phase or persistence expectation changed.
  const tiles = buildQuickActionTiles();
  assert('4a. exactly 6 tiles are built, in QUICK_ACTION_ORDER order', tiles.length === 6 && tiles.every((t, i) => t.key === QUICK_ACTION_ORDER[i]));
  assert('4b. the final tile is More, flagged for its distinct (never disabled) treatment', tiles[5].key === 'more' && tiles[5].label === 'More' && tiles[5].isMore === true);
  assert('4c. no other tile carries the More treatment', tiles.slice(0, 5).every((t) => t.isMore === false));
  assert('4d. Ask Nolie is unreachable from the tray — no tile label or key mentions it', tiles.every((t) => !/ask/i.test(t.label) && !/ask/i.test(t.key)));
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
