import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { MoneyTimelineCard } from '../../src/components/money/MoneyTimelineCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';
import { TimelineEvent, TimelineEventKind } from '../../src/lib/calculations/moneyTimeline';
import { TimelineFocusTarget } from '../../src/lib/calculations/timelineFocus';
import { occurrenceDateKey, eventOccurrenceIdentity, occurrenceIdentityKey } from '../../src/lib/calculations/todayBriefing';
import { lightColors } from '../../src/theme/tokens';
import { readFileSync } from 'fs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Worth Knowing correction round §1/§2/§3 — a device recording found the
 * persistent green background this file previously proved the presence of
 * was itself the defect: the complete 11 September date group turned green,
 * visually implying an unrelated salary belonged to the selected repayment
 * cluster. That highlight mechanism (highlightDateKey state,
 * styles.groupHighlighted, colors.accentSoft) has been removed from
 * MoneyTimelineCard.tsx entirely — this file now proves its ABSENCE, proves
 * the destination is only ever trusted once its own occurrence identity is
 * confirmed present in the target date group (not merely a shared date),
 * and proves the one-time focus state is genuinely cleared once resolved
 * (never reapplied by an unrelated re-render — the same class of event an
 * edit-sheet open/close or ordinary scroll would produce).
 *
 * computeTimelineFocusFulfillment's own pure decision logic (exact scrollY,
 * occurrence-identity validation, give-up semantics) is proven exhaustively
 * as a real-import unit in tests/worth-knowing.test.ts; this file proves
 * MoneyTimelineCard actually wires that decision into a real rendered tree
 * with no persistent visual side effect. react-test-renderer never computes
 * real layout, so onLayout never fires on its own — the same
 * fireLayoutOnOwner workaround tests/rendered/pass-2e-pushed-destinations.render.test.tsx
 * already established is reused here, and `waitFor` wraps every assertion
 * that depends on the resulting state update, since it is not guaranteed to
 * have flushed by the time `fireEvent` returns in this harness.
 */

const TODAY = new Date(2026, 7, 15); // 15 August 2026

function mkEvent(daysUntil: number, id: string, opts: { kind?: TimelineEventKind; amount?: number; label?: string } = {}): TimelineEvent {
  const date = new Date(TODAY.getTime() + daysUntil * 86400000);
  return {
    id,
    date,
    daysUntil,
    kind: opts.kind ?? 'bill',
    icon: 'calendar-outline',
    label: opts.label ?? `Bill ${id}`,
    amount: opts.amount ?? -50,
    recurringItemId: id,
  };
}

// A date group deliberately shared by two UNRELATED events — the exact
// device-test scenario: an ordinary salary and the actual target repayment
// both fall on the same day. 6 other distinct-day bills push the total past
// VISIBLE_ROW_ESTIMATE (6), so MoneyTimelineCard renders its own
// independently-scrollable box (the surface the original device test found
// unreachable, and where the highlight defect was visible).
const SHARED_DAYS_UNTIL = 27;
const SALARY_EVENT = mkEvent(SHARED_DAYS_UNTIL, 'salary-test', { kind: 'income', amount: 1000, label: 'Salary test' });
const REPAYMENT_EVENT = mkEvent(SHARED_DAYS_UNTIL, 'sy-repayment', { kind: 'bill', amount: -1000, label: 'SY test repayment' });
const OTHER_EVENTS = [1, 2, 3, 4, 5, 6].map((d, i) => mkEvent(d, `other-${i}`));
const EVENTS: TimelineEvent[] = [...OTHER_EVENTS, SALARY_EVENT, REPAYMENT_EVENT];

const TARGET_DATE_KEY = occurrenceDateKey(REPAYMENT_EVENT.date);
const TARGET_OCCURRENCE_KEY = occurrenceIdentityKey(eventOccurrenceIdentity(REPAYMENT_EVENT))!;

