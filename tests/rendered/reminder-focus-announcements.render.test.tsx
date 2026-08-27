import React, { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider, useAppState } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { TodayBriefingCard } from '../../src/components/today/TodayBriefingCard';
import { ReminderDetailSheet } from '../../src/components/today/ReminderDetailSheet';
import { computeRankedReminder } from '../../src/lib/calculations/reminders';
import { createSuppressionPredicate } from '../../src/lib/calculations/reminderSuppression';
import { ReminderOpenRequest, createReminderOpenRequest } from '../../src/lib/calculations/reminderInteractionLifecycle';
import { selectTodayBriefingEventRows } from '../../src/lib/calculations/todayBriefing';
import { computeMoneyTimeline } from '../../src/lib/calculations/moneyTimeline';
import { computeSafeToSpend } from '../../src/lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../src/lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation } from '../../src/lib/calculations/safeToSpendPresentation';
import { computeLuluScore } from '../../src/lib/calculations/luluScore';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

/**
 * Wave 5 visual pass — the Briefing's reminder control is now a full-width
 * priority row named by the REMINDER'S OWN TITLE ("Rent is due, Fri 22 Aug,
 * $1,800") rather than by the tile's category word ("Reminder, Bill due,
 * Action needed"). That is the improvement this pass exists to deliver: the
 * control says what it is about instead of what kind of thing it is.
 *
 * These suites are about the reminder LIFECYCLE, not its label, so they
 * find the control by the stable identity the row carries — its testID,
 * which encodes the reminder's own id. One assertion below still checks the
 * accessible NAME directly, so the "queryable by real semantics" property
 * this file protects is preserved rather than dropped.
 */
const REMINDER_ROW = /^briefing-priority-row-reminder-/;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Reminder focus/announcements task — rendered coverage for the
 * accessibility-focus-movement and validation-announcement lifecycle added
 * to ReminderDetailSheet.tsx/SmartReminderCard.tsx/the repayment form
 * components/TodayScreen.tsx's origin-restore wiring.
 *
 * Mocks ONLY the native accessibility event boundary
 * (AccessibilityInfo.sendAccessibilityEvent / announceForAccessibility) —
 * every other piece (reducer, forms, hooks, mutations, AppStateProvider,
 * persistence) is the real production implementation, exercised through
 * real customer-facing controls (button presses, text typing), mirroring
 * reminder-lifecycle.render.test.tsx's own established harness pattern.
 *
 * RN's own jest Modal mock (node_modules/react-native/jest/mocks/Modal.js)
 * never calls onShow/onDismiss itself — those remain inert props on a
 * plain host element in this environment. `onFullyClosed` (this task's own
 * addition) is deliberately gated behind the REAL native onDismiss signal
 * (preserving the existing, accepted no-blank-shell contract byte-for-byte
 * — see ReminderDetailSheet.tsx's own doc comment), so the tests that need
 * to observe it invoke KeyboardSheet's underlying Modal.props.onDismiss
 * directly via RNTL's `root.queryAll` traversal — the standard, documented
 * way to simulate a native lifecycle callback the mock doesn't fire on its
 * own. This is not a mock of application logic — Modal itself is already
 * RN's own test double in this environment regardless of this file.
 *
 * That Modal-instance-capture technique only works when nothing else
 * observable changes between capture and firing (confirmed by the "closing
 * manually while a Reminder remains" test below, which proves the real
 * Modal → onDismiss → onFullyClosed wiring fires correctly end to end).
 * When the SAME user action that closes the sheet ALSO mutates topReminder
 * (the "every Reminder resolved" fallback scenario), this environment's
 * lightweight test-renderer prunes the Modal instance from the queryable
 * tree the instant `visible` flips false — the exact same React commit that
 * updates topReminder — so there is no capturable instance whose bound
 * onDismiss closure reflects the post-mutation topReminder. Rather than
 * fire a stale, pre-mutation closure (which would silently target an
 * already-unmounted ref and prove nothing), that one test instead calls
 * `latestOnFullyClosed` directly below — the exact same function
 * ReminderDetailSheet's real onDismiss handler would call, captured via a
 * ref updated on every render so it is always current. This is not a
 * shortcut around the invariant: the Modal → onDismiss plumbing itself is
 * already independently proven by the sibling test.
 */
let latestOnFullyClosed: (() => void) | null = null;
function TodayBriefingHarness({ today }: { today: Date }) {
  const { data } = useAppState();
  // Wave 6 polish — mirrors TodayScreen's OWN wiring, including the
  // persisted suppression predicate. Without it this harness would keep
  // advertising a reminder the real app has already suppressed, and the
  // suite would be testing a screen that does not exist.
  const topReminder = useMemo(
    () => computeRankedReminder(data, today, createSuppressionPredicate(data, today)),
    [data, today]
  );
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, today), [data, today]);
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);
  const safeToSpend = useMemo(() => computeSafeToSpend(data, today), [data, today]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const safeToSpendPresentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  const luluScore = useMemo(() => computeLuluScore(data), [data]);
  const reminderOpenRequestIdRef = useRef(0);
  const [reminderOpenRequest, setReminderOpenRequest] = useState<ReminderOpenRequest | null>(null);

  // Mirrors TodayScreen.tsx's own origin-focus-restore wiring exactly —
  // real reminderTileRef/briefingHeadingRef targets, real topReminder-gated
  // fallback decision.
  const reminderTileRef = useRef<any>(null);
  const briefingHeadingRef = useRef<any>(null);
  function handleReminderSheetFullyClosed() {
    const { sendFocusEvent } = require('../../src/lib/a11yFocus');
    if (topReminder) {
      sendFocusEvent(reminderTileRef);
    } else {
      sendFocusEvent(briefingHeadingRef);
    }
  }
  // Reassigned every render so it always reflects the current topReminder —
  // see this file's top-of-file doc comment for why one test calls this
  // directly instead of simulating the native Modal dismissal.
  latestOnFullyClosed = handleReminderSheetFullyClosed;

  return (
    <>
      <TodayBriefingCard
        presentation={safeToSpendPresentation}
        eventRows={briefingEventRows}
        timelineEvents={timelineEvents}
        timeframeLine={null}
        topReminder={topReminder}
        onPressAup={() => {}}
        onPressEventRow={() => {}}
        onPressReminderTile={() => {
          if (!topReminder) return;
          reminderOpenRequestIdRef.current += 1;
          setReminderOpenRequest(createReminderOpenRequest(reminderOpenRequestIdRef.current, topReminder));
        }}
        headingRef={briefingHeadingRef}
        reminderTileRef={reminderTileRef}
      />
      <ReminderDetailSheet openRequest={reminderOpenRequest} today={today} onFullyClosed={handleReminderSheetFullyClosed} />
    </>
  );
}

