import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { TimelineEvent, TimelineEventKind } from '../../lib/calculations/moneyTimeline';

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
export function MoneyTimelineCard({ events, onEventPress }: { events: TimelineEvent[]; onEventPress?: (event: TimelineEvent) => void }) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row' },
        rail: { width: 40, alignItems: 'center' },
        dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
        connector: { width: 2, flex: 1, minHeight: spacing.md, backgroundColor: colors.border, marginTop: 2 },
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
        dayLabel: { ...typography.micro, fontSize: 11, marginTop: 2 },
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

  return (
    <View>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const colorKey = KIND_COLOR_KEY[event.kind];
        const dotColor = colors[colorKey];
        const dotBg = colors[`${colorKey}Soft` as keyof typeof colors] as string;
        const isUrgent = event.daysUntil <= 3 && event.amount < 0;
        return (
          <View key={event.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotBg }]}>
                <Ionicons name={event.icon} size={16} color={dotColor} />
              </View>
              {!isLast ? <View style={styles.connector} /> : null}
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
                <Text style={[styles.dayLabel, { color: isUrgent ? colors.warning : colors.textMuted }]}>{relativeDay(event.daysUntil)}</Text>
              </View>
              <Text style={[styles.amount, { color: event.amount >= 0 ? colors.accent : colors.textPrimary }]}>{formatMoney(event.amount)}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
