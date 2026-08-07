// Discard-warning correction + repayment-schedule contract — device
// recording (01:58-02:10) showed "Switch to Liability?" / "Your unsaved
// Liability changes will be discarded." repeatedly firing while backing
// out of an unsaved Personal Loan through the picker, Bill grid, and Add
// Anything chooser. Root cause: handleRequestLoanFromBill unconditionally
// showed presentSwitchGuard whenever Liability was already dirty-and-
// parked, regardless of whether the loan TYPE being tapped matched the
// dirty draft's own type — so continuing the SAME Personal Loan session
// (re-tapping "Personal Loan" from Bill's grid after backing out without
// discarding) was misread as a genuine cross-destination switch, and
// routeDisplayName('liability') always returned the generic "Liability"
// string rather than the loan's own customer-facing name. A second,
// related gap: reopenSource's "Keep editing" callback used a plain
// enterRoute, whose FORWARD precondition requires chooser as the origin —
// silently rejected when triggered from Bill's own grid (current !==
// chooser), meaning "Keep editing" could fail to actually reopen the
// dirty source in that specific context.
//
// The SAME round also replaces the "I'll add the repayment schedule
// later" checkbox (confirmed contradictory: still offered after a
// complete $50,000 / $250 / Fortnightly / 14 Aug 2026 schedule was
// entered) with an explicit optional-schedule contract: blank saves
// without a bill, any field touched requires the full set before Save,
// and a complete set always creates/updates exactly one linked bill —
// applied uniformly to Personal Loan, Mortgage, and Car Loan (the only
// three SMART_LOAN_TYPES this section has ever applied to).
//
// CLASSIFICATION:
// - Mirrored logic (Class B, per tests/README.md): the repayment-schedule
//   section (mirrorScheduleState below) reimplements
//   AddWealthItemModal.tsx's own repaymentScheduleTouched/Complete
//   computation verbatim and is exercised with REAL numeric inputs,
//   including the exact reported scenario — genuine proof the VALIDATION
//   MATH is correct, not just that the right source pattern exists. A
//   structural check ties the mirror to the shipped source's own
//   expression text so it cannot silently drift.
// - Structural (Class C): the discard-warning correction and the wiring
//   between the repayment-schedule computation and Save/canSave —
//   AddAnythingSheet.tsx and AddWealthItemModal.tsx are both .tsx and
//   cannot be imported under `tsx` (documented in tests/README.md).
// - "Editing the schedule updates the same bill without duplication"
//   (required test 11) is NOT re-tested here — it is already real-import
//   proven, unaffected by this round (AppStateContext.tsx untouched), by
//   tests/linked-repayment-persistence.test.ts's own "exactly one
//   existing match: a defined recurringItem UPDATES that exact id, in
//   place, no duplicate created" case.
//
// Physical-device retest remains required for the actual on-screen alert
// behaviour and Save flow.
//
// Run with: ./node_modules/.bin/tsx tests/discard-warning-and-repayment-schedule.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');

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

console.log('=== 1. Root cause fixed — same-loan-type reselect never warns (required tests 1, 2) ===');
{
  const body = functionBody('function handleRequestLoanFromBill(type: LiabilityType) {', SHEET_SRC);
  assert('1a. handleRequestLoanFromBill is found', body.length > 0);
  assert(
    "1b. the switch-guard condition now includes liabilityHandoffType !== type — re-tapping the SAME loan type that is already the dirty parked draft (e.g. continuing a Personal Loan session through Back -> picker -> Bill grid -> Personal Loan again) falls through to proceed() directly, never presentSwitchGuard",
    /if \(liabilityState\.everEnteredRef\.current && liabilityState\.isDirty && liabilityHandoffType !== type\) \{/.test(body)
  );
  assert('1c. proceed() (the plain, non-discarding handoff) is the function\'s only remaining fallthrough — reached whenever the guard condition above is false', /\n    proceed\(\);\s*\n  \}$/.test(body));
}

console.log('\n=== 2. Root cause fixed — Credit Card has no type variants, so its own dirty-parked draft can never warn either (required tests 1, 2) ===');
{
  const body = functionBody('function handleRequestCreditCardFromLiability() {', SHEET_SRC);
  assert('2a. handleRequestCreditCardFromLiability is found', body.length > 0);
  assert(
    "2b. the switch-guard branch (and its own dirty-state check) has been removed entirely — this function now unconditionally hands off to Credit Card, preserving whatever draft is already there (handoffToRoute never resets it), since there is only ever one possible Credit Card destination to protect",
    !/presentSwitchGuard/.test(body) && /handoffToRoute\('creditCard', \(\) => \{\s*\n\s*creditCardState\.everEnteredRef\.current = true;\s*\n\s*\}\);/.test(body)
  );
}

