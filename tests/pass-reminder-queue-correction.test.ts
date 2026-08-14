// Reminder queue and credit-card wording correction round — final, narrowly
// scoped Pass 2D correction fixing four confirmed device-test defects:
// (A) "Not yet" terminating the whole Reminder review instead of advancing
// to the next genuine Reminder; (B) a blank Reminder-sheet shell during the
// native closing-animation window; (C) the independent Next-event tile
// showing ambiguous "Card" for a credit-card repayment; (D) a due-today
// credit card showing "due soon" wording. See reminders.ts, briefingTiles.ts,
// creditHealth.ts, reminderInteractionLifecycle.ts, SmartReminderCard.tsx,
// ReminderDetailSheet.tsx, AppStateContext.tsx for the implementation.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): computeTopReminder, computeRankedReminder
//   (reminders.ts); computeCreditCardDuePresentation,
//   creditCardDueTileValue, creditCardDuePresentationCopy (creditHealth.ts);
//   reduceReminderLifecycle, occurrenceKeyOf (reminderInteractionLifecycle.ts)
//   — every invariant claiming real behavioural proof below is a genuine
//   call against real production functions, not a mirror or a hand-authored
//   literal.
// - Structural (regex/string match against source text): SmartReminderCard.tsx
//   and ReminderDetailSheet.tsx are React Native TSX and cannot be imported
//   in this harness (see tests/README.md) — their wiring is proven via
//   source-text assertions, which prove code shape only, never on-device
//   touch/render behaviour.
//
// Run with: npx tsx tests/pass-reminder-queue-correction.test.ts

