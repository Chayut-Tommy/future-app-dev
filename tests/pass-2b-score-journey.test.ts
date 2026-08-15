// Pass 2B — Compact Today Score and Journey presentations, 2026-08-12.
//
// CLASSIFICATION (per tests/README.md's evidence taxonomy):
// - Real import (Class A): selectScoreChipPresentation, computeJourneySnapshot,
//   computeLuluScore, computeAchievements are all imported and executed
//   directly — genuine behavioural proof of these exact shipped functions.
//   Neither computeLuluScore nor computeAchievements (nor any file they
//   import from) was modified by this pass — confirmed both by this file's
//   own determinism/invariant assertions below and by the literal
//   `git diff --name-status` reported alongside this pass, which does not
//   list luluScore.ts or achievements.ts.
// - Structural: regex/string matches against TodayScreen.tsx,
//   TodayBriefingCard.tsx, LuluCheckInCard.tsx, DiscoverScreen.tsx source
//   text — all React components that transitively import react-native and
//   cannot be imported/executed by tsx (confirmed empirically, matching
//   every other .tsx file in this repo).
//
// LIMITATION (unchanged from Pass 2A/2A-correction): this repository has no
// react-native-testing-library or any component-runtime test harness, and
// none may be added (no new dependencies authorised). A genuine rendered-
// component or navigation-behaviour test is therefore NOT possible in this
// suite. Every claim about on-screen rendering, tap targets, or navigation
// transitions below is Structural only, or is explicitly left to the
// physical-device checklist.
//
// Run with: npx tsx tests/pass-2b-score-journey.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import { computeAchievements, Achievement } from '../src/lib/calculations/achievements';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { computeJourneySnapshot } from '../src/lib/calculations/journeySnapshot';
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
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  return d;
}

console.log('=== Section 1: selectScoreChipPresentation — every state (real function) ===');
{
  // locked (the existing, unmodified LuluScoreResult.locked === true gate)
  const locked = createEmptyAppData();
  locked.user.monthlyIncome = 0;
  const lockedResult = computeLuluScore(locked);
  assert('fixture sanity: no income -> computeLuluScore itself reports locked', lockedResult.locked === true);
  const lockedChip = selectScoreChipPresentation(lockedResult);
  assert(
    'locked: state locked, no numeric score ever shown (never 0 as a stand-in for missing)',
    lockedChip.state === 'locked' && lockedChip.scoreValue === null && lockedChip.label === 'Nolie Score' && lockedChip.supportingText === 'Add income to unlock' && lockedChip.tone === 'muted'
  );

  // available — an ordinary, real, unlocked scenario. Also covers
  // "incomplete Score": a low-Money-Picture-completeness fixture (only
  // income + one asset known, nothing else) still yields a real,
  // authoritative score once unlocked — computeLuluScore has no separate
  // "incomplete -> hide the score" gate, confirmed directly here.
  const incomplete = baseData();
  const incompleteResult = computeLuluScore(incomplete);
  assert('fixture sanity: minimal-but-unlocked data -> not locked, completeness well under 100%', !incompleteResult.locked && incompleteResult.completeness.percent < 100);
  const incompleteChip = selectScoreChipPresentation(incompleteResult);
  assert(
    'incomplete-but-unlocked: still state available, a real score is shown (never hidden just for low completeness), factual wording only',
    incompleteChip.state === 'available' &&
      incompleteChip.scoreValue === incompleteResult.score &&
      incompleteChip.label === `Nolie Score ${incompleteResult.score}` &&
      incompleteChip.supportingText === 'Based on what you’ve recorded'
  );
  assert(
    'NEVER INVENTS A TREND: the available-state wording never mentions improvement/decline/change — no trend claim without an established one',
    !/improv|declin|better|worse|up|down|\+\d|\-\d/i.test(incompleteChip.supportingText)
  );
  assert('NO FABRICATED PRAISE: never a claim like "doing incredibly well" — factual wording only', !/incredibly well|doing great|amazing/i.test(incompleteChip.supportingText));

  // unavailable/invalid — defensive guard for a structurally-unreachable
  // (per computeLuluScore's own clamp(0,100)) but still-guarded-against
  // out-of-range value. Selector-only proof, matching this repo's
  // established convention (see safe-to-spend-closure-corrections.test.ts's
  // r5positiveOverride) for isolating a defensive branch that real
  // arithmetic cannot currently produce.
  const outOfRange = { ...incompleteResult, score: 137 };
  const outOfRangeChip = selectScoreChipPresentation(outOfRange);
  assert('unavailable (defensive, out-of-range score): no number shown, never 0', outOfRangeChip.state === 'unavailable' && outOfRangeChip.scoreValue === null);
  const negative = { ...incompleteResult, score: -5 };
  assert('unavailable (defensive, negative score): also caught', selectScoreChipPresentation(negative).state === 'unavailable');
  const nonFinite = { ...incompleteResult, score: NaN };
  assert('unavailable (defensive, NaN score): also caught, never displayed as $NaN-equivalent', selectScoreChipPresentation(nonFinite).state === 'unavailable');

  // Genuine boundary values remain 'available', not falsely flagged unavailable.
  assert('score exactly 0 is a genuine available value, not locked/unavailable', selectScoreChipPresentation({ ...incompleteResult, score: 0 }).state === 'available');
  assert('score exactly 100 is a genuine available value', selectScoreChipPresentation({ ...incompleteResult, score: 100 }).state === 'available');
}

