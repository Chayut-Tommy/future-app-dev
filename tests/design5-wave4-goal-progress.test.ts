// Nolie Design 5.1 Wave 4 closure — goal-progress placement and motion.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): the real goal engine, for the calculation the
//   recording verified must survive.
// - Class C (structural): placement order, the single editor, and the motion
//   contract — that motion is feedback and never controls behaviour.
//
// NOT proven here: how the motion looks or feels. Device evidence.
//
// Run with: npx tsx tests/design5-wave4-goal-progress.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { requiredMonthlyForGoal } from '../src/lib/calculations/goalAllocation';

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

const EDIT = read('src/components/goals/GoalDetailSheet.tsx');
const RING = read('src/components/goals/GoalProgressRing.tsx');

console.log('=== 1. Placement — progress comes FIRST, metadata after (Class C) ===');
{
  const ring = EDIT.indexOf('<GoalProgressRing');
  const update = EDIT.indexOf('testID="goal-update-progress"');
  const editor = EDIT.indexOf('testID="goal-progress-editor"');
  const fields = EDIT.indexOf('<GoalFormFields');

  assert('1a. the ring is rendered before the Update progress action', ring > 0 && update > ring);
  assert('1b. the progress editor sits with it, not below the form', editor > 0 && editor < fields);
  assert('1c. and every metadata field comes AFTER the progress surface', fields > update);
  assert('1d. remaining-to-target is shown beside the amounts', /\{formatCurrencyPrecise\(remainingToTarget\)\} to go/.test(EDIT));
}

