import { SmartReminder } from './reminders';
import { reminderOccurrenceIdentity, occurrenceIdentityKey } from './todayBriefing';
import type { AppData } from '../../types/models';

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * the single, authoritative, pure interaction-lifecycle module for
 * ReminderDetailSheet. Extracted specifically so the full sequence (open →
 * request a repayment form → the form resolves cancelled/completed →
 * confirmation → advance/close) can be proven with real function calls, not
 * source-regex, per this round's own explicit instruction.
 *
 * This module owns ONLY the presentation-state decision — which content the
 * single native Modal should currently show. It never itself calls a
 * mutation, never itself reads live application data, and never itself
 * decides timing. Every event that could require "what's the next eligible
 * reminder" is required to carry that answer as an explicit argument
 * (`latestTopReminder`), computed by the caller from the freshest available
 * data at the exact moment of dispatch — see ReminderDetailSheet.tsx's own
 * doc comment for exactly how it supplies that value, and this round's
 * final report §5 for the full latest-data-vs-stale-closure proof.
 *
 * Stable occurrence identity — `occurrenceKeyOf` reuses the exact same
 * canonical (sourceType, sourceId, occurrenceDateKey) identity
 * `todayBriefing.ts`'s own dedup logic already established and tests
 * (reminderOccurrenceIdentity/occurrenceIdentityKey), rather than a
 * reminder's own `id` field alone — `card_due_soon`'s own `id` is not
 * date-scoped (`card-${cardDue.id}`), so `reminder.id` alone cannot tell
 * apart two different monthly occurrences of the same card. The canonical
 * identity can; this is a genuine reuse of an existing, already-tested
 * helper, not a parallel implementation.
 */

export type ReminderOccurrenceKey = string;

export function occurrenceKeyOf(reminder: SmartReminder): ReminderOccurrenceKey {
  return occurrenceIdentityKey(reminderOccurrenceIdentity(reminder)) ?? reminder.id;
}

/**
 * Reminder-opening correction round — the single atomic contract for
 * "the customer pressed the Briefing Reminder tile." Replaces a boolean
 * `reminderSheetVisible` state that lived in TodayScreen and raced against
 * this module's own reducer (confirmed root cause of the blank-sheet
 * device-test defect — see ReminderDetailSheet.tsx's own doc comment for
 * the exact effect-ordering trace). Built once, synchronously, in the tile's
 * own onPress handler from whatever `topReminder` is live AT THAT MOMENT —
 * never a later, independently re-read value — so the request itself proves
 * a real Reminder existed at press time. `requestId` is a monotonic counter
 * (mirroring TodayScreen's own established focusRequestIdRef/
 * moneySectionFocus.ts pattern), letting a stray duplicate/rapid-repeat
 * press be deterministically deduped downstream rather than processed
 * twice.
 */
export interface ReminderOpenRequest {
  requestId: number;
  occurrenceKey: ReminderOccurrenceKey;
  reminder: SmartReminder;
}

export function createReminderOpenRequest(requestId: number, reminder: SmartReminder): ReminderOpenRequest {
  return { requestId, occurrenceKey: occurrenceKeyOf(reminder), reminder };
}

/**
 * The result a repayment form reports back — deliberately never an
 * ambiguous boolean. `cancelled` covers every non-completing dismissal
 * (header Close, footer Cancel, swipe, backdrop, system Back) uniformly;
 * `completed` carries the real transactionId the mutation produced (see
 * AppStateContext.tsx's confirmLoanRepayment/confirmCreditCardRepayment,
 * both extended this round to return it), never a synthetic one.
 */
export type RepaymentResult =
  | { kind: 'cancelled'; occurrenceKey: ReminderOccurrenceKey }
  | { kind: 'completed'; occurrenceKey: ReminderOccurrenceKey; transactionId: string };

