// REAL IMPORT — src/lib/calculations/goalAllocation.ts imports only
// ../../types/models (plain TS types, no react-native), so it loads
// cleanly under plain `npx tsx` and this test calls the actual shipped
// classifyGoalDateFields / requiredMonthlyForGoal, not a copy. These are
// the exact functions GoalDetailSheet.tsx and AddGoalModal.tsx both call
// for Target Date validation and the "estimated monthly goal amount"
// preview — this file protects that shared calculation directly, closing
// part of the "existing Target Date... behaviour remains unchanged" and
// "calculations continue using the saved target until Set" requirements
// that GoalDetailSheet.tsx itself cannot be imported to prove (it
// transitively imports react-native).
//
// Run with: npx tsx tests/goal-allocation.test.ts

import { classifyGoalDateFields, requiredMonthlyForGoal } from '../src/lib/calculations/goalAllocation';
import type { Goal } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function goal(patch: Partial<Goal>): Goal {
  return {
    id: 'g1',
    name: 'Travel',
    lifeGoalType: 'holiday',
    targetAmount: 1200,
    currentAmount: 200,
    targetDate: null,
    priority: 'medium',
    status: 'active',
    ...patch,
  };
}

console.log('=== classifyGoalDateFields — real import, real execution ===');
{
  assert('both blank -> "empty"', classifyGoalDateFields('', '') === 'empty');
  assert('only month filled -> "partial"', classifyGoalDateFields('8', '') === 'partial');
  assert('only year filled -> "partial"', classifyGoalDateFields('', '2027') === 'partial');
  assert('month out of range (13) -> "invalid"', classifyGoalDateFields('13', '2027') === 'invalid');
  assert('non-numeric month -> "invalid"', classifyGoalDateFields('ab', '2027') === 'invalid');
  assert('year not 4 digits -> "invalid"', classifyGoalDateFields('8', '27') === 'invalid');
  assert('a definitely-past year -> "past"', classifyGoalDateFields('1', '2000') === 'past');
  assert('a definitely-future month/year -> "valid"', classifyGoalDateFields('8', '2027') === 'valid');
}

console.log('\n=== requiredMonthlyForGoal — real import, real execution ===');
{
  assert(
    'the exact Travel scenario from this round\'s device acceptance: $1,200 target, $200 progress, no date -> ($1,200-$200)/36 = $27.78',
    Math.abs(requiredMonthlyForGoal(goal({ targetAmount: 1200, currentAmount: 200, targetDate: null })) - 1000 / 36) < 0.0001
  );
  assert(
    'same amounts with a target date exactly 12 months out -> ($1,200-$200)/12 = $83.33 (within the monthsUntil day-count tolerance)',
    (() => {
      const twelveMonthsOut = new Date();
      twelveMonthsOut.setMonth(twelveMonthsOut.getMonth() + 12);
      const result = requiredMonthlyForGoal(goal({ targetAmount: 1200, currentAmount: 200, targetDate: twelveMonthsOut.toISOString() }));
      return result > 80 && result < 87; // monthsUntil uses a 30-day-month approximation, not calendar months
    })()
  );
  assert('no targetAmount -> 0 (never divides by a missing target)', requiredMonthlyForGoal(goal({ targetAmount: null })) === 0);
  assert('already at or past target -> 0, never negative', requiredMonthlyForGoal(goal({ targetAmount: 1000, currentAmount: 1000 })) === 0);
  assert('currentAmount exceeding target -> 0, never negative', requiredMonthlyForGoal(goal({ targetAmount: 1000, currentAmount: 1200 })) === 0);
  assert('an archived (non-active) goal -> 0 regardless of amounts', requiredMonthlyForGoal(goal({ status: 'archived', targetAmount: 1000, currentAmount: 0 })) === 0);
  assert('restoring target back to $1,000 with no date reproduces the original $22.22/month baseline', Math.abs(requiredMonthlyForGoal(goal({ targetAmount: 1000, currentAmount: 200, targetDate: null })) - 800 / 36) < 0.0001);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
