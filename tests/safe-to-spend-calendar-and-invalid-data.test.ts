// Pass 1 — Available Until Payday calculation hardening, 2026-08-11.
//
// CLASSIFICATION: Real import (Class A) throughout — every section below
// imports and directly executes the actual shipped
// computeSafeToSpend/computeMoneyAvailableBalances/computeMoneyBalanceStatus
// (src/lib/calculations/safeToSpend.ts, src/lib/calculations/liquidAssets.ts),
// not a copy or a mirrored formula.
//
// Scope: exactly the two defects identified in the Today/Grow closure
// report (2026-08-11) — calendar-date handling affecting daysRemaining, and
// NaN/Infinity/-Infinity monetary values contaminating Available Until
// Payday. Everything else about computeSafeToSpend (the AUP formula itself,
// exact-cent balances, inclusion/exclusion rules, recurring schedule
// windows, goal allocation) is intentionally NOT re-derived here — the
// "valid fixture" section below exists only to prove those are unchanged
// by this pass, not to re-test them from scratch.
//
// Defects reproduced BEFORE this file's corresponding source fix (captured
// verbatim, real function calls against the unmodified Pass 0 code):
//   today == payday (Melbourne)         -> daysRemaining WAS 1, contract requires 0
//   Apr 2 -> Apr 9 2026 (crosses the Melbourne 2026-04-05 AEDT->AEST
//     fall-back transition, a real 25-hour local day)
//                                        -> daysRemaining WAS 8, correct value is 7
//   NaN/Infinity/-Infinity currentValue -> includedMoneyBalance/
//     cycleRemainingPool/dailyAllowance WERE NaN/Infinity/-Infinity
//   a legitimate $0 balance and "no eligible balance at all" WERE
//     indistinguishable (both produced includedMoneyBalance: 0, no way to
//     tell corrupted-and-zeroed-out from genuinely empty)
//
// Run with: npx tsx tests/safe-to-spend-calendar-and-invalid-data.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMoneyAvailableBalances, computeMoneyBalanceStatus } from '../src/lib/calculations/liquidAssets';
import type { AppData, Asset } from '../src/types/models';

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
  return d;
}

function withPayday(paydayLocal: [number, number, number], assets: Asset[] = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }]): AppData {
  const d = baseData();
  d.user.nextPayday = new Date(paydayLocal[0], paydayLocal[1] - 1, paydayLocal[2]).toISOString();
  d.assets = assets;
  return d;
}

console.log('=== Calendar-date contract — daysRemaining (real computeSafeToSpend) ===');
{
  process.env.TZ = 'Australia/Melbourne';
  const today = (y: number, m: number, d: number) => new Date(y, m - 1, d);

  assert(
    'ordinary case: 11 Aug 2026 -> 14 Aug 2026 = 3 days',
    computeSafeToSpend(withPayday([2026, 8, 14]), today(2026, 8, 11)).daysRemaining === 3
  );
  assert(
    'today == payday -> 0 days (contract: never 1)',
    computeSafeToSpend(withPayday([2026, 8, 14]), today(2026, 8, 14)).daysRemaining === 0
  );
  assert(
    'payday tomorrow -> 1 day',
    computeSafeToSpend(withPayday([2026, 8, 14]), today(2026, 8, 13)).daysRemaining === 1
  );
  assert(
    'Melbourne DST start (spring forward, 2026-10-04): Oct 1 -> Oct 8 = 7 days',
    computeSafeToSpend(withPayday([2026, 10, 8]), today(2026, 10, 1)).daysRemaining === 7
  );
  assert(
    'Melbourne DST end (fall back, 2026-04-05): Apr 2 -> Apr 9 = 7 days — the real regression this pass fixes (was 8)',
    computeSafeToSpend(withPayday([2026, 4, 9]), today(2026, 4, 2)).daysRemaining === 7
  );
  assert(
    'leap year / month-end: 27 Feb 2028 -> 1 Mar 2028 = 3 days',
    computeSafeToSpend(withPayday([2028, 3, 1]), today(2028, 2, 27)).daysRemaining === 3
  );
  assert(
    'ordinary date one week later, no boundary crossed -> 7 days',
    computeSafeToSpend(withPayday([2026, 9, 1]), today(2026, 8, 25)).daysRemaining === 7
  );

  // Same local calendar dates, evaluated under three different device
  // timezones (Melbourne with DST, Perth with none, UTC) — proves the fix
  // does not hard-code a Melbourne offset and behaves consistently for the
  // *local* calendar date under whatever timezone the device is actually
  // in, not a fixed offset baked into the calculation.
  process.env.TZ = 'Australia/Melbourne';
  const melPayday = new Date(2026, 7, 14).toISOString();
  const melToday = new Date(2026, 7, 11);
  const melData = baseData();
  melData.user.nextPayday = melPayday;
  melData.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  const melResult = computeSafeToSpend(melData, melToday);

  process.env.TZ = 'Australia/Perth';
  const perthPayday = new Date(2026, 7, 14).toISOString();
  const perthToday = new Date(2026, 7, 11);
  const perthData = baseData();
  perthData.user.nextPayday = perthPayday;
  perthData.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  const perthResult = computeSafeToSpend(perthData, perthToday);

  process.env.TZ = 'UTC';
  const utcPayday = new Date(2026, 7, 14).toISOString();
  const utcToday = new Date(2026, 7, 11);
  const utcData = baseData();
  utcData.user.nextPayday = utcPayday;
  utcData.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  const utcResult = computeSafeToSpend(utcData, utcToday);

  assert(
    'the same 3-day local gap (11th -> 14th) is 3 under Melbourne, Perth, and UTC alike — each computed against its own local calendar date',
    melResult.daysRemaining === 3 && perthResult.daysRemaining === 3 && utcResult.daysRemaining === 3
  );
  process.env.TZ = 'Australia/Melbourne';
}

