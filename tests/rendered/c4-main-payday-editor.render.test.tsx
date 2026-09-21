// Pass C.4C — "Use as my main payday" in the existing Add/Edit Income editor.
// One exclusive identity (user.mainPaydayIncomeId), pending until Save, one
// atomic write, Cancel writes nothing, eligibility explained in plain words.
// The celebration context is mocked so the confirmation can be asserted
// without mounting the toast (whose dismiss timer is a separate, known owner).

import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { AddIncomeModal } from '../../src/components/income/AddIncomeModal';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { localDate } from '../../src/lib/calculations/localCalendar';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockConfirm = jest.fn();
jest.mock('../../src/state/CelebrationContext', () => ({
  useCelebration: () => ({ confirmSaveSuccess: mockConfirm, celebrate: jest.fn(), isModalCelebrationActive: false }),
  CelebrationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const STORAGE_KEY = 'moneycoach.appdata.v1';
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const base = (): AppData => ({ ...createEmptyAppData(), user: { ...createEmptyAppData().user, hasSeenIntro: true, savingsAllocationPromptHandled: true } as any });
const item = (id: string, type: 'income' | 'expense', amount: number, due: string, frequency: RecurringItem['frequency'], label = id, extra: Partial<RecurringItem> = {}): RecurringItem =>
  ({ id, type, label, amount, frequency, nextDueDate: due, isFixed: true, active: true, ...extra } as RecurringItem);
const writes = () => (AsyncStorage.setItem as jest.Mock).mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const stored = async (): Promise<AppData> => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);

function three(main: string | null | undefined = 'salary'): AppData {
  const d = base();
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 10700, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [
    item('salary', 'income', 4000, iso(2099, 9, 21), 'fortnightly', 'Salary boq'),
    item('rental', 'income', 3000, iso(2099, 9, 30), 'monthly', 'Rental income'),
    item('gig', 'income', 500, iso(2099, 9, 22), 'irregular', 'Gig work', { nextDueDateUnknown: true }),
    item('rent', 'expense', 1000, iso(2099, 9, 21), 'weekly', 'Rent'),
  ];
  if (main !== undefined) d.user = { ...d.user, mainPaydayIncomeId: main } as typeof d.user;
  return syncIncomeAggregate(d);
}
function one(): AppData {
  const d = base();
  d.assets = [{ id: 'Main', type: 'everyday', label: 'Main', currentValue: 10700, includeInMoneyCalculations: true } as Asset];
  d.recurringItems = [item('salary', 'income', 4000, iso(2099, 9, 21), 'fortnightly', 'Salary boq')];
  return syncIncomeAggregate(d);
}

function Editor({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const { data, isLoading } = useAppState() as any;
  const editItem = editId ? data.recurringItems.find((r: RecurringItem) => r.id === editId) ?? null : null;
  return (
    <>
      <Text testID="probe-loading">{String(isLoading)}</Text>
      <Text testID="probe-main">{String(data.user.mainPaydayIncomeId ?? 'none')}</Text>
      <Text testID="probe-freq">{String(data.user.payFrequency)}</Text>
      <Text testID="probe-next">{String(data.user.nextPayday ?? 'null')}</Text>
      <Text testID="probe-incomes">{data.recurringItems.filter((r: RecurringItem) => r.type === 'income' && r.active).map((r: RecurringItem) => `${r.id}:${r.amount}`).join(',')}</Text>
      {isLoading || (editId && !editItem) ? null : <AddIncomeModal visible editItem={editItem} onClose={onClose} />}
    </>
  );
}
function Harness({ editId }: { editId: string | null }) {
  const [open, setOpen] = React.useState(true);
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <SavingsAllocationPromptProvider>
            {open ? <Editor editId={editId} onClose={() => setOpen(false)} /> : <Text testID="closed">closed</Text>}
            {open ? null : <ClosedProbe />}
          </SavingsAllocationPromptProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
function ClosedProbe() {
  const { data } = useAppState() as any;
  return (
    <>
      <Text testID="probe-main">{String(data.user.mainPaydayIncomeId ?? 'none')}</Text>
      <Text testID="probe-freq">{String(data.user.payFrequency)}</Text>
      <Text testID="probe-incomes">{data.recurringItems.filter((r: RecurringItem) => r.type === 'income' && r.active).map((r: RecurringItem) => `${r.id}:${r.amount}`).join(',')}</Text>
    </>
  );
}
async function seed(data: AppData) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
const toggle = () => screen.getByTestId('income-main-payday-toggle');

describe('C.4C — Use as my main payday', () => {
  beforeEach(() => { mockConfirm.mockClear(); });

  test('editing ANOTHER eligible source: unticked by default; ticking is pending; Save replaces the previous id in ONE write and confirms "Main payday updated" after it', async () => {
    const user = userEvent.setup();
    await seed(three('salary'));
    await render(<Harness editId="rental" />);
    await screen.findByText('Edit income source');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('salary');
    expect(toggle().props.accessibilityState).toEqual({ selected: false, checked: false, disabled: false });
    expect(screen.getByText('Use as my main payday')).toBeOnTheScreen();
    expect(screen.getByTestId('income-main-payday-support')).toHaveTextContent('Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.'); // C.5.1 copy
    const before = writes();
    await user.press(toggle());
    expect(toggle().props.accessibilityState).toEqual({ selected: true, checked: true, disabled: false });
    expect(screen.getByTestId('probe-main')).toHaveTextContent('salary'); // pending only
    expect(writes()).toBe(before);
    let writesAtConfirm = -1;
    mockConfirm.mockImplementation(() => { writesAtConfirm = writes(); });
    await user.press(screen.getByText('Save'));
    await screen.findByTestId('closed');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('rental');
    expect(screen.getByTestId('probe-freq')).toHaveTextContent('monthly'); // the pay cycle follows the new source
    expect(writes()).toBe(before + 1); // the edit and the replacement are one write
    expect(writesAtConfirm).toBe(before + 1); // confirmation only after the authoritative save
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0].title).toBe('Main payday updated');
    const persisted = await stored();
    expect(persisted.user.mainPaydayIncomeId).toBe('rental');
    expect(persisted.recurringItems.filter((r) => r.type === 'income').map((r) => r.id).sort()).toEqual(['gig', 'rental', 'salary']); // nothing dropped or duplicated
    expect(persisted.recurringItems.some((r: any) => 'isMain' in r || 'primary' in r || 'isMainPayday' in r)).toBe(false); // no per-income flag
  }, 60000);

  test('Cancel after ticking writes neither the income edit nor the pending selection', async () => {
    const user = userEvent.setup();
    await seed(three('salary'));
    await render(<Harness editId="rental" />);
    await screen.findByText('Edit income source');
    const before = writes();
    const snapshot = await AsyncStorage.getItem(STORAGE_KEY);
    await user.press(toggle());
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t: any, _m: any, buttons: any) => { const discard = (buttons ?? []).find((b: any) => b.style === 'destructive') ?? (buttons ?? [])[buttons.length - 1]; discard?.onPress?.(); });
    await user.press(screen.getByText('Cancel'));
    await screen.findByTestId('closed');
    expect(alert).toHaveBeenCalled(); // the pending tick counts as an unsaved change
    alert.mockRestore();
    expect(screen.getByTestId('probe-main')).toHaveTextContent('salary');
    expect(writes()).toBe(before);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(snapshot);
    expect(mockConfirm).not.toHaveBeenCalled();
  }, 60000);

  test('the CURRENT main source shows selected and cannot be unticked into a no-main state; saving an unrelated field keeps the id and says "Income updated"', async () => {
    const user = userEvent.setup();
    await seed(three('salary'));
    await render(<Harness editId="salary" />);
    await screen.findByText('Edit income source');
    expect(toggle().props.accessibilityState).toEqual({ selected: true, checked: true, disabled: false });
    expect(screen.getByTestId('income-main-payday-support')).toHaveTextContent('This is your main payday. To change it, choose another income as your main payday.');
    await user.press(toggle());
    expect(toggle().props.accessibilityState).toEqual({ selected: true, checked: true, disabled: false }); // still selected
    const before = writes();
    await user.clear(screen.getByDisplayValue('Salary boq'));
    await user.type(screen.getByPlaceholderText('e.g. Salary'), 'Salary BOQ');
    await user.press(screen.getByText('Save'));
    await screen.findByTestId('closed');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('salary');
    expect(writes()).toBe(before + 1);
    expect(mockConfirm.mock.calls[0][0].title).toBe('Income updated');
    expect((await stored()).recurringItems.find((r) => r.id === 'salary')!.label).toBe('Salary BOQ');
  }, 60000);

  test('irregular / undated source cannot be selected; the reason is stated in plain language', async () => {
    const user = userEvent.setup();
    await seed(three('salary'));
    await render(<Harness editId="gig" />);
    await screen.findByText('Edit income source');
    expect(toggle().props.accessibilityState).toEqual({ selected: false, checked: false, disabled: true });
    expect(screen.getByTestId('income-main-payday-support')).toHaveTextContent('Irregular income doesn’t have a predictable payday, so it can’t set your pay-cycle date.');
    const before = writes();
    await user.press(toggle());
    expect(toggle().props.accessibilityState.checked).toBe(false);
    expect(writes()).toBe(before);
  }, 60000);

  test('a pending tick is withdrawn when the form becomes ineligible (switching to Irregular) — Save then leaves the authority alone', async () => {
    const user = userEvent.setup();
    await seed(three('salary'));
    await render(<Harness editId="rental" />);
    await screen.findByText('Edit income source');
    await user.press(toggle());
    await user.press(screen.getByText('Irregular recurring'));
    expect(toggle().props.accessibilityState).toEqual({ selected: false, checked: false, disabled: true });
    await user.press(screen.getByText('Save'));
    await screen.findByTestId('closed');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('salary');
    expect(mockConfirm.mock.calls[0][0].title).toBe('Income updated');
  }, 60000);

  test('exactly one income: automatic authority, an explanatory line instead of a control, and saving an unrelated field persists NO id', async () => {
    const user = userEvent.setup();
    await seed(one());
    await render(<Harness editId="salary" />);
    await screen.findByText('Edit income source');
    expect(screen.queryByTestId('income-main-payday-toggle')).toBeNull();
    expect(screen.getByTestId('income-main-payday-auto')).toHaveTextContent('This is your only regular income, so it sets your pay-cycle date automatically.');
    await user.clear(screen.getByDisplayValue('Salary boq'));
    await user.type(screen.getByPlaceholderText('e.g. Salary'), 'Pay');
    await user.press(screen.getByText('Save'));
    await screen.findByTestId('closed');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('none');
    const persisted = await stored();
    expect(persisted.user.mainPaydayIncomeId ?? null).toBeNull();
    expect(persisted.user.payFrequency).toBe('fortnightly'); // still derived automatically
  }, 60000);

  test('stale id (deleted source): fail-closed until the customer chooses — ticking in the editor is that explicit choice', async () => {
    const user = userEvent.setup();
    await seed(three('ghost'));
    await render(<Harness editId="rental" />);
    await screen.findByText('Edit income source');
    expect(screen.getByTestId('probe-next')).toHaveTextContent('null'); // fail closed, nothing inferred
    expect(toggle().props.accessibilityState.checked).toBe(false);
    await user.press(toggle());
    await user.press(screen.getByText('Save'));
    await screen.findByTestId('closed');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('rental');
  }, 60000);
});

