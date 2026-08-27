// Nolie Design 5.1 Wave 9c FINAL correction pass — onboarding income
// completeness, duplicate prevention, checklist CTA, debt chooser,
// onboarding visual system, and calm field-aware validation.
//
// THE HEADLINE DEFECT (owner device test). Onboarding captured a $5,000
// fortnightly income; the checklist marked income complete; Wealth showed
// the correct ~$10,833/mo — the record EXISTED. Yet Money still said "Add
// an expected payday" and "What happens next" never showed the salary,
// and following that prompt built a SECOND $5,000 fortnightly income.
//
// ROOT CAUSE, verified in source and against the real engines below: the
// Wave 9c onboarding draft stamped EVERY income
//   `nextDueDate: new Date().toISOString(), nextDueDateUnknown: true`
// — the canonical "customer genuinely doesn't know" representation that
// recurringSchedule (L122), the timeline, reminders (L275) and the
// aggregate's `nextPayday` all CORRECTLY skip. Monthly conversion reads
// only amount+frequency, which is why Wealth alone looked right. Nothing
// was wrong in any engine; the record was born unscheduled.
//
// CLASSIFICATION (tests/README.md): §2/§3/§4/§6 are Class A — they run the
// REAL recurrence, timeline, monthly-income, Safe-to-Spend and checklist
// resolver code. The rest is Class C structural over the real sources
// (comment-stripped), with runtime proof in the rendered suites.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9c-final.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { recurringOccurrencesInRange, advanceOneOccurrence } from '../src/lib/calculations/recurringSchedule';
import { computeMoneyTimeline } from '../src/lib/calculations/moneyTimeline';
import { toMonthlyAmount, computeTotalMonthlyIncome, frequencyAdverb } from '../src/lib/calculations/incomeEngine';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { resolveNextSetupStep, SETUP_STEP_PRIORITY } from '../src/lib/setupChecklist';
import { INCOME_SOURCE_IDS, INCOME_SOURCE_LABEL, INCOME_SOURCE_RECORD_ICON } from '../src/lib/incomeSources';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData, Asset, PayFrequency, RecurringItem } from '../src/types/models';

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
const MONEY = code(read('src/screens/money/MoneyScreen.tsx'));
const HERO = code(read('src/components/money/SafeToSpendHero.tsx'));
const INCOME_MODAL = code(read('src/components/income/AddIncomeModal.tsx'));
const CARD = code(read('src/components/today/MoneyPictureChecklistCard.tsx'));
const DEBT = read('src/components/debt/DebtCoachSheet.tsx');
const DEBT_CODE = code(DEBT);
const CTX = code(read('src/state/AppStateContext.tsx'));

// Fixed LOCAL dates — never derived from the wall clock, so nothing here
// can shift across time zones or DST.
const TODAY = new Date(2026, 8, 1); // 1 Sep 2026 local
const iso = (d: Date) => d.toISOString();
const PAYDAY_LOCAL = new Date(2026, 8, 7); // 7 Sep 2026 local midnight

/** Exactly the record the corrected onboarding draft persists for the
 * owner's device case: $5,000 fortnightly, payday chosen on the shared
 * picker (a local-midnight Date, stored via toISOString — the identical
 * representation the canonical AddIncomeModal has always saved). */
function onboardedIncome(over: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 'r-onb',
    type: 'income',
    label: 'BOQ',
    amount: 5000,
    frequency: 'fortnightly',
    nextDueDate: iso(PAYDAY_LOCAL),
    nextDueDateUnknown: false,
    isFixed: true,
    active: true,
    icon: 'briefcase-outline',
    ...over,
  };
}

/** The legacy device record — same income, born unscheduled. */
function legacyIncome(): RecurringItem {
  return onboardedIncome({ id: 'r-legacy', nextDueDate: iso(new Date(2026, 7, 20, 9, 30)), nextDueDateUnknown: true });
}

function world(income: RecurringItem): AppData {
  const d = createEmptyAppData();
  d.recurringItems = [income];
  d.assets = [{ id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 12000 } as Asset];
  // The aggregate exactly as syncIncomeAggregate stamps it (its line is
  // pinned structurally in §5): payFrequency from the primary source, and
  // nextPayday only when the date is genuinely known.
  d.user.payFrequency = income.frequency;
  d.user.monthlyIncome = computeTotalMonthlyIncome([income]);
  d.user.nextPayday = income.nextDueDateUnknown ? null : income.nextDueDate;
  return d;
}

