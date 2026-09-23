// Pass C.3 + C.2 evidence closure — pure, real-import proofs.
//   §A the 18 September physical-device dataset (named fixture inputs): AUP
//      $5,888.52 / $6,261.85, exact-cent explanation, 24 Sep / 30 Sep / 8 Oct,
//      same-day end-of-day contract, daily-guide limiting metadata, expected-
//      income marker (same canonical occurrence as What happens next).
//   §B Estimated balance path mapper invariants (endpoint/minimum/shortfall,
//      grouping never alters outputs, 1/12/20/35/36/68/90 days, domains).
//   §C exact-cent AUP explanation reconciliation (property sweep).
//   §D Main-payday matrix (remaining cases) and secondary-income integrity.
//   §E November fixtures reproduced from the 17 September regression fixture.
//   §F copy: cautious status wording, boundary wording, limiting-factor line.
// Run with: npx tsx tests/c3-closure.test.ts   (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { resolveMainPayday } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend, selectSafeToSpendHeroState } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation, formatSafeToSpendDeduction, selectSafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { MONEY_MEASURE_DEFINITIONS } from '../src/lib/calculations/moneyComposition';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents, projectTimelineOccurrences } from '../src/lib/calculations/projectedEvents';
import { computeMoneyTimeline } from '../src/lib/calculations/moneyTimeline';
import { NO_SHORTFALL_DETECTED, selectDailyGuidePresentation, selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { buildAupRail, EXPECTED_INCOME_NOT_INCLUDED } from '../src/lib/calculations/timelineMarkers';
import { buildBalancePath } from '../src/lib/calculations/balancePath';
import { paydayBoundaryAfter } from '../src/lib/calculations/paydayBoundary';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { localDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const L = (y: number, m: number, d: number) => localDate(y, m, d);
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true } });
const everyday = (id: string, v: number, included = true): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: included } as Asset);
const savings = (id: string, v: number): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: false } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], active = true): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active } as RecurringItem);

// ---------------------------------------------------------------------------
// §A — the 18 September 2026 physical-device dataset, as recorded on screen.
//   Main (everyday) $10,700 included · Savings $3,500 not included
//   Salary boq $4,000 fortnightly, next 21 Sep — the chosen Main payday
//   Rental income $3,000 monthly, next 30 Sep · Dividends $1,000 weekly, next 20 Sep
//   Rent $1,000 weekly, next 21 Sep · Gym $150 weekly, next 24 Sep
//   Richmond mortgage repayment $3,000 monthly, next 20 Sep (linked mortgage)
//   AMEX credit card repayment $50, due on the 30th
//   Savings allocation 10% of expected recurring income ($16,000/mo → $1,600)
//   Goal "Travel" $5,000 over 36 months → $138.89/mo
// ---------------------------------------------------------------------------
const DEVICE_TODAY = new Date(2026, 8, 18);
const DEVICE_ASOF = L(2026, 9, 18);
function deviceData(savingsPercent = 0.1, main: string | null = 'salary-boq'): AppData {
  const d = base();
  d.assets = [everyday('Main', 10700), savings('Savings', 3500)];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly'),
    { ...item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly'), label: 'Richmond repayment', linkedLiabilityId: 'richmond-loan' } as RecurringItem,
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  // The goal's monthly requirement is target ÷ months-until (measured from the
  // real clock inside goalAllocation), so the fixture pins the horizon RELATIVE
  // to now: 36 × 30 days → exactly $138.89/mo, whatever today is.
  const target = new Date(Date.now() + 36 * 30 * 86400000).toISOString();
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: target, status: 'active' } as unknown as Goal];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: savingsPercent }, mainPaydayIncomeId: main } as typeof d.user;
  return syncIncomeAggregate(d);
}

