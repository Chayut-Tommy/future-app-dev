// RNTL unmounts every root after each test by default. This suite mounts
// ONE root in beforeAll and asserts across many tests, which auto-cleanup
// would tear down after the first.
//
// DELIBERATELY ITS OWN FILE, for the reason design5-wave9a-shell.render
// .test.tsx documents: standalone mounts register navigator state in
// module-level shell singletons, which poisons a RootNavigator mounted
// afterwards in the same jest module realm. A fresh module registry per
// file keeps the evidence honest.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';

/**
 * Nolie Design 5.1 Wave 9a closure, Correction A — the STABLE customer
 * route to Cards, rendered against the real RootNavigator rather than a
 * mocked route in isolation.
 *
 * Journey: Money → Money plan → View full debt overview → View credit cards.
 *
 * Seeded with the owner's post-recording device data: two cards, combined
 * limits $20,000, combined used balance $10, AMEX at $0 and AMEX1 at $10
 * with a $50 expected monthly repayment.
 *
 * The pure classification (Cards dock-visible, owner tab Money) and the
 * structural wiring live in tests/design5-wave9a-cards-reachability.test.ts;
 * this file proves the mounted app actually behaves that way.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const navRef = createNavigationContainerRef<any>();

/** How many Cards entries are on the root stack right now — the double-tap
 * proof needs a count, not a boolean. */
function cardsOnStack(): number {
  const state: any = navRef.isReady() ? navRef.getRootState() : null;
  return ((state?.routes ?? []) as any[]).filter((r) => r.name === 'Cards').length;
}

function currentRootRoute(): string | undefined {
  const state: any = navRef.isReady() ? navRef.getRootState() : null;
  if (!state) return undefined;
  return state.routes[state.index]?.name;
}

