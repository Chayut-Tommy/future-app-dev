// Discard-orchestration correction — physical-device recording showed
// "Discard Changes?" appearing after Back had already returned the user to
// the Add Anything chooser, and reappearing after returning from unrelated
// destinations, for both dirty AND untouched drafts (Personal Loan, Credit
// Card). Root cause (per the explicit correction request): Back must never
// itself be capable of showing a discard prompt, and a cross-destination
// switch must warn BEFORE any transition starts, present exactly once,
// reopen the dirty source on "Keep editing", and reset it exactly once on
// "Discard & continue" — none of which the Option B / full-workspace-
// extension architecture implemented correctly. This file is structural
// (Class C) proof that the rebuilt mechanism (presentSwitchGuard/
// resetDraft/reopenSource/handleBack/transition.returnTo) satisfies every
// item in the correction request's required-tests list.
//
// CLASSIFICATION: Class C (static/source-structure) throughout — proves
// the CODE PATH that would produce an alert versus the code path that
// cannot, not the actual on-device Alert/animation/focus behaviour.
// Physical-device retest is still required and is the actual proof of the
// original defect being fixed.
//
// Run with: ./node_modules/.bin/tsx tests/add-anything-sheet-discard-orchestration.test.ts

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

const SRC = readFileSync(srcPath('src/components/navigation/AddAnythingSheet.tsx'), 'utf-8');
const ADD_WEALTH_SRC = readFileSync(srcPath('src/components/wealth/AddWealthItemModal.tsx'), 'utf-8');
const CREDIT_CARD_SRC = readFileSync(srcPath('src/components/credit/AddCreditCardModal.tsx'), 'utf-8');
const KEYBOARD_SHEET_SRC = readFileSync(srcPath('src/components/shared/KeyboardSheet.tsx'), 'utf-8');
const QUICK_ADD_SRC = readFileSync(srcPath('src/components/dashboard/QuickAddModal.tsx'), 'utf-8');
const ADD_INCOME_SRC = readFileSync(srcPath('src/components/income/AddIncomeModal.tsx'), 'utf-8');
const ADD_RECURRING_SRC = readFileSync(srcPath('src/components/money/AddRecurringItemModal.tsx'), 'utf-8');

