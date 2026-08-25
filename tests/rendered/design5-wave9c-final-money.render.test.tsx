// Wave 9c FINAL correction pass, Correction B — Money's completion path,
// RENDERED against the REAL screen, editor and persistence.
//
// THE DEVICE SEQUENCE THIS REPRODUCES: the owner onboarded a $5,000
// fortnightly income that the legacy build persisted without a payday, and
// Money's "Add an expected payday" then walked them into creating a SECOND
// $5,000 fortnightly income. Here the same world must instead offer
// "Finish setting up BOQ income", open THAT record, and complete it in
// place — cancel writing nothing, completion updating the same stable id,
// and the prompt disappearing once the record is genuinely scheduled.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
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

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

describe('Wave 9c final — Money completes the existing unscheduled income', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    // The owner's exact legacy record: the Wave 9c candidate's onboarding
    // draft shape, before this correction.
    const legacy: RecurringItem = {
      id: 'r-legacy-boq',
      type: 'income',
      label: 'BOQ',
      amount: 5000,
      frequency: 'fortnightly',
      nextDueDate: new Date().toISOString(),
      nextDueDateUnknown: true,
      isFixed: true,
      active: true,
    };
    d.recurringItems = [legacy];
    d.user.monthlyIncome = (5000 * 26) / 12;
    d.user.incomeAmount = 5000;
    d.user.payFrequency = 'fortnightly';
    d.user.nextPayday = null;
    d.assets = [{ id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 12000, includeInMoneyCalculations: true } as Asset];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByLabelText(/^Money, tab,/, {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the hero offers factual COMPLETION wording, never the blank add', async () => {
    fireEvent.press(screen.getByLabelText(/^Money, tab,/));
    const cta = await screen.findByTestId('money-aup-cta-payday', {}, { timeout: 20000 });
    expect(screen.getByText('Finish setting up BOQ income')).toBeTruthy();
    expect(screen.queryByText('Add an expected payday')).toBeNull();
    expect(cta).toBeTruthy();
  });

  test('cancel writes nothing and keeps exactly one income', async () => {
    fireEvent.press(screen.getByTestId('money-aup-cta-payday'));
    // The canonical editor opens ON the record — its exact values shown.
    await screen.findByText('Edit income source', {}, { timeout: 20000 });
    await screen.findByDisplayValue('BOQ');
    await screen.findByDisplayValue('5000');
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Edit income source')).toBeNull(), { timeout: 20000 });
    const s = await stored();
    const incomes = s.recurringItems.filter((r) => r.type === 'income');
    expect(incomes).toHaveLength(1);
    expect(incomes[0].nextDueDateUnknown).toBe(true);
  });

  test('completing the payday updates the SAME stable id — one income, now scheduled', async () => {
    fireEvent.press(screen.getByTestId('money-aup-cta-payday'));
    await screen.findByText('Edit income source', {}, { timeout: 20000 });
    // The shared focused picker; the draft selection is flushed before
    // Done (documented stale-draft flush pathology).
    fireEvent.press(screen.getByTestId('income-next-due-date'));
    await screen.findByTestId('income-next-due-date-choice-plus-1');
    fireEvent.press(screen.getByTestId('income-next-due-date-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('income-next-due-date-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    fireEvent.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(() => expect(screen.queryByTestId('income-next-due-date-done')).toBeNull(), { timeout: 20000 });
    fireEvent.press(screen.getByText('Save'));

    await waitFor(
      async () => {
        const s = await stored();
        const incomes = s.recurringItems.filter((r) => r.type === 'income');
        // ONE record, the SAME id, genuinely scheduled — never a duplicate.
        expect(incomes).toHaveLength(1);
        expect(incomes[0].id).toBe('r-legacy-boq');
        expect(incomes[0].nextDueDateUnknown).toBe(false);
        expect(incomes[0].amount).toBe(5000);
        expect(incomes[0].frequency).toBe('fortnightly');
        // The aggregate now carries the payday for every engine.
        expect(s.user.nextPayday).toBe(incomes[0].nextDueDate);
      },
      { timeout: 20000 }
    );
    // Totals cannot have doubled: the monthly aggregate is still one
    // fortnightly $5,000 (~$10,833/mo), byte-for-byte.
    const s = await stored();
    expect(s.user.monthlyIncome).toBeCloseTo((5000 * 26) / 12, 6);
    // And the completion prompt is gone — the hero has its payday.
    await waitFor(() => expect(screen.queryByText(/Finish setting up/)).toBeNull(), { timeout: 20000 });
  });
});
