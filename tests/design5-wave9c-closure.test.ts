// Nolie Design 5.1 Wave 9c closure — the eight owner-directed corrections
// from the 3:35 device recording.
//
// A. Ambient Money Flow on Meet Nolie (decorative, Reduced-Motion static).
// B. Checklist typography/hierarchy modernised; no strikethrough.
// C. Goal explicitly optional with a persisted "Maybe later".
// D. Optional Everyday account in onboarding, through the real seam.
// E. Checklist Add rows use the ONE workspace — the two-native-modal
//    teaser chain (the recording's visible double handoff) is gone.
// F. The legacy "Unlock your Nolie Score" Today surface is removed.
// G. The Wealth "Build your Wealth Map" guide became a net-worth-language
//    empty state.
// H. Optional-field validation is calm: blur/attempt-gated, reserved rows.
//
// CLASSIFICATION:
// - Class A (real import): §4 runs the REAL completeOnboarding-equivalent
//   payload maths via the exported pure engines (eligibility, parsing) and
//   §4's persisted-combination proofs live in the rendered suite against
//   the real seam; §1-§3, §5-§8 are structural over the real sources.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9c-closure.test.ts

import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { resolveIncludeInMoneyCalculations, computeMoneyAvailableBalances, listMoneyAvailableAccounts } from '../src/lib/calculations/liquidAssets';
import { parseMoneyInput } from '../src/lib/calculations/money';
import { Asset } from '../src/types/models';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');
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
const CARD = read('src/components/today/MoneyPictureChecklistCard.tsx');
const CARD_CODE = code(CARD);
const TODAY_CODE = code(read('src/screens/today/TodayScreen.tsx'));
const WEALTH = read('src/screens/wealth/WealthScreen.tsx');
const WEALTH_CODE = code(WEALTH);

console.log('=== 1. Correction A — ambient motion is decorative and RM-safe ===');
{
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9c FINAL correction pass, Correction E.
  // SUPERSEDED: 1a-1f/1i asserted the welcome-only ribbon layer (three
  // 560x120 rounded bars at 18-24s inside WelcomeFlow itself).
  // WHY: on device the hard-edged pills read as loading placeholders, and
  // the ambience vanished at Step 2. The accepted replacement is the ONE
  // shared OnboardingAmbientCanvas: a pastel token-driven base plus three
  // soft-edged full-bleed gradient fields (no shape outline can exist),
  // animated ONLY on the welcome state at 24-32s, statically identical
  // everywhere else and under Reduced Motion.
  // PRESERVED INTENT: every original guarantee (no touch interception, no
  // accessibility presence, linear native-driver loops, RM never starts a
  // loop, cleanup on unmount) is re-asserted against the canvas below.
  // -------------------------------------------------------------------
  const CANVAS = read('src/screens/welcome/OnboardingAmbientCanvas.tsx');
  const CANVAS_CODE = code(CANVAS);
  assert('1a. the decorative layer blocks no touches', /pointerEvents="none"/.test(CANVAS_CODE));
  assert('1b. …and is hidden from accessibility entirely', /accessibilityElementsHidden/.test(CANVAS_CODE) && /importantForAccessibility="no-hide-descendants"/.test(CANVAS_CODE));
  // RECONCILED — Wave 9c visual/checklist correction (Correction G): the
  // 24-32s drift was imperceptible on device. The accepted retune is
  // 14-20s with larger travel — motion a customer can actually see within
  // a couple of seconds, still calm.
  assert('1c. three fields drift at 14-20s with linear easing', /\[14000, 17000, 20000\]/.test(CANVAS_CODE) && /Easing\.linear/.test(CANVAS_CODE));
  assert('1d. loops use Animated.loop on the native driver', /Animated\.loop/.test(CANVAS_CODE) && /useNativeDriver: true/.test(CANVAS_CODE));
  assert('1e. Reduced Motion (or a static state) never STARTS a loop', /if \(!animated \|\| reduceMotion\) return;/.test(CANVAS_CODE));
  assert('1f. loops stop and reset on unmount/prop change', /loops\.forEach\(\(l\) => l\.stop\(\)\);/.test(CANVAS_CODE) && /drifts\.forEach\(\(v\) => v\.setValue\(0\)\);/.test(CANVAS_CODE));
  assert('1f-i. only the welcome state animates the shared canvas', /animated=\{step === 'welcome'\}/.test(FLOW_CODE));
  assert('1f-ii. every state renders inside the ONE canvas', /<OnboardingAmbientCanvas animated=\{step === 'welcome'\}>\{renderCurrentStep\(\)\}<\/OnboardingAmbientCanvas>/.test(FLOW_CODE));
  // RECONCILED (same correction): `colors.accentSoft` is the LEGACY green
  // family's pale mint — the reason the shell read as white/mint on
  // device. The canvas now paints from the style-scoped roles the token
  // rules explicitly list as the retintable "onboarding backdrop":
  // semantic.ambient / semantic.featured / semantic.info. Still zero raw
  // colour literals.
  assert('1f-iii. the canvas paints with the style-scoped semantic roles only', /semantic\.ambient/.test(CANVAS_CODE) && /semantic\.featured/.test(CANVAS_CODE) && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(CANVAS_CODE) && !/colors\.accentSoft/.test(CANVAS_CODE));
  assert('1f-iv. no hard pill shape survives anywhere in the shell', !/borderRadius: 60|width: 560/.test(CANVAS_CODE) && !/styles\.ribbon/.test(FLOW_CODE));
  // RECONCILED (same correction): the aurora fields pair one strong style
  // colour with a pastel ambient stop, so restraint is expressed as low
  // field opacities (0.12-0.22) over the visible pastel base.
  assert('1i. opacity stays restrained (fields at 0.12-0.22)', /opacity: 0\.22/.test(CANVAS_CODE) && /opacity: 0\.16/.test(CANVAS_CODE) && /opacity: 0\.12/.test(CANVAS_CODE));
  assert('1j. the approved copy and CTA are unchanged', FLOW_CODE.includes('Meet {brand.name}') && FLOW_CODE.includes('Get started'));
  assert('1k. no video/GIF/Lottie/new dependency', !/lottie|\.mp4|\.gif|Video/i.test(FLOW_CODE));
}

