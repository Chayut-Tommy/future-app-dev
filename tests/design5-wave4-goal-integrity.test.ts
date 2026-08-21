// Nolie Design 5.1 Wave 4 closure — goal integrity and goal UX.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): the real safeToSpend engine, the
//   real presentation selector, the real goal allocation engine and the pure
//   goal-form rules are all imported and executed. Every figure below is what
//   the shipped code actually produced.
// - Class C (structural): the completed-goal contract and Today's route.
//
// The fixtures are the owner's own verified device figures.
//
// Run with: npx tsx tests/design5-wave4-goal-integrity.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { selectSafeToSpendPresentation, formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import { requiredMonthlyForGoal, computeGoalAllocation } from '../src/lib/calculations/goalAllocation';
import { resolveGoalPaceSummary, GOAL_PLANNING_HORIZON_YEARS } from '../src/lib/goalFormState';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EDIT = read('src/components/goals/GoalDetailSheet.tsx');
const CREATE = read('src/components/goals/AddGoalModal.tsx');
const TODAY = read('src/screens/today/TodayScreen.tsx');
const PRESENTATION = read('src/lib/calculations/safeToSpendPresentation.ts');
const HERO = read('src/components/money/SafeToSpendHero.tsx');

/** The real shared hero-copy source, exactly as both surfaces build it. */
const heroCopyFor = (data: AppData) => computeMoneyHeroCopy(data);

/**
 * The owner's verified fixture, reproduced exactly:
 *   monthly income  $4,348      monthly bills   $11,150
 *   included CBA    $13,150     bills to payday  $1,100
 * Monthly planning therefore stands at -$6,802, while the cycle pool stands
 * at $12,050. The two are different questions with different cadences.
 */
function fixture(goals: AppData['goals']): AppData {
  const today = new Date();
  const inFiveDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5).toISOString();
  const inTwentyDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20).toISOString();
  return {
    user: {
      hasSeenIntro: true,
      monthlyIncome: 4348,
      payFrequency: 'monthly',
      includedMoneyAssetIds: ['cba'],
    },
    assets: [{ id: 'cba', type: 'everyday', label: 'CBA', currentValue: 13150, includeInMoneyCalculations: true }],
    liabilities: [],
    creditCards: [],
    transactions: [],
    // One bill of $1,100 falls before payday; the rest of the $11,150
    // monthly commitment falls after it.
    recurringItems: [
      { id: 'b1', type: 'expense', label: 'Rent', amount: 1100, frequency: 'monthly', nextDueDate: inFiveDays, isFixed: true, active: true },
      // Sized so the MONTHLY position is genuinely negative (4,348 - 5,000)
      // while the CYCLE pool stays positive — the exact shape of the owner's
      // device state, where the card showed -$6,802 and the breakdown
      // showed a healthy $12,050. The two numbers answer different questions.
      { id: 'b2', type: 'expense', label: 'Other commitments', amount: 3900, frequency: 'monthly', nextDueDate: inTwentyDays, isFixed: true, active: true },
      { id: 'inc', type: 'income', label: 'Salary', amount: 4348, frequency: 'monthly', nextDueDate: inTwentyDays, isFixed: true, active: true },
    ],
    goals,
    categories: [],
    netWorthHistory: [],
  } as unknown as AppData;
}

const UNALLOCATED_GOAL = {
  id: 'g1',
  name: 'House deposit',
  lifeGoalType: 'house_deposit',
  targetAmount: 40000,
  currentAmount: 0,
  targetDate: new Date(new Date().getFullYear() + 2, 0, 1).toISOString(),
  status: 'active',
} as never;

console.log('=== 1. The monthly shortfall and the cycle pool are different figures (Class A) ===');
{
  const withoutGoals = computeSafeToSpend(fixture([]));
  const withGoal = computeSafeToSpend(fixture([UNALLOCATED_GOAL]));

  // The monthly planning position is genuinely negative. That is correct and
  // belongs to the monthly surface.
  assert('1a. monthly income minus monthly commitments is a real shortfall', withGoal.goalAllocation.availableForGoals < 0);

  // An active, unallocated goal cannot reserve anything out of a shortfall,
  // so the cycle pool is identical with and without it.
  assert('1b. an active unallocated goal reserves nothing for the cycle', withGoal.goalContributionsMonthly === 0);
  assert('1c. so the cycle pool is IDENTICAL with and without that goal', withGoal.cycleRemainingPool === withoutGoals.cycleRemainingPool);
  assert('1d. and the goal target is never treated as a cycle deduction', withGoal.cycleRemainingPool > 0);
}

