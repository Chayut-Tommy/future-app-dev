// Pass C.5.2.1 — rendered integrity proofs. Real AppStateProvider, the REAL storage
// adapter (loadAppData / saveAppData over the AsyncStorage mock) and the real
// hydration path: "restart" means unmounting the whole tree and mounting a new one
// that loads from storage. `today` is explicit, never the system clock.
//   §1 a rejected write leaves memory AND storage exactly as they were
//   §2 real reload: Scenarios A / B / C, source deletion, exact reversal, re-record
//   §3 entry parity across every tier that reaches the ONE repayment form
//   §4 same-tick double submission; a concurrent valid update is never lost
//   §5 a broken loan link fails closed in the UI
// NOT proven here: native Modal timing, real backgrounding, VoiceOver speech.

import React, { useMemo, useRef, useState } from 'react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
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
import { selectSafeToSpendPresentation, buildAupExplanation } from '../../src/lib/calculations/safeToSpendPresentation';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeThisMonthRecordedSummary } from '../../src/lib/calculations/monthlySummary';
import { computeAccessibleNetWorth } from '../../src/lib/calculations/wealthDefinitions';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData, Asset, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const REMINDER_ROW = /^briefing-priority-row-reminder-/;
const D19 = new Date(2026, 8, 19); // repayment due tomorrow
const D20 = new Date(2026, 8, 20); // due today
const D23 = new Date(2026, 8, 23); // overdue
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
const settle = () => new Promise((r) => setTimeout(r, 120));

