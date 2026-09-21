// Pass C.5.1 — pure, real-import proofs. The clock is FROZEN to the local date
// 2026-09-20 (the 20 Sep device recording); Date.now is pinned because the
// pre-existing goal-allocation helper reads it.
//   §1 "largest category": the device's Rent-vs-Mortgage line was an exact-cent TIE.
//   §2 semantic classification: families, genuine Rent / Other / Utilities, legacy.
//   §3 the locked 20 Sep fixtures, before and after confirming Dividends.
//   §4 main-payday copy and the daily-guide effect it describes.
//   §5 the repayment TRANSITIONS as accepted. The founder chose Option A (C.5.2):
//      the 2D-NARROW contract stands and loan reminders are routed to the loan
//      form, so the ordinary one-sided transition below now describes only the
//      HISTORICAL record shape. Entry-point parity itself is proven in
//      tests/c52-loan-repayment-parity.test.ts.
// Run with: npx tsx tests/c51-classification-integrity.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { resolveLeadingCategoryIds, resolveRecordedTransactionCategoryId, resolveRecurringExpenseCategory } from '../src/lib/calculations/billCategory';
import { MAIN_PAYDAY_EFFECT_COPY } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../src/lib/calculations/spendingInsights';
import { pickWorthKnowingInsight } from '../src/lib/calculations/worthKnowing';
import {
  confirmLoanRepaymentTransition,
  confirmRecurringOccurrenceTransition,
  reverseLoanRepaymentTransaction,
  syncIncomeAggregate,
} from '../src/state/AppStateContext';
import { localDate, localDateFromDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const FROZEN_NOW = new Date(2026, 8, 20, 16, 17).getTime();
Date.now = () => FROZEN_NOW;
const TODAY = new Date(2026, 8, 20);
const ASOF = localDate(2026, 9, 20);
const NOW_ISO = new Date(FROZEN_NOW).toISOString();
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const L = (y: number, m: number, d: number) => localDate(y, m, d);
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none', ...extra } as Transaction);
const insightText = (d: AppData) => computeSpendingInsights(d).map((i) => `${i.title} · ${i.body}`);
const largest = (d: AppData) => insightText(d).find((s) => /largest categor|are tied/.test(s)) ?? '(none)';

/** The 20 Sep device state: Internet and Richmond were recorded on 19 Sep. */
function deviceData(main: string = 'salary-boq'): AppData {
  const d = base();
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 7650, includeInMoneyCalculations: true } as Asset,
    { id: 'Savings', type: 'savings', label: 'Savings', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly', 'Dividends'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly', 'Gym', { categoryId: 'cat-health' }),
    item('richmond', 'expense', 3000, iso(2026, 10, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
    item('internet', 'expense', 50, iso(2026, 9, 26), 'weekly', 'Internet', { categoryId: 'cat-utilities' }),
    item('utilities', 'expense', 250, iso(2026, 10, 1), 'monthly', 'Utilities', { categoryId: 'cat-utilities' }),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: new Date(FROZEN_NOW + 36 * 30 * 86400000).toISOString(), status: 'active' } as unknown as Goal];
  // Recorded history as the device shows it: three $1,000 Monday rents inside the last
  // 30 days, gym, and the 19 Sep Internet + Richmond confirmations (ordinary reminder path).
  d.transactions = [
    txn('t-sal', 'income', 6000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-oth', 'income', 1000, iso(2026, 9, 14), 'cat-other-income'),
    txn('t-rent-0', 'expense', 1000, iso(2026, 8, 31), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-1', 'expense', 1000, iso(2026, 9, 7), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-2', 'expense', 1000, iso(2026, 9, 14), 'cat-rent', { note: 'Rent' }),
    txn('t-gym-1', 'expense', 150, iso(2026, 9, 3), 'cat-health'),
    txn('t-gym-2', 'expense', 150, iso(2026, 9, 10), 'cat-health'),
    txn('t-gym-3', 'expense', 150, iso(2026, 9, 17), 'cat-health'),
    txn('tx-internet', 'expense', 50, iso(2026, 9, 19), 'cat-utilities', { note: 'Internet', recurringItemId: 'internet' }),
    txn('tx-richmond', 'expense', 3000, iso(2026, 9, 19), 'cat-mortgage', { note: 'Richmond repayment', recurringItemId: 'richmond', recurringOccurrenceKey: `richmond:${iso(2026, 9, 20)}`, occurrenceResolution: { version: 1, state: 'linked', occurrenceId: 'oid1:loan:richmond:2026-09' } as never }),
  ];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: 0.05 }, mainPaydayIncomeId: main } as typeof d.user;
  return syncIncomeAggregate(d);
}
function look(d: AppData, target: [number, number, number]) {
  const t = L(...target);
  const r = computeLookAheadProjection(d, ASOF, t);
  if (!r.available) throw new Error('unavailable');
  return { r, guide: computeDailyGuide(d, ASOF, t, r), events: computeProjectedEvents(d, ASOF, t, { windowStart: ASOF }).events };
}

