// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per dataset in beforeAll and asserts against it across many
// tests, which auto-cleanup would tear down after the first one — and the
// harness's own three-root limit means remounting per test is not an
// option. Each describe unmounts its own root explicitly in afterAll.
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
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeThisMonthRecordedSummary } from '../../src/lib/calculations/monthlySummary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Nolie Design 5.1 Wave 6 — Money, rendered against the real navigator.
 *
 * The scenario matrix (fresh, partial, populated, shortfall, overspend,
 * irregular/absent payday, estimated rows, repayments, excluded balances,
 * invalid data, large and negative values) is exercised in
 * tests/design5-wave6-money-hierarchy.test.ts, where every case can run the
 * real engines and the real presentation rules without a mount. This file
 * spends its two available roots on the two things that are only true if
 * Money actually RENDERS: a fully-populated customer, and one with no
 * payday and nothing recorded.
 *
 * NOT proven here: pixel appearance, VoiceOver's real spoken order, or
 * Dynamic Type layout on device.
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

function fullData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  data.user.monthlyIncome = 5200;
  data.user.payFrequency = 'fortnightly';
  data.user.nextPayday = iso(11);
  data.user.moneyPictureChecklistDismissed = true;
  data.assets.push(
    { id: 'a1', label: 'Everyday', type: 'cash', currentValue: 3400, includeInMoneyCalculations: true } as any,
    { id: 'a2', label: 'Rainy day', type: 'savings', currentValue: 9000, includeInMoneyCalculations: false } as any
  );
  data.recurringItems.push(
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: iso(3), isFixed: true, active: true } as any
  );
  data.transactions.push(
    { id: 't1', type: 'income', amount: 2400, category: 'Salary', date: new Date().toISOString(), note: '' } as any,
    { id: 't2', type: 'expense', amount: 860, category: 'Groceries', date: new Date().toISOString(), note: '', paymentSource: 'cash' } as any
  );
  return data;
}

async function seed(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function visibleTexts(view: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.children) node.children.forEach(walk);
  };
  walk(view.toJSON());
  return out;
}

async function goToMoney() {
  fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
}

