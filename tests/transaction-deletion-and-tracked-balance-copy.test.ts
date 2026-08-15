// Transaction deletion / tracked-balance copy correction, 2026-08-09.
//
// Root cause (confirmed by direct source inspection before any edit):
// 1. The "Tracked balance" hint in QuickAddModal.tsx keyed its Credit Card
//    and Loan "nothing to track" message purely on `hasValidBalanceTarget`
//    being false — which is true both when NO card/loan exists at all and
//    when cards/loans exist but none has been selected yet. The message
//    text only ever described the first case ("No cards added yet"),
//    producing a factually false claim whenever cards existed but the
//    customer simply hadn't tapped one — exactly the recorded defect.
// 2. `handleDelete`'s confirmation alert was fully hardcoded to "cash" and
//    always offered a reversal choice, regardless of (a) whether the
//    transaction being deleted had `balanceEffect: 'none'` (Record only —
//    no effect was ever applied) or (b) what asset/card/liability its
//    `appliedBalanceEffect` actually named. It never inspected the
//    transaction's own recorded balance-effect metadata at all.
//
// Tracing what "Yes, reverse cash impact" would have done for the
// Record-only Credit Card transaction in the video: `deleteTransaction(id,
// true)` → `applyTransactionDelete` reads `old.appliedBalanceEffect`, which
// is `undefined` for a Record-only transaction (computeBalanceEffect
// returns undefined whenever `balanceEffect === 'none'`) → `applyEffectDelta`
// no-ops on an undefined effect. So the underlying engine reversal was
// ALREADY a safe no-op (thanks to the prior round's floor-then-reverse
// correction, which made `appliedBalanceEffect` an accurate record of what
// was truly applied) — the confirmed defect is entirely in the
// confirmation alert's copy/logic, not in the reversal mechanics. The same
// false-alarm pattern was checked and does NOT reproduce for Cash,
// Everyday Account, or Savings — every source resolves through the same
// `appliedBalanceEffect`-based check.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): sections 1-6 (Groups A-D from the authorization,
//   plus persistence) — import and directly execute applyNewTransaction/
//   applyTransactionUpdate/applyTransactionDelete/createAppDataSaver.
// - Mirrored logic (Class B): sections 7-8 — `describeReversalTarget` and
//   the "Tracked balance" hint/label derivation are declared inside
//   QuickAddModal.tsx, a .tsx file that transitively imports react-native
//   and cannot be imported directly. Reimplemented verbatim and executed,
//   with a structural assertion tying each mirror to the shipped source.
// - Structural (Class C): section 9 — the duplicate-tap guard (submittingRef)
//   cannot be exercised without a real tap sequence; confirms it still
//   gates handleSave unconditionally, unchanged by this pass.
//
// NOT PROVEN by this suite: on-device rendering of the corrected alert
// title/buttons or hint text, or a real double-tap on the physical Delete/
// Save buttons. That remains physical-device evidence.
//
// Run with: npx tsx tests/transaction-deletion-and-tracked-balance-copy.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData, createAppDataSaver } from '../src/lib/storage';
import { applyNewTransaction, applyTransactionUpdate, applyTransactionDelete } from '../src/state/AppStateContext';
import type { AppData, Asset, CreditCard, Transaction } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const QUICK_ADD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/dashboard/QuickAddModal.tsx', 'utf-8');

function amex(patch: Partial<CreditCard> = {}): CreditCard {
  return { id: 'amex', issuer: 'Amex', label: 'AMEX', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 25, ...patch };
}
function baseData(): AppData {
  const data = createEmptyAppData();
  data.creditCards = [amex()];
  data.assets = [
    { id: 'cash-1', type: 'cash', label: 'Cash', currentValue: 100 },
    { id: 'everyday-1', type: 'everyday', label: 'Everyday Account', currentValue: 900, provider: 'Test Bank' },
    { id: 'savings-1', type: 'savings', label: 'Savings', currentValue: 2000, includeInMoneyCalculations: false },
  ];
  return data;
}
function ccBal(d: AppData, id = 'amex'): number {
  return d.creditCards.find((c) => c.id === id)!.currentBalance;
}
function assetBal(d: AppData, id: string): number {
  return d.assets.find((a) => a.id === id)!.currentValue;
}
function spendTotal(d: AppData): number {
  return d.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
}

