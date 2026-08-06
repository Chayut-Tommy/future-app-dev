// REAL IMPORT — src/state/AppStateContext.tsx imports react and
// ../lib/storage (which imports @react-native-async-storage/async-storage),
// but NOT react-native itself, and @react-native-async-storage/async-storage's
// own package entry does not hit the Flow-syntax problem react-native's
// does. Confirmed empirically: this file loads cleanly under plain
// `npx tsx`. upsertLinkedRecurringItem, updateLinkedRepaymentOnlyTransition
// and renameLinkedRepaymentIfUnambiguous are plain, module-level exported
// functions (not hooks, not inside the AppStateContext provider component),
// so they are genuinely callable here — this is the actual persistence
// logic VID-001's repayment-prefill correction depends on, not a mirror.
//
// NOTE: transferFunds (Move Money's atomic balance transition) is NOT
// covered here — its logic lives inline inside a useCallback closure
// bound to the AppStateContext provider component's own `data`/`persist`,
// not a standalone exported function. Invoking it for real would require
// mounting the actual React provider (a React renderer this repo does not
// have installed, and installing one is a dependency decision outside
// this pass's authority). See tests/README.md and the checkpoint report
// for the precise, non-overclaiming treatment of the Transfer financial
// scenario.
//
// Run with: npx tsx tests/linked-repayment-persistence.test.ts

