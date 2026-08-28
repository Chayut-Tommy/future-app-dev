// A1 — sub-monthly identity stability via REAL re-enumeration (pure).
//
// NON-TAUTOLOGICAL proof. It is not enough that the stored transaction string is
// immutable; this test proves that after a supported source edit, RE-ENUMERATING
// the edited schedule through the authoritative recurrence owner
// (`recurringOccurrencesInRange`) and rebuilding occurrence ids, the linked
// logical cycle remains satisfied EXACTLY ONCE and never duplicates, and — where
// an edit legitimately begins a new schedule — the historical linked occurrence
// stays closed, is never regenerated under a new id, and the new schedule begins
// cleanly from its own effective occurrence.
//
// Sequence per case: create source → enumerate → build id → link txn → apply the
// REAL updateRecurringItem transition → re-enumerate → rebuild ids → resolve.
//
// Run: ./node_modules/.bin/tsx tests/a1-submonthly-reenumeration.test.ts

import type { AppData, RecurringItem, Transaction } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import { recurringOccurrencesInRange } from '../src/lib/calculations/recurringSchedule';
import { occurrenceIdForRecurringItem } from '../src/lib/calculations/occurrenceSources';
import { resolveOccurrence, OccurrenceDescriptor } from '../src/lib/calculations/occurrenceResolution';
import { resolveScheduleAnchorDay } from '../src/state/AppStateContext';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (y: number, m: number, d: number) => D(y, m, d).toISOString();

// Faithful mirror of the REAL updateRecurringItem transition (AppStateContext):
// map recurringItems, re-resolving scheduleAnchorDay exactly as production does.
function realUpdate(data: AppData, id: string, patch: Partial<RecurringItem>): AppData {
  return {
    ...data,
    recurringItems: data.recurringItems.map((r) => (r.id === id ? { ...r, ...patch, scheduleAnchorDay: resolveScheduleAnchorDay(r, patch) } : r)),
  };
}

function enumerateIds(data: AppData, from: Date, to: Date): { date: Date; id: string | undefined }[] {
  return recurringOccurrencesInRange(data.recurringItems, from, to).map((o) => ({ date: o.date, id: occurrenceIdForRecurringItem(data, o.item, o.date) }));
}

/**
 * The full re-enumeration proof for one edit.
 * @param keepsDate whether the edit is expected to keep the linked occurrence in
 *   the regenerated schedule (true) or legitimately begin a new schedule that no
 *   longer regenerates it (false — the prospective rule).
 */
function proveEdit(
  caseLabel: string,
  makeItem: () => RecurringItem,
  linkDate: Date,
  patch: Partial<RecurringItem>,
  win: { from: Date; to: Date },
  keepsDate: boolean
) {
  const item = makeItem();
  let data: AppData = {
    ...createEmptyAppData(),
    recurringItems: [item],
  };
  // 1–3. enumerate the ORIGINAL schedule and confirm the target occurrence with
  // its canonical id is genuinely produced by the authoritative owner.
  const pre = enumerateIds(data, win.from, win.to);
  const linkedId = occurrenceIdForRecurringItem(data, item, linkDate)!;
  const preMatch = pre.filter((o) => o.id === linkedId);
  assert(`${caseLabel}: baseline — the authoritative enumerator produces the target occurrence once`, preMatch.length === 1);

  // 4. link a real transaction to that exact occurrence.
  data = {
    ...data,
    transactions: [{ id: 'txw', type: item.type, amount: item.amount, categoryId: 'c', date: linkDate.toISOString(), occurrenceResolution: { version: 1, state: 'linked', occurrenceId: linkedId } } as Transaction],
  };

  // 5. apply the REAL edit transition.
  data = realUpdate(data, item.id, patch);

  // 6–7. re-enumerate the EDITED schedule and rebuild ids.
  const post = enumerateIds(data, win.from, win.to);
  const regen = post.filter((o) => o.id === linkedId);

  // 8–9. resolve the linked logical cycle and prove the safety properties.
  const occ: OccurrenceDescriptor = { id: linkedId, sourceKind: item.type === 'income' ? 'income' : 'bill', sourceId: item.id, isRepayment: false };
  const res = resolveOccurrence(occ, data.transactions);
  assert(`${caseLabel}: the linked logical cycle remains SATISFIED after the edit`, res.state === 'satisfied' && res.linkedTransactionIds.length === 1);
  assert(`${caseLabel}: the linked occurrence is never regenerated MORE than once (no duplication)`, regen.length <= 1);
  if (keepsDate) {
    assert(`${caseLabel}: the edit keeps the cycle — regenerated exactly once, satisfied by the one linked txn`, regen.length === 1);
  } else {
    assert(`${caseLabel}: prospective rule — the historical occurrence is NOT regenerated under the edited schedule`, regen.length === 0);
    assert(`${caseLabel}: prospective rule — the new schedule begins from its own effective occurrences (all distinct)`, post.length > 0 && new Set(post.map((o) => o.id)).size === post.length && !post.some((o) => o.id === linkedId));
  }
  // No OTHER enumerated occurrence is accidentally satisfied by the linked txn.
  const crossContaminated = post.some((o) => o.id !== linkedId && o.id && resolveOccurrence({ id: o.id as any, sourceKind: occ.sourceKind, sourceId: item.id, isRepayment: false }, data.transactions).state === 'satisfied');
  assert(`${caseLabel}: no OTHER cycle is accidentally satisfied by the linked transaction`, !crossContaminated);
}

