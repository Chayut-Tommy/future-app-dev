// Pass C.2 — the guarded "About per day" daily guide (Specification v1.3
// §7.11–§7.12, §8.4, §12.1). CLASSIFICATION: Real import (Class A): the real
// computeDailyGuide / computeLookAheadProjection / computeProjectedEvents /
// paydayBoundaryAfter / computeSafeToSpend — no mirrored maths.
//
// Every "available" case is ALSO checked against an independent brute-force
// oracle: simulate the guarded path day by day, subtracting q on each
// allocation date, and confirm the engine's exact guide is feasible while
// exact + 1 cent is NOT. That proves the prefix bound is the true maximum —
// and the naive target ÷ days is rejected wherever a commitment falls after
// the target before the guard payday.
//
// Run with: npx tsx tests/c2-daily-guide.test.ts   (under TZ=UTC and
// TZ=Australia/Melbourne — identical results are asserted by the sweep).

import { createEmptyAppData } from '../src/lib/storage';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { paydayBoundaryAfter } from '../src/lib/calculations/paydayBoundary';
import { selectDailyGuidePresentation } from '../src/lib/calculations/lookAheadPresentation';
import { LocalDate, compareLocalDates, eachLocalDateInclusive, localDate, localDatesEqual, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const L = (y: number, m: number, d: number): LocalDate => localDate(y, m, d);
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number, include = true): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: include } as Asset);
const savings = (id: string, v: number, include: boolean): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: include } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'] = 'monthly', active = true): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active } as RecurringItem);

/** Specification v1.3 §8.4 Example B: today 4 Sep; target 6 Sep; opening
 * $6,000; rent $1,000 on 7 Sep; gym $150 on the 10 Sep guard payday; monthly
 * pay $5,000 on 10 Sep (excluded from the guard path). */
function exampleB(): AppData {
  const d = base();
  d.user = { ...d.user, monthlyIncome: 5000, payFrequency: 'monthly', nextPayday: iso(2026, 9, 10), mainPaydayIncomeId: 'pay' } as typeof d.user;
  d.assets = [everyday('main', 6000)];
  d.recurringItems = [item('rent', 'expense', 1000, iso(2026, 9, 7)), item('gym', 'expense', 150, iso(2026, 9, 10)), item('pay', 'income', 5000, iso(2026, 9, 10))];
  return d;
}
const ASOF = L(2026, 9, 4);
const T = L(2026, 9, 6);

/** Independent oracle: is spending q cents on each allocation date (asOf ..
 * target − 1) feasible — every end-of-day position through G stays ≥ 0 —
 * using the canonical events with income after the target excluded? */
function feasible(data: AppData, asOf: LocalDate, target: LocalDate, G: LocalDate, q: number): boolean {
  const r = computeLookAheadProjection(data, asOf, target);
  if (!r.available) throw new Error('oracle needs an available projection');
  const events = computeProjectedEvents(data, asOf, G, { windowStart: asOf }).events;
  let running = r.breakdown.openingCents;
  for (const day of eachLocalDateInclusive(asOf, G)) {
    for (const e of events) {
      if (!localDatesEqual(e.date, day)) continue;
      if (e.signedCents > 0 && compareLocalDates(e.date, target) > 0) continue; // no income after T
      running += e.signedCents;
    }
    if (compareLocalDates(day, target) < 0) running -= q; // allocation dates asOf .. T−1
    if (running < 0) return false;
  }
  return true;
}
function oracleCheck(label: string, data: AppData, asOf: LocalDate, target: LocalDate) {
  const g = computeDailyGuide(data, asOf, target);
  if (g.status !== 'available' && g.status !== 'zero') { assert(`${label}: oracle expects available/zero, got ${g.status}`, false); return g; }
  const G = g.guardPayday!;
  const exact = g.exactCents!;
  assert(`${label}: exact guide ${exact} is feasible on the guarded path`, feasible(data, asOf, target, G, exact));
  assert(`${label}: exact guide + 1 cent is NOT feasible (true maximum)`, !feasible(data, asOf, target, G, exact + 1));
  assert(`${label}: display never exceeds exact and is a whole dollar`, g.displayCents! <= exact && g.displayCents! % 100 === 0 && exact - g.displayCents! < 100);
  return g;
}

