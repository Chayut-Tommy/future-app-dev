// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per scenario in beforeAll and asserts against it across several
// tests, which auto-cleanup would tear down after the first one — and the
// harness's own three-root limit means remounting per test is not an
// option. Each describe unmounts its own root explicitly in afterAll.
import '@testing-library/react-native/dont-cleanup-after-each';
import React, { useMemo, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TodayBriefingCard } from '../../src/components/today/TodayBriefingCard';
import { ReminderDetailSheet } from '../../src/components/today/ReminderDetailSheet';
import { computeRankedReminder } from '../../src/lib/calculations/reminders';
import { createSuppressionPredicate } from '../../src/lib/calculations/reminderSuppression';
import { ReminderOpenRequest, createReminderOpenRequest } from '../../src/lib/calculations/reminderInteractionLifecycle';
import { selectTodayBriefingEventRows } from '../../src/lib/calculations/todayBriefing';
import { computeMoneyTimeline } from '../../src/lib/calculations/moneyTimeline';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation } from '../../src/lib/calculations/safeToSpendPresentation';
import { computeLuluScore } from '../../src/lib/calculations/luluScore';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 6 closure — the redesigned reminder sheet, rendered.
 *
 * The label/handler matrix, the queue derivation and the card fact
 * composition are exercised exhaustively in
 * tests/design5-wave6-reminder-actions.test.ts, where every case runs
 * without a mount. This file spends its two available roots on the things
 * that are only true if the sheet actually RENDERS: that the header shows
 * the queue position and exactly one Close, that the acknowledgement label
 * changes with the queue and still advances it without recording anything,
 * and that a card reminder shows labelled facts rather than prose with a
 * correctly weighted pair of actions.
 *
 * NOT proven here: pixel appearance, VoiceOver's real spoken order, native
 * Modal presentation timing, or Dynamic Type layout on device. Those are
 * physical-device evidence.
 */
const REMINDER_ROW = /^briefing-priority-row-reminder-/;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function TodayBriefingHarness({ today }: { today: Date }) {
  const { data } = useAppState();
// Wave 6 polish — mirrors TodayScreen's OWN wiring, suppression included.
  const topReminder = useMemo(
    () => computeRankedReminder(data, today, createSuppressionPredicate(data, today)),
    [data, today]
  );
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, today), [data, today]);
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data, today), [data, today]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const safeToSpendPresentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  useMemo(() => computeLuluScore(data), [data]);
  const reminderOpenRequestIdRef = useRef(0);
  const [reminderOpenRequest, setReminderOpenRequest] = useState<ReminderOpenRequest | null>(null);

  return (
    <>
      <TodayBriefingCard
        presentation={safeToSpendPresentation}
        eventRows={briefingEventRows}
        timelineEvents={timelineEvents}
        timeframeLine={null}
        topReminder={topReminder}
        onPressAup={() => {}}
        onPressEventRow={() => {}}
        onPressReminderTile={() => {
          if (!topReminder) return;
          reminderOpenRequestIdRef.current += 1;
          setReminderOpenRequest(createReminderOpenRequest(reminderOpenRequestIdRef.current, topReminder));
        }}
      />
      <ReminderDetailSheet openRequest={reminderOpenRequest} today={today} />
    </>
  );
}

