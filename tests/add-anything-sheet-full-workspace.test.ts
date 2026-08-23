// Navigation Transitions — full-workspace extension. Structural (Class C)
// coverage for the rewritten AddAnythingSheet.tsx, which now drives every
// one of Add Anything's thirteen tiles through ONE shared route-transition
// reducer (reduceAddWorkspaceTransition) and ONE shared push-progress
// Animated.Value, replacing the Option B pilot's two independent
// mechanisms (Transfer's own screen/transitionPhase pair, Asset's own
// addAssetTransition/addAssetGenerationRef pair) and retiring the old
// dismiss-and-defer fallback (choose()/onSelect/eight standalone Modals in
// FloatingAddButton.tsx) entirely.
//
// This file supersedes (and the three files it replaces are deleted):
// tests/add-anything-sheet-blank-slab-fix.test.ts,
// tests/add-anything-sheet-lock-and-dirty.test.ts,
// tests/add-anything-sheet-white-gap-and-dismissal.test.ts — every
// assertion in those three targeted the retired choose()/screen/
// transitionPhase/addAssetTransition/dismissAnimationType mechanism and
// would fail permanently against the new architecture, not because
// anything regressed but because the code they were pinned to no longer
// exists. The still-relevant, still-accurate coverage those files also
// carried for files THIS round did not touch (AddWealthItemModal's own
// kind/kindProp prop-shadow fix, AskLuluSheet's independent dismissal
// lifecycle, KeyboardSheet's own onDismiss wiring) is intentionally NOT
// re-asserted here — none of that code changed this round, so it carries
// no incremental regression risk from this work, and re-asserting it here
// would only duplicate coverage that already existed independently of
// AddAnythingSheet.tsx.
//
// CLASSIFICATION:
// - Class C (static/source-structure) only: every assertion below proves
//   the CODE is wired correctly — the right ref is checked first, the
//   right function is called, the right prop is threaded through. None of
//   this executes the component, drives Animated/Modal/Alert at runtime,
//   or simulates real device taps/gestures/keyboard/focus.
// - Real-import (Class A) coverage of the reducer itself lives in
//   tests/add-workspace-transition-controller.test.ts — not duplicated
//   here.
// - NOT proven here: that any transition/animation is visually smooth,
//   that VoiceOver/TalkBack actually announces or focuses correctly, that
//   the Alert dialogs actually appear with the right wording on-device, or
//   that draft preservation/restoration is visually correct. All of that
//   requires physical-device verification per the standing evidence
//   classification for this stream.
//
// Run with: npx tsx tests/add-anything-sheet-full-workspace.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';

// TEST-INFRASTRUCTURE CORRECTION (Wave 9a verification pass) — this file's
// structural reads were pinned to an absolute path naming one specific
// checkout on one machine. Run from any other worktree that silently reads
// a DIFFERENT
// repository, so a structural assertion could pass against code that is not
// the code under test. Paths now resolve from this file's own location,
// matching the convention design5-add-architecture.test.ts and others
// already use. No product assertion, expected value or production file is
// changed by this correction.
const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);