console.log('=== 1. Example B reconciles exactly ($6,000 / $2,425 / $1,150) ===');
{
  const g = computeDailyGuide(exampleB(), ASOF, T);
  assert('status available', g.status === 'available');
  assert('estimated balance by 6 Sep = $6,000.00 (before everyday spending)', g.targetCents === 600000);
  assert('N = 2 allocation dates (4 and 5 Sep)', g.allocationDays === 2);
  assert('guard payday G = 10 Sep (the recorded next payday)', !!g.guardPayday && toISODate(g.guardPayday) === '2026-09-10' && g.guardPaydaySource === 'next_payday');
  assert('exact guide = $2,425.00 = ($6,000 − $1,000 − $150) ÷ 2', g.exactCents === 242500);
  assert('display guide = $2,425 (whole dollars, rounded down)', g.displayCents === 242500);
  assert('obligations kept for after the target through G = $1,150', g.obligationsAfterTargetCents === 115000);
  assert('payday income at G ($5,000) excluded from the guard path', g.incomeExcludedAfterTargetCents === 500000);
  assert('limiting day is the guard payday (10 Sep)', !!g.limitingDate && toISODate(g.limitingDate) === '2026-09-10');
  assert('same-date events batched end-of-day', g.batchedEndOfDay === true);
  oracleCheck('Example B', exampleB(), ASOF, T);
}

console.log('\n=== 2. The naive estimate ÷ days ($3,000) is rejected ===');
{
  const g = computeDailyGuide(exampleB(), ASOF, T);
  const naive = Math.floor(g.targetCents! / g.allocationDays);
  assert('naive $6,000 ÷ 2 = $3,000 is NOT the guide', naive === 300000 && g.exactCents !== naive);
  assert('the guide is strictly below the naive figure', g.exactCents! < naive);
  assert('spending the naive $3,000/day would break the guard path', !feasible(exampleB(), ASOF, T, g.guardPayday!, naive));
}

console.log('\n=== 3. Target tomorrow: exactly one allocation date ===');
{
  const g = oracleCheck('tomorrow', exampleB(), ASOF, L(2026, 9, 5));
  assert('N = 1', g.allocationDays === 1);
  assert('guide = whole guarded capacity $4,850 (one day)', g.exactCents === 485000);
}

console.log('\n=== 4. Target before the next payday (9 Sep) ===');
{
  const g = oracleCheck('before payday', exampleB(), ASOF, L(2026, 9, 9));
  assert('N = 5; G stays 10 Sep', g.allocationDays === 5 && toISODate(g.guardPayday!) === '2026-09-10');
  assert('guide = $970 (limited on the guard payday: $4,850 ÷ 5)', g.exactCents === 97000);
}

console.log('\n=== 5. Target ON the payday (10 Sep): income on T included, G = the FOLLOWING cycle ===');
{
  const g = oracleCheck('on payday', exampleB(), ASOF, L(2026, 9, 10));
  assert('estimate includes the 10 Sep pay: $9,850', g.targetCents === 985000);
  assert('G is strictly after T: 10 Oct (projected cycle)', toISODate(g.guardPayday!) === '2026-10-10' && g.guardPaydaySource === 'projected_cycle');
  assert('guide limited before payday on 9 Sep: $5,000 ÷ 6 → $833.33 exact, $833 display', g.exactCents === 83333 && g.displayCents === 83300 && toISODate(g.limitingDate!) === '2026-09-09');
}

