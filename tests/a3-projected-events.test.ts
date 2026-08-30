// A3 — canonical projected-event stream reconciliation (pure, executable).
// ONE resolved result; the money timeline derives its occurrence rows from the
// canonical INCLUDED events. Reconciles source → A1 resolution → signed cents →
// both consumers, proves invalid data becomes typed issues (never silent), and
// proves deterministic ordering under input permutation.
// Run: ./node_modules/.bin/tsx tests/a3-projected-events.test.ts

import type { AppData, Asset, CreditCard, Liability, LiabilityType, RecurringItem, Transaction } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';
import { computeProjectedEvents, computeProjectedEventsFromISO, projectTimelineOccurrences } from '../src/lib/calculations/projectedEvents';
import { computeMoneyTimeline } from '../src/lib/calculations/moneyTimeline';
import { parseLocalDate } from '../src/lib/calculations/localCalendar';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const isoT = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const link = (id: string) => ({ occurrenceResolution: { version: 1 as const, state: 'linked' as const, occurrenceId: id as any } });
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const incomeItem = (id: string, amount: number, nextDue: string, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type: 'income', label: id, amount, frequency: 'monthly', nextDueDate: nextDue, isFixed: false, active: true, ...extra } as RecurringItem);
const billItem = (id: string, amount: number, nextDue: string, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type: 'expense', label: id, amount, frequency: 'monthly', nextDueDate: nextDue, isFixed: true, active: true, ...extra } as RecurringItem);
const incomeOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'income', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const billOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'bill', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const loanOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'loan', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const cardOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'card', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const run = (data: AppData, from: string, to: string) => computeProjectedEventsFromISO(data, from, to);
const iso = (ev: { date: { year: number; month: number; day: number } }) => `${ev.date.year}-${String(ev.date.month).padStart(2, '0')}-${String(ev.date.day).padStart(2, '0')}`;
const card = (extra: Partial<CreditCard> = {}): CreditCard => ({ id: 'c1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 200, ...extra } as CreditCard);

console.log('=== 5.1 linked salary (as-of 15 Aug) ===');
{
  const data = base();
  data.recurringItems = [incomeItem('wage', 2500, isoT(2026, 8, 25))];
  data.transactions = [{ id: 'sal', type: 'income', amount: 2500, categoryId: 'c', date: isoT(2026, 8, 25), ...link(incomeOid('wage', 2026, 8)) } as Transaction];
  const r = run(data, '2026-08-15', '2026-09-30');
  assert('5.1a. 25 Aug is excluded from canonical included events (already satisfied)', r.excluded.some((e) => e.sourceId === 'wage' && iso(e) === '2026-08-25' && e.exclusionReason === 'already_satisfied') && !r.events.some((e) => e.sourceId === 'wage' && iso(e) === '2026-08-25'));
  assert('5.1b. 25 September appears exactly once, +$2500', r.events.filter((e) => e.sourceId === 'wage').length === 1 && iso(r.events.find((e) => e.sourceId === 'wage')!) === '2026-09-25' && r.events.find((e) => e.sourceId === 'wage')!.signedCents === 250000);
  const tl = projectTimelineOccurrences(data, new Date(2026, 7, 15), 30);
  assert('5.1c. What Happens Next does not present 25 Aug salary as upcoming income', !tl.some((e) => e.kind === 'income' && e.id.includes('wage') && e.date.getTime() === new Date(2026, 7, 25).getTime()));
}

console.log('\n=== 5.2 independent bonus ===');
{
  const data = base();
  data.recurringItems = [incomeItem('wage', 2000, isoT(2026, 8, 25))];
  data.transactions = [{ id: 'bonus', type: 'income', amount: 1000, categoryId: 'c', date: isoT(2026, 8, 20), occurrenceResolution: { version: 1, state: 'independent' } } as Transaction];
  const r = run(data, '2026-08-01', '2026-08-31');
  assert('5.2a. an independent bonus does not suppress the salary; salary eligible exactly once', r.events.filter((e) => e.sourceId === 'wage').length === 1 && r.events.find((e) => e.sourceId === 'wage')!.resolutionState === 'eligible');
}

console.log('\n=== 5.3 linked bill ===');
{
  const data = base();
  data.recurringItems = [billItem('rent', 900, isoT(2026, 8, 3))];
  data.transactions = [{ id: 'b', type: 'expense', amount: 900, categoryId: 'c', date: isoT(2026, 8, 3), ...link(billOid('rent', 2026, 8)) } as Transaction];
  const r = run(data, '2026-08-01', '2026-08-31');
  assert('5.3a. a linked bill is excluded from canonical included events and What Happens Next', !r.events.some((e) => e.sourceId === 'rent') && r.excluded.some((e) => e.sourceId === 'rent') && !projectTimelineOccurrences(data, new Date(2026, 7, 1), 30).some((e) => e.id.includes('rent')));
  const unlinked = { ...data, transactions: [] };
  assert('5.3b. unlinking makes the bill eligible again (recurrence cursor unmoved)', run(unlinked, '2026-08-01', '2026-08-31').events.some((e) => e.sourceId === 'rent') && unlinked.recurringItems[0].nextDueDate === isoT(2026, 8, 3));
}

console.log('\n=== 5.4 partial / full card repayment ===');
{
  const dP = base(); dP.creditCards = [card()];
  dP.transactions = [{ id: 'p', type: 'expense', amount: 50, categoryId: 'c', date: isoT(2026, 8, 20), isRepayment: true, ...link(cardOid('c1', 2026, 8)) } as Transaction];
  const rP = run(dP, '2026-08-01', '2026-08-31');
  assert('5.4a. canonical partial card event is −$150 (remaining), not −$200 or 0', rP.events.some((e) => e.sourceKind === 'card' && e.signedCents === -15000 && e.resolutionState === 'partially_satisfied'));
  const tlP = projectTimelineOccurrences(dP, new Date(2026, 7, 1), 30);
  assert('5.4b. What Happens Next presents the remaining $150 (amount −150)', tlP.some((e) => e.kind === 'credit_card' && e.amount === -150));
  const dF = base(); dF.creditCards = [card()];
  dF.transactions = [{ id: 'f', type: 'expense', amount: 200, categoryId: 'c', date: isoT(2026, 8, 20), isRepayment: true, ...link(cardOid('c1', 2026, 8)) } as Transaction];
  const rF = run(dF, '2026-08-01', '2026-08-31');
  assert('5.4c. a fully satisfied cycle is absent from canonical events and the timeline', !rF.events.some((e) => e.sourceKind === 'card') && !projectTimelineOccurrences(dF, new Date(2026, 7, 1), 30).some((e) => e.kind === 'credit_card'));
  const dEdit = base(); dEdit.creditCards = [card({ dueDay: 25 })];
  assert('5.4d. a due-day edit within the same billing month does not fork the occurrence id (oid1:card:…:2026-08)', run(dEdit, '2026-08-01', '2026-08-31').events.find((e) => e.sourceKind === 'card')!.occurrenceId === cardOid('c1', 2026, 8));
}

console.log('\n=== 5.5 blocking resolution ===');
{
  const dU = base();
  dU.recurringItems = [incomeItem('wage', 2000, isoT(2026, 8, 25))];
  dU.transactions = [{ id: 'v2', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 25), occurrenceResolution: { version: 2, state: 'linked', occurrenceId: incomeOid('wage', 2026, 8) } as any } as Transaction];
  const rU = run(dU, '2026-08-01', '2026-08-31');
  assert('5.5a. unknown resolution version → typed blocking issue, no included event, not on the timeline', rU.issues.some((i) => i.sourceId === 'wage' && i.code === 'unknown_resolution_version' && i.blocking) && !rU.events.some((e) => e.sourceId === 'wage') && !projectTimelineOccurrences(dU, new Date(2026, 7, 20), 30).some((e) => e.id.includes('wage')));
  const dC = base();
  dC.recurringItems = [incomeItem('wage', 2000, isoT(2026, 8, 25))];
  dC.transactions = [
    { id: 'a', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 25), ...link(incomeOid('wage', 2026, 8)) } as Transaction,
    { id: 'b', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 25), ...link(incomeOid('wage', 2026, 8)) } as Transaction,
  ];
  const rC = run(dC, '2026-08-01', '2026-08-31');
  assert('5.5b. two live links → typed conflict issue, no included event, not on the timeline', rC.issues.some((i) => i.sourceId === 'wage' && i.code === 'conflict' && i.blocking) && !rC.events.some((e) => e.sourceId === 'wage') && !projectTimelineOccurrences(dC, new Date(2026, 7, 20), 30).some((e) => e.id.includes('wage')));
}