/** Provider order matches App.tsx exactly. */
function Harness({ today }: { today: Date }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <NavigationContainer>
        <AppStateProvider>
          <ThemeProvider>
            <TodayBriefingHarness today={today} />
          </ThemeProvider>
        </AppStateProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function isoInDays(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Seeds AsyncStorage exactly the way the real saveAppData() would leave it
 * — this test never invents its own storage format. */
async function seed(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const today = new Date(2026, 5, 15); // fixed local date — never system "now"

describe('Wave 6 — a queue of several due bills', () => {
  let root: ReturnType<typeof render> extends Promise<infer R> ? R : never;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const data = createEmptyAppData();
    data.user.name = 'Jamie';
    // Three bills due TOMORROW. The engine's bill_due_soon tier is
    // "exactly one day out" (reminders.ts), so a 2- or 3-day-out item
    // produces no reminder at all — this fixture matches the engine's own
    // tier rather than assuming a looser window.
    for (const [id, label, amount, inDays] of [
      ['rent', 'Rent', 500, 1],
      ['internet', 'Internet', 60, 1],
      ['power', 'Power', 90, 1],
    ] as const) {
      data.recurringItems.push({
        id,
        type: 'expense',
        label,
        amount,
        frequency: 'monthly',
        nextDueDate: isoInDays(today, inDays),
        isFixed: true,
        active: true,
      });
    }
    await seed(data);
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
  });

  afterAll(() => {
    root?.unmount();
  });

  test('the header states where the customer is in the queue', async () => {
    // The generic "Reminder" heading told the customer nothing about
    // whether tapping through led anywhere. It now counts.
    expect(await screen.findByText(/^Reminder \d+ of \d+$/)).toBeOnTheScreen();
  });

  test('exactly one Close control exists, and it is in the header', () => {
    const closes = screen.queryAllByTestId('reminder-header-close');
    expect(closes).toHaveLength(1);
    // The detached "Close" text that floated below the content is gone.
    expect(screen.queryByText('Close')).toBeNull();
  });

  // RECONCILED (Design 5.1 Wave 6 final). These clauses covered the bare
  // acknowledgement control ("Next reminder" / "Done"). That control was
  // retired by the approved three-intent model: a bill now offers Mark as
  // paid, Snooze and Dismiss, and the first two say strictly more than an
  // acknowledgement could. The properties the clauses protected — that no
  // control uses a vague dismissal word, and that a non-mutating control
  // states plainly that nothing is paid — are preserved verbatim below,
  // now asserted against the controls that actually exist.
  test('no vague acknowledgement word survives anywhere on the surface', () => {
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Noted' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next reminder' })).toBeNull();
    // Replaced by the three real intentions.
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeOnTheScreen();
  });

  test('and the non-mutating controls still say plainly that nothing is being paid', () => {
    expect(screen.getByTestId('reminder-snooze-action').props.accessibilityHint).toMatch(/Nothing is paid or changed\./);
    expect(screen.getByTestId('reminder-dismiss-action').props.accessibilityHint).toMatch(/does not mark anything paid/);
  });

  test('the reminder carries a timing status a customer can scan', () => {
    // One of the four tones, never a paragraph the customer must read to
    // learn whether something is overdue.
    expect(screen.getByText(/^(Overdue|Due today|Due tomorrow|Due in \d+ days|Upcoming|Expected)$/)).toBeOnTheScreen();
  });

  // RECONCILED (Design 5.1 Wave 6 final): the queue now advances via
  // Snooze rather than a bare acknowledgement. Every property this clause
  // protected is unchanged and still asserted: same sheet, one Close,
  // content genuinely moved on, position recomputed, nothing recorded.
  test('snoozing advances the queue in the same sheet and records nothing', async () => {
    const user = userEvent.setup();
    const before = screen.getByTestId('reminder-title').props.children;
    const position = screen.getByText(/^Reminder \d+ of \d+$/).props.children;

    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));

    expect(screen.queryAllByTestId('reminder-header-close')).toHaveLength(1);
    expect(screen.getByTestId('reminder-title').props.children).not.toBe(before);
    expect(screen.getByText(/^Reminder \d+ of \d+$/).props.children).not.toBe(position);

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string) as AppData;
    expect(stored.transactions).toHaveLength(0);
  });

  test('the final reminder still offers all three intentions, never a dead end', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeOnTheScreen();
    // The header still counts the session's whole queue — position 3 of 3,
    // not "Reminder". A customer three items into a review should see how
    // far they have come, not have the count vanish underneath them.
    expect(screen.getByText('Reminder 3 of 3')).toBeOnTheScreen();
  });

  test('the announcement leads with the queue position, delivered once through the title', () => {
    const title = screen.getByTestId('reminder-title');
    expect(title.props.accessibilityRole).toBe('header');
    expect(String(title.props.accessibilityLabel)).toMatch(/^Reminder \d+ of \d+\./);
  });
});