console.log('=== §A.1 the device AUP: $5,888.52 (10%) and $6,261.85 (5%), exact-cent explanation ===');
{
  const d = deviceData(0.1);
  assert('fixture derives $16,000/mo income and a fortnightly Main payday of 21 Sep', Math.round(d.user.monthlyIncome) === 16000 && d.user.payFrequency === 'fortnightly' && toISODate(localDate(new Date(d.user.nextPayday!).getFullYear(), new Date(d.user.nextPayday!).getMonth() + 1, new Date(d.user.nextPayday!).getDate())) === '2026-09-21');
  const s = computeSafeToSpend(d, DEVICE_TODAY);
  const p = selectSafeToSpendPresentation(s, computeMoneyHeroCopy(d));
  console.log('  AUP', JSON.stringify({ state: selectSafeToSpendHeroState(s), bills: s.cycleBillsExpected, savings: s.cycleSavingsReserved, goals: s.cycleGoalsReserved, pool: s.cycleRemainingPool, daily: s.dailyAllowance, days: s.daysRemaining }));
  assert('bills due BY 21 Sep (inclusive): Richmond $3,000 (20 Sep) + Rent $1,000 (21 Sep, the payday itself) = $4,000', s.cycleBillsExpected === 4000 && s.datedDeductions.length === 2);
  assert('savings share this fortnight = $1,600 × 14 ÷ 30 = $746.67 (exact 746.666…)', Math.abs(s.cycleSavingsReserved - 746.6667) < 0.001);
  assert('goal share = $138.89 × 14 ÷ 30 = $64.81', Math.abs(s.cycleGoalsReserved - 64.8148) < 0.01);
  assert('Available until payday = $5,888.52 (the device figure), about $1,963 a day for 3 days', p.amountCents === 588852 && Math.round(s.dailyAllowance) === 1963 && s.daysRemaining === 3);
  const ex = buildAupExplanation(s);
  const shown = (row: (typeof ex.rows)[number]) => (row.kind === 'deduction' ? formatSafeToSpendDeduction(row.cents / 100) : row.cents);
  console.log('  rows', ex.rows.map((r) => `${r.label}=${r.placeholder ?? shown(r)}`).join(' | '), 'remainder', ex.remainderCents, 'rounding', ex.roundingCents);
  assert('exact-cent rows: $10,700 − $4,000 − $64.81 − $746.67 = $5,888.52 — reproducible by the customer, no hidden residual', ex.rows.find((r) => r.key === 'bills')!.cents === -400000 && ex.rows.find((r) => r.key === 'goals')!.cents === -6481 && ex.rows.find((r) => r.key === 'savings')!.cents === -74667 && ex.remainderCents === 588852 && ex.roundingCents === 0);
  assert('the deduction formatter now keeps cents: "-$746.67", "-$64.81", and still "-$4,000" / "$0"', formatSafeToSpendDeduction(746.6667) === '-$746.67' && formatSafeToSpendDeduction(64.8148) === '-$64.81' && formatSafeToSpendDeduction(4000) === '-$4,000' && formatSafeToSpendDeduction(0) === '$0');
  assert('the explanation row is labelled "Bills due by that date" (inclusive boundary), and the definition says "due by payday"', ex.rows.find((r) => r.key === 'bills')!.label === 'Bills due by that date' && /due by payday\.$/.test(MONEY_MEASURE_DEFINITIONS.availableUntilPayday));
  const s5 = computeSafeToSpend(deviceData(0.05), DEVICE_TODAY);
  const p5 = selectSafeToSpendPresentation(s5, computeMoneyHeroCopy(deviceData(0.05)));
  assert('after the 10% → 5% edit: savings share $373.33, Available until payday $6,261.85, about $2,087 a day', Math.abs(s5.cycleSavingsReserved - 373.3333) < 0.001 && p5.amountCents === 626185 && Math.round(s5.dailyAllowance) === 2087);
  const ex5 = buildAupExplanation(s5);
  assert('5% rows still reconcile exactly to $6,261.85', ex5.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0) === ex5.remainderCents && ex5.remainderCents === 626185);
}