console.log('\n=== 5.6 invalid date / amount / unsafe cents ===');
{
  const dDate = base(); dDate.recurringItems = [billItem('rent', 900, 'not-a-date')];
  const rDate = run(dDate, '2026-08-01', '2026-08-31');
  const issue = rDate.issues.find((i) => i.sourceId === 'rent');
  assert('5.6a. an invalid required date → typed blocking issue (code, kind, id, reason, edit destination), no silent omission, no valid event', !!issue && issue.code === 'invalid_date' && issue.sourceKind === 'bill' && issue.blocking && !!issue.editDestination && issue.editDestination.id === 'rent' && !rDate.events.some((e) => e.sourceId === 'rent'));
  assert('5.6a-tl. the invalid-date source is not presented as a valid upcoming timeline fact', !projectTimelineOccurrences(dDate, new Date(2026, 7, 1), 30).some((e) => e.id.includes('rent')));
  const dAmt = base(); dAmt.recurringItems = [billItem('rent', 0, isoT(2026, 8, 3))];
  assert('5.6b. an invalid (zero) commitment amount → blocking invalid_amount, never coerced to zero', run(dAmt, '2026-08-01', '2026-08-31').issues.some((i) => i.sourceId === 'rent' && i.code === 'invalid_amount' && i.blocking));
  const dUnsafe = base(); dUnsafe.recurringItems = [billItem('rent', Number.MAX_SAFE_INTEGER, isoT(2026, 8, 3))];
  assert('5.6c. an unsafe-integer amount fails closed as a blocking issue', run(dUnsafe, '2026-08-01', '2026-08-31').issues.some((i) => i.sourceId === 'rent' && i.code === 'invalid_amount' && i.blocking));
  const dUndated = base(); dUndated.recurringItems = [incomeItem('gig', 500, isoT(2026, 8, 1), { nextDueDateUnknown: true })];
  const rUndated = run(dUndated, '2026-08-01', '2026-08-31');
  assert('5.6d. undated positive income is conservatively excluded with a NON-blocking reason', rUndated.issues.some((i) => i.sourceId === 'gig' && i.code === 'undated_income' && i.blocking === false) && !rUndated.events.some((e) => e.sourceId === 'gig'));
}

