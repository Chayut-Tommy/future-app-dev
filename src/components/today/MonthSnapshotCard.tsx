import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeMonthToDateActivity } from '../../lib/calculations/monthlySummary';

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '+';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * An immediate pulse check every time Today opens — income and spend
 * actually recorded since the 1st, at a glance, without a trip to Money
 * (PRD ask, §Today: "a simple live snapshot since the beginning of the
 * current month"). The "X so far" title is rendered by TodayScreen as an
 * external section header, consistent with every other Today section —
 * this component is just the card content. Tapping anywhere on the card
 * opens Money. Always visible — a brand-new user sees an empty state that
 * encourages completion instead of the section disappearing, so the page
 * layout stays consistent for every user.
 */
export function MonthSnapshotCard() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, spacing, typography, cardShadow, radius } = useTheme();
  const activity = useMemo(() => computeMonthToDateActivity(data), [data]);
  const hasData = activity.income > 0 || activity.spend > 0;
  const net = activity.income - activity.spend;
  // Factual, never framed as good/bad (PRD Voice guide §0.1a) — a positive
  // net reads in the accent color, a negative net in the warning color
  // (never danger red, which this app reserves for genuinely time-sensitive
  // items), and exactly zero stays neutral.
  const netColor = net > 0 ? colors.accentStrong : net < 0 ? colors.warning : colors.textPrimary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
        tile: {
          flex: 1,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
          ...cardShadow,
        },
        tileLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
        tileValue: { ...typography.title, fontSize: 20 },
        netRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        netLabel: { ...typography.body, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        netValue: { ...typography.heading, fontSize: 16 },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, spacing, typography, cardShadow, radius]
  );

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Money')}>
      <SectionCard>
        {hasData ? (
          <>
            <View style={styles.row}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>Income received</Text>
                <Text style={[styles.tileValue, { color: colors.accentStrong }]}>{formatMoney(activity.income)}</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>Spent</Text>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatMoney(-activity.spend)}</Text>
              </View>
            </View>
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Net this month</Text>
              <Text style={[styles.netValue, { color: netColor }]}>{formatMoney(net)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>
            Not enough information yet. Add your income and spending to unlock your monthly snapshot.
          </Text>
        )}
      </SectionCard>
    </TouchableOpacity>
  );
}
