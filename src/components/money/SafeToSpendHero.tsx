import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendResult } from '../../lib/calculations/safeToSpend';
import { selectSafeToSpendPresentation, formatSafeToSpendAmount as formatMoney } from '../../lib/calculations/safeToSpendPresentation';
import { InfoSheet } from '../shared/InfoSheet';
import { MoneyHeroCopy } from '../../lib/calculations/moneyPersona';
import { ON_FEATURED, onFeaturedAlpha, designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { MoneyPaydayBar } from './MoneyPaydayBar';
import { PaydayProgress, MONEY_MEASURE_DEFINITIONS } from '../../lib/calculations/moneyComposition';
import { textStyle, typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** Matches the identity tile Today's own Briefing hero uses, so the two
 * heroes share one rhythm. */
const HERO_TILE_SIZE = 36;

/** Wave 6 Correction C — the no-balance state's exact wording. An estimate
 * genuinely cannot be produced yet, so this is a missing INPUT, not a
 * financial warning: neutral treatment, one action, no amount, no `$0`,
 * and no pay-cycle rail. The support line says, in words, that inclusion
 * changes this estimate only — the single most common misreading of the
 * balance toggle. */
const CHOOSE_BALANCES_STATE = 'Choose balances to get your estimate';
const CHOOSE_BALANCES_SUPPORT =
  'Select the cash, savings or everyday accounts Nolie should include. This changes this estimate only — not your Wealth total.';
const CHOOSE_BALANCES_CTA = 'Choose balances';

/** A negative amount must be SPOKEN as "minus", never left as a glyph a
 * screen reader may skip or read as a hyphen. The visible string is
 * untouched — this only affects what is announced. */
function spokenMoney(display: string): string {
  return display.replace(/^[-\u2212]/, 'minus ');
}

function BreakdownRow({ label, value, isTotal }: { label: string; value: string; isTotal?: boolean }) {
  const { colors, spacing } = useTheme();
  // Own binding: this helper renders outside the main component's scope.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
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
      <Text style={{ ...typeStyle('body', locale), fontSize: 14, color: colors.textPrimary, fontWeight: isTotal ? '700' : '400' }}>{label}</Text>
      <Text style={{ ...typeStyle('titleCard', locale), fontSize: 14, color: colors.textPrimary, fontWeight: isTotal ? '700' : '600' }}>{value}</Text>
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
  paydayProgress = null,
  showManageBalancesLink = true,
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
  /** Wave 6 Correction B — the payday context now belongs TO the hero.
   * It was a sibling card in MoneyScreen, which is why the recording shows
   * two unrelated stacked surfaces where there should be one measure and
   * its own timeline. Already resolved by resolvePaydayProgress from the
   * same SafeToSpendResult this hero is showing; the hero recomputes
   * nothing and infers no date. */
  paydayProgress?: PaydayProgress | null;
  /** Wave 6 correction C — suppressed once Money renders its dedicated
   * whole-row balances control beneath the hero, so exactly ONE Manage
   * affordance is visible per state. Defaults true so every other consumer
   * of this hero is unchanged. The no-balance states keep their own
   * primary "Select balances" CTA either way — that is the single obvious
   * action there, and it is not this link. */
  showManageBalancesLink?: boolean;
}) {
  const { colors, radius, spacing, typography, glow, semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const heroFigureType = textStyle('figureHero', locale);
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
        // Wave 6 Correction B — the Design 5.1 featured hero. The previous
        // normal state used the pre-5.1 `colors.heroGradient` legacy token,
        // which reads as a saturated success/status card for what is an
        // ESTIMATE, and does not retint with the Wave 5 colour styles.
        // `heroSurface` is the one Premium Expressive surface a style is
        // permitted to retint, so Ocean, Purple and Sunrise each get their
        // own treatment through the token system rather than a hard-coded
        // gradient.
        heroShell: {
          borderRadius: designRadius.hero,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
          padding: designLayout.heroPadding,
          marginBottom: designLayout.cardGap,
        },
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.md },
        identityTile: {
          width: HERO_TILE_SIZE,
          height: HERO_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        identityTitle: { ...typeStyle('titleSection', locale), color: semantic.interactive, flexShrink: 1 },
        // 44x44 in its own right — no reliance on hitSlop.
        heroInfoButton: {
          width: designLayout.touchTargetMin,
          height: designLayout.touchTargetMin,
          alignItems: 'center',
          justifyContent: 'center',
        },
        heroMeasureLabel: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.md },
        heroFigure: { ...heroFigureType.style, color: semantic.interactive, marginTop: designSpacing.xs },
        heroStateText: { ...typeStyle('titleSection', locale), color: semantic.textPrimary, marginTop: designSpacing.xs, flexShrink: 1 },
        heroWarningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: designSpacing.sm, marginTop: designSpacing.xs },
        heroWarningIcon: { marginTop: 4 },
        heroWarningText: { ...typeStyle('titleSection', locale), color: semantic.warning, flexShrink: 1 },
        heroExplain: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        // The payday rail is separated by a hairline rather than a gap, so
        // it reads as this hero's own footer, not a second card.
        heroFooter: {
          marginTop: designSpacing.lg,
          paddingTop: designSpacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.border,
        },
        heroProvenance: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.sm },
        // One interactive action per state — Ocean Blue, never the retired
        // brown/warning CTA, and 44pt in its own right.
        heroCta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.xs,
          alignSelf: 'flex-start',
          minHeight: designLayout.touchTargetMin,
          marginTop: designSpacing.md,
        },
        heroCtaText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: spacing.sm },
        label: { ...typeStyle('labelTab', locale), fontSize: 11, color: onFeaturedAlpha(0.8), fontWeight: '700', letterSpacing: 0.5 },
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
        manageBalancesText: { ...typeStyle('labelTab', locale), fontSize: 11, color: onFeaturedAlpha(0.85), fontWeight: '700' },
        manageBalancesTextWarning: { color: colors.warning },
        line: { ...typeStyle('body', locale), fontSize: 14, color: onFeaturedAlpha(0.9), textAlign: 'center' },
        lineWarning: { color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
        value: { ...typeStyle('titleSection', locale), fontSize: 40, fontWeight: '700', color: colors.onNavy, marginVertical: 2 },
        explainer: { ...typeStyle('meta', locale), fontSize: 12, color: onFeaturedAlpha(0.8), textAlign: 'center', marginTop: spacing.sm, lineHeight: 17 },
        reactionBox: {
          marginTop: spacing.md,
          backgroundColor: onFeaturedAlpha(0.14),
          borderRadius: radius.control,
          padding: spacing.sm,
          alignSelf: 'stretch',
        },
        reactionText: { ...typeStyle('meta', locale), fontSize: 12, color: ON_FEATURED, textAlign: 'center', lineHeight: 17 },
        breakdownFooter: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textMuted, lineHeight: 15, marginTop: spacing.md },
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
        dailyEstimateLabel: { ...typeStyle('body', locale), fontSize: 14, color: colors.textPrimary, fontWeight: '700' },
        dailyEstimateValue: { ...typeStyle('titleSection', locale), fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
        dailyEstimateContext: { ...typeStyle('meta', locale), fontSize: 12, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, radius, spacing, typography, locale, glow]
  );

  // Correction round, 2026-08-10 (requirement 6) — the same "Manage
  // balances" control rendered identically in every card state, so the
  // user never has to remember which state they're in to find it. Opens
  // the existing Select Balances interface directly (never a new/
  // duplicate implementation) via the same onSelectBalances callback the
  // pre-existing empty-state CTAs already use — this control is additive
  // (those CTAs stay exactly as they were), not a replacement.
  function renderManageBalancesButton(warning?: boolean) {
    if (!onSelectBalances || !showManageBalancesLink) return null;
    return (
      <TouchableOpacity
        style={styles.manageBalancesButton}
        onPress={onSelectBalances}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Manage balances"
        accessibilityHint="Opens the list of balances included in this estimate"
      >
        <Ionicons name="wallet-outline" size={14} color={warning ? colors.warning : onFeaturedAlpha(0.85)} />
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
  // ==========================================================================
  // Wave 6 Correction C — EVERY state now uses the accepted Correction B
  // shell.
  //
  // ROOT CAUSE OF THE RECORDED DEFECT. Correction B redesigned only the
  // final fall-through return. Six earlier branches returned before ever
  // reaching it, still rendering `styles.card` + `styles.cardWarning`
  // (`colors.warningSoft` — the yellow surface) with `warningCtaButton`
  // (the brown CTA), an all-caps `styles.label` identity and a centred
  // dense explanation. `missing_balance` — the "no balances selected"
  // state the owner recorded — was one of them.
  //
  // There is now ONE shell. Each state supplies only what differs: its
  // wording, its own action, and whether an amount or a pay-cycle rail can
  // honestly be shown. No branch renders a competing card architecture.
  // ==========================================================================

  /** One shell for every state. `tone` selects ink only — the SURFACE is
   * always the Design 5.1 heroSurface, never a warning-coloured card. */
  function renderShell(opts: {
    testID: string;
    tone?: 'neutral' | 'warning';
    /** The state sentence, shown when no amount can be presented. */
    stateText?: string | null;
    supportText?: string | null;
    /** At most ONE call to action. */
    cta?: { label: string; onPress: () => void; testID: string } | null;
    /** Only states that can genuinely produce an estimate show the rail. */
    showRail?: boolean;
    showInfo?: boolean;
    children?: React.ReactNode;
  }) {
    const warning = opts.tone === 'warning';
    return (
      <>
        <LinearGradient
          colors={semantic.heroSurface as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroShell}
          testID={opts.testID}
        >
          <View style={styles.identityRow}>
            <View
              style={styles.identityTile}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="money-aup-hero-icon"
            >
              <Ionicons name="wallet-outline" size={20} color={semantic.interactive} />
            </View>
            <Text style={styles.identityTitle} accessibilityRole="header" maxFontSizeMultiplier={1.8}>
              Available until payday
            </Text>
            {/* Honours the showManageBalancesLink prop for any consumer
                that wants it. Money passes false — its dedicated
                "Balances used" row below is the single entry point there —
                so this renders null on Money in every state. */}
            {renderManageBalancesButton()}
            {opts.showInfo !== false ? (
              <TouchableOpacity
                style={styles.heroInfoButton}
                onPress={() => setBreakdownVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="How this was calculated"
                accessibilityHint="Opens every line behind this estimate"
                testID="money-aup-hero-info"
              >
                <Ionicons name="information-circle-outline" size={22} color={semantic.interactive} />
              </TouchableOpacity>
            ) : null}
          </View>

          {opts.children}

          {opts.stateText ? (
            warning ? (
              // Warning ink is paired with an alert glyph, so a shortfall is
              // never signalled by colour alone.
              <View style={styles.heroWarningRow} testID={`${opts.testID}-warning`}>
                <Ionicons name="alert-circle-outline" size={19} color={semantic.warning} style={styles.heroWarningIcon} importantForAccessibility="no" />
                <Text style={styles.heroWarningText}>{opts.stateText}</Text>
              </View>
            ) : (
              <Text style={styles.heroStateText} testID={`${opts.testID}-state`}>
                {opts.stateText}
              </Text>
            )
          ) : null}

          {opts.supportText ? <Text style={styles.heroExplain}>{opts.supportText}</Text> : null}

          {opts.cta ? (
            <TouchableOpacity
              style={styles.heroCta}
              onPress={opts.cta.onPress}
              accessibilityRole="button"
              accessibilityLabel={opts.cta.label}
              testID={opts.cta.testID}
            >
              <Text style={styles.heroCtaText}>{opts.cta.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={semantic.interactive} importantForAccessibility="no" />
            </TouchableOpacity>
          ) : null}

          {opts.showRail && paydayProgress && !paydayProgress.unknown ? (
            <View style={styles.heroFooter} testID="money-aup-hero-payday">
              <MoneyPaydayBar progress={paydayProgress} />
            </View>
          ) : null}

          <Text style={styles.heroProvenance}>{MONEY_MEASURE_DEFINITIONS.availableUntilPayday}</Text>
        </LinearGradient>
        {breakdown}
      </>
    );
  }

  // Corrupt balance data — repairable, and Wealth is where it is editable.
  if (heroState === 'unavailable_balance_data') {
    return renderShell({
      testID: 'money-aup-hero-unavailable-balance',
      tone: 'warning',
      stateText: presentation.primaryCopy,
      supportText: presentation.supportingCopy,
      cta: onReviewInWealth ? { label: 'Review in Wealth', onPress: onReviewInWealth, testID: 'money-aup-cta-wealth' } : null,
      showInfo: false,
    });
  }

  // Corrupt data from a source other than a balance. Deliberately no
  // action: SafeToSpendResult does not expose WHICH record is invalid, so
  // any destination offered here would point at the wrong place.
  if (heroState === 'unavailable_other_data') {
    return renderShell({
      testID: 'money-aup-hero-unavailable-other',
      tone: 'warning',
      stateText: presentation.primaryCopy,
      supportText: presentation.supportingCopy,
      cta: null,
      showInfo: false,
    });
  }

  // No known payday: never invent one, and never derive an artificial
  // planning horizon to stand in for it. Two honest cases — show the
  // balances actually included, or ask for one if none are.
  if (heroState === 'no_known_payday') {
    const hasIncludedBalance = safeToSpend.includedMoneyBalance > 0;
    if (!hasIncludedBalance) {
      return renderShell({
        testID: 'money-aup-hero-no-balances',
        stateText: CHOOSE_BALANCES_STATE,
        supportText: CHOOSE_BALANCES_SUPPORT,
        cta: onSelectBalances ? { label: CHOOSE_BALANCES_CTA, onPress: onSelectBalances, testID: 'money-aup-cta-balances' } : null,
        showRail: false,
      });
    }
    return renderShell({
      testID: 'money-aup-hero-no-payday',
      stateText: presentation.amountVisible ? null : presentation.primaryCopy,
      supportText: safeToSpend.includedMoneyBalanceAccounts.length > 0
        ? safeToSpend.includedMoneyBalanceAccounts.map((a) => `${a.label} (${formatMoney(a.value)})`).join(', ')
        : null,
      cta: onAddPayday ? { label: 'Add an expected payday', onPress: onAddPayday, testID: 'money-aup-cta-payday' } : null,
      showRail: false,
      children: presentation.amountVisible ? (
        <>
          <Text style={styles.heroMeasureLabel}>{presentation.heading}</Text>
          <Text
            style={styles.heroFigure}
            maxFontSizeMultiplier={heroFigureType.maxFontSizeMultiplier}
            numberOfLines={1}
            accessibilityLabel={`${presentation.heading}, ${spokenMoney(presentation.displayAmount!)}`}
            testID="money-aup-hero-figure"
          >
            {presentation.displayAmount}
          </Text>
        </>
      ) : null,
    });
  }

  // THE RECORDED DEFECT — no balance included. A missing INPUT, not a
  // financial warning, so it is neutral rather than yellow, and it carries
  // exactly one action.
  if (heroState === 'missing_balance') {
    return renderShell({
      testID: 'money-aup-hero-no-balances',
      stateText: CHOOSE_BALANCES_STATE,
      supportText: CHOOSE_BALANCES_SUPPORT,
      cta: onSelectBalances ? { label: CHOOSE_BALANCES_CTA, onPress: onSelectBalances, testID: 'money-aup-cta-balances' } : null,
      showRail: false,
    });
  }

  // A genuine recorded-spending overrun this cycle.
  if (heroState === 'recorded_overspend') {
    return renderShell({ testID: 'money-aup-hero-overspend', tone: 'warning', stateText: presentation.primaryCopy, showRail: true });
  }

  // Planned commitments exceed the included balance. Not overspending and
  // not a missing input — an ordinary cycle whose income has not arrived.
  if (heroState === 'commitments_exceed_cash') {
    return renderShell({ testID: 'money-aup-hero-commitments', tone: 'warning', stateText: presentation.primaryCopy, showRail: true });
  }

  // The populated state — Correction B's accepted hierarchy, now rendered
  // through the SAME shell every other state uses, so there is exactly one
  // hero architecture rather than a "new hero" beside an "old setup card".
  const amountVisible = presentation.amountVisible && !!presentation.displayAmount;

  return renderShell({
    testID: 'money-aup-hero',
    stateText: amountVisible ? null : presentation.primaryCopy,
    supportText:
      amountVisible && safeToSpend.daysRemaining > 0
        ? `About ${formatMoney(Math.max(0, safeToSpend.dailyAllowance))} a day for the next ${safeToSpend.daysRemaining} day${
            safeToSpend.daysRemaining === 1 ? '' : 's'
          }.`
        : presentation.supportingCopy,
    showRail: true,
    children: amountVisible ? (
      <>
        <Text style={styles.heroMeasureLabel}>Estimated remaining</Text>
        {/* One semantic unit — the sign can never separate from its amount,
            and the figure never truncates. */}
        <Text
          style={styles.heroFigure}
          maxFontSizeMultiplier={heroFigureType.maxFontSizeMultiplier}
          numberOfLines={1}
          accessibilityLabel={`Estimated remaining, ${spokenMoney(presentation.displayAmount!)}`}
          testID="money-aup-hero-figure"
        >
          {presentation.displayAmount}
        </Text>
      </>
    ) : null,
  });
}
