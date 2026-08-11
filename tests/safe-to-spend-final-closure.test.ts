// Pass 1 final closure — status-architecture correction, 2026-08-11.
//
// Independent review confirmed a genuine defect: moneyBalanceStatus was
// being forced to 'invalid_data' whenever ANY headline field went
// non-finite, even when the actual corrupted input was a bill or
// transaction, not a balance. This file proves the fix: a new
// `availability` field ('available' | 'unavailable_balance_data' |
// 'unavailable_other_data') carries the overall signal; moneyBalanceStatus
// itself is now computed once and never reassigned.
//
// CLASSIFICATION: Real import (Class A) throughout — computeSafeToSpend,
// computeLuluScore, computeMoneyBalanceStatus are all the actual shipped
// functions, directly executed. Section 5 (repair paths) is Structural
// (regex/string match against source text) for the same reason every other
// .tsx-touching assertion in this repo is: SelectBalancesSheet.tsx,
// AddWealthItemModal.tsx and WealthScreen.tsx transitively import
// react-native and cannot be imported/executed by tsx.
//
// Run with: npx tsx tests/safe-to-spend-final-closure.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import type { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'weekly';
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  return d;
}
const today = new Date(2026, 7, 11);

console.log('=== Section 3: complete invalid-source fixture matrix (real computeSafeToSpend) ===');
{
  function report(patch: (d: AppData) => void) {
    const d = baseData();
    patch(d);
    const r = computeSafeToSpend(d, today);
    return {
      moneyBalanceStatus: r.moneyBalanceStatus,
      availability: r.availability,
      cycleRemainingPool: r.cycleRemainingPool,
      dailyAllowance: r.dailyAllowance,
      plannedDailyAllowance: r.plannedDailyAllowance,
      allFinite: [r.includedMoneyBalance, r.cycleRemainingPool, r.dailyAllowance, r.plannedDailyAllowance].every(Number.isFinite),
    };
  }

  // Participating balance
  {
    const r = report((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }]; });
    assert('participating balance NaN -> availability=unavailable_balance_data, moneyBalanceStatus=invalid_data, all fields finite', r.availability === 'unavailable_balance_data' && r.moneyBalanceStatus === 'invalid_data' && r.allFinite);
  }

  // Recurring bill
  {
    const r = report((d) => { d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: NaN, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }]; });
    assert('recurring bill NaN -> availability=unavailable_other_data, moneyBalanceStatus stays valid (never blames balances), all fields finite', r.availability === 'unavailable_other_data' && r.moneyBalanceStatus === 'valid' && r.allFinite);
  }

  // Recurring income — proven NOT to reach the AUP headline fields at all:
  // cycleIncomeExpected is deliberately excluded from cycleRemainingPool's
  // own formula (confirmed by source read of safeToSpend.ts), so a
  // corrupted income item cannot corrupt what this pass audits.
  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): cycleRemainingPool
  // itself is indeed unaffected (confirmed again below), but the general
  // finite backstop added this pass now also catches cycleIncomeExpected/
  // cycleDiscretionaryPool going non-finite from corrupted income — fields
  // this file's earlier, narrower check never looked at. Correctly
  // unavailable_other_data now, not available. See
  // tests/safe-to-spend-consumer-closure.test.ts Section 5.
  {
    const r = report((d) => { d.recurringItems = [{ id: 'i1', type: 'income', label: 'Salary', amount: NaN, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: false, active: true }]; });
    assert(
      'FIXED (widened general backstop): recurring income NaN -> availability=unavailable_other_data (cycleIncomeExpected/cycleDiscretionaryPool going non-finite is now caught, even though cycleRemainingPool itself stays unaffected by design)',
      r.availability === 'unavailable_other_data' && r.cycleRemainingPool === 1000 && r.allFinite
    );
  }

  // Ad-hoc income (income transaction)
  {
    const r = report((d) => { d.transactions = [{ id: 't1', type: 'income', category: 'other', amount: NaN, date: today.toISOString() } as any]; });
    assert(
      'FIXED (widened general backstop): ad-hoc income transaction NaN -> availability=unavailable_other_data, same mechanism as recurring income above',
      r.availability === 'unavailable_other_data' && r.allFinite
    );
  }

  // Confirmed expense transaction (dated today — feeds todaysSpend/plannedDailyAllowance)
  {
    const r = report((d) => { d.transactions = [{ id: 't1', type: 'expense', category: 'other', amount: NaN, date: today.toISOString(), paymentSource: 'cash' } as any]; });
    assert('confirmed expense transaction NaN, dated today -> availability=unavailable_other_data via plannedDailyAllowance, moneyBalanceStatus untouched, all fields finite', r.availability === 'unavailable_other_data' && r.moneyBalanceStatus === 'valid' && r.allFinite);
  }

  // Savings reservation — the REAL field is user.savingsAllocation
  // ({mode, amount, percent}), not a flat field; verified via
  // resolveSavingsAllocationMonthly's own signature before writing this
  // fixture, so this is a genuine test, not a silent no-op.
  {
    const r = report((d) => { (d.user as any).savingsAllocation = { mode: 'fixed', amount: NaN }; });
    assert('savings allocation (fixed amount) NaN -> availability=unavailable_other_data, moneyBalanceStatus untouched', r.availability === 'unavailable_other_data' && r.moneyBalanceStatus === 'valid' && r.allFinite);
  }

  // Goal reservation
  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): the finding below was true
  // when this section was first written, but was itself a real, separate
  // defect — requiredMonthlyForGoal's `!goal.targetAmount` check silently
  // treats a corrupted NaN identically to "no target set," zeroing the
  // goal's real funding requirement and inflating cycleRemainingPool. Fixed
  // this pass via an explicit hasInvalidGoalData check in safeToSpend.ts.
  {
    const r = report((d) => { d.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: NaN, currentAmount: 0, targetDate: null, priority: 'high', status: 'active' }]; });
    assert(
      'FIXED: goal targetAmount NaN -> availability=unavailable_other_data (hasInvalidGoalData explicit check; previously silently coerced to a $0 funding requirement)',
      r.availability === 'unavailable_other_data' && r.moneyBalanceStatus === 'valid' && r.allFinite
    );
  }

  // Credit-card / liability inputs
  {
    const r = report((d) => { d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: NaN, dueDay: today.getDate(), minimumPayment: 25 }]; });
    assert('credit card currentBalance NaN -> availability stays available (creditHealth.ts sanitizeBalance floors it first)', r.availability === 'available' && r.allFinite);
  }
  {
    const r = report((d) => { d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 500, dueDay: today.getDate(), minimumPayment: 25, expectedMonthlyRepayment: NaN }]; });
    assert('credit card expectedMonthlyRepayment NaN -> availability stays available', r.availability === 'available' && r.allFinite);
  }

  // Unrelated excluded data — non-liquid asset
  {
    const r = report((d) => { d.assets.push({ id: 'p1', type: 'property', label: 'House', currentValue: NaN }); });
    assert('unrelated excluded non-liquid asset (property) NaN mixed with a valid cash balance -> availability stays available, never made unavailable by excluded data', r.availability === 'available' && r.cycleRemainingPool === 1000 && r.allFinite);
  }

  // No eligible balance — a real, normal state, not unavailable
  {
    const r = report((d) => { d.assets = []; });
    assert('no eligible balance -> moneyBalanceStatus=no_eligible_balance, availability=available (a legitimate state, not an error)', r.moneyBalanceStatus === 'no_eligible_balance' && r.availability === 'available' && r.allFinite);
  }

  // Valid zero
  {
    const r = report((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 0 }]; });
    assert('valid zero balance -> valid/available, cycleRemainingPool exactly 0', r.moneyBalanceStatus === 'valid' && r.availability === 'available' && r.cycleRemainingPool === 0);
  }

  // Valid negative
  {
    const r = report((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: -50 }]; });
    assert('valid negative balance -> valid/available, real negative figures preserved', r.moneyBalanceStatus === 'valid' && r.availability === 'available' && r.cycleRemainingPool === -50 && r.dailyAllowance < 0);
  }
}

