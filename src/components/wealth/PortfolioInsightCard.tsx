import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { PortfolioInsight } from '../../lib/calculations/portfolioInsight';
import { brand } from '../../lib/brand';

const ICONS: Record<PortfolioInsight['kind'], keyof typeof Ionicons.glyphMap> = {
  no_investments: 'rocket-outline',
  cash_only: 'wallet-outline',
  has_investments: 'analytics-outline',
};

/**
 * Dynamic replacement for the old static "Understand your portfolio → Add
 * investments" card (PRD ask). Branches on real data instead of always
 * showing the same generic prompt.
 */
export function PortfolioInsightCard({
  insight,
  onAddInvestments,
  onLearn,
}: {
  insight: PortfolioInsight;
  onAddInvestments: () => void;
  onLearn: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.accentSoft, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        iconBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.accentStrong, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        action: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.accent },
        actionText: { ...typography.micro, color: colors.onAccent, fontWeight: '700' },
        linesBlock: { marginTop: spacing.sm, gap: 4 },
        lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
        lineText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, flex: 1, lineHeight: 17 },
        learnRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderStrong,
        },
        learnText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconBadge}>
          <Ionicons name={ICONS[insight.kind]} size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{insight.title}</Text>
          {insight.body ? <Text style={styles.body}>{insight.body}</Text> : null}
        </View>
        {insight.kind !== 'has_investments' ? (
          <TouchableOpacity style={styles.action} onPress={onAddInvestments} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionText}>{insight.kind === 'cash_only' ? 'Invest' : 'Start'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {insight.lines.length > 0 ? (
        <View style={styles.linesBlock}>
          {insight.lines.map((line) => (
            <View key={line} style={styles.lineRow}>
              <Ionicons name="ellipse" size={5} color={colors.accentStrong} style={{ marginTop: 6 }} />
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {insight.kind === 'no_investments' ? (
        <TouchableOpacity style={styles.learnRow} onPress={onLearn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="school-outline" size={14} color={colors.accentStrong} />
          <Text style={styles.learnText}>New to investing? Learn the basics with {brand.name} →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
