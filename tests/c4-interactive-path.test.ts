// Pass C.4 — pure, real-import proofs.
//   §1 the 18 Sep 18:49 device fixture (AUP $6,211.85; 30 Sep / 24 Oct / 26 Nov;
//      exact per-date marker fixtures) — preserved before and after interaction.
//   §2 rounded step path: checkpoints untouched, no overshoot, no invented
//      extrema, no false $0 crossing, flat stays flat, area = line geometry.
//   §3 event inspection: canonical identities, exact-cent totals, same-date
//      groups without ordering, weekly buckets, caps, long/large/negative.
//   §4 hit targets: ≥ 44pt, non-overlapping, chronological, nothing dropped.
//   §5 Main payday eligibility + financial invariants when it changes.
// Run with: npx tsx tests/c4-interactive-path.test.ts (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { isEligibleMainPaydaySource, mainPaydayIneligibleReason, resolveMainPayday } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { buildBalancePath, eventTypeLabel } from '../src/lib/calculations/balancePath';
import { BALANCE_PATH_MIN_TARGET, INSPECTION_ROW_CAP, describeHitTarget, formatSignedCents, plotX, resolveCalloutMode, resolveHitTargets } from '../src/lib/calculations/balancePathInteraction';
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
const everyday = (id: string, v: number): Asset => ({ id, type: 'everyday', label: id, currentValue: v, includeInMoneyCalculations: true } as Asset);
const savingsAcct = (id: string, v: number): Asset => ({ id, type: 'savings', label: id, currentValue: v, includeInMoneyCalculations: false } as Asset);
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);

// The 18 Sep 18:49 recording's dataset: the 11:41 dataset + Internet $50 weekly
// (19 Sep) + Utilities $250 monthly (1 Oct), savings allocation at 5%.
const TODAY = new Date(2026, 8, 18);
const ASOF = L(2026, 9, 18);
function deviceData(main: string | null = 'salary-boq'): AppData {
  const d = base();
  d.assets = [everyday('Main', 10700), savingsAcct('Savings', 3500)];
  d.recurringItems = [
    item('salary-boq', 'income', 4000, iso(2026, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2026, 9, 30), 'monthly', 'Rental income'),
    item('dividends', 'income', 1000, iso(2026, 9, 20), 'weekly', 'Dividends'),
    item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly', 'Rent'),
    item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly', 'Gym'),
    { ...item('richmond', 'expense', 3000, iso(2026, 9, 20), 'monthly', 'Richmond repayment'), linkedLiabilityId: 'richmond-loan' } as RecurringItem,
    item('internet', 'expense', 50, iso(2026, 9, 19), 'weekly', 'Internet'),
    item('utilities', 'expense', 250, iso(2026, 10, 1), 'monthly', 'Utilities'),
  ];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 500000 } as Liability];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: new Date(Date.now() + 36 * 30 * 86400000).toISOString(), status: 'active' } as unknown as Goal];
  d.user = { ...d.user, savingsAllocation: { mode: 'percent', percent: 0.05 }, mainPaydayIncomeId: main } as typeof d.user;
  return syncIncomeAggregate(d);
}
function pathFor(data: AppData, target: [number, number, number]) {
  const t = L(...target);
  const r = computeLookAheadProjection(data, ASOF, t);
  if (!r.available) throw new Error('unavailable');
  const events = computeProjectedEvents(data, ASOF, t, { windowStart: ASOF }).events;
  return { r, events, path: buildBalancePath(r, events) };
}

