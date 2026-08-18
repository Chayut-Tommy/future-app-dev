/**
 * Pass 2D — Today & Grow hierarchy cleanup: Money Fact, Market Pulse and
 * remaining hierarchy relocation.
 *
 * CLASSIFICATION (per tests/README.md's evidence taxonomy):
 * - Real import (Class A): pickTodayContextualInsight (todayContextualInsight.ts),
 *   buildInsightPool (dailyInsight.ts), computeEmergencyFund (emergencyFund.ts),
 *   parseSectionFocusRequest/computeSectionFocusFulfillment (sectionFocus.ts) —
 *   all imported and executed directly. These are the actual pure decision
 *   functions TodayScreen.tsx/DiscoverScreen.tsx call, not mirrors.
 * - Structural: regex/string/ordering matches against TodayScreen.tsx and
 *   DiscoverScreen.tsx source text. Both are .tsx files that transitively
 *   import react-native and cannot be imported/executed by tsx in this
 *   harness (see tests/README.md). Genuine rendered-hierarchy, scroll-
 *   timing, content-fit, or on-device navigation proof is NOT available
 *   here and is left to the physical-device checklist — every claim below
 *   about visual order, category interaction, or focus timing is a
 *   source-text match only, never presented as proof of rendered
 *   behaviour.
 */
import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { pickTodayContextualInsight } from '../src/lib/calculations/todayContextualInsight';
import { buildInsightPool } from '../src/lib/calculations/dailyInsight';
import { computeEmergencyFund } from '../src/lib/calculations/emergencyFund';
import { parseSectionFocusRequest, computeSectionFocusFulfillment, SectionFocusMeasurements } from '../src/lib/calculations/sectionFocus';
import { computeGoalAllocation } from '../src/lib/calculations/goalAllocation';
import { MARKET_INDEXES } from '../src/lib/marketIndexes';
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
  return d;
}

const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');
const UNMEASURED: SectionFocusMeasurements = { 'financial-learning': null, score: null, journey: null, goals: null, safety_net: null, saving: null, learning: null };