console.log('\n=== §A.2 the device look-ahead values: 24 Sep $11,550 / $1,558 · 30 Sep $14,500 / $962 · 8 Oct $18,200 / $802 ===');
{
  const d = deviceData(0.1);
  const cases: [number, number, number, number, number, string, number, number, string][] = [
    // target, estimate cents, guide display cents, limiting date, position cents, k, protected cents, guard
    [9, 24, 1155000, 155800, 0, '2026-10-05', 935000, 6, '2026-10-05'],
    [9, 30, 1450000, 96200, 0, '2026-09-29', 1155000, 12, '2026-10-05'],
    [10, 8, 1820000, 80200, 0, '2026-10-19', 1605000, 20, '2026-10-19'],
  ];
  for (const [m, day, est, guideDisplay, , limiting, position, k, guard] of cases) {
    const t = L(2026, m, day);
    const r = computeLookAheadProjection(d, DEVICE_ASOF, t);
    if (!r.available) throw new Error('device projection unavailable');
    const g = computeDailyGuide(d, DEVICE_ASOF, t, r);
    console.log(`  ${toISODate(t)}: est ${r.targetCents} lowest ${r.lowest.cents}@${toISODate(r.lowest.date)} guide ${g.displayCents} exact ${g.exactCents} limiting ${g.limitingDate && toISODate(g.limitingDate)} pos ${g.limitingPositionCents} k ${g.limitingAllocationDays} protected ${g.obligationsAfterTargetCents} G ${g.guardPayday && toISODate(g.guardPayday)}`);
    assert(`${toISODate(t)}: Estimated balance ${est / 100} matches the device`, r.targetCents === est);
    assert(`${toISODate(t)}: About per day ${guideDisplay / 100} matches the device; guard ${guard}`, g.status === 'available' && g.displayCents === guideDisplay && toISODate(g.guardPayday!) === guard);
    assert(`${toISODate(t)}: the limiting metadata explains the guide — ${limiting}: ${position / 100} ÷ ${k} = ${Math.floor(position / k) / 100}`, toISODate(g.limitingDate!) === limiting && g.limitingPositionCents === position && g.limitingAllocationDays === k && g.exactCents === Math.floor(position / k));
    assert(`${toISODate(t)}: lowest scheduled end-of-day balance $8,700 on 20 Sep`, r.lowest.cents === 870000 && toISODate(r.lowest.date) === '2026-09-20' && r.firstShortfall === null);
  }
  const g30 = computeDailyGuide(d, DEVICE_ASOF, L(2026, 9, 30));
  const gp = selectDailyGuidePresentation(g30);
  console.log('  limitingLine:', gp.limitingLine);
  assert('Why this amount? explains the ACTUAL binding reason for $962 (29 Sep, $11,550 ÷ 12), never target ÷ days', gp.limitingLine === 'Tightest day: 29 Sep. About $11,550 is scheduled to be left by then before everyday spending, and 12 days of spending are counted by then, so $11,550 ÷ 12 = $962 a day, rounded down.');
  assert('the protected line still reports $1,150 kept through the 5 Oct payday', gp.protectedLine === 'Keeps $1,150 for commitments due after 30 Sep through your 5 Oct payday.');
  const g24 = selectDailyGuidePresentation(computeDailyGuide(d, DEVICE_ASOF, L(2026, 9, 24)));
  assert('24 Sep binds on the 5 Oct payday itself: $9,350 ÷ 6 = $1,558, rounded down', g24.limitingLine === 'Tightest day: 5 Oct. About $9,350 is scheduled to be left by then before everyday spending, and 6 days of spending are counted by then, so $9,350 ÷ 6 = $1,558 a day, rounded down.');
}

console.log('\n=== §A.3 same-day contract: 20 Sep is ONE end-of-day batch (+$1,000 − $3,000 → $8,700), never an intraday $7,700 ===');
{
  const d = deviceData(0.1);
  const r = computeLookAheadProjection(d, DEVICE_ASOF, L(2026, 9, 24));
  if (!r.available) throw new Error('unavailable');
  const c20 = r.checkpoints.find((c) => toISODate(c.date) === '2026-09-20')!;
  assert('engine: 20 Sep net = +$1,000 − $3,000 = −$2,000; end-of-day $8,700', c20.netCents === -200000 && c20.endOfDayCents === 870000);
  assert('engine: no checkpoint ever reports the obligations-first $7,700 (no intraday ordering is invented)', !r.checkpoints.some((c) => c.endOfDayCents === 770000) && r.lowest.cents === 870000);
  const p = selectLookAheadPresentation(r);
  assert('status: cautious wording + precise end-of-day minimum', p.cashFlowLine === `${NO_SHORTFALL_DETECTED} · Lowest scheduled end-of-day balance $8,700 on 20 Sep` && !/stays above/.test(p.cashFlowLine!));
  const events = computeProjectedEvents(d, DEVICE_ASOF, L(2026, 9, 24), { windowStart: DEVICE_ASOF }).events;
  const path = buildBalancePath(r, events);
  const m20 = path.markers.find((m) => m.key === '2026-09-20')!;
  assert('chart: the 20 Sep marker group keeps BOTH meanings (1 income +$1,000, 1 outgoing −$3,000) and anchors on the $8,700 end-of-day position', m20.kinds.join(',') === 'income,outgoing' && m20.incomeCents === 100000 && m20.outgoingCents === -300000 && m20.label === '20 September: 1 assumed income payment totalling $1,000 and 1 bill or repayment totalling -$3,000. Scheduled end-of-day balance $8,700.');
  assert('chart: the plotted minimum IS the engine minimum and the endpoint IS the estimate', path.lowest.cents === 870000 && path.targetCents === 1155000 && path.points[path.points.length - 1].cents === 1155000 && Math.min(...path.points.map((x) => x.cents)) === 870000);
  assert('timeline summary (C.5) speaks the span, counts, estimate, lowest end-of-day balance and the cautious shortfall status', path.summary === 'Timeline from today, 18 Sep, to your selected date, 24 Sep, 6 days away. 2 assumed income payments and 3 bills or repayments are scheduled. Estimated balance $11,550 on 24 Sep. Lowest scheduled end-of-day balance $8,700 on 20 Sep. No scheduled shortfall detected.');
}

