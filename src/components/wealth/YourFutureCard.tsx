import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeAgeProjections, computeWhatIfMilestone, computeNextWealthMilestone, computeCashflowIsNegative } from '../../lib/calculations/futureProjection';
import { ACCESSIBLE_INVESTMENT_TYPES } from '../../lib/calculations/assetGroups';
import { formatWealthAmount } from '../../lib/calculations/wealthComposition';
import { computeAccessibleNetWorth, computeRetirementSavings } from '../../lib/calculations/wealthDefinitions';
import { useFinancialState } from '../../lib/calculations/financialState';
import { InfoSheet } from '../shared/InfoSheet';
import { AgeProjection } from '../../lib/calculations/futureProjection';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * "Your Future" — leads with an emotional headline, but a deliberately
 * soft one: "next wealth milestone," never "financial freedom" (PRD bug
 * report — that claim is too big and can read as inconsistent with the
 * supporting numbers below it). Works without an age (falls back to
 * "in X years"); the age-by-age breakdown below is supporting detail, only
 * shown once an age is entered, and age is still never asked at onboarding.
 */
export function YourFutureCard() {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography, glow, semantic } = useTheme();
  // Wave 7 correction B — the same shipped role resolver Money and Today use.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [ageInput, setAgeInput] = useState('');
  const [breakdownAge, setBreakdownAge] = useState<AgeProjection | null>(null);

  const projections = useMemo(() => computeAgeProjections(data), [data]);
  const whatIf = useMemo(() => computeWhatIfMilestone(data), [data]);
  const nextMilestone = useMemo(() => computeNextWealthMilestone(data), [data]);
  const cashflowIsNegative = useMemo(() => computeCashflowIsNegative(data), [data]);
  const totalAssets = useMemo(() => data.assets.reduce((sum, a) => sum + a.currentValue, 0), [data.assets]);
  const totalLiabilities = useMemo(() => data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0), [data.liabilities]);
  // Shared signal, not a local net-worth check — must never drift from
  // Today's and Wealth's own reading of the same state (PRD bug report).
  const financialState = useFinancialState(data);
  const isRebuilding = financialState.key === 'financial_rebuild';
  const accessibleNetWorth = useMemo(() => computeAccessibleNetWorth(data), [data]);
  const retirementSavings = useMemo(() => computeRetirementSavings(data), [data]);
  const personalInvestments = useMemo(
    () => data.assets.filter((a) => (ACCESSIBLE_INVESTMENT_TYPES as string[]).includes(a.type)).reduce((sum, a) => sum + a.currentValue, 0),
    [data.assets]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { ...glow(colors.navy) },
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 4 },
        body: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.md },
        freedomText: { ...typeStyle('body', locale), color: colors.textPrimary, marginBottom: spacing.sm, fontWeight: '600' },
        subheading: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        identityTile: { width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.interactiveTint, alignItems: 'center', justifyContent: 'center' },
        identityTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        projectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
        calcButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
        calcButtonText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive },
        /* Three EQUAL cells — flexBasis:0 so a longer figure cannot claim
           more width than its neighbours. */
        ageBlock: { flexGrow: 1, flexBasis: 0, minWidth: 0, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
        ageLabel: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: 2 },
        ageValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, fontVariant: ['tabular-nums'] },
        insightRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.goldSoft,
          borderRadius: radius.control,
          padding: spacing.sm,
          marginBottom: spacing.sm,
        },
        insightText: { ...typeStyle('support', locale), color: colors.textPrimary, flex: 1 },
        disclaimer: { ...typeStyle('meta', locale), color: colors.textMuted, marginTop: spacing.xs },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
        breakdownLabel: { ...typeStyle('body', locale), color: colors.textPrimary },
        breakdownValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, fontVariant: ['tabular-nums'] },
        breakdownSubLabel: { ...typeStyle('meta', locale), color: colors.textMuted, paddingLeft: spacing.sm },
        breakdownSubValue: { ...typeStyle('meta', locale), color: colors.textMuted },
        breakdownTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
        addAgeLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
        addAgeLinkText: { ...typeStyle('support', locale), color: semantic.interactive, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, glow, semantic, locale]
  );

  // Financial Rebuild state: kept deliberately factual — no ordered action
  // plan (PRD bug report: an earlier version's "Your rebuild path" checklist
  // — Add income / Add cash savings / Reduce debt / Build investments —
  // read as Navilo prescribing a sequence of financial decisions, which is
  // exactly what this state's copy elsewhere is written to avoid).
  if (isRebuilding) {
    const deficit = totalLiabilities - totalAssets;
    return (
      <SectionCard style={styles.card}>
        {/* Wave 7 correction B — a Design 5.1 identity row. */}
      <View style={styles.identityRow}>
        <View style={styles.identityTile}>
          <Ionicons name="trending-up-outline" size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        <Text style={styles.identityTitle} accessibilityRole="header">Your future</Text>
      </View>
        <Text style={styles.freedomText}>Your current financial position is rebuilding.</Text>
        <Text style={styles.body}>
          Your future projection will unlock once {brand.name} has enough positive net-wealth data to work with.
        </Text>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Recorded assets</Text>
          <Text style={styles.breakdownValue}>{formatMoney(totalAssets)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Recorded liabilities</Text>
          <Text style={styles.breakdownValue}>{formatMoney(totalLiabilities)}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
          <Text style={styles.breakdownLabel}>Liabilities exceed assets by</Text>
          <Text style={styles.breakdownValue}>{formatMoney(deficit)}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Once your recorded assets exceed your recorded liabilities, {brand.name} will project your future wealth.
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard style={styles.card}>
      {/* Wave 7 correction B — a Design 5.1 identity row. */}
      <View style={styles.identityRow}>
        <View style={styles.identityTile}>
          <Ionicons name="trending-up-outline" size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        <Text style={styles.identityTitle} accessibilityRole="header">Your future</Text>
      </View>

      {/* Wave 9b closure, Correction C — the lead sentence used to interpolate
          a single exact age ("…could reach your next wealth milestone around
          age 30."). The projection behind it is illustrative, but naming one
          precise age reads as a personalised forecast. The prose now says what
          the card IS; the age-based tiles below remain, because they are
          visibly labelled as an illustrative timeline and carry their own
          disclaimer. No projection, milestone, figure or age changed — only
          this sentence. */}
      {nextMilestone || (projections && projections.length > 0) ? (
        <Text style={styles.freedomText}>
          {`Based on what you've recorded, the timeline below illustrates how your wealth could change over time.`}
        </Text>
      ) : (
        <Text style={styles.body}>Add income and a savings buffer and {brand.name} will estimate your next wealth milestone.</Text>
      )}

      {projections && projections[0].cashflowIsNegative ? (
        <Text style={styles.disclaimer}>
          Your recorded spending currently exceeds your income, so this projection assumes no further monthly saving — only your
          existing balance growing at the assumed rate. It does not account for ongoing shortfalls.
        </Text>
      ) : null}

      {projections ? (
        <>
          {/* Wave 7 correction B — the emoji pointer and its "tap for..."
              instruction became a real, named 44pt control. The
              destination is unchanged: the same per-age breakdown sheet the
              cells already opened. */}
          <View style={styles.projectionHead}>
            <Text style={styles.subheading}>Illustrative timeline</Text>
            <TouchableOpacity
              style={styles.calcButton}
              onPress={() => setBreakdownAge(projections[0])}
              accessibilityRole="button"
              accessibilityLabel="How this is calculated"
              testID="future-how-calculated"
            >
              <Text style={styles.calcButtonText}>How this is calculated</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            {projections.map((p) => (
              <TouchableOpacity
                key={p.age}
                style={styles.ageBlock}
                activeOpacity={0.7}
                onPress={() => setBreakdownAge(p)}
                accessibilityRole="button"
                accessibilityLabel={`Age ${p.age}, ${formatWealthAmount(p.projectedNetWorth)}. How this is calculated.`}
                testID={`future-projection-${p.age}`}
              >
                <Text style={styles.ageLabel}>Age {p.age}</Text>
                <Text style={styles.ageValue}>{formatWealthAmount(p.projectedNetWorth)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Your age (optional, for a year-by-year view)"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={ageInput}
            onChangeText={setAgeInput}
          />
          <TouchableOpacity
            style={styles.addAgeLink}
            onPress={() => {
              const age = parseInt(ageInput, 10);
              if (!isNaN(age) && age > 0) updateUser({ age });
            }}
          >
            <Ionicons name="add-circle-outline" size={14} color={colors.accent} />
            <Text style={styles.addAgeLinkText}>Add age</Text>
          </TouchableOpacity>
        </>
      )}

      {whatIf ? (
        <View style={styles.insightRow}>
          <Ionicons name="bulb" size={16} color={colors.gold} />
          <Text style={styles.insightText}>
            If you invested an extra ${whatIf.extraMonthly}/month, you'd reach {formatMoney(whatIf.milestone)} roughly{' '}
            {whatIf.yearsSaved} year{whatIf.yearsSaved === 1 ? '' : 's'} earlier.
          </Text>
        </View>
      ) : null}

      <Text style={styles.disclaimer}>
        Illustrative only, assuming a general average annual return — not a guarantee or personalised advice.
      </Text>

      <InfoSheet
        visible={breakdownAge !== null}
        onClose={() => setBreakdownAge(null)}
        title={breakdownAge ? `How this age ${breakdownAge.age} estimate is calculated` : ''}
      >
        {breakdownAge ? (
          <>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Current accessible net worth</Text>
              <Text style={styles.breakdownValue}>{formatMoney(accessibleNetWorth)}</Text>
            </View>
            {/* Sub-detail only — already inside "Current accessible net
             * worth" above (which nets all non-retirement assets, personal
             * investments included, against every liability). Shown purely
             * so users can see what's inside that figure; never add this to
             * the other rows, or liabilities and investments both get
             * counted twice (PRD bug report). */}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownSubLabel}>— of which personal investments</Text>
              <Text style={styles.breakdownSubValue}>{formatMoney(personalInvestments)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownSubLabel}>— of which liabilities</Text>
              <Text style={styles.breakdownSubValue}>-{formatMoney(totalLiabilities)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Retirement savings</Text>
              <Text style={styles.breakdownValue}>+{formatMoney(retirementSavings)}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
              <Text style={styles.breakdownLabel}>Starting point for this projection</Text>
              <Text style={styles.breakdownValue}>{formatMoney(accessibleNetWorth + retirementSavings)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Assumed monthly contribution</Text>
              <Text style={styles.breakdownValue}>{formatMoney(breakdownAge.monthlyContribution)}/mo</Text>
            </View>
            <Text style={styles.breakdownSubLabel}>Your chosen Savings allocation amount — not leftover cash after spending. $0 if you haven't set one.</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Assumed annual return</Text>
              <Text style={styles.breakdownValue}>6%</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Years projected</Text>
              <Text style={styles.breakdownValue}>{breakdownAge.yearsAhead}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Values shown as</Text>
              <Text style={styles.breakdownValue}>Nominal (not inflation-adjusted)</Text>
            </View>
            {breakdownAge.cashflowIsNegative ? (
              <Text style={styles.disclaimer}>
                Recorded spending currently exceeds income, so no further monthly contribution is assumed — only the existing balance
                growing at the assumed rate.
              </Text>
            ) : null}
            <Text style={styles.disclaimer}>
              Illustrative estimate based on the information and assumptions shown. All assets and liabilities are currently assumed to
              grow or reduce at the same rate shown above — this does not yet reflect asset-specific assumptions (e.g. property vs.
              cash). It is not a guarantee or personal financial advice.
            </Text>
          </>
        ) : null}
      </InfoSheet>
    </SectionCard>
  );
}
