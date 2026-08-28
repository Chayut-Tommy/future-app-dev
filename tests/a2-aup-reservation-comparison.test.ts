// A2 — AUP reservation: current rule vs the proposed exact prefix rule (pure).
//
// ANALYSIS ONLY. This does not change AUP. It computes, per fixture, the cents
// the CURRENT AUP reservation basis would reserve (the /30 cycle-fraction the
// production code uses: cycleSavingsReserved = monthly × cycleLengthDays/30)
// versus the PROPOSED exact prefix allocation, and the exact delta — the input
// to the founder's separately-reviewed AUP sub-gate decision. It also PROVES
// the production AUP path does not import or call the new allocator.
//
// Run: ./node_modules/.bin/tsx tests/a2-aup-reservation-comparison.test.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLocalDate, daysBetween } from '../src/lib/calculations/localCalendar';
import { allocateInclusiveRangeCents } from '../src/lib/calculations/monthlyCentAllocation';
import { cycleLengthDays } from '../src/lib/calculations/safeToSpend';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const LD = (s: string) => parseLocalDate(s);

/** The CURRENT AUP reservation basis for `monthlyCents` over `n` days: the /30
 * cycle-fraction the production code applies (cycleLengthDays/30), extended to
 * an arbitrary day count with the same daily basis, in exact cents
 * (round-half-up). This mirrors safeToSpend's cycleFraction = cycleDays/30. */
function currentAupReservationCents(monthlyCents: number, n: number): number {
  return Number((2n * BigInt(monthlyCents) * BigInt(n) + 30n) / 60n); // round-half-up(C·n/30)
}

interface Fixture { key: string; savingsMonthly: number; goalsMonthly: number; start: string; end: string; }
const SAV = 30000; // $300.00
const GOAL = 15000; // $150.00
const fixtures: Fixture[] = [
  { key: '1 day (1 Aug)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-08-01', end: '2026-08-01' },
  { key: '7 days (1–7 Aug)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-08-01', end: '2026-08-07' },
  { key: '14 days (1–14 Aug)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-08-01', end: '2026-08-14' },
  { key: '28 days (full non-leap Feb 2027)', savingsMonthly: SAV, goalsMonthly: 0, start: '2027-02-01', end: '2027-02-28' },
  { key: '30 days (full Sep 2026)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-09-01', end: '2026-09-30' },
  { key: '31 days (full Aug 2026)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-08-01', end: '2026-08-31' },
  { key: 'cross two months (25 Aug–5 Sep)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-08-25', end: '2026-09-05' },
  { key: 'leap Feb (full Feb 2028)', savingsMonthly: SAV, goalsMonthly: 0, start: '2028-02-01', end: '2028-02-29' },
  { key: 'non-leap Feb (full Feb 2027)', savingsMonthly: SAV, goalsMonthly: 0, start: '2027-02-01', end: '2027-02-28' },
  { key: 'DST start (full Oct 2026, incl 4 Oct)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-10-01', end: '2026-10-31' },
  { key: 'DST end (full Apr 2026, incl 5 Apr)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-04-01', end: '2026-04-30' },
  { key: 'savings-only (full Sep)', savingsMonthly: SAV, goalsMonthly: 0, start: '2026-09-01', end: '2026-09-30' },
  { key: 'goals-only (full Sep)', savingsMonthly: 0, goalsMonthly: GOAL, start: '2026-09-01', end: '2026-09-30' },
  { key: 'combined savings+goals (full Sep)', savingsMonthly: SAV, goalsMonthly: GOAL, start: '2026-09-01', end: '2026-09-30' },
];

