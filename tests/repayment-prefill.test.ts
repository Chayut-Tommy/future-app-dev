// VID-001 correction — existing linked-repayment prefill for Add Bill ->
// Mortgage/Car Loan/Personal Loan -> select an existing liability.
//
// DURABLE LOCATION — relocated from the session scratchpad into this
// tracked `tests/` directory during checkpoint preparation, so this
// coverage survives across sessions. Content unchanged from its proven,
// passing form; only this header and the cross-reference below were
// added.
//
// HARNESS LIMITATION: this repo has no test framework and
// AddWealthItemModal.tsx cannot be imported under plain `npx tsx` — it
// transitively imports the `react-native` package, whose own entry point
// (node_modules/react-native/index.js) uses Flow syntax esbuild/tsx
// cannot parse outside Metro's Babel pipeline. Verified empirically:
// importing the real file throws `Unexpected "typeof"` inside
// react-native/index.js before any of our own code is even reached. No
// React render, no simulated tap, no verification of actual on-screen
// output is possible with this harness — that remains device-only.
//
// What genuine behavioural coverage IS possible: findLinkedRepayment and
// prefillValuesFromRepayment (in AddWealthItemModal.tsx) are pure
// functions with no React/RN dependency in their own bodies, but they are
// co-located in a file that cannot be imported. This file MIRRORS them
// verbatim (copied from the production source, cited by line number
// below) and runs real assertions against constructed RecurringItem[]
// fixtures and real Date-derived outputs. This proves the mirrored
// algorithm is correct. It does NOT prove the mirror is byte-identical to
// the shipped function — that gap is narrowed by the structural
// assertions in section 8 (confirming the exact call sites still exist).
//
// Since this checkpoint pass, the PERSISTENCE half of this same fix
// (upsertLinkedRecurringItem, updateLinkedRepaymentOnlyTransition,
// renameLinkedRepaymentIfUnambiguous — all in AppStateContext.tsx) now
// has REAL, non-mirrored import coverage instead: see
// tests/linked-repayment-persistence.test.ts. AppStateContext.tsx does
// not transitively import react-native itself (only
// @react-native-async-storage/async-storage, whose package entry does
// not hit the same Flow-syntax problem) and loads cleanly under tsx —
// confirmed empirically. That file exercises the exact same-shaped
// duplicate/no-op/exact-identity scenarios this file's findLinkedRepayment
// mirror covers, against the real production functions, closing the gap
// this file's own section 8 could only partially close via source-pattern
// matching.
//
// CLASSIFICATION:
// - Sections 1-7 (mirrored-logic assertions): genuine behavioural testing
//   of the pure decision algorithm, real inputs -> real outputs, but
//   against a copy of AddWealthItemModal.tsx's prefill logic specifically
//   (the form-layer half — the persistence half is now real-imported, see
//   above).
// - Section 8 (structural/source-inspection): confirms the real file
//   contains and wires the same logic the mirror tests just proved
//   correct. Do NOT read section 8 assertions as proof of runtime/visual
//   behaviour on their own.
//
// Run with: npx tsx tests/repayment-prefill.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const WEALTH_MODAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');

// ---------------------------------------------------------------------
// Mirrored production logic (verbatim copy of the findLinkedRepayment /
// prefillValuesFromRepayment pair in AddWealthItemModal.tsx).
// ---------------------------------------------------------------------
type PayFrequency = 'weekly' | 'fortnightly' | 'monthly';
interface RecurringItem {
  id: string;
  type: 'income' | 'expense';
  label: string;
  amount: number;
  frequency: PayFrequency;
  nextDueDate: string;
  isFixed: boolean;
  active: boolean;
  linkedLiabilityId?: string;
  scheduleAnchorDay?: number;
}

type LinkedRepaymentLookup = { status: 'none' } | { status: 'one'; repayment: RecurringItem } | { status: 'ambiguous' };

function findLinkedRepayment(recurringItems: RecurringItem[], liabilityId: string): LinkedRepaymentLookup {
  const matches = recurringItems.filter((r) => r.linkedLiabilityId === liabilityId);
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'one', repayment: matches[0] };
}

interface RepaymentPrefill {
  amount: string;
  frequency: PayFrequency;
  dayOfMonth: string;
  nextDueDate: string | null;
}

