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
import { SavingsCoachCard } from '../../components/health/SavingsCoachCard';
import { LuluCheckInCard } from '../../components/today/LuluCheckInCard';
import { LuluRecommendationCard } from '../../components/today/LuluRecommendationCard';
import { DebtRecoveryCard, DebtRecoveryAction } from '../../components/today/DebtRecoveryCard';
import { SavingFactsCard } from '../../components/today/SavingFactsCard';
import { AchievementCelebrationSheet } from '../../components/today/AchievementCelebrationSheet';
import { ProfileNudgeCard } from '../../components/today/ProfileNudgeCard';
import { MoneyPictureChecklistCard } from '../../components/today/MoneyPictureChecklistCard';
import { LoanBalanceReminderCard } from '../../components/today/LoanBalanceReminderCard';
import { SmartReminderCard } from '../../components/today/SmartReminderCard';
import { DebtCoachSheet } from '../../components/debt/DebtCoachSheet';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { AskLuluSheet } from '../../components/navigation/AskLuluSheet';
import { computeLuluScore } from '../../lib/calculations/luluScore';
import { findOpportunities, OpportunityAction } from '../../lib/calculations/opportunities';
import { computeDebtRecoveryStatus } from '../../lib/calculations/debtRecovery';
import { computeAchievements, Achievement } from '../../lib/calculations/achievements';
import { pickDailyInsight } from '../../lib/calculations/dailyInsight';
import { daysUntilDue } from '../../lib/calculations/creditHealth';
import { timeAwareGreeting, computeCheckInLine } from '../../lib/calculations/greeting';
import { buildSavingCelebration, buildGoalMilestoneCelebration, buildProfileCompleteCelebration } from '../../lib/celebrations';
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
  const [celebrating, setCelebrating] = useState<Achievement | null>(null);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);

  const greeting = useMemo(() => timeAwareGreeting(data.user.name, t), [data.user.name, t]);
  const luluScore = useMemo(() => computeLuluScore(data), [data]);
  const opportunities = useMemo(() => findOpportunities(data), [data]);
  const topOpportunity = opportunities[0] ?? null;
  const debtRecovery = useMemo(() => computeDebtRecoveryStatus(data), [data]);

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

  const debtRecoveryActions: DebtRecoveryAction[] = [
    { key: 'income', label: 'Add income', icon: 'cash-outline', onPress: () => setIncomeModalVisible(true) },
    { key: 'bills', label: 'Add bills', icon: 'calendar-outline', onPress: () => navigation.navigate('Money') },
    { key: 'spending', label: 'Review spending', icon: 'search-outline', onPress: () => navigation.navigate('Transactions') },
    { key: 'debt', label: 'Pay down debt', icon: 'card-outline', onPress: () => setDebtCoachVisible(true) },
    { key: 'buffer', label: 'Build buffer', icon: 'shield-outline', onPress: openSavingsFlow },
  ];
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
  // full-screen confetti tier; everything else keeps the existing sheet.
  //
  // Deferred, not synchronous (PRD bug report: "Got it" / "Improve my
  // score" / "View full journey" all stop receiving touches after adding
  // income/savings/assets/debt). Root cause: saving in an add/edit modal
  // updates `data` and calls its own onClose() in the very same tick — if
  // that data change also unlocks an achievement, this effect used to
  // present a brand-new Modal (AchievementCelebrationSheet or the "big"
  // tier) in that identical tick. Two RN <Modal> components swapping
  // presentation on iOS in the same commit is a known native race (the
  // closing modal's dismiss can interrupt the new one's present) that
  // leaves the underlying screen's view with touch interaction disabled —
  // invisible, but nothing responds. Waiting until `data` has stopped
  // changing for a beat lets the closing modal's native dismiss transition
  // finish first, so the celebration Modal is always the only one animating.
  useEffect(() => {
    if (celebrating) return;
    const newlyUnlocked = achievements.find((a) => a.unlocked && !data.seenAchievementIds.includes(a.id));
    if (!newlyUnlocked) return;
    const timer = setTimeout(() => {
      if (BIG_TIER_ACHIEVEMENT_IDS.has(newlyUnlocked.id)) {
        celebrate({ id: newlyUnlocked.id, tier: 'big', icon: newlyUnlocked.icon, title: newlyUnlocked.title, body: newlyUnlocked.subtitle });
        markAchievementsSeen([newlyUnlocked.id]);
      } else {
        setCelebrating(newlyUnlocked);
      }
    }, 400);
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

  function closeCelebration() {
    markAchievementsSeen(achievements.filter((a) => a.unlocked).map((a) => a.id));
    setCelebrating(null);
  }

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

      {/* 5. Key recommendation — one thing at a time, Lulu talking, not a
          checklist (PRD ask). Comes after Journey: celebrate first, then
          suggest the next step. Debt Recovery Mode takes over this slot
          when the numbers are hard — "you're rebuilding," not a checklist
          of things going wrong. */}
      {debtRecovery.active ? (
        <DebtRecoveryCard status={debtRecovery} actions={debtRecoveryActions} />
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
      <AchievementCelebrationSheet achievement={celebrating} onClose={closeCelebration} />
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
    </Screen>
  );
}
