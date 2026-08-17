import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { WorthKnowingInsight } from '../../lib/calculations/worthKnowing';
import { INSIGHT_PROVENANCE_OPACITY } from '../../theme/contrastOverrides';

/**
 * "Worth Knowing" — replaces Cashflow Focus's presentation on Today (see
 * worthKnowing.ts's own header comment for the full architecture decision).
 * Deliberately NOT the warning-yellow treatment FinancialStateCard used —
 * this is a calm, observational surface, never implying urgency by default
 * (spec §8). Reuses the same muted `aiInsightSurface*` tokens
 * LuluCheckInCard already reads (the established "Nolie noticed something"
 * visual language on Today), so the two presentations stay visually
 * consistent with each other even though only one of them can ever be on
 * screen at a time.
 *
 * Card density is deliberately fixed at exactly what the spec asks for: one
 * section label, one headline, one short explanation, one optional CTA line
 * — no button row, no secondary metrics, no expandable content.
 *
 * Accessibility — every inner Text/icon is marked
 * importantForAccessibility="no": the caller (TodayScreen.tsx) wraps this
 * card in a single tappable container carrying one composed
 * accessibilityLabel ("Worth Knowing. <title>. <body> <cta>."), matching the
 * spec's own suggested VoiceOver structure (§29) — a single coherent
 * announcement, never one pass per inner Text node.
 */
export function WorthKnowingCard({ insight }: { insight: WorthKnowingInsight }) {
  const { spacing, radius, typography, cardShadow, naviloPalette } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg, ...cardShadow },
        labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
        label: { ...typography.micro, fontSize: 11, color: naviloPalette.aiInsightForeground, fontWeight: '700', letterSpacing: 0.5 },
        headline: { ...typography.heading, fontSize: 16, color: naviloPalette.aiInsightForeground, marginBottom: 4 },
        body: { ...typography.caption, fontSize: 13, color: naviloPalette.aiInsightForeground, opacity: 0.85, lineHeight: 18, marginBottom: spacing.sm },
        ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        ctaText: { ...typography.caption, fontSize: 13, color: naviloPalette.aiInsightForeground, fontWeight: '700' },
        // Correction round — raised from 0.65 to INSIGHT_PROVENANCE_OPACITY
        // (0.83): a device test found this line too faint in Sunrise/light,
        // confirmed as a genuine 4.5:1 contrast failure at the old opacity
        // (see contrastOverrides.ts's own derivation).
        provenance: { ...typography.micro, fontSize: 11, color: naviloPalette.aiInsightForeground, opacity: INSIGHT_PROVENANCE_OPACITY, marginTop: spacing.sm },
      }),
    [spacing, radius, typography, cardShadow, naviloPalette]
  );

  return (
    <LinearGradient
      colors={[naviloPalette.aiInsightSurfaceStart, naviloPalette.aiInsightSurfaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants">
        <Ionicons name="sparkles" size={13} color={naviloPalette.aiInsightForeground} />
        <Text style={styles.label}>WORTH KNOWING</Text>
      </View>
      <Text style={styles.headline} importantForAccessibility="no">
        {insight.title}
      </Text>
      <Text style={styles.body} importantForAccessibility="no">
        {insight.body}
      </Text>
      <View style={styles.ctaRow} importantForAccessibility="no-hide-descendants">
        <Text style={styles.ctaText}>{insight.ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={13} color={naviloPalette.aiInsightForeground} />
      </View>
      <Text style={styles.provenance} importantForAccessibility="no">
        Based on what you’ve recorded
      </Text>
    </LinearGradient>
  );
}
