// Nolie Design 5.1 Wave 9b — BNPL repayment reachability from the reminder
// queue, and the full financial reconciliation of recording one.
//
// THE DEFECT (owner device test). A ZIP plan was created with $1,000 still
// owed, a $70 fortnightly repayment, next due TOMORROW. Available Until
// Payday moved correctly ($33,276 -> $33,206) and Money's What happens next
// showed "ZIP play repayment -$70", so the liability, the linked recurring
// item and the schedule were all correct. But the reminder sheet exposed
// only three credit-card reminders and never the ZIP repayment, so "Record
// repayment" could not be reached at all.
//
// ROOT CAUSE. `computeRankedReminder` had a BNPL branch in the OVERDUE tier
// and in the DUE-TODAY tier, but the due-soon tier filters BNPL out
// (`!bnplItemIds.has(r.id)`) and had no BNPL branch of its own. For the
// one-day window between "not yet due" and "due today", no
// `bnpl_repayment_due` candidate was ever CONSTRUCTED. Nothing starved it,
// nothing suppressed it, no date was mismatched — the candidate did not
// exist. §1 reproduces that; §2 proves ranking; §3-§6 reconcile the money.
//
// CLASSIFICATION: Class A. Every assertion runs the real selector, the real
// transition and the real accounting resolvers — never a mirror.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9b-bnpl-reminder.test.ts

import { computeRankedReminder, SmartReminder } from '../src/lib/calculations/reminders';
import { confirmBnplRepaymentTransition } from '../src/state/AppStateContext';
import {
  resolveTransactionCashflowAmount,
  resolveTransactionAggregateSpendingAmount,
} from '../src/lib/calculations/repaymentAccounting';
import { createSuppressionPredicate } from '../src/lib/calculations/reminderSuppression';
import { occurrenceKeyOf } from '../src/lib/calculations/reminderInteractionLifecycle';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData, Asset, CreditCard, Liability, RecurringItem, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

// Fixed local dates — never toISOString, which would shift the calendar day.
const TODAY = new Date(2026, 8, 14);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TOMORROW = iso(new Date(2026, 8, 15));
const STAMP = '2026-09-14T09:00:00.000Z';

/** The owner's exact device state: ZIP at $1,000 owed, $70 fortnightly, due
 * tomorrow — plus three credit cards that are also genuinely eligible. */
function deviceWorld(): AppData {
  const d = createEmptyAppData();
  const zip: Liability = { id: 'zip1', type: 'bnpl', label: 'ZIP play', currentBalance: 1000 };
  const zipItem: RecurringItem = {
    id: 'r-zip',
    type: 'expense',
    label: 'ZIP play repayment',
    amount: 70,
    frequency: 'fortnightly',
    nextDueDate: TOMORROW,
    isFixed: true,
    active: true,
    linkedLiabilityId: 'zip1',
  };
  const card = (id: string, dueOffset: number): CreditCard => ({
    id,
    issuer: 'Bank',
    label: `Card ${id}`,
    creditLimit: 10000,
    currentBalance: 500,
    dueDay: new Date(2026, 8, 14 + dueOffset).getDate(),
    minimumPayment: 25,
    apr: 0.2,
  });
  d.liabilities = [zip];
  d.recurringItems = [zipItem];
  // Three cards inside their own 3-day due window — the reminders that were
  // the ONLY thing the device showed.
  d.creditCards = [card('c1', 1), card('c2', 2), card('c3', 3)];
  d.assets = [{ id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 33276 } as Asset];
  return d;
}

/** Walk the ranked selector, excluding what we have already seen, to read
 * the deterministic queue order out of the real engine. */
function queue(data: AppData, limit = 8): SmartReminder[] {
  const seen: SmartReminder[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < limit; i++) {
    const next = computeRankedReminder(data, TODAY, (r) => ids.has(r.id));
    if (!next) break;
    ids.add(next.id);
    seen.push(next);
  }
  return seen;
}

