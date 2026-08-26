// Nolie Design 5.1 Wave 4 closure — modern existing-goal editing.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): src/lib/goalFormState.ts is pure
//   and RN-free, so the generated-name rule, the no-target progress rule and
//   the pace-gating rule all run the shipped functions. The goal allocation
//   engine is NOT re-implemented here — it is asserted to be untouched.
// - Class C (structural): the entry-point inventory and the editor contract.
//
// NOT proven here: how any of it looks. Device evidence.
//
// Run with: npx tsx tests/design5-wave4-goal-editor.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  GOAL_PURPOSES,
  goalPurposeLabel,
  isGeneratedGoalName,
  resolveGoalNameOnPurposeChange,
  resolveGoalPaceMessage,
  resolveGoalProgressState,
} from '../src/lib/goalFormState';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const CREATE = read('src/components/goals/AddGoalModal.tsx');
const EDIT = read('src/components/goals/GoalDetailSheet.tsx');
const FIELDS = read('src/components/goals/GoalFormFields.tsx');

console.log('=== 1. Every existing-goal entry point opens the ONE modern editor (Class C) ===');
{
  // Four surfaces open an existing goal. All four mount the same component,
  // so modernising it modernises every route — there is no second editor.
  const ENTRY_POINTS = [
    'src/screens/today/TodayScreen.tsx',
    'src/screens/goals/GoalsScreen.tsx',
    'src/screens/discover/DiscoverScreen.tsx',
  ];
  for (const rel of ENTRY_POINTS) {
    assert(`1a. ${rel.split('/').pop()} opens an existing goal through GoalDetailSheet`, /<GoalDetailSheet goal=\{/.test(read(rel)));
  }
  assert('1b. and no surface renders a second, alternative goal editor', ENTRY_POINTS.every((rel) => !/<AddGoalModal[\s\S]{0,200}editGoal/.test(read(rel))));
  assert('1c. the editor is titled as an editor, not a read-only detail view', /title="Edit goal"/.test(EDIT) && !/title="Goal details"/.test(EDIT));
}

console.log('\n=== 2. Create and edit share ONE field system (Class C) ===');
{
  assert('2a. the create adapter renders the shared fields', /<GoalFormFields/.test(CREATE));
  assert('2b. the edit adapter renders the same shared fields', /<GoalFormFields/.test(EDIT));
  assert('2c. neither adapter declares its own purpose list', !/GOAL_TYPES/.test(CREATE) && !/GOAL_TYPES/.test(EDIT));
  assert('2d. neither declares its own priority options', !/const PRIORITIES/.test(stripComments(CREATE)) && !/const PRIORITIES/.test(stripComments(EDIT)));
  assert('2e. the purposes live in one shared list', GOAL_PURPOSES.length === 8 && /GOAL_PURPOSES/.test(FIELDS));
  assert('2f. the shared fields own no persistence and no calculation', !/useAppState|updateGoal|addGoal|requiredMonthlyForGoal/.test(FIELDS));
}

console.log('\n=== 3. The modern edit experience (Class C) ===');
{
  assert('3a. existing values prepopulate every field from the saved goal', /setName\(goal\.name\);\s*\n\s*setPurpose\(goal\.lifeGoalType \?\? null\);\s*\n\s*setPriority\(goal\.priority \?\? 'medium'\);/.test(EDIT));
  assert('3b. purpose is editable — it is already persisted on the model, so no migration was needed', /const \[purpose, setPurpose\] = useState<LifeGoalType \| null>\(goal\?\.lifeGoalType \?\? null\);/.test(EDIT));
  assert('3c. the target amount is a FIELD, not an isolated Set interaction', /<CurrencyField/.test(FIELDS) && !/label="Set"/.test(EDIT));
  assert('3d. the target date uses the canonical MonthYearField', /<MonthYearField/.test(FIELDS));
  assert('3e. no raw MM/YYYY boxes remain in the customer-facing goal editor', !/placeholder="MM"|placeholder="YYYY"/.test(EDIT) && !/placeholder="MM"|placeholder="YYYY"/.test(FIELDS));
  assert('3f. priority is the modern segmented control with plain labels — no emoji', /<Segmented/.test(FIELDS) && !/⭐/.test(FIELDS) && !/⭐/.test(EDIT));
  assert('3g. a fixed Cancel + Save changes footer', /label="Cancel"[\s\S]{0,200}label="Save changes"/.test(EDIT));
  // Copy corrected in the closure pass: the previous sentence claimed it
  // "does not change a balance tracked in Nolie", which is vaguer than the
  // actual model. Verified against `applyContribution`, which writes only
  // `currentAmount` and touches no asset, liability or transaction.
  // Wave 4 closure — the ambiguous "Add to goal progress" field plus a bare
  // "Add" button, buried below every metadata field, became a labelled
  // "Update progress" action opening an inline "Record progress" editor at
  // the TOP of the sheet. Still a separate action with its own separate
  // write; only its label and position changed.
  assert('3h. progress recording remains a separate, clearly-labelled action', /label="Update progress"/.test(EDIT) && /Record progress/.test(EDIT) && /it does not move money between accounts/.test(EDIT));
  assert('3i. and it still uses its own single, unchanged handler', /function handleAddContribution/.test(EDIT) && /function applyContribution/.test(EDIT));
  // RECONCILED (Wave 10 closure) — the confirmed deletion now dispatches
  // the authorised rigid haptic between the exact-once latch and the
  // delete itself (doc C: rigid = confirmed deletion or reset). Guard,
  // confirmation and delete call are unchanged; the pin now allows that
  // single post-confirmation dispatch and nothing else in between.
  assert('3j. Delete keeps its confirmation and its exact-once guard', /if \(deletingRef\.current\) return;\s*\n\s*deletingRef\.current = true;\s*\n\s*hapticRigid\(\);\s*\n\s*deleteGoal\(goal!\.id\);/.test(EDIT));
}

console.log('\n=== 4. Metadata commits exactly once, atomically (Class C) ===');
{
  assert('4a. one write carries every supported field', /const patch = \{\s*\n\s*name: name\.trim\(\)[\s\S]*?lifeGoalType: purpose[\s\S]*?targetAmount: nextTargetAmount,\s*\n\s*targetDate: nextTargetDate,\s*\n\s*priority,\s*\n\s*\};/.test(EDIT));
  assert('4b. and recomputes the estimate with the SHARED engine, exactly as before', /estimatedMonthlyContribution: requiredMonthlyForGoal\(merged\) \|\| undefined/.test(EDIT));
  assert('4c. guarded so a double tap saves once', /if \(metadataSaveRef\.current\) return;/.test(EDIT));
  assert('4d. progress is NOT merged into the metadata save', (() => {
    const start = EDIT.indexOf('function handleSaveChanges()');
    const end = EDIT.indexOf('\n  }', EDIT.indexOf('updateGoal(goal.id,', start));
    return !EDIT.slice(start, end).includes('currentAmount');
  })());
  assert('4e. nothing autosaves any more — no per-field write survives', !/function handleSaveName/.test(EDIT) && !/function handleSaveDate/.test(EDIT) && !/function handleSavePriority/.test(EDIT));
  assert('4f. Cancel therefore has something to protect, and reaches the existing discard guard', /metadataDirty \|\|/.test(EDIT) && /confirmDiscardIfDirty/.test(EDIT));
  assert('4g. Save is refused while a field is half-entered', /const canSaveMetadata =\s*\n\s*name\.trim\(\)\.length > 0 && dateFieldsState !== 'partial'/.test(EDIT));
}

console.log('\n=== 5. The generated-name rule (Class A) ===');
{
  // The exact four-step acceptance example.
  let name = '';
  name = resolveGoalNameOnPurposeChange({ currentName: name, previousPurpose: null, nextPurpose: 'house_deposit' });
  assert('5a. step 1 — selecting Buy property names the goal "Buy property"', name === 'Buy property');
  name = resolveGoalNameOnPurposeChange({ currentName: name, previousPurpose: 'house_deposit', nextPurpose: 'car' });
  assert('5b. step 2 — selecting New car WITHOUT editing updates it to "New car"', name === 'New car');
  name = 'First Tesla';
  const afterManual = resolveGoalNameOnPurposeChange({ currentName: name, previousPurpose: 'car', nextPurpose: 'holiday' });
  assert('5c. steps 3-4 — a manually typed name survives a later purpose change', afterManual === 'First Tesla');

  // Determinism when switching back and forth before any manual edit.
  let n = resolveGoalNameOnPurposeChange({ currentName: '', previousPurpose: null, nextPurpose: 'holiday' });
  n = resolveGoalNameOnPurposeChange({ currentName: n, previousPurpose: 'holiday', nextPurpose: 'car' });
  n = resolveGoalNameOnPurposeChange({ currentName: n, previousPurpose: 'car', nextPurpose: 'holiday' });
  assert('5d. switching back and forth before editing is deterministic', n === 'Travel');

  assert('5e. an empty name always takes the new default', resolveGoalNameOnPurposeChange({ currentName: '   ', previousPurpose: 'car', nextPurpose: 'holiday' }) === 'Travel');
  assert('5f. a name matching the PREVIOUS default is replaced', resolveGoalNameOnPurposeChange({ currentName: 'New car', previousPurpose: 'car', nextPurpose: 'holiday' }) === 'Travel');
  assert('5g. a name matching some OTHER purpose\'s default is treated as the customer\'s', resolveGoalNameOnPurposeChange({ currentName: 'Emergency fund', previousPurpose: 'car', nextPurpose: 'holiday' }) === 'Emergency fund');
  assert('5h. every purpose has a label to generate from', GOAL_PURPOSES.every((p) => (goalPurposeLabel(p.value) ?? '').length > 0));
  assert('5i. a saved name equal to its own purpose default is recognised as generated', isGeneratedGoalName('New car', 'car') && !isGeneratedGoalName('First Tesla', 'car'));

  // Both adapters run the SAME rule.
  assert('5j. the create adapter uses it', /resolveGoalNameOnPurposeChange\(\{ currentName: current, previousPurpose: type, nextPurpose: value \}\)/.test(CREATE));
  assert('5k. and so does the edit adapter', /resolveGoalNameOnPurposeChange\(\{ currentName: current, previousPurpose: purpose, nextPurpose: next \}\)/.test(EDIT));
}

console.log('\n=== 6. A goal with no target has NO percentage (Class A) ===');
{
  assert('6a. no target amount at all -> no-target', resolveGoalProgressState(null, 0).kind === 'no-target');
  assert('6b. undefined -> no-target', resolveGoalProgressState(undefined, 250).kind === 'no-target');
  assert('6c. a zero or negative target is not a denominator either', resolveGoalProgressState(0, 100).kind === 'no-target' && resolveGoalProgressState(-5, 100).kind === 'no-target');
  assert('6d. recorded progress is preserved, not discarded, in the no-target state', /No target set — \{formatCurrencyPrecise\(goal\.currentAmount\)\} recorded so far/.test(EDIT));
  assert('6e. a real target still measures exactly as before', (() => {
    const st = resolveGoalProgressState(1000, 250);
    return st.kind === 'measured' && st.fraction === 0.25;
  })());
  assert('6f. over-target still reports over 100%, unchanged', (() => {
    const st = resolveGoalProgressState(1000, 1500);
    return st.kind === 'measured' && st.fraction === 1.5;
  })());
  assert('6g. the ring is not rendered at all without a target — so no 0% can be drawn', /\{progressState\.kind === 'measured' \? \(/.test(EDIT) && /<GoalProgressRing/.test(EDIT));
  assert('6h. and VoiceOver hears "No target set", never "zero percent"', /accessibilityLabel=\{`No target set\. \$\{formatCurrencyPrecise\(goal\.currentAmount\)\} recorded so far\.`\}/.test(EDIT));
}

console.log('\n=== 7. The pace message is gated on real inputs (Class A) ===');
{
  const base = { requiredMonthly: 500, isFullyFunded: false, projectedCompletionLabel: '2029' };

  // THE RECORDED DEFECT: a target amount, no target date, and the engine
  // reporting not-fully-funded against its own three-year fallback horizon.
  const noDate = resolveGoalPaceMessage({ targetAmount: 50000, targetDate: null, ...base });
  assert('7a. a target amount with NO target date never claims the goal may take longer', noDate.kind === 'needs-target-date');
  // SUPERSEDED by the Wave 4 closure pass: the edit sheet no longer shows
  // only an instruction where the create form showed a useful number. Both
  // now render the SAME shared planning guide — the engine's own three-year
  // horizon, labelled honestly — plus the same hint. The intent is
  // unchanged and stronger: still no invented pace, but no worse an
  // experience than creating the goal.
  assert('7b. it offers the same clearly-labelled planning guide the create form shows, plus a hint', (() => {
    const rules = read('src/lib/goalFormState.ts');
    return (
      /Planning guide: \$\{formatPaceMoney\(monthly\)\}\/month based on \$\{GOAL_PLANNING_HORIZON_YEARS\} years/.test(rules) &&
      /hint: 'Add a target date for a personalised estimate\.'/.test(rules) &&
      /testID="goal-pace-planning-guide"/.test(EDIT) &&
      /testID="goal-pace-planning-guide"/.test(CREATE)
    );
  })());

  assert('7c. no target amount says so, and still never infers a pace', resolveGoalPaceMessage({ targetAmount: null, targetDate: null, ...base }).kind === 'needs-target-amount');
  assert('7d. a zero target is treated the same way', resolveGoalPaceMessage({ targetAmount: 0, targetDate: '2029-01-01', ...base }).kind === 'needs-target-amount');

  // With BOTH inputs the engine's own verdict is passed through unchanged.
  const behind = resolveGoalPaceMessage({ targetAmount: 50000, targetDate: '2029-01-01T00:00:00.000Z', ...base });
  assert('7e. with a real target AND date, a genuine shortfall still shows the caution', behind.kind === 'behind' && behind.projectedCompletionLabel === '2029');
  const onTrack = resolveGoalPaceMessage({ targetAmount: 50000, targetDate: '2029-01-01T00:00:00.000Z', requiredMonthly: 500, isFullyFunded: true, projectedCompletionLabel: null });
  assert('7f. and a funded goal still shows its estimate', onTrack.kind === 'on-track' && onTrack.requiredMonthly === 500 && onTrack.basis === 'target-date');
  assert('7g. a goal needing nothing more says nothing', resolveGoalPaceMessage({ targetAmount: 50000, targetDate: '2029-01-01', requiredMonthly: 0, isFullyFunded: true, projectedCompletionLabel: null }).kind === 'none');
  assert('7h. an absent allocation entry is never read as a shortfall', resolveGoalPaceMessage({ targetAmount: 50000, targetDate: '2029-01-01', requiredMonthly: 500, isFullyFunded: undefined, projectedCompletionLabel: null }).kind === 'on-track');

  // Code only — the module's doc comments name `monthsUntil` and
  // `requiredMonthlyForGoal` precisely to record that it does NOT do their job.
  assert('7i. the rule recreates no formula — it consumes the engine\'s own outputs', !/monthsUntil|remaining \/|Math\.ceil/.test(stripComments(read('src/lib/goalFormState.ts'))));
  assert('7j. and the sheet no longer decides pace inline', !/thisGoalAllocation\?\.isFullyFunded !== false \?/.test(EDIT));
}

console.log('\n=== 8. The goal engines are untouched (Class C) ===');
{
  const engine = read('src/lib/calculations/goalAllocation.ts');
  assert('8a. requiredMonthlyForGoal is unchanged and still owns the formula', /export function requiredMonthlyForGoal\(goal: Goal\): number \{/.test(engine) && /return remaining \/ monthsUntil\(goal\.targetDate\);/.test(engine));
  assert('8b. the allocation engine still owns isFullyFunded', /const isFullyFunded = allocatedMonthly >= requiredMonthly - 0\.5;/.test(engine));
  assert('8c. no component duplicates either', !/function requiredMonthlyForGoal/.test(EDIT) && !/function requiredMonthlyForGoal/.test(CREATE) && !/function requiredMonthlyForGoal/.test(FIELDS));
  assert('8d. the Goal model gained no field', !/lifeGoalType\?:/.test(read('src/types/models.ts')) && /lifeGoalType: LifeGoalType;/.test(read('src/types/models.ts')));
  assert('8e. and the shared rules module persists nothing', !/updateGoal|persist|AsyncStorage/.test(stripComments(read('src/lib/goalFormState.ts'))));
}

console.log('\n=== 9. Old goals with missing optional fields render safely (Class A) ===');
{
  assert('9a. a goal with no target, no date and no priority resolves a safe progress state', resolveGoalProgressState(undefined, 0).kind === 'no-target');
  assert('9b. and a safe pace state', resolveGoalPaceMessage({ targetAmount: undefined, targetDate: undefined, requiredMonthly: 0, isFullyFunded: undefined, projectedCompletionLabel: undefined }).kind === 'needs-target-amount');
  assert('9c. a null purpose yields no label rather than throwing', goalPurposeLabel(null) === null);
  assert('9d. and a null purpose is never mistaken for a generated name', !isGeneratedGoalName('Anything', null));
  assert('9e. the editor falls back to a default priority for a goal that has none', /setPriority\(goal\.priority \?\? 'medium'\);/.test(EDIT));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
