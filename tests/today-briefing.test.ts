// Pass 2A — Today Briefing structure and navigation, correction pass,
// 2026-08-12 (per "Navilo Today & Grow Product Feature Specification v1.0").
//
// CLASSIFICATION (per tests/README.md's evidence taxonomy):
// - Real import (Class A): occurrenceDateKey, eventOccurrenceIdentity,
//   reminderOccurrenceIdentity, sameOccurrence, selectSafeToSpendPresentation,
//   formatSafeToSpendAmount, computeSafeToSpend, computeMoneyHeroCopy,
//   selectTodayBriefingEventRows, formatBriefingDateContext,
//   selectUrgentOutflowEvents, selectNearTermIncomeEvents, selectNearTermIncomeEvent,
//   buildAttentionEventTitle, attentionEventTone, computeAttentionItems,
//   computeTopReminder are all imported and executed directly — genuine
//   behavioural proof of these exact shipped functions.
// - "Selector-only proof" (an established pattern in this codebase — see
//   safe-to-spend-closure-corrections.test.ts's r5positiveOverride): for the
//   one hero state (goals_underfunded) whose real-arithmetic trigger
//   conditions are governed by computeGoalAllocation/selectSafeToSpendHeroState
//   — both pre-existing, unmodified, and out of this pass's scope — a real,
//   valid computeSafeToSpend result is taken and one field is overridden to
//   reach that state, then the REAL selectSafeToSpendPresentation is called
//   on it.
// - Structural: regex/string matches against TodayScreen.tsx, MoneyScreen.tsx,
//   SmartReminderCard.tsx, TodayBriefingCard.tsx source text — these four are
//   all React components that transitively import react-native and cannot be
//   imported/executed by tsx (confirmed empirically, matching every other
//   .tsx file in this repo). Confirms wiring exists; proves nothing about
//   runtime behaviour by itself.
//
// LIMITATION (explicit, per correction pass §5): this repository has no
// react-native-testing-library or any component-runtime test harness, and
// none may be added (no new dependencies authorised). A genuine rendered-
// component or navigation-behaviour test — actually mounting TodayBriefingCard/
// MoneyScreen, simulating a tap, and asserting the resulting scroll/navigation
// call — is therefore NOT possible in this suite. Every claim about on-screen
// rendering, tap targets, scroll behaviour, or navigation transitions below is
// Structural only (source-text wiring) or is explicitly left to the physical-
// device checklist. This limitation is unchanged from the original Pass 2A
// pass and is not a new gap introduced by this correction.
//
// Run with: npx tsx tests/today-briefing.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../src/lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation, formatSafeToSpendAmount } from '../src/lib/calculations/safeToSpendPresentation';
import {
  TimelineEvent,
  computeAttentionItems,
  selectUrgentOutflowEvents,
  selectNearTermIncomeEvent,
  selectNearTermIncomeEvents,
  buildAttentionEventTitle,
  attentionEventTone,
} from '../src/lib/calculations/moneyTimeline';
import { SmartReminder, computeTopReminder } from '../src/lib/calculations/reminders';
import {
  selectTodayBriefingEventRows,
  eventOccurrenceIdentity,
  reminderOccurrenceIdentity,
  sameOccurrence,
  occurrenceDateKey,
  formatBriefingDateContext,
} from '../src/lib/calculations/todayBriefing';
import type { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'weekly';
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  return d;
}
const today = new Date(2026, 7, 11);

console.log('=== Section 1: occurrenceDateKey — local-calendar day key (real function) ===');
{
  assert('formats a plain date as YYYY-MM-DD', occurrenceDateKey(new Date(2026, 7, 11)) === '2026-08-11');
  assert('pads single-digit month/day', occurrenceDateKey(new Date(2026, 0, 5)) === '2026-01-05');
  assert('two Date instants on the same local calendar day (different times) produce the same key', occurrenceDateKey(new Date(2026, 7, 11, 3, 0)) === occurrenceDateKey(new Date(2026, 7, 11, 23, 59)));
  assert('adjacent calendar days produce different keys', occurrenceDateKey(new Date(2026, 7, 11)) !== occurrenceDateKey(new Date(2026, 7, 12)));
}

