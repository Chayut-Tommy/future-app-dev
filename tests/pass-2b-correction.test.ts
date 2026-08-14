// Pass 2B correction pass — section-focus pending-request architecture,
// one-tap Score destination, and Score/Journey ownership/celebration
// verification. 2026-08-12.
//
// CLASSIFICATION (per tests/README.md's evidence taxonomy):
// - Real import (Class A) — Section 1: sectionFocus.ts (parseSectionFocusRequest,
//   computeSectionFocusFulfillment) is imported and executed directly. This
//   is the actual pure decision core DiscoverScreen.tsx calls — not a
//   mirror or re-implementation — so every pending/fulfil/supersede claim
//   below is genuine behavioural proof, not a structural guess about what
//   the component "probably" does.
// - Real import (Class A) — Section 2: computeAchievements, computeLuluScore,
//   selectScoreChipPresentation, computeJourneySnapshot, all unmodified by
//   this correction pass (see the determinism assertions inherited from
//   tests/pass-2b-score-journey.test.ts, still passing after this pass).
// - Structural — Section 3 (component wiring): DiscoverScreen.tsx,
//   TodayScreen.tsx, JourneyTimeline.tsx, ScoreExplanationSheet.tsx source
//   text. These are .tsx files that transitively import react-native and
//   cannot be imported/executed by tsx in this harness (see
//   tests/README.md). Genuine rendered-component or on-device navigation
//   proof (actual scrolling, actual sheet presentation, actual Back-button
//   behaviour) is NOT available here and is left to the physical-device
//   checklist — every claim in Section 3 is a source-text match only.
//
// Run with: npx tsx tests/pass-2b-correction.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeLuluScore } from '../src/lib/calculations/luluScore';
import { computeAchievements, Achievement } from '../src/lib/calculations/achievements';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { computeJourneySnapshot } from '../src/lib/calculations/journeySnapshot';
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
  d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
  return d;
}

const UNMEASURED: SectionFocusMeasurements = { 'financial-learning': null, score: null, journey: null, goals: null, safety_net: null, saving: null, learning: null };

