// Nolie Design 5.1 Wave 4 — the shared field/component system (rendered).
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the REAL primitives
// inside the real ThemeProvider and asserts what a screen reader would
// actually receive, and what the committed tree actually contains.
//
// NOT proven here: how any of it LOOKS in each of the six themes, real
// keyboard behaviour, or real VoiceOver/TalkBack speech. Those stay device
// evidence — see the Wave 4 device script.
//
// ONE render(), no rerender, and every post-interaction assertion is
// AWAITED. Two measured facts about this repo's RNTL 14 + React 19 +
// jest-expo environment drive that shape, both reproduced this pass with
// reduced probes:
//   1. It stops mounting new roots from the third render() in a file.
//   2. A state update caused by fireEvent commits ASYNCHRONOUSLY. A plain
//      TouchableOpacity + useState toggle reads as unchanged with a
//      synchronous queryBy immediately after the press, and as changed with
//      an awaited findBy. This is not a slow component — it is when the
//      commit lands.
// So every variant this suite needs is mounted at once, each under its own
// distinct label, and each interaction is followed by an awaited query.

import React from 'react';
import { Text, View } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TextField } from '../../src/components/shared/fields/TextField';
import { CurrencyField } from '../../src/components/shared/fields/CurrencyField';
import { PickerTrigger } from '../../src/components/shared/fields/PickerTrigger';
import { InlineSelect } from '../../src/components/shared/fields/InlineSelect';
import { Chip } from '../../src/components/shared/Chip';
import { Segmented } from '../../src/components/shared/Segmented';
import { Disclosure } from '../../src/components/shared/Disclosure';
import { FinancialFigure } from '../../src/components/shared/FinancialFigure';
import { Row } from '../../src/components/shared/rows/Row';
import { SelectableRow } from '../../src/components/shared/rows/SelectableRow';
import { Button } from '../../src/components/shared/Button';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const CATEGORIES = [
  { value: 'groceries', label: 'Groceries', icon: { name: 'cart-outline', tone: 'ocean' } },
  { value: 'transport', label: 'Transport', icon: { name: 'bus-outline', tone: 'ocean' } },
] as const;

/** Total nodes in a committed RNTL tree — used to prove that showing a
 * validation message adds only the message itself, never a new row. */
function countNodes(node: unknown): number {
  if (node === null || node === undefined) return 0;
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + countNodes(child), 0);
  if (typeof node !== 'object') return 1;
  return 1 + countNodes((node as { children?: unknown }).children);
}

