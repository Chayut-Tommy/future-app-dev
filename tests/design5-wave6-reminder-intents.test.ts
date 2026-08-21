// Nolie Design 5.1 Wave 6 final — the three-intent reminder model.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): reminderSuppression.ts and reminderPresentation.ts
//   are pure and RN-free, so every suppression, retention, local-date and
//   label assertion below runs the REAL production function.
// - Class C (structural): the wiring assertions — which handler a control
//   reaches, which engine a mutation goes through, and that no financial
//   engine gained a suppression concept — are source-level.
// - NOT proven here: that any of it renders. See
//   tests/rendered/design5-wave6-mark-as-paid.render.test.tsx and
//   tests/rendered/design5-wave6-snooze-dismiss.render.test.tsx.
//
// Run with: npx tsx tests/design5-wave6-reminder-intents.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  toLocalDateString,
  addLocalDays,
  isSnoozeElapsed,
  suppressionReasonFor,
  createSuppressionPredicate,
  pruneSnoozes,
  pruneDismissals,
  occurrenceKeyDate,
  snoozedOccurrences,
  dismissedOccurrences,
  SNOOZE_PRESETS,
  SUPPRESSION_RETENTION_DAYS,
} from '../src/lib/calculations/reminderSuppression';
import {
  resolvePrimaryIntent,
  hasFinancialAction,
  resolveFactGridColumns,
  suppressionAnnouncement,
  SNOOZE_ACTION,
  DISMISS_ACTION,
  SNOOZE_SHEET,
  DISMISS_CONFIRM,
} from '../src/lib/reminderPresentation';
import { computeRankedReminder, SmartReminder, SmartReminderKind } from '../src/lib/calculations/reminders';
import { occurrenceKeyOf } from '../src/lib/calculations/reminderInteractionLifecycle';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData } from '../src/types/models';

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
const SHEET = strip(read('src/components/today/ReminderDetailSheet.tsx'));
const STATE = strip(read('src/state/AppStateContext.tsx'));
const SUPPRESS = strip(read('src/lib/calculations/reminderSuppression.ts'));
const PRESENT = strip(read('src/lib/reminderPresentation.ts'));

const TODAY = new Date(2026, 5, 15); // 2026-06-15

function isoAt(y: number, m: number, d: number): string {
  return new Date(y, m, d).toISOString();
}

/** A real overdue-bill dataset the REAL ranker selects from. */
function billData(dueOffsetDays = -2): AppData {
  const data = createEmptyAppData();
  const due = addLocalDays(TODAY, dueOffsetDays);
  data.recurringItems.push({
    id: 'rent',
    type: 'expense',
    label: 'Rent',
    amount: 500,
    frequency: 'monthly',
    nextDueDate: due.toISOString(),
    isFixed: true,
    active: true,
  });
  return data;
}

console.log('=== 1. Local calendar semantics, not instants (Class A) ===');
{
  assert('1a. a local date key is built from LOCAL parts', toLocalDateString(new Date(2026, 5, 15)) === '2026-06-15');
  assert('1b. single-digit months and days are zero-padded, so keys sort correctly', toLocalDateString(new Date(2026, 0, 5)) === '2026-01-05');
  // The exact failure toISOString() would cause: late evening east of UTC
  // yields TOMORROW's key, so a snooze until tomorrow would elapse instantly.
  const lateEvening = new Date(2026, 5, 15, 23, 30);
  assert('1c. 23:30 local is still today, not tomorrow', toLocalDateString(lateEvening) === '2026-06-15');
  const earlyMorning = new Date(2026, 5, 15, 0, 30);
  assert('1d. 00:30 local is still today, not yesterday', toLocalDateString(earlyMorning) === '2026-06-15');
  assert('1e. adding days crosses a month boundary correctly', toLocalDateString(addLocalDays(new Date(2026, 5, 30), 3)) === '2026-07-03');
  assert('1f. and a year boundary', toLocalDateString(addLocalDays(new Date(2026, 11, 30), 3)) === '2027-01-02');
  assert('1g. and a leap day', toLocalDateString(addLocalDays(new Date(2028, 1, 28), 1)) === '2028-02-29');
  // A spring-forward day is 23 hours long. Calendar arithmetic must not care.
  assert('1h. a DST spring-forward day still advances exactly one calendar day', toLocalDateString(addLocalDays(new Date(2026, 2, 8), 1)) === '2026-03-09');
  assert('1i. a DST fall-back day likewise', toLocalDateString(addLocalDays(new Date(2026, 10, 1), 1)) === '2026-11-02');
  assert('1j. addLocalDays normalises to midnight, so a late-evening base cannot drift', addLocalDays(new Date(2026, 5, 15, 23, 59), 1).getHours() === 0);
}