describe('Wave 6 — a credit card reminder', () => {
  let root: ReturnType<typeof render> extends Promise<infer R> ? R : never;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const data = createEmptyAppData();
    data.user.name = 'Jamie';
    data.creditCards.push({
      id: 'nab',
      issuer: 'NAB',
      label: 'NAB Low Rate',
      creditLimit: 5000,
      currentBalance: 525,
      dueDay: today.getDate() + 2,
      minimumPayment: 25,
      expectedMonthlyRepayment: 50,
    } as AppData['creditCards'][number]);
    await seed(data);
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
  });

  afterAll(() => {
    root?.unmount();
  });

  test('a single reminder does not pretend to be a queue', async () => {
    expect(await screen.findByText('Reminder')).toBeOnTheScreen();
    expect(screen.queryByText(/^Reminder \d+ of \d+$/)).toBeNull();
  });

  test('the figures are labelled facts, not buried in prose', () => {
    expect(screen.getByText('Expected monthly repayment')).toBeOnTheScreen();
    expect(screen.getByText('Current recorded balance')).toBeOnTheScreen();
    expect(screen.getByText('$525')).toBeOnTheScreen();
    expect(screen.getByText('$50')).toBeOnTheScreen();
  });

  test('the expected repayment is never presented as an amount contractually due', () => {
    expect(screen.queryByText(/amount due/i)).toBeNull();
  });

  // RECONCILED — Wave 9a closure, Correction C.
  // OLD CLAUSES: matched the label 'Estimated interest if unpaid', the value
  // 'approximately $N over 30 days', and the caution 'Interest is charged on
  // whatever is left unpaid. Paying more than the expected amount reduces it.'
  // SUPERSEDED BECAUSE the label read as an amount the ISSUER would bill, and
  // the caution both asserted how the issuer charges and coached the customer
  // on what to do about it.
  // PRESERVED INTENT — and strengthened: the figure must still be visibly an
  // estimate, must still name the rate AND now its SOURCE, and the caution
  // must still describe the mechanism without blaming anyone.
  test('the interest figure is labelled an illustration and says where the rate came from', () => {
    expect(screen.getByText('Illustrative interest over 30 days if the recorded balance stayed unpaid')).toBeOnTheScreen();
    expect(screen.getByText(/^~\$\d/)).toBeOnTheScreen();
    expect(screen.getByText(/19\.5%/)).toBeOnTheScreen();
    // The rate's PROVENANCE is stated, not just the number.
    expect(screen.getByText(/Uses an assumed annual rate of 19\.5% because no rate is recorded\./)).toBeOnTheScreen();
  });

  test('the issuer qualification is VISIBLE, not hidden behind an info control', () => {
    expect(screen.getByText(/Your card issuer may calculate interest differently/)).toBeOnTheScreen();
    expect(screen.getByText(/Interest-free periods, fees, cash-advance rates, compounding/)).toBeOnTheScreen();
    // No behavioural coaching survives.
    expect(screen.queryByText(/Paying more than the expected amount/)).toBeNull();
  });

  // RECONCILED (Design 5.1 Wave 6 final). The clause protected one thing:
  // that recording a payment outranks navigating to the card. That is
  // unchanged — but the three-intent model gave the sheet Snooze and
  // Dismiss as well, and four equally-prominent full-width buttons was
  // exactly the composition the owner rejected. "View card" is therefore
  // demoted further, to a compact inline link beside the card's own
  // details, rather than remaining an outlined button competing with the
  // three intents. Same route, same close-before-navigate ordering.
  test('recording a payment is the primary action and viewing the card is demoted below it', () => {
    const record = screen.getByTestId('reminder-record-payment');
    const view = screen.getByTestId('reminder-view-card');
    const flat = (s: unknown): Record<string, unknown> =>
      Object.assign({}, ...(Array.isArray(s) ? s : [s]).filter(Boolean) as Record<string, unknown>[]);
    // The primary is a filled control with a real 48pt target.
    expect(flat(record.props.style).backgroundColor).toBeTruthy();
    expect(flat(record.props.style).minHeight).toBeGreaterThanOrEqual(48);
    // Navigation carries no filled background at all, so it cannot read as
    // a competing decision — but it keeps a 44pt target.
    expect(flat(view.props.style).backgroundColor).toBeFalsy();
    expect(flat(view.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  test('and the old inverted pair is gone', () => {
    expect(screen.queryByRole('button', { name: 'Review card' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View card' })).toBeOnTheScreen();
  });
});