console.log('=== 1. The corrected onboarding draft is the COMPLETE canonical shape ===');
{
  assert('1a. the malformed unconditional unknown-date stamp is gone', !/nextDueDate: new Date\(\)\.toISOString\(\),\s*\n\s*nextDueDateUnknown: true,/.test(FLOW_CODE));
  assert('1b. the draft stores the picked payday and unknown only when genuinely unknown', /nextDueDate: scheduled \? incomePayday : new Date\(\)\.toISOString\(\),/.test(FLOW_CODE) && /nextDueDateUnknown: !scheduled,/.test(FLOW_CODE));
  assert('1c. a predictable cadence REQUIRES the payday for block validity', /\(cadence === 'irregular' \|\| incomePayday !== null\)/.test(FLOW_CODE));
  assert('1d. …so only irregular income can ever persist unscheduled', /const scheduled = incomePayday !== null;/.test(FLOW_CODE));
  assert('1e. the payday comes from the SHARED focused date picker', /DateTriggerField/.test(FLOW_CODE) && /testID="onboarding-payday"/.test(FLOW_CODE) && /direction="future"/.test(FLOW_CODE));
  assert('1f. …seeded from local midnight, the canonical start-of-day rule', /new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\)\)/.test(FLOW_CODE));
  assert('1g. no date is ever invented from today/tomorrow/cadence', !/incomePayday \?\?/.test(FLOW_CODE) && !/setIncomePayday\(new Date/.test(FLOW_CODE));
  assert('1h. the field is named and explained factually', FLOW.includes("label={cadence === 'irregular' ? 'Next expected payment (optional)' : 'Next expected payday'}") && FLOW.includes('place your income in What happens next. You can update it later.'));
  assert('1i. …with no arrival guarantee anywhere', !/will arrive|guaranteed|will be paid/.test(FLOW_CODE));

  // The structured source selector is the canonical one, shared — not a copy.
  assert('1j. onboarding offers the canonical source selector', /InlineSelect/.test(FLOW_CODE) && /testID="onboarding-income-source"/.test(FLOW_CODE));
  assert('1k. both journeys import the ONE shared id/label/icon module', /from '\.\.\/\.\.\/lib\/incomeSources'/.test(FLOW_CODE) && /from '\.\.\/\.\.\/lib\/incomeSources'/.test(INCOME_MODAL));
  assert('1l. no duplicated id list survives in AddIncomeModal', !/const INCOME_SOURCE_IDS = \[/.test(INCOME_MODAL) && !/const SOURCE_LABEL/.test(INCOME_MODAL));
  assert('1m. the six canonical ids are unchanged', INCOME_SOURCE_IDS.join(',') === 'cat-salary,cat-side-hustle,cat-investment-income,cat-rental-income,cat-gift,cat-other-income');
  assert('1n. every id has a label and a record icon', INCOME_SOURCE_IDS.every((id) => !!INCOME_SOURCE_LABEL[id] && !!INCOME_SOURCE_RECORD_ICON[id]));
  assert('1o. the source is never inferred from the free-text name', !/incomeLabel\.toLowerCase|label\.includes\(/.test(FLOW_CODE));
  assert('1p. the draft stamps the source-derived icon like the canonical journey', /icon: incomeSourceId \? INCOME_SOURCE_RECORD_ICON\[incomeSourceId\] \?\? 'cash-outline' : 'cash-outline',/.test(FLOW_CODE));
  assert("1q. the model's own setup-time field records the source id, only with a real income", /incomes\.length > 0 && incomeSourceId \? \{ incomeSource: incomeSourceId \}/.test(FLOW_CODE));
  assert('1r. the source prefills but never overwrites a typed name', /setIncomeLabel\(\(prev\) => prev \|\| INCOME_SOURCE_LABEL\[nextSourceId\]/.test(FLOW_CODE));
  assert('1s. amounts persist only from the strict parser, never coerced', /parsedIncome\.valid \? parsedIncome\.amount : 0/.test(FLOW_CODE) && /parsedIncome\.valid &&\s*\n\s*parsedIncome\.amount > 0/.test(FLOW));
}

console.log('\n=== 2. Class A — the onboarded record schedules through the REAL engines ===');
{
  const scheduled = onboardedIncome();
  const unscheduled = legacyIncome();

  // Recurrence: the very filter that (correctly) hid the legacy record.
  const inRange = recurringOccurrencesInRange([scheduled], TODAY, new Date(2026, 8, 30));
  const legacyInRange = recurringOccurrencesInRange([unscheduled], TODAY, new Date(2026, 8, 30));
  assert('2a. a scheduled income produces real occurrences', inRange.length >= 2);
  assert('2b. the first occurrence is the picked LOCAL day (7 Sep), unshifted', inRange[0].date.getFullYear() === 2026 && inRange[0].date.getMonth() === 8 && inRange[0].date.getDate() === 7);
  assert('2c. the second follows the real fortnight step (21 Sep)', inRange[1].date.getDate() === 21);
  assert('2d. the unknown-date record is skipped by the SAME engine — the defect, reproduced', legacyInRange.length === 0);

  // Money timeline: What happens next.
  const timeline = computeMoneyTimeline(world(scheduled), TODAY, 14);
  const incomeEvents = timeline.filter((e) => e.kind === 'income');
  assert('2e. the income appears in What happens next', incomeEvents.length === 1);
  assert('2f. …exactly ONCE in the 14-day horizon', incomeEvents.length === 1 && incomeEvents[0].recurringItemId === 'r-onb');
  assert('2g. …at its own real per-payment amount, not a monthly equivalent', incomeEvents[0].amount === 5000);
  assert('2h. the legacy record produced NO event — the recorded absence, reproduced', computeMoneyTimeline(world(unscheduled), TODAY, 14).filter((e) => e.kind === 'income').length === 0);

  // Monthly conversion: why Wealth was right all along, and unchanged.
  assert('2i. $5,000 fortnightly is ~$10,833/mo to the cent', Math.abs(toMonthlyAmount(5000, 'fortnightly') - (5000 * 26) / 12) < 1e-9);
  assert('2j. the conversion is date-blind — scheduled and unscheduled agree', computeTotalMonthlyIncome([scheduled]) === computeTotalMonthlyIncome([unscheduled]));

  // Available until payday: same engine, two honest states.
  const withPayday = computeSafeToSpend(world(scheduled), TODAY);
  const withoutPayday = computeSafeToSpend(world(unscheduled), TODAY);
  assert('2k. a known payday gives AUP its cycle', withPayday.hasKnownPayday === true);
  assert('2l. the legacy record leaves AUP without one — the device hero state, reproduced', withoutPayday.hasKnownPayday === false);
  assert('2m. no transaction or balance was invented by scheduling', world(scheduled).transactions.length === 0 && world(scheduled).assets[0].currentValue === 12000);
}

console.log('\n=== 3. Class A — every supported cadence uses the existing recurrence semantics ===');
{
  const start = new Date(2026, 8, 7);
  const cases: { frequency: PayFrequency; nextDay: number }[] = [
    { frequency: 'weekly', nextDay: 14 },
    { frequency: 'fortnightly', nextDay: 21 },
    { frequency: 'monthly', nextDay: 7 },
  ];
  for (const c of cases) {
    const next = advanceOneOccurrence({ nextDueDate: iso(start), frequency: c.frequency });
    const pass = c.frequency === 'monthly' ? next.getMonth() === 9 && next.getDate() === 7 : next.getDate() === c.nextDay;
    assert(`3a. ${c.frequency} advances by the real engine step`, pass);
  }
  // Month-end anchor safety on the monthly path (existing rule, untouched).
  const clamped = advanceOneOccurrence({ nextDueDate: iso(new Date(2026, 0, 31)), frequency: 'monthly', scheduleAnchorDay: 31 });
  assert('3b. a day-31 monthly anchor clamps to Feb 28, never invents March 3', clamped.getMonth() === 1 && clamped.getDate() === 28);
  // Irregular: valid with no payday, and honestly absent from schedules.
  const irregular = onboardedIncome({ frequency: 'irregular', nextDueDate: iso(new Date(2026, 8, 1, 8)), nextDueDateUnknown: true });
  assert('3c. irregular income with an unknown date schedules nothing — canonical, not a defect', recurringOccurrencesInRange([irregular], TODAY, new Date(2026, 11, 1)).length === 0);
  assert('3d. …but still converts to monthly income', computeTotalMonthlyIncome([irregular]) > 0);
  assert('3e. onboarding seams the anchor day exactly like every other income add', /incomeItems\.map\(\(item\) => \(\{ \.\.\.item, scheduleAnchorDay: resolveScheduleAnchorDay\(null, item\)/.test(CTX));
}

console.log('\n=== 4. Correction B — completion before creation in Money ===');
{
  assert('4a. "unscheduled" is STRUCTURED state only', /r\.type === 'income' && r\.active && r\.nextDueDateUnknown === true && r\.frequency !== 'irregular'/.test(MONEY));
  assert('4b. exactly one unscheduled income opens THAT record for editing', /setEditIncome\(unscheduledIncomes\[0\]\);\s*\n\s*setIncomeModalVisible\(true\);/.test(MONEY));
  assert('4c. several open the per-record chooser', /setPaydayChooserVisible\(true\);/.test(MONEY));
  assert('4d. none keeps the original blank add', /setEditIncome\(null\);\s*\n\s*setIncomeModalVisible\(true\);/.test(MONEY));
  assert('4e. the CTA label becomes the factual completion wording', /`Finish setting up \$\{unscheduledIncomes\[0\]\.label\} income`/.test(MONEY));
  assert('4f. …and a plural fallback for the multi case', MONEY.includes("'Finish setting up your income'"));
  assert('4g. the chooser selects by STABLE ID, never by name', /unscheduledIncomes\.find\(\(r\) => r\.id === key\)/.test(MONEY) && !/\.label === key|find\(\(r\) => r\.label/.test(MONEY));
  assert('4h. the chooser states that nothing new is created', MONEY.includes('Completing one updates that existing record — nothing new is created.'));
  assert('4i. the hero default wording is preserved for the no-income case', /addPaydayLabel = 'Add an expected payday'/.test(HERO) && /label: addPaydayLabel, onPress: onAddPayday, testID: 'money-aup-cta-payday'/.test(HERO));
  assert('4j. an IRREGULAR unknown-date income is never treated as incomplete', /r\.frequency !== 'irregular'/.test(MONEY) && /r\.frequency !== 'irregular'/.test(CARD));

  // The canonical editor can now actually complete the record: picking a
  // date on a predictable cadence clears the lingering unknown flag.
  assert('4k. picking a payment date clears the legacy unknown flag', /setNextDueDate\(next\.toISOString\(\)\);\s*\n\s*setUnknownDate\(false\);/.test(INCOME_MODAL));
  assert('4l. the save payload contract itself is unchanged', /nextDueDate: unknownDate \|\| !nextDueDate \? new Date\(\)\.toISOString\(\) : nextDueDate,/.test(INCOME_MODAL));
  assert('4m. editing updates the SAME id, adding creates — the existing CRUD, untouched', /updateRecurringItem\(editItem\.id, payload\);/.test(INCOME_MODAL) && /addRecurringItem\(payload\);/.test(INCOME_MODAL));

  // Explicit Add-another-income paths survive, and are the ONLY creators.
  assert('4n. the "+" workspace income destination is intact', /incomeSource: 'Add income source'/.test(code(read('src/components/navigation/AddAnythingSheet.tsx'))));
  assert("4o. MoneyEngineCard's explicit add row is intact", /key: 'add', icon: 'add-circle-outline'/.test(code(read('src/components/wealth/MoneyEngineCard.tsx'))));

  // The checklist half: the same structured state re-opens the step and
  // routes to the SAME record.
  assert('4p. an unscheduled income re-opens the checklist income step', /const incomeComplete = hasRealIncome && !unscheduledIncome;/.test(CARD));
  assert('4q. …whose action opens the canonical editor on that record', /editItem=\{unscheduledIncome\}/.test(CARD) && /setCompleteIncomeVisible\(true\)/.test(CARD));
  assert('4r. …with the factual finish wording', /`Finish setting up \$\{unscheduledIncome\.label\} — add its next expected payday\.`/.test(CARD));
}

console.log('\n=== 5. The aggregate seam and protected engines are untouched ===');
{
  assert('5a. syncIncomeAggregate still derives nextPayday only from a KNOWN date', CTX.includes("nextPayday: primary && !primary.nextDueDateUnknown ? primary.nextDueDate : null,"));
  assert('5b. …and payFrequency from the primary source with the engine default', CTX.includes("payFrequency: primary?.frequency ?? 'monthly',"));
  const RS = code(read('src/lib/calculations/recurringSchedule.ts'));
  assert('5c. the schedule engine still skips unknown dates — never edited to "fix" the defect', RS.includes('if (item.nextDueDateUnknown) continue;'));
  const IE = code(read('src/lib/calculations/incomeEngine.ts'));
  assert('5d. monthly conversion still excludes unknown dates only where it always did', IE.includes('.filter((r) => !r.nextDueDateUnknown)'));
  const REM = code(read('src/lib/calculations/reminders.ts'));
  assert('5e. the reminder income filter is untouched', REM.includes("r.type === 'income' && r.active && !r.nextDueDateUnknown"));
  // storage.ts has ALWAYS carried the ancient single-income upgrade path
  // (rebuilding one RecurringItem from pre-multi-income user fields) and
  // the anchor-day default — both pre-existing. What must be true is that
  // THIS pass added no backfill: the legacy lines are byte-identical and
  // nothing stamps a date onto an unknown-date record.
  const STORAGE = read('src/lib/storage.ts');
  assert('5f. the pre-existing upgrade path is untouched', STORAGE.includes('nextDueDate: data.user.nextPayday ?? new Date().toISOString(),') && STORAGE.includes('nextDueDateUnknown: !data.user.nextPayday,'));
  assert('5f-i. …and no unknown-date backfill was added', !/nextDueDateUnknown: false/.test(STORAGE) && !/nextDueDateUnknown = false/.test(STORAGE));
  assert('5g. completion is still the write-first atomic seam', /const write = saveAppData\(withScoreHistory\);[\s\S]{0,200}await write;\s*\n\s*commitData\(withScoreHistory\);/.test(CTX));
  assert('5h. frequencyAdverb drives the chooser description from the model', typeof frequencyAdverb('fortnightly') === 'string' && /frequencyAdverb\(item\.frequency\)/.test(MONEY));
}

console.log('\n=== 6. Class A — the Continue setup resolver is deterministic, structured priority ===');
{
  // RECONCILED — Wave 9c visual/checklist correction: the accepted
  // checklist is now the realistic SEVEN-step journey, so the resolver's
  // order became income → everyday → savings ('cash' key) → assets →
  // bills → debt → goal. Every original guarantee (structured keys,
  // determinism, deferred-goal exclusion, goal-last) re-asserted on the
  // new order.
  type S = { key: string; done: boolean };
  const steps = (doneKeys: string[]): S[] =>
    ['goal', 'income', 'everyday', 'cash', 'bills', 'assets', 'debt'].map((key) => ({ key, done: doneKeys.includes(key) }));

  assert('6a. the priority order is the accepted seven-step one', SETUP_STEP_PRIORITY.join(',') === 'income,everyday,cash,assets,bills,debt,goal');
  assert('6b. income leads when everything is incomplete', resolveNextSetupStep(steps([]))?.key === 'income');
  assert('6c. the everyday account follows a completed income', resolveNextSetupStep(steps(['income']))?.key === 'everyday');
  assert('6d. savings follow everyday', resolveNextSetupStep(steps(['income', 'everyday']))?.key === 'cash');
  assert('6e. assets follow savings', resolveNextSetupStep(steps(['income', 'everyday', 'cash']))?.key === 'assets');
  assert('6f. bills follow assets', resolveNextSetupStep(steps(['income', 'everyday', 'cash', 'assets']))?.key === 'bills');
  assert('6f-i. the debt question follows bills', resolveNextSetupStep(steps(['income', 'everyday', 'cash', 'assets', 'bills']))?.key === 'debt');
  assert('6g. the optional goal is only ever last', resolveNextSetupStep(steps(['income', 'everyday', 'cash', 'assets', 'bills', 'debt']))?.key === 'goal');
  // A deferred goal is DONE — it can never be auto-selected again.
  assert('6h. a deferred goal never becomes the next CTA', resolveNextSetupStep(steps(['income', 'everyday', 'cash', 'assets', 'bills', 'debt', 'goal'])) === null);
  assert('6i. the resolver is deterministic', JSON.stringify(resolveNextSetupStep(steps(['income']))) === JSON.stringify(resolveNextSetupStep(steps(['income']))));
  // RECONCILED (post-Wave-10 checklist UX closure): setupChecklist now
  // also carries the pure presentation composition (whose progressLabel is
  // a computed STRING, not a matching input), so the never-matches-labels
  // rule is pinned on the RESOLVER itself, unchanged.
  assert('6j. the resolver walks structured keys, never labels', /for \(const key of SETUP_STEP_PRIORITY\)/.test(read('src/lib/setupChecklist.ts')) && !/label|title|parse/i.test(read('src/lib/setupChecklist.ts').split('export function resolveNextSetupStep')[1].split('}')[0]));

  // The card wires it as THE primary action, and rows carry factual value.
  assert('6k. one featured Continue setup CTA still resolves through nextSetupStep.onAdd', /Continue setup/.test(CARD) && /nextSetupStep\.onAdd\(\);/.test(CARD) && (CARD.match(/Continue setup/g) ?? []).length >= 1);
  for (const line of [
    'Places expected pay in your timeline.',
    'Gives Available until payday a balance to work from.',
    'Shows money you have set aside.',
    'Adds vehicles, property or investments to your net worth.',
    'Keeps upcoming costs visible.',
    'Keeps what you owe visible.',
    'Optional — track a target if useful.',
  ]) {
    assert(`6l. row value line: "${line}"`, CARD.includes(line));
  }
  assert('6m. progress is honest: complete only when data-backed, reviewed when acknowledgements count, never "added"', /reviewed/.test(read('src/lib/setupChecklist.ts')) && /'complete'/.test(read('src/lib/setupChecklist.ts')) && !/of \$\{steps\.length\} added/.test(CARD));
  assert('6n. deferred rows chip Later with a time glyph, never a check', /'Later'/.test(CARD) && /s\.acknowledged \? 'time-outline' : s\.icon/.test(CARD));
  assert('6o. completion is a calm state the CUSTOMER closes — no timer, no auto-dismiss (the one effect is focus restoration)', /Setup complete/.test(CARD) && !/setTimeout|setInterval/.test(CARD) && /focusElement\(originRef\.current\)/.test(CARD) && (CARD.match(/useEffect\(/g) ?? []).length === 1);
  assert('6p. the direct single-workspace transition is preserved', /visible=\{workspaceKind !== null\}/.test(CARD) && /initialKind=\{workspaceKind \?\? undefined\}/.test(CARD) && (CARD.match(/<AddAnythingSheet/g) ?? []).length === 1 && !/OptionsSheet/.test(CARD));
}

console.log('\n=== 7. Correction D — the debt chooser joins the design system ===');
{
  assert('7a. no legacy type token survives in the journey', !/\.\.\.typography\./.test(DEBT_CODE));
  assert('7b. every text resolves the shipped roles', (DEBT_CODE.match(/typeStyle\('/g) ?? []).length >= 8);
  assert('7c. a live locale binds the resolver', /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(DEBT_CODE) && /\[colors[^\]]*\blocale\b[^\]]*\]/.test(DEBT_CODE));
  assert('7d. the emoji tiles are gone', !/💳|🏠|🚗|💰|❌|optionEmoji/.test(DEBT_CODE));
  assert('7e. rows render the SHARED debt-purpose icon resolver', /AddIcon icon=\{liabilityTypeIcon\(o\.type\)\} tile/.test(DEBT_CODE));
  assert('7f. the accepted hierarchy: title and support copy', DEBT_CODE.includes('Tell us about any debt') && DEBT_CODE.includes('Add only what applies. You can update this later.'));
  assert('7g. …as a real heading', /styles\.title\} accessibilityRole="header">Tell us about any debt/.test(DEBT_CODE));
  assert('7h. the four rows are at least 56pt', /optionTile: \{[^}]*minHeight: 56/.test(DEBT_CODE));
  assert('7i. all four destinations survive', ['credit_card', 'mortgage', 'car_loan', 'personal_loan'].every((t) => DEBT_CODE.includes(`'${t}'`)));
  assert('7j. the no-debt answer has no red X and no danger tint', DEBT_CODE.includes("I don't have any debt") && !/noDebtText[^}]*danger/.test(DEBT_CODE) && /noDebtText: \{ \.\.\.typeStyle\('body', locale\), color: colors\.accentStrong/.test(DEBT_CODE));
  // RECONCILED (checklist consistency correction): the customer-facing
  // footer labels are the owner-locked seven-footer matrix; the structured
  // writers are unchanged, and Debt-free routes through the ONE shared
  // lib/noDebtConfirmation authority used by both entry points.
  assert('7k. the no-debt flow still writes the same flag and celebrates — through the ONE shared authority', /confirmNoDebt\(\{ updateUser, confirmSaveSuccess, celebrate \}\);/.test(DEBT_CODE) && /updateUser\(\{ confirmedNoDebt: true \}\);/.test(read('src/lib/noDebtConfirmation.ts')) && /buildDebtFreeCelebration\(\)/.test(read('src/lib/noDebtConfirmation.ts')));
  assert('7l. card/liability destinations are unchanged', /setAddCardVisible\(true\)/.test(DEBT_CODE) && /setAddLiabilityType\(type\)/.test(DEBT_CODE) && /presetLiabilityType=\{addLiabilityType \?\? undefined\}/.test(DEBT_CODE));
  assert('7m. the stable Cards route and its guard survive', /handleViewCreditCards/.test(DEBT_CODE) && /navigatingRef/.test(DEBT_CODE));
  assert('7n. the overview branch migrated too — tabular amounts included', /debtSub: \{ \.\.\.typeStyle\('meta', locale\)[^}]*tabular-nums/.test(DEBT_CODE));
  assert('7o. no financial copy or engine changed here', /computeDebtCoachSummary\(data\)/.test(DEBT_CODE) && /Educational estimate only\./.test(DEBT_CODE));
}

console.log('\n=== 8. Corrections E/F — shared canvas and the Step 2 media contract ===');
{
  const FRAME = code(read('src/screens/welcome/OnboardingMediaFrame.tsx'));
  assert('8a. every onboarding state renders inside the ONE canvas', /<OnboardingAmbientCanvas animated=\{step === 'welcome'\}>\{renderCurrentStep\(\)\}<\/OnboardingAmbientCanvas>/.test(FLOW_CODE));
  assert('8b. form states sit on a calm surface card over the ambience', /surfaceCard/.test(FLOW_CODE) && /backgroundColor: colors\.surface,/.test(FLOW_CODE));
  assert('8c. no state re-paints an opaque background over the shell', !/plainContainer: \{ flex: 1, backgroundColor/.test(FLOW_CODE));
  assert('8d. the preview hosts the dedicated media frame', /<OnboardingMediaFrame>/.test(FLOW_CODE));
  assert('8e. the frame owns a stable portrait ratio', /aspectRatio: 4 \/ 5/.test(FRAME));
  assert('8f. …cover cropping inside a clipped premium surface', /resizeMode="cover"/.test(FRAME) && /overflow: 'hidden'/.test(FRAME));
  assert('8g. layout is the FRAME\'s, not the asset\'s — source only swaps content', /source \? \(/.test(FRAME) && /styles\.placeholder\}>\{children\}/.test(FRAME));
  assert('8h. informational vs decorative accessibility is explicit', /accessibilityLabel=\{decorative \? undefined : accessibilityLabel\}/.test(FRAME) && /accessibilityElementsHidden=\{decorative\}/.test(FRAME));
  assert('8i. only local assets — no remote URL enters the contract', !/http|uri:/.test(FRAME));
  assert('8j. no fake figures, market arrows or promises in the shell', !/\$\d|↑|→ *\d|guarantee/.test(code(read('src/screens/welcome/OnboardingAmbientCanvas.tsx'))));
  assert('8k. no new dependency, video or Lottie anywhere in the system', !/lottie|Video|\.gif|\.mp4/i.test(FLOW_CODE + FRAME + code(read('src/screens/welcome/OnboardingAmbientCanvas.tsx'))));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