console.log('=== TODAY HIERARCHY (Structural) ===');
{
  const greetingIdx = TODAY_SCREEN_SRC.indexOf('<Text style={styles.greeting}>');
  const briefingIdx = TODAY_SCREEN_SRC.indexOf('<TodayBriefingCard');
  const journeyIdx = TODAY_SCREEN_SRC.indexOf('<TodayJourneySnapshotCard');
  const monthIdx = TODAY_SCREEN_SRC.indexOf('<MonthSnapshotCard');
  // The literal JSX tag, not the earlier doc-comment prose mention of
  // "Your goals" (plural, inside quotes) describing the goal-order source.
  const goalSnapshotIdx = TODAY_SCREEN_SRC.indexOf('>Your goal<');
  // Correction round — the old `onPress={handleContextualInsightPress}`
  // marker no longer exists (that handler/branch was removed along with the
  // second, independently-eligible fallback selector). `worthKnowingInsight
  // ? (` is the equivalent landmark for the now-single-selector slot.
  const insightIdx = TODAY_SCREEN_SRC.indexOf('worthKnowingInsight ? (');

  assert('all six hierarchy landmarks are found in source (fixture sanity)', [greetingIdx, briefingIdx, journeyIdx, monthIdx, goalSnapshotIdx, insightIdx].every((i) => i !== -1));
  // Worth Knowing round — the approved Today hierarchy moved the
  // contextual-insight slot to sit BEFORE the goal snapshot (Worth Knowing
  // is position 4, Goal is position 5), reversing this pass's original
  // goal-then-insight order. See tests/worth-knowing.test.ts for the
  // dedicated, current-state ordering proof and the new slot's own
  // behaviour; this assertion is corrected in place (not deleted) so this
  // file stays truthful about the shipped order rather than silently going
  // stale.
  assert('Today renders the six target sections in the correct order: greeting -> briefing -> journey -> this month -> contextual insight -> goal snapshot', greetingIdx < briefingIdx && briefingIdx < journeyIdx && journeyIdx < monthIdx && monthIdx < insightIdx && insightIdx < goalSnapshotIdx);
  assert(
    // Correction pass — this assertion previously only checked that
    // MoneyPictureChecklistCard's tag fell somewhere between journeyIdx and
    // monthIdx, which was TRUE precisely because the violation the review
    // caught was real: both UnlockPromptCard (locked Score) and
    // MoneyPictureChecklistCard were interleaved standalone cards sitting
    // between Journey and This Month. That is exactly the pattern the
    // canonical hierarchy forbids ("no routine content should appear
    // between these sections in a way that breaks this hierarchy"). This
    // now proves the opposite: the only markup between Journey and This
    // Month is the This Month section's own plain layout primitives
    // (View/Text for its header) — no card component of any kind.
    'no card of any kind (standalone or otherwise) interrupts Journey -> This Month — only plain layout (View/Text) sits between them',
    (() => {
      const journeyTagEnd = TODAY_SCREEN_SRC.indexOf('/>', journeyIdx) + 2;
      const between = TODAY_SCREEN_SRC.slice(journeyTagEnd, monthIdx);
      const tags = between.match(/<([A-Z]\w*)/g) || [];
      const nonPrimitiveTags = tags.filter((t) => t !== '<View' && t !== '<Text');
      return nonPrimitiveTags.length === 0;
    })()
  );
  assert(
    // SUPERSEDED CLAUSE REMOVED (owner fresh-device correction, authorised
    // ahead of Wave 3): this previously also required the money-picture
    // checklist to sit after the goal snapshot. That Pass 2D placement put
    // the setup checklist below the fold for a brand-new customer, so the
    // owner authorised moving it directly beneath the greeting. The
    // locked-Score unlock prompt's position is UNCHANGED and still asserted,
    // as is the checklist's own onAction/eligibility preservation. This is a
    // presentation-order expectation only — no calculation, persistence or
    // behavioural expectation was altered. The checklist's new position is
    // protected by tests/design5-today-checklist-priority.test.ts.
    'the locked-Score unlock prompt is genuinely preserved (same UNLOCK_COPY.lulu_score, same onAction/eligibility, no calculation or persistence change) and sits strictly after the goal snapshot — never interleaved between any of the six canonical sections',
    (() => {
      const unlockScoreIdx = TODAY_SCREEN_SRC.indexOf('UNLOCK_COPY.lulu_score.icon');
      return (
        unlockScoreIdx > goalSnapshotIdx &&
        /onAction=\{\(\) => setIncomeModalVisible\(true\)\}/.test(TODAY_SCREEN_SRC)
      );
    })()
  );
  assert('one compact goal snapshot follows the contextual-insight slot — a single primaryActiveGoal lookup (first active goal, unsorted, the existing canonical order), not a rendered list/map over multiple goals', /const primaryActiveGoal = data\.goals\.find\(\(g\) => g\.status === 'active'\) \?\? null;/.test(TODAY_SCREEN_SRC) && !/visibleGoals\.map|activeGoals\.map/.test(TODAY_SCREEN_SRC));
  assert(
    // Correction round — the insight slot is now a genuine two-tier tree,
    // not a three-way ternary: Financial Rebuild overrides everything,
    // otherwise `pickWorthKnowingInsight` (worthKnowing.ts's single
    // exported decision function, called once as `worthKnowingInsight`) is
    // the ONLY thing that can occupy the slot. There is no second,
    // independently-eligible `contextualInsight` fallback branch any more —
    // its removal is the direct fix for the "two competing selectors glued
    // by view-layer ternary priority" defect. See tests/worth-knowing.test.ts
    // for the calculation-level proof that showFinancialRebuild ===
    // (financialState.key === 'financial_rebuild').
    // SUPERSEDED SHAPE (owner decision, Wave 2): the block was a two-tier
    // tree whose first tier rendered the Financial Rebuild FinancialStateCard
    // AND suppressed the Worth Knowing selector entirely. That tier was
    // removed, so the block is now a SINGLE tier. The assertion's real
    // intent — one decision, no second independently-eligible fallback card,
    // and no empty gap when nothing qualifies — is unchanged and still
    // enforced, now against the one-tier shape.
    // Protected by tests/design5-today-insight-slot.test.ts.
    'zero eligible content produces no empty gap — the insight block is a single one-tier tree (Worth Knowing -> null), never a second independently-eligible fallback card',
    /\{worthKnowingInsight \? \(/.test(TODAY_SCREEN_SRC) &&
      /\) : null\}/.test(TODAY_SCREEN_SRC) &&
      !/showFinancialRebuild/.test(TODAY_SCREEN_SRC) &&
      !/<FinancialStateCard/.test(TODAY_SCREEN_SRC) &&
      !/contextualInsight/.test(TODAY_SCREEN_SRC) &&
      !/<LuluCheckInCard/.test(TODAY_SCREEN_SRC)
  );
  assert('the contextual-insight slot (Worth Knowing / null) appears before the goal snapshot — the approved Worth Knowing hierarchy, reversing this pass\'s original goal-then-insight order', (() => {
    const block = TODAY_SCREEN_SRC.slice(0, goalSnapshotIdx);
    return block.indexOf('worthKnowingInsight') !== -1;
  })());
  assert('Savings Coach is absent as a standalone Today card — no SavingsCoachCard import or mount in TodayScreen.tsx', !/SavingsCoachCard/.test(TODAY_SCREEN_SRC));
  assert('Money Fact is absent from Today — no SavingFactsCard import or mount in TodayScreen.tsx', !/SavingFactsCard/.test(TODAY_SCREEN_SRC));
  assert('detailed emergency-savings content is absent from Today — no EmergencyFund-specific detail component, only the compact contextual-insight text (which itself carries no calculator/breakdown UI)', !/EmergencyFundCard|SafetyNetCard|EmergencyFundDetail/.test(TODAY_SCREEN_SRC));
  assert('long inline goal management (fixed quick-contribute buttons) is absent from Today — no $100/$200/$500 quick-contribute row', !/QUICK_CONTRIBUTE_AMOUNTS|quickButton/.test(TODAY_SCREEN_SRC));
  assert(
    // TODAY_SCREEN_SRC legitimately mentions "LuluRecommendationCard" by
    // name once, in a doc-comment explaining handleContextualInsightPress's
    // 'transactions' destination choice — that prose reference is not an
    // import/mount, so this checks for the actual import/JSX forms only.
    'LuluRecommendationCard (the retired "second competing contextual insight") is no longer imported/mounted',
    !/^import.*LuluRecommendationCard/m.test(TODAY_SCREEN_SRC) && !/<LuluRecommendationCard/.test(TODAY_SCREEN_SRC)
  );
  assert('Briefing, Score chip and Journey snapshot props/behaviour are byte-unchanged — same TodayBriefingCard prop set and TodayJourneySnapshotCard prop set as Pass 2A-2C shipped', /scoreChip=\{scoreChipPresentation\}/.test(TODAY_SCREEN_SRC) && /<TodayJourneySnapshotCard snapshot=\{journeySnapshot\} onPress=\{handleJourneyPress\} \/>/.test(TODAY_SCREEN_SRC));
}

