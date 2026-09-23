// Pass D.4 — rendered proofs for the two "Why this amount?" sheets: one consistent,
// numbers-first hierarchy, everything reachable in the same scroll without an expand
// control, every state preserved, and no writes. REAL engines, selectors and sheet
// hosts. The clock is FROZEN to the local date 2026-09-22 (Date only).
//   §1 selected-date mode  §2 payday mode  §3 states  §4 writes and dismissal
//   §5 responsive, themes and accessibility semantics
// NOT proven here: native sheet animation, real VoiceOver speech, device layout.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { LookAheadSheet } from '../../src/components/money/LookAheadSheet';
import { SafeToSpendHero } from '../../src/components/money/SafeToSpendHero';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { buildAupDailyGuideExplanation, buildAupExplanation } from '../../src/lib/calculations/safeToSpendPresentation';
import { selectDailyGuideCalculation, selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { formatCentsCentsAware, formatDollarsCentsAware } from '../../src/lib/calculations/money';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { SHARED_COLORS } from '../../src/theme/semanticTokens';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 22, 9, 0);
const TODAY = new Date(2026, 8, 22);
const ASOF = localDate(2026, 9, 22);
const TARGET = localDate(2026, 9, 30);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => (StyleSheet.flatten(st) ?? {}) as Record<string, unknown>;
const setWindow = (fontScale: number, width = 390, height = 844) => Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } } as never);

type Shape = 'healthy' | 'shortfall_then_positive' | 'below_zero' | 'invalid';
function seed(shape: Shape = 'healthy', theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary', savingsAllocation: { mode: 'percent', percent: 0.05 }, theme } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 6000, includeInMoneyCalculations: true } as Asset,
    { id: 'Sav', type: 'savings', label: 'House deposit', currentValue: 2000, includeInMoneyCalculations: false } as Asset,
  ];
  const rent = shape === 'shortfall_then_positive' ? 7000 : shape === 'below_zero' ? 9000 : shape === 'invalid' ? 0 : 1000;
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: rent, frequency: 'monthly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
    ...(shape === 'shortfall_then_positive'
      ? [{ id: 'topup', type: 'income', label: 'Side work', amount: 9000, frequency: 'monthly', nextDueDate: iso(2026, 9, 26), isFixed: false, active: true } as RecurringItem]
      : []),
  ];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: iso(2029, 9, 1), status: 'active', priority: 'medium' } as never];
  return syncIncomeAggregate(d);
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
const CustomSheet = ({ data, target = TARGET, onClose = () => {} }: { data: AppData; target?: typeof TARGET; onClose?: () => void }) => (
  <Wrap>
    <LookAheadSheet visible data={data} asOf={ASOF} target={target} timelineCycleStart={localDate(2026, 9, 20)} onClose={onClose} />
  </Wrap>
);
const Hero = ({ data }: { data: AppData }) => (
  <Wrap>
    <SafeToSpendHero safeToSpend={computeSafeToSpend(data, TODAY)} hasActiveGoals onCreateGoal={() => {}} heroCopy={computeMoneyHeroCopy(data)} onOpenTimeframe={() => {}} showManageBalancesLink={false} />
  </Wrap>
);
async function openPaydaySheet(data: AppData) {
  const user = userEvent.setup();
  await render(<Hero data={data} />);
  await user.press(await screen.findByTestId('money-aup-hero-info'));
  await screen.findByTestId('aup-why-breakdown');
  return user;
}
/** testIDs in document order, restricted to the ones named. */
function orderOf(node: any, ids: string[]): string[] {
  const seen: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    const id = n.props?.testID;
    if (typeof id === 'string' && ids.includes(id) && !seen.includes(id)) seen.push(id);
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return seen;
}

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });
beforeEach(async () => {
  await AsyncStorage.clear();
  setWindow(1);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});
afterEach(async () => { await settle(40); setItem().mockClear(); jest.restoreAllMocks(); });

