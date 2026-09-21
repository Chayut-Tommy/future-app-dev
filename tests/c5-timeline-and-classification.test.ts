// Pass C.5 — pure, real-import proofs. Every date is FROZEN to the local date
// 2026-09-19 (the 19 Sep device recording); nothing reads the execution date.
//   §1 repayment classification: recording-time and display-time authority.
//   §2 the locked financial fixtures, before and after recording two payments.
//   §3 the future-date timeline rail mapper (calendar placement, grouping).
//   §4 one Main-payday eligibility authority for every entry point.
// Run with: npx tsx tests/c5-timeline-and-classification.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { categoryForRepaymentFamily, resolveRecordedTransactionCategoryId, resolveRecurringExpenseCategory, UNCATEGORISED_EXPENSE_ID } from '../src/lib/calculations/billCategory';
import { isEligibleMainPaydaySource, listMainPaydayChoices, mainPaydayChooserSubtitle, mainPaydayIneligibleReason } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../src/lib/calculations/spendingInsights';
import { buildBalancePath, railPosition, resolveRail } from '../src/lib/calculations/balancePath';
import { describeHitTarget, resolveHitTargets } from '../src/lib/calculations/balancePathInteraction';
import {
  confirmBnplRepaymentTransition,
  confirmCreditCardRepaymentTransition,
  confirmLoanRepaymentTransition,
  confirmRecurringOccurrenceTransition,
  reverseLoanRepaymentTransaction,
  syncIncomeAggregate,
} from '../src/state/AppStateContext';
import { daysBetween, localDate, localDateFromDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const L = (y: number, m: number, d: number) => localDate(y, m, d);
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none' } as Transaction);

// FROZEN CLOCK. The goal-allocation helper (pre-existing, out of C.5 scope) reads
// Date.now() for a goal's remaining months, so the fixture pins it: the run date
// can never move the $64.81 goal share.
const FROZEN_NOW = new Date(2026, 8, 19, 15, 46).getTime();
Date.now = () => FROZEN_NOW;
const TODAY = new Date(2026, 8, 19);
const ASOF = L(2026, 9, 19);
const NOW_ISO = new Date(2026, 8, 19, 15, 46).toISOString();

/** The 19 Sep device dataset, BEFORE Internet and Richmond are recorded. */
function deviceData(): AppData {
  const d = base();
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 10700, includeInMoneyCalculations: true } as Asset,
    { id: 'Savings', type: 'savings', label: 'Savings', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly', 'Dividends'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly', 'Gym', { categoryId: 'cat-health' }),
    // Created by the liability flow: linked, and NO purpose of its own.
    item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
    item('internet', 'expense', 50, iso(2026, 9, 19), 'weekly', 'Internet', { categoryId: 'cat-utilities' }),
    item('utilities', 'expense', 250, iso(2026, 10, 1), 'monthly', 'Utilities', { categoryId: 'cat-utilities' }),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: new Date(FROZEN_NOW + 36 * 30 * 86400000).toISOString(), status: 'active' } as unknown as Goal];
  // Already recorded this month: income $7,000, spending $2,450.
  d.transactions = [
    txn('t-sal', 'income', 6000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-oth', 'income', 1000, iso(2026, 9, 14), 'cat-other-income'),
    txn('t-rent', 'expense', 1000, iso(2026, 9, 14), 'cat-rent'),
    txn('t-gym', 'expense', 150, iso(2026, 9, 17), 'cat-health'),
    txn('t-groc', 'expense', 1300, iso(2026, 9, 10), 'cat-groceries'),
  ];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: 0.05 }, mainPaydayIncomeId: 'salary-boq' } as typeof d.user;
  return syncIncomeAggregate(d);
}
function record(data: AppData, id: string, transactionId: string): AppData {
  const it = data.recurringItems.find((r) => r.id === id)!;
  const r = confirmRecurringOccurrenceTransition(data, { recurringItemId: id, expectedNextDueDate: it.nextDueDate, paymentSource: 'everyday', targetAssetId: 'Main', transactionId, date: NOW_ISO });
  if (!r.applied) throw new Error(`record ${id} failed: ${(r as { reason: string }).reason}`);
  return r.data;
}
const afterRecording = () => record(record(deviceData(), 'internet', 'tx-internet'), 'richmond', 'tx-richmond');
const cycleStartOf = (d: AppData) => localDateFromDate(computeSafeToSpend(d, TODAY).cycleStart);
function timeline(d: AppData, target: [number, number, number], asOf = ASOF, withCycleStart = true) {
  const t = L(...target);
  const r = computeLookAheadProjection(d, asOf, t);
  if (!r.available) throw new Error('unavailable');
  const events = computeProjectedEvents(d, asOf, t, { windowStart: asOf }).events;
  return { r, events, path: buildBalancePath(r, events, { cycleStart: withCycleStart ? cycleStartOf(d) : null }) };
}

