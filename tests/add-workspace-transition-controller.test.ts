// Navigation Transitions — Add Anything, full-workspace extension.
//
// Real import of the actual production reducer (addWorkspaceTransitionController.ts)
// — pure, RN-free, so this is genuine behavioural proof of every route's
// first-tap-wins / interrupted-transition / rapid-repeat-ignored /
// stale-completion contract, generalised from the two-route pilot
// (add-asset-transition-controller.test.ts, now trimmed to only its
// remaining decideAssetTileSelection coverage) to all ten routes.
//
// Nested-handoff amendment (correction pass) — the scalar `returnTo` field
// this file previously tested was proven unable to retain more than one
// ancestor level through a cross-destination handoff (see the reducer's
// own returnStack doc comment for the concrete failure trace). Every
// section below that constructs a state literal or asserts on the return
// target has been updated for the array-based `returnStack` replacement,
// and section 23 is the REQUIRED real-import proof of the exact nested
// chain this correction was written to fix: chooser -> bill -> liability
// -> creditCard -> BACK -> liability -> BACK -> bill -> BACK -> chooser.
//
// CLASSIFICATION:
// - Real import (Class A): every assertion below exercises the actual
//   reduceAddWorkspaceTransition / isRouteActiveInTransition /
//   isRouteSettledFront functions and the actual exported constants.
// - NOT proven here: that AddAnythingSheet.tsx actually applies these
//   states correctly to real native views, that the push transition looks
//   smooth, or any other runtime/visual claim — AddAnythingSheet.tsx is
//   .tsx and, like every other RN component file in this repo, cannot be
//   imported under `tsx` (confirmed empirically, same Flow-syntax
//   limitation documented in tests/README.md). Those behaviours require
//   physical-device verification.
//
// Run with: ./node_modules/.bin/tsx tests/add-workspace-transition-controller.test.ts

import {
  reduceAddWorkspaceTransition,
  initialAddWorkspaceTransitionState,
  isRouteActiveInTransition,
  isRouteSettledFront,
  AddWorkspaceRoute,
  AddWorkspaceTransitionState,
} from '../src/components/navigation/addWorkspaceTransitionController';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ALL_ROUTES: AddWorkspaceRoute[] = [
  'transfer',
  'asset',
  'expense',
  'incomeSource',
  'incomeReceived',
  'bill',
  'liability',
  'creditCard',
  'goal',
];

console.log('=== 1. Initial state ===');
{
  assert('1a. initial state is settled on chooser, idle, no direction', initialAddWorkspaceTransitionState.current === 'chooser' && initialAddWorkspaceTransitionState.outgoing === null && initialAddWorkspaceTransitionState.status === 'idle' && initialAddWorkspaceTransitionState.direction === null);
  assert('1b. initial state returnStack is empty (nested-handoff amendment — chooser has nowhere left to Back to)', Array.isArray(initialAddWorkspaceTransitionState.returnStack) && initialAddWorkspaceTransitionState.returnStack.length === 0);
}

console.log('\n=== 2. Forward — every route, from a settled chooser (real import) ===');
{
  for (const route of ALL_ROUTES) {
    const next = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route });
    assert(
      `2. FORWARD into '${route}' from chooser: current becomes '${route}', outgoing becomes 'chooser', status 'transitioning', direction 'forward', returnStack defaults to ['chooser'] when omitted`,
      next.current === route && next.outgoing === 'chooser' && next.status === 'transitioning' && next.direction === 'forward' && JSON.stringify(next.returnStack) === JSON.stringify(['chooser'])
    );
  }
}

console.log("\n=== 3. Forward into 'chooser' itself is rejected (not a valid destination) ===");
{
  const next = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'chooser' });
  assert('3a. FORWARD with route=chooser is a no-op — state unchanged', next === initialAddWorkspaceTransitionState);
}

console.log('\n=== 4. Rapid repeated Forward is ignored (first accepted action wins) ===');
{
  const afterFirst = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'goal' });
  const afterSecond = reduceAddWorkspaceTransition(afterFirst, { type: 'FORWARD', route: 'creditCard' });
  assert('4a. a second Forward (different route) while transitioning is ignored — current stays goal', afterSecond.current === 'goal' && afterSecond === afterFirst);
}