const spies = {
  blurAmount: jest.fn(),
  inlineChange: jest.fn(),
  segmentChange: jest.fn(),
  disabledChip: jest.fn(),
  loadingSave: jest.fn(),
  lockedName: jest.fn(),
};

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppStateProvider>
        <ThemeProvider>
          {/* A. money field — describes on blur, never while typing */}
          <CurrencyField label="Blur amount" required value="189.001" onChangeText={spies.blurAmount} />

          {/* B. a caller-owned message wins over anything the field would say */}
          <CurrencyField label="Caller amount" required value="!!!" onChangeText={jest.fn()} message="Not enough in that account." />

          {/* C. the reserved error row — same field, clean and errored */}
          <View testID="clean-field">
            <TextField label="Clean name" value="" onChangeText={jest.fn()} />
          </View>
          <View testID="errored-field">
            <TextField label="Errored name" value="" onChangeText={jest.fn()} message="Enter a name." />
          </View>

          {/* D. hint tone is not announced; error tone is */}
          <TextField label="Hinted name" value="" onChangeText={jest.fn()} tone="hint" message="Optional." />

          {/* E. picker trigger — empty and filled */}
          <PickerTrigger label="Empty category" value={null} onPress={jest.fn()} />
          <PickerTrigger label="Filled category" value="Groceries" icon={{ name: 'cart-outline', tone: 'ocean' }} onPress={jest.fn()} />

          {/* F. inline select — starts closed, opened by pressing its trigger */}
          <InlineSelect label="Category" value="groceries" onChange={spies.inlineChange} options={CATEGORIES} placeholder="Select a category" />

          {/* G. segmented control */}
          <Segmented
            accessibilityLabel="Transaction type"
            options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
            value="expense"
            onChange={spies.segmentChange}
          />

          {/* H. chips — selected and disabled */}
          <Chip label="Cash" selected onPress={jest.fn()} />
          <Chip label="Savings" disabled onPress={spies.disabledChip} />

          {/* I. disclosure — starts collapsed */}
          <Disclosure label="More options">
            <Text>Hidden detail</Text>
          </Disclosure>

          {/* J. rows — pressable and inert */}
          <Row title="Groceries" supporting="Weekly" onPress={jest.fn()} chevron />
          <Row title="Transport" supporting="Monthly" testID="inert-row" />
          <SelectableRow title="Savings" supporting="Money earning interest" selected onPress={jest.fn()} />

          {/* K. a loading button */}
          <Button label="Save" loading onPress={spies.loadingSave} />

          {/* L. financial figures — as-written, and spoken differently */}
          <FinancialFigure value="-$1,204.50" tone="negative" size="hero" testID="figure-written" />
          <FinancialFigure value="-$42.00" tone="negative" accessibilityLabel="42 dollars out" testID="figure-spoken" />

          {/* M. a disabled field */}
          <TextField label="Locked name" value="Locked" onChangeText={spies.lockedName} disabled />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Design 5.1 Wave 4 — field and component system (rendered)', () => {
  test('the shared field and component system exposes correct semantics, state and messaging', async () => {
    const view = await render(<Harness />);

    // Interaction ORDER matters in this environment, and the order below is
    // deliberate: each fireEvent that changes state is followed immediately
    // by an awaited query, before the next fireEvent is issued. Interleaving
    // a second press before the first update has committed was measured this
    // pass to drop the second one silently.

    // --- A. an inline select opens INLINE, with no modal ----------------
    // Closed: the options are genuinely absent, not merely hidden.
    expect(screen.queryByLabelText('Transport')).toBeNull();
    fireEvent.press(screen.getByLabelText('Category, Groceries'));
    const chosen = await screen.findByLabelText('Groceries');
    const other = await screen.findByLabelText('Transport');

    // Modal hard rule 2 — the whole reason this is inline.
    expect(JSON.stringify(view.toJSON())).not.toContain('Modal');
    // Each option is a radio reporting whether it is the current choice.
    expect(chosen.props.accessibilityRole).toBe('radio');
    expect(chosen.props.accessibilityState.checked).toBe(true);
    expect(other.props.accessibilityState.checked).toBe(false);

    // Choosing reports the value and closes the list — no timer involved.
    fireEvent.press(other);
    await waitFor(() => expect(screen.queryByLabelText('Transport')).toBeNull());
    expect(spies.inlineChange).toHaveBeenCalledWith('transport');

    // --- B. a disclosure reports expanded and mounts children on demand --
    const header = screen.getByLabelText('More options');
    expect(header.props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('Hidden detail')).toBeNull();
    fireEvent.press(header);
    expect(await screen.findByText('Hidden detail')).toBeOnTheScreen();
    expect(screen.getByLabelText('More options').props.accessibilityState.expanded).toBe(true);

    // --- C. a money field describes a malformed amount ON BLUR, in words -
    const amount = screen.getByLabelText('Blur amount');
    // Typing must not produce an accusation mid-keystroke.
    fireEvent.changeText(amount, '189.00');
    expect(spies.blurAmount).toHaveBeenCalledWith('189.00');
    expect(screen.queryByText(/at most two digits/)).toBeNull();
    // Blur is where the field speaks — and it names cents as the reason.
    fireEvent(amount, 'blur');
    expect(await screen.findByText('Amounts go to cents — at most two digits after the decimal point.')).toBeOnTheScreen();

    // --- D. a caller-supplied message wins outright ---------------------
    expect(screen.getByText('Not enough in that account.')).toBeOnTheScreen();
    // "!!!" would earn "Amounts can only use numbers…" if the field were
    // allowed to speak for itself. It is not.
    expect(screen.queryByText(/Amounts can only use/)).toBeNull();

    // --- E. the error row is RESERVED -----------------------------------
    // Identical fields, one clean and one errored. If the row were
    // conditional, the errored subtree would contain a container the clean
    // one does not; it contains only the message Text and its string.
    const clean = countNodes(screen.getByTestId('clean-field').props.children);
    const errored = countNodes(screen.getByTestId('errored-field').props.children);
    expect(screen.getByText('Enter a name.')).toBeOnTheScreen();
    expect(errored - clean).toBeLessThanOrEqual(2);

    // --- F. an error is announced politely; a hint is not announced ------
    expect(screen.getByText('Enter a name.').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Optional.').props.accessibilityLiveRegion).toBe('none');

    // --- G. a picker trigger announces its CURRENT selection -------------
    expect(screen.getByLabelText('Empty category, Select')).toBeOnTheScreen();
    expect(screen.getByLabelText('Filled category, Groceries').props.accessibilityRole).toBe('button');

    // --- H. a segmented control is ONE radiogroup -----------------------
    expect(screen.getByLabelText('Transaction type').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('Expense').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Income').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByLabelText('Income'));
    expect(spies.segmentChange).toHaveBeenCalledWith('income');

    // --- I. chips report selected / disabled; a disabled one is inert ----
    expect(screen.getByLabelText('Cash').props.accessibilityState.selected).toBe(true);
    const disabledChip = screen.getByLabelText('Savings');
    expect(disabledChip.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(disabledChip);
    expect(spies.disabledChip).not.toHaveBeenCalled();

    // --- J. rows announce as ONE stop; an inert row has no role ----------
    expect(screen.getByLabelText('Groceries. Weekly').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('inert-row').props.accessibilityRole).toBeUndefined();
    const selectable = screen.getByLabelText('Savings. Money earning interest');
    expect(selectable.props.accessibilityRole).toBe('radio');
    expect(selectable.props.accessibilityState.checked).toBe(true);

    // --- K. a loading button announces busy and refuses to fire ----------
    const saveButton = screen.getByLabelText('Save');
    expect(saveButton.props.accessibilityState.busy).toBe(true);
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton);
    expect(spies.loadingSave).not.toHaveBeenCalled();

    // --- L. a figure renders exactly what it was handed ------------------
    // Byte-for-byte the caller's own formatter output — the component
    // cannot introduce a rounding or sign difference.
    expect(screen.getByTestId('figure-written')).toHaveTextContent('-$1,204.50');
    expect(screen.getByTestId('figure-written').props.accessibilityRole).toBe('text');
    // And it can be SPOKEN differently without the written number changing.
    expect(screen.getByTestId('figure-spoken')).toHaveTextContent('-$42.00');
    expect(screen.getByLabelText('42 dollars out')).toBeOnTheScreen();

    // --- M. a disabled field is announced disabled and is not editable ---
    const locked = screen.getByLabelText('Locked name');
    expect(locked.props.accessibilityState.disabled).toBe(true);
    expect(locked.props.editable).toBe(false);
  }, 30000);
});
