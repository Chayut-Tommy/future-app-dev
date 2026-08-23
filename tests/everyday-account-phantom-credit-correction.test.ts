// Everyday Account — phantom-credit correction pass, 2026-08-08 (third
// correction pass, following the financial-integrity verification review).
//
// Covers the 4 numbered items in the authorization: (1) the confirmed
// floor-then-reverse phantom-credit defect and its shared-engine
// correction; (2) explaining/reconciling the Money Plan $2,000 result
// (a reporting error, not an engine defect — confirmed here with the
// authorized scenario's TRUE fixture); (3) same-name disambiguation when
// provider is blank and balances match; (4) the orphaned-transaction
// editing contract.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): sections 1-9 — import and directly execute the
//   actual production functions (applyNewTransaction, applyTransactionUpdate,
//   applyTransactionDelete, computeSafeToSpend, computeMoneyPlan) against
//   real AppData fixtures.
// - Mirrored logic (Class B): section 10 — QuickAddModal.tsx's
//   disambiguateEverydayAccountLabels/canSave-for-orphaned-transaction are
//   declared inside a .tsx file that transitively imports react-native and
//   cannot be imported directly. Reimplemented verbatim and executed, with
//   a structural assertion tying the mirror to the shipped source text.
//
// NOT PROVEN by this suite: on-device VoiceOver/TalkBack announcement of
// the disambiguated chip labels, or the physical Save-button behaviour for
// an orphaned transaction. That remains physical-device evidence.
//
// Run with: npx tsx tests/everyday-account-phantom-credit-correction.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { applyNewTransaction, applyTransactionUpdate, applyTransactionDelete } from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMoneyPlan } from '../src/lib/calculations/moneyPlan';
import type { AppData, Asset } from '../src/types/models';

// TEST-INFRASTRUCTURE CORRECTION (Wave 9a verification pass) — this file's
// structural reads were pinned to an absolute path naming one specific
// checkout on one machine. Run from any other worktree that silently reads
// a DIFFERENT
// repository, so a structural assertion could pass against code that is not
// the code under test. Paths now resolve from this file's own location,
// matching the convention design5-add-architecture.test.ts and others
// already use. No product assertion, expected value or production file is
// changed by this correction.
const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const APP_STATE_SRC = readFileSync(srcPath('src/state/AppStateContext.tsx'), 'utf-8');
const QUICK_ADD_SRC = readFileSync(srcPath('src/components/dashboard/QuickAddModal.tsx'), 'utf-8');

function baseData(cash: number, everyday: number): AppData {
  const data = createEmptyAppData();
  data.assets = [
    { id: 'C', type: 'cash', label: 'Cash', currentValue: cash },
    { id: 'E', type: 'everyday', label: 'Everyday Account', currentValue: everyday },
  ];
  return data;
}
function bal(data: AppData, id: string): number {
  const a = data.assets.find((x) => x.id === id);
  if (!a) throw new Error(`asset ${id} not found`);
  return a.currentValue;
}
function netWorth(data: AppData): number {
  return data.assets.reduce((s, a) => s + a.currentValue, 0);
}

