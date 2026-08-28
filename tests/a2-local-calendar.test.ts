// A2 — local-calendar utility (pure). Injects the as-of local date; no
// current-time dependency, no elapsed-millisecond arithmetic.
// Run: ./node_modules/.bin/tsx tests/a2-local-calendar.test.ts
// TZ-independence is verified by running this file under TZ=UTC and
// TZ=Australia/Melbourne (see the A2 verification section) — identical results.

import {
  LocalCalendarError,
  addCalendarDays,
  clampAnchorToMonth,
  compareLocalDates,
  daysBetween,
  daysInLocalMonth,
  eachLocalDateInclusive,
  endOfMonth,
  endOfNextMonth,
  isValidLocalDateString,
  localDate,
  localDatesEqual,
  monthsTouched,
  parseLocalDate,
  toISODate,
  tomorrow,
  tryParseLocalDate,
  validateLookAheadTarget,
} from '../src/lib/calculations/localCalendar';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const LD = (s: string) => parseLocalDate(s);
function throwsCode(fn: () => unknown, code: string): boolean {
  try { fn(); return false; } catch (e) { return e instanceof LocalCalendarError && e.code === code; }
}

console.log('=== strict YYYY-MM-DD validation ===');
assert('1a. accepts a real date', isValidLocalDateString('2026-08-03'));
assert('1b. rejects a non-date string', !isValidLocalDateString('2026-8-3') && !isValidLocalDateString('2026/08/03') && !isValidLocalDateString('hello'));
assert('1c. rejects month 13 / month 00', !isValidLocalDateString('2026-13-01') && !isValidLocalDateString('2026-00-10'));
assert('1d. rejects 31 April and 29 Feb in a non-leap year', !isValidLocalDateString('2026-04-31') && !isValidLocalDateString('2027-02-29'));
assert('1e. accepts 29 Feb in a leap year', isValidLocalDateString('2028-02-29'));
assert('1f. parse round-trips through toISODate', toISODate(LD('2026-08-03')) === '2026-08-03');
assert('1g. parse fails closed on bad format (typed)', throwsCode(() => parseLocalDate('2026-8-3'), 'invalid_format'));
assert('1h. localDate fails closed on an impossible day (typed)', throwsCode(() => localDate(2027, 2, 29), 'invalid_calendar_date'));
assert('1i. tryParseLocalDate returns null on invalid', tryParseLocalDate('nope') === null && tryParseLocalDate('2026-02-30') === null);

console.log('\n=== comparison ===');
assert('2a. compare orders dates', compareLocalDates(LD('2026-08-03'), LD('2026-08-04')) === -1 && compareLocalDates(LD('2026-08-04'), LD('2026-08-03')) === 1);
assert('2b. equal detects the same day', localDatesEqual(LD('2026-08-03'), LD('2026-08-03')) && compareLocalDates(LD('2026-08-03'), LD('2026-08-03')) === 0);
assert('2c. year boundary orders correctly', compareLocalDates(LD('2026-12-31'), LD('2027-01-01')) === -1);

console.log('\n=== calendar-day arithmetic (no elapsed-ms) ===');
assert('3a. tomorrow of 31 Jan is 1 Feb', localDatesEqual(tomorrow(LD('2026-01-31')), LD('2026-02-01')));
assert('3b. addCalendarDays crosses a month boundary', localDatesEqual(addCalendarDays(LD('2026-08-31'), 1), LD('2026-09-01')));
assert('3c. addCalendarDays crosses a year boundary', localDatesEqual(addCalendarDays(LD('2026-12-31'), 1), LD('2027-01-01')));
assert('3d. addCalendarDays handles a large span', localDatesEqual(addCalendarDays(LD('2026-08-28'), 90), LD('2026-11-26')));
assert('3e. addCalendarDays subtracts', localDatesEqual(addCalendarDays(LD('2026-03-01'), -1), LD('2026-02-28')));
assert('3f. daysBetween is inclusive-exclusive calendar days', daysBetween(LD('2026-08-01'), LD('2026-08-08')) === 7 && daysBetween(LD('2026-08-08'), LD('2026-08-01')) === -7);
assert('3g. daysBetween across a leap day counts 366 for the year', daysBetween(LD('2028-01-01'), LD('2029-01-01')) === 366);
assert('3h. addCalendarDays fails closed on a non-integer', throwsCode(() => addCalendarDays(LD('2026-08-01'), 1.5), 'invalid_components'));

console.log('\n=== Australian DST transitions are calendar-day stable ===');
// AEDT->AEST ends 5 Apr 2026; AEST->AEDT starts 4 Oct 2026. A local day is a
// calendar day here (never 23/25 hours), so these are ordinary +1 days.
assert('4a. DST end: 4 Apr → 5 Apr is one day', daysBetween(LD('2026-04-04'), LD('2026-04-05')) === 1 && localDatesEqual(tomorrow(LD('2026-04-04')), LD('2026-04-05')));
assert('4b. DST end: crossing 5 Apr both directions is symmetric', localDatesEqual(addCalendarDays(LD('2026-04-05'), -1), LD('2026-04-04')));
assert('4c. DST start: 3 Oct → 4 Oct is one day', daysBetween(LD('2026-10-03'), LD('2026-10-04')) === 1 && localDatesEqual(tomorrow(LD('2026-10-03')), LD('2026-10-04')));
assert('4d. a week spanning DST end is exactly 7 calendar days', daysBetween(LD('2026-04-02'), LD('2026-04-09')) === 7);