console.log('\n=== 5. Transition completion unlocks the controller ===');
{
  const afterForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  const settled = reduceAddWorkspaceTransition(afterForward, { type: 'TRANSITION_COMPLETE' });
  assert('5a. TRANSITION_COMPLETE settles: current stays bill, outgoing null, status idle, direction null', settled.current === 'bill' && settled.outgoing === null && settled.status === 'idle' && settled.direction === null);
}

console.log('\n=== 6. TRANSITION_COMPLETE is a no-op when nothing is in flight ===');
{
  const next = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'TRANSITION_COMPLETE' });
  assert('6a. TRANSITION_COMPLETE from idle is a no-op — state unchanged', next === initialAddWorkspaceTransitionState);
}

console.log('\n=== 7. Back — every non-chooser route returns to a settled chooser ===');
{
  for (const route of ALL_ROUTES) {
    const settled: AddWorkspaceTransitionState = { current: route, outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
    const next = reduceAddWorkspaceTransition(settled, { type: 'BACK' });
    assert(
      `7. BACK from '${route}': current becomes 'chooser', outgoing becomes '${route}', status 'transitioning', direction 'back', returnStack pops to []`,
      next.current === 'chooser' && next.outgoing === route && next.status === 'transitioning' && next.direction === 'back' && next.returnStack.length === 0
    );
  }
}

console.log("\n=== 8. Back from chooser itself is rejected ===");
{
  const next = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'BACK' });
  assert('8a. BACK from chooser is a no-op — state unchanged', next === initialAddWorkspaceTransitionState);
}

console.log('\n=== 9. Rapid repeated Back is ignored ===');
{
  const settled: AddWorkspaceTransitionState = { current: 'liability', outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
  const afterFirst = reduceAddWorkspaceTransition(settled, { type: 'BACK' });
  const afterSecond = reduceAddWorkspaceTransition(afterFirst, { type: 'BACK' });
  assert('9a. a second Back while transitioning is ignored', afterSecond === afterFirst);
}

console.log('\n=== 10. Forward/Back are rejected from the wrong settled step ===');
{
  const onGoal: AddWorkspaceTransitionState = { current: 'goal', outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
  const forwardWhileOnGoal = reduceAddWorkspaceTransition(onGoal, { type: 'FORWARD', route: 'creditCard' });
  assert('10a. FORWARD while settled on a non-chooser route is rejected (must Back to chooser first — no direct destination-to-destination hop)', forwardWhileOnGoal === onGoal);
  const backWhileOnChooser = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'BACK' });
  assert('10b. BACK while settled on chooser is rejected (already covered by 8a, re-confirmed here alongside 10a for symmetry)', backWhileOnChooser === initialAddWorkspaceTransitionState);
}

console.log('\n=== 11. Interrupted transition — a Back arriving mid-Forward is rejected, not queued ===');
{
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'incomeSource' });
  const backDuring = reduceAddWorkspaceTransition(midForward, { type: 'BACK' });
  assert('11a. BACK arriving while a Forward is still transitioning is rejected outright', backDuring === midForward);
}

console.log('\n=== 12. Interrupted transition — a Forward arriving mid-Back is rejected, not queued ===');
{
  const settled: AddWorkspaceTransitionState = { current: 'expense', outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
  const midBack = reduceAddWorkspaceTransition(settled, { type: 'BACK' });
  const forwardDuring = reduceAddWorkspaceTransition(midBack, { type: 'FORWARD', route: 'bill' });
  assert('12a. FORWARD arriving while a Back is still transitioning is rejected outright', forwardDuring === midBack);
}

console.log('\n=== 13. Host dismissal during a transition / reopening — RESET ===');
{
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'incomeReceived' });
  const reset = reduceAddWorkspaceTransition(midForward, { type: 'RESET' });
  assert('13a. RESET from a mid-transition state returns exactly the initial state', reset.current === 'chooser' && reset.outgoing === null && reset.status === 'idle' && reset.direction === null);
  assert('13b. RESET returns a value equal to initialAddWorkspaceTransitionState (same shape)', JSON.stringify(reset) === JSON.stringify(initialAddWorkspaceTransitionState));
}