console.log('\n=== 6. Target after one payday (15 Sep) ===');
{
  const g = oracleCheck('after payday', exampleB(), ASOF, L(2026, 9, 15));
  assert('N = 11; G = 10 Oct', g.allocationDays === 11 && toISODate(g.guardPayday!) === '2026-10-10');
  assert('October rent and gym (after T, before G) still bind the guide: $790.90 exact', g.exactCents === 79090 && g.displayCents === 79000);
}

console.log('\n=== 7. Several weekly incomes before the target ===');
{
  const d = base();
  d.user = { ...d.user, monthlyIncome: 4333, payFrequency: 'weekly', nextPayday: iso(2026, 9, 5) } as typeof d.user;
  d.assets = [everyday('main', 500)];
  d.recurringItems = [item('pay', 'income', 1000, iso(2026, 9, 5), 'weekly'), item('bill', 'expense', 300, iso(2026, 9, 8))];
  const g = oracleCheck('weekly incomes', d, ASOF, L(2026, 9, 20));
  assert('three paydays (5, 12, 19 Sep) included; G = 26 Sep', g.targetCents === 320000 && toISODate(g.guardPayday!) === '2026-09-26');
  assert('26 Sep pay excluded from the guard path', g.incomeExcludedAfterTargetCents === 100000);
  assert('guide limited on 18 Sep: $2,200 ÷ 15 → $146.66 exact, $146 display', g.exactCents === 14666 && g.displayCents === 14600 && toISODate(g.limitingDate!) === '2026-09-18');
}

console.log('\n=== 8. End of this month target (30 Sep) ===');
{
  const g = oracleCheck('end of month', exampleB(), ASOF, L(2026, 9, 30));
  assert('N = 26; G = 10 Oct', g.allocationDays === 26 && toISODate(g.guardPayday!) === '2026-10-10');
}

console.log('\n=== 9. Multiple incomes on the path (primary + fortnightly side income) ===');
{
  const d = exampleB();
  d.recurringItems.push(item('side', 'income', 200, iso(2026, 9, 6), 'fortnightly'));
  const g = oracleCheck('multiple incomes', d, ASOF, L(2026, 9, 20));
  assert('side income on 6 Sep and 20 Sep (≤ T) is in the estimate', g.targetCents === 985000 + 40000);
  assert('guard payday remains the primary cycle: 10 Oct', toISODate(g.guardPayday!) === '2026-10-10');
}

console.log('\n=== 10. A small secondary / ad-hoc income never replaces the guard payday ===');
{
  const d = exampleB();
  d.recurringItems.push(item('side', 'income', 50, iso(2026, 9, 8)));
  const g = computeDailyGuide(d, ASOF, T);
  assert('G is still the primary payday 10 Sep, not the $50 income on 8 Sep', toISODate(g.guardPayday!) === '2026-09-10');
  assert('the $50 after T is excluded and the guide is unchanged ($2,425)', g.exactCents === 242500 && g.incomeExcludedAfterTargetCents === 505000);
  const p = paydayBoundaryAfter(d.user, T);
  assert('paydayBoundaryAfter reads only the primary cycle (never an income item)', p.kind === 'known' && toISODate(p.date) === '2026-09-10');
}

console.log('\n=== 11. Obligations after T through G reduce the guide ===');
{
  const withGym = computeDailyGuide(exampleB(), ASOF, T).exactCents!;
  const d = exampleB(); d.recurringItems = d.recurringItems.filter((r) => r.id !== 'gym');
  const withoutGym = computeDailyGuide(d, ASOF, T).exactCents!;
  assert('removing the $150 gym on the guard payday raises the guide by exactly $75/day', withoutGym === 250000 && withGym === 242500);
}

console.log('\n=== 12. Payday income at G is excluded ===');
{
  const g = computeDailyGuide(exampleB(), ASOF, T);
  // If the 10 Sep pay were counted, the 10 Sep bound would be $9,850 ÷ 2 and
  // the binding day would move to 7 Sep at $2,500 — the guide would overstate.
  assert('guide ($2,425) is below the $2,500 it would be if G-day pay were counted', g.exactCents === 242500 && g.exactCents < 250000);
}

