// Nolie Design 5.1 Wave 4 closure — every Add date entry point uses the ONE
// canonical picker, and the icon tone system is complete and safe.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): the pure reveal rules, the date /
//   ordinal / month-year presentation helpers, and the theme's own tone
//   table are all imported and executed.
// - Class C (structural): the per-form inventory — which component each date
//   trigger actually uses, and that no inline calendar survives.
//
// NOT proven here: real keyboard timing or native gesture arbitration on a
// device. Those stay iOS device evidence.
//
// Run with: npx tsx tests/design5-wave4-picker-inventory.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { decidePickerReveal, resolvePickerEntranceDuration, shouldConsumeKeyboardEvent } from '../src/components/shared/fields/pickerTriggerBehaviour';
import { describeMonthYear, monthName, MONTH_VALUES, targetYearValues, upcomingDateChoices } from '../src/lib/dateFieldPresentation';
import { ADD_ICON_TONES, ADD_ICON_TONE_NAMES, resolveAddIconTone, SHARED_COLORS } from '../src/theme/semanticTokens';
import { ALL_ADD_ICON_MAPS, ADD_ICON_TONES_LIST } from '../src/lib/addIcons';

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

const FORMS = {
  transaction: 'src/components/dashboard/QuickAddModal.tsx',
  income: 'src/components/income/AddIncomeModal.tsx',
  bill: 'src/components/money/AddRecurringItemModal.tsx',
  wealth: 'src/components/wealth/AddWealthItemModal.tsx',
  card: 'src/components/credit/AddCreditCardModal.tsx',
  goal: 'src/components/goals/AddGoalModal.tsx',
  goalFields: 'src/components/goals/GoalFormFields.tsx',
  goalEdit: 'src/components/goals/GoalDetailSheet.tsx',
} as const;

console.log('=== 1. THE INVENTORY — every Add date trigger, and what it uses (Class C) ===');
{
  // Each row: the customer-visible trigger, and the canonical component it
  // must resolve to. Nothing in the Add journey may pick a date any other
  // way.
  const INVENTORY: { form: keyof typeof FORMS; trigger: string; component: string; pattern: RegExp }[] = [
    { form: 'transaction', trigger: 'transaction occurrence date', component: 'DateTriggerField', pattern: /<DateTriggerField\s*\n\s*label="Date"/ },
    { form: 'income', trigger: 'next expected payment (regular)', component: 'DateTriggerField', pattern: /<DateTriggerField\s*\n\s*label="Next expected payment"/ },
    { form: 'income', trigger: 'expected date (irregular)', component: 'DateTriggerField', pattern: /<DateTriggerField\s*\n\s*label="Expected date \(optional\)"/ },
    { form: 'bill', trigger: 'next due date (weekly/fortnightly)', component: 'DateTriggerField', pattern: /<DateTriggerField\s*\n\s*label="Next due date"/ },
    { form: 'bill', trigger: 'day of month due (monthly)', component: 'DayOfMonthField', pattern: /<DayOfMonthField\s*\n\s*label="Day of month due"/ },
    { form: 'wealth', trigger: 'loan repayment next due date', component: 'DateTriggerField', pattern: /<DateTriggerField\s*\n\s*label="Next repayment date"/ },
    { form: 'wealth', trigger: 'loan repayment day of month', component: 'DayOfMonthField', pattern: /<DayOfMonthField\s*\n\s*label="Day of month due"/ },
    { form: 'card', trigger: 'credit-card due day', component: 'DayOfMonthField', pattern: /<DayOfMonthField\s*\n\s*label="Due day of month"/ },
    // Wave 4 closure — the goal's fields moved into the shared
    // GoalFormFields, which the create AND edit adapters both render, so the
    // trigger is asserted at its new home.
    { form: 'goalFields', trigger: 'goal target month and year', component: 'MonthYearField', pattern: /<MonthYearField\s*\n\s*label="Target date — optional"/ },
  ];

  for (const row of INVENTORY) {
    assert(`1a. ${row.form}: ${row.trigger} -> ${row.component}`, row.pattern.test(read(FORMS[row.form])));
  }
  assert(`1b. the inventory covers ${INVENTORY.length} triggers across ${new Set(INVENTORY.map((r) => r.form)).size} surfaces`, INVENTORY.length === 9);
  // Both goal adapters render those shared fields, so the goal target date
  // is the canonical picker in create AND edit.
  assert('1b-i. both goal adapters render the shared field system', /<GoalFormFields/.test(read(FORMS.goal)) && /<GoalFormFields/.test(read(FORMS.goalEdit)));

  // Nothing anywhere in the Add journey picks a date any other way.
  for (const [name, rel] of Object.entries(FORMS)) {
    const src = stripComments(read(rel));
    assert(`1c. ${name}: no inline DateTimePicker survives`, !/DateTimePicker/.test(src));
    assert(`1d. ${name}: no per-form native date Modal survives`, !/DatePickerModal/.test(src));
    assert(`1e. ${name}: no raw DD/MM/YYYY or day-number text entry survives`, !/placeholder="DD"|placeholder="YYYY"|placeholder="MM"/.test(src));
  }
  // The bill form is the specific defect the owner recorded.
  const bill = stripComments(read(FORMS.bill));
  assert('1f. THE BILL DEFECT: no inline calendar branch, and no picker-open state left behind', !/DateTimePicker/.test(bill) && !/pickerOpen/.test(bill));
  assert('1g. and its weekly/fortnightly date is forward-looking, preserving the old minimumDate rule', /direction="future"/.test(bill));
}

