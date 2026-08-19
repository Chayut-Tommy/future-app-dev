import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { UnlockPromptCard } from '../../components/unlock/UnlockPromptCard';
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
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
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
import { computeTopReminder } from '../../lib/calculations/reminders';
import { ReminderOpenRequest, createReminderOpenRequest } from '../../lib/calculations/reminderInteractionLifecycle';
import { selectTodayBriefingEventRows } from '../../lib/calculations/todayBriefing';
import { selectScoreChipPresentation } from '../../lib/calculations/scoreChipPresentation';
import { computeJourneySnapshot } from '../../lib/calculations/journeySnapshot';
import { buildSavingCelebration, buildGoalMilestoneCelebration, buildProfileCompleteCelebration, computeScoreMilestoneCelebration } from '../../lib/celebrations';
import { getUnlockStatus, UNLOCK_COPY } from '../../lib/unlock';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { Asset, AssetType } from '../../types/models';
import { brand } from '../../lib/brand';
import { sendFocusEvent } from '../../lib/accessibilityFocus';

// Confetti + trophy tier reserved for the genuinely big moments (PRD ask) —
// everything else newly-unlocked still gets the existing Journey sheet.
const BIG_TIER_ACHIEVEMENT_IDS = new Set(['first_investment', 'emergency_fund', 'started_super']);

export function TodayScreen() {
  const { data, updateGoal, updateUser, markAchievementsSeen } = useAppState();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { celebrate } = useCelebration();
  const { colors, spacing, typography, radius, glow, cardShadow, minTouchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [wealthModalVisible, setWealthModalVisible] = useState(false);
  const [wealthModalEditAsset, setWealthModalEditAsset] = useState<Asset | null>(null);
  const [wealthModalPresetType, setWealthModalPresetType] = useState<AssetType | undefined>(undefined);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
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
  const topReminder = useMemo(() => computeTopReminder(data, currentDate), [data, currentDate]);
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
  const unlockStatus = useMemo(() => getUnlockStatus(data), [data]);
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
    const fire = () => {
      celebrate({ id: newlyUnlocked.id, tier: isBig ? 'big' : 'small', icon: newlyUnlocked.icon, title: newlyUnlocked.title, body: newlyUnlocked.subtitle });
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

  // "Lulu understands you better now" — fires once, the first time the
  // profile (age + money goal + confidence) becomes fully complete.
  useEffect(() => {
    if (data.user.profileCompletionCelebrated) return;
    if (data.user.age && data.user.moneyGoal && data.user.confidenceLevel) {
      celebrate(buildProfileCompleteCelebration());
      updateUser({ profileCompletionCelebrated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.user.age, data.user.moneyGoal, data.user.confidenceLevel]);

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
        topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        brand: { ...typography.title, fontSize: 20, fontWeight: '800', letterSpacing: 1, color: colors.accent, marginBottom: spacing.xs },
        // Fixed, not part of the scroll content (PRD bug report: on a long
        // Today page, an in-content settings button scrolls out of reach).
        floatingSettings: {
          position: 'absolute',
          // Screen's root View pads by insets.top for its scroll content,
          // but RN's absolute positioning is measured from the parent's
          // border box, not its padding box — so this needs its own
          // insets.top or it lands under the status bar / Dynamic Island.
          top: insets.top + spacing.sm,
          right: spacing.lg,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          ...cardShadow,
        },
        greeting: { ...typography.title, fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        sectionLink: { ...typography.micro, color: colors.accent, fontWeight: '700' },
        goalName: { ...typography.body, fontSize: 15, color: colors.textPrimary, fontWeight: '700', marginBottom: 6 },
        // Wave 4 closure — the multi-goal route. 44pt minimum target.
        viewAllGoalsRow: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        viewAllGoalsText: { ...typography.body, fontWeight: '600', color: colors.accentStrong },
        goalAmount: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 6 },
      }),
    [colors, spacing, typography, radius, glow, cardShadow, insets.top, minTouchTarget]
  );

  return (
    <Screen
      scroll
      contentPadding
      scrollRef={tabScrollRefs.Today}
      overlay={
        <TouchableOpacity
          style={styles.floatingSettings}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} importantForAccessibility="no" />
        </TouchableOpacity>
      }
    >
      <View style={styles.topRow}>
        <Text style={styles.brand}>{brand.name.toUpperCase()}</Text>
      </View>

      {/* 1. Greeting and settings — the emotional handshake, kept outside
          the card so it doesn't read like dashboard content (PRD ask).
          Settings access is the floating overlay button above; the global
          "+"/quick-actions FAB (which now also owns Ask Nolie's fallback
          entry point, see quickActions.ts) is mounted at the navigator
          level, not owned by this screen. No financial-health claim is
          ever added here — greeting wording is unchanged from the accepted
          Pass 2A-2C copy (timeAwareGreeting). */}
      <Text style={styles.greeting}>{greeting}</Text>

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
        today={currentDate}
        scoreChip={scoreChipPresentation}
        presentation={safeToSpendPresentation}
        eventRows={briefingEventRows}
        topReminder={topReminder}
        onPressScoreChip={handleScoreChipPress}
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

      {/* 4. This Month — unchanged: transaction inclusion/exclusion,
          month-to-date boundaries, exact cents, income/spending/net
          totals, payment-source breakdown, flip behaviour, and the
          Transaction History route are all exactly as before this pass. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{monthLabel} so far</Text>
      </View>
      <MonthSnapshotCard today={currentDate} onAddTransaction={() => setTransactionModalVisible(true)} />

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
          const pct = g.targetAmount ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
          return (
            <TouchableOpacity
              onPress={() => setContributeGoalId(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}${
                g.targetAmount ? `, ${Math.round(pct * 100)} percent of $${Math.round(g.targetAmount).toLocaleString()}` : ', no target set yet'
              }`}
              accessibilityHint="Opens goal details"
            >
              <SectionCard>
                <Text style={styles.goalName}>{g.name}</Text>
                {g.targetAmount ? (
                  <>
                    <ProgressBar progress={pct} />
                    <Text style={styles.goalAmount}>
                      {Math.round(pct * 100)}% • ${Math.round(g.currentAmount).toLocaleString()} of ${Math.round(g.targetAmount).toLocaleString()}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.goalAmount}>No target set yet</Text>
                )}
              </SectionCard>
            </TouchableOpacity>
          );
        })()
      ) : (
        <UnlockPromptCard
          icon={UNLOCK_COPY.goal_tracking.icon}
          title={UNLOCK_COPY.goal_tracking.title}
          body={UNLOCK_COPY.goal_tracking.body}
          actionLabel={UNLOCK_COPY.goal_tracking.actionLabel}
          onAction={() => setGoalModalVisible(true)}
        />
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
          <Ionicons name="chevron-forward" size={16} color={colors.accentStrong} />
        </TouchableOpacity>
      ) : null}

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
      <View style={{ marginTop: spacing.lg }}>
        {luluScore.locked ? (
          <UnlockPromptCard
            icon={UNLOCK_COPY.lulu_score.icon}
            title={UNLOCK_COPY.lulu_score.title}
            body={UNLOCK_COPY.lulu_score.body}
            actionLabel={UNLOCK_COPY.lulu_score.actionLabel}
            onAction={() => setIncomeModalVisible(true)}
          />
        ) : null}
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
      <QuickAddModal visible={transactionModalVisible} onClose={() => setTransactionModalVisible(false)} />
    </Screen>
  );
}