console.log('=== §1 repayment classification ===');
{
  const before = deviceData();
  const after = afterRecording();
  const rich = after.transactions.find((t) => t.id === 'tx-richmond')!;
  const net = after.transactions.find((t) => t.id === 'tx-internet')!;
  console.log('  richmond txn', JSON.stringify({ categoryId: rich.categoryId, note: rich.note, amount: rich.amount, occ: rich.occurrenceResolution, key: rich.recurringOccurrenceKey, isLoan: rich.isLoanRepayment }));
  assert('ROOT CAUSE reproduced and corrected: the ordinary "due tomorrow" path records a mortgage-linked bill that has NO purpose of its own — it is now PERSISTED as cat-mortgage (was cat-other-expense)', rich.categoryId === 'cat-mortgage' && before.recurringItems.find((r) => r.id === 'richmond')!.categoryId === undefined);
  assert('title stays "Richmond repayment"; exact $3,000.00; canonical loan occurrence identity; schedule advanced exactly one month (20 Sep → 20 Oct)', rich.note === 'Richmond repayment' && Math.round(rich.amount * 100) === 300000 && rich.occurrenceResolution?.state === 'linked' && String((rich.occurrenceResolution as { occurrenceId: string }).occurrenceId) === 'oid1:loan:richmond:2026-09' && toISODate(localDateFromDate(new Date(after.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate))) === '2026-10-20');
  assert('Internet stays Utilities; its weekly schedule advanced 19 → 26 Sep', net.categoryId === 'cat-utilities' && toISODate(localDateFromDate(new Date(after.recurringItems.find((r) => r.id === 'internet')!.nextDueDate))) === '2026-09-26');
  assert('account effects are exact and applied once: Main $10,700 − $50 − $3,000 = $7,650; nothing else moved', Math.round(after.assets.find((a) => a.id === 'Main')!.currentValue * 100) === 765000 && after.assets.find((a) => a.id === 'Savings')!.currentValue === 3500 && after.liabilities[0].currentBalance === 500000);
  assert('display resolver agrees with what was persisted (Transactions, This Month, insights all read it)', resolveRecordedTransactionCategoryId(after, rich) === 'cat-mortgage' && resolveRecordedTransactionCategoryId(after, net) === 'cat-utilities');

  // Families — the recording-time authority, through the existing preset mapping.
  const fam = (type: Liability['type']) => resolveRecurringExpenseCategory({ liabilities: [{ id: 'l', type, label: 'x', currentBalance: 1 } as Liability] }, { linkedLiabilityId: 'l' });
  assert('families: mortgage → cat-mortgage, car loan → cat-transport, personal loan → cat-debt, supported other loan → cat-debt', fam('mortgage') === 'cat-mortgage' && fam('car_loan') === 'cat-transport' && fam('personal_loan') === 'cat-debt' && fam('other') === 'cat-debt');
  assert('card and BNPL keep cat-debt; no category was added to the registry', categoryForRepaymentFamily('credit_card') === 'cat-debt' && categoryForRepaymentFamily('bnpl') === 'cat-debt' && createEmptyAppData().categories.filter((c) => c.type === 'expense').length === 14);
  assert('a linked repayment is classified by its FAMILY, never redirected by a purpose on the bill; an unlinked bill keeps its purpose; a dangling link falls back conservatively', resolveRecurringExpenseCategory({ liabilities: [{ id: 'l', type: 'mortgage', label: 'x', currentBalance: 1 } as Liability] }, { linkedLiabilityId: 'l', categoryId: 'cat-insurance' }) === 'cat-mortgage' && resolveRecurringExpenseCategory({ liabilities: [] }, { categoryId: 'cat-insurance' }) === 'cat-insurance' && resolveRecurringExpenseCategory({ liabilities: [] }, { linkedLiabilityId: 'gone' }) === UNCATEGORISED_EXPENSE_ID);

  // The dedicated loan transition uses the SAME authority.
  for (const [type, expected] of [['mortgage', 'cat-mortgage'], ['car_loan', 'cat-transport'], ['personal_loan', 'cat-debt'], ['other', 'cat-debt']] as [Liability['type'], string][]) {
    const d = deviceData();
    d.liabilities = [{ id: 'richmond-loan', type, label: 'Richmond', currentBalance: 500000 } as Liability];
    const it = d.recurringItems.find((r) => r.id === 'richmond')!;
    const r = confirmLoanRepaymentTransition(d, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: it.nextDueDate, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: false, expectedCurrentBalance: 500000, transactionId: 'tx-loan', date: NOW_ISO } as never);
    const t = r.applied ? r.data.transactions.find((x) => x.id === 'tx-loan') : undefined;
    assert(`loan form, ${type}: recorded as ${expected}, still flagged isLoanRepayment (accounting untouched), funding side reduced once`, !!t && t.categoryId === expected && t.isLoanRepayment === true && r.applied && Math.round(r.data.assets.find((a) => a.id === 'Main')!.currentValue * 100) === 770000);
  }
  {
    const d = deviceData();
    const r = confirmCreditCardRepaymentTransition(d, { creditCardId: 'amex', amount: 50, paymentSource: 'everyday', targetAssetId: 'Main', expectedCardBalance: 800, transactionId: 'tx-card', date: NOW_ISO } as never);
    const t = r.applied ? r.data.transactions.find((x) => x.id === 'tx-card') : undefined;
    assert('credit-card repayment keeps its authoritative semantics: cat-debt + isRepayment, displayed unchanged', !!t && t.categoryId === categoryForRepaymentFamily('credit_card') && t.categoryId === 'cat-debt' && t.isRepayment === true && resolveRecordedTransactionCategoryId(r.applied ? r.data : d, t) === 'cat-debt');
  }
  {
    const d = deviceData();
    d.liabilities = [...d.liabilities, { id: 'zip', type: 'bnpl', label: 'Zip', currentBalance: 300 } as Liability];
    d.recurringItems = [...d.recurringItems, item('zip-pay', 'expense', 75, iso(2026, 9, 19), 'fortnightly', 'Zip', { linkedLiabilityId: 'zip', isFixed: false })];
    const r = confirmBnplRepaymentTransition(d, { recurringItemId: 'zip-pay', liabilityId: 'zip', expectedNextDueDate: iso(2026, 9, 19), paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 'tx-bnpl', date: NOW_ISO } as never);
    const t = r.applied ? r.data.transactions.find((x) => x.id === 'tx-bnpl') : undefined;
    if (!r.applied) console.log('  bnpl rejected:', (r as { reason: string }).reason);
    assert('BNPL repayment is applied and keeps cat-debt — never reclassified by this pass', r.applied && !!t && t.categoryId === categoryForRepaymentFamily('bnpl') && t.categoryId === 'cat-debt' && resolveRecordedTransactionCategoryId(r.data, t) === 'cat-debt');
  }

  // Legacy records: corrected only on proof; otherwise conservative.
  const legacy: Transaction = { ...rich, id: 'legacy', categoryId: UNCATEGORISED_EXPENSE_ID };
  assert('an EXISTING record persisted as Other is shown as Mortgage — proof: its own persisted canonical loan identity + the still-present structured link', resolveRecordedTransactionCategoryId(after, legacy) === 'cat-mortgage' && legacy.categoryId === UNCATEGORISED_EXPENSE_ID);
  const manual: Transaction = txn('manual', 'expense', 3000, NOW_ISO, UNCATEGORISED_EXPENSE_ID);
  const lookalike: Transaction = { ...manual, id: 'lookalike', note: 'Richmond repayment' };
  assert('a manual Other expense stays Other — even one with the same name, amount and date as the repayment', resolveRecordedTransactionCategoryId(after, manual) === UNCATEGORISED_EXPENSE_ID && resolveRecordedTransactionCategoryId(after, lookalike) === UNCATEGORISED_EXPENSE_ID);
  assert('ambiguous legacy stays conservative: no occurrence identity → Other; identity for a different source → Other', resolveRecordedTransactionCategoryId(after, { ...legacy, occurrenceResolution: undefined }) === UNCATEGORISED_EXPENSE_ID && resolveRecordedTransactionCategoryId(after, { ...legacy, recurringItemId: 'gym' }) === UNCATEGORISED_EXPENSE_ID);
  const sourceDeleted: AppData = { ...after, recurringItems: after.recurringItems.filter((r) => r.id !== 'richmond') };
  const liabilityDeleted: AppData = { ...after, liabilities: [] };
  // Pass C.5.1 — a legacy record still PROVES 'loan repayment' through its persisted identity, so with its family gone it shows the conservative Debt repayments category.
  assert('deleting the linked source or liability never invents a classification: a new record keeps its persisted Mortgage; a legacy record falls back to conservative Debt repayments (never Other, Rent or a guessed family)', resolveRecordedTransactionCategoryId(sourceDeleted, rich) === 'cat-mortgage' && resolveRecordedTransactionCategoryId(liabilityDeleted, rich) === 'cat-mortgage' && resolveRecordedTransactionCategoryId(sourceDeleted, legacy) === 'cat-debt' && resolveRecordedTransactionCategoryId(liabilityDeleted, legacy) === 'cat-debt');
  const renamed: AppData = { ...after, recurringItems: after.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, label: 'Home loan', amount: 3100 } : r)) };
  assert('editing the linked source (name, amount) changes nothing about the recorded transaction', resolveRecordedTransactionCategoryId(renamed, rich) === 'cat-mortgage' && renamed.transactions.find((t) => t.id === 'tx-richmond')!.note === 'Richmond repayment');
  const restarted: AppData = JSON.parse(JSON.stringify(after));
  assert('restart (JSON round-trip) preserves the persisted classification and identity', restarted.transactions.find((t) => t.id === 'tx-richmond')!.categoryId === 'cat-mortgage' && resolveRecordedTransactionCategoryId(restarted, restarted.transactions.find((t) => t.id === 'tx-richmond')!) === 'cat-mortgage');

  // Aggregation agrees with display.
  const insights = computeSpendingInsights(after).map((i) => `${i.title} ${i.body}`).join(' | ');
  console.log('  insights:', insights);
  assert('category aggregation uses the same shared category: the largest category is Mortgage ($3,000), never "Other"', /Mortgage/.test(insights) && !/Other is your largest/.test(insights));

  // Delete / reversal and re-record.
  const rev = reverseLoanRepaymentTransaction(after, 'tx-richmond');
  console.log('  reversal applied:', rev.applied, rev.applied ? '' : (rev as { reason: string }).reason);
  if (rev.applied) {
    const back = rev.data;
    assert('deleting the repayment restores BOTH sides: Main back to $10,650, the 20 Sep occurrence is due again, the liability untouched, the transaction gone', Math.round(back.assets.find((a) => a.id === 'Main')!.currentValue * 100) === 1065000 && toISODate(localDateFromDate(new Date(back.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate))) === '2026-09-20' && back.liabilities[0].currentBalance === 500000 && !back.transactions.some((t) => t.id === 'tx-richmond'));
    const again = record(back, 'richmond', 'tx-richmond-2');
    const t2 = again.transactions.find((t) => t.id === 'tx-richmond-2')!;
    assert('re-recording persists Mortgage, reuses the SAME occurrence identity, and leaves exactly one transaction for it', t2.categoryId === 'cat-mortgage' && String((t2.occurrenceResolution as { occurrenceId: string }).occurrenceId) === 'oid1:loan:richmond:2026-09' && again.transactions.filter((t) => t.recurringOccurrenceKey === t2.recurringOccurrenceKey).length === 1 && Math.round(again.assets.find((a) => a.id === 'Main')!.currentValue * 100) === 765000);
    const dup = confirmRecurringOccurrenceTransition(again, { recurringItemId: 'richmond', expectedNextDueDate: iso(2026, 9, 20), paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 'tx-dup', date: NOW_ISO });
    assert('a stale second confirmation of the same occurrence is rejected (no duplicate)', dup.applied === false);
  } else {
    assert('deleting the repayment restores both sides', false);
  }
}