console.log('\n=== 2. All three field types share ONE trigger and ONE surface (Class C) ===');
{
  const FIELDS = [
    'src/components/shared/fields/DateTriggerField.tsx',
    'src/components/shared/fields/DayOfMonthField.tsx',
    'src/components/shared/fields/MonthYearField.tsx',
  ];
  for (const rel of FIELDS) {
    const src = stripComments(read(rel));
    const name = rel.split('/').pop();
    assert(`2a. ${name} renders the shared trigger`, /<FocusedPickerTrigger/.test(src));
    assert(`2b. ${name} owns no keyboard sequencing of its own`, !/Keyboard\./.test(src));
    assert(`2c. ${name} owns no focus handling of its own`, !/AccessibilityInfo|findNodeHandle/.test(src));
    assert(`2d. ${name} renders no Done/Cancel of its own`, !/label="Done"|label="Cancel"/.test(src));
    assert(`2e. ${name} renders no Modal`, !/<Modal\b/.test(src));
  }
  // The three differ ONLY in their content, which is the point.
  assert('2f. the date field offers real dates', /quickDateChoices|upcomingDateChoices/.test(read(FIELDS[0])));
  assert('2g. the day field offers ordinals 1-31', /DAY_OF_MONTH_VALUES/.test(read(FIELDS[1])) && /ordinalDay/.test(read(FIELDS[1])));
  assert('2h. the month/year field offers months and years', /MONTH_VALUES/.test(read(FIELDS[2])) && /targetYearValues/.test(read(FIELDS[2])));
}

console.log('\n=== 3. The shared reveal rule (Class A) ===');
{
  assert('3a. keyboard up -> activate the shell immediately, then coordinate the reveal', decidePickerReveal({ keyboardVisible: true, phase: 'idle' }) === 'activate-then-coordinate');
  assert('3b. no keyboard -> reveal immediately', decidePickerReveal({ keyboardVisible: false, phase: 'idle' }) === 'reveal-now');
  assert('3c. anything already on screen -> close, never stack a second picker', ['open', 'activating'].every((ph) => decidePickerReveal({ keyboardVisible: false, phase: ph as never }) === 'close' && decidePickerReveal({ keyboardVisible: true, phase: ph as never }) === 'close'));
  assert('3d. a keyboard event completes a reveal only while genuinely activating — so willHide then didHide cannot open twice', shouldConsumeKeyboardEvent('activating') && !shouldConsumeKeyboardEvent('open') && !shouldConsumeKeyboardEvent('idle'));
  assert('3e. the entrance matches the keyboard\'s own duration, falls back to a token, and collapses under Reduced Motion', (() => {
    return (
      resolvePickerEntranceDuration({ keyboardDurationMs: 250, fallbackMs: 280, reduceMotion: false }) === 250 &&
      resolvePickerEntranceDuration({ keyboardDurationMs: undefined, fallbackMs: 280, reduceMotion: false }) === 280 &&
      resolvePickerEntranceDuration({ keyboardDurationMs: 0, fallbackMs: 280, reduceMotion: false }) === 280 &&
      resolvePickerEntranceDuration({ keyboardDurationMs: 250, fallbackMs: 280, reduceMotion: true }) === 0
    );
  })());
}

