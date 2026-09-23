// Pass D.3 — pure proofs for the final interaction and financial-presentation
// corrections (F1–F7), the §9 financial reconciliation (no rule changed) and the
// structure of the shared owners. Rendered proofs: tests/rendered/d3-corrections.render.test.tsx.
// Run with: npx tsx tests/d3-corrections.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { computeSafeToSpend, selectSafeToSpendHeroState } from '../src/lib/calculations/safeToSpend';
import { computeGoalAllocation } from '../src/lib/calculations/goalAllocation';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { buildAupRail } from '../src/lib/calculations/timelineMarkers';
import { AUP_EXPECTED_INCOME_STATUS, AUP_INCLUDED_STATUS, AUP_PAYDAY_STATUS, buildAupRailGroups, describeAupHitTarget, describeHitTarget, resolveHitTargets } from '../src/lib/calculations/balancePathInteraction';
import { buildBalancePath } from '../src/lib/calculations/balancePath';
import { VIEW_UPCOMING_EVENTS_SUBTITLE } from '../src/lib/calculations/moneyComposition';
import { fromMonthlyAmount } from '../src/lib/calculations/incomeEngine';
import { localDate, localDateFromDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem } from '../src/types/models';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const TODAY = new Date(2026, 8, 22);
const ASOF = localDate(2026, 9, 22);
Date.now = () => new Date(2026, 8, 22, 12).getTime(); // goalAllocation reads the clock (pre-existing)

/** The 22 Sep device shape: four incomes, weekly rent and gym, BNPL, a card, a goal; optionally the "Car test" bill. */
function fixture(car: number | null = null): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary', savingsAllocation: { mode: 'percent', percent: 0.05 } } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 8650, includeInMoneyCalculations: true } as Asset, { id: 'Sav', type: 'savings', label: 'Savings', currentValue: 7500, includeInMoneyCalculations: false } as Asset];
  d.liabilities = [
    { id: 'zip', type: 'bnpl', label: 'Zip pay', currentBalance: 280 } as Liability,
    { id: 'home', type: 'mortgage', label: 'Richmond', currentBalance: 497000 } as Liability,
    { id: 'loan', type: 'personal_loan', label: 'Personal test', currentBalance: 12000 } as Liability,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true },
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true },
    { id: 'dividends', type: 'income', label: 'Dividends', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true },
    { id: 'interest', type: 'income', label: 'Bank interest', amount: 250, frequency: 'weekly', nextDueDate: iso(2026, 9, 23), isFixed: false, active: true },
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1500, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' },
    { id: 'gym', type: 'expense', label: 'Gym', amount: 250, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-health' },
    // BNPL-linked schedules are isFixed: false by convention (safeToSpend.ts counts BNPL through its own window, never as a bill).
    { id: 'zip-bill', type: 'expense', label: 'Zip pay repayment', amount: 70, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 25), isFixed: false, active: true, linkedLiabilityId: 'zip' },
    { id: 'insurance', type: 'expense', label: 'Insurance', amount: 300, frequency: 'monthly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, categoryId: 'cat-insurance' },
    { id: 'internet', type: 'expense', label: 'Internet', amount: 50, frequency: 'weekly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, categoryId: 'cat-utilities' },
    { id: 'phone', type: 'expense', label: 'Phone', amount: 250, frequency: 'monthly', nextDueDate: iso(2026, 10, 10), isFixed: true, active: true, categoryId: 'cat-utilities' },
    { id: 'mortgage-bill', type: 'expense', label: 'Richmond repayment', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 10, 20), isFixed: true, active: true, linkedLiabilityId: 'home' },
    { id: 'loan-bill', type: 'expense', label: 'Personal test repayment', amount: 1500, frequency: 'monthly', nextDueDate: iso(2026, 10, 15), isFixed: true, active: true, linkedLiabilityId: 'loan' },
    ...(car ? [{ id: 'car', type: 'expense', label: 'Car test', amount: car, frequency: 'monthly', nextDueDate: iso(2026, 9, 27), isFixed: true, active: true, categoryId: 'cat-transport' }] : []),
  ] as RecurringItem[];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30, expectedMonthlyRepayment: 50 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: iso(2029, 9, 1), status: 'active', priority: 'medium' } as unknown as Goal];
  return syncIncomeAggregate(d);
}
const cents = (n: number) => Math.round(n * 100);

