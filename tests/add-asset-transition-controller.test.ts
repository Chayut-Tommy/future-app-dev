// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// Real import of the actual production controller (src/components/
// navigation/addAssetTransitionController.ts) — a pure, RN-free, React-free
// reducer, so this is genuine behavioural proof of every state-machine
// decision it makes: no mirrored copy, no structural regex.
//
// CLASSIFICATION:
// - Real import (Class A): every assertion below exercises the actual
//   reduceAddAssetTransition function and its exported initial state.
// - NOT proven here: the React integration in AddAnythingSheet.tsx (the
//   Animated.timing calls, the addAssetGenerationRef stale-completion
//   guard around them, mounting/hiding the embedded AddWealthItemModal,
//   height measurement, accessibility props, or draft preservation across
//   Back). AddAnythingSheet.tsx is a .tsx file and — like every other RN
//   component file in this repo — cannot be imported under `tsx` (confirmed
//   empirically, same Flow-syntax limitation documented in tests/README.md).
//   Those behaviours require physical-device verification; see the
//   implementation report's device-testing checklist.
//
// Run with: ./node_modules/.bin/tsx tests/add-asset-transition-controller.test.ts

import {
  reduceAddAssetTransition,
  initialAddAssetTransitionState,
  AddAssetTransitionState,
  decideAssetTileSelection,
} from '../src/components/navigation/addAssetTransitionController';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function eq(a: AddAssetTransitionState, b: AddAssetTransitionState): boolean {
  return a.current === b.current && a.outgoing === b.outgoing && a.status === b.status;
}

console.log('=== 1. Initial state ===');
{
  assert('1a. initialAddAssetTransitionState starts settled on chooser, nothing outgoing, idle', eq(initialAddAssetTransitionState, { current: 'chooser', outgoing: null, status: 'idle' }));
}

console.log('\n=== 2. Forward (chooser -> addAsset) ===');
{
  const afterForward = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  assert('2a. FORWARD from idle chooser moves current to addAsset immediately', afterForward.current === 'addAsset');
  assert('2b. FORWARD sets outgoing to chooser (the fading-out layer)', afterForward.outgoing === 'chooser');
  assert('2c. FORWARD sets status to transitioning (locks out new Forward/Back)', afterForward.status === 'transitioning');
}

console.log('\n=== 3. Rapid repeated Forward is ignored (first accepted action wins) ===');
{
  const first = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  const second = reduceAddAssetTransition(first, { type: 'FORWARD' });
  assert('3a. a second FORWARD while already transitioning is a no-op — identical state object semantics', eq(second, first));
  assert('3b. a second FORWARD does not touch outgoing/status', second.outgoing === 'chooser' && second.status === 'transitioning');
}

console.log('\n=== 4. Transition completion unlocks the controller ===');
{
  const mid = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  const settled = reduceAddAssetTransition(mid, { type: 'TRANSITION_COMPLETE' });
  assert('4a. TRANSITION_COMPLETE clears outgoing', settled.outgoing === null);
  assert('4b. TRANSITION_COMPLETE sets status back to idle', settled.status === 'idle');
  assert('4c. TRANSITION_COMPLETE preserves the destination current reached', settled.current === 'addAsset');
}

console.log('\n=== 5. TRANSITION_COMPLETE is a no-op when nothing is in flight ===');
{
  const stillIdle = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'TRANSITION_COMPLETE' });
  assert('5a. a stray TRANSITION_COMPLETE while idle does not change state', eq(stillIdle, initialAddAssetTransitionState));
}

console.log('\n=== 6. Back (addAsset -> chooser) ===');
{
  const settledOnAddAsset: AddAssetTransitionState = { current: 'addAsset', outgoing: null, status: 'idle' };
  const afterBack = reduceAddAssetTransition(settledOnAddAsset, { type: 'BACK' });
  assert('6a. BACK from settled addAsset moves current to chooser immediately', afterBack.current === 'chooser');
  assert('6b. BACK sets outgoing to addAsset (the fading-out layer)', afterBack.outgoing === 'addAsset');
  assert('6c. BACK sets status to transitioning', afterBack.status === 'transitioning');
  const settledBack = reduceAddAssetTransition(afterBack, { type: 'TRANSITION_COMPLETE' });
  assert('6d. completing Back settles current on chooser with nothing outgoing', eq(settledBack, { current: 'chooser', outgoing: null, status: 'idle' }));
}

