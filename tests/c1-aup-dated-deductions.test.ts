// Pass C.1 — Available Until Payday dated-deduction provenance.
//
// CLASSIFICATION: Real import (Class A). Every assertion below executes the
// actual shipped computeSafeToSpend (src/lib/calculations/safeToSpend.ts) and
// inspects the new read-only `datedDeductions` metadata it returns. Nothing
// is mirrored or re-derived.
//
// What this proves:
//   1. `datedDeductions` reconciles EXACTLY to `cycleBillsExpected` — it is
//      provenance for the same number, never a second calculation.
//   2. It contains only forward-dated commitments AUP actually subtracts
//      (bills, card repayments, BNPL) — never income, never a $0 entry.
//   3. It is date-ordered and carries canonical occurrence identity.
//   4. The founder video-regression scenario (30 Aug 2026, monthly payday
//      10 Sep, weekly Rent $1,000 first due 31 Aug) produces AUP $4,300 with
//      exactly the two Rent occurrences (31 Aug, 7 Sep) as its markers —
//      the ACCEPTED recurrence behaviour, surfaced faithfully.
//
// Run with: npx tsx tests/c1-aup-dated-deductions.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../src/types/models';

process.env.TZ = process.env.TZ || 'Australia/Melbourne';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const localDay = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const cents = (n: number) => Math.round(n * 100);

function base(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 5000;
  d.user.payFrequency = 'monthly';
  return d;
}

// --- 1 + 4: Founder video-regression scenario -----------------------------
console.log('=== Video-regression: monthly payday 10 Sep, weekly Rent $1,000 from 31 Aug ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 10);
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 6300, includeInMoneyCalculations: true }] as Asset[];
  data.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 8, 31), isFixed: true, active: true },
  ] as RecurringItem[];

  const r = computeSafeToSpend(data, localDay(2026, 8, 30));

  assert('cycleBillsExpected is exactly $2,000 (two weekly Rent occurrences)', cents(r.cycleBillsExpected) === cents(2000));
  assert('cycleRemainingPool (AUP) is exactly $4,300 — accepted behaviour', cents(r.cycleRemainingPool) === cents(4300));
  assert('datedDeductions has exactly two entries', r.datedDeductions.length === 2);
  assert('both are Rent bills', r.datedDeductions.every((d) => d.kind === 'bill' && d.label === 'Rent'));
  assert(
    'markers fall on 31 Aug and 7 Sep, date-ordered',
    r.datedDeductions[0]?.date.getTime() === localDay(2026, 8, 31).getTime() &&
      r.datedDeductions[1]?.date.getTime() === localDay(2026, 9, 7).getTime()
  );
  assert('each Rent marker is $1,000', r.datedDeductions.every((d) => cents(d.amount) === cents(1000)));
  assert('markers carry a canonical occurrence id', r.datedDeductions.every((d) => typeof d.occurrenceId === 'string' && d.occurrenceId!.length > 0));
  assert(
    'sum(datedDeductions.amount) reconciles to cycleBillsExpected',
    cents(r.datedDeductions.reduce((s, d) => s + d.amount, 0)) === cents(r.cycleBillsExpected)
  );
  // The 10 Sep incoming payday income must NEVER appear as a deduction.
  assert('no income appears in datedDeductions', !r.datedDeductions.some((d) => (d as { kind: string }).kind === 'income'));
}

// --- 2 + 3: Mixed bill + card + BNPL reconciliation -----------------------
console.log('=== Mixed bills + card + BNPL reconcile to cycleBillsExpected ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 30); // monthly cycle ~31 Aug -> 30 Sep
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 10000, includeInMoneyCalculations: true }] as Asset[];
  data.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 800, frequency: 'monthly', nextDueDate: iso(2026, 9, 5), isFixed: true, active: true },
    { id: 'gym', type: 'expense', label: 'Gym', amount: 60, frequency: 'monthly', nextDueDate: iso(2026, 9, 12), isFixed: true, active: true },
    { id: 'salary', type: 'income', label: 'Salary', amount: 5000, frequency: 'monthly', nextDueDate: iso(2026, 9, 15), isFixed: true, active: true },
    // BNPL-linked expense item + its liability.
    { id: 'bnpl-item', type: 'expense', label: 'Phone plan', amount: 50, frequency: 'weekly', nextDueDate: iso(2026, 9, 3), isFixed: false, active: true, linkedLiabilityId: 'bnpl-liab' },
  ] as RecurringItem[];
  data.liabilities = [{ id: 'bnpl-liab', type: 'bnpl', label: 'Phone plan', currentBalance: 150 }] as Liability[];
  data.creditCards = [
    { id: 'visa', issuer: 'CBA', label: 'Visa', creditLimit: 5000, currentBalance: 400, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 200 } as CreditCard,
  ];

  const r = computeSafeToSpend(data, localDay(2026, 8, 31));

  assert(
    'sum(datedDeductions.amount) reconciles to cycleBillsExpected (mixed)',
    cents(r.datedDeductions.reduce((s, d) => s + d.amount, 0)) === cents(r.cycleBillsExpected)
  );
  assert('every deduction amount is strictly positive', r.datedDeductions.every((d) => d.amount > 0));
  assert(
    'datedDeductions is sorted ascending by date',
    r.datedDeductions.every((d, i) => i === 0 || r.datedDeductions[i - 1].date.getTime() <= d.date.getTime())
  );
  assert('kinds are limited to bill/card/bnpl', r.datedDeductions.every((d) => d.kind === 'bill' || d.kind === 'card' || d.kind === 'bnpl'));
  assert('no income kind present (income is never deducted by AUP)', !r.datedDeductions.some((d) => (d as { kind: string }).kind === 'income'));
  assert('includes the credit-card repayment occurrence', r.datedDeductions.some((d) => d.kind === 'card' && cents(d.amount) === cents(200)));
  assert('includes at least one BNPL occurrence', r.datedDeductions.some((d) => d.kind === 'bnpl'));
}

// --- Empty case: no commitments -> empty list, zero bills -----------------
console.log('=== No commitments -> empty datedDeductions ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 30);
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 2000, includeInMoneyCalculations: true }] as Asset[];
  const r = computeSafeToSpend(data, localDay(2026, 8, 31));
  assert('datedDeductions is empty when nothing is due', r.datedDeductions.length === 0);
  assert('cycleBillsExpected is 0', cents(r.cycleBillsExpected) === 0);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
