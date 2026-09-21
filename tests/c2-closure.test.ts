// Pass C.2 closure — pure, real-import (Class A) proofs.
//   §4 explicit Main payday: resolution, confirmation-order invariance, edits,
//      ties, month-end, leap/DST, legacy payloads, invalid ids, one authority.
//   §3 the 17 September device values (25 Sep / 30 Sep).
//   §6 formatters: "For tomorrow", never "-$0", exact remainder.
//   §7 rail density: no events, one, same-day, 7/30/64/68/90 days, dense weekly.
//   §8 mode-aware timeframe collisions; invalid data outranks expired payday.
// Run with: npx tsx tests/c2-closure.test.ts   (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { mainPaydayNeedsChoice, resolveMainPayday } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend, selectSafeToSpendHeroState } from '../src/lib/calculations/safeToSpend';
import { formatSafeToSpendAmount, formatSafeToSpendDeduction, selectSafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { forTheNextDaysLabel } from '../src/lib/calculations/moneyComposition';
import { formatDollarsCentsAware } from '../src/lib/calculations/money';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { selectDailyGuidePresentation } from '../src/lib/calculations/lookAheadPresentation';
import { buildScenarioRail, resolveRailDensity, RAIL_WEEKLY_THRESHOLD_DAYS } from '../src/lib/calculations/timelineMarkers';
import { resolveTimeframeSelection } from '../src/lib/calculations/timeframeFlow';
import { paydayBoundaryAfter } from '../src/lib/calculations/paydayBoundary';
import { confirmRecurringOccurrenceTransition, syncIncomeAggregate } from '../src/state/AppStateContext';
import { localDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../src/types/models';

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
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], active = true): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active } as RecurringItem);
const localOf = (d: Date) => toISODate(localDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));

/** The 14 Sep data: two overdue incomes (11 Sep), rent/gym weekly, $6,000. */
function twoIncomes(mainPaydayIncomeId: string | null | undefined = undefined): AppData {
  const d = base();
  d.assets = [everyday('cba', 6000)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 11), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 11), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 14), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 17), 'weekly'),
  ];
  if (mainPaydayIncomeId !== undefined) d.user = { ...d.user, mainPaydayIncomeId } as typeof d.user;
  return syncIncomeAggregate(d);
}
const TODAY = new Date(2026, 8, 14);
const ASOF = L(2026, 9, 14);

function confirmIncome(data: AppData, id: string, seq: number): AppData {
  const it = data.recurringItems.find((r) => r.id === id)!;
  const r = confirmRecurringOccurrenceTransition(data, { recurringItemId: id, expectedNextDueDate: it.nextDueDate, targetAssetId: 'cba', transactionId: `tx-${id}-${seq}`, date: TODAY.toISOString() });
  if (!r.applied) throw new Error(`confirm ${id} failed: ${r.reason}`);
  return syncIncomeAggregate(r.data);
}
function authority(data: AppData, target = L(2026, 9, 15)) {
  const main = resolveMainPayday(data.recurringItems, data.user.mainPaydayIncomeId);
  const aup = computeSafeToSpend(data, TODAY);
  const guard = paydayBoundaryAfter(data.user, target);
  const guide = computeDailyGuide(data, ASOF, target);
  return { status: main.status, sourceId: main.source?.id ?? null, nextPayday: data.user.nextPayday ? localOf(new Date(data.user.nextPayday)) : null, payFrequency: data.user.payFrequency, aupBoundary: localOf(aup.cycleEnd), aupState: selectSafeToSpendHeroState(aup), aupPool: Math.round(aup.cycleRemainingPool * 100), guard: guard.kind === 'known' ? toISODate(guard.date) : guard.kind, guideStatus: guide.status, guideCents: guide.exactCents, guideReason: guide.missingGuardPaydayReason ?? null };
}

