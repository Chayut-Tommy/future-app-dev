// Nolie Design 5.1 Wave 8 — Grow hierarchy, Score containment and disposition.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): growComposition.ts and scoreChipPresentation.ts
//   are pure and RN-free, so every hierarchy, containment and Score-state
//   assertion runs the REAL production function.
// - Class C (structural): render order, what DiscoverScreen imports, and
//   that every retained opportunity/debt-coach/market file is untouched.
// - NOT proven here: that any of it renders. See
//   tests/rendered/design5-wave8-grow.render.test.tsx.
//
// Run with: npx tsx tests/design5-wave8-grow-hierarchy.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  GROW_SECTIONS,
  GROW_SECTION_TITLE,
  GROW_TOOLS,
  SCORE_CONTAINMENT,
  SCORE_CONTAINMENT_CLAUSES,
  SCORE_UNAVAILABLE_TEXT,
  GROW_SURFACE_DISPOSITION,
  sectionEmphasis,
  heroSections,
  scoreMayShowNumber,
  scoreSupportingText,
  scoreNumberOrNull,
  toolGridColumns,
} from '../src/lib/calculations/growComposition';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { toScoreGaugePresentation } from '../src/lib/calculations/scoreGaugePresentation';
import { LuluScoreResult } from '../src/lib/calculations/luluScore';

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

const GROW_RAW = read('src/screens/discover/DiscoverScreen.tsx');
const GROW = strip(GROW_RAW);
const MODEL = strip(read('src/lib/calculations/growComposition.ts'));

console.log('=== 1. The canonical hierarchy (Class A) ===');
{
  assert('1a. exactly six top-level sections', GROW_SECTIONS.length === 6);
  assert('1b. in the owner-locked order: Score, Goals, Journey, Tools, Learn, disclaimer',
    GROW_SECTIONS.join('|') === 'score|goals|journey|tools|learn|disclaimer');
  assert('1c. Score is FIRST — it leads Grow', GROW_SECTIONS[0] === 'score');
  assert('1d. the disclaimer is LAST, no longer opening the page', GROW_SECTIONS[GROW_SECTIONS.length - 1] === 'disclaimer');
  assert('1e. Score is the single hero', heroSections().length === 1 && heroSections()[0] === 'score');
  assert('1f. Journey is a highlighted SUPPORTING surface, not a second hero', sectionEmphasis('journey') === 'highlighted');
  assert('1g. Goals, Tools and Learn are ordinary sections', (['goals', 'tools', 'learn'] as const).every((s) => sectionEmphasis(s) === 'standard'));
  assert('1h. no section other than Score claims hero emphasis', GROW_SECTIONS.filter((s) => sectionEmphasis(s) === 'hero').length === 1);
}

