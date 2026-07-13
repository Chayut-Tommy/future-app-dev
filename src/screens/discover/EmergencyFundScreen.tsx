import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { computeEmergencyFund } from '../../lib/calculations/emergencyFund';
import { computeMonthlySummary, describeCashflowMessage } from '../../lib/calculations/monthlySummary';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Emergency Fund Calculator — real numbers only: current Cash vs. actual
 * monthly expenses, with the standard 3-6 months guideline. Replaces the
 * generic "Savings Challenge" filler card (PRD ask: practical value, not
 * filler content).
 */
export function EmergencyFundScreen() {
  const navigation = useNavigation<any>();
  const { data } = useAppState();
  const { colors, radius, spacing, typography, glow } = useTheme();
  const result = useMemo(() => computeEmergencyFund(data), [data]);
  const summary = useMemo(() => computeMonthlySummary(data), [data]);
  const cashflowMessage = useMemo(() => describeCashflowMessage(summary), [summary]);
  const hasExpenseData = result.monthlyExpenses > 0;
  const monthsIsZero = hasExpenseData && (result.monthsCovered === null || result.monthsCovered < 0.05);

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
        resultCard: { borderRadius: radius.card, alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.lg, ...glow(colors.accent) },
        resultLabel: { ...typography.micro, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '700', letterSpacing: 0.5 },
        resultTagline: { ...typography.body, fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', marginBottom: spacing.sm },
        resultValue: { ...typography.title, fontSize: 34, color: '#fff' },
        resultCaption: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
        emptyBox: { alignItems: 'center', paddingVertical: spacing.xl },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
        rowLabel: { ...typography.body, fontSize: 14, color: colors.textSecondary },
        rowValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.lg },
        insightText: { ...typography.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
      }),
    [colors, radius, spacing, typography, glow]
  );

  return (
    <Screen title="Emergency Fund" onBack={() => navigation.goBack()}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>Based on your own logged income, bills, and cash — a common guideline, not financial advice.</Text>
      </View>

      {hasExpenseData ? (
        <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultCard}>
          <Text style={styles.resultLabel}>🛟 EMERGENCY FUND</Text>
          <Text style={styles.resultTagline}>Your safety net, in real numbers.</Text>
          <Text style={styles.resultValue}>
            {monthsIsZero ? '0' : result.monthsCovered!.toFixed(1)} months
          </Text>
          <Text style={styles.resultCaption}>
            {monthsIsZero ? 'covered so far' : 'of expenses covered by your current cash'}
          </Text>
        </LinearGradient>
      ) : (
        <SectionCard>
          <View style={styles.emptyBox}>
            <Ionicons name="shield-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>Add your income and a few bills or expenses, and {brand.name} will calculate your safety net here.</Text>
          </View>
        </SectionCard>
      )}

      {monthsIsZero ? (
        <SectionCard>
          <Text style={styles.insightText}>
            Your current cash buffer isn't enough yet. Add cash savings to start building your emergency fund — {brand.name} will
            track your progress here.
          </Text>
        </SectionCard>
      ) : null}

      {hasExpenseData ? (
        <SectionCard>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Monthly expenses</Text>
            <Text style={styles.rowValue}>{formatMoney(result.monthlyExpenses)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current cash</Text>
            <Text style={styles.rowValue}>{formatMoney(result.currentCash)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Recommended (3-6 months)</Text>
            <Text style={styles.rowValue}>
              {formatMoney(result.recommendedMin)} - {formatMoney(result.recommendedMax)}
            </Text>
          </View>
        </SectionCard>
      ) : null}

      {cashflowMessage ? (
        <>
          <Text style={styles.sectionTitle}>Savings Rate</Text>
          <SectionCard>
            <Text style={styles.insightText}>{cashflowMessage}</Text>
          </SectionCard>
        </>
      ) : null}
    </Screen>
  );
}