console.log('=== §4 resolution: zero, one, multiple, explicit, invalid, legacy ===');
{
  assert('zero active incomes → none', resolveMainPayday([], undefined).status === 'none');
  const one = [item('a', 'income', 100, iso(2026, 9, 20), 'monthly')];
  assert('one active income → single, authoritative automatically (nothing persisted)', resolveMainPayday(one, undefined).status === 'single' && resolveMainPayday(one, undefined).source?.id === 'a');
  const inactiveOther = [...one, item('b', 'income', 900, iso(2026, 9, 15), 'weekly', false)];
  assert('an INACTIVE second source does not count → still single', resolveMainPayday(inactiveOther, undefined).status === 'single');
  const two = [item('a', 'income', 100, iso(2026, 9, 20), 'monthly'), item('b', 'income', 900, iso(2026, 9, 15), 'weekly')];
  assert('multiple sources, legacy payload (field absent) → unselected → must choose', resolveMainPayday(two, undefined).status === 'unselected' && mainPaydayNeedsChoice('unselected'));
  assert('multiple sources, null → unselected', resolveMainPayday(two, null).status === 'unselected');
  assert('multiple sources, empty string → unselected', resolveMainPayday(two, '').status === 'unselected');
  assert('explicit selection by stable id → selected (the SMALLER, LATER-dated source can be chosen)', resolveMainPayday(two, 'a').status === 'selected' && resolveMainPayday(two, 'a').source?.id === 'a');
  assert('id of a deleted/unknown source → invalid → must choose', resolveMainPayday(two, 'ghost').status === 'invalid' && mainPaydayNeedsChoice('invalid'));
  assert('never the largest, earliest, or first-created when unselected', resolveMainPayday(two, undefined).source === null);
  // Identity is never inferred from label/amount/date: same label & amount, different id.
  const twins = [item('x1', 'income', 5000, iso(2026, 9, 11), 'fortnightly'), { ...item('x2', 'income', 5000, iso(2026, 9, 11), 'fortnightly'), label: 'x1' }];
  assert('a look-alike source (same label, amount, date) is never matched — only the exact id', resolveMainPayday(twins, 'x2').source?.id === 'x2' && resolveMainPayday(twins, 'x1').source?.id === 'x1');
}

console.log('\n=== §4 fail-closed states: AUP, Today copy, daily guide; estimate stays available ===');
{
  const d = twoIncomes(undefined);
  const a = authority(d);
  assert('unselected: nextPayday null; AUP hero main_payday_unselected; no amount', a.status === 'unselected' && a.nextPayday === null && a.aupState === 'main_payday_unselected');
  const p = selectSafeToSpendPresentation(computeSafeToSpend(d, TODAY), computeMoneyHeroCopy(d));
  assert('copy: "Choose your main payday"; neutral tone; compact "Choose main payday"', p.primaryCopy === 'Choose your main payday' && p.tone === 'normal' && !p.amountVisible && p.compactSummary === 'Choose main payday');
  assert('daily guide fails closed with main_payday_unselected; the estimated balance is still $5,000', a.guideStatus === 'missing_guard_payday' && a.guideReason === 'main_payday_unselected' && computeLookAheadProjection(d, ASOF, L(2026, 9, 15)).available && (computeLookAheadProjection(d, ASOF, L(2026, 9, 15)) as any).targetCents === 500000);
  const gp = selectDailyGuidePresentation(computeDailyGuide(d, ASOF, L(2026, 9, 15)));
  assert('guide presentation explains: choose your main payday', gp.value === '—' && /main payday/i.test(gp.explanation));
  const inv = twoIncomes('ghost');
  assert('invalid stored id → identical fail-closed state', authority(inv).aupState === 'main_payday_unselected' && authority(inv).guideReason === 'main_payday_unselected');
  const single = base(); single.assets = [everyday('cba', 6000)]; single.recurringItems = [item('salary', 'income', 5000, iso(2026, 9, 25), 'fortnightly')];
  const s = syncIncomeAggregate(single);
  assert('single source derives automatically (no field needed): AUP normal, boundary 25 Sep', authority(s).status === 'single' && authority(s).aupBoundary === '2026-09-25' && authority(s).aupState === 'normal');
  assert('syncIncomeAggregate never persists a guess (field stays absent)', !('mainPaydayIncomeId' in s.user) || s.user.mainPaydayIncomeId === undefined);
}

