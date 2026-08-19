// Nolie Design 5.1 Wave 4 — the shared component/field system.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): src/components/shared/fields/
//   moneyFieldMessage.ts and src/components/shared/sheetChrome.ts are both
//   pure and RN-free, so every assertion in sections 1 and 5 runs the real
//   shipped function. moneyFieldMessage imports the real
//   src/lib/calculations/money.ts, so the grammar under test is the shipped
//   grammar, not a copy.
// - Class C (structural): sections 2, 3, 4 and 6 read the .tsx sources.
//   They prove wiring — accessibility roles, the reserved error row, the
//   absence of a second native modal — not rendered pixels.
// - NOT proven here: how any of this looks or behaves on a device. Six-theme
//   appearance, keyboard behaviour and real screen-reader output are device
//   evidence.
//
// Run with: npx tsx tests/design5-component-system.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { describeMoneyInput } from '../src/components/shared/fields/moneyFieldMessage';
import { sheetChromeStyles, SHEET_GRABBER_WIDTH, SHEET_GRABBER_HEIGHT } from '../src/components/shared/sheetChrome';
import { parseMoneyInput, parseMoneyInputAllowZero } from '../src/lib/calculations/money';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const SHARED = path.resolve(__dirname, '../src/components/shared');
const read = (rel: string) => fs.readFileSync(path.join(SHARED, rel), 'utf8');
const stripComments = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const PRIMITIVES = [
  'Button.tsx',
  'Chip.tsx',
  'Segmented.tsx',
  'Toast.tsx',
  'Disclosure.tsx',
  'FinancialFigure.tsx',
  'SectionCard.tsx',
  'EmptyState.tsx',
  'ProgressBar.tsx',
  'MetricCard.tsx',
  'fields/FieldShell.tsx',
  'fields/TextField.tsx',
  'fields/CurrencyField.tsx',
  'fields/PickerTrigger.tsx',
  'fields/InlineSelect.tsx',
  'rows/Row.tsx',
  'rows/SelectableRow.tsx',
];

console.log('=== 1. The currency field NEVER decides validity — it only describes (Class A) ===');
{
  // The single most important property of the whole wave: Wave 4 added a
  // money INPUT component, and it must be impossible for that component to
  // widen or narrow what the app accepts as money.
  const cases = [
    '1200', '1200.00', '1200.5', '.50', '0', '0.00', '120.', '',
    '1200abc', '1.2.3', '1e3', '120.1234', '189.001', '-5', ' 12 ', '$12', '12,00',
  ];
  let mismatches = 0;
  for (const raw of cases) {
    for (const allowZero of [false, true]) {
      const parser = allowZero ? parseMoneyInputAllowZero : parseMoneyInput;
      const grammarSaysValid = parser(raw.trim()).valid;
      const messageShown = describeMoneyInput({ raw, allowZero, required: true });
      // A message is shown if and only if the shipped grammar rejected it
      // (or the field is required and empty, which the grammar also
      // rejects). There is no input the field calls fine that the grammar
      // rejects, and none it complains about that the grammar accepts.
      if (grammarSaysValid !== (messageShown === null)) mismatches++;
    }
  }
  assert(`1a. across ${cases.length * 2} cases, "shows a message" matches "the real grammar rejected it" exactly`, mismatches === 0);

  assert('1b. an empty OPTIONAL field is silent — never nagged for being blank', describeMoneyInput({ raw: '', allowZero: false, required: false }) === null);
  assert('1c. an empty REQUIRED field is named plainly', describeMoneyInput({ raw: '', allowZero: false, required: true }) === 'Enter an amount.');
  assert('1d. whitespace-only is treated as empty, not as malformed', describeMoneyInput({ raw: '   ', allowZero: false, required: false }) === null);

  // The required device case, verbatim from the Wave 4 device script.
  assert('1e. "189.001" is described in words, naming cents as the reason', describeMoneyInput({ raw: '189.001', allowZero: false, required: true }) === 'Amounts go to cents — at most two digits after the decimal point.');
  assert('1f. letters are named as the reason', describeMoneyInput({ raw: '120abc', allowZero: false, required: true }) === 'Amounts can only use numbers and a decimal point.');
  assert('1g. a currency symbol is named as the reason (it is not silently stripped)', describeMoneyInput({ raw: '$12', allowZero: false, required: true }) === 'Amounts can only use numbers and a decimal point.');
  assert('1h. two decimal points are named as the reason', describeMoneyInput({ raw: '1.2.3', allowZero: false, required: true }) === 'Use a single decimal point.');
  assert('1i. zero is rejected in words when the field does not allow zero', describeMoneyInput({ raw: '0', allowZero: false, required: true }) === 'Enter an amount greater than zero.');
  assert('1j. zero is ACCEPTED silently when the field does allow zero — the two parsers stay distinct', describeMoneyInput({ raw: '0', allowZero: true, required: true }) === null);
  assert('1k. "0.00" is also rejected in words when zero is not allowed', describeMoneyInput({ raw: '0.00', allowZero: false, required: true }) === 'Enter an amount greater than zero.');
  assert('1l. a valid amount is silent', describeMoneyInput({ raw: '1200.50', allowZero: false, required: true }) === null);

  // Negative values: the grammar has no sign branch at all, so a minus sign
  // is a character problem, not a "too small" problem. The wording must not
  // imply the app supports negative amounts.
  assert('1m. "-5" is described as a character problem, never as a negative amount', describeMoneyInput({ raw: '-5', allowZero: true, required: true }) === 'Amounts can only use numbers and a decimal point.');
}

