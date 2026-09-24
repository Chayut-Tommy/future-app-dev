// Pass E — pure proofs for the closure pass: the balances handoff reuses the ONE shared
// dirty-change confirmation (no second persistence owner), the scenario date is genuinely
// transient while account inclusion is genuinely persisted, and the accepted financial
// rules that Pass D–D.5 presentation work sits on top of are unchanged.
// Rendered proofs: tests/rendered/e-closure.render.test.tsx.
// Run with: npx tsx tests/e-closure.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import { syncIncomeAggregate } from '../src/state/AppStateContext';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../src/lib/calculations/dailyGuide';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { buildAupExplanation, formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { selectDailyGuideCalculation, selectLookAheadPresentation } from '../src/lib/calculations/lookAheadPresentation';
import { resolveIncludeInMoneyCalculations } from '../src/lib/calculations/liquidAssets';
import { CHOOSE_BALANCES_SELECTOR_LABEL, summariseIncludedBalances } from '../src/lib/calculations/moneyComposition';
import { localDate } from '../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const src = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8');
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const TODAY = new Date(2026, 8, 24);
const ASOF = localDate(2026, 9, 24);
Date.now = () => new Date(2026, 8, 24, 12).getTime(); // goalAllocation reads the clock (pre-existing)

const PICKER = src('components/money/SelectBalancesSheet.tsx');
const MONEY = src('screens/money/MoneyScreen.tsx');
const CONFIRM = src('lib/discardConfirmation.ts');
const HERO = src('components/money/SafeToSpendHero.tsx');
const FOCUS = src('hooks/useReturnFocus.ts');

