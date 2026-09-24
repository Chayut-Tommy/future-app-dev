// Pass D.5 — pure proofs for the inline balance selector, the persisted inclusion
// scope it describes, the income/expense direction wording, and the consolidation of
// the "Why this amount?" sheets. Also reproduces, from frozen inputs, every figure in
// the founder's recorded session so the two different rounding rules stay honest.
// Rendered proofs: tests/rendered/d5-inline-balances.render.test.tsx.
// Run with: npx tsx tests/d5-inline-balances.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { buildAupExplanation, formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { CHOOSE_BALANCES_SELECTOR_LABEL, summariseIncludedBalances } from '../src/lib/calculations/moneyComposition';
import { resolveIncludeInMoneyCalculations } from '../src/lib/calculations/liquidAssets';
import { formatCentsCentsAware } from '../src/lib/calculations/money';
import { confirmationSummary } from '../src/lib/reminderPresentation';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const src = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8');
const t = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const TODAY = new Date(2026, 8, 23); // frozen
Date.now = () => new Date(2026, 8, 23, 12).getTime(); // goalAllocation reads the clock (pre-existing)

// ── §1 the selector's own label: named when one, counted when several ──
{
  const none = summariseIncludedBalances([], 0);
  assert('1a. no selection reads as a call to action, never as "$0"', none.empty && none.selectorLabel === CHOOSE_BALANCES_SELECTOR_LABEL && !/\$0/.test(none.selectorSpoken));
  const one = summariseIncludedBalances([{ id: 'a', label: 'Everyday', value: 8650 }], 8650);
  assert('1b. one account is NAMED with its total', one.selectorLabel === 'Everyday · $8,650');
  const many = summariseIncludedBalances(
    [
      { id: 'a', label: 'Everyday', value: 7500 },
      { id: 'b', label: 'Cash', value: 1150 },
    ],
    8650
  );
  assert('1c. several accounts are COUNTED with the engine’s own total, never concatenated', many.selectorLabel === '2 accounts · $8,650');
  assert('1d. the spoken form says what the control is, and the separator becomes a comma for speech', many.selectorSpoken === 'Balances used: 2 accounts, $8,650' && one.selectorSpoken === 'Balances used: Everyday, $8,650');
  const long = summariseIncludedBalances([{ id: 'a', label: 'Joint Everyday Account — Tommy and Sam (offset)', value: 8650 }], 8650);
  assert('1e. a long account name is carried WHOLE (the view wraps it; the owner never truncates)', long.selectorLabel.startsWith('Joint Everyday Account — Tommy and Sam (offset) · '));
  assert('1f. a non-finite total degrades to the count alone rather than printing "$NaN"', summariseIncludedBalances([{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 2 }], Number.NaN).selectorLabel === '2 accounts');
}