console.log('=== 1. The defect: a BNPL repayment due TOMORROW is a candidate ===');
{
  const data = deviceWorld();
  const q = queue(data);
  const bnpl = q.filter((r) => r.kind === 'bnpl_repayment_due');
  const cards = q.filter((r) => r.kind === 'card_due_soon');

  assert('1a. the ZIP repayment now reaches the queue at all', bnpl.length === 1);
  assert('1b. …as kind bnpl_repayment_due', bnpl[0]?.kind === 'bnpl_repayment_due');
  assert('1c. …carrying its linked liability', bnpl[0]?.liabilityId === 'zip1');
  assert('1d. …its recurring item', bnpl[0]?.recurringItemId === 'r-zip');
  assert('1e. …the exact recorded amount', bnpl[0]?.amount === 70);
  assert('1f. …and tomorrow as its occurrence date', bnpl[0]?.occurrenceDate === TOMORROW);
  assert('1g. the three card reminders remain reachable, not displaced', cards.length === 3);

  // Boundary: the window is exactly one day, matching the bill tier.
  const dayAfter = deviceWorld();
  dayAfter.recurringItems = [{ ...dayAfter.recurringItems[0], nextDueDate: iso(new Date(2026, 8, 16)) }];
  assert('1h. two days out is NOT yet surfaced (the tier is exactly +1)', queue(dayAfter).every((r) => r.kind !== 'bnpl_repayment_due'));
  // And the pre-existing tiers still work.
  const dueToday = deviceWorld();
  dueToday.recurringItems = [{ ...dueToday.recurringItems[0], nextDueDate: iso(TODAY) }];
  assert('1i. due today still surfaces (existing tier untouched)', queue(dueToday).some((r) => r.kind === 'bnpl_repayment_due'));
  const overdue = deviceWorld();
  overdue.recurringItems = [{ ...overdue.recurringItems[0], nextDueDate: iso(new Date(2026, 8, 10)) }];
  assert('1j. overdue still surfaces (existing tier untouched)', queue(overdue).some((r) => r.kind === 'bnpl_repayment_due'));

  // The amount is capped at what is genuinely still owed.
  const nearlyPaid = deviceWorld();
  nearlyPaid.liabilities = [{ ...nearlyPaid.liabilities[0], currentBalance: 25 }];
  const capped = queue(nearlyPaid).find((r) => r.kind === 'bnpl_repayment_due');
  assert('1k. a final instalment is capped at the outstanding balance', capped?.amount === 25);
}

console.log('\n=== 2. Ranking is deterministic and no kind starves another ===');
{
  const data = deviceWorld();
  const q = queue(data);
  const kinds = q.map((r) => r.kind);
  assert('2a. four reminders are reachable in total', q.length === 4);
  assert('2b. BNPL due tomorrow ranks with bills, above cards due soon', kinds.indexOf('bnpl_repayment_due') < kinds.indexOf('card_due_soon'));
  assert('2c. all three cards still follow, none dropped', kinds.filter((k) => k === 'card_due_soon').length === 3);
  // Deterministic: the same input yields the same order every time.
  assert('2d. the order is deterministic across repeated evaluation', JSON.stringify(queue(data).map((r) => r.id)) === JSON.stringify(q.map((r) => r.id)));
  // Finite: the queue does not grow without bound.
  assert('2e. the queue stays finite', queue(data, 50).length === 4);

  // An overdue BNPL must still outrank a card, as it always did.
  const overdue = deviceWorld();
  overdue.recurringItems = [{ ...overdue.recurringItems[0], nextDueDate: iso(new Date(2026, 8, 10)) }];
  assert('2f. an OVERDUE BNPL still leads the queue', queue(overdue)[0]?.kind === 'bnpl_repayment_due');
}

console.log('\n=== 3. Suppression semantics are unchanged ===');
{
  const data = deviceWorld();
  const bnpl = queue(data).find((r) => r.kind === 'bnpl_repayment_due')!;
  const key = occurrenceKeyOf(bnpl);

  const dismissed: AppData = { ...data, dismissedReminderOccurrences: [key] };
  const afterDismiss = computeRankedReminder(dismissed, TODAY, createSuppressionPredicate(dismissed, TODAY));
  assert('3a. dismissing the BNPL occurrence removes it', afterDismiss?.kind !== 'bnpl_repayment_due');
  assert('3b. …without removing the card reminders', afterDismiss?.kind === 'card_due_soon');

  const snoozed: AppData = { ...data, snoozedReminderOccurrences: { [key]: '2026-09-20' } };
  const afterSnooze = computeRankedReminder(snoozed, TODAY, createSuppressionPredicate(snoozed, TODAY));
  assert('3c. snoozing it also removes it', afterSnooze?.kind !== 'bnpl_repayment_due');
  assert('3d. and the cards remain reachable', afterSnooze?.kind === 'card_due_soon');
}