console.log('\n=== §4 confirmation order never alters the selected source ===');
{
  const A = confirmIncome(confirmIncome(twoIncomes('salary'), 'salary', 1), 'salary3', 2);
  const B = confirmIncome(confirmIncome(twoIncomes('salary'), 'salary3', 1), 'salary', 2);
  const a = authority(A), b = authority(B);
  console.log('  primary→secondary:', JSON.stringify(a));
  console.log('  secondary→primary:', JSON.stringify(b));
  assert('both orders: Salary stays the Main payday (id), fortnightly, 25 Sep', a.sourceId === 'salary' && b.sourceId === 'salary' && a.nextPayday === '2026-09-25' && b.nextPayday === '2026-09-25' && a.payFrequency === 'fortnightly');
  assert('both orders: identical AUP boundary/state/value and identical guard + guide', JSON.stringify(a) === JSON.stringify(b) && a.aupState === 'normal' && a.aupPool === 970000 && a.guard === '2026-09-25' && a.guideCents === 970000);
  const mid = authority(confirmIncome(twoIncomes('salary'), 'salary', 1));
  assert('confirming ONLY the primary advances the boundary to 25 Sep (the overdue secondary no longer hijacks it)', mid.sourceId === 'salary' && mid.aupBoundary === '2026-09-25' && mid.aupState === 'normal');
  const only3 = authority(confirmIncome(twoIncomes('salary'), 'salary3', 1));
  assert('confirming ONLY the secondary leaves the Main payday expired (11 Sep) and fail-closed as expired', only3.sourceId === 'salary' && only3.aupBoundary === '2026-09-11' && only3.aupState === 'payday_expired');
  // The recording's founder scenario: Salary 3 could previously become the anchor.
  const old = twoIncomes('salary3');
  assert('choosing Salary 3 explicitly is honoured (an explicit choice, not an inference)', authority(old).sourceId === 'salary3' && authority(old).payFrequency === 'weekly');
}

console.log('\n=== §4 editing sources ===');
{
  const d = twoIncomes('salary');
  const editedSecondary = syncIncomeAggregate({ ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'salary3' ? { ...r, amount: 2500, frequency: 'fortnightly' as const, nextDueDate: iso(2026, 9, 12) } : r)) });
  assert('editing the secondary amount/date/frequency leaves the Main payday unchanged', authority(editedSecondary).sourceId === 'salary' && authority(editedSecondary).nextPayday === '2026-09-11');
  const editedMain = syncIncomeAggregate({ ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'salary' ? { ...r, amount: 5500, nextDueDate: iso(2026, 9, 26), frequency: 'monthly' as const } : r)) });
  assert('editing the selected source keeps it selected and follows its new schedule/cadence', authority(editedMain).sourceId === 'salary' && authority(editedMain).nextPayday === '2026-09-26' && authority(editedMain).payFrequency === 'monthly');
  const deactivated = syncIncomeAggregate({ ...d, recurringItems: d.recurringItems.map((r) => (r.id === 'salary' ? { ...r, active: false } : r)) });
  assert('deactivating the selected source (field not yet cleared): resolver reports it as gone → single remaining source is authoritative', resolveMainPayday(deactivated.recurringItems, deactivated.user.mainPaydayIncomeId).status === 'single');
  const deleted = syncIncomeAggregate({ ...d, user: { ...d.user, mainPaydayIncomeId: null }, recurringItems: d.recurringItems.filter((r) => r.id !== 'salary') });
  assert('after the delete transition clears the field, one remaining source → single (fail-closed only when several remain)', resolveMainPayday(deleted.recurringItems, deleted.user.mainPaydayIncomeId).status === 'single');
  const three = { ...d, recurringItems: [...d.recurringItems, item('rent-income', 'income', 300, iso(2026, 9, 20), 'monthly')] };
  const deletedOfThree = syncIncomeAggregate({ ...three, user: { ...three.user, mainPaydayIncomeId: null }, recurringItems: three.recurringItems.filter((r) => r.id !== 'salary') });
  assert('deleting the chosen one of THREE → unselected → replacing it requires an explicit choice', resolveMainPayday(deletedOfThree.recurringItems, deletedOfThree.user.mainPaydayIncomeId).status === 'unselected' && authority(deletedOfThree).aupState === 'main_payday_unselected');
}