// ── F1 — the signed headline ──
{
  const present = (opening: number, bill: number, day = 25) => {
    const d = createEmptyAppData();
    d.user = { ...d.user, hasSeenIntro: true } as typeof d.user;
    d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: opening, includeInMoneyCalculations: true } as Asset];
    d.recurringItems = [{ id: 'b', type: 'expense', label: 'Bill', amount: bill, frequency: 'monthly', nextDueDate: iso(2026, 9, day), isFixed: true, active: true } as RecurringItem];
    return selectLookAheadPresentation(computeLookAheadProjection(syncIncomeAggregate(d), ASOF, localDate(2026, 9, 30)));
  };
  const pos = present(1200, 500); const zero = present(1000, 1000); const neg = present(1000, 1500); const cent = present(1000, 1000.01);
  assert('F1: positive → "$700.00", spoken as itself', pos.headlineAmount === '$700.00' && pos.headlineAmountSpoken === '$700.00');
  assert('F1: zero → "$0.00" (not a deficit, not negative)', zero.headlineAmount === '$0.00' && zero.state === 'positive_no_shortfall');
  assert('F1: negative → "-$500.00", spoken "minus $500.00", state below_zero', neg.headlineAmount === '-$500.00' && neg.headlineAmountSpoken === 'minus $500.00' && neg.state === 'below_zero');
  assert('F1: one cent negative → "-$0.01"', cent.headlineAmount === '-$0.01' && cent.headlineAmountSpoken === 'minus $0.01');
  assert('F1: the target deficit and the first-shortfall amount stay distinct fields', neg.deficitLine === 'Your scheduled commitments may be about $500.00 more than your cash by 30 Sep 2026' && neg.cashFlowStatus?.title === 'Possible shortfall of $500 on 25 Sep' && neg.cashFlowLine === 'Possible shortfall of $500 on 25 Sep');
  // The recorded fixture: 8,650 + 17,250 − 23,050 − 50 − 210 − 3,000 − 1,500 = −1,910.
  const r = computeLookAheadProjection(fixture(15000), ASOF, localDate(2026, 10, 25));
  // 8,650 + 17,250 − 23,050 − 50 − 210 − 3,000 − 1,500 = −1,910; first shortfall 27 Sep:
  // 8,650 + 250 − 250 − 300 − 70 − 50 + 1,000 − 15,000 = −5,770.
  const pr = selectLookAheadPresentation(r);
  assert('F1: the recorded fixture reconciles to the cent: 25 Oct = −$1,910.00, first shortfall $5,770 on 27 Sep, headline signed, spoken as minus', r.available && r.targetCents === -191000 && r.firstShortfall?.shortfallCents === 577000 && r.firstShortfall.date.day === 27 && pr.headlineAmount === '-$1,910.00' && pr.headlineAmountSpoken === 'minus $1,910.00' && pr.deficitLine === 'Your scheduled commitments may be about $1,910.00 more than your cash by 25 Oct 2026');
  const r30 = computeLookAheadProjection(fixture(), ASOF, localDate(2026, 9, 30));
  assert('F1/§9: the same fixture without the bill gives the recorded 30 Sep shape: $10,930 and lowest $7,730 on 28 Sep', r30.available && r30.targetCents === 1093000 && r30.lowest.cents === 773000 && r30.lowest.date.day === 28);
}

