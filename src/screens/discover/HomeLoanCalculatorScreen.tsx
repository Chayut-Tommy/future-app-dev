import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { computeHomeLoanRepayment, RepaymentFrequency } from '../../lib/calculations/homeLoanCalculator';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const FREQUENCIES: { value: RepaymentFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Home Loan Calculator — a real amortisation calculation against the
 * user's own numbers (loan amount, rate, term), never a bank's actual
 * offer (illustrative only, per the disclaimer).
 */
export function HomeLoanCalculatorScreen() {
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, glow } = useTheme();

  const [loanAmount, setLoanAmount] = useState('600000');
  const [ratePct, setRatePct] = useState('6');
  const [years, setYears] = useState('30');
  const [frequency, setFrequency] = useState<RepaymentFrequency>('monthly');

  const result = useMemo(
    () =>
      computeHomeLoanRepayment({
        loanAmount: parseFloat(loanAmount) || 0,
        annualRatePct: parseFloat(ratePct) || 0,
        years: parseFloat(years) || 0,
        frequency,
      }),
    [loanAmount, ratePct, years, frequency]
  );

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
        resultCard: { borderRadius: radius.card, alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.lg, ...glow(colors.navy) },
        resultLabel: { ...typography.micro, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '700', letterSpacing: 0.5 },
        resultValue: { ...typography.title, fontSize: 30, color: '#fff' },
        resultCaption: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
        resultSubRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
        resultSubBlock: { alignItems: 'center' },
        resultSubLabel: { ...typography.micro, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
        resultSubValue: { ...typography.heading, fontSize: 14, color: '#fff' },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        freqRow: { flexDirection: 'row', gap: spacing.sm },
        freqChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
        freqChipActive: { backgroundColor: colors.accentSoft },
        freqText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
        freqTextActive: { color: colors.accentStrong },
      }),
    [colors, radius, spacing, typography, glow]
  );

  return (
    <Screen title="Home Loan Calculator" onBack={() => navigation.goBack()}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>Educational only — plug in your own numbers, not a lending offer or advice.</Text>
      </View>

      <LinearGradient colors={colors.navyGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultCard}>
        <Text style={styles.resultLabel}>🏠 ESTIMATED REPAYMENT</Text>
        <Text style={styles.resultValue}>
          {formatMoney(result.repaymentPerPeriod)} / {frequency === 'monthly' ? 'month' : frequency === 'fortnightly' ? 'fortnight' : 'week'}
        </Text>
        <Text style={styles.resultCaption}>over {years || '0'} years</Text>
        <View style={styles.resultSubRow}>
          <View style={styles.resultSubBlock}>
            <Text style={styles.resultSubLabel}>Total interest</Text>
            <Text style={styles.resultSubValue}>{formatMoney(result.totalInterest)}</Text>
          </View>
          <View style={styles.resultSubBlock}>
            <Text style={styles.resultSubLabel}>Total loan cost</Text>
            <Text style={styles.resultSubValue}>{formatMoney(result.totalCost)}</Text>
          </View>
        </View>
      </LinearGradient>

      <SectionCard>
        <Text style={styles.label}>Loan amount</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={loanAmount} onChangeText={setLoanAmount} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Interest rate (%)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={ratePct} onChangeText={setRatePct} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Loan term (years)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={years} onChangeText={setYears} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Repayment frequency</Text>
        <View style={styles.freqRow}>
          {FREQUENCIES.map((f) => {
            const active = frequency === f.value;
            return (
              <TouchableOpacity key={f.value} style={[styles.freqChip, active ? styles.freqChipActive : null]} onPress={() => setFrequency(f.value)}>
                <Text style={[styles.freqText, active ? styles.freqTextActive : null]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>
    </Screen>
  );
}
