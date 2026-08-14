import React, { useMemo } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';

/**
 * Pass 2D — one collapsible category inside the reorganised "Explore Money
 * Moves" (Saving / Investing / Debt-free / Home / Retirement / Learning).
 * A second, outer layer of expand/collapse above each category's own
 * existing content (e.g. LearningPathCard already has its own internal
 * lesson-list expand/collapse) — this shortens the feed without creating a
 * new navigation framework or duplicate detail screens: collapsed shows
 * just the category header, expanded reveals exactly the same
 * components/props this screen already rendered for that group.
 *
 * Not colour-only: the chevron direction is the primary expand/collapse
 * cue, backed by accessibilityState={{ expanded }} for VoiceOver/TalkBack.
 * minHeight: 44 keeps the header row an adequate touch target regardless
 * of Dynamic Type size.
 */
export function ExploreCategorySection({
  title,
  icon,
  expanded,
  onToggle,
  onLayout,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  expanded: boolean;
  onToggle: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm },
        iconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, flex: 1 },
        content: { marginTop: spacing.sm, gap: spacing.md },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <SectionCard>
      <View onLayout={onLayout}>
        <TouchableOpacity
          style={styles.header}
          activeOpacity={0.7}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded }}
          accessibilityHint={expanded ? 'Collapses this section' : 'Expands this section'}
        >
          <View style={styles.iconBadge}>
            <Ionicons name={icon} size={18} color={colors.textPrimary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </SectionCard>
  );
}