console.log('=== §1 largest category: the device line was an exact-cent tie ===');
{
  const d = deviceData();
  console.log('  device insight :', largest(d));
  assert('ROOT CAUSE reproduced: Rent (3 × $1,000) and Mortgage (1 × $3,000) are tied to the cent in the last 30 days', (() => { const m = new Map<string, number>(); for (const t of d.transactions) if (t.type === 'expense' && new Date(t.date).getTime() >= FROZEN_NOW - 30 * 86400000) { const id = resolveRecordedTransactionCategoryId(d, t); m.set(id, (m.get(id) ?? 0) + Math.round(t.amount * 100)); } return m.get('cat-rent') === 300000 && m.get('cat-mortgage') === 300000; })());
  assert('a tie is worded as a tie — never "Rent is your largest category" beside a $3,000 Mortgage row', largest(d) === 'Rent and Mortgage are tied · $3,000 each over 30 days.' /* C.5.2 wording + shared formatter */);
  const moreMortgage: AppData = { ...d, transactions: d.transactions.map((t) => (t.id === 'tx-richmond' ? { ...t, amount: 3000.01 } : t)) };
  assert('one cent more on the mortgage → "Mortgage is your largest category" (exact integer cents decide, never float order)', largest(moreMortgage) === 'Mortgage is your largest category · $3,000.01 in the last 30 days.');
  const moreRent: AppData = { ...d, transactions: [...d.transactions, txn('t-rent-x', 'expense', 0.01, iso(2026, 9, 15), 'cat-rent')] };
  assert('one cent more on genuine rent → "Rent is your largest category" — genuine Rent stays Rent', /^Rent is your largest category · /.test(largest(moreRent)));
  const noMortgage: AppData = { ...d, transactions: d.transactions.filter((t) => t.id !== 'tx-richmond') };
  assert('with no mortgage recorded, Rent alone leads and is named Rent', largest(noMortgage) === 'Rent is your largest category · $3,000 in the last 30 days.');
  // The pure rule.
  const cats = d.categories;
  assert('shared rule: every category at the exact-cent maximum, in registry order; empty and zero totals yield nothing', resolveLeadingCategoryIds(new Map([['cat-mortgage', 300000], ['cat-rent', 300000], ['cat-health', 45000]]), cats).join() === 'cat-rent,cat-mortgage' && resolveLeadingCategoryIds(new Map([['cat-mortgage', 300001], ['cat-rent', 300000]]), cats).join() === 'cat-mortgage' && resolveLeadingCategoryIds(new Map(), cats).length === 0 && resolveLeadingCategoryIds(new Map([['cat-rent', 0]]), cats).length === 0);
  assert('shared rule is independent of Map insertion order (the old Money behaviour) and of category-id order (the old Worth Knowing behaviour)', resolveLeadingCategoryIds(new Map([['cat-rent', 5], ['cat-mortgage', 5]]), cats).join() === resolveLeadingCategoryIds(new Map([['cat-mortgage', 5], ['cat-rent', 5]]), cats).join());
  // Worth Knowing reads the same rule: a tie names nobody; a true leader is named correctly.
  const sts = computeSafeToSpend(d, TODAY);
  const wk = (x: AppData) => pickWorthKnowingInsight(x, TODAY, [], computeSafeToSpend(x, TODAY), { shownEventKeys: new Set(), reminderKey: null });
  const wkTie = wk(d);
  assert('Worth Knowing: a tied month never claims one "largest recorded spending category"', !(wkTie && wkTie.type === 'spending_category_concentration'));
  const rentLeads: AppData = { ...d, transactions: d.transactions.filter((t) => t.id !== 't-rent-0').concat([txn('t-rent-3', 'expense', 1500, iso(2026, 9, 1), 'cat-rent'), txn('t-rent-4', 'expense', 1500, iso(2026, 9, 2), 'cat-rent')]) };
  const wkRent = wk(rentLeads);
  console.log('  worth knowing  :', wkRent?.title);
  assert('Worth Knowing: when genuine Rent truly leads the month it is named Rent; Mortgage is never folded into it', !!wkRent && (wkRent.type !== 'spending_category_concentration' || wkRent.title === 'Rent is your largest recorded spending category'));
  const month = computeThisMonthRecordedSummary(d, TODAY);
  assert('presentation only — This Month totals are untouched: income $7,000.00, spending $5,500.00, net $1,500.00', month.incomeCents === 700000 && month.spendingCents === 550000 && month.netCents === 150000 && sts.hasKnownPayday);
}

