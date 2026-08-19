// Nolie Design 5.1 Wave 4 closure — every Add date entry point, driven
// through the real production journey (rendered).
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the REAL RootNavigator
// and drives the actual floating Add journey to each form, then opens that
// form's date control for real. Nothing here checks source text — the
// structural inventory lives in tests/design5-wave4-picker-inventory.ts and
// the two are deliberately complementary.
//
// The specific defect being guarded: the bill form used to expand an inline
// calendar beneath the form while the numeric keyboard could still be up, so
// it landed below the fold. These tests assert the picker surface exists,
// carries its own heading and actions, and commits only on Done.
//
// Every post-interaction assertion is AWAITED: this environment commits
// fireEvent/userEvent-driven state updates asynchronously.
//
// NOT proven here: real software-keyboard timing on a device. That stays
// iOS device evidence.

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

async function seedData() {
  const data = createEmptyAppData();
  data.user.hasSeenIntro = true;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function openQuickTile(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.press(await screen.findByRole('button', { name: 'Open quick actions' }));
  await user.press(await screen.findByRole('menuitem', { name: label }));
}

async function openCatalogueTask(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await openQuickTile(user, 'More');
  await user.press(await screen.findByRole('button', { name }));
}

/**
 * The Add sheet itself IS one native Modal. The invariant that matters is
 * that opening a picker never adds a SECOND one — which is the documented
 * app-freeze defect (`MOTION_HARD_RULES` rule 2).
 */
function countNativeModals(view: { toJSON: () => unknown }): number {
  return (JSON.stringify(view.toJSON()).match(/"type":"Modal"/g) ?? []).length;
}

/** Every picker, from every entry point, must satisfy the same contract. */
async function expectCanonicalSurface(testID: string) {
  expect(await screen.findByTestId(`${testID}-surface`)).toBeOnTheScreen();
  expect(await screen.findByTestId(`${testID}-done`)).toBeOnTheScreen();
  expect(await screen.findByTestId(`${testID}-cancel`)).toBeOnTheScreen();
}

describe('Design 5.1 Wave 4 closure — every Add date entry point (rendered)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedData();
  });

  test('THE BILL DEFECT: weekly bill Next due date opens the canonical focused surface, not an inline calendar', async () => {
    const user = userEvent.setup();
    const view = await render(<Harness />);
    await openQuickTile(user, 'Add bill');
    await screen.findByRole('header', { name: 'Add a bill' });

    // Switch to weekly — the frequency that used to render an inline
    // <DateTimePicker> underneath the form.
    await user.press(await screen.findByText('Weekly'));

    const trigger = await screen.findByTestId('bill-next-due-date');
    expect(trigger.props.accessibilityLabel).toMatch(/^Next due date, /);
    // Nothing is expanded until asked.
    expect(screen.queryByTestId('bill-next-due-date-surface')).toBeNull();

    await user.press(trigger);
    await expectCanonicalSurface('bill-next-due-date');
    // Its own heading, so the customer knows what they are choosing.
    expect(await screen.findByRole('header', { name: 'Next due date' })).toBeOnTheScreen();
    // Forward-looking only — the old minimumDate rule, preserved.
    expect(await screen.findByTestId('bill-next-due-date-choice-plus-0')).toBeOnTheScreen();
    expect(await screen.findByTestId('bill-next-due-date-choice-plus-1')).toBeOnTheScreen();
    // The Add sheet's own Modal, and no second one for the picker.
    expect(countNativeModals(view)).toBeLessThanOrEqual(1);

    // Cancel closes only the picker — the bill form is still there.
    await user.press(screen.getByTestId('bill-next-due-date-cancel'));
    await waitFor(() => expect(screen.queryByTestId('bill-next-due-date-surface')).toBeNull());
    expect(await screen.findByRole('header', { name: 'Add a bill' })).toBeOnTheScreen();

    // Done commits, and the collapsed row reports the new value.
    await user.press(screen.getByTestId('bill-next-due-date'));
    await user.press(await screen.findByTestId('bill-next-due-date-choice-plus-1'));
    await user.press(await screen.findByTestId('bill-next-due-date-done'));
    await waitFor(async () =>
      expect((await screen.findByTestId('bill-next-due-date')).props.accessibilityLabel).toMatch(/^Next due date, Tomorrow, /)
    );
  }, 30000);

  test('monthly bill Day of month opens the same surface with ordinal choices, and commits only on Done', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Add bill');
    await screen.findByRole('header', { name: 'Add a bill' });

    // Monthly is the default frequency, so the anchor field is present.
    const trigger = await screen.findByTestId('bill-day-of-month');
    expect(trigger.props.accessibilityLabel).toMatch(/^Day of month due, /);

    await user.press(trigger);
    await expectCanonicalSurface('bill-day-of-month');
    // Ordinals, 1 through 31 — never a month calendar for a repeating day.
    expect(await screen.findByLabelText('1st')).toBeOnTheScreen();
    expect(await screen.findByLabelText('25th')).toBeOnTheScreen();
    expect(await screen.findByLabelText('31st')).toBeOnTheScreen();

    // Choosing alone changes nothing; Cancel discards it.
    await user.press(screen.getByLabelText('25th'));
    await user.press(screen.getByTestId('bill-day-of-month-cancel'));
    await waitFor(() => expect(screen.queryByTestId('bill-day-of-month-surface')).toBeNull());
    expect((await screen.findByTestId('bill-day-of-month')).props.accessibilityLabel).not.toMatch(/25th/);

    // Done commits it.
    await user.press(screen.getByTestId('bill-day-of-month'));
    await user.press(await screen.findByLabelText('25th'));
    await user.press(screen.getByTestId('bill-day-of-month-done'));
    await waitFor(async () =>
      expect((await screen.findByTestId('bill-day-of-month')).props.accessibilityLabel).toBe('Day of month due, 25th of each month')
    );
  }, 30000);

  test('recurring income Next expected payment uses the same surface', async () => {
    const user = userEvent.setup();
    const view = await render(<Harness />);
    await openCatalogueTask(user, /Add income source/);
    await screen.findByRole('header', { name: 'Add income source' });

    const trigger = await screen.findByTestId('income-next-due-date');
    await user.press(trigger);
    await expectCanonicalSurface('income-next-due-date');
    expect(await screen.findByRole('header', { name: 'Next expected payment' })).toBeOnTheScreen();
    expect(countNativeModals(view)).toBeLessThanOrEqual(1);

    await user.press(await screen.findByTestId('income-next-due-date-choice-plus-0'));
    await user.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(async () =>
      expect((await screen.findByTestId('income-next-due-date')).props.accessibilityLabel).toMatch(/^Next expected payment, Today, /)
    );
  }, 30000);

  test('the goal target month and year uses the same surface, with month and year lists', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openQuickTile(user, 'Add goal');
    await screen.findByRole('header', { name: 'Add a goal' });

    const trigger = await screen.findByTestId('goal-target-date');
    expect(trigger.props.accessibilityLabel).toBe('Target date — optional, Not set');

    await user.press(trigger);
    await expectCanonicalSurface('goal-target-date');
    // A goal lands in a month, not on a day — so months and years, never 31
    // ordinals and never a day grid.
    expect(await screen.findByLabelText('Month')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Year')).toBeOnTheScreen();
    expect(screen.queryByLabelText('25th')).toBeNull();

    await user.press(await screen.findByTestId('goal-target-date-month-8'));
    await user.press(await screen.findByTestId('goal-target-date-year-2027'));
    await user.press(screen.getByTestId('goal-target-date-done'));
    await waitFor(async () =>
      expect((await screen.findByTestId('goal-target-date')).props.accessibilityLabel).toMatch(/^Target date — optional, \w+ 2027$/)
    );
  }, 30000);

  test('the credit-card due day uses the same surface', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await openCatalogueTask(user, /Add credit card/);
    await screen.findByRole('header', { name: 'Add credit card' });

    await user.press(await screen.findByTestId('card-due-day'));
    await expectCanonicalSurface('card-due-day');
    expect(await screen.findByRole('header', { name: 'Due day of month' })).toBeOnTheScreen();
    await user.press(await screen.findByLabelText('15th'));
    await user.press(screen.getByTestId('card-due-day-done'));
    await waitFor(async () => expect((await screen.findByTestId('card-due-day')).props.accessibilityLabel).toBe('Due day of month, 15th of each month'));
  }, 30000);
});
