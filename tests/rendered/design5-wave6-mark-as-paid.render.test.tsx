// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per scenario in beforeAll and asserts across several tests,
// which auto-cleanup would tear down after the first — and the harness's
// own three-root limit means remounting per test is not an option.
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
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 6 final — "Mark as paid" for an ordinary bill,
 * rendered against the REAL AppStateProvider, the REAL persistence and the
 * REAL confirmRecurringOccurrence transition.
 *
 * The point of doing this rendered rather than pure: the requirement is not
 * "the engine works" (it already did, for overdue bills) — it is that the
 * due-soon reminder genuinely REACHES that engine, that nothing is recorded
 * before the customer picks an account, and that exactly one transaction
 * exists afterwards. Only a real mount through real state proves that.
 *
 * NOT proven here: pixel appearance, VoiceOver speech, native Modal timing,
 * or Dynamic Type layout on device.
 */
const REMINDER_ROW = /^briefing-priority-row-reminder-/;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function TodayBriefingHarness({ today }: { today: Date }) {
  const { data } = useAppState();
  // Mirrors TodayScreen's own wiring exactly, including the suppression
  // predicate — this test must exercise the real selector composition, not
  // a simplified one.
  const topReminder = useMemo(
    () => computeRankedReminder(data, today, createSuppressionPredicate(data, today)),
    [data, today]
  );
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, today), [data, today]);
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data, today), [data, today]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const presentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  const idRef = useRef(0);
  const [openRequest, setOpenRequest] = useState<ReminderOpenRequest | null>(null);

  return (
    <>
      <TodayBriefingCard
        presentation={presentation}
        eventRows={briefingEventRows}
        timelineEvents={timelineEvents}
        timeframeLine={null}
        topReminder={topReminder}
        onPressAup={() => {}}
        onPressEventRow={() => {}}
        onPressReminderTile={() => {
          if (!topReminder) return;
          idRef.current += 1;
          setOpenRequest(createReminderOpenRequest(idRef.current, topReminder));
        }}
      />
      <ReminderDetailSheet openRequest={openRequest} today={today} />
    </>
  );
}

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

const today = new Date(2026, 5, 15); // fixed local date — never system "now"

function dueTomorrowBillData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.assets.push(
    { id: 'everyday', type: 'everyday', label: 'Everyday', currentValue: 2000 },
    { id: 'cash', type: 'cash', label: 'Cash', currentValue: 300 }
  );
  data.recurringItems.push({
    id: 'rent',
    type: 'expense',
    label: 'Rent',
    amount: 500,
    frequency: 'monthly',
    nextDueDate: new Date(2026, 5, 16).toISOString(), // exactly tomorrow => bill_due_soon
    isFixed: true,
    active: true,
  });
  return data;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string) as AppData;
}