console.log('\n=== 4. Each value type keeps its OWN semantics (Class A) ===');
{
  // A forward date list starts at today and only goes forward — the old
  // pickers' minimumDate rule, preserved by construction.
  const today = new Date(2026, 7, 19);
  const upcoming = upcomingDateChoices(today, 10);
  assert('4a. a forward list starts at today', upcoming[0].date.getTime() === today.getTime() && upcoming[0].label === 'Today');
  assert('4b. and never offers a past date', upcoming.every((c) => c.date.getTime() >= today.getTime()));
  assert('4c. its second entry is named Tomorrow', upcoming[1].label === 'Tomorrow' && upcoming[1].date.getTime() === new Date(2026, 7, 20).getTime());
  assert('4d. every entry is local midnight', upcoming.every((c) => c.date.getHours() === 0));
  // Crossing a month end forwards.
  const monthEnd = upcomingDateChoices(new Date(2026, 7, 30), 5);
  assert('4e. it crosses a month boundary correctly', monthEnd[2].date.getTime() === new Date(2026, 8, 1).getTime());
  // And a leap February.
  const feb = upcomingDateChoices(new Date(2028, 1, 28), 3);
  assert('4f. and a leap-year February correctly', feb[1].date.getTime() === new Date(2028, 1, 29).getTime() && feb[2].date.getTime() === new Date(2028, 2, 1).getTime());

  // Month/year is neither a day nor an anchor.
  assert('4g. twelve months are offered', MONTH_VALUES.length === 12 && MONTH_VALUES[0] === 1 && MONTH_VALUES[11] === 12);
  assert('4h. each has a real name', MONTH_VALUES.every((m) => monthName(m).length > 2));
  assert('4i. years start at the current one and run forward', (() => {
    const years = targetYearValues(today);
    return years[0] === 2026 && years[years.length - 1] === 2036 && years.every((y, i) => i === 0 || y === years[i - 1] + 1);
  })());
  assert('4j. a complete month/year reads plainly', describeMonthYear(8, 2026) === `${monthName(8)} 2026`);
  assert('4k. an incomplete or invalid one says Not set, never nonsense', describeMonthYear(null, 2026) === 'Not set' && describeMonthYear(8, null) === 'Not set' && describeMonthYear(13, 2026) === 'Not set' && describeMonthYear(0, 2026) === 'Not set');
}

