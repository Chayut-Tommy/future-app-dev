// Nolie Design 5.1 Wave 6 closure — the reminder action/mutation matrix.
//
// CLASSIFICATION (per tests/README.md):
// - Class C (structural): every visible reminder action is mapped to the
//   handler it calls and the outcome that handler reports, so a relabel can
//   never silently change what a control DOES.
//
// WHY THIS EXISTS. The owner reported the reminder surface still ending in
// a generic "Got it". Inspection established that control performs NO
// mutation — it reports `acknowledged`, which session-excludes the
// occurrence and advances the queue. The wording is corrected to say that;
// this file is the guard that the correction stayed a wording change.
//
// Run with: npx tsx tests/design5-wave6-reminder-actions.test.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

import { reminderDaysUntil, resolveReminderStatus, CARD_REMINDER_CAUTION } from '../src/lib/reminderPresentation';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CARD = read('src/components/today/SmartReminderCard.tsx');
const CODE = strip(CARD);
const SHEET_RAW = read('src/components/today/ReminderDetailSheet.tsx');
const SHEET = strip(SHEET_RAW);
const PRESENT = strip(read('src/lib/reminderPresentation.ts'));

console.log('=== 1. Each non-mutating control reports exactly that (Class C) ===');
{
  // "Not yet" — defers. No mutation.
  assert('1a. deferReminder performs no mutation', /function deferReminder\(\) \{[\s\S]{0,200}onOutcome\?\.\(\{ kind: 'deferred', occurrenceKey \}\);/.test(CODE));
  assert('1b. it writes nothing to app state', (() => {
    const at = CODE.indexOf('function deferReminder()');
    const body = CODE.slice(at, CODE.indexOf('\n  }', at));
    return !/updateAsset|addTransaction|updateUser|confirm[A-Z]/.test(body);
  })());

  // "Noted" — acknowledges. Also no mutation.
  assert('1c. acknowledgeReminder performs no mutation either', /function acknowledgeReminder\(\) \{[\s\S]{0,200}onOutcome\?\.\(\{ kind: 'acknowledged', occurrenceKey \}\);/.test(CODE));
  assert('1d. it writes nothing to app state', (() => {
    const at = CODE.indexOf('function acknowledgeReminder()');
    const body = CODE.slice(at, CODE.indexOf('\n  }', at));
    return !/updateAsset|addTransaction|updateUser|confirm[A-Z]/.test(body);
  })());
  assert('1e. and both session-exclude their own occurrence, so neither immediately re-selects itself', (CODE.match(/const occurrenceKey = occurrenceKeyOf\(reminder\);/g) || []).length >= 3);
}

console.log('\n=== 2. The wording still matches the behaviour (Class C) ===');
{
  // RECONCILED (Design 5.1 Wave 6 final). This section guarded ONE thing:
  // that no reminder control claims to have moved money it did not move.
  // That intent is fully preserved and is asserted below against the whole
  // surface, not just one button.
  //
  // What changed is the control this section used to point at. The bare
  // acknowledgement ("Got it", then "Next reminder"/"Done") no longer
  // exists: the approved three-intent model replaced it with Snooze ("not
  // now, ask me on this day") and Dismiss ("never for this one"), each of
  // which says strictly more than an acknowledgement could, and neither of
  // which mutates anything. Their own behaviour — persistence, occurrence
  // scoping, zero financial effect, queue advance — is proven in
  // tests/design5-wave6-reminder-intents.test.ts and its two rendered
  // suites. Nothing this section protected is now unprotected.
  assert('2a. the generic "Got it" is still gone', !/>Got it</.test(CODE) && !/accessibilityLabel="Got it"/.test(CODE));
  assert('2b. and so is the vaguer acknowledgement that briefly replaced it', !/>Noted</.test(CODE) && !/resolveAcknowledgeAction/.test(CODE));
  assert('2b-i. no dead helper was left exported for a control that no longer exists', !/resolveAcknowledgeAction/.test(PRESENT));
  assert('2c. every remaining control names a real intent, never a bare dismissal word', !/>(OK|Okay|Got it|Noted)</.test(CODE));
  assert('2d. no control claims to pay or record something it does not', !/>(Paid|Recorded|Dismissed)</.test(CODE));
  // RECONCILED (Wave 6 polish): the account step no longer fires the
  // mutation from its own onSelect — that was the defect this pass exists
  // to fix. Selecting now only records a choice; a SEPARATE confirm control
  // performs the mutation. The clause's intent is unchanged and strengthened:
  // there are now two deliberate steps between the reminder and the money,
  // not one.
  assert('2e. the only controls that mutate money sit behind an explicit confirmation', /onPress=\{\(\) => setAwaitingSource\(true\)\}/.test(CODE) && /testID="bill-confirm-action"/.test(CODE));
  assert('2e-i. and selecting an account performs no mutation at all', /onSelect=\{setSelectedSourceId\}/.test(CODE) && /onSelect=\{setSelectedDestinationId\}/.test(CODE));
  assert('2f. and the two suppression controls state plainly that nothing is paid', /Nothing is paid or changed\./.test(PRESENT) && /does not mark anything paid/.test(PRESENT));
}

console.log('\n=== 3. Every reminder kind keeps its own action set (Class C) ===');
{
  // The matrix: kind -> the control(s) it renders -> what each calls.
  const MATRIX: [string, string[]][] = [
    ['salary_check', ['confirmSalary', 'deferReminder']],
    ['bill_overdue', ['setAwaitingSource', 'deferReminder']],
    ['bill_due_soon', ['acknowledgeReminder']],
    ['card_due_soon', ['deferReminder']],
    ['bnpl_repayment_due', ['setAwaitingSource', 'deferReminder']],
    ['loan_repayment_due', ['deferReminder']],
  ];
  for (const [kind, handlers] of MATRIX) {
    assert(`3a. ${kind} still has its own branch`, new RegExp(`reminder\\.kind === '${kind}'`).test(CODE));
    for (const h of handlers) {
      assert(`3b. ${kind} still reaches ${h}`, CODE.includes(h));
    }
  }
  assert('3c. income confirmation still routes through a real destination choice, never a bare confirm', /function confirmSalary\(\) \{\s*\n\s*setAwaitingIncomeDestination\(true\);/.test(CODE));
  // RECONCILED (Wave 6 polish): the visible "Not yet" on the income
  // reminder was retired — Snooze handles "remind me later" with a real
  // date, Dismiss handles "not this one", and Close leaves without acting.
  // The clause protected the income LIFECYCLE, which is intact: confirming
  // still routes through a destination choice, and there is still a
  // non-committal way out of the reminder.
  assert('3d. and the income lifecycle still routes through a destination choice', /awaitingIncomeDestination/.test(CODE) && /testID="income-destination-list"/.test(CODE));
  assert('3d-i. with a non-committal way out that records nothing', /testID="reminder-snooze-action"/.test(CODE) && /testID="income-destination-back"/.test(CODE));
  assert('3d-ii. deferReminder itself survives for the journeys that still use it', /function deferReminder\(\)/.test(CODE) && /: deferReminder\(\)\)/.test(CODE));
  assert('3e. a genuine payment still reports a real transactionId and fresh data', /function reportCompleted\(transactionId: string, latestData: AppData\)/.test(CODE) && /kind: 'completed', occurrenceKey, transactionId, latestData/.test(CODE));
  assert('3f. so "completed" is distinguishable from "deferred"/"acknowledged" downstream', /kind: 'deferred'/.test(CODE) && /kind: 'acknowledged'/.test(CODE) && /kind: 'completed'/.test(CODE));
}

console.log('\n=== 4. Queue, focus and dismissal behaviour is untouched (Class C) ===');
{
  assert('4a. the sheet still advances to the next unresolved reminder', /advance/i.test(SHEET));
  assert('4b. session exclusions still drive that advance', /occurrenceKey/.test(SHEET));
  assert('4c. focus return is still reported to the caller', /onFullyClosed/.test(SHEET));
  assert('4d. one native Modal at a time — no second modal architecture was introduced', (SHEET.match(/<Modal/g) || []).length <= 1);
  assert('4e. and no timer gates any of it', !/setTimeout|setInterval/.test(SHEET));
}

console.log('\n=== 5. Touch targets and announcements (Class C) ===');
{
  assert('5a. every action is a real button with its own accessible name', (CODE.match(/accessibilityRole="button"/g) || []).length >= 6);
  assert('5b. each carries an explicit accessibilityLabel', (CODE.match(/accessibilityLabel="/g) || []).length >= 6);
  assert('5c. and the action buttons meet a 44pt minimum — 48pt, since they resolve real money', /const REMINDER_ACTION_MIN_HEIGHT = 48;/.test(CARD) && /minHeight: REMINDER_ACTION_MIN_HEIGHT/.test(CODE));
  assert('5d. no state is communicated by colour alone — every control carries its own words', !/actionButton[\s\S]{0,120}<View\s*\/>/.test(CODE));
}

console.log('\n=== 6. The header carries queue position, and exactly one Close (Class C) ===');
{
  assert('6a. the title is derived from the queue, not hardcoded "Reminder"', /reminderQueueTitle\(queue\.position, queue\.total\)/.test(SHEET));
  assert('6b. "Reminder N of M" only when more than one is available', /total <= 1[\s\S]{0,40}return 'Reminder';/.test(PRESENT));
  assert('6c. and it never reports a position beyond the total', /Math\.min\(position, total\)/.test(PRESENT));
  assert('6d. the detached footer Close link is gone', !/styles\.closeButton/.test(SHEET) && !/styles\.closeText/.test(SHEET));
  assert('6e. its now-dead styles were removed too, not left behind', !/closeButton:/.test(SHEET) && !/closeText:/.test(SHEET));
  assert('6f. Close now lives in the header for the reminder state', /presentedState\.kind === 'reminder_detail' \?[\s\S]{0,400}testID="reminder-header-close"/.test(SHEET));
  assert('6g. exactly one Close control is rendered for that state', (SHEET.match(/testID="reminder-header-close"/g) || []).length === 1);
  assert('6h. it meets the 44pt minimum via the shared header style', /styles\.headerCloseButton/.test(SHEET) && /headerCloseButton: \{ minWidth: 44, minHeight: 44/.test(SHEET));
  assert('6i. and closing still ends the review without recording anything', /testID="reminder-header-close"/.test(SHEET) && /onPress=\{handleForceClose\}[\s\S]{0,300}testID="reminder-header-close"/.test(SHEET));
}

console.log('\n=== 7. The queue count is derived from the canonical selector (Class C) ===');
{
  assert('7a. describeQueue calls the same ranked selector the sheet advances through', /function describeQueue[\s\S]{0,900}computeRankedReminder\(latestData, today,/.test(SHEET));
  assert('7b. it never mutates the persistent session-exclusion set', (() => {
    const at = SHEET.indexOf('function describeQueue');
    const body = SHEET.slice(at, SHEET.indexOf('\n  }', at));
    return !/sessionDeferredKeysRef\.current\.(add|delete|clear)/.test(body);
  })());
  assert('7c. it writes nothing to app state', (() => {
    const at = SHEET.indexOf('function describeQueue');
    const body = SHEET.slice(at, SHEET.indexOf('\n  }', at));
    return !/updateAsset|addTransaction|updateUser|dispatch\(/.test(body);
  })());
  assert('7d. and the scan is bounded so bad data cannot spin it', /const QUEUE_SCAN_LIMIT = \d+;/.test(SHEET) && /i < QUEUE_SCAN_LIMIT/.test(SHEET));
  // RECONCILED: `hasMore` existed only to pick between "Next reminder" and
  // "Done" on the acknowledgement control, which no longer exists. The
  // queue's own honesty — position and total — is unchanged and still
  // asserted in 7f and section 6.
  assert('7e. the queue flag that fed the removed control was removed with it, not left dangling', !/hasMore/.test(SHEET));
  assert('7f. the total is never below one — the reminder on screen always counts', /Math\.max\(remaining, 1\)/.test(SHEET));
}

console.log('\n=== 8. The card reminder states facts, not prose (Class C) ===');
{
  assert('8a. every figure comes from the shared credit engines, not a local formula', /computeCreditCardInterestEstimate\(/.test(CODE) && /resolveExpectedMonthlyRepayment\(reminderCard\)/.test(CODE));
  assert('8b. no interest arithmetic is duplicated in the presentation layer', !/\/ 365/.test(PRESENT) && !/\* cycleDays/.test(PRESENT) && !/\/ 365/.test(CODE));
  assert('8c. the expected repayment is NOT called an amount due', !/amount due/i.test(PRESENT) && /'Expected monthly repayment'/.test(PRESENT));
  assert('8d. the balance is labelled as what Nolie recorded, not what the bank says', /'Current recorded balance'/.test(PRESENT));
  // RECONCILED — Wave 9a closure, Correction C.
  // OLD CLAUSE: matched the literal label `'Estimated interest if unpaid'`.
  // SUPERSEDED BECAUSE that label read as an amount the ISSUER would bill.
  // PRESERVED INTENT: the figure must still be unmistakably an estimate and
  // still carry the structured `estimated: true` flag — both asserted, now
  // against the stronger "Illustrative … recorded balance" wording.
  assert('8e. the interest figure is labelled an estimate and marked as one', /Illustrative interest over \$\{input\.cycleDays\} days if the recorded balance stayed unpaid/.test(PRESENT) && /estimated: true/.test(PRESENT));
  assert('8f. a sub-dollar estimate is suppressed rather than shown as \$0', /estimatedCycleInterest >= 1/.test(PRESENT));
  // RECONCILED — Wave 9a closure, Correction C. OLD CLAUSE matched
  // "assumed rate of" / "your card's rate of". SUPERSEDED because the old
  // assumed-branch also nudged the customer ("Add your card's rate for a
  // closer figure"), framing a compliance assumption as their shortcoming.
  // PRESERVED INTENT — and strengthened: the provenance must still state
  // WHICH rate was used and whether the customer supplied it, and a
  // recorded 0% must now read as recorded rather than assumed.
  assert('8g. the rate provenance says whether the customer supplied it', /isAssumedRate[\s\S]{0,240}assumed annual rate of/.test(PRESENT) && /rate you recorded/.test(PRESENT));
  // RECONCILED — Wave 9a closure, Correction C. OLD CLAUSE matched
  // "Interest is charged on whatever is left unpaid. Paying more than the
  // expected amount reduces it." SUPERSEDED because the first sentence
  // asserted how the ISSUER charges (which Nolie cannot know) and the
  // second was behavioural coaching. PRESERVED INTENT: the caution must
  // still describe the mechanism and must never blame the customer — both
  // asserted, now against the issuer-terms qualification.
  // Asserted against the RESOLVED value, not the source text: the caution is
  // now a re-export of the one shared issuer qualification, so the literal
  // lives in creditCardPresentation.ts.
  assert('8h. the caution explains the mechanism rather than blaming the customer', /Your card issuer may calculate interest differently/.test(CARD_REMINDER_CAUTION) && !/you should|you failed|too much debt|Paying more than/i.test(CARD_REMINDER_CAUTION));
  assert('8h-i. and it names what the illustration excludes', /Interest-free periods, fees, cash-advance rates, compounding/.test(CARD_REMINDER_CAUTION));
  // RECONCILED (Wave 6 polish): the surface no longer renders the engine's
  // prose at all. Its body restated the due date the status pill and the
  // supporting line already carried, and its title prepended "your" to an
  // already-named item. Both are now derived from the reminder's STRUCTURED
  // fields. The clause's real intent — that the engine is read, never
  // rewritten — is unchanged and asserted directly against the engine file.
  assert('8i. the engine is never edited to fix wording', !/snooze|dismiss/i.test(read('src/lib/calculations/reminders.ts')) && /Did you pay your/.test(read('src/lib/calculations/reminders.ts')));
  assert('8j. and the surface derives its words from structured fields, not that prose', /resolveReminderIdentity\(\{/.test(CODE) && !/reminder\.body/.test(CODE) && !/\{reminder\.title\}/.test(CODE));
}

console.log('\n=== 9. Action hierarchy, status and scaling (Class C) ===');
{
  assert('9a. Record payment is the primary interactive control', /testID="reminder-record-payment"[\s\S]{0,200}|styles\.actionButtonPrimary/.test(CODE) && /actionButtonPrimary: \{ backgroundColor: semantic\.interactive \}/.test(CODE));
  assert('9b. it still reaches exactly the handler it always did', /onPress=\{\(\) => \(reminderCard \? onRequestCreditCardRepayment\?\.\(\) : deferReminder\(\)\)\}/.test(CODE));
  assert('9c. View card is the outlined secondary, not a filled control', /actionButtonOutline: \{ backgroundColor: 'transparent', borderWidth: 2/.test(CODE));
  assert('9d. and it still closes the sheet BEFORE navigating', /onNavigateAway\?\.\(\);\s*\n\s*navigation\.navigate\('Cards'\);/.test(CODE));
  assert('9e. navigation never uses the success role — green would imply a settled outcome', !/actionButtonOutline[\s\S]{0,80}success/.test(CODE));
  assert('9f. the status pill maps onto existing semantic roles only', /semantic\.infoTint/.test(CODE) && /semantic\.warningTint/.test(CODE) && /semantic\.urgentTint/.test(CODE) && !/#[0-9a-fA-F]{6}/.test(CODE));
  assert('9g. overdue is urgent, due-today/tomorrow caution, further out informational', /daysUntil < 0[\s\S]{0,60}'urgent'/.test(PRESENT) && /daysUntil === 0[\s\S]{0,60}'caution'/.test(PRESENT));
  assert('9h. one announcement per reminder, leading with the queue position', /composeReminderAnnouncement\(\{/.test(CODE) && /if \(input\.total > 1\) parts\.push\(`Reminder \$\{Math\.min\(input\.position, input\.total\)\} of \$\{input\.total\}`\)/.test(PRESENT));
  // RECONCILED (Design 5.1 Wave 6 final). The clause's intent is that a
  // reminder's own identity is announced ONCE, by the focus event, and
  // never double-spoken by a competing announceForAccessibility. That is
  // unchanged: the title still carries the composed announcement, and no
  // announcement is made for a reminder appearing. What IS announced now is
  // the RESULT of a suppression the customer just confirmed — a distinct
  // event, at a moment when focus is moving anyway, and the one thing a
  // screen-reader customer otherwise has no way to learn. Bounded to
  // exactly the two confirm handlers.
  assert('9i. no announcement competes with the reminder\'s own focus event', !/composeReminderAnnouncement[\s\S]{0,400}announceForAccessibility/.test(CODE));
  assert('9i-i. the only announcements are the two confirmed suppression results', (CODE.match(/AccessibilityInfo\.announceForAccessibility/g) || []).length === 2);
  assert('9i-ii. and each is inside a confirm handler, never a render path', /function confirmSnooze[\s\S]{0,600}announceForAccessibility/.test(CODE) && /function confirmDismiss[\s\S]{0,400}announceForAccessibility/.test(CODE));
  assert('9j. and actions stack once text is scaled up', /const stackActions = fontScale >= 1\.3;/.test(CODE) && /actionRowStacked: \{ flexDirection: 'column'/.test(CODE));
  assert('9k. no emoji anywhere on the redesigned surface', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(CODE) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PRESENT));
  assert('9l. and the presentation module stays pure — no state, no persistence, no arithmetic on money beyond display rounding', !/useState|AsyncStorage|dispatch|updateAsset|addTransaction/.test(PRESENT));
}

console.log('\n=== 10. The mirrored day count agrees with the engine (Class B) ===');
{
  // reminderDaysUntil mirrors reminders.ts's module-private daysBetween,
  // because that file is a financial engine this pass may not edit — not
  // even to add an export. If the two ever diverge, the status pill would
  // mislabel a reminder's timing, so the agreement is proven here rather
  // than assumed. Both are run for real (Class A execution of a Class B
  // mirror) against the engine's own tier boundaries.
  const ENGINE = read('src/lib/calculations/reminders.ts');
  assert('10a. the engine still normalises to local midnight before subtracting', /new Date\(d\.getFullYear\(\), d\.getMonth\(\), d\.getDate\(\)\)/.test(ENGINE));
  assert('10b. and still rounds a whole-day division', /Math\.round\(\(startOfDay\(b\)\.getTime\(\) - startOfDay\(a\)\.getTime\(\)\) \/ 86400000\)/.test(ENGINE));
  assert('10c. the mirror uses the identical normalisation', /new Date\(d\.getFullYear\(\), d\.getMonth\(\), d\.getDate\(\)\)/.test(PRESENT));
  assert('10d. and the identical rounded division', /Math\.round\(\(startOfDay\(occurrence\)\.getTime\(\) - startOfDay\(today\)\.getTime\(\)\) \/ 86400000\)/.test(PRESENT));

  const today = new Date(2026, 5, 15);
  const at = (y: number, m: number, d: number) => new Date(y, m, d).toISOString();
  const CASES: [string, string, number][] = [
    ['two days overdue', at(2026, 5, 13), -2],
    ['yesterday', at(2026, 5, 14), -1],
    ['today', at(2026, 5, 15), 0],
    ['tomorrow — the exact bill_due_soon tier', at(2026, 5, 16), 1],
    ['three days out — the exact card tier edge', at(2026, 5, 18), 3],
    ['across a month boundary', at(2026, 6, 1), 16],
  ];
  for (const [label, iso, expected] of CASES) {
    assert(`10e. ${label} => ${expected}`, reminderDaysUntil(iso, today) === expected);
  }
  // Across a DST transition the mirror must still count whole calendar
  // days, not 23- or 25-hour spans — the exact failure local-midnight
  // normalisation exists to prevent.
  assert('10f. a spring-forward week still counts whole calendar days', reminderDaysUntil(new Date(2026, 9, 11).toISOString(), new Date(2026, 9, 4)) === 7);
  assert('10g. an absent occurrence date yields null, never a fabricated 0', reminderDaysUntil(undefined, today) === null);
  assert('10h. and an unparseable one does too', reminderDaysUntil('not-a-date', today) === null);

  // The status the mirror feeds must match the engine's own tier meaning.
  assert('10i. overdue reads as urgent', resolveReminderStatus('bill_overdue', -2).tone === 'urgent');
  assert('10j. due today reads as caution, never urgent — it is not yet late', resolveReminderStatus('bill_overdue', 0).tone === 'caution');
  assert('10k. tomorrow reads as caution', resolveReminderStatus('bill_due_soon', 1).label === 'Due tomorrow');
  assert('10l. a distant date is merely informational', resolveReminderStatus('bill_due_soon', 12).tone === 'informational');
  assert('10m. an expected salary is never framed as a debt', resolveReminderStatus('salary_check', 3).label === 'Expected');
  assert('10n. and a missing day count degrades to a neutral label, never a wrong one', resolveReminderStatus('bill_due_soon', null).label === 'Upcoming');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
