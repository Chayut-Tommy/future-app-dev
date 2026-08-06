// Stream D — Round 5 (correction pass). Two fixes to the Round 4 Transfer
// proof-of-pattern: (1) a synchronous, ref-based chooser-selection lock
// shared by embedded Transfer entry and every Option B fallback selection,
// replacing the React-state-based (non-atomic) guard; (2) real dirty-state
// detection + Navilo's existing discard-confirmation pattern for the
// embedded Transfer route only, with an explicit `embedded` flag so
// standalone TransferModal's original unconditional-close behaviour is
// unaffected by default.
//
// CLASSIFICATION (per explicit instruction this round):
// - Class C (static/source-structure): every assertion below. These prove
//   the CODE is wired correctly — the right ref is checked first, the right
//   function is called, the right prop is threaded through. They do NOT
//   execute the component, do NOT simulate two real taps racing in the same
//   JS tick, and do NOT drive React Native's Alert/Modal/Animated runtime.
// - Nothing in this file is a component or runtime test — this repo has no
//   test framework (no jest/vitest, no test script, no tracked test files;
//   confirmed again this round via `grep -n test package.json` and `find`
//   for tracked *.test.ts — both empty) and no established repository test
//   location, so per this round's explicit scope instruction this file
//   lives only in the session scratchpad, not the repo.
// - Behaviour that STILL requires physical-device verification, not proven
//   here or by any prior round's test: actual double-tap timing/race
//   avoidance, animation smoothness, keyboard stability, visual continuity,
//   the real Alert dialog's appearance/wording on-device, and whether
//   declining/confirming discard actually preserves/clears the UI as
//   expected. This file proves the WIRING that should produce that
//   behaviour, not the behaviour itself.
//
// DURABLE LOCATION — relocated from the session scratchpad into this
// tracked `tests/` directory during checkpoint preparation. Content
// unchanged from its proven, passing form; only this note and the "Run
// with" line were updated. This fix was subsequently accepted on
// physical-device retest — this file remains structural-only and must not
// be read as re-proving that acceptance itself.
//
// Run with: npx tsx tests/add-anything-sheet-lock-and-dirty.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferModal.tsx', 'utf-8');
const GOAL_DETAIL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/goals/GoalDetailSheet.tsx', 'utf-8');
const ADD_RECURRING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/AddRecurringItemModal.tsx', 'utf-8');
const ADD_WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const KEYBOARD_SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/shared/KeyboardSheet.tsx', 'utf-8');

console.log('=== 1. Synchronous selection lock declared and shared (Class C) ===');
{
  assert('1a. selectionLockRef declared as a plain useRef(false) — not React state', /const selectionLockRef = useRef\(false\);/.test(ADD_ANYTHING_SRC));
  assert('1b. returningToChooserRef declared as a dedicated re-entrancy guard for Back', /const returningToChooserRef = useRef\(false\);/.test(ADD_ANYTHING_SRC));
  assert(
    '1c. handoffInProgressRef retained (Option B lifecycle bookkeeping), explicitly documented as no longer the sole gate',
    /const handoffInProgressRef = useRef\(false\);/.test(ADD_ANYTHING_SRC) &&
      /it is no longer, by itself, the first-tap-wins gate/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 2. choose() (fallback path) — lock is first check, set before any other work (Class C) ===');
{
  assert(
    '2a. choose() checks selectionLockRef.current FIRST and returns before touching any other ref/state',
    /function choose\(kind: AddAnythingKind\) \{\s*\n\s*if \(selectionLockRef\.current\) return;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2b. choose() sets selectionLockRef.current = true as its very next statement, before handoffInProgressRef/pendingKindRef/dismissAnimationType/onClose',
    /if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with enterTransfer\(\)\s*\n\s*selectionLockRef\.current = true;\s*\n\s*handoffInProgressRef\.current = true;/.test(ADD_ANYTHING_SRC)
  );
  assert('2c. choose() no longer reads transitionPhase at all (the old, non-atomic React-state guard is fully removed from this function)', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function choose(kind: AddAnythingKind)');
    const end = ADD_ANYTHING_SRC.indexOf('\n  }', start);
    return !ADD_ANYTHING_SRC.slice(start, end).includes('transitionPhase');
  })());
}

console.log('\n=== 3. enterTransfer() — same lock, same ordering, held while Transfer is active (Class C) ===');
{
  assert(
    '3a. enterTransfer() checks the SAME selectionLockRef first, and no longer reads handoffInProgressRef at all (superseded by the shared ref)',
    /function enterTransfer\(\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with choose\(\)\s*\n\s*selectionLockRef\.current = true; \/\/ held for the entire time Transfer is the active screen \(req #6\)/.test(ADD_ANYTHING_SRC)
  );
  assert('3b. the lock is set before ++generationRef.current and before any Animated call in enterTransfer()', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function enterTransfer()');
    const lockLine = ADD_ANYTHING_SRC.indexOf('selectionLockRef.current = true;', start);
    const genLine = ADD_ANYTHING_SRC.indexOf('++generationRef.current;', start);
    const animLine = ADD_ANYTHING_SRC.indexOf('Animated.parallel', start);
    return lockLine !== -1 && lockLine < genLine && genLine < animLine;
  })());
  assert('3c. enterTransfer() never releases selectionLockRef itself (release ownership belongs to backToChooser/runPendingSelection/fresh-open only)', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function enterTransfer()');
    const end = ADD_ANYTHING_SRC.indexOf('function backToChooser()');
    return !ADD_ANYTHING_SRC.slice(start, end).includes('selectionLockRef.current = false');
  })());
}

