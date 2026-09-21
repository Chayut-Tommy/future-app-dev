// Pass C.5.2 — Authoritative Loan-Repayment Entry Parity (founder Option A).
// Pure, real-import proofs. Clock FROZEN to the local date 2026-09-19 (the day
// BEFORE the 20 Sep repayment is due, i.e. the "due tomorrow" reminder tier that
// used to bypass the loan form). The accepted 2D-NARROW contract is NOT changed.
//   §1 routing and identity   §2 Scenarios A / B / C with cross-calculation reconciliation
//   §3 validation and guards  §4 deletion, exact reversal, historical records, snapshot
//   §5 copy authorities
// Run with: npx tsx tests/c52-loan-repayment-parity.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { computeRankedReminder, SmartReminder } from '../src/lib/calculations/reminders';
import { LOAN_BALANCE_DECLINED_COPY, LOAN_BALANCE_EXPLAINER_COPY, loanRepaymentRecordedMessage, resolvePrimaryIntent } from '../src/lib/reminderPresentation';
import { MAIN_PAYDAY_EFFECT_COPY, mainPaydayChooserSubtitle } from '../src/lib/calculations/incomeEngine';
import { resolveRecordedTransactionCategoryId } from '../src/lib/calculations/billCategory';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../src/lib/calculations/spendingInsights';
import { computeAccessibleNetWorth } from '../src/lib/calculations/wealthDefinitions';
import { resolveTransactionAggregateSpendingAmount, resolveTransactionCashflowAmount, resolveTransactionCategoryCoachingAmount } from '../src/lib/calculations/repaymentAccounting';
import {
  confirmLoanRepaymentTransition,
  confirmRecurringOccurrenceTransition,
  reverseLoanRepaymentTransaction,
  syncIncomeAggregate,
} from '../src/state/AppStateContext';
import { localDate, localDateFromDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Liability, RecurringItem, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const FROZEN_NOW = new Date(2026, 8, 19, 18, 26).getTime();
Date.now = () => FROZEN_NOW;
const TODAY = new Date(2026, 8, 19);
const ASOF = localDate(2026, 9, 19);
const NOW_ISO = new Date(FROZEN_NOW).toISOString();
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none', ...extra } as Transaction);
const cents = (n: number) => Math.round(n * 100);

/** Parity fixture: funding $10,650.00, mortgage $300,000.00, $3,000.00 due 20 Sep (tomorrow). */
function fixture(dueDay = 20): AppData {
  const d = base();
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset,
    { id: 'Home', type: 'property', label: 'Richmond home', currentValue: 800000 } as Asset,
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability];
  d.recurringItems = [
    item('salary', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('richmond', 'expense', 3000, iso(2026, 9, dueDay), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
  ];
  d.transactions = [
    txn('t-sal', 'income', 7000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-rent-1', 'expense', 1000, iso(2026, 9, 7), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-2', 'expense', 1000, iso(2026, 9, 14), 'cat-rent', { note: 'Rent' }),
    txn('t-groc', 'expense', 500, iso(2026, 9, 15), 'cat-groceries'),
  ];
  return syncIncomeAggregate(d);
}
function allReminders(d: AppData, today = TODAY): SmartReminder[] {
  const seen: SmartReminder[] = [];
  for (let i = 0; i < 20; i++) {
    const next = computeRankedReminder(d, today, (r) => seen.some((s) => s.id === r.id));
    if (!next) break;
    seen.push(next);
  }
  return seen;
}
const repay = (d: AppData, newBalance: number | undefined, amount = 3000, id = 'tx-rep') => {
  const it = d.recurringItems.find((r) => r.id === 'richmond')!;
  const liability = d.liabilities.find((l) => l.id === 'richmond-loan');
  return confirmLoanRepaymentTransition(d, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: it.nextDueDate, amount, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: newBalance !== undefined, newBalance, expectedCurrentBalance: liability?.currentBalance ?? 0, transactionId: id, date: NOW_ISO });
};
function snapshot(d: AppData) {
  const s = computeSafeToSpend(d, TODAY);
  const look = computeLookAheadProjection(d, ASOF, localDate(2026, 9, 30));
  if (!look.available) throw new Error('look ahead unavailable');
  const events = computeProjectedEvents(d, ASOF, localDate(2026, 10, 31), { windowStart: ASOF }).events;
  const month = computeThisMonthRecordedSummary(d, TODAY);
  return {
    main: cents(d.assets.find((a) => a.id === 'Main')!.currentValue),
    liability: cents(d.liabilities[0]?.currentBalance ?? 0),
    netWorth: cents(computeAccessibleNetWorth(d)),
    aup: buildAupExplanation(s).remainderCents,
    aupBalances: buildAupExplanation(s).rows.find((r) => r.key === 'balances')?.cents,
    sep30: look.targetCents,
    opening: look.breakdown.openingCents,
    mortgageProjected: look.breakdown.mortgageCents,
    richmondEvents: events.filter((e) => e.sourceId === 'richmond').map((e) => toISODate(e.date)).join(),
    income: month.incomeCents,
    spent: month.spendingCents,
    net: month.netCents,
    due: toISODate(localDateFromDate(new Date(d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate))),
    txns: d.transactions.filter((t) => t.recurringItemId === 'richmond').length,
  };
}

console.log('=== §1 routing and identity ===');
{
  const d = fixture();
  const list = allReminders(d);
  console.log('  reminders:', list.map((r) => `${r.kind}:${r.id}`).join(' | '));
  const loan = list.find((r) => r.recurringItemId === 'richmond')!;
  assert('ROOT CAUSE closed: a loan-linked bill due TOMORROW is a loan_repayment_due reminder — never the ordinary bill_due_soon', !!loan && loan.kind === 'loan_repayment_due' && !list.some((r) => r.kind === 'bill_due_soon' && r.recurringItemId === 'richmond'));
  assert('stable identities are carried for prefill: source, linked liability, liability type, scheduled amount, occurrence date', loan.recurringItemId === 'richmond' && loan.liabilityId === 'richmond-loan' && loan.liabilityType === 'mortgage' && loan.amount === 3000 && loan.occurrenceDate === d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate && loan.id === `loan-soon-richmond-${loan.occurrenceDate}`);
  assert('wording: factual "recorded repayment" body; the action is "Record repayment", never "Mark as paid"', loan.title === 'Your Richmond repayment is due tomorrow' && /^Your recorded repayment of \$3,000 is due /.test(loan.body) && (() => { const i = resolvePrimaryIntent(loan.kind); return i.kind === 'financial' && i.label === 'Record repayment'; })());
  const rent = list.find((r) => r.recurringItemId === 'rent');
  assert('an ordinary bill (Rent) is untouched: due in two days, so no due-tomorrow reminder; when due tomorrow it is bill_due_soon with "Mark as paid"', !rent && (() => { const x = fixture(); x.recurringItems = x.recurringItems.map((r) => (r.id === 'rent' ? { ...r, nextDueDate: iso(2026, 9, 20) } : r)); const b = allReminders(x).find((r) => r.recurringItemId === 'rent'); const i = b ? resolvePrimaryIntent(b.kind) : null; return !!b && b.kind === 'bill_due_soon' && !!i && i.kind === 'financial' && i.label === 'Mark as paid'; })());
  // Structural only — never a name, amount, category or date.
  const lookalike = fixture();
  lookalike.recurringItems = lookalike.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, linkedLiabilityId: undefined, categoryId: 'cat-mortgage', label: 'Richmond mortgage repayment' } : r));
  const la = allReminders(lookalike).find((r) => r.recurringItemId === 'richmond');
  assert('no inference: an UNLINKED bill named "Richmond mortgage repayment", $3,000, category Mortgage, same date stays an ordinary bill', !!la && la.kind === 'bill_due_soon');
  const disguised = fixture();
  disguised.recurringItems = disguised.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, label: 'Gym', amount: 45, categoryId: 'cat-health' } : r));
  const dg = allReminders(disguised).find((r) => r.recurringItemId === 'richmond');
  assert('no inference: a LINKED bill named "Gym", $45, category Health is still routed to the loan form', !!dg && dg.kind === 'loan_repayment_due');
  for (const type of ['car_loan', 'personal_loan', 'other'] as Liability['type'][]) {
    const x = fixture(); x.liabilities = [{ ...x.liabilities[0], type }];
    assert(`supported family ${type}: due tomorrow → loan_repayment_due`, allReminders(x).some((r) => r.recurringItemId === 'richmond' && r.kind === 'loan_repayment_due' && r.liabilityType === type));
  }
  const bnpl = fixture(); bnpl.liabilities = [{ ...bnpl.liabilities[0], type: 'bnpl', currentBalance: 9000 }];
  const bn = allReminders(bnpl).find((r) => r.recurringItemId === 'richmond');
  assert('BNPL keeps its own authoritative flow (bnpl_repayment_due)', !!bn && bn.kind === 'bnpl_repayment_due');
  const card = fixture();
  card.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 20, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  assert('cards keep their own authoritative flow (card_due_soon)', allReminders(card).some((r) => r.kind === 'card_due_soon' && r.creditCardId === 'amex'));
  const paidOff = fixture(); paidOff.liabilities = [{ ...paidOff.liabilities[0], currentBalance: 0 }];
  assert('a paid-off loan (recorded balance $0) raises no repayment reminder in either tier', !allReminders(paidOff).some((r) => r.recurringItemId === 'richmond'));
  assert('due today and overdue were already loan reminders and still are', allReminders(fixture(19)).some((r) => r.recurringItemId === 'richmond' && r.kind === 'loan_repayment_due' && /^loan-overdue-/.test(r.id)) && allReminders(fixture(15)).some((r) => r.recurringItemId === 'richmond' && r.kind === 'loan_repayment_due'));
}

