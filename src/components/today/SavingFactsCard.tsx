import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { pickDailySavingFacts } from '../../lib/calculations/savingFacts';

/** One big-number "Money Fact" a day — minimal reading, maximum visual
 * impact (PRD ask). "Try calculator" hands the exact scenario numbers to
 * the Compound Calculator so the two never disagree. */
export function SavingFactsCard() {
  const navigation = useNavigation<any>();
  const { colors, spacing, typography } = useTheme();
  const fact = useMemo(() => pickDailySavingFacts(new Date(), 1)[0], []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
        headerText: { ...typography.heading, fontSize: 13, color: colors.textPrimary },
        scenario: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
        bigRow: { alignItems: 'center', paddingVertical: spacing.sm },
        bigValue: { ...typography.title, fontSize: 32, color: colors.accentStrong },
        bigCaption: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        tipText: { ...typography.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginTop: spacing.xs },
        button: {
          alignSelf: 'center',
          marginTop: spacing.md,
          backgroundColor: colors.accentSoft,
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: spacing.lg,
        },
        buttonText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, spacing, typography]
  );

  if (!fact) return null;

  return (
    <SectionCard>
      <View style={styles.header}>
        <Ionicons name="bulb" size={16} color={colors.gold} />
        <Text style={styles.headerText}>Money Fact</Text>
      </View>
      <Text style={styles.scenario}>{fact.scenario}</Text>

      {fact.resultBig ? (
        <View style={styles.bigRow}>
          <Text style={styles.bigValue}>{fact.resultBig}</Text>
          {fact.resultCaption ? <Text style={styles.bigCaption}>{fact.resultCaption}</Text> : null}
        </View>
      ) : (
        <Text style={styles.tipText}>{fact.tipText}</Text>
      )}

      {fact.calculatorParams ? (
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('CompoundCalculator', fact.calculatorParams)}>
          <Text style={styles.buttonText}>Try calculator</Text>
        </TouchableOpacity>
      ) : null}
    </SectionCard>
  );
}