console.log('\n=== §A.4 Pay cycle progress: the 20 Sep Dividends +$1,000 gets an expected-income marker; AUP is unchanged ===');
{
  const d = deviceData(0.1);
  const s = computeSafeToSpend(d, DEVICE_TODAY);
  const payday = L(2026, 9, 21);
  const events = computeProjectedEvents(d, DEVICE_ASOF, payday, { windowStart: DEVICE_ASOF }).events;
  const before = buildAupRail(s, DEVICE_ASOF)!;
  const rail = buildAupRail(s, DEVICE_ASOF, events)!;
  const expected = rail.markers.filter((m) => m.kind === 'expected_income');
  console.log('  expected-income markers:', expected.map((m) => `${toISODate(m.date)} ${m.label}`).join(' | '));
  assert('exactly one expected-income marker: Dividends on 20 Sep, +$1,000, NOT included', expected.length === 1 && toISODate(expected[0].date) === '2026-09-20' && expected[0].included === false && expected[0].signedAmount === 1000 && expected[0].label === `dividends — $1,000.00 · ${EXPECTED_INCOME_NOT_INCLUDED}`);
  assert('Salary boq on the payday date itself is the payday endpoint (not included), never a second marker', !expected.some((m) => toISODate(m.date) === '2026-09-21') && rail.markers.some((m) => m.kind === 'payday_endpoint' && toISODate(m.date) === '2026-09-21'));
  // Pass D.3 (F4) — the payday endpoint may additionally carry the payday's OWN canonical income event (so a tap can explain the exclusion); every other marker field is identical.
  const sansEvents = (ms: typeof rail.markers) => ms.filter((m) => m.kind !== 'expected_income').map(({ events: _e, ...m }) => m);
  assert('the payday endpoint carries the payday income only when the stream is supplied, and it is the excluded Salary boq occurrence', rail.markers.find((m) => m.kind === 'payday_endpoint')!.events?.length === 1 && rail.markers.find((m) => m.kind === 'payday_endpoint')!.events![0].included === false && before.markers.find((m) => m.kind === 'payday_endpoint')!.events === undefined);
  assert('the bill markers are identical with or without the expected-income stream, and no `income` (included) marker exists in AUP mode', JSON.stringify(sansEvents(before.markers)) === JSON.stringify(sansEvents(rail.markers)) && !rail.markers.some((m) => m.kind === 'income'));
  assert('AUP arithmetic is untouched by the marker: pool still $5,888.52; income is not added', Math.round(s.cycleRemainingPool * 100) === 588852);
  const whn = computeMoneyTimeline(d, DEVICE_TODAY, 30);
  const whnDividend = whn.find((e) => e.kind === 'income' && e.recurringItemId === 'dividends' && e.daysUntil === 2)!;
  const canonical = events.find((e) => e.sourceId === 'dividends')!;
  assert('What happens next and the marker use the SAME canonical occurrence (timeline id, date, amount)', !!whnDividend && whnDividend.id === canonical.presentation.timelineId && whnDividend.amount === 1000 && toISODate(canonical.date) === '2026-09-20' && projectTimelineOccurrences(d, DEVICE_TODAY, 3).some((e) => e.id === canonical.presentation.timelineId));
  assert('spoken summary discloses the expected income as shown-but-not-included', /1 expected income payment before then is shown but not included in this amount\.$/.test(rail.spoken));
}

