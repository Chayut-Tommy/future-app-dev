// Pass B — Look Ahead projection engine (pure, executable, real imports).
// Independently-stated integer-cent expectations. Run:
//   ./node_modules/.bin/tsx tests/b-lookahead-projection.test.ts

import type { AppData, Asset, CreditCard, Liability, LiabilityType, RecurringItem, Transaction } from '../src/types/models';
import { createEmptyAppData } from '../src/lib/storage';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';
import { computeProjectedEventsFromISO } from '../src/lib/calculations/projectedEvents';
import { computeLookAheadProjection, computeLookAheadProjectionFromISO, LookAheadAvailable } from '../src/lib/calculations/lookAheadProjection';
import { parseLocalDate } from '../src/lib/calculations/localCalendar';

let failures = 0, total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const isoT = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, value: number): Asset => ({ id, type: 'everyday', label: id, currentValue: value, includeInMoneyCalculations: true } as Asset);
const income = (id: string, amt: number, due: string, extra: Partial<RecurringItem> = {}): RecurringItem => ({ id, type: 'income', label: id, amount: amt, frequency: 'monthly', nextDueDate: due, isFixed: false, active: true, ...extra } as RecurringItem);
const bill = (id: string, amt: number, due: string, extra: Partial<RecurringItem> = {}): RecurringItem => ({ id, type: 'expense', label: id, amount: amt, frequency: 'monthly', nextDueDate: due, isFixed: true, active: true, ...extra } as RecurringItem);
const cardOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'card', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const incomeOid = (s: string, y: number, m: number) => buildOccurrenceId({ sourceKind: 'income', sourceId: s, occurrenceDate: new Date(y, m - 1, 1), cadence: 'monthly' });
const link = (id: string) => ({ occurrenceResolution: { version: 1 as const, state: 'linked' as const, occurrenceId: id as any } });
const A = (r: any): LookAheadAvailable => { if (!r.available) throw new Error('expected available'); return r; };
const run = (d: AppData, from: string, to: string) => computeLookAheadProjectionFromISO(d, from, to);

console.log('=== 19.1 approved multi-payday (headline must be $4,050.00, never $3,450.00) ===');
{
  const d = base();
  d.assets = [everyday('cba', 1200), { id: 'save', type: 'savings', label: 'House deposit', currentValue: 6000, includeInMoneyCalculations: false } as Asset];
  d.recurringItems = [income('wage', 2500, isoT(2026, 8, 25)), bill('rent', 2150, isoT(2026, 9, 20))];
  const r = A(run(d, '2026-08-15', '2026-09-30'));
  assert('19.1a. target cash position = 405000 cents ($4,050.00)', r.targetCents === 405000);
  assert('19.1b. reconciles: 120000 + 250000 + 250000 - 215000 = 405000', r.breakdown.openingCents === 120000 && r.breakdown.assumedIncomeCents === 500000 && r.breakdown.billsCents === -215000 && r.breakdown.openingCents + r.breakdown.netEventsCents === 405000);
  assert('19.1c. protected savings $6,000 reported separately, excluded from opening', r.protectedSavings.cents === 600000 && r.breakdown.openingCents === 120000);
  assert('19.1d. informational savings/goals never reduce the target (Option B)', r.breakdown.targetCents === 405000);
}

console.log('\n=== 19.2 temporary shortfall ===');
{
  const d = base();
  d.assets = [everyday('cba', 500)];
  d.recurringItems = [bill('rent', 1000, isoT(2026, 8, 16)), income('wage', 2000, isoT(2026, 8, 20))];
  const r = A(run(d, '2026-08-15', '2026-08-30'));
  assert('19.2a. target = 150000 ($1,500)', r.targetCents === 150000);
  assert('19.2b. lowest = -50000 on 16 Aug', r.lowest.cents === -50000 && `${r.lowest.date.month}-${r.lowest.date.day}` === '8-16');
  assert('19.2c. first shortfall = 50000 on 16 Aug', r.firstShortfall !== null && r.firstShortfall.shortfallCents === 50000 && r.firstShortfall.date.day === 16);
  assert('19.2d. recovers = true', r.recovers === true);
}

console.log('\n=== 19.3 same-day net (one checkpoint, no invented intraday order) ===');
{
  const d = base();
  d.assets = [everyday('cba', 100)];
  d.recurringItems = [income('wage', 500, isoT(2026, 8, 20)), bill('rent', 700, isoT(2026, 8, 20))];
  const r = A(run(d, '2026-08-15', '2026-08-25'));
  const cp = r.checkpoints.find((c) => c.date.day === 20)!;
  assert('19.3a. 20 Aug is one net checkpoint of -20000 (net of +500 and -700)', cp.netCents === -20000 && cp.endOfDayCents === -10000);
  assert('19.3b. target end-of-day = -10000 ($-100)', r.targetCents === -10000);
}

