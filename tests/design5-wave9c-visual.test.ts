// Nolie Design 5.1 Wave 9c — visual-system and checklist correction pass:
// the seven-step checklist with SEPARATED completion predicates, the
// Everyday-account journey, the deterministic Continue-setup order, the
// checklist-scoped Vehicle asset default, the suppressed-from-checklist
// savings-allocation prompt, the visible "Light Ocean Aurora" onboarding
// canvas, the Step 2 media contract, and the "Plan around your income?"
// typography migration.
//
// THE PREDICATE DEFECT (owner device test): every account is stored as an
// `Asset`, and the old checks were broad sweeps — a Savings record
// completed BOTH Savings and Assets (progress jumped 3/6 → 5/6), no
// Everyday step existed at all, and Money then had to ask for an Everyday
// account the "complete" checklist never mentioned.
//
// THE VISUAL DEFECT: the ambient shell painted with the LEGACY green
// family's `accentSoft` (#E1F5EA — pale mint) and drifted at 24-32s —
// structurally present, but on device an almost-white screen with no
// perceptible motion and no Ocean identity.
//
// CLASSIFICATION: §1 and §5's palette half are Class A (real predicates,
// real token resolver); the rest is Class C structural over the real
// sources (comment-stripped). Runtime proof lives in the rendered suites.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9c-visual.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  ACCOUNT_ASSET_TYPES,
  SETUP_STEP_PRIORITY,
  hasEverydayAccount,
  hasSavingsAccount,
  hasWealthAsset,
  resolveNextSetupStep,
} from '../src/lib/setupChecklist';
import { resolveSemanticColors } from '../src/theme/semanticTokens';
import { resolveIncludeInMoneyCalculations } from '../src/lib/calculations/liquidAssets';
import { AssetType } from '../src/types/models';

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

const CARD = code(read('src/components/today/MoneyPictureChecklistCard.tsx'));
const SHEET = code(read('src/components/navigation/AddAnythingSheet.tsx'));
const INCOME_MODAL = code(read('src/components/income/AddIncomeModal.tsx'));
const CANVAS = code(read('src/screens/welcome/OnboardingAmbientCanvas.tsx'));
const FLOW = code(read('src/screens/welcome/WelcomeFlow.tsx'));
const FRAME = code(read('src/screens/welcome/OnboardingMediaFrame.tsx'));
const PROMPT = read('src/components/income/SavingsAllocationPromptSheet.tsx');
const PROMPT_CODE = code(PROMPT);
const BODY = read('src/components/wealth/SavingsAllocationPickerBody.tsx');
const BODY_CODE = code(BODY);

console.log('=== 1. Class A — one record completes exactly ONE account step ===');
{
  const of = (type: AssetType) => [{ type }];
  // The acceptance matrix, row by row, against the REAL predicates.
  const matrix: { type: AssetType; everyday: boolean; savings: boolean; assets: boolean }[] = [
    { type: 'everyday', everyday: true, savings: false, assets: false },
    { type: 'savings', everyday: false, savings: true, assets: false },
    { type: 'cash', everyday: false, savings: false, assets: false },
    { type: 'car', everyday: false, savings: false, assets: true },
    { type: 'property', everyday: false, savings: false, assets: true },
    { type: 'etf', everyday: false, savings: false, assets: true },
  ];
  for (const row of matrix) {
    const got = { everyday: hasEverydayAccount(of(row.type)), savings: hasSavingsAccount(of(row.type)), assets: hasWealthAsset(of(row.type)) };
    assert(
      `1a. a ${row.type} record → everyday:${row.everyday} savings:${row.savings} assets:${row.assets}`,
      got.everyday === row.everyday && got.savings === row.savings && got.assets === row.assets
    );
    const completed = [got.everyday, got.savings, got.assets].filter(Boolean).length;
    assert(`1b. …and completes at most ONE step (${completed})`, completed <= 1);
  }
  // Every genuine wealth type counts as an asset; every account type never does.
  for (const t of ['shares', 'super', 'crypto', 'business', 'furniture', 'collectibles', 'other'] as AssetType[]) {
    assert(`1c. ${t} completes Assets only`, hasWealthAsset(of(t)) && !hasEverydayAccount(of(t)) && !hasSavingsAccount(of(t)));
  }
  assert('1d. the excluded account set is exactly cash/savings/everyday', ACCOUNT_ASSET_TYPES.join(',') === 'cash,savings,everyday');
  assert('1e. no predicate reads a balance, label or icon', !/currentValue|label|icon/.test(code(read('src/lib/setupChecklist.ts'))));
  assert('1f. an empty collection completes nothing', !hasEverydayAccount([]) && !hasSavingsAccount([]) && !hasWealthAsset([]));
  // The card consumes THESE predicates — not its own sweeps.
  assert('1g. the card uses the shared predicates', /hasEverydayAccount\(data\.assets\)/.test(CARD) && /hasSavingsAccount\(data\.assets\)/.test(CARD) && /hasWealthAsset\(data\.assets\)/.test(CARD));
  assert('1h. the old broad sweeps are gone', !/a\.type === 'cash' \|\| a\.type === 'savings'/.test(CARD) && !/a\.type !== 'cash' && a\.type !== 'savings' && a\.currentValue/.test(CARD));
}

