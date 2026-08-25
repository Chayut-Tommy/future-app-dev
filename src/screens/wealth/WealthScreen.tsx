import React, { useMemo, useRef, useState } from 'react';
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
import { useFinancialState, describeFinancialStateForWealthMap } from '../../lib/calculations/financialState';
import { creditCardLiabilityInsight, Tone } from '../../lib/calculations/creditHealth';
import { computeMortgageEquity } from '../../lib/calculations/propertyEquity';
import { computeAccessibleNetWorth, computeRetirementSavings, computeTotalWealth, RETIREMENT_ASSET_TYPE } from '../../lib/calculations/wealthDefinitions';
import {
  WEALTH_SCREEN_TITLE,
  liabilityDateLine,
  resolveLiabilityRowTone,
  liabilityRowToneIcon,
  WealthRowTone,
  NET_WORTH_LABEL,
  NET_WORTH_FORMULA,
  OWN_LABEL,
  OWE_LABEL,
  formatWealthAmount,
  isDisplayableAmount,
  spokenWealthAmount,
  composeNetWorthAnnouncement,
  composeOwnOweAnnouncement,
  resolveOwnOweProportions,
  resolveRetirementPresence,
  composeBreakdownItems,
  composeBreakdownTriggerLabel,
  BREAKDOWN_TRIGGER_TEXT,
  resolveDisclosure,
  WEALTH_DEFINITIONS,
  resolveRecordFreshness,
} from '../../lib/calculations/wealthComposition';
import { EducationalNote } from '../../components/shared/EducationalNote';
import { InfoSheet } from '../../components/shared/InfoSheet';
import { getUnlockStatus } from '../../lib/unlock';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { sendFocusEvent } from '../../lib/accessibilityFocus';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import { Asset, AssetType, CreditCard, Liability, LiabilityType } from '../../types/models';

const ASSET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  cash: 'wallet-outline',
  savings: 'lock-closed-outline',
  everyday: 'card-outline',
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
  bnpl: 'bag-handle-outline',
};

type CategoryColor = 'accent' | 'navy' | 'market' | 'purple' | 'warning' | 'gold';

/* Wave 7 — the plain-words type shown on each row, so a customer can tell
   two similarly-named records apart without opening either. These are the
   same category names the removed headers used, said per row instead. */
const ASSET_TYPE_LABEL: Record<string, string> = {
  cash: 'Cash',
  everyday: 'Everyday account',
  savings: 'Savings',
  etf: 'ETF',
  shares: 'Shares',
  crypto: 'Crypto',
  super: 'Retirement savings',
  property: 'Property',
  business: 'Business',
  car: 'Vehicle',
  furniture: 'Household',
  collectibles: 'Collectibles',
  other: 'Other asset',
};

const LIABILITY_TYPE_LABEL: Record<string, string> = {
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
  car_loan: 'Car loan',
  personal_loan: 'Personal loan',
  bnpl: 'Buy now, pay later',
  other: 'Other debt',
};

// Super gets its own major bucket rather than hiding inside Investments —
// it's a distinct, significant part of most Australians' wealth (PRD ask).
const ASSET_CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: CategoryColor; types: AssetType[] }[] = [
  // Everyday Account correction (2026-08-08) — folded into the existing
  // Cash category (relabelled) rather than a new top-level category, per
  // the explicit product decision. Each account still renders as its own
  // individually-tappable row below (items.map) — only the category
  // header/total is shared. Savings stays separately classified, unchanged.
  { key: 'cash', label: 'Cash & accounts', icon: 'wallet', color: 'accent', types: ['cash', 'everyday'] },
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
  // BNPL is its own category, not folded into 'loans' — LIABILITY_CATEGORIES
  // is a plain array (not a Record<LiabilityType, ...>), so it is NOT
  // compiler-enforced to cover every LiabilityType; a type left out here
  // would silently vanish from this list while still counting in
  // totalLiabilities above. Every LiabilityType must have an explicit entry
  // in exactly one category.
  { key: 'bnpl', label: 'Buy Now, Pay Later', icon: 'bag-handle', color: 'gold', types: ['bnpl'] },
];

