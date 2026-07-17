import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { UnlockPromptCard } from '../../components/unlock/UnlockPromptCard';
import { JourneyTimeline } from '../../components/health/JourneyTimeline';
import { MonthSnapshotCard } from '../../components/today/MonthSnapshotCard';
import { SavingsCoachCard } from '../../components/health/SavingsCoachCard';
import { LuluCheckInCard } from '../../components/today/LuluCheckInCard';
import { LuluRecommendationCard } from '../../components/today/LuluRecommendationCard';
import { FinancialStateCard } from '../../components/today/FinancialStateCard';
import { SavingFactsCard } from '../../components/today/SavingFactsCard';
import { ProfileNudgeCard } from '../../components/today/ProfileNudgeCard';
import { MoneyPictureChecklistCard } from '../../components/today/MoneyPictureChecklistCard';
import { LoanBalanceReminderCard } from '../../components/today/LoanBalanceReminderCard';
import { SmartReminderCard } from '../../components/today/SmartReminderCard';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { AskLuluSheet } from '../../components/navigation/AskLuluSheet';
import { computeLuluScore } from '../../lib/calculations/luluScore';
import { findOpportunities, OpportunityAction } from '../../lib/calculations/opportunities';
import { useFinancialState } from '../../lib/calculations/financialState';
import { computeAchievements } from '../../lib/calculations/achievements';
import { pickDailyInsight } from '../../lib/calculations/dailyInsight';
import { daysUntilDue } from '../../lib/calculations/creditHealth';
import { timeAwareGreeting, computeCheckInLine } from '../../lib/calculations/greeting';
import { buildSavingCelebration, buildGoalMilestoneCelebration, buildProfileCompleteCelebration, computeScoreMilestoneCelebration } from '../../lib/celebrations';
import { getUnlockStatus, UNLOCK_COPY } from '../../lib/unlock';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { Asset, AssetType } from '../../types/models';
import { brand } from '../../lib/brand';

