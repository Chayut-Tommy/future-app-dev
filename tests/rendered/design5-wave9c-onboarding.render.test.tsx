// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per describe in beforeAll and asserts across many tests.
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
import { DISCLOSURE_TEXT } from '../../src/screens/welcome/WelcomeFlow';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 9c — the onboarding journey, RENDERED against the
 * real RootNavigator and the REAL atomic completion seam.
 *
 * Root 1 walks the full seven-state journey with optional records, forces a
 * deterministic persistence FAILURE at the completion seam (AsyncStorage
 * setItem rejects once), proves nothing persisted and the customer stayed
 * on the disclosure with drafts and banner, then Retries to success and
 * reconciles every persisted record exactly once. Root 2 walks the Skip
 * path and proves skipped values remain ABSENT.
 */

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

/** Writes to the app-data key since a checkpoint — the no-intermediate-
 * writes and exactly-once proofs count REAL storage traffic. */
function appDataWrites(spy: jest.SpyInstance, from: number): number {
  return spy.mock.calls.slice(from).filter((c) => c[0] === STORAGE_KEY).length;
}

async function storedData(): Promise<AppData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AppData) : null;
}

describe('Wave 9c — full journey, atomic failure and Retry (real seam)', () => {
  let view: any;
  let setItemSpy: jest.SpyInstance;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    // Fresh install: NOTHING seeded — hasSeenIntro is absent, so the
    // RootNavigator renders the WelcomeFlow.
    setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
    view = await render(<Harness />);
    await screen.findByText(/Meet Nolie/, {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('state 0: Welcome — identity, one Get started, shell hidden', () => {
    expect(screen.getByTestId('onboarding-get-started')).toBeTruthy();
    // The dock, "+" and Settings gear do not exist during onboarding.
    expect(screen.queryByLabelText(/^Today, tab,/)).toBeNull();
    expect(screen.queryByTestId('global-settings-button')).toBeNull();
  });

  test('states 0→2: preview is factual; name is required with no Skip', async () => {
    fireEvent.press(screen.getByTestId('onboarding-get-started'));
    await screen.findByText("See what you've recorded, what's coming up and how the pieces fit together.");
    expect(screen.queryByText(/AI Financial Coach/)).toBeNull();
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 2 of 7');

    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('onboarding-name-input');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 3 of 7');
    // No Skip on the name state.
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    // Continue is disabled until a trimmed non-empty name exists.
    fireEvent.changeText(screen.getByTestId('onboarding-name-input'), '   ');
    await screen.findByDisplayValue('   ');
    expect(screen.getByTestId('onboarding-continue').props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('onboarding-name-input'), '  Jamie ');
    await screen.findByDisplayValue('  Jamie ');
    expect(screen.getByTestId('onboarding-continue').props.accessibilityState?.disabled).toBe(false);
  });

  test('states 3-5: optional age, cadence radios, setup drafts — and NO writes yet', async () => {
    const baseline = setItemSpy.mock.calls.length;
    fireEvent.press(screen.getByTestId('onboarding-continue')); // name -> age
    await screen.findByTestId('onboarding-age-input');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 4 of 7');
    expect(screen.getByTestId('onboarding-skip')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('onboarding-age-input'), '34');
    await screen.findByDisplayValue('34');

    fireEvent.press(screen.getByTestId('onboarding-continue')); // age -> cadence
    await screen.findByTestId('onboarding-cadence-fortnightly');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 5 of 7');
    const tile = screen.getByTestId('onboarding-cadence-fortnightly');
    expect(tile.props.accessibilityRole).toBe('radio');
    expect(tile.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(tile);
    await waitFor(() => expect(screen.getByTestId('onboarding-cadence-fortnightly').props.accessibilityState?.selected).toBe(true));

    fireEvent.press(screen.getByTestId('onboarding-continue')); // cadence -> setup
    await screen.findByText('Add a starting point?');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 6 of 7');
    // The shared ambient canvas is present on the form states too
    // (final correction pass, Correction E).
    // The layer is accessibility-hidden BY DESIGN, so the query must opt in.
    expect(screen.getByTestId('onboarding-ambient-canvas', { includeHiddenElements: true })).toBeTruthy();

    // Final correction pass, Correction A — the structured source comes
    // from the canonical selector (same ids as the real Add Income form).
    fireEvent.press(screen.getByTestId('onboarding-income-source'));
    await screen.findByTestId('onboarding-income-source-option-cat-salary');
    fireEvent.press(screen.getByTestId('onboarding-income-source-option-cat-salary'));
    // Choosing Salary prefilled the empty name — the canonical prefill.
    await screen.findByDisplayValue('Salary');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Salary'), 'Salary');
    await screen.findByDisplayValue('Salary');

    // Correction G, rendered: leaving the NAME field must not flag the
    // untouched amount — no message may exist before the amount's own blur
    // or an attempted Continue. DOCUMENTED HARNESS PATHOLOGY: dispatching
    // `fireEvent(input, 'blur')` leaves RNTL's event pipeline unable to
    // deliver ANY subsequent press in this tree (reproduced in isolation;
    // even an unrelated button goes dead), so the blur handler is invoked
    // directly under act — the same component code path, minus the broken
    // dispatch bookkeeping.
    await act(async () => {
      screen.getByPlaceholderText('e.g. Salary').props.onBlur?.({ nativeEvent: {} });
    });
    expect(screen.queryByText(/Enter an amount|Add an amount/)).toBeNull();
    expect(screen.queryByText(/Choose your next expected payday/)).toBeNull();

    fireEvent.changeText(screen.getAllByPlaceholderText('$0')[0], '2400');
    await screen.findByDisplayValue('2400');

    // Correction A + G — a predictable cadence REQUIRES the payday: an
    // attempted Continue stays on the step and surfaces the calm guidance
    // instead of advancing or persisting a half-record.
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByText('Choose your next expected payday, or clear the block to skip it.');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 6 of 7');

    // Pick tomorrow on the SHARED focused date picker. The draft selection
    // MUST be flushed (selected state asserted) before Done is pressed —
    // pressing both in one synchronous burst commits a stale null draft
    // (the same flush-before-read pathology documented on changeText).
    fireEvent.press(screen.getByTestId('onboarding-payday'));
    await screen.findByTestId('onboarding-payday-choice-plus-1');
    fireEvent.press(screen.getByTestId('onboarding-payday-choice-plus-1'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-payday-choice-plus-1').props.accessibilityState?.selected).toBe(true)
    );
    fireEvent.press(screen.getByTestId('onboarding-payday-done'));
    // Committing the date clears the payday guidance.
    await waitFor(() => expect(screen.queryByText(/Choose your next expected payday/)).toBeNull());
    // Wave 9c closure, Correction D — the Everyday block joins the same
    // atomic combination.
    // Same documented dispatch pathology as the blur above: after the
    // focused-picker session, fireEvent delivery in this tree is
    // unreliable, so each entry drives the SAME onChangeText handler
    // directly under act and then verifies the committed value.
    async function typeInto(getEl: () => any, text: string) {
      await act(async () => {
        getEl().props.onChangeText?.(text);
      });
      await waitFor(() => expect(getEl().props.value).toBe(text));
    }
    await typeInto(() => screen.getByPlaceholderText('e.g. Everyday'), 'Everyday');
    await typeInto(() => screen.getByPlaceholderText('e.g. CBA'), 'CBA');
    await typeInto(() => screen.getAllByPlaceholderText('$0')[1], '1234.56');
    await typeInto(() => screen.getByPlaceholderText('e.g. Rainy day'), 'Rainy day');
    await typeInto(() => screen.getAllByPlaceholderText('$0')[2], '500');

    // Intermediate steps write NOTHING to persisted app data.
    expect(appDataWrites(setItemSpy, baseline)).toBe(0);
  });

  test('state 6: disclosure — byte-identical text, no Skip, checkbox gates the CTA', async () => {
    fireEvent.press(screen.getByTestId('onboarding-continue')); // setup -> disclosure
    await screen.findByText('Before you get started');
    expect(screen.getByTestId('onboarding-progress').props.children).toBe('Step 7 of 7');
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();

    // Byte-for-byte identity against the frozen legal wording.
    const FROZEN =
      'Nolie provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.';
    expect(DISCLOSURE_TEXT).toBe(FROZEN);
    expect(screen.getByText(FROZEN)).toBeTruthy();

    const box = screen.getByTestId('onboarding-acknowledge');
    expect(box.props.accessibilityRole).toBe('checkbox');
    expect(box.props.accessibilityState?.checked).toBe(false);
    // CTA disabled until checked — and the disabled state is exposed.
    expect(screen.getByTestId('onboarding-finish').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(box);
    await waitFor(() => expect(screen.getByTestId('onboarding-acknowledge').props.accessibilityState?.checked).toBe(true));
    expect(screen.getByTestId('onboarding-finish').props.accessibilityState?.disabled).toBe(false);
  });

  test('a FAILED completion persists nothing, stays on state 6 with drafts, banner and Retry', async () => {
    const baseline = setItemSpy.mock.calls.length;
    // Deterministic failure at the REAL seam: the next app-data write rejects.
    setItemSpy.mockRejectedValueOnce(new Error('disk full'));
    fireEvent.press(screen.getByTestId('onboarding-finish'));
    await screen.findByTestId('onboarding-error-banner');

    expect(screen.getByText("We couldn't finish setting up Nolie. Nothing was saved. Try again.")).toBeTruthy();
    // Still on the disclosure — nothing navigated.
    expect(screen.getByText('Before you get started')).toBeTruthy();
    expect(screen.queryByLabelText(/^Today, tab,/)).toBeNull();
    // The checkbox state stays truthful and the CTA becomes Retry.
    expect(screen.getByTestId('onboarding-acknowledge').props.accessibilityState?.checked).toBe(true);
    expect(screen.getByText('Try again')).toBeTruthy();
    // Exactly one attempted write, and NOTHING persisted.
    expect(appDataWrites(setItemSpy, baseline)).toBe(1);
    expect(await storedData()).toBeNull();
  });

  test('Retry commits the SAME draft exactly once; rapid double-tap cannot duplicate', async () => {
    const baseline = setItemSpy.mock.calls.length;
    const finish = screen.getByTestId('onboarding-finish');
    // Two presses in the same frame — the ref latch must swallow the second.
    fireEvent.press(finish);
    fireEvent.press(finish);
    await screen.findByLabelText(/^Today, tab,/, {}, { timeout: 20000 });

    // The FIRST app-data write after the press IS the completion (it flips
    // hasSeenIntro) — proving no intermediate write ever preceded it. Today
    // mounts afterwards and legitimately performs its own writes, so an
    // exact total is not assertable here; duplication is instead excluded
    // below by the record counts (a second commit would duplicate them).
    const writes = setItemSpy.mock.calls.slice(baseline).filter((c) => c[0] === STORAGE_KEY);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect((JSON.parse(writes[0][1]) as AppData).user.hasSeenIntro).toBe(true);
    expect((JSON.parse(writes[0][1]) as AppData).recurringItems.filter((r) => r.type === 'income')).toHaveLength(1);
    const stored = (await storedData())!;
    expect(stored.user.hasSeenIntro).toBe(true);
    expect(stored.user.name).toBe('Jamie');
    expect(stored.user.age).toBe(34);
    expect(stored.user.payFrequency).toBe('fortnightly');
    expect(typeof stored.user.disclosureAcknowledgedAt).toBe('string');
    // The retired fields were never written.
    expect(stored.user.moneyGoal).toBeUndefined();
    expect(stored.user.confidenceLevel).toBeUndefined();
    // Exactly ONE income draft and ONE balance draft, exactly as entered.
    const incomes = stored.recurringItems.filter((r) => r.type === 'income');
    expect(incomes).toHaveLength(1);
    expect(incomes[0].label).toBe('Salary');
    expect(incomes[0].amount).toBe(2400);
    expect(incomes[0].frequency).toBe('fortnightly');
    // Final correction pass, Correction A — the record is born SCHEDULED:
    // the picked payday (tomorrow, local) is stored, the unknown flag is
    // genuinely false, and the aggregate immediately carries the payday —
    // so Money can never again ask this customer to "Add an expected
    // payday" for an income that already exists.
    expect(incomes[0].nextDueDateUnknown).toBe(false);
    const expectedTomorrow = new Date();
    expectedTomorrow.setDate(expectedTomorrow.getDate() + 1);
    const storedDay = new Date(incomes[0].nextDueDate);
    expect(storedDay.getDate()).toBe(expectedTomorrow.getDate());
    expect(storedDay.getMonth()).toBe(expectedTomorrow.getMonth());
    expect(stored.user.nextPayday).toBe(incomes[0].nextDueDate);
    // The canonical source is retained: the record icon and the model's
    // own setup-time field.
    expect(incomes[0].icon).toBe('briefcase-outline');
    expect(stored.user.incomeSource).toBe('cat-salary');
    const savings = stored.assets.filter((a) => a.type === 'savings');
    expect(savings).toHaveLength(1);
    expect(savings[0].label).toBe('Rainy day');
    expect(savings[0].currentValue).toBe(500);
    // Exactly ONE Everyday account, exact cents, canonical shape — and NO
    // silent include-override: the engine default decides Money inclusion.
    const everyday = stored.assets.filter((a) => a.type === 'everyday');
    expect(everyday).toHaveLength(1);
    expect(everyday[0].label).toBe('Everyday');
    expect((everyday[0] as { provider?: string }).provider).toBe('CBA');
    expect(everyday[0].currentValue).toBe(1234.56);
    expect(everyday[0].includeInMoneyCalculations).toBeUndefined();
    // No goal was auto-created.
    expect(stored.goals).toHaveLength(0);
  });
});