describe('Design 5.1 Wave 6 — Money, fully populated', () => {
  let view: any;
  let data: AppData;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    data = fullData();
    await seed(data);
    view = await render(<Harness />);
    await goToMoney();
    await screen.findByTestId('money-this-month-card');
  });

  afterAll(() => {
    view.unmount();
  });

  test('1. the payday bar renders from engine dates and carries one complete spoken equivalent', () => {
    const bar = view.getByTestId('money-payday-bar');
    const sts = computeSafeToSpend(data, new Date());

    const spoken: string = bar.props.accessibilityLabel;
    // Every fact the bar shows visually is in ONE label, including the
    // estimate caveat — a screen reader never assembles it from fragments.
    expect(spoken).toMatch(/^Pay cycle from .+ to .+\./);
    expect(spoken).toContain(`${Math.max(0, Math.round(sts.daysRemaining))} day`);
    expect(spoken).toMatch(/estimate/i);

    // The endpoints are the engine's own cycle dates.
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const texts = visibleTexts(view);
    expect(texts).toContain(fmt(sts.cycleStart));
    expect(texts).toContain(fmt(sts.cycleEnd));

    // Wave 6 Correction C — the rail now NAMES what it measures, so a
    // nearly-full bar cannot be read as money spent, and the day count is
    // stated once rather than twice.
    // The rail composes "{n} {day|days} left" from separate children, so
    // the rendered subtree is inspected rather than a joined string.
    const rail = JSON.stringify(view.getByTestId('money-payday-bar'));
    expect(rail).toContain('Pay cycle progress');
    expect(rail).toContain('left');
    expect(rail).toMatch(/"day"|"days"/);
    expect(texts).toContain('Cycle start estimated');
  });

  test('2. the included-balances row reflects the engine breakdown and says inclusion does not change net worth', () => {
    const row = view.getByTestId('money-included-balances-row');
    const sts = computeSafeToSpend(data, new Date());

    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Opens the balances included in your Available Until Payday estimate');

    // Wave 6 correction B — the label leads with the row's own name, states
    // the summary the way a customer would say it aloud, and names the
    // action. The support line is rendered separately, immediately below.
    const label: string = row.props.accessibilityLabel;
    expect(label).toMatch(/^Balances used, /);
    expect(label).toContain(`across ${sts.includedMoneyBalanceAccounts.length} account`);
    expect(label).toContain('Manage balances.');
    expect(visibleTexts(view)).toContain('Used only for this estimate — your Wealth total is unchanged.');

    // The excluded savings account is genuinely excluded by the engine —
    // the row reports the engine's own count, it does not filter.
    expect(sts.includedMoneyBalanceAccounts.some((a) => a.id === 'a2')).toBe(false);

    const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(56);
  });

  test('3. This Month renders the engine figures exactly, with no flip anywhere', () => {
    const summary = computeThisMonthRecordedSummary(data, new Date());
    const opts = { includeHiddenElements: true } as const;

    expect(view.getByTestId('this-month-income').props.children).toBeTruthy();
    const income = view.getByTestId('this-month-income', opts);
    expect(JSON.stringify(income)).toContain(`Income recorded $${Math.trunc(summary.incomeCents / 100).toLocaleString()}`);
    const spending = view.getByTestId('this-month-spending', opts);
    expect(JSON.stringify(spending)).toContain(`Spending recorded $${Math.trunc(summary.spendingCents / 100).toLocaleString()}`);
    const net = view.getByTestId('this-month-net', opts);
    expect(JSON.stringify(net)).toContain(`Net recorded $${Math.trunc(summary.netCents / 100).toLocaleString()}`);

    // No flip control, no hidden back face.
    const texts = visibleTexts(view);
    expect(texts).not.toContain('Show spending sources');
    expect(texts).not.toContain('Show monthly summary');
    expect(texts).not.toContain('View all sources');
    expect(JSON.stringify(view.getByTestId('money-this-month-card'))).not.toContain('rotateY');
  });

  test('4. the Sources sheet opens in ONE step and lists every source with a reconciling total', async () => {
    const summary = computeThisMonthRecordedSummary(data, new Date());
    expect(summary.spendingSources.length).toBeGreaterThan(0);

    const action = view.getByTestId('money-spending-sources-action');
    expect(action.props.accessibilityLabel).toBe('Spending sources');
    expect(action.props.accessibilityHint).toMatch(/^Opens which accounts and cards paid/);

    fireEvent.press(action);

    // The sheet's own accessible title.
    expect(await screen.findByText('How spending was paid')).toBeTruthy();

    // Every engine source is present, with its label, percentage and amount.
    // Wave 6 final refinement — each row now states its share inside one
    // "Paid this month · $X · N%" line, so the percentage is no longer a
    // bare standalone node. Every source is still present with its label,
    // its amount and its share.
    for (const source of summary.spendingSources) {
      expect(screen.getByText(source.label)).toBeTruthy();
      expect(
        screen.getByText(new RegExp(`Paid this month .* ${source.percentage}%`))
      ).toBeTruthy();
    }
    // And the card-balance clarification appears exactly once.
    expect(screen.getAllByTestId('sources-card-disclosure')).toHaveLength(1);
    // Nothing is collapsed into a "+N more" row.
    expect(screen.queryByText(/more sources/)).toBeNull();

    // And a reconciling total.
    expect(screen.getAllByText(/Spending recorded/).length).toBeGreaterThan(0);

    // Close restores Money.
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByTestId('money-this-month-card')).toBeTruthy();
  });

  test('4b. Wave 6 Correction B — the hero is one assembly, with the payday rail inside it', () => {
    const hero = view.getByTestId('money-aup-hero');
    const heroJson = JSON.stringify(hero);

    // Exactly one hero, one payday treatment, and the rail is INSIDE it.
    expect(view.getAllByTestId('money-aup-hero')).toHaveLength(1);
    expect(view.getAllByTestId('money-payday-bar')).toHaveLength(1);
    expect(heroJson).toContain('money-aup-hero-payday');
    expect(heroJson).toContain('money-payday-bar');

    // The dominant figure, reconciled to the engine, as one unsplit unit.
    const sts = computeSafeToSpend(data, new Date());
    const figure = view.getByTestId('money-aup-hero-figure', { includeHiddenElements: true });
    expect(String(figure.props.children)).toBe(`$${Math.round(sts.cycleRemainingPool).toLocaleString()}`);
    expect(figure.props.numberOfLines).toBe(1);
    expect(figure.props.style.fontSize).toBeGreaterThanOrEqual(40);
    expect(figure.props.accessibilityLabel).toMatch(/^Estimated remaining, \$/);

    // Identity is one heading; the icon is decorative.
    expect(view.getByRole('header', { name: 'Available until payday' })).toBeTruthy();
    expect(view.queryByTestId('money-aup-hero-icon')).toBeNull();
    expect(view.getByTestId('money-aup-hero-icon', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);

    // The information control is a real 44pt target with a label and hint.
    const info = view.getByTestId('money-aup-hero-info');
    expect(info.props.accessibilityLabel).toBe('How this was calculated');
    expect(info.props.accessibilityHint).toBe('Opens every line behind this estimate');
    const infoStyle = Array.isArray(info.props.style) ? Object.assign({}, ...info.props.style) : info.props.style;
    expect(infoStyle.width).toBeGreaterThanOrEqual(44);
    expect(infoStyle.height).toBeGreaterThanOrEqual(44);

    // No emoji, and the provenance line is present.
    expect(heroJson).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(visibleTexts(view)).toContain('Your included balances, less the bills, savings and goals still due before payday.');

    // Balances used stays OUTSIDE the hero, with one entry point.
    expect(heroJson).not.toContain('money-included-balances-row');
    expect(view.getAllByTestId('money-included-balances-row')).toHaveLength(1);
    expect(visibleTexts(view)).not.toContain('Manage balances');
  });

  test('5. every Money measure carries a definition, and Money Plan reads as a forecast, never proof', () => {
    const texts = visibleTexts(view).join(' | ');
    expect(texts).toContain('Your included balances, less the bills, savings and goals still due before payday.');
    expect(texts).toContain('Used only for this estimate — your Wealth total is unchanged.');
    expect(texts).toContain('What you have actually recorded so far this calendar month.');
    expect(texts).toContain('Bills, income and repayments scheduled from today onward.');

    // No definition claims certainty.
    expect(texts).not.toMatch(/guaranteed to have|you will have|we recommend/i);
  });

  test('6. Money shows exactly one hero and no duplicated measure', () => {
    expect(view.getAllByTestId('money-this-month-card')).toHaveLength(1);
    expect(view.getAllByTestId('money-included-balances-row')).toHaveLength(1);
    expect(view.getAllByTestId('money-payday-bar')).toHaveLength(1);
  });
});