console.log('\n=== §2 semantic classification ===');
{
  const d = deviceData();
  const t = (id: string) => d.transactions.find((x) => x.id === id)!;
  assert('Mortgage row → Mortgage; Internet → Utilities; genuine Rent → Rent', resolveRecordedTransactionCategoryId(d, t('tx-richmond')) === 'cat-mortgage' && resolveRecordedTransactionCategoryId(d, t('tx-internet')) === 'cat-utilities' && resolveRecordedTransactionCategoryId(d, t('t-rent-1')) === 'cat-rent');
  const manualOther = txn('m', 'expense', 3000, iso(2026, 9, 19), 'cat-other-expense', { note: 'Richmond repayment' });
  assert('a genuine manual Other stays Other even with the repayment\'s name, amount and date', resolveRecordedTransactionCategoryId(d, manualOther) === 'cat-other-expense');
  const fam = (type: Liability['type']) => resolveRecurringExpenseCategory({ liabilities: [{ id: 'l', type, label: 'x', currentBalance: 1 } as Liability] }, { linkedLiabilityId: 'l' });
  assert('families: mortgage → Mortgage, car loan → Transport, personal loan and supported other loan → Debt repayments; none is ever Rent', fam('mortgage') === 'cat-mortgage' && fam('car_loan') === 'cat-transport' && fam('personal_loan') === 'cat-debt' && fam('other') === 'cat-debt');
  // Legacy shapes.
  const legacy: Transaction = { ...t('tx-richmond'), id: 'legacy', categoryId: 'cat-other-expense' };
  const gone: AppData = { ...d, recurringItems: d.recurringItems.filter((r) => r.id !== 'richmond') };
  const noLiability: AppData = { ...d, liabilities: [] };
  assert('legacy record, link intact: persisted loan identity + structured link → Mortgage', resolveRecordedTransactionCategoryId(d, legacy) === 'cat-mortgage');
  assert('legacy record, source or liability deleted: identity still proves "loan repayment" but not the family → conservative Debt repayments (never Other, never Rent)', resolveRecordedTransactionCategoryId(gone, legacy) === 'cat-debt' && resolveRecordedTransactionCategoryId(noLiability, legacy) === 'cat-debt');
  assert('a NEW record keeps its persisted Mortgage after its source, or its liability, is deleted or renamed (immutable label)', resolveRecordedTransactionCategoryId(gone, t('tx-richmond')) === 'cat-mortgage' && resolveRecordedTransactionCategoryId(noLiability, t('tx-richmond')) === 'cat-mortgage' && resolveRecordedTransactionCategoryId({ ...d, liabilities: [{ ...d.liabilities[0], type: 'personal_loan' }] }, t('tx-richmond')) === 'cat-mortgage');
  assert('unresolved legacy (no occurrence identity, or an identity for another source) stays generic Other', resolveRecordedTransactionCategoryId(d, { ...legacy, occurrenceResolution: undefined }) === 'cat-other-expense' && resolveRecordedTransactionCategoryId(d, { ...legacy, recurringItemId: 'gym' }) === 'cat-other-expense');
  assert('card and BNPL semantics untouched: a flagged card repayment and a Debt-repayments record display exactly as persisted', resolveRecordedTransactionCategoryId(d, txn('c', 'expense', 50, NOW_ISO, 'cat-debt', { isRepayment: true })) === 'cat-debt');
}

