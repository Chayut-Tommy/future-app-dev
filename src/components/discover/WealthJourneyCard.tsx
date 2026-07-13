import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { WealthPath, WealthPathKey, computeCurrentPathKey } from '../../lib/calculations/wealthJourney';

/**
 * "Your Money Path" — separate paths for separate life situations (PRD
 * ask, §8) instead of one universal journey: Foundation is always shown,
 * Debt only when relevant, Wealth always available, Retirement once
 * retirement savings exist. One path is pre-selected as "Current Path"
 * based on the user's real situation; the others stay one tap away rather
 * than disappearing, since someone can be building Wealth while still
 * paying down Debt.
 */
export function WealthJourneyCard({ name, paths }: { name: string | null; paths: WealthPath[] }) {
  const { colors, radius, spacing, typography } = useTheme();
  const defaultKey = useMemo(() => computeCurrentPathKey(paths), [paths]);
  const [selectedKey, setSelectedKey] = useState<WealthPathKey>(defaultKey);
  const selectedPath = paths.find((p) => p.key === selectedKey) ?? paths[0];

  const currentIndex = selectedPath.stages.findIndex((s) => !s.done);
  const allDone = currentIndex === -1;
  const currentStage = allDone ? selectedPath.stages[selectedPath.stages.length - 1] : selectedPath.stages[currentIndex];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm },
        tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
        tab: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        tabActive: { backgroundColor: colors.accentSoft },
        tabText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        tabTextActive: { color: colors.accentStrong, fontWeight: '700' },
        stageRow: { flexDirection: 'row', alignItems: 'flex-start' },
        rail: { width: 36, alignItems: 'center' },
        dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
        dotDone: { backgroundColor: colors.accentSoft },
        dotCurrent: { backgroundColor: colors.accent },
        dotPending: { backgroundColor: colors.surfaceMuted },
        emoji: { fontSize: 15 },
        connector: { width: 2, flex: 1, minHeight: spacing.lg, backgroundColor: colors.border, marginVertical: 2 },
        stageTextBlock: { flex: 1, paddingBottom: spacing.lg, paddingTop: 6 },
        stageLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        stageLabelPending: { color: colors.textSecondary, fontWeight: '400' },
        hereBadge: {
          alignSelf: 'flex-start',
          marginTop: 4,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.pill,
          paddingVertical: 3,
          paddingHorizontal: spacing.sm,
        },
        hereBadgeText: { ...typography.micro, fontSize: 10, color: colors.accentStrong, fontWeight: '700' },
        summary: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.md },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <SectionCard>
      <Text style={styles.title}>{name ? `${name}'s Wealth Journey` : 'Your Wealth Journey'}</Text>
      <View style={styles.tabRow}>
        {paths.map((p) => {
          const active = p.key === selectedKey;
          const isCurrent = p.key === defaultKey;
          return (
            <TouchableOpacity key={p.key} style={[styles.tab, active ? styles.tabActive : null]} onPress={() => setSelectedKey(p.key)}>
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                {p.label}
                {isCurrent ? ' · Current' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.summary}>
        {allDone ? "You've reached every stage on this path — incredible." : `You are here: ${currentStage.label}`}
      </Text>
      {selectedPath.stages.map((stage, i) => {
        const isCurrent = i === currentIndex;
        const isLast = i === selectedPath.stages.length - 1;
        return (
          <View key={stage.id} style={styles.stageRow}>
            <View style={styles.rail}>
              <View style={[styles.dot, stage.done ? styles.dotDone : isCurrent ? styles.dotCurrent : styles.dotPending]}>
                {stage.done ? (
                  <Ionicons name="checkmark" size={16} color={colors.accentStrong} />
                ) : (
                  <Text style={styles.emoji}>{stage.emoji}</Text>
                )}
              </View>
              {!isLast ? <View style={styles.connector} /> : null}
            </View>
            <View style={styles.stageTextBlock}>
              <Text style={[styles.stageLabel, !stage.done && !isCurrent ? styles.stageLabelPending : null]}>{stage.label}</Text>
              {isCurrent ? (
                <View style={styles.hereBadge}>
                  <Text style={styles.hereBadgeText}>YOU ARE HERE</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}
