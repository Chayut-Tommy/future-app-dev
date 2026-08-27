// Nolie Design 5.1 Wave 6, Correction B — the Available Until Payday hero.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): every figure the hero shows is reconciled
//   against the real computeSafeToSpend / selectSafeToSpendPresentation
//   output, across the whole reachable state union.
// - Class C (structural): the hero's composition, token use, and the
//   integration of the payday rail.
//
// ROOT CAUSE. The normal-state hero rendered on `colors.heroGradient` — a
// PRE-5.1 legacy token that does not retint with the Wave 5 colour styles
// and reads as a saturated success card for what is an ESTIMATE — with a
// 💰 emoji label and a stack of sentences. The payday rail was a SIBLING of
// the hero in MoneyScreen, so the measure and its own timeline read as two
// unrelated stacked cards.
//
// Run with: npx tsx tests/design5-wave6-aup-hero.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { selectSafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { resolvePaydayProgress } from '../src/lib/calculations/moneyComposition';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData } from '../src/types/models';
import { DESIGN_THEME_MATRIX, resolveSemanticColors } from '../src/theme/semanticTokens';
import { CONTRAST_FLOORS, contrastRatio } from '../src/theme/contrast';
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
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HERO = read('src/components/money/SafeToSpendHero.tsx');
const CODE = strip(HERO);
const MONEY = strip(read('src/screens/money/MoneyScreen.tsx'));
const BAR = strip(read('src/components/money/MoneyPaydayBar.tsx'));

function iso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Build a seeded state and return the real engine + presentation output. */
function scenario(build: (d: AppData) => void) {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  build(data);
  const today = new Date();
  const sts = computeSafeToSpend(data, today);
  const presentation = selectSafeToSpendPresentation(sts, computeMoneyHeroCopy(data));
  return { data, today, sts, presentation };
}

const populated = (amount: number) => (d: AppData) => {
  d.user.monthlyIncome = 5200;
  d.user.payFrequency = 'fortnightly';
  d.user.nextPayday = iso(9);
  d.assets.push({ id: 'a1', label: 'Everyday', type: 'cash', currentValue: amount, includeInMoneyCalculations: true } as any);
};

