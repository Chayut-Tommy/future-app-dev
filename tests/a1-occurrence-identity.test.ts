// A1 — canonical occurrence identity (pure).
// Real-import execution via tsx. Run:
//   ./node_modules/.bin/tsx tests/a1-occurrence-identity.test.ts

import {
  buildOccurrenceId,
  tryBuildOccurrenceId,
  isOccurrenceId,
  occurrenceMonthKey,
  occurrenceDateKey,
  cadenceForFrequency,
  OCCURRENCE_ID_NAMESPACE,
} from '../src/lib/calculations/occurrenceIdentity';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
// Locally-constructed date, exactly as recurringSchedule produces occurrences.
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

console.log('=== identity determinism + namespace ===');
{
  const a = buildOccurrenceId({ sourceKind: 'income', sourceId: 'inc-1', occurrenceDate: D(2026, 8, 14), cadence: 'sub_monthly' });
  const b = buildOccurrenceId({ sourceKind: 'income', sourceId: 'inc-1', occurrenceDate: D(2026, 8, 14), cadence: 'sub_monthly' });
  assert('1a. deterministic — same inputs give the identical id', a === b);
  assert('1b. carries the oid1 namespace/version', a.startsWith('oid1:') && isOccurrenceId(a));
  assert('1c. namespace constant is oid1', OCCURRENCE_ID_NAMESPACE === 'oid1');
}

console.log('\n=== every source kind builds and never collides ===');
{
  // One canonical loan-family kind; the loan subtype is metadata, never identity.
  const kinds = ['income', 'bill', 'card', 'bnpl', 'loan'] as const;
  const ids = kinds.map((k) => buildOccurrenceId({ sourceKind: k, sourceId: 'S', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' }));
  assert('2a. every authoritative source kind builds an id', ids.every((x) => isOccurrenceId(x)));
  assert('2b. distinct source kinds never collide (same source id + cycle)', new Set(ids).size === kinds.length);
  // Different loans (mortgage vs car loan) never collide within the ONE `loan`
  // kind because their stable RecurringItem ids disambiguate them.
  const loanA = buildOccurrenceId({ sourceKind: 'loan', sourceId: 'mortgage-item', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  const loanB = buildOccurrenceId({ sourceKind: 'loan', sourceId: 'car-item', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  assert('2b-loan. two loans under the canonical loan kind never collide (source id disambiguates)', loanA !== loanB && isOccurrenceId(loanA) && isOccurrenceId(loanB));
  const s1 = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'A', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  const s2 = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'B', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  assert('2c. distinct source ids never collide', s1 !== s2);
}

console.log('\n=== monthly cycle key: due-day changes do NOT fork identity ===');
{
  // Card cycle August 2026 — due day 25 then 28 — same billing month → same id.
  const day25 = buildOccurrenceId({ sourceKind: 'card', sourceId: 'card1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const day28 = buildOccurrenceId({ sourceKind: 'card', sourceId: 'card1', occurrenceDate: D(2026, 8, 28), cadence: 'monthly' });
  assert('3a. moving the monthly due day within August keeps ONE cycle id', day25 === day28);
  const sep = buildOccurrenceId({ sourceKind: 'card', sourceId: 'card1', occurrenceDate: D(2026, 9, 25), cadence: 'monthly' });
  assert('3b. September is a separate future cycle', sep !== day25);
  assert('3c. monthly cycle key is YYYY-MM', occurrenceMonthKey(D(2026, 8, 25)) === '2026-08');
}

console.log('\n=== month-end clamping 29/30/31 does not fork a monthly cycle ===');
{
  const d29 = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'rent', occurrenceDate: D(2026, 2, 28), cadence: 'monthly' }); // clamped from 31
  const d2 = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'rent', occurrenceDate: D(2026, 2, 1), cadence: 'monthly' });
  assert('4a. any February date maps to the same Feb cycle regardless of clamped day', d29 === d2);
}

console.log('\n=== December / January cycles differ correctly ===');
{
  const dec = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'x', occurrenceDate: D(2026, 12, 31), cadence: 'monthly' });
  const jan = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'x', occurrenceDate: D(2027, 1, 1), cadence: 'monthly' });
  assert('5a. Dec 2026 and Jan 2027 are distinct cycles', dec !== jan);
  assert('5b. Dec key is 2026-12', occurrenceMonthKey(dec ? D(2026, 12, 31) : D(2026, 12, 31)) === '2026-12');
}

console.log('\n=== sub-monthly identity is stable across DST and is date-anchored ===');
{
  // Melbourne DST ends 5 Apr 2026 (25h day) and starts 4 Oct 2026 (23h day).
  const apr5 = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 4, 5), cadence: 'sub_monthly' });
  assert('6a. a weekly occurrence on the DST-end day keys to its own local date', apr5.endsWith('2026-04-05'));
  const oct4 = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 10, 4), cadence: 'sub_monthly' });
  assert('6b. a weekly occurrence on the DST-start day keys to its own local date', oct4.endsWith('2026-10-04'));
  // Two different weekly occurrences (fortnight apart) are distinct.
  const w1 = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 4, 5), cadence: 'sub_monthly' });
  const w2 = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 4, 19), cadence: 'sub_monthly' });
  assert('6c. distinct sub-monthly occurrence dates are distinct ids', w1 !== w2);
  assert('6d. sub-monthly cycle key is YYYY-MM-DD', occurrenceDateKey(D(2026, 4, 5)) === '2026-04-05');
}

console.log('\n=== label / amount are never part of identity ===');
{
  // The builder takes no label or amount at all — identity cannot depend on them
  // by construction. Same source + cycle → same id irrespective of any external
  // label/amount the caller might hold.
  const a = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'phone', occurrenceDate: D(2026, 8, 3), cadence: 'monthly' });
  const b = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'phone', occurrenceDate: D(2026, 8, 20), cadence: 'monthly' });
  assert('7a. identity ignores which day in the month (a proxy for amount/label edits that also touch the row)', a === b);
}

console.log('\n=== cadence mapping ===');
{
  assert('8a. weekly → sub_monthly', cadenceForFrequency('weekly') === 'sub_monthly');
  assert('8b. fortnightly → sub_monthly', cadenceForFrequency('fortnightly') === 'sub_monthly');
  assert('8c. monthly → monthly', cadenceForFrequency('monthly') === 'monthly');
  assert('8d. irregular → monthly (repeats monthly for projection)', cadenceForFrequency('irregular') === 'monthly');
}

console.log('\n=== invalid input fails closed ===');
{
  assert('9a. unknown source kind → undefined', tryBuildOccurrenceId({ sourceKind: 'wat' as any, sourceId: 'x', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' }) === undefined);
  assert('9b. empty source id → undefined', tryBuildOccurrenceId({ sourceKind: 'bill', sourceId: '', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' }) === undefined);
  assert('9c. source id containing the delimiter → undefined', tryBuildOccurrenceId({ sourceKind: 'bill', sourceId: 'a:b', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' }) === undefined);
  assert('9d. non-finite date → undefined', tryBuildOccurrenceId({ sourceKind: 'bill', sourceId: 'x', occurrenceDate: new Date(NaN), cadence: 'monthly' }) === undefined);
  let threw = false;
  try {
    buildOccurrenceId({ sourceKind: 'wat' as any, sourceId: 'x', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  } catch {
    threw = true;
  }
  assert('9e. strict build throws on invalid input', threw);
  assert('9f. isOccurrenceId rejects a foreign / older-namespace string', !isOccurrenceId('legacy:item:2026-08-25') && !isOccurrenceId('oid2:income:x:2026-08'));
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