console.log('\n=== month length + boundaries ===');
assert('5a. daysInLocalMonth: Feb non-leap = 28, leap = 29', daysInLocalMonth(2027, 2) === 28 && daysInLocalMonth(2028, 2) === 29);
assert('5b. daysInLocalMonth: Apr = 30, Aug = 31', daysInLocalMonth(2026, 4) === 30 && daysInLocalMonth(2026, 8) === 31);
assert('5c. endOfMonth', localDatesEqual(endOfMonth(LD('2026-08-15')), LD('2026-08-31')) && localDatesEqual(endOfMonth(LD('2028-02-10')), LD('2028-02-29')));
assert('5d. endOfNextMonth', localDatesEqual(endOfNextMonth(LD('2026-08-15')), LD('2026-09-30')));
assert('5e. endOfNextMonth across the year boundary (Dec → Jan)', localDatesEqual(endOfNextMonth(LD('2026-12-10')), LD('2027-01-31')));

console.log('\n=== monthly-anchor clamp + restore (delegated to the recurrence owner) ===');
// Anchor 31: Jan 31 → Feb clamps to 28 (2027) / 29 (2028) → Mar restores to 31.
assert('6a. anchor 31 in Jan = 31', localDatesEqual(clampAnchorToMonth(2027, 1, 31), LD('2027-01-31')));
assert('6b. anchor 31 clamps in Feb non-leap (28) and leap (29)', localDatesEqual(clampAnchorToMonth(2027, 2, 31), LD('2027-02-28')) && localDatesEqual(clampAnchorToMonth(2028, 2, 31), LD('2028-02-29')));
assert('6c. anchor 31 RESTORES to 31 in March', localDatesEqual(clampAnchorToMonth(2027, 3, 31), LD('2027-03-31')));
assert('6d. anchor 30 clamps in Feb, holds in April', localDatesEqual(clampAnchorToMonth(2027, 2, 30), LD('2027-02-28')) && localDatesEqual(clampAnchorToMonth(2026, 4, 30), LD('2026-04-30')));
assert('6e. anchor 29 clamps in non-leap Feb, holds in leap Feb', localDatesEqual(clampAnchorToMonth(2027, 2, 29), LD('2027-02-28')) && localDatesEqual(clampAnchorToMonth(2028, 2, 29), LD('2028-02-29')));

console.log('\n=== inclusive ranges ===');
assert('7a. monthsTouched: a single-month range is one entry with the right span', (() => {
  const t = monthsTouched(LD('2026-08-03'), LD('2026-08-20'));
  return t.length === 1 && t[0].firstDay === 3 && t[0].lastDay === 20 && t[0].daysInMonth === 31;
})());
assert('7b. monthsTouched: a two-month range splits correctly', (() => {
  const t = monthsTouched(LD('2026-08-25'), LD('2026-09-05'));
  return t.length === 2 && t[0].firstDay === 25 && t[0].lastDay === 31 && t[1].firstDay === 1 && t[1].lastDay === 5;
})());
assert('7c. eachLocalDateInclusive is inclusive of both ends', (() => {
  const days = eachLocalDateInclusive(LD('2026-08-30'), LD('2026-09-02'));
  return days.length === 4 && toISODate(days[0]) === '2026-08-30' && toISODate(days[3]) === '2026-09-02';
})());
assert('7d. monthsTouched fails closed when start > end', throwsCode(() => monthsTouched(LD('2026-09-01'), LD('2026-08-01')), 'invalid_components'));

console.log('\n=== Look Ahead target rule: tomorrow .. as-of + 90, inclusive ===');
const asOf = LD('2026-08-28');
assert('8a. today (as-of) is rejected — earliest is tomorrow', validateLookAheadTarget(asOf, asOf).ok === false);
assert('8b. tomorrow is accepted (horizon 1)', (() => { const v = validateLookAheadTarget(asOf, LD('2026-08-29')); return v.ok && v.horizonDays === 1; })());
assert('8c. day 90 is accepted (inclusive upper boundary)', (() => { const v = validateLookAheadTarget(asOf, addCalendarDays(asOf, 90)); return v.ok && v.horizonDays === 90; })());
assert('8d. day 91 is rejected (beyond horizon)', (() => { const v = validateLookAheadTarget(asOf, addCalendarDays(asOf, 91)); return v.ok === false && v.reason === 'beyond_horizon'; })());
assert('8e. a past date is rejected (before tomorrow)', (() => { const v = validateLookAheadTarget(asOf, LD('2026-08-27')); return v.ok === false && v.reason === 'before_tomorrow'; })());

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
