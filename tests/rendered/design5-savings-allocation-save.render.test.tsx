// Pre-Wave-10 correction — the SAVE half of Money's Savings-Allocation
// handoff, rendered through the real path on a FRESH root (its own file:
// after design5-savings-allocation-handoff.render's modal cycles, RNTL
// stops committing further updates in that root — the documented harness
// wedge — so the write path runs here). Root 1 saves 10% through the
// canonical editor; root 2 is a no-press restart over the persisted state.
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

function seedData(): AppData {
  const d = createEmptyAppData();
  d.user.name = 'Jamie';
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 5417;
  d.user.incomeAmount = 2500;
  d.user.payFrequency = 'fortnightly';
  d.user.nextPayday = new Date(2026, 8, 7).toISOString();
  const income: RecurringItem = {
    id: 'r1',
    type: 'income',
    label: 'Salary',
    amount: 2500,
    frequency: 'fortnightly',
    nextDueDate: new Date(2026, 8, 7).toISOString(),
    isFixed: true,
    active: true,
  };
  d.recurringItems = [income];
  d.assets = [{ id: 'ev1', type: 'everyday', label: 'Everyday', currentValue: 4000, includeInMoneyCalculations: true } as Asset];
  d.seenAchievementIds = ['started_lulu', 'added_income', 'added_first_asset'];
  return d;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

function findModalInstanceContaining(text: string): any {
  const matches = (screen as any).root.queryAll((instance: any) => 'onRequestClose' in (instance.props ?? {}));
  const hasText = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false;
    const kids = node.props?.children;
    const own = Array.isArray(kids) ? kids.some((k: unknown) => k === text) : kids === text;
    if (own) return true;
    return (node.children ?? []).some(hasText);
  };
  return matches.find((m: any) => hasText(m)) ?? matches[matches.length - 1] ?? null;
}

describe('Saving 10% through the canonical editor from Money', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seedData()));
    view = await render(<Harness />);
    await screen.findByLabelText(/^Money, tab,/, {}, { timeout: 20000 });
    fireEvent.press(screen.getByLabelText(/^Money, tab,/));
    await screen.findByLabelText(/^Savings, /, {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('percentage save writes once via the real engine; Money reflects the same figure', async () => {
    fireEvent.press(screen.getByLabelText(/^Savings, /));
    await screen.findByText('No savings allocation is set up yet.', {}, { timeout: 20000 });
    const summaryModal = findModalInstanceContaining('Savings');
    fireEvent.press(screen.getByText('Set up savings allocation'));
    summaryModal.props.onDismiss?.();
    await screen.findByText('Percentage of expected recurring income', {}, { timeout: 20000 });

    // Mode change flushes before the chips are touched; the live ≈/month
    // preview (the REAL engine's 10% of $5,417) flushes before Save.
    fireEvent.press(screen.getByText('Percentage of expected recurring income'));
    await screen.findByText('10%', {}, { timeout: 20000 });
    fireEvent.press(screen.getByText('10%'));
    await screen.findByText(/≈ \$54[12]\/month/, {}, { timeout: 20000 });
    fireEvent.press(screen.getByText('Save'));

    await waitFor(
      async () => {
        expect((await stored()).user.savingsAllocation).toEqual({ mode: 'percent', percent: 0.1 });
      },
      { timeout: 20000 }
    );
    // The editor closed cleanly and the flow row now carries the engine's
    // monthly figure — the same canonical state Wealth reads.
    await waitFor(() => expect(screen.queryByText('Percentage of expected recurring income')).toBeNull(), { timeout: 20000 });
    await screen.findByLabelText(/^Savings, \$54[12]/, {}, { timeout: 20000 });
  }, 60000);
});

describe('Restart over the persisted allocation (no presses)', () => {
  let view: any;

  beforeAll(async () => {
    // The SAME storage the save above wrote — a fresh launch over it.
    view = await render(<Harness />);
    await screen.findByTestId('today-journey-row', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the allocation survives restart in the one canonical field', async () => {
    const s = await stored();
    expect(s.user.savingsAllocation).toEqual({ mode: 'percent', percent: 0.1 });
    // Nothing else was written by the journey.
    expect(s.recurringItems.filter((r) => r.type === 'income')).toHaveLength(1);
    expect(s.assets).toHaveLength(1);
    expect(s.transactions).toHaveLength(0);
  });
});