console.log('\n=== Calendar-date contract — existing full-ISO-timestamp shapes ===');
{
  process.env.TZ = 'Australia/Melbourne';
  // Matches AddIncomeModal.tsx's real fallback (new Date().toISOString())
  // and AddRecurringItemModal.tsx's real nextOccurrence() shape (local
  // midnight -> toISOString()) — both produce a full ISO instant, never a
  // bare YYYY-MM-DD, which is what nextPayday actually contains today.
  const localMidnightIso = new Date(2026, 7, 14, 0, 0, 0, 0).toISOString();
  const d = baseData();
  d.user.nextPayday = localMidnightIso;
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  const result = computeSafeToSpend(d, new Date(2026, 7, 11));
  assert('a real local-midnight-constructed full ISO timestamp still resolves to 3 days', result.daysRemaining === 3);
}

console.log('\n=== Invalid monetary data — computeMoneyAvailableBalances / computeMoneyBalanceStatus (real functions) ===');
{
  const cash = (v: number, id = 'a'): Asset => ({ id, type: 'cash', label: 'Cash', currentValue: v });

  assert('NaN currentValue -> excluded from the sum, never NaN', Number.isFinite(computeMoneyAvailableBalances([cash(NaN)])));
  assert('NaN currentValue -> status invalid_data', computeMoneyBalanceStatus([cash(NaN)]) === 'invalid_data');
  assert('Infinity currentValue -> excluded from the sum, never Infinity', Number.isFinite(computeMoneyAvailableBalances([cash(Infinity)])));
  assert('Infinity currentValue -> status invalid_data', computeMoneyBalanceStatus([cash(Infinity)]) === 'invalid_data');
  assert('-Infinity currentValue -> excluded from the sum, never -Infinity', Number.isFinite(computeMoneyAvailableBalances([cash(-Infinity)])));
  assert('-Infinity currentValue -> status invalid_data', computeMoneyBalanceStatus([cash(-Infinity)]) === 'invalid_data');

  assert('valid $0 balance -> sum is 0', computeMoneyAvailableBalances([cash(0)]) === 0);
  assert('valid $0 balance -> status valid (never invalid_data, never no_eligible_balance)', computeMoneyBalanceStatus([cash(0)]) === 'valid');

  assert('valid negative balance -> sum is -50, unchanged, never treated as invalid', computeMoneyAvailableBalances([cash(-50)]) === -50);
  assert('valid negative balance -> status valid', computeMoneyBalanceStatus([cash(-50)]) === 'valid');

  assert('no assets at all -> sum is 0', computeMoneyAvailableBalances([]) === 0);
  assert('no assets at all -> status no_eligible_balance (distinct from a legitimate $0)', computeMoneyBalanceStatus([]) === 'no_eligible_balance');
  assert(
    'an asset exists but is not an eligible type -> status no_eligible_balance',
    computeMoneyBalanceStatus([{ id: 'p', type: 'property', label: 'House', currentValue: 500000 }]) === 'no_eligible_balance'
  );

  const mixed = [cash(500, 'a'), cash(NaN, 'b')];
  assert('invalid mixed with valid -> sum reflects only the valid entry (500), never NaN', computeMoneyAvailableBalances(mixed) === 500);
  assert('invalid mixed with valid -> status still invalid_data (the valid entry does not mask the corrupted one)', computeMoneyBalanceStatus(mixed) === 'invalid_data');
}