console.log('\n=== 13. Income after T does not enlarge the guide ===');
{
  const d = exampleB();
  d.recurringItems.push(item('bonus', 'income', 10000, iso(2026, 9, 8)));
  const g = computeDailyGuide(d, ASOF, T);
  assert('a $10,000 income on 8 Sep (after T) leaves the guide at $2,425', g.exactCents === 242500 && g.incomeExcludedAfterTargetCents === 1500000);
}

console.log('\n=== 14. Same-day income and bill batch at end of day ===');
{
  const d = base();
  d.user = { ...d.user, monthlyIncome: 500, payFrequency: 'monthly', nextPayday: iso(2026, 9, 20) } as typeof d.user;
  d.assets = [everyday('main', 100)];
  d.recurringItems = [item('in', 'income', 500, iso(2026, 9, 5)), item('out', 'expense', 700, iso(2026, 9, 5))];
  const g = computeDailyGuide(d, ASOF, T);
  assert('one end-of-day net (−$100 on 5 Sep) → existing shortfall of $100 on 5 Sep; no intraday claim', g.status === 'existing_shortfall' && !!g.shortfall && toISODate(g.shortfall.date) === '2026-09-05' && g.shortfall.cents === 10000);
  assert('no guide amount is produced', g.exactCents === null && g.displayCents === null);
}

console.log('\n=== 15. An existing shortfall makes the guide unavailable and is prioritised ===');
{
  const d = exampleB();
  d.recurringItems = d.recurringItems.map((r) => (r.id === 'rent' ? { ...r, amount: 7000 } : r));
  const g = computeDailyGuide(d, ASOF, T);
  assert('rent $7,000 on 7 Sep (after T, before G) → existing_shortfall on 7 Sep of $1,000', g.status === 'existing_shortfall' && toISODate(g.shortfall!.date) === '2026-09-07' && g.shortfall!.cents === 100000);
  assert('the estimate itself is still $6,000 (shortfall is after T)', g.targetCents === 600000);
  assert('reason explains it is between the selected date and the next payday', /between your selected date and your next payday/.test(g.reason));
  const p = selectDailyGuidePresentation(g);
  assert('presentation shows — and prioritises the shortfall', p.value === '—' && /shortfall/i.test(p.caption));
}

console.log('\n=== 16. Zero guarded capacity returns $0 ===');
{
  const d = exampleB();
  d.assets = [everyday('main', 1150)];
  const g = computeDailyGuide(d, ASOF, T);
  assert('opening exactly covers rent + gym → status zero, exact $0', g.status === 'zero' && g.exactCents === 0 && g.displayCents === 0);
  const p = selectDailyGuidePresentation(g);
  assert('presentation: "$0" + "No additional daily room found"', p.value === '$0' && p.caption === 'No additional daily room found');
  oracleCheck('zero capacity', d, ASOF, T);
}

console.log('\n=== 17. Missing guard payday ===');
{
  const d = exampleB(); d.user = { ...d.user, nextPayday: null } as typeof d.user;
  const g = computeDailyGuide(d, ASOF, T);
  assert('no next payday → missing_guard_payday (no_payday); the estimate is still available', g.status === 'missing_guard_payday' && g.missingGuardPaydayReason === 'no_payday' && g.targetCents === 600000);
  const d2 = exampleB(); d2.user = { ...d2.user, payFrequency: 'irregular', nextPayday: iso(2026, 9, 5) } as typeof d2.user;
  const g2 = computeDailyGuide(d2, ASOF, T);
  assert('irregular income with next payday on/before T → missing_guard_payday (irregular_beyond_next)', g2.status === 'missing_guard_payday' && g2.missingGuardPaydayReason === 'irregular_beyond_next');
  const d3 = exampleB(); d3.user = { ...d3.user, payFrequency: 'irregular' } as typeof d3.user; // next payday 10 Sep > T
  const g3 = computeDailyGuide(d3, ASOF, T);
  assert('irregular income with the recorded next payday strictly after T → still guarded by that payday', g3.status === 'available' && toISODate(g3.guardPayday!) === '2026-09-10' && g3.exactCents === 242500);
  const p = selectDailyGuidePresentation(g);
  assert('presentation: "Daily guide unavailable" with a plain reason', p.value === '—' && p.caption === 'Daily guide unavailable' && /next payday/.test(p.explanation));
}

