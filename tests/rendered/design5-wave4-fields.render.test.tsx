// Nolie Design 5.1 Wave 4 device correction — the new date, day-of-month and
// balance-update fields, driven for real (rendered).
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the REAL primitives and
// presses them; it does not check source text. Structural coverage of the
// same components lives in tests/design5-date-and-balance-fields.ts, and the
// two are deliberately complementary.
//
// ONE render(), no rerender, every post-interaction assertion AWAITED —
// this environment commits fireEvent-driven state updates asynchronously
// (measured in the previous pass with a reduced probe), and interleaving a
// second press before the first has committed drops it silently.
//
// NOT proven here: real software-keyboard timing, real scroll position, or
// how any of it looks. Those stay device evidence.

import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { DayOfMonthField } from '../../src/components/shared/fields/DayOfMonthField';
import { DateTriggerField } from '../../src/components/shared/fields/DateTriggerField';
import { BalanceUpdateField } from '../../src/components/shared/fields/BalanceUpdateField';
import { AddIcon } from '../../src/components/shared/AddIcon';
import { FocusedPickerProvider } from '../../src/components/shared/fields/FocusedPickerHost';
import { formatFullDate } from '../../src/lib/dateFieldPresentation';
import { Keyboard } from 'react-native';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const TODAY = new Date(2026, 7, 18); // 18 August 2026, local

/** Expected date text is derived from the SAME shipped formatter rather than
 * hard-coded, so this suite asserts behaviour and not the runner's locale —
 * `toLocaleDateString` deliberately follows the device's own locale. */
const fullDate = (d: Date) => formatFullDate(d);

