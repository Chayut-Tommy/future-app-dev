import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { CardsScreen } from '../../src/screens/cards/CardsScreen';
import { createEmptyAppData } from '../../src/lib/storage';

const CardsStack = createNativeStackNavigator();

function CardsHarness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <NavigationContainer>
              <CardsStack.Navigator screenOptions={{ headerShown: false }}>
                <CardsStack.Screen name="Cards" component={CardsScreen} />
              </CardsStack.Navigator>
            </NavigationContainer>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Pass 2E — rendered coverage for the accessibility-semantics correction
 * (headings, actionable-row labels, touch-target roles, progress
 * semantics). Mounted with the REAL RootNavigator (real Today/Grow/Goals/
 * Cards screens, real AppStateProvider) so every assertion below reflects
 * genuine production accessibility-tree output, not a source-regex proxy.
 *
 * The seeded fixture deliberately produces a partial-progress "next"
 * achievement (saved_1000, $250 of $1,000) — the only way to exercise
 * JourneyTimeline's/TodayJourneySnapshotCard's numeric progress semantics
 * without a fully-unlocked or fully-locked Journey.
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

async function seedFixtureData() {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  data.user.monthlyIncome = 4000;
  data.assets = [{ id: 'a1', type: 'cash', label: 'Everyday', currentValue: 250 } as any];
  data.goals = [
    {
      id: 'g1',
      name: 'Emergency Fund',
      lifeGoalType: 'emergency_fund',
      targetAmount: 5000,
      currentAmount: 1500,
      targetDate: '2026-12-01',
      status: 'active',
    } as any,
  ];
  data.creditCards = [
    { id: 'c1', issuer: 'Visa', label: 'Everyday Visa', creditLimit: 5000, currentBalance: 1200, dueDay: 15, minimumPayment: 35 } as any,
  ];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

describe('Accessibility semantics — rendered coverage (Pass 2E)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await seedFixtureData();
  });

  test('Today renders its section headings with header role', async () => {
    await render(<Harness />);

    // Wave 5's visual pass — the Briefing's header role moved onto its
    // Design 5.1 eyebrow, and the Journey became a single named row rather
    // than a section header plus a card (p.7's own anatomy, and the density
    // rule against a heading that only repeats the card's own title). The
    // Journey is still an accessible named control — asserted in the next
    // test — so nothing became unreachable.
    expect(await screen.findByRole('header', { name: 'Your Today Briefing' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Your goal' })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: /^Your Journey\./ })).toBeOnTheScreen();
  });

  test('Today floating Settings control is an accessible, named button', async () => {
    await render(<Harness />);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  });

  test('Today Journey snapshot row exposes its numeric next-milestone progress in one collapsed label', async () => {
    await render(<Harness />);

    // The row now leads with its own name; the numeric progress this test
    // exists to protect is still carried in the SAME single collapsed label.
    const journeyRow = await screen.findByRole('button', { name: /^Your Journey\./ });
    expect(journeyRow).toBeOnTheScreen();
    expect(journeyRow.props.accessibilityLabel).toMatch(/\$250.*\$1,000/);
  });

  test('Today goal row exposes name, percent, and target in one accessible label', async () => {
    await render(<Harness />);

    // Wave 5 — the compact goal row now speaks the amounts as well as the
    // percentage, in one label: "Emergency Fund, $1,500 of $5,000, 30%".
    const goalRow = await screen.findByRole('button', { name: /Emergency Fund.*\$1,500 of \$5,000.*30%/ });
    expect(goalRow).toBeOnTheScreen();
  });

  test('Grow renders Explore Money Moves and Markets as headings, and a collapsed category as an accessible expand/collapse control', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));

    expect(await screen.findByRole('header', { name: 'Explore Money Moves' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Markets' })).toBeOnTheScreen();

    const savingCategory = await screen.findByRole('button', { name: 'Saving' });
    expect(savingCategory.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));

    await user.press(savingCategory);
    expect(await screen.findByRole('button', { name: /Compare savings rates/ })).toBeOnTheScreen();
    const savingCategoryAfter = await screen.findByRole('button', { name: 'Saving' });
    expect(savingCategoryAfter.props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
  });

  test('Grow safety-net nav row is an accessible, labelled button (no separate chevron focus stop)', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(await screen.findByRole('button', { name: /^Grow,/ }));

    const navRow = await screen.findByRole('button', { name: /How long would my safety net last/ });
    expect(navRow).toBeOnTheScreen();
    // The row's own chevron icon must never be independently queryable as
    // a second accessible element — accessible information integrity
    // requires exactly one focus stop per row, not a row plus a decorative
    // icon each producing their own stop.
    const allSafetyNetButtons = await screen.findAllByRole('button', { name: /safety net/i });
    expect(allSafetyNetButtons).toHaveLength(1);
  });

  test('Cards screen exposes a single collapsed accessible label per card row, including balance, utilisation, and repayment', async () => {
    await render(<CardsHarness />);

    const cardRow = await screen.findByRole('button', { name: /Everyday Visa.*\$1,200 of \$5,000.*24% utilised.*repay \$/ });
    expect(cardRow).toBeOnTheScreen();
    // Exactly one focus stop for the row — the decorative chevron and
    // per-card ProgressBar must never be independently queryable.
    const allCardButtons = await screen.findAllByRole('button', { name: /Everyday Visa/ });
    expect(allCardButtons).toHaveLength(1);
  });
});