describe('Design 5.1 Wave 6 — Money with no payday and nothing recorded', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const data = createEmptyAppData();
    data.user.name = 'Jamie';
    data.user.hasSeenIntro = true;
    await seed(data);
    view = await render(<Harness />);
    await goToMoney();
    await screen.findByTestId('money-this-month-card');
  });

  afterAll(() => {
    view.unmount();
    jest.restoreAllMocks();
  });

  test('7. no payday is stated honestly — no invented cycle, no progress rail, and exactly one action', () => {
    // Wave 6 Correction B — the payday rail is now the hero's own footer,
    // and it is shown for the states that HAVE a cycle. With no payday
    // recorded the hero takes its established dedicated branch, whose
    // "Add an expected payday" CTA is a real action rather than the rail's
    // passive "not recorded yet" line. Rendering both would be two
    // affordances for one gap, which the accepted state contract forbids.
    expect(view.queryByTestId('money-payday-bar')).toBeNull();
    expect(view.queryByTestId('money-payday-bar-unknown')).toBeNull();

    const texts = visibleTexts(view);
    // No invented cycle: no progress treatment of any kind on the page.
    expect(texts.filter((t) => /cycle start estimated/.test(t))).toHaveLength(0);
    // Wave 6 Correction C — with NO balances included, the converged hero
    // shows the no-balance state, which takes precedence: an estimate
    // cannot be produced at all until a balance is chosen, so asking for a
    // payday first would be the wrong request. Exactly ONE action either
    // way — the two never compete.
    expect(texts.filter((t) => t === 'Choose balances')).toHaveLength(1);
    expect(texts).not.toContain('Add an expected payday');
  });

  test('8. nothing recorded never becomes a fabricated zero', () => {
    const texts = visibleTexts(view);
    // The month card shows its explicit empty state rather than $0 figures.
    expect(texts).toContain('No transactions recorded yet.');
    expect(texts).not.toContain('Income recorded');
    // And the sources action does not exist — there is nothing to break down.
    expect(view.queryByTestId('money-spending-sources-action')).toBeNull();
  });

  test('9. the empty state shows exactly one balance action, and never a fabricated "$0"', () => {
    // Wave 6 correction C — with nothing included there is exactly ONE
    // visible balance action: the hero's own primary "Select balances" CTA.
    // The dedicated row is not rendered at all, so the two cannot compete.
    expect(view.queryByTestId('money-included-balances-row')).toBeNull();
    const texts = visibleTexts(view);
    // Wave 6 Correction C — the converged no-balance state, in the accepted
    // hero shell rather than the retired yellow/brown setup card.
    expect(texts).toContain('Available until payday');
    expect(texts).toContain('Choose balances to get your estimate');
    expect(texts).toContain('Choose balances');
    expect(texts.some((t) => /This changes this estimate only — not your Wealth total\./.test(t))).toBe(true);
    // No amount, no fabricated $0, and no rail — an estimate cannot exist
    // yet. Scoped to the HERO: Typical Money Flow legitimately shows $0
    // rows for a customer with no recurring items recorded.
    expect(view.queryByTestId('money-aup-hero-figure')).toBeNull();
    expect(JSON.stringify(view.getByTestId('money-aup-hero-no-balances'))).not.toContain('"$0"');
    expect(view.queryByTestId('money-aup-hero-payday')).toBeNull();
    // And exactly one balance affordance — no second "Manage balances" link.
    expect(texts).not.toContain('Manage balances');
    expect(texts.filter((t) => t === 'Choose balances')).toHaveLength(1);
  });
});