const QUICK_CONTRIBUTE_AMOUNTS = [100, 200, 500];

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
  const [askLuluVisible, setAskLuluVisible] = useState(false);

  const greeting = useMemo(() => timeAwareGreeting(data.user.name, t), [data.user.name, t]);
  const monthLabel = useMemo(() => new Date().toLocaleDateString(undefined, { month: 'long' }), []);
  const luluScore = useMemo(() => computeLuluScore(data), [data]);
  const opportunities = useMemo(() => findOpportunities(data), [data]);
  const topOpportunity = opportunities[0] ?? null;
  const financialState = useFinancialState(data);

  // Cash/savings shortcuts should update the user's existing savings
  // account rather than silently creating a duplicate one (PRD ask) —
  // adding a genuinely separate account is still possible from Wealth's
  // own "+ Add" affordance, which is explicit and intentional.
  function openSavingsFlow() {
    const existingSavings = data.assets.find((a) => a.type === 'savings') ?? data.assets.find((a) => a.type === 'cash');
    setWealthModalEditAsset(existingSavings ?? null);
    setWealthModalPresetType(existingSavings ? undefined : 'savings');
    setWealthModalVisible(true);
  }

  function closeWealthModal() {
    setWealthModalVisible(false);
    setWealthModalEditAsset(null);
    setWealthModalPresetType(undefined);
  }

  const financialStateActions = {
    income: () => setIncomeModalVisible(true),
    bills: () => navigation.navigate('Money'),
    spending: () => navigation.navigate('Transactions'),
  };
  const unlockStatus = useMemo(() => getUnlockStatus(data), [data]);
  const achievements = useMemo(() => computeAchievements(data), [data]);
  const dailyInsight = useMemo(() => pickDailyInsight(data), [data]);

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
  const checkInInsight = checkInLine.insightOverride ? { icon: 'sparkles' as const, text: checkInLine.insightOverride } : dailyInsight;
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  // Derived live from data.goals by id, not a snapshot taken at tap-time —
  // otherwise a contribution that completes a goal wouldn't be reflected
  // in the already-open sheet (PRD bug report: "still behaves like active"
  // right after reaching 100%).
  const contributeGoal = data.goals.find((g) => g.id === contributeGoalId) ?? null;

  const upcomingCards = useMemo(
    () =>
      data.creditCards
        .map((c) => ({ card: c, days: daysUntilDue(c.dueDay) }))
        .filter((c) => c.days <= 7)
        .sort((a, b) => a.days - b.days),
    [data.creditCards]
  );

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

  function handleOpportunityAction(action: OpportunityAction) {
    switch (action) {
      case 'add_asset':
        if (topOpportunity?.investingRelated) {
          setWealthModalEditAsset(null);
          setWealthModalPresetType('etf');
          setWealthModalVisible(true);
        } else {
          openSavingsFlow();
        }
        break;
      case 'add_goal':
        setGoalModalVisible(true);
        break;
      case 'review_spending':
        navigation.navigate('Transactions');
        break;
      case 'manage_cards':
        navigation.navigate('Cards');
        break;
      case 'open_discover':
        navigation.navigate('Grow');
        break;
      case 'open_wealth':
        navigation.navigate('Wealth');
        break;
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
        goalRow: { marginBottom: spacing.lg },
        goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
        goalName: { ...typography.body, fontSize: 13, color: colors.textPrimary },
        goalPercent: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        quickContributeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
        quickButton: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 8,
          borderRadius: radius.control,
          backgroundColor: colors.accentSoft,
        },
        quickButtonOther: { backgroundColor: colors.surfaceMuted },
        quickButtonText: { ...typography.micro, fontSize: 11, color: colors.accentStrong, fontWeight: '700' },
        quickButtonTextOther: { color: colors.textSecondary },
        paymentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
        paymentLabel: { ...typography.caption, fontSize: 13, color: colors.textPrimary },
        paymentDue: { ...typography.micro, color: colors.textSecondary },
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

      {/* 1. Greeting — the emotional handshake, kept outside the card so it
          doesn't read like dashboard content (PRD ask). */}
      <Text style={styles.greeting}>{greeting}</Text>

      {/* 1.5 Guided first-run checklist — a brand-new user otherwise only
          sees a bare "Add income" prompt (PRD bug report). Real completion
          state, not a fabricated onboarding flow. */}
      <MoneyPictureChecklistCard />

      {/* 1.75 Smart reminder — a genuinely time-sensitive "did this happen?"
          confirmation (salary arrived, bill due/overdue) surfaces above the
          daily briefing (PRD ask). Never assumes money moved on its own. */}
      <SmartReminderCard />

      {/* 2. Lulu Daily Check-in — message + score merged into one premium
          AI briefing (PRD ask: understand everything important within 5
          seconds, not two separate cards competing for attention). Tap the
          score to expand into the full breakdown. */}
      <LuluCheckInCard topLine={checkInLine.topLine} insight={checkInInsight} luluScore={luluScore} />
      {luluScore.locked ? (
        <UnlockPromptCard
          icon={UNLOCK_COPY.lulu_score.icon}
          title={UNLOCK_COPY.lulu_score.title}
          body={UNLOCK_COPY.lulu_score.body}
          actionLabel={UNLOCK_COPY.lulu_score.actionLabel}
          onAction={() => setIncomeModalVisible(true)}
        />
      ) : null}

      {/* 4. Your Journey — celebrate progress first (PRD ask: "look how far
          you've come" before Lulu recommends improvement). */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('today.yourJourney')}</Text>
      </View>
      <SectionCard>
        <JourneyTimeline achievements={achievements} />
      </SectionCard>

      {/* 4.5 "X so far" — a live month-to-date pulse check, external header
          for consistency with every other Today section (PRD bug report:
          the title used to live inside the card, unlike everywhere else). */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{monthLabel} so far</Text>
      </View>
      <MonthSnapshotCard />

      {/* 5. Key recommendation — one thing at a time, Lulu talking, not a
          checklist (PRD ask). Comes after Journey: celebrate first, then
          suggest the next step. A non-standard financial state (Cashflow
          Focus / Financial Rebuild) takes over this slot instead — "your
          cashflow is tight" or "your position is rebuilding," never a
          checklist of things going wrong. */}
      {financialState.key !== 'standard' ? (
        <FinancialStateCard state={financialState} actions={financialStateActions} />
      ) : topOpportunity ? (
        <LuluRecommendationCard
          opportunity={topOpportunity}
          onAction={handleOpportunityAction}
          onLearn={() => navigation.navigate('Grow', { scrollTo: 'financial-learning' })}
        />
      ) : null}

      {/* 6. Savings Account Coach, with rotating educational facts underneath. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('today.savingsCoach')}</Text>
      </View>
      <SavingsCoachCard />
      <SavingFactsCard />

      {/* 7. Goals progress — editable right here, no navigation required.
          People think in dollars, not percentages, so quick-contribute
          uses fixed amounts + a free-text "Other" that opens the full
          goal detail sheet. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('today.goalsProgress')}</Text>
      </View>
      {activeGoals.length > 0 ? (
        <SectionCard>
          {activeGoals.map((g) => {
            const pct = g.targetAmount ? Math.min(1, g.currentAmount / g.targetAmount) : 0;
            return (
              <View key={g.id} style={styles.goalRow}>
                <View style={styles.goalHeaderRow}>
                  <Text style={styles.goalName}>{g.name}</Text>
                  {g.targetAmount ? <Text style={styles.goalPercent}>{Math.round(pct * 100)}%</Text> : null}
                </View>
                <ProgressBar progress={pct} />
                {g.targetAmount ? (
                  <View style={styles.quickContributeRow}>
                    {QUICK_CONTRIBUTE_AMOUNTS.map((amount) => (
                      <TouchableOpacity
                        key={amount}
                        style={styles.quickButton}
                        onPress={() => {
                          const newAmount = g.currentAmount + amount;
                          const wasComplete = g.targetAmount !== null && g.currentAmount >= g.targetAmount;
                          const isNowComplete = g.targetAmount !== null && newAmount >= g.targetAmount;
                          updateGoal(g.id, { currentAmount: newAmount, status: isNowComplete ? 'completed' : g.status });
                          celebrate(isNowComplete && !wasComplete ? buildGoalMilestoneCelebration(g.name) : buildSavingCelebration(amount, g.name));
                        }}
                      >
                        <Text style={styles.quickButtonText}>+${amount}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.quickButton, styles.quickButtonOther]} onPress={() => setContributeGoalId(g.id)}>
                      <Text style={[styles.quickButtonText, styles.quickButtonTextOther]}>Other</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </SectionCard>
      ) : (
        <UnlockPromptCard
          icon={UNLOCK_COPY.goal_tracking.icon}
          title={UNLOCK_COPY.goal_tracking.title}
          body={UNLOCK_COPY.goal_tracking.body}
          actionLabel={UNLOCK_COPY.goal_tracking.actionLabel}
          onAction={() => setGoalModalVisible(true)}
        />
      )}

      <View style={{ marginTop: spacing.lg }}>
        <ProfileNudgeCard />
        <LoanBalanceReminderCard />
      </View>

      {upcomingCards.length > 0 ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Upcoming payments</Text>
          {upcomingCards.map(({ card, days }) => (
            <View key={card.id} style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>{card.label}</Text>
              <Text style={styles.paymentDue}>{days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`}</Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <AddGoalModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <AddWealthItemModal
        visible={wealthModalVisible}
        kind="asset"
        editAsset={wealthModalEditAsset}
        presetAssetType={wealthModalPresetType}
        onClose={closeWealthModal}
      />
      <GoalDetailSheet goal={contributeGoal} onClose={() => setContributeGoalId(null)} onCreateAnother={() => setGoalModalVisible(true)} />
      <QuickAddModal visible={transactionModalVisible} onClose={() => setTransactionModalVisible(false)} />
      <AskLuluSheet visible={askLuluVisible} onClose={() => setAskLuluVisible(false)} />
    </Screen>
  );
}
