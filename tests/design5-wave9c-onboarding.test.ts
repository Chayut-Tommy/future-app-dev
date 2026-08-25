// Nolie Design 5.1 Wave 9c — the onboarding rebuild's pure contract.
//
// WHY. The previous flow's journey lived implicitly in a component union,
// which let two structural defects ship: a "Skip for now" on the NAME step
// that completed onboarding outright, and a shared user-patch builder that
// stamped `disclosureAcknowledgedAt` on every exit path — recording consent
// to a disclosure the customer never saw. The journey is now a pure,
// exported contract (lib/onboardingFlow.ts) that this suite runs directly.
//
// CLASSIFICATION:
// - Class A (real import): §1-§4 run the real pure contract.
// - Class C (structural): §5-§9 read the real sources — retirements, the
//   consent seam, the disclosure template, and the legacy consumers.
// The mounted journey, atomic persistence, failure and Retry live in
// tests/rendered/design5-wave9c-onboarding.render.test.tsx.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9c-onboarding.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  COMPLETION_FAILURE_COPY,
  ONBOARDING_CADENCES,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  OnboardingStep,
  PREVIEW_COPY,
  SKIPPABLE_STEPS,
  canSkip,
  isAcceptableAgeInput,
  isValidName,
  nextStep,
  parseOptionalAge,
  previousStep,
  progressLabel,
  skipDestination,
  stepIndex,
} from '../src/lib/onboardingFlow';

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

const FLOW = read('src/screens/welcome/WelcomeFlow.tsx');
const FLOW_CODE = code(FLOW);

console.log('=== 1. Exactly seven states, indexed 0-6 (Class A) ===');
{
  assert('1a. exactly seven states', ONBOARDING_STEP_COUNT === 7 && ONBOARDING_STEPS.length === 7);
  assert('1b. in the canonical order', ONBOARDING_STEPS.join('|') === 'welcome|preview|name|age|cadence|setup|disclosure');
  ONBOARDING_STEPS.forEach((s, i) => assert(`1c. state ${i} is '${s}' at index ${i}`, stepIndex(s) === i));
  assert('1d. no obsolete goal/confidence/persona state exists', !ONBOARDING_STEPS.some((s) => /goal|confiden|persona/i.test(s)));
  assert('1e. the disclosure is the terminal state', nextStep('disclosure') === 'disclosure');
  assert('1f. forward order is linear welcome→…→disclosure', ONBOARDING_STEPS.slice(0, -1).every((s, i) => nextStep(s) === ONBOARDING_STEPS[i + 1]));
  assert('1g. Back is linear with welcome as the floor', previousStep('welcome') === 'welcome' && ONBOARDING_STEPS.slice(1).every((s, i) => previousStep(s) === ONBOARDING_STEPS[i]));
}

console.log('\n=== 2. Skip routing: ONE shared destination, states 3-5 only (Class A) ===');
{
  assert('2a. exactly the three optional questions may skip', SKIPPABLE_STEPS.join('|') === 'age|cadence|setup');
  for (const s of ['age', 'cadence', 'setup'] as OnboardingStep[]) {
    assert(`2b. Skip from '${s}' goes DIRECTLY to the disclosure`, skipDestination(s) === 'disclosure');
    assert(`2c. …never to the next optional question`, skipDestination(s) !== nextStep(s) || nextStep(s) === 'disclosure');
  }
  for (const s of ['welcome', 'preview', 'name', 'disclosure'] as OnboardingStep[]) {
    assert(`2d. '${s}' has NO Skip destination`, skipDestination(s) === null && !canSkip(s));
  }
  assert('2e. the component routes every Skip through the one shared path', /function jumpToDisclosure\(\)/.test(FLOW_CODE) && /onPress=\{jumpToDisclosure\}/.test(FLOW_CODE));
  // One control = its accessibilityLabel plus its visible Text — 2 in code.
  assert('2f. exactly one Skip control definition exists', (FLOW_CODE.match(/Skip for now/g) ?? []).length === 2 && (FLOW_CODE.match(/onPress=\{jumpToDisclosure\}/g) ?? []).length === 1);
  assert('2g. the disclosure state renders no Skip', !/disclosure[\s\S]*Skip for now/.test(FLOW_CODE.slice(FLOW_CODE.indexOf("'Before you get started'"))));
}

console.log('\n=== 3. Progress is truthful (Class A) ===');
{
  ONBOARDING_STEPS.forEach((s, i) => assert(`3a. '${s}' announces "Step ${i + 1} of 7"`, progressLabel(s) === `Step ${i + 1} of 7`));
}