// §B (C.3 graph mapper invariants: vertical domain, axis ticks, stepped vertices)
// was RETIRED with the monetary graph in Pass C.5. The graph-independent
// invariants it proved — opening + canonical effects = target, points = engine
// checkpoints, minimum = engine lowest, every event grouped exactly once, the
// honest 35/36-day weekly transition, 1–90 day horizons, no-event / negative /
// earlier-shortfall states — now live in tests/c5-timeline.test.ts against
// the timeline rail mapper.

console.log('\n=== §C exact-cent AUP explanation — reconciliation property (500 random cases) ===');
{
  let ok = 0; let roundingRows = 0;
  let seed = 20260918;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 500; i++) {
    const included = Math.round(rnd() * 3_000_000) / 100;
    const bills = Math.round(rnd() * 800_000) / 100;
    const savings = (rnd() * 3000) * (14 / 30); // an exact fraction, like the real cycle share
    const goals = (rnd() * 500) * (14 / 30);
    const pool = included - bills - savings - goals;
    const s = { includedMoneyBalance: included, includedMoneyBalanceAccounts: [{ id: 'a', label: 'a', value: included }], cycleBillsExpected: bills, cycleGoalsReserved: goals, cycleSavingsReserved: savings, cycleRemainingPool: pool } as any;
    const ex = buildAupExplanation(s);
    const sum = ex.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0);
    if (sum === ex.remainderCents && ex.remainderCents === Math.round(pool * 100)) ok++;
    if (ex.roundingCents !== 0) roundingRows++;
    if (Math.abs(ex.roundingCents) > 2) { console.log('  unexpected rounding magnitude', ex.roundingCents); }
  }
  console.log(`  ${ok}/500 reconcile exactly; ${roundingRows} needed an explicit ±1–2c Rounding row`);
  assert('every case: displayed rows (plus any explicit Rounding row) sum EXACTLY to the displayed remainder', ok === 500);
  const neg = buildAupExplanation({ includedMoneyBalance: 100, includedMoneyBalanceAccounts: [], cycleBillsExpected: 400, cycleGoalsReserved: 0, cycleSavingsReserved: 0, cycleRemainingPool: -300 } as any);
  assert('a negative pool reconciles to the true negative remainder (the commitments-exceed-cash state), never to a silent $0', neg.remainderCents === -30000 && neg.rows.find((r) => r.key === 'savings')!.placeholder === 'Not set');
}

