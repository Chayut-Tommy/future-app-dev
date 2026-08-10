// BNPL (Buy Now, Pay Later) — bounded MVP implementation, 2026-08-09.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): every section below imports and directly
//   executes the actual production functions — projectBnplOccurrences,
//   sumBnplOccurrencesInWindow, resolveBnplLinkedItems,
//   computeBnplCostsForWindow (src/lib/calculations/bnpl.ts),
//   saveBnplPlanTransition, confirmBnplRepaymentTransition,
//   deleteLiabilityTransition (src/state/AppStateContext.tsx — confirmed
//   importable without hitting react-native's Flow-syntax problem, same
//   as tests/linked-repayment-persistence.test.ts already established),
//   computeSafeToSpend, computeMoneyPlan, computeMoneyTimeline.
// - No mirrored/structural sections in this file — everything under test
//   here is a plain, exported, module-level function.
//
// Date fixtures: every `nextDueDate`/window boundary is built via `d()`
// (LOCAL midnight of a calendar day, matching startOfDay/occurrenceDateAt's
// own construction) and `dISO()` (that same local midnight, converted to
// its real ISO string via .toISOString() — the exact shape a real
// DateTimePicker selection produces, per RecurringItem.nextDueDate's own
// documented contract). A raw hand-written UTC-midnight literal
// ("...T00:00:00.000Z") is deliberately never used as a fixture value: it
// does not represent what real app-generated data looks like outside
// UTC+0, and using one here produced spurious timezone-artifact failures
// during this file's own construction that were traced and fixed before
// this version — a lesson worth leaving documented rather than silently
// erased.
//
// NOT PROVEN by this suite: on-device confirmation-sheet rendering,
// AddWealthItemModal's own form validation UI, SmartReminderCard's visual
// states. That remains physical-device evidence (see the implementation
// report's device-testing checklist).
//
// Run with: npx tsx tests/bnpl.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import {
  projectBnplOccurrences,
  sumBnplOccurrencesInWindow,
  resolveBnplLinkedItems,
  computeBnplCostsForWindow,
} from '../src/lib/calculations/bnpl';
import {
  saveBnplPlanTransition,
  confirmBnplRepaymentTransition,
  deleteLiabilityTransition,
  reverseBnplRepaymentTransaction,
  isLatestBnplRepaymentTransaction,
  SaveBnplPlanInput,
  ConfirmBnplRepaymentInput,
} from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMoneyPlan } from '../src/lib/calculations/moneyPlan';
import { computeMoneyTimeline } from '../src/lib/calculations/moneyTimeline';
import { fromMonthlyAmount } from '../src/lib/calculations/incomeEngine';
import { computeDebtCoachSummary } from '../src/lib/calculations/debtCoach';
import type { AppData, Liability, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

// Local-midnight construction — matches the production convention every
// date-boundary helper in this codebase uses (startOfDay, occurrenceDateAt
// via `new Date(year, month, day)`), never bare ISO-date-string parsing
// (the JS spec defines a date-only ISO string as UTC, not local).
function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}
// The exact shape RecurringItem.nextDueDate always has in real data — a
// DateTimePicker's local-midnight selection, converted via .toISOString().
function dISO(iso: string): string {
  return d(iso).toISOString();
}

function baseData(): AppData {
  return createEmptyAppData();
}

function withCash(data: AppData, amount: number, id = 'cash1'): AppData {
  return { ...data, assets: [...data.assets, { id, type: 'cash', label: 'Cash', currentValue: amount }] };
}

function liability(patch: Partial<Liability> = {}): Liability {
  return { id: 'bnpl1', type: 'bnpl', label: 'Test Plan', currentBalance: 150, ...patch };
}

function item(patch: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 'item1',
    type: 'expense',
    label: 'Test Plan repayment',
    amount: 100,
    frequency: 'weekly',
    nextDueDate: dISO('2026-08-10'),
    isFixed: false,
    active: true,
    linkedLiabilityId: 'bnpl1',
    ...patch,
  };
}