console.log('=== Section 1: sectionFocus.ts — the real pending-focus decision core (real functions) ===');
{
  // --- parseSectionFocusRequest: request identity/validity ---
  assert('parseSectionFocusRequest rejects an unrecognised target', parseSectionFocusRequest('not-a-real-target', 1) === null);
  assert('parseSectionFocusRequest rejects a target with no requestId (undefined) — not a genuine request', parseSectionFocusRequest('score', undefined) === null);
  assert('parseSectionFocusRequest rejects a non-numeric requestId', parseSectionFocusRequest('score', 'abc') === null);
  const parsed = parseSectionFocusRequest('score', 7);
  assert('parseSectionFocusRequest accepts a valid {target, requestId} pair', parsed?.target === 'score' && parsed?.requestId === 7);

  // --- 1a. focus request received before layout remains pending (never fulfilled, never discarded) ---
  {
    const pending = parseSectionFocusRequest('score', 1)!;
    const result = computeSectionFocusFulfillment(pending, UNMEASURED, true);
    assert('1a. a request for an unmeasured target is reported not-fulfilled (stays pending) — never fulfilled by guesswork', result.fulfilled === false && result.scrollY === null);
  }

  // --- 1b. pending request is fulfilled once the target reports layout ---
  {
    const pending = parseSectionFocusRequest('score', 1)!;
    const stillWaiting = computeSectionFocusFulfillment(pending, UNMEASURED, true);
    assert('1b-i. before layout: not fulfilled', stillWaiting.fulfilled === false);
    const measured: SectionFocusMeasurements = { ...UNMEASURED, score: 842 };
    const fulfilled = computeSectionFocusFulfillment(pending, measured, true);
    assert('1b-ii. the SAME pending request, now measured: fulfilled at exactly the measured y — no arbitrary retry cap involved, no discard', fulfilled.fulfilled === true && fulfilled.scrollY === 842);
  }

  // --- 1c. an unbounded number of not-yet-measured attempts never flips to "give up" ---
  {
    const pending = parseSectionFocusRequest('journey', 1)!;
    let stillPending = true;
    for (let i = 0; i < 500; i++) {
      const r = computeSectionFocusFulfillment(pending, UNMEASURED, true);
      if (r.fulfilled) stillPending = false;
    }
    assert('1c. 500 repeated attempts against an unmeasured target never fulfil and never throw — no hidden frame-count timeout inside the decision core itself', stillPending === true);
  }

  // --- 1d. same section + different request IDs is handled repeatedly ---
  {
    const measured: SectionFocusMeasurements = { ...UNMEASURED, journey: 300 };
    const first = parseSectionFocusRequest('journey', 1)!;
    const firstResult = computeSectionFocusFulfillment(first, measured, true);
    assert('1d-i. first tap on Journey: fulfilled', firstResult.fulfilled === true && firstResult.scrollY === 300);
    // Caller clears pending to null on fulfilment (mirrored here), then a
    // second, later tap on the SAME section arrives with a fresh id.
    const second = parseSectionFocusRequest('journey', 2)!;
    assert('1d-ii. the second tap is a genuinely distinct request object (different requestId), not silently deduped against the first', second.requestId !== first.requestId && second.target === first.target);
    const secondResult = computeSectionFocusFulfillment(second, measured, true);
    assert('1d-iii. the second, later tap on the same section is fulfilled again — repeated intentional requests are not swallowed', secondResult.fulfilled === true && secondResult.scrollY === 300);
  }

  // --- 1e. rapid/overlapping requests: a newer request supersedes an older
  // unfulfilled one, and the older one's target is never used once superseded ---
  {
    const scoreRequest = parseSectionFocusRequest('score', 1)!;
    // Score arrives first but isn't measurable yet.
    const scoreAttempt = computeSectionFocusFulfillment(scoreRequest, UNMEASURED, true);
    assert('1e-i. Score tap arrives, not yet measurable: pending', scoreAttempt.fulfilled === false);
    // Before Score measures, the user taps Journey — the caller overwrites
    // its single pending slot with this newer request (DiscoverScreen.tsx
    // never queues multiple pending requests).
    const journeyRequest = parseSectionFocusRequest('journey', 2)!;
    // Both sections happen to measure in the same layout pass.
    const bothMeasured: SectionFocusMeasurements = { 'financial-learning': null, score: 100, journey: 400, goals: null, safety_net: null, saving: null, learning: null };
    // The superseded Score request must NEVER be the one evaluated again —
    // simulating the caller's real behaviour: only the CURRENT pending ref
    // (now journeyRequest) is ever passed to computeSectionFocusFulfillment.
    const journeyFulfilled = computeSectionFocusFulfillment(journeyRequest, bothMeasured, true);
    assert('1e-ii. once superseded, only the newer (Journey) request is evaluated — never a stale scroll to the earlier, superseded Score target', journeyFulfilled.fulfilled === true && journeyFulfilled.scrollY === 400);
    // And if Score's own onLayout event fires afterward, the caller's
    // pending ref no longer matches 'score' — computeSectionFocusFulfillment
    // itself only ever answers about whatever request it's given, so a
    // correctly-implemented caller (which DiscoverScreen.tsx is, per the
    // Section 3 structural check below: it always reads
    // pendingSectionFocusRef.current fresh) can never re-fulfil Score here.
    assert(
      '1e-iii. the decision core has no memory of the superseded Score request once the caller stops passing it — nothing to accidentally re-fulfil',
      computeSectionFocusFulfillment(journeyRequest, bothMeasured, true).scrollY === 400
    );
  }

  // --- 1f. null pending (no request in flight) is always safely not-fulfilled ---
  assert('1f. no pending request at all: never fulfilled, never throws', computeSectionFocusFulfillment(null, { 'financial-learning': 10, score: 20, journey: 30, goals: 40, safety_net: 50, saving: 60, learning: 70 }, true).fulfilled === false);

  // --- 1g. financial-learning target is unaffected by the score-authoritative flag ---
  {
    const req = parseSectionFocusRequest('financial-learning', 1)!;
    const measured: SectionFocusMeasurements = { ...UNMEASURED, 'financial-learning': 555 };
    const result = computeSectionFocusFulfillment(req, measured, false);
    assert('1g. Explore Money Moves focusing is unchanged by this correction — fulfils at its measured y regardless of Score state, and never opens the Score sheet', result.fulfilled === true && result.scrollY === 555 && result.shouldOpenScoreSheet === false);
  }
}