function parityData(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset];
  d.liabilities = [{ id: 'richmond-loan', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: new Date(2026, 8, 28).toISOString(), isFixed: false, active: true } as RecurringItem,
    { id: 'richmond', type: 'expense', label: 'Richmond repayment', amount: 3000, frequency: 'monthly', nextDueDate: new Date(2026, 8, 20).toISOString(), isFixed: true, active: true, linkedLiabilityId: 'richmond-loan' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}

let api: ReturnType<typeof useAppState> | null = null;
function TodayHarness({ today }: { today: Date }) {
  const state = useAppState();
  api = state;
  const { data } = state;
  const topReminder = useMemo(() => computeRankedReminder(data, today, createSuppressionPredicate(data, today)), [data, today]);
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, today), [data, today]);
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data, today), [data, today]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const presentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  const idRef = useRef(0);
  const [openRequest, setOpenRequest] = useState<ReminderOpenRequest | null>(null);
  return (
    <>
      <Text testID="probe-ready">{state.isLoading ? 'loading' : 'ready'}</Text>
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
            <TodayHarness today={today} />
          </ThemeProvider>
        </AppStateProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

let root: Awaited<ReturnType<typeof render>> | null = null;
async function launch(today: Date) {
  if (root) { await root.unmount(); root = null; }
  api = null;
  root = await render(<Harness today={today} />);
  await waitFor(() => expect(screen.getByTestId('probe-ready')).toHaveTextContent('ready'));
  await settle(); // app start's own housekeeping write
}
async function seedAndLaunch(today: Date, data: AppData = parityData()) {
  if (root) { await root.unmount(); root = null; }
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await launch(today);
}
afterEach(async () => { if (root) { await root.unmount(); root = null; } });

/** Everything a repayment can touch, read from one AppData. */
function picture(d: AppData, today: Date) {
  const asOf = localDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const look = computeLookAheadProjection(d, asOf, localDate(2026, 10, 30));
  const month = computeThisMonthRecordedSummary(d, today);
  const top = computeRankedReminder(d, today);
  return {
    main: Math.round(d.assets.find((a) => a.id === 'Main')!.currentValue * 100),
    liability: d.liabilities[0] ? Math.round(d.liabilities[0].currentBalance * 100) : null,
    netWorth: Math.round(computeAccessibleNetWorth(d) * 100),
    repayments: d.transactions.filter((t) => t.recurringItemId === 'richmond').length,
    transactions: d.transactions.length,
    due: d.recurringItems.find((r) => r.id === 'richmond')?.nextDueDate ?? null,
    reminder: top ? `${top.kind}:${top.recurringItemId ?? ''}` : null,
    spent: month.spendingCents,
    aup: buildAupExplanation(computeSafeToSpend(d, today)).remainderCents,
    lookAhead: look.available ? look.targetCents : null,
    opening: look.available ? look.breakdown.openingCents : null,
    upcoming: computeMoneyTimeline(d, today).filter((e: any) => String(e.id ?? '').includes('richmond') || String(e.label ?? '').includes('Richmond')).length,
  };
}
/** The recorded repayment without ids and timestamps, for cross-entry comparison. */
function recordedEffects(d: AppData) {
  return {
    main: Math.round(d.assets.find((a) => a.id === 'Main')!.currentValue * 100),
    liability: Math.round(d.liabilities[0].currentBalance * 100),
    netWorth: Math.round(computeAccessibleNetWorth(d) * 100),
    due: d.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate,
    scheduleAnchorDay: d.recurringItems.find((r) => r.id === 'richmond')!.scheduleAnchorDay,
    transactions: d.transactions.filter((t) => t.recurringItemId === 'richmond').map(({ id, date, ...rest }) => { void id; void date; return rest; }),
  };
}

async function openForm() {
  const user = userEvent.setup();
  await user.press(await screen.findByTestId(REMINDER_ROW));
  await user.press(await screen.findByRole('button', { name: 'Record repayment' }));
  await screen.findByText('How much did you pay in total?');
  return user;
}
async function fillAndSave(user: ReturnType<typeof userEvent.setup>, latestBalance: string | null) {
  await user.press(screen.getByTestId('account-choice-Main'));
  if (latestBalance !== null) {
    await user.press(screen.getByTestId('loan-balance-choice-update'));
    await fireEvent.changeText(screen.getAllByPlaceholderText('$0.00')[1], latestBalance);
  } else {
    await user.press(screen.getByTestId('loan-balance-choice-skip'));
  }
  await user.press(screen.getByRole('button', { name: 'Record payment' }));
}

describe('C.5.2.1 §1 — a rejected write changes nothing, anywhere', () => {
  test('reject → memory and storage unchanged, no success, editor open → unrelated write → restart → still absent → retry → exactly one repayment', async () => {
    await seedAndLaunch(D19);
    const before = picture(api!.data, D19);
    const storedBefore = await AsyncStorage.getItem(STORAGE_KEY);
    const user = await openForm();

    // 1. Inject a persistence rejection for the repayment write only.
    const real = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    await fillAndSave(user, '297000');

    // 3 + 4. No success confirmation; the editor stays open with its accessible error.
    expect(await screen.findByText("We couldn't save that repayment, so nothing was recorded. Please try again.")).toBeOnTheScreen();
    expect(screen.queryByTestId('payment-recorded-message')).toBeNull();
    expect(screen.getByText('How much did you pay in total?')).toBeOnTheScreen();
    expect(screen.getAllByPlaceholderText('$0.00')[0].props.value).toBe('3000'); // entries preserved
    expect(screen.getAllByPlaceholderText('$0.00')[1].props.value).toBe('297000');

    // 2. EVERY affected in-memory value is exactly as before Save.
    expect(picture(api!.data, D19)).toEqual(before);
    expect(api!.data.transactions).toHaveLength(0);
    expect(api!.data.netWorthHistory ?? []).toEqual(JSON.parse(storedBefore!).netWorthHistory ?? []);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(storedBefore);

    // 5. A later, unrelated, SUCCESSFUL write must not carry the failed repayment with it.
    await act(async () => { api!.updateUser({ name: 'Tommy B' }); });
    await settle();
    const afterUnrelated = await stored();
    expect(afterUnrelated.user.name).toBe('Tommy B');
    expect(afterUnrelated.transactions).toHaveLength(0);
    expect(afterUnrelated.assets.find((a) => a.id === 'Main')!.currentValue).toBe(10650);
    expect(afterUnrelated.liabilities[0].currentBalance).toBe(300000);
    expect(afterUnrelated.recurringItems.find((r) => r.id === 'richmond')!.nextDueDate).toBe(new Date(2026, 8, 20).toISOString());

    // 6 + 7. Restart through the real adapter: the failed repayment was never persisted, directly or indirectly.
    await launch(D19);
    expect(api!.data.user.name).toBe('Tommy B');
    expect(picture(api!.data, D19)).toEqual(before);
    expect(screen.getByTestId(REMINDER_ROW)).toBeOnTheScreen(); // the reminder is still offered

    // 8 + 9. Retry succeeds and exactly ONE repayment exists, in memory and in storage.
    (AsyncStorage.setItem as jest.Mock).mockImplementation(real);
    const again = await openForm();
    await fillAndSave(again, '297000');
    expect(await screen.findByTestId('payment-recorded-message')).toHaveTextContent('Repayment recorded · Liability updated');
    expect(picture(api!.data, D19)).toMatchObject({ main: 765000, liability: 29700000, repayments: 1, netWorth: before.netWorth });
    await settle();
    const final = await stored();
    expect(final.transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
    await launch(D19);
    expect(picture(api!.data, D19)).toMatchObject({ main: 765000, liability: 29700000, repayments: 1 });
  }, 120000);
});

describe('C.5.2.1 §2 — real persistence reload', () => {
  test.each([
    ['A', '297000', 29700000, 3000, 0],
    ['B', '299200', 29920000, 800, 220000],
    ['C', null, 30000000, undefined, 0],
  ] as [string, string | null, number, number | undefined, number][])('Scenario %s survives a real restart; then source deletion, exact reversal and re-record all survive restarts too', async (_name, balance, liabilityCents, principal, spentCents) => {
    await seedAndLaunch(D19);
    const start = picture(api!.data, D19);
    await fillAndSave(await openForm(), balance);
    await screen.findByTestId('payment-recorded-message');
    await settle();
    await launch(D19); // real hydration
    const reloaded = picture(api!.data, D19);
    expect(reloaded).toMatchObject({ main: 765000, liability: liabilityCents, repayments: 1, opening: start.opening! - 300000, lookAhead: start.lookAhead, aup: start.aup });
    const t = api!.data.transactions.find((x) => x.recurringItemId === 'richmond')!;
    // The record is stamped with the real clock, so This Month is read for the record's own month.
    expect(computeThisMonthRecordedSummary(api!.data, new Date(t.date)).spendingCents).toBe(spentCents);
    expect(t.principalAmount).toBe(principal);
    expect(t).toMatchObject({ isLoanRepayment: true, repaymentLiabilityId: 'richmond-loan', categoryId: 'cat-mortgage' });

    // The customer deletes the SOURCE bill, then restarts.
    await act(async () => { api!.deleteRecurringItem('richmond'); });
    await settle();
    await launch(D19);
    expect(api!.data.recurringItems.some((r) => r.id === 'richmond')).toBe(false);
    expect(api!.data.transactions.filter((x) => x.recurringItemId === 'richmond')).toHaveLength(1); // not stranded, not lost

    // Exact reversal from the stored effects, then restart.
    let result: { applied: boolean } = { applied: false };
    await act(async () => { result = api!.reverseLoanRepayment(t.id); });
    expect(result.applied).toBe(true);
    await settle();
    await launch(D19);
    expect(picture(api!.data, D19)).toMatchObject({ main: 1065000, liability: 30000000, netWorth: start.netWorth, repayments: 0, due: null });
    expect(computeThisMonthRecordedSummary(api!.data, new Date(t.date)).spendingCents).toBe(0);
    let repeat: { applied: boolean } = { applied: true };
    await act(async () => { repeat = api!.reverseLoanRepayment(t.id); });
    expect(repeat.applied).toBe(false);
  }, 180000);

  test('delete and re-record with the source still present: one transaction, same occurrence identity, across restarts', async () => {
    await seedAndLaunch(D19);
    await fillAndSave(await openForm(), '299200');
    await screen.findByTestId('payment-recorded-message');
    await settle();
    await launch(D19);
    const first = api!.data.transactions.find((x) => x.recurringItemId === 'richmond')!;
    await act(async () => { api!.reverseLoanRepayment(first.id); });
    await settle();
    await launch(D19);
    expect(picture(api!.data, D19)).toMatchObject({ main: 1065000, liability: 30000000, repayments: 0, due: new Date(2026, 8, 20).toISOString(), reminder: 'loan_repayment_due:richmond' });
    await fillAndSave(await openForm(), '299200');
    await screen.findByTestId('payment-recorded-message');
    await settle();
    await launch(D19);
    const again = api!.data.transactions.filter((x) => x.recurringItemId === 'richmond');
    expect(again).toHaveLength(1);
    expect(again[0].occurrenceResolution).toEqual(first.occurrenceResolution);
    expect(again[0].id).not.toBe(first.id);
    expect(picture(api!.data, D19)).toMatchObject({ main: 765000, liability: 29920000 });
  }, 180000);

  test('legacy AppData (no C.5.2 fields anywhere) hydrates unchanged through the real adapter', async () => {
    const legacy = parityData();
    legacy.transactions = [{ id: 'old', type: 'expense', amount: 3000, categoryId: 'cat-debt', date: new Date(2026, 7, 20).toISOString(), recurringItemId: 'richmond', recurringOccurrenceKey: `richmond:${new Date(2026, 7, 20).toISOString()}`, isLoanRepayment: true, principalAmount: 900, balanceEffect: 'update', appliedBalanceEffect: { targetKind: 'asset', targetId: 'Main', delta: -3000 }, paymentSource: 'everyday', targetAssetId: 'Main' } as any];
    await seedAndLaunch(D19, legacy);
    const t = api!.data.transactions.find((x) => x.id === 'old')!;
    expect(t.repaymentLiabilityId).toBeUndefined();
    expect(t.principalAmount).toBe(900);
    expect((await stored()).transactions.find((x) => x.id === 'old')).toEqual(legacy.transactions[0]);
  }, 60000);
});

describe('C.5.2.1 §3 — entry parity', () => {
  test('the app has exactly ONE loan-repayment entry: one form hook, one caller of the transition, one sheet mount', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = walk(join(__dirname, '../../src')).filter((f) => /\.tsx?$/.test(f));
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const rel = (f: string) => f.split('/src/')[1];
    expect(files.filter((f) => /confirmLoanRepayment\(\{/.test(code(f))).map(rel)).toEqual(['hooks/useLoanRepaymentForm.ts']);
    expect(files.filter((f) => /= useLoanRepaymentForm\(\{/.test(code(f))).map(rel)).toEqual(['components/today/ReminderDetailSheet.tsx']);
    expect(files.filter((f) => /<ReminderDetailSheet\b/.test(code(f))).map(rel)).toEqual(['screens/today/TodayScreen.tsx']);
    // No Quick Add or loan-detail surface records a loan repayment.
    expect(files.filter((f) => /isLoanRepayment: true/.test(code(f))).map(rel)).toEqual(['state/AppStateContext.tsx']);
  });

  test.each([
    ['A', '297000'],
    ['B', '299200'],
    ['C', null],
  ] as [string, string | null][])('Scenario %s: due-tomorrow, due-today and overdue entries produce byte-identical recorded effects and the same derived figures', async (_n, balance) => {
    const results: ReturnType<typeof recordedEffects>[] = [];
    const derived: unknown[] = [];
    for (const today of [D19, D20, D23]) {
      await seedAndLaunch(today);
      await fillAndSave(await openForm(), balance);
      await screen.findByTestId('payment-recorded-message');
      await settle();
      await launch(today);
      results.push(recordedEffects(api!.data));
      // Derived figures are compared on ONE common date so only the entry differs.
      const p = picture(api!.data, D23);
      derived.push({ aup: p.aup, lookAhead: p.lookAhead, opening: p.opening, netWorth: p.netWorth, repayments: p.repayments });
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(derived[1]).toEqual(derived[0]);
    expect(derived[2]).toEqual(derived[0]);
    expect(results[0].transactions).toHaveLength(1);
  }, 240000);
});

describe('C.5.2.1 §4 — duplicate submission and concurrent updates', () => {
  const input = () => ({ recurringItemId: 'richmond', liabilityId: 'richmond-loan', expectedNextDueDate: new Date(2026, 8, 20).toISOString(), amount: 3000, paymentSource: 'everyday' as const, targetAssetId: 'Main', updateBalance: true, newBalance: 297000, expectedCurrentBalance: 300000 });

  test('two submissions in the same tick: the second is refused while the first write is in flight — one write, one transaction', async () => {
    await seedAndLaunch(D19);
    const before = writes();
    let first: any; let second: any;
    await act(async () => {
      first = api!.confirmLoanRepayment(input());
      second = api!.confirmLoanRepayment(input());
      await Promise.all([first.persistence, second.persistence]);
    });
    expect(first.transition.applied).toBe(true);
    expect(second.transition).toEqual({ applied: false, reason: 'already_confirmed' });
    expect(writes()).toBe(before + 1);
    expect(api!.data.transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
    expect((await stored()).transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
    // A third attempt after it settled is refused by the transition's own guard.
    let third: any;
    await act(async () => { third = api!.confirmLoanRepayment(input()); await third.persistence; });
    expect(third.transition.applied).toBe(false);
  }, 60000);

  test('a valid update that lands while the repayment write is pending is never overwritten, and the repayment still lands exactly once', async () => {
    await seedAndLaunch(D19);
    const real = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async (k: string, v: string) => { await gate; return real(k, v); });
    let pending: any;
    await act(async () => { pending = api!.confirmLoanRepayment(input()); });
    expect(api!.data.transactions).toHaveLength(0); // write-first: nothing in memory yet
    await act(async () => { api!.updateUser({ name: 'Concurrent' }); }); // an unrelated valid update
    await act(async () => { release(); await pending.persistence; });
    await settle();
    expect(api!.data.user.name).toBe('Concurrent');
    expect(api!.data.transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
    expect(api!.data.liabilities[0].currentBalance).toBe(297000);
    const s = await stored();
    expect(s.user.name).toBe('Concurrent');
    expect(s.transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
    expect(s.assets.find((a) => a.id === 'Main')!.currentValue).toBe(7650);
    await launch(D19);
    expect(api!.data.user.name).toBe('Concurrent');
    expect(api!.data.transactions.filter((t) => t.recurringItemId === 'richmond')).toHaveLength(1);
  }, 60000);
});

describe('C.5.2.1 §5 — a broken loan link fails closed', () => {
  test('liability deleted: the reminder offers "I’ll review this bill" only — never "Mark as paid" or "Record repayment" — and nothing is written', async () => {
    const d = parityData();
    d.liabilities = [];
    await seedAndLaunch(D19, d);
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(REMINDER_ROW));
    expect(await screen.findByTestId('reminder-review-acknowledge')).toBeOnTheScreen();
    expect(screen.getByTestId('reminder-support-line')).toHaveTextContent(/linked to a loan Nolie can no longer find/);
    expect(screen.getByText('Review needed')).toBeOnTheScreen();
    expect(screen.queryByText(/Due tomorrow|Overdue|Due today/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record repayment' })).toBeNull();
    const before = writes();
    await user.press(screen.getByTestId('reminder-review-acknowledge'));
    await settle();
    expect(writes()).toBe(before);
    expect(api!.data.transactions).toHaveLength(0);
    expect(api!.data.assets[0].currentValue).toBe(10650);
  }, 60000);
});
