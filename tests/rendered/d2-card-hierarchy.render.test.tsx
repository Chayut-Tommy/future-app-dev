// Pass D.2 — rendered proofs for the Money card's simplified lower hierarchy, in BOTH
// modes. REAL navigator, provider, storage adapter, engines and sheets; the clock is
// FROZEN to the local date 2026-09-21 (Date only — timers stay real).
//   §1 payday mode: excluded-income wording, "before", one explanation entry, no status
//   §2 selected-date mode: "Assumed income", "through", status surface, tertiary foot
//   §3 status tones from the authoritative result; unavailable is never success
//   §4 figures and storage unchanged by looking; Back to payday writes nothing
//   §5 order for assistive technology, 320pt + max Dynamic Type, themes, Reduce Motion
// D.1 / Pass D regressions are proven by their own suites, which run unchanged.
// NOT proven here: real wrapping/overflow on a device, VoiceOver speech, visual polish.
// Run under TZ=UTC and TZ=Australia/Melbourne.

import React from 'react';
import { AccessibilityInfo, Dimensions, ScrollView, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider, syncIncomeAggregate } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeLookAheadProjection } from '../../src/lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../src/lib/calculations/dailyGuide';
import { computeProjectedEvents } from '../../src/lib/calculations/projectedEvents';
import { selectLookAheadPresentation } from '../../src/lib/calculations/lookAheadPresentation';
import { ScenarioPositionCard } from '../../src/components/money/ScenarioPositionCard';
import { formatCentsCentsAware } from '../../src/lib/calculations/money';
import { localDate } from '../../src/lib/calculations/localCalendar';
import { SHARED_COLORS } from '../../src/theme/semanticTokens';
import type { AppData, Asset, RecurringItem } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const FROZEN = new Date(2026, 8, 21, 18, 46);
const TODAY = new Date(2026, 8, 21);
const ASOF = localDate(2026, 9, 21);
const TARGET = localDate(2026, 9, 30);
const H = { includeHiddenElements: true };
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const setItem = () => AsyncStorage.setItem as jest.Mock;
const writes = () => setItem().mock.calls.filter((c) => c[0] === STORAGE_KEY).length;
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const flat = (st: unknown) => (StyleSheet.flatten(st) ?? {}) as Record<string, unknown>;
const setWindow = (fontScale: number, width = 390, height = 844) => Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } } as never);

