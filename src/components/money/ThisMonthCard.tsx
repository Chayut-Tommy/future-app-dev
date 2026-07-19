import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { MonthToDateActivity } from '../../lib/calculations/monthlySummary';
import { computeCreditCardBalanceTotal } from '../../lib/calculations/creditHealth';

function formatMoney(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`;
}

// Same finite-guard as computeCreditCardBalanceTotal, applied to the other
// per-row figures on this card (income/cash/credit-card/other spend) so no
// row can ever render NaN/Infinity/undefined.
function sanitizeBalance(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * "This Month" — a factual, calendar-month recorded-activity summary (PRD
 * ask, Finding #40) that complements Available Until Payday rather than
 * altering it. Available Until Payday answers "how much included cash is
 * estimated to remain until payday"; this answers "what have I actually
 * recorded this calendar month" — including how much of that recorded
 * spending was funded by credit card, which Available Until Payday
 * deliberately does not subtract (a card purchase doesn't reduce included
 * cash at purchase time — see cashVariableSpendSoFar in safeToSpend.ts).
 * These are related but genuinely different questions and must not be
 * merged into one number (PRD ask).
 *
 * Every row reuses computeMonthToDateActivity — the exact same source
 * Spending Tracker, Monthly Snapshot (Today), and Navilo Score already
 * read — never a parallel monthly-activity calculation. The one addition
 * this round is the payment-source breakdown (cashSpend/creditCardSpend/
 * otherSpend), computed additively in that same function.
 *
 * Rounding rule (PRD ask, regression-protection review): each funding-source
 * row (Cash, Credit card, Other) is rounded INDEPENDENTLY — never as a
 * balancing plug. A funding-source row is a factual activity total, unlike
 * "Unallocated" in Typical Monthly Allocation, and must never be nudged by
 * $1 merely to force a match against an independently-rounded raw total.
 * "Spending recorded" is instead DERIVED as the sum of the three already-
 * rounded source rows (`displayedCash + displayedCreditCard +
 * displayedOther`) — Option B from the review: the headline may differ by
 * up to a rounding dollar from independently rounding the raw total, but
 * every visible row, including the headline, is now exact and truthful by
 * construction. No cents are shown (Option A rejected — would be the only
 * cents-formatted card in an otherwise whole-dollar app).
 */
export function ThisMonthCard({
  activity,
  creditCardBalance,
  hasCreditCards,
  monthStart,
  today,
  onPress,
  onAddTransaction,
}: {
  activity: MonthToDateActivity;
  creditCardBalance: number;
  hasCreditCards: boolean;
  monthStart: Date;
  today: Date;
  onPress: () => void;
  onAddTransaction: () => void;
}) {
  const { colors, spacing, typography, radius } = useTheme();

  const hasActivity = activity.income > 0 || activity.spend > 0;

  const displayedIncome = Math.round(sanitizeBalance(activity.income));
  const displayedCash = Math.round(sanitizeBalance(activity.cashSpend));
  const displayedCreditCard = Math.round(sanitizeBalance(activity.creditCardSpend));
  const displayedOther = Math.round(sanitizeBalance(activity.otherSpend));
  // Derived, not independently rounded — see rounding-rule doc comment above.
  const displayedSpend = displayedCash + displayedCreditCard + displayedOther;

  // Sign-aware: a negative total means the user's cards are collectively in
  // credit (they've overpaid) — real, factual information, never silently
  // forced to $0 or shown as a misleading positive via Math.abs (PRD ask).
  // `< 0` (not `<= 0`) deliberately excludes -0 from the "in credit" branch,
  // the same negative-zero lesson from the +$0 timeline fix earlier this
  // pass — -0 renders as a plain "$0", never "-$0".
  const sanitizedCreditCardBalance = sanitizeBalance(creditCardBalance);
  const cardsInCredit = sanitizedCreditCardBalance < 0;
  const displayedBalance = Math.round(Math.abs(sanitizedCreditCardBalance));

  const monthLabel = `${monthStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} to today`;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
        rowLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary },
        rowValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        rowValuePositive: { color: colors.success },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
        balanceLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.sm },
        addButton: {
          alignSelf: 'flex-start',
          backgroundColor: colors.accentSoft,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
        },
        addButtonText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        disclaimer: { ...typography.micro, fontSize: 10, color: colors.textMuted, marginTop: spacing.sm },
      }),
    [colors, spacing, typography, radius]
  );

  // The empty state renders its own single "Add transaction" touchable and
  // is NOT itself wrapped in an outer tappable card — nesting a touchable
  // inside a whole-card touchable is exactly the ambiguous-tap-target
  // pattern avoided elsewhere in this file (Spending Tracker). Once there's
  // real activity to review, the whole card becomes the single tap target
  // to Transaction History instead, with no touchables nested inside it —
  // tapping the info icon (owned by MoneyScreen.tsx's section header, not
  // this component) is a sibling control, never a descendant of this
  // TouchableOpacity, so it can never also trigger navigation.
  if (!hasActivity) {
    return (
      <SectionCard>
        <Text style={styles.title}>This Month</Text>
        <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>
        <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAddTransaction} accessibilityRole="button" accessibilityLabel="Add transaction">
          <Text style={styles.addButtonText}>Add transaction</Text>
        </TouchableOpacity>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel="This Month, view all transactions">
        <Text style={styles.title}>This Month</Text>
        <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Income recorded</Text>
          <Text style={[styles.rowValue, styles.rowValuePositive]} accessibilityLabel={`Income recorded ${formatMoney(displayedIncome)}`}>
            {formatMoney(displayedIncome)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Spending recorded</Text>
          <Text style={styles.rowValue} accessibilityLabel={`Spending recorded ${formatMoney(displayedSpend)}`}>
            {formatMoney(displayedSpend)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Paid from cash / savings</Text>
          <Text style={styles.rowValue}>{formatMoney(displayedCash)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Paid by credit card</Text>
          <Text style={styles.rowValue}>{formatMoney(displayedCreditCard)}</Text>
        </View>
        {displayedOther > 0 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Other funding</Text>
            <Text style={styles.rowValue}>{formatMoney(displayedOther)}</Text>
          </View>
        ) : null}

        {hasCreditCards ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View>
                <Text style={styles.rowLabel}>Current credit-card balance</Text>
                <Text style={styles.balanceLabel}>{cardsInCredit ? 'Your cards are currently in credit' : "A snapshot, not this month's spending"}</Text>
              </View>
              <Text style={styles.rowValue}>
                {cardsInCredit ? '-' : ''}
                {formatMoney(displayedBalance)}
              </Text>
            </View>
          </>
        ) : null}

        <Text style={styles.disclaimer}>Based on transactions recorded in Navilo.</Text>
      </TouchableOpacity>
    </SectionCard>
  );
}