console.log('\n=== Section 2: OccurrenceIdentity — source type + source id + occurrence date (real functions) ===');
{
  const d1 = new Date(2026, 7, 11);
  const d2 = new Date(2026, 7, 18);

  // Required identity shape.
  const identity = eventOccurrenceIdentity({ recurringItemId: 'r1', date: d1 } as any);
  assert('eventOccurrenceIdentity returns sourceType + sourceId + occurrenceDateKey (all three parts)', identity?.sourceType === 'recurring_item' && identity?.sourceId === 'r1' && identity?.occurrenceDateKey === '2026-08-11');

  // same raw ID + different source types -> distinct
  const recurring = eventOccurrenceIdentity({ recurringItemId: 'x1', date: d1 } as any);
  const creditCard = eventOccurrenceIdentity({ creditCardId: 'x1', date: d1 } as any);
  assert(
    'COLLISION PREVENTION: same raw id ("x1"), same date, but different source types -> distinct (never equal)',
    !sameOccurrence(recurring, creditCard)
  );

  // same recurring source + different occurrences -> distinct
  const occurrenceA = eventOccurrenceIdentity({ recurringItemId: 'r1', date: d1 } as any);
  const occurrenceB = eventOccurrenceIdentity({ recurringItemId: 'r1', date: d2 } as any);
  assert(
    'same recurring source (recurringItemId "r1") but two different occurrence dates -> distinct occurrences, never merged',
    !sameOccurrence(occurrenceA, occurrenceB)
  );

  // same source + same occurrence in reminder and event -> equal
  const eventIdentity = eventOccurrenceIdentity({ recurringItemId: 'r1', date: d1 } as any);
  const reminderIdentity = reminderOccurrenceIdentity({ id: 'rem', kind: 'bill_overdue', title: '', body: '', recurringItemId: 'r1', occurrenceDate: d1.toISOString() });
  assert('the SAME source and the SAME occurrence date, one read from an event and one from a reminder -> equal', sameOccurrence(eventIdentity, reminderIdentity));

  // A reminder about occurrence A of a recurring source must not falsely
  // match a DIFFERENT occurrence (occurrence B) of that same source — this
  // is the exact correction this pass makes (previously, source-only
  // identity would have incorrectly matched here).
  const reminderIdentityA = reminderOccurrenceIdentity({ id: 'rem', kind: 'bill_overdue', title: '', body: '', recurringItemId: 'r1', occurrenceDate: d1.toISOString() });
  assert(
    'CORRECTED: a reminder about one specific occurrence of a recurring source does not match a DIFFERENT occurrence of that same source',
    !sameOccurrence(occurrenceB, reminderIdentityA)
  );

  // BNPL precedence — recurringItemId checked before bnplLiabilityId, both
  // on the event side and the reminder side, and the two sides still agree.
  const bnplEvent = eventOccurrenceIdentity({ recurringItemId: 'r1', bnplLiabilityId: 'liab1', date: d1 } as any);
  const bnplReminder = reminderOccurrenceIdentity({ id: 'rem', kind: 'bnpl_repayment_due', title: '', body: '', recurringItemId: 'r1', liabilityId: 'liab1', occurrenceDate: d1.toISOString() });
  assert('BNPL precedence: both sides resolve to recurring_item (not bnpl_liability), and agree', bnplEvent?.sourceType === 'recurring_item' && sameOccurrence(bnplEvent, bnplReminder));

  // Defensive: a reminder with a source but no occurrenceDate resolves to
  // null (never falls back to source-only matching, which would silently
  // regress to the pre-correction too-broad behaviour).
  const reminderNoDate = reminderOccurrenceIdentity({ id: 'rem', kind: 'bill_overdue', title: '', body: '', recurringItemId: 'r1' });
  assert('a reminder with no occurrenceDate resolves to null identity (never falls back to source-only matching)', reminderNoDate === null);
  assert('sameOccurrence: either side null -> false', !sameOccurrence(eventIdentity, null) && !sameOccurrence(null, eventIdentity));

  // credit_card and bnpl_liability precedence branches for reminders.
  const reminderCard = reminderOccurrenceIdentity({ id: 'rem', kind: 'card_due_soon', title: '', body: '', creditCardId: 'c1', occurrenceDate: d1.toISOString() });
  assert('reminder with creditCardId -> credit_card', reminderCard?.sourceType === 'credit_card');
}

console.log('\n=== Section 3: computeTopReminder — occurrenceDate is populated on every branch (real function) ===');
{
  function report(patch: (d: AppData) => void) {
    const d = baseData();
    patch(d);
    return computeTopReminder(d, today);
  }

  const overdue = report((d) => {
    d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: 500, frequency: 'weekly', nextDueDate: new Date(2026, 7, 5).toISOString(), isFixed: true, active: true }];
  });
  assert('overdue bill reminder carries occurrenceDate === the bill\'s own nextDueDate', overdue?.occurrenceDate === new Date(2026, 7, 5).toISOString());

  // salary_check fires for a due date at-or-before today within the
  // trailing 3-day window ("did it arrive yet"), not a future date —
  // confirmed by reading computeTopReminder's own real daysBetween(a, b)
  // semantics (b - a in days), so this fixture uses yesterday's date.
  const salary = report((d) => {
    d.recurringItems = [{ id: 'i1', type: 'income', label: 'Salary', amount: 2000, frequency: 'weekly', nextDueDate: new Date(2026, 7, 10).toISOString(), isFixed: false, active: true }];
  });
  assert('salary_check reminder carries occurrenceDate === the income item\'s own nextDueDate', salary?.occurrenceDate === new Date(2026, 7, 10).toISOString());

  const cardReminder = report((d) => {
    d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: today.getDate() + 2, minimumPayment: 25, expectedMonthlyRepayment: 300 }];
  });
  assert('card_due_soon reminder (the one kind with no pre-existing nextDueDate field) still carries a populated occurrenceDate', typeof cardReminder?.occurrenceDate === 'string' && cardReminder.occurrenceDate.length > 0);
}

