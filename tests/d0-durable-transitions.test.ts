// Pass D0 — Durable Editor Completion Foundation. Pure, real-import proofs of the
// deterministic transitions behind the four shared editors, their idempotency
// (the basis of "a retry creates exactly one result"), the linked-record deletion
// guard, and the fact that D0 changed NO financial rule.
// Durability itself (write-first, rejection, restart, concurrency) needs the real
// provider and storage adapter: see tests/rendered/d0-durable-editors.render.test.tsx.
// Run with: npx tsx tests/d0-durable-transitions.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import {
  DurableMutationRefused,
  addAssetTransition,
  addCreditCardTransition,
  addLiabilityTransition,
  addRecurringItemTransition,
  confirmLoanRepaymentTransition,
  deleteAssetTransition,
  deleteCreditCardTransition,
  deleteLiabilityGuardedTransition,
  deleteRecurringItemTransition,
  findLiabilityDeletionBlocker,
  reverseLoanRepaymentTransaction,
  syncIncomeAggregate,
  updateAssetTransition,
  updateCreditCardTransition,
  updateLiabilityTransition,
  updateRecurringItemTransition,
} from '../src/state/AppStateContext';
import { EDITOR_DELETE_FAILED_COPY, EDITOR_SAVE_FAILED_COPY, EDITOR_DELETING_LABEL, EDITOR_SAVING_LABEL, linkedRepaymentDeletionCopy } from '../src/lib/editorCompletion';
import { computeRankedReminder } from '../src/lib/calculations/reminders';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeAccessibleNetWorth } from '../src/lib/calculations/wealthDefinitions';
import { localDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const FROZEN_NOW = new Date(2026, 8, 21, 10, 0).getTime();
Date.now = () => FROZEN_NOW;
const TODAY = new Date(2026, 8, 21);
const NOW_ISO = new Date(FROZEN_NOW).toISOString();
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true, ...extra } as RecurringItem);

function fixture(): AppData {
  const d = { ...createEmptyAppData() };
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset,
    { id: 'Home', type: 'property', label: 'Home', currentValue: 800000 } as Asset,
  ];
  d.liabilities = [
    { id: 'mortgage', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability,
    { id: 'car', type: 'car_loan', label: 'Car', currentBalance: 20000 } as Liability,
    { id: 'personal', type: 'personal_loan', label: 'Personal', currentBalance: 5000 } as Liability,
    { id: 'other', type: 'other', label: 'Family loan', currentBalance: 1000 } as Liability,
    { id: 'zip', type: 'bnpl', label: 'Zip', currentBalance: 300 } as Liability,
  ];
  d.recurringItems = [
    item('salary', 'income', 4000, iso(2026, 9, 28), 'fortnightly', 'Salary boq'),
    item('rent', 'expense', 1000, iso(2026, 9, 28), 'weekly', 'Rent', { categoryId: 'cat-rent' }),
    item('richmond', 'expense', 3000, iso(2026, 10, 20), 'monthly', 'Richmond repayment', { linkedLiabilityId: 'mortgage' }),
    item('zip-pay', 'expense', 75, iso(2026, 9, 30), 'fortnightly', 'Zip', { linkedLiabilityId: 'zip', isFixed: false }),
  ];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30 } as unknown as CreditCard];
  d.liabilities = [...d.liabilities, { id: 'amex-mirror', type: 'credit_card', label: 'AMEX', currentBalance: 800, creditCardId: 'amex' } as Liability];
  return syncIncomeAggregate(d);
}
function figures(d: AppData) {
  const s = computeSafeToSpend(d, TODAY);
  const asOf = localDate(2026, 9, 21);
  const look = computeLookAheadProjection(d, asOf, localDate(2026, 10, 30));
  const guide = look.available ? computeDailyGuide(d, asOf, localDate(2026, 10, 30), look) : null;
  return JSON.stringify({ aup: buildAupExplanation(s).remainderCents, look: look.available ? look.targetCents : null, lowest: look.available ? look.lowest : null, guide: guide?.displayCents ?? null, netWorth: Math.round(computeAccessibleNetWorth(d) * 100), reminder: computeRankedReminder(d, TODAY)?.id ?? null });
}

