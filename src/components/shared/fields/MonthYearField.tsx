/**
 * Nolie Design 5.1 Wave 4 closure — a MONTH AND YEAR, chosen on the one
 * focused picker surface.
 *
 * The goal target date is neither a calendar day nor a repeating anchor: a
 * goal lands in a month, not on the 14th. It was two raw numeric boxes
 * (`MM` / `YYYY`) that raised the number pad — the same class of problem as
 * the bill calendar. The CONTENT here is two short lists; the shell,
 * keyboard sequencing, focus and Done/Cancel are shared with every other
 * date choice.
 *
 * The caller keeps its own month/year strings and its own
 * `classifyGoalDateFields` validation, so goal date storage and validity are
 * unchanged.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { AddIcon } from '../AddIcon';
import { iconSpec } from '../../../lib/addIcons';
import { FocusedPickerTrigger } from './FocusedPickerTrigger';
import { MONTH_VALUES, describeMonthYear, monthName, targetYearValues } from '../../../lib/dateFieldPresentation';

export interface MonthYearValue {
  month: number | null;
  year: number | null;
}

export function MonthYearField({
  label,
  value,
  onChange,
  today,
  message,
  required = false,
  containerStyle,
  testID,
}: {
  label: string;
  value: MonthYearValue;
  onChange: (next: MonthYearValue) => void;
  today: Date;
  message?: string | null;
  required?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const years = useMemo(() => targetYearValues(today), [today]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        groupLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
        option: {
          minHeight: minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        selected: { backgroundColor: colors.accentSoft },
        label: { ...typography.body, color: colors.textPrimary },
        labelSelected: { fontWeight: '600', color: colors.accentStrong },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  function renderOption(key: string, text: string, selected: boolean, onPress: () => void, id: string) {
    return (
      <TouchableOpacity
        key={key}
        style={[styles.option, selected && styles.selected]}
        onPress={onPress}
        activeOpacity={0.75}
        testID={testID ? `${testID}-${id}` : undefined}
        accessibilityRole="radio"
        accessibilityLabel={text}
        accessibilityState={{ checked: selected, selected }}
      >
        <Text style={[styles.label, selected && styles.labelSelected]}>{text}</Text>
        {selected ? <AddIcon icon={iconSpec('checkmark-circle')} emphasis="selected" /> : null}
      </TouchableOpacity>
    );
  }

  return (
    <FocusedPickerTrigger<MonthYearValue>
      label={label}
      primary={describeMonthYear(value.month, value.year)}
      unset={value.month === null || value.year === null}
      value={value}
      onCommit={onChange}
      message={message}
      required={required}
      containerStyle={containerStyle}
      testID={testID}
      renderPicker={(draft, setDraft) => (
        <View>
          <Text style={styles.groupLabel}>Month</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Month">
            {MONTH_VALUES.map((m) =>
              renderOption(`m-${m}`, monthName(m), m === draft.month, () => setDraft({ ...draft, month: m }), `month-${m}`)
            )}
          </View>
          <Text style={styles.groupLabel}>Year</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Year">
            {years.map((y) => renderOption(`y-${y}`, String(y), y === draft.year, () => setDraft({ ...draft, year: y }), `year-${y}`))}
          </View>
        </View>
      )}
    />
  );
}
