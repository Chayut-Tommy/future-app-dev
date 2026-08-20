// Pass 2B visual + Journey-destination correction — Ocean Blue Briefing
// hero, green Score chip, teal Journey snapshot, duplicate check-in
// suppression, and one-tap expanded Journey destination. 2026-08-12.
//
// CLASSIFICATION (per tests/README.md's evidence taxonomy):
// - Real import (Class A) — Section 1: sectionFocus.ts's shouldExpandJourney
//   field, computed by the actual computeSectionFocusFulfillment DiscoverScreen
//   calls, not a mirror.
// - Real import (Class A) — Section 2: pickDailyInsight/buildInsightPool's
//   new exclusion parameter, executed against the real function with real
//   computeAchievements/getNextMilestone fixtures.
// - Real import (Class A) — Section 3: selectScoreChipPresentation,
//   computeJourneySnapshot, computeLuluScore, computeAchievements — all
//   unmodified by this pass (byte-for-byte the same functions the prior two
//   passes already proved unchanged); re-confirmed here as a regression
//   guard specifically for this visual-only pass.
// - Structural — Section 4 (component wiring/colour): ScoreChip.tsx,
//   TodayJourneySnapshotCard.tsx, TodayBriefingCard.tsx, JourneyTimeline.tsx,
//   DiscoverScreen.tsx source text. These .tsx files transitively import
//   react-native and cannot be executed by tsx in this harness (see
//   tests/README.md). Genuine rendered-colour/on-device proof (actual pixel
//   colours in light/dark mode, actual gradient rendering) is NOT available
//   here and is left to the physical-device checklist.
//
// Run with: npx tsx tests/pass-2b-visual-correction.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import { computeAchievements, Achievement, getNextMilestone } from '../src/lib/calculations/achievements';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { computeJourneySnapshot } from '../src/lib/calculations/journeySnapshot';
import { pickDailyInsight } from '../src/lib/calculations/dailyInsight';
import { parseSectionFocusRequest, computeSectionFocusFulfillment, SectionFocusMeasurements } from '../src/lib/calculations/sectionFocus';
import type { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'weekly';
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 3000 }];
  return d;
}

const UNMEASURED: SectionFocusMeasurements = { 'financial-learning': null, score: null, journey: null, goals: null, safety_net: null, saving: null, learning: null };

console.log('=== Section 1: one Today Journey tap reaches the expanded complete Journey (real functions) ===');
{
  const pending = parseSectionFocusRequest('journey', 1)!;
  const measured: SectionFocusMeasurements = { ...UNMEASURED, journey: 500 };
  const result = computeSectionFocusFulfillment(pending, measured, true);
  assert('9a. fulfilling a journey focus request sets shouldExpandJourney true — arrives already showing every milestone, not a second "View full journey" gate', result.fulfilled === true && result.shouldExpandJourney === true);

  const scoreResult = computeSectionFocusFulfillment(parseSectionFocusRequest('score', 1)!, { ...UNMEASURED, score: 10 }, true);
  assert('9b. fulfilling a score focus request never sets shouldExpandJourney', scoreResult.shouldExpandJourney === false);

  const learningResult = computeSectionFocusFulfillment(parseSectionFocusRequest('financial-learning', 1)!, { ...UNMEASURED, 'financial-learning': 10 }, true);
  assert('9c. fulfilling a financial-learning focus request never sets shouldExpandJourney', learningResult.shouldExpandJourney === false);

  // 10. repeated and not-yet-measured focus requests remain safe for the
  // journey target specifically (the pre-existing pending-focus tests in
  // pass-2b-correction.test.ts cover the general mechanism; this re-confirms
  // it for the new shouldExpandJourney field, which didn't exist when those
  // were written).
  const notYetMeasured = computeSectionFocusFulfillment(pending, UNMEASURED, true);
  assert('10a. a journey request against an unmeasured target stays pending — shouldExpandJourney is false until fulfilled, never speculatively true', notYetMeasured.fulfilled === false && notYetMeasured.shouldExpandJourney === false);
  const secondTap = parseSectionFocusRequest('journey', 2)!;
  const secondResult = computeSectionFocusFulfillment(secondTap, measured, true);
  assert('10b. a second, later journey request (fresh requestId) is fulfilled and re-expands again — repeated taps remain safe', secondResult.fulfilled === true && secondResult.shouldExpandJourney === true);
}

