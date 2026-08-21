import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { RefObject } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  resolveReminderIdentity,
  BILL_SOURCE_STEP,
  INCOME_DESTINATION_STEP,
  incomeDestinationTitle,
  billConfirmLabel,
  INCOME_CONFIRM_LABEL,
  incomeRecordingNotice,
  confirmationSummary,
  PRIMARY_ACTION_MIN_HEIGHT,
  SNOOZE_ROW_MIN_HEIGHT,
  snoozeChoiceDateLabel,
  resolvePrimaryIntent,
  hasFinancialAction,
  SNOOZE_ACTION,
  DISMISS_ACTION,
  SNOOZE_SHEET,
  DISMISS_CONFIRM,
  suppressionAnnouncement,
  resolveFactGridColumns,
  resolveReminderStatus,
  composeReminderAnnouncement,
  composeCardReminderFacts,
  cardReminderRateProvenance,
  CARD_REMINDER_CAUTION,
} from '../../lib/reminderPresentation';
import { computeCreditCardInterestEstimate, resolveExpectedMonthlyRepayment } from '../../lib/calculations/creditHealth';
import { toLocalDateString, addLocalDays, SNOOZE_PRESETS } from '../../lib/calculations/reminderSuppression';
import { InlineCalendar } from '../shared/fields/InlineCalendar';
import { AccountChoiceList } from '../shared/AccountChoiceList';
import { incomeDestinationRows, billPaymentSourceRows } from '../../lib/calculations/accountChoice';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { SmartReminder } from '../../lib/calculations/reminders';
import type { PayFrequency } from '../../types/models';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { moneyAmountToCents } from '../../lib/calculations/money';
import { resolveEligibleIncomeDestinations } from '../../lib/calculations/incomeDestinations';
import { resolveEligibleBillPaymentSources, BillPaymentSourceOption } from '../../lib/calculations/billPaymentSources';
import { AppData } from '../../types/models';
import { occurrenceKeyOf, ReminderReviewOutcome } from '../../lib/calculations/reminderInteractionLifecycle';
import { useAnnounceOnce } from '../../hooks/useAnnounceOnce';

/** Design 5.1 Wave 6 closure — the primary reminder actions resolve real
 * money, so they take a comfortable 48pt rather than the 44pt floor. */
const REMINDER_ACTION_MIN_HEIGHT = 48;

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
/** Tone -> style, written out rather than indexed by template string so
 * every tone is checked at compile time and an unhandled tone is an error
 * rather than a silently unstyled pill. */
const STATUS_PILL_STYLE = {
  informational: (s: any) => s.statusPill_informational,
  caution: (s: any) => s.statusPill_caution,
  urgent: (s: any) => s.statusPill_urgent,
  positive: (s: any) => s.statusPill_positive,
} as const;
const STATUS_TEXT_STYLE = {
  informational: (s: any) => s.statusText_informational,
  caution: (s: any) => s.statusText_caution,
  urgent: (s: any) => s.statusText_urgent,
  positive: (s: any) => s.statusText_positive,
} as const;

/** The customer-facing word for each schedule. `irregular` deliberately
 * reads as "No set schedule" rather than "Irregular", which sounds like a
 * judgement about the customer rather than a description of the bill. */