console.log('=== §1 device fixture (18:49 recording) ===');
{
  const d = deviceData();
  const s = computeSafeToSpend(d, TODAY);
  const ex = buildAupExplanation(s);
  const row = (k: string) => ex.rows.find((r) => r.key === k)?.cents;
  assert('AUP: $10,700 − $4,050 − $64.81 − $373.33 − $0.01 rounding = $6,211.85; about $2,071 a day', row('balances') === 1070000 && row('bills') === -405000 && row('goals') === -6481 && row('savings') === -37333 && row('rounding') === -1 && ex.remainderCents === 621185 && Math.round(s.dailyAllowance) === 2071);
  assert('the $250 Utilities due 1 Oct (after payday) is NOT in the AUP bills; the $50 Internet due 19 Sep is', s.datedDeductions.some((x) => x.sourceId === 'internet') && !s.datedDeductions.some((x) => x.sourceId === 'utilities'));
  const a = pathFor(d, [2026, 9, 30]);
  assert('30 Sep: +$9,000 income, −$2,250 bills, −$50 card, −$3,000 mortgage → $14,400; guide $954; lowest $8,650 on 20 Sep; $3,500 protected', a.r.breakdown.assumedIncomeCents === 900000 && a.r.breakdown.billsCents === -225000 && a.r.breakdown.cardCents === -5000 && a.r.breakdown.mortgageCents === -300000 && a.r.targetCents === 1440000 && computeDailyGuide(d, ASOF, L(2026, 9, 30), a.r).displayCents === 95400 && a.r.lowest.cents === 865000 && toISODate(a.r.lowest.date) === '2026-09-20' && a.r.protectedSavings.cents === 350000);
  const b = pathFor(d, [2026, 10, 24]);
  assert('24 Oct: $18,350; guide $441', b.r.targetCents === 1835000 && computeDailyGuide(d, ASOF, L(2026, 10, 24), b.r).displayCents === 44100);
  const c = pathFor(d, [2026, 11, 26]);
  assert('26 Nov: +$36,000, −$12,500, −$50, −$9,000 → $25,150; guide $349', c.r.breakdown.assumedIncomeCents === 3600000 && c.r.breakdown.billsCents === -1250000 && c.r.breakdown.cardCents === -5000 && c.r.breakdown.mortgageCents === -900000 && c.r.targetCents === 2515000 && computeDailyGuide(d, ASOF, L(2026, 11, 26), c.r).displayCents === 34900);
  const oct1 = pathFor(d, [2026, 10, 1]);
  const eod: Record<string, number> = {};
  for (const m of oct1.path.markers) eod[m.key] = m.positionCents;
  const expected: Record<string, number> = { '2026-09-19': 1065000, '2026-09-20': 865000, '2026-09-21': 1165000, '2026-09-24': 1150000, '2026-09-26': 1145000, '2026-09-27': 1245000, '2026-09-28': 1145000, '2026-09-30': 1440000, '2026-10-01': 1400000 };
  assert('exact marker fixtures: every dated group anchors on the engine end-of-day balance (19 Sep $10,650 … 1 Oct $14,000)', JSON.stringify(eod) === JSON.stringify(expected));
}

// §2 (C.4A bounded corner rounding of the monetary step line) was RETIRED with
// the graph in Pass C.5 — there is no plotted balance line any more. The
// inspection, identity, totals and hit-target proofs below are graph-independent
// and unchanged; timeline placement is proved in tests/c5-timeline.test.ts.