console.log('\n=== 7. Rapid repeated Back is ignored ===');
{
  const settledOnAddAsset: AddAssetTransitionState = { current: 'addAsset', outgoing: null, status: 'idle' };
  const first = reduceAddAssetTransition(settledOnAddAsset, { type: 'BACK' });
  const second = reduceAddAssetTransition(first, { type: 'BACK' });
  assert('7a. a second BACK while already transitioning is a no-op', eq(second, first));
}

console.log('\n=== 8. Forward/Back are rejected from the wrong settled step ===');
{
  const forwardFromAddAsset = reduceAddAssetTransition({ current: 'addAsset', outgoing: null, status: 'idle' }, { type: 'FORWARD' });
  assert('8a. FORWARD while already settled on addAsset is a no-op', eq(forwardFromAddAsset, { current: 'addAsset', outgoing: null, status: 'idle' }));
  const backFromChooser = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'BACK' });
  assert('8b. BACK while already settled on chooser is a no-op', eq(backFromChooser, initialAddAssetTransitionState));
}

console.log('\n=== 9. Interrupted transition — a Back arriving mid-Forward is rejected, not queued ===');
{
  const midForward = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  const interrupted = reduceAddAssetTransition(midForward, { type: 'BACK' });
  assert('9a. BACK while a Forward transition is in flight does not change state', eq(interrupted, midForward));
  // The in-flight Forward's own eventual completion is still honoured —
  // one rejected/interrupted transition must not leave the host
  // permanently locked.
  const completed = reduceAddAssetTransition(interrupted, { type: 'TRANSITION_COMPLETE' });
  assert('9b. the original Forward still completes normally after the rejected interruption', eq(completed, { current: 'addAsset', outgoing: null, status: 'idle' }));
}

console.log('\n=== 10. Interrupted transition — a Forward arriving mid-Back is rejected, not queued ===');
{
  const settledOnAddAsset: AddAssetTransitionState = { current: 'addAsset', outgoing: null, status: 'idle' };
  const midBack = reduceAddAssetTransition(settledOnAddAsset, { type: 'BACK' });
  const interrupted = reduceAddAssetTransition(midBack, { type: 'FORWARD' });
  assert('10a. FORWARD while a Back transition is in flight does not change state', eq(interrupted, midBack));
  const completed = reduceAddAssetTransition(interrupted, { type: 'TRANSITION_COMPLETE' });
  assert('10b. the original Back still completes normally after the rejected interruption', eq(completed, { current: 'chooser', outgoing: null, status: 'idle' }));
}

console.log('\n=== 11. Host dismissal during a transition / reopening — RESET ===');
{
  const midForward = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  const dismissed = reduceAddAssetTransition(midForward, { type: 'RESET' });
  assert('11a. RESET during an in-flight transition returns to the exact initial state', eq(dismissed, initialAddAssetTransitionState));
  // A stale TRANSITION_COMPLETE from the transition that was in flight
  // when RESET fired must not resurrect it — the host's own generation
  // counter is what actually prevents this dispatch from firing at all in
  // production; this assertion documents that even if it somehow did, the
  // reducer's own status==='idle' guard makes it a safe no-op.
  const staleCompletion = reduceAddAssetTransition(dismissed, { type: 'TRANSITION_COMPLETE' });
  assert('11b. a stale completion arriving after RESET is a no-op (status idle guard)', eq(staleCompletion, initialAddAssetTransitionState));
}