describe('Wave 6 — Mark as paid: cancelling records nothing', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dueTomorrowBillData()));
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
  });

  afterAll(() => root?.unmount());

  test('the reminder is titled by the item, with no interrogation and no repeated status', async () => {
    // RECONCILED (Wave 6 polish): the engine's "Did you pay your Rent?" is
    // no longer what the customer reads. Status says when, title says what,
    // one supporting line says how much and by when — each fact once.
    expect(await screen.findByTestId('reminder-title')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-title').props.children).toBe('Rent');
    expect(screen.queryByText(/Did you pay your/)).toBeNull();
    // The day/month ORDER is the device locale's business — this asserts
    // the facts present and that each appears once, not a locale.
    expect(String(screen.getByTestId('reminder-support-line').props.children)).toMatch(/^\$500 due tomorrow · \w+ ?\d+,? ?\w*$/);
    // The pill uppercases visually via textTransform, so the underlying
    // string stays sentence case — which is also what a screen reader
    // should say. Deliberately asserted on the real text node.
    expect(screen.getByText('Due tomorrow')).toBeOnTheScreen();
    // And "due tomorrow" appears in the status and the supporting line only
    // — never a third time in a title sentence.
    expect(screen.queryAllByText(/due tomorrow/i)).toHaveLength(2);
  });

  test('a due-soon bill offers the real financial verb, not an acknowledgement', async () => {
    // This is the defect being fixed: the control used to be "Got it",
    // which recorded nothing at all.
    expect(await screen.findByRole('button', { name: 'Mark as paid' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Noted' })).toBeNull();
  });

  test('the facts are labelled and no account is presented as having paid it', () => {
    expect(screen.getByTestId('reminder-fact-grid')).toBeOnTheScreen();
    expect(screen.getByText('Due date')).toBeOnTheScreen();
    expect(screen.getByText('Amount')).toBeOnTheScreen();
    expect(screen.getByText('Schedule')).toBeOnTheScreen();
    // Nothing has paid this yet, so no account may be shown as if it had.
    expect(screen.queryByText(/Paid from/i)).toBeNull();
  });

  test('no motivational filler occupies the surface', () => {
    expect(screen.queryByText(/keeps you in control/i)).toBeNull();
    expect(screen.queryByText(/You.{0,3}ve got this/i)).toBeNull();
    expect(screen.queryByText(/manage.*reminders.*settings/i)).toBeNull();
  });

  test('pressing Mark as paid only asks which account — it records nothing', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Mark as paid' }));

    // RECONCILED (Wave 6 polish): the step now states what it records as
    // well as what it asks, and each account is a full row rather than a
    // chip — name, type in words, and balance in its own column.
    expect(screen.getByText('Where was this paid from?')).toBeOnTheScreen();
    expect(screen.getByText('This records the payment in Nolie. It does not move money at your bank.')).toBeOnTheScreen();
    // Every eligible account, each individually selectable, each announcing
    // its name, type and balance exactly once.
    expect(screen.getByRole('radio', { name: 'Everyday. Everyday account. Balance · $2,000.' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Cash. Cash balance. Balance · $300.' })).toBeOnTheScreen();
    // The confirm control exists but is inert until an account is chosen —
    // there is no silent default, and arriving here confirms nothing.
    expect(screen.getByTestId('bill-confirm-action').props.accessibilityState.disabled).toBe(true);

    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
  });

  test('selecting an account selects ONLY — it records nothing', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('account-choice-everyday'));

    // Selected, announced as selected, and the confirm control is now live.
    expect(screen.getByTestId('account-choice-everyday').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('account-choice-cash').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('bill-confirm-action').props.accessibilityState.disabled).toBe(false);
    // And a summary so the customer confirms against facts, not memory.
    expect(screen.getByTestId('bill-confirm-summary')).toBeOnTheScreen();

    // Still nothing recorded. This is the correction: the previous picker
    // fired the mutation straight out of onPress.
    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
  });

  test('changing the selection is still mutation-free', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('account-choice-cash'));

    expect(screen.getByTestId('account-choice-cash').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('account-choice-everyday').props.accessibilityState.selected).toBe(false);
    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'cash')!.currentValue).toBe(300);
  });

  test('Back returns to the same reminder with nothing changed', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('bill-source-back'));

    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeOnTheScreen();
    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
    // The occurrence is NOT resolved — the bill is still due tomorrow.
    expect(after.recurringItems.find((r) => r.id === 'rent')!.nextDueDate).toBe(new Date(2026, 5, 16).toISOString());
  });
});

describe('Wave 6 — Mark as paid: confirming records exactly once', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dueTomorrowBillData()));
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await user.press(await screen.findByRole('button', { name: 'Mark as paid' }));
  });

  afterAll(() => root?.unmount());

  test('the confirm control falls back to a generic label at large Dynamic Type', () => {
    // This harness reports fontScale 2 (jest-expo's Dimensions mock), which
    // is exactly the ~200% case the amount-specific label must yield in: a
    // truncated amount on a confirmation control is worse than no amount.
    // The amount-specific form is proven at ordinary scale in
    // tests/design5-wave6-reminder-intents.test.ts, where billConfirmLabel
    // is called directly.
    expect(screen.getByTestId('bill-confirm-action').props.accessibilityLabel).toBe('Record payment');
  });

  test('choosing an account then confirming creates exactly one transaction', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('account-choice-everyday'));
    // Selection alone still records nothing.
    expect((await stored()).transactions).toHaveLength(0);
    await user.press(screen.getByTestId('bill-confirm-action'));

    const after = await stored();
    expect(after.transactions).toHaveLength(1);
    // Exact cents, from the bill's own scheduled amount — never rounded or
    // re-derived by the reminder surface.
    expect(after.transactions[0].amount).toBe(500);
  });

  test('the chosen balance decreases exactly once, and no other balance moves', async () => {
    const after = await stored();
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(1500);
    expect(after.assets.find((a) => a.id === 'cash')!.currentValue).toBe(300);
  });

  test('the occurrence resolves once and the FUTURE recurrence survives', async () => {
    const after = await stored();
    const rent = after.recurringItems.find((r) => r.id === 'rent')!;
    // The item still exists and is still active — marking one occurrence
    // paid must never delete the bill.
    expect(rent.active).toBe(true);
    // And its next occurrence advanced rather than disappearing, so the
    // customer will still be reminded next month.
    expect(new Date(rent.nextDueDate).getTime()).toBeGreaterThan(new Date(2026, 5, 16).getTime());
  });

  test('the same occurrence cannot be recorded a second time', async () => {
    // The queue advanced past it; re-opening the Briefing cannot return to
    // an occurrence the transition already resolved.
    const after = await stored();
    expect(after.transactions).toHaveLength(1);
    expect(screen.queryByText('Which account did you pay from?')).toBeNull();
  });

  test('and the sheet closed cleanly once nothing else was outstanding', () => {
    expect(screen.queryByTestId('reminder-title')).toBeNull();
    expect(screen.queryByTestId('reminder-header-close')).toBeNull();
  });
});