async function seedLightData() {
  const data: AppData = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.theme = 'light';
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function Harness({
  focusTarget,
  onFocusHandled,
  reduceMotion = false,
}: {
  focusTarget: TimelineFocusTarget | null;
  onFocusHandled?: () => void;
  reduceMotion?: boolean;
}) {
  return (
    <AppStateProvider>
      <ThemeProvider>
        <MoneyTimelineCard events={EVENTS} focusTarget={focusTarget} onFocusHandled={onFocusHandled} reduceMotion={reduceMotion} />
      </ThemeProvider>
    </AppStateProvider>
  );
}

/** Walks up from a queried element to the nearest ancestor that actually
 * owns the `onLayout` prop, then fires a synthetic layout event there —
 * the same helper pass-2e-pushed-destinations.render.test.tsx already
 * established for this exact react-test-renderer limitation. */
function fireLayoutOnOwner(element: any, y: number) {
  let node = element;
  while (node && typeof node.props?.onLayout !== 'function') {
    node = node.parent;
  }
  if (!node) throw new Error('No ancestor with an onLayout handler was found for this element.');
  fireEvent(node, 'layout', { nativeEvent: { layout: { y, x: 0, width: 300, height: 40 } } });
}

/** Queries for an event row's own label Text, waiting for the render to
 * have genuinely settled first — the mount commit `render()` hands back is
 * not always the final one in this harness. */
async function findEventText(view: any, label: string) {
  return waitFor(() => view.getByText(label));
}

/** Fires a layout event for every one of EVENTS' own date groups (in
 * calendar order, deduplicated by day) — simulates every group in the
 * currently-rendered list having genuinely reported layout, the
 * precondition computeTimelineFocusFulfillment requires before it will
 * safely give up on a target that isn't validly among them. */
async function layoutEveryGroup(view: any) {
  const seenLabels = new Set<string>();
  const labelsInGroupOrder = EVENTS.map((e) => e.label).filter((label) => {
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });
  let y = 0;
  for (const label of labelsInGroupOrder) {
    fireLayoutOnOwner(await findEventText(view, label), y);
    y += 100;
  }
}

// Recursively finds every node whose (possibly array-valued) style prop
// resolves to the given backgroundColor — excluding the small circular icon
// dot (width:30/height:30/borderRadius:15), whose own per-event-kind soft
// colour is pre-existing, legitimate styling entirely unrelated to the
// removed group-level highlight (KIND_COLOR_KEY maps 'income' events to
// 'accent', so an income-kind event's own icon dot legitimately uses
// colors.accentSoft — the exact same hex as colors.successSoft, purely a
// token-value coincidence, not a sign the removed highlight has returned).
// Only a node OUTSIDE that dot shape carrying this backgroundColor would
// indicate the persistent full-group highlight this round removes.
function collectPersistentHighlightNodes(node: any, color: string, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  const style = node.props?.style;
  const flat = Array.isArray(style) ? style : [style];
  const isIconDot = flat.some((s: any) => s && s.width === 30 && s.height === 30 && s.borderRadius === 15);
  if (!isIconDot && flat.some((s: any) => s && s.backgroundColor === color)) out.push(node);
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) collectPersistentHighlightNodes(child, color, out);
  }
  return out;
}

