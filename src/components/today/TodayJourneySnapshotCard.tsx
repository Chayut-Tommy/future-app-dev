import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { ProgressBar } from '../shared/ProgressBar';
import { JourneySnapshot } from '../../lib/calculations/journeySnapshot';

/**
 * Pass 2B, visual correction — the compact Journey snapshot, placed
 * immediately after Your Today Briefing, replacing the long Today Journey
 * timeline. Renders exactly what `snapshot` (computeJourneySnapshot,
 * wrapping the existing, unmodified computeAchievements()) already decided
 * — never recomputes or fabricates a milestone, target, percentage, or
 * recommendation of its own. The full timeline itself (JourneyTimeline.tsx)
 * remains reachable via onPress, mounted (and, arriving from here, fully
 * expanded — see DiscoverScreen.tsx) in Grow.
 *
 * Colour correction — sits on a plain SectionCard (not the hero gradient),
 * so it reads from `aiAccentColor`/`aiAccentSoft` (ThemeContext) — the same
 * general-purpose, 3-way Navilo-colour-style tokens every other ordinary
 * surface uses (WelcomeFlow, MoneyOpportunitiesHero, FloatingLuluButton,
 * etc.) — rather than the hero-specific `naviloPalette` (whose translucent
 * tile tokens are tuned for sitting on the gradient and would be invisible
 * here). Selecting Purple/Sunrise in Settings now recolours this card too,
 * coherently with the rest of the app, instead of staying hard-coded
 * Ocean Blue. Still a compass icon (route-appropriate, distinct from
 * Score's gauge and from Journey's own full-timeline trophy nodes) — only
 * the colour source changed, not the identity.
 *
 * Spacing refinement — a touch more room between the completed-count line,
 * the NEXT eyebrow/milestone, the progress block, and the "View full
 * journey" action, so the four pieces read as a clearer sequence rather
 * than a tight stack. No data, calculation, or navigation change.
 */
export function TodayJourneySnapshotCard({ snapshot, onPress }: { snapshot: JourneySnapshot; onPress: () => void }) {
  const { colors, radius, spacing, typography, aiAccentColor, aiAccentSoft } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
        iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: aiAccentSoft },
        textBlock: { flex: 1 },
        countText: { ...typography.body, fontSize: 16, color: colors.textPrimary, fontWeight: '800' },
        nextEyebrow: { ...typography.micro, fontSize: 10, color: aiAccentColor, fontWeight: '700', letterSpacing: 0.6, marginTop: spacing.md },
        nextText: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginTop: 3 },
        allCompletedText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: spacing.md },
        progressWrap: { marginTop: spacing.md },
        progressText: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: 5 },
        viewFullRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingTop: spacing.md,
          marginTop: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        viewFullText: { ...typography.caption, fontSize: 13, color: aiAccentColor, fontWeight: '700' },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
      }),
    [colors, radius, spacing, typography, aiAccentColor, aiAccentSoft]
  );

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Journey</Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          snapshot.unavailable
            ? 'Your Journey is not available yet'
            : `${snapshot.completedCount} of ${snapshot.totalCount} milestones completed${snapshot.next ? `, next: ${snapshot.next.title}` : ''}`
        }
        accessibilityHint="Opens the full Journey in Grow"
      >
        <SectionCard>
          {snapshot.unavailable ? (
            <Text style={styles.emptyText}>Your Journey isn't available yet.</Text>
          ) : (
            <View style={styles.row}>
              <View style={styles.iconBadge}>
                <Ionicons name="compass-outline" size={17} color={aiAccentColor} />
              </View>
              <View style={styles.textBlock}>
                <Text style={styles.countText}>
                  {snapshot.completedCount} of {snapshot.totalCount} milestones completed
                </Text>
                {snapshot.allCompleted ? (
                  <Text style={styles.allCompletedText}>All milestones completed</Text>
                ) : snapshot.next ? (
                  <>
                    <Text style={styles.nextEyebrow}>NEXT</Text>
                    <Text style={styles.nextText} numberOfLines={1}>
                      {snapshot.next.title}
                    </Text>
                    {snapshot.nextProgress ? (
                      <View style={styles.progressWrap}>
                        <ProgressBar progress={snapshot.nextProgress.current / snapshot.nextProgress.target} color={aiAccentColor} height={4} />
                        <Text style={styles.progressText}>{snapshot.nextProgress.formatted}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          )}
          <View style={styles.viewFullRow}>
            <Text style={styles.viewFullText}>View full journey</Text>
            <Ionicons name="chevron-forward" size={14} color={aiAccentColor} />
          </View>
        </SectionCard>
      </TouchableOpacity>
    </>
  );
}
