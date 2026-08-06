// Stream D — Round 6 (dismissal-lifecycle correction). Fixes the blank-
// white-slab defect physical-device testing found on BOTH the fallback
// (Add Anything -> Add Asset) and ordinary (Cancel/backdrop/swipe) Add
// Anything dismissal paths.
//
// Root causes (see the return report for the full native-source trace):
// 1. Ordinary dismiss: KeyboardSheet.dismiss() reset translateY to 0
//    (fully on-screen) INSIDE its own JS-animation-complete callback,
//    synchronously alongside calling onClose() — but RN's Modal (iOS) keeps
//    rendering `children` until the REAL native dismissal completes
//    (its internal `isRendered` flag), which is later and asynchronous.
//    The premature reset snapped the sheet back to full visibility during
//    that gap. Fixed by moving the reset into the Modal's own onDismiss
//    (the real completion signal), which now always fires via a
//    KeyboardSheet-owned wrapper regardless of whether the calling form
//    passes its own onDismiss.
// 2. Fallback dismiss: AddAnythingSheet's Option-B animationType='none'
//    mechanism relied on iOS's non-animated dismissViewController:animated:NO,
//    whose completion block fires asynchronously (per RCTModalHostViewComponentView.mm,
//    a thin pass-through to UIKit's own dismissViewControllerAnimated:completion:)
//    while RN's Modal still reports itself as rendering — exposing whatever
//    native compositing gap exists between "view hierarchy detaching" and
//    "completion fires", unlike a REAL animated dismissal, which UIKit
//    guarantees stays visually intact until its own completion. Fixed by
//    retiring the mechanism entirely — fallback dismissal now always uses
//    KeyboardSheet's default, real, animated animationType="slide".
//
// CLASSIFICATION (explicit, per this round's instruction):
// - Class C (static/source-structure): every assertion below.
// - No component/runtime test exists in this repo (no test framework).
// - NOT proven here: that the fix actually eliminates the visible artifact
//   on real hardware, animation smoothness/timing, or any visual claim.
//   Physical Add Asset + ordinary Cancel retesting is REQUIRED before this
//   is treated as fixed.
//
// DURABLE LOCATION — relocated from the session scratchpad into this
// tracked `tests/` directory during checkpoint preparation. Content
// unchanged from its proven, passing form; only this note and the "Run
// with" line were updated. Both fixes below were subsequently accepted on
// physical-device retest — this file remains structural-only and must not
// be read as re-proving that acceptance itself.
//
// Run with: npx tsx tests/add-anything-sheet-blank-slab-fix.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const KEYBOARD_SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/shared/KeyboardSheet.tsx', 'utf-8');
const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferModal.tsx', 'utf-8');
const GOAL_DETAIL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/goals/GoalDetailSheet.tsx', 'utf-8');
const ADD_RECURRING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/AddRecurringItemModal.tsx', 'utf-8');
const ADD_WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');

console.log('=== 1. KeyboardSheet: translateY reset moved to the real native-completion signal (Class C) ===');
{
  assert(
    '1a. dismiss()\'s JS-animation-complete callback no longer resets translateY — only calls onClose()',
    /function dismiss\(\) \{\s*\n\s*Animated\.timing\(translateY, \{ toValue: 800, duration: 200, useNativeDriver: true \}\)\.start\(\(\) => \{\s*\n\s*onClose\(\);\s*\n\s*\}\);\s*\n\s*\}/.test(KEYBOARD_SHEET_SRC)
  );
  assert(
    '1b. a dedicated handleNativeDismissComplete function resets translateY and then forwards to the caller\'s own onDismiss (optional-chained, safe when absent)',
    /function handleNativeDismissComplete\(\) \{\s*\n\s*translateY\.setValue\(0\);\s*\n\s*onDismiss\?\.\(\);\s*\n\s*\}/.test(KEYBOARD_SHEET_SRC)
  );
  assert(
    '1c. the underlying Modal\'s own onDismiss is now handleNativeDismissComplete, not the raw forwarded prop — fires for every caller regardless of whether they pass their own onDismiss',
    /<Modal visible=\{visible\} animationType=\{animationType\} transparent onRequestClose=\{requestClose\} onDismiss=\{handleNativeDismissComplete\}>/.test(KEYBOARD_SHEET_SRC)
  );
  assert('1d. no remaining reference to the old, bare `onDismiss={onDismiss}` Modal wiring', !/onDismiss=\{onDismiss\}/.test(KEYBOARD_SHEET_SRC));
}

