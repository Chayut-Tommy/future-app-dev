/**
 * Nolie Design 5.1 Wave 4 closure — a REAL CALENDAR DATE, chosen on the one
 * focused picker surface.
 *
 * Previously this expanded a panel inline beneath its own row, which is the
 * behaviour the owner recorded going wrong on the bill form: with the row
 * low in a long form, the panel landed below the fold and had to be found by
 * scrolling. It now delegates presentation entirely to
 * `FocusedPickerTrigger` / `FocusedPickerHost`, so the picker covers the
 * sheet and is visible by construction from any trigger at any scroll
 * position — no measurement, no `scrollTo`, no coordinates.
 *
 * This file now owns only what a DATE means: the quick choices, the
 * calendar-day comparison and the wording. Keyboard sequencing, focus,
 * Done/Cancel and the surface itself are shared.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { AddIcon } from '../AddIcon';
import { iconSpec } from '../../../lib/addIcons';
import { FocusedPickerTrigger } from './FocusedPickerTrigger';
import { InlineCalendar } from './InlineCalendar';
import {
  CHOOSE_ANOTHER_DATE_KEY,
  CHOOSE_ANOTHER_DATE_LABEL,
  describeDate,
  quickDateChoices,
  upcomingDateChoices,
} from '../../../lib/dateFieldPresentation';

export function DateTriggerField({
  label,
  value,
  onChange,
  today,
  message,
  required = false,
  optional = false,
  direction = 'past',
  containerStyle,
  testID,
}: {
  label: string;
  /** The currently selected date, or null for an unset optional date. */
  value: Date | null;
  onChange: (next: Date) => void;
  /** Injected rather than read from the clock, so "Today"/"Yesterday" are
   * deterministic and the caller keeps ownership of what "now" means. */
  today: Date;
  message?: string | null;
  required?: boolean;
  optional?: boolean;
  /** `past` offers the recent-day shortcuts a transaction needs; `future`
   * offers a forward run of days for a next-due or repayment date, which
   * preserves the old picker's `minimumDate` rule by construction. */
  direction?: 'past' | 'future';
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const description = describeDate(value, today);
  const choices = useMemo(() => (direction === 'future' ? upcomingDateChoices(today) : quickDateChoices(today)), [today, direction]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.xs,
        },
        selected: { backgroundColor: colors.accentSoft },
        label: { ...typography.body, color: colors.textPrimary },
        labelSelected: { fontWeight: '600', color: colors.accentStrong },
        date: { ...typography.caption, color: colors.textSecondary },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <FocusedPickerTrigger<Date | null>
      label={label}
      primary={value === null && optional ? 'Not set' : description.primary}
      secondary={description.secondary}
      unset={value === null}
      value={value}
      onCommit={(next) => {
        if (next) onChange(next);
      }}
      message={message}
      required={required}
      containerStyle={containerStyle}
      testID={testID}
      renderPicker={(draft, setDraft) => (
        <DatePickerBody
          choices={choices}
          draft={draft}
          setDraft={setDraft}
          today={today}
          direction={direction}
          styles={styles}
          testID={testID}
        />
      )}
    />
  );
}

/**
 * Wave 6 correction A — the picker's body.
 *
 * Split out of the `renderPicker` closure so it can hold its own view
 * state: the shortcuts and the calendar are two views of ONE picker and one
 * committed value, not two pickers. Cancel/Done still belong entirely to
 * FocusedPickerTrigger, so a cancelled calendar selection restores the
 * previously committed date exactly as a cancelled shortcut always did.
 */
function DatePickerBody({
  choices,
  draft,
  setDraft,
  today,
  direction,
  styles,
  testID,
}: {
  choices: { key: string; label: string; date: Date }[];
  draft: Date | null;
  setDraft: (next: Date) => void;
  today: Date;
  direction: 'past' | 'future';
  styles: { [key: string]: any };
  testID?: string;
}) {
  const [showCalendar, setShowCalendar] = useState(false);

  // A recorded transaction cannot be dated in the future, so a past-facing
  // field caps at today. A future-facing field (a bill's next due date) has
  // no upper bound and keeps its existing forward run of days.
  const maximumDate = direction === 'past' ? today : null;

  if (showCalendar) {
    return (
      <InlineCalendar
        value={draft}
        today={today}
        maximumDate={maximumDate}
        onSelect={setDraft}
        testID={testID ? `${testID}-calendar` : undefined}
      />
    );
  }

  return (
        <View>
          {choices.map((c) => {
            const selected = !!draft && describeDate(c.date, today).secondary === describeDate(draft, today).secondary;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.row, selected && styles.selected]}
                onPress={() => setDraft(c.date)}
                activeOpacity={0.75}
                testID={testID ? `${testID}-choice-${c.key}` : undefined}
                accessibilityRole="radio"
                accessibilityLabel={`${c.label}, ${describeDate(c.date, today).secondary}`}
                accessibilityState={{ checked: selected, selected }}
              >
                <Text style={[styles.label, selected && styles.labelSelected]}>{c.label}</Text>
                <Text style={styles.date}>{describeDate(c.date, today).secondary}</Text>
                {selected ? <AddIcon icon={iconSpec('checkmark-circle')} emphasis="selected" /> : null}
              </TouchableOpacity>
            );
          })}
          {/* Wave 6 — the shortcuts cover the common cases in one tap; this
              opens a real calendar for anything else. Same field, same
              committed value, no second date system. */}
          {direction === 'past' ? (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setShowCalendar(true)}
              activeOpacity={0.75}
              testID={testID ? `${testID}-choice-${CHOOSE_ANOTHER_DATE_KEY}` : undefined}
              accessibilityRole="button"
              accessibilityLabel={CHOOSE_ANOTHER_DATE_LABEL}
              accessibilityHint="Opens a calendar to pick any past date"
            >
              <Text style={styles.label}>{CHOOSE_ANOTHER_DATE_LABEL}</Text>
              <AddIcon icon={iconSpec('calendar-outline')} />
            </TouchableOpacity>
          ) : null}
        </View>
  );
}
