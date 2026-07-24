import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendResult } from '../../lib/calculations/safeToSpend';
import { InfoSheet } from '../shared/InfoSheet';
import { MoneyHeroCopy } from '../../lib/calculations/moneyPersona';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function BreakdownRow({ label, value, isTotal }: { label: string; value: string; isTotal?: boolean }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderTopWidth: isTotal ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.border,
        marginTop: isTotal ? spacing.xs : 0,
      }}
    >
      <Text style={{ ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: isTotal ? '700' : '400' }}>{label}</Text>
      <Text style={{ ...typography.heading, fontSize: 14, color: colors.textPrimary, fontWeight: isTotal ? '700' : '600' }}>{value}</Text>
    </View>
  );
}

/**
 * "Available Until Payday" — Money tab's hero feature (PRD ask, §4: renamed
 * from "Safe to Spend," which reads as a guarantee or a recommendation
 * rather than what it actually is — an estimate). Three things make it
 * trustworthy: a full "how this was calculated" breakdown on tap,
 * priority-aware multi-goal math (never silently ignores a goal, and
 * explains rather than pretends when goals don't fit the budget), and
 * same-day reactivity to spending. Never a known payday? Never a daily
 * figure invented to match — irregular income gets an honest cash-runway
 * estimate instead (PRD ask, §4).
 */