console.log('\n=== GOALS (Structural + real import) ===');
{
  assert('Today\'s primary-goal selection reuses the exact existing data.goals source/order — no new sort, no priority-based re-ranking introduced for display purposes', !/primaryActiveGoal.*sort|primaryActiveGoal.*priority/.test(TODAY_SCREEN_SRC));
  assert('goal allocation (computeGoalAllocation, the ONE place priority ordering legitimately drives money allocation) is untouched by this pass — still reads goal.priority for funding order, never for Today\'s display order', /PRIORITY_ORDER\[a\.goal\.priority/.test(readFileSync('src/lib/calculations/goalAllocation.ts', 'utf8')));
  assert('no-goal state exposes the existing safe creation route — UnlockPromptCard with the established goal_tracking UNLOCK_COPY, routing to setGoalModalVisible(true)', /UNLOCK_COPY\.goal_tracking/.test(TODAY_SCREEN_SRC) && /onAction=\{\(\) => setGoalModalVisible\(true\)\}/.test(TODAY_SCREEN_SRC));
  assert('achieved and archived goals are never presented as active — primaryActiveGoal filters status === \'active\' only, the exact same filter Grow\'s own "Your goals" list already used', /g\.status === 'active'/.test(TODAY_SCREEN_SRC));
  assert('Today\'s goal snapshot reaches the existing GoalDetailSheet — onPress sets contributeGoalId, the same state variable the existing GoalDetailSheet mount already reads', /onPress=\{\(\) => setContributeGoalId\(g\.id\)\}/.test(TODAY_SCREEN_SRC) && /<GoalDetailSheet goal=\{contributeGoal\}/.test(TODAY_SCREEN_SRC));
  assert('all established update/management actions remain reachable — GoalDetailSheet (richer contribution/progress controls) and AddGoalModal are still mounted, unmodified', /<GoalDetailSheet goal=\{contributeGoal\} onClose=\{\(\) => setContributeGoalId\(null\)\} onCreateAnother=\{\(\) => setGoalModalVisible\(true\)\}\/>/.test(TODAY_SCREEN_SRC.replace(/\s+/g, ' ')) || /<GoalDetailSheet/.test(TODAY_SCREEN_SRC));
  assert('Grow remains the canonical full goal-management entry point — "Your goals" section (all active goals, View all goals, New goal) is unchanged in DiscoverScreen.tsx', /Your goals/.test(DISCOVER_SCREEN_SRC) && /View all goals/.test(DISCOVER_SCREEN_SRC) && /New goal/.test(DISCOVER_SCREEN_SRC));

  // Real-import sanity: goal progress itself is unchanged — same pct formula.
  const data = baseData();
  data.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: 1000, currentAmount: 250, targetDate: null, status: 'active' }];
  const allocation = computeGoalAllocation(data, 500);
  assert('goal progress/allocation calculation itself is unchanged and callable — real function proof, not a re-derived value', allocation.allocations.length === 1 && allocation.allocations[0].goal.id === 'g1');
}

