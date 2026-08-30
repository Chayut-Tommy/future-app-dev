// Pass B — Look Ahead presentation selector (pure). Real imports; the selector
// formats/chooses copy only. Run:
//   ./node_modules/.bin/tsx tests/b-lookahead-presentation.test.ts

import type { AppData, Asset, CreditCard, RecurringItem } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import { computeLookAheadProjectionFromISO } from '../src/lib/calculations/lookAheadProjection';
import { selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';

let failures = 0, total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const isoT = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const income = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'income', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: false, active: true } as RecurringItem);
const bill = (id: string, a: number, due: string): RecurringItem => ({ id, type: 'expense', label: id, amount: a, frequency: 'monthly', nextDueDate: due, isFixed: true, active: true } as RecurringItem);
const sel = (d: AppData, from: string, to: string) => selectLookAheadPresentation(computeLookAheadProjectionFromISO(d, from, to));
const FORBIDDEN = /\bsafe\b|guaranteed|you can afford|advice|recommendation/i;
function noForbidden(p: any): boolean { return !Object.values(p).filter((v) => typeof v === 'string').some((s) => FORBIDDEN.test(s as string)); }

console.log('=== positive, no shortfall ===');
{
  const d = base(); d.assets = [everyday('cba', 1200)]; d.recurringItems = [income('wage', 2500, isoT(2026, 8, 25))];
  const p = sel(d, '2026-08-15', '2026-09-30');
  assert('1a. state positive_no_shortfall', p.state === 'positive_no_shortfall');
  assert('1b. headline names the date; amount is positive; no dated shortfall', /Estimated position by 30 Sep 2026/.test(p.headline) && p.headlineAmount === '$6,200.00' && p.cashFlowLine === 'No dated shortfall detected');
  assert('1c. assumed income surfaced (payday target)', !!p.assumedLine && /scheduled income on 30 Sep 2026|assumed income/i.test(p.assumedLine!));
  assert('1d. subtext + no forbidden words', p.subtext === "Based on what you've recorded and scheduled" && noForbidden(p));
}

console.log('\n=== positive after a temporary shortfall ===');
{
  const d = base(); d.assets = [everyday('cba', 500)]; d.recurringItems = [bill('rent', 1000, isoT(2026, 8, 16)), income('wage', 2000, isoT(2026, 8, 20))];
  const p = sel(d, '2026-08-15', '2026-08-30');
  assert('2a. state positive_after_shortfall', p.state === 'positive_after_shortfall');
  assert('2b. positive headline amount + short-by line as a positive gap', p.headlineAmount === '$1,500.00' && p.cashFlowLine === 'You may be short by about $500.00 on 16 Aug 2026');
  assert('2c. lowest line present', /Lowest estimated cash position: -\$500\.00 on 16 Aug 2026/.test(p.lowestLine!));
}

console.log('\n=== final deficit (never a negative dominant headline) ===');
{
  const d = base(); d.assets = [everyday('cba', 100)]; d.recurringItems = [bill('rent', 700, isoT(2026, 8, 20)), income('wage', 500, isoT(2026, 8, 20))];
  const p = sel(d, '2026-08-15', '2026-08-25');
  assert('3a. state below_zero', p.state === 'below_zero');
  assert('3b. dominant amount is a POSITIVE gap, never "-$..."', !!p.headlineAmount && !p.headlineAmount.startsWith('-') && p.headlineAmount === '$100.00');
  assert('3c. commitments-exceed-cash wording', /Your scheduled commitments may be about \$100\.00 more than your cash by 25 Aug 2026/.test(p.cashFlowLine!));
  assert('3d. no forbidden words', noForbidden(p));
}

console.log('\n=== dip -> recover -> dip below zero at target must stay below_zero ===');
{
  // Falls below zero (16th), returns to >=0 (18th), finishes below zero (target 20th).
  const d = base(); d.assets = [everyday('cba', 500)];
  d.recurringItems = [bill('b1', 1000, isoT(2026, 8, 16)), income('pay', 1500, isoT(2026, 8, 18)), bill('b2', 1200, isoT(2026, 8, 20))];
  const r = computeLookAheadProjectionFromISO(d, '2026-08-15', '2026-08-20');
  if (!r.available) throw new Error('expected available');
  const p = selectLookAheadPresentation(r);
  assert('6a. a temporary recovery followed by a final negative target selects below_zero (never a recovered positive)', p.state === 'below_zero' && r.recovers === true && r.targetCents === -20000);
  assert('6b. the dominant amount is the positive final gap, not a negative hero', p.headlineAmount === '$200.00' && !p.headlineAmount.startsWith('-'));
}

console.log('\n=== unavailable / no eligible balance ===');
{
  const dNoBal = base(); dNoBal.assets = [];
  const pNo = sel(dNoBal, '2026-08-15', '2026-08-31');
  assert('4a. no eligible balance → state no_eligible_balance, issues carried, no headline amount', pNo.state === 'no_eligible_balance' && !!pNo.issues && pNo.headlineAmount === undefined);
  const dBad = base(); dBad.assets = [everyday('cba', 1000)]; dBad.recurringItems = [bill('x', 900, 'bad')];
  const pBad = sel(dBad, '2026-08-15', '2026-08-31');
  assert('4b. blocking data → state unavailable, no dominant number', pBad.state === 'unavailable' && pBad.headlineAmount === undefined && !!pBad.issues && pBad.issues.length > 0);
}

console.log('\n=== savings/goals + protected lines ===');
{
  const d = base();
  d.assets = [everyday('cba', 1200), { id: 's', type: 'savings', label: 'House', currentValue: 6000, includeInMoneyCalculations: false } as Asset];
  d.user = { ...d.user, monthlyIncome: 4000, savingsAllocation: { mode: 'amount', amount: 300 } as any };
  d.recurringItems = [income('wage', 2500, isoT(2026, 8, 25))];
  const p = sel(d, '2026-08-15', '2026-09-30');
  assert('5a. savings/goals line is informational ("not subtracted here")', !!p.savingsLine && /not subtracted here/.test(p.savingsLine!));
  assert('5b. protected savings line present', p.protectedLine === 'Protected savings not included');
  assert('5c. headline amount still $6,200.00 (informational plan did NOT reduce it)', p.headlineAmount === '$6,200.00');
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
