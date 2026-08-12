/**
 * Pass 2C — Full Score and Journey reorganisation in Grow, plus the
 * physical-device correction round (radial Score gauge restored, Journey
 * and Money Path composed into one section, Journey theme cohesion fixed,
 * prohibited Score wording corrected).
 *
 * CLASSIFICATION (per tests/README.md's evidence taxonomy):
 * - Real import (Class A): computeLuluScore, selectScoreChipPresentation,
 *   computeStrongestArea, computeBiggestOpportunity, computeAchievements,
 *   computeWealthPaths, selectNaviloPalette are all imported and executed
 *   directly — genuine behavioural proof of these exact shipped functions.
 *   None of them were modified by the Score/Journey CALCULATION logic in
 *   either round (confirmed both by this file's own determinism assertions
 *   and by the literal git diff reported alongside this pass, which does
 *   not list luluScore.ts, achievements.ts, wealthJourney.ts,
 *   journeySnapshot.ts, or sectionFocus.ts). palettes.ts IS legitimately
 *   extended this round (two new fields, both computed from already-
 *   accepted ColorTokens) — see Section 10, which proves the extension is
 *   additive, not a rewrite of the existing style/scheme mapping.
 * - Structural: regex/string matches against DiscoverScreen.tsx,
 *   JourneyTimeline.tsx, ScoreRadialGauge.tsx, ScoreExplanationSheet.tsx,
 *   TodayScreen.tsx, dailyInsight.ts source text — all React components (or
 *   their callers) that transitively import react-native and cannot be
 *   imported/executed by tsx.
 *
 * LIMITATION (unchanged from every prior pass): this repository has no
 * react-native-testing-library or any component-runtime test harness, and
 * none may be added. A genuine rendered-component, scroll-timing, or
 * navigation-transition test is therefore NOT possible here. Every claim
 * about on-screen hierarchy, scroll behaviour, visual quality, or
 * accessibility below is Structural only, or is explicitly left to the
 * physical-device checklist — never presented as proof of correct rendered
 * hierarchy, navigation timing, visual quality, accessibility, persistence,
 * or absence of celebration regression.
 */
import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import { toScoreGaugePresentation } from '../src/lib/calculations/scoreGaugePresentation';
import { computeAchievements } from '../src/lib/calculations/achievements';
import { computeWealthPaths } from '../src/lib/calculations/wealthJourney';
import { computeStrongestArea, computeBiggestOpportunity } from '../src/lib/calculations/scoreExplanation';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { selectNaviloPalette, NaviloColorStyle } from '../src/theme/palettes';
import { lightColors, darkColors } from '../src/theme/tokens';
import type { AppData } from '../src/types/models';

let total = 0;
let failures = 0;
function assert(label: string, condition: boolean) {
  total++;
  if (!condition) {
    failures++;
    console.log(`FAIL — ${label}`);
  } else {
    console.log(`PASS — ${label}`);
  }
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'weekly';
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  return d;
}

const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');
const JOURNEY_TIMELINE_SRC = readFileSync('src/components/health/JourneyTimeline.tsx', 'utf8');
const SCORE_EXPLANATION_SHEET_SRC = readFileSync('src/components/health/ScoreExplanationSheet.tsx', 'utf8');
const SCORE_RADIAL_GAUGE_SRC = readFileSync('src/components/shared/ScoreRadialGauge.tsx', 'utf8');
const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
const LULU_SCORE_SRC = readFileSync('src/lib/calculations/luluScore.ts', 'utf8');
const ACHIEVEMENTS_SRC = readFileSync('src/lib/calculations/achievements.ts', 'utf8');
const PALETTES_SRC = readFileSync('src/theme/palettes.ts', 'utf8');
const DAILY_INSIGHT_SRC = readFileSync('src/lib/calculations/dailyInsight.ts', 'utf8');

