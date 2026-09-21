// Pass C.2 correction and hardening — pure, real-import (Class A) tests.
//   §4 payday authority: the final AUP boundary and the C.2 guard are
//      invariant to income-confirmation order (real confirmRecurringOccurrence-
//      Transition + the real persist-pipeline step syncIncomeAggregate).
//   §3 preserved device numerics: 15/16/19 Sep before confirmations and
//      15/24/30 Sep after, exactly as the physical-iPhone recording showed.
//   §5 expired-AUP presentation: fail-closed state, every listed case.
//   §8 Debt Overview ratio: what is measured and how it displays.
//   §6/§7/§10 pure presentation helpers.
// Run with: npx tsx tests/c2-corrections.test.ts   (TZ=UTC and Australia/Melbourne)

import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend, selectSafeToSpendHeroState } from '../src/lib/calculations/safeToSpend';
import { selectSafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { selectBriefingTiles } from '../src/lib/calculations/briefingTiles';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { resolveMainPayday } from '../src/lib/calculations/incomeEngine';
import { paydayBoundaryAfter } from '../src/lib/calculations/paydayBoundary';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { selectDailyGuidePresentation, selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { computeDebtCoachSummary } from '../src/lib/calculations/debtCoach';
import { computeMonthToDateActivity } from '../src/lib/calculations/monthlySummary';
import { confirmRecurringOccurrenceTransition, syncIncomeAggregate } from '../src/state/AppStateContext';
import { resolveTimeframeSelection } from '../src/lib/calculations/timeframeFlow';
import { localDate, toISODate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem, CreditCard, Transaction } from '../src/types/models';

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
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency']): RecurringItem =>
  ({ id, type, label: id, amount, frequency, nextDueDate: due, isFixed: type === 'expense', active: true } as RecurringItem);
const TODAY = new Date(2026, 8, 14); // 14 Sep 2026, device date in the recording
const ASOF = L(2026, 9, 14);

/** The recording's data BEFORE any reminder was confirmed (§4 fixture):
 * primary Salary $5,000 fortnightly overdue 11 Sep; secondary Salary 3 $1,000
 * weekly overdue 11 Sep; rent $1,000 weekly from 14 Sep; gym $150 weekly from
 * 17 Sep; a $50 monthly bill on 30 Sep; $6,000 included. */
function beforeFixture(): AppData {
  const d = base();
  d.assets = [everyday('cba', 6000)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 11), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 11), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 14), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 17), 'weekly'),
    item('streaming', 'expense', 50, iso(2026, 9, 30), 'monthly'),
  ];
  // Pass C.2 closure — Salary is the customer's explicit Main payday (no inference).
  d.user = { ...d.user, mainPaydayIncomeId: 'salary' } as typeof d.user;
  return syncIncomeAggregate(d); // the persist pipeline derives user.nextPayday/payFrequency
}

/** Confirm one income occurrence through the REAL transition, then run the
 * REAL persist-pipeline derivation — exactly what the app does. */
function confirmIncome(data: AppData, id: string, seq: number): AppData {
  const it = data.recurringItems.find((r) => r.id === id)!;
  const r = confirmRecurringOccurrenceTransition(data, {
    recurringItemId: id,
    expectedNextDueDate: it.nextDueDate,
    targetAssetId: 'cba',
    transactionId: `tx-${id}-${seq}`,
    date: TODAY.toISOString(),
  });
  if (!r.applied) throw new Error(`confirm ${id} failed: ${r.reason}`);
  return syncIncomeAggregate(r.data);
}

function authority(data: AppData, target = L(2026, 9, 15)) {
  const primary = resolveMainPayday(data.recurringItems, data.user.mainPaydayIncomeId).source;
  const aup = computeSafeToSpend(data, TODAY);
  const guard = paydayBoundaryAfter(data.user, target);
  const guide = computeDailyGuide(data, ASOF, target);
  return {
    primaryId: primary?.id ?? null,
    nextPayday: data.user.nextPayday ? toISODate(localDate(new Date(data.user.nextPayday).getFullYear(), new Date(data.user.nextPayday).getMonth() + 1, new Date(data.user.nextPayday).getDate())) : null,
    payFrequency: data.user.payFrequency,
    aupBoundary: toISODate(localDate(aup.cycleEnd.getFullYear(), aup.cycleEnd.getMonth() + 1, aup.cycleEnd.getDate())),
    aupState: selectSafeToSpendHeroState(aup),
    aupPool: Math.round(aup.cycleRemainingPool * 100),
    guardPayday: guard.kind === 'known' ? toISODate(guard.date) : guard.kind,
    guideStatus: guide.status,
    guideCents: guide.exactCents,
  };
}