console.log('\n=== 5.7 loan subtype coverage ===');
{
  const subtypes: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];
  for (const subtype of subtypes) {
    const data = base();
    data.liabilities = [{ id: `lia-${subtype}`, type: subtype, label: subtype, currentBalance: 10000 } as Liability];
    data.recurringItems = [billItem(`loan-${subtype}`, 1000, isoT(2026, 8, 15), { linkedLiabilityId: `lia-${subtype}` })];
    const r = run(data, '2026-08-01', '2026-08-31');
    const ev = r.events.filter((e) => e.sourceId === `loan-${subtype}`);
    assert(`5.7.${subtype}: canonical loan id, local date 2026-08-15, −$1000, subtype metadata, edit dest, included once`, ev.length === 1 && ev[0].sourceKind === 'loan' && ev[0].occurrenceId === loanOid(`loan-${subtype}`, 2026, 8) && iso(ev[0]) === '2026-08-15' && ev[0].signedCents === -100000 && ev[0].liabilitySubtype === subtype && ev[0].editDestination.kind === 'recurring_item' && ev[0].editDestination.id === `loan-${subtype}`);
  }
}

console.log('\n=== 5.8 boundaries ===');
{
  // due-today unresolved vs satisfied
  const dToday = base(); dToday.recurringItems = [billItem('rent', 900, isoT(2026, 8, 1))];
  assert('5.8a. a due-today unresolved occurrence is included; satisfied is excluded', run(dToday, '2026-08-01', '2026-08-31').events.some((e) => e.sourceId === 'rent' && iso(e) === '2026-08-01') && (() => { const d = { ...dToday, transactions: [{ id: 't', type: 'expense', amount: 900, categoryId: 'c', date: isoT(2026, 8, 1), ...link(billOid('rent', 2026, 8)) } as Transaction] }; return !run(d, '2026-08-01', '2026-08-31').events.some((e) => e.sourceId === 'rent'); })());
  // inclusive end; one day past excluded
  const dEnd = base(); dEnd.recurringItems = [billItem('rent', 900, isoT(2026, 8, 31))];
  assert('5.8b. requested end date inclusive; one day past excluded', run(dEnd, '2026-08-01', '2026-08-31').events.some((e) => e.sourceId === 'rent') && run(dEnd, '2026-08-01', '2026-08-30').events.length === 0);
  // month-end clamp + restore; leap
  const dClamp = base(); dClamp.recurringItems = [billItem('rent', 900, isoT(2027, 1, 31), { scheduleAnchorDay: 31 })];
  const clampDates = run(dClamp, '2027-01-01', '2027-03-31').events.filter((e) => e.sourceId === 'rent').map(iso);
  assert('5.8c. anchor 31 clamps to 28 Feb (non-leap) and restores to 31 Mar', clampDates.includes('2027-02-28') && clampDates.includes('2027-03-31'));
  const dLeap = base(); dLeap.recurringItems = [billItem('rent', 900, isoT(2028, 1, 31), { scheduleAnchorDay: 31 })];
  assert('5.8d. leap year clamps to 29 Feb 2028', run(dLeap, '2028-02-01', '2028-02-29').events.some((e) => iso(e) === '2028-02-29'));
  // AU DST
  const dDstEnd = base(); dDstEnd.recurringItems = [billItem('wk', 20, isoT(2026, 4, 5), { frequency: 'weekly' })];
  assert('5.8e. DST end (5 Apr 2026) event date exact', run(dDstEnd, '2026-04-01', '2026-04-12').events.some((e) => iso(e) === '2026-04-05'));
  const dDstStart = base(); dDstStart.recurringItems = [billItem('wk', 20, isoT(2026, 10, 4), { frequency: 'weekly' })];
  assert('5.8f. DST start (4 Oct 2026) event date exact', run(dDstStart, '2026-10-01', '2026-10-11').events.some((e) => iso(e) === '2026-10-04'));
  // stable same-date ordering: income before bill
  const dSame = base(); dSame.recurringItems = [incomeItem('wage', 2000, isoT(2026, 8, 15)), billItem('rent', 900, isoT(2026, 8, 15))];
  const same = run(dSame, '2026-08-01', '2026-08-31').events.filter((e) => iso(e) === '2026-08-15');
  assert('5.8g. same-date ordering: income before bill (defined type rank)', same.length === 2 && same[0].sourceKind === 'income' && same[1].sourceKind === 'bill');
  // BNPL cap
  const dBnpl = base();
  dBnpl.liabilities = [{ id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 120 } as Liability];
  dBnpl.recurringItems = [billItem('bn', 50, isoT(2026, 8, 10), { frequency: 'fortnightly', linkedLiabilityId: 'bnpl1', isFixed: false })];
  const bnplEvents = run(dBnpl, '2026-08-01', '2026-09-30').events.filter((e) => e.sourceKind === 'bnpl');
  assert('5.8h. BNPL repayments are negative and never exceed the $120 cap', bnplEvents.length >= 1 && bnplEvents.reduce((s, e) => s + Math.abs(e.signedCents), 0) <= 12000 && bnplEvents.every((e) => e.signedCents < 0));
  // no source family enumerated twice: a bnpl-linked item is not ALSO a bill event
  assert('5.8i. a BNPL-linked source is not also enumerated as an ordinary bill', !run(dBnpl, '2026-08-01', '2026-09-30').events.some((e) => e.sourceId === 'bn' && e.sourceKind === 'bill'));
}