console.log('\n=== 19.4 target equals payday ===');
{
  const d = base();
  d.assets = [everyday('cba', 1000)];
  d.recurringItems = [bill('rent', 300, isoT(2026, 8, 18)), income('wage', 2500, isoT(2026, 8, 25))];
  const r = A(run(d, '2026-08-15', '2026-08-25'));
  assert('19.4a. target = 320000 ($3,200), pay included', r.targetCents === 320000);
  assert('19.4b. targetIsPayday true; the pay is assumed', r.assumptions.targetIsPayday === true && r.assumptions.count === 1 && r.assumptions.occurrences[0].cents === 250000);
}

console.log('\n=== 19.5 additional cases ===');
{
  const openingOnly = () => { const d = base(); d.assets = [everyday('cba', 1000)]; return d; };
  assert('target tomorrow accepted (horizon 1)', A(run(openingOnly(), '2026-08-15', '2026-08-16')).horizonDays === 1);
  assert('target exactly 90 days accepted', A(run(openingOnly(), '2026-08-15', '2026-11-13')).horizonDays === 90);
  assert('target today rejected (invalid_target)', (() => { const r = run(openingOnly(), '2026-08-15', '2026-08-15'); return !r.available && r.issues[0].code === 'invalid_target'; })());
  assert('target 91 days rejected', (() => { const r = run(openingOnly(), '2026-08-15', '2026-11-14'); return !r.available && r.issues[0].code === 'invalid_target'; })());
  // target-day income+outflow included once; one day after excluded
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('wage', 200, isoT(2026, 8, 20)), bill('t', 50, isoT(2026, 8, 20)), bill('after', 999, isoT(2026, 8, 21))];
    const r = A(run(d, '2026-08-15', '2026-08-20'));
    assert('target-day events included once; event one day after target excluded', r.targetCents === 100000 + 20000 - 5000 && !r.checkpoints.some((c) => c.date.day === 21)); }
  assert('no future income: target = opening', A(run(openingOnly(), '2026-08-15', '2026-08-31')).targetCents === 100000);
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('a', 100, isoT(2026, 8, 20)), income('b', 200, isoT(2026, 8, 22))];
    assert('multiple income sources both counted', A(run(d, '2026-08-15', '2026-08-31')).breakdown.assumedIncomeCents === 30000); }
  assert('no events: target = opening', A(run(openingOnly(), '2026-08-15', '2026-08-31')).breakdown.netEventsCents === 0);
  { const d = base(); d.assets = [everyday('cba', 0)]; assert('zero opening balance is valid', A(run(d, '2026-08-15', '2026-08-31')).targetCents === 0); }
  { const d = base(); d.assets = [everyday('cba', -50)]; assert('negative opening balance is valid (−5000)', A(run(d, '2026-08-15', '2026-08-31')).targetCents === -5000); }
  assert('no eligible spendable account → unavailable(no_eligible_balance)', (() => { const d = base(); d.assets = []; const r = run(d, '2026-08-15', '2026-08-31'); return !r.available && r.issues[0].code === 'no_eligible_balance'; })());
  { const d = base(); d.assets = [everyday('cba', 1000), { id: 's', type: 'savings', label: 's', currentValue: 6000, includeInMoneyCalculations: false } as Asset];
    const r = A(run(d, '2026-08-15', '2026-08-31')); assert('protected savings excluded once, opening unaffected', r.protectedSavings.cents === 600000 && r.protectedSavings.accounts.length === 1 && r.breakdown.openingCents === 100000); }
  { const d = base(); d.assets = [everyday('cba', 1000), { id: 's', type: 'savings', label: 's', currentValue: 500, includeInMoneyCalculations: true } as Asset];
    const r = A(run(d, '2026-08-15', '2026-08-31')); assert('opted-in savings included once in opening; not protected', r.breakdown.openingCents === 150000 && r.protectedSavings.cents === 0); }
  // due-today eligible vs true unresolved
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [bill('rent', 100, isoT(2026, 8, 15))];
    assert('due-today ELIGIBLE included in the as-of end-of-day batch', A(run(d, '2026-08-15', '2026-08-31')).checkpoints[0].netCents === -10000); }
  { const d = base(); d.recurringItems = [income('wage', 2000, isoT(2026, 8, 20))]; d.assets = [everyday('cba', 1000)];
    d.transactions = [{ id: 'v2', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 20), occurrenceResolution: { version: 2, state: 'linked', occurrenceId: incomeOid('wage', 2026, 8) } as any } as Transaction];
    const r = run(d, '2026-08-15', '2026-08-31'); assert('true A1 unknown-version → unavailable(occurrence_unknown_version)', !r.available && r.issues.some((i) => i.code === 'occurrence_unknown_version')); }
  // linked salary excluded; independent bonus does not suppress
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('wage', 2500, isoT(2026, 8, 20))];
    d.transactions = [{ id: 's', type: 'income', amount: 2500, categoryId: 'c', date: isoT(2026, 8, 20), ...link(incomeOid('wage', 2026, 8)) } as Transaction];
    assert('linked recorded salary excluded (not double-counted)', A(run(d, '2026-08-15', '2026-08-31')).breakdown.assumedIncomeCents === 0); }
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('wage', 2500, isoT(2026, 8, 20))];
    d.transactions = [{ id: 'bonus', type: 'income', amount: 500, categoryId: 'c', date: isoT(2026, 8, 18), occurrenceResolution: { version: 1, state: 'independent' } } as Transaction];
    assert('independent bonus does not suppress the salary', A(run(d, '2026-08-15', '2026-08-31')).breakdown.assumedIncomeCents === 250000); }
  // partial / full card repayment
  { const c: CreditCard = { id: 'c1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 200 } as CreditCard;
    const d = base(); d.assets = [everyday('cba', 1000)]; d.creditCards = [c];
    d.transactions = [{ id: 'p', type: 'expense', amount: 50, categoryId: 'c', date: isoT(2026, 8, 20), isRepayment: true, ...link(cardOid('c1', 2026, 8)) } as Transaction];
    assert('partial card repayment folds the remaining −$150 into cash', A(run(d, '2026-08-15', '2026-08-31')).breakdown.cardCents === -15000);
    const d2 = base(); d2.assets = [everyday('cba', 1000)]; d2.creditCards = [c];
    d2.transactions = [{ id: 'f', type: 'expense', amount: 200, categoryId: 'c', date: isoT(2026, 8, 20), isRepayment: true, ...link(cardOid('c1', 2026, 8)) } as Transaction];
    assert('fully satisfied card cycle contributes nothing', A(run(d2, '2026-08-15', '2026-08-31')).breakdown.cardCents === 0); }
  // BNPL cap
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.liabilities = [{ id: 'bnpl1', type: 'bnpl', label: 'Afterpay', currentBalance: 120 } as Liability];
    d.recurringItems = [bill('bn', 50, isoT(2026, 8, 18), { frequency: 'fortnightly', linkedLiabilityId: 'bnpl1', isFixed: false })];
    assert('BNPL folded, never exceeding the $120 cap', Math.abs(A(run(d, '2026-08-15', '2026-09-30')).breakdown.bnplCents) <= 12000 && A(run(d, '2026-08-15', '2026-09-30')).breakdown.bnplCents < 0); }
  // loan subtypes
  { const subtypes: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];
    for (const st of subtypes) { const d = base(); d.assets = [everyday('cba', 5000)];
      d.liabilities = [{ id: `l-${st}`, type: st, label: st, currentBalance: 10000 } as Liability];
      d.recurringItems = [bill(`ln-${st}`, 1000, isoT(2026, 8, 20), { linkedLiabilityId: `l-${st}` })];
      const r = A(run(d, '2026-08-15', '2026-08-31'));
      const cat = st === 'mortgage' ? r.breakdown.mortgageCents : r.breakdown.otherLoanCents;
      assert(`loan subtype ${st}: −$1000 in the ${st === 'mortgage' ? 'mortgage' : 'other-loan'} category`, cat === -100000); } }
  // blocking invalid bill amount/date
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [bill('rent', 900, 'not-a-date')];
    assert('blocking invalid commitment date → unavailable', (() => { const r = run(d, '2026-08-15', '2026-08-31'); return !r.available && r.issues.some((i) => i.code === 'commitment_invalid_date'); })()); }
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [bill('rent', 0, isoT(2026, 8, 20))];
    assert('blocking invalid commitment amount → unavailable', (() => { const r = run(d, '2026-08-15', '2026-08-31'); return !r.available && r.issues.some((i) => i.code === 'commitment_invalid_amount'); })()); }
  // non-blocking undated income → notice, still available
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('gig', 500, isoT(2026, 8, 1), { nextDueDateUnknown: true })];
    const r = A(run(d, '2026-08-15', '2026-08-31')); assert('undated income → non-blocking notice, still available', r.notices.some((n) => n.code === 'undated_income') && r.breakdown.assumedIncomeCents === 0); }
  // conflict
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('wage', 2000, isoT(2026, 8, 20))];
    d.transactions = [{ id: 'a', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 20), ...link(incomeOid('wage', 2026, 8)) } as Transaction, { id: 'b', type: 'income', amount: 2000, categoryId: 'c', date: isoT(2026, 8, 20), ...link(incomeOid('wage', 2026, 8)) } as Transaction];
    assert('conflicting A1 links → unavailable(occurrence_conflict)', (() => { const r = run(d, '2026-08-15', '2026-08-31'); return !r.available && r.issues.some((i) => i.code === 'occurrence_conflict'); })()); }
  // safe-integer overflow
  { const d = base(); d.assets = [everyday('cba', Number.MAX_SAFE_INTEGER / 100)]; // ~9e13 dollars → cents near MAX_SAFE
    d.recurringItems = [income('big', Number.MAX_SAFE_INTEGER / 100, isoT(2026, 8, 20))];
    const r = run(d, '2026-08-15', '2026-08-31'); assert('overflow fails closed → unavailable(unsafe_arithmetic or invalid balance)', !r.available); }
  // permutation determinism
  { const mk = (order: 'ab' | 'ba') => { const d = base(); d.assets = [everyday('cba', 1000)]; const a = income('a', 100, isoT(2026, 8, 18)); const b = bill('b', 50, isoT(2026, 8, 20)); d.recurringItems = order === 'ab' ? [a, b] : [b, a]; return d; };
    assert('input permutation → identical result', JSON.stringify(run(mk('ab'), '2026-08-15', '2026-08-31')) === JSON.stringify(run(mk('ba'), '2026-08-15', '2026-08-31'))); }
  // repeated deterministic + input not mutated
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [income('a', 100, isoT(2026, 8, 18))];
    const before = JSON.stringify(d); const r1 = JSON.stringify(run(d, '2026-08-15', '2026-08-31')); const r2 = JSON.stringify(run(d, '2026-08-15', '2026-08-31'));
    assert('repeated calls deterministic; input not mutated', r1 === r2 && JSON.stringify(d) === before); }
  // DST + leap/month-end boundary
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [bill('wk', 20, isoT(2026, 4, 5), { frequency: 'weekly' })];
    assert('DST end 5 Apr: weekly bills fold correctly (calendar-day path)', A(run(d, '2026-04-01', '2026-04-12')).checkpoints.length === 12); }
  { const d = base(); d.assets = [everyday('cba', 1000)]; d.recurringItems = [bill('m', 100, isoT(2028, 1, 31), { scheduleAnchorDay: 31 })];
    assert('leap Feb clamp: 29 Feb 2028 bill folds once', A(run(d, '2028-02-01', '2028-02-29')).breakdown.billsCents === -10000); }
}