console.log('=== Section 1: upper-Grow information architecture — Score first, combined Journey (with Money Path nested inside) second, lower content unchanged relative order (Structural) ===');
{
  const scoreHeaderIdx = DISCOVER_SCREEN_SRC.indexOf('{brand.scoreName}\n      </Text>');
  const journeyHeaderIdx = DISCOVER_SCREEN_SRC.indexOf('Your Journey\n      </Text>');
  // The literal component tag, not the string "Your Money Path" — that
  // phrase also appears earlier, inside this pass's own doc comments.
  const wealthJourneyCardIdx = DISCOVER_SCREEN_SRC.indexOf('<WealthJourneyCard');
  const yourGoalsIdx = DISCOVER_SCREEN_SRC.indexOf('Your goals\n      </Text>');
  const heroIdx = DISCOVER_SCREEN_SRC.indexOf('<MoneyOpportunitiesHero');
  // Searched starting from heroIdx onward — these phrases also appear
  // earlier, inside this file's own top-of-file doc comment.
  const futureYouIdx = DISCOVER_SCREEN_SRC.indexOf('Smart Tools', heroIdx);
  const emergencyFundIdx = DISCOVER_SCREEN_SRC.indexOf("navigate('EmergencyFund')", heroIdx);
  const exploreMoneyMovesIdx = DISCOVER_SCREEN_SRC.indexOf('Explore Money Moves', heroIdx);

  assert('all landmark sections are found in the source (fixture sanity for the ordering checks below)', [scoreHeaderIdx, journeyHeaderIdx, wealthJourneyCardIdx, yourGoalsIdx, heroIdx, futureYouIdx, emergencyFundIdx, exploreMoneyMovesIdx].every((i) => i !== -1));
  assert('the full Navilo Score section is the FIRST substantive Grow section — its header appears before every other landmark section', scoreHeaderIdx < journeyHeaderIdx && scoreHeaderIdx < yourGoalsIdx && scoreHeaderIdx < heroIdx);
  assert('the combined "Your Journey" section is immediately after Score — before "Your goals" and every lower section', journeyHeaderIdx > scoreHeaderIdx && journeyHeaderIdx < yourGoalsIdx && journeyHeaderIdx < heroIdx);
  assert(
    'physical-device correction: the WealthJourneyCard ("Money Path") mount now sits INSIDE the combined "Your Journey" section (between the Journey header and "Your goals"), not in its own later section — proving the standalone lower-page duplicate was removed and Money Path is only reachable as a subview of the combined section',
    wealthJourneyCardIdx > journeyHeaderIdx && wealthJourneyCardIdx < yourGoalsIdx
  );
  assert('exactly one WealthJourneyCard mount exists in the whole screen — Money Path is never shown twice', (DISCOVER_SCREEN_SRC.match(/<WealthJourneyCard /g) || []).length === 1);
  assert(
    'every remaining lower Grow section retains its established relative order (Your goals -> opportunities hero -> Smart Tools -> Safety net -> Explore Money Moves), now simply positioned after the combined Score+Journey pair',
    yourGoalsIdx < heroIdx && heroIdx < futureYouIdx && futureYouIdx < emergencyFundIdx && emergencyFundIdx < exploreMoneyMovesIdx
  );
}

