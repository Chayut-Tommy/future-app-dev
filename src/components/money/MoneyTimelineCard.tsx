import React, { useMemo } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { TimelineEvent, TimelineEventKind } from '../../lib/calculations/moneyTimeline';

// Roughly 5-6 rows tall — enough to see what's immediately coming up
// without the timeline pushing the rest of the Money page far down the
// screen (PRD bug report: with several recurring items active, the list
// stretched a large portion of the page before Money Flow was reachable).
// Only switched to a fixed, independently-scrollable box once there are
// enough events to actually need it, so short lists still render exactly
// as before.
const VISIBLE_ROW_ESTIMATE = 6;
const SCROLL_BOX_HEIGHT = 440;
// How close to the bottom (px) before asking the parent for more events —
// the parent responds by widening the planning horizon and passing back a
// longer `events` array (PRD ask, §2: "as the user scrolls, continue
// loading future recurring events").
const NEAR_END_THRESHOLD = 120;

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '+';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function relativeDay(daysUntil: number): string {
  if (daysUntil < 0) return 'Overdue';
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${daysUntil} days`;
}

function actualDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

interface EventGroup {
  key: string;
  daysUntil: number;
  date: Date;
  events: TimelineEvent[];
}

/** Consecutive events sharing a calendar day become one group — events
 * already arrive sorted by daysUntil, so groups fall out naturally without
 * a second sort (PRD ask, §5: "group events by day... much easier to scan,
 * especially when several events occur on the same day"). */
function groupByDay(events: TimelineEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const key = dayKey(event.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, daysUntil: event.daysUntil, date: event.date, events: [event] });
    }
  }
  return groups;
}

const KIND_COLOR_KEY: Record<TimelineEventKind, 'accent' | 'navy' | 'warning' | 'aiBlue' | 'purple'> = {
  income: 'accent',
  bill: 'navy',
  mortgage: 'navy',
  credit_card: 'warning',
  savings: 'aiBlue',
  goal: 'purple',
};

/**
 * "What happens next" — the Money tab's centrepiece: one chronological view
 * of salary, bills, mortgage, credit cards, and planned savings/goal
 * allocations, replacing separate Money Flow/Bills/Spending cards (PRD ask,
 * §5). A vertical, natural-scroll timeline nested in the page rather than
 * its own scroll container — the cleanest mobile pattern for a list this
 * length, and consistent with the connected-dot rail already used for Your
 * Wealth Journey and Bills Calendar elsewhere in the app. Every date/amount
 * here comes straight from computeMoneyTimeline, which only aggregates and
 * sorts what the shared engines already compute — no new financial maths.
 */
export function MoneyTimelineCard({
  events,
  onEventPress,
  onNearEnd,
}: {
  events: TimelineEvent[];
  onEventPress?: (event: TimelineEvent) => void;
  /** Called (repeatedly, while near the bottom) so the parent can extend
   * the planning horizon and grow `events` — omit to just show a static,
   * non-extending list. */
  onNearEnd?: () => void;
}) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!onNearEnd) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) <= NEAR_END_THRESHOLD) {
      onNearEnd();
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollBox: { maxHeight: SCROLL_BOX_HEIGHT },
        group: { marginBottom: spacing.md },
        groupHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: spacing.sm },
        groupRelative: { ...typography.heading, fontSize: 13, color: colors.textPrimary },
        groupDate: { ...typography.micro, fontSize: 11, color: colors.textMuted },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: spacing.md },
        row: { flexDirection: 'row', alignItems: 'center' },
        dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        card: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginLeft: spacing.sm,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        textBlock: { flex: 1 },
        label: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        sublabel: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: 1 },
        amount: { ...typography.heading, fontSize: 14, marginRight: 4 },
        empty: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, paddingVertical: spacing.md },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  if (events.length === 0) {
    return (
      <Text style={styles.empty}>
        Nothing scheduled in the next 30 days yet — add your income and bills and Navilo will map out what happens next.
      </Text>
    );
  }

  const groups = groupByDay(events);

  const groupViews = groups.map((group, groupIndex) => {
    const isLastGroup = groupIndex === groups.length - 1;
    const isUrgentGroup = group.daysUntil <= 3;
    return (
      <View key={group.key} style={styles.group}>
        <View style={styles.groupHeader}>
          <Text style={[styles.groupRelative, isUrgentGroup ? { color: colors.warning } : null]}>{relativeDay(group.daysUntil)}</Text>
          <Text style={styles.groupDate}>{actualDate(group.date)}</Text>
        </View>
        {group.events.map((event) => {
          const colorKey = KIND_COLOR_KEY[event.kind];
          const dotColor = colors[colorKey];
          const dotBg = colors[`${colorKey}Soft` as keyof typeof colors] as string;
          return (
            <View key={event.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: dotBg }]}>
                <Ionicons name={event.icon} size={14} color={dotColor} />
              </View>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={onEventPress ? 0.7 : 1}
                disabled={!onEventPress}
                onPress={() => onEventPress?.(event)}
              >
                <View style={styles.textBlock}>
                  <Text style={styles.label}>{event.label}</Text>
                  {event.sublabel ? <Text style={styles.sublabel}>{event.sublabel}</Text> : null}
                </View>
                <Text style={[styles.amount, { color: event.amount >= 0 ? colors.accent : colors.textPrimary }]}>
                  {formatMoney(event.amount)}
                </Text>
                {event.kind === 'savings' ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null}
              </TouchableOpacity>
            </View>
          );
        })}
        {!isLastGroup ? <View style={styles.divider} /> : null}
      </View>
    );
  });

  // Short lists render exactly as before (plain, page-scrolled); only once
  // there are enough events to actually crowd the page does the timeline
  // become its own fixed-height, independently-scrollable box.
  if (events.length <= VISIBLE_ROW_ESTIMATE) {
    return <View>{groupViews}</View>;
  }

  return (
    <ScrollView
      style={styles.scrollBox}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      onScroll={handleScroll}
      scrollEventThrottle={100}
    >
      {groupViews}
    </ScrollView>
  );
}
