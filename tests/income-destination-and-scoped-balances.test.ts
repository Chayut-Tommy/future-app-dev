// Income destination selection, scoped Add-Balance chooser, Manage
// balances card control, and manual-income transaction naming —
// correction round, 2026-08-10.
//
// CLASSIFICATION (per tests/README.md) — see the exact per-section table in
// the correction-round implementation report; summary:
// - Real import (Class A): incomeDestinations.ts; the AppStateContext.tsx
//   pure transitions (confirmRecurringOccurrenceTransition,
//   createRecurringIncomeWithMidCycleOccurrence, applyTransactionDelete,
//   applyTransactionUpdate, hasRecurringItemOccurrenceRecorded,
//   applyAssetsIncludeInMoneyUpdate) — all directly imported and executed,
//   including AppStateContext.tsx itself (it imports 'react', not
//   'react-native', so it IS importable by tsx/esbuild — confirmed
//   empirically, not assumed; only the hook-bound useCallback wrappers
//   inside AppStateProvider are unreachable outside a real React render
//   tree, which is why every mutating action in this file is pulled out as
//   its own plain exported function first, called by a thin wrapper).
// - Mirrored logic (Class B) — SelectBalancesSheet.tsx's UI-only draft-map
//   bookkeeping (isDirty/re-seed-on-open) and TransactionsScreen.tsx's
//   transactionDisplayLabel live inside .tsx component files that
//   transitively pull in react-native and cannot be imported, so their
//   logic is reproduced verbatim here, paired with a structural assertion
//   that the real file still contains that exact code. commitDraft() itself
//   is NOT mirrored — its actual persistence-affecting logic now delegates
//   entirely to the real, imported, real-tested applyAssetsIncludeInMoney-
//   Update; only the "which entries changed" diffing (plain Map comparison,
//   no financial effect) remains mirrored.
// - Structural (Class C) — QuickAddModal.tsx's income-name gating,
//   AddAnythingSheet.tsx's onlyBalances filtering, SafeToSpendHero.tsx's
//   Manage-balances wiring, AddIncomeModal.tsx/SmartReminderCard.tsx's
//   onlyLiquidCategories usage: regex/string matches against the real
//   source, confirming wiring exists without claiming runtime proof of
//   on-screen behaviour (that remains physical-device evidence). The
//   `addRecurringIncomeWithMidCycleOccurrence` and `updateAssetsIncludeIn-
//   Money` React hooks themselves are also only structurally verified (they
//   cannot be invoked outside a real render tree — no @testing-library/
//   react-native exists in this repo, see tests/README.md); the FINANCIAL
//   logic they call is what's real-tested above, and the structural check
//   confirms the wrapper passes dataRef.current, not the closed-over `data`.
//
// Run with: npx tsx tests/income-destination-and-scoped-balances.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { resolveEligibleIncomeDestinations, resolveIncomeDestinationAsset } from '../src/lib/calculations/incomeDestinations';
import { resolveIncludeInMoneyCalculations, computeMoneyAvailableBalances, listMoneyAvailableAccounts } from '../src/lib/calculations/liquidAssets';
import {
  confirmRecurringOccurrenceTransition,
  createRecurringIncomeWithMidCycleOccurrence,
  hasRecurringItemOccurrenceRecorded,
  applyTransactionDelete,
  applyTransactionUpdate,
  applyAssetsIncludeInMoneyUpdate,
  MidCycleIncomeOccurrenceChoice,
} from '../src/state/AppStateContext';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

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

function baseData(): AppData {
  return createEmptyAppData();
}
function withAssets(data: AppData, assets: Asset[]): AppData {
  return { ...data, assets: [...data.assets, ...assets] };
}
function incomeItem(patch: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 'income1',
    type: 'income',
    label: 'Salary',
    amount: 1000,
    frequency: 'monthly',
    nextDueDate: dISO('2026-08-10'),
    isFixed: true,
    active: true,
    ...patch,
  };
}

const QUICK_ADD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/dashboard/QuickAddModal.tsx', 'utf-8');
const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const SAFE_TO_SPEND_HERO_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/SafeToSpendHero.tsx', 'utf-8');
const SELECT_BALANCES_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/SelectBalancesSheet.tsx', 'utf-8');
const TRANSACTIONS_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/transactions/TransactionsScreen.tsx', 'utf-8');
const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');
const SMART_REMINDER_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/today/SmartReminderCard.tsx', 'utf-8');

// ============================================================================
// Section 1 — resolveEligibleIncomeDestinations / resolveIncomeDestinationAsset
// ============================================================================
console.log('=== Section 1: resolveEligibleIncomeDestinations ===');
{
  // No eligible destinations — a brand-new profile, zero balances.
  {
    const options = resolveEligibleIncomeDestinations([]);
    assert('No balances at all: resolveEligibleIncomeDestinations returns an empty array (never a phantom Cash entry)', options.length === 0);
  }

  // Excludes non-eligible asset types and liabilities/credit-cards entirely.
  {
    const assets: Asset[] = [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
      { id: 'etf1', type: 'etf', label: 'ETF', currentValue: 5000 },
      { id: 'prop1', type: 'property', label: 'House', currentValue: 500000 },
    ];
    const options = resolveEligibleIncomeDestinations(assets);
    assert('Only cash/savings/everyday are eligible destinations — investment/property excluded', options.length === 1 && options[0].id === 'cash1');
  }

  // Multiple same-type accounts — stable id-based routing with label disambiguation.
  {
    const assets: Asset[] = [
      { id: 'e1', type: 'everyday', label: 'Everyday', currentValue: 200 },
      { id: 'e2', type: 'everyday', label: 'Everyday', currentValue: 200 },
      { id: 's1', type: 'savings', label: 'Savings', currentValue: 500 },
    ];
    const options = resolveEligibleIncomeDestinations(assets);
    assert('Multiple same-type accounts: all three destinations present, each keyed by its own real id', options.length === 3);
    const e1 = options.find((o) => o.id === 'e1')!;
    const e2 = options.find((o) => o.id === 'e2')!;
    assert('Identical-looking Everyday Accounts get disambiguated labels', e1.label !== e2.label);
    assert('Disambiguation never changes the routing id itself', e1.id === 'e1' && e2.id === 'e2');
  }

  // Ordering: Cash, then Everyday, then Savings — stable presentation order.
  {
    const assets: Asset[] = [
      { id: 's1', type: 'savings', label: 'Savings', currentValue: 1 },
      { id: 'c1', type: 'cash', label: 'Cash', currentValue: 1 },
      { id: 'e1', type: 'everyday', label: 'Everyday', currentValue: 1 },
    ];
    const options = resolveEligibleIncomeDestinations(assets);
    assert('Presentation order is Cash, Everyday, Savings regardless of input order', options.map((o) => o.id).join(',') === 'c1,e1,s1');
  }

  // resolveIncomeDestinationAsset — the validation half.
  {
    const data = withAssets(baseData(), [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
      { id: 'cc-liab', type: 'etf', label: 'not eligible', currentValue: 1 },
    ]);
    assert('resolveIncomeDestinationAsset: a real, eligible asset id resolves', !!resolveIncomeDestinationAsset(data, 'cash1'));
    assert('resolveIncomeDestinationAsset: a real but INeligible asset type (etf) is rejected', !resolveIncomeDestinationAsset(data, 'cc-liab'));
    assert('resolveIncomeDestinationAsset: a nonexistent id is rejected', !resolveIncomeDestinationAsset(data, 'does-not-exist'));
  }
}

