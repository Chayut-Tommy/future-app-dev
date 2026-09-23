// Pass D.2 — pure proofs for the Money card's lower hierarchy: mode-correct copy,
// the structured cash-path status (every Pass B branch), and that this pass touched
// NO financial owner. Rendered proofs: tests/rendered/d2-card-hierarchy.render.test.tsx.
// Run with: npx tsx tests/d2-card-hierarchy.test.ts (TZ=UTC and Australia/Melbourne)

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { NO_SHORTFALL_DETECTED, selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { AUP_METHOD_NOTES, ESTIMATED_CYCLE_START_LABEL, MONEY_MEASURE_DEFINITIONS, VIEW_UPCOMING_EVENTS_SUBTITLE, VIEW_UPCOMING_EVENTS_TITLE, WHY_THIS_AMOUNT_SUBTITLE, WHY_THIS_AMOUNT_TITLE } from '../src/lib/calculations/moneyComposition';
import { localDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const ASOF = localDate(2026, 9, 21);
const TARGET = localDate(2026, 9, 30);

function fixture(opening: number, bill: { amount: number; day: number }, incomeDay = 25): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: opening, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2500, frequency: 'monthly', nextDueDate: iso(2026, 9, incomeDay), isFixed: false, active: true } as RecurringItem,
    { id: 'power', type: 'expense', label: 'Power', amount: bill.amount, frequency: 'monthly', nextDueDate: iso(2026, 9, bill.day), isFixed: true, active: true } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}
const present = (d: AppData) => selectLookAheadPresentation(computeLookAheadProjection(d, ASOF, TARGET));

// ── §1 mode-correct copy ──
// Pass D.3 (F6) — "View upcoming events" opens the EXISTING unfiltered list, so its
// subtitle names that destination and promises no date bound in either mode.
assert('the events row names its unfiltered destination and never claims a date bound', VIEW_UPCOMING_EVENTS_SUBTITLE === 'See upcoming income, bills and repayments' && !/before|through|\d/.test(VIEW_UPCOMING_EVENTS_SUBTITLE));
assert('titles and the breakdown subtitle are exact', VIEW_UPCOMING_EVENTS_TITLE === 'View upcoming events' && WHY_THIS_AMOUNT_TITLE === 'Why this amount?' && WHY_THIS_AMOUNT_SUBTITLE === 'A quick breakdown');
assert('an inferred cycle start is never presented as a recorded fact', ESTIMATED_CYCLE_START_LABEL === 'Estimated cycle start');
assert('the relocated payday methodology is complete: cycle start, what is not included, marker scope', ['cycle-start', 'not-included', 'markers'].every((k) => AUP_METHOD_NOTES.some((n) => n.key === k)) && /estimated/.test(AUP_METHOD_NOTES[0].text) && /aren’t included in this amount/.test(AUP_METHOD_NOTES[1].text) && /dated events only/.test(AUP_METHOD_NOTES[2].text) && /still due by payday/.test(MONEY_MEASURE_DEFINITIONS.availableUntilPayday));

// ── §2 the structured status: every Pass B branch, amounts and dates from the engine ──
const healthy = present(fixture(1200, { amount: 500, day: 23 }));
assert('healthy: title is the accepted cautious wording; the detail carries the ENGINE\'s lowest amount and date', healthy.state === 'positive_no_shortfall' && healthy.cashFlowStatus?.tone === 'healthy' && healthy.cashFlowStatus.title === NO_SHORTFALL_DETECTED && healthy.cashFlowStatus.detail === 'Lowest scheduled end-of-day balance: $700 on 23 Sep');
assert('healthy: the status is the two halves of the existing line — no new claim', healthy.cashFlowLine === `${NO_SHORTFALL_DETECTED} · Lowest scheduled end-of-day balance $700 on 23 Sep` && !/stays above|guarantee|safe/i.test(`${healthy.cashFlowStatus?.title} ${healthy.cashFlowStatus?.detail}`));
assert('healthy path whose lowest point IS the estimate: the detail says so instead of repeating the amount', (() => { const d = fixture(1200, { amount: 500, day: 23 }); d.recurringItems = d.recurringItems.filter((r) => r.id !== 'salary'); const p = present(syncIncomeAggregate({ ...d, user: { ...d.user, mainPaydayIncomeId: undefined } as typeof d.user })); return p.cashFlowStatus?.tone === 'healthy' && p.cashFlowStatus.detail === 'No dip below your estimated balance before 30 Sep'; })());
const temporary = present(fixture(1200, { amount: 1500, day: 23 }));
assert('temporary shortfall: caution, exact $300 on 23 Sep, never healthy', temporary.state === 'positive_after_shortfall' && temporary.cashFlowStatus?.tone === 'caution' && temporary.cashFlowStatus.title === 'Possible shortfall of $300 on 23 Sep' && temporary.cashFlowStatus.detail === undefined);
const below = present(fixture(1200, { amount: 5000, day: 23 }));
assert('target shortfall: caution, and the existing final-deficit explanation is its supporting line', below.state === 'below_zero' && below.cashFlowStatus?.tone === 'caution' && below.cashFlowStatus.detailIsDeficit === true && below.cashFlowStatus.detail === below.deficitLine && below.cashFlowStatus.title === 'Possible shortfall of $3,800 on 23 Sep' && below.cashFlowStatus.detail === 'Your scheduled commitments may be about $1,300.00 more than your cash by 30 Sep 2026');
const broken = present(fixture(1200, { amount: 0, day: 23 }));
assert('invalid / incomplete estimate: NO status at all — it can never be shown as success', broken.state === 'unavailable' && broken.cashFlowStatus === undefined && broken.cashFlowLine === undefined);
const none = (() => { const d = fixture(1200, { amount: 500, day: 23 }); d.assets = []; return present(syncIncomeAggregate(d)); })();
assert('no eligible balance: NO status', none.cashFlowStatus === undefined);
assert('a status exists exactly when the accepted cash-flow line exists', [healthy, temporary, below, broken, none].every((p) => (p.cashFlowStatus !== undefined) === (p.cashFlowLine !== undefined)));
assert('the status type has no urgent/red tone: a projected shortfall is not an overdue or destructive state (Design 5.1 colour rule)', /tone: 'healthy' \| 'caution';/.test(readFileSync(join(__dirname, '../src/lib/calculations/lookAheadPresentation.ts'), 'utf8')));