// ============================================================================
// Section 1 — projectBnplOccurrences: the corrected finite-projection helper
// ============================================================================
console.log('=== Section 1: projectBnplOccurrences ===');
{
  // Example A/B — the user's own worked example: $150 outstanding, $100/week,
  // occurrences 10 Aug and 17 Aug. A later window starting 17 Aug must show
  // $50, not $100 — the corrected chronological-consumption contract.
  const l = liability({ currentBalance: 150 });
  const i = item({ amount: 100, nextDueDate: dISO('2026-08-10'), frequency: 'weekly' });

  const fullWindow = projectBnplOccurrences(i, l, d('2026-08-10'), d('2026-08-17'));
  assert('Example A: full window returns both occurrences', fullWindow.length === 2);
  assert('Example A: first occurrence (10 Aug) is $100', fullWindow[0]?.amountCents === 10000);
  assert('Example A: second occurrence (17 Aug) is $50 (capped)', fullWindow[1]?.amountCents === 5000);
  assert('Example A: second occurrence is final', fullWindow[1]?.isFinal === true);
  assert('Example A: first occurrence is not final', fullWindow[0]?.isFinal === false);

  const laterWindow = projectBnplOccurrences(i, l, d('2026-08-17'), d('2026-08-17'));
  assert('Later-window example: window starting 17 Aug shows exactly one occurrence', laterWindow.length === 1);
  assert('Later-window example: that occurrence is $50, not $100', laterWindow[0]?.amountCents === 5000);

  // Example C — exact divide: $200 outstanding, $100/week — two occurrences
  // of $100 each, second is final (remaining hits exactly 0) even though
  // its amount was never capped below the scheduled amount.
  const lExact = liability({ currentBalance: 200 });
  const exactWindow = projectBnplOccurrences(item({ amount: 100 }), lExact, d('2026-08-10'), d('2026-08-24'));
  assert('Example C: exact-divide produces exactly 2 occurrences', exactWindow.length === 2);
  assert('Example C: both occurrences are $100', exactWindow[0]?.amountCents === 10000 && exactWindow[1]?.amountCents === 10000);
  assert('Example C: second (exact-divide) occurrence is final', exactWindow[1]?.isFinal === true);
  assert('Example C: no third occurrence generated', exactWindow.length === 2);

  // Example D — smaller final occurrence, outstanding not a clean multiple.
  const lSmaller = liability({ currentBalance: 30 });
  const smallerWindow = projectBnplOccurrences(item({ amount: 100 }), lSmaller, d('2026-08-10'), d('2026-08-24'));
  assert('Example D: single occurrence when outstanding < scheduled amount', smallerWindow.length === 1);
  assert('Example D: occurrence capped to the full outstanding ($30)', smallerWindow[0]?.amountCents === 3000);
  assert('Example D: single occurrence is final', smallerWindow[0]?.isFinal === true);

  // Example E — repayment greater than outstanding on the very first occurrence.
  const lTiny = liability({ currentBalance: 1 });
  const tinyWindow = projectBnplOccurrences(item({ amount: 500 }), lTiny, d('2026-08-10'), d('2026-08-10'));
  assert('Example E: repayment > outstanding caps to the $1 outstanding', tinyWindow[0]?.amountCents === 100);

  // Example F — balance-only plan (paid off, currentBalance === 0) never
  // projects anything, in any window.
  const lPaidOff = liability({ currentBalance: 0 });
  const paidOffWindow = projectBnplOccurrences(item({}), lPaidOff, d('2026-08-01'), d('2026-12-31'));
  assert('Example F: a paid-off plan (balance 0) projects zero occurrences', paidOffWindow.length === 0);

  // Mismatched item/liability pairing must be a safe empty result, never a
  // crash or a wrong projection.
  const mismatched = projectBnplOccurrences(item({ linkedLiabilityId: 'other-liability' }), liability({}), d('2026-08-01'), d('2026-12-31'));
  assert('Mismatched item/liability pairing returns empty, not a crash', mismatched.length === 0);

  // Non-BNPL liability type passed by mistake — also a safe empty result.
  const wrongType = projectBnplOccurrences(item({}), liability({ type: 'personal_loan' as any }), d('2026-08-01'), d('2026-12-31'));
  assert('Non-bnpl liability type returns empty', wrongType.length === 0);

  // Overdue unconfirmed occurrence — a window starting before nextDueDate
  // still correctly includes it (no special "must be future" gate).
  const overdue = projectBnplOccurrences(item({ nextDueDate: dISO('2026-08-01') }), liability({ currentBalance: 100 }), d('2026-07-01'), d('2026-08-05'));
  assert('Overdue unconfirmed occurrence is still projected', overdue.length === 1 && overdue[0].amountCents === 10000);

  // Due exactly on window boundary (inclusive on both ends).
  const dueOnEnd = projectBnplOccurrences(item({ nextDueDate: dISO('2026-08-10') }), liability({ currentBalance: 100 }), d('2026-08-01'), d('2026-08-10'));
  assert('Occurrence landing exactly on windowEnd is included (inclusive)', dueOnEnd.length === 1);
  const dueOnStart = projectBnplOccurrences(item({ nextDueDate: dISO('2026-08-10') }), liability({ currentBalance: 100 }), d('2026-08-10'), d('2026-08-20'));
  assert('Occurrence landing exactly on windowStart is included (inclusive)', dueOnStart.length === 1);

  // Monthly anchors — 31st, clamped in a short month, restored in a long one.
  const monthly31 = item({ frequency: 'monthly', nextDueDate: dISO('2026-01-31'), scheduleAnchorDay: 31, amount: 50 });
  const febWindow = projectBnplOccurrences(monthly31, liability({ currentBalance: 500 }), d('2026-01-01'), d('2026-02-28'));
  assert('Monthly anchor 31: Feb occurrence clamps to Feb 28 (non-leap)', febWindow.some((o) => o.date.getMonth() === 1 && o.date.getDate() === 28));
  const marWindow = projectBnplOccurrences(monthly31, liability({ currentBalance: 500 }), d('2026-01-01'), d('2026-03-31'));
  assert('Monthly anchor 31: March restores to day 31 (long month)', marWindow.some((o) => o.date.getMonth() === 2 && o.date.getDate() === 31));

  // Leap year — Feb 29 anchor.
  const leapItem = item({ frequency: 'monthly', nextDueDate: dISO('2028-01-31'), scheduleAnchorDay: 31, amount: 50 });
  const leapWindow = projectBnplOccurrences(leapItem, liability({ currentBalance: 500 }), d('2028-01-01'), d('2028-02-29'));
  assert('Leap year: Feb anchor-31 clamps to Feb 29', leapWindow.some((o) => o.date.getMonth() === 1 && o.date.getDate() === 29));

  // 30th anchor, clamped in Feb, restored in April.
  const monthly30 = item({ frequency: 'monthly', nextDueDate: dISO('2026-01-30'), scheduleAnchorDay: 30, amount: 50 });
  const feb30Window = projectBnplOccurrences(monthly30, liability({ currentBalance: 500 }), d('2026-02-01'), d('2026-02-28'));
  assert('Monthly anchor 30: Feb clamps to 28', feb30Window.some((o) => o.date.getDate() === 28));

  // Correction pass, §6 — anchor day 29, both sides of the leap-year
  // boundary (previously only anchor 30/31 were exercised).
  const monthly29NonLeap = item({ frequency: 'monthly', nextDueDate: dISO('2026-01-29'), scheduleAnchorDay: 29, amount: 50 });
  const feb29NonLeapWindow = projectBnplOccurrences(monthly29NonLeap, liability({ currentBalance: 500 }), d('2026-02-01'), d('2026-02-28'));
  assert('§6 Monthly anchor 29, non-leap year (2026): Feb clamps to 28', feb29NonLeapWindow.some((o) => o.date.getMonth() === 1 && o.date.getDate() === 28));
  const monthly29Leap = item({ frequency: 'monthly', nextDueDate: dISO('2028-01-29'), scheduleAnchorDay: 29, amount: 50 });
  const feb29LeapWindow = projectBnplOccurrences(monthly29Leap, liability({ currentBalance: 500 }), d('2028-02-01'), d('2028-02-29'));
  assert('§6 Monthly anchor 29, leap year (2028): Feb lands exactly on 29, no clamp needed', feb29LeapWindow.some((o) => o.date.getMonth() === 1 && o.date.getDate() === 29));

  // Correction pass, §6 — due today: windowStart === windowEnd === the
  // occurrence's own due date (the narrowest possible inclusive window).
  const dueToday = projectBnplOccurrences(item({ nextDueDate: dISO('2026-08-05') }), liability({ currentBalance: 100 }), d('2026-08-05'), d('2026-08-05'));
  assert('§6 Due today: an occurrence due exactly today is included in a same-day window', dueToday.length === 1 && dueToday[0].amountCents === 10000);

  // Correction pass, §6 — due on the final day of a calendar month, and due
  // on the first day of the following month (excluded from the previous
  // month's total). Uses computeBnplCostsForWindow directly against exact
  // calendar-month boundaries — the same inclusive-end convention
  // moneyPlan.ts/safeToSpend.ts each already adjust for at their own call
  // sites (see this file's header comment on the boundary contract).
  const dataAug = (dueDate: string): AppData => ({
    ...baseData(),
    liabilities: [liability({ currentBalance: 100 })],
    recurringItems: [item({ amount: 100, nextDueDate: dISO(dueDate), frequency: 'monthly' })],
  });
  const augWindowEnd = new Date(d('2026-08-31').getTime() + 24 * 60 * 60 * 1000 - 1); // last instant of 31 Aug
  const finalDayOfMonth = computeBnplCostsForWindow(dataAug('2026-08-31'), d('2026-08-01'), augWindowEnd);
  assert('§6 Due on the final day of a calendar month (31 Aug) is included in August’s total', finalDayOfMonth === 100);
  const firstDayOfNextMonth = computeBnplCostsForWindow(dataAug('2026-09-01'), d('2026-08-01'), augWindowEnd);
  assert('§6 Due on the first day of the following month (1 Sep) is excluded from August’s total', firstDayOfNextMonth === 0);

  // Exact-cent balance — no float drift across a long chronological walk.
  const exactCentItem = item({ amount: 33.33, frequency: 'weekly', nextDueDate: dISO('2026-08-10') });
  const exactCentLiability = liability({ currentBalance: 99.99 });
  const exactCentWindow = projectBnplOccurrences(exactCentItem, exactCentLiability, d('2026-08-10'), d('2026-09-10'));
  const exactCentSum = exactCentWindow.reduce((s, o) => s + o.amountCents, 0);
  assert('Exact-cent balance: sum of projected occurrences never exceeds outstanding (integer cents)', exactCentSum <= 9999);
  assert('Exact-cent balance: sum equals outstanding exactly once fully consumed', exactCentSum === 9999);

  // Invariant: sum(projected occurrences) <= outstanding balance, across a
  // wide sweep of amount/balance combinations.
  let invariantHolds = true;
  for (const [amt, bal] of [[100, 150], [37, 200], [250, 250], [10, 5], [1000, 1]] as [number, number][]) {
    const occ = projectBnplOccurrences(item({ amount: amt }), liability({ currentBalance: bal }), d('2026-08-10'), d('2026-12-31'));
    const sum = occ.reduce((s, o) => s + o.amountCents, 0);
    if (sum > Math.round(bal * 100)) invariantHolds = false;
  }
  assert('Invariant: sum(projected occurrences) <= outstanding balance, across a sweep', invariantHolds);

  // Multiple plans with the same provider — independent projections, no
  // cross-contamination.
  const p1Item = item({ id: 'i1', linkedLiabilityId: 'p1', amount: 50, nextDueDate: dISO('2026-08-10') });
  const p1Liability = liability({ id: 'p1', label: 'Plan 1', currentBalance: 100, provider: 'Afterpay' });
  const p2Item = item({ id: 'i2', linkedLiabilityId: 'p2', amount: 60, nextDueDate: dISO('2026-08-10') });
  const p2Liability = liability({ id: 'p2', label: 'Plan 2', currentBalance: 200, provider: 'Afterpay' });
  const costP1 = sumBnplOccurrencesInWindow(p1Item, p1Liability, d('2026-08-10'), d('2026-08-10'));
  const costP2 = sumBnplOccurrencesInWindow(p2Item, p2Liability, d('2026-08-10'), d('2026-08-10'));
  assert('Multiple same-provider plans: plan 1 projects independently ($50)', costP1 === 50);
  assert('Multiple same-provider plans: plan 2 projects independently ($60)', costP2 === 60);
}