console.log('\n=== §3 event inspection — canonical sourcing, exact cents, no intraday order ===');
{
  const d = deviceData();
  const { path, events } = pathFor(d, [2026, 9, 30]);
  const wide = resolveHitTargets(path, 600);
  const t20 = wide.find((t) => t.key === '2026-09-20')!;
  const i20 = describeHitTarget(t20, path);
  console.log('  20 Sep:', JSON.stringify(i20.sections[0]));
  assert('acceptance fixture — "20 Sep · 2 scheduled events": Dividends +$1,000 (Assumed income, not received), Richmond repayment -$3,000 (Scheduled mortgage repayment), Same-day net -$2,000, End-of-day balance $8,650',
    i20.title === '20 Sep · 2 scheduled events' && i20.sections.length === 1 &&
    JSON.stringify(i20.sections[0].rows.map((r) => [r.label, r.amount, r.typeLabel])) === JSON.stringify([['Dividends', '+$1,000', 'Assumed income, not received'], ['Richmond repayment', '-$3,000', 'Scheduled mortgage repayment']]) &&
    i20.sections[0].netLine === 'Same-day net: -$2,000' && i20.sections[0].balanceLine === 'End-of-day balance: $8,650');
  assert('the callout never claims an order: no "first", "then", "before", "after" anywhere in its copy or spoken label', !/\b(first|then|before|after)\b/i.test(JSON.stringify(i20.sections) + i20.targetLabel));
  assert('rows carry the CANONICAL occurrence and source identities (verbatim from the A3 stream, never inferred)', i20.sections[0].rows.every((r) => events.some((e) => e.occurrenceId === r.occurrenceId && e.sourceId === r.sourceId && toISODate(e.date) === '2026-09-20')));
  const i19 = describeHitTarget(wide.find((t) => t.key === '2026-09-19')!, path);
  assert('individual outgoing marker — 19 Sep: Internet -$50, Scheduled bill, no same-day net line, End-of-day balance $10,650', i19.title === '19 Sep · 1 scheduled event' && i19.sections[0].rows[0].label === 'Internet' && i19.sections[0].rows[0].amount === '-$50' && i19.sections[0].rows[0].typeLabel === 'Scheduled bill' && i19.sections[0].netLine === null && i19.sections[0].balanceLine === 'End-of-day balance: $10,650');
  const i27 = describeHitTarget(wide.find((t) => t.key === '2026-09-27')!, path);
  assert('individual income marker — 27 Sep: Dividends +$1,000, Assumed income, not received, End-of-day balance $12,450', i27.sections[0].rows[0].amount === '+$1,000' && i27.sections[0].rows[0].typeLabel === 'Assumed income, not received' && i27.sections[0].balanceLine === 'End-of-day balance: $12,450');
  const i30 = describeHitTarget(wide.find((t) => t.key === '2026-09-30')!, path);
  assert('30 Sep: Rental income +$3,000 and the AMEX card repayment -$50 (Scheduled card repayment); end-of-day = the $14,400 target', i30.sections[0].rows.some((r) => r.typeLabel === 'Scheduled card repayment' && r.amount === '-$50') && i30.sections[0].balanceLine === 'End-of-day balance: $14,400');
  assert('target labels are complete sentences: date, source, type, amount, status, balance', i20.targetLabel === '20 September: Dividends, assumed income, not received, plus $1,000. Richmond repayment, scheduled mortgage repayment, minus $3,000. Same-day net minus $2,000. End-of-day balance $8,650.' && /^Showing 20 Sep · 2 scheduled events\./.test(i20.announcement));
  assert('type wording comes from canonical source kinds only', eventTypeLabel({ sourceKind: 'bnpl', signedCents: -100 } as any) === 'Scheduled BNPL repayment' && eventTypeLabel({ sourceKind: 'loan', liabilitySubtype: 'personal_loan', signedCents: -100 } as any) === 'Scheduled loan repayment' && eventTypeLabel({ sourceKind: 'income', signedCents: 100 } as any) === 'Assumed income, not received');

  // Exact-cent totals per group reconcile to the canonical events.
  const sumOk = path.markers.every((m) => m.netCents === m.events.reduce((n, e) => n + e.signedCents, 0) && m.incomeCents + m.outgoingCents === m.netCents && Number.isInteger(m.netCents));
  const all = path.markers.flatMap((m) => m.events.map((e) => e.occurrenceId));
  assert('every canonical included event appears in exactly one group; group totals are exact integer cents', sumOk && all.length === new Set(all).size && all.length === events.filter((e) => e.inclusion === 'included' && e.signedCents !== 0).length);

  // Collision group on a phone-width plot: 20 + 21 Sep inspected together.
  const phone = resolveHitTargets(path, 266);
  const tc = phone.find((t) => t.groups.some((g) => g.key === '2026-09-20'))!;
  const ic = describeHitTarget(tc, path);
  assert('phone-width collision group: 19 and 20 Sep share ONE target with a section per date, each with its own end-of-day balance ($10,650 then $8,650)', tc.groups.map((g) => g.key).join(',') === '2026-09-19,2026-09-20' && ic.title === '19 Sep – 20 Sep · 3 scheduled events' && ic.sections.map((s) => s.balanceLine).join('|') === 'End-of-day balance: $10,650|End-of-day balance: $8,650' && ic.sections[1].rows.map((r) => r.label).join(',') === 'Dividends,Richmond repayment');

  // Multiple same-type events on one date.
  const m = base(); m.assets = [everyday('cba', 9000)];
  m.recurringItems = [item('a', 'expense', 100.1, iso(2026, 9, 22), 'monthly', 'Phone'), item('b', 'expense', 200.25, iso(2026, 9, 22), 'monthly', 'Power'), item('c', 'expense', 300, iso(2026, 9, 22), 'monthly', 'Water')];
  const mp = pathFor(syncIncomeAggregate(m), [2026, 9, 30]).path;
  const im = describeHitTarget(resolveHitTargets(mp, 600)[0], mp);
  assert('multiple same-type events: three bills on one date, exact-cent net -$600.35, one end-of-day balance', im.title === '22 Sep · 3 scheduled events' && im.sections[0].netLine === 'Same-day net: -$600.35' && im.sections[0].balanceLine === 'End-of-day balance: $8,399.65' && im.sections[0].rows.length === 3);

  // Weekly buckets (36–90 days).
  for (const target of [[2026, 10, 24], [2026, 11, 26], [2026, 12, 17]] as [number, number, number][]) {
    const w = pathFor(d, target);
    const targets = resolveHitTargets(w.path, 266);
    const first = describeHitTarget(targets[0], w.path);
    const s0 = first.sections[0];
    const g0 = targets[0].groups[0];
    assert(`${w.path.horizonDays}d weekly bucket: date range, event count, exact income / outgoing / net totals, end-of-week balance, dated sources — never one transaction`,
      w.path.density === 'weekly' && s0.weekly && /^18 Sep – 24 Sep · \d+ scheduled events$/.test(s0.heading) && s0.incomeTotal === `Assumed income (${g0.incomeCount}): ${formatSignedCents(g0.incomeCents)}` && s0.outgoingTotal === `Outgoing commitments (${g0.outgoingCount}): ${formatSignedCents(g0.outgoingCents)}` && s0.netLine === `Net effect: ${formatSignedCents(g0.netCents)}` && /^End-of-week balance: \$/.test(s0.balanceLine) && s0.rows.every((r) => /^\d+ Sep · /.test(r.label)) && g0.netCents === 500000 - 420000);
    const shown = first.sections.reduce((n, s) => n + s.rows.length, 0);
    const totalRows = targets[0].groups.reduce((n, g) => n + g.events.length, 0);
    assert(`${w.path.horizonDays}d: rows beyond ${INSPECTION_ROW_CAP} are routed to View upcoming events, never silently dropped`, shown <= INSPECTION_ROW_CAP && first.hiddenRowCount === totalRows - shown && (first.hiddenRowCount === 0 ? first.moreLine === null : first.moreLine === `${first.hiddenRowCount} more in View upcoming events`));
  }

  // Long names, large and negative amounts.
  const x = base(); x.assets = [everyday('cba', 100)];
  x.recurringItems = [item('long', 'expense', 1234567.89, iso(2026, 9, 22), 'monthly', 'A very long source name that a customer typed in full for their strata and body corporate levy')];
  const xp = pathFor(syncIncomeAggregate(x), [2026, 9, 30]).path;
  const ix = describeHitTarget(resolveHitTargets(xp, 266)[0], xp);
  assert('long source name kept verbatim; large negative amount exact to the cent; shortfall stated on its group', ix.sections[0].rows[0].label.length > 80 && ix.sections[0].rows[0].amount === '-$1,234,567.89' && ix.sections[0].balanceLine === 'End-of-day balance: -$1,234,467.89' && ix.sections[0].shortfallLine === 'Possible shortfall of $1,234,467.89 on 22 Sep');
  assert('signed formatter: +$1,000 / -$3,000 / $0 / +$0.05', formatSignedCents(100000) === '+$1,000' && formatSignedCents(-300000) === '-$3,000' && formatSignedCents(0) === '$0' && formatSignedCents(5) === '+$0.05');
  assert('callout mode: anchored when it fits; inline at accessibility text sizes, on a narrow plot, or with many rows', resolveCalloutMode({ plotWidth: 266, fontScale: 1, rowCount: 3 }) === 'anchored' && resolveCalloutMode({ plotWidth: 266, fontScale: 1.3, rowCount: 3 }) === 'inline' && resolveCalloutMode({ plotWidth: 220, fontScale: 1, rowCount: 2 }) === 'inline' && resolveCalloutMode({ plotWidth: 300, fontScale: 1, rowCount: 6 }) === 'inline');
}