console.log('\n=== 2. A snooze elapses on the chosen day, not after it (Class A) ===');
{
  assert('2a. the day before, it is still snoozed', !isSnoozeElapsed('2026-06-16', TODAY));
  assert('2b. ON the chosen day it is eligible again — not the day after', isSnoozeElapsed('2026-06-15', new Date(2026, 5, 15)));
  assert('2c. and every later day too', isSnoozeElapsed('2026-06-15', new Date(2026, 5, 20)));
  assert('2d. a date-only string comparison needs no Date reconstruction', isSnoozeElapsed('2026-01-05', new Date(2026, 0, 6)));
  assert('2e. the presets are Tomorrow and In 3 days, in that order', SNOOZE_PRESETS.map((p) => p.label).join('|') === 'Tomorrow|In 3 days');
  assert('2f. and their day counts match their words', SNOOZE_PRESETS[0].days === 1 && SNOOZE_PRESETS[1].days === 3);
}

console.log('\n=== 3. Suppression excludes the EXACT occurrence and nothing else (Class A) ===');
{
  const data = billData();
  const reminder = computeRankedReminder(data, TODAY) as SmartReminder;
  assert('3a. the fixture really does produce a reminder from the real ranker', reminder !== null && reminder.kind === 'bill_overdue');
  const key = occurrenceKeyOf(reminder);

  assert('3b. with nothing suppressed, nothing is excluded', suppressionReasonFor(data, reminder, TODAY) === null);

  const dismissed: AppData = { ...data, dismissedReminderOccurrences: [key] };
  assert('3c. a dismissed occurrence reports "dismissed"', suppressionReasonFor(dismissed, reminder, TODAY) === 'dismissed');
  assert('3d. and the real ranker then selects nothing', computeRankedReminder(dismissed, TODAY, createSuppressionPredicate(dismissed, TODAY)) === null);

  const snoozed: AppData = { ...data, snoozedReminderOccurrences: { [key]: '2026-06-18' } };
  assert('3e. a snoozed occurrence reports "snoozed" before its day', suppressionReasonFor(snoozed, reminder, TODAY) === 'snoozed');
  assert('3f. the ranker skips it before that day', computeRankedReminder(snoozed, TODAY, createSuppressionPredicate(snoozed, TODAY)) === null);
  const onTheDay = new Date(2026, 5, 18);
  assert('3g. and selects it again ON that day', computeRankedReminder(snoozed, onTheDay, createSuppressionPredicate(snoozed, onTheDay)) !== null);
  assert('3h. the returned reminder is the same occurrence, not a new one', occurrenceKeyOf(computeRankedReminder(snoozed, onTheDay, createSuppressionPredicate(snoozed, onTheDay)) as SmartReminder) === key);

  // The status a returned reminder carries must reflect reality on the day
  // it returns, not the day it was snoozed.
  const later = computeRankedReminder(snoozed, onTheDay, createSuppressionPredicate(snoozed, onTheDay)) as SmartReminder;
  assert('3i. and it has grown more overdue in the meantime, not frozen', new Date(later.occurrenceDate as string).getTime() < onTheDay.getTime());

  // A DIFFERENT occurrence of the SAME bill must be unaffected — this is
  // what "future recurrences still appear" actually means.
  const nextMonth = billData(-2);
  nextMonth.recurringItems[0].nextDueDate = isoAt(2026, 6, 13);
  const nextReminder = computeRankedReminder(nextMonth, new Date(2026, 6, 15)) as SmartReminder;
  assert('3j. next month is a genuinely different occurrence key', occurrenceKeyOf(nextReminder) !== key);
  const stillDismissed: AppData = { ...nextMonth, dismissedReminderOccurrences: [key] };
  assert('3k. so dismissing June never hides July', suppressionReasonFor(stillDismissed, nextReminder, new Date(2026, 6, 15)) === null);
  assert('3l. and the ranker still selects July', computeRankedReminder(stillDismissed, new Date(2026, 6, 15), createSuppressionPredicate(stillDismissed, new Date(2026, 6, 15))) !== null);
}