console.log('\n=== §D Main-payday matrix — remaining cases, and secondary-income integrity ===');
{
  const TODAY = new Date(2026, 8, 18);
  const mk = (items: RecurringItem[], main: string | null | undefined) => {
    const d = base(); d.assets = [everyday('cba', 6000)]; d.recurringItems = items;
    if (main !== undefined) d.user = { ...d.user, mainPaydayIncomeId: main } as typeof d.user;
    return syncIncomeAggregate(d);
  };
  const st = (d: AppData) => ({ main: resolveMainPayday(d.recurringItems, d.user.mainPaydayIncomeId).status, aup: selectSafeToSpendHeroState(computeSafeToSpend(d, TODAY)), nextPayday: d.user.nextPayday ?? null, guide: computeDailyGuide(d, L(2026, 9, 18), L(2026, 9, 25)).status, guideReason: computeDailyGuide(d, L(2026, 9, 18), L(2026, 9, 25)).missingGuardPaydayReason ?? null });
  const zero = st(mk([], null));
  assert('zero active incomes → none; AUP no_known_payday; guide missing_guard_payday (no_payday)', zero.main === 'none' && zero.aup === 'no_known_payday' && zero.nextPayday === null && zero.guide === 'missing_guard_payday' && zero.guideReason === 'no_payday');
  const unusable = st(mk([{ ...item('irr', 'income', 900, iso(2026, 9, 18), 'irregular'), nextDueDate: undefined, nextDueDateUnknown: true } as unknown as RecurringItem], null));
  assert('one active but unusable income (irregular, no known date) → single by identity, but AUP has no known payday and the guide fails closed', unusable.main === 'single' && unusable.aup === 'no_known_payday' && unusable.nextPayday === null && unusable.guide === 'missing_guard_payday');
  const one = mk([item('a', 'income', 4000, iso(2026, 9, 21), 'fortnightly')], undefined);
  assert('one valid source: automatic authority, nothing persisted', st(one).main === 'single' && st(one).aup === 'normal' && one.user.mainPaydayIncomeId === undefined);
  const second = syncIncomeAggregate({ ...one, recurringItems: [...one.recurringItems, item('b', 'income', 500, iso(2026, 9, 19), 'weekly')] });
  assert('a second income added after automatic single-source authority → unselected → chooser required; no stale payday survives', st(second).main === 'unselected' && st(second).aup === 'main_payday_unselected' && second.user.nextPayday === null && st(second).guide === 'missing_guard_payday' && st(second).guideReason === 'main_payday_unselected');
  const three = mk([item('a', 'income', 4000, iso(2026, 9, 21), 'fortnightly'), item('b', 'income', 500, iso(2026, 9, 19), 'weekly'), item('c', 'income', 300, iso(2026, 9, 30), 'monthly')], 'a');
  // The delete/deactivate transitions clear the id atomically (AppStateContext); the resolver then sees:
  const afterDeactivateSeveral = syncIncomeAggregate({ ...three, user: { ...three.user, mainPaydayIncomeId: null }, recurringItems: three.recurringItems.map((r) => (r.id === 'a' ? { ...r, active: false } : r)) });
  assert('deactivate the chosen source with SEVERAL remaining → unselected (fail closed), no stale frequency/payday', st(afterDeactivateSeveral).main === 'unselected' && afterDeactivateSeveral.user.nextPayday === null && st(afterDeactivateSeveral).aup === 'main_payday_unselected');
  const afterDeactivateOne = syncIncomeAggregate({ ...afterDeactivateSeveral, recurringItems: afterDeactivateSeveral.recurringItems.filter((r) => r.id !== 'c') });
  assert('… with ONE remaining → that source is authoritative automatically', st(afterDeactivateOne).main === 'single' && st(afterDeactivateOne).aup === 'normal');
  const afterDeactivateNone = syncIncomeAggregate({ ...afterDeactivateOne, recurringItems: afterDeactivateOne.recurringItems.map((r) => ({ ...r, active: false })) });
  assert('… with ZERO remaining → none → unavailable', st(afterDeactivateNone).main === 'none' && st(afterDeactivateNone).aup === 'no_known_payday');
  const afterDeleteNone = syncIncomeAggregate({ ...three, user: { ...three.user, mainPaydayIncomeId: null }, recurringItems: three.recurringItems.filter((r) => r.type !== 'income') });
  assert('delete the chosen source with zero income left → none', st(afterDeleteNone).main === 'none');
  const restartCleared = syncIncomeAggregate(JSON.parse(JSON.stringify({ ...three, user: { ...three.user, mainPaydayIncomeId: null } })));
  assert('restart after CLEARING (null persisted, several sources) → still fail-closed, never re-guessed', st(restartCleared).main === 'unselected' && restartCleared.user.mainPaydayIncomeId === null);
  const restartSelected = syncIncomeAggregate(JSON.parse(JSON.stringify(three)));
  assert('restart after a persisted selection → the same id, same boundary, same cadence', st(restartSelected).main === 'selected' && restartSelected.user.payFrequency === 'fortnightly' && st(restartSelected).aup === 'normal');
  assert('the same authority feeds AUP and the daily guide boundary', toISODate(paydayBoundaryAfter(restartSelected.user, L(2026, 9, 25)).kind === 'known' ? (paydayBoundaryAfter(restartSelected.user, L(2026, 9, 25)) as any).date : L(1, 1, 1)) === '2026-10-05');

  // Secondary-income integrity on the device dataset: choosing Salary boq changes ONLY the planning boundary.
  const d = deviceData(0.1);
  const t = L(2026, 10, 8);
  const events = computeProjectedEvents(d, DEVICE_ASOF, t, { windowStart: DEVICE_ASOF }).events;
  const r = computeLookAheadProjection(d, DEVICE_ASOF, t);
  if (!r.available) throw new Error('unavailable');
  const path = buildBalancePath(r, events);
  const whn = computeMoneyTimeline(d, DEVICE_TODAY, 20);
  const count = (pred: (e: { sourceId?: string; recurringItemId?: string; date: any }) => boolean, arr: any[]) => arr.filter(pred).length;
  const dividendDates = ['2026-09-20', '2026-09-27', '2026-10-04'];
  assert('Dividends (secondary) appears exactly once per occurrence in the canonical events (20, 27 Sep, 4 Oct) — none dropped, none duplicated', dividendDates.every((iso) => count((e) => e.sourceId === 'dividends' && toISODate(e.date) === iso, events) === 1) && count((e) => e.sourceId === 'dividends', events) === 3);
  assert('… and exactly once each in What happens next', dividendDates.every((iso) => whn.filter((e) => e.recurringItemId === 'dividends' && toISODate(localDate(e.date.getFullYear(), e.date.getMonth() + 1, e.date.getDate())) === iso).length === 1));
  assert('… and in the Look Ahead assumptions (3 dividend + 1 rental + 2 salary = 6 assumed payments through 8 Oct)', r.assumptions.occurrences.filter((o) => o.sourceId === 'dividends').length === 3 && r.assumptions.count === 6);
  assert('… and on the Estimated balance path (6 income payments across the groups)', path.markers.reduce((n, m) => n + m.incomeCount, 0) === 6 && path.eventCounts.income === 6);
  const dOther = deviceData(0.1, 'rental');
  const rOther = computeLookAheadProjection(dOther, DEVICE_ASOF, t);
  assert('changing the Main payday to Rental income leaves the estimate identical (only the AUP/guide boundary moves)', rOther.available && rOther.targetCents === r.targetCents && rOther.lowest.cents === r.lowest.cents && dOther.user.payFrequency === 'monthly');
}