type Shape = 'healthy' | 'temporary' | 'below' | 'invalid';
function seed(shape: Shape = 'healthy', theme: 'light' | 'dark' | 'system' = 'system'): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, name: 'Tommy', hasSeenIntro: true, savingsAllocationPromptHandled: true, mainPaydayIncomeId: 'salary', theme } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 8650, includeInMoneyCalculations: true } as Asset,
    { id: 'Rainy', type: 'savings', label: 'Rainy day', currentValue: 3500, includeInMoneyCalculations: false } as Asset,
  ];
  const gym = shape === 'temporary' ? 9000 : shape === 'below' ? 20000 : shape === 'invalid' ? 0 : 250;
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 4000, frequency: 'fortnightly', nextDueDate: iso(2026, 10, 5), isFixed: false, active: true } as RecurringItem,
    { id: 'dividends', type: 'income', label: 'Dividends', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true } as RecurringItem,
    { id: 'rental', type: 'income', label: 'Rental income', amount: 3000, frequency: 'monthly', nextDueDate: iso(2026, 9, 30), isFixed: false, active: true } as RecurringItem,
    { id: 'gym', type: 'expense', label: 'Gym', amount: gym, frequency: 'weekly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, categoryId: 'cat-health' } as RecurringItem,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1000, frequency: 'weekly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-rent' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}

function App() {
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

function Card({ data }: { data: AppData }) {
  const result = computeLookAheadProjection(data, ASOF, TARGET);
  const events = result.available ? computeProjectedEvents(data, ASOF, TARGET, { windowStart: ASOF }).events : null;
  const guide = result.available ? computeDailyGuide(data, ASOF, TARGET, result) : null;
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <ScenarioPositionCard presentation={selectLookAheadPresentation(result)} result={result} guide={guide} events={events} targetDateLabel="Wed, 30 Sep 2026" onOpenTimeframe={() => {}} onWhyThisAmount={() => {}} onBackToPayday={() => {}} onViewUpcomingEvents={() => {}} />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

let root: Awaited<ReturnType<typeof render>> | null = null;
let reduce: jest.SpyInstance;
const scrollTo = () => (ScrollView as any).prototype.scrollTo as jest.Mock;
async function launchMoney(data: AppData, reduceMotion = false) {
  if (root) { await root.unmount(); root = null; }
  reduce.mockResolvedValue(reduceMotion);
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  root = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }));
  await screen.findByTestId('money-timeframe-row');
  await settle();
}
/** Jest has no layout engine: give the existing "What happens next" section its position. */
async function layoutUpcomingSection(y = 1400) {
  let node: any = screen.getByTestId('money-section-next', H);
  while (node && typeof node.props?.onLayout !== 'function') node = node.parent;
  await fireEvent(node, 'layout', { nativeEvent: { layout: { x: 0, y, width: 358, height: 60 } } });
}
async function openMonthEnd() {
  await fireEvent.press(screen.getByTestId('money-timeframe-row'));
  await fireEvent.press(await screen.findByTestId('timeframe-month-end'));
  await screen.findByTestId('money-scenario-card');
}
/** testIDs in document order, restricted to the ones named. */
function orderOf(container: any, ids: string[]): string[] {
  const seen: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node === 'string') return;
    const id = node.props?.testID;
    if (typeof id === 'string' && ids.includes(id) && !seen.includes(id)) seen.push(id);
    (node.children ?? []).forEach(walk);
  };
  walk(container);
  return seen;
}
const textsUnder = (node: any): string[] => {
  const out: string[] = [];
  const walk = (n: any) => { if (typeof n === 'string') out.push(n); else (n?.children ?? []).forEach(walk); };
  walk(node);
  return out;
};

beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => { jest.useRealTimers(); setWindow(2); });
beforeEach(() => {
  setWindow(1);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
  scrollTo().mockClear();
});
afterEach(async () => {
  await settle(60);
  if (root) { await root.unmount(); root = null; }
  setItem().mockClear();
  jest.restoreAllMocks();
});