describe('D.4 §1 — the selected-date sheet', () => {
  test('one continuous scroll: subtitle, summary, ledger, the binding arithmetic, the lowest point, what sits outside, the assumptions and the provenance — all without an expand control', async () => {
    const data = seed();
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    const guide = computeDailyGuide(data, ASOF, TARGET, r);
    const calc = selectDailyGuideCalculation(guide)!;
    const p = selectLookAheadPresentation(r);
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-result');

    // No control stands between the customer and any of it.
    expect(screen.queryByTestId('look-ahead-breakdown-toggle')).toBeNull();
    expect(screen.queryByTestId('look-ahead-assumptions-toggle')).toBeNull();
    expect(screen.queryByText(/Read more|Show more/i)).toBeNull();

    // 1 timeframe, 2 the two figures, 3 the arithmetic behind the main amount…
    expect(screen.getByTestId('look-ahead-subtitle')).toHaveTextContent(`By ${p.targetDateLabel}`);
    expect(screen.getByTestId('look-ahead-amount')).toHaveTextContent(p.headlineAmount as string);
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent(formatCentsCentsAware(guide.displayCents as number));
    expect(screen.getByTestId('look-ahead-summary-caption')).toHaveTextContent('Before everyday spending.');
    const ledger = within(screen.getByTestId('look-ahead-breakdown'));
    // The sheet's ledger keeps two decimals on every line (the accepted C.1 format).
    expect(ledger.getByLabelText(/^Starting included money: \$6,000\.00$/)).toBeTruthy();
    expect(ledger.getByLabelText(/^Bills and commitments: minus \$[\d,]+\.\d{2}$/)).toBeTruthy();
    expect(screen.getByTestId('look-ahead-breakdown-total')).toHaveTextContent(p.headlineAmount as string, { exact: false });
    // A genuinely-zero commitment CATEGORY is omitted; the frame of the calculation is
    // kept even at zero, so the customer can still see what the estimate started from.
    expect(r.breakdown.mortgageCents).toBe(0);
    expect(r.breakdown.cardCents).toBe(0);
    for (const gone of ['Mortgage repayments', 'Credit-card repayments', 'BNPL repayments', 'Other loan repayments']) expect(screen.queryByText(gone)).toBeNull();
    expect(ledger.getByLabelText(/^Assumed income through your selected date: /)).toBeTruthy();
    expect(ledger.getByLabelText(/^Starting included money: /)).toBeTruthy();
    // …4 the calculation behind the daily guide, using the BINDING inputs…
    expect(screen.getByTestId('look-ahead-daily-limiting')).toHaveTextContent(calc.equation);
    expect(screen.getByTestId('look-ahead-daily-limiting-date')).toHaveTextContent(`Tightest spending point · ${calc.limitingDateLabel}`);
    // The rounding note appears only when the division is not exact — and when it does,
    // it states this sheet's OWN rule (down), never the payday sheet's (nearest).
    if (calc.roundingNote) expect(screen.getByTestId('look-ahead-daily-rounding')).toHaveTextContent('Rounded down to whole dollars.');
    expect(screen.queryByText(/nearest dollar/)).toBeNull();
    expect(screen.getByTestId('look-ahead-daily-protected')).toHaveTextContent(/^Keeps \$|^Nothing else is scheduled/);
    expect(screen.getByTestId('look-ahead-daily-coverage')).toHaveTextContent(/^This guide covers /);
    // …5 the few dates, exclusions and assumptions.
    expect(within(screen.getByTestId('look-ahead-lowest')).getByTestId('look-ahead-lowest-row')).toHaveTextContent(formatCentsCentsAware(r.lowest.cents), { exact: false });
    expect(screen.getByTestId('look-ahead-excluded-amount')).toHaveTextContent(formatCentsCentsAware(r.protectedSavings.cents), { exact: false });
    expect(screen.getByTestId('look-ahead-excluded-savings')).toHaveTextContent(/isn’t counted in the .* starting amount\./);
    expect(screen.getByTestId('look-ahead-excluded-account-Sav')).toHaveTextContent('House deposit', { exact: false });
    expect(screen.getByTestId('look-ahead-planned')).toHaveTextContent(formatCentsCentsAware(r.informationalPlan.combinedCents as number), { exact: false });
    const body = screen.getByTestId('look-ahead-assumptions-body');
    // D.5 — the assumed-income caveat now sits beside the ledger row it qualifies, so it
    // appears only when there IS assumed income. This fixture has none.
    expect(screen.queryByTestId('look-ahead-assumed')).toBeNull();
    expect(screen.getByTestId('look-ahead-provenance')).toHaveTextContent(/An estimate, not a guarantee/);
    expect(within(body).getByTestId('look-ahead-cycle-start')).toHaveTextContent(/estimated cycle start, 20 Sep/);
    expect(screen.getByTestId('look-ahead-provenance')).toHaveTextContent('Based on your recorded balances and schedules. An estimate, not a guarantee.');

    // The reading order is the hierarchy.
    expect(orderOf(screen.getByTestId('look-ahead-result'), ['look-ahead-summary', 'look-ahead-breakdown', 'look-ahead-daily-guide', 'look-ahead-lowest', 'look-ahead-protected', 'look-ahead-assumptions', 'look-ahead-provenance']))
      .toEqual(['look-ahead-summary', 'look-ahead-breakdown', 'look-ahead-daily-guide', 'look-ahead-lowest', 'look-ahead-protected', 'look-ahead-assumptions', 'look-ahead-provenance']);
    // Excluded savings and planned allocations stay DISTINCT facts.
    expect(screen.getByTestId('look-ahead-excluded-amount')).not.toBe(screen.getByTestId('look-ahead-planned'));
    expect(r.protectedSavings.cents).not.toBe(r.informationalPlan.combinedCents);
  }, 60000);

  test('the limiting day is reported independently of the lowest-balance day', async () => {
    const data = seed();
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    const guide = computeDailyGuide(data, ASOF, TARGET, r);
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-daily-guide');
    // Neither figure is the other's, and neither is the target balance.
    expect(screen.getByTestId('look-ahead-daily-limiting')).toHaveTextContent(selectDailyGuideCalculation(guide)!.equation);
    expect(screen.getByTestId('look-ahead-lowest-row')).toHaveTextContent(`On ${r.lowest.date.day} Sep`, { exact: false });
    expect(screen.getByTestId('look-ahead-lowest-row')).toHaveTextContent(formatCentsCentsAware(r.lowest.cents), { exact: false });
  }, 60000);
});