function prefillValuesFromRepayment(repayment: RecurringItem): RepaymentPrefill {
  if (repayment.frequency === 'monthly') {
    const day = repayment.scheduleAnchorDay ?? new Date(repayment.nextDueDate).getDate();
    return { amount: String(repayment.amount), frequency: repayment.frequency, dayOfMonth: String(day), nextDueDate: null };
  }
  return { amount: String(repayment.amount), frequency: repayment.frequency, dayOfMonth: '', nextDueDate: repayment.nextDueDate };
}

function mortgage(id: string, patch: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id,
    type: 'expense',
    label: 'CBA Richmond Test repayment',
    amount: 3000,
    frequency: 'monthly',
    nextDueDate: '2026-08-03T00:00:00.000Z',
    isFixed: true,
    active: true,
    linkedLiabilityId: 'liab-1',
    scheduleAnchorDay: 3,
    ...patch,
  };
}

console.log('=== 1. Mortgage, one linked monthly repayment: amount 3000 / monthly / anchor day 3 ===');
{
  const items = [mortgage('r1')];
  const lookup = findLinkedRepayment(items, 'liab-1');
  assert('1a. lookup resolves to exactly one match', lookup.status === 'one');
  if (lookup.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookup.repayment);
    assert('1b. amount prefills as "3000"', prefill.amount === '3000');
    assert('1c. frequency prefills as monthly', prefill.frequency === 'monthly');
    assert('1d. dayOfMonth prefills as "3" (from scheduleAnchorDay, not derived from nextDueDate)', prefill.dayOfMonth === '3');
    assert('1e. nextDueDate stays null for a monthly repayment (day-of-month field owns it instead)', prefill.nextDueDate === null);
  }
}

console.log('\n=== 2. Month-end repayment: anchor day 31, nextDueDate clamped to Feb — reopened form must show day 31 ===');
{
  const items = [mortgage('r2', { nextDueDate: '2026-02-28T00:00:00.000Z', scheduleAnchorDay: 31 })];
  const lookup = findLinkedRepayment(items, 'liab-1');
  assert('2a. lookup resolves to exactly one match', lookup.status === 'one');
  if (lookup.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookup.repayment);
    assert('2b. dayOfMonth prefills as "31" — the preserved anchor, not "28" derived from the clamped Feb date', prefill.dayOfMonth === '31');
    assert('2c. does NOT silently fall back to deriving 28 from nextDueDate when scheduleAnchorDay is present', prefill.dayOfMonth !== '28');
  }
  const itemsLeap = [mortgage('r2b', { nextDueDate: '2028-02-29T00:00:00.000Z', scheduleAnchorDay: 31 })];
  const lookupLeap = findLinkedRepayment(itemsLeap, 'liab-1');
  if (lookupLeap.status === 'one') {
    const prefillLeap = prefillValuesFromRepayment(lookupLeap.repayment);
    assert('2d. leap-year Feb 29 clamp: dayOfMonth still prefills as "31", not "29"', prefillLeap.dayOfMonth === '31');
  }
  const itemsLegacy = [mortgage('r2c', { nextDueDate: '2026-04-15T00:00:00.000Z', scheduleAnchorDay: undefined })];
  const lookupLegacy = findLinkedRepayment(itemsLegacy, 'liab-1');
  if (lookupLegacy.status === 'one') {
    const prefillLegacy = prefillValuesFromRepayment(lookupLegacy.repayment);
    assert('2e. legacy data with no scheduleAnchorDay falls back to nextDueDate\'s own day-of-month (15)', prefillLegacy.dayOfMonth === '15');
  }
}

console.log('\n=== 3. Weekly / fortnightly repayment: correct frequency + correct next-due date ===');
{
  const weekly = [mortgage('r3', { frequency: 'weekly', nextDueDate: '2026-08-07T00:00:00.000Z', scheduleAnchorDay: undefined })];
  const lookupWeekly = findLinkedRepayment(weekly, 'liab-1');
  if (lookupWeekly.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookupWeekly.repayment);
    assert('3a. weekly: frequency prefills as weekly', prefill.frequency === 'weekly');
    assert('3b. weekly: nextDueDate prefills as the exact stored ISO string, unmodified', prefill.nextDueDate === '2026-08-07T00:00:00.000Z');
    assert('3c. weekly: dayOfMonth stays blank (not applicable to this frequency)', prefill.dayOfMonth === '');
  }
  const fortnightly = [mortgage('r4', { frequency: 'fortnightly', nextDueDate: '2026-08-14T00:00:00.000Z', scheduleAnchorDay: undefined })];
  const lookupFortnightly = findLinkedRepayment(fortnightly, 'liab-1');
  if (lookupFortnightly.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookupFortnightly.repayment);
    assert('3d. fortnightly: frequency prefills as fortnightly', prefill.frequency === 'fortnightly');
    assert('3e. fortnightly: nextDueDate prefills as the exact stored ISO string, unmodified', prefill.nextDueDate === '2026-08-14T00:00:00.000Z');
  }
}