console.log('=== §3 preserved device numerics — BEFORE confirmations (14 Sep) ===');
{
  const d = beforeFixture();
  const g15 = computeDailyGuide(d, ASOF, L(2026, 9, 15));
  assert('15 Sep: estimated balance $5,000', g15.targetCents === 500000);
  assert('15 Sep: $3,700 for one day (guard 25 Sep keeps $1,300: gym 17, rent 21, gym 24)', g15.exactCents === 370000 && g15.allocationDays === 1 && toISODate(g15.guardPayday!) === '2026-09-25' && g15.obligationsAfterTargetCents === 130000);
  const g16 = computeDailyGuide(d, ASOF, L(2026, 9, 16));
  assert('16 Sep: $5,000 and $1,850 for two days', g16.targetCents === 500000 && g16.exactCents === 185000 && g16.allocationDays === 2);
  const g19 = computeDailyGuide(d, ASOF, L(2026, 9, 19));
  const r19 = computeLookAheadProjection(d, ASOF, L(2026, 9, 19));
  assert('19 Sep: estimated balance $5,850; lowest $4,850 on 17 Sep', g19.targetCents === 585000 && r19.available && r19.lowest.cents === 485000 && toISODate(r19.lowest.date) === '2026-09-17');
  assert('19 Sep: $940 for five days', g19.exactCents === 94000 && g19.allocationDays === 5);
  const a = authority(d);
  assert('before: the explicit Main payday is the fortnightly Salary; AUP boundary 11 Sep is EXPIRED', a.primaryId === 'salary' && a.payFrequency === 'fortnightly' && a.aupBoundary === '2026-09-11' && a.aupState === 'payday_expired');
}

console.log('\n=== §4 payday authority — invariant to confirmation order ===');
{
  const orderA = confirmIncome(confirmIncome(beforeFixture(), 'salary', 1), 'salary3', 2);
  const orderB = confirmIncome(confirmIncome(beforeFixture(), 'salary3', 1), 'salary', 2);
  const a = authority(orderA);
  const b = authority(orderB);
  console.log('  primary→secondary:', JSON.stringify(a));
  console.log('  secondary→primary:', JSON.stringify(b));
  assert('final primary-income identity is identical in both orders', a.primaryId === b.primaryId);
  assert('final nextPayday and pay frequency are identical in both orders', a.nextPayday === b.nextPayday && a.payFrequency === b.payFrequency);
  assert('final AUP boundary, state and value are identical in both orders', a.aupBoundary === b.aupBoundary && a.aupState === b.aupState && a.aupPool === b.aupPool);
  assert('final guard payday and daily guide are identical in both orders', a.guardPayday === b.guardPayday && a.guideStatus === b.guideStatus && a.guideCents === b.guideCents);
  // What the rule actually selects (definition 3 — earliest eligible future
  // occurrence, derived from the items' own advanced dates, never last-write):
  assert('after both confirmations the EXPLICIT Main payday (Salary, fortnightly, 25 Sep) anchors AUP and the guard — Salary 3 never takes over', a.primaryId === 'salary' && a.nextPayday === '2026-09-25' && a.payFrequency === 'fortnightly' && a.aupBoundary === '2026-09-25' && a.guardPayday === '2026-09-25' && a.aupState === 'normal');
  // Confirming only the primary now advances the boundary; the overdue
  // secondary no longer hijacks it (Pass C.2 closure).
  const mid = authority(confirmIncome(beforeFixture(), 'salary', 1));
  assert('confirming ONLY the primary: boundary 25 Sep, normal; the unconfirmed secondary cannot become the boundary', mid.primaryId === 'salary' && mid.aupBoundary === '2026-09-25' && mid.aupState === 'normal');
  // The two confirmations are not swapped by identity: each advanced its OWN item.
  const items = orderA.recurringItems;
  assert('each confirmation advanced its own source by its own cadence (Salary → 25 Sep, Salary 3 → 18 Sep)', new Date(items.find((r) => r.id === 'salary')!.nextDueDate).getDate() === 25 && new Date(items.find((r) => r.id === 'salary3')!.nextDueDate).getDate() === 18);
  assert('AUP and the C.2 guard read the SAME derived user.nextPayday (one authority)', a.aupBoundary === a.nextPayday && a.guardPayday === a.nextPayday);
}

