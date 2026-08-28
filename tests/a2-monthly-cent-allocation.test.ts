// A2 — exact monthly-cent prefix allocation (pure). BigInt intermediates,
// deterministic round-half-up, fail-closed. Run:
//   ./node_modules/.bin/tsx tests/a2-monthly-cent-allocation.test.ts

import { parseLocalDate } from '../src/lib/calculations/localCalendar';
import {
  MonthlyAllocationError,
  allocateInclusiveRangeCents,
  allocateInformationalPlan,
  cumulativeCentsThroughDay,
} from '../src/lib/calculations/monthlyCentAllocation';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const LD = (s: string) => parseLocalDate(s);
const alloc = (c: number, a: string, b: string) => allocateInclusiveRangeCents(c, LD(a), LD(b));
function throwsCode(fn: () => unknown, code: string): boolean {
  try { fn(); return false; } catch (e) { return e instanceof MonthlyAllocationError && e.code === code; }
}
const C = 30000; // $300.00 monthly

console.log('=== prefix fundamentals ===');
assert('0a. prefix through day 0 is 0', cumulativeCentsThroughDay(C, 31, 0) === 0);
assert('0b. prefix through the last day equals the full monthly amount', cumulativeCentsThroughDay(C, 31, 31) === C && cumulativeCentsThroughDay(C, 28, 28) === C && cumulativeCentsThroughDay(C, 29, 29) === C);
assert('0c. prefix is monotonic non-decreasing', (() => { let prev = -1; for (let n = 0; n <= 31; n++) { const v = cumulativeCentsThroughDay(C, 31, n); if (v < prev) return false; prev = v; } return true; })());

console.log('\n=== August 2026 partial month ($300.00, 31 days) ===');
assert('1a. 1–7 Aug inclusive = $67.74 (round-half-up(30000×7/31) = 6774)', alloc(C, '2026-08-01', '2026-08-07') === 6774);
assert('1b. 8–31 Aug inclusive = $232.26 (23226)', alloc(C, '2026-08-08', '2026-08-31') === 23226);
assert('1c. the two adjacent ranges together = exactly $300.00', alloc(C, '2026-08-01', '2026-08-07') + alloc(C, '2026-08-08', '2026-08-31') === C);
assert('1d. the whole month in one range = exactly $300.00', alloc(C, '2026-08-01', '2026-08-31') === C);

console.log('\n=== leap February 2028 ($300.00, 29 days) ===');
assert('2a. full February 2028 = exactly $300.00', alloc(C, '2028-02-01', '2028-02-29') === C);
assert('2b. splitting February recombines to $300.00', alloc(C, '2028-02-01', '2028-02-10') + alloc(C, '2028-02-11', '2028-02-29') === C);
assert('2c. non-leap February 2027 full = exactly $300.00', alloc(C, '2027-02-01', '2027-02-28') === C);

console.log('\n=== full year ($300.00/month) ===');
assert('3a. a normal year (2027) = $3,600.00', alloc(C, '2027-01-01', '2027-12-31') === 360000);
assert('3b. a leap year (2028) = $3,600.00', alloc(C, '2028-01-01', '2028-12-31') === 360000);

console.log('\n=== adjacent subranges telescope EXACTLY across months ===');
assert('4a. Aug25–Sep05 = (Aug25–Aug31) + (Sep01–Sep05)', alloc(C, '2026-08-25', '2026-09-05') === alloc(C, '2026-08-25', '2026-08-31') + alloc(C, '2026-09-01', '2026-09-05'));
assert('4b. a three-way split of Aug telescopes to the whole month', alloc(C, '2026-08-01', '2026-08-10') + alloc(C, '2026-08-11', '2026-08-20') + alloc(C, '2026-08-21', '2026-08-31') === C);
assert('4c. a range crossing a year boundary telescopes', alloc(C, '2026-12-20', '2027-01-10') === alloc(C, '2026-12-20', '2026-12-31') + alloc(C, '2027-01-01', '2027-01-10'));