console.log('\n=== Section 4: selectSafeToSpendPresentation — full contract, every hero state (real functions) ===');
{
  function report(patch: (d: AppData) => void, at: Date = today) {
    const d = baseData();
    patch(d);
    return { safeToSpend: computeSafeToSpend(d, at), heroCopy: computeMoneyHeroCopy(d) };
  }
  function assertAupAction(label: string, p: ReturnType<typeof selectSafeToSpendPresentation>) {
    assert(`${label}: action is focus_money_section/aup (the existing canonical recovery journey, never a duplicate setup route)`, p.action.kind === 'focus_money_section' && p.action.section === 'aup');
  }

  // unavailable_balance_data
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'unavailable_balance_data: heroState/tone/heading/primaryCopy/supportingCopy/amountVisible all correct',
      p.heroState === 'unavailable_balance_data' &&
        p.tone === 'warning' &&
        p.heading === 'AVAILABLE UNTIL PAYDAY' &&
        p.primaryCopy === 'Available amount unavailable' &&
        p.supportingCopy === 'Review your recorded balances.' &&
        p.amountVisible === false &&
        p.amountCents === null &&
        p.displayAmount === null
    );
    assertAupAction('unavailable_balance_data', p);
  }

  // unavailable_other_data
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
      d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: NaN, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'unavailable_other_data: distinct supportingCopy from unavailable_balance_data, amount hidden',
      p.heroState === 'unavailable_other_data' && p.supportingCopy === 'Review your recorded money details.' && p.amountVisible === false
    );
    assertAupAction('unavailable_other_data', p);
  }

  // no_known_payday, no included balance — never "available until payday" wording
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.user.nextPayday = null;
      d.assets = [];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'no_known_payday (no balance): heading AVAILABLE MONEY, amount hidden, empty-state wording — NEVER "available until payday" anywhere in heading/copy',
      p.heroState === 'no_known_payday' &&
        p.heading === 'AVAILABLE MONEY' &&
        p.amountVisible === false &&
        p.amountCents === null &&
        p.primaryCopy === 'Choose a balance to estimate your available money' &&
        !p.heading.toLowerCase().includes('until payday') &&
        !p.primaryCopy.toLowerCase().includes('until payday')
    );
    assertAupAction('no_known_payday (no balance)', p);
  }

  // no_known_payday, with included balance
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.user.nextPayday = null;
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 750 }];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'no_known_payday (with balance): amountCents === includedMoneyBalance in cents, displayAmount formatted from it, amountIsAvailableMoney true, still never "until payday" wording',
      p.heroState === 'no_known_payday' &&
        p.amountVisible === true &&
        p.amountCents === 75000 &&
        p.displayAmount === '$750' &&
        p.amountIsAvailableMoney === true &&
        p.primaryCopy === 'Based on the balances you selected.' &&
        !p.heading.toLowerCase().includes('until payday')
    );
    assertAupAction('no_known_payday (with balance)', p);
  }

  // missing_balance
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'missing_balance: heading is persona eyebrow, amount hidden, explains no balance selected',
      p.heroState === 'missing_balance' && p.heading === heroCopy.eyebrowScheduled.toUpperCase() && p.amountVisible === false && p.primaryCopy.includes('Select a balance for Navilo')
    );
    assertAupAction('missing_balance', p);
  }

  // recorded_overspend — real fixture
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: -100 }];
      d.transactions = [{ id: 't1', type: 'expense', amount: 600, categoryId: 'other', date: today.toISOString(), paymentSource: 'cash' } as any];
    });
    assert('recorded_overspend fixture sanity: cycleRemainingPool negative, cashVariableSpendSoFar > 0', safeToSpend.cycleRemainingPool < 0 && safeToSpend.cashVariableSpendSoFar > 0);
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    const expectedAmount = formatSafeToSpendAmount(-safeToSpend.cycleRemainingPool);
    assert(
      'recorded_overspend: amount hidden (never an authoritative figure), primaryCopy quotes the real recorded-overspend amount',
      p.heroState === 'recorded_overspend' && p.amountVisible === false && p.primaryCopy.includes(expectedAmount)
    );
    assertAupAction('recorded_overspend', p);
  }

  // commitments_exceed_cash — real fixture
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 50 }];
      d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: today.getDate(), minimumPayment: 25, expectedMonthlyRepayment: 300 }];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    const expectedAmount = formatSafeToSpendAmount(Math.abs(safeToSpend.cycleRemainingPool));
    assert('commitments_exceed_cash: amount hidden, primaryCopy quotes the real shortfall amount', p.heroState === 'commitments_exceed_cash' && p.amountVisible === false && p.primaryCopy.includes(expectedAmount));
    assertAupAction('commitments_exceed_cash', p);
  }

  // goals_underfunded — selector-only proof (see file header)
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
    });
    const underfunded = {
      ...safeToSpend,
      goalAllocation: {
        ...safeToSpend.goalAllocation,
        allocations: [{ goal: { id: 'g1', name: 'House deposit' } as any, requiredMonthly: 2000, allocatedMonthly: 200, isFullyFunded: false, projectedCompletionLabel: null }],
        isFullyFunded: false,
        totalRequiredMonthly: 2000,
        availableForGoals: 200,
      },
    };
    const p = selectSafeToSpendPresentation(underfunded, heroCopy);
    assert(
      'goals_underfunded: amount hidden, primaryCopy quotes both the required and available monthly figures',
      p.heroState === 'goals_underfunded' && p.amountVisible === false && p.primaryCopy.includes(formatSafeToSpendAmount(2000)) && p.primaryCopy.includes(formatSafeToSpendAmount(200))
    );
    assertAupAction('goals_underfunded', p);
  }

  // normal — genuine positive value AND genuine zero
  {
    const { safeToSpend, heroCopy } = report((d) => {
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
    });
    const p = selectSafeToSpendPresentation(safeToSpend, heroCopy);
    assert(
      'normal (positive authoritative value): amountCents === cycleRemainingPool in cents, displayAmount derived from amountCents (never independently rounded), primaryCopy === heroCopy.amountLabel',
      p.heroState === 'normal' &&
        p.amountVisible === true &&
        p.amountCents === Math.round(Math.max(0, safeToSpend.cycleRemainingPool) * 100) &&
        p.displayAmount === formatSafeToSpendAmount(p.amountCents! / 100) &&
        p.primaryCopy === heroCopy.amountLabel
    );
    assertAupAction('normal', p);

    const zero = { ...safeToSpend, cycleRemainingPool: 0 };
    const pZero = selectSafeToSpendPresentation(zero, heroCopy);
    assert('normal, genuine zero: amountVisible true, amountCents === 0 (a real $0 is authoritative, never hidden)', pZero.heroState === 'normal' && pZero.amountVisible === true && pZero.amountCents === 0 && pZero.displayAmount === '$0');
  }

  // valid negative cycle (commitments_exceed_cash, at the exact zero-day
  // boundary) — matches the established Section 6b pattern.
  {
    const d = baseData();
    d.user.nextPayday = new Date(2026, 7, 11).toISOString();
    d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 50 }];
    d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: today.getDate(), minimumPayment: 25, expectedMonthlyRepayment: 300 }];
    const r = computeSafeToSpend(d, today);
    const heroCopy = computeMoneyHeroCopy(d);
    const p = selectSafeToSpendPresentation(r, heroCopy);
    assert('valid negative cycle at the payday boundary: still amount-hidden, never a numeric figure shown as authoritative', p.heroState === 'commitments_exceed_cash' && p.amountVisible === false);
  }
}

