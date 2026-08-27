// Nolie Design 5.1 Wave 4 closure — the modern goal editor, driven for real.
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the REAL GoalDetailSheet
// and AddGoalModal against the real AppStateProvider, and presses them.
// Structural coverage lives in tests/design5-wave4-goal-editor.ts; the two
// are deliberately complementary.
//
// ONE render(), varied with rerender, every post-interaction assertion
// AWAITED — this environment commits fireEvent-driven state updates
// asynchronously, and a rerender issued after such an update must be awaited
// too.
//
// NOT proven here: real keyboard timing or how any of it looks.

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { createEmptyAppData } from '../../src/lib/storage';
import { ThemeProvider } from '../../src/theme/ThemeContext';
// Post-Wave-10 B9 closure — the forms now consume the canonical
// save-feedback boundary (useCelebration), so the harness carries the
// provider the real app always mounts above the navigator.
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { GoalDetailSheet } from '../../src/components/goals/GoalDetailSheet';
import { AddGoalModal } from '../../src/components/goals/AddGoalModal';
import { Goal } from '../../src/types/models';

const STORAGE_KEY = 'moneycoach.appdata.v1';

/** Renders what the REAL store holds, so a write can be observed without
 * mocking the state layer (which ThemeProvider also consumes). */
function GoalProbe() {
  const { data } = useAppState();
  const goal = data.goals[0];
  if (!goal) return <Text testID="probe-missing">missing</Text>;
  return (
    <>
      <Text testID="probe-name">{goal.name}</Text>
      <Text testID="probe-priority">{goal.priority ?? 'medium'}</Text>
      <Text testID="probe-current">{String(goal.currentAmount)}</Text>
    </>
  );
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const TARGET_BACKED: Goal = {
  id: 'g-target',
  name: 'House deposit',
  lifeGoalType: 'house_deposit',
  targetAmount: 40000,
  currentAmount: 10000,
  targetDate: null,
  priority: 'high',
  status: 'active',
};

const NO_TARGET: Goal = {
  id: 'g-none',
  name: 'Someday fund',
  lifeGoalType: 'custom',
  targetAmount: null,
  currentAmount: 250,
  targetDate: null,
  status: 'active',
};

function wrap(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppStateProvider>
        <ThemeProvider>
        <CelebrationProvider>{ui}</CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Design 5.1 Wave 4 closure — the modern goal editor (rendered)', () => {
  test('creating and editing a goal use the same modern fields, and the corrections hold', async () => {
    await AsyncStorage.clear();
    const onClose = jest.fn();
    const view = await render(wrap(<AddGoalModal visible onClose={onClose} />));

    // --- A. CREATE: the generated-name rule -----------------------------
    // The recorded defect: picking a purpose auto-filled the name, and then
    // picking a different one left the stale name behind.
    fireEvent.press(screen.getByTestId('goal-purpose-house_deposit'));
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('Buy property'));

    fireEvent.press(screen.getByTestId('goal-purpose-car'));
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('New car'));

    // Once the customer types their own name it is never overwritten.
    fireEvent.changeText(screen.getByLabelText('Goal name'), 'First Tesla');
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('First Tesla'));
    fireEvent.press(screen.getByTestId('goal-purpose-holiday'));
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('First Tesla'));

    // The create form carries the modern controls.
    expect(screen.getByTestId('goal-target-date')).toBeOnTheScreen();
    expect(screen.getByLabelText('Priority')).toBeOnTheScreen();

    // --- B. EDIT a target-backed goal -----------------------------------
    await view.rerender(wrap(<GoalDetailSheet goal={TARGET_BACKED} onClose={onClose} />));

    // Modern chrome and the SAME field system as create.
    expect(await screen.findByTestId('goal-edit-purpose-house_deposit')).toBeOnTheScreen();
    expect(await screen.findByTestId('goal-edit-target-date')).toBeOnTheScreen();
    expect(await screen.findByTestId('goal-edit-save')).toBeOnTheScreen();
    // Prepopulated from the saved goal.
    expect(screen.getByLabelText('Goal name').props.value).toBe('House deposit');
    expect(screen.getByLabelText('Target amount, optional').props.value).toBe('40000');
    expect(screen.getByLabelText('High').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('goal-edit-purpose-house_deposit').props.accessibilityState.checked).toBe(true);
    // The legacy shapes are gone.
    expect(screen.queryByLabelText('Target month')).toBeNull();
    expect(screen.queryByLabelText('Target year')).toBeNull();
    expect(screen.queryByLabelText('Set')).toBeNull();

    // Progress is measured, and shown.
    expect(await screen.findByText(/of \$40,000/)).toBeOnTheScreen();
    // A target amount with NO target date must not claim a pace problem —
    // and, since the closure pass, must show the SAME clearly-labelled
    // planning guide the create form shows rather than only an instruction.
    expect(screen.queryByTestId('goal-pace-behind')).toBeNull();
    expect(await screen.findByTestId('goal-pace-planning-guide')).toBeOnTheScreen();
    expect(await screen.findByText(/^Planning guide: \$\d/)).toBeOnTheScreen();
    expect(await screen.findByText('Add a target date for a personalised estimate.')).toBeOnTheScreen();

    // Wave 4 closure — progress is now a labelled, full-width action at the
    // TOP of the sheet, opening an inline editor in place.
    const updateProgress = await screen.findByTestId('goal-update-progress');
    expect(updateProgress).toBeOnTheScreen();
    // Collapsed: exactly one progress surface, and it is not the editor.
    expect(screen.queryByTestId('goal-progress-editor')).toBeNull();

    fireEvent.press(updateProgress);
    expect(await screen.findByTestId('goal-progress-editor')).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Record progress' })).toBeOnTheScreen();
    expect(await screen.findByLabelText('Amount to record')).toBeOnTheScreen();
    expect(await screen.findByText(/it does not move money between accounts/i)).toBeOnTheScreen();
    // The remainder shortcut, and no generic "Add" label anywhere.
    expect(await screen.findByTestId('goal-progress-record-remaining')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Add')).toBeNull();

    // Cancel collapses it and writes nothing.
    fireEvent.press(await screen.findByTestId('goal-progress-cancel'));
    await waitFor(() => expect(screen.queryByTestId('goal-progress-editor')).toBeNull());

    // --- C. EDIT a goal with NO target ----------------------------------
    await view.rerender(wrap(<GoalDetailSheet goal={NO_TARGET} onClose={onClose} />));
    expect(await screen.findByTestId('goal-no-target-state')).toBeOnTheScreen();
    // The recorded `0%` defect: no percentage, visually or accessibly.
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByLabelText(/zero percent/i)).toBeNull();
    // `formatCurrencyPrecise` drops the cents on a whole amount, so the
    // spoken label is derived rather than hard-coded to one formatting.
    expect(screen.getByLabelText('No target set. $250 recorded so far.')).toBeOnTheScreen();
    // Recorded progress survives, and the target field is the way to add one.
    expect(screen.getByLabelText('Target amount, optional').props.value).toBe('');
    // No pace claim either, for a goal with neither input.
    expect(screen.queryByTestId('goal-pace-behind')).toBeNull();
  }, 30000);

  test('Save commits once and atomically, and progress stays a separate write', async () => {
    // No mocking: the REAL AppStateProvider, seeded through its own storage
    // key, with a probe rendering what the store actually holds. Mocking
    // useAppState would also break ThemeProvider, which consumes it too.
    await AsyncStorage.clear();
    const seeded = createEmptyAppData();
    seeded.user.hasSeenIntro = true;
    seeded.goals = [TARGET_BACKED];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const onClose = jest.fn();
    await render(
      wrap(
        <>
          <GoalDetailSheet goal={TARGET_BACKED} onClose={onClose} />
          <GoalProbe />
        </>
      )
    );

    // The store starts with the saved values.
    expect(await screen.findByTestId('probe-name')).toHaveTextContent('House deposit');
    expect(screen.getByTestId('probe-priority')).toHaveTextContent('high');

    // Edit two metadata fields. Neither may reach the store yet — the legacy
    // sheet autosaved on every keystroke; this one must not.
    fireEvent.changeText(await screen.findByLabelText('Goal name'), 'Home deposit');
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('Home deposit'));
    fireEvent.press(screen.getByLabelText('Flexible'));
    await waitFor(() => expect(screen.getByLabelText('Flexible').props.accessibilityState.checked).toBe(true));
    expect(screen.getByTestId('probe-name')).toHaveTextContent('House deposit');
    expect(screen.getByTestId('probe-priority')).toHaveTextContent('high');

    // Save changes commits BOTH, in one write, and closes.
    fireEvent.press(screen.getByTestId('goal-edit-save'));
    await waitFor(() => expect(screen.getByTestId('probe-name')).toHaveTextContent('Home deposit'));
    expect(screen.getByTestId('probe-priority')).toHaveTextContent('flexible');
    // Progress is untouched by a metadata save.
    expect(screen.getByTestId('probe-current')).toHaveTextContent('10000');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  }, 30000);

  test('recording progress is a separate write that moves only the recorded amount', async () => {
    await AsyncStorage.clear();
    const seeded = createEmptyAppData();
    seeded.user.hasSeenIntro = true;
    seeded.goals = [TARGET_BACKED];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    await render(
      wrap(
        <>
          <GoalDetailSheet goal={TARGET_BACKED} onClose={jest.fn()} />
          <GoalProbe />
        </>
      )
    );

    expect(await screen.findByTestId('probe-current')).toHaveTextContent('10000');
    fireEvent.press(await screen.findByTestId('goal-update-progress'));
    fireEvent.changeText(await screen.findByLabelText('Amount to record'), '500');
    // The primary action names the exact amount it will write.
    const submit = await screen.findByTestId('goal-progress-submit');
    expect(submit.props.accessibilityLabel).toBe('Record $500');
    fireEvent.press(submit);

    await waitFor(() => expect(screen.getByTestId('probe-current')).toHaveTextContent('10500'));
    // The metadata is untouched by a progress write.
    expect(screen.getByTestId('probe-name')).toHaveTextContent('House deposit');
    expect(screen.getByTestId('probe-priority')).toHaveTextContent('high');
    // The editor collapses and confirms that the update is ALREADY recorded,
    // so "Save changes" can never read as still pending.
    await waitFor(() => expect(screen.queryByTestId('goal-progress-editor')).toBeNull());
    expect(await screen.findByTestId('goal-progress-confirmation')).toHaveTextContent(/already recorded/);
    // And the destructive action is present, behind its own confirmation.
    expect(await screen.findByLabelText('Delete House deposit')).toBeOnTheScreen();
  }, 30000);
});