console.log('\n=== the exact rule is NOT days/30 ===');
// Over 7 days of a 31-day month the exact prefix (6774) differs from the
// naive days/30 proration (30000×7/30 = 7000) — proving no /30 shortcut.
assert('5a. exact 7-day August allocation (6774) ≠ days/30 (7000)', alloc(C, '2026-08-01', '2026-08-07') === 6774 && 6774 !== Math.round((C * 7) / 30));

console.log('\n=== Option B: savings & goals are INFORMATIONAL (independent, additive) ===');
{
  const plan = allocateInformationalPlan(30000, 15000, LD('2026-09-01'), LD('2026-09-30')); // one complete month
  assert('6a. savings full month = $300.00', plan.savingsCents === 30000);
  assert('6b. goals full month = $150.00', plan.goalsCents === 15000);
  assert('6c. informational total = $450.00 (exact sum, nothing subtracted)', plan.informationalTotalCents === 45000 && plan.informationalTotalCents === plan.savingsCents + plan.goalsCents);
  // Independence: computing them separately equals the combined helper.
  assert('6d. savings and goals allocate independently before the total is added', alloc(30000, '2026-09-01', '2026-09-30') === plan.savingsCents && alloc(15000, '2026-09-01', '2026-09-30') === plan.goalsCents);
}

console.log('\n=== numerical safety ===');
assert('7a. zero cents returns zero for any range', alloc(0, '2026-08-01', '2026-08-31') === 0 && cumulativeCentsThroughDay(0, 31, 17) === 0);
assert('7b. one cent over a full month returns exactly one cent', alloc(1, '2026-08-01', '2026-08-31') === 1);
// Exact half-cent ties with real month lengths: 1·14/28 = 0.5 and 1·15/30 = 0.5.
assert('7c. a half-cent tie rounds UP (prefix(1,28,14) = 1)', cumulativeCentsThroughDay(1, 28, 14) === 1);
assert('7d. another half-cent tie rounds UP (prefix(1,30,15) = 1)', cumulativeCentsThroughDay(1, 30, 15) === 1);
assert('7e. a sub-half fraction rounds DOWN (prefix(1,28,13) = 0)', cumulativeCentsThroughDay(1, 28, 13) === 0);
// Very large SAFE monthly value: a full year stays within safe-integer range.
assert('7f. a very large safe monthly amount allocates a full year exactly', alloc(700_000_000_000_000, '2027-01-01', '2027-12-31') === 12 * 700_000_000_000_000);
// Intermediate 2·C·n overflows Number but BigInt keeps it exact.
{
  const bigC = 4_000_000_000_000_000; // 4e15, a safe integer
  const expected = Number((2n * BigInt(bigC) * 15n + 31n) / (2n * 31n));
  assert('7g. an unsafe multiplication intermediate is handled through BigInt', cumulativeCentsThroughDay(bigC, 31, 15) === expected && Number.isSafeInteger(expected));
}
// Unsafe FINAL result fails closed (12·C exceeds the safe-integer range).
assert('7h. an unsafe final result fails closed (typed)', throwsCode(() => alloc(1_000_000_000_000_000, '2027-01-01', '2027-12-31'), 'unsafe_result'));
assert('7i. negative monthly cents rejected (typed)', throwsCode(() => alloc(-1, '2026-08-01', '2026-08-31'), 'invalid_monthly_cents'));
assert('7j. fractional monthly cents rejected (typed)', throwsCode(() => cumulativeCentsThroughDay(100.5, 31, 5), 'invalid_monthly_cents'));
assert('7k. non-finite monthly cents rejected (typed)', throwsCode(() => cumulativeCentsThroughDay(Number.POSITIVE_INFINITY, 31, 5), 'invalid_monthly_cents') && throwsCode(() => cumulativeCentsThroughDay(Number.NaN, 31, 5), 'invalid_monthly_cents'));
assert('7l. an out-of-range daysInMonth fails closed (typed)', throwsCode(() => cumulativeCentsThroughDay(C, 32, 5), 'invalid_days_in_month'));
assert('7m. an out-of-range day index fails closed (typed)', throwsCode(() => cumulativeCentsThroughDay(C, 31, 32), 'invalid_day_index'));

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