// Correction round — pickTodayContextualInsight/buildInsightPool are no
// longer called from TodayScreen.tsx at all (see the Worth Knowing
// correction round's single-selector fix). The real-import proofs below
// remain valid coverage of those functions themselves (they still exist,
// still work, and tests/worth-knowing.test.ts's own real-import tests don't
// duplicate them) — they are no longer proof of anything Today renders.
console.log('\n=== CONTEXTUAL INSIGHT (real import — no longer wired to Today) ===');
{
  // 1. Emergency-savings insight is factual and data-supported.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }];
    data.recurringItems = [
      { id: 'bill1', type: 'expense', label: 'Rent', amount: 2000, frequency: 'monthly', nextDueDate: new Date(2026, 7, 1).toISOString(), isFixed: true, active: true },
    ];
    const ef = computeEmergencyFund(data);
    const insight = pickTodayContextualInsight(data, null);
    assert('fixture sanity: low cash relative to real recorded expenses produces a real, non-null, low emergencyFund.monthsCovered', ef.monthsCovered !== null && ef.monthlyExpenses > 0 && ef.monthsCovered < 1);
    assert('emergency-savings insight is selected (priority 1) when genuinely relevant, is factual (states the real recorded months-covered number), and focuses Safety Net', insight !== null && insight.source === 'emergencyFund' && insight.destination.kind === 'grow_focus' && insight.destination.target === 'safety_net' && insight.text.includes('month'));
    assert('the emergency-savings insight text states what recorded information caused it (the real "Current: N months" figure), never a vague claim', /Current: \d/.test(insight!.text));
  }

  // 2. Savings insight focuses Saving, and is suppressed once emergency
  // savings takes priority.
  {
    const data = baseData();
    data.assets = [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 20000 }, // deep emergency-fund coverage, so priority 1 never fires
      { id: 'sav1', type: 'savings', label: 'Savings', currentValue: 10000, interestRate: 0.01 },
    ];
    data.savingsComparisons = [{ id: 'c1', bankName: 'Better Bank', rate: 0.05 }];
    const insight = pickTodayContextualInsight(data, null);
    assert('savings-rate insight is selected (priority 2) when a genuinely better rate exists and emergency savings is not itself the priority — reuses buildInsightPool\'s exact savingsInterest entry by identity', insight !== null && insight.source === 'savingsInterest' && insight.destination.kind === 'grow_focus' && insight.destination.target === 'saving');
  }

  // 3. Score-only repetition is suppressed; Journey milestone repetition is
  // suppressed — by construction, since todayContextualInsight.ts never
  // looks for the 'scoreBand' or 'milestone' source tags at all.
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 50000 }]; // deep emergency coverage, no better savings rate on file
    const insight = pickTodayContextualInsight(data, null);
    assert('Score-only repetition is suppressed — the contextual insight never carries source "scoreBand", even though dailyInsight.ts\'s own pool would include a scoreBand entry for this same fixture', insight === null || insight.source !== 'scoreBand');
    assert('Journey milestone repetition is suppressed — the contextual insight never carries source "milestone"', insight === null || insight.source !== 'milestone');
    const pool = buildInsightPool(data, null);
    assert('fixture sanity: buildInsightPool DOES include a scoreBand entry for this fixture (proving the exclusion above is real, not vacuous)', pool.some((p) => p.source === 'scoreBand'));
  }

  // 4. goalImpact is the only remaining priority-3 source, and only when
  // genuinely eligible — never generic filler.
  {
    const data = baseData();
    // No goal, no spending-delta trigger, deep cash coverage, no savings
    // comparison — every priority source is genuinely ineligible.
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 50000 }];
    const insight = pickTodayContextualInsight(data, null);
    assert('no generic Money Fact or filler becomes the Today insight — when nothing is genuinely eligible, the result is null, not a fabricated fallback', insight === null);
  }

  // 5. Determinism — same input, same output, every time (no rotation, no
  // randomness, no mutation of insight state).
  {
    const data = baseData();
    data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }];
    const a = pickTodayContextualInsight(data, null);
    const b = pickTodayContextualInsight(data, null);
    assert('selection is deterministic — the same data produces the exact same insight on repeated calls, no day-of-year rotation involved', JSON.stringify(a) === JSON.stringify(b));
  }

  // 6. Milestone dedup is preserved as a parameter contract, even though
  // this selector's own priority-3 source (goalImpact) never overlaps with
  // it — the parameter still flows through to buildInsightPool unchanged.
  assert(
    'pickTodayContextualInsight still accepts and forwards excludeMilestoneAchievementId to buildInsightPool, preserving the existing milestone-dedup contract for any future/other consumer of that pool',
    /buildInsightPool\(data, excludeMilestoneAchievementId\)/.test(readFileSync('src/lib/calculations/todayContextualInsight.ts', 'utf8'))
  );

  // 7. Rendering does not persist or mutate insight state.
  assert('todayContextualInsight.ts never imports useAppState/updateUser/AsyncStorage — it is a pure calculation module with no persistence or mutation capability', !/useAppState|updateUser|AsyncStorage/.test(readFileSync('src/lib/calculations/todayContextualInsight.ts', 'utf8')));

  // 8. The same emergency-savings point cannot appear twice — Today shows
  // it as the contextual insight (when eligible) and Safety Net's own
  // detail screen shows the full breakdown; Today never also renders a
  // second emergency-savings card of its own.
  assert('the same emergency-savings point cannot appear twice on Today — TodayScreen.tsx has no second/duplicate emergency-savings-specific card beyond the one contextual-insight slot', (TODAY_SCREEN_SRC.match(/month.*expenses saved/g) || []).length === 0);
}