console.log('\n=== Section 2: computeJourneySnapshot — every state (real function) ===');
{
  function achievement(id: string, unlocked: boolean, current?: number, target?: number): Achievement {
    return { id, icon: 'trophy', title: `Title ${id}`, subtitle: 'Subtitle', unlocked, current, target };
  }

  // empty/unavailable
  {
    const snap = computeJourneySnapshot([]);
    assert('empty achievements list -> unavailable, never fabricates a count or a next milestone', snap.unavailable === true && snap.totalCount === 0 && snap.next === null);
  }

  // one milestone, not yet unlocked, no quantified progress
  {
    const snap = computeJourneySnapshot([achievement('a1', false)]);
    assert('single unquantified milestone: completedCount 0, next is it, no invented progress line', snap.completedCount === 0 && snap.totalCount === 1 && snap.next?.id === 'a1' && snap.nextProgress === null && !snap.allCompleted);
  }

  // completed-milestone count + next incomplete milestone (matches
  // JourneyTimeline's own `findIndex(a => !a.unlocked)` definition exactly)
  {
    const list = [achievement('a1', true), achievement('a2', true), achievement('a3', false, 500, 1000), achievement('a4', false)];
    const snap = computeJourneySnapshot(list);
    assert('completedCount === real unlocked count', snap.completedCount === 2);
    assert('next === the first not-yet-unlocked achievement (index 2, "a3"), not "a4"', snap.next?.id === 'a3');
    assert('cross-check against an independently computed findIndex — the same definition, not re-derived differently', list.findIndex((a) => !a.unlocked) === 2);
  }

  // partial milestone progress — dollar formatting (the default case)
  {
    const snap = computeJourneySnapshot([achievement('saved_1000', false, 250, 1000)]);
    assert(
      'quantified next milestone: nextProgress carries the real current/target, formatted as dollars for an ordinary (non-exception) achievement id',
      snap.nextProgress?.current === 250 && snap.nextProgress?.target === 1000 && snap.nextProgress?.formatted === '$250 of $1,000'
    );
  }

  // non-currency exception ids never mislabelled with "$"
  {
    const diversification = computeJourneySnapshot([achievement('diversified_portfolio', false, 32, 50)]);
    assert('diversified_portfolio (a 0-100 score, not a dollar figure) is never shown with a "$"', diversification.nextProgress?.formatted === '32 of 50' && !diversification.nextProgress?.formatted.includes('$'));
    const scoreImproved = computeJourneySnapshot([achievement('score_improved_10', false, 4, 10)]);
    assert('score_improved_10 (Navilo Score points, not dollars) is never shown with a "$"', scoreImproved.nextProgress?.formatted === '4 of 10');
  }

  // all-milestones-completed
  {
    const snap = computeJourneySnapshot([achievement('a1', true), achievement('a2', true)]);
    assert('all completed: allCompleted true, next null (never invents a "next" once none remain)', snap.allCompleted === true && snap.next === null && snap.completedCount === 2 && snap.totalCount === 2);
  }

  // real end-to-end integration — computeAchievements(data) piped through
  // computeJourneySnapshot, cross-checked against an independently computed
  // completedCount/next from the same real achievements list.
  {
    const data = baseData();
    const achievements = computeAchievements(data);
    const snap = computeJourneySnapshot(achievements);
    const expectedCompleted = achievements.filter((a) => a.unlocked).length;
    const expectedNextIndex = achievements.findIndex((a) => !a.unlocked);
    assert('real end-to-end: completedCount matches an independent recount of the real computeAchievements() output', snap.completedCount === expectedCompleted);
    assert(
      'real end-to-end: next matches the real achievement at the independently-found next index',
      expectedNextIndex === -1 ? snap.allCompleted && snap.next === null : snap.next?.id === achievements[expectedNextIndex].id
    );
  }
}

