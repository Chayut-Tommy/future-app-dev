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
import { learningCardsByCategory } from '../../lib/learningCards';
import { LEARNING_PATHS } from '../../lib/learningPaths';
import { computeMoneyOpportunities, MoneyOpportunity } from '../../lib/calculations/moneyOpportunities';
import { computeWealthPaths } from '../../lib/calculations/wealthJourney';
import { computeFutureYouPreview } from '../../lib/calculations/futureYouPreview';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { brand } from '../../lib/brand';

const INVESTING_PATH = LEARNING_PATHS.find((p) => p.id === 'investing')!;
const SAVING_PATH = LEARNING_PATHS.find((p) => p.id === 'saving')!;
const PROPERTY_PATH = LEARNING_PATHS.find((p) => p.id === 'buying_a_home')!;
const DEBT_PATH = LEARNING_PATHS.find((p) => p.id === 'debt_free')!;

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
  const exploreMoneyMovesY = useRef(0);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [cashModalVisible, setCashModalVisible] = useState(false);

  const opportunities = useMemo(() => computeMoneyOpportunities(data), [data]);
  const journeyPaths = useMemo(() => computeWealthPaths(data), [data]);
  const futureYouPreview = useMemo(() => computeFutureYouPreview(data), [data]);
  const firstName = data.user.name?.trim() ? data.user.name.trim() : null;

  // Investment nudges land here on purpose (PRD ask: "Learn the basics
  // with Lulu" should actually open on investing content, not just the
  // top of Grow).
  useEffect(() => {
    if (route.params?.scrollTo === 'financial-learning') {
      const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: exploreMoneyMovesY.current, animated: true }), 250);
      return () => clearTimeout(timer);
    }
  }, [route.params]);

  function handleOpportunityAction(opportunity: MoneyOpportunity) {
    switch (opportunity.action) {
      case 'compare_savings':
        navigation.navigate('SavingsComparison');
        break;
      case 'open_money':
        navigation.navigate('Money');
        break;
      case 'open_investing_path':
        scrollRef.current?.scrollTo({ y: exploreMoneyMovesY.current, animated: true });
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
      <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="flag-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>When will I reach my goal?</Text>
            <Text style={styles.navBody}>Set a target and see your projected completion date</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>
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
      <Text style={styles.categoryTitle} onLayout={(e) => (exploreMoneyMovesY.current = e.nativeEvent.layout.y)}>
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
      <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.8}>
        <SectionCard style={styles.navCard}>
          <View style={styles.navIcon}>
            <Ionicons name="wallet-outline" size={20} color={colors.market} />
          </View>
          <View style={styles.navTextBlock}>
            <Text style={styles.navTitle}>Deposit tracker</Text>
            <Text style={styles.navBody}>Set a property deposit goal and {brand.name} tracks your progress</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </SectionCard>
      </TouchableOpacity>
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
