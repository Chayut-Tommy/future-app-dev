// Pass D0 — Durable Editor Completion Foundation: rendered proofs with the REAL
// AppStateProvider, the REAL storage adapter and REAL hydration ("restart" =
// unmount the tree, mount a new one that loads from storage).
//   §1 every entity family: durable add / update / delete, then restart
//   §2 a REJECTED write: memory and storage unchanged, not resurrected by a later
//      write or a restart, and a retry produces exactly one result
//   §3 overlapping durable writes — both completion orders, one failing, and an
//      unrelated optimistic update landing mid-write
//   §4 the four editors: Saving… / Deleting…, refused dismissal while pending,
//      failure keeps the draft, retry, ONE structured outcome, zero-write Cancel
//   §5 linked-loan deletion is blocked, in the editor and at the state layer
// NOT proven here: native sheet swipe/backdrop gestures, keyboard, real backgrounding.

import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, DurableMutationRefused, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { AddIncomeModal } from '../../src/components/income/AddIncomeModal';
import { AddRecurringItemModal } from '../../src/components/money/AddRecurringItemModal';
import { AddCreditCardModal } from '../../src/components/credit/AddCreditCardModal';
import { AddWealthItemModal } from '../../src/components/wealth/AddWealthItemModal';
import { LoanBalanceReminderCard } from '../../src/components/today/LoanBalanceReminderCard';
import { EDITOR_DELETE_FAILED_COPY, EDITOR_SAVE_FAILED_COPY, EditorOutcome } from '../../src/lib/editorCompletion';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { buildAupExplanation } from '../../src/lib/calculations/safeToSpendPresentation';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeAccessibleNetWorth } from '../../src/lib/calculations/wealthDefinitions';
import { computeRankedReminder } from '../../src/lib/calculations/reminders';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { createEmptyAppData } from '../../src/lib/storage';
import type { AppData, Asset, CreditCard, Liability, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const TODAY = new Date(2026, 8, 21);
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
const settle = () => new Promise((r) => setTimeout(r, 120));
const setItem = () => AsyncStorage.setItem as jest.Mock;

function seedData(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main-CBA', currentValue: 10650, includeInMoneyCalculations: true } as Asset];
  d.liabilities = [
    { id: 'mortgage', type: 'mortgage', label: 'Richmond', currentBalance: 300000 } as Liability,
    { id: 'car', type: 'car_loan', label: 'Car', currentBalance: 20000 } as Liability,
    { id: 'amex-mirror', type: 'credit_card', label: 'AMEX', currentBalance: 800, creditCardId: 'amex' } as Liability,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary boq', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 28), isFixed: false, active: true } as RecurringItem,
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
    { id: 'richmond', type: 'expense', label: 'Richmond repayment', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 10, 20), isFixed: true, active: true, linkedLiabilityId: 'mortgage' } as RecurringItem,
  ];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 30 } as unknown as CreditCard];
  return syncIncomeAggregate(d);
}

let api: ReturnType<typeof useAppState> | null = null;
type EditorSpec =
  | { kind: 'income'; id: string }
  | { kind: 'bill'; id: string }
  | { kind: 'card'; id: string }
  | { kind: 'asset'; id: string }
  | { kind: 'liability'; id: string }
  | { kind: 'loan-balance-card' };
const outcomes: EditorOutcome[] = [];
let closes = 0;

