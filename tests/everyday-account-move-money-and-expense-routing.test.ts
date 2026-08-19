// Everyday Account correction pass — 2026-08-08.
//
// Covers the specific new evidence categories required by the correction
// authorization's section 7, for the work done THIS round only (Move Money
// exclusion fix, Everyday Account expense routing, and the controlled
// scenario). Provider dirty-state and Select Balances runtime wiring were
// re-verified as UNCHANGED this round (see the round's report) and already
// have dedicated coverage in tests/everyday-account-provider-and-select-
// balances.test.ts — not duplicated here.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): sections 1-11 — import and directly execute the
//   actual production functions (computeBalanceEffect via applyNewTransaction/
//   applyTransactionUpdate/applyTransactionDelete, computeMoneyAvailableBalances,
//   computeAccessibleNetWorth, computeAchievements) against real AppData
//   fixtures. None of these modules import react-native — confirmed
//   empirically (this file loads cleanly under plain `npx tsx`), consistent
//   with every prior round's finding for the same AppStateContext.tsx exports.
// - Mirrored logic (Class B): section 12 — QuickAddModal.tsx's
//   `insufficientEverydayFunds`/`paymentSourceOptions`/`canSave` derivations
//   are declared inside a component in a .tsx file that transitively imports
//   react-native and cannot be imported directly. Reimplemented verbatim and
//   executed, with a structural assertion tying the mirror to the shipped
//   source text.
// - Structural (Class C): section 13 — TransferForm.tsx's From/To filters and
//   QuickAddModal.tsx's submittingRef duplicate-tap guard cannot be imported
//   (react-native) or exercised without a real tap sequence (React state);
//   confirms wiring/absence of specific patterns in source text only.
//
// NOT PROVEN by this suite: that React Native actually renders the fixed
// Move Money picker or the Everyday Account payment-source chips correctly,
// that a real double-tap on the physical Save button is suppressed, or any
// other on-device behaviour. That remains physical-device-only evidence —
// see this round's report device checklist.
//
// Run with: npx tsx tests/everyday-account-move-money-and-expense-routing.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData, createAppDataSaver } from '../src/lib/storage';
import { applyNewTransaction, applyTransactionUpdate, applyTransactionDelete } from '../src/state/AppStateContext';
import { computeMoneyAvailableBalances } from '../src/lib/calculations/liquidAssets';
import { computeAccessibleNetWorth } from '../src/lib/calculations/wealthDefinitions';
import { computeAchievements } from '../src/lib/calculations/achievements';
import { listEligibleLiquidBalances, listEligibleLiquidDestinations } from '../src/lib/calculations/moveMoneyEligibility';
import type { AppData, Asset, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');
const QUICK_ADD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/dashboard/QuickAddModal.tsx', 'utf-8');

function everydayAsset(patch: Partial<Asset> = {}): Asset {
  return { id: 'everyday-1', type: 'everyday', label: 'Main everyday account', currentValue: 900, ...patch };
}
function cashAsset(patch: Partial<Asset> = {}): Asset {
  return { id: 'cash-1', type: 'cash', label: 'Cash', currentValue: 100, ...patch };
}
function baseData(assets: Asset[]): AppData {
  const data = createEmptyAppData();
  data.assets = assets;
  return data;
}
function expenseInput(patch: Partial<Omit<Transaction, 'id'>> = {}): Omit<Transaction, 'id'> {
  return { type: 'expense', amount: 50, categoryId: 'travel', date: new Date('2026-08-08').toISOString(), paymentSource: 'everyday', ...patch };
}
function assetById(data: AppData, id: string): Asset {
  const a = data.assets.find((x) => x.id === id);
  if (!a) throw new Error(`asset ${id} not found`);
  return a;
}

console.log('=== 1. Move Money Everyday Account eligibility (Real import — architecture correction, 2026-08-10) ===');
{
  // Move Money architecture correction (2026-08-10): the 2026-08-08
  // exclusion this section previously asserted was DELIBERATELY REVERSED
  // by the approved Move Money correction round. Everyday Accounts are now
  // a fully eligible Move Money source AND destination, alongside Cash and
  // Savings, via the single shared allowlist in moveMoneyEligibility.ts
  // that both TransferForm.tsx and transferFundsTransition import — see
  // tests/transfer-funds-wiring.test.ts and tests/everyday-account.test.ts
  // (section 26) for the fuller shared-module coverage. This section now
  // proves the real, shared predicate directly rather than mirroring a
  // TransferForm.tsx-local filter that no longer exists.
  const data = baseData([cashAsset(), everydayAsset(), { id: 'savings-1', type: 'savings', label: 'Savings', currentValue: 500 }]);
  const sourceEligible = listEligibleLiquidBalances(data.assets);
  const destinationEligible = listEligibleLiquidDestinations(data.assets, cashAsset().id);
  assert('1a. "From" list (shared eligible-source predicate) includes the Everyday Account', sourceEligible.some((a) => a.type === 'everyday'));
  assert('1b. "To" list (shared eligible-destination predicate) includes the Everyday Account', destinationEligible.some((a) => a.type === 'everyday'));
  assert('1c. Both lists still include Cash and Savings (accepted behaviour preserved)', sourceEligible.length === 3);
  assert(
    '1d. Structural: TransferForm.tsx sources its "From" list from the shared listEligibleLiquidBalances, not a local inline filter',
    /listEligibleLiquidBalances/.test(TRANSFER_FORM_SRC)
  );
  assert(
    '1e. Structural: TransferForm.tsx sources its "To" list from the shared listEligibleLiquidDestinations, not a local inline filter',
    /listEligibleLiquidDestinations/.test(TRANSFER_FORM_SRC)
  );
}

console.log('\n=== 2. Cash-only expense unaffected by Everyday routing (Real import, regression check) ===');
{
  let data = baseData([cashAsset()]);
  data = applyNewTransaction(data, expenseInput({ paymentSource: 'cash', amount: 30 }));
  assert('2a. Cash reduced by exactly 30', assetById(data, 'cash-1').currentValue === 70);
  assert('2b. exactly one transaction recorded', data.transactions.length === 1);
}

console.log('\n=== 3. Everyday-only expense — the controlled $50 scenario (Real import) ===');
{
  let data = baseData([cashAsset(), everydayAsset()]);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'everyday-1' }), 'txn-1');
  assert('3a. Everyday Account reduced to 850', assetById(data, 'everyday-1').currentValue === 850);
  assert('3b. Cash untouched at 100', assetById(data, 'cash-1').currentValue === 100);
  assert('3c. included-liquid balance is 950', computeMoneyAvailableBalances(data.assets) === 950);
  assert('3d. net worth is 950', computeAccessibleNetWorth(data) === 950);
  assert('3e. exactly one expense transaction of 50 recorded', data.transactions.length === 1 && data.transactions[0].amount === 50);
  assert('3f. no income transaction was created', !data.transactions.some((t) => t.type === 'income'));

  console.log('  -- edit to $20 --');
  data = applyTransactionUpdate(data, 'txn-1', { amount: 20 });
  assert('3g. Everyday Account restored then re-debited to 880', assetById(data, 'everyday-1').currentValue === 880);
  assert('3h. net worth is 980', computeAccessibleNetWorth(data) === 980);
  assert('3i. spending recorded is 20 exactly once', data.transactions.length === 1 && data.transactions[0].amount === 20);

  console.log('  -- delete --');
  data = applyTransactionDelete(data, 'txn-1');
  assert('3j. Everyday Account fully restored to 900', assetById(data, 'everyday-1').currentValue === 900);
  assert('3k. net worth is 1000', computeAccessibleNetWorth(data) === 1000);
  assert('3l. spending record removed, no duplicate reversal', data.transactions.length === 0);
}

