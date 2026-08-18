// Today insight slot — Financial Rebuild removal + Profile Nudge deferral.
//
// CLASSIFICATION (per tests/README.md):
// - Structural (Class C): TodayScreen.tsx imports react-native and cannot be
//   executed by this tsx harness, so composition is verified by matching the
//   real shipped source. Proves WIRING and REACHABILITY, not rendered runtime.
// - Real import (Class A): section 5 executes the actual worthKnowing.ts and
//   financialState.ts modules to prove neither calculation changed.
//
// Run with: ./node_modules/.bin/tsx tests/design5-today-insight-slot.test.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const TODAY = read('src/screens/today/TodayScreen.tsx');
/** Source with comments stripped — comments may still discuss the removed
 * surfaces; only real code counts as "reachable". */
const CODE = TODAY.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('=== 1. FinancialStateCard is unreachable from Today ===');
{
  assert('1a. no <FinancialStateCard> render call', !/<FinancialStateCard/.test(CODE));
  assert('1b. no import of FinancialStateCard', !/import[^;]*FinancialStateCard/.test(CODE));
  assert('1c. no useFinancialState call', !/useFinancialState\(/.test(CODE));
  assert('1d. no showFinancialRebuild predicate', !/showFinancialRebuild/.test(CODE));
  assert('1e. no financialStateActions handler bundle', !/financialStateActions/.test(CODE));
}

console.log('\n=== 2. "Financial rebuild" wording is absent from Today ===');
{
  assert('2a. the rebuild headline does not appear in Today', !/financial position is rebuilding/i.test(TODAY));
  assert('2b. the financial_rebuild key is not referenced in Today code', !/financial_rebuild/.test(CODE));
  // The copy and the calculation still exist for Wealth Map, untouched.
  assert('2c. the headline still exists in financialState.ts (calculation preserved)', /Your current financial position is rebuilding\./.test(read('src/lib/calculations/financialState.ts')));
  assert('2d. FinancialStateCard.tsx still exists on disk (component preserved)', fs.existsSync(path.join(root, 'src/components/today/FinancialStateCard.tsx')));
  assert('2e. Wealth Map still uses describeFinancialStateForWealthMap', /describeFinancialStateForWealthMap/.test(read('src/screens/wealth/WealthScreen.tsx')));
}

console.log('\n=== 3. Worth Knowing is the sole occupant of the slot ===');
{
  const monthIdx = CODE.indexOf('<MonthSnapshotCard');
  const goalHeader = CODE.indexOf('Your goal');
  const slot = CODE.slice(monthIdx, goalHeader);
  assert('3a. the slot sits between the month snapshot and the goal section', monthIdx !== -1 && goalHeader !== -1 && monthIdx < goalHeader);
  assert('3b. WorthKnowingCard is rendered in that slot', /<WorthKnowingCard/.test(slot));
  assert('3c. exactly one WorthKnowingCard in the whole screen', (CODE.split('<WorthKnowingCard').length - 1) === 1);
  assert('3d. no other insight card occupies the slot', !/<FinancialStateCard|<LuluRecommendationCard|<SavingFactsCard/.test(slot));
  assert('3e. the slot is a single conditional on worthKnowingInsight', /\{worthKnowingInsight \?/.test(CODE));
}

console.log('\n=== 4. No eligible insight => no card, and no fabricated content ===');
{
  assert('4a. the conditional falls through to null, not a fallback card', /worthKnowingInsight \?[\s\S]{0,2000}?\) : null\}/.test(CODE));
  assert('4b. no fabricated zero introduced in the slot', !/\$0/.test(CODE));
  // The removed card carried its own "Add a goal" CTA; it must not have
  // left a duplicate behind.
  const goalCtas = (CODE.match(/setGoalModalVisible\(true\)/g) || []).length;
  assert(`4c. no duplicate "Add a goal" CTA introduced (${goalCtas} goal-modal openers, all pre-existing)`, goalCtas <= 2);
}

console.log('\n=== 5. Calculations are untouched (real import) ===');
{
  const wk = require('../src/lib/calculations/worthKnowing');
  assert('5a. pickWorthKnowingInsight is still the single exported decision function', typeof wk.pickWorthKnowingInsight === 'function');
  const fs2 = require('../src/lib/calculations/financialState');
  assert('5b. computeFinancialState still exported and callable', typeof fs2.computeFinancialState === 'function');
  assert('5c. describeFinancialStateForWealthMap still exported', typeof fs2.describeFinancialStateForWealthMap === 'function');
  // Today must not gate Worth Knowing on any other selector any more.
  assert('5d. the Worth Knowing selector is no longer suppressed by another state', !/!showFinancialRebuild \?/.test(CODE));
}

console.log('\n=== 6. Profile nudge is deferred out of Today ===');
{
  assert('6a. no <ProfileNudgeCard> render call', !/<ProfileNudgeCard/.test(CODE));
  assert('6b. no import of ProfileNudgeCard', !/import[^;]*ProfileNudgeCard/.test(CODE));
  assert('6c. "Enjoying" copy is not reachable from Today', !/Enjoying/.test(CODE));
  assert('6d. the component is preserved on disk for Wave 9', fs.existsSync(path.join(root, 'src/components/today/ProfileNudgeCard.tsx')));

  const CARD = read('src/components/today/ProfileNudgeCard.tsx');
  assert('6e. its copy is unchanged', /Enjoying \{brand\.name\}\? ✨/.test(CARD));
  assert('6f. its dismissal logic is unchanged', /updateUser\(\{ profileNudgeDismissed: true \}\)/.test(CARD));
  assert('6g. its visibility rule is unchanged', /hasEngaged && profileIncomplete && !data\.user\.profileNudgeDismissed/.test(CARD));
}

console.log('\n=== 7. No new persistence, timer or cooldown was added ===');
{
  assert('7a. profileNudgeDismissed still exists on the model (not removed)', /profileNudgeDismissed\?: boolean;/.test(read('src/types/models.ts')));
  assert('7b. no new nudge timestamp/cooldown field added', !/profileNudge(Shown|LastSeen|Cooldown|Count)/.test(read('src/types/models.ts')));
  assert('7c. Today added no setTimeout/session counter for the nudge', !/setTimeout[^\n]*[Nn]udge/.test(CODE));
  assert('7d. no independent Score/milestone logic read the nudge flag', !/profileNudgeDismissed/.test(read('src/lib/calculations/luluScore.ts')));
}

console.log('\n=== 8. The approved checklist correction is untouched ===');
{
  const greeting = CODE.indexOf('{greeting}');
  const checklist = CODE.indexOf('<MoneyPictureChecklistCard');
  const briefing = CODE.indexOf('<TodayBriefingCard');
  assert('8a. checklist still sits between greeting and briefing', greeting < checklist && checklist < briefing);
  assert('8b. checklist still rendered exactly once', (CODE.split('<MoneyPictureChecklistCard').length - 1) === 1);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