console.log('\n=== 4. Field rules: required name, optional-never-defaulted age (Class A) ===');
{
  assert('4a. empty name is invalid', !isValidName('') && !isValidName('   '));
  assert('4b. a real name is valid', isValidName('Jamie') && isValidName('  Jamie '));
  assert('4c. empty age is acceptable (optional)', isAcceptableAgeInput('') && isAcceptableAgeInput('  '));
  assert('4d. an empty age parses to ABSENT, never zero', parseOptionalAge('') === undefined);
  assert('4e. zero and negatives are rejected, not stored', parseOptionalAge('0') === undefined && parseOptionalAge('-3') === undefined);
  assert('4f. junk is rejected, not stored', parseOptionalAge('abc') === undefined);
  assert('4g. a junk entry blocks Continue rather than being dropped', !isAcceptableAgeInput('abc') && !isAcceptableAgeInput('0'));
  assert('4h. a valid age parses exactly (EditProfileModal contract)', parseOptionalAge('34') === 34 && parseOptionalAge(' 34 ') === 34);
  // Cadence: the exact established enum and labels.
  assert('4i. the cadence set is the established PayFrequency enum', ONBOARDING_CADENCES.map((c) => c.value).join('|') === 'weekly|fortnightly|monthly|irregular');
  assert('4j. …with the established labels', ONBOARDING_CADENCES.map((c) => c.label).join('|') === 'Weekly|Fortnightly|Monthly|Irregular recurring');
  const ADD_INCOME = read('src/components/income/AddIncomeModal.tsx');
  for (const c of ONBOARDING_CADENCES) {
    assert(`4k. label "${c.label}" matches AddIncomeModal's own`, ADD_INCOME.includes(`{ value: '${c.value}', label: '${c.label}' }`));
  }
}