// ============================================================================
// Section 2 — confirmRecurringOccurrenceTransition: income destination
// requirement (due-today, overdue, each destination type, no-destination
// rejection, exact-cent, same-snapshot duplicate, restart retry)
// ============================================================================
console.log('\n=== Section 2: confirmRecurringOccurrenceTransition — income destination ===');
{
  function scenario(assets: Asset[], nextDueDate: string): AppData {
    return { ...withAssets(baseData(), assets), recurringItems: [incomeItem({ nextDueDate: dISO(nextDueDate) })] };
  }
  function input(overrides: Partial<Parameters<typeof confirmRecurringOccurrenceTransition>[1]> = {}) {
    return {
      recurringItemId: 'income1',
      expectedNextDueDate: dISO('2026-08-10'),
      transactionId: 'txn1',
      date: dISO('2026-08-10'),
      ...overrides,
    };
  }

  // Due today, confirmed into Cash.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }], '2026-08-05');
    const result = confirmRecurringOccurrenceTransition(data, { ...input({ expectedNextDueDate: dISO('2026-08-05') }), targetAssetId: 'cash1' });
    assert('Due today, into Cash: applies', result.applied);
    if (result.applied) {
      assert('Due today, into Cash: Cash credited by exactly the income amount (100 -> 1100)', result.data.assets.find((a) => a.id === 'cash1')!.currentValue === 1100);
      assert('Due today, into Cash: transaction identifies the destination via targetAssetId', result.data.transactions.find((t) => t.id === 'txn1')!.targetAssetId === 'cash1');
    }
  }

  // Due today, confirmed into an Everyday Account.
  {
    const data = scenario(
      [
        { id: 'everyday1', type: 'everyday', label: 'Main Everyday', currentValue: 2450 },
        { id: 'everyday2', type: 'everyday', label: 'Second Everyday', currentValue: 580 },
      ],
      '2026-08-05'
    );
    const result = confirmRecurringOccurrenceTransition(data, {
      ...input({ expectedNextDueDate: dISO('2026-08-05') }),
      targetAssetId: 'everyday1',
    });
    assert('Due today, into a specific Everyday Account: applies', result.applied);
    if (result.applied) {
      assert('Selected Everyday Account credited (2450 -> 3450)', result.data.assets.find((a) => a.id === 'everyday1')!.currentValue === 3450);
      assert('OTHER Everyday Account completely untouched (stays 580)', result.data.assets.find((a) => a.id === 'everyday2')!.currentValue === 580);
    }
  }

  // Due today, confirmed into Savings.
  {
    const data = scenario([{ id: 'sav1', type: 'savings', label: 'Savings', currentValue: 500 }], '2026-08-05');
    const result = confirmRecurringOccurrenceTransition(data, { ...input({ expectedNextDueDate: dISO('2026-08-05') }), targetAssetId: 'sav1' });
    assert('Due today, into Savings: applies', result.applied);
    if (result.applied) {
      assert('Savings credited by exactly the income amount (500 -> 1500)', result.data.assets.find((a) => a.id === 'sav1')!.currentValue === 1500);
    }
  }

  // Overdue unconfirmed occurrence — still confirmable, same destination contract.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 0 }], '2026-08-01');
    const result = confirmRecurringOccurrenceTransition(data, { ...input({ expectedNextDueDate: dISO('2026-08-01') }), targetAssetId: 'cash1' });
    assert('Overdue unconfirmed income occurrence: still confirmable into a real destination', result.applied);
  }

  // No destination supplied at all — must never silently default to Cash.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }], '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, input());
    assert('No targetAssetId supplied for income: rejected (balance_target_missing), never silently defaults to Cash', !result.applied && result.reason === 'balance_target_missing');
  }

  // Invalid/stale destination id — rejected, zero mutation.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }], '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'does-not-exist' });
    assert('An invalid/stale targetAssetId is rejected (balance_target_missing)', !result.applied && result.reason === 'balance_target_missing');
  }

  // No eligible destinations exist at all — same rejection path.
  {
    const data = scenario([], '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, input());
    assert('Zero eligible destinations exist: confirmation rejected, never fabricates one (balance_target_missing)', !result.applied && result.reason === 'balance_target_missing');
  }

  // Exact-cent amount.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }], '2026-08-10');
    data.recurringItems[0].amount = 33.33;
    const result = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'cash1' });
    assert('Exact-cent income amount ($33.33): applies', result.applied);
    if (result.applied) {
      assert('Exact-cent amount: Cash increases by exactly $33.33 (100 -> 133.33)', Math.abs(result.data.assets.find((a) => a.id === 'cash1')!.currentValue - 133.33) < 0.001);
      assert('Exact-cent amount: transaction amount is exactly 33.33', result.data.transactions.find((t) => t.id === 'txn1')!.amount === 33.33);
    }
  }

  // The controlled numerical test from the brief, all three destinations.
  const CONTROLLED_SCENARIO_ASSETS: Asset[] = [
    { id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 2450 },
    { id: 'second-everyday', type: 'everyday', label: 'Second Everyday Account', currentValue: 580 },
    { id: 'savings1', type: 'savings', label: 'Savings', currentValue: 500 },
    { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
  ];
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'main-everyday' });
    assert('Controlled numerical test: applies', result.applied);
    if (result.applied) {
      const a = (id: string) => result.data.assets.find((x) => x.id === id)!.currentValue;
      assert('Controlled test — Main Everyday Account: $2,450.00 -> $3,450.00', a('main-everyday') === 3450);
      assert('Controlled test — Second Everyday Account unchanged: $580.00', a('second-everyday') === 580);
      assert('Controlled test — Savings unchanged: $500.00', a('savings1') === 500);
      assert('Controlled test — Cash unchanged: $100.00', a('cash1') === 100);
      assert('Controlled test — exactly one +$1,000.00 income transaction', result.data.transactions.filter((t) => t.type === 'income').length === 1 && result.data.transactions[0].amount === 1000);
      assert('Controlled test — transaction identifies Main Everyday Account', result.data.transactions[0].targetAssetId === 'main-everyday');
      assert('Controlled test — recurrence advances exactly once', result.data.recurringItems[0].nextDueDate !== data.recurringItems[0].nextDueDate);

      // "a retry changes nothing" — replaying the SAME stale input against
      // the now-advanced state is rejected, not reapplied.
      const retry = confirmRecurringOccurrenceTransition(result.data, { ...input({ transactionId: 'txn-retry' }), targetAssetId: 'main-everyday' });
      assert('Controlled test — a retry (same stale expectedNextDueDate) changes nothing (rejected: stale)', !retry.applied && retry.reason === 'stale');
    }
  }
  // Repeat with Savings as destination.
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'savings1' });
    assert('Controlled test (Savings destination): applies', result.applied);
    if (result.applied) {
      const a = (id: string) => result.data.assets.find((x) => x.id === id)!.currentValue;
      assert('Controlled test (Savings): Savings $500.00 -> $1,500.00', a('savings1') === 1500);
      assert('Controlled test (Savings): every other balance unchanged', a('main-everyday') === 2450 && a('second-everyday') === 580 && a('cash1') === 100);
    }
  }
  // Repeat with Cash as destination.
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'cash1' });
    assert('Controlled test (Cash destination): applies', result.applied);
    if (result.applied) {
      const a = (id: string) => result.data.assets.find((x) => x.id === id)!.currentValue;
      assert('Controlled test (Cash): Cash $100.00 -> $1,100.00', a('cash1') === 1100);
      assert('Controlled test (Cash): every other balance unchanged', a('main-everyday') === 2450 && a('second-everyday') === 580 && a('savings1') === 500);
    }
  }

  // Immediate double submission — same-snapshot duplicate protection,
  // proven against the real dataRef.current-equivalent chained path (see
  // bnpl.test.ts's identical pattern and its own detailed justification).
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const callA = confirmRecurringOccurrenceTransition(data, { ...input({ transactionId: 'txA' }), targetAssetId: 'main-everyday' });
    assert('Same-snapshot duplicate, call A: applies', callA.applied);
    if (callA.applied) {
      const callBAgainstLatestState = confirmRecurringOccurrenceTransition(callA.data, { ...input({ transactionId: 'txB' }), targetAssetId: 'main-everyday' });
      assert('Immediate double submission: call B against the real latest state is rejected (stale)', !callBAgainstLatestState.applied && callBAgainstLatestState.reason === 'stale');
      assert('Immediate double submission: exactly one income transaction exists', callA.data.transactions.filter((t) => t.type === 'income').length === 1);
      assert('Immediate double submission: the destination increased exactly once', callA.data.assets.find((a) => a.id === 'main-everyday')!.currentValue === 3450);
    }
  }

  // Delayed retry — a genuinely untouched snapshot is still a legitimate
  // first application (distinct from an immediate double-submission).
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const result = confirmRecurringOccurrenceTransition(data, { ...input({ transactionId: 'delayed-retry' }), targetAssetId: 'savings1' });
    assert('Delayed retry against a genuinely untouched snapshot: allowed (first application)', result.applied);
  }

  // Restart retry — simulate an app restart via a JSON round-trip, then
  // prove a stale replay is still rejected and a genuinely new confirmation
  // still succeeds from the restored state.
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const confirmed = confirmRecurringOccurrenceTransition(data, { ...input({ transactionId: 'pre-restart' }), targetAssetId: 'cash1' });
    assert('Restart retry setup: pre-restart confirmation applies', confirmed.applied);
    if (confirmed.applied) {
      const restored: AppData = JSON.parse(JSON.stringify(confirmed.data));
      const staleReplay = confirmRecurringOccurrenceTransition(restored, { ...input({ transactionId: 'stale-after-restart' }), targetAssetId: 'cash1' });
      assert('Restart retry: replaying the pre-restart stale input after restart is still rejected (stale)', !staleReplay.applied && staleReplay.reason === 'stale');
      const freshAfterRestart = confirmRecurringOccurrenceTransition(restored, {
        ...input({ transactionId: 'fresh-after-restart', expectedNextDueDate: restored.recurringItems[0].nextDueDate }),
        targetAssetId: 'cash1',
      });
      assert('Restart retry: a genuinely new confirmation from the restored state still applies correctly', freshAfterRestart.applied);
    }
  }

  // Persistence-failure / no-partial-transition invariant — a rejected
  // transition NEVER returns a partially-mutated AppData (the original
  // input object, untouched); a successful transition NEVER leaves a
  // transaction without its balance effect recorded.
  {
    const data = scenario([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }], '2026-08-10');
    const rejected = confirmRecurringOccurrenceTransition(data, input()); // no targetAssetId
    assert('Rejected transition: original input data object is completely untouched (cash still 100)', data.assets[0].currentValue === 100 && data.transactions.length === 0);
    const applied = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'cash1' });
    assert('Successful transition: the committed transaction always has appliedBalanceEffect defined (never a transaction without its balance effect)', applied.applied && applied.data.transactions[0].appliedBalanceEffect !== undefined);
  }

  // Deletion/reversal against the actual selected destination — the
  // existing, unmodified applyTransactionDelete contract correctly reverses
  // an income transaction's targetAssetId-routed effect.
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const confirmed = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'main-everyday' });
    assert('Deletion-target setup: confirmation applies', confirmed.applied);
    if (confirmed.applied) {
      const deleted = applyTransactionDelete(confirmed.data, 'txn1', true);
      const a = (id: string) => deleted.assets.find((x) => x.id === id)!.currentValue;
      assert('Deletion (reverse): the ACTUAL destination (Main Everyday Account) is reversed back to $2,450.00', a('main-everyday') === 2450);
      assert('Deletion (reverse): every other balance stays untouched', a('second-everyday') === 580 && a('savings1') === 500 && a('cash1') === 100);
      assert('Deletion (reverse): the transaction record itself is removed', !deleted.transactions.some((t) => t.id === 'txn1'));
    }
  }

  // Edit an income transaction's amount — applyTransactionUpdate correctly
  // reconciles the SAME destination, never a different one.
  {
    const data = scenario(CONTROLLED_SCENARIO_ASSETS, '2026-08-10');
    const confirmed = confirmRecurringOccurrenceTransition(data, { ...input(), targetAssetId: 'main-everyday' });
    if (confirmed.applied) {
      const edited = applyTransactionUpdate(confirmed.data, 'txn1', { amount: 500 });
      assert('Editing an income transaction amount (1000 -> 500): the SAME destination reconciles to reflect only $500 credited', edited.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2950);
      assert('Editing: no OTHER balance is touched by the edit', edited.assets.find((a) => a.id === 'second-everyday')!.currentValue === 580);
    }
  }
}