function AddProbe() {
  const { data, addRecurringItem, isLoading } = useAppState() as any;
  const { TouchableOpacity } = require('react-native');
  const payload = (frequency: string, extra: object = {}) => ({ type: 'income', label: 'Side gig', amount: 700, frequency, nextDueDate: iso(2099, 9, 25), isFixed: true, active: true, ...extra });
  return (
    <>
      <Text testID="probe-loading">{String(isLoading)}</Text>
      <Text testID="probe-main">{String(data.user.mainPaydayIncomeId ?? 'none')}</Text>
      <Text testID="probe-next">{String(data.user.nextPayday ?? 'null')}</Text>
      <Text testID="probe-side">{String(data.recurringItems.find((r: RecurringItem) => r.label === 'Side gig')?.id ?? 'none')}</Text>
      <TouchableOpacity testID="add-as-main" onPress={() => addRecurringItem(payload('weekly'), { setAsMainPayday: true })}><Text>a</Text></TouchableOpacity>
      <TouchableOpacity testID="add-plain" onPress={() => addRecurringItem(payload('weekly'))}><Text>b</Text></TouchableOpacity>
      <TouchableOpacity testID="add-irregular-as-main" onPress={() => addRecurringItem(payload('irregular', { nextDueDateUnknown: true }), { setAsMainPayday: true })}><Text>c</Text></TouchableOpacity>
    </>
  );
}
const AddHarness = () => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <AppStateProvider><ThemeProvider><AddProbe /></ThemeProvider></AppStateProvider>
  </SafeAreaProvider>
);

