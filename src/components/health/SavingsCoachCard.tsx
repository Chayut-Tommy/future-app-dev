import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { Button } from '../shared/Button';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import {
  findSavingsAsset,
  computeSavingsSummary,
  findBestComparison,
  annualInterestDifference,
} from '../../lib/calculations/savingsCoach';
import { brand } from '../../lib/brand';

/**
 * "Savings Account Coach" — Today card. Real math on the user's own
 * numbers; the "better rate" nudge only ever references rates the user
 * entered themselves via Discover's comparison tool (never a Lulu-asserted
 * "current best market rate"). One source of truth: this reads/edits the
 * same savings asset shown in Wealth — never a second, duplicate "Add
 * savings" flow (PRD bug report).
 */
export function SavingsCoachCard() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, glow } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const savingsAsset = findSavingsAsset(data.assets);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
        statBlock: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.sm },
        statLabel: { ...typography.micro, color: colors.textSecondary, marginBottom: 2 },
        statValue: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        opportunityCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.warningSoft,
          borderRadius: radius.control,
          padding: spacing.sm,
          marginTop: spacing.sm,
          ...glow(colors.warning),
        },
        opportunityText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, flex: 1, lineHeight: 17 },
        actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
        actionButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography, glow]
  );

  if (!savingsAsset) {
    return (
      <SectionCard>
        <Text style={styles.title}>Do you have a savings account?</Text>
        <Text style={styles.body}>Add its balance and rate, and {brand.name} will show what it's really earning you.</Text>
        <Button label="Add savings" onPress={() => setModalVisible(true)} />
        <AddWealthItemModal visible={modalVisible} kind="asset" presetAssetType="savings" onClose={() => setModalVisible(false)} />
      </SectionCard>
    );
  }

  const summary = computeSavingsSummary(savingsAsset);
  const bestComparison = findBestComparison(data.savingsComparisons, summary.rate);
  const difference = bestComparison ? annualInterestDifference(summary.balance, summary.rate, bestComparison.rate) : 0;

  return (
    <SectionCard>
      <Text style={styles.title}>Savings Account Coach</Text>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setModalVisible(true)}>
        <Text style={styles.body}>
          Your ${Math.round(summary.balance).toLocaleString()} savings is earning {(summary.rate * 100).toFixed(2)}%{' '}
          <Ionicons name="pencil" size={12} color={colors.textMuted} />
        </Text>
      </TouchableOpacity>
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>This year</Text>
          <Text style={styles.statValue}>${Math.round(summary.annualInterest).toLocaleString()}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Per month</Text>
          <Text style={styles.statValue}>${Math.round(summary.monthlyInterest).toLocaleString()}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>After tax (est.)</Text>
          <Text style={styles.statValue}>${Math.round(summary.afterTaxAnnual).toLocaleString()}</Text>
        </View>
      </View>

      {bestComparison && difference > 20 ? (
        <View style={styles.opportunityCard}>
          <Ionicons name="alert-circle" size={18} color={colors.warning} />
          <Text style={styles.opportunityText}>
            Opportunity found — {bestComparison.bankName} at {(bestComparison.rate * 100).toFixed(2)}% could earn you
            approximately ${Math.round(difference).toLocaleString()} more this year.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Button label="Edit savings" variant="secondary" onPress={() => setModalVisible(true)} style={styles.actionButton} />
        <Button label="Compare rates" variant="secondary" onPress={() => navigation.navigate('SavingsComparison')} style={styles.actionButton} />
      </View>
      <AddWealthItemModal visible={modalVisible} kind="asset" editAsset={savingsAsset} onClose={() => setModalVisible(false)} />
    </SectionCard>
  );
}
