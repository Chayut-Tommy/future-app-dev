// Floating navigation — correction round. Real-import (Class A) coverage
// for floatingAddTransition.ts, the pure state machine that now owns the
// tray-to-AddAnythingSheet hand-off. This file exists specifically to
// prove the invariant the confirmed device defect violated: the tray and
// AddAnythingSheet's native Modal must never both be "visible" for the
// same phase — not by convention, but exhaustively, over every phase and
// every possible event sequence a bounded search can reach.
//
// Run with: npx tsx tests/floating-add-transition.test.ts

import {
  FloatingAddEvent,
  FloatingAddPhase,
  INITIAL_FLOATING_ADD_PHASE,
  bothModalsVisible,
  isSheetOpen,
  isTrayInteractive,
  isTrayMounted,
  reduceFloatingAddPhase,
} from '../src/components/navigation/floatingAddTransition';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ALL_PHASES: FloatingAddPhase[] = ['closed', 'trayOpen', 'closingForAction', 'closingForDismiss', 'addSheetOpen'];
const ALL_EVENTS: FloatingAddEvent[] = ['PRESS_FAB', 'SELECT_ACTION', 'REQUEST_DISMISS', 'TRAY_CLOSED', 'SHEET_CLOSED'];

console.log('=== 1. The core invariant — tray and AddAnythingSheet can never both be visible (Class A) ===');
{
  assert(
    '1a. bothModalsVisible(phase) is false for every one of the 5 reachable phases, exhaustively — not just the ones exercised by the "normal" flow below',
    ALL_PHASES.every((phase) => bothModalsVisible(phase) === false)
  );
  assert(
    '1b. exhaustive reachability search — starting from the initial phase, applying every possible sequence of up to 6 events (5^6 = 15,625 sequences) never once produces a phase where bothModalsVisible is true',
    (() => {
      let states: FloatingAddPhase[] = [INITIAL_FLOATING_ADD_PHASE];
      for (let depth = 0; depth < 6; depth++) {
        const next = new Set<FloatingAddPhase>();
        for (const phase of states) {
          if (bothModalsVisible(phase)) return false;
          for (const event of ALL_EVENTS) {
            next.add(reduceFloatingAddPhase(phase, event));
          }
        }
        states = Array.from(next);
      }
      return states.every((phase) => !bothModalsVisible(phase));
    })()
  );
  assert(
    '1c. isSheetOpen and isTrayMounted are mutually exclusive for every phase (the structural reason 1a/1b hold) — not merely "both false together" by coincidence',
    ALL_PHASES.every((phase) => !(isSheetOpen(phase) && isTrayMounted(phase)))
  );
}

console.log('\n=== 2. The happy path — FAB press, select an action, tray closes, sheet opens, sheet closes (Class A) ===');
{
  let phase = INITIAL_FLOATING_ADD_PHASE;
  assert('2a. starts closed', phase === 'closed');
  phase = reduceFloatingAddPhase(phase, 'PRESS_FAB');
  assert('2b. PRESS_FAB from closed -> trayOpen', phase === 'trayOpen');
  assert('2c. tray is interactive while trayOpen', isTrayInteractive(phase));
  phase = reduceFloatingAddPhase(phase, 'SELECT_ACTION');
  assert('2d. SELECT_ACTION from trayOpen -> closingForAction', phase === 'closingForAction');
  assert('2e. tray is mounted but NOT interactive while closingForAction — pointer events already disabled', isTrayMounted(phase) && !isTrayInteractive(phase));
  assert('2f. AddAnythingSheet is not yet open while closingForAction — it must wait for TRAY_CLOSED', !isSheetOpen(phase));
  phase = reduceFloatingAddPhase(phase, 'TRAY_CLOSED');
  assert('2g. TRAY_CLOSED from closingForAction -> addSheetOpen (only now does the sheet open)', phase === 'addSheetOpen');
  assert('2h. the tray is fully unmounted the instant the sheet opens', !isTrayMounted(phase));
  phase = reduceFloatingAddPhase(phase, 'SHEET_CLOSED');
  assert('2i. SHEET_CLOSED from addSheetOpen -> closed', phase === 'closed');
}

