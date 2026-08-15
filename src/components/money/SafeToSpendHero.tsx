import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendResult } from '../../lib/calculations/safeToSpend';
import { selectSafeToSpendPresentation, formatSafeToSpendAmount as formatMoney } from '../../lib/calculations/safeToSpendPresentation';
import { InfoSheet } from '../shared/InfoSheet';
import { MoneyHeroCopy } from '../../lib/calculations/moneyPersona';

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
  onReviewInWealth,
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
  /** Navigates to the Wealth tab, where the corrupted asset is visible and
   * actually editable (Pass 1 final closure, 2026-08-11). Deliberately
   * NOT the same as onSelectBalances: SelectBalancesSheet only toggles
   * whether a balance is included, it cannot edit or remove a corrupted
   * currentValue — proven via source inspection, not assumed. This is the
   * smallest existing navigation path to a surface that can actually
   * repair the value (WealthScreen's own asset row -> editAsset ->
   * AddWealthItemModal -> updateAsset), reusing plain tab navigation only,
   * not the broader Pass 2 cross-tab section-focus architecture. */
  onReviewInWealth?: () => void;
  /** Persona-appropriate labels (Employee/Freelancer/Retiree/Investor/
   * Business owner) wrapping this exact same calculation — never changes
   * a number, only which words describe it (PRD ask, §3/§12). */
  heroCopy: MoneyHeroCopy;
}) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const [breakdownVisible, setBreakdownVisible] = useState(false);

  // Available Until Payday's card states are genuinely different situations
  // that must not share one message (PRD ask, §Financial state review — a
  // missing/no-balance state is a data-completeness issue, a real
  // recorded-spending overrun is genuine overspending, forward-looking
  // commitments simply exceeding what's currently held is neither of those,
  // and invalid recorded data is a data-integrity issue distinct from all
  // of them). selectSafeToSpendPresentation (Pass 2A) wraps the same
  // selectSafeToSpendHeroState precedence order (Pass 1 closure correction,
  // 2026-08-11, unchanged) and additionally carries the exact heading/
  // amount/status-sentence text for each state — the single shared source
  // both this card and the Today Briefing read, so wording can never drift
  // between the two surfaces. This card still branches on heroState for its
  // own JSX/CTA structure; only the literal text now comes from `presentation`.
  const presentation = selectSafeToSpendPresentation(safeToSpend, heroCopy);
  const heroState = presentation.heroState;

  const { goalAllocation } = safeToSpend;
  const hasGoalReservation = safeToSpend.goalContributionsMonthly > 0;
  const overToday = safeToSpend.todaysSpend - safeToSpend.plannedDailyAllowance;
  // daysRemaining > 0 required too: with zero applicable days left,
  // plannedDailyAllowance is exactly 0 (Pass 1 closure correction), so this
  // reaction must not present that as a real "$0/day" daily adjustment.
  const showTodayReaction = safeToSpend.hasKnownPayday && safeToSpend.daysRemaining > 0 && safeToSpend.todaysSpend > 0 && overToday > 1;
  const fundedGoals = goalAllocation.allocations.filter((a) => a.isFullyFunded);
  const topFundedGoal = fundedGoals[0];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg, alignItems: 'center', ...glow(colors.accent) },
        cardWarning: { backgroundColor: colors.warningSoft },
        labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: spacing.sm },
        label: { ...typography.micro, fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: 0.5 },
        labelWarning: { color: colors.warning },
        labelRowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        infoButton: { padding: 2 },
        // Correction round, 2026-08-10 (requirement 6) — an explicit,
        // labelled control inside the card's own header row, not an
        // unexplained tap target on the card itself. Icon + text so it's
        // discoverable at a glance, not just to someone who already knows
        // an icon-only button is there; ≥44pt effective tap target via
        // hitSlop, matching the info button's own convention.
        manageBalancesButton: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 2 },
        manageBalancesText: { ...typography.micro, fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
        manageBalancesTextWarning: { color: colors.warning },
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

  // Correction round, 2026-08-10 (requirement 6) — the same "Manage
  // balances" control rendered identically in every card state, so the
  // user never has to remember which state they're in to find it. Opens
  // the existing Select Balances interface directly (never a new/
  // duplicate implementation) via the same onSelectBalances callback the
  // pre-existing empty-state CTAs already use — this control is additive
  // (those CTAs stay exactly as they were), not a replacement.
  function renderManageBalancesButton(warning?: boolean) {
    if (!onSelectBalances) return null;
    return (
      <TouchableOpacity
        style={styles.manageBalancesButton}
        onPress={onSelectBalances}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Manage balances"
        accessibilityHint="Opens the list of balances included in this estimate"
      >
        <Ionicons name="wallet-outline" size={14} color={warning ? colors.warning : 'rgba(255,255,255,0.85)'} />
        <Text style={[styles.manageBalancesText, warning ? styles.manageBalancesTextWarning : null]}>Manage balances</Text>
      </TouchableOpacity>
    );
  }

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
      {safeToSpend.hasKnownPayday && safeToSpend.daysRemaining > 0 ? (
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

  // Invalid recorded BALANCE data (Pass 1 closure correction, 2026-08-11):
  // at least one participating balance is NaN/Infinity/-Infinity — never
  // the same as "no balance selected" or a legitimate $0. Checked before
  // every other state, including "no known payday," since corrupted data
  // makes any comparison against it meaningless regardless of payday
  // status. Smallest possible neutral-error variant of the existing
  // warning card — no new card type, no breakdown sheet (it would only
  // recompute the same unreliable numbers), no daily-guide-style content.
  // Uses onReviewInWealth, NOT renderManageBalancesButton (Pass 1 final
  // closure, 2026-08-11) — SelectBalancesSheet (opened by
  // renderManageBalancesButton) only toggles whether a balance is
  // included; it has no field to edit or remove a corrupted currentValue,
  // proven via source inspection. "Review in Wealth" is the smallest
  // existing navigation path to a surface that can actually repair it.
  if (heroState === 'unavailable_balance_data') {
    return (
      <View style={[styles.card, styles.cardWarning]}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
        </View>
        <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
        {presentation.supportingCopy ? <Text style={styles.lineWarning}>{presentation.supportingCopy}</Text> : null}
        {onReviewInWealth ? (
          <TouchableOpacity style={styles.warningCtaButton} onPress={onReviewInWealth}>
            <Text style={styles.warningCtaText}>Review in Wealth</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // Invalid recorded data from a source OTHER than a balance (a bill,
  // transaction, or other financial-calculation input) — Pass 1 closure
  // correction, 2026-08-11. Deliberately does NOT render
  // renderManageBalancesButton: Manage Balances only controls balance
  // inclusion, and the actual corrupted record here is not a balance, so
  // offering that action would point the user at the wrong place to fix
  // it. No accurate existing repair destination is currently identifiable
  // from this card alone (SafeToSpendResult does not expose which specific
  // bill/transaction is invalid) — neutral wording only, no action.
  if (heroState === 'unavailable_other_data') {
    return (
      <View style={[styles.card, styles.cardWarning]}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
        </View>
        <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
        {presentation.supportingCopy ? <Text style={styles.lineWarning}>{presentation.supportingCopy}</Text> : null}
      </View>
    );
  }

  // No known payday: never invent one, and never derive an artificial
  // planning horizon (e.g. "days of runway" from a spend rate) to stand in
  // for it (PRD ask, §Adaptive hero). Two honest states instead: show the
  // balances the user has actually included (State 2), or ask them to pick
  // one if none are included yet (State 4).
  if (heroState === 'no_known_payday') {
    const hasIncludedBalance = safeToSpend.includedMoneyBalance > 0;
    return (
      <>
        <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>💰 {presentation.heading}</Text>
            <View style={styles.labelRowActions}>{renderManageBalancesButton()}</View>
          </View>
          {hasIncludedBalance ? (
            <>
              <Text style={styles.line}>{presentation.primaryCopy}</Text>
              {presentation.amountVisible ? <Text style={styles.value}>{presentation.displayAmount}</Text> : null}
              {safeToSpend.includedMoneyBalanceAccounts.length > 0 ? (
                <Text style={styles.explainer}>
                  {safeToSpend.includedMoneyBalanceAccounts.map((a) => `${a.label} (${formatMoney(a.value)})`).join(', ')}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.line}>{presentation.primaryCopy}</Text>
              <Text style={styles.explainer}>Add or select a money balance that Nolie can use for short-term money calculations.</Text>
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
  if (heroState === 'missing_balance') {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
            <View style={styles.labelRowActions}>
              {renderManageBalancesButton(true)}
              <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
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
  if (heroState === 'recorded_overspend') {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
            <View style={styles.labelRowActions}>
              {renderManageBalancesButton(true)}
              <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
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
  if (heroState === 'commitments_exceed_cash') {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
            <View style={styles.labelRowActions}>
              {renderManageBalancesButton(true)}
              <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
        </View>
        {breakdown}
      </>
    );
  }

  // Goals exist and need more than what's actually available — explain
  // rather than pretend they're on track (PRD ask).
  if (heroState === 'goals_underfunded') {
    return (
      <>
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelWarning]}>💰 {presentation.heading}</Text>
            <View style={styles.labelRowActions}>
              {renderManageBalancesButton(true)}
              <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.lineWarning}>{presentation.primaryCopy}</Text>
        </View>
        {breakdown}
      </>
    );
  }

  return (
    <>
      <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>💰 {presentation.heading}</Text>
          <View style={styles.labelRowActions}>
            {renderManageBalancesButton()}
            <TouchableOpacity style={styles.infoButton} onPress={() => setBreakdownVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.line}>{presentation.primaryCopy}</Text>
        {presentation.amountVisible ? <Text style={styles.value}>{presentation.displayAmount}</Text> : null}
        {safeToSpend.daysRemaining > 0 ? (
          <Text style={styles.line}>
            ≈ {formatMoney(Math.max(0, safeToSpend.dailyAllowance))}/day for the next {safeToSpend.daysRemaining} day
            {safeToSpend.daysRemaining === 1 ? '' : 's'}
          </Text>
        ) : null}
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