console.log('\n=== Section 2: one-tap Score destination — shouldOpenScoreSheet contract (real functions) ===');
{
  const measured: SectionFocusMeasurements = { ...UNMEASURED, score: 900 };

  // Authoritative score -> the full Score experience opens as part of fulfilment.
  {
    const req = parseSectionFocusRequest('score', 1)!;
    const result = computeSectionFocusFulfillment(req, measured, true);
    assert('2a. authoritative Score + fulfilled focus request: shouldOpenScoreSheet is true — one Today tap reaches the full Score experience, no second tap required', result.fulfilled === true && result.shouldOpenScoreSheet === true);
  }

  // Locked/unavailable score -> never auto-opens (ScoreExplanationSheet has
  // no meaningful content while locked — see luluScore.ts's LOCKED_RESULT,
  // categories: []) — lands on the section's own correct locked copy instead.
  {
    const req = parseSectionFocusRequest('score', 2)!;
    const result = computeSectionFocusFulfillment(req, measured, false);
    assert('2b. non-authoritative (locked/unavailable) Score: shouldOpenScoreSheet is false — never opens a near-empty sheet with no unlock action', result.fulfilled === true && result.shouldOpenScoreSheet === false);
  }

  // Journey/financial-learning never open the Score sheet, authoritative or not.
  {
    const journeyMeasured: SectionFocusMeasurements = { ...UNMEASURED, journey: 200 };
    const req = parseSectionFocusRequest('journey', 1)!;
    assert('2c. Journey focus never opens the Score sheet, even when the score happens to be authoritative', computeSectionFocusFulfillment(req, journeyMeasured, true).shouldOpenScoreSheet === false);
  }

  // Real end-to-end: an authoritative real LuluScoreResult drives shouldOpenScoreSheet true.
  {
    const luluScore = computeLuluScore(baseData());
    const chip = selectScoreChipPresentation(luluScore);
    assert('2d. real fixture sanity: an ordinary funded account is genuinely authoritative ("available")', chip.state === 'available');
    const req = parseSectionFocusRequest('score', 1)!;
    const result = computeSectionFocusFulfillment(req, measured, chip.state === 'available');
    assert('2e. real end-to-end: the exact same scoreChipPresentation.state DiscoverScreen.tsx reads drives shouldOpenScoreSheet true for a real, funded fixture', result.shouldOpenScoreSheet === true);
  }

  // Real end-to-end: a genuinely locked LuluScoreResult drives shouldOpenScoreSheet false.
  {
    const locked = createEmptyAppData();
    locked.user.monthlyIncome = 0;
    const luluScore = computeLuluScore(locked);
    const chip = selectScoreChipPresentation(luluScore);
    assert('2f. real fixture sanity: no income -> genuinely locked, not authoritative', chip.state === 'locked');
    const req = parseSectionFocusRequest('score', 1)!;
    const result = computeSectionFocusFulfillment(req, measured, chip.state === 'available');
    assert('2g. real end-to-end: a genuinely locked real LuluScoreResult drives shouldOpenScoreSheet false — no auto-opened sheet for a locked score', result.shouldOpenScoreSheet === false);
  }
}