console.log('\n=== 3. The dismiss path — FAB press, dismiss without selecting, no sheet ever opens (Class A) ===');
{
  let phase = reduceFloatingAddPhase(INITIAL_FLOATING_ADD_PHASE, 'PRESS_FAB');
  phase = reduceFloatingAddPhase(phase, 'REQUEST_DISMISS');
  assert('3a. REQUEST_DISMISS from trayOpen -> closingForDismiss', phase === 'closingForDismiss');
  phase = reduceFloatingAddPhase(phase, 'TRAY_CLOSED');
  assert('3b. TRAY_CLOSED from closingForDismiss -> closed, never addSheetOpen — no sheet opens for a plain dismiss', phase === 'closed');
}

console.log('\n=== 4. Illegal/stale transitions are no-ops, never queued or force-applied (Class A) ===');
{
  assert('4a. SELECT_ACTION while already closingForDismiss is ignored (tray is no longer interactive) — cannot resurrect a dismiss into an action', reduceFloatingAddPhase('closingForDismiss', 'SELECT_ACTION') === 'closingForDismiss');
  assert('4b. SELECT_ACTION while already closingForAction is ignored — a second tile tap during the close animation cannot open a second sheet', reduceFloatingAddPhase('closingForAction', 'SELECT_ACTION') === 'closingForAction');
  assert('4c. REQUEST_DISMISS while addSheetOpen is ignored — dismissing the (already-closed/unmounted) tray cannot affect an open sheet', reduceFloatingAddPhase('addSheetOpen', 'REQUEST_DISMISS') === 'addSheetOpen');
  assert('4d. TRAY_CLOSED while trayOpen is ignored — nothing has asked the tray to close yet, so a stray callback cannot fire this transition', reduceFloatingAddPhase('trayOpen', 'TRAY_CLOSED') === 'trayOpen');
  assert('4e. TRAY_CLOSED while closed is ignored — a late/duplicate animation-completion callback after the phase already settled cannot re-trigger anything', reduceFloatingAddPhase('closed', 'TRAY_CLOSED') === 'closed');
  assert('4f. TRAY_CLOSED while addSheetOpen is ignored', reduceFloatingAddPhase('addSheetOpen', 'TRAY_CLOSED') === 'addSheetOpen');
  assert('4g. SHEET_CLOSED while any tray-mounted phase is ignored — AddAnythingSheet cannot close a phase it was never part of', ['closed', 'trayOpen', 'closingForAction', 'closingForDismiss'].every((p) => reduceFloatingAddPhase(p as FloatingAddPhase, 'SHEET_CLOSED') === p));
  assert('4h. PRESS_FAB while closingForAction/closingForDismiss/addSheetOpen is ignored — rapid re-tapping the FAB mid-transition cannot desync the phase', ['closingForAction', 'closingForDismiss', 'addSheetOpen'].every((p) => reduceFloatingAddPhase(p as FloatingAddPhase, 'PRESS_FAB') === p));
}

console.log('\n=== 5. Reopening — the same destination twice, and a different destination after a cancel, both reach a fresh trayOpen->closingForAction cycle (Class A) ===');
{
  // "Open the same destination twice" and "open one, cancel, open a
  // different one" are behaviourally identical at the phase-machine level
  // — both are just "closed -> ... -> addSheetOpen -> closed" twice in a
  // row. What actually varies (which AddAnythingKind is pending) lives in
  // FloatingAddButton's own pendingSheetPropsRef, deliberately outside this
  // pure phase machine — see tests/rendered/floating-navigation.render.test.tsx
  // for that behavioural proof against the real component.
  let phase = INITIAL_FLOATING_ADD_PHASE;
  const cycle = () => {
    phase = reduceFloatingAddPhase(phase, 'PRESS_FAB');
    phase = reduceFloatingAddPhase(phase, 'SELECT_ACTION');
    phase = reduceFloatingAddPhase(phase, 'TRAY_CLOSED');
    const reachedOpen = phase === 'addSheetOpen';
    phase = reduceFloatingAddPhase(phase, 'SHEET_CLOSED');
    const reachedClosed = phase === 'closed';
    return reachedOpen && reachedClosed;
  };
  assert('5a. first full open-select-close cycle reaches addSheetOpen then closed', cycle());
  assert('5b. a second, independent cycle from the same closed starting point reaches addSheetOpen then closed again — reopening works', cycle());
  assert('5c. a third cycle also works — this is not a one-shot machine', cycle());
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