console.log('\n=== 4. Existing Car Loan repayment ===');
{
  const items = [mortgage('r5', { label: 'Toyota Finance repayment', amount: 450, linkedLiabilityId: 'liab-carloan', scheduleAnchorDay: 20 })];
  const lookup = findLinkedRepayment(items, 'liab-carloan');
  assert('4a. resolves to exactly one match for the car loan liability id', lookup.status === 'one');
  if (lookup.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookup.repayment);
    assert('4b. amount prefills as "450"', prefill.amount === '450');
    assert('4c. dayOfMonth prefills as "20"', prefill.dayOfMonth === '20');
  }
}

console.log('\n=== 5. Existing Personal Loan repayment ===');
{
  const items = [mortgage('r6', { label: 'Personal loan repayment', amount: 220, linkedLiabilityId: 'liab-personal', frequency: 'fortnightly', nextDueDate: '2026-08-10T00:00:00.000Z', scheduleAnchorDay: undefined })];
  const lookup = findLinkedRepayment(items, 'liab-personal');
  assert('5a. resolves to exactly one match for the personal loan liability id', lookup.status === 'one');
  if (lookup.status === 'one') {
    const prefill = prefillValuesFromRepayment(lookup.repayment);
    assert('5b. amount prefills as "220"', prefill.amount === '220');
    assert('5c. frequency prefills as fortnightly', prefill.frequency === 'fortnightly');
    assert('5d. nextDueDate prefills as the exact stored ISO string', prefill.nextDueDate === '2026-08-10T00:00:00.000Z');
  }
}

console.log('\n=== 6. Zero linked repayments: blank fields remain valid for creating the first schedule ===');
{
  const items = [mortgage('other', { linkedLiabilityId: 'some-other-liability' })];
  const lookup = findLinkedRepayment(items, 'liab-1');
  assert('6a. resolves to "none" when no recurring item links to this liability', lookup.status === 'none');
  const lookupEmpty = findLinkedRepayment([], 'liab-1');
  assert('6b. resolves to "none" against an empty recurringItems array', lookupEmpty.status === 'none');
}

console.log('\n=== 7. Multiple linked repayments: ambiguous, no guess ===');
{
  const items = [mortgage('dup1'), mortgage('dup2', { amount: 3100 })];
  const lookup = findLinkedRepayment(items, 'liab-1');
  assert('7a. resolves to "ambiguous" when more than one recurring item links to the same liability', lookup.status === 'ambiguous');
  assert('7b. the ambiguous result carries no repayment payload to display or prefill from', !('repayment' in lookup));
  const itemsWithInactive = [mortgage('dup3'), mortgage('dup4', { active: false })];
  const lookupInactive = findLinkedRepayment(itemsWithInactive, 'liab-1');
  assert('7c. an inactive linked item still counts toward ambiguity — matches the canonical (unfiltered) persistence definition, now independently confirmed for real in tests/linked-repayment-persistence.test.ts', lookupInactive.status === 'ambiguous');
}