function Host({ editor }: { editor: EditorSpec | null }) {
  const state = useAppState();
  api = state;
  const [open, setOpen] = React.useState(true);
  const { data } = state;
  const onClose = () => { closes += 1; setOpen(false); };
  const onOutcome = (o: EditorOutcome) => { outcomes.push(o); };
  const visible = open && !state.isLoading;
  return (
    <>
      <Text testID="probe-ready">{state.isLoading ? 'loading' : 'ready'}</Text>
      <Text testID="probe-open">{visible ? 'open' : 'closed'}</Text>
      {editor?.kind === 'income' ? <AddIncomeModal visible={visible} editItem={data.recurringItems.find((r) => r.id === editor.id) ?? null} onClose={onClose} onOutcome={onOutcome} /> : null}
      {editor?.kind === 'bill' ? <AddRecurringItemModal visible={visible} editItem={data.recurringItems.find((r) => r.id === editor.id) ?? null} onClose={onClose} onOutcome={onOutcome} /> : null}
      {editor?.kind === 'card' ? <AddCreditCardModal visible={visible} editCard={data.creditCards.find((c) => c.id === editor.id) ?? null} onClose={onClose} onOutcome={onOutcome} /> : null}
      {editor?.kind === 'asset' ? <AddWealthItemModal visible={visible} kind="asset" editAsset={data.assets.find((a) => a.id === editor.id) ?? null} onClose={onClose} onOutcome={onOutcome} /> : null}
      {editor?.kind === 'loan-balance-card' && !state.isLoading ? <LoanBalanceReminderCard /> : null}
      {editor?.kind === 'liability' ? <AddWealthItemModal visible={visible} kind="liability" editLiability={data.liabilities.find((l) => l.id === editor.id) ?? null} onClose={onClose} onOutcome={onOutcome} /> : null}
    </>
  );
}
function Tree({ editor }: { editor: EditorSpec | null }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <Host editor={editor} />
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

let root: Awaited<ReturnType<typeof render>> | null = null;
async function launch(editor: EditorSpec | null = null) {
  if (root) { await root.unmount(); root = null; }
  api = null; outcomes.length = 0; closes = 0;
  root = await render(<Tree editor={editor} />);
  await waitFor(() => expect(screen.getByTestId('probe-ready')).toHaveTextContent('ready'));
  await settle();
}
async function seedAndLaunch(editor: EditorSpec | null = null, data: AppData = seedData()) {
  if (root) { await root.unmount(); root = null; }
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await launch(editor);
}
afterEach(async () => { setItem().mockClear(); if (root) { await root.unmount(); root = null; } });

/** Everything a failed mutation must not touch. `withScore: false` is used only where an
 * intervening, unrelated SUCCESSFUL write legitimately stamps today's score-history entry. */
function picture(d: AppData, withScore = true) {
  const asOf = localDate(2026, 9, 21);
  const look = computeLookAheadProjection(d, asOf, localDate(2026, 10, 30));
  return JSON.stringify({
    assets: d.assets, liabilities: d.liabilities, recurringItems: d.recurringItems, creditCards: d.creditCards, transactions: d.transactions,
    main: d.user.mainPaydayIncomeId, nextPayday: d.user.nextPayday,
    aup: buildAupExplanation(computeSafeToSpend(d, TODAY)).remainderCents,
    look: look.available ? look.targetCents : null,
    netWorth: Math.round(computeAccessibleNetWorth(d) * 100),
    reminder: computeRankedReminder(d, TODAY)?.id ?? null,
    score: withScore ? d.luluScoreHistory : 'n/a',
  });
}
const rejectNextWrite = () => setItem().mockImplementationOnce(() => Promise.reject(new Error('disk full')));
function gateNextWrite() {
  const real = setItem().getMockImplementation()!;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  setItem().mockImplementationOnce(async (k: string, v: string) => { await gate; return real(k, v); });
  return () => release();
}

type Family = { name: string; add: () => Promise<void>; update: () => Promise<void>; remove: () => Promise<void>; present: (d: AppData) => boolean; updated: (d: AppData) => boolean };
const families = (): Family[] => [
  { name: 'recurring income', add: () => api!.addRecurringItem({ type: 'income', label: 'Dividends', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true } as Omit<RecurringItem, 'id'>, { id: 'new' }), update: () => api!.updateRecurringItem('new', { amount: 1200 }), remove: () => api!.deleteRecurringItem('new'), present: (d) => d.recurringItems.some((r) => r.id === 'new'), updated: (d) => d.recurringItems.find((r) => r.id === 'new')?.amount === 1200 },
  { name: 'recurring bill', add: () => api!.addRecurringItem({ type: 'expense', label: 'Gym', amount: 45, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-health' } as Omit<RecurringItem, 'id'>, { id: 'new' }), update: () => api!.updateRecurringItem('new', { amount: 50 }), remove: () => api!.deleteRecurringItem('new'), present: (d) => d.recurringItems.some((r) => r.id === 'new'), updated: (d) => d.recurringItems.find((r) => r.id === 'new')?.amount === 50 },
  { name: 'credit card', add: () => api!.addCreditCard({ id: 'new', issuer: 'Visa', label: 'Visa', currentBalance: 100, creditLimit: 2000, dueDay: 12 } as never), update: () => api!.updateCreditCard('new', { currentBalance: 80 }), remove: () => api!.deleteCreditCard('new'), present: (d) => d.creditCards.some((c) => c.id === 'new') && d.liabilities.filter((l) => l.creditCardId === 'new').length === 1, updated: (d) => d.creditCards.find((c) => c.id === 'new')?.currentBalance === 80 && d.liabilities.find((l) => l.creditCardId === 'new')?.currentBalance === 80 },
  { name: 'included account', add: () => api!.addAsset({ id: 'new', type: 'everyday', label: 'Bills account', currentValue: 500, includeInMoneyCalculations: true } as never), update: () => api!.updateAsset('new', { currentValue: 650 }), remove: () => api!.deleteAsset('new'), present: (d) => d.assets.some((a) => a.id === 'new'), updated: (d) => d.assets.find((a) => a.id === 'new')?.currentValue === 650 },
  ...(['mortgage', 'car_loan', 'personal_loan', 'other'] as Liability['type'][]).map((type): Family => ({ name: `liability: ${type}`, add: () => api!.addLiability({ id: 'new', type, label: `New ${type}`, currentBalance: 1234.56 } as never), update: () => api!.updateLiability('new', { currentBalance: 1000 }), remove: () => api!.deleteLiability('new'), present: (d) => d.liabilities.some((l) => l.id === 'new'), updated: (d) => d.liabilities.find((l) => l.id === 'new')?.currentBalance === 1000 })),
  { name: 'liability: bnpl', add: () => api!.saveBnplPlan({ mode: 'create', liability: { label: 'Zip', provider: 'Zip', currentBalance: 300 }, schedule: { amount: 75, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 30) }, ids: { liabilityId: 'new', recurringItemId: 'new-pay' } } as never).persistence, update: () => api!.saveBnplPlan({ mode: 'update', liabilityId: 'new', liability: { label: 'Zip', provider: 'Zip', currentBalance: 225 }, schedule: 'unchanged', newRecurringItemId: 'unused' } as never).persistence, remove: () => api!.deleteLiability('new'), present: (d) => d.liabilities.some((l) => l.id === 'new'), updated: (d) => d.liabilities.find((l) => l.id === 'new')?.currentBalance === 225 },
];

describe('D0 §1 — durable add / update / delete for every entity family, across a real restart', () => {
  test.each(families().map((f) => [f.name]))('%s', async (name) => {
    const f = families().find((x) => x.name === name)!;
    await seedAndLaunch();
    const start = picture(api!.data, false);
    for (const [step, run, check] of [['add', f.add, f.present], ['update', f.update, f.updated]] as [string, () => Promise<void>, (d: AppData) => boolean][]) {
      const w = writes();
      await act(async () => { await run(); });
      expect([step, check(api!.data)]).toEqual([step, true]);
      expect(writes()).toBe(w + 1); // one durable mutation = one write
      expect(check(await stored())).toBe(true);
      await launch();
      expect([step, 'after restart', check(api!.data)]).toEqual([step, 'after restart', true]);
    }
    // An Add retried with the same identity is idempotent: nothing is written, nothing duplicated.
    const beforeRetry = writes();
    await act(async () => { await f.add(); });
    expect(writes()).toBe(beforeRetry);
    await act(async () => { await f.remove(); });
    expect(f.present(api!.data)).toBe(false);
    await launch();
    expect(f.present(api!.data)).toBe(false);
    if (name !== 'liability: bnpl') expect(picture(api!.data, false)).toBe(start); // BNPL keeps its deactivated schedule, by existing design
    // A repeated Delete is a no-op, never a second effect.
    const w = writes();
    await act(async () => { await f.remove(); });
    expect(writes()).toBe(w);
  }, 120000);
});

describe('D0 §2 — a rejected write changes nothing, is never resurrected, and a retry lands once', () => {
  test.each(families().map((f) => [f.name]))('%s: rejected add, update and delete', async (name) => {
    const f = families().find((x) => x.name === name)!;
    await seedAndLaunch();
    for (const step of ['add', 'update', 'delete'] as const) {
      const run = step === 'add' ? f.add : step === 'update' ? f.update : f.remove;
      const before = picture(api!.data);
      const storedBefore = await AsyncStorage.getItem(STORAGE_KEY);
      rejectNextWrite();
      let rejected = false;
      await act(async () => { await run().catch(() => { rejected = true; }); });
      expect([step, rejected]).toEqual([step, true]);
      expect(picture(api!.data)).toBe(before); // memory: exactly as it was
      expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(storedBefore); // storage: exactly as it was
      // A later unrelated successful write must not carry the rejected mutation.
      await act(async () => { api!.updateUser({ name: `after-${step}` }); });
      await settle();
      const s = await stored();
      expect(s.user.name).toBe(`after-${step}`);
      expect(picture(s)).toBe(picture(api!.data)); // storage = memory
      await launch(); // restart through the real adapter
      expect(picture(api!.data, false)).toBe(picture(JSON.parse(storedBefore!), false)); // the rejected mutation is nowhere
      // Retry: exactly one result.
      await act(async () => { await run(); });
      await launch();
      if (step === 'delete') expect(f.present(api!.data)).toBe(false);
      else expect(step === 'add' ? f.present(api!.data) : f.updated(api!.data)).toBe(true);
      expect(api!.data.recurringItems.filter((r) => r.id === 'new').length + api!.data.creditCards.filter((c) => c.id === 'new').length + api!.data.assets.filter((a) => a.id === 'new').length + api!.data.liabilities.filter((l) => l.id === 'new').length).toBe(step === 'delete' ? 0 : 1);
    }
  }, 180000);
});

describe('D0 §3 — overlapping durable writes', () => {
  const addA = () => api!.addRecurringItem({ type: 'expense', label: 'A', amount: 10, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true } as Omit<RecurringItem, 'id'>, { id: 'A' });
  const addB = () => api!.addAsset({ id: 'B', type: 'savings', label: 'B', currentValue: 5, includeInMoneyCalculations: false } as never);
  const has = (d: AppData) => `${d.recurringItems.some((r) => r.id === 'A') ? 'A' : ''}${d.assets.some((a) => a.id === 'B') ? 'B' : ''}`;

  test.each([['the first operation resolves first', 0], ['the second storage write is released first', 1]] as [string, number][])('both results survive when %s; memory = storage = rehydrated', async (_label, order) => {
    await seedAndLaunch();
    const releaseFirst = gateNextWrite();
    const releaseSecond = gateNextWrite();
    let a: Promise<void>; let b: Promise<void>;
    await act(async () => { a = addA(); b = addB(); });
    expect(has(api!.data)).toBe(''); // write-first: nothing committed while unresolved
    await act(async () => {
      if (order === 0) { releaseFirst(); await a!; releaseSecond(); } else { releaseSecond(); releaseFirst(); }
      await Promise.all([a!, b!]);
    });
    await settle();
    expect(has(api!.data)).toBe('AB');
    expect(has(await stored())).toBe('AB');
    expect(JSON.stringify((await stored()).recurringItems)).toBe(JSON.stringify(api!.data.recurringItems));
    await launch();
    expect(has(api!.data)).toBe('AB');
  }, 60000);

  test.each([['the first fails', 'first'], ['the second fails', 'second']] as [string, string][])('one succeeds while %s: the survivor lands, the failure leaves nothing, in memory, storage and after restart', async (_l, failing) => {
    await seedAndLaunch();
    if (failing === 'first') rejectNextWrite();
    else { const real = setItem().getMockImplementation()!; setItem().mockImplementationOnce((k: string, v: string) => real(k, v)).mockImplementationOnce(() => Promise.reject(new Error('disk full'))); }
    const results: string[] = [];
    await act(async () => {
      const a = addA().then(() => results.push('A ok'), () => results.push('A failed'));
      const b = addB().then(() => results.push('B ok'), () => results.push('B failed'));
      await Promise.all([a, b]);
    });
    await settle();
    const expected = failing === 'first' ? 'B' : 'A';
    expect(results.sort()).toEqual(failing === 'first' ? ['A failed', 'B ok'] : ['A ok', 'B failed']);
    expect(has(api!.data)).toBe(expected);
    expect(has(await stored())).toBe(expected);
    await launch();
    expect(has(api!.data)).toBe(expected);
  }, 60000);

  test('an unrelated optimistic update landing mid-write is never overwritten, and the durable mutation still lands exactly once', async () => {
    await seedAndLaunch();
    const release = gateNextWrite();
    let a: Promise<void>;
    await act(async () => { a = addA(); });
    await act(async () => { api!.updateUser({ name: 'Concurrent' }); });
    await act(async () => { release(); await a!; });
    await settle();
    expect(api!.data.user.name).toBe('Concurrent');
    expect(api!.data.recurringItems.filter((r) => r.id === 'A')).toHaveLength(1);
    const s = await stored();
    expect([s.user.name, s.recurringItems.filter((r) => r.id === 'A').length]).toEqual(['Concurrent', 1]);
    await launch();
    expect([api!.data.user.name, api!.data.recurringItems.filter((r) => r.id === 'A').length]).toEqual(['Concurrent', 1]);
  }, 60000);
});

const EDITORS: [string, EditorSpec, string, string, (d: AppData) => unknown, EditorOutcome, EditorOutcome][] = [
  ['income editor', { kind: 'income', id: 'rental' }, 'income-editor', 'income', (d) => d.recurringItems.some((r) => r.id === 'rental'), { outcome: 'saved', operation: 'update', entity: 'income', id: 'rental' }, { outcome: 'deleted', operation: 'delete', entity: 'income', id: 'rental' }],
  ['bill editor', { kind: 'bill', id: 'rent' }, 'bill-editor', 'bill', (d) => d.recurringItems.some((r) => r.id === 'rent'), { outcome: 'saved', operation: 'update', entity: 'bill', id: 'rent' }, { outcome: 'deleted', operation: 'delete', entity: 'bill', id: 'rent' }],
  ['card editor', { kind: 'card', id: 'amex' }, 'card-editor', 'credit_card', (d) => d.creditCards.some((c) => c.id === 'amex'), { outcome: 'saved', operation: 'update', entity: 'credit_card', id: 'amex' }, { outcome: 'deleted', operation: 'delete', entity: 'credit_card', id: 'amex' }],
  ['wealth editor (liability)', { kind: 'liability', id: 'car' }, 'wealth-editor', 'liability', (d) => d.liabilities.some((l) => l.id === 'car'), { outcome: 'saved', operation: 'update', entity: 'liability', id: 'car' }, { outcome: 'deleted', operation: 'delete', entity: 'liability', id: 'car' }],
];

describe('D0 §4 — the four shared editors', () => {
  test.each(EDITORS)('%s — Save: pending, refused dismissal, failure keeps the editor, retry, ONE outcome, one close', async (_n, spec, prefix) => {
    const user = userEvent.setup();
    await seedAndLaunch(spec);
    const before = picture(api!.data);
    // 1. A rejected write.
    rejectNextWrite();
    await user.press(screen.getByTestId(`${prefix}-save`));
    expect(await screen.findByTestId(`${prefix}-status-error`)).toHaveTextContent(EDITOR_SAVE_FAILED_COPY, { exact: false }); // the row also holds a decorative alert glyph
    expect(screen.getByTestId('probe-open')).toHaveTextContent('open');
    expect(outcomes).toEqual([]);
    expect(closes).toBe(0);
    expect(picture(api!.data)).toBe(before);
    // 2. Retry, held pending: Saving… is shown, the control is busy and dismissal is refused.
    const release = gateNextWrite();
    await user.press(screen.getByTestId(`${prefix}-save`));
    expect(await screen.findByTestId(`${prefix}-status-pending`)).toHaveTextContent('Saving…');
    const save = screen.getByTestId(`${prefix}-save`);
    expect(save.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(save.props.accessibilityLabel).toBe('Saving…');
    expect(screen.queryByTestId(`${prefix}-status-error`)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Cancel' })); // refused while the write is unresolved
    await user.press(save); // a second Save while pending is ignored
    expect(screen.getByTestId('probe-open')).toHaveTextContent('open');
    expect(outcomes).toEqual([]);
    const w = writes();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId('probe-open')).toHaveTextContent('closed'));
    expect(writes()).toBe(w); // the held write was the ONLY write
    expect(outcomes).toHaveLength(1);
    expect(closes).toBe(1);
  }, 120000);

  test.each(EDITORS)('%s — the saved outcome carries identity only', async (_n, spec, prefix, _e, _present, saved) => {
    const user = userEvent.setup();
    await seedAndLaunch(spec);
    await user.press(screen.getByTestId(`${prefix}-save`));
    await waitFor(() => expect(screen.getByTestId('probe-open')).toHaveTextContent('closed'));
    expect(outcomes).toEqual([saved]);
    expect(Object.keys(outcomes[0]).sort()).toEqual(['entity', 'id', 'operation', 'outcome']);
  }, 60000);

  test.each(EDITORS)('%s — Cancel: a `dismissed` outcome, zero writes, no success', async (_n, spec) => {
    const user = userEvent.setup();
    await seedAndLaunch(spec);
    const w = writes(); const before = picture(api!.data);
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('probe-open')).toHaveTextContent('closed'));
    await settle();
    expect(outcomes).toEqual([{ outcome: 'dismissed' }]);
    expect(writes()).toBe(w);
    expect(picture(api!.data)).toBe(before);
  }, 60000);

  test.each(EDITORS)('%s — Delete: rejected leaves everything; then Deleting…, one `deleted` outcome, gone after restart', async (_n, spec, prefix, _e, present, _saved, deleted) => {
    const user = userEvent.setup();
    await seedAndLaunch(spec);
    const before = picture(api!.data);
    rejectNextWrite();
    await user.press(screen.getByTestId(`${prefix}-delete`));
    expect(await screen.findByTestId(`${prefix}-status-error`)).toHaveTextContent(EDITOR_DELETE_FAILED_COPY, { exact: false });
    expect(picture(api!.data)).toBe(before);
    expect(outcomes).toEqual([]);
    expect(screen.getByTestId('probe-open')).toHaveTextContent('open');
    const release = gateNextWrite();
    await user.press(screen.getByTestId(`${prefix}-delete`));
    expect(await screen.findByTestId(`${prefix}-status-pending`)).toHaveTextContent('Deleting…');
    expect(screen.getByTestId(`${prefix}-delete`).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await user.press(screen.getByTestId(`${prefix}-delete`)); // double Delete ignored
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId('probe-open')).toHaveTextContent('closed'));
    expect(outcomes).toEqual([deleted]);
    expect(closes).toBe(1);
    expect(present(api!.data)).toBe(false);
    await launch();
    expect(present(api!.data)).toBe(false);
  }, 120000);
});