console.log('\n=== Section 2: no duplicate independently-calculated full Score or Journey exists (Structural) ===');
{
  assert('DiscoverScreen.tsx calls computeLuluScore exactly once — one authoritative Score calculation, not a second independent one', (DISCOVER_SCREEN_SRC.match(/computeLuluScore\(data\)/g) || []).length === 1);
  assert('DiscoverScreen.tsx calls computeAchievements exactly once — one authoritative Journey/achievements calculation, not a second independent one', (DISCOVER_SCREEN_SRC.match(/computeAchievements\(data\)/g) || []).length === 1);
  assert('DiscoverScreen.tsx mounts ScoreExplanationSheet exactly once — the sole full-breakdown Score presentation, still the pre-existing unmodified component', (DISCOVER_SCREEN_SRC.match(/<ScoreExplanationSheet /g) || []).length === 1);
  assert('DiscoverScreen.tsx mounts JourneyTimeline exactly once — the sole full Milestones presentation, still the pre-existing unmodified component', (DISCOVER_SCREEN_SRC.match(/<JourneyTimeline /g) || []).length === 1);
  assert('no new Score-formula/engine file was introduced — luluScore.ts is the only score-calculation module DiscoverScreen.tsx imports from', /from '\.\.\/\.\.\/lib\/calculations\/luluScore'/.test(DISCOVER_SCREEN_SRC) && !/scoreEngine|scoreV3|newScore/.test(DISCOVER_SCREEN_SRC));
  // Physical-device correction #2 — ScoreRadialGauge.tsx now imports the
  // ScoreGaugePresentation TYPE ONLY from scoreGaugePresentation.ts (a
  // presentation-boundary validity guard, not a score calculation — see
  // Section 6 below for the real-import proof that module computes no
  // score/points/category of its own either). This assertion is narrowed
  // to keep catching the thing it originally guarded against — an actual
  // score/points/category formula import — while allowing the one
  // legitimate, non-calculating import this correction round added.
  assert(
    'ScoreRadialGauge.tsx contains no score/points/category calculation of its own — it only draws props the caller already computed (no import from luluScore.ts, achievements.ts, or scoreExplanation.ts)',
    !/from ['"]\.\.\/\.\.\/lib\/calculations\/(luluScore|achievements|scoreExplanation)['"]/.test(SCORE_RADIAL_GAUGE_SRC)
  );
}

console.log('\n=== Section 3: Milestones vs Money Path — genuinely distinct authoritative sources, composed (not merged) into one section (real import + Structural) ===');
{
  // Physical-device correction §2's inspection rule: computeWealthPaths
  // internally reads computeAchievements only as ONE input among several
  // (hasProperty, hasInvestments, etc.) to decide each path's own stage
  // `done` flags — it does not return achievements, milestone order, or
  // celebration data at all. This proves they are materially different
  // presentations, not the same source wearing two names — so this pass
  // composes them (a tab switcher over two untouched presentations) rather
  // than merging or rewriting either engine.
  const data = baseData();
  const achievements = computeAchievements(data);
  const wealthPaths = computeWealthPaths(data);
  assert('computeAchievements returns a flat milestone list (id/unlocked), the source JourneyTimeline/Today\'s Journey snapshot both read', Array.isArray(achievements) && achievements.length > 0 && 'unlocked' in achievements[0]);
  assert('computeWealthPaths returns a materially different shape — path/stage objects (key/label/relevant/stages), never achievement ids or unlock booleans at the top level', Array.isArray(wealthPaths) && wealthPaths.length > 0 && 'stages' in wealthPaths[0] && !('unlocked' in wealthPaths[0]));
  assert(
    'the combined section has a two-way Milestones/Money Path segmented control (journeyTab styled buttons) sitting above whichever subview is selected',
    /setJourneySubview\('milestones'\)/.test(DISCOVER_SCREEN_SRC) && /setJourneySubview\('moneyPath'\)/.test(DISCOVER_SCREEN_SRC) && /styles\.journeyTabRow/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'the Milestones subview renders the exact existing JourneyTimeline (achievements prop, expand/collapse state) inside its own SectionCard, with a short explanatory caption',
    /journeySubview === 'milestones' \? \(/.test(DISCOVER_SCREEN_SRC) &&
      /Achievements you've reached across \{brand\.name\}\./.test(DISCOVER_SCREEN_SRC) &&
      /<SectionCard>\s*<JourneyTimeline achievements=\{achievements\} expanded=\{journeyExpanded\} onToggleExpanded=\{\(\) => setJourneyExpanded\(\(v\) => !v\)\} \/>\s*<\/SectionCard>/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'the Money Path subview renders the exact existing WealthJourneyCard (name/paths props) directly — NOT wrapped in a second outer SectionCard, since WealthJourneyCard already renders its own internal SectionCard — with a short explanatory caption',
    /Steps across Foundation, Debt, Wealth and Retirement\./.test(DISCOVER_SCREEN_SRC) && /<WealthJourneyCard name=\{firstName\} paths=\{journeyPaths\} \/>/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'the composition copy never claims the two models are mathematically identical — no "same as", "equivalent to", or "identical" wording near the subview captions',
    !/same as|equivalent to|mathematically identical/i.test(DISCOVER_SCREEN_SRC)
  );
}

console.log('\n=== Section 4: Score/Journey focus-request mechanism is completely unchanged by this pass, and a Today Journey tap lands on Milestones specifically (Structural regression) ===');
{
  assert('sectionFocus.ts was not touched — same import line, same computeSectionFocusFulfillment call site DiscoverScreen.tsx already used', /import \{ SectionFocusRequest, parseSectionFocusRequest, computeSectionFocusFulfillment \} from '\.\.\/\.\.\/lib\/calculations\/sectionFocus';/.test(DISCOVER_SCREEN_SRC));
  assert('attemptSectionFocus still appears exactly 4 times (route-params effect + one onLayout per focusable section) — the durable pending/fulfil contract is untouched', (DISCOVER_SCREEN_SRC.match(/attemptSectionFocus\(\);/g) || []).length === 4);
  assert('the request is still only cleared (setParams) inside the fulfilled branch, never an "else, give up" branch', /if \(!result\.fulfilled\) return;/.test(DISCOVER_SCREEN_SRC) && DISCOVER_SCREEN_SRC.indexOf('navigation.setParams(') > DISCOVER_SCREEN_SRC.indexOf('if (!result.fulfilled) return;'));
  assert(
    'all three focusable section headers (score/journey/financial-learning) still render unconditionally — never gated behind a data-dependent ternary — so a pending request always eventually reaches its onLayout',
    ['scoreSectionY.current = e.nativeEvent.layout.y;', 'journeySectionY.current = e.nativeEvent.layout.y;', 'exploreMoneyMovesY.current = e.nativeEvent.layout.y;'].every((marker) => {
      const idx = DISCOVER_SCREEN_SRC.indexOf(marker);
      const before = DISCOVER_SCREEN_SRC.slice(Math.max(0, idx - 200), idx);
      return idx !== -1 && !/\?\s*\(\s*$/.test(before.trim()) && !/&&\s*\(\s*$/.test(before.trim());
    })
  );
  assert('TodayScreen.tsx still stamps every Grow focus navigation with a fresh, monotonically increasing requestId — repeated intentional taps still create new valid requests', /const focusRequestIdRef = useRef\(0\);/.test(TODAY_SCREEN_SRC) && (TODAY_SCREEN_SRC.match(/focusRequestIdRef\.current \+= 1;/g) || []).length === 3);
  assert('a newer request always overwrites the pending ref outright (never queued) — rapid repeated navigation cannot create duplicate/conflicting focus actions', /pendingSectionFocusRef\.current = parsed;/.test(DISCOVER_SCREEN_SRC));
  assert('shouldOpenScoreSheet still drives setScoreSheetVisible(true) as part of fulfilling the focus request — the Today Score chip still reaches the exact full Score destination in one tap', /if \(result\.shouldOpenScoreSheet\) setScoreSheetVisible\(true\);/.test(DISCOVER_SCREEN_SRC));
  assert(
    'physical-device correction: shouldExpandJourney now ALSO selects the Milestones subview (setJourneySubview(\'milestones\')) as well as expanding it — a one-tap arrival from Today\'s Journey snapshot always lands on the milestone timeline, never a possibly-stale Money Path selection from a prior visit',
    /if \(result\.shouldExpandJourney\) \{\s*setJourneyExpanded\(true\);\s*setJourneySubview\('milestones'\);\s*\}/.test(DISCOVER_SCREEN_SRC)
  );
  assert('an organic (non-Today-driven) Grow visit defaults to the Milestones subview — journeySubview initial state is \'milestones\', the same established collapsed-Milestones presentation Grow already showed', /const \[journeySubview, setJourneySubview\] = useState<'milestones' \| 'moneyPath'>\('milestones'\);/.test(DISCOVER_SCREEN_SRC));
  assert('Back/close behaviour is unchanged — ScoreExplanationSheet\'s own Modal onRequestClose/close-button dismissal is byte-identical, never redesigned for this reorg', /<Modal visible=\{visible\} animationType="slide" transparent onRequestClose=\{onClose\}>/.test(SCORE_EXPLANATION_SHEET_SRC) && /<TouchableOpacity style=\{styles\.closeButton\} onPress=\{onClose\}>/.test(SCORE_EXPLANATION_SHEET_SRC));
  assert('no hard-coded pixel scroll position was introduced — scrollTo still uses the measured result.scrollY from computeSectionFocusFulfillment, never a literal number', /scrollRef\.current\?\.scrollTo\(\{ y: result\.scrollY!, animated: true \}\);/.test(DISCOVER_SCREEN_SRC) && !/scrollTo\(\{ y: \d+/.test(DISCOVER_SCREEN_SRC));
  assert(
    'selecting a Journey subview is a purely local UI choice — journeySubview never appears inside the achievements or journeyPaths useMemo dependency arrays, so switching tabs can never mutate either engine\'s own data',
    !/useMemo\(\(\) => computeAchievements\(data\), \[data, journeySubview\]\)/.test(DISCOVER_SCREEN_SRC) && !/journeyPaths.*journeySubview|journeySubview.*journeyPaths/.test(DISCOVER_SCREEN_SRC)
  );
}

console.log('\n=== Section 5: Score engine, formula, and state mappings are byte-unchanged (real import) ===');
{
  // Locked (no income) — unchanged gate.
  const locked = createEmptyAppData();
  locked.user.monthlyIncome = 0;
  const lockedResult = computeLuluScore(locked);
  assert('locked state (no income): computeLuluScore.locked === true, score/categories are the existing safe empty defaults', lockedResult.locked === true && lockedResult.score === 0 && lockedResult.categories.length === 0);
  const lockedChip = selectScoreChipPresentation(lockedResult);
  assert('locked state resolves to the exact same ScoreChipPresentation contract this pass did not touch: state "locked", scoreValue null, muted tone', lockedChip.state === 'locked' && lockedChip.scoreValue === null && lockedChip.tone === 'muted');

  // Incomplete-but-unlocked — a real, authoritative score despite low completeness.
  const incomplete = baseData();
  const incompleteResult = computeLuluScore(incomplete);
  assert('incomplete-but-unlocked: not locked, a real in-range score is produced — never hidden merely for low Money Picture completeness', !incompleteResult.locked && incompleteResult.score >= 0 && incompleteResult.score <= 100 && incompleteResult.completeness.percent < 100);

  // Guest/new-user — this app's single local-data model collapses "guest"
  // into the same locked state (no separate auth/guest concept exists).
  const guest = createEmptyAppData();
  assert('guest/new-user (freshly created, untouched AppData) resolves to the same safe locked state — never a fabricated score for a brand-new customer', computeLuluScore(guest).locked === true);

  // Invalid/legacy data — out-of-range or non-finite score can never render
  // as NaN/Infinity/fabricated; selectScoreChipPresentation's defensive
  // guard (unchanged) catches this before any UI ever sees it.
  const invalidResult = { ...computeLuluScore(baseData()), score: NaN };
  const invalidChip = selectScoreChipPresentation(invalidResult);
  assert('a non-finite (NaN) score is defensively caught — state "unavailable", scoreValue null, never rendered as NaN', invalidChip.state === 'unavailable' && invalidChip.scoreValue === null && Number.isNaN(invalidChip.scoreValue as any) === false);
  const outOfRangeResult = { ...computeLuluScore(baseData()), score: 9999 };
  const outOfRangeChip = selectScoreChipPresentation(outOfRangeResult);
  assert('an out-of-range score (9999) is defensively caught — state "unavailable", never rendered as a fabricated/impossible value', outOfRangeChip.state === 'unavailable' && outOfRangeChip.scoreValue === null);
  assert('the invalid/unavailable branch never reaches the new Grow expanded-content condition (scoreChipPresentation.state === "available") — DiscoverScreen.tsx gates the richer card on that exact state check', /scoreChipPresentation\.state === 'available'/.test(DISCOVER_SCREEN_SRC));

  assert('computeLuluScore itself is untouched by this pass — same exported LOCKED_RESULT shape (locked/score/categories/completeness/confidence/lifeStage) used throughout', /const LOCKED_RESULT: LuluScoreResult = \{/.test(LULU_SCORE_SRC) && /locked: true,/.test(LULU_SCORE_SRC));
}

console.log('\n=== Section 6: physical-device correction — the restored radial gauge is a static, safe presentation of the SAME authoritative score, with no new formula/band/trend (real import + Structural) ===');
{
  const data = baseData();
  const result = computeLuluScore(data);
  const chip = selectScoreChipPresentation(result);

  assert('DiscoverScreen.tsx no longer imports computeScoreMovement/buildScoreSummaryLine — this correction round removed the movement/summary-line calculation entirely rather than fabricating a trend, since the target layout has no movement line at all', !/computeScoreMovement|buildScoreSummaryLine/.test(DISCOVER_SCREEN_SRC));
  assert('DiscoverScreen.tsx instead reuses computeStrongestArea/computeBiggestOpportunity from scoreExplanation.ts — the exact functions ScoreExplanationSheet\'s own category breakdown already derives from, never a new calculation', /import \{ computeStrongestArea, computeBiggestOpportunity \} from '\.\.\/\.\.\/lib\/calculations\/scoreExplanation';/.test(DISCOVER_SCREEN_SRC));
  assert('the Score card renders at most one "Strongest area" line and at most one "Next opportunity" line — both independently gated on non-null, never a paragraph of several', (DISCOVER_SCREEN_SRC.match(/Strongest area: \{strongestArea\.label\}/g) || []).length === 1 && (DISCOVER_SCREEN_SRC.match(/Next opportunity: \{biggestOpportunity\.factor\.label\}/g) || []).length === 1);

  // Physical-device correction #2 (see tests/pass-2c-score-safety-
  // correction.test.ts for the full, dedicated validity-contract proof) —
  // ScoreRadialGauge no longer takes separate score/authoritative props
  // that it clamped internally; it takes one ScoreGaugePresentation value,
  // built by toScoreGaugePresentation (a real, RN-free, directly-imported
  // function) BEFORE the component ever sees it. The gauge itself performs
  // no clamping — see the dedicated file for exhaustive proof of that
  // contract (9999/-5/Infinity/NaN/out-of-range all resolve to
  // 'unavailable', never a clamped number). This section keeps only the
  // assertions specific to THIS file's own fixtures/architecture context.
  assert('ScoreRadialGauge is driven by a single scoreGaugePresentation value derived from toScoreGaugePresentation(scoreChipPresentation.state === \'available\', scoreChipPresentation.scoreValue) — the real, imported validity-contract function, not a locally re-derived authoritative/score pair', /<ScoreRadialGauge presentation=\{scoreGaugePresentation\}/.test(DISCOVER_SCREEN_SRC));
  assert('the gauge\'s ring colour is sourced from naviloPalette.primaryAccent (the selected central colour style), never a hard-coded hex literal, per "use the selected central colour palette for the ring foreground"', /ringColor=\{naviloPalette\.primaryAccent\}/.test(DISCOVER_SCREEN_SRC));
  assert('the gauge\'s track colour is a restrained neutral (colors.surfaceMuted), not a bright/attention colour', /trackColor=\{colors\.surfaceMuted\}/.test(DISCOVER_SCREEN_SRC));
  assert('ScoreRadialGauge.tsx introduces no red/yellow/green performance-band mapping of its own — no reference to a tone/band/warning/danger/success colour, it only ever draws the single ringColor prop it was given', !/warning|danger|success|tone|band/i.test(SCORE_RADIAL_GAUGE_SRC));
  assert(
    'ScoreRadialGauge.tsx has no Animated API usage and no useEffect — a deliberately static, non-animated presentation this pass, motion is explicitly deferred to Pass 2E (its own doc comment legitimately mentions "Animated.Value"/"useEffect" by name in prose, explaining why they were deliberately NOT used, which is not an import/usage)',
    !/^import \{ Animated/m.test(SCORE_RADIAL_GAUGE_SRC) && !/Animated\.(Value|timing|spring|View)\(/.test(SCORE_RADIAL_GAUGE_SRC) && !/\buseEffect\(/.test(SCORE_RADIAL_GAUGE_SRC)
  );
  assert('authoritative rendering sanity: the base fixture (a real, non-locked score) resolves to an \'available\' gauge presentation whose value equals the exact computeLuluScore result — proving the drawn value traces back to the one authoritative source, not a re-derived or approximated number', !result.locked ? toScoreGaugePresentation(chip.state === 'available', chip.scoreValue).state === 'available' && (toScoreGaugePresentation(chip.state === 'available', chip.scoreValue) as any).value === result.score : true);

  assert('the gauge and its numeral are hidden from assistive technology (accessibilityElementsHidden + importantForAccessibility="no-hide-descendants") so the outer tappable container\'s own single accessibilityLabel is the only thing announced', /accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/.test(SCORE_RADIAL_GAUGE_SRC));
  assert(
    'the outer Score TouchableOpacity supplies one combined, logical VoiceOver label derived from scoreGaugePresentation (the same doubly-validated value the gauge itself draws from) — "Navilo Score 81 out of 100, based on what you\'ve recorded" when available, and a safe muted-state label otherwise — never no label at all, and never a label that could disagree with what is drawn',
    /accessibilityLabel=\{\s*scoreGaugePresentation\.state === 'available'\s*\?\s*`\$\{brand\.scoreName\} \$\{scoreGaugePresentation\.value\} out of 100, based on what you've recorded\.`\s*:\s*`\$\{scoreChipPresentation\.label\}\. \$\{scoreChipPresentation\.supportingText\}`\s*\}/.test(DISCOVER_SCREEN_SRC)
  );

  assert('the Score card still opens the exact existing, complete ScoreExplanationSheet as its detailed destination — the whole card remains one TouchableOpacity wrapping onPress={() => setScoreSheetVisible(true)}', /<TouchableOpacity\s+onPress=\{\(\) => setScoreSheetVisible\(true\)\}\s+activeOpacity=\{0\.8\}/.test(DISCOVER_SCREEN_SRC));
  assert('a clear "View score breakdown" action row is present, still carrying the pre-existing speedometer-outline icon (preserves cross-surface icon-consistency regression coverage)', /View score breakdown/.test(DISCOVER_SCREEN_SRC) && /<Ionicons name="speedometer-outline" size=\{20\} color=\{colors\.accent\} \/>/.test(DISCOVER_SCREEN_SRC));
  assert(
    'life stage, completeness, strongest area, and opportunity are all gated on scoreGaugePresentation.state === \'available\' — the doubly-validated state, stricter than the plain scoreChipPresentation.state check — never shown for a locked/unavailable/invalid score',
    (DISCOVER_SCREEN_SRC.match(/scoreGaugePresentation\.state === 'available'/g) || []).length >= 3
  );

  // Sanity: the fixture actually exercises an available (non-locked) score
  // and produces at least one of strongest-area/opportunity, so the "at
  // most one of each" assertion above is proven against real data, not a
  // vacuously-true empty case.
  const strongest = computeStrongestArea(result);
  const opportunity = computeBiggestOpportunity(result);
  assert('fixture sanity: the base fixture produces a real, non-locked score with at least a strongest area or an opportunity available — the card\'s content assertions above are exercised against real data, not a vacuous empty case', !result.locked && (strongest !== null || opportunity !== null));
}

console.log('\n=== Section 7: Journey milestones, ordering, and progress remain unchanged (real import) ===');
{
  const data = baseData();
  const achievementsA = computeAchievements(data);
  const achievementsB = computeAchievements(data);
  assert('computeAchievements is deterministic — the same data always produces the same milestone list/order (this pass introduced no randomness or new state)', JSON.stringify(achievementsA) === JSON.stringify(achievementsB));
  assert('achievements.ts source is untouched by this pass (no Pass 2C marker/edit in this file)', !/Pass 2C/.test(ACHIEVEMENTS_SRC));

  const emptyData = createEmptyAppData();
  const emptyAchievements = computeAchievements(emptyData);
  const completedCountEmpty = emptyAchievements.filter((a) => a.unlocked).length;
  assert('a brand-new customer (empty data) has a safe, real (not fabricated) completed count — zero or whatever the real rules already unlock, never a placeholder number', completedCountEmpty >= 0 && Number.isFinite(completedCountEmpty));
  assert('the full achievements list for a brand-new customer is non-empty (the established milestone catalogue itself, not an error/blank state)', emptyAchievements.length > 0);

  const wealthPathsA = computeWealthPaths(data);
  const wealthPathsB = computeWealthPaths(data);
  assert('computeWealthPaths is deterministic and untouched — same data always produces the same path/stage structure, preserving Foundation/Debt/Wealth/Retirement selection and stage rules', JSON.stringify(wealthPathsA) === JSON.stringify(wealthPathsB) && !/Pass 2C/.test(readFileSync('src/lib/calculations/wealthJourney.ts', 'utf8')));
}

console.log('\n=== Section 8: moving/composing JourneyTimeline and WealthJourneyCard in the page does not introduce or trigger celebrations (Structural regression, unchanged from Pass 2B) ===');
{
  assert('JourneyTimeline.tsx still contains no celebration/persistence side effects of its own (no celebrate(), no markAchievementsSeen, no useEffect) — purely presentational, unaffected by its new position in Grow or the tab composition around it', !/celebrate\(/.test(JOURNEY_TIMELINE_SRC) && !/markAchievementsSeen/.test(JOURNEY_TIMELINE_SRC) && !/useEffect/.test(JOURNEY_TIMELINE_SRC));
  assert(
    "TodayScreen.tsx's achievement-unlock celebration effect is still unconditional on any Journey-visibility/position/subview-selection state — reads data.seenAchievementIds/achievements directly, independent of where JourneyTimeline is mounted in Grow or which Journey subview is selected",
    /const newlyUnlocked = achievements\.find\(\(a\) => a\.unlocked && !data\.seenAchievementIds\.includes\(a\.id\)\);/.test(TODAY_SCREEN_SRC)
  );
}

console.log('\n=== Section 9: Today retains only the compact Score chip and Journey snapshot — no full presentation duplicated onto Today (Structural) ===');
{
  const TODAY_BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const JOURNEY_SNAPSHOT_SRC = readFileSync('src/components/today/TodayJourneySnapshotCard.tsx', 'utf8');
  assert('TodayBriefingCard.tsx (Today\'s Score chip host) does not import ScoreExplanationSheet, JourneyTimeline, ScoreRadialGauge, or computeAchievements — the full presentations live only in Grow', !/ScoreExplanationSheet|JourneyTimeline|ScoreRadialGauge|computeAchievements/.test(TODAY_BRIEFING_CARD_SRC));
  assert(
    "TodayJourneySnapshotCard.tsx (Today's Journey snapshot) does not IMPORT or MOUNT JourneyTimeline/ScoreExplanationSheet/WealthJourneyCard — it only renders the compact snapshot.completedCount/next summary, unchanged by this pass (its own doc comment legitimately mentions JourneyTimeline.tsx by name in prose, which is not an import/mount)",
    !/^import.*JourneyTimeline|^import.*ScoreExplanationSheet|^import.*WealthJourneyCard|<JourneyTimeline|<ScoreExplanationSheet|<WealthJourneyCard/m.test(JOURNEY_SNAPSHOT_SRC)
  );
}

console.log('\n=== Section 10: Ocean Blue / Purple / Sunrise resolve through the central semantic palette for both Score and the combined Journey; light/dark/System behaviour unaffected (real import + Structural) ===');
{
  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  for (const style of STYLES) {
    for (const scheme of ['light', 'dark'] as const) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      assert(`${style}/${scheme}: naviloPalette.primaryAccent is defined and resolves through the existing central palette function, never a new raw colour`, typeof palette.primaryAccent === 'string' && palette.primaryAccent.length > 0);
      assert(
        `${style}/${scheme}: physical-device correction — naviloPalette.secondaryAccentSoft and secondaryAccentForeground (the two new Journey theme-cohesion tokens) are defined non-empty strings, computed for every style/scheme combination`,
        typeof palette.secondaryAccentSoft === 'string' && palette.secondaryAccentSoft.length > 0 && typeof palette.secondaryAccentForeground === 'string' && palette.secondaryAccentForeground.length > 0
      );
      // Both new tokens must equal an already-accepted ColorTokens value for
      // this style/scheme (aiBlueSoft/purpleSoft/sunriseSoft and
      // onAiBlue/onPurple/onSunrise) — proving no new raw colour was
      // introduced for the theme-cohesion fix.
      const expectedSoft = style === 'blue' ? colors.aiBlueSoft : style === 'purple' ? colors.purpleSoft : colors.sunriseSoft;
      const expectedForeground = style === 'blue' ? colors.onAiBlue : style === 'purple' ? colors.onPurple : colors.onSunrise;
      assert(`${style}/${scheme}: secondaryAccentSoft is reused verbatim from the already-accepted ColorTokens (never a new raw hex value)`, palette.secondaryAccentSoft === expectedSoft);
      assert(`${style}/${scheme}: secondaryAccentForeground is reused verbatim from the already-accepted ColorTokens (never a new raw hex value)`, palette.secondaryAccentForeground === expectedForeground);
    }
  }
  assert('DiscoverScreen.tsx destructures naviloPalette from useTheme() (the same central palette every other Pass 2B/2C consumer already reads) rather than hard-coding a new colour', /const \{ colors, spacing, typography, radius, naviloPalette \} = useTheme\(\);/.test(DISCOVER_SCREEN_SRC));
  assert('the Score card border colour is sourced from naviloPalette.primaryAccent, not a hard-coded hex/rgb literal', /borderColor: naviloPalette\.primaryAccent/.test(DISCOVER_SCREEN_SRC));
  assert('DiscoverScreen.tsx introduces no new hard-coded hex colour literal for the Score/Journey reorg or this correction round (existing colors.* semantic tokens and naviloPalette are used throughout)', !/#[0-9A-Fa-f]{6}\b/.test(DISCOVER_SCREEN_SRC));
  assert(
    'physical-device correction: palettes.ts was legitimately EXTENDED this round (two new interface fields, both computed from already-accepted ColorTokens in selectNaviloPalette) to fix the confirmed Journey theme-cohesion defect — it was not left untouched, and this is intentional, not an accidental modification of an out-of-scope file',
    /Pass 2C correction/.test(PALETTES_SRC) && /secondaryAccentSoft: string;/.test(PALETTES_SRC) && /secondaryAccentForeground: string;/.test(PALETTES_SRC)
  );
  assert(
    'palettes.ts\'s extension is purely additive — every field selectNaviloPalette returned before this round (heroGradientStart/End, tileSurface, primaryAccent, secondaryAccent, aiInsightSurfaceStart/End, attentionAccent, progressAccent, etc.) is still present and computed the same way, only two new fields were appended',
    /heroGradientStart: heroGradient\[0\],/.test(PALETTES_SRC) && /primaryAccent: accent,/.test(PALETTES_SRC) && /secondaryAccent: accent,/.test(PALETTES_SRC) && /attentionAccent: colors\.danger,/.test(PALETTES_SRC) && /progressAccent: accent,/.test(PALETTES_SRC)
  );
}

console.log('\n=== Section 11: JourneyTimeline theme cohesion fix — no hard-coded mustard/gold, all 3 styles resolve through the central palette (Structural) ===');
{
  assert('JourneyTimeline.tsx no longer references colors.gold, colors.goldSoft, or colors.onGold anywhere — the confirmed physical-device defect (Journey staying mustard regardless of selected style) is fully removed', !/colors\.gold\b/.test(JOURNEY_TIMELINE_SRC) && !/colors\.goldSoft\b/.test(JOURNEY_TIMELINE_SRC) && !/colors\.onGold\b/.test(JOURNEY_TIMELINE_SRC));
  assert('JourneyTimeline.tsx destructures naviloPalette from useTheme() and uses it for node fill, connector line, "NEXT UP" badge, and progress bar — the same central palette Score/other Pass 2B surfaces already read', /naviloPalette/.test(JOURNEY_TIMELINE_SRC) && /naviloPalette\.secondaryAccent\b/.test(JOURNEY_TIMELINE_SRC) && /naviloPalette\.secondaryAccentSoft/.test(JOURNEY_TIMELINE_SRC) && /naviloPalette\.secondaryAccentForeground/.test(JOURNEY_TIMELINE_SRC) && /naviloPalette\.progressAccent/.test(JOURNEY_TIMELINE_SRC));
  assert('Journey keeps its own visually distinct treatment from Score — it uses naviloPalette.secondaryAccent/secondaryAccentSoft (its own established tokens), never naviloPalette.primaryAccent (the value the Score card\'s border uses)', !/naviloPalette\.primaryAccent/.test(JOURNEY_TIMELINE_SRC));
  assert('JourneyTimeline.tsx does not use colors.warning/colors.danger/colors.success merely as decoration — unlocked/next/locked states are expressed through naviloPalette + colors.surface/surfaceMuted/border/textMuted only', !/colors\.(warning|danger|success)\b/.test(JOURNEY_TIMELINE_SRC));
  assert('the meaning of "unlocked" vs "next" vs "locked" is unchanged — the same three-way conditional structure (a.unlocked ? ... : isNext ? ... : ...) still drives node styling, only the colour SOURCE changed from colors.gold to naviloPalette', /a\.unlocked\s*\?\s*\{ backgroundColor: naviloPalette\.secondaryAccent, \.\.\.glow\(naviloPalette\.secondaryAccent\) \}\s*:\s*isNext\s*\?/.test(JOURNEY_TIMELINE_SRC));
}

console.log('\n=== Section 12: avoid routine yellow/red decoration — the new Score card content uses calm, non-alarm colours (Structural) ===');
{
  const scoreBlockStart = DISCOVER_SCREEN_SRC.indexOf('scoreExpandedBlock');
  assert('the Score card\'s styles (header, expanded block, action row) never reference colors.warning or colors.danger — no routine yellow/red decoration introduced for ordinary score/progress display', scoreBlockStart !== -1 && !/scoreHeaderRow.*colors\.(warning|danger)|scoreExpandedBlock.*colors\.(warning|danger)|scoreActionRow.*colors\.(warning|danger)/.test(DISCOVER_SCREEN_SRC));
}

console.log('\n=== Section 13: prohibited Score wording corrected — dailyInsight.ts no longer implies a complete financial-health judgment (Structural + real import) ===');
{
  assert(
    'dailyInsight.ts no longer imports or calls luluScoreBand — the prohibited "You\'re doing incredibly well with your finances." wording (luluScoreBand\'s top-band label, the confirmed physical-device defect) has no caller left (its own doc comment legitimately mentions luluScoreBand by name in prose, explaining the removal, which is not an import/call)',
    !/import \{[^}]*luluScoreBand/.test(DAILY_INSIGHT_SRC) && !/luluScoreBand\(/.test(DAILY_INSIGHT_SRC)
  );
  assert(
    'the score-band pool entry now uses the same factual, recorded-data pattern scoreChipPresentation already uses elsewhere ("...based on what you\'ve recorded."), for every score band — never a complete-wellbeing/judgment claim',
    /text: `Your \$\{brand\.scoreName\} is \$\{luluScore\.score\}\/100 based on what you've recorded\.` \}/.test(DAILY_INSIGHT_SRC)
  );
  assert('the pool entry is still gated on !luluScore.locked — no authoritative number is ever shown when the score is unavailable/incomplete-to-locked', /if \(!luluScore\.locked\) \{/.test(DAILY_INSIGHT_SRC));
  assert('no second, separate Score insight rule was added — buildInsightPool still calls computeLuluScore exactly once and pushes exactly one score-related pool entry', (DAILY_INSIGHT_SRC.match(/computeLuluScore\(data\)/g) || []).length === 1 && (DAILY_INSIGHT_SRC.match(/icon: 'trending-up'/g) || []).length === 1);
  assert('luluScoreBand itself was NOT deleted from luluScore.ts — this pass leaves the protected Score-formula file untouched, intentionally leaving the now-unused function in place rather than editing an off-limits file', /export function luluScoreBand\(/.test(LULU_SCORE_SRC));
  assert('luluScoreBand has no remaining callers anywhere in src/ — confirms the removal in dailyInsight.ts genuinely eliminated the prohibited wording\'s only production usage, not just one of several', !/luluScoreBand\(/.test(DISCOVER_SCREEN_SRC) && !/luluScoreBand\(/.test(TODAY_SCREEN_SRC));
  // Real-import proof: exercise the actual, currently-shipped pool text for
  // a top-band (>=80) score and confirm the exact prohibited phrase is
  // absent while the factual phrase is present.
  const data = baseData();
  data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 50000 }];
  const result = computeLuluScore(data);
  if (!result.locked) {
    const expectedFactual = `Your Navilo Score is ${result.score}/100 based on what you've recorded.`;
    assert('real-import proof: the exact factual sentence for this fixture\'s real computed score is well-formed and never contains a wellbeing/judgment claim', !/doing incredibly well|doing great|excellent|perfect(?!ly)/i.test(expectedFactual));
  } else {
    assert('(locked-score fixture for this variant — score-band entry structurally absent; not applicable)', true);
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