console.log('\n=== 8. Structural confirmation: the real file contains and wires this exact logic (supplements, does not replace, sections 1-7) ===');
{
  assert(
    '8a. findLinkedRepayment exists in the real file with the exact "any recurringItem with this linkedLiabilityId, no further filter" definition',
    /export function findLinkedRepayment\(recurringItems: RecurringItem\[\], liabilityId: string\): LinkedRepaymentLookup \{\s*\n\s*const matches = recurringItems\.filter\(\(r\) => r\.linkedLiabilityId === liabilityId\);/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8b. matches.length === 0 -> {status:"none"}, > 1 -> {status:"ambiguous"}, else -> {status:"one", repayment: matches[0]}, in that exact order',
    /if \(matches\.length === 0\) return \{ status: 'none' \};\s*\n\s*if \(matches\.length > 1\) return \{ status: 'ambiguous' \};\s*\n\s*return \{ status: 'one', repayment: matches\[0\] \};/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8c. prefillValuesFromRepayment prefers scheduleAnchorDay over deriving from nextDueDate for monthly',
    /const day = repayment\.scheduleAnchorDay \?\? new Date\(repayment\.nextDueDate\)\.getDate\(\);/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8d. weekly/fortnightly branch prefills the raw nextDueDate unchanged, blank dayOfMonth',
    /return \{ amount: String\(repayment\.amount\), frequency: repayment\.frequency, dayOfMonth: '', nextDueDate: repayment\.nextDueDate \};/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8e. chooseExistingLiabilityForRepayment calls findLinkedRepayment(data.recurringItems, l.id) right after prefillFromLiability(l)',
    /prefillFromLiability\(l\);\s*\n[\s\S]{0,900}?const lookup = findLinkedRepayment\(data\.recurringItems, l\.id\);/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8f. on lookup.status === "one", all four repayment setters are called with prefillValuesFromRepayment\'s output',
    /if \(lookup\.status === 'one'\) \{\s*\n\s*const prefill = prefillValuesFromRepayment\(lookup\.repayment\);\s*\n\s*setRepaymentAmount\(prefill\.amount\);\s*\n\s*setRepaymentFrequency\(prefill\.frequency\);\s*\n\s*setRepaymentDayOfMonth\(prefill\.dayOfMonth\);\s*\n\s*setRepaymentNextDueDate\(prefill\.nextDueDate\);/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8g. hasAmbiguousLinkedRepayment is derived fresh every render from findLinkedRepayment, not stored/stale state',
    /const linkedRepaymentLookup = targetLiability \? findLinkedRepayment\(data\.recurringItems, targetLiability\.id\) : null;\s*\n\s*const hasAmbiguousLinkedRepayment = linkedRepaymentLookup\?\.status === 'ambiguous';/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8h. canSave is gated on !hasAmbiguousLinkedRepayment (and, correction pass, !repaymentScheduleIncomplete alongside it), blocking Save before performSave is ever reachable',
    /\(!requiresNewVehicleName \|\| newVehicleName\.trim\(\)\.length > 0\) &&[\s\S]{0,1200}?!hasAmbiguousLinkedRepayment &&[\s\S]{0,900}?!repaymentScheduleIncomplete;/.test(WEALTH_MODAL_SRC)
  );
  assert(
    // BNPL round (2026-08-09): the ternary condition gained a second,
    // OR'd ambiguity signal (hasAmbiguousBnplRepayment, BNPL's own
    // editLiability-keyed ambiguity check — see its own doc comment) —
    // hasAmbiguousLinkedRepayment's own contribution and the
    // DUPLICATE_REPAYMENT_ERROR render for the smart-loan case are
    // byte-identical and unchanged.
    '8i. the render blocks the repayment input fields entirely when ambiguous (smart-loan OR bnpl), showing DUPLICATE_REPAYMENT_ERROR for the smart-loan case — no blank-looking editable form',
    /hasAmbiguousLinkedRepayment \|\| hasAmbiguousBnplRepayment \? \(\s*\n[\s\S]{0,1000}?<Text style=\{styles\.helperText\}>\{DUPLICATE_REPAYMENT_ERROR\}<\/Text>/.test(WEALTH_MODAL_SRC)
  );
  assert(
    '8j. the ambiguous render branch reuses the exact same DUPLICATE_REPAYMENT_ERROR constant Save\'s own failure path already uses — one message, not a second wording',
    (WEALTH_MODAL_SRC.match(/DUPLICATE_REPAYMENT_ERROR/g) || []).length >= 3
  );
  assert(
    '8k. updateLinkedRepaymentOnlyTransition / upsertLinkedRecurringItem (AppStateContext.tsx) are not called directly from this file — VID-001 blocks at the form layer (canSave), not by modifying the persistence transition; those functions are the ones now real-import-tested in tests/linked-repayment-persistence.test.ts',
    !WEALTH_MODAL_SRC.includes('updateLinkedRepaymentOnlyTransition(')
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