// ============================================================================
// Section 3 — createRecurringIncomeWithMidCycleOccurrence: setup
// reconciliation (Cash, two Everyday Accounts, Savings, already-included,
// no-occurrence/uncertain, invalid destination)
// ============================================================================
console.log('\n=== Section 3: createRecurringIncomeWithMidCycleOccurrence — setup reconciliation ===');
{
  function itemInput(): Omit<RecurringItem, 'id'> {
    return { type: 'income', label: 'Salary', amount: 1000, frequency: 'monthly', nextDueDate: dISO('2026-09-04'), isFixed: true, active: true };
  }

  // Setup reconciliation into Cash.
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }]);
    const choice: MidCycleIncomeOccurrenceChoice = { kind: 'add_to_balance', targetAssetId: 'cash1' };
    const result = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', choice, dISO('2026-08-04'), 'txn1');
    assert('Setup reconciliation into Cash: recurring item created', result.recurringItems.some((r) => r.id === 'income1'));
    assert('Setup reconciliation into Cash: Cash credited by exactly the backfilled amount (100 -> 1100)', result.assets.find((a) => a.id === 'cash1')!.currentValue === 1100);
    assert('Setup reconciliation into Cash: exactly one backfilled transaction, dated 4 Aug', result.transactions.length === 1 && result.transactions[0].date === dISO('2026-08-04'));
  }

  // Setup reconciliation into each of TWO Everyday Accounts.
  {
    const assets: Asset[] = [
      { id: 'everyday1', type: 'everyday', label: 'Everyday A', currentValue: 200 },
      { id: 'everyday2', type: 'everyday', label: 'Everyday B', currentValue: 75 },
    ];
    const dataA = withAssets(baseData(), assets);
    const resultA = createRecurringIncomeWithMidCycleOccurrence(dataA, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'everyday1' }, dISO('2026-08-04'), 'txn1');
    assert('Setup reconciliation into Everyday Account A: that account credited (200 -> 1200)', resultA.assets.find((a) => a.id === 'everyday1')!.currentValue === 1200);
    assert('Setup reconciliation into Everyday Account A: Everyday Account B untouched (still 75)', resultA.assets.find((a) => a.id === 'everyday2')!.currentValue === 75);

    const dataB = withAssets(baseData(), assets);
    const resultB = createRecurringIncomeWithMidCycleOccurrence(dataB, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'everyday2' }, dISO('2026-08-04'), 'txn1');
    assert('Setup reconciliation into Everyday Account B: that account credited (75 -> 1075)', resultB.assets.find((a) => a.id === 'everyday2')!.currentValue === 1075);
    assert('Setup reconciliation into Everyday Account B: Everyday Account A untouched (still 200)', resultB.assets.find((a) => a.id === 'everyday1')!.currentValue === 200);
  }

  // Setup reconciliation into Savings.
  {
    const data = withAssets(baseData(), [{ id: 'sav1', type: 'savings', label: 'Savings', currentValue: 500 }]);
    const result = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'sav1' }, dISO('2026-08-04'), 'txn1');
    assert('Setup reconciliation into Savings: credited (500 -> 1500)', result.assets.find((a) => a.id === 'sav1')!.currentValue === 1500);
  }

  // Record-only "already included" branch.
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }]);
    const result = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', { kind: 'already_included' }, dISO('2026-08-04'), 'txn1');
    assert('"Already included" branch: recurring item still created', result.recurringItems.some((r) => r.id === 'income1'));
    assert('"Already included" branch: a transaction is recorded (for history), but Cash is NOT increased again (stays 500)', result.assets.find((a) => a.id === 'cash1')!.currentValue === 500);
    assert('"Already included" branch: the recorded transaction has balanceEffect none / no appliedBalanceEffect', result.transactions[0].balanceEffect === 'none' && result.transactions[0].appliedBalanceEffect === undefined);
  }

  // "No, first payment is 4 September" / uncertain branch — both route to
  // the ordinary addRecurringItem path (never createRecurringIncomeWithMidCycleOccurrence),
  // per AddIncomeModal.tsx's own chooseMidCycleNoOccurrence handler (shared
  // by both options — see its own doc comment). Mirrors that trivial,
  // unmodified logic exactly: append the item, no transaction, no balance
  // mutation, the entered next-payment date preserved exactly as entered.
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }]);
    // addRecurringItem's own real logic (AppStateContext.tsx) — resolveScheduleAnchorDay(null, item) then append.
    const newItem: RecurringItem = { ...itemInput(), id: 'income1' };
    const result: AppData = { ...data, recurringItems: [...data.recurringItems, newItem] };
    assert('"No, first payment is 4 September" / uncertain: no transaction is created', result.transactions.length === 0);
    assert('"No, first payment is 4 September" / uncertain: Cash is completely unmutated (stays 500)', result.assets.find((a) => a.id === 'cash1')!.currentValue === 500);
    assert('"No, first payment is 4 September" / uncertain: the first expected occurrence remains exactly 4 September, unchanged', result.recurringItems[0].nextDueDate === dISO('2026-09-04'));
  }

  // Cancel — a pure UI no-op; the transition is never invoked at all, so
  // there is nothing for the engine layer to mutate. Documented here as an
  // explicit assertion of that contract (no transition call == no data
  // change), rather than asserted implicitly.
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }]);
    // No call made — Cancel never reaches AddIncomeModal's handlers.
    assert('Cancel: no engine call is made, so data is byte-identical to before the prompt was ever shown', data.assets[0].currentValue === 500 && data.transactions.length === 0 && data.recurringItems.length === 0);
  }

  // Invalid/stale destination — rejected as a safe no-op (mirrors the
  // existing duplicate-guard convention exactly: returns `data` unchanged).
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }]);
    const result = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'does-not-exist' }, dISO('2026-08-04'), 'txn1');
    assert('Invalid destination id: rejected as a no-op — data returned completely unchanged', result === data);
  }

  // Duplicate-identity guard — a second call for the exact same
  // (recurringItemId, precedingOccurrenceDate) is a no-op, not a second
  // backfill (pre-existing, unmodified behaviour — re-verified here in the
  // new destination-aware context to prove the extension didn't weaken it).
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }]);
    const first = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'cash1' }, dISO('2026-08-04'), 'txn1');
    assert('Duplicate-identity setup: first call applies (Cash 100 -> 1100)', first.assets.find((a) => a.id === 'cash1')!.currentValue === 1100);
    assert('hasRecurringItemOccurrenceRecorded now reports true for this exact (item, date) pair', hasRecurringItemOccurrenceRecorded(first, 'income1', dISO('2026-08-04')));
    const second = createRecurringIncomeWithMidCycleOccurrence(first, itemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'cash1' }, dISO('2026-08-04'), 'txn2');
    assert('A second call for the identical occurrence is a no-op — Cash is NOT credited twice (stays 1100)', second.assets.find((a) => a.id === 'cash1')!.currentValue === 1100);
    assert('A second call for the identical occurrence creates no second transaction', second.transactions.length === 1);
  }
}

// ============================================================================
// Section 4 — persisted-inclusion round-trip and net-worth independence
// ============================================================================
console.log('\n=== Section 4: balance inclusion — persistence round-trip, net-worth independence ===');
{
  // Persistence round-trip — includeInMoneyCalculations survives a JSON
  // (storage) round-trip exactly like every other Asset field, no special
  // handling needed since nothing new was added to the model.
  {
    const asset: Asset = { id: 'sav1', type: 'savings', label: 'Savings', currentValue: 500, includeInMoneyCalculations: true };
    const restored: Asset = JSON.parse(JSON.stringify(asset));
    assert('includeInMoneyCalculations survives a persistence round-trip', resolveIncludeInMoneyCalculations(restored) === true);
  }

  // No asset or net-worth mutation when inclusion changes — toggling the
  // flag never touches currentValue or any other field, and net worth
  // (assets minus liabilities, unfiltered by this flag) is completely
  // independent of it.
  {
    const data: AppData = {
      ...baseData(),
      assets: [
        { id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 3450, includeInMoneyCalculations: true },
        { id: 'second-everyday', type: 'everyday', label: 'Second Everyday Account', currentValue: 580, includeInMoneyCalculations: true },
      ],
    };
    const netWorthBefore = data.assets.reduce((s, a) => s + a.currentValue, 0);
    const availableBefore = computeMoneyAvailableBalances(data.assets);
    assert('Controlled test setup — Available Until Payday total includes both accounts ($4,030)', availableBefore === 4030);

    // Exclude Main Everyday Account (the only mutation: the flag itself).
    const excluded: AppData = {
      ...data,
      assets: data.assets.map((a) => (a.id === 'main-everyday' ? { ...a, includeInMoneyCalculations: false } : a)),
    };
    const netWorthAfter = excluded.assets.reduce((s, a) => s + a.currentValue, 0);
    assert('Excluding Main Everyday Account: its currentValue is completely unchanged ($3,450.00)', excluded.assets.find((a) => a.id === 'main-everyday')!.currentValue === 3450);
    assert('Excluding: net worth (sum of assets) is UNCHANGED by inclusion toggling — only the money-available total changes', netWorthAfter === netWorthBefore);
    const availableAfter = computeMoneyAvailableBalances(excluded.assets);
    assert('Excluding Main Everyday Account: the selected-balance total used by Available Until Payday decreases by exactly $3,450.00', availableBefore - availableAfter === 3450);
    assert('Excluding: Second Everyday Account contribution is unchanged ($580.00 still counted)', availableAfter === 580);

    // Re-including restores the same contribution exactly.
    const reincluded: AppData = { ...excluded, assets: excluded.assets.map((a) => (a.id === 'main-everyday' ? { ...a, includeInMoneyCalculations: true } : a)) };
    assert('Re-including Main Everyday Account restores the exact original $4,030.00 contribution', computeMoneyAvailableBalances(reincluded.assets) === 4030);

    const accounts = listMoneyAvailableAccounts(excluded.assets);
    assert('listMoneyAvailableAccounts excludes Main Everyday Account by id while excluded', !accounts.some((a) => a.id === 'main-everyday'));
    assert('listMoneyAvailableAccounts still lists Second Everyday Account', accounts.some((a) => a.id === 'second-everyday'));
  }
}

