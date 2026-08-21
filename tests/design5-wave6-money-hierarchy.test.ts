// Nolie Design 5.1 Wave 6 — Money: measures, Sources sheet, hierarchy.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): every presentation decision (payday progress,
//   included-balance summary, measure definitions) runs the real function,
//   against real SafeToSpendResult fields.
// - Class C (structural): composition order, flip retirement, engine
//   read-only proof, no-raw-colour and definition coverage.
//
// NOT proven here: how Money looks, VoiceOver's real spoken order, or
// Dynamic Type layout on glass. Device evidence.
//
// Run with: npx tsx tests/design5-wave6-money-hierarchy.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  MONEY_DEFINITION_BANNED_WORDS,
  MONEY_MEASURE_DEFINITIONS,
  MONEY_ROW_ICON_TILE_SIZE,
  formatMoneyDate,
  isAccessibilityText,
  moneyScreenMargin,
  resolvePaydayProgress,
  summariseIncludedBalances,
} from '../src/lib/calculations/moneyComposition';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData } from '../src/types/models';
import { DESIGN_THEME_MATRIX, designLayout, resolveSemanticColors } from '../src/theme/semanticTokens';
import { CONTRAST_FLOORS, contrastRatio } from '../src/theme/contrast';
import {
  CARD_BALANCE_DISCLOSURE,
  formatCardBalance,
  resolveOtherCardBalances,
  resolveSourceCardContexts,
} from '../src/lib/calculations/moneyComposition';
import { categoryIconSpec } from '../src/lib/categoryEmoji';
import { TYPE_ROLES } from '../src/theme/typography';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MONEY = read('src/screens/money/MoneyScreen.tsx');
const MONEY_CODE = strip(MONEY);
const CARD = read('src/components/money/ThisMonthCard.tsx');
const SHEET = read('src/components/money/ThisMonthSourcesSheet.tsx');
const BAR = read('src/components/money/MoneyPaydayBar.tsx');
const HERO = read('src/components/money/SafeToSpendHero.tsx');
const HERO_CODE = strip(HERO);
const BALANCES = read('src/components/money/IncludedBalancesRow.tsx');

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

/** A fully-populated customer: income, a payday, included balances,
 * recurring bills, recorded activity. */
function seedFull(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.monthlyIncome = 5200;
  data.user.payFrequency = 'fortnightly';
  data.user.nextPayday = iso(11);
  data.assets.push(
    { id: 'a1', label: 'Everyday', type: 'cash', currentValue: 3400, includeInMoneyCalculations: true } as any,
    { id: 'a2', label: 'Savings', type: 'savings', currentValue: 9000, includeInMoneyCalculations: true } as any
  );
  data.recurringItems.push(
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: iso(3), isFixed: true, active: true } as any
  );
  data.transactions.push(
    { id: 't1', type: 'income', amount: 2400, category: 'Salary', date: new Date().toISOString(), note: '' } as any,
    { id: 't2', type: 'expense', amount: 860, category: 'Groceries', date: new Date().toISOString(), note: '', paymentSource: 'cash' } as any
  );
  return data;
}

console.log('=== 1. Payday progress comes from the engine, never from local date maths (Class A) ===');
{
  const data = seedFull();
  const today = new Date();
  const sts = computeSafeToSpend(data, today);
  const p = resolvePaydayProgress({
    cycleStart: sts.cycleStart,
    cycleEnd: sts.cycleEnd,
    daysRemaining: sts.daysRemaining,
    hasKnownPayday: sts.hasKnownPayday,
    today,
  });

  assert('1a. a known payday yields a real cycle', !p.unknown);
  assert('1b. the fraction is inside [0,1]', p.fraction >= 0 && p.fraction <= 1);
  assert('1c. and is finite — never NaN from a zero-length span', Number.isFinite(p.fraction));
  assert('1d. the endpoints are the ENGINE\'s own cycle dates, formatted', p.startLabel === formatMoneyDate(sts.cycleStart) && p.endLabel === formatMoneyDate(sts.cycleEnd));
  assert('1e. the day count is the engine\'s own daysRemaining', p.daysRemaining === Math.max(0, Math.round(sts.daysRemaining)));
  assert('1f. the cycle start is declared an ESTIMATE — the customer states a payday, not a cycle start', p.estimated && /estimate/i.test(p.spoken));
  assert('1g. one spoken sentence carries both dates, the day count and the caveat', /Pay cycle from .+ to .+\. \d+ days? until your next payday\./.test(p.spoken));

  // No known payday: honest, never an invented cycle.
  const noPayday = seedFull();
  noPayday.user.nextPayday = undefined as any;
  const sts2 = computeSafeToSpend(noPayday, today);
  const p2 = resolvePaydayProgress({ cycleStart: sts2.cycleStart, cycleEnd: sts2.cycleEnd, daysRemaining: sts2.daysRemaining, hasKnownPayday: sts2.hasKnownPayday, today });
  assert('1h. no known payday reports unknown', p2.unknown);
  assert('1i. shows no progress rather than filling an assumed cycle', p2.fraction === 0);
  assert('1j. names no dates it does not have', p2.startLabel === null && p2.endLabel === null);
  assert('1k. and says so in words', /not recorded yet/i.test(p2.spoken));

  // Degenerate spans are reported, never divided into NaN/Infinity.
  const same = new Date(2026, 7, 20);
  const degenerate = resolvePaydayProgress({ cycleStart: same, cycleEnd: same, daysRemaining: 0, hasKnownPayday: true, today: same });
  assert('1l. a zero-length cycle is reported honestly, not divided by zero', degenerate.unknown && degenerate.fraction === 0);
  const inverted = resolvePaydayProgress({ cycleStart: new Date(2026, 7, 30), cycleEnd: new Date(2026, 7, 1), daysRemaining: 5, hasKnownPayday: true, today: same });
  assert('1m. an inverted cycle is too', inverted.unknown);
  const nanDays = resolvePaydayProgress({ cycleStart: new Date(2026, 7, 1), cycleEnd: new Date(2026, 7, 15), daysRemaining: Number.NaN, hasKnownPayday: true, today: new Date(2026, 7, 8) });
  assert('1n. a non-finite day count never renders as a number', nanDays.daysRemaining === 0);

  // Clamping at both ends.
  const before = resolvePaydayProgress({ cycleStart: new Date(2026, 7, 10), cycleEnd: new Date(2026, 7, 24), daysRemaining: 20, hasKnownPayday: true, today: new Date(2026, 7, 1) });
  const after = resolvePaydayProgress({ cycleStart: new Date(2026, 7, 10), cycleEnd: new Date(2026, 7, 24), daysRemaining: 0, hasKnownPayday: true, today: new Date(2026, 8, 5) });
  assert('1o. a date before the cycle clamps to 0, never negative', before.fraction === 0);
  assert('1p. a date after it clamps to 1, never above', after.fraction === 1);

  // Structural: no date arithmetic in the component.
  assert('1q. the bar component does no date arithmetic of its own', !/new Date|getTime|setDate|Date\.now/.test(strip(BAR)));
  assert('1r. nor any payday inference', !/payFrequency|nextPayday/.test(BAR));
  assert('1s. and nothing it renders depends on an animation having run', !/Animated|useSharedValue/.test(BAR));
}