console.log('\n=== §4 hit targets — ≥ 44pt, non-overlapping, chronological, nothing dropped ===');
{
  const d = deviceData();
  for (const target of [[2026, 9, 19], [2026, 9, 30], [2026, 10, 8], [2026, 10, 24], [2026, 11, 26], [2026, 12, 17]] as [number, number, number][]) {
    for (const width of [222, 266, 300, 600]) {
      const { path } = pathFor(d, target);
      const targets = resolveHitTargets(path, width);
      const wideEnough = targets.every((t) => t.width >= BALANCE_PATH_MIN_TARGET - 1e-9);
      const noOverlap = targets.every((t, i) => i === 0 || t.left >= targets[i - 1].left + targets[i - 1].width - 1e-9);
      const inside = targets.every((t) => t.left >= -1e-9 && t.left + t.width <= width + 1e-9);
      const chronological = targets.flatMap((t) => t.groups.map((g) => toISODate(g.startDate))).every((k, i, arr) => i === 0 || k > arr[i - 1]);
      const covered = targets.flatMap((t) => t.groups.map((g) => g.key)).sort().join() === path.markers.filter((m) => m.events.length > 0 || m.hasShortfall).map((m) => m.key).sort().join();
      const centred = targets.every((t) => t.groups.every((g) => { const x = plotX(g.x, width); return x >= t.left - 1e-9 && x <= t.left + t.width + 1e-9; }));
      assert(`${path.horizonDays}d @${width}px: ${targets.length} targets — each ≥ 44pt wide (plot is 132pt tall), none overlapping, all inside the plot, chronological, every group in exactly one, each marker inside its own target`, wideEnough && noOverlap && inside && chronological && covered && centred);
    }
  }
  const empty = base(); empty.assets = [everyday('cba', 6000)];
  assert('no events → no targets; unmeasured plot → no targets', resolveHitTargets(pathFor(syncIncomeAggregate(empty), [2026, 9, 30]).path, 300).length === 0 && resolveHitTargets(pathFor(d, [2026, 9, 30]).path, 0).length === 0);
}