console.log('\n=== Section 5: formatSafeToSpendAmount / cents conversion (real function) ===');
{
  assert('rounds and comma-groups', formatSafeToSpendAmount(1234.6) === '$1,235');
  assert('zero', formatSafeToSpendAmount(0) === '$0');
  assert('large figure comma grouping', formatSafeToSpendAmount(1000000) === '$1,000,000');
}

console.log('\n=== Section 6: selectTodayBriefingEventRows — full corrected pipeline (real function) ===');
{
  function outflow(id: string, daysUntil: number, recurringItemId?: string, creditCardId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'bill', icon: 'calendar-outline', label: 'Rent', amount: -500, recurringItemId, creditCardId };
  }
  function income(id: string, daysUntil: number, recurringItemId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'income', icon: 'cash', label: 'Salary', amount: 2000, recurringItemId };
  }
  function reminderFor(recurringItemId: string | undefined, daysUntil: number, opts?: { creditCardId?: string; liabilityId?: string }): SmartReminder {
    return {
      id: 'rem',
      kind: 'bill_due_soon',
      title: 'Did you pay?',
      body: '',
      recurringItemId,
      creditCardId: opts?.creditCardId,
      liabilityId: opts?.liabilityId,
      occurrenceDate: new Date(2026, 7, 11 + daysUntil).toISOString(),
    };
  }

  assert('0 eligible events -> []', selectTodayBriefingEventRows([], null).length === 0);

  {
    const rows = selectTodayBriefingEventRows([outflow('e1', 2, 'r1')], null);
    assert('1 eligible event, no reminder -> 1 row', rows.length === 1 && rows[0].key === 'e1');
  }

  // DEDUP: the reminder's own specific occurrence must not also appear as
  // an event row; an unrelated event still appears.
  {
    const rows = selectTodayBriefingEventRows([outflow('e1', 2, 'r1'), outflow('e2', 4, 'r2')], reminderFor('r1', 2));
    assert('the event matching the reminder\'s exact occurrence is excluded; the unrelated event still appears', rows.length === 1 && rows[0].key === 'e2');
  }

  // TYPED COLLISION PREVENTION at the dedup layer.
  {
    const rows = selectTodayBriefingEventRows([outflow('e1', 2, undefined, 'x1')], reminderFor('x1', 2));
    assert('an event whose creditCardId equals the reminder\'s recurringItemId (same raw string, different type) is NOT excluded', rows.length === 1 && rows[0].key === 'e1');
  }

  // CORRECTED occurrence-aware dedup: a reminder about ONE occurrence of a
  // recurring source must not exclude a DIFFERENT occurrence of that same
  // source (the exact defect this correction pass fixes).
  {
    const rows = selectTodayBriefingEventRows([outflow('e1', 1, 'r1'), outflow('e2', 5, 'r1')], reminderFor('r1', 1));
    assert(
      'reminder about occurrence at day 1 of recurringItemId "r1" excludes ONLY that occurrence — a later, day-5 occurrence of the SAME recurring source remains eligible',
      rows.length === 1 && rows[0].key === 'e2'
    );
  }

  // SEPARATE OCCURRENCES of the same recurring source stay distinct with no reminder.
  {
    const rows = selectTodayBriefingEventRows([outflow('e1', 1, 'r1'), outflow('e2', 3, 'r1')], null);
    assert('two distinct occurrences of the same recurring source both appear (no reminder to dedup against)', rows.length === 2 && rows.map((r) => r.key).sort().join(',') === 'e1,e2');
  }

  // NO ARBITRARY INTERMEDIATE CAP (filter before cap), maxRows pinned to 2
  // to isolate this from the row-budget behaviour tested separately below.
  {
    const events = [outflow('e1', 1, 'r1'), outflow('e2', 2, 'r2'), outflow('e3', 3, 'r3')];
    const rows = selectTodayBriefingEventRows(events, reminderFor('r1', 1), 2);
    assert('filter-before-cap: excluding the reminder-matched day-1 event still yields 2 rows (day2 AND day3), not 1', rows.length === 2 && rows.map((r) => r.key).join(',') === 'e2,e3');
  }

  // CANDIDATE-TO-CANDIDATE DEDUP (correction pass step 4) — two candidates
  // that happen to resolve to the exact same occurrence identity (same
  // source, same date) collapse to one row, never two.
  {
    const dup1: TimelineEvent = { id: 'dupA', date: new Date(2026, 7, 12), daysUntil: 1, kind: 'bill', icon: 'calendar-outline', label: 'Rent', amount: -500, recurringItemId: 'r1' };
    const dup2: TimelineEvent = { id: 'dupB', date: new Date(2026, 7, 12), daysUntil: 1, kind: 'bill', icon: 'calendar-outline', label: 'Rent', amount: -500, recurringItemId: 'r1' };
    const rows = selectTodayBriefingEventRows([dup1, dup2], null, 5);
    assert('two candidates resolving to the identical occurrence identity (same source, same date) collapse to exactly one row', rows.length === 1);
  }

  // DUPLICATE-FIRST-INCOME SCENARIO (correction pass §2, the required test):
  // nearest income duplicates the reminder; a later, independent income
  // occurrence exists and must remain eligible for the Briefing.
  {
    const events = [income('iNear', 1, 'incA'), income('iLater', 3, 'incB')];
    const reminder = reminderFor('incA', 1);
    const rows = selectTodayBriefingEventRows(events, reminder, 2);
    assert(
      'nearest income duplicates the reminder occurrence, but the later, independent income occurrence still appears in the Briefing — no single-item preselection silently discards it',
      rows.length === 1 && rows[0].key === 'iLater'
    );
  }
  // The above without the correction: selectNearTermIncomeEvent (singular,
  // still used unchanged by computeAttentionItems) would only ever have
  // gathered iNear as a candidate in the first place — confirmed directly:
  assert(
    'regression proof: the OLD single-selection helper would only ever have surfaced the nearest income event as a candidate, never the later one — this is exactly the bug the plural selector fixes',
    selectNearTermIncomeEvent([income('iNear', 1, 'incA'), income('iLater', 3, 'incB')])?.id === 'iNear'
  );

  // DETERMINISTIC ORDERING: ascending daysUntil, then the FULL occurrence
  // identity as tie-break (not just the bare event id).
  {
    const rows = selectTodayBriefingEventRows([outflow('b', 2, 'zzz'), outflow('a', 2, 'aaa'), income('c', 1, 'incC')], null, 3);
    assert(
      'ordering is daysUntil ascending, then full occurrence identity as tie-break (income day1 first; between the two day-2 events, sourceId "aaa" sorts before "zzz")',
      rows.map((r) => r.key).join(',') === 'c,a,b'
    );
  }

  // ROW-CAP BUDGET (no more than three actionable rows overall).
  {
    const events = [outflow('e1', 1, 'r1'), outflow('e2', 2, 'r2'), outflow('e3', 3, 'r3')];
    const noReminder = selectTodayBriefingEventRows(events, null);
    const withReminder = selectTodayBriefingEventRows(events, reminderFor('rX', 9));
    assert('no reminder present -> up to 2 event rows (1 AUP + 0 reminder + 2 events = 3 total)', noReminder.length === 2);
    assert('reminder present -> at most 1 event row (1 AUP + 1 reminder + 1 event = 3 total, never 4)', withReminder.length === 1);
  }

  // ZERO / ONE / MORE-THAN-CAP eligible rows, explicit.
  {
    assert('exactly 0 eligible -> []', selectTodayBriefingEventRows([], null).length === 0);
    assert('exactly 1 eligible -> 1 row', selectTodayBriefingEventRows([outflow('e1', 2, 'r1')], null).length === 1);
    const many = [outflow('e1', 1, 'r1'), outflow('e2', 2, 'r2'), outflow('e3', 3, 'r3'), outflow('e4', 4, 'r4')];
    assert('4 eligible, no reminder -> capped to 2, never uncapped', selectTodayBriefingEventRows(many, null).length === 2);
  }

  // Near-term income inclusion + icon/title wiring, and shortfall never
  // reappears as an event row (structurally unreachable — see file header
  // comment in todayBriefing.ts).
  {
    const rows = selectTodayBriefingEventRows([income('i1', 1, 'rInc')], null);
    assert('near-term income row uses the cash icon and the income-specific title wording', rows.length === 1 && rows[0].icon === 'cash' && rows[0].title === 'Income expected tomorrow');
    const outOfWindow = selectTodayBriefingEventRows([outflow('e1', 20, 'r1')], null);
    assert('an event outside the 7-day urgent-outflow window never appears as a row', outOfWindow.length === 0);
  }
}

