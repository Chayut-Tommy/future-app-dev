// Wave 9c closure — rendered proof for the checklist rebuild (B/C/E/F) and
// the Wealth empty state (G). One root per describe.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
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

const isGlyph = (f: unknown) => typeof f === 'string' && /ionicons/i.test(f);
const flatten = (style: unknown): Record<string, unknown> =>
  !style ? {} : Array.isArray(style) ? Object.assign({}, ...(style as unknown[]).map(flatten)) : (style as Record<string, unknown>);

function nodeText(n: any): string {
  const kids = n.props?.children;
  return Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
}

/** Smallest subtree containing two known checklist testIDs = the card. */
function checklistSubtree(): any {
  let smallest: any = null;
  const inspect = (n: any): { a: boolean; b: boolean } => {
    if (!n || typeof n !== 'object') return { a: false, b: false };
    let a = n.props?.testID === 'checklist-goal';
    let b = n.props?.testID === 'checklist-debt';
    for (const c of n.children ?? []) {
      const r = inspect(c);
      a = a || r.a;
      b = b || r.b;
    }
    if (a && b && smallest === null) smallest = n;
    return { a, b };
  };
  inspect((screen as any).root);
  return smallest;
}

function checklistFamilies(): { family: unknown; text: string }[] {
  const out: { family: unknown; text: string }[] = [];
  const walk = (n: any, insideText: boolean) => {
    if (!n || typeof n !== 'object') return;
    const isText = n.type === 'Text';
    if (isText && !insideText) {
      const family = flatten(n.props?.style).fontFamily;
      const text = nodeText(n);
      if (!isGlyph(family) && text.trim().length > 0) out.push({ family, text: text.slice(0, 40) });
    }
    (n.children ?? []).forEach((c: unknown) => walk(c, insideText || isText));
  };
  walk(checklistSubtree(), false);
  return out;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

describe('Wave 9c closure — Today checklist (English)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    // Final correction pass, Correction C — the accepted header set.
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the rebuilt hierarchy renders: header, support, factual progress, CTA, 56pt rows', () => {
    expect(screen.getByText('Add a few more details to make Today, Money and Wealth more useful.')).toBeTruthy();
    // Wave 9c visual/checklist correction — the realistic SEVEN-step
    // journey, Everyday account included.
    expect(screen.getByText('0 of 7 complete')).toBeTruthy();
    // ONE full-width primary next action, resolved from structured state —
    // with nothing recorded, income is the highest-priority step.
    expect(screen.getByTestId('checklist-continue')).toBeTruthy();
    const row = screen.getByTestId('checklist-goal');
    expect(flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(56);
    expect(screen.getByText('Optional — track a target if useful.')).toBeTruthy();
    // The rows explain their factual value.
    expect(screen.getByText('Places expected pay in your timeline.')).toBeTruthy();
    expect(screen.getByText('Keeps upcoming costs visible.')).toBeTruthy();
  });

  test('every checklist Text resolves Figtree at runtime, and nothing is struck through', () => {
    const fams = checklistFamilies();
    expect(fams.length).toBeGreaterThan(8);
    expect(fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('Figtree'))).toEqual([]);
    const struck: string[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Text' && flatten(n.props?.style).textDecorationLine === 'line-through') struck.push(nodeText(n));
      (n.children ?? []).forEach(walk);
    };
    walk(checklistSubtree());
    expect(struck).toEqual([]);
  });

  test('the legacy Score-unlock surface is absent in the locked state', () => {
    // Fresh data has no income -> the Score is locked; the old promo card
    // used to render exactly here.
    expect(screen.queryByText(/Unlock your/)).toBeNull();
  });

  test('Maybe later writes ONLY the presentation flag — no goal, and the row completes', async () => {
    fireEvent.press(screen.getByTestId('checklist-goal-defer'));
    await waitFor(async () => expect((await stored()).user.confirmedGoalLater).toBe(true), { timeout: 20000 });
    const s = await stored();
    expect(s.goals).toHaveLength(0);
    expect(s.user.moneyGoal).toBeUndefined();
    // RECONCILED (post-Wave-10 checklist UX closure): the deferred state is
    // now the row's neutral "Later" chip (decorative, a11y-hidden inside
    // the one row button) with the constant factual purpose line; progress
    // honestly reads "reviewed" because an acknowledgement is counted —
    // a deferred step is never called complete.
    await screen.findByText('1 of 7 reviewed');
    expect(screen.queryByText('1 of 7 complete')).toBeNull();
    // The resolution compacted the card; the deferred row (with its
    // neutral Later chip) sits behind the one View all disclosure.
    fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-goal', {}, { timeout: 20000 });
    expect(screen.getByText('Later', { includeHiddenElements: true })).toBeTruthy();
  });

  test('an Add row opens the ONE workspace directly — no teaser sheet in between', async () => {
    // RECONCILED (post-Wave-10 checklist UX closure): with progress the
    // card is compact by default; the bills row is reached through the one
    // in-place View all disclosure (already expanded if a previous test
    // opened it — the local presentation state persists for the session).
    if (screen.queryByTestId('checklist-view-all')) fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-bills', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('checklist-bills'));
    // The canonical AddAnythingSheet workspace's bill destination mounts;
    // no OptionsSheet teaser copy ever appears. (Probed by the bill form's
    // own unique placeholder — the old loose /bill/i regex now also
    // matches the task group's "I'll add bills later" footer.)
    await screen.findByPlaceholderText('e.g. Netflix', {}, { timeout: 20000 });
    expect(screen.queryByText('Add essential bills', { exact: false })).toBeTruthy();
    expect(screen.queryByText("I'll add these later — no problem")).toBeNull();
  }, 60000);
});

describe('Wave 9c closure — Wealth empty state', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('navigating to Wealth shows the net-worth-language empty state in Figtree', async () => {
    fireEvent.press(await screen.findByLabelText(/^Wealth, tab,/, {}, { timeout: 20000 }));
    const title = await screen.findByText('Start building your net worth', {}, { timeout: 20000 });
    expect(flatten(title.props.style).fontFamily).toMatch(/^Figtree/);
    expect(screen.getByText('Add an account, asset or debt to see what you own, what you owe and your net worth in one place.')).toBeTruthy();
    expect(screen.getByTestId('wealth-empty-add')).toBeTruthy();
    expect(screen.queryByText(/Build your Wealth Map/i)).toBeNull();
    // No fake zero figure inside the EMPTY-STATE block itself (the page's
    // net-worth hero legitimately shows the engine's real $0 elsewhere).
    const block = screen.getByTestId('wealth-empty-state');
    const texts: string[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Text') texts.push(nodeText(n));
      (n.children ?? []).forEach(walk);
    };
    walk(block);
    expect(texts.some((t) => /\$\d/.test(t))).toBe(false);
  });
});
