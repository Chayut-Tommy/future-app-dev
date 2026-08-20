import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { WorthKnowingInsight } from '../../lib/calculations/worthKnowing';
import { INSIGHT_PROVENANCE_OPACITY, designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * "Worth Knowing" — Design 5.1's highlighted supporting tier.
 *
 * Previously this rendered as a gradient card reading from the hero-scoped
 * `naviloPalette.aiInsightSurface*` tokens. On a page that now has one
 * genuine hero, a second gradient surface competed with it directly, and
 * Design 5.1's density budget allows exactly one expressive hero per
 * screen. It is now the flat highlighted tier: a low-saturation info tint
 * with a matching border, which is a clear step above the plain supporting
 * cards around it without pretending to be a hero.
 *
 * `info` is a SHARED role — identical across Ocean, Purple and Sunrise.
 * That is deliberate and required: Design 5.1 bars a colour style from
 * retinting status roles, and an insight tier is a status, so this card
 * looks the same in all three styles by design rather than by omission.
 *
 * The selector, the maximum-one rule, occurrence identity, dismissal and
 * contextual navigation are all untouched — this is presentation only, and
 * this component still renders exactly what `insight` already decided.
 *
 * Accessibility — every inner node stays hidden because the caller wraps
 * this card in a single tappable container carrying one composed label.
 */
export function WorthKnowingCard({ insight }: { insight: WorthKnowingInsight }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: semantic.infoTint,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.infoBorder,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        labelRow: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs },
        label: { ...typeStyle('eyebrow', locale), color: semantic.infoText },
        headline: { ...typeStyle('titleCard', locale), color: semantic.textPrimary, marginTop: designSpacing.sm },
        body: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
        // Actions wrap rather than truncate or overflow at large text sizes.
        actionRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: designSpacing.xs,
          marginTop: designSpacing.md,
          minHeight: designLayout.touchTargetMin,
        },
        actionText: { ...typeStyle('labelButton', locale), color: semantic.infoText },
        provenance: {
          ...typeStyle('meta', locale),
          color: semantic.textTertiary,
          opacity: INSIGHT_PROVENANCE_OPACITY,
          marginTop: designSpacing.sm,
        },
      }),
    [semantic, locale]
  );

  return (
    <View style={styles.card} testID="today-worth-knowing-card">
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants">
        <Ionicons name="sparkles-outline" size={13} color={semantic.infoText} />
        <Text style={styles.label}>WORTH KNOWING</Text>
      </View>
      <Text style={styles.headline} importantForAccessibility="no">
        {insight.title}
      </Text>
      <Text style={styles.body} importantForAccessibility="no">
        {insight.body}
      </Text>
      <View style={styles.actionRow} importantForAccessibility="no-hide-descendants">
        <Text style={styles.actionText}>{insight.ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color={semantic.infoText} />
      </View>
      <Text style={styles.provenance} importantForAccessibility="no">
        Based on what you’ve recorded
      </Text>
    </View>
  );
}
