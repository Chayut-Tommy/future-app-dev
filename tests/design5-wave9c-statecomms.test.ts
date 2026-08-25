// Nolie Design 5.1 Wave 9c — state-communication corrections:
// A. the Everyday-account save toast announced "Added First Asset";
// B. Today's compact Journey row read "Created First Goal" after the
//    customer explicitly chose Maybe later, with zero goals recorded.
//
// ROOT CAUSES, verified in source and against the real engines below:
// A. `added_first_asset` unlocks on `data.assets.length > 0` — every
//    account lives in the Asset collection — and TodayScreen's unlock
//    effect toasts the achievement's FIXED title. The engine was right;
//    the toast copy was untruthful for an Everyday ACCOUNT.
// B. `created_first_goal` was correctly LOCKED (`data.goals.length > 0`);
//    the compact Journey row renders the NEXT (first locked) achievement,
//    and its fixed past-tense title carried no upcoming-state qualifier.
//    Structured state right; presentation tense wrong.
//
// CLASSIFICATION: §1/§2 Class A (real resolver, real achievements engine,
// real snapshot); §3-§5 Class C structural over the real sources
// (comment-stripped). Runtime proof lives in the rendered suite.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9c-statecomms.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { resolveFirstAssetCelebrationCopy } from '../src/lib/celebrations';
import { computeAchievements } from '../src/lib/calculations/achievements';
import { computeJourneySnapshot, upcomingMilestoneTitle } from '../src/lib/calculations/journeySnapshot';
import { computeWealthPaths } from '../src/lib/calculations/wealthJourney';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData, Asset, AssetType } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const TODAY = code(read('src/screens/today/TodayScreen.tsx'));
const SNAPSHOT_CARD = code(read('src/components/today/TodayJourneySnapshotCard.tsx'));
const TIMELINE = code(read('src/components/health/JourneyTimeline.tsx'));
const ACHIEVEMENTS_SRC = read('src/lib/calculations/achievements.ts');

const of = (types: AssetType[]) => types.map((type, i) => ({ id: `a${i}`, type, label: type, currentValue: 100 }) as Asset);

console.log('=== 1. Correction A — the first-asset toast tells the truth (Class A) ===');
{
  // The matrix: account-only collections with an Everyday account get the
  // account copy; anything with a genuine wealth asset keeps the
  // achievement's own truthful copy (null = no override).
  const everydayOnly = resolveFirstAssetCelebrationCopy(of(['everyday']));
  assert('1a. an Everyday account resolves the account-specific copy', everydayOnly !== null);
  assert('1b. …titled exactly "Everyday account added"', everydayOnly?.title === 'Everyday account added');
  assert('1c. …with the factual supporting copy', everydayOnly?.body === 'Nolie can now use this account in your money picture.');
  assert('1d. …and never the asset wording', everydayOnly?.title !== 'Added First Asset');
  assert('1e. a savings-only collection is NOT overridden (its own added_savings confirms it)', resolveFirstAssetCelebrationCopy(of(['savings'])) === null);
  assert('1f. a cash-only collection is not overridden', resolveFirstAssetCelebrationCopy(of(['cash'])) === null);
  assert('1g. a vehicle keeps the truthful asset copy', resolveFirstAssetCelebrationCopy(of(['car'])) === null);
  assert('1h. everyday + a genuine asset keeps the truthful asset copy', resolveFirstAssetCelebrationCopy(of(['everyday', 'car'])) === null);
  assert('1i. an empty collection resolves nothing', resolveFirstAssetCelebrationCopy([]) === null);
  assert('1j. the resolver reads STRUCTURED types via the shared checklist predicates', /hasEverydayAccount\(assets\) && !hasWealthAsset\(assets\)/.test(code(read('src/lib/celebrations.ts'))));

  // Wiring: applied ONLY to added_first_asset, at the one existing boundary.
  assert('1k. TodayScreen resolves the copy only for added_first_asset', /newlyUnlocked\.id === 'added_first_asset' \? resolveFirstAssetCelebrationCopy\(data\.assets\) : null/.test(TODAY));
  assert('1l. the celebration keeps its id, tier and seen-tracking byte-identical', /id: newlyUnlocked\.id,/.test(TODAY) && /tier: isBig \? 'big' : 'small',/.test(TODAY) && /markAchievementsSeen\(\[newlyUnlocked\.id\]\);/.test(TODAY));
  assert('1m. every other achievement keeps its own copy (fallbacks to the achievement)', /firstAssetCopy\?\.title \?\? newlyUnlocked\.title/.test(TODAY) && /firstAssetCopy\?\.body \?\? newlyUnlocked\.subtitle/.test(TODAY));

  // The ENGINE is untouched: unlock rules byte-identical.
  assert('1n. added_first_asset still unlocks on the same structured rule', ACHIEVEMENTS_SRC.includes("{ id: 'added_first_asset', icon: 'briefcase-outline', title: 'Added First Asset', subtitle: `${brand.name} can see more of your financial picture.`, unlocked: data.assets.length > 0 },"));
  assert('1o. added_savings keeps its savings-specific confirmation', ACHIEVEMENTS_SRC.includes("{ id: 'added_savings', icon: 'wallet', title: 'Added Savings', subtitle: 'Started tracking your cash.', unlocked: data.assets.some((a) => a.type === 'cash' || a.type === 'savings') },"));

  // Behavioural: the unlock itself is unchanged for every entry type.
  const base = createEmptyAppData();
  const withEveryday: AppData = { ...base, assets: of(['everyday']) };
  const withCar: AppData = { ...base, assets: of(['car']) };
  const firstAsset = (d: AppData) => computeAchievements(d).find((a) => a.id === 'added_first_asset')!;
  assert('1p. an everyday account still unlocks the milestone (engine unchanged)', firstAsset(withEveryday).unlocked === true);
  assert('1q. a vehicle still unlocks it identically', firstAsset(withCar).unlocked === true);
  assert('1r. the achievement record itself keeps its fixed title in the Journey', firstAsset(withEveryday).title === 'Added First Asset');
}

