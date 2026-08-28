// A1 — candidate discovery + sub-monthly identity stability through real edits (pure).
// Run: ./node_modules/.bin/tsx tests/a1-candidates-and-edit-stability.test.ts

import type { AppData, CreditCard, Liability, RecurringItem, Transaction } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import { deriveOccurrenceCandidates } from '../src/lib/calculations/occurrenceCandidates';
import { occurrenceIdForRecurringItem } from '../src/lib/calculations/occurrenceSources';
import { resolveOccurrence } from '../src/lib/calculations/occurrenceResolution';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (y: number, m: number, d: number) => D(y, m, d).toISOString();
// Mirrors the real updateRecurringItem transition exactly: it maps ONLY
// recurringItems (never transactions), so a linked transaction is untouched.
const editItem = (data: AppData, id: string, patch: Partial<RecurringItem>): AppData => ({
  ...data,
  recurringItems: data.recurringItems.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

console.log('=== candidate discovery: ONLY one-sided sources (income / ordinary bill) ===');
{
  // Income, an ordinary bill, a credit card, a BNPL plan and a loan — all with
  // occurrences near 3 Aug 2026, so proximity is NOT what excludes them.
  let data = createEmptyAppData();
  data = {
    ...data,
    liabilities: [
      { id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 200 } as Liability,
      { id: 'loan1', type: 'mortgage', label: 'Home Loan', currentBalance: 10000 } as Liability,
    ],
    recurringItems: [
      { id: 'wage', type: 'income', label: 'Salary', amount: 2000, frequency: 'monthly', nextDueDate: iso(2026, 8, 25), isFixed: false, active: true } as RecurringItem,
      { id: 'rent', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
      { id: 'gym', type: 'expense', label: 'Gym', amount: 150, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true, categoryId: 'cat-health' } as RecurringItem,
      { id: 'bnItem', type: 'expense', label: 'Afterpay', amount: 50, frequency: 'monthly', nextDueDate: iso(2026, 8, 4), isFixed: false, active: true, linkedLiabilityId: 'bnpl1', categoryId: 'cat-shopping' } as RecurringItem,
      { id: 'loanItem', type: 'expense', label: 'Home Loan', amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true, linkedLiabilityId: 'loan1', categoryId: 'cat-mortgage' } as RecurringItem,
    ],
    creditCards: [{ id: 'card1', issuer: 'T', label: 'Test Card', creditLimit: 5000, currentBalance: 1000, dueDay: 3, minimumPayment: 0, expectedMonthlyRepayment: 150 } as CreditCard],
  };
  const inc = deriveOccurrenceCandidates(data, { type: 'income', date: iso(2026, 8, 24), amount: 2000 });
  assert('1a. an income txn near 25 Aug surfaces the salary occurrence only', inc.candidates.length === 1 && inc.candidates[0].label.startsWith('Salary'));
  assert('1a-repay. an income link never carries repayment metadata', inc.candidates.every((c) => c.isRepayment === false && c.expectedCents === undefined));

  // A cat-rent expense on 3 Aug is within the window of Rent (cat-rent), Gym
  // (cat-health), the loan repayment, the BNPL repayment AND the card cycle.
  // ONLY the same-category ordinary bill (Rent) may be offered.
  const exp = deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 3), amount: 900, categoryId: 'cat-rent' });
  assert('1b. a cat-rent expense surfaces the RENT bill only (same category)', exp.candidates.length === 1 && exp.candidates[0].label.startsWith('Rent'));
  assert('1b-cat. a cat-rent expense is NOT offered the Gym bill (different category — the device defect)', !exp.candidates.some((c) => c.label.startsWith('Gym')));
  assert('1c. the card repayment cycle is NEVER a generic-expense candidate', !exp.candidates.some((c) => c.label.startsWith('Test Card')));
  assert('1d. the BNPL repayment is NEVER a generic-expense candidate', !exp.candidates.some((c) => c.label.startsWith('Afterpay')));
  assert('1e. the loan repayment is NEVER a generic-expense candidate', !exp.candidates.some((c) => c.label.startsWith('Home Loan')));
  assert('1f. the ordinary-bill candidate carries NO repayment metadata (one-sided only)', exp.candidates[0].isRepayment === false && exp.candidates[0].expectedCents === undefined);

  // Category relevance both ways.
  const gymPay = deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 3), amount: 150, categoryId: 'cat-health' });
  assert('1k. a Health/gym-category expense IS offered the Gym bill (matching category)', gymPay.candidates.length === 1 && gymPay.candidates[0].label.startsWith('Gym'));
  const groceries = deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 3), amount: 80, categoryId: 'cat-groceries' });
  assert('1l. a Groceries expense matches NEITHER Rent NOR Gym (no unrelated prompt — the exact device failure)', groceries.candidates.length === 0);

  // Window narrowing (§7): a routine expense far from any due date shows nothing.
  const far = deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 15), amount: 900, categoryId: 'cat-rent' });
  assert('1g. a routine expense far from every due date surfaces no candidate (no over-prompt)', far.candidates.length === 0);

  // A bill with NO authoritative category never interrupts a generic expense.
  const nocat = { ...data, recurringItems: [{ id: 'mystery', type: 'expense', label: 'Mystery', amount: 40, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true } as RecurringItem] };
  const nocatRes = deriveOccurrenceCandidates(nocat, { type: 'expense', date: iso(2026, 8, 3), amount: 40, categoryId: 'cat-groceries' });
  assert('1m. a bill with NO authoritative category is never offered (saves independently)', nocatRes.candidates.length === 0);

  // A dangling repayment liability must NOT block recording and must NOT be
  // offered — an otherwise valid same-category ordinary bill still surfaces.
  const bad = { ...data, recurringItems: [...data.recurringItems, { id: 'loanX', type: 'expense', label: 'Broken Loan', amount: 100, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true, linkedLiabilityId: 'missing', categoryId: 'cat-rent' } as RecurringItem] };
  const badRes = deriveOccurrenceCandidates(bad, { type: 'expense', date: iso(2026, 8, 3), amount: 900, categoryId: 'cat-rent' });
  assert('1h. a dangling repayment liability is never offered as a candidate', !badRes.candidates.some((c) => c.label.startsWith('Broken Loan')));
  assert('1i. the dangling source does NOT block recording (ordinary bill still offered)', badRes.candidates.some((c) => c.label.startsWith('Rent')));
  assert('1j. the dangling source is reported as a NON-blocking informational issue', badRes.issues.some((i) => i.sourceId === 'loanX') && !badRes.issues.some((i) => i.kind === 'invalid_transaction'));
}