describe('D.2 §1 — payday mode', () => {
  test('excluded-income wording, "before [payday]", ONE explanation entry, no status surface, no detached paragraphs; the amount is the engine\'s', async () => {
    const user = userEvent.setup();
    const data = seed();
    await launchMoney(data);
    const s = computeSafeToSpend(data, TODAY);
    const hero = screen.getByTestId('money-aup-hero');
    // $8,650 − Gym (24 Sep, 1 Oct) $500 − Rent (28 Sep, 5 Oct) $2,000 = $6,150; income is NOT added.
    expect(s.daysRemaining).toBe(14);
    expect(screen.getByTestId('money-aup-hero-figure')).toHaveTextContent(/^\$6,150$/);
    // Legend: ONE group; the meaning of each marker is exact, never shortened to "Income".
    expect(within(hero).getAllByTestId('timeline-legend')).toHaveLength(1);
    const legend = textsUnder(within(hero).getByTestId('timeline-legend'));
    expect(legend).toEqual(['Expected income (not included)', 'Bills & repayments', 'Payday (not included)']);
    expect(within(hero).queryByText('Income')).toBeNull();
    expect(within(hero).queryByText('Assumed income')).toBeNull();
    // Estimated cycle start lives on the endpoint; the detached paragraphs are gone from the card.
    expect(screen.getByTestId('money-payday-bar-start-sublabel', H)).toHaveTextContent('Estimated cycle start');
    for (const gone of [/Cycle start estimated/, /Markers show dated events only/, /Your included balances, less the bills/]) expect(within(hero).queryByText(gone, H)).toBeNull();
    // No cash-path status in payday mode (no accepted AUP path output exists).
    expect(screen.queryByTestId('money-scenario-cashflow-row')).toBeNull();
    // Grouped actions: each once, "before" the payday, 44pt, button semantics.
    const group = within(hero).getByTestId('money-aup-actions');
    const events = within(group).getByTestId('money-aup-view-upcoming-events');
    const why = within(group).getByTestId('money-aup-hero-info');
    expect(screen.getAllByText('View upcoming events', H)).toHaveLength(1); // one row = one accessible element, so its text is a hidden descendant
    expect(screen.getAllByText('Why this amount?', H)).toHaveLength(1); // one row = one accessible element, so its text is a hidden descendant
    expect(events.props.accessibilityLabel).toBe('View upcoming events. See upcoming income, bills and repayments'); // Pass D.3 (F6): the honest destination
    expect(why.props.accessibilityLabel).toBe('Why this amount?. A quick breakdown');
    for (const row of [events, why]) { expect(row.props.accessibilityRole).toBe('button'); expect(Number(flat(row.props.style).minHeight)).toBeGreaterThanOrEqual(44); expect(row.props.accessibilityHint).toBeTruthy(); }
    // The header icon that opened the SAME sheet is not kept beside the row.
    expect(screen.queryByLabelText('How this was calculated')).toBeNull();
    expect(screen.getAllByTestId('money-aup-hero-info')).toHaveLength(1);
    // Pass D.5 — the ONE balances entry is the inline selector inside this card.
    expect(within(hero).getAllByTestId('money-inline-balances')).toHaveLength(1);
    expect(screen.queryByTestId('money-included-balances-row')).toBeNull();

    const before = await AsyncStorage.getItem(STORAGE_KEY); const w = writes();
    // View upcoming events: the existing list, once.
    await layoutUpcomingSection();
    scrollTo().mockClear();
    await user.press(events);
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    expect(scrollTo()).toHaveBeenCalledWith({ y: 1400, animated: true });
    // Why this amount?: the existing sheet, now carrying the relocated methodology.
    await user.press(why);
    // Pass D.4 — the sheet is titled "Why this amount?" like its selected-date twin; its
    // own subtitle names the mode, so it is what proves the sheet opened.
    expect(await screen.findByText('Until payday · 5 Oct')).toBeOnTheScreen();
    const notes = screen.getByTestId('money-aup-method-notes');
    expect(within(notes).getByText('Your included balances, less the bills, savings and goals still due by payday.')).toBeTruthy();
    expect(within(notes).getByTestId('money-aup-method-cycle-start')).toHaveTextContent(/estimated from your next payday/);
    expect(within(notes).getByTestId('money-aup-method-not-included')).toHaveTextContent(/aren’t included in this amount/);
    expect(within(notes).getByTestId('money-aup-method-markers')).toHaveTextContent('Markers show dated events only. Planned savings and goals aren’t shown here.');
    await settle();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(before);
  }, 120000);
});

