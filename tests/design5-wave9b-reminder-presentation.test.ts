// Nolie Design 5.1 Wave 9b closure — reminder presentation.
//
// TWO DEFECTS, both confirmed on device.
//
// 1. TYPOGRAPHY. `SmartReminderCard` owns the reminder overview and every
//    reminder state, and it spread `tokens.typography.*` at 19 call sites.
//    That token carries NO `fontFamily`, so the entire reminder journey
//    rendered in the iOS platform font rather than Figtree / Noto Sans Thai.
//    The same omission affected BriefingTileRow and LoanBalanceReminderCard.
//
// 2. THE BNPL SOURCE STATE. Tapping "Record repayment" fell back to three
//    ragged pills, and `onPress={() => confirmBillPaid('cash')}` performed
//    the FINANCIAL MUTATION IMMEDIATELY — there was no separation between
//    choosing a source and confirming. "From credit card" could not even
//    succeed: the transition requires `creditCardId` and the component
//    never supplied one, so it returned `invalid_source`. The copy also
//    said the repayment would be recorded "as an expense", contradicting
//    the accepted specialised accounting that excludes it from ordinary
//    spending and recorded cashflow.
//
// CLASSIFICATION: Class C (structural) — reads the real sources. The
// runtime font proof lives in the rendered suites' own font sweep; the
// financial reconciliation lives in design5-wave9b-bnpl-reminder.test.ts.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9b-reminder-presentation.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';

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

/** Every component that renders customer-visible reminder text. */
const REMINDER_TREE: readonly string[] = [
  'src/components/today/SmartReminderCard.tsx',
  'src/components/today/ReminderDetailSheet.tsx',
  'src/components/today/BriefingTileRow.tsx',
  'src/components/today/BriefingPriorityRow.tsx',
  'src/components/today/TodayBriefingCard.tsx',
  'src/components/today/LoanBalanceReminderCard.tsx',
];

const CARD = read('src/components/today/SmartReminderCard.tsx');
const CARD_CODE = code(CARD);