console.log('\n=== 3. Alert wording now names the customer-facing loan type, not generic "Liability" (required test 3) ===');
{
  assert(
    "3a. LIABILITY_DISPLAY_NAME is exported from AddWealthItemModal.tsx — the single source of truth for loan-type labels, reused rather than duplicated",
    /export const LIABILITY_DISPLAY_NAME: Record<LiabilityType, string> = \{/.test(WEALTH_SRC)
  );
  assert(
    '3b. AddAnythingSheet.tsx imports LIABILITY_DISPLAY_NAME from the same file',
    /import \{ AddWealthItemModal, AddWealthItemModalHandle, LIABILITY_DISPLAY_NAME \} from '\.\.\/wealth\/AddWealthItemModal';/.test(SHEET_SRC)
  );
  const body = functionBody('function routeDisplayName(route: AddWorkspaceRoute, presetType?: AssetType | LiabilityType): string {', SHEET_SRC);
  assert('3c. routeDisplayName is found with the widened presetType signature (AssetType | LiabilityType)', body.length > 0);
  assert(
    "3d. the liability branch resolves via LIABILITY_DISPLAY_NAME, falling back to the currently handed-off type — 'Liability' is now only ever a last-resort fallback when no type is known at all, never the label used for an actual Personal Loan/Mortgage/Car Loan alert",
    /if \(route === 'liability'\) \{\s*\n\s*const type = \(presetType as LiabilityType \| undefined\) \?\? liabilityHandoffType \?\? undefined;\s*\n\s*return type \? LIABILITY_DISPLAY_NAME\[type\] : 'Liability';\s*\n\s*\}/.test(body)
  );
  assert(
    "3e. handleRequestLoanFromBill's presentSwitchGuard call passes the SOURCE's own handed-off type and the TARGET's newly-tapped type separately — both resolve to their real loan names (e.g. 'Personal Loan' vs 'Car Loan'), never the generic string twice",
    /routeDisplayName\('liability', liabilityHandoffType \?\? undefined\),\s*\n\s*routeDisplayName\('liability', type\),/.test(SHEET_SRC)
  );
}

console.log("\n=== 4. Keep editing reopens the exact dirty draft even when triggered from a non-chooser origin (required test 5) ===");
{
  const body = functionBody('function reopenSource(route: Exclude<AddWorkspaceRoute, \'chooser\'>) {', SHEET_SRC);
  assert('4a. reopenSource is found', body.length > 0);
  assert(
    "4b. reopenSource now branches on transition.current: a plain enterRoute when already on chooser (every pre-existing caller, unchanged), or the SAME handoff mechanism an ordinary cross-destination handoff uses when triggered from within another active destination (e.g. Bill's own grid) — a plain enterRoute there would silently no-op against the reducer's own chooser-origin FORWARD precondition, which is exactly why 'Keep editing' needed this fix",
    /if \(transition\.current === 'chooser'\) \{\s*\n\s*enterRoute\(route\);\s*\n\s*\} else \{\s*\n\s*handoffToRoute\(route, \(\) => \{\}\);\s*\n\s*\}/.test(body)
  );
}

console.log('\n=== 5. Discard-orchestration mechanisms this correction must not disturb are still in place (required tests 4, 6, 7) ===');
{
  assert(
    '5a. presentSwitchGuard itself (rapid-tap guard, generation-safe Keep-editing/Discard-and-continue, one alert at a time) is untouched — grepped verbatim',
    /const pendingSwitchRef = useRef<number \| null>\(null\);\s*\n\s*const pendingSwitchGenerationRef = useRef\(0\);\s*\n\s*function presentSwitchGuard\(/.test(SHEET_SRC)
  );
  assert(
    '5b. presentDismissGuard (the complete-sheet dismissal guard, required test 4) is untouched — grepped verbatim',
    /function presentDismissGuard\(dirtyRoute: Exclude<AddWorkspaceRoute, 'chooser'>, wasActive: boolean\) \{/.test(SHEET_SRC)
  );
  assert(
    "5c. resetDraft (Discard's own 'reset exactly once' mechanism) is untouched, and handleRequestLoanFromBill's own Discard-and-continue branch still calls it exactly once before proceeding exactly once",
    /resetDraft\('liability'\);\s*\n\s*proceed\(\);/.test(SHEET_SRC)
  );
  assert(
    "5d. handleBack (every internal Back/re-navigation through the picker, Bill grid, and chooser) still calls no Alert/confirm/switch-guard function at all — the actual mechanism that made repeated ordinary Back navigation never warn in the first place, unchanged by this correction",
    !/Alert\.alert|presentSwitchGuard|presentDismissGuard|confirmDiscardIfDirty/.test(functionBody('function handleBack()', SHEET_SRC))
  );
}

// --- Mirrored logic (Class B) — repayment-schedule validation math -------
// Verbatim reimplementation of AddWealthItemModal.tsx's own
// repaymentScheduleTouched/repaymentScheduleComplete computation.
function mirrorScheduleState(repaymentAmount: string, repaymentDayOfMonth: string, repaymentNextDueDate: string | null, frequency: 'weekly' | 'fortnightly' | 'monthly') {
  const usesRepaymentDayOfMonth = frequency === 'monthly';
  const touched = repaymentAmount.trim().length > 0 || repaymentDayOfMonth.trim().length > 0 || repaymentNextDueDate !== null;
  const repaymentValue = parseFloat(repaymentAmount);
  const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
  const complete = !isNaN(repaymentValue) && repaymentValue > 0 && (usesRepaymentDayOfMonth ? repaymentDayValue >= 1 && repaymentDayValue <= 31 : !!repaymentNextDueDate);
  return { touched, complete, incomplete: touched && !complete };
}

console.log("\n=== 6. Mirror accuracy — the mirror's own expressions match the shipped source verbatim ===");
{
  assert(
    '6a. repaymentScheduleTouched matches the mirror\'s own "touched" expression exactly',
    /const repaymentScheduleTouched = repaymentAmount\.trim\(\)\.length > 0 \|\| repaymentDayOfMonth\.trim\(\)\.length > 0 \|\| repaymentNextDueDate !== null;/.test(WEALTH_SRC)
  );
  assert(
    '6b. repaymentScheduleComplete matches the mirror\'s own "complete" expression exactly',
    /!isNaN\(repaymentValue\) && repaymentValue > 0 && \(usesRepaymentDayOfMonth \? repaymentDayValue >= 1 && repaymentDayValue <= 31 : !!repaymentNextDueDate\);/.test(WEALTH_SRC)
  );
  assert(
    '6c. repaymentScheduleIncomplete is touched-but-not-complete, gated to loan types only (isNewLoan) — matches the mirror\'s own "incomplete" derivation',
    /const repaymentScheduleIncomplete = isNewLoan && repaymentScheduleTouched && !repaymentScheduleComplete;/.test(WEALTH_SRC)
  );
}

console.log('\n=== 7. Blank repayment schedule saves without a linked bill (required test 8) ===');
{
  const blank = mirrorScheduleState('', '', null, 'monthly');
  assert('7a. all fields blank: not touched', !blank.touched);
  assert('7b. all fields blank: not complete', !blank.complete);
  assert('7c. all fields blank: not incomplete (Save is never blocked)', !blank.incomplete);
}

console.log('\n=== 8. Partial repayment schedule blocks Save with inline validation (required test 9) ===');
{
  const amountOnly = mirrorScheduleState('250', '', null, 'fortnightly');
  assert('8a. amount entered, no date, fortnightly: touched', amountOnly.touched);
  assert('8b. amount entered, no date, fortnightly: not complete', !amountOnly.complete);
  assert('8c. amount entered, no date, fortnightly: incomplete — blocks Save', amountOnly.incomplete);

  const dateOnly = mirrorScheduleState('', '', '2026-08-14T00:00:00.000Z', 'fortnightly');
  assert('8d. date entered, no amount, fortnightly: touched', dateOnly.touched);
  assert('8e. date entered, no amount, fortnightly: incomplete — blocks Save', dateOnly.incomplete);

  const dayOutOfRange = mirrorScheduleState('3000', '35', '', 'monthly');
  assert('8f. amount entered, day-of-month out of 1-31 range: incomplete — blocks Save', dayOutOfRange.incomplete);
}

console.log('\n=== 9. Complete $50,000 loan / $250 Fortnightly / 14 August 2026 schedule creates exactly one linked bill (required test 10 — the exact reported scenario) ===');
{
  // Loan balance ($50,000) is the liability's own `value` field, unrelated
  // to the repayment schedule fields under test — confirms it plays no
  // part in touched/complete at all (matches "the repayment schedule
  // section is entirely about repaymentAmount/frequency/day/date").
  const complete = mirrorScheduleState('250', '', '2026-08-14T00:00:00.000Z', 'fortnightly');
  assert('9a. touched', complete.touched);
  assert('9b. complete', complete.complete);
  assert('9c. not incomplete — Save is allowed', !complete.incomplete);
  assert(
    '9d. hasRepaymentSchedule (the actual bill-creation gate in performSave) is SMART_LOAN_TYPES.includes(liabilityType) && repaymentScheduleComplete — reuses this exact same complete flag, so the reported scenario genuinely creates a bill',
    /const hasRepaymentSchedule = SMART_LOAN_TYPES\.includes\(liabilityType\) && repaymentScheduleComplete;/.test(WEALTH_SRC)
  );
}

console.log('\n=== 10. The checkbox is fully removed; "Clear repayment details" replaces it without touching persistence on its own (required tests 8, 9, 10) ===');
{
  assert("10a. addRepaymentLater no longer exists anywhere in the file", !/addRepaymentLater/.test(WEALTH_SRC));
  assert(
    "10b. the checkbox itself (the actual rendered Text/TouchableOpacity, not merely a comment referencing its removal) and its Ionicons checkbox/square-outline toggle are both gone",
    !/<Text style=\{styles\.deferRepaymentText\}>I'll add the repayment schedule later<\/Text>/.test(WEALTH_SRC) && !/name=\{addRepaymentLater/.test(WEALTH_SRC)
  );
  assert('10c. the section is now introduced as "Repayment schedule (optional)"', /<Text style=\{styles\.label\}>Repayment schedule \(optional\)<\/Text>/.test(WEALTH_SRC));
  assert(
    // Updated by the parked-draft/repayment-UX correction pass (2026-08-07):
    // clearRepaymentSchedule now also resets the new, purely cosmetic
    // repaymentFrequencyTouched flag (tests/parked-draft-and-repayment-ux.test.ts
    // §5g) — still no call to deleteRecurringItem or any liability-mutating
    // function anywhere in its body, so the original invariant this
    // assertion protects still holds.
    '10d. clearRepaymentSchedule only resets the local repayment fields (including the cosmetic repaymentFrequencyTouched flag) to blank — no call to deleteRecurringItem or any liability-mutating function, so it never touches an already-saved bill on its own (Save afterwards decides what to persist, same as every other field)',
    /function clearRepaymentSchedule\(\) \{\s*\n\s*setRepaymentAmount\(''\);\s*\n\s*setRepaymentFrequency\('monthly'\);\s*\n\s*setRepaymentFrequencyTouched\(false\);\s*\n\s*setRepaymentDayOfMonth\(''\);\s*\n\s*setRepaymentNextDueDate\(null\);\s*\n\s*\}/.test(WEALTH_SRC)
  );
  assert(
    '10e. canSave now blocks Save while repaymentScheduleIncomplete is true — the actual UI-level enforcement of "partial blocks Save"',
    /!hasAmbiguousLinkedRepayment &&[\s\S]{0,900}?!repaymentScheduleIncomplete;/.test(WEALTH_SRC)
  );
}

console.log('\n=== 11. The same contract applies uniformly to Personal Loan, Mortgage, and Car Loan (required test 12) ===');
{
  assert(
    "11a. the repayment section's own gate (isNewLoan) is SMART_LOAN_TYPES-based, not type-specific — the identical repaymentScheduleTouched/Complete/Incomplete computation and JSX apply to whichever of the three loan types is currently selected, with no separate branch per type",
    /const isNewLoan = kind === 'liability' && SMART_LOAN_TYPES\.includes\(liabilityType\) && !editLiability;/.test(WEALTH_SRC)
  );
  assert(
    '11b. hasRepaymentSchedule (the Save-time bill-creation gate) is likewise SMART_LOAN_TYPES-based, not type-specific',
    /const hasRepaymentSchedule = SMART_LOAN_TYPES\.includes\(liabilityType\) && repaymentScheduleComplete;/.test(WEALTH_SRC)
  );
  assert(
    "11c. SMART_LOAN_TYPES itself still names exactly the three required types — mortgage, car_loan, personal_loan — unchanged by this correction",
    /const SMART_LOAN_TYPES: LiabilityType\[\] = \['mortgage', 'car_loan', 'personal_loan'\];/.test(WEALTH_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