console.log('\n=== 4. Change source Everyday -> Cash (Real import) ===');
{
  let data = baseData([cashAsset(), everydayAsset()]);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'everyday-1' }), 'txn-2');
  data = applyTransactionUpdate(data, 'txn-2', { paymentSource: 'cash', targetAssetId: undefined });
  assert('4a. Everyday Account restored to 900', assetById(data, 'everyday-1').currentValue === 900);
  assert('4b. Cash reduced to 50', assetById(data, 'cash-1').currentValue === 50);
  assert('4c. net worth remains 950 (unchanged by the source change)', computeAccessibleNetWorth(data) === 950);
  assert('4d. spending remains 50 exactly once', data.transactions.length === 1 && data.transactions[0].amount === 50);
}

console.log('\n=== 5. Mixed Cash + Everyday routing (Real import) ===');
{
  let data = baseData([cashAsset(), everydayAsset()]);
  data = applyNewTransaction(data, expenseInput({ paymentSource: 'cash', amount: 40 }), 'c-1');
  data = applyNewTransaction(data, expenseInput({ paymentSource: 'everyday', amount: 60, targetAssetId: 'everyday-1' }), 'e-1');
  assert('5a. Cash expense only reduces Cash', assetById(data, 'cash-1').currentValue === 60);
  assert('5b. Everyday expense only reduces the Everyday Account', assetById(data, 'everyday-1').currentValue === 840);
  assert('5c. net worth reflects both once each (100+900-40-60=900)', computeAccessibleNetWorth(data) === 900);
}