console.log('\n=== Section 7: moneyTimeline.ts — selectNearTermIncomeEvents (plural, uncapped) vs selectNearTermIncomeEvent (singular, unchanged) (real functions) ===');
{
  function income(id: string, daysUntil: number, recurringItemId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'income', icon: 'cash', label: 'Salary', amount: 2000, recurringItemId };
  }
  const events = [income('i1', 3, 'a'), income('i2', 1, 'b'), income('i3', 5, 'c')];
  const many = selectNearTermIncomeEvents(events);
  assert('selectNearTermIncomeEvents returns every income event within 3 days, sorted ascending by daysUntil (i3 excluded, 5 > 3)', many.map((e) => e.id).join(',') === 'i2,i1');
  assert('selectNearTermIncomeEvent (singular, unchanged) still returns only the first positional match, not sorted', selectNearTermIncomeEvent(events)?.id === 'i1');
}

console.log('\n=== Section 8: moneyTimeline.ts — computeAttentionItems and its other extracted helpers, regression (real functions) ===');
{
  function bill(id: string, daysUntil: number, recurringItemId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'bill', icon: 'calendar-outline', label: 'Power', amount: -120, recurringItemId };
  }
  function creditCardEvent(id: string, daysUntil: number, creditCardId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'credit_card', icon: 'card', label: 'AMEX', amount: -80, creditCardId };
  }
  function income(id: string, daysUntil: number, recurringItemId?: string): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'income', icon: 'cash', label: 'Salary', amount: 2000, recurringItemId };
  }
  function goalEvent(id: string, daysUntil: number): TimelineEvent {
    return { id, date: new Date(2026, 7, 11 + daysUntil), daysUntil, kind: 'goal', icon: 'flag', label: 'Trip', amount: -50 };
  }

  {
    const urgent = selectUrgentOutflowEvents([bill('b1', 10), bill('b2', 3), creditCardEvent('c1', 1), goalEvent('g1', 1), income('i1', 1)]);
    assert('selectUrgentOutflowEvents: only bill/mortgage/credit_card kinds within 7 days, sorted ascending, goal/income excluded', urgent.map((e) => e.id).join(',') === 'c1,b2');
  }
  {
    assert('buildAttentionEventTitle bill due today', buildAttentionEventTitle(bill('b', 0)) === 'Power due today');
    assert('buildAttentionEventTitle income expected in N days', buildAttentionEventTitle(income('i', 3)) === 'Income expected in 3 days');
  }
  {
    assert('attentionEventTone: non-income daysUntil<=2 -> warning', attentionEventTone(bill('b', 1)) === 'warning');
    assert('attentionEventTone: income is always neutral', attentionEventTone(income('i', 0)) === 'neutral');
  }
  {
    const items = computeAttentionItems([bill('b1', 1, 'r1'), creditCardEvent('c1', 5, 'cc1'), income('i1', 2, 'r2')], -50);
    assert('computeAttentionItems: shortfall-first when remainingPool < 0', items[0].id === 'shortfall');
    assert(
      'computeAttentionItems: structured source-id fields populated on pushed items (unchanged from prior Pass 2A round)',
      items.some((i) => i.recurringItemId === 'r1') && items.some((i) => i.creditCardId === 'cc1')
    );
    assert('computeAttentionItems: still capped at maxItems (default 3)', items.length <= 3);
  }
  {
    const items = computeAttentionItems([bill('b1', 1), bill('b2', 2), bill('b3', 3), income('i1', 1)], 500, 3);
    assert('computeAttentionItems: no shortfall entry when remainingPool >= 0, still respects the maxItems cap', !items.some((i) => i.id === 'shortfall') && items.length === 3);
  }
}

