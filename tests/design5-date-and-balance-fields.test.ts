// Nolie Design 5.1 Wave 4 device correction — date, recurring-day and
// balance-update fields.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): src/lib/dateFieldPresentation.ts
//   is pure and RN-free, so every date/ordinal assertion runs the shipped
//   function. The recurrence engine itself is NOT re-implemented here — it
//   is asserted to be untouched.
// - Class C (structural): the component contracts (no modal, no timeout,
//   event-driven keyboard handling, one Balance update section).
//
// NOT proven here: real keyboard timing on a device, or native scroll
// position. Both stay device evidence.
//
// Run with: npx tsx tests/design5-date-and-balance-fields.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { decidePickerReveal, shouldConsumeKeyboardHide } from '../src/components/shared/fields/pickerTriggerBehaviour';
import {
  DAY_OF_MONTH_VALUES,
  ordinalDay,
  describeDayOfMonth,
  describeDate,
  formatFullDate,
  quickDateChoices,
  shouldWaitForKeyboardHide,
} from '../src/lib/dateFieldPresentation';

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

const DAY_FIELD = read('src/components/shared/fields/DayOfMonthField.tsx');
const DATE_FIELD = read('src/components/shared/fields/DateTriggerField.tsx');
const MONTH_YEAR_FIELD = read('src/components/shared/fields/MonthYearField.tsx');
// Wave 4 closure — the keyboard sequence, the focus contract and the
// Done/Cancel contract moved OUT of the individual fields and into these two
// shared modules, so every Add date field now provably shares one
// implementation instead of three similar ones.
const TRIGGER = read('src/components/shared/fields/FocusedPickerTrigger.tsx');
const HOST = read('src/components/shared/fields/FocusedPickerHost.tsx');
const BALANCE_FIELD = read('src/components/shared/fields/BalanceUpdateField.tsx');
const QUICK_ADD = read('src/components/dashboard/QuickAddModal.tsx');
const BILL = read('src/components/money/AddRecurringItemModal.tsx');
const WEALTH = read('src/components/wealth/AddWealthItemModal.tsx');

console.log('=== 1. A recurring DAY is a number 1-31, never a calendar date (Class A) ===');
{
  assert('1a. exactly 31 options, 1 through 31', DAY_OF_MONTH_VALUES.length === 31 && DAY_OF_MONTH_VALUES[0] === 1 && DAY_OF_MONTH_VALUES[30] === 31);
  assert('1b. ordinals are correct for the awkward cases', ordinalDay(1) === '1st' && ordinalDay(2) === '2nd' && ordinalDay(3) === '3rd' && ordinalDay(4) === '4th');
  assert('1c. the teens are all "th", not "1st/2nd/3rd"', ordinalDay(11) === '11th' && ordinalDay(12) === '12th' && ordinalDay(13) === '13th');
  assert('1d. the twenties resume correctly', ordinalDay(21) === '21st' && ordinalDay(22) === '22nd' && ordinalDay(23) === '23rd' && ordinalDay(31) === '31st');
  assert('1e. every one of the 31 options renders an ordinal', DAY_OF_MONTH_VALUES.every((d) => /^\d{1,2}(st|nd|rd|th)$/.test(ordinalDay(d))));

  assert('1f. the collapsed row speaks in customer language', describeDayOfMonth(25) === '25th of each month');
  assert('1g. an unset anchor says so plainly', describeDayOfMonth(null) === 'Not set');
  assert('1h. an out-of-range or non-integer value is treated as unset, never rendered as nonsense', describeDayOfMonth(0) === 'Not set' && describeDayOfMonth(32) === 'Not set' && describeDayOfMonth(4.5) === 'Not set');
}