// ============================================================================
// Section 2 — resolveBnplLinkedItems / computeBnplCostsForWindow: ambiguity
// safety
// ============================================================================
console.log('\n=== Section 2: resolveBnplLinkedItems / computeBnplCostsForWindow ===');
{
  const dataNone: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [] };
  assert('resolveBnplLinkedItems: no linked item -> none', resolveBnplLinkedItems(dataNone, 'bnpl1').status === 'none');

  const dataSingle: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [item({})] };
  assert('resolveBnplLinkedItems: exactly one active linked item -> single', resolveBnplLinkedItems(dataSingle, 'bnpl1').status === 'single');

  const dataAmbiguous: AppData = {
    ...baseData(),
    liabilities: [liability({})],
    recurringItems: [item({ id: 'a' }), item({ id: 'b' })],
  };
  assert('resolveBnplLinkedItems: two active linked items -> ambiguous', resolveBnplLinkedItems(dataAmbiguous, 'bnpl1').status === 'ambiguous');

  const dataInactive: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [item({ active: false })] };
  assert('resolveBnplLinkedItems: an inactive item does not count -> none', resolveBnplLinkedItems(dataInactive, 'bnpl1').status === 'none');

  // Corrupted duplicate links must NEVER double-count — computeBnplCostsForWindow
  // must return $0 (never both items summed) for an ambiguous liability.
  const costAmbiguous = computeBnplCostsForWindow(dataAmbiguous, d('2026-08-10'), d('2026-08-10'));
  assert('Corrupted duplicate links: computeBnplCostsForWindow never sums both ambiguous items', costAmbiguous === 0);

  const costSingle = computeBnplCostsForWindow(dataSingle, d('2026-08-10'), d('2026-08-10'));
  assert('computeBnplCostsForWindow: single unambiguous item projects correctly', costSingle === 100);
}

// ============================================================================
// Section 3 — saveBnplPlanTransition: atomic create/edit lifecycle
// ============================================================================
console.log('\n=== Section 3: saveBnplPlanTransition (atomic create/edit) ===');
{
  // Balance-only creation.
  const createBalanceOnly: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'New Plan', currentBalance: 200 },
    schedule: undefined,
    ids: { liabilityId: 'L1', recurringItemId: 'R1' },
  };
  const r1 = saveBnplPlanTransition(baseData(), createBalanceOnly);
  assert('Balance-only creation: applied', r1.applied);
  if (r1.applied) {
    assert('Balance-only creation: liability created', r1.data.liabilities.some((l) => l.id === 'L1' && l.currentBalance === 200));
    assert('Balance-only creation: no recurring item created', r1.data.recurringItems.length === 0);
  }

  // Scheduled creation.
  const createScheduled: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'New Plan', provider: 'Zip', currentBalance: 300 },
    schedule: { amount: 100, frequency: 'weekly', nextDueDate: dISO('2026-08-10') },
    ids: { liabilityId: 'L2', recurringItemId: 'R2' },
  };
  const r2 = saveBnplPlanTransition(baseData(), createScheduled);
  assert('Scheduled creation: applied', r2.applied);
  if (r2.applied) {
    assert('Scheduled creation: liability + exactly one linked item created atomically', r2.data.liabilities.length === 1 && r2.data.recurringItems.length === 1);
    assert('Scheduled creation: linked item is NOT isFixed (Score/achievements protection)', r2.data.recurringItems[0].isFixed === false);
    assert('Scheduled creation: liability provider stored', r2.data.liabilities[0].provider === 'Zip');
  }

  // Required positive balance for new plans.
  const createZeroBalance: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'Bad Plan', currentBalance: 0 },
    schedule: undefined,
    ids: { liabilityId: 'L3', recurringItemId: 'R3' },
  };
  const r3 = saveBnplPlanTransition(baseData(), createZeroBalance);
  assert('New plan with $0 balance is rejected (invalid_balance)', !r3.applied && r3.reason === 'invalid_balance');

  const createNegative: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'Bad Plan', currentBalance: -50 },
    schedule: undefined,
    ids: { liabilityId: 'L4', recurringItemId: 'R4' },
  };
  const r4 = saveBnplPlanTransition(baseData(), createNegative);
  assert('New plan with negative balance is rejected', !r4.applied && r4.reason === 'invalid_balance');

  // Partial schedule rejected before any mutation.
  const createPartial: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'Partial', currentBalance: 100 },
    schedule: { amount: NaN, frequency: 'weekly', nextDueDate: dISO('2026-08-10') },
    ids: { liabilityId: 'L5', recurringItemId: 'R5' },
  };
  const r5 = saveBnplPlanTransition(baseData(), createPartial);
  assert('Partial/invalid schedule rejected before any mutation', !r5.applied && r5.reason === 'incomplete_schedule');

  // Editing updates the existing linked item rather than duplicating it.
  const dataWithScheduled = r2.applied ? r2.data : baseData();
  const editSchedule: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'L2',
    liability: { label: 'New Plan', provider: 'Zip', currentBalance: 300 },
    schedule: { amount: 120, frequency: 'weekly', nextDueDate: dISO('2026-08-17') },
    newRecurringItemId: 'unused',
  };
  const r6 = saveBnplPlanTransition(dataWithScheduled, editSchedule);
  assert('Editing schedule: applied', r6.applied);
  if (r6.applied) {
    assert('Editing schedule: exactly one linked item, updated in place (no duplicate)', r6.data.recurringItems.length === 1);
    assert('Editing schedule: amount updated', r6.data.recurringItems[0].amount === 120);
  }

  // Adding a schedule to a balance-only plan.
  const dataBalanceOnly = r1.applied ? r1.data : baseData();
  const addSchedule: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'L1',
    liability: { label: 'New Plan', currentBalance: 200 },
    schedule: { amount: 50, frequency: 'fortnightly', nextDueDate: dISO('2026-08-14') },
    newRecurringItemId: 'R1-added',
  };
  const r7 = saveBnplPlanTransition(dataBalanceOnly, addSchedule);
  assert('Adding schedule to balance-only plan: applied', r7.applied);
  if (r7.applied) assert('Adding schedule: exactly one new linked item created', r7.data.recurringItems.length === 1);

  // Removing a schedule leaves a valid balance-only plan.
  const dataToRemoveFrom = r7.applied ? r7.data : baseData();
  const removeSchedule: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'L1',
    liability: { label: 'New Plan', currentBalance: 200 },
    schedule: 'remove',
    newRecurringItemId: 'unused',
  };
  const r8 = saveBnplPlanTransition(dataToRemoveFrom, removeSchedule);
  assert('Removing schedule: applied', r8.applied);
  if (r8.applied) {
    const resolution = resolveBnplLinkedItems(r8.data, 'L1');
    assert('Removing schedule: liability is now balance-only (no active linked item)', resolution.status === 'none');
    assert('Removing schedule: the old linked item still exists, just deactivated (history preserved)', r8.data.recurringItems.some((r) => r.active === false));
  }

  // Removing a schedule that never existed is a safe no-op.
  const removeNothingToRemove = saveBnplPlanTransition(dataBalanceOnly, {
    mode: 'update',
    liabilityId: 'L1',
    liability: { label: 'New Plan', currentBalance: 200 },
    schedule: 'remove',
    newRecurringItemId: 'unused',
  });
  assert('Removing a non-existent schedule is a safe no-op', removeNothingToRemove.applied);

  // Editing outstanding balance after historical repayments exist (down to
  // exactly $0 is allowed on edit — a manual correction).
  const editToZero: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'L1',
    liability: { label: 'New Plan', currentBalance: 0 },
    schedule: 'unchanged',
    newRecurringItemId: 'unused',
  };
  const r9 = saveBnplPlanTransition(dataBalanceOnly, editToZero);
  assert('Editing balance down to exactly $0 is allowed on an existing plan', r9.applied);

  const editToNegative: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'L1',
    liability: { label: 'New Plan', currentBalance: -10 },
    schedule: 'unchanged',
    newRecurringItemId: 'unused',
  };
  const r10 = saveBnplPlanTransition(dataBalanceOnly, editToNegative);
  assert('Editing balance to a negative value is rejected', !r10.applied && r10.reason === 'invalid_balance');

  // Missing target liability.
  const editMissing: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'does-not-exist',
    liability: { label: 'X', currentBalance: 100 },
    schedule: 'unchanged',
    newRecurringItemId: 'unused',
  };
  const r11 = saveBnplPlanTransition(baseData(), editMissing);
  assert('Editing a missing liability -> target_not_found, no mutation', !r11.applied && r11.reason === 'target_not_found');

  // Wrong-type target (e.g. editing a personal_loan through the BNPL path).
  const dataWrongType: AppData = { ...baseData(), liabilities: [{ id: 'PL1', type: 'personal_loan', label: 'Loan', currentBalance: 500 }] };
  const editWrongType: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'PL1',
    liability: { label: 'Loan', currentBalance: 500 },
    schedule: 'unchanged',
    newRecurringItemId: 'unused',
  };
  const r12 = saveBnplPlanTransition(dataWrongType, editWrongType);
  assert('Editing a non-bnpl liability via saveBnplPlanTransition -> target_wrong_type', !r12.applied && r12.reason === 'target_wrong_type');

  // Ambiguous existing schedule blocks any edit.
  const dataAmbiguousForEdit: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [item({ id: 'a' }), item({ id: 'b' })] };
  const editAmbiguous: SaveBnplPlanInput = {
    mode: 'update',
    liabilityId: 'bnpl1',
    liability: { label: 'Test Plan', currentBalance: 150 },
    schedule: 'unchanged',
    newRecurringItemId: 'unused',
  };
  const r13 = saveBnplPlanTransition(dataAmbiguousForEdit, editAmbiguous);
  assert('Ambiguous existing linked schedule blocks the edit (ambiguous_schedule)', !r13.applied && r13.reason === 'ambiguous_schedule');
}

