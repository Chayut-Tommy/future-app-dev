import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { computeCompoundGrowth, ContributionFrequency } from '../../lib/calculations/compoundCalculator';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const FREQUENCIES: { value: ContributionFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Compound Calculator — a real interactive tool (Discover's "Financial
 * Tools" section, and where Saving Facts' "Try calculator" button lands).
 * Everything here is the user's own hypothetical inputs plugged into a
 * standard compounding formula — no fabricated rates or numbers.
 */
export function CompoundCalculatorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, radius, spacing, typography, glow } = useTheme();
  const params = route.params ?? {};

  const [initial, setInitial] = useState(params.initial ? String(params.initial) : '0');
  const [contribution, setContribution] = useState(params.contribution ? String(params.contribution) : '10');
  const [frequency, setFrequency] = useState<ContributionFrequency>(params.frequency ?? 'weekly');
  const [ratePct, setRatePct] = useState(params.annualRatePct ? String(params.annualRatePct) : '5');
  const [years, setYears] = useState(params.years ? String(params.years) : '10');

  const result = useMemo(
    () =>
      computeCompoundGrowth({
        initial: parseFloat(initial) || 0,
        contribution: parseFloat(contribution) || 0,
        frequency,
        annualRatePct: parseFloat(ratePct) || 0,
        years: parseFloat(years) || 0,
      }),
    [initial, contribution, frequency, ratePct, years]
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
        resultCard: { borderRadius: radius.card, alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.lg, ...glow(colors.accent) },
        resultLabel: { ...typography.micro, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '700', letterSpacing: 0.5 },
        resultTagline: { ...typography.body, fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', marginBottom: spacing.sm },
        resultValue: { ...typography.title, fontSize: 34, color: '#fff' },
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
    <Screen title="Compound Calculator" onBack={() => navigation.goBack()}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>Illustrative only — plug in your own numbers, not a guarantee of real returns.</Text>
      </View>

      <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultCard}>
        <Text style={styles.resultLabel}>💡 {brand.name.toUpperCase()} PROJECTION</Text>
        <Text style={styles.resultTagline}>Small habits create big results.</Text>
        <Text style={styles.resultValue}>{formatMoney(result.futureValue)}</Text>
        <Text style={styles.resultCaption}>
          in {years || '0'} year{years === '1' ? '' : 's'}
        </Text>
        <View style={styles.resultSubRow}>
          <View style={styles.resultSubBlock}>
            <Text style={styles.resultSubLabel}>You put in</Text>
            <Text style={styles.resultSubValue}>{formatMoney(result.totalContributed)}</Text>
          </View>
          <View style={styles.resultSubBlock}>
            <Text style={styles.resultSubLabel}>Growth</Text>
            <Text style={styles.resultSubValue}>{formatMoney(result.totalGrowth)}</Text>
          </View>
        </View>
      </LinearGradient>

      <SectionCard>
        <Text style={styles.label}>Starting amount</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={initial} onChangeText={setInitial} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Contribution amount</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={contribution} onChangeText={setContribution} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>How often</Text>
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

        <Text style={styles.label}>Assumed annual return (%)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={ratePct} onChangeText={setRatePct} placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Years</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={years} onChangeText={setYears} placeholderTextColor={colors.textMuted} />
      </SectionCard>
    </Screen>
  );
}
