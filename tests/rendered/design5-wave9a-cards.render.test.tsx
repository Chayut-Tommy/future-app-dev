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
import { CardsScreen } from '../../src/screens/cards/CardsScreen';
import { EmergencyFundScreen } from '../../src/screens/discover/EmergencyFundScreen';
import { SavingsComparisonScreen } from '../../src/screens/discover/SavingsComparisonScreen';
import { computeCreditAggregate } from '../../src/lib/calculations/creditHealth';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 9a — Cards, Emergency Fund and Savings Comparison,
 * RENDERED. Proves at runtime, from flattened styles and the real
 * accessibility tree, what the structural suite cannot: the "Credit
 * health {n}/100" line is genuinely gone and nothing score-like replaced
 * it; utilisation renders as the same engine value it always was, stated
 * as fact; the approved Emergency Fund guideline wording renders; the
 * Savings inline calculator shows guidance instead of a fabricated $0;
 * and every customer-facing Text and TextInput resolves to Figtree.
 *
 * NOT proven here: pixel appearance, VoiceOver speech, device keyboard
 * behaviour — see the Wave 9a device retest checklist.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

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

async function seed(mutate: (d: AppData) => void) {
  await AsyncStorage.clear();
  const d = createEmptyAppData();
  d.user.name = 'Jamie';
  d.user.hasSeenIntro = true;
  mutate(d);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

// Runtime typography walk — see design5-wave9a-calculators.render.test.tsx
// for the exclusion rationale (Ionicons glyphs; nested Text inherits).
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

const CARD_A = { id: 'c1', issuer: 'Visa', label: 'Everyday Visa', creditLimit: 5000, currentBalance: 1200, dueDay: 15, minimumPayment: 35 };
const CARD_B = { id: 'c2', issuer: 'Visa', label: 'Backup card', creditLimit: 5000, currentBalance: 4500, dueDay: 28, minimumPayment: 90 };

describe('Wave 9a — Cards', () => {
  let root: any;

  beforeAll(async () => {
    await seed((d) => {
      d.creditCards = [CARD_A, CARD_B] as never;
    });
    root = await render(standalone(CardsScreen));
    await screen.findByText('Everyday Visa');
  });

  afterAll(() => root?.unmount());

  test('"Credit health" renders nowhere, and no substitute score does either', () => {
    expect(screen.queryByText(/Credit health/)).toBeNull();
    expect(screen.queryByText(/\/\s*100/)).toBeNull();
    expect(screen.queryByText(/creditworthiness|eligib|approval/i)).toBeNull();
  });

  test('the aggregate states the engine\'s own utilisation as a fact, value unchanged', () => {
    const aggregate = computeCreditAggregate([CARD_A, CARD_B] as never);
    expect(screen.getByText(`${Math.round(aggregate.utilisation * 100)}% of limit used · ${aggregate.utilisation < 0.3 ? 'Healthy' : aggregate.utilisation < 0.7 ? 'Getting high' : 'High utilisation'}`)).toBeOnTheScreen();
    expect(screen.getByText(`$${aggregate.totalLimit.toLocaleString()}`)).toBeOnTheScreen();
    expect(screen.getByText(`$${aggregate.availableCredit.toLocaleString()}`)).toBeOnTheScreen();
  });

  test('each card row keeps its per-card utilisation value and caution stays worded, not colour-only', () => {
    // 1200/5000 = 24% — ordinary; 4500/5000 = 90% — the engine's existing
    // caution threshold, which must keep its words alongside any colour.
    expect(screen.getByText('24% of limit used · Healthy')).toBeOnTheScreen();
    expect(screen.getByText('90% of limit used · High utilisation')).toBeOnTheScreen();
  });

  test('each card row is ONE collapsed accessible sentence with balance, utilisation and repayment', () => {
    expect(screen.getByRole('button', { name: /Everyday Visa.*\$1,200 of \$5,000.*24% of limit used.*repay \$35 per month/ })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /Everyday Visa/ })).toHaveLength(1);
  });

  test('every customer-facing Text and TextInput resolves to Figtree at runtime', () => {
    expect(collectFontOffenders()).toEqual([]);
  });
});

describe('Wave 9a — Emergency Fund', () => {
  let root: any;

  beforeAll(async () => {
    await seed((d) => {
      d.recurringItems.push({ id: 'r1', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: new Date(2026, 8, 3).toISOString(), isFixed: true, active: true } as never);
      d.assets.push({ id: 'a1', type: 'cash', label: 'Cash', currentValue: 5400 } as never);
    });
    root = await render(standalone(EmergencyFundScreen));
    await screen.findByTestId('emergency-result');
  });

  afterAll(() => root?.unmount());

  test('the engine\'s exact months-covered figure renders (3.0 months for $5,400 at $1,800/mo)', () => {
    expect(screen.getByText('3.0 months')).toBeOnTheScreen();
    expect(screen.getByText('of expenses covered by your current cash')).toBeOnTheScreen();
  });

  test('the approved guideline wording renders and the old recommendation is gone', () => {
    expect(screen.getByText('A common guideline is 3–6 months')).toBeOnTheScreen();
    expect(screen.queryByText(/Recommended \(3-6 months\)/)).toBeNull();
    expect(screen.getByText('$5,400 - $10,800')).toBeOnTheScreen();
  });

  test('the breakdown keeps the engine\'s own figures', () => {
    expect(screen.getByText('Monthly expenses')).toBeOnTheScreen();
    expect(screen.getByText('$1,800')).toBeOnTheScreen();
    expect(screen.getByText('Current cash')).toBeOnTheScreen();
  });

  test('every customer-facing Text resolves to Figtree at runtime', () => {
    expect(collectFontOffenders()).toEqual([]);
  });
});

describe('Wave 9a — Savings Comparison', () => {
  let root: any;

  beforeAll(async () => {
    await seed(() => {});
    root = await render(standalone(SavingsComparisonScreen));
    await screen.findByText('Compare Savings');
  });

  afterAll(() => root?.unmount());

  test('the screen states that it compares rates the customer enters themselves', () => {
    expect(screen.getByText(/rates you enter yourself/)).toBeOnTheScreen();
    expect(screen.getByText(/doesn't have live bank rates/)).toBeOnTheScreen();
  });

  test('with empty inputs the inline calculator shows guidance, never a fabricated $0', () => {
    expect(screen.getByTestId('savings-calc-guidance')).toBeOnTheScreen();
    expect(screen.queryByTestId('savings-calc-result')).toBeNull();
    expect(screen.queryByText(/\$0\/yr/)).toBeNull();
  });

  test('valid inputs produce the same inline arithmetic as before ($20,000 at 4.85% → $970/yr · $81/mo)', async () => {
    fireEvent.changeText(screen.getByLabelText('Balance in dollars'), '20000');
    await waitFor(() => expect(screen.getByLabelText('Balance in dollars').props.value).toBe('20000'));
    fireEvent.changeText(screen.getByLabelText('Interest rate in percent per year'), '4.85');
    await screen.findByTestId('savings-calc-result');
    expect(screen.getByText('$970/yr · $81/mo')).toBeOnTheScreen();
  });

  test('malformed input returns to guidance, not $0', async () => {
    fireEvent.changeText(screen.getByLabelText('Balance in dollars'), '20k');
    await screen.findByTestId('savings-calc-guidance');
    await waitFor(() => expect(screen.queryByTestId('savings-calc-result')).toBeNull());
  });

  test('every customer-facing Text and TextInput resolves to Figtree at runtime', () => {
    expect(collectFontOffenders()).toEqual([]);
  });
});