console.log('\n=== §3 locked 20 Sep fixtures ===');
{
  const d = deviceData();
  const s = computeSafeToSpend(d, TODAY);
  const ex = buildAupExplanation(s);
  const row = (k: string) => ex.rows.find((r) => r.key === k)?.cents;
  console.log('  AUP rows:', ex.rows.map((r) => `${r.key}=${r.cents}`).join(' '), '→', ex.remainderCents, '| daily', s.dailyAllowance, 'days', s.daysRemaining);
  assert('initial — included money $7,650.00; AUP $6,211.85; about $6,212 for 1 day', row('balances') === 765000 && ex.remainderCents === 621185 && s.daysRemaining === 1 && Math.round(s.dailyAllowance) === 6212);
  const sep30 = look(d, [2026, 9, 30]);
  assert('initial — 30 Sep estimate $14,400.00; guide $1,145 for 10 days; lowest $8,650 on 20 Sep', sep30.r.targetCents === 1440000 && sep30.guide.displayCents === 114500 && sep30.guide.allocationDays === 10 && sep30.r.lowest.cents === 865000 && toISODate(sep30.r.lowest.date) === '2026-09-20');
  const oct24 = look(d, [2026, 10, 24]);
  assert('initial — 24 Oct estimate $18,350.00; guide $467 for 34 days with Salary as Main payday', oct24.r.targetCents === 1835000 && oct24.guide.displayCents === 46700 && oct24.guide.allocationDays === 34);

  // Confirm $1,000 Dividends into Main-CBA through the real transition.
  const div = d.recurringItems.find((r) => r.id === 'dividends')!;
  const res = confirmRecurringOccurrenceTransition(d, { recurringItemId: 'dividends', expectedNextDueDate: div.nextDueDate, targetAssetId: 'Main', transactionId: 'tx-div', date: NOW_ISO });
  if (!res.applied) throw new Error('dividends confirmation rejected');
  const a = res.data;
  const sa = computeSafeToSpend(a, TODAY);
  const exa = buildAupExplanation(sa);
  const month = computeThisMonthRecordedSummary(a, TODAY);
  assert('after Dividends — included money $8,650.00; AUP $7,211.85', exa.rows.find((r) => r.key === 'balances')?.cents === 865000 && exa.remainderCents === 721185);
  assert('after Dividends — This Month income $8,000.00, spending $5,500.00, net $2,500.00', month.incomeCents === 800000 && month.spendingCents === 550000 && month.netCents === 250000);
  const sep26 = look(a, [2026, 9, 26]);
  assert('after Dividends — 26 Sep estimate $11,450.00', sep26.r.targetCents === 1145000);
  const divEvents = look(a, [2026, 10, 4]).events.filter((e) => e.sourceId === 'dividends').map((e) => toISODate(e.date));
  assert('income double-count protection: the confirmed 20 Sep occurrence is gone exactly once; 27 Sep and 4 Oct recurrences remain', divEvents.join() === '2026-09-27,2026-10-04' && a.transactions.filter((t) => t.recurringItemId === 'dividends').length === 1);
  // §7 verification — Other income.
  const tdiv = a.transactions.find((t) => t.id === 'tx-div')!;
  assert('"Other income" is the approved fallback: an income source carries no structured income type, its free-text name "Dividends" matches no registry category, and the source stays identifiable on the record', tdiv.categoryId === 'cat-other-income' && tdiv.note === 'Dividends' && tdiv.recurringItemId === 'dividends' && !('incomeType' in div) && !d.categories.some((c) => c.type === 'income' && c.name.toLowerCase() === 'dividends'));
  const rentalNamed = confirmRecurringOccurrenceTransition(d, { recurringItemId: 'rental', expectedNextDueDate: d.recurringItems.find((r) => r.id === 'rental')!.nextDueDate, targetAssetId: 'Main', transactionId: 'tx-rental', date: NOW_ISO });
  assert('no supported income type is lost: a source named exactly like a registry category ("Rental income") still lands in it', rentalNamed.applied && rentalNamed.data.transactions.find((t) => t.id === 'tx-rental')!.categoryId === 'cat-rental-income');
}

console.log('\n=== §4 main-payday copy ===');
{
  assert('editor copy names BOTH effects', MAIN_PAYDAY_EFFECT_COPY === 'Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.');
  const salary = look(deviceData('salary-boq'), [2026, 10, 24]);
  const dividends = look(deviceData('dividends'), [2026, 10, 24]);
  console.log('  24 Oct guide: salary', salary.guide.displayCents, '| dividends', dividends.guide.displayCents);
  assert('the behaviour the copy describes (unchanged): same $18,350.00 estimate, different guide — $467 with Salary, $539 with Dividends', salary.r.targetCents === 1835000 && dividends.r.targetCents === 1835000 && salary.guide.displayCents === 46700 && dividends.guide.displayCents === 53900);
}

