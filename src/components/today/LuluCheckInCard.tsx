import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { DailyInsight } from '../../lib/calculations/dailyInsight';

/**
 * "Lulu Daily Check-in" — a compact AI message (PRD ask: greeting + a short
 * insight, fitting without much scrolling). One top line plus a short
 * insight line — nothing else.
 *
 * Pass 2B — this card previously also carried the big Navilo Score ring,
 * numbers, quick-indicator chips, and "Improve score" button (merged into
 * one card by an earlier PRD ask). That entire presentation has been
 * extracted to the new compact chip inside Your Today Briefing (see
 * ScoreChip.tsx and its presentation module) — the two concerns (Lulu's
 * daily message vs. the score) are genuinely distinct, and un-merging them
 * here is the smallest change that satisfies "replaces the existing large
 * Today score presentation" without also dropping the accepted, unrelated
 * check-in message. This card no longer takes a score-related prop, no
 * longer imports the score ring, its explanation sheet, or their
 * formatting helpers, and does not compute or read score data in any way
 * — the full breakdown remains reachable via the chip's navigation to
 * Grow, not from here.
 *
 * Pass 2B, layout/colour correction §8 — this banner previously used the
 * same vivid `aiCardGradient`/`aiAccentColor` (plus a matching coloured
 * glow) every other AI-branded surface uses, which made it compete with
 * the Today Briefing hero for visual attention, especially in Purple and
 * in dark mode. It now derives its colours from `naviloPalette`'s
 * dedicated, deliberately MUTED insight-banner tokens
 * (aiInsightSurfaceStart/End, aiInsightForeground) instead — the same
 * selected colour style, but a lower-saturation, lower-contrast pair never
 * reused by the hero itself — and uses the ordinary `cardShadow` convention
 * (a restrained shadow/hairline border) rather than a vivid coloured glow,
 * so it reads as subordinate to the Briefing rather than a second
 * competing banner. Deliberately does NOT read `aiAccentColor`/
 * `aiCardGradient` any more — those stay exactly as they were for every
 * other consumer (WelcomeFlow, MoneyOpportunitiesHero, FloatingLuluButton,
 * etc.), unaffected by this card's own toned-down treatment. The
 * milestone-derived deduplication (dailyInsight.ts) is untouched — this
 * component still only renders whatever `insight` it's given.
 */
export function LuluCheckInCard({
  topLine,
  insight,
}: {
  /** Context-aware — never claims Lulu "checked overnight" before it
   * actually has (PRD bug report). Computed by the caller via
   * computeCheckInLine. */
  topLine: string;
  insight: DailyInsight | null;
}) {
  const { radius, spacing, typography, cardShadow, naviloPalette } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg, ...cardShadow },
        topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
        topLine: { ...typography.caption, fontSize: 13, color: naviloPalette.aiInsightForeground, fontWeight: '700', flex: 1 },
        insightLine: { ...typography.micro, fontSize: 12, color: naviloPalette.aiInsightForeground, opacity: 0.85, lineHeight: 16 },
      }),
    [radius, spacing, typography, cardShadow, naviloPalette]
  );

  return (
    <LinearGradient
      colors={[naviloPalette.aiInsightSurfaceStart, naviloPalette.aiInsightSurfaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <Ionicons name="sparkles" size={13} color={naviloPalette.aiInsightForeground} />
        <Text style={styles.topLine}>{topLine}</Text>
      </View>
      {insight ? (
        <Text style={styles.insightLine} numberOfLines={2}>
          {insight.text}
        </Text>
      ) : null}
    </LinearGradient>
  );
}