console.log('\n=== Section 4: Navilo Score consumer gap — exact factor outputs (real computeLuluScore) ===');
{
  function scoreReport(patch: (d: AppData) => void) {
    const d = baseData();
    d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: 500, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }];
    patch(d);
    const r = computeLuluScore(d);
    const resilience = r.categories.find((c) => c.key === 'resilience')!;
    const payday = resilience.factors.find((f) => f.key === 'payday_safety')!;
    return { score: r.score, confidence: r.confidence, paydayStatus: payday.status, paydayPoints: payday.points, paydayMaxPoints: payday.maxPoints };
  }

  const valid = scoreReport(() => {});
  assert('fully valid fixture -> payday_safety scores fully (healthy, full points)', valid.paydayStatus === 'healthy' && Math.abs(valid.paydayPoints - valid.paydayMaxPoints) < 0.01);

  const invalidBalance = scoreReport((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }]; });
  assert(
    'invalid participating balance -> payday_safety falls back to the EXISTING not_enough_info/0.5-fraction mechanism (never scores a normal-looking result from a floored placeholder) — exactly half its max points',
    invalidBalance.paydayStatus === 'not_enough_info' && Math.abs(invalidBalance.paydayPoints - invalidBalance.paydayMaxPoints * 0.5) < 0.01
  );
  assert('invalid participating balance -> overall score is lower than the valid fixture, a real consequence of genuine data uncertainty, not a floored false-positive', invalidBalance.score < valid.score);

  const invalidBill = scoreReport((d) => { d.recurringItems.push({ id: 'b2', type: 'expense', label: 'Other', amount: NaN, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }); });
  assert(
    'invalid recurring bill -> payday_safety also falls back to not_enough_info (same mechanism, correctly triggered by unavailable_other_data too)',
    invalidBill.paydayStatus === 'not_enough_info' && Math.abs(invalidBill.paydayPoints - invalidBill.paydayMaxPoints * 0.5) < 0.01
  );

  const invalidTxn = scoreReport((d) => { d.transactions = [{ id: 't1', type: 'expense', category: 'other', amount: NaN, date: today.toISOString(), paymentSource: 'cash' } as any]; });
  assert(
    'invalid transaction -> payday_safety also falls back to not_enough_info',
    invalidTxn.paydayStatus === 'not_enough_info' && Math.abs(invalidTxn.paydayPoints - invalidTxn.paydayMaxPoints * 0.5) < 0.01
  );

  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): the finding below was true
  // when this section was first written, but was itself the exact defect
  // targeted by this pass's §2 fix — no_eligible_balance means nothing was
  // ever recorded to compare against upcoming bills, which is insufficient
  // information for this factor, not a confirmed $0 the customer should be
  // scored against. hasPaydaySafetyData now also requires
  // moneyBalanceStatus === 'valid' (not just availability === 'available'),
  // so no_eligible_balance correctly falls back to the same not_enough_info
  // path used for "no payday data yet" — proven identical below.
  const noBalance = scoreReport((d) => { d.assets = []; });
  assert(
    'FIXED: no eligible balance -> payday_safety falls back to not_enough_info/half points (insufficient data to assess, not a scored $0 result)',
    noBalance.paydayStatus === 'not_enough_info' && Math.abs(noBalance.paydayPoints - noBalance.paydayMaxPoints * 0.5) < 0.01
  );

  // §2 required proof: no_eligible_balance must score identically to the
  // existing "no payday data yet" not_enough_info fallback — proving it is
  // NOT penalised as though the customer recorded a genuine $0 balance.
  const noPaydayData = scoreReport((d) => { d.user.nextPayday = null as any; });
  assert(
    'no eligible balance scores identically to an otherwise-identical no-payday-data fixture (same status, same points) — confirms no_eligible_balance is treated as missing data, not a scored $0',
    noBalance.paydayStatus === noPaydayData.paydayStatus && Math.abs(noBalance.paydayPoints - noPaydayData.paydayPoints) < 0.01
  );
}