describe('D.4 §2 — the payday sheet', () => {
  test('the same hierarchy: "Why this amount?", "Until payday · 5 Oct", the two figures, the reconciled ledger, the division, the dates used and what it means', async () => {
    const data = seed();
    const s = computeSafeToSpend(data, TODAY);
    const ledger = buildAupExplanation(s);
    const g = buildAupDailyGuideExplanation(s)!;
    await openPaydaySheet(data);
    expect(screen.getByText('Why this amount?')).toBeOnTheScreen();
    expect(screen.getByText('Until payday · 5 Oct')).toBeOnTheScreen();
    expect(screen.getByTestId('aup-why-amount')).toHaveTextContent(formatCentsCentsAware(Math.round(s.cycleRemainingPool * 100)));
    expect(screen.getByTestId('aup-why-daily')).toHaveTextContent(g.daily);
    expect(screen.getByTestId('aup-why-summary-caption')).toHaveTextContent('After bills, planned savings and goals.');
    // The ledger reconciles to the cent, and the total names the measure.
    const breakdown = within(screen.getByTestId('aup-why-breakdown'));
    expect(breakdown.getByLabelText(`Balances included: ${formatDollarsCentsAware(ledger.rows[0].cents / 100)}`)).toBeTruthy();
    expect(screen.getByTestId('aup-why-total')).toHaveTextContent(formatDollarsCentsAware(ledger.remainderCents / 100), { exact: false });
    expect(breakdown.getByLabelText(`Available until payday: ${formatDollarsCentsAware(ledger.remainderCents / 100)}`)).toBeTruthy();
    // The division, with the ACTUAL payday rounding rule.
    expect(screen.getByTestId('aup-why-guide-equation')).toHaveTextContent(g.equation);
    if (g.roundingNote) expect(screen.getByTestId('aup-why-guide-rounding')).toHaveTextContent('Rounded to the nearest dollar.');
    expect(screen.queryByText(/Rounded down/)).toBeNull(); // that is the selected-date rule, not this one
    // Dates, meaning, provenance.
    expect(screen.getByTestId('aup-why-cycle-start')).toHaveTextContent('Estimated cycle start', { exact: false });
    expect(screen.getByTestId('aup-why-payday')).toHaveTextContent('5 Oct', { exact: false });
    const notes = within(screen.getByTestId('money-aup-method-notes'));
    expect(notes.getByText('Your included balances, less the bills, savings and goals still due by payday.')).toBeTruthy();
    expect(notes.getByTestId('money-aup-method-not-included')).toHaveTextContent(/aren’t included in this amount/);
    expect(screen.getByTestId('aup-why-provenance')).toHaveTextContent('An estimate, not a guarantee.', { exact: false });
    expect(orderOf(screen.getByTestId('aup-why-summary').parent, ['aup-why-summary', 'aup-why-breakdown', 'aup-why-guide', 'aup-why-dates', 'money-aup-method-notes', 'aup-why-provenance']))
      .toEqual(['aup-why-summary', 'aup-why-breakdown', 'aup-why-guide', 'aup-why-dates', 'money-aup-method-notes', 'aup-why-provenance']);
    // No future income is added to Available until payday: no ledger row admits one.
    // (The method note still DISCLOSES that expected income is excluded — that is the point.)
    const ledgerLabels = within(screen.getByTestId('aup-why-breakdown')).getAllByLabelText(/: /).map((n) => String(n.props.accessibilityLabel));
    expect(ledgerLabels.some((l) => /assumed income|expected income/i.test(l))).toBe(false);
    expect(within(screen.getByTestId('money-aup-method-notes')).getByTestId('money-aup-method-not-included')).toHaveTextContent(/aren’t included in this amount/);
  }, 60000);

  test('both sheets use the SAME section vocabulary, so the two modes read alike', async () => {
    await openPaydaySheet(seed());
    for (const t of ['Balance breakdown', 'Your daily guide']) expect(screen.getByText(t)).toBeOnTheScreen();
    await screen.findByTestId('aup-why-provenance');
    const paydayProvenance = screen.getByTestId('aup-why-provenance').props.children;
    await render(<CustomSheet data={seed()} />);
    await screen.findByTestId('look-ahead-result');
    for (const t of ['Balance breakdown', 'Your daily guide']) expect(screen.getByText(t)).toBeOnTheScreen();
    expect(screen.getByTestId('look-ahead-provenance').props.children).toBe(paydayProvenance);
  }, 60000);
});