console.log('\n=== §3 preserved device numerics — AFTER confirmations (opening $11,850) ===');
{
  const d = base();
  d.assets = [everyday('cba', 11850)];
  d.recurringItems = [
    item('salary', 'income', 5000, iso(2026, 9, 25), 'fortnightly'),
    item('salary3', 'income', 1000, iso(2026, 9, 18), 'weekly'),
    item('rent', 'expense', 1000, iso(2026, 9, 14), 'weekly'),
    item('gym', 'expense', 150, iso(2026, 9, 17), 'weekly'),
    item('streaming', 'expense', 50, iso(2026, 9, 30), 'monthly'),
  ];
  d.user = { ...d.user, mainPaydayIncomeId: 'salary3' } as typeof d.user; // the recording's anchor, now explicit
  const s = syncIncomeAggregate(d);
  const g15 = computeDailyGuide(s, ASOF, L(2026, 9, 15));
  assert('15 Sep: $10,850 and $10,700 for one day (guard 18 Sep keeps only the $150 gym)', g15.targetCents === 1085000 && g15.exactCents === 1070000 && toISODate(g15.guardPayday!) === '2026-09-18');
  const g24 = computeDailyGuide(s, ASOF, L(2026, 9, 24));
  assert('24 Sep: $10,850 + $1,000 − $1,300 = $10,550; $1,055 for ten days', g24.targetCents === 1055000 && g24.exactCents === 105500 && g24.allocationDays === 10);
  const g30 = computeDailyGuide(s, ASOF, L(2026, 9, 30));
  assert('30 Sep: $10,850 + $7,000 − $2,300 − $50 = $15,500', g30.targetCents === 1550000);
  // The end-of-window capacity is (15,500 − 150) ÷ 16 = $959.375, but the
  // guarded PREFIX bound binds earlier: on 24 Sep the path holds $10,550 after
  // 11 allocations → $959.09 exact. Both round down to the recording's $959.
  assert('30 Sep: protects the $150 gym on 1 Oct before the 2 Oct guard; exact $959.09 (binding on 24 Sep, below the $959.375 end capacity); $959 display', toISODate(g30.guardPayday!) === '2026-10-02' && g30.obligationsAfterTargetCents === 15000 && g30.exactCents === 95909 && g30.displayCents === 95900 && g30.allocationDays === 16 && toISODate(g30.limitingDate!) === '2026-09-24' && Math.floor(1535000 / 16) === 95937 && g30.exactCents <= 95937);
  assert('display never exceeds exact capacity', selectDailyGuidePresentation(g30).value === '$959');
}

