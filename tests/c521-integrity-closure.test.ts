// Pass C.5.2.1 — final integrity closure. Pure, real-import proofs, clock FROZEN
// to the local date 2026-09-19.
//   §1 reversal is governed by STORED effects (source deleted, liability deleted,
//      relinked source, historical one-sided record, reload, repeated reversal)
//   §2 broken loan links FAIL CLOSED (never "Mark as paid", never the bill transition)
//   §3 Scenario B's $2,200: where it is counted and where it is explained
//   §4 copy: estimate wording, explicit balance choice
// Run with: npx tsx tests/c521-integrity-closure.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { computeRankedReminder, SmartReminder } from '../src/lib/calculations/reminders';
import { LOAN_SPLIT_ESTIMATE_COPY, resolvePrimaryIntent } from '../src/lib/reminderPresentation';
import { resolveRecordedTransactionCategoryId } from '../src/lib/calculations/billCategory';
import { computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeSpendingInsights, computeCategoryDeltas } from '../src/lib/calculations/spendingInsights';
import { computeAccessibleNetWorth } from '../src/lib/calculations/wealthDefinitions';
import { resolveTransactionAggregateSpendingAmount, resolveTransactionCategoryCoachingAmount } from '../src/lib/calculations/repaymentAccounting';
import {
  applyTransactionDelete,
  confirmLoanRepaymentTransition,
  confirmRecurringOccurrenceTransition,
  deleteLiabilityTransition,
  reverseLoanRepaymentTransaction,
  syncIncomeAggregate,
} from '../src/state/AppStateContext';
import type { AppData, Asset, Liability, RecurringItem, Transaction } from '../src/types/models';

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
const NOW_ISO = new Date(FROZEN_NOW).toISOString();
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const cents = (n: number) => Math.round(n * 100);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);
const txn = (id: string, type: 'income' | 'expense', amount: number, date: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount, date, categoryId, balanceEffect: 'none', ...extra } as Transaction);

function fixture(): AppData {
  const d = { ...createEmptyAppData() };
  d.user = { ...d.user, hasSeenIntro: true };
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability];
  d.recurringItems = [
    item('salary', 'income', 4000, iso(2026, 9, 28), 'fortnightly', 'Salary boq'),
    item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'richmond-loan' }),
  ];
  d.transactions = [
    txn('t-sal', 'income', 7000, iso(2026, 9, 7), 'cat-salary'),
    txn('t-rent-1', 'expense', 1000, iso(2026, 9, 7), 'cat-rent', { note: 'Rent' }),
    txn('t-rent-2', 'expense', 1000, iso(2026, 9, 14), 'cat-rent', { note: 'Rent' }),
    txn('t-groc', 'expense', 500, iso(2026, 9, 15), 'cat-groceries'),
  ];
  return syncIncomeAggregate(d);
}
const repay = (d: AppData, newBalance: number | undefined, id = 'tx-rep') => {
  const it = d.recurringItems.find((r) => r.id === 'richmond')!;
  const r = confirmLoanRepaymentTransition(d, { recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: it.nextDueDate, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: newBalance !== undefined, newBalance, expectedCurrentBalance: d.liabilities[0].currentBalance, transactionId: id, date: NOW_ISO });
  if (!r.applied) throw new Error(`repay rejected: ${r.reason}`);
  return r.data;
};
const main = (d: AppData) => cents(d.assets.find((a) => a.id === 'Main')!.currentValue);
const liab = (d: AppData, id = 'richmond-loan') => { const l = d.liabilities.find((x) => x.id === id); return l ? cents(l.currentBalance) : null; };
const reload = (d: AppData): AppData => JSON.parse(JSON.stringify(d));
function allReminders(d: AppData, today = TODAY): SmartReminder[] {
  const seen: SmartReminder[] = [];
  for (let i = 0; i < 20; i++) {
    const next = computeRankedReminder(d, today, (r) => seen.some((s) => s.id === r.id));
    if (!next) break;
    seen.push(next);
  }
  return seen;
}

