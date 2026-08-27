import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { computeRankedReminder, SmartReminder } from '../../lib/calculations/reminders';
import { createSuppressionPredicate, suppressionReasonFor } from '../../lib/calculations/reminderSuppression';
import { SmartReminderCard } from './SmartReminderCard';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { reminderQueueTitle, reminderDaysUntil } from '../../lib/reminderPresentation';

/** Bounded so a pathological data set cannot spin the queue scan. Far above
 * any realistic number of simultaneously eligible reminders. */
const QUEUE_SCAN_LIMIT = 50;
import { Button } from '../shared/Button';
import { useLoanRepaymentForm } from '../../hooks/useLoanRepaymentForm';
import { useCreditCardRepaymentForm } from '../../hooks/useCreditCardRepaymentForm';
import { LoanRepaymentFormFields } from '../credit/LoanRepaymentFormFields';
import { CreditCardRepaymentFormFields } from '../credit/CreditCardRepaymentFormFields';
import { PaymentRecordedContent } from '../credit/PaymentRecordedContent';
import {
  reduceReminderLifecycle,
  ReminderLifecycleState,
  ReminderOpenRequest,
  ReminderReviewOutcome,
  isReminderLifecycleVisible,
  shouldProcessOpenRequest,
  resolveOpenReminder,
  occurrenceKeyOf,
} from '../../lib/calculations/reminderInteractionLifecycle';
import { AppData } from '../../types/models';
import { sendFocusEvent } from '../../lib/a11yFocus';

