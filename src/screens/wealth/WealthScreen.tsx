import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { MoneyEngineCard } from '../../components/wealth/MoneyEngineCard';
import { TransferModal } from '../../components/wealth/TransferModal';
import { WealthGuideSteps } from '../../components/wealth/WealthGuideSteps';
import { YourFutureCard } from '../../components/wealth/YourFutureCard';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddCreditCardModal } from '../../components/credit/AddCreditCardModal';
import { computeMoneyPlan } from '../../lib/calculations/moneyPlan';
import { useFinancialState, describeFinancialStateForWealthMap } from '../../lib/calculations/financialState';
import { creditCardLiabilityInsight, Tone } from '../../lib/calculations/creditHealth';
import { computeMortgageEquity } from '../../lib/calculations/propertyEquity';
import { computeAccessibleNetWorth, computeRetirementSavings, computeTotalWealth } from '../../lib/calculations/wealthDefinitions';
import { EducationalNote } from '../../components/shared/EducationalNote';
import { InfoSheet } from '../../components/shared/InfoSheet';
import { getUnlockStatus } from '../../lib/unlock';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { Asset, AssetType, CreditCard, Liability, LiabilityType } from '../../types/models';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

const ASSET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  cash: 'wallet-outline',
  savings: 'lock-closed-outline',
  etf: 'trending-up-outline',
  shares: 'bar-chart-outline',
  super: 'shield-outline',
  crypto: 'diamond-outline',
  property: 'home-outline',
  business: 'briefcase-outline',
  car: 'car-outline',
  furniture: 'bed-outline',
  collectibles: 'watch-outline',
  other: 'ellipse-outline',
};

const LIABILITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  mortgage: 'home-outline',
  credit_card: 'card-outline',
  car_loan: 'car-outline',
  personal_loan: 'document-text-outline',
  other: 'ellipse-outline',
};

type CategoryColor = 'accent' | 'navy' | 'market' | 'purple' | 'warning' | 'gold';

// Super gets its own major bucket rather than hiding inside Investments —
// it's a distinct, significant part of most Australians' wealth (PRD ask).
const ASSET_CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: CategoryColor; types: AssetType[] }[] = [
  { key: 'cash', label: 'Cash', icon: 'wallet', color: 'accent', types: ['cash'] },
  { key: 'savings', label: 'Savings', icon: 'lock-closed', color: 'accent', types: ['savings'] },
  { key: 'investments', label: 'Investments', icon: 'trending-up', color: 'market', types: ['etf', 'shares', 'crypto'] },
  { key: 'super', label: 'Retirement Savings', icon: 'shield-checkmark', color: 'gold', types: ['super'] },
  { key: 'property', label: 'Property', icon: 'home', color: 'navy', types: ['property'] },
  { key: 'other', label: 'Other assets', icon: 'briefcase', color: 'purple', types: ['business', 'car', 'furniture', 'collectibles', 'other'] },
];

const LIABILITY_CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: CategoryColor; types: LiabilityType[] }[] = [
  { key: 'mortgage', label: 'Mortgage', icon: 'home', color: 'navy', types: ['mortgage'] },
  { key: 'credit_card', label: 'Credit cards', icon: 'card', color: 'warning', types: ['credit_card'] },
  { key: 'car_loan', label: 'Car loan', icon: 'car', color: 'market', types: ['car_loan'] },
  { key: 'loans', label: 'Loans', icon: 'document-text', color: 'purple', types: ['personal_loan', 'other'] },
];

/** Only ever a real, computable line — never a fabricated per-item trend
 * (PRD's no-fake-data rule extends to "emotional" micro-copy too). */
function toneColor(colors: ReturnType<typeof useTheme>['colors'], tone: Tone): string {
  return { success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.textSecondary }[tone];
}

function assetMicroCopy(asset: Asset): string | null {
  if ((asset.type === 'cash' || asset.type === 'savings') && asset.interestRate) {
    return `Earning ${(asset.interestRate * 100).toFixed(2)}% interest`;
  }
  return null;
}