/** Only ever a real, computable line — never a fabricated per-item trend
 * (PRD's no-fake-data rule extends to "emotional" micro-copy too). */
/**
 * Wave 7 correction D — the Wealth row's own ink, from the remapped tone.
 * Reads the semantic family, never the legacy `colors.danger` for something
 * that is merely soon.
 */
function wealthToneColor(
  semantic: ReturnType<typeof useTheme>['semantic'],
  colors: ReturnType<typeof useTheme>['colors'],
  tone: WealthRowTone
): string {
  if (tone === 'urgent') return semantic.urgentText;
  if (tone === 'caution') return semantic.warningAccent;
  if (tone === 'positive') return semantic.success;
  return colors.textSecondary;
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
  const { colors, spacing, typography, cardShadow, radius, glow, semantic } = useTheme();
  const breakdownRef = useRef<any>(null);
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  /* The sheet's fixed "today", read once per render from the shared local-date
     hook — never a fresh `new Date()` inside a row. Only the (currently
     inactive) freshness state consumes it. */
  const currentDate = useCurrentLocalDate();
  /* Wave 7 correction B — the SAME shipped role resolver Money and Today
     use, so Wealth stops being the one tab on a legacy scale. */
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [assetsExpanded, setAssetsExpanded] = useState(false);
  const [debtsExpanded, setDebtsExpanded] = useState(false);
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

  /* Wave 7 — presentation derived from the figures above. Nothing is
     recomputed: the hero, the bar and the breakdown all read the SAME
     engine outputs Wealth already had. */
  const heroAnnouncement = useMemo(
    () => composeNetWorthAnnouncement({ netWorth, totalAssets, totalLiabilities }),
    [netWorth, totalAssets, totalLiabilities]
  );
  const ownOweAnnouncement = useMemo(() => composeOwnOweAnnouncement(totalAssets, totalLiabilities), [totalAssets, totalLiabilities]);
  const proportions = useMemo(() => resolveOwnOweProportions(totalAssets, totalLiabilities), [totalAssets, totalLiabilities]);
  /* Presence is decided by whether a retirement asset EXISTS, never by its
     value — so a genuinely recorded $0 stays "$0" and only a true absence
     reads "Not recorded". */
  const retirementPresence = useMemo(
    () => resolveRetirementPresence(data.assets.filter((a) => a.type === RETIREMENT_ASSET_TYPE).length),
    [data.assets]
  );
  const breakdownItems = useMemo(
    () => composeBreakdownItems({ totalAssets, totalLiabilities, netWorth, accessibleNetWorth, retirementSavings, retirementPresence }),
    [totalAssets, totalLiabilities, netWorth, accessibleNetWorth, retirementSavings, retirementPresence]
  );
  const breakdownTriggerLabel = useMemo(
    () => composeBreakdownTriggerLabel({ totalAssets, totalLiabilities, netWorth }),
    [totalAssets, totalLiabilities, netWorth]
  );

  /* Wave 7 — one list per section, in the EXISTING canonical order: the
     established category order, and each category's own items within it.
     This wave introduces no new financial sort; it only stops the order
     being interrupted by six category headers. A zero-balance row is kept —
     a cleared debt or emptied account is a fact the customer recorded, and
     dropping it would make the section disagree with the total above. */
  const assetRows = useMemo(
    () => ASSET_CATEGORIES.flatMap((cat) => data.assets.filter((a) => cat.types.includes(a.type))),
    [data.assets]
  );
  const liabilityRows = useMemo(
    () => LIABILITY_CATEGORIES.flatMap((cat) => data.liabilities.filter((l) => cat.types.includes(l.type))),
    [data.liabilities]
  );
  const assetDisclosure = useMemo(() => resolveDisclosure(assetRows, 'assets', assetsExpanded), [assetRows, assetsExpanded]);
  const debtDisclosure = useMemo(() => resolveDisclosure(liabilityRows, 'debts', debtsExpanded), [liabilityRows, debtsExpanded]);
  const [creditCardModalVisible, setCreditCardModalVisible] = useState(false);
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
        /* Wave 7 — ONE hero, on the Design 5.1 featured hero surface. The
           navy gradient it replaces was a legacy treatment that carried its
           own on-navy colour family and made the figure the only readable
           thing on the screen. */
        hero: {
          borderRadius: radius.card,
          padding: spacing.xl,
          marginBottom: spacing.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
        },
        heroHeadBlock: { flex: 1, minWidth: 0 },
        heroIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
        heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.heroBorder, marginVertical: spacing.md },
        heroNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
        heroNote: { ...typeStyle('meta', locale), color: semantic.warningAccent, flexShrink: 1 },
        heroValuePositive: { color: semantic.textFigure },
        heroValueNeutral: { color: colors.textPrimary },
        heroValueNegative: { color: semantic.warningAccent },
        heroIdentityTile: { width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.interactiveTint, alignItems: 'center', justifyContent: 'center' },
        breakdownAffordance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: spacing.sm, minHeight: 44 },
        breakdownAffordanceText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        /* Ocean Blue figure treatment. Never success green for a positive
           net worth and never urgent red for a negative one — the sign of a
           customer's net worth is a fact, not an alarm. */
        heroFormula: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: spacing.xs },
        reconcileRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
        reconcileSide: { flexShrink: 1 },
        reconcileSideRight: { alignItems: 'flex-end' },
        reconcileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        /* Colour is never the only distinction — every side is also named,
           and the swatch is hidden from the accessibility tree. */
        reconcileSwatch: { width: 8, height: 8, borderRadius: 4 },
        reconcileSwatchOwn: { backgroundColor: semantic.interactive },
        reconcileSwatchOwe: { backgroundColor: semantic.warningAccent },
        reconcileLabel: { ...typeStyle('meta', locale), color: colors.textSecondary },
        reconcileValue: { ...typeStyle('figureLarge', locale), color: colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
        reconcileBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: spacing.md, backgroundColor: colors.surfaceMuted },
        reconcileFill: { height: '100%' },
        reconcileFillOwn: { backgroundColor: semantic.interactive },
        /* Debt uses the restrained warm family, never destructive red — a
           mortgage is not an error. */
        reconcileFillOwe: { backgroundColor: semantic.warningAccent },
        disclosureButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.pill, borderWidth: 2, borderColor: semantic.interactive, marginTop: spacing.xs, marginBottom: spacing.md },
        disclosureText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        rowRecorded: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 1 },
        /* Wave 7 — the stale visual, wired but unreachable while
           STALE_TRIGGER_ENABLED is false. Kept real so a future wave that
           agrees a threshold turns one constant on rather than rebuilding
           this. */
        rowRecordedStale: { color: semantic.warningAccent },
        rowStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
        sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
        sectionHeadText: { flexShrink: 1 },
        sectionHeadTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        sectionHeadTotal: { ...typeStyle('figureLarge', locale), color: colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
        sectionAddButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2, borderColor: semantic.interactive },
        sectionAddText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        emptySection: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, marginBottom: spacing.md },
        emptyTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary },
        emptyBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
        emptyAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2, borderColor: semantic.interactive },
        emptyActionText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md, paddingVertical: spacing.sm },
        breakdownRowEmphasis: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginVertical: spacing.xs },
        breakdownLabelEmphasis: { fontWeight: '700', color: colors.textPrimary },
        breakdownValueEmphasis: { ...typeStyle('figureLarge', locale), color: semantic.textFigure },
        breakdownAddAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2, borderColor: semantic.interactive, marginTop: spacing.xs, marginBottom: spacing.md },
        breakdownAddText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        definitionBlock: { marginBottom: spacing.md },
        definitionTerm: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 2 },
        definitionBody: { ...typeStyle('support', locale), color: colors.textSecondary },
        heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        heroLabel: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        heroValue: { ...typeStyle('figureHero', locale), fontVariant: ['tabular-nums'] },
        heroValueTabular: { fontVariant: ['tabular-nums'] },
        breakdownLabel: { ...typeStyle('body', locale), color: colors.textSecondary, flexShrink: 1 },
        breakdownValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, fontVariant: ['tabular-nums'] },
        heroSupportive: { ...typeStyle('support', locale), marginTop: spacing.md, color: semantic.textSecondary },
        transferButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: semantic.interactiveTint,
          borderRadius: radius.pill,
          minHeight: 44,
          paddingHorizontal: spacing.md,
        },
        transferText: { ...typeStyle('meta', locale), color: semantic.interactive, fontWeight: '700' },
        // A premium wealth-dashboard header, not a plain data-table label
        // (PRD ask) — emoji identity, a one-line "why this matters"
        // subtitle, and the total reads as the headline, not an
        // afterthought next to a "+ Add" link.
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
        rowLabel: { ...typeStyle('body', locale), color: colors.textPrimary },
        rowMicro: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 1 },
        rowValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, marginRight: 4, fontVariant: ['tabular-nums'] },
        debtFreeBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          padding: spacing.md,
        },
        debtFreeText: { ...typeStyle('support', locale), color: colors.accentStrong, fontWeight: '600' },
      }),
    [colors, spacing, typography, cardShadow, radius, glow, semantic, locale]
  );

  /* Wave 7 correction C — the hero's ink by sign. Positive stays Ocean
     interactive (never success green: a positive net worth is a fact, not
     an achievement Nolie is congratulating). Exact zero is neutral.
     Negative uses the warning family plus the note below — never the
     destructive red this app reserves for irreversible acts. */
  const netWorthSign: 'positive' | 'zero' | 'negative' = !isDisplayableAmount(netWorth)
    ? 'zero'
    : netWorth > 0
    ? 'positive'
    : netWorth < 0
    ? 'negative'
    : 'zero';
  const heroInkStyle =
    netWorthSign === 'negative' ? styles.heroValueNegative : netWorthSign === 'zero' ? styles.heroValueNeutral : styles.heroValuePositive;


  return (
    <Screen title={WEALTH_SCREEN_TITLE} scrollRef={tabScrollRefs.Wealth}>
      {/* PASS A — copy only.

          The figure below is `computeTotalWealth(data)`, exactly as before.
          It is not recomputed here, and no second total is introduced. The
          engine's own identity is `accessibleNetWorth + retirement`, and
          `accessibleNetWorth` is `(assets − retirement) − liabilities`, so
          the retirement term cancels and the output has always been
          `totalAssets − totalLiabilities`. "Total Wealth" described that as
          a sum of what you own, silently omitting the debt already
          subtracted. Only the label and the formula line are new. */}
      {/* Wave 7 correction C — ONE cohesive hero shell.

          Previously the net worth card and the own/owe card were two
          stacked surfaces, so the screen opened with two boxes saying
          related things. They are now one shell with an internal divider:
          the identity and figure above, the reconciliation below.

          The shell is deliberately NOT pressable. It contains two distinct
          actions — Move money and View breakdown — and making the whole
          card a button would nest them inside another button, which
          VoiceOver cannot express. Each action is its own control. */}
      <LinearGradient
        colors={semantic.ambient as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
        testID="wealth-hero"
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIdentityRow}>
            <View style={styles.heroIdentityTile}>
              <Ionicons name="layers-outline" size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
            <Text style={styles.heroLabel} accessibilityRole="header">{NET_WORTH_LABEL}</Text>
          </View>
          {data.assets.length > 0 ? (
            <TouchableOpacity
              style={styles.transferButton}
              onPress={() => setTransferVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Move money"
              testID="wealth-move-money"
            >
              <Ionicons name="swap-horizontal" size={14} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.transferText}>Move money</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* The figure and its formula, announced together as one summary so
            a screen reader hears the reconciliation without hunting. No
            adjustsFontSizeToFit: the shell grows instead of shrinking the
            most important number in the app. */}
        <View accessible accessibilityRole="summary" accessibilityLabel={heroAnnouncement} testID="wealth-hero-figure">
          <Text style={[styles.heroValue, heroInkStyle]}>{formatWealthAmount(netWorth)}</Text>
          <Text style={styles.heroFormula}>{NET_WORTH_FORMULA}</Text>
        </View>
        {netWorthSign === 'negative' ? (
          /* A non-colour cue, because a negative net worth must never be
             carried by ink alone — and never by destructive red, which this
             app reserves for irreversible acts. */
          <View style={styles.heroNoteRow}>
            <Ionicons name="information-circle-outline" size={13} color={semantic.warningAccent} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={styles.heroNote}>You owe more than you own right now</Text>
          </View>
        ) : null}
        {wealthMapStateCopy ? <Text style={styles.heroSupportive}>{wealthMapStateCopy}</Text> : null}

        <View style={styles.heroDivider} />

        <View style={styles.reconcileRow}>
          <View style={styles.reconcileSide}>
            <View style={styles.reconcileLabelRow}>
              <View style={[styles.reconcileSwatch, styles.reconcileSwatchOwn]} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.reconcileLabel}>{OWN_LABEL}</Text>
            </View>
            <Text style={styles.reconcileValue} testID="wealth-own-value">{formatWealthAmount(totalAssets)}</Text>
          </View>
          <View style={[styles.reconcileSide, styles.reconcileSideRight]}>
            <View style={styles.reconcileLabelRow}>
              <View style={[styles.reconcileSwatch, styles.reconcileSwatchOwe]} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.reconcileLabel}>{OWE_LABEL}</Text>
            </View>
            <Text style={styles.reconcileValue} testID="wealth-owe-value">{formatWealthAmount(totalLiabilities)}</Text>
          </View>
        </View>
        {proportions.barMeaningful ? (
          <View style={styles.reconcileBar} accessibilityElementsHidden importantForAccessibility="no" testID="wealth-own-owe-bar">
            <View style={[styles.reconcileFill, styles.reconcileFillOwn, { flex: proportions.ownFraction }]} />
            <View style={[styles.reconcileFill, styles.reconcileFillOwe, { flex: proportions.oweFraction }]} />
          </View>
        ) : null}
        <TouchableOpacity
          ref={breakdownRef}
          style={styles.breakdownAffordance}
          onPress={() => setBreakdownVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={breakdownTriggerLabel}
          testID="wealth-view-breakdown"
        >
          <Text style={styles.breakdownAffordanceText}>{BREAKDOWN_TRIGGER_TEXT}</Text>
          <Ionicons name="chevron-forward" size={14} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
        </TouchableOpacity>
      </LinearGradient>

      {/* PASS B.C — "What you own", with staged disclosure.

          Six category headers used to interrupt this list, so a customer
          scrolled past five headings to reach four records. The canonical
          order is unchanged — the same category order, the same items
          within each — it is simply no longer broken up. The first three
          rows show; the rest are one inline tap away. No nested ScrollView,
          no flip, no hidden back face. */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadText}>
          <Text style={styles.sectionHeadTitle} accessibilityRole="header">{OWN_LABEL}</Text>
          <Text style={styles.sectionHeadTotal} testID="wealth-own-section-total">{formatWealthAmount(totalAssets)}</Text>
        </View>
        {/* Hidden while the section is empty: the empty state below already
            carries the one relevant Add, and two adjacent controls doing the
            same thing is the duplication this composition exists to remove. */}
        {assetRows.length > 0 ? (
        <TouchableOpacity
          style={styles.sectionAddButton}
          onPress={() => openModal('asset')}
          accessibilityRole="button"
          accessibilityLabel="Add an asset"
          testID="wealth-add-asset"
        >
          <Ionicons name="add" size={16} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.sectionAddText}>Add</Text>
        </TouchableOpacity>
        ) : null}
      </View>

      {assetRows.length === 0 ? (
        <View style={styles.emptySection} testID="wealth-own-empty">
          <Text style={styles.emptyTitle}>Nothing recorded yet</Text>
          <Text style={styles.emptyBody}>Add an account, a property or an investment and it will count toward your net worth.</Text>
          <TouchableOpacity style={styles.emptyAction} onPress={() => openModal('asset')} accessibilityRole="button" accessibilityLabel="Add an asset">
            <Text style={styles.emptyActionText}>Add an asset</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {assetDisclosure.visible.map((a) => {
            const micro = assetMicroCopy(a);
            /* Wave 7 accepted data-contract limitation: `Asset` carries NO
               recorded or updated date of any kind. Rather than substitute
               today or fabricate a timestamp, asset rows carry no date line
               at all. This is deliberate and documented in change control —
               adding `Asset.recordedAt` is explicitly out of scope. */
            return (
              <TouchableOpacity
                key={a.id}
                style={styles.row}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${a.label}. ${spokenWealthAmount(a.currentValue)}.${micro ? ` ${micro}.` : ''}`}
                accessibilityHint="Opens details."
                testID={`wealth-asset-row-${a.id}`}
                onPress={() => {
                  setEditAsset(a);
                  setModalKind('asset');
                }}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={ASSET_ICONS[a.type] ?? 'ellipse-outline'} size={16} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
                </View>
                <View style={styles.rowLabelBlock}>
                  <Text style={styles.rowLabel}>{a.label}</Text>
                  <Text style={styles.rowMicro}>{ASSET_TYPE_LABEL[a.type] ?? 'Asset'}</Text>
                  {micro ? <Text style={styles.rowMicro}>{micro}</Text> : null}
                </View>
                <Text style={styles.rowValue}>{formatWealthAmount(a.currentValue)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
              </TouchableOpacity>
            );
          })}
          {assetDisclosure.control ? (
            <TouchableOpacity
              style={styles.disclosureButton}
              onPress={() => setAssetsExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={assetDisclosure.control.label}
              accessibilityState={{ expanded: assetDisclosure.control.expanded }}
              testID="wealth-assets-disclosure"
            >
              <Text style={styles.disclosureText}>{assetDisclosure.control.label}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      {/* PASS B.C — "What you owe". */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadText}>
          <Text style={styles.sectionHeadTitle} accessibilityRole="header">{OWE_LABEL}</Text>
          <Text style={styles.sectionHeadTotal} testID="wealth-owe-section-total">{formatWealthAmount(totalLiabilities)}</Text>
        </View>
        {/* Hidden while the section is empty: the empty state below already
            carries the one relevant Add, and two adjacent controls doing the
            same thing is the duplication this composition exists to remove. */}
        {liabilityRows.length > 0 ? (
        <TouchableOpacity
          style={styles.sectionAddButton}
          onPress={() => openModal('liability')}
          accessibilityRole="button"
          accessibilityLabel="Add a debt"
          testID="wealth-add-debt"
        >
          <Ionicons name="add" size={16} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.sectionAddText}>Add</Text>
        </TouchableOpacity>
        ) : null}
      </View>

      {liabilityRows.length === 0 ? (
        <View style={styles.emptySection} testID="wealth-owe-empty">
          <Text style={styles.emptyTitle}>No debts recorded</Text>
          <Text style={styles.emptyBody}>If you have a loan, card or other debt, adding it keeps your net worth accurate.</Text>
          <TouchableOpacity style={styles.emptyAction} onPress={() => openModal('liability')} accessibilityRole="button" accessibilityLabel="Add a debt">
            <Text style={styles.emptyActionText}>Add a debt</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {debtDisclosure.visible.map((l) => {
            const linkedCard = l.creditCardId ? data.creditCards.find((c) => c.id === l.creditCardId) ?? null : null;
            const ccInsight = linkedCard ? creditCardLiabilityInsight(linkedCard) : null;
            const linkedProperty =
              l.type === 'mortgage' && l.linkedPropertyAssetId ? data.assets.find((a) => a.id === l.linkedPropertyAssetId) ?? null : null;
            const equity = linkedProperty ? computeMortgageEquity(l, linkedProperty) : null;
            /* Linked-repayment naming: the recurring bill that services this
               debt, named as the customer named it. Read only — the link
               itself is established elsewhere and is not modified here. */
            const linkedRepayment = data.recurringItems.find((r) => r.active && r.linkedLiabilityId === l.id) ?? null;
            /* Wave 7 correction D — `createdAt` is a CREATION date. It is
               never labelled "Recorded", and it is only shown for the types
               whose creation path actually sets it. */
            const dateLine = liabilityDateLine(l.type, l.createdAt ?? null);
            const freshness = resolveRecordFreshness(l.createdAt ?? null, currentDate);
            const rowTone = ccInsight ? resolveLiabilityRowTone(ccInsight.tone, ccInsight.text) : 'neutral';
            const toneIcon = liabilityRowToneIcon(rowTone);
            return (
              <TouchableOpacity
                key={l.id}
                style={styles.row}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${l.label}. ${spokenWealthAmount(l.currentBalance)} owed.${linkedRepayment ? ` Repaid by ${linkedRepayment.label}.` : ''}`}
                accessibilityHint="Opens details."
                testID={`wealth-debt-row-${l.id}`}
                onPress={() => {
                  // Credit cards carry extra fields (limit, due day, APR)
                  // that the generic liability form doesn't have — edit them
                  // on their own dedicated form so they never drift out of
                  // sync with the card.
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
                  <Ionicons name={LIABILITY_ICONS[l.type] ?? 'ellipse-outline'} size={16} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
                </View>
                <View style={styles.rowLabelBlock}>
                  <Text style={styles.rowLabel}>{l.label}</Text>
                  <Text style={styles.rowMicro}>{LIABILITY_TYPE_LABEL[l.type] ?? 'Debt'}</Text>
                  {linkedRepayment ? (
                    <Text style={styles.rowMicro} testID={`wealth-debt-linked-${l.id}`}>{`Repaid by ${linkedRepayment.label}`}</Text>
                  ) : null}
                  {ccInsight ? (
                    /* The engine's own text, estimate and provenance are
                       unchanged; only the ink is remapped, and an icon
                       carries the same status so colour is never the sole
                       cue. Due-soon reads as caution; genuinely late keeps
                       its urgency. */
                    <View style={styles.rowStatusLine}>
                      {toneIcon ? (
                        <Ionicons
                          name={toneIcon as never}
                          size={12}
                          color={wealthToneColor(semantic, colors, rowTone)}
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                        />
                      ) : null}
                      {/* Wave 9a closure, Correction C — two lines. The
                          bare " (est. rate)" suffix was the only signal that
                          a 19.5% ASSUMPTION was in play; it is replaced by an
                          explicit second line naming the rate and its source
                          together with the short issuer qualification. Both
                          lines wrap rather than truncate. */}
                      <Text style={[styles.rowMicro, { color: wealthToneColor(semantic, colors, rowTone) }]} testID={`wealth-debt-status-${l.id}`}>
                        {ccInsight.text}
                      </Text>
                    </View>
                  ) : null}
                  {ccInsight?.sourceLine ? (
                    <Text style={styles.rowMicro} testID={`wealth-debt-rate-source-${l.id}`}>
                      {ccInsight.sourceLine}
                    </Text>
                  ) : null}
                  {equity ? (
                    <Text style={styles.rowMicro}>
                      Estimated equity: {formatWealthAmount(equity.equity)} ({Math.round(equity.equityPct * 100)}%)
                    </Text>
                  ) : null}
                  {l.type === 'bnpl' && l.currentBalance === 0 ? <Text style={[styles.rowMicro, { color: colors.success }]}>Paid off</Text> : null}
                  {dateLine ? (
                    <Text style={[styles.rowRecorded, freshness === 'stale' ? styles.rowRecordedStale : null]} testID={`wealth-debt-date-${l.id}`}>
                      {dateLine}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rowValue}>{formatWealthAmount(l.currentBalance)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
              </TouchableOpacity>
            );
          })}
          {debtDisclosure.control ? (
            <TouchableOpacity
              style={styles.disclosureButton}
              onPress={() => setDebtsExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={debtDisclosure.control.label}
              accessibilityState={{ expanded: debtDisclosure.control.expanded }}
              testID="wealth-debts-disclosure"
            >
              <Text style={styles.disclosureText}>{debtDisclosure.control.label}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      {/* Wave 7 disposition — the guide / Money Engine / Your Future cards
          are PRESERVED and still mounted, but moved BELOW the two sections
          so the canonical order (heading, hero, reconciliation,
          context row, what you own, what you owe) is uninterrupted. They
          are existing accepted surfaces backed by existing selectors; this
          wave neither rewrites nor deletes them. */}
      {!unlockStatus.wealth_projection ? (
        /* Wave 9c closure — the legacy "Build your Wealth Map" guide
           (WealthGuideSteps, legacy typography, pre-Wave-7 naming) is
           retired in favour of one calm empty state in the product's
           current language: the surface is Wealth and the figure is net
           worth. Same gate (`unlockStatus.wealth_projection`, untouched),
           same Add destination (`openModal('asset')`) — only the
           presentation changed. Income/savings entry points remain
           canonical on Today's checklist and Money. */
        <SectionCard>
          <View style={styles.emptySection} testID="wealth-empty-state">
            <Ionicons name="pie-chart-outline" size={22} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={styles.emptyTitle} accessibilityRole="header">Start building your net worth</Text>
            <Text style={styles.emptyBody}>
              Add an account, asset or debt to see what you own, what you owe and your net worth in one place.
            </Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => openModal('asset')}
              accessibilityRole="button"
              accessibilityLabel="Add your first item"
              testID="wealth-empty-add"
            >
              <Text style={styles.emptyActionText}>Add your first item</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>
      ) : (
        <SectionCard>
          {/* Wave 7 correction D — the outer "Your Money Engine" heading is
              gone. The card now carries its own Design 5.1 identity row, so
              rendering both produced two customer-visible titles for one
              surface ("Your Money Engine" above "Your money engine"). The
              card owns its name; the screen no longer duplicates it. */}
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

      {/* Goal discovery and management now lives in Grow ("What am I working
          toward?"), not Wealth ("What do I own and owe?") — Goals-to-Grow
          §7A. The internal `Goals` root route itself is untouched; Wealth
          simply no longer links to it. */}


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
      {/* Wave 7 correction A — ONE canonical breakdown sheet.

          It replaces the standalone Accessible-now/Retirement/Definitions
          card, which became an oversized, half-empty surface whenever no
          retirement savings existed. The definitions live HERE, inside the
          breakdown, rather than behind a second nested sheet — a modal
          inside a modal for two sentences of explanation.

          Every value is an authoritative output passed in already
          computed; this sheet performs no arithmetic and parses no
          formatted string. Focus returns to the trigger on close. */}
      <InfoSheet
        visible={breakdownVisible}
        onClose={() => {
          setBreakdownVisible(false);
          sendFocusEvent(breakdownRef);
        }}
        title="Your net worth breakdown"
        subtitle="Every figure below comes from what you have recorded."
      >
        {breakdownItems.map((item) => (
          <View
            key={item.label}
            style={[styles.breakdownRow, item.emphasis ? styles.breakdownRowEmphasis : null]}
            accessible
            accessibilityLabel={`${item.label}, ${item.spoken}.`}
            testID={`wealth-breakdown-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Text style={[styles.breakdownLabel, item.emphasis ? styles.breakdownLabelEmphasis : null]}>{item.label}</Text>
            <Text
              style={[styles.breakdownValue, item.emphasis ? styles.breakdownValueEmphasis : null]}
              testID={`wealth-breakdown-value-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.value}
            </Text>
          </View>
        ))}
        {retirementPresence === 'absent' ? (
          /* A compact truthful row, not an empty half-card. Reuses the
             existing asset route with the retirement type preselected — no
             new destination was invented. */
          <TouchableOpacity
            style={styles.breakdownAddAction}
            onPress={() => {
              setBreakdownVisible(false);
              openModal('asset', RETIREMENT_ASSET_TYPE);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add retirement savings"
            testID="wealth-add-retirement"
          >
            <Text style={styles.breakdownAddText}>Add retirement savings</Text>
          </TouchableOpacity>
        ) : null}
        {WEALTH_DEFINITIONS.map((d) => (
          <View key={d.term} style={styles.definitionBlock}>
            <Text style={styles.definitionTerm} accessibilityRole="header">{d.term}</Text>
            <Text style={styles.definitionBody}>{d.body}</Text>
          </View>
        ))}
      </InfoSheet>

    </Screen>
  );
}