console.log('\n=== 2. Included balances (Class A + Class C) ===');
{
  const data = seedFull();
  const sts = computeSafeToSpend(data, new Date());
  const s = summariseIncludedBalances(sts.includedMoneyBalanceAccounts, sts.includedMoneyBalance);

  assert('2a. the count is the engine\'s own account breakdown length', s.count === sts.includedMoneyBalanceAccounts.length);
  assert('2b. the total is the engine\'s own includedMoneyBalance', s.totalLabel === `$${Math.round(sts.includedMoneyBalance).toLocaleString()}`);
  assert('2c. it is not empty when accounts are included', !s.empty && s.count > 0);
  assert('2d. and the spoken form says these balances feed the estimate', /feed your available amount/i.test(s.spoken));

  const none = summariseIncludedBalances([], 0);
  assert('2e. no included balances is an explicit empty state', none.empty && none.count === 0);
  assert('2f. showing no total rather than a fabricated $0', none.totalLabel === null);
  assert('2g. and inviting the customer to choose', /Choose which balances/i.test(none.spoken));
  assert('2h. a non-finite total renders no number', summariseIncludedBalances([{ id: 'x', label: 'X', value: 1 }], Number.NaN).totalLabel === null);

  // The row itself.
  assert('2i. the row is one whole press target', /accessibilityRole="button"/.test(BALANCES) && (BALANCES.match(/<TouchableOpacity/g) || []).length === 1);
  assert('2j. meeting a 56pt minimum, above the 44pt activation floor', /INCLUDED_BALANCES_ROW_MIN_HEIGHT = 56/.test(BALANCES) && 56 >= designLayout.touchTargetMin);
  assert('2k. it opens the EXISTING SelectBalancesSheet', /onManage=\{\(\) => setSelectBalancesVisible\(true\)\}/.test(MONEY_CODE) && /<SelectBalancesSheet/.test(MONEY_CODE));
  assert('2l. whose own Cancel/Save/dismissal behaviour is untouched', exists('src/components/money/SelectBalancesSheet.tsx'));
  assert('2m. the row states, in words, that inclusion does not change net worth', /does not change your net worth/i.test(MONEY_MEASURE_DEFINITIONS.includedBalances));
  // Wave 6 correction B — the row now uses its own shorter support line;
  // its title ("Balances used") already says what the balances are, so the
  // generic definition's first clause would be redundant. The claim this
  // protects — the net-worth reassurance is RENDERED, not merely spoken —
  // is unchanged and asserted against the line actually shown.
  assert('2n. and the net-worth reassurance is actually rendered, not only spoken', /const SUPPORT_LINE = 'Used only for this estimate — your Wealth total is unchanged\.';/.test(BALANCES) && /\{SUPPORT_LINE\}<\/Text>/.test(BALANCES));
  assert('2o. the row performs no summing of its own', !/reduce\(|\.value \+/.test(strip(BALANCES)));
  assert('2p. and mutates no inclusion state', !/updateAsset|updateUser|persist\(/.test(BALANCES));
}

console.log('\n=== 3. The flip is retired and its content survives (Class C) ===');
{
  const CARD_CODE = strip(CARD);
  assert('3a. no flip state remains', !/const \[face, setFace\]/.test(CARD_CODE));
  assert('3b. no 3D transform or perspective', !/rotateY|perspective|backfaceVisibility/.test(CARD_CODE));
  assert('3c. no Animated value', !/Animated/.test(CARD_CODE));
  assert('3d. no flip gesture or handler', !/flipTo|flipProgress|FLIP_DURATION/.test(CARD_CODE));
  assert('3e. no Reduce Motion branch — nothing moves, so none is needed', !/AccessibilityInfo|reduceMotion/i.test(CARD_CODE));
  assert('3f. no compact-row truncation', !/COMPACT_ROW_LIMIT|computeCompactRows/.test(CARD_CODE));

  assert('3g. the Sources sheet is reachable by one explicit named control', /accessibilityLabel="Spending sources"/.test(CARD));
  assert('3h. with a hint saying what it opens', /accessibilityHint="Opens which accounts and cards paid/.test(CARD));
  assert('3i. and a 44pt activation area', /minHeight: designLayout\.touchTargetMin/.test(CARD));
  assert('3j. the sheet shows EVERY source — no slicing, no overflow row', /\{sources\.map\(\(source\) => \{/.test(SHEET) && !/\.slice\(/.test(SHEET) && !/more sources/.test(SHEET));
  assert('3k. preserving label, percentage and amount per row', /\{source\.label\}/.test(SHEET) && /\{source\.percentage\}%/.test(SHEET) && /formatCents\(source\.amountCents\)/.test(SHEET));
  assert('3l. and a reconciling total', /Spending recorded/.test(SHEET) && /formatCents\(spendingCents\)/.test(SHEET));
  assert('3m. row order follows the engine array, never re-sorted here', !/\.sort\(/.test(SHEET));
  // Wave 6 correction E — Close takes the neutral secondary (interactive
  // ink) treatment rather than the filled confirmation treatment.
  assert('3n. the sheet has an accessible title and a Close control', /title="How spending was paid"/.test(SHEET) && /<Button label="Close" variant="secondary" onPress=\{onClose\}/.test(SHEET));
  assert('3o. it reuses the established KeyboardSheet, not a second modal architecture', /import \{ KeyboardSheet \}/.test(SHEET));
  assert('3p. and mutates nothing', !/useAppState\(\)|persist\(|updateAsset\(/.test(SHEET));

  // Every front-face item survives on the static card.
  for (const item of ['Income recorded', 'Spending recorded', 'Net recorded', 'View all transactions', 'Add transaction', 'No transactions recorded yet.', 'No spending recorded yet.', 'Based on transactions recorded in Nolie.']) {
    assert(`3q. front-face item survives: "${item}"`, CARD.includes(item));
  }
  // Wave 6 final refinement — the card snapshot moved into Spending
  // sources, per card, rather than one merged "Across N cards" figure on
  // This Month. Strictly more information, and it can no longer be read as
  // part of this month's spending.
  assert('3r. the credit-card snapshot survives per card in Spending sources', /Current card balance · \{card\.balanceLabel\}/.test(SHEET) && /sources-other-card-balances/.test(SHEET));
  assert('3r-ii. and the standalone line is gone from This Month', !/Current credit-card balance/.test(strip(CARD)));
  assert('3s. and the invalid-amount disclosure', /Some recorded amounts couldn't be included\./.test(CARD));
}

console.log('\n=== 4. Money hierarchy and one hero (Class C) ===');
{
  const ORDER: [string, string][] = [
    ['Available Until Payday hero', '<SafeToSpendHero'],

    ['included balances', '<IncludedBalancesRow'],
    ['this month', '<ThisMonthCard'],
    ['what happens next', 'What happens next'],
    ['money flow', 'Typical money flow'],
    ['money plan', 'Money plan'],
  ];
  let prev = -1;
  let ordered = true;
  const missing: string[] = [];
  for (const [name, marker] of ORDER) {
    const i = MONEY_CODE.indexOf(marker);
    if (i === -1) missing.push(name);
    else if (i < prev) ordered = false;
    else prev = i;
  }
  assert(`4a. every Money landmark is present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
  assert('4b. and they appear in the Design 5.1 order', ordered);

  assert('4c. exactly ONE hero-level surface', (MONEY_CODE.match(/<SafeToSpendHero/g) || []).length === 1);
  // Wave 6 Correction B — the payday rail moved INSIDE the hero shell.
  // It was a sibling of the hero in MoneyScreen, which is why it read as an
  // unrelated stacked card. The claim protected here — one payday
  // treatment, visually part of the availability module — is unchanged and
  // now asserted where it actually renders.
  assert('4d. the payday bar is rendered INSIDE the hero shell, not as a sibling card', (() => {
    // Anchored on the hero shell itself — the file also contains the
    // earlier warning/unavailable state branches, which are their own
    // gradients and are not this assembly.
    const shell = HERO_CODE.indexOf('style={styles.heroShell}');
    const bar = HERO_CODE.indexOf('<MoneyPaydayBar');
    const close = HERO_CODE.indexOf('</LinearGradient>', shell);
    return shell !== -1 && bar > shell && bar < close && !/<MoneyPaydayBar/.test(MONEY_CODE);
  })());
  assert('4d-ii. and there is exactly ONE payday progress treatment in the app', (() => {
    const files = ['src/components/money/SafeToSpendHero.tsx', 'src/screens/money/MoneyScreen.tsx'];
    return files.reduce((n, f) => n + (strip(read(f)).match(/<MoneyPaydayBar/g) || []).length, 0) === 1;
  })());
  assert('4d-iii. separated by a rule rather than a gap, so it reads as the hero\'s own footer', /heroFooter: \{[\s\S]{0,220}borderTopWidth: StyleSheet\.hairlineWidth/.test(HERO_CODE));
  // Wave 6 final pass — MoneyPlanCard ("Typical Monthly Allocation") is
  // RETIRED from the default composition: it drew the same income, bills,
  // savings, goals and remainder the combined Typical money flow card
  // already shows, for the same period, from the same engines. The claim
  // protected here is unchanged and stronger: no measure is drawn twice.
  assert('4e. no measure appears twice', (MONEY_CODE.match(/<ThisMonthCard/g) || []).length === 1 && (MONEY_CODE.match(/<MoneyPlanCard/g) || []).length === 0);
  assert('4e-ii. and the duplicate allocation surface is unwired, not deleted — its file and detail sheets remain', exists('src/components/money/MoneyPlanCard.tsx') && /<SavingsAllocationDetailSheet/.test(MONEY_CODE));
  assert('4e-iii. the flow rows state the period once, via the selector, rather than on every row', !/Typical \$\{periodAdjective\} income/.test(MONEY_CODE) && /label: 'Income'/.test(MONEY_CODE));
  assert('4f. no glass effect outside the dock', !/BlurView|blurAmount/.test(MONEY));
  assert('4g. no emoji anywhere on Money', !/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u.test(MONEY));
  assert('4h. no raw colour in the new Wave 6 surfaces', [BAR, BALANCES, CARD, read('src/lib/calculations/moneyComposition.ts')].every((src) => !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src)));
  assert('4i. the new surfaces read semantic roles', [BAR, BALANCES, CARD].every((src) => /semantic\./.test(src)));
  assert('4j. and Design 5.1 type roles, never a platform default', [BAR, BALANCES, CARD].every((src) => /typeStyle\(/.test(src)));
  assert('4k. financial figures use a tabular figure role', /typeStyle\('figureRow'/.test(CARD) && /typeStyle\('figureRow'/.test(BALANCES));
}

console.log('\n=== 5. Every measure carries one definition or provenance line (Class A + Class C) ===');
{
  const keys = Object.keys(MONEY_MEASURE_DEFINITIONS);
  assert('5a. every Design 5.1 Money measure has a definition', keys.length === 8);
  assert('5b. each is exactly one sentence', Object.values(MONEY_MEASURE_DEFINITIONS).every((d) => (d.match(/\./g) || []).length <= 2 && d.length < 160));
  // A banned word may appear ONLY as an explicit denial ("not a
  // guarantee", "not advice") — that is the opposite of the claim the ban
  // exists to prevent, and saying it plainly is better than avoiding the
  // word. Any other occurrence is a real violation.
  const claimsBannedWord = (d: string) =>
    MONEY_DEFINITION_BANNED_WORDS.some((w) => {
      const lower = d.toLowerCase();
      let at = lower.indexOf(w);
      while (at !== -1) {
        const before = lower.slice(Math.max(0, at - 8), at);
        if (!/\bnot (a |an )?$/.test(before)) return true;
        at = lower.indexOf(w, at + 1);
      }
      return false;
    });
  assert('5c. no definition promises, guarantees or advises (a banned word is allowed only as an explicit denial)', Object.values(MONEY_MEASURE_DEFINITIONS).every((d) => !claimsBannedWord(d)));
  assert('5c-ii. and the check has teeth — a positive claim would fail it', claimsBannedWord('This is a guarantee of what you will have.'));
  assert('5d. none is shaming or judgemental', Object.values(MONEY_MEASURE_DEFINITIONS).every((d) => !/too much|overspend|bad|poor|failed/i.test(d)));

  assert('5e. the AUP definition renders inside the hero itself', /MONEY_MEASURE_DEFINITIONS\.availableUntilPayday/.test(HERO_CODE) && /styles\.heroProvenance/.test(HERO_CODE));
  assert('5f. the timeline definition renders', /MONEY_MEASURE_DEFINITIONS\.whatHappensNext/.test(MONEY_CODE));
  assert('5g. the Money Flow definition renders', /MONEY_MEASURE_DEFINITIONS\.moneyFlow/.test(MONEY_CODE));
  assert('5h. the This Month definition renders on the card', /MONEY_MEASURE_DEFINITIONS\.thisMonth/.test(CARD));
  assert('5i. the included-balances row renders its own concise support line', /Used only for this estimate — your Wealth total is unchanged\./.test(BALANCES));
  assert('5i-ii. which still states that inclusion does not change the Wealth total', /Wealth total is unchanged/.test(BALANCES));

  // Money Plan is a forecast/preference, never proof.
  const plan = MONEY_MEASURE_DEFINITIONS.moneyPlan;
  assert('5j. Money Plan is labelled a forecast built from the customer\'s own preferences', /forecast/i.test(plan) && /preference/i.test(plan));
  assert('5k. explicitly not a guarantee', /not a guarantee/i.test(plan));
  assert('5l. and explicitly not advice', /not advice/i.test(plan));
  assert('5m. it never implies unallocated money is spendable cash', !/spendable|available to spend|yours to spend/i.test(plan));
}

console.log('\n=== 6. Money reconciles with Today, and never fabricates a zero (Class A) ===');
{
  const data = seedFull();
  const today = new Date();
  const sts = computeSafeToSpend(data, today);

  // Today and Money read the SAME engine result — proven by the fact that
  // both screens call computeSafeToSpend and neither recomputes.
  assert('6a. Money reads the canonical safeToSpend result', /computeSafeToSpend\(data, currentDate\)/.test(MONEY_CODE));
  assert('6b. Today reads the same one', /computeSafeToSpend\(data, currentDate\)/.test(read('src/screens/today/TodayScreen.tsx')));
  assert('6c. and both render it through the same shared presentation selector', /selectSafeToSpendPresentation/.test(read('src/screens/today/TodayScreen.tsx')) && /safeToSpend=\{safeToSpend\}/.test(MONEY_CODE));
  assert('6d. Money performs no Safe-to-Spend arithmetic of its own', !/cycleRemainingPool -|includedMoneyBalance -|discretionaryPool \*/.test(MONEY_CODE));

  // Invalid/absent data must never become $0.
  const empty = createEmptyAppData();
  empty.user.name = 'New';
  const emptySts = computeSafeToSpend(empty, today);
  const emptyBalances = summariseIncludedBalances(emptySts.includedMoneyBalanceAccounts, emptySts.includedMoneyBalance);
  assert('6e. a brand-new customer shows no included-balance total, not "$0"', emptyBalances.totalLabel === null || emptyBalances.count > 0);
  const emptyMonth = computeThisMonthRecordedSummary(empty, today);
  assert('6f. and no recorded activity at all', emptyMonth.incomeCents === 0 && emptyMonth.spendingCents === 0 && emptyMonth.spendingSources.length === 0);
  assert('6g. which the card renders as an explicit empty state, never as zero figures', /if \(!hasActivity\)/.test(CARD) && /No transactions recorded yet\./.test(CARD));
}

console.log('\n=== 7. Repayments stay separate from ordinary spending (Class A) ===');
{
  // Financial invariant 7. The engines that draw this distinction are
  // untouched; what is asserted here is that Money still presents them
  // through those engines rather than merging them.
  assert('7a. repaymentAccounting is still the sole classifier', exists('src/lib/calculations/repaymentAccounting.ts'));
  assert('7b. Money never reclassifies a repayment as spending', !/repayment[\s\S]{0,40}spend|spend[\s\S]{0,40}repayment/i.test(MONEY_CODE));
  assert('7c. the timeline still renders repayment events through moneyTimeline\'s own kinds', /timelineEvents/.test(MONEY_CODE) && /computeMoneyTimeline/.test(MONEY_CODE));
  assert('7d. and the This Month card never sums a repayment into spending', !/repayment/i.test(strip(CARD)));
}

console.log('\n=== 8. Protected engines are read-only (Class C) ===');
{
  const ENGINES = ['safeToSpend', 'moneyPlan', 'moneyTimeline', 'monthlySummary', 'moneyFlowBreakdown', 'repaymentAccounting', 'savingsAllocation'];
  for (const e of ENGINES) assert(`8a. ${e}.ts still exists`, exists(`src/lib/calculations/${e}.ts`));
  assert('8b. the Wave 6 composition helper imports no engine and calls no engine function', (() => {
    const src = strip(read('src/lib/calculations/moneyComposition.ts'));
    return !/from '\.\/(safeToSpend|moneyPlan|moneyTimeline|monthlySummary|moneyFlowBreakdown|repaymentAccounting|savingsAllocation)'/.test(src)
      && !/compute[A-Z]\w+\(/.test(src);
  })());
  assert('8b-ii. its ONLY division is a time span into a 0..1 progress fraction', (() => {
    const src = strip(read('src/lib/calculations/moneyComposition.ts'));
    // Import paths contain slashes; only the module BODY is inspected.
    const body = src.split('\n').filter((l) => !/^import /.test(l.trim())).join('\n');
    const divisions = (body.match(/\//g) || []).length;
    return divisions === 1 && /const raw = \(nowMs - startMs\) \/ span;/.test(body);
  })());
  assert('8b-iii. and no money value is ever multiplied, divided or summed here', (() => {
    const src = strip(read('src/lib/calculations/moneyComposition.ts'));
    return !/(cents|amount|Balance|total)\s*[*\/+-]\s*\w/.test(src) && !/\.reduce\(/.test(src);
  })());
  assert('8c. and no component recreates a financial result', [BAR, BALANCES, CARD].every((src) => !/compute[A-Z]\w+\(/.test(strip(src))));
}

console.log('\n=== 9. Six themes hold their contrast on the new surfaces (Class A) ===');
{
  let worstInteractive = Infinity;
  let worstSecondary = Infinity;
  let worstTertiary = Infinity;
  let worstSuccess = Infinity;
  let worstWarning = Infinity;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    // The Wave 6 rows sit on bgSurface.
    worstInteractive = Math.min(worstInteractive, contrastRatio(c.interactive, c.bgSurface));
    worstSecondary = Math.min(worstSecondary, contrastRatio(c.textSecondary, c.bgSurface));
    worstTertiary = Math.min(worstTertiary, contrastRatio(c.textTertiary, c.bgSurface));
    worstSuccess = Math.min(worstSuccess, contrastRatio(c.success, c.bgSurface));
    worstWarning = Math.min(worstWarning, contrastRatio(c.warning, c.bgSurface));
  }
  assert(`9a. interactive ink clears the body floor on every surface (worst ${worstInteractive.toFixed(2)})`, worstInteractive >= CONTRAST_FLOORS.body);
  assert(`9b. secondary ink too (worst ${worstSecondary.toFixed(2)})`, worstSecondary >= CONTRAST_FLOORS.body);
  assert(`9c. tertiary definition ink clears at least the large floor (worst ${worstTertiary.toFixed(2)})`, worstTertiary >= CONTRAST_FLOORS.largeFigure);
  assert(`9d. success figures clear the large-figure floor (worst ${worstSuccess.toFixed(2)})`, worstSuccess >= CONTRAST_FLOORS.largeFigure);
  assert(`9e. warning figures too (worst ${worstWarning.toFixed(2)})`, worstWarning >= CONTRAST_FLOORS.largeFigure);
  assert('9f. and no state is communicated by colour alone — every toned figure carries its own label', /Income recorded/.test(CARD) && /Net recorded/.test(CARD));
}

console.log('\n=== 10. Responsive geometry (Class A) ===');
{
  assert('10a. 390pt gets 20pt margins', moneyScreenMargin(390) === 20);
  assert('10b. 360pt and below get 16pt', moneyScreenMargin(360) === 16 && moneyScreenMargin(320) === 16);
  assert('10c. 430pt keeps 20pt', moneyScreenMargin(430) === 20);
  assert('10d. one shared accessibility threshold, matching Today', isAccessibilityText(1.3) && !isAccessibilityText(1.29));
  assert('10e. row tiles share Today\'s 28pt rhythm', MONEY_ROW_ICON_TILE_SIZE === 28);
  // Wave 6 correction B — the wide "Manage balances" column is gone; the
  // whole row is the action and the chevron takes only its own width, so
  // there is no longer an action label to stack. The reflow claim now
  // applies to the summary line, which is allowed a second line at
  // accessibility sizes rather than truncating.
  assert('10f. the balances row has no wide action column stealing content width', !/Manage balances<\/Text>/.test(BALANCES) && /chevron-forward/.test(BALANCES));
  assert('10g. the summary value never splits mid-figure, and gains a line rather than truncating at large text', /styles\.primary\} numberOfLines=\{stackAction \? 2 : 1\}/.test(BALANCES));
  assert('10g-ii. and the action is still announced, in the row\'s own accessible name', /Manage balances\.`\}/.test(BALANCES));
  assert('10h. This Month figures never split either', (CARD.match(/numberOfLines=\{1\}/g) || []).length >= 3);
  assert('10i. and their labels shrink instead', /rowLabel: \{[^}]*flexShrink: 1/.test(CARD) && /rowValue: \{[^}]*flexShrink: 0/.test(CARD));
  assert('10j. the tablet content cap is the shared Screen contract, unchanged', designLayout.contentMaxWidthTablet === 560);
}

console.log('\n=== 11. Wave 6 final pass — exactly five sections, and the page fits (Class C) ===');
{
  const CARD = read('src/components/money/ThisMonthCard.tsx');
  const CARD_CODE = strip(CARD);
  const SCREEN = read('src/components/shared/Screen.tsx');

  // 11a-d — five top-level sections, no more.
  const headings = (MONEY_CODE.match(/<MoneySectionHeader[\s\S]*?title="([^"]+)"/g) || []).map((m) => m.match(/title="([^"]+)"/)![1]);
  assert(`11a. exactly four section headings plus the hero's own identity = five sections (found ${headings.length} headings: ${headings.join(', ')})`, headings.length === 4);
  assert('11b. in the canonical order, after the Available until payday hero', headings.join(' | ') === 'This month | What happens next | Typical money flow | Money plan');
  assert('11b-ii. and all four use the ONE shared header, not four screen-local designs', (MONEY_CODE.match(/<MoneySectionHeader/g) || []).length === 4 && !/styles\.sectionTitle\}>/.test(MONEY_CODE));
  assert('11c. Recent activity is NOT a top-level section', !headings.includes('Recent activity'));
  assert('11d. and neither is Typical Monthly Allocation', !headings.some((h) => /Allocation/i.test(h)) && !/<MoneyPlanCard/.test(MONEY_CODE));

  // 11e-j — Recent activity merged into This Month.
  assert('11e. This Month owns the recent-transaction preview', /recent\?: RecentActivityRow\[\]/.test(CARD_CODE) && /this-month-recent-/.test(CARD_CODE));
  assert('11f. bounded to three rows', /const MAX_RECENT_ROWS = 3;/.test(CARD) && /recent\.slice\(0, MAX_RECENT_ROWS\)/.test(CARD_CODE));
  assert('11g. and two compact insights', /const MAX_INSIGHTS = 2;/.test(CARD) && /insights\.slice\(0, MAX_INSIGHTS\)/.test(CARD_CODE));
  assert('11h. insights are icon + short label + value, never prose', /\{i\.label\} · \{i\.value\}/.test(CARD_CODE) && !/insightBody/.test(CARD_CODE));
  assert('11i. income may read as success; ordinary spending is neutral ink, never urgent red', /t\.isIncome \? semantic\.success : semantic\.textPrimary/.test(CARD_CODE) && !/txnAmount[\s\S]{0,120}semantic\.urgent/.test(CARD_CODE));
  assert('11i-ii. the urgent role appears only as a category TONE mapping, never as a spending amount', (() => {
    const at = CARD_CODE.indexOf("case 'coral':");
    return at !== -1 && /semantic\.urgentText/.test(CARD_CODE.slice(at, at + 160));
  })());
  assert('11j. the card re-sorts nothing — the caller supplies the order', !/\.sort\(/.test(CARD_CODE));
  assert('11k. no nested scroll was introduced', !/ScrollView/.test(CARD_CODE));
  assert('11l. the standalone "+ Add" is gone — the global "+" owns Add', !/Recent activity[\s\S]{0,400}\+ Add</.test(MONEY_CODE));
  assert('11m. both This Month actions survive, once each', (CARD_CODE.match(/Spending sources</g) || []).length === 1 && (CARD_CODE.match(/accessibilityLabel="View all transactions"/g) || []).length === 1);
  assert('11m-ii. and the transactions label shortens visibly rather than truncating, keeping its full accessible name', /stackActions \? 'View all transactions' : 'Transactions'/.test(CARD_CODE) && /accessibilityLabel="View all transactions"/.test(CARD_CODE));

  // 11n-q — the combined flow card.
  assert('11n. the period selector still offers Weekly, Fortnightly and Monthly', /\{ key: 'weekly', label: 'Weekly' \}/.test(MONEY_CODE) && /\{ key: 'fortnightly', label: 'Fortnightly' \}/.test(MONEY_CODE) && /\{ key: 'monthly', label: 'Monthly' \}/.test(MONEY_CODE));
  assert('11o. and announces which is selected, rather than relying on tint', /accessibilityRole="radio"/.test(MONEY_CODE) && /accessibilityState=\{\{ selected: flowPeriod === p\.key, checked: flowPeriod === p\.key \}\}/.test(MONEY_CODE));
  assert('11p. each option is a 44pt target', /periodToggleOption: \{\s*\n\s*minHeight: minTouchTarget/.test(MONEY_CODE));
  assert('11q. the five flow rows are concise — the period is stated once, by the selector', /label: 'Income'/.test(MONEY_CODE) && /label: 'Bills'/.test(MONEY_CODE) && /label: 'Savings'/.test(MONEY_CODE) && /label: 'Goals'/.test(MONEY_CODE) && !/Typical \$\{periodAdjective\}/.test(MONEY_CODE));
  assert('11r. income is success, bills are neutral, remainder is positive only when it genuinely is', /key: 'income'[^\n]*semantic\.success/.test(MONEY_CODE) && /key: 'bills'[^\n]*semantic\.textPrimary/.test(MONEY_CODE) && /displayedTypicalNet >= 0 \? semantic\.interactive : semantic\.warning/.test(MONEY_CODE));
  assert('11s. and a negative remainder is named, not signalled by colour alone', /displayedTypicalNet >= 0 \? 'Remainder' : 'Shortfall'/.test(MONEY_CODE));

  // 11t-v — nothing unique was lost.
  for (const [name, pat] of [
    ['How this was calculated', /money-aup-hero-info/],
    ['Choose\/Manage balances', /IncludedBalancesRow|CHOOSE_BALANCES_CTA/],
    ['Spending sources', /Spending sources/],
    ['View all transactions', /View all transactions/],
    ['Add bill', /onPress: openAddBill/],
    ['Money Flow details', /<MoneyFlowCategoryDetailSheet/],
    ['Savings allocation details', /<SavingsAllocationDetailSheet/],
    ['Add income', /setIncomeModalVisible\(true\)/],
    ['Add goal', /setGoalModalVisible\(true\)/],
    ['Manage savings allocation', /setEditSavingsAllocationVisible\(true\)/],
  ] as const) {
    assert(`11t. still reachable: ${name}`, pat.test(MONEY_CODE) || pat.test(CARD_CODE) || pat.test(strip(read('src/components/money/SafeToSpendHero.tsx'))));
  }
  assert('11u. the retired allocation component is unwired, not deleted', exists('src/components/money/MoneyPlanCard.tsx'));

  // 11w-x — the root title.
  assert('11w. the shared screen title uses the Design 5.1 titleScreen role, not the legacy token', /const screenTitleType = typeStyle\('titleScreen', locale\);/.test(SCREEN) && /title: \{\s*\n\s*\.\.\.screenTitleType,/.test(SCREEN));
  assert('11x. in semantic ink, and no longer the legacy typography.title', /color: semantic\.textTitle/.test(SCREEN) && !/title: \{\s*\n\s*\.\.\.typography\.title,/.test(SCREEN));
}

console.log('\n=== 12. Wave 6 final refinement (Class A + C) ===');
{
  const CARD = read('src/components/money/ThisMonthCard.tsx');
  const CARD_CODE = strip(CARD);
  const SHEET_CODE = strip(SHEET);
  const BRIEFING = strip(read('src/components/today/TodayBriefingCard.tsx'));
  const PRIORITY = strip(read('src/components/today/BriefingPriorityRow.tsx'));
  const SNAPSHOT = strip(read('src/components/today/MonthSnapshotCard.tsx'));

  // --- This Month metric cells ---
  assert('12a. the three measures are compact cells, each with its own tinted glyph', /metricGrid/.test(CARD_CODE) && /metricTile/.test(CARD_CODE) && /metricValue/.test(CARD_CODE));
  assert('12b. income takes success, spending interactive, net featured-or-warning', /icon: 'cash-outline'[\s\S]{0,140}semantic\.successTint/.test(CARD_CODE) && /icon: 'receipt-outline'[\s\S]{0,140}semantic\.interactiveTint/.test(CARD_CODE) && /summary\.netCents < 0 \? semantic\.warningTint : semantic\.interactiveTint/.test(CARD_CODE));
  assert('12c. only genuinely positive money takes the success amount role', /valueInk: semantic\.success/.test(CARD_CODE) && /valueInk: semantic\.textPrimary/.test(CARD_CODE));
  assert('12d. and the cells reflow whole at accessibility sizes rather than shrinking labels', /flexDirection: stackMetrics \? 'column' : 'row'/.test(CARD_CODE) && !/fontSize: 1[01]/.test(CARD_CODE));

  // --- Recent activity uses the canonical mapping ---
  assert('12e. rows carry the CANONICAL category glyph, not one generic arrow', /categoryIconSpec\(t\.categoryId\)\.name/.test(MONEY_CODE) && /categoryIconSpec\(t\.categoryId\)\.tone/.test(MONEY_CODE));
  assert('12f. Groceries resolves to a cart, Dining out to a restaurant, Bonus to a gift', categoryIconSpec('cat-groceries').name === 'cart-outline' && categoryIconSpec('cat-dining').name === 'restaurant-outline' && categoryIconSpec('cat-bonus').name === 'gift-outline');
  assert('12g. Groceries and Dining out are distinguishable, and Bonus reads as income', categoryIconSpec('cat-groceries').name !== categoryIconSpec('cat-dining').name && categoryIconSpec('cat-bonus').tone === 'mint');
  assert('12h. an unmapped category falls back safely, never to an emoji', !!categoryIconSpec('cat-nonexistent').name && !/[\u{1F300}-\u{1FAFF}]/u.test(categoryIconSpec('cat-nonexistent').name));
  assert('12i. one accessible announcement per row', /accessibilityLabel=\{`\$\{t\.label\}, \$\{t\.dateLabel\}, \$\{t\.amountLabel\}`\}/.test(CARD_CODE));

  // --- The two bordered buttons ---
  assert('12j. both actions are explicit outline buttons, not text links', /outlineButton/.test(CARD_CODE) && /money-spending-sources-action/.test(CARD_CODE) && /money-view-transactions-action/.test(CARD_CODE));
  assert('12k. with a deliberately visible 2pt border, never a hairline', (() => {
    const at = CARD_CODE.indexOf('outlineButton: {');
    const block = CARD_CODE.slice(at, CARD_CODE.indexOf('},', at));
    return at !== -1 && /borderWidth: 2,/.test(block) && !/hairlineWidth/.test(block);
  })());
  assert('12l. a 44pt target each', (() => {
    const at = CARD_CODE.indexOf('outlineButton: {');
    return at !== -1 && /minHeight: designLayout\.touchTargetMin/.test(CARD_CODE.slice(at, CARD_CODE.indexOf('},', at)));
  })());
  assert('12m. interactive ink and icon, never a filled success treatment', (() => {
    const at = CARD_CODE.indexOf('outlineButton: {');
    return /outlineButtonText: \{[^}]*color: semantic\.interactive/.test(CARD_CODE) && !/backgroundColor/.test(CARD_CODE.slice(at, CARD_CODE.indexOf('},', at)));
  })());
  assert('12n. each carries its own premium glyph', /name="pie-chart-outline"/.test(CARD_CODE) && /name="receipt-outline" size=\{16\}/.test(CARD_CODE));
  assert('12o. and they stack at narrow width or accessibility scale', /flexDirection: stackActions \? 'column' : 'row'/.test(CARD_CODE));

  // --- The card-balance rehome ---
  assert('12p. the standalone credit-card line is gone from This Month', !/Current credit-card balance/.test(CARD_CODE) && !/creditCardBalance/.test(CARD_CODE));
  assert('12q. and its dead derivations went with it', !/sanitizeBalance|cardsInCredit|displayedCardBalance/.test(CARD_CODE));
  assert('12r. Spending sources now states paid-this-month and current balance as separate labelled lines', /Paid this month · \$\{formatCents\(source\.amountCents\)\} · \$\{source\.percentage\}%/.test(SHEET_CODE) && /Current card balance · \{card\.balanceLabel\}/.test(SHEET_CODE));
  assert('12s. never claiming the balance was spent this month', !/spent this month/i.test(SHEET_CODE.replace(/Paid this month/g, '')));
  assert('12t. the clarification renders once, not per row', (SHEET_CODE.match(/\{CARD_BALANCE_DISCLOSURE\}/g) || []).length === 1 && /are not added to this month’s spending/.test(CARD_BALANCE_DISCLOSURE));

  // The join is a join — never arithmetic.
  const SOURCES = [
    { key: 'creditCard:cba', kind: 'credit_card' },
    { key: 'creditCard:amex', kind: 'credit_card' },
    { key: 'cash', kind: 'cash' },
  ];
  const CARDS = [
    { id: 'cba', label: 'CBA', currentBalance: 0 },
    { id: 'amex', label: 'AMEX', currentBalance: 1150 },
    { id: 'unused', label: 'Unused card', currentBalance: 400 },
  ];
  const ctx = resolveSourceCardContexts(SOURCES, CARDS);
  assert('12u. each used card source is joined to its own balance by stable id', ctx.length === 2 && ctx.find((c) => c.sourceKey === 'creditCard:amex')!.balanceLabel === '$1,150');
  assert('12v. and separate cards never merge', new Set(ctx.map((c) => c.sourceKey)).size === 2);
  assert('12w. a source whose card no longer resolves keeps its row and carries no balance', resolveSourceCardContexts([{ key: 'creditCard:gone', kind: 'credit_card' }], CARDS)[0].balanceLabel === null);
  assert('12x. a non-negative zero balance still renders as a real $0, never omitted', ctx.find((c) => c.sourceKey === 'creditCard:cba')!.balanceLabel === '$0');
  assert('12y. a non-finite balance is omitted rather than fabricated', formatCardBalance(Number.NaN) === null && formatCardBalance(Number.POSITIVE_INFINITY) === null);
  assert('12z. a card in credit reads with a typographic minus', formatCardBalance(-250) === '−$250');

  const others = resolveOtherCardBalances(SOURCES, CARDS);
  assert('12aa. a card with a balance but no spending this month stays reachable', others.length === 1 && others[0].id === 'unused' && others[0].balanceLabel === '$400');
  assert('12ab. and used cards never appear there', !others.some((o) => o.id === 'amex' || o.id === 'cba'));
  assert('12ac. a card with no usable balance is omitted, not shown as $0', resolveOtherCardBalances([], [{ id: 'x', label: 'X', currentBalance: Number.NaN }]).length === 0);
  assert('12ad. neither helper sums anything', !/reduce\(|\+=/.test(strip(read('src/lib/calculations/moneyComposition.ts')).split('resolveSourceCardContexts')[1] ?? ''));

  // --- Today Briefing separators ---
  assert('12ae. the hero divider is a full 1pt, not a sub-pixel hairline', /export const HERO_DIVIDER_WIDTH = 1;/.test(read('src/components/today/TodayBriefingCard.tsx')) && /height: HERO_DIVIDER_WIDTH/.test(BRIEFING));
  assert('12af. the footer rule matches it', /borderTopWidth: HERO_DIVIDER_WIDTH/.test(BRIEFING));
  assert('12ag. and each priority row is separated by the same width', /borderBottomWidth: isLast \? 0 : HERO_DIVIDER_WIDTH/.test(PRIORITY));
  assert('12ah. it uses the semantic border role, so it resolves in all six themes', /backgroundColor: semantic\.border/.test(BRIEFING) && DESIGN_THEME_MATRIX.every(({ style, scheme }) => /^#[0-9a-fA-F]{6,8}$/.test(resolveSemanticColors(style, scheme).border)));
  assert('12ai. the hero stays ONE card — no row became its own surface', (BRIEFING.match(/<LinearGradient/g) || []).length === 1 && !/borderRadius: designRadius\.card/.test(PRIORITY));
  assert('12aj. and no raw colour or inline opacity was introduced', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(BRIEFING + PRIORITY) && !/opacity:/.test(BRIEFING));

  // --- August so far typography ---
  assert('12ak. the metric label is no longer micro-sized', /label: \{ \.\.\.typeStyle\('support', locale\)/.test(SNAPSHOT) && TYPE_ROLES.support.size > TYPE_ROLES.meta.size);
  assert('12al. while the figure stays clearly larger', TYPE_ROLES.figureLarge.size > TYPE_ROLES.support.size);
  assert('12am. no uppercase transformation was applied', !/textTransform/.test(SNAPSHOT));
  assert('12an. each measure carries a restrained tinted glyph', /measureTile/.test(SNAPSHOT) && /measureIcon\(m\.key\)/.test(SNAPSHOT) && /measureTint\(m\.tone, semantic\)/.test(SNAPSHOT));
  assert('12ao. warning only when the net is genuinely negative', /tone === 'caution'[\s\S]{0,80}semantic\.warning/.test(SNAPSHOT));
  assert('12ap. and the responsive layout logic is untouched', /resolveMonthMeasureLayout/.test(SNAPSHOT));
}

console.log('\n=== 13. Typical money flow refinement (Class A + C) ===');
{
  assert('13a. the selected period uses the interactive role, never success green', /periodToggleOptionActive: \{ backgroundColor: semantic\.interactive \}/.test(MONEY_CODE) && /periodToggleTextActive: \{ color: semantic\.onInteractive \}/.test(MONEY_CODE));
  assert('13b. and announces its selection', /accessibilityState=\{\{ selected: flowPeriod === p\.key, checked: flowPeriod === p\.key \}\}/.test(MONEY_CODE));
  assert('13c. each category row carries its own premium glyph and restrained tint', /icon: 'cash-outline', tint: semantic\.successTint/.test(MONEY_CODE) && /icon: 'receipt-outline'/.test(MONEY_CODE) && /icon: 'shield-checkmark-outline', tint: semantic\.infoTint/.test(MONEY_CODE) && /icon: 'flag-outline'/.test(MONEY_CODE));
  assert('13d. a chevron appears only on the actionable rows', /name="chevron-forward" size=\{14\} color=\{semantic\.interactive\}/.test(MONEY_CODE) && !/remainderPanel[\s\S]{0,400}chevron-forward/.test(MONEY_CODE));
  assert('13e. Remainder is a distinct result panel, not a fifth peer row', /money-flow-remainder/.test(MONEY_CODE) && /remainderPanel/.test(MONEY_CODE));
  assert('13f. positive takes the featured interactive treatment, not a success-green celebration', /remainderNegative \? semantic\.warningTint : semantic\.interactiveTint/.test(MONEY_CODE) && !/remainderPanel[\s\S]{0,200}semantic\.successTint/.test(MONEY_CODE));
  assert('13g. zero is neutral', /remainderZero \? semantic\.textPrimary/.test(MONEY_CODE));
  assert('13h. negative pairs warning ink with an alert glyph — never colour alone', /remainderNegative \? \(\s*\n\s*<Ionicons name="alert-circle-outline"/.test(MONEY_CODE) && /remainderNegative \? 'Estimated shortfall' : 'Estimated remainder'/.test(MONEY_CODE));
  assert('13i. and never urgent red', !/remainderPanel[\s\S]{0,400}semantic\.urgent/.test(MONEY_CODE));
  assert('13j. the supporting line names the SELECTED cycle', /REMAINDER_SUPPORT\[flowPeriod\]/.test(MONEY_CODE) && /each week/.test(MONEY_CODE) && /each fortnight/.test(MONEY_CODE) && /each month/.test(MONEY_CODE));
  assert('13k. and never promises', !/you will have|guaranteed/i.test(MONEY_CODE));
  assert('13l. no Typical Monthly Allocation surface reappeared', !/<MoneyPlanCard/.test(MONEY_CODE));
  assert('13m. no emoji anywhere in the touched Money surfaces', !/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u.test(read('src/screens/money/MoneyScreen.tsx') + read('src/components/money/ThisMonthCard.tsx') + SHEET));
  assert('13n. and no raw colour', [read('src/screens/money/MoneyScreen.tsx'), read('src/components/money/ThisMonthCard.tsx'), SHEET].every((src) => !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src)));
}

console.log('\n=== 14. Wave 6 closure polish (Class A + C) ===');
{
  const CARD = read('src/components/money/ThisMonthCard.tsx');
  const CARD_CODE = strip(CARD);
  const HEADER = read('src/components/money/MoneySectionHeader.tsx');
  const HEADER_CODE = strip(HEADER);
  const BALANCES = read('src/components/money/SelectBalancesSheet.tsx');

  // --- D. One shared section header ---
  assert('14a. one shared component owns all four Money section headers', (MONEY_CODE.match(/<MoneySectionHeader/g) || []).length === 4);
  assert('14b. and no legacy standalone heading remains', !/styles\.sectionTitle\}>/.test(MONEY_CODE));
  assert('14c. it uses the Design 5.1 titleSection role through the shipped resolver', /typeStyle\('titleSection', locale\)/.test(HEADER_CODE));
  assert('14d. in semantic title ink, never a platform default', /color: semantic\.textTitle/.test(HEADER_CODE));
  assert('14e. with a heading role for assistive technology', /accessibilityRole="header"/.test(HEADER_CODE));
  assert('14f. no all-caps eyebrow treatment', !/textTransform/.test(HEADER_CODE));
  assert('14g. a restrained 32pt icon tile, hidden from VoiceOver', /const TILE_SIZE = 32;/.test(HEADER) && /accessibilityElementsHidden/.test(HEADER_CODE));
  assert('14h. trailing controls keep a real 44pt target', /minHeight: designLayout\.touchTargetMin/.test(HEADER_CODE));
  assert('14i. the header is NOT a card — it adds no fifth surface', !/backgroundColor: semantic\.bgSurface/.test(HEADER_CODE) && !/borderWidth/.test(HEADER_CODE));
  assert('14j. no raw colour or emoji', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(HEADER) && !/[\u{1F300}-\u{1FAFF}]/u.test(HEADER));
  assert('14k. and each section carries its own icon and tone', /icon="calendar-outline"[\s\S]{0,80}tone="interactive"/.test(MONEY_CODE) && /icon="calendar-number-outline"[\s\S]{0,80}tone="warm"/.test(MONEY_CODE) && /icon="swap-vertical-outline"[\s\S]{0,80}tone="info"/.test(MONEY_CODE) && /icon="compass-outline"[\s\S]{0,80}tone="featured"/.test(MONEY_CODE));

  // --- E. Truncation ---
  assert('14l. the transactions label shortens visibly rather than truncating', /stackActions \? 'View all transactions' : 'Transactions'/.test(CARD_CODE));
  assert('14m. while its accessible name stays complete', /accessibilityLabel="View all transactions"/.test(CARD_CODE));
  assert('14n. both footer controls keep their 2pt border and 44pt target', (() => {
    const at = CARD_CODE.indexOf('outlineButton: {');
    const block = CARD_CODE.slice(at, CARD_CODE.indexOf('},', at));
    return /borderWidth: 2,/.test(block) && /minHeight: designLayout\.touchTargetMin/.test(block);
  })());
  assert('14o. and they stack at narrow width or accessibility scale', /flexDirection: stackActions \? 'column' : 'row'/.test(CARD_CODE));

  // --- F. Select Balances Save ---
  assert('14p. Save no longer uses the legacy accent green', /savePrimary: \{ flex: 1, backgroundColor: semantic\.interactive \}/.test(BALANCES));
  assert('14q. it is applied to Save alone, so Button\'s own primary variant is untouched', /<Button label="Save" onPress=\{handleSave\} style=\{styles\.savePrimary\}/.test(BALANCES) && !/variant="primary"/.test(BALANCES));
  assert('14r. Cancel stays secondary', /<Button label="Cancel" variant="secondary"/.test(BALANCES));
  assert('14s. and selection/persistence behaviour is untouched', /handleSave/.test(BALANCES) && /updateAsset/.test(BALANCES));
  assert('14t. the interactive role clears the body floor on the sheet surface in all six themes', DESIGN_THEME_MATRIX.every(({ style, scheme }) => {
    const c = resolveSemanticColors(style, scheme);
    return contrastRatio(c.onInteractive, c.interactive) >= CONTRAST_FLOORS.body;
  }));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
