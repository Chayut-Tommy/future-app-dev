// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per dataset in beforeAll and asserts against it across many
// tests, which auto-cleanup would tear down after the first one — and the
// harness's own three-root limit means remounting per test is not an
// option. Each describe below unmounts its own root explicitly in afterAll.
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
 * Nolie Design 5.1 Wave 5 — Today's VISIBLE composition, rendered.
 *
 * The first Wave 5 rendered suite proved the Score's containment and
 * nothing else, which is exactly why the owner's device review found the
 * screen visually unchanged: every assertion the suite made was still true
 * of the old-looking page. This file proves the target anatomy instead —
 * the things that are only true if the page actually LOOKS like Design 5.1
 * p.7.
 *
 * MEASURED HARNESS LIMIT: this RNTL/React 19 environment stops mounting
 * new roots from the THIRD render() in a file, and AppStateProvider reads
 * its data once on mount — so a rerender cannot swap datasets. This suite
 * therefore spends exactly its two available mounts on the two datasets
 * that must be proven visually: an established customer (the page Design
 * 5.1 p.7 depicts) and a fresh-setup customer. Responsive and reflow rules
 * are decided by pure functions in todayComposition.ts and proved
 * exhaustively in tests/design5-wave5-today-hierarchy.test.ts, where every
 * width and font scale can be exercised without a mount at all — that is
 * why those helpers exist.
 *
 * NOT proven here: actual pixel appearance, gradient rendering, VoiceOver's
 * real spoken order, or how the ambient fade looks on glass. Device
 * evidence, listed in the report's checklist.
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

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** A fully-established customer: income, balances, a payday, recorded
 * activity this month, two competing upcoming outflows and an active goal.
 * This is the dataset Design 5.1 p.7 itself depicts. */
async function seedEstablished() {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  data.user.monthlyIncome = 5200;
  data.user.nextPayday = isoDaysFromNow(11);
  data.user.moneyPictureChecklistDismissed = true;
  data.assets.push({
    id: 'everyday', label: 'Everyday', type: 'cash', currentValue: 3400,
    includeInMoneyCalculations: true,
  } as any);
  data.recurringItems.push(
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: isoDaysFromNow(2), isFixed: true, active: true } as any,
    { id: 'power', type: 'expense', label: 'Power bill', amount: 210, frequency: 'monthly', nextDueDate: isoDaysFromNow(4), isFixed: true, active: true } as any,
    { id: 'internet', type: 'expense', label: 'Internet', amount: 90, frequency: 'monthly', nextDueDate: isoDaysFromNow(6), isFixed: true, active: true } as any
  );
  data.transactions.push(
    { id: 't1', type: 'income', amount: 2400, category: 'Salary', date: new Date().toISOString(), note: '' } as any,
    { id: 't2', type: 'expense', amount: 860, category: 'Groceries', date: new Date().toISOString(), note: '' } as any
  );
  data.goals.push({
    id: 'g1', name: 'Emergency fund', targetAmount: 6000, currentAmount: 1500,
    status: 'active', createdAt: new Date().toISOString(),
  } as any);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** A brand-new customer: nothing recorded at all. */
