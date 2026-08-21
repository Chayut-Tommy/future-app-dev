import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import {
  MonthGridDay,
  addLocalMonths,
  buildMonthGrid,
  canStepMonth,
  formatMonthHeading,
  spokenGridDay,
  startOfLocalMonth,
} from '../../../lib/dateFieldPresentation';
import { designLayout, designRadius, designSpacing } from '../../../theme/semanticTokens';
import { typeStyle } from '../../../theme/textStyle';
import type { AppLocale } from '../../../theme/typography';
import i18n from '../../../i18n';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Wave 6 correction A — an arbitrary-date calendar, rendered INLINE inside
 * the picker that already owns the date field.
 *
 * It is deliberately not a second native Modal. The field's picker is
 * already an overlay presented inside a sheet, and MOTION_HARD_RULES rule 2
 * allows exactly one native Modal at a time; stacking a calendar Modal on
 * top would break that and reintroduce the gesture conflict DatePickerModal
 * exists to avoid. Rendering the grid in the same overlay keeps one surface,
 * one dismissal path and one committed value.
 *
 * All date arithmetic lives in dateFieldPresentation.ts and is built from
 * LOCAL year/month/day parts, so a chosen day never shifts across a UTC
 * boundary. This component only draws what that module decided.
 *
 * A day after `maximumDate` is rendered, disabled and announced as
 * unavailable — never hidden, and never silently coerced to another date.
 */
export function InlineCalendar({
  value,
  today,
  maximumDate,
  minimumDate = null,
  onSelect,
  testID,
}: {
  value: Date | null;
  today: Date;
  maximumDate: Date | null;
  /** Wave 6 — optional, defaults to null so every existing caller is
   * unaffected. Only the reminder Snooze step passes one. */
  minimumDate?: Date | null;
  onSelect: (next: Date) => void;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [monthAnchor, setMonthAnchor] = useState(() => startOfLocalMonth(value ?? today));

  const grid = useMemo(() => buildMonthGrid(monthAnchor, today, maximumDate, minimumDate), [monthAnchor, today, maximumDate, minimumDate]);
  const canBack = canStepMonth(monthAnchor, -1, maximumDate, minimumDate);
  const canForward = canStepMonth(monthAnchor, 1, maximumDate, minimumDate);

  const selectedMs = value
    ? new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: designSpacing.sm },
        heading: { ...typeStyle('titleCard', locale), color: semantic.textPrimary, flexShrink: 1 },
        step: {
          width: designLayout.touchTargetMin,
          height: designLayout.touchTargetMin,
          borderRadius: designRadius.control,
          alignItems: 'center',
          justifyContent: 'center',
        },
        weekRow: { flexDirection: 'row' },
        weekday: { ...typeStyle('meta', locale), color: semantic.textTertiary, flex: 1, textAlign: 'center' },
        grid: { flexDirection: 'row', flexWrap: 'wrap' },
        // Seven per row; a square-ish cell that always clears the 44pt
        // activation minimum in its own right.
        cell: { width: `${100 / 7}%`, height: designLayout.touchTargetMin, alignItems: 'center', justifyContent: 'center' },
        dayLabel: { ...typeStyle('support', locale), color: semantic.textPrimary },
        dayOutside: { color: semantic.textTertiary },
        dayDisabled: { color: semantic.textTertiary },
        dayToday: { fontWeight: '700' },
        selectedPill: {
          position: 'absolute',
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: semantic.interactive,
        },
        daySelected: { color: semantic.onInteractive, fontWeight: '700' },
        // Today gets a ring as well as bold weight, so "today" is never
        // communicated by weight alone.
        todayRing: {
          position: 'absolute',
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.interactive,
        },
      }),
    [semantic, locale]
  );

  function renderDay(day: MonthGridDay, index: number) {
    const ms = day.date.getTime();
    const selected = selectedMs !== null && ms === selectedMs;
    const disabled = day.disabled;
    return (
      <TouchableOpacity
        key={`${index}-${ms}`}
        style={styles.cell}
        disabled={disabled}
        onPress={() => onSelect(day.date)}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected }}
        accessibilityLabel={spokenGridDay(day)}
        testID={testID ? `${testID}-day-${day.date.getFullYear()}-${day.date.getMonth() + 1}-${day.dayOfMonth}` : undefined}
      >
        {selected ? <View style={styles.selectedPill} /> : day.isToday ? <View style={styles.todayRing} /> : null}
        <Text
          style={[
            styles.dayLabel,
            !day.inMonth && styles.dayOutside,
            disabled && styles.dayDisabled,
            day.isToday && styles.dayToday,
            selected && styles.daySelected,
          ]}
        >
          {day.dayOfMonth}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.step}
          disabled={!canBack}
          onPress={() => setMonthAnchor((m) => addLocalMonths(m, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canBack }}
          testID={testID ? `${testID}-prev-month` : undefined}
        >
          <Ionicons name="chevron-back" size={18} color={canBack ? semantic.interactive : semantic.textTertiary} />
        </TouchableOpacity>
        <Text style={styles.heading} accessibilityRole="header">
          {formatMonthHeading(monthAnchor)}
        </Text>
        <TouchableOpacity
          style={styles.step}
          disabled={!canForward}
          onPress={() => setMonthAnchor((m) => addLocalMonths(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canForward }}
          testID={testID ? `${testID}-next-month` : undefined}
        >
          <Ionicons name="chevron-forward" size={18} color={canForward ? semantic.interactive : semantic.textTertiary} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekRow} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>{grid.map(renderDay)}</View>
    </View>
  );
}