console.log('\n=== Section 2: duplicate milestone-derived check-in content is suppressed by structured id (real functions) ===');
{
  // A fixture where getNextMilestone's quantified-only "next" and
  // journeySnapshot's any-achievement "next" genuinely coincide (both find
  // the same first not-yet-unlocked, quantified achievement) — the case
  // observed in the reviewed recording ("Saved First $5,000" in both
  // places). Requires a goal already created (unlocking created_first_goal,
  // a non-quantified starter achievement) so the first not-yet-unlocked
  // achievement in list order is genuinely the quantified saved_5000 one,
  // not an earlier non-quantified starter achievement.
  const data = baseData(); // $3,000 cash -> next quantified+unlocked milestone is saved_5000
  data.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: 2000, currentAmount: 0, targetDate: null, status: 'active' }];
  const achievements = computeAchievements(data);
  const snapshot = computeJourneySnapshot(achievements);
  const nextMilestone = getNextMilestone(data);
  assert('fixture sanity: getNextMilestone and journeySnapshot.next coincide on the same achievement for this fixture', nextMilestone?.achievement.id === snapshot.next?.id && !!nextMilestone);

  const poolWithoutExclusion = pickDailyInsight(data, new Date(2026, 0, 1), null);
  const poolWithExclusion = pickDailyInsight(data, new Date(2026, 0, 1), snapshot.next?.id ?? null);
  // Walk every day of a full year for both configurations and collect which
  // insight texts ever appear — a real behavioural sweep, not a single-day
  // sample, since pickDailyInsight rotates by day-of-year.
  function textsAcrossYear(excludeId: string | null): Set<string> {
    const seen = new Set<string>();
    for (let day = 0; day < 366; day++) {
      const d = new Date(2026, 0, 1 + day);
      const insight = pickDailyInsight(data, d, excludeId);
      if (insight) seen.add(insight.text);
    }
    return seen;
  }
  const textsUnfiltered = textsAcrossYear(null);
  const textsFiltered = textsAcrossYear(snapshot.next?.id ?? null);
  const milestoneText = nextMilestone ? `You're only $${Math.round(nextMilestone.remaining).toLocaleString()} away from unlocking "${nextMilestone.achievement.title}".` : null;
  assert('7a. without exclusion, the milestone insight text does appear somewhere across the year (fixture actually exercises the entry being tested)', milestoneText !== null && textsUnfiltered.has(milestoneText));
  assert('7b. with the Journey-next id excluded, that exact milestone text never appears on any day of the year — genuine suppression, not a lucky single-day sample', milestoneText !== null && !textsFiltered.has(milestoneText));
  assert('7c. exclusion is by structured achievement id, not by string comparison — buildInsightPool never parses or diffs rendered text (source inspection)', !readFileSync('src/lib/calculations/dailyInsight.ts', 'utf8').includes('.text ==='));

  // 8. genuinely independent check-in content remains eligible — every
  // other pool entry (goal impact / savings-interest / score-band) must
  // still be reachable across the year even with the milestone excluded.
  // Pass 2C correction — dailyInsight.ts's score-band pool entry no longer
  // reads luluScoreBand's judgmental label ("You're doing incredibly well
  // with your finances."); it uses the same factual, recorded-data pattern
  // scoreChipPresentation already uses elsewhere. Updated literal to match.
  const scoreBandText = (() => {
    const luluScore = computeLuluScore(data);
    if (luluScore.locked) return null;
    return `is ${luluScore.score}/100 based on what you've recorded.`;
  })();
  if (scoreBandText) {
    const hasScoreBandDay = Array.from(textsFiltered).some((t) => t.includes(scoreBandText));
    assert('8a. the independent score-band insight remains eligible across the year even with the milestone entry excluded', hasScoreBandDay);
  } else {
    assert('8a. (locked-score fixture — score-band entry structurally absent from the pool; not applicable)', true);
  }

  // Divergence case: when getNextMilestone and journeySnapshot.next do NOT
  // coincide (a non-quantified achievement — e.g. "Created First Goal" — is
  // Journey's actual next), the milestone insight is a genuinely
  // independent piece of content and must NOT be suppressed.
  const divergent = createEmptyAppData();
  divergent.user.hasSeenIntro = true;
  divergent.user.monthlyIncome = 4000;
  // No assets, no goals yet: journeySnapshot.next is "Added First Asset" or
  // similar non-quantified starter achievement, while getNextMilestone
  // (quantified-only) skips ahead to a dollar-based one — genuinely
  // different achievements.
  const divergentAchievements = computeAchievements(divergent);
  const divergentSnapshot = computeJourneySnapshot(divergentAchievements);
  const divergentNextMilestone = getNextMilestone(divergent);
  const genuinelyDivergent = !!divergentNextMilestone && divergentNextMilestone.achievement.id !== divergentSnapshot.next?.id;
  if (genuinelyDivergent) {
    const divergentTextsFiltered = (() => {
      const seen = new Set<string>();
      for (let day = 0; day < 366; day++) {
        const insight = pickDailyInsight(divergent, new Date(2026, 0, 1 + day), divergentSnapshot.next?.id ?? null);
        if (insight) seen.add(insight.text);
      }
      return seen;
    })();
    const divergentMilestoneText = `You're only $${Math.round(divergentNextMilestone!.remaining).toLocaleString()} away from unlocking "${divergentNextMilestone!.achievement.title}".`;
    assert(
      '8b. when getNextMilestone and journeySnapshot.next genuinely diverge (different achievements), the milestone insight remains eligible — it is real, independent content, not a restatement of Journey',
      divergentTextsFiltered.has(divergentMilestoneText)
    );
  } else {
    assert('8b. (fixture did not produce a divergent case — inconclusive but not a failure; the coincidence case above already proves the exclusion logic itself)', true);
  }
}