const CLOSED_STATE: ReminderLifecycleState = { kind: 'closed' };

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * this sheet is now the SOLE native Modal owner for the entire Reminder
 * experience: viewing the reminder question, the loan repayment form, the
 * credit-card repayment form, and both "Payment recorded" confirmations are
 * all CONTENT STATES inside the one KeyboardSheet-owned Modal, never a
 * second, nested Modal.
 *
 * Reminder-opening correction round — this component is now also the SOLE
 * authority for whether that one Modal is visible. Confirmed root cause of
 * the blank-sheet device-test defect this round fixes (see this round's
 * final report §1/§2): `KeyboardSheet.visible` was previously bound
 * directly to an EXTERNAL `visible` boolean prop (TodayScreen's own
 * `reminderSheetVisible`), a second, independently-tracked source of truth
 * competing with this component's own reducer. On the render where that
 * external prop flipped false->true, TWO separate `useEffect`s fired in
 * the SAME commit, both reading that render's own STALE `state.kind`
 * closure (still 'closed' — the OPEN dispatch from the first effect had
 * not yet applied): the first effect dispatched OPEN, but the second
 * effect's own guard (`state.kind === 'closed' && visible`) was ALSO true
 * on that same pass, so it immediately called the external `onClose()` —
 * collapsing the external `visible` prop back to false before the OPEN
 * dispatch's own re-render could ever show content. The Modal briefly
 * presented with `state.kind` still 'closed' (title "Reminder", no body,
 * no footer) before auto-closing, reproducing identically on every tap —
 * this is a deterministic JS/React effect-ordering fact, not a native/
 * timing-dependent one, which is why it reproduced on every single press.
 *
 * Fixed structurally, not patched: `KeyboardSheet.visible` is now DERIVED
 * from `isReminderLifecycleVisible(state)` (this file's own reducer state)
 * — there is no second boolean left to race. Opening is driven by an
 * atomic `ReminderOpenRequest` prop (`{requestId, occurrenceKey, reminder}`,
 * reminderInteractionLifecycle.ts) built once, synchronously, by
 * TodayScreen's own tile-press handler — never a raw `visible` toggle.
 * Closing (the "Close" link, system Back, `onNavigateAway`) now dispatches
 * `FORCE_CLOSE` directly, a purely local decision — this component no
 * longer needs to notify a parent boolean at all, so there is nothing left
 * for a second effect to race against.
 *
 * Confirmed root cause of the EARLIER (already-fixed) stacked-native-Modal
 * defect: the prior round already fixed the "unmount reacting to live
 * topReminder" defect, but LoanRepaymentSheet/CreditCardRepaymentSheet
 * still each owned their OWN KeyboardSheet-driven native Modal, stacked
 * underneath this sheet's own — confirmed via direct component-tree
 * inspection, not inferred from the recording. Two native Modals, closed
 * via independent `setState` calls batched into the SAME React commit,
 * gave no guarantee iOS had actually finished the child's native dismissal
 * before the parent changed/unmounted it — the same risk class as the
 * originally observed touch-intercepting layer. Consolidating to ONE Modal
 * (Option A, chosen over Option B's explicit two-Modal sequencing because
 * it can be reached here without duplicating LoanRepaymentSheet's/
 * CreditCardRepaymentSheet's own validation/mutation logic — see
 * useLoanRepaymentForm.ts/useCreditCardRepaymentForm.ts, both relocated
 * verbatim) makes the whole class of risk structurally impossible: there
 * is never a second Modal to race, so no dismissal-ordering question can
 * ever arise. That architecture is unchanged and preserved this round.
 *
 * The interaction lifecycle itself is a pure, independently-tested
 * reducer (reduceReminderLifecycle, reminderInteractionLifecycle.ts) —
 * this component only wires React state/effects around it, never makes its
 * own ad hoc presentation decisions.
 *
 * Reminder queue correction round — two further corrections layered on top
 * of the above, both confirmed via device-test recordings:
 *
 * (A) "Not yet" no longer terminates the review. SmartReminderCard.tsx no
 * longer keeps its own dismissedIds hide-list (the confirmed root cause —
 * see that file's own doc comment); it instead reports a ReminderReviewOutcome
 * via onOutcome. This component owns a session-scoped `sessionDeferredKeysRef`
 * — occurrence keys the customer said "Not yet"/"Got it" to THIS review
 * session only, never persisted, cleared at the start of every fresh open
 * (see the openRequest effect below). `advanceToNextEligible` re-ranks via
 * the canonical `computeRankedReminder(data, today, isSessionExcluded)` —
 * the SAME priority/tie-break order `computeTopReminder` always used, just
 * skipping session-excluded occurrences — so "Not yet" on Richmond
 * immediately shows SY (if SY outranks the exclusion), never closes the
 * whole review.
 *
 * (B) No blank shell during any transition, including the final close.
 * `lastPresentedStateRef` retains the most recent non-'closed' state;
 * `presentedState` (derived once per render, before any JSX) falls back to
 * it whenever the real `state` is 'closed' — so content stays on screen
 * for the entire native closing-animation window, only clearing once
 * KeyboardSheet's own existing `onDismiss` reports the native Modal has
 * actually finished dismissing (handleNativeDismissComplete below) — no
 * timeout, no guessed animation duration, no second Modal. `visible` still
 * derives from the REAL `state`, so the close animation begins immediately;
 * only the CONTENT lags behind by design. Every same-sheet advancement
 * (Not yet -> next reminder, Done -> next reminder) already goes straight
 * from one non-'closed' state to another in a single dispatch (SETTLED),
 * so presentedState never diverges from state in that case — the fallback
 * only ever engages on a genuine final close.
 */
export function ReminderDetailSheet({
  openRequest,
  today,
  onFullyClosed,
}: {
  /** The atomic, collision-safe open request TodayScreen's tile-press
   * handler builds — null when nothing has ever been requested yet. See
   * reminderInteractionLifecycle.ts's own doc comment for the full
   * contract. */
  openRequest: ReminderOpenRequest | null;
  /** The same local-calendar Date every other Today calculation derives
   * from (TodayScreen's own useCurrentLocalDate-sourced value) — needed
   * here so SETTLED transitions (and the OPEN re-validation below) can
   * recompute computeTopReminder against the latest committed data
   * themselves, never a second, independently-captured `new Date()`. */
  today: Date;
  /** Reminder focus/announcements task — fires once the native Modal's own
   * dismissal has ACTUALLY finished (mirrors handleNativeDismissComplete's
   * existing real-signal contract, never a guessed timeout), for every path
   * that ends the review: the "Close" link, completing the final reminder,
   * or otherwise running out of eligible reminders. The host (TodayScreen)
   * uses this to restore accessibility focus to whichever Briefing control
   * originated the sheet, or a safe fallback if that control no longer
   * exists. Optional — a host that doesn't need origin-focus restoration
   * simply omits it. */
  onFullyClosed?: () => void;
}) {
  const { data } = useAppState();
  const { colors, spacing } = useTheme();

  const [state, dispatch] = useReducer(reduceReminderLifecycle, CLOSED_STATE);

  // The single source of native-Modal visibility — see this file's own
  // doc comment above for the full confirmed-root-cause trace this
  // replaces. There is no other boolean anywhere that can desync from
  // this: `closed` always means the native sheet is not visible, by
  // construction, not by convention.
  const visible = isReminderLifecycleVisible(state);

  // The sole opening mechanism. Deduped by requestId (a stray duplicate/
  // rapid-repeat request — e.g. a double-fired native touch callback —
  // can never be processed twice; the reducer's own OPEN case additionally
  // rejects a stray OPEN while something is already showing, so this is
  // belt-and-braces, not the only defense). Re-validates the request's own
  // captured occurrence against the LATEST committed data at the exact
  // moment of opening: if it's still the live top-ranked reminder (the
  // overwhelmingly common case — press and this effect are essentially
  // simultaneous), the pinned request reminder is used, exactly as
  // captured at press time; if the captured occurrence has genuinely been
  // invalidated in that gap, this falls back to whichever reminder IS
  // currently eligible (or closed, if none) — never the now-stale captured
  // one, and never an empty shell either.
  const lastProcessedRequestIdRef = useRef<number | null>(null);

  // Reminder queue correction round — the session-scoped set of occurrence
  // keys the customer has said "Not yet"/"Got it" to THIS review session.
  // Never persisted (no data/AppData write ever touches this), never a
  // snooze, never a "handled" mark — purely a presentation-session
  // exclusion consumed by computeRankedReminder below. Cleared at the start
  // of the opening effect (immediately below) so every NEW review session
  // starts clean regardless of how the previous one ended — an outstanding
  // deferred Reminder becomes eligible again the next time the sheet opens.
  const sessionDeferredKeysRef = useRef<Set<string>>(new Set());
  /**
   * Wave 6 — two independent exclusions, deliberately composed rather than
   * merged. The session set is what the customer did in THIS sitting
   * ("Not yet"), and is forgotten on close. The suppression predicate is
   * what they persisted (Snooze until a date, Dismiss this occurrence), and
   * survives a restart. Both feed the same ranker argument that already
   * existed, so reminders.ts is untouched.
   */
  function isSessionExcluded(reminder: SmartReminder): boolean {
    if (sessionDeferredKeysRef.current.has(occurrenceKeyOf(reminder))) return true;
    return suppressionReasonFor(data, reminder, today) !== null;
  }

  /**
   * Wave 6 closure — the queue's shape, for the header and the
   * acknowledgement label.
   *
   * Derived by walking the SAME canonical ranked selector this sheet
   * already advances through, with a growing local exclusion set — so the
   * count can never disagree with the order the customer actually sees. It
   * selects nothing, excludes nothing persistently and mutates nothing;
   * `sessionDeferredKeysRef` is untouched. Bounded so a pathological data
   * set cannot spin.
   */
  function describeQueue(latestData: AppData): { position: number; total: number } {
    const resolved = sessionDeferredKeysRef.current.size;
    const seen = new Set(sessionDeferredKeysRef.current);
    let remaining = 0;
    for (let i = 0; i < QUEUE_SCAN_LIMIT; i++) {
      const suppressed = createSuppressionPredicate(latestData, today);
      const next = computeRankedReminder(latestData, today, (r) => seen.has(occurrenceKeyOf(r)) || suppressed(r));
      if (!next) break;
      seen.add(occurrenceKeyOf(next));
      remaining += 1;
    }
    return { position: resolved + 1, total: resolved + Math.max(remaining, 1) };
  }

  useEffect(() => {
    if (!shouldProcessOpenRequest(openRequest, lastProcessedRequestIdRef.current)) return;
    // openRequest is non-null here — shouldProcessOpenRequest's own first
    // condition guarantees it.
    lastProcessedRequestIdRef.current = openRequest!.requestId;
    sessionDeferredKeysRef.current = new Set();
    // The reminder the tile was pressed for is re-read through the same
    // suppression the ranker uses, so an occurrence suppressed on another
    // surface can never be reopened here.
    const liveTop = computeRankedReminder(data, today, createSuppressionPredicate(data, today));
    dispatch({ type: 'OPEN', reminder: resolveOpenReminder(openRequest!, liveTop) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // The single local "force this sheet closed" decision — the "Close" text
  // link, system Back while viewing reminder detail, and onNavigateAway
  // (closing before navigating to Cards) all call this directly. No parent
  // notification is needed: visibility is entirely derived from `state`
  // above, so there is nothing external left to keep in sync.
  function handleForceClose() {
    dispatch({ type: 'FORCE_CLOSE' });
  }

  // Resolve the ACTUAL liability/recurringItem/card the active loan/card
  // form state needs, live from `data`, by the stable ids the pinned
  // `state.reminder` carries — mirrors exactly how SmartReminderCard.tsx's
  // own reminderCard/reminderLoanLiability/reminderLoanRecurringItem
  // resolution already worked, just relocated to this new owner.
  const loanReminder = state.kind === 'loan_form' || state.kind === 'loan_recorded' ? state.reminder : null;
  const loanLiability = loanReminder?.liabilityId ? data.liabilities.find((l) => l.id === loanReminder.liabilityId) ?? null : null;
  const loanRecurringItem = loanReminder?.recurringItemId ? data.recurringItems.find((r) => r.id === loanReminder.recurringItemId) ?? null : null;

  const cardReminder = state.kind === 'card_form' || state.kind === 'card_recorded' ? state.reminder : null;
  const cardCard = cardReminder?.creditCardId ? data.creditCards.find((c) => c.id === cardReminder.creditCardId) ?? null : null;
  const cardOccurrenceDate =
    cardReminder?.kind === 'card_due_soon' && cardReminder.occurrenceDate ? cardReminder.occurrenceDate.slice(0, 10) : undefined;

  // Defensive fallback (invariant #1: a visible native Modal must always
  // have visible, actionable content) — if the underlying liability/card
  // somehow cannot be resolved while a form state is active (e.g. deleted
  // elsewhere in the brief window between REQUEST_*_FORM and this render),
  // return to reminder_detail rather than ever rendering a form with
  // nothing to show. SmartReminderCard's own gating already makes this
  // unreachable in the ordinary flow (its buttons only ever request a form
  // when the liability/card already resolved non-null); this only guards
  // the edge case explicitly.
  useEffect(() => {
    if (state.kind === 'loan_form' && (!loanLiability || !loanRecurringItem)) {
      dispatch({ type: 'LOAN_RESULT', result: { kind: 'cancelled', occurrenceKey: state.occurrenceKey } });
    }
    if (state.kind === 'card_form' && !cardCard) {
      dispatch({ type: 'CARD_RESULT', result: { kind: 'cancelled', occurrenceKey: state.occurrenceKey } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loanLiability, loanRecurringItem, cardCard]);

  const loanForm = useLoanRepaymentForm({
    liability: loanLiability,
    recurringItem: loanRecurringItem,
    active: state.kind === 'loan_form',
    occurrenceKey: state.kind === 'loan_form' ? state.occurrenceKey : null,
    onResult: (result) => dispatch({ type: 'LOAN_RESULT', result }),
  });
  const cardForm = useCreditCardRepaymentForm({
    card: cardCard,
    reminderOccurrenceDate: cardOccurrenceDate,
    active: state.kind === 'card_form',
    occurrenceKey: state.kind === 'card_form' ? state.occurrenceKey : null,
    onResult: (result) => dispatch({ type: 'CARD_RESULT', result }),
  });

  // Reminder queue correction round — the single settlement decision point,
  // generalizing the previous handleSettled to exclude this session's
  // deferred/acknowledged occurrences via the canonical ranked selector.
  // `latestData` must be the FRESHEST committed AppData at the moment this
  // is called: for a 'completed' outcome (a real mutation), that is the
  // mutation's own synchronously-returned data (see SmartReminderCard.tsx's
  // reportCompleted()); for 'deferred'/'acknowledged' (no mutation) and for
  // the loan/card "Done" tap, it is simply the CURRENT `data` from
  // useAppState() — by the time either fires, ordinary React re-rendering
  // has already caught this component up, so the closure's own `data` is
  // never stale here either. Neither path ever depends on a ref or a
  // same-tick guess. See reminderInteractionLifecycle.ts's own SETTLED doc
  // comment for the full latest-data contract this shares.
  function advanceToNextEligible(latestData: AppData) {
    const next = computeRankedReminder(latestData, today, isSessionExcluded);
    dispatch({ type: 'SETTLED', latestTopReminder: next });
  }

  // The single handler SmartReminderCard's onOutcome reports to — see
  // ReminderReviewOutcome's own doc comment (reminderInteractionLifecycle.ts)
  // for what each kind means. 'completed' relies entirely on the underlying
  // data mutation to naturally fall out of re-ranking (never added to the
  // session-deferred set — matches the existing, accepted trust model for
  // mutation-driven exclusion). 'deferred'/'acknowledged' add this
  // occurrence's key to the session-only exclusion set — never a data
  // write — before re-ranking, so "Not yet"/"Got it" advances to the next
  // genuinely eligible Reminder in the SAME sheet instead of the sheet
  // going blank or the whole review ending.
  function handleReminderOutcome(outcome: ReminderReviewOutcome) {
    if (outcome.kind === 'completed') {
      advanceToNextEligible(outcome.latestData);
      return;
    }
    sessionDeferredKeysRef.current.add(outcome.occurrenceKey);
    advanceToNextEligible(data);
  }

  // Reminder queue correction round, §8 (no blank closing shell) — retains
  // the most recently PRESENTED non-'closed' state across the render where
  // `state` itself becomes 'closed', so title/footer/children keep showing
  // real content for the entire native closing-animation window. Mutated
  // directly during render (not via setState — this intentionally does not
  // trigger an extra re-render; the SAME render that observes `state`
  // becoming 'closed' is the one that needs presentedState to already
  // reflect the fallback). `visible` (above) is deliberately NOT derived
  // from this — it stays tied to the real `state` so KeyboardSheet begins
  // its exit animation immediately, unaffected.
  const lastPresentedStateRef = useRef<ReminderLifecycleState>(CLOSED_STATE);
  if (state.kind !== 'closed') {
    lastPresentedStateRef.current = state;
  }
  const presentedState = state.kind !== 'closed' ? state : lastPresentedStateRef.current;

  // Clears the retained content only once the native Modal's own dismissal
  // has ACTUALLY finished — KeyboardSheet's existing onDismiss prop
  // (forwarded from the underlying native Modal's own onDismiss), never a
  // timeout or guessed animation duration. Until this fires, presentedState
  // keeps showing the last real content even though `visible` is already
  // false — exactly the fix for the confirmed blank-shell device-test
  // defect (Defect B: state.kind briefly 'closed' while the native sheet
  // was still visibly closing).
  function handleNativeDismissComplete() {
    lastPresentedStateRef.current = CLOSED_STATE;
    // Reminder focus/announcements task — every genuinely fresh open (even
    // of the exact same reminder that was showing before a prior close)
    // must move focus again; without this reset, reopening the very same
    // occurrence would look identical to the identity-based focus effect
    // below and be silently skipped.
    lastFocusedIdentityRef.current = null;
    onFullyClosed?.();
  }

  // Reminder focus/announcements task — the single source of truth for
  // "what should currently have accessibility focus." Keyed on a compound
  // identity (content kind + occurrence key) derived from `presentedState`
  // (not `state`) so it never fires from the transient 'closed' frame during
  // the native closing animation — only from a genuine content change.
  // Ordinary re-renders (typing an amount, a rerank that doesn't change
  // which content is shown) never change this identity, so they can never
  // steal focus — satisfied structurally, not by a special case.
  const reminderTitleRef = useRef<any>(null);
  const loanFormHeadingRef = useRef<any>(null);
  const cardFormHeadingRef = useRef<any>(null);
  const recordedContentRef = useRef<any>(null);

  function focusTargetForKind(kind: ReminderLifecycleState['kind']) {
    switch (kind) {
      case 'reminder_detail':
        return reminderTitleRef;
      case 'loan_form':
        return loanFormHeadingRef;
      case 'card_form':
        return cardFormHeadingRef;
      case 'loan_recorded':
      case 'card_recorded':
        return recordedContentRef;
      case 'closed':
        return null;
    }
  }

  const contentIdentity = presentedState.kind === 'closed' ? 'closed' : `${presentedState.kind}:${presentedState.occurrenceKey}`;
  const lastFocusedIdentityRef = useRef<string | null>(null);

  // Reminder focus/announcements task — fires exactly once per genuine
  // content identity change while the sheet is visible: the initial open,
  // every same-sheet advancement (Not yet/Got it/completed payment ->
  // next reminder), every repayment-form open, and every Cancel-back to
  // reminder_detail. No deferral, no timeout: React attaches refs during
  // the commit phase, strictly before effects run, so by the time this
  // effect body executes the target ref for `presentedState.kind` is
  // already mounted for THIS render — there is no asynchronous gap in
  // which a "stale" request could exist to invalidate. An ordinary
  // re-render that doesn't change contentIdentity (typing an amount, a
  // rerank that keeps showing the same content) is a no-op here by
  // construction, so it can never steal focus from a field the customer is
  // using.
  useEffect(() => {
    if (!visible) return;
    if (contentIdentity === lastFocusedIdentityRef.current) return;
    lastFocusedIdentityRef.current = contentIdentity;
    sendFocusEvent(focusTargetForKind(presentedState.kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentIdentity, visible]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerCloseButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
        footerButton: { flex: 1 },
      }),
    [colors, spacing]
  );

  // Wave 6 closure — the header now carries queue context. "Reminder" alone
  // gave a customer no idea whether tapping through led anywhere.
  const queue = presentedState.kind === 'reminder_detail' ? describeQueue(data) : null;
  let title = queue ? reminderQueueTitle(queue.position, queue.total) : 'Reminder';
  // Wave 6 closure — the reminder state now gets the SAME header Close every
  // other state of this sheet already had, so Close sits in one predictable
  // place rather than as a link buried under the content. 44pt minimum.
  let headerRight: React.ReactNode =
    presentedState.kind === 'reminder_detail' ? (
      <TouchableOpacity
        style={styles.headerCloseButton}
        onPress={handleForceClose}
        accessibilityRole="button"
        accessibilityLabel="Close reminders"
        accessibilityHint="Ends reviewing reminders without recording anything."
        testID="reminder-header-close"
      >
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    ) : null;
  let footer: React.ReactNode = null;
  let isDirty = false;
  // reminder_detail preserves the ORIGINAL ReminderDetailSheet's own
  // behaviour exactly: no backdrop-tap/swipe dismissal (it never had a
  // backdrop touchable at all), only the explicit "Close" text link and
  // system Back. loan_form/card_form/*_recorded restore the established
  // KeyboardSheet swipe/backdrop convention every other money-entry sheet
  // in this app already uses (unchanged from the prior round).
  let gesturesEnabled = false;
  let onSheetClose = handleForceClose;

  if (presentedState.kind === 'loan_form') {
    title = 'Record a payment';
    isDirty = loanForm.isDirty;
    gesturesEnabled = true;
    onSheetClose = loanForm.handleCancel;
    headerRight = (
      <TouchableOpacity
        style={styles.headerCloseButton}
        onPress={loanForm.handleCancel}
        disabled={loanForm.isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Close record payment"
      >
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    );
    footer = (
      <>
        <Button label="Cancel" variant="secondary" onPress={loanForm.handleCancel} disabled={loanForm.isSubmitting} style={styles.footerButton} />
        <Button label="Record payment" onPress={loanForm.handleConfirm} disabled={!loanForm.canConfirm} style={styles.footerButton} />
      </>
    );
  } else if (presentedState.kind === 'loan_recorded') {
    title = 'Payment recorded';
    gesturesEnabled = true;
    onSheetClose = () => advanceToNextEligible(data);
    footer = <Button label="Done" onPress={() => advanceToNextEligible(data)} style={styles.footerButton} />;
  } else if (presentedState.kind === 'card_form') {
    title = 'Record a payment';
    isDirty = cardForm.isDirty;
    gesturesEnabled = true;
    onSheetClose = cardForm.handleCancel;
    headerRight = (
      <TouchableOpacity
        style={styles.headerCloseButton}
        onPress={cardForm.handleCancel}
        disabled={cardForm.isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Close record payment"
      >
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    );
    footer = (
      <>
        <Button label="Cancel" variant="secondary" onPress={cardForm.handleCancel} disabled={cardForm.isSubmitting} style={styles.footerButton} />
        <Button
          label={cardForm.needsBelowMinimumAck ? 'Continue anyway' : 'Record payment'}
          onPress={cardForm.handleConfirm}
          disabled={!cardForm.canConfirm}
          style={styles.footerButton}
        />
      </>
    );
  } else if (presentedState.kind === 'card_recorded') {
    title = 'Payment recorded';
    gesturesEnabled = true;
    onSheetClose = () => advanceToNextEligible(data);
    footer = <Button label="Done" onPress={() => advanceToNextEligible(data)} style={styles.footerButton} />;
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onSheetClose}
      onDismiss={handleNativeDismissComplete}
      title={title}
      isDirty={isDirty}
      discardTitle="Discard this payment?"
      discardMessage="Your entered payment details will be lost."
      gesturesEnabled={gesturesEnabled}
      headerRight={headerRight}
      footer={footer}
      animateContentEntrance
    >
      {presentedState.kind === 'reminder_detail' ? (
        <>
          {/* Wave 6 closure — the detached "Close" link that floated below
              the reminder content is gone; Close now lives once, in the
              header, like every other state of this sheet. Its semantics
              are unchanged: handleForceClose ends the review without
              acknowledging, deferring or recording anything. */}
          <SmartReminderCard
            topReminder={presentedState.reminder}
            onNavigateAway={handleForceClose}
            onOutcome={handleReminderOutcome}
            onRequestLoanRepayment={() => dispatch({ type: 'REQUEST_LOAN_FORM' })}
            onRequestCreditCardRepayment={() => dispatch({ type: 'REQUEST_CARD_FORM' })}
            titleRef={reminderTitleRef}
            queuePosition={queue?.position ?? 1}
            queueTotal={queue?.total ?? 1}
            daysUntil={reminderDaysUntil(presentedState.reminder.occurrenceDate, today)}
            today={today}
          />
        </>
      ) : null}
      {presentedState.kind === 'loan_form' && loanLiability && loanRecurringItem ? (
        <LoanRepaymentFormFields liability={loanLiability} recurringItem={loanRecurringItem} form={loanForm} headingRef={loanFormHeadingRef} />
      ) : null}
      {presentedState.kind === 'loan_recorded' ? <PaymentRecordedContent focusRef={recordedContentRef} /> : null}
      {presentedState.kind === 'card_form' && cardCard ? (
        <CreditCardRepaymentFormFields card={cardCard} form={cardForm} headingRef={cardFormHeadingRef} />
      ) : null}
      {presentedState.kind === 'card_recorded' ? <PaymentRecordedContent focusRef={recordedContentRef} /> : null}
    </KeyboardSheet>
  );
}
