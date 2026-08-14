import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
import { LuluCheckInCard } from '../../components/today/LuluCheckInCard';
import { FinancialStateCard } from '../../components/today/FinancialStateCard';
import { ProfileNudgeCard } from '../../components/today/ProfileNudgeCard';
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
import { useFinancialState } from '../../lib/calculations/financialState';
import { computeAchievements } from '../../lib/calculations/achievements';
import { pickTodayContextualInsight } from '../../lib/calculations/todayContextualInsight';
import { timeAwareGreeting, computeCheckInLine } from '../../lib/calculations/greeting';
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

// Confetti + trophy tier reserved for the genuinely big moments (PRD ask) —
// everything else newly-unlocked still gets the existing Journey sheet.
const BIG_TIER_ACHIEVEMENT_IDS = new Set(['first_investment', 'emergency_fund', 'started_super']);

export function TodayScreen() {
  const { data, updateGoal, updateUser, markAchievementsSeen } = useAppState();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { celebrate } = useCelebration();
  const { colors, spacing, typography, radius, glow, cardShadow } = useTheme();
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

  // Round 6 correction — the single live local-date value this screen's
  // month heading and relative-day labels derive from; see
  // useCurrentLocalDate's own doc comment for why a mount-frozen or
  // data-change-only `new Date()` capture goes stale across a midnight/
  // month rollover with no new transaction to trigger a recompute.
  const currentDate = useCurrentLocalDate();
  const greeting = useMemo(() => timeAwareGreeting(data.user.name, t), [data.user.name, t]);
  const monthLabel = useMemo(() => currentDate.toLocaleDateString(undefined, { month: 'long' }), [currentDate]);
  const luluScore = useMemo(() => computeLuluScore(data), [data]);
  const financialState = useFinancialState(data);

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
  const hasActiveGoal = data.goals.some((g) => g.status === 'active');
  const financialStateActions = {
    income: () => setIncomeModalVisible(true),
    bills: () => navigation.navigate('Money'),
    spending: () => navigation.navigate('Transactions'),
    // Financial Rebuild only — the existing Wealth tab route (net worth is
    // shown there, no new/duplicate destination).
    reviewNetWorth: () => navigation.navigate('Wealth'),
    // Financial Rebuild only — existing Goals route when a goal already
    // exists, the existing AddGoalModal when it doesn't.
    goal: () => (hasActiveGoal ? navigation.navigate('Goals') : setGoalModalVisible(true)),
  };
  const unlockStatus = useMemo(() => getUnlockStatus(data), [data]);
  const achievements = useMemo(() => computeAchievements(data), [data]);
  const journeySnapshot = useMemo(() => computeJourneySnapshot(achievements), [achievements]);
  // Pass 2D — Today's single contextual-insight slot (final hierarchy §6).
  // Only computed/shown when the financial state is standard — a non-
  // standard state (cashflow tight / rebuilding) takes override priority
  // over this slot entirely (see the JSX below), the same mutual-
  // exclusivity the pre-Pass-2D FinancialStateCard/LuluRecommendationCard
  // pairing already had. Still deduplicated against Journey's own "next
  // milestone" via the exact same achievement-id comparison Pass 2B
  // established (journeySnapshot.next?.id) — see
  // todayContextualInsight.ts's own doc comment for why milestone/score
  // entries are never eligible for this slot at all, by construction.
  const contextualInsight = useMemo(
    () => (financialState.key === 'standard' ? pickTodayContextualInsight(data, journeySnapshot.next?.id ?? null) : null),
    [financialState.key, data, journeySnapshot.next]
  );

  // Real, in-session signal for "the user just did something" — not a
  // fabricated claim (PRD ask: Lulu's check-in line must stay honest about
  // what it's actually done).
  const dataFingerprint = `${data.user.monthlyIncome}|${data.assets.length}|${data.liabilities.length}|${data.creditCards.length}|${data.goals.length}|${data.transactions.length}|${data.recurringItems.length}`;
  const [actedThisSession, setActedThisSession] = useState(false);
  const dataFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (dataFingerprintRef.current === null) {
      dataFingerprintRef.current = dataFingerprint;
      return;
    }
    if (dataFingerprint !== dataFingerprintRef.current) {
      dataFingerprintRef.current = dataFingerprint;
      setActedThisSession(true);
    }
  }, [dataFingerprint]);
  const checkInLine = useMemo(
    () => computeCheckInLine({ firstOpenedAt: data.user.firstOpenedAt, actedThisSession }),
    [data.user.firstOpenedAt, actedThisSession]
  );
  // Pass 2D — the single active-goal snapshot (final hierarchy §3). The
  // exact same source and order Grow's own "Your goals" list already
  // reads (data.goals, creation order, no new ranking rule) — just the
  // first one, since Today now shows one compact snapshot rather than the
  // full list. Full multi-goal management (reorder, priority, all goals)
  // remains exclusively in Grow, unchanged.
  const primaryActiveGoal = data.goals.find((g) => g.status === 'active') ?? null;
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

  // Correction pass — the shared AUP presentation now owns its own action
  // declaratively (safeToSpendPresentation.action), rather than this screen
  // hard-coding a single navigate() call independent of state. Every state
  // currently resolves to the same action (focus Money's existing AUP
  // section, whose own per-state CTA already owns the actual recovery
  // journey) — this switch exists so that ownership is genuinely read from
  // the presentation, not merely declared on its type and then ignored.
  //
  // Final Pass 2D device-test correction, §9 — stamps a fresh
  // scrollToRequestId (reusing the exact same monotonic counter Grow's own
  // focus requests already use below — a single shared sequence is safe
  // since Money and Grow each compare requestId only within their own
  // pending-focus module) so a repeat tap on the AUP tile is always a
  // genuine, detectable navigation change, never silently swallowed by
  // React Navigation treating identical params as unchanged.
  function handleBriefingAupPress() {
    if (safeToSpendPresentation.action.kind === 'focus_money_section') {
      focusRequestIdRef.current += 1;
      navigation.navigate('Money', { scrollTo: safeToSpendPresentation.action.section, scrollToRequestId: focusRequestIdRef.current });
    }
  }

  // Pass 2B — both compact presentations' destinations reuse the exact same
  // stable section-focus architecture as the AUP row above (Grow's own
  // pending-focus mechanism, corrected this pass — see DiscoverScreen.tsx),
  // never a hard-coded pixel offset and never a new duplicate Score/Journey
  // screen.
  //
  // Pass 2B correction — every Grow section-focus request (score, journey,
  // and the pre-existing financial-learning) is stamped with a fresh,
  // monotonically increasing id from this single shared counter. Grow's own
  // pending-focus effect keys off {scrollTo, scrollToRequestId} together,
  // not scrollTo alone: if it only read scrollTo, a second rapid tap on the
  // same section would navigate with an identical params object and React
  // Navigation would treat it as no change, silently swallowing the repeat
  // tap. The id makes every intentional tap a genuine, detectable change,
  // even back-to-back taps on the exact same section. Pass 2D reuses this
  // exact same counter/mechanism for the new contextual-insight and goal-
  // snapshot destinations — no second, parallel navigation system.
  const focusRequestIdRef = useRef(0);
  function navigateToGrow(scrollTo: string) {
    focusRequestIdRef.current += 1;
    navigation.navigate('Grow', { scrollTo, scrollToRequestId: focusRequestIdRef.current });
  }
  function handleScoreChipPress() {
    navigateToGrow('score');
  }
  function handleJourneyPress() {
    navigateToGrow('journey');
  }
  // Pass 2D — the one contextual insight's own destination, computed by
  // pickTodayContextualInsight (see that module's own doc comment for the
  // three-source priority this reuses). 'transactions' routes to the exact
  // same screen the retired LuluRecommendationCard's review_spending action
  // already used for this identical goalImpact entry.
  function handleContextualInsightPress() {
    if (!contextualInsight) return;
    if (contextualInsight.destination.kind === 'grow_focus') navigateToGrow(contextualInsight.destination.target);
    else navigation.navigate('Transactions');
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
        goalAmount: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 6 },
      }),
    [colors, spacing, typography, radius, glow, cardShadow, insets.top]
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
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      }
    >
      <View style={styles.topRow}>
        <Text style={styles.brand}>{brand.name.toUpperCase()}</Text>
      </View>

      {/* 1. Greeting and settings — the emotional handshake, kept outside
          the card so it doesn't read like dashboard content (PRD ask).
          Settings access is the floating overlay button above; the AI and
          Add controls are mounted at the navigator level (FloatingLuluButton
          / the global + button), not owned by this screen. No financial-
          health claim is ever added here — greeting wording is unchanged
          from the accepted Pass 2A-2C copy (timeAwareGreeting). */}
      <Text style={styles.greeting}>{greeting}</Text>

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
        onPressEventRow={() => {
          // Final Pass 2D device-test correction, §9 — same requestId fix
          // as handleBriefingAupPress above: this destination shares the
          // identical underlying pending-focus mechanism in MoneyScreen.tsx
          // (moneySectionFocus.ts), so it needed the identical correction.
          focusRequestIdRef.current += 1;
          navigation.navigate('Money', { scrollTo: 'timeline', scrollToRequestId: focusRequestIdRef.current });
        }}
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
        <Text style={styles.sectionTitle}>{monthLabel} so far</Text>
      </View>
      <MonthSnapshotCard today={currentDate} onAddTransaction={() => setTransactionModalVisible(true)} />

      {/* 5. Compact goal snapshot (Pass 2D) — exactly one active-goal
          summary, or one clear empty action; replaces the previous
          full-list-with-inline-quick-contribute-buttons presentation. The
          same existing goal source/order (data.goals, unsorted, first
          active) and the same existing GoalDetailSheet destination (richer
          contribution/progress-update controls live there already, so
          nothing accepted is lost — only the long inline Today treatment
          is gone). Achieved/archived goals are never shown here (status
          filter is 'active' only, the exact same filter Grow's own list
          already used). */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your goal</Text>
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

      {/* 6. Contextual insight — zero or one only (Pass 2D). A non-standard
          financial state (cashflow tight / rebuilding) takes override
          priority over this slot — the same established, unmodified
          computeFinancialState signal and FinancialStateCard presentation
          Today already used, just repositioned into this final slot rather
          than an earlier "recommendation" position. Otherwise, at most one
          of the three established insight sources (emergency savings,
          savings-rate, or an existing factual daily insight) renders via
          the existing LuluCheckInCard presentation — nothing shows here at
          all when neither applies, so no empty gap is left. */}
      {financialState.key !== 'standard' ? (
        <FinancialStateCard state={financialState} actions={financialStateActions} hasActiveGoal={hasActiveGoal} />
      ) : contextualInsight ? (
        <TouchableOpacity onPress={handleContextualInsightPress} activeOpacity={0.8} accessibilityRole="button" accessibilityHint="Opens the related section">
          <LuluCheckInCard topLine={checkInLine.topLine} insight={contextualInsight} />
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
          ProfileNudgeCard/LoanBalanceReminderCard trailing cards this
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
        <MoneyPictureChecklistCard />
        <ProfileNudgeCard />
        <LoanBalanceReminderCard />
      </View>

      <ReminderDetailSheet openRequest={reminderOpenRequest} today={currentDate} />
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