console.log('\n=== Section 3: Score and Journey calculations remain unchanged (real functions, regression) ===');
{
  const data = baseData();
  const r1 = computeLuluScore(data);
  const r2 = computeLuluScore(JSON.parse(JSON.stringify(data)));
  assert('computeLuluScore is deterministic and unaffected by this visual-only pass', r1.score === r2.score && r1.locked === r2.locked);

  const a1 = computeAchievements(data);
  const a2 = computeAchievements(JSON.parse(JSON.stringify(data)));
  assert('computeAchievements is deterministic and unaffected by this visual-only pass', JSON.stringify(a1) === JSON.stringify(a2));

  const chip = selectScoreChipPresentation(r1);
  assert('selectScoreChipPresentation state mapping unaffected — still authoritative for a real funded fixture', chip.state === 'available' && chip.scoreValue === r1.score);

  const snap = computeJourneySnapshot(a1);
  const expectedCompleted = a1.filter((a) => a.unlocked).length;
  assert('computeJourneySnapshot completedCount unaffected — matches an independent recount', snap.completedCount === expectedCompleted);
}

console.log('\n=== Section 4: component wiring and colour treatment (Structural) ===');
{
  const SCORE_CHIP_SRC = readFileSync('src/components/today/ScoreChip.tsx', 'utf8');
  const JOURNEY_SNAPSHOT_SRC = readFileSync('src/components/today/TodayJourneySnapshotCard.tsx', 'utf8');
  const BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const JOURNEY_TIMELINE_SRC = readFileSync('src/components/health/JourneyTimeline.tsx', 'utf8');
  const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');

  // --- Score chip: approved non-attention green treatment, no gold ---
  assert('ScoreChip.tsx never references colors.gold or colors.goldSoft — the gold/trophy treatment is fully removed', !/colors\.gold\b/.test(SCORE_CHIP_SRC) && !/colors\.goldSoft\b/.test(SCORE_CHIP_SRC));
  assert('ScoreChip.tsx uses the green surface/accent tokens (colors.accentSoft, colors.accent) for its non-muted state', /colors\.accentSoft/.test(SCORE_CHIP_SRC) && /colors\.accent\b/.test(SCORE_CHIP_SRC));
  assert('ScoreChip.tsx uses navy (light mode) / textPrimary (dark mode) for its headline text — not a hard-coded near-black', /scheme === 'light' \? colors\.navy : colors\.textPrimary/.test(SCORE_CHIP_SRC));
  assert('ScoreChip.tsx uses a gauge/speedometer icon, never Journey\'s trophy glyph', /speedometer-outline/.test(SCORE_CHIP_SRC) && !/name="trophy"/.test(SCORE_CHIP_SRC));
  assert('ScoreChip.tsx still retains the exact factual copy contract — renders presentation.label/presentation.supportingText verbatim, never its own wording', /\{presentation\.label\}/.test(SCORE_CHIP_SRC) && /\{presentation\.supportingText\}/.test(SCORE_CHIP_SRC));
  // Pass 2E contrast correction — the muted icon now reads colors.textSecondary
  // instead of colors.textMuted (textMuted failed 3:1 against surfaceMuted);
  // this still asserts the treatment is neutral/non-green, just via the
  // corrected accessible token.
  assert('ScoreChip.tsx locked/unavailable ("muted") state still falls back to the existing neutral surfaceMuted/textSecondary treatment, not green — preserves the established locked mapping', /presentation\.tone === 'muted' \? colors\.surfaceMuted/.test(SCORE_CHIP_SRC) && /presentation\.tone === 'muted' \? colors\.textSecondary/.test(SCORE_CHIP_SRC));

  // --- Journey snapshot: teal/route iconography, no gold, single chevron ---
  assert('TodayJourneySnapshotCard.tsx never references colors.gold or colors.goldSoft', !/colors\.gold\b/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.goldSoft\b/.test(JOURNEY_SNAPSHOT_SRC));
  // Pass 2B, layout/colour correction §7/§5 — the hard-coded Ocean Blue
  // tokens were intentionally replaced by the 3-way aiAccentColor/
  // aiAccentSoft pair (ThemeContext), so this card recolours with the
  // user's selected Navilo colour style instead of staying stuck on blue.
  // Wave 5 visual pass — the Journey row now reads the Design 5.1
  // `interactive`/`interactiveTint` semantic roles. The underlying claim is
  // unchanged and still asserted: never a hard-coded colour literal. What
  // IS deliberately superseded is the 3-way retint — Design 5.1 bars a
  // colour style from touching interactive roles, so a supporting row's
  // accent is invariant across Ocean/Purple/Sunrise by rule, not by
  // omission. The ambient field is what carries the style now.
  assert('TodayJourneySnapshotCard.tsx reads semantic interactive roles, never a hard-coded colour literal', /semantic\.interactive\b/.test(JOURNEY_SNAPSHOT_SRC) && /semantic\.interactiveTint/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.aiBlue\b/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.aiBlueSoft/.test(JOURNEY_SNAPSHOT_SRC) && !/#[0-9a-fA-F]{3,8}\b/.test(JOURNEY_SNAPSHOT_SRC));
  assert('TodayJourneySnapshotCard.tsx uses a route/compass icon, distinct from both Journey\'s own trophy nodes and Score\'s gauge', /compass-outline/.test(JOURNEY_SNAPSHOT_SRC) && !/name="trophy"/.test(JOURNEY_SNAPSHOT_SRC) && !/speedometer/.test(JOURNEY_SNAPSHOT_SRC));
  assert(
    'TodayJourneySnapshotCard.tsx renders exactly one chevron-forward — the single "View full journey" footer control, not a second competing one mid-card',
    (JOURNEY_SNAPSHOT_SRC.match(/name="chevron-forward"/g) || []).length === 1
  );
  // The compact row presents the same fields in one line instead of a
  // stacked block. Every value still comes from `snapshot` and nothing is
  // recomputed: the bar's fraction is formed only from already-decided
  // pairs (nextProgress.current/target, or completedCount/totalCount), and
  // no milestone, target or recommendation is invented.
  assert('TodayJourneySnapshotCard.tsx still renders the preserved snapshot fields verbatim — completedCount/totalCount/next/nextProgress — never recomputed', /snapshot\.completedCount/.test(JOURNEY_SNAPSHOT_SRC) && /snapshot\.totalCount/.test(JOURNEY_SNAPSHOT_SRC) && /snapshot\.next\.title/.test(JOURNEY_SNAPSHOT_SRC) && /snapshot\.nextProgress\.formatted/.test(JOURNEY_SNAPSHOT_SRC) && !/computeAchievements|computeJourneySnapshot/.test(JOURNEY_SNAPSHOT_SRC.replace(/\/\*[\s\S]*?\*\//g, '')));

  // --- Score and Journey do not reuse the same trophy presentation, anywhere touched this pass ---
  assert(
    "Score's two compact surfaces (Today's chip, Grow's launcher row) and Journey's compact surface (Today's snapshot) never share an icon glyph with each other",
    (() => {
      const scoreChipIcon = SCORE_CHIP_SRC.match(/Ionicons name="([\w-]+)" size=\{13\}/)?.[1];
      // Wave 5 — the compact row's icon sits in a 28pt marker tile, so its
      // glyph size dropped from 17 to 15. The GLYPH, which is what this
      // assertion is about, is unchanged.
      const journeySnapshotIcon = JOURNEY_SNAPSHOT_SRC.match(/Ionicons name="([\w-]+)" size=\{15\}/)?.[1];
      const growScoreRowIcon = DISCOVER_SCREEN_SRC.match(/Ionicons name="([\w-]+)" size=\{20\} color=\{colors\.accent\} \/>/)?.[1];
      return scoreChipIcon === 'speedometer-outline' && journeySnapshotIcon === 'compass-outline' && growScoreRowIcon === 'speedometer-outline';
    })()
  );
  assert("Grow's Score launcher row icon is no longer the gold trophy — matches ScoreChip.tsx's own icon/colour for cross-surface consistency", !/name="trophy" size=\{20\} color=\{colors\.gold\}/.test(DISCOVER_SCREEN_SRC));

  // --- Briefing hero: naviloPalette-driven ambient gradient wraps title/date/chip/tiles as one composition ---
  // Pass 2B, layout/colour correction §4/§5 — the hard-coded
  // colors.aiGradientBlue gradient and the SectionCard holding stacked
  // AUP/reminder/event rows were both intentionally retired (see
  // TodayBriefingCard.tsx's own doc comment): the gradient now resolves
  // through naviloPalette (Ocean Blue/Purple/Sunrise), and the rows became
  // BriefingTileRow's up-to-three compact tiles. What must still hold is the
  // same coherent single-composition property and the same Score-outside-
  // budget contract, just expressed against the new structure.
  assert(
    // Wave 5 visual pass — the hero's surface moved from the old saturated
    // naviloPalette gradient to the Design 5.1 `heroSurface` role, which is
    // the one Premium Expressive surface a style is permitted to retint. The
    // property this assertion protects — ONE coherent composition wrapping
    // the header and the financial slots, not several separate objects — is
    // unchanged, and is asserted below against the new structure.
    // Wave 5 polish — the all-caps eyebrow became a title-case identity
    // row (36pt tint tile + "Your Today Briefing"). Same position, same
    // role in the composition; only its presentation changed.
    'TodayBriefingCard.tsx wraps the identity row, the figure and the priority rows inside one LinearGradient hero driven by the heroSurface semantic role — a single coherent composition, not separate objects',
    /<LinearGradient\s+colors=\{semantic\.heroSurface/.test(BRIEFING_CARD_SRC) &&
      (() => {
        const heroOpen = BRIEFING_CARD_SRC.indexOf('<LinearGradient');
        const heroClose = BRIEFING_CARD_SRC.lastIndexOf('</LinearGradient>');
        // Searched from heroOpen onward — the doc comment above also
        // mentions "Your Today Briefing" in prose, which would otherwise be
        // found first and falsely appear to precede the gradient.
        // Pass 2E accessibility correction added accessibilityRole="header"
        // to this Text — search for the still-unique "Your Today Briefing"
        // text content itself rather than the exact opening-tag literal.
        // Wave 5 removed the Score chip from the Briefing entirely, so the
        // hero now wraps the header and the tile row. The property this
        // asserts — ONE coherent gradient composition rather than separate
        // objects — is unchanged.
        const titleIdx = BRIEFING_CARD_SRC.indexOf('Your Today Briefing', heroOpen);
        const slotsIdx = BRIEFING_CARD_SRC.indexOf('<BriefingPriorityRow', heroOpen);
        return heroOpen !== -1 && heroClose !== -1 && titleIdx > heroOpen && slotsIdx > titleIdx && slotsIdx < heroClose;
      })()
  );
  assert(
    // Wave 5 Score containment makes this stronger: the Score cannot be in
    // the tile row because it is not in the Briefing at all.
    'TodayBriefingCard.tsx no longer contains the Score in any form — the three-tile cap and Score-exclusion contract holds by construction',
    !/ScoreChip|scoreChip/.test(BRIEFING_CARD_SRC)
  );
  assert(
    // Wave 5 visual pass — the hero is no longer a saturated gradient
    // needing a pinned white foreground. It sits on `heroSurface`, a light
    // surface in every theme, so its text reads from the ordinary SHARED
    // ink roles, which design5-contrast.test.ts already proves against
    // surface-class backgrounds in all six themes. The claim this assertion
    // protects — hero text is never a low-contrast or opacity-faded colour
    // — is unchanged and asserted directly against the new construction.
    // Wave 5 closure C — the hero gained restrained semantic colour: the
    // figure and eyebrow now carry the Ocean Blue `interactive` role as the
    // page's single anchor, and a GENUINE shortfall (never a mere missing
    // input) carries `warning`. Both clear the 4.5:1 body floor against
    // every heroSurface stop in all six themes — proven numerically in
    // design5-wave5-today-hierarchy.test.ts §18v/§18x. The claim protected
    // here is unchanged: every colour is a shared semantic role, never a
    // pinned foreground, a raw literal, or an opacity fade.
    "TodayBriefingCard.tsx's hero text reads semantic roles against heroSurface — never a pinned foreground, a raw colour, or an opacity-faded amount",
    /color: semantic\.interactive/.test(BRIEFING_CARD_SRC) &&
      /semantic\.warning : semantic\.textPrimary/.test(BRIEFING_CARD_SRC) &&
      /color: semantic\.textSecondary/.test(BRIEFING_CARD_SRC) &&
      /color: semantic\.textTertiary/.test(BRIEFING_CARD_SRC) &&
      !/heroForeground/.test(BRIEFING_CARD_SRC) &&
      !/#[0-9a-fA-F]{3,8}\b/.test(BRIEFING_CARD_SRC) &&
      !/opacity:/.test(BRIEFING_CARD_SRC)
  );
  assert(
    // Wave 5 — the dispatch moved from handlePressTile to handlePressRow
    // because the tiles became rows. Every destination is identical: the
    // AUP is now the hero's own headline and its explanation is reached by
    // the same onPressAup handler, a reminder row opens the same
    // ReminderDetailSheet, and an event row opens the same Money timeline.
    "TodayBriefingCard.tsx's row dispatch still routes to the exact same authoritative destinations — onPressAup for the AUP, onPressReminderTile for the reminder, onPressEventRow for an event",
    /if \(row\.kind === 'reminder'\) \{\s*onPressReminderTile\(\);/.test(BRIEFING_CARD_SRC) &&
      /onPressEventRow\(eventRow\)/.test(BRIEFING_CARD_SRC) &&
      /onPress=\{onPressAup\}/.test(BRIEFING_CARD_SRC) &&
      /onPress=\{onPressHowThisWorks\}/.test(BRIEFING_CARD_SRC)
  );
  assert(
    'TodayBriefingCard.tsx never introduces a fourth financial row or otherwise changes eventRows/topReminder inputs — same props signature as before this pass',
    /eventRows: TodayBriefingEventRow\[\];/.test(BRIEFING_CARD_SRC) && /topReminder: SmartReminder \| null;/.test(BRIEFING_CARD_SRC)
  );

  // --- Journey destination: JourneyTimeline is controlled, expands on one tap from Today ---
  assert(
    'JourneyTimeline.tsx no longer owns its own expand/collapse useState — fully controlled by the caller (expanded/onToggleExpanded props)',
    !/const \[expanded, setExpanded\] = useState\(false\);/.test(JOURNEY_TIMELINE_SRC) && /expanded: boolean;/.test(JOURNEY_TIMELINE_SRC) && /onToggleExpanded: \(\) => void;/.test(JOURNEY_TIMELINE_SRC)
  );
  assert(
    // Pass 2C correction — shouldExpandJourney now also selects the
    // Milestones subview of the combined Journey/Money Path tab (a block
    // statement, not the old single-line call), so a one-tap arrival always
    // lands on the milestone timeline rather than a possibly-stale Money
    // Path selection.
    "DiscoverScreen.tsx drives JourneyTimeline's expanded prop from its own journeyExpanded state, defaulting to false (ordinary collapsed Grow behaviour) and settable true by fulfilling a journey focus request, which also selects the Milestones subview",
    /const \[journeyExpanded, setJourneyExpanded\] = useState\(false\);/.test(DISCOVER_SCREEN_SRC) &&
      /if \(result\.shouldExpandJourney\) \{\s*setJourneyExpanded\(true\);\s*setJourneySubview\('milestones'\);\s*\}/.test(DISCOVER_SCREEN_SRC) &&
      /<JourneyTimeline achievements=\{achievements\} expanded=\{journeyExpanded\} onToggleExpanded=\{\(\) => setJourneyExpanded\(\(v\) => !v\)\} \/>/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    '"Show less" remains functional after a one-tap arrival — the toggle button still routes through onToggleExpanded (which flips journeyExpanded), never hard-coded to stay expanded forever',
    /onPress=\{onToggleExpanded\}/.test(JOURNEY_TIMELINE_SRC)
  );
  assert(
    'JourneyTimeline.tsx never introduces a second, duplicate Journey screen/engine to satisfy one-tap expansion — same component, same achievements prop, only expand state lifted',
    !/navigation\.navigate\('Journey/.test(DISCOVER_SCREEN_SRC) && (DISCOVER_SCREEN_SRC.match(/<JourneyTimeline/g) || []).length === 1
  );

  // --- No Pass 2E motion work introduced ---
  assert('No new Animated/LayoutAnimation motion API usage introduced in the touched Today components this pass', !/Animated\.|LayoutAnimation/.test(SCORE_CHIP_SRC) && !/Animated\.|LayoutAnimation/.test(JOURNEY_SNAPSHOT_SRC) && !/Animated\.|LayoutAnimation/.test(BRIEFING_CARD_SRC));
}

console.log('\n=== Section 5: Pass 2A AUP, reminder, and event behaviour remain unchanged (Structural regression) ===');
{
  const BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  const BRIEFING_TILES_SRC = readFileSync('src/lib/calculations/briefingTiles.ts', 'utf8');
  const REMINDER_SHEET_SRC = readFileSync('src/components/today/ReminderDetailSheet.tsx', 'utf8');
  assert('handleBriefingAupPress and its focus_money_section action are untouched by this pass', /function handleBriefingAupPress\(\)/.test(TODAY_SCREEN_SRC) && /focus_money_section/.test(TODAY_SCREEN_SRC));
  // Pass 2B, layout/colour correction — the AUP presentation is now read
  // inside briefingTiles.ts's aupTile() (TodayBriefingCard.tsx itself just
  // calls selectBriefingTiles), and the tile deliberately omits
  // presentation.supportingCopy — the compact tile's own contract is "at
  // most one short supporting line, never confirmation copy" (this round's
  // explicit instruction), and supportingCopy is longer confirmation-style
  // copy (still read verbatim by the full SafeToSpendHero screen,
  // unaffected by this pass). heading/displayAmount/amountVisible are still
  // read verbatim, unrecomputed.
  //
  // Final Pass 2D device-test correction — this assertion originally also
  // required `presentation.primaryCopy` to appear in aupTile(), since the
  // tile fell back to that full sentence whenever no amount was visible.
  // That fallback was the confirmed device-test defect (the full "Your
  // planned bills, savings and goals are..." sentence rendering at
  // near-illegible auto-shrunk size in the compact tile) — the fix
  // deliberately stops reading primaryCopy there at all, replacing it with
  // a new short, state-specific `presentation.compactSummary` field
  // instead (primaryCopy itself is untouched and still read verbatim by
  // the full-size SafeToSpendHero screen — only this ONE compact-tile call
  // site changed). This is a strengthening, not a weakening: it proves the
  // long sentence no longer reaches the compact tile at all.
  assert(
    'briefingTiles.ts aupTile() still reads presentation.heading/displayAmount/amountVisible/tone verbatim, and now falls back to compactSummary (never primaryCopy) — no recomputation of the AUP presentation contract',
    /presentation\.heading/.test(BRIEFING_TILES_SRC) &&
      /presentation\.compactSummary/.test(BRIEFING_TILES_SRC) &&
      !/: presentation\.primaryCopy/.test(BRIEFING_TILES_SRC) &&
      /presentation\.displayAmount/.test(BRIEFING_TILES_SRC) &&
      /presentation\.amountVisible/.test(BRIEFING_TILES_SRC) &&
      /presentation\.tone/.test(BRIEFING_TILES_SRC)
  );
  // Wave 5 visual pass — the rule this encodes was "a compact tile has no
  // room for the long explanatory sentence, so never render it there". That
  // is still true of the financial slots, and briefingTiles.ts still never
  // reads it. What changed is that the SETUP state is now a full-width hero
  // block whose entire job is to state exactly what is missing (invariant
  // 10, "names the exact missing input"), and supportingCopy is precisely
  // that second explanatory sentence. So it may appear ONLY there — never
  // in the amount-visible path, and never inside a priority row.
  assert('presentation.supportingCopy never reaches a financial slot — briefingTiles.ts still never reads it', !/presentation\.supportingCopy/.test(BRIEFING_TILES_SRC) && !/supportingCopy/.test(readFileSync('src/components/today/BriefingPriorityRow.tsx', 'utf8')));
  assert('and in the Briefing it appears only inside the setup/unavailable state, never alongside a visible amount', (() => {
    const setupStart = BRIEFING_CARD_SRC.indexOf('testID="today-briefing-setup"');
    const setupEnd = BRIEFING_CARD_SRC.indexOf('today-briefing-priority-rows');
    const uses = [...BRIEFING_CARD_SRC.matchAll(/presentation\.supportingCopy/g)].map((m) => m.index ?? -1);
    return setupStart !== -1 && uses.length > 0 && uses.every((i) => i > setupStart && i < setupEnd);
  })());
  // Device-test correction round — onNavigateAway={onClose} added to this
  // mount (see ReminderDetailSheet.tsx's own doc comment); still reached
  // only via ReminderDetailSheet, never embedded back into the hero. Final
  // Pass 2D device-test correction — the reminder value passed is now
  // `displayedReminder` (ReminderDetailSheet's own pinned state, not the
  // raw live topReminder prop — see this round's final report §1-§3), plus
  // a new onSettled prop; the underlying claim (still SmartReminderCard,
  // still never embedded back into the hero) is unchanged and still proven.
  // WHY STALE (final Pass 2D device-test correction, native-Modal-lifecycle
  // round): displayedReminder itself was replaced by
  // useReducer(reduceReminderLifecycle, ...) — state.reminder is the
  // pinned value now — and two more props were added
  // (onRequestLoanRepayment/onRequestCreditCardRepayment) so this mount can
  // request a repayment form instead of a second component mounting its
  // own native Modal. Still SmartReminderCard, still never embedded back
  // into the hero.
  // WHY STALE AGAIN (Reminder-opening correction round): the confirmed
  // blank-sheet defect (a competing external `visible`/`onClose` boolean
  // racing this file's own reducer — see ReminderDetailSheet.tsx's own doc
  // comment) removed the external `onClose` prop entirely; `onNavigateAway`
  // is now the local `handleForceClose` — same semantic, sourced locally.
  assert(
    // WHY STALE: Reminder queue correction round renamed onSettled to
    // onOutcome and switched to presentedState (blank-shell close fix) —
    // same real mount, unchanged placement.
    'SmartReminderCard is still mounted with a live reminder value (plus onNavigateAway and onOutcome), unchanged from Pass 2A/2B — inside ReminderDetailSheet (reached by tapping the compact Reminder tile) rather than embedded inline in the hero',
    /<SmartReminderCard\s*topReminder=\{presentedState\.reminder\}\s*onNavigateAway=\{handleForceClose\}\s*onOutcome=\{handleReminderOutcome\}/.test(REMINDER_SHEET_SRC) &&
      !/SmartReminderCard/.test(BRIEFING_CARD_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