console.log('\n=== §5 expired-AUP presentation (shared selector) ===');
{
  const hero = (d: AppData, today: Date) => {
    const s = computeSafeToSpend(d, today);
    return { s, p: selectSafeToSpendPresentation(s, computeMoneyHeroCopy(d)) };
  };
  const mk = (payday: string | null, freq: RecurringItem['frequency'] = 'fortnightly') => {
    const d = base();
    d.assets = [everyday('cba', 6000)];
    d.recurringItems = payday ? [item('salary', 'income', 5000, payday, freq)] : [];
    return syncIncomeAggregate(d);
  };
  const before = hero(mk(iso(2026, 9, 11)), TODAY);
  assert('payday before today → payday_expired; no amount; warning tone', before.s.paydayExpired && before.p.heroState === 'payday_expired' && !before.p.amountVisible && before.p.amountCents === null && before.p.tone === 'warning');
  assert('copy: "Income not confirmed" + "Payday expected 11 Sep. Review your income to refresh this estimate."', before.p.primaryCopy === 'Income not confirmed' && before.p.supportingCopy === 'Payday expected 11 Sep. Review your income to refresh this estimate.');
  assert('no schedule advanced, no income confirmed by computing/presenting the state', before.s.cycleEnd.getDate() === 11 && mk(iso(2026, 9, 11)).recurringItems[0].nextDueDate === iso(2026, 9, 11));
  const today = hero(mk(iso(2026, 9, 14)), TODAY);
  assert('payday today → NOT expired (normal; daily figure suppressed by daysRemaining 0)', !today.s.paydayExpired && today.p.heroState === 'normal' && today.s.daysRemaining === 0);
  const tomorrow = hero(mk(iso(2026, 9, 15)), TODAY);
  assert('payday tomorrow → normal, 1 day', !tomorrow.s.paydayExpired && tomorrow.p.heroState === 'normal' && tomorrow.s.daysRemaining === 1);
  const overdue = mk(iso(2026, 9, 11));
  assert('overdue occurrence unresolved → expired', hero(overdue, TODAY).p.heroState === 'payday_expired');
  const confirmed = confirmIncome(overdue, 'salary', 1);
  const afterConfirm = hero(confirmed, TODAY);
  assert('occurrence confirmed → boundary advances to 25 Sep → normal', afterConfirm.p.heroState === 'normal' && afterConfirm.s.cycleEnd.getDate() === 25 && !afterConfirm.s.paydayExpired);
  const none = hero(mk(null), TODAY);
  assert('missing income source → no_known_payday (not expired)', none.p.heroState === 'no_known_payday' && !none.s.paydayExpired);
  const bad = base(); bad.assets = [everyday('cba', 6000)]; bad.user = { ...bad.user, nextPayday: 'not-a-date', payFrequency: 'monthly' } as typeof bad.user;
  const badHero = hero(bad, TODAY);
  assert('invalid payday date → attributed to unavailable_other_data, never "expired"', badHero.p.heroState === 'unavailable_other_data' && !badHero.s.paydayExpired);
  const snapshot = JSON.stringify(overdue);
  hero(overdue, TODAY); selectSafeToSpendHeroState(computeSafeToSpend(overdue, TODAY));
  assert('viewing the expired state mutates nothing', JSON.stringify(overdue) === snapshot);
  // Today reads the SAME selector → the tile cannot disagree with Money.
  const tiles = selectBriefingTiles(before.p, null, []);
  assert('Today Briefing AUP tile shows "Income not confirmed" (attention), never a stale amount', tiles[0].value === 'Income not confirmed' && tiles[0].tone === 'attention' && tiles[0].accessibilityLabel.includes('Income not confirmed'));
}

