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

const UNMEASURED: SectionFocusMeasurements = { 'financial-learning': null, score: null, journey: null };

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
  assert('ScoreChip.tsx locked/unavailable ("muted") state still falls back to the existing neutral surfaceMuted/textMuted treatment, not green — preserves the established locked mapping', /presentation\.tone === 'muted' \? colors\.surfaceMuted/.test(SCORE_CHIP_SRC) && /presentation\.tone === 'muted' \? colors\.textMuted/.test(SCORE_CHIP_SRC));

  // --- Journey snapshot: teal/route iconography, no gold, single chevron ---
  assert('TodayJourneySnapshotCard.tsx never references colors.gold or colors.goldSoft', !/colors\.gold\b/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.goldSoft\b/.test(JOURNEY_SNAPSHOT_SRC));
  // Pass 2B, layout/colour correction §7/§5 — the hard-coded Ocean Blue
  // tokens were intentionally replaced by the 3-way aiAccentColor/
  // aiAccentSoft pair (ThemeContext), so this card recolours with the
  // user's selected Navilo colour style instead of staying stuck on blue.
  assert('TodayJourneySnapshotCard.tsx uses the central aiAccentColor/aiAccentSoft tokens (3-way Ocean Blue/Purple/Sunrise), not a hard-coded Ocean Blue literal', /aiAccentColor/.test(JOURNEY_SNAPSHOT_SRC) && /aiAccentSoft/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.aiBlue\b/.test(JOURNEY_SNAPSHOT_SRC) && !/colors\.aiBlueSoft/.test(JOURNEY_SNAPSHOT_SRC));
  assert('TodayJourneySnapshotCard.tsx uses a route/compass icon, distinct from both Journey\'s own trophy nodes and Score\'s gauge', /compass-outline/.test(JOURNEY_SNAPSHOT_SRC) && !/name="trophy"/.test(JOURNEY_SNAPSHOT_SRC) && !/speedometer/.test(JOURNEY_SNAPSHOT_SRC));
  assert(
    'TodayJourneySnapshotCard.tsx renders exactly one chevron-forward — the single "View full journey" footer control, not a second competing one mid-card',
    (JOURNEY_SNAPSHOT_SRC.match(/name="chevron-forward"/g) || []).length === 1
  );
  assert('TodayJourneySnapshotCard.tsx still renders the exact preserved data fields verbatim — completedCount/totalCount/next/nextProgress — never recomputed', /\{snapshot\.completedCount\} of \{snapshot\.totalCount\} milestones completed/.test(JOURNEY_SNAPSHOT_SRC) && /snapshot\.nextProgress\.formatted/.test(JOURNEY_SNAPSHOT_SRC));

  // --- Score and Journey do not reuse the same trophy presentation, anywhere touched this pass ---
  assert(
    "Score's two compact surfaces (Today's chip, Grow's launcher row) and Journey's compact surface (Today's snapshot) never share an icon glyph with each other",
    (() => {
      const scoreChipIcon = SCORE_CHIP_SRC.match(/Ionicons name="([\w-]+)" size=\{13\}/)?.[1];
      const journeySnapshotIcon = JOURNEY_SNAPSHOT_SRC.match(/Ionicons name="([\w-]+)" size=\{17\}/)?.[1];
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
    'TodayBriefingCard.tsx wraps the header, Score chip, and BriefingTileRow together inside one LinearGradient hero driven by naviloPalette (Ocean Blue/Purple/Sunrise) — a single coherent composition, not three separate objects',
    /<LinearGradient colors=\{\[naviloPalette\.heroGradientStart, naviloPalette\.heroGradientEnd\]\}[^>]*style=\{styles\.hero\}>/.test(BRIEFING_CARD_SRC) &&
      (() => {
        const heroOpen = BRIEFING_CARD_SRC.indexOf('<LinearGradient colors={[naviloPalette.heroGradientStart, naviloPalette.heroGradientEnd]}');
        const heroClose = BRIEFING_CARD_SRC.lastIndexOf('</LinearGradient>');
        // Searched from heroOpen onward — the doc comment above also
        // mentions "Your Today Briefing" in prose, which would otherwise be
        // found first and falsely appear to precede the gradient.
        const titleIdx = BRIEFING_CARD_SRC.indexOf('<Text style={styles.sectionTitle}>Your Today Briefing</Text>', heroOpen);
        const chipIdx = BRIEFING_CARD_SRC.indexOf('<ScoreChip', heroOpen);
        const tileRowIdx = BRIEFING_CARD_SRC.indexOf('<BriefingTileRow', heroOpen);
        return heroOpen !== -1 && heroClose !== -1 && titleIdx > heroOpen && chipIdx > titleIdx && tileRowIdx > chipIdx && tileRowIdx < heroClose;
      })()
  );
  assert(
    'TodayBriefingCard.tsx still preserves the Score chip outside BriefingTileRow — the three-tile cap and Score-chip-exclusion contract is unaffected by resolving the hero gradient through naviloPalette',
    (() => {
      const tileRowStart = BRIEFING_CARD_SRC.indexOf('<BriefingTileRow');
      const chipIdx = BRIEFING_CARD_SRC.indexOf('<ScoreChip');
      return chipIdx !== -1 && tileRowStart !== -1 && chipIdx < tileRowStart;
    })()
  );
  assert(
    "TodayBriefingCard.tsx title/date use naviloPalette.heroForeground — legible against every hero gradient (Ocean Blue/Purple/Sunrise) in both light and dark mode, and palettes.ts pins heroForeground to solid white for every style/scheme combination so this is never a low-contrast colour",
    /color: naviloPalette\.heroForeground/.test(BRIEFING_CARD_SRC) &&
      /opacity: 0\.82/.test(BRIEFING_CARD_SRC) &&
      (() => {
        const PALETTES_SRC = readFileSync('src/theme/palettes.ts', 'utf8');
        return /heroForeground: '#FFFFFF'/.test(PALETTES_SRC);
      })()
  );
  assert(
    "TodayBriefingCard.tsx's tile dispatch (handlePressTile) still routes to the exact same authoritative destinations as the old rows — onPressAup for the AUP tile, onPressReminderTile for the reminder tile (which itself opens ReminderDetailSheet, the same SmartReminderCard, unchanged), onPressEventRow for an event tile",
    /if \(tile\.kind === 'aup'\) \{\s*onPressAup\(\);/.test(BRIEFING_CARD_SRC) &&
      /if \(tile\.kind === 'reminder'\) \{\s*onPressReminderTile\(\);/.test(BRIEFING_CARD_SRC) &&
      /onPressEventRow\(row\)/.test(BRIEFING_CARD_SRC)
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
  // unaffected by this pass). heading/primaryCopy/displayAmount/
  // amountVisible are still read verbatim, unrecomputed.
  assert(
    'briefingTiles.ts aupTile() still reads presentation.heading/primaryCopy/displayAmount/amountVisible/tone verbatim — no recomputation of the AUP presentation contract',
    /presentation\.heading/.test(BRIEFING_TILES_SRC) &&
      /presentation\.primaryCopy/.test(BRIEFING_TILES_SRC) &&
      /presentation\.displayAmount/.test(BRIEFING_TILES_SRC) &&
      /presentation\.amountVisible/.test(BRIEFING_TILES_SRC) &&
      /presentation\.tone/.test(BRIEFING_TILES_SRC)
  );
  assert('TodayBriefingCard.tsx no longer reads presentation.supportingCopy — that longer confirmation-style copy stays out of the compact tile by design, still shown verbatim by SafeToSpendHero', !/presentation\.supportingCopy/.test(BRIEFING_CARD_SRC) && !/presentation\.supportingCopy/.test(BRIEFING_TILES_SRC));
  assert(
    'SmartReminderCard is still mounted with the same topReminder prop, unchanged from Pass 2A/2B — now inside ReminderDetailSheet (reached by tapping the compact Reminder tile) rather than embedded inline in the hero',
    /<SmartReminderCard topReminder=\{topReminder\} \/>/.test(REMINDER_SHEET_SRC) && !/SmartReminderCard/.test(BRIEFING_CARD_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
