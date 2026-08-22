import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, within } from '@testing-library/react-native';
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

  // RECONCILED — Design 5.1 Wave 8.
  //
  // OLD CLAUSES: (1) Grow rendered "Explore Money Moves" and "Markets" as
  // headings with a collapsed ExploreCategorySection exposing an
  // expand/collapse control; (2) a standalone "How long would my safety
  // net last?" nav row was one accessible labelled button.
  //
  // SUPERSEDED BECAUSE the owner-locked hierarchy unwired the category
  // accordion and Market Pulse, and folded the safety-net destination into
  // the Emergency fund TOOL tile — the same route, now one of four tiles.
  //
  // PRESERVED INTENT, both halves: Grow's section identities carry header
  // semantics, and every navigation row is ONE accessible labelled button
  // with no separate chevron focus stop. Asserted below against the
  // surfaces that now exist.
  test('Grow renders its section identities as headings', async () => {
    await render(<Harness />);
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: /Grow/i }));
    await screen.findByTestId('grow-score-hero');
    expect(screen.getByRole('header', { name: 'Your goals' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your journey' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Tools' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Learn' })).toBeOnTheScreen();
  });

  test('Grow tool tiles are accessible, labelled buttons with no separate chevron focus stop', async () => {
    await render(<Harness />);
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: /Grow/i }));
    await screen.findByTestId('grow-score-hero');
    const tile = screen.getByTestId('grow-tool-emergency');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toBe('Emergency fund. How many months your cash covers');
    // The icon is decorative and must not be its own stop.
    expect(within(tile).queryByRole('image')).toBeNull();
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