console.log('\n=== §2 locked financial fixtures (local date 2026-09-19) ===');
{
  const before = deviceData();
  const sB = computeSafeToSpend(before, TODAY);
  const exB = buildAupExplanation(sB);
  const row = (ex: typeof exB, k: string) => ex.rows.find((r) => r.key === k)?.cents;
  assert('BEFORE — AUP: $10,700.00 − $4,050.00 − $64.81 − $373.33 − $0.01 = $6,211.85; $3,106 a day for 2 days', row(exB, 'balances') === 1070000 && row(exB, 'bills') === -405000 && row(exB, 'goals') === -6481 && row(exB, 'savings') === -37333 && row(exB, 'rounding') === -1 && exB.remainderCents === 621185 && Math.round(sB.dailyAllowance) === 3106 && sB.daysRemaining === 2);
  const b30 = timeline(before, [2026, 9, 30]);
  assert('BEFORE — 30 Sep: $10,700 + $9,000 − $2,250 − $50 − $3,000 = $14,400; lowest $8,650 on 20 Sep', b30.r.breakdown.openingCents === 1070000 && b30.r.breakdown.assumedIncomeCents === 900000 && b30.r.breakdown.billsCents === -225000 && b30.r.breakdown.cardCents === -5000 && b30.r.breakdown.mortgageCents === -300000 && b30.r.targetCents === 1440000 && b30.r.lowest.cents === 865000 && toISODate(b30.r.lowest.date) === '2026-09-20');

  const after = afterRecording();
  const sA = computeSafeToSpend(after, TODAY);
  const exA = buildAupExplanation(sA);
  assert('AFTER — included opening money $7,650.00; AUP still $6,211.85; $3,106 a day for 2 days', row(exA, 'balances') === 765000 && exA.remainderCents === 621185 && Math.round(sA.dailyAllowance) === 3106 && sA.daysRemaining === 2);
  const month = computeThisMonthRecordedSummary(after, TODAY);
  assert('AFTER — This Month: income $7,000.00, spending $5,500.00, net $1,500.00', month.incomeCents === 700000 && month.spendingCents === 550000 && month.netCents === 150000);
  const a30 = timeline(after, [2026, 9, 30]);
  const g30 = computeDailyGuide(after, ASOF, L(2026, 9, 30), a30.r);
  assert('AFTER — 30 Sep still $14,400.00; daily guide $1,040 for 11 days; lowest $7,650 on 19 Sep; future mortgage deduction through 30 Sep = $0', a30.r.targetCents === 1440000 && g30.displayCents === 104000 && g30.allocationDays === 11 && a30.r.lowest.cents === 765000 && toISODate(a30.r.lowest.date) === '2026-09-19' && a30.r.breakdown.mortgageCents === 0);
  assert('the recorded payments reduced opening money ONCE and removed their projected occurrences ONCE', a30.r.breakdown.openingCents === 765000 && !a30.events.some((e) => e.sourceId === 'richmond') && !a30.events.some((e) => e.sourceId === 'internet' && toISODate(e.date) === '2026-09-19') && a30.events.filter((e) => e.sourceId === 'internet').map((e) => toISODate(e.date)).join() === '2026-09-26');
  // The visual replacement changes no result: the mapper returns the engine's own values.
  for (const [d, t] of [[before, b30], [after, a30]] as const) {
    assert('headline, every checkpoint, lowest and shortfall are passed through bit-for-bit', t.path.targetCents === t.r.targetCents && JSON.stringify(t.path.points.map((p) => p.cents)) === JSON.stringify(t.r.checkpoints.map((c) => c.endOfDayCents)) && JSON.stringify(t.path.lowest) === JSON.stringify(t.r.lowest) && t.path.firstShortfall === t.r.firstShortfall && d.assets.length === 2);
  }
  // With and without the rail's cycle start the finances are identical.
  const noStart = timeline(before, [2026, 9, 30], ASOF, false);
  assert('the rail start changes positions only — never a financial value', noStart.path.targetCents === b30.path.targetCents && JSON.stringify(noStart.path.markers.map((m) => [m.key, m.netCents, m.positionCents])) === JSON.stringify(b30.path.markers.map((m) => [m.key, m.netCents, m.positionCents])) && noStart.path.rail.startIsCycleStart === false && b30.path.rail.startIsCycleStart === true);
}

