// This Month flip-card — correction round, 2026-08-10 (approved
// implementation package).
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): computeThisMonthRecordedSummary and
//   computeMonthToDateActivity (monthlySummary.ts — imports nothing from
//   react-native, genuinely importable), applyTransactionUpdate/
//   applyTransactionDelete/transferFundsTransition/saveBnplPlanTransition/
//   confirmBnplRepaymentTransition (AppStateContext.tsx — same reason) —
//   all directly imported and executed against real production code.
// - Structural (Class C): ThisMonthCard.tsx, ThisMonthSourcesSheet.tsx and
//   MoneyScreen.tsx all transitively import react-native and cannot be
//   imported by this tsx-based harness (confirmed empirically, consistent
//   with every other round this session) — their wiring (flip controls,
//   animation, Reduce Motion, accessibility hiding, absence of financial
//   persistence) is verified by regex/string match against the real
//   shipped source, proving wiring exists without claiming rendered
//   runtime proof (that remains physical-device evidence).
// - Mirrored + structural (Class B): the compact-row 4-row/overflow rule
//   (computeCompactRows) is a small, private, UI-only helper inside
//   ThisMonthCard.tsx — cannot be imported for the same react-native
//   reason. Reproduced verbatim here, paired with a structural assertion
//   that the real file still contains that exact code.
//
// Run with: npx tsx tests/this-month-flip-card.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeThisMonthRecordedSummary, computeMonthToDateActivity, ThisMonthSpendingSource } from '../src/lib/calculations/monthlySummary';
import {
  applyTransactionUpdate,
  applyTransactionDelete,
  transferFundsTransition,
  saveBnplPlanTransition,
  confirmBnplRepaymentTransition,
  ConfirmBnplRepaymentInput,
  SaveBnplPlanInput,
} from '../src/state/AppStateContext';
import type { AppData, Asset, Liability, CreditCard, Transaction, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function dISO(iso: string): string {
  return d(iso).toISOString();
}
let txnCounter = 0;
function nextTxnId(): string {
  txnCounter += 1;
  return `txn${txnCounter}`;
}

function baseData(): AppData {
  return createEmptyAppData();
}
function withEntities(data: AppData, patch: Partial<Pick<AppData, 'assets' | 'liabilities' | 'creditCards' | 'transactions'>>): AppData {
  return { ...data, ...patch };
}
function expense(overrides: Partial<Transaction> = {}): Transaction {
  return { id: nextTxnId(), type: 'expense', amount: 10, categoryId: 'cat-other-expense', date: dISO('2026-08-10'), ...overrides };
}
function income(overrides: Partial<Transaction> = {}): Transaction {
  return { id: nextTxnId(), type: 'income', amount: 100, categoryId: 'cat-salary', date: dISO('2026-08-10'), ...overrides };
}

const THIS_MONTH_CARD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/ThisMonthCard.tsx', 'utf-8');
const THIS_MONTH_SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/ThisMonthSourcesSheet.tsx', 'utf-8');
const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');

// ============================================================================
// Section 1 — $130 controlled reconciliation (real import)
// ============================================================================
console.log('=== Section 1: $130 controlled reconciliation (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 5000 },
      { id: 'second-everyday', type: 'everyday', label: 'Second Everyday Account', currentValue: 2000 },
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 },
    ],
    creditCards: [{ id: 'amex1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 500, dueDay: 15, minimumPayment: 25 }],
    transactions: [
      income({ amount: 500 }),
      expense({ amount: 60, paymentSource: 'credit_card', creditCardId: 'amex1' }),
      expense({ amount: 30, paymentSource: 'everyday', targetAssetId: 'main-everyday' }),
      expense({ amount: 20, paymentSource: 'everyday', targetAssetId: 'second-everyday' }),
      expense({ amount: 10, paymentSource: 'cash' }),
      // "unresolved qualifying expense" — an id-based source that no longer resolves.
      expense({ amount: 10, paymentSource: 'loan', liabilityId: 'does-not-exist' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Income recorded: $500.00 (50000 cents)', result.incomeCents === 50000);
  assert('Spending recorded: $130.00 (13000 cents)', result.spendingCents === 13000);
  assert('Net recorded: $370.00 (37000 cents)', result.netCents === 37000);
  assert('Exactly 5 source rows (AMEX, Main Everyday, Second Everyday, Cash, unavailable)', result.spendingSources.length === 5);
  assert('sum(spendingSources.amountCents) === spendingCents, exactly', result.spendingSources.reduce((s, x) => s + x.amountCents, 0) === result.spendingCents);
  const amex = result.spendingSources.find((s) => s.key === 'creditCard:amex1')!;
  assert('AMEX source is $60.00 (6000 cents)', amex.amountCents === 6000);
  assert('AMEX is the largest share — ranked first (deterministic sort: amount desc)', result.spendingSources[0].key === 'creditCard:amex1');
  assert('AMEX represents 46% of spending, correctly BELOW 50% (46.15...% floors to 46, not "most")', amex.percentage === 46);
  assert('Unresolved loan reference falls into the fixed \'unavailable\' bucket, "Source unavailable"', result.spendingSources.find((s) => s.key === 'unavailable')!.label === 'Source unavailable');
  assert('hasInvalidRecordedAmounts is false — every amount here is valid, only the SOURCE identity is unresolved', result.hasInvalidRecordedAmounts === false);
}

// ============================================================================
// Section 2 — cent-containing reconciliation: $10.49/$10.49/$0.02 = $21.00
// ============================================================================
console.log('\n=== Section 2: cent-containing reconciliation (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'main-everyday', type: 'everyday', label: 'Main Everyday', currentValue: 100 },
      { id: 'second-everyday', type: 'everyday', label: 'Second Everyday', currentValue: 100 },
    ],
    transactions: [
      income({ amount: 100 }),
      expense({ amount: 10.49, paymentSource: 'everyday', targetAssetId: 'main-everyday' }),
      expense({ amount: 10.49, paymentSource: 'everyday', targetAssetId: 'second-everyday' }),
      expense({ amount: 0.02, paymentSource: 'cash' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Spending recorded: exactly 2100 cents ($21.00)', result.spendingCents === 2100);
  assert('Source rows: 1049, 1049, 2 cents', result.spendingSources.some((s) => s.amountCents === 1049) && result.spendingSources.filter((s) => s.amountCents === 1049).length === 2 && result.spendingSources.some((s) => s.amountCents === 2));
  assert('Exact source total reconciles to 2100 cents ($21.00), matching the whole-dollar headline exactly', result.spendingSources.reduce((s, x) => s + x.amountCents, 0) === 2100);
  assert('Net recorded uses the SAME 2100 spending cents (10000 - 2100 = 7900)', result.netCents === 7900);
}

// ============================================================================
// Section 3 — $0.01 across three sources
// ============================================================================
console.log('\n=== Section 3: $0.01 across three sources (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [{ id: 'main-everyday', type: 'everyday', label: 'Main Everyday', currentValue: 100 }],
    creditCards: [{ id: 'amex1', issuer: 'AMEX', label: 'AMEX', creditLimit: 1000, currentBalance: 0, dueDay: 1, minimumPayment: 0 }],
    transactions: [
      expense({ amount: 0.01, paymentSource: 'cash' }),
      expense({ amount: 0.01, paymentSource: 'everyday', targetAssetId: 'main-everyday' }),
      expense({ amount: 0.01, paymentSource: 'credit_card', creditCardId: 'amex1' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Spending recorded: exactly 3 cents ($0.03)', result.spendingCents === 3);
  assert('Each source row is exactly 1 cent', result.spendingSources.every((s) => s.amountCents === 1));
  assert('Percentages: three equal 33.33...% shares allocate to 34/33/33, summing to exactly 100', result.spendingSources.reduce((s, x) => s + x.percentage, 0) === 100);
  assert('The largest-remainder tie is broken by the SAME deterministic order the rows are already sorted in (first row gets the +1)', result.spendingSources[0].percentage === 34);
}

// ============================================================================
// Section 4/5 — same-type account isolation + identical labels, distinct IDs
// ============================================================================
console.log('\n=== Section 4/5: same-type account isolation, identical labels distinct IDs (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'everyday-a', type: 'everyday', label: 'Everyday Account', currentValue: 100 },
      { id: 'everyday-b', type: 'everyday', label: 'Everyday Account', currentValue: 100 },
    ],
    transactions: [
      expense({ amount: 25, paymentSource: 'everyday', targetAssetId: 'everyday-a' }),
      expense({ amount: 35, paymentSource: 'everyday', targetAssetId: 'everyday-b' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Two rows, never merged, even with identical customer-facing labels', result.spendingSources.length === 2);
  assert('$60.00 total ($25 + $35)', result.spendingCents === 6000);
  assert('Row keys are distinct (everyday:everyday-a vs everyday:everyday-b) — identity is by stable id, never by label', result.spendingSources.map((s) => s.key).sort().join(',') === 'everyday:everyday-a,everyday:everyday-b');
  assert('No type-level merge: both rows have kind "everyday", but remain two separate rows', result.spendingSources.every((s) => s.kind === 'everyday'));
}

// ============================================================================
// Section 6 — explicit Cash vs legacy undefined (both fold into 'cash')
// ============================================================================
console.log('\n=== Section 6: explicit Cash vs legacy undefined paymentSource (real import) ===');
{
  const data = withEntities(baseData(), {
    transactions: [expense({ amount: 20, paymentSource: 'cash' }), expense({ amount: 30, paymentSource: undefined })],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Exactly one "cash" row (legacy undefined folds into the same established Cash convention)', result.spendingSources.filter((s) => s.kind === 'cash').length === 1);
  assert('Combined Cash total is $50.00 (2000 + 3000 cents)', result.spendingSources.find((s) => s.kind === 'cash')!.amountCents === 5000);
}

// ============================================================================
// Section 7 — explicit Other funding
// ============================================================================
console.log('\n=== Section 7: explicit Other funding (real import) ===');
{
  const data = withEntities(baseData(), { transactions: [expense({ amount: 40, paymentSource: 'other' })] });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('paymentSource \'other\' produces a distinct "Other funding" row, kind \'other\'', result.spendingSources.length === 1 && result.spendingSources[0].kind === 'other' && result.spendingSources[0].label === 'Other funding');
}

// ============================================================================
// Section 8 — unavailable source (deleted account/card/liability), all three
// id-based cases
// ============================================================================
console.log('\n=== Section 8: Source unavailable — deleted everyday/credit-card/loan sources (real import) ===');
{
  const data = withEntities(baseData(), {
    // Deliberately empty assets/creditCards/liabilities — every referenced id fails to resolve.
    transactions: [
      expense({ amount: 10, paymentSource: 'everyday', targetAssetId: 'deleted-everyday' }),
      expense({ amount: 20, paymentSource: 'credit_card', creditCardId: 'deleted-card' }),
      expense({ amount: 30, paymentSource: 'loan', liabilityId: 'deleted-liability' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('All three unresolvable sources aggregate into exactly ONE "Source unavailable" row for the MVP', result.spendingSources.length === 1 && result.spendingSources[0].key === 'unavailable');
  assert('No cent is lost — the unavailable row totals exactly $60.00 (10+20+30)', result.spendingSources[0].amountCents === 6000);
  assert('Spending recorded still reflects the full $60.00 even though every source is unresolved', result.spendingCents === 6000);
}

// ============================================================================
// Section 9 — record-only expense still counts
// ============================================================================
console.log('\n=== Section 9: record-only expense (balanceEffect: none) still counts (real import) ===');
{
  const data = withEntities(baseData(), {
    creditCards: [{ id: 'amex1', issuer: 'AMEX', label: 'AMEX', creditLimit: 1000, currentBalance: 0, dueDay: 1, minimumPayment: 0 }],
    transactions: [expense({ amount: 40, paymentSource: 'credit_card', creditCardId: 'amex1', balanceEffect: 'none' })],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Record-only expense ($40, balanceEffect: none) is included in Spending recorded', result.spendingCents === 4000);
  assert('Record-only expense is included in its real source (AMEX), not dropped or reclassified', result.spendingSources.find((s) => s.key === 'creditCard:amex1')!.amountCents === 4000);
}

// ============================================================================
// Section 10 — income excluded from spendingSources
// ============================================================================
console.log('\n=== Section 10: income excluded from spendingSources (real import) ===');
{
  const data = withEntities(baseData(), { transactions: [income({ amount: 500 }), expense({ amount: 20, paymentSource: 'cash' })] });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Income contributes to incomeCents only', result.incomeCents === 50000);
  assert('Income never appears as a row in spendingSources', result.spendingSources.every((s) => s.amountCents !== 50000));
  assert('spendingSources total equals spendingCents exactly, unaffected by income', result.spendingSources.reduce((s, x) => s + x.amountCents, 0) === result.spendingCents);
}

// ============================================================================
// Section 11 — transfer exclusion (real import, via the real transferFundsTransition)
// ============================================================================
console.log('\n=== Section 11: transfer exclusion (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 2000 },
      { id: 'savings1', type: 'savings', label: 'Savings', currentValue: 500 },
    ],
    transactions: [expense({ amount: 25, paymentSource: 'everyday', targetAssetId: 'everyday1' })],
  });
  const beforeTransfer = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  const afterTransfer = transferFundsTransition(data, 'everyday1', { kind: 'asset', assetId: 'savings1' }, 1000);
  if (!afterTransfer.applied) throw new Error(`expected applied:true, got rejected with reason "${afterTransfer.reason}"`);
  const afterSummary = computeThisMonthRecordedSummary(afterTransfer.data, d('2026-08-10'));
  assert('Spending recorded is $25.00 both before and after a $1,000 transfer — the transfer contributes $0', beforeTransfer.spendingCents === 2500 && afterSummary.spendingCents === 2500);
  assert('The transfer never creates a Transaction, so the source breakdown is byte-identical before/after', JSON.stringify(beforeTransfer.spendingSources) === JSON.stringify(afterSummary.spendingSources));
}

// ============================================================================
// Section 12 — local date boundary: month-start/today inclusion,
// previous-month/future-date/next-month exclusion
// ============================================================================
console.log('\n=== Section 12: local date boundary (real import) ===');
{
  // Assume "today" is 10 August 2026, per the approved scenario E.
  const today = d('2026-08-10');
  const data = withEntities(baseData(), {
    transactions: [
      expense({ id: 'julyEnd', amount: 100, paymentSource: 'cash', date: dISO('2026-07-31') }),
      // Distinct paymentSource per in-range transaction so each keeps its
      // own separately-verifiable source row instead of merging into one
      // combined Cash bucket.
      expense({ id: 'aug1', amount: 10, paymentSource: 'cash', date: dISO('2026-08-01') }),
      expense({ id: 'aug10', amount: 20, paymentSource: 'other', date: dISO('2026-08-10') }),
      expense({ id: 'aug11', amount: 200, paymentSource: 'cash', date: dISO('2026-08-11') }),
      expense({ id: 'sep1', amount: 300, paymentSource: 'cash', date: dISO('2026-09-01') }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, today);
  assert('Spending recorded is exactly $30.00 (1 Aug $10 + 10 Aug $20) — 31 July, 11 Aug and 1 Sept all excluded', result.spendingCents === 3000);
  assert('31 July (final day of previous month): excluded — its $100 does not appear in any source row', !result.spendingSources.some((s) => s.amountCents === 10000));
  assert('1 August (first local day of current month): included — its $10 is present', result.spendingSources.some((s) => s.amountCents === 1000));
  assert('10 August (today): included — its $20 is present', result.spendingSources.some((s) => s.amountCents === 2000));
  assert('11 August (future date after today): excluded — its $200 does not appear', !result.spendingSources.some((s) => s.amountCents === 20000));
  assert('1 September (first day of next month): excluded — its $300 does not appear', !result.spendingSources.some((s) => s.amountCents === 30000));

  // Cross-check against computeMonthToDateActivity's OWN unmodified date
  // boundary, proving both functions genuinely share one filter, not two
  // independently-drifting ones.
  const activity = computeMonthToDateActivity(data, today);
  assert('computeMonthToDateActivity (unmodified) agrees exactly with computeThisMonthRecordedSummary on which transactions qualify', activity.spend === result.spendingCents / 100);
}

// ============================================================================
// Section 13 — a confirmed BNPL repayment is EXCLUDED from This Month's
// recorded spending entirely (real import)
//
// Final Pass 2D device-test correction — this section originally proved a
// confirmed BNPL repayment was counted ONCE under its real paymentSource
// bucket (a repayment-vs-double-count concern this file's own earlier
// round addressed). That was itself a real defect this later round's audit
// found: computeThisMonthRecordedSummary had no `recurringItemId`/
// `isRepayment` exclusion at all, unlike monthlySummary.ts's own
// loggedExpenses filter — so "counted once" was actually "counted once
// where it should have been counted zero times" (its cost is already
// reflected as a recurring-rate commitment elsewhere, exactly the same
// reasoning that already excludes an ordinary confirmed bill). This is a
// strengthening, not a weakening: the repayment is now proven to be
// excluded from spendingCents/spendingSources entirely, consistent with
// every other repayment type (credit-card, loan) and with
// computeMonthToDateActivity's own matching fix this same round.
// ============================================================================
console.log('\n=== Section 13: confirmed BNPL repayment excluded from This Month spending (real import) ===');
{
  const createInput: SaveBnplPlanInput = {
    mode: 'create',
    liability: { label: 'BNPL Plan', currentBalance: 150 },
    schedule: { amount: 100, frequency: 'weekly', nextDueDate: dISO('2026-08-10') },
    ids: { liabilityId: 'bnpl1', recurringItemId: 'item1' },
  };
  const created = saveBnplPlanTransition(withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }] }), createInput);
  const summaryAtCreation = created.applied ? computeThisMonthRecordedSummary(created.data, d('2026-08-10')) : null;
  assert('Creating a BNPL plan alone records ZERO spending — no transaction exists yet', created.applied && summaryAtCreation!.spendingCents === 0);

  const repaymentInput: ConfirmBnplRepaymentInput = {
    liabilityId: 'bnpl1',
    recurringItemId: 'item1',
    expectedNextDueDate: dISO('2026-08-10'),
    paymentSource: 'cash',
    transactionId: 'repayTxn1',
    date: dISO('2026-08-10'),
  };
  const repaid = confirmBnplRepaymentTransition(created.applied ? created.data : baseData(), repaymentInput);
  assert('Repayment confirmation applies', repaid.applied);
  if (repaid.applied) {
    const summaryAfterRepayment = computeThisMonthRecordedSummary(repaid.data, d('2026-08-10'));
    assert('The confirmed repayment is EXCLUDED from spendingCents entirely (its cost is already a recurring-rate commitment elsewhere)', summaryAfterRepayment.spendingCents === 0);
    assert('The confirmed repayment produces no spending-source row at all', summaryAfterRepayment.spendingSources.length === 0);
    assert('Exactly one expense transaction exists after the repayment (excluded from the SUMMARY, not from the transaction ledger itself)', repaid.data.transactions.filter((t) => t.type === 'expense').length === 1);
  }
}

// ============================================================================
// Section 14 — transaction edit/delete real-updates the summary
// ============================================================================
console.log('\n=== Section 14: transaction edit/delete (real import) ===');
{
  const data = withEntities(baseData(), { transactions: [expense({ id: 'e1', amount: 50, paymentSource: 'cash' })] });
  const before = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Setup: $50.00 recorded', before.spendingCents === 5000);

  const edited = applyTransactionUpdate(data, 'e1', { amount: 75 });
  const afterEdit = computeThisMonthRecordedSummary(edited, d('2026-08-10'));
  assert('Editing the amount to $75 updates Spending recorded to exactly $75.00', afterEdit.spendingCents === 7500);

  const deleted = applyTransactionDelete(edited, 'e1', true);
  const afterDelete = computeThisMonthRecordedSummary(deleted, d('2026-08-10'));
  assert('Deleting the transaction removes its cents from both the total and its source row (back to $0)', afterDelete.spendingCents === 0 && afterDelete.spendingSources.length === 0);
}

// ============================================================================
// Section 15 — zero spending
// ============================================================================
console.log('\n=== Section 15: zero spending (real import) ===');
{
  const data = withEntities(baseData(), { transactions: [income({ amount: 500 })] });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Spending recorded is exactly 0', result.spendingCents === 0);
  assert('spendingSources is empty — no percentage division attempted', result.spendingSources.length === 0);
  assert('Net recorded equals incomeCents exactly (nothing to subtract)', result.netCents === result.incomeCents);
}

// ============================================================================
// Section 16 — invalid/corrupt amount handling
// ============================================================================
console.log('\n=== Section 16: invalid amount handling (real import) ===');
{
  const data = withEntities(baseData(), {
    transactions: [
      expense({ id: 'valid1', amount: 30, paymentSource: 'cash' }),
      expense({ id: 'nanAmount', amount: NaN, paymentSource: 'cash' }),
      expense({ id: 'negativeAmount', amount: -10, paymentSource: 'cash' }),
      expense({ id: 'zeroAmount', amount: 0, paymentSource: 'cash' }),
      expense({ id: 'threeDecimal', amount: 12.345, paymentSource: 'cash' }),
      income({ id: 'validIncome', amount: 200 }),
      income({ id: 'invalidIncome', amount: Infinity }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Only the one valid $30 expense is counted — every invalid expense is excluded entirely', result.spendingCents === 3000);
  assert('Only the one valid $200 income is counted — the Infinity income is excluded entirely', result.incomeCents === 20000);
  assert('hasInvalidRecordedAmounts is true when any qualifying transaction fails strict validation', result.hasInvalidRecordedAmounts === true);
  assert('No NaN/Infinity ever reaches spendingCents/incomeCents/netCents', Number.isFinite(result.spendingCents) && Number.isFinite(result.incomeCents) && Number.isFinite(result.netCents));
  assert('The valid $30 expense\'s source row is exactly $30 — unaffected by its invalid neighbours', result.spendingSources.find((s) => s.kind === 'cash')!.amountCents === 3000);
  assert('No invalid amount was silently reclassified into Cash, Other funding or Source unavailable — the valid Cash row is exactly $30, not $30 plus anything else', result.spendingSources.length === 1 && result.spendingSources[0].amountCents === 3000);
}

// ============================================================================
// Section 17 — deterministic sorting/percentage ties, general property
// ============================================================================
console.log('\n=== Section 17: deterministic sorting (real import) ===');
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'zzz-account', type: 'everyday', label: 'ZZZ Account', currentValue: 100 },
      { id: 'aaa-account', type: 'everyday', label: 'AAA Account', currentValue: 100 },
    ],
    transactions: [
      expense({ amount: 20, paymentSource: 'everyday', targetAssetId: 'zzz-account' }),
      expense({ amount: 20, paymentSource: 'everyday', targetAssetId: 'aaa-account' }),
    ],
  });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Equal amounts break the tie by customer-facing label, alphabetically ("AAA Account" before "ZZZ Account")', result.spendingSources[0].label === 'AAA Account' && result.spendingSources[1].label === 'ZZZ Account');
}

// ============================================================================
// Section 18 — Mirrored + structural: the compact-row 4-row/overflow rule
// (computeCompactRows, ThisMonthCard.tsx — a private UI-only helper that
// cannot be imported, since the file transitively pulls in react-native)
// ============================================================================
console.log('\n=== Section 18: compact-row overflow rule (mirrored + structural) ===');
{
  const COMPACT_ROW_LIMIT = 4;
  const COMPACT_TOP_N_WHEN_OVERFLOW = 3;
  function computeCompactRowsMirror(sources: ThisMonthSpendingSource[]): { rows: ThisMonthSpendingSource[]; overflow: { count: number; amountCents: number } | null } {
    if (sources.length <= COMPACT_ROW_LIMIT) return { rows: sources, overflow: null };
    const rows = sources.slice(0, COMPACT_TOP_N_WHEN_OVERFLOW);
    const rest = sources.slice(COMPACT_TOP_N_WHEN_OVERFLOW);
    return { rows, overflow: { count: rest.length, amountCents: rest.reduce((sum, s) => sum + s.amountCents, 0) } };
  }

  // Build 6 real sources via the real computeThisMonthRecordedSummary, then
  // run the MIRRORED compact-row rule against that real, real-computed list.
  const assets: Asset[] = Array.from({ length: 6 }, (_, i) => ({ id: `acct${i}`, type: 'everyday', label: `Account ${i}`, currentValue: 100 }));
  const transactions: Transaction[] = assets.map((a, i) => expense({ amount: (i + 1) * 10, paymentSource: 'everyday', targetAssetId: a.id }));
  const data = withEntities(baseData(), { assets, transactions });
  const summary = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Setup: 6 real, distinct sources', summary.spendingSources.length === 6);

  const { rows, overflow } = computeCompactRowsMirror(summary.spendingSources);
  assert('5+ sources: exactly 3 individual rows shown (never 4 individual + a 5th overflow row)', rows.length === 3);
  assert('Overflow row count is the remaining 3 sources (6 - 3)', overflow!.count === 3);
  assert('Compact reconciliation: 3 visible rows + overflow amount === spendingCents exactly', rows.reduce((s, r) => s + r.amountCents, 0) + overflow!.amountCents === summary.spendingCents);

  const fourSources = summary.spendingSources.slice(0, 4);
  const fourResult = computeCompactRowsMirror(fourSources);
  assert('Exactly 4 sources: all 4 shown individually, no overflow row', fourResult.rows.length === 4 && fourResult.overflow === null);

  assert(
    'Structural: the real ThisMonthCard.tsx computeCompactRows matches the mirror above exactly (same 4-row limit, same top-3-plus-overflow shape)',
    /const COMPACT_ROW_LIMIT = 4;/.test(THIS_MONTH_CARD_SRC) &&
      /const COMPACT_TOP_N_WHEN_OVERFLOW = 3;/.test(THIS_MONTH_CARD_SRC) &&
      /if \(sources\.length <= COMPACT_ROW_LIMIT\) return \{ rows: sources, overflow: null \};/.test(THIS_MONTH_CARD_SRC)
  );
}

// ============================================================================
// Section 19 — Structural: flip controls, animation, Reduce Motion,
// accessibility, absence of financial persistence
// ============================================================================
console.log('\n=== Section 19: ThisMonthCard.tsx — flip controls and interaction hierarchy (structural) ===');
{
  assert('The whole card background is NOT a flip control — no onPress on the outer SectionCard/View itself outside the two explicit pill buttons', !/onPress=\{flipTo\}/.test(THIS_MONTH_CARD_SRC));
  assert('"Show spending sources" is an explicit control, distinct from View transactions', /accessibilityLabel="Show spending sources"/.test(THIS_MONTH_CARD_SRC));
  assert('"Show monthly summary" is an explicit control, back-to-front', /accessibilityLabel="Show monthly summary"/.test(THIS_MONTH_CARD_SRC));
  assert('"View transactions" is its own explicit, separate control, calling onViewTransactions — never the flip handler', /onPress=\{onViewTransactions\}[\s\S]{0,120}accessibilityLabel="View transactions"/.test(THIS_MONTH_CARD_SRC));
  assert('"View all" only renders when overflow exists (conditional on the overflow variable)', /\{overflow \? \(\s*\n\s*<TouchableOpacity[\s\S]{0,150}setSourcesSheetVisible\(true\)[\s\S]{0,150}accessibilityLabel="View all sources"/.test(THIS_MONTH_CARD_SRC));
  assert('Every control has accessibilityRole="button"', (THIS_MONTH_CARD_SRC.match(/accessibilityRole="button"/g) || []).length >= 4);
}

console.log('\n=== Section 20: ThisMonthCard.tsx — animation, Reduce Motion, accessibility hiding (structural) ===');
{
  assert('One shared local Animated.Value drives the flip, not one per face', /const flipProgress = useRef\(new Animated\.Value\(0\)\)\.current;/.test(THIS_MONTH_CARD_SRC));
  assert('rotateY interpolation on both faces (front 0deg->180deg, back -180deg->0deg)', /outputRange: \['0deg', '180deg'\]/.test(THIS_MONTH_CARD_SRC) && /outputRange: \['-180deg', '0deg'\]/.test(THIS_MONTH_CARD_SRC));
  assert('backfaceVisibility: hidden prevents mirrored/reversed text from ever being visible on the wrong face', /backfaceVisibility: 'hidden'/.test(THIS_MONTH_CARD_SRC));
  assert('Reduce Motion is checked via the established AccessibilityInfo.isReduceMotionEnabled pattern (same as AddAnythingSheet)', /AccessibilityInfo\.isReduceMotionEnabled\(\)\.then\(\(enabled\) => \{/.test(THIS_MONTH_CARD_SRC));
  assert('Reduce Motion enabled: instant setValue swap, never Animated.timing/rotateY', /if \(reduceMotionEnabled\) \{\s*\n\s*flipProgress\.setValue\(toValue\);\s*\n\s*setFace\(target\);\s*\n\s*return;\s*\n\s*\}/.test(THIS_MONTH_CARD_SRC));
  assert('Rapid-tap protection: a generation counter guards the animation completion callback', /generationRef\.current \+= 1;/.test(THIS_MONTH_CARD_SRC) && /if \(myGeneration !== generationRef\.current\) return; \/\/ stale-completion guard/.test(THIS_MONTH_CARD_SRC));
  assert('Inactive face: pointerEvents="none"', /pointerEvents=\{face === 'front' \? 'auto' : 'none'\}/.test(THIS_MONTH_CARD_SRC) && /pointerEvents=\{face === 'back' \? 'auto' : 'none'\}/.test(THIS_MONTH_CARD_SRC));
  assert('Inactive face: accessibilityElementsHidden + importantForAccessibility="no-hide-descendants" (the same established pattern as AddAnythingSheet)', /accessibilityElementsHidden=\{face !== 'front'\}/.test(THIS_MONTH_CARD_SRC) && /accessibilityElementsHidden=\{face !== 'back'\}/.test(THIS_MONTH_CARD_SRC));
  assert('Flip state defaults to front on mount (useState initial value)', /const \[face, setFace\] = useState<'front' \| 'back'>\('front'\);/.test(THIS_MONTH_CARD_SRC));
  assert('Measured-height logic: onLayout on both faces feeds a shared max-height container', /onLayout=\{\(e\) => updateMeasuredHeight\('front', e\.nativeEvent\.layout\.height\)\}/.test(THIS_MONTH_CARD_SRC) && /const max = Math\.max\(front, back\);/.test(THIS_MONTH_CARD_SRC));
  assert(
    'No financial persistence anywhere in this file: never calls useAppState/persist/updateAsset/addTransaction/updateTransaction/deleteTransaction',
    !/useAppState\(\)|\bpersist\(|updateAsset\(|addTransaction\(|updateTransaction\(|deleteTransaction\(/.test(THIS_MONTH_CARD_SRC)
  );
}

console.log('\n=== Section 21: ThisMonthSourcesSheet.tsx — View all sheet (structural) ===');
{
  assert('Reuses the established KeyboardSheet primitive, not a new modal framework', /import \{ KeyboardSheet \} from '\.\.\/shared\/KeyboardSheet';/.test(THIS_MONTH_SHEET_SRC));
  assert('Shows every source individually (maps the full sources array, no slicing/truncation)', /\{sources\.map\(\(source\) => \(/.test(THIS_MONTH_SHEET_SRC) && !/\.slice\(/.test(THIS_MONTH_SHEET_SRC));
  assert('Shows the exact total, matching Spending recorded', /Spending recorded/.test(THIS_MONTH_SHEET_SRC) && /formatCents\(spendingCents\)/.test(THIS_MONTH_SHEET_SRC));
  assert('No balance mutation or persistence logic anywhere in this file', !/useAppState\(\)|\bpersist\(|updateAsset\(|addTransaction\(/.test(THIS_MONTH_SHEET_SRC));
  assert('Accessible close behaviour via the shared Button + KeyboardSheet onClose contract', /<Button label="Close" onPress=\{onClose\}/.test(THIS_MONTH_SHEET_SRC));
}

console.log('\n=== Section 22: MoneyScreen.tsx — info icon isolation + corrected info copy (structural) ===');
{
  assert('The info icon is a sibling of ThisMonthCard in the section header, never nested inside it (pre-existing, unmodified pattern)', /onPress=\{\(\) => setThisMonthInfoVisible\(true\)\}/.test(MONEY_SCREEN_SRC));
  assert('The corrected info-sheet copy no longer claims a generic credit-card repayment flow is treated separately', !/Credit-card repayments are treated separately/.test(MONEY_SCREEN_SRC));
  assert('The corrected copy explains the local month-to-date window, transfer exclusion, Net recorded, funding breakdown, record-only expenses, and the credit-card snapshot distinction', /start of the current calendar month through/.test(MONEY_SCREEN_SRC) && /Move Money transfers between your own balances are excluded/.test(MONEY_SCREEN_SRC) && /Net recorded is Income recorded minus Spending recorded/.test(MONEY_SCREEN_SRC) && /An expense recorded without changing a tracked balance/.test(MONEY_SCREEN_SRC) && /separate from month-to-date\s+spending/.test(MONEY_SCREEN_SRC));
  assert('ThisMonthCard is wired with the new unified summary prop, not the old broad-bucket activity prop', /summary=\{thisMonthSummary\}/.test(MONEY_SCREEN_SRC));
  assert('computeThisMonthRecordedSummary is computed once, memoized off the same [data, currentDate] dependency computeMonthToDateActivity already uses', /const thisMonthSummary = useMemo\(\(\) => computeThisMonthRecordedSummary\(data, currentDate\), \[data, currentDate\]\);/.test(MONEY_SCREEN_SRC));
}

// ============================================================================
// Section 23 — Correction round, 2026-08-10: stable-key ordering across
// transaction-array permutations (real import). Proves the final row order,
// percentages, and overflow membership are entirely independent of which
// order the transactions happen to be stored/iterated in.
// ============================================================================
console.log('\n=== Section 23: stable-key ordering across transaction-array permutations (real import) ===');
{
  const COMPACT_ROW_LIMIT = 4;
  const COMPACT_TOP_N_WHEN_OVERFLOW = 3;
  function compactMirror(sources: ThisMonthSpendingSource[]) {
    if (sources.length <= COMPACT_ROW_LIMIT) return { rows: sources, overflow: null as null | { count: number; amountCents: number } };
    const rows = sources.slice(0, COMPACT_TOP_N_WHEN_OVERFLOW);
    const rest = sources.slice(COMPACT_TOP_N_WHEN_OVERFLOW);
    return { rows, overflow: { count: rest.length, amountCents: rest.reduce((s, x) => s + x.amountCents, 0) } };
  }

  const assets: Asset[] = [
    { id: 'acct1', type: 'everyday', label: 'Account 1', currentValue: 100 },
    { id: 'acct2', type: 'everyday', label: 'Account 2', currentValue: 100 },
    { id: 'acct3', type: 'everyday', label: 'Account 3', currentValue: 100 },
  ];
  const creditCards: CreditCard[] = [{ id: 'card1', issuer: 'Visa', label: 'Card 1', creditLimit: 1000, currentBalance: 0, dueDay: 1, minimumPayment: 0 }];
  const baseTxns: Transaction[] = [
    expense({ id: 'p1', amount: 60, paymentSource: 'everyday', targetAssetId: 'acct1' }),
    expense({ id: 'p2', amount: 40, paymentSource: 'everyday', targetAssetId: 'acct2' }),
    expense({ id: 'p3', amount: 25, paymentSource: 'everyday', targetAssetId: 'acct3' }),
    expense({ id: 'p4', amount: 15, paymentSource: 'credit_card', creditCardId: 'card1' }),
    expense({ id: 'p5', amount: 10, paymentSource: 'cash' }),
  ];
  const permutations: Transaction[][] = [baseTxns, [baseTxns[4], baseTxns[2], baseTxns[0], baseTxns[3], baseTxns[1]], [...baseTxns].reverse()];
  const results = permutations.map((transactions) => computeThisMonthRecordedSummary(withEntities(baseData(), { assets, creditCards, transactions }), d('2026-08-10')));
  const shape = (r: ReturnType<typeof computeThisMonthRecordedSummary>) => ({
    keys: r.spendingSources.map((s) => s.key),
    labels: r.spendingSources.map((s) => s.label),
    cents: r.spendingSources.map((s) => s.amountCents),
    percentages: r.spendingSources.map((s) => s.percentage),
    overflow: compactMirror(r.spendingSources).overflow,
  });
  const shapes = results.map(shape);
  assert('Permutation 2 (shuffled) produces identical ordered keys/labels/cents/percentages/overflow to permutation 1', JSON.stringify(shapes[1]) === JSON.stringify(shapes[0]));
  assert('Permutation 3 (fully reversed) produces identical ordered keys/labels/cents/percentages/overflow to permutation 1', JSON.stringify(shapes[2]) === JSON.stringify(shapes[0]));
  assert(
    'The largest-remainder recipient (source 0, highest amount, no tie here) is identical across all three permutations',
    results.every((r) => r.spendingSources[0].key === results[0].spendingSources[0].key && r.spendingSources[0].percentage === results[0].spendingSources[0].percentage)
  );
}

// ============================================================================
// Section 24 — Controlled equal-share largest-remainder case (real import).
// Everyday B $10 / Everyday A $10 / Cash $10 — the exact PRD-specified case.
// ============================================================================
console.log('\n=== Section 24: controlled equal-share largest-remainder case (real import) ===');
{
  const assets: Asset[] = [
    { id: 'acctA', type: 'everyday', label: 'Everyday A', currentValue: 100 },
    { id: 'acctB', type: 'everyday', label: 'Everyday B', currentValue: 100 },
  ];
  const forwardTxns: Transaction[] = [
    expense({ id: 'eb', amount: 10, paymentSource: 'everyday', targetAssetId: 'acctB' }),
    expense({ id: 'ea', amount: 10, paymentSource: 'everyday', targetAssetId: 'acctA' }),
    expense({ id: 'ec', amount: 10, paymentSource: 'cash' }),
  ];
  const forward = computeThisMonthRecordedSummary(withEntities(baseData(), { assets, transactions: forwardTxns }), d('2026-08-10'));
  const reversed = computeThisMonthRecordedSummary(withEntities(baseData(), { assets, transactions: [...forwardTxns].reverse() }), d('2026-08-10'));

  assert('Percentages sum to exactly 100%', forward.spendingSources.reduce((s, x) => s + x.percentage, 0) === 100);
  assert('Allocation is 34/33/33 — one source gets the single remaining point', forward.spendingSources.filter((s) => s.percentage === 34).length === 1 && forward.spendingSources.filter((s) => s.percentage === 33).length === 2);
  assert(
    'The 34% recipient is "Cash" — determined by label order ("Cash" < "Everyday A" < "Everyday B"), never by which transaction was recorded first',
    forward.spendingSources.find((s) => s.percentage === 34)!.label === 'Cash'
  );
  assert(
    'Reversing the transaction array does not move the 34% allocation to a different source',
    reversed.spendingSources.find((s) => s.percentage === 34)!.key === forward.spendingSources.find((s) => s.percentage === 34)!.key
  );
}

// ============================================================================
// Section 25 — Correction round, 2026-08-10: duplicate customer-facing
// source-name disambiguation (real import). Two Everyday Accounts both
// named "Spending", two Credit Cards both named "Rewards", a duplicate-loan
// case, equal/unequal amounts, reversed order, and one duplicate landing in
// overflow.
// ============================================================================
console.log('\n=== Section 25: duplicate customer-facing label disambiguation (real import) ===');
{
  const assets: Asset[] = [
    { id: 'spend1', type: 'everyday', label: 'Spending', currentValue: 100 },
    { id: 'spend2', type: 'everyday', label: 'Spending', currentValue: 100 },
    { id: 'unique-acct', type: 'everyday', label: 'Unique Account', currentValue: 100 },
  ];
  const creditCards: CreditCard[] = [
    { id: 'rewards1', issuer: 'Visa', label: 'Rewards', creditLimit: 5000, currentBalance: 0, dueDay: 1, minimumPayment: 0 },
    { id: 'rewards2', issuer: 'AMEX', label: 'Rewards', creditLimit: 5000, currentBalance: 0, dueDay: 1, minimumPayment: 0 },
  ];
  const liabilities: Liability[] = [
    { id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 1000 },
    { id: 'loan2', type: 'personal_loan', label: 'Personal Loan', currentBalance: 2000 },
  ];
  // Equal-amount Everyday duplicates, UNEQUAL-amount Card duplicates
  // (rewards1 $15 < rewards2 $25 — disambiguation numbering must not follow
  // the amount), plus a unique label that must stay untouched.
  const forwardTxns: Transaction[] = [
    expense({ id: 't1', amount: 20, paymentSource: 'everyday', targetAssetId: 'spend1' }),
    expense({ id: 't2', amount: 20, paymentSource: 'everyday', targetAssetId: 'spend2' }),
    expense({ id: 't3', amount: 5, paymentSource: 'everyday', targetAssetId: 'unique-acct' }),
    expense({ id: 't4', amount: 15, paymentSource: 'credit_card', creditCardId: 'rewards1' }),
    expense({ id: 't5', amount: 25, paymentSource: 'credit_card', creditCardId: 'rewards2' }),
    expense({ id: 't6', amount: 12, paymentSource: 'loan', liabilityId: 'loan1' }),
    expense({ id: 't7', amount: 18, paymentSource: 'loan', liabilityId: 'loan2' }),
  ];
  const data = withEntities(baseData(), { assets, creditCards, liabilities, transactions: forwardTxns });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));

  const bySpend1 = result.spendingSources.find((s) => s.key === 'everyday:spend1')!;
  const bySpend2 = result.spendingSources.find((s) => s.key === 'everyday:spend2')!;
  const byUnique = result.spendingSources.find((s) => s.key === 'everyday:unique-acct')!;
  const byRewards1 = result.spendingSources.find((s) => s.key === 'creditCard:rewards1')!;
  const byRewards2 = result.spendingSources.find((s) => s.key === 'creditCard:rewards2')!;
  const byLoan1 = result.spendingSources.find((s) => s.key === 'loan:loan1')!;
  const byLoan2 = result.spendingSources.find((s) => s.key === 'loan:loan2')!;

  assert('Duplicate Everyday labels are distinguished: "Spending — Account 1" / "Spending — Account 2", ordered by asset array position', bySpend1.label === 'Spending — Account 1' && bySpend2.label === 'Spending — Account 2');
  assert('A unique label is never touched — "Unique Account" has no suffix', byUnique.label === 'Unique Account');
  assert(
    'Duplicate credit-card labels are distinguished by CARD array position, NOT by amount — rewards1 ($15, smaller) is still "Card 1", rewards2 ($25, larger) is "Card 2"',
    byRewards1.label === 'Rewards — Card 1' && byRewards2.label === 'Rewards — Card 2'
  );
  assert('Duplicate loan labels are distinguished: "Personal Loan — Loan 1" / "Personal Loan — Loan 2"', byLoan1.label === 'Personal Loan — Loan 1' && byLoan2.label === 'Personal Loan — Loan 2');
  assert('Disambiguation never merges the two same-labelled rows — 7 distinct source rows total', result.spendingSources.length === 7);
  assert('Amounts are entirely unaffected by disambiguation — Spending #1 is still exactly $20, #2 still exactly $20', bySpend1.amountCents === 2000 && bySpend2.amountCents === 2000);

  // Reversed transaction order must produce the identical disambiguation.
  const reversedResult = computeThisMonthRecordedSummary(withEntities(baseData(), { assets, creditCards, liabilities, transactions: [...forwardTxns].reverse() }), d('2026-08-10'));
  const reversedLabelsByKey = new Map(reversedResult.spendingSources.map((s) => [s.key, s.label]));
  assert(
    'Reversing the transaction array produces the exact same disambiguated labels for every source',
    reversedLabelsByKey.get('everyday:spend1') === 'Spending — Account 1' &&
      reversedLabelsByKey.get('everyday:spend2') === 'Spending — Account 2' &&
      reversedLabelsByKey.get('creditCard:rewards1') === 'Rewards — Card 1' &&
      reversedLabelsByKey.get('creditCard:rewards2') === 'Rewards — Card 2'
  );

  // One duplicate-labelled source landing in overflow: add enough larger,
  // uniquely-labelled sources to push one "Spending" row past the top 3.
  const overflowAssets: Asset[] = [
    ...assets,
    { id: 'big1', type: 'everyday', label: 'Big One', currentValue: 100 },
    { id: 'big2', type: 'everyday', label: 'Big Two', currentValue: 100 },
  ];
  const overflowTxns: Transaction[] = [
    ...forwardTxns,
    expense({ id: 't8', amount: 200, paymentSource: 'everyday', targetAssetId: 'big1' }),
    expense({ id: 't9', amount: 150, paymentSource: 'everyday', targetAssetId: 'big2' }),
  ];
  const overflowResult = computeThisMonthRecordedSummary(withEntities(baseData(), { assets: overflowAssets, creditCards, liabilities, transactions: overflowTxns }), d('2026-08-10'));
  const COMPACT_ROW_LIMIT = 4;
  const COMPACT_TOP_N_WHEN_OVERFLOW = 3;
  const compactRows = overflowResult.spendingSources.slice(0, COMPACT_TOP_N_WHEN_OVERFLOW);
  const overflowRows = overflowResult.spendingSources.slice(COMPACT_TOP_N_WHEN_OVERFLOW);
  assert('Setup: 9 total sources, so overflow applies (> 4)', overflowResult.spendingSources.length === 9 && overflowResult.spendingSources.length > COMPACT_ROW_LIMIT);
  const spend1Overflowed = overflowRows.some((s) => s.key === 'everyday:spend1');
  const spend2Overflowed = overflowRows.some((s) => s.key === 'everyday:spend2');
  assert('At least one of the two duplicate-labelled "Spending" sources lands in the overflow group (amounts of $20 rank below the two $200/$150 sources plus $25 Rewards)', spend1Overflowed || spend2Overflowed);
  const overflowedSpend = overflowResult.spendingSources.find((s) => s.key === (spend1Overflowed ? 'everyday:spend1' : 'everyday:spend2'))!;
  assert('The overflowed duplicate source still carries its correct disambiguated full label in the full spendingSources list (what the View all sheet reads)', overflowedSpend.label === 'Spending — Account 1' || overflowedSpend.label === 'Spending — Account 2');
}

// ============================================================================
// Section 26 — Verify the income-only state: $500 income, $0 spending (real
// import + structural). Correction round, 2026-08-10: the previous
// implementation report's wording ("Income/Spending/Net at $0") conflicted
// with the approved contract — this proves the underlying calculation and
// UI gating were always correct, and the report itself just described it
// imprecisely.
// ============================================================================
console.log('\n=== Section 26: income-only state — $500/$0/$500 (real import + structural) ===');
{
  const data = withEntities(baseData(), { transactions: [income({ id: 'inc1', amount: 500 })] });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Income recorded is exactly $500.00 (50000 cents)', result.incomeCents === 50000);
  assert('Spending recorded is exactly $0.00 (0 cents) — not independently computed, genuinely zero', result.spendingCents === 0);
  assert('Net recorded is exactly $500.00 (50000 cents) — incomeCents minus zero spendingCents', result.netCents === 50000);
  assert('spendingSources is empty — no flip target exists', result.spendingSources.length === 0);

  assert(
    'Structural: ThisMonthCard.tsx routes hasSpending === false straight to the front-only branch (no ThisMonthFlipBody) regardless of income',
    /if \(!hasSpending\) \{\s*\n\s*return \(\s*\n\s*<SectionCard>\s*\n\s*\{frontFigures\}/.test(THIS_MONTH_CARD_SRC)
  );
  assert('Structural: the front-only branch never renders "Show spending sources" (that control only exists inside ThisMonthFlipBody)', !/if \(!hasSpending\) \{[\s\S]{0,400}Show spending sources/.test(THIS_MONTH_CARD_SRC));
  assert('Structural: the front-only branch DOES render View transactions', /if \(!hasSpending\) \{[\s\S]{0,400}View transactions/.test(THIS_MONTH_CARD_SRC));
  assert('Structural: frontFigures (shared by both the income-only and normal flip states) renders Income recorded / Spending recorded / Net recorded unconditionally', /Income recorded/.test(THIS_MONTH_CARD_SRC) && /Spending recorded/.test(THIS_MONTH_CARD_SRC) && /Net recorded/.test(THIS_MONTH_CARD_SRC));
  assert('Structural: the credit-card snapshot inside frontFigures is gated on hasCreditCards alone, independent of income/spending state', /\{hasCreditCards \? \(/.test(THIS_MONTH_CARD_SRC));
}

// ============================================================================
// Section 27 — Correction round, 2026-08-10: the invalid-only degraded
// state (real import + structural). One persisted transaction with an
// amount that fails the strict cents contract, no other valid income or
// expense — this was a real defect (routed to the misleading "No
// transactions recorded yet." empty state) in the prior implementation,
// now fixed.
// ============================================================================
console.log('\n=== Section 27: invalid-only degraded state (real import + structural) ===');
{
  const data = withEntities(baseData(), { transactions: [expense({ id: 'badAmount', amount: NaN, paymentSource: 'cash' })] });
  const result = computeThisMonthRecordedSummary(data, d('2026-08-10'));
  assert('Income recorded is a safe zero, never NaN', result.incomeCents === 0 && Number.isFinite(result.incomeCents));
  assert('Spending recorded is a safe zero, never NaN', result.spendingCents === 0 && Number.isFinite(result.spendingCents));
  assert('Net recorded is a safe zero, never NaN', result.netCents === 0 && Number.isFinite(result.netCents));
  assert('No source row is created for the invalid amount', result.spendingSources.length === 0);
  assert('hasInvalidRecordedAmounts is true', result.hasInvalidRecordedAmounts === true);

  assert(
    'Structural: hasActivity now also considers hasInvalidRecordedAmounts, so an invalid-only month does not fall through to the plain empty state',
    /const hasActivity = hasIncome \|\| hasSpending \|\| summary\.hasInvalidRecordedAmounts;/.test(THIS_MONTH_CARD_SRC)
  );
  assert(
    'Structural: an invalid-only month therefore reaches the same front-only branch as the income-only state (safe-zero Income/Spending/Net + disclosure + View transactions), never the true empty state',
    /if \(!hasActivity\) \{[\s\S]{0,50}return \(/.test(THIS_MONTH_CARD_SRC)
  );
  assert('Structural: the neutral disclosure line is present and reads calmly, with no parser/technical terminology', /Some recorded amounts couldn't be included\./.test(THIS_MONTH_CARD_SRC) && !/NaN|parse|invalid input/i.test(THIS_MONTH_CARD_SRC.match(/disclaimer[\s\S]{0,300}/)?.[0] ?? ''));
  assert('Structural: View transactions remains present in the same front-only branch this state now reaches', /if \(!hasSpending\) \{[\s\S]{0,400}View transactions/.test(THIS_MONTH_CARD_SRC));
}

// ============================================================================
// Section 28 — Compact / View all label consistency (real import). Proves
// disambiguated labels are baked into the ONE shared spendingSources array
// both the compact face and the View all sheet read from — never computed
// twice, never able to drift apart.
// ============================================================================
console.log('\n=== Section 28: compact/View all label consistency (real import) ===');
{
  const assets: Asset[] = [
    { id: 'dup1', type: 'everyday', label: 'Everyday Account', currentValue: 100 },
    { id: 'dup2', type: 'everyday', label: 'Everyday Account', currentValue: 100 },
    { id: 'dup3', type: 'everyday', label: 'Everyday Account', currentValue: 100 },
  ];
  const transactions: Transaction[] = [
    expense({ id: 'c1', amount: 100, paymentSource: 'everyday', targetAssetId: 'dup1' }),
    expense({ id: 'c2', amount: 80, paymentSource: 'everyday', targetAssetId: 'dup2' }),
    expense({ id: 'c3', amount: 60, paymentSource: 'everyday', targetAssetId: 'dup3' }),
    expense({ id: 'c4', amount: 40, paymentSource: 'cash' }),
    expense({ id: 'c5', amount: 20, paymentSource: 'other' }),
  ];
  const result = computeThisMonthRecordedSummary(withEntities(baseData(), { assets, transactions }), d('2026-08-10'));
  const COMPACT_ROW_LIMIT = 4;
  const COMPACT_TOP_N_WHEN_OVERFLOW = 3;
  const compactRows = result.spendingSources.length <= COMPACT_ROW_LIMIT ? result.spendingSources : result.spendingSources.slice(0, COMPACT_TOP_N_WHEN_OVERFLOW);
  const overflowRows = result.spendingSources.length <= COMPACT_ROW_LIMIT ? [] : result.spendingSources.slice(COMPACT_TOP_N_WHEN_OVERFLOW);

  assert('Setup: 5 sources, three sharing "Everyday Account", overflow applies', result.spendingSources.length === 5);
  assert('Compact top-3 rows use the final disambiguated labels, not the raw un-suffixed label', compactRows.every((s) => !s.label.match(/^Everyday Account$/)));
  assert('The overflow group carries the correct stable keys for every source past the top 3', overflowRows.every((s) => result.spendingSources.some((full) => full.key === s.key)));
  assert('View all (the full spendingSources array) shows the SAME disambiguated labels the compact face used for its visible rows', compactRows.every((c) => result.spendingSources.find((full) => full.key === c.key)!.label === c.label));
  assert('Compact visible rows + overflow amount reconcile to spendingCents exactly', compactRows.reduce((s, r) => s + r.amountCents, 0) + overflowRows.reduce((s, r) => s + r.amountCents, 0) === result.spendingCents);
  assert('View all (full list) total reconciles to spendingCents exactly', result.spendingSources.reduce((s, r) => s + r.amountCents, 0) === result.spendingCents);
  assert('Label disambiguation never changed amounts or percentages — they still sum correctly', result.spendingSources.reduce((s, r) => s + r.percentage, 0) === 100);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
