import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { ProgressBar } from '../shared/ProgressBar';
import { JourneySnapshot, upcomingMilestoneTitle } from '../../lib/calculations/journeySnapshot';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import { ROW_ICON_TILE_SIZE, isAccessibilityText } from '../../lib/calculations/todayComposition';
import i18n from '../../i18n';

/**
 * Design 5.1 p.7 — the Journey snapshot as ONE compact supporting row.
 *
 * Previously this was a small card in its own right: a section header, a
 * completed count, a NEXT eyebrow, a milestone title, a progress block and
 * its own bordered "View full journey" footer — five stacked pieces
 * competing with the hero directly beneath which they sat. Design 5.1
 * gives the Journey one row: icon, title and stage, a slim bar, and its
 * metadata. The whole row is the tap target, so the separate footer action
 * is gone rather than duplicated.
 *
 * Every number still comes from `snapshot` (computeJourneySnapshot, itself
 * wrapping the unmodified computeAchievements) — no milestone, target,
 * percentage or recommendation is computed here. Navigation is unchanged:
 * the row opens the same full Journey the footer link opened.
 *
 * It is a supporting surface — flat, bordered, on bgSurface — never a
 * second hero and never a tinted highlight tier. Today's visual budget
 * allows exactly one hero and at most two tinted cards, and the Journey is
 * neither.
 */
export function TodayJourneySnapshotCard({ snapshot, onPress }: { snapshot: JourneySnapshot; onPress: () => void }) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  // At accessibility sizes the stage metadata moves beneath the title
  // rather than truncating beside it.
  const stackMeta = isAccessibilityText(fontScale);

  const progress =
    snapshot.nextProgress && snapshot.nextProgress.target > 0
      ? Math.min(1, Math.max(0, snapshot.nextProgress.current / snapshot.nextProgress.target))
      : snapshot.totalCount > 0
        ? Math.min(1, Math.max(0, snapshot.completedCount / snapshot.totalCount))
        : 0;

  // Wave 9c state-communication correction B — the stage line is always
  // the NEXT (not-yet-achieved) milestone, so it renders the shared
  // UPCOMING presentation (journeySnapshot.upcomingMilestoneTitle) under a
  // "Next milestone" context, never a fixed past-tense record of an action
  // the customer has not taken.
  const stageLine = snapshot.allCompleted
    ? 'All milestones completed'
    : snapshot.next
      ? upcomingMilestoneTitle(snapshot.next)
      : `${snapshot.completedCount} of ${snapshot.totalCount} milestones completed`;
  const contextLine = !snapshot.allCompleted && snapshot.next ? 'Next milestone' : 'Your Journey';

  const metaLine = snapshot.nextProgress
    ? snapshot.nextProgress.formatted
    : `${snapshot.completedCount}/${snapshot.totalCount}`;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          paddingVertical: designSpacing.md,
          paddingHorizontal: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: designLayout.touchTargetMin,
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.md },
        iconTile: {
          width: ROW_ICON_TILE_SIZE,
          height: ROW_ICON_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        body: { flex: 1 },
        title: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        stage: { ...typeStyle('body', locale), color: semantic.textPrimary, fontWeight: '600' },
        barWrap: { marginTop: designSpacing.sm },
        meta: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        metaBelow: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
        emptyText: { ...typeStyle('support', locale), color: semantic.textSecondary },
      }),
    [semantic, locale]
  );

  if (snapshot.unavailable) {
    return (
      <View style={styles.card} testID="today-journey-row">
        <Text style={styles.emptyText}>Your Journey isn't available yet.</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your Journey. ${contextLine}: ${stageLine}. ${metaLine}`}
      accessibilityHint="Opens the full Journey in Grow"
      testID="today-journey-row"
    >
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <View style={styles.iconTile}>
          <Ionicons name="compass-outline" size={15} color={semantic.interactive} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{contextLine}</Text>
          <Text style={styles.stage} numberOfLines={stackMeta ? 3 : 1}>
            {stageLine}
          </Text>
          {stackMeta ? <Text style={styles.metaBelow}>{metaLine}</Text> : null}
        </View>
        {!stackMeta ? <Text style={styles.meta}>{metaLine}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} />
      </View>
      <View style={styles.barWrap} importantForAccessibility="no-hide-descendants">
        <ProgressBar progress={progress} color={semantic.interactive} height={4} />
      </View>
    </TouchableOpacity>
  );
}
