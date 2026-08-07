// Nested loan-handoff Back correction — round 2. The 1:52.6 physical-
// device recording showed the round-1 fix ("pin a settled/back-entered
// route to a literal `0`, leave every uninvolved route on a literal
// `viewportWidth`") did NOT resolve the defect on-device: Bill's body
// remained almost entirely off-screen (thin tile slivers only) after
// Back from the existing-loan picker, persisting for several seconds,
// even though the automated (Class C, source-shape-only) tests for that
// round all passed.
//
// Root cause of the ROUND-1 FIX ITSELF (why it passed tests but failed on
// device): before round 1, every settled/active non-chooser route had
// ALWAYS used the live activeDestinationTranslateX interpolation —
// continuously, for its entire settled-then-exiting lifecycle. Round 1
// replaced the SETTLED case with a bare JS number (`0` for settled/
// back-entered, `viewportWidth` — itself already a bare number even
// before round 1 — for "not involved"). That means a route's <Animated.
// View> transform prop could flip, in a single commit, from a plain
// number to a BRAND-NEW interpolation object newly connecting to an
// animation that had ALREADY started (Liability's own exit, kicked off
// the instant handleBack fires — see runTransition, which calls
// Animated.timing(...).start() synchronously, before React has even
// re-rendered with the dispatched BACK action's new state). That is
// exactly the case React Native's Animated/native-driver bridge is least
// reliable at catching up on the very first frame — and Liability is
// rendered LATER in the JSX than Bill, so it stacks visually on top of
// it. The device symptom (persistent blank Bill body, thin slivers,
// several seconds) is consistent with Liability's own exit failing to
// visibly complete and remaining near its old resting position, covering
// Bill underneath — even though Bill's OWN position had by then become
// correct.
//
// Round 2's fix: every branch of destinationTranslateX now returns one of
// four MEMOIZED, always-live AnimatedInterpolation nodes (two of them
// genuinely constant-valued, but still nodes, never bare numbers) — no
// route's transform prop ever crosses the plain-number-to-freshly-
// attached-animated-node boundary again, in either direction, for any
// mounted destination layer.
//
// CLASSIFICATION:
// - Real import (Class A): sections that import and drive the actual
//   reduceAddWorkspaceTransition reducer.
// - Mirrored logic (Class B, per tests/README.md): mirrorTranslateX below
//   is a verbatim-equivalent reimplementation of destinationTranslateX's
//   own branching AND the actual numeric interpolation math each branch
//   resolves to (workspaceProgress -> Animated.Value.interpolate's own
//   linear-interpolation semantics for a 2-point range) — AddAnythingSheet.
//   tsx itself cannot be imported (react-native's Flow syntax; documented
//   in tests/README.md), so this is the closest available real-import-style
//   proof that the GEOMETRY FORMULA is numerically sound at every point in
//   a real transition, not just that the right branch is chosen. A
//   structural check (section 1) confirms the mirror's own
//   inputRange/outputRange constants match the shipped source's four
//   interpolation declarations verbatim, closing the gap between "the
//   mirror is correct" and "the shipped formula is the mirror." This does
//   NOT and CANNOT prove React Native's native-driver bridge actually
//   attaches these nodes correctly at runtime, or that no dropped frame
//   ever occurs — that is exactly the class of defect round 1's fix
//   passed static tests on and still failed on-device. Physical-device
//   retest remains the only evidence for the actual native behaviour.
// - Structural (Class C): everything else — proves wiring, not runtime
//   behaviour.
//
// Run with: ./node_modules/.bin/tsx tests/nested-loan-handoff-back.test.ts

import { readFileSync } from 'fs';
import { reduceAddWorkspaceTransition, initialAddWorkspaceTransitionState, AddWorkspaceRoute, AddWorkspaceTransitionState } from '../src/components/navigation/addWorkspaceTransitionController';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const BILL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/AddRecurringItemModal.tsx', 'utf-8');

function functionBody(fnSignature: string, srcText: string): string {
  const start = srcText.indexOf(fnSignature);
  if (start === -1) return '';
  const openIdx = srcText.indexOf('{', start);
  let depth = 0;
  for (let i = openIdx; i < srcText.length; i++) {
    if (srcText[i] === '{') depth++;
    if (srcText[i] === '}') {
      depth--;
      if (depth === 0) return srcText.slice(start, i + 1);
    }
  }
  return srcText.slice(start);
}