function functionBody(fnSignature: string, srcText: string = SRC): string {
  const start = srcText.indexOf(fnSignature);
  if (start === -1) return '';
  // Find the matching closing brace by simple depth counting from the
  // function's own opening brace.
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

console.log('=== 1. Clean destination -> Back -> chooser: no Alert (Class C) ===');
{
  const body = functionBody('function handleBack()');
  assert('1a. handleBack() is found and non-empty', body.length > 0);
  assert('1b. handleBack() never calls Alert.alert, presentSwitchGuard, or confirmDiscardIfDirty — Back cannot show a prompt under any condition', !/Alert\.alert|presentSwitchGuard|confirmDiscardIfDirty/.test(body));
  assert('1c. handleBack() never even reads isDirty on any destination — dirty state is irrelevant to whether Back is allowed to proceed', !/\.isDirty\b/.test(body));
}

console.log('\n=== 2. Dirty destination -> Back -> chooser: no Alert, draft preserved (Class C) ===');
{
  const body = functionBody('function handleBack()');
  assert('2a. handleBack() never sets any destination\'s everEnteredRef to false — nothing is discarded by Back', !/everEnteredRef\.current = false/.test(body));
  assert('2b. handleBack() never calls resetDraft — a destination\'s form state is never reset merely by Back', !/resetDraft\(/.test(body));
  assert(
    "2c. handleBack() targets transition.returnStack[0] (captured before dispatch) — the SAME primitive for every Back, dirty or clean, never branching on dirty state at all",
    /const targetRoute = transition\.returnStack\[0\];/.test(body)
  );
}

console.log('\n=== 3. Same tile restores the draft without Alert (Class C) ===');
{
  const body = functionBody('function reselectOrEnter(route: Exclude<AddWorkspaceRoute, \'chooser\' | \'transfer\' | \'asset\'>, fromCatalogue: boolean)');
  assert('3a. reselectOrEnter is found', body.length > 0);
  const ifAlreadyEntered = body.match(/if \(state\.everEnteredRef\.current\) \{([\s\S]*?)\}/);
  assert('3b. the already-entered branch is found', !!ifAlreadyEntered);
  assert(
    '3c. the already-entered (same destination) branch calls enterRoute directly — no presentSwitchGuard, no Alert, in that branch',
    !!ifAlreadyEntered && !/presentSwitchGuard|Alert\.alert/.test(ifAlreadyEntered[1]) && /enterRoute\(route, fromCatalogue, commit\);/.test(ifAlreadyEntered[1])
  );
}

console.log('\n=== 4. A different tile warns BEFORE the forward transition starts (Class C) ===');
{
  const body = functionBody('function reselectOrEnter(route: Exclude<AddWorkspaceRoute, \'chooser\' | \'transfer\' | \'asset\'>, fromCatalogue: boolean)');
  assert(
    '4a. presentSwitchGuard is called BEFORE enterRoute(route, commit) in the discard branch — the warning is shown before any transition begins, not after',
    (() => {
      const guardIdx = body.indexOf('presentSwitchGuard(');
      const secondEnterRouteIdx = body.indexOf('enterRoute(route, fromCatalogue, commit);', body.indexOf('if (dirty)'));
      return guardIdx !== -1 && secondEnterRouteIdx !== -1 && guardIdx < secondEnterRouteIdx;
    })()
  );
  assert(
    "4b. presentSwitchGuard itself calls Alert.alert synchronously, before returning — dispatched immediately, not deferred to a later effect/transition-completion callback",
    (() => {
      const psg = functionBody('function presentSwitchGuard(sourceLabel: string, targetLabel: string, onKeepEditing: () => void, onDiscardAndContinue: () => void)');
      return /Alert\.alert\(`Switch to \$\{targetLabel\}\?`, `Your unsaved \$\{sourceLabel\} changes will be discarded\.`, \[/.test(psg);
    })()
  );
}

console.log('\n=== 5. "Keep editing" reopens the exact dirty source draft (Class C) ===');
{
  assert(
    "5a. reopenSource is a plain enterRoute(route) restore when the dismissal originated from the chooser (the same \"same destination reselect\" path every ordinary tile-driven Keep-editing uses) — correction pass: it now ALSO handles being invoked from within another active, non-chooser destination (handleRequestLoanFromBill, called while Bill itself is current), where a plain enterRoute would silently no-op against the reducer's own chooser-origin FORWARD precondition, by reusing the same handoff mechanism an ordinary cross-destination handoff already uses in that case",
    /function reopenSource\(route: Exclude<AddWorkspaceRoute, 'chooser'>\) \{\s*\n\s*if \(transition\.current === 'chooser'\) \{[\s\S]{0,200}?enterRoute\(route, true\);\s*\n\s*\} else \{\s*\n\s*handoffToRoute\(route, \(\) => \{\}\);\s*\n\s*\}\s*\n\s*\}/.test(SRC)
  );
  assert(
    "5b. reselectOrEnter's Keep-editing callback is () => reopenSource(dirty.route) — reopens the SOURCE, not the requested target",
    /\(\) => reopenSource\(dirty\.route\),/.test(SRC)
  );
  assert(
    "5c. presentSwitchGuard's Keep-editing button handler is generation-guarded (ignores a stale/superseded alert) before calling onKeepEditing",
    /text: 'Keep editing',\s*\n\s*style: 'cancel',\s*\n\s*onPress: \(\) => \{\s*\n\s*if \(pendingSwitchRef\.current !== myGeneration\) return; \/\/ stale — superseded since this alert was shown\s*\n\s*pendingSwitchRef\.current = null;\s*\n\s*onKeepEditing\(\);/.test(SRC)
  );
}

console.log('\n=== 6. "Discard & continue" resets the source exactly once and opens the pending target exactly once (Class C) ===');
{
  assert(
    "6a. reselectOrEnter's Discard-and-continue callback calls resetDraft(dirty.route) exactly once, then enterRoute(route, commit) exactly once — one reset, one transition",
    /\(\) => \{\s*\n\s*resetDraft\(dirty\.route\);\s*\n\s*enterRoute\(route, fromCatalogue, commit\);\s*\n\s*\}/.test(SRC)
  );
  assert(
    "6b. resetDraft bumps the destination's own instanceKey exactly once per call — forces a full unmount+remount, the only complete reset mechanism available",
    // Wave 3: 'transfer' is no longer excluded — it parks and resets like
    // every other draft. The exactly-once instanceKey bump is unchanged.
    /function resetDraft\(route: Exclude<AddWorkspaceRoute, 'chooser'>\) \{\s*\n\s*draftStateFor\(route\)\.setInstanceKey\(\(k\) => k \+ 1\);\s*\n\s*\}/.test(SRC)
  );
  assert(
    "6c. presentSwitchGuard's Discard & continue button handler is generation-guarded before calling onDiscardAndContinue — a stale alert cannot fire a reset+transition after being superseded",
    /text: 'Discard & continue',\s*\n\s*style: 'destructive',\s*\n\s*onPress: \(\) => \{\s*\n\s*if \(pendingSwitchRef\.current !== myGeneration\) return;\s*\n\s*pendingSwitchRef\.current = null;\s*\n\s*onDiscardAndContinue\(\);/.test(SRC)
  );
}

console.log('\n=== 7. Asset tiles use the SAME global dirty-destination guard (Class C, closes the previously-disclosed gap) ===');
{
  const body = functionBody('function chooseAssetTile(tileKey: AddAnythingKind, fromCatalogue: boolean)');
  assert('7a. chooseAssetTile is found', body.length > 0);
  assert(
    "7b. chooseAssetTile checks findParkedDirtyDraft('asset') (excluding Asset's own dirty state) BEFORE reaching the inner type-vs-type decision",
    /const otherDirty = findParkedDirtyDraft\('asset'\);/.test(body)
  );
  assert(
    '7c. when another destination is dirty, chooseAssetTile presents the SAME presentSwitchGuard confirmation (reopen on Keep editing, reset-once on Discard & continue) before proceeding to the inner decision',
    /if \(otherDirty\) \{\s*\n\s*presentSwitchGuard\(\s*\n\s*routeDisplayName\(otherDirty\.route\),\s*\n\s*routeDisplayName\('asset', presetType\),\s*\n\s*\(\) => reopenSource\(otherDirty\.route\),\s*\n\s*\(\) => \{\s*\n\s*resetDraft\(otherDirty\.route\);\s*\n\s*proceedWithAssetTileDecision\(tileKey, presetType, fromCatalogue\);/.test(body)
  );
}

console.log('\n=== 8. Full-sheet dismissal still warns before closing, and now reopens a PARKED dirty draft (Class C, Defect 1 fix) ===');
{
  assert(
    '8a. the outer KeyboardSheet receives isDirty (for the swipe pre-check) and delegates the entire dismiss decision to handleRequestDismiss — no more discardTitle/discardMessage props, since the host now owns the alert copy itself',
    /isDirty=\{sheetIsDirty\}/.test(SRC) && /onRequestDismiss=\{handleRequestDismiss\}/.test(SRC) && !/discardTitle=\{sheetDiscardTitle\}/.test(SRC) && !/discardMessage=\{sheetDiscardMessage\}/.test(SRC)
  );
  assert(
    '8b. handleRequestDismiss closes immediately when nothing is dirty, otherwise computes dirtyRoute from activeRouteIsDirty (the ACTIVE route) or parkedDirtyDraft (a route PARKED behind the chooser) and routes through presentDismissGuard with wasActive so the guard knows whether to reopen',
    /function handleRequestDismiss\(\) \{\s*\n\s*if \(!sheetIsDirty\) \{\s*\n\s*handleRequestClose\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*const dirtyRoute = \(activeRouteIsDirty \? transition\.current : parkedDirtyDraft\?\.route\)/.test(SRC) &&
      /presentDismissGuard\(dirtyRoute, activeRouteIsDirty\);/.test(SRC)
  );
  assert(
    "8c. presentDismissGuard's Keep-editing handler only calls reopenSource when the dirty route was NOT already active — an already-active dirty route just needs the dismissal cancelled, matching the requirement that Cancel-while-active stays put",
    /if \(!wasActive\) reopenSource\(dirtyRoute\);/.test(SRC)
  );
  assert(
    "8d. presentDismissGuard's Discard handler resets the dirty route exactly once (now including 'transfer') and closes the whole journey exactly once via handleRequestClose",
    // Wave 3: the transfer carve-out is gone — Move money now has its own
    // instanceKey, so the Discard handler resets EVERY dirty route the same
    // way. Still exactly one reset and exactly one journey close.
    /resetDraft\(dirtyRoute\); \/\/ transfer now parks and resets like every other draft\s*\n\s*handleRequestClose\(\);/.test(SRC)
  );
  assert(
    "8e. presentDismissGuard uses the SAME per-destination DISCARD_COPY table every other discard path uses (e.g. 'Discard this card?') — not a generic fallback",
    /const copy = DISCARD_COPY\[dirtyRoute\];\s*\n\s*Alert\.alert\(copy\.title, copy\.message, \[/.test(SRC)
  );
}

console.log("\n=== 8f. Rapid dismiss attempts cannot stack duplicate alerts, and a stale callback from a superseded/earlier session cannot act (Class C, required tests 7 & 8) ===");
{
  assert(
    '8f-1. presentDismissGuard checks pendingDismissRef.current !== null and returns immediately — a second dismiss attempt while an alert is already showing is a no-op',
    /function presentDismissGuard\(dirtyRoute: Exclude<AddWorkspaceRoute, 'chooser'>, wasActive: boolean\) \{\s*\n\s*if \(pendingDismissRef\.current !== null\) return; \/\/ an alert is already showing — rapid-tap guard/.test(SRC)
  );
  assert(
    '8f-2. presentDismissGuard captures its own generation (pendingDismissGenerationRef) at call time, and BOTH button handlers re-check it against pendingDismissRef.current before acting',
    /const myGeneration = \+\+pendingDismissGenerationRef\.current;\s*\n\s*pendingDismissRef\.current = myGeneration;/.test(SRC) &&
      (SRC.match(/if \(pendingDismissRef\.current !== myGeneration\) return;/g) || []).length === 2
  );
  assert(
    '8f-3. the fresh-open effect nulls pendingDismissRef on every reopen (mirrors the existing pendingSwitchRef reset) — a callback from an alert left open across a close/reopen cycle can never act on the new session',
    /pendingDismissRef\.current = null;/.test(SRC)
  );
}

console.log('\n=== 8g. Dismissal presentation — a dirty interactive swipe never shows the host alert while the sheet is still mid-motion (Class C, dismissal-presentation requirement) ===');
{
  assert(
    '8g-1. KeyboardSheet exposes an onRequestDismiss prop that, when supplied, requestClose() delegates to it in full instead of running its own confirmDiscardIfDirty flow',
    /function requestClose\(\) \{\s*\n\s*if \(onRequestDismiss\) \{\s*\n\s*onRequestDismiss\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*confirmDiscardIfDirty\(isDirty, dismiss, discardTitle, discardMessage\);/.test(KEYBOARD_SHEET_SRC)
  );
  assert(
    // Pass 2E — springBack now branches on Reduce Motion (an instant
    // duration-0 timing reset instead of the spring/bounce animation), but
    // onComplete is still invoked exactly once, only via that single
    // animation's own .start() callback, once it has actually finished —
    // never a bare synchronous call, in either branch.
    '8g-2. springBack now accepts an onComplete callback, invoked only once the spring-to-rest (or, under Reduce Motion, instant-reset) animation has actually finished',
    /function springBack\(onComplete\?: \(\) => void\) \{[\s\S]*?const animation = reduceMotion\s*\n\s*\? Animated\.timing\(translateY, \{ toValue: 0, duration: 0, useNativeDriver: true \}\)\s*\n\s*: Animated\.spring\(translateY, \{ toValue: 0, useNativeDriver: true, bounciness: 6 \}\);\s*\n\s*animation\.start\(\(\) => \{\s*\n\s*onComplete\?\.\(\);/.test(KEYBOARD_SHEET_SRC)
  );
  assert(
    '8g-3. on a dirty interactive swipe-dismiss, the delegated path calls springBack(...) and only invokes onRequestDismissRef.current INSIDE that completion callback — never both at once, so the sheet is always fully settled before any host-owned alert can appear',
    /if \(onRequestDismissRef\.current\) \{[\s\S]*?if \(isDirtyRef\.current\) \{\s*\n\s*springBack\(\(\) => onRequestDismissRef\.current\?\.\(\)\);\s*\n\s*\} else \{\s*\n\s*dismiss\(\);/.test(KEYBOARD_SHEET_SRC)
  );
}

console.log('\n=== 9. A successful Save never warns (Class C) ===');
{
  const body = functionBody('function handleSaveSuccessClose()');
  assert('9a. handleSaveSuccessClose is found', body.length > 0);
  assert('9b. handleSaveSuccessClose never calls Alert.alert, presentSwitchGuard, or confirmDiscardIfDirty — success always closes directly, never through a discard path', !/Alert\.alert|presentSwitchGuard|confirmDiscardIfDirty/.test(body));
}

console.log('\n=== 10. Dirty-state accuracy — Liability and Credit Card compute isDirty purely from field comparisons, never from canSave/title/route-transition state (Class C) ===');
{
  assert(
    "10a. AddWealthItemModal's isDirty is a pure comparison of label/value/interestRate against initialSnapshot — never references canSave, title, formStep, or any route/transition-related identifier",
    (() => {
      const start = ADD_WEALTH_SRC.indexOf('const isDirty =');
      const end = ADD_WEALTH_SRC.indexOf(';', start);
      const expr = ADD_WEALTH_SRC.slice(start, end + 1);
      return /label !== initialSnapshot\.current\.label/.test(expr) && !/canSave|title|formStep/.test(expr);
    })()
  );
  assert(
    "10b. AddCreditCardModal's isDirty is embedded-gated and a pure field-vs-snapshot comparison — never references canSave or title",
    (() => {
      const start = CREDIT_CARD_SRC.indexOf('const isDirty =');
      const end = CREDIT_CARD_SRC.indexOf(';', start);
      const expr = CREDIT_CARD_SRC.slice(start, end + 1);
      return /embedded &&/.test(expr) && /issuer !== initialSnapshot\.current\.issuer/.test(expr) && !/canSave|title/.test(expr);
    })()
  );
  assert(
    'BONUS 10c. AddCreditCardModal\'s reset-on-open effect sets initialSnapshot to the SAME blank literals used to initialise state — untouched entry cannot start dirty',
    /initialSnapshot\.current = \{ issuer: '', limit: '', balance: '', dueDay: '', expectedRepayment: '', minRequiredPayment: '', apr: '' \};/.test(CREDIT_CARD_SRC)
  );
}

console.log('\n=== 11. Rapid taps cannot produce duplicate alerts or transitions (Class C) ===');
{
  assert(
    '11a. presentSwitchGuard checks pendingSwitchRef.current !== null and returns immediately — a second tap while an alert is already showing is a no-op, never a second Alert.alert call',
    /function presentSwitchGuard\(sourceLabel: string, targetLabel: string, onKeepEditing: \(\) => void, onDiscardAndContinue: \(\) => void\) \{\s*\n\s*if \(pendingSwitchRef\.current !== null\) return; \/\/ an alert is already showing — rapid-tap guard/.test(SRC)
  );
  assert('11b. enterRoute still checks selectionLockRef first, synchronously, before any transition begins — unchanged first-tap-wins guard for the transition itself', /function enterRoute\(route: AddWorkspaceRoute, fromCatalogue: boolean, onCommit\?: \(\) => void\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins/.test(SRC));
}

console.log('\n=== 12. Stale Alert callbacks cannot open an old pending destination (Class C) ===');
{
  assert(
    '12a. presentSwitchGuard captures its own generation (pendingSwitchGenerationRef) at call time, and BOTH button handlers re-check it against pendingSwitchRef.current before acting',
    /const myGeneration = \+\+pendingSwitchGenerationRef\.current;\s*\n\s*pendingSwitchRef\.current = myGeneration;/.test(SRC) &&
      (SRC.match(/if \(pendingSwitchRef\.current !== myGeneration\) return;/g) || []).length === 2
  );
  assert('12b. a fresh presentSwitchGuard call (e.g. from a later, different tile tap) always overwrites pendingSwitchRef with a NEW generation, naturally invalidating any earlier alert\'s stale callbacks', /pendingSwitchRef\.current = myGeneration;/.test(SRC));
}

console.log('\n=== 13. Credit Card -> Liability and Liability -> Bill reverse handoffs work (Class C; forward-direction reducer contract real-import tested in add-workspace-transition-controller.test.ts §19-24) ===');
{
  assert("13a. Bill's handoff into Liability calls the 2-arg handoffToRoute('liability', prepare) — the reducer itself derives the returnStack (nested-handoff amendment), not a literal 'bill' passed by the caller", /handoffToRoute\('liability', \(\) => \{/.test(SRC));
  assert("13b. Liability's handoff into Credit card calls the 2-arg handoffToRoute('creditCard', prepare) — same pattern", /handoffToRoute\('creditCard', \(\) => \{/.test(SRC));
  assert(
    "13f. handoffToRoute itself captures leavingRoute/inheritedStack from transition.current/transition.returnStack BEFORE dispatching FORCE_TO_CHOOSER (which clears returnStack) — this is what preserves every ancestor level through a nested handoff",
    /function handoffToRoute\(nextRoute: AddWorkspaceRoute, prepare: \(\) => void\) \{[\s\S]*?const leavingRoute = transition\.current;\s*\n\s*const inheritedStack = transition\.returnStack;\s*\n\s*const backGeneration = \+\+generationRef\.current;\s*\n\s*dispatchTransition\(\{ type: 'FORCE_TO_CHOOSER' \}\);/.test(SRC)
  );
  assert(
    "13g. handoffToRoute's FORWARD passes [leavingRoute, ...inheritedStack] as the new route's explicit returnStack override",
    /beginForwardTransition\(nextRoute, \[leavingRoute, \.\.\.inheritedStack\]\);/.test(SRC)
  );
  assert(
    "13c. Credit card's own Back row calls creditCardModalRef.current?.requestClose('back') — routes through the SAME generic handleConfirmedClose/handleBack primitive that reads transition.returnStack[0], no destination-specific Back logic",
    /\(\) => creditCardModalRef\.current\?\.requestClose\('back'\),/.test(SRC)
  );
  assert(
    "13d. Liability's own Back row calls liabilityModalRef.current?.requestClose('back') — same generic primitive",
    /\(\) => liabilityModalRef\.current\?\.requestClose\('back'\),/.test(SRC)
  );
  assert('13e. handleConfirmedClose maps every embedded form\'s \'back\' reason to the SAME handleBack() — one Back implementation for every destination, direct or handed-off', /function handleConfirmedClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*handleBack\(\);/.test(SRC));
}

console.log('\n=== 14. Direct destination entry still returns to the chooser (Class C) ===');
{
  assert(
    // INVERTED (Wave 3, D5-001): the obsolete contract asserted that a
    // missing returnStack defaults to ['chooser']. That default WAS the
    // defect. enterRoute now passes the stack explicitly from origin.
    '14a. enterRoute passes the return stack EXPLICITLY from origin — ["chooser"] only for a catalogue selection, [] for a direct quick/contextual entry',
    /function enterRoute\(route: AddWorkspaceRoute, fromCatalogue: boolean, onCommit\?: \(\) => void\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins\s*\n\s*selectionLockRef\.current = true;\s*\n\s*onCommit\?\.\(\);\s*\n\s*beginForwardTransition\(route, fromCatalogue \? \['chooser'\] : \[\]\);\s*\n\s*\}/.test(SRC)
  );
  assert(
    // INVERTED (Wave 3 closure): the six asset destinations reach the
    // workspace through proceedIntoAddAsset rather than enterRoute, so they
    // need the SAME explicit origin seeding. Omitting it is exactly what left
    // a catalogue-selected "Add everyday account" with no Back on device.
    "14b. proceedIntoAddAsset seeds the return stack from origin too — ['chooser'] for a catalogue selection, [] for a direct entry",
    /beginForwardTransition\('asset', fromCatalogue \? \['chooser'\] : \[\]\);\s*\n\s*\}/.test(SRC)
  );
}

console.log("\n=== 15. Defect 2 fix — multi-step embedded forms latch their dirty state so it survives internal Back/step navigation (Class C, required tests 1 & 2) ===");
{
  const forms: { name: string; src: string; latchGuard: RegExp }[] = [
    { name: 'QuickAddModal (Expense / Income received)', src: QUICK_ADD_SRC, latchGuard: /if \(embedded && isDirty\) hasBeenDirtyRef\.current = true;\s*\n\s*const reportedDirty = embedded \? hasBeenDirtyRef\.current : isDirty;/ },
    { name: 'AddIncomeModal (Income source)', src: ADD_INCOME_SRC, latchGuard: /if \(embedded && isDetailsDirty\) hasBeenDirtyRef\.current = true;\s*\n\s*const reportedDirty = embedded \? hasBeenDirtyRef\.current : isDetailsDirty;/ },
    { name: 'AddRecurringItemModal (Bill)', src: ADD_RECURRING_SRC, latchGuard: /if \(isDirty\) hasBeenDirtyRef\.current = true;\s*\n\s*const reportedDirty = embedded \? hasBeenDirtyRef\.current : isDirty;/ },
  ];
  for (const form of forms) {
    assert(`15a. ${form.name} declares a hasBeenDirtyRef latch, set true once the aggregate draft is ever dirty, that reportedDirty then reads from instead of the live boolean`, /const hasBeenDirtyRef = useRef\(false\);/.test(form.src) && form.latchGuard.test(form.src));
    assert(`15b. ${form.name} reports reportedDirty (not the raw live value) to the host via onDirtyChange — this is what the global parked-draft guard actually sees`, /onDirtyChange\?\.\(reportedDirty\);/.test(form.src));
  }
  assert(
    "15c. QuickAddModal's standalone <KeyboardSheet isDirty={isDirty}> usage is left on the raw value — the latch is embedded-only, matching the explicit requirement not to change standalone dismiss behaviour",
    /isDirty=\{isDirty\}/.test(QUICK_ADD_SRC)
  );
  assert(
    "15d. AddIncomeModal's standalone requestCancel/local Cancel-while-active gate still reads the raw isDetailsDirty, not the latch — only the HOST-facing report changed",
    /confirmDiscardIfDirty\(isDetailsDirty, onClose, 'Discard income\?', 'Your entered income details will be lost\.'\);/.test(ADD_INCOME_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