// ── F2 — Change date survives a negative AUP ──
{
  const s = computeSafeToSpend(fixture(15000), TODAY);
  assert('F2: the recorded shape is the commitments_exceed_cash warning with a KNOWN payday', selectSafeToSpendHeroState(s) === 'commitments_exceed_cash' && s.hasKnownPayday);
  const hero = readFileSync(join(__dirname, '../src/components/money/SafeToSpendHero.tsx'), 'utf8');
  assert('F2: both shortfall states pass the date control into the shared shell; the setup/invalid states still do not', /'money-aup-hero-commitments'[^}]*dateControl \}/.test(hero) && /'money-aup-hero-overspend'[^}]*dateControl \}/.test(hero) && !/'money-aup-hero-unavailable-balance'[^}]*dateControl/.test(hero) && !/'money-aup-hero-no-balances'[^}]*dateControl/.test(hero));
  assert('F2: the control is gated on a known payday, not on a visible amount', /safeToSpend\.hasKnownPayday && onOpenTimeframe \? \(/.test(hero) && !/amountVisible && onOpenTimeframe \? \(/.test(hero));
}

// ── F4 — pay-cycle markers carry their canonical events; the detail invents no balance ──
{
  const data = fixture();
  const s = computeSafeToSpend(data, TODAY);
  const payday = localDateFromDate(s.cycleEnd);
  const expected = computeProjectedEvents(data, ASOF, payday, { windowStart: ASOF }).events.filter((e) => e.sourceKind === 'income');
  const rail = buildAupRail(s, ASOF, expected)!;
  const bills = rail.markers.filter((m) => m.kind === 'bill');
  assert('F4: every bill marker carries the SAME occurrences AUP deducted, by identity, and their sum is the marker amount', bills.length > 0 && bills.every((m) => (m.events?.length ?? 0) === m.count && m.events!.every((e) => e.included && e.signedCents < 0 && s.datedDeductions.some((d) => (d.occurrenceId ?? `aup:${d.kind}:${d.sourceId}:`) === e.occurrenceId || d.sourceId === e.sourceId)) && cents(m.signedAmount ?? 0) === m.events!.reduce((n, e) => n + e.signedCents, 0)));
  const inc = rail.markers.filter((m) => m.kind === 'expected_income');
  assert('F4: expected-income markers carry the canonical A3 occurrences, marked NOT included', inc.length > 0 && inc.every((m) => m.events!.every((e) => !e.included && e.signedCents > 0 && expected.some((x) => x.occurrenceId === e.occurrenceId))));
  const endpoint = rail.markers.find((m) => m.kind === 'payday_endpoint')!;
  assert('F4: income ON the payday (Salary boq, 5 Oct) is carried by the endpoint, still not included', (endpoint.events?.length ?? 0) === 1 && endpoint.events![0].sourceId === 'salary' && endpoint.events![0].included === false);
  const groups = buildAupRailGroups(rail);
  assert('F4: only markers with a real event become groups; a decorative endpoint would not', groups.length === rail.markers.filter((m) => (m.events?.length ?? 0) > 0).length && groups.every((g) => g.events.length > 0 && g.hasShortfall === false));
  const noPaydayIncome = buildAupRail(s, ASOF, expected.filter((e) => e.sourceId !== 'salary'))!;
  assert('F4: without an income on the payday the endpoint has no event and is NOT a target', buildAupRailGroups(noPaydayIncome).every((g) => g.kind !== 'payday_endpoint'));
  const targets = resolveHitTargets({ markers: groups }, 320);
  assert('F4: the same slot rule serves the pay-cycle rail: ≥44pt, chronological, non-overlapping', targets.length > 0 && targets.every((t) => t.width >= 44) && targets.every((t, i) => i === 0 || t.left >= targets[i - 1].left + targets[i - 1].width - 0.01));
  // A slot may hold a collision group (e.g. an income and a bill two days apart), so every
  // section is checked against the KIND of the group it describes.
  const all = targets.map((t) => ({ t, ins: describeAupHitTarget(t) }));
  const sectionsOf = (kind: string) => all.flatMap(({ t, ins }) => ins.sections.filter((sec) => t.groups.find((g) => g.key === sec.key)?.kind === kind));
  const billSections = sectionsOf('bill'); const incSections = sectionsOf('expected_income'); const paydaySections = sectionsOf('payday_endpoint');
  assert('F4: a bill detail lists name, date, signed amount, type and the inclusion status — and NO balance line', billSections.length > 0 && all.every(({ ins }) => ins.sections.every((sec) => sec.balanceLine === null && sec.shortfallLine === null)) && billSections.every((sec) => sec.rows.every((r) => r.statusLabel === AUP_INCLUDED_STATUS && /^-\$/.test(r.amount) && r.dateLabel.length > 0 && r.typeLabel.length > 0)));
  assert('F4: an expected-income detail says it is not included; the payday endpoint says the same in its own words', incSections.length > 0 && incSections.every((sec) => sec.rows.every((r) => r.statusLabel === AUP_EXPECTED_INCOME_STATUS && /^\+\$/.test(r.amount))) && paydaySections.length === 1 && paydaySections[0].rows[0].statusLabel === AUP_PAYDAY_STATUS);
  const incTarget = all.find(({ t }) => t.groups.some((g) => g.kind === 'expected_income'))!;
  assert('F4: the spoken target label and announcement carry the status, so the exclusion is never colour-only', /not included in Available until payday/.test(incTarget.ins.targetLabel) && all.every(({ ins }) => /^Showing /.test(ins.announcement)));
  const visibleText = all.flatMap(({ ins }) => [ins.title, ins.targetLabel, ...ins.sections.flatMap((sec) => [sec.heading, sec.netLine ?? '', ...sec.rows.flatMap((r) => [r.label, r.amount, r.typeLabel, r.statusLabel ?? ''])])]).join('\n');
  assert('F4: no running balance, lowest point, shortfall or daily figure appears in any pay-cycle detail', !/balance|lowest|shortfall|per day/i.test(visibleText));
  // The selected-date rail is untouched by the generic slot rule.
  const r = computeLookAheadProjection(data, ASOF, localDate(2026, 9, 30));
  if (!r.available) throw new Error('fixture');
  const path = buildBalancePath(r, computeProjectedEvents(data, ASOF, localDate(2026, 9, 30), { windowStart: ASOF }).events, { cycleStart: localDateFromDate(s.cycleStart) });
  const scenarioTargets = resolveHitTargets(path, 320);
  assert('F4: selected-date details still carry the Pass B end-of-day balance', scenarioTargets.length > 0 && describeHitTarget(scenarioTargets[0], path).sections.every((sec) => /^End-of-(day|week) balance: \$/.test(sec.balanceLine ?? '')));
}

// ── F6 / F7 — honest copy ──
{
  const src = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8');
  assert('F6: one honest subtitle for the unfiltered destination, no date bound in either mode', VIEW_UPCOMING_EVENTS_SUBTITLE === 'See upcoming income, bills and repayments' && !/upcomingEventsSubtitle|coming up before|scheduled through/.test(src('components/money/SafeToSpendHero.tsx') + src('components/money/ScenarioPositionCard.tsx') + src('lib/calculations/moneyComposition.ts')));
  assert('F7: the retired graph wording is gone from every source file; the methodology is kept', !/Estimated balance path and its markers/.test(src('components/money/LookAheadSheet.tsx')) && /The timeline and its markers show dated events only; planned savings and goals aren’t shown on it\./.test(src('components/money/LookAheadSheet.tsx')));
}

// ── §9 — financial reconciliation WITHOUT a rule change ──
{
  const before = fixture(); const after = fixture(15000);
  const sB = computeSafeToSpend(before, TODAY); const sA = computeSafeToSpend(after, TODAY);
  const availB = before.user.monthlyIncome - sB.fixedExpensesMonthly - sB.bnplMonthlyExpected;
  const availA = after.user.monthlyIncome - sA.fixedExpensesMonthly - sA.bnplMonthlyExpected;
  assert('§9.1 the goal reservation is funded ONLY from monthly income left after fixed costs and BNPL (computeGoalAllocation over max(0, availableForGoals)) — with the $15,000 bill that pool is negative, so the goal gets $0 and its cycle reservation disappears', availB > 0 && availA < 0 && sB.goalContributionsMonthly > 0 && sA.goalContributionsMonthly === 0 && sB.cycleGoalsReserved > 0 && sA.cycleGoalsReserved === 0 && computeGoalAllocation(after, availA).totalAllocatedMonthly === 0);
  const simple = sB.cycleRemainingPool - 15000;
  assert('§9.1 the shortfall is therefore the simple subtraction PLUS the released goal reservation (the recorded 11,383.43 − 64.81 = 11,318.62 ≈ $11,319 is this same mechanism)', Math.abs(sA.cycleRemainingPool - (simple + sB.cycleGoalsReserved)) < 0.005 && sA.cycleRemainingPool > simple);
  assert('§9.2 the accepted rule removes the reservation in that state — it is the existing floor, not a new rule (goalAllocation.ts: remainingBudget = max(0, availableForGoals))', /Math\.max\(0, availableForGoals\)/.test(readFileSync(join(__dirname, '../src/lib/calculations/goalAllocation.ts'), 'utf8')));
  assert('§9.3 Typical Money Flow "Goals" is fromMonthlyAmount(goalContributionsMonthly) — the same collapsed figure — so it reads $0 in that state ($139 before)', Math.round(fromMonthlyAmount(sB.goalContributionsMonthly, 'monthly')) === 140 && fromMonthlyAmount(sA.goalContributionsMonthly, 'monthly') === 0);
  // §9.4 — the daily guide is the tightest-day rule: min over days d of floor(cash(d) ÷ k(d)); never target ÷ N.
  const target = localDate(2026, 9, 30);
  const r = computeLookAheadProjection(before, ASOF, target); if (!r.available) throw new Error('fixture');
  const g = computeDailyGuide(before, ASOF, target, r);
  assert('§9.4 About per day = floor(limiting position ÷ its allocation days), read from the engine’s own limiting-day fields (30 Sep: the recorded 7,730 ÷ 8 → 966 is this rule)', g.status === 'available' && g.limitingPositionCents !== null && g.limitingAllocationDays !== null && g.displayCents === Math.floor(Math.floor(g.limitingPositionCents / g.limitingAllocationDays) / 100) * 100 && g.displayCents !== Math.floor(r.targetCents / g.allocationDays / 100) * 100);
  // Positive ending after an interim shortfall (the $10,000 variant): guidance must stay withheld.
  const mid = fixture(10000);
  const rm = computeLookAheadProjection(mid, ASOF, localDate(2026, 10, 25)); if (!rm.available) throw new Error('fixture');
  const gm = computeDailyGuide(mid, ASOF, localDate(2026, 10, 25), rm);
  assert('§11 a positive ending after an earlier shortfall receives NO daily-spend guidance (existing rule preserved)', rm.targetCents > 0 && rm.firstShortfall !== null && gm.status === 'existing_shortfall' && selectLookAheadPresentation(rm).state === 'positive_after_shortfall');
}

// ── structure: the shared owners, no stacking tricks, no legacy type in the journey ──
{
  const strip = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const rail = strip('components/money/FutureTimelineRail.tsx'); const bar = strip('components/money/MoneyPaydayBar.tsx');
  const detail = strip('components/money/TimelineEventDetail.tsx'); const targets = strip('components/money/TimelineHitTargets.tsx'); const hook = strip('hooks/useTimelineSelection.ts');
  assert('F4: both rails share ONE selection owner, ONE press layer and ONE detail surface', [rail, bar].every((f) => /useTimelineSelection\(/.test(f) && /<TimelineHitTargets/.test(f) && /<TimelineEventDetail/.test(f)) && !/TouchableOpacity|Pressable/.test(rail) && !/TouchableOpacity|Pressable/.test(bar));
  assert('F4: the pay-cycle bar keeps its own track (glyphs and blue line unchanged) and reads no future-mode option', /<TimelineMarkerTrack rail=\{rail\}/.test(bar) && !/remainderColor|showTodayTick|clusters=/.test(bar));
  assert('F4: the pay-cycle bar offers NO review action (read-only parity) and never computes', !/resolveReview|onReviewSource/.test(bar) && !/compute[A-Z]|useAppState|AsyncStorage/.test(bar + detail + targets + hook));
  assert('F5: the reveal is anchored to the measured band and fires once per opened selection in BOTH rails', [rail, bar].every((f) => /anchorY: by/.test(f) && /revealedKey\.current === selectedKey\) return;/.test(f)) && /anchorY: frame\.anchorY/.test(strip('screens/money/MoneyScreen.tsx')));
  assert('F5: the rows between the band and the detail are subtracted from the host bound', [rail, bar].every((f) => /detailMaxHeight - betweenBandAndDetail - detailChrome/.test(f)));
  const sheet = strip('components/shared/OptionsSheet.tsx');
  assert('F3: the sheet exits once — sheet and scrim leave together on the named token, then the host hides the Modal without a second animation', /Animated\.parallel\(/.test(sheet) && /MOTION_MS\.sheetInfoOut/.test(sheet) && /backdropOpacity, \{ toValue: 0/.test(sheet) && /animationType=\{reduceMotion \|\| \(exitingRef\.current && !visible\) \? 'none' : 'slide'\}/.test(sheet) && /function finishDismiss\(\) \{\s*exitingRef\.current = true;\s*onClose\(\);/.test(sheet) && !/useState/.test(sheet));
  assert('F3: no arbitrary timeout was added and the freeze guard is intact', (sheet.match(/setTimeout\(/g) ?? []).length === 1 && /onDismiss=\{Platform\.OS === 'ios' \? runCompletion : undefined\}/.test(sheet));
  assert('F3: app-owned text in the journey uses the Design 5.1 roles, never the legacy tokens', ['components/shared/OptionsSheet.tsx', 'components/shared/EditorCompletionStatus.tsx', 'components/income/AddIncomeModal.tsx', 'components/wealth/MoneyEngineCard.tsx'].every((f) => !/\.\.\.typography\./.test(strip(f))));
  assert('F3: locally overridden weights declare the matching family', !/typeStyle\('(support|meta)', locale\), fontWeight: '600', color/.test(sheet));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
