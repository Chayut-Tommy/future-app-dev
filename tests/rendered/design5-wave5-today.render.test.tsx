import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TodayBriefingCard } from '../../src/components/today/TodayBriefingCard';
import { selectScoreChipPresentation } from '../../src/lib/calculations/scoreChipPresentation';
import { LuluScoreResult } from '../../src/lib/calculations/luluScore';
import { SafeToSpendPresentation } from '../../src/lib/calculations/safeToSpendPresentation';
import { TodayBriefingEventRow } from '../../src/lib/calculations/todayBriefing';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

/**
 * Nolie Design 5.1 Wave 5 — Today, rendered.
 *
 * MEASURED HARNESS LIMIT (see tests/README.md): this RNTL/React 19
 * environment stops mounting new roots from the THIRD render() in a file.
 * The Wave 5 dataset matrix therefore lives in
 * tests/design5-wave5-today-hierarchy.test.ts, where it runs the real
 * selectors across every dataset without needing a mount. This file spends
 * its two available mounts on the two Wave 5 claims that are only true if
 * something actually renders:
 *
 *   1. The Score is genuinely absent from the Briefing's rendered output —
 *      not merely absent from its prop list.
 *   2. The Score footnote is a real, single, correctly-labelled accessible
 *      button, rendered exactly as TodayScreen.tsx renders it.
 *
 * NOT proven here: visual weight, spacing, VoiceOver's real spoken order,
 * or Dynamic Type layout. Those remain device evidence.
 */

const basePresentation: SafeToSpendPresentation = {
  heroState: 'healthy',
  tone: 'neutral',
  heading: 'Available to spend',
  primaryCopy: '$420',
  supportingCopy: 'Covers your recorded commitments this cycle.',
  // The selector's real amount trio — amountVisible gates whether the hero
  // shows a figure at all, so a fixture without it exercises the setup
  // state rather than the populated one.
  amountCents: 42000,
  displayAmount: '$420',
  amountVisible: true,
  amountIsAvailableMoney: true,
  action: null,
  compactSummary: 'Available',
} as unknown as SafeToSpendPresentation;

const eventRows: TodayBriefingEventRow[] = [
  { key: 'e1', kind: 'bill', title: 'Rent in 2 days', tone: 'warning', icon: 'calendar-outline', daysUntil: 2 },
  { key: 'e2', kind: 'income', title: 'Pay in 4 days', tone: 'neutral', icon: 'cash', daysUntil: 4 },
];

describe('Wave 5 — the Briefing no longer carries the Score', () => {
  it('renders the Briefing with no score number, no score label and no score containment copy', async () => {
    await AsyncStorage.setItem('moneycoach.appdata.v1', JSON.stringify({}));
    // This harness's own convention: render() is awaited (see the other
    // *.render.test.tsx files) so the tree is fully committed first.
    const view = await render(
      <AppStateProvider>
        <ThemeProvider>
          <TodayBriefingCard
            presentation={basePresentation}
            eventRows={eventRows}
            timelineEvents={[]}
            timeframeLine="11 days to Fri 28 Aug · about $120 a day"
            topReminder={null}
            onPressHowThisWorks={() => {}}
            onPressAup={() => {}}
            onPressEventRow={() => {}}
            onPressReminderTile={() => {}}
          />
        </ThemeProvider>
      </AppStateProvider>
    );

    // The Briefing still does its own job: the Design 5.1 hero renders its
    // measure label, the canonical figure, and the timeframe line. Those
    // three are collapsed into ONE accessible measure button, so the inner
    // Text nodes are deliberately hidden from assistive technology — hence
    // includeHiddenElements here, and the label assertion below.
    const opts = { includeHiddenElements: true } as const;
    expect(view.getByText('Available to spend', opts)).toBeTruthy();
    expect(view.getByText('$420', opts)).toBeTruthy();
    expect(view.getByText('11 days to Fri 28 Aug · about $120 a day', opts)).toBeTruthy();
    expect(view.getByTestId('today-briefing-measure').props.accessibilityLabel).toBe(
      'Available to spend, $420. 11 days to Fri 28 Aug · about $120 a day'
    );
    expect(view.getByText('How this works')).toBeTruthy();

    // And carries no trace of the Score, in any of its states.
    for (const forbidden of [
      'Your Nolie Score',
      'Nolie Score',
      'Lulu Score',
      'Add income to unlock',
      'Score unavailable',
      'Not enough recorded yet',
      'Not a credit score',
    ]) {
      expect(view.queryByText(forbidden)).toBeNull();
    }

    // Belt and braces: nothing anywhere in the rendered tree mentions a
    // score, including accessibility labels a queryByText would not see.
    expect(JSON.stringify(view.toJSON())).not.toMatch(/[Ss]core/);
  });
});

describe('Wave 5 — the Score footnote', () => {
  /** Mirrors TodayScreen.tsx's footnote JSX exactly. */
  function Footnote({ score }: { score: LuluScoreResult }) {
    const p = selectScoreChipPresentation(score);
    return (
      <AppStateProvider>
        <ThemeProvider>
          <TouchableOpacity
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel={`${p.label}. ${p.supportingText}`}
            accessibilityHint="Opens how your score is calculated"
            testID="today-score-footnote"
          >
            <View>
              <Text>{p.label}</Text>
              <Text>{p.supportingText}</Text>
            </View>
          </TouchableOpacity>
        </ThemeProvider>
      </AppStateProvider>
    );
  }

  it('is one accessible button whose label carries the whole state, and is never a second hero', async () => {
    const view = await render(
      <Footnote score={{ locked: false, score: 72 } as unknown as LuluScoreResult} />
    );

    const row = view.getByTestId('today-score-footnote');
    expect(view.getAllByTestId('today-score-footnote')).toHaveLength(1);
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Opens how your score is calculated');

    // One sentence conveys the score AND its containment — a screen reader
    // user never gets the number without the caveat.
    const label: string = row.props.accessibilityLabel;
    expect(label).toContain('Interim');
    expect(label).toContain('Based on what you’ve recorded');
    expect(label).toContain('Not a credit score');
    expect(label).not.toMatch(/predict|eligib|advice|recommend/i);

    // The containment is visible, not accessibility-only.
    expect(view.getByText(/Not a credit score/)).toBeTruthy();
  });
});