console.log('\n=== 20. reconciliation & regression ===');
{
  const d = base();
  d.assets = [everyday('cba', 1200)];
  d.creditCards = [{ id: 'c1', issuer: 'T', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 200 } as CreditCard];
  d.liabilities = [{ id: 'm1', type: 'mortgage', label: 'Home', currentBalance: 100000 } as Liability];
  d.recurringItems = [income('wage', 2500, isoT(2026, 8, 25)), bill('rent', 900, isoT(2026, 8, 5)), bill('mort', 1500, isoT(2026, 8, 15), { linkedLiabilityId: 'm1' })];
  const r = A(run(d, '2026-08-01', '2026-08-31'));
  const pe = computeProjectedEventsFromISO(d, '2026-08-01', '2026-08-31');
  assert('20a. folds exactly the A3 included events (count matches; no recurrence re-expansion)', pe.events.length === r.checkpoints.reduce((n, c) => n + (c.netCents !== 0 ? 0 : 0), pe.events.length) && pe.events.length > 0);
  assert('20b. every event counted once — breakdown reconciles opening + categories = target', r.breakdown.openingCents + r.breakdown.assumedIncomeCents + r.breakdown.billsCents + r.breakdown.cardCents + r.breakdown.bnplCents + r.breakdown.mortgageCents + r.breakdown.otherLoanCents === r.targetCents);
  assert('20c. sum of A3 event cents == netEventsCents == target − opening', pe.events.reduce((s, e) => s + e.signedCents, 0) === r.breakdown.netEventsCents && r.breakdown.netEventsCents === r.targetCents - r.breakdown.openingCents);
  assert('20d. mortgage lands in the mortgage category, not other-loan', r.breakdown.mortgageCents === -150000 && r.breakdown.otherLoanCents === 0);
  // A3 blocking prevents an available headline
  { const bad = base(); bad.assets = [everyday('cba', 1000)]; bad.recurringItems = [bill('x', 900, 'bad')]; assert('20e. an A3 blocking issue prevents an available result', !run(bad, '2026-08-01', '2026-08-31').available); }
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