console.log('\n=== 18. Invalid material inputs fail closed and identify the source ===');
{
  const d = exampleB();
  d.recurringItems.push(item('broken', 'expense', Number.NaN, iso(2026, 9, 8)));
  const g = computeDailyGuide(d, ASOF, T);
  assert('NaN commitment amount → not available; never silently $0', (g.status === 'invalid_material_input' || g.status === 'unavailable') && g.exactCents === null && g.displayCents === null);
  assert('the failing source is identified', !!g.issues && g.issues.some((i) => i.sourceId === 'broken'));
  const d2 = exampleB();
  d2.recurringItems.push(item('undated', 'expense', 40, 'not-a-date'));
  const g2 = computeDailyGuide(d2, ASOF, T);
  assert('invalid commitment date → fails closed with the source identified', g2.exactCents === null && !!g2.issues && g2.issues.some((i) => i.sourceId === 'undated'));
}

console.log('\n=== 19. Exact cents retained; whole-dollar display rounds DOWN ===');
{
  const d = exampleB(); d.assets = [everyday('main', 6001)];
  const g = computeDailyGuide(d, ASOF, T);
  assert('$6,001 opening → exact $2,425.50, display $2,425', g.exactCents === 242550 && g.displayCents === 242500);
  const d2 = exampleB(); d2.assets = [everyday('main', 6000.99)];
  const g2 = computeDailyGuide(d2, ASOF, T);
  assert('$6,000.99 opening → exact $2,425.49 (floor of 242549.5), display $2,425', g2.exactCents === 242549 && g2.displayCents === 242500);
  assert('presentation value is the rounded-down whole dollar', selectDailyGuidePresentation(g).value === '$2,425');
  oracleCheck('odd cents', d2, ASOF, T);
}

console.log('\n=== 20. Month-end, leap-day, DST and Australian boundaries ===');
{
  const d = exampleB();
  d.user = { ...d.user, nextPayday: iso(2028, 3, 15) } as typeof d.user;
  d.recurringItems = [item('rent', 'expense', 1000, iso(2028, 3, 10))];
  const g = oracleCheck('leap day', d, L(2028, 2, 28), L(2028, 3, 1));
  assert('28 Feb 2028 → 1 Mar 2028 counts 2 local days (29 Feb exists)', g.allocationDays === 2);
  const d2 = exampleB();
  d2.user = { ...d2.user, nextPayday: iso(2026, 4, 10) } as typeof d2.user;
  d2.recurringItems = [item('rent', 'expense', 1000, iso(2026, 4, 8))];
  const g2 = oracleCheck('AEDT→AEST (5 Apr 2026)', d2, L(2026, 4, 4), L(2026, 4, 6));
  assert('across the 5 Apr 2026 DST transition: N = 2, G = 10 Apr, guide = ($6,000 − $1,000) ÷ 2 = $2,500', g2.allocationDays === 2 && toISODate(g2.guardPayday!) === '2026-04-10' && g2.exactCents === 250000);
  const d3 = exampleB();
  d3.user = { ...d3.user, nextPayday: iso(2026, 10, 31) } as typeof d3.user;
  d3.recurringItems = [item('rent', 'expense', 1000, iso(2026, 10, 31))];
  const g3 = oracleCheck('month end', d3, L(2026, 10, 29), L(2026, 10, 30));
  assert('31 Oct payday with rent on the same day: G = 31 Oct, rent deducted, pay excluded → $5,000', g3.exactCents === 500000);
}