console.log('\n=== 4. deterministic ordering under input permutation ===');
{
  const buildData = (order: 'abc' | 'cba'): AppData => {
    const d = base();
    const wage = incomeItem('wage', 2000, isoT(2026, 8, 15));
    const rent = billItem('rent', 900, isoT(2026, 8, 15));
    const gym = billItem('gym', 150, isoT(2026, 8, 15));
    d.recurringItems = order === 'abc' ? [wage, rent, gym] : [gym, rent, wage];
    d.creditCards = [card({ dueDay: 15 })];
    return d;
  };
  const keysA = run(buildData('abc'), '2026-08-01', '2026-08-31').events.map((e) => e.orderingKey);
  const keysB = run(buildData('cba'), '2026-08-01', '2026-08-31').events.map((e) => e.orderingKey);
  assert('4a. events ordering is identical regardless of source array order (deterministic, not array/sort-stability dependent)', JSON.stringify(keysA) === JSON.stringify(keysB));
  assert('4b. ordering key format is date | type-rank | sourceId | occurrenceId', keysA[0].split('|').length === 4 && keysA[0].startsWith('2026-08-15|'));
  // excluded + issues also deterministic
  const p = base(); p.recurringItems = [billItem('z-rent', 900, 'bad'), billItem('a-gym', 0, isoT(2026, 8, 3))];
  const p2 = base(); p2.recurringItems = [billItem('a-gym', 0, isoT(2026, 8, 3)), billItem('z-rent', 900, 'bad')];
  assert('4c. issues ordering is deterministic under permutation', JSON.stringify(run(p, '2026-08-01', '2026-08-31').issues.map((i) => i.sourceId)) === JSON.stringify(run(p2, '2026-08-01', '2026-08-31').issues.map((i) => i.sourceId)));
}

