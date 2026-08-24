import React, { useMemo, useRef, useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { TimelineEvent, TimelineEventKind } from '../../lib/calculations/moneyTimeline';
import { reconcileDisplayedAmounts } from '../../lib/calculations/displayReconciliation';
import { occurrenceDateKey, eventOccurrenceIdentity, occurrenceIdentityKey } from '../../lib/calculations/todayBriefing';
import { TimelineFocusTarget, TimelineGroupInfo, computeTimelineFocusFulfillment } from '../../lib/calculations/timelineFocus';

// Roughly 5-6 rows tall — enough to see what's immediately coming up
// without the timeline pushing the rest of the Money page far down the
// screen (PRD bug report: with several recurring items active, the list
// stretched a large portion of the page before Money Flow was reachable).
// Only switched to a fixed, independently-scrollable box once there are
// enough events to actually need it, so short lists still render exactly
// as before.
const VISIBLE_ROW_ESTIMATE = 6;
/** Design 5.1 Wave 6 final pass — the preview is now THREE ordered events.
 * Five still pushed Typical money flow and Money plan below the fold on a
 * 390pt device, which is the page-length complaint this pass exists to
 * fix. Everything else is one inline tap away, and the collapse control is
 * reachable from the header while expanded rather than only from the
 * bottom of a long list. */
const COLLAPSED_EVENT_LIMIT = 3;
// How close to the bottom (px) before asking the parent for more events —
// the parent responds by widening the planning horizon and passing back a
// longer `events` array (PRD ask, §2: "as the user scrolls, continue
// loading future recurring events").
const NEAR_END_THRESHOLD = 120;
// Correction round — a small breathing-room offset so a scrolled-to target
// group doesn't land flush against the very top edge of the scroll box.
const GROUP_TOP_OFFSET = 8;

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

interface EventGroup {
  key: string;
  daysUntil: number;
  date: Date;
  events: TimelineEvent[];
}

/** Consecutive events sharing a calendar day become one group — events
 * already arrive sorted by daysUntil, so groups fall out naturally without
 * a second sort (PRD ask, §5: "group events by day... much easier to scan,
 * especially when several events occur on the same day"). Correction round
 * — keyed by the canonical local-calendar day key (todayBriefing.ts's
 * occurrenceDateKey), the same format Worth Knowing's own WK-01/WK-02
 * targetDateKey is built from, rather than a second, differently-formatted
 * local key — so a destination target can be matched by simple string
 * equality against a group's own key. */
function groupByDay(events: TimelineEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const key = occurrenceDateKey(event.date);
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
  bnpl: 'warning',
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
  focusTarget = null,
  onFocusHandled,
  reduceMotion = true,
}: {
  events: TimelineEvent[];
  onEventPress?: (event: TimelineEvent) => void;
  /** Called (repeatedly, while near the bottom) so the parent can extend
   * the planning horizon and grow `events` — omit to just show a static,
   * non-extending list. */
  onNearEnd?: () => void;
  /** Correction round — Worth Knowing's own WK-01/WK-02 destination (see
   * timelineFocus.ts). When present, this card scrolls its own inner
   * timeline open to the matching, occurrence-validated date group. Wave 6
   * removed the inner ScrollView; the request now expands the timeline so
   * the target group is mounted, and the page's own scrolling brings it
   * into view. Omit for every other caller
   * (Briefing's AUP/event-row destinations, or a plain in-tab visit) —
   * behaviour is then identical to before this round. Correction round §1 —
   * this is a one-time destination, not a persistent visual state: once
   * resolved (scrolled, or safely given up on), no lasting style is applied
   * — the timeline renders with its normal styling either way. */
  focusTarget?: TimelineFocusTarget | null;
  /** Correction round §3 — called exactly once, the moment `focusTarget`'s
   * own request is resolved (scrolled or safely given up on), so the
   * caller can clear its one-time target state. Never called again for the
   * same request — an edit sheet opening/closing or ordinary scrolling
   * afterwards re-renders this component with the SAME already-resolved
   * focusTarget, which is a no-op (see lastHandledRequestIdRef below), so
   * this is never re-invoked until a genuinely fresh Worth Knowing tap
   * supplies a new requestId. */
  onFocusHandled?: () => void;
  /** Defaults to true (no animation) — the same conservative default
   * useReduceMotion.ts itself uses, so a caller that forgets to pass the
   * real value never risks one unwanted animated frame. */
  reduceMotion?: boolean;
}) {
  const { colors, radius, spacing, typography, cardShadow, semantic } = useTheme();
  // Wave 9b closure — tokens.typography carries no fontFamily, so these
  // rows rendered in the platform font. Resolve the shipped role instead.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  // Wave 6 correction D — inline expansion state. Collapsed by default so
  // the sections beneath the timeline stay reachable.
  const [expanded, setExpanded] = useState(false);

  // Correction round — the inner-timeline destination-focus mechanism.
  const groupInfoRef = useRef<Map<string, TimelineGroupInfo>>(new Map());
  const lastHandledRequestIdRef = useRef<number | null>(null);

  // A destination that targets a specific date group must be able to reach
  // it, so an incoming focus request expands the timeline first. Without
  // this, a target beyond the fifth event would simply not be mounted.
  useEffect(() => {
    if (focusTarget) setExpanded(true);
  }, [focusTarget]);

  // Computed unconditionally, ahead of every hook below that reads it
  // (attemptTimelineFocus/useEffect) and ahead of the empty-state early
  // return — groupByDay([]) is simply [], so this is safe to compute even
  // when there is nothing to show.
  // Wave 6 correction D — the card previously became its own fixed-height
  // ScrollView once there were more than a screenful of events, so a
  // customer scrolled a nested region for a long time before reaching
  // Spending Tracker, Money Flow and Money Plan below it. That inner scroll
  // is gone: the page owns all scrolling, and the timeline shows the next
  // five events by default with one inline expand.
  //
  // The SLICE is on the already-ordered engine array and nothing else — no
  // event is filtered, regrouped, recalculated or dropped, and grouping
  // still runs on whatever slice is displayed, so day headers stay correct
  // in both states.
  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_EVENT_LIMIT);
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);
  const groups = groupByDay(visibleEvents);

  function attemptTimelineFocus(totalGroups: number) {
    const result = computeTimelineFocusFulfillment(focusTarget, lastHandledRequestIdRef.current, {
      groups: groupInfoRef.current,
      totalGroups,
    });
    if (!result.handled) return; // still pending — retried by the next group's own onLayout, or gives up once every group has reported
    lastHandledRequestIdRef.current = focusTarget!.requestId;
    // Wave 6 correction D — the inner ScrollView this used to drive is
    // gone; the page owns all scrolling now, and Screen's own section-focus
    // mechanism brings the timeline into view. The fulfillment lifecycle
    // (requestId de-duplication, onFocusHandled) is unchanged.
    onFocusHandled?.();
  }

  useEffect(() => {
    attemptTimelineFocus(groups.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.requestId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        expandRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: 44,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.border,
          marginTop: spacing.sm,
        },
        expandText: { ...typeStyle('body', locale), fontSize: 14, fontWeight: '600', color: semantic.interactive },
        group: { marginBottom: spacing.md },
        groupHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: spacing.sm },
        groupRelative: { ...typeStyle('titleCard', locale), fontSize: 13, color: colors.textPrimary },
        groupDate: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textMuted },
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
        label: { ...typeStyle('body', locale), fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        sublabel: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textMuted, marginTop: 1 },
        amount: { ...typeStyle('titleCard', locale), fontSize: 14, marginRight: 4, fontVariant: ['tabular-nums'] },
        empty: { ...typeStyle('meta', locale), fontSize: 13, color: colors.textSecondary, lineHeight: 18, paddingVertical: spacing.md },
      }),
    [colors, radius, spacing, typography, locale, cardShadow, semantic]
  );

  if (groups.length === 0) {
    return (
      <Text style={styles.empty}>
        Nothing scheduled in the next 30 days yet — add your income and bills and Nolie will map out what happens next.
      </Text>
    );
  }

  const groupViews = groups.map((group, groupIndex) => {
    const isLastGroup = groupIndex === groups.length - 1;
    const isUrgentGroup = group.daysUntil <= 3;
    // Reconciles only this group's goal-contribution rows so their displayed
    // amounts sum exactly to their own displayed combined total (Stream A
    // final correction pass §2) — salary, bills, credit-card and savings
    // events in the same day-group are untouched, and goal events from a
    // different occurrence never participate (each group is exactly one
    // occurrence, since moneyTimeline.ts pushes every goal event for a given
    // cycle date with the identical Date value). Raw `event.amount` is only
    // read here, never mutated.
    const goalEventsInGroup = group.events.filter((e) => e.kind === 'goal');
    const reconciledGoalAmounts =
      goalEventsInGroup.length > 0
        ? new Map(reconcileDisplayedAmounts(goalEventsInGroup.map((e) => ({ id: e.id, amount: e.amount }))).map((r) => [r.id, r.displayAmount]))
        : null;
    return (
      <View
        key={group.key}
        style={styles.group}
        onLayout={(e) => {
          // Correction round — the occurrence identities of every event
          // actually rendered in THIS group, computed fresh at layout time
          // from the same production identity primitives worthKnowing.ts's
          // own targetOccurrenceKeys were built from — never a separate,
          // potentially-diverging derivation.
          const occurrenceKeys = group.events
            .map((ev) => occurrenceIdentityKey(eventOccurrenceIdentity(ev)))
            .filter((k): k is string => k !== null);
          groupInfoRef.current.set(group.key, { y: e.nativeEvent.layout.y, occurrenceKeys });
          attemptTimelineFocus(groups.length);
        }}
      >
        <View style={styles.groupHeader}>
          <Text style={[styles.groupRelative, isUrgentGroup ? { color: colors.warning } : null]}>{relativeDay(group.daysUntil)}</Text>
          <Text style={styles.groupDate}>{actualDate(group.date)}</Text>
        </View>
        {group.events.map((event) => {
          const colorKey = KIND_COLOR_KEY[event.kind];
          const dotColor = colors[colorKey];
          const dotBg = colors[`${colorKey}Soft` as keyof typeof colors] as string;
          const displayAmount = event.kind === 'goal' ? reconciledGoalAmounts?.get(event.id) ?? event.amount : event.amount;
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
                <Text style={[styles.amount, { color: displayAmount >= 0 ? colors.accent : colors.textPrimary }]}>
                  {formatMoney(displayAmount)}
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

  return (
    <View>
      {groupViews}
      {/* One full-width secondary action, expanding INLINE in the parent
          screen — no second modal, no navigation route, no inner scroll. */}
      {hiddenCount > 0 || expanded ? (
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => {
            const next = !expanded;
            setExpanded(next);
            // Expanding is also the moment to ask the parent for a wider
            // planning horizon — the same request the retired inner scroll
            // used to make when it neared its end.
            if (next) onNearEnd?.();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Show less' : `View all upcoming, ${hiddenCount} more ${hiddenCount === 1 ? 'event' : 'events'}`}
          testID="money-timeline-expand"
        >
          <Text style={styles.expandText}>{expanded ? 'Show less' : 'View all upcoming'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={semantic.interactive} importantForAccessibility="no" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