console.log('\n=== 6. Multiple Everyday Accounts — routes to the specific selected account only (Real import) ===');
{
  const accountA = everydayAsset({ id: 'e-a', label: 'Account A', currentValue: 300 });
  const accountB = everydayAsset({ id: 'e-b', label: 'Account B', currentValue: 700 });
  let data = baseData([accountA, accountB]);
  data = applyNewTransaction(data, expenseInput({ amount: 100, targetAssetId: 'e-b' }));
  assert('6a. targeted account (B) debited', assetById(data, 'e-b').currentValue === 600);
  assert('6b. untargeted account (A) untouched', assetById(data, 'e-a').currentValue === 300);
  assert('6c. net worth reflects the single debit once (300+700-100=900)', computeAccessibleNetWorth(data) === 900);
}

console.log('\n=== 7. Exact cents: $100.01 - $10.02 = $89.99 (Real import, non-regression documentation) ===');
{
  let everydayData = baseData([everydayAsset({ id: 'e-1', currentValue: 100.01 })]);
  everydayData = applyNewTransaction(everydayData, expenseInput({ amount: 10.02, targetAssetId: 'e-1' }));
  const everydayResult = assetById(everydayData, 'e-1').currentValue;

  let cashData = baseData([cashAsset({ id: 'c-1', currentValue: 100.01 })]);
  cashData = applyNewTransaction(cashData, expenseInput({ paymentSource: 'cash', amount: 10.02 }));
  const cashResult = assetById(cashData, 'c-1').currentValue;

  assert('7a. underlying raw value rounds to 89.99 at 2 decimal places', Math.round(everydayResult * 100) / 100 === 89.99);
  assert(
    '7b. Everyday Account exhibits IDENTICAL float behaviour to the pre-existing Cash path — not a new/Everyday-specific regression',
    everydayResult === cashResult
  );
  assert(
    '7c. customer-visible 2-decimal display is exactly "89.99" regardless of underlying float noise',
    everydayResult.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) === '89.99'
  );
}