console.log('=== §1 reversal is governed by stored effects ===');
{
  const start = fixture();
  for (const [name, newBalance, liabilityAfter] of [['A', 297000, 29700000], ['B', 299200, 29920000], ['C', undefined, 30000000]] as [string, number | undefined, number][]) {
    const recorded = repay(start, newBalance);
    const sourceDeleted: AppData = reload({ ...recorded, recurringItems: recorded.recurringItems.filter((r) => r.id !== 'richmond') });
    assert(`Scenario ${name}: recorded (liability ${liabilityAfter / 100}); then the SOURCE is deleted and the app reloaded`, liab(recorded) === liabilityAfter && !sourceDeleted.recurringItems.some((r) => r.id === 'richmond'));
    const undo = reverseLoanRepaymentTransaction(sourceDeleted, 'tx-rep');
    assert(`Scenario ${name}: the repayment is NOT stranded — funding back to $10,650.00, liability back to $300,000.00, net worth back, transaction removed once`, undo.applied && main(undo.data) === 1065000 && liab(undo.data) === 30000000 && cents(computeAccessibleNetWorth(undo.data)) === cents(computeAccessibleNetWorth(start)) && !undo.data.transactions.some((t) => t.id === 'tx-rep') && undo.data.transactions.length === start.transactions.length);
    assert(`Scenario ${name}: the deleted source and its schedule are NOT recreated; This Month returns to $2,500.00`, undo.applied && !undo.data.recurringItems.some((r) => r.id === 'richmond') && undo.data.recurringItems.length === 1 && computeThisMonthRecordedSummary(undo.data, TODAY).spendingCents === 250000);
    assert(`Scenario ${name}: a repeated reversal is refused`, undo.applied && reverseLoanRepaymentTransaction(undo.data, 'tx-rep').applied === false);
    assert(`Scenario ${name}: label and recorded amounts survive the source deletion unchanged`, (() => { const t = sourceDeleted.transactions.find((x) => x.id === 'tx-rep')!; return resolveRecordedTransactionCategoryId(sourceDeleted, t) === 'cat-mortgage' && t.amount === 3000 && t.isLoanRepayment === true && t.repaymentLiabilityId === 'richmond-loan'; })());
  }
  // Liability deleted (the existing transition keeps the bill, now with a dangling link).
  const recordedB = repay(start, 299200);
  const liabilityDeleted = reload(deleteLiabilityTransition(recordedB, 'richmond-loan'));
  const undoL = reverseLoanRepaymentTransaction(liabilityDeleted, 'tx-rep');
  assert('liability deleted: reversal still restores the funding account ($10,650.00), reopens the 20 Sep occurrence, removes the transaction, and invents no liability', undoL.applied && main(undoL.data) === 1065000 && undoL.data.liabilities.length === 0 && undoL.data.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate === iso(2026, 9, 20) && !undoL.data.transactions.some((t) => t.id === 'tx-rep'));
  const bothDeleted = reload({ ...liabilityDeleted, recurringItems: liabilityDeleted.recurringItems.filter((r) => r.id !== 'richmond') });
  const undoBoth = reverseLoanRepaymentTransaction(bothDeleted, 'tx-rep');
  assert('source AND liability deleted: funding restored exactly, nothing recreated', undoBoth.applied && main(undoBoth.data) === 1065000 && undoBoth.data.liabilities.length === 0 && undoBoth.data.recurringItems.length === 1);
  // Relinked source.
  const relinked: AppData = { ...recordedB, liabilities: [...recordedB.liabilities, { id: 'other', type: 'personal_loan', label: 'Other', currentBalance: 10000 } as Liability], recurringItems: recordedB.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, linkedLiabilityId: 'other' } : r)) };
  const undoR = reverseLoanRepaymentTransaction(reload(relinked), 'tx-rep');
  assert('source relinked to a different liability: the $800 principal returns to the liability that was ACTUALLY changed; the other is untouched', undoR.applied && liab(undoR.data) === 30000000 && liab(undoR.data, 'other') === 1000000 && main(undoR.data) === 1065000);
  // Historical one-sided record (pre-C.5.2 reminder path): never retrofitted.
  const it = start.recurringItems.find((r) => r.id === 'richmond')!;
  const hist = confirmRecurringOccurrenceTransition(start, { recurringItemId: 'richmond', expectedNextDueDate: it.nextDueDate, paymentSource: 'everyday', targetAssetId: 'Main', transactionId: 'tx-hist', date: NOW_ISO });
  if (!hist.applied) throw new Error('historical fixture rejected');
  const undoHist = reverseLoanRepaymentTransaction(reload(hist.data), 'tx-hist');
  assert('historical one-sided record, source present: deletion restores ONLY its stored funding effect and reopens the occurrence; liability untouched', undoHist.applied && main(undoHist.data) === 1065000 && liab(undoHist.data) === 30000000 && undoHist.data.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate === iso(2026, 9, 20));
  const histSourceGone: AppData = reload({ ...hist.data, recurringItems: hist.data.recurringItems.filter((r) => r.id !== 'richmond') });
  const viaLoan = reverseLoanRepaymentTransaction(histSourceGone, 'tx-hist');
  const viaOrdinary = applyTransactionDelete(histSourceGone, 'tx-hist', true);
  assert('historical one-sided record, source deleted: it carries no loan proof, so it is an ordinary transaction — the ordinary delete restores exactly its stored funding effect, and no liability effect is inferred', viaLoan.applied === false && main(viaOrdinary) === 1065000 && liab(viaOrdinary) === 30000000 && !viaOrdinary.transactions.some((t) => t.id === 'tx-hist'));
  // A pre-snapshot loan-form record whose source is gone and whose liability cannot be identified: never guessed.
  const legacyForm: AppData = reload({ ...recordedB, transactions: recordedB.transactions.map((t) => (t.id === 'tx-rep' ? { ...t, repaymentLiabilityId: undefined } : t)), recurringItems: recordedB.recurringItems.filter((r) => r.id !== 'richmond') });
  assert('a legacy form record WITHOUT the liability snapshot, source deleted, principal > 0: reversal is refused rather than guessing which liability to restore', reverseLoanRepaymentTransaction(legacyForm, 'tx-rep').applied === false);
  const legacyFormC: AppData = reload({ ...repay(start, undefined), recurringItems: [] });
  legacyFormC.transactions = legacyFormC.transactions.map((t) => (t.id === 'tx-rep' ? { ...t, repaymentLiabilityId: undefined } : t));
  assert('…but the same legacy record with NO liability effect is exactly reversible (funding only)', (() => { const u = reverseLoanRepaymentTransaction(legacyFormC, 'tx-rep'); return u.applied && main(u.data) === 1065000; })());
  assert('backward compatibility: legacy AppData without any C.5.2 field still loads and reverses through the structured link', (() => { const old = reload(recordedB); old.transactions = old.transactions.map((t) => { const { repaymentLiabilityId, ...rest } = t as Transaction & { repaymentLiabilityId?: string }; void repaymentLiabilityId; return rest as Transaction; }); const u = reverseLoanRepaymentTransaction(old, 'tx-rep'); return u.applied && liab(u.data) === 30000000 && main(u.data) === 1065000; })());
  const qa = readFileSync(join(__dirname, '../src/components/dashboard/QuickAddModal.tsx'), 'utf8');
  assert('P0 stays locked without the source: the persisted loan flag alone keeps the record view-only and on the two-sided reversal route', /if \(t\.isLoanRepayment === true\) return true;/.test(qa));
}