export function WealthScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, spacing, typography, cardShadow, radius, glow } = useTheme();
  const [modalKind, setModalKind] = useState<'asset' | 'liability' | null>(null);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [editLiability, setEditLiability] = useState<Liability | null>(null);
  const [presetAssetType, setPresetAssetType] = useState<AssetType | undefined>(undefined);
  const [transferVisible, setTransferVisible] = useState(false);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);

  const totalAssets = useMemo(() => data.assets.reduce((sum, a) => sum + a.currentValue, 0), [data.assets]);
  const totalLiabilities = useMemo(() => data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0), [data.liabilities]);
  // Total Wealth = Accessible Net Worth + Retirement Savings — same total
  // as before, but split so retirement savings never reads as money
  // available today (PRD ask, §B1).
  const accessibleNetWorth = useMemo(() => computeAccessibleNetWorth(data), [data]);
  const retirementSavings = useMemo(() => computeRetirementSavings(data), [data]);
  const netWorth = useMemo(() => computeTotalWealth(data), [data]);
  // Single shared signal for "is this user in a recovery-oriented state" —
  // replaces a local `netWorth < 0` check that used to disagree with
  // Today's and Your Future's own independent versions of the same idea
  // (PRD bug report). Never re-derive this locally.
  const financialState = useFinancialState(data);
  const wealthMapStateCopy = useMemo(() => describeFinancialStateForWealthMap(financialState), [financialState]);
  const unlockStatus = useMemo(() => getUnlockStatus(data), [data]);
  // Single source of truth for "how much wealth is this month actually
  // generating" — reuses the exact same Income → Bills → Savings → Goals →
  // Unallocated waterfall as Money Allocation, rather than a second,
  // independent income-minus-expenses figure that could disagree with it
  // (PRD ask: only one "surplus" number across the app).
  const plan = useMemo(() => computeMoneyPlan(data), [data]);
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const [creditCardModalVisible, setCreditCardModalVisible] = useState(false);
  const [wealthChangeSheetVisible, setWealthChangeSheetVisible] = useState(false);
  const [editCreditCard, setEditCreditCard] = useState<CreditCard | null>(null);

  function openModal(kind: 'asset' | 'liability', assetType?: AssetType) {
    setEditAsset(null);
    setEditLiability(null);
    setPresetAssetType(assetType);
    setModalKind(kind);
  }

  function closeModal() {
    setModalKind(null);
    setEditAsset(null);
    setEditLiability(null);
    setPresetAssetType(undefined);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: { borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.md, ...glow(colors.navy) },
        heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        heroLabel: { ...typography.micro, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
        heroValue: { ...typography.title, fontSize: 38, color: colors.onNavy },
        heroDeltaLabel: { ...typography.micro, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: spacing.sm, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
        heroDelta: { ...typography.caption, fontSize: 13, marginTop: 2, color: 'rgba(255,255,255,0.85)' },
        heroDeltaTap: { ...typography.micro, fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
        breakdownLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        breakdownValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        heroSupportive: { ...typography.caption, fontSize: 13, marginTop: spacing.sm, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
        heroSplitRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
        heroSplitBlock: {},
        heroSplitLabel: { ...typography.micro, fontSize: 10, color: 'rgba(255,255,255,0.65)', marginBottom: 1 },
        heroSplitValue: { ...typography.heading, fontSize: 15, color: colors.onNavy },
        transferButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
        },
        transferText: { ...typography.micro, color: colors.onNavy, fontWeight: '700' },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        // A premium wealth-dashboard header, not a plain data-table label
        // (PRD ask) — emoji identity, a one-line "why this matters"
        // subtitle, and the total reads as the headline, not an
        // afterthought next to a "+ Add" link.
        heroSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.xl, marginBottom: spacing.md },
        heroSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
        heroSectionEmoji: { fontSize: 17 },
        heroSectionTitle: { ...typography.heading, fontSize: 16, color: colors.textPrimary, fontWeight: '800' },
        heroSectionSubtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        heroSectionTotal: { ...typography.title, fontSize: 24, color: colors.textPrimary, fontWeight: '800' },
        heroSectionAddButton: {
          alignSelf: 'flex-start',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.pill,
          paddingVertical: 7,
          paddingHorizontal: spacing.md,
          marginTop: 2,
        },
        heroSectionAddText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
        rowLabelBlock: { flex: 1 },
        rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        rowMicro: { ...typography.micro, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
        rowValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginRight: 4 },
        categoryGroup: { marginBottom: spacing.md },
        categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        categoryIconBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
        categoryLabel: { ...typography.heading, fontSize: 13, color: colors.textPrimary, flex: 1 },
        categoryTotal: { ...typography.caption, fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
        emptyCategoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 14,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        emptyCategoryText: { ...typography.caption, fontSize: 13, color: colors.textMuted },
        emptyCategoryLink: { ...typography.caption, fontSize: 13, color: colors.accent, fontWeight: '700' },
        debtFreeBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          padding: spacing.md,
        },
        debtFreeText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '600' },
        goalsCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        goalsSummary: { ...typography.body, fontSize: 14, color: colors.textPrimary },
      }),
    [colors, spacing, typography, cardShadow, radius, glow]
  );

  return (
    <Screen title="Wealth Map" scrollRef={tabScrollRefs.Wealth}>
      <LinearGradient colors={colors.navyGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroLabel}>Total Wealth</Text>
            <Text style={styles.heroValue}>{formatMoney(netWorth)}</Text>
          </View>
          {data.assets.length > 0 ? (
            <TouchableOpacity style={styles.transferButton} onPress={() => setTransferVisible(true)}>
              <Ionicons name="swap-horizontal" size={14} color={colors.onNavy} />
              <Text style={styles.transferText}>Move money</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {data.assets.length > 0 ? (
          <>
            <View style={styles.heroSplitRow}>
              <View style={styles.heroSplitBlock}>
                <Text style={styles.heroSplitLabel}>Accessible Net Worth</Text>
                <Text style={styles.heroSplitValue}>{formatMoney(accessibleNetWorth)}</Text>
              </View>
              {retirementSavings > 0 ? (
                <View style={styles.heroSplitBlock}>
                  <Text style={styles.heroSplitLabel}>Retirement Savings</Text>
                  <Text style={styles.heroSplitValue}>{formatMoney(retirementSavings)}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setWealthChangeSheetVisible(true)} activeOpacity={0.7}>
              <Text style={styles.heroDeltaLabel}>Estimated wealth change this month</Text>
              <Text style={[styles.heroDelta, { color: plan.available >= 0 ? '#8FE0B8' : 'rgba(255,255,255,0.85)' }]}>
                {plan.available >= 0 ? '+' : ''}
                {formatMoney(plan.available)}
                <Text style={styles.heroDeltaTap}>  Tap for breakdown</Text>
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
        {wealthMapStateCopy ? <Text style={styles.heroSupportive}>{wealthMapStateCopy}</Text> : null}
      </LinearGradient>

      {!unlockStatus.wealth_projection ? (
        <SectionCard>
          <WealthGuideSteps
            steps={[
              { label: 'Add Income', done: data.user.monthlyIncome > 0, onPress: () => setIncomeModalVisible(true) },
              { label: 'Add Savings', done: data.assets.some((a) => a.type === 'cash' || a.type === 'savings'), onPress: () => openModal('asset', 'savings') },
              { label: 'Add Investments', done: unlockStatus.portfolio_insight, onPress: () => openModal('asset') },
              { label: 'Build your Wealth Map', done: unlockStatus.wealth_projection, onPress: () => openModal('asset') },
            ]}
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <Text style={styles.sectionTitle}>Your Money Engine</Text>
          <MoneyEngineCard data={data} />
        </SectionCard>
      )}

      {/* Portfolio analysis (asset mix/concentration/growth) is deliberately
          not shown here for MVP — with only a super account or a single
          approximate ETF entered, that reads as investment advice Lulu
          isn't ready to give (PRD ask: keep Wealth to Net Worth, Money
          Engine, Your Future, Journey). Revisit as a "Lulu Portfolio
          Review" premium feature — see PortfolioInsightCard. */}

      {unlockStatus.wealth_projection ? <YourFutureCard /> : null}

      <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.8}>
        <SectionCard style={styles.goalsCard}>
          <Text style={styles.goalsSummary}>
            {activeGoals.length > 0 ? `${activeGoals.length} active ${brand.name} Goal${activeGoals.length > 1 ? 's' : ''}` : 'No goals yet'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.accent} />
        </SectionCard>
      </TouchableOpacity>

      <View style={styles.heroSectionHeader}>
        <View>
          <View style={styles.heroSectionTitleRow}>
            <Text style={styles.heroSectionEmoji}>💎</Text>
            <Text style={styles.heroSectionTitle}>Assets</Text>
          </View>
          <Text style={styles.heroSectionSubtitle}>Everything helping build your wealth</Text>
          <Text style={styles.heroSectionTotal}>{formatMoney(totalAssets)}</Text>
        </View>
        <TouchableOpacity style={styles.heroSectionAddButton} onPress={() => openModal('asset')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.heroSectionAddText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {ASSET_CATEGORIES.map((cat) => {
        const items = data.assets.filter((a) => cat.types.includes(a.type));
        const catTotal = items.reduce((sum, a) => sum + a.currentValue, 0);
        return (
          <View key={cat.key} style={styles.categoryGroup}>
            <View style={styles.categoryHeaderRow}>
              <View style={[styles.categoryIconBadge, { backgroundColor: colors[`${cat.color}Soft`] }]}>
                <Ionicons name={cat.icon} size={14} color={colors[cat.color]} />
              </View>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              {items.length > 0 ? <Text style={styles.categoryTotal}>{formatMoney(catTotal)}</Text> : null}
            </View>
            {items.length === 0 ? (
              <TouchableOpacity style={styles.emptyCategoryRow} onPress={() => openModal('asset', cat.types[0])} activeOpacity={0.7}>
                <Text style={styles.emptyCategoryText}>Not added yet</Text>
                <Text style={styles.emptyCategoryLink}>+ Add</Text>
              </TouchableOpacity>
            ) : (
              items.map((a) => {
                const micro = assetMicroCopy(a);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => {
                      setEditAsset(a);
                      setModalKind('asset');
                    }}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={ASSET_ICONS[a.type] ?? 'ellipse-outline'} size={16} color={colors.textSecondary} />
                    </View>
                    <View style={styles.rowLabelBlock}>
                      <Text style={styles.rowLabel}>{a.label}</Text>
                      {micro ? <Text style={styles.rowMicro}>{micro}</Text> : null}
                    </View>
                    <Text style={styles.rowValue}>{formatMoney(a.currentValue)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        );
      })}

      <View style={styles.heroSectionHeader}>
        <View>
          <View style={styles.heroSectionTitleRow}>
            <Text style={styles.heroSectionEmoji}>🏦</Text>
            <Text style={styles.heroSectionTitle}>Liabilities</Text>
          </View>
          <Text style={styles.heroSectionSubtitle}>Money you are working towards clearing</Text>
          <Text style={styles.heroSectionTotal}>{formatMoney(totalLiabilities)}</Text>
        </View>
        <TouchableOpacity style={styles.heroSectionAddButton} onPress={() => openModal('liability')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.heroSectionAddText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {data.liabilities.length === 0 ? (
        <View style={styles.debtFreeBox}>
          <Ionicons name="checkmark-circle" size={18} color={colors.accentStrong} />
          <Text style={styles.debtFreeText}>You're debt-free 🎉</Text>
        </View>
      ) : (
        LIABILITY_CATEGORIES.map((cat) => {
          const items = data.liabilities.filter((l) => cat.types.includes(l.type));
          if (items.length === 0) return null;
          const catTotal = items.reduce((sum, l) => sum + l.currentBalance, 0);
          return (
            <View key={cat.key} style={styles.categoryGroup}>
              <View style={styles.categoryHeaderRow}>
                <View style={[styles.categoryIconBadge, { backgroundColor: colors[`${cat.color}Soft`] }]}>
                  <Ionicons name={cat.icon} size={14} color={colors[cat.color]} />
                </View>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Text style={styles.categoryTotal}>{formatMoney(catTotal)}</Text>
              </View>
              {items.map((l) => {
                const linkedCard = l.creditCardId ? data.creditCards.find((c) => c.id === l.creditCardId) ?? null : null;
                const ccInsight = linkedCard ? creditCardLiabilityInsight(linkedCard) : null;
                const linkedProperty =
                  l.type === 'mortgage' && l.linkedPropertyAssetId ? data.assets.find((a) => a.id === l.linkedPropertyAssetId) ?? null : null;
                const equity = linkedProperty ? computeMortgageEquity(l, linkedProperty) : null;
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => {
                      // Credit cards carry extra fields (limit, due day,
                      // APR) that the generic liability form doesn't have —
                      // edit them on their own dedicated form so they never
                      // drift out of sync with the card.
                      if (linkedCard) {
                        setEditCreditCard(linkedCard);
                        setCreditCardModalVisible(true);
                        return;
                      }
                      setEditLiability(l);
                      setModalKind('liability');
                    }}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={LIABILITY_ICONS[l.type] ?? 'ellipse-outline'} size={16} color={colors.textSecondary} />
                    </View>
                    <View style={styles.rowLabelBlock}>
                      <Text style={styles.rowLabel}>{l.label}</Text>
                      {ccInsight ? (
                        <Text style={[styles.rowMicro, { color: toneColor(colors, ccInsight.tone) }]}>
                          {ccInsight.text}
                          {ccInsight.usingAssumedApr ? ' (est. rate)' : ''}
                        </Text>
                      ) : null}
                      {equity ? (
                        <Text style={styles.rowMicro}>
                          Estimated equity: {formatMoney(equity.equity)} ({Math.round(equity.equityPct * 100)}%)
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.rowValue}>{formatMoney(l.currentBalance)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })
      )}
      {data.liabilities.some((l) => l.type === 'mortgage' && l.linkedPropertyAssetId) ? (
        <EducationalNote text="Estimated property equity — not an approved borrowing amount or personal financial advice." />
      ) : null}

      <AddWealthItemModal
        visible={modalKind !== null}
        kind={modalKind}
        editAsset={editAsset}
        editLiability={editLiability}
        presetAssetType={presetAssetType}
        onSelectCreditCard={() => {
          setEditCreditCard(null);
          setCreditCardModalVisible(true);
        }}
        onClose={closeModal}
      />
      <TransferModal visible={transferVisible} onClose={() => setTransferVisible(false)} />
      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <AddCreditCardModal
        visible={creditCardModalVisible}
        editCard={editCreditCard}
        onClose={() => {
          setCreditCardModalVisible(false);
          setEditCreditCard(null);
        }}
      />
      <InfoSheet
        visible={wealthChangeSheetVisible}
        onClose={() => setWealthChangeSheetVisible(false)}
        title="Estimated wealth change this month"
        subtitle="The same Income → Bills → Savings → Goals → Unallocated breakdown as Money Allocation — only real activity during this period counts."
      >
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Income</Text>
          <Text style={styles.breakdownValue}>+{formatMoney(data.user.monthlyIncome)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Bills</Text>
          <Text style={styles.breakdownValue}>-{formatMoney(plan.billsSetAside)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Savings allocation</Text>
          <Text style={styles.breakdownValue}>-{formatMoney(plan.emergencySetAside)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Goals</Text>
          <Text style={styles.breakdownValue}>-{formatMoney(plan.goalsSetAside)}</Text>
        </View>
        <View style={[styles.breakdownRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4 }]}>
          <Text style={[styles.breakdownLabel, { fontWeight: '700' }]}>Unallocated</Text>
          <Text style={[styles.breakdownValue, { fontWeight: '700' }]}>
            {plan.available >= 0 ? '+' : ''}
            {formatMoney(plan.available)}
          </Text>
        </View>
        <Text style={{ ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.md }}>
          This assumes bills, your Savings allocation (if you've set one) and goal contributions happen as planned, minus spending
          already recorded this month. Debt repayments, retirement contributions, and manual value changes are reflected directly in
          Your Money Engine and your assets/liabilities below, not folded into this number — so entering an asset or debt you already
          owned never shows up here as new growth or loss.
        </Text>
      </InfoSheet>
    </Screen>
  );
}