console.log('\n=== 6. What Happens Next reconciliation (independently stated) ===');
{
  const data = base();
  data.assets = [{ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as Asset];
  const today = new Date(2026, 7, 1);
  data.recurringItems = [incomeItem('wage', 2000, isoT(2026, 8, 10)), billItem('rent', 900, isoT(2026, 8, 5))];
  data.creditCards = [card({ dueDay: 20 })];
  const tl = projectTimelineOccurrences(data, today, 30);
  const full = computeMoneyTimeline(data, today, 30);
  // Independently stated golden values for valid legacy/independent data.
  const wage = tl.find((e) => e.id === `income-wage-${new Date(2026, 7, 10).getTime()}`);
  const rent = tl.find((e) => e.id === `bill-rent-${new Date(2026, 7, 5).getTime()}`);
  const cardE = tl.find((e) => e.id === 'card-c1');
  assert('6a. salary +$2000 on 10 Aug (income, daysUntil 9)', !!wage && wage.amount === 2000 && wage.kind === 'income' && wage.daysUntil === 9);
  assert('6b. rent −$900 on 5 Aug (bill, daysUntil 4)', !!rent && rent.amount === -900 && rent.kind === 'bill' && rent.daysUntil === 4);
  assert('6c. card −$200 (credit_card, id card-c1)', !!cardE && cardE.amount === -200 && cardE.kind === 'credit_card');
  assert('6d. money timeline equals the shared occurrence projection (sorted): 4,9,19', JSON.stringify(full) === JSON.stringify([...tl].sort((a, b) => a.daysUntil - b.daysUntil)) && full.map((e) => e.daysUntil).join(',') === '4,9,19');
  // A1-state reconciliation: the timeline agrees with the canonical INCLUDED set.
  const canonical = computeProjectedEvents(data, parseLocalDate('2026-07-31'), parseLocalDate('2026-08-31'), { windowStart: parseLocalDate('2026-07-31') });
  const tlIds = new Set(tl.map((e) => e.id));
  const canonicalOccMatchesTimeline = canonical.events.every((e) => {
    // every included occurrence within the timeline window has a matching timeline row
    return e.presentation.jsDate.getTime() < today.getTime() ? true : tlIds.has(e.presentation.timelineId);
  });
  assert('6e. the timeline rows are exactly the canonical INCLUDED occurrences in-window (no independent eligibility)', canonicalOccMatchesTimeline && tl.every((e) => canonical.events.some((c) => c.presentation.timelineId === e.id)));
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