console.log('\n=== Invalid monetary data — computeSafeToSpend end-to-end (real function, real AppData) ===');
{
  process.env.TZ = 'Australia/Melbourne';
  const today = new Date(2026, 7, 11);

  function statusAndFinite(assets: Asset[]) {
    const r = computeSafeToSpend(withPayday([2026, 8, 14], assets), today);
    return {
      status: r.moneyBalanceStatus,
      allFinite: [r.includedMoneyBalance, r.cycleRemainingPool, r.dailyAllowance, r.plannedDailyAllowance].every(Number.isFinite),
      includedMoneyBalance: r.includedMoneyBalance,
      cycleRemainingPool: r.cycleRemainingPool,
    };
  }

  const nan = statusAndFinite([{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }]);
  assert('NaN asset -> every customer-facing numeric field on SafeToSpendResult is finite', nan.allFinite);
  assert('NaN asset -> moneyBalanceStatus is invalid_data', nan.status === 'invalid_data');

  const inf = statusAndFinite([{ id: 'a', type: 'cash', label: 'Cash', currentValue: Infinity }]);
  assert('Infinity asset -> every customer-facing numeric field is finite', inf.allFinite);
  assert('Infinity asset -> moneyBalanceStatus is invalid_data', inf.status === 'invalid_data');

  const negInf = statusAndFinite([{ id: 'a', type: 'cash', label: 'Cash', currentValue: -Infinity }]);
  assert('-Infinity asset -> every customer-facing numeric field is finite', negInf.allFinite);
  assert('-Infinity asset -> moneyBalanceStatus is invalid_data', negInf.status === 'invalid_data');

  const mixed = statusAndFinite([
    { id: 'a', type: 'cash', label: 'Cash', currentValue: 500 },
    { id: 'b', type: 'everyday', label: 'Everyday', currentValue: NaN },
  ]);
  assert('invalid mixed with valid, end-to-end -> finite fields', mixed.allFinite);
  assert('invalid mixed with valid, end-to-end -> invalid_data status (not silently presented as a normal $500 figure)', mixed.status === 'invalid_data');
  assert('invalid mixed with valid, end-to-end -> the finite fallback sum still reflects only the valid entry, matching the standalone function', mixed.includedMoneyBalance === 500);

  const zero = statusAndFinite([{ id: 'a', type: 'cash', label: 'Cash', currentValue: 0 }]);
  assert('valid $0 balance, end-to-end -> status valid', zero.status === 'valid');
  assert('valid $0 balance, end-to-end -> cycleRemainingPool is exactly 0', zero.cycleRemainingPool === 0);

  const none = statusAndFinite([]);
  assert('no eligible balance, end-to-end -> status no_eligible_balance, distinct from the valid-$0 case above', none.status === 'no_eligible_balance');

  const negBalance = statusAndFinite([{ id: 'a', type: 'cash', label: 'Cash', currentValue: -50 }]);
  assert('valid negative balance, end-to-end -> status valid (never invalid_data)', negBalance.status === 'valid');
  assert('valid negative balance, end-to-end -> cycleRemainingPool reflects the real negative figure', negBalance.cycleRemainingPool === -50);
}

console.log('\n=== Missing payday — unaffected by this pass ===');
{
  process.env.TZ = 'Australia/Melbourne';
  const d = baseData();
  d.user.nextPayday = null;
  d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 500 }];
  const r = computeSafeToSpend(d, new Date(2026, 7, 11));
  assert('missing payday -> hasKnownPayday is false', r.hasKnownPayday === false);
  assert('missing payday -> moneyBalanceStatus is still correctly valid for a genuine $500 balance', r.moneyBalanceStatus === 'valid');
  assert('missing payday -> every numeric field remains finite', [r.includedMoneyBalance, r.cycleRemainingPool, r.dailyAllowance].every(Number.isFinite));
}

console.log('\n=== Valid fixtures unchanged — exact-cent regression proof ===');
{
  process.env.TZ = 'Australia/Melbourne';
  // The exact fixture from the closure report's worked example, minus the
  // BNPL/credit-card items (out of this pass's scope) — proves the AUP
  // dollar figure itself (cycleRemainingPool) is untouched by this pass;
  // only daysRemaining/dailyAllowance/plannedDailyAllowance and the new
  // moneyBalanceStatus field changed.
  const d = baseData();
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 5000 }];
  const r = computeSafeToSpend(d, new Date(2026, 7, 11));
  assert('valid fixture: includedMoneyBalance is exactly $5,000.00, unrounded', r.includedMoneyBalance === 5000);
  assert('valid fixture: cycleRemainingPool with no bills/goals/savings equals includedMoneyBalance exactly', r.cycleRemainingPool === 5000);
  assert('valid fixture: daysRemaining is the correct 3-day calendar count', r.daysRemaining === 3);
  assert('valid fixture: dailyAllowance = 5000/3 exactly, not rounded, not NaN', Math.abs(r.dailyAllowance - 5000 / 3) < 1e-9);
  assert('valid fixture: moneyBalanceStatus is valid', r.moneyBalanceStatus === 'valid');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