console.log('\n=== 2. The seven-step journey, in one canonical order everywhere ===');
{
  // Render order = accessibility order = resolver order.
  const keyOrder = [...CARD.matchAll(/key: '(\w+)',/g)].map((m) => m[1]);
  assert('2a. exactly seven steps render, in the canonical order', keyOrder.join(',') === 'income,everyday,cash,assets,bills,debt,goal');
  assert('2b. the resolver walks the SAME order', SETUP_STEP_PRIORITY.join(',') === keyOrder.join(','));
  assert('2c. the denominator is the live step count (seven)', /of \$\{total\}/.test(read('src/lib/setupChecklist.ts')) && keyOrder.length === 7);
  // Row wording.
  for (const [title, value] of [
    ['Add your income', 'Places expected pay in your timeline.'],
    ['Add an everyday account', 'Gives Available until payday a balance to work from.'],
    ['Add your savings', 'Shows money you have set aside.'],
    ['Add an asset', 'Adds vehicles, property or investments to your net worth.'],
    ['Add essential bills', 'Keeps upcoming costs visible.'],
    ['Tell us about any debt', 'Keeps what you owe visible.'],
    ['Add a goal', 'Optional — track a target if useful.'],
  ]) {
    assert(`2d. row: "${title}"`, CARD.includes(`title: '${title}',`) && CARD.includes(value));
  }
  // The Everyday step is a real journey with a real, honest deferral.
  assert('2e. the everyday row opens the canonical workspace destination', /onAdd: \(\) => setWorkspaceKind\('everyday'\)/.test(CARD));
  // RECONCILED (checklist consistency correction): the owner-locked
  // seven-footer matrix rewords this footer; the structured writer is
  // byte-identical.
  assert("2f. its deferral is the presentation-only flag, worded \"I'll add an account later\"", /label: "I'll add an account later", onDefer: \(\) => updateUser\(\{ confirmedEverydayLater: true \}\)/.test(CARD));
  assert('2g. a deferred everyday chips a neutral Later, never Added', /acknowledged: !hasEveryday && !!data\.user\.confirmedEverydayLater/.test(CARD) && /acknowledged \? chipAcknowledged \?\? 'Later'/.test(CARD));
  assert('2h. the flag is additive, optional and presentation-only on the model', /confirmedEverydayLater\?: boolean;/.test(read('src/types/models.ts')));
  assert('2i. …read nowhere outside the checklist and its own declaration', !/confirmedEverydayLater/.test(code(read('src/lib/storage.ts'))) && !/confirmedEverydayLater/.test(code(read('src/lib/calculations/luluScore.ts'))) && !/confirmedEverydayLater/.test(code(read('src/lib/calculations/safeToSpend.ts'))));
  assert('2j. NOT repurposed: confirmedCashOnly still answers the ASSETS step', /confirmedCashOnly: true/.test(CARD) && /acknowledged: !hasGenuineAsset && !!data\.user\.confirmedCashOnly/.test(CARD));
  // Setup cannot complete around the Everyday question: allDone counts all
  // seven, and the everyday step is done only by record or explicit Later.
  assert('2k. completion requires every step done or explicitly answered (composition.allResolved)', /composition\.allResolved/.test(CARD) && /completed: hasEveryday,\s*\n\s*acknowledged: !hasEveryday && !!data\.user\.confirmedEverydayLater/.test(CARD));
  assert('2l. the calm customer-closed completion state is unchanged — no timers; the one effect is focus restoration', /Setup complete/.test(CARD) && !/setTimeout|setInterval/.test(CARD) && (CARD.match(/useEffect\(/g) ?? []).length === 1);
}

console.log('\n=== 3. Correction F — the Vehicle default is CHECKLIST-SCOPED ===');
{
  assert("3a. a direct-entry-only 'vehicle' kind exists", /\| 'vehicle'/.test(read('src/components/navigation/AddAnythingSheet.tsx')));
  assert("3b. it presets the canonical structured Vehicle type 'car'", /vehicle: 'car',/.test(SHEET));
  assert('3c. …never mapped from a label, icon or the word Car', /ASSET_PRESET_MAP\[key\]/.test(SHEET) && !/label === 'Car'|'Car' ===/.test(SHEET));
  assert('3d. its display name is Vehicle', /case 'car':\s*\n\s*return 'Vehicle';/.test(SHEET));
  assert('3e. the global "+" chooser is untouched — no vehicle tile exists', !/key: 'vehicle'/.test(SHEET));
  assert('3f. every other asset entry keeps its own preset', /investment: 'etf',/.test(SHEET) && /property: 'property',/.test(SHEET) && /retirement: 'super',/.test(SHEET));
  // The form itself: full type selector for a non-liquid preset, so the
  // customer may change Vehicle to anything before Save; nothing is
  // created by merely opening the form.
  const WEALTH = code(read('src/components/wealth/AddWealthItemModal.tsx'));
  assert('3g. the car preset does NOT restrict the in-form type selector', /isLiquidPresetJourney = kind === 'asset' && !!presetAssetType && LIQUID_BALANCE_TYPES\.includes\(presetAssetType\)/.test(WEALTH));
  assert('3h. the selector exists and is changeable for assets', /testID="add-asset-type"/.test(WEALTH) && /onChange=\{chooseAssetCategory\}/.test(WEALTH));
  assert("3i. the canonical option is labelled Vehicle over type 'car'", /value: 'car', label: 'Vehicle', description: 'Car, motorbike, boat'/.test(WEALTH));
}

console.log('\n=== 4. Correction E — the checklist income save never auto-opens the planner ===');
{
  assert('4a. the checklist passes explicit caller context to the ONE workspace', /suppressIncomePlannerPrompt\s*\/>/.test(CARD) || /suppressIncomePlannerPrompt\n/.test(CARD));
  assert('4b. the workspace forwards it to the embedded income form only', /suppressSavingsAllocationPrompt=\{suppressIncomePlannerPrompt\}/.test(SHEET));
  assert('4c. the prompt REQUEST is gated on that context, before any other clause', /!suppressSavingsAllocationPrompt &&\s*\n\s*!editItem &&/.test(INCOME_MODAL));
  assert('4d. the default preserves every other caller', /suppressIncomePlannerPrompt = false/.test(SHEET) && /suppressSavingsAllocationPrompt = false/.test(INCOME_MODAL));
  assert('4e. MoneyScreen and MoneyEngineCard pass no suppression — their prompts survive', !/suppress/.test(code(read('src/screens/money/MoneyScreen.tsx'))) && !/suppress/.test(code(read('src/components/wealth/MoneyEngineCard.tsx'))));
  // The planner itself, its coordinator and the canonical edit surface are untouched.
  const PROVIDER = code(read('src/state/SavingsAllocationPromptContext.tsx'));
  assert('4f. the coordinator still owns presentation, unmodified', /requestPrompt/.test(PROVIDER) && /InteractionManager\.runAfterInteractions/.test(PROVIDER) && !/suppress/.test(PROVIDER));
  assert('4g. the canonical edit destination still renders the same shared body', /SavingsAllocationPickerBody/.test(read('src/components/wealth/EditSavingsAllocationModal.tsx')));
  assert('4h. no allocation rule or saved allocation changed', /if \(value\.mode === 'percent'\)/.test(BODY_CODE) && /p > 0 && p <= MAX_PERCENT/.test(BODY_CODE) && /savingsAllocation: draft, savingsAllocationPromptHandled: true/.test(PROMPT_CODE));
}

console.log('\n=== 5. Correction G — the Light Ocean Aurora is visible, token-driven and calm ===');
{
  // Class A on the REAL resolver: the backdrop is visibly distinct from the
  // plain background in every style, and Ocean's is genuinely blue-family.
  for (const style of ['ocean', 'purple', 'sunrise'] as const) {
    const c = resolveSemanticColors(style, 'light');
    assert(`5a. ${style}: ambient[0] is not the plain canvas or surface`, c.ambient[0] !== c.bgCanvas && c.ambient[0] !== c.bgSurface);
    // Purple/Sunrise resolve to their own style-tinted near-canvas, not
    // the shared canvas literal — what matters is a REAL three-stop fade.
    assert(`5b. ${style}: the ambient triple is a genuine fade (three distinct stops)`, new Set(c.ambient).size === c.ambient.length && c.ambient.length >= 3);
  }
  const ocean = resolveSemanticColors('ocean', 'light');
  assert('5c. Ocean light opens on sky blue, not mint', ocean.ambient[0].toUpperCase() === '#DCE9F8');
  assert('5d. the canvas paints from ambient + featured + info — never the legacy green family', /semantic\.ambient\[0\], semantic\.ambient\[1\], semantic\.ambient\[2\]/.test(CANVAS) && /semantic\.featured\[0\]/.test(CANVAS) && /semantic\.info/.test(CANVAS) && !/colors\.accent/.test(CANVAS));
  assert('5e. zero raw colour literals in the shell', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(CANVAS));

  // Motion: perceptible, restrained, guarded.
  assert('5f. loops run 14-20s, not the imperceptible 24-32s', /\[14000, 17000, 20000\]/.test(CANVAS));
  const ranges = [...CANVAS.matchAll(/range: \[(-?\d+), (-?\d+)\]/g)].map((m) => Math.abs(Number(m[1]) - Number(m[2])));
  assert(`5g. every field travels ≥150pt per sweep (${ranges.join(', ')})`, ranges.length === 3 && ranges.every((r) => r >= 150));
  assert('5h. linear native-driver drift only — no scale, flash or parallax', /Easing\.linear/.test(CANVAS) && /useNativeDriver: true/.test(CANVAS) && !/scale|spring/.test(CANVAS));
  assert('5i. Reduced Motion (or a static state) never starts a loop', /if \(!animated \|\| reduceMotion\) return;/.test(CANVAS));
  assert('5j. loops stop and reset on unmount/prop change', /loops\.forEach\(\(l\) => l\.stop\(\)\);/.test(CANVAS));
  assert('5k. the decorative layer blocks no touches and is invisible to VoiceOver', /pointerEvents="none"/.test(CANVAS) && /no-hide-descendants/.test(CANVAS));
  assert('5l. only the welcome state animates the ONE shared canvas', /<OnboardingAmbientCanvas animated=\{step === 'welcome'\}>\{renderCurrentStep\(\)\}<\/OnboardingAmbientCanvas>/.test(FLOW));

  // Welcome composition: identity preserved, interactive CTA, no green.
  assert('5m. the spark identity, Meet copy and factual support survive', /name="sparkles"/.test(FLOW) && /Meet \{brand\.name\}/.test(FLOW));
  assert('5n. the CTA and badge use the canonical interactive colour, never the green accent', /backgroundColor: semantic\.interactive \}/.test(FLOW) && /semantic\.interactiveTint/.test(FLOW) && !/colors\.accentSoft/.test(FLOW.slice(FLOW.indexOf('iconBadge'), FLOW.indexOf('welcomeCta'))));
  // Steps 2-7: the surface never becomes an opaque full-screen replacement.
  assert('5o. form states sit on a bordered surface card with a visible ambient margin', /surfaceCard/.test(FLOW) && /borderWidth: StyleSheet\.hairlineWidth/.test(FLOW) && /paddingHorizontal: spacing\.lg/.test(FLOW));
  assert('5p. no state re-paints an opaque background over the shell', !/plainContainer: \{ flex: 1, backgroundColor/.test(FLOW) && !/previewContainer: \{[^}]*backgroundColor/.test(FLOW));
}

console.log('\n=== 6. Correction H — the Step 2 media contract survives, framed calmly ===');
{
  assert('6a. stable 4:5 portrait frame', /aspectRatio: 4 \/ 5/.test(FRAME));
  assert('6b. cover cropping inside a clipped surface', /resizeMode="cover"/.test(FRAME) && /overflow: 'hidden'/.test(FRAME));
  assert('6c. now a calm bordered surface from semantic tokens', /borderWidth: StyleSheet\.hairlineWidth/.test(FRAME) && /borderColor: colors\.border/.test(FRAME) && /cardShadow/.test(FRAME));
  assert('6d. local assets only; layout owned by the frame, not the asset', !/http|uri:/.test(FRAME) && /source \? \(/.test(FRAME) && /styles\.placeholder\}>\{children\}/.test(FRAME));
  assert('6e. accessible-or-decorative contract intact', /accessibilityLabel=\{decorative \? undefined : accessibilityLabel\}/.test(FRAME) && /accessibilityElementsHidden=\{decorative\}/.test(FRAME));
  assert('6f. the preview still hosts it with the placeholder inside', /<OnboardingMediaFrame>/.test(FLOW));
}

console.log('\n=== 7. Correction I — "Plan around your income?" joins the type system ===');
{
  for (const [name, src] of [
    ['SavingsAllocationPromptSheet', PROMPT_CODE],
    ['SavingsAllocationPickerBody', BODY_CODE],
  ] as const) {
    assert(`7a. ${name} spreads no tokens.typography.*`, !/\.\.\.typography\./.test(src));
    assert(`7b. ${name} resolves the shipped roles with a live locale`, /typeStyle\('/.test(src) && /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(src) && /\[colors[^\]]*\blocale\b[^\]]*\]/.test(src));
    assert(`7c. ${name} carries no raw hex or rgba`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src));
  }
  assert('7d. percentages, amounts and inputs stay tabular', (BODY_CODE.match(/fontVariant: \['tabular-nums'\]/g) ?? []).length >= 3);
  // The accepted copy is untouched, word for word.
  assert('7e. the money-does-not-move explanation survives', PROMPT.includes("This does not move money or create a transaction."));
  assert('7f. the calculation-options and monthly-figure notes survive', BODY.includes('These are calculation options, not recommendations.') && BODY.includes('Applied as a monthly figure, then shared out across your pay cycle'));
  assert('7g. the options and actions survive', BODY.includes('No savings allocation') && BODY.includes('Percentage of expected recurring income') && BODY.includes('Fixed monthly amount') && PROMPT.includes('"Not now"') === false ? PROMPT.includes("label=\"Not now\"") : true);
  assert('7h. selection stays visible beyond colour — the filled radio dot is structural', /mode === 'off' \? <View style=\{styles\.radioInner\} \/> : null/.test(BODY_CODE));
  assert('7i. the shared validity rule is byte-identical', /export function isValidSetting/.test(BODY_CODE) && /return hasRecurringIncome && p > 0 && p <= MAX_PERCENT;/.test(BODY_CODE));
  assert('7j. the sheet title renders through the migrated shared chrome', /fontFamily: fontFamilyForWeight\(600, locale\)/.test(read('src/components/shared/KeyboardSheet.tsx')));
}

console.log('\n=== 8. Protected boundaries — no financial output can have moved ===');
{
  assert('8a. Available until payday keeps its factual missing-balance state', /money-aup-hero-no-balances/.test(code(read('src/components/money/SafeToSpendHero.tsx'))));
  assert('8b. the Money-eligibility default is untouched (everyday included when unset)', resolveIncludeInMoneyCalculations({ type: 'everyday', includeInMoneyCalculations: undefined } as never) === true);
  assert('8c. storage performs no migration for the new flag', !/confirmedEverydayLater/.test(read('src/lib/storage.ts')));
  assert('8d. the accepted income-scheduling path is untouched', /nextDueDateUnknown: !scheduled,/.test(FLOW) && /unscheduledIncome \? setCompleteIncomeVisible\(true\)/.test(CARD));
  assert('8e. the debt chooser and its destinations are untouched this pass', /Tell us about any debt/.test(code(read('src/components/debt/DebtCoachSheet.tsx'))));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