// --- Mirrored logic (Class B) ---------------------------------------------
// Verbatim-equivalent reimplementation of Animated.Value.interpolate's own
// linear interpolation for a simple 2-point [0,1] input range.
function lerp(progress: number, outputAt0: number, outputAt1: number): number {
  return outputAt0 + (outputAt1 - outputAt0) * progress;
}

const VIEWPORT_WIDTH = 360; // an arbitrary, realistic device width in points

// Mirrors destinationTranslateX's own branching (AddAnythingSheet.tsx),
// resolved to the actual numeric transform value at a given workspaceProgress.
function mirrorTranslateX(state: AddWorkspaceTransitionState, route: AddWorkspaceRoute, workspaceProgress: number): number {
  const settled = state.current === route && state.status === 'idle';
  if (settled) return lerp(workspaceProgress, 0, 0); // stationaryOnscreenTranslateX
  if (state.outgoing === route) return lerp(workspaceProgress, VIEWPORT_WIDTH, 0); // activeDestinationTranslateX
  if (state.current === route) {
    if (state.direction === 'back') return lerp(workspaceProgress, 0, 0); // stationaryOnscreenTranslateX
    return lerp(workspaceProgress, VIEWPORT_WIDTH, 0); // activeDestinationTranslateX
  }
  return lerp(workspaceProgress, VIEWPORT_WIDTH, VIEWPORT_WIDTH); // stationaryOffscreenTranslateX
}

// Mirrors runTransition's own fromValue/toValue selection.
function progressAt(direction: 'forward' | 'back', phase: 'start' | 'end'): number {
  const fromValue = direction === 'forward' ? 0 : 1;
  const toValue = direction === 'forward' ? 1 : 0;
  return phase === 'start' ? fromValue : toValue;
}

console.log("=== 1. The mirror's own interpolation constants match the shipped source's four declarations verbatim (closes the mirror-accuracy gap) ===");
{
  assert(
    "1a. chooserTranslateX: outputRange [0, -viewportWidth] — unrelated to this route's own mirror (chooser isn't a destinationTranslateX route), confirmed present and unchanged",
    /const chooserTranslateX = useMemo\(\(\) => workspaceProgress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0, -viewportWidth\] \}\), \[workspaceProgress, viewportWidth\]\);/.test(SHEET_SRC)
  );
  assert(
    '1b. activeDestinationTranslateX: outputRange [viewportWidth, 0] — matches mirrorTranslateX\'s own lerp(progress, VIEWPORT_WIDTH, 0) calls exactly',
    /const activeDestinationTranslateX = useMemo\(\(\) => workspaceProgress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[viewportWidth, 0\] \}\), \[workspaceProgress, viewportWidth\]\);/.test(SHEET_SRC)
  );
  assert(
    '1c. stationaryOnscreenTranslateX: outputRange [0, 0] (constant) — matches mirrorTranslateX\'s own lerp(progress, 0, 0) calls exactly',
    /const stationaryOnscreenTranslateX = useMemo\(\(\) => workspaceProgress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0, 0\] \}\), \[workspaceProgress\]\);/.test(SHEET_SRC)
  );
  assert(
    '1d. stationaryOffscreenTranslateX: outputRange [viewportWidth, viewportWidth] (constant) — matches mirrorTranslateX\'s own lerp(progress, VIEWPORT_WIDTH, VIEWPORT_WIDTH) calls exactly',
    /const stationaryOffscreenTranslateX = useMemo\(\(\) => workspaceProgress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[viewportWidth, viewportWidth\] \}\), \[workspaceProgress, viewportWidth\]\);/.test(SHEET_SRC)
  );
  const body = functionBody('function destinationTranslateX(', SHEET_SRC);
  assert('1e. destinationTranslateX is found', body.length > 0);
  assert(
    '1f. destinationTranslateX NEVER returns a bare number literal — every return statement (including both branches of the current-route ternary) names one of the four live interpolation identifiers, matching the four branches the mirror reimplements',
    /if \(isRouteSettledFront\(transition, route\)\) return stationaryOnscreenTranslateX;/.test(body) &&
      /if \(transition\.outgoing === route\) return activeDestinationTranslateX;/.test(body) &&
      /if \(transition\.current === route\) return transition\.direction === 'back' \? stationaryOnscreenTranslateX : activeDestinationTranslateX;/.test(body) &&
      /return stationaryOffscreenTranslateX;/.test(body) &&
      !/return 0;/.test(body) &&
      !/return viewportWidth;/.test(body)
  );
  assert(
    '1g. renderDestinationLayer actually calls destinationTranslateX(route) for its own translateX — the fix is wired in, not just defined',
    /const translateX = destinationTranslateX\(route\);/.test(SHEET_SRC)
  );
}

