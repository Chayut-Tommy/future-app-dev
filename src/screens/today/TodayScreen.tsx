import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import { Screen } from '../../components/shared/Screen';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { MonthSnapshotCard } from '../../components/today/MonthSnapshotCard';
import { MoneyPictureChecklistCard } from '../../components/today/MoneyPictureChecklistCard';
import { LoanBalanceReminderCard } from '../../components/today/LoanBalanceReminderCard';
import { TodayBriefingCard } from '../../components/today/TodayBriefingCard';
import { ReminderDetailSheet } from '../../components/today/ReminderDetailSheet';
import { TodayJourneySnapshotCard } from '../../components/today/TodayJourneySnapshotCard';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { computeLuluScore } from '../../lib/calculations/luluScore';
import { computeAchievements } from '../../lib/calculations/achievements';
import { pickWorthKnowingInsight } from '../../lib/calculations/worthKnowing';
import { WorthKnowingCard } from '../../components/today/WorthKnowingCard';
import { eventOccurrenceIdentity, reminderOccurrenceIdentity, occurrenceIdentityKey } from '../../lib/calculations/todayBriefing';
import { timeAwareGreeting } from '../../lib/calculations/greeting';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { computeMoneyHeroCopy } from '../../lib/calculations/moneyPersona';
import { selectSafeToSpendPresentation } from '../../lib/calculations/safeToSpendPresentation';
import { computeMoneyTimeline } from '../../lib/calculations/moneyTimeline';
import { computeMonthToDateActivity } from '../../lib/calculations/monthlySummary';
import { computeRankedReminder } from '../../lib/calculations/reminders';
import { createSuppressionPredicate } from '../../lib/calculations/reminderSuppression';
import { ReminderOpenRequest, createReminderOpenRequest } from '../../lib/calculations/reminderInteractionLifecycle';
import { selectTodayBriefingEventRows } from '../../lib/calculations/todayBriefing';
import { selectScoreChipPresentation } from '../../lib/calculations/scoreChipPresentation';
import { computeJourneySnapshot } from '../../lib/calculations/journeySnapshot';
import { buildSavingCelebration, buildGoalMilestoneCelebration, computeScoreMilestoneCelebration, resolveFirstAssetCelebrationCopy } from '../../lib/celebrations';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { Asset, AssetType } from '../../types/models';
import { sendFocusEvent } from '../../lib/accessibilityFocus';
import { TodayAmbientField } from '../../components/today/TodayAmbientField';
import { formatHeroTimeframe } from '../../lib/calculations/briefingPriorityRows';
import { formatTodayDateEyebrow, goalPercentageIsTrailing, isAccessibilityText, isMonthSectionEligible, ROW_ICON_TILE_SIZE } from '../../lib/calculations/todayComposition';
import { SETTINGS_HEADER_INSET } from '../../navigation/globalSettingsGeometry';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import { resolveGoalProgressState } from '../../lib/goalFormState';
import i18n from '../../i18n';

// Confetti + trophy tier reserved for the genuinely big moments (PRD ask) —
// everything else newly-unlocked still gets the existing Journey sheet.
const BIG_TIER_ACHIEVEMENT_IDS = new Set(['first_investment', 'emergency_fund', 'started_super']);

/** The circular Settings control in the header. 44pt so it meets the
 * minimum touch target on its own, without relying on hitSlop. */

/** Design 5.1 — the no-goal invitation is a taller row than an ordinary
 * one because it carries a title and a full sentence of supporting copy.
 * Comfortably above the 44pt activation minimum. */
const PLAN_GOAL_ROW_MIN_HEIGHT = 56;