console.log('\n=== §4 tied dates, month-end recurrence, leap year, DST ===');
{
  const tied = twoIncomes('salary3'); // both 11 Sep; the explicit id decides, never array order
  assert('tied dates: the explicit id wins regardless of order', authority(tied).sourceId === 'salary3');
  const swapped = syncIncomeAggregate({ ...tied, recurringItems: [...tied.recurringItems].reverse() });
  assert('reversing the array order changes nothing', authority(swapped).sourceId === 'salary3');
  const me = base(); me.assets = [everyday('cba', 6000)];
  me.recurringItems = [item('m31', 'income', 4000, iso(2026, 8, 31), 'monthly'), item('side', 'income', 200, iso(2026, 9, 10), 'weekly')];
  me.user = { ...me.user, mainPaydayIncomeId: 'm31' } as typeof me.user;
  const m = syncIncomeAggregate(me);
  const after = confirmIncome(m, 'm31', 1); // 31 Aug → 30 Sep (clamped), anchor 31 preserved
  assert('month-end anchored Main payday advances to 30 Sep (clamped) and stays the authority', authority(after).sourceId === 'm31' && authority(after).nextPayday === '2026-09-30');
  const leap = base(); leap.assets = [everyday('cba', 6000)];
  leap.recurringItems = [item('main', 'income', 3000, iso(2028, 3, 15), 'fortnightly'), item('side', 'income', 100, iso(2028, 3, 1), 'weekly'), item('rent', 'expense', 1000, iso(2028, 3, 10), 'monthly')];
  leap.user = { ...leap.user, mainPaydayIncomeId: 'main' } as typeof leap.user;
  const lg = computeDailyGuide(syncIncomeAggregate(leap), L(2028, 2, 28), L(2028, 3, 1));
  assert('leap year: 28 Feb → 1 Mar 2028 counts 2 days; guard from the Main payday (15 Mar), not the 1 Mar side income', lg.allocationDays === 2 && toISODate(lg.guardPayday!) === '2028-03-15' && lg.status === 'available');
  const dst = base(); dst.assets = [everyday('cba', 6000)];
  dst.recurringItems = [item('main', 'income', 3000, iso(2026, 4, 10), 'fortnightly'), item('side', 'income', 100, iso(2026, 4, 7), 'weekly'), item('rent', 'expense', 1000, iso(2026, 4, 8), 'monthly')];
  dst.user = { ...dst.user, mainPaydayIncomeId: 'main' } as typeof dst.user;
  const dg = computeDailyGuide(syncIncomeAggregate(dst), L(2026, 4, 4), L(2026, 4, 6));
  assert('across the 5 Apr 2026 AEDT→AEST transition: N = 2, guard 10 Apr, guide ($6,000 − $1,000) ÷ 2 = $2,500 (7 Apr side income after T excluded)', dg.allocationDays === 2 && toISODate(dg.guardPayday!) === '2026-04-10' && dg.exactCents === 250000);
}