import { upsertLinkedRecurringItem, updateLinkedRepaymentOnlyTransition, renameLinkedRepaymentIfUnambiguous } from '../src/state/AppStateContext';
import type { AppData, RecurringItem, Liability } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function repayment(patch: Partial<RecurringItem>): RecurringItem {
  return {
    id: 'r1',
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

function liability(patch: Partial<Liability>): Liability {
  return { id: 'liab-1', type: 'mortgage', label: 'CBA Richmond Test', currentBalance: 500000, ...patch };
}

function minimalAppData(patch: Partial<Pick<AppData, 'liabilities' | 'recurringItems'>>): AppData {
  // updateLinkedRepaymentOnlyTransition only reads data.liabilities and
  // data.recurringItems at runtime (confirmed by reading its body) — this
  // repo has no test-data-factory for the full AppData shape, and building
  // one is out of this pass's authorised scope (would risk silently
  // drifting from the real shape). Cast is safe because tsx does not
  // type-check at runtime; it only matters that the two fields the
  // function actually reads are present and correct.
  return { liabilities: [], recurringItems: [], ...patch } as unknown as AppData;
}

console.log('=== upsertLinkedRecurringItem — real import, real execution ===');
{
  assert('undefined recurringItem is always a safe no-op — returns the SAME array reference unchanged', (() => {
    const items = [repayment({})];
    const result = upsertLinkedRecurringItem(items, 'liab-1', undefined, 'new-id');
    return result.ok === true && result.recurringItems === items;
  })());
  assert('undefined recurringItem is a safe no-op even when the liability has MULTIPLE existing matches (no duplicate check runs, none is needed since nothing is written)', (() => {
    const items = [repayment({ id: 'dup1' }), repayment({ id: 'dup2', amount: 3100 })];
    const result = upsertLinkedRecurringItem(items, 'liab-1', undefined, 'new-id');
    return result.ok === true && result.recurringItems === items;
  })());
  assert('exactly one existing match: a defined recurringItem UPDATES that exact id, in place, no duplicate created', (() => {
    const items = [repayment({ id: 'r1', amount: 3000 })];
    const result = upsertLinkedRecurringItem(items, 'liab-1', { ...repayment({}), amount: 3200 }, 'unused-id');
    if (!result.ok) return false;
    return result.recurringItems.length === 1 && result.recurringItems[0].id === 'r1' && result.recurringItems[0].amount === 3200;
  })());
  assert('zero existing matches: a defined recurringItem CREATES a new item using the supplied id', (() => {
    const items: RecurringItem[] = [];
    const result = upsertLinkedRecurringItem(items, 'liab-1', repayment({}), 'brand-new-id');
    if (!result.ok) return false;
    return result.recurringItems.length === 1 && result.recurringItems[0].id === 'brand-new-id' && result.recurringItems[0].linkedLiabilityId === 'liab-1';
  })());
  assert('more than one existing match: a defined recurringItem is REFUSED outright (ok:false), nothing written', (() => {
    const items = [repayment({ id: 'dup1' }), repayment({ id: 'dup2', amount: 3100 })];
    const result = upsertLinkedRecurringItem(items, 'liab-1', { ...repayment({}), amount: 5000 }, 'new-id');
    return result.ok === false && result.reason === 'duplicate_linked_repayment';
  })());
  assert('an inactive linked item still counts as a match — no active/type filter, matching the canonical unfiltered definition', (() => {
    const items = [repayment({ id: 'r1' }), repayment({ id: 'r2', active: false })];
    const result = upsertLinkedRecurringItem(items, 'liab-1', { ...repayment({}), amount: 5000 }, 'new-id');
    return result.ok === false && result.reason === 'duplicate_linked_repayment';
  })());
  assert('a match for a DIFFERENT liability id is not touched or counted', (() => {
    const items = [repayment({ id: 'other', linkedLiabilityId: 'liab-999' })];
    const result = upsertLinkedRecurringItem(items, 'liab-1', repayment({}), 'brand-new-id');
    return result.ok === true && result.recurringItems.length === 2;
  })());
}

console.log('\n=== updateLinkedRepaymentOnlyTransition — real import, real execution (the exact action VID-001\'s canSave gate prevents from ever being reachable while ambiguous) ===');
{
  assert('target liability not found -> applied:false, reason target_not_found, no mutation attempted', (() => {
    const data = minimalAppData({ liabilities: [liability({})], recurringItems: [] });
    const result = updateLinkedRepaymentOnlyTransition(data, 'does-not-exist', repayment({}), 'new-id');
    return result.applied === false && result.reason === 'target_not_found';
  })());
  assert('undefined repayment payload against an existing target liability -> applied:true, recurringItems array is the SAME reference (genuinely a no-op, not merely "no error")', (() => {
    const items = [repayment({})];
    const data = minimalAppData({ liabilities: [liability({})], recurringItems: items });
    const result = updateLinkedRepaymentOnlyTransition(data, 'liab-1', undefined, 'new-id');
    return result.applied === true && result.data.recurringItems === items;
  })());
  assert('undefined repayment payload against an AMBIGUOUS (multi-match) liability is STILL a safe no-op — confirms the guard-ordering finding: the duplicate check never runs when the payload is undefined, so a blank submission cannot surface or trigger it, by design', (() => {
    const items = [repayment({ id: 'dup1' }), repayment({ id: 'dup2', amount: 3100 })];
    const data = minimalAppData({ liabilities: [liability({})], recurringItems: items });
    const result = updateLinkedRepaymentOnlyTransition(data, 'liab-1', undefined, 'new-id');
    return result.applied === true && result.data.recurringItems === items;
  })());
  assert('a changed, valid repayment against the one true match updates exactly that record and returns applied:true with the new data', (() => {
    const items = [repayment({ id: 'r1', amount: 3000, scheduleAnchorDay: 3 })];
    const data = minimalAppData({ liabilities: [liability({})], recurringItems: items });
    const result = updateLinkedRepaymentOnlyTransition(data, 'liab-1', { ...repayment({}), amount: 3200, scheduleAnchorDay: 5 }, 'unused');
    if (!result.applied) return false;
    return result.data.recurringItems.length === 1 && result.data.recurringItems[0].amount === 3200 && result.data.recurringItems[0].scheduleAnchorDay === 5;
  })());
  assert('a DEFINED repayment against an ambiguous (multi-match) liability is refused, and the returned failure carries the exact duplicate_linked_repayment reason', (() => {
    const items = [repayment({ id: 'dup1' }), repayment({ id: 'dup2', amount: 3100 })];
    const data = minimalAppData({ liabilities: [liability({})], recurringItems: items });
    const result = updateLinkedRepaymentOnlyTransition(data, 'liab-1', { ...repayment({}), amount: 9999 }, 'unused');
    return result.applied === false && result.reason === 'duplicate_linked_repayment';
  })());
}

console.log('\n=== renameLinkedRepaymentIfUnambiguous — real import, real execution ===');
{
  assert('exactly one match: renames that repayment\'s label to match the new liability name', (() => {
    const items = [repayment({ id: 'r1', label: 'Old Name repayment' })];
    const result = renameLinkedRepaymentIfUnambiguous(items, 'liab-1', 'New Name');
    return result[0].label === 'New Name repayment';
  })());
  assert('zero matches: no-op, returns the array unchanged', (() => {
    const items: RecurringItem[] = [];
    const result = renameLinkedRepaymentIfUnambiguous(items, 'liab-1', 'New Name');
    return result.length === 0;
  })());
  assert('more than one match: no-op (skipped, not blocked) — a liability rename must never be held hostage by an unrelated repayment-identity ambiguity', (() => {
    const items = [repayment({ id: 'dup1', label: 'A repayment' }), repayment({ id: 'dup2', label: 'B repayment' })];
    const result = renameLinkedRepaymentIfUnambiguous(items, 'liab-1', 'New Name');
    return result[0].label === 'A repayment' && result[1].label === 'B repayment';
  })());
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