// ============================================================================
// Section 4 — confirmBnplRepaymentTransition: atomicity, effectivePaymentCents,
// insufficient-source handling, duplicate protection
// ============================================================================
console.log('\n=== Section 4: confirmBnplRepaymentTransition ===');
{
  function scenario(cash: number, outstanding: number, scheduled: number): AppData {
    return {
      ...withCash(baseData(), cash),
      liabilities: [liability({ currentBalance: outstanding })],
      recurringItems: [item({ amount: scheduled, nextDueDate: dISO('2026-08-10') })],
    };
  }

  function input(overrides: Partial<ConfirmBnplRepaymentInput> = {}): ConfirmBnplRepaymentInput {
    return {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: dISO('2026-08-10'),
      paymentSource: 'cash',
      transactionId: 'txn1',
      date: dISO('2026-08-10'),
      ...overrides,
    };
  }

  // The user's own worked example: stored repayment $100, outstanding $50,
  // cash $200 — source decreases by exactly $50, transaction is $50,
  // liability decreases by exactly $50, no unexplained extra $50 reduction,
  // schedule deactivates.
  {
    const data = scenario(200, 50, 100);
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Worked example: applied', result.applied);
    if (result.applied) {
      assert('Worked example: effectivePaymentCents === 5000 ($50)', result.effectivePaymentCents === 5000);
      assert('Worked example: isPaidOff === true', result.isPaidOff === true);
      const cash = result.data.assets.find((a) => a.id === 'cash1')!;
      assert('Worked example: cash decreased by exactly $50 (200 -> 150)', cash.currentValue === 150);
      const liab = result.data.liabilities.find((l) => l.id === 'bnpl1')!;
      assert('Worked example: liability decreased by exactly $50 (50 -> 0)', liab.currentBalance === 0);
      const txn = result.data.transactions.find((t) => t.id === 'txn1')!;
      assert('Worked example: transaction amount is exactly $50', txn.amount === 50);
      const updatedItem = result.data.recurringItems.find((r) => r.id === 'item1')!;
      assert('Worked example: linked schedule deactivated on payoff', updatedItem.active === false);
      assert('Worked example: schedule advanced exactly once', updatedItem.nextDueDate !== data.recurringItems[0].nextDueDate);
    }
  }

  // Exact-cent balances, smaller final repayment (not a round-number payoff).
  {
    const data = scenario(200, 37.5, 50);
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Smaller final repayment: effectivePaymentCents === 3750', result.applied && result.effectivePaymentCents === 3750);
    assert('Smaller final repayment: isPaidOff === true', result.applied && result.isPaidOff === true);
  }

  // Repayment greater than outstanding (should already be capped by
  // effectivePaymentCents, not rejected).
  {
    const data = scenario(200, 10, 500);
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Repayment > outstanding: caps to the $10 outstanding, still applies', result.applied && result.effectivePaymentCents === 1000);
  }

  // Non-final repayment (regular installment, plan continues).
  {
    const data = scenario(200, 500, 100);
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Non-final repayment: effectivePaymentCents === scheduled amount', result.applied && result.effectivePaymentCents === 10000);
    assert('Non-final repayment: isPaidOff === false', result.applied && result.isPaidOff === false);
    if (result.applied) {
      const updatedItem = result.data.recurringItems.find((r) => r.id === 'item1')!;
      assert('Non-final repayment: schedule stays active', updatedItem.active === true);
    }
  }

  // §7 — insufficient Cash balance: reject outright, mutate nothing.
  {
    const data = scenario(30, 50, 100); // cash $30, needs $50
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Insufficient cash: rejected (insufficient_source_balance)', !result.applied && result.reason === 'insufficient_source_balance');
    if (!result.applied) {
      assert('Insufficient cash: original data object untouched', data.assets[0].currentValue === 30 && data.liabilities[0].currentBalance === 50);
    }
  }

  // Exactly-sufficient Cash balance (boundary — must succeed, not reject).
  {
    const data = scenario(50, 50, 100);
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Exactly-sufficient cash (boundary): applied, not rejected', result.applied);
  }

  // Credit-card funding: card increases by effective amount, BNPL liability
  // decreases by the same amount, net worth unchanged.
  {
    const data: AppData = {
      ...baseData(),
      creditCards: [{ id: 'cc1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 }],
      liabilities: [liability({ currentBalance: 50 }), { id: 'cc-liab', type: 'credit_card', label: 'Test Card', currentBalance: 0, creditCardId: 'cc1' }],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })],
    };
    const netWorthBefore = data.assets.reduce((s, a) => s + a.currentValue, 0) - data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
    const result = confirmBnplRepaymentTransition(data, input({ paymentSource: 'credit_card', creditCardId: 'cc1' }));
    assert('Credit-card funding: applied', result.applied);
    if (result.applied) {
      const card = result.data.creditCards.find((c) => c.id === 'cc1')!;
      assert('Credit-card funding: card balance increased by $50', card.currentBalance === 50);
      const bnplLiab = result.data.liabilities.find((l) => l.id === 'bnpl1')!;
      assert('Credit-card funding: BNPL liability decreased by $50', bnplLiab.currentBalance === 0);
      const netWorthAfter = result.data.assets.reduce((s, a) => s + a.currentValue, 0) - result.data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
      assert('Credit-card funding: net worth unchanged (debt moved, not created/destroyed)', Math.abs(netWorthAfter - netWorthBefore) < 0.001);
    }
  }

  // Stale expectedNextDueDate.
  {
    const data = scenario(200, 50, 100);
    const result = confirmBnplRepaymentTransition(data, input({ expectedNextDueDate: dISO('2099-01-01') }));
    assert('Stale expectedNextDueDate rejected', !result.applied && result.reason === 'stale');
  }

  // Missing/invalid linked liability — no source mutation, no transaction,
  // no partial schedule advance.
  {
    const data = scenario(200, 50, 100);
    const result = confirmBnplRepaymentTransition(data, input({ liabilityId: 'does-not-exist' }));
    assert('Missing liability: rejected (missing_liability)', !result.applied && result.reason === 'missing_liability');
  }
  {
    const data = scenario(200, 50, 100);
    data.liabilities[0].type = 'personal_loan' as any;
    const result = confirmBnplRepaymentTransition(data, input());
    assert('Liability exists but is not type bnpl: rejected (missing_liability)', !result.applied && result.reason === 'missing_liability');
  }

  // Ambiguous schedule blocks confirmation.
  {
    const data: AppData = {
      ...withCash(baseData(), 500),
      liabilities: [liability({ currentBalance: 150 })],
      recurringItems: [item({ id: 'a', nextDueDate: dISO('2026-08-10') }), item({ id: 'b', nextDueDate: dISO('2026-08-10') })],
    };
    const result = confirmBnplRepaymentTransition(data, input({ recurringItemId: 'a' }));
    assert('Ambiguous schedule: confirmation rejected (ambiguous_schedule)', !result.applied && result.reason === 'ambiguous_schedule');
  }

  // --- §8 Engine-level duplicate-confirmation protection ---

  // Immediate double application against the SAME pre-advance snapshot: the
  // second call must be rejected via the durable occurrence-key check, not
  // merely "return an equivalent object."
  {
    const data = scenario(500, 150, 50);
    const first = confirmBnplRepaymentTransition(data, input());
    assert('Duplicate protection setup: first call applies', first.applied);
    if (first.applied) {
      // Second call against the ALREADY-ADVANCED data (the real caller
      // pattern — dataRef.current reflects the first commit) — the
      // existing `stale` check alone already catches this.
      const second = confirmBnplRepaymentTransition(first.data, input());
      assert('Retry against already-advanced data: rejected (stale)', !second.applied && second.reason === 'stale');

      // The stronger, ledger-based proof: construct a snapshot where the
      // schedule cursor was somehow left looking "not yet confirmed" (same
      // nextDueDate as the ORIGINAL input) but the transaction ledger
      // already contains this exact occurrence's recurringOccurrenceKey —
      // simulating a partial-write inconsistency. The occurrence-key check
      // must catch this independently of the nextDueDate cursor.
      const inconsistentData: AppData = {
        ...first.data,
        recurringItems: first.data.recurringItems.map((r) => (r.id === 'item1' ? { ...r, nextDueDate: data.recurringItems[0].nextDueDate } : r)),
      };
      const third = confirmBnplRepaymentTransition(inconsistentData, input());
      assert(
        'Ledger-based duplicate guard: rejected even when the schedule cursor looks not-yet-confirmed (already_confirmed)',
        !third.applied && third.reason === 'already_confirmed'
      );
    }
  }

  // Persistence retry / restart: replaying against a genuinely pre-advance,
  // pre-transaction snapshot (as if the whole previous write was lost) is a
  // legitimate first application, not a duplicate.
  {
    const data = scenario(500, 150, 50);
    const result = confirmBnplRepaymentTransition(data, input({ transactionId: 'retry-txn' }));
    assert('Restart-and-retry against a genuinely untouched snapshot is allowed (first application)', result.applied);
  }

  // Correction pass, §3 — same-snapshot duplicate protection, proven
  // against the REAL calling contract, not just the pure function in
  // isolation. The two pure results above (both independently "applied")
  // are NOT by themselves proof of protection — that was this test's own
  // prior flaw (two pure results were previously described as persistence
  // idempotency, which the correction pass explicitly forbids). The real
  // guarantee comes from AppStateContext's actual architecture, traced
  // here directly:
  //   1. confirmBnplRepayment's useCallback body is fully synchronous up
  //      to and including persist()'s call to commitData(next), which
  //      writes dataRef.current = next BEFORE returning — there is no
  //      `await`/yield point anywhere in that path (see
  //      AppStateContext.tsx's persist/commitData/confirmBnplRepayment).
  //   2. React Native's JS runtime is single-threaded — two "simultaneous"
  //      taps are always two separate, sequential top-level event-handler
  //      invocations; the second one's function body cannot begin
  //      executing until the first one has returned in full.
  //   3. confirmBnplRepayment always reads dataRef.current fresh (never a
  //      closed-over `data`), so the second call in a same-snapshot double
  //      submission necessarily sees the FIRST call's already-committed
  //      result, not the original pre-advance snapshot — even though both
  //      calls were scheduled from the identical rendered state (both
  //      captured the same `expectedNextDueDate` from the same pre-tap
  //      render).
  // This test proves both halves of that claim: applying the second call
  // against the real latest-state path (dataRef.current-equivalent)
  // rejects it, while applying it against the stale original snapshot
  // (what a BROKEN caller that ignored dataRef.current would do) would
  // incorrectly succeed — showing the protection is a property of the
  // "always read the latest committed state" architecture combined with
  // the stale-cursor check, not of the pure function alone.
  {
    const data = scenario(500, 150, 50);
    // Both calls captured the identical expectedNextDueDate from the same
    // pre-tap render — this is the realistic same-snapshot double-tap.
    const sameSnapshotInput = input({ transactionId: 'txA' });

    // The real serialized path: call A commits, then call B is evaluated
    // against dataRef.current, which by then already reflects A's result
    // (this is exactly what the second, chained confirmBnplRepaymentTransition
    // call below simulates — no different from the `first`/`second` pair
    // proven above, restated here as the same-snapshot scenario the user
    // asked for explicitly).
    const callA = confirmBnplRepaymentTransition(data, sameSnapshotInput);
    assert('Same-snapshot duplicate, call A: applies', callA.applied);
    if (callA.applied) {
      const callBAgainstLatestState = confirmBnplRepaymentTransition(callA.data, input({ transactionId: 'txB' }));
      assert(
        'Same-snapshot duplicate, call B against the real latest committed state: rejected (stale)',
        !callBAgainstLatestState.applied && callBAgainstLatestState.reason === 'stale'
      );

      // Only one transaction exists; source decreased once; liability
      // decreased once; schedule advanced once — evaluated on the actual
      // end state a correct caller (always reading dataRef.current) would
      // reach, since call B never committed.
      const finalData = callA.data;
      assert('Same-snapshot duplicate: exactly one BNPL repayment transaction exists', finalData.transactions.filter((t) => !!t.recurringOccurrenceKey).length === 1);
      const cash = finalData.assets.find((a) => a.id === 'cash1')!;
      assert('Same-snapshot duplicate: cash decreased exactly once ($500 -> $450)', cash.currentValue === 450);
      const liab = finalData.liabilities.find((l) => l.id === 'bnpl1')!;
      assert('Same-snapshot duplicate: liability decreased exactly once ($150 -> $100)', liab.currentBalance === 100);
      assert(
        'Same-snapshot duplicate: schedule advanced exactly once',
        finalData.recurringItems[0].nextDueDate !== data.recurringItems[0].nextDueDate
      );

      // The counter-proof: applying call B against the STALE original
      // snapshot instead (what a caller that ignored dataRef.current and
      // used a closed-over `data` would do) succeeds — demonstrating the
      // protection is NOT structural to the pure function in isolation;
      // it depends on the real callback's dataRef.current contract, which
      // is why this test traces that contract explicitly above rather
      // than asserting it implicitly.
      const callBAgainstStaleSnapshot = confirmBnplRepaymentTransition(data, input({ transactionId: 'txB' }));
      assert(
        'Counter-proof: the same call B against the STALE original snapshot would incorrectly apply — protection depends on always reading dataRef.current, not on the pure function alone',
        callBAgainstStaleSnapshot.applied
      );
    }
  }
}

