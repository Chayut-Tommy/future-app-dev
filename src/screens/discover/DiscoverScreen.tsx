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
import { ExploreCategorySection } from '../../components/discover/ExploreCategorySection';
import { MoneyOpportunitiesHero } from '../../components/discover/MoneyOpportunitiesHero';
import { WealthJourneyCard } from '../../components/discover/WealthJourneyCard';
import { FutureYouCard } from '../../components/discover/FutureYouCard';
import { SavingStrategyCalculator } from '../../components/discover/SavingStrategyCalculator';
import { SavingsCoachCard } from '../../components/health/SavingsCoachCard';
import { SavingFactsCard } from '../../components/today/SavingFactsCard';
import { DebtCoachSheet } from '../../components/debt/DebtCoachSheet';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { Button } from '../../components/shared/Button';
import { ScoreExplanationSheet } from '../../components/health/ScoreExplanationSheet';
import { JourneyTimeline } from '../../components/health/JourneyTimeline';
import { ScoreRadialGauge } from '../../components/shared/ScoreRadialGauge';
import { toScoreGaugePresentation } from '../../lib/calculations/scoreGaugePresentation';
import { learningCardsByCategory } from '../../lib/learningCards';
import { LEARNING_PATHS } from '../../lib/learningPaths';
import { computeMoneyOpportunities, MoneyOpportunity } from '../../lib/calculations/moneyOpportunities';
import { computeWealthPaths } from '../../lib/calculations/wealthJourney';
import { computeFutureYouPreview } from '../../lib/calculations/futureYouPreview';
import { computeLuluScore, LIFE_STAGE_LABEL } from '../../lib/calculations/luluScore';
import { computeAchievements } from '../../lib/calculations/achievements';
import { computeStrongestArea, computeBiggestOpportunity } from '../../lib/calculations/scoreExplanation';
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

// Pass 2D — the six Explore Money Moves categories, in the spec's required
// order. 'markets-this-week' is deliberately excluded from the Learning
// category's economy-card list below (it travels with Market Pulse to the
// lower page instead — see the Market Pulse section's own comment).
type ExploreCategoryId = 'saving' | 'investing' | 'debt_free' | 'home' | 'retirement' | 'learning';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Grow (formerly Discover) — an AI coaching hub, not a financial-blog
 * article list (PRD ask). Leads with the full Score, the combined Journey,
 * goal discovery, Navilo Picks, a Future You/Safety Net section, then the
 * six-category Explore Money Moves accordion, with Market Pulse lowest
 * priority at the very bottom (Pass 2D — Today & Grow hierarchy cleanup).
 */