console.log('\n=== §7 candidate-prompt frequency + §6 invalid-data UX ===');
{
  let data = createEmptyAppData();
  data = {
    ...data,
    liabilities: [{ id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 200 } as Liability],
    recurringItems: [
      { id: 'wage', type: 'income', label: 'Salary', amount: 2000, frequency: 'monthly', nextDueDate: iso(2026, 8, 25), isFixed: false, active: true } as RecurringItem,
      { id: 'rent', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: iso(2026, 8, 3), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
    ],
    creditCards: [{ id: 'card1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 150 } as CreditCard],
  };
  // §7 — routine recording is NOT interrupted excessively.
  assert('5a. cat-rent expense on 15 Aug (rent due 3 Aug is >3 days away) → NO prompt (window)', deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 15), amount: 60, categoryId: 'cat-rent' }).candidates.length === 0);
  assert('5b. ordinary card purchase while the card cycle is "due" → NO prompt (cards never generic candidates)', deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 20), amount: 40, categoryId: 'cat-shopping' }).candidates.length === 0);
  assert('5c. a bonus near payday → salary IS offered (customer can keep it separate)', deriveOccurrenceCandidates(data, { type: 'income', date: iso(2026, 8, 24), amount: 500 }).candidates.some((c) => c.label.startsWith('Salary')));
  assert('5d. a manual salary near payday → salary offered so it can satisfy the scheduled income', deriveOccurrenceCandidates(data, { type: 'income', date: iso(2026, 8, 25), amount: 2000 }).candidates.some((c) => c.label.startsWith('Salary')));
  assert('5e. a manual RENT payment (cat-rent) on the due date → the Rent bill is offered', deriveOccurrenceCandidates(data, { type: 'expense', date: iso(2026, 8, 3), amount: 900, categoryId: 'cat-rent' }).candidates.some((c) => c.label.startsWith('Rent')));

  // §6 — invalid data.
  const malformedBill = { ...data, recurringItems: [...data.recurringItems, { id: 'badbill', type: 'expense', label: 'Broken', amount: 10, frequency: 'monthly', nextDueDate: 'not-a-date', isFixed: true, active: true, categoryId: 'cat-groceries' } as RecurringItem] };
  const g = deriveOccurrenceCandidates(malformedBill, { type: 'expense', date: iso(2026, 8, 3), amount: 50, categoryId: 'cat-groceries' });
  assert('6a. valid grocery + unrelated MALFORMED bill → the malformed bill is not offered and does not block', !g.candidates.some((c) => c.label.startsWith('Broken')) && !g.issues.some((i) => i.kind === 'invalid_transaction'));
  const malformedIncome = { ...data, recurringItems: data.recurringItems.map((r) => (r.id === 'wage' ? { ...r, nextDueDate: 'nope' } : r)) };
  const bonusRes = deriveOccurrenceCandidates(malformedIncome, { type: 'income', date: iso(2026, 8, 24), amount: 500 });
  assert('6b. valid income + malformed scheduled income → records (malformed income not offered, no block)', !bonusRes.candidates.length && !bonusRes.issues.some((i) => i.kind === 'invalid_transaction'));
  assert('6c. an invalid manual transaction (bad date) itself blocks with invalid_transaction', deriveOccurrenceCandidates(data, { type: 'expense', date: 'garbage', amount: 50, categoryId: 'cat-rent' }).issues.some((i) => i.kind === 'invalid_transaction'));
  const mixed = deriveOccurrenceCandidates(malformedBill, { type: 'expense', date: iso(2026, 8, 3), amount: 900, categoryId: 'cat-rent' });
  assert('6d. valid + invalid candidates present → the valid bill is offered, the invalid one skipped, no block', mixed.candidates.some((c) => c.label.startsWith('Rent')) && !mixed.candidates.some((c) => c.label.startsWith('Broken')) && !mixed.issues.some((i) => i.kind === 'invalid_transaction'));
}