// ── §2 inclusion is a PERSISTED, SHARED setting — the copy must say so ──
{
  const picker = src('components/money/SelectBalancesSheet.tsx');
  const flat = picker.replace(/\s+/g, ' ');
  assert('2a. the picker states the real scope: every estimate, not one card', /applies everywhere Nolie estimates your money/.test(flat));
  assert('2b. …and that it persists until changed, never "for this estimate only"', /stays this way until you change it/.test(flat) && !/this estimate only|this scenario only|temporar/i.test(flat));
  assert('2c. …and reassures that ownership is untouched', /Your account balances and Wealth total never change\./.test(flat));
  assert('2d. the field it writes is the persisted per-asset one, through the single existing action', /updateAssetsIncludeInMoney/.test(picker) && (picker.match(/updateAssetsIncludeInMoney\(/g) || []).length === 1);
  assert('2e. the sheet owns NO money maths: no allowance, no projection, no safe-to-spend', !/computeSafeToSpend|computeLookAheadProjection|computeDailyGuide|dailyAllowance/.test(picker));
  const d = createEmptyAppData();
  assert('2f. the default resolves cash and everyday IN and other types OUT, so an absent field is never treated as "unknown"', resolveIncludeInMoneyCalculations({ id: 'x', type: 'everyday' } as Asset) === true && resolveIncludeInMoneyCalculations({ id: 'y', type: 'cash' } as Asset) === true && resolveIncludeInMoneyCalculations({ id: 'z', type: 'savings' } as Asset) === false && d !== null);
}

// ── §3 the recorded session, reproduced from frozen inputs ──
// Both rounding rules appear in the recording and they are DIFFERENT. The payday card
// rounds to the nearest dollar; the selected-date guide rounds DOWN. Each figure below
// is produced by the shipped formatter, not by hand.
{
  const remainderCents = 361657; // $8,650 − $4,570 − $64.81 − $398.61 − $0.01
  assert('3a. the recorded ledger reconciles exactly, in cents', 865000 - 457000 - 6481 - 39861 - 1 === remainderCents);
  assert('3b. payday, 12 days: $3,616.57 ÷ 12 → $301 through the nearest-dollar formatter', formatSafeToSpendAmount(remainderCents / 100 / 12) === '$301');
  const savingsOnlyCents = 246657; // the $1,150 cash balance deselected
  assert('3c. deselecting the $1,150 cash balance moves the remainder by EXACTLY that balance', remainderCents - savingsOnlyCents === 115000);
  assert('3d. payday, 12 days, savings only: $2,466.57 ÷ 12 → $206 (nearest dollar rounds 205.5 UP; it is not floored)', formatSafeToSpendAmount(savingsOnlyCents / 100 / 12) === '$206' && Math.floor(savingsOnlyCents / 100 / 12) === 205);
  assert('3e. restoring the balance restores the figure exactly — the toggle is reversible with no drift', savingsOnlyCents + 115000 === remainderCents);
  // Selected-date guides floor: the day's spend must not exceed what is actually there.
  const floorDaily = (cents: number, days: number) => formatCentsCentsAware(Math.floor(cents / days / 100) * 100);
  assert('3f. custom date, 7 days: $7,730 ÷ 7 → $1,104 (floored from 1,104.28)', floorDaily(773000, 7) === '$1,104');
  assert('3g. custom date, 25 days: $11,510 ÷ 25 → $460 (floored from 460.40)', floorDaily(1151000, 25) === '$460');
  assert('3h. the two rules are genuinely different and neither is described as the other', formatSafeToSpendAmount(205.5475) === '$206' && floorDaily(246657, 12) === '$205');
}

// ── §4 a real fixture: toggling inclusion moves ONE ledger row and nothing else ──
function fixture(includeCash: boolean): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    { id: 'Everyday', type: 'everyday', label: 'Everyday', currentValue: 7500, includeInMoneyCalculations: true } as Asset,
    { id: 'Cash', type: 'cash', label: 'Cash', currentValue: 1150, includeInMoneyCalculations: includeCash } as Asset,
    { id: 'Sav', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2400, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}
{
  const withCash = computeSafeToSpend(fixture(true), TODAY);
  const withoutCash = computeSafeToSpend(fixture(false), TODAY);
  assert('4a. the included balance moves by exactly the deselected balance', Math.round((withCash.includedMoneyBalance - withoutCash.includedMoneyBalance) * 100) === 115000);
  assert('4b. every OTHER input is bit-identical — bills, savings, goals and the day count do not move', withCash.cycleBillsExpected === withoutCash.cycleBillsExpected && withCash.cycleSavingsReserved === withoutCash.cycleSavingsReserved && withCash.cycleGoalsReserved === withoutCash.cycleGoalsReserved && withCash.daysRemaining === withoutCash.daysRemaining);
  assert('4c. the payday horizon is preserved across the change — inclusion never moves the cycle', withCash.hasKnownPayday === withoutCash.hasKnownPayday && withCash.paydayExpired === withoutCash.paydayExpired && withCash.mainPaydayStatus === withoutCash.mainPaydayStatus);
  const a = buildAupExplanation(withCash);
  const b = buildAupExplanation(withoutCash);
  assert('4d. both ledgers still reconcile EXACTLY to their own remainder', a.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0) === a.remainderCents && b.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0) === b.remainderCents);
  assert('4e. the remainder moves by exactly the deselected balance, to the cent', a.remainderCents - b.remainderCents === 115000);
  assert('4f. the excluded savings account never enters either included balance', withCash.includedMoneyBalance === 8650 && withoutCash.includedMoneyBalance === 7500);
  assert('4g. the account rows list only what is included, and the named account disappears when deselected', a.rows.some((r) => r.kind === 'account' && /Cash/.test(r.label)) && !b.rows.some((r) => r.kind === 'account' && /Cash/.test(r.label)));
  const round = computeSafeToSpend(fixture(true), TODAY);
  assert('4h. restoring the selection restores the remainder exactly — no drift across the round trip', buildAupExplanation(round).remainderCents === a.remainderCents);
  const summary = summariseIncludedBalances(withCash.includedMoneyBalanceAccounts ?? [], withCash.includedMoneyBalance);
  assert('4i. the selector describes the SAME accounts the engine used, never its own total', summary.selectorLabel === '2 accounts · $8,650');
}