describe('D.4 §3 — every state is preserved', () => {
  test('negative target: the sign agrees across summary, ledger and VoiceOver; the shortfall warning sits beside the result; first shortfall and ending deficit stay distinct', async () => {
    const data = seed('below_zero');
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    expect(r.targetCents).toBeLessThan(0);
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-result');
    const p = selectLookAheadPresentation(r);
    const signed = p.headlineAmount as string;
    expect(signed.startsWith('-$')).toBe(true);
    expect(screen.getByTestId('look-ahead-amount')).toHaveTextContent(signed, { exact: false });
    expect(screen.getByTestId('look-ahead-breakdown-total')).toHaveTextContent(signed, { exact: false });
    expect(screen.getByTestId('look-ahead-amount-figure').props.accessibilityLabel).toBe(`Estimated balance: ${p.headlineAmountSpoken}`);
    expect(flat(screen.getByTestId('look-ahead-amount').props.style).color).toBe(SHARED_COLORS.light.warning);
    // Never a positive absolute gap under "Estimated balance".
    expect(screen.queryByText(signed.replace('-', ''))).toBeNull();
    // The warning is beside the result, with a glyph — not only colour, and not in a footer.
    const notice = screen.getByTestId('look-ahead-cashflow');
    expect(notice).toHaveTextContent(`Possible shortfall of ${formatCentsCentsAware(r.firstShortfall!.shortfallCents)}`, { exact: false });
    expect(screen.getByTestId('look-ahead-deficit')).toHaveTextContent(/more than your cash by/);
    expect(flat(notice.props.style).backgroundColor).toBe(SHARED_COLORS.light.warningTint);
    expect(orderOf(screen.getByTestId('look-ahead-result'), ['look-ahead-summary', 'look-ahead-cashflow', 'look-ahead-breakdown'])).toEqual(['look-ahead-summary', 'look-ahead-cashflow', 'look-ahead-breakdown']);
  }, 60000);

  test('positive ending after an earlier shortfall: the warning stays and the guide stays unavailable — no reassuring treatment', async () => {
    const data = seed('shortfall_then_positive');
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    expect(r.targetCents).toBeGreaterThan(0);
    expect(r.firstShortfall).not.toBeNull();
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-result');
    expect(screen.getByTestId('look-ahead-cashflow')).toHaveTextContent(/Possible shortfall of/);
    expect(flat(screen.getByTestId('look-ahead-cashflow').props.style).backgroundColor).toBe(SHARED_COLORS.light.warningTint);
    expect(screen.getByTestId('look-ahead-daily-amount')).toHaveTextContent('—');
    expect(screen.queryByTestId('look-ahead-daily-limiting')).toBeNull(); // no invented arithmetic
    expect(screen.getByTestId('look-ahead-daily-explanation')).toHaveTextContent(/below \$0/);
    expect(screen.queryByText(/No scheduled shortfall detected/)).toBeNull();
  }, 60000);

  test('unavailable: no summary figure, no $0 standing in, the reason is stated and the provenance still closes the sheet', async () => {
    await render(<CustomSheet data={seed('invalid')} />);
    const body = await screen.findByTestId('look-ahead-unavailable');
    expect(screen.queryByTestId('look-ahead-summary')).toBeNull();
    expect(screen.queryByTestId('look-ahead-amount')).toBeNull();
    expect(screen.queryByTestId('look-ahead-breakdown')).toBeNull();
    expect(within(body).queryByText('$0')).toBeNull();
    expect(within(body).queryByText('$0.00')).toBeNull();
    expect(screen.getAllByTestId(/^look-ahead-issue-/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('look-ahead-provenance')).toBeOnTheScreen();
  }, 60000);
});

describe('D.4 §4 — the explanation journey writes nothing', () => {
  test('opening, reading and closing either sheet leaves storage byte-identical; one Close exits once', async () => {
    const user = userEvent.setup();
    const data = seed();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    let closes = 0;
    await render(<CustomSheet data={data} onClose={() => { closes += 1; }} />);
    await screen.findByTestId('look-ahead-result');
    // The provider performs its own pre-existing hydration housekeeping; measure the
    // explanation journey from the settled state.
    await settle();
    const before = await AsyncStorage.getItem(STORAGE_KEY);
    setItem().mockClear();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(closes).toBe(1));
    await settle();
    expect(closes).toBe(1);
    expect(writes()).toBe(0);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
    // The payday sheet: open, read, close.
    const user2 = await openPaydaySheet(data);
    await settle();
    setItem().mockClear();
    await user2.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('aup-why-breakdown')).toBeNull());
    await settle();
    expect(writes()).toBe(0);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 60000);
});