console.log('\n=== §2 broken loan links fail closed ===');
{
  const base = fixture();
  const variants: [string, (d: AppData) => AppData, 'review' | 'silent'][] = [
    ['liability missing (deleted)', (d) => ({ ...d, liabilities: [] }), 'review'],
    ['liability deleted through the real transition', (d) => deleteLiabilityTransition(d, 'richmond-loan'), 'review'],
    ['linked to an unsupported liability type (credit_card)', (d) => ({ ...d, liabilities: [{ ...d.liabilities[0], type: 'credit_card' }] }), 'review'],
    ['incorrectly linked (id that does not exist)', (d) => ({ ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, linkedLiabilityId: 'nope' } : r)) }), 'review'],
    ['recorded balance zero', (d) => ({ ...d, liabilities: [{ ...d.liabilities[0], currentBalance: 0 }] }), 'silent'],
    ['recorded balance negative', (d) => ({ ...d, liabilities: [{ ...d.liabilities[0], currentBalance: -5 }] }), 'silent'],
    ['recorded balance NaN', (d) => ({ ...d, liabilities: [{ ...d.liabilities[0], currentBalance: NaN }] }), 'silent'],
    ['recorded balance Infinity is not a payable balance either', (d) => ({ ...d, liabilities: [{ ...d.liabilities[0], currentBalance: Number.NEGATIVE_INFINITY }] }), 'silent'],
  ];
  for (const dueDay of [20, 19, 15]) {
    for (const [name, mutate, expected] of variants) {
      const d = mutate(fixture());
      d.recurringItems = d.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, nextDueDate: iso(2026, 9, dueDay) } : r));
      const mine = allReminders(d).filter((r) => r.recurringItemId === 'richmond');
      const ordinary = mine.some((r) => r.kind === 'bill_due_soon' || r.kind === 'bill_overdue');
      const markAsPaid = mine.some((r) => { const i = resolvePrimaryIntent(r.kind); return i.kind === 'financial' && i.label === 'Mark as paid'; });
      const ok = expected === 'review' ? mine.length === 1 && mine[0].kind === 'repayment_source_review' && resolvePrimaryIntent(mine[0].kind).kind === 'none' && mine[0].amount === undefined : mine.length === 0;
      assert(`due ${dueDay} Sep — ${name}: never an ordinary bill reminder, never "Mark as paid" → ${expected === 'review' ? 'calm "Review" reminder with NO financial action' : 'no repayment reminder (existing paid-off treatment)'}`, !ordinary && !markAsPaid && ok);
    }
  }
  const review = allReminders({ ...base, liabilities: [] }).find((r) => r.recurringItemId === 'richmond')!;
  assert('review reminder wording is calm and says what to do', review.title === 'Review your Richmond repayment' && review.body === 'This repayment is linked to a loan Nolie can no longer find, so it can’t be recorded yet. Open this bill to link it to a loan again, or remove it.');
  const card = readFileSync(join(__dirname, '../src/components/today/SmartReminderCard.tsx'), 'utf8');
  assert('the review card branch can only acknowledge: it calls no confirmation and opens no form', (() => { const i = card.indexOf("reminder.kind === 'repayment_source_review' ? ("); const block = card.slice(i, i + 900); return i > 0 && /onPress=\{acknowledgeReminder\}/.test(block) && !/confirmRecurringOccurrence|onRequestLoanRepayment|confirmBillPaid/.test(block); })());
  assert('an ordinary, unlinked bill is unaffected (still "Mark as paid" when due tomorrow)', (() => { const d = fixture(); d.recurringItems = [...d.recurringItems, item('rent', 'expense', 1000, iso(2026, 9, 20), 'weekly', 'Rent', { categoryId: 'cat-rent' })]; const r = allReminders(d).find((x) => x.recurringItemId === 'rent'); const i = r ? resolvePrimaryIntent(r.kind) : null; return !!r && r.kind === 'bill_due_soon' && !!i && i.kind === 'financial' && i.label === 'Mark as paid'; })());
}