console.log('\n=== 2. A real calendar date keeps real date semantics (Class A) ===');
{
  // Local dates throughout — constructed with the local constructor, never
  // parsed from a UTC string, so the comparison is on calendar days.
  const today = new Date(2026, 7, 18); // 18 August 2026, local
  assert('2a. today is named "Today" and still shows its exact date', (() => {
    const d = describeDate(new Date(2026, 7, 18), today);
    return d.primary === 'Today' && d.secondary === formatFullDate(new Date(2026, 7, 18));
  })());
  assert('2b. yesterday is named "Yesterday"', describeDate(new Date(2026, 7, 17), today).primary === 'Yesterday');
  assert('2c. anything older is named by weekday, with its exact date beneath', (() => {
    const d = describeDate(new Date(2026, 7, 11), today);
    return d.primary !== 'Today' && d.primary !== 'Yesterday' && !!d.secondary;
  })());
  assert('2d. an unset optional date says "Not set" and shows no second line', (() => {
    const d = describeDate(null, today);
    return d.primary === 'Not set' && d.secondary === null;
  })());

  // Late-evening local time must still read as Today — the exact case a
  // UTC-based comparison gets wrong.
  assert('2e. 11pm local on the same calendar day is still "Today"', describeDate(new Date(2026, 7, 18, 23, 30), today).primary === 'Today');
  // And a month/year boundary must not confuse it.
  const newYear = new Date(2027, 0, 1);
  assert('2f. 1 January is "Today" and 31 December is "Yesterday"', describeDate(new Date(2027, 0, 1), newYear).primary === 'Today' && describeDate(new Date(2026, 11, 31), newYear).primary === 'Yesterday');
}

console.log('\n=== 3. The quick choices preserve the pre-correction date OUTCOMES (Class A) ===');
{
  const today = new Date(2026, 7, 18);
  const choices = quickDateChoices(today);
  assert('3a. four choices, matching the four shortcut chips they replaced', choices.length === 4);
  assert('3b. Today = today', choices[0].key === 'today' && choices[0].date.getTime() === new Date(2026, 7, 18).getTime());
  assert('3c. Yesterday = -1 day', choices[1].date.getTime() === new Date(2026, 7, 17).getTime());
  assert('3d. 2 days ago = -2 days', choices[2].date.getTime() === new Date(2026, 7, 16).getTime());
  assert('3e. Last week = -7 days', choices[3].date.getTime() === new Date(2026, 7, 11).getTime());
  assert('3f. every choice is local midnight, never a partial-day instant', choices.every((c) => c.date.getHours() === 0 && c.date.getMinutes() === 0 && c.date.getSeconds() === 0));
  // Crossing a month boundary backwards must land in the previous month.
  const firstOfMonth = quickDateChoices(new Date(2026, 7, 1));
  assert('3g. going back across a month boundary lands correctly', firstOfMonth[1].date.getTime() === new Date(2026, 6, 31).getTime() && firstOfMonth[3].date.getTime() === new Date(2026, 6, 25).getTime());
  // And across a leap-year February.
  const marchFirst = quickDateChoices(new Date(2028, 2, 1));
  assert('3h. 1 March 2028 (leap year) goes back to 29 February', marchFirst[1].date.getTime() === new Date(2028, 1, 29).getTime());
}