console.log('\n=== §8 Debt Overview ratio — planned repayments ÷ scheduled monthly income ===');
{
  const card = (id: string, balance: number, planned: number): CreditCard => ({ id, label: id, currentBalance: balance, creditLimit: 5000, apr: 0.2, dueDay: 20, minimumPayment: planned, plannedRepayment: planned } as unknown as CreditCard);
  const withCard = (cards: CreditCard[], monthlyIncome: number) => {
    const d = base();
    d.user = { ...d.user, monthlyIncome } as typeof d.user;
    d.creditCards = cards;
    d.liabilities = cards.map((c) => ({ id: `l-${c.id}`, type: 'credit_card', label: c.label, currentBalance: c.currentBalance, creditCardId: c.id })) as AppData['liabilities'];
    return d;
  };
  const r = computeDebtCoachSummary(withCard([card('amex1', 1850, 150)], 7000));
  assert('$150 planned ÷ $7,000 = 2.142857…% → displays "2%"', r.debtToIncomeRatio !== null && Math.abs(r.debtToIncomeRatio - 150 / 7000) < 1e-12 && Math.round(r.debtToIncomeRatio * 100) === 2);
  assert('zero income → ratio null (line hidden)', computeDebtCoachSummary(withCard([card('amex1', 1850, 150)], 0)).debtToIncomeRatio === null);
  assert('zero planned repayment → ratio null', computeDebtCoachSummary(withCard([card('amex1', 1850, 0)], 7000)).debtToIncomeRatio === null);
  const multi = computeDebtCoachSummary(withCard([card('a', 1000, 100), card('b', 2000, 250)], 7000));
  assert('multiple repayments sum: ($100 + $250) ÷ $7,000 = 5%', multi.totalMonthlyRepayment === 350 && Math.round(multi.debtToIncomeRatio! * 100) === 5);
  // A RECORDED repayment transaction is not the numerator (by the existing
  // definition) — adding or deleting it leaves the planned ratio unchanged,
  // and it stays excluded from ordinary month-to-date spending.
  const d = withCard([card('amex1', 1850, 150)], 7000);
  const tx: Transaction = { id: 'rep', type: 'expense', amount: 150, date: iso(2026, 9, 14), categoryId: 'cat-other-expense', isRepayment: true, creditCardId: 'amex1', paymentSource: 'cash' } as unknown as Transaction;
  d.transactions = [tx, { id: 'inc', type: 'income', amount: 7000, date: iso(2026, 9, 1), categoryId: 'cat-salary' } as unknown as Transaction];
  const withTx = computeDebtCoachSummary(d);
  d.transactions = d.transactions.filter((t) => t.id !== 'rep');
  const withoutTx = computeDebtCoachSummary(d);
  assert('recording, then reversing/deleting, a $150 repayment transaction does not change the planned ratio', withTx.debtToIncomeRatio === withoutTx.debtToIncomeRatio && Math.round(withTx.debtToIncomeRatio! * 100) === 2);
  d.transactions = [tx, { id: 'inc', type: 'income', amount: 7000, date: iso(2026, 9, 1), categoryId: 'cat-salary' } as unknown as Transaction];
  const mtd = computeMonthToDateActivity(d, TODAY);
  assert('This Month still excludes the repayment from ordinary spending ($0 spent; $7,000 income)', mtd.spend === 0 && mtd.income === 7000);
  const nanIncome = withCard([card('amex1', 1850, 150)], Number.NaN);
  assert('invalid (NaN) income → null, never a bogus percentage', computeDebtCoachSummary(nanIncome).debtToIncomeRatio === null);
  const nanRepay = withCard([card('amex1', 1850, Number.NaN)], 7000);
  const nr = computeDebtCoachSummary(nanRepay).debtToIncomeRatio;
  assert('invalid (NaN) planned repayment → null or finite, never NaN', nr === null || Number.isFinite(nr));
}

console.log('\n=== §6 timeframe selection resolver (pure) ===');
{
  const me = L(2026, 9, 30);
  assert('null → Until payday', resolveTimeframeSelection(null, me) === 'payday');
  assert('month-end date → End of this month', resolveTimeframeSelection(L(2026, 9, 30), me) === 'month_end');
  assert('other date → custom', resolveTimeframeSelection(L(2026, 9, 24), me) === 'custom');
  assert('no month-end available → custom', resolveTimeframeSelection(L(2026, 9, 24), null) === 'custom');
}

console.log('\n=== §7/§10 presentation copy ===');
{
  const d = beforeFixture();
  const g15 = selectDailyGuidePresentation(computeDailyGuide(d, ASOF, L(2026, 9, 15)));
  assert('one-day coverage names the local date: "This guide covers 14 Sep, before your 15 Sep target."', g15.coverageLine === 'This guide covers 14 Sep, before your 15 Sep target.');
  assert('protected line names what is kept through the guard payday', g15.protectedLine === 'Keeps $1,300 for commitments due after 15 Sep through your 25 Sep payday.');
  const g24 = selectDailyGuidePresentation(computeDailyGuide(d, ASOF, L(2026, 9, 24)));
  assert('multi-day coverage names the range: "This guide covers 14 Sep to 23 Sep, before your 24 Sep target."', g24.coverageLine === 'This guide covers 14 Sep to 23 Sep, before your 24 Sep target.');
  const p16 = selectLookAheadPresentation(computeLookAheadProjection(d, ASOF, L(2026, 9, 16)));
  assert('lowest equals the estimate → no repeated amount: "No dip below your estimated balance before 16 Sep"', p16.cashFlowLine === 'No scheduled shortfall detected · No dip below your estimated balance before 16 Sep');
  const p19 = selectLookAheadPresentation(computeLookAheadProjection(d, ASOF, L(2026, 9, 19)));
  assert('lowest differs → amount and date still shown: "$4,850 on 17 Sep"', p19.cashFlowLine === 'No scheduled shortfall detected · Lowest scheduled end-of-day balance $4,850 on 17 Sep');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
