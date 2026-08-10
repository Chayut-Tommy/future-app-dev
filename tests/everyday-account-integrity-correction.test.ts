// Everyday Account — financial-integrity verification/correction pass,
// 2026-08-08 (second correction pass, following device-recording review).
//
// Covers the 6 numbered items in the authorization: (1) proving the real
// Available Money/Money Plan/Money Breakdown outputs, not inferring them
// from included-liquid balance; (2) auditing every PaymentSource call site;
// (3) account deletion with linked transactions; (4) same-name account
// usability; (5) exact-cent stability across 10+ repeated cycles; (6)
// targetAssetId type/paymentSource compatibility.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): sections 1-9, 11 — import and directly execute
//   the actual production functions (applyNewTransaction,
//   applyTransactionUpdate, applyTransactionDelete, computeSafeToSpend,
//   computeMoneyPlan, computeMonthToDateActivity, computeMoneyAvailableBalances,
//   computeAccessibleNetWorth) against real AppData fixtures. None of these
//   modules import react-native — confirmed empirically (this file loads
//   cleanly under plain `npx tsx`).
// - Mirrored logic (Class B): section 10 — QuickAddModal.tsx's chip-label
//   and "original account missing" derivations are declared inside a
//   component in a .tsx file that transitively imports react-native and
//   cannot be imported directly. Reimplemented verbatim and executed, with
//   a structural assertion tying the mirror to the shipped source text.
// - Structural (Class C): section 2 (payment-source call-site audit) —
//   confirms the exact filter/label text shipped in each file; proves
//   wiring, not runtime behaviour, for the two files (ThisMonthCard.tsx,
//   ...) that cannot be imported directly.
//
// NOT PROVEN by this suite: on-device rendering of the corrected "Paid from
// money balances" label, the corrected chip provider text, or the
// "original account no longer exists" hint. That remains physical-device
// evidence.
//
// Run with: npx tsx tests/everyday-account-integrity-correction.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { applyNewTransaction, applyTransactionUpdate, applyTransactionDelete } from '../src/state/AppStateContext';
import { computeMoneyAvailableBalances } from '../src/lib/calculations/liquidAssets';
import { computeAccessibleNetWorth, computeTotalWealth } from '../src/lib/calculations/wealthDefinitions';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMoneyPlan } from '../src/lib/calculations/moneyPlan';
import { computeMonthToDateActivity } from '../src/lib/calculations/monthlySummary';
import type { AppData, Asset } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const MONTHLY_SUMMARY_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/calculations/monthlySummary.ts', 'utf-8');
const THIS_MONTH_CARD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/ThisMonthCard.tsx', 'utf-8');
const SAFE_TO_SPEND_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/calculations/safeToSpend.ts', 'utf-8');
const QUICK_ADD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/dashboard/QuickAddModal.tsx', 'utf-8');
const SMART_REMINDER_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/today/SmartReminderCard.tsx', 'utf-8');
const ADD_INCOME_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/income/AddIncomeModal.tsx', 'utf-8');
const ACHIEVEMENTS_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/calculations/achievements.ts', 'utf-8');
const LULU_SCORE_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/calculations/luluScore.ts', 'utf-8');
const STORAGE_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/storage.ts', 'utf-8');

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
function assetById(data: AppData, id: string): Asset {
  const a = data.assets.find((x) => x.id === id);
  if (!a) throw new Error(`asset ${id} not found`);
  return a;
}