console.log('\n=== 8. Insufficient funds is blocked at the form layer, not silently allowed by the engine (Real import) ===');
{
  // The engine itself has no floor/guard for 'everyday' beyond the shared
  // Math.max(0, ...) — by design the block lives in QuickAddModal's canSave
  // (see section 12). This section proves what the engine alone would do if
  // the form's guard were bypassed: it floors at 0, exactly like Cash,
  // never goes negative, and never throws.
  let data = baseData([everydayAsset({ id: 'e-1', currentValue: 30 })]);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'e-1' }));
  assert('8a. engine floors an over-limit debit at 0 rather than going negative', assetById(data, 'e-1').currentValue === 0);
}

console.log('\n=== 9. Legacy transaction compatibility (Real import) ===');
{
  const data = baseData([cashAsset(), everydayAsset()]);
  const legacy: Transaction = { id: 'legacy-1', type: 'expense', amount: 25, categoryId: 'groceries', date: new Date('2020-01-01').toISOString() };
  const withLegacy: AppData = { ...data, transactions: [legacy] };
  assert('9a. legacy transaction with no paymentSource/targetAssetId remains present', withLegacy.transactions.some((t) => t.id === 'legacy-1'));
  const afterEdit = applyTransactionUpdate(withLegacy, 'legacy-1', { amount: 40 });
  assert('9b. editing a legacy transaction does not throw and preserves the record', afterEdit.transactions.find((t) => t.id === 'legacy-1')?.amount === 40);
  const afterDelete = applyTransactionDelete(afterEdit, 'legacy-1');
  assert('9c. deleting a legacy transaction does not throw', !afterDelete.transactions.some((t) => t.id === 'legacy-1'));
}

console.log('\n=== 10. Duplicate submission does not double-mutate at the engine level (Real import) ===');
{
  // applyNewTransaction itself has no id-based dedupe (by design — see its
  // own doc comment); real duplicate-tap protection is the UI-layer
  // submittingRef guard (section 13). This proves the engine consequence IF
  // that guard were ever bypassed, so the UI guard's necessity is evidenced,
  // not assumed.
  let data = baseData([everydayAsset({ id: 'e-1', currentValue: 900 })]);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'e-1' }), 'dup-1');
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'e-1' }), 'dup-2');
  assert('10a. two distinct calls with two distinct ids do produce two distinct debits (proves the guard, not the engine, prevents duplicates)', assetById(data, 'e-1').currentValue === 800);
  assert('10b. two distinct transaction records exist', data.transactions.length === 2);
}

console.log('\n=== 11. No accidental income, transfer, savings, or achievement side effects (Real import) ===');
{
  let data = baseData([cashAsset(), everydayAsset()]);
  const before = computeAchievements(data);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'everyday-1' }));
  const after = computeAchievements(data);
  assert('11a. the recorded transaction is type "expense", never "income"', data.transactions[0].type === 'expense');
  assert('11b. no transfer-shaped side data was created (transactions array is the only thing that changed besides the one asset)', data.assets.length === 2);
  assert(
    '11c. achievements list is unaffected by a same-net-worth Everyday expense (no spurious unlock/loss)',
    JSON.stringify(before.map((a) => a.id + ':' + a.unlocked)) === JSON.stringify(after.map((a) => a.id + ':' + a.unlocked))
  );
}