console.log('\n=== §5 Main payday: eligibility, exclusive identity, financial invariants ===');
{
  const inc = (over: Partial<RecurringItem>) => ({ ...item('x', 'income', 1000, iso(2026, 9, 25), 'monthly'), ...over } as RecurringItem);
  assert('eligible: active regular income with a known valid date', isEligibleMainPaydaySource(inc({})) && mainPaydayIneligibleReason(inc({})) === null);
  assert('irregular → not eligible, plain-language reason', !isEligibleMainPaydaySource(inc({ frequency: 'irregular' })) && /Irregular income/.test(mainPaydayIneligibleReason(inc({ frequency: 'irregular' }))!));
  assert('undated / unknown date → not eligible, asks for a next expected payment date', !isEligibleMainPaydaySource(inc({ nextDueDateUnknown: true })) && !isEligibleMainPaydaySource(inc({ nextDueDate: '' })) && /next expected payment date/.test(mainPaydayIneligibleReason(inc({ nextDueDateUnknown: true }))!));
  assert('invalid date → not eligible; inactive → not eligible; an expense → never', !isEligibleMainPaydaySource(inc({ nextDueDate: 'not-a-date' })) && !isEligibleMainPaydaySource(inc({ active: false })) && /inactive/.test(mainPaydayIneligibleReason(inc({ active: false }))!) && !isEligibleMainPaydaySource(inc({ type: 'expense' })));
  assert('no per-income main flag exists on the model: the authority is user.mainPaydayIncomeId only', !('isMain' in inc({})) && !('primary' in inc({})) && !('isMainPayday' in inc({})));

  const salary = deviceData('salary-boq');
  const rental = deviceData('rental');
  assert('exclusive identity: one id; replacing it never leaves two', resolveMainPayday(salary.recurringItems, salary.user.mainPaydayIncomeId).source?.id === 'salary-boq' && resolveMainPayday(rental.recurringItems, rental.user.mainPaydayIncomeId).source?.id === 'rental');
  for (const target of [[2026, 9, 30], [2026, 10, 24], [2026, 11, 26]] as [number, number, number][]) {
    const a = pathFor(salary, target), b = pathFor(rental, target);
    const ids = (evs: typeof a.events) => evs.map((e) => `${e.occurrenceId}|${e.signedCents}|${toISODate(e.date)}`).join(';');
    assert(`${toISODate(L(...target))}: Salary → Rental changes NOTHING about the fixed-target estimate — same target, checkpoints, lowest, breakdown, event identities and counts, markers`,
      a.r.targetCents === b.r.targetCents && JSON.stringify(a.r.checkpoints) === JSON.stringify(b.r.checkpoints) && JSON.stringify(a.r.lowest) === JSON.stringify(b.r.lowest) && JSON.stringify(a.r.breakdown) === JSON.stringify(b.r.breakdown) && ids(a.events) === ids(b.events) && a.r.assumptions.count === b.r.assumptions.count && JSON.stringify(a.path.markers) === JSON.stringify(b.path.markers));
  }
  const sA = computeSafeToSpend(salary, TODAY), sR = computeSafeToSpend(rental, TODAY);
  assert('what legitimately changes: the AUP boundary (21 Sep → 30 Sep), cadence (fortnightly → monthly) and therefore AUP itself', salary.user.payFrequency === 'fortnightly' && rental.user.payFrequency === 'monthly' && sA.cycleEnd.getDate() === 21 && sR.cycleEnd.getDate() === 30 && Math.round(sA.cycleRemainingPool * 100) === 621185 && Math.round(sR.cycleRemainingPool * 100) !== 621185);
  const gA = computeDailyGuide(salary, ASOF, L(2026, 9, 30)), gR = computeDailyGuide(rental, ASOF, L(2026, 9, 30));
  assert('… and the daily-guide guard after the target (5 Oct under Salary; 30 Oct under Rental) while the paired estimate stays $14,400', toISODate(gA.guardPayday!) === '2026-10-05' && toISODate(gR.guardPayday!) === '2026-10-30' && gA.targetCents === 1440000 && gR.targetCents === 1440000);
  assert('balances, goals and savings settings are identical across the two authorities', JSON.stringify(salary.assets) === JSON.stringify(rental.assets) && JSON.stringify(salary.user.savingsAllocation) === JSON.stringify(rental.user.savingsAllocation) && salary.transactions.length === rental.transactions.length);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
