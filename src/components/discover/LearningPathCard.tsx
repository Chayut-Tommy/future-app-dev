import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
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
  const { colors, radius, spacing, typography } = useTheme();
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
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: 4 },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        progressBarWrap: { flex: 1 },
        progressLabel: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
        lessonList: { marginTop: spacing.md },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <SectionCard>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setExpanded((v) => !v)}>
        <View style={styles.header}>
          <View style={styles.emojiBadge}>
            <Text style={styles.emoji}>{path.emoji}</Text>
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
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
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