console.log('=== 1. The whole reminder journey resolves the shipped type roles ===');
{
  for (const rel of REMINDER_TREE) {
    const c = code(read(rel));
    const name = rel.split('/').pop();
    assert(`1a. ${name} spreads no tokens.typography.*`, !/\.\.\.typography\./.test(c));
    // A component with no Text of its own legitimately needs no resolver.
    const ownsText = /<Text\b/.test(c);
    assert(`1b. ${name} ${ownsText ? 'resolves type through typeStyle' : 'renders no Text of its own'}`, !ownsText || /typeStyle\('/.test(c));
    assert(`1c. ${name} carries no raw hex or rgba`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(c));
  }
  assert('1d. the reminder card binds a live locale', /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(CARD_CODE));
  // The dependency list order is irrelevant — only that locale is IN it, so
  // switching language re-resolves the family instead of keeping a stale one.
  assert('1e. …and locale is a stylesheet dependency, so Thai cannot keep a stale family', /\[colors[^\]]*\blocale\b[^\]]*\]/.test(CARD_CODE));
  // Amounts keep the tabular treatment.
  assert('1f. monetary rows stay tabular', /fontVariant: \['tabular-nums'\]/.test(CARD_CODE));
  // Hierarchy stays visibly distinct: several different roles are in use.
  const roles = new Set([...CARD_CODE.matchAll(/typeStyle\('([a-zA-Z]+)'/g)].map((m) => m[1]));
  // Three is the honest number for this surface: title, body copy, metadata.
  // Inventing a fourth to satisfy a count would break the "no new sizes when
  // an existing role matches" rule.
  assert(`1g. the card uses distinct roles for title, body and metadata (${[...roles].join(', ')})`, roles.size >= 3);
}

console.log('\n=== 2. The legacy BNPL selector is gone ===');
{
  assert('2a. the three ragged pills are gone', !/From cash|From everyday account|From credit card/.test(CARD_CODE));
  assert('2b. no source tap performs the mutation directly', !/confirmBillPaid\('cash'\)|confirmBillPaid\('credit_card'\)/.test(CARD_CODE));
  assert('2c. exactly one BNPL source state remains', (CARD_CODE.match(/bnpl_repayment_due' && awaitingSource/g) ?? []).length === 1);
  assert('2d. the dead everyday sub-state wrapper is gone', !/confirmBnplEveryday/.test(CARD_CODE));
  assert('2e. confirmBillPaid no longer routes BNPL', !/confirmBillPaid[\s\S]{0,140}runBnplConfirmation/.test(CARD_CODE));
}

console.log('\n=== 3. Select-then-confirm, with nothing written on selection ===');
{
  const state = CARD_CODE.slice(CARD_CODE.indexOf("bnpl_repayment_due' && awaitingSource"), CARD_CODE.indexOf('bnpl-back'));
  assert('3a. the state is headed "Where was this paid from?"', state.includes('Where was this paid from?'));
  assert('3b. …as a real heading', /sourceHeading[^>]*accessibilityRole="header"/.test(state));
  assert('3c. it states the amount and the plan name', /formatDisclosureAmount\(disclosedAmount\.cents\)\} · \$\{bnplPlanName\}/.test(state));
  assert('3d. the plan name comes from the linked liability, not display text', /data\.liabilities\.find\(\(l\) => l\.id === reminder\.liabilityId\)\?\.label/.test(CARD_CODE));

  // Selecting only selects.
  assert('3e. a row press only sets local selection', /onPress=\{\(\) => setSelectedSourceId\(opt\.id\)\}/.test(state));
  assert('3f. …and never calls a confirmation handler', !/onPress=\{\(\) => (runBnplConfirmation|confirmBnpl|runConfirmation)/.test(state));
  assert('3g. rows are radios', state.includes('accessibilityRole="radio"'));
  assert('3h. selection is exposed in accessibilityState', /accessibilityState=\{\{ selected, disabled: isSubmitting \}\}/.test(state));
  assert('3i. rows are at least 56pt', /minHeight: 56/.test(CARD_CODE));

  // Selection is never colour-only, and never success green.
  assert('3j. a checkmark glyph carries selection', /name=\{selected \? 'checkmark-circle' : 'ellipse-outline'\}/.test(state));
  assert('3k. the border also carries it', /sourceRowSelected: \{ borderColor: semantic\.interactive, borderWidth: 2/.test(CARD_CODE));
  assert('3l. the selected tint is Ocean interactive, not success green', /color=\{selected \? semantic\.interactive/.test(state) && !/selected \?[^\n]*colors\.success/.test(state));

  // Confirm is a separate, gated, full-width action.
  assert('3m. a separate confirm action exists', state.includes('testID="bnpl-confirm"'));
  assert('3n. it is disabled until a source is selected', /disabled=\{!selectedSourceId \|\| isSubmitting\}/.test(state));
  assert('3o. …and says what it will do, with the amount', /Record \$\{formatDisclosureAmount\(disclosedAmount\.cents\)\} repayment/.test(state));
  assert('3p. it dispatches through the one authoritative handler', /onPress=\{confirmBnplFromSelection\}/.test(state));
  assert('3q. Back clears the temporary selection', /setSelectedSourceId\(null\);\s*\n\s*setAwaitingSource\(false\);/.test(CARD_CODE));
}

console.log('\n=== 4. Eligibility is the existing shared resolver, not re-derived ===');
{
  assert('4a. the shared resolver supplies the rows', /resolveEligibleBillPaymentSources\(data\.assets, data\.creditCards\)/.test(CARD_CODE));
  assert('4b. eligibility is not re-derived in the sheet', !/data\.assets\.filter\(\(a\) => a\.type === 'everyday'\)/.test(CARD_CODE));
  assert('4c. no source list is hard-coded', !/\['cash', 'everyday', 'credit_card'\]/.test(CARD_CODE));
  // Rows show real recorded names and balances from that contract.
  assert('4d. each row shows the real account label', /<Text style=\{styles\.sourceRowLabel\}>\{opt\.label\}<\/Text>/.test(CARD_CODE));
  assert('4e. …and its real recorded balance', /formatDisclosureAmount\(Math\.round\(opt\.currentValue \* 100\)\)/.test(CARD_CODE));
  assert('4f. one spoken sentence per row', /accessibilityLabel=\{`\$\{opt\.label\}, \$\{opt\.kind === 'credit_card'/.test(CARD_CODE));

  // The credit-card branch now forwards the chosen card, which the
  // transition requires and previously never received.
  assert('4g. confirm routes a card to the credit_card branch WITH its id', /runBnplConfirmation\('credit_card', undefined, opt\.id\)/.test(CARD_CODE));
  assert('4h. …an everyday account to the everyday branch with its id', /runBnplConfirmation\('everyday', opt\.id\)/.test(CARD_CODE));
  assert('4i. …and cash to the cash branch', /runBnplConfirmation\('cash'\)/.test(CARD_CODE));
  assert('4j. the handler forwards creditCardId to the transition', /function runBnplConfirmation\([^)]*creditCardId\?: string\)/.test(CARD_CODE));
  assert('4k. the transition accepts it (contract unchanged)', /creditCardId\?: string;/.test(read('src/state/AppStateContext.tsx')));
}

console.log('\n=== 5. The repayment copy is accurate ===');
{
  assert('5a. "as an expense" is gone', !/as an expense/.test(CARD_CODE));
  assert('5b. the disclosure calls it a repayment', /records the repayment in \$\{brand\.name\}/.test(CARD_CODE));
  assert('5c. it says the source is updated', /updates the selected payment source/.test(CARD_CODE));
  assert('5d. it says the plan balance reduces', /reduces the \$\{bnplPlanName\} balance/.test(CARD_CODE));
  assert('5e. it denies any bank movement', /does not move money in your bank/.test(CARD_CODE));
  assert('5f. it never promises settlement with the provider', !/settle|paid to |sent to /i.test(CARD_CODE.slice(CARD_CODE.indexOf('records the repayment'), CARD_CODE.indexOf('records the repayment') + 320)));
  assert('5g. it claims no resulting balance', !/you will have|leaving you|new balance will/i.test(CARD_CODE));
  assert('5h. no coaching, praise or blame', !/great job|well done|you should|try to/i.test(CARD_CODE));
  assert('5i. the disclosure is visually secondary', /sourceDisclosure: \{ \.\.\.typeStyle\('meta', locale\), color: colors\.textSecondary/.test(CARD_CODE));
}

console.log('\n=== 6. The accepted overview hierarchy is preserved ===');
{
  const SHEET = code(read('src/components/today/ReminderDetailSheet.tsx'));
  assert('6a. the queue position header survives', /Reminder \$\{|Reminder \d|reminderQueueHeading|describeQueue/.test(SHEET + CARD_CODE));
  assert('6b. one full-width primary action style remains', /primaryAction: \{/.test(CARD_CODE));
  assert('6c. Snooze and Dismiss remain', /SNOOZE_ACTION|Snooze/.test(CARD_CODE) && /DISMISS_ACTION|Dismiss/.test(CARD_CODE));
  assert('6d. the reminder facts grid survives', /reminder-fact-grid|factList|factRow/.test(CARD_CODE));
  assert('6e. the reminder View card link survives', /reminder-view-card/.test(CARD_CODE));
  assert('6f. suppression steps are untouched', /suppressionStep/.test(CARD_CODE));
  assert('6g. ranking was not changed here', !/computeRankedReminder/.test(CARD_CODE));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