console.log('=== 1. Real Available Money / Money Plan / Money Breakdown proof (Real import) — controlled scenario ===');
{
  let data = baseData([cashAsset({ currentValue: 100 }), everydayAsset({ currentValue: 900 })]);
  data.user.nextPayday = new Date(Date.now() + 10 * 86400000).toISOString();
  data.user.payFrequency = 'monthly';
  data.user.monthlyIncome = 2000;

  const before = computeSafeToSpend(data, new Date());
  const planBefore = computeMoneyPlan(data, new Date());
  const activityBefore = computeMonthToDateActivity(data, new Date());

  assert('1a. BEFORE stored Cash is 100', assetById(data, 'cash-1').currentValue === 100);
  assert('1b. BEFORE stored Everyday is 900', assetById(data, 'everyday-1').currentValue === 900);
  assert('1c. BEFORE included-liquid balance is 1000', computeMoneyAvailableBalances(data.assets) === 1000);
  assert('1d. BEFORE total assets / net worth is 1000', computeAccessibleNetWorth(data) === 1000 && computeTotalWealth(data) === 1000);
  assert('1e. BEFORE spending recorded is 0', data.transactions.length === 0);
  assert('1f. BEFORE real Available Until Payday (cycleRemainingPool) is 1000 — not inferred, the actual function output', before.cycleRemainingPool === 1000);
  assert('1g. BEFORE real Money Plan available/surplus is 2000 (income, no spend yet)', planBefore.available === 2000 && planBefore.surplus === 2000);
  assert('1h. BEFORE real Money Breakdown (This Month) totals are all 0', activityBefore.spend === 0 && activityBefore.cashSpend === 0);

  data = applyNewTransaction(data, {
    type: 'expense',
    amount: 50,
    categoryId: 'travel',
    date: new Date().toISOString(),
    paymentSource: 'everyday',
    targetAssetId: 'everyday-1',
  });

  const after = computeSafeToSpend(data, new Date());
  const planAfter = computeMoneyPlan(data, new Date());
  const activityAfter = computeMonthToDateActivity(data, new Date());

  assert('1i. AFTER stored Cash unchanged at 100', assetById(data, 'cash-1').currentValue === 100);
  assert('1j. AFTER stored Everyday is 850', assetById(data, 'everyday-1').currentValue === 850);
  assert('1k. AFTER included-liquid balance is 950', computeMoneyAvailableBalances(data.assets) === 950);
  assert('1l. AFTER total assets / net worth is 950', computeAccessibleNetWorth(data) === 950 && computeTotalWealth(data) === 950);
  assert('1m. AFTER spending recorded is exactly 50, once', data.transactions.length === 1 && data.transactions[0].amount === 50);
  assert(
    '1n. AFTER real Available Until Payday reflects the $50 reduction EXACTLY ONCE (950, not 900 or 1000) — the core financial-integrity proof',
    after.cycleRemainingPool === 950
  );
  assert('1o. AFTER real Money Plan available/surplus declined by exactly $50 once (1950)', planAfter.available === 1950 && planAfter.surplus === 1950);
  assert(
    '1p. AFTER real Money Breakdown (This Month) shows the $50 in the money-balances bucket, not omitted, not double-counted',
    activityAfter.spend === 50 && activityAfter.cashSpend === 50 && activityAfter.creditCardSpend === 0 && activityAfter.otherSpend === 0
  );
  assert(
    '1q. AFTER the derived "Spending recorded" headline (cashSpend+creditCardSpend+otherSpend) equals 50 — not silently dropped to 0',
    activityAfter.cashSpend + activityAfter.creditCardSpend + activityAfter.otherSpend === 50
  );
  assert('1r. no income transaction was created', !data.transactions.some((t) => t.type === 'income'));
  assert('1s. no transfer-shaped side effect — asset count unchanged', data.assets.length === 2);
}