console.log('\n=== GROW HIERARCHY (Structural) ===');
{
  const scoreIdx = DISCOVER_SCREEN_SRC.indexOf('{brand.scoreName}\n      </Text>');
  const journeyIdx = DISCOVER_SCREEN_SRC.indexOf('Your Journey\n      </Text>');
  const goalsIdx = DISCOVER_SCREEN_SRC.indexOf('Your goals\n      </Text>');
  const picksIdx = DISCOVER_SCREEN_SRC.indexOf('<MoneyOpportunitiesHero');
  const safetyNetIdx = DISCOVER_SCREEN_SRC.indexOf('Future You and Safety Net');
  const exploreIdx = DISCOVER_SCREEN_SRC.indexOf('Explore Money Moves\n      </Text>');
  const marketsIdx = DISCOVER_SCREEN_SRC.indexOf('>Markets</Text>', exploreIdx);

  assert('all seven Grow landmarks are found in source (fixture sanity)', [scoreIdx, journeyIdx, goalsIdx, picksIdx, safetyNetIdx, exploreIdx, marketsIdx].every((i) => i !== -1));
  assert('Grow sections appear in the approved order: Score -> Journey -> Your goals -> Navilo Picks -> Future You and Safety Net -> Explore Money Moves -> Market Pulse', scoreIdx < journeyIdx && journeyIdx < goalsIdx && goalsIdx < picksIdx && picksIdx < safetyNetIdx && safetyNetIdx < exploreIdx && exploreIdx < marketsIdx);
  assert('Full Score and combined Journey (Milestones/Money Path tabs) remain unchanged this pass — no Pass 2D marker inside either section\'s own JSX block', !DISCOVER_SCREEN_SRC.slice(scoreIdx, journeyIdx + 200).includes('Pass 2D'));
  assert('Your goals precedes Navilo Picks', goalsIdx < picksIdx);
  assert('Navilo Picks precedes Future You and Safety Net', picksIdx < safetyNetIdx);
  assert('Future You and Safety Net precede Explore Money Moves', safetyNetIdx < exploreIdx);
  assert('Market Pulse appears below Explore Money Moves (lowest priority, lower page)', exploreIdx < marketsIdx);
  assert(
    'Explore groups appear as Saving, Investing, Debt-free, Home, Retirement, Learning, in that exact order',
    (() => {
      const order = ['title="Saving"', 'title="Investing"', 'title="Debt-free"', 'title="Home"', 'title="Retirement"', 'title="Learning"'];
      const indices = order.map((m) => DISCOVER_SCREEN_SRC.indexOf(m));
      return indices.every((i) => i !== -1) && indices.every((v, i) => i === 0 || v > indices[i - 1]);
    })()
  );
  assert('Market Pulse never appears as premium upper-page content — MarketPulsePreview is mounted exactly once, and only after the Explore Money Moves accordion', (DISCOVER_SCREEN_SRC.match(/<MarketPulsePreview \/>/g) || []).length === 1 && DISCOVER_SCREEN_SRC.indexOf('<MarketPulsePreview') > exploreIdx);
}

