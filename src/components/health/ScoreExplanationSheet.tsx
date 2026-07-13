import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import {
  LuluScoreResult,
  LIFE_STAGE_LABEL,
  FACTOR_STATUS_GLYPH,
  FACTOR_STATUS_LABEL,
  FactorStatus,
} from '../../lib/calculations/luluScore';
import { computeScoreMovement, buildScoreSummaryLine } from '../../lib/calculations/scoreExplanation';
import { ProgressBar } from '../shared/ProgressBar';
import { brand } from '../../lib/brand';

function statusColor(colors: ReturnType<typeof useTheme>['colors'], status: FactorStatus): string {
  switch (status) {
    case 'healthy':
      return colors.success;
    case 'improving':
      return colors.accent;
    case 'needs_attention':
      return colors.warning;
    case 'not_started':
      return colors.textMuted;
    default:
      return colors.textSecondary;
  }
}

/**
 * "How Lulu calculates your score" — the full Lulu Score v2 breakdown
 * (PRD §A13): header (score, life stage, Money Picture completeness,
 * confidence, this month's movement), then one card per category with
 * every factor's status, current position, healthy target, and potential
 * points. Every number here comes straight from computeLuluScore — this
 * sheet only formats and explains, never recalculates (PRD §A12).
 */
export function ScoreExplanationSheet({ visible, onClose, result }: { visible: boolean; onClose: () => void; result: LuluScoreResult }) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useAppState();
  const movement = useMemo(() => (visible ? computeScoreMovement(data, result) : null), [visible, data, result]);
  const summaryLine = useMemo(() => buildScoreSummaryLine(result), [result]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          maxHeight: '88%',
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
        title: { ...typography.heading, fontSize: 18, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
        totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: spacing.sm },
        totalValue: { ...typography.title, fontSize: 32, color: colors.textPrimary },
        totalMax: { ...typography.caption, color: colors.textMuted },
        metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
        metaChip: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
        metaChipLabel: { ...typography.micro, fontSize: 10, color: colors.textSecondary },
        metaChipValue: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
        movementCard: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.lg },
        movementHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
        movementHeaderText: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        movementLine: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
        category: { marginBottom: spacing.lg, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md },
        categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
        categoryLabel: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        categoryScore: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        factorRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        factorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
        factorGlyph: { ...typography.caption, fontSize: 13, fontWeight: '700', width: 18, textAlign: 'center' },
        factorLabel: { ...typography.body, fontSize: 13, color: colors.textPrimary, fontWeight: '600', flex: 1 },
        factorPoints: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        factorCurrent: { ...typography.micro, fontSize: 11, color: colors.textSecondary, marginLeft: 24, lineHeight: 15 },
        factorTarget: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginLeft: 24, marginTop: 2, lineHeight: 15 },
        factorActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 24, marginTop: spacing.xs },
        factorPotential: { ...typography.micro, fontSize: 11, color: colors.gold, fontWeight: '700' },
        factorActionChip: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
        factorActionText: { ...typography.micro, fontSize: 10, color: colors.accentStrong, fontWeight: '700' },
        disclosure: { ...typography.micro, fontSize: 10, color: colors.textMuted, textAlign: 'center', lineHeight: 14, marginTop: spacing.sm },
        closeButton: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: Math.max(insets.bottom, spacing.md) },
        closeText: { color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>How {brand.name} calculates your score</Text>
          <Text style={styles.subtitle}>Five weighted areas of real financial health — always the same formula, nothing hidden.</Text>

          {!result.locked ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalValue}>{result.score}</Text>
                <Text style={styles.totalMax}>/ 100</Text>
              </View>
              <View style={styles.metaRow}>
                {result.lifeStage ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipLabel}>STAGE</Text>
                    <Text style={styles.metaChipValue}>{LIFE_STAGE_LABEL[result.lifeStage]}</Text>
                  </View>
                ) : null}
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>MONEY PICTURE</Text>
                  <Text style={styles.metaChipValue}>{result.completeness.percent}% complete</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>CONFIDENCE</Text>
                  <Text style={styles.metaChipValue}>{result.confidence[0].toUpperCase() + result.confidence.slice(1)}</Text>
                </View>
              </View>

              {summaryLine ? (
                <View style={styles.movementCard}>
                  <View style={styles.movementHeader}>
                    <Ionicons name="sparkles" size={16} color={colors.accentStrong} />
                    <Text style={styles.movementHeaderText}>{brand.name}'s view</Text>
                  </View>
                  <Text style={styles.movementLine}>{summaryLine}</Text>
                </View>
              ) : null}

              {movement && movement.delta !== 0 ? (
                <View style={styles.movementCard}>
                  <View style={styles.movementHeader}>
                    <Ionicons name={movement.delta > 0 ? 'trending-up' : 'trending-down'} size={16} color={colors.accentStrong} />
                    <Text style={styles.movementHeaderText}>
                      Your {brand.scoreName} {movement.delta > 0 ? 'increased' : 'decreased'} by {Math.abs(movement.delta)} point
                      {Math.abs(movement.delta) === 1 ? '' : 's'} recently
                    </Text>
                  </View>
                  {movement.entries.map((e) => (
                    <Text key={e.categoryKey} style={styles.movementLine}>
                      {e.delta > 0 ? '+' : ''}
                      {e.delta} {e.text}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false}>
            {result.categories.map((category) => (
              <View key={category.key} style={styles.category}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  <Text style={styles.categoryScore}>
                    {Math.round(category.points)} / {category.maxPoints}
                  </Text>
                </View>
                <ProgressBar progress={category.maxPoints > 0 ? category.points / category.maxPoints : 0} />

                {category.factors.map((factor) => (
                  <View key={factor.key} style={styles.factorRow}>
                    <View style={styles.factorHeaderRow}>
                      <Text style={[styles.factorGlyph, { color: statusColor(colors, factor.status) }]}>{FACTOR_STATUS_GLYPH[factor.status]}</Text>
                      <Text style={styles.factorLabel}>{factor.label}</Text>
                      <Text style={styles.factorPoints}>
                        {factor.applicable ? `${Math.round(factor.points * 10) / 10} / ${Math.round(factor.maxPoints * 10) / 10}` : FACTOR_STATUS_LABEL[factor.status]}
                      </Text>
                    </View>
                    {factor.applicable ? (
                      <>
                        <Text style={styles.factorCurrent}>{factor.current}</Text>
                        <Text style={styles.factorTarget}>General reference: {factor.target}</Text>
                        <View style={styles.factorActionRow}>
                          {factor.potentialPoints >= 0.5 ? (
                            <Text style={styles.factorPotential}>Up to +{Math.round(factor.potentialPoints)} pts</Text>
                          ) : null}
                          <View style={styles.factorActionChip}>
                            <Text style={styles.factorActionText}>{factor.action}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <Text style={styles.disclosure}>
            {brand.scoreName} is an educational indicator based on the information entered. It is not a credit score, financial-product
            recommendation or personal financial advice.
          </Text>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