// ============================================================================
// Section 5 — deleteLiabilityTransition: cascading deactivation, corruption
// handling, history preservation
// ============================================================================
console.log('\n=== Section 5: deleteLiabilityTransition ===');
{
  // Deleting an active BNPL plan deactivates its single linked item.
  {
    const data: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [item({})] };
    const result = deleteLiabilityTransition(data, 'bnpl1');
    assert('Deleting active plan: liability removed', !result.liabilities.some((l) => l.id === 'bnpl1'));
    assert('Deleting active plan: linked item deactivated, not deleted (history preserved)', result.recurringItems.some((r) => r.id === 'item1' && r.active === false));
  }

  // Deleting deactivates ALL active linked items, never assuming a single one.
  {
    const data: AppData = { ...baseData(), liabilities: [liability({})], recurringItems: [item({ id: 'a' }), item({ id: 'b' })] };
    const result = deleteLiabilityTransition(data, 'bnpl1');
    assert('Corrupted duplicate links: deletion deactivates BOTH linked items', result.recurringItems.every((r) => r.active === false));
  }

  // Deleting a paid-off plan (currentBalance 0) — same cascade, no special case.
  {
    const data: AppData = { ...baseData(), liabilities: [liability({ currentBalance: 0 })], recurringItems: [item({ active: false })] };
    const result = deleteLiabilityTransition(data, 'bnpl1');
    assert('Deleting a paid-off plan: liability removed cleanly', !result.liabilities.some((l) => l.id === 'bnpl1'));
  }

  // Historical transactions are never touched by liability deletion.
  {
    const data: AppData = {
      ...baseData(),
      liabilities: [liability({})],
      recurringItems: [item({})],
      transactions: [{ id: 't1', type: 'expense', amount: 50, categoryId: 'cat-other-expense', date: dISO('2026-08-01'), recurringItemId: 'item1' }],
    };
    const result = deleteLiabilityTransition(data, 'bnpl1');
    assert('Deleting a plan preserves its historical transactions', result.transactions.length === 1);
  }

  // Non-BNPL liability deletion is completely unchanged (never touches recurringItems).
  {
    const data: AppData = {
      ...baseData(),
      liabilities: [{ id: 'PL1', type: 'personal_loan', label: 'Loan', currentBalance: 500 }],
      recurringItems: [{ id: 'r1', type: 'expense', label: 'Loan repayment', amount: 50, frequency: 'monthly', nextDueDate: dISO('2026-08-10'), isFixed: true, active: true, linkedLiabilityId: 'PL1' }],
    };
    const result = deleteLiabilityTransition(data, 'PL1');
    assert('Deleting a non-bnpl liability never touches recurringItems (unchanged orphaning behaviour)', result.recurringItems[0].active === true);
  }
}