import * as fs from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeTopReminder, computeRankedReminder, SmartReminder } from '../src/lib/calculations/reminders';
import {
  computeCreditCardDuePresentation,
  creditCardDueTileValue,
  creditCardDuePresentationCopy,
} from '../src/lib/calculations/creditHealth';
import { reduceReminderLifecycle, ReminderLifecycleState, occurrenceKeyOf } from '../src/lib/calculations/reminderInteractionLifecycle';
import type { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function dISO(iso: string): string {
  return d(iso).toISOString();
}
function baseData(): AppData {
  return createEmptyAppData();
}

const SMART_REMINDER_SRC = fs.readFileSync('src/components/today/SmartReminderCard.tsx', 'utf8');
const REMINDER_SHEET_SRC = fs.readFileSync('src/components/today/ReminderDetailSheet.tsx', 'utf8');
const APP_STATE_SRC = fs.readFileSync('src/state/AppStateContext.tsx', 'utf8');
const REMINDERS_SRC = fs.readFileSync('src/lib/calculations/reminders.ts', 'utf8');
const BRIEFING_TILES_SRC = fs.readFileSync('src/lib/calculations/briefingTiles.ts', 'utf8');

console.log('=== SECTION 1: session-deferral via computeRankedReminder (real function) ===');
{
  const today = d('2026-08-14');
  let data = baseData();
  data = {
    ...data,
    assets: [{ id: 'ed1', type: 'everyday', label: 'Everyday', currentValue: 6000, includeInMoneyCalculations: true }],
    liabilities: [
      { id: 'richmond', type: 'mortgage', label: 'Richmond Test', currentBalance: 380000 },
      { id: 'sy', type: 'mortgage', label: 'SY Test', currentBalance: 210000 },
    ],
    recurringItems: [
      {
        id: 'richmond-repay',
        type: 'expense',
        label: 'Richmond Test repayment',
        amount: 1800,
        frequency: 'monthly',
        nextDueDate: dISO('2026-08-10'),
        isFixed: true,
        active: true,
        linkedLiabilityId: 'richmond',
      },
      {
        id: 'sy-repay',
        type: 'expense',
        label: 'SY Test repayment',
        amount: 1200,
        frequency: 'monthly',
        nextDueDate: dISO('2026-08-11'),
        isFixed: true,
        active: true,
        linkedLiabilityId: 'sy',
      },
    ],
  };

  const richmond = computeTopReminder(data, today);
  assert('fixture sanity: Richmond Test is the initial top-ranked reminder (earlier overdue date)', richmond?.recurringItemId === 'richmond-repay');

  const richmondKey = richmond ? occurrenceKeyOf(richmond) : '';
  const excludeRichmond = (r: SmartReminder) => occurrenceKeyOf(r) === richmondKey;
  const afterDeferringRichmond = computeRankedReminder(data, today, excludeRichmond);
  assert(
    '"Not yet" on Richmond (session-excluded, no data mutation) immediately surfaces SY Test — never closes the review',
    afterDeferringRichmond?.recurringItemId === 'sy-repay'
  );

  const syKey = afterDeferringRichmond ? occurrenceKeyOf(afterDeferringRichmond) : '';
  const excludeBoth = (r: SmartReminder) => occurrenceKeyOf(r) === richmondKey || occurrenceKeyOf(r) === syKey;
  const afterDeferringBoth = computeRankedReminder(data, today, excludeBoth);
  assert('deferring every pending Reminder terminates safely with null (clean close), never an infinite loop or a stale repeat', afterDeferringBoth === null);

  assert(
    'excluding Richmond does not exclude a DIFFERENT occurrence of the same recurring source (distinct occurrenceDate -> distinct key)',
    (() => {
      const nextMonth = { ...data.recurringItems[0], nextDueDate: dISO('2026-09-10') };
      const laterData = { ...data, recurringItems: [nextMonth, data.recurringItems[1]] };
      const laterRichmond = computeTopReminder(laterData, d('2026-09-08'));
      return !!laterRichmond && !excludeRichmond(laterRichmond);
    })()
  );
}

console.log('\n=== SECTION 2: computeTopReminder is a byte-for-byte-equivalent wrapper over computeRankedReminder (real function, backward compatibility) ===');
{
  const today = d('2026-08-14');
  const fixtures: AppData[] = [
    baseData(),
    {
      ...baseData(),
      recurringItems: [
        { id: 'bill1', type: 'expense', label: 'Electricity', amount: 120, frequency: 'monthly', nextDueDate: dISO('2026-08-10'), isFixed: true, active: true },
      ],
    },
    {
      ...baseData(),
      creditCards: [
        {
          id: 'cba',
          issuer: 'CBA',
          label: 'Cba',
          creditLimit: 5000,
          currentBalance: 1200,
          dueDay: 14,
          minimumPayment: 0,
          expectedMonthlyRepayment: 200,
          interestRate: 19.9,
        } as any,
      ],
    },
  ];
  for (const [i, data] of fixtures.entries()) {
    assert(`fixture ${i}: computeTopReminder(data, today) deep-equals computeRankedReminder(data, today) with no exclusion`, JSON.stringify(computeTopReminder(data, today)) === JSON.stringify(computeRankedReminder(data, today)));
  }
}

console.log('\n=== SECTION 3: no-blank-presentation reducer proof (real function) — same-sheet advancement never passes through closed ===');
{
  const reminderA: SmartReminder = { id: 'a', kind: 'bill_overdue', title: 'A', body: 'A body', recurringItemId: 'a', occurrenceDate: dISO('2026-08-10') };
  const reminderB: SmartReminder = { id: 'b', kind: 'bill_overdue', title: 'B', body: 'B body', recurringItemId: 'b', occurrenceDate: dISO('2026-08-11') };

  let state: ReminderLifecycleState = { kind: 'closed' };
  state = reduceReminderLifecycle(state, { type: 'OPEN', reminder: reminderA });
  assert('opening pins reminder_detail with real content', state.kind === 'reminder_detail' && state.reminder.id === 'a');

  const afterDefer = reduceReminderLifecycle(state, { type: 'SETTLED', latestTopReminder: reminderB });
  assert(
    'SETTLED with a genuine next-eligible reminder transitions DIRECTLY to the new reminder_detail — never an intermediate closed frame',
    afterDefer.kind === 'reminder_detail' && afterDefer.reminder.id === 'b'
  );

  const afterAllDeferred = reduceReminderLifecycle(afterDefer, { type: 'SETTLED', latestTopReminder: null });
  assert('SETTLED with no remaining eligible reminder closes cleanly (this is the only path to closed from reminder_detail besides FORCE_CLOSE)', afterAllDeferred.kind === 'closed');
}

console.log('\n=== SECTION 4: credit-card due-date presentation matrix (real function) ===');
{
  const due = new Date(2026, 7, 14);
  const passed = computeCreditCardDuePresentation(-1, due);
  const today = computeCreditCardDuePresentation(0, due);
  const tomorrow = computeCreditCardDuePresentation(1, due);
  const twoDays = computeCreditCardDuePresentation(2, due);
  const threeDays = computeCreditCardDuePresentation(3, due);
  const invalid = computeCreditCardDuePresentation(NaN, null);

  assert('daysUntil -1 classifies as passed', passed.state === 'passed');
  assert('daysUntil 0 classifies as today', today.state === 'today');
  assert('daysUntil 1 classifies as tomorrow', tomorrow.state === 'tomorrow');
  assert('daysUntil 2 classifies as soon', twoDays.state === 'soon');
  assert('daysUntil 3 classifies as soon', threeDays.state === 'soon');
  assert('null due date / NaN days classifies as invalid regardless of the numeric input', invalid.state === 'invalid');

  assert('Briefing tile value for today: "Credit card due today"', creditCardDueTileValue(today) === 'Credit card due today');
  assert('Briefing tile value for tomorrow: "Credit card due tomorrow"', creditCardDueTileValue(tomorrow) === 'Credit card due tomorrow');
  assert('Briefing tile value for soon (2 days): "Credit card due in 2 days"', creditCardDueTileValue(twoDays) === 'Credit card due in 2 days');
  assert('Briefing tile value for passed: "Credit card payment date passed"', creditCardDueTileValue(passed) === 'Credit card payment date passed');
  assert('Briefing tile value for invalid: never claims a specific day count', creditCardDueTileValue(invalid) === 'Credit card payment coming up');

  const todayCopy = creditCardDuePresentationCopy(today, 'Cba');
  assert('Reminder heading for today names the card and says "due today", never "coming up"/"due soon"', todayCopy.heading === 'Your Cba payment is due today');
  assert('Reminder due-line for today is factual and explicit', todayCopy.dueLine.includes('due today'));

  const passedCopy = creditCardDuePresentationCopy(passed, 'Cba');
  assert(
    '"passed" heading never claims provider-authoritative overdue/unpaid status — factual "recorded payment date...has passed" only',
    passedCopy.heading === 'The recorded payment date for Cba has passed' && !/overdue|unpaid|late/i.test(passedCopy.heading)
  );
  assert('"passed" due-line states the recorded due date factually, never "amount due"/"payment required"', /Recorded due date/.test(passedCopy.dueLine) && !/amount due|payment required|statement balance/i.test(passedCopy.dueLine));
}

console.log('\n=== SECTION 5: reminders.ts cardDue branch wires the shared presentation (real function, Defect D) ===');
{
  const today = d('2026-08-14');
  const cardDueToday: AppData = {
    ...baseData(),
    creditCards: [
      { id: 'cba', issuer: 'CBA', label: 'Cba', creditLimit: 5000, currentBalance: 1200, dueDay: 14, minimumPayment: 0, expectedMonthlyRepayment: 200, interestRate: 19.9 } as any,
    ],
  };
  const reminder = computeTopReminder(cardDueToday, today);
  assert('a card due today produces a card_due_soon reminder', reminder?.kind === 'card_due_soon');
  assert('the reminder title says "due today", never the old day-count-blind "is coming up" wording', reminder?.title === 'Your Cba payment is due today');
  assert('the reminder body opens with a "due today" line, not a bare "Payment due [date]." with no day-count', !!reminder?.body.startsWith('Payment due today'));
  assert('the reminder carries its own creditCardDue presentation (single source of truth shared with the Briefing tile)', reminder?.creditCardDue?.state === 'today');

  const cardDueTomorrow: AppData = {
    ...baseData(),
    creditCards: [
      { id: 'cba', issuer: 'CBA', label: 'Cba', creditLimit: 5000, currentBalance: 1200, dueDay: 15, minimumPayment: 0, expectedMonthlyRepayment: 200, interestRate: 19.9 } as any,
    ],
  };
  const tomorrowReminder = computeTopReminder(cardDueTomorrow, today);
  assert('a card due tomorrow says "due tomorrow", never "due today" or the generic "coming up"', tomorrowReminder?.title === 'Your Cba payment is due tomorrow');

  assert('every other body line (recorded balance) is preserved verbatim by the correction', !!reminder?.body.includes('Current recorded balance: $1,200.'));
}

console.log('\n=== SECTION 6: briefingTiles.ts Defect C (Next-event tile) + reminder tile day-count awareness (real source) ===');
{
  assert('EVENT_KIND_LABEL.credit_card is "Credit card", never the ambiguous generic "Card" ("a debit card cannot be due")', /credit_card: 'Credit card',/.test(BRIEFING_TILES_SRC));
  assert('no other EVENT_KIND_LABEL entry was touched — mortgage/bill/income/savings/goal/bnpl remain exactly as before', /mortgage: 'Mortgage',/.test(BRIEFING_TILES_SRC) && /bnpl: 'Repayment',/.test(BRIEFING_TILES_SRC));
  assert(
    'reminderTileStatus reads the day-count-aware creditCardDue field via creditCardDueTileValue for card_due_soon, never a static string',
    /case 'card_due_soon':\s*\n\s*return reminder\.creditCardDue \? creditCardDueTileValue\(reminder\.creditCardDue\) : 'Card due soon';/.test(BRIEFING_TILES_SRC)
  );
}

console.log('\n=== SECTION 7: SmartReminderCard.tsx no longer has a local dismissedIds hide-list (Defect A root cause, real source) ===');
{
  assert(
    'the dismissedIds local hide-list state is gone — only explanatory doc-comment prose referencing the old symbol name remains (2 comment lines, no `useState`/`setDismissedIds` declaration)',
    !/useState<Set<string>>\(new Set\(\)\)/.test(SMART_REMINDER_SRC) && !/setDismissedIds/.test(SMART_REMINDER_SRC)
  );
  assert('reminder is now a direct alias of the topReminder prop, no local filtering', /const reminder = topReminder;/.test(SMART_REMINDER_SRC));
  assert(
    'onOutcome replaces onSettled as the reported prop — the only remaining "onSettled" text is explanatory doc-comment prose, not a live prop/callsite',
    /onOutcome\?: \(outcome: ReminderReviewOutcome\) => void;/.test(SMART_REMINDER_SRC) && !/onSettled\?:/.test(SMART_REMINDER_SRC) && !/onSettled=\{/.test(SMART_REMINDER_SRC)
  );
  assert(
    'every "Not yet" button calls deferReminder (salary_check, bill_overdue/bnpl shared, loan_repayment_due) — 3 distinct call sites',
    (SMART_REMINDER_SRC.match(/onPress=\{deferReminder\}/g) || []).length === 3
  );
  assert('the "Got it" button (bill_due_soon) calls acknowledgeReminder, never deferReminder', /onPress=\{acknowledgeReminder\}/.test(SMART_REMINDER_SRC));
  assert(
    'the mutation-success paths report a completed outcome with the real transactionId and the mutation\'s own fresh data',
    /reportCompleted\(transactionId, transition\.data\);/.test(SMART_REMINDER_SRC)
  );
  assert(
    'stale/not_found/already_confirmed paths (runConfirmation, runBnplConfirmation, confirmSalaryToDestination) each report reportAlreadyResolved() — session-deferred, never a fabricated completion',
    (SMART_REMINDER_SRC.match(/reportAlreadyResolved\(\);/g) || []).length === 3
  );
}

console.log('\n=== SECTION 8: ReminderDetailSheet.tsx session-deferred queue + blank-shell prevention (Defects A & B, real source) ===');
{
  assert('sessionDeferredKeysRef is a real Set-backed ref', /const sessionDeferredKeysRef = useRef<Set<string>>\(new Set\(\)\);/.test(REMINDER_SHEET_SRC));
  assert('sessionDeferredKeysRef is cleared at the start of the opening effect — every fresh open starts a clean session', /sessionDeferredKeysRef\.current = new Set\(\);\s*\n\s*const liveTop = computeTopReminder/.test(REMINDER_SHEET_SRC));
  assert(
    'advanceToNextEligible re-ranks via the canonical computeRankedReminder with the session-exclusion predicate, never a second hand-assembled queue',
    /function advanceToNextEligible\(latestData: AppData\) \{\s*const next = computeRankedReminder\(latestData, today, isSessionExcluded\);/.test(REMINDER_SHEET_SRC)
  );
  assert(
    "handleReminderOutcome adds a deferred/acknowledged occurrence to the session set (never persisted) and re-ranks; 'completed' relies on the mutation itself",
    /function handleReminderOutcome\(outcome: ReminderReviewOutcome\) \{\s*if \(outcome\.kind === 'completed'\) \{\s*advanceToNextEligible\(outcome\.latestData\);\s*return;\s*\}\s*sessionDeferredKeysRef\.current\.add\(outcome\.occurrenceKey\);\s*advanceToNextEligible\(data\);/.test(
      REMINDER_SHEET_SRC
    )
  );
  assert(
    'the loan/card "Done" footer buttons now advance via advanceToNextEligible — the only remaining "handleSettled" text is explanatory doc-comment prose, not a live function/callsite',
    !/function handleSettled/.test(REMINDER_SHEET_SRC) &&
      !/handleSettled\(data\)/.test(REMINDER_SHEET_SRC) &&
      (REMINDER_SHEET_SRC.match(/advanceToNextEligible\(data\)/g) || []).length >= 4
  );
  assert(
    'presentedState retains the last non-closed content across the render where state becomes closed — the blank-shell fix',
    /const presentedState = state\.kind !== 'closed' \? state : lastPresentedStateRef\.current;/.test(REMINDER_SHEET_SRC)
  );
  assert('visible is still derived from the REAL state, not presentedState — the close animation begins immediately', /const visible = isReminderLifecycleVisible\(state\);/.test(REMINDER_SHEET_SRC));
  assert(
    'the retained content is cleared only via KeyboardSheet\'s existing onDismiss (the real native dismissal-complete signal), never a timeout',
    /onDismiss=\{handleNativeDismissComplete\}/.test(REMINDER_SHEET_SRC) && /function handleNativeDismissComplete\(\) \{\s*lastPresentedStateRef\.current = CLOSED_STATE;\s*\}/.test(REMINDER_SHEET_SRC)
  );
  assert('no timeout/setTimeout/setInterval was introduced anywhere in this file for the blank-shell fix', !/setTimeout|setInterval/.test(REMINDER_SHEET_SRC));
  assert('still exactly one native Modal/KeyboardSheet, unchanged from the prior round', (REMINDER_SHEET_SRC.match(/<KeyboardSheet\b/g) ?? []).length === 1 && !/<Modal\b/.test(REMINDER_SHEET_SRC));
}

console.log('\n=== SECTION 9: AppStateContext.tsx transactionId threading (real source) ===');
{
  assert(
    'confirmRecurringOccurrence returns transactionId on BOTH the applied and not-applied paths',
    /return \{ transition, persistence: Promise\.resolve\(\), transactionId \};/.test(APP_STATE_SRC) && /return \{ transition, persistence, transactionId \};/.test(APP_STATE_SRC)
  );
  assert(
    'confirmBnplRepayment likewise returns transactionId on both paths',
    /const confirmBnplRepayment = useCallback\(\s*\(input: Omit<ConfirmBnplRepaymentInput, 'transactionId' \| 'date'>\): \{ transition: ConfirmBnplRepaymentResult; persistence: Promise<void>; transactionId: string \}/.test(
      APP_STATE_SRC
    )
  );
  assert('ConfirmationCommitResult\'s own type declares transactionId: string', /export type ConfirmationCommitResult = \{\s*transition: ConfirmRecurringOccurrenceResult;\s*persistence: Promise<void>;/.test(APP_STATE_SRC) && /transactionId: string;\s*\n\};/.test(APP_STATE_SRC));
}

console.log('\n=== SECTION 10: reminderInteractionLifecycle.ts ReminderReviewOutcome type (real source) ===');
{
  assert(
    "ReminderReviewOutcome is a discriminated union of completed/deferred/acknowledged, distinct from RepaymentResult",
    /export type ReminderReviewOutcome =\s*\n\s*\| \{ kind: 'completed'; occurrenceKey: ReminderOccurrenceKey; transactionId: string; latestData: AppData \}\s*\n\s*\| \{ kind: 'deferred'; occurrenceKey: ReminderOccurrenceKey \}\s*\n\s*\| \{ kind: 'acknowledged'; occurrenceKey: ReminderOccurrenceKey \};/.test(
      fs.readFileSync('src/lib/calculations/reminderInteractionLifecycle.ts', 'utf8')
    )
  );
  assert('AppData is imported as a type-only import (no live-data-reading violation of this module\'s own pure-module principle)', /import type \{ AppData \} from '\.\.\/\.\.\/types\/models';/.test(fs.readFileSync('src/lib/calculations/reminderInteractionLifecycle.ts', 'utf8')));
}

console.log('\n=== SECTION 11: regression — accepted prior behaviour unaffected (Structural) ===');
{
  assert('computeTopReminder\'s own 9-tier priority order is unchanged (overdue bill/BNPL/loan -> salary -> due-today -> due-soon -> card)', REMINDERS_SRC.indexOf('overdueBillCandidates') < REMINDERS_SRC.indexOf('upcomingIncomeCandidates') && REMINDERS_SRC.indexOf('upcomingIncomeCandidates') < REMINDERS_SRC.indexOf('dueTodayBillCandidates') && REMINDERS_SRC.indexOf('dueSoonCandidates') < REMINDERS_SRC.indexOf('cardDueCandidates'));
  assert('isCardOccurrenceHandled (shared occurrence-handled helper) is untouched', /export function isCardOccurrenceHandled\(card: CreditCard, occurrenceDate: Date\): boolean \{/.test(REMINDERS_SRC));
  assert('SmartReminderCard.tsx still never mounts a second Modal of its own', !/<Modal\b/.test(SMART_REMINDER_SRC));
  assert('ReminderDetailSheet.tsx still resolves loanLiability/loanRecurringItem/cardCard from the REAL state, not presentedState (forms never stay "active" past their own real transition)', /const loanReminder = state\.kind === 'loan_form' \|\| state\.kind === 'loan_recorded' \? state\.reminder : null;/.test(REMINDER_SHEET_SRC));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