describe('D0 §5 — a loan with a linked repayment is not deleted', () => {
  test('the editor names the linked bill, writes nothing, stays open; the state layer refuses the same delete', async () => {
    const user = userEvent.setup();
    await seedAndLaunch({ kind: 'liability', id: 'mortgage' });
    const w = writes(); const before = picture(api!.data);
    await user.press(screen.getByTestId('wealth-editor-delete'));
    expect(await screen.findByTestId('wealth-editor-status-error')).toHaveTextContent('This mortgage is linked to Richmond repayment. Review the linked bill before deleting the mortgage.', { exact: false });
    expect(screen.getByTestId('probe-open')).toHaveTextContent('open');
    expect(outcomes).toEqual([]);
    expect(writes()).toBe(w);
    expect(picture(api!.data)).toBe(before);
    let refused: unknown = null;
    await act(async () => { await api!.deleteLiability('mortgage').catch((e) => { refused = e; }); });
    expect(refused).toBeInstanceOf(DurableMutationRefused);
    expect(writes()).toBe(w);
    expect(picture(api!.data)).toBe(before);
    // The existing correction route: remove the linked bill, then the loan.
    await act(async () => { await api!.deleteRecurringItem('richmond'); await api!.deleteLiability('mortgage'); });
    await launch();
    expect(api!.data.liabilities.some((l) => l.id === 'mortgage')).toBe(false);
    expect(api!.data.recurringItems.some((r) => r.id === 'richmond')).toBe(false);
  }, 60000);
});

