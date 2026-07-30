import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeTopReminder } from '../../lib/calculations/reminders';
import { AddCreditCardModal } from '../credit/AddCreditCardModal';
import { moneyAmountToCents } from '../../lib/calculations/money';

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
 * Session-scoped dismissal only (resets on next app open) — there's no
 * persisted "seen" list, so this intentionally stays lightweight rather
 * than growing a parallel notification-history feature.
 *
 * Confirmation itself is delegated to AppStateContext's
 * confirmRecurringOccurrence — the combined B2.0B transition (transaction +
 * B1 balance effect + schedule advancement, one committed state).
 * `isSubmitting` here is presentation-level defence only (disables the
 * buttons for the duration of a call) — the actual correctness guarantee
 * against duplicate confirmation lives in that action's dataRef/
 * latest-nextDueDate eligibility check, not in this component
 * (regression-protection review, B2.0B §5).
 */
export function SmartReminderCard() {
  const { data, confirmRecurringOccurrence } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography } = useTheme();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [awaitingSource, setAwaitingSource] = useState(false);
  const [markPaidCardVisible, setMarkPaidCardVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reminder = useMemo(() => {
    const top = computeTopReminder(data);
    return top && !dismissedIds.has(top.id) ? top : null;
  }, [data, dismissedIds]);

  // Both are scoped to one specific reminder — if the displayed reminder
  // identity changes (resolved elsewhere, superseded, or this card moved
  // on to a different one), a stale error or a stuck "submitting" state
  // from a previous reminder must never linger.
  useEffect(() => {
    setActionError(null);
    setIsSubmitting(false);
  }, [reminder?.id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
        iconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        actionRow: { flexDirection: 'row', gap: spacing.sm },
        actionButton: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.accent },
        actionButtonSecondary: { backgroundColor: colors.surfaceMuted },
        actionButtonDisabled: { opacity: 0.5 },
        actionText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
        actionTextSecondary: { color: colors.textSecondary },
        errorText: { ...typography.caption, fontSize: 12, color: colors.warning, lineHeight: 16, marginTop: spacing.sm },
      }),
    [colors, radius, spacing, typography]
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

  function dismiss() {
    if (!reminder) return;
    setDismissedIds((prev) => new Set(prev).add(reminder.id));
    setAwaitingSource(false);
    setActionError(null);
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
    reason: 'not_found' | 'stale' | 'invalid_date' | 'invalid_amount' | 'invalid_input' | 'invalid_source' | 'balance_target_missing'
  ): string {
    switch (reason) {
      case 'invalid_amount':
        return 'This saved amount needs to be updated to no more than 2 decimal places. Open Money, edit the income or bill amount, then try again.';
      case 'invalid_source':
      case 'balance_target_missing':
        return "We couldn't update that yet. Check the payment account and try again.";
      case 'invalid_date':
      case 'invalid_input':
        return "We couldn't update that yet. Please try again.";
      case 'not_found':
      case 'stale':
        // Unreachable here — both are handled via dismiss() below before
        // this is ever called. Included so the switch stays exhaustive
        // over the full reason union rather than assuming a subset.
        return "We couldn't update that yet. Please try again.";
    }
  }

  function runConfirmation(paymentSource?: 'cash' | 'credit_card') {
    if (!reminder || !reminder.recurringItemId) return;
    setActionError(null);
    // Left `true` on the applied/stale/not_found path deliberately — dismiss()
    // below changes which reminder (if any) is displayed, and the identity-
    // change effect resets isSubmitting there. Resetting it here too would
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
    // longer select it on the very next render regardless of dismiss() —
    // this card cannot reliably stay the right context for a later
    // persistence-failure message (regression-protection review, B2.0C
    // corrected design §3). A save failure is surfaced by the app-level
    // UnsavedChangesBanner (App.tsx), driven by AppStateContext's
    // persistenceState, not by this component.
    const { transition } = confirmRecurringOccurrence({
      recurringItemId: reminder.recurringItemId,
      expectedNextDueDate: item?.nextDueDate ?? '',
      paymentSource,
    });

    if (transition.applied || transition.reason === 'stale' || transition.reason === 'not_found') {
      dismiss();
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

  function confirmSalary() {
    runConfirmation(undefined);
  }

  function confirmBillPaid(source: 'cash' | 'credit_card') {
    runConfirmation(source);
  }

  const icon = reminder.kind === 'salary_check' ? 'cash-outline' : reminder.kind === 'card_due_soon' ? 'card-outline' : 'calendar-outline';
  const reminderCard = reminder.creditCardId ? data.creditCards.find((c) => c.id === reminder.creditCardId) ?? null : null;

  return (
    <SectionCard>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={16} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{reminder.title}</Text>
          <Text style={styles.body}>{reminder.body}</Text>

          {reminder.kind === 'salary_check' ? (
            <>
              {/* Coaching-not-shaming transparency: what pressing the button
                  actually does, before the user presses it — never implies
                  Navilo independently verified the payment arrived (PRD ask,
                  post-device-testing correction). Plain Text, so it's in the
                  natural screen-reader reading order ahead of the buttons;
                  no numberOfLines, so it wraps cleanly on narrow screens.
                  Suppressed (never a rounded/fabricated figure) when the
                  amount doesn't pass moneyAmountToCents — see
                  disclosedAmount above. */}
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Confirming will record ${formatDisclosureAmount(disclosedAmount.cents)} as income and add it to your Cash balance in Navilo. This updates Navilo only—it does not move money in your bank.`}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
                  onPress={confirmSalary}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionText}>Yes, it arrived</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss} disabled={isSubmitting}>
                  <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {reminder.kind === 'bill_overdue' && !awaitingSource ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => setAwaitingSource(true)}>
                <Text style={styles.actionText}>Yes, I paid it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss}>
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {reminder.kind === 'bill_overdue' && awaitingSource ? (
            <>
              {/* Same transparency treatment as the income branch above —
                  shown before the payment-source choice, since that choice
                  is what determines whether Cash or the credit card is
                  updated (PRD ask, post-device-testing correction). Same
                  moneyAmountToCents guard as the income branch. */}
              {disclosedAmount.valid ? (
                <Text style={styles.body}>
                  {`Confirming will record ${formatDisclosureAmount(disclosedAmount.cents)} as an expense and update your Cash or credit-card balance in Navilo based on your choice. This updates Navilo only—it does not move money in your bank.`}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
                  onPress={() => confirmBillPaid('cash')}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionText}>From cash</Text>
                </TouchableOpacity>
                {data.creditCards.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary, isSubmitting ? styles.actionButtonDisabled : null]}
                    onPress={() => confirmBillPaid('credit_card')}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.actionText, styles.actionTextSecondary]}>From credit card</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : null}

          {reminder.kind === 'bill_due_soon' ? (
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss}>
              <Text style={[styles.actionText, styles.actionTextSecondary]}>Got it</Text>
            </TouchableOpacity>
          ) : null}

          {reminder.kind === 'card_due_soon' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Cards')}>
                <Text style={styles.actionText}>Review card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => (reminderCard ? setMarkPaidCardVisible(true) : dismiss())}
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Mark as paid</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {actionError ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {actionError}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Never assumes the balance is cleared automatically — opens the
          card's own edit form so the user confirms the real new balance
          (PRD ask: never assume money moved without confirming first). */}
      <AddCreditCardModal
        visible={markPaidCardVisible}
        editCard={reminderCard}
        onClose={() => {
          setMarkPaidCardVisible(false);
          dismiss();
        }}
      />
    </SectionCard>
  );
}