console.log('\n=== §E November fixtures — reproduced from the 17 September regression fixture ===');
{
  // The 17 Sep regression fixture (tests/c2-closure.test.ts §3), Salary as Main payday.
  const d = base();
  d.assets = [everyday('cba', 10700)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 25), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 18), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly'),
    { ...item('mortgage', 'expense', 3000, iso(2026, 9, 20), 'monthly'), linkedLiabilityId: 'mort' } as RecurringItem,
  ];
  d.liabilities = [{ id: 'mort', type: 'mortgage', label: 'Mortgage', currentBalance: 400000 } as Liability];
  d.creditCards = [{ id: 'amex', label: 'AMEX', currentBalance: 800, creditLimit: 5000, apr: 0.2, dueDay: 30, minimumPayment: 50, plannedRepayment: 50 } as unknown as CreditCard];
  d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
  const s = syncIncomeAggregate(d);
  for (const [m, day] of [[11, 20], [11, 24]] as [number, number][]) {
    const t = L(2026, m, day);
    const r = computeLookAheadProjection(s, L(2026, 9, 17), t);
    if (!r.available) throw new Error('unavailable');
    const g = computeDailyGuide(s, L(2026, 9, 17), t, r);
    const line = { target: toISODate(t), opening: r.breakdown.openingCents, income: r.breakdown.assumedIncomeCents, obligations: r.breakdown.billsCents + r.breakdown.cardCents + r.breakdown.mortgageCents + r.breakdown.otherLoanCents + r.breakdown.bnplCents, endpoint: r.targetCents, minimum: r.lowest.cents, minimumDate: toISODate(r.lowest.date), shortfall: r.firstShortfall, guide: g.displayCents, guideExact: g.exactCents, limiting: g.limitingDate && toISODate(g.limitingDate), guard: g.guardPayday && toISODate(g.guardPayday) };
    console.log('  ', JSON.stringify(line));
    assert(`${toISODate(t)}: available, opening + income + obligations = endpoint, minimum is a checkpoint, guide available from the Main-payday guard`, r.breakdown.openingCents + r.breakdown.assumedIncomeCents + line.obligations === r.targetCents && r.checkpoints.some((c) => c.endOfDayCents === r.lowest.cents) && g.status === 'available' && g.guardPayday !== null);
    const events = computeProjectedEvents(s, L(2026, 9, 17), t, { windowStart: L(2026, 9, 17) }).events;
    const path = buildBalancePath(r, events);
    assert(`${toISODate(t)}: weekly path, endpoint/minimum equal the engine`, path.density === 'weekly' && path.targetCents === r.targetCents && path.lowest.cents === r.lowest.cents);
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