export function DiscoverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data } = useAppState();
  const { colors, spacing, typography, radius, naviloPalette } = useTheme();
  const scrollRef = tabScrollRefs.Grow;
  const exploreMoneyMovesY = useRef<number | null>(null);
  const scoreSectionY = useRef<number | null>(null);
  const journeySectionY = useRef<number | null>(null);
  // Pass 2D — new focusable-section measurements, following the exact same
  // null-sentinel "not yet measured" convention as the three refs above.
  const goalsSectionY = useRef<number | null>(null);
  const safetyNetSectionY = useRef<number | null>(null);
  const savingCategoryY = useRef<number | null>(null);
  const learningCategoryY = useRef<number | null>(null);
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
  // Pass 2C correction — Milestones vs Money Path are genuinely distinct
  // engines (computeAchievements vs computeWealthPaths, see the doc
  // comment on the combined "Your Journey" section below); this is purely
  // a local UI selection between their two existing, unmodified
  // presentations — it never reads or writes either engine's own state,
  // so switching subviews can never mutate Journey progress or Money Path
  // stage data. Defaults to 'milestones' — the same "established collapsed
  // Milestones presentation" an organic (non-Today-driven) Grow visit
  // already showed before this correction.
  const [journeySubview, setJourneySubview] = useState<'milestones' | 'moneyPath'>('milestones');
  // Pass 2D — purely local UI state for the new Explore Money Moves
  // accordion; never persisted (no accepted persistence path owns this),
  // so it resets to fully collapsed on every fresh mount of this screen —
  // the established never-persisted convention JourneyTimeline's and
  // LearningPathCard's own expand states already follow.
  const [exploreExpanded, setExploreExpanded] = useState<Record<ExploreCategoryId, boolean>>({
    saving: false,
    investing: false,
    debt_free: false,
    home: false,
    retirement: false,
    learning: false,
  });
  function toggleExplore(id: ExploreCategoryId) {
    setExploreExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

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
  // Pass 2C physical-device correction #2 — the single source of truth for
  // the radial gauge's own validity, computed once here and reused for
  // BOTH the drawn ring/numeral (passed to ScoreRadialGauge) AND the
  // announced accessibility label below, so the two can never diverge.
  // toScoreGaugePresentation re-checks finite/in-range explicitly rather
  // than trusting scoreChipPresentation.state === 'available' alone — see
  // its own doc comment in ScoreRadialGauge.tsx for why a second,
  // independent guard at this exact presentation boundary matters.
  const scoreGaugePresentation = useMemo(
    () => toScoreGaugePresentation(scoreChipPresentation.state === 'available', scoreChipPresentation.scoreValue),
    [scoreChipPresentation]
  );
  // Pass 2C correction — the exact same deterministic-explanation-layer
  // functions ScoreExplanationSheet's own category breakdown already
  // derives from (scoreExplanation.ts), reused here so the redesigned
  // radial-gauge card can show "at most one strongest area and one next
  // opportunity" as two short factual lines — never a second/duplicate
  // trend or scoring calculation, and never more than one of each (per
  // this round's explicit "avoid multiple paragraphs" requirement). Both
  // return null defensively (result.locked, or no clear strongest/
  // opportunity category in the fixture) — the JSX below gates on that.
  const strongestArea = useMemo(() => computeStrongestArea(luluScore), [luluScore]);
  const biggestOpportunity = useMemo(() => computeBiggestOpportunity(luluScore), [luluScore]);
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
   * Section-focused navigation (Pass 2A architecture; corrected Pass 2B;
   * extended Pass 2D with 'goals'/'safety_net'/'saving'/'learning').
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
   * target section (financial-learning/score/journey/goals/safety_net
   * headers, and the Saving/Learning accordion category headers) always
   * renders unconditionally — locked/unavailable Score still renders its
   * established muted copy, an empty achievements list still renders the
   * Journey header — so onLayout is guaranteed to fire and fulfil the
   * request; there is no "destination never mounts" case to hang on here.
   *
   * Pass 2D — 'saving'/'learning' target the Explore Money Moves accordion,
   * whose content is collapsed by default. Fulfilling either first forces
   * that one category open (a plain local state write, never a persisted
   * ranking/dismissal change) — the category HEADER itself is always
   * mounted regardless of expand state, so its own y-offset never shifts
   * because of its own expansion (only sections BELOW it can move), and no
   * separate "wait for the newly-revealed content to lay out" step is
   * needed before scrolling to the header.
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
    // Pass 2D — open the target Explore category before measuring/scrolling
    // to it, per §14 ("open the required collapsed Explore category before
    // fulfilling focus"). Idempotent and safe to call on every retry.
    const target = pendingSectionFocusRef.current?.target;
    if (target === 'saving' && !exploreExpanded.saving) setExploreExpanded((s) => ({ ...s, saving: true }));
    if (target === 'learning' && !exploreExpanded.learning) setExploreExpanded((s) => ({ ...s, learning: true }));
    const result = computeSectionFocusFulfillment(
      pendingSectionFocusRef.current,
      {
        'financial-learning': exploreMoneyMovesY.current,
        score: scoreSectionY.current,
        journey: journeySectionY.current,
        goals: goalsSectionY.current,
        safety_net: safetyNetSectionY.current,
        saving: savingCategoryY.current,
        learning: learningCategoryY.current,
      },
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
    // Pass 2C correction — one Today tap must land on Milestones
    // specifically (never leave a prior Money Path selection showing
    // instead), in addition to the existing expand behaviour.
    if (result.shouldExpandJourney) {
      setJourneyExpanded(true);
      setJourneySubview('milestones');
    }
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
        // Pass 2C — the full Navilo Score card, upper-Grow's dominant
        // progress view. A restrained accent border (never a full gradient
        // hero — that identity stays exclusive to Today) resolved from the
        // user's selected colour style, so Score visually leads Grow
        // without competing with Today's own hero.
        scoreCard: { borderWidth: 1.5 },
        // Pass 2C correction — the radial-gauge header row: gauge on the
        // left, life stage/supporting/completeness text stacked beside it.
        scoreHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        scoreHeaderText: { flex: 1 },
        scoreLifeStage: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
        scoreExpandedBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        scoreSummaryLine: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: spacing.xs },
        scoreActionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.md,
          paddingTop: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        scoreActionText: { ...typography.body, fontSize: 14, color: colors.accent, fontWeight: '600' },
        // Pass 2C correction — the combined "Your Journey" section's
        // Milestones/Money Path segmented control. Sits above whichever
        // subview's own card is currently selected — never inside either
        // card, so WealthJourneyCard's own internal SectionCard (Money
        // Path) is never nested inside a second outer card.
        // Physical-device correction §2 — minHeight: 44 gives each tab an
        // adequate touch target regardless of Dynamic Type size (the prior
        // paddingVertical: 8 alone could fall well under 44pt at the
        // default caption font size). The selected tab also gets a visible
        // border (journeyTabSelected) so selection is never communicated
        // through background colour alone — see journeyTabTextSelected for
        // the matching non-colour (bold) text cue.
        journeyTabRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
        journeyTab: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1.5,
          borderColor: 'transparent',
        },
        journeyTabSelected: { borderColor: naviloPalette.secondaryAccent },
        journeyTabText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
        journeyTabTextSelected: { color: naviloPalette.secondaryAccent, fontWeight: '800' },
        journeySubviewCaption: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
      }),
    [colors, spacing, typography, radius, naviloPalette]
  );

  return (
    <Screen title="Grow" scrollRef={scrollRef}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>Educational information only. Not investment advice.</Text>
      </View>

      {/* Pass 2C correction — Grow is now the canonical home for the full
          Navilo Score experience (spec: "top of Grow must communicate
          longer-term financial progress"), so this is the first substantive
          Grow section — moved here from its previous position (between
          "Your goals" and the opportunities hero) in the prior Pass 2C
          round, unchanged internally since. Reuses the exact existing
          computeLuluScore result and the exact existing ScoreExplanationSheet
          (never a redesigned/duplicate breakdown) — the whole card is still
          one TouchableOpacity that opens that same sheet for the full
          category-by-category detail.
          Physical-device review correction — the previous compact icon+
          label+chevron launcher row lacked the visual prominence/clarity of
          the pre-Pass-2B circular ring presentation. Restored here as
          ScoreRadialGauge (src/components/shared/ScoreRadialGauge.tsx) — a
          new, deliberately static (no animation this pass) presentational
          component that only draws the SAME already-computed
          scoreChipPresentation.scoreValue; no new score/band/trend
          calculation exists anywhere in this file or that component.
          "Strongest area"/"Next opportunity" reuse computeStrongestArea/
          computeBiggestOpportunity (scoreExplanation.ts) — the exact
          functions ScoreExplanationSheet's own category cards already
          derive from — capped at one line each, never a paragraph. Every
          authoritative-only field (life stage, completeness, strongest
          area, opportunity) is gated on scoreGaugePresentation.state ===
          'available', the same doubly-validated guard that already keeps a
          locked/unavailable/invalid score from ever showing a fabricated
          number — the non-authoritative branch renders only the existing,
          unchanged compact label/supportingText row, no ring fill, no life
          stage, no trend. */}
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
      <TouchableOpacity
        onPress={() => setScoreSheetVisible(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          scoreGaugePresentation.state === 'available'
            ? `${brand.scoreName} ${scoreGaugePresentation.value} out of 100, based on what you've recorded.`
            : `${scoreChipPresentation.label}. ${scoreChipPresentation.supportingText}`
        }
        accessibilityHint="Opens the full score breakdown"
      >
        <SectionCard style={[styles.scoreCard, { borderColor: naviloPalette.primaryAccent }]}>
          <View style={styles.scoreHeaderRow}>
            <ScoreRadialGauge presentation={scoreGaugePresentation} ringColor={naviloPalette.primaryAccent} trackColor={colors.surfaceMuted} />
            <View style={styles.scoreHeaderText}>
              {scoreGaugePresentation.state === 'available' && luluScore.lifeStage ? (
                <Text style={styles.scoreLifeStage} numberOfLines={1}>
                  {LIFE_STAGE_LABEL[luluScore.lifeStage]}
                </Text>
              ) : null}
              <Text style={styles.navBody} numberOfLines={2}>
                {scoreChipPresentation.supportingText}
              </Text>
              {scoreGaugePresentation.state === 'available' ? (
                <Text style={styles.navBody} numberOfLines={1}>
                  Money Picture {luluScore.completeness.percent}% complete
                </Text>
              ) : null}
            </View>
          </View>
          {scoreGaugePresentation.state === 'available' && (strongestArea || biggestOpportunity) ? (
            <View style={styles.scoreExpandedBlock}>
              {strongestArea ? (
                <Text style={styles.scoreSummaryLine} numberOfLines={1}>
                  Strongest area: {strongestArea.label}
                </Text>
              ) : null}
              {biggestOpportunity ? (
                <Text style={styles.scoreSummaryLine} numberOfLines={1}>
                  Next opportunity: {biggestOpportunity.factor.label}
                  {biggestOpportunity.factor.potentialPoints >= 0.5 ? ` · up to +${Math.round(biggestOpportunity.factor.potentialPoints)} points` : ''}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.scoreActionRow}>
            <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
            <Text style={styles.scoreActionText}>View score breakdown</Text>
          </View>
        </SectionCard>
      </TouchableOpacity>
      <ScoreExplanationSheet visible={scoreSheetVisible} onClose={() => setScoreSheetVisible(false)} result={luluScore} />

      {/* Pass 2C correction — physical-device review: Milestones (this
          section, computeAchievements/JourneyTimeline) and Money Path
          (computeWealthPaths/WealthJourneyCard) are genuinely distinct
          engines — confirmed by inspection, wealthJourney.ts uses
          computeAchievements only as one partial input signal among several
          (hasInvestments, hasProperty, etc.), not as its source of truth —
          but the two repeat similar-looking milestones (Started, income,
          cash/savings, first goal) and both used a long connected vertical
          timeline, which read as duplicative and made Grow unnecessarily
          long. This section composes them into ONE canonical upper-Grow
          progress experience without merging, rewriting, or cross-
          contaminating either engine: a single "Your Journey" header, a
          two-way Milestones/Money Path segmented control, and below it
          whichever subview's own existing, unmodified presentation is
          selected. Milestones keeps its exact existing achievement source,
          order, next/progress, actions, persistence, celebrations, and
          collapsed/expanded behaviour (JourneyTimeline, unchanged).
          Money Path keeps its exact existing computeWealthPaths source,
          Foundation/Debt/Wealth/Retirement stage selection, current-stage
          "You are here", and actions (WealthJourneyCard, unchanged) —
          rendered directly, not wrapped in a second outer SectionCard,
          since WealthJourneyCard already renders its own internal
          SectionCard (avoids a card nested inside a card). Selecting a
          subview is a purely local UI choice (journeySubview state, above)
          that never reads or writes either engine's own data, so switching
          tabs can never mutate Journey progress or Money Path stage data
          in either direction. */}
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
      <View style={styles.journeyTabRow} accessibilityRole="tablist">
        <TouchableOpacity
          style={[styles.journeyTab, journeySubview === 'milestones' ? styles.journeyTabSelected : null]}
          onPress={() => setJourneySubview('milestones')}
          accessibilityRole="tab"
          accessibilityLabel="Milestones"
          accessibilityState={{ selected: journeySubview === 'milestones' }}
        >
          <Text style={[styles.journeyTabText, journeySubview === 'milestones' ? styles.journeyTabTextSelected : null]}>Milestones</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.journeyTab, journeySubview === 'moneyPath' ? styles.journeyTabSelected : null]}
          onPress={() => setJourneySubview('moneyPath')}
          accessibilityRole="tab"
          accessibilityLabel="Money Path"
          accessibilityState={{ selected: journeySubview === 'moneyPath' }}
        >
          <Text style={[styles.journeyTabText, journeySubview === 'moneyPath' ? styles.journeyTabTextSelected : null]}>Money Path</Text>
        </TouchableOpacity>
      </View>
      {journeySubview === 'milestones' ? (
        <>
          <Text style={styles.journeySubviewCaption}>Achievements you've reached across {brand.name}.</Text>
          <SectionCard>
            <JourneyTimeline achievements={achievements} expanded={journeyExpanded} onToggleExpanded={() => setJourneyExpanded((v) => !v)} />
          </SectionCard>
        </>
      ) : (
        <>
          <Text style={styles.journeySubviewCaption}>Steps across Foundation, Debt, Wealth and Retirement.</Text>
          <WealthJourneyCard name={firstName} paths={journeyPaths} />
        </>
      )}

      {/* "Your goals" — Grow is now the primary home for goal discovery and
          management (Goals-to-Grow §1/§3): "Wealth: what I own and owe" vs
          "Grow: what I am working toward." data.goals is the only source
          read here — no local goal state, no recalculated allocation,
          exactly the same authoritative source Today/Money/Wealth/
          GoalsScreen already read via useAppState(). */}
      <Text
        style={styles.goalsSectionTitle}
        onLayout={(e) => {
          goalsSectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
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

      {/* Navilo Picks — AI-driven, not a static article list (PRD ask). */}
      <MoneyOpportunitiesHero opportunities={opportunities} onAction={handleOpportunityAction} />

      {/* Pass 2D — "Future You and Safety Net": one clearly organised
          section grouping two previously-separate cards (Smart Tools'
          FutureYouCard, and the standalone "How long would my safety net
          last?" nav card) under a shared header, per the new Grow order.
          Both cards are unchanged — same components, same props, same
          destinations — only their surrounding heading/position moved.
          This is also the 'safety_net' focus-request destination: Today's
          eligible emergency-savings contextual insight routes here. */}
      <Text
        style={styles.categoryTitle}
        onLayout={(e) => {
          safetyNetSectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        Future You and Safety Net
      </Text>
      <FutureYouCard preview={futureYouPreview} onAdjust={() => navigation.navigate('CompoundCalculator')} />
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

      {/* Explore Money Moves — Pass 2D reorganises this into six named
          categories (Saving, Investing, Debt-free, Home, Retirement,
          Learning), each a collapsible ExploreCategorySection so the feed
          doesn't render every category's full content expanded by default.
          Every item below is the exact existing component/prop set this
          screen already rendered pre-Pass-2D — only which category it sits
          under, and whether that category starts collapsed, has changed.
          Market Pulse has moved OUT of Investing entirely (see the lower-
          page Market Pulse section further down) — Investing here now only
          contains what remains genuinely "investing exploration" content. */}
      <Text
        style={styles.categoryTitle}
        onLayout={(e) => {
          exploreMoneyMovesY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
      >
        Explore Money Moves
      </Text>

      <ExploreCategorySection
        title="Saving"
        icon="wallet-outline"
        expanded={exploreExpanded.saving}
        onToggle={() => toggleExplore('saving')}
        onLayout={(e) => {
          savingCategoryY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
      >
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
        {/* Pass 2D relocation — Savings Coach, moved here unchanged from
            Today (same component, same calculations/actions/persistence,
            no longer a standalone routine Today card). */}
        <SavingsCoachCard />
        <SavingStrategyCalculator />
        <LearningPathCard path={SAVING_PATH} />
      </ExploreCategorySection>

      <ExploreCategorySection title="Investing" icon="trending-up-outline" expanded={exploreExpanded.investing} onToggle={() => toggleExplore('investing')}>
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
      </ExploreCategorySection>

      <ExploreCategorySection title="Debt-free" icon="card-outline" expanded={exploreExpanded.debt_free} onToggle={() => toggleExplore('debt_free')}>
        <LearningPathCard path={DEBT_PATH} />
      </ExploreCategorySection>

      <ExploreCategorySection title="Home" icon="home-outline" expanded={exploreExpanded.home} onToggle={() => toggleExplore('home')}>
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
        <LearningPathCard path={PROPERTY_PATH} />
      </ExploreCategorySection>

      <ExploreCategorySection title="Retirement" icon="shield-outline" expanded={exploreExpanded.retirement} onToggle={() => toggleExplore('retirement')}>
        {learningCardsByCategory('retirement').map((card) => (
          <LearningCardItem key={card.id} card={card} />
        ))}
      </ExploreCategorySection>

      <ExploreCategorySection
        title="Learning"
        icon="book-outline"
        expanded={exploreExpanded.learning}
        onToggle={() => toggleExplore('learning')}
        onLayout={(e) => {
          learningCategoryY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
      >
        {/* Pass 2D relocation — Money Fact, moved here unchanged from Today
            (same component, same calculation source/inputs/calculator
            action, no longer a standalone routine Today card). */}
        <SavingFactsCard />
        {learningCardsByCategory('tax').map((card) => (
          <LearningCardItem key={card.id} card={card} />
        ))}
        {/* 'markets-this-week' is deliberately excluded here — it moves
            with Market Pulse to the lower page (same unavailable
            market-content area) instead of sitting in ordinary Learning
            content. */}
        {learningCardsByCategory('economy')
          .filter((card) => card.id !== 'markets-this-week')
          .map((card) => (
            <LearningCardItem key={card.id} card={card} />
          ))}
      </ExploreCategorySection>

      {/* Pass 2D — Market Pulse moves out of the premium upper-Grow content
          (it previously sat inside the Investing group, above the fold)
          to the lowest-priority position on the page, below Explore Money
          Moves, while live market data remains unavailable. Unchanged
          component — MarketPulsePreview already shows "Live data coming
          soon" and "—" placeholders rather than fabricated values; nothing
          about its own presentation changed, only its position. The
          "What moved markets this week?" card joins it here, since both
          are the same "unavailable live market content" area. */}
      {/* No onLayout/focus-target here by design — Market Pulse is
          intentionally not one of the typed SectionFocusTarget values,
          since nothing in this pass routes a customer to it directly. */}
      <Text style={styles.categoryTitle}>Markets</Text>
      <SectionCard>
        <MarketPulsePreview />
      </SectionCard>
      {(() => {
        const marketsThisWeek = learningCardsByCategory('economy').find((card) => card.id === 'markets-this-week');
        return marketsThisWeek ? <LearningCardItem card={marketsThisWeek} /> : null;
      })()}

      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
      <AddWealthItemModal visible={cashModalVisible} kind="asset" presetAssetType="cash" onClose={() => setCashModalVisible(false)} />
    </Screen>
  );
}