describe('C.4C — adding a source', () => {
  beforeEach(() => { mockConfirm.mockClear(); });
  test('add form: no control for the very first income; an unticked control once another active income exists', async () => {
    await seed(base());
    const first = await render(<Harness editId={null} />);
    await screen.findByText('Add income source');
    expect(screen.queryByTestId('income-main-payday-toggle')).toBeNull();
    expect(screen.queryByTestId('income-main-payday-auto')).toBeNull();
    await first.unmount();
    await seed(one());
    await render(<Harness editId={null} />);
    await screen.findByText('Add income source');
    // Undated draft → offered but not yet selectable, with the reason.
    expect(toggle().props.accessibilityState).toEqual({ selected: false, checked: false, disabled: true });
    expect(screen.getByTestId('income-main-payday-support')).toHaveTextContent('Add a next expected payment date to use this income as your main payday.');
  }, 60000);
  test('adding a second source AS the main payday: the new id becomes the authority in the SAME single write', async () => {
    const user = userEvent.setup();
    await seed(one());
    await render(<AddHarness />);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
    const before = writes();
    await user.press(screen.getByTestId('add-as-main'));
    await waitFor(() => expect(screen.getByTestId('probe-side')).not.toHaveTextContent('none'));
    const id = String(screen.getByTestId('probe-side').props.children);
    expect(screen.getByTestId('probe-main')).toHaveTextContent(id);
    expect(writes()).toBe(before + 1);
    expect((await stored()).user.mainPaydayIncomeId).toBe(id);
  }, 60000);
  test('adding a second source WITHOUT choosing: the inferred single-source payday is not preserved — fail closed until the customer chooses', async () => {
    const user = userEvent.setup();
    await seed(one());
    await render(<AddHarness />);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('probe-next')).not.toHaveTextContent('null'); // automatic single-source authority
    await user.press(screen.getByTestId('add-plain'));
    await waitFor(() => expect(screen.getByTestId('probe-side')).not.toHaveTextContent('none'));
    expect(screen.getByTestId('probe-main')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-next')).toHaveTextContent('null');
  }, 60000);
  test('the authority ignores the option for an ineligible source (irregular, undated)', async () => {
    const user = userEvent.setup();
    await seed(one());
    await render(<AddHarness />);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
    await user.press(screen.getByTestId('add-irregular-as-main'));
    await waitFor(() => expect(screen.getByTestId('probe-side')).not.toHaveTextContent('none'));
    expect(screen.getByTestId('probe-main')).toHaveTextContent('none');
  }, 60000);
});