describe('D.2 §2 — selected-date mode', () => {
  test('"Assumed income", "through [date]", never "Payday (not included)"; healthy status from the engine; quiet tertiary foot; methodology reachable; Back to payday writes nothing', async () => {
    const user = userEvent.setup();
    const data = seed();
    await launchMoney(data);
    const settled = await AsyncStorage.getItem(STORAGE_KEY); const w = writes();
    const aupFigure = textsUnder(screen.getByTestId('money-aup-hero-figure')).join('');
    await openMonthEnd();
    const card = screen.getByTestId('money-scenario-card');
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available) throw new Error('fixture');
    const g = computeDailyGuide(data, ASOF, TARGET, r);
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(formatCentsCentsAware(r.targetCents));
    expect(screen.getByTestId('money-scenario-daily')).toHaveTextContent(formatCentsCentsAware((g as { displayCents: number }).displayCents));
    // Legend semantics for an INCLUSIVE selected date.
    expect(within(card).getAllByTestId('timeline-legend')).toHaveLength(1);
    expect(textsUnder(within(card).getByTestId('timeline-legend'))).toEqual(['Assumed income', 'Bills & repayments']);
    expect(within(card).queryByText('Payday (not included)', H)).toBeNull();
    expect(within(card).queryByText(/Expected income/, H)).toBeNull();
    expect(within(card).queryByText(/Cycle start estimated/, H)).toBeNull();
    // Status: healthy, the engine's own lowest amount and date, NOT a control.
    const status = screen.getByTestId('money-scenario-cashflow-row');
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent('No scheduled shortfall detected');
    expect(screen.getByTestId('money-scenario-cashflow-detail')).toHaveTextContent(`Lowest scheduled end-of-day balance: ${formatCentsCentsAware(r.lowest.cents)} on ${r.lowest.date.day} Sep`);
    expect(flat(status.props.style).backgroundColor).toBe(SHARED_COLORS.light.successTint);
    expect(flat(screen.getByTestId('money-scenario-cashflow').props.style).color).toBe(SHARED_COLORS.light.success);
    expect(within(status).getByTestId('money-scenario-cashflow-icon-healthy', H)).toBeTruthy();
    expect(status.props.accessibilityRole).toBeUndefined();
    expect(status.props.onClick).toBeUndefined();
    expect(within(status).queryAllByRole('button')).toHaveLength(0);
    expect(JSON.stringify(status)).not.toMatch(/chevron/);
    // Grouped actions: each once, "through" the selected date.
    const group = screen.getByTestId('money-scenario-actions');
    const events = within(group).getByTestId('money-view-upcoming-events');
    const why = within(group).getByTestId('money-why-this-amount');
    expect(screen.getAllByText('View upcoming events', H)).toHaveLength(1); // one row = one accessible element, so its text is a hidden descendant
    expect(screen.getAllByText('Why this amount?', H)).toHaveLength(1); // one row = one accessible element, so its text is a hidden descendant
    expect(events.props.accessibilityLabel).toBe('View upcoming events. See upcoming income, bills and repayments'); // Pass D.3 (F6)
    expect(events.props.accessibilityLabel).not.toMatch(/before|through/);
    for (const row of [events, why]) { expect(row.props.accessibilityRole).toBe('button'); expect(Number(flat(row.props.style).minHeight)).toBeGreaterThanOrEqual(44); }
    // Tertiary foot: Back to payday once, provenance once, both AFTER the actions.
    expect(screen.getAllByTestId('money-back-to-payday')).toHaveLength(1);
    expect(screen.getAllByText("Based on what you've recorded and scheduled")).toHaveLength(1);
    expect(Number(flat(screen.getByTestId('money-back-to-payday').props.style).minHeight)).toBeGreaterThanOrEqual(44);
    // Order for assistive technology: result, timeline, legend, status, actions, tertiary.
    expect(orderOf(card, ['money-scenario-amount', 'money-scenario-timeline', 'timeline-legend', 'money-scenario-cashflow-row', 'money-scenario-actions', 'money-back-to-payday', 'money-scenario-provenance']))
      .toEqual(['money-scenario-amount', 'money-scenario-timeline', 'timeline-legend', 'money-scenario-cashflow-row', 'money-scenario-actions', 'money-back-to-payday', 'money-scenario-provenance']);

    // View upcoming events: once, the SAME destination as payday mode, target retained.
    await layoutUpcomingSection();
    scrollTo().mockClear();
    await user.press(events);
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    expect(scrollTo()).toHaveBeenCalledWith({ y: 1400, animated: true });
    expect(screen.getByTestId('money-scenario-amount')).toHaveTextContent(formatCentsCentsAware(r.targetCents));
    // Why this amount?: the existing sheet carries the methodology, incl. the estimated cycle start.
    await user.press(why);
    const body = await screen.findByTestId('look-ahead-assumptions-body');
    expect(within(body).getByTestId('look-ahead-cycle-start')).toHaveTextContent(/estimated cycle start, 21 Sep|estimated cycle start, \d+ Sep/);
    expect(screen.getByTestId('look-ahead-assumed')).toHaveTextContent(/assumed, not received/);
    // D.5 — this fixture plans nothing for savings or goals, so the statement about the
    // plan not being subtracted is omitted rather than repeated as empty boilerplate.
    expect(screen.queryByTestId('look-ahead-savings')).toBeNull();
    expect(screen.queryByTestId('look-ahead-planned')).toBeNull();
    expect(body).toHaveTextContent(/The timeline and its markers show dated events only/);
    expect(screen.getByTestId('look-ahead-excluded-savings')).toHaveTextContent(/isn’t counted in the .* starting amount/);
    await user.press(screen.getByRole('button', { name: /^(Done|Close)$/ }));
    await waitFor(() => expect(screen.queryByTestId('look-ahead-assumptions-body')).toBeNull());
    expect(screen.getByTestId('money-scenario-card')).toBeOnTheScreen(); // target preserved

    // Back to payday: once, no stale custom result, no write of any kind.
    await user.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
    expect(screen.queryByTestId('money-scenario-cashflow-row')).toBeNull();
    expect(textsUnder(screen.getByTestId('money-aup-hero-figure')).join('')).toBe(aupFigure);
    await settle();
    expect(writes()).toBe(w);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(settled);
  }, 120000);
});

