import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { SafeToSpendPresentation } from '../../lib/calculations/safeToSpendPresentation';
import { TodayBriefingEventRow, formatBriefingDateContext } from '../../lib/calculations/todayBriefing';
import { SmartReminder } from '../../lib/calculations/reminders';
import { SmartReminderCard } from './SmartReminderCard';

/**
 * "Your Today Briefing" (Pass 2A, corrected) — a date/context header,
 * followed by rows in the canonical order:
 *   1. the primary AUP/Available Money row (always present)
 *   2. the eligible Smart Reminder row, if any (0 or 1)
 *   3. independent upcoming-event rows (0-2, or 0-1 when a reminder is
 *      present — see eventRows' own upstream sizing)
 * A reminder, when eligible, is always the first contextual row
 * immediately after the AUP row — it must never render below a
 * lower-priority event row. The Smart Reminder renders as one more row
 * INSIDE this same card (correction pass §7: it must visually behave as
 * one Briefing contextual row, not an awkward duplicate standalone card
 * nested inside another), via SmartReminderCard's own `embedded` mode —
 * its confirm/dismiss/error/persistence behaviour and every one of its
 * actions stay entirely unmodified, only the outer wrapper differs.
 *
 * No more than three actionable rows overall: the AUP row (always 1) + the
 * reminder (0 or 1) + eventRows, whose own upstream
 * selectTodayBriefingEventRows call already sized itself down to 1 (not 2)
 * whenever a reminder is present — never enforced here by truncating
 * eventRows, since eventRows is already the correctly-sized array by the
 * time it reaches this component.
 */
export function TodayBriefingCard({
  today,
  presentation,
  eventRows,
  topReminder,
  onPressAup,
  onPressEventRow,
}: {
  /** The same local-calendar Date every other Briefing calculation already
   * derives from (TodayScreen's useCurrentLocalDate-sourced `currentDate`)
   * — never a separately-captured `new Date()`, so the header always agrees
   * with what the rest of the Briefing is actually showing. */
  today: Date;
  presentation: SafeToSpendPresentation;
  eventRows: TodayBriefingEventRow[];
  topReminder: SmartReminder | null;
  onPressAup: () => void;
  onPressEventRow: (row: TodayBriefingEventRow) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: { marginBottom: spacing.sm, marginTop: spacing.sm },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        sectionDateContext: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
        aupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
        aupIconBadge: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: presentation.tone === 'warning' ? colors.warningSoft : colors.accentSoft,
        },
        aupTextBlock: { flex: 1 },
        aupHeading: { ...typography.caption, fontSize: 11, color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.3 },
        aupAmount: { ...typography.title, fontSize: 22, color: colors.textPrimary, fontWeight: '800', marginTop: 2 },
        aupStatusText: { ...typography.caption, fontSize: 13, color: presentation.tone === 'warning' ? colors.warning : colors.textSecondary, marginTop: 2, lineHeight: 18 },
        eventRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        eventIconBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
        eventIconBadgeWarning: { backgroundColor: colors.warningSoft },
        eventIconBadgeNeutral: { backgroundColor: colors.surfaceMuted },
        eventTitle: { ...typography.body, fontSize: 13, color: colors.textPrimary, flex: 1 },
      }),
    [colors, radius, spacing, typography, presentation.tone]
  );

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Today Briefing</Text>
        <Text style={styles.sectionDateContext}>{formatBriefingDateContext(today)}</Text>
      </View>
      <SectionCard>
        <TouchableOpacity
          style={styles.aupRow}
          onPress={onPressAup}
          accessibilityRole="button"
          accessibilityLabel={`${presentation.heading}${presentation.amountVisible ? `, ${presentation.displayAmount}` : ''}`}
          accessibilityHint="Opens Money"
        >
          <View style={styles.aupIconBadge}>
            <Ionicons name="wallet-outline" size={18} color={presentation.tone === 'warning' ? colors.warning : colors.accentStrong} />
          </View>
          <View style={styles.aupTextBlock}>
            <Text style={styles.aupHeading}>{presentation.heading}</Text>
            {presentation.amountVisible ? <Text style={styles.aupAmount}>{presentation.displayAmount}</Text> : null}
            <Text style={styles.aupStatusText} numberOfLines={2}>
              {[presentation.primaryCopy, presentation.supportingCopy].filter(Boolean).join(' ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {topReminder ? <SmartReminderCard topReminder={topReminder} embedded /> : null}

        {eventRows.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={styles.eventRow}
            onPress={() => onPressEventRow(row)}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            accessibilityHint="Opens Money"
          >
            <View style={[styles.eventIconBadge, row.tone === 'warning' ? styles.eventIconBadgeWarning : styles.eventIconBadgeNeutral]}>
              <Ionicons name={row.icon} size={14} color={row.tone === 'warning' ? colors.warning : colors.textSecondary} />
            </View>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {row.title}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </SectionCard>
    </>
  );
}