const spies = {
  day: jest.fn(),
  date: jest.fn(),
  balance: jest.fn(),
  addBalance: jest.fn(),
  missingBalance: jest.fn(),
};

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppStateProvider>
        <ThemeProvider>
          {/* The one focused picker surface, exactly as KeyboardSheet mounts
              it in production. A field rendered without it deliberately
              no-ops rather than crashing a screen that never opted in. */}
          <FocusedPickerProvider>
          <ScrollView>
            {/* A. recurring anchor */}
            <DayOfMonthField label="Day of month due" value={null} onChange={spies.day} testID="day-field" />

            {/* B. a real calendar date, already set to today */}
            <DateTriggerField label="Date" value={TODAY} today={TODAY} onChange={spies.date} testID="date-field" />

            {/* C. an optional, unset calendar date */}
            <DateTriggerField label="Target date" value={null} today={TODAY} optional onChange={jest.fn()} testID="optional-date" />

            {/* D. balance update, with a usable balance */}
            <BalanceUpdateField mode="expense" accountName="Everyday" value="update" onChange={spies.balance} testID="expense-balance" />

            {/* E. balance update, income wording */}
            <BalanceUpdateField mode="income" accountName="Savings" value="none" onChange={jest.fn()} testID="income-balance" />

            {/* F. the missing state */}
            <BalanceUpdateField
              mode="expense"
              accountName={null}
              value="none"
              onChange={spies.missingBalance}
              missingTitle="Cash balance isn't set up"
              missingBody="Add a cash balance to update it, or record this transaction without changing a balance."
              addBalanceLabel="Add cash balance"
              onAddBalance={spies.addBalance}
              testID="missing-balance"
            />

            {/* G. a decorative icon, alone, so its semantics can be read */}
            <AddIcon icon={{ name: 'cart-outline', tone: 'ocean' }} />
            <Text>end</Text>
          </ScrollView>
          </FocusedPickerProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Design 5.1 Wave 4 device correction — date, day and balance fields (rendered)', () => {
  test('the new fields behave correctly and announce themselves correctly', async () => {
    const view = await render(<Harness />);

    // --- A. the recurring anchor ---------------------------------------
    const dayTrigger = screen.getByTestId('day-field');
    // Collapsed, it speaks the anchor rather than making the customer read a
    // number out of a box.
    expect(dayTrigger.props.accessibilityLabel).toBe('Day of month due, Not set');
    expect(dayTrigger.props.accessibilityState.expanded).toBe(false);
    // The options genuinely are not mounted while collapsed.
    expect(screen.queryByTestId('day-field-option-25')).toBeNull();

    fireEvent.press(dayTrigger);
    const day25 = await screen.findByTestId('day-field-option-25');
    // 1-31, shown as ordinals, as a radiogroup.
    expect(await screen.findByTestId('day-field-option-1')).toBeOnTheScreen();
    expect(await screen.findByTestId('day-field-option-31')).toBeOnTheScreen();
    expect(screen.queryByTestId('day-field-option-32')).toBeNull();
    expect(screen.queryByTestId('day-field-option-0')).toBeNull();
    expect(day25.props.accessibilityRole).toBe('radio');
    expect(day25.props.accessibilityLabel).toBe('25th');
    expect(screen.getByLabelText('11th')).toBeOnTheScreen();
    expect(screen.getByLabelText('21st')).toBeOnTheScreen();
    // No second native modal was created to show them.
    expect(JSON.stringify(view.toJSON())).not.toContain('"Modal"');

    // Wave 4 closure — choosing sets the DRAFT; only Done commits. Pressing
    // an option must therefore change nothing yet.
    fireEvent.press(day25);
    expect(spies.day).not.toHaveBeenCalled();

    // Cancel leaves the value exactly as it was.
    fireEvent.press(await screen.findByTestId('day-field-cancel'));
    await waitFor(() => expect(screen.queryByTestId('day-field-option-25')).toBeNull());
    expect(spies.day).not.toHaveBeenCalled();

    // Reopening, choosing and confirming commits exactly once.
    fireEvent.press(screen.getByTestId('day-field'));
    fireEvent.press(await screen.findByTestId('day-field-option-25'));
    fireEvent.press(await screen.findByTestId('day-field-done'));
    await waitFor(() => expect(spies.day).toHaveBeenCalledTimes(1));
    expect(spies.day).toHaveBeenCalledWith(25);
    expect(screen.queryByTestId('day-field-option-25')).toBeNull();

    // --- B. a real calendar date ---------------------------------------
    const dateTrigger = screen.getByTestId('date-field');
    // The collapsed row names the day AND its exact date.
    expect(dateTrigger.props.accessibilityLabel).toBe(`Date, Today, ${fullDate(TODAY)}`);
    expect(screen.queryByTestId('date-field-surface')).toBeNull();

    fireEvent.press(dateTrigger);
    const panel = await screen.findByTestId('date-field-surface');
    expect(panel).toBeOnTheScreen();
    // The surface has a heading and both actions, and it covers the sheet —
    // so it needs no scrolling to reach.
    expect(await screen.findByRole('header', { name: 'Date' })).toBeOnTheScreen();
    expect(await screen.findByTestId('date-field-cancel')).toBeOnTheScreen();
    expect(await screen.findByTestId('date-field-done')).toBeOnTheScreen();
    // The shortcuts the chip rail used to show, with their real dates.
    expect(screen.getByLabelText(`Today, ${fullDate(new Date(2026, 7, 18))}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Yesterday, ${fullDate(new Date(2026, 7, 17))}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`2 days ago, ${fullDate(new Date(2026, 7, 16))}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Last week, ${fullDate(new Date(2026, 7, 11))}`)).toBeOnTheScreen();
    // Still no second native modal.
    expect(JSON.stringify(view.toJSON())).not.toContain('"Modal"');

    // Opening and CANCELLING changes nothing.
    fireEvent.press(await screen.findByTestId('date-field-cancel'));
    await waitFor(() => expect(screen.queryByTestId('date-field-surface')).toBeNull());
    expect(spies.date).not.toHaveBeenCalled();

    // Choosing and pressing Done commits exactly once.
    fireEvent.press(screen.getByTestId('date-field'));
    await screen.findByTestId('date-field-surface');
    fireEvent.press(await screen.findByTestId('date-field-choice-yesterday'));
    fireEvent.press(await screen.findByTestId('date-field-done'));
    await waitFor(() => expect(spies.date).toHaveBeenCalledTimes(1));
    expect(spies.date.mock.calls[0][0].getTime()).toBe(new Date(2026, 7, 17).getTime());

    // --- C. an optional, unset date ------------------------------------
    expect(screen.getByTestId('optional-date').props.accessibilityLabel).toBe('Target date, Not set');
    // Both the unset day-of-month row and the unset optional date row say
    // "Not set" — that consistency is the point, so assert the count.
    expect(screen.getAllByText('Not set')).toHaveLength(2);

    // --- D/E. the balance update section --------------------------------
    // Exactly two choices, naming the real account, in plain language.
    const update = screen.getByLabelText('Update Everyday balance. Subtract this amount when the transaction is saved.');
    const recordOnly = screen.getByLabelText('Record only. Save the transaction without changing a balance.');
    expect(update.props.accessibilityRole).toBe('radio');
    expect(update.props.accessibilityState.checked).toBe(true);
    expect(recordOnly.props.accessibilityState.checked).toBe(false);
    // Exactly one section heading per field.
    expect(screen.getAllByRole('header', { name: 'Balance update' })).toHaveLength(3);

    fireEvent.press(recordOnly);
    expect(spies.balance).toHaveBeenCalledWith('none');

    // Income says "Add", not "Subtract".
    expect(screen.getByLabelText('Update Savings balance. Add this amount when the income is saved.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Record only. Save the income without changing a balance.')).toBeOnTheScreen();

    // --- F. the missing state -------------------------------------------
    // Exactly ONE informational card, with exactly one Add action.
    expect(screen.getByTestId('missing-balance-missing')).toBeOnTheScreen();
    expect(screen.getByText("Cash balance isn't set up")).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Add cash balance')).toHaveLength(1);
    // And no update/record-only radio pair in that state at all.
    expect(screen.queryByTestId('missing-balance-update')).toBeNull();

    fireEvent.press(screen.getByTestId('missing-balance-add-balance'));
    expect(spies.addBalance).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('missing-balance-record-only'));
    expect(spies.missingBalance).toHaveBeenCalledWith('none');

    // --- G. the keyboard-to-picker handoff -------------------------------
    // THE RECORDED DEFECT: the picker used to mount only once the keyboard
    // had finished leaving, so the customer saw the keyboard go, the form
    // settle for a frame, and only then the picker — two consecutive
    // animations. The correction is that the surface is present from the
    // TAP onward, with no intervening frame.
    //
    // What is asserted here is exactly that: with a keyboard up, activation
    // mounts the shell synchronously and dismisses the keyboard, and the
    // shell is inert until the reveal completes. The de-duplication of
    // iOS's willHide-then-didHide pair, and the entrance duration, are
    // pure rules covered in tests/design5-date-and-balance-fields.ts and
    // tests/design5-wave4-picker-inventory.ts — emitting React Native's
    // private keyboard emitter is not a stable way to prove them.
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

    fireEvent.press(screen.getByTestId('date-field'));
    // No gap: the surface exists already, in the same interaction.
    const shell = await screen.findByTestId('date-field-surface');
    expect(shell).toBeOnTheScreen();
    expect(dismiss).toHaveBeenCalledTimes(1);
    // And it is inert while the keyboard is still leaving, so a stray touch
    // mid-handoff can never hit Done or Cancel.
    expect(shell.props.pointerEvents).toBe('none');
    // Exactly one shell, however the events land.
    expect(screen.getAllByTestId('date-field-surface')).toHaveLength(1);
    // Still no second native Modal.
    expect((JSON.stringify(view.toJSON()).match(/"type":"Modal"/g) ?? []).length).toBeLessThanOrEqual(1);

    jest.restoreAllMocks();

    // --- H. the decorative icon ------------------------------------------
    // It must be absent from the accessibility tree entirely: no label, no
    // role, nothing for a screen reader to stop on.
    const tree = JSON.stringify(view.toJSON());
    expect(tree).toContain('"importantForAccessibility":"no-hide-descendants"');
    expect(screen.queryByLabelText('cart-outline')).toBeNull();
  }, 30000);

});
