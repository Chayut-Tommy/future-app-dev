// Wave 9c visual/checklist correction — RENDERED proof for the seven-step
// checklist: canonical order, the real Everyday journey through the ONE
// workspace, separated completion predicates (a record completes exactly
// one step), the checklist-scoped Vehicle asset default, and the
// checklist income save returning directly WITHOUT the auto-opened
// "Plan around your income?" planner. One root; interactions run in
// sequence against the real navigator, workspace and persistence.
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
import { listMoneyAvailableAccounts } from '../../src/lib/calculations/liquidAssets';
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

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

/** The checklist rows' testIDs in the order they appear in the tree — the
 * accessibility order VoiceOver walks. */
function checklistRowOrder(): string[] {
  const order: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    const id = n.props?.testID;
    if (typeof id === 'string' && /^checklist-(income|everyday|cash|assets|bills|debt|goal)$/.test(id)) order.push(id.replace('checklist-', ''));
    (n.children ?? []).forEach(walk);
  };
  walk((screen as any).root);
  return order;
}

describe('Wave 9c visual correction — the seven-step checklist, rendered', () => {
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
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('seven steps render in the canonical order, with the seven-denominator progress and one primary CTA', () => {
    expect(checklistRowOrder()).toEqual(['income', 'everyday', 'cash', 'assets', 'bills', 'debt', 'goal']);
    expect(screen.getByText('0 of 7 complete')).toBeTruthy();
    expect(screen.getByTestId('checklist-continue')).toBeTruthy();
    expect(screen.getByText('Gives Available until payday a balance to work from.')).toBeTruthy();
    expect(screen.getByText('Adds vehicles, property or investments to your net worth.')).toBeTruthy();
  });

  test('the checklist asset flow opens preset to Vehicle — changeable, and Cancel writes nothing', async () => {
    fireEvent.press(screen.getByTestId('checklist-assets'));
    const typeTrigger = await screen.findByTestId('add-asset-type', {}, { timeout: 20000 });
    // The in-form selector arrives preset to the canonical Vehicle type.
    expect(typeTrigger.props.accessibilityLabel).toContain('Vehicle');
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('add-asset-type')).toBeNull(), { timeout: 20000 });
    const s = await stored();
    expect(s.assets).toHaveLength(0);
  });

  test('the Everyday journey: one canonical record at exact cents, completing ONLY the Everyday step', async () => {
    fireEvent.press(screen.getByTestId('checklist-everyday'));
    const nameInput = await screen.findByPlaceholderText('e.g. Main everyday account', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Everyday');
    await screen.findByDisplayValue('Everyday');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '1234.56');
    await screen.findByDisplayValue('1234.56');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(
      async () => {
        const s = await stored();
        expect(s.assets.filter((a) => a.type === 'everyday')).toHaveLength(1);
      },
      { timeout: 20000 }
    );
    const s = await stored();
    const everyday = s.assets.filter((a) => a.type === 'everyday');
    // Exactly one record, exact cents, canonical shape, default inclusion.
    expect(s.assets).toHaveLength(1);
    expect(everyday[0].currentValue).toBe(1234.56);
    // It appears exactly once in Money's balance selector, via the REAL
    // eligibility engine and its existing defaults.
    expect(listMoneyAvailableAccounts(s.assets).filter((a) => a.id === everyday[0].id)).toHaveLength(1);
    // ONLY the Everyday step completed — savings and assets stay open.
    await screen.findByText('1 of 7 complete');
    expect(screen.getByText('Shows money you have set aside.')).toBeTruthy();
    expect(screen.getByText('Adds vehicles, property or investments to your net worth.')).toBeTruthy();
  });

  test('a checklist income save returns directly — the planner is never auto-opened', async () => {
    fireEvent.press(screen.getByTestId('checklist-income'));
    const nameInput = await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });
    fireEvent.changeText(nameInput, 'Salary');
    await screen.findByDisplayValue('Salary');
    fireEvent.changeText(screen.getByPlaceholderText('$6,000'), '5000');
    await screen.findByDisplayValue('5000');
    // The shared focused picker; flush the draft before Done (documented
    // stale-draft pathology).
    fireEvent.press(screen.getByTestId('income-next-due-date'));
    await screen.findByTestId('income-next-due-date-choice-plus-1');
    fireEvent.press(screen.getByTestId('income-next-due-date-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('income-next-due-date-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    fireEvent.press(screen.getByTestId('income-next-due-date-done'));
    await waitFor(() => expect(screen.queryByTestId('income-next-due-date-done')).toBeNull(), { timeout: 20000 });
    fireEvent.press(screen.getByText('Save'));

    // The save landed (this IS the first income — the exact case whose
    // prompt used to fire) and the flow returned straight to the checklist.
    await waitFor(
      async () => {
        const s = await stored();
        expect(s.recurringItems.filter((r) => r.type === 'income')).toHaveLength(1);
      },
      { timeout: 20000 }
    );
    await screen.findByText('2 of 7 complete', {}, { timeout: 20000 });
    // And the planner NEVER appears — not after the coordinator's deferred
    // window either.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText('Plan around your income?')).toBeNull();
    expect(screen.getByText('Complete your money setup')).toBeTruthy();
  });
});
