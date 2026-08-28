// A1 — classification SELECTION LIFECYCLE (part 2): link, cancellation, dedup.
//
// Reproduces the founder's device failure and proves the fix through the REAL
// native dismissal order: option press → visibility change (onClose) → native
// Modal.onDismiss → deferred commit. Jest leaves the iOS-only native onDismiss
// inert, so — exactly as the established OptionsSheet suites do — the test
// invokes the presented Modal instance's own onDismiss prop to stand in for the
// OS. It never calls onChoose directly.
//
// Run: npm run test:render

import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { QuickAddModal } from '../../src/components/dashboard/QuickAddModal';
import { createEmptyAppData } from '../../src/lib/storage';
import { occurrenceIdForRecurringItem } from '../../src/lib/calculations/occurrenceSources';
import { resolveOccurrence } from '../../src/lib/calculations/occurrenceResolution';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const todayISO = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(); };

// The classification OptionsSheet is the ONE visible Modal in the tree with a
// FUNCTION onDismiss (KeyboardSheet forwards undefined; the correction sheet is
// not visible). Capture it while the sheet is open, then fire its onDismiss.
function classificationModal(): any {
  const all = (screen as any).root.queryAll((i: any) => typeof i.props?.onDismiss === 'function' && i.props?.visible === true);
  return all.length ? all[all.length - 1] : null;
}

// Drain the async persistence write INSIDE the test's own act() scope (before
// auto-cleanup unmounts) so it can never fire a setState during the next test's
// render — the documented cross-test timer race these heavy suites hit.
async function drain() {
  // Settle the async persistence write to the store AND flush any pending sheet
  // slide-out timers (Animated.timing, ~200ms), so neither a trackWrite .then
  // setState nor a late animation callback can fire during the next test's
  // render (the documented cross-test timer race).
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}').transactions?.length ?? 0).toBe(1));
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
}

function Probe() {
  const { data, isLoading } = useAppState();
  const t = data.transactions[0];
  const bal = (id: string) => data.assets.find((a) => a.id === id)?.currentValue ?? 'na';
  const cardBal = (id: string) => data.creditCards.find((c) => c.id === id)?.currentBalance ?? 'na';
  return (
    <Text testID="probe">
      {`loading:${isLoading}|count:${data.transactions.length}|cba:${bal('cba')}|amex:${cardBal('amex')}|res:${t?.occurrenceResolution?.state ?? 'none'}|repay:${t?.isRepayment ?? 'none'}|card:${t?.creditCardId ?? 'none'}`}
    </Text>
  );
}

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <Probe />
            <QuickAddModal visible initialType="expense" onClose={onClose} />
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

async function seed(opts: { gymCategoryId?: string } = {}) {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  data.assets = [{ id: 'cba', label: 'Main CBA', type: 'everyday', currentValue: 1500, includeInMoneyCalculations: true }] as typeof data.assets;
  data.creditCards = [{ id: 'amex', issuer: 'Amex', label: 'AMEX', creditLimit: 5000, currentBalance: 500, dueDay: 20, minimumPayment: 0 }] as typeof data.creditCards;
  data.recurringItems = [
    { id: 'gym', type: 'expense', label: 'Gym', amount: 150, frequency: 'monthly', nextDueDate: todayISO(), isFixed: true, active: true, ...(opts.gymCategoryId ? { categoryId: opts.gymCategoryId } : {}) },
  ] as typeof data.recurringItems;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function fill(user: ReturnType<typeof userEvent.setup>, categoryMatch: RegExp, sourceChoiceTestID: string) {
  await user.type(await screen.findByLabelText('Transaction name'), 'New d');
  await user.type(screen.getByLabelText('Amount'), '200');
  await user.press(screen.getByLabelText('Category, Select a category'));
  await user.press(await screen.findByLabelText(categoryMatch));
  await user.press(await screen.findByTestId(sourceChoiceTestID));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false));
}

describe('A1 — classification selection lifecycle II: link, cancel, dedup (rendered)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });


  test('§8 matching category — "This is Gym" links ONCE through the real dismissal order; Gym becomes satisfied', async () => {
    const user = userEvent.setup();
    await seed({ gymCategoryId: 'cat-health' });
    await render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(/loading:false/));
    await fill(user, /Health/, 'expense-source-choice-everyday:cba');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Is this payment for a scheduled bill?')).toBeOnTheScreen();

    const modal = classificationModal();
    fireEvent.press(screen.getByText('Gym')); // the candidate row title is the bill name
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(/count:0\|/));
    await act(async () => { modal.props.onDismiss?.(); });

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(/count:1\|/));
    expect(screen.getByTestId('probe')).toHaveTextContent(/cba:1300/);
    expect(screen.getByTestId('probe')).toHaveTextContent(/res:linked/);
    const store = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    const gymOcc = { id: occurrenceIdForRecurringItem(store, store.recurringItems[0], new Date(store.recurringItems[0].nextDueDate)), sourceKind: 'bill' as const, sourceId: 'gym', isRepayment: false };
    expect(resolveOccurrence(gymOcc as any, store.transactions).state).toBe('satisfied');
    await drain();
  }, 45000);

  test('§9 cancellation — a choice-less dismissal writes NOTHING and preserves the draft; Save then works', async () => {
    const user = userEvent.setup();
    await seed({ gymCategoryId: 'cat-health' });
    await render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(/loading:false/));
    await fill(user, /Health/, 'expense-source-choice-everyday:cba');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Is this payment for a scheduled bill?')).toBeOnTheScreen();

    // Dismiss WITHOUT a choice via the native back / swipe path (onRequestClose),
    // then the native completion — the sheet reports a null key.
    const modal = classificationModal();
    await act(async () => { modal.props.onRequestClose?.(); });
    await waitFor(() => expect(screen.queryByText('Is this payment for a scheduled bill?')).toBeNull());
    await act(async () => { modal.props.onDismiss?.(); });
    // Zero writes, balance untouched, draft still open.
    expect(screen.getByTestId('probe')).toHaveTextContent(/count:0\|/);
    expect(screen.getByTestId('probe')).toHaveTextContent(/cba:1500/);

    // Save again → the draft (submittingRef reset) opens the sheet again, and a
    // real selection now commits exactly once.
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Is this payment for a scheduled bill?')).toBeOnTheScreen();
    const modal2 = classificationModal();
    fireEvent.press(screen.getByText('No, save separately'));
    await act(async () => { modal2.props.onDismiss?.(); });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(/count:1\|/));
    expect(screen.getByTestId('probe')).toHaveTextContent(/cba:1300/);
    await drain();
  }, 60000);
});
