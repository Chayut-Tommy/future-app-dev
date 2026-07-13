import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { LuluScoreResult, scoreVisualBand, computeScoreIndicators } from '../../lib/calculations/luluScore';
import { DailyInsight } from '../../lib/calculations/dailyInsight';
import { ScoreExplanationSheet } from '../health/ScoreExplanationSheet';
import { CircularScore } from '../shared/CircularScore';

const CHIP_LABELS = ['Cashflow', 'Savings', 'Debt'];
const RING_SIZE = 72;

/**
 * "Lulu Daily Check-in" — a compact AI briefing, not a half-screen hero
 * (PRD ask: greeting + score + Journey preview should all fit without much
 * scrolling). One top line, a short insight, then the score ring and its
 * numbers side by side rather than stacked, so the card reads in one
 * glance instead of a tall vertical scroll.
 */
export function LuluCheckInCard({
  topLine,
  insight,
  luluScore,
}: {
  /** Context-aware — never claims Lulu "checked overnight" before it
   * actually has (PRD bug report). Computed by the caller via
   * computeCheckInLine. */
  topLine: string;
  insight: DailyInsight | null;
  luluScore: LuluScoreResult;
}) {
  const { colors, radius, spacing, typography, glow, aiAccentColor, aiCardGradient } = useTheme();
  const { t } = useTranslation();
  const [sheetVisible, setSheetVisible] = useState(false);
  const band = luluScore.locked ? null : scoreVisualBand(luluScore.score);
  const indicators = useMemo(() => computeScoreIndicators(luluScore), [luluScore]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg, ...glow(aiAccentColor) },
        topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
        topLine: { ...typography.caption, fontSize: 13, color: '#fff', fontWeight: '700', flex: 1 },
        insightLine: { ...typography.micro, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 16, marginBottom: spacing.sm },
        scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
        scoreTextBlock: { flex: 1 },
        scoreBigValue: { ...typography.title, fontSize: 24, color: '#fff', fontWeight: '800' },
        scoreBand: { ...typography.caption, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1, marginBottom: spacing.xs },
        chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          backgroundColor: 'rgba(255,255,255,0.16)',
          borderRadius: radius.pill,
          paddingVertical: 4,
          paddingHorizontal: spacing.sm,
        },
        chipText: { ...typography.micro, fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
        improveButton: {
          alignSelf: 'flex-start',
          marginTop: spacing.sm,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: radius.pill,
          paddingVertical: 7,
          paddingHorizontal: spacing.md,
        },
        improveButtonText: { ...typography.caption, fontSize: 12, color: '#fff', fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, glow, aiAccentColor]
  );

  return (
    <>
      <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.topRow}>
          <Ionicons name="sparkles" size={13} color="#fff" />
          <Text style={styles.topLine}>{topLine}</Text>
        </View>
        {insight ? (
          <Text style={styles.insightLine} numberOfLines={2}>
            {insight.text}
          </Text>
        ) : null}

        <TouchableOpacity activeOpacity={0.85} onPress={() => setSheetVisible(true)}>
          <View style={styles.scoreRow}>
            <CircularScore
              score={luluScore.score}
              locked={luluScore.locked}
              tone={band?.tone ?? 'warning'}
              size={RING_SIZE}
              strokeWidth={7}
              trackColor="rgba(255,255,255,0.2)"
              textColor="#fff"
            />
            <View style={styles.scoreTextBlock}>
              <Text style={styles.scoreBigValue}>{luluScore.locked ? '—' : `${luluScore.score}/100`}</Text>
              <Text style={styles.scoreBand}>{luluScore.locked ? 'Add income to unlock' : band?.message}</Text>
              {!luluScore.locked ? (
                <View style={styles.chipRow}>
                  {indicators.map((ind, i) => (
                    <View key={ind.label} style={styles.chip}>
                      <Ionicons name={ind.met ? 'checkmark' : 'ellipse-outline'} size={10} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.chipText}>{CHIP_LABELS[i] ?? ind.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          {!luluScore.locked ? (
            <View style={styles.improveButton}>
              <Text style={styles.improveButtonText}>{t('today.improveScore')}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </LinearGradient>
      <ScoreExplanationSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} result={luluScore} />
    </>
  );
}
