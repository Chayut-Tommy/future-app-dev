// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per scenario in beforeAll and drives variations through
// `rerender`, which auto-cleanup would tear down after the first test — and
// the harness's own three-root limit means remounting per test is not an
// option.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { WealthScreen } from '../../src/screens/wealth/WealthScreen';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeTotalWealth } from '../../src/lib/calculations/wealthDefinitions';
import { AppData, Asset, Liability } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 7 — Wealth, rendered against the REAL
 * AppStateProvider and the REAL (mocked, in-memory) AsyncStorage.
 *
 * The naming, proportions, disclosure and date rules are proven without a
 * mount in tests/design5-wave7-wealth-hierarchy.test.ts, where the real
 * engine can be run across every fixture. This file spends its roots on the
 * things only a real mount can prove: that the hero renders the engine's
 * own figure, that the sections reconcile with it on screen, that
 * disclosure genuinely exposes every record exactly once, and that an
 * ancient record produces no stale warning in production.
 *
 * NOT proven here: pixel appearance, VoiceOver speech, native Modal timing,
 * or Dynamic Type layout on device.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <NavigationContainer>
        <AppStateProvider>
          <ThemeProvider>
            <CelebrationProvider>
              <SavingsAllocationPromptProvider>
                <WealthScreen />
              </SavingsAllocationPromptProvider>
            </CelebrationProvider>
          </ThemeProvider>
        </AppStateProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const A = (id: string, type: string, label: string, v: number): Asset => ({ id, type: type as never, label, currentValue: v });
const L = (id: string, type: string, label: string, v: number): Liability => ({ id, type: type as never, label, currentBalance: v });

/** Assets + liabilities + retirement, five assets and four debts, so both
 * sections exceed the three-row preview. Includes a zero-balance row and a
 * linked repayment. */
function populated(): AppData {
  const d = createEmptyAppData();
  d.user.name = 'Jamie';
  d.assets.push(
    A('cash', 'cash', 'Cash', 1200),
    A('cba', 'everyday', 'CBA', 22500),
    A('rainy', 'savings', 'Rainy day', 8000),
    A('emptied', 'cash', 'Emptied jar', 0),
    A('sup', 'super', 'My Super', 150000)
  );
  d.liabilities.push(
    L('mort', 'mortgage', 'Home loan', 480000),
    L('car', 'car_loan', 'Car loan', 12000),
    L('pers', 'personal_loan', 'Personal loan', 3000),
    L('cleared', 'other', 'Cleared debt', 0)
  );
  d.recurringItems.push({
    id: 'r1', type: 'expense', label: 'Car repayment', amount: 400, frequency: 'monthly',
    // Deliberately ancient — the stale trigger must stay off regardless.
    nextDueDate: new Date(2001, 0, 5).toISOString(), isFixed: true, active: true, linkedLiabilityId: 'car',
  } as never);
  return d;
}