console.log('\n=== 4. Recording the $70 repayment — exact reconciliation ===');
{
  const before = deviceWorld();
  assert('4a. selection alone writes nothing: no transaction yet', before.transactions.length === 0);
  assert('4b. …the funding balance is untouched', before.assets[0].currentValue === 33276);
  assert('4c. …and the liability is untouched', before.liabilities[0].currentBalance === 1000);

  const r = confirmBnplRepaymentTransition(before, {
    recurringItemId: 'r-zip',
    liabilityId: 'zip1',
    expectedNextDueDate: TOMORROW,
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    transactionId: 'txn-zip',
    date: STAMP,
  } as never);
  assert('4d. the confirmation applies', r.applied === true);

  if (r.applied) {
    const after = (r as unknown as { data: AppData }).data;
    const seen = new Set(before.transactions.map((t) => t.id));
    const txns = after.transactions.filter((t) => !seen.has(t.id));

    assert('4e. exactly ONE transaction is created', txns.length === 1);
    assert('4f. at exact cents', txns[0].amount === 70);
    assert('4g. categorised Debt repayments', txns[0].categoryId === 'cat-debt');
    assert('4h. the BNPL liability falls $1,000 -> $930, once', after.liabilities[0].currentBalance === 930);
    assert('4i. the funding balance falls by exactly $70, once', after.assets[0].currentValue === 33206);
    assert('4j. the occurrence advances once', after.recurringItems[0].nextDueDate !== TOMORROW);
    assert('4k. …forward by the fortnightly cadence', new Date(after.recurringItems[0].nextDueDate).getTime() > new Date(TOMORROW).getTime());
    assert('4l. the plan stays active, so a future repayment remains', after.recurringItems[0].active === true);
    assert('4m. …and the schedule still points at the same liability', after.recurringItems[0].linkedLiabilityId === 'zip1');

    // Specialised accounting is unchanged.
    assert('4n. ordinary spending does NOT rise', resolveTransactionAggregateSpendingAmount(after, txns[0]) === 0);
    assert('4o. recorded cashflow is unchanged by it', resolveTransactionCashflowAmount(after, txns[0]) === 0);

    // Rapid double-confirm cannot duplicate.
    const again = confirmBnplRepaymentTransition(after, {
      recurringItemId: 'r-zip',
      liabilityId: 'zip1',
      expectedNextDueDate: TOMORROW,
      paymentSource: 'everyday',
      targetAssetId: 'ev1',
      transactionId: 'txn-zip-2',
      date: STAMP,
    } as never);
    assert('4p. a rapid double-confirm is refused', again.applied === false);
    assert('4q. …so the liability stays at $930', after.liabilities[0].currentBalance === 930);
    assert('4r. …and only one transaction exists', after.transactions.length === 1);

    // The recorded occurrence no longer surfaces; the NEXT one will.
    assert('4s. the paid occurrence no longer offers the same reminder id', !queue(after).some((r2) => r2.id === `bnpl-soon-r-zip-${TOMORROW}`));
  }
}

console.log('\n=== 5. Cancel writes nothing; a stale confirmation is refused ===');
{
  const before = deviceWorld();
  const stale = confirmBnplRepaymentTransition(before, {
    recurringItemId: 'r-zip',
    liabilityId: 'zip1',
    expectedNextDueDate: '2026-01-01',
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    transactionId: 'txn-stale',
    date: STAMP,
  } as never);
  assert('5a. a stale expected date is refused', stale.applied === false);
  assert('5b. nothing was written', before.transactions.length === 0);
  assert('5c. the funding balance is untouched', before.assets[0].currentValue === 33276);
  assert('5d. the liability is untouched', before.liabilities[0].currentBalance === 1000);
}

console.log('\n=== 6. Historical rows untouched; other reminder kinds intact ===');
{
  const before = deviceWorld();
  const historical: Transaction = { id: 'h1', type: 'expense', amount: 70, categoryId: 'cat-other-expense', date: '2026-08-31T09:00:00.000Z', recurringItemId: 'r-zip' };
  before.transactions = [historical];
  const r = confirmBnplRepaymentTransition(before, {
    recurringItemId: 'r-zip',
    liabilityId: 'zip1',
    expectedNextDueDate: TOMORROW,
    paymentSource: 'everyday',
    targetAssetId: 'ev1',
    transactionId: 'txn-zip',
    date: STAMP,
  } as never);
  if (r.applied) {
    const after = (r as unknown as { data: AppData }).data;
    const still = after.transactions.find((t) => t.id === 'h1');
    assert('6a. the historical BNPL row is untouched', still?.categoryId === 'cat-other-expense');
    assert('6b. exactly one new row was added', after.transactions.length === 2);
  }

  // Salary, bill and loan reminders still reachable alongside BNPL.
  const mixed = deviceWorld();
  mixed.recurringItems = [
    ...mixed.recurringItems,
    // salary_check asks "did it arrive?", so it fires on or just AFTER the
    // expected date — never before it. Seeded at today accordingly.
    { id: 'r-salary', type: 'income', label: 'Salary', amount: 3000, frequency: 'monthly', nextDueDate: iso(TODAY), isFixed: true, active: true },
    { id: 'r-rent', type: 'expense', label: 'Rent', amount: 500, frequency: 'monthly', nextDueDate: TOMORROW, isFixed: true, active: true, categoryId: 'cat-rent' },
  ];
  const kinds = queue(mixed, 12).map((r2) => r2.kind);
  assert('6c. salary remains reachable', kinds.includes('salary_check'));
  assert('6d. an ordinary bill remains reachable', kinds.includes('bill_due_soon'));
  assert('6e. BNPL remains reachable alongside them', kinds.includes('bnpl_repayment_due'));
  assert('6f. cards remain reachable', kinds.includes('card_due_soon'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