describe('Wave 9a closure — Money reaches Cards without any reminder', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    // Device data after the owner's recording.
    d.creditCards = [
      { id: 'amex', issuer: 'AMEX', label: 'AMEX', creditLimit: 10000, currentBalance: 0, dueDay: 15, minimumPayment: 0, apr: 0.2 },
      { id: 'amex1', issuer: 'AMEX', label: 'AMEX1', creditLimit: 10000, currentBalance: 10, dueDay: 20, minimumPayment: 0, expectedMonthlyRepayment: 50, apr: 0.2 },
    ];
    // The mirror liability AppStateContext maintains for a card, so the
    // debt overview lists it exactly as it does on device.
    d.liabilities = [{ id: 'lam1', type: 'other', label: 'AMEX1', currentBalance: 10, creditCardId: 'amex1' }];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));

    root = await render(
      // 320pt — the narrowest phone width the design supports. jest-expo
      // additionally reports fontScale 2, so everything below is already
      // being measured at 200% Dynamic Type.
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <AppStateProvider>
          <ThemeProvider>
            <CelebrationProvider>
              <SavingsAllocationPromptProvider>
                <NavigationContainer ref={navRef}>
                  <RootNavigator />
                </NavigationContainer>
              </SavingsAllocationPromptProvider>
            </CelebrationProvider>
          </ThemeProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    );

    fireEvent.press(await screen.findByLabelText(/^Money, tab,/, {}, { timeout: 20000 }));
    await screen.findByText('View full debt overview', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => root?.unmount());

  test('the debt overview offers exactly ONE "View credit cards" action', async () => {
    fireEvent.press(screen.getByText('View full debt overview'));

    const actions = await screen.findAllByTestId('debt-overview-view-cards', {}, { timeout: 20000 });
    expect(actions).toHaveLength(1);
    // Two real cards on file, still one action — it is a set-level action,
    // never one affordance per row.
    expect(screen.getAllByLabelText('View credit cards')).toHaveLength(1);
  });

  test('it meets the accessibility contract, and can grow at 320pt / 200% type', () => {
    const action = screen.getByTestId('debt-overview-view-cards');
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.accessibilityLabel).toBe('View credit cards');
    expect(action.props.accessibilityHint).toBe('Opens your recorded credit card details');

    // Independent target is at least 44x44.
    const style = Array.isArray(action.props.style) ? Object.assign({}, ...action.props.style.filter(Boolean)) : action.props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    // It wraps rather than clipping when the label grows.
    expect(style.flexWrap).toBe('wrap');

    // The visible label is never truncated, and carries a real font family
    // (tokens.typography.* has none — that is the Wave 8 trap).
    const label = screen.getByText('View credit cards');
    expect(label.props.numberOfLines).toBeUndefined();
    const labelStyle = Array.isArray(label.props.style) ? Object.assign({}, ...label.props.style.filter(Boolean)) : label.props.style;
    expect(typeof labelStyle.fontFamily).toBe('string');
    expect(labelStyle.fontFamily).toMatch(/Figtree/i);
    expect(labelStyle.flexShrink).toBe(1);
  });

  test('the debt row itself is not falsely actionable', () => {
    // The AMEX1 row is presentation only — a loan row must never look like
    // it navigates, so no row carries a button role.
    const rowLabels = screen.queryAllByLabelText(/^AMEX1$/);
    rowLabels.forEach((n) => expect(n.props.accessibilityRole).not.toBe('button'));
  });

  test('double-tapping opens Cards exactly ONCE, with the sheet gone', async () => {
    expect(cardsOnStack()).toBe(0);

    const action = screen.getByTestId('debt-overview-view-cards');
    // Two presses in the same batch — the second lands before the sheet has
    // actually gone. The latch must swallow it.
    fireEvent.press(action);
    fireEvent.press(action);

    await screen.findAllByText(/of limit used/, {}, { timeout: 20000 });

    expect(cardsOnStack()).toBe(1);
    expect(currentRootRoute()).toBe('Cards');
    // Close-before-navigate: no empty debt sheet layered over Cards.
    expect(screen.queryByTestId('debt-overview-view-cards')).toBeNull();
    expect(screen.queryByText('Your debt overview')).toBeNull();
  });

  test('Cards shows the seeded aggregate, at the accepted integer rounding', () => {
    // Two cards: limits 10,000 + 10,000 = 20,000; used 0 + 10 = 10;
    // available 19,990; utilisation 10/20,000 = 0.0005 -> 0% under the
    // accepted integer rounding, which this correction does not change.
    expect(screen.getByText('Total limit')).toBeTruthy();
    expect(screen.getByText(/\$20,000/)).toBeTruthy();
    expect(screen.getByText(/\$19,990/)).toBeTruthy();
    // The aggregate line plus one line per card — all three read 0%, and
    // none of them rounds the $10 balance up to 1%.
    const utilLines = screen.getAllByText(/% of limit used/);
    expect(utilLines).toHaveLength(3);
    utilLines.forEach((n) => {
      const joined = (Array.isArray(n.props.children) ? n.props.children : [n.props.children]).join('');
      expect(joined).toMatch(/^0% of limit used/);
    });
  });

  test('Cards opens inside the shell, with Money as the owner tab', () => {
    // Guard: this assertion is only meaningful while Cards is on top.
    expect(currentRootRoute()).toBe('Cards');
    // The dock is present on Cards (it is a passive review, dock-visible).
    const moneyTab = screen.getByLabelText(/^Money, tab,/);
    expect(moneyTab).toBeTruthy();
    // And Money is the one selected pill.
    const tabs = ['Today', 'Money', 'Wealth', 'Grow'].map((n) => screen.getByLabelText(new RegExp(`^${n}, tab,`)));
    const selected = tabs.filter((t) => t.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toContain('Money');
  });

  test('Back returns to Money with no debt sheet layered underneath', async () => {
    await act(async () => {
      navRef.goBack();
    });
    await screen.findByText('View full debt overview', {}, { timeout: 20000 });

    expect(cardsOnStack()).toBe(0);
    expect(currentRootRoute()).toBe('Main');
    // The sheet must not be sitting there re-opened or half-dismissed.
    expect(screen.queryByTestId('debt-overview-view-cards')).toBeNull();
    expect(screen.queryByText('Your debt overview')).toBeNull();
  });

});