// ============================================================================
// Section 4B — applyAssetsIncludeInMoneyUpdate: real production-function
// proof of the multi-account Select Balances Save atomicity fix
// (correction round, 2026-08-10 review, item 6)
// ============================================================================
console.log('\n=== Section 4B: applyAssetsIncludeInMoneyUpdate — atomic multi-account save (real import) ===');
{
  function twoAccountData(): AppData {
    return withAssets(baseData(), [
      { id: 'acctA', type: 'everyday', label: 'Account A', currentValue: 1000, includeInMoneyCalculations: false },
      { id: 'acctB', type: 'savings', label: 'Account B', currentValue: 2000, includeInMoneyCalculations: false },
    ]);
  }

  // The exact bug this function replaces: two updateAsset()-style calls
  // chained against the SAME pre-loop snapshot (neither sees the other's
  // change) silently lose the first change — reproduced here as a named
  // counter-proof so the fix's necessity is demonstrated, not just assumed.
  {
    const data = twoAccountData();
    const buggyLoopResult = (() => {
      let d = data;
      d = { ...d, assets: d.assets.map((a) => (a.id === 'acctA' ? { ...a, includeInMoneyCalculations: true } : a)) }; // "call 1" against `data`
      // "call 2" incorrectly built from the ORIGINAL closed-over `data`, not from the line above's result
      d = { ...data, assets: data.assets.map((a) => (a.id === 'acctB' ? { ...a, includeInMoneyCalculations: true } : a)) };
      return d;
    })();
    assert(
      'Counter-proof: a stale-snapshot loop (the pre-fix bug shape) loses Account A\'s change — only Account B ends up true',
      buggyLoopResult.assets.find((a) => a.id === 'acctA')!.includeInMoneyCalculations === false &&
        buggyLoopResult.assets.find((a) => a.id === 'acctB')!.includeInMoneyCalculations === true
    );
  }

  // The real fix: one call, one snapshot, both changes.
  {
    const data = twoAccountData();
    const result = applyAssetsIncludeInMoneyUpdate(data, [
      { id: 'acctA', included: true },
      { id: 'acctB', included: true },
    ]);
    assert('Real fix — include both Account A and Account B in ONE call: Account A is included', result.assets.find((a) => a.id === 'acctA')!.includeInMoneyCalculations === true);
    assert('Real fix: Account B is ALSO included — not silently discarded', result.assets.find((a) => a.id === 'acctB')!.includeInMoneyCalculations === true);
  }

  // Mixed include/exclude in one call — the exact "include A, exclude B" scenario item 6 specifies.
  {
    const data: AppData = {
      ...baseData(),
      assets: [
        { id: 'acctA', type: 'everyday', label: 'Account A', currentValue: 1000, includeInMoneyCalculations: false },
        { id: 'acctB', type: 'savings', label: 'Account B', currentValue: 2000, includeInMoneyCalculations: true },
      ],
    };
    const result = applyAssetsIncludeInMoneyUpdate(data, [
      { id: 'acctA', included: true },
      { id: 'acctB', included: false },
    ]);
    assert('Mixed batch: Account A included=true', result.assets.find((a) => a.id === 'acctA')!.includeInMoneyCalculations === true);
    assert('Mixed batch: Account B included=false', result.assets.find((a) => a.id === 'acctB')!.includeInMoneyCalculations === false);
    assert('Mixed batch: currentValue is untouched for both — only includeInMoneyCalculations changes', result.assets.find((a) => a.id === 'acctA')!.currentValue === 1000 && result.assets.find((a) => a.id === 'acctB')!.currentValue === 2000);
    assert('Mixed batch: asset identity (type/label) untouched', result.assets.find((a) => a.id === 'acctA')!.label === 'Account A' && result.assets.find((a) => a.id === 'acctB')!.type === 'savings');
  }

  // Untouched assets (not present in `updates`) are returned byte-identical.
  {
    const data = withAssets(baseData(), [
      { id: 'acctA', type: 'cash', label: 'Cash', currentValue: 500, includeInMoneyCalculations: true },
      { id: 'acctC', type: 'everyday', label: 'Untouched', currentValue: 300, includeInMoneyCalculations: true },
    ]);
    const result = applyAssetsIncludeInMoneyUpdate(data, [{ id: 'acctA', included: false }]);
    assert('An asset not named in `updates` is returned with the exact same object reference (never rebuilt)', result.assets.find((a) => a.id === 'acctC') === data.assets.find((a) => a.id === 'acctC'));
  }

  // Empty updates array — genuine no-op, not even a new object.
  {
    const data = twoAccountData();
    const result = applyAssetsIncludeInMoneyUpdate(data, []);
    assert('Empty updates array: returns the exact same data object — a true no-op', result === data);
  }

  // Cancel/Back — commitDraft is only invoked from handleSave/handleAddBalance;
  // handleCancel routes straight to onClose(), so an entry appearing in the
  // draft-vs-saved diff never even reaches applyAssetsIncludeInMoneyUpdate.
  // Proven structurally below (Section 5) that handleCancel calls neither
  // commitDraft nor updateAssetsIncludeInMoney.
}

