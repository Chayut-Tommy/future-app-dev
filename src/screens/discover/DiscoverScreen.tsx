import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import { goalPurposeIcon } from '../../lib/addIcons';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import {
  GROW_SECTION_TITLE,
  GROW_TOOLS,
  SCORE_CONTAINMENT,
  SCORE_UNAVAILABLE_TEXT,
  scoreMayShowNumber,
  scoreSupportingText,
  scoreNumberOrNull,
  scoreFactIcon,
  scoreFactLabel,
  isPrunedFromGrow,
  toolGridColumns,
} from '../../lib/calculations/growComposition';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { LearningCardItem } from '../../components/discover/LearningCardItem';
import { LearningPathCard } from '../../components/discover/LearningPathCard';
import { WealthJourneyCard } from '../../components/discover/WealthJourneyCard';
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
import { computeWealthPaths } from '../../lib/calculations/wealthJourney';
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


function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Grow (formerly Discover) — an AI coaching hub, not a financial-blog
 * article list (PRD ask). Leads with the full Score, the combined Journey,
 * Design 5.1 Wave 8 — the composition is now exactly six sections: Nolie
 * Score (the single hero), Your goals, Your journey, Tools, Learn, and the
 * standing disclaimer. Nolie Pick, Future You, the six-category Explore
 * accordion and Market Pulse are unwired; every one of their component
 * files is retained unchanged
 * priority at the very bottom (Pass 2D — Today & Grow hierarchy cleanup).
 *
 * `pushed` — Pass 2E final correction (destination-reveal replacement).
 * True only when this instance is mounted as the root stack's `GrowDetail`
 * route (RootNavigator.tsx) — Today Briefing's Score/Journey destinations,
 * pushed above Today with a real Back header, exactly like Transactions.
 * The ordinary Grow BOTTOM-TAB instance (MainTabNavigator.tsx) never passes
 * this prop (defaults false) — Today's contextual-insight card still
 * navigates there directly with scrollTo params for its own, unrelated
 * targets (safety_net/saving/learning/goals/financial-learning), which this
 * screen's existing section-focus mechanism below is unchanged for. Same
 * component, same calculations, same shared state either way — only
 * whether a Back header renders, which ScrollView instance owns the
 * section-focus scroll, and whether a Score-sheet auto-open is sequenced
 * after the push transition differ. Never a second/duplicate Grow screen.
 */