console.log('\n=== 14. Reopening does not retain a stale transition lock — fresh Forward works normally after RESET ===');
{
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'liability' });
  const reset = reduceAddWorkspaceTransition(midForward, { type: 'RESET' });
  const freshForward = reduceAddWorkspaceTransition(reset, { type: 'FORWARD', route: 'goal' });
  assert('14a. a fresh Forward after RESET is accepted normally (not permanently locked by the interrupted prior transition)', freshForward.current === 'goal' && freshForward.status === 'transitioning');
}

console.log('\n=== 15. Reduced-motion progression — synchronous FORWARD immediately followed by TRANSITION_COMPLETE ===');
{
  let state = initialAddWorkspaceTransitionState;
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'creditCard' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('15a. reduced-motion Forward settles immediately on creditCard, idle, no direction — same reducer, no special-cased branch needed', state.current === 'creditCard' && state.outgoing === null && state.status === 'idle' && state.direction === null);
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('15b. reduced-motion Back settles immediately on chooser', state.current === 'chooser' && state.outgoing === null && state.status === 'idle' && state.direction === null);
}

console.log('\n=== 16. isRouteActiveInTransition — real import ===');
{
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  assert("16a. the entering route ('bill') is active during its own Forward", isRouteActiveInTransition(midForward, 'bill'));
  assert("16b. the exiting route ('chooser') is active during that same Forward", isRouteActiveInTransition(midForward, 'chooser'));
  assert("16c. an unrelated, uninvolved route ('goal') is NOT active during bill's transition", !isRouteActiveInTransition(midForward, 'goal'));

  const settledOnBill: AddWorkspaceTransitionState = { current: 'bill', outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
  assert('16d. once settled (idle), the current route is still reported active (it is the front layer, driven at rest)', isRouteActiveInTransition(settledOnBill, 'bill'));
  assert('16e. once settled on bill, chooser is no longer active (outgoing cleared)', !isRouteActiveInTransition(settledOnBill, 'chooser'));

  const midBack = reduceAddWorkspaceTransition(settledOnBill, { type: 'BACK' });
  assert("16f. during Back, the exiting route ('bill', now outgoing) is still active", isRouteActiveInTransition(midBack, 'bill'));
  assert("16g. during Back, the entering route ('chooser', now current) is active", isRouteActiveInTransition(midBack, 'chooser'));
}

console.log('\n=== 17. isRouteSettledFront — real import (the ONLY state that should be interactive/accessible) ===');
{
  assert('17a. chooser is settled-front in the initial state', isRouteSettledFront(initialAddWorkspaceTransitionState, 'chooser'));
  for (const route of ALL_ROUTES) {
    assert(`17b. '${route}' is NOT settled-front in the initial (chooser-settled) state`, !isRouteSettledFront(initialAddWorkspaceTransitionState, route));
  }
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'creditCard' });
  assert('17c. mid-Forward, the entering route is NOT yet settled-front (status is transitioning, not idle)', !isRouteSettledFront(midForward, 'creditCard'));
  assert('17d. mid-Forward, chooser is NOT settled-front either (it is exiting)', !isRouteSettledFront(midForward, 'chooser'));
  const settled = reduceAddWorkspaceTransition(midForward, { type: 'TRANSITION_COMPLETE' });
  assert('17e. once settled, the entering route IS settled-front', isRouteSettledFront(settled, 'creditCard'));
}

console.log('\n=== 18. Every route is independently reachable and returnable — full round-trip coverage ===');
{
  for (const route of ALL_ROUTES) {
    let state = initialAddWorkspaceTransitionState;
    state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
    state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
    assert(`18. '${route}' completes a full Forward+Back round trip and returns exactly to the initial state`, JSON.stringify(state) === JSON.stringify(initialAddWorkspaceTransitionState));
  }
}