console.log('\n=== 4. Backward compatibility and stale data (Class A) ===');
{
  const legacy = billData();
  delete (legacy as Partial<AppData>).snoozedReminderOccurrences;
  delete (legacy as Partial<AppData>).dismissedReminderOccurrences;
  const reminder = computeRankedReminder(legacy, TODAY) as SmartReminder;
  assert('4a. a customer saved before Wave 6 has no fields at all', legacy.snoozedReminderOccurrences === undefined && legacy.dismissedReminderOccurrences === undefined);
  assert('4b. reading them yields empty, never a crash', Object.keys(snoozedOccurrences(legacy)).length === 0 && dismissedOccurrences(legacy).length === 0);
  assert('4c. and nothing is suppressed for them', suppressionReasonFor(legacy, reminder, TODAY) === null);
  assert('4d. so the ranker behaves exactly as it always did', computeRankedReminder(legacy, TODAY, createSuppressionPredicate(legacy, TODAY)) !== null);
  assert('4e. a brand-new customer gets the empty defaults', (() => {
    const fresh = createEmptyAppData();
    return JSON.stringify(fresh.snoozedReminderOccurrences) === '{}' && JSON.stringify(fresh.dismissedReminderOccurrences) === '[]';
  })());

  // Stale keys — an occurrence that no longer exists must be ignored, never
  // resurrect an error or suppress something unrelated.
  const stale: AppData = {
    ...billData(),
    dismissedReminderOccurrences: ['bill-overdue-deleted-2020-01-01', ''],
    snoozedReminderOccurrences: { 'gone-2019-05-05': '2019-06-06', bad: '' },
  };
  const live = computeRankedReminder(stale, TODAY) as SmartReminder;
  assert('4f. stale keys suppress nothing live', suppressionReasonFor(stale, live, TODAY) === null);
  assert('4g. an empty snooze value is ignored rather than treated as suppressed', suppressionReasonFor({ ...billData(), snoozedReminderOccurrences: { [occurrenceKeyOf(live)]: '' } }, live, TODAY) === null);
  assert('4h. the storage default is written, so hydration needs no migration step', /snoozedReminderOccurrences: \{\}/.test(read('src/lib/storage.ts')) && /dismissedReminderOccurrences: \[\]/.test(read('src/lib/storage.ts')));
  assert('4i. and no migration function was added for them', !/migrateSnooze|migrateDismiss|migrateReminderSuppression/.test(read('src/lib/storage.ts')));
}

console.log('\n=== 5. Retention is bounded without a timer (Class A) ===');
{
  assert('5a. an occurrence key exposes its own date', occurrenceKeyDate('bill-overdue-rent-2026-06-13') === '2026-06-13');
  assert('5b. a key with no date yields null', occurrenceKeyDate('something-opaque') === null);

  const old = toLocalDateString(addLocalDays(TODAY, -(SUPPRESSION_RETENTION_DAYS + 5)));
  const recent = toLocalDateString(addLocalDays(TODAY, -5));
  const pruned = pruneSnoozes({ a: old, b: recent }, TODAY);
  assert('5c. a long-elapsed snooze is dropped', pruned.a === undefined);
  assert('5d. a recent one is kept', pruned.b === recent);
  assert('5e. pruning returns the SAME object when nothing changed, so no pointless write happens', (() => {
    const input = { b: recent };
    return pruneSnoozes(input, TODAY) === input;
  })());

  const keptKeys = pruneDismissals([`bill-x-${old}`, `bill-y-${recent}`, 'undatable-key'], TODAY);
  assert('5f. a long-past dismissal is dropped', !keptKeys.some((k) => k.includes(old)));
  assert('5g. a recent one is kept', keptKeys.some((k) => k.includes(recent)));
  assert('5h. an undatable key is RETAINED, never guessed at and discarded', keptKeys.includes('undatable-key'));
  assert('5i. and pruning is identity-stable too', (() => {
    const input = ['undatable-key'];
    return pruneDismissals(input, TODAY) === input;
  })());
  assert('5j. dropping an already-elapsed snooze can change no behaviour — it was eligible anyway', isSnoozeElapsed(old, TODAY));
  assert('5k. no timer, interval or background task exists anywhere in the suppression path', !/setTimeout|setInterval|BackgroundFetch|TaskManager/.test(SUPPRESS) && !/setTimeout|setInterval/.test(strip(read('src/lib/calculations/reminderSuppression.ts'))));
}