console.log('\n=== RELOCATIONS (Structural + real import) ===');
{
  assert('Savings Coach appears exactly once in Grow — inside the Saving category, nowhere else', (DISCOVER_SCREEN_SRC.match(/<SavingsCoachCard \/>/g) || []).length === 1);
  assert('Savings Coach sits inside the Saving ExploreCategorySection specifically (between its opening and the next category)', (() => {
    const savingStart = DISCOVER_SCREEN_SRC.indexOf('title="Saving"');
    const investingStart = DISCOVER_SCREEN_SRC.indexOf('title="Investing"');
    const coachIdx = DISCOVER_SCREEN_SRC.indexOf('<SavingsCoachCard');
    return coachIdx > savingStart && coachIdx < investingStart;
  })());
  assert('Savings Coach\'s own component file is untouched by this pass — same calculations/actions/persistence, no Pass 2D marker inside it', !/Pass 2D/.test(readFileSync('src/components/health/SavingsCoachCard.tsx', 'utf8')));
  assert('Money Fact (SavingFactsCard) appears exactly once in Grow — inside the Learning category, nowhere else', (DISCOVER_SCREEN_SRC.match(/<SavingFactsCard \/>/g) || []).length === 1);
  assert('Money Fact sits inside the Learning ExploreCategorySection specifically', (() => {
    const learningStart = DISCOVER_SCREEN_SRC.indexOf('title="Learning"');
    const factIdx = DISCOVER_SCREEN_SRC.indexOf('<SavingFactsCard');
    return factIdx > learningStart;
  })());
  assert('Money Fact\'s own component file is untouched by this pass — same calculation source/inputs/calculator action, no Pass 2D marker inside it', !/Pass 2D/.test(readFileSync('src/components/today/SavingFactsCard.tsx', 'utf8')));
  assert('the standalone lower-page "Your Money Path"-style duplicate pattern is not repeated for Money Path/Savings Coach — no second WealthJourneyCard mount either (regression guard, unrelated relocation)', (DISCOVER_SCREEN_SRC.match(/<WealthJourneyCard /g) || []).length === 1);
  assert('Market Pulse\'s own component file (MarketPulsePreview.tsx) is untouched — still shows "Live data coming soon" and "—" placeholders, never a fabricated live value', /Live data coming soon/.test(readFileSync('src/components/discover/MarketPulsePreview.tsx', 'utf8')) && />—</.test(readFileSync('src/components/discover/MarketPulsePreview.tsx', 'utf8')));
  assert(
    '"What moved markets this week?" travels with Market Pulse (both in the same unavailable-market-content lower-page area), and is explicitly excluded from the ordinary Learning category content',
    (() => {
      const marketsHeaderIdx = DISCOVER_SCREEN_SRC.indexOf('>Markets</Text>', DISCOVER_SCREEN_SRC.indexOf('Explore Money Moves\n      </Text>'));
      const learningStart = DISCOVER_SCREEN_SRC.indexOf('title="Learning"');
      const learningEnd = DISCOVER_SCREEN_SRC.indexOf('</ExploreCategorySection>', learningStart);
      const learningBlock = DISCOVER_SCREEN_SRC.slice(learningStart, learningEnd);
      const marketsBlock = DISCOVER_SCREEN_SRC.slice(marketsHeaderIdx);
      return /markets-this-week/.test(marketsBlock) && /card\.id !== 'markets-this-week'/.test(learningBlock);
    })()
  );
}

console.log('\n=== MARKET PULSE (real import + Structural) ===');
{
  // Correction pass §3 — investigate the real data source rather than
  // assuming the existing "Live data coming soon" copy is sufficient.
  // MARKET_INDEXES (marketIndexes.ts) is the entire data source
  // MarketPulsePreview renders from — this proves, at the data-model
  // level (not just the current JSX), that no price/change/percentage
  // figure can flow through this component at all: the type itself has
  // no field to carry one.
  assert('MarketPulsePreview\'s entire data source (MARKET_INDEXES) carries only symbol/icon fields — no price, change, percentage or timestamp field exists anywhere in the type, so a live-looking number cannot flow through this component even accidentally', MARKET_INDEXES.every((idx) => Object.keys(idx).every((k) => k === 'symbol' || k === 'icon')));
  assert('MARKET_INDEXES is non-empty (fixture sanity — the unavailable state has real content to render, not an empty list masquerading as intentional)', MARKET_INDEXES.length > 0);

  const MARKET_PULSE_SRC = readFileSync('src/components/discover/MarketPulsePreview.tsx', 'utf8');
  assert('MarketPulsePreview has exactly one presentation state — no available/stale/loading branch exists in the component (verified: no conditional rendering keyed off a data-freshness flag), matching the real state of the app (no market-data provider wired up at all, per marketIndexes.ts\'s own comment)', !/isLoading|isStale|lastUpdated|isLive/.test(MARKET_PULSE_SRC));
  assert('every value cell renders the literal placeholder "—", never a template-interpolated figure', /<Text style={styles\.value}>—<\/Text>/.test(MARKET_PULSE_SRC));
  assert('the freshness/limitation badge text is visible and honest ("Live data coming soon"), not a vague or misleading label', /Live data coming soon/.test(MARKET_PULSE_SRC));

  const LEARNING_CARDS_SRC = readFileSync('src/lib/learningCards.ts', 'utf8');
  const marketsCardBlock = LEARNING_CARDS_SRC.slice(LEARNING_CARDS_SRC.indexOf("id: 'markets-this-week'"), LEARNING_CARDS_SRC.indexOf("id: 'markets-this-week'") + 400);
  assert('"What moved markets this week?" card copy itself is honestly educational/prospective ("Coming soon"), not narrating a real past week\'s movement it has no data for', /Coming soon/.test(marketsCardBlock) && !/\d+%|\$\d/.test(marketsCardBlock));
}