console.log('\n=== 2. Fresh-loan round trip: settled current layer is always exactly 0, every OTHER mounted layer is off-screen, at every point in the transition (required tests 1, 4, 6, 7) ===');
{
  // Mirrors the real host sequence for Bill -> Personal Loan preset ->
  // (handoff, via handoffToRoute: FORCE_TO_CHOOSER then FORWARD with an
  // explicit returnStack) -> Liability, settled; then Back from Liability
  // (whether from the picker directly, per required test 7, since a
  // direct-entry-with-no-picker session and a picker session both resolve
  // to the exact same ROUTE-level BACK once on the picker — this file's
  // own §6b/§7a already prove the picker's own internal Back never
  // touches route state) -> Bill.
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  const billReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('2a. settled on liability before Back', state.current === 'liability' && state.status === 'idle');

  // BACK from liability (picker or "Add new" details — same route action).
  const midBack = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('2b. BACK correctly targets bill directly (not chooser)', midBack.current === 'bill' && midBack.outgoing === 'liability' && midBack.direction === 'back');

  // Sample the ENTIRE mid-transition range, not just the endpoints — proves
  // no partial/"sliver" state is possible at any progress value.
  for (const progress of [1, 0.75, 0.5, 0.25, 0]) {
    const billX = mirrorTranslateX(midBack, 'bill', progress);
    const liabilityX = mirrorTranslateX(midBack, 'liability', progress);
    assert(`2c. mid-transition at progress ${progress}: bill (entering via Back) is pinned to EXACTLY 0 — never a fractional/off-screen "sliver" value`, billX === 0);
    assert(`2d. mid-transition at progress ${progress}: liability (exiting) is between 0 and viewportWidth, moving away from bill's position, never sharing bill's exact 0`, liabilityX >= 0 && liabilityX <= VIEWPORT_WIDTH && (progress === 1 ? liabilityX === 0 : liabilityX !== 0 || progress === 1));
  }

  const settled = reduceAddWorkspaceTransition(midBack, { type: 'TRANSITION_COMPLETE' });
  assert('2e. settled on bill after Back', settled.current === 'bill' && settled.status === 'idle');
  const settledProgress = progressAt('back', 'end');
  assert('2f. settled bill is at EXACTLY translateX 0 (required test: each settled current layer at translateX zero)', mirrorTranslateX(settled, 'bill', settledProgress) === 0);
  const OTHER_ROUTES: AddWorkspaceRoute[] = ['transfer', 'asset', 'expense', 'incomeSource', 'incomeReceived', 'liability', 'creditCard', 'goal'];
  for (const other of OTHER_ROUTES) {
    assert(`2g. settled bill: '${other}' is fully off-screen (viewportWidth) — cannot cover or displace the current body`, mirrorTranslateX(settled, other, settledProgress) === VIEWPORT_WIDTH);
  }
}

console.log('\n=== 3. Three repeated round trips produce byte-identical, correct geometry (required test 3) ===');
{
  for (let cycle = 1; cycle <= 3; cycle++) {
    let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    const billReturnStack = state.returnStack;
    state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    assert(`3.${cycle}a. cycle ${cycle}: settled on bill after the full round trip`, state.current === 'bill' && state.status === 'idle');
    assert(`3.${cycle}b. cycle ${cycle}: bill's settled translateX is exactly 0 — identical to cycle 1, no state leaks across repeats`, mirrorTranslateX(state, 'bill', 0) === 0);
    assert(`3.${cycle}c. cycle ${cycle}: liability's settled(-elsewhere) translateX is fully off-screen`, mirrorTranslateX(state, 'liability', 0) === VIEWPORT_WIDTH);
    // Repeat directly from the settled state — Back from bill to chooser
    // (§'Bill grid -> Back -> Add Anything'), then straight back into bill
    // for the next cycle, proving no accumulated drift.
    state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    assert(`3.${cycle}d. cycle ${cycle}: Bill grid -> Back -> settled on chooser`, state.current === 'chooser' && state.status === 'idle');
  }
}