console.log('\n=== §2 Scenarios A / B / C — one transition, reconciled everywhere ===');
{
  const d = fixture();
  const before = snapshot(d);
  console.log('  before     ', JSON.stringify(before));
  assert('starting state: funding $10,650.00, liability $300,000.00, This Month spending $2,500.00, the 20 Sep repayment projected once ($3,000)', before.main === 1065000 && before.liability === 30000000 && before.spent === 250000 && before.mortgageProjected === -300000 && before.richmondEvents === '2026-09-20,2026-10-20');
  const scenarios: [string, number | undefined, number, number, number | undefined, string][] = [
    ['A — all principal (latest balance $297,000.00)', 297000, 29700000, 0, 3000, 'Repayment recorded · Liability updated'],
    ['B — mixed (latest balance $299,200.00)', 299200, 29920000, 220000, 800, 'Repayment recorded · Liability updated'],
    ['C — balance deliberately not supplied', undefined, 30000000, 0, undefined, 'Repayment recorded · Balance not updated'],
  ];
  for (const [name, newBalance, liabilityCents, spendingCents, principal, message] of scenarios) {
    const r = repay(d, newBalance);
    if (!r.applied) { assert(`${name}: applied`, false); continue; }
    const after = snapshot(r.data);
    const t = r.data.transactions.find((x) => x.id === 'tx-rep')!;
    console.log(`  ${name.slice(0, 1)} after    `, JSON.stringify(after));
    assert(`${name}: funding $7,650.00 once; liability ${liabilityCents / 100}; one transaction; occurrence resolved; schedule advanced once to 20 Oct`, after.main === 765000 && after.liability === liabilityCents && after.txns === 1 && after.due === '2026-10-20' && t.recurringOccurrenceKey === `richmond:${d.recurringItems.find((x) => x.id === 'richmond')!.nextDueDate}`);
    assert(`${name}: principal ${principal ?? 'not inferred'}; This Month spending moves by exactly ${spendingCents / 100} (principal is a transfer, never lifestyle spending); income untouched`, t.principalAmount === principal && after.spent === before.spent + spendingCents && after.income === before.income && after.net === before.net - spendingCents && cents(resolveTransactionAggregateSpendingAmount(r.data, t)) === spendingCents && cents(resolveTransactionCategoryCoachingAmount(r.data, t)) === 0);
    assert(`${name}: recorded cashflow follows 2D-NARROW (known split → interest only; unknown split → the full cash amount)`, cents(resolveTransactionCashflowAmount(r.data, t)) === (principal === undefined ? 300000 : 300000 - cents(principal)));
    assert(`${name}: full cash effect ONCE in AUP and Look Ahead — opening money −$3,000, the 20 Sep occurrence gone, the 20 Oct recurrence kept, 30 Sep estimate unchanged`, after.aupBalances === before.aupBalances! - 300000 && after.opening === before.opening - 300000 && after.mortgageProjected === 0 && after.richmondEvents === '2026-10-20' && after.sep30 === before.sep30);
    assert(`${name}: AUP is unchanged by recording a payment it had already reserved`, after.aup === before.aup);
    assert(`${name}: net worth = −$3,000 cash + the principal actually proven`, after.netWorth === before.netWorth - 300000 + (principal === undefined ? 0 : cents(principal)));
    assert(`${name}: category Mortgage (persisted and displayed); never folded into a largest-category claim; confirmation "${message}"`, t.categoryId === 'cat-mortgage' && resolveRecordedTransactionCategoryId(r.data, t) === 'cat-mortgage' && !computeSpendingInsights(r.data).some((i) => /Mortgage/.test(i.title)) && loanRepaymentRecordedMessage(t) === message);
    assert(`${name}: immutable effect snapshot — source, occurrence identity, family category, funding effect, liability identity, principal`, t.recurringItemId === 'richmond' && t.occurrenceResolution?.state === 'linked' && String((t.occurrenceResolution as { occurrenceId: string }).occurrenceId) === 'oid1:loan:richmond:2026-09' && t.isLoanRepayment === true && t.repaymentLiabilityId === 'richmond-loan' && t.appliedBalanceEffect?.targetKind === 'asset' && t.appliedBalanceEffect.targetId === 'Main' && cents(t.appliedBalanceEffect.delta) === -300000 && t.liabilityId === undefined);
    const restarted: AppData = JSON.parse(JSON.stringify(r.data));
    assert(`${name}: restart (JSON round-trip) preserves every value`, JSON.stringify(snapshot(restarted)) === JSON.stringify(after));
  }
  assert('no reminder remains for the resolved occurrence; nothing new is raised for 20 Oct yet', (() => { const r = repay(d, 297000); return r.applied && !allReminders(r.data).some((x) => x.recurringItemId === 'richmond'); })());
}

