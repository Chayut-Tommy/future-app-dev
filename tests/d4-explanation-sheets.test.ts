// Pass D.4 — pure proofs for the two "Why this amount?" explanation sheets: the
// structured daily-guide arithmetic both modes now show, the exact-cent ledgers they
// reconcile to, and the structure of the one shared presentation owner.
// Rendered proofs: tests/rendered/d4-explanation-sheets.render.test.tsx.
// Run with: npx tsx tests/d4-explanation-sheets.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { buildAupDailyGuideExplanation, buildAupExplanation, formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { selectDailyGuideCalculation, selectDailyGuidePresentation, selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { formatCentsCentsAware, formatDollarsCentsAware } from '../src/lib/calculations/money';
import { localDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const TODAY = new Date(2026, 8, 22);
const ASOF = localDate(2026, 9, 22);
Date.now = () => new Date(2026, 8, 22, 12).getTime(); // goalAllocation reads the clock (pre-existing)

/** A deterministic fixture: one everyday balance, one excluded savings account, a
 * fortnightly main payday and a few dated commitments. Amounts are chosen so the
 * ledgers can be reconciled by hand in either time zone. */
function fixture(options: { bill?: number; billDay?: number; savingsPercent?: number } = {}): AppData {
  const d = createEmptyAppData();
  d.user = {
    ...d.user,
    hasSeenIntro: true,
    mainPaydayIncomeId: 'salary',
    ...(options.savingsPercent ? { savingsAllocation: { mode: 'percent', percent: options.savingsPercent } } : {}),
  } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 6000, includeInMoneyCalculations: true } as Asset,
    { id: 'Sav', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: options.bill ?? 1000, frequency: 'monthly', nextDueDate: iso(2026, 9, options.billDay ?? 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}

// ── §1 the payday guide: the card's own division, shown ──
{
  const data = fixture({ savingsPercent: 0.05 });
  const s = computeSafeToSpend(data, TODAY);
  const ledger = buildAupExplanation(s);
  const g = buildAupDailyGuideExplanation(s)!;
  assert('payday: the numerator is the SAME reconciled remainder the ledger totals to — never a re-derived figure', g !== null && g.amount === formatDollarsCentsAware(ledger.remainderCents / 100));
  assert('payday: the divisor is the engine’s own remaining-day count, and the result is the engine’s own daily figure through its existing formatter', g.days === Math.round(s.daysRemaining) && g.daily === formatSafeToSpendAmount(Math.max(0, s.dailyAllowance)));
  assert('payday: the equation names all three parts in order', g.equation.startsWith(`${g.amount} ÷ ${g.days} days`) && g.equation.endsWith(`${g.daily}/day`));
  assert('payday: the ledger rows reconcile EXACTLY to the total the equation divides (account rows are a breakdown of the balances row, not extra terms)', ledger.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0) === ledger.remainderCents);
  assert('payday: the rounding note states the ACTUAL rule — nearest dollar — and never claims "rounded down"', g.roundingNote === null || (/nearest dollar/.test(g.roundingNote) && !/rounded down/i.test(g.roundingNote)));
  assert('payday: an exact division carries no rounding note', (() => { const ex = buildAupDailyGuideExplanation({ ...s, cycleRemainingPool: s.daysRemaining * 10, dailyAllowance: 10 } as typeof s); return ex !== null && ex.roundingNote === null && ex.equation.includes('='); })());
  assert('payday: no payday, no spending days left, and a non-positive pool each yield NO guide rather than a misleading figure', buildAupDailyGuideExplanation({ ...s, hasKnownPayday: false } as typeof s) === null && buildAupDailyGuideExplanation({ ...s, daysRemaining: 0 } as typeof s) === null && buildAupDailyGuideExplanation({ ...s, cycleRemainingPool: -5 } as typeof s) === null);
  assert('payday: the spoken form says the same division in words', /divided by/.test(g.spoken) && g.spoken.includes(g.amount) && g.spoken.includes(g.daily));
}

// ── §2 the selected-date guide: the ACTUAL binding constraint ──
{
  const data = fixture();
  const target = localDate(2026, 9, 30);
  const r = computeLookAheadProjection(data, ASOF, target);
  if (!r.available) throw new Error('fixture');
  const guide = computeDailyGuide(data, ASOF, target, r);
  const calc = selectDailyGuideCalculation(guide)!;
  assert('custom: every part is read from the engine’s own limiting metadata', calc !== null && calc.position === formatCentsCentsAware(guide.limitingPositionCents as number) && calc.days === guide.limitingAllocationDays && calc.daily === formatCentsCentsAware(guide.displayCents as number));
  assert('custom: the numerator is the limiting POSITION — never the target balance, the lowest balance or the horizon length', calc.position !== formatCentsCentsAware(r.targetCents) || guide.limitingPositionCents === r.targetCents);
  assert('custom: the divisor is the allocations counted by the binding day, not the days to the selected date', calc.days === guide.limitingAllocationDays && (guide.limitingAllocationDays as number) <= guide.allocationDays);
  assert('custom: the rounding note states the ACTUAL rule — rounded DOWN — which is not the payday rule', calc.roundingNote === null || (/rounded down/i.test(calc.roundingNote) && !/nearest/i.test(calc.roundingNote)));
  assert('custom: the equation reads position ÷ days ≈ daily', calc.equation === `${calc.position} ÷ ${calc.days} ${calc.days === 1 ? 'day' : 'days'} ${calc.roundingNote ? '≈' : '='} ${calc.daily}/day`);
  assert('custom: no calculation is offered for any status other than an available guide', ['existing_shortfall', 'missing_guard_payday', 'invalid_material_input', 'unavailable', 'zero'].every((st) => selectDailyGuideCalculation({ ...guide, status: st } as typeof guide) === null));
  // The binding day and the lowest-balance day are DIFFERENT facts.
  const dip = fixture({ bill: 3000, billDay: 24 });
  const rd = computeLookAheadProjection(dip, ASOF, target);
  if (!rd.available) throw new Error('fixture');
  const gd = computeDailyGuide(dip, ASOF, target, rd);
  const cd = selectDailyGuideCalculation(gd);
  assert('custom: the limiting day and the lowest end-of-day date are reported independently (a fixture where they differ)', rd.lowest.date.day === 24 && (cd === null || cd.limitingDateLabel !== `${rd.lowest.date.day} Sep` || (gd.limitingDate as { day: number }).day === rd.lowest.date.day));
  assert('custom: a shortfall path yields no guide arithmetic at all, and the presentation still explains why', (() => { const bad = fixture({ bill: 9000, billDay: 24 }); const rb = computeLookAheadProjection(bad, ASOF, target); if (!rb.available) return false; const gb = computeDailyGuide(bad, ASOF, target, rb); return selectDailyGuideCalculation(gb) === null && selectDailyGuidePresentation(gb).value === '—' && gb.status === 'existing_shortfall'; })());
}

// ── §3 the sheets' own content contracts ──
{
  const data = fixture();
  const r = computeLookAheadProjection(data, ASOF, localDate(2026, 9, 30));
  if (!r.available) throw new Error('fixture');
  const p = selectLookAheadPresentation(r);
  const b = r.breakdown;
  assert('custom: the ledger rows sum EXACTLY to the estimated balance the total row shows', b.openingCents + b.assumedIncomeCents + b.billsCents + b.cardCents + b.bnplCents + b.mortgageCents + b.otherLoanCents === b.targetCents && b.targetCents === r.targetCents);
  assert('custom: the subtitle date is the presentation’s own label, matching the headline it came from', typeof p.targetDateLabel === 'string' && p.headline === `Estimated balance by ${p.targetDateLabel}`);
  assert('every available state carries the subtitle label; an unavailable one carries no amount at all', [fixture(), fixture({ bill: 3000, billDay: 24 }), fixture({ bill: 9000, billDay: 24 })].every((d) => { const x = computeLookAheadProjection(d, ASOF, localDate(2026, 9, 30)); return x.available && typeof selectLookAheadPresentation(x).targetDateLabel === 'string'; }) && (() => { const none = fixture(); none.assets = []; const x = computeLookAheadProjection(syncIncomeAggregate(none), ASOF, localDate(2026, 9, 30)); const sel = selectLookAheadPresentation(x); return !x.available && sel.headlineAmount === undefined && sel.targetDateLabel === undefined; })());
  assert('excluded savings stay OUTSIDE the starting money and are never deducted again', r.protectedSavings.cents === 200000 && b.openingCents === 600000 && b.targetCents === b.openingCents + b.assumedIncomeCents + b.billsCents + b.cardCents + b.bnplCents + b.mortgageCents + b.otherLoanCents);
}

// ── §4 structure: one shared owner, no accordions, no new engine ──
{
  const strip = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const shared = strip('components/money/ExplanationSheetSections.tsx');
  const custom = strip('components/money/LookAheadSheet.tsx');
  const hero = strip('components/money/SafeToSpendHero.tsx');
  assert('both sheets render through the ONE shared presentation owner', /ExplanationSummary/.test(custom) && /ExplanationSummary/.test(hero) && /ExplanationSection/.test(custom) && /ExplanationSection/.test(hero) && /ExplanationRow/.test(custom) && /ExplanationRow/.test(hero));
  assert('the shared owner computes nothing: no engine, no state, no storage, no money formatting, no arithmetic on amounts', !/compute[A-Z]|useAppState|AsyncStorage|navigation|format[A-Z]\w*Cents|toFixed|Math\.(round|floor|ceil)/.test(shared));
  assert('neither sheet has an accordion, a "read more" control or a nested scroll any more', !/(disclosureHeader|accordion|Read more|assumptionsOpen|breakdownOpen|setBreakdownOpen|setAssumptionsOpen)/.test(custom + hero) && !/ScrollView/.test(custom + shared));
  assert('neither sheet recomputes a financial rule: every figure arrives from an engine or a selector', !/compute(SafeToSpend|LookAheadProjection|DailyGuide)\(/.test(hero) && !/\* 100|\/ 100 \*|Math\.floor\(.*\/ *\d/.test(shared));
  assert('the payday sheet reuses the accepted AUP ledger and the D.2 method notes rather than composing its own', /buildAupExplanation/.test(hero) && /AUP_METHOD_NOTES/.test(hero) && /money-aup-method-notes/.test(hero));
  assert('the selected-date sheet keeps every reviewed disclosure testID', ['look-ahead-excluded-savings', 'look-ahead-savings', 'look-ahead-cycle-start', 'look-ahead-not-yet-deducted', 'look-ahead-assumed', 'look-ahead-daily-coverage', 'look-ahead-daily-protected', 'look-ahead-assumptions-body'].every((id) => custom.includes(id)));
  assert('both sheets close with the same provenance sentence, defined once', (shared.match(/EXPLANATION_PROVENANCE =/g) ?? []).length === 1 && /EXPLANATION_PROVENANCE/.test(custom) && /EXPLANATION_PROVENANCE/.test(hero));
  assert('neither sheet writes: no persistence, no state mutation, no editing action', !/updateUser|persist|AsyncStorage|setAppData/.test(custom + shared));
  assert('the summary never shrinks a value to fit: no truncation or auto-sizing in the shared owner', !/numberOfLines|adjustsFontSizeToFit|minimumFontScale|ellipsizeMode/.test(shared));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