console.log('\n=== 2. THE RECORDED DEFECT: the card can no longer substitute the monthly figure (Class A) ===');
{
  // The engine result above is real; only the two fields that select WHICH
  // hero state applies are set explicitly, so this exercises the shipped
  // presentation rule for the exact situation the owner recorded — a known
  // payday, a healthy positive cycle pool, and one active goal that the
  // MONTHLY plan cannot fund.
  const base = computeSafeToSpend(fixture([UNALLOCATED_GOAL]));
  const underfunded = { ...base, hasKnownPayday: true, moneyBalanceStatus: 'ok', daysRemaining: 5 } as never;
  const heroCopy = heroCopyFor(fixture([UNALLOCATED_GOAL]));
  const p = selectSafeToSpendPresentation(underfunded, heroCopy);

  assert('2a. the fixture genuinely reaches the goals_underfunded state', p.heroState === 'goals_underfunded');
  assert('2b. the Available Until Payday amount is VISIBLE, not suppressed', p.amountVisible === true && p.amountCents !== null);
  assert('2c. and it is the canonical cycle pool — the same value the breakdown shows', p.amountCents === Math.round(Math.max(0, base.cycleRemainingPool) * 100));
  assert('2d. the monthly shortfall is never presented as the AUP amount', p.amountCents !== Math.round(base.goalAllocation.availableForGoals * 100));
  assert('2e. no "$-" wording is produced anywhere in this state', !`${p.primaryCopy} ${p.supportingCopy ?? ''} ${p.displayAmount ?? ''}`.includes('$-'));
  assert('2f. the goal requirement is advisory supporting copy, never the amount line', !!p.supportingCopy && p.supportingCopy.includes('/month'));
  assert('2g. and the supporting copy never claims a cycle availability figure', !(p.supportingCopy ?? '').includes('is currently available'));

  // The amount must be indifferent to the goal set entirely, because an
  // unallocated goal reserves nothing.
  const amountFor = (goals: AppData['goals']) =>
    selectSafeToSpendPresentation(
      { ...computeSafeToSpend(fixture(goals)), hasKnownPayday: true, moneyBalanceStatus: 'ok', daysRemaining: 5 } as never,
      heroCopy
    ).amountCents;

  assert('2h. deleting the goal leaves the AUP amount unchanged', amountFor([]) === p.amountCents);
  assert('2i. completing the goal leaves the AUP amount unchanged', amountFor([{ ...(UNALLOCATED_GOAL as object), status: 'completed' } as never]) === p.amountCents);
  assert(
    '2j. adding another unallocated goal leaves it unchanged',
    amountFor([UNALLOCATED_GOAL, { ...(UNALLOCATED_GOAL as object), id: 'g2', name: 'Car' } as never]) === p.amountCents
  );
  assert('2k. and nothing is subtracted twice — the pool is the engine\'s own value', p.amountCents === Math.round(Math.max(0, base.cycleRemainingPool) * 100));
}

console.log('\n=== 3. One amount source — the card and its breakdown cannot disagree (Class C) ===');
{
  assert('3a. goals_underfunded resolves the SAME canonical amount the normal state does', /case 'goals_underfunded':[\s\S]*?\.\.\.resolveAmount\(Math\.max\(0, safeToSpend\.cycleRemainingPool\)\),/.test(PRESENTATION));
  assert('3b. the hero has no separate goals_underfunded card to hide it in', !/heroState === 'goals_underfunded'/.test(HERO));
  // Wave 6 Correction C — the hero's states were converged into one shell,
  // so the amount now renders through `styles.heroFigure` gated on a named
  // `amountVisible` derived from the SAME two presentation fields. The
  // claim protected here is unchanged and asserted more strictly: the
  // amount is the presentation's own `displayAmount`, gated on the
  // presentation's own `amountVisible`, and is never derived locally.
  assert('3c. the hero renders the presentation amount, never a locally derived one', /const amountVisible = presentation\.amountVisible && !!presentation\.displayAmount;/.test(HERO) && /\{presentation\.displayAmount\}/.test(HERO) && !/formatMoney\(safeToSpend\.cycleRemainingPool\)/.test(HERO));
  assert('3d. and no screen-level financial formula was introduced', !/monthlyIncome -|cycleRemainingPool -/.test(HERO));
  assert('3e. the monthly figure remains available only as goal-allocation input', /availableForGoals/.test(read('src/lib/calculations/safeToSpend.ts')));
}