/**
 * Reminder queue correction round, §4 — the discriminated outcome a
 * SmartReminderCard action reports back to ReminderDetailSheet, replacing
 * the previous single, ambiguous `dismiss()`/`onSettled` signal that could
 * not tell "customer confirmed completion" apart from "customer said Not
 * yet"/"Got it" — the confirmed root cause of the Not-yet-terminates-the-
 * review device-test defect (SmartReminderCard's own local `dismissedIds`
 * Set, now removed, conflicting with this reducer's correct re-selection of
 * the same top-ranked, unchanged reminder).
 *
 * Deliberately a SEPARATE type from RepaymentResult above — RepaymentResult
 * stays scoped to the loan/card FORM's own cancel/complete signal (already
 * correct, untouched by this round); this type is scoped to the top-level
 * reminder_detail action a plain SmartReminderCard button reports.
 * `cancelled`/`closed` are deliberately not members here — those outcomes
 * are already handled by RepaymentResult and FORCE_CLOSE respectively, both
 * pre-existing and unmodified.
 *
 * - `completed`: a real mutation was confirmed (income/bill/BNPL/loan). The
 *   underlying data change is itself what removes this occurrence from
 *   later ranking — no key needs to be remembered for this outcome.
 * - `deferred`: "Not yet" — no mutation occurred; this occurrence must be
 *   session-excluded (see ReminderDetailSheet's sessionDeferredKeysRef) so
 *   the review can advance past it without terminating.
 * - `acknowledged`: "Got it" (bill_due_soon) — likewise no mutation;
 *   session-excluded the same way as `deferred` so it doesn't immediately
 *   re-select itself and re-trigger the same blank-redisplay defect.
 *
 * `latestData` on `completed` is the freshest committed AppData at the
 * exact moment of mutation (mirroring SETTLED's own established
 * latest-data-not-stale-closure contract — see this file's own top-of-file
 * doc comment) — required so the caller can re-rank using real, current
 * data rather than a value captured before the mutation applied.
 */
export type ReminderReviewOutcome =
  | { kind: 'completed'; occurrenceKey: ReminderOccurrenceKey; transactionId: string; latestData: AppData }
  | { kind: 'deferred'; occurrenceKey: ReminderOccurrenceKey }
  | { kind: 'acknowledged'; occurrenceKey: ReminderOccurrenceKey };

/**
 * Every state carries its own `occurrenceKey` (redundant with `reminder`'s
 * own identity, but explicit) so a transition function can always assert
 * "is this result about the occurrence I think is active" without
 * re-deriving it. `reminder` is the SmartReminder object pinned at entry to
 * `reminder_detail` (or carried forward through the loan/card sub-states) —
 * never re-read from a live prop mid-flow; see occurrenceKeyOf's own doc
 * comment and this round's report §5.
 *
 * `loan_below_minimum`/`card_below_minimum` confirmation is deliberately
 * NOT a separate top-level state here — it is a same-screen warning-then-
 * confirm gate entirely internal to the card form's own draft (already
 * proven, unmodified this round: `needsBelowMinimumAck`), never its own
 * presentation/Modal state. Promoting it to a top-level lifecycle state
 * would not change what is presented natively; see this round's report §3
 * for the explicit reasoning.
 *
 * "advancing to the next occurrence" is likewise not a separate rendered
 * state — in Option A there is only ever ONE native Modal, so advancing is
 * a same-commit content swap (SETTLED's own transition, computed from
 * `latestTopReminder`), never an intermediate empty-Modal frame requiring
 * its own state.
 */
export type ReminderLifecycleState =
  | { kind: 'closed' }
  | { kind: 'reminder_detail'; occurrenceKey: ReminderOccurrenceKey; reminder: SmartReminder }
  | { kind: 'loan_form'; occurrenceKey: ReminderOccurrenceKey; reminder: SmartReminder }
  | { kind: 'loan_recorded'; occurrenceKey: ReminderOccurrenceKey; reminder: SmartReminder; transactionId: string }
  | { kind: 'card_form'; occurrenceKey: ReminderOccurrenceKey; reminder: SmartReminder }
  | { kind: 'card_recorded'; occurrenceKey: ReminderOccurrenceKey; reminder: SmartReminder; transactionId: string };

