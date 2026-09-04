// Pass C.1 presentation — regression lock for the §2 physical-device values.
// CLASSIFICATION: Real import (Class A): the real computeSafeToSpend /
// computeLookAheadProjection / computeMonthToDateActivity, no mirrored maths.
// This pass changed NO calculation engine; this test guards the accepted
// values against future drift.
//
// The fixture reconciles EXACTLY to 11 of the 13 §2 figures. The informational
// savings/goals amounts ($660.44 / $991.55 / $1,708.96) are NOT asserted to
// the founder's exact cents: they depend on the founder's precise savings/goal
// allocation, which cannot be reconstructed jointly with the AUP reservation
// from the display values alone (the two use different period bases). What IS
// asserted — and is the trust-critical property — is that the informational
// plan is informational ONLY: it is never subtracted from the projection (the
// estimate reconciles to opening + assumed income − dated bills, with no
// savings term), and it grows with the horizon.
//
// Run with: npx tsx tests/c1-device-reconciliation-v2.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeMonthToDateActivity } from '../src/lib/calculations/monthlySummary';
import { formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { localDateFromDate } from '../src/lib/calculations/localCalendar';
import type { AppData } from '../src/types/models';

process.env.TZ = process.env.TZ || 'Australia/Melbourne';
let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const L = (y: number, m: number, d: number) => localDateFromDate(new Date(y, m - 1, d));
const c = (n: number) => Math.round(n * 100);

function fixture(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, monthlyIncome: 14000, payFrequency: 'monthly', nextPayday: iso(2026, 9, 4), savingsAllocation: { mode: 'amount', amount: 386.3 } as any } as typeof d.user;
  d.assets = [
    { id: 'main', type: 'everyday', label: 'Main', currentValue: 5300, includeInMoneyCalculations: true },
    { id: 'house', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false },
  ] as typeof d.assets;
  d.recurringItems = [
    { id: 'inc', type: 'income', label: 'Pay', amount: 3500, frequency: 'weekly', nextDueDate: iso(2026, 9, 4), isFixed: false, active: true },
    { id: 'gym', type: 'expense', label: 'Gym', amount: 150, frequency: 'weekly', nextDueDate: iso(2026, 9, 3), isFixed: true, active: true },
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 7), isFixed: true, active: true },
  ] as typeof d.recurringItems;
  d.transactions = [
    { id: 'i1', type: 'income', amount: 5500, date: iso(2026, 8, 1) } as any,
    { id: 'e1', type: 'expense', amount: 1500, date: iso(2026, 8, 1), paymentSource: 'everyday', targetAssetId: 'main' } as any,
  ];
  return d;
}

console.log('=== AUP — 4 September ===');
{
  const s = computeSafeToSpend(fixture(), new Date(2026, 7, 31));
  assert('Available until payday = $4,763.70', c(s.cycleRemainingPool) === c(4763.7));
  assert('opening spendable = $5,300 (excluded savings omitted)', c(s.includedMoneyBalance) === c(5300));
  assert('bills before payday = gym $150 (rent 7 Sep excluded; salary 4 Sep excluded)', c(s.cycleBillsExpected) === c(150));
  assert('reservation = $386.30', c(s.cycleSavingsReserved + s.cycleGoalsReserved) === c(386.3));
  assert('4 days to payday', s.daysRemaining === 4);
  assert('about per day = $1,191', formatSafeToSpendAmount(s.dailyAllowance) === '$1,191');
}

console.log('=== Look Ahead — 11 / 17 / 30 September ===');
{
  const data = fixture();
  const cases: [number, number, number][] = [
    [11, 1100000, 515000],
    [17, 985000, 515000],
    [30, 1470000, 515000],
  ];
  let prevInfo = -1;
  for (const [day, estCents, lowCents] of cases) {
    const r = computeLookAheadProjection(data, L(2026, 8, 31), L(2026, 9, day));
    if (!r.available) { assert(`${day} Sep available`, false); continue; }
    assert(`${day} Sep estimated position = $${estCents / 100}`, r.targetCents === estCents);
    assert(`${day} Sep lowest = $${lowCents / 100} on 3 Sep`, r.lowest.cents === lowCents && r.lowest.date.day === 3 && r.lowest.date.month === 9);
    assert(`${day} Sep excluded savings = $2,000, informational only`, r.protectedSavings.cents === c(2000));
    // Informational-ONLY: the estimate is opening + net dated events, with NO
    // savings/goals term subtracted.
    assert(`${day} Sep estimate never subtracts savings/goals`, r.targetCents === r.breakdown.openingCents + r.breakdown.netEventsCents);
    const info = r.informationalPlan.combinedCents ?? 0;
    assert(`${day} Sep informational plan is present, positive and grows with the horizon`, info > 0 && info > prevInfo);
    prevInfo = info;
  }
}

console.log('=== Recorded month ===');
{
  const a = computeMonthToDateActivity(fixture(), new Date(2026, 7, 31));
  assert('income recorded = $5,500', a.income === 5500);
  assert('spending recorded = $1,500', a.spend === 1500);
  assert('net recorded = $4,000', a.income - a.spend === 4000);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