describe('D.4 §5 — responsive, themes and semantics', () => {
  test('320pt at maximum Dynamic Type: the summary stacks as whole units, nothing truncates or shrinks, and every section is still present', async () => {
    setWindow(3.1, 320, 568);
    await render(<CustomSheet data={seed()} />);
    await screen.findByTestId('look-ahead-result');
    const panel = screen.getByTestId('look-ahead-summary').children[0] as any;
    expect(flat(panel.props.style).flexDirection).toBe('column'); // stacked, not squeezed
    const stack: any[] = [screen.getByTestId('look-ahead-result')];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n === 'string') continue;
      expect(n.props?.numberOfLines).toBeUndefined();
      expect(n.props?.adjustsFontSizeToFit).toBeUndefined();
      expect(n.props?.horizontal).toBeUndefined();
      (n.children ?? []).forEach((c: any) => stack.push(c));
    }
    for (const id of ['look-ahead-breakdown', 'look-ahead-daily-guide', 'look-ahead-lowest', 'look-ahead-protected', 'look-ahead-assumptions', 'look-ahead-provenance']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  }, 60000);

  test('at ordinary text the two figures sit side by side', async () => {
    setWindow(1, 390);
    await render(<CustomSheet data={seed()} />);
    await screen.findByTestId('look-ahead-result');
    expect(flat((screen.getByTestId('look-ahead-summary').children[0] as any).props.style).flexDirection).toBe('row');
  }, 60000);

  test.each(['light', 'dark'] as const)('%s theme: the sheet uses that scheme’s own tokens', async (theme) => {
    const data = seed('below_zero', theme);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-result');
    await settle();
    const scheme = theme === 'dark' ? SHARED_COLORS.dark : SHARED_COLORS.light;
    await waitFor(() => expect(flat(screen.getByTestId('look-ahead-cashflow').props.style).backgroundColor).toBe(scheme.warningTint));
    expect(flat(screen.getByTestId('look-ahead-amount').props.style).color).toBe(scheme.warning);
  }, 60000);

  test('labels and values stay associated for VoiceOver, and currency and cents survive', async () => {
    const data = seed();
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    await render(<CustomSheet data={data} />);
    await screen.findByTestId('look-ahead-result');
    // Every ledger row is ONE accessible element carrying label AND amount.
    const rows = within(screen.getByTestId('look-ahead-breakdown')).getAllByLabelText(/: /);
    expect(rows.length).toBeGreaterThanOrEqual(4); // opening, assumed income, the non-zero commitments, the total
    for (const row of rows) {
      expect(row.props.accessible).toBe(true);
      expect(String(row.props.accessibilityLabel)).toMatch(/: (minus )?\$/);
    }
    // The summary group is read as one stop, with the measure named.
    expect(screen.getByTestId('look-ahead-amount-figure').props.accessibilityLabel).toContain('Estimated balance: ');
    // Exact cents are never rounded away in the ledger.
    expect(screen.getByTestId('look-ahead-breakdown-total')).toHaveTextContent(selectLookAheadPresentation(r).headlineAmount as string, { exact: false });
  }, 60000);
});