console.log('\n=== 2. Every interactive primitive declares an accessibility role — no bare TouchableOpacity (Class C) ===');
{
  for (const file of PRIMITIVES) {
    const src = stripComments(read(file));
    const touchables = (src.match(/<TouchableOpacity\b/g) || []).length;
    if (touchables === 0) continue;
    const roles = (src.match(/accessibilityRole=/g) || []).length;
    assert(`2a. ${file}: ${touchables} TouchableOpacity, ${roles} accessibilityRole — every one is declared`, roles >= touchables);
  }
  // Roles must be the RIGHT ones, not merely present.
  assert('2b. Chip is a button reporting `selected`', /accessibilityRole="button"/.test(read('Chip.tsx')) && /accessibilityState=\{\{ selected, disabled \}\}/.test(read('Chip.tsx')));
  assert('2c. Segmented is a radiogroup of radios, each reporting `checked`', /accessibilityRole="radiogroup"/.test(read('Segmented.tsx')) && /accessibilityRole="radio"/.test(read('Segmented.tsx')) && /checked: active/.test(read('Segmented.tsx')));
  assert('2d. SelectableRow is a radio reporting `checked`', /accessibilityRole="radio"/.test(read('rows/SelectableRow.tsx')) && /checked: selected/.test(read('rows/SelectableRow.tsx')));
  assert('2e. PickerTrigger is a button whose label carries its CURRENT selection, so a reader hears the value not just the field name', /accessibilityRole="button"/.test(read('fields/PickerTrigger.tsx')) && /accessibilityLabel=\{label \? `\$\{label\}, \$\{isEmpty \? placeholder : value\}`/.test(read('fields/PickerTrigger.tsx')));
  assert('2f. Disclosure reports `expanded` — a customer is never left unsure whether it opened', /accessibilityState=\{\{ expanded \}\}/.test(read('Disclosure.tsx')));
  assert('2g. Button reports both `disabled` and `busy`, so a loading button is not announced as merely tappable', /accessibilityState=\{\{ disabled: isDisabled, busy: loading \}\}/.test(read('Button.tsx')));
  assert('2h. Row announces its supporting line as part of ONE label, never as a second stop', /accessibilityLabel=\{accessibilityLabel \?\? \(supporting \? `\$\{title\}\. \$\{supporting\}` : title\)\}/.test(read('rows/Row.tsx')));
  assert('2i. an inert Row (no onPress) declares NO role at all — nothing for a reader to try to activate', /if \(!onPress\) \{[\s\S]*?<View style=\{\[styles\.row, style\]\} testID=\{testID\}>/.test(read('rows/Row.tsx')));
  assert('2j. FinancialFigure is announced as text, never as a heading', /accessibilityRole="text"/.test(read('FinancialFigure.tsx')));
}

console.log('\n=== 3. Every interactive primitive meets the 44pt minimum target (Class C) ===');
{
  const needsTarget = ['Button.tsx', 'Chip.tsx', 'Segmented.tsx', 'Disclosure.tsx', 'fields/TextField.tsx', 'fields/CurrencyField.tsx', 'fields/PickerTrigger.tsx', 'rows/Row.tsx', 'rows/SelectableRow.tsx'];
  for (const file of needsTarget) {
    const src = stripComments(read(file));
    assert(`3a. ${file}: sizes from the shared minTouchTarget token, never a hardcoded height`, /minHeight: minTouchTarget/.test(src));
  }
  // Segmented's segments sit inside a padded track, so their own minHeight
  // is the track's target minus that padding on both sides — still 44pt at
  // the tappable outer edge.
  assert('3b. Segmented derives its segment height from the token minus its own padding, not from a magic number', /minHeight: minTouchTarget - spacing\.xs \* 2/.test(read('Segmented.tsx')));
}

console.log('\n=== 4. The error line is RESERVED — a validation message can never shift the layout (Class C) ===');
{
  const shell = read('fields/FieldShell.tsx');
  assert('4a. the message row is rendered unconditionally', /\{\/\* Always rendered[\s\S]*?<View style=\{styles\.messageRow\}>/.test(shell));
  assert('4b. it reserves a minimum height', /messageRow: \{ minHeight: RESERVED_MESSAGE_MIN_HEIGHT \}/.test(shell));
  assert('4c. the reservation is minHeight, not a fixed height — a wrapped message at 200% type may still grow', !/messageRow: \{ height:/.test(shell));
  assert('4d. only the message TEXT is conditional, never the row that holds it', /<View style=\{styles\.messageRow\}>\s*\n\s*\{message \? \(/.test(shell));
  assert('4e. an error message is announced politely, a hint is not announced at all', /accessibilityLiveRegion=\{tone === 'error' \? 'polite' : 'none'\}/.test(shell));

  // Every field primitive must route through the shell rather than
  // hand-rolling its own message row, or the reservation is not global.
  for (const file of ['fields/TextField.tsx', 'fields/CurrencyField.tsx', 'fields/PickerTrigger.tsx']) {
    assert(`4f. ${file} renders through FieldShell`, /<FieldShell/.test(read(file)));
  }
  assert('4g. InlineSelect inherits the reservation via PickerTrigger, not a second copy', /<PickerTrigger/.test(read('fields/InlineSelect.tsx')) && !/<FieldShell/.test(read('fields/InlineSelect.tsx')));
}

console.log('\n=== 5. Sheet chrome is defined ONCE and the three sheets share it (Class A + Class C) ===');
{
  const style = sheetChromeStyles({
    surface: '#FFF', scrim: 'rgba(0,0,0,0.4)', grabber: '#CCC',
    radiusCard: 20, spacingSm: 8, spacingMd: 12, spacingLg: 16, insetBottom: 34,
  });
  assert('5a. the sheet is anchored to the bottom behind a scrim', style.backdrop.justifyContent === 'flex-end' && style.backdrop.backgroundColor === 'rgba(0,0,0,0.4)');
  assert('5b. only the TOP corners are rounded', style.sheet.borderTopLeftRadius === 20 && style.sheet.borderTopRightRadius === 20);
  assert('5c. bottom padding respects a real home-indicator inset', style.sheet.paddingBottom === 34);
  assert('5d. and never falls below the design minimum on a device with no inset', sheetChromeStyles({ surface: '#FFF', scrim: 'x', grabber: '#CCC', radiusCard: 20, spacingSm: 8, spacingMd: 12, spacingLg: 16, insetBottom: 0 }).sheet.paddingBottom === 16);
  assert('5e. the grabber is a centred 36x4 pill', SHEET_GRABBER_WIDTH === 36 && SHEET_GRABBER_HEIGHT === 4 && style.grabber.alignSelf === 'center' && style.grabber.borderRadius === 2);

  for (const file of ['InfoSheet.tsx', 'OptionsSheet.tsx', 'DatePickerModal.tsx']) {
    const src = read(file);
    assert(`5f. ${file} consumes the shared chrome`, /sheetChromeStyles\(\{/.test(src));
    assert(`5g. ${file} no longer defines its own backdrop/sheet block`, !/^\s+backdrop: \{ flex: 1, backgroundColor/m.test(src));
  }
  // The consolidation is CHROME only. Each sheet's dismissal lifecycle is
  // the documented modal-freeze guard and must survive untouched.
  assert("5h. OptionsSheet still defers onSelect to the native onDismiss, with its Android fallback — the freeze guard is not part of the consolidation", /onDismiss=\{Platform\.OS === 'ios' \? runPendingSelection : undefined\}/.test(read('OptionsSheet.tsx')) && /setTimeout\(runPendingSelection, ANDROID_DISMISS_FALLBACK_MS\)/.test(read('OptionsSheet.tsx')));
  assert('5i. DatePickerModal still wraps a Modal on iOS only', /if \(Platform\.OS !== 'ios'\) \{/.test(read('DatePickerModal.tsx')));
}

console.log('\n=== 6. The primitives introduce NO second native modal and NO timeout coordination (Class C) ===');
{
  // Modal hard rule 2. The in-form selector that replaced the removed
  // chooser pages exists precisely so a category choice never opens a
  // second native modal on top of the sheet or workspace already showing.
  for (const file of PRIMITIVES) {
    const src = stripComments(read(file));
    assert(`6a. ${file}: renders no <Modal>`, !/<Modal\b/.test(src));
  }
  assert('6b. InlineSelect reveals its options inline, in the same tree', /\{open && !disabled \? \(/.test(read('fields/InlineSelect.tsx')));
  assert('6c. choosing an option closes the list without any timer', /onChange\(o\.value\);\s*\n\s*setOpen\(false\);/.test(read('fields/InlineSelect.tsx')));

  // Toast is the one primitive with a timer, and it is a display lifetime,
  // not coordination between two surfaces.
  const toast = stripComments(read('Toast.tsx'));
  assert('6d. Toast\'s only timer is its own display lifetime, taken from the shared motion token', /const life = MOTION_MS\.toastLife;/.test(toast) && (toast.match(/setTimeout\(/g) || []).length === 1);
  assert('6e. Toast announces on mount, never gated on its animation having run (motion hard rule 5)', /useEffect\(\(\) => \{\s*\n\s*AccessibilityInfo\.announceForAccessibility\(message\);/.test(toast));
  const others = PRIMITIVES.filter((f) => f !== 'Toast.tsx');
  let timers = 0;
  for (const f of others) if (/setTimeout\(/.test(stripComments(read(f)))) timers++;
  assert('6f. no other primitive uses a timer at all', timers === 0);
}

console.log('\n=== 7. Extensions to the pre-existing components are ADDITIVE (Class C) ===');
{
  // Every one of these was already shipping with existing call sites. A
  // Wave 4 extension that changed a default would silently restyle screens
  // this wave is not allowed to touch.
  assert('7a. Button still defaults to primary, and `danger` is a new fourth variant', /variant = 'primary'/.test(read('Button.tsx')) && /type Variant = 'primary' \| 'secondary' \| 'ghost' \| 'danger';/.test(read('Button.tsx')));
  assert('7b. SectionCard renders no header at all unless a title/supporting is passed', /\{title \|\| supporting \? \(/.test(read('SectionCard.tsx')));
  assert('7c. ProgressBar: an explicit `color` still wins over the new `tone`', /const fillColor = color \?\? toneColor;/.test(read('ProgressBar.tsx')));
  assert('7d. MetricCard: an explicit `valueColor` still wins over the new `tone`', /toneColor \? \{ color: toneColor \} : null, valueColor \? \{ color: valueColor \} : null/.test(read('MetricCard.tsx')));
  assert('7e. EmptyState defaults to the neutral tone, so existing callers are unchanged', /tone = 'neutral'/.test(read('EmptyState.tsx')));
  assert('7f. MetricCard and FinancialFigure both use tabular figures so columns of amounts align', /fontVariant: \['tabular-nums'\]/.test(read('MetricCard.tsx')) && /fontVariant: \['tabular-nums'\]/.test(read('FinancialFigure.tsx')));
  // Code only — the doc comment names formatMoney to say who DOES format.
  assert('7g. FinancialFigure formats nothing itself — it cannot introduce a rounding difference', !/toFixed|toLocaleString|formatMoney/.test(stripComments(read('FinancialFigure.tsx'))));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
