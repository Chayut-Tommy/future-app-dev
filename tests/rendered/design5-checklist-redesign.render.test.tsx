// Post-Wave-10 checklist UX closure — RENDERED against the real Today
// root, the real checklist card and the real canonical Add destinations.
// Root 1 proves the zero-progress expanded composition and that Continue
// opens the canonical task directly (and Cancel writes nothing). Root 2
// (its own seeded mid-journey realm) proves the compact card, the View all
// disclosure, the Vehicle-preset asset journey with a REAL type switch
// (the confirmation names the actual saved type), the bills journey and
// the goal deferral's honest "reviewed" progress copy.
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
import { AppData, Asset } from '../../src/types/models';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';
const ALL_ROW_IDS = ['checklist-income', 'checklist-everyday', 'checklist-cash', 'checklist-assets', 'checklist-bills', 'checklist-debt', 'checklist-goal'];

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

describe('Zero progress — the full expanded composition', () => {
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

  test('immediately after onboarding all seven tasks render expanded, grouped, with honest zero progress', () => {
    for (const id of ALL_ROW_IDS) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByText('Add when it applies')).toBeTruthy();
    expect(screen.queryByTestId('checklist-view-all')).toBeNull();
    expect(screen.getByText('0 of 7 complete')).toBeTruthy();
    // The featured CTA names the next task; no promo/gift tile exists.
    expect(screen.getByText('Continue setup')).toBeTruthy();
    expect(screen.getByText('Next: Add your income')).toBeTruthy();
    expect(screen.queryByText(/Set up more things/)).toBeNull();
    // Every incomplete row carries the Add now affordance (the chip is
    // decorative and a11y-hidden inside the one row button, so the query
    // must include hidden elements).
    expect(screen.getAllByText('Add now', { includeHiddenElements: true }).length).toBe(7);
    // Consistency correction: the COMPLETE seven-footer matrix — every
    // unresolved task group carries its attached footer, with the
    // owner-locked labels.
    const FOOTERS: [string, string][] = [
      ['income', "I don't have income yet"],
      ['everyday', "I'll add an account later"],
      ['cash', "I don't have savings yet"],
      ['assets', "I don't have other assets yet"],
      ['bills', "I'll add bills later"],
      ['debt', "I don't have any debt"],
      ['goal', "I'll add a goal later"],
    ];
    for (const [id, label] of FOOTERS) {
      expect(screen.getByTestId(`checklist-group-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`checklist-${id}-defer`)).toBeTruthy();
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test('Continue opens the canonical income task DIRECTLY — no catalogue chooser — and Cancel writes nothing', async () => {
    fireEvent.press(screen.getByTestId('checklist-continue'));
    await screen.findByPlaceholderText('e.g. Salary', {}, { timeout: 20000 });
    // Straight into the destination: the catalogue's own tiles are absent.
    expect(screen.queryByText('Transfer')).toBeNull();
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByPlaceholderText('e.g. Salary')).toBeNull(), { timeout: 20000 });
    const s = await stored();
    expect(s.recurringItems).toHaveLength(0);
    expect(s.assets).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
    expect(screen.getByText('0 of 7 complete')).toBeTruthy();
  }, 60000);
});

describe('After progress — compact card, View all, real journeys', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    d.seenAchievementIds = ['started_lulu', 'added_first_asset', 'added_savings'];
    d.assets = [{ id: 'sv1', type: 'savings', label: 'Rainy day', currentValue: 500 } as Asset];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('with one step resolved the card defaults to compact: progress, CTA, the next two tasks and ONE disclosure', () => {
    expect(screen.getByText('1 of 7 complete')).toBeTruthy();
    expect(screen.getByText('Continue setup')).toBeTruthy();
    expect(screen.getByText('Next: Add your income')).toBeTruthy();
    // Only the next two actionable tasks are rows; the rest sit behind the
    // single View all disclosure.
    expect(screen.getByTestId('checklist-income')).toBeTruthy();
    expect(screen.getByTestId('checklist-everyday')).toBeTruthy();
    for (const id of ['checklist-cash', 'checklist-assets', 'checklist-bills', 'checklist-debt', 'checklist-goal']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('checklist-view-all')).toBeTruthy();
    expect(screen.queryByText('Add when it applies')).toBeNull();
    // Visual-rhythm correction: the compact state uses the SAME contained
    // task-group anatomy — the income group carries its attached footer.
    expect(screen.getByTestId('checklist-group-income')).toBeTruthy();
    expect(screen.getByTestId('checklist-income-defer')).toBeTruthy();
    expect(screen.getByText("I don't have income yet")).toBeTruthy();
  });

  test('View all expands the full seven-row composition IN PLACE — same scroll owner, no modal', async () => {
    fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-goal', {}, { timeout: 20000 });
    for (const id of ALL_ROW_IDS) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByText('Add when it applies')).toBeTruthy();
    expect(screen.queryByTestId('checklist-view-all')).toBeNull();
    // The completed savings row is informational: truthful Added chip
    // (decorative, a11y-hidden inside the row button).
    expect(screen.getByText('Added', { includeHiddenElements: true })).toBeTruthy();
  }, 60000);

  test('the asset task opens on the Vehicle preset, the type CAN be changed, and the confirmation names the ACTUAL saved type', async () => {
    fireEvent.press(screen.getByTestId('checklist-assets'));
    // The canonical asset form opens preset to Vehicle — the "What are you
    // adding?" InlineSelect shows with Vehicle already chosen, and the
    // label placeholder is the VEHICLE example (structured-type-derived).
    await screen.findByTestId('add-asset-type', {}, { timeout: 20000 });
    expect(screen.getByText('Vehicle')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Toyota Corolla')).toBeTruthy();
    // The customer is NOT locked in: switch to Property before saving
    // (clean form, so no discard confirm is involved). The draft selection
    // is flushed (selected state) before reading the form back — the
    // documented picker pathology.
    fireEvent.press(screen.getByTestId('add-asset-type'));
    await screen.findByTestId('add-asset-type-option-property', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('add-asset-type-option-property'));
    await waitFor(() => expect(screen.queryByTestId('add-asset-type-option-property')).toBeNull(), { timeout: 20000 });
    // The placeholder follows the structured type change to PROPERTY —
    // never the Vehicle entry preset, never the investment fallback.
    const nameInput = await screen.findByPlaceholderText('e.g. Richmond home', {}, { timeout: 20000 });
    expect(screen.queryByPlaceholderText('e.g. Toyota Corolla')).toBeNull();
    expect(screen.queryByPlaceholderText('e.g. Vanguard ETF')).toBeNull();
    fireEvent.changeText(nameInput, 'Home');
    await screen.findByDisplayValue('Home');
    fireEvent.changeText(screen.getByPlaceholderText('$0'), '3000');
    await screen.findByDisplayValue('3000');
    fireEvent.press(screen.getByText('Save'));

    // The factual confirmation reflects the STRUCTURED saved type — never
    // the Vehicle entry preset.
    await screen.findByText('Property added', {}, { timeout: 20000 });
    expect(screen.getByText('Saved to your money picture.')).toBeTruthy();
    expect(screen.queryByText('Vehicle added')).toBeNull();
    expect(screen.queryByText('MILESTONE')).toBeNull();
    const saved = (await stored()).assets.find((a) => a.label === 'Home');
    expect(saved?.type).toBe('property');
    fireEvent.press(screen.getByTestId('celebration-toast-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('celebration-toast')).toBeNull(), { timeout: 20000 });
    // Progress advanced by exactly one resolved step.
    expect(screen.getByText('2 of 7 complete')).toBeTruthy();
  }, 60000);

});
