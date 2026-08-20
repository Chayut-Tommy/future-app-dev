import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RefObject } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { SmartReminder } from '../../lib/calculations/reminders';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { moneyAmountToCents } from '../../lib/calculations/money';
import { resolveEligibleIncomeDestinations } from '../../lib/calculations/incomeDestinations';
import { IncomeDestinationPicker } from '../shared/IncomeDestinationPicker';
import { resolveEligibleBillPaymentSources, BillPaymentSourceOption } from '../../lib/calculations/billPaymentSources';
import { BillPaymentSourcePicker } from '../shared/BillPaymentSourcePicker';
import { AppData } from '../../types/models';
import { occurrenceKeyOf, ReminderReviewOutcome } from '../../lib/calculations/reminderInteractionLifecycle';
import { useAnnounceOnce } from '../../hooks/useAnnounceOnce';

// Financial-disclosure formatter (regression-protection review, B2.0B
// recurring-money precision correction §6) — deliberately NOT the app-wide
// formatMoney convention (reminders.ts/greeting.ts/etc. round to whole
// dollars with Math.round, fine for coaching copy but wrong here). Formats
// from an already-`moneyAmountToCents`-validated integer cent value, never
// a raw float — so unlike the prior round's formatter, this one no longer
// needs a 3-decimal ceiling: anything with more than 2 decimal places is
// now rejected by moneyAmountToCents before it ever reaches this function
// (see the gating below), so exactly-2-decimals-when-cents-exist is always
// correct here, never an approximation of a more-precise underlying value.
function formatDisclosureAmount(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0
    ? `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Smart reminder — one focused "did this happen?" question at a time (PRD
 * ask: salary/bill confirmations). Never assumes money moved on its own:
 * every state change here only happens after the user explicitly confirms.
 *
 * Reminder queue correction round — this component no longer keeps its own
 * local `dismissedIds` session-scoped hide-list. That local Set was the
 * confirmed root cause of a device-test defect: when the user tapped "Not
 * yet" (no mutation), ReminderDetailSheet's reducer correctly re-selected
 * the SAME top-ranked reminder (nothing outranked it in the underlying
 * data), but this component's own `dismissedIds` still contained that
 * reminder's id, so it rendered nothing while the native sheet stayed open
 * — the customer could only escape via Close, terminating the whole review.
 * This component now reports what happened via `onOutcome` (a
 * ReminderReviewOutcome — completed/deferred/acknowledged) and trusts its
 * host (ReminderDetailSheet) to own ALL session-exclusion state and re-rank
 * using the canonical selector — see that file's own doc comment.
 *
 * Confirmation itself is delegated to AppStateContext's
 * confirmRecurringOccurrence — the combined B2.0B transition (transaction +
 * B1 balance effect + schedule advancement, one committed state).
 * `isSubmitting` here is presentation-level defence only (disables the
 * buttons for the duration of a call) — the actual correctness guarantee
 * against duplicate confirmation lives in that action's dataRef/
 * latest-nextDueDate eligibility check, not in this component
 * (regression-protection review, B2.0B §5).
 *
 * Pass 2B correction §1 — this full detailed presentation (the actual
 * question, disclosure copy, and every account-choice control) is no
 * longer rendered inline inside Today's Briefing hero at all; it now only
 * mounts inside ReminderDetailSheet, reached by tapping the Briefing's
 * compact Reminder tile. Retired the `embedded` row-inside-a-parent-card
 * mode that variant used (its only caller): this component is always its
 * own SectionCard now. Independently of that move, `actionRow` also gained
 * `flexWrap: 'wrap'` here — the confirmed root cause of the overflow
 * defect (an unbounded single-line row of account-choice pills, e.g.
 * "From cash" / "From everyday account" / "From credit card", or one
 * button per Everyday Account with a long customer-entered label) is fixed
 * at the layout level regardless of where this component is mounted: pills
 * that don't fit the available width now wrap onto additional rows inside
 * their own container instead of extending past it.
 */
export function SmartReminderCard({
  topReminder,
  onNavigateAway,
  onOutcome,
  onRequestLoanRepayment,
  onRequestCreditCardRepayment,
  titleRef,
}: {
  topReminder: SmartReminder | null;
  /** Reminder focus/announcements task — the host (ReminderDetailSheet)
   * moves accessibility focus here whenever this card starts presenting a
   * new reminder occurrence (initial open, or advancing past "Not yet"/
   * "Got it"/a completed payment to the next eligible reminder). Optional
   * so this component still works standalone (e.g. in isolated tests)
   * without a host providing one. */
  titleRef?: RefObject<any>;
  /** Device-test correction round — called immediately before navigating
   * away to another screen (Cards) or opening a full-screen destination,
   * so a host that renders this inside a Modal (ReminderDetailSheet) can
   * close itself first. Never called for confirmations that keep the user
   * on Today (those already correctly report via this component's own
   * outcome reporters). Optional — a host with no sheet to close simply
   * omits it. */
  onNavigateAway?: () => void;
  /** Reminder queue correction round — replaces the previous single,
   * ambiguous `onSettled` signal (which could not tell "customer confirmed
   * completion" apart from "customer said Not yet"/"Got it" — the confirmed
   * root cause of a device-test defect, see this component's own top-of-
   * file doc comment). Fires once per genuine action: an ordinary
   * confirmation applying ('completed', carrying the real transactionId and
   * the mutation's own freshest AppData — never a stale render closure), or
   * "Not yet"/"Got it" ('deferred'/'acknowledged', carrying only this
   * occurrence's stable key). The host owns deciding what happens next —
   * see ReminderDetailSheet.tsx's own doc comment. Optional — a host with
   * nothing to advance (none currently) simply omits it. */
  onOutcome?: (outcome: ReminderReviewOutcome) => void;
  /** Final Pass 2D device-test correction (native-Modal-lifecycle round) —
   * replaces the previous local repaymentSheetVisible/loanRepaymentSheetVisible
   * state + nested LoanRepaymentSheet/CreditCardRepaymentSheet mounts (each
   * its own native Modal, stacked underneath ReminderDetailSheet's own —
   * the confirmed native-Modal-stacking risk this round's report
   * addresses). "Record payment" now simply requests the transition;
   * ReminderDetailSheet (the single native-Modal owner) decides whether to
   * honour it, since it alone knows the liability/recurringItem/card are
   * genuinely resolvable for the currently pinned occurrence. Optional — a
   * host with no repayment form to open (none currently) simply omits it,
   * and the reminder falls back to deferReminder() exactly as before when no
   * card/liability was resolvable. */
  onRequestLoanRepayment?: () => void;
  onRequestCreditCardRepayment?: () => void;
}) {
  const { data, confirmRecurringOccurrence, confirmBnplRepayment } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, scheme, semantic } = useTheme();
  const [awaitingSource, setAwaitingSource] = useState(false);
  // Correction pass, §2 — BNPL confirmation's Everyday Account choice needs
  // a second step (which specific account), unlike Cash/Credit card which
  // are single buttons. Scoped to bnpl_repayment_due only: an ordinary
  // bill_overdue reminder keeps its existing cash/credit-card-only choice
  // unchanged (out of this pass's authorised scope).
  const [awaitingEverydayAccount, setAwaitingEverydayAccount] = useState(false);
  // Correction round, 2026-08-10 — salary confirmation must never silently
  // credit Cash: "Yes, it arrived" now opens the shared destination
  // picker (resolveEligibleIncomeDestinations/IncomeDestinationPicker),
  // the same one AddIncomeModal's mid-cycle reconciliation step uses,
  // instead of committing an income transaction immediately.
  const [awaitingIncomeDestination, setAwaitingIncomeDestination] = useState(false);
  // Correction round, 2026-08-10 review — this destination picker's own
  // "Add a money balance" previously navigated away to the whole Wealth
  // tab (navigation.navigate('Wealth')), which lost the pending salary
  // confirmation entirely and never even opened a create form directly. An
  // overlay — the same pattern AddIncomeModal's own equivalent empty-state
  // route already uses — stays on Today, preserves awaitingIncomeDestination
  // untouched, and reuses the real asset-creation form scoped to Cash/
  // Everyday/Savings via onlyLiquidCategories (never a duplicate form).
  const [addBalanceVisible, setAddBalanceVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reminder focus/announcements task — announced once per distinct error,
  // never on every re-render while the same error persists, and never
  // moves focus away from whichever field/button the customer is using.
  useAnnounceOnce(actionError);

  // Pass 2A — topReminder is now computed once by the caller (TodayScreen's
  // own useMemo(() => computeTopReminder(data, today), [data, today])) and
  // shared with the Today Briefing's own dedup logic, rather than this
  // component independently recomputing it. Reminder queue correction round
  // — this component no longer applies its own session-scoped hide filter
  // (see this file's own top-of-file doc comment for why): `reminder` is
  // simply the caller's own value, trusted as-is.
  const reminder = topReminder;

  // Both are scoped to one specific reminder — if the displayed reminder
  // identity changes (resolved elsewhere, superseded, or this card moved
  // on to a different one), a stale error or a stuck "submitting" state
  // from a previous reminder must never linger.
  useEffect(() => {
    setActionError(null);
    setIsSubmitting(false);
    setAwaitingEverydayAccount(false);
    setAwaitingIncomeDestination(false);
    setAddBalanceVisible(false);
  }, [reminder?.id]);

  // Correction round, 2026-08-10 — the same shared eligible-destination
  // resolver AddIncomeModal's mid-cycle step now uses; recomputed live off
  // `data.assets` so a balance added elsewhere while this card is showing
  // (e.g. via the destination picker's own "Add a money balance" route)
  // appears the moment the user returns.
  const eligibleIncomeDestinations = useMemo(() => resolveEligibleIncomeDestinations(data.assets), [data.assets]);

  // Device-test correction round — the same shared eligible-bill-payment-
  // source resolver BillPaymentSourcePicker's caller uses, scoped to
  // ordinary (non-BNPL) bill confirmation only — BNPL keeps its own
  // separate, already-working cash/everyday/credit-card flow untouched.
  const eligibleBillPaymentSources = useMemo(() => resolveEligibleBillPaymentSources(data.assets, data.creditCards), [data.assets, data.creditCards]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
        iconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        // Pass 2B correction §1 — flexWrap fixes the confirmed overflow:
        // pills that don't fit the available width wrap onto additional
        // rows inside this container instead of extending past it. Never
        // horizontal scrolling, never clipping.
        actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        actionButton: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.accent, maxWidth: '100%' },
        actionButtonSecondary: { backgroundColor: colors.surfaceMuted },
        actionButtonDisabled: { opacity: 0.5 },
        actionText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
        actionTextSecondary: { color: colors.textSecondary },
        // Wave 5 — the Design 5.1 semantic warning role, which is darker
        // than the legacy token and needs no per-scheme override.
        errorText: { ...typography.caption, fontSize: 12, color: semantic.warning, lineHeight: 16, marginTop: spacing.sm },
      }),
    [colors, radius, spacing, typography, scheme, semantic]
  );

  if (!reminder) return null;

  // salary_check/bill_overdue reminders read `amount` straight from
  // RecurringItem.amount (reminders.ts's computeTopReminder) with no
  // runtime check of its own — a finite-positive, at-most-2-decimal amount
  // is only enforced at the two entry-point forms going forward, not
  // structurally guaranteed for legacy data. Computed once here (not
  // duplicated per-branch) using the same shared validator the confirmation
  // transition itself uses, so the disclosure and the transition can never
  // disagree about which amounts are legitimate (regression-protection
  // review, B2.0B recurring-money precision correction §6). Never displays
  // a rounded representation of an invalid fractional-cent value — the
  // disclosure Text below is simply omitted when this is invalid.
  const disclosedAmount = moneyAmountToCents(reminder.amount ?? NaN);

  // Reminder queue correction round — the shared cleanup every outcome
  // reporter below performs before handing off to the host, extracted once
  // so each reporter is a one-line call. Resets every local UI-only sub-step
  // (source/account/destination pickers, the inline add-balance overlay, any
  // recoverable error) — never persisted state.
  function resetLocalUiState() {
    setAwaitingSource(false);
    setAwaitingEverydayAccount(false);
    setAwaitingIncomeDestination(false);
    setAddBalanceVisible(false);
    setActionError(null);
  }

  // "Not yet" — no mutation occurred. Reports this occurrence's stable key
  // so the host (ReminderDetailSheet) can session-exclude it and advance to
  // the next eligible reminder using the canonical ranked selector, rather
  // than this component hiding it locally (the confirmed root cause of the
  // Not-yet-terminates-the-review device-test defect — see this file's own
  // top-of-file doc comment).
  function deferReminder() {
    if (!reminder) return;
    const occurrenceKey = occurrenceKeyOf(reminder);
    resetLocalUiState();
    onOutcome?.({ kind: 'deferred', occurrenceKey });
  }

  // "Got it" (bill_due_soon only) — likewise no mutation; session-excluded
  // the same way as deferReminder so it doesn't immediately re-select itself
  // and reproduce the same blank-redisplay defect.
  function acknowledgeReminder() {
    if (!reminder) return;
    const occurrenceKey = occurrenceKeyOf(reminder);
    resetLocalUiState();
    onOutcome?.({ kind: 'acknowledged', occurrenceKey });
  }

  // A real mutation was confirmed — carries the mutation's own real
  // transactionId and its synchronously-returned freshest AppData (never the
  // potentially one-render-stale `data` closure — the mutation and this call
  // happen in the SAME synchronous event, before React re-renders this
  // component with the fresh value; see this round's final report §5/§6 for
  // the full latest-data proof).
  function reportCompleted(transactionId: string, latestData: AppData) {
    if (!reminder) return;
    const occurrenceKey = occurrenceKeyOf(reminder);
    resetLocalUiState();
    onOutcome?.({ kind: 'completed', occurrenceKey, transactionId, latestData });
  }

  // A confirmation attempt resolved 'stale'/'not_found'/'already_confirmed'
  // — the transition did not apply (nothing was mutated by THIS call), but
  // the underlying occurrence is already gone/handled (a duplicate tap, or
  // it was resolved elsewhere) and must not keep re-displaying. There is no
  // real transactionId to report (no mutation happened here), so this is
  // reported as 'deferred' — a session-only exclusion, never a persisted
  // change — which is exactly the correct mechanical effect: stop offering
  // this occurrence again this session, then let the canonical selector
  // decide what's actually next from the latest data.
  function reportAlreadyResolved() {
    if (!reminder) return;
    const occurrenceKey = occurrenceKeyOf(reminder);
    resetLocalUiState();
    onOutcome?.({ kind: 'deferred', occurrenceKey });
  }

  // Coaching-not-shaming — never exposes which technical validation failed,
  // except invalid_amount, which is deterministic: retrying without editing
  // the source can never succeed, so the generic "try again" message would
  // be actively misleading there (regression-protection review, B2.0B
  // recurring-money precision correction §5). Otherwise two buckets: a
  // payment-account problem (the user can act on that: check the card/cash
  // account exists) versus everything else, which is never the user's
  // fault to diagnose in detail (regression-protection review, B2.0B
  // correction §4).
  function recoverableErrorMessage(
    reason:
      | 'not_found'
      | 'stale'
      | 'invalid_date'
      | 'invalid_amount'
      | 'invalid_input'
      | 'invalid_source'
      | 'balance_target_missing'
      | 'missing_liability'
      | 'ambiguous_schedule'
      | 'already_confirmed'
      | 'insufficient_source_balance'
  ): string {
    switch (reason) {
      case 'invalid_amount':
        return 'This saved amount needs to be updated to no more than 2 decimal places. Open Money, edit the income or bill amount, then try again.';
      case 'invalid_source':
      case 'balance_target_missing':
        return "We couldn't update that yet. Check the payment account and try again.";
      case 'insufficient_source_balance':
        return "This account doesn't have enough recorded balance. Choose another source or update its balance.";
      case 'missing_liability':
      case 'ambiguous_schedule':
        return 'Check your BNPL plan’s repayment details in Wealth, then try again.';
      case 'invalid_date':
      case 'invalid_input':
        return "We couldn't update that yet. Please try again.";
      case 'not_found':
      case 'stale':
      case 'already_confirmed':
        // Unreachable here — handled via reportAlreadyResolved() below
        // before this is ever called. Included so the switch stays
        // exhaustive over the full reason union rather than assuming a
        // subset.
        return "We couldn't update that yet. Please try again.";
    }
  }

  function runConfirmation(paymentSource?: 'cash' | 'credit_card' | 'everyday', targetAssetId?: string, creditCardId?: string) {
    if (!reminder || !reminder.recurringItemId) return;
    setActionError(null);
    // Left `true` on the applied/stale/not_found path deliberately — the
    // outcome reporters below change which reminder (if any) is displayed,
    // and the identity-change effect resets isSubmitting there. Resetting
    // it here too would
    // make it a same-tick no-op (set true then false before React ever
    // renders the disabled state), defeating its one purpose: giving a
    // rapid second native tap a chance to see a visually disabled button.
    // This is still only presentation-level defence — the actual
    // correctness guarantee is confirmRecurringOccurrence's dataRef/
    // latest-nextDueDate eligibility check, unaffected by this flag either way.
    setIsSubmitting(true);
    const item = data.recurringItems.find((r) => r.id === reminder.recurringItemId);
    // B2.0C — confirmRecurringOccurrence now returns { transition,
    // persistence }; `persistence` is deliberately not awaited/consumed
    // here. The confirmed occurrence's nextDueDate already advanced as part
    // of the in-memory transition above, so computeTopReminder(data) can no
    // longer select it on the very next render regardless of which outcome
    // is reported — this card cannot reliably stay the right context for a later
    // persistence-failure message (regression-protection review, B2.0C
    // corrected design §3). A save failure is surfaced by the app-level
    // UnsavedChangesBanner (App.tsx), driven by AppStateContext's
    // persistenceState, not by this component.
    const { transition, transactionId } = confirmRecurringOccurrence({
      recurringItemId: reminder.recurringItemId,
      expectedNextDueDate: item?.nextDueDate ?? '',
      paymentSource,
      targetAssetId,
      creditCardId,
    });

    if (transition.applied) {
      reportCompleted(transactionId, transition.data);
      return;
    }
    if (transition.reason === 'stale' || transition.reason === 'not_found') {
      reportAlreadyResolved();
      return;
    }
    // invalid_amount | invalid_input | invalid_source | invalid_date |
    // balance_target_missing — stays visible, recoverable, retryable now.
    // Still correct to show here: transition.applied === false means `data`
    // never changed, so `reminder` stays stable and this card legitimately
    // remains the right place for this specific message.
    setIsSubmitting(false);
    setActionError(recoverableErrorMessage(transition.reason));
  }

  // BNPL — mirrors runConfirmation's own contract exactly (same
  // isSubmitting discipline, same dismiss-on-applied/stale/not_found
  // shape), routed through the atomic confirmBnplRepayment transition
  // instead, which additionally reduces the linked liability and can
  // reject with 'insufficient_source_balance' (never a partial/silently
  // clamped application — see confirmBnplRepaymentTransition's own doc
  // comment).
  function runBnplConfirmation(paymentSource: 'cash' | 'credit_card' | 'everyday', targetAssetId?: string) {
    if (!reminder || !reminder.recurringItemId || !reminder.liabilityId) return;
    setActionError(null);
    setIsSubmitting(true);
    const item = data.recurringItems.find((r) => r.id === reminder.recurringItemId);
    const { transition, transactionId } = confirmBnplRepayment({
      recurringItemId: reminder.recurringItemId,
      liabilityId: reminder.liabilityId,
      expectedNextDueDate: item?.nextDueDate ?? '',
      paymentSource,
      targetAssetId,
    });

    if (transition.applied) {
      reportCompleted(transactionId, transition.data);
      return;
    }
    if (transition.reason === 'stale' || transition.reason === 'not_found' || transition.reason === 'already_confirmed') {
      reportAlreadyResolved();
      return;
    }
    setIsSubmitting(false);
    setActionError(recoverableErrorMessage(transition.reason));
  }

  // Correction round, 2026-08-10 — "Yes, it arrived" no longer commits
  // anything itself; it only opens the shared destination picker. Nothing
  // is mutated until the user explicitly taps a specific balance below.
  function confirmSalary() {
    setAwaitingIncomeDestination(true);
  }

  // The actual income commit, once a real destination is chosen — mirrors
  // runConfirmation's own isSubmitting/dismiss/error contract exactly, but
  // is deliberately a separate function rather than an overload: income
  // never uses `paymentSource` (see confirmRecurringOccurrenceTransition's
  // own income/expense split), so this passes `targetAssetId` instead,
  // never both.
  function confirmSalaryToDestination(targetAssetId: string) {
    if (!reminder || !reminder.recurringItemId) return;
    setActionError(null);
    setIsSubmitting(true);
    const item = data.recurringItems.find((r) => r.id === reminder.recurringItemId);
    const { transition, transactionId } = confirmRecurringOccurrence({
      recurringItemId: reminder.recurringItemId,
      expectedNextDueDate: item?.nextDueDate ?? '',
      targetAssetId,
    });

    if (transition.applied) {
      reportCompleted(transactionId, transition.data);
      return;
    }
    if (transition.reason === 'stale' || transition.reason === 'not_found') {
      reportAlreadyResolved();
      return;
    }
    setIsSubmitting(false);
    setActionError(recoverableErrorMessage(transition.reason));
  }

  function confirmBillPaid(source: 'cash' | 'credit_card') {
    if (reminder?.kind === 'bnpl_repayment_due') {
      runBnplConfirmation(source);
      return;
    }
    runConfirmation(source);
  }

  // Device-test correction round — the ordinary (non-BNPL) bill's own
  // dispatcher for the new shared BillPaymentSourcePicker, replacing the
  // previous two-button-only confirmBillPaid('cash'|'credit_card') path
  // for this specific reminder kind. BNPL's own flow (confirmBillPaid /
  // runBnplConfirmation / the separate awaitingEverydayAccount step above)
  // is completely untouched — this function is only ever reachable from
  // the bill_overdue branch below.
  function confirmBillPaidFromSource(source: BillPaymentSourceOption) {
    if (source.kind === 'credit_card') {
      runConfirmation('credit_card', undefined, source.id);
      return;
    }
    if (source.assetType === 'everyday') {
      runConfirmation('everyday', source.id);
      return;
    }
    runConfirmation('cash');
  }

  // Correction pass, §2 — the specific-account half of the Everyday Account
  // choice, mirrors confirmBillPaid's own dispatch shape but is only ever
  // reachable for bnpl_repayment_due (see awaitingEverydayAccount's own
  // comment for why this isn't offered to ordinary bills in this pass).
  function confirmBnplEveryday(accountId: string) {
    runBnplConfirmation('everyday', accountId);
  }

  const icon =
    reminder.kind === 'salary_check'
      ? 'cash-outline'
      : reminder.kind === 'card_due_soon'
      ? 'card-outline'
      : reminder.kind === 'bnpl_repayment_due' || reminder.kind === 'loan_repayment_due'
      ? 'bag-handle-outline'
      : 'calendar-outline';
  const reminderCard = reminder.creditCardId ? data.creditCards.find((c) => c.id === reminder.creditCardId) ?? null : null;
  // Final Pass 2D device-test correction — the loan_repayment_due reminder's
  // linked liability/recurring item, resolved once here for both the "Yes,
  // I paid it" gate below and the LoanRepaymentSheet mount at the bottom of
  // this component. Mirrors reminderCard's own resolve-once pattern exactly.
  const reminderLoanLiability =
    reminder.kind === 'loan_repayment_due' && reminder.liabilityId ? data.liabilities.find((l) => l.id === reminder.liabilityId) ?? null : null;
  const reminderLoanRecurringItem =
    reminder.kind === 'loan_repayment_due' && reminder.recurringItemId
      ? data.recurringItems.find((r) => r.id === reminder.recurringItemId) ?? null
      : null;

  return (
    <SectionCard>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={16} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text ref={titleRef} style={styles.title}>{reminder.title}</Text>
          <Text style={styles.body}>{reminder.body}</Text>

          {reminder.kind === 'salary_check' && !awaitingIncomeDestination ? (
            <>
              {/* Coaching-not-shaming transparency: what pressing the button
                  actually does, before the user presses it — never implies
                  Navilo independently verified the payment arrived (PRD ask,
                  post-device-testing correction). Plain Text, so it's in the
                  natural screen-reader reading order ahead of the buttons;
                  no numberOfLines, so it wraps cleanly on narrow screens.
                  Suppressed (never a rounded/fabricated figure) when the
                  amount doesn't pass moneyAmountToCents — see
                  disclosedAmount above. Correction round, 2026-08-10 — no
                  longer names Cash specifically: the next step always asks
                  which balance, and this copy must never imply that choice
                  is already decided. */}
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Confirming will record ${formatDisclosureAmount(disclosedAmount.cents)} as income in Nolie — you'll choose which balance it's added to next. This updates Nolie only—it does not move money in your bank.`}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
                  onPress={confirmSalary}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Yes, it arrived"
                >
                  <Text style={styles.actionText}>Yes, it arrived</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSecondary]}
                  onPress={deferReminder}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Not yet"
                >
                  <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {reminder.kind === 'salary_check' && awaitingIncomeDestination ? (
            <>
              <IncomeDestinationPicker
                destinations={eligibleIncomeDestinations}
                onSelect={confirmSalaryToDestination}
                onBack={() => setAwaitingIncomeDestination(false)}
                disabled={isSubmitting}
                dense
                onAddBalance={() => setAddBalanceVisible(true)}
              />
              <AddWealthItemModal visible={addBalanceVisible} kind="asset" onClose={() => setAddBalanceVisible(false)} onlyLiquidCategories />
            </>
          ) : null}

          {(reminder.kind === 'bill_overdue' || reminder.kind === 'bnpl_repayment_due') && !awaitingSource ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setAwaitingSource(true)}
                accessibilityRole="button"
                accessibilityLabel="Yes, I paid it"
              >
                <Text style={styles.actionText}>Yes, I paid it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={deferReminder}
                accessibilityRole="button"
                accessibilityLabel="Not yet"
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Device-test correction round — ordinary bills now use the
              shared BillPaymentSourcePicker (every eligible Cash/Everyday
              account plus every credit card, each shown with its real
              balance/owed amount) instead of a hard-coded "From cash" /
              "From credit card" pair. Never silently defaults to Cash —
              nothing is confirmed until a specific source is tapped. */}
          {reminder.kind === 'bill_overdue' && awaitingSource ? (
            <>
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Confirming will record ${formatDisclosureAmount(disclosedAmount.cents)} as an expense and update your chosen account or credit card balance in Nolie. This updates Nolie only—it does not move money in your bank.`}
                </Text>
              ) : null}
              <BillPaymentSourcePicker
                sources={eligibleBillPaymentSources}
                onSelect={confirmBillPaidFromSource}
                onBack={() => setAwaitingSource(false)}
                disabled={isSubmitting}
              />
            </>
          ) : null}

          {reminder.kind === 'bnpl_repayment_due' && awaitingSource && !awaitingEverydayAccount ? (
            <>
              {/* Same transparency treatment as the income branch above —
                  shown before the payment-source choice, since that choice
                  is what determines whether Cash or the credit card is
                  updated (PRD ask, post-device-testing correction). BNPL
                  gets its own wording — a second balance (what's still
                  owed on the plan) changes too. */}
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Confirming will record ${formatDisclosureAmount(disclosedAmount.cents)} as an expense, update your chosen payment source, and reduce what you still owe on this plan by the same amount. This updates Nolie only—it does not move money in your bank.`}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
                  onPress={() => confirmBillPaid('cash')}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="From cash"
                >
                  <Text style={styles.actionText}>From cash</Text>
                </TouchableOpacity>
                {/* Correction pass, §2 — Everyday Accounts were previously
                    entirely unreachable from BNPL confirmation (report only
                    described a cash/credit-card choice); this reuses the
                    same routed-spending source contract the transaction
                    engine already supports. Scoped to bnpl_repayment_due
                    only — see awaitingEverydayAccount's own comment. */}
                {data.assets.some((a) => a.type === 'everyday') ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary, isSubmitting ? styles.actionButtonDisabled : null]}
                    onPress={() => setAwaitingEverydayAccount(true)}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="From everyday account"
                  >
                    <Text style={[styles.actionText, styles.actionTextSecondary]}>From everyday account</Text>
                  </TouchableOpacity>
                ) : null}
                {data.creditCards.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary, isSubmitting ? styles.actionButtonDisabled : null]}
                    onPress={() => confirmBillPaid('credit_card')}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="From credit card"
                  >
                    <Text style={[styles.actionText, styles.actionTextSecondary]}>From credit card</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : null}

          {reminder.kind === 'bnpl_repayment_due' && awaitingSource && awaitingEverydayAccount ? (
            <>
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Choose which account this ${formatDisclosureAmount(disclosedAmount.cents)} repayment comes from. Only that account's balance will change.`}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                {data.assets
                  .filter((a) => a.type === 'everyday')
                  .map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
                      onPress={() => confirmBnplEveryday(a.id)}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}
                    >
                      <Text style={styles.actionText}>
                        {a.label} (${a.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </Text>
                    </TouchableOpacity>
                  ))}
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSecondary]}
                  onPress={() => setAwaitingEverydayAccount(false)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <Text style={[styles.actionText, styles.actionTextSecondary]}>Back</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {reminder.kind === 'bill_due_soon' ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={acknowledgeReminder}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={[styles.actionText, styles.actionTextSecondary]}>Got it</Text>
            </TouchableOpacity>
          ) : null}

          {reminder.kind === 'card_due_soon' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  // Device-test correction round — close the hosting sheet
                  // (if any) BEFORE navigating, never after: the previous
                  // order left a still-visible, now-empty "Reminder" sheet
                  // rendered on top of Cards for roughly a second.
                  onNavigateAway?.();
                  navigation.navigate('Cards');
                }}
                accessibilityRole="button"
                accessibilityLabel="Review card"
              >
                <Text style={styles.actionText}>Review card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => (reminderCard ? onRequestCreditCardRepayment?.() : deferReminder())}
                accessibilityRole="button"
                accessibilityLabel="Record payment"
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Record payment</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Final Pass 2D device-test correction — mortgage/personal-loan/
              car-loan reminders request the dedicated loan repayment form
              (amount entry, source selection, and the optional balance
              update in one place), rather than the generic
              BillPaymentSourcePicker two-step ordinary bills use. Native-
              Modal-lifecycle round — the form itself is now content owned
              by ReminderDetailSheet's single Modal (see
              onRequestLoanRepayment's own doc comment), never a second
              nested native Modal. */}
          {reminder.kind === 'loan_repayment_due' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => (reminderLoanLiability && reminderLoanRecurringItem ? onRequestLoanRepayment?.() : deferReminder())}
                accessibilityRole="button"
                accessibilityLabel="Record payment"
              >
                <Text style={styles.actionText}>Record payment</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={deferReminder}
                accessibilityRole="button"
                accessibilityLabel="Not yet"
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        </View>
      </View>
    </SectionCard>
  );
}