// ── §3 this pass touched no financial, persistence or D.1 owner ──
const changed = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { cwd: join(__dirname, '..'), encoding: 'utf8' }).split('\n').filter(Boolean);
const PROTECTED = [
  'src/lib/calculations/safeToSpend.ts', 'src/lib/calculations/lookAheadProjection.ts', 'src/lib/calculations/projectedEvents.ts', 'src/lib/calculations/dailyGuide.ts',
  'src/lib/calculations/localCalendar.ts', 'src/lib/calculations/occurrenceIdentity.ts', 'src/lib/calculations/paydayBoundary.ts', 'src/lib/calculations/money.ts',
  'src/lib/calculations/balancePath.ts', 'src/lib/calculations/repaymentAccounting.ts', 'src/lib/calculations/goalAllocation.ts', 'src/lib/storage.ts',
  'src/types/models.ts', 'src/navigation/floatingNavGeometry.ts', 'package.json', 'package-lock.json', 'app.json',
];
assert('no engine, calendar, identity, storage, model, dock-geometry or dependency file differs from the Pass C checkpoint', PROTECTED.every((f) => !changed.includes(f)));
assert('Today, Wealth and Grow screens are untouched', !changed.some((f) => /^src\/screens\/(today|wealth|grow)\//.test(f)));
const strip = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lower = strip('components/money/MoneyCardLowerRegion.tsx');
assert('the shared lower region owns NO maths, state owner, storage or navigation', !/compute[A-Z]|useAppState|AsyncStorage|navigation|Math\.|\/ \d|\* \d/.test(lower));
const statusBlock = lower.slice(lower.indexOf('export function CashPathStatus'), lower.indexOf('export interface CardAction'));
assert('the status surface is information, not a control: no press handler, no button role, no chevron', !/onPress|TouchableOpacity|Pressable|accessibilityRole="button"|chevron/.test(statusBlock));
assert('tone is never colour alone: each tone has its own glyph', /checkmark-circle/.test(statusBlock) && /alert-circle/.test(statusBlock));
const card = strip('components/money/ScenarioPositionCard.tsx');
const hero = strip('components/money/SafeToSpendHero.tsx');
assert('each card declares each information action exactly once, through the ONE shared group', (card.match(/testID: 'money-view-upcoming-events'/g) ?? []).length === 1 && (card.match(/testID: 'money-why-this-amount'/g) ?? []).length === 1 && (hero.match(/testID: 'money-aup-view-upcoming-events'/g) ?? []).length === 1 && (card.match(/<CardActionGroup/g) ?? []).length === 1 && (hero.match(/<CardActionGroup/g) ?? []).length === 1);
assert('the payday hero never renders the header info icon beside the grouped row that opens the same sheet', /showInfo !== false && !showsGroupedActions\(opts\)/.test(hero));
assert('Available until payday shows NO cash-path status: no accepted AUP path output exists, and none is invented', !/CashPathStatus/.test(hero));
assert('Back to payday appears once, as the quiet tertiary foot', (card.match(/testID="money-back-to-payday"/g) ?? []).length === 1 && card.indexOf('money-scenario-actions') < card.indexOf('money-back-to-payday'));
assert('the provenance line is rendered once on the selected-date card', (card.match(/testID="money-scenario-provenance"/g) ?? []).length === 1);
const money = strip('screens/money/MoneyScreen.tsx');
assert('ONE upcoming-events handler serves both modes; Back to payday only clears the transient target', (money.match(/onViewUpcomingEvents=\{scrollToUpcomingEvents\}/g) ?? []).length === 2 && /onBackToPayday=\{\(\) => setTimeframeTarget\(null\)\}/.test(money));
const screenShell = strip('components/shared/Screen.tsx');
assert('the D.1 Screen change was not broadened', /largeTitle \|\| onScrollY \? \{ onScroll, scrollEventThrottle: 16 \} : \{\}/.test(screenShell) && !changed.includes('src/components/shared/Screen.tsx') === false);

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
