import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ScoreChipPresentation } from '../../lib/calculations/scoreChipPresentation';

/**
 * Pass 2B, visual correction — the compact, tappable Navilo Score chip
 * inside Your Today Briefing. Originally shared Journey's gold/trophy
 * treatment, which made Score read as another achievement rather than its
 * own distinct measure. Now a premium mint/green treatment instead: a soft
 * mint surface (colors.accentSoft), a clear green accent icon
 * (colors.accent) — a gauge/speedometer glyph, never the trophy Journey
 * uses — and navy headline text in light mode (colors.navy — this app's
 * own "trust, important numbers" identity colour, used here instead of
 * near-black body text) or accessible light text in dark mode
 * (colors.textPrimary, already a soft off-white there). Gold/yellow is
 * reserved for genuine attention states elsewhere in the app and is never
 * used here. Still visually subordinate (smaller, muted-by-default) to the
 * primary AUP/Available Money row below it — this correction only changes
 * colour and iconography, not size, position, or hierarchy. Renders
 * whatever `presentation` (selectScoreChipPresentation) already decided;
 * this component makes no state/eligibility decisions of its own and never
 * touches the score formula.
 */
export function ScoreChip({ presentation, onPress }: { presentation: ScoreChipPresentation; onPress: () => void }) {
  const { colors, radius, spacing, typography, scheme } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          alignSelf: 'flex-start',
          backgroundColor: presentation.tone === 'muted' ? colors.surfaceMuted : colors.accentSoft,
          borderRadius: radius.pill,
          paddingVertical: 6,
          paddingHorizontal: spacing.sm,
          marginBottom: spacing.sm,
        },
        iconBadge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flexShrink: 1 },
        label: {
          ...typography.caption,
          fontSize: 12,
          fontWeight: '700',
          color: presentation.tone === 'muted' ? colors.textSecondary : scheme === 'light' ? colors.navy : colors.textPrimary,
        },
        supportingText: { ...typography.micro, fontSize: 10, color: colors.textSecondary, marginTop: 1 },
      }),
    [colors, radius, spacing, typography, presentation.tone, scheme]
  );

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${presentation.label}. ${presentation.supportingText}`}
      accessibilityHint="Opens the full Navilo Score in Grow"
    >
      <View style={styles.iconBadge}>
        <Ionicons name="speedometer-outline" size={13} color={presentation.tone === 'muted' ? colors.textMuted : colors.accent} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.label} numberOfLines={1}>
          {presentation.label}
        </Text>
        <Text style={styles.supportingText} numberOfLines={1}>
          {presentation.supportingText}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
    </TouchableOpacity>
  );
}
