// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per describe in beforeAll and asserts across many tests, which
// auto-cleanup would tear down after the first — and the harness's own
// three-root limit means remounting per test is not an option.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { CompoundCalculatorScreen } from '../../src/screens/discover/CompoundCalculatorScreen';
import { HomeLoanCalculatorScreen } from '../../src/screens/discover/HomeLoanCalculatorScreen';
import { computeCompoundGrowth } from '../../src/lib/calculations/compoundCalculator';
import { computeHomeLoanRepayment } from '../../src/lib/calculations/homeLoanCalculator';

/**
 * Nolie Design 5.1 Wave 9a — Compound growth and Home loan repayments,
 * RENDERED. Proves what only a mount can: that every customer-facing Text
 * and TextInput on these screens resolves to the bundled families at
 * runtime (a source grep cannot), that the default result matches the
 * untouched engine exactly, that malformed or missing input produces
 * guidance and NO result figure, and — the shell journey lives in
 * design5-wave9a-shell.render.test.tsx.
 *
 * NOT proven here: pixel appearance, VoiceOver speech, device keyboard
 * behaviour — see the Wave 9a device retest checklist.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const Stack = createNativeStackNavigator();

function standalone(Component: React.ComponentType<any>) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <NavigationContainer>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Subject" component={Component} />
              </Stack.Navigator>
            </NavigationContainer>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Runtime typography walk — flattened styles from the real tree.
// Ionicons render as <Text> with an "ionicons" family: glyphs, not
// customer copy, excluded by family name. Only TOP-LEVEL Text nodes are
// asserted — a Text nested inside a Text inherits its parent's family.
// ---------------------------------------------------------------------------
const isGlyph = (f: unknown) => typeof f === 'string' && /ionicons/i.test(f);

function flatten(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style as Record<string, unknown>;
}

function collectFontOffenders(): { kind: string; family: unknown; text: string }[] {
  const offenders: { kind: string; family: unknown; text: string }[] = [];
  const walk = (n: any, insideText: boolean) => {
    if (!n || typeof n !== 'object') return;
    const isText = n.type === 'Text';
    const isInput = n.type === 'TextInput';
    if ((isText && !insideText) || isInput) {
      const family = flatten(n.props?.style).fontFamily;
      const kids = n.props?.children;
      const text = Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
      if (!isGlyph(family) && (typeof family !== 'string' || !family.startsWith('Figtree'))) {
        offenders.push({ kind: n.type, family, text: text.slice(0, 40) });
      }
    }
    (n.children ?? []).forEach((c: unknown) => walk(c, insideText || isText));
  };
  walk((screen as any).root, false);
  return offenders;
}

const COMPOUND_DEFAULTS = { initial: 0, contribution: 10, frequency: 'weekly' as const, annualRatePct: 5, years: 10 };
const LOAN_DEFAULTS = { loanAmount: 600000, annualRatePct: 6, years: 30, frequency: 'monthly' as const };

describe('Wave 9a — Compound growth, standalone', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    root = await render(standalone(CompoundCalculatorScreen));
    await screen.findByText('Compound growth');
  });

  afterAll(() => root?.unmount());

  test('the customer-visible title is "Compound growth"', () => {
    expect(screen.getByText('Compound growth')).toBeOnTheScreen();
  });

  test('with the default valid inputs, ONE result surface shows the engine\'s exact figures', () => {
    const expected = computeCompoundGrowth(COMPOUND_DEFAULTS);
    expect(screen.getByTestId('compound-result')).toBeOnTheScreen();
    expect(screen.getByText(formatMoney(expected.futureValue))).toBeOnTheScreen();
    expect(screen.getByText(formatMoney(expected.totalContributed))).toBeOnTheScreen();
    expect(screen.getByText(formatMoney(expected.totalGrowth))).toBeOnTheScreen();
  });

  test('contributions are distinguished from estimated growth, factually labelled', () => {
    expect(screen.getByText('Estimated value')).toBeOnTheScreen();
    expect(screen.getByText('Your contributions')).toBeOnTheScreen();
    expect(screen.getByText('Estimated growth')).toBeOnTheScreen();
  });

  test('every customer-facing Text and TextInput resolves to Figtree at runtime', () => {
    expect(collectFontOffenders()).toEqual([]);
  });

  test('clearing a field replaces the result with calm guidance — never a fabricated $0', async () => {
    fireEvent.changeText(screen.getByLabelText('Number of years'), '');
    await screen.findByTestId('compound-guidance');
    expect(screen.queryByTestId('compound-result')).toBeNull();
    expect(screen.getByText('Fill in the fields above to see an estimate.')).toBeOnTheScreen();
  });

  test('malformed input shows guidance and no result figure', async () => {
    fireEvent.changeText(screen.getByLabelText('Number of years'), '10x');
    await screen.findByTestId('compound-guidance');
    await waitFor(() => expect(screen.queryByTestId('compound-result')).toBeNull());
    expect(screen.getByText(/Check the highlighted fields/)).toBeOnTheScreen();
  });

  test('restoring valid input restores the one result surface', async () => {
    fireEvent.changeText(screen.getByLabelText('Number of years'), '10');
    await screen.findByTestId('compound-result');
    expect(screen.queryByTestId('compound-guidance')).toBeNull();
  });

  test('cadence selection is a real radio group and survives the migration', async () => {
    expect(screen.getByRole('radio', { name: 'Weekly' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Monthly' }).props.accessibilityState.selected).toBe(true));
    fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Weekly' }).props.accessibilityState.selected).toBe(true));
  });
});

describe('Wave 9a — Home loan repayments, standalone', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    root = await render(standalone(HomeLoanCalculatorScreen));
    await screen.findByText('Home loan repayments');
  });

  afterAll(() => root?.unmount());

  test('the customer-visible title is "Home loan repayments" and the old question is gone', () => {
    expect(screen.getByText('Home loan repayments')).toBeOnTheScreen();
    expect(screen.queryByText(/Can I buy a home/)).toBeNull();
  });

  test('with the default valid inputs the engine\'s exact repayment, interest and total render', () => {
    const expected = computeHomeLoanRepayment(LOAN_DEFAULTS);
    expect(screen.getByTestId('homeloan-result')).toBeOnTheScreen();
    expect(screen.getByText(`${formatMoney(expected.repaymentPerPeriod)} / month`)).toBeOnTheScreen();
    expect(screen.getByText(formatMoney(expected.totalInterest))).toBeOnTheScreen();
    expect(screen.getByText(formatMoney(expected.totalCost))).toBeOnTheScreen();
    expect(screen.getByText('Estimated repayment')).toBeOnTheScreen();
    expect(screen.getByText('Estimated interest')).toBeOnTheScreen();
    expect(screen.getByText('Estimated total cost')).toBeOnTheScreen();
  });

  test('no affordability, approval or eligibility language renders', () => {
    expect(screen.queryByText(/afford|approval|eligib|borrowing capacity/i)).toBeNull();
  });

  test('every customer-facing Text and TextInput resolves to Figtree at runtime', () => {
    expect(collectFontOffenders()).toEqual([]);
  });

  // Interaction tests run on the pristine default inputs FIRST, then
  // degrade the state — each fire is awaited before the next assertion.
  test('frequency switch keeps the engine\'s own per-period figure', async () => {
    fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    const weekly = computeHomeLoanRepayment({ ...LOAN_DEFAULTS, frequency: 'weekly' });
    expect(await screen.findByText(`${formatMoney(weekly.repaymentPerPeriod)} / week`)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    expect(await screen.findByText(`${formatMoney(computeHomeLoanRepayment(LOAN_DEFAULTS).repaymentPerPeriod)} / month`)).toBeOnTheScreen();
  });

  test('a 0-year term is refused as guidance, never presented as a repayment', async () => {
    fireEvent.changeText(screen.getByLabelText('Loan term in years'), '0');
    await screen.findByTestId('homeloan-guidance');
    expect(screen.queryByTestId('homeloan-result')).toBeNull();
    expect(screen.queryByText(/\$500,000 \/ month/)).toBeNull();
  });

  test('restoring a valid term restores the one result surface', async () => {
    fireEvent.changeText(screen.getByLabelText('Loan term in years'), '30');
    await screen.findByTestId('homeloan-result');
    expect(screen.queryByTestId('homeloan-guidance')).toBeNull();
  });

  test('a malformed loan amount is refused as guidance', async () => {
    fireEvent.changeText(screen.getByLabelText('Loan amount in dollars'), '6000e3');
    await screen.findByTestId('homeloan-guidance');
    await waitFor(() => expect(screen.queryByTestId('homeloan-result')).toBeNull());
  });
});