// ============================================================================
// Section 6 — Surface reconciliation: Money Plan, Available Until Payday,
// What Happens Next
// ============================================================================
console.log('\n=== Section 6: surface reconciliation ===');
{
  // Money Plan: billsSetAside's BNPL contribution equals the sum of the
  // BNPL dated entries for the identical month.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 150 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-03'), frequency: 'weekly' })],
    };
    const today = d('2026-08-01');
    const plan = computeMoneyPlan(data, today);
    const bnplDatedEntries = plan.dated.filter((e) => e.label === 'Test Plan repayment');
    const bnplDatedSum = bnplDatedEntries.reduce((s, e) => s + Math.abs(e.amount), 0);
    const safeToSpend = computeSafeToSpend(data, today);
    assert(
      'Money Plan: billsSetAside BNPL contribution equals the sum of dated BNPL line items',
      Math.abs(safeToSpend.bnplMonthlyExpected - bnplDatedSum) < 0.005
    );
    assert('Money Plan: at least one BNPL dated line item present for August', bnplDatedEntries.length > 0);
  }

  // Correction pass, §4 — the user's own exact worked example, full
  // numeric reconciliation across every named surface in one place:
  // outstanding $150, scheduled $100/week, two remaining occurrences in
  // the current calendar month ($100 on 3 Aug, $50 on 10 Aug — the second
  // capped since only $50 remains after the first), one occurrence in the
  // current (5-day) pay cycle ($100 on 3 Aug only — 10 Aug falls outside
  // a 6 Aug payday). monthlySummary.ts is deliberately NOT part of this
  // reconciliation — none of the figures below are sourced from it; every
  // one comes from safeToSpend.ts's own independent, already BNPL-inclusive
  // fixedExpensesMonthly + bnplMonthlyExpected pair (see this file's other
  // header comment on why the two same-named-but-distinct
  // "fixedExpensesMonthly" concepts must never be confused).
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 150 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-03'), frequency: 'weekly' })],
      user: { ...createEmptyAppData().user, payFrequency: 'weekly', nextPayday: dISO('2026-08-06') },
    };
    const today = d('2026-08-01');
    const safeToSpend = computeSafeToSpend(data, today);
    const plan = computeMoneyPlan(data, today);

    assert('§4 worked example — calendar-month BNPL expected total is exactly $150 ($100 + $50)', Math.abs(safeToSpend.bnplMonthlyExpected - 150) < 0.005);
    assert('§4 worked example — Money Plan billsSetAside equals exactly $150 (no other bills in this scenario)', Math.abs(plan.billsSetAside - 150) < 0.005);
    const bnplDatedSum = plan.dated.filter((e) => e.label === 'Test Plan repayment').reduce((s, e) => s + Math.abs(e.amount), 0);
    assert('§4 worked example — Money Plan BNPL dated entries sum to exactly $150, equal to billsSetAside', Math.abs(bnplDatedSum - plan.billsSetAside) < 0.005 && Math.abs(bnplDatedSum - 150) < 0.005);
    assert(
      '§4 worked example — Available Until Payday (cycleBillsExpected) deduction is exactly $100 (only the in-cycle 3 Aug occurrence, never the 10 Aug one)',
      Math.abs(safeToSpend.cycleBillsExpected - 100) < 0.005
    );
    assert('§4 worked example — no figure exceeds the $150 outstanding balance', safeToSpend.bnplMonthlyExpected <= 150.005 && safeToSpend.cycleBillsExpected <= 150.005 && plan.billsSetAside <= 150.005);
    assert(
      '§4 worked example — monthly ($150) and cycle ($100) values are genuinely different, never mixed',
      Math.abs(safeToSpend.bnplMonthlyExpected - safeToSpend.cycleBillsExpected) > 0.005
    );

    // Typical Money Flow's own conversion — fromMonthlyAmount applied to
    // exactly the same fixedExpensesMonthly + bnplMonthlyExpected sum
    // MoneyScreen.tsx itself sums for its "Typical bills" row (never a
    // separate, parallel calculation here).
    const typicalBillsMonthly = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected, 'monthly');
    const typicalBillsFortnightly = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected, 'fortnightly');
    const typicalBillsWeekly = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected, 'weekly');
    assert('§4 worked example — Typical Money Flow monthly display is exactly $150.00', Math.abs(typicalBillsMonthly - 150) < 0.005);
    assert('§4 worked example — Typical Money Flow fortnightly display is exactly $69.23 (150 / (26/12))', Math.abs(typicalBillsFortnightly - 69.2307692) < 0.005);
    assert('§4 worked example — Typical Money Flow weekly display is exactly $34.62 (150 / (52/12))', Math.abs(typicalBillsWeekly - 34.6153846) < 0.005);
  }

  // Available Until Payday: BNPL deduction equals the sum of capped
  // occurrences within the pay-cycle window.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 80 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10'), frequency: 'weekly' })],
      user: { ...createEmptyAppData().user, payFrequency: 'weekly', nextPayday: dISO('2026-08-17') },
    };
    const today = d('2026-08-10');
    const result = computeSafeToSpend(data, today);
    // Outstanding $80, scheduled $100 -> capped to $80 for the single
    // occurrence inside this cycle.
    assert('Available Until Payday: cycleBillsExpected includes the capped ($80) BNPL occurrence, not the raw $100', result.cycleBillsExpected >= 80 && result.cycleBillsExpected < 100);
  }

  // Correction pass, §6 — due exactly on payday is included; due one day
  // after payday is excluded. Isolated with a single, otherwise-unrelated
  // liability/item pair per case so no other bill contributes to
  // cycleBillsExpected.
  {
    const onPaydayData: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 500 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10'), frequency: 'weekly' })],
      user: { ...createEmptyAppData().user, payFrequency: 'weekly', nextPayday: dISO('2026-08-10') },
    };
    const onPaydayResult = computeSafeToSpend(onPaydayData, d('2026-08-05'));
    assert('§6 Due exactly on payday: included in Available Until Payday (cycleBillsExpected reflects the $100 occurrence)', onPaydayResult.cycleBillsExpected === 100);

    const afterPaydayData: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 500 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-11'), frequency: 'weekly' })],
      user: { ...createEmptyAppData().user, payFrequency: 'weekly', nextPayday: dISO('2026-08-10') },
    };
    const afterPaydayResult = computeSafeToSpend(afterPaydayData, d('2026-08-05'));
    assert('§6 Due one day after payday: excluded from Available Until Payday (cycleBillsExpected is $0)', afterPaydayResult.cycleBillsExpected === 0);
  }

  // Full outstanding liability must never ALSO be deducted from available
  // money on top of the capped occurrence — i.e. cycleBillsExpected must
  // never equal fixedExpensesMonthly + the FULL outstanding balance. Uses a
  // narrow 3-day pay cycle (nextPayday 3 days out) so only the SINGLE
  // in-window weekly occurrence (capped to $100) is captured — the
  // remaining $50 of the $150 outstanding is genuinely outside this
  // window and must not appear in cycleBillsExpected at all.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 150 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-03'), frequency: 'weekly' })],
      user: { ...createEmptyAppData().user, payFrequency: 'weekly', nextPayday: dISO('2026-08-06') },
    };
    const today = d('2026-08-03');
    const result = computeSafeToSpend(data, today);
    assert(
      'Full outstanding balance ($150) is never also deducted on top of the capped cycle occurrence (only the in-window $100 counts)',
      result.cycleBillsExpected < 150 && result.cycleBillsExpected >= 100
    );
  }

  // What Happens Next: event amounts match the capped projection, never
  // the raw scheduled amount, for a near-payoff plan.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 50 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10'), frequency: 'weekly' })],
    };
    const events = computeMoneyTimeline(data, d('2026-08-05'), 30);
    const bnplEvent = events.find((e) => e.kind === 'bnpl');
    assert('What Happens Next: BNPL event exists', !!bnplEvent);
    assert('What Happens Next: BNPL event amount is the capped $50, never the raw $100', bnplEvent?.amount === -50);
  }

  // Ordinary recurring behaviour is completely unaffected — a plain bill
  // with no BNPL link still shows its raw amount in What Happens Next.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      recurringItems: [{ id: 'bill1', type: 'expense', label: 'Rent', amount: 500, frequency: 'monthly', nextDueDate: dISO('2026-08-05'), isFixed: true, active: true }],
    };
    const events = computeMoneyTimeline(data, d('2026-08-01'), 30);
    const billEvent = events.find((e) => e.recurringItemId === 'bill1');
    assert('Ordinary (non-BNPL) bill events are completely unchanged', billEvent?.amount === -500 && billEvent?.kind === 'bill');
  }

  // Correction pass, §5 — the user's own exact worked example: outstanding
  // $50, stored schedule $100/week (toMonthlyAmount would be ~$433/month
  // uncapped). Debt Coach must never display a monthly BNPL repayment
  // greater than the $50 actually owed.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [liability({ currentBalance: 50 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10'), frequency: 'weekly' })],
    };
    const summary = computeDebtCoachSummary(data);
    const bnplDebt = summary.debts.find((dbt) => dbt.kind === 'bnpl');
    assert('§5 Debt Coach — BNPL debt entry exists', !!bnplDebt);
    assert('§5 Debt Coach — capped monthly repayment is exactly $50, never the raw ~$433/month', bnplDebt?.monthlyRepayment === 50);
    assert('§5 Debt Coach — totalMonthlyRepayment reflects the capped $50, not the raw rate', summary.totalMonthlyRepayment === 50);
    assert('§5 Debt Coach — no coaching recommendation added: payoffAcceleration stays null (BNPL has no interest rate)', summary.payoffAcceleration === null);
  }

  // Ordinary (non-BNPL) liability repayment display is completely
  // unaffected by the BNPL-specific cap.
  {
    const data: AppData = {
      ...withCash(baseData(), 1000),
      liabilities: [{ id: 'PL1', type: 'personal_loan', label: 'Loan', currentBalance: 50, interestRate: 0 }],
      recurringItems: [{ id: 'r1', type: 'expense', label: 'Loan repayment', amount: 100, frequency: 'weekly', nextDueDate: dISO('2026-08-10'), isFixed: true, active: true, linkedLiabilityId: 'PL1' }],
    };
    const summary = computeDebtCoachSummary(data);
    const loanDebt = summary.debts.find((dbt) => dbt.id === 'PL1');
    assert(
      '§5 Debt Coach — a non-BNPL loan with the identical $50 balance / $100 weekly schedule still shows the uncapped ~$433/month (unchanged existing behaviour)',
      Math.abs((loanDebt?.monthlyRepayment ?? 0) - 433.33) < 0.5
    );
  }
}