console.log('\n=== 2. Correction B — the upcoming goal milestone, Class A against the real engines ===');
{
  assert("2a. the shared resolver maps ONLY the goal milestone's tense", upcomingMilestoneTitle({ id: 'created_first_goal', title: 'Created First Goal' }) === 'Create your first goal');
  assert('2b. every other milestone passes through untouched', upcomingMilestoneTitle({ id: 'added_income', title: 'Added Income' }) === 'Added Income' && upcomingMilestoneTitle({ id: 'saved_1000', title: 'Saved First $1,000' }) === 'Saved First $1,000');

  // The owner's exact device state: income + everyday recorded, goal
  // explicitly deferred — zero goals.
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 5417;
  d.user.confirmedGoalLater = true;
  d.assets = of(['everyday']);
  const achievements = computeAchievements(d);
  const goalMilestones = achievements.filter((a) => a.id === 'created_first_goal');
  assert('2c. the engine holds the goal milestone LOCKED with zero goals', goalMilestones.length === 1 && goalMilestones[0].unlocked === false);
  assert('2d. deferral does not unlock it — a flag is not a goal', d.goals.length === 0);
  const snapshot = computeJourneySnapshot(achievements);
  assert('2e. the compact snapshot\'s NEXT is exactly that locked milestone', snapshot.next?.id === 'created_first_goal');
  assert('2f. …whose upcoming presentation reads "Create your first goal"', upcomingMilestoneTitle(snapshot.next!) === 'Create your first goal');
  assert('2g. …and the achieved wording never appears while goals are empty', upcomingMilestoneTitle(snapshot.next!) !== 'Created First Goal');

  // Saving one real goal flips it to achieved — exactly once.
  const withGoal: AppData = { ...d, goals: [{ id: 'g1', name: 'Trip', targetAmount: 1000, currentAmount: 0, status: 'active' } as never] };
  const after = computeAchievements(withGoal).filter((a) => a.id === 'created_first_goal');
  assert('2h. one real goal achieves the milestone', after.length === 1 && after[0].unlocked === true);
  assert('2i. the achieved/history wording is the achievement\'s own, once', after[0].title === 'Created First Goal' && upcomingMilestoneTitle(after[0]) === 'Create your first goal');
  assert('2j. restart-shaped data cannot fabricate a goal: unlock derives ONLY from data.goals', ACHIEVEMENTS_SRC.includes("{ id: 'created_first_goal', icon: 'flag', title: 'Created First Goal', subtitle: `A clear target for ${brand.name} to track.`, unlocked: data.goals.length > 0 },"));

  // Grow's Money Path stage still reads the same canonical engine state.
  const foundation = computeWealthPaths(d).find((p) => p.key === 'foundation')!;
  const stage = foundation.stages.find((s) => s.id === 'goal')!;
  assert('2k. the Wealth journey stage stays honestly un-done with zero goals', stage.done === false);
}

