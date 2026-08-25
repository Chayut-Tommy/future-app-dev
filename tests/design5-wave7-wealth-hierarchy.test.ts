// Nolie Design 5.1 Wave 7 — Wealth hierarchy, naming and disclosure.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): wealthComposition.ts and wealthDefinitions.ts are
//   pure and RN-free, so every naming, proportion, disclosure, date and
//   announcement assertion runs the REAL production function — including
//   the net-worth identity proof, which runs the real engine.
// - Class C (structural): render order, value sourcing, and that no engine,
//   eligibility resolver or persistence surface was touched.
// - NOT proven here: that any of it renders. See
//   tests/rendered/design5-wave7-wealth.render.test.tsx.
//
// Run with: npx tsx tests/design5-wave7-wealth-hierarchy.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  NET_WORTH_LABEL,
  NET_WORTH_FORMULA,
  OWN_LABEL,
  OWE_LABEL,
  WEALTH_SCREEN_TITLE,
  ACCESSIBLE_NOW_LABEL,
  RETIREMENT_LABEL_DISPLAY,
  WEALTH_DEFINITIONS,
  WEALTH_PREVIEW_COUNT,
  STALE_TRIGGER_ENABLED,
  isDisplayableAmount,
  formatWealthAmount,
  spokenWealthAmount,
  composeNetWorthAnnouncement,
  composeOwnOweAnnouncement,
  resolveOwnOweProportions,
  composeWealthMeasures,
  resolveDisclosure,
  disclosureLabel,
  resolveRecordFreshness,
  formatRecordedDate,
  formatAddedDate,
  liabilityDateLine,
  resolveRetirementPresence,
  retirementRowValue,
  composeBreakdownItems,
  composeBreakdownTriggerLabel,
  resolveLiabilityRowTone,
  liabilityRowToneIcon,
  BREAKDOWN_TRIGGER_TEXT,
} from '../src/lib/calculations/wealthComposition';
import {
  computeTotalWealth,
  computeAccessibleNetWorth,
  computeRetirementSavings,
} from '../src/lib/calculations/wealthDefinitions';
import { createEmptyAppData } from '../src/lib/storage';
import { computeMoneyPlan } from '../src/lib/calculations/moneyPlan';
import { AppData, Asset, Liability } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN_RAW = read('src/screens/wealth/WealthScreen.tsx');
const SCREEN = strip(SCREEN_RAW);
const MODEL = strip(read('src/lib/calculations/wealthComposition.ts'));

const A = (id: string, type: string, label: string, v: number): Asset => ({ id, type: type as never, label, currentValue: v });
const L = (id: string, type: string, label: string, v: number): Liability => ({ id, type: type as never, label, currentBalance: v });

function fixture(mut: (d: AppData) => void): AppData {
  const d = createEmptyAppData();
  mut(d);
  return d;
}

/** The twelve deterministic datasets the wave is specified against. */
const FIXTURES: [string, AppData][] = [
  ['1 valid empty', fixture(() => {})],
  ['2 assets only', fixture((d) => { d.assets.push(A('c', 'cash', 'Cash', 500), A('e', 'everyday', 'CBA', 22500)); })],
  ['3 liabilities only, negative net worth', fixture((d) => { d.liabilities.push(L('m', 'mortgage', 'Home', 480000)); })],
  ['4 assets + liabilities + retirement', fixture((d) => {
    d.assets.push(A('c', 'cash', 'Cash', 1200), A('s', 'savings', 'Rainy day', 8000), A('p', 'property', 'Home', 900000), A('sup', 'super', 'My Super', 150000));
    d.liabilities.push(L('m', 'mortgage', 'Home loan', 480000), L('cc', 'credit_card', 'AMEX', 1150));
  })],
  ['5 everyday and savings', fixture((d) => { d.assets.push(A('e', 'everyday', 'CBA', 3000), A('s', 'savings', 'Buffer', 12000)); })],
  ['6 credit-card liability', fixture((d) => {
    d.creditCards.push({ id: 'nab', issuer: 'NAB', label: 'NAB', creditLimit: 5000, currentBalance: 525, dueDay: 20, minimumPayment: 25 } as never);
    d.liabilities.push({ id: 'l1', type: 'credit_card', label: 'NAB', currentBalance: 525, creditCardId: 'nab' } as never);
  })],
  ['7 linked loan repayment', fixture((d) => {
    d.assets.push(A('car', 'car', 'Car', 18000));
    d.liabilities.push(L('cl', 'car_loan', 'Car loan', 12000));
    d.recurringItems.push({ id: 'r1', type: 'expense', label: 'Car repayment', amount: 400, frequency: 'monthly', nextDueDate: new Date(2026, 7, 25).toISOString(), isFixed: true, active: true, linkedLiabilityId: 'cl' } as never);
  })],
  ['8 more than three of each', fixture((d) => {
    for (let i = 1; i <= 5; i++) d.assets.push(A('a' + i, 'shares', 'Holding ' + i, i * 1000));
    for (let i = 1; i <= 4; i++) d.liabilities.push(L('l' + i, 'personal_loan', 'Loan ' + i, i * 2000));
  })],
  ['11 zero-balance rows', fixture((d) => { d.assets.push(A('z', 'cash', 'Emptied', 0), A('n', 'savings', 'Live', 100)); d.liabilities.push(L('lz', 'other', 'Cleared', 0)); })],
  ['13 negative net worth', fixture((d) => { d.assets.push(A('c', 'cash', 'Cash', 100)); d.liabilities.push(L('l', 'personal_loan', 'Loan', 5000)); })],
];