export type ReminderLifecycleEvent =
  /** The caller has resolved a ReminderOpenRequest down to the exact
   * reminder that should actually open (see ReminderDetailSheet.tsx's own
   * doc comment for how it re-validates the request's captured reminder
   * against the latest committed data before dispatching this) — pins it,
   * or closes if none remains eligible. Only honoured from `closed`; see
   * the reducer body below for why a stray/duplicate OPEN while something
   * is already showing is ignored outright, never replacing the pinned
   * occurrence. */
  | { type: 'OPEN'; reminder: SmartReminder | null }
  /** The "Record payment" action for a loan_repayment_due / card_due_soon
   * reminder — only valid from reminder_detail; ignored otherwise (e.g. a
   * stale/duplicate tap after the state already moved on). */
  | { type: 'REQUEST_LOAN_FORM' }
  | { type: 'REQUEST_CARD_FORM' }
  /** The loan/card form resolved — cancelled returns to reminder_detail for
   * the SAME occurrence; completed moves to the recorded confirmation. Only
   * valid from the matching form state; ignored otherwise (defends against
   * a stale/duplicate callback firing after the state already moved on). */
  | { type: 'LOAN_RESULT'; result: RepaymentResult }
  | { type: 'CARD_RESULT'; result: RepaymentResult }
  /** A Reminder occurrence has genuinely been settled — either an ordinary
   * synchronous bill/salary/BNPL confirmation applying (or "Not yet"/"Got
   * it"), or the customer dismissing the loan/card "Payment recorded"
   * confirmation (Done). `latestTopReminder` is carried ON THE EVENT ITSELF
   * — deliberately not read by this function from anywhere else — computed
   * by the caller via `computeTopReminder` against the LATEST committed
   * AppData at the exact moment of dispatch (a repayment mutation's own
   * synchronously-returned new data, or an ordinary confirmation's own
   * equivalent — see ReminderDetailSheet.tsx's own doc comment and this
   * round's final report §5 for the full latest-data-vs-stale-closure
   * proof). React's `useReducer` dispatch signature only accepts the event
   * itself, so this is the correct place for that value to live — not a
   * separate reducer argument that dispatch() could never actually supply.
   * Advances to whichever reminder this event names, or closes if null.
   * Never fired for a cancelled repayment attempt. */
  | { type: 'SETTLED'; latestTopReminder: SmartReminder | null }
  /** Explicit user-initiated close (the sheet's own "Close" text link, or
   * Android system Back / native onRequestClose while viewing reminder
   * detail) — force-closes regardless of current state. Never used to
   * abandon an in-progress loan/card form silently; those forms gate their
   * own dismiss behind KeyboardSheet's existing isDirty-confirmation
   * convention (unchanged this round) before ever reaching this event. */
  | { type: 'FORCE_CLOSE' };

/**
 * The pure transition function — reads NOTHING except its own two
 * arguments. Every fact it needs (which reminder is live, what the next
 * eligible reminder is) arrives already-computed inside `event`, supplied
 * by the caller from the freshest available application data. This
 * function itself never calls `computeTopReminder`, never touches
 * `AppData`, and never reads a ref/closure — see this round's final report
 * §5 for the full proof that this eliminates the stale-closure risk
 * structurally, not by convention.
 */
export function reduceReminderLifecycle(state: ReminderLifecycleState, event: ReminderLifecycleEvent): ReminderLifecycleState {
  switch (event.type) {
    case 'OPEN': {
      // Reminder-opening correction round — a stray/duplicate OPEN arriving
      // while the sheet is already showing something (a superseded open
      // request, or a rapid double-fired press callback) must NEVER replace
      // the pinned occurrence or its in-progress form/confirmation state.
      // Only the transition FROM closed is honoured — the same defensive
      // pattern LOAN_RESULT/CARD_RESULT already use for stale-occurrence
      // callbacks below.
      if (state.kind !== 'closed') return state;
      if (!event.reminder) return { kind: 'closed' };
      return { kind: 'reminder_detail', occurrenceKey: occurrenceKeyOf(event.reminder), reminder: event.reminder };
    }
    case 'FORCE_CLOSE':
      return { kind: 'closed' };
    case 'REQUEST_LOAN_FORM':
      if (state.kind !== 'reminder_detail') return state;
      return { kind: 'loan_form', occurrenceKey: state.occurrenceKey, reminder: state.reminder };
    case 'REQUEST_CARD_FORM':
      if (state.kind !== 'reminder_detail') return state;
      return { kind: 'card_form', occurrenceKey: state.occurrenceKey, reminder: state.reminder };
    case 'LOAN_RESULT': {
      if (state.kind !== 'loan_form') return state;
      if (event.result.occurrenceKey !== state.occurrenceKey) return state; // stale/duplicate callback for a superseded occurrence
      if (event.result.kind === 'cancelled') {
        return { kind: 'reminder_detail', occurrenceKey: state.occurrenceKey, reminder: state.reminder };
      }
      return { kind: 'loan_recorded', occurrenceKey: state.occurrenceKey, reminder: state.reminder, transactionId: event.result.transactionId };
    }
    case 'CARD_RESULT': {
      if (state.kind !== 'card_form') return state;
      if (event.result.occurrenceKey !== state.occurrenceKey) return state;
      if (event.result.kind === 'cancelled') {
        return { kind: 'reminder_detail', occurrenceKey: state.occurrenceKey, reminder: state.reminder };
      }
      return { kind: 'card_recorded', occurrenceKey: state.occurrenceKey, reminder: state.reminder, transactionId: event.result.transactionId };
    }
    case 'SETTLED': {
      if (!event.latestTopReminder) return { kind: 'closed' };
      return { kind: 'reminder_detail', occurrenceKey: occurrenceKeyOf(event.latestTopReminder), reminder: event.latestTopReminder };
    }
  }
}