console.log('\n=== sub-monthly identity stability through real source edits ===');
{
  // A weekly income linked at its 5 Apr 2026 occurrence (DST-end day).
  const linkedId = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wk', occurrenceDate: D(2026, 4, 5), cadence: 'sub_monthly' });
  let data: AppData = {
    ...createEmptyAppData(),
    recurringItems: [{ id: 'wk', type: 'income', label: 'Casual pay', amount: 300, frequency: 'weekly', nextDueDate: iso(2026, 4, 5), isFixed: false, active: true } as RecurringItem],
    transactions: [{ id: 'txw', type: 'income', amount: 300, categoryId: 'c', date: iso(2026, 4, 5), occurrenceResolution: { version: 1, state: 'linked', occurrenceId: linkedId } } as Transaction],
  };
  const occ = { id: linkedId, sourceKind: 'income' as const, sourceId: 'wk', isRepayment: false };
  const stillSatisfied = (d: AppData) => resolveOccurrence(occ, d.transactions).state === 'satisfied';
  const linkUnchanged = (d: AppData) => (d.transactions[0].occurrenceResolution as any)?.occurrenceId === linkedId;

  assert('2a. baseline: the linked weekly occurrence is satisfied', stillSatisfied(data) && linkUnchanged(data));

  const edits: [string, Partial<RecurringItem>][] = [
    ['label change', { label: 'Weekend shift' }],
    ['amount change', { amount: 350 }],
    ['due-date change (reschedule to a different weekday)', { nextDueDate: iso(2026, 4, 7) }],
    ['anchor adjustment (irrelevant to weekly, must not fork)', { scheduleAnchorDay: 15 }],
    ['recurrence-setting edit within sub-monthly (weekly→fortnightly)', { frequency: 'fortnightly' }],
  ];
  let d = data;
  for (const [name, patch] of edits) {
    d = editItem(d, 'wk', patch);
    assert(`2b. ${name}: linked occurrence id unchanged and still satisfied (no fork/disappear)`, linkUnchanged(d) && stillSatisfied(d));
  }
}

console.log('\n=== sub-monthly identity is deterministic across boundaries/DST ===');
{
  // Re-deriving the SAME occurrence date always yields the same id, and distinct
  // occurrences differ — across month, year, leap and both DST transitions.
  const data = createEmptyAppData();
  const item = { id: 'wk', type: 'income', label: 'x', amount: 100, frequency: 'weekly', nextDueDate: iso(2026, 1, 1), isFixed: false, active: true } as RecurringItem;
  const dd = { ...data, recurringItems: [item] };
  const idFor = (dt: Date) => occurrenceIdForRecurringItem(dd, item, dt);
  assert('3a. DST-end 5 Apr 2026 is stable and re-derivable', idFor(D(2026, 4, 5)) === idFor(D(2026, 4, 5)) && idFor(D(2026, 4, 5))!.endsWith('2026-04-05'));
  assert('3b. DST-start 4 Oct 2026 is stable', idFor(D(2026, 10, 4))!.endsWith('2026-10-04'));
  assert('3c. leap day 29 Feb 2028 keys correctly', idFor(D(2028, 2, 29))!.endsWith('2028-02-29'));
  assert('3d. year boundary — 31 Dec vs 1 Jan differ', idFor(D(2026, 12, 31)) !== idFor(D(2027, 1, 1)));
  assert('3e. month boundary — 31 Jan vs 1 Feb differ', idFor(D(2026, 1, 31)) !== idFor(D(2026, 2, 1)));
}

console.log('\n=== monthly due-day edit keeps ONE cycle (no fork) ===');
{
  const data = createEmptyAppData();
  const item = { id: 'card-item', type: 'expense', label: 'Bill', amount: 60, frequency: 'monthly', nextDueDate: iso(2026, 8, 25), isFixed: true, active: true } as RecurringItem;
  const dd = { ...data, recurringItems: [item] };
  const id25 = occurrenceIdForRecurringItem(dd, item, D(2026, 8, 25));
  // Edit the due day within August (simulate updateRecurringItem changing nextDueDate to the 28th).
  const edited = editItem(dd, 'card-item', { nextDueDate: iso(2026, 8, 28) });
  const editedItem = edited.recurringItems[0];
  const id28 = occurrenceIdForRecurringItem(edited, editedItem, D(2026, 8, 28));
  assert('4a. a monthly due-day move within August maps to the SAME cycle id', id25 === id28);
  // 29/30/31 clamping does not fork a monthly cycle.
  assert('4b. Feb clamp (any day) stays one Feb cycle', occurrenceIdForRecurringItem(dd, item, D(2026, 2, 28)) === occurrenceIdForRecurringItem(dd, item, D(2026, 2, 1)));
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