export function TodayScreen() {
  const { data, updateGoal, updateUser, markAchievementsSeen } = useAppState();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { celebrate } = useCelebration();
  const { colors, spacing, typography, radius, glow, cardShadow, minTouchTarget, semantic } = useTheme();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const screenMargin = windowWidth <= designLayout.breakpoints.compactMax ? designLayout.screenMarginCompact : designLayout.screenMargin;
  const insets = useSafeAreaInsets();
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [wealthModalVisible, setWealthModalVisible] = useState(false);
  const [wealthModalEditAsset, setWealthModalEditAsset] = useState<Asset | null>(null);
  const [wealthModalPresetType, setWealthModalPresetType] = useState<AssetType | undefined>(undefined);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  // Pass 2B correction §1/§2 — opened by the Briefing's compact Reminder
  // tile; hosts the exact existing SmartReminderCard (its full question,
  // disclosure copy, and account-choice controls) in ReminderDetailSheet,
  // never inline inside the hero.
  //
  // Reminder-opening correction round — replaces the former
  // `reminderSheetVisible` boolean, which competed with
  // ReminderDetailSheet's own reducer as a second, independently-tracked
  // source of "is the sheet visible" (the confirmed root cause of the
  // blank-sheet device-test defect — see ReminderDetailSheet.tsx's own doc
  // comment for the full effect-ordering trace). This screen now only ever
  // SENDS an atomic open request; it never tracks or needs to know whether
  // the sheet is currently showing — ReminderDetailSheet owns that
  // entirely via isReminderLifecycleVisible(state). Mirrors the same
  // monotonic-requestId pattern this screen's own focusRequestIdRef
  // already established for AUP/timeline navigation.
  const reminderOpenRequestIdRef = useRef(0);
  const [reminderOpenRequest, setReminderOpenRequest] = useState<ReminderOpenRequest | null>(null);
  // Reminder focus/announcements task — the two possible accessibility-
  // focus-restore targets once the Reminder sheet fully closes: the exact
  // Briefing Reminder tile that originated it (still real/mounted whenever
  // a reminder remains — "Not yet"/"Got it" never remove the underlying
  // occurrence, only a genuine mutation does), or this heading as the safe
  // fallback when every reminder has genuinely been resolved and the tile
  // itself no longer renders.
  const reminderTileRef = useRef<any>(null);
  const briefingHeadingRef = useRef<any>(null);
  function handleReminderSheetFullyClosed() {
    if (topReminder) {
      sendFocusEvent(reminderTileRef);
    } else {
      sendFocusEvent(briefingHeadingRef);
    }
  }

  // Round 6 correction — the single live local-date value this screen's
  // month heading and relative-day labels derive from; see
  // useCurrentLocalDate's own doc comment for why a mount-frozen or
  // data-change-only `new Date()` capture goes stale across a midnight/
  // month rollover with no new transaction to trigger a recompute.
  const currentDate = useCurrentLocalDate();
  const greeting = useMemo(() => timeAwareGreeting(data.user.name, t), [data.user.name, t]);
  const monthLabel = useMemo(() => currentDate.toLocaleDateString(undefined, { month: 'long' }), [currentDate]);
  const luluScore = useMemo(() => computeLuluScore(data), [data]);

  // Today Briefing (Pass 2A) — every input computed exactly once here and
  // passed down, never re-derived inside TodayBriefingCard/SmartReminderCard,
  // so the Briefing's AUP reading and its dedup against the top reminder
  // always agree with each other and with Money's own reading of the same
  // functions.
  const safeToSpend = useMemo(() => computeSafeToSpend(data, currentDate), [data, currentDate]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const safeToSpendPresentation = useMemo(() => selectSafeToSpendPresentation(safeToSpend, heroCopy), [safeToSpend, heroCopy]);
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, currentDate), [data, currentDate]);
  // The canonical month-to-date selector, called ONCE. Both the section
  // heading's visibility and the card's figures read this same value, so
  // the two can never disagree about whether there is anything to show.
  // `currentDate` is the live local-date value (useCurrentLocalDate), so a
  // month rollover with zero new transactions still recomputes it.
  const monthActivity = useMemo(() => computeMonthToDateActivity(data, currentDate), [data, currentDate]);
  const monthSectionVisible = isMonthSectionEligible(monthActivity);
  // Same accessibility threshold the rest of Today reflows on.
  const stackGoalAction = isAccessibilityText(fontScale);
  // Design 5.1 p.7 — the hero's supporting timeframe line. Every number in
  // it is read straight off the Safe-to-Spend result the hero is already
  // showing; formatHeroTimeframe recomputes nothing and returns null rather
  // than guessing when no payday is genuinely known.
  const heroTimeframeLine = useMemo(
    () => formatHeroTimeframe(safeToSpend.daysRemaining, safeToSpend.cycleEnd, safeToSpend.dailyAllowance, !!data.user.nextPayday),
    [safeToSpend.daysRemaining, safeToSpend.cycleEnd, safeToSpend.dailyAllowance, data.user.nextPayday]
  );
  // Wave 6 — the Briefing tile reads the SAME ranker as the sheet, now
  // through the persisted suppression predicate. Without this a dismissed
  // or snoozed occurrence would vanish from the sheet but keep advertising
  // itself on Today, which is the one place the customer would notice.
  // `computeRankedReminder` is the ranker computeTopReminder already
  // delegates to; only the exclusion argument is new.
  const topReminder = useMemo(
    () => computeRankedReminder(data, currentDate, createSuppressionPredicate(data, currentDate)),
    [data, currentDate]
  );
  const briefingEventRows = useMemo(() => selectTodayBriefingEventRows(timelineEvents, topReminder), [timelineEvents, topReminder]);

  // Pass 2B — the compact Score chip and Journey snapshot each wrap an
  // already-computed result (luluScore / achievements below) exactly once;
  // neither presentation selector recomputes the Score formula or the
  // achievement rules, only formats what's already there.
  const scoreChipPresentation = useMemo(() => selectScoreChipPresentation(luluScore), [luluScore]);

  // Device-test correction round — Financial Rebuild's own two actions
  // read the exact same active-goal predicate primaryActiveGoal (below)
  // will also use for the goal-snapshot section, so "does the user have
  // an active goal" can never disagree between the two.
  const achievements = useMemo(() => computeAchievements(data), [data]);
  const journeySnapshot = useMemo(() => computeJourneySnapshot(achievements), [achievements]);
  // Worth Knowing round — Cashflow Focus's Today presentation was retired
  // first, and the Financial Rebuild override has now followed it (owner
  // decision, Wave 2): the contextual-insight slot belongs solely to Worth
  // Knowing. financialState.ts/computeFinancialState/FinancialStateCard/
  // describeFinancialStateForWealthMap are all completely unchanged and
  // still power Wealth Map — only Today's presentation dropped the surface.

  // Correction round — Today's single contextual-insight slot is now
  // genuinely a two-tier tree with exactly ONE selector call: Financial
  // Rebuild (above) overrides everything; otherwise `pickWorthKnowingInsight`
  // — worthKnowing.ts's single exported decision function — is the ONLY
  // thing that can occupy this slot. The pre-existing todayContextualInsight
  // pool (emergency savings / savings-rate / goalImpact) and LuluCheckInCard
  // are no longer called from Today at all — they were a second,
  // independently-computed selector glued to this slot only by JSX ternary
  // priority, which is not "one engine" merely because the two render into
  // the same visual position (see worthKnowing.ts's own header comment).
  // When pickWorthKnowingInsight returns null, this slot renders nothing —
  // no generic fallback card — and Goal follows August so far directly.
  // todayContextualInsight.ts/dailyInsight.ts/LuluCheckInCard.tsx remain in
  // the repository (their own real-import tests still cover them) but are
  // dead code from Today's perspective as of this round.

  // Worth Knowing — what Today Briefing already shows, built from the exact
  // same eventRows/topReminder Briefing itself renders (never re-derived
  // independently), so Worth Knowing can never disagree with Briefing about
  // what's already visible (spec §19). eventOccurrenceIdentity/
  // occurrenceIdentityKey are the same identity primitives Briefing's own
  // dedup (todayBriefing.ts) already uses against reminders/candidate
  // events.
  const worthKnowingContext = useMemo(() => {
    const shownEventKeys = new Set<string>();
    for (const row of briefingEventRows) {
      const event = timelineEvents.find((e) => e.id === row.key);
      if (!event) continue;
      const key = occurrenceIdentityKey(eventOccurrenceIdentity(event));
      if (key) shownEventKeys.add(key);
    }
    const reminderKey = topReminder ? occurrenceIdentityKey(reminderOccurrenceIdentity(topReminder)) : null;
    return { shownEventKeys, reminderKey };
  }, [briefingEventRows, timelineEvents, topReminder]);

  const worthKnowingInsight = useMemo(
    () => pickWorthKnowingInsight(data, currentDate, timelineEvents, safeToSpend, worthKnowingContext),
    [data, currentDate, timelineEvents, safeToSpend, worthKnowingContext]
  );

  // Pass 2D — the single active-goal snapshot (final hierarchy §3). The
  // exact same source and order Grow's own "Your goals" list already
  // reads (data.goals, creation order, no new ranking rule) — just the
  // first one, since Today now shows one compact snapshot rather than the
  // full list. Full multi-goal management (reorder, priority, all goals)
  // remains exclusively in Grow, unchanged.
  const primaryActiveGoal = data.goals.find((g) => g.status === 'active') ?? null;
  /** Wave 4 closure — Today shows ONE focus goal, so with several active
   * goals a customer had no visible route to the rest. Completed and
   * archived goals are never counted; the existing focus-goal selection is
   * untouched. */
  const activeGoalCount = data.goals.filter((g) => g.status === 'active').length;
  // Derived live from data.goals by id, not a snapshot taken at tap-time —
  // otherwise a contribution that completes a goal wouldn't be reflected
  // in the already-open sheet (PRD bug report: "still behaves like active"
  // right after reaching 100%).
  const contributeGoal = data.goals.find((g) => g.id === contributeGoalId) ?? null;

  // Celebrate a newly unlocked "Your Journey" milestone the moment it
  // happens (PRD ask: Lulu should feel alive, not a passive checklist).
  // Genuinely big wins (first investment, emergency fund) get the
  // full-screen confetti tier; every other achievement (Started Navilo,
  // Added Income, Added Savings, etc.) is routine and gets the small toast
  // tier instead — non-blocking, no backdrop, can never collide with a
  // native Modal (PRD ask: reserve native Modal celebrations for score
  // milestones and major achievements only, after two rounds of a freeze
  // regression traced to native-Modal presentation races).
  //
  // The toast branch fires immediately, no defer — SmallCelebrationToast
  // is a plain absolutely-positioned View with pointerEvents="none", not a
  // native <Modal>, so it can never race a closing add/edit modal's native
  // dismiss animation the way a Modal-based celebration could.
  //
  // The 'big' branch stays deferred 400ms (PRD bug report: saving in an
  // add/edit modal updates `data` and calls its own onClose() in the same
  // tick; presenting a brand-new native Modal in that identical tick is a
  // known iOS race that leaves the screen's touch interaction disabled).
  // Both branches route through `celebrate()` — CelebrationContext's single
  // queue — never a second, disconnected presentation path (a second
  // regression, reproduced even with the Financial State Engine fully
  // disabled, traced to exactly that: this effect and the score-milestone
  // effect below each independently able to present their own Modal).
  useEffect(() => {
    const newlyUnlocked = achievements.find((a) => a.unlocked && !data.seenAchievementIds.includes(a.id));
    if (!newlyUnlocked) return;
    const isBig = BIG_TIER_ACHIEVEMENT_IDS.has(newlyUnlocked.id);
    // Wave 9c state-communication correction A — the first-asset unlock's
    // toast copy resolves from structured asset types (see the resolver's
    // own doc comment): an Everyday ACCOUNT announces itself truthfully
    // instead of as "Added First Asset". Presentation only — the unlock
    // itself, its id, tier and seen-tracking are byte-identical.
    const firstAssetCopy = newlyUnlocked.id === 'added_first_asset' ? resolveFirstAssetCelebrationCopy(data.assets) : null;
    const fire = () => {
      celebrate({
        id: newlyUnlocked.id,
        tier: isBig ? 'big' : 'small',
        icon: firstAssetCopy?.icon ?? newlyUnlocked.icon,
        title: firstAssetCopy?.title ?? newlyUnlocked.title,
        body: firstAssetCopy?.body ?? newlyUnlocked.subtitle,
      });
      markAchievementsSeen([newlyUnlocked.id]);
    };
    if (!isBig) {
      fire();
      return;
    }
    const timer = setTimeout(fire, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Wave 9c — the "profile complete" celebration was RETIRED. Its only
  // trigger was age + moneyGoal + confidenceLevel, and the latter two
  // questions no longer exist anywhere (onboarding and Settings both
  // retired them), so the trio could never complete for a new customer and
  // the celebration was dead wiring. Deliberately NOT retargeted at name,
  // age or onboarding completion — finishing a form is not a money moment.
  // The persisted `profileCompletionCelebrated` flag stays on the model
  // untouched for customers who already earned it.

  // Building the initial money picture (income → savings → bills → assets)
  // can jump the Score several 10-point bands in minutes — that's score
  // *discovery*, not a genuine improvement, and celebrating each jump risks
  // presenting a native Modal celebration while the guided checklist (whose
  // own steps open their own Modals) is still on screen — exactly the
  // presentation window this app's recurring freeze regression happens in
  // (PRD bug report: tapping "Tell me about your assets" froze the app
  // right after a bill entry crossed the 80-point band). The moment the
  // checklist disappears — completed or manually dismissed — silently
  // snapshot whatever band the score is already in as "already celebrated"
  // (PRD ask, §4/§5). No celebration UI fires for this snapshot itself;
  // only score increases *above* this baseline are ever celebrated.
  useEffect(() => {
    if (!data.user.moneyPictureChecklistDismissed || data.user.scoreMilestoneBaselineSet) return;
    const currentBand = luluScore.locked ? 0 : Math.floor(luluScore.score / 10) * 10;
    updateUser({
      highestScoreMilestoneCelebrated: Math.max(data.user.highestScoreMilestoneCelebrated ?? 0, currentBand),
      scoreMilestoneBaselineSet: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.user.moneyPictureChecklistDismissed]);

  // Celebrate every 10-point Score milestone above the established baseline
  // (PRD ask, §6) — gated on `scoreMilestoneBaselineSet` so this can never
  // fire until the effect above has run, which structurally means it can
  // never fire while the money-picture checklist (and its own Modals) are
  // still on screen. Deferred for the same iOS Modal race the achievement-
  // unlock effect above guards against. Routes through `celebrate()`, so it
  // shares one queue with every other celebration source.
  useEffect(() => {
    if (luluScore.locked || !data.user.scoreMilestoneBaselineSet) return;
    const result = computeScoreMilestoneCelebration(luluScore.score, data.user.highestScoreMilestoneCelebrated ?? 0);
    if (!result) return;
    const timer = setTimeout(() => {
      celebrate(result.event);
      updateUser({ highestScoreMilestoneCelebrated: result.milestone });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [luluScore.locked, luluScore.score, data.user.highestScoreMilestoneCelebrated, data.user.scoreMilestoneBaselineSet]);

  // Pass 2B correction — every Grow section-focus request (score, journey,
  // and the pre-existing financial-learning) is stamped with a fresh,
  // monotonically increasing id from this single shared counter. Grow's own
  // pending-focus effect keys off {scrollTo, scrollToRequestId} together,
  // not scrollTo alone: if it only read scrollTo, a second rapid tap on the
  // same section would navigate with an identical params object and React
  // Navigation would treat it as no change, silently swallowing the repeat
  // tap. The id makes every intentional tap a genuine, detectable change,
  // even back-to-back taps on the exact same section. Shared by the pushed
  // MoneyDetail/GrowDetail routes below (Pass 2E final correction). The
  // in-tab Grow navigateToGrow() destinations this comment used to also
  // describe were removed in the Worth Knowing correction round alongside
  // their only caller, handleContextualInsightPress.
  const focusRequestIdRef = useRef(0);

  // Pass 2E final correction (destination-reveal replacement) — guards
  // against a rapid double-press stacking two pushed detail routes before
  // the first navigate() call's state update has been processed (Section
  // 6.8's explicit "repeated/rapid presses cannot stack duplicate routes"
  // requirement). Reset the instant Today regains focus (i.e. every time
  // the user returns via Back), not on a timer — a timer would either fire
  // too early (still stacked) or leave Today briefly unresponsive after a
  // genuine, intentional return.
  const navigatingToDetailRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      navigatingToDetailRef.current = false;
    }, [])
  );

  // Pass 2E final correction — replaces the previous cross-tab
  // navigation (navigate('Money'/'Grow', { scrollTo, scrollToRequestId }))
  // for these four Briefing destinations specifically. Pushes the exact
  // same existing Money/Grow content as a new stack entry above Today
  // (RootNavigator.tsx's MoneyDetail/GrowDetail routes — the identical
  // native-stack push pattern Transactions already uses), rather than
  // switching the active bottom tab. scrollTo/scrollToRequestId are still
  // the same params/mechanism MoneyScreen.tsx/DiscoverScreen.tsx's own
  // section-focus effect already consumes (sectionFocus.ts/
  // moneySectionFocus.ts, unchanged) — only the destination ROUTE name
  // changed, not the focus-request contract itself.
  // Correction round — `target` is optional and additive: the pre-existing
  // AUP/event-row/this_month callers below all still call this with a
  // single argument, completely unaffected. Only Worth Knowing's WK-01/
  // WK-02 destinations (handleWorthKnowingPress) supply one, so Money's
  // own inner-timeline scroll (moneyTimeline's own SCROLL_BOX_HEIGHT once
  // "What happens next" exceeds a handful of events — see
  // MoneyTimelineCard.tsx/timelineFocus.ts) can land on the exact date
  // group an insight is about, not merely the section heading.
  function pushMoneyDetail(scrollTo: 'aup' | 'timeline' | 'this_month', target?: { dateKey: string; occurrenceKeys: string[] }) {
    if (navigatingToDetailRef.current) return;
    navigatingToDetailRef.current = true;
    focusRequestIdRef.current += 1;
    navigation.navigate('MoneyDetail', {
      scrollTo,
      scrollToRequestId: focusRequestIdRef.current,
      targetDateKey: target?.dateKey,
      targetOccurrenceKeys: target?.occurrenceKeys,
    });
  }
  function pushGrowDetail(scrollTo: 'score' | 'journey') {
    if (navigatingToDetailRef.current) return;
    navigatingToDetailRef.current = true;
    focusRequestIdRef.current += 1;
    navigation.navigate('GrowDetail', { scrollTo, scrollToRequestId: focusRequestIdRef.current });
  }

  // Correction pass — the shared AUP presentation now owns its own action
  // declaratively (safeToSpendPresentation.action), rather than this screen
  // hard-coding a single navigate() call independent of state. Every state
  // currently resolves to the same action (focus Money's existing AUP
  // section, whose own per-state CTA already owns the actual recovery
  // journey) — this switch exists so that ownership is genuinely read from
  // the presentation, not merely declared on its type and then ignored.
  function handleBriefingAupPress() {
    if (safeToSpendPresentation.action.kind === 'focus_money_section') {
      pushMoneyDetail(safeToSpendPresentation.action.section);
    }
  }

  // Pass 2B — both compact presentations' destinations reuse the exact same
  // stable section-focus architecture as the AUP row above (Grow's own
  // pending-focus mechanism — see DiscoverScreen.tsx), never a hard-coded
  // pixel offset and never a new duplicate Score/Journey screen.
  //
  // Correction round — navigateToGrow (in-tab Grow-TAB navigation, distinct
  // from pushGrowDetail's pushed-route destinations) was previously also
  // used by handleContextualInsightPress for the old contextual-insight
  // pool's safety_net/saving destinations. That pool is no longer called
  // from Today (see the single-selector correction above), so navigateToGrow
  // itself is removed as dead code alongside its only caller — Grow's own
  // section-focus targets ('safety_net', 'saving', 'goals', 'learning',
  // 'financial-learning') are all now dead/unreachable infrastructure from
  // Today, same status the other three already had per this file's sibling
  // structural test (tests/pass-2d-today-grow-hierarchy.test.ts).
  function handleScoreChipPress() {
    pushGrowDetail('score');
  }
  function handleJourneyPress() {
    pushGrowDetail('journey');
  }

  // Worth Knowing's own destination — reuses pushMoneyDetail's existing
  // pushed-route mechanism (Pass 2E) for both Money-section destinations
  // (timeline for WK-01/WK-02, this_month for WK-04); WK-03 (category
  // concentration) routes to the same existing Transactions screen every
  // other Today/Money "view spending" destination already uses.
  function handleWorthKnowingPress() {
    if (!worthKnowingInsight) return;
    const destination = worthKnowingInsight.destination;
    if (destination.kind === 'money_section') {
      // Correction round — the 'timeline' destination (WK-01/WK-02) always
      // carries its own targetDateKey/targetOccurrenceKeys (worthKnowing.ts's
      // own type contract), built from the exact same data its materiality/
      // count already used — passed straight through, never re-derived here.
      if (destination.section === 'timeline') {
        pushMoneyDetail('timeline', { dateKey: destination.targetDateKey, occurrenceKeys: destination.targetOccurrenceKeys });
      } else {
        pushMoneyDetail(destination.section);
      }
    } else {
      navigation.navigate('Transactions');
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Design 5.1 p.7 header anatomy: uppercase local date eyebrow, then
        // the greeting at titleScreen. The brand lockup that used to sit
        // here is gone — the customer knows which app they opened, and the
        // date is the piece of context that actually changes.
        dateEyebrow: { ...typeStyle('eyebrow', locale), color: semantic.textTertiary },
        // Reserves the Settings control's own width so a long greeting
        // reflows beside it instead of running underneath it.
        /* Wave 8 correction E — the reserved width now comes from the
           SHARED geometry the root-level Settings singleton reads, so the
           control and the space kept for it can never drift apart the way
           Today's own two hardcoded numbers did. */
        headerBlock: { paddingRight: SETTINGS_HEADER_INSET },
        // Fixed, not part of the scroll content (PRD bug report: on a long
        // Today page, an in-content settings button scrolls out of reach).
        greeting: { ...typeStyle('titleScreen', locale), color: semantic.textTitle, marginTop: designSpacing.xs, marginBottom: designLayout.sectionGap },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: designSpacing.sm,
          marginTop: designSpacing.sm,
          minHeight: minTouchTarget,
        },
        sectionTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        sectionLink: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        // Design 5.1 p.7 — the focus goal is ONE compact financial row, not
        // a card with a stacked name/bar/amount block inside it.
        goalRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          paddingVertical: designSpacing.md,
          paddingHorizontal: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: minTouchTarget,
        },
        goalIconTile: {
          width: ROW_ICON_TILE_SIZE,
          height: ROW_ICON_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        goalBody: { flex: 1 },
        goalName: { ...typeStyle('body', locale), color: semantic.textPrimary, fontWeight: '600' },
        goalBarWrap: { marginTop: designSpacing.sm },
        goalPercent: { ...typeStyle('figureRow', locale), color: semantic.textSecondary },
        goalPercentBelow: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
        // The no-goal invitation. Same flat supporting surface as the
        // active-goal row, so the two states read as one slot rather than
        // two different components. 56pt minimum height per Design 5.1.
        planGoalRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          paddingVertical: designSpacing.md,
          paddingHorizontal: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: PLAN_GOAL_ROW_MIN_HEIGHT,
        },
        planGoalIconTile: {
          width: ROW_ICON_TILE_SIZE,
          height: ROW_ICON_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        planGoalBody: { flex: 1 },
        planGoalTitle: { ...typeStyle('body', locale), color: semantic.textPrimary, fontWeight: '600' },
        planGoalBodyText: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
        // Interactive, never success — creating a goal is a neutral
        // invitation, not a confirmation of something achieved.
        planGoalAction: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        planGoalActionBelow: { ...typeStyle('labelButton', locale), color: semantic.interactive, marginTop: designSpacing.sm },
        // Wave 4 closure — the multi-goal route. 44pt minimum target.
        viewAllGoalsRow: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        viewAllGoalsText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        // A quiet supporting row — never a second hero, never a highlighted
        // card. Flat, bordered, and visually subordinate to everything above.
        scoreFootnoteRow: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.border,
        },
        scoreFootnoteBody: { flex: 1 },
        // Tertiary/meta throughout — quieter than every card above it, and
        // deliberately NOT a SectionCard, surface or tint of any kind.
        scoreFootnoteLabel: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        scoreFootnoteSupport: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: 2 },
        goalAmount: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
      }),
    [colors, spacing, typography, radius, glow, cardShadow, insets.top, minTouchTarget, semantic, locale, screenMargin]
  );

  return (
    <Screen
      scroll
      contentPadding
      scrollRef={tabScrollRefs.Today}
      ambient={<TodayAmbientField />}
    >

      {/* 1. Greeting and settings — the emotional handshake, kept outside
          the card so it doesn't read like dashboard content (PRD ask).
          Wave 8 correction E — Today no longer owns a Settings control.
          It was the app's ONLY route to Settings, so Money, Wealth and Grow
          had none at all, and it floated over this screen's own scrolling
          content. It is replaced by ONE root-level singleton driven by the
          same visibility authority as the dock and the "+", which are also
          "+"/quick-actions FAB (which now also owns Ask Nolie's fallback
          entry point, see quickActions.ts) is mounted at the navigator
          level, not owned by this screen. No financial-health claim is
          ever added here — greeting wording is unchanged from the accepted
          Pass 2A-2C copy (timeAwareGreeting). */}
      <View style={styles.headerBlock}>
        {/* Design 5.1 p.7 — the local date eyebrow PRECEDES the greeting.
            Generated from the customer's own live local calendar value
            (useCurrentLocalDate), never hard-coded, and uppercased by the
            eyebrow type role itself — which suppresses the transform for
            Thai, so a Thai greeting is never force-uppercased. */}
        <Text style={styles.dateEyebrow} maxFontSizeMultiplier={1.4} testID="today-date-eyebrow">
          {formatTodayDateEyebrow(currentDate)}
        </Text>
        <Text style={styles.greeting} testID="today-greeting">{greeting}</Text>
      </View>

      {/* Setup-state priority correction (owner fresh-device finding,
          authorised ahead of Wave 3). While the money picture is fresh or
          incomplete this checklist IS the primary job on Today, so it sits
          directly under the greeting — a new customer had to scroll past
          the briefing, journey, month snapshot, goal and Score prompts to
          reach it. Pass 2D moved it into the trailing group; before that it
          sat third, above the month snapshot.

          Position only. The component, its progress calculation, its
          `moneyPictureChecklistDismissed || allDone` visibility rule, its
          row actions and its Add destinations are untouched, and it is
          still rendered exactly once. The completed/dismissed states are
          unchanged, so an established user's Today hierarchy is identical
          — the card simply returns null as it always did. The broader Wave
          5 Today redesign still owns the completed-user hierarchy, and must
          preserve this setup-state priority. */}
      <MoneyPictureChecklistCard />

      {/* 2. Your Today Briefing (Pass 2A, extended Pass 2B) — unchanged:
          eligibility, priority, the three-financial-item cap (Score
          excluded from that cap), responsive one/two/three-item layouts,
          reminder actions, AUP/event destinations, palette behaviour, and
          every calculation are all exactly as Pass 2A-2C shipped them. */}
      <TodayBriefingCard
        presentation={safeToSpendPresentation}
        eventRows={briefingEventRows}
        timelineEvents={timelineEvents}
        topReminder={topReminder}
        timeframeLine={heroTimeframeLine}
        onPressAup={handleBriefingAupPress}
        onPressEventRow={() => pushMoneyDetail('timeline')}
        onPressReminderTile={() => {
          // Reminder-opening correction round — captures the exact
          // currently-selected topReminder synchronously, at press time;
          // if none exists right now, no request is issued and no sheet
          // opens at all (never a blank shell). requestId is strictly
          // monotonic, so a stray duplicate/rapid-repeat press can be
          // deterministically deduped downstream (ReminderDetailSheet.tsx).
          if (!topReminder) return;
          reminderOpenRequestIdRef.current += 1;
          setReminderOpenRequest(createReminderOpenRequest(reminderOpenRequestIdRef.current, topReminder));
        }}
        headingRef={briefingHeadingRef}
        reminderTileRef={reminderTileRef}
      />

      {/* 3. Your Journey snapshot (Pass 2B) — unchanged: completed count,
          next milestone, progress, one-tap routing to Grow with automatic
          Milestones selection and expansion, milestone persistence and
          celebrations. Immediately after Briefing, preserving the exact
          Pass 2B-accepted ordering (Briefing -> Journey snapshot). Correction
          pass — This Month (4) now follows immediately: the conditional
          recovery/first-run affordances that used to sit here (locked-Score
          unlock, money-picture checklist) moved to the trailing,
          non-canonical block after the contextual insight slot (6), so
          nothing but the six canonical sections themselves can ever
          interleave this Journey -> This Month -> Goal snapshot sequence. */}
      <TodayJourneySnapshotCard snapshot={journeySnapshot} onPress={handleJourneyPress} />

      {/* 4. This Month — transaction inclusion/exclusion, month-to-date
          boundaries, exact cents, income/spending/net totals and the
          Transaction History route are all exactly as before.

          Wave 5 closure — the heading and the card are now gated TOGETHER
          on the same eligibility value. With nothing recorded, the entire
          section is absent: the money-picture checklist above is the single
          setup ask, and this slot no longer repeats it in different words
          or leaves an empty card, an orphaned month-name heading, or
          a spacer behind. */}
      {monthSectionVisible ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{monthLabel} so far</Text>
          </View>
          <MonthSnapshotCard activity={monthActivity} />
        </>
      ) : null}

      {/* 5. Contextual insight slot — Worth Knowing, and nothing else.
          `worthKnowingInsight` (pickWorthKnowingInsight, worthKnowing.ts's
          single exported decision function) is now the ONLY thing that can
          occupy this slot. The former Financial Rebuild first tier was
          removed by owner decision in Wave 2: it rendered an orange
          FinancialStateCard here AND suppressed the Worth Knowing selector
          entirely, so a customer with negative net wealth never saw a Worth
          Knowing insight at all. There is no fallback card — when
          worthKnowingInsight is null this slot renders nothing, and Goal
          (below) follows August so far directly. See worthKnowing.ts's own header comment
          for the full architecture rationale. */}
      {worthKnowingInsight ? (
        <TouchableOpacity
          onPress={handleWorthKnowingPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Worth Knowing. ${worthKnowingInsight.title}. ${worthKnowingInsight.body} ${worthKnowingInsight.ctaLabel}.`}
        >
          <WorthKnowingCard insight={worthKnowingInsight} />
        </TouchableOpacity>
      ) : null}

      {/* 6. Compact goal snapshot (Pass 2D) — exactly one active-goal
          summary, or one clear empty action; replaces the previous
          full-list-with-inline-quick-contribute-buttons presentation. The
          same existing goal source/order (data.goals, unsorted, first
          active) and the same existing GoalDetailSheet destination (richer
          contribution/progress-update controls live there already, so
          nothing accepted is lost — only the long inline Today treatment
          is gone). Achieved/archived goals are never shown here (status
          filter is 'active' only, the exact same filter Grow's own list
          already used). Worth Knowing round — moved to follow the
          contextual-insight slot (5), per the approved Today hierarchy. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Your goal</Text>
      </View>
      {primaryActiveGoal ? (
        (() => {
          const g = primaryActiveGoal;
          // The shared Wave 4 progress rule — a goal with no target is
          // "no-target", never 0%.
          const progress = resolveGoalProgressState(g.targetAmount, g.currentAmount);
          const measured = progress.kind === 'measured';
          const fraction = measured ? Math.min(1, Math.max(0, progress.fraction)) : 0;
          const percentLabel = measured ? `${Math.round(fraction * 100)}%` : null;
          const amountLine = measured
            ? `$${Math.round(g.currentAmount).toLocaleString()} of $${Math.round(g.targetAmount as number).toLocaleString()}`
            : 'No target set yet';
          const trailingPercent = goalPercentageIsTrailing(fontScale);
          return (
            <TouchableOpacity
              style={styles.goalRow}
              activeOpacity={0.7}
              onPress={() => setContributeGoalId(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}, ${amountLine}${percentLabel ? `, ${percentLabel}` : ''}`}
              accessibilityHint="Opens goal details"
              testID="today-goal-row"
            >
              <View style={styles.goalIconTile} importantForAccessibility="no-hide-descendants">
                <Ionicons name="flag-outline" size={15} color={semantic.interactive} />
              </View>
              <View style={styles.goalBody} importantForAccessibility="no-hide-descendants">
                <Text style={styles.goalName} numberOfLines={2}>{g.name}</Text>
                <Text style={styles.goalAmount}>{amountLine}</Text>
                {measured ? (
                  <View style={styles.goalBarWrap}>
                    <ProgressBar progress={fraction} color={semantic.interactive} height={4} />
                  </View>
                ) : null}
                {/* At accessibility sizes the percentage moves below the
                    amounts rather than colliding with them. */}
                {percentLabel && !trailingPercent ? <Text style={styles.goalPercentBelow}>{percentLabel}</Text> : null}
              </View>
              {percentLabel && trailingPercent ? (
                <Text style={styles.goalPercent} importantForAccessibility="no">{percentLabel}</Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} importantForAccessibility="no" />
            </TouchableOpacity>
          );
        })()
      ) : (
        // Wave 5 closure — the no-goal entry.
        //
        // This was a shared UnlockPromptCard: a pale accent-tinted panel
        // whose only tap target was a small filled pill nested inside an
        // otherwise non-actionable card. Three problems. The pill read as a
        // success/confirm action for what is a neutral invitation; the
        // card itself did nothing when pressed, so most of a full-width
        // surface was dead; and the tinted panel competed with the two
        // tiers above it that are genuinely meant to stand out.
        //
        // It is now one calm interactive row on the same flat supporting
        // surface every other Today row uses — whole row pressable, one
        // accessible announcement, Ocean Blue interactive treatment, and
        // no success green anywhere. UnlockPromptCard itself is untouched
        // and still used by the Score unlock below and by other screens.
        //
        // It opens the SAME canonical AddGoalModal every other Goal entry
        // point opens; only the presentation changed.
        <TouchableOpacity
          style={styles.planGoalRow}
          activeOpacity={0.7}
          onPress={() => setGoalModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Plan a goal. Choose what you’re working towards and track progress over time."
          accessibilityHint="Opens the goal form"
          testID="today-plan-goal-row"
        >
          <View style={styles.planGoalIconTile} importantForAccessibility="no-hide-descendants">
            <Ionicons name="flag-outline" size={15} color={semantic.interactive} />
          </View>
          <View style={styles.planGoalBody} importantForAccessibility="no-hide-descendants">
            <Text style={styles.planGoalTitle}>Plan a goal</Text>
            {/* Wraps rather than truncates at large text sizes. */}
            <Text style={styles.planGoalBodyText}>
              Choose what you’re working towards and track progress over time.
            </Text>
            {/* At accessibility sizes the action stacks beneath the copy
                instead of competing with it for the same line. */}
            {stackGoalAction ? <Text style={styles.planGoalActionBelow}>Create goal</Text> : null}
          </View>
          {!stackGoalAction ? (
            <Text style={styles.planGoalAction} importantForAccessibility="no">Create goal</Text>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} importantForAccessibility="no" />
        </TouchableOpacity>
      )}

      {/* Wave 4 closure — with more than one active goal, a visible route to
          the EXISTING full goals list. Reuses that screen and its navigation
          route; no new sheet, no new layer, and Today still renders exactly
          one focus goal. */}
      {activeGoalCount > 1 ? (
        <TouchableOpacity
          style={styles.viewAllGoalsRow}
          onPress={() => navigation.navigate('Goals')}
          accessibilityRole="button"
          accessibilityLabel={`View all goals, ${activeGoalCount} active`}
          accessibilityHint="Opens your full goals list"
          testID="today-view-all-goals"
        >
          <Text style={styles.viewAllGoalsText}>View all goals ({activeGoalCount})</Text>
          <Ionicons name="chevron-forward" size={16} color={semantic.interactive} />
        </TouchableOpacity>
      ) : null}

      {/* 7. Interim Nolie Score — Design 5.1 Wave 5 containment. Demoted
          from prominent Briefing content to a quiet supporting row here,
          after the Goal section. It reads from the existing score result and
          its existing gates; no factor, category, recommendation or history
          changed. One accessible sentence conveys the whole state. */}
      <TouchableOpacity
        style={styles.scoreFootnoteRow}
        onPress={handleScoreChipPress}
        accessibilityRole="button"
        accessibilityLabel={`${scoreChipPresentation.label}. ${scoreChipPresentation.supportingText}`}
        accessibilityHint="Opens how your score is calculated"
        testID="today-score-footnote"
      >
        <View style={styles.scoreFootnoteBody}>
          <Text style={styles.scoreFootnoteLabel}>{scoreChipPresentation.label}</Text>
          <Text style={styles.scoreFootnoteSupport}>{scoreChipPresentation.supportingText}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} />
      </TouchableOpacity>

      {/* Correction pass — recovery/first-run affordances (locked Score,
          incomplete first-run money picture) are genuinely necessary
          capabilities (see UnlockPromptCard.tsx/MoneyPictureChecklistCard.tsx's
          own doc comments) but are NOT one of the six canonical routine
          sections above and must never be interleaved between them — an
          earlier version of this pass placed them between Journey and This
          Month, which broke the Journey -> This Month -> Goal snapshot
          adjacency the six-section contract requires. Moved here, after
          the single contextual-insight slot, alongside the pre-existing
          LoanBalanceReminderCard trailing card this
          screen already used for exactly this kind of occasional,
          self-hiding, non-canonical content — the same established
          pattern, not a new one. Each of the four cards below renders
          nothing (and leaves no gap) when its own condition doesn't apply;
          none of their calculations, actions, or persistence changed —
          only their position on the page. */}
      {/* Wave 9c closure — the legacy "Unlock your Nolie Score" promotion
          card was removed outright: the rebuilt setup checklist above is
          the one canonical first-run guide (its income row completes the
          same condition this card promoted), and Grow's Score hero is the
          canonical Score surface. Nothing else changed — the Score engine,
          its lock gate and the Journey "Score unlocked" milestone are
          untouched, and no spacer, wrapper or accessibility node remains
          for the removed card. */}
      <View style={{ marginTop: spacing.lg }}>
        <LoanBalanceReminderCard />
      </View>

      <ReminderDetailSheet openRequest={reminderOpenRequest} today={currentDate} onFullyClosed={handleReminderSheetFullyClosed} />
      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <AddGoalModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <AddWealthItemModal
        visible={wealthModalVisible}
        kind="asset"
        editAsset={wealthModalEditAsset}
        presetAssetType={wealthModalPresetType}
        onClose={() => {
          setWealthModalVisible(false);
          setWealthModalEditAsset(null);
          setWealthModalPresetType(undefined);
        }}
      />
      <GoalDetailSheet goal={contributeGoal} onClose={() => setContributeGoalId(null)} onCreateAnother={() => setGoalModalVisible(true)} />
    </Screen>
  );
}