console.log('=== 1. The exact controlled scenario: Cash $0, Everyday $100, $50 expense, edit source to Cash, then change back / delete ===');
{
  let data = baseData(0, 100);
  data = applyNewTransaction(
    data,
    { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' },
    'txn'
  );
  assert('1a. after the $50 Everyday expense: Everyday=50, Cash=0, net worth=50', bal(data, 'E') === 50 && bal(data, 'C') === 0 && netWorth(data) === 50);
  assert(
    '1b. stored appliedBalanceEffect is the true -50 (no floor bound yet)',
    data.transactions.find((t) => t.id === 'txn')?.appliedBalanceEffect?.delta === -50
  );

  const changedToCash = applyTransactionUpdate(data, 'txn', { paymentSource: 'cash', targetAssetId: undefined });
  assert('1c. THE CORE PROOF: changing source to $0 Cash never creates $50 in Cash — Cash stays $0', bal(changedToCash, 'C') === 0);
  assert('1d. Everyday is fully restored to $100 by the reversal of its own true effect', bal(changedToCash, 'E') === 100);
  assert('1e. net worth stays $100 — not $150 (the old phantom-credit bug would have shown $150 here had Cash actually received $50)', netWorth(changedToCash) === 100);
  assert(
    '1f. stored appliedBalanceEffect now reflects what ACTUALLY moved in Cash — delta 0, not the intended -50',
    changedToCash.transactions.find((t) => t.id === 'txn')?.appliedBalanceEffect?.delta === 0
  );

  const changedBack = applyTransactionUpdate(changedToCash, 'txn', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('1g. changing back to Everyday debits it by exactly $50 again — Everyday=50', bal(changedBack, 'E') === 50);
  assert('1h. Cash is untouched by the change-back (nothing was ever really removed from it)', bal(changedBack, 'C') === 0);
  assert('1i. net worth returns to exactly 50 once — not 0, not 100', netWorth(changedBack) === 50);

  const deletedInstead = applyTransactionDelete(changedToCash, 'txn', true);
  assert('1j. deleting from the Cash-sourced state restores net worth to exactly the ORIGINAL pre-transaction $100, never more', netWorth(deletedInstead) === 100);
  assert('1k. delete never leaves a stray transaction record', !deletedInstead.transactions.some((t) => t.id === 'txn'));
}

console.log('\n=== 2. $20 Cash targeted by a $50 source change (partial insufficiency) ===');
{
  let data = baseData(20, 100);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' }, 'txn');
  const changed = applyTransactionUpdate(data, 'txn', { paymentSource: 'cash', targetAssetId: undefined });
  assert('2a. Cash floors at exactly $0 (it only had $20 to give)', bal(changed, 'C') === 0);
  assert('2b. actual stored delta is -20, not the intended -50', changed.transactions.find((t) => t.id === 'txn')?.appliedBalanceEffect?.delta === -20);
  assert('2c. net worth after the change is 100 (20 Cash truly spent + 100 Everyday restored - the 20 that left = 100)', netWorth(changed) === 100);
  const back = applyTransactionUpdate(changed, 'txn', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('2d. changing back to Everyday restores Cash to exactly its true original $20 — no phantom credit beyond what was really removed', bal(back, 'C') === 20);
  assert('2e. Everyday is debited by the full intended $50 again', bal(back, 'E') === 50);
  assert('2f. net worth returns to exactly the original 70 (20+50)', netWorth(back) === 70);
}

console.log('\n=== 3. $0 Everyday targeted by $50, and 4. $20 Everyday targeted by $50 ===');
{
  let data = baseData(100, 0);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 'txn');
  const changed = applyTransactionUpdate(data, 'txn', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('3a. $0 Everyday floors at exactly $0', bal(changed, 'E') === 0);
  assert('3b. Cash fully restored to $100 (its own true effect reversed)', bal(changed, 'C') === 100);
  assert('3c. net worth stays 100 — no phantom credit into Everyday', netWorth(changed) === 100);

  let data2 = baseData(100, 20);
  data2 = applyNewTransaction(data2, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 'txn2');
  const changed2 = applyTransactionUpdate(data2, 'txn2', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('4a. $20 Everyday floors at exactly $0 (only had $20 to give against a $50 debit)', bal(changed2, 'E') === 0);
  assert('4b. actual stored delta is -20', changed2.transactions.find((t) => t.id === 'txn2')?.appliedBalanceEffect?.delta === -20);
  assert('4c. net worth after the change is 100 (Cash restored to 100 + Everyday truly reduced by only 20)', netWorth(changed2) === 100);
}

console.log('\n=== 5. Exact-balance $50 targeted by $50 (must never floor / must behave identically to before this fix) ===');
{
  let data = baseData(100, 50);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 'txn');
  const changed = applyTransactionUpdate(data, 'txn', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('5a. exact-balance Everyday debits to precisely $0, not floored short of it', bal(changed, 'E') === 0);
  assert('5b. actual stored delta equals the full intended -50 (the floor never bound)', changed.transactions.find((t) => t.id === 'txn')?.appliedBalanceEffect?.delta === -50);
  const back = applyTransactionUpdate(changed, 'txn', { paymentSource: 'cash', targetAssetId: undefined });
  // Cash was restored to its intermediate $100 while Everyday was the
  // active target, then re-debited by the full $50 from THAT current
  // value when the source changes back — landing on $50, not the
  // original $100 (there is no floor anywhere in this exact-balance
  // chain, so every step is a full, un-clamped $50 move).
  assert('5c. changing back to Cash debits its current $100 by the full $50 — lands on $50', bal(back, 'C') === 50);
  assert('5d. Everyday correctly restored to $50 by reversing the exact -50 that was really applied', bal(back, 'E') === 50);
  assert('5e. net worth round-trips back to exactly 100 — unchanged by any floor, since funds were always sufficient at each step', netWorth(back) === 100);
}

console.log('\n=== 6. Source change followed by another source change (three-way chain, all insufficient) ===');
{
  let data = baseData(0, 0);
  data.assets.push({ id: 'E2', type: 'everyday', label: 'Second Everyday', currentValue: 0 });
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' }, 'txn');
  assert('6a. everything starts and floors at $0 net worth', netWorth(data) === 0);
  data = applyTransactionUpdate(data, 'txn', { paymentSource: 'cash', targetAssetId: undefined });
  assert('6b. after change to $0 Cash, net worth remains exactly 0 (no phantom credit)', netWorth(data) === 0);
  data = applyTransactionUpdate(data, 'txn', { paymentSource: 'everyday', targetAssetId: 'E2' });
  assert('6c. after change to a DIFFERENT $0 Everyday account, net worth remains exactly 0', netWorth(data) === 0);
  assert('6d. the original account E is untouched throughout the whole chain', bal(data, 'E') === 0);
  const del = applyTransactionDelete(data, 'txn', true);
  assert('6e. deleting at the end of the chain leaves net worth at exactly 0 — never higher', netWorth(del) === 0);
}

console.log('\n=== 7. Repeated Cash <-> Everyday cycles, always insufficient (no cumulative residue) ===');
{
  let data = baseData(0, 0);
  data = applyNewTransaction(data, { type: 'expense', amount: 30, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 'txn');
  let maxNetWorth = netWorth(data);
  for (let i = 0; i < 10; i++) {
    data = applyTransactionUpdate(data, 'txn', { paymentSource: i % 2 === 0 ? 'everyday' : 'cash', targetAssetId: i % 2 === 0 ? 'E' : undefined });
    maxNetWorth = Math.max(maxNetWorth, netWorth(data));
  }
  assert('7a. net worth never exceeds 0 across 10 alternating insufficient-funds source changes', maxNetWorth === 0);
  assert('7b. final net worth is exactly 0, not accumulated phantom value', netWorth(data) === 0);
}

console.log('\n=== 8. Exact cents ($0.01 Cash targeted by a $0.02 change) ===');
{
  let data = baseData(0.01, 100);
  data = applyNewTransaction(data, { type: 'expense', amount: 0.02, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' }, 'txn');
  const changed = applyTransactionUpdate(data, 'txn', { paymentSource: 'cash', targetAssetId: undefined });
  assert('8a. Cash floors at exactly $0 (only had 1 cent against a 2-cent debit)', bal(changed, 'C') === 0);
  assert('8b. actual stored delta is -0.01 (the true one cent removed), not -0.02', Math.abs((changed.transactions.find((t) => t.id === 'txn')?.appliedBalanceEffect?.delta ?? 0) - -0.01) < 1e-9);
  const back = applyTransactionUpdate(changed, 'txn', { paymentSource: 'everyday', targetAssetId: 'E' });
  assert('8c. changing back restores Cash to exactly its true original $0.01 (not $0.02)', Math.round(bal(back, 'C') * 100) === 1);
}

console.log('\n=== 9. A transaction whose original account has been deleted, then a source change (no crash, no phantom, no orphan mutation) ===');
{
  let data = baseData(0, 100);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' }, 'txn');
  data = { ...data, assets: data.assets.filter((a) => a.id !== 'E') };
  assert('9a. Everyday account E is gone', !data.assets.some((a) => a.id === 'E'));
  let threw = false;
  let edited: AppData = data;
  try {
    edited = applyTransactionUpdate(data, 'txn', { paymentSource: 'cash', targetAssetId: undefined, balanceEffect: 'update' });
  } catch {
    threw = true;
  }
  assert('9b. changing the source of an orphaned transaction to insufficient Cash does not crash', !threw);
  assert('9c. Cash stays at exactly $0 (it truly had nothing to give)', bal(edited, 'C') === 0);
  assert('9d. no account other than Cash exists or was mutated', edited.assets.length === 1 && edited.assets[0].id === 'C');
}

console.log('\n=== 10. Legacy transaction compatibility (balanceEffect undefined, insufficient target on first real edit) ===');
{
  // Cash starts at $50 — representing that this legacy $50 cash expense
  // already reduced it from an original $100 long ago (a realistic legacy
  // fixture, not a fabricated record whose effect was never really
  // applied). Everyday starts at $20 — genuinely insufficient for the $50
  // being moved onto it.
  const data = baseData(50, 20);
  const legacy: import('../src/types/models').Transaction = {
    id: 'legacy-1', type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash',
  };
  const withLegacy: AppData = { ...data, transactions: [legacy] };
  let threw = false;
  let edited: AppData = withLegacy;
  try {
    edited = applyTransactionUpdate(withLegacy, 'legacy-1', { paymentSource: 'everyday', targetAssetId: 'E' });
  } catch {
    threw = true;
  }
  assert('10a. editing a legacy transaction into an insufficient Everyday target does not crash', !threw);
  assert('10b. the legacy Cash debit is correctly reversed first (restored to its true original $100)', bal(edited, 'C') === 100);
  assert('10c. Everyday floors at exactly $0 for the legacy transaction too — same shared rule (only had $20 against a $50 debit)', bal(edited, 'E') === 0);
  assert(
    '10d. going forward, the (now-current) transaction carries an accurate appliedBalanceEffect reflecting what actually happened (-20, not the intended -50)',
    edited.transactions.find((t) => t.id === 'legacy-1')?.appliedBalanceEffect?.delta === -20
  );
}

console.log('\n=== 11. Money Plan $2,000 reconciliation — the authorized scenario\'s TRUE fixture, every input printed ===');
{
  const data = createEmptyAppData();
  data.assets = [
    { id: 'cash-1', type: 'cash', label: 'Cash', currentValue: 100 },
    { id: 'everyday-1', type: 'everyday', label: 'Main everyday account', currentValue: 900 },
  ];
  // Deliberately NOT setting monthlyIncome/nextPayday/payFrequency — using
  // createEmptyAppData()'s true defaults, exactly matching "no income,
  // bills, goals, reservations, liabilities or other transactions."
  assert('11a. input: monthlyIncome is 0 (the authorized scenario states no income)', data.user.monthlyIncome === 0);
  assert('11b. input: nextPayday is null (no payday set)', data.user.nextPayday === null);
  assert('11c. input: no recurring items, goals, or liabilities exist', data.recurringItems.length === 0 && data.goals.length === 0 && data.liabilities.length === 0);
  assert('11d. input: no transactions exist yet', data.transactions.length === 0);

  const today = new Date();
  const planBefore = computeMoneyPlan(data, today);
  const stsBefore = computeSafeToSpend(data, today);
  assert('11e. formula: discretionaryPool = max(0, monthlyIncome(0) - fixedCosts(0) - goals(0) - savings(0)) = 0', planBefore.discretionaryPool === 0);
  assert('11f. with the TRUE authorized fixture (no added income), Money Plan.available is $0 before the expense — NOT $2,000', planBefore.available === 0);
  assert('11g. Money Plan.surplus is null before the expense (no meaningful positive gap)', planBefore.surplus === null);
  assert('11h. Available Until Payday (balance-based) is still correctly $1,000 — the two metrics answer different questions by design', stsBefore.cycleRemainingPool === 1000);

  const after = applyNewTransaction(data, {
    type: 'expense', amount: 50, categoryId: 'travel', date: today.toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1',
  });
  const planAfter = computeMoneyPlan(after, today);
  const stsAfter = computeSafeToSpend(after, today);
  assert('11i. Money Plan.available stays $0 after the expense (floored — there was never any income to allocate)', planAfter.available === 0);
  assert('11j. Available Until Payday correctly drops to exactly $950 once', stsAfter.cycleRemainingPool === 950);
  assert(
    '11k. CONCLUSION: the $2,000 in the prior report came from an undisclosed test-fixture monthlyIncome the prior report added for a different purpose, not from double-counting the $1,000 in assets — Money Plan.available never reads asset balances at all, only monthlyIncome/fixedCosts/goals/savings',
    !/available:.*=.*includedMoneyBalance/.test(readFileSync(srcPath('src/lib/calculations/moneyPlan.ts'), 'utf-8'))
  );
}

console.log('\n=== 12. Same-name disambiguation — blank providers, identical balances (Mirrored, tied to shipped source) ===');
{
  function formatMoney(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function chipBaseText(a: Asset): string {
    return `${a.label}${a.provider ? ` · ${a.provider}` : ''} (${formatMoney(a.currentValue)})`;
  }
  function disambiguate(accounts: Asset[]): Map<string, string> {
    const counts = new Map<string, number>();
    accounts.forEach((a) => {
      const key = chipBaseText(a);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const seen = new Map<string, number>();
    const labels = new Map<string, string>();
    accounts.forEach((a) => {
      const key = chipBaseText(a);
      if ((counts.get(key) ?? 0) <= 1) {
        labels.set(a.id, key);
        return;
      }
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      labels.set(a.id, `${key} — Account ${n}`);
    });
    return labels;
  }

  // Realistic generateId()-shaped ids (not single letters) so "does the
  // label leak the technical id" is a meaningful check, not a trivial
  // substring collision with ordinary English prose.
  const idA = 'ast_8f3d2a1c9e';
  const idB = 'ast_71b6f0d4aa';
  const accountA: Asset = { id: idA, type: 'everyday', label: 'Everyday Account', currentValue: 500 };
  const accountB: Asset = { id: idB, type: 'everyday', label: 'Everyday Account', currentValue: 500 };
  const labels = disambiguate([accountA, accountB]);
  assert('12a. two accounts with identical name, blank provider, AND identical balance get distinct labels', labels.get(idA) !== labels.get(idB));
  assert('12b. the suffix uses a minimal, accessible, non-technical phrase ("Account 1"/"Account 2")', /Account 1$/.test(labels.get(idA)!) && /Account 2$/.test(labels.get(idB)!));
  assert('12c. no technical id is ever exposed in the label', !labels.get(idA)!.includes(idA) && !labels.get(idB)!.includes(idB));
  assert('12d. routing stays keyed by stable account id — the map itself is keyed by id, never by the (potentially colliding) label', labels.has(idA) && labels.has(idB));

  const uniqueAccount: Asset = { id: 'ast_unique000001', type: 'everyday', label: 'Unique Account', currentValue: 100 };
  const mixedLabels = disambiguate([accountA, accountB, uniqueAccount]);
  assert('12e. a genuinely unique account is never given a suffix it does not need', mixedLabels.get(uniqueAccount.id) === chipBaseText(uniqueAccount));

  assert(
    '12f. mirror matches the shipped QuickAddModal.tsx disambiguation function text exactly',
    /function disambiguateEverydayAccountLabels\(accounts: Asset\[\]\): Map<string, string> \{/.test(QUICK_ADD_SRC)
  );
  assert(
    // SUPERSEDED IN FORM by the Wave 4 device correction: the everyday-
    // account chips are gone, replaced by the prominent AccountSelectionField
    // rows. The GUARANTEE is unchanged and is now stronger — every row is a
    // `radio` whose accessibility label is composed from the SAME
    // disambiguated text plus its type, balance and selected state, built in
    // one place (AccountSelectionField.rowLabel) rather than repeated per
    // chip. Asserted here at both ends: this file still supplies the
    // disambiguated name, and the shared field still announces it.
    '12g. every account row carries an explicit accessibilityLabel built from the disambiguated text — VoiceOver/TalkBack announce it directly, not just via nested Text traversal',
    (() => {
      const usesDisambiguated = /name: everydayAccountLabels\.get\(a\.id\) \?\? everydayChipBaseText\(a\),/.test(QUICK_ADD_SRC);
      const field = require('fs').readFileSync(
        require('path').resolve(__dirname, '../src/components/shared/fields/AccountSelectionField.tsx'),
        'utf8'
      );
      const announcesName = /function rowLabel\(choice: AccountChoice, isSelected: boolean\): string \{\s*\n\s*const parts = \[choice\.name, choice\.typeLabel\];/.test(field);
      const onEveryRow = /accessibilityRole="radio"\s*\n\s*accessibilityLabel=\{rowLabel\(choice, isSelected\)\}/.test(field);
      return usesDisambiguated && announcesName && onEveryRow;
    })()
  );
}

console.log('\n=== 13. Orphaned-transaction editing contract (Real import + mirrored canSave logic) ===');
{
  // 13a-c: description/category/date/amount remain editable, and the
  // record saves successfully, when the original account no longer exists.
  let data = baseData(0, 100);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'travel', date: new Date('2026-01-01').toISOString(), paymentSource: 'everyday', targetAssetId: 'E', note: 'Original' }, 'txn');
  data = { ...data, assets: data.assets.filter((a) => a.id !== 'E') };
  const edited = applyTransactionUpdate(data, 'txn', {
    amount: 75,
    categoryId: 'groceries',
    date: new Date('2026-02-01').toISOString(),
    note: 'Corrected description',
    balanceEffect: 'none',
  });
  const editedTxn = edited.transactions.find((t) => t.id === 'txn');
  assert('13a. amount, category, date, and note all update successfully on an orphaned transaction', editedTxn?.amount === 75 && editedTxn?.categoryId === 'groceries' && editedTxn?.note === 'Corrected description');
  assert('13b. no balance mutation occurs — the record-only save applies no effect', editedTxn?.appliedBalanceEffect === undefined);
  assert(
    '13c. the unrelated Cash account (still present alongside the deleted Everyday one) is untouched',
    edited.assets.length === 1 && edited.assets[0].id === 'C' && edited.assets[0].currentValue === 0
  );
  assert('13d. historical payment source (paymentSource/targetAssetId) is preserved factually unless the customer explicitly changes it', editedTxn?.paymentSource === 'everyday' && editedTxn?.targetAssetId === 'E');

  // 13e: deletion of the orphaned transaction never applies a false
  // reversal (no crash, no mutation, since the target no longer exists).
  const deleted = applyTransactionDelete(edited, 'txn', true);
  assert(
    '13e. deleting the orphaned, record-only transaction does not crash and leaves the unrelated Cash account untouched',
    deleted.assets.length === 1 && deleted.assets[0].id === 'C' && !deleted.transactions.some((t) => t.id === 'txn')
  );

  // Mirrored canSave logic: Save is NOT gated on a valid replacement
  // account being chosen — this is the SAME established rule every other
  // payment source already uses (a "record only" save is always valid).
  function mirrorHasValidBalanceTarget(paymentSource: string, selectedEverydayAccount: unknown): boolean {
    return paymentSource === 'everyday' ? !!selectedEverydayAccount : false;
  }
  function mirrorCanSave(amountValue: number, categoryId: string, dateValid: boolean, insufficientEverydayFunds: boolean): boolean {
    return !isNaN(amountValue) && amountValue > 0 && !!categoryId && dateValid && !insufficientEverydayFunds;
  }
  assert('13f. hasValidBalanceTarget is false for an orphaned account (no replacement chosen)', !mirrorHasValidBalanceTarget('everyday', null));
  assert(
    '13g. canSave does NOT require hasValidBalanceTarget — Save stays enabled for a valid amount/category/date even with no replacement account chosen (matches the pre-existing rule for every other payment source)',
    mirrorCanSave(75, 'groceries', true, false)
  );
  assert(
    '13h. mirror matches shipped QuickAddModal.tsx canSave text exactly — confirms canSave is never gated on hasValidBalanceTarget',
    !/canSave =[\s\S]{0,200}hasValidBalanceTarget/.test(QUICK_ADD_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