console.log('\n=== §3 validation and guards ===');
{
  const d = fixture();
  const partial = repay(d, 298500, 2000);
  assert('partial repayment ($2,000 of $3,000, balance $298,500): funding −$2,000, principal $1,500, spending +$500, occurrence still resolved once', partial.applied && snapshot(partial.data).main === 865000 && snapshot(partial.data).liability === 29850000 && snapshot(partial.data).spent === 250000 + 50000 && snapshot(partial.data).due === '2026-10-20');
  const over = repay(d, 295000, 5000);
  assert('overpayment ($5,000, balance $295,000): principal $5,000 allowed because it never exceeds the payment', over.applied && snapshot(over.data).liability === 29500000 && snapshot(over.data).main === 565000);
  const floor = (() => { const x = fixture(); x.liabilities = [{ ...x.liabilities[0], currentBalance: 2500 }]; const it = x.recurringItems.find((r) => r.id === 'richmond')!; return confirmLoanRepaymentTransition(x, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: it.nextDueDate, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: true, newBalance: 0, expectedCurrentBalance: 2500, transactionId: 't', date: NOW_ISO }); })();
  assert('liability floor: a final $3,000 payment against $2,500 owed → balance $0.00, principal $2,500, the other $500 treated as interest/fees', floor.applied && floor.data.liabilities[0].currentBalance === 0 && floor.principalAmount === 2500);
  const reasons = (r: { applied: boolean; reason?: string }) => (r.applied ? 'applied' : r.reason);
  assert('principal larger than the payment is refused (balance $296,000 for a $3,000 payment) — no split is invented', reasons(repay(d, 296000) as never) === 'invalid_principal');
  assert('invalid lender balance is refused: negative, higher than the current balance, NaN, Infinity', [-1, 300000.01, NaN, Infinity].every((b) => reasons(repay(d, b) as never) === 'invalid_balance'));
  assert('invalid amounts are refused: 0, negative, NaN, Infinity, three decimals', [0, -5, NaN, Infinity, 10.001].every((a) => reasons(repay(d, undefined, a) as never) === 'invalid_amount'));
  assert('insufficient funds is refused; nothing is floored silently', reasons(repay(d, undefined, 10650.01) as never) === 'insufficient_source_balance');
  const noLiability: AppData = { ...d, liabilities: [] };
  assert('missing or deleted liability → refused', reasons(repay(noLiability, undefined) as never) === 'missing_liability');
  const bnplTyped: AppData = { ...d, liabilities: [{ ...d.liabilities[0], type: 'bnpl' }] };
  assert('a BNPL liability is never accepted by the loan transition', reasons(repay(bnplTyped, undefined) as never) === 'wrong_type');
  const unlinked: AppData = { ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, linkedLiabilityId: undefined } : r)) };
  assert('an unlinked source is never accepted by the loan transition', reasons(repay(unlinked, undefined) as never) === 'missing_liability');
  const once = repay(d, 297000);
  assert('double confirmation is refused (same occurrence), and a stale liability balance is refused', once.applied && reasons(confirmLoanRepaymentTransition(once.data, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: false, expectedCurrentBalance: 297000, transactionId: 't2', date: NOW_ISO }) as never) === 'stale' && reasons(confirmLoanRepaymentTransition(d, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: false, expectedCurrentBalance: 299999, transactionId: 't2', date: NOW_ISO }) as never) === 'stale_balance');
  assert('every refusal leaves the data untouched (no partial write)', JSON.stringify(snapshot(d)) === JSON.stringify(snapshot(fixture())));
  // The genuine bill path is unchanged.
  const rentDue = d.recurringItems.find((r) => r.id === 'rent')!;
  const bill = confirmRecurringOccurrenceTransition(d, { recurringItemId: 'rent', expectedNextDueDate: rentDue.nextDueDate, paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 't-bill', date: NOW_ISO });
  assert('genuine bill path unchanged: Rent $1,000 → funding −$1,000, spending +$1,000, category Rent, no loan flags', bill.applied && snapshot(bill.data).main === 965000 && snapshot(bill.data).spent === 350000 && (() => { const t = bill.data.transactions.find((x) => x.id === 't-bill')!; return t.categoryId === 'cat-rent' && t.isLoanRepayment === undefined && t.repaymentLiabilityId === undefined; })());
}

