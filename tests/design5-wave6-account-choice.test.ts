// Nolie Design 5.1 Wave 6 final — the shared account chooser, the reminder
// composition, and the wording matrix.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): accountChoice.ts and reminderPresentation.ts are
//   pure and RN-free, so every row, grouping, wording and reflow assertion
//   runs the REAL production function.
// - Class C (structural): which handler a control reaches, the canonical
//   render order, and that eligibility resolvers were not touched.
// - NOT proven here: that any of it renders, or its pixel appearance. See
//   tests/rendered/design5-wave6-account-choice.render.test.tsx.
//
// Run with: npx tsx tests/design5-wave6-account-choice.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  incomeDestinationRows,
  billPaymentSourceRows,
  groupAccountChoices,
  accountChoiceAccessibilityLabel,
  accountRowStacksBalance,
  accountTypeLabel,
  splitResolverLabel,
  ACCOUNT_ROW_MIN_HEIGHT,
  CREDIT_CARD_GROUP_NOTE,
} from '../src/lib/calculations/accountChoice';
import { resolveEligibleIncomeDestinations } from '../src/lib/calculations/incomeDestinations';
import { resolveEligibleBillPaymentSources } from '../src/lib/calculations/billPaymentSources';
import {
  resolveReminderIdentity,
  billConfirmLabel,
  incomeDestinationTitle,
  incomeRecordingNotice,
  confirmationSummary,
  BILL_SOURCE_STEP,
  INCOME_DESTINATION_STEP,
  INCOME_CONFIRM_LABEL,
  PRIMARY_ACTION_MIN_HEIGHT,
  SNOOZE_ROW_MIN_HEIGHT,
  snoozeChoiceDateLabel,
} from '../src/lib/reminderPresentation';
import { Asset, CreditCard } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CARD = strip(read('src/components/today/SmartReminderCard.tsx'));
const LIST = strip(read('src/components/shared/AccountChoiceList.tsx'));
const MODEL = strip(read('src/lib/calculations/accountChoice.ts'));

const ASSETS: Asset[] = [
  { id: 'cash', type: 'cash', label: 'Cash', currentValue: 0 },
  { id: 'cba', type: 'everyday', label: 'CBA', currentValue: 22500 },
  { id: 'save', type: 'savings', label: 'Rainy day', currentValue: 4000 },
];
const CARDS: CreditCard[] = [
  { id: 'amex', issuer: 'AMEX', label: 'AMEX', creditLimit: 10000, currentBalance: 1150, dueDay: 20, minimumPayment: 40 } as CreditCard,
];

console.log('=== 1. One row shape, three slots, for every consumer (Class A) ===');
{
  const rows = billPaymentSourceRows(resolveEligibleBillPaymentSources(ASSETS, CARDS));
  const cba = rows.find((r) => r.id === 'cba')!;
  assert('1a. the name is the account\'s own, with no bracketed figure glued to it', cba.name === 'CBA');
  assert('1b. the type is spelled out in words, never left to an icon tint', cba.typeLabel === 'Everyday account');
  assert('1c. and the balance is its own slot', cba.balanceLabel === 'Balance · $22,500');
  const cash = rows.find((r) => r.id === 'cash')!;
  assert('1d. a zero cash balance is shown honestly, never hidden', cash.balanceLabel === 'Balance · $0');
  assert('1e. cash reads as a cash balance, not an account', cash.typeLabel === 'Cash balance');

  const amex = rows.find((r) => r.id === 'amex')!;
  assert('1f. a card\'s figure is what is OWED — never called a balance beside real balances', amex.balanceLabel === '$1,150 owed');
  assert('1g. and it is flagged so the row can render it differently', amex.owed === true);
  assert('1h. money rows are never flagged as owed', rows.filter((r) => r.kind !== 'credit_card').every((r) => !r.owed));

  const income = incomeDestinationRows(resolveEligibleIncomeDestinations(ASSETS));
  assert('1i. income rows use the identical shape', income.every((r) => typeof r.name === 'string' && typeof r.typeLabel === 'string' && typeof r.balanceLabel === 'string'));
  assert('1j. savings is named as savings', income.find((r) => r.id === 'save')!.typeLabel === 'Savings account');
  assert('1k. every kind has a word for itself', ['cash', 'everyday', 'savings', 'credit_card'].every((k) => accountTypeLabel(k as never).length > 0));
}