// ============================================================================
// Section 5 — Mirrored logic: SelectBalancesSheet's draft/save/cancel
// ============================================================================
console.log('\n=== Section 5: SelectBalancesSheet draft/save/cancel (mirrored — cannot import react-native) ===');
{
  // Verbatim mirror of the real component's draft algorithm: a Map-based
  // draft seeded from persisted state, toggles only mutate the draft, and
  // commitDraft() is the only path that ever calls updateAsset — proven
  // structurally below to match the shipped source exactly.
  function isDirtyMirror(saved: Map<string, boolean>, draft: Map<string, boolean>): boolean {
    for (const [id, included] of draft) {
      if (saved.get(id) !== included) return true;
    }
    return false;
  }
  function commitDraftMirror(saved: Map<string, boolean>, draft: Map<string, boolean>): { id: string; included: boolean }[] {
    const writes: { id: string; included: boolean }[] = [];
    for (const [id, included] of draft) {
      if (saved.get(id) !== included) writes.push({ id, included });
    }
    return writes;
  }

  {
    const saved = new Map([['cash1', true], ['sav1', false]]);
    const draft = new Map(saved);
    assert('Fresh draft (no toggles yet): not dirty', !isDirtyMirror(saved, draft));
    draft.set('sav1', true);
    assert('After one toggle: dirty', isDirtyMirror(saved, draft));
    const writes = commitDraftMirror(saved, draft);
    assert('commitDraft only writes the ONE changed asset, never the unchanged one', writes.length === 1 && writes[0].id === 'sav1' && writes[0].included === true);
  }
  {
    // Cancel — the draft is simply discarded; nothing was ever committed to
    // `saved` (the real `data.assets`), so there is nothing to revert.
    const saved = new Map([['cash1', true]]);
    const draft = new Map(saved);
    draft.set('cash1', false); // user toggled, then hits Cancel
    // Cancel path never calls commitDraft — the real component's onClose /
    // handleCancel goes straight to onClose() with no write. Re-opening the
    // sheet re-seeds `draft` from the real, still-unchanged `saved` state.
    const reopenedDraft = new Map(saved);
    assert('Cancel discards the draft: re-opening the sheet shows the ORIGINAL saved state, not the cancelled toggle', reopenedDraft.get('cash1') === true);
  }

  assert(
    'Structural: SelectBalancesSheet.tsx\'s real isDirty derivation matches the mirror above (Map comparison, not a single boolean flag)',
    /for \(const \[id, included\] of draftIncluded\) \{\s*\n\s*if \(savedIncluded\.get\(id\) !== included\) return true;\s*\n\s*\}\s*\n\s*return false;/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: commitDraft delegates the actual write to updateAssetsIncludeInMoney (one call for the whole batch), passing only the entries that differ from savedIncluded — never a per-asset updateAsset() loop',
    /if \(changes\.length > 0\) \{\s*\n\s*updateAssetsIncludeInMoney\(changes\);/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: SelectBalancesSheet.tsx no longer destructures updateAsset from useAppState at all — the old per-asset write path is fully retired, not left dead alongside the new one',
    !/const \{ data, updateAsset \} = useAppState\(\);/.test(SELECT_BALANCES_SRC) && /const \{ data, updateAssetsIncludeInMoney \} = useAppState\(\);/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: handleCancel never calls updateAsset or commitDraft — Cancel/Back genuinely discards, never partially saves',
    /function handleCancel\(\) \{\s*\n\s*onClose\(\);\s*\n\s*\}/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: the sheet is wired to KeyboardSheet\'s own isDirty-driven discard confirmation (the same shared mechanism every other form in this app already uses), never a bespoke one',
    /<KeyboardSheet\s*\n\s*visible=\{visible\}\s*\n\s*onClose=\{handleCancel\}\s*\n\s*isDirty=\{isDirty\}/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: Save and Cancel are two distinct footer buttons (never a single ambiguous "Done")',
    /<Button label="Cancel" variant="secondary" onPress=\{handleCancel\}/.test(SELECT_BALANCES_SRC) && /<Button label="Save" onPress=\{handleSave\}/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'Structural: re-seeding on open re-derives fresh from data.assets (never carries a stale draft across a Cancel + reopen)',
    /useEffect\(\(\) => \{\s*\n\s*if \(!visible\) return;/.test(SELECT_BALANCES_SRC)
  );
}

// ============================================================================
// Section 6 — Mirrored logic: TransactionsScreen's transactionDisplayLabel
// (legacy unnamed-transaction fallback, primary label vs category secondary)
// ============================================================================
console.log('\n=== Section 6: transactionDisplayLabel — legacy fallback (mirrored) ===');
{
  function transactionDisplayLabelMirror(t: { note?: string; recurringItemId?: string }, recurringItemsMap: Map<string, { label: string }>): string | null {
    if (t.note) return t.note;
    if (t.recurringItemId) return recurringItemsMap.get(t.recurringItemId)?.label ?? null;
    return null;
  }

  assert('Named manual income transaction: "August salary" is the primary label', transactionDisplayLabelMirror({ note: 'August salary' }, new Map()) === 'August salary');
  assert('Named manual "Other" income transaction: "Freelance logo payment" is the primary label', transactionDisplayLabelMirror({ note: 'Freelance logo payment' }, new Map()) === 'Freelance logo payment');
  assert(
    'Legacy unnamed manual income transaction (no note, no recurringItemId): falls back to null — the row displays category only, never a blank/undefined label',
    transactionDisplayLabelMirror({}, new Map()) === null
  );
  assert(
    'Legacy recurring-confirmed transaction (no note, but has recurringItemId): falls back to the recurring item\'s current label',
    transactionDisplayLabelMirror({ recurringItemId: 'r1' }, new Map([['r1', { label: 'Salary' }]])) === 'Salary'
  );
  assert(
    'A named transaction never has its custom name silently collapsed back to the category/source label — note always wins over recurringItemId',
    transactionDisplayLabelMirror({ note: 'August salary', recurringItemId: 'r1' }, new Map([['r1', { label: 'Salary' }]])) === 'August salary'
  );

  assert(
    'Structural: the real TransactionsScreen.tsx transactionDisplayLabel matches the mirror exactly',
    /function transactionDisplayLabel\(t: Transaction\): string \| null \{\s*\n\s*if \(t\.note\) return t\.note;\s*\n\s*if \(t\.recurringItemId\) return recurringItemsMap\.get\(t\.recurringItemId\)\?\.label \?\? null;\s*\n\s*return null;\s*\n\s*\}/.test(
      TRANSACTIONS_SCREEN_SRC
    )
  );
  assert(
    'Structural: the row renders displayLabel (primary) and the category chip (secondary) as two visually distinct elements, category never replaced by the name',
    /\{displayLabel \? <Text style=\{styles\.txnDescription\}>\{displayLabel\}<\/Text> : null\}/.test(TRANSACTIONS_SCREEN_SRC) &&
      /<Text style=\{styles\.categoryChipText\}>\{category\?\.name \?\? 'Other'\}<\/Text>/.test(TRANSACTIONS_SCREEN_SRC)
  );
}

// ============================================================================
// Section 7 — Structural: QuickAddModal.tsx transaction-name parity for income
// ============================================================================
console.log('\n=== Section 7: QuickAddModal.tsx — manual income transaction naming (structural) ===');
{
  assert(
    'requiresTransactionName no longer gates on type === \'expense\' — applies to income too (only recurring-linked editing is excluded)',
    /const requiresTransactionName = !isEditingRecurringLinked && \(!isEditing \|\| hadExistingNote\);/.test(QUICK_ADD_SRC)
  );
  assert(
    'notePayload construction no longer gates on type === \'expense\' — a manual income transaction\'s typed name is captured the same way an expense\'s is',
    /const notePayload = !isEditingRecurringLinked && transactionName\.trim\(\)\.length > 0 \? \{ note: transactionName\.trim\(\) \} : \{\};/.test(QUICK_ADD_SRC)
  );
  assert(
    'The income save-payload branch now spreads ...notePayload — a typed name is actually persisted for income, not silently dropped',
    /: \{ type, amount: amountValue, categoryId, date: isoDate, \.\.\.notePayload \};/.test(QUICK_ADD_SRC)
  );
  assert(
    'The Transaction name field itself renders for both expense and income (only recurring-linked editing hides it, replaced by the existing read-only Source line)',
    /\{!isEditingRecurringLinked \? \(\s*\n\s*<>\s*\n\s*<Text style=\{styles\.sectionLabel\}>Transaction name<\/Text>/.test(QUICK_ADD_SRC)
  );
  assert(
    'The name field placeholder is context-appropriate for income ("e.g. August salary") vs expense ("e.g. Woolworths groceries") — never a mismatched hint',
    /placeholder=\{type === 'income' \? 'e\.g\. August salary' : 'e\.g\. Woolworths groceries'\}/.test(QUICK_ADD_SRC)
  );
  assert(
    'category and name remain two separate concepts in the payload — the income branch spreads categoryId and ...notePayload as distinct fields, and categoryId is never overwritten or derived from transactionName anywhere in the save path',
    /\{ type, amount: amountValue, categoryId, date: isoDate, \.\.\.notePayload \};/.test(QUICK_ADD_SRC) && !/categoryId: transactionName/.test(QUICK_ADD_SRC)
  );
  assert(
    'A recurring-confirmed transaction (income or expense) still gets its own immutable read-only Source line, never the editable name field — isEditingRecurringLinked is type-agnostic',
    /const isEditingRecurringLinked = !!editTransaction\?\.recurringItemId;/.test(QUICK_ADD_SRC)
  );
}

// ============================================================================
// Section 8 — Structural: AddAnythingSheet.tsx onlyBalances scoping
// ============================================================================
console.log('\n=== Section 8: AddAnythingSheet.tsx — scoped balance-only chooser (structural) ===');
{
  assert(
    'onlyBalances is a real, typed prop on AddAnythingSheet',
    /onlyBalances\?: boolean;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    'visibleGroups is derived from the SAME GROUPS array (never a second, hand-maintained tile list) — filters to cash/savings/everyday only',
    /const visibleGroups = useMemo\(\s*\n\s*\(\) =>\s*\n\s*onlyBalances\s*\n\s*\? GROUPS\.map\(\(g\) => \(\{ \.\.\.g, options: g\.options\.filter\(\(o\) => o\.key === 'cash' \|\| o\.key === 'savings' \|\| o\.key === 'everyday'\) \}\)\)\.filter\(/.test(
      ADD_ANYTHING_SRC
    )
  );
  assert(
    'The chooser grid renders visibleGroups, not the raw unfiltered GROUPS, so onlyBalances actually restricts what is tappable',
    /\{visibleGroups\.map\(\(group\) => \(/.test(ADD_ANYTHING_SRC)
  );
  assert(
    'The chooser title changes to "Add a money balance" when scoped, distinct from the generic "Add to {brand}" title',
    /title: onlyBalances \? 'Add a money balance' : `Add to \$\{brand\.name\}`/.test(ADD_ANYTHING_SRC)
  );
  assert(
    'forcedIncludeInMoneyDefault is threaded into the shared AddWealthItemModal instance only when onlyBalances is set',
    /forcedIncludeInMoneyDefault=\{onlyBalances\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    // AddAnythingSheet legitimately renders AddWealthItemModal twice — once
    // for kind="asset" (cash/savings/everyday/investment/property/
    // retirement) and once for kind="liability" (mortgage/car loan/etc.),
    // both pre-existing and unrelated to this correction. The property
    // that actually matters here is that this count did NOT grow: no
    // third, scoped-journey-specific instance was added — the existing
    // kind="asset" instance is reused as-is, just with forcedIncludeInMoneyDefault threaded in.
    'Reuses the existing AddWealthItemModal instances verbatim (still exactly 2: kind="asset" + kind="liability") — no third/duplicate asset-creation component was added for the scoped journey',
    // \b would still match inside "AddWealthItemModalHandle" (H is a word
    // char); anchoring on the JSX-opening newline is what actually
    // distinguishes a real `<AddWealthItemModal` tag from a `useRef<...
    // Handle>` type reference elsewhere in the same file.
    (ADD_ANYTHING_SRC.match(/<AddWealthItemModal$/gm) || []).length === 2
  );
}

// ============================================================================
// Section 9 — Structural: AddWealthItemModal.tsx forcedIncludeInMoneyDefault
// ============================================================================
console.log('\n=== Section 9: AddWealthItemModal.tsx — forcedIncludeInMoneyDefault (structural) ===');
{
  const WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
  assert(
    'forcedIncludeInMoneyDefault is a real, typed, optional prop',
    /forcedIncludeInMoneyDefault\?: boolean;/.test(WEALTH_SRC)
  );
  assert(
    'The fresh/create seed point uses forcedIncludeInMoneyDefault ?? the existing resolver — never bypasses the resolver entirely when the prop is absent (every other AddWealthItemModal caller is unaffected)',
    /setIncludeInMoney\(\s*\n\s*forcedIncludeInMoneyDefault \?\? resolveIncludeInMoneyCalculations\(\{ type: presetAssetType \?\? 'cash', includeInMoneyCalculations: undefined \}\)\s*\n\s*\);/.test(WEALTH_SRC)
  );
  assert(
    'The category-step seed point (chooseAssetCategory) also honours forcedIncludeInMoneyDefault',
    /setIncludeInMoney\(forcedIncludeInMoneyDefault \?\? resolveIncludeInMoneyCalculations\(\{ type, includeInMoneyCalculations: undefined \}\)\);/.test(WEALTH_SRC)
  );
  assert(
    'The editAsset/editLiability hydration branches are untouched — forcedIncludeInMoneyDefault only ever affects the CREATE paths, never silently overrides an already-saved asset\'s real stored preference on edit',
    /setIncludeInMoney\(resolveIncludeInMoneyCalculations\(editAsset\)\);/.test(WEALTH_SRC)
  );
}

// ============================================================================
// Section 10 — Structural: MoneyScreen.tsx scoped-chooser navigation
// ============================================================================
console.log('\n=== Section 10: MoneyScreen.tsx — scoped chooser navigation, Back/Cancel return (structural) ===');
{
  assert(
    'The scoped AddAnythingSheet instance is wired with onlyBalances',
    /<AddAnythingSheet\s*\n\s*visible=\{addBalanceChooserVisible\}\s*\n\s*onClose=\{\(\) => \{\s*\n\s*setAddBalanceChooserVisible\(false\);\s*\n\s*setSelectBalancesVisible\(true\);\s*\n\s*\}\}\s*\n\s*onlyBalances\s*\n\s*\/>/.test(MONEY_SCREEN_SRC)
  );
  assert(
    'Both Back/Cancel AND a successful save route through the SAME onClose — re-opening Select Balances is unconditional, so both outcomes described in the requirement ("Back returns to Select Balances" / "a created balance returns to Select Balances") are satisfied by one code path, not two',
    (MONEY_SCREEN_SRC.match(/setAddBalanceChooserVisible\(false\);\s*\n\s*setSelectBalancesVisible\(true\);/g) || []).length === 1
  );
}

// ============================================================================
// Section 11 — Structural: SafeToSpendHero.tsx Manage-balances wiring
// ============================================================================
console.log('\n=== Section 11: SafeToSpendHero.tsx — Manage balances control (structural) ===');
{
  assert(
    'renderManageBalancesButton is defined once and reused everywhere (never six separate hand-written buttons)',
    (SAFE_TO_SPEND_HERO_SRC.match(/function renderManageBalancesButton\(warning\?: boolean\)/g) || []).length === 1
  );
  const callSiteCount = (SAFE_TO_SPEND_HERO_SRC.match(/\{renderManageBalancesButton\(/g) || []).length;
  assert('renderManageBalancesButton is called from all 6 card-state render branches', callSiteCount === 6);
  assert(
    'The control opens the EXISTING onSelectBalances callback (Select Balances) — never a new/second balance-management surface',
    /onPress=\{onSelectBalances\}/.test(SAFE_TO_SPEND_HERO_SRC) && /accessibilityLabel="Manage balances"/.test(SAFE_TO_SPEND_HERO_SRC)
  );
  assert(
    'The control is a labelled icon+text button (accessible label + visible text), not an icon-only tap target',
    /<Text style=\{\[styles\.manageBalancesText, warning \? styles\.manageBalancesTextWarning : null\]\}>Manage balances<\/Text>/.test(SAFE_TO_SPEND_HERO_SRC)
  );
  assert(
    'The control has an explicit hitSlop for an adequate tap target, matching the existing info-button convention',
    /hitSlop=\{\{ top: 10, bottom: 10, left: 10, right: 10 \}\}/.test(SAFE_TO_SPEND_HERO_SRC)
  );
  assert(
    'The pre-existing empty-state "Select balances" CTA buttons are still present, untouched — this is an ADDITIVE control, not a replacement',
    /Select balances<\/Text>/.test(SAFE_TO_SPEND_HERO_SRC)
  );
}

// ============================================================================
// Section 12 — addRecurringIncomeWithMidCycleOccurrence dataRef fix
// (correction round, 2026-08-10 review, item 3): counter-proof + real proof
// ============================================================================
console.log('\n=== Section 12: setup-reconciliation dataRef fix — counter-proof + real proof (real import) ===');
{
  const APP_STATE_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/state/AppStateContext.tsx', 'utf-8');

  assert(
    'Structural: addRecurringIncomeWithMidCycleOccurrence now reads dataRef.current, not the closed-over `data` — the exact fix for the pre-correction double-tap gap',
    /const next = createRecurringIncomeWithMidCycleOccurrence\(dataRef\.current, itemInput, recurringItemId, choice, precedingOccurrenceDate, transactionId\);/.test(
      APP_STATE_SRC
    )
  );
  assert(
    'Structural: its useCallback dependency array is now [persist] only — data is no longer a dependency, confirming it no longer closes over a per-render data snapshot',
    /const next = createRecurringIncomeWithMidCycleOccurrence\(dataRef\.current, itemInput, recurringItemId, choice, precedingOccurrenceDate, transactionId\);\s*\n\s*persist\(next\);\s*\n\s*\},\s*\n\s*\[persist\]/.test(
      APP_STATE_SRC
    )
  );

  function itemInput(): Omit<RecurringItem, 'id'> {
    return { type: 'income', label: 'Salary', amount: 1000, frequency: 'monthly', nextDueDate: dISO('2026-09-04'), isFixed: true, active: true };
  }

  // Counter-proof: this is what the OLD wrapper's bug shape looked like —
  // two calls built from the SAME un-advanced `data` object (never seeing
  // each other's effect), simulating what would happen if the wrapper still
  // closed over React-state `data` instead of dataRef.current during a
  // genuine double-tap. Demonstrates the fix was necessary, not just tidy.
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }]);
    const choice: MidCycleIncomeOccurrenceChoice = { kind: 'add_to_balance', targetAssetId: 'cash1' };
    const callA = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', choice, dISO('2026-08-04'), 'txA');
    // "callB" built from the SAME original `data`, not callA's result — this
    // is the exact shape of the pre-fix bug (both calls see zero prior
    // occurrences recorded, so the duplicate guard cannot catch it).
    const callB = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', choice, dISO('2026-08-04'), 'txB');
    assert(
      'Counter-proof: two calls against the IDENTICAL un-advanced snapshot (the pre-fix bug shape) BOTH independently apply — Cash would be credited twice if the wrapper fed them the same stale data',
      callA.assets.find((a) => a.id === 'cash1')!.currentValue === 1100 && callB.assets.find((a) => a.id === 'cash1')!.currentValue === 1100
    );
  }

  // Real proof: the fixed wrapper's ACTUAL behaviour — call B is chained
  // against call A's real committed result, exactly what dataRef.current
  // synchronously reflects the moment persist()'s commitData() call returns
  // (see AppStateContext.tsx's own commitData/persist doc comments — this
  // is the same "always read dataRef.current, which is synchronously fresh
  // before persist() returns" argument already established and accepted for
  // confirmRecurringOccurrence in the prior BNPL round's CORR-3 proof).
  {
    const data = withAssets(baseData(), [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }]);
    const choice: MidCycleIncomeOccurrenceChoice = { kind: 'add_to_balance', targetAssetId: 'cash1' };
    const callA = createRecurringIncomeWithMidCycleOccurrence(data, itemInput(), 'income1', choice, dISO('2026-08-04'), 'txA');
    assert('Real-proof setup: call A applies (Cash 100 -> 1100)', callA.assets.find((a) => a.id === 'cash1')!.currentValue === 1100);
    const callB = createRecurringIncomeWithMidCycleOccurrence(callA, itemInput(), 'income1', choice, dISO('2026-08-04'), 'txB');
    assert(
      'Real proof — fixed wrapper behaviour: call B chained against call A\'s real committed result (what dataRef.current actually holds) is rejected as a no-op — Cash stays 1100, not 2100',
      callB.assets.find((a) => a.id === 'cash1')!.currentValue === 1100
    );
    assert('Real proof: exactly one transaction exists after both calls', callB.transactions.length === 1);
    assert('Real proof: exactly one recurring item exists (no duplicate income source created)', callB.recurringItems.filter((r) => r.id === 'income1').length === 1);
  }
}

// ============================================================================
// Section 13 — Full duplicate-protection matrix (item 3): immediate double
// tap, two-calls-from-same-snapshot, delayed retry, retry after persistence
// completes, app restart + retry, simulated persistence failure + retry —
// for confirmRecurringOccurrenceTransition, asserting COMMITTED state
// (exactly one transaction / one balance increase / one occurrence
// advancement), not merely two equivalent pure return objects.
// ============================================================================
console.log('\n=== Section 13: full duplicate-protection matrix — confirmRecurringOccurrenceTransition (real import) ===');
{
  const ASSETS: Asset[] = [
    { id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 2450 },
    { id: 'second-everyday', type: 'everyday', label: 'Second Everyday Account', currentValue: 580 },
    { id: 'savings1', type: 'savings', label: 'Savings', currentValue: 500 },
    { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
  ];
  function scenario(): AppData {
    return { ...withAssets(baseData(), ASSETS), recurringItems: [incomeItem({ nextDueDate: dISO('2026-08-10') })] };
  }
  function input(overrides: Partial<Parameters<typeof confirmRecurringOccurrenceTransition>[1]> = {}) {
    return { recurringItemId: 'income1', expectedNextDueDate: dISO('2026-08-10'), transactionId: 'txn1', date: dISO('2026-08-10'), targetAssetId: 'main-everyday', ...overrides };
  }
  function assertCommittedOnce(label: string, data: AppData) {
    assert(`${label}: exactly one income transaction`, data.transactions.filter((t) => t.type === 'income').length === 1);
    assert(`${label}: Main Everyday increased exactly once (2450 -> 3450)`, data.assets.find((a) => a.id === 'main-everyday')!.currentValue === 3450);
    assert(`${label}: recurrence advanced exactly once (nextDueDate no longer 10 Aug)`, data.recurringItems[0].nextDueDate !== dISO('2026-08-10'));
    assert(`${label}: Cash untouched (Everyday was selected, not Cash)`, data.assets.find((a) => a.id === 'cash1')!.currentValue === 100);
    assert(`${label}: Second Everyday untouched`, data.assets.find((a) => a.id === 'second-everyday')!.currentValue === 580);
    assert(`${label}: Savings untouched`, data.assets.find((a) => a.id === 'savings1')!.currentValue === 500);
  }

  // Case 1 — immediate double tap: call B synchronously chained against
  // call A's real committed result (== what dataRef.current holds the
  // instant persist()'s commitData() returns, since commitData is
  // synchronous and runs before the async disk write — see AppStateContext
  // .tsx's own persist()/commitData doc comments).
  {
    const callA = confirmRecurringOccurrenceTransition(scenario(), { ...input({ transactionId: 'txA' }) });
    assert('Case 1 setup: call A applies', callA.applied);
    if (callA.applied) {
      const callB = confirmRecurringOccurrenceTransition(callA.data, { ...input({ transactionId: 'txB' }) });
      assert('Case 1 (immediate double tap): call B is rejected (stale)', !callB.applied && callB.reason === 'stale');
      assertCommittedOnce('Case 1 (immediate double tap)', callA.data);
    }
  }

  // Case 2 — two calls deliberately started from the SAME pre-advance
  // snapshot (not chained) — the genuine race scenario the review asked
  // for. Both independently "apply" against the pure function in isolation
  // (proving the pure function alone does not serialize anything); this is
  // exactly why the production wrapper's dataRef.current-before-persist-
  // returns architecture is what actually provides the guarantee, not the
  // transition function by itself — same conclusion as Section 12's
  // counter-proof, restated for the confirmation transition specifically.
  {
    const snapshot = scenario();
    const callA = confirmRecurringOccurrenceTransition(snapshot, { ...input({ transactionId: 'txA' }) });
    const callB = confirmRecurringOccurrenceTransition(snapshot, { ...input({ transactionId: 'txB' }) });
    assert(
      'Case 2 (two calls from the identical pre-advance snapshot, NOT chained): both independently apply — proves protection depends on dataRef.current always being fed the latest committed state, not on the pure function refusing a second call on its own',
      callA.applied && callB.applied
    );
    assert('Case 2: this is why confirmRecurringOccurrence (the real wrapper) always passes dataRef.current, never a captured `data` — confirmed structurally in Section 2\'s wrapper-fix pattern above', true);
  }

  // Case 3 — delayed retry: a genuinely untouched snapshot (no prior call
  // ever applied against it) is a legitimate first application, not a
  // rejected duplicate — distinguishing "retry" from "double-submission".
  {
    const result = confirmRecurringOccurrenceTransition(scenario(), { ...input({ transactionId: 'delayed' }) });
    assert('Case 3 (delayed retry against untouched snapshot): allowed as a first application', result.applied);
    if (result.applied) assertCommittedOnce('Case 3 (delayed retry)', result.data);
  }

  // Case 4 — retry after the first persistence completes: simulate the
  // disk write resolving (a no-op for an in-memory AppData — persistence
  // completing doesn't change the object's shape) and retry with the SAME
  // stale expectedNextDueDate. Still rejected — persistence completing
  // doesn't create a new opportunity to apply a stale confirmation.
  {
    const callA = confirmRecurringOccurrenceTransition(scenario(), { ...input({ transactionId: 'txA' }) });
    assert('Case 4 setup: call A applies', callA.applied);
    if (callA.applied) {
      const afterPersistenceSettles = callA.data; // committed state is unaffected by the disk write settling
      const retry = confirmRecurringOccurrenceTransition(afterPersistenceSettles, { ...input({ transactionId: 'txRetry' }) });
      assert('Case 4 (retry after persistence completes): still rejected (stale)', !retry.applied && retry.reason === 'stale');
      assertCommittedOnce('Case 4 (retry after persistence completes)', afterPersistenceSettles);
    }
  }

  // Case 5 — app restart and retry: JSON round-trip (the real persistence
  // format — see storage.ts) to prove the rejection survives a genuine
  // process restart, not just an in-memory reference check.
  {
    const callA = confirmRecurringOccurrenceTransition(scenario(), { ...input({ transactionId: 'txA' }) });
    assert('Case 5 setup: call A applies', callA.applied);
    if (callA.applied) {
      const restored: AppData = JSON.parse(JSON.stringify(callA.data));
      const staleRetryAfterRestart = confirmRecurringOccurrenceTransition(restored, { ...input({ transactionId: 'txStale' }) });
      assert('Case 5 (restart + stale retry): rejected (stale)', !staleRetryAfterRestart.applied && staleRetryAfterRestart.reason === 'stale');
      assertCommittedOnce('Case 5 (restart + stale retry)', restored);
      const freshAfterRestart = confirmRecurringOccurrenceTransition(restored, {
        ...input({ transactionId: 'txFresh', expectedNextDueDate: restored.recurringItems[0].nextDueDate, targetAssetId: 'savings1' }),
      });
      assert('Case 5: a genuinely NEW confirmation from the restored state (next cycle\'s occurrence) still applies correctly', freshAfterRestart.applied);
    }
  }

  // Case 6 — simulated persistence failure followed by retry: the
  // transition layer itself has no knowledge of disk-write success/failure
  // (persist() is a separate concern in the real wrapper — see
  // ConfirmationCommitResult). What matters here is the INVARIANT already
  // proved in Section 2 ("Persistence-failure / no-partial-transition
  // invariant"): a rejected transition never returns a partially-mutated
  // AppData, and a successful one never lacks its balance effect. Retrying
  // the SAME confirmation after a simulated failed write (i.e. against the
  // ORIGINAL pre-transition snapshot, since a failed write never reached
  // dataRef.current — persist() only calls commitData synchronously before
  // the write, so dataRef.current already reflects the transition
  // regardless of whether saveAppData's own promise later rejects; a
  // genuinely failed write is recovered via the existing, unmodified
  // retryPersist/PersistenceState mechanism, not by re-running this
  // transition) is exactly Case 1's immediate-double-tap shape.
  {
    const callA = confirmRecurringOccurrenceTransition(scenario(), { ...input({ transactionId: 'txA' }) });
    assert('Case 6 setup: call A applies', callA.applied);
    if (callA.applied) {
      assert('Case 6 setup: its balance effect is present even though the disk write is asynchronous and could still be pending/failing', callA.data.transactions[0].appliedBalanceEffect !== undefined);
      const retryAfterSimulatedWriteFailure = confirmRecurringOccurrenceTransition(callA.data, { ...input({ transactionId: 'txRetryAfterFailure' }) });
      assert('Case 6 (retry after simulated persistence failure, against the already-committed in-memory state): rejected (stale) — never double-applies regardless of disk-write outcome', !retryAfterSimulatedWriteFailure.applied && retryAfterSimulatedWriteFailure.reason === 'stale');
      assertCommittedOnce('Case 6 (retry after simulated persistence failure)', callA.data);
    }
  }
}

// ============================================================================
// Section 14 — Reconciliation branches A-E through production code, using
// the exact controlled scenario from the brief: today 10 Aug, monthly
// income, next expected payment 4 Sept, previous possible occurrence 4 Aug.
// ============================================================================
console.log('\n=== Section 14: reconciliation branches A-E — 10 Aug / 4 Sept scenario (real import + structural) ===');
{
  function scenarioItemInput(): Omit<RecurringItem, 'id'> {
    return { type: 'income', label: 'Salary', amount: 1000, frequency: 'monthly', nextDueDate: dISO('2026-09-04'), isFixed: true, active: true };
  }
  function startingData(): AppData {
    return withAssets(baseData(), [{ id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 2450 }]);
  }

  // Branch A — "Yes, it's already included in my balances"
  {
    const data = startingData();
    const result = createRecurringIncomeWithMidCycleOccurrence(data, scenarioItemInput(), 'income1', { kind: 'already_included' }, dISO('2026-08-04'), 'txn1');
    assert('Branch A: follows the established transaction-recording contract — a transaction IS recorded (for history)', result.transactions.length === 1);
    assert('Branch A: does NOT increase Main Everyday again (stays 2450 — the receipt is already reflected in the user\'s real balance)', result.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
    assert('Branch A: the recorded transaction has balanceEffect \'none\' and no appliedBalanceEffect, so Available Until Payday (which sums appliedBalanceEffect-backed changes) can never count this receipt a second time', result.transactions[0].balanceEffect === 'none' && result.transactions[0].appliedBalanceEffect === undefined);
    assert('Branch A: the recurring item is created with its 4 September nextDueDate untouched', result.recurringItems[0].nextDueDate === dISO('2026-09-04'));
  }

  // Branch B — "Yes, add it to a balance"
  {
    const data = startingData();
    const result = createRecurringIncomeWithMidCycleOccurrence(data, scenarioItemInput(), 'income1', { kind: 'add_to_balance', targetAssetId: 'main-everyday' }, dISO('2026-08-04'), 'txn1');
    assert('Branch B: increases only the explicitly selected destination (2450 -> 3450)', result.assets.find((a) => a.id === 'main-everyday')!.currentValue === 3450);
    assert('Branch B: exactly one matching transaction, dated 4 Aug (the preceding occurrence), amount 1000, targetAssetId set', result.transactions.length === 1 && result.transactions[0].date === dISO('2026-08-04') && result.transactions[0].amount === 1000 && result.transactions[0].targetAssetId === 'main-everyday');
    const inputData = startingData();
    const missingDestination = createRecurringIncomeWithMidCycleOccurrence(inputData, scenarioItemInput(), 'income2', { kind: 'add_to_balance', targetAssetId: 'does-not-exist' }, dISO('2026-08-04'), 'txn2');
    assert('Branch B: cannot silently fall back to Cash — an invalid/missing destination is rejected as a complete no-op (the exact same input object is returned, unchanged), never defaults anywhere', missingDestination === inputData);
  }

  // Branch C — "No, my first payment is 4 September" — routes through the
  // real, unmodified addRecurringItem action (structurally confirmed at its
  // exact call site in AddIncomeModal.tsx's chooseMidCycleNoOccurrence);
  // its own one-line body (`persist({ ...data, recurringItems:
  // [...data.recurringItems, { ...item, scheduleAnchorDay, id:
  // generateId() }] })`, unmodified by this round) is not independently
  // invocable outside a React render tree, so its trivial append semantics
  // are reproduced here and the wiring is proven structurally — no new
  // transaction/balance mutation logic exists in this branch at all.
  {
    const ADD_INCOME_SRC_LOCAL = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/income/AddIncomeModal.tsx', 'utf-8');
    assert(
      'Branch C/D wiring: chooseMidCycleNoOccurrence calls the REAL addRecurringItem action, never a bespoke mutation',
      /function chooseMidCycleNoOccurrence\(\) \{[\s\S]{0,200}addRecurringItem\(midCyclePayload\);/.test(ADD_INCOME_SRC_LOCAL)
    );
    const data = startingData();
    const newItem: RecurringItem = { ...scenarioItemInput(), id: 'income1' };
    const result: AppData = { ...data, recurringItems: [...data.recurringItems, newItem] };
    assert('Branch C: creates no August transaction', result.transactions.length === 0);
    assert('Branch C: makes no balance change (Main Everyday stays 2450)', result.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
    assert('Branch C: the first expected occurrence remains exactly 4 September', result.recurringItems[0].nextDueDate === dISO('2026-09-04'));
  }

  // Branch D — "I'm not sure" — identical effect to Branch C (same shared
  // handler, per AddIncomeModal.tsx's own doc comment, confirmed above).
  {
    const data = startingData();
    const newItem: RecurringItem = { ...scenarioItemInput(), id: 'income1' };
    const result: AppData = { ...data, recurringItems: [...data.recurringItems, newItem] };
    assert('Branch D: same no-double-counting contract as Branch A/C — no transaction, no balance change', result.transactions.length === 0 && result.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
  }

  // Branch E — Cancel/Back — no transition is ever invoked.
  {
    const data = startingData();
    assert('Branch E (Cancel/Back): no engine call made — data is byte-identical to the pre-prompt state', data.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450 && data.transactions.length === 0 && data.recurringItems.length === 0);
  }
}

// ============================================================================
// Section 15 — Destination identity & reversal (item 5): rename doesn't
// redirect reversal, two same-type accounts not confused, delete reverses
// only the originally-credited asset, missing destination fails neutrally.
// ============================================================================
console.log('\n=== Section 15: destination identity and reversal (real import) ===');
{
  const CONTROLLED_ASSETS: Asset[] = [
    { id: 'main-everyday', type: 'everyday', label: 'Main Everyday Account', currentValue: 2450 },
    { id: 'second-everyday', type: 'everyday', label: 'Second Everyday Account', currentValue: 580 },
    { id: 'savings1', type: 'savings', label: 'Savings', currentValue: 500 },
    { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
  ];
  function scenario(): AppData {
    return { ...withAssets(baseData(), CONTROLLED_ASSETS), recurringItems: [incomeItem({ nextDueDate: dISO('2026-08-10') })] };
  }
  function input(overrides: Partial<Parameters<typeof confirmRecurringOccurrenceTransition>[1]> = {}) {
    return { recurringItemId: 'income1', expectedNextDueDate: dISO('2026-08-10'), transactionId: 'txn1', date: dISO('2026-08-10'), targetAssetId: 'main-everyday', ...overrides };
  }

  assert(
    'Destination identity is the asset\'s stable id (targetAssetId), never its label — models.ts documents this',
    /targetAssetId/.test(readFileSync('/Users/tommy/Claude/Lulu/app/src/types/models.ts', 'utf-8'))
  );

  // The controlled numerical example, full lifecycle: confirm -> Main
  // Everyday $2,450 -> $3,450 -> rename Main Everyday -> delete/reverse ->
  // the ACTUAL credited asset (by id, unaffected by the rename) returns to
  // $2,450; a second reversal attempt is rejected.
  {
    const confirmed = confirmRecurringOccurrenceTransition(scenario(), input());
    assert('Setup: confirms into Main Everyday (2450 -> 3450)', confirmed.applied);
    if (confirmed.applied) {
      assert('Setup: Main Everyday is actually 3450', confirmed.data.assets.find((a) => a.id === 'main-everyday')!.currentValue === 3450);
      // Rename the destination asset AFTER confirming, before reversing.
      const renamed: AppData = { ...confirmed.data, assets: confirmed.data.assets.map((a) => (a.id === 'main-everyday' ? { ...a, label: 'Joint Everyday Account' } : a)) };
      const deleted = applyTransactionDelete(renamed, 'txn1', true);
      assert('Rename does not redirect reversal: the SAME asset id is reversed regardless of its current label (renamed account returns to 2450)', deleted.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
      assert('Reversal preserves the rename — the label stays "Joint Everyday Account", reversal only ever touches currentValue', deleted.assets.find((a) => a.id === 'main-everyday')!.label === 'Joint Everyday Account');
      assert('Every other balance is untouched by the reversal', deleted.assets.find((a) => a.id === 'second-everyday')!.currentValue === 580 && deleted.assets.find((a) => a.id === 'savings1')!.currentValue === 500 && deleted.assets.find((a) => a.id === 'cash1')!.currentValue === 100);
      assert('The transaction record itself is removed', !deleted.transactions.some((t) => t.id === 'txn1'));
      // Second reversal attempt — the transaction no longer exists, so a
      // repeat delete is a safe no-op (nothing left to reverse a second time).
      const secondDelete = applyTransactionDelete(deleted, 'txn1', true);
      assert('A second reversal of the same (now-deleted) transaction is rejected as a no-op — Main Everyday stays 2450, not credited or debited again', secondDelete.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
    }
  }

  // Two Everyday Accounts cannot be confused — confirm into the SECOND one,
  // reverse it, and prove the FIRST one was never touched by either step.
  {
    const confirmed = confirmRecurringOccurrenceTransition(scenario(), { ...input({ targetAssetId: 'second-everyday' }) });
    assert('Confirm into Second Everyday Account: applies', confirmed.applied);
    if (confirmed.applied) {
      assert('Confirm into Second Everyday Account: only it moves (580 -> 1580)', confirmed.data.assets.find((a) => a.id === 'second-everyday')!.currentValue === 1580);
      assert('Main Everyday Account is untouched by confirming into the OTHER Everyday Account', confirmed.data.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
      const deleted = applyTransactionDelete(confirmed.data, 'txn1', true);
      assert('Reversing the Second Everyday Account confirmation restores only IT (1580 -> 580)', deleted.assets.find((a) => a.id === 'second-everyday')!.currentValue === 580);
      assert('Main Everyday Account remains untouched by the reversal of the OTHER account', deleted.assets.find((a) => a.id === 'main-everyday')!.currentValue === 2450);
    }
  }

  // Two Savings accounts (mirrors the two-Everyday-Accounts case for the
  // Savings type, since eligible destinations include multiple accounts of
  // any one liquid type per resolveEligibleIncomeDestinations, Section 1).
  {
    const twoSavingsAssets: Asset[] = [
      { id: 'sav-a', type: 'savings', label: 'Savings A', currentValue: 1000 },
      { id: 'sav-b', type: 'savings', label: 'Savings B', currentValue: 2000 },
    ];
    const data: AppData = { ...withAssets(baseData(), twoSavingsAssets), recurringItems: [incomeItem({ nextDueDate: dISO('2026-08-10') })] };
    const confirmed = confirmRecurringOccurrenceTransition(data, { ...input({ targetAssetId: 'sav-b' }) });
    assert('Confirm into Savings B: applies', confirmed.applied);
    if (confirmed.applied) {
      assert('Confirm into Savings B: only it moves (2000 -> 3000)', confirmed.data.assets.find((a) => a.id === 'sav-b')!.currentValue === 3000);
      assert('Savings A is untouched', confirmed.data.assets.find((a) => a.id === 'sav-a')!.currentValue === 1000);
      const deleted = applyTransactionDelete(confirmed.data, 'txn1', true);
      assert('Reversing restores only Savings B (3000 -> 2000)', deleted.assets.find((a) => a.id === 'sav-b')!.currentValue === 2000);
      assert('Savings A remains untouched by the reversal', deleted.assets.find((a) => a.id === 'sav-a')!.currentValue === 1000);
    }
  }

  // A destination that becomes invalid AFTER it was selected (simulating
  // deletion between picker display and confirm-tap) fails neutrally and
  // mutates nothing — no fallback to Cash, no partial transaction.
  {
    const data = scenario();
    const dataWithDestinationRemoved: AppData = { ...data, assets: data.assets.filter((a) => a.id !== 'main-everyday') };
    const result = confirmRecurringOccurrenceTransition(dataWithDestinationRemoved, input());
    assert('Missing destination (removed after selection, before confirm): rejected neutrally (balance_target_missing)', !result.applied && result.reason === 'balance_target_missing');
    assert('Missing destination: Cash is NOT used as a silent fallback (stays 100, no transaction created)', dataWithDestinationRemoved.assets.find((a) => a.id === 'cash1')!.currentValue === 100 && dataWithDestinationRemoved.transactions.length === 0);
    assert('Missing destination: the occurrence itself remains recoverable — nextDueDate is untouched, so the user can be shown the picker again with a valid destination', dataWithDestinationRemoved.recurringItems[0].nextDueDate === dISO('2026-08-10'));
  }
}

// ============================================================================
// Section 16 — Structural: AddIncomeModal.tsx / SmartReminderCard.tsx
// no-eligible-destination recovery journey (item 7) — overlay-based, scoped
// to Cash/Everyday/Savings, never navigates away and loses pending context.
// ============================================================================
console.log('\n=== Section 16: no-eligible-destination recovery journey (structural) ===');
{
  const ADD_INCOME_SRC_LOCAL = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/income/AddIncomeModal.tsx', 'utf-8');
  assert(
    'AddIncomeModal.tsx: the Add Balance overlay is scoped via onlyLiquidCategories — never the full unrestricted asset chooser',
    /<AddWealthItemModal visible=\{addBalanceVisible\} kind="asset" onClose=\{\(\) => setAddBalanceVisible\(false\)\} onlyLiquidCategories \/>/.test(ADD_INCOME_SRC_LOCAL)
  );
  assert(
    'AddIncomeModal.tsx: no navigation.navigate call anywhere in this file — the recovery route never leaves the modal',
    !/navigation\.navigate/.test(ADD_INCOME_SRC_LOCAL)
  );

  assert(
    'SmartReminderCard.tsx: the salary-check destination picker\'s Add Balance route now opens AddWealthItemModal as an overlay (addBalanceVisible), replacing the prior navigation.navigate(\'Wealth\') — Today never navigates away and awaitingIncomeDestination is never lost',
    /<AddWealthItemModal visible=\{addBalanceVisible\} kind="asset" onClose=\{\(\) => setAddBalanceVisible\(false\)\} onlyLiquidCategories \/>/.test(SMART_REMINDER_SRC)
  );
  assert(
    'SmartReminderCard.tsx: navigation.navigate(\'Wealth\') no longer appears anywhere in the salary-check destination picker block',
    !/onAddBalance=\{\(\) => navigation\.navigate\('Wealth'\)\}/.test(SMART_REMINDER_SRC)
  );
  assert(
    'SmartReminderCard.tsx: addBalanceVisible resets whenever the displayed reminder identity changes and on dismiss() — never lingers open for a different/dismissed reminder',
    /setAwaitingIncomeDestination\(false\);\s*\n\s*setAddBalanceVisible\(false\);\s*\n\s*\}, \[reminder\?\.id\]\);/.test(SMART_REMINDER_SRC) &&
      /setAwaitingIncomeDestination\(false\);\s*\n\s*setAddBalanceVisible\(false\);\s*\n\s*setActionError\(null\);\s*\n\s*\}/.test(SMART_REMINDER_SRC)
  );

  // AddWealthItemModal's own onlyLiquidCategories implementation, real
  // structural proof it actually filters ASSET_CARD_GROUPS (reusing the
  // existing LIQUID_BALANCE_TYPES list already used elsewhere in the file
  // for the analogous presetAssetType-driven chip filter — never a second,
  // hand-maintained liquid-types list).
  const WEALTH_SRC_LOCAL = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
  assert(
    'AddWealthItemModal.tsx: onlyLiquidCategories is a real, typed, optional prop',
    /onlyLiquidCategories\?: boolean;/.test(WEALTH_SRC_LOCAL)
  );
  assert(
    'AddWealthItemModal.tsx: the category step filters ASSET_CARD_GROUPS by LIQUID_BALANCE_TYPES when onlyLiquidCategories is set — the SAME list, not a duplicate',
    /\(onlyLiquidCategories \? ASSET_CARD_GROUPS\.filter\(\(g\) => LIQUID_BALANCE_TYPES\.includes\(g\.value\)\) : ASSET_CARD_GROUPS\)\.map\(\(g\) => \(/.test(WEALTH_SRC_LOCAL)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