// ============================================================================
// Section 7 — Correction pass: reverseBnplRepaymentTransaction,
// isLatestBnplRepaymentTransaction, Everyday Account repayment source
// ============================================================================
console.log('\n=== Section 7: correction pass — reversal, latest-check, Everyday Account source ===');
{
  function scenario(cash: number, outstanding: number, scheduled: number): AppData {
    return {
      ...withCash(baseData(), cash),
      liabilities: [liability({ currentBalance: outstanding })],
      recurringItems: [item({ amount: scheduled, nextDueDate: dISO('2026-08-10') })],
    };
  }
  function input(overrides: Partial<ConfirmBnplRepaymentInput> = {}): ConfirmBnplRepaymentInput {
    return {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: dISO('2026-08-10'),
      paymentSource: 'cash',
      transactionId: 'txn1',
      date: dISO('2026-08-10'),
      ...overrides,
    };
  }

  // §1 worked example, full round-trip: confirm, then reverse. Cash
  // $200->$150 on confirm, BNPL $50->$0; reverse must restore Cash to
  // exactly $200 and BNPL to exactly $50 (never the previously-reported
  // defective partial reversal, which left Cash back at $200 but BNPL
  // stuck at $0 — a permanent $50 net-worth error).
  {
    const data = scenario(200, 50, 50);
    const confirmed = confirmBnplRepaymentTransition(data, input());
    assert('§1 round-trip: confirmation applies', confirmed.applied);
    if (confirmed.applied) {
      const cashAfterConfirm = confirmed.data.assets.find((a) => a.id === 'cash1')!.currentValue;
      const liabAfterConfirm = confirmed.data.liabilities.find((l) => l.id === 'bnpl1')!.currentBalance;
      assert('§1 round-trip: after confirm, cash is $150', cashAfterConfirm === 150);
      assert('§1 round-trip: after confirm, BNPL is $0 (paid off, schedule deactivated)', liabAfterConfirm === 0);
      assert('§1 round-trip: after confirm, schedule is deactivated', confirmed.data.recurringItems.find((r) => r.id === 'item1')!.active === false);

      assert('§1 round-trip: isLatestBnplRepaymentTransaction is true for the just-confirmed transaction', isLatestBnplRepaymentTransaction(confirmed.data, 'txn1'));

      const reversed = reverseBnplRepaymentTransaction(confirmed.data, 'txn1');
      assert('§1 round-trip: reversal applies', reversed.applied);
      if (reversed.applied) {
        const cashAfterReverse = reversed.data.assets.find((a) => a.id === 'cash1')!.currentValue;
        const liabAfterReverse = reversed.data.liabilities.find((l) => l.id === 'bnpl1')!.currentBalance;
        assert('§1 round-trip: after reversal, cash is back to exactly $200 (never left at $150)', cashAfterReverse === 200);
        assert('§1 round-trip: after reversal, BNPL is back to exactly $50 (the confirmed defect: was previously left at $0)', liabAfterReverse === 50);
        assert('§1 round-trip: after reversal, the transaction is removed', !reversed.data.transactions.some((t) => t.id === 'txn1'));
        assert('§1 round-trip: after reversal, the schedule is reactivated', reversed.data.recurringItems.find((r) => r.id === 'item1')!.active === true);
        assert(
          '§1 round-trip: after reversal, the original due date/anchor is preserved exactly',
          reversed.data.recurringItems.find((r) => r.id === 'item1')!.nextDueDate === data.recurringItems[0].nextDueDate
        );
        const netWorthBefore = data.assets.reduce((s, a) => s + a.currentValue, 0) - data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
        const netWorthAfterReverse = reversed.data.assets.reduce((s, a) => s + a.currentValue, 0) - reversed.data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
        assert('§1 round-trip: net worth after full round-trip exactly matches the original (zero net-worth effect)', Math.abs(netWorthAfterReverse - netWorthBefore) < 0.001);

        // Duplicate-reversal prevention — the transaction no longer exists,
        // so a second reversal attempt must be rejected, never silently
        // reverse a second time.
        const secondReversal = reverseBnplRepaymentTransaction(reversed.data, 'txn1');
        assert('§1 round-trip: a second reversal of the same (now-deleted) transaction is rejected (not_found)', !secondReversal.applied && secondReversal.reason === 'not_found');

        // Restart persistence after an allowed reversal — the reactivated,
        // reversed state is a genuinely usable starting point for a real
        // subsequent confirmation, not a corrupted dead end.
        const reconfirmed = confirmBnplRepaymentTransition(reversed.data, input({ transactionId: 'txn2' }));
        assert('§1 round-trip: restart persistence — re-confirming from the reversed state applies cleanly', reconfirmed.applied);
        if (reconfirmed.applied) {
          assert('§1 round-trip: restart persistence — re-confirmed cash matches the original first confirmation ($150)', reconfirmed.data.assets.find((a) => a.id === 'cash1')!.currentValue === 150);
        }
      }
    }
  }

  // Reversal blocked when a LATER repayment already exists on the same
  // plan — only the latest confirmed repayment can ever be undone.
  {
    const data = scenario(1000, 300, 50);
    const first = confirmBnplRepaymentTransition(data, input({ transactionId: 'txnA' }));
    assert('Non-latest blocking setup: first repayment applies', first.applied);
    if (first.applied) {
      // The schedule advanced (weekly) after the first confirmation — the
      // second call must target that new nextDueDate, exactly as a real
      // caller reading dataRef.current fresh would (see §3's own
      // dataRef.current contract above).
      const second = confirmBnplRepaymentTransition(
        first.data,
        input({ transactionId: 'txnB', expectedNextDueDate: first.data.recurringItems[0].nextDueDate })
      );
      assert('Non-latest blocking setup: second repayment applies', second.applied);
      if (second.applied) {
        assert('Non-latest blocking: isLatestBnplRepaymentTransaction is false for the FIRST (now superseded) transaction', !isLatestBnplRepaymentTransaction(second.data, 'txnA'));
        assert('Non-latest blocking: isLatestBnplRepaymentTransaction is true for the SECOND (actually latest) transaction', isLatestBnplRepaymentTransaction(second.data, 'txnB'));
        const blockedReversal = reverseBnplRepaymentTransaction(second.data, 'txnA');
        assert('Non-latest blocking: reversing the earlier (non-latest) repayment is rejected (not_latest)', !blockedReversal.applied && blockedReversal.reason === 'not_latest');
        assert('Non-latest blocking: rejected reversal leaves data completely untouched', second.data.transactions.length === 2);
        const allowedReversal = reverseBnplRepaymentTransaction(second.data, 'txnB');
        assert('Non-latest blocking: reversing the actually-latest repayment (txnB) is allowed', allowedReversal.applied);
      }
    }
  }

  // Reversal correctly rejects a transaction that isn't a BNPL repayment at
  // all (no recurringOccurrenceKey) — the exact same guard QuickAddModal's
  // isBnplRepaymentTransaction predicate relies on.
  {
    const data: AppData = {
      ...withCash(baseData(), 200),
      transactions: [{ id: 'manual1', type: 'expense', amount: 20, categoryId: 'cat-other-expense', date: dISO('2026-08-01') }],
    };
    const result = reverseBnplRepaymentTransaction(data, 'manual1');
    assert('Reversal rejects a plain manual transaction (not_a_bnpl_repayment)', !result.applied && result.reason === 'not_a_bnpl_repayment');
  }

  // Reversal on a nonexistent transaction id.
  {
    const data = scenario(200, 50, 50);
    const result = reverseBnplRepaymentTransaction(data, 'does-not-exist');
    assert('Reversal on a nonexistent transaction id is rejected (not_found)', !result.applied && result.reason === 'not_found');
  }

  // Exact-cent reversal — no float drift restoring the exact original
  // balances, mirroring the exact-cent invariant already proven for
  // confirmation itself.
  {
    const data = scenario(99.99, 37.5, 33.33);
    const confirmed = confirmBnplRepaymentTransition(data, input());
    assert('Exact-cent reversal setup: confirmation applies', confirmed.applied);
    if (confirmed.applied) {
      const reversed = reverseBnplRepaymentTransaction(confirmed.data, 'txn1');
      assert('Exact-cent reversal: applies', reversed.applied);
      if (reversed.applied) {
        const cashAfter = reversed.data.assets.find((a) => a.id === 'cash1')!.currentValue;
        const liabAfter = reversed.data.liabilities.find((l) => l.id === 'bnpl1')!.currentBalance;
        assert('Exact-cent reversal: cash restored to exactly the original 99.99, no float drift', Math.abs(cashAfter - 99.99) < 0.001);
        assert('Exact-cent reversal: BNPL balance restored to exactly the original 37.5, no float drift', Math.abs(liabAfter - 37.5) < 0.001);
      }
    }
  }

  // §2 Scenario B — Everyday Account repayment: the specific selected
  // account decreases by exactly the repayment amount, a SECOND, unrelated
  // Everyday Account is completely untouched, BNPL decreases by the same
  // amount, and net worth is unchanged.
  {
    const data: AppData = {
      ...baseData(),
      assets: [
        { id: 'everyday1', type: 'everyday', label: 'Everyday A', currentValue: 200 },
        { id: 'everyday2', type: 'everyday', label: 'Everyday B', currentValue: 75 },
      ],
      liabilities: [liability({ currentBalance: 50 })],
      recurringItems: [item({ amount: 50, nextDueDate: dISO('2026-08-10') })],
    };
    const netWorthBefore = data.assets.reduce((s, a) => s + a.currentValue, 0) - data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
    const result = confirmBnplRepaymentTransition(data, input({ paymentSource: 'everyday', targetAssetId: 'everyday1' }));
    assert('§2 Scenario B: applied', result.applied);
    if (result.applied) {
      const acc1 = result.data.assets.find((a) => a.id === 'everyday1')!;
      const acc2 = result.data.assets.find((a) => a.id === 'everyday2')!;
      assert('§2 Scenario B: the SELECTED account (Everyday A) decreases from $200 to exactly $150', acc1.currentValue === 150);
      assert('§2 Scenario B: the OTHER account (Everyday B) is completely untouched at $75', acc2.currentValue === 75);
      const bnplLiab = result.data.liabilities.find((l) => l.id === 'bnpl1')!;
      assert('§2 Scenario B: BNPL liability decreased by exactly $50 (50 -> 0)', bnplLiab.currentBalance === 0);
      const txn = result.data.transactions.find((t) => t.id === 'txn1')!;
      assert('§2 Scenario B: the transaction identifies the specific account via targetAssetId', txn.targetAssetId === 'everyday1' && txn.paymentSource === 'everyday');
      const netWorthAfter = result.data.assets.reduce((s, a) => s + a.currentValue, 0) - result.data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
      assert('§2 Scenario B: net worth unchanged', Math.abs(netWorthAfter - netWorthBefore) < 0.001);
    }
  }

  // §2 Scenario D (Everyday Account variant) — an Everyday Account starting
  // below the repayment amount is rejected outright; no source, liability,
  // transaction, or schedule mutation occurs.
  {
    const data: AppData = {
      ...baseData(),
      assets: [{ id: 'everyday1', type: 'everyday', label: 'Everyday A', currentValue: 30 }],
      liabilities: [liability({ currentBalance: 200 })],
      recurringItems: [item({ amount: 50, nextDueDate: dISO('2026-08-10') })],
    };
    const result = confirmBnplRepaymentTransition(data, input({ paymentSource: 'everyday', targetAssetId: 'everyday1' }));
    assert('§2 Scenario D (Everyday, $30 available < $50 repayment): rejected (insufficient_source_balance)', !result.applied && result.reason === 'insufficient_source_balance');
    if (!result.applied) {
      assert('§2 Scenario D: zero mutation — Everyday Account balance untouched at $30', data.assets[0].currentValue === 30);
      assert('§2 Scenario D: zero mutation — BNPL liability untouched at $200', data.liabilities[0].currentBalance === 200);
      assert('§2 Scenario D: zero mutation — no transaction created', data.transactions.length === 0);
      assert('§2 Scenario D: zero mutation — schedule untouched (still active, same due date)', data.recurringItems[0].active === true && data.recurringItems[0].nextDueDate === dISO('2026-08-10'));
    }
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