console.log('\n=== 3. ONE shared presentation, consumed by both surfaces ===');
{
  assert('3a. the resolver lives once, in the snapshot presentation layer', /export function upcomingMilestoneTitle/.test(read('src/lib/calculations/journeySnapshot.ts')));
  assert('3b. Today\'s compact row consumes it', /upcomingMilestoneTitle\(snapshot\.next\)/.test(SNAPSHOT_CARD) && /from '\.\.\/\.\.\/lib\/calculations\/journeySnapshot'/.test(SNAPSHOT_CARD));
  assert('3c. …under the "Next milestone" context, never a bare past-tense record', SNAPSHOT_CARD.includes("'Next milestone'") && /contextLine/.test(SNAPSHOT_CARD));
  assert('3d. Grow\'s timeline consumes the SAME resolver for not-yet-achieved entries', /a\.unlocked \? a\.title : upcomingMilestoneTitle\(a\)/.test(TIMELINE));
  assert('3e. …so achieved history keeps its own wording there too', /a\.unlocked \? a\.title/.test(TIMELINE));
  assert('3f. the condition is duplicated NOWHERE: no local goal-tense branch in either surface', !/Create your first goal/.test(SNAPSHOT_CARD) && !/Create your first goal/.test(TIMELINE));
  assert('3g. the upcoming/achieved DISTINCTION in Grow stays structural (unlocked flag + NEXT UP badge)', /NEXT UP/.test(TIMELINE) && /a\.unlocked \|\| isNext/.test(TIMELINE));
  assert('3h. neither surface recomputes achievements or unlock rules', !/computeAchievements/.test(SNAPSHOT_CARD) && !/computeAchievements/.test(TIMELINE));
}

console.log('\n=== 4. The goal journey around the milestone is untouched ===');
{
  const CARD = code(read('src/components/today/MoneyPictureChecklistCard.tsx'));
  assert('4a. Maybe later still writes ONLY the presentation flag', /label: 'Maybe later', onDefer: \(\) => updateUser\(\{ confirmedGoalLater: true \}\)/.test(CARD));
  assert('4b. the goal step stays optional and last', /'Optional — track a target if useful\.'/.test(CARD));
  assert('4c. Settings\' goals row still reads the real collection with its calm empty state', /'No active goals yet'/.test(code(read('src/screens/settings/SettingsScreen.tsx'))));
  assert('4d. goal creation still routes through the canonical AddGoalModal', /AddGoalModal visible=\{goalModalVisible\}/.test(CARD));
}

console.log('\n=== 5. Protected engines — nothing financial moved ===');
{
  assert('5a. the achievements engine gained no new import and no rule change', !/upcomingMilestoneTitle|resolveFirstAssetCelebrationCopy|setupChecklist/.test(ACHIEVEMENTS_SRC));
  assert('5b. the journey snapshot computation itself is unchanged', /const nextIndex = achievements\.findIndex\(\(a\) => !a\.unlocked\);/.test(read('src/lib/calculations/journeySnapshot.ts')));
  assert('5c. the Wealth journey engine keeps its own stage list untouched', read('src/lib/calculations/wealthJourney.ts').includes("{ id: 'goal', emoji: '🎯', label: 'Created first goal', done: byId('created_first_goal') },"));
  assert('5d. the Score engine references neither new resolver', !/upcomingMilestoneTitle|resolveFirstAssetCelebrationCopy/.test(read('src/lib/calculations/luluScore.ts')));
  assert('5e. storage performs no related migration', !/created_first_goal|added_first_asset/.test(read('src/lib/storage.ts')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