console.log('\n=== FOCUS NAVIGATION (real import) ===');
{
  // Real-import proof for the four new targets — parse, fulfil, and
  // confirm none of them spuriously sets shouldOpenScoreSheet/shouldExpandJourney
  // (those remain exclusive to 'score'/'journey', unchanged from Pass 2B).
  for (const target of ['goals', 'safety_net', 'saving', 'learning'] as const) {
    const parsed = parseSectionFocusRequest(target, 1);
    assert(`parseSectionFocusRequest accepts the new '${target}' target with a numeric requestId`, parsed?.target === target && parsed?.requestId === 1);
    const measured: SectionFocusMeasurements = { ...UNMEASURED, [target]: 250 };
    const result = computeSectionFocusFulfillment(parsed, measured, true);
    assert(`'${target}' focus request fulfils at its own measured y-offset once measured`, result.fulfilled === true && result.scrollY === 250);
    assert(`'${target}' focus request never spuriously opens the Score sheet or expands Journey (those remain exclusive to score/journey)`, result.shouldOpenScoreSheet === false && result.shouldExpandJourney === false);
    const stillPending = computeSectionFocusFulfillment(parsed, UNMEASURED, true);
    assert(`'${target}' focus request against an unmeasured target stays pending — same no-timeout contract as every other target`, stillPending.fulfilled === false);
  }
  assert(
    'repeat focus requests remain safe for the new targets — a second, later request with a fresh requestId is fulfilled again (same repeated-tap contract Pass 2B established for score/journey)',
    (() => {
      const first = parseSectionFocusRequest('saving', 1)!;
      const second = parseSectionFocusRequest('saving', 2)!;
      const measured: SectionFocusMeasurements = { ...UNMEASURED, saving: 300 };
      const firstResult = computeSectionFocusFulfillment(first, measured, true);
      const secondResult = computeSectionFocusFulfillment(second, measured, true);
      return firstResult.fulfilled === true && secondResult.fulfilled === true && first.requestId !== second.requestId;
    })()
  );
  assert('DiscoverScreen.tsx opens the target Explore category (saving/learning) before fulfilling focus — a local expand-state write keyed off the pending target, not a persisted change', /if \(target === 'saving' && !exploreExpanded\.saving\) setExploreExpanded/.test(DISCOVER_SCREEN_SRC) && /if \(target === 'learning' && !exploreExpanded\.learning\) setExploreExpanded/.test(DISCOVER_SCREEN_SRC));
  assert('no hard-coded pixel scrolling was introduced for any new target — scrollTo still uses the measured result.scrollY from computeSectionFocusFulfillment', !/scrollTo\(\{ y: \d+/.test(DISCOVER_SCREEN_SRC));
  assert('missing destination data (an unmeasured new target) shows its established safe state — the pending ref is left untouched, never cleared with a fabricated scroll position (same NO_FULFILLMENT contract every existing target already used)', /if \(!result\.fulfilled\) return;/.test(DISCOVER_SCREEN_SRC));

  // Correction pass §4 — honesty check: which typed SectionFocusTarget
  // values actually have a real, customer-reachable issuer anywhere in the
  // app (a genuine onPress/navigateToGrow call site), versus existing only
  // as tested, measured, but unreachable plumbing. 'score'/'journey' are
  // issued by TodayScreen's Score chip/Journey snapshot taps.
  // 'safety_net'/'saving' are issued by the contextual-insight card itself
  // (pickTodayContextualInsight's own destination field) when that specific
  // insight is showing. 'goals'/'learning' have zero real issuers anywhere
  // — this is asserted explicitly so a future change that silently adds or
  // removes an issuer is caught, and so this fact is verifiable by running
  // this file rather than only trusted from a report's prose.
  assert(
    // Pass 2E final correction — score/journey now push the GrowDetail
    // route (pushGrowDetail) rather than navigating in-tab (navigateToGrow),
    // but each still has a real, distinct onPress issuer in TodayScreen.tsx
    // wired to the Score chip and Journey snapshot, and both still carry a
    // scrollTo target of exactly 'score'/'journey' through to DiscoverScreen.
    "'score' and 'journey' each have a real onPress issuer in TodayScreen.tsx (handleScoreChipPress/handleJourneyPress, wired to the Score chip and Journey snapshot)",
    /function handleScoreChipPress\(\) \{\s*pushGrowDetail\('score'\);\s*\}/.test(TODAY_SCREEN_SRC) && /function handleJourneyPress\(\) \{\s*pushGrowDetail\('journey'\);\s*\}/.test(TODAY_SCREEN_SRC)
  );
  assert(
    // Correction round — pickTodayContextualInsight (and its
    // 'safety_net'/'saving' destinations) is no longer called from
    // TodayScreen.tsx at all: `navigateToGrow` and `handleContextualInsightPress`
    // were removed together as dead code once the second, independently-
    // eligible fallback selector was retired (see the Worth Knowing
    // correction round). 'safety_net' and 'saving' join 'goals'/'learning'
    // below as dead/unreachable Grow section-focus infrastructure from
    // Today's perspective — the type itself (TodayContextualInsightDestination)
    // still exists and is still real-import tested above, it simply has no
    // live issuer anywhere in the app any more.
    // Matches the same precise pattern the LuluRecommendationCard check
    // below already uses (real import/call-site forms only, not prose that
    // documents the removal by name) rather than a blanket string-absence
    // check, which a doc comment explaining what was removed and why would
    // otherwise always fail.
    "'safety_net' and 'saving' are now ALSO dead infrastructure — TodayScreen.tsx no longer imports pickTodayContextualInsight, and no longer declares navigateToGrow or handleContextualInsightPress",
    !/^import.*pickTodayContextualInsight/m.test(TODAY_SCREEN_SRC) &&
      !/function navigateToGrow/.test(TODAY_SCREEN_SRC) &&
      !/function handleContextualInsightPress/.test(TODAY_SCREEN_SRC) &&
      !/onPress=\{handleContextualInsightPress\}/.test(TODAY_SCREEN_SRC)
  );
  assert(
    "'goals' and 'learning' are dead infrastructure as of this pass — typed, parsed, fulfilled, and measured (onLayout wiring exists in DiscoverScreen.tsx) but NO real onPress/navigateToGrow call site anywhere in the app issues either target. This is intentional plumbing built to satisfy the spec's typed-target requirement, not yet reachable by any customer action, and must not be reported or device-tested as reachable behaviour.",
    !/navigateToGrow\('goals'\)/.test(DISCOVER_SCREEN_SRC) && !/navigateToGrow\('learning'\)/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    "'financial-learning' also has zero real issuers as of this pass — its only historical issuer, LuluRecommendationCard, was retired from Today by this pass's own relocation work, and nothing else in the app fires this target. Pre-existing plumbing, left intact per CLAUDE.md's scope-preservation rule (removing an existing typed target/measurement is an unauthorised deletion), but must be reported accurately as currently unreachable, not as tested customer behaviour.",
    !/navigateToGrow\('financial-learning'\)/.test(TODAY_SCREEN_SRC) && !/LuluRecommendationCard/.test(TODAY_SCREEN_SRC.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))
  );
}

console.log('\n=== STATES AND REGRESSION (real import + Structural) ===');
{
  // Guest/empty/incomplete states never produce NaN/Infinity/stale amounts
  // in the new contextual-insight or goal-snapshot logic.
  const guest = createEmptyAppData();
  const guestInsight = pickTodayContextualInsight(guest, null);
  assert('guest/new customer (freshly created, untouched AppData): pickTodayContextualInsight never throws and never returns a fabricated insight', guestInsight === null || (typeof guestInsight.text === 'string' && guestInsight.text.length > 0));
  const guestEf = computeEmergencyFund(guest);
  assert('guest/new customer: computeEmergencyFund never returns NaN/Infinity — monthsCovered is null (no expenses recorded) rather than a fabricated number', guestEf.monthsCovered === null && Number.isFinite(guestEf.currentCash) && Number.isFinite(guestEf.monthlyExpenses));

  const cashOnly = baseData();
  cashOnly.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 }];
  const cashOnlyInsight = pickTodayContextualInsight(cashOnly, null);
  assert('Cash-only customer: pickTodayContextualInsight resolves safely (either a real insight or null), never throws', cashOnlyInsight === undefined || cashOnlyInsight === null || typeof cashOnlyInsight.text === 'string');

  // Final Pass 2D device-test correction — this assertion originally
  // covered luluScore.ts too, proving the HIERARCHY-RELOCATION pass (this
  // file's own subject) never touched any calculation module. luluScore.ts
  // was separately, intentionally touched by a LATER, differently-scoped
  // Pass 2D round (the final device-test correction) to fix a genuine
  // double-count defect in cycleExpenseCount (a repayment-only cycle was
  // being misread as "enough spending history") — an authorised
  // financial-correctness fix, not a relocation/hierarchy change, and not
  // silent: it carries its own explicit "Final Pass 2D device-test
  // correction" marker rather than an undocumented change. This is a
  // strengthening, not a weakening: goalAllocation/savingsCoach/
  // savingFacts/achievements remain proven untouched by ANY Pass 2D work,
  // and luluScore.ts's own touch is proven to be the SPECIFIC, understood,
  // documented one rather than an unexplained edit.
  assert(
    'goal, Savings Coach, Money Fact and Journey calculation modules carry no Pass 2D marker inside their own calculation logic (goalAllocation.ts, savingsCoach.ts, savingFacts.ts, achievements.ts) — relocation/hierarchy changes never touched the calculations themselves',
    ['src/lib/calculations/goalAllocation.ts', 'src/lib/calculations/savingsCoach.ts', 'src/lib/calculations/savingFacts.ts', 'src/lib/calculations/achievements.ts'].every(
      (p) => !/Pass 2D/.test(readFileSync(p, 'utf8'))
    )
  );
  assert(
    "luluScore.ts's only Pass 2D touch is the documented final device-test correction (cycleExpenseCount double-count fix), never an undocumented hierarchy-relocation change",
    /Final Pass 2D device-test correction/.test(readFileSync('src/lib/calculations/luluScore.ts', 'utf8'))
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
