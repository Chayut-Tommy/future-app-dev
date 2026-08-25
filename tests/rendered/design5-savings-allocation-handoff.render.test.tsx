// Pre-Wave-10 correction — Money's "Set up savings allocation" handoff,
// RENDERED through the REAL Money path: flow row → summary sheet → CTA →
// summary dismissal → the canonical Savings Allocation editor → save/
// cancel → Money and persistence. RN's jest Modal mock never fires the
// native onDismiss itself, so the suite invokes the presented Modal's own
// onDismiss prop — the established simulation from
// reminder-focus-announcements.render.test.tsx — proving the exact
// production wiring end to end.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

/** The established native-dismiss simulation: RN's jest Modal mock keeps
 * onDismiss inert, so the presented Modal instance's own prop is invoked —
 * the same function the real native dismissal calls. Captured BEFORE the
 * close action. */
function findModalInstanceContaining(text: string): any {
  const matches = (screen as any).root.queryAll(
    (instance: any) => 'onRequestClose' in (instance.props ?? {})
  );
  // The topmost presented Modal that still renders the given text.
  const hasText = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false;
    const kids = node.props?.children;
    const own = Array.isArray(kids) ? kids.some((k: unknown) => k === text) : kids === text;
    if (own) return true;
    return (node.children ?? []).some(hasText);
  };
  return matches.find((m: any) => hasText(m)) ?? matches[matches.length - 1] ?? null;
}

describe('Money → Set up savings allocation → canonical editor', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    // Real recurring income so the percentage option is genuinely enabled,
    // and an everyday balance so Money renders its full composition. All
    // reachable achievements pre-seen, so no toast competes with the sheets.
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByLabelText(/^Money, tab,/, {}, { timeout: 20000 });
    fireEvent.press(screen.getByLabelText(/^Money, tab,/));
    await screen.findByLabelText(/^Savings, /, {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the Savings row opens the summary; ONE tap hands off to the canonical editor after real dismissal', async () => {
    fireEvent.press(screen.getByLabelText(/^Savings, /));
    // The summary sheet, with the factual empty state and the hinted CTA.
    await screen.findByText('No savings allocation is set up yet.', {}, { timeout: 20000 });
    const summaryModal = findModalInstanceContaining('Savings');
    const cta = screen.getByText('Set up savings allocation');
    expect(cta).toBeTruthy();

    // Rapid repeated taps: one pending intent, never several editors.
    fireEvent.press(cta);
    fireEvent.press(cta);
    fireEvent.press(cta);
    // The summary begins closing immediately (its visibility flag cleared);
    // the editor must NOT be mounted behind it before the dismissal signal.
    expect(screen.queryByText('Savings allocation')).toBeNull();

    // The REAL native dismissal signal completes the handoff.
    summaryModal.props.onDismiss?.();
    await screen.findByText('Savings allocation', {}, { timeout: 20000 });
    // Exactly one editor, with the shared picker body's canonical options.
    expect(screen.getAllByText('Savings allocation')).toHaveLength(1);
    expect(screen.getByText('No savings allocation')).toBeTruthy();
    expect(screen.getByText('Percentage of expected recurring income')).toBeTruthy();
    expect(screen.getByText('Fixed monthly amount')).toBeTruthy();
  }, 60000);

  test('Cancel writes nothing and leaves no stuck overlay', async () => {
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Percentage of expected recurring income')).toBeNull(), { timeout: 20000 });
    const s = await stored();
    expect(s.user.savingsAllocation).toBeUndefined();
    // Money is interactive again — the flow row is reachable.
    expect(screen.getByLabelText(/^Savings, /)).toBeTruthy();
  }, 60000);

  // The save/restart journey lives in its own file
  // (design5-savings-allocation-save.render.test.tsx): after this root's
  // full modal open/close cycles, RNTL stops committing further state
  // updates (documented harness wedge — storage advances, the tree does
  // not), so the write path runs against a fresh root instead.
});