console.log('\n=== 2. The resolver labels are split, not duplicated (Class A) ===');
{
  assert('2a. the bracketed figure is removed from the name', splitResolverLabel('CBA ($22,500.00)') === 'CBA');
  assert('2b. a provider suffix is kept — it is part of the name', splitResolverLabel('Everyday · CBA ($1.00)') === 'Everyday · CBA');
  assert('2c. and the de-duplication suffix is KEPT — it is the only thing telling two rows apart', splitResolverLabel('Cash ($5.00) — Account 2').includes('Account 2'));
  const dupes: Asset[] = [
    { id: 'a', type: 'everyday', label: 'Everyday', currentValue: 10 },
    { id: 'b', type: 'everyday', label: 'Everyday', currentValue: 10 },
  ];
  const rows = incomeDestinationRows(resolveEligibleIncomeDestinations(dupes));
  assert('2d. so two identically-named accounts stay distinguishable', rows[0].name !== rows[1].name);
}

console.log('\n=== 3. Grouping keeps cards separate and captioned (Class A) ===');
{
  const groups = groupAccountChoices(billPaymentSourceRows(resolveEligibleBillPaymentSources(ASSETS, CARDS)));
  assert('3a. two groups when cards are eligible', groups.length === 2);
  assert('3b. money accounts first, and headed once cards exist', groups[0].title === 'Money accounts');
  assert('3c. cards under their own heading', groups[1].title === 'Credit cards');
  assert('3d. with the note explaining what choosing one does', groups[1].note === CREDIT_CARD_GROUP_NOTE);
  assert('3e. and that note says the bill is recorded AGAINST the card', /records the bill against that card balance/.test(CREDIT_CARD_GROUP_NOTE));
  assert('3f. no card ever appears in the money group', groups[0].rows.every((r) => r.kind !== 'credit_card'));

  const noCards = groupAccountChoices(billPaymentSourceRows(resolveEligibleBillPaymentSources(ASSETS, [])));
  assert('3g. with no cards there is ONE unheaded group — no pointless heading', noCards.length === 1 && noCards[0].title === null);
  assert('3h. an empty set produces no groups at all, never an empty heading', groupAccountChoices([]).length === 0);
}