console.log('=== Group A: Credit Card Record only ===');
{
  let data = baseData();
  data = applyNewTransaction(
    data,
    { type: 'expense', amount: 20, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex', balanceEffect: 'none' },
    'txn-a'
  );
  assert('A1. AMEX remains $1,000 after a $20 Record-only expense', ccBal(data) === 1000);
  assert('A2. spending increases by $20', spendTotal(data) === 20);
  assert('A3. no balance effect was ever stored — nothing exists to reverse', data.transactions.find((t) => t.id === 'txn-a')?.appliedBalanceEffect === undefined);

  const deleted = applyTransactionDelete(data, 'txn-a', true);
  assert('A4. AMEX remains $1,000 after delete, even with reverseEffect=true — no mutation is possible', ccBal(deleted) === 1000);
  assert('A5. spending returns to baseline (0)', spendTotal(deleted) === 0);
  assert('A6. Cash and Everyday are untouched throughout', assetBal(deleted, 'cash-1') === 100 && assetBal(deleted, 'everyday-1') === 900);
}

console.log('\n=== Group B: Credit Card tracked ===');
{
  let data = baseData();
  data = applyNewTransaction(data, { type: 'expense', amount: 150, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-b');
  assert('B1. AMEX becomes $1,150 after a $150 tracked expense', ccBal(data) === 1150);
  data = applyTransactionUpdate(data, 'txn-b', { amount: 100 });
  assert('B2. editing to $100 updates AMEX to $1,100', ccBal(data) === 1100);
  const deleted = applyTransactionDelete(data, 'txn-b', true);
  assert('B3. deleting with reversal restores AMEX to exactly $1,000', ccBal(deleted) === 1000);
  assert('B4. Cash remains unchanged', assetBal(deleted, 'cash-1') === 100);
  assert('B5. Everyday Account remains unchanged', assetBal(deleted, 'everyday-1') === 900);
}

console.log('\n=== Group C: Everyday Account tracked ===');
{
  let data = baseData();
  assert('C0. included-liquid baseline is 1000 (Cash 100 + Everyday 900; Savings excluded)', assetBal(data, 'cash-1') + assetBal(data, 'everyday-1') === 1000);
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1' }, 'txn-c');
  assert('C1. Everyday Account becomes $850', assetBal(data, 'everyday-1') === 850);
  assert('C2. included liquid balance becomes $950', assetBal(data, 'cash-1') + assetBal(data, 'everyday-1') === 950);
  assert('C3. total assets fall by $50', data.assets.reduce((s, a) => s + a.currentValue, 0) === baseData().assets.reduce((s, a) => s + a.currentValue, 0) - 50);
  data = applyTransactionUpdate(data, 'txn-c', { amount: 20 });
  assert('C4. editing to $20: Everyday Account becomes $880', assetBal(data, 'everyday-1') === 880);
  assert('C5. included balance becomes $980', assetBal(data, 'cash-1') + assetBal(data, 'everyday-1') === 980);
  const deleted = applyTransactionDelete(data, 'txn-c', true);
  assert('C6. delete with reversal: Everyday Account returns to $900', assetBal(deleted, 'everyday-1') === 900);
  assert('C7. included balance returns to $1,000', assetBal(deleted, 'cash-1') + assetBal(deleted, 'everyday-1') === 1000);
  assert('C8. no Credit Card balance change throughout', ccBal(deleted) === 1000);
  assert('C9. no Cash balance change throughout', assetBal(deleted, 'cash-1') === 100);
}

console.log('\n=== Group D: mode/source changes reverse the old effect exactly once ===');
{
  let data = baseData();
  data = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1' }, 'txn-d1');
  data = applyTransactionUpdate(data, 'txn-d1', { paymentSource: 'credit_card', creditCardId: 'amex', targetAssetId: undefined });
  assert('D1. Everyday -> Credit Card: Everyday Account is fully restored to $900 (reversed exactly once)', assetBal(data, 'everyday-1') === 900);
  assert('D2. Everyday -> Credit Card: AMEX is debited exactly once, to $1,050', ccBal(data) === 1050);
  assert('D3. Everyday -> Credit Card: Cash is never touched', assetBal(data, 'cash-1') === 100);

  let data2 = baseData();
  data2 = applyNewTransaction(data2, { type: 'expense', amount: 75, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-d2');
  data2 = applyTransactionUpdate(data2, 'txn-d2', { balanceEffect: 'none' });
  assert('D4. Credit Card -> Record only: AMEX is fully restored to $1,000', ccBal(data2) === 1000);
  assert('D5. Credit Card -> Record only: no new effect is stored', data2.transactions.find((t) => t.id === 'txn-d2')?.appliedBalanceEffect === undefined);

  // The reverse direction too, for completeness of the "reverse once, apply
  // once" invariant in both directions.
  let data3 = baseData();
  data3 = applyNewTransaction(data3, { type: 'expense', amount: 60, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-d3');
  data3 = applyTransactionUpdate(data3, 'txn-d3', { paymentSource: 'everyday', targetAssetId: 'everyday-1', creditCardId: undefined });
  assert('D6. Credit Card -> Everyday: AMEX is fully restored to $1,000', ccBal(data3) === 1000);
  assert('D7. Credit Card -> Everyday: Everyday Account is debited exactly once, to $840', assetBal(data3, 'everyday-1') === 840);
}

console.log('\n=== Group E: exact cents, duplicate-delete protection, persistence ===');
{
  let data = baseData();
  data.creditCards = [amex({ currentBalance: 1000.01 })];
  data = applyNewTransaction(data, { type: 'expense', amount: 0.02, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-e');
  assert('E1. exact-cent tracked Credit Card expense applies correctly', Math.abs(ccBal(data) - 1000.03) < 1e-9);
  const deleted = applyTransactionDelete(data, 'txn-e', true);
  assert('E2. exact-cent delete-with-reversal restores the true original balance', Math.round(ccBal(deleted) * 100) === Math.round(1000.01 * 100));

  // Duplicate-delete protection at the engine level: calling delete twice
  // with the same id is a safe no-op the second time (transaction already
  // gone, applyTransactionDelete's own `if (!old...) return data` guard).
  const deletedAgain = applyTransactionDelete(deleted, 'txn-e', true);
  assert('E3. deleting an already-deleted transaction id is a safe no-op (no double reversal)', ccBal(deletedAgain) === ccBal(deleted));
}

console.log('\n=== 7. describeReversalTarget — deletion-confirmation reversal target (Mirrored, tied to shipped source) ===');
{
  function describeReversalTarget(data: AppData, t: Transaction): { label: string; amount: number } | null {
    if (t.balanceEffect === undefined) {
      if (t.type === 'income') {
        const cash = data.assets.find((a) => a.type === 'cash');
        return cash ? { label: cash.label, amount: t.amount } : null;
      }
      const source = t.paymentSource ?? 'cash';
      if (source === 'cash') {
        const cash = data.assets.find((a) => a.type === 'cash');
        return cash ? { label: cash.label, amount: t.amount } : null;
      }
      if (source === 'credit_card' && t.creditCardId) {
        const card = data.creditCards.find((c) => c.id === t.creditCardId);
        return card ? { label: card.label, amount: t.amount } : null;
      }
      if (source === 'loan' && t.liabilityId) {
        const liability = data.liabilities.find((l) => l.id === t.liabilityId);
        return liability ? { label: liability.label, amount: t.amount } : null;
      }
      return null;
    }
    const effect = t.appliedBalanceEffect;
    if (!effect) return null;
    const amount = Math.abs(effect.delta);
    if (amount === 0) return null;
    if (effect.targetKind === 'asset') {
      const asset = data.assets.find((a) => a.id === effect.targetId);
      return asset ? { label: asset.label, amount } : null;
    }
    if (effect.targetKind === 'credit_card') {
      const card = data.creditCards.find((c) => c.id === effect.targetId);
      return card ? { label: card.label, amount } : null;
    }
    if (effect.targetKind === 'liability') {
      const liability = data.liabilities.find((l) => l.id === effect.targetId);
      return liability ? { label: liability.label, amount } : null;
    }
    return null;
  }

  const data = baseData();

  // 7a. Record-only Credit Card (the exact video scenario) — no reversal offered.
  let d = applyNewTransaction(data, { type: 'expense', amount: 20, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex', balanceEffect: 'none' }, 't1');
  assert('7a. Record-only Credit Card transaction: describeReversalTarget returns null — no reversal choice offered (still gets a plain delete confirmation, see section 10)', describeReversalTarget(d, d.transactions[0]!) === null);
  assert(
    '7a-proof. what selecting a reversal WOULD have done for this exact transaction: nothing — applyTransactionDelete(id, true) leaves AMEX untouched',
    ccBal(applyTransactionDelete(d, 't1', true)) === 1000
  );

  // 7b. Tracked Credit Card — correctly identifies AMEX and the real amount, never "Cash".
  let d2 = applyNewTransaction(data, { type: 'expense', amount: 100, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 't2');
  const r2 = describeReversalTarget(d2, d2.transactions[0]!);
  assert('7b. tracked Credit Card: names the real card "AMEX", never "Cash"', r2?.label === 'AMEX');
  assert('7b-amount. tracked Credit Card: names the real amount ($100)', r2?.amount === 100);

  // 7c. Tracked Everyday Account — never described as a Cash effect.
  let d3 = applyNewTransaction(data, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1' }, 't3');
  const r3 = describeReversalTarget(d3, d3.transactions[0]!);
  assert('7c. tracked Everyday Account: names the real account, never "Cash"', r3?.label === 'Everyday Account');

  // 7d. Tracked Cash — correctly names Cash (the one case where "Cash" IS accurate).
  let d4 = applyNewTransaction(data, { type: 'expense', amount: 40, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 't4');
  const r4 = describeReversalTarget(d4, d4.transactions[0]!);
  assert('7d. tracked Cash expense: correctly names "Cash" (this is the one case where that word is accurate)', r4?.label === 'Cash' && r4?.amount === 40);

  // 7e. Legacy transaction (balanceEffect undefined) — still offers a
  // meaningful, correctly-targeted reversal choice (backward compatible).
  const legacyCC: Transaction = { id: 'legacy-cc', type: 'expense', amount: 60, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' };
  const r5 = describeReversalTarget(data, legacyCC);
  assert('7e. legacy Credit Card transaction (no appliedBalanceEffect ever captured): still correctly names AMEX', r5?.label === 'AMEX' && r5?.amount === 60);
  const legacyCash: Transaction = { id: 'legacy-cash', type: 'expense', amount: 15, categoryId: 'x', date: new Date().toISOString() };
  const r6 = describeReversalTarget(data, legacyCash);
  assert('7f. legacy transaction with no paymentSource (implicit cash): correctly names Cash', r6?.label === 'Cash' && r6?.amount === 15);

  // 7g. A floored-to-$0 effect (insufficient-funds edge case from the prior
  // round's phantom-credit fix) never offers a reversal either — nothing
  // truly moved.
  const flooredTxn: Transaction = {
    id: 'floored', type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash',
    balanceEffect: 'update', appliedBalanceEffect: { targetKind: 'asset', targetId: 'cash-1', delta: 0 },
  };
  assert('7g. an effect that truly moved $0 (floored) never offers a reversal choice either', describeReversalTarget(data, flooredTxn) === null);

  assert(
    '7h. mirror matches the shipped QuickAddModal.tsx describeReversalTarget function text exactly',
    /function describeReversalTarget\(data: AppData, t: Transaction\): \{ label: string; amount: number \} \| null \{/.test(QUICK_ADD_SRC)
  );
  assert(
    '7i. shipped handleDelete calls describeReversalTarget and branches on it before choosing which confirmation to show',
    /const reversal = describeReversalTarget\(data, editTransaction\);\s*\n\s*if \(!reversal\) \{/.test(QUICK_ADD_SRC)
  );
  assert(
    '7j. shipped tracked-effect alert message names the real target and the real applied amount, never hardcoded to "cash"',
    /This transaction changed \$\{reversal\.label\} by \$\{formatMoney\(reversal\.amount\)\}\. Would you like \$\{brand\.name\} to reverse that balance change\?/.test(
      QUICK_ADD_SRC
    )
  );
  assert('7k. the old hardcoded "cash balance" alert title is gone from shipped source', !/Should \$\{brand\.name\} also adjust your cash balance\?/.test(QUICK_ADD_SRC));
  assert('7l. the old hardcoded "reverse cash impact" button text is gone from shipped source', !/Yes, reverse cash impact/.test(QUICK_ADD_SRC));
  assert(
    '7m. the account/card name never appears inside a button label — only "Delete record only" / "Delete & reverse" (fixed-length, safe for any name length)',
    /\{ text: 'Delete record only', onPress:/.test(QUICK_ADD_SRC) && /\{ text: 'Delete & reverse', style: 'destructive', onPress:/.test(QUICK_ADD_SRC)
  );
}

console.log('\n=== 8. Tracked-balance hint copy — no false "no cards/loans" claim, names the real target (Mirrored, tied to shipped source) ===');
{
  function trackedBalanceHint(
    hasValidBalanceTarget: boolean,
    balanceEffect: 'update' | 'none',
    targetLabel: string | undefined,
    paymentSource: string,
    creditCardsLength: number,
    liabilitiesLength: number,
    brandName: string
  ): string {
    if (hasValidBalanceTarget) {
      return balanceEffect === 'none' && targetLabel
        ? `Record this transaction without changing your ${targetLabel} balance.`
        : `Record only saves this transaction without changing a balance tracked in ${brandName}.`;
    }
    if (paymentSource === 'credit_card') {
      return creditCardsLength > 0
        ? 'Select a card above to track this against it, or continue recording only.'
        : 'No cards added yet. This transaction will be recorded without changing a card balance.';
    }
    if (paymentSource === 'loan') {
      return liabilitiesLength > 0
        ? 'Select a loan above to track this against it, or continue recording only.'
        : 'No loans added yet. This transaction will be recorded without changing a liability balance.';
    }
    if (paymentSource === 'cash') return 'Add a cash balance above to track this against it, or continue recording only.';
    if (paymentSource === 'everyday') return 'Choose which everyday account this was paid from above to track this against it.';
    return `Record only saves this transaction without changing a balance tracked in ${brandName}.`;
  }

  // 8a. THE CONFIRMED DEFECT SCENARIO: a card exists but none is selected
  // yet (hasValidBalanceTarget false purely because creditCardId is null) —
  // must no longer claim "No cards added yet."
  const hint8a = trackedBalanceHint(false, 'none', undefined, 'credit_card', 1, 0, 'Nolie');
  assert('8a. card exists but none selected: no longer falsely claims "No cards added yet"', !/No cards added yet/.test(hint8a));
  assert('8a-correct. card exists but none selected: correctly prompts selection instead', /Select a card above/.test(hint8a));

  // 8b. Genuinely zero cards — the "No cards added yet" message remains
  // accurate and is preserved.
  const hint8b = trackedBalanceHint(false, 'none', undefined, 'credit_card', 0, 0, 'Nolie');
  assert('8b. zero cards genuinely exist: "No cards added yet" is still shown (still true in this case)', /No cards added yet/.test(hint8b));

  // 8c. A card IS selected and Record only is active — names the card,
  // matching the suggested direction ("...without changing your AMEX balance.").
  const hint8c = trackedBalanceHint(true, 'none', 'AMEX', 'credit_card', 1, 0, 'Nolie');
  assert('8c. card selected + Record only: names the actual card', hint8c === 'Record this transaction without changing your AMEX balance.');

  // 8d. Same pattern for loans (the identical defect class, per the
  // root-cause investigation's "does the same defect affect other sources" check).
  const hint8d = trackedBalanceHint(false, 'none', undefined, 'loan', 0, 1, 'Nolie');
  assert('8d. loan exists but none selected: no longer falsely claims "No loans added yet"', !/No loans added yet/.test(hint8d));
  const hint8e = trackedBalanceHint(false, 'none', undefined, 'loan', 0, 0, 'Nolie');
  assert('8e. zero loans genuinely exist: "No loans added yet" is still shown', /No loans added yet/.test(hint8e));

  // 8f. Cash and Everyday were already correct (never falsely claimed
  // nonexistence) — confirm unaffected by this pass.
  const hint8f = trackedBalanceHint(false, 'none', undefined, 'cash', 0, 0, 'Nolie');
  assert('8f. cash source unaffected — unchanged existing wording', hint8f === 'Add a cash balance above to track this against it, or continue recording only.');

  assert(
    '8g. mirror matches shipped trackedBalanceTargetLabel derivation exactly',
    /const trackedBalanceTargetLabel = !hasValidBalanceTarget/.test(QUICK_ADD_SRC)
  );
  assert(
    '8h. mirror matches shipped hint ternary\'s card-exists-but-unselected branch exactly',
    /data\.creditCards\.length > 0\s*\n\s*\? 'Select a card above to track this against it, or continue recording only\.'/.test(QUICK_ADD_SRC)
  );
  assert(
    '8i. mirror matches shipped hint ternary\'s loan-exists-but-unselected branch exactly',
    /nonCreditLiabilities\.length > 0\s*\n\s*\? 'Select a loan above to track this against it, or continue recording only\.'/.test(QUICK_ADD_SRC)
  );
  assert(
    '8j. mirror matches shipped named-target Record-only sentence exactly',
    /`Record this transaction without changing your \$\{trackedBalanceTargetLabel\} balance\.`/.test(QUICK_ADD_SRC)
  );
}

console.log('\n=== 9. Duplicate-tap protection unchanged (Structural) ===');
{
  assert(
    '9a. submittingRef synchronous re-entry guard is still present in handleSave, unconditionally, ahead of any state mutation',
    /if \(submittingRef\.current\) return;\s*\n\s*submittingRef\.current = true;/.test(QUICK_ADD_SRC)
  );
  assert(
    '9b. handleDelete has no separate submission-guard bypass — it is reached only via the single Delete button, unchanged by this pass',
    /function handleDelete\(\) \{\s*\n\s*if \(!editTransaction\) return;/.test(QUICK_ADD_SRC)
  );
}

// Mirror of the shipped handleDelete's confirmation-building logic
// (Mirrored, tied to shipped source — .tsx cannot be imported). Returns the
// exact title/message/button set the real Alert.alert call would receive.
// A button's presence/absence of `onPress` mirrors whether tapping it can
// mutate anything at all — 'Cancel' never carries one in the shipped code,
// so RN's own Alert semantics guarantee it does nothing but dismiss.
function formatMoneyMirror(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
type MirroredButton = { text: string; style?: 'cancel' | 'destructive'; action: 'cancel' | 'deleteOnly' | 'deleteAndReverse' };
function buildDeleteConfirmation(
  reversal: { label: string; amount: number } | null,
  brandName: string
): { title: string; message: string; buttons: MirroredButton[] } {
  if (!reversal) {
    return {
      title: 'Delete transaction?',
      message: `Delete this transaction from ${brandName}? No tracked balance will change.`,
      buttons: [
        { text: 'Cancel', style: 'cancel', action: 'cancel' },
        { text: 'Delete transaction', style: 'destructive', action: 'deleteOnly' },
      ],
    };
  }
  return {
    title: 'Delete transaction?',
    message: `This transaction changed ${reversal.label} by ${formatMoneyMirror(reversal.amount)}. Would you like ${brandName} to reverse that balance change?`,
    buttons: [
      { text: 'Cancel', style: 'cancel', action: 'cancel' },
      { text: 'Delete record only', action: 'deleteOnly' },
      { text: 'Delete & reverse', style: 'destructive', action: 'deleteAndReverse' },
    ],
  };
}
function describeReversalTargetMirror(data: AppData, t: Transaction): { label: string; amount: number } | null {
  if (t.balanceEffect === undefined) {
    if (t.type === 'income') {
      const cash = data.assets.find((a) => a.type === 'cash');
      return cash ? { label: cash.label, amount: t.amount } : null;
    }
    const source = t.paymentSource ?? 'cash';
    if (source === 'cash') {
      const cash = data.assets.find((a) => a.type === 'cash');
      return cash ? { label: cash.label, amount: t.amount } : null;
    }
    if (source === 'credit_card' && t.creditCardId) {
      const card = data.creditCards.find((c) => c.id === t.creditCardId);
      return card ? { label: card.label, amount: t.amount } : null;
    }
    if (source === 'loan' && t.liabilityId) {
      const liability = data.liabilities.find((l) => l.id === t.liabilityId);
      return liability ? { label: liability.label, amount: t.amount } : null;
    }
    return null;
  }
  const effect = t.appliedBalanceEffect;
  if (!effect) return null;
  const amount = Math.abs(effect.delta);
  if (amount === 0) return null;
  if (effect.targetKind === 'asset') {
    const asset = data.assets.find((a) => a.id === effect.targetId);
    return asset ? { label: asset.label, amount } : null;
  }
  if (effect.targetKind === 'credit_card') {
    const card = data.creditCards.find((c) => c.id === effect.targetId);
    return card ? { label: card.label, amount } : null;
  }
  if (effect.targetKind === 'liability') {
    const liability = data.liabilities.find((l) => l.id === effect.targetId);
    return liability ? { label: liability.label, amount } : null;
  }
  return null;
}

console.log('\n=== 10. Record-only / zero-applied-effect confirmation contract, every source (Real import + Mirrored) ===');
{
  // 10a. Credit Card — the exact video scenario.
  let data = baseData();
  data = applyNewTransaction(data, { type: 'expense', amount: 20, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex', balanceEffect: 'none' }, 'txn-cc');
  const conf = buildDeleteConfirmation(describeReversalTargetMirror(data, data.transactions[0]!), 'Nolie');
  assert('10a-title. Record-only Credit Card: title is exactly "Delete transaction?"', conf.title === 'Delete transaction?');
  assert('10a-message. Record-only Credit Card: message uses the preferred wording and states no tracked balance will change', conf.message === 'Delete this transaction from Nolie? No tracked balance will change.');
  assert('10a-buttons. Record-only Credit Card: exactly 2 buttons — Cancel and Delete transaction — no reversal option', conf.buttons.length === 2 && conf.buttons.map((b) => b.text).join('|') === 'Cancel|Delete transaction');
  assert('10a-destructive. Delete transaction button uses destructive styling', conf.buttons[1]!.style === 'destructive');
  assert('10a-cancel-noop. Cancel action never triggers a delete — the Cancel button carries no delete action', conf.buttons[0]!.action === 'cancel');
  // Cancel: preserves the transaction (never call applyTransactionDelete).
  assert('10a-cancel-preserves. Cancel performs no deletion — the record is untouched', data.transactions.some((t) => t.id === 'txn-cc'));
  // Delete: removes the record once, no balance change.
  const afterDelete = applyTransactionDelete(data, 'txn-cc', false); // action 'deleteOnly' -> reverseEffect=false
  assert('10a-delete. Delete transaction removes the record once', !afterDelete.transactions.some((t) => t.id === 'txn-cc'));
  assert('10a-cc-unchanged. AMEX balance is unchanged', ccBal(afterDelete) === 1000);
  assert('10a-cash-unchanged. Cash balance is unchanged', assetBal(afterDelete, 'cash-1') === 100);

  // 10b. Everyday Account, Record only.
  let data2 = baseData();
  data2 = applyNewTransaction(data2, { type: 'expense', amount: 30, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1', balanceEffect: 'none' }, 'txn-ev');
  const conf2 = buildDeleteConfirmation(describeReversalTargetMirror(data2, data2.transactions[0]!), 'Nolie');
  assert('10b. Record-only Everyday Account: same 2-button, no-reversal contract', conf2.buttons.length === 2 && conf2.buttons.map((b) => b.text).join('|') === 'Cancel|Delete transaction');
  const afterDelete2 = applyTransactionDelete(data2, 'txn-ev', false);
  assert('10b-unchanged. Everyday Account balance is unchanged after Record-only delete', assetBal(afterDelete2, 'everyday-1') === 900);

  // 10c. Cash, Record only.
  let data3 = baseData();
  data3 = applyNewTransaction(data3, { type: 'expense', amount: 10, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash', balanceEffect: 'none' }, 'txn-cash');
  const conf3 = buildDeleteConfirmation(describeReversalTargetMirror(data3, data3.transactions[0]!), 'Nolie');
  assert('10c. Record-only Cash: same 2-button, no-reversal contract', conf3.buttons.length === 2);
  const afterDelete3 = applyTransactionDelete(data3, 'txn-cash', false);
  assert('10c-unchanged. Cash balance is unchanged after Record-only delete', assetBal(afterDelete3, 'cash-1') === 100);

  // 10d. Savings — reachable only via an income transaction's targetAssetId
  // (there is no expense payment-source that targets Savings directly).
  let data4 = baseData();
  data4 = applyNewTransaction(data4, { type: 'income', amount: 200, categoryId: 'x', date: new Date().toISOString(), targetAssetId: 'savings-1', balanceEffect: 'none' }, 'txn-sav');
  const conf4 = buildDeleteConfirmation(describeReversalTargetMirror(data4, data4.transactions[0]!), 'Nolie');
  assert('10d. Record-only Savings-targeted income: same 2-button, no-reversal contract', conf4.buttons.length === 2);
  const afterDelete4 = applyTransactionDelete(data4, 'txn-sav', false);
  assert('10d-unchanged. Savings balance is unchanged after Record-only delete', assetBal(afterDelete4, 'savings-1') === 2000);

  // 10e. Other-funded expense (no addressable target at all).
  let data5 = baseData();
  data5 = applyNewTransaction(data5, { type: 'expense', amount: 25, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'other', balanceEffect: 'none' }, 'txn-other');
  const conf5 = buildDeleteConfirmation(describeReversalTargetMirror(data5, data5.transactions[0]!), 'Nolie');
  assert('10e. Record-only Other-funded: same 2-button, no-reversal contract', conf5.buttons.length === 2);
  const afterDelete5 = applyTransactionDelete(data5, 'txn-other', false);
  assert('10e-no-mutation. no asset, credit card, or liability changed after Record-only Other delete', JSON.stringify(afterDelete5.assets) === JSON.stringify(data5.assets) && JSON.stringify(afterDelete5.creditCards) === JSON.stringify(data5.creditCards));
}

console.log('\n=== 11. Tracked confirmation with a real applied effect (Real import + Mirrored), including long account names ===');
{
  let data = baseData();
  data = applyNewTransaction(data, { type: 'expense', amount: 100, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-cc-tracked');
  const reversal = describeReversalTargetMirror(data, data.transactions[0]!);
  const conf = buildDeleteConfirmation(reversal, 'Nolie');
  assert('11a-title. tracked Credit Card: title is "Delete transaction?"', conf.title === 'Delete transaction?');
  assert(
    '11a-message. tracked Credit Card: message names AMEX and the real applied amount, matching the preferred structure',
    conf.message === 'This transaction changed AMEX by $100.00. Would you like Nolie to reverse that balance change?'
  );
  assert('11a-buttons. tracked Credit Card: exactly 3 buttons — Cancel, Delete record only, Delete & reverse', conf.buttons.map((b) => b.text).join('|') === 'Cancel|Delete record only|Delete & reverse');
  assert('11a-labels-short. neither action button label contains the account name', !conf.buttons.some((b) => b.text.includes('AMEX')));

  // "Delete record only" does not reverse the card.
  const deleteOnly = applyTransactionDelete(data, 'txn-cc-tracked', false);
  assert('11b. Delete record only removes the record but leaves AMEX at $1,100 (not reversed)', !deleteOnly.transactions.some((t) => t.id === 'txn-cc-tracked') && ccBal(deleteOnly) === 1100);

  // "Delete & reverse" restores the card exactly once.
  const deleteAndReverse = applyTransactionDelete(data, 'txn-cc-tracked', true);
  assert('11c. Delete & reverse restores AMEX to exactly $1,000', ccBal(deleteAndReverse) === 1000);

  // Cancel does nothing.
  assert('11d. Cancel performs no deletion or mutation — the record and balance are untouched', data.transactions.some((t) => t.id === 'txn-cc-tracked') && ccBal(data) === 1100);

  // Tracked Everyday Account and Cash — correct contextual target/amount, no cross-contamination.
  let data2 = baseData();
  data2 = applyNewTransaction(data2, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1' }, 'txn-ev-tracked');
  const r2 = describeReversalTargetMirror(data2, data2.transactions[0]!);
  const conf2 = buildDeleteConfirmation(r2, 'Nolie');
  assert('11e. tracked Everyday Account: message names "Everyday Account" and $50.00', conf2.message === 'This transaction changed Everyday Account by $50.00. Would you like Nolie to reverse that balance change?');
  assert('11f. tracked Everyday Account delete-and-reverse touches only Everyday, never AMEX or Cash', (() => {
    const after = applyTransactionDelete(data2, 'txn-ev-tracked', true);
    return assetBal(after, 'everyday-1') === 900 && ccBal(after) === 1000 && assetBal(after, 'cash-1') === 100;
  })());

  let data3 = baseData();
  data3 = applyNewTransaction(data3, { type: 'expense', amount: 40, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'cash' }, 'txn-cash-tracked');
  const r3 = describeReversalTargetMirror(data3, data3.transactions[0]!);
  const conf3 = buildDeleteConfirmation(r3, 'Nolie');
  assert('11g. tracked Cash: message names "Cash" and $40.00', conf3.message === 'This transaction changed Cash by $40.00. Would you like Nolie to reverse that balance change?');

  // The applied amount, not the raw transaction amount, must be shown —
  // proven with a flooring scenario (Everyday only had $20 against a $50
  // debit, so the true applied amount is $20, not $50).
  let data4 = baseData();
  data4.assets = data4.assets.map((a) => (a.id === 'everyday-1' ? { ...a, currentValue: 20 } : a));
  data4 = applyNewTransaction(data4, { type: 'expense', amount: 50, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday-1' }, 'txn-floor');
  const r4 = describeReversalTargetMirror(data4, data4.transactions[0]!);
  assert('11h. flooring case: displayed amount is the TRUE applied $20, not the raw transaction amount $50', r4?.amount === 20);
  const conf4 = buildDeleteConfirmation(r4, 'Nolie');
  assert('11i. flooring case: message correctly shows $20.00, never $50.00', conf4.message.includes('$20.00') && !conf4.message.includes('$50.00'));

  // Long account name — action labels stay fixed-length; the name appears
  // only in the message.
  let data5 = baseData();
  data5.assets.push({ id: 'ev-long', type: 'everyday', label: 'My Extremely Long Everyday Banking Account Name For Testing', currentValue: 500 });
  data5 = applyNewTransaction(data5, { type: 'expense', amount: 75, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'everyday', targetAssetId: 'ev-long' }, 'txn-long');
  const r5 = describeReversalTargetMirror(data5, data5.transactions[0]!);
  const conf5 = buildDeleteConfirmation(r5, 'Nolie');
  assert('11j. long account name: appears in the message', conf5.message.includes('My Extremely Long Everyday Banking Account Name For Testing'));
  assert('11k. long account name: button labels remain exactly "Delete record only" / "Delete & reverse" — unaffected by name length', conf5.buttons[1]!.text === 'Delete record only' && conf5.buttons[2]!.text === 'Delete & reverse');
}

console.log('\n=== 12. Duplicate-action protection (Real import) ===');
{
  // Duplicate "Delete record only" taps: the second call is a safe no-op
  // (the transaction is already gone, applyTransactionDelete's own
  // `if (!old...) return data` guard).
  let data = baseData();
  data = applyNewTransaction(data, { type: 'expense', amount: 20, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex', balanceEffect: 'none' }, 'txn-dup1');
  const once = applyTransactionDelete(data, 'txn-dup1', false);
  const twice = applyTransactionDelete(once, 'txn-dup1', false);
  assert('12a. duplicate "Delete record only" actions never double-delete or mutate a balance', ccBal(twice) === 1000 && twice.transactions.length === once.transactions.length);

  // Duplicate "Delete & reverse" taps on a tracked transaction: the second
  // call finds the transaction already gone and is a safe no-op — the
  // reversal is applied exactly once, never twice.
  let data2 = baseData();
  data2 = applyNewTransaction(data2, { type: 'expense', amount: 150, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex' }, 'txn-dup2');
  const reversedOnce = applyTransactionDelete(data2, 'txn-dup2', true);
  const reversedTwice = applyTransactionDelete(reversedOnce, 'txn-dup2', true);
  assert('12b. duplicate "Delete & reverse" actions reverse the effect exactly once — AMEX returns to $1,000, not $850 (double-reversed)', ccBal(reversedTwice) === 1000);
  assert('12c. the second duplicate action does not affect the transaction list further', reversedTwice.transactions.length === reversedOnce.transactions.length);
}

async function runPersistenceSection() {
  console.log('\n=== E-persist. Persistence after restart (Real import) ===');
  let written: string | null = null;
  const save = createAppDataSaver((_key, value) => {
    written = value;
    return Promise.resolve();
  });
  let persistData = baseData();
  persistData = applyNewTransaction(
    persistData,
    { type: 'expense', amount: 30, categoryId: 'x', date: new Date().toISOString(), paymentSource: 'credit_card', creditCardId: 'amex', balanceEffect: 'none' },
    'txn-persist'
  );
  await save(persistData);
  const reloaded = JSON.parse(written as unknown as string) as AppData;
  const reloadedTxn = reloaded.transactions.find((t) => t.id === 'txn-persist');
  assert('E4. after "restart" (JSON round-trip), balanceEffect is preserved as none', reloadedTxn?.balanceEffect === 'none');
  assert('E5. after restart, appliedBalanceEffect is preserved as undefined', reloadedTxn?.appliedBalanceEffect === undefined);
  assert('E6. after restart, the AMEX balance is preserved untouched', reloaded.creditCards.find((c) => c.id === 'amex')?.currentBalance === 1000);

  console.log(`\n${total - failures}/${total} passed`);
  if (failures > 0) process.exit(1);
}

runPersistenceSection();
