import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendResult } from '../../lib/calculations/safeToSpend';
import { InfoSheet } from '../shared/InfoSheet';
import { MoneyHeroCopy, cashRunwayStatus, CASH_RUNWAY_STATUS_LABEL } from '../../lib/calculations/moneyPersona';

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
  monthlyIncome,
  hasActiveGoals,
  onCreateGoal,
  onAddPayday,
  heroCopy,
}: {
  safeToSpend: SafeToSpendResult;
  monthlyIncome: number;
  hasActiveGoals: boolean;
  onCreateGoal: () => void;
  onAddPayday?: () => void;
  /** Persona-appropriate labels (Employee/Freelancer/Retiree/Investor/
   * Business owner) wrapping this exact same calculation — never changes
   * a number, only which words describe it (PRD ask, §3/§12). */
  heroCopy: MoneyHeroCopy;
}) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const overspent = safeToSpend.hasKnownPayday && safeToSpend.dailyAllowance < 0;
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
        statusChip: {
          alignSelf: 'center',
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: radius.pill,
          paddingVertical: 4,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.xs,
        },
        statusChipText: { ...typography.micro, fontSize: 11, color: '#fff', fontWeight: '700' },
        breakdownFooter: { ...typography.micro, fontSize: 11, color: colors.textMuted, lineHeight: 15, marginTop: spacing.md },
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
      <BreakdownRow label="Income included" value={`+${formatMoney(monthlyIncome)}`} />
      <BreakdownRow label="Bills due before that date" value={`-${formatMoney(safeToSpend.fixedExpensesMonthly)}`} />
      <BreakdownRow label="Spending recorded this cycle" value={`-${formatMoney(safeToSpend.spendSoFarThisCycle)}`} />
      <BreakdownRow label="Goal allocations" value={`-${formatMoney(safeToSpend.goalContributionsMonthly)}`} />
      <BreakdownRow label="Navilo Savings Plan allocation" value={`-${formatMoney(safeToSpend.defaultSavingsBuffer)}`} />
      <BreakdownRow label="Estimated remainder" value={formatMoney(Math.max(0, safeToSpend.remainingPool))} isTotal />
      {safeToSpend.hasKnownPayday ? (
        <BreakdownRow
          label={`Estimated amount per remaining day (${safeToSpend.daysRemaining} days left)`}
          value={`${formatMoney(Math.max(0, safeToSpend.dailyAllowance))}/day`}
          isTotal
        />
      ) : null}
      <Text style={styles.breakdownFooter}>
        This estimate updates automatically whenever your income, bills, or spending change. Educational only — not personal financial
        advice.
      </Text>
    </InfoSheet>
  );

  // No known payday: never invent one. Irregular income gets an honest
  // cash-runway estimate; anything else just asks for a date (PRD ask, §4).
  if (!safeToSpend.hasKnownPayday) {
    return (
      <>
        <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>💰 {heroCopy.eyebrowRunway.toUpperCase()}</Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
          {safeToSpend.cashRunwayDays !== null ? (
            <>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>{CASH_RUNWAY_STATUS_LABEL[cashRunwayStatus(safeToSpend.cashRunwayDays)]}</Text>
              </View>
              <Text style={styles.value}>{safeToSpend.cashRunwayDays} days</Text>
              <Text style={styles.line}>
                Approximately {Math.max(1, Math.round(safeToSpend.cashRunwayDays / 30))} month
                {Math.round(safeToSpend.cashRunwayDays / 30) === 1 ? '' : 's'} of recent spending, based on your current cash.
              </Text>
              <Text style={styles.explainer}>
                This is an estimate based on the information entered, not a prediction. {heroCopy.amountLabel}:{' '}
                {formatMoney(Math.max(0, safeToSpend.remainingPool))}.
              </Text>
            </>
          ) : (
            <Text style={styles.line}>Add an expected payday to calculate a daily estimate.</Text>
          )}
          {onAddPayday ? (
            <TouchableOpacity style={styles.ctaButton} onPress={onAddPayday}>
              <Text style={styles.ctaText}>Add an expected payday</Text>
            </TouchableOpacity>
          ) : null}
        </LinearGradient>
        {breakdown}
      </>
    );
  }

  if (overspent) {
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
            Recorded spending is currently higher than planned this cycle — about {formatMoney(Math.abs(safeToSpend.remainingPool))} over
            the estimated remainder.
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
        <Text style={styles.value}>{formatMoney(Math.max(0, safeToSpend.remainingPool))}</Text>
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