console.log("\n=== 19. Nested-handoff amendment — FORWARD accepts an explicit returnStack override, defaulting to ['chooser'] when omitted ===");
{
  const withReturnStack = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'liability', returnStack: ['bill', 'chooser'] });
  assert("19a. FORWARD with returnStack:['bill','chooser'] stores it verbatim on the new state", JSON.stringify(withReturnStack.returnStack) === JSON.stringify(['bill', 'chooser']));
  const withoutReturnStack = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'creditCard' });
  assert("19b. FORWARD with no returnStack defaults to ['chooser'] (every ordinary tile entry, unchanged)", JSON.stringify(withoutReturnStack.returnStack) === JSON.stringify(['chooser']));
}

console.log("\n=== 20. FORCE_TO_CHOOSER — host-only orchestration primitive for a handoff's intermediate step ===");
{
  const settledOnBill: AddWorkspaceTransitionState = { current: 'bill', outgoing: null, status: 'idle', direction: null, returnStack: ['chooser'] };
  const forced = reduceAddWorkspaceTransition(settledOnBill, { type: 'FORCE_TO_CHOOSER' });
  assert('20a. FORCE_TO_CHOOSER from a settled non-chooser route always targets chooser, regardless of returnStack', forced.current === 'chooser' && forced.outgoing === 'bill' && forced.status === 'transitioning' && forced.direction === 'back' && forced.returnStack.length === 0);
  const rejected = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORCE_TO_CHOOSER' });
  assert('20b. FORCE_TO_CHOOSER from chooser itself is a no-op, exactly like BACK', rejected === initialAddWorkspaceTransitionState);
  const midForward = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'goal' });
  const rejectedMidTransition = reduceAddWorkspaceTransition(midForward, { type: 'FORCE_TO_CHOOSER' });
  assert('20c. FORCE_TO_CHOOSER while already transitioning is rejected, exactly like BACK', rejectedMidTransition === midForward);
}

console.log('\n=== 21. Single-level handoff (Bill -> Liability) — BACK returns to the handoff source, not hardcoded chooser ===');
{
  // Simulates the host's own two-step handoff chain (FORCE_TO_CHOOSER then
  // FORWARD with an explicit returnStack override) — see
  // AddAnythingSheet.tsx's handoffToRoute for the full host-level sequence
  // this unit test exercises the reducer's own contribution to.
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("21a. settled on bill with returnStack ['chooser']", state.current === 'bill' && JSON.stringify(state.returnStack) === JSON.stringify(['chooser']));
  // Captured BEFORE forcing to chooser — this is exactly what the host
  // (handoffToRoute) must do, since FORCE_TO_CHOOSER itself clears
  // returnStack to [] and would otherwise discard bill's own inherited
  // level.
  const billReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("21b. forced back to chooser as the handoff's intermediate step, returnStack cleared", state.current === 'chooser' && state.returnStack.length === 0);
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("21c. settled on liability with returnStack ['bill','chooser'] (bill pushed onto its own inherited stack)", state.current === 'liability' && JSON.stringify(state.returnStack) === JSON.stringify(['bill', 'chooser']));
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert(
    "21d. BACK from liability (entered via the bill handoff) goes DIRECTLY to 'bill' — chooser is never current or outgoing during this transition",
    state.current === 'bill' && state.outgoing === 'liability' && state.status === 'transitioning' && state.direction === 'back'
  );
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("21e. settled on 'bill' with returnStack restored to ['chooser'] (bill's own original stack, untouched by the handoff) — Back from bill will now correctly go to chooser, not liability", state.current === 'bill' && JSON.stringify(state.returnStack) === JSON.stringify(['chooser']));
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("21f. BACK from 'bill' (this time a genuinely ordinary entry) correctly lands on chooser", state.current === 'chooser');
}

console.log('\n=== 22. A destination later re-entered directly from the chooser gets a fresh returnStack, even if it still holds a draft originally opened via a handoff ===');
{
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  const billReturnStack = state.returnStack; // captured BEFORE forcing to chooser, same as 21 above
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' }); // -> bill
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' }); // -> chooser
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('22a. back on chooser after the full round trip', state.current === 'chooser');
  // Re-entering liability directly from the chooser (no returnStack passed)
  // — even though its underlying draft still exists from the handoff
  // session, THIS forward transition's own returnStack correctly reflects
  // the current navigation path, not the draft's original origin.
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability' });
  assert("22b. re-entering liability directly from chooser sets returnStack to ['chooser'], not the stale ['bill']", JSON.stringify(state.returnStack) === JSON.stringify(['chooser']));
}

