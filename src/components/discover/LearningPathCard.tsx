import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { ProgressBar } from '../shared/ProgressBar';
import { LearningPath, learningPathCards, learningPathProgress } from '../../lib/learningPaths';
import { LearningCardItem } from './LearningCardItem';

/**
 * A named journey, not a flat article list (PRD ask: "each journey
 * contains lessons"). Collapsed shows real progress; tapping expands the
 * ordered lesson list in place — same tap-to-expand pattern as individual
 * learning cards, just one level up.
 */
export function LearningPathCard({ path, startExpanded = false }: { path: LearningPath; startExpanded?: boolean }) {
  const { colors, radius, spacing, typography, semantic } = useTheme();
  // Wave 8 correction — the shipped semantic role resolver, so Grow's
  // sections stop being the last surfaces on the legacy scale.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const { data, markLearningCardCompleted } = useAppState();
  const [expanded, setExpanded] = useState(startExpanded);
  const cards = useMemo(() => learningPathCards(path), [path]);
  const progress = learningPathProgress(path, data.completedLearningCardIds);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        emojiBadge: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emoji: { fontSize: 22 },
        textBlock: { flex: 1 },
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 4 },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        progressBarWrap: { flex: 1 },
        progressLabel: { ...typeStyle('meta', locale), color: colors.textSecondary, fontWeight: '600' },
        lessonList: { marginTop: spacing.md },
      }),
    [colors, radius, spacing, typography, semantic, locale]
  );

  return (
    <SectionCard>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${path.title}, ${progress.completed} of ${progress.total} lessons completed`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.header}>
          {/* Wave 8 correction D — the journey's own structured `icon`
              (an Ionicons name that already existed on this data type)
              replaces the platform emoji, which rendered differently on
              every OS version and never read as one designed system. */}
          <View style={styles.emojiBadge}>
            <Ionicons name={path.icon} size={18} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>{path.title}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressBarWrap}>
                <ProgressBar progress={progress.total > 0 ? progress.completed / progress.total : 0} color={colors.accent} />
              </View>
              <Text style={styles.progressLabel}>
                {progress.completed}/{progress.total} lessons completed
              </Text>
            </View>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} importantForAccessibility="no" />
        </View>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.lessonList}>
          {cards.map((card) => (
            <LearningCardItem key={card.id} card={card} onOpen={() => markLearningCardCompleted(card.id)} />
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}