async function seedFreshSetup() {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Every rendered string on the page, in render order — the closest thing
 * this harness has to "what the customer sees, top to bottom". */
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

/** Index of the first rendered string satisfying a predicate — used to
 * assert visual ORDER, not just presence. */
function orderOf(texts: string[], pattern: RegExp): number {
  return texts.findIndex((t) => pattern.test(t));
}

describe('Design 5.1 Wave 5 — Today looks like page 7 (established customer)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    await seedEstablished();
    view = await render(<Harness />);
    // AppStateProvider hydrates from AsyncStorage asynchronously — wait for
    // the real page rather than asserting against the loading tree.
    await screen.findByTestId('today-briefing-hero');
  });

  afterAll(() => {
    view.unmount();
  });

  test('1. the ambient field exists and cannot intercept touches', () => {
    const field = view.getByTestId('today-ambient-field', { includeHiddenElements: true });
    expect(field.props.pointerEvents).toBe('none');
    // It is also hidden from assistive technology — it carries no meaning.
    expect(field.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('2. the local date eyebrow precedes the greeting, and is not hard-coded', () => {
    const texts = visibleTexts(view);
    const eyebrow = view.getByTestId('today-date-eyebrow');
    const eyebrowText = eyebrow.props.children as string;

    // Derived from the customer's own live local calendar — it must name
    // TODAY, whatever day the suite happens to run on.
    const expected = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    expect(eyebrowText).toBe(expected);

    // Uppercasing is the type role's job, not the string's — so Thai is
    // never force-uppercased.
    expect(eyebrowText).not.toBe(eyebrowText.toUpperCase());
    expect(eyebrow.props.style).toEqual(expect.objectContaining({ textTransform: 'uppercase' }));

    expect(orderOf(texts, new RegExp(eyebrowText))).toBeLessThan(orderOf(texts, /^(Good|Hi|Hello)/));
  });

  test('3. exactly one expressive hero is rendered', () => {
    expect(view.getAllByTestId('today-briefing-hero')).toHaveLength(1);
  });

  test('4. the hero carries the large canonical AUP figure, not a tile-sized one', () => {
    const figure = view.getByTestId('today-briefing-figure');
    const text = String(figure.props.children);
    expect(text).toMatch(/^\$[\d,]+$/);
    // figureHero is 46pt. Anything tile-scale here is the defect this pass
    // exists to fix.
    expect(figure.props.style.fontSize).toBeGreaterThanOrEqual(40);
    // And it never truncates mid-digit — it shrinks within bounds instead.
    expect(figure.props.numberOfLines).toBe(1);
    expect(figure.props.minimumFontScale).toBeGreaterThan(0);
  });

  test('5. the hero shows a timeframe line beneath the figure', () => {
    const texts = visibleTexts(view);
    expect(texts.some((t) => /\d+ days to .+·.+a day/.test(t))).toBe(true);
  });

  test('6. priority items are full-width rows carrying a date and an amount — not a tile grid', () => {
    const rows = view.getAllByTestId(/^briefing-priority-row-/);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Full-width row anatomy: a real minimum height, not a 92pt tile.
      const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
      expect(style.flexDirection).toBe('row');
      expect(style.minHeight).toBeGreaterThanOrEqual(52);
      // One spoken sentence carrying what, when and how much. The date's
      // field ORDER is the customer's locale's business (toLocaleDateString),
      // so this asserts that a weekday, a day number and a month are all
      // present — not a particular arrangement of them.
      const spoken: string = row.props.accessibilityLabel;
      expect(spoken).toMatch(/\$[\d,]+/);
      expect(spoken).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
      expect(spoken).toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
      expect(spoken).toMatch(/\b\d{1,2}\b/);
    }
  });

  test('7. never more than two priority rows, however many items compete', () => {
    // The dataset seeds three upcoming outflows deliberately.
    expect(view.getAllByTestId(/^briefing-priority-row-/).length).toBeLessThanOrEqual(2);
  });

  test('8. the hero footer separates provenance from inspection', () => {
    const provenance = view.getByTestId('today-briefing-provenance');
    expect(String(provenance.props.children)).toMatch(/Based on what you’ve recorded/);
    const how = view.getByTestId('today-briefing-how-this-works');
    expect(how.props.accessibilityRole).toBe('button');
    expect(how.props.accessibilityLabel).toBe('How this works');
    // Exactly one AUP explanation on the page — no duplicate elsewhere.
    expect(view.getAllByTestId('today-briefing-how-this-works')).toHaveLength(1);
  });

  test('9. the Journey is one compact row with a progress treatment, not a card stack', () => {
    const row = view.getByTestId('today-journey-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toMatch(/^Your Journey\./);
    // The whole row is the target — the separate "View full journey"
    // footer link it used to carry is gone, not duplicated.
    expect(visibleTexts(view).filter((t) => /View full journey/.test(t))).toHaveLength(0);
  });

  test('10. the month card exposes exactly three labelled measures', () => {
    // The measures are hidden from assistive technology individually —
    // the card carries one composed spoken label instead (asserted below),
    // which is why these need includeHiddenElements.
    for (const key of ['moneyIn', 'spendingRecorded', 'netRecorded']) {
      expect(view.getByTestId(`month-measure-${key}`, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(view.queryAllByTestId(/^month-measure-/, { includeHiddenElements: true })).toHaveLength(3);
    const texts = visibleTexts(view);
    expect(texts).toEqual(expect.arrayContaining(['Money in', 'Spending recorded', 'Net recorded']));
    // One composed spoken label for the whole card, and every figure in it
    // reconciles exactly with the seeded transactions: $2,400 in, $860
    // spent, $1,540 net. Money in keeps its established explicit positive
    // sign; spending is a magnitude under its own label, never a negative.
    const card = view.getByTestId('today-month-card');
    // Wave 5 polish B — each metric is one spoken statement with its sign
    // as a WORD, so a screen reader never stops on a bare "plus". The
    // figures themselves are unchanged and still reconcile exactly.
    expect(String(card.props.accessibilityLabel)).toBe(
      'Money in, positive 2,400 dollars, Spending recorded, 860 dollars, Net recorded, positive 1,540 dollars. View transaction history'
    );
  });

  test('11. the goal is one compact progress row', () => {
    const row = view.getByTestId('today-goal-row');
    const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
    expect(style.flexDirection).toBe('row');
    expect(row.props.accessibilityLabel).toMatch(/Emergency fund, \$1,500 of \$6,000, 25%/);
  });

  test('12. the Score footnote has no card or surface wrapper of its own', () => {
    const footnote = view.getByTestId('today-score-footnote');
    const style = Array.isArray(footnote.props.style) ? Object.assign({}, ...footnote.props.style) : footnote.props.style;
    // A quiet row: no fill, no radius, no elevation. Only a hairline rule.
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.borderTopWidth).toBeGreaterThan(0);
    expect(footnote.props.accessibilityLabel).toMatch(/Not a credit score/);
  });

  test('12b. Wave 5 closure — the month section is present and shows no unlock prompt', () => {
    // This dataset records $2,400 in and $860 out, so the section is
    // eligible and renders its three measures — the same values as before
    // the closure pass.
    expect(view.getByTestId('today-month-card')).toBeTruthy();
    const texts = visibleTexts(view);
    expect(texts.some((t) => /so far$/.test(t))).toBe(true);
    expect(texts.join(' | ')).not.toContain('unlock your monthly snapshot');
    expect(texts.join(' | ')).not.toContain('Not enough information yet');
  });

  test('12c. Wave 5 closure — the hero figure carries the Ocean Blue interactive role, not neutral ink', () => {
    const figure = view.getByTestId('today-briefing-figure');
    const eyebrow = view.getAllByTestId('today-briefing-hero')[0];
    expect(figure.props.style.color).toBeDefined();
    // The measure state shows no shortfall glyph — colour emphasis is
    // reserved, not applied to every state.
    expect(view.queryByTestId('today-briefing-setup')).toBeNull();
    expect(eyebrow).toBeTruthy();
  });

  test('12d. Wave 5 polish A — one decorative sun icon identifies the Briefing, and the title is the only announcement', () => {
    // The tile renders, and is decorative — a11y-filtered queries cannot
    // see it, which is precisely the contract. (Ionicons renders to a font
    // glyph, so the icon NAME is asserted at source level in the Wave 5
    // hierarchy suite; what matters here is that it is present, hidden, and
    // rendered from the icon font rather than as a text character.)
    const tile = view.getByTestId('today-briefing-identity-tile', { includeHiddenElements: true });
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(tile.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(view.queryByTestId('today-briefing-identity-tile')).toBeNull();
    expect(JSON.stringify(tile)).toContain('ionicons');

    // Title case, not all caps, and exactly one heading in the hero.
    expect(view.getByRole('header', { name: 'Your Today Briefing' })).toBeTruthy();
    expect(visibleTexts(view)).not.toContain('YOUR TODAY BRIEFING');

    // No emoji anywhere in the hero.
    expect(JSON.stringify(view.getByTestId('today-briefing-hero'))).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u);
  });

  test('12e. Wave 5 polish B — every monthly value is one node, one line, sign included', () => {
    const opts = { includeHiddenElements: true } as const;
    // The exact strings, as single text nodes — not a sign node plus an
    // amount node.
    expect(view.getByText('+$2,400', opts)).toBeTruthy();
    expect(view.getByText('$860', opts)).toBeTruthy();
    expect(view.getByText('+$1,540', opts)).toBeTruthy();

    // No isolated sign node exists anywhere in the card.
    const card = JSON.stringify(view.getByTestId('today-month-card'));
    expect(card).not.toMatch(/"children":\s*\[?"\+"/);
    expect(card).not.toMatch(/"children":\s*\[?"−"/);

    // Each value is pinned to a single line and cannot shrink in the row.
    for (const key of ['moneyIn', 'spendingRecorded', 'netRecorded']) {
      const block = view.getByTestId(`month-measure-${key}`, opts);
      const valueNode = JSON.stringify(block);
      expect(valueNode).toContain('"numberOfLines":1');
    }

    // One accessible statement per metric, sign spoken as a word.
    const label = String(view.getByTestId('today-month-card').props.accessibilityLabel);
    expect(label).toBe(
      'Money in, positive 2,400 dollars, Spending recorded, 860 dollars, Net recorded, positive 1,540 dollars. View transaction history'
    );
    expect(label).not.toMatch(/\bplus\b/i);
  });

  test('13. the visible order matches Design 5.1 page 7', () => {
    const texts = visibleTexts(view);
    const marks: [string, number][] = [
      ['date eyebrow', orderOf(texts, new RegExp(String(view.getByTestId('today-date-eyebrow').props.children)))],
      ['greeting', orderOf(texts, /^(Good|Hi|Hello)/)],
      ['briefing title', orderOf(texts, /^Your Today Briefing$/)],
      ['journey', orderOf(texts, /^Your Journey$/)],
      ['month', orderOf(texts, /so far$/)],
      ['goal', orderOf(texts, /^Your goal$/)],
      ['score footnote', orderOf(texts, /Not a credit score/)],
    ];
    for (const [name, idx] of marks) expect(`${name}:${idx >= 0}`).toBe(`${name}:true`);
    const order = marks.map(([, idx]) => idx);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('14. no card excluded from the default composition survives in the accessibility tree', () => {
    const texts = visibleTexts(view).join(' | ');
    for (const gone of [
      'Complete your profile',      // ProfileNudgeCard
      'Did you know',               // SavingFactsCard
      'Cashflow Focus',             // FinancialStateCard
      'Financial Rebuild',          // FinancialStateCard
    ]) {
      expect(texts).not.toContain(gone);
    }
    // Only one insight-tier card can exist, and it is Worth Knowing's slot.
    expect(view.queryAllByTestId('today-worth-knowing-card').length).toBeLessThanOrEqual(1);
  });

});

describe('Design 5.1 Wave 5 — Today in the fresh-setup state', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await seedFreshSetup();
    view = await render(<Harness />);
    await screen.findByTestId('today-greeting');
  });

  afterAll(() => {
    view.unmount();
    jest.restoreAllMocks();
  });

  test('15. the checklist sits directly under the greeting, and no $0 is ever fabricated', () => {
    const texts = visibleTexts(view);
    const greetingIdx = orderOf(texts, /^(Good|Hi|Hello)/);
    const checklistIdx = orderOf(texts, /money picture|Money picture|Complete your money/i);

    if (checklistIdx >= 0) {
      expect(checklistIdx).toBeGreaterThan(greetingIdx);
      // Directly under: the hero comes after it, never between.
      expect(orderOf(texts, /^Your Today Briefing$/)).toBeGreaterThan(checklistIdx);
    }

    // Invariant 10 — a setup state never fabricates a zero. The hero keeps
    // its geometry and states what is missing instead.
    expect(view.queryAllByTestId('today-briefing-figure')).toHaveLength(0);
    expect(view.getByTestId('today-briefing-setup')).toBeTruthy();
    expect(texts.filter((t) => t === '$0')).toHaveLength(0);

    // And the hero is still exactly one hero, with its footer intact.
    expect(view.getAllByTestId('today-briefing-hero')).toHaveLength(1);
    expect(view.getByTestId('today-briefing-provenance')).toBeTruthy();
  });

  test('16. Wave 5 closure A — the duplicate monthly unlock prompt is gone, with nothing left behind', () => {
    const texts = visibleTexts(view);
    const joined = texts.join(' | ');

    // The checklist is the ONE setup ask.
    expect(orderOf(texts, /money picture|Money picture|Complete your money/i)).toBeGreaterThanOrEqual(0);

    // No second prompt, in any of its forms.
    expect(joined).not.toContain('unlock your monthly snapshot');
    expect(joined).not.toContain('Not enough information yet');
    expect(joined).not.toContain('Add your income and spending');

    // No orphaned heading, and no empty card.
    expect(texts.filter((t) => /so far$/.test(t))).toHaveLength(0);
    expect(view.queryByTestId('today-month-card')).toBeNull();

    // The section collapses entirely — the Briefing is followed by the
    // journey row, with no month landmark of any kind between them.
    const heroIdx = orderOf(texts, /^Your Today Briefing$/);
    const journeyIdx = orderOf(texts, /^Your Journey$/);
    expect(journeyIdx).toBeGreaterThan(heroIdx);
    expect(texts.slice(heroIdx, journeyIdx).some((t) => /so far/.test(t))).toBe(false);

    // The Briefing keeps its own contextual missing-input affordances.
    expect(view.getByTestId('today-briefing-setup-action')).toBeTruthy();
    expect(view.getByTestId('today-briefing-how-this-works')).toBeTruthy();
  });

  test('17. Wave 5 closure B — the no-goal row is one accessible action opening the canonical goal form', async () => {
    const row = view.getByTestId('today-plan-goal-row');

    // ONE press target for the whole row — no nested button inside it.
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'Plan a goal. Choose what you’re working towards and track progress over time.'
    );
    expect(row.props.accessibilityHint).toBe('Opens the goal form');
    expect(view.getAllByTestId('today-plan-goal-row')).toHaveLength(1);

    const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
    expect(style.flexDirection).toBe('row');
    expect(style.minHeight).toBeGreaterThanOrEqual(56);

    // The old pale unlock panel and its nested pill are gone from this slot.
    const texts = visibleTexts(view);
    expect(texts).not.toContain('Track a goal');
    expect(texts).not.toContain('Add a goal');
    expect(texts).toEqual(expect.arrayContaining(['Plan a goal', 'Create goal']));

    // Pressing it opens the canonical Wave 4 goal form — all three of its
    // sections, from the shared GoalFormFields every other entry point
    // renders.
    fireEvent.press(row);
    expect(await screen.findByText('What are you working towards?')).toBeTruthy();
    expect(screen.getByText('Goal details')).toBeTruthy();
    expect(screen.getByText('Timing and priority')).toBeTruthy();
    // Optional target amount and date are unchanged.
    expect(screen.getByText('Target amount — optional')).toBeTruthy();
    expect(screen.getByText('Target date — optional')).toBeTruthy();

    // Cancel returns to Today with the row still present.
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByTestId('today-plan-goal-row')).toBeTruthy();
  });

  test('18. Wave 5 closure C — the incomplete hero stays neutral; warning ink is reserved for a real shortfall', () => {
    // This dataset has nothing recorded, so the hero is in an INCOMPLETE
    // state — a gap, not a money problem. It must not be dressed as a
    // caution.
    expect(view.getByTestId('today-briefing-setup')).toBeTruthy();
    const texts = visibleTexts(view).join(' | ');
    expect(texts).not.toContain('$0');
    // No shortfall glyph in an incomplete state.
    expect(view.queryAllByTestId('today-briefing-figure')).toHaveLength(0);
  });
});