console.log('\n=== 2. AddAnythingSheet: animationType=\'none\' mechanism fully retired (Class C) ===');
{
  assert('2a. no dismissAnimationType state remains anywhere in the file', !ADD_ANYTHING_SRC.includes('dismissAnimationType'));
  assert('2b. the <KeyboardSheet> render passes no animationType prop at all — uses KeyboardSheet\'s own default (\'slide\')', !/<KeyboardSheet[\s\S]*?animationType=/.test(ADD_ANYTHING_SRC));
  assert(
    '2c. choose() no longer sets any animationType override — its body is exactly the lock check/set, handoff bookkeeping, pendingKindRef, onClose(), and the Android timer branch',
    /function choose\(kind: AddAnythingKind\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with enterTransfer\(\)\s*\n\s*selectionLockRef\.current = true;\s*\n\s*handoffInProgressRef\.current = true;\s*\n\s*pendingKindRef\.current = kind;\s*\n\s*onClose\(\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2d. runPendingSelection no longer touches any animationType state — ends with releasing selectionLockRef only',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function runPendingSelection()');
      const end = ADD_ANYTHING_SRC.indexOf('\n  }', start);
      const body = ADD_ANYTHING_SRC.slice(start, end);
      return body.includes('if (kind !== null) onSelect(kind);') && body.trim().endsWith('selectionLockRef.current = false;') && !body.includes('animationType');
    })()
  );
  assert('2e. the fresh-open effect no longer resets any animationType state', !/setDismissAnimationType/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 3. Ordinary dismissal (Cancel/backdrop/swipe/Android-Back) still routes through handleRequestClose, untouched in structure (Class C) ===');
{
  assert('3a. handleRequestClose still bumps generationRef then calls the real top-level onClose — unchanged from Round 5', /function handleRequestClose\(\) \{\s*\n\s*generationRef\.current\+\+;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
  assert('3b. handleRequestClose never touches screen/transitionPhase/chooserAnim/pendingKindRef — content-affecting state is untouched by ordinary dismissal', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function handleRequestClose()');
    const end = ADD_ANYTHING_SRC.indexOf('\n  }', start);
    const body = ADD_ANYTHING_SRC.slice(start, end);
    return !/setScreen|setTransitionPhase|chooserAnim|pendingKindRef/.test(body);
  })());
  assert('3c. KeyboardSheet is still passed a live isDirty for the backdrop/swipe/Android-Back dirty-gate (Transfer dirty protection unchanged)', /isDirty=\{activeScreen === 'transfer' \? transferIsDirty : false\}/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 4. Chooser content is never conditionally cleared by any dismissal path (Class C) ===');
{
  assert(
    '4a. showChooser\'s condition is unchanged — driven only by screen/transitionPhase, never by visible directly',
    /const showChooser = screen === 'chooser' \|\| transitionPhase === 'transfer-to-chooser';/.test(ADD_ANYTHING_SRC)
  );
  assert('4b. neither choose() nor handleRequestClose ever calls setScreen — the chooser\'s own mount/unmount is untouched by any dismissal', (() => {
    const chooseStart = ADD_ANYTHING_SRC.indexOf('function choose(kind: AddAnythingKind)');
    const chooseEnd = ADD_ANYTHING_SRC.indexOf('\n  }', chooseStart);
    const closeStart = ADD_ANYTHING_SRC.indexOf('function handleRequestClose()');
    const closeEnd = ADD_ANYTHING_SRC.indexOf('\n  }', closeStart);
    return !ADD_ANYTHING_SRC.slice(chooseStart, chooseEnd).includes('setScreen') && !ADD_ANYTHING_SRC.slice(closeStart, closeEnd).includes('setScreen');
  })());
}

console.log('\n=== 5. Exactly-once fallback delivery, gated on the REAL native completion (Class C) ===');
{
  assert('5a. onSelect is still called from exactly one place (runPendingSelection), gated on kind !== null', (ADD_ANYTHING_SRC.match(/\bonSelect\(kind\)/g) || []).length === 1);
  assert('5b. runPendingSelection is still wired to onDismiss (iOS) — now firing at the corrected, real completion boundary, per KeyboardSheet\'s own fix above', /onDismiss=\{Platform\.OS === 'ios' \? runPendingSelection : undefined\}/.test(ADD_ANYTHING_SRC));
  assert('5c. the Android-only fallback timer is untouched — still 300ms, still gated on Platform.OS===\'android\' only', /if \(Platform\.OS === 'android'\) \{\s*\n\s*if \(androidFallbackTimerRef\.current\) clearTimeout\(androidFallbackTimerRef\.current\);\s*\n\s*androidFallbackTimerRef\.current = setTimeout\(runPendingSelection, ANDROID_DISMISS_FALLBACK_MS\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 6. First-tap-wins / stale-completion / reopening guarantees carried over unchanged from Round 5 (Class C, re-verified) ===');
{
  assert('6a. selectionLockRef is still the first, synchronous check in both choose() and enterTransfer()', /if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with enterTransfer\(\)/.test(ADD_ANYTHING_SRC) && /if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with choose\(\)/.test(ADD_ANYTHING_SRC));
  assert('6b. generationRef is still bumped in handleRequestClose, invalidating any in-flight transition completion on dismissal', /function handleRequestClose\(\) \{\s*\n\s*generationRef\.current\+\+;/.test(ADD_ANYTHING_SRC));
  assert('6c. the fresh-open effect still resets selectionLockRef, returningToChooserRef, handoffInProgressRef, pendingKindRef, generationRef, screen, and transitionPhase unconditionally', /selectionLockRef\.current = false;\s*\n\s*returningToChooserRef\.current = false;\s*\n\s*handoffInProgressRef\.current = false;\s*\n\s*pendingKindRef\.current = null;\s*\n\s*generationRef\.current\+\+;\s*\n\s*setScreen\('chooser'\);\s*\n\s*setTransitionPhase\('idle'\);/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 7. Embedded and standalone Transfer unchanged (Class C) ===');
{
  assert('7a. TransferForm.tsx has no Round-6/dismissal-lifecycle marker — file untouched this round', !/Round 6|dismissal.lifecycle/i.test(TRANSFER_FORM_SRC));
  assert('7b. TransferModal.tsx has no Round-6 marker — file untouched this round', !/Round 6/.test(TRANSFER_MODAL_SRC));
  assert('7c. AddAnythingSheet\'s embedded-Transfer wiring (enterTransfer/backToChooser/TransferForm render) is structurally unchanged from Round 5 — embedded prop, onDirtyChange, onSaveSuccess, onConfirmedClose all still present', /<TransferForm\s*\n\s*ref=\{transferFormRef\}\s*\n\s*embedded\s*\n\s*onCanSaveChange=\{setTransferCanSave\}\s*\n\s*onDirtyChange=\{setTransferIsDirty\}\s*\n\s*onSaveSuccess=\{onClose\}/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 8. Untouched protected files (Class C) ===');
{
  assert('8a. GoalDetailSheet.tsx has no Round-6 marker', !/Round 6/.test(GOAL_DETAIL_SRC));
  assert('8b. AddRecurringItemModal.tsx has no Round-6 marker', !/Round 6/.test(ADD_RECURRING_SRC));
  assert(
    '8c. AddWealthItemModal.tsx has no Stream-D-Round-6 marker (this file has an unrelated, pre-existing Stream C "Round 6 correction" comment about secured-loan naming, and a separate Round 7 comment that also happens to say "Dismissal-lifecycle correction" when describing the unrelated kind/kindProp prop-shadow fix — neither is a Round 6/Stream D reference, so a bare "dismissal-lifecycle" phrase match is intentionally not used here; only the compound Stream-D+Round-6 marker, Round 6\'s unique identifier, is checked)',
    !/Stream D.*Round 6|Round 6.*Stream D/i.test(ADD_WEALTH_SRC) &&
      !/handleNativeDismissComplete/.test(ADD_WEALTH_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