console.log('\n=== §3 future-date timeline rail ===');
{
  const d = deviceData();
  assert('authoritative cycle start comes from AUP (21 Sep payday − 14 days = 7 Sep)', toISODate(cycleStartOf(d)) === '2026-09-07');
  const t30 = timeline(d, [2026, 9, 30]).path;
  assert('30 Sep: "Timeline to 30 Sep"; rail 7 Sep → 30 Sep (23 days); Today at 12/23; deep blue ends at Today', t30.title === 'Timeline to 30 Sep' && toISODate(t30.rail.startDate) === '2026-09-07' && toISODate(t30.rail.endDate) === '2026-09-30' && t30.rail.spanDays === 23 && Math.abs(t30.rail.todayX - 12 / 23) < 1e-12 && t30.rail.startIsCycleStart);
  assert('marker placement is local-calendar day distance from the rail start: 19 Sep (today) sits AT todayX; 30 Sep (inclusive target) sits at 1', Math.abs(t30.markers.find((m) => m.key === '2026-09-19')!.x - t30.rail.todayX) < 1e-12 && t30.markers.find((m) => m.key === '2026-09-30')!.x === 1 && t30.markers.every((m) => Math.abs(m.x - daysBetween(t30.rail.startDate, m.startDate) / 23) < 1e-12));
  assert('no marker is ever placed in the elapsed segment (no inferred history)', t30.markers.every((m) => m.x >= t30.rail.todayX - 1e-12));
  const m30 = t30.markers.find((m) => m.key === '2026-09-30')!;
  assert('target-date events appear exactly once: Rental income +$3,000 and the AMEX repayment -$50; end-of-day = the $14,400 estimate', m30.events.length === 2 && m30.incomeCents === 300000 && m30.outgoingCents === -5000 && m30.positionCents === 1440000);
  const m20 = t30.markers.find((m) => m.key === '2026-09-20')!;
  assert('same-date mixed group keeps both kinds, exact totals, same-day net and ONE end-of-day balance ($8,650)', m20.kinds.join() === 'income,outgoing' && m20.incomeCents === 100000 && m20.outgoingCents === -300000 && m20.netCents === -200000 && m20.positionCents === 865000);

  const tomorrow = timeline(d, [2026, 9, 20]).path;
  assert('target tomorrow: 1 day away; rail 7 → 20 Sep; two groups (today, tomorrow)', tomorrow.horizonDays === 1 && tomorrow.rail.spanDays === 13 && tomorrow.markers.map((m) => m.key).join() === '2026-09-19,2026-09-20' && tomorrow.markers[1].x === 1);
  const payday = timeline(d, [2026, 9, 21]).path;
  assert('target = exact next payday: still titled "Timeline to 21 Sep" (never "Pay cycle progress"); the payday income is an assumed-income marker at x = 1', payday.title === 'Timeline to 21 Sep' && payday.markers[payday.markers.length - 1].key === '2026-09-21' && payday.markers[payday.markers.length - 1].incomeCents === 400000 && payday.markers[payday.markers.length - 1].x === 1);
  const oct30 = timeline(d, [2026, 10, 30]).path;
  assert('30 Oct across several paydays: 41 days → weekly groups, "Events grouped by week"; rail 7 Sep → 30 Oct (53 days); Today at 12/53', oct30.horizonDays === 41 && oct30.density === 'weekly' && oct30.disclosure === 'Events grouped by week' && oct30.rail.spanDays === 53 && Math.abs(oct30.rail.todayX - 12 / 53) < 1e-12 && oct30.title === 'Timeline to 30 Oct');
  const allIds = oct30.markers.flatMap((m) => m.events.map((e) => e.occurrenceId));
  const canon = timeline(d, [2026, 10, 30]).events.filter((e) => e.inclusion === 'included' && e.signedCents !== 0);
  assert('weekly grouping preserves every canonical occurrence exactly once, with exact-cent totals and monotonic positions', allIds.length === canon.length && new Set(allIds).size === allIds.length && oct30.markers.every((m) => m.netCents === m.events.reduce((n, e) => n + e.signedCents, 0)) && oct30.markers.every((m, i, a) => i === 0 || m.x > a[i - 1].x));
  const t35 = timeline(d, [2026, 10, 24]).path, t36 = timeline(d, [2026, 10, 25]).path;
  assert('honest 35 / 36-day transition: 35 days exact, 36 days weekly', t35.horizonDays === 35 && t35.density === 'exact' && t36.horizonDays === 36 && t36.density === 'weekly');
  const t90 = timeline(d, [2026, 12, 18]).path;
  assert('maximum 90-day target: weekly, 14 groups at most, all positions finite within [todayX, 1]', t90.horizonDays === 90 && t90.density === 'weekly' && t90.markers.length <= 14 && t90.markers.every((m) => Number.isFinite(m.x) && m.x >= t90.rail.todayX - 1e-12 && m.x <= 1));

  // Collision clustering on a phone-width rail (cycle-start rail compresses the future).
  const targets = resolveHitTargets(t30, 286);
  console.log('  phone targets 30 Sep:', targets.map((t) => t.key).join(' | '));
  assert('collision clustering: ≥ 44pt, non-overlapping, chronological, every group in exactly one target', targets.every((t) => t.width >= 44 - 1e-9) && targets.every((t, i) => i === 0 || t.left >= targets[i - 1].left + targets[i - 1].width - 1e-9) && targets.flatMap((t) => t.groups.map((g) => g.key)).join() === t30.markers.map((m) => m.key).join());
  const withToday = targets.find((t) => t.groups.some((g) => g.key === '2026-09-20'))!;
  const insp = describeHitTarget(withToday, t30);
  assert('a collision target discloses its date range and count and keeps a section per date with its own end-of-day balance', /^\d+ Sep – \d+ Sep · \d+ scheduled events$/.test(insp.title) && insp.sections.some((s) => s.balanceLine === 'End-of-day balance: $8,650') && insp.sections.every((s) => /^End-of-day balance: /.test(s.balanceLine)));

  // Paid occurrence removal and the next recurrence.
  const after = afterRecording();
  const a30 = timeline(after, [2026, 9, 30]).path;
  assert('a paid occurrence disappears exactly once: no 19 Sep Internet, no 20 Sep Richmond; 20 Sep keeps only Dividends; 26 Sep Internet (next recurrence) remains', !a30.markers.some((m) => m.key === '2026-09-19') && a30.markers.find((m) => m.key === '2026-09-20')!.events.map((e) => e.sourceId).join() === 'dividends' && a30.markers.find((m) => m.key === '2026-09-26')!.events.some((e) => e.sourceId === 'internet'));
  const aOct = timeline(after, [2026, 10, 30]);
  assert('the NEXT Richmond recurrence (20 Oct) appears exactly once inside a later target', aOct.events.filter((e) => e.sourceId === 'richmond').map((e) => toISODate(e.date)).join() === '2026-10-20' && aOct.path.markers.flatMap((m) => m.events).filter((e) => e.sourceId === 'richmond').length === 1);

  // No-event horizon, shortfall, recovered ending.
  const empty = base(); empty.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 500, includeInMoneyCalculations: true } as Asset];
  const e = timeline(syncIncomeAggregate(empty), [2026, 9, 30], ASOF, false).path;
  assert('no-event horizon: no markers, rail starts at today (no known payday), summary says so', e.markers.length === 0 && e.rail.todayX === 0 && !e.rail.startIsCycleStart && /^Timeline from today, 19 Sep, to your selected date, 30 Sep, 11 days away\. 0 assumed income payments and 0 bills or repayments are scheduled\./.test(e.summary));
  const neg = base(); neg.assets = empty.assets;
  neg.recurringItems = [item('rent', 'expense', 1200, iso(2026, 9, 22), 'monthly', 'Rent'), item('pay', 'income', 3000, iso(2026, 9, 28), 'monthly', 'Pay')];
  neg.user = { ...neg.user, mainPaydayIncomeId: 'pay' } as typeof neg.user;
  const n = timeline(syncIncomeAggregate(neg), [2026, 9, 30]);
  assert('recovered ending after an earlier shortfall: first shortfall $700 on 22 Sep is retained on its group and in the summary; the target is positive ($2,300)', n.r.firstShortfall !== null && n.r.firstShortfall!.shortfallCents === 70000 && n.path.markers.find((m) => m.key === '2026-09-22')!.hasShortfall && /Possible shortfall of \$700 on 22 Sep\.$/.test(n.path.summary) && n.path.targetCents === 230000 && n.r.recovers === true);
  const n2 = timeline(syncIncomeAggregate(neg), [2026, 9, 25]);
  assert('negative target: the estimate is −$700 and the lowest position is retained', n2.path.targetCents === -70000 && n2.path.lowest.cents === -70000);

  // Leap year and the Australian DST boundary.
  const leap = base(); leap.assets = empty.assets;
  leap.recurringItems = [item('pay', 'income', 1000, iso(2028, 3, 3), 'fortnightly', 'Pay'), item('bill', 'expense', 100, iso(2028, 2, 29), 'monthly', 'Bill')];
  leap.user = { ...leap.user, mainPaydayIncomeId: 'pay' } as typeof leap.user;
  const lr = computeLookAheadProjection(syncIncomeAggregate(leap), L(2028, 2, 27), L(2028, 3, 2));
  if (!lr.available) throw new Error('leap unavailable');
  const lp = buildBalancePath(lr, computeProjectedEvents(syncIncomeAggregate(leap), L(2028, 2, 27), L(2028, 3, 2), { windowStart: L(2028, 2, 27) }).events, { cycleStart: L(2028, 2, 18) });
  assert('leap year: 27 Feb → 2 Mar 2028 is 4 days; the 29 Feb bill sits 11/13 along an 18 Feb → 2 Mar rail', lp.horizonDays === 4 && lp.rail.spanDays === 13 && Math.abs(lp.markers.find((m) => m.key === '2028-02-29')!.x - 11 / 13) < 1e-12);
  const dst = resolveRail(L(2026, 10, 3), L(2026, 10, 6), L(2026, 9, 28)); // AEDT begins 4 Oct 2026
  assert('Australian DST boundary (4 Oct 2026): day distances stay integers — 28 Sep → 6 Oct is 8 days, 3 Oct sits at 5/8, 4 Oct at 6/8', dst.spanDays === 8 && dst.todayX === 5 / 8 && railPosition(dst, L(2026, 10, 4)) === 6 / 8 && railPosition(dst, L(2026, 10, 5)) === 7 / 8);
  assert('a cycle start after today (or absent) is never used: the rail starts at today', resolveRail(ASOF, L(2026, 9, 30), L(2026, 9, 25)).todayX === 0 && !resolveRail(ASOF, L(2026, 9, 30), null).startIsCycleStart);
  console.log(`  placement signature (must be identical under UTC and Australia/Melbourne): ${t30.markers.map((m) => `${m.key}@${m.x.toFixed(6)}`).join(' ')}`);
  assert('placement signature for 30 Sep is the fixed local-date value', t30.markers.map((m) => `${m.key}@${m.x.toFixed(6)}`).join(' ') === '2026-09-19@0.521739 2026-09-20@0.565217 2026-09-21@0.608696 2026-09-24@0.739130 2026-09-26@0.826087 2026-09-27@0.869565 2026-09-28@0.913043 2026-09-30@1.000000');
}

console.log('\n=== §4 one Main-payday eligibility authority ===');
{
  const items = [
    item('salary', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('gig', 'income', 500, iso(2026, 9, 22), 'irregular', 'Gig work', { nextDueDateUnknown: true }),
    item('old', 'income', 100, iso(2026, 9, 22), 'weekly', 'Old job', { active: false }),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent'),
  ];
  const c = listMainPaydayChoices(items);
  assert('both choosers list exactly the sources the editor would accept', c.eligible.map((r) => r.id).join() === 'salary,rental' && c.eligible.every((r) => isEligibleMainPaydaySource(r)) && c.ineligible.map((i) => i.item.id).join() === 'gig');
  assert('the excluded source carries the SAME reason text the editor shows', c.ineligible[0].reason === mainPaydayIneligibleReason(items[2]) && /Irregular income/.test(c.ineligible[0].reason));
  assert('chooser subtitle names what cannot be chosen and why', mainPaydayChooserSubtitle(items) === "Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead. Gig work can’t be chosen: a main payday needs a regular schedule and a next expected payment date." && mainPaydayChooserSubtitle(items.slice(0, 2)) === "Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead."); // C.5.2 — one copy authority
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