console.log('\n=== 4. Eligibility is READ, never rewritten (Class A + C) ===');
{
  // Each consumer's contract differs legitimately. The shared row model must
  // not quietly harmonise them.
  const income = incomeDestinationRows(resolveEligibleIncomeDestinations(ASSETS));
  assert('4a. income can credit savings', income.some((r) => r.kind === 'savings'));
  assert('4b. and never a credit card', income.every((r) => r.kind !== 'credit_card'));

  const bill = billPaymentSourceRows(resolveEligibleBillPaymentSources(ASSETS, CARDS));
  assert('4c. a bill can be charged to a card', bill.some((r) => r.kind === 'credit_card'));
  assert('4d. and never paid from savings — computeBalanceEffect has no savings-funded-expense branch', bill.every((r) => r.kind !== 'savings'));
  assert('4e. that card branch genuinely exists in the engine, so cards are not an unfiltered catalogue', /source === 'credit_card' && t\.creditCardId/.test(read('src/state/AppStateContext.tsx')));
  assert('4f. and it moves the card balance and its mirrored liability', /currentBalance: card\.currentBalance \+ sign \* t\.amount/.test(read('src/state/AppStateContext.tsx')));

  assert('4g. the repayment forms still filter to assets only, excluding cards', (() => {
    const hook = strip(read('src/hooks/useCreditCardRepaymentForm.ts'));
    return /resolveEligibleBillPaymentSources\(data\.assets, \[\]\)\.filter\(\(o\) => o\.kind === 'asset'\)/.test(hook);
  })());
  assert('4h. and the loan form does the same', (() => {
    const hook = strip(read('src/hooks/useLoanRepaymentForm.ts'));
    return /resolveEligibleBillPaymentSources\(data\.assets, \[\]\)\.filter\(\(o\) => o\.kind === 'asset'\)/.test(hook);
  })());
  assert('4i. neither eligibility module was edited by this pass', !/AccountChoiceRow|accountChoice/.test(read('src/lib/calculations/incomeDestinations.ts')) && !/AccountChoiceRow|accountChoice/.test(read('src/lib/calculations/billPaymentSources.ts')));
  assert('4j. and the presentation model performs no filtering of its own', !/ELIGIBLE|isEligible|\.filter\(\(a\) => a\.type/.test(MODEL));
}

console.log('\n=== 5. The row is accessible, and says each fact once (Class A + C) ===');
{
  const row = billPaymentSourceRows(resolveEligibleBillPaymentSources(ASSETS, CARDS)).find((r) => r.id === 'cba')!;
  assert('5a. one spoken string carries name, type and balance', accountChoiceAccessibilityLabel(row) === 'CBA. Everyday account. Balance · $22,500.');
  assert('5b. the visual balance column is hidden from the reader, so it is not said twice', (LIST.match(/accessibilityElementsHidden/g) || []).length >= 4 && /styles\.balanceInline[\s\S]{0,120}accessibilityElementsHidden/.test(LIST) && /styles\.balanceStacked[\s\S]{0,120}accessibilityElementsHidden/.test(LIST));
  assert('5c. the row announces its selected state', /accessibilityState=\{\{ selected, disabled: !!disabled \}\}/.test(LIST));
  assert('5d. as a radio, so a screen reader describes a choice rather than a button', /accessibilityRole="radio"/.test(LIST));
  assert('5e. selection is never colour alone — a check glyph changes too', /name=\{selected \? 'checkmark-circle' : 'ellipse-outline'\}/.test(LIST));
  assert('5f. and the border weight changes as well', /rowSelected: \{ borderWidth: 2/.test(LIST));
  assert('5g. rows meet a 56pt target', ACCOUNT_ROW_MIN_HEIGHT === 56 && /minHeight: ACCOUNT_ROW_MIN_HEIGHT/.test(LIST));
  assert('5h. cards and money accounts differ by icon, not only by tint', /credit_card: 'card'/.test(LIST) && /everyday: 'card-outline'/.test(LIST) && /cash: 'wallet-outline'/.test(LIST));
}

console.log('\n=== 6. The row reflows rather than truncating (Class A) ===');
{
  assert('6a. 390pt at normal scale keeps the balance beside the name', !accountRowStacksBalance(390, 1));
  assert('6b. 430pt likewise', !accountRowStacksBalance(430, 1));
  assert('6c. 375pt likewise', !accountRowStacksBalance(375, 1));
  assert('6d. 320pt moves it beneath', accountRowStacksBalance(320, 1));
  assert('6e. font scale 1.3 moves it beneath at every width', [320, 375, 390, 430].every((w) => accountRowStacksBalance(w, 1.3)));
  assert('6f. and ~200% Dynamic Type likewise', [320, 375, 390, 430].every((w) => accountRowStacksBalance(w, 2)));
  assert('6g. the name is never clipped to one line', /numberOfLines=\{2\}/.test(LIST));
  assert('6h. and the row has no fixed height that could clip it', !/height: \d+,\s*\n?\s*\}/.test(LIST.slice(LIST.indexOf('row: {'), LIST.indexOf('rowSelected'))));
}

console.log('\n=== 7. The presentation layer mutates nothing (Class C) ===');
{
  assert('7a. the row model creates no transaction and writes no state', !/addTransaction|updateAsset|persist\(|AsyncStorage|confirm[A-Z]/.test(MODEL));
  assert('7b. the list component holds no selection state of its own', !/useState/.test(LIST));
  assert('7c. it only reports which row was tapped', /onSelect\(row\.id\)/.test(LIST));
  assert('7d. and never calls a financial function', !/confirmRecurringOccurrence|confirmBnplRepayment|confirmCreditCardRepayment|addTransaction/.test(LIST));
}

console.log('\n=== 8. Selection is separated from confirmation (Class C) ===');
{
  // The defect: the old pickers fired the caller's mutation from onPress.
  assert('8a. the bill list only sets the selected id', /onSelect=\{setSelectedSourceId\}/.test(CARD));
  assert('8b. the income list only sets the selected id', /onSelect=\{setSelectedDestinationId\}/.test(CARD));
  assert('8c. no mutation is reachable from either onSelect', !/onSelect=\{confirmBillPaidFromSource\}/.test(CARD) && !/onSelect=\{confirmSalaryToDestination\}/.test(CARD));
  assert('8d. the bill mutation runs from its own confirm control', /testID="bill-confirm-action"[\s\S]{0,200}|confirmBillPaidFromSource\(chosen\)/.test(CARD) && /confirmBillPaidFromSource\(chosen\)/.test(CARD));
  assert('8e. the income mutation likewise', /selectedDestinationId && confirmSalaryToDestination\(selectedDestinationId\)/.test(CARD));
  assert('8f. and both confirm controls are inert until an account is chosen', /disabled=\{!selectedSourceId \|\| isSubmitting\}/.test(CARD) && /disabled=\{!selectedDestinationId \|\| isSubmitting\}/.test(CARD));
  assert('8g. explicit confirmation is required even with a single eligible account — no auto-confirm branch exists', !/length === 1[\s\S]{0,120}confirm(BillPaidFromSource|SalaryToDestination)/.test(CARD));
  assert('8h. Back clears the pending selection in both journeys', /setAwaitingSource\(false\);\s*\n\s*setSelectedSourceId\(null\);/.test(CARD) && /setAwaitingIncomeDestination\(false\);\s*\n\s*setSelectedDestinationId\(null\);/.test(CARD));
  assert('8i. the confirm resolves the id back to the engine\'s own option object', /eligibleBillPaymentSources\.find\(\(o\) => o\.id === selectedSourceId\)/.test(CARD));
  assert('8j. double-submit protection is unchanged', /setIsSubmitting\(true\)/.test(CARD) && (CARD.match(/isSubmitting/g) || []).length >= 8);
}

console.log('\n=== 9. Step copy says what is recorded, and what is not (Class A) ===');
{
  assert('9a. the bill step asks where it was paid FROM', BILL_SOURCE_STEP.title === 'Where was this paid from?');
  assert('9b. and states the limit of what Nolie does, in one short line', BILL_SOURCE_STEP.body === 'This records the payment in Nolie. It does not move money at your bank.');
  assert('9c. the income step names the amount in its question', incomeDestinationTitle(100) === 'Where did the $100 arrive?');
  assert('9d. degrading to a question without a figure rather than inventing one', incomeDestinationTitle(undefined) === 'Where did this arrive?');
  assert('9e. and explains the choice', INCOME_DESTINATION_STEP.body === 'Choose the account Nolie should add this income to.');
  assert('9f. the income notice states the destination is the customer\'s choice', /adds \$100 to the account you choose in Nolie/.test(incomeRecordingNotice(100) as string));
  assert('9g. and that nothing moves at their bank', /does not move money at your bank/.test(incomeRecordingNotice(100) as string));
  assert('9h. suppressed entirely when the amount is unusable — never a fabricated figure', incomeRecordingNotice(undefined) === null);
  assert('9i. the bill confirm names the amount at ordinary scale', billConfirmLabel(250, 1) === 'Record $250 payment');
  assert('9j. and falls back to a generic label at large Dynamic Type, rather than truncating', billConfirmLabel(250, 1.3) === 'Record payment');
  assert('9k. and for a very large amount', billConfirmLabel(123456789, 1) === 'Record payment');
  assert('9l. income confirms with its own verb', INCOME_CONFIRM_LABEL === 'Record income');
  const summary = confirmationSummary({ amount: 250, accountName: 'CBA', dateISO: new Date(2026, 7, 21).toISOString() }) as string;
  assert('9m. the confirmation summary states amount, account and date', /^\$250 from CBA · /.test(summary) && /21/.test(summary) && /Aug/.test(summary));
  assert('9n. and is withheld until an account is actually chosen', confirmationSummary({ amount: 250, accountName: null }) === null);
}

// NOTE ON DATES. Every supporting line formats its day with
// toLocaleDateString(undefined, {day:'numeric', month:'short'}), so the
// day/month ORDER is the device's, not this app's — the owner's iOS device
// renders "21 Aug", an en-US host renders "Aug 21", and a Thai device
// renders Thai. The assertions below therefore check which FACTS a line
// carries and that none is repeated; they deliberately do not pin a host
// locale, which would pass here and prove nothing on a phone.
console.log('\n=== 10. The wording matrix (Class A) ===');
{
  const due = resolveReminderIdentity({ kind: 'bill_due_soon', name: 'Rent', amount: 250, occurrenceISO: new Date(2026, 7, 22).toISOString(), daysUntil: 1 });
  assert('10a. due tomorrow: status says when', due.status.label === 'Due tomorrow');
  assert('10b. title is the item, not a question', due.title === 'Rent');
  assert('10c. one supporting line carries amount and date', /^\$250 due tomorrow · /.test(due.supportLine as string) && /22/.test(due.supportLine as string));

  const today = resolveReminderIdentity({ kind: 'bill_overdue', name: 'Rent', amount: 250, occurrenceISO: new Date(2026, 7, 21).toISOString(), daysUntil: 0 });
  assert('10d. due today: status', today.status.label === 'Due today');
  assert('10e. and support line', /^\$250 due today · /.test(today.supportLine as string) && /21/.test(today.supportLine as string));

  const over = resolveReminderIdentity({ kind: 'bill_overdue', name: 'Rent', amount: 250, occurrenceISO: new Date(2026, 7, 21).toISOString(), daysUntil: -3 });
  assert('10f. overdue: status', over.status.label === 'Overdue');
  assert('10g. and the line says WAS due, with the date — not "overdue" a second time', /^\$250 was due /.test(over.supportLine as string) && /21/.test(over.supportLine as string));
  assert('10h. an overdue line never repeats the status word', !/overdue/i.test(over.supportLine as string));

  const income = resolveReminderIdentity({ kind: 'salary_check', name: 'Dividends', amount: 100, occurrenceISO: new Date(2026, 7, 21).toISOString(), daysUntil: 0 });
  assert('10i. income: status is EXPECTED, never "due" — nobody owes Nolie', income.status.label === 'Expected');
  assert('10j. the customer\'s own casing survives — never lower-cased', income.title === 'Dividends');
  assert('10k. and the line says expected, with the date', /^\$100 expected /.test(income.supportLine as string) && /21/.test(income.supportLine as string));

  assert('10l. no identity is ever built from a template around a name', !/Did you pay|Did your|your \$\{|Your \$\{/.test(strip(read('src/lib/reminderPresentation.ts'))));
  assert('10m. a nameless reminder degrades to a neutral title, never an empty one', resolveReminderIdentity({ kind: 'bill_due_soon', name: null, amount: 10, daysUntil: 1 }).title === 'Reminder');
  assert('10n. a reminder with no amount still gets a readable line', resolveReminderIdentity({ kind: 'bill_due_soon', name: 'Rent', daysUntil: 1 }).supportLine === 'Due tomorrow');
  assert('10o. and one with no date at all still gets one', resolveReminderIdentity({ kind: 'bill_due_soon', name: 'Rent', amount: 250, daysUntil: null }).supportLine === '$250 due');
}

console.log('\n=== 11. Canonical composition order (Class C) ===');
{
  const iFacts = CARD.indexOf('testID="reminder-fact-grid"');
  const iCardFacts = CARD.indexOf('cardFacts && cardFacts.facts.length > 0');
  const iPrimary = CARD.indexOf('testID="reminder-primary-action"');
  const iRecord = CARD.indexOf('testID="reminder-record-payment"');
  const iSecondary = CARD.indexOf('testID="reminder-snooze-action"');
  const iTitle = CARD.indexOf('testID="reminder-title"');
  const iSupport = CARD.indexOf('testID="reminder-support-line"');

  assert('11a. title comes before the supporting line', iTitle > 0 && iSupport > iTitle);
  assert('11b. the supporting line comes before the facts', iFacts > iSupport);
  assert('11c. the bill facts come before ANY primary action', iFacts < iPrimary && iFacts < iRecord);
  assert('11d. the card facts do too', iCardFacts < iRecord && iCardFacts < iPrimary);
  assert('11e. and the secondary row comes after both', iSecondary > iPrimary && iSecondary > iRecord);
  assert('11f. exactly one full-width primary style exists', /primaryAction: \{\s*width: '100%'/.test(CARD));
  assert('11g. at 52pt', PRIMARY_ACTION_MIN_HEIGHT === 52 && /minHeight: PRIMARY_ACTION_MIN_HEIGHT/.test(CARD));
  assert('11h. never success green before a confirmed outcome', /backgroundColor: semantic\.interactive,\s*\n\s*marginTop/.test(CARD) && !/primaryAction[\s\S]{0,200}semantic\.success/.test(CARD));
}

console.log('\n=== 12. Snooze and Dismiss are genuinely equal (Class C) ===');
{
  assert('12a. width is a function of the row, not of the label length', /flexGrow: 1,\s*\n\s*flexBasis: 0,/.test(CARD));
  assert('12b. no flexWrap can let one button take a different width', !/suppressionRow: \{[^}]*flexWrap/.test(CARD));
  assert('12c. both share one identical box style', (CARD.match(/styles\.suppressionButton/g) || []).length === 4);
  assert('12d. with the same minimum height', /minHeight: 56,/.test(CARD));
  assert('12e. they stack deterministically at large type', /suppressionRowStacked: \{ flexDirection: 'column' \}/.test(CARD) && /stackActions \? styles\.suppressionRowStacked/.test(CARD));
  assert('12f. Dismiss is never a filled control', /dismissButton: \{ backgroundColor: 'transparent'/.test(CARD));
  assert('12g. and never stronger than the primary — it carries no interactive fill', !/dismissButton[\s\S]{0,120}semantic\.interactive/.test(CARD));
}

console.log('\n=== 13. Snooze choices are complete, dated rows (Class A + C) ===');
{
  assert('13a. each is a 52pt row, not a pill', SNOOZE_ROW_MIN_HEIGHT === 52 && /minHeight: SNOOZE_ROW_MIN_HEIGHT/.test(CARD));
  assert('13b. with a calendar icon', /name="calendar-outline"/.test(CARD));
  assert('13c. and the REAL date beside the label', /snoozeChoiceDateLabel\(target\)/.test(CARD));
  assert('13d. which names the weekday too, so the day is unambiguous', /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(snoozeChoiceDateLabel(new Date(2026, 7, 24))));
  assert('13e. "Choose another date" is its own row with a chevron', /Choose another date/.test(CARD) && /name="chevron-forward"/.test(CARD));
  assert('13f. Tomorrow is never rendered disabled', !/disabled[\s\S]{0,80}reminder-snooze-\$\{preset\.id\}/.test(CARD));
  assert('13g. quick choices still act directly — no financial-style confirmation was added to a snooze', /onPress=\{\(\) => confirmSnooze\(target\)\}/.test(CARD));
  assert('13h. and Back is a real 44pt named control, not floating text', /stepBack: \{[^}]*minHeight: 44/.test(CARD) && /testID="reminder-snooze-back"/.test(CARD));
  assert('13i. every Back in this surface uses that same control', (CARD.match(/style=\{styles\.stepBack\}/g) || []).length === 4);
}

console.log('\n=== 14. What was removed stayed removed (Class C) ===');
{
  assert('14a. no party emoji reaches the reminder surface', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(CARD));
  assert('14b. nor the Briefing row', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(strip(read('src/lib/calculations/briefingPriorityRows.ts'))));
  assert('14c. the row is named by the item, not the engine\'s question', /reminderRowLabel\(topReminder, data \?\? null\)/.test(strip(read('src/lib/calculations/briefingPriorityRows.ts'))));
  assert('14d. and reminders.ts still holds its own untouched prose', /Did your \$\{upcomingIncome\.label\.toLowerCase\(\)\} arrive\?/.test(read('src/lib/calculations/reminders.ts')));
  assert('14e. the visible "Not yet" is gone from every branch', !/accessibilityLabel="Not yet"/.test(CARD));
  assert('14f. but deferReminder survives for the loan fallback that still needs it', /function deferReminder\(\)/.test(CARD) && /: deferReminder\(\)\)/.test(CARD));
  assert('14g. the superseded chip pickers are no longer imported here', !/BillPaymentSourcePicker|IncomeDestinationPicker/.test(CARD.replace(/[A-Za-z]*Picker's/g, '')));
  assert('14h. and the repayment forms\' dead chip styles were removed, not left behind', !/sourceChip|sourceRow/.test(read('src/components/credit/LoanRepaymentFormFields.tsx')) && !/sourceChip|sourceRow/.test(read('src/components/credit/CreditCardRepaymentFormFields.tsx')));
  assert('14i. no raw colour was introduced on any touched surface', !/#[0-9a-fA-F]{6}/.test(CARD) && !/#[0-9a-fA-F]{6}/.test(LIST));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
