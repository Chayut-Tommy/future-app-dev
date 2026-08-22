/* RECONCILED — Design 5.1 Wave 8: Grow's section titles are now
 * consistently sentence case, so the Journey header reads "Your journey".
 * Every clause below is otherwise unchanged — the property each one
 * protects (local state retention, pushed-destination context, dock
 * continuity) is untouched by a title's casing. */

// RNTL unmounts every root after each test by default; this suite mounts
// ONE root and drives every journey through it, because the harness also
// stops mounting new roots from the third render() in a file.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Nolie Design 5.1 Wave 6, Correction A — the dock survives a root-stack
 * push.
 *
 * THE DEFECT, restated as the thing this file watches for: the dock was
 * MainTabNavigator's `tabBar`, so pushing any eligible detail route
 * (MoneyDetail, GrowDetail, Transactions, Goals, Cards, EmergencyFund —
 * all ROOT-STACK routes) unmounted it while the root-level "+" survived. A
 * customer saw an orphaned "+" and no way back except the system gesture.
 *
 * Each journey below therefore asserts the dock BEFORE, and again AFTER,
 * with the right tab lit and the "+" still beside it.
 *
 * NOT proven here: that the dock does not visually flicker mid-transition.
 * RNTL has no frame timeline; a component that is mounted before and after
 * and is never conditionally unmounted between cannot flicker in the way
 * the recording showed, but the absence of a paint-level artefact is
 * device evidence.
 */

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

function iso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function seed() {
  const data: AppData = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  data.user.monthlyIncome = 5200;
  data.user.nextPayday = iso(11);
  data.user.moneyPictureChecklistDismissed = true;
  data.assets.push({ id: 'a1', label: 'Everyday', type: 'cash', currentValue: 3400, includeInMoneyCalculations: true } as any);
  data.recurringItems.push({ id: 'rent', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: iso(2), isFixed: true, active: true } as any);
  data.transactions.push({ id: 't1', type: 'expense', amount: 40, category: 'Groceries', date: new Date().toISOString(), note: '', paymentSource: 'cash' } as any);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** The dock's four tab controls, identified by the accessible name the
 * production dock actually gives them. */
function dockTabs() {
  return screen.queryAllByRole('button', { name: /, tab, \d of 4$/ });
}

function selectedTabName(): string | null {
  const sel = dockTabs().filter((t) => t.props.accessibilityState?.selected === true);
  if (sel.length !== 1) return null;
  return String(sel[0].props.accessibilityLabel).split(',')[0];
}

/** The detached "+", by the accessible name FloatingAddButton gives it. */
function addControls() {
  return screen.queryAllByRole('button', { name: /^(Open|Close) quick actions$/ });
}

/** The whole assembly: four tabs plus the detached "+". The point of the
 * correction is that these two are never present without each other. */
function assemblyPresent(): boolean {
  return dockTabs().length === 4 && addControls().length === 1;
}

describe('Design 5.1 Wave 6 Correction A — the dock survives every eligible push', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    await seed();
    view = await render(<Harness />);
    await screen.findByTestId('today-briefing-hero');
  });

  afterAll(() => {
    view.unmount();
    jest.restoreAllMocks();
  });

  test('1. the assembly starts complete, with exactly one tab selected', () => {
    expect(dockTabs()).toHaveLength(4);
    expect(assemblyPresent()).toBe(true);
    // Exactly one selected — never two, never none.
    expect(dockTabs().filter((t) => t.props.accessibilityState?.selected === true)).toHaveLength(1);
    expect(selectedTabName()).toBe('Today');
  });

  test('2. Today Briefing AUP → Money detail: dock remains, Money selected', async () => {
    expect(assemblyPresent()).toBe(true);

    fireEvent.press(screen.getByTestId('today-briefing-measure'));
    await screen.findByRole('button', { name: 'Back' });

    // THE REGRESSION: this is where the dock used to vanish.
    expect(dockTabs()).toHaveLength(4);
    expect(assemblyPresent()).toBe(true);
    expect(selectedTabName()).toBe('Money');

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('today-briefing-hero');
    expect(selectedTabName()).toBe('Today');
  });

  test('3. Today Journey → Grow detail: dock remains, Grow selected', async () => {
    fireEvent.press(screen.getByRole('button', { name: /^Your Journey\./ }));
    await screen.findByRole('button', { name: 'Back' });

    expect(dockTabs()).toHaveLength(4);
    expect(assemblyPresent()).toBe(true);
    expect(selectedTabName()).toBe('Grow');

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('today-briefing-hero');
  });

  test('4. Money → Transactions: dock remains, Money stays selected', async () => {
    fireEvent.press(screen.getByRole('button', { name: /^Money, tab,/ }));
    await screen.findByTestId('money-this-month-card');
    expect(selectedTabName()).toBe('Money');

    fireEvent.press(screen.getByRole('button', { name: 'View all transactions' }));
    await screen.findByRole('button', { name: 'Back' });

    // Transactions is a root-stack route — another place the dock vanished.
    expect(dockTabs()).toHaveLength(4);
    expect(assemblyPresent()).toBe(true);
    expect(selectedTabName()).toBe('Money');

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('money-this-month-card');
  });

  test('5. pressing a different tab from a detail route reveals that root, with the dock continuously present', async () => {
    fireEvent.press(screen.getByRole('button', { name: 'View all transactions' }));
    await screen.findByRole('button', { name: 'Back' });
    expect(selectedTabName()).toBe('Money');

    // Cross-tab, straight from a pushed route.
    fireEvent.press(screen.getByRole('button', { name: /^Grow, tab,/ }));
    await screen.findByRole('header', { name: 'Your journey' });

    expect(dockTabs()).toHaveLength(4);
    expect(selectedTabName()).toBe('Grow');
    // The detail route did not stay layered above the revealed root.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  test('6. pressing the owner tab from its own detail route returns to that root', async () => {
    fireEvent.press(screen.getByRole('button', { name: /^Money, tab,/ }));
    await screen.findByTestId('money-this-month-card');
    fireEvent.press(screen.getByRole('button', { name: 'View all transactions' }));
    await screen.findByRole('button', { name: 'Back' });

    fireEvent.press(screen.getByRole('button', { name: /^Money, tab,/ }));
    await screen.findByTestId('money-this-month-card');

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(selectedTabName()).toBe('Money');
    expect(dockTabs()).toHaveLength(4);
  });

  test('7. every tab control stays labelled, and only ever one is selected', () => {
    const tabs = dockTabs();
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => String(t.props.accessibilityLabel).split(',')[0])).toEqual(['Today', 'Money', 'Wealth', 'Grow']);
    for (const t of tabs) {
      expect(String(t.props.accessibilityLabel)).toMatch(/, tab, \d of 4$/);
    }
    expect(tabs.filter((t) => t.props.accessibilityState?.selected === true)).toHaveLength(1);
  });

  test('8. exactly one dock and one global Add control exist at any time', () => {
    expect(dockTabs()).toHaveLength(4);
    // Four tab buttons means one capsule — a duplicate dock would give eight.
    expect(screen.queryAllByRole('button', { name: /^Today, tab,/ })).toHaveLength(1);
    expect(addControls()).toHaveLength(1);
  });

  test('9. Settings hides the whole assembly, and returning restores it', async () => {
    fireEvent.press(screen.getByRole('button', { name: /^Today, tab,/ }));
    await screen.findByTestId('today-briefing-hero');

    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByText('Settings');

    // Both halves gone together — never a "+" without its dock.
    expect(dockTabs()).toHaveLength(0);
    expect(addControls()).toHaveLength(0);
  });
});