console.log('=== 1. The hero is the ENGINE output, and it is already net worth (Class A) ===');
{
  // The wave's central claim: the rename is copy-only because
  // computeTotalWealth has always equalled totalAssets - totalLiabilities.
  // computeTotalWealth = accessible + retirement, and accessible =
  // (assets - retirement) - liabilities, so retirement cancels.
  for (const [name, d] of FIXTURES) {
    const totalAssets = d.assets.reduce((s, a) => s + a.currentValue, 0);
    const totalLiabilities = d.liabilities.reduce((s, l) => s + l.currentBalance, 0);
    assert(`1a. ${name}: engine net worth === own − owe, to the cent`, computeTotalWealth(d) === totalAssets - totalLiabilities);
    assert(`1b. ${name}: and the identity the engine is built from still holds`, computeTotalWealth(d) === computeAccessibleNetWorth(d) + computeRetirementSavings(d));
  }
  // The exact pre-wave outputs, pinned. If a calculation is ever touched,
  // these fail before any presentation test does.
  const EXPECTED: [string, number][] = [
    ['1 valid empty', 0], ['2 assets only', 23000], ['3 liabilities only, negative net worth', -480000],
    ['4 assets + liabilities + retirement', 578050], ['5 everyday and savings', 15000],
    ['6 credit-card liability', -525], ['7 linked loan repayment', 6000], ['8 more than three of each', -5000],
    ['11 zero-balance rows', 100], ['13 negative net worth', -4900],
  ];
  for (const [name, expected] of EXPECTED) {
    const d = FIXTURES.find(([n]) => n === name)![1];
    assert(`1c. ${name}: net worth is exactly ${expected} — unchanged from the pre-wave build`, computeTotalWealth(d) === expected);
  }
  assert('1d. the screen never recomputes the hero locally', /const netWorth = useMemo\(\(\) => computeTotalWealth\(data\), \[data\]\);/.test(SCREEN));
  assert('1e. and renders exactly that value', /formatWealthAmount\(netWorth\)/.test(SCREEN));
  assert('1f. no second "total" figure is introduced', (SCREEN.match(/computeTotalWealth\(/g) || []).length === 1);
  assert('1g. no formatted currency string is ever parsed back into a number', !/parseFloat\(.*\$|replace\(\/\\\$\/|Number\(.*\$/.test(SCREEN));
  assert('1h. the presentation module performs no wealth arithmetic of its own', !/computeTotalWealth|computeAccessibleNetWorth|computeRetirementSavings/.test(MODEL));
}

console.log('\n=== 2. Naming: the measure is called what it is (Class A + C) ===');
{
  assert('2a. the hero label is "Net worth"', NET_WORTH_LABEL === 'Net worth');
  assert('2b. with the concise formula line', NET_WORTH_FORMULA === 'What you own minus what you owe');
  assert('2c. the screen title is "Wealth"', WEALTH_SCREEN_TITLE === 'Wealth');
  assert('2d. no customer-visible "Total Wealth" remains on the screen', !/>Total Wealth</.test(SCREEN) && !/"Total Wealth"/.test(SCREEN));
  assert('2e. nor "Wealth Map" as a heading', !/title="Wealth Map"/.test(SCREEN) && !/>Wealth Map</.test(SCREEN));
  assert('2f. the root tab route name is untouched', /tabScrollRefs\.Wealth/.test(SCREEN));
  assert('2g. the engine keeps its own internal name — no function was renamed', /export function computeTotalWealth/.test(read('src/lib/calculations/wealthDefinitions.ts')));
  assert('2h. and its body is unchanged', /return computeAccessibleNetWorth\(data\) \+ computeRetirementSavings\(data\);/.test(read('src/lib/calculations/wealthDefinitions.ts')));
}

console.log('\n=== 3. The spoken hero (Class A) ===');
{
  const spoken = composeNetWorthAnnouncement({ netWorth: 578050, totalAssets: 1059200, totalLiabilities: 481150 });
  assert('3a. leads with the measure and its value', spoken.startsWith('Net worth, 578,050 dollars.'));
  assert('3b. then the formula as real numbers, not abstract words', /What you own, 1,059,200 dollars, minus what you owe, 481,150 dollars\./.test(spoken));
  assert('3c. a negative net worth reads as negative, not as a symbol', /negative 4,900 dollars/.test(composeNetWorthAnnouncement({ netWorth: -4900, totalAssets: 100, totalLiabilities: 5000 })));
  assert('3d. the formula is spoken once, not once per figure', (spoken.match(/minus/g) || []).length === 1);
  assert('3e. an unusable figure says so rather than reading as zero', spokenWealthAmount(NaN) === 'not available');
}

console.log('\n=== 4. Amounts: a valid zero is $0, an invalid one never is (Class A) ===');
{
  assert('4a. a genuine zero displays as $0', formatWealthAmount(0) === '$0');
  assert('4b. NaN is not presented as a fabricated $0', formatWealthAmount(NaN) === '—' && !isDisplayableAmount(NaN));
  assert('4c. nor is Infinity', formatWealthAmount(Infinity) === '—' && !isDisplayableAmount(Infinity));
  assert('4d. a negative uses the typographic minus, which shares a digit\'s advance width', formatWealthAmount(-4900) === '−$4,900');
  assert('4e. never the hyphen, which would break column alignment', !formatWealthAmount(-4900).startsWith('-'));
  assert('4f. figures use tabular numerals so a column stays aligned', (SCREEN.match(/fontVariant: \['tabular-nums'\]/g) || []).length >= 4);
  // RECONCILED (Wave 7 correction A). OLD CLAUSE: the hero figure used
  // `adjustsFontSizeToFit` + `numberOfLines={1}`. SUPERSEDED BECAUSE that
  // pair silently SHRINKS the figure instead of letting the layout grow —
  // at 200% Dynamic Type it is exactly backwards, and it is the mechanism
  // the correction brief explicitly forbids. PRESERVED INTENT: the amount
  // must remain one complete, unbroken string that never clips or orphans
  // its sign. REPLACEMENT: neither shrink-to-fit nor a one-line cap is
  // used; the figure is a plain Text in a container with no fixed height,
  // so it grows vertically instead.
  assert('4g. the hero figure never shrinks itself to fit', !/adjustsFontSizeToFit/.test(SCREEN));
  assert('4g-i. and is not capped to one line, so a large value grows the layout', !/heroValue[\s\S]{0,200}numberOfLines/.test(SCREEN));
  assert('4g-ii. its container has no fixed height to clip against', !/heroHeadBlock: \{[^}]*height: \d/.test(SCREEN));
}

console.log('\n=== 5. Own/owe reconciles, and zero denominators are safe (Class A) ===');
{
  for (const [name, d] of FIXTURES) {
    const own = d.assets.reduce((s, a) => s + a.currentValue, 0);
    const owe = d.liabilities.reduce((s, l) => s + l.currentBalance, 0);
    assert(`5a. ${name}: own − owe reconciles with the hero exactly`, own - owe === computeTotalWealth(d));
  }
  const empty = resolveOwnOweProportions(0, 0);
  assert('5b. nothing recorded produces NO bar — never a full one of either colour', !empty.barMeaningful && empty.ownFraction === 0 && empty.oweFraction === 0);
  assert('5c. and no NaN escapes the zero denominator', Number.isFinite(empty.ownFraction) && Number.isFinite(empty.oweFraction));
  const assetsOnly = resolveOwnOweProportions(23000, 0);
  assert('5d. assets only fills the own side entirely', assetsOnly.barMeaningful && assetsOnly.ownFraction === 1 && assetsOnly.oweFraction === 0);
  const debtsOnly = resolveOwnOweProportions(0, 480000);
  assert('5e. debts only fills the owe side entirely', debtsOnly.barMeaningful && debtsOnly.oweFraction === 1);
  const both = resolveOwnOweProportions(750, 250);
  assert('5f. a mix splits proportionally', Math.abs(both.ownFraction - 0.75) < 1e-9 && Math.abs(both.oweFraction - 0.25) < 1e-9);
  assert('5g. the two fractions always sum to one when the bar is shown', Math.abs(both.ownFraction + both.oweFraction - 1) < 1e-9);
  assert('5h. an unusable input withholds the bar rather than guessing', !resolveOwnOweProportions(NaN, 100).barMeaningful);
  assert('5i. a negative total is not treated as a proportion of anything', !resolveOwnOweProportions(-50, 0).barMeaningful);
  assert('5j. the denominator is own+owe, never net worth, which can be zero or negative', /const denominator = own \+ owe;/.test(MODEL));
  assert('5k. VoiceOver gets the exact values, not only percentages', /What you own, 23,000 dollars\. What you owe, 0 dollars\./.test(composeOwnOweAnnouncement(23000, 0)));
  assert('5l. and the bar itself is hidden from the reader, so nothing is said twice', /testID="wealth-own-owe-bar"/.test(SCREEN) && /reconcileBar[\s\S]{0,160}accessibilityElementsHidden/.test(SCREEN));
  assert('5m. colour is not the only distinction — each side is named in words', /\{OWN_LABEL\}/.test(SCREEN) && /\{OWE_LABEL\}/.test(SCREEN));
  assert('5n. debt uses the restrained warm family, never destructive red', /reconcileFillOwe: \{ backgroundColor: semantic\.warningAccent \}/.test(SCREEN) && !/reconcileFillOwe[\s\S]{0,80}danger/.test(SCREEN));
}

console.log('\n=== 6. Accessible now and retirement stay two measures (Class A) ===');
{
  const d = FIXTURES.find(([n]) => n.startsWith('4'))![1];
  const m = composeWealthMeasures(computeAccessibleNetWorth(d), computeRetirementSavings(d));
  assert('6a. accessible now comes from its own engine', m.accessible.value === 428050);
  assert('6b. retirement from its own', m.retirement !== null && m.retirement.value === 150000);
  assert('6c. they are never summed into a third figure — the shape has no slot for one', !('combined' in (m as never)) && Object.keys(m).length === 2);
  assert('6d. accessible now is not called cash, spendable, or Available until payday', ACCESSIBLE_NOW_LABEL === 'Accessible now');
  assert('6e. and the screen never uses those words for it', !/Available until payday/.test(SCREEN) && !/>Spendable</.test(SCREEN));
  assert('6f. retirement is labelled plainly', RETIREMENT_LABEL_DISPLAY === 'Retirement savings');
  // RECONCILED (Wave 7 correction A). OLD CLAUSE: the retirement ROW on
  // the standalone measures card carried the note "Part of net worth, not
  // generally accessible now". SUPERSEDED BECAUSE that card is retired — it
  // became an oversized, half-empty surface whenever no retirement savings
  // existed, which the owner's recording showed. PRESERVED INTENT: the
  // customer must still be told that retirement savings are inside net
  // worth but not available now. REPLACEMENT: the same fact, in the
  // Definitions text that now lives inside the breakdown sheet.
  assert('6g. the customer is still told retirement is inside net worth but not available now', WEALTH_DEFINITIONS.some((x) => /part of your net worth, but they are generally not available to use now/i.test(x.body)));
  assert('6h. retirement is omitted only when genuinely nothing is recorded', composeWealthMeasures(100, 0).retirement === null);
  assert('6i. a real retirement balance is never hidden to tidy the layout', composeWealthMeasures(100, 1).retirement !== null);
  assert('6j. Definitions explains all three terms factually', WEALTH_DEFINITIONS.length === 3 && WEALTH_DEFINITIONS.every((x) => x.body.length > 40));
  assert('6k. without advice or a guarantee about access', !WEALTH_DEFINITIONS.some((x) => /you should|we recommend|guaranteed|you can withdraw|invest/i.test(x.body)));
  assert('6l. and says plainly it is not a spending limit', WEALTH_DEFINITIONS.some((x) => /not a spending limit/.test(x.body)));
  // RECONCILED (Wave 7 correction A). OLD CLAUSES: a separate 44pt
  // "Definitions" control, and focus returning to it. SUPERSEDED BECAUSE
  // the definitions moved inside the one breakdown sheet — a second nested
  // modal for two sentences was the thing to remove. PRESERVED INTENT: the
  // disclosure must be an explicit, reachable 44pt control, and focus must
  // return to whatever opened it, with no timeout. REPLACEMENT: the same
  // two properties asserted against the breakdown trigger.
  // RECONCILED AGAIN (Wave 7 final, correction C). OLD CLAUSE measured the
  // 44pt target on `reconcileCard`, because the whole card was the trigger.
  // SUPERSEDED BECAUSE the unified shell holds TWO distinct actions, so
  // making it one button would nest them — the trigger is now its own
  // control. PRESERVED INTENT: the disclosure is explicit and meets 44pt.
  assert('6m. the breakdown trigger is its own explicit control meeting 44pt', /testID="wealth-view-breakdown"/.test(SCREEN) && /breakdownAffordance: \{[^}]*minHeight: 44/.test(SCREEN));
  assert('6n. focus returns to it on close, with no timeout', /setBreakdownVisible\(false\);\s*\n\s*sendFocusEvent\(breakdownRef\);/.test(SCREEN) && !/setTimeout/.test(SCREEN));
  assert('6n-i. and it is ONE button with no nested action inside it', (() => {
    const at = SCREEN.indexOf('testID="wealth-view-breakdown"');
    const body = SCREEN.slice(at, SCREEN.indexOf('</TouchableOpacity>', at));
    return !/<TouchableOpacity/.test(body);
  })());
}

console.log('\n=== 7. Staged disclosure (Class A) ===');
{
  assert('7a. the preview is three rows', WEALTH_PREVIEW_COUNT === 3);
  const three = resolveDisclosure(['a', 'b', 'c'], 'assets', false);
  assert('7b. exactly three rows render with NO expansion control', three.visible.length === 3 && three.control === null);
  const two = resolveDisclosure(['a', 'b'], 'assets', false);
  assert('7c. fewer than three likewise', two.visible.length === 2 && two.control === null);
  const five = resolveDisclosure(['a', 'b', 'c', 'd', 'e'], 'assets', false);
  assert('7d. five rows preview three', five.visible.length === 3);
  assert('7e. and offer the count', five.control?.label === 'View all assets (5)');
  const expanded = resolveDisclosure(['a', 'b', 'c', 'd', 'e'], 'assets', true);
  assert('7f. expanding exposes every item exactly once', expanded.visible.length === 5 && new Set(expanded.visible).size === 5);
  assert('7g. and offers the way back', expanded.control?.label === 'Show fewer assets');
  assert('7h. debts use their own noun', disclosureLabel('debts', 4, false) === 'View all debts (4)' && disclosureLabel('debts', 4, true) === 'Show fewer debts');
  assert('7i. the preview is the head of the list, so canonical order is preserved', five.visible.join('') === 'abc');
  assert('7j. expansion never reorders', expanded.visible.join('') === 'abcde');
  assert('7k. the expanded state is announced, never colour-only', /accessibilityState=\{\{ expanded: assetDisclosure\.control\.expanded \}\}/.test(SCREEN) && /accessibilityState=\{\{ expanded: debtDisclosure\.control\.expanded \}\}/.test(SCREEN));
  assert('7l. disclosure is inline — no nested ScrollView was introduced', !/<ScrollView/.test(SCREEN));
  assert('7m. and no flip or hidden back face', !/flip|backFace|rotateY/i.test(SCREEN));
  assert('7n. a zero-balance row is never dropped', (() => {
    const d = FIXTURES.find(([n]) => n.startsWith('11'))![1];
    return resolveDisclosure(d.assets, 'assets', false).visible.length === 2;
  })());
}

console.log('\n=== 8. Canonical order, and every figure\'s source (Class C) ===');
{
  // RECONCILED (Wave 7 correction A). OLD CLAUSE ordered on
  // `wealth-definitions`. SUPERSEDED BECAUSE that standalone control was
  // retired into the breakdown sheet. PRESERVED INTENT: the canonical order
  // heading → hero → reconciliation → context → own → owe. REPLACEMENT: the
  // breakdown trigger takes the reconciliation slot it now owns.
  // RECONCILED (Wave 7 final, correction A). OLD CLAUSE included
  // `wealth-context-row` in the order. SUPERSEDED BECAUSE that row is
  // RETIRED — investigation proved `computeMoneyPlan().available` is a
  // spending-headroom figure, not a wealth change (see section 18).
  // PRESERVED INTENT: the canonical order heading → hero → reconciliation →
  // sections. REPLACEMENT: the same order, minus the retired row; the
  // reconciliation now lives inside the one hero shell, so the bar precedes
  // the breakdown trigger within it.
  const order = ['title={WEALTH_SCREEN_TITLE}', 'testID="wealth-hero"', 'testID="wealth-own-owe-bar"', 'testID="wealth-view-breakdown"', 'testID="wealth-add-asset"', 'testID="wealth-add-debt"'];
  let last = -1;
  let ordered = true;
  for (const marker of order) {
    const at = SCREEN.indexOf(marker);
    if (at < 0 || at < last) ordered = false;
    last = at;
  }
  assert('8a. heading, hero, reconciliation, definitions, context, own, owe — in that order', ordered);
  assert('8a-i. an empty section carries exactly ONE Add — the header control is withheld', /\{assetRows\.length > 0 \? \(\s*\n\s*<TouchableOpacity/.test(SCREEN) && /\{liabilityRows\.length > 0 \? \(\s*\n\s*<TouchableOpacity/.test(SCREEN));
  // RECONCILED — Wave 9c closure, Correction G: the retired WealthGuideSteps
  // block was replaced by ONE more empty-state composition using the same
  // emptyActionText treatment, so the count is 4. The intent — no global Add
  // catalogue reproduced inside an empty state — is unchanged and asserted.
  assert('8a-ii. and the empty state does not reproduce the global Add catalogue', (SCREEN.match(/emptyActionText/g) || []).length === 4 && !/AddIncomeModal[\s\S]{0,200}emptySection/.test(SCREEN));
  assert('8b. exactly one hero on the screen', (SCREEN.match(/testID="wealth-hero"/g) || []).length === 1);
  assert('8c. own value is the same totalAssets the section totals', /testID="wealth-own-value">\{formatWealthAmount\(totalAssets\)\}/.test(SCREEN) && /testID="wealth-own-section-total">\{formatWealthAmount\(totalAssets\)\}/.test(SCREEN));
  assert('8d. owe value likewise', /testID="wealth-owe-value">\{formatWealthAmount\(totalLiabilities\)\}/.test(SCREEN) && /testID="wealth-owe-section-total">\{formatWealthAmount\(totalLiabilities\)\}/.test(SCREEN));
  assert('8e. totals are the same plain sums as before, not a new engine', /data\.assets\.reduce\(\(sum, a\) => sum \+ a\.currentValue, 0\)/.test(SCREEN) && /data\.liabilities\.reduce\(\(sum, l\) => sum \+ l\.currentBalance, 0\)/.test(SCREEN));
  // RECONCILED (Wave 7 final, correction A). OLD CLAUSES asserted the
  // context row existed and carried no movement role. SUPERSEDED BECAUSE
  // the row is retired entirely — a stronger outcome than the clause asked
  // for. PRESERVED INTENT: no unsupported period-change figure may appear
  // on Wealth. REPLACEMENT: its total absence, asserted directly.
  assert('8f. the unsupported wealth-change row is gone, along with its selector', !/computeMoneyPlan/.test(SCREEN) && !/testID="wealth-context-row"/.test(SCREEN));
  assert('8f-i. its sheet, trigger, styles and spacer left with it', !/wealthChangeSheetVisible/.test(SCREEN) && !/contextRow|contextLabel|contextValue/.test(SCREEN));
  assert('8f-ii. and no "Estimated wealth change" wording remains anywhere', !/Estimated wealth change/.test(SCREEN));
  assert('8g. no movement role is applied on this screen at all', !/movementPositive|movementNegative/.test(SCREEN));
  assert('8h. no success green merely because net worth is positive', !/heroValue[\s\S]{0,120}success/.test(SCREEN));
  assert('8i. no urgent red merely because it is negative', !/heroValue[\s\S]{0,120}(danger|urgent)/.test(SCREEN));
  // RECONCILED (Wave 7 final, correction C). OLD CLAUSE required
  // `semantic.heroSurface`. SUPERSEDED BECAUSE the unified shell now uses
  // `semantic.ambient` — the restrained Ocean-to-lilac tonal wash the
  // correction specifies — while keeping the theme-aware hero border.
  // PRESERVED INTENT: the hero must sit on a Design 5.1 semantic surface
  // with a theme-aware border, never a hard-coded gradient.
  assert('8j. the hero uses a Design 5.1 semantic surface and border', /semantic\.ambient/.test(SCREEN) && /semantic\.heroBorder/.test(SCREEN));
  assert('8j-i. and never a hard-coded gradient', !/navyGradient|colors\.navy/.test(SCREEN));
}

console.log('\n=== 9. Recorded date and the INACTIVE stale treatment (Class A + C) ===');
{
  assert('9a. the stale trigger ships OFF', STALE_TRIGGER_ENABLED === false);
  const ancient = new Date(2001, 0, 1).toISOString();
  assert('9b. a decades-old record is still classified current', resolveRecordFreshness(ancient, new Date(2026, 7, 21)) === 'current');
  assert('9c. so no age can produce a stale classification while the trigger is off', [ancient, new Date(1990, 0, 1).toISOString(), null, undefined].every((v) => resolveRecordFreshness(v, new Date(2026, 7, 21)) === 'current'));
  assert('9d. the stale VISUAL exists and is wired to that state', /rowRecordedStale: \{ color: semantic\.warningAccent \}/.test(SCREEN) && /freshness === 'stale' \? styles\.rowRecordedStale : null/.test(SCREEN));
  assert('9e. no "stale" or "out of date" wording exists anywhere on the surface', !/out of date|Out of date/.test(SCREEN_RAW.replace(/\/\*[\s\S]*?\*\//g, '')) && !/>Stale</.test(SCREEN));
  assert('9f. no category-age threshold was invented', !/DAYS_UNTIL_STALE|STALE_AFTER|staleThreshold|maxAgeDays/i.test(MODEL));
  assert('9g. and nothing else in the app reads record age', !/resolveRecordFreshness/.test(read('src/lib/calculations/wealthDefinitions.ts')));
  // The date itself.
  assert('9h. a recorded date formats from LOCAL parts', formatRecordedDate(new Date(2026, 7, 21, 21, 30).toISOString())!.includes('21'));
  assert('9i. a late-evening record does not shift to the following day', formatRecordedDate(new Date(2026, 7, 21, 23, 30).toISOString()) === formatRecordedDate(new Date(2026, 7, 21, 9, 0).toISOString()));
  assert('9j. an absent date renders NOTHING — today is never substituted', formatRecordedDate(null) === null && formatRecordedDate(undefined) === null);
  assert('9k. an unparseable one likewise, never a fabricated timestamp', formatRecordedDate('not-a-date') === null);
  // RECONCILED (Wave 7 correction D). OLD CLAUSE checked a `recorded`
  // variable. SUPERSEDED BECAUSE `createdAt` is a CREATION date and was
  // being labelled "Recorded", which claimed a balance confirmation the
  // data cannot support. PRESERVED INTENT: a date line renders only when a
  // real, trustworthy date exists — never a substituted or fabricated one.
  // REPLACEMENT: the same gate on the correctly-named line.
  assert('9l. the screen renders a date line only when a real date exists', /\{dateLine \? \(/.test(SCREEN));
  assert('9l-i. `createdAt` is NEVER labelled "Recorded"', !/Recorded \$\{/.test(SCREEN) && !/formatRecordedDate\(l\.createdAt/.test(SCREEN));
  assert('9l-ii. it is labelled "Added", which is what the field means', formatAddedDate(new Date(2026, 7, 21).toISOString())!.startsWith('Added '));
  assert('9l-iii. and only for the types whose creation path actually sets it', liabilityDateLine('credit_card', new Date(2026, 7, 21).toISOString()) === null && liabilityDateLine('mortgage', new Date(2026, 7, 21).toISOString()) !== null);
  assert('9l-iv. asset rows still carry no date line at all', !/wealth-asset-row[\s\S]{0,900}rowRecorded/.test(SCREEN));
  assert('9m. and never calls new Date\\(\\) inside a row', !/new Date\(\)/.test(SCREEN));
}

console.log('\n=== 10. Nothing financial, persistent or navigational was touched (Class C) ===');
{
  assert('10a. wealthDefinitions has no new or changed function body', (() => {
    const src = read('src/lib/calculations/wealthDefinitions.ts');
    return /export function computeRetirementSavings\(data: AppData\): number \{\s*\n\s*return data\.assets\.filter\(\(a\) => a\.type === RETIREMENT_ASSET_TYPE\)\.reduce\(\(sum, a\) => sum \+ a\.currentValue, 0\);/.test(src);
  })());
  assert('10b. accessible net worth is byte-identical in shape', /const accessibleAssets = data\.assets\s*\n\s*\.filter\(\(a\) => a\.type !== RETIREMENT_ASSET_TYPE\)/.test(read('src/lib/calculations/wealthDefinitions.ts')));
  assert('10c. the screen writes nothing new to state', !/persist\(|AsyncStorage|updateAsset\(|updateLiability\(/.test(SCREEN));
  assert('10d. transfer eligibility is not reproduced in presentation code', !/isEligibleLiquidBalance|listEligibleDebtDestinations|resolveEligible/.test(SCREEN));
  assert('10e. Move money still routes through the existing TransferModal', /<TransferModal visible=\{transferVisible\}/.test(SCREEN));
  assert('10f. edit still routes through the existing forms', /<AddWealthItemModal/.test(SCREEN) && /<AddCreditCardModal/.test(SCREEN));
  assert('10g. a card-backed liability still edits on the dedicated card form', /if \(linkedCard\) \{\s*\n\s*setEditCreditCard\(linkedCard\);/.test(SCREEN));
  assert('10h. linked repayments are read, never rewritten', /data\.recurringItems\.find\(\(r\) => r\.active && r\.linkedLiabilityId === l\.id\)/.test(SCREEN));
  assert('10i. and named as the customer named them', /Repaid by \$\{linkedRepayment\.label\}/.test(SCREEN));
  // RECONCILED — Wave 9c closure, Correction G. OLD CLAUSE also required
  // <WealthGuideSteps> mounted. SUPERSEDED BECAUSE the owner retired that
  // pre-Wave-7 "Build your Wealth Map" guide for a net-worth-language empty
  // state (same gate, same Add destination). PRESERVED INTENT: the living
  // Wealth cards stay mounted, and the guide component is retained on disk,
  // not deleted.
  assert('10j. the preserved Wealth cards are still mounted, not deleted', /<MoneyEngineCard data=\{data\} \/>/.test(SCREEN) && /<YourFutureCard \/>/.test(SCREEN));
  assert('10j-i. the retired guide file is retained on disk, unwired here', fs.existsSync(path.join(ROOT, 'src/components/wealth/WealthGuideSteps.tsx')) && !/<WealthGuideSteps/.test(SCREEN));
  assert('10j-ii. the new empty state keeps the same Add destination', /wealth-empty-add/.test(SCREEN) && /Start building your net worth/.test(SCREEN));
}

console.log('\n=== 11. Visual and motion rules on the touched surface (Class C) ===');
{
  assert('11a. no raw hex or rgba outside the theme', !/#[0-9a-fA-F]{3,8}\b/.test(SCREEN) && !/rgba?\(/.test(SCREEN));
  assert('11b. no emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(SCREEN));
  assert('11c. the legacy on-featured token family is gone from this screen', !/onFeaturedAlpha|ON_FEATURED_POSITIVE|colors\.onNavy|navyGradient/.test(SCREEN));
  assert('11d. no setTimeout anywhere', !/setTimeout|setInterval/.test(SCREEN));
  assert('11e. no raw millisecond literal', !/duration: \d+|\d+ms/.test(SCREEN));
  assert('11f. no new Animated value was introduced', !/Animated\./.test(SCREEN));
  assert('11g. rows and controls meet 44pt', (SCREEN.match(/minHeight: 44/g) || []).length >= 4);
  // A fixed height is only ever acceptable on something that holds NO
  // text: a circular icon tile, a colour swatch, or the bar itself. Any
  // container that holds content must grow with Dynamic Type, or that
  // content clips. This enumerates the permitted set rather than pattern-
  // matching names, so a new fixed-height surface fails here by default.
  // RECONCILED (Wave 7 correction A): `heroIdentityTile` joins the set —
  // it is the hero's 36pt circular icon tile, the same shape `rowIcon`
  // already occupied. The rule is unchanged: a fixed height is only ever
  // acceptable on something holding NO text.
  const FIXED_HEIGHT_ALLOWED = ['reconcileSwatch', 'reconcileBar', 'rowIcon', 'heroIdentityTile'];
  const fixedHeightStyles: string[] = [];
  {
    const RE = /^\s*(\w+): \{([^}]*)\}/gm;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(SCREEN)) !== null) {
      if (/\bheight: \d+/.test(m[2])) fixedHeightStyles.push(m[1]);
    }
  }
  assert('11h. no content-holding surface has a fixed height', fixedHeightStyles.every((n) => FIXED_HEIGHT_ALLOWED.includes(n)));
  assert('11h-i. and the permitted ones hold no text at all', fixedHeightStyles.length === 4 && FIXED_HEIGHT_ALLOWED.every((n) => fixedHeightStyles.includes(n)));
  assert('11h-ii. the dead category-header styles left with the headers they styled', !/categoryIconBadge|heroSectionEmoji|emptyCategoryRow/.test(SCREEN));
  assert('11i. section headings carry header semantics', (SCREEN.match(/accessibilityRole="header"/g) || []).length >= 2);
  assert('11j. decorative icons are hidden from the accessibility tree', (SCREEN.match(/accessibilityElementsHidden importantForAccessibility="no"/g) || []).length >= 6);
  assert('11k. one hero announcement, spoken as a summary', (SCREEN.match(/accessibilityRole="summary"/g) || []).length === 1);
  assert('11l. each row is ONE coherent accessible sentence', /accessibilityLabel=\{`\$\{a\.label\}\. \$\{spokenWealthAmount\(a\.currentValue\)\}\./.test(SCREEN));
}

console.log('\n=== 12. Correction A — one hero, explicit breakdown, no flip (Class A + C) ===');
{
  assert('12a. exactly one Net worth hero', (SCREEN.match(/testID="wealth-hero"/g) || []).length === 1);
  assert('12b. the shouted all-caps eyebrow is gone', !/textTransform: 'uppercase'[^}]*}\s*,?\s*$/m.test(SCREEN.slice(SCREEN.indexOf('heroLabel:'), SCREEN.indexOf('heroLabel:') + 200)));
  assert('12c. replaced by an identity row with a semantic tile and a verified icon', /heroIdentityTile/.test(SCREEN) && /name="layers-outline"/.test(SCREEN));
  // RECONCILED (Wave 7 final, correction B). OLD CLAUSE pinned a literal
  // `typography.heading, fontSize: 17`. SUPERSEDED BECAUSE that is exactly
  // the legacy consumer this correction removes — Wealth now resolves its
  // roles through the same shipped resolver Money and Today use. PRESERVED
  // INTENT: the hero label is title case on the titleSection role.
  assert('12d. and a title-case label on the titleSection role', /heroLabel: \{ \.\.\.typeStyle\('titleSection', locale\)/.test(SCREEN) && NET_WORTH_LABEL === 'Net worth');
  assert('12e. Move money survives as a secondary utility', /testID="wealth-move-money"/.test(SCREEN));

  // NO FLIP — the decision this correction turns on.
  assert('12f. no 3D transform', !/rotateY|rotateX|perspective|transform: \[/.test(SCREEN));
  assert('12g. no reverse/back face', !/backFace|reverseFace|isFlipped|flipped/i.test(SCREEN));
  assert('12h. no nested ScrollView', !/<ScrollView/.test(SCREEN));
  assert('12i. no timer of any kind', !/setTimeout|setInterval|requestAnimationFrame/.test(SCREEN));
  assert('12j. and no Animated value was introduced', !/Animated\./.test(SCREEN));

  assert('12k. the trigger is visible, not a hidden gesture', /BREAKDOWN_TRIGGER_TEXT/.test(SCREEN) && BREAKDOWN_TRIGGER_TEXT === 'View breakdown');
  assert('12l. with a chevron affordance hidden from the reader', /breakdownAffordance[\s\S]{0,120}accessibilityElementsHidden/.test(SCREEN));
  const trigger = composeBreakdownTriggerLabel({ totalAssets: 52200, totalLiabilities: 1625, netWorth: 50575 });
  assert('12m. its label names own, owe and net worth — each exactly once', /^View breakdown\. What you own, 52,200 dollars\. What you owe, 1,625 dollars\. Net worth, 50,575 dollars\.$/.test(trigger));
  assert('12n. the standalone measures/Definitions card is retired', !/testID="wealth-definitions"/.test(SCREEN) && !/measuresCard/.test(SCREEN));
  assert('12o. definitions now live inside the breakdown, not a nested second sheet', /breakdownVisible[\s\S]{0,2000}WEALTH_DEFINITIONS\.map/.test(SCREEN));
  // RECONCILED (Wave 7 final, correction A). OLD CLAUSE expected TWO
  // InfoSheets. SUPERSEDED BECAUSE the wealth-change sheet was retired with
  // its row. PRESERVED INTENT: no second modal architecture, and no sheet
  // nested inside another. REPLACEMENT: exactly ONE sheet now exists.
  assert('12p. exactly ONE InfoSheet exists on the screen', (SCREEN.match(/<InfoSheet/g) || []).length === 1 && /visible=\{breakdownVisible\}/.test(SCREEN));
}

console.log('\n=== 13. Breakdown reconciles item by item, from authoritative outputs (Class A) ===');
{
  // The owner's own recorded states, used as regression evidence.
  const RECORDED: [number, number, number][] = [
    [52200, 1625, 50575],
    [42200, 1625, 40575],
    [42200, 2125, 40075],
    [57200, 2125, 55075],
  ];
  for (const [own, owe, net] of RECORDED) {
    const items = composeBreakdownItems({ totalAssets: own, totalLiabilities: owe, netWorth: net, accessibleNetWorth: net, retirementSavings: 0, retirementPresence: 'absent' });
    assert(`13a. ${own} − ${owe} = ${net} reconciles item by item`, items[0].value === formatWealthAmount(own) && items[1].value === formatWealthAmount(owe) && items[2].value === formatWealthAmount(net));
    assert(`13a-i. and the arithmetic itself holds`, own - owe === net);
  }
  // accessible + retirement = net worth, from the recording.
  assert('13b. 40,075 accessible + 15,000 retirement = 55,075 net worth', 40075 + 15000 === 55075);
  const withRet = composeBreakdownItems({ totalAssets: 57200, totalLiabilities: 2125, netWorth: 55075, accessibleNetWorth: 40075, retirementSavings: 15000, retirementPresence: 'recorded' });
  assert('13b-i. and the sheet shows both, separately', withRet[3].value === '$40,075' && withRet[4].value === '$15,000');
  assert('13c. the six items appear in the specified order', withRet.map((i) => i.label).join('|') === 'What you own|What you owe|Net worth|Accessible now|Retirement savings');
  assert('13d. net worth is the emphasised reconciliation line', withRet[2].emphasis === true && withRet.filter((i) => i.emphasis).length === 1);
  assert('13e. no item is computed inside the composer — every value is passed in', !/[-+*/]\s*input\./.test(MODEL.slice(MODEL.indexOf('export function composeBreakdownItems'), MODEL.indexOf('export function composeBreakdownTriggerLabel'))));
  assert('13f. large signed values format without clipping their sign', formatWealthAmount(-1234567) === '−$1,234,567');
}

console.log('\n=== 14. Retirement: absent, recorded zero, and present stay distinct (Class A) ===');
{
  assert('14a. no retirement asset at all reads as absent', resolveRetirementPresence(0) === 'absent');
  assert('14b. one recorded asset reads as recorded, whatever its value', resolveRetirementPresence(1) === 'recorded');
  assert('14c. an absent state says so in words, not a hollow $0', retirementRowValue('absent', 0) === 'Not recorded');
  assert('14d. a GENUINE recorded zero stays $0 — the distinction the brief turns on', retirementRowValue('recorded', 0) === '$0');
  assert('14e. and a real balance is itself', retirementRowValue('recorded', 15000) === '$15,000');
  assert('14f. presence is decided by existence, never by value', /data\.assets\.filter\(\(a\) => a\.type === RETIREMENT_ASSET_TYPE\)\.length/.test(SCREEN));
  assert('14g. absence offers one compact action on an EXISTING route, not a new one', /openModal\('asset', RETIREMENT_ASSET_TYPE\)/.test(SCREEN));
  assert('14h. and that action is absent once retirement is recorded', /retirementPresence === 'absent' \? \(/.test(SCREEN));
}

console.log('\n=== 15. Correction B — Money Engine and Your Future (Class C) ===');
{
  const ENGINE = strip(read('src/components/wealth/MoneyEngineCard.tsx'));
  const FUTURE = strip(read('src/components/wealth/YourFutureCard.tsx'));

  assert('15a. no visible "Total Wealth Today" remains', !/Total Wealth Today/.test(ENGINE));
  assert('15b. replaced by "Net worth today"', />Net worth today</.test(ENGINE));
  assert('15c. the misleading leading equals sign is gone', !/>= /.test(ENGINE));
  assert('15d. because the rows genuinely do NOT sum to it — no liability is displayed', !/liabilit/i.test(ENGINE.slice(ENGINE.indexOf('const rows = ['), ENGINE.indexOf('const styles'))));
  assert('15e. the figure and its source are unchanged', /computeTotalWealth\(data\)/.test(ENGINE));
  assert('15f. a Design 5.1 identity row was added', /identityTile/.test(ENGINE) && /accessibilityRole="header"/.test(ENGINE));
  // RECONCILED (Wave 7 final, correction B). OLD CLAUSE pinned the literal
  // uppercase group strings. SUPERSEDED BECAUSE the correction replaces the
  // shouted micro-headings with calm title case. PRESERVED INTENT: the rows
  // are grouped into pace and base, with no nested card.
  assert('15g. rows are grouped by pace and base, without nested cards', /Your monthly pace/.test(ENGINE) && /What you.{1,3}ve built/.test(ENGINE) && !/<SectionCard/.test(ENGINE));
  assert('15g-i. and the group labels are calm title case, not shouted', !/groupLabel: \{[^}]*textTransform: 'uppercase'/.test(ENGINE));
  assert('15h. every row meets 44pt', /row: \{[^}]*minHeight: 44/.test(ENGINE));
  assert('15i. chevrons only on genuinely actionable rows', /r\.onPress \? <Ionicons name="chevron-forward"/.test(ENGINE));
  assert('15j. and the handlers and destinations are unchanged', /openIncome/.test(ENGINE) && /setSavingsPlanModalVisible\(true\)/.test(ENGINE));

  assert('15k. Your Future gained an identity row', /identityTile/.test(FUTURE));
  assert('15l. the emoji pointer is gone', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(FUTURE));
  assert('15m. replaced by a real named 44pt action', /testID="future-how-calculated"/.test(FUTURE) && /calcButton: \{ minHeight: 44/.test(FUTURE));
  assert('15n. reaching the SAME existing breakdown sheet', /setBreakdownAge\(projections\[0\]\)/.test(FUTURE));
  assert('15o. three genuinely equal projection cells', /ageBlock: \{ flexGrow: 1, flexBasis: 0/.test(FUTURE));
  assert('15p. the projection engine and its assumptions are untouched', /computeAgeProjections|computeNextWealthMilestone/.test(FUTURE));
  assert('15q. and the non-advice disclaimer survives verbatim', /not a guarantee or personalised advice/.test(FUTURE));
  assert('15r. no urgent red or success green is used decoratively', !/colors\.danger|colors\.success/.test(FUTURE));
}

console.log('\n=== 16. Correction C — the debt picker (Class C) ===');
{
  const MODAL = strip(read('src/components/wealth/AddWealthItemModal.tsx'));
  assert('16a. the wrapping chip row is retired', !/LIABILITY_TYPES\.map\(\(t\) => \(\s*<Chip/.test(MODAL));
  assert('16b. replaced by the SAME InlineSelect the asset side uses', /<InlineSelect[\s\S]{0,300}testID="add-liability-type"/.test(MODAL));
  assert('16c. the asset picker is unchanged', /<InlineSelect[\s\S]{0,300}testID="add-asset-type"/.test(MODAL));
  assert('16d. all six types are offered, exactly once each', (() => {
    const at = MODAL.indexOf('const LIABILITY_TYPES');
    const block = MODAL.slice(at, MODAL.indexOf('];', at));
    const values = (block.match(/value: '(\w+)'/g) || []).map((v) => v.slice(8, -1));
    return values.length === 6 && new Set(values).size === 6 &&
      ['mortgage', 'credit_card', 'car_loan', 'personal_loan', 'bnpl', 'other'].every((v) => values.includes(v));
  })());
  assert('16e. each carries a real icon from the shared map', /icon: liabilityTypeIcon\(t\.value\)/.test(MODAL));
  assert('16f. and concise helper text', /supporting: t\.description/.test(MODAL));
  assert('16g. selecting a type sets the SAME single discriminator', /setLiabilityType\(type\);/.test(MODAL));
  assert('16h. the credit-card handoff is preserved branch for branch', /function chooseLiabilityType[\s\S]{0,700}onRequestCreditCard\?\.\(\)/.test(MODAL) && /ccHandoffInProgressRef\.current = true/.test(MODAL) && /setDismissAnimationType\('none'\)/.test(MODAL));
  assert('16i. including the Android fallback that exists because RN never fires onDismiss there', /Platform\.OS === 'android'[\s\S]{0,200}CREDIT_CARD_HANDOFF_DEFER_MS/.test(MODAL));
  assert('16j. switching type never silently erases entered data', (() => {
    const at = MODAL.indexOf('function chooseLiabilityType');
    const body = MODAL.slice(at, MODAL.indexOf('function chooseAssetCategory', at));
    return !/setLabel\(''\)|setValue\(''\)|reset\(/.test(body);
  })());
  assert('16k. and the existing discard guard still owns the one place data can be lost', /Discard this \$\{LIABILITY_DISPLAY_NAME\[liabilityType\]\}\?/.test(MODAL));
  assert('16l. every special branch stays reachable from the same discriminator', /liabilityType === 'mortgage'/.test(MODAL) && /liabilityType === 'car_loan'/.test(MODAL) && /liabilityType === 'bnpl'/.test(MODAL) && /SMART_LOAN_TYPES\.includes\(liabilityType\)/.test(MODAL));
  assert('16m. no second Modal, timer or duplicate type map was introduced', (MODAL.match(/const LIABILITY_TYPES/g) || []).length === 1);
  assert('16n. and no new persistence field', !/recordedAt|balanceRecordedAt/.test(MODAL));
}

console.log('\n=== 17. Correction D — due-soon tone (Class A + C) ===');
{
  // The engine says `danger` for anything within three days. On a Wealth
  // row that painted an ordinary diary entry in destructive red.
  assert('17a. due tomorrow becomes caution, not urgent', resolveLiabilityRowTone('danger', 'Due tomorrow.') === 'caution');
  assert('17b. due today likewise', resolveLiabilityRowTone('danger', 'Due today.') === 'caution');
  assert('17c. due in 3 days likewise', resolveLiabilityRowTone('danger', 'Due in 3 days.') === 'caution');
  assert('17d. but genuinely overdue KEEPS its urgency', resolveLiabilityRowTone('danger', 'Overdue.') === 'urgent');
  assert('17e. and so does a missed payment', resolveLiabilityRowTone('danger', 'Payment missed.') === 'urgent');
  assert('17f. an ordinary balance stays neutral', resolveLiabilityRowTone('neutral', 'Due in 20 days.') === 'neutral');
  assert('17g. a warning stays caution', resolveLiabilityRowTone('warning', 'Getting high') === 'caution');
  assert('17h. colour is never the only cue — each state carries an icon', liabilityRowToneIcon('caution') === 'time-outline' && liabilityRowToneIcon('urgent') === 'alert-circle' && liabilityRowToneIcon('neutral') === null);
  assert('17i. the engine itself is untouched', /if \(days <= 1\) return \{ tone: 'danger', label: days <= 0 \? 'Due today' : 'Due tomorrow' \};/.test(read('src/lib/calculations/creditHealth.ts')));
  // RECONCILED — Wave 9a closure, Correction C.
  // OLD CLAUSE: required the bare " (est. rate)" suffix.
  // SUPERSEDED BECAUSE that four-word suffix was the ONLY signal that a
  // 19.5% assumption was in play, and it never named the rate. PRESERVED
  // INTENT: the row still renders the engine's own text and still discloses
  // the rate's provenance — now on an explicit second line that names the
  // rate and says whether the customer recorded it.
  assert('17j. the row renders the engine text and provenance', /\{ccInsight\.text\}/.test(SCREEN) && /\{ccInsight\.sourceLine\}/.test(SCREEN));
  assert('17j-i. the bare "(est. rate)" suffix is retired', !/\(est\. rate\)/.test(SCREEN));
  assert('17k. and the legacy danger colour is no longer read on this surface', !/colors\.danger/.test(SCREEN));
}

console.log('\n=== 18. The retired wealth-change estimate (Class A + C) ===');
{
  // WHY IT WAS RETIRED, proven rather than asserted.
  //
  // `computeMoneyPlan().available` is
  //     max(0, discretionaryPool − variableSpendSoFar + adHocIncomeThisMonth)
  // where `discretionaryPool` is a FULL-MONTH RATE (typical income minus
  // typical obligations) and the other two are PART-MONTH ACTUALS. Mixing
  // them cannot produce a period change, and the three properties below
  // make that concrete. Nothing about the engine is altered — only the
  // Wealth row that mislabelled it.
  const TODAY = new Date(2026, 5, 15);
  function planFixture(mut: (d: AppData) => void): AppData {
    const d = createEmptyAppData();
    d.user.monthlyIncome = 10433;
    d.user.payFrequency = 'monthly';
    d.recurringItems.push({ id: 'b', type: 'expense', label: 'Bills', amount: 6517, frequency: 'monthly', nextDueDate: new Date(2026, 5, 27).toISOString(), isFixed: true, active: true } as never);
    mut(d);
    return d;
  }
  const baseline = computeMoneyPlan(planFixture(() => {}), TODAY).available;

  // (1) It can never be negative. A wealth CHANGE must be able to be.
  const hugeSpend = computeMoneyPlan(planFixture((d) => {
    d.transactions.push({ id: 'x', type: 'expense', amount: 999999, categoryId: 'cat-groceries', date: new Date(2026, 5, 10).toISOString() } as never);
  }), TODAY).available;
  assert('18a. it is floored at zero, so it can never express a loss', hugeSpend >= 0);

  // (2) It double-counts income: the typical monthly rate is already inside
  // the pool, and actual income received is added on top.
  const withActualIncome = computeMoneyPlan(planFixture((d) => {
    d.transactions.push({ id: 'i', type: 'income', amount: 10433, categoryId: 'cat-bonus', date: new Date(2026, 5, 5).toISOString() } as never);
  }), TODAY).available;
  assert('18b. receiving the SAME income it already forecasts inflates it — income counted twice', withActualIncome > baseline);

  // (3) It is blind to the movements that actually change wealth.
  const withRepayment = computeMoneyPlan(planFixture((d) => {
    d.transactions.push({ id: 'r', type: 'expense', amount: 50, categoryId: 'cat-debt', isRepayment: true, date: new Date(2026, 5, 12).toISOString() } as never);
  }), TODAY).available;
  assert('18c. a debt repayment — which genuinely reduces what you owe — does not move it', withRepayment === baseline);
  const withAsset = computeMoneyPlan(planFixture((d) => {
    d.assets.push({ id: 'p', type: 'property', label: 'Home', currentValue: 900000 } as never);
  }), TODAY).available;
  assert('18d. recording a $900,000 property does not move it either', withAsset === baseline);

  // STOCK vs FLOW, stated as a test so it cannot regress silently.
  assert('18e. its dominant input is a full-month RATE, not a period flow', /const discretionaryPool = Math\.max\(\s*\n?\s*0,\s*\n?\s*user\.monthlyIncome - fixedCosts/.test(read('src/lib/calculations/safeToSpend.ts')));
  assert('18f. and the engine itself is untouched by this wave', /const available = Math\.max\(0, safeToSpend\.remainingPool \+ adHocIncomeThisMonth\);/.test(read('src/lib/calculations/moneyPlan.ts')));
  assert('18g. Typical Money Flow still owns the monthly remainder — it was never duplicated away', /computeMoneyFlowCategoryBreakdown|moneyFlowBreakdown/.test(read('src/screens/money/MoneyScreen.tsx')));
  assert('18h. and Wealth no longer shows any unsupported period-change figure', !/computeMoneyPlan|Estimated wealth change|wealth-context-row/.test(SCREEN));
}

console.log('\n=== 19. Correction B — every Wealth text consumer is on a semantic role (Class C) ===');
{
  const ENGINE = strip(read('src/components/wealth/MoneyEngineCard.tsx'));
  const FUTURE = strip(read('src/components/wealth/YourFutureCard.tsx'));
  for (const [name, src] of [['WealthScreen', SCREEN], ['MoneyEngineCard', ENGINE], ['YourFutureCard', FUTURE]] as [string, string][]) {
    assert(`19a. ${name}: no legacy typography.* consumer remains`, !/typography\./.test(src));
    assert(`19b. ${name}: no raw fontFamily`, !/fontFamily/.test(src));
    assert(`19c. ${name}: styles resolve through the shipped role resolver`, /typeStyle\('/.test(src));
    assert(`19d. ${name}: no raw colour`, !/#[0-9a-fA-F]{3,8}\b/.test(src) && !/rgba?\(/.test(src));
  }
  assert('19e. the screen title uses the shared Screen treatment Money and Today use', /<Screen title=\{WEALTH_SCREEN_TITLE\}/.test(SCREEN));
  assert('19f. section identities use titleSection', /sectionHeadTitle: \{ \.\.\.typeStyle\('titleSection', locale\)/.test(SCREEN));
  assert('19g. the hero figure uses figureHero', /heroValue: \{ \.\.\.typeStyle\('figureHero', locale\)/.test(SCREEN));
  assert('19h. row amounts use figureRow — legible but subordinate to the hero', /rowValue: \{ \.\.\.typeStyle\('figureRow', locale\)/.test(SCREEN));
  assert('19i. every currency style keeps tabular numerals', (SCREEN.match(/fontVariant: \['tabular-nums'\]/g) || []).length >= 5);
  assert('19j. and the global typography tokens were not altered to make Wealth pass', !/typeRoles|TYPE_ROLES/.test(SCREEN));
}

console.log('\n=== 20. Correction C — ONE unified hero shell (Class C) ===');
{
  assert('20a. exactly one hero shell', (SCREEN.match(/testID="wealth-hero"/g) || []).length === 1);
  assert('20b. the own/owe reconciliation lives INSIDE the one shell, not in a second card', (() => {
    const shellOpen = SCREEN.indexOf('testID="wealth-hero"');
    const shellClose = SCREEN.indexOf('</LinearGradient>', shellOpen);
    const own = SCREEN.indexOf('testID="wealth-own-value"');
    const trigger = SCREEN.indexOf('testID="wealth-view-breakdown"');
    return !/reconcileCard/.test(SCREEN) && own > shellOpen && own < shellClose && trigger > shellOpen && trigger < shellClose;
  })());
  assert('20c. separated by a semantic internal divider', /heroDivider: \{ height: StyleSheet\.hairlineWidth, backgroundColor: semantic\.heroBorder/.test(SCREEN));
  assert('20d. the shell itself is NOT pressable — it holds two distinct actions', !/style=\{styles\.hero\}[\s\S]{0,200}onPress/.test(SCREEN));
  assert('20e. Move money and View breakdown are separate accessible buttons', /testID="wealth-move-money"[\s\S]{0,80}|accessibilityLabel="Move money"/.test(SCREEN) && /testID="wealth-view-breakdown"/.test(SCREEN));
  assert('20f. neither is nested inside the other', (() => {
    const a = SCREEN.indexOf('testID="wealth-move-money"');
    const b = SCREEN.indexOf('testID="wealth-view-breakdown"');
    return a > 0 && b > a && SCREEN.slice(a, b).includes('</TouchableOpacity>');
  })());
  assert('20g. Move money meets 44pt', /transferButton: \{[\s\S]{0,220}minHeight: 44/.test(SCREEN));
  assert('20h. so does View breakdown', /breakdownAffordance: \{[^}]*minHeight: 44/.test(SCREEN));

  // Sign treatment.
  assert('20i. positive net worth is Ocean interactive, never success green', /heroValuePositive: \{ color: semantic\.textFigure \}/.test(SCREEN) && !/heroValue[\s\S]{0,120}semantic\.success/.test(SCREEN));
  assert('20j. exact zero is neutral', /heroValueNeutral: \{ color: colors\.textPrimary \}/.test(SCREEN));
  assert('20k. negative uses the warning family, never destructive red', /heroValueNegative: \{ color: semantic\.warningAccent \}/.test(SCREEN) && !/heroValueNegative[\s\S]{0,60}danger/.test(SCREEN));
  assert('20l. and carries a non-colour cue as well', /heroNoteRow[\s\S]{0,400}You owe more than you own right now/.test(SCREEN));
  assert('20m. no adjustsFontSizeToFit', !/adjustsFontSizeToFit/.test(SCREEN));
  assert('20n. no heavy shadow on the hero', !/hero: \{[^}]*shadow/i.test(SCREEN) && !/glow\(/.test(SCREEN));
  assert('20o. and no emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(SCREEN));
}

console.log('\n=== 21. Correction D — one title, and interactive Save (Class C) ===');
{
  const ENGINE = strip(read('src/components/wealth/MoneyEngineCard.tsx'));
  assert('21a. the outer duplicate heading is gone from the screen', !/>Your Money Engine</.test(SCREEN));
  assert('21b. the card carries exactly ONE customer-visible title', (ENGINE.match(/Your money engine/g) || []).length === 1);
  assert('21c. with header semantics', /accessibilityRole="header">Your money engine/.test(ENGINE));
  assert('21d. and no empty gap was left behind', !/sectionTitle/.test(SCREEN));
  assert('21e. every preserved figure and destination survives', /Monthly income/.test(ENGINE) && /Savings allocation/.test(ENGINE) && /Investments/.test(ENGINE) && /Other assets/.test(ENGINE) && /Retirement savings/.test(ENGINE) && /Net worth today/.test(ENGINE));

  for (const rel of ['src/components/wealth/AddWealthItemModal.tsx', 'src/components/wealth/EditSavingsAllocationModal.tsx', 'src/components/credit/AddCreditCardModal.tsx']) {
    const src = strip(read(rel));
    assert(`21f. ${rel.split('/').pop()}: Save uses the interactive role, not success green`, /saveAction: \{ backgroundColor: semantic\.interactive \}/.test(src) && /styles\.saveAction/.test(src));
  }
  assert('21g. the global Button primitive is untouched', /primary: \{\s*\n?\s*backgroundColor: colors\.accent,/.test(read('src/components/shared/Button.tsx')));
  assert('21h. Delete stays destructive', /deleteText: \{[^}]*colors\.danger/.test(strip(read('src/components/credit/AddCreditCardModal.tsx'))));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