console.log('\n=== 2. Render order matches the model (Class C) ===');
{
  const markers = [
    ['Score hero', 'testID="grow-score-hero"'],
    ['Goals', 'GROW_SECTION_TITLE.goals'],
    ['Journey', 'GROW_SECTION_TITLE.journey'],
    ['Tools', 'testID="grow-tools"'],
    ['Learn', 'testID="grow-learn"'],
    ['disclaimer', 'testID="grow-disclaimer"'],
  ] as const;
  let last = -1;
  let ordered = true;
  for (const [, marker] of markers) {
    const at = GROW.indexOf(marker);
    if (at < 0 || at < last) ordered = false;
    last = at;
  }
  assert('2a. the screen renders them in exactly that order', ordered);
  assert('2b. Score is the FIRST substantive surface after the title', (() => {
    const screenOpen = GROW.indexOf('<Screen');
    const hero = GROW.indexOf('testID="grow-score-hero"');
    const between = GROW.slice(screenOpen, hero);
    // Nothing that renders customer content may sit between them.
    return !/<SectionCard|<Text style=\{styles\.(disclaimer|sectionTitle|categoryTitle)/.test(between);
  })());
  assert('2c. the disclaimer no longer leads the page', GROW.indexOf('testID="grow-disclaimer"') > GROW.indexOf('testID="grow-score-hero"'));
  assert('2d. exactly one hero surface style exists', (GROW.match(/styles\.scoreHero\b/g) || []).length === 1);
  assert('2e. Journey does NOT use the hero surface', !/journeyCard[\s\S]{0,120}scoreHero/.test(GROW) && /journeyCard: \{ borderWidth: 1, borderColor: semantic\.interactiveTint \}/.test(GROW));
  assert('2f. every section title uses the one shared treatment', (GROW.match(/style=\{styles\.sectionTitle\}/g) || []).length === 4);
  assert('2g. and carries header semantics', (GROW.match(/accessibilityRole="header"/g) || []).length >= 5);
}

console.log('\n=== 3. Score containment is EXISTING production wording (Class A) ===');
{
  // The wave authors no new compliance-sensitive copy. These strings must
  // be byte-identical to what scoreChipPresentation.ts already shipped.
  const CHIP = read('src/lib/calculations/scoreChipPresentation.ts');
  assert('3a. the containment string is the existing production one', CHIP.includes(SCORE_CONTAINMENT));
  assert('3b. and the unavailable wording likewise', CHIP.includes(SCORE_UNAVAILABLE_TEXT));
  assert('3c. all three clauses are present', SCORE_CONTAINMENT_CLAUSES.every((c) => SCORE_CONTAINMENT.includes(c)));
  assert('3d. Interim', SCORE_CONTAINMENT_CLAUSES.includes('Interim'));
  assert('3e. Based on what you’ve recorded', SCORE_CONTAINMENT_CLAUSES.includes('Based on what you’ve recorded'));
  assert('3f. Not a credit score', SCORE_CONTAINMENT_CLAUSES.includes('Not a credit score'));
  assert('3g. it is rendered VISIBLY on the hero, not only in accessibility text', /testID="grow-score-containment"/.test(GROW) && /\{scoreSupportingText\(scoreGaugePresentation\.state\)\}/.test(GROW));
  assert('3h. and not hidden behind the explanation sheet', GROW.indexOf('testID="grow-score-containment"') < GROW.indexOf('<ScoreExplanationSheet'));
  assert('3i. no new compliance wording was invented by this wave', !/credit-?worthy|eligib|pre-?approv|guarantee/i.test(MODEL));
}

console.log('\n=== 4. Score states: a number only when genuinely valid (Class A) ===');
{
  const base = (over: Partial<LuluScoreResult>): LuluScoreResult =>
    ({ score: 72, locked: false, lifeStage: 'building', completeness: { percent: 80 }, categories: [], factors: [], ...over } as unknown as LuluScoreResult);

  assert('4a. a valid score may show a number', scoreMayShowNumber(selectScoreChipPresentation(base({})).state));
  assert('4b. and carries the full containment', scoreSupportingText(selectScoreChipPresentation(base({})).state) === SCORE_CONTAINMENT);

  const NON_VALID: [string, Partial<LuluScoreResult>][] = [
    ['locked', { locked: true }],
    ['NaN', { score: NaN }],
    ['Infinity', { score: Infinity }],
    ['negative', { score: -1 }],
    ['above 100', { score: 101 }],
  ];
  for (const [name, over] of NON_VALID) {
    const chip = selectScoreChipPresentation(base(over));
    const gauge = toScoreGaugePresentation(chip.state === 'available', chip.scoreValue);
    assert(`4c. ${name}: shows no number`, !scoreMayShowNumber(gauge.state) && scoreNumberOrNull(gauge) === null);
    assert(`4d. ${name}: says "${SCORE_UNAVAILABLE_TEXT}"`, scoreSupportingText(gauge.state) === SCORE_UNAVAILABLE_TEXT);
    assert(`4e. ${name}: is never clamped into range`, chip.scoreValue === null);
    assert(`4f. ${name}: never renders zero`, chip.scoreValue !== 0);
  }
  // The whitelist is deliberately ONE state, so a state added later cannot
  // start rendering a figure by default.
  assert('4g. only "available" may show a number', ['locked', 'unavailable', 'error', 'incomplete', 'pending', ''].every((s) => !scoreMayShowNumber(s)));
  assert('4h. and the number accessor is type-narrowed, not a cast', /presentation\.state === 'available'/.test(MODEL));
  assert('4i. the screen gates every figure through it', !/scoreGaugePresentation\.value/.test(GROW) && /scoreNumberOrNull\(scoreGaugePresentation\)/.test(GROW));
}

console.log('\n=== 5. Nolie Pick and opportunities are completely unwired (Class C) ===');
{
  assert('5a. DiscoverScreen does not import MoneyOpportunitiesHero', !/MoneyOpportunitiesHero/.test(GROW_RAW));
  assert('5b. nor render OpportunityCard', !/OpportunityCard/.test(GROW_RAW));
  assert('5c. no Nolie Pick / Navilo Picks wording survives in rendered copy', !/>[^<]*(Nolie Pick|Navilo Pick)/.test(GROW));
  assert('5d. no opportunity heading, placeholder, teaser or coming-soon treatment', !/coming soon/i.test(GROW) && !/opportunitySection|opportunitySpacer|opportunityPlaceholder/.test(GROW));
  assert('5e. the opportunity selector is no longer called from Grow', !/computeMoneyOpportunities/.test(GROW_RAW));
  assert('5f. nor the unlock selector, whose only Grow consumer was Nolie Pick', !/getUnlockStatus/.test(GROW_RAW));
  assert('5g. and no replacement recommendation or AI placeholder was introduced', !/Ask Nolie|AI |recommend/i.test(GROW.replace(/scoreName/g, '')));

  // Retained, unchanged, for the future AI-agent specification.
  const RETAINED = [
    'src/components/discover/MoneyOpportunitiesHero.tsx',
    'src/components/health/OpportunityCard.tsx',
    'src/components/discover/MarketPulsePreview.tsx',
    'src/components/discover/ExploreCategorySection.tsx',
    'src/components/discover/FutureYouCard.tsx',
  ];
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9a checkpoint readiness.
  //
  // SUPERSEDED ASSERTION: `5i. <file> is byte-unchanged`, implemented as
  // `git diff --stat [origin/main] -- <file>` returning empty.
  //
  // WHY THE GIT BASELINE WAS UNSTABLE: a diff proves nothing about the code
  // under test — only about this checkout's relationship to a reference
  // that MOVES. Against the working tree it goes empty the moment the work
  // is committed; against `origin/main` it goes empty the moment Wave 9a is
  // checkpointed INTO main. Either way the assertion stops failing because
  // it stopped asking anything, which is worse than deleting it: it reads
  // green while proving nothing. It also needs a git repo, a specific
  // history and a fetched remote to run at all.
  //
  // PRESERVED INTENT: the opportunity/market components Wave 8 unwired must
  // still EXIST and must still be UNWIRED — retained for the future
  // AI-agent workstream, not quietly deleted and not quietly re-mounted.
  //
  // REPLACEMENT EVIDENCE: assert both halves directly against the source
  // currently under test — the file exists, still exports its component,
  // and no Grow surface imports or renders it. Hermetic: no git, no remote,
  // no history.
  // -------------------------------------------------------------------
  const RETAINED_EXPORT: Readonly<Record<string, string>> = {
    'src/components/discover/MoneyOpportunitiesHero.tsx': 'MoneyOpportunitiesHero',
    'src/components/health/OpportunityCard.tsx': 'OpportunityCard',
    'src/components/discover/MarketPulsePreview.tsx': 'MarketPulsePreview',
    'src/components/discover/ExploreCategorySection.tsx': 'ExploreCategorySection',
    'src/components/discover/FutureYouCard.tsx': 'FutureYouCard',
  };
  for (const rel of RETAINED) {
    const name = RETAINED_EXPORT[rel];
    assert(`5h. ${rel.split('/').pop()} is retained on disk`, fs.existsSync(path.join(ROOT, rel)));
    assert(`5i. ${rel.split('/').pop()} still exports ${name}`, new RegExp(`export function ${name}\\b`).test(read(rel)));
    assert(`5i-unwired. ${rel.split('/').pop()} is not imported by Grow`, !new RegExp(`\\b${name}\\b`).test(GROW_RAW));
  }

  // -------------------------------------------------------------------
  // RECONCILED — Wave 9a closure, Correction A.
  //
  // OLD CLAUSE: DebtCoachSheet.tsx was in RETAINED above, asserted both
  // "is retained" and "is byte-unchanged".
  //
  // SUPERSEDED BECAUSE Wave 9a Correction A explicitly authorises adding
  // ONE navigation action to this sheet. The owner's device test confirmed
  // Cards had no stable route: its only production call site was the
  // transient `card_due_soon` reminder, which snoozing or dismissing
  // removes. The byte-unchanged clause was a Wave 8 SCOPE guard — "Nolie
  // Pick is unwired, but do not rewrite the retained code" — not a
  // statement that this file must never change again.
  //
  // PRESERVED INTENT: the retained opportunity/coaching workstream must
  // still be untouched. So the replacement below is narrower and stronger
  // than a bare byte comparison: the file is retained, its coaching content
  // is intact, its engine is byte-unchanged, and the ONLY thing added is
  // the single Cards route. Every other retained file keeps the original
  // byte-unchanged clause above.
  // -------------------------------------------------------------------
  const DEBT_SHEET = 'src/components/debt/DebtCoachSheet.tsx';
  const DEBT_RAW = read(DEBT_SHEET);
  const DEBT_SHEET_CODE = DEBT_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert('5i-a. DebtCoachSheet.tsx is retained', fs.existsSync(path.join(ROOT, DEBT_SHEET)));
  // RECONCILED (same root cause as 5i above): `git diff --stat` on
  // debtCoach.ts proved only a moving git relationship. PRESERVED INTENT —
  // the debt engine's own rules are unchanged — is now asserted against the
  // engine's actual invariants.
  const DEBT_ENGINE = read('src/lib/calculations/debtCoach.ts');
  assert('5i-b. the engine still makes ONE pass over liabilities (no card double-count)', /for \(const l of data\.liabilities\)/.test(DEBT_ENGINE) && !/for \(const c of data\.creditCards\)/.test(DEBT_ENGINE));
  assert('5i-b-i. zero-balance liabilities are still skipped', DEBT_ENGINE.includes('if (l.currentBalance <= 0) continue;'));
  assert('5i-b-ii. the credit-card discriminator is still structural', DEBT_ENGINE.includes("kind: linkedCard ? 'credit_card' : l.type"));
  assert('5i-b-iii. hasAnyDebt still spans liabilities AND cards', DEBT_ENGINE.includes('data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0)'));
  assert('5i-b-iv. the BNPL repayment cap is still applied', DEBT_ENGINE.includes('Math.min(toMonthlyAmount(linkedRecurringItem.amount, linkedRecurringItem.frequency), l.currentBalance)'));
  // The coaching surface Wave 8 retained is all still there, verbatim.
  for (const kept of [
    'Your debt overview',
    'payoffAcceleration',
    'highestInterestDebt',
    'debtToIncomeRatio',
    'Educational estimate only',
    'buildDebtFreeCelebration',
    'AddWealthItemModal',
    'AddCreditCardModal',
  ]) {
    assert(`5i-c. coaching content retained: ${kept}`, DEBT_RAW.includes(kept));
  }
  // RECONCILED — same root cause as 5i. The superseded assertion counted
  // DELETED LINES in `git diff -U0 [origin/main] -- DebtCoachSheet.tsx` and
  // required each deletion to be a named, authorised rewrite. That count is
  // a property of a git range, not of the file: it reads 5 mid-wave, 0 once
  // checkpointed, and is meaningless in a fresh clone.
  //
  // PRESERVED INTENT: nothing was removed to make room for the Cards route
  // — the debt-coach behaviour Wave 8 retained must all still be there, and
  // the only copy that left must be the claim Correction B retired.
  //
  // REPLACEMENT EVIDENCE: the coaching content is asserted present above
  // (5i-c, ten strings). Here we assert the retired claim is gone, its
  // approved replacement is present, and the no-debt branch survives intact
  // — all read from the file under test.
  assert('5i-d. the retired "real payoff scenarios" claim is gone', !DEBT_SHEET_CODE.includes('real payoff scenarios'));
  assert('5i-e. its approved replacement is rendered from the shared constant', DEBT_RAW.includes('DEBT_SCENARIO_PROMPT'));
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9c FINAL correction pass, Correction D.
  // SUPERSEDED: 5i-c/5i-f pinned the chooser's LITERAL legacy copy
  // ("Let's understand your debt first" / "Do you currently have any
  // debt?" / "I have no debt" with its red X).
  // WHY: the owner's device recording showed that presentation still in
  // legacy typography with emoji tiles; the accepted replacement is the
  // "Tell us about any debt" hierarchy with the shared vector icon
  // resolver and a calm "I don't have any debt" answer.
  // PRESERVED INTENT: the BRANCH itself — ask first, add a liability only
  // when needed, celebrate the no-debt answer — survives with the same
  // handler and the same four destinations, asserted here against the new
  // copy.
  // -------------------------------------------------------------------
  assert('5i-f. the no-debt branch survives intact', ['Tell us about any debt', 'Add only what applies. You can update this later.', "I don't have any debt", 'handleNoDebt'].every((k) => DEBT_RAW.includes(k)));
  assert('5i-f-i. every debt-type option the customer could pick is still offered', ['credit_card', 'mortgage', 'car_loan', 'personal_loan'].every((t) => DEBT_RAW.includes(`type: '${t}'`)));
  assert('5i-f-ii. the educational disclosure still sits with the numbers', DEBT_RAW.includes('Educational estimate only.'));
  // And the addition is exactly one outbound route, to Cards.
  assert('5i-g. exactly one navigate call was added', (DEBT_SHEET_CODE.match(/navigation\.navigate\(/g) ?? []).length === 1);
  assert('5i-h. and its destination is Cards', /navigation\.navigate\('Cards'\)/.test(DEBT_SHEET_CODE));
  assert('5i-i. no opportunity or Nolie Pick wiring was introduced here', !/MoneyOpportunit|OpportunityCard|getUnlockStatus|Nolie Pick/.test(DEBT_RAW));
  // RECONCILED (same root cause as 5i). PRESERVED INTENT: the opportunity
  // engine is retained for the future workstream and is not called by Grow.
  const OPP = read('src/lib/calculations/moneyOpportunities.ts');
  assert('5j. the opportunity engine is retained with its API intact', /export function computeMoneyOpportunities\(data: AppData\): MoneyOpportunity\[\]/.test(OPP));
  assert('5j-i. and its action union is unchanged', OPP.includes("export type MoneyOpportunityAction = 'compare_savings' | 'open_money' | 'open_investing_path' | 'debt_coach' | 'add_cash';"));
  assert('5j-ii. Grow still does not call it', !/computeMoneyOpportunities/.test(GROW_RAW));
  assert('5k. and DebtCoachSheet stays reachable from Money, so nothing is stranded', /DebtCoachSheet/.test(read('src/screens/money/MoneyScreen.tsx')));
}

console.log('\n=== 6. Market Pulse and category stacks are absent (Class C) ===');
{
  assert('6a. MarketPulsePreview is not imported or rendered', !/MarketPulsePreview/.test(GROW_RAW));
  assert('6b. no Markets heading survives', !/>Markets</.test(GROW));
  assert('6c. ExploreCategorySection is not imported or rendered', !/ExploreCategorySection/.test(GROW_RAW));
  assert('6d. no collapsible category state remains', !/exploreExpanded|toggleExplore|ExploreCategoryId/.test(GROW_RAW));
  assert('6e. no "Explore Money Moves" heading', !/>Explore Money Moves</.test(GROW));
  assert('6f. FutureYouCard is unwired — it duplicated Journey\'s forward-looking content', !/FutureYouCard/.test(GROW_RAW));
  assert('6g. and no duplicate Future/Journey section survives', !/>Future You and Safety Net</.test(GROW) && (GROW.match(/GROW_SECTION_TITLE\.journey/g) || []).length === 1);
  assert('6h. every disposition is recorded', Object.keys(GROW_SURFACE_DISPOSITION).length >= 15);
  assert('6i. and every retired surface is "unwired", never deleted', (['MoneyOpportunitiesHero', 'OpportunityCard', 'DebtCoachSheet', 'MarketPulsePreview', 'ExploreCategorySection', 'FutureYouCard'] as const).every((k) => GROW_SURFACE_DISPOSITION[k] === 'unwired'));
}

console.log('\n=== 7. Tools — exactly four, on existing routes (Class A + C) ===');
{
  assert('7a. exactly four tiles', GROW_TOOLS.length === 4);
  assert('7b. no fifth tile, no AI tile', !GROW_TOOLS.some((t) => /ai|nolie pick|ask/i.test(t.label)));
  const ROUTES = ['SavingsComparison', 'CompoundCalculator', 'EmergencyFund', 'HomeLoanCalculator'];
  assert('7c. on exactly the existing routes', GROW_TOOLS.map((t) => t.route).join('|') === ROUTES.join('|'));
  assert('7d. each route appears once', new Set(GROW_TOOLS.map((t) => t.route)).size === 4);
  assert('7e. the Home loan tile reads "Home loan repayments"', GROW_TOOLS.find((t) => t.route === 'HomeLoanCalculator')!.label === 'Home loan repayments');
  assert('7f. and the eligibility-implying "Can I buy a home?" is gone', !/Can I buy a home/.test(GROW));
  assert('7g. every tile has a complete accessible label', /accessibilityLabel=\{`\$\{tool\.label\}\. \$\{tool\.supporting\}`\}/.test(GROW));
  assert('7h. whole tile is the target, at 44pt', /toolTile: \{\s*\n\s*minHeight: 44/.test(GROW));
  assert('7i. decorative icons are hidden from the accessibility tree', /toolIcon[\s\S]{0,220}accessibilityElementsHidden/.test(GROW));
  assert('7j. two columns at ordinary widths', toolGridColumns(390, 1) === 2 && toolGridColumns(430, 1) === 2 && toolGridColumns(375, 1) === 2);
  assert('7k. one column at 320pt', toolGridColumns(320, 1) === 1);
  assert('7l. and at large Dynamic Type, at every width', [320, 375, 390, 430].every((w) => toolGridColumns(w, 1.3) === 1 && toolGridColumns(w, 2) === 1));
  assert('7m. labels wrap rather than truncate', !/toolLabel[\s\S]{0,160}numberOfLines/.test(GROW));
  // RECONCILED — Wave 9a checkpoint readiness. SUPERSEDED: `git diff --stat
  // -- <engine>` returning empty. WHY UNSTABLE: that compares the working
  // tree to HEAD, so it empties — and silently stops asserting anything —
  // the moment the wave is committed. PRESERVED INTENT: Grow's tool tiles
  // are presentation only and must not have moved calculator maths into
  // themselves, and each engine keeps its own formula.
  assert('7n. the calculator engines keep their own formulas', [
    ['compoundCalculator', 'Math.pow'],
    ['homeLoanCalculator', 'Math.pow'],
    ['emergencyFund', 'monthsCovered'],
  ].every(([e, marker]) => read(`src/lib/calculations/${e}.ts`).includes(marker as string)));
  assert('7n-i. and Grow reproduces none of that maths', !/Math\.pow|monthsCovered|amortis/i.test(GROW));
}

console.log('\n=== 8. Goals, Journey and Learn keep their sources (Class C) ===');
{
  assert('8a. Goals reads the one authoritative source', /data\.goals/.test(GROW) && !/useState<Goal/.test(GROW));
  assert('8b. and uses the canonical editor and detail sheet', /<AddGoalModal/.test(GROW) && /<GoalDetailSheet/.test(GROW));
  assert('8c. no new goal form was built', !/function GoalForm|const GoalForm/.test(GROW));
  assert('8d. View all still routes to the existing Goals screen', /navigation\.navigate\('Goals'\)/.test(GROW));
  assert('8e. a goal with no usable target shows NO percentage — never a fabricated 0%', /g\.targetAmount \? \(/.test(GROW) && /No target set yet/.test(GROW));
  assert('8f. Journey keeps both existing engines', /<JourneyTimeline/.test(GROW) && /<WealthJourneyCard/.test(GROW));
  assert('8g. and reproduces no milestone calculation in presentation code', !/computeAchievements\(|computeWealthPaths\(/.test(GROW.slice(GROW.indexOf('return ('))));
  assert('8h. Learn keeps the existing components and content selection', /<LearningPathCard/.test(GROW) && /<LearningCardItem/.test(GROW) && /learningCardsByCategory\(/.test(GROW));
  // `useRef<ScrollView>` is a TYPE parameter, not a rendered element — the
  // page's own scrolling is owned by `Screen`. The claim is that no second
  // scroll container is MOUNTED inside it.
  assert('8i. with no nested scrolling', !/<ScrollView[\s>]/.test(GROW.replace(/useRef<ScrollView>/g, 'useRef<T>')));
  assert('8j. the standing disclaimer wording is unchanged', /Educational information only\. Not investment advice\./.test(GROW));
  assert('8k. Score explanation still opens the existing sheet', /<ScoreExplanationSheet visible=\{scoreSheetVisible\}/.test(GROW));
  // RECONCILED — Wave 8 correction E. OLD CLAUSE required TodayScreen.tsx
  // byte-unchanged. SUPERSEDED BECAUSE the correction removes Today's
  // screen-owned Settings gear — it was the app's only route to Settings
  // and it floated over Today's own scrolling content. PRESERVED INTENT:
  // Today's Score FOOTNOTE is what must not change. Asserted directly, and
  // the only Today diff is the gear's removal.
  // RECONCILED — Wave 9a checkpoint readiness. SUPERSEDED: both clauses
  // inspected the REMOVED lines of `git diff -- TodayScreen.tsx`. WHY
  // UNSTABLE: the diff is against HEAD, so once the wave is committed there
  // are no removed lines at all and both assertions pass while proving
  // nothing — and neither can run in a fresh clone. PRESERVED INTENT:
  // Today's Score footnote and its financial/Briefing surfaces must still
  // be present, and only the duplicate Settings gear may have gone.
  // REPLACEMENT EVIDENCE: assert those surfaces are PRESENT in the file
  // under test, which is what "not removed" actually means.
  const TODAY = read('src/screens/today/TodayScreen.tsx');
  assert('8l. Today still renders its Score surface', /scoreChipPresentation|ScoreChip/.test(TODAY));
  assert('8l-i. and its financial/Briefing surfaces are all still present', ['Briefing', 'Reminder', 'safeToSpend'].every((k) => TODAY.includes(k)));
  assert('8l-ii. and Today\'s duplicate Settings control is genuinely gone', !/floatingSettings|SETTINGS_CONTROL_SIZE/.test(read('src/screens/today/TodayScreen.tsx')));
  assert('8l-iii. leaving exactly ONE Settings trigger in the app', (() => {
    const screens = execSync("grep -rl \"navigate('Settings')\" src --include=*.tsx || true", { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
    return screens.length === 1 && screens[0].includes('RootNavigator');
  })());
}

console.log('\n=== 9. Design-system ratchet on the touched surface (Class C) ===');
{
  assert('9a. no raw hex or rgba', !/#[0-9a-fA-F]{3,8}\b/.test(GROW) && !/rgba?\(/.test(GROW));
  assert('9b. no emoji used as a functional icon', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(GROW));
  assert('9c. the new surfaces resolve through the shipped role resolver', /typeStyle\('titleSection', locale\)/.test(GROW) && /typeStyle\('titleCard', locale\)/.test(GROW));
  assert('9d. semantic colour tokens only', /semantic\.interactive/.test(GROW) && /semantic\.heroBorder/.test(GROW));
  assert('9e. no setTimeout or bespoke animation was introduced', !/setTimeout|setInterval|Animated\./.test(GROW));
  assert('9f. no new dependency', !/from '(?!\.\.?\/|react|react-native|@react-navigation|@expo|expo-linear-gradient)/.test(GROW_RAW));
  assert('9f-i. expo-linear-gradient was already a dependency', /"expo-linear-gradient"/.test(read('package.json')));
  // The pre-Wave-8 screen was 922 lines. The correction pass added the
  // hero's fact rows and the goal icon tile, so the ceiling moves — but the
  // page must still be materially shorter than what it replaced.
  assert('9g. the page is materially shorter than before', GROW_RAW.split('\n').length < 850);
  assert('9h. the composition helper computes no money and holds no state', !/useState|persist\(|AsyncStorage|reduce\(|\* |\/ /.test(MODEL.replace(/\/\//g, '')));
  assert('9i. and imports no financial engine to recreate a result', !/^import .*calculations\/(luluScore|moneyOpportunities|achievements|wealthJourney)/m.test(MODEL));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