describe('C.4C — restart persistence and financial invariants', () => {
  test('after a persisted replacement a fresh launch resolves the same id; a fixed target estimate is identical before and after', async () => {
    const before = three('salary');
    const after = syncIncomeAggregate({ ...before, user: { ...before.user, mainPaydayIncomeId: 'rental' } });
    await seed(after);
    await render(<Harness editId="rental" />);
    await screen.findByText('Edit income source');
    expect(screen.getByTestId('probe-main')).toHaveTextContent('rental');
    expect(screen.getByTestId('income-main-payday-toggle').props.accessibilityState.checked).toBe(true);
    const asOf = localDate(2099, 9, 18), target = localDate(2099, 10, 20);
    const a = computeLookAheadProjection(before, asOf, target), b = computeLookAheadProjection(after, asOf, target);
    expect(a.available && b.available).toBe(true);
    if (a.available && b.available) {
      expect(b.targetCents).toBe(a.targetCents);
      expect(b.breakdown).toEqual(a.breakdown);
      expect(b.checkpoints).toEqual(a.checkpoints);
    }
    const ids = (d: AppData) => computeProjectedEvents(d, asOf, target, { windowStart: asOf }).events.map((e) => `${e.occurrenceId}|${e.signedCents}`);
    expect(ids(after)).toEqual(ids(before)); // no income occurrence dropped or duplicated
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('false'));
  }, 60000);
});