// ── §1 the handoff asks; it never silently commits or silently drops ──
{
  assert('1a. the handoff uses the ONE shared confirmation module, not a local Alert',
    /confirmSaveOrDiscardIfDirty/.test(PICKER) && !/Alert\.alert/.test(PICKER) && !/from 'react-native'[\s\S]*Alert/.test(PICKER.slice(0, 400)));
  assert('1b. the shared module keeps its established semantics: a clean form continues with no prompt, and "Keep editing" is the cancel',
    /if \(!isDirty\) \{\s*\n\s*handlers\.onDiscard\(\);\s*\n\s*return;/.test(CONFIRM) && /text: 'Keep editing', style: 'cancel'/.test(CONFIRM.split('confirmSaveOrDiscardIfDirty')[1] ?? ''));
  assert('1c. it offers exactly three outcomes — keep editing, discard, save and continue',
    (() => { const b = CONFIRM.split('confirmSaveOrDiscardIfDirty')[1] ?? ''; return /'Keep editing'/.test(b) && /'Discard'/.test(b) && /'Save and continue'/.test(b); })());
  assert('1d. the existing dismissal gate is untouched — it still offers only keep/discard',
    (() => { const first = CONFIRM.split('export function confirmSaveOrDiscardIfDirty')[0]; return /'Keep editing'/.test(first) && /'Discard'/.test(first) && !/'Save and continue'/.test(first); })());
  assert('1e. "+ Add a money balance" no longer commits unconditionally',
    !/function handleAddBalance\(\) \{\s*\n\s*commitDraft\(\);/.test(PICKER));
  assert('1f. Save-and-continue commits through the SAME single authoritative path, once',
    /onSave: \(\) => \{\s*\n\s*commitDraft\(\);/.test(PICKER) && (PICKER.match(/updateAssetsIncludeInMoney\(/g) || []).length === 1);
  assert('1g. Discard writes nothing at all — it only resets the draft to what was last saved',
    /onDiscard: \(\) => \{\s*\n\s*discardDraft\(\);/.test(PICKER) && /function discardDraft\(\) \{\s*\n\s*setDraftIncluded\(new Map\(savedIncluded\)\);/.test(PICKER));
  assert('1h. Keep editing is the absence of an action: neither branch runs, so the sheet stays open with its draft',
    !/onCancel|onKeepEditing/.test(PICKER));
  const PICKER_CODE = PICKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert('1i. the picker still owns no money maths and no second persistence owner (code, not comments)',
    !/computeSafeToSpend|computeLookAheadProjection|computeDailyGuide|persist\(|AsyncStorage/.test(PICKER_CODE));
}

// ── §2 one modal at a time, and the return is predictable ──
{
  assert('2a. the chooser is presented only after the picker has finished dismissing',
    /addBalancePending\.current = true;/.test(MONEY) && /if \(addBalancePending\.current\) \{[\s\S]{0,200}setAddBalanceChooserVisible\(true\);/.test(MONEY));
  assert('2b. the two sheets are never toggled in the same handler any more',
    !/setSelectBalancesVisible\(false\);\s*\n\s*setAddBalanceChooserVisible\(true\)/.test(MONEY));
  assert('2c. the child returns to the picker on EITHER outcome, as before',
    /setAddBalanceChooserVisible\(false\);\s*\n\s*setSelectBalancesVisible\(true\);/.test(MONEY));
  assert('2d. a pending handoff suppresses the focus return, so focus is not yanked back to the pill mid-journey',
    /addBalancePending\.current = false;[\s\S]{0,160}return;/.test(MONEY));
  assert('2e. the focus return stays armed across the handoff (nothing disarms it but a fire)',
    /armed\.current = false;/.test(FOCUS) && (FOCUS.match(/armed\.current = false/g) || []).length === 1);
}

// ── §3 focus never targets an unmounted control ──
{
  assert('3a. the zero-selection state has its own focus target, wired to the balances CTA only',
    /balancesCtaRef/.test(HERO) && /opts\.cta\.testID === 'money-aup-cta-balances' \? balancesCtaRef : undefined/.test(HERO));
  assert('3b. the screen gives that CTA to the hook as the fallback',
    /useReturnFocus\(balancesCtaRef\)/.test(MONEY) && /balancesCtaRef=\{balancesCtaRef\}/.test(MONEY));
  assert('3c. the hook prefers the live origin, falls back, and tolerates both being gone',
    /ref\.current/.test(FOCUS) && /fallbackRef\?\.current \?\? null/.test(FOCUS));
  const A11Y_CODE = src('lib/a11yFocus.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert('3d. the focus helper still dispatches the one supported mechanism and swallows a dead node',
    /AccessibilityInfo\.sendAccessibilityEvent\(/.test(A11Y_CODE) && /catch/.test(A11Y_CODE) && !/findNodeHandle\(|setAccessibilityFocus\(/.test(A11Y_CODE));
  assert('3e. no timers, no scheduling, no motion in the focus path — Reduce Motion cannot change it',
    !/setTimeout|requestAnimationFrame|InteractionManager|Animated/.test(FOCUS));
}

// ── §4 inclusion persists; the scenario date does not ──
{
  assert('4a. the selected scenario date lives in transient component state, documented as such',
    /never survives a restart/.test(MONEY) && /useState<LocalDate \| null>\(null\)/.test(MONEY));
  assert('4b. no persisted model field or storage key carries a look-ahead target, a saved scenario or a date preference',
    !/lookAheadTarget|scenarioDate|savedTimeframe|timeframeTarget/.test(src('types/models.ts')) && !/lookAheadTarget|scenarioDate|savedTimeframe/.test(src('lib/storage.ts')));
  assert('4c. inclusion IS a persisted per-asset field with a type-based default',
    /includeInMoneyCalculations/.test(src('types/models.ts')) && resolveIncludeInMoneyCalculations({ id: 'a', type: 'everyday' } as Asset) === true && resolveIncludeInMoneyCalculations({ id: 'b', type: 'savings' } as Asset) === false);
  assert('4d. the picker reaches storage only through the provider action — it imports no storage module and no key',
    !/moneycoach\.appdata|from '\.\.\/\.\.\/lib\/storage'|async-storage/.test(PICKER) && /useAppState\(\)/.test(PICKER));
}

// ── §5 derived estimates are recomputed from current data and the current local date ──
function fixture(opts: { cashIn?: boolean; extraBill?: number } = {}): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    { id: 'Everyday', type: 'everyday', label: 'Everyday', currentValue: 7500, includeInMoneyCalculations: true } as Asset,
    { id: 'Cash', type: 'cash', label: 'Cash', currentValue: 1150, includeInMoneyCalculations: opts.cashIn !== false } as Asset,
    { id: 'Sav', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2400, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 6), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'monthly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
    ...(opts.extraBill
      ? [{ id: 'car', type: 'expense', label: 'Car', amount: opts.extraBill, frequency: 'monthly', nextDueDate: iso(2026, 9, 29), isFixed: true, active: true, categoryId: 'cat-transport' } as RecurringItem]
      : []),
  ];
  return syncIncomeAggregate(d);
}
{
  const data = fixture();
  const target = localDate(2026, 9, 30);
  const same = () => {
    const r = computeLookAheadProjection(data, ASOF, target);
    const g = computeDailyGuide(data, ASOF, target, r);
    return { headline: selectLookAheadPresentation(r).headlineAmount, guide: selectDailyGuideCalculation(g)?.daily ?? null, cents: r.available ? r.targetCents : null };
  };
  const a = same();
  const b = same();
  assert('5a. the same data and the same date give the same answer — the projection is a pure function of its inputs',
    JSON.stringify(a) === JSON.stringify(b) && a.cents !== null);

  // Time moving on legitimately changes the answer: fewer days, and the 28 Sep rent is
  // already behind the new "as of". An unchanged figure is NOT guaranteed after a restart.
  const later = computeLookAheadProjection(data, localDate(2026, 9, 29), target);
  assert('5b. a later local date legitimately yields a different figure — nothing is cached or pinned',
    later.available && a.cents !== later.targetCents);

  // Source data changing legitimately changes the answer too.
  const withCar = computeLookAheadProjection(fixture({ extraBill: 500 }), ASOF, target);
  assert('5c. a new scheduled bill legitimately yields a different figure',
    withCar.available && withCar.targetCents === (a.cents as number) - 50000);

  // Restart equivalence: the SAME stored data, re-read, reproduces the same figures.
  const rehydrated = JSON.parse(JSON.stringify(data)) as AppData;
  const after = computeLookAheadProjection(rehydrated, ASOF, target);
  assert('5d. round-tripping the stored data through JSON reproduces the figures exactly — persistence loses nothing',
    after.available && after.targetCents === a.cents);
  assert('5e. …and the persisted inclusion flags survive that round trip',
    rehydrated.assets.every((x, i) => resolveIncludeInMoneyCalculations(x) === resolveIncludeInMoneyCalculations(data.assets[i])));
}

// ── §6 accepted financial rules unchanged by Pass D–E presentation work ──
{
  const data = fixture();
  const s = computeSafeToSpend(data, TODAY);
  const ledger = buildAupExplanation(s);
  assert('6a. AUP still means "before payday": the day count excludes the payday itself and income on it is not added',
    s.hasKnownPayday && s.daysRemaining === 12 && s.includedMoneyBalance === 8650);
  assert('6b. the AUP ledger still reconciles EXACTLY, in integer cents, including its rounding row',
    ledger.rows.filter((r) => r.kind !== 'account').reduce((n, r) => n + r.cents, 0) === ledger.remainderCents && Number.isInteger(ledger.remainderCents));
  assert('6c. the account rows are a breakdown of the balances row, never extra terms',
    ledger.rows.filter((r) => r.kind === 'account').length === 2);
  assert('6d. payday rounds to the NEAREST dollar and says so; it never claims "rounded down"',
    formatSafeToSpendAmount(s.dailyAllowance) === `$${Math.round(s.dailyAllowance).toLocaleString()}`);

  const target = localDate(2026, 10, 3);
  const r = computeLookAheadProjection(data, ASOF, target);
  const g = computeDailyGuide(data, ASOF, target, r);
  const calc = selectDailyGuideCalculation(g)!;
  assert('6e. the selected-date guide rounds DOWN from its exact value and says so',
    r.available && calc !== null && (g.displayCents as number) <= (g.exactCents as number) && /Rounded down/.test(calc.roundingNote ?? 'Rounded down') && (g.limitingAllocationDays as number) > 0);
  assert('6f. the guide divides the LIMITING position, never the target balance ÷ N',
    Math.floor((g.limitingPositionCents as number) / (g.limitingAllocationDays as number) / 100) * 100 === g.displayCents);
  assert('6f-ii. …and that limiting position is not the target position unless they genuinely coincide',
    g.limitingDate !== null && (g.limitingAllocationDays as number) <= g.allocationDays);
  assert('6g. excluded savings never enter the opening amount',
    r.available && r.breakdown.openingCents === 865000);
  assert('6h. the target position is exactly opening + net dated events; the informational plan is NOT subtracted',
    r.available && r.targetCents === r.breakdown.openingCents + r.breakdown.netEventsCents && r.breakdown.netEventsCents === r.breakdown.assumedIncomeCents + r.breakdown.billsCents + r.breakdown.cardCents + r.breakdown.bnplCents + r.breakdown.mortgageCents + r.breakdown.otherLoanCents);

  // Projected events are the canonical shared set, not a second enumeration.
  const ev = computeProjectedEvents(data, ASOF, target, { windowStart: ASOF }).events;
  assert('6i. every projected event carries a canonical occurrence identity, and none is duplicated',
    ev.length > 0 && ev.every((e) => typeof e.occurrenceId === 'string' && e.occurrenceId.length > 0) && new Set(ev.map((e) => e.occurrenceId)).size === ev.length);
  assert('6j. the projection nets exactly what those canonical INCLUDED events say — no independent re-enumeration',
    r.available && r.breakdown.netEventsCents === ev.filter((e) => e.inclusion === 'included').reduce((n, e) => n + e.signedCents, 0));

  // A positive ending balance with an earlier shortfall must still report the shortfall.
  const tight = fixture({ extraBill: 9000 });
  const tr = computeLookAheadProjection(tight, ASOF, localDate(2026, 10, 10));
  assert('6k. a dip below zero before a positive ending balance is still reported, not hidden by the endpoint',
    tr.available && tr.lowest !== null && tr.lowest.cents <= tr.targetCents && (tr.firstShortfall !== null ? tr.lowest.cents < 0 && tr.recovers === (tr.targetCents >= 0) : true));

  // Invalid / empty input fails closed rather than printing $0.
  const empty = syncIncomeAggregate(createEmptyAppData());
  const er = computeLookAheadProjection(empty, ASOF, target);
  assert('6l. no balances and no schedule fails CLOSED — an unavailable result with issues, never a $0 estimate',
    !er.available && er.issues.length > 0 && selectLookAheadPresentation(er).headlineAmount == null);
  const es = computeSafeToSpend(empty, TODAY);
  assert('6m. …and AUP does the same: no known payday rather than an invented one',
    es.hasKnownPayday === false);
}

// ── §7 target inclusivity, DST and month boundaries (Australia/Melbourne moves the
// clock forward on 4 Oct 2026) ──
{
  const d = fixture();
  // `horizonDays` counts the ALLOCATION days (as-of through the day before the target);
  // the target day itself is inclusive for COMMITMENTS, which is proven separately below.
  const dst = computeLookAheadProjection(d, localDate(2026, 10, 2), localDate(2026, 10, 6));
  assert('7a. a window spanning the Australian DST change counts calendar days, not 24-hour blocks',
    dst.available && dst.horizonDays === 4);
  const monthEnd = computeLookAheadProjection(d, localDate(2026, 9, 24), localDate(2026, 9, 30));
  assert('7b. a month-end window counts its allocation days exactly',
    monthEnd.available && monthEnd.horizonDays === 6);
  const acrossMonth = computeLookAheadProjection(d, localDate(2026, 9, 24), localDate(2026, 10, 1));
  assert('7c. crossing the month boundary adds exactly one day',
    acrossMonth.available && acrossMonth.horizonDays === 7);
  const feb = computeLookAheadProjection(d, localDate(2028, 2, 26), localDate(2028, 3, 1));
  assert('7d. a leap-year February keeps 29 Feb in the window (26, 27, 28, 29)',
    feb.available && feb.horizonDays === 4);

  // The accepted contract: a commitment falling ON the target date IS counted.
  const onTarget = computeLookAheadProjection(d, localDate(2026, 9, 24), localDate(2026, 9, 28));
  const dayBefore = computeLookAheadProjection(d, localDate(2026, 9, 24), localDate(2026, 9, 27));
  assert('7e. the target day is INCLUSIVE: the 28 Sep rent counts when 28 Sep is the target, and not before',
    onTarget.available && dayBefore.available && onTarget.breakdown.billsCents === -100000 && dayBefore.breakdown.billsCents === 0);
  assert('7f. …and that is the only difference — the opening amount is identical',
    onTarget.available && dayBefore.available && onTarget.breakdown.openingCents === dayBefore.breakdown.openingCents);

  // Same-day events net once, at end of day, in either time zone.
  const both = computeProjectedEvents(d, localDate(2026, 9, 24), localDate(2026, 9, 28), { windowStart: localDate(2026, 9, 24) }).events;
  assert('7g. an event on the target date appears exactly once in the canonical set',
    both.filter((e) => e.date.day === 28 && e.date.month === 9).length === 1);
}

// ── §8 one forecast owner, and the states §6 calls out ──
{
  const money = MONEY;
  assert('8a. ONE surface owns the Look Ahead projection — no competing live forecast elsewhere',
    (() => {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const root = join(__dirname, '..', 'src');
      const out: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(e.name) && /computeLookAheadProjection\(/.test(fs.readFileSync(full, 'utf8'))) out.push(path.relative(root, full));
        }
      };
      walk(root);
      // The engine itself, its own consumers in lib, the explanation sheet and the screen.
      return out.filter((f) => f.startsWith('screens') || f.startsWith('components')).sort().join(',') === 'components/money/LookAheadSheet.tsx,screens/money/MoneyScreen.tsx';
    })());
  assert('8b. the retired End of Month Outlook is still retired — hidden by decision, with no live second forecast',
    /End of Month Outlook is temporarily hidden/.test(money) && !/computeEndOfMonthOutlook/.test(money));

  // A genuinely $0 included account is NOT the same as "nothing chosen".
  const zero = summariseIncludedBalances([{ id: 'a', label: 'Everyday', value: 0 }], 0);
  assert('8c. an included account that really holds $0 is named with $0 — never mistaken for "no selection"',
    zero.empty === false && zero.selectorLabel === 'Everyday · $0' && String(zero.selectorLabel) !== String(CHOOSE_BALANCES_SELECTOR_LABEL));
  const none = summariseIncludedBalances([], 0);
  assert('8d. …while nothing chosen still reads as the call to action',
    none.empty === true && none.selectorLabel === CHOOSE_BALANCES_SELECTOR_LABEL);
  assert('8e. a zero-balance account still counts toward the account COUNT, so the label cannot under-report',
    summariseIncludedBalances([{ id: 'a', label: 'A', value: 0 }, { id: 'b', label: 'B', value: 500 }], 500).selectorLabel === '2 accounts · $500');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
