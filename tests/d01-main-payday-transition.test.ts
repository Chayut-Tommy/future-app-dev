// Pass D0.1 — pure proofs for the ONE Main-payday selection transition and the
// timeout copy. Durability (write-first, rejection, restart, late writes) is proven
// against the real provider and adapter in tests/rendered/d01-closure.render.test.tsx.
// Run with: npx tsx tests/d01-main-payday-transition.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { DurableMutationRefused, setMainPaydayIncomeTransition, syncIncomeAggregate, updateRecurringItemTransition } from '../src/state/AppStateContext';
import { resolveMainPayday } from '../src/lib/calculations/incomeEngine';
import { EDITOR_SAVE_FAILED_COPY, EDITOR_UNCONFIRMED_COPY, isDurableTimeout } from '../src/lib/editorCompletion';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const TODAY = new Date(2026, 8, 21);
function fixture(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'rental' } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 10650, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 28), isFixed: false, active: true } as RecurringItem,
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true } as RecurringItem,
    { id: 'gig', type: 'income', label: 'Gig', amount: 500, frequency: 'irregular', nextDueDate: iso(2026, 9, 22), isFixed: false, active: true, nextDueDateUnknown: true } as RecurringItem,
    // Same label, amount and date as Salary — identity must never be read from those.
    { id: 'twin', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 28), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}
const refused = (fn: () => unknown) => { try { fn(); return false; } catch (e) { return e instanceof DurableMutationRefused; } };

const d = fixture();
const next = setMainPaydayIncomeTransition(d, 'salary');
assert('selecting another source is ONE atomic change of the single identity: the old primary is replaced, never two, never none', next.user.mainPaydayIncomeId === 'salary' && next.recurringItems === d.recurringItems && next.assets === d.assets && next.transactions === d.transactions && resolveMainPayday(next.recurringItems, next.user.mainPaydayIncomeId).source?.id === 'salary');
assert('no per-income flag exists before or after (one identity only)', !next.recurringItems.some((r) => 'isMainPayday' in r));
assert('selecting the CURRENT source returns the same object — nothing to write, and the only primary can never be removed by it', setMainPaydayIncomeTransition(d, 'rental') === d);
assert('ineligible, expense, inactive and unknown ids are refused; the previous primary stands', ['gig', 'rent', 'nope'].every((id) => refused(() => setMainPaydayIncomeTransition(d, id))) && refused(() => setMainPaydayIncomeTransition({ ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'salary' ? { ...r, active: false } : r)) }, 'salary')));
assert('identity is the stable id only: a twin with the same label, amount and date is a different source', setMainPaydayIncomeTransition(d, 'twin').user.mainPaydayIncomeId === 'twin' && setMainPaydayIncomeTransition(d, 'salary').user.mainPaydayIncomeId === 'salary');
const horizonBefore = computeSafeToSpend(d, TODAY).cycleEnd.toISOString();
const horizonAfter = computeSafeToSpend(syncIncomeAggregate(next), TODAY).cycleEnd.toISOString();
assert('the AUP horizon follows the chosen source through the EXISTING derivation (30 Sep → 28 Sep); the transition itself computes nothing', horizonBefore !== horizonAfter && new Date(horizonAfter).getDate() === 28 && next.user.nextPayday === d.user.nextPayday);
assert('the income editor option is the same identity change, in the same single transition as the edit', (() => { const e = updateRecurringItemTransition(d, 'salary', { amount: 4100 }, { setAsMainPayday: true }); return e.user.mainPaydayIncomeId === 'salary' && e.recurringItems.find((r) => r.id === 'salary')!.amount === 4100; })());
const timeout = Object.assign(new Error('durable write timed out'), { name: 'DurableWriteTimeout' });
assert('a timeout is recognised structurally and its copy never claims that nothing changed; a rejection keeps the proven copy', isDurableTimeout(timeout) && !isDurableTimeout(new Error('disk full')) && !/nothing was changed/i.test(EDITOR_UNCONFIRMED_COPY) && /Nothing was changed/.test(EDITOR_SAVE_FAILED_COPY));

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