console.log('\n=== §3 the 17 September device values (25 Sep / 30 Sep) ===');
{
  // 17 Sep: $10,700 included; Salary $5,000 fortnightly 25 Sep; Salary 3 $1,000
  // weekly 18 Sep; rent $1,000 weekly 21 Sep; gym $150 weekly 24 Sep; mortgage
  // $3,000 on 20 Sep; a $50 card repayment due on the 30th. The recording's
  // anchor was Salary 3 (18 Sep → guard 2 Oct); with Salary as Main payday the
  // guard is 9 Oct — the earlier 24 Sep prefix binds either way.
  const mk = (main: string): AppData => {
    const d = base();
    d.assets = [everyday('cba', 10700)];
    d.recurringItems = [
      item('salary', 'income', 5000, iso(2026, 9, 25), 'fortnightly'),
      item('salary3', 'income', 1000, iso(2026, 9, 18), 'weekly'),
      item('rent', 'expense', 1000, iso(2026, 9, 21), 'weekly'),
      item('gym', 'expense', 150, iso(2026, 9, 24), 'weekly'),
    ];
    d.liabilities = [{ id: 'mort', type: 'mortgage', label: 'Mortgage', currentBalance: 400000 } as Liability];
    d.recurringItems.push({ ...item('mortgage', 'expense', 3000, iso(2026, 9, 20), 'monthly'), linkedLiabilityId: 'mort' } as RecurringItem);
    d.creditCards = [{ id: 'amex', label: 'AMEX', currentBalance: 800, creditLimit: 5000, apr: 0.2, dueDay: 30, minimumPayment: 50, plannedRepayment: 50 } as unknown as CreditCard];
    d.user = { ...d.user, mainPaydayIncomeId: main } as typeof d.user;
    return syncIncomeAggregate(d);
  };
  for (const main of ['salary3', 'salary']) {
    const d = mk(main);
    const g25 = computeDailyGuide(d, L(2026, 9, 17), L(2026, 9, 25));
    const g30 = computeDailyGuide(d, L(2026, 9, 17), L(2026, 9, 30));
    console.log(`  main=${main}: 25 Sep est ${g25.targetCents} guide ${g25.exactCents} G ${g25.guardPayday && toISODate(g25.guardPayday)} | 30 Sep est ${g30.targetCents} guide ${g30.exactCents} G ${g30.guardPayday && toISODate(g30.guardPayday)}`);
    assert(`[main=${main}] 25 Sep: $10,700 + $7,000 − $1,150 − $3,000 = $13,550; About per day $943 (24 Sep prefix $7,550 ÷ 8)`, g25.targetCents === 1355000 && g25.displayCents === 94300 && toISODate(g25.limitingDate!) === '2026-09-24');
    if (main === 'salary3') {
      assert('[recording anchor Salary 3] 30 Sep: $12,500; About per day $943 (same 24 Sep prefix); guard 2 Oct', g30.targetCents === 1250000 && g30.displayCents === 94300 && toISODate(g30.limitingDate!) === '2026-09-24' && toISODate(g30.guardPayday!) === '2026-10-02');
    } else {
      // With Salary as the explicit Main payday the guard is the 9 Oct fortnightly
      // boundary, so rent 5 Oct and gym 1/8 Oct are protected too: $11,200 on
      // 8 Oct ÷ 13 = $861.53 → $861. A consequence of the founder's decision,
      // not a regression — reported explicitly.
      assert('[Main payday Salary] 30 Sep: $12,500; guard 9 Oct; About per day $861 (8 Oct prefix $11,200 ÷ 13)', g30.targetCents === 1250000 && toISODate(g30.guardPayday!) === '2026-10-09' && g30.displayCents === 86100 && toISODate(g30.limitingDate!) === '2026-10-08');
    }
  }
  assert('recording anchor (Salary 3) guards 2 Oct; Main payday Salary guards 9 Oct — the displayed guide is unchanged', toISODate(computeDailyGuide(mk('salary3'), L(2026, 9, 17), L(2026, 9, 25)).guardPayday!) === '2026-10-02' && toISODate(computeDailyGuide(mk('salary'), L(2026, 9, 17), L(2026, 9, 25)).guardPayday!) === '2026-10-09');
}

