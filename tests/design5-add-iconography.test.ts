// Nolie Design 5.1 Wave 4 device correction — one icon language for Add.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): every map in src/lib/addIcons.ts
//   is imported and executed, and every name it yields is checked against
//   Ionicons' OWN shipped glyph map
//   (@expo/vector-icons/.../glyphmaps/Ionicons.json) — plain JSON, so no
//   react-native import is needed. A misspelled name would otherwise render
//   as an invisible box only a device could reveal.
// - Class A also for src/lib/dateFieldPresentation.ts and
//   src/lib/categoryEmoji.ts.
// - Class C (structural): the emoji gate and the decorative-icon contract.
//
// NOT proven here: how the icons look. That is device evidence.
//
// Run with: npx tsx tests/design5-add-iconography.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_ADD_ICON_MAPS,
  QUICK_ACTION_ICONS,
  ADD_TASK_ICONS,
  CATEGORY_ICONS,
  BILL_TYPE_ICONS,
  INCOME_SOURCE_ICONS,
  ASSET_TYPE_ICONS,
  LIABILITY_TYPE_ICONS,
  ACCOUNT_SOURCE_ICONS,
  GOAL_PURPOSE_ICONS,
  FALLBACK_ICON,
  resolveAddIcon,
  categoryIcon,
  goalPurposeIcon,
} from '../src/lib/addIcons';
import { categoryIconSpec, categoryEmoji } from '../src/lib/categoryEmoji';

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

/** Ionicons' own shipped glyph map — the authority on which names exist. */
const IONICONS: Record<string, number> = JSON.parse(
  read('node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json')
);