console.log('\n=== Section 3: component wiring, ownership, and celebration verification (Structural) ===');
{
  const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  const JOURNEY_TIMELINE_SRC = readFileSync('src/components/health/JourneyTimeline.tsx', 'utf8');
  const SCORE_EXPLANATION_SHEET_SRC = readFileSync('src/components/health/ScoreExplanationSheet.tsx', 'utf8');

  // --- Navigation correction: no more bare frame-count retry-then-abandon ---
  assert(
    'DiscoverScreen.tsx no longer contains the old rAF-retry-then-abandon loop (attempt(retriesLeft), a fixed 30-frame budget)',
    !/function attempt\(retriesLeft: number\)/.test(DISCOVER_SCREEN_SRC) && !/attempt\(30\)/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'DiscoverScreen.tsx delegates the fulfilment decision to the real, unit-tested computeSectionFocusFulfillment — not a re-implemented/duplicated decision',
    /import \{ SectionFocusRequest, parseSectionFocusRequest, computeSectionFocusFulfillment \} from '\.\.\/\.\.\/lib\/calculations\/sectionFocus';/.test(DISCOVER_SCREEN_SRC) &&
      /computeSectionFocusFulfillment\(/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'DiscoverScreen.tsx only clears the request (setParams) inside the fulfilled branch — never inside an "else, give up" branch',
    (() => {
      const fnStart = DISCOVER_SCREEN_SRC.indexOf('function attemptSectionFocus()');
      const fnEnd = DISCOVER_SCREEN_SRC.indexOf('\n  }\n', fnStart);
      const body = DISCOVER_SCREEN_SRC.slice(fnStart, fnEnd);
      const setParamsCount = (body.match(/navigation\.setParams\(/g) || []).length;
      return setParamsCount === 1 && /if \(!result\.fulfilled\) return;/.test(body) && body.indexOf('navigation.setParams(') > body.indexOf('if (!result.fulfilled) return;');
    })()
  );
  assert(
    // Pass 2D — DiscoverScreen.tsx gained four new focusable sections
    // (goals, safety_net, and the Saving/Learning Explore categories),
    // each with its own onLayout re-attempt, alongside the original three
    // (score/journey/financial-learning). The mechanism itself — every
    // onLayout handler re-attempts the one pending request — is unchanged;
    // only the count of sections wired into it grew.
    "onLayout for every focusable section (score/journey/financial-learning/goals/safety_net/saving/learning) re-attempts the pending focus the moment that section measures",
    (() => {
      const count = (DISCOVER_SCREEN_SRC.match(/attemptSectionFocus\(\);/g) || []).length;
      // Once inside the route-params effect, once per onLayout handler (7) = 8.
      return count === 8;
    })()
  );
  assert(
    'every target section (Score/Journey/Explore Money Moves headers) renders unconditionally — never behind a data-dependent condition — so a request against any of them always eventually reaches its onLayout and its established locked/unavailable/empty presentation, never a stuck pending request',
    (() => {
      // None of the three onLayout-bearing <Text> headers are inside a
      // ternary/&&-gated block — confirmed by each appearing directly after
      // a `<Text` tag at the top level of the JSX, not preceded by a `{...
      // ? (` or `{... && (` immediately before it within the preceding 200
      // characters (a defensive, generous window).
      const headers = ['scoreSectionY.current = e.nativeEvent.layout.y;', 'journeySectionY.current = e.nativeEvent.layout.y;', 'exploreMoneyMovesY.current = e.nativeEvent.layout.y;'];
      return headers.every((marker) => {
        const idx = DISCOVER_SCREEN_SRC.indexOf(marker);
        const before = DISCOVER_SCREEN_SRC.slice(Math.max(0, idx - 200), idx);
        return idx !== -1 && !/\?\s*\(\s*$/.test(before.trim()) && !/&&\s*\(\s*$/.test(before.trim());
      });
    })()
  );

  // --- Repeated-request support: requestId stamping ---
  // Pass 2D — TodayScreen.tsx consolidated the three near-identical
  // score/journey/financial-learning navigate() call sites into one shared
  // navigateToGrow(scrollTo) helper (also now reused by the new contextual-
  // insight destination) — the counter increment and navigate() call each
  // now appear once in source, not three times, but every caller still goes
  // through this single helper, so a fresh id is still stamped on every
  // single Grow-focus navigation, exactly as before.
  assert(
    'TodayScreen.tsx stamps every Grow focus navigation with a fresh, monotonically increasing requestId from one shared counter, via one shared navigateToGrow helper',
    /const focusRequestIdRef = useRef\(0\);/.test(TODAY_SCREEN_SRC) &&
      /function navigateToGrow\(scrollTo: string\) \{\s*focusRequestIdRef\.current \+= 1;\s*navigation\.navigate\('Grow', \{ scrollTo, scrollToRequestId: focusRequestIdRef\.current \}\);\s*\}/.test(TODAY_SCREEN_SRC) &&
      /navigateToGrow\('score'\);/.test(TODAY_SCREEN_SRC) &&
      /navigateToGrow\('journey'\);/.test(TODAY_SCREEN_SRC)
  );

  // --- One-tap Score destination ---
  assert(
    'DiscoverScreen.tsx wires shouldOpenScoreSheet from the fulfilment result directly into setScoreSheetVisible(true) — the sheet opens as part of successfully fulfilling the focus request, not from a separate second tap',
    /if \(result\.shouldOpenScoreSheet\) setScoreSheetVisible\(true\);/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'the Score section is still independently tappable for an organic (non-Today-driven) visit to Grow — the whole Score card is one TouchableOpacity with onPress={() => setScoreSheetVisible(true)}, so this correction (and the Pass 2C radial-gauge redesign) adds the auto-open without removing the existing manual affordance',
    /<TouchableOpacity\s+onPress=\{\(\) => setScoreSheetVisible\(true\)\}\s+activeOpacity=\{0\.8\}/.test(DISCOVER_SCREEN_SRC)
  );

  // --- Back behaviour: the sheet is the same, unmodified, existing Modal —
  // its onRequestClose/Close-button dismissal is untouched regardless of
  // how it was opened (auto vs. manual tap), so no new trap is introduced. ---
  assert(
    'ScoreExplanationSheet.tsx is untouched by this correction pass — its Modal onRequestClose/Close-button dismissal (the real Back/close behaviour) is exactly the pre-existing, accepted component, not redesigned for auto-open',
    /<Modal visible=\{visible\} animationType="slide" transparent onRequestClose=\{onClose\}>/.test(SCORE_EXPLANATION_SHEET_SRC) && /<TouchableOpacity style=\{styles\.closeButton\} onPress=\{onClose\}>/.test(SCORE_EXPLANATION_SHEET_SRC)
  );
  assert(
    'DiscoverScreen.tsx never introduces a second, competing dismissal path for the Score sheet — onClose is the same single setScoreSheetVisible(false) regardless of how the sheet was opened',
    (DISCOVER_SCREEN_SRC.match(/onClose=\{\(\) => setScoreSheetVisible\(false\)\}/g) || []).length === 1
  );

  // --- Score/Journey ownership: the celebration effect lives entirely in
  // TodayScreen.tsx and is never gated on JourneyTimeline being mounted ---
  assert(
    'JourneyTimeline.tsx (the full Journey presentation, now mounted in Grow) contains no celebration/persistence side effects of its own — purely presentational (no celebrate(), no markAchievementsSeen, no useEffect)',
    !/celebrate\(/.test(JOURNEY_TIMELINE_SRC) && !/markAchievementsSeen/.test(JOURNEY_TIMELINE_SRC) && !/useEffect/.test(JOURNEY_TIMELINE_SRC)
  );
  assert(
    "TodayScreen.tsx's achievement-unlock celebration effect is unconditional on any Journey-visibility state — it reads data.seenAchievementIds/achievements directly, not gated behind a JourneyTimeline mount check",
    /const newlyUnlocked = achievements\.find\(\(a\) => a\.unlocked && !data\.seenAchievementIds\.includes\(a\.id\)\);/.test(TODAY_SCREEN_SRC) &&
      /celebrate\(\{ id: newlyUnlocked\.id, tier: isBig \? 'big' : 'small'/.test(TODAY_SCREEN_SRC) &&
      /markAchievementsSeen\(\[newlyUnlocked\.id\]\);/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'the achievement-unlock celebration effect still runs on TodayScreen even though JourneyTimeline moved to Grow — TodayScreen still computes achievements via the exact same computeAchievements(data), independent of where JourneyTimeline itself is mounted',
    /const achievements = useMemo\(\(\) => computeAchievements\(data\), \[data\]\);/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'the score-milestone celebration effect (10-point bands) also lives entirely in TodayScreen.tsx, independent of ScoreExplanationSheet/Grow — computeScoreMilestoneCelebration is called here, not inside the Score section moved to Grow',
    /computeScoreMilestoneCelebration\(luluScore\.score, data\.user\.highestScoreMilestoneCelebrated \?\? 0\);/.test(TODAY_SCREEN_SRC)
  );

  // --- Journey total is authoritative, not a filtered/visible-slice count ---
  assert(
    "journeySnapshot.ts's totalCount is achievements.length — the full computeAchievements() return, not JourneyTimeline's own truncated `visible`/INITIAL_VISIBLE display slice",
    (() => {
      const src = readFileSync('src/lib/calculations/journeySnapshot.ts', 'utf8');
      return /totalCount: achievements\.length,/.test(src) && !/totalCount:\s*visible/.test(src);
    })()
  );
  assert(
    "JourneyTimeline.tsx's own progressive-disclosure slicing (INITIAL_VISIBLE) is a private display concern of the full timeline component and is never imported by or referenced from journeySnapshot.ts",
    !/journeySnapshot/.test(JOURNEY_TIMELINE_SRC)
  );
}

console.log('\n=== Section 4: Journey total is the authoritative count, not a filtered length (real function) ===');
{
  function achievement(id: string, unlocked: boolean): Achievement {
    return { id, icon: 'trophy', title: `Title ${id}`, subtitle: 'Subtitle', unlocked };
  }
  // JourneyTimeline's own INITIAL_VISIBLE constant is 5 — build a list far
  // longer than that and confirm totalCount is the true full length, never
  // silently capped to a display-sized slice.
  const long = Array.from({ length: 23 }, (_, i) => achievement(`m${i}`, i < 9));
  const snap = computeJourneySnapshot(long);
  assert('totalCount equals the full 23-item list, not truncated to any display-sized slice (e.g. 5)', snap.totalCount === 23);
  assert('completedCount equals the real unlocked count (9), independent of totalCount', snap.completedCount === 9);
  assert('next is the first not-yet-unlocked achievement by list order (index 9, "m9")', snap.next?.id === 'm9');

  // Cross-check against the real, unmodified computeAchievements() output —
  // its own length varies per user (conditional credit-card/loan/mortgage
  // entries — see achievements.ts), so totalCount must track that real,
  // variable length exactly, never a hard-coded constant.
  const withDebt = baseData();
  withDebt.creditCards = [{ id: 'c1', name: 'Card', currentBalance: 500, creditLimit: 2000 }] as any;
  const withoutDebt = baseData();
  const achievementsWithDebt = computeAchievements(withDebt);
  const achievementsWithoutDebt = computeAchievements(withoutDebt);
  assert(
    'computeAchievements itself returns a variable-length list depending on user data (credit-card-holder gets one more entry than a user with none) — confirming totalCount cannot be a fixed constant',
    achievementsWithDebt.length === achievementsWithoutDebt.length + 1
  );
  assert('journeySnapshot totalCount tracks the real, variable achievements.length for a credit-card holder', computeJourneySnapshot(achievementsWithDebt).totalCount === achievementsWithDebt.length);
  assert('journeySnapshot totalCount tracks the real, variable achievements.length for a user with no debt', computeJourneySnapshot(achievementsWithoutDebt).totalCount === achievementsWithoutDebt.length);
}

console.log('\n=== Section 5: Score-outside-budget and reminder-ownership properties survive the Pass 2B layout/colour correction (Structural regression) ===');
{
  // TodayBriefingCard.tsx was intentionally rewritten this round (SectionCard
  // rows -> BriefingTileRow tiles, embedded SmartReminderCard -> a tap-through
  // ReminderDetailSheet) — see this round's authorised scope. What must
  // survive is not the old JSX shape but the two underlying contracts: the
  // Score chip is never one of the (up to) three financial tiles, and the
  // reminder's confirmation/dismissal/persistence UI ownership stays with the
  // same unmodified SmartReminderCard, now reached via ReminderDetailSheet.
  const TODAY_BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const REMINDER_SHEET_SRC = readFileSync('src/components/today/ReminderDetailSheet.tsx', 'utf8');
  assert('TodayBriefingCard.tsx: the Score chip is authored outside BriefingTileRow, and selectBriefingTiles never receives the score chip presentation as an argument — Score cannot occupy one of the three financial tile slots', (() => {
    const chipIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<ScoreChip');
    const tileRowIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<BriefingTileRow');
    const selectTilesCall = TODAY_BRIEFING_CARD_SRC.match(/selectBriefingTiles\(([^)]*)\)/);
    return chipIdx !== -1 && tileRowIdx !== -1 && chipIdx < tileRowIdx && !!selectTilesCall && !/scoreChip/.test(selectTilesCall[1]);
  })());
  // Device-test correction round — SmartReminderCard now also receives
  // onNavigateAway={onClose} (the fix for the blank-sheet-after-"Review
  // card" defect: see ReminderDetailSheet.tsx's own doc comment). The
  // underlying claim this assertion protects — SmartReminderCard is
  // mounted here with a real, live reminder value, its own confirmation/
  // dismissal/persistence ownership unchanged — still holds; only the
  // literal prop list grew by one, additive prop each round. Final Pass 2D
  // device-test correction — the reminder value is now `displayedReminder`
  // (this sheet's own pinned "what's currently being viewed" state, set
  // from the live topReminder only at open/settlement time — see this
  // round's final report §1-§3 for why reacting to the raw live prop
  // directly was the confirmed root cause of the interaction blocker), and
  // a new onSettled prop was added (the settlement signal this correction
  // introduces) — never a different component, never a stripped-down
  // SmartReminderCard.
  // WHY STALE (final Pass 2D device-test correction, native-Modal-lifecycle
  // round): the sheet's own pinned displayedReminder state was replaced by
  // useReducer(reduceReminderLifecycle, ...) (state.reminder supplies
  // topReminder now), and two more props (onRequestLoanRepayment/
  // onRequestCreditCardRepayment) were added so this mount can REQUEST a
  // repayment form instead of a second component mounting its own native
  // Modal (this round's confirmed stacked-Modal fix). Still the same,
  // unmodified SmartReminderCard component — reminder confirmation/
  // dismissal/persistence UI ownership is unchanged.
  // WHY STALE AGAIN (Reminder-opening correction round): the confirmed
  // blank-sheet defect (a competing external `visible`/`onClose` boolean
  // racing this file's own reducer — see ReminderDetailSheet.tsx's own doc
  // comment) removed the external `onClose` prop entirely; `onNavigateAway`
  // is now the local `handleForceClose` — same semantic, sourced locally.
  assert(
    // WHY STALE: Reminder queue correction round renamed onSettled to
    // onOutcome (session-deferred "Not yet" fix) and reads presentedState
    // instead of state (blank-shell close fix) — same real mount.
    'ReminderDetailSheet.tsx mounts the same, unmodified SmartReminderCard (a live reminder + onNavigateAway + onOutcome props) — reminder confirmation/dismissal/persistence UI ownership is unchanged, just reached from the compact Reminder tile instead of an inline row',
    /<SmartReminderCard\s*topReminder=\{presentedState\.reminder\}\s*onNavigateAway=\{handleForceClose\}\s*onOutcome=\{handleReminderOutcome\}/.test(REMINDER_SHEET_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