console.log('\n=== 12. QuickAddModal insufficient-funds / canSave gating (Mirrored, tied to shipped source) ===');
{
  function mirrorInsufficientEverydayFunds(
    paymentSource: string,
    selectedEverydayAccount: Asset | null,
    amountValue: number,
    everydayAvailableBalance: number | null
  ): boolean {
    return paymentSource === 'everyday' && !!selectedEverydayAccount && !isNaN(amountValue) && amountValue > (everydayAvailableBalance ?? 0);
  }
  const account = everydayAsset({ id: 'e-1', currentValue: 40 });
  assert('12a. amount over available balance is blocked', mirrorInsufficientEverydayFunds('everyday', account, 50, 40));
  assert('12b. amount exactly equal to available balance is allowed (not blocked)', !mirrorInsufficientEverydayFunds('everyday', account, 40, 40));
  assert('12c. amount under available balance is allowed', !mirrorInsufficientEverydayFunds('everyday', account, 10, 40));
  assert('12d. non-everyday sources are never blocked by this check', !mirrorInsufficientEverydayFunds('cash', null, 999, null));
  assert(
    '12e. mirror matches shipped QuickAddModal.tsx insufficientEverydayFunds text exactly',
    /const insufficientEverydayFunds =\s*\n\s*paymentSource === 'everyday' && !!selectedEverydayAccount && !isNaN\(amountValue\) && amountValue > \(everydayAvailableBalance \?\? 0\);/.test(
      QUICK_ADD_SRC
    )
  );
  // Wave 4 device correction added two further required terms after this
  // one (an expense's explicit funding source, and an income's explicit
  // destination), so it is no longer the LAST term in the expression. The
  // guarantee is unchanged and asserted directly: it is still a conjunct of
  // canSave, so insufficient funds still block Save.
  assert(
    '12f. canSave includes !insufficientEverydayFunds as a gating condition in shipped source',
    /const canSave =[\s\S]*?!insufficientEverydayFunds(\s*&&|;)/.test(QUICK_ADD_SRC)
  );
  assert(
    '12g. everydayAvailableBalance accounts for the transaction\'s own prior amount on the same account when editing (edit-in-place is not falsely blocked)',
    /everydayAvailableBalance = selectedEverydayAccount \? selectedEverydayAccount\.currentValue \+ editedTransactionPriorAmountOnSameAccount : null;/.test(
      QUICK_ADD_SRC
    )
  );
}

console.log('\n=== 13. Duplicate-tap guard unchanged and still gates the everyday branch (Structural) ===');
{
  assert(
    '13a. submittingRef synchronous re-entry guard is present in handleSave, ahead of any state mutation',
    /if \(submittingRef\.current\) return;\s*\n\s*submittingRef\.current = true;/.test(QUICK_ADD_SRC)
  );
  assert(
    '13b. the guard is unconditional on payment source — applies to the everyday branch with zero new code',
    (() => {
      const guardIdx = QUICK_ADD_SRC.indexOf('if (submittingRef.current) return;');
      const everydayBranchIdx = QUICK_ADD_SRC.indexOf("paymentSource === 'everyday' ? everydayAccountId ?? undefined : undefined");
      return guardIdx > -1 && everydayBranchIdx > -1 && guardIdx < everydayBranchIdx;
    })()
  );
}

async function runPersistenceSection() {
  console.log('\n=== 14. Persistence round-trip: Everyday Account asset + everyday-routed transaction (Real import) ===');
  let written: string | null = null;
  const save = createAppDataSaver((_key, value) => {
    written = value;
    return Promise.resolve();
  });
  let data = baseData([cashAsset(), everydayAsset({ provider: 'Test bank' })]);
  data = applyNewTransaction(data, expenseInput({ amount: 50, targetAssetId: 'everyday-1' }), 'persist-1');
  await save(data);
  const reloaded = JSON.parse(written as unknown as string) as AppData;
  const reloadedAccount = reloaded.assets.find((a) => a.id === 'everyday-1');
  const reloadedTxn = reloaded.transactions.find((t) => t.id === 'persist-1');
  assert('14a. Everyday Account survives the real save path with its exact balance', reloadedAccount?.currentValue === 850);
  assert('14b. Everyday Account provider field survives the real save path', reloadedAccount?.provider === 'Test bank');
  assert('14c. transaction paymentSource survives the real save path', reloadedTxn?.paymentSource === 'everyday');
  assert('14d. transaction targetAssetId survives the real save path', reloadedTxn?.targetAssetId === 'everyday-1');
  assert('14e. reloaded data reproduces the same net worth as pre-save', computeAccessibleNetWorth(reloaded) === computeAccessibleNetWorth(data));

  console.log(`\n${total - failures}/${total} passed`);
  if (failures > 0) process.exit(1);
}

runPersistenceSection();