console.log('\n=== §4 deletion, exact reversal, historical records ===');
{
  const d = fixture();
  const start = JSON.stringify(snapshot(d));
  for (const [name, newBalance] of [['A', 297000], ['B', 299200], ['C', undefined]] as [string, number | undefined][]) {
    const r = repay(d, newBalance);
    if (!r.applied) { assert(`${name} applied`, false); continue; }
    const restartedBefore: AppData = JSON.parse(JSON.stringify(r.data));
    const undo = reverseLoanRepaymentTransaction(restartedBefore, 'tx-rep');
    assert(`delete after Scenario ${name} (after a restart): funding, liability, net worth, This Month, AUP, Look Ahead and the 20 Sep occurrence all return EXACTLY to the starting state`, undo.applied && JSON.stringify(snapshot(undo.data)) === start && !undo.data.transactions.some((t) => t.id === 'tx-rep'));
    if (!undo.applied) continue;
    const restartedAfter: AppData = JSON.parse(JSON.stringify(undo.data));
    assert(`Scenario ${name}: a repeated delete is refused; the reminder is back as a loan reminder`, reverseLoanRepaymentTransaction(restartedAfter, 'tx-rep').applied === false && allReminders(restartedAfter).some((x) => x.recurringItemId === 'richmond' && x.kind === 'loan_repayment_due'));
    const again = repay(restartedAfter, newBalance, 3000, 'tx-rep-2');
    assert(`Scenario ${name}: re-record creates exactly one transaction and one resolved occurrence, with the same occurrence identity and no duplicate future occurrence`, again.applied && snapshot(again.data).txns === 1 && snapshot(again.data).richmondEvents === '2026-10-20' && String((again.data.transactions.find((t) => t.id === 'tx-rep-2')!.occurrenceResolution as { occurrenceId: string }).occurrenceId) === 'oid1:loan:richmond:2026-09');
  }
  // Historical one-sided record (the pre-C.5.2 reminder path): never retrofitted.
  const it = d.recurringItems.find((r) => r.id === 'richmond')!;
  const historical = confirmRecurringOccurrenceTransition(d, { recurringItemId: 'richmond', expectedNextDueDate: it.nextDueDate, paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 'tx-hist', date: NOW_ISO });
  if (!historical.applied) throw new Error('historical fixture rejected');
  const h = historical.data.transactions.find((t) => t.id === 'tx-hist')!;
  assert('historical record keeps its stored facts: no loan flag, no principal, no liability snapshot, liability $300,000.00, counted as $3,000 spending', h.isLoanRepayment === undefined && h.principalAmount === undefined && h.repaymentLiabilityId === undefined && snapshot(historical.data).liability === 30000000 && snapshot(historical.data).spent === 550000);
  const undoHist = reverseLoanRepaymentTransaction(JSON.parse(JSON.stringify(historical.data)), 'tx-hist');
  assert('deleting the historical record reverses ONLY what it stored: funding back to $10,650.00, liability untouched, occurrence due again — exactly the starting state', undoHist.applied && JSON.stringify(snapshot(undoHist.data)) === start);
  const rerecord = undoHist.applied ? repay(undoHist.data, 297000, 3000, 'tx-new') : null;
  assert('re-recording it through the repaired path creates the authoritative two-sided record (liability $297,000.00; spending back to $2,500.00)', !!rerecord && rerecord.applied && snapshot(rerecord.data).liability === 29700000 && snapshot(rerecord.data).spent === 250000 && snapshot(rerecord.data).txns === 1);
  // Snapshot immutability against later source changes.
  const recorded = repay(d, 299200);
  if (!recorded.applied) throw new Error('rejected');
  const edited: AppData = { ...recorded.data, recurringItems: recorded.data.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, label: 'Home loan', amount: 3300 } : r)), liabilities: [{ ...recorded.data.liabilities[0], label: 'Home loan' }] };
  const te = edited.transactions.find((t) => t.id === 'tx-rep')!;
  assert('editing the source or liability afterwards changes nothing recorded: label, amount, principal, category, effects', te.note === 'Richmond repayment' && te.amount === 3000 && te.principalAmount === 800 && resolveRecordedTransactionCategoryId(edited, te) === 'cat-mortgage' && cents(resolveTransactionAggregateSpendingAmount(edited, te)) === 220000);
  const relinked: AppData = { ...recorded.data, liabilities: [...recorded.data.liabilities, { id: 'other-loan', type: 'personal_loan', label: 'Other', currentBalance: 10000 } as Liability], recurringItems: recorded.data.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, linkedLiabilityId: 'other-loan' } : r)) };
  const undoRelinked = reverseLoanRepaymentTransaction(relinked, 'tx-rep');
  assert('a source later re-linked to another liability cannot misdirect the reversal: the $800 principal returns to the liability that was actually changed', undoRelinked.applied && undoRelinked.data.liabilities.find((l) => l.id === 'richmond-loan')!.currentBalance === 300000 && undoRelinked.data.liabilities.find((l) => l.id === 'other-loan')!.currentBalance === 10000);
  const sourceGone: AppData = { ...recorded.data, recurringItems: recorded.data.recurringItems.filter((r) => r.id !== 'richmond') };
  // C.5.2.1 — the stored effects govern: a deleted source no longer strands the repayment (full proof in tests/c521-integrity-closure.test.ts).
  assert('source deleted: the record keeps its Mortgage label and recorded amounts, and is still exactly reversible from its stored effects', resolveRecordedTransactionCategoryId(sourceGone, sourceGone.transactions.find((t) => t.id === 'tx-rep')!) === 'cat-mortgage' && (() => { const u = reverseLoanRepaymentTransaction(sourceGone, 'tx-rep'); return u.applied && u.data.assets.find((x) => x.id === 'Main')!.currentValue === 10650 && u.data.liabilities[0].currentBalance === 300000 && !u.data.recurringItems.some((r) => r.id === 'richmond'); })());
}