describe('D0 §6 — callers no longer read closure as success', () => {
  test('the loan-balance nudge is marked handled only by a durably SAVED balance — never by Cancel, never by a failed save', async () => {
    const user = userEvent.setup();
    const d = seedData();
    d.liabilities = d.liabilities.map((l) => (l.id === 'car' ? { ...l, createdAt: new Date(Date.now() - 400 * 86400000).toISOString() } : l));
    await seedAndLaunch({ kind: 'loan-balance-card' }, d);
    const handled = () => api!.data.liabilities.find((l) => l.id === 'car')!.balanceReminderDismissed === true;
    // Cancel: the nudge stays.
    await user.press(await screen.findByText('Update balance'));
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    await settle();
    expect(handled()).toBe(false);
    // A failed save: the nudge stays, the editor stays.
    await user.press(screen.getByText('Update balance'));
    rejectNextWrite();
    await user.press(await screen.findByTestId('wealth-editor-save'));
    expect(await screen.findByTestId('wealth-editor-status-error')).toBeOnTheScreen();
    expect(handled()).toBe(false);
    // Retry succeeds: now, and only now, it is handled — durably.
    await user.press(screen.getByTestId('wealth-editor-save'));
    await waitFor(() => expect(handled()).toBe(true));
    await settle();
    expect((await stored()).liabilities.find((l) => l.id === 'car')!.balanceReminderDismissed).toBe(true);
  }, 60000);
});