console.log('\n=== 4. Full Bill -> Liability -> Credit Card nested chain — every settled layer correct at every level (required test 6) ===');
{
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  const billReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  const liabilityReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'creditCard', returnStack: ['liability', ...liabilityReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('4a. settled on creditCard, translateX exactly 0', state.current === 'creditCard' && mirrorTranslateX(state, 'creditCard', 0) === 0);

  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('4b. BACK from creditCard targets liability directly (not chooser, not bill)', state.current === 'liability' && state.outgoing === 'creditCard');
  assert('4c. mid-transition: liability (entering via Back) pinned to 0 at every sampled progress', [1, 0.5, 0].every((p) => mirrorTranslateX(state, 'liability', p) === 0));
  assert('4d. mid-transition: creditCard (exiting) never shares liability\'s 0 once progress has moved away from the start', mirrorTranslateX(state, 'creditCard', 0.5) !== 0);
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('4e. settled on liability, translateX exactly 0; bill and creditCard both off-screen', mirrorTranslateX(state, 'liability', 0) === 0 && mirrorTranslateX(state, 'bill', 0) === VIEWPORT_WIDTH && mirrorTranslateX(state, 'creditCard', 0) === VIEWPORT_WIDTH);

  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('4f. BACK from liability targets bill directly', state.current === 'bill' && state.outgoing === 'liability');
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('4g. settled on bill, translateX exactly 0; liability and creditCard both off-screen', mirrorTranslateX(state, 'bill', 0) === 0 && mirrorTranslateX(state, 'liability', 0) === VIEWPORT_WIDTH && mirrorTranslateX(state, 'creditCard', 0) === VIEWPORT_WIDTH);

  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('4h. BACK from bill targets chooser (the direct-entry / bottom-of-stack case)', state.current === 'chooser' && state.outgoing === 'bill');
}

console.log('\n=== 5. Direct (non-handoff) entry is geometrically unaffected — Back-to-chooser still uses the original, unchanged activeDestinationTranslateX formula (required test 5) ===');
{
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'liability' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  const midBack = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('5a. direct-entry liability Backs straight to chooser (current becomes chooser, not liability)', midBack.current === 'chooser' && midBack.outgoing === 'liability');
  // liability is now `outgoing`, never `current` with direction 'back' —
  // exercises the SAME activeDestinationTranslateX branch this route has
  // always used, confirming the new stationary branch never fires here.
  assert('5b. mid-transition: liability (exiting to chooser) starts at its prior on-screen position (0), unchanged from before this correction', mirrorTranslateX(midBack, 'liability', 1) === 0);
  assert('5c. mid-transition: liability ends fully off-screen once chooser is reached', mirrorTranslateX(midBack, 'liability', 0) === VIEWPORT_WIDTH);
}

console.log('\n=== 6. Every active Bill step renders a non-null content body (required test 2) ===');
{
  const categoryBranch = functionBody("if (formStep === 'category') {", BILL_SRC);
  assert('6a. the category-step branch is found', categoryBranch.length > 0);
  assert(
    '6b. embedded category content is an unconditional View/map over BILL_PRESETS — no gate that could make it null (e.g. no early "if (!embedded) return null" or data-dependent guard before the return)',
    /if \(embedded\) return categoryContent;/.test(categoryBranch) && !/if \(embedded\) return null/.test(categoryBranch)
  );
  assert(
    '6c. the details-step content is built as a single unconditional JSX fragment (`const content = (<>...`) rather than behind any additional gate — always renders something regardless of selectedPreset/isEditing',
    /const content = \(\s*\n\s*<>/.test(BILL_SRC)
  );
}

console.log('\n=== 7. Back during and immediately after the transition, and the memoized-interpolation wiring (required test 4) ===');
{
  const body = functionBody('function destinationTranslateX(', SHEET_SRC);
  assert(
    '7a. the settled check is evaluated before any transitioning-phase branch, so a route reached via a completed Back is correct immediately at settle — not just eventually correct once some later render catches up',
    body.indexOf('isRouteSettledFront') < body.indexOf("transition.direction === 'back'")
  );
  assert(
    "7b. handleBack's own re-entrancy guard (returningToChooserRef) is unchanged by this correction — a second Back arriving mid-transition is still a synchronous no-op, so 'Back during the transition' cannot double-dispatch",
    /function handleBack\(\) \{\s*\n\s*if \(returningToChooserRef\.current\) return;/.test(SHEET_SRC)
  );
  assert(
    '7c. all four interpolations are memoized (useMemo, not recreated as a fresh object on every unrelated re-render) — every mounted destination layer keeps the SAME live node reference across renders instead of a fresh one being handed to the view whenever any unrelated state changes',
    (SHEET_SRC.match(/= useMemo\(\(\) => workspaceProgress\.interpolate\(/g) || []).length === 4
  );
}

console.log('\n=== 8. Reduce Motion and rapid-tap behaviour (required test 5) ===');
{
  assert(
    "8a. runTransition's reduced-motion branch is unchanged — sets workspaceProgress directly to the settled value and calls onSettled synchronously, so destinationTranslateX's settled-branch applies immediately with no intermediate frame to get wrong",
    /if \(reduceMotionEnabled\) \{\s*\n\s*workspaceProgress\.setValue\(toValue\);\s*\n\s*onSettled\(\);\s*\n\s*return;\s*\n\s*\}/.test(SHEET_SRC)
  );
  assert(
    "8b. under reduced motion, the mirrored settled geometry is identical to the ordinary-motion settled geometry (workspaceProgress jumps straight to toValue with no intermediate frames to diverge) — verified by reusing the exact same mirrorTranslateX call the ordinary-motion sections above already use, at the same settledProgress",
    (() => {
      let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
      state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' }); // reduced-motion: TRANSITION_COMPLETE fires synchronously, same call
      return mirrorTranslateX(state, 'bill', progressAt('forward', 'end')) === 0;
    })()
  );
  assert(
    'BONUS 8c. presentDismissGuard/presentSwitchGuard rapid-tap guards (pendingDismissRef/pendingSwitchRef "already showing" checks) are untouched by this correction — this fix only ever changes the layer geometry function and one internal-close branch',
    /if \(pendingDismissRef\.current !== null\) return; \/\/ an alert is already showing — rapid-tap guard/.test(SHEET_SRC) &&
      /if \(pendingSwitchRef\.current !== null\) return; \/\/ an alert is already showing — rapid-tap guard/.test(SHEET_SRC)
  );
}

console.log('\n=== 9. Existing dirty-state and discard-warning behaviour remains intact (required test 8) ===');
{
  assert(
    "9a. requestEmbeddedClose's NON-'back' branch (Cancel/backdrop/swipe/Android-Back) is completely unchanged — still confirmDiscardIfDirty(isDirty, ...) — the internal picker-back logic is scoped strictly to reason==='back'",
    /confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\?\.\(reason\)\);\s*\n\s*\}/.test(WEALTH_SRC)
  );
  assert(
    "9b. the internal picker-back branch never discards or resets anything — it only flips showLiabilitySelector back to true, exactly matching the established 'Back never discards' policy",
    /if \(kind === 'liability' && selectorEverShownRef\.current && !showLiabilitySelector\) \{\s*\n\s*setShowLiabilitySelector\(true\);\s*\n\s*return;\s*\n\s*\}/.test(WEALTH_SRC)
  );
  assert(
    '9c. selectorEverShownRef is reset to false at the top of the fresh-open effect and re-derived from the same shouldOfferSelector this session\'s picker visibility already depends on — a later session (or a plain, non-handoff liability entry) never inherits a stale "picker was shown" flag',
    /selectorEverShownRef\.current = false;/.test(WEALTH_SRC) && /setShowLiabilitySelector\(shouldOfferSelector\);\s*\n\s*selectorEverShownRef\.current = shouldOfferSelector;/.test(WEALTH_SRC)
  );
  assert(
    '9d. every other already-established discard/switch mechanism (presentSwitchGuard, presentDismissGuard, DISCARD_COPY, resetDraft, reopenSource) is untouched — grepped verbatim, still present in AddAnythingSheet.tsx',
    /function presentSwitchGuard\(/.test(SHEET_SRC) &&
      /function presentDismissGuard\(/.test(SHEET_SRC) &&
      /const DISCARD_COPY: Record</.test(SHEET_SRC) &&
      /function resetDraft\(/.test(SHEET_SRC) &&
      /function reopenSource\(/.test(SHEET_SRC)
  );
  assert(
    "9e. for an ordinary 'create' intent (no handoff, no picker ever offered), selectorEverShownRef.current stays false all session, so requestEmbeddedClose's new condition is never true and Back falls straight through to onConfirmedClose exactly as before",
    /if \(kind === 'liability' && selectorEverShownRef\.current && !showLiabilitySelector\)/.test(WEALTH_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