const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  irregular: 'No set schedule',
};

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
  queuePosition = 1,
  queueTotal = 1,
  daysUntil = null,
  today = new Date(),
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
  /** Wave 6 closure — queue context, supplied by the hosting sheet from the
   * SAME canonical ranked selector it advances through. Presentation only:
   * it selects nothing and changes no handler. */
  queuePosition?: number;
  queueTotal?: number;
  /** Whole days until this occurrence, computed by the hosting sheet from
   * the reminder's own occurrenceDate. Null when the reminder has no dated
   * occurrence. */
  daysUntil?: number | null;
  /** The sheet's own fixed "today" — the same Date the reminder ranker was
   * given. Snooze presets and the snooze calendar must be relative to THAT,
   * never to a separately re-read `new Date()`, or a reminder selected just
   * before local midnight could be snoozed to a day already past. */
  today?: Date;
}) {
  const { data, confirmRecurringOccurrence, confirmBnplRepayment, snoozeReminderOccurrence, dismissReminderOccurrence } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, scheme, semantic } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  /**
   * Wave 6 final — Snooze and Dismiss are inline STEPS of this same
   * surface, never a second native Modal (MOTION_HARD_RULES rule 2). Both
   * are transient view state: closing the sheet forgets them, and neither
   * has written anything until its own confirm control is pressed.
   */
  const [suppressionStep, setSuppressionStep] = useState<'none' | 'snooze' | 'dismiss'>('none');
  const [snoozePickingDate, setSnoozePickingDate] = useState(false);
  /**
   * Wave 6 final — the account the customer has CHOSEN, which is not the
   * same as an account they have paid from. The previous pickers fired the
   * caller's mutation straight out of onPress, so a customer discovered
   * they had recorded a payment by having already recorded it. Selection
   * now only sets this; a separate primary control performs the action.
   */
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
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
  /* The same eligibility, rendered as shared rows. The resolver decides
     WHICH accounts; this only decides how they look. */
  const billSourceRows = useMemo(() => billPaymentSourceRows(eligibleBillPaymentSources), [eligibleBillPaymentSources]);

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
        actionRowStacked: { flexDirection: 'column', alignItems: 'stretch' },
        statusPill: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginBottom: spacing.xs },
        statusText: { ...typography.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
        // The four tones map onto existing Design 5.1 semantic roles — no
        // new colour is introduced, and urgency never uses success green.
        statusPill_informational: { backgroundColor: semantic.infoTint },
        statusText_informational: { color: semantic.infoText },
        statusPill_caution: { backgroundColor: semantic.warningTint },
        statusText_caution: { color: semantic.warningAccent },
        statusPill_urgent: { backgroundColor: semantic.urgentTint },
        statusText_urgent: { color: semantic.urgentText },
        statusPill_positive: { backgroundColor: semantic.successTint },
        statusText_positive: { color: semantic.success },
        // Wave 6 closure — these were paddingVertical: 7 around 12pt text,
        // roughly a 30pt target: genuinely below the 44pt minimum, on the
        // controls that resolve a money reminder. 48pt for the primary
        // action, per the accessibility contract.
        actionButton: {
          minHeight: REMINDER_ACTION_MIN_HEIGHT,
          justifyContent: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: colors.accent,
          maxWidth: '100%',
        },
        actionButtonSecondary: { backgroundColor: colors.surfaceMuted },
        // Wave 6 closure — the primary action is the Ocean Blue interactive
        // role, never success green: recording a payment is an action to
        // take, not an outcome already achieved.
        actionButtonPrimary: { backgroundColor: semantic.interactive },
        /* Wave 6 final — ONE full-width primary action, taller than
           anything else on the surface, always in the same place: after the
           facts, before the secondary row. It is the control that moves
           money, and it never uses the success role before a mutation has
           actually succeeded. */
        primaryAction: {
          width: '100%',
          minHeight: PRIMARY_ACTION_MIN_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: semantic.interactive,
          marginTop: spacing.md,
        },
        primaryActionWrap: { width: '100%' },
        // Both confirmation choices centre their label — they are answers
        // to a question, not labelled controls with supporting copy.
        confirmChoice: { justifyContent: 'center' },
        snoozeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: SNOOZE_ROW_MIN_HEIGHT,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          marginBottom: spacing.sm,
        },
        snoozeRowLabel: { ...typography.body, fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
        snoozeRowDate: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        stepSummary: { ...typography.caption, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
        /* Back is a real, named 44pt control — not small floating text. */
        stepBack: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: spacing.md, marginTop: spacing.xs },
        stepBackText: { ...typography.caption, fontSize: 13, fontWeight: '700', color: semantic.interactive },
        // The inline Snooze/Dismiss steps read as a distinct decision area
        // without becoming a second card — a tinted block inside the same
        // surface, not a nested SectionCard.
        stepBlock: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surfaceMuted, gap: spacing.xs },
        stepTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        stepBody: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: spacing.xs },
        // Snooze and Dismiss sit below the domain action, separated by a
        // hairline so they read as a different tier rather than a third and
        // fourth equally-weighted button.
        /* Wave 6 final — two GENUINELY equal columns. `flexWrap` plus
           content-sized buttons meant the wider label won more width, so
           Snooze and Dismiss were visibly different sizes and neither
           aligned with the primary above them. flexBasis:0 + flexGrow:1
           makes width a function of the row, not of the words inside. */
        suppressionRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        suppressionRowStacked: { flexDirection: 'column' },
        suppressionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          flexGrow: 1,
          flexBasis: 0,
          // Identical box for both, so neither can out-size the other.
          minHeight: 56,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.card,
        },
        suppressionLabels: { flexShrink: 1 },
        suppressionSupport: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textSecondary },
        // Dismiss is the only destructive control here. It is deliberately
        // NOT a filled red button: it is reversible in effect (a future
        // recurrence still appears) and must never out-shout the action
        // that actually settles the bill.
        dismissButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: semantic.urgentTint },
        actionButtonDestructive: { backgroundColor: 'transparent', borderWidth: 2, borderColor: semantic.urgentText },
        actionTextDestructive: { color: semantic.urgentText },
        factList: { marginTop: spacing.sm, gap: spacing.xs },
        factGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, rowGap: spacing.sm },
        factCellHalf: { width: '50%', paddingRight: spacing.sm },
        factCellFull: { width: '100%' },
        factGridLabel: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textSecondary },
        factGridValue: { ...typography.caption, fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.textPrimary },
        inlineLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 44, paddingRight: spacing.sm },
        inlineLinkText: { ...typography.caption, fontSize: 13, fontWeight: '600', color: semantic.interactive },
        // Label left, figure right: the scan pattern every other measure
        // surface in Design 5.1 already uses.
        factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
        factLabel: { ...typography.caption, fontSize: 13, lineHeight: 18, color: colors.textSecondary, flexShrink: 1 },
        factValue: { ...typography.caption, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textPrimary },
        // The estimate is the one figure here Nolie did not record, so it
        // is the one figure that is toned differently.
        factValueEstimated: { color: semantic.warning },
        factNote: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: spacing.xs },
        factProvenance: { ...typography.caption, fontSize: 12, lineHeight: 17, color: semantic.textTertiary },
        actionTextOnPrimary: { color: semantic.onInteractive },
        actionButtonOutline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: semantic.interactive },
        actionTextOutline: { color: semantic.interactive },
        actionButtonDisabled: { opacity: 0.5 },
        actionText: { ...typography.caption, fontSize: 13, color: colors.onAccent, fontWeight: '700', textAlign: 'center' },
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
  /**
   * Wave 6 final — Snooze. Persists a local calendar day for THIS
   * occurrence and advances the queue.
   *
   * No money moves and no occurrence is resolved: `snoozeReminderOccurrence`
   * writes one map entry and nothing else. The queue advance reuses the
   * established acknowledgement outcome, so the sheet's own session
   * exclusion and its focus/announcement lifecycle behave exactly as they
   * already do for any non-mutating outcome — this adds a reason, not a new
   * lifecycle.
   */
  function confirmSnooze(returnOn: Date) {
    if (!reminder) return;
    snoozeReminderOccurrence(occurrenceKeyOf(reminder), toLocalDateString(returnOn), today);
    AccessibilityInfo.announceForAccessibility(
      suppressionAnnouncement('snoozed', returnOn.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))
    );
    setSuppressionStep('none');
    setSnoozePickingDate(false);
    // ONE path to the queue advance, shared with every other non-mutating
    // outcome — so the sheet's session exclusion, focus and announcement
    // lifecycle behave identically no matter which intent got us here.
    acknowledgeReminder();
  }

  /**
   * Wave 6 final — Dismiss, only ever reachable from the inline
   * confirmation step below. Hides ONE occurrence: the bill, the account,
   * every recorded transaction and every future recurrence are untouched,
   * because a later occurrence computes a different key.
   */
  function confirmDismiss() {
    if (!reminder) return;
    dismissReminderOccurrence(occurrenceKeyOf(reminder), today);
    AccessibilityInfo.announceForAccessibility(suppressionAnnouncement('dismissed'));
    setSuppressionStep('none');
    acknowledgeReminder();
  }

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
  /* Wave 6 final — the context-specific verb for this kind's real
     financial action, or `none` for a reminder that is not about money.
     A reminder with no financial action never grows a fabricated one. */
  const primaryIntent = resolvePrimaryIntent(reminder.kind);
  const factColumns = resolveFactGridColumns(width, fontScale);

  /* Wave 6 closure — the reminder's timing status, shown as a small pill
     above the title. The customer previously had to read a paragraph to
     learn whether something was overdue or a week away. Presentation only:
     derived from the day count the engine already computed. */
  const effectiveDaysUntil = reminder.creditCardDue?.daysUntil ?? daysUntil;

  /* Wave 6 final — the reminder's own words, built from its structured
     fields rather than the engine's prose title. The engine still composes
     "Did you pay your Rent?" and "Did your dividends arrive? 🎉"; both
     prepend or re-case a name the customer typed, and both repeat timing
     the status pill already carries. The engine is not edited — wording is
     resolved here, where it belongs. */
  const linkedName = (() => {
    if (reminder.kind === 'card_due_soon') return reminderCard?.label ?? null;
    if (reminder.recurringItemId) return data.recurringItems.find((r) => r.id === reminder.recurringItemId)?.label ?? null;
    return null;
  })();
  const identity = resolveReminderIdentity({
    kind: reminder.kind,
    name: linkedName,
    amount: reminder.amount,
    occurrenceISO: reminder.occurrenceDate,
    daysUntil: effectiveDaysUntil,
  });
  const status = identity.status;

  /* One announcement per reminder, delivered by the SAME focus event the
     sheet already fires exactly once per content identity — not a separate
     announceForAccessibility, which would speak over it. Queue position
     leads, so a screen-reader customer knows where they are before hearing
     the detail. */
  const announcement = composeReminderAnnouncement({
    position: queuePosition,
    total: queueTotal,
    status: status.label,
    title: identity.title,
    amountLabel: identity.supportLine,
  });

  /* Actions stack when the text is scaled up: two 48pt buttons cannot sit
     side by side at accessibility sizes without truncating their labels. */
  const stackActions = fontScale >= 1.3;

  /* Wave 6 closure — the card reminder's supporting facts, resolved once
     from the SAME shared engines every other card surface reads, so this
     reminder can never quote a different balance, repayment or interest
     figure than the card detail screen does. Nothing new is computed. */
  const cardFacts = useMemo(() => {
    if (reminder.kind !== 'card_due_soon' || !reminderCard) return null;
    const estimate = computeCreditCardInterestEstimate({
      balance: reminderCard.currentBalance,
      annualRate: reminderCard.apr,
      daysUntilDue: reminder.creditCardDue?.daysUntil ?? 0,
    });
    return {
      facts: composeCardReminderFacts({
        expectedMonthlyRepayment: resolveExpectedMonthlyRepayment(reminderCard),
        recordedBalance: reminderCard.currentBalance,
        estimatedCycleInterest: estimate.estimatedCycleInterest,
        cycleDays: estimate.cycleDays,
      }),
      provenance: cardReminderRateProvenance(estimate.rateUsed, estimate.isAssumedRate),
    };
  }, [reminder, reminderCard]);

  /* Wave 6 final — the bill facts grid. Every value comes from the
     reminder's own linked recurring item and the customer's own categories;
     nothing is derived, estimated or defaulted.

     The account is deliberately ABSENT here. An account shown among the
     facts reads as "this is what paid it", and nothing has paid it yet —
     that choice is made in the source picker and only then becomes true. */
  const billFacts = useMemo(() => {
    if (!hasFinancialAction(reminder.kind) || reminder.kind === 'card_due_soon' || reminder.kind === 'salary_check') return null;
    const item = reminder.recurringItemId ? data.recurringItems.find((r) => r.id === reminder.recurringItemId) ?? null : null;
    if (!item) return null;
    const facts: { label: string; value: string }[] = [];
    if (reminder.occurrenceDate) {
      facts.push({ label: 'Due date', value: new Date(reminder.occurrenceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) });
    }
    if (typeof reminder.amount === 'number' && Number.isFinite(reminder.amount)) {
      facts.push({ label: 'Amount', value: `$${Math.round(reminder.amount).toLocaleString()}` });
    }
    // NOT a category: RecurringItem records no categoryId, and inventing
    // one would put a fabricated fact next to three real ones. `isFixed` is
    // a classification the customer themselves set, and it is the closest
    // genuinely-recorded answer to "what kind of cost is this".
    facts.push({ label: 'Type', value: item.isFixed ? 'Fixed cost' : 'Flexible cost' });
    if (item.frequency) facts.push({ label: 'Schedule', value: FREQUENCY_LABEL[item.frequency] });
    return facts.length > 0 ? facts : null;
  }, [reminder, data.recurringItems, data.categories]);

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
          <View style={[styles.statusPill, STATUS_PILL_STYLE[status.tone](styles)]}>
            <Text style={[styles.statusText, STATUS_TEXT_STYLE[status.tone](styles)]}>{status.label}</Text>
          </View>
          <Text
            ref={titleRef}
            style={styles.title}
            accessibilityRole="header"
            accessibilityLabel={announcement}
            testID="reminder-title"
          >
            {identity.title}
          </Text>
          {/* Wave 6 final — ONE supporting line, and only one. The engine's
              body is six or seven sentences for a card and a restated due
              date for a bill; every figure it carries now appears exactly
              once, either in this line or in the labelled facts below. The
              engine string is untouched — it is simply no longer the thing
              the customer reads. */}
          {identity.supportLine ? (
            <Text style={styles.body} testID="reminder-support-line">{identity.supportLine}</Text>
          ) : null}

          {/* ------------------------------------------------------------------
              Wave 6 final — CANONICAL ORDER. Facts come before any action.

              The primary control used to sit directly under the title, so a
              customer met "Mark as paid" before they had been told the
              amount, the date or the schedule — they were asked to decide
              before they were given anything to decide with. Every reminder
              kind now reads the same way: identity, facts, one primary
              action, one aligned secondary row, then optional contextual
              navigation.
             ------------------------------------------------------------------ */}
          {billFacts && suppressionStep === 'none' && !awaitingSource ? (
            /* Wave 6 final — a responsive 2x2 grid, never four narrow
               columns. At 320pt each of four columns had roughly 70pt for a
               label and a currency figure, so every one of them truncated;
               large Dynamic Type made it worse. Two columns is the default
               and one is the honest answer once the text no longer fits. */
            <View style={styles.factGrid} testID="reminder-fact-grid">
              {billFacts.map((fact) => (
                <View key={fact.label} style={factColumns === 1 ? styles.factCellFull : styles.factCellHalf}>
                  <Text style={styles.factGridLabel}>{fact.label}</Text>
                  <Text style={styles.factGridValue} numberOfLines={2}>{fact.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {cardFacts && cardFacts.facts.length > 0 ? (
            /* Wave 6 closure — the card reminder previously ran its numbers
               together in prose, where nothing could be scanned and the
               expected repayment read as an amount contractually due. Each
               fact now carries its own label, so the customer can see at a
               glance what Nolie knows, what it has estimated, and where the
               estimate came from. */
            <View style={styles.factList}>
              {cardFacts.facts.map((fact) => (
                <View key={fact.label} style={styles.factRow}>
                  <Text style={styles.factLabel} numberOfLines={2}>{fact.label}</Text>
                  <Text style={[styles.factValue, fact.estimated ? styles.factValueEstimated : null]}>{fact.value}</Text>
                </View>
              ))}
              <Text style={styles.factNote}>{CARD_REMINDER_CAUTION}</Text>
              <Text style={styles.factProvenance}>{cardFacts.provenance}</Text>
              {/* Wave 6 final — navigation belongs WITH the card's details,
                  not among the three intent controls below. It resolves
                  nothing, so it must not read as a fourth equal choice.
                  Same route, same close-before-navigate ordering. */}
              <TouchableOpacity
                style={styles.inlineLink}
                onPress={() => {
                  // Close the hosting sheet BEFORE navigating, never after:
                  // the previous order left a still-visible, now-empty
                  // sheet rendered on top of Cards for roughly a second.
                  onNavigateAway?.();
                  navigation.navigate('Cards');
                }}
                accessibilityRole="button"
                accessibilityLabel="View card"
                testID="reminder-view-card"
              >
                <Text style={styles.inlineLinkText}>View card</Text>
                <Ionicons name="chevron-forward" size={13} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
              </TouchableOpacity>
            </View>
          ) : null}

          {reminder.kind === 'salary_check' && !awaitingIncomeDestination ? (
            <>
              {/* Coaching-not-shaming transparency: what pressing the button
                  actually does, before the customer presses it — never
                  implies Nolie independently verified the money arrived.
                  Wave 6 final shortened it to the two facts that matter:
                  the destination is their choice, and nothing moves at
                  their bank. */}
              {incomeRecordingNotice(reminder.amount) ? (
                <Text style={styles.body} testID="reminder-income-notice">{incomeRecordingNotice(reminder.amount)}</Text>
              ) : null}
              {/* Wave 6 final — ONE primary action. The visible "Not yet"
                  was retired: Snooze now handles "remind me later" with a
                  real date, Dismiss handles "not this one", and Close
                  leaves without acting. Three controls that each said
                  something specific replaced a fourth that said the least.
                  deferReminder itself is untouched — the loan branch still
                  uses it as its unresolvable-liability fallback. */}
              <TouchableOpacity
                style={[styles.primaryAction, isSubmitting ? styles.actionButtonDisabled : null]}
                onPress={confirmSalary}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Confirm received"
                accessibilityHint="Opens a step to choose which account this arrived in. Nothing is recorded until you confirm."
                testID="reminder-primary-action"
              >
                <Text style={[styles.actionText, styles.actionTextOnPrimary]}>Confirm received</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {reminder.kind === 'salary_check' && awaitingIncomeDestination ? (
            <View style={styles.stepBlock}>
              <Text style={styles.stepTitle} accessibilityRole="header">{incomeDestinationTitle(reminder.amount)}</Text>
              <Text style={styles.stepBody}>{INCOME_DESTINATION_STEP.body}</Text>
              {incomeDestinationRows(eligibleIncomeDestinations).length === 0 ? (
                <>
                  <Text style={styles.stepBody}>Add a money balance in Nolie first, so this income has somewhere to go.</Text>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonOutline]}
                    onPress={() => setAddBalanceVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Add a money balance"
                  >
                    <Text style={[styles.actionText, styles.actionTextOutline]}>Add a money balance</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <AccountChoiceList
                    rows={incomeDestinationRows(eligibleIncomeDestinations)}
                    selectedId={selectedDestinationId}
                    onSelect={setSelectedDestinationId}
                    disabled={isSubmitting}
                    testID="income-destination-list"
                  />
                  {/* The summary exists so the customer confirms against
                      facts rather than memory — amount, account, date. */}
                  {selectedDestinationId ? (
                    <Text style={styles.stepSummary} testID="income-confirm-summary">
                      {confirmationSummary({
                        amount: reminder.amount,
                        accountName: incomeDestinationRows(eligibleIncomeDestinations).find((r) => r.id === selectedDestinationId)?.name ?? null,
                        dateISO: reminder.occurrenceDate,
                      })}
                    </Text>
                  ) : null}
                  {/* Explicit confirmation is required even when only one
                      account is eligible: a single option is still a
                      decision the customer has to make. */}
                  <TouchableOpacity
                    style={[styles.primaryAction, !selectedDestinationId || isSubmitting ? styles.actionButtonDisabled : null]}
                    onPress={() => selectedDestinationId && confirmSalaryToDestination(selectedDestinationId)}
                    disabled={!selectedDestinationId || isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel={INCOME_CONFIRM_LABEL}
                    accessibilityState={{ disabled: !selectedDestinationId || isSubmitting }}
                    testID="income-confirm-action"
                  >
                    <Text style={[styles.actionText, styles.actionTextOnPrimary]}>{INCOME_CONFIRM_LABEL}</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.stepBack}
                onPress={() => {
                  setAwaitingIncomeDestination(false);
                  setSelectedDestinationId(null);
                }}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={INCOME_DESTINATION_STEP.backLabel}
                accessibilityHint="Returns without recording anything."
                testID="income-destination-back"
              >
                <Text style={styles.stepBackText}>{INCOME_DESTINATION_STEP.backLabel}</Text>
              </TouchableOpacity>
              <AddWealthItemModal visible={addBalanceVisible} kind="asset" onClose={() => setAddBalanceVisible(false)} onlyLiquidCategories />
            </View>
          ) : null}

          {/* Wave 6 final — an ordinary due-soon bill now offers the SAME
              real "did you pay it" journey an overdue bill already had,
              instead of an acknowledgement that recorded nothing. It is the
              identical two-step: this control only opens the source picker,
              and no money moves until a specific account is chosen there. */}
          {(reminder.kind === 'bill_overdue' || reminder.kind === 'bill_due_soon' || reminder.kind === 'bnpl_repayment_due') && !awaitingSource ? (
            <View style={styles.primaryActionWrap}>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => setAwaitingSource(true)}
                accessibilityRole="button"
                accessibilityLabel={primaryIntent.kind === 'financial' ? primaryIntent.label : 'Continue'}
                accessibilityHint={primaryIntent.kind === 'financial' ? primaryIntent.hint : undefined}
                testID="reminder-primary-action"
              >
                <Text style={[styles.actionText, styles.actionTextOnPrimary]}>
                  {primaryIntent.kind === 'financial' ? primaryIntent.label : 'Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Wave 6 final — the ordinary bill's account step, now
              SELECT-then-CONFIRM. Previously tapping an account row fired
              confirmBillPaidFromSource directly, so the customer's first
              tap recorded a payment: there was no moment between choosing
              and committing. Choosing now only marks the row; the primary
              control below performs the accepted mutation, unchanged.

              Eligibility is untouched. Every Cash/Everyday balance plus
              every credit card, exactly as resolveEligibleBillPaymentSources
              already returned — cards included, because computeBalanceEffect
              genuinely classifies `paymentSource: 'credit_card'` by
              increasing that card's recorded balance and its mirrored
              liability. They are grouped separately and captioned rather
              than hidden. */}
          {(reminder.kind === 'bill_overdue' || reminder.kind === 'bill_due_soon') && awaitingSource ? (
            <View style={styles.stepBlock}>
              <Text style={styles.stepTitle} accessibilityRole="header">{BILL_SOURCE_STEP.title}</Text>
              <Text style={styles.stepBody}>{BILL_SOURCE_STEP.body}</Text>
              {billSourceRows.length === 0 ? (
                <Text style={styles.stepBody}>You don't have an eligible account or credit card to pay this from yet.</Text>
              ) : (
                <>
                  <AccountChoiceList
                    rows={billSourceRows}
                    selectedId={selectedSourceId}
                    onSelect={setSelectedSourceId}
                    disabled={isSubmitting}
                    testID="bill-source-list"
                  />
                  {selectedSourceId ? (
                    <Text style={styles.stepSummary} testID="bill-confirm-summary">
                      {confirmationSummary({
                        amount: reminder.amount,
                        accountName: billSourceRows.find((r) => r.id === selectedSourceId)?.name ?? null,
                        dateISO: reminder.occurrenceDate,
                      })}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.primaryAction, !selectedSourceId || isSubmitting ? styles.actionButtonDisabled : null]}
                    onPress={() => {
                      const chosen = eligibleBillPaymentSources.find((o) => o.id === selectedSourceId);
                      if (chosen) confirmBillPaidFromSource(chosen);
                    }}
                    disabled={!selectedSourceId || isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel={billConfirmLabel(reminder.amount, fontScale)}
                    accessibilityState={{ disabled: !selectedSourceId || isSubmitting }}
                    testID="bill-confirm-action"
                  >
                    <Text style={[styles.actionText, styles.actionTextOnPrimary]}>{billConfirmLabel(reminder.amount, fontScale)}</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.stepBack}
                onPress={() => {
                  setAwaitingSource(false);
                  setSelectedSourceId(null);
                }}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={BILL_SOURCE_STEP.backLabel}
                accessibilityHint="Returns without recording a payment."
                testID="bill-source-back"
              >
                <Text style={styles.stepBackText}>{BILL_SOURCE_STEP.backLabel}</Text>
              </TouchableOpacity>
            </View>
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

          {/* Wave 6 final — the standalone acknowledgement control that used
              to live here is GONE. A due-soon bill now offers the same three
              intentions every other reminder does: Mark as paid (above),
              Snooze and Dismiss (below). The acknowledgement was a fourth
              control that overlapped both of the latter while being vaguer
              than either — it could not say when the reminder would return,
              or whether it ever would. Snooze answers "not now, ask me on
              this day"; Dismiss answers "never for this one". Between them
              there is nothing left for a bare acknowledgement to mean. */}
          {reminder.kind === 'card_due_soon' ? (
            /* Wave 6 final — one full-width primary, in the same position
               every other kind puts it. "View card" is not here: it is a
               compact inline link beside the card's own facts above, because
               navigating somewhere is not one of the three intentions and
               must not read as a competing choice. */
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => (reminderCard ? onRequestCreditCardRepayment?.() : deferReminder())}
              accessibilityRole="button"
              accessibilityLabel={primaryIntent.kind === 'financial' ? primaryIntent.label : 'Record payment'}
              accessibilityHint={primaryIntent.kind === 'financial' ? primaryIntent.hint : undefined}
              testID="reminder-record-payment"
            >
              <Text style={[styles.actionText, styles.actionTextOnPrimary]}>
                {primaryIntent.kind === 'financial' ? primaryIntent.label : 'Record payment'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {reminder.kind === 'loan_repayment_due' ? (
            /* Wave 6 final — "Record repayment", the same full-width shape
               every other kind uses. The handler, its liability/recurring-
               item gate and its deferReminder fallback are unchanged. */
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => (reminderLoanLiability && reminderLoanRecurringItem ? onRequestLoanRepayment?.() : deferReminder())}
              accessibilityRole="button"
              accessibilityLabel={primaryIntent.kind === 'financial' ? primaryIntent.label : 'Record repayment'}
              testID="reminder-primary-action"
            >
              <Text style={[styles.actionText, styles.actionTextOnPrimary]}>
                {primaryIntent.kind === 'financial' ? primaryIntent.label : 'Record repayment'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* ------------------------------------------------------------------
              Wave 6 final — the two SUPPRESSION steps.

              Both are inline states of this same surface: one native Modal
              at a time is a hard motion rule, and a confirmation that
              appears in a second stacked sheet reads as a different, more
              serious decision than it is. Neither has written anything
              until its own confirm control is pressed.
             ------------------------------------------------------------------ */}
          {suppressionStep === 'snooze' ? (
            <View style={styles.stepBlock}>
              <Text style={styles.stepTitle} accessibilityRole="header">{SNOOZE_SHEET.title}</Text>
              {/* Says "in Nolie" deliberately. This app schedules no push
                  notifications, and copy implying a phone alert would be a
                  promise the product cannot keep. */}
              <Text style={styles.stepBody}>{SNOOZE_SHEET.body}</Text>
              {snoozePickingDate ? (
                <>
                  <InlineCalendar
                    value={null}
                    today={today}
                    maximumDate={null}
                    minimumDate={addLocalDays(today, 1)}
                    onSelect={confirmSnooze}
                    testID="reminder-snooze-calendar"
                  />
                  <TouchableOpacity
                    style={styles.stepBack}
                    onPress={() => setSnoozePickingDate(false)}
                    accessibilityRole="button"
                    accessibilityLabel={SNOOZE_SHEET.backLabel}
                    accessibilityHint="Returns to the quick snooze choices."
                    testID="reminder-snooze-calendar-back"
                  >
                    <Text style={styles.stepBackText}>{SNOOZE_SHEET.backLabel}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Wave 6 final — complete rows, not an uneven pill
                      cluster. Each shows the REAL date: "Tomorrow" alone
                      left the customer working out which day that was.
                      Quick choices act directly, as they already did — a
                      snooze moves no money, so adding a financial-style
                      confirmation step to it would be ceremony, not care. */}
                  {SNOOZE_PRESETS.map((preset) => {
                    const target = addLocalDays(today, preset.days);
                    return (
                      <TouchableOpacity
                        key={preset.id}
                        style={styles.snoozeRow}
                        onPress={() => confirmSnooze(target)}
                        accessibilityRole="button"
                        accessibilityLabel={`${preset.label}, ${snoozeChoiceDateLabel(target)}`}
                        accessibilityHint="Hides this reminder until that day. Nothing is paid or changed."
                        testID={`reminder-snooze-${preset.id}`}
                      >
                        <Ionicons name="calendar-outline" size={17} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                        <Text style={styles.snoozeRowLabel}>{preset.label}</Text>
                        <Text style={styles.snoozeRowDate}>{snoozeChoiceDateLabel(target)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.snoozeRow}
                    onPress={() => setSnoozePickingDate(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Choose another date"
                    testID="reminder-snooze-custom"
                  >
                    <Ionicons name="calendar-number-outline" size={17} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                    <Text style={styles.snoozeRowLabel}>Choose another date</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepBack}
                    onPress={() => setSuppressionStep('none')}
                    accessibilityRole="button"
                    accessibilityLabel={SNOOZE_SHEET.backLabel}
                    accessibilityHint="Returns without snoozing."
                    testID="reminder-snooze-back"
                  >
                    <Text style={styles.stepBackText}>{SNOOZE_SHEET.backLabel}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}

          {suppressionStep === 'dismiss' ? (
            <View style={styles.stepBlock}>
              <Text style={styles.stepTitle} accessibilityRole="header">{DISMISS_CONFIRM.title}</Text>
              {/* Every clause closes a specific misreading: that dismissing
                  pays the bill, edits records, or turns this reminder off
                  forever. */}
              <Text style={styles.stepBody}>{DISMISS_CONFIRM.body}</Text>
              <View style={[styles.suppressionRow, stackActions ? styles.suppressionRowStacked : null]}>
                <TouchableOpacity
                  style={[styles.suppressionButton, styles.actionButtonOutline, styles.confirmChoice]}
                  onPress={() => setSuppressionStep('none')}
                  accessibilityRole="button"
                  accessibilityLabel={DISMISS_CONFIRM.keepLabel}
                  testID="reminder-dismiss-keep"
                >
                  <Text style={[styles.actionText, styles.actionTextOutline]}>{DISMISS_CONFIRM.keepLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.suppressionButton, styles.actionButtonDestructive, styles.confirmChoice]}
                  onPress={confirmDismiss}
                  accessibilityRole="button"
                  accessibilityLabel={DISMISS_CONFIRM.confirmLabel}
                  testID="reminder-dismiss-confirm"
                >
                  <Text style={[styles.actionText, styles.actionTextDestructive]}>{DISMISS_CONFIRM.confirmLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* ------------------------------------------------------------------
              Wave 6 final — the ALIGNED SECONDARY ROW.

              Two genuinely equal columns, below the one primary action and
              separated from it by a hairline, so they read as a different
              tier rather than as a third and fourth equal choice. Snooze is
              interactive-outlined; Dismiss is quieter and destructive and
              must never out-shout the action that actually settles the
              bill. Both are hidden while a step or picker owns the surface,
              so the customer is never asked two questions at once.
             ------------------------------------------------------------------ */}
          {suppressionStep === 'none' && !awaitingSource && !awaitingIncomeDestination && !awaitingEverydayAccount ? (
            <View style={[styles.suppressionRow, stackActions ? styles.suppressionRowStacked : null]}>
              <TouchableOpacity
                style={[styles.suppressionButton, styles.actionButtonOutline]}
                onPress={() => setSuppressionStep('snooze')}
                accessibilityRole="button"
                accessibilityLabel={SNOOZE_ACTION.label}
                accessibilityHint={SNOOZE_ACTION.hint}
                testID="reminder-snooze-action"
              >
                <Ionicons name="time-outline" size={16} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                <View style={styles.suppressionLabels}>
                  <Text style={[styles.actionText, styles.actionTextOutline]}>{SNOOZE_ACTION.label}</Text>
                  <Text style={styles.suppressionSupport}>{SNOOZE_ACTION.support}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suppressionButton, styles.dismissButton]}
                onPress={() => setSuppressionStep('dismiss')}
                accessibilityRole="button"
                accessibilityLabel={DISMISS_ACTION.label}
                accessibilityHint={DISMISS_ACTION.hint}
                testID="reminder-dismiss-action"
              >
                <Ionicons name="eye-off-outline" size={16} color={semantic.urgentText} accessibilityElementsHidden importantForAccessibility="no" />
                <View style={styles.suppressionLabels}>
                  <Text style={[styles.actionText, styles.actionTextDestructive]}>{DISMISS_ACTION.label}</Text>
                  <Text style={styles.suppressionSupport}>{DISMISS_ACTION.support}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : null}

          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        </View>
      </View>
    </SectionCard>
  );
}
