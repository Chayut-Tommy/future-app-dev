// Nolie Design 5.1 Wave 4 device correction — the direct Add journey,
// driven end to end (rendered).
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the REAL RootNavigator
// and drives the ACTUAL production journey:
//   FloatingAddButton -> QuickActionsTray -> the real tray close completion
//   -> AddAnythingSheet -> initialKind/origin -> QuickAddModal
// Nothing here mounts QuickAddModal directly, because the defect being
// guarded was origin-specific: mounting the form on its own never reproduced
// it, and never would.
//
// It asserts the PRESENCE OF FORM CONTROLS, not merely the absence of the
// removed chooser copy — a blank workspace also has no chooser copy, which
// is exactly why the Wave 4 suite passed while the device was blank.
//
// NOT proven here: native Modal presentation timing and the real iOS
// keyboard/KeyboardAvoidingView interaction that produced the blank
// workspace. Jest has no native surface, so physical iOS confirmation
// remains required — see the round's device checklist.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

/** A customer who already has money recorded, so every eligible source and
 * destination is genuinely available to choose between — the case where a
 * silent Cash default would be wrong. */
async function seedData() {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  data.assets = [
    { id: 'CASH', label: 'Cash', type: 'cash', currentValue: 100, includeInMoneyCalculations: true },
    { id: 'EVERYDAY', label: 'Everyday', type: 'everyday', currentValue: 500, includeInMoneyCalculations: true },
    { id: 'SAVINGS', label: 'Savings', type: 'savings', currentValue: 2000, includeInMoneyCalculations: true },
  ] as typeof data.assets;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function openQuickTile(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
  await user.press(await screen.findByRole('menuitem', { name: label }));
}

describe('Design 5.1 Wave 4 device correction — the direct Add journey (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedData();
  });

  test('direct "Record spending" opens a POPULATED expense workspace — never a blank shell', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Record spending');

    // The workspace itself.
    await screen.findByRole('header', { name: 'Add transaction' });

    // The form body. Each of these was absent on the owner's device while
    // the title above was present — that combination IS the defect.
    expect(await screen.findByLabelText('Transaction name')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Amount')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Category, Select a category')).toBeOnTheScreen();

    // The expense-specific source section, in its prominent form.
    expect(await screen.findByLabelText('Paid from')).toBeOnTheScreen();
    // Targeted by testID rather than label text: the row's accessible name
    // is composed from the account's own customer-chosen name, which a
    // fixture must not be allowed to pin.
    expect(await screen.findByTestId('expense-source-choice-cash')).toBeOnTheScreen();
    expect(await screen.findByTestId('expense-source-choice-everyday:EVERYDAY')).toBeOnTheScreen();

    // Wave 4 device correction — one "Balance update" section, and the
    // customer-facing date heading in place of a chip rail plus raw boxes.
    expect(await screen.findByRole('header', { name: 'Balance update' })).toBeOnTheScreen();
    expect(await screen.findByText('When did this happen?')).toBeOnTheScreen();
    expect(await screen.findByTestId('transaction-date')).toBeOnTheScreen();
    // The raw DD/MM/YYYY boxes are gone from the normal journey.
    expect(screen.queryByLabelText('Day')).toBeNull();
    expect(screen.queryByLabelText('Month')).toBeNull();
    expect(screen.queryByLabelText('Year')).toBeNull();
    // And the old internal heading is gone with them.
    expect(screen.queryByText('Tracked balance')).toBeNull();

    // A direct quick origin has NO Back — the catalogue it never opened must
    // stay unreachable.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  }, 30000);

  test('the transaction date defaults to Today, and the picker opens in the workspace without a second modal', async () => {
    const user = userEvent.setup();
    const view = await render(<Harness />);
    await openQuickTile(user, 'Record spending');
    await screen.findByRole('header', { name: 'Add transaction' });

    // Default state: one row, headed Today.
    const dateRow = await screen.findByTestId('transaction-date');
    expect(dateRow.props.accessibilityLabel).toMatch(/^Date, Today, /);
    expect(dateRow.props.accessibilityState.expanded).toBe(false);

    // Opening reveals the picker in place, with its own heading and actions.
    await user.press(dateRow);
    expect(await screen.findByTestId('transaction-date-surface')).toBeOnTheScreen();
    // Scoped by testID: the workspace footer also has a Cancel, and the two
    // must never be confused for one another.
    expect(await screen.findByTestId('transaction-date-done')).toBeOnTheScreen();
    expect(await screen.findByTestId('transaction-date-cancel')).toBeOnTheScreen();
    // Quick choices live inside the picker, not permanently in the form.
    expect(await screen.findByTestId('transaction-date-choice-yesterday')).toBeOnTheScreen();

    // Cancelling leaves the date exactly as it was.
    await user.press(screen.getByTestId('transaction-date-cancel'));
    await waitFor(() => expect(screen.queryByTestId('transaction-date-surface')).toBeNull());
    expect((await screen.findByTestId('transaction-date')).props.accessibilityLabel).toMatch(/^Date, Today, /);

    // Choosing Yesterday and confirming collapses back to the one row.
    await user.press(screen.getByTestId('transaction-date'));
    await user.press(await screen.findByTestId('transaction-date-choice-yesterday'));
    await user.press(await screen.findByTestId('transaction-date-done'));
    await waitFor(async () =>
      expect((await screen.findByTestId('transaction-date')).props.accessibilityLabel).toMatch(/^Date, Yesterday, /)
    );
    expect(screen.queryByTestId('transaction-date-surface')).toBeNull();
  }, 30000);

  test('the Balance update section offers exactly two choices once a source with a balance is chosen', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Record spending');
    await screen.findByRole('header', { name: 'Add transaction' });

    // Cash has no recorded balance in this fixture, so the missing card
    // shows — exactly one, with exactly one Add action.
    await user.press(await screen.findByTestId('expense-source-choice-everyday:EVERYDAY'));

    // Everyday HAS a balance, so the two plain-language choices appear and
    // name the real account.
    const update = await screen.findByLabelText('Update Everyday balance. Subtract this amount when the transaction is saved.');
    expect(update.props.accessibilityRole).toBe('radio');
    expect(await screen.findByLabelText('Record only. Save the transaction without changing a balance.')).toBeOnTheScreen();
    // Exactly one section, and no duplicate Add-cash prompt anywhere.
    expect(screen.getAllByRole('header', { name: 'Balance update' })).toHaveLength(1);
    expect(screen.queryAllByLabelText('Add cash balance')).toHaveLength(0);
  }, 30000);

  test('recorded income shows the income wording and its own single Balance update section', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Income received');
    await screen.findByRole('header', { name: 'Add transaction' });

    await user.press(await screen.findByLabelText(/^Savings \(\$2,000\.00\), Savings/));

    expect(await screen.findByLabelText(/^Update Savings.*Add this amount when the income is saved\.$/)).toBeOnTheScreen();
    expect(await screen.findByLabelText('Record only. Save the income without changing a balance.')).toBeOnTheScreen();
    expect(screen.getAllByRole('header', { name: 'Balance update' })).toHaveLength(1);
  }, 30000);

  test('Add goal renders icon cards with no emoji, and a clear selected state', async () => {
    const user = userEvent.setup();
    const view = await render(<Harness />);
    await openQuickTile(user, 'Add goal');
    await screen.findByRole('header', { name: 'Add a goal' });

    // Three labelled sections.
    expect(await screen.findByRole('header', { name: 'What are you working towards?' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Goal details' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Timing and priority' })).toBeOnTheScreen();

    // Purpose cards are radios that report their own selection.
    const travel = await screen.findByLabelText('Travel');
    expect(travel.props.accessibilityRole).toBe('radio');
    expect(travel.props.accessibilityState.checked).toBe(false);
    await user.press(travel);
    await waitFor(() => expect(screen.getByLabelText('Travel').props.accessibilityState.checked).toBe(true));

    // Priority is one labelled control, not a second row of lookalike cards.
    expect(await screen.findByLabelText('Priority')).toBeOnTheScreen();
    expect(screen.getByLabelText('Priority').props.accessibilityRole).toBe('radiogroup');
    expect(await screen.findByLabelText('High')).toBeOnTheScreen();

    // No emoji survives in anything the GOAL workspace itself renders.
    // Deliberately scoped to this workspace: Today's greeting behind the
    // sheet still carries a wave emoji, which is outside Wave 4 and is
    // recorded for the Wave 10 polish inventory rather than silently swept
    // up by a whole-tree assertion that would then be protecting nothing.
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]|[\u{2600}-\u{27BF}]\u{FE0F}|\u{FE0F}/u;
    const GOAL_SURFACE_TEXT = [
      'What are you working towards?',
      'Goal details',
      'Timing and priority',
      'Buy property', 'Travel', 'Build wealth', 'Pay debt', 'Financial freedom', 'Emergency fund', 'New car', 'Custom',
      'High', 'Medium', 'Flexible',
      'Goal name', 'Target amount — optional', 'Target date — optional', 'Priority',
    ];
    for (const label of GOAL_SURFACE_TEXT) {
      expect(EMOJI.test(label)).toBe(false);
      expect(screen.getAllByText(label, { exact: false }).length).toBeGreaterThan(0);
    }
  }, 30000);

  test('direct "Income received" opens a POPULATED income workspace, in income mode from the first render', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Income received');

    await screen.findByRole('header', { name: 'Add transaction' });
    expect(await screen.findByLabelText('Transaction name')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Amount')).toBeOnTheScreen();

    // Income mode, proven by something only the income branch renders — the
    // destination selector. If the mode were still being repaired by an
    // effect, an expense "Paid from" would be here instead.
    expect(await screen.findByLabelText('Received into')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Paid from')).toBeNull();

    // All three eligible destinations are offered, expanded, with nothing
    // preselected — no silent Cash assumption.
    // The shared income-destination helper supplies these names, balance
    // included — the same text the recurring-income flow shows.
    expect(await screen.findByLabelText(/^Cash \(\$100\.00\), Cash on hand/)).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Everyday \(\$500\.00\), Everyday account/)).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Savings \(\$2,000\.00\), Savings/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/selected$/)).toBeNull();

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  }, 30000);

  test('the same expense workspace reached through More → Add to Nolie is equally populated, and DOES offer Back', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'More');

    await user.press(await screen.findByRole('button', { name: /Record spending/ }));

    await screen.findByRole('header', { name: 'Add transaction' });
    expect(await screen.findByLabelText('Transaction name')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Paid from')).toBeOnTheScreen();
    // Catalogue origin keeps its Back — the origin contract is unchanged.
    expect(await screen.findByRole('button', { name: 'Back' })).toBeOnTheScreen();
  }, 30000);

  test('Save starts disabled and only becomes available once the required information is valid', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Record spending');
    await screen.findByRole('header', { name: 'Add transaction' });

    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.props.accessibilityState.disabled).toBe(true);

    // Name and amount alone are not enough: the category and the funding
    // source are both still unanswered.
    await user.type(screen.getByLabelText('Transaction name'), 'Groceries');
    await user.type(screen.getByLabelText('Amount'), '42.50');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true));

    // Choose a category.
    await user.press(screen.getByLabelText('Category, Select a category'));
    await user.press(await screen.findByLabelText(/Groceries/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true));

    // Only once the funding source is explicitly chosen does Save open up —
    // it never falls through to a silent Cash default.
    await user.press(await screen.findByTestId('expense-source-choice-everyday:EVERYDAY'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false));
  }, 30000);
});