console.log('\n=== §3 Scenario B — where the $2,200 is counted and explained ===');
{
  const start = fixture();
  const b = repay(start, 299200);
  const t = b.transactions.find((x) => x.id === 'tx-rep')!;
  const month = computeThisMonthRecordedSummary(b, TODAY);
  assert('This Month headline: spending $2,500.00 → $4,700.00 (+ the $2,200.00 interest part only; the $800.00 principal is excluded)', month.spendingCents === 470000 && cents(resolveTransactionAggregateSpendingAmount(b, t)) === 220000 && cents(t.principalAmount ?? 0) === 80000);
  assert('recent activity / Transactions row: the FULL $3,000.00 cash payment, labelled Mortgage', t.amount === 3000 && resolveRecordedTransactionCategoryId(b, t) === 'cat-mortgage');
  assert('CONTRACT (2D-NARROW, unchanged): category coaching excludes every loan repayment, including its interest part — so no category total, delta or largest-category claim contains the $2,200', cents(resolveTransactionCategoryCoachingAmount(b, t)) === 0 && !computeCategoryDeltas(b).some((d) => d.categoryId === 'cat-mortgage') && !computeSpendingInsights(b).some((i) => /^Mortgage/.test(i.title)));
  const note = computeSpendingInsights(b).find((i) => i.title === 'Loan interest is counted in spending');
  console.log('  explanation:', note?.body);
  assert('…and that exclusion is now EXPLAINED with the exact amount, not left as a silent disagreement', !!note && note.body === '$2,200 of estimated repayment interest and fees in the last 30 days is in your spending total, but not in these category comparisons.');
  assert('no explanation appears when there is nothing to explain (Scenario A all principal; Scenario C no split; no repayment at all)', [repay(start, 297000), repay(start, undefined), start].every((d) => !computeSpendingInsights(d).some((i) => i.title === 'Loan interest is counted in spending')));
  const history = readFileSync(join(__dirname, '../src/screens/transactions/TransactionsScreen.tsx'), 'utf8');
  assert('transaction disclosure says which part is spending: "Estimated split: $800 principal (not spending), $2,200 interest and fees (counted as spending)"', /Estimated split: \$\$\{Math\.round\(t\.principalAmount\)\.toLocaleString\(\)\} principal \(not spending\), \$\$\{Math\.round\(interest\)\.toLocaleString\(\)\} interest and fees \(counted as spending\)/.test(history) && /Estimated split: \$\$\{Math\.round\(t\.principalAmount\)\.toLocaleString\(\)\} to principal — not counted as spending/.test(history) && /Repayment — not counted as spending · Balance not updated — split unknown/.test(history));
  const wk = readFileSync(join(__dirname, '../src/lib/calculations/worthKnowing.ts'), 'utf8');
  assert('Worth Knowing states its denominator as "categorised spending" (it never claimed the full spending total)', /of your categorised spending this month/.test(wk));
}

console.log('\n=== §4 copy ===');
{
  assert('split wording is qualified as an estimate', LOAN_SPLIT_ESTIMATE_COPY === 'Estimated split based on the balances you entered.');
  const hook = readFileSync(join(__dirname, '../src/hooks/useLoanRepaymentForm.ts'), 'utf8');
  assert('the balance decision starts unanswered and Save requires it: no default is read as consent', /useState<LoanBalanceChoice \| null>\(null\)/.test(hook) && /balanceChoice !== null && balanceStepValid/.test(hook) && /\|\| balanceChoice === null\) return;/.test(hook));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