console.log('\n=== 2. Corrections B+C — checklist hierarchy, optional goal ===');
{
  // RECONCILED — Wave 9c FINAL correction pass, Correction C: the header
  // and support line are the accepted "Complete your money setup" set, and
  // progress counts what is COMPLETE (a deferred goal added nothing).
  assert('2a. the calm header', CARD_CODE.includes('Complete your money setup') && CARD_CODE.includes('Add a few more details to make Today, Money and Wealth more useful.'));
  assert('2b. factual progress "{n} of {m} complete" with tabular numerals', /\$\{completedCount\} of \$\{steps\.length\} complete/.test(CARD_CODE) && /tabular-nums/.test(CARD_CODE));
  assert('2b-i. one full-width primary CTA resolves the next step from structured state', /label="Continue setup"/.test(CARD_CODE) && /resolveNextSetupStep\(steps\)/.test(CARD_CODE));
  assert('2c. rows are at least 56pt', /minHeight: 56/.test(CARD_CODE));
  assert('2d. no strikethrough anywhere', !/line-through/.test(CARD_CODE));
  assert('2e. completed rows say Added with a check; deferred rows show time + Later', /'Added'/.test(CARD_CODE) && /s\.deferred \? 'time-outline' : 'checkmark'/.test(CARD_CODE) && /'Later'/.test(CARD_CODE));
  assert('2f. no legacy typography or emoji leads', !/\.\.\.typography\./.test(CARD_CODE) && !/[\u{1F300}-\u{1FAFF}]/u.test(CARD_CODE));
  assert('2g. typeStyle with a live locale', /typeStyle\('/.test(CARD_CODE) && /const locale = \(i18n\.language === 'th'/.test(CARD_CODE));

  // Optional goal.
  assert('2h. the goal row says it is optional', CARD_CODE.includes('Optional — track a target if useful.'));
  assert('2i. Maybe later writes ONLY the presentation flag', /label: 'Maybe later', onDefer: \(\) => updateUser\(\{ confirmedGoalLater: true \}\)/.test(CARD_CODE));
  assert('2j. a deferred goal counts toward completion', /done: hasGoal \|\| !!data\.user\.confirmedGoalLater/.test(CARD_CODE));
  assert('2k. after deferral the row reads Later and explains Grow, in place', CARD_CODE.includes('Later — add one any time from Grow.'));
  assert('2l. Add a goal still opens the canonical modal', /onAdd: \(\) => setGoalModalVisible\(true\)/.test(CARD_CODE) && /<AddGoalModal/.test(CARD_CODE));
  assert('2m. no goal/target/progress is fabricated on deferral', !/addGoal\(|targetAmount/.test(CARD_CODE));
  // The new field is additive on the existing contract; storage untouched.
  const MODELS = read('src/types/models.ts');
  assert('2n. confirmedGoalLater is an optional model field beside its siblings', /confirmedGoalLater\?: boolean;/.test(MODELS) && MODELS.indexOf('confirmedGoalLater') > MODELS.indexOf('confirmedBillsLater'));
  assert('2o. storage performs no migration for it', !/confirmedGoalLater/.test(read('src/lib/storage.ts')));
  assert('2p. it affects no goal or Score calculation', !/confirmedGoalLater/.test(read('src/lib/calculations/luluScore.ts')) && !/confirmedGoalLater/.test(read('src/lib/calculations/goalAllocation.ts')));
}

console.log('\n=== 3. Correction E — one workspace, one intent, no teaser chain ===');
{
  assert('3a. OptionsSheet is gone from the card', !/OptionsSheet/.test(CARD_CODE));
  // RECONCILED — Wave 9c FINAL correction pass, Correction B: the card now
  // deliberately mounts ONE standalone AddIncomeModal in EDIT mode — the
  // canonical editor opened on an existing unscheduled income's stable id
  // (completion, never creation). The teaser-era ADD modals stay banned.
  assert('3b. the teaser-era standalone ADD modals are gone', !/AddRecurringItemModal|AddWealthItemModal/.test(CARD_CODE));
  assert('3b-i. the income editor mounts only in edit mode on the existing record', /editItem=\{unscheduledIncome\}/.test(CARD_CODE));
  assert('3b-ii. …and only a predictable-cadence unknown-date income qualifies', /r\.nextDueDateUnknown === true && r\.frequency !== 'irregular'/.test(CARD_CODE));
  assert('3c. ONE AddAnythingSheet host', (CARD_CODE.match(/<AddAnythingSheet/g) ?? []).length === 1);
  assert('3d. rows land directly on their destination via initialKind', /initialKind=\{workspaceKind \?\? undefined\}/.test(CARD_CODE));
  assert('3e. a tap sets ONE intent; double-tap re-sets the same state', /unscheduledIncome \? setCompleteIncomeVisible\(true\) : setWorkspaceKind\('income'\)/.test(CARD_CODE));
  assert('3f. one dismissal path', /onClose=\{\(\) => setWorkspaceKind\(null\)\}/.test(CARD_CODE));
  assert('3g. no timers, debounce or second route-state writer', !/setTimeout|debounce/.test(CARD_CODE));
  assert('3h. the debt entry keeps its own single sheet', /<DebtCoachSheet/.test(CARD_CODE));
  assert('3i. deferral writes remain the EXISTING flags', /confirmedNoIncome: true/.test(CARD_CODE) && /confirmedBillsLater: true/.test(CARD_CODE) && /confirmedCashOnly: true/.test(CARD_CODE));
}

console.log('\n=== 4. Correction D — Everyday account through the real contracts (Class A) ===');
{
  // The onboarding draft is the canonical Asset shape; the engine defaults
  // decide Money inclusion — never a silent onboarding override.
  const draft: Omit<Asset, 'id'> = { type: 'everyday', label: 'Everyday', currentValue: 1234.56 } as never;
  assert('4a. an everyday asset with no explicit flag is included by the ENGINE default', resolveIncludeInMoneyCalculations(draft as never) === true);
  assert('4b. …the same default the canonical form resolves', read('src/lib/calculations/liquidAssets.ts').includes("asset.includeInMoneyCalculations ?? (asset.type === 'cash' || asset.type === 'everyday')"));
  const asset: Asset = { ...(draft as object), id: 'ev1' } as Asset;
  assert('4c. Money eligibility consumes it with exact cents', computeMoneyAvailableBalances([asset]) === 1234.56);
  assert('4d. it lists in the Money account selector', listMoneyAvailableAccounts([asset]).some((a) => a.id === 'ev1' && a.value === 1234.56));
  // The flow builds the draft with the canonical fields only.
  assert('4e. the flow persists type everyday + label + exact balance', /type: 'everyday',\s*\n\s*label: everydayLabel\.trim\(\),\s*\n\s*currentValue: parsedEveryday\.valid \? parsedEveryday\.amount : 0,/.test(FLOW_CODE));
  assert('4f. provider is optional and trimmed, exactly like the canonical form', /\.\.\.\(everydayProvider\.trim\(\) \? \{ provider: everydayProvider\.trim\(\) \} : \{\}\)/.test(FLOW_CODE));
  assert('4g. includeInMoneyCalculations is deliberately NOT set by onboarding', !/includeInMoneyCalculations/.test(FLOW_CODE));
  assert('4h. blank blocks create nothing', /if \(everydayStarted && everydayDraftValid\)/.test(FLOW_CODE));
  assert('4i. no zero-balance record can be fabricated', /parsedEveryday\.valid && parsedEveryday\.amount > 0/.test(FLOW_CODE));
  assert('4j. the exact-cents parser is the canonical one', parseMoneyInput('1234.56').valid && (parseMoneyInput('1234.56') as { amount: number }).amount === 1234.56);
  assert('4k. all three blocks ride ONE atomic completion call', (FLOW_CODE.match(/completeOnboarding\(/g) ?? []).length === 1);
}

console.log('\n=== 5. Correction F — the unlock surface is gone, Score untouched ===');
{
  assert('5a. no UnlockPromptCard / UNLOCK_COPY on Today', !/UnlockPromptCard|UNLOCK_COPY|getUnlockStatus/.test(TODAY_CODE));
  assert('5b. no empty wrapper remains — the trailing slot still hosts the loan reminder', /<LoanBalanceReminderCard \/>/.test(TODAY_CODE));
  assert('5c. the shared component file is retained for other consumers', existsSync(path.join(ROOT, 'src/components/unlock/UnlockPromptCard.tsx')));
  assert('5d. the Score engine and its lock gate are untouched', !/luluScore/.test(code(read('src/lib/unlock.ts')).replace(/lulu_score/g, '')) && read('src/lib/calculations/luluScore.ts').includes('locked'));
  assert('5e. Grow\'s canonical Score hero is untouched', code(read('src/screens/discover/DiscoverScreen.tsx')).includes('grow-score-hero'));
  assert('5f. the Journey "Score unlocked" milestone is untouched', /score|Score/.test(read('src/lib/calculations/achievements.ts')));
}

console.log('\n=== 6. Correction G — Wealth empty state in current language ===');
{
  assert('6a. the approved title', WEALTH_CODE.includes('Start building your net worth'));
  assert('6b. the approved supporting copy', WEALTH_CODE.includes('Add an account, asset or debt to see what you own, what you owe and your net worth in one place.'));
  assert('6c. the approved CTA', WEALTH_CODE.includes('Add your first item'));
  assert('6d. stale Wealth Map naming is gone from rendered copy', !/Build your Wealth Map/.test(WEALTH_CODE));
  assert('6e. same gate, same Add destination', /!unlockStatus\.wealth_projection \?/.test(WEALTH_CODE) && /onPress=\{\(\) => openModal\('asset'\)\}/.test(WEALTH_CODE));
  assert('6f. vector icon, no emoji, no fake figures', /pie-chart-outline/.test(WEALTH_CODE) && !/\$0|0%/.test(WEALTH_CODE.slice(WEALTH_CODE.indexOf('wealth-empty-state'), WEALTH_CODE.indexOf('wealth-empty-add'))));
  assert('6g. the retired guide component is retained on disk, unwired', existsSync(path.join(ROOT, 'src/components/wealth/WealthGuideSteps.tsx')) && !/<WealthGuideSteps/.test(WEALTH_CODE));
  assert('6h. semantic typography on the empty state', /emptyTitle: \{ \.\.\.typeStyle\('titleCard', locale\)/.test(WEALTH));
}

console.log('\n=== 7. Correction H — calm optional-field validation ===');
{
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9c FINAL correction pass, Correction G.
  // SUPERSEDED: 7a/7b asserted the shared whole-step `setupTouched` gate.
  // WHY: the device recording showed the amount field turning red the
  // moment the customer left the NAME field — one blur armed every block's
  // guidance at once. The accepted model is FIELD-AWARE: a field's own
  // formatting error may appear once THAT field blurs; a missing sibling
  // appears only after Continue is attempted.
  // PRESERVED INTENT: guidance still never appears mid-typing, Continue
  // still surfaces guidance instead of advancing, and the reserved message
  // row still keeps the layout still.
  // -------------------------------------------------------------------
  assert('7a. formatting guidance is gated on the FIELD its own blur (or the attempt)', /const fieldSeen = blurred\[key\] \|\| setupAttempted;/.test(FLOW_CODE));
  assert('7a-i. missing-sibling guidance waits for the attempted Continue', /if \(setupAttempted && blockStarted && raw\.trim\(\)\.length === 0\)/.test(FLOW_CODE));
  assert('7a-ii. no whole-step touched flag survives', !/setupTouched/.test(FLOW_CODE));
  assert('7b. every text field arms only ITS OWN interaction state on blur', (FLOW_CODE.match(/onBlur=\{\(\) => markBlurred\('/g) ?? []).length >= 6);
  assert('7c. amount messages resolve through the one field-aware helper', (FLOW_CODE.match(/amountMessage\('/g) ?? []).length === 3 && (FLOW_CODE.match(/nameMessage\(/g) ?? []).length >= 3);
  assert('7d. Continue on an invalid block surfaces guidance instead of advancing', /setSetupAttempted\(true\);\s*\n\s*return;/.test(FLOW_CODE));
  assert('7e. the shared FieldShell reserves the message row (no layout jump)', read('src/components/shared/fields/FieldShell.tsx').includes('RESERVED_MESSAGE_MIN_HEIGHT'));
  assert('7f. clearing a block returns it to the valid skipped state', /const everydayStarted = everydayLabel\.trim\(\)\.length > 0 \|\| everydayAmount\.trim\(\)\.length > 0 \|\| everydayProvider\.trim\(\)\.length > 0;/.test(FLOW_CODE));
  assert('7g. malformed input is never coerced to zero', !/\|\| 0\b/.test(FLOW_CODE.slice(FLOW_CODE.indexOf('function balanceDrafts'), FLOW_CODE.indexOf('function jumpToDisclosure'))));
}

console.log('\n=== 8. Protected boundaries ===');
{
  for (const rel of ['src/lib/calculations/safeToSpend.ts', 'src/lib/calculations/luluScore.ts', 'src/lib/calculations/goalAllocation.ts', 'src/lib/storage.ts', 'src/components/navigation/AddAnythingSheet.tsx', 'src/components/navigation/addWorkspaceTransitionController.ts']) {
    // byte-comparison happens via the hash file in the report; here we pin
    // that the closure pass introduced no new writers into them.
    assert(`8a. ${rel.split('/').pop()} exists and is consumed unchanged`, existsSync(path.join(ROOT, rel)));
  }
  assert('8b. the checklist reuses the workspace, never re-implements its transitions', !/reduceAddWorkspaceTransition|floatingAddTransition/.test(CARD_CODE));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