console.log('\n=== §5 copy authorities ===');
{
  assert('lender-balance explanation and decline copy', LOAN_BALANCE_EXPLAINER_COPY === 'Add your latest lender balance to keep your liability and spending split up to date.' && LOAN_BALANCE_DECLINED_COPY === 'We’ll record the repayment, but we won’t estimate principal or change your liability.');
  assert('save confirmation wording follows the recorded transaction', loanRepaymentRecordedMessage({ principalAmount: 3000 }) === 'Repayment recorded · Liability updated' && loanRepaymentRecordedMessage({ principalAmount: 0 }) === 'Repayment recorded · Liability updated' && loanRepaymentRecordedMessage({}) === 'Repayment recorded · Balance not updated' && loanRepaymentRecordedMessage(null) === 'Repayment recorded · Balance not updated');
  const incomes = [item('a', 'income', 1, iso(2026, 9, 21), 'weekly', 'A'), item('b', 'income', 1, iso(2026, 9, 22), 'weekly', 'B')];
  assert('main-payday copy: the editor and BOTH choosers read one authority', mainPaydayChooserSubtitle(incomes) === MAIN_PAYDAY_EFFECT_COPY && MAIN_PAYDAY_EFFECT_COPY === 'Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.');
  // Tie wording through the shared formatter.
  const tie = fixture();
  tie.transactions = [...tie.transactions, txn('t-rent-0', 'expense', 1000, iso(2026, 8, 31), 'cat-rent'), txn('legacy-m', 'expense', 3000, iso(2026, 9, 18), 'cat-mortgage')];
  const line = computeSpendingInsights(tie).map((i) => `${i.title} · ${i.body}`).find((x) => /tied|largest/.test(x));
  console.log('  tie line:', line);
  assert('tie line uses the shared currency formatter and names no single winner: "Rent and Mortgage are tied · $3,000 each over 30 days."', line === 'Rent and Mortgage are tied · $3,000 each over 30 days.');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