console.log('\n=== 5. Retired questions are GONE from onboarding (Class C) ===');
{
  for (const banned of ['MoneyGoal', 'ConfidenceLevel', 'moneyGoal', 'confidenceLevel', 'MONEY_GOALS', 'CONFIDENCE_LEVELS', 'moneyPersona', "main money goal", 'How confident do you feel', 'AI Financial Coach', 'Smart Opportunities']) {
    // Comment-stripped: the rebuild's own doc comment names what it
    // removed, in order to explain why.
    assert(`5a. WelcomeFlow contains no "${banned}"`, !FLOW_CODE.includes(banned));
  }
  assert('5b. no emoji-led claims survive', !/[\u{1F300}-\u{1FAFF}]/u.test(FLOW));
  assert('5c. no goal is auto-created from onboarding', !/addGoal\(|goals: \[/.test(FLOW_CODE));
  assert('5d. no substitute preference question was invented', !/prefer|personalise what you see|tone with you/i.test(FLOW_CODE));
  // Legacy fields survive on the model, unmigrated.
  const MODELS = read('src/types/models.ts');
  assert('5e. moneyGoal survives on the model', /moneyGoal\?: MoneyGoal;/.test(MODELS));
  assert('5f. confidenceLevel survives on the model', /confidenceLevel\?: ConfidenceLevel;/.test(MODELS));
  assert('5g. storage performs no profile migration', !/moneyGoal|confidenceLevel|moneyPersona/.test(read('src/lib/storage.ts')));
}

console.log('\n=== 6. Consent is stamped ONLY by the disclosure state (Class C) ===');
{
  assert('6a. disclosureAcknowledgedAt appears exactly once, inside finish()', (FLOW_CODE.match(/disclosureAcknowledgedAt/g) ?? []).length === 1);
  const finishBody = FLOW_CODE.slice(FLOW_CODE.indexOf('async function finish()'), FLOW_CODE.indexOf('const styles'));
  assert('6b. …and that once is the atomic completion payload', /disclosureAcknowledgedAt: new Date\(\)\.toISOString\(\)/.test(finishBody));
  assert('6c. finish refuses without acknowledgement', /if \(inFlightRef\.current \|\| !acknowledged\) return;/.test(finishBody));
  assert('6d. no other completeOnboarding call exists', (FLOW_CODE.match(/completeOnboarding\(/g) ?? []).length === 1);
  assert('6e. consent is never preselected', /useState\(false\)/.test(FLOW_CODE.slice(FLOW_CODE.indexOf('acknowledged'))) || /\[acknowledged, setAcknowledged\] = useState\(false\)/.test(FLOW_CODE));
  assert('6f. the checkbox is a real checkbox with truthful state', FLOW_CODE.includes('accessibilityRole="checkbox"') && /accessibilityState=\{\{ checked: acknowledged \}\}/.test(FLOW_CODE));
  assert('6g. the completion CTA is disabled until checked', /disabled=\{!acknowledged \|\| isSubmitting\}/.test(FLOW_CODE));
  assert('6h. label and box are ONE control', (FLOW_CODE.match(/accessibilityRole="checkbox"/g) ?? []).length === 1);
}

console.log('\n=== 7. The disclosure wording is byte-for-byte identical (Class C) ===');
{
  // The legally blocked template, captured from the pre-rebuild source at
  // baseline ae9073c. `brand.name` still interpolates the same way.
  const FROZEN = '`${brand.name} provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.`';
  assert('7a. the template string is byte-identical', FLOW.includes(FROZEN));
  assert('7b. it is exported for the rendered byte-identity proof', /export const DISCLOSURE_TEXT/.test(FLOW));
  assert('7c. brand.name still resolves to Nolie', read('src/lib/brand.ts').includes("name: 'Nolie'"));
}

console.log('\n=== 8. Atomic completion seam (Class C — behaviour proven rendered) ===');
{
  const CTX = read('src/state/AppStateContext.tsx');
  const impl = CTX.slice(CTX.indexOf('const completeOnboarding = useCallback'), CTX.indexOf('const addCreditCard'));
  assert('8a. the seam is WRITE-FIRST: saveAppData awaited before commitData', impl.indexOf('await write') < impl.indexOf('commitData(') && impl.includes('const write = saveAppData('));
  assert('8b. it returns the persistence promise', /Promise<void>/.test(impl));
  assert('8c. optional income drafts ride the same single operation', /incomeItems\.map\(/.test(impl));
  assert('8d. …with the exact addRecurringItem persistence shape', /resolveScheduleAnchorDay\(null, item\)/.test(impl) && /id: generateId\(\)/.test(impl));
  assert('8e. the ordinary persist() path is untouched (commit-then-write)', /const persist = useCallback\(\s*\(next: AppData\): Promise<void> => \{\s*const withIncome = syncIncomeAggregate\(next\);/.test(CTX));
  // The component side of the contract.
  assert('8f. the failure copy is the approved sentence', COMPLETION_FAILURE_COPY === "We couldn't finish setting up Nolie. Nothing was saved. Try again.");
  assert('8g. failure shows the banner and a Retry, and stays put', FLOW_CODE.includes('onboarding-error-banner') && /completionError \? 'Try again' : 'Finish setup'/.test(FLOW_CODE));
  assert('8h. failure announces once', /announceForAccessibility\(COMPLETION_FAILURE_COPY\)/.test(FLOW_CODE));
  assert('8i. a rapid double-tap is latched by ref, not state alone', /if \(inFlightRef\.current/.test(FLOW_CODE));
  assert('8j. no navigation call exists in the flow — RootNavigator switches on committed state only', !/navigation\.|useNavigation/.test(FLOW_CODE));
  const NAV = read('src/navigation/RootNavigator.tsx');
  assert('8k. RootNavigator still gates on hasSeenIntro → WelcomeFlow (reset returns here)', /if \(!data\.user\.hasSeenIntro\) \{\s*return <WelcomeFlow \/>;/.test(NAV));
}

console.log('\n=== 9. Connected legacy consumers (Class C) ===');
{
  const TODAY = read('src/screens/today/TodayScreen.tsx');
  assert('9a. the profile-trio celebration is retired', !/buildProfileCompleteCelebration/.test(code(TODAY)));
  assert('9b. …and no gate on the retired trio survives', !/moneyGoal && data\.user\.confidenceLevel/.test(code(TODAY)));
  assert('9c. unrelated celebrations survive', /buildSavingCelebration|buildGoalMilestoneCelebration|computeScoreMilestoneCelebration/.test(TODAY));
  assert('9d. …not retargeted at name/age/onboarding', !/celebrate\(buildProfileCompleteCelebration/.test(TODAY));

  const CHECKLIST = code(read('src/components/today/MoneyPictureChecklistCard.tsx'));
  // (Closure pass: the expression was hoisted into `hasGoal` when the row
  // gained its optional/defer presentation — same authoritative source.)
  assert('9e. checklist goal completion reads the REAL goal collection', /const hasGoal = data\.goals\.length > 0;/.test(CHECKLIST) && /done: hasGoal \|\| !!data\.user\.confirmedGoalLater/.test(CHECKLIST));
  assert('9f. …never legacy user.moneyGoal', !/user\.moneyGoal/.test(CHECKLIST));
  assert('9g. the row opens the canonical goal editor', /AddGoalModal/.test(CHECKLIST) && !/EditProfileModal/.test(CHECKLIST));
  assert('9h. no goal is auto-created', !/addGoal\(\{/.test(CHECKLIST));

  const LEARNING = read('src/lib/learningPaths.ts');
  assert('9i. the dead recommendedLearningPath resolver is retired', !/export function recommendedLearningPath/.test(LEARNING));
  assert('9j. …and its GOAL_TO_PATH map with it', !/GOAL_TO_PATH/.test(code(LEARNING)));
  assert('9k. the living learning-path exports survive', /export const LEARNING_PATHS/.test(LEARNING) && /export function learningPathCards/.test(LEARNING));
  assert('9l. no replacement recommendation path was invented', !/recommended/i.test(code(LEARNING)));

  const TODAY_CODE = code(TODAY);
  assert('9m. ProfileNudgeCard remains unwired on Today', !/ProfileNudgeCard/.test(TODAY_CODE));

  const SETTINGS = read('src/screens/settings/SettingsScreen.tsx');
  assert('9n. Settings\' Wave 9b Goals row is unchanged', SETTINGS.includes('testID="settings-goals-row"') && /g\.priority === 'high'/.test(SETTINGS));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
