// Pass C.1 — pure timeline-marker adapter (src/lib/calculations/timelineMarkers.ts).
//
// CLASSIFICATION: Real import (Class A). Feeds the real computeSafeToSpend,
// computeProjectedEvents and computeLookAheadProjection outputs into the real
// buildAupRail/buildScenarioRail and asserts the marker model. No mirrored
// math; positions are integer-day offsets over an integer span.
//
// Run with: npx tsx tests/c1-timeline-markers.test.ts

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { buildAupRail, buildScenarioRail } from '../src/lib/calculations/timelineMarkers';
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
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function base(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 5000;
  d.user.payFrequency = 'monthly';
  return d;
}

// --- AUP rail from the video-regression scenario --------------------------
console.log('=== buildAupRail — video-regression (monthly payday, weekly Rent) ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 10);
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 6300, includeInMoneyCalculations: true }] as Asset[];
  data.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 8, 31), isFixed: true, active: true },
  ] as RecurringItem[];

  const sts = computeSafeToSpend(data, day(2026, 8, 30));
  const rail = buildAupRail(sts, localDateFromDate(day(2026, 8, 30)));

  assert('rail is produced', rail !== null);
  if (rail) {
    assert('mode is aup', rail.mode === 'aup');
    // cycle: 11 Aug -> 10 Sep = 30 day span.
    assert('span is 30 days', rail.spanDays === 30);
    const bills = rail.markers.filter((m) => m.kind === 'bill');
    assert('two bill markers', bills.length === 2);
    assert('no income markers in AUP mode', !rail.markers.some((m) => m.kind === 'income'));
    // 31 Aug is 20 days after 11 Aug -> 20/30; 7 Sep is 27 days -> 27/30.
    assert('first bill positioned at 20/30', approx(bills[0].position, 20 / 30));
    assert('second bill positioned at 27/30', approx(bills[1].position, 27 / 30));
    assert('bills are marked included (deducted)', bills.every((m) => m.included));
    const endpoint = rail.markers.find((m) => m.kind === 'payday_endpoint');
    assert('payday endpoint exists at position 1', !!endpoint && endpoint.position === 1);
    assert('payday endpoint is NOT included', !!endpoint && endpoint.included === false);
    assert('spoken sentence mentions payday not included', /not included/.test(rail.spoken));
  }
}

// --- AUP rail suppressed with no known payday -----------------------------
console.log('=== buildAupRail — no known payday -> null ===');
{
  const data = base();
  data.user.nextPayday = undefined as unknown as string;
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 1000, includeInMoneyCalculations: true }] as Asset[];
  const sts = computeSafeToSpend(data, day(2026, 8, 30));
  assert('rail is null without a known payday', buildAupRail(sts, localDateFromDate(day(2026, 8, 30))) === null);
}

// --- Scenario rail: income + bills + shortfall ----------------------------
console.log('=== buildScenarioRail — income, bills, coral shortfall ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 30);
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 500, includeInMoneyCalculations: true }] as Asset[];
  data.recurringItems = [
    // A big bill on 5 Sep drives the balance below zero before income on 20 Sep.
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1200, frequency: 'monthly', nextDueDate: iso(2026, 9, 5), isFixed: true, active: true },
    { id: 'salary', type: 'income', label: 'Salary', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 20), isFixed: true, active: true },
  ] as RecurringItem[];

  const asOf = localDateFromDate(day(2026, 8, 31));
  const target = localDateFromDate(day(2026, 9, 25));
  const result = computeLookAheadProjection(data, asOf, target);
  assert('projection available', result.available === true);
  if (result.available) {
    const { events } = computeProjectedEvents(data, asOf, target, { windowStart: asOf });
    const rail = buildScenarioRail(events, result);
    assert('mode is scenario', rail.mode === 'scenario');
    assert('has a green income marker', rail.markers.some((m) => m.kind === 'income' && m.included));
    assert('has an amber bill marker', rail.markers.some((m) => m.kind === 'bill' && m.included));
    assert('has a coral shortfall marker', rail.markers.some((m) => m.kind === 'shortfall'));
    assert('shortfall marker is NOT included', rail.markers.filter((m) => m.kind === 'shortfall').every((m) => !m.included));
    assert('income signedAmount is positive', rail.markers.filter((m) => m.kind === 'income').every((m) => (m.signedAmount ?? 0) > 0));
    assert('bill signedAmount is negative', rail.markers.filter((m) => m.kind === 'bill').every((m) => (m.signedAmount ?? 0) < 0));
    assert('markers sorted ascending by date', rail.markers.every((m, i) => i === 0 || (rail.markers[i - 1].date.year * 400 + rail.markers[i - 1].date.month * 31 + rail.markers[i - 1].date.day) <= (m.date.year * 400 + m.date.month * 31 + m.date.day)));
  }
}

// --- Scenario rail: same-day same-kind aggregation ------------------------
console.log('=== buildScenarioRail — two bills same day aggregate into one marker ===');
{
  const data = base();
  data.user.nextPayday = iso(2026, 9, 30);
  data.assets = [{ id: 'ev', type: 'everyday', label: 'Everyday', currentValue: 5000, includeInMoneyCalculations: true }] as Asset[];
  data.recurringItems = [
    { id: 'rent', type: 'expense', label: 'Rent', amount: 900, frequency: 'monthly', nextDueDate: iso(2026, 9, 10), isFixed: true, active: true },
    { id: 'power', type: 'expense', label: 'Power', amount: 100, frequency: 'monthly', nextDueDate: iso(2026, 9, 10), isFixed: true, active: true },
  ] as RecurringItem[];

  const asOf = localDateFromDate(day(2026, 8, 31));
  const target = localDateFromDate(day(2026, 9, 20));
  const result = computeLookAheadProjection(data, asOf, target);
  if (result.available) {
    const { events } = computeProjectedEvents(data, asOf, target, { windowStart: asOf });
    const rail = buildScenarioRail(events, result);
    const sep10 = rail.markers.filter((m) => m.kind === 'bill' && m.date.month === 9 && m.date.day === 10);
    assert('the two 10 Sep bills aggregate to a single marker', sep10.length === 1);
    assert('aggregated marker has count 2', sep10[0]?.count === 2);
    assert('aggregated marker sums both amounts (−$1,000)', sep10[0] ? approx(sep10[0].signedAmount ?? 0, -1000) : false);
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