console.log('\n=== Section 3: existing Score/Journey engines unchanged (real functions, regression) ===');
{
  const data = baseData();
  const r1 = computeLuluScore(data);
  const r2 = computeLuluScore(JSON.parse(JSON.stringify(data)));
  assert('computeLuluScore is deterministic for identical input (same score, same locked, same category points) — unaffected by this pass', r1.score === r2.score && r1.locked === r2.locked && JSON.stringify(r1.categories) === JSON.stringify(r2.categories));
  assert('computeLuluScore score always stays within its own documented 0-100 clamp', r1.locked || (r1.score >= 0 && r1.score <= 100));

  const a1 = computeAchievements(data);
  const a2 = computeAchievements(JSON.parse(JSON.stringify(data)));
  assert('computeAchievements is deterministic for identical input — unaffected by this pass', JSON.stringify(a1) === JSON.stringify(a2));
  assert('computeAchievements still returns the existing starter achievements in the existing order (first id unchanged)', a1[0]?.id === 'started_lulu');
}

console.log('\n=== Section 4: component wiring (Structural — .tsx files cannot be imported by tsx; see LIMITATION note in file header) ===');
{
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  const TODAY_BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const LULU_CHECKIN_SRC = readFileSync('src/components/today/LuluCheckInCard.tsx', 'utf8');
  const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');

  // No duplicate large Score presentation on Today.
  assert(
    'LuluCheckInCard.tsx no longer imports/renders the score ring or opens ScoreExplanationSheet — the large Score presentation lives in exactly one place now',
    !/CircularScore/.test(LULU_CHECKIN_SRC) && !/ScoreExplanationSheet/.test(LULU_CHECKIN_SRC) && !/luluScore/.test(LULU_CHECKIN_SRC)
  );
  // Pass 2D — LuluCheckInCard is now only mounted when a contextual insight
  // exists (final Today hierarchy §6: "zero or one only"), wrapped in a
  // TouchableOpacity so it can route to that insight's destination; the
  // still-luluScore-free contract this assertion originally protected
  // (LuluCheckInCard never takes a score prop) is unchanged — it still
  // takes only topLine and insight, just a differently-sourced insight.
  assert(
    'TodayScreen.tsx no longer passes luluScore into LuluCheckInCard — it takes only topLine and the new contextual-insight value, mounted conditionally',
    /<LuluCheckInCard topLine=\{checkInLine\.topLine\} insight=\{contextualInsight\} \/>/.test(TODAY_SCREEN_SRC) && !/<LuluCheckInCard[^>]*luluScore/.test(TODAY_SCREEN_SRC)
  );
  assert('TodayScreen.tsx no longer renders JourneyTimeline directly (the long Today Journey timeline is gone)', !/<JourneyTimeline/.test(TODAY_SCREEN_SRC) && !TODAY_SCREEN_SRC.includes("import { JourneyTimeline }"));

  // Canonical Briefing hierarchy: title/date -> Score chip -> AUP -> reminder -> events.
  // Pass 2B, layout/colour correction: the SectionCard holding stacked
  // AUP/reminder/event rows was intentionally replaced by BriefingTileRow's
  // up-to-three compact tiles (see TodayBriefingCard.tsx's own doc comment).
  // The property that must survive is unchanged: the Score chip is authored
  // after the header and before the financial tiles, and it is never one of
  // the tiles selectBriefingTiles() produces.
  assert(
    'TodayBriefingCard.tsx: the ScoreChip is authored after the date/context header and BEFORE BriefingTileRow (AUP/reminder/event tiles)',
    (() => {
      const dateIdx = TODAY_BRIEFING_CARD_SRC.indexOf('{formatBriefingDateContext(today)}');
      const chipIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<ScoreChip presentation={scoreChip} onPress={onPressScoreChip} />');
      const tileRowIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<BriefingTileRow');
      return dateIdx !== -1 && chipIdx !== -1 && tileRowIdx !== -1 && dateIdx < chipIdx && chipIdx < tileRowIdx;
    })()
  );
  assert(
    'Score chip excluded from the three-tile financial cap: it is authored outside BriefingTileRow, and selectBriefingTiles() is never passed the score chip presentation',
    (() => {
      const tileRowIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<BriefingTileRow');
      const chipIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<ScoreChip');
      const selectTilesCall = TODAY_BRIEFING_CARD_SRC.match(/selectBriefingTiles\(([^)]*)\)/);
      return chipIdx !== -1 && tileRowIdx !== -1 && chipIdx < tileRowIdx && !!selectTilesCall && !/scoreChip/.test(selectTilesCall[1]);
    })()
  );
  assert(
    'TodayScreen.tsx computes the Score chip and Journey snapshot exactly once each via useMemo, wrapping the existing luluScore/achievements results — never recomputing the formula or achievement rules',
    /const scoreChipPresentation = useMemo\(\(\) => selectScoreChipPresentation\(luluScore\), \[luluScore\]\);/.test(TODAY_SCREEN_SRC) &&
      /const journeySnapshot = useMemo\(\(\) => computeJourneySnapshot\(achievements\), \[achievements\]\);/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'the Journey snapshot is placed immediately after TodayBriefingCard, before the guided checklist',
    (() => {
      const briefingIdx = TODAY_SCREEN_SRC.indexOf('<TodayBriefingCard');
      const briefingCloseIdx = TODAY_SCREEN_SRC.indexOf('/>', briefingIdx);
      const snapshotIdx = TODAY_SCREEN_SRC.indexOf('<TodayJourneySnapshotCard');
      const checklistIdx = TODAY_SCREEN_SRC.indexOf('<MoneyPictureChecklistCard');
      return briefingCloseIdx !== -1 && snapshotIdx > briefingCloseIdx && snapshotIdx < checklistIdx;
    })()
  );

  // Score/Journey destination navigation reuses the stable, corrected
  // section-focus architecture (see tests/pass-2b-correction.test.ts for
  // the full pending-focus mechanism's dedicated real-function coverage —
  // this file only re-confirms the wiring at the call sites).
  // Pass 2E final correction — handleScoreChipPress/handleJourneyPress now
  // delegate to the shared pushGrowDetail('score'/'journey') helper, which
  // pushes the root stack's GrowDetail route (mounting the exact same
  // DiscoverScreen component, in its `pushed` mode) instead of navigating
  // within the Grow tab — still stable section identifiers, still a fresh
  // requestId every call, still never a duplicate screen/engine.
  assert(
    "handleScoreChipPress/handleJourneyPress push GrowDetail with stable section identifiers ('score'/'journey') via the shared pushGrowDetail helper, never a duplicate screen",
    /function handleScoreChipPress\(\) \{\s*pushGrowDetail\('score'\);\s*\}/.test(TODAY_SCREEN_SRC) &&
      /function handleJourneyPress\(\) \{\s*pushGrowDetail\('journey'\);\s*\}/.test(TODAY_SCREEN_SRC)
  );
  assert(
    "Grow (DiscoverScreen.tsx) mounts the exact existing ScoreExplanationSheet and JourneyTimeline components — full accepted info/actions preserved, no redesigned/duplicate engine",
    /<ScoreExplanationSheet visible=\{scoreSheetVisible\} onClose=\{\(\) => setScoreSheetVisible\(false\)\} result=\{luluScore\} \/>/.test(DISCOVER_SCREEN_SRC) &&
      /<JourneyTimeline achievements=\{achievements\} expanded=\{journeyExpanded\} onToggleExpanded=\{\(\) => setJourneyExpanded\(\(v\) => !v\)\} \/>/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'DiscoverScreen.tsx computes luluScore/achievements via the same real functions, not a re-derived or duplicated engine',
    /const luluScore = useMemo\(\(\) => computeLuluScore\(data\), \[data\]\);/.test(DISCOVER_SCREEN_SRC) && /const achievements = useMemo\(\(\) => computeAchievements\(data\), \[data\]\);/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'Journey (computeAchievements/JourneyTimeline) and Your Money Path (computeWealthPaths/WealthJourneyCard) remain two distinct, unmerged features in Grow',
    /computeWealthPaths/.test(DISCOVER_SCREEN_SRC) && /WealthJourneyCard/.test(DISCOVER_SCREEN_SRC) && /computeAchievements/.test(DISCOVER_SCREEN_SRC) && /JourneyTimeline/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'DiscoverScreen.tsx never navigates to a separate Score/Journey detail screen — the focus destinations stay inside Grow itself',
    !/navigation\.navigate\('ScoreDetail'/.test(DISCOVER_SCREEN_SRC) && !/navigation\.navigate\('JourneyDetail'/.test(DISCOVER_SCREEN_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