console.log('=== AUP reservation: current (/30 basis) vs proposed (exact prefix) ===');
console.log('fixture | days | monthly¢ | current¢ | proposed¢ | delta¢ | AUP impact');
const rows: { key: string; current: number; proposed: number; delta: number }[] = [];
for (const f of fixtures) {
  const n = daysBetween(LD(f.start), LD(f.end)) + 1; // inclusive day count
  const monthly = f.savingsMonthly + f.goalsMonthly;
  const current = currentAupReservationCents(f.savingsMonthly, n) + currentAupReservationCents(f.goalsMonthly, n);
  const proposed = allocateInclusiveRangeCents(f.savingsMonthly, LD(f.start), LD(f.end)) + allocateInclusiveRangeCents(f.goalsMonthly, LD(f.start), LD(f.end));
  const delta = proposed - current;
  // A reservation is SUBTRACTED from available money: reserving MORE lowers AUP.
  const impact = delta === 0 ? 'identical' : delta > 0 ? 'reserves MORE → AUP lower' : 'reserves LESS → AUP higher';
  console.log(`${f.key} | ${n} | ${monthly} | ${current} | ${proposed} | ${delta} | ${impact}`);
  rows.push({ key: f.key, current, proposed, delta });
}
const row = (k: string) => rows.find((r) => r.key === k)!;

console.log('\n=== key deltas asserted ===');
assert('A. 7-day current ties to the REAL weekly cycle fraction (cycleLengthDays/30)', currentAupReservationCents(SAV, 7) === Number((2n * BigInt(SAV) * BigInt(cycleLengthDays('weekly')) + 30n) / 60n));
assert('B. 14-day current ties to the REAL fortnightly cycle fraction', currentAupReservationCents(SAV, 14) === Number((2n * BigInt(SAV) * BigInt(cycleLengthDays('fortnightly')) + 30n) / 60n));
assert('C. a full 30-day month is IDENTICAL under both rules (delta 0)', row('30 days (full Sep 2026)').delta === 0 && row('30 days (full Sep 2026)').proposed === 30000);
assert('D. a full 31-day month: proposed reserves LESS ($300 vs $310) → AUP higher', row('31 days (full Aug 2026)').current === 31000 && row('31 days (full Aug 2026)').proposed === 30000 && row('31 days (full Aug 2026)').delta === -1000);
assert('E. non-leap Feb (28d): proposed reserves MORE ($300 vs $280) → AUP lower', row('non-leap Feb (full Feb 2027)').current === 28000 && row('non-leap Feb (full Feb 2027)').proposed === 30000 && row('non-leap Feb (full Feb 2027)').delta === 2000);
assert('F. leap Feb (29d): proposed reserves MORE ($300 vs $290)', row('leap Feb (full Feb 2028)').current === 29000 && row('leap Feb (full Feb 2028)').proposed === 30000 && row('leap Feb (full Feb 2028)').delta === 1000);
assert('G. proposed always allocates exactly the monthly amount for a full month', row('DST start (full Oct 2026, incl 4 Oct)').proposed === 30000 && row('DST end (full Apr 2026, incl 5 Apr)').proposed === 30000);
assert('H. combined savings+goals full month: proposed = $450 informational, delta 0 vs current', row('combined savings+goals (full Sep)').proposed === 45000 && row('combined savings+goals (full Sep)').delta === 0);
assert('I. savings-only and goals-only allocate independently (sum equals combined)', row('savings-only (full Sep)').proposed + row('goals-only (full Sep)').proposed === row('combined savings+goals (full Sep)').proposed);

console.log('\n=== proof: AUP production does NOT adopt the new allocator (A2 sub-gate) ===');
const safeToSpendSrc = readFileSync(join(__dirname, '../src/lib/calculations/safeToSpend.ts'), 'utf8');
assert('J. safeToSpend.ts does NOT import the monthly-cent allocator', !/monthlyCentAllocation/.test(safeToSpendSrc));
assert('K. safeToSpend.ts does NOT import the A2 local-calendar owner', !/['"]\.\/localCalendar['"]/.test(safeToSpendSrc));
assert('L. safeToSpend.ts does NOT call allocateInclusiveRangeCents', !/allocateInclusiveRangeCents/.test(safeToSpendSrc));
assert('M. safeToSpend.ts still uses its own cycleFraction (= cycleDays / 30) — production rule unchanged', /cycleFraction = cycleDays \/ 30/.test(safeToSpendSrc));

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
