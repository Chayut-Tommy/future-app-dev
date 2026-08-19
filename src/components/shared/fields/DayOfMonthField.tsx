/**
 * Nolie Design 5.1 Wave 4 closure — a RECURRING DAY, chosen on the one
 * focused picker surface.
 *
 * "The 25th of each month" is an anchor, not a date, so a month calendar is
 * the wrong control: it asks a customer to pick a specific day in a specific
 * month when what is being chosen is a repeating number. The CONTENT is
 * therefore an ordinal 1-31 list — but the SHELL, the keyboard sequencing,
 * the focus handling and the Done/Cancel contract are identical to every
 * other date choice in the Add journey.
 *
 * It changes no schedule: the caller keeps its own state and its own
 * `anchoredMonthlyDate`/`nextOccurrence` behaviour, including the existing
 * short-month clamp. This only chooses the number.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { AddIcon } from '../AddIcon';
import { iconSpec } from '../../../lib/addIcons';
import { FocusedPickerTrigger } from './FocusedPickerTrigger';
import { DAY_OF_MONTH_VALUES, describeDayOfMonth, ordinalDay } from '../../../lib/dateFieldPresentation';

export function DayOfMonthField({
  label = 'Day of month',
  value,
  onChange,
  message,
  required = false,
  containerStyle,
  testID,
}: {
  label?: string;
  /** The chosen anchor day, or null when nothing is set yet. */
  value: number | null;
  onChange: (day: number) => void;
  message?: string | null;
  required?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
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

  return (
    <FocusedPickerTrigger<number | null>
      label={label}
      primary={describeDayOfMonth(value)}
      unset={value === null}
      value={value}
      onCommit={(next) => {
        if (next !== null) onChange(next);
      }}
      isDoneDisabled={(draft) => draft === null}
      message={message}
      required={required}
      containerStyle={containerStyle}
      testID={testID}
      renderPicker={(draft, setDraft) => (
        <View accessibilityRole="radiogroup" accessibilityLabel={label}>
          {DAY_OF_MONTH_VALUES.map((day) => {
            const selected = day === draft;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.option, selected && styles.selected]}
                onPress={() => setDraft(day)}
                activeOpacity={0.75}
                testID={testID ? `${testID}-option-${day}` : undefined}
                accessibilityRole="radio"
                accessibilityLabel={ordinalDay(day)}
                accessibilityState={{ checked: selected, selected }}
              >
                <Text style={[styles.label, selected && styles.labelSelected]}>{ordinalDay(day)}</Text>
                {selected ? <AddIcon icon={iconSpec('checkmark-circle')} emphasis="selected" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    />
  );
}