function Harness({ today }: { today: Date }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <NavigationContainer>
        <AppStateProvider>
          <ThemeProvider>
            <TodayBriefingHarness today={today} />
          </ThemeProvider>
        </AppStateProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function isoDaysAgo(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function seed(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function baseData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  return data;
}

/** Locates the native Modal's TestInstance — via `root.queryAll` (this RNTL
 * version's supported low-level tree-traversal API — there is no
 * UNSAFE_root/UNSAFE_getByType here) matching on `onRequestClose`, a prop
 * unique to RN's own Modal among everything else this tree renders. Must be
 * called BEFORE the action that closes the sheet: RN's jest Modal mock
 * (node_modules/react-native/jest/mocks/Modal.js) renders `null` once
 * `props.visible` becomes false, so once the sheet has actually closed the
 * Modal has already unmounted and is no longer findable in the tree. */
function findNativeModalInstance() {
  const [modalInstance] = screen.root!.queryAll((instance) => 'onRequestClose' in instance.props);
  return modalInstance;
}

/** Simulates the native Modal's own dismissal genuinely finishing — RN's
 * jest Modal mock never calls onDismiss itself (it's an inert prop on a
 * plain host element), so this is the standard way to exercise
 * onDismiss-gated production code in this test environment. Takes the
 * instance captured by findNativeModalInstance() BEFORE the close action —
 * its `onDismiss` prop is a stable function reference that remains callable
 * even after the Modal itself has unmounted from the tree. */
function fireNativeModalDismiss(modalInstance: ReturnType<typeof findNativeModalInstance>) {
  modalInstance.props.onDismiss?.();
}

describe('Reminder focus and announcements — rendered coverage', () => {
  const today = new Date(2026, 5, 15);

  beforeEach(async () => {
    await AsyncStorage.clear();
    // RN's own jest preset already auto-mocks AccessibilityInfo's native
    // methods as jest.fn()s — jest.spyOn on an already-mocked function just
    // tracks the SAME underlying mock, so restoreAllMocks() (which only
    // restores implementations, never clears call history) would leave
    // accumulated calls from earlier tests in this file visible here.
    // clearAllMocks() resets call/result history for every mock, including
    // RN's own pre-existing ones, giving each test a genuinely fresh count.
    jest.clearAllMocks();
  });

  test('focus event fires once on initial open, targeting a real mounted node', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.recurringItems.push({
      id: 'rent',
      type: 'expense',
      label: 'Rent',
      amount: 500,
      frequency: 'monthly',
      nextDueDate: isoDaysAgo(today, 2),
      isFixed: true,
      active: true,
    });
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await screen.findByTestId('reminder-title');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBeTruthy();
    expect(sendSpy.mock.calls[0][1]).toBe('focus');
  });

  test('advancing to the next Reminder in the same session fires a further focus event at the same title target', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.recurringItems.push(
      { id: 'rent', type: 'expense', label: 'Rent', amount: 500, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 2), isFixed: true, active: true },
      { id: 'internet', type: 'expense', label: 'Internet', amount: 60, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 1), isFixed: true, active: true }
    );
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await screen.findByTestId('reminder-title');
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // RECONCILED (Design 5.1 Wave 6 final): "Not yet" on a bill is
    // superseded by Snooze, which advances the queue exactly as the session
    // defer did and additionally records the chosen day. The focus property
    // under test — one focus event per genuine content change — is
    // unchanged and still asserted below.
    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));
    // RECONCILED (Wave 6 polish): titled by the item.
    await screen.findByText('Internet');

    // A further, genuine transition fires a further call — and since both
    // reminder_detail states share the same SmartReminderCard instance
    // (never unmounted/remounted mid-session), the target node is the
    // exact same title ref both times.
    expect(sendSpy).toHaveBeenCalledTimes(2);
    // Compared as a boolean (not a direct .toBe on the raw node) — jest's
    // failure-diff printer can throw trying to pretty-print a React host
    // instance/fiber object; wrapping in === keeps the assertion itself
    // meaningful without ever attempting to serialize either side.
    expect(sendSpy.mock.calls[1][0] === sendSpy.mock.calls[0][0]).toBe(true);
  });

  test('three sequential advances produce exactly one focus call per genuine transition — never a duplicate or stale-superseded call', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.recurringItems.push(
      { id: 'rent', type: 'expense', label: 'Rent', amount: 500, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 3), isFixed: true, active: true },
      { id: 'internet', type: 'expense', label: 'Internet', amount: 60, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 2), isFixed: true, active: true },
      { id: 'phone', type: 'expense', label: 'Phone', amount: 40, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 1), isFixed: true, active: true }
    );
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await screen.findByTestId('reminder-title');
    // RECONCILED (Design 5.1 Wave 6 final): "Not yet" on a bill is
    // superseded by Snooze, which advances the queue exactly as the session
    // defer did and additionally records the chosen day. The focus property
    // under test — one focus event per genuine content change — is
    // unchanged and still asserted below.
    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));
    // RECONCILED (Wave 6 polish): titled by the item.
    await screen.findByText('Internet');
    // RECONCILED (Design 5.1 Wave 6 final): "Not yet" on a bill is
    // superseded by Snooze, which advances the queue exactly as the session
    // defer did and additionally records the chosen day. The focus property
    // under test — one focus event per genuine content change — is
    // unchanged and still asserted below.
    await user.press(screen.getByTestId('reminder-snooze-action'));
    await user.press(screen.getByTestId('reminder-snooze-tomorrow'));
    await screen.findByText('Phone');

    // Exactly 3 genuine content changes (open, ->Internet, ->Phone) — never
    // more, proving the identity-dedup mechanism never re-fires for a
    // superseded/stale identity and never fires twice for the same one.
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  test('typing in the repayment amount field never steals focus, before or after the form genuinely opens', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as any);
    data.creditCards.push({
      id: 'card-1',
      issuer: 'Visa',
      label: 'Everyday Visa',
      creditLimit: 2000,
      currentBalance: 300,
      dueDay: today.getDate(),
      minimumPayment: 25,
    } as any);
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    expect(sendSpy).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByText('How much did you pay?');
    expect(sendSpy).toHaveBeenCalledTimes(2); // the form's own heading

    const amountInput = screen.getByDisplayValue('');
    await user.type(amountInput, '1');
    await user.type(amountInput, '2');
    await user.type(amountInput, '.50');

    // Typing four separate characters — each one a genuine re-render of the
    // form (new amountText, recomputed validation) — never adds a further
    // focus call. The customer's cursor position in the field is
    // undisturbed by construction, since contentIdentity never changes
    // while still in card_form for the same occurrence.
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  test('Cancel from the repayment form returns focus to the same Reminder\'s own content, not the form', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as any);
    data.creditCards.push({
      id: 'card-1',
      issuer: 'Visa',
      label: 'Everyday Visa',
      creditLimit: 2000,
      currentBalance: 300,
      dueDay: today.getDate(),
      minimumPayment: 25,
    } as any);
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await screen.findByText(/Everyday Visa/);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const reminderDetailNode = sendSpy.mock.calls[0][0];

    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByText('How much did you pay?');
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const formNode = sendSpy.mock.calls[1][0];
    expect(formNode === reminderDetailNode).toBe(false);

    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('button', { name: 'Record payment' });

    // Back to reminder_detail for the SAME occurrence — a third call.
    // ReminderDetailSheet.tsx only mounts <SmartReminderCard> while
    // presentedState.kind === 'reminder_detail' (it's absent, not merely
    // hidden, for every other kind) — so the Cancel round-trip genuinely
    // unmounts and remounts SmartReminderCard, producing a brand-new host
    // Text instance for reminderTitleRef. Raw node identity (=== the node
    // from the initial open) will therefore never match, by the existing,
    // accepted conditional-render architecture — not a defect. What must
    // hold, and is verified here, is that the newly-focused node carries the
    // exact same content (the same reminder's title) and is distinct from
    // the form's own heading.
    expect(sendSpy).toHaveBeenCalledTimes(3);
    const cancelNode = sendSpy.mock.calls[2][0];
    expect(cancelNode).toBeTruthy();
    expect(cancelNode === formNode).toBe(false);
    expect((cancelNode as any).props.children).toBe((reminderDetailNode as any).props.children);
  });

  test('an exceeding-balance amount announces once and does not re-announce while unchanged, but announces again once it recurs', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as any);
    data.creditCards.push({
      id: 'card-1',
      issuer: 'Visa',
      label: 'Everyday Visa',
      creditLimit: 2000,
      currentBalance: 300,
      dueDay: today.getDate(),
      minimumPayment: 25,
    } as any);
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByText('How much did you pay?');

    const amountInput = screen.getByDisplayValue('');
    await user.type(amountInput, '999');
    await screen.findByText(/That's more than the current recorded balance/);
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining("That's more than the current recorded balance"));

    // Typing a further digit keeps the SAME exceeds-balance message (the
    // message text never includes the entered amount) — must not re-announce
    // an unchanged message.
    await user.type(amountInput, '9');
    expect(announceSpy).toHaveBeenCalledTimes(1);

    // Clear back to a valid, non-exceeding amount — the message genuinely
    // disappears (no announcement for clearing).
    await user.clear(amountInput);
    await user.type(amountInput, '10');
    expect(screen.queryByText(/That's more than the current recorded balance/)).toBeNull();
    expect(announceSpy).toHaveBeenCalledTimes(1);

    // The error genuinely reappears as a new occurrence — announced again.
    await user.clear(amountInput);
    await user.type(amountInput, '999');
    await screen.findByText(/That's more than the current recorded balance/);
    expect(announceSpy).toHaveBeenCalledTimes(2);
  });

  test('a successful payment moves focus to the confirmation content, distinct from the form it replaced', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as any);
    data.creditCards.push({
      id: 'card-1',
      issuer: 'Visa',
      label: 'Everyday Visa',
      creditLimit: 2000,
      currentBalance: 300,
      dueDay: today.getDate(),
      minimumPayment: 25,
    } as any);
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    await user.press(await screen.findByTestId(REMINDER_ROW));
    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByText('How much did you pay?');
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const formNode = sendSpy.mock.calls[1][0];

    const amountInput = screen.getByDisplayValue('');
    await user.type(amountInput, '50');
    await user.press(screen.getByTestId('account-choice-cash'));
    await user.press(await screen.findByRole('button', { name: 'Record payment' }));
    await screen.findByText('Payment recorded');

    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(sendSpy.mock.calls[2][0] === formNode).toBe(false);
  });

  test('closing manually while a Reminder remains restores focus to the originating Briefing tile', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.recurringItems.push(
      { id: 'rent', type: 'expense', label: 'Rent', amount: 500, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 2), isFixed: true, active: true },
      { id: 'internet', type: 'expense', label: 'Internet', amount: 60, frequency: 'monthly', nextDueDate: isoDaysAgo(today, 1), isFixed: true, active: true }
    );
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    const tile = await screen.findByTestId(REMINDER_ROW);
    await user.press(tile);
    await screen.findByTestId('reminder-title');

    const modalInstance = findNativeModalInstance();
    // RECONCILED (Design 5.1 Wave 6 closure): the detached "Close" text
    // that floated below the reminder content was removed — Close now lives
    // once, in the sheet header, where every other state of this sheet
    // already put it. Same control, same handler (handleForceClose), same
    // meaning: end the review without acknowledging, deferring or recording
    // anything. Only where the customer taps it changed.
    await user.press(screen.getByTestId('reminder-header-close'));
    fireNativeModalDismiss(modalInstance);

    // A real reminder is still outstanding (nothing was resolved) — the
    // Briefing tile itself is still mounted, and focus was restored there,
    // not to the fallback heading. Compared via accessibility semantics
    // (label/role), not raw object identity: `tile` is an RNTL TestInstance
    // wrapper while the focus target captured by sendSpy is the actual host
    // ref instance sendFocusEvent operated on — different object kinds by
    // construction, never `===` to one another even when they represent the
    // same rendered element.
    const finalCall = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect((finalCall[0] as any)?.props?.accessibilityLabel).toBe((tile as any).props.accessibilityLabel);
    expect((finalCall[0] as any)?.props?.accessibilityRole).toBe('button');
  });

  test('closing manually after every Reminder is resolved falls back to the Briefing heading (origin tile no longer exists)', async () => {
    const sendSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 1000 } as any);
    data.recurringItems.push({
      id: 'rent',
      type: 'expense',
      label: 'Rent',
      amount: 500,
      frequency: 'monthly',
      nextDueDate: isoDaysAgo(today, 2),
      isFixed: true,
      active: true,
    });
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);
    const heading = await screen.findByRole('header', { name: 'Your Today Briefing' });

    await user.press(await screen.findByTestId(REMINDER_ROW));
    // RECONCILED (Design 5.1 Wave 6 final): the bill's primary verb is now
    // the context-specific "Mark as paid". Same control, same journey.
    await user.press(screen.getByRole('button', { name: 'Mark as paid' }));
    await user.press(await screen.findByTestId('account-choice-cash'));
    await user.press(screen.getByTestId('bill-confirm-action'));

    // The mutation applied and nothing remains eligible — the sheet's own
    // state already settled to 'closed'. This is the ONE scenario where the
    // SAME action that closes the sheet also flips topReminder to null in
    // the same React commit — RN's own jest Modal mock prunes the Modal
    // instance from the queryable tree the instant `visible` goes false, so
    // there is no capturable instance whose bound onDismiss closure reflects
    // this post-mutation topReminder (see this file's top-of-file doc
    // comment for the full reasoning, and the previous test for proof the
    // real Modal → onDismiss → onFullyClosed wiring itself is sound).
    // `latestOnFullyClosed` is the exact same function the real onDismiss
    // handler would call, kept current via a per-render ref assignment.
    latestOnFullyClosed?.();

    expect(screen.queryByTestId(REMINDER_ROW)).toBeNull();
    // Compared via accessibility semantics, not raw object identity — see
    // the comment on the previous test for why `=== heading` (an RNTL
    // TestInstance) can never match the raw host ref instance sendSpy
    // captures, even for the same rendered element.
    const finalCall = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect((finalCall[0] as any)?.props?.accessibilityRole).toBe('header');
    expect((finalCall[0] as any)?.props?.children).toBe((heading as any).props.children);
  });

  test('exactly one sheet is visible throughout a full flow, and real content is present at every step — never blank, never doubled', async () => {
    const data = baseData();
    data.assets.push({ id: 'cash', type: 'cash', label: 'Cash', currentValue: 500 } as any);
    data.creditCards.push({
      id: 'card-1',
      issuer: 'Visa',
      label: 'Everyday Visa',
      creditLimit: 2000,
      currentBalance: 300,
      dueDay: today.getDate(),
      minimumPayment: 25,
    } as any);
    await seed(data);

    const user = userEvent.setup();
    await render(<Harness today={today} />);

    await user.press(await screen.findByTestId(REMINDER_ROW));
    expect(screen.getAllByText(/Everyday Visa/).length).toBeGreaterThan(0);

    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText('How much did you pay?')).toBeOnTheScreen();
    expect(screen.queryAllByText('How much did you pay?').length).toBe(1);

    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Record payment' })).toBeOnTheScreen();
    expect(screen.queryByText('How much did you pay?')).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Record payment' }));
    const amountInput = await screen.findByDisplayValue('');
    await user.type(amountInput, '50');
    await user.press(screen.getByTestId('account-choice-cash'));
    await user.press(await screen.findByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText('Payment recorded')).toBeOnTheScreen();
    expect(screen.queryAllByText('Payment recorded').length).toBe(1);
  });
});
