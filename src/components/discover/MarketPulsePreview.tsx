import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { MARKET_INDEXES } from '../../lib/marketIndexes';

/**
 * Market Pulse preview — honest placeholder, not fabricated live data
 * (PRD Appendix: needs a licensed market-data provider that isn't wired up
 * yet). Still visually rich so the screen doesn't feel empty.
 */
export function MarketPulsePreview() {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        badge: { backgroundColor: colors.marketSoft, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
        badgeText: { ...typography.micro, color: colors.market, fontWeight: '700' },
        row: {
          flexDirection: 'row',
          gap: spacing.sm,
        },
        cell: {
          flex: 1,
          alignItems: 'center',
          backgroundColor: colors.marketSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.md,
        },
        symbol: { ...typography.micro, color: colors.market, marginTop: 6, fontWeight: '600' },
        value: { ...typography.caption, fontSize: 11, color: colors.textMuted, marginTop: 2 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Market Pulse</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Live data coming soon</Text>
        </View>
      </View>
      <View style={styles.row}>
        {MARKET_INDEXES.map((idx) => (
          <View key={idx.symbol} style={styles.cell}>
            <Ionicons name={idx.icon} size={18} color={colors.market} />
            <Text style={styles.symbol}>{idx.symbol}</Text>
            <Text style={styles.value}>—</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