console.log('\n=== 4. backToChooser() — dedicated re-entrancy guard, releases the shared lock only after chooser is restored (Class C) ===');
{
  assert(
    '4a. backToChooser() checks returningToChooserRef (not selectionLockRef, which is legitimately still true here) as its own first-tap-wins gate',
    /function backToChooser\(\) \{\s*\n\s*if \(returningToChooserRef\.current\) return; \/\/ synchronous re-entrancy guard for Back itself\s*\n\s*returningToChooserRef\.current = true;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '4b. selectionLockRef is released exactly twice in backToChooser (Reduce Motion branch + animation completion), both AFTER setScreen(\'chooser\')',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function backToChooser()');
      const end = ADD_ANYTHING_SRC.indexOf('\n  // KeyboardSheet\'s own backdrop', start);
      const body = ADD_ANYTHING_SRC.slice(start, end);
      const releases = (body.match(/selectionLockRef\.current = false; \/\/ released only once the chooser is restored \(req #7\)/g) || []).length;
      return releases === 2 && /setScreen\('chooser'\);\s*\n\s*setTransitionPhase\('idle'\);\s*\n\s*selectionLockRef\.current = false;/.test(body);
    })()
  );
  assert(
    '4c. returningToChooserRef is reset to false in both the Reduce Motion branch and the animation completion, WITHIN backToChooser() itself (a third reset also exists in the fresh-open effect, which is separate and correct — req #10)',
    (() => {
      const start = ADD_ANYTHING_SRC.indexOf('function backToChooser()');
      const end = ADD_ANYTHING_SRC.indexOf('\n  // KeyboardSheet\'s own backdrop', start);
      const body = ADD_ANYTHING_SRC.slice(start, end);
      return (body.match(/returningToChooserRef\.current = false;/g) || []).length === 2;
    })()
  );
}

console.log('\n=== 5. Fallback delivery releases the shared lock after delivery (Class C, req #8) ===');
{
  assert(
    '5a. runPendingSelection releases selectionLockRef AFTER onSelect(kind), matching the established deliver-then-reset ordering',
    /if \(kind !== null\) onSelect\(kind\);\s*\n[\s\S]{0,300}?selectionLockRef\.current = false;/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 6. Fresh-open effect resets the lock and returningToChooser guard (Class C, req #10) ===');
{
  assert(
    '6a. the visible-true effect resets both selectionLockRef and returningToChooserRef unconditionally, before generationRef/screen/transitionPhase resets',
    /selectionLockRef\.current = false;\s*\n\s*returningToChooserRef\.current = false;\s*\n\s*handoffInProgressRef\.current = false;/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 7. Dismissal invalidates in-flight transition (Class C, req #9 — unchanged mechanism, re-verified) ===');
{
  assert('7a. handleRequestClose still bumps generationRef before closing', /function handleRequestClose\(\) \{\s*\n\s*generationRef\.current\+\+;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
  assert('7b. both transition completions still compare against generationRef.current before applying (stale-completion guard intact)', (ADD_ANYTHING_SRC.match(/if \(myGeneration !== generationRef\.current\) return;/g) || []).length === 2);
}

console.log('\n=== 8. Reduce Motion uses the same lock lifecycle (Class C, req #11) ===');
{
  assert(
    '8a. enterTransfer()\'s Reduce Motion branch sets the lock before the branch and does not release it (matches the animated path — lock stays held into the Transfer screen)',
    /if \(reduceMotionEnabled\) \{\s*\n\s*setScreen\('transfer'\);\s*\n\s*setTransitionPhase\('idle'\);\s*\n\s*return;\s*\n\s*\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '8b. backToChooser()\'s Reduce Motion branch releases both selectionLockRef and returningToChooserRef, same as the animated completion',
    /if \(reduceMotionEnabled\) \{\s*\n\s*setScreen\('chooser'\);\s*\n\s*setTransitionPhase\('idle'\);\s*\n\s*selectionLockRef\.current = false; \/\/ released only once the chooser is restored \(req #7\)\s*\n\s*returningToChooserRef\.current = false;\s*\n\s*return;\s*\n\s*\}/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 9. Embedded dirty-state contract — TransferForm (Class C) ===');
{
  assert('9a. embedded prop declared, optional, defaulting to false', /embedded\?: boolean;/.test(TRANSFER_FORM_SRC) && /\{ embedded = false, onDirtyChange, onCanSaveChange, onSaveSuccess, onConfirmedClose \}/.test(TRANSFER_FORM_SRC));
  assert('9b. initialSnapshot captured once at mount (fromId defaults to first cash asset, toTarget/amount blank)', /const initialSnapshot = useRef\(\{ fromId: cashAssets\[0\]\?\.id \?\? null, toTarget: null as TransferTarget \| null, amount: '' \}\);/.test(TRANSFER_FORM_SRC));
  assert('9c. isDirty is embedded-gated AND compares current values against the snapshot (fromId, toTarget via targetsEqual, amount)', /const isDirty =\s*\n\s*embedded &&\s*\n\s*\(fromId !== initialSnapshot\.current\.fromId \|\|\s*\n\s*!targetsEqual\(toTarget, initialSnapshot\.current\.toTarget\) \|\|\s*\n\s*amount !== initialSnapshot\.current\.amount\);/.test(TRANSFER_FORM_SRC));
  assert('9d. targetsEqual correctly treats null vs null as equal and compares by id otherwise (not by object reference)', /function targetsEqual\(a: TransferTarget \| null, b: TransferTarget \| null\): boolean \{\s*\n\s*if \(a === null \|\| b === null\) return a === b;/.test(TRANSFER_FORM_SRC));
  assert('9e. onDirtyChange is reported every time isDirty changes', /useEffect\(\(\) => \{\s*\n\s*onDirtyChange\?\.\(isDirty\);\s*\n\s*\}, \[isDirty, onDirtyChange\]\);/.test(TRANSFER_FORM_SRC));
}

console.log('\n=== 10. Clean vs. dirty Back/Cancel routing through confirmDiscardIfDirty (Class C) ===');
{
  assert('10a. confirmDiscardIfDirty imported from the existing shared discard-confirmation module (no new alert/prompt mechanism)', /import \{ confirmDiscardIfDirty \} from '\.\.\/\.\.\/lib\/discardConfirmation';/.test(TRANSFER_FORM_SRC));
  assert(
    '10b. handleRequestClose routes every reason (cancel, back, backdrop, swipe, androidBack) through the SAME confirmDiscardIfDirty call — not a branch per reason',
    /function handleRequestClose\(reason: TransferCloseReason\) \{\s*\n\s*confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\(reason\), 'Discard transfer\?', 'Your transfer details will be lost\.'\);\s*\n\s*\}/.test(TRANSFER_FORM_SRC)
  );
  assert('10c. discard wording follows Navilo\'s existing per-form pattern (a specific noun, not the generic default) — same template as AddIncomeModal\'s "Discard income?"', /'Discard transfer\?'/.test(TRANSFER_FORM_SRC));
  assert(
    '10d. onConfirmedClose is only ever called from inside confirmDiscardIfDirty\'s onDiscard callback — never called directly/unconditionally elsewhere in handleRequestClose',
    (() => {
      const start = TRANSFER_FORM_SRC.indexOf('function handleRequestClose');
      const end = TRANSFER_FORM_SRC.indexOf('\n  }', start);
      const body = TRANSFER_FORM_SRC.slice(start, end);
      return (body.match(/onConfirmedClose\(/g) || []).length === 1 && body.includes('confirmDiscardIfDirty(isDirty, () => onConfirmedClose(reason)');
    })()
  );
}

console.log('\n=== 11. Save success never triggers a discard prompt; failed validation keeps the form open (Class C) ===');
{
  assert(
    '11a. handleSave never CALLS handleRequestClose/confirmDiscardIfDirty (only a documenting comment may mention them) — goes straight to onSaveSuccess on the success path',
    (() => {
      const start = TRANSFER_FORM_SRC.indexOf('function handleSave()');
      const end = TRANSFER_FORM_SRC.indexOf('\n  }', start);
      const body = TRANSFER_FORM_SRC.slice(start, end);
      return !/confirmDiscardIfDirty\(/.test(body) && !/handleRequestClose\(/.test(body) && /onSaveSuccess\(\);/.test(body);
    })()
  );
  assert('11b. handleSave returns immediately (no state change, no close call) when canSave/fromId/toTarget are not all satisfied', /function handleSave\(\) \{\s*\n\s*if \(!canSave \|\| !fromId \|\| !toTarget\) return;/.test(TRANSFER_FORM_SRC));
}

console.log('\n=== 12. AddAnythingSheet wires embedded=true, onDirtyChange, and a real isDirty into KeyboardSheet (Class C) ===');
{
  assert('12a. <TransferForm> is rendered with the embedded flag set', /<TransferForm\s*\n\s*ref=\{transferFormRef\}\s*\n\s*embedded\s*\n/.test(ADD_ANYTHING_SRC));
  assert('12b. onDirtyChange is wired to transferIsDirty state', /onDirtyChange=\{setTransferIsDirty\}/.test(ADD_ANYTHING_SRC));
  assert('12c. KeyboardSheet receives a live isDirty derived from the active screen (false for chooser, transferIsDirty for transfer)', /isDirty=\{activeScreen === 'transfer' \? transferIsDirty : false\}/.test(ADD_ANYTHING_SRC));
  assert('12d. KeyboardSheet receives Transfer-specific discard wording matching TransferForm\'s own, for the backdrop/swipe/Android-Back path', /discardTitle="Discard transfer\?"\s*\n\s*discardMessage="Your transfer details will be lost\."/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 13. Standalone TransferModal unaffected — no edit this round, embedded prop never passed (Class C) ===');
{
  assert(
    '13a. TransferModal does not pass the embedded JSX prop (a plain-English doc-comment mention of the word is fine) — defaults to false, preserving original unconditional-close behaviour',
    !/<TransferForm[\s\S]*?\bembedded\b[\s\S]*?\/>/.test(TRANSFER_MODAL_SRC)
  );
  assert('13b. TransferModal does not pass onDirtyChange — no dirty-state UI change for the standalone caller', !TRANSFER_MODAL_SRC.includes('onDirtyChange'));
  assert('13c. TransferModal\'s own KeyboardSheet usage still has no isDirty/discardTitle/discardMessage props (unchanged from Round 4)', !/isDirty=|discardTitle=|discardMessage=/.test(TRANSFER_MODAL_SRC));
}

console.log('\n=== 14. Reopening starts clean — re-verified after this round\'s changes (Class C) ===');
{
  assert('14a. TransferForm still has no visible-prop dependency at all — it is mounted only while the embedding screen renders it, guaranteeing fresh state (and a fresh initialSnapshot) every time', !TRANSFER_FORM_SRC.includes('visible'));
}

console.log('\n=== 15. Five protected files untouched this round (Class C) ===');
{
  assert('15a. GoalDetailSheet.tsx has no Round-5/selectionLock/discard-transfer marker', !/Round 5|selectionLockRef|Discard transfer/.test(GOAL_DETAIL_SRC));
  assert('15b. AddRecurringItemModal.tsx has no Round-5 marker', !ADD_RECURRING_SRC.includes('Round 5'));
  assert('15c. AddWealthItemModal.tsx has no Round-5 marker', !ADD_WEALTH_SRC.includes('Round 5'));
  assert('15d. KeyboardSheet.tsx has no Round-5 marker (no new prop added this round)', !KEYBOARD_SHEET_SRC.includes('Round 5'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