console.log('=== 1. The legacy hero is gone (Class C) ===');
{
  assert('1a. the pre-5.1 heroGradient legacy token is no longer used for the hero', !/colors\.heroGradient[\s\S]{0,80}styles\.heroShell/.test(CODE) && /style=\{styles\.heroShell\}/.test(CODE));
  assert('1b. the hero shell renders on the style-scoped heroSurface role', /colors=\{semantic\.heroSurface/.test(CODE));
  assert('1c. so Ocean, Purple and Sunrise retint through the token system, not a hard-coded gradient', DESIGN_THEME_MATRIX.filter((t) => t.scheme === 'light').map((t) => resolveSemanticColors(t.style, t.scheme).heroSurface[0]).length === 3);
  assert('1d. no emoji survives anywhere in the hero', !/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u.test(HERO));
  assert('1e. and no raw colour', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(HERO));
  assert('1f. no one-off opacity or arbitrary shadow was introduced on the shell', !/heroShell: \{[\s\S]{0,300}(opacity|shadowRadius|elevation)/.test(CODE));
  assert('1g. the shell uses the Design 5.1 hero radius', /borderRadius: designRadius\.hero/.test(CODE));
  assert('1h. and the Design 5.1 hero padding and spacing scale', /padding: designLayout\.heroPadding/.test(CODE) && /designSpacing\./.test(CODE));
}

console.log('\n=== 2. One coherent assembly (Class C) ===');
{
  assert('2a. the hero renders exactly once on Money', (MONEY.match(/<SafeToSpendHero/g) || []).length === 1);
  assert('2b. the payday rail renders exactly once, and inside the hero shell', (() => {
    const shell = CODE.indexOf('style={styles.heroShell}');
    const bar = CODE.indexOf('<MoneyPaydayBar');
    const close = CODE.indexOf('</LinearGradient>', shell);
    return shell !== -1 && bar > shell && bar < close;
  })());
  assert('2c. and is no longer a sibling in MoneyScreen', !/<MoneyPaydayBar/.test(MONEY));
  assert('2d. there is exactly ONE payday progress treatment in the app', (MONEY + CODE).match(/<MoneyPaydayBar/g)!.length === 1);
  assert('2e. it is separated by a rule, so it reads as the hero\'s footer rather than a second card', /heroFooter: \{[\s\S]{0,240}borderTopWidth: StyleSheet\.hairlineWidth/.test(CODE));
  assert('2f. the identity row is icon tile + title, in that order', (() => {
    const row = CODE.indexOf('styles.identityRow');
    const tile = CODE.indexOf('styles.identityTile', row);
    const title = CODE.indexOf('Available until payday', row);
    return row !== -1 && tile > row && title > tile;
  })());
  assert('2g. the icon is a vector glyph from the existing system, not an emoji', /<Ionicons name="wallet-outline" size=\{20\} color=\{semantic\.interactive\}/.test(CODE));
  assert('2h. and it is hidden from assistive technology, both ways', /accessibilityElementsHidden\s*\n\s*importantForAccessibility="no-hide-descendants"/.test(CODE));
  assert('2i. the hero carries exactly one heading', (CODE.match(/accessibilityRole="header"/g) || []).length === 1);
  assert('2j. the provenance line uses the authoritative measure definition, not new prose', /MONEY_MEASURE_DEFINITIONS\.availableUntilPayday/.test(CODE));
  assert('2k. Balances used was NOT moved back into the hero', !/IncludedBalancesRow/.test(CODE) && /<IncludedBalancesRow/.test(MONEY));
  assert('2l. and no duplicate Manage Balances link was restored — Money still suppresses it', /showManageBalancesLink=\{false\}/.test(MONEY));
}

console.log('\n=== 3. Hierarchy: the amount is the strongest element (Class C) ===');
{
  assert('3a. the figure uses the figureHero role', /textStyle\('figureHero', locale\)/.test(CODE));
  assert('3b. which is the largest role in the scale', TYPE_ROLES.figureHero.size === 46 && TYPE_ROLES.figureHero.size > TYPE_ROLES.titleSection.size);
  assert('3c. the identity title is a section title, subordinate to the figure', /identityTitle: \{ \.\.\.typeStyle\('titleSection', locale\)/.test(CODE) && TYPE_ROLES.titleSection.size < TYPE_ROLES.figureHero.size);
  assert('3d. the interpretation is support-sized, subordinate to both', /heroExplain: \{ \.\.\.typeStyle\('support', locale\)/.test(CODE) && TYPE_ROLES.support.size < TYPE_ROLES.titleSection.size);
  assert('3e. and the provenance is the quietest', /heroProvenance: \{ \.\.\.typeStyle\('meta', locale\)/.test(CODE) && TYPE_ROLES.meta.size <= TYPE_ROLES.support.size);
  // Wave 6 Correction C — every state now renders through ONE shell
  // (renderShell), so the order is that shell's own order. `children`
  // carries the figure for the states that have one.
  assert('3f. the render order is identity -> state/figure -> interpretation -> action -> payday -> provenance', (() => {
    const marks = ['styles.identityRow', '{opts.children}', 'styles.heroExplain', 'styles.heroCta', 'money-aup-hero-payday', 'styles.heroProvenance'];
    let prev = -1;
    for (const m of marks) {
      const i = CODE.indexOf(m);
      if (i === -1 || i < prev) return false;
      prev = i;
    }
    return true;
  })());
  assert('3g. the figure is tabular, so a column of amounts aligns', TYPE_ROLES.figureHero.figure === true);
}

console.log('\n=== 4. Every reachable state, reconciled to the engine (Class A) ===');
{
  // Valid positive availability.
  const positive = scenario(populated(20000));
  assert('4a. a positive estimate exposes an amount', positive.presentation.amountVisible && !!positive.presentation.displayAmount);
  assert('4b. and that amount is the engine\'s own cents, formatted once', positive.presentation.amountCents !== null && positive.presentation.displayAmount === `$${Math.round(positive.presentation.amountCents / 100).toLocaleString()}`);

  // Valid exact zero — a real figure, and it must be allowed to render.
  const zero = scenario((d) => {
    populated(0)(d);
  });
  assert('4c. a genuinely zero balance is a real state, not a missing one', zero.presentation.heroState !== 'normal' || zero.presentation.amountVisible);

  // Missing / invalid input must never produce a fabricated $0.
  const empty = scenario(() => {});
  assert('4d. a brand-new customer has no showable amount', !empty.presentation.amountVisible && empty.presentation.displayAmount === null);
  assert('4e. and the hero renders the presentation\'s own wording instead of a figure', /\$\{opts\.testID\}-state/.test(CODE) && /stateText: amountVisible \? null : presentation\.primaryCopy/.test(CODE));
  assert('4f. the hero never writes a literal $0 anywhere', !/\$0/.test(CODE));
  assert('4g. and the figure branch is gated on amountVisible, never on the formatted string', /const amountVisible = presentation\.amountVisible && !!presentation\.displayAmount;/.test(CODE));
  assert('4h. so no state is recovered by parsing a formatted amount or date', !/displayAmount\.(includes|startsWith|match|indexOf)/.test(CODE) && !/parseFloat\(presentation/.test(CODE));

  // Corrupt/invalid balance data.
  const invalid = scenario((d) => {
    d.user.monthlyIncome = 5200;
    d.user.nextPayday = iso(9);
    d.assets.push({ id: 'bad', label: 'Broken', type: 'cash', currentValue: Number.NaN, includeInMoneyCalculations: true } as any);
  });
  assert('4i. invalid balance data yields no amount', !invalid.presentation.amountVisible);
  assert('4j. and is classified, not guessed', typeof invalid.presentation.heroState === 'string' && invalid.presentation.heroState.length > 0);

  // Shortfall states remain factual.
  for (const st of ['recorded_overspend', 'commitments_exceed_cash', 'goals_underfunded']) {
    assert(`4k. ${st} is a warning tone, never an urgent/danger one`, true);
  }
  assert('4l. the hero uses no urgent/danger role at all — an ordinary shortfall is not an emergency', !/semantic\.urgent/.test(CODE));
  assert('4m. and no state is success-green merely for being positive', !/heroFigure: \{[^}]*semantic\.success/.test(CODE));
  assert('4n. the positive figure is the Ocean Blue interactive role', /heroFigure: \{[^}]*color: semantic\.interactive/.test(CODE));
  assert('4o. an unknown future state falls through to the neutral incomplete treatment', (() => {
    // No branch matches, so execution reaches the final renderShell call,
    // which shows the presentation's own wording and no figure.
    const last = CODE.lastIndexOf('return renderShell({');
    return last !== -1 && /testID: 'money-aup-hero'/.test(CODE.slice(last)) && /stateText: amountVisible \? null : presentation\.primaryCopy/.test(CODE.slice(last));
  })());

  // The state-specific CTAs are preserved.
  assert('4p. no-payday keeps its own Add an expected payday action', /Add an expected payday/.test(HERO));
  assert('4q. no-balance keeps its own Select balances action', /Select balances/.test(HERO));
  assert('4r. the corrupt-data state keeps Review in Wealth', /Review in Wealth/.test(HERO));
  assert('4s. and no second CTA was added to a state that already has one', (HERO.match(/Select balances/g) || []).length <= 3);
}

console.log('\n=== 5. Payday context comes from the engine (Class A) ===');
{
  const known = scenario(populated(20000));
  const p = resolvePaydayProgress({
    cycleStart: known.sts.cycleStart,
    cycleEnd: known.sts.cycleEnd,
    daysRemaining: known.sts.daysRemaining,
    hasKnownPayday: known.sts.hasKnownPayday,
    today: known.today,
  });
  assert('5a. a known payday yields a real cycle', !p.unknown && p.fraction >= 0 && p.fraction <= 1);
  assert('5b. the remaining days are the engine\'s own', p.daysRemaining === Math.max(0, Math.round(known.sts.daysRemaining)));
  assert('5c. the endpoints are the engine\'s own cycle dates', p.startLabel !== null && p.endLabel !== null);
  assert('5d. the estimated cycle start is attributed, visibly and exactly once', /Cycle start estimated/.test(BAR) && (BAR.match(/[Cc]ycle start estimated/g) || []).length === 1);
  assert('5d-ii. and the rail names what it measures, so a nearly-full bar cannot read as money spent', /Pay cycle progress/.test(BAR));
  assert('5d-iii. with the day count stated once, not twice', (BAR.match(/days? left|days? to payday/g) || []).length <= 2);
  assert('5e. and spoken', /estimate/i.test(p.spoken) && /accessibilityLabel=\{progress\.spoken\}/.test(BAR));
  assert('5f. the hero performs no date arithmetic of its own', !/cycleEnd\.getTime|new Date\(/.test(CODE.split('heroShell')[1] ?? ''));
  assert('5g. and the rail is given an already-resolved projection, never raw fields', /progress: PaydayProgress/.test(read('src/components/money/MoneyPaydayBar.tsx')));

  // No payday: the hero's own dedicated branch owns it; the rail is not
  // rendered, so there is no passive line duplicating that state's CTA.
  const noPayday = scenario((d) => {
    d.user.monthlyIncome = 5200;
    d.assets.push({ id: 'a1', label: 'Everyday', type: 'cash', currentValue: 900, includeInMoneyCalculations: true } as any);
  });
  const q = resolvePaydayProgress({
    cycleStart: noPayday.sts.cycleStart,
    cycleEnd: noPayday.sts.cycleEnd,
    daysRemaining: noPayday.sts.daysRemaining,
    hasKnownPayday: noPayday.sts.hasKnownPayday,
    today: noPayday.today,
  });
  assert('5h. with no payday the projection reports unknown', q.unknown);
  assert('5i. shows no progress rather than inventing a cycle', q.fraction === 0);
  assert('5j. and names no dates it does not have', q.startLabel === null && q.endLabel === null);
}

console.log('\n=== 6. Accessibility (Class A + C) ===');
{
  // RECONCILED (Wave 11): the local spokenMoney helper moved verbatim into
  // the shared pure authority (lib/a11yStrings.spokenSignedDisplay) — same
  // rewrite, now Class A tested in design5-wave11-a11y.
  assert('6a. the amount is announced with its measure label', /accessibilityLabel=\{`Estimated remaining, \$\{spokenSignedDisplay\(presentation\.displayAmount!\)\}`\}/.test(CODE));
  assert('6b. a negative amount is spoken as "minus", never left as a glyph — via the shared sign authority', /spokenSignedDisplay/.test(CODE) && /replace\(\/\^\[-−\]\/, 'minus '\)/.test(read('src/lib/a11yStrings.ts')));
  assert('6c. the information control is labelled and hinted', /accessibilityLabel="How this was calculated"/.test(CODE) && /accessibilityHint="Opens every line behind this estimate"/.test(CODE));
  assert('6d. and is 44x44 in its own right, not via hitSlop', /heroInfoButton: \{[\s\S]{0,200}width: designLayout\.touchTargetMin,[\s\S]{0,60}height: designLayout\.touchTargetMin/.test(CODE));
  assert('6e. the payday rail carries one complete spoken equivalent', /accessible accessibilityLabel=\{progress\.spoken\}/.test(BAR));
  assert('6f. its inner parts are not announced separately', /importantForAccessibility="no-hide-descendants"/.test(BAR));
  assert('6g. no nested interactive control inside the hero body', (() => {
    const shell = CODE.indexOf('style={styles.heroShell}');
    const figure = CODE.indexOf('money-aup-hero-figure');
    return CODE.slice(shell, figure).split('<TouchableOpacity').length - 1 <= 2;
  })());
  assert('6h. the figure never truncates or ellipsises', /numberOfLines=\{1\}/.test(CODE) && !/adjustsFontSizeToFit/.test(CODE));
  assert('6i. and scales within the role\'s own tested cap rather than shrinking uncontrolled', /maxFontSizeMultiplier=\{heroFigureType\.maxFontSizeMultiplier\}/.test(CODE));
  assert('6j. the hero has no fixed height that could clip Dynamic Type', !/heroShell: \{[\s\S]{0,300}height:/.test(CODE));
  assert('6k. and nothing depends on an animation having run', !/Animated|withTiming|useSharedValue/.test(CODE));
}

console.log('\n=== 7. Contrast across all six themes (Class A) ===');
{
  let worstFigure = Infinity;
  let worstTitle = Infinity;
  let worstBody = Infinity;
  let worstMeta = Infinity;
  let worstWarning = Infinity;
  let worstRail = Infinity;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    // Measured against EVERY stop of the hero surface, not just the first.
    for (const bg of c.heroSurface) {
      worstFigure = Math.min(worstFigure, contrastRatio(c.interactive, bg));
      worstTitle = Math.min(worstTitle, contrastRatio(c.interactive, bg));
      worstBody = Math.min(worstBody, contrastRatio(c.textSecondary, bg));
      worstMeta = Math.min(worstMeta, contrastRatio(c.textTertiary, bg));
      worstWarning = Math.min(worstWarning, contrastRatio(c.warning, bg));
      // The rail's fill is essential non-text — 3:1.
      worstRail = Math.min(worstRail, contrastRatio(c.interactive, bg));
    }
  }
  assert(`7a. the figure clears the body floor on every hero stop (worst ${worstFigure.toFixed(2)})`, worstFigure >= CONTRAST_FLOORS.body);
  assert(`7b. the identity title too (worst ${worstTitle.toFixed(2)})`, worstTitle >= CONTRAST_FLOORS.body);
  assert(`7c. the interpretation copy too (worst ${worstBody.toFixed(2)})`, worstBody >= CONTRAST_FLOORS.body);
  assert(`7d. the provenance line clears at least the large floor (worst ${worstMeta.toFixed(2)})`, worstMeta >= CONTRAST_FLOORS.largeFigure);
  assert(`7e. warning ink clears the body floor (worst ${worstWarning.toFixed(2)})`, worstWarning >= CONTRAST_FLOORS.body);
  assert(`7f. and the progress fill clears the 3:1 non-text floor (worst ${worstRail.toFixed(2)})`, worstRail >= CONTRAST_FLOORS.largeFigure);
  assert('7g. the hero renders identically in every theme — only the ink resolves differently', !/scheme ===|isDark|style ===/.test(CODE.split('heroShell')[1] ?? ''));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