console.log('=== §1 recurring income and bills ===');
{
  const d = fixture();
  const bill = { type: 'expense' as const, label: 'Gym', amount: 45, frequency: 'weekly' as const, nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-health' };
  const added = addRecurringItemTransition(d, bill, 'gym');
  assert('add bill: one new item with the caller-supplied stable id; everything else untouched', added.recurringItems.length === d.recurringItems.length + 1 && added.recurringItems.find((r) => r.id === 'gym')!.amount === 45 && added.assets === d.assets && added.transactions === d.transactions && added.liabilities === d.liabilities);
  assert('add bill RETRY with the same id returns the SAME object — idempotent, so a retry can only ever produce one record', addRecurringItemTransition(added, bill, 'gym') === added);
  const income = { type: 'income' as const, label: 'Dividends', amount: 1000, frequency: 'weekly' as const, nextDueDate: iso(2026, 9, 27), isFixed: false, active: true };
  const addedIncome = addRecurringItemTransition(d, income, 'div', { setAsMainPayday: true });
  assert('add income with "Use as my main payday": item and the single Main-payday identity change in ONE transition', addedIncome.recurringItems.some((r) => r.id === 'div') && addedIncome.user.mainPaydayIncomeId === 'div' && d.user.mainPaydayIncomeId === 'salary');
  const updated = updateRecurringItemTransition(d, 'rent', { amount: 1100 });
  assert('update bill: only that item changes; updating twice is a fixed point in value; updating a missing id returns the same object', updated.recurringItems.find((r) => r.id === 'rent')!.amount === 1100 && JSON.stringify(updateRecurringItemTransition(updated, 'rent', { amount: 1100 }).recurringItems) === JSON.stringify(updated.recurringItems) && updateRecurringItemTransition(d, 'nope', { amount: 1 }) === d);
  const deleted = deleteRecurringItemTransition(d, 'rent');
  assert('delete bill: removed once; deleting again returns the same object; recorded transactions are never touched', !deleted.recurringItems.some((r) => r.id === 'rent') && deleteRecurringItemTransition(deleted, 'rent') === deleted && deleted.transactions === d.transactions);
  const deletedMain = deleteRecurringItemTransition(d, 'salary');
  assert('delete the Main-payday income: the identity is cleared in the same transition (existing rule, unchanged)', deletedMain.user.mainPaydayIncomeId === null);
  assert('deactivate the Main-payday income: cleared too; an ineligible source is never made Main', updateRecurringItemTransition(d, 'salary', { active: false }).user.mainPaydayIncomeId === null && updateRecurringItemTransition(d, 'rent', {}, { setAsMainPayday: true }).user.mainPaydayIncomeId === 'salary');
}

console.log('\n=== §2 assets, liabilities (every subtype) and credit cards ===');
{
  const d = fixture();
  const added = addAssetTransition(d, { type: 'savings', label: 'Rainy day', currentValue: 500, includeInMoneyCalculations: false } as Omit<Asset, 'id'>, 'rainy');
  assert('add asset: one new asset with the stable id; retry is idempotent', added.assets.length === d.assets.length + 1 && addAssetTransition(added, { type: 'savings', label: 'Rainy day', currentValue: 500 } as Omit<Asset, 'id'>, 'rainy') === added);
  const edited = updateAssetTransition(d, 'Main', { currentValue: 9000 }, NOW_ISO);
  assert('update asset: routes through the existing manual-balance edit (balance $9,000.00); missing id returns the same object', edited.assets.find((a) => a.id === 'Main')!.currentValue === 9000 && updateAssetTransition(d, 'nope', { currentValue: 1 }, NOW_ISO) === d);
  const removed = deleteAssetTransition(d, 'Main');
  assert('delete asset: removed once; repeat returns the same object', !removed.assets.some((a) => a.id === 'Main') && deleteAssetTransition(removed, 'Main') === removed);
  for (const type of ['mortgage', 'car_loan', 'personal_loan', 'other', 'bnpl'] as Liability['type'][]) {
    const a = addLiabilityTransition(d, { type, label: `New ${type}`, currentBalance: 1234.56 } as Omit<Liability, 'id'>, `new-${type}`);
    const u = updateLiabilityTransition(a, `new-${type}`, { currentBalance: 1000 });
    const x = deleteLiabilityGuardedTransition(u, `new-${type}`);
    assert(`liability ${type}: add (idempotent) → update → delete of an UNLINKED liability all succeed; net worth returns exactly`, a.liabilities.length === d.liabilities.length + 1 && addLiabilityTransition(a, { type, label: 'x', currentBalance: 1 } as Omit<Liability, 'id'>, `new-${type}`) === a && u.liabilities.find((l) => l.id === `new-${type}`)!.currentBalance === 1000 && x.liabilities.length === d.liabilities.length && Math.round(computeAccessibleNetWorth(x) * 100) === Math.round(computeAccessibleNetWorth(d) * 100) && deleteLiabilityGuardedTransition(x, `new-${type}`) === x);
  }
  assert('renaming a liability still renames its unambiguous linked repayment (existing rule, unchanged)', updateLiabilityTransition(d, 'mortgage', { label: 'Brunswick' }).recurringItems.find((r) => r.id === 'richmond')!.label === 'Brunswick repayment');
  const cardAdded = addCreditCardTransition(d, { issuer: 'Visa', label: 'Visa', currentBalance: 100, creditLimit: 2000, dueDay: 12 } as unknown as Omit<CreditCard, 'id'>, 'visa');
  assert('add card: the card AND its one mirror liability, in one transition; retry idempotent', cardAdded.creditCards.length === 2 && cardAdded.liabilities.filter((l) => l.creditCardId === 'visa').length === 1 && addCreditCardTransition(cardAdded, { issuer: 'Visa', label: 'Visa', currentBalance: 100, creditLimit: 2000, dueDay: 12 } as unknown as Omit<CreditCard, 'id'>, 'visa') === cardAdded);
  const cardEdited = updateCreditCardTransition(d, 'amex', { currentBalance: 650 });
  assert('update card: card and mirror stay in lockstep ($650.00)', cardEdited.creditCards[0].currentBalance === 650 && cardEdited.liabilities.find((l) => l.creditCardId === 'amex')!.currentBalance === 650 && updateCreditCardTransition(d, 'nope', {}) === d);
  const cardGone = deleteCreditCardTransition(d, 'amex');
  assert('delete card: card and its mirror removed together (existing explicit behaviour); repeat returns the same object', cardGone.creditCards.length === 0 && !cardGone.liabilities.some((l) => l.creditCardId === 'amex') && deleteCreditCardTransition(cardGone, 'amex') === cardGone);
}

console.log('\n=== §3 linked-record deletion integrity ===');
{
  const d = fixture();
  const blocker = findLiabilityDeletionBlocker(d, 'mortgage');
  assert('a mortgage with a linked repayment names its blocker by structured link only', !!blocker && blocker.id === 'richmond' && blocker.label === 'Richmond repayment');
  let refused: unknown = null;
  try { deleteLiabilityGuardedTransition(d, 'mortgage'); } catch (e) { refused = e; }
  assert('…and the delete is REFUSED at the state layer (fail closed) with nothing changed', refused instanceof DurableMutationRefused && (refused as DurableMutationRefused).reason === 'linked_repayment');
  assert('an unlinked loan is deletable; no blocker is ever inferred from a name, amount or date', findLiabilityDeletionBlocker(d, 'car') === null && deleteLiabilityGuardedTransition(d, 'car').liabilities.some((l) => l.id === 'car') === false && findLiabilityDeletionBlocker({ ...d, recurringItems: [...d.recurringItems, item('lookalike', 'expense', 20000, iso(2026, 10, 1), 'monthly', 'Car repayment')] }, 'car') === null);
  const viaBill = deleteRecurringItemTransition(d, 'richmond');
  const thenLoan = deleteLiabilityGuardedTransition(viaBill, 'mortgage');
  assert('the correction route works: delete the linked bill first, then the loan — no cascade, nothing recreated, no dangling review reminder', !thenLoan.liabilities.some((l) => l.id === 'mortgage') && !thenLoan.recurringItems.some((r) => r.id === 'richmond') && !JSON.stringify(computeRankedReminder(thenLoan, new Date(2026, 9, 19))).includes('repayment_source_review'));
  const bnplGone = deleteLiabilityGuardedTransition(d, 'zip');
  assert('BNPL keeps its existing explicit behaviour: the plan is removed and its own schedule deactivated — never blocked, never left live', !bnplGone.liabilities.some((l) => l.id === 'zip') && bnplGone.recurringItems.find((r) => r.id === 'zip-pay')!.active === false);
  // Already-broken legacy link: C.5.2.1 fail-closed behaviour is preserved.
  const legacyBroken: AppData = { ...d, liabilities: d.liabilities.filter((l) => l.id !== 'mortgage'), recurringItems: d.recurringItems.map((r) => (r.id === 'richmond' ? { ...r, nextDueDate: iso(2026, 9, 22) } : r)) };
  const reminder = computeRankedReminder(legacyBroken, TODAY, (r) => r.recurringItemId !== 'richmond');
  assert('an already-broken legacy link still fails closed (review reminder, never "Mark as paid")', !!reminder && reminder.kind === 'repayment_source_review');
  // No historical transaction is deleted, and a recorded repayment still reverses exactly.
  const due = d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate;
  const paid = confirmLoanRepaymentTransition(d, { recurringItemId: 'richmond', liabilityId: 'mortgage', expectedNextDueDate: due, amount: 3000, paymentSource: 'everyday', targetAssetId: 'Main', updateBalance: true, newBalance: 299200, expectedCurrentBalance: 300000, transactionId: 'tx', date: NOW_ISO });
  if (!paid.applied) throw new Error('repayment rejected');
  const billDeleted = deleteRecurringItemTransition(paid.data, 'richmond');
  const undo = reverseLoanRepaymentTransaction(billDeleted, 'tx');
  assert('deleting the scheduled bill keeps its recorded repayment (never cascaded) and that repayment still reverses exactly: $10,650.00 and $300,000.00', billDeleted.transactions.some((t) => t.id === 'tx') && undo.applied && undo.data.assets.find((a) => a.id === 'Main')!.currentValue === 10650 && undo.data.liabilities.find((l) => l.id === 'mortgage')!.currentBalance === 300000 && !undo.data.recurringItems.some((r) => r.id === 'richmond'));
}

console.log('\n=== §4 no financial rule changed; copy ===');
{
  const d = fixture();
  const before = figures(d);
  assert('a refused or no-op transition leaves every derived figure identical (AUP, Look Ahead, lowest, daily guide, net worth, reminder)', figures(updateRecurringItemTransition(d, 'nope', { amount: 9 })) === before && figures(deleteAssetTransition(d, 'nope')) === before);
  const edited = updateRecurringItemTransition(d, 'rent', { amount: 1100 });
  assert('a successful edit takes effect ONLY through the existing engines (the editor computes nothing): Look Ahead to 30 Oct falls by exactly the extra $100 per weekly rent', (() => { const a = JSON.parse(before), b = JSON.parse(figures(edited)); return a.look - b.look === 5 * 10000 && a.netWorth === b.netWorth; })());
  assert('pending and failure copy', EDITOR_SAVING_LABEL === 'Saving…' && EDITOR_DELETING_LABEL === 'Deleting…' && EDITOR_SAVE_FAILED_COPY === 'We couldn’t save this change. Nothing was changed. Your details are still here — try again.' && EDITOR_DELETE_FAILED_COPY === 'We couldn’t delete this item. Nothing was changed. Try again.');
  assert('linked-loan copy names the bill', linkedRepaymentDeletionCopy('mortgage', 'Richmond repayment') === 'This mortgage is linked to Richmond repayment. Review the linked bill before deleting the mortgage.' && linkedRepaymentDeletionCopy('loan', 'Car repayment') === 'This loan is linked to Car repayment. Review the linked bill before deleting the loan.');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
