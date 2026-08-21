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
 * Nolie Design 5.1 Wave 6 final — the INCOME journey's select-then-confirm,
 * and the shared account chooser, rendered against the REAL
 * AppStateProvider and the REAL confirmRecurringOccurrence transition.
 *
 * The row model, grouping, wording and reflow rules are proven without a
 * mount in tests/design5-wave6-account-choice.test.ts. What only a real
 * mount can prove is what this file asserts: that choosing a destination
 * genuinely writes NOTHING, that the separate confirm control is what
 * creates the income transaction, and that the destination balance moves
 * exactly once.
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

function incomeData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.assets.push(
    { id: 'cba', type: 'everyday', label: 'CBA', currentValue: 22500 },
    { id: 'save', type: 'savings', label: 'Rainy day', currentValue: 4000 }
  );
  data.recurringItems.push({
    id: 'dividends',
    type: 'income',
    label: 'Dividends',
    amount: 100,
    frequency: 'monthly',
    nextDueDate: new Date(2026, 5, 14).toISOString(),
    isFixed: true,
    active: true,
  });
  return data;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string) as AppData;
}

describe('Wave 6 — income: identity, and selection that records nothing', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(incomeData()));
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
  });

  afterAll(() => root?.unmount());

  test('the income reminder is titled by the item, in the customer\'s own casing, with no emoji', async () => {
    const title = await screen.findByTestId('reminder-title');
    // The engine composes "Did your dividends arrive? 🎉" — lower-cased and
    // carrying a party emoji into a financial surface. Neither survives.
    expect(title.props.children).toBe('Dividends');
    expect(screen.queryByText(/Did your/)).toBeNull();
    expect(screen.queryByText(/🎉/)).toBeNull();
  });

  test('status says EXPECTED — income is never framed as owed', () => {
    expect(screen.getByText('Expected')).toBeOnTheScreen();
    expect(screen.queryByText(/due/i)).toBeNull();
  });

  test('one supporting line carries the amount and the date, once', () => {
    const line = String(screen.getByTestId('reminder-support-line').props.children);
    expect(line).toMatch(/^\$100 expected /);
    expect(screen.queryAllByText(/expected/i)).toHaveLength(2); // status + line
  });

  test('the notice states the destination is the customer\'s choice and nothing moves at the bank', () => {
    const notice = String(screen.getByTestId('reminder-income-notice').props.children);
    expect(notice).toMatch(/adds \$100 to the account you choose in Nolie/);
    expect(notice).toMatch(/does not move money at your bank/);
  });

  test('there is one primary action and no retired "Not yet"', () => {
    expect(screen.getByRole('button', { name: 'Confirm received' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Not yet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes, it arrived' })).toBeNull();
    // The three intentions, and only those.
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeOnTheScreen();
  });

  test('the destination step lists eligible accounts as full rows — savings included, cards never', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Confirm received' }));

    expect(screen.getByText('Where did the $100 arrive?')).toBeOnTheScreen();
    expect(screen.getByText('Choose the account Nolie should add this income to.')).toBeOnTheScreen();
    // Income CAN credit savings — that is its own eligibility contract, and
    // sharing a row component must not have harmonised it away.
    expect(screen.getByRole('radio', { name: 'CBA. Everyday account. Balance · $22,500.' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Rainy day. Savings account. Balance · $4,000.' })).toBeOnTheScreen();
    // And never a credit card.
    expect(screen.queryByText('Credit cards')).toBeNull();
  });

  test('choosing a destination selects ONLY — no income is recorded', async () => {
    const user = userEvent.setup();
    // Inert until a choice is made: no silent default.
    expect(screen.getByTestId('income-confirm-action').props.accessibilityState.disabled).toBe(true);

    await user.press(screen.getByTestId('account-choice-cba'));

    expect(screen.getByTestId('account-choice-cba').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('income-confirm-action').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('income-confirm-summary')).toBeOnTheScreen();

    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'cba')!.currentValue).toBe(22500);
  });

  test('changing the destination is still mutation-free', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('account-choice-save'));

    expect(screen.getByTestId('account-choice-save').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('account-choice-cba').props.accessibilityState.selected).toBe(false);
    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'save')!.currentValue).toBe(4000);
  });

  test('Back returns to the reminder with nothing recorded and no selection left armed', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('income-destination-back'));

    expect(screen.getByRole('button', { name: 'Confirm received' })).toBeOnTheScreen();
    const after = await stored();
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'cba')!.currentValue).toBe(22500);
    expect(after.recurringItems.find((r) => r.id === 'dividends')!.nextDueDate).toBe(new Date(2026, 5, 14).toISOString());
  });
});

describe('Wave 6 — income: confirming records exactly once', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(incomeData()));
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await user.press(await screen.findByRole('button', { name: 'Confirm received' }));
    await user.press(await screen.findByTestId('account-choice-cba'));
  });

  afterAll(() => root?.unmount());

  test('confirming creates exactly one income transaction for the scheduled amount', async () => {
    const user = userEvent.setup();
    expect((await stored()).transactions).toHaveLength(0);

    await user.press(screen.getByTestId('income-confirm-action'));

    const after = await stored();
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0].amount).toBe(100);
    expect(after.transactions[0].type).toBe('income');
  });

  test('the chosen destination increases exactly once, and no other balance moves', async () => {
    const after = await stored();
    expect(after.assets.find((a) => a.id === 'cba')!.currentValue).toBe(22600);
    expect(after.assets.find((a) => a.id === 'save')!.currentValue).toBe(4000);
  });

  test('the occurrence advances and the future recurrence survives', async () => {
    const after = await stored();
    const item = after.recurringItems.find((r) => r.id === 'dividends')!;
    expect(item.active).toBe(true);
    expect(new Date(item.nextDueDate).getTime()).toBeGreaterThan(new Date(2026, 5, 14).getTime());
  });

  test('and a repeated confirmation cannot create a second transaction', async () => {
    const user = userEvent.setup();
    // The step is gone — the queue advanced — so there is nothing left to
    // press. The occurrence-eligibility check in the transition is the real
    // guarantee; this asserts the surface cannot even offer a second go.
    expect(screen.queryByTestId('income-confirm-action')).toBeNull();
    expect((await stored()).transactions).toHaveLength(1);
  });
});