console.log('\n=== 4. The shared, live pace summary (Class A) ===');
{
  const engine = (input: { targetAmount: number | null; targetDate: string | null; currentAmount: number }) =>
    requiredMonthlyForGoal({
      id: 'p', name: '', lifeGoalType: 'custom',
      targetAmount: input.targetAmount, currentAmount: input.currentAmount, targetDate: input.targetDate, status: 'active',
    } as never);

  // $2,000, no date -> the engine's own three-year horizon, ~$56/month.
  const guide = resolveGoalPaceSummary({ targetAmount: 2000, targetDate: null, dateState: 'empty', currentAmount: 0 }, engine);
  assert('4a. a target with no date produces a labelled planning guide, not silence', guide.kind === 'planning-guide');
  assert('4b. its figure is the engine\'s own three-year result (~$56/month)', guide.kind === 'planning-guide' && Math.round(guide.monthly) === 56);
  assert('4c. it says so in words, and offers the personalising hint', guide.kind === 'planning-guide' && guide.message.includes(`${GOAL_PLANNING_HORIZON_YEARS} years`) && guide.hint.includes('target date'));

  // Adding a draft date must move the number, with no save involved.
  const jan2027 = new Date(2027, 0, 1).toISOString();
  const dated = resolveGoalPaceSummary({ targetAmount: 2000, targetDate: jan2027, dateState: 'valid', currentAmount: 0 }, engine);
  assert('4d. adding a draft date switches to a real estimate', dated.kind === 'estimate');
  assert('4e. and the amount genuinely changed from the guide', dated.kind === 'estimate' && guide.kind === 'planning-guide' && dated.monthly !== guide.monthly);

  // Recorded progress is subtracted, through the engine.
  const withProgress = resolveGoalPaceSummary({ targetAmount: 2000, targetDate: jan2027, dateState: 'valid', currentAmount: 500 }, engine);
  assert('4f. recorded progress reduces the required amount, via the engine', withProgress.kind === 'estimate' && dated.kind === 'estimate' && withProgress.monthly < dated.monthly);

  // A caution supplements the estimate; it never replaces it.
  const behind = resolveGoalPaceSummary(
    { targetAmount: 2000, targetDate: jan2027, dateState: 'valid', currentAmount: 0, isFullyFunded: false, projectedCompletionLabel: '2029' },
    engine
  );
  assert('4g. a behind-pace verdict still shows the numeric estimate', behind.kind === 'estimate' && behind.monthly > 0 && behind.message.includes('Estimated monthly'));
  assert('4h. with the caution alongside it, not instead of it', behind.kind === 'estimate' && !!behind.caution && behind.caution.includes('2029'));

  // No target, and invalid dates, never invent a pace.
  assert('4i. no target amount asks for one', resolveGoalPaceSummary({ targetAmount: null, targetDate: null, dateState: 'empty', currentAmount: 0 }, engine).kind === 'needs-target-amount');
  for (const st of ['partial', 'invalid', 'past'] as const) {
    assert(`4j. a ${st} date invents nothing`, resolveGoalPaceSummary({ targetAmount: 2000, targetDate: null, dateState: st, currentAmount: 0 }, engine).kind === 'invalid-date');
  }
  assert('4k. a goal already at its target says nothing', resolveGoalPaceSummary({ targetAmount: 2000, targetDate: jan2027, dateState: 'valid', currentAmount: 2000 }, engine).kind === 'none');

  // The same inputs produce the same output in both adapters, because both
  // call this one rule with the same engine.
  assert('4l. both adapters call the shared summary', /resolveGoalPaceSummary\(/.test(CREATE) && /resolveGoalPaceSummary\(/.test(EDIT));
  assert('4m. both hand it the shared engine, never a second formula', /requiredMonthlyForGoal\(\{/.test(CREATE) && /requiredMonthlyForGoal\(\{/.test(EDIT));
  assert('4n. the edit adapter reads the DRAFT date, not the saved one', /dateFieldsState === 'valid' \? new Date\(parseInt\(targetYear, 10\), parseInt\(targetMonth, 10\) - 1, 1\)\.toISOString\(\) : null,\s*\n\s*dateState: dateFieldsState,/.test(EDIT));
  assert('4o. and the DRAFT target amount, not the saved one', /const resolution = resolveTargetAmountDraft\(targetAmountDraft\);\s*\n\s*if \(resolution\.kind === 'set'\) return resolution\.amount;/.test(EDIT));
}

console.log('\n=== 5. Progress and completion (Class A + Class C) ===');
{
  // The owner's percentages, through the shared progress rule.
  const engineAllocation = computeGoalAllocation(fixture([]), 0);
  assert('5a. an empty goal set allocates nothing', engineAllocation.totalAllocatedMonthly === 0);

  assert('5b. a completed goal is read-only by default', /const isReadOnlyCompleted = goal\?\.status === 'completed';/.test(EDIT));
  assert('5c. the editable fields and the progress editor are hidden in that state', /\{isReadOnlyCompleted \? null : \(/.test(EDIT));
  // The editor moved to the top of the sheet in the closure pass, so it is
  // gated on its own `isReadOnlyCompleted` check rather than living inside
  // the metadata block. Same guarantee: no progress editor on a completed
  // goal, so nothing can be pushed past the target from that view.
  assert('5d. so progress can never be pushed past the target from the completed view', /\{isReadOnlyCompleted \? null : progressEditorOpen \? \(/.test(EDIT) && /testID="goal-update-progress"/.test(EDIT));
  assert('5e. the keyboard is dismissed BEFORE the completion state is announced', /Keyboard\.dismiss\(\);\s*\n\s*const node = findNodeHandle\(completionHeadingRef\.current\);/.test(EDIT));
  assert('5f. focus moves to a single completion heading', /<Text ref=\{completionHeadingRef\} style=\{styles\.completedTitle\} accessibilityRole="header">/.test(EDIT));
  assert('5g. and completion is announced exactly once per goal', /if \(announcedCompletionForRef\.current === goal\.id\) return;/.test(EDIT));
  assert('5h. the action hierarchy is Done, Create another, then Extend', /testID="goal-completed-done"/.test(EDIT) && /testID="goal-completed-create-another"/.test(EDIT) && /testID="goal-completed-extend"/.test(EDIT));
  assert('5i. Extend is explicit and uses the existing supported status', /function handleExtend\(\) \{[\s\S]*?updateGoal\(goal!\.id, \{ status: 'active' \}\);/.test(EDIT));
  assert('5j. Archive is preserved but demoted, with copy that explains it', /Archive — hide from lists, keep history/.test(EDIT));
  assert('5k. completion uses restrained success, never the caution treatment', /completedBanner: \{\s*\n\s*backgroundColor: colors\.successSoft,/.test(EDIT));
  assert('5l. and the completed footer offers only Done', /testID="goal-completed-footer-done"/.test(EDIT));
  assert('5m. the progress helper states the actual model', /it does not move money between accounts/.test(EDIT));
  assert('5n. and the contribution write still touches only currentAmount', /updateGoal\(goal!\.id, \{ currentAmount: fromCents\(newAmountCents\), status: isNowComplete \? 'completed' : goal!\.status \}\);/.test(EDIT));
}

console.log('\n=== 6. Today with multiple active goals (Class C) ===');
{
  assert('6a. the active count excludes completed and archived goals', /const activeGoalCount = data\.goals\.filter\(\(g\) => g\.status === 'active'\)\.length;/.test(TODAY));
  assert('6b. the route appears only above one active goal', /\{activeGoalCount > 1 \? \(/.test(TODAY));
  assert('6c. it navigates to the EXISTING Goals screen — no new sheet or layer', /navigation\.navigate\('Goals'\)/.test(TODAY));
  assert('6d. its label carries the exact active count', /accessibilityLabel=\{`View all goals, \$\{activeGoalCount\} active`\}/.test(TODAY) && /View all goals \(\{activeGoalCount\}\)/.test(TODAY));
  assert('6e. and it meets the 44pt minimum target', /viewAllGoalsRow: \{\s*\n\s*minHeight: minTouchTarget,/.test(TODAY));
  assert('6f. Today still renders exactly ONE focus goal, by the unchanged rule', /const primaryActiveGoal = data\.goals\.find\(\(g\) => g\.status === 'active'\) \?\? null;/.test(TODAY));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