// DESIGN 5.1 WAVE 3 — signatures widened, behaviour NOT changed.
// enterRoute/reselectOrEnter/chooseAssetTile now take an explicit
// `fromCatalogue` flag so a directly-entered task (quick tile or contextual
// screen action) seeds an EMPTY return stack instead of inheriting
// ['chooser'] — audit D5-001, where a direct quick action's Back revealed a
// catalogue the customer never opened. These assertions match source SHAPE,
// so their patterns are widened to the new signature; every behavioural
// guarantee they protect (first-tap-wins lock, guard-before-transition
// ordering, one-reset-one-transition, chooser-vs-handoff branching) is
// asserted unchanged. No financial, persistence or phase expectation moved.

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync(srcPath('src/components/navigation/AddAnythingSheet.tsx'), 'utf-8');
const FLOATING_ADD_BUTTON_SRC = readFileSync(srcPath('src/components/navigation/FloatingAddButton.tsx'), 'utf-8');
const CONTROLLER_SRC = readFileSync(srcPath('src/components/navigation/addWorkspaceTransitionController.ts'), 'utf-8');
const TRANSFER_FORM_SRC = readFileSync(srcPath('src/components/wealth/TransferForm.tsx'), 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync(srcPath('src/components/wealth/TransferModal.tsx'), 'utf-8');
const ADD_WEALTH_SRC = readFileSync(srcPath('src/components/wealth/AddWealthItemModal.tsx'), 'utf-8');
const ADD_RECURRING_SRC = readFileSync(srcPath('src/components/money/AddRecurringItemModal.tsx'), 'utf-8');
const ADD_INCOME_SRC = readFileSync(srcPath('src/components/income/AddIncomeModal.tsx'), 'utf-8');
const QUICK_ADD_SRC = readFileSync(srcPath('src/components/dashboard/QuickAddModal.tsx'), 'utf-8');
const ADD_CREDIT_CARD_SRC = readFileSync(srcPath('src/components/credit/AddCreditCardModal.tsx'), 'utf-8');
const ADD_GOAL_SRC = readFileSync(srcPath('src/components/goals/AddGoalModal.tsx'), 'utf-8');
const TODAY_SCREEN_SRC = readFileSync(srcPath('src/screens/today/TodayScreen.tsx'), 'utf-8');
const TRANSACTIONS_SCREEN_SRC = readFileSync(srcPath('src/screens/transactions/TransactionsScreen.tsx'), 'utf-8');
const MONEY_SCREEN_SRC = readFileSync(srcPath('src/screens/money/MoneyScreen.tsx'), 'utf-8');

console.log('=== 1. The old dismiss-and-defer fallback is fully retired — no tile opens a second Modal (Class C) ===');
{
  assert(
    "1a. AddAnythingSheet no longer accepts/declares an onSelect prop — checked as real usage syntax (onSelect: / onSelect= / onSelect(), not the bare word, which still legitimately appears in this file's own explanatory retirement comment)",
    !/\bonSelect\s*[:=(]/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '1b. no choose()/runPendingSelection()/handoffInProgressRef/pendingKindRef/androidFallbackTimerRef declaration remains, and ANDROID_DISMISS_FALLBACK_MS is never declared as a const (the bare name may still appear in the explanatory retirement comment, which is fine)',
    !/function choose\(|function runPendingSelection\(|handoffInProgressRef|pendingKindRef|androidFallbackTimerRef|const ANDROID_DISMISS_FALLBACK_MS/.test(ADD_ANYTHING_SRC)
  );
  assert('1c. no dismissAnimationType/onDismiss prop remains on the outer KeyboardSheet (nothing is deferred past this Modal\'s own dismissal anymore)', !/dismissAnimationType/.test(ADD_ANYTHING_SRC) && !/<KeyboardSheet[\s\S]*?onDismiss=/.test(ADD_ANYTHING_SRC));
  // Floating navigation design pass — FLOATING_ADD_BUTTON_SRC now also
  // mounts <QuickActionsTray onSelect={...}> (a genuinely new component,
  // nothing to do with the retired dismiss-and-defer fallback), so 1d's
  // "no onSelect" check below is scoped to ONLY the <AddAnythingSheet .../>
  // JSX block itself, not the whole file.
  //
  // Correction round (modal-stacking device defect) — `visible` is now
  // derived from the pure floatingAddTransition.ts phase machine
  // (`isSheetOpen(phase)`) rather than a separate `sheetVisible` boolean
  // state, specifically so AddAnythingSheet only ever opens once the tray's
  // own close animation has genuinely finished (never racing a still-
  // presented native Modal) — see QuickActionsTray.tsx's and
  // floatingAddTransition.ts's own doc comments for the confirmed root
  // cause this replaces. The literal prop text this assertion pins to
  // changed accordingly; the invariant it protects (no onSelect prop, no
  // retired standalone modal) is unchanged.
  const addAnythingSheetJsxMatch = FLOATING_ADD_BUTTON_SRC.match(/<AddAnythingSheet\b[\s\S]*?\/>/);
  assert(
    '1d. FloatingAddButton.tsx mounts exactly one component from ./AddAnythingSheet, deriving `visible` from the phase machine\'s isSheetOpen (not a raw onSelect callback) — every one of the eight former standalone fallback Modals (AddIncomeModal/QuickAddModal x2/AddRecurringItemModal/AddWealthItemModal x2/TransferModal/AddGoalModal/AddCreditCardModal) is gone from this file. The sheet also receives onlyBalances/initialKind (still not onSelect: quick-actions tray tiles route into a destination via AddAnythingSheet\'s own tile-press entry, not a callback the old dismiss-and-defer fallback used).',
    !!addAnythingSheetJsxMatch &&
      /visible=\{isSheetOpen\(phase\)\}/.test(addAnythingSheetJsxMatch[0]) &&
      (FLOATING_ADD_BUTTON_SRC.match(/<AddAnythingSheet\b/g) || []).length === 1 &&
      !/\bonSelect\s*[:=(]/.test(addAnythingSheetJsxMatch[0]) &&
      !/<AddIncomeModal|<QuickAddModal|<AddRecurringItemModal|<TransferModal|<AddGoalModal|<AddCreditCardModal/.test(FLOATING_ADD_BUTTON_SRC)
  );
  assert(
    '1e. FloatingAddButton.tsx no longer imports any of the eight retired standalone-modal components. Floating navigation design pass — it now legitimately imports AddAnythingKind (to type the quick-actions tray\'s per-tile initialKind selection, see quickActions.ts), which is a different, new capability from the old onSelect callback this assertion originally guarded against.',
    !/AddIncomeModal|QuickAddModal|AddRecurringItemModal|AddWealthItemModal|AddCreditCardModal|AddGoalModal|TransferModal/.test(FLOATING_ADD_BUTTON_SRC)
  );
}

console.log('\n=== 2. ONE shared reducer, ONE shared generation counter, ONE shared progress value drive every destination (Class C) ===');
{
  assert(
    '2a. exactly one useReducer(reduceAddWorkspaceTransition, ...) call exists — not one reducer per destination',
    (ADD_ANYTHING_SRC.match(/useReducer\(reduceAddWorkspaceTransition, initialAddWorkspaceTransitionState\)/g) || []).length === 1
  );
  assert(
    '2b. exactly one generationRef declaration exists (no addAssetGenerationRef/transferGenerationRef split as separate declarations — the names may still appear in the explanatory retirement comment, which is fine)',
    (ADD_ANYTHING_SRC.match(/const generationRef = useRef\(0\);/g) || []).length === 1 &&
      !/const addAssetGenerationRef|const transferGenerationRef/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2c. exactly one workspaceProgress Animated.Value exists — not one per destination pair (chooserTransferProgress/chooserAddAssetProgress no longer declared — the names may still appear in the explanatory retirement comment, which is fine)',
    (ADD_ANYTHING_SRC.match(/const workspaceProgress = useRef\(new Animated\.Value\(0\)\)\.current;/g) || []).length === 1 &&
      !/const chooserTransferProgress|const chooserAddAssetProgress/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2d. runTransition is the one shared animation/reduced-motion primitive, used by both FORWARD (beginForwardTransition) and BACK (backToChooser/handoffToRoute) paths',
    /function runTransition\(direction: 'forward' \| 'back', myGeneration: number, onSettled: \(\) => void\)/.test(ADD_ANYTHING_SRC) &&
      (ADD_ANYTHING_SRC.match(/runTransition\('forward'|runTransition\('back'/g) || []).length === 3
  );
}

console.log("\n=== 3. Tile-to-route mapping — every tile reaches exactly one destination via handleTilePress (Class C) ===");
{
  assert(
    '3a. TILE_TO_ROUTE covers all seven plain 1:1 destinations',
    /income: 'incomeSource'/.test(ADD_ANYTHING_SRC) &&
      /income_received: 'incomeReceived'/.test(ADD_ANYTHING_SRC) &&
      /expense: 'expense'/.test(ADD_ANYTHING_SRC) &&
      /bill: 'bill'/.test(ADD_ANYTHING_SRC) &&
      /liability: 'liability'/.test(ADD_ANYTHING_SRC) &&
      /creditCard: 'creditCard'/.test(ADD_ANYTHING_SRC) &&
      /goal: 'goal'/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '3b. ASSET_PRESET_MAP still covers all five asset tiles, values unchanged from the Option B pilot',
    /cash: 'cash'/.test(ADD_ANYTHING_SRC) &&
      /savings: 'savings'/.test(ADD_ANYTHING_SRC) &&
      /investment: 'etf'/.test(ADD_ANYTHING_SRC) &&
      /property: 'property'/.test(ADD_ANYTHING_SRC) &&
      /retirement: 'super'/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '3c. handleTilePress dispatches: asset presets -> chooseAssetTile (its own global-guard-then-decision path), transfer -> a dirty-check into presentSwitchGuard or enterTransfer directly, every other tile -> reselectOrEnter via TILE_TO_ROUTE — a single, exhaustive dispatch table, not one handler per tile',
    /function handleTilePress\(key: AddAnythingKind, fromCatalogue = true\) \{\s*\n\s*const assetPresetType = ASSET_PRESET_MAP\[key\];\s*\n\s*if \(assetPresetType\) \{\s*\n\s*chooseAssetTile\(key, fromCatalogue\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*if \(key === 'transfer'\) \{\s*\n\s*const dirty = findParkedDirtyDraft\(\);\s*\n\s*if \(dirty\) \{\s*\n\s*presentSwitchGuard\(/.test(ADD_ANYTHING_SRC)
  );
  assert('3d. every tile onPress calls handleTilePress(o.key) — one call site, not a per-tile inline branch', /onPress=\{\(\) => handleTilePress\(o\.key\)\}/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 4. Rapid-tap locking — every entry/handoff path checks selectionLockRef before doing anything else (Class C) ===');
{
  assert('4a. enterRoute checks selectionLockRef first, synchronously, before onCommit/beginForwardTransition', /function enterRoute\(route: AddWorkspaceRoute, fromCatalogue: boolean, onCommit\?: \(\) => void\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins\s*\n\s*selectionLockRef\.current = true;/.test(ADD_ANYTHING_SRC));
  assert('4b. proceedIntoAddAsset (Asset\'s own entry point) checks the SAME selectionLockRef first', /function proceedIntoAddAsset\(tileKey: AddAnythingKind, presetType: AssetType, freshInstance: boolean, fromCatalogue: boolean\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins/.test(ADD_ANYTHING_SRC));
  assert('4c. backToChooser and handoffToRoute each have their own dedicated returningToChooserRef re-entrancy guard (cannot reuse selectionLockRef, which is legitimately still held)', (ADD_ANYTHING_SRC.match(/if \(returningToChooserRef\.current\) return;/g) || []).length === 2);
  assert(
    '4d. handoffToRoute deliberately does NOT check/release selectionLockRef between its BACK and FORWARD halves — the lock stays continuously held for the whole handoff (no interactive chooser rest state in between)',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function handoffToRoute(');
      const end = ADD_ANYTHING_SRC.indexOf('\n  // Bill\'s own', start);
      const body = ADD_ANYTHING_SRC.slice(start, end);
      return !body.includes('selectionLockRef');
    })()
  );
}

console.log('\n=== 5. Stale-completion protection — every transition completion is guarded by its own captured generation (Class C) ===');
{
  assert(
    '5a. runTransition\'s animated-path completion callback compares myGeneration against generationRef.current before calling onSettled',
    /Animated\.timing\(workspaceProgress, \{ toValue, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true \}\)\.start\(\(\) => \{\s*\n\s*if \(myGeneration !== generationRef\.current\) return; \/\/ stale-completion guard/.test(ADD_ANYTHING_SRC)
  );
  assert('5b. the accessibility focus-consumption effect independently re-checks the SAME generation before acting (a second, later guard beyond runTransition\'s own)', /if \(pending\.generation !== generationRef\.current\) return; \/\/ stale — superseded since it was scheduled/.test(ADD_ANYTHING_SRC));
  assert('5c. handleRequestClose (the whole-sheet dismiss path) bumps generationRef, invalidating any in-flight transition before closing', /function handleRequestClose\(\) \{\s*\n\s*generationRef\.current\+\+;\s*\n\s*pendingFocusRef\.current = null;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
  assert('5d. handleSaveSuccessClose (every destination\'s successful-Save path, which bypasses handleRequestClose entirely) independently bumps the SAME generationRef and clears pendingFocusRef', /function handleSaveSuccessClose\(\) \{\s*\n\s*generationRef\.current\+\+;\s*\n\s*pendingFocusRef\.current = null;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 6. Reduced Motion — every transition replaces the animation with an immediate content swap, never skipped (Class C) ===');
{
  assert(
    '6a. runTransition\'s reduceMotionEnabled branch sets workspaceProgress directly to the target value and calls onSettled synchronously, with no Animated.timing call in that branch',
    /if \(reduceMotionEnabled\) \{\s*\n\s*workspaceProgress\.setValue\(toValue\);\s*\n\s*onSettled\(\);\s*\n\s*return;\s*\n\s*\}/.test(ADD_ANYTHING_SRC)
  );
  assert('6b. reduceMotionEnabled is tracked via AccessibilityInfo.isReduceMotionEnabled() at mount and kept live via the reduceMotionChanged listener, unchanged from the Option B pilot', /AccessibilityInfo\.isReduceMotionEnabled\(\)\.then/.test(ADD_ANYTHING_SRC) && /AccessibilityInfo\.addEventListener\('reduceMotionChanged', setReduceMotionEnabled\)/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 7. Inactive-layer pointer/accessibility hiding — every layer, chooser included (Class C) ===');
{
  assert(
    '7a. renderDestinationLayer gates pointerEvents/accessibilityElementsHidden/importantForAccessibility on isRouteSettledFront — interactive and visible to assistive tech ONLY while genuinely the settled front step',
    /const settled = isRouteSettledFront\(transition, route\);[\s\S]{0,300}?pointerEvents=\{settled \? 'auto' : 'none'\}\s*\n\s*accessibilityElementsHidden=\{!settled\}\s*\n\s*importantForAccessibility=\{settled \? 'auto' : 'no-hide-descendants'\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "7b. the chooser layer uses the exact same isRouteSettledFront(transition, 'chooser') gate for its own pointerEvents/accessibility props",
    /pointerEvents=\{isRouteSettledFront\(transition, 'chooser'\) \? 'auto' : 'none'\}/.test(ADD_ANYTHING_SRC) &&
      /accessibilityElementsHidden=\{!isRouteSettledFront\(transition, 'chooser'\)\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "7c. a destination not currently the transition's active side is pinned fully off-screen via stationaryOffscreenTranslateX (a live, memoized, constant-valued interpolation — round 2 of the nested-handoff geometry correction replaced the plain viewportWidth number this used to be, after the plain-number version was confirmed on physical device to cause the exiting sibling to fail to visibly animate away) rather than sharing the live animated position of an unrelated active transition",
    /function destinationTranslateX\(route: Exclude<AddWorkspaceRoute, 'chooser'>\) \{[\s\S]{0,400}?return stationaryOffscreenTranslateX;\s*\n\s*\}/.test(ADD_ANYTHING_SRC) &&
      /const translateX = destinationTranslateX\(route\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "7d. nested-handoff geometry correction, round 2 — a route becoming current via a cross-destination BACK (never through chooser) is pinned to stationaryOnscreenTranslateX (a live, memoized, constant-0 interpolation, never a bare number) rather than reusing activeDestinationTranslateX, which would otherwise rest at viewportWidth (fully off-screen) once settled",
    /if \(transition\.current === route\) return transition\.direction === 'back' \? stationaryOnscreenTranslateX : activeDestinationTranslateX;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '7e. all four geometry interpolations (chooserTranslateX, activeDestinationTranslateX, stationaryOnscreenTranslateX, stationaryOffscreenTranslateX) are memoized via useMemo — never recreated as fresh objects on every unrelated re-render, which round 2 of this correction identified as the likely mechanism behind the round-1 fix passing every automated test yet still failing on the physical device',
    (ADD_ANYTHING_SRC.match(/= useMemo\(\(\) => workspaceProgress\.interpolate\(/g) || []).length === 4
  );
}

console.log('\n=== 8. Draft preservation across Back — every destination except Transfer (Class C) ===');
{
  assert(
    '8a. all eight persistent destinations (asset + the seven newly-embedded) mount purely on their own everEnteredRef.current, read directly at render time — never reset by handleBack (Back is always non-destructive)',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function handleBack()');
      const end = ADD_ANYTHING_SRC.indexOf('\n  // Full-workspace extension — the two cross-destination handoffs', start);
      const body = ADD_ANYTHING_SRC.slice(start, end);
      return !/everEnteredRef\.current = false/.test(body);
    })()
  );
  assert(
    "8b. Transfer's own layer mount condition is isRouteActiveInTransition(transition, 'transfer') — NOT an everEnteredRef — matching its explicit Phase 2 exclusion from draft preservation (unmounts once Back genuinely completes)",
    /renderDestinationLayer\(\s*\n\s*'transfer',\s*\n\s*isRouteActiveInTransition\(transition, 'transfer'\),/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '8c. every one of the seven newly-embedded destinations DOES use its own everEnteredRef.current as its renderDestinationLayer mount condition — draft preserved across Back',
    ['expenseState', 'incomeReceivedState', 'incomeSourceState', 'billState', 'liabilityState', 'creditCardState', 'goalState'].every((name) =>
      new RegExp(`${name}\\.everEnteredRef\\.current,\\s*\\n\\s*${name}\\.headingRef,`).test(ADD_ANYTHING_SRC)
    )
  );
  assert(
    "8d. the fresh-open (RESET) effect loops over all eight persistent destinations via draftStateFor, resetting everEnteredRef/canSave/isDirty/title/instanceKey for each — a genuinely fresh sheet-open never carries over a prior session's draft",
    /state\.everEnteredRef\.current = false;\s*\n\s*state\.setCanSave\(false\);\s*\n\s*state\.setIsDirty\(false\);\s*\n\s*state\.setTitle\(initialTitles\[route\]\);\s*\n\s*state\.setInstanceKey\(\(k\) => k \+ 1\);/.test(ADD_ANYTHING_SRC) &&
      /const initialTitles: Record<Exclude<AddWorkspaceRoute, 'chooser' \| 'transfer'>, string> = \{\s*\n\s*asset: 'Add asset',\s*\n\s*expense: 'Add transaction',\s*\n\s*incomeSource: 'Add income source',\s*\n\s*incomeReceived: 'Add transaction',\s*\n\s*bill: 'Add a bill',\s*\n\s*liability: 'Add liability',\s*\n\s*creditCard: 'Add credit card',\s*\n\s*goal: 'Add a goal',\s*\n\s*\};/.test(ADD_ANYTHING_SRC)
  );
}

console.log("\n=== 9. \"Reselecting the same destination restores; a different one while dirty confirms\" — generalised (Class C) ===");
{
  assert(
    '9a. reselectOrEnter restores an already-entered destination directly (no guard) and only routes a genuinely-new entry through the presentSwitchGuard-based dirty check',
    /function reselectOrEnter\(route: Exclude<AddWorkspaceRoute, 'chooser' \| 'transfer' \| 'asset'>, fromCatalogue: boolean\) \{[\s\S]{0,300}?if \(state\.everEnteredRef\.current\) \{\s*\n\s*enterRoute\(route, fromCatalogue, commit\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*const dirty = findParkedDirtyDraft\(\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "9b. presentSwitchGuard's caller in reselectOrEnter checks ALL eight draft-holding destinations (via draftDestinations/findParkedDirtyDraft) — not just Asset's own dirty state as the Option B pilot's guardNavigateAwayFromAddAsset did",
    /function findParkedDirtyDraft\(excludeRoute\?: AddWorkspaceRoute\) \{\s*\n\s*return draftDestinations\(\)\.find/.test(ADD_ANYTHING_SRC) &&
      /function draftDestinations\(\)[\s\S]{0,400}?'asset', 'expense', 'incomeSource', 'incomeReceived', 'bill', 'liability', 'creditCard', 'goal'/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "9c. the confirmation copy is looked up per-destination via routeDisplayName, not one generic message for every case, and presented through presentSwitchGuard (Keep editing reopens the source; Discard & continue resets it once and proceeds once)",
    /presentSwitchGuard\(\s*\n\s*routeDisplayName\(dirty\.route\),\s*\n\s*routeDisplayName\(route\),\s*\n\s*\(\) => reopenSource\(dirty\.route\),\s*\n\s*\(\) => \{\s*\n\s*resetDraft\(dirty\.route\);\s*\n\s*enterRoute\(route, fromCatalogue, commit\);/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 10. Cross-destination handoffs (Bill -> Liability, Liability -> Credit card) — no defer/timer dance, narrowly discard-guarded, correct return routing (Class C) ===');
{
  assert(
    "10a. handoffToRoute is a FORCE_TO_CHOOSER immediately chained into a FORWARD (passing an explicit [leavingRoute, ...inheritedStack] returnStack through — nested-handoff amendment) using the same accepted reducer contract — no setTimeout/Modal-dismiss dance anywhere in it",
    /function handoffToRoute\(nextRoute: AddWorkspaceRoute, prepare: \(\) => void\) \{[\s\S]{0,500}?beginForwardTransition\(nextRoute, \[leavingRoute, \.\.\.inheritedStack\]\);\s*\n\s*\}\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC) &&
      (() => {
        const start = ADD_ANYTHING_SRC.indexOf('function handoffToRoute(');
        const end = ADD_ANYTHING_SRC.indexOf('\n  // Bill\'s own', start);
        return !/setTimeout/.test(ADD_ANYTHING_SRC.slice(start, end));
      })()
  );
  assert(
    "10a2. Bill's handoff calls the 2-arg handoffToRoute('liability', prepare) and Liability's handoff calls the 2-arg handoffToRoute('creditCard', prepare) — the reducer itself derives the correct returnStack from handoffToRoute's own captured leavingRoute/inheritedStack, not a literal string passed by each call site (nested-handoff amendment, replacing the prior single-level returnTo design)",
    /handoffToRoute\('liability', \(\) => \{/.test(ADD_ANYTHING_SRC) && /handoffToRoute\('creditCard', \(\) => \{/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "10b. <AddRecurringItemModal> (Bill) is wired with onRequestLoan={handleRequestLoanFromBill} — the embedded equivalent of the standalone onSelectLoan handoff",
    /<AddRecurringItemModal\s*\n\s*key=\{billState\.instanceKey\}\s*\n\s*ref=\{billModalRef\}\s*\n\s*visible\s*\n\s*embedded\s*\n\s*onRequestLoan=\{handleRequestLoanFromBill\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "10c. <AddWealthItemModal kind=\"liability\"> is wired with onRequestCreditCard={handleRequestCreditCardFromLiability} — the embedded equivalent of the standalone onSelectCreditCard handoff",
    /kind="liability"[\s\S]{0,300}?onRequestCreditCard=\{handleRequestCreditCardFromLiability\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "10d. handleRequestLoanFromBill narrowly guards against silently overwriting an existing, separately-dirty parked draft of a DIFFERENT loan type before proceeding — via presentSwitchGuard (reopen on Keep editing, reset-once on Discard & continue) — but correction pass: re-tapping the SAME loan type that is already the dirty parked draft is a same-destination reselect, not a switch, and falls straight through instead. handleRequestCreditCardFromLiability has no guard at all (correction pass) — Credit Card has no type variants, so its own dirty-parked draft can only ever be itself, never a DIFFERENT one to protect against",
    /function handleRequestLoanFromBill\(type: LiabilityType\) \{[\s\S]{0,900}?if \(liabilityState\.everEnteredRef\.current && liabilityState\.isDirty && liabilityHandoffType !== type\) \{\s*\n\s*presentSwitchGuard\(/.test(ADD_ANYTHING_SRC) &&
      /function handleRequestCreditCardFromLiability\(\) \{\s*\n\s*handoffToRoute\('creditCard', \(\) => \{\s*\n\s*creditCardState\.everEnteredRef\.current = true;\s*\n\s*\}\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '10e. a genuinely fresh "Add liability" tile tap clears any stale handoff preset before entering — the plain tile is never silently inherited a stale handoff type',
    /if \(route === 'liability' && !liabilityState\.everEnteredRef\.current\) \{[\s\S]{0,400}?setLiabilityHandoffType\(null\);/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 11. Standalone callers of every newly-embedded component are unaffected — embedded prop never passed outside AddAnythingSheet (Class C) ===');
{
  const standaloneCallers: [string, string][] = [
    ['TodayScreen.tsx', TODAY_SCREEN_SRC],
    ['TransactionsScreen.tsx', TRANSACTIONS_SCREEN_SRC],
    ['MoneyScreen.tsx', MONEY_SCREEN_SRC],
  ];
  for (const [name, src] of standaloneCallers) {
    assert(
      `11. ${name} never passes embedded to any AddIncomeModal/QuickAddModal/AddRecurringItemModal/AddCreditCardModal/AddGoalModal/AddWealthItemModal instance`,
      !/<(AddIncomeModal|QuickAddModal|AddRecurringItemModal|AddCreditCardModal|AddGoalModal|AddWealthItemModal)[\s\S]{0,400}?\bembedded\b/.test(src)
    );
  }
}

console.log('\n=== 12. Existing save paths remain the only save implementations — the host never calls a persistence function directly (Class C) ===');
{
  assert(
    '12a. AddAnythingSheet.tsx itself never calls addTransaction/addRecurringItem/addGoal/addAsset/updateAsset/addRecurringIncomeWithMidCycleOccurrence or any other AppStateContext mutator directly — every Save goes through a destination\'s own requestSave() imperative handle',
    !/\baddTransaction\(|\baddRecurringItem\(|\baddGoal\(|\baddAsset\(|\bupdateAsset\(|\baddLiability\(|\baddRecurringIncomeWithMidCycleOccurrence\(/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '12b. callActiveSave dispatches exclusively to each destination\'s own .current?.requestSave() — a switch over transition.current, never a re-implemented save',
    (ADD_ANYTHING_SRC.match(/ModalRef\.current\?\.requestSave\(\);|FormRef\.current\?\.requestSave\(\);/g) || []).length === 9
  );
}

console.log('\n=== 13. Every one of the seven newly-embedded destination components still exports the shared EmbeddedStepHandle contract, unchanged from their own embedding work (Class C) ===');
{
  const components: [string, string][] = [
    ['AddRecurringItemModal.tsx (Bill)', ADD_RECURRING_SRC],
    ['AddIncomeModal.tsx (Income source)', ADD_INCOME_SRC],
    ['QuickAddModal.tsx (Expense/Income received)', QUICK_ADD_SRC],
    ['AddCreditCardModal.tsx', ADD_CREDIT_CARD_SRC],
    ['AddGoalModal.tsx', ADD_GOAL_SRC],
  ];
  for (const [name, src] of components) {
    assert(`13. ${name} still imports EmbeddedStepHandle/EmbeddedCloseReason from the shared controller module`, /from '..\/navigation\/addWorkspaceTransitionController'/.test(src));
  }
}

console.log('\n=== 14. Asset (Option B pilot) behaviour genuinely unchanged, just replumbed onto the shared reducer (Class C) ===');
{
  assert(
    '14a. chooseAssetTile still computes its outcome via the real, imported decideAssetTileSelection — not a re-implemented inline copy',
    /const outcome = decideAssetTileSelection\(\{\s*\n\s*everEntered: assetState\.everEnteredRef\.current,\s*\n\s*currentPresetType: assetPresetType,\s*\n\s*selectedPresetType: presetType,\s*\n\s*isDirty: assetState\.isDirty,\s*\n\s*\}\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '14b. proceedIntoAddAsset only bumps assetState\'s instanceKey (forcing a fresh AddWealthItemModal remount) when explicitly told to — never on a same-type restore',
    /if \(freshInstance\) \{\s*\n\s*assetState\.setInstanceKey\(\(k\) => k \+ 1\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC)
  );
  assert('14c. the embedded Asset AddWealthItemModal is keyed on assetState.instanceKey', /key=\{assetState\.instanceKey\}\s*\n\s*ref=\{assetModalRef\}/.test(ADD_ANYTHING_SRC));
  assert(
    '14d. confirmSwitchAssetType still uses the exact required wording ("Switch asset type?" / "Continue editing" / "Discard and switch") — Asset\'s own same-route type-switching keeps its already-accepted copy, distinct from the newer cross-destination "Switch to X?" wording',
    /Alert\.alert\('Switch asset type\?', 'Your current asset details will be discarded\.', \[\s*\n\s*\{ text: 'Continue editing', style: 'cancel', onPress: onContinueEditing \},\s*\n\s*\{ text: 'Discard and switch', style: 'destructive', onPress: onDiscardAndSwitch \},/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '14e. chooseAssetTile\'s inner type-vs-type decision (proceedWithAssetTileDecision) is preserved exactly as the already-tested Option B pilot logic, unchanged by this correction',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function proceedWithAssetTileDecision(tileKey: AddAnythingKind, presetType: AssetType, fromCatalogue: boolean)');
      const end = ADD_ANYTHING_SRC.indexOf('\n  // Successful Save', start);
      const body = ADD_ANYTHING_SRC.slice(start, end === -1 ? undefined : end);
      return /decideAssetTileSelection/.test(body) && !/presentSwitchGuard/.test(body);
    })()
  );
  assert(
    "14f. discard-orchestration correction, item 7 — the previously-disclosed Asset gap is now closed: chooseAssetTile checks findParkedDirtyDraft('asset') (excluding Asset's own dirty state, a separate concern) BEFORE reaching the inner decision, and presents the same presentSwitchGuard confirmation every other tile uses when some OTHER destination is dirty",
    /function chooseAssetTile\(tileKey: AddAnythingKind, fromCatalogue: boolean\) \{[\s\S]{0,300}?const otherDirty = findParkedDirtyDraft\('asset'\);\s*\n\s*if \(otherDirty\) \{\s*\n\s*presentSwitchGuard\(/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 15. Transfer\'s Move Money logic is completely untouched by this extension (Class C) ===');
{
  assert('15a. TransferForm.tsx has no full-workspace-extension marker beyond its own genuinely-relevant, already-accepted comment referencing this file', !/addWorkspaceTransitionController|reduceAddWorkspaceTransition/.test(TRANSFER_FORM_SRC.replace(/\/\/[^\n]*\n/g, '')));
  assert('15b. TransferModal.tsx is untouched — no reference to the new reducer/route types', !/AddWorkspaceRoute|reduceAddWorkspaceTransition/.test(TRANSFER_MODAL_SRC));
  assert(
    "15c. Transfer's own financial transferFunds save logic is never called from AddAnythingSheet.tsx directly — only via transferFormRef.current?.requestSave()",
    !/transferFunds\(/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 16. The transition controller module is genuinely pure — no React/RN import (Class C) ===');
{
  assert('16a. addWorkspaceTransitionController.ts imports nothing from "react"', !/from ['"]react['"]/.test(CONTROLLER_SRC));
  assert('16b. addWorkspaceTransitionController.ts imports nothing from "react-native"', !/from ['"]react-native['"]/.test(CONTROLLER_SRC));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