export function DiscoverScreen({ reduceMotion, pushed = false }: { reduceMotion: boolean; pushed?: boolean }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data } = useAppState();
  const { colors, spacing, typography, radius, naviloPalette, semantic } = useTheme();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  // Wave 8 — the same shipped role resolver Money, Today and Wealth use.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const toolColumns = toolGridColumns(windowWidth, fontScale);
  // Pass 2E final correction — the pushed instance owns a private ScrollView
  // ref, never the shared tabScrollRefs.Grow singleton MainTabNavigator's
  // "tap active tab to scroll to top" listener and the tab-hosted instance
  // both depend on — two simultaneously-mounted DiscoverScreen instances
  // (the tab one underneath, this pushed one on top) attaching the SAME ref
  // object would make each overwrite the other's `.current`, breaking
  // whichever attached first.
  const pushedScrollRef = useRef<ScrollView>(null);
  const scrollRef = pushed ? pushedScrollRef : tabScrollRefs.Grow;
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
  // Pass 2E final correction — a native push transition and a native Modal
  // presentation must never animate at the same time (device-test
  // rejection evidence: Score's own destination hard-cut with no
  // perceptible motion, and the prior DestinationReveal attempt never
  // addressed this — ScoreExplanationSheet could still present WHILE the
  // stack was still sliding in). Gated on this screen's own `transitionEnd`
  // — the standard React Navigation native-stack event for "this screen's
  // push/pop animation has finished" — so the sheet opens once, only after
  // the push settles, and never for the tab-hosted instance (which has no
  // push transition to wait for; `transitionEndedRef` starts true there).
  const transitionEndedRef = useRef(!pushed);
  const pendingScoreSheetOpenRef = useRef(false);
  useEffect(() => {
    if (!pushed) return;
    const unsubscribe = navigation.addListener('transitionEnd', () => {
      transitionEndedRef.current = true;
      if (pendingScoreSheetOpenRef.current) {
        pendingScoreSheetOpenRef.current = false;
        setScoreSheetVisible(true);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushed]);
  // Pass 2D — purely local UI state for the new Explore Money Moves
  // accordion; never persisted (no accepted persistence path owns this),
  // so it resets to fully collapsed on every fresh mount of this screen —
  // the established never-persisted convention JourneyTimeline's and
  // LearningPathCard's own expand states already follow.
  const journeyPaths = useMemo(() => computeWealthPaths(data), [data]);
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
    /* Wave 8 — no category to open first. The collapsible Explore stacks
       are gone, so every focus target is already mounted and measurable;
       the fulfillment call below is otherwise unchanged. */
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
    // Pass 2E final correction — a pushed arrival must never animate this
    // scroll: it is the destination's INITIAL position (Section 3's "arrive
    // already focused... without a second conspicuous jump"), and an
    // animated scroll running alongside the native push transition is
    // exactly the "competing movement" the rejected DestinationReveal
    // attempt never fixed. The tab-hosted instance (still reachable via
    // Today's contextual-insight card for its own, unrelated targets) keeps
    // honouring Reduce Motion exactly as before.
    scrollRef.current?.scrollTo({ y: result.scrollY!, animated: pushed ? false : !reduceMotion });
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
    if (result.shouldOpenScoreSheet) {
      if (transitionEndedRef.current) setScoreSheetVisible(true);
      else pendingScoreSheetOpenRef.current = true;
    }
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

  /* Wave 8 — `handleOpportunityAction` is removed from this screen. Its
     ONLY caller was the Nolie Pick hero, which the owner has deferred to
     the future AI-agent specification. The opportunity selectors, their
     eligibility rules, their actions and every opportunity/debt-coach
     component file are RETAINED UNCHANGED for that workstream — this wave
     unwires the presentation, it does not cancel the feature.

     DebtCoachSheet is still reachable from Money and from Today's money-
     picture checklist, so removing its Grow trigger strands nothing. */

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
        disclaimerText: { ...typeStyle('meta', locale), color: colors.textSecondary, flex: 1 },
        /* Wave 8 — one section-title treatment on the shipped titleSection
           role, so Goals, Journey, Tools and Learn all read as peers below
           the single hero. */
        sectionTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle, marginTop: spacing.xl, marginBottom: spacing.sm },
        /* THE hero. Design 5.1 featured surface with a theme-aware border —
           prominent enough to establish Grow's purpose, restrained enough
           that it cannot read as a regulated credit score or an
           eligibility decision. */
        /* Wave 8 correction A — the hero now RETINTS with the colour style.
           `interactiveTint` was effectively the same pale blue in every
           style, so changing Ocean/Purple/Sunrise barely moved the card.
           `ambient` is the one Premium Expressive surface a style is
           permitted to retint, so each of the six combinations gets its own
           treatment through the token system rather than a fixed colour. */
        scoreHero: {
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
          padding: spacing.lg,
          marginBottom: spacing.md,
        },
        scoreFactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        scoreFactIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
        scoreFactIconStrength: { backgroundColor: semantic.successTint },
        scoreFactIconOpportunity: { backgroundColor: semantic.interactiveTint },
        scoreFactText: { flex: 1, minWidth: 0 },
        scoreFactLabel: { ...typeStyle('meta', locale), color: colors.textSecondary },
        scoreFactValue: { ...typeStyle('support', locale), fontWeight: '600', color: colors.textPrimary },
        scoreHeroPressable: { marginBottom: spacing.md },
        scoreHeroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        scoreHeroText: { flex: 1, minWidth: 0 },
        scoreHeroTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        scoreHeroStage: { ...typeStyle('support', locale), color: colors.textSecondary, marginTop: 2 },
        /* The containment is visible on the card itself, never only in
           accessibility text or behind the sheet. */
        scoreHeroContainment: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: spacing.xs },
        scoreHeroMeta: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
        scoreHeroFacts: { marginTop: spacing.md, gap: 2 },
        scoreHeroFact: { ...typeStyle('support', locale), color: colors.textSecondary },
        scoreHeroAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, minHeight: 44 },
        scoreHeroActionText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        /* Journey is HIGHLIGHTED, not a second hero: a tinted border, no
           featured surface, no hero radius. */
        journeyCard: { borderWidth: 1, borderColor: semantic.interactiveTint },
        toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        toolTile: {
          minHeight: 44,
          padding: spacing.md,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        toolTileHalf: { flexGrow: 1, flexBasis: '46%', minWidth: 0 },
        toolTileFull: { flexGrow: 1, flexBasis: '100%' },
        toolIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: semantic.interactiveTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
        /* Labels WRAP rather than truncate — an essential label clipped at
           320pt is how a customer opens the wrong calculator. */
        toolLabel: { ...typeStyle('titleCard', locale), color: colors.textPrimary },
        toolSupporting: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
        // "Your goals" sits directly after the disclaimer, not after another
        // content section, so it uses a smaller top margin than
        // categoryTitle's — keeps the section compact (Goals-to-Grow §3).
        goalsEmptyBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.md },
        /* Wave 8 correction B — a 56pt row, comfortably above the 44pt
           floor, with room for the purpose icon tile and a wrapped name. */
        goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
        goalIconTile: { width: 34, height: 34, borderRadius: 17, backgroundColor: semantic.interactiveTint, alignItems: 'center', justifyContent: 'center' },
        goalRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        goalTextBlock: { flex: 1, minWidth: 0, marginRight: spacing.sm },
        goalName: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 4 },
        goalAmount: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 4 },
        goalsActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
        goalsActionButton: { flex: 1 },
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
        journeyTabText: { ...typeStyle('support', locale), color: colors.textSecondary, fontWeight: '600' },
        journeyTabTextSelected: { color: naviloPalette.secondaryAccent, fontWeight: '800' },
        journeySubviewCaption: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
      }),
    [colors, spacing, typography, radius, naviloPalette, semantic, locale]
  );

  return (
    <Screen
      title="Grow"
      scrollRef={scrollRef}
      onBack={pushed ? () => { if (navigation.canGoBack()) navigation.goBack(); } : undefined}
    >
      {/* ------------------------------------------------------------------
          Wave 8 — 1. NOLIE SCORE, the page's single hero.

          Grow previously opened with a disclaimer, then Score, then a
          Journey section that used the same heading weight and its own
          segmented control — two competing openings before the customer
          reached anything they had asked for. Score now leads as the sole
          hero and Journey becomes a supporting surface below Goals.

          The engine, its gates, its categories and its history are
          untouched. `scoreGaugePresentation` and `scoreChipPresentation`
          are the same already-resolved selectors this screen always read;
          nothing here re-derives a number, and no state but 'available'
          can render one.
         ------------------------------------------------------------------ */}
      <TouchableOpacity
        style={styles.scoreHeroPressable}
        onPress={() => setScoreSheetVisible(true)}
        activeOpacity={0.85}
        onLayout={(e) => {
          scoreSectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          scoreMayShowNumber(scoreGaugePresentation.state)
            ? `${brand.scoreName} ${scoreNumberOrNull(scoreGaugePresentation)} out of 100. ${SCORE_CONTAINMENT}`
            : `${brand.scoreName}. ${SCORE_UNAVAILABLE_TEXT}`
        }
        accessibilityHint="Opens the full score breakdown"
        testID="grow-score-hero"
      >
        <LinearGradient
          colors={semantic.ambient as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scoreHero}
        >
        <View style={styles.scoreHeroRow}>
          <ScoreRadialGauge presentation={scoreGaugePresentation} ringColor={semantic.interactive} trackColor={colors.surfaceMuted} />
          <View style={styles.scoreHeroText}>
            <Text style={styles.scoreHeroTitle} accessibilityRole="header">{brand.scoreName}</Text>
            {scoreMayShowNumber(scoreGaugePresentation.state) && luluScore.lifeStage ? (
              <Text style={styles.scoreHeroStage} numberOfLines={1}>{LIFE_STAGE_LABEL[luluScore.lifeStage]}</Text>
            ) : null}
            {/* The containment is VISIBLE here, not hidden behind the
                sheet or in accessibility text alone. Existing production
                wording — this wave authors no new compliance copy. */}
            <Text style={styles.scoreHeroContainment} testID="grow-score-containment">
              {scoreSupportingText(scoreGaugePresentation.state)}
            </Text>
            {scoreMayShowNumber(scoreGaugePresentation.state) ? (
              <Text style={styles.scoreHeroMeta} numberOfLines={1}>{`Money Picture ${luluScore.completeness.percent}% complete`}</Text>
            ) : null}
          </View>
        </View>
        {scoreMayShowNumber(scoreGaugePresentation.state) && (strongestArea || biggestOpportunity) ? (
          /* Wave 8 correction A — two visually DISTINCT fact zones, each
             with its own icon tile and label, replacing two lines of
             equally weighted grey text. Success tint is used only for a
             genuine strength; an opportunity is informational and takes the
             interactive tint, never amber — amber would read as a warning
             about the customer rather than a way forward. */
          <View style={styles.scoreHeroFacts}>
            {strongestArea ? (
              <View style={styles.scoreFactRow} testID="grow-score-fact-strength">
                <View style={[styles.scoreFactIcon, styles.scoreFactIconStrength]}>
                  <Ionicons name={scoreFactIcon('strength') as never} size={14} color={semantic.success} accessibilityElementsHidden importantForAccessibility="no" />
                </View>
                <View style={styles.scoreFactText}>
                  <Text style={styles.scoreFactLabel}>{scoreFactLabel('strength')}</Text>
                  <Text style={styles.scoreFactValue}>{strongestArea.label}</Text>
                </View>
              </View>
            ) : null}
            {biggestOpportunity ? (
              <View style={styles.scoreFactRow} testID="grow-score-fact-opportunity">
                <View style={[styles.scoreFactIcon, styles.scoreFactIconOpportunity]}>
                  <Ionicons name={scoreFactIcon('opportunity') as never} size={14} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                </View>
                <View style={styles.scoreFactText}>
                  <Text style={styles.scoreFactLabel}>{scoreFactLabel('opportunity')}</Text>
                  <Text style={styles.scoreFactValue}>
                    {`${biggestOpportunity.factor.label}${
                      biggestOpportunity.factor.potentialPoints >= 0.5 ? ` · up to +${Math.round(biggestOpportunity.factor.potentialPoints)} points` : ''
                    }`}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.scoreHeroAction}>
          <Ionicons name="speedometer-outline" size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.scoreHeroActionText}>View score breakdown</Text>
          <Ionicons name="chevron-forward" size={15} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        </LinearGradient>
      </TouchableOpacity>
      <ScoreExplanationSheet visible={scoreSheetVisible} onClose={() => setScoreSheetVisible(false)} result={luluScore} />

      {/* ------------------------------------------------------------------
          Wave 8 — 2. GOALS. Unchanged behaviour: the same `data.goals`
          source, the same canonical AddGoalModal and GoalDetailSheet, the
          same Goals route. Only its position moved, up to directly beneath
          the hero, because what a customer is working toward is the natural
          reading after their progress measure.
         ------------------------------------------------------------------ */}
      <Text
        style={styles.sectionTitle}
        onLayout={(e) => {
          goalsSectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        {GROW_SECTION_TITLE.goals}
      </Text>
      {data.goals.length === 0 ? (
        <SectionCard>
          <Text style={styles.goalsEmptyBody}>Set a goal and {brand.name} can help you see the progress you're working toward.</Text>
          <Button label="Create a goal" onPress={() => setGrowGoalModalVisible(true)} />
        </SectionCard>
      ) : (
        <SectionCard>
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
                  testID={`grow-goal-row-${g.id}`}
                >
                  {/* Wave 8 correction B — a premium vector icon derived
                      from the STRUCTURED `lifeGoalType` field, never by
                      keyword-parsing the customer's own goal name. A car
                      goal gets a car; an unmapped or legacy purpose gets
                      the neutral flag fallback the shared resolver already
                      provides. */}
                  <View style={styles.goalIconTile}>
                    <Ionicons
                      name={goalPurposeIcon(g.lifeGoalType).name as never}
                      size={17}
                      color={semantic.interactive}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                  <View style={styles.goalTextBlock}>
                    <Text style={styles.goalName} numberOfLines={2}>{g.name}</Text>
                    {/* A goal with no usable target shows no percentage —
                        never a fabricated 0%. */}
                    {g.targetAmount ? (
                      <>
                        <ProgressBar progress={pct} />
                        <Text style={styles.goalAmount}>{formatMoney(g.currentAmount)} of {formatMoney(g.targetAmount)}</Text>
                      </>
                    ) : (
                      <Text style={styles.goalAmount}>No target set yet</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
                </TouchableOpacity>
              );
            })
          )}
          <View style={styles.goalsActionsRow}>
            <Button label="View all goals" variant="secondary" style={styles.goalsActionButton} onPress={() => navigation.navigate('Goals')} />
            <Button label="New goal" variant="secondary" style={styles.goalsActionButton} onPress={() => setGrowGoalModalVisible(true)} />
          </View>
        </SectionCard>
      )}
      <AddGoalModal visible={growGoalModalVisible} onClose={() => setGrowGoalModalVisible(false)} />
      <GoalDetailSheet goal={growSelectedGoal} onClose={() => setGrowSelectedGoalId(null)} />

      {/* ------------------------------------------------------------------
          Wave 8 — 3. JOURNEY, now a supporting highlighted surface.

          Both engines are untouched: JourneyTimeline keeps its exact
          achievement source, order, actions, persistence and expand
          behaviour; WealthJourneyCard keeps computeWealthPaths and its own
          stage selection. Only the section's weight changed — it no longer
          uses the hero's heading treatment, because Score is the one hero.
         ------------------------------------------------------------------ */}
      <Text
        style={styles.sectionTitle}
        onLayout={(e) => {
          journeySectionY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        {GROW_SECTION_TITLE.journey}
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
          <SectionCard style={styles.journeyCard}>
            <JourneyTimeline achievements={achievements} expanded={journeyExpanded} onToggleExpanded={() => setJourneyExpanded((v) => !v)} />
          </SectionCard>
        </>
      ) : (
        <>
          <Text style={styles.journeySubviewCaption}>Steps across Foundation, Debt, Wealth and Retirement.</Text>
          <WealthJourneyCard name={firstName} paths={journeyPaths} />
        </>
      )}

      {/* ------------------------------------------------------------------
          Wave 8 — 4. TOOLS. Exactly four tiles on the existing routes,
          replacing six collapsible category stacks that hid them. Every
          calculator engine, formula and route name is untouched; only the
          Home loan LABEL changed, from "Can I buy a home?" — which implied
          an eligibility answer the app cannot give — to the already
          approved "Home loan repayments".
         ------------------------------------------------------------------ */}
      <Text
        style={styles.sectionTitle}
        onLayout={(e) => {
          exploreMoneyMovesY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        {GROW_SECTION_TITLE.tools}
      </Text>
      <View style={styles.toolGrid} testID="grow-tools">
        {GROW_TOOLS.map((tool) => (
          <TouchableOpacity
            key={tool.key}
            style={[styles.toolTile, toolColumns === 1 ? styles.toolTileFull : styles.toolTileHalf]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(tool.route as never)}
            accessibilityRole="button"
            accessibilityLabel={`${tool.label}. ${tool.supporting}`}
            testID={`grow-tool-${tool.key}`}
          >
            <View style={styles.toolIcon}>
              <Ionicons name={tool.icon as never} size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
            <Text style={styles.toolLabel}>{tool.label}</Text>
            <Text style={styles.toolSupporting}>{tool.supporting}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ------------------------------------------------------------------
          Wave 8 — 5. LEARN. One flat section: the same LearningPathCard and
          LearningCardItem components, the same content selection and the
          same destinations, no longer buried inside collapsible category
          stacks.
         ------------------------------------------------------------------ */}
      <Text
        style={styles.sectionTitle}
        onLayout={(e) => {
          learningCategoryY.current = e.nativeEvent.layout.y;
          attemptSectionFocus();
        }}
        accessibilityRole="header"
      >
        {GROW_SECTION_TITLE.learn}
      </Text>
      <View testID="grow-learn">
        <LearningPathCard path={SAVING_PATH} />
        <LearningPathCard path={INVESTING_PATH} />
        <LearningPathCard path={DEBT_PATH} />
        <LearningPathCard path={PROPERTY_PATH} />
        {/* Wave 8 correction D — three standalone rows the owner removed
            from Grow ("How retirement accounts work", "Why contributing
            early matters", "Keep records year-round") are filtered out by
            ID, not by title: a copy edit cannot silently un-prune a row,
            and a translated title cannot fail to match. Their definitions
            remain in learningCards.ts, so nothing else that reads that
            catalogue is affected. The filter removes the ROW itself — there
            is no spacer, focus target or accessibility node left behind. */}
        {[...learningCardsByCategory('retirement'), ...learningCardsByCategory('tax')]
          .filter((card) => !isPrunedFromGrow(card.id))
          .map((card) => (
            <LearningCardItem key={card.id} card={card} />
          ))}
      </View>

      {/* Wave 8 — 6. The existing standing disclaimer, moved from the top of
          the page to its close. Wording unchanged. */}
      <View style={styles.disclaimer} testID="grow-disclaimer">
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={styles.disclaimerText}>Educational information only. Not investment advice.</Text>
      </View>

    </Screen>
  );
}