export function SafeToSpendHero({
  safeToSpend,
  hasActiveGoals,
  onCreateGoal,
  onAddPayday,
  onSelectBalances,
  heroCopy,
}: {
  safeToSpend: SafeToSpendResult;
  hasActiveGoals: boolean;
  onCreateGoal: () => void;
  onAddPayday?: () => void;
  /** Opens the flow to add or include a cash/savings balance — the action
   * for the "no recurring income, no included balance" empty state (PRD
   * ask, §Adaptive hero State 4). */
  onSelectBalances?: () => void;
  /** Persona-appropriate labels (Employee/Freelancer/Retiree/Investor/
   * Business owner) wrapping this exact same calculation — never changes
   * a number, only which words describe it (PRD ask, §3/§12). */
  heroCopy: MoneyHeroCopy;
}) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const [breakdownVisible, setBreakdownVisible] = useState(false);

  // Available Until Payday's negative-cycle states are genuinely different
  // situations that must not share one "you overspent" message (PRD ask,
  // §Financial state review — a missing/no-balance state is a data-
  // completeness issue, a real recorded-spending overrun is genuine
  // overspending, and forward-looking commitments simply exceeding what's
  // currently held is neither of those — it's the ordinary reality of a
  // cycle whose income hasn't arrived yet, not a warning sign). Precedence,
  // highest first: missing balance -> recorded overspend -> commitments
  // exceed cash -> normal. Missing balance is checked first because the
  // other two comparisons are unreliable without knowing what cash is even
  // being compared against — PRD bug report: with $0 recorded spending and
  // no included balance, the hero was reading "Recorded spending is
  // currently higher than planned," which recorded spending had nothing to
  // do with.
  const hasNegativeCycle = safeToSpend.hasKnownPayday && safeToSpend.dailyAllowance < 0;
  // A missing balance is a data-completeness problem, not a financial one —
  // distinguished from "a balance is selected but its value happens to be
  // low or $0" by whether any account is actually included at all
  // (includedMoneyBalanceAccounts.length), never by the numeric total alone
  // (PRD bug report: a selected $0 transaction account was misread as "no
  // balance selected," pointing the user at a CTA that couldn't fix
  // anything, since a balance was already selected).
  const missingBalance = hasNegativeCycle && safeToSpend.includedMoneyBalanceAccounts.length === 0;
  // Genuine recorded overspend: reconstruct what cycleRemainingPool would
  // have been without this cycle's recorded variable spending, by adding it
  // back — spending already reduced includedMoneyBalance dollar-for-dollar,
  // so this is the actual pre-spend position, not an approximation (PRD ask:
  // prove the condition rather than assume it; deliberately not
  // cycleDiscretionaryPool, which is a separate expected-income-rate budget
  // for Lulu Score's Spending Control factor and can diverge arbitrarily
  // from the balance-based cycleRemainingPool this hero actually shows).
  // Uses cashVariableSpendSoFar, not spendSoFarThisCycle — the latter
  // includes credit-card/loan/other-funded spending, which never actually
  // reduced includedMoneyBalance, and adding it back would over-credit the
  // reconstruction (PRD bug report: a commitments-only shortfall with some
  // credit-card spending recorded was misclassified as a recorded-spending
  // overrun, since none of that spending ever touched the cash balance this
  // hero is measuring). Only genuine overspend when the cycle would
  // otherwise have been non-negative — i.e. recorded spending is
  // demonstrably the entire cause, not one factor alongside bills/savings/
  // goals already exceeding cash on their own. This guarantees $0
  // cash-impacting spend can never trigger this state (pre-spend then
  // equals post-spend, so a negative post-spend implies a negative pre-spend
  // too), and a shortfall caused purely by commitments — or entirely by
  // non-cash spending — is never blamed on cash spending that didn't happen.
  const cycleRemainingPoolBeforeSpending = safeToSpend.cycleRemainingPool + safeToSpend.cashVariableSpendSoFar;
  const hasRecordedOverspend =
    hasNegativeCycle &&
    !missingBalance &&
    safeToSpend.cashVariableSpendSoFar > 0 &&
    cycleRemainingPoolBeforeSpending >= 0;
  // The portion attributable to spending, not the entire negative balance —
  // since the pre-spend position was non-negative, the shortfall itself is
  // exactly what spending is responsible for.
  const recordedOverspendAmount = -safeToSpend.cycleRemainingPool;
  // Everything else that keeps the cycle negative: bills, Savings
  // Allocation and/or goal contributions due before payday simply exceed
  // the balance currently included — not spending, not missing data.
  const commitmentsExceedCash = hasNegativeCycle && !missingBalance && !hasRecordedOverspend;

  const { goalAllocation } = safeToSpend;
  const hasGoalReservation = safeToSpend.goalContributionsMonthly > 0;
  const goalsUnderfunded = goalAllocation.allocations.length > 0 && !goalAllocation.isFullyFunded;
  const overToday = safeToSpend.todaysSpend - safeToSpend.plannedDailyAllowance;
  const showTodayReaction = safeToSpend.hasKnownPayday && safeToSpend.todaysSpend > 0 && overToday > 1;
  const fundedGoals = goalAllocation.allocations.filter((a) => a.isFullyFunded);
  const topFundedGoal = fundedGoals[0];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg, alignItems: 'center', ...glow(colors.accent) },
        cardWarning: { backgroundColor: colors.warningSoft },
        labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
        label: { ...typography.micro, fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: 0.5 },
        labelWarning: { color: colors.warning },
        infoButton: { padding: 2 },
        line: { ...typography.body, fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
        lineWarning: { color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
        value: { ...typography.title, fontSize: 40, color: colors.onNavy, marginVertical: 2 },
        explainer: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: spacing.sm, lineHeight: 17 },
        reactionBox: {
          marginTop: spacing.md,
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderRadius: radius.control,
          padding: spacing.sm,
          alignSelf: 'stretch',
        },
        reactionText: { ...typography.caption, fontSize: 12, color: '#fff', textAlign: 'center', lineHeight: 17 },
        ctaButton: {
          marginTop: spacing.md,
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: radius.pill,
          paddingVertical: 9,
          paddingHorizontal: spacing.lg,
        },
        ctaText: { ...typography.caption, fontSize: 13, color: '#fff', fontWeight: '700' },
        warningCtaButton: {
          marginTop: spacing.md,
          backgroundColor: colors.warning,
          borderRadius: radius.pill,
          paddingVertical: 9,
          paddingHorizontal: spacing.lg,
        },
        warningCtaText: { ...typography.caption, fontSize: 13, color: '#fff', fontWeight: '700' },
        breakdownFooter: { ...typography.micro, fontSize: 11, color: colors.textMuted, lineHeight: 15, marginTop: spacing.md },
        // Stacked, single-column presentation for the daily-estimate row
        // specifically (Stream A follow-up §2) — replaces the generic
        // two-column BreakdownRow only here, since that row's dynamic label
        // ("...(N days left)") plus a wide value ("$99,999/day") can exceed
        // the sheet's fixed width with no shrink/wrap allowed by default.
        // Every other BreakdownRow usage in this file is untouched.
        dailyEstimateBlock: {
          paddingVertical: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          marginTop: spacing.xs,
        },
        dailyEstimateLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700' },
        dailyEstimateValue: { ...typography.title, fontSize: 22, color: colors.textPrimary, fontWeight: '700', marginTop: 2 },
        dailyEstimateContext: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, radius, spacing, typography, glow]
  );

  const breakdown = (
    <InfoSheet
      visible={breakdownVisible}
      onClose={() => setBreakdownVisible(false)}
      title="How this was calculated"
      subtitle="Every line below is based on the information entered — an estimate, not a guarantee."
    >
      <BreakdownRow label="Current cycle start" value={safeToSpend.cycleStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
      <BreakdownRow
        label="Next expected payday"
        value={safeToSpend.hasKnownPayday ? safeToSpend.cycleEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Not set'}
      />
      <BreakdownRow label="Balances included" value={formatMoney(safeToSpend.includedMoneyBalance)} />
      {safeToSpend.includedMoneyBalanceAccounts.map((account) => (
        <BreakdownRow key={account.id} label={`— ${account.label}`} value={formatMoney(account.value)} />
      ))}
      <BreakdownRow label="Bills due before that date" value={`-${formatMoney(safeToSpend.cycleBillsExpected)}`} />
      <BreakdownRow label="Goal allocations (this cycle's share)" value={`-${formatMoney(safeToSpend.cycleGoalsReserved)}`} />
      <BreakdownRow
        label="Savings allocation (this cycle's share)"
        value={safeToSpend.cycleSavingsReserved > 0 ? `-${formatMoney(safeToSpend.cycleSavingsReserved)}` : 'Not set'}
      />
      <BreakdownRow label="Estimated remainder" value={formatMoney(Math.max(0, safeToSpend.cycleRemainingPool))} isTotal />
      {safeToSpend.hasKnownPayday ? (
        <View style={styles.dailyEstimateBlock}>
          <Text style={styles.dailyEstimateLabel}>Estimated daily amount</Text>
          <Text style={styles.dailyEstimateValue}>{formatMoney(Math.max(0, safeToSpend.dailyAllowance))}/day</Text>
          <Text style={styles.dailyEstimateContext}>
            {safeToSpend.daysRemaining} day{safeToSpend.daysRemaining === 1 ? '' : 's'} remaining
          </Text>
        </View>
      ) : null}
      <Text style={styles.breakdownFooter}>
        This estimate updates automatically whenever your income, bills, or spending change. Educational only — not personal financial
        advice.
      </Text>
    </InfoSheet>
  );

  // No known payday: never invent one, and never derive an artificial
  // planning horizon (e.g. "days of runway" from a spend rate) to stand in
  // for it (PRD ask, §Adaptive hero). Two honest states instead: show the
  // balances the user has actually included (State 2), or ask them to pick
  // one if none are included yet (State 4).
  if (!safeToSpend.hasKnownPayday) {
    const hasIncludedBalance = safeToSpend.includedMoneyBalance > 0;
    return (
      <>
        <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>💰 AVAILABLE MONEY</Text>
          </View>
          {hasIncludedBalance ? (
            <>
              <Text style={styles.line}>Based on the balances you selected.</Text>
              <Text style={styles.value}>{formatMoney(safeToSpend.includedMoneyBalance)}</Text>
              {safeToSpend.includedMoneyBalanceAccounts.length > 0 ? (
                <Text style={styles.explainer}>
                  {safeToSpend.includedMoneyBalanceAccounts.map((a) => `${a.label} (${formatMoney(a.value)})`).join(', ')}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.line}>Choose a balance to estimate your available money</Text>
              <Text style={styles.explainer}>Add or select a cash balance that Navilo can use for short-term money calculations.</Text>
            </>
          )}
          {!hasIncludedBalance && onSelectBalances ? (
            <TouchableOpacity style={styles.ctaButton} onPress={onSelectBalances}>
              <Text style={styles.ctaText}>Select balances</Text>
            </TouchableOpacity>
          ) : null}
          {onAddPayday ? (
            <TouchableOpacity style={styles.ctaButton} onPress={onAddPayday}>
              <Text style={styles.ctaText}>Add an expected payday</Text>
            </TouchableOpacity>
          ) : null}
        </LinearGradient>
      </>
    );
  }

  // State A — no meaningful balance included: a missing-input problem, not
  // a financial warning. Bills/savings/goals can't be meaningfully compared
  // against "available cash" until the user has told Navilo which balance
  // that is (PRD ask).
  if (missingBalance) {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {heroCopy.eyebrowScheduled.toUpperCase()}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            </TouchableOpacity>
          </View>
          <Text style={styles.lineWarning}>
            Select a balance for Navilo to use in your short-term money estimate — bills, savings and goals can't be compared against
            your available cash until then.
          </Text>
          {onSelectBalances ? (
            <TouchableOpacity style={styles.warningCtaButton} onPress={onSelectBalances}>
              <Text style={styles.warningCtaText}>Select balances</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {breakdown}
      </>
    );
  }

  // State C — a genuine recorded-spending overrun: what's actually been
  // logged this cycle exceeds the cycle's own budget, independent of the
  // included balance.
  if (hasRecordedOverspend) {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {heroCopy.eyebrowScheduled.toUpperCase()}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            </TouchableOpacity>
          </View>
          <Text style={styles.lineWarning}>
            Recorded spending is currently about {formatMoney(recordedOverspendAmount)} ahead of the estimated amount for this cycle.
          </Text>
        </View>
        {breakdown}
      </>
    );
  }

  // State B — planned commitments (bills, Savings Allocation, goals)
  // currently exceed the balance included in this estimate. This is not
  // overspending and not a missing-input problem — it's the ordinary
  // reality of a cycle whose income hasn't arrived yet (PRD ask: must not
  // imply money has moved or that the user did anything wrong).
  if (commitmentsExceedCash) {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {heroCopy.eyebrowScheduled.toUpperCase()}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            </TouchableOpacity>
          </View>
          <Text style={styles.lineWarning}>
            Your planned bills, savings and goals are currently about {formatMoney(Math.abs(safeToSpend.cycleRemainingPool))} above the
            balance included in this estimate.
          </Text>
        </View>
        {breakdown}
      </>
    );
  }

  // Goals exist and need more than what's actually available — explain
  // rather than pretend they're on track (PRD ask).
  if (goalsUnderfunded) {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {heroCopy.eyebrowScheduled.toUpperCase()}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            </TouchableOpacity>
          </View>
          <Text style={styles.lineWarning}>
            Your goals would need {formatMoney(goalAllocation.totalRequiredMonthly)}/month but only{' '}
            {formatMoney(goalAllocation.availableForGoals)} is currently available. Explore adjusting the timeline or contribution.
          </Text>
        </View>
        {breakdown}
      </>
    );
  }

  return (
    <>
      <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>💰 {heroCopy.eyebrowScheduled.toUpperCase()}</Text>
          <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.line}>{heroCopy.amountLabel}</Text>
        <Text style={styles.value}>{formatMoney(Math.max(0, safeToSpend.cycleRemainingPool))}</Text>
        <Text style={styles.line}>
          ≈ {formatMoney(Math.max(0, safeToSpend.dailyAllowance))}/day for the next {safeToSpend.daysRemaining} day
          {safeToSpend.daysRemaining === 1 ? '' : 's'}
        </Text>
        {!hasGoalReservation ? (
          !hasActiveGoals ? (
            <TouchableOpacity style={styles.ctaButton} onPress={onCreateGoal}>
              <Text style={styles.ctaText}>Create a goal to plan ahead</Text>
            </TouchableOpacity>
          ) : null
        ) : topFundedGoal ? (
          <Text style={styles.explainer}>
            {fundedGoals.length > 1
              ? `Based on the assumptions entered, ${formatMoney(goalAllocation.totalAllocatedMonthly)}/month is allocated across ${fundedGoals.length} goals, including "${topFundedGoal.goal.name}".`
              : `Based on the assumptions entered, ${formatMoney(topFundedGoal.allocatedMonthly)}/month is allocated toward "${topFundedGoal.goal.name}"${
                  topFundedGoal.goal.targetDate
                    ? ` (target: ${new Date(topFundedGoal.goal.targetDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})`
                    : ''
                }.`}
          </Text>
        ) : null}
        {showTodayReaction ? (
          <View style={styles.reactionBox}>
            <Text style={styles.reactionText}>
              {formatMoney(safeToSpend.todaysSpend)} recorded today — {formatMoney(overToday)} above today's estimated plan. The
              remaining daily estimate has been adjusted to {formatMoney(Math.max(0, safeToSpend.dailyAllowance))}/day.
            </Text>
          </View>
        ) : null}
      </LinearGradient>
      {breakdown}
    </>
  );
}