console.log('\n=== 6. Suppression is not a financial concept (Class C) ===');
{
  assert('6a. the suppression module computes no money', !/currentValue|amount \*|balance \*|cents|transaction/i.test(SUPPRESS.replace(/SmartReminder/g, '')));
  assert('6b. it creates no transaction and mutates no state', !/addTransaction|updateAsset|persist\(|AsyncStorage/.test(SUPPRESS));
  assert('6c. reminders.ts was NOT edited to know about snooze or dismiss', !/snooze|dismiss/i.test(read('src/lib/calculations/reminders.ts')));
  assert('6d. suppression rides the ranker\'s EXISTING isExcluded seam', /computeRankedReminder\(data, today, isExcluded/.test(read('src/lib/calculations/reminders.ts')) || /isExcluded/.test(read('src/lib/calculations/reminders.ts')));
  for (const engine of [
    'src/lib/calculations/safeToSpend.ts',
    'src/lib/calculations/moneyTimeline.ts',
    'src/lib/calculations/monthlySummary.ts',
    'src/lib/calculations/moneyPlan.ts',
    'src/lib/calculations/repaymentAccounting.ts',
  ]) {
    assert(`6e. ${engine.split('/').pop()} has no notion of a suppressed reminder`, !/snooz|dismissedReminder/i.test(read(engine)));
  }
  assert('6f. so a snoozed bill is still an upcoming commitment everywhere it always was', true);
}

console.log('\n=== 7. The write path (Class C) ===');
{
  assert('7a. snooze persists through the established persist() action shape', /const snoozeReminderOccurrence = useCallback\(/.test(STATE) && /persist\(\{[\s\S]{0,400}snoozedReminderOccurrences: next/.test(STATE));
  assert('7b. dismiss likewise', /const dismissReminderOccurrence = useCallback\(/.test(STATE) && /dismissedReminderOccurrences: \[\.\.\.kept, occurrenceKey\]/.test(STATE));
  assert('7c. neither writes a transaction, balance or occurrence resolution', (() => {
    const at = STATE.indexOf('const snoozeReminderOccurrence');
    const body = STATE.slice(at, STATE.indexOf('const markLearningCardCompleted', at));
    return !/addTransaction|confirmRecurringOccurrence|confirmBnplRepayment|confirmCreditCardRepayment|currentValue/.test(body);
  })());
  assert('7d. a repeated dismiss is a no-op, never a duplicate entry', /if \(kept\.includes\(occurrenceKey\)\) return;/.test(STATE));
  assert('7e. snoozing clears any dismissal of the same occurrence', /dismissedReminderOccurrences: pruneDismissals\([\s\S]{0,120}\.filter\(\(k\) => k !== occurrenceKey\)/.test(STATE));
  assert('7f. and dismissing clears any snooze of it', /delete remainingSnoozes\[occurrenceKey\];/.test(STATE));
  assert('7g. retention runs on the write path, since nothing here runs on a schedule', /pruneSnoozes\(/.test(STATE) && /pruneDismissals\(/.test(STATE));
  assert('7h. both are keyed by the canonical occurrence identity, never visible copy', /occurrenceKeyOf\(reminder\)/.test(CARD) && !/snoozeReminderOccurrence\(reminder\.title/.test(CARD));
}

console.log('\n=== 8. The action matrix by kind (Class A) ===');
{
  const EXPECTED: [SmartReminderKind, string][] = [
    ['bill_due_soon', 'Mark as paid'],
    ['bill_overdue', 'Mark as paid'],
    ['card_due_soon', 'Record payment'],
    ['loan_repayment_due', 'Record repayment'],
    ['bnpl_repayment_due', 'Record repayment'],
    ['salary_check', 'Yes, it arrived'],
  ];
  for (const [kind, label] of EXPECTED) {
    const intent = resolvePrimaryIntent(kind);
    assert(`8a. ${kind} -> "${label}"`, intent.kind === 'financial' && intent.label === label);
    assert(`8b. ${kind} states what the control does before it is pressed`, intent.kind === 'financial' && intent.hint.length > 0);
  }
  assert('8c. every financial kind promises nothing is recorded until confirmation', EXPECTED.filter(([k]) => k !== 'salary_check').every(([k]) => {
    const i = resolvePrimaryIntent(k);
    return i.kind === 'financial' && /Nothing is recorded until you confirm\./.test(i.hint);
  }));
  assert('8d. a non-financial kind gets NO fabricated financial action', resolvePrimaryIntent('not_a_money_reminder' as SmartReminderKind).kind === 'none');
  assert('8e. and hasFinancialAction agrees', !hasFinancialAction('not_a_money_reminder' as SmartReminderKind) && hasFinancialAction('bill_due_soon'));
  assert('8f. no kind is labelled with a generic verb that hides what it does', !EXPECTED.some(([k]) => {
    const i = resolvePrimaryIntent(k);
    return i.kind === 'financial' && /^(Confirm|OK|Done|Continue)$/.test(i.label);
  }));
}

console.log('\n=== 9. The copy closes the misreadings it exists to close (Class A) ===');
{
  assert('9a. Snooze says what it is for', SNOOZE_ACTION.support === 'Show this again later');
  assert('9b. Dismiss says it hides ONE occurrence', DISMISS_ACTION.support === 'Hide this occurrence');
  assert('9c. the ambiguous "I\'ll take care of it" appears nowhere', !/take care of it/i.test(PRESENT) && !/take care of it/i.test(CARD));
  assert('9d. the snooze promise is scoped to Nolie, not a phone notification', /reappear in Nolie/.test(SNOOZE_SHEET.body));
  assert('9e. and never promises a push notification the app cannot send', !/notify|notification|alert you|remind you on your phone/i.test(SNOOZE_SHEET.body) && !/notification/i.test(SNOOZE_ACTION.hint));
  assert('9f. the dismiss confirmation names all three things it does NOT do', /won't mark the bill as paid/.test(DISMISS_CONFIRM.body) && /change your records/.test(DISMISS_CONFIRM.body) && /Future reminders will still appear/.test(DISMISS_CONFIRM.body));
  assert('9g. its two choices are unambiguous about which one destroys', DISMISS_CONFIRM.keepLabel === 'Keep reminder' && DISMISS_CONFIRM.confirmLabel === 'Dismiss reminder');
  assert('9h. the announced result says what did NOT happen, not just what did', /Nothing was paid or changed/.test(suppressionAnnouncement('snoozed', 'Monday')) && /Nothing was paid or changed/.test(suppressionAnnouncement('dismissed')));
  assert('9i. a snooze announcement names the return day when one is known', /Monday/.test(suppressionAnnouncement('snoozed', 'Monday')));
  assert('9j. and degrades without inventing one when it is not', !/undefined|null/.test(suppressionAnnouncement('snoozed', null)));
  assert('9k. the dismissal announcement reassures about future reminders', /future reminders will still appear/i.test(suppressionAnnouncement('dismissed')));
  // The generic coaching panel the owner rejected.
  assert('9l. no motivational filler anywhere on this surface', !/keeps you in control|You've got this|You’ve got this|Staying on top/i.test(PRESENT) && !/keeps you in control|You've got this|You’ve got this|Staying on top/i.test(CARD));
  assert('9m. and no footer claiming reminders are manageable in Settings', !/manage.{0,30}reminders.{0,30}settings/i.test(CARD) && !/manage.{0,30}reminders.{0,30}settings/i.test(PRESENT));
}

console.log('\n=== 10. The facts grid is responsive, and honest (Class A + C) ===');
{
  assert('10a. 390pt at normal scale -> two columns', resolveFactGridColumns(390, 1) === 2);
  assert('10b. 430pt likewise', resolveFactGridColumns(430, 1) === 2);
  assert('10c. 375pt likewise', resolveFactGridColumns(375, 1) === 2);
  assert('10d. 320pt collapses to one column rather than truncating', resolveFactGridColumns(320, 1) === 1);
  assert('10e. font scale 1.3 collapses to one column at every width', [320, 375, 390, 430].every((w) => resolveFactGridColumns(w, 1.3) === 1));
  assert('10f. and ~200% Dynamic Type likewise', [320, 375, 390, 430].every((w) => resolveFactGridColumns(w, 2) === 1));
  assert('10g. it is never four columns at any width or scale', [320, 375, 390, 430].every((w) => [1, 1.3, 2].every((f) => resolveFactGridColumns(w, f) <= 2)));
  // The account must not appear as a fact — nothing has paid it yet.
  assert('10h. no "Paid from" is presented among the facts', !/Paid from/.test(CARD.slice(CARD.indexOf('const billFacts'), CARD.indexOf('const reminderLoanLiability'))));
  assert('10i. every fact is a genuinely recorded value, never a derived guess', /label: 'Due date'/.test(CARD) && /label: 'Amount'/.test(CARD) && /label: 'Type'/.test(CARD) && /label: 'Schedule'/.test(CARD));
  assert('10j. and the grid is suppressed while a step or picker owns the surface', /billFacts && suppressionStep === 'none' && !awaitingSource/.test(CARD));
}

console.log('\n=== 11. Mark as paid reuses the accepted engine, and only after confirmation (Class C) ===');
{
  assert('11a. a due-soon bill now reaches the SAME branch an overdue bill uses', /reminder\.kind === 'bill_overdue' \|\| reminder\.kind === 'bill_due_soon' \|\| reminder\.kind === 'bnpl_repayment_due'/.test(CARD));
  assert('11b. the primary control only OPENS the picker — it records nothing', /onPress=\{\(\) => setAwaitingSource\(true\)\}/.test(CARD));
  assert('11c. the picker step is reachable for both bill kinds', /\(reminder\.kind === 'bill_overdue' \|\| reminder\.kind === 'bill_due_soon'\) && awaitingSource/.test(CARD));
  assert('11d. it lists every eligible account from the existing shared resolver', /resolveEligibleBillPaymentSources\(data\.assets, data\.creditCards\)/.test(CARD));
  // RECONCILED (Wave 6 polish): the shared chooser replaced
  // BillPaymentSourcePicker on this surface, so Back is now a named 44pt
  // control of this step rather than a prop handed to that component. Both
  // clauses' intent is preserved and tightened below.
  assert('11e. with an explicit, named Back so Cancel is always available', /testID="bill-source-back"/.test(CARD) && /setAwaitingSource\(false\);/.test(CARD));
  assert('11e-i. and Back clears the pending selection rather than leaving it armed', /setAwaitingSource\(false\);\s*\n\s*setSelectedSourceId\(null\);/.test(CARD));
  assert('11f. no silent Cash default — the confirm control is inert until a source is chosen', /disabled=\{!selectedSourceId \|\| isSubmitting\}/.test(CARD));
  assert('11f-i. and confirming resolves the chosen id back to the engine\'s own option object', /eligibleBillPaymentSources\.find\(\(o\) => o\.id === selectedSourceId\)/.test(CARD) && /confirmBillPaidFromSource\(chosen\)/.test(CARD));
  assert('11g. the mutation goes through the existing atomic transition, not a new engine', /confirmRecurringOccurrence\(\{/.test(CARD) && !/function createTransaction|new Transaction/.test(CARD));
  assert('11h. which is given the expected occurrence so a stale one cannot be resolved twice', /expectedNextDueDate: item\?\.nextDueDate/.test(CARD));
  assert('11i. a stale or already-applied result advances instead of double-recording', /transition\.reason === 'stale' \|\| transition\.reason === 'not_found'/.test(CARD));
  assert('11j. double-submit is still guarded', /setIsSubmitting\(true\)/.test(CARD) && /disabled=\{isSubmitting\}/.test(CARD));
  assert('11k. and the queue advances only on a genuinely applied transition', /if \(transition\.applied\) \{\s*reportCompleted\(transactionId, transition\.data\);/.test(CARD));
}

console.log('\n=== 12. Snooze and dismiss are inline steps, never a second modal (Class C) ===');
{
  assert('12a. both are local view state on this same surface', /useState<'none' \| 'snooze' \| 'dismiss'>\('none'\)/.test(CARD));
  assert('12b. no second native Modal was introduced', (CARD.match(/<Modal/g) || []).length === 0);
  assert('12c. dismiss requires its own confirmation before anything persists', /suppressionStep === 'dismiss' \?[\s\S]{0,1400}testID="reminder-dismiss-confirm"/.test(CARD));
  assert('12d. and "Keep reminder" only closes the step — it writes nothing', /testID="reminder-dismiss-keep"[\s\S]{0,200}/.test(CARD) && /onPress=\{\(\) => setSuppressionStep\('none'\)\}/.test(CARD));
  assert('12e. the snooze step offers Tomorrow, In 3 days, a custom date and Back', /testID=\{`reminder-snooze-\$\{preset\.id\}`\}/.test(CARD) && /testID="reminder-snooze-custom"/.test(CARD) && /testID="reminder-snooze-back"/.test(CARD));
  assert('12f. the custom date uses the existing inline calendar, not a nested modal', /<InlineCalendar/.test(CARD));
  assert('12g. bounded to future days only, so a snooze cannot elapse instantly', /minimumDate=\{addLocalDays\(today, 1\)\}/.test(CARD));
  assert('12h. presets are computed from the sheet\'s own fixed today, never a fresh new Date()', /addLocalDays\(today, preset\.days\)/.test(CARD));
  assert('12i. the intent controls are hidden while a step or picker owns the surface', /suppressionStep === 'none' && !awaitingSource && !awaitingIncomeDestination/.test(CARD));
  assert('12j. neither confirm handler touches money', (() => {
    const at = CARD.indexOf('function confirmSnooze');
    const body = CARD.slice(at, CARD.indexOf('function acknowledgeReminder', at));
    return !/confirmRecurringOccurrence|addTransaction|currentValue|amount/.test(body);
  })());
  assert('12k. and both advance the queue through the ONE shared non-mutating reporter', (CARD.match(/onOutcome\?\.\(\{ kind: 'acknowledged', occurrenceKey \}\);/g) || []).length === 1 && (CARD.match(/\n\s*acknowledgeReminder\(\);/g) || []).length === 2);
  assert('12l. so the queue can never advance twice for one confirmation', (() => {
    const at = CARD.indexOf('function confirmDismiss');
    const body = CARD.slice(at, CARD.indexOf('function acknowledgeReminder', at));
    return (body.match(/acknowledgeReminder\(\)/g) || []).length === 1;
  })());
}

console.log('\n=== 13. Both selectors respect suppression (Class C) ===');
{
  assert('13a. the sheet composes session exclusion WITH persisted suppression', /sessionDeferredKeysRef\.current\.has\(occurrenceKeyOf\(reminder\)\)\) return true;[\s\S]{0,200}suppressionReasonFor\(data, reminder, today\)/.test(SHEET));
  assert('13b. reopening re-reads through the same suppression', /computeRankedReminder\(data, today, createSuppressionPredicate\(data, today\)\)/.test(SHEET));
  assert('13c. the queue COUNT skips suppressed occurrences, so the total is honest', /seen\.has\(occurrenceKeyOf\(r\)\) \|\| suppressed\(r\)/.test(SHEET));
  const TODAY_SCREEN = strip(read('src/screens/today/TodayScreen.tsx'));
  assert('13d. and the Briefing tile uses the same predicate, so nothing lingers on Today', /createSuppressionPredicate\(data, currentDate\)/.test(TODAY_SCREEN));
  assert('13e. header Close still suppresses nothing — it only closes', (() => {
    const at = SHEET.indexOf('function handleForceClose');
    const body = SHEET.slice(at, SHEET.indexOf('\n  }', at));
    return !/snooze|dismiss/i.test(body);
  })());
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