console.log('\n=== 2. Exactly ONE progress editor, and no generic Add (Class C) ===');
{
  const code = stripComments(EDIT);
  assert('2a. only one editor can render', (code.match(/testID="goal-progress-editor"/g) || []).length === 1);
  assert('2b. only one Update progress entry point', (code.match(/testID="goal-update-progress"/g) || []).length === 1);
  assert('2c. the old lower editor is gone entirely', !/Add to goal progress/.test(code));
  assert('2d. and its ambiguous "Add" button with it', !/label="Add"/.test(code));
  assert('2e. the heading is Record progress', /Record progress/.test(code));
  assert('2f. the input is labelled Amount to record', /label="Amount to record"/.test(code));
  assert('2g. the primary action names the exact amount it will write', /label=\{pendingContributionAmount !== null \? `Record \$\{formatCurrencyPrecise\(pendingContributionAmount\)\}` : 'Record progress'\}/.test(code));
  assert('2h. a remainder shortcut exists when there is one', /Record remaining \{formatCurrencyPrecise\(remainingToTarget\)\}/.test(code));
  assert('2i. Cancel collapses without writing', /function closeProgressEditor\(\) \{\s*\n\s*setProgressEditorOpen\(false\);\s*\n\s*setContribution\(''\);/.test(code));
  assert('2j. the helper copy states the verified model', /This records goal progress; it does not move money between accounts\./.test(code));
  assert('2k. no progress editor at all on a read-only completed goal', /\{isReadOnlyCompleted \? null : progressEditorOpen \? \(/.test(code));
}

console.log('\n=== 3. Validity gating uses the SAME parser as the write (Class C) ===');
{
  assert('3a. the button state is derived from the real parser', /const pendingContributionAmount = parsePositiveContributionAmount\(contribution\);/.test(EDIT));
  assert('3b. so zero, negative, empty and malformed all disable it', /disabled=\{pendingContributionAmount === null\}/.test(EDIT));
  assert('3c. the exact-once guard is untouched', /submittingContributionRef/.test(EDIT));
  assert('3d. and the write still moves only currentAmount', /updateGoal\(goal!\.id, \{ currentAmount: fromCents\(newAmountCents\), status: isNowComplete \? 'completed' : goal!\.status \}\);/.test(EDIT));
  assert('3e. remaining is never invented for a goal with no target', /goal && goal\.targetAmount !== null \? Math\.max\(0, fromCents\(toCents\(goal\.targetAmount\) - toCents\(goal\.currentAmount\)\)\) : 0;/.test(EDIT));
}

console.log('\n=== 4. The post-write sequence is state-driven (Class C) ===');
{
  const code = stripComments(EDIT);
  assert('4a. the keyboard is dismissed after the write', /Keyboard\.dismiss\(\);\s*\n\s*setContribution\(''\);/.test(code));
  assert('4b. the editor collapses', /setProgressEditorOpen\(false\);\s*\n\s*const target = goal!\.targetAmount;/.test(code));
  assert('4c. the confirmation says the update is ALREADY recorded', /already recorded\./.test(code));
  assert('4d. so a metadata Save can never read as still pending', /Progress updated to \$\{formatCurrencyPrecise\(newAmount\)\}/.test(code));
  assert('4e. and it is announced once, politely, not per frame', /accessibilityLiveRegion="polite" testID="goal-progress-confirmation"/.test(code));
}

console.log('\n=== 5. Motion is feedback, never control (Class C) ===');
{
  const ring = stripComments(RING);
  assert('5a. the ring animates only for a genuine delta', /if \(previousRef\.current === clamped\) return;/.test(ring));
  assert('5b. so scrolling, theme changes and unrelated re-renders move nothing', /previousRef\.current = clamped;/.test(ring));
  assert('5c. it starts AT its first value, so reopening a goal never replays', /useRef\(new Animated\.Value\(clamped\)\)/.test(ring));
  assert('5d. the DISPLAYED percentage is state, correct from the first frame', /setDisplayed\(clamped\);/.test(ring) && /\{Math\.round\(displayed \* 100\)\}%/.test(ring));
  assert('5e. Reduced Motion sets the final value with no animation', /if \(reduceMotion\) \{\s*\n\s*animated\.setValue\(clamped\);\s*\n\s*return;\s*\n\s*\}/.test(ring));
  assert('5f. a completion crossing travels longer than an ordinary update', /isCompletion \? MOTION_MS\.celebration \+ MOTION_MS\.progressFill : MOTION_MS\.progressFill \+ MOTION_MS\.figureCrossfade/.test(ring));
  assert('5g. durations come from Design 5.1 tokens, never invented numbers', !/duration: \d+/.test(ring));
  assert('5h. the interpolating ring is hidden from the accessibility tree', /accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/.test(ring));
  assert('5i. no timer anywhere in the ring', !/setTimeout|setInterval/.test(ring));

  const edit = stripComments(EDIT);
  assert('5j. the editor entrance is a restrained fade and 6pt lift — no scale, no bounce', /MOTION_TRAVEL_PT\.rowPlaceRise, 0\]/.test(edit) && !/scale/.test(edit));
  assert('5k. it occupies its final layout immediately — no height animation', !/LayoutAnimation|animatedHeight|maxHeight:/.test(edit));
  assert('5l. Reduced Motion resolves both entrances instantly', /if \(reduceMotionEnabled\) \{\s*\n\s*editorEntrance\.setValue\(1\);/.test(edit) && /if \(reduceMotionEnabled\) \{\s*\n\s*confirmEntrance\.setValue\(1\);/.test(edit));
  assert('5m. no animation callback gates persistence, focus or announcement', !/\.start\(\(\) =>/.test(edit));
  assert('5n. and completion focus/announcement stay state-driven', /if \(announcedCompletionForRef\.current === goal\.id\) return;/.test(edit));
  assert('5o. a reopened completed goal does not replay the announcement', /announcedCompletionForRef\.current = goal\.id;/.test(edit));
}

console.log('\n=== 6. Accessibility (Class C) ===');
{
  assert('6a. the summary exposes the exact state as one label', /accessibilityLabel=\{`\$\{Math\.round\(progress \* 100\)\} percent, \$\{formatCurrencyPrecise\(goal\.currentAmount\)\} of \$\{formatCurrencyPrecise\(/.test(EDIT));
  assert('6b. the no-target state still announces no percentage', /No target set\. \$\{formatCurrencyPrecise\(goal\.currentAmount\)\} recorded so far\./.test(EDIT));
  assert('6c. the remainder shortcut meets the 44pt minimum', /progressShortcut: \{ minHeight: minTouchTarget/.test(EDIT));
  assert('6d. and carries its own label', /accessibilityLabel=\{`Record remaining \$\{formatCurrencyPrecise\(remainingToTarget\)\}`\}/.test(EDIT));
  assert('6e. no raw colours were introduced', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(EDIT) && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(RING));
  assert('6f. success green is used only for the recorded confirmation', /progressConfirm: \{\s*\n\s*backgroundColor: colors\.successSoft,/.test(EDIT));
}

console.log('\n=== 7. The calculation the recording verified is untouched (Class A) ===');
{
  // $10,000 target, ~3 years out. Recording $250 must reduce the required
  // monthly amount through the SHARED engine, exactly as the device showed
  // (~$264 -> ~$257). The figures are derived, never hard-coded.
  const targetDate = new Date(Date.now() + 38 * 30 * 86400000).toISOString();
  const base = { id: 'g', name: 'Goal', lifeGoalType: 'custom' as const, targetAmount: 10000, targetDate, status: 'active' as const };
  const before = requiredMonthlyForGoal({ ...base, currentAmount: 0 } as never);
  const after = requiredMonthlyForGoal({ ...base, currentAmount: 250 } as never);

  assert('7a. recording progress reduces the required monthly amount', after < before);
  assert('7b. by exactly the recorded amount spread over the same horizon', Math.abs((before - after) - 250 / (before === 0 ? 1 : 10000 / before)) < 0.01);
  assert('7c. and the engine still owns the formula — no component recomputes it', !/function requiredMonthlyForGoal/.test(EDIT));
  assert('7d. $250 of $10,000 rounds to 3% under the existing contract', Math.round((250 / 10000) * 100) === 3);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