console.log('\n=== §5 repayment transitions under the accepted 2D-NARROW contract (Option A) ===');
{
  const d0 = base();
  d0.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 10650, includeInMoneyCalculations: true } as Asset];
  d0.liabilities = [{ id: 'loan', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability];
  d0.recurringItems = [item('r', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'loan' })];
  const d = syncIncomeAggregate(d0);
  const due = d.recurringItems[0].nextDueDate;
  const state = (x: AppData) => ({ main: Math.round(x.assets[0].currentValue * 100), liability: Math.round(x.liabilities[0].currentBalance * 100), spent: computeThisMonthRecordedSummary(x, TODAY).spendingCents, txns: x.transactions.length, due: toISODate(localDateFromDate(new Date(x.recurringItems[0].nextDueDate))) });
  const reminder = confirmRecurringOccurrenceTransition(d, { recurringItemId: 'r', expectedNextDueDate: due, paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 't', date: NOW_ISO });
  const form = (newBalance?: number) => confirmLoanRepaymentTransition(d, { recurringItemId: 'r', liabilityId: 'loan', expectedNextDueDate: due, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: newBalance !== undefined, newBalance, expectedCurrentBalance: 300000, transactionId: 't', date: NOW_ISO } as never);
  if (!reminder.applied) throw new Error('reminder path rejected');
  const full = form(297000), split = form(299200), unknown = form();
  if (!full.applied || !split.applied || !unknown.applied) throw new Error('loan form rejected');
  console.log('  historical one-sided ', JSON.stringify(state(reminder.data)));
  console.log('  form, new bal 297,000', JSON.stringify(state(full.data)));
  console.log('  form, new bal 299,200', JSON.stringify(state(split.data)));
  console.log('  form, balance unknown', JSON.stringify(state(unknown.data)));
  assert('every path: funding account reduced ONCE to $7,650.00, ONE transaction, schedule advanced ONCE to 20 Oct, category Mortgage', [reminder.data, full.data, split.data, unknown.data].every((x) => state(x).main === 765000 && state(x).txns === 1 && state(x).due === '2026-10-20' && x.transactions[0].categoryId === 'cat-mortgage'));
  assert('historical one-sided record shape (the pre-C.5.2 reminder path): liability untouched ($300,000), the full $3,000 presented as spending', state(reminder.data).liability === 30000000 && state(reminder.data).spent === 300000);
  assert('loan form: the liability falls ONLY by the principal the customer states; that principal is a transfer, NOT spending (accepted 2D-NARROW contract)', state(full.data).liability === 29700000 && state(full.data).spent === 0 && state(split.data).liability === 29920000 && state(split.data).spent === 220000 && state(unknown.data).liability === 30000000 && state(unknown.data).spent === 0);
  assert('2D-NARROW holds: no mode yields liability $297,000 AND a $3,000 This Month outgoing — principal is never counted as spending', ![full.data, split.data, unknown.data].some((x) => state(x).liability === 29700000 && state(x).spent === 300000));
  // Historical records: deletion reverses exactly what was stored, never an inferred liability effect.
  const undoReminder = reverseLoanRepaymentTransaction(reminder.data, 't');
  const undoForm = reverseLoanRepaymentTransaction(full.data, 't');
  assert('deleting a historical reminder-created record restores ONLY its funding side ($10,650.00; liability still $300,000; occurrence due again)', undoReminder.applied && state(undoReminder.data).main === 1065000 && state(undoReminder.data).liability === 30000000 && state(undoReminder.data).due === '2026-09-20' && state(undoReminder.data).txns === 0);
  assert('deleting a dedicated-path record restores BOTH recorded sides exactly ($10,650.00 and $300,000.00)', undoForm.applied && state(undoForm.data).main === 1065000 && state(undoForm.data).liability === 30000000 && state(undoForm.data).due === '2026-09-20' && state(undoForm.data).txns === 0);
  const dup = confirmRecurringOccurrenceTransition(reminder.data, { recurringItemId: 'r', expectedNextDueDate: due, paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 't2', date: NOW_ISO });
  const dupForm = confirmLoanRepaymentTransition(full.data, { recurringItemId: 'r', liabilityId: 'loan', expectedNextDueDate: due, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: false, expectedCurrentBalance: 297000, transactionId: 't2', date: NOW_ISO } as never);
  assert('double confirmation is rejected on both paths', dup.applied === false && dupForm.applied === false);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
