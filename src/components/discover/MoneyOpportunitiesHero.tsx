import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { MoneyOpportunity } from '../../lib/calculations/moneyOpportunities';
import { brand } from '../../lib/brand';

const COLLAPSED_COUNT = 3;

/**
 * The data-driven hero Grow leads with (PRD ask), instead of a static
 * education library — a set of factual reference points ("current" vs. "a
 * general reference"), not recommendations. The count is always the real
 * number of applicable insights, never a fixed "3".
 */
export function MoneyOpportunitiesHero({
  opportunities,
  onAction,
}: {
  opportunities: MoneyOpportunity[];
  onAction: (opportunity: MoneyOpportunity) => void;
}) {
  const { colors, radius, spacing, typography, glow, aiAccentColor, aiCardGradient, onAiAccent } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? opportunities : opportunities.slice(0, COLLAPSED_COUNT);
  const hasMore = opportunities.length > COLLAPSED_COUNT;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg, ...glow(aiAccentColor) },
        headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
        eyebrow: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
        title: { ...typography.title, fontSize: 19, color: '#fff', fontWeight: '800', marginBottom: spacing.xs },
        subtitle: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: spacing.md },
        itemRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
        itemNumber: { ...typography.heading, fontSize: 14, color: 'rgba(255,255,255,0.6)', width: 18 },
        itemTextBlock: { flex: 1 },
        itemTitle: { ...typography.body, fontSize: 14, color: '#fff', fontWeight: '700', marginBottom: 2 },
        itemDetail: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 16 },
        itemAction: { ...typography.micro, fontSize: 11, color: '#fff', fontWeight: '700', marginTop: 4 },
        exploreButton: {
          alignSelf: 'center',
          marginTop: spacing.md,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: radius.pill,
          paddingVertical: 9,
          paddingHorizontal: spacing.lg,
        },
        exploreButtonText: { ...typography.caption, fontSize: 12, color: '#fff', fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, glow, aiAccentColor]
  );

  if (opportunities.length === 0) {
    return (
      <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="sparkles" size={14} color={onAiAccent} />
          <Text style={styles.eyebrow}>{brand.name.toUpperCase()} PICK</Text>
        </View>
        <Text style={styles.title}>Your money picture looks solid</Text>
        <Text style={styles.subtitle}>Add more income, savings, or investments and {brand.name} will keep finding new opportunities.</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={14} color={onAiAccent} />
        <Text style={styles.eyebrow}>{brand.name.toUpperCase()} PICK</Text>
      </View>
      <Text style={styles.title}>
        ✨ {opportunities.length} insight{opportunities.length === 1 ? '' : 's'} from your money picture
      </Text>
      <Text style={styles.subtitle}>General reference points based on what you've added so far:</Text>

      {visible.map((opp, i) => (
        <TouchableOpacity key={opp.id} style={styles.itemRow} activeOpacity={0.8} onPress={() => onAction(opp)}>
          <Text style={styles.itemNumber}>{i + 1}.</Text>
          <View style={styles.itemTextBlock}>
            <Text style={styles.itemTitle}>{opp.title}</Text>
            <Text style={styles.itemDetail}>{opp.detail}</Text>
            <Text style={styles.itemAction}>{opp.actionLabel} →</Text>
          </View>
        </TouchableOpacity>
      ))}

      {hasMore ? (
        <TouchableOpacity style={styles.exploreButton} onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.exploreButtonText}>{expanded ? 'Show less' : 'Explore opportunities'}</Text>
        </TouchableOpacity>
      ) : null}
    </LinearGradient>
  );
}
