import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Achievement } from '../../lib/calculations/achievements';
import { ProgressBar } from '../shared/ProgressBar';

const NODE_SIZE = 40;
const INITIAL_VISIBLE = 5;

/**
 * "Your Journey" — a vertical connected timeline, not a horizontal scroll
 * (PRD ask: easier to understand, feels like a life journey / game
 * progression). Shows a handful of milestones around the user's current
 * progress by default so Today doesn't get too long; "View full journey"
 * expands the rest. Deliberately no internal ScrollView here — nesting a
 * vertical ScrollView inside Today's page scroll breaks touch/gesture
 * priority on iOS once the list gets tall (PRD bug report: milestones past
 * ~7-8 became unreachable). Expanded content just flows into the page
 * scroll instead, like every other section on Today already does.
 */
export function JourneyTimeline({ achievements }: { achievements: Achievement[] }) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const nextIndex = achievements.findIndex((a) => !a.unlocked);

  const visibleCount = expanded ? achievements.length : Math.min(achievements.length, Math.max(INITIAL_VISIBLE, nextIndex + 1));
  const visible = achievements.slice(0, visibleCount);
  const hasMore = achievements.length > visibleCount || expanded;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row' },
        connectorCol: { alignItems: 'center', width: NODE_SIZE },
        connectorLine: { width: 2, flex: 1, minHeight: 8 },
        node: {
          width: NODE_SIZE,
          height: NODE_SIZE,
          borderRadius: NODE_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textCol: { flex: 1, paddingBottom: spacing.lg, paddingLeft: spacing.sm },
        title: { ...typography.body, fontSize: 14, fontWeight: '700' },
        subtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        nextBadge: {
          alignSelf: 'flex-start',
          backgroundColor: colors.goldSoft,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.pill,
          marginTop: 6,
        },
        nextBadgeText: { ...typography.micro, fontSize: 10, color: colors.gold, fontWeight: '700' },
        progressWrap: { marginTop: spacing.sm, width: '80%' },
        expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: spacing.xs },
        expandText: { ...typography.caption, fontSize: 13, color: colors.accent, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography, expanded]
  );

  return (
    <View>
      <View>
        {visible.map((a, i) => {
          const isNext = i === nextIndex;
          const isLast = i === visible.length - 1;
          const progress = isNext && typeof a.current === 'number' && typeof a.target === 'number' && a.target > 0 ? a.current / a.target : 0;

          return (
            <View key={a.id} style={styles.row}>
              <View style={styles.connectorCol}>
                <View
                  style={[
                    styles.node,
                    a.unlocked
                      ? { backgroundColor: colors.gold, ...glow(colors.gold) }
                      : isNext
                      ? { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.gold }
                      : { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <Ionicons
                    name={a.unlocked || isNext ? a.icon : 'lock-closed-outline'}
                    size={18}
                    color={a.unlocked ? colors.onGold : isNext ? colors.gold : colors.textMuted}
                  />
                </View>
                {!isLast ? (
                  <View style={[styles.connectorLine, { backgroundColor: a.unlocked ? colors.gold : colors.border }]} />
                ) : null}
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.title, { color: a.unlocked || isNext ? colors.textPrimary : colors.textMuted }]}>{a.title}</Text>
                <Text style={styles.subtitle}>{a.subtitle}</Text>
                {isNext ? (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>NEXT UP</Text>
                  </View>
                ) : null}
                {isNext && a.target ? (
                  <View style={styles.progressWrap}>
                    <ProgressBar progress={progress} color={colors.gold} height={4} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      {hasMore ? (
        <TouchableOpacity style={styles.expandButton} onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.expandText}>{expanded ? 'Show less' : 'View full journey'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