console.log('\n=== 23. REQUIRED — full nested handoff chain: chooser -> bill -> liability -> creditCard -> BACK -> liability -> BACK -> bill -> BACK -> chooser ===');
{
  // A single overwritten scalar returnTo field could not retain both
  // parent levels simultaneously — see the reducer's own returnStack doc
  // comment for the concrete failure trace this correction was written to
  // fix. This is the real-import proof that the array-based returnStack
  // design actually preserves every ancestor level through a two-level-
  // deep handoff, not just the immediate parent.
  let state = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'bill' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("23a. chooser -> bill: settled with returnStack ['chooser']", state.current === 'bill' && JSON.stringify(state.returnStack) === JSON.stringify(['chooser']));

  // Handoff 1: bill -> liability (host captures bill's own returnStack
  // BEFORE forcing back to chooser, then pushes 'bill' onto it).
  const billReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'liability', returnStack: ['bill', ...billReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("23b. bill -> liability: settled with returnStack ['bill','chooser'] — BOTH levels preserved", state.current === 'liability' && JSON.stringify(state.returnStack) === JSON.stringify(['bill', 'chooser']));

  // Handoff 2: liability -> creditCard (same pattern, one level deeper).
  const liabilityReturnStack = state.returnStack;
  state = reduceAddWorkspaceTransition(state, { type: 'FORCE_TO_CHOOSER' });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  state = reduceAddWorkspaceTransition(state, { type: 'FORWARD', route: 'creditCard', returnStack: ['liability', ...liabilityReturnStack] });
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("23c. liability -> creditCard: settled with returnStack ['liability','bill','chooser'] — all THREE levels preserved", state.current === 'creditCard' && JSON.stringify(state.returnStack) === JSON.stringify(['liability', 'bill', 'chooser']));

  // BACK #1: creditCard -> liability (NOT chooser — this is exactly the
  // failure a single scalar field would produce: it would resolve to
  // liability's own prior returnTo, 'bill', silently skipping liability
  // entirely, or break the FORWARD precondition outright).
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('23d. BACK from creditCard goes to liability (not chooser, not bill)', state.current === 'liability' && state.outgoing === 'creditCard');
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("23e. settled on liability, returnStack correctly restored to ['bill','chooser']", state.current === 'liability' && JSON.stringify(state.returnStack) === JSON.stringify(['bill', 'chooser']));

  // BACK #2: liability -> bill.
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('23f. BACK from liability goes to bill', state.current === 'bill' && state.outgoing === 'liability');
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert("23g. settled on bill, returnStack correctly restored to ['chooser']", state.current === 'bill' && JSON.stringify(state.returnStack) === JSON.stringify(['chooser']));

  // BACK #3: bill -> chooser.
  state = reduceAddWorkspaceTransition(state, { type: 'BACK' });
  assert('23h. BACK from bill goes to chooser', state.current === 'chooser' && state.outgoing === 'bill');
  state = reduceAddWorkspaceTransition(state, { type: 'TRANSITION_COMPLETE' });
  assert('23i. settled on chooser, returnStack empty — full chain unwound cleanly', state.current === 'chooser' && state.returnStack.length === 0);
}

console.log('\n=== 24. Direct Liability or Credit Card entry (no handoff) still Backs directly to the chooser ===');
{
  let liabilityState = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'liability' });
  liabilityState = reduceAddWorkspaceTransition(liabilityState, { type: 'TRANSITION_COMPLETE' });
  liabilityState = reduceAddWorkspaceTransition(liabilityState, { type: 'BACK' });
  assert('24a. direct-entry Liability Backs straight to chooser', liabilityState.current === 'chooser' && liabilityState.outgoing === 'liability');

  let creditCardState = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route: 'creditCard' });
  creditCardState = reduceAddWorkspaceTransition(creditCardState, { type: 'TRANSITION_COMPLETE' });
  creditCardState = reduceAddWorkspaceTransition(creditCardState, { type: 'BACK' });
  assert('24b. direct-entry Credit Card Backs straight to chooser', creditCardState.current === 'chooser' && creditCardState.outgoing === 'creditCard');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