console.log('\n=== 4. The keyboard rule is event-driven, never timed (Class A + Class C) ===');
{
  assert('4a. a picker waits only when a keyboard is actually up', shouldWaitForKeyboardHide(true) === true && shouldWaitForKeyboardHide(false) === false);
  // The decision itself is now a pure, shared rule every trigger runs.
  // Wave 4 closure — activation is now a three-phase machine so the picker
  // shell mounts on the tap rather than after the keyboard has gone. The
  // rule is unchanged in intent: a keyboard defers the REVEAL, no keyboard
  // reveals immediately, and anything already on screen closes.
  assert('4a-i. the shared rule coordinates when a keyboard is up, reveals immediately otherwise, and closes anything already on screen', (() => {
    return (
      decidePickerReveal({ keyboardVisible: true, phase: 'idle' }) === 'activate-then-coordinate' &&
      decidePickerReveal({ keyboardVisible: false, phase: 'idle' }) === 'reveal-now' &&
      decidePickerReveal({ keyboardVisible: true, phase: 'open' }) === 'close' &&
      decidePickerReveal({ keyboardVisible: false, phase: 'open' }) === 'close' &&
      // A second tap DURING the handoff closes too — it can never stack.
      decidePickerReveal({ keyboardVisible: true, phase: 'activating' }) === 'close'
    );
  })());
  assert('4a-ii. a keyboard hide is only consumed by a trigger that asked for one', shouldConsumeKeyboardHide(true) === true && shouldConsumeKeyboardHide(false) === false);

  const trigger = stripComments(TRIGGER);
  assert(
    '4b. activation mounts the shell FIRST, then dismisses the keyboard — never the other way round',
    /if \(decision === 'activate-then-coordinate'\) \{[\s\S]*?setPhase\('activating'\);\s*\n\s*Keyboard\.dismiss\(\);/.test(trigger)
  );
  assert(
    '4c. the reveal is completed by the keyboard\'s OWN events, both of them, with the second a no-op',
    /Keyboard\.addListener\('keyboardWillHide', complete\)/.test(trigger) &&
      /Keyboard\.addListener\('keyboardDidHide', complete\)/.test(trigger) &&
      /if \(!shouldConsumeKeyboardEvent\(phaseRef\.current\)\) return;/.test(trigger)
  );
  assert(
    "4c-i. and the keyboard's own duration is handed to the surface so the two move together",
    /picker\?\.coordinateWithKeyboard\(event\?\.duration\);/.test(trigger)
  );
  assert('4d. there is no timer anywhere in the shared trigger', !/setTimeout|setInterval|requestAnimationFrame|InteractionManager/.test(trigger));
  assert('4d-i. nor in the shared surface', !/setTimeout|setInterval|requestAnimationFrame|InteractionManager/.test(stripComments(HOST)));
  assert('4e. nor in any of the three field types', [DAY_FIELD, DATE_FIELD, MONTH_YEAR_FIELD].every((f) => !/setTimeout|setInterval|requestAnimationFrame|InteractionManager/.test(stripComments(f))));
  assert('4f. with no keyboard up, the picker reveals in the same commit', /if \(decision === 'activate-then-coordinate'\) \{[\s\S]*?return;\s*\n\s*\}\s*\n\s*reveal\(\);/.test(trigger));
  assert('4g. all three field types share that one trigger — none re-implements the sequence', [DAY_FIELD, DATE_FIELD, MONTH_YEAR_FIELD].every((f) => /<FocusedPickerTrigger/.test(f) && !/Keyboard\.(dismiss|isVisible)/.test(f)));
}

console.log('\n=== 5. The picker is visible by construction — no form scrolling (Class C) ===');
{
  const host = stripComments(HOST);
  // The correction the owner recorded: an inline panel below the fold, with
  // the form expected to scroll to it. The surface now covers the sheet, so
  // there is nothing to scroll to.
  assert('5a. the surface fills the sheet rather than expanding inline', /\.\.\.StyleSheet\.absoluteFillObject,/.test(host));
  assert('5b. nothing scrolls the underlying form to reach it', !/scrollTo|scrollToEnd|measureLayout|panelY/.test(host) && !/scrollTo|scrollRef/.test(stripComments(TRIGGER)));
  // Code only — DateTriggerField's doc comment names `scrollTo` precisely to
  // record that it no longer does it.
  assert('5b-i. and no field measures its own position any more', [DAY_FIELD, DATE_FIELD, MONTH_YEAR_FIELD].every((f) => !/onLayout|scrollTo|scrollRef/.test(stripComments(f))));
  // RECONCILED (Wave 11 focus consolidation): both moves now go through
  // the ONE focus authority (a11yFocus.sendFocusEvent/focusElement — the
  // supported cross-platform mechanism, no findNodeHandle, no deprecated
  // setAccessibilityFocus). 5d's old pin matched code that read a ref NO
  // writer ever set — the return move was silently dead since Wave 4; the
  // trigger now passes its own row node and the host focuses it at close.
  assert('5c. accessibility focus moves to the picker heading on reveal, through the one authority', /sendFocusEvent\(headingRef\);/.test(host));
  assert('5d. and genuinely returns to the originating trigger on close (node re-checked at use)', /focusElement\(active\.getReturnFocusNode\?\.\(\)\);/.test(host) && /getReturnFocusNode: \(\) => rowRef\.current,/.test(stripComments(read('src/components/shared/fields/FocusedPickerTrigger.tsx'))));
  assert('5e. the panel has an explicit heading', /<Text ref=\{headingRef\} style=\{styles\.heading\} accessibilityRole="header">/.test(host));
  assert('5f. and both Done and Cancel controls', /label="Cancel"/.test(host) && /label="Done"/.test(host));
  assert('5g. the PICKER scrolls internally if it must, never the form behind it', /<ScrollView style=\{styles\.body\}/.test(host) && /maxHeight: '90%'/.test(host));
  assert('5h. while it is open nothing behind it is reachable', /accessibilityViewIsModal/.test(host));
  assert('5i. and the sheet suspends its own drag-dismiss for exactly that long', /gesturesEnabledRef\.current = gesturesEnabled && !pickerActive;/.test(read('src/components/shared/KeyboardSheet.tsx')));
}

console.log('\n=== 6. Opening and cancelling can never change a value; Done commits once (Class C) ===');
{
  const trigger = stripComments(TRIGGER);
  const host = stripComments(HOST);
  assert('6a. the trigger seeds its draft from the current value every time it opens', /setDraft\(value\);\s*\n\s*setPhase\('open'\);/.test(trigger));
  assert('6b. Cancel resets the draft and commits nothing', /onCancel: \(\) => \{\s*\n\s*setPhase\('idle'\);\s*\n[\s\S]*?setDraft\(value\);\s*\n\s*\}/.test(trigger));
  assert('6c. only Done commits, and it is the ONLY call to onCommit', /onDone: \(\) => \{\s*\n\s*setPhase\('idle'\);\s*\n\s*onCommit\(draft\);\s*\n\s*\}/.test(trigger) && (trigger.match(/onCommit\(/g) || []).length === 1);
  assert('6d. exactly one of the two runs, exactly once, per close', /if \(commit\) active\.onDone\(\);\s*\n\s*else active\.onCancel\(\);/.test(host));
  assert('6e. and the surface is torn down before either runs, so neither can fire twice', /const active = request;\s*\n\s*setRequest\(null\);/.test(host));
  assert('6f. Done and Cancel close only the picker — nothing calls the journey-level close', !/onClose\(\)|onConfirmedClose/.test(host));
}

console.log('\n=== 7. No second native modal anywhere in the new fields (Class C) ===');
{
  for (const [name, src] of [
    ['DayOfMonthField', DAY_FIELD],
    ['DateTriggerField', DATE_FIELD],
    ['MonthYearField', MONTH_YEAR_FIELD],
    ['FocusedPickerTrigger', TRIGGER],
    ['FocusedPickerHost', HOST],
    ['BalanceUpdateField', BALANCE_FIELD],
  ] as const) {
    assert(`7a. ${name} renders no <Modal>`, !/<Modal\b/.test(stripComments(src)));
    assert(`7b. ${name} imports no Modal`, !/\bModal\b/.test(stripComments(src).split('\n').filter((l) => l.startsWith('import')).join('\n')));
  }
  assert('7c. the transaction form no longer renders raw DD/MM/YYYY boxes in the normal journey', !/placeholder="DD"|placeholder="YYYY"/.test(QUICK_ADD));
  assert('7d. nor a permanent shortcut chip rail', !/DATE_PRESETS/.test(QUICK_ADD));
}

console.log('\n=== 8. The forms wire the RIGHT control to the RIGHT concept (Class C) ===');
{
  assert('8a. a bill\'s monthly anchor uses the day-of-month field, not a calendar', /<DayOfMonthField\s*\n\s*label="Day of month due"/.test(BILL));
  assert('8b. and it still feeds the same string state the recurrence engine reads', /onChange=\{\(day\) => setDayOfMonth\(String\(day\)\)\}/.test(BILL));
  assert('8c. a loan repayment anchor uses it too', /<DayOfMonthField\s*\n\s*label="Day of month due"/.test(WEALTH) && /onChange=\{\(day\) => setRepaymentDayOfMonth\(String\(day\)\)\}/.test(WEALTH));
  assert('8d. a transaction DATE uses the calendar-date trigger', /<DateTriggerField\s*\n\s*label="Date"/.test(QUICK_ADD));
  assert('8e. under the customer-facing heading, not a technical one', /When did this happen\?/.test(QUICK_ADD) && !/>Date<\/Text>/.test(QUICK_ADD));
  assert('8f. and it still writes the SAME day/month/year state handleSave has always read', /setDay\(String\(next\.getDate\(\)\)\);\s*\n\s*setMonth\(String\(next\.getMonth\(\) \+ 1\)\);\s*\n\s*setYear\(String\(next\.getFullYear\(\)\)\);/.test(QUICK_ADD));
  assert('8g. handleSave still builds the date locally, exactly as before', /const isoDate = new Date\(yearValue, monthValue - 1, dayValue\)\.toISOString\(\);/.test(QUICK_ADD));
}

console.log('\n=== 9. The recurrence and date engines are untouched (Class C) ===');
{
  // The correction is presentation only. These are the functions that decide
  // real schedule outcomes, and none of them may have moved into a field.
  assert('9a. the bill form still owns its own nextOccurrence/anchor logic', /function nextOccurrence\(dayOfMonth: number\): string \{/.test(BILL) && /anchoredMonthlyDate\(/.test(BILL));
  // Code only — the module's doc comment names those functions precisely to
  // say that it does NOT do their job.
  assert('9b. no presentation module computes a schedule', !/anchoredMonthlyDate|nextOccurrence|startOfToday/.test(stripComments(read('src/lib/dateFieldPresentation.ts'))));
  assert('9c. the date field stores nothing and formats no money', !/persist|useAppState|formatMoney/.test(stripComments(DATE_FIELD)));
  assert('9d. the day field computes no date at all', !/new Date\(/.test(stripComments(DAY_FIELD)));
}

console.log('\n=== 10. Exactly ONE Balance update section, with exactly two choices (Class C) ===');
{
  const balance = stripComments(BALANCE_FIELD);
  assert('10a. the section heading is the customer-facing wording', /Balance update/.test(balance));
  assert('10b. no internal wording is exposed', !/targetAssetId|appliedBalanceEffect|[Tt]racked balance/.test(balance));
  assert('10c. exactly two choices are rendered when a balance can be updated', (balance.match(/renderChoice\(/g) || []).length === 3); // 1 definition + 2 call sites
  assert('10d. rows are at least 52pt', /export const BALANCE_ROW_MIN_HEIGHT = 52;/.test(balance) && /minHeight: BALANCE_ROW_MIN_HEIGHT/.test(balance));
  assert('10e. each choice is a radio reporting checked', /accessibilityRole="radio"/.test(balance) && /accessibilityState=\{\{ checked: selected, selected \}\}/.test(balance));
  assert('10f. selection is signalled by border, fill AND a tick — never colour alone', /rowSelected: \{ backgroundColor: colors\.accentSoft, borderColor: colors\.accent, borderWidth: 1 \}/.test(balance) && /icon=\{iconSpec\(selected \? 'checkmark-circle' : 'ellipse-outline'\)\}/.test(balance));
  assert('10g. the supporting copy says plainly what will happen, per mode', /Subtract this amount when the transaction is saved\./.test(balance) && /Add this amount when the income is saved\./.test(balance) && /Save the transaction without changing a balance\./.test(balance));
  assert('10h. exactly ONE informational card in the missing state', (balance.match(/testID \? `\$\{testID\}-missing` : undefined/g) || []).length === 1);
  assert('10i. with at most one Add action', (balance.match(/addBalanceLabel && onAddBalance/g) || []).length === 1);
  assert('10j. there is no disabled-looking control without an explanation — the missing state replaces the choices entirely', /\{accountName === null \? \(/.test(balance));

  // And the form uses it exactly once per transaction type.
  assert('10k. the transaction form renders exactly one expense and one income Balance update section', (QUICK_ADD.match(/<BalanceUpdateField/g) || []).length === 2 && /mode="expense"/.test(QUICK_ADD) && /mode="income"/.test(QUICK_ADD));
  assert('10l. the duplicate Add-cash prompt that used to sit above it is gone', !/cashPromptBox|cashPromptButtonPrimary/.test(QUICK_ADD));
  assert('10m. Cash is the only source offering an Add action', /title: "Cash balance isn't set up",[\s\S]*?actionLabel: 'Add cash balance',/.test(QUICK_ADD));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