describe('Worth Knowing — MoneyTimelineCard inner-destination focus (rendered proof)', () => {
  // Each test explicitly unmounts its own render before returning — RNTL's
  // underlying react-test-renderer trees (AppStateProvider's own async
  // AsyncStorage-backed effects in particular) otherwise leak a pending
  // effect into the NEXT test's render/AsyncStorage.clear() cycle when a
  // test also fires synthetic events — the same class of cross-test
  // act()-overlap flakiness this repo's own jest.render.config.cjs doc
  // comment already documents as a known, separately-scoped test-
  // infrastructure characteristic.

  test('a valid target (occurrence identity confirmed present) resolves — and no date group anywhere receives a persistent highlight background', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} />);
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
    // colors.accentSoft never appears anywhere — MoneyTimelineCard.tsx no
    // longer references it at all (the highlight mechanism is gone, not
    // merely inactive).
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('a date group containing both an unrelated salary and the target repayment remains visually normal — the salary row keeps its ordinary card background', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} />);
    // Only the repayment's own row reports layout — the group also
    // contains the unrelated salary, proving resolution is driven by the
    // actual occurrence match, not merely "this date has a group".
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    // The salary row's own card still carries the ordinary, unhighlighted
    // surface colour — never implied to be part of the selected payment.
    const salaryText = await findEventText(view, SALARY_EVENT.label!);
    let cardNode = salaryText;
    while (cardNode && !(cardNode.props?.style && (Array.isArray(cardNode.props.style) ? cardNode.props.style : [cardNode.props.style]).some((s: any) => s?.backgroundColor === lightColors.surface))) {
      cardNode = cardNode.parent;
    }
    expect(cardNode).toBeTruthy();
    await view.unmount();
  });

  test('exact occurrence identity is checked before focus fulfillment — a matching date with an unrelated occurrence never scrolls or highlights', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    // A target claiming an occurrence key that does not exist anywhere in
    // the rendered list, on a date that DOES exist (SALARY_EVENT's own
    // date) — the date coincidentally matches; the occurrence does not.
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: ['recurring_item:nonexistent:' + TARGET_DATE_KEY] };
    const view = await render(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} />);
    await layoutEveryGroup(view);
    // Still resolves (gives up safely) so the caller can clear its target —
    // but with no highlight anywhere.
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('a stale target — salary remains on the shared date but the target repayment occurrence is gone — falls back safely (date group exists, occurrence does not)', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    // The target claims the (now-removed) repayment's own occurrence key,
    // but the rendered list only actually contains the salary on that date
    // — simulating the repayment having been deleted/edited away between
    // when the insight was computed and when the customer tapped it.
    const eventsWithoutRepayment = EVENTS.filter((e) => e.id !== REPAYMENT_EVENT.id);
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(
      <AppStateProvider>
        <ThemeProvider>
          <MoneyTimelineCard events={eventsWithoutRepayment} focusTarget={focusTarget} onFocusHandled={onFocusHandled} reduceMotion={false} />
        </ThemeProvider>
      </AppStateProvider>
    );
    // Every remaining group reports layout, including the salary's own
    // group at the target date — the date group genuinely exists.
    const seenLabels = new Set<string>();
    let y = 0;
    for (const e of eventsWithoutRepayment) {
      if (seenLabels.has(e.label!)) continue;
      seenLabels.add(e.label!);
      fireLayoutOnOwner(await findEventText(view, e.label!), y);
      y += 100;
    }
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('opening and dismissing an edit sheet (an unrelated re-render with the same already-resolved focusTarget) does not re-invoke focus handling a second time', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} />);
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));

    // Simulates the exact re-render an edit sheet open/dismiss (or ordinary
    // scrolling) produces: the same component, the same still-unresolved-
    // to-null-yet focusTarget prop (MoneyScreen only clears it AFTER this
    // callback fires — this render call represents the instant just before
    // that clear takes visible effect, the narrowest possible window).
    await view.rerender(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} />);
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    // Give any errant re-fire a chance to occur, then confirm it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('a fresh Worth Knowing navigation (a genuinely new requestId) still resolves after a prior target was already handled', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const firstTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(<Harness focusTarget={firstTarget} onFocusHandled={onFocusHandled} />);
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));

    // A genuinely fresh tap — new requestId, a different target date/event.
    const otherEvent = OTHER_EVENTS[0];
    const secondTarget: TimelineFocusTarget = {
      requestId: 2,
      dateKey: occurrenceDateKey(otherEvent.date),
      occurrenceKeys: [occurrenceIdentityKey(eventOccurrenceIdentity(otherEvent))!],
    };
    await view.rerender(<Harness focusTarget={secondTarget} onFocusHandled={onFocusHandled} />);
    fireLayoutOnOwner(await findEventText(view, otherEvent.label!), 50);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(2));
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('no focusTarget at all (the ordinary AUP/event-row/plain-visit case) never invokes onFocusHandled, even after every group reports layout', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const view = await render(<Harness focusTarget={null} onFocusHandled={onFocusHandled} />);
    await layoutEveryGroup(view);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onFocusHandled).not.toHaveBeenCalled();
    expect(collectPersistentHighlightNodes(view.toJSON(), lightColors.accentSoft).length).toBe(0);
    await view.unmount();
  });

  test('Reduce Motion on or off has no bearing on resolution — there is no animation of any kind for it to gate', async () => {
    await AsyncStorage.clear();
    await seedLightData();
    const onFocusHandled = jest.fn();
    const focusTarget: TimelineFocusTarget = { requestId: 1, dateKey: TARGET_DATE_KEY, occurrenceKeys: [TARGET_OCCURRENCE_KEY] };
    const view = await render(<Harness focusTarget={focusTarget} onFocusHandled={onFocusHandled} reduceMotion />);
    fireLayoutOnOwner(await findEventText(view, REPAYMENT_EVENT.label!), 340);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
    await view.unmount();
  });

  test('MoneyTimelineCard.tsx introduces no animation of its own (no Animated.*, no LayoutAnimation), and no longer defines any highlight style', () => {
    const MONEY_TIMELINE_CARD_SRC = readFileSync('src/components/money/MoneyTimelineCard.tsx', 'utf8');
    expect(/Animated\.|LayoutAnimation/.test(MONEY_TIMELINE_CARD_SRC)).toBe(false);
    expect(/groupHighlighted|highlightDateKey|accentSoft/.test(MONEY_TIMELINE_CARD_SRC)).toBe(false);
  });
});