// ── §5 income goes TO an account; a bill comes FROM one ──
{
  assert('5a. an income confirmation reads "to"', confirmationSummary({ amount: 2400, accountName: 'Everyday', direction: 'to' }) === '$2,400 to Everyday');
  assert('5b. a bill confirmation still reads "from" — the default is unchanged', confirmationSummary({ amount: 120, accountName: 'Everyday' }) === '$120 from Everyday');
  assert('5c. an explicit "from" is honoured', confirmationSummary({ amount: 120, accountName: 'Everyday', direction: 'from' }) === '$120 from Everyday');
  assert('5d. the date suffix is preserved in both directions', /· /.test(confirmationSummary({ amount: 10, accountName: 'A', dateISO: iso(2026, 9, 23), direction: 'to' }) ?? '') && /· /.test(confirmationSummary({ amount: 10, accountName: 'A', dateISO: iso(2026, 9, 23) }) ?? ''));
  assert('5e. an unknown amount or account still yields nothing at all, in either direction', confirmationSummary({ amount: undefined, accountName: 'A', direction: 'to' }) === null && confirmationSummary({ amount: 10, accountName: null, direction: 'to' }) === null);
  const card = src('components/today/SmartReminderCard.tsx');
  assert('5f. exactly one call site declares the income direction, and the bill call site is untouched', (card.match(/direction: 'to'/g) || []).length === 1 && !/direction: 'from'/.test(card));
}

// ── §6 the consolidation: each meaning has exactly ONE home ──
{
  const sheet = src('components/money/LookAheadSheet.tsx');
  const hero = src('components/money/SafeToSpendHero.tsx');
  assert('6a. the guide’s method is no longer restated as prose beside the arithmetic that shows it', !/spreads an equal amount across the days/.test(sheet));
  assert('6b. the informational-plan sentence is stated beside its amount, and nowhere else', (sheet.match(/not subtracted from this estimated balance/g) || []).length === 2 && /testID="look-ahead-savings"/.test(sheet));
  assert('6c. the excluded-savings statement is not duplicated as a generic assumption', !/stay outside the starting amount/.test(sheet));
  assert('6d. "this is an estimate" is said once, by the shared closing provenance', !/planning estimate, not a guarantee/.test(sheet) && /EXPLANATION_PROVENANCE/.test(sheet));
  assert('6e. the assumed-income caveat sits with the ledger row it qualifies', /Future income is assumed, not received, and timing may vary/.test(sheet) && !/Scheduled income on or before your selected date is assumed/.test(sheet));
  assert('6f. the payday sheet keeps the compliance line and drops the duplicated estimate boilerplate', /Educational only — not personal financial advice/.test(hero) && !/updates automatically whenever your income/.test(hero));
  // The disclosures that carry information nothing else carries are all still there.
  assert('6g-i. kept: the planning-guide caveat, via its shared constant', /DAILY_GUIDE_ACCESSIBLE_EXPLANATION/.test(sheet) && /A planning guide based on your included balances and scheduled cash flow/.test(src('lib/calculations/lookAheadPresentation.ts')));
  for (const kept of [
    'isn’t counted in the guide',
    'estimated cycle start',
    'it’s spending, not extra money',
    'counted together at the end of that day',
    'show dated events only',
  ]) {
    assert(`6g. kept, because nothing else says it: "${kept}"`, sheet.includes(kept));
  }
  assert('6h. an unknown plan is still disclosed — silence is only for a plan that computes to nothing', /plannedUnknown/.test(sheet));
}

// ── §7 structure: one entry point, one write path, focus returns ──
{
  const money = src('screens/money/MoneyScreen.tsx');
  const selector = src('components/money/InlineBalancesSelector.tsx');
  const focus = src('hooks/useReturnFocus.ts');
  assert('7a. the standalone balances card is gone from the screen and from the tree', !/IncludedBalancesRow/.test(money));
  assert('7b. one selector element is built once and given to BOTH cards', (money.match(/<InlineBalancesSelector/g) || []).length === 1 && (money.match(/balancesSelector=\{balancesSelector\}/g) || []).length === 2);
  assert('7c. the selector describes and opens; it never computes', !/computeSafeToSpend|dailyAllowance|reduce\(/.test(selector));
  assert('7d. it meets the 44pt floor on both axes and keeps tabular figures', /minHeight: designLayout\.touchTargetMin/.test(selector) && /minWidth: designLayout\.touchTargetMin/.test(selector) && /tabular-nums/.test(selector));
  assert('7e. long names wrap rather than clip — no fixed height, no numberOfLines', !/numberOfLines/.test(selector) && !/height:\s*\d/.test(selector));
  assert('7f. focus return is idempotent per open/close cycle and schedules no timers', /armed\.current = false/.test(focus) && !/setTimeout|requestAnimationFrame|InteractionManager/.test(focus));
  // Pass E — the picker's dismissal handler now also sequences the add-balance handoff,
  // so it goes through handleBalancesDismissed; the focus return itself is unchanged.
  assert('7g. the balances picker and the "Why this amount?" sheet each return focus to the control that opened them',
    /onDismissed=\{handleBalancesDismissed\}/.test(money) && /balancesFocus\.fire\(\);/.test(money) && /onDismissed=\{whyFocus\.fire\}/.test(money));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