const weekly = (nextDue: Date): (() => RecurringItem) => () => ({ id: 'wk', type: 'income', label: 'Casual pay', amount: 300, frequency: 'weekly', nextDueDate: nextDue.toISOString(), isFixed: false, active: true } as RecurringItem);
const APR_MAY = { from: D(2026, 3, 25), to: D(2026, 6, 5) };

console.log('=== edits that KEEP the sub-monthly cycle (id regenerates identically) ===');
proveEdit('label-only', weekly(D(2026, 4, 5)), D(2026, 4, 5), { label: 'Weekend shift' }, APR_MAY, true);
proveEdit('amount', weekly(D(2026, 4, 5)), D(2026, 4, 5), { amount: 350 }, APR_MAY, true);
proveEdit('anchor adjustment (irrelevant to weekly)', weekly(D(2026, 4, 5)), D(2026, 4, 5), { scheduleAnchorDay: 15 }, APR_MAY, true);
proveEdit('weekly → fortnightly (5 Apr is still the n=0 occurrence)', weekly(D(2026, 4, 5)), D(2026, 4, 5), { frequency: 'fortnightly' }, APR_MAY, true);
proveEdit('fortnightly → weekly (5 Apr is still the n=0 occurrence)', () => ({ id: 'wk', type: 'income', label: 'Pay', amount: 300, frequency: 'fortnightly', nextDueDate: iso(2026, 4, 5), isFixed: false, active: true } as RecurringItem), D(2026, 4, 5), { frequency: 'weekly' }, APR_MAY, true);

console.log('\n=== boundary/DST cases (date-anchored id is stable) ===');
// DST end in AU: 5 Apr 2026. DST start: 4 Oct 2026. Local Y-M-D is stable across both.
proveEdit('DST-end 5 Apr, label edit', weekly(D(2026, 4, 5)), D(2026, 4, 5), { label: 'x' }, APR_MAY, true);
proveEdit('DST-start 4 Oct, label edit', weekly(D(2026, 10, 4)), D(2026, 10, 4), { label: 'x' }, { from: D(2026, 9, 25), to: D(2026, 11, 5) }, true);
proveEdit('month boundary (link 3 May, edit amount)', weekly(D(2026, 4, 26)), D(2026, 5, 3), { amount: 999 }, APR_MAY, true);
proveEdit('year boundary (link 4 Jan 2027, edit label)', weekly(D(2026, 12, 28)), D(2027, 1, 4), { label: 'ny' }, { from: D(2026, 12, 20), to: D(2027, 2, 5) }, true);

console.log('\n=== edits that legitimately BEGIN A NEW SCHEDULE (prospective rule) ===');
// Moving a weekly source to a different weekday shifts every future occurrence;
// the historical 5 Apr link is a closed record and must not regenerate/duplicate.
proveEdit('due-date move off the anchored date (5 Apr → 7 Apr onward)', weekly(D(2026, 4, 5)), D(2026, 4, 5), { nextDueDate: iso(2026, 4, 7) }, APR_MAY, false);

console.log('\n=== monthly due-day-within-month keeps ONE cycle (contrast) ===');
{
  // A monthly source: moving the due day WITHIN the month keeps the same YYYY-MM
  // cycle id, proving month-anchored identity does not fork on an in-month move.
  const item = { id: 'm1', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true } as RecurringItem;
  let data: AppData = { ...createEmptyAppData(), recurringItems: [item] };
  const linkedId = occurrenceIdForRecurringItem(data, item, D(2026, 8, 3))!;
  data = { ...data, transactions: [{ id: 'txm', type: 'expense', amount: 900, categoryId: 'c', date: iso(2026, 8, 3), occurrenceResolution: { version: 1, state: 'linked', occurrenceId: linkedId } } as Transaction] };
  data = realUpdate(data, 'm1', { nextDueDate: iso(2026, 8, 20) });
  const post = enumerateIds(data, D(2026, 7, 25), D(2026, 9, 5));
  const regen = post.filter((o) => o.id === linkedId);
  const res = resolveOccurrence({ id: linkedId, sourceKind: 'bill', sourceId: 'm1', isRepayment: false }, data.transactions);
  assert('monthly in-month due-day move: same YYYY-MM cycle regenerated exactly once', regen.length === 1);
  assert('monthly in-month due-day move: the cycle stays satisfied by the one link', res.state === 'satisfied' && res.linkedTransactionIds.length === 1);
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