/** True only for states that should keep the native Modal presented. */
export function isReminderLifecycleVisible(state: ReminderLifecycleState): boolean {
  return state.kind !== 'closed';
}

/**
 * The no-contentless-visible-state invariant, as a real, directly-testable
 * function rather than a structural/regex claim — Reminder-opening
 * correction round, §6's own explicit instruction ("extract a pure
 * presentation derivation... so real functions can prove the invariant:
 * visible state => valid content kind"). Every non-closed variant of
 * ReminderLifecycleState carries a mandatory `reminder` field already (see
 * that type's own definition above) — this function makes that guarantee
 * checkable at runtime, not just assumed from the type declaration, so a
 * test can enumerate every state a real dispatch sequence actually produces
 * and assert none of them, while visible, lack real content. `closed`
 * itself trivially satisfies this (it is never visible, so has no content
 * requirement) — see isReminderLifecycleVisible above for the paired half
 * of the invariant this function is meant to be used alongside.
 */
export function reminderStateHasContent(state: ReminderLifecycleState): boolean {
  if (state.kind === 'closed') return true;
  return !!state.reminder;
}

/**
 * Reminder-opening correction round — the collision-safe request-dedup
 * decision, extracted as a pure function (rather than left as inline logic
 * against a `useRef` inside ReminderDetailSheet.tsx) so "a newer request
 * replacing/rejecting an older one deterministically" and "duplicate rapid
 * open requests" can be proven with real calls, not regex. `null` for
 * `lastProcessedRequestId` means nothing has ever been processed yet (the
 * initial mount).
 */
export function shouldProcessOpenRequest(request: ReminderOpenRequest | null, lastProcessedRequestId: number | null): boolean {
  return request !== null && request.requestId !== lastProcessedRequestId;
}

/**
 * Reminder-opening correction round — resolves a ReminderOpenRequest down
 * to the exact SmartReminder that should actually open, extracted as a
 * pure function so ReminderDetailSheet.tsx's own effect and this module's
 * tests share the identical decision (never two independently-written
 * copies of this logic). Uses the request's own captured/pinned reminder
 * when it is still genuinely the live top-ranked occurrence (the
 * overwhelmingly common case — press and processing are essentially
 * simultaneous); falls back to whichever reminder IS currently eligible
 * (or null) only when the captured occurrence has genuinely been
 * invalidated in the gap between press and processing — never the
 * now-stale captured value, and never a silently-empty result either. The
 * caller supplies `liveTopReminder` (computeTopReminder against the latest
 * committed data at the moment of processing) rather than this function
 * reading it itself, keeping this module free of any AppData dependency —
 * see this file's own top-of-file doc comment for why.
 */
export function resolveOpenReminder(request: ReminderOpenRequest, liveTopReminder: SmartReminder | null): SmartReminder | null {
  const stillValid = liveTopReminder !== null && occurrenceKeyOf(liveTopReminder) === request.occurrenceKey;
  return stillValid ? request.reminder : liveTopReminder;
}