console.log('\n=== 21. Multiple included accounts sum once ===');
{
  const d = exampleB(); d.assets = [everyday('a', 3000), everyday('b', 3000)];
  assert('two $3,000 accounts behave exactly like one $6,000 account', computeDailyGuide(d, ASOF, T).exactCents === 242500);
}

console.log('\n=== 22. Excluded savings stay out; including them recalculates ===');
{
  const d = exampleB(); d.assets = [everyday('main', 6000), savings('house', 3500, false)];
  assert('$3,500 excluded savings does not change the guide', computeDailyGuide(d, ASOF, T).exactCents === 242500);
  const d2 = exampleB(); d2.assets = [everyday('main', 6000), savings('house', 3500, true)];
  const g2 = computeDailyGuide(d2, ASOF, T);
  assert('including the $3,500 savings → estimate $9,500 and guide ($9,500 − $1,150) ÷ 2 = $4,175', g2.targetCents === 950000 && g2.exactCents === 417500);
}

console.log('\n=== 23. Savings and goals remain informational ===');
{
  const d = exampleB(); d.user = { ...d.user, savingsAllocation: { mode: 'amount', amount: 386.3 } as any } as typeof d.user;
  const g = computeDailyGuide(d, ASOF, T);
  assert('a $386.30 monthly savings allocation never reduces the guide', g.exactCents === 242500 && g.targetCents === 600000);
}

console.log('\n=== 24. Recorded versus projected: integrity reconciliation + inactive commitments ===');
{
  const g = computeDailyGuide(exampleB(), ASOF, T);
  const r = computeLookAheadProjection(exampleB(), ASOF, T);
  assert('the guide is paired with exactly the Pass B target (integrity gate passed)', r.available && g.targetCents === r.targetCents);
  const d = exampleB(); d.recurringItems = d.recurringItems.map((x) => (x.id === 'rent' ? { ...x, active: false } : x));
  assert('an inactive commitment is not projected on the guard path', computeDailyGuide(d, ASOF, T).exactCents === 292500);
}

console.log('\n=== 25. Internal transfers are neutral ===');
{
  const d = exampleB(); d.assets = [everyday('a', 4000), everyday('b', 2000)];
  const before = computeDailyGuide(d, ASOF, T).exactCents;
  d.assets = [everyday('a', 3000), everyday('b', 3000)]; // $1,000 moved between two included accounts
  assert('moving money between included accounts leaves the guide unchanged', before === 242500 && computeDailyGuide(d, ASOF, T).exactCents === 242500);
}

console.log('\n=== 26. Accepted AUP outputs are unchanged; inputs are never mutated ===');
{
  const d = exampleB();
  const snapshot = JSON.stringify(d);
  const aupBefore = computeSafeToSpend(d, new Date(2026, 8, 4));
  computeDailyGuide(d, ASOF, T);
  computeDailyGuide(d, ASOF, L(2026, 9, 30));
  const aupAfter = computeSafeToSpend(d, new Date(2026, 8, 4));
  assert('AppData is not mutated by the guide', JSON.stringify(d) === snapshot);
  assert('AUP result is identical before and after', JSON.stringify(aupBefore) === JSON.stringify(aupAfter));
  assert('AUP still answers until payday: $6,000 − $1,000 rent − $150 gym = $4,850, 6 days', aupBefore.cycleRemainingPool === 4850 && aupBefore.daysRemaining === 6);
  const p = paydayBoundaryAfter(d.user, ASOF);
  assert('the shared boundary helper agrees with AUP’s own cycle end for the current cycle', p.kind === 'known' && toISODate(p.date) === '2026-09-10' && aupBefore.cycleEnd.getDate() === 10);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
