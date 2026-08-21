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
 * Nolie Design 5.1 Wave 6 final — Snooze and Dismiss, rendered against the
 * REAL AppStateProvider and the REAL (mocked, in-memory) AsyncStorage.
 *
 * The suppression rules themselves are proven exhaustively without a mount
 * in tests/design5-wave6-reminder-intents.test.ts. What only a real mount
 * can prove is what this file asserts: that the controls genuinely WRITE
 * through the real persistence, that a remount re-hydrates the suppression
 * from storage rather than from React state, and that neither touches a
 * balance or a transaction on the way through.
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

function twoBillsData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.assets.push({ id: 'everyday', type: 'everyday', label: 'Everyday', currentValue: 2000 });
  data.recurringItems.push(
    {
      id: 'rent',
      type: 'expense',
      label: 'Rent',
      amount: 500,
      frequency: 'monthly',
      nextDueDate: new Date(2026, 5, 13).toISOString(), // overdue
      isFixed: true,
      active: true,
    },
    {
      id: 'internet',
      type: 'expense',
      label: 'Internet',
      amount: 60,
      frequency: 'monthly',
      nextDueDate: new Date(2026, 5, 14).toISOString(), // overdue, later in the tier
      isFixed: true,
      active: true,
    }
  );
  return data;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string) as AppData;
}

describe('Wave 6 — Snooze writes a real, dated suppression', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(twoBillsData()));
    root = await render(<Harness today={today} />);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
  });

  afterAll(() => root?.unmount());

  test('Snooze is offered on every reminder, below the action that resolves it', async () => {
    expect(await screen.findByTestId('reminder-snooze-action')).toBeOnTheScreen();
    expect(screen.getByText('Show this again later')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-dismiss-action')).toBeOnTheScreen();
    expect(screen.getByText('Hide this occurrence')).toBeOnTheScreen();
  });

  test('it opens an inline step, not a second sheet, and promises only what Nolie can do', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-snooze-action'));

    expect(screen.getByText('This reminder will reappear in Nolie on the date you choose.')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-snooze-tomorrow')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-snooze-in3days')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-snooze-custom')).toBeOnTheScreen();
    // Still exactly one Close, and still only one sheet.
    expect(screen.queryAllByTestId('reminder-header-close')).toHaveLength(1);
    // Nothing has been written by merely opening the step.
    expect((await stored()).snoozedReminderOccurrences ?? {}).toEqual({});
  });

  test('Back leaves the step without writing anything', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-snooze-back'));
    expect(screen.getByTestId('reminder-snooze-action')).toBeOnTheScreen();
    expect((await stored()).snoozedReminderOccurrences ?? {}).toEqual({});
  });

  test('choosing Tomorrow persists that exact local day for that exact occurrence', async () => {
    const user = userEvent.setup();
    const before = await stored();
    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));

    const after = await stored();
    const entries = Object.entries(after.snoozedReminderOccurrences ?? {});
    expect(entries).toHaveLength(1);
    // The key is the canonical occurrence identity, never visible copy.
    expect(entries[0][0]).toBe('recurring_item:rent:2026-06-13');
    // A local calendar day, and the day AFTER the sheet's fixed today.
    expect(entries[0][1]).toBe('2026-06-16');

    // Zero financial effect: no transaction, no balance change, and the
    // bill's own schedule is exactly where it was.
    expect(after.transactions).toEqual(before.transactions);
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
    expect(after.recurringItems.find((r) => r.id === 'rent')!.nextDueDate).toBe(before.recurringItems.find((r) => r.id === 'rent')!.nextDueDate);
  });

  test('and the queue advances to the next eligible reminder in the same sheet', () => {
    expect(screen.getByTestId('reminder-title')).toBeOnTheScreen();
    expect(String(screen.getByTestId('reminder-title').props.children)).toMatch(/Internet/);
    expect(screen.queryAllByTestId('reminder-header-close')).toHaveLength(1);
  });

  test('Dismiss requires an explicit confirmation before it writes', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-dismiss-action'));

    expect(screen.getByText('Dismiss this reminder?')).toBeOnTheScreen();
    // The copy must close all three misreadings.
    expect(screen.getByText(/won.t mark the bill as paid/)).toBeOnTheScreen();
    expect(screen.getByText(/change your records/)).toBeOnTheScreen();
    expect(screen.getByText(/Future reminders will still appear/)).toBeOnTheScreen();
    expect((await stored()).dismissedReminderOccurrences ?? []).toEqual([]);
  });

  test('Keep reminder changes nothing at all', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-dismiss-keep'));

    expect(screen.getByTestId('reminder-dismiss-action')).toBeOnTheScreen();
    const after = await stored();
    expect(after.dismissedReminderOccurrences ?? []).toEqual([]);
    expect(after.transactions).toHaveLength(0);
  });

  test('confirming dismissal persists the occurrence key and closes cleanly when nothing remains', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('reminder-dismiss-action'));
    await user.press(screen.getByTestId('reminder-dismiss-confirm'));

    const after = await stored();
    expect(after.dismissedReminderOccurrences).toEqual(['recurring_item:internet:2026-06-14']);
    // Still no financial effect of any kind.
    expect(after.transactions).toHaveLength(0);
    expect(after.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
    // Both reminders are now suppressed, so the sheet closed rather than
    // showing a blank shell.
    expect(screen.queryByTestId('reminder-title')).toBeNull();
  });

  test('and the Briefing no longer advertises a reminder that will not open', () => {
    expect(screen.queryByTestId(REMINDER_ROW)).toBeNull();
  });
});

describe('Wave 6 — suppression survives a restart, and only for its own occurrence', () => {
  let root: any;

  beforeAll(async () => {
    // Storage is deliberately NOT cleared: this root re-hydrates the
    // suppression the previous describe persisted, which is the whole
    // point — a fresh mount reads it from disk, not from React state.
    root = await render(<Harness today={today} />);
  });

  afterAll(() => root?.unmount());

  test('a fresh mount re-reads both suppressions from storage', async () => {
    const persisted = await stored();
    expect(Object.keys(persisted.snoozedReminderOccurrences ?? {})).toEqual(['recurring_item:rent:2026-06-13']);
    expect(persisted.dismissedReminderOccurrences).toEqual(['recurring_item:internet:2026-06-14']);
    // Neither reminder returns, so no tile is offered.
    expect(screen.queryByTestId(REMINDER_ROW)).toBeNull();
  });

  test('no financial record was created by any of it', async () => {
    const persisted = await stored();
    expect(persisted.transactions).toHaveLength(0);
    expect(persisted.assets.find((a) => a.id === 'everyday')!.currentValue).toBe(2000);
    // Both bills still exist, still active, still on their original dates —
    // dismissing hid a reminder, it did not delete anything.
    expect(persisted.recurringItems).toHaveLength(2);
    expect(persisted.recurringItems.every((r) => r.active)).toBe(true);
    expect(persisted.recurringItems.find((r) => r.id === 'internet')!.nextDueDate).toBe(new Date(2026, 5, 14).toISOString());
  });
});