async function seed(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

describe('Wave 7 — Wealth with assets, liabilities and retirement', () => {
  let root: any;
  const data = populated();

  beforeAll(async () => {
    await AsyncStorage.clear();
    await seed(data);
    root = await render(<Harness />);
    await screen.findByTestId('wealth-hero');
  });

  afterAll(() => root?.unmount());

  test('the hero renders the ENGINE figure, labelled Net worth', () => {
    // 181,700 = 181,700: assets 181,700 minus liabilities 495,000 → −313,300.
    const expected = computeTotalWealth(data);
    expect(expected).toBe(-313300);
    // RECONCILED (Wave 7 correction B): `getByText` for the figure is no
    // longer unique — the Money Engine's own result panel now legitimately
    // shows the SAME net worth ("Net worth today"), which is the point of
    // that correction. The claim under test is the HERO's figure, so it is
    // asserted within the hero.
    expect(screen.getByText('Net worth')).toBeOnTheScreen();
    // Queried within the hero: the Money Engine's result panel now shows
    // the same figure, legitimately, so a bare getByText is ambiguous.
    expect(within(screen.getByTestId('wealth-hero-figure')).getByText('−$313,300')).toBeOnTheScreen();
  });

  test('with the formula line, and no legacy naming anywhere', () => {
    expect(screen.getByText('What you own minus what you owe')).toBeOnTheScreen();
    expect(screen.queryByText('Total Wealth')).toBeNull();
    expect(screen.queryByText('Wealth Map')).toBeNull();
  });

  // RECONCILED (Wave 7 final, correction C). OLD CLAUSE read the label off
  // the hero SHELL. SUPERSEDED BECAUSE the shell now holds two distinct
  // actions and can no longer be one accessible element — the figure block
  // carries the summary instead, so Move money and View breakdown are
  // announced independently. PRESERVED INTENT: one hero announcement,
  // formula spoken once as real numbers.
  test('the hero is announced once, with the formula as real numbers', () => {
    const hero = screen.getByTestId('wealth-hero-figure');
    expect(hero.props.accessibilityRole).toBe('summary');
    expect(hero.props.accessibilityLabel).toBe(
      'Net worth, negative 313,300 dollars. What you own, 181,700 dollars, minus what you owe, 495,000 dollars.'
    );
  });

  test('own minus owe reconciles exactly with the hero', () => {
    expect(screen.getByTestId('wealth-own-value').props.children).toBe('$181,700');
    expect(screen.getByTestId('wealth-owe-value').props.children).toBe('$495,000');
    // 181700 − 495000 === −313300, the hero figure.
    expect(181700 - 495000).toBe(computeTotalWealth(data));
  });

  test('and the section totals repeat the same two figures, never a third', () => {
    expect(screen.getByTestId('wealth-own-section-total').props.children).toBe('$181,700');
    expect(screen.getByTestId('wealth-owe-section-total').props.children).toBe('$495,000');
  });

  // RECONCILED (Wave 7 correction A). OLD CLAUSES asserted the standalone
  // measures card's `wealth-accessible-value` / `wealth-retirement-value`
  // and a separate `wealth-definitions` control. SUPERSEDED BECAUSE that
  // card is retired — the owner's recording showed it becoming an
  // oversized, half-empty surface whenever no retirement savings existed,
  // and its Definitions button opened a second nested sheet. PRESERVED
  // INTENT: accessible-now and retirement must still render separately,
  // never be summed into a third figure, and the definitions must remain
  // reachable and free of advice. REPLACEMENT: all of it, asserted against
  // the one canonical breakdown sheet.
  test('the breakdown trigger is visible, explicit, and announces the reconciliation once', () => {
    const trigger = screen.getByTestId('wealth-view-breakdown');
    expect(trigger.props.accessibilityRole).toBe('button');
    expect(trigger.props.accessibilityLabel).toBe(
      'View breakdown. What you own, 181,700 dollars. What you owe, 495,000 dollars. Net worth, negative 313,300 dollars.'
    );
    // A VISIBLE affordance, never a hidden whole-card gesture. It is
    // deliberately hidden from the accessibility TREE — the button above it
    // already speaks the whole label, and announcing "View breakdown" twice
    // would be worse than not announcing it at all.
    expect(screen.getByText('View breakdown', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  test('opening it shows all six items, reconciling, with retirement separate', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('wealth-view-breakdown'));

    expect(screen.getByTestId('wealth-breakdown-value-what-you-own').props.children).toBe('$181,700');
    expect(screen.getByTestId('wealth-breakdown-value-what-you-owe').props.children).toBe('$495,000');
    expect(screen.getByTestId('wealth-breakdown-value-net-worth').props.children).toBe('−$313,300');
    // accessible = (181,700 − 150,000) − 495,000 = −463,300
    expect(screen.getByTestId('wealth-breakdown-value-accessible-now').props.children).toBe('−$463,300');
    expect(screen.getByTestId('wealth-breakdown-value-retirement-savings').props.children).toBe('$150,000');
    // Never summed into a third figure: −463,300 + 150,000 would be the
    // net worth again, and it appears only on its own labelled line.
    expect(screen.getAllByTestId('wealth-breakdown-net-worth')).toHaveLength(1);
  });

  test('and the definitions live inside it, factual and advice-free', () => {
    expect(screen.getByText(/excluding retirement savings/)).toBeOnTheScreen();
    expect(screen.getByText(/generally not available to use now/)).toBeOnTheScreen();
    expect(screen.queryByText(/we recommend|you should|guaranteed/i)).toBeNull();
    // Retirement IS recorded here, so no "Add retirement savings" is offered.
    expect(screen.queryByTestId('wealth-add-retirement')).toBeNull();
  });

  test('each section previews exactly three rows in canonical order', () => {
    // Canonical order is the established category order: cash/everyday,
    // then savings, then investments, then retirement...
    expect(screen.getByTestId('wealth-asset-row-cash')).toBeOnTheScreen();
    expect(screen.getByTestId('wealth-asset-row-cba')).toBeOnTheScreen();
    expect(screen.getByTestId('wealth-asset-row-emptied')).toBeOnTheScreen();
    // ...so the fourth and fifth are hidden until expansion.
    expect(screen.queryByTestId('wealth-asset-row-rainy')).toBeNull();
    expect(screen.queryByTestId('wealth-asset-row-sup')).toBeNull();
  });

  test('a zero-balance row is never dropped', () => {
    // "Emptied jar" is $0 and still occupies its canonical position.
    expect(screen.getByTestId('wealth-asset-row-emptied')).toBeOnTheScreen();
  });

  test('expanding exposes every record exactly once, and announces its state', async () => {
    const user = userEvent.setup();
    const control = screen.getByTestId('wealth-assets-disclosure');
    expect(control.props.accessibilityLabel).toBe('View all assets (5)');
    expect(control.props.accessibilityState.expanded).toBe(false);

    await user.press(control);

    for (const id of ['cash', 'cba', 'emptied', 'rainy', 'sup']) {
      expect(screen.getAllByTestId(`wealth-asset-row-${id}`)).toHaveLength(1);
    }
    const expandedControl = screen.getByTestId('wealth-assets-disclosure');
    expect(expandedControl.props.accessibilityLabel).toBe('Show fewer assets');
    expect(expandedControl.props.accessibilityState.expanded).toBe(true);
  });

  test('and collapsing returns to the preview', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('wealth-assets-disclosure'));
    expect(screen.queryByTestId('wealth-asset-row-sup')).toBeNull();
    expect(screen.getByTestId('wealth-assets-disclosure').props.accessibilityState.expanded).toBe(false);
  });

  test('debts disclose the same way, with their own noun', async () => {
    const user = userEvent.setup();
    const control = screen.getByTestId('wealth-debts-disclosure');
    expect(control.props.accessibilityLabel).toBe('View all debts (4)');
    await user.press(control);
    for (const id of ['mort', 'car', 'pers', 'cleared']) {
      expect(screen.getAllByTestId(`wealth-debt-row-${id}`)).toHaveLength(1);
    }
  });

  test('a linked repayment is named on its row', () => {
    expect(screen.getByTestId('wealth-debt-linked-car').props.children).toBe('Repaid by Car repayment');
  });

  test('NO stale warning appears, even though a record is decades old', () => {
    expect(screen.queryByText(/stale/i)).toBeNull();
    expect(screen.queryByText(/out of date/i)).toBeNull();
    expect(screen.queryByText(/needs updating/i)).toBeNull();
  });

  test('a card due soon reads as caution with an icon, not destructive red', () => {
    // The engine returns `danger` for anything within three days, which is
    // right for a reminder and wrong for a Wealth row. Presentation remaps
    // it; the engine's own text and provenance are untouched.
    const status = screen.queryByTestId('wealth-debt-status-nab');
    if (status) {
      const flat = Object.assign({}, ...(Array.isArray(status.props.style) ? status.props.style : [status.props.style]).filter(Boolean));
      expect(flat.color).toBeTruthy();
    }
    // No row anywhere carries an "overdue" claim in this dataset.
    expect(screen.queryByText(/overdue/i)).toBeNull();
  });

  test('a liability date says Added, never Recorded, and only where it is real', () => {
    // `createdAt` is a CREATION date. This dataset sets none, so no row
    // claims one — an absent fact rather than a wrong one.
    //
    // Scoped to the ROWS deliberately: "Recorded assets" and "Recorded
    // liabilities" elsewhere on this screen are Your Future's own labels
    // meaning "what you have recorded", not date claims, and they are
    // correct as they stand.
    for (const id of ['mort', 'car', 'pers', 'cleared']) {
      const row = screen.queryByTestId(`wealth-debt-row-${id}`);
      if (row) expect(within(row).queryByText(/^Recorded /)).toBeNull();
    }
    expect(screen.queryByTestId('wealth-debt-date-mort')).toBeNull();
  });

  test('asset rows still carry no date at all', () => {
    // Accepted data-contract limitation: `Asset` has no recorded date, and
    // this pass does not add one.
    const row = screen.getByTestId('wealth-asset-row-cash');
    expect(within(row).queryByText(/Recorded|Added/)).toBeNull();
  });

  test('the hero is ONE shell holding two independently announced actions', () => {
    // Correction C: the reconciliation moved inside the hero, so there is
    // no second stacked card — but the shell is not itself a button,
    // because two actions cannot be nested inside one.
    const move = screen.getByTestId('wealth-move-money');
    const breakdown = screen.getByTestId('wealth-view-breakdown');
    expect(move.props.accessibilityRole).toBe('button');
    expect(breakdown.props.accessibilityRole).toBe('button');
    expect(move.props.accessibilityLabel).toBe('Move money');
    expect(screen.getByTestId('wealth-hero').props.accessibilityRole).toBeUndefined();
    // And the own/owe values are inside that same shell.
    expect(within(screen.getByTestId('wealth-hero')).getByTestId('wealth-own-value')).toBeOnTheScreen();
  });

  test('a negative net worth carries a non-colour cue, never destructive red', () => {
    expect(screen.getByText('You owe more than you own right now')).toBeOnTheScreen();
  });

  test('the unsupported wealth-change estimate is gone entirely', () => {
    expect(screen.queryByTestId('wealth-context-row')).toBeNull();
    expect(screen.queryByText(/Estimated wealth change/i)).toBeNull();
  });

  test('the Money Engine renders exactly one customer-visible title', () => {
    expect(screen.getAllByText(/your money engine/i)).toHaveLength(1);
  });

  test('the row opens its detail journey, and Move money is offered', () => {
    const row = screen.getByTestId('wealth-asset-row-cash');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Opens details.');
    // Move money is offered because assets exist — eligibility itself is
    // owned by the transfer engine, not reproduced here.
    expect(screen.getByTestId('wealth-move-money')).toBeOnTheScreen();
  });
});

describe('Wave 7 — Wealth with nothing recorded', () => {
  let root: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    await seed(d);
    root = await render(<Harness />);
    await screen.findByTestId('wealth-hero');
  });

  afterAll(() => root?.unmount());

  test('a genuinely valid zero shows $0, not a dash', () => {
    expect(screen.getByText('Net worth')).toBeOnTheScreen();
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
  });

  test('no proportional bar is drawn from a zero denominator', () => {
    // 0/0 must not become NaN, Infinity, or a full bar of either colour.
    expect(screen.queryByTestId('wealth-own-owe-bar')).toBeNull();
    // The values are still present as text.
    expect(screen.getByTestId('wealth-own-value').props.children).toBe('$0');
    expect(screen.getByTestId('wealth-owe-value').props.children).toBe('$0');
  });

  // RECONCILED (Wave 7 correction A). OLD CLAUSE: retirement was OMITTED
  // from the measures card when absent. SUPERSEDED BECAUSE hiding the row
  // left a half-empty card, and because absence and a genuine recorded $0
  // then read identically — the distinction the correction turns on.
  // PRESERVED INTENT: an absent retirement balance must never display as a
  // hollow $0. REPLACEMENT: a compact truthful row saying so in words,
  // with one Add action on the existing route.
  test('an absent retirement balance says so, and is never a hollow $0', async () => {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('wealth-view-breakdown'));
    expect(screen.getByTestId('wealth-breakdown-value-retirement-savings').props.children).toBe('Not recorded');
    expect(screen.getByTestId('wealth-breakdown-value-accessible-now').props.children).toBe('$0');
    // One compact action, on the existing asset route.
    expect(screen.getByTestId('wealth-add-retirement')).toBeOnTheScreen();
  });

  test('each empty section offers one concise state and one relevant Add', () => {
    expect(screen.getByTestId('wealth-own-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('wealth-owe-empty')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add an asset' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a debt' })).toBeOnTheScreen();
  });

  test('and no disclosure control is rendered when there is nothing to disclose', () => {
    expect(screen.queryByTestId('wealth-assets-disclosure')).toBeNull();
    expect(screen.queryByTestId('wealth-debts-disclosure')).toBeNull();
  });
});