/**
 * Multicoloured, platform-styled pictographic emoji — the thing being
 * removed. Deliberately NOT a blanket "any character above U+2000" sweep:
 * a plain dingbat such as U+2713 CHECK MARK renders monochrome in the text
 * colour on every platform and is typography, not an OS-drawn icon.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]|[\u{2600}-\u{27BF}]\u{FE0F}|\u{FE0F}/u;

console.log('=== 1. Every mapped icon name is a REAL Ionicons glyph (Class A) ===');
{
  assert('1a. the Ionicons glyph map loaded and is non-trivial', Object.keys(IONICONS).length > 500);

  let checked = 0;
  const bad: string[] = [];
  for (const [mapName, map] of Object.entries(ALL_ADD_ICON_MAPS)) {
    for (const [key, icon] of Object.entries(map)) {
      checked++;
      if (!(icon.name in IONICONS)) bad.push(`${mapName}.${key} -> "${icon.name}"`);
    }
  }
  assert(`1b. all ${checked} mapped names exist in Ionicons${bad.length ? ` (bad: ${bad.join(', ')})` : ''}`, bad.length === 0);
  assert('1c. the fallback itself is a real glyph', FALLBACK_ICON in IONICONS);
  assert('1d. every map is non-empty', Object.values(ALL_ADD_ICON_MAPS).every((m) => Object.keys(m).length > 0));
}

console.log('\n=== 2. Coverage — every surface the correction names (Class A) ===');
{
  const QUICK_KEYS = ['record_spending', 'income_received', 'add_bill', 'move_money', 'add_goal', 'more'];
  assert('2a. all six quick actions are mapped', QUICK_KEYS.every((k) => k in QUICK_ACTION_ICONS) && Object.keys(QUICK_ACTION_ICONS).length === 6);

  const TASK_KEYS = [
    'income', 'income_received', 'expense', 'bill', 'transfer', 'cash', 'savings',
    'everyday', 'investment', 'property', 'retirement', 'liability', 'creditCard', 'goal',
  ];
  assert('2b. all fourteen Add catalogue tasks are mapped', TASK_KEYS.every((k) => k in ADD_TASK_ICONS) && Object.keys(ADD_TASK_ICONS).length === 14);

  // Every seeded category id the app ships must resolve to a real glyph, not
  // silently fall back.
  const SEEDED = Object.keys(CATEGORY_ICONS);
  assert('2c. every seeded category maps to a real glyph', SEEDED.length >= 20 && SEEDED.every((id) => CATEGORY_ICONS[id].name in IONICONS));

  const BILL_LABELS = ['Rent', 'Mortgage', 'Utilities', 'Phone', 'Internet', 'Gym', 'Subscription', 'Car', 'Car Loan', 'Personal Loan', 'Insurance', 'Other'];
  assert('2d. all twelve bill presets are mapped', BILL_LABELS.every((l) => l in BILL_TYPE_ICONS) && Object.keys(BILL_TYPE_ICONS).length === 12);

  const INCOME_IDS = ['cat-salary', 'cat-side-hustle', 'cat-investment-income', 'cat-rental-income', 'cat-gift', 'cat-other-income'];
  assert('2e. all six income sources are mapped', INCOME_IDS.every((k) => k in INCOME_SOURCE_ICONS));

  const ASSET_TYPES = ['cash', 'savings', 'everyday', 'etf', 'shares', 'super', 'crypto', 'property', 'business', 'car', 'furniture', 'collectibles', 'other'];
  assert('2f. every AssetType is mapped', ASSET_TYPES.every((t) => t in ASSET_TYPE_ICONS));

  const LIABILITY_TYPES = ['mortgage', 'credit_card', 'car_loan', 'personal_loan', 'bnpl', 'other'];
  assert('2g. every LiabilityType is mapped', LIABILITY_TYPES.every((t) => t in LIABILITY_TYPE_ICONS));

  const SOURCES = ['cash', 'everyday', 'savings', 'credit_card', 'loan', 'other'];
  assert('2h. every account/funding-source type is mapped', SOURCES.every((t) => t in ACCOUNT_SOURCE_ICONS));

  const GOALS = ['emergency_fund', 'house_deposit', 'holiday', 'investment_target', 'debt_payoff', 'car', 'business', 'retire_early', 'financial_freedom', 'custom'];
  assert('2i. every LifeGoalType is mapped', GOALS.every((g) => g in GOAL_PURPOSE_ICONS) && Object.keys(GOAL_PURPOSE_ICONS).length === 10);
}

console.log('\n=== 3. Resolution never fails, and never returns an emoji (Class A) ===');
{
  assert('3a. an unknown key resolves to the fallback, never undefined', resolveAddIcon(CATEGORY_ICONS, 'cat-does-not-exist').name === FALLBACK_ICON);
  assert('3b. null and undefined resolve to the fallback', resolveAddIcon(CATEGORY_ICONS, null).name === FALLBACK_ICON && resolveAddIcon(CATEGORY_ICONS, undefined).name === FALLBACK_ICON);
  assert('3c. an empty string resolves to the fallback', resolveAddIcon(CATEGORY_ICONS, '').name === FALLBACK_ICON);
  assert('3d. no resolved value is ever an emoji', Object.values(ALL_ADD_ICON_MAPS).every((m) => Object.values(m).every((v) => !EMOJI.test(v.name))));
  assert('3e. the convenience resolvers agree with their maps', categoryIcon('cat-groceries') === CATEGORY_ICONS['cat-groceries'] && goalPurposeIcon('holiday') === GOAL_PURPOSE_ICONS.holiday);

  // The renamed category helper returns an ICON now, on both its new name
  // and its retained deprecated alias.
  assert('3f. categoryIconSpec returns the icon AND its tone', categoryIconSpec('cat-travel').name === 'airplane-outline' && categoryIconSpec('cat-travel').tone === 'ocean');
  assert('3g. the deprecated categoryEmoji alias also returns an icon name, never an emoji', categoryEmoji('cat-travel') === 'airplane-outline' && !EMOJI.test(categoryEmoji('cat-travel')));
}

console.log('\n=== 4. THE GATE — no emoji in Add/Goal configuration or forms (Class C) ===');
{
  const ADD_SURFACES = [
    'src/lib/addIcons.ts',
    'src/lib/categoryEmoji.ts',
    'src/components/navigation/quickActions.ts',
    'src/components/navigation/AddAnythingSheet.tsx',
    'src/components/dashboard/QuickAddModal.tsx',
    'src/components/money/AddRecurringItemModal.tsx',
    'src/components/income/AddIncomeModal.tsx',
    'src/components/wealth/AddWealthItemModal.tsx',
    'src/components/wealth/TransferForm.tsx',
    'src/components/goals/AddGoalModal.tsx',
    'src/components/shared/fields/AccountSelectionField.tsx',
    'src/components/shared/fields/InlineSelect.tsx',
    'src/components/shared/fields/PickerTrigger.tsx',
    'src/components/shared/fields/DayOfMonthField.tsx',
    'src/components/shared/fields/DateTriggerField.tsx',
    'src/components/shared/fields/BalanceUpdateField.tsx',
    'src/components/shared/rows/SelectableRow.tsx',
    'src/components/shared/AddIcon.tsx',
  ];
  for (const rel of ADD_SURFACES) {
    assert(`4a. ${rel.split('/').pop()} contains no emoji`, !EMOJI.test(read(rel)));
  }
  // Configuration data specifically: no `emoji:` field survives anywhere in
  // the Add journey.
  for (const rel of ADD_SURFACES) {
    assert(`4b. ${rel.split('/').pop()} declares no emoji field`, !/\bemoji\s*:/.test(stripComments(read(rel))));
  }
}

console.log('\n=== 5. Icons are decorative; the parent owns the label (Class C) ===');
{
  const icon = read('src/components/shared/AddIcon.tsx');
  assert('5a. AddIcon hides itself from the accessibility tree, in BOTH its bare and tiled forms', (icon.match(/accessibilityElementsHidden/g) || []).length === 2 && (icon.match(/importantForAccessibility="no-hide-descendants"/g) || []).length === 2);
  assert('5b. it never declares a label or a role of its own', !/accessibilityLabel|accessibilityRole/.test(icon));
  assert('5c. functional icons are 20-22pt', /export const ADD_ICON_SIZE = 20;/.test(icon) && /export const ADD_ICON_TILE_GLYPH_SIZE = 22;/.test(icon));
  assert('5d. the tint container is 32-36pt', /export const ADD_ICON_TILE_SIZE = 36;/.test(icon));
  assert('5e. colour comes only from semantic theme roles — no raw values', !/#[0-9a-fA-F]{3,8}|rgba?\(/.test(icon));

  // The parents still carry complete labels.
  const sheet = read('src/components/navigation/AddAnythingSheet.tsx');
  assert('5f. a catalogue row still announces label, qualifier and draft as one item', /\[o\.label, o\.qualifier, parked \? 'draft saved' : null\]\.filter\(Boolean\)\.join\(', '\)/.test(sheet));
  const account = read('src/components/shared/fields/AccountSelectionField.tsx');
  assert('5g. an account row still composes its own full label', /const parts = \[choice\.name, choice\.typeLabel\];/.test(account));
  // Wave 4 closure — the purpose cards moved into the SHARED GoalFormFields,
  // which create and edit both render, so the guarantee is now proven once
  // for both modes instead of only for the create form.
  const goal = read('src/components/goals/GoalFormFields.tsx');
  assert('5h. a goal purpose card still owns its label and reports checked', /accessibilityState=\{\{ checked: active, selected: active \}\}/.test(goal) && /accessibilityLabel=\{g\.label\}/.test(goal));
  assert('5i. and its selected state is not colour alone', /\{active \? <Ionicons name="checkmark-circle"/.test(goal) && /borderColor: colors\.accent, borderWidth: 1/.test(goal));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