console.log('\n=== 5. Recurrence and date engines untouched (Class C) ===');
{
  const bill = read(FORMS.bill);
  assert('5a. the bill still owns its own anchored monthly occurrence logic', /function nextOccurrence\(dayOfMonth: number\): string \{/.test(bill) && /anchoredMonthlyDate\(/.test(bill));
  assert('5b. the anchor still feeds the same string state the engine reads', /onChange=\{\(day\) => setDayOfMonth\(String\(day\)\)\}/.test(bill));
  assert('5c. the loan anchor likewise', /onChange=\{\(day\) => setRepaymentDayOfMonth\(String\(day\)\)\}/.test(read(FORMS.wealth)));
  assert('5d. the card due day likewise', /onChange=\{\(day\) => setDueDay\(String\(day\)\)\}/.test(read(FORMS.card)));
  assert('5e. the goal still writes the same month/year strings its validator reads', /setTargetMonth\(next\.month === null \? '' : String\(next\.month\)\);/.test(read(FORMS.goal)) && /classifyGoalDateFields/.test(read(FORMS.goal)));
  assert('5f. the presentation module computes no schedule at all', !/anchoredMonthlyDate|nextOccurrence|startOfToday/.test(stripComments(read('src/lib/dateFieldPresentation.ts'))));
}

console.log('\n=== 6. Icon tones — complete, stable and safe (Class A) ===');
{
  assert('6a. exactly six tone families', ADD_ICON_TONE_NAMES.length === 6 && ADD_ICON_TONES_LIST.length === 6);
  assert('6b. the two lists agree', ADD_ICON_TONE_NAMES.every((t) => (ADD_ICON_TONES_LIST as readonly string[]).includes(t)));

  // Every mapped item, in every map, has a valid tone.
  let checked = 0;
  const bad: string[] = [];
  for (const [mapName, map] of Object.entries(ALL_ADD_ICON_MAPS)) {
    for (const [key, spec] of Object.entries(map)) {
      checked++;
      if (!(ADD_ICON_TONE_NAMES as readonly string[]).includes(spec.tone)) bad.push(`${mapName}.${key} -> ${spec.tone}`);
      if (!spec.name) bad.push(`${mapName}.${key} -> empty name`);
    }
  }
  assert(`6c. all ${checked} mapped items carry a valid tone AND a name${bad.length ? ` (bad: ${bad.join(', ')})` : ''}`, bad.length === 0);

  // Both schemes resolve every family — so all six themes (3 styles x 2
  // schemes) do, since tones are scheme-scoped by design.
  for (const scheme of ['light', 'dark'] as const) {
    for (const tone of ADD_ICON_TONE_NAMES) {
      const pair = resolveAddIconTone(scheme, tone);
      assert(`6d. ${scheme}/${tone} resolves a foreground and a background`, !!pair.fg && !!pair.bg && pair.fg !== pair.bg);
    }
  }
  assert('6e. an unknown tone falls back rather than throwing', !!resolveAddIconTone('light', 'nonsense' as never).fg);

  // Domain stability: the same concept keeps its tone across maps.
  const t = (map: string, key: string) => ALL_ADD_ICON_MAPS[map][key]?.tone;
  assert('6f. cash is the same tone as an account source and an asset type', t('ADD_TASK_ICONS', 'cash') === t('ACCOUNT_SOURCE_ICONS', 'cash') && t('ACCOUNT_SOURCE_ICONS', 'cash') === t('ASSET_TYPE_ICONS', 'cash'));
  assert('6g. savings likewise', t('ADD_TASK_ICONS', 'savings') === t('ASSET_TYPE_ICONS', 'savings') && t('ASSET_TYPE_ICONS', 'savings') === t('ACCOUNT_SOURCE_ICONS', 'savings'));
  assert('6h. everyday likewise', t('ADD_TASK_ICONS', 'everyday') === t('ASSET_TYPE_ICONS', 'everyday') && t('ASSET_TYPE_ICONS', 'everyday') === t('ACCOUNT_SOURCE_ICONS', 'everyday'));
  assert('6i. a credit card is coral wherever it appears', t('ADD_TASK_ICONS', 'creditCard') === 'coral' && t('LIABILITY_TYPE_ICONS', 'credit_card') === 'coral' && t('ACCOUNT_SOURCE_ICONS', 'credit_card') === 'coral');
  assert('6j. the quick tray agrees with the catalogue', t('QUICK_ACTION_ICONS', 'record_spending') === t('ADD_TASK_ICONS', 'expense') && t('QUICK_ACTION_ICONS', 'add_bill') === t('ADD_TASK_ICONS', 'bill') && t('QUICK_ACTION_ICONS', 'move_money') === t('ADD_TASK_ICONS', 'transfer') && t('QUICK_ACTION_ICONS', 'add_goal') === t('ADD_TASK_ICONS', 'goal'));

  // Domain assignment, not decoration.
  assert('6k. every debt and credit item is coral', ['mortgage', 'credit_card', 'car_loan', 'personal_loan', 'bnpl', 'other'].every((k) => t('LIABILITY_TYPE_ICONS', k) === 'coral'));
  assert('6l. every goal purpose is violet except paying debt, which stays coral', (() => {
    const goals = ALL_ADD_ICON_MAPS.GOAL_PURPOSE_ICONS;
    return goals.debt_payoff.tone === 'coral' && Object.entries(goals).filter(([k]) => k !== 'debt_payoff').every(([, v]) => v.tone === 'violet');
  })());
  assert('6m. every bill preset is amber except the two that are genuinely loans', (() => {
    const bills = ALL_ADD_ICON_MAPS.BILL_TYPE_ICONS;
    return bills['Car Loan'].tone === 'coral' && bills['Personal Loan'].tone === 'coral' && Object.entries(bills).filter(([k]) => !k.includes('Loan')).every(([, v]) => v.tone === 'amber');
  })());
  assert('6n. income categories are mint', ['cat-salary', 'cat-side-hustle', 'cat-gift', 'cat-bonus', 'cat-other-income'].every((k) => t('CATEGORY_ICONS', k) === 'mint'));

  // THE SAFETY RULES — these tones are identity, never status. `urgent` is
  // this design system's destructive/error role, and `movementNegative` is
  // the "money went down" role; coral must be neither, in either scheme.
  const DESTRUCTIVE = (scheme: 'light' | 'dark') => [
    SHARED_COLORS[scheme].urgent,
    SHARED_COLORS[scheme].urgentText,
    SHARED_COLORS[scheme].movementNegative,
  ];
  assert(
    '6o. coral is NOT the destructive/error role, nor the negative-movement role, in either scheme',
    !DESTRUCTIVE('light').includes(ADD_ICON_TONES.light.coral.fg) && !DESTRUCTIVE('dark').includes(ADD_ICON_TONES.dark.coral.fg)
  );
  const POSITIVE = (scheme: 'light' | 'dark') => [SHARED_COLORS[scheme].success, SHARED_COLORS[scheme].movementPositive];
  assert(
    '6p. mint is NOT the success or positive-movement role either — income is not an achievement',
    !POSITIVE('light').includes(ADD_ICON_TONES.light.mint.fg) && !POSITIVE('dark').includes(ADD_ICON_TONES.dark.mint.fg)
  );
  assert('6q. no two families share a foreground in the same scheme', (() => {
    for (const scheme of ['light', 'dark'] as const) {
      const fgs = ADD_ICON_TONE_NAMES.map((t2) => ADD_ICON_TONES[scheme][t2].fg);
      if (new Set(fgs).size !== fgs.length) return false;
    }
    return true;
  })());
  // Scoped to the tone table itself: Wave 5 appended the retired
  // contrastOverrides roles further down the same file, and one of those is
  // explicitly a scrim FOR a gradient — which is not a tone using one.
  assert('6r. no tone uses a gradient', (() => {
    const file = read('src/theme/semanticTokens.ts');
    const table = file.split('Add-icon decorative tones')[1]?.split('Gradient-backed contrast roles')[0] ?? '';
    return !!table && !/gradient/i.test(table);
  })());
}

console.log('\n=== 7. Colour lives in the theme, never in a component (Class C) ===');
{
  const COMPONENTS = [
    'src/components/shared/AddIcon.tsx',
    'src/components/shared/fields/FocusedPickerHost.tsx',
    'src/components/shared/fields/FocusedPickerTrigger.tsx',
    'src/components/shared/fields/DateTriggerField.tsx',
    'src/components/shared/fields/DayOfMonthField.tsx',
    'src/components/shared/fields/MonthYearField.tsx',
  ];
  for (const rel of COMPONENTS) {
    assert(`7a. ${rel.split('/').pop()} contains no raw colour value`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(read(rel)));
  }
  const icon = read('src/components/shared/AddIcon.tsx');
  assert('7b. AddIcon reads its tone pair from the theme', /resolveAddIconTone\(scheme, icon\.tone\)/.test(icon));
  // Code only — the file's own comments say "never a gradient", which is
  // the point, so the check is against what it actually renders.
  assert('7c. one flat hue per tile — the background is the tone, never a gradient', /backgroundColor: tonePair\.bg,/.test(icon) && !/gradient/i.test(stripComments(icon)));
  assert('7d. and the glyph is the stronger member of the same family', /: tonePair\.fg;/.test(icon));
  assert('7e. icons stay decorative', (icon.match(/accessibilityElementsHidden/g) || []).length === 2 && !/accessibilityLabel|accessibilityRole/.test(icon));
  assert('7f. the retained tile dimensions are unchanged', /ADD_ICON_TILE_SIZE = 36/.test(icon) && /ADD_ICON_SIZE = 20/.test(icon) && /ADD_ICON_TILE_GLYPH_SIZE = 22/.test(icon));
}

console.log('\n=== 8. No dependency was added (Class C) ===');
{
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert('8a. no icon library beyond the pre-existing @expo/vector-icons', !!deps['@expo/vector-icons'] && !deps['lucide-react-native'] && !deps['react-native-vector-icons'] && !deps['@react-native-vector-icons/common']);
  assert('8b. Expo is unchanged', deps.expo === '^54.0.35');
  // The pre-existing @react-native-community/datetimepicker is still a
  // dependency (other, non-Wave-4 screens use it); the Add journey simply no
  // longer renders it. Nothing new was added alongside it.
  assert('8c. no calendar/date-picker package was added', Object.keys(deps).filter((d) => /calendar|datetimepicker|date-?picker/i.test(d)).join() === '@react-native-community/datetimepicker');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
