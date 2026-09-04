// Pass C.1 correction — the physical-device figures from the review (§6) must
// keep reconciling. CLASSIFICATION: Real import (Class A): the real
// computeSafeToSpend and computeLookAheadProjection, no mirrored maths.
//
// Default AUP, 30 Aug → 4 Sep 2026:
//   opening $6,300 − rent $1,000 (31 Aug) − gym $150 (3 Sep) − reservation $32
//     = $5,118 ; $5,118 / 5 days = $1,023.60 → "about $1,024" ; 4 Sep salary excluded.
// End-of-month scenario, 31 Aug 2026:
//   opening $6,300 + assumed $0 − dated rent $1,000 = $5,300 ; lowest $5,300 ;
//   savings/goals ~$8.96 informational (not subtracted) ; protected $2,000
//   excluded from opening ; 3 Sep gym & 4 Sep salary outside the horizon.
//
// Run with: npx tsx tests/c1-device-reconciliation.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { formatDollarsCentsAware, formatCentsCentsAware } from '../src/lib/calculations/money';
import { formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { localDateFromDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

process.env.TZ = process.env.TZ || 'Australia/Melbourne';
let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const cents = (n: number) => Math.round(n * 100);

// Monthly payday 4 Sep; weekly-frequency labels use monthly here so both the
// 31 Aug rent and 3 Sep gym fall in the AUP window. Savings allocation $32/mo
// (cycleFraction 1 over the 30-day monthly cycle) → the accepted $32 reservation.
function deviceData(): AppData {
  const d = createEmptyAppData();
  d.user = {
    ...d.user,
    hasSeenIntro: true,
    monthlyIncome: 6000,
    payFrequency: 'monthly',
    nextPayday: iso(2026, 9, 4),
    savingsAllocation: { mode: 'amount', amount: 32 } as any,
  } as typeof d.user;
  d.assets = [
    { id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 6300, includeInMoneyCalculations: true },
    { id: 'save', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false },
  ] as Asset[];
  d.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 8, 31), isFixed: true, active: true },
    { id: 'gym', type: 'expense', label: 'Gym', amount: 150, frequency: 'monthly', nextDueDate: iso(2026, 9, 3), isFixed: true, active: true },
    { id: 'salary', type: 'income', label: 'Salary', amount: 6000, frequency: 'monthly', nextDueDate: iso(2026, 9, 4), isFixed: false, active: true },
  ] as RecurringItem[];
  return d;
}

console.log('=== Default AUP 30 Aug → 4 Sep: $5,118 available, ~$1,024/day ===');
{
  const r = computeSafeToSpend(deviceData(), day(2026, 8, 30));
  assert('bills before payday = rent + gym = $1,150', cents(r.cycleBillsExpected) === cents(1150));
  assert('this cycle reservation = $32', cents(r.cycleSavingsReserved + r.cycleGoalsReserved) === cents(32));
  assert('Available until payday = $5,118', cents(r.cycleRemainingPool) === cents(5118));
  assert('protected $2,000 savings excluded from opening', cents(r.includedMoneyBalance) === cents(6300));
  assert('5 days remaining to payday', r.daysRemaining === 5);
  assert('daily amount = $1,023.60, shown rounded as "$1,024"', formatSafeToSpendAmount(r.dailyAllowance) === '$1,024');
  assert('available renders cents-aware as "$5,118" (no ".00")', formatDollarsCentsAware(r.cycleRemainingPool) === '$5,118');
  // dated markers: rent 31 Aug + gym 3 Sep; the 4 Sep salary is NOT a deduction.
  assert('two dated deductions (rent, gym); no income', r.datedDeductions.length === 2 && r.datedDeductions.every((x) => x.kind === 'bill'));
  assert('deductions are 31 Aug rent and 3 Sep gym', r.datedDeductions[0].date.getTime() === day(2026, 8, 31).getTime() && r.datedDeductions[1].date.getTime() === day(2026, 9, 3).getTime());
}

console.log('=== End-of-month scenario 31 Aug: estimated & lowest $5,300 ===');
{
  const asOf = localDateFromDate(day(2026, 8, 30));
  const target = localDateFromDate(day(2026, 8, 31));
  const result = computeLookAheadProjection(deviceData(), asOf, target);
  assert('projection available', result.available === true);
  if (result.available) {
    assert('estimated position = $5,300', result.targetCents === cents(5300));
    assert('lowest position = $5,300 on 31 Aug', result.lowest.cents === cents(5300) && result.lowest.date.day === 31 && result.lowest.date.month === 8);
    assert('no shortfall', result.firstShortfall === null);
    assert('assumed future income is $0 (salary is 4 Sep, outside horizon)', result.breakdown.assumedIncomeCents === 0);
    assert('protected $2,000 excluded from opening', result.protectedSavings.cents === cents(2000));
    assert('savings/goals ~$8.96 informational, not subtracted', (result.informationalPlan.combinedCents ?? 0) > 0 && result.targetCents === cents(5300));
    assert('estimated renders cents-aware as "$5,300"', formatCentsCentsAware(result.targetCents) === '$5,300');
    const p = selectLookAheadPresentation(result);
    assert('presentation headline names the date', /Estimated position by 31 Aug 2026/.test(p.headline));
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