console.log('\n=== §6 formatters ===');
{
  assert('"For tomorrow" replaces "For the next 1 day"', forTheNextDaysLabel(1) === 'For tomorrow' && forTheNextDaysLabel(2) === 'For the next 2 days' && forTheNextDaysLabel(0) === '');
  assert('negative zero never renders: formatSafeToSpendAmount(-0) = "$0", (-0.4) = "$0"', formatSafeToSpendAmount(-0) === '$0' && formatSafeToSpendAmount(-0.4) === '$0' && formatSafeToSpendAmount(0) === '$0');
  assert('deduction formatter: 0 → "$0", 1150 → "-$1,150", -0 → "$0"', formatSafeToSpendDeduction(0) === '$0' && formatSafeToSpendDeduction(1150) === '-$1,150' && formatSafeToSpendDeduction(-0) === '$0');
  assert('exact remainder keeps material cents: $10,313.70; whole dollars stay "$6,000"; -0 cents → "$0"', formatDollarsCentsAware(10313.7) === '$10,313.70' && formatDollarsCentsAware(6000) === '$6,000' && formatDollarsCentsAware(-0) === '$0' && formatDollarsCentsAware(-0.001) === '$0');
  const d = base(); d.assets = [everyday('cba', 10700)];
  d.recurringItems = [item('salary', 'income', 5000, iso(2026, 9, 18), 'weekly')];
  d.user = { ...d.user, savingsAllocation: { mode: 'amount', amount: 386.3 } as any } as typeof d.user;
  const s = computeSafeToSpend(syncIncomeAggregate(d), new Date(2026, 8, 17));
  const p = selectSafeToSpendPresentation(s, computeMoneyHeroCopy(d));
  const heroText = p.amountCents !== null ? formatDollarsCentsAware(p.amountCents / 100) : null;
  const breakdownText = formatDollarsCentsAware(Math.max(0, s.cycleRemainingPool));
  assert(`the hero and the explanation share the SAME exact-cent remainder (${breakdownText}), not a rounded "${formatSafeToSpendAmount(s.cycleRemainingPool)}"`, heroText === breakdownText && /\.\d{2}$/.test(breakdownText) && s.cycleBillsExpected === 0 && formatSafeToSpendDeduction(s.cycleBillsExpected) === '$0');
}

console.log('\n=== §7 rail density (presentation only; nothing dropped) ===');
{
  const rail = (asOf: [number, number, number], target: [number, number, number], items: RecurringItem[]) => {
    const d = base(); d.assets = [everyday('cba', 20000)]; d.recurringItems = items;
    d.user = { ...d.user, mainPaydayIncomeId: items.find((i) => i.type === 'income')?.id ?? null } as typeof d.user;
    const s = syncIncomeAggregate(d);
    const a = L(...asOf), t = L(...target);
    const r = computeLookAheadProjection(s, a, t);
    if (!r.available) throw new Error('rail fixture unavailable');
    return buildScenarioRail(computeProjectedEvents(s, a, t, { windowStart: a }).events, r);
  };
  const weekly = [item('pay', 'income', 1000, iso(2026, 9, 18), 'weekly'), item('rent', 'expense', 500, iso(2026, 9, 21), 'weekly'), item('gym', 'expense', 50, iso(2026, 9, 24), 'weekly')];
  const none = resolveRailDensity(rail([2026, 9, 17], [2026, 9, 24], []));
  assert('no events → exact mode, no bins, no disclosure', none.mode === 'exact' && none.bins.length === 0 && none.disclosure === null);
  const one = resolveRailDensity(rail([2026, 9, 17], [2026, 9, 24], [item('pay', 'income', 1000, iso(2026, 9, 20), 'monthly')]));
  assert('one event → one exact bin with the exact date and count', one.mode === 'exact' && one.bins.length === 1 && one.bins[0].incomeCount === 1 && /^20 September: assumed income$/.test(one.bins[0].label));
  const sameDay = resolveRailDensity(rail([2026, 9, 17], [2026, 9, 24], [item('pay', 'income', 1000, iso(2026, 9, 20), 'monthly'), item('bill', 'expense', 700, iso(2026, 9, 20), 'monthly')]));
  assert('same-day income and outgoing → one bin, both kinds, deterministic order (income, bill)', sameDay.bins.length === 1 && sameDay.bins[0].kinds.join(',') === 'income,bill' && sameDay.bins[0].incomeCount === 1 && sameDay.bins[0].billCount === 1);
  const d7 = resolveRailDensity(rail([2026, 9, 17], [2026, 9, 24], weekly));
  const d30 = resolveRailDensity(rail([2026, 9, 17], [2026, 10, 17], weekly));
  assert('7- and 30-day horizons keep exact per-date bins', d7.mode === 'exact' && d30.mode === 'exact' && d30.bins.length > 4);
  const r64 = rail([2026, 9, 17], [2026, 11, 20], weekly);
  const d64 = resolveRailDensity(r64);
  assert('64-day horizon → weekly bins with the disclosure', d64.mode === 'weekly' && d64.disclosure === 'Events grouped by week' && d64.bins.length <= 10 && d64.bins.length >= 9);
  const totalMarkers = d64.bins.reduce((n, b) => n + b.markers.length, 0);
  const totalCount = d64.bins.reduce((n, b) => n + b.incomeCount + b.billCount, 0);
  const rawCount = r64.markers.reduce((n, m) => n + m.count, 0);
  assert('nothing is dropped: every marker lands in exactly one bin and counts reconcile', totalMarkers === r64.markers.length && totalCount === rawCount);
  assert('a weekly bin label carries exact counts, amounts, categories and its date range', /September to .* September: \d+ assumed income payments? totalling \$[\d,]+\.\d{2} and \d+ bills? or repayments? totalling -\$[\d,]+\.\d{2}/.test(d64.bins[0].label));
  assert('income and outgoing stay distinguishable by kind within a bin', d64.bins[0].kinds.includes('income') && d64.bins[0].kinds.includes('bill'));
  const d68 = resolveRailDensity(rail([2026, 9, 17], [2026, 11, 24], weekly));
  const d90 = resolveRailDensity(rail([2026, 9, 17], [2026, 12, 16], weekly));
  assert('68- and 90-day horizons are weekly too, positions monotonic and within [0,1]', d68.mode === 'weekly' && d90.mode === 'weekly' && d90.bins.every((b, i, arr) => b.position >= 0 && b.position <= 1 && (i === 0 || b.position > arr[i - 1].position)));
  assert(`threshold is ${RAIL_WEEKLY_THRESHOLD_DAYS} days: 35 days exact, 36 days weekly`, resolveRailDensity(rail([2026, 9, 17], [2026, 10, 22], weekly)).mode === 'exact' && resolveRailDensity(rail([2026, 9, 17], [2026, 10, 23], weekly)).mode === 'weekly');
}

