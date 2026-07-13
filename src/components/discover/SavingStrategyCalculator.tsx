import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { computeCompoundGrowth } from '../../lib/calculations/compoundCalculator';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Saving Strategy — reads like a calculator, not an article (PRD ask):
 * one flowing sentence with the numbers editable inline, always monthly
 * (the full Compound Calculator still offers weekly/fortnightly for anyone
 * who wants that detail).
 */
export function SavingStrategyCalculator() {
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography } = useTheme();
  const [contribution, setContribution] = useState('500');
  const [ratePct, setRatePct] = useState('6');
  const [years, setYears] = useState('20');

  const result = useMemo(
    () =>
      computeCompoundGrowth({
        initial: 0,
        contribution: parseFloat(contribution) || 0,
        frequency: 'monthly',
        annualRatePct: parseFloat(ratePct) || 0,
        years: parseFloat(years) || 0,
      }),
    [contribution, ratePct, years]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
        sentenceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
        sentenceText: { ...typography.body, fontSize: 15, color: colors.textPrimary },
        pill: {
          backgroundColor: colors.accentSoft,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          minWidth: 64,
          textAlign: 'center',
          fontSize: 15,
          fontWeight: '700',
          color: colors.accentStrong,
        },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
        resultLabel: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
        resultValue: { ...typography.title, fontSize: 30, color: colors.accentStrong },
        disclaimer: { ...typography.micro, fontSize: 10, color: colors.textMuted, marginTop: spacing.sm },
        linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
        linkText: { ...typography.caption, fontSize: 12, color: colors.accent, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <SectionCard>
      <Text style={styles.title}>Grow your money</Text>

      <View style={styles.sentenceRow}>
        <Text style={styles.sentenceText}>If you invest</Text>
        <TextInput
          style={styles.pill}
          keyboardType="decimal-pad"
          value={`$${contribution}`}
          onChangeText={(v) => setContribution(v.replace(/[^0-9.]/g, ''))}
        />
        <Text style={styles.sentenceText}>per month</Text>
      </View>

      <View style={styles.sentenceRow}>
        <Text style={styles.sentenceText}>With an average</Text>
        <TextInput style={styles.pill} keyboardType="decimal-pad" value={`${ratePct}%`} onChangeText={(v) => setRatePct(v.replace(/[^0-9.]/g, ''))} />
        <Text style={styles.sentenceText}>return</Text>
      </View>

      <View style={styles.sentenceRow}>
        <Text style={styles.sentenceText}>For</Text>
        <TextInput style={styles.pill} keyboardType="decimal-pad" value={years} onChangeText={(v) => setYears(v.replace(/[^0-9.]/g, ''))} />
        <Text style={styles.sentenceText}>years</Text>
      </View>

      <View style={styles.divider} />

      <Text style={styles.resultLabel}>Your money could grow to</Text>
      <Text style={styles.resultValue}>{formatMoney(result.futureValue)}</Text>
      <Text style={styles.disclaimer}>Illustrative only — assumes a steady average return, not a guarantee.</Text>

      <TouchableOpacity
        style={styles.linkRow}
        onPress={() =>
          navigation.navigate('CompoundCalculator', {
            initial: 0,
            contribution: parseFloat(contribution) || 0,
            frequency: 'monthly',
            annualRatePct: parseFloat(ratePct) || 0,
            years: parseFloat(years) || 0,
          })
        }
      >
        <Text style={styles.linkText}>Open full calculator →</Text>
      </TouchableOpacity>
    </SectionCard>
  );
}
