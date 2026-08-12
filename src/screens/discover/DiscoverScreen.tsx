import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { MarketPulsePreview } from '../../components/discover/MarketPulsePreview';
import { LearningCardItem } from '../../components/discover/LearningCardItem';
import { LearningPathCard } from '../../components/discover/LearningPathCard';
import { MoneyOpportunitiesHero } from '../../components/discover/MoneyOpportunitiesHero';
import { WealthJourneyCard } from '../../components/discover/WealthJourneyCard';
import { FutureYouCard } from '../../components/discover/FutureYouCard';
import { SavingStrategyCalculator } from '../../components/discover/SavingStrategyCalculator';
import { DebtCoachSheet } from '../../components/debt/DebtCoachSheet';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { Button } from '../../components/shared/Button';
import { ScoreExplanationSheet } from '../../components/health/ScoreExplanationSheet';
import { JourneyTimeline } from '../../components/health/JourneyTimeline';
import { learningCardsByCategory } from '../../lib/learningCards';
import { LEARNING_PATHS } from '../../lib/learningPaths';
import { computeMoneyOpportunities, MoneyOpportunity } from '../../lib/calculations/moneyOpportunities';
import { computeWealthPaths } from '../../lib/calculations/wealthJourney';
import { computeFutureYouPreview } from '../../lib/calculations/futureYouPreview';
import { computeLuluScore } from '../../lib/calculations/luluScore';
import { computeAchievements } from '../../lib/calculations/achievements';
import { selectScoreChipPresentation } from '../../lib/calculations/scoreChipPresentation';
import { SectionFocusRequest, parseSectionFocusRequest, computeSectionFocusFulfillment } from '../../lib/calculations/sectionFocus';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { brand } from '../../lib/brand';

const INVESTING_PATH = LEARNING_PATHS.find((p) => p.id === 'investing')!;
const SAVING_PATH = LEARNING_PATHS.find((p) => p.id === 'saving')!;
const PROPERTY_PATH = LEARNING_PATHS.find((p) => p.id === 'buying_a_home')!;
const DEBT_PATH = LEARNING_PATHS.find((p) => p.id === 'debt_free')!;
// "Your goals" shows at most this many active goals before pointing to the
// full Goals screen (Goals-to-Grow §4) — matches the existing "cap at 3"
// convention already used by Money's "Needs your attention" list.
const MAX_VISIBLE_GOALS = 3;

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Grow (formerly Discover) — an AI coaching hub, not a financial-blog
 * article list (PRD ask). Leads with real, signal-driven opportunities,
 * then a single connected "Money Path" journey, hands-on Smart Tools, and
 * an Explore Money Moves section grouping investing/saving/property
 * content — individual lesson cards only ever live inside a journey, never
 * as bare top-level items.
 */
