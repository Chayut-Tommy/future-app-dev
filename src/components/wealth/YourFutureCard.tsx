import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeAgeProjections, computeWhatIfMilestone, computeNextWealthMilestone, computeCashflowIsNegative } from '../../lib/calculations/futureProjection';
import { ACCESSIBLE_INVESTMENT_TYPES } from '../../lib/calculations/assetGroups';
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
  const { colors, radius, spacing, typography, glow } = useTheme();
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
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        freedomText: { ...typography.body, fontSize: 15, color: colors.textPrimary, lineHeight: 21, marginBottom: spacing.sm, fontWeight: '600' },
        subheading: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
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
        ageBlock: { flex: 1, backgroundColor: colors.navySoft, borderRadius: radius.control, padding: spacing.md, alignItems: 'center' },
        ageLabel: { ...typography.micro, color: colors.textSecondary, marginBottom: 2 },
        ageValue: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        insightRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.goldSoft,
          borderRadius: radius.control,
          padding: spacing.sm,
          marginBottom: spacing.sm,
        },
        insightText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, flex: 1, lineHeight: 17 },
        disclaimer: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 14 },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
        breakdownLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        breakdownValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        breakdownSubLabel: { ...typography.caption, fontSize: 12, color: colors.textMuted, paddingLeft: spacing.sm },
        breakdownSubValue: { ...typography.caption, fontSize: 12, color: colors.textMuted },
        breakdownTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
        addAgeLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
        addAgeLinkText: { ...typography.micro, color: colors.accent, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, glow]
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
        <Text style={styles.title}>Your Future</Text>
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
      <Text style={styles.title}>Your Future</Text>

      {nextMilestone ? (
        <Text style={styles.freedomText}>
          {nextMilestone.age
            ? `At your current saving pace, ${brand.name} estimates you could reach your next wealth milestone around age ${nextMilestone.age}.`
            : `At your current saving pace, ${brand.name} estimates you could reach your next wealth milestone in about ${nextMilestone.yearsAway} year${
                nextMilestone.yearsAway === 1 ? '' : 's'
              }.`}
        </Text>
      ) : projections && projections.length > 0 ? (
        <Text style={styles.freedomText}>
          {projections[0].monthlyContribution > 0
            ? `At your current saving pace, you could reach ${formatMoney(projections[projections.length - 1].projectedNetWorth)} net worth around age ${projections[projections.length - 1].age}.`
            : `With no further monthly saving assumed, your existing balance alone could grow to ${formatMoney(projections[projections.length - 1].projectedNetWorth)} around age ${projections[projections.length - 1].age}.`}
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
          <Text style={styles.subheading}>{brand.name} estimates your future could look like this 👇 Tap for how this is calculated.</Text>
          <View style={styles.row}>
            {projections.map((p) => (
              <TouchableOpacity key={p.age} style={styles.ageBlock} activeOpacity={0.7} onPress={() => setBreakdownAge(p)}>
                <Text style={styles.ageLabel}>Age {p.age}</Text>
                <Text style={styles.ageValue}>{formatMoney(p.projectedNetWorth)}</Text>
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
