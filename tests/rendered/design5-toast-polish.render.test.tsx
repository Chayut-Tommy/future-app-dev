// Pre-Wave-10 premium toast polish — RENDERED against the real navigator,
// checklist, celebration queue and persistence. One root; interactions run
// in sequence. Proves: sequential (never stacked) delivery of two
// achievements from one action, the structured MILESTONE context, manual
// dismissal, the approved everyday copy on the same composition, runtime
// Figtree resolution inside the actual toast subtree, no financial writes,
// and no stuck overlay across tab navigation.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
const nodeText = (n: any): string => {
  const kids = n.props?.children;
  return Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
};

function toastSubtree(): any {
  let found: any = null;
  const walk = (n: any) => {
    if (!n || typeof n !== 'object' || found) return;
    if (n.props?.testID === 'celebration-toast') {
      found = n;
      return;
    }
    (n.children ?? []).forEach(walk);
  };
  walk((screen as any).root);
  return found;
}

function toastFamilies(): { family: unknown; text: string }[] {
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
  walk(toastSubtree(), false);
  return out;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

describe('Premium celebration toast — queue, copy, fonts and cleanup', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu'];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('two achievements from ONE action arrive sequentially — never stacked — with the MILESTONE context', async () => {
    // Saving a SAVINGS account unlocks added_first_asset AND added_savings
    // in the same persist.
    fireEvent.press(screen.getByTestId('checklist-cash'));
    // The savings preset skips straight to the asset form.
    const nameInput = await screen.findByPlaceholderText('e.g. Emergency fund', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Rainy day');
    await screen.findByDisplayValue('Rainy day');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '500');
    await screen.findByDisplayValue('500');
    fireEvent.press(screen.getByText('Save'));

    // First toast: the truthful first-asset milestone (savings is a real
    // collection entry; no everyday account exists, but a savings-only
    // collection keeps the achievement's own copy — asserted in the pure
    // suite). While it is visible, the SECOND toast must not exist.
    await screen.findByText('Added First Asset', {}, { timeout: 20000 });
    expect(screen.getByText('MILESTONE')).toBeTruthy();
    expect(screen.queryByText('Added Savings')).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);

    // Runtime fonts inside the ACTUAL toast subtree.
    const fams = toastFamilies();
    expect(fams.length).toBeGreaterThanOrEqual(2);
    expect(fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('Figtree'))).toEqual([]);

    // Manual dismissal advances the queue deterministically to the second
    // event — nothing dropped, nothing duplicated.
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await screen.findByText('Added Savings', {}, { timeout: 20000 });
    expect(screen.queryByText('Added First Asset')).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });

    // Seen-state recorded both unlocks; dismissal wrote no financial data.
    const s = await stored();
    expect(s.seenAchievementIds).toEqual(expect.arrayContaining(['added_first_asset', 'added_savings']));
    expect(s.assets).toHaveLength(1);
    expect(s.transactions).toHaveLength(0);
    expect(s.goals).toHaveLength(0);
  });

  test('the corrected everyday copy rides the same composition, without the milestone label', async () => {
    fireEvent.press(screen.getByTestId('checklist-everyday'));
    const nameInput = await screen.findByPlaceholderText('e.g. Main everyday account', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Everyday');
    await screen.findByDisplayValue('Everyday');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '4000');
    await screen.findByDisplayValue('4000');
    fireEvent.press(screen.getByText('Save'));

    // RECONCILED (Wave 10 closure). No achievement unlocks here (first
    // asset already seen), and this save previously showed NOTHING — the
    // routine-save feedback gap the closure was ordered to fix. The Add
    // workspace's shared save-success authority now queues the calm
    // factual confirmation on this SAME approved composition: canonical
    // display-name title, factual body, no MILESTONE capsule, no Undo —
    // and still no duplicated or re-fired milestone event.
    await waitFor(async () => expect((await stored()).assets).toHaveLength(2), { timeout: 20000 });
    await screen.findByText('Everyday Account added', {}, { timeout: 20000 });
    expect(screen.getByText('Saved to your money picture.')).toBeTruthy();
    expect(screen.queryByText('MILESTONE')).toBeNull();
    expect(screen.getAllByTestId('celebration-toast')).toHaveLength(1);
    // Drain it so the next test starts from an empty queue.
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
  });

  test('navigating while a toast is visible leaves no stuck overlay', async () => {
    // The income save (the proven checklist journey) raises the
    // 'Added Income' milestone toast; we then switch tabs mid-toast.
    // (The AddGoalModal press sequence wedges RNTL's commit pipeline —
    // documented harness pathology; the goal unlock's exactly-once
    // behaviour is proven Class A in the state-comms suite.)
    fireEvent.press(screen.getByTestId('checklist-income'));
    const nameInput = await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Salary');
    await screen.findByDisplayValue('Salary');
    fireEvent.changeText(screen.getByPlaceholderText('$6,000'), '2500');
    await screen.findByDisplayValue('2500');
    fireEvent.press(screen.getByTestId('income-next-due-date'));
    await screen.findByTestId('income-next-due-date-choice-plus-1');
    fireEvent.press(screen.getByTestId('income-next-due-date-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('income-next-due-date-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    fireEvent.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(() => expect(screen.queryByTestId('income-next-due-date-done')).toBeNull(), { timeout: 20000 });
    fireEvent.press(screen.getByText('Save'));

    // The milestone toast is up; switch tabs while it is visible.
    await screen.findByText('Added Income', {}, { timeout: 20000 });
    expect(screen.getByText('MILESTONE')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Wealth, tab,/));
    // The overlay clears itself — no stuck toast over the new screen.
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    // Exactly one income, no planner, nothing else written.
    const s = await stored();
    expect(s.recurringItems.filter((r) => r.type === 'income')).toHaveLength(1);
    expect(s.goals).toHaveLength(0);
    expect(screen.queryByText('Plan around your income?')).toBeNull();
  }, 60000);
});