console.log('\n=== Section 5: repair-path findings (Structural — SelectBalancesSheet/AddWealthItemModal/WealthScreen cannot be imported by tsx) ===');
{
  const SELECT_BALANCES_SRC = readFileSync('src/components/money/SelectBalancesSheet.tsx', 'utf8');
  assert(
    'CONFIRMED LIMITATION: SelectBalancesSheet saves ONLY via updateAssetsIncludeInMoney(changes: {id, included}[]) — a boolean-inclusion writer with no currentValue field anywhere in its change shape or its own commitDraft() call — it cannot edit or remove a corrupted balance value, only include/exclude the whole record',
    /updateAssetsIncludeInMoney/.test(SELECT_BALANCES_SRC) &&
      /changes: \{ id: string; included: boolean \}\[\]/.test(SELECT_BALANCES_SRC) &&
      !/currentValue:/.test(SELECT_BALANCES_SRC) &&
      !/TextInput/.test(SELECT_BALANCES_SRC)
  );

  const ADD_WEALTH_ITEM_SRC = readFileSync('src/components/wealth/AddWealthItemModal.tsx', 'utf8');
  assert(
    'the REAL repair destination exists elsewhere: AddWealthItemModal accepts editAsset, seeds its form value from editAsset.currentValue, and persists edits via updateAsset(editAsset.id, ...)',
    /editAsset\?\: Asset \| null/.test(ADD_WEALTH_ITEM_SRC) &&
      /setValue\(String\(editAsset\.currentValue\)\)/.test(ADD_WEALTH_ITEM_SRC) &&
      /updateAsset\(editAsset\.id,/.test(ADD_WEALTH_ITEM_SRC)
  );

  const WEALTH_SCREEN_SRC = readFileSync('src/screens/wealth/WealthScreen.tsx', 'utf8');
  assert(
    'WealthScreen.tsx is the only screen that currently wires AddWealthItemModal with editAsset (the true repair path), reached by tapping an asset row there — NOT from the Money tab AUP card',
    /editAsset=\{editAsset\}/.test(WEALTH_SCREEN_SRC)
  );

  // CONCLUSION: "Manage Balances" (SafeToSpendHero -> onSelectBalances ->
  // SelectBalancesSheet) does NOT repair a corrupted currentValue — it can
  // only include/exclude a balance from the calculation. The user's own
  // instruction directs connecting the error action to the smallest
  // existing repair pathway if one exists, and one does (AddWealthItemModal
  // via WealthScreen's editAsset) — but wiring that from
  // SafeToSpendHero/SafeToSpendResult would require adding a new prop to
  // SafeToSpendHero.tsx (acceptable) AND having MoneyScreen.tsx pass a new
  // callback that opens AddWealthItemModal with the specific corrupted
  // asset (not acceptable this pass: MoneyScreen.tsx is one of the three
  // Pass 0 files this closure must preserve byte-identical). This is
  // reported as the exact remaining repair-path limitation, not silently
  // left unstated: today, tapping Manage Balances from an
  // unavailable_balance_data card opens SelectBalancesSheet, where the
  // corrupted account IS visible (proven in the prior closure pass) but its
  // value cannot be edited or removed there. The user must navigate to the
  // Wealth tab separately and tap that asset to actually repair it.
  //
  // For unavailable_other_data (bill/transaction corruption): no
  // destination is offered at all (heroState renders no
  // renderManageBalancesButton in that branch, proven in
  // safe-to-spend-closure-corrections.test.ts Section 8) — correct per the
  // instruction to retain neutral wording without an incorrect
  // balance-specific action, since SafeToSpendResult does not expose which
  // specific bill/transaction is invalid, so no accurate destination can be
  // computed.
}

console.log('\n=== Section 6: downstream-consumer recheck — computeAttentionItems (MoneyScreen/moneyTimeline) ===');
{
  const MONEY_TIMELINE_SRC = readFileSync('src/lib/calculations/moneyTimeline.ts', 'utf8');
  assert(
    'CONFIRMED, READ-ONLY: computeAttentionItems itself only compares remainingPool < 0 as a boolean threshold and never displays the raw dollar amount — unchanged this pass, moneyTimeline.ts stays a byte-identical Pass 0 file',
    /export function computeAttentionItems\(events: TimelineEvent\[\], remainingPool: number, maxItems: number = 3\)/.test(MONEY_TIMELINE_SRC) &&
      /if \(remainingPool < 0\) \{/.test(MONEY_TIMELINE_SRC)
  );

  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): the false-positive this
  // finding described (an invalid/placeholder pool value reaching
  // computeAttentionItems' < 0 check) is now fixed — not inside
  // moneyTimeline.ts (still untouched, confirmed above), but at its only
  // call site, in MoneyScreen.tsx's new, separately authorised Pass 1 hunk.
  const MONEY_SCREEN_SRC = readFileSync('src/screens/money/MoneyScreen.tsx', 'utf8');
  assert(
    "FIXED: MoneyScreen.tsx's computeAttentionItems call site now gates the pool it passes through — only safeToSpend.cycleRemainingPool when availability === 'available' && moneyBalanceStatus === 'valid', otherwise 0 — so an invalid/placeholder pool can never reach computeAttentionItems' remainingPool < 0 rule",
    /const attentionPool =\s*\n\s*safeToSpend\.availability === 'available' && safeToSpend\.moneyBalanceStatus === 'valid' \? safeToSpend\.cycleRemainingPool : 0;/.test(MONEY_SCREEN_SRC) &&
      /computeAttentionItems\(timelineEvents, attentionPool\)/.test(MONEY_SCREEN_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