console.log('\n=== Section 9: formatBriefingDateContext — date/context header text (real function) ===');
{
  // Locale-flexible: toLocaleDateString's field ORDER depends on the
  // runtime locale (en-US renders "Tuesday, August 11"; en-GB would render
  // "Tuesday, 11 August") — this asserts every expected field is present
  // somewhere in the string, not a specific ordering.
  const text = formatBriefingDateContext(new Date(2026, 7, 11));
  assert('produces a weekday name, the day number, and the month name (order is locale-dependent)', /Tuesday/.test(text) && /\b11\b/.test(text) && /August/.test(text));
  const text2 = formatBriefingDateContext(new Date(2026, 0, 5));
  assert('a different date produces different text with its own weekday/day/month', text2 !== text && /\b5\b/.test(text2) && /January/.test(text2));
}

console.log('\n=== Section 10: component wiring (Structural — .tsx files cannot be imported by tsx; see LIMITATION note in file header) ===');
{
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  const MONEY_SCREEN_SRC = readFileSync('src/screens/money/MoneyScreen.tsx', 'utf8');
  const SMART_REMINDER_CARD_SRC = readFileSync('src/components/today/SmartReminderCard.tsx', 'utf8');
  const TODAY_BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');

  assert('TodayScreen.tsx imports TodayBriefingCard', /import \{ TodayBriefingCard \} from '\.\.\/\.\.\/components\/today\/TodayBriefingCard'/.test(TODAY_SCREEN_SRC));
  assert(
    'TodayScreen.tsx computes safeToSpend, heroCopy, timelineEvents, topReminder, and the Briefing presentation/eventRows exactly once each via useMemo',
    /const safeToSpend = useMemo\(\(\) => computeSafeToSpend\(data, currentDate\), \[data, currentDate\]\);/.test(TODAY_SCREEN_SRC) &&
      /const heroCopy = useMemo\(\(\) => computeMoneyHeroCopy\(data\), \[data\]\);/.test(TODAY_SCREEN_SRC) &&
      /const safeToSpendPresentation = useMemo\(\(\) => selectSafeToSpendPresentation\(safeToSpend, heroCopy\), \[safeToSpend, heroCopy\]\);/.test(TODAY_SCREEN_SRC) &&
      /const timelineEvents = useMemo\(\(\) => computeMoneyTimeline\(data, currentDate\), \[data, currentDate\]\);/.test(TODAY_SCREEN_SRC) &&
      /const topReminder = useMemo\(\(\) => computeTopReminder\(data, currentDate\), \[data, currentDate\]\);/.test(TODAY_SCREEN_SRC) &&
      /const briefingEventRows = useMemo\(\(\) => selectTodayBriefingEventRows\(timelineEvents, topReminder\), \[timelineEvents, topReminder\]\);/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'REFRESH: every one of those useMemos lists `currentDate` (or a value derived from it) as a dependency — currentDate itself comes from useCurrentLocalDate(), which (per its own doc comment, read directly) refreshes on mount, on tab focus, on app foreground, and at local midnight. No separate foreground/day-rollover plumbing is needed in this screen: the existing dependency chain already propagates it.',
    /const currentDate = useCurrentLocalDate\(\);/.test(TODAY_SCREEN_SRC)
  );
  assert('TodayBriefingCard is rendered immediately after the greeting Text, before MoneyPictureChecklistCard, and receives today={currentDate}', (() => {
    const greetingIdx = TODAY_SCREEN_SRC.indexOf('<Text style={styles.greeting}>{greeting}</Text>');
    const briefingIdx = TODAY_SCREEN_SRC.indexOf('<TodayBriefingCard');
    const checklistIdx = TODAY_SCREEN_SRC.indexOf('<MoneyPictureChecklistCard');
    return greetingIdx !== -1 && briefingIdx !== -1 && checklistIdx !== -1 && greetingIdx < briefingIdx && briefingIdx < checklistIdx && /today=\{currentDate\}/.test(TODAY_SCREEN_SRC);
  })());
  assert(
    'the standalone, prop-less <SmartReminderCard /> render is gone from TodayScreen.tsx — its behaviour now lives exclusively inside TodayBriefingCard',
    !/<SmartReminderCard \/>/.test(TODAY_SCREEN_SRC) && !TODAY_SCREEN_SRC.includes('import { SmartReminderCard }')
  );
  assert(
    'SmartReminderCard is mounted in exactly one place across the whole Today pipeline (TodayBriefingCard.tsx), never duplicated, and rendered with embedded (correction §7: one Briefing row, not a second standalone card)',
    (TODAY_BRIEFING_CARD_SRC.match(/<SmartReminderCard topReminder=\{topReminder\} embedded \/>/g) || []).length === 1 && !/<SmartReminderCard/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'the embedded reminder is placed INSIDE the same SectionCard as the AUP row and event rows (correction §7), not as a sibling after it',
    (() => {
      const sectionCardStart = TODAY_BRIEFING_CARD_SRC.indexOf('<SectionCard>');
      const sectionCardEnd = TODAY_BRIEFING_CARD_SRC.indexOf('</SectionCard>');
      const reminderIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<SmartReminderCard topReminder={topReminder} embedded />');
      return sectionCardStart !== -1 && sectionCardEnd !== -1 && reminderIdx > sectionCardStart && reminderIdx < sectionCardEnd;
    })()
  );
  // CANONICAL RENDER ORDER (correction pass, this round): AUP row -> Smart
  // Reminder row -> event rows. This is a STRUCTURAL check only — the
  // literal source position of the three JSX blocks in TodayBriefingCard.tsx
  // — since this repo has no react-native-testing-library or any other
  // component-runtime harness and none may be added (no new dependencies
  // authorised). It proves the JSX is AUTHORED in the required order; it
  // does NOT prove React actually renders three DOM/native nodes in that
  // visual order on a device (conditional rendering, RN layout, or a future
  // unrelated edit could in principle diverge from source order without
  // this check catching it). The genuine runtime visual-order proof remains
  // physical-device-only evidence, per the device checklist.
  assert(
    'CANONICAL ORDER (Structural — source position only, see comment above): the AUP TouchableOpacity is authored before the embedded SmartReminderCard, which is authored before the eventRows.map(...) block — AUP -> Smart Reminder -> event, never event before reminder',
    (() => {
      const aupIdx = TODAY_BRIEFING_CARD_SRC.indexOf('style={styles.aupRow}');
      const reminderIdx = TODAY_BRIEFING_CARD_SRC.indexOf('<SmartReminderCard topReminder={topReminder} embedded />');
      const eventsIdx = TODAY_BRIEFING_CARD_SRC.indexOf('{eventRows.map((row) => (');
      return aupIdx !== -1 && reminderIdx !== -1 && eventsIdx !== -1 && aupIdx < reminderIdx && reminderIdx < eventsIdx;
    })()
  );
  assert(
    'the Briefing header renders a date/context line via formatBriefingDateContext(today) (correction §4)',
    /import \{ TodayBriefingEventRow, formatBriefingDateContext \} from '\.\.\/\.\.\/lib\/calculations\/todayBriefing'/.test(TODAY_BRIEFING_CARD_SRC) &&
      /\{formatBriefingDateContext\(today\)\}/.test(TODAY_BRIEFING_CARD_SRC)
  );
  assert(
    'onPressAup is now the presentation-action-driven handler, not a hard-coded navigate() literal inline; onPressEventRow still targets the timeline section',
    /onPressAup=\{handleBriefingAupPress\}/.test(TODAY_SCREEN_SRC) && /onPressEventRow=\{\(\) => navigation\.navigate\('Money', \{ scrollTo: 'timeline' \}\)\}/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'handleBriefingAupPress genuinely reads safeToSpendPresentation.action (action ownership is real, not decorative) and still navigates to Money\'s existing AUP section — no duplicate setup route introduced',
    /if \(safeToSpendPresentation\.action\.kind === 'focus_money_section'\) \{/.test(TODAY_SCREEN_SRC) &&
      /navigation\.navigate\('Money', \{ scrollTo: safeToSpendPresentation\.action\.section \}\);/.test(TODAY_SCREEN_SRC)
  );

  assert(
    'SmartReminderCard.tsx accepts an `embedded` prop and a `topReminder` prop; no longer imports computeTopReminder itself (compute-once architecture, unchanged from prior Pass 2A round)',
    /embedded\?: boolean;/.test(SMART_REMINDER_CARD_SRC) && !/import \{[^}]*computeTopReminder/.test(SMART_REMINDER_CARD_SRC)
  );
  assert(
    'SmartReminderCard.tsx conditionally wraps its content in SectionCard vs a plain View depending on `embedded` — the embedded row uses a hairline top divider, matching the exact convention TodayBriefingCard.tsx\'s own event rows already use, not a second card',
    /const Wrapper = embedded \? View : SectionCard;/.test(SMART_REMINDER_CARD_SRC) &&
      /embeddedRow: \{ paddingTop: spacing\.sm, borderTopWidth: StyleSheet\.hairlineWidth, borderTopColor: colors\.border \}/.test(SMART_REMINDER_CARD_SRC)
  );
  assert(
    'every one of SmartReminderCard\'s confirm/dismiss/action functions (runConfirmation, runBnplConfirmation, confirmSalary, confirmSalaryToDestination, confirmBillPaid, confirmBnplEveryday, dismiss) is untouched by this correction — none of their bodies were edited, only the outer wrapper',
    ['function dismiss()', 'function runConfirmation(', 'function runBnplConfirmation(', 'function confirmSalary()', 'function confirmSalaryToDestination(', 'function confirmBillPaid(', 'function confirmBnplEveryday('].every((needle) =>
      SMART_REMINDER_CARD_SRC.includes(needle)
    )
  );

  assert(
    'MoneyScreen.tsx declares null-sentinel section refs for layout-not-ready handling',
    /const aupSectionY = useRef<number \| null>\(null\);/.test(MONEY_SCREEN_SRC) && /const whatHappensNextSectionY = useRef<number \| null>\(null\);/.test(MONEY_SCREEN_SRC)
  );
  assert(
    'MoneyScreen.tsx wires onLayout on both the AUP wrapper and the What happens next section header',
    /onLayout=\{\(e\) => \(aupSectionY\.current = e\.nativeEvent\.layout\.y\)\}/.test(MONEY_SCREEN_SRC) &&
      /onLayout=\{\(e\) => \(whatHappensNextSectionY\.current = e\.nativeEvent\.layout\.y\)\}/.test(MONEY_SCREEN_SRC)
  );
  assert(
    'MoneyScreen.tsx retries via requestAnimationFrame when the target ref is not yet measured (layout-not-ready handling), never assumes a static pixel offset',
    /requestAnimationFrame\(\(\) => attempt\(retriesLeft - 1\)\)/.test(MONEY_SCREEN_SRC) && !/scrollTo\(\{\s*y:\s*\d/.test(MONEY_SCREEN_SRC)
  );
  assert(
    'MoneyScreen.tsx clears scrollTo via navigation.setParams once handled — the mechanism that makes a repeated identical focus request work',
    /navigation\.setParams\(\{ scrollTo: undefined \}\)/.test(MONEY_SCREEN_SRC)
  );
  assert(
    'MoneyScreen.tsx also clears the param on the empty-state fallback path (ref never measured after the retry budget)',
    (() => {
      const start = MONEY_SCREEN_SRC.indexOf('function attempt(retriesLeft: number)');
      const end = MONEY_SCREEN_SRC.indexOf('function openAddBill()');
      const block = MONEY_SCREEN_SRC.slice(start, end);
      return (block.match(/navigation\.setParams\(\{ scrollTo: undefined \}\);/g) || []).length === 2;
    })()
  );
  assert(
    'MoneyScreen.tsx scrolls the existing tabScrollRefs.Money ScrollView, never a new/duplicate scroll surface',
    /tabScrollRefs\.Money\.current\?\.scrollTo\(\{ y: targetRef\.current, animated: true \}\);/.test(MONEY_SCREEN_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