describe('D.2 §3 — status tones come from the authoritative result', () => {
  // A shortfall before payday also takes Available until payday out of its amount state,
  // which has no "Change date" control — so these two branches are rendered through the
  // card itself, with the REAL engines and selectors.
  test('temporary shortfall: caution surface, alert glyph, shortfall legend entry, exact engine amount/date — never healthy', async () => {
    const data = seed('temporary');
    await render(<Card data={data} />);
    await screen.findByTestId('money-scenario-card');
    const r = computeLookAheadProjection(data, ASOF, TARGET); if (!r.available || !r.firstShortfall) throw new Error('fixture');
    expect(r.targetCents).toBeGreaterThanOrEqual(0);
    const status = screen.getByTestId('money-scenario-cashflow-row');
    expect(screen.getByTestId('money-scenario-cashflow')).toHaveTextContent(`Possible shortfall of ${formatCentsCentsAware(r.firstShortfall.shortfallCents)} on ${r.firstShortfall.date.day} Sep`);
    expect(flat(status.props.style).backgroundColor).toBe(SHARED_COLORS.light.warningTint);
    expect(within(status).getByTestId('money-scenario-cashflow-icon-caution', H)).toBeTruthy();
    expect(within(status).queryByTestId('money-scenario-cashflow-icon-healthy', H)).toBeNull();
    expect(screen.getByTestId('timeline-legend-shortfall')).toBeTruthy();
  }, 120000);

  test('target shortfall: caution surface with the existing final-deficit explanation as its supporting line', async () => {
    await render(<Card data={seed('below')} />);
    await screen.findByTestId('money-scenario-card');
    const status = screen.getByTestId('money-scenario-cashflow-row');
    expect(flat(status.props.style).backgroundColor).toBe(SHARED_COLORS.light.warningTint);
    expect(within(status).queryByTestId('money-scenario-cashflow-icon-healthy', H)).toBeNull();
    expect(within(status).getByTestId('money-scenario-deficit')).toHaveTextContent(/^Your scheduled commitments may be about \$[\d,.]+ more than your cash by 30 Sep 2026$/);
    expect(screen.getAllByTestId('money-scenario-deficit')).toHaveLength(1);
  }, 120000);

  test('invalid estimate: fail closed — no status, no success treatment, no information actions; Back to payday still works', async () => {
    const user = userEvent.setup();
    await launchMoney(seed('invalid'));
    await openMonthEnd();
    expect(screen.getByTestId('money-scenario-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('money-scenario-cashflow-row')).toBeNull();
    expect(screen.queryByTestId('money-scenario-cashflow-icon-healthy', H)).toBeNull();
    expect(JSON.stringify(screen.getByTestId('money-scenario-card'))).not.toContain(SHARED_COLORS.light.successTint);
    expect(screen.queryByTestId('money-scenario-actions')).toBeNull();
    expect(screen.queryByTestId('money-scenario-provenance')).toBeNull();
    await user.press(screen.getByTestId('money-back-to-payday'));
    await waitFor(() => expect(screen.queryByTestId('money-scenario-card')).toBeNull());
  }, 120000);
});

describe('D.2 §5 — responsive, themes and Reduce Motion', () => {
  test('320pt at font scale 3.1: nothing truncates, nothing is fixed-height, rows and legend items can wrap, targets stay 44pt', async () => {
    setWindow(3.1, 320, 568);
    await launchMoney(seed());
    await openMonthEnd();
    const card = screen.getByTestId('money-scenario-card');
    const lower = [screen.getByTestId('timeline-legend'), screen.getByTestId('money-scenario-cashflow-row'), screen.getByTestId('money-scenario-actions'), screen.getByTestId('money-scenario-tertiary')];
    for (const region of lower) {
      const stack: any[] = [region];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n === 'string') continue;
        const st = flat(n.props?.style);
        expect(n.props?.numberOfLines).toBeUndefined();
        expect(n.props?.adjustsFontSizeToFit).toBeUndefined();
        expect(st.height === undefined || n.props?.testID === undefined || typeof st.height !== 'number' || st.height <= 40).toBe(true); // only small glyph tiles have a height
        expect(n.props?.horizontal).toBeUndefined();
        (n.children ?? []).forEach((c: any) => stack.push(c));
      }
    }
    expect(flat(card.props.style).height).toBeUndefined();
    for (const id of ['money-view-upcoming-events', 'money-why-this-amount', 'money-back-to-payday']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(44);
    // Legend items wrap as complete units.
    const legendRow = screen.getByTestId('timeline-legend').children[0] as any;
    expect(flat(legendRow.props.style).flexWrap).toBe('wrap');
  }, 120000);

  test.each(['light', 'dark', 'system'] as const)('%s theme: the status uses that scheme\'s own success tokens and the hierarchy is identical', async (theme) => {
    await launchMoney(seed('healthy', theme));
    await openMonthEnd();
    const scheme = theme === 'dark' ? SHARED_COLORS.dark : SHARED_COLORS.light;
    await waitFor(() => expect(flat(screen.getByTestId('money-scenario-cashflow-row').props.style).backgroundColor).toBe(scheme.successTint));
    expect(flat(screen.getByTestId('money-scenario-cashflow').props.style).color).toBe(scheme.success);
    expect(screen.getAllByTestId('money-scenario-actions')).toHaveLength(1);
  }, 120000);

  test('Reduce Motion: the same final state; the upcoming-events scroll is simply not animated', async () => {
    const user = userEvent.setup();
    await launchMoney(seed(), true);
    await openMonthEnd();
    expect(screen.getByTestId('money-scenario-cashflow-row')).toBeOnTheScreen();
    await layoutUpcomingSection();
    scrollTo().mockClear();
    await user.press(screen.getByTestId('money-view-upcoming-events'));
    expect(scrollTo()).toHaveBeenCalledTimes(1);
    expect(scrollTo().mock.calls[0][0]).toMatchObject({ animated: false });
  }, 120000);
});