console.log('\n=== §8 mode-aware timeframe selection; invalid data outranks expired payday ===');
{
  const me = L(2026, 9, 30);
  assert('custom date that equals month end → still the Choose-a-date row', resolveTimeframeSelection(me, me, 'custom') === 'custom');
  assert('month-end row chosen → month end', resolveTimeframeSelection(me, me, 'month_end') === 'month_end');
  assert('custom date equal to payday → custom (mode wins over date equality)', resolveTimeframeSelection(L(2026, 9, 25), me, 'custom') === 'custom');
  assert('payday that equals month end → Until payday (null target always wins)', resolveTimeframeSelection(null, me, 'payday') === 'payday');
  assert('legacy caller without mode falls back to date equality', resolveTimeframeSelection(me, me) === 'month_end' && resolveTimeframeSelection(L(2026, 9, 24), me) === 'custom');
  const d = twoIncomes('salary'); // payday 11 Sep expired on 14 Sep
  d.recurringItems.push(item('broken', 'expense', Number.NaN, iso(2026, 9, 13), 'monthly'));
  const s = computeSafeToSpend(d, TODAY);
  assert('invalid financial input keeps priority over the expired payday (unavailable_other_data)', s.paydayExpired && selectSafeToSpendHeroState(s) === 'unavailable_other_data');
  const s2 = computeSafeToSpend(twoIncomes('salary'), TODAY);
  assert('…and without the invalid input the same data is payday_expired', selectSafeToSpendHeroState(s2) === 'payday_expired');
  const u = twoIncomes(undefined); u.recurringItems.push(item('broken', 'expense', Number.NaN, iso(2026, 9, 13), 'monthly'));
  assert('invalid input also outranks the unselected Main payday', selectSafeToSpendHeroState(computeSafeToSpend(u, TODAY)) === 'unavailable_other_data');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