console.log('\n=== 12. Reopening does not retain a stale transition lock — fresh Forward works normally after RESET ===');
{
  const midForward = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  const dismissed = reduceAddAssetTransition(midForward, { type: 'RESET' });
  const freshForward = reduceAddAssetTransition(dismissed, { type: 'FORWARD' });
  assert('12a. FORWARD after RESET is accepted exactly as it would be from a genuinely fresh open', eq(freshForward, { current: 'addAsset', outgoing: 'chooser', status: 'transitioning' }));
}

console.log('\n=== 13. Reduced-motion progression — synchronous FORWARD immediately followed by TRANSITION_COMPLETE ===');
{
  // The reducer has no notion of time or motion — reduced-motion mode is
  // entirely a host-side choice to dispatch these two actions back-to-back
  // instead of waiting for an Animated.timing completion. Both steps are
  // never simultaneously exposed as "current" mid-sequence: outgoing is
  // set then immediately cleared within the same synchronous host call.
  let state = initialAddAssetTransitionState;
  state = reduceAddAssetTransition(state, { type: 'FORWARD' });
  state = reduceAddAssetTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('13a. reduced-motion Forward lands settled on addAsset with nothing outgoing', eq(state, { current: 'addAsset', outgoing: null, status: 'idle' }));
  state = reduceAddAssetTransition(state, { type: 'BACK' });
  state = reduceAddAssetTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('13b. reduced-motion Back lands settled on chooser with nothing outgoing', eq(state, initialAddAssetTransitionState));
}

console.log('\n=== 14. Hidden/outgoing step exposure ===');
{
  const midForward = reduceAddAssetTransition(initialAddAssetTransitionState, { type: 'FORWARD' });
  assert('14a. mid-Forward, outgoing correctly identifies chooser as the layer fading away', midForward.outgoing === 'chooser');
  const midBack = reduceAddAssetTransition({ current: 'addAsset', outgoing: null, status: 'idle' }, { type: 'BACK' });
  assert('14b. mid-Back, outgoing correctly identifies addAsset as the layer fading away', midBack.outgoing === 'addAsset');
  const idleChooser = initialAddAssetTransitionState;
  assert('14c. idle on chooser, outgoing is null (nothing hidden mid-flight)', idleChooser.outgoing === null);
  const idleAddAsset: AddAssetTransitionState = { current: 'addAsset', outgoing: null, status: 'idle' };
  assert('14d. idle on addAsset, outgoing is null', idleAddAsset.outgoing === null);
}

console.log('\n=== 15. Correction pass (§3) — decideAssetTileSelection, real import ===');
{
  assert(
    '15a. never entered this session -> proceed (plain first entry), regardless of dirty/type values',
    decideAssetTileSelection({ everEntered: false, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: true }).action === 'proceed'
  );
  assert(
    '15b. same asset type already open -> proceed (restore exactly), even while dirty',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'cash', isDirty: true }).action === 'proceed'
  );
  assert(
    '15c. same asset type already open -> proceed, while clean too',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'cash', isDirty: false }).action === 'proceed'
  );
  assert(
    '15d. different type, current draft clean -> switchClean (silently re-initialise, nothing lost)',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: false }).action === 'switchClean'
  );
  assert(
    '15e. different type, current draft dirty -> confirmSwitch (must not silently discard)',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: true }).action === 'confirmSwitch'
  );
  assert(
    '15f. every one of the five real asset-type pairs used by the actual ASSET_PRESET_MAP produces confirmSwitch when dirty and switchClean when clean — not just the cash/property example',
    (['cash', 'savings', 'etf', 'property', 'super'] as const).every((from) =>
      (['cash', 'savings', 'etf', 'property', 'super'] as const)
        .filter((to) => to !== from)
        .every(
          (to) =>
            decideAssetTileSelection({ everEntered: true, currentPresetType: from, selectedPresetType: to, isDirty: true }).action === 'confirmSwitch' &&
            decideAssetTileSelection({ everEntered: true, currentPresetType: from, selectedPresetType: to, isDirty: false }).action === 'switchClean'
        )
    )
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