export function DiscoverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data } = useAppState();
  const { colors, spacing, typography, radius } = useTheme();
  const scrollRef = tabScrollRefs.Grow;
  const exploreMoneyMovesY = useRef<number | null>(null);
  const scoreSectionY = useRef<number | null>(null);
  const journeySectionY = useRef<number | null>(null);
  // Pass 2B correction — the pending focus request itself. Unlike a bare
  // rAF-retry-then-abandon loop, an unfulfilled request is never discarded
  // by a frame budget: it stays here until the matching section's onLayout
  // (below) actually measures and fulfils it, however long that takes. The
  // fulfillment decision itself is the pure, unit-tested
  // computeSectionFocusFulfillment (sectionFocus.ts) — this ref and the
  // functions below only hold/apply its result.
  const pendingSectionFocusRef = useRef<SectionFocusRequest | null>(null);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [cashModalVisible, setCashModalVisible] = useState(false);
  // "Your goals" mounts its own AddGoalModal/GoalDetailSheet instances,
  // local to this screen — the same established pattern already used
  // independently by GoalsScreen, TodayScreen, MoneyScreen and
  // FloatingAddButton (Goals-to-Grow §8: no new goal data or architecture,
  // just another reader/writer of the same data.goals via useAppState).
  const [growGoalModalVisible, setGrowGoalModalVisible] = useState(false);
  const [growSelectedGoalId, setGrowSelectedGoalId] = useState<string | null>(null);
  // Pass 2B — opened by the new "Navilo Score" section below, reusing the
  // exact same ScoreExplanationSheet Today's Score chip links here for —
  // never a second/duplicate full-Score presentation.
  const [scoreSheetVisible, setScoreSheetVisible] = useState(false);
  // Pass 2B correction §5 — JourneyTimeline's own expand/collapse state,
  // lifted here so Today's one-tap Journey focus request can drive it open
  // (see attemptSectionFocus's shouldExpandJourney) while ordinary,
  // non-Today-driven visits to Grow still see it collapsed by default
  // (starts false, exactly like the component's previous internal state
  // did) — see JourneyTimeline.tsx's own doc comment for why this can't
  // stay internal to that component.
  const [journeyExpanded, setJourneyExpanded] = useState(false);

  const opportunities = useMemo(() => computeMoneyOpportunities(data), [data]);
  const journeyPaths = useMemo(() => computeWealthPaths(data), [data]);
  const futureYouPreview = useMemo(() => computeFutureYouPreview(data), [data]);
  // Pass 2B — the SAME computeLuluScore/computeAchievements engines Today
  // reads, computed once here and mounted via the exact existing
  // ScoreExplanationSheet/JourneyTimeline components — never recomputed
  // rules, never a duplicate engine. Deliberately distinct from
  // journeyPaths/computeWealthPaths above (Your Money Path) — two separate
  // features that must never be merged just because their names are
  // similar (PRD ask, Pass 2B §B).
  const luluScore = useMemo(() => computeLuluScore(data), [data]);
  const achievements = useMemo(() => computeAchievements(data), [data]);
  const scoreChipPresentation = useMemo(() => selectScoreChipPresentation(luluScore), [luluScore]);
  const firstName = data.user.name?.trim() ? data.user.name.trim() : null;
  // Existing authoritative active/completed semantics only — no new
  // Grow-specific definition of "active" (Goals-to-Grow §4). data.goals is
  // already in creation order; no additional sort is applied.
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const visibleGoals = activeGoals.slice(0, MAX_VISIBLE_GOALS);
  // Resolved live by id every render, exactly like every other
  // GoalDetailSheet mount point — a goal deleted elsewhere safely closes
  // this sheet on the next render rather than leaving stale data open.
  const growSelectedGoal = data.goals.find((g) => g.id === growSelectedGoalId) ?? null;

  /**
   * Section-focused navigation (Pass 2A architecture; corrected Pass 2B).
   *
   * Contract: receive a typed focus request → retain it as pending →
   * attempt it immediately if the target is already measurable → otherwise
   * leave it pending → the target section's own onLayout (below) retries it
   * the moment that section reports layout → scroll to the exact measured
   * position → clear only that successfully-handled request.
   *
   * The previous version of this mechanism abandoned an unmeasured target
   * after a fixed requestAnimationFrame budget, silently clearing the
   * request and leaving the customer wherever they happened to be. That is
   * exactly what this corrects: pendingSectionFocusRef is never cleared by
   * a frame count, only by a genuine successful scroll (or by being
   * superseded by a newer request — see below). In this screen every
   * target section (financial-learning/score/journey headers) always
   * renders unconditionally — locked/unavailable Score still renders its
   * established muted copy, an empty achievements list still renders the
   * Journey header — so onLayout is guaranteed to fire and fulfil the
   * request; there is no "destination never mounts" case to hang on here.
   *
   * Repeated intentional requests to the SAME section (e.g. rapid taps on
   * Today's Score chip) are supported via requestId: TodayScreen stamps
   * every navigate() call with a fresh, monotonically increasing id (see
   * its focusRequestIdRef), so route.params.scrollToRequestId always
   * changes even when scrollTo repeats the same target string — otherwise
   * React Navigation would treat an identical param object as unchanged
   * and this effect would never re-fire for a second identical tap. A
   * newer request always overwrites pendingSectionFocusRef outright (never
   * queued), so if the user taps Score then Journey before the first
   * resolves, only Journey's onLayout is allowed to fulfil the (now
   * Journey) pending request — Score's own later onLayout finds the
   * pending target no longer matches and does nothing, so a stale request
   * can never scroll to (or open) the wrong destination.
   */
  function attemptSectionFocus() {
    const result = computeSectionFocusFulfillment(
      pendingSectionFocusRef.current,
      { 'financial-learning': exploreMoneyMovesY.current, score: scoreSectionY.current, journey: journeySectionY.current },
      scoreChipPresentation.state === 'available'
    );
    if (!result.fulfilled) return; // still pending — left untouched, retried by that section's own onLayout
    scrollRef.current?.scrollTo({ y: result.scrollY!, animated: true });
    // Pass 2B correction §2 — one Today tap must reach the full Navilo
    // Score experience, not a second compact launcher requiring another
    // tap. ScoreExplanationSheet IS that full experience (score, life
    // stage, completeness, confidence, this month's movement, every
    // category/factor with status/target/action) — reused exactly as-is,
    // never redesigned or duplicated. shouldOpenScoreSheet is already
    // false whenever the score isn't authoritative (see
    // computeSectionFocusFulfillment) — auto-opening a locked sheet would
    // show near-empty content with no unlock action, worse than just
    // landing on this section's already-correct locked/unavailable copy,
    // and Today's existing UnlockPromptCard already owns the one unlock
    // CTA (must not gain a second, per this correction's own instruction).
    if (result.shouldOpenScoreSheet) setScoreSheetVisible(true);
    // Pass 2B correction §5 — one Today tap must reach the complete Journey
    // presentation, not JourneyTimeline's own collapsed "View full journey"
    // gate a second time. shouldExpandJourney is already false for every
    // other target (see sectionFocus.ts), so this never affects Score/
    // financial-learning fulfilment.
    if (result.shouldExpandJourney) setJourneyExpanded(true);
    pendingSectionFocusRef.current = null;
    navigation.setParams({ scrollTo: undefined, scrollToRequestId: undefined });
  }

  useEffect(() => {
    const parsed = parseSectionFocusRequest(route.params?.scrollTo, route.params?.scrollToRequestId);
    if (!parsed) return;
    pendingSectionFocusRef.current = parsed;
    attemptSectionFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.scrollTo, route.params?.scrollToRequestId]);

  function handleOpportunityAction(opportunity: MoneyOpportunity) {
    switch (opportunity.action) {
      case 'compare_savings':
        navigation.navigate('SavingsComparison');
        break;
      case 'open_money':
        navigation.navigate('Money');
        break;
      case 'open_investing_path':
        if (exploreMoneyMovesY.current !== null) scrollRef.current?.scrollTo({ y: exploreMoneyMovesY.current, animated: true });
        break;
      case 'debt_coach':
        setDebtCoachVisible(true);
        break;
      case 'add_cash':
        setCashModalVisible(true);
        break;
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        disclaimer: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        disclaimerText: { ...typography.micro, color: colors.textSecondary, flex: 1 },
        categoryTitle: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xl },
        // "Your goals" sits directly after the disclaimer, not after another
        // content section, so it uses a smaller top margin than
        // categoryTitle's — keeps the section compact (Goals-to-Grow §3).
        goalsSectionTitle: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
        goalsEmptyBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        goalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
        goalRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        goalTextBlock: { flex: 1, marginRight: spacing.sm },
        goalName: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600', marginBottom: 4 },
        goalAmount: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 4 },
        goalsActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
        goalsActionButton: { flex: 1 },
        groupTitle: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
        navCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
        navIcon: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.marketSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        navTextBlock: { flex: 1 },
        navTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        navBody: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, spacing, typography, radius]
  );

  return (
    <Screen title="Grow" scrollRef={scrollRef}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>Educational information only. Not investment advice.</Text>
      </View>

      {/* "Your goals" — Grow is now the primary home for goal discovery and
          management (Goals-to-Grow §1/§3): "Wealth: what I own and owe" vs
          "Grow: what I am working toward." First personalised content after
          the compliance banner, ahead of the AI opportunities hero.
          data.goals is the only source read here — no local goal state, no
          recalculated allocation, exactly the same authoritative source
          Today/Money/Wealth/GoalsScreen already read via useAppState(). */}
      <Text style={styles.goalsSectionTitle} accessibilityRole="header">
        Your goals
      </Text>
      {data.goals.length === 0 ? (
        <SectionCard>
          <Text style={styles.goalsEmptyBody}>Set a goal and {brand.name} can help you see the progress you're working toward.</Text>
          <Button label="Create a goal" onPress={() => setGrowGoalModalVisible(true)} />
        </SectionCard>
      ) : (
        <SectionCard>
          {/* Goals exist but none is currently active (all completed and/or
              archived) — the true "no goals at all" empty state above must
              never show here, since goal history still exists and remains
              reachable via View all goals (Goals-to-Grow correction §1C). */}
          {activeGoals.length === 0 ? (
            <Text style={styles.goalsEmptyBody}>You don't have an active goal right now.</Text>
          ) : (
            visibleGoals.map((g, index) => {
              const pct = g.targetAmount ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.goalRow, index > 0 ? styles.goalRowDivider : null]}
                  activeOpacity={0.7}
                  onPress={() => setGrowSelectedGoalId(g.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name}${
                    g.targetAmount
                      ? `, ${formatMoney(g.currentAmount)} of ${formatMoney(g.targetAmount)}, ${Math.round(pct * 100)} percent`
                      : ', no target set yet'
                  }`}
                  accessibilityHint="Opens goal details"
                >
                  <View style={styles.goalTextBlock}>
                    <Text style={styles.goalName} numberOfLines={2}>
                      {g.name}
                    </Text>
                    {g.targetAmount ? (
                      <>
                        <ProgressBar progress={pct} />
                        <Text style={styles.goalAmount}>
                          {formatMoney(g.currentAmount)} of {formatMoney(g.targetAmount)}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.goalAmount}>No target set yet</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })
          )}
          <View style={styles.goalsActionsRow}>
            <Button
              label="View all goals"
              variant="secondary"
              style={styles.goalsActionButton}
              onPress={() => navigation.navigate('Goals')}
            />
            <Button
              label="New goal"
              variant="secondary"
              style={styles.goalsActionButton}
              onPress={() => setGrowGoalModalVisible(true)}
            />
          </View>
        </SectionCard>
      )}
      <AddGoalModal visible={growGoalModalVisible} onClose={() => setGrowGoalModalVisible(false)} />
      <GoalDetailSheet goal={growSelectedGoal} onClose={() => setGrowSelectedGoalId(null)} />

      {/* Pass 2B — the full Navilo Score detail's stable Grow destination
          for Today's compact Score chip. Reuses the exact existing
          ScoreExplanationSheet (never a redesigned/duplicate breakdown) and
          the exact same shared presentation Today's chip reads
          (selectScoreChipPresentation), so wording can never drift between
          the two surfaces. */}
      <Text
        style={styles.categoryTitle}
        onLayout={(e) => {
          scoreSectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        {brand.scoreName}
      </Text>
      <TouchableOpacity onPress={() => setScoreSheetVisible(true)} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          {/* Pass 2B correction §2/§7 — matches ScoreChip.tsx's own icon and
              green accent exactly, so Today's chip and Grow's launcher row
              for the same feature never disagree, and neither reuses
              Journey's trophy glyph (test requirement: "Score and Journey
              do not reuse the same trophy presentation"). This is a minimal
              icon/colour fix on the existing row only — Grow's wider
              ordering and full Score visual hierarchy remain Pass 2C's. */}
          <View style={styles.navIcon}>
            <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>{scoreChipPresentation.label}</Text>
            <Text style={styles.navBody}>{scoreChipPresentation.supportingText}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>
      <ScoreExplanationSheet visible={scoreSheetVisible} onClose={() => setScoreSheetVisible(false)} result={luluScore} />

      {/* Pass 2B — the full Journey timeline's stable Grow destination for
          Today's compact Journey snapshot. Mounts the exact existing
          JourneyTimeline component (byte-for-byte unchanged, same
          computeAchievements source) — the same "full journey" a returning
          user would have seen on Today before this pass, now reachable
          here instead. */}
      <Text
        style={styles.categoryTitle}
        onLayout={(e) => {
          journeySectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        Your Journey
      </Text>
      <SectionCard>
        <JourneyTimeline achievements={achievements} expanded={journeyExpanded} onToggleExpanded={() => setJourneyExpanded((v) => !v)} />
      </SectionCard>

      {/* A. Hero — AI-driven, not a static article list (PRD ask). */}
      <MoneyOpportunitiesHero opportunities={opportunities} onAction={handleOpportunityAction} />

      {/* B. Your Money Path — one connected journey instead of a flat list
          of learning paths (PRD ask), tied to the same real signals as
          Journey achievements on Today. */}
      <Text style={styles.categoryTitle}>Your Money Path</Text>
      <WealthJourneyCard name={firstName} paths={journeyPaths} />

      {/* C. Smart Tools — emotionally reframed, not generic calculators
          (PRD ask: "make users imagine outcomes"). */}
      <Text style={styles.categoryTitle}>Smart Tools</Text>
      <FutureYouCard preview={futureYouPreview} onAdjust={() => navigation.navigate('CompoundCalculator')} />
      {/* The generic "When will I reach my goal?" nav card was removed —
          "Your goals" above is now the one goal-management entry point in
          Grow, showing real data instead of a duplicate generic route
          (Goals-to-Grow §7B). */}
      <TouchableOpacity onPress={() => navigation.navigate('EmergencyFund')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="shield-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>How long would my safety net last?</Text>
            <Text style={styles.navBody}>See how many months your cash covers, plus your savings rate</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>

      {/* D. Explore Money Moves — organised by real category, each lesson
          only ever reachable through its journey (PRD ask: never a bare
          "What is an ETF?" card floating at the top level). */}
      <Text
        style={styles.categoryTitle}
        onLayout={(e) => {
          exploreMoneyMovesY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
      >
        Explore Money Moves
      </Text>

      <Text style={styles.groupTitle}>📈 Investing</Text>
      <SectionCard>
        <MarketPulsePreview />
      </SectionCard>
      <LearningPathCard path={INVESTING_PATH} />
      <TouchableOpacity onPress={() => navigation.navigate('CompoundCalculator')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="trending-up-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>Compare investment options</Text>
            <Text style={styles.navBody}>See how different monthly amounts could grow over time</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>

      <Text style={styles.groupTitle}>🏦 Saving</Text>
      <TouchableOpacity onPress={() => navigation.navigate('SavingsComparison')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="calculator-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>Compare savings rates</Text>
            <Text style={styles.navBody}>Bank accounts, rates, and a savings calculator</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>
      <SavingStrategyCalculator />
      <LearningPathCard path={SAVING_PATH} />

      <Text style={styles.groupTitle}>🏠 Property</Text>
      <TouchableOpacity onPress={() => navigation.navigate('HomeLoanCalculator')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="home-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>Can I buy a home?</Text>
            <Text style={styles.navBody}>Estimate repayments, total interest, and total loan cost</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>
      {/* The generic "Deposit tracker" nav card was removed — "Your goals"
          above is now the one goal-management entry point in Grow, and a
          property deposit is just a goal like any other there
          (Goals-to-Grow §7B). */}
      <LearningPathCard path={PROPERTY_PATH} />

      <Text style={styles.groupTitle}>💳 Debt Free</Text>
      <LearningPathCard path={DEBT_PATH} />

      <Text style={styles.groupTitle}>📚 More</Text>
      {[...learningCardsByCategory('retirement'), ...learningCardsByCategory('tax'), ...learningCardsByCategory('economy')].map((card) => (
        <LearningCardItem key={card.id} card={card} />
      ))}

      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
      <AddWealthItemModal visible={cashModalVisible} kind="asset" presetAssetType="cash" onClose={() => setCashModalVisible(false)} />
    </Screen>
  );
}