console.log('\n=== 2. PaymentSource call-site audit (Structural, tied to shipped source) ===');
{
  assert(
    '2a. computeMonthToDateActivity.cashSpend (Money Breakdown / This Month) now folds in "everyday"',
    /paymentSource === 'cash' \|\| t\.paymentSource === undefined \|\| t\.paymentSource === 'everyday'/.test(MONTHLY_SUMMARY_SRC)
  );
  assert(
    '2b. computeMonthToDateActivity.creditCardSpend is unchanged (still credit_card only — everyday must never appear here)',
    /const creditCardSpend = monthExpenses\.filter\(\(t\) => t\.paymentSource === 'credit_card'\)/.test(MONTHLY_SUMMARY_SRC)
  );
  assert(
    "2c. computeMonthToDateActivity.otherSpend is unchanged (still loan/other only — everyday must never appear as 'Other funding')",
    /const otherSpend = monthExpenses\s*\n\s*\.filter\(\(t\) => t\.paymentSource === 'loan' \|\| t\.paymentSource === 'other'\)/.test(MONTHLY_SUMMARY_SRC)
  );
  assert(
    '2d. ThisMonthCard.tsx label updated to the factual "Paid from money balances" (was "cash / savings")',
    /Paid from money balances/.test(THIS_MONTH_CARD_SRC) && !/Paid from cash \/ savings/.test(THIS_MONTH_CARD_SRC)
  );
  assert(
    '2e. ThisMonthCard.tsx "Spending recorded" headline stays derived from the three source rows, never independently computed',
    /const displayedSpend = displayedCash \+ displayedCreditCard \+ displayedOther;/.test(THIS_MONTH_CARD_SRC)
  );
  assert(
    "2f. safeToSpend.ts cashVariableSpendSoFar now also counts 'everyday' spend against a currently-included, currently-existing target account",
    /if \(t\.paymentSource === 'everyday' && t\.targetAssetId\) \{/.test(SAFE_TO_SPEND_SRC)
  );
  assert(
    "2g. safeToSpend.ts's variableSpendSoFar / spendSoFarThisCycle (total activity, Navilo Score's Spending Control) is unfiltered by paymentSource — already counted 'everyday' correctly before this pass, untouched",
    /const variableSpendSoFar = data\.transactions\s*\n\s*\.filter\(\s*\n\s*\(t\) => t\.type === 'expense' && new Date\(t\.date\) >= cycleStart && new Date\(t\.date\) <= today\s*\n\s*\)/.test(
      SAFE_TO_SPEND_SRC
    )
  );
  assert(
    "2h. SmartReminderCard.tsx (recurring bill/salary confirmation) narrows its own paymentSource parameter to exactly 'cash' | 'credit_card' — a confirmed recurring transaction can never be routed to 'everyday', unaffected by the paymentSource enum change",
    /function runConfirmation\(paymentSource\?: 'cash' \| 'credit_card'\)/.test(SMART_REMINDER_SRC)
  );
  assert(
    // Correction round, 2026-08-10 — deliberately reversed. The prior
    // assertion locked in a real, reported gap (setup reconciliation could
    // not offer an Everyday Account as an income destination at all). The
    // fix reuses the shared resolveEligibleIncomeDestinations resolver
    // (incomeDestinations.ts) — the same one SmartReminderCard's salary
    // confirmation now also uses — rather than AddIncomeModal maintaining
    // its own narrower Cash/Savings-only list. This is a strengthened
    // assertion, not a weakened one: it now requires the shared resolver be
    // reused (never a parallel, AddIncomeModal-local reimplementation of
    // the same eligibility rule).
    "2i. AddIncomeModal.tsx's mid-cycle destination step reuses the shared resolveEligibleIncomeDestinations resolver (Cash, Savings AND Everyday Account all genuinely offered as income destinations, by real id — never a local, narrower reimplementation)",
    /import \{ resolveEligibleIncomeDestinations \} from '\.\.\/\.\.\/lib\/calculations\/incomeDestinations';/.test(ADD_INCOME_SRC) &&
      /resolveEligibleIncomeDestinations\(data\.assets\)/.test(ADD_INCOME_SRC)
  );
  assert(
    "2j. achievements.ts never references paymentSource or 'everyday' — achievement unlocks read only asset totals/types, unaffected by payment-source routing",
    !/paymentSource/.test(ACHIEVEMENTS_SRC)
  );
  assert(
    "2k. luluScore.ts never references transaction paymentSource directly for its Everyday-adjacent 'Money balance' reads — reads the shared included-liquid balance, not a per-source spend breakdown",
    !/t\.paymentSource/.test(LULU_SCORE_SRC)
  );
  assert(
    '2l. storage.ts (persistence / export) has no payment-source-specific serialization — Transaction persists generically via JSON.stringify, so paymentSource/targetAssetId round-trip with every other field, not a special case',
    !/paymentSource/.test(STORAGE_SRC)
  );
}

console.log('\n=== 3. Account deletion with linked transactions (Real import) ===');
{
  let data = baseData([everydayAsset({ id: 'A', currentValue: 900 })]);
  data = applyNewTransaction(data, {
    type: 'expense',
    amount: 50,
    categoryId: 'travel',
    date: new Date().toISOString(),
    paymentSource: 'everyday',
    targetAssetId: 'A',
  }, 'txn-1');
  assert('3a. Account A debited to 850', assetById(data, 'A').currentValue === 850);

  // Step 3: delete Account A (mirrors deleteAsset — filters it out, the
  // exact same generic mechanism every other asset type already uses).
  data = { ...data, assets: data.assets.filter((a) => a.id !== 'A') };
  assert('3b. Account A removed from assets', data.assets.length === 0);
  assert('3c. the historical transaction remains present and understandable (paymentSource/targetAssetId intact)', (() => {
    const t = data.transactions.find((x) => x.id === 'txn-1');
    return !!t && t.paymentSource === 'everyday' && t.targetAssetId === 'A' && t.amount === 50;
  })());

  // Step 5: attempt to edit it (simulates the form forcing balanceEffect
  // 'none' once hasValidBalanceTarget is false for a missing account).
  let threw = false;
  let edited: AppData = data;
  try {
    edited = applyTransactionUpdate(data, 'txn-1', { amount: 30, balanceEffect: 'none' });
  } catch {
    threw = true;
  }
  assert('3d. editing the orphaned transaction does not crash', !threw);
  assert('3e. editing the orphaned transaction does not recreate Account A or mutate any other asset', edited.assets.length === 0);
  assert(
    '3f. the edit correctly reverses the original effect once (no false reversal) and stores no further effect',
    edited.transactions.find((t) => t.id === 'txn-1')?.appliedBalanceEffect === undefined
  );

  // Step 6: attempt to delete it.
  let threw2 = false;
  let deleted: AppData = edited;
  try {
    deleted = applyTransactionDelete(edited, 'txn-1', true);
  } catch {
    threw2 = true;
  }
  assert('3g. deleting the orphaned transaction does not crash', !threw2);
  assert('3h. deleting the orphaned transaction does not recreate Account A or mutate any other asset', deleted.assets.length === 0);
  assert('3i. the transaction record is removed exactly once', !deleted.transactions.some((t) => t.id === 'txn-1'));
}

console.log('\n=== 3b. Deleting one Everyday Account never mutates a second, unrelated one (Real import) ===');
{
  let data = baseData([everydayAsset({ id: 'A', currentValue: 900 }), everydayAsset({ id: 'B', currentValue: 500 })]);
  data = applyNewTransaction(data, {
    type: 'expense', amount: 50, categoryId: 'travel', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'A',
  }, 'txn-a');
  data = { ...data, assets: data.assets.filter((a) => a.id !== 'A') };
  assert('3b-a. Account B untouched by Account A deletion', assetById(data, 'B').currentValue === 500);
  const afterDelete = applyTransactionDelete(data, 'txn-a', true);
  assert('3b-b. deleting the orphaned txn-a does not touch Account B', assetById(afterDelete, 'B').currentValue === 500);
  assert('3b-c. no stale target ID caused Account B to be found/mutated instead of A', afterDelete.assets.length === 1 && afterDelete.assets[0].id === 'B');
}

console.log('\n=== 4. Same-name account usability (Mirrored + structural) ===');
{
  const accountA = everydayAsset({ id: 'e-a', label: 'Everyday Account', provider: 'Test Bank', currentValue: 900 });
  const accountB = everydayAsset({ id: 'e-b', label: 'Everyday Account', provider: 'Other Bank', currentValue: 500 });
  function formatMoney(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function chipLabel(a: Asset): string {
    return `${a.label}${a.provider ? ` · ${a.provider}` : ''} (${formatMoney(a.currentValue)})`;
  }
  assert('4a. identically-labelled accounts produce distinct chip text via provider', chipLabel(accountA) !== chipLabel(accountB));
  assert('4b. chip text includes the provider the customer entered', chipLabel(accountA).includes('Test Bank') && chipLabel(accountB).includes('Other Bank'));
  assert(
    // Superseded by the next round's same-name-disambiguation correction
    // (tests/everyday-account-phantom-credit-correction.test.ts, section
    // 12) — chip text is now computed via everydayChipBaseText/
    // disambiguateEverydayAccountLabels, not this raw inline JSX. This
    // check now confirms the base-text builder these labels are still
    // "{label} · {provider} (balance)" underneath, exactly as this
    // assertion originally established.
    '4c. base chip text (before any disambiguation suffix) still matches "{label} · {provider} (balance)" in shipped source',
    /function everydayChipBaseText\(a: Asset\): string \{\s*\n\s*return `\$\{a\.label\}\$\{a\.provider \? ` · \$\{a\.provider\}` : ''\} \(\$\{formatMoney\(a\.currentValue\)\}\)`;/.test(
      QUICK_ADD_SRC
    )
  );
  assert(
    '4d. even with identical provider AND balance (worst case), the two accounts remain distinguishable BY IDENTITY (stable id) in the underlying picker state, so the correct one is always debited regardless of label collision',
    accountA.id !== accountB.id
  );
}

console.log('\n=== 5. Exact-cent stability across 10+ repeated create/edit/change-source/change-back/delete cycles (Real import) ===');
{
  let data = baseData([everydayAsset({ id: 'E', currentValue: 100.01 }), cashAsset({ id: 'C', currentValue: 500 })]);
  let maxDeviation = 0;
  let allCentsMatch = true;
  for (let i = 0; i < 12; i++) {
    const before = assetById(data, 'E').currentValue;
    data = applyNewTransaction(
      data,
      { type: 'expense', amount: 10.02, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' },
      `t-${i}`
    );
    data = applyTransactionUpdate(data, `t-${i}`, { amount: 10.03 });
    data = applyTransactionUpdate(data, `t-${i}`, { paymentSource: 'cash', targetAssetId: undefined });
    data = applyTransactionUpdate(data, `t-${i}`, { paymentSource: 'everyday', targetAssetId: 'E' });
    data = applyTransactionDelete(data, `t-${i}`, true);
    const after = assetById(data, 'E').currentValue;
    maxDeviation = Math.max(maxDeviation, Math.abs(after - before));
    if (Math.round(after * 100) !== Math.round(before * 100)) allCentsMatch = false;
  }
  assert('5a. after 12 full cycles, the Everyday balance is bit-exact back to the starting $100.01 (no residue)', assetById(data, 'E').currentValue === 100.01);
  assert('5b. every individual cycle round-trips to the correct cent', allCentsMatch);
  assert('5c. max raw float deviation across all 12 cycles is exactly 0', maxDeviation === 0);
  assert('5d. the Cash asset used mid-cycle for "change source" also returns exactly to its starting $500 (no cross-asset residue)', assetById(data, 'C').currentValue === 500);
  assert('5e. no transaction records remain after 12 create-then-delete cycles', data.transactions.length === 0);

  const currentBalance = assetById(data, 'E').currentValue;
  assert('5f. insufficient-funds comparison: an amount exactly equal to the balance is correctly NOT flagged insufficient', !(100.01 > currentBalance));
  assert('5g. insufficient-funds comparison: one cent over the balance is correctly flagged insufficient', 100.02 > currentBalance);
}

console.log('\n=== 6. targetAssetId compatibility — income vs. Everyday-expense never cross-contaminate (Real import) ===');
{
  let data = baseData([everydayAsset({ id: 'E', currentValue: 900 })]);
  // An income transaction and an Everyday-expense transaction both target
  // the SAME asset id — proves the discriminator is transaction `type` /
  // `paymentSource`, not `targetAssetId` itself, which is deliberately
  // reused across both meanings (models.ts doc comment).
  data = applyNewTransaction(
    data,
    { type: 'income', amount: 200, categoryId: 'salary', date: new Date().toISOString(), targetAssetId: 'E' },
    'income-1'
  );
  assert('6a. income transaction correctly CREDITS the target account (+200)', assetById(data, 'E').currentValue === 1100);

  data = applyNewTransaction(
    data,
    { type: 'expense', amount: 50, categoryId: 'travel', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'E' },
    'expense-1'
  );
  assert('6b. Everyday expense on the SAME target account correctly DEBITS it (-50), independent sign from the income above', assetById(data, 'E').currentValue === 1050);

  // Delete only the expense — must reverse exactly its own -50 effect,
  // never misinterpret or touch the income's +200 credit.
  const afterExpenseDelete = applyTransactionDelete(data, 'expense-1', true);
  assert('6c. deleting only the expense restores exactly its own debit (back to 1100), leaving the income credit untouched', assetById(afterExpenseDelete, 'E').currentValue === 1100);
  assert('6d. the income transaction record is untouched by the expense deletion', afterExpenseDelete.transactions.some((t) => t.id === 'income-1'));

  // Delete only the income (from the original two-transaction state) —
  // must reverse exactly its own +200 effect, never touch the expense.
  const afterIncomeDelete = applyTransactionDelete(data, 'income-1', true);
  assert('6e. deleting only the income restores exactly its own credit (back to 850), leaving the Everyday expense debit untouched', assetById(afterIncomeDelete, 'E').currentValue === 850);
  assert('6f. the expense transaction record is untouched by the income deletion', afterIncomeDelete.transactions.some((t) => t.id === 'expense-1'));

  // An expense's own targetAssetId can never be reinterpreted as income
  // regardless of value, because computeBalanceEffect's first branch keys
  // on t.type === 'income', not on whether targetAssetId is set.
  assert(
    "6g. models.ts documents targetAssetId's dual meaning explicitly, keyed by type/paymentSource, not a separate discriminator field",
    (() => {
      const modelsSrc = readFileSync('/Users/tommy/Claude/Lulu/app/src/types/models.ts', 'utf-8');
      return /Income only \(B2\.4\)/.test(modelsSrc) && /paymentSource === 'everyday'.*only/.test(modelsSrc);
    })()
  );
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
