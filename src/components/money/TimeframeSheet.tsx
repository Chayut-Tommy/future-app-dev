import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import {
  LocalDate,
  daysInLocalMonth,
  endOfMonth,
  endOfNextMonth,
  localDateFromDate,
} from '../../lib/calculations/localCalendar';

/**
 * Pass C.1 — the Timeframe chooser.
 *
 * A Design 5.1 native sheet (KeyboardSheet host) that lets the customer pick
 * the ONE timeframe the single Money card is showing:
 *   • Until payday   → resets to the authoritative AUP view. Reports `null`;
 *     it NEVER triggers a Look Ahead / Pass B projection.
 *   • End of this month (or next month, on the last day) → a selected date.
 *   • Choose a date  → requests the native picker via `onChooseDate`.
 *
 * IMPORTANT (Pass C.1 correction): this sheet no longer OWNS the native date
 * picker. Two React Native modals cannot be presented at once on iOS — the
 * picker would silently never appear. Instead "Choose a date" asks the parent
 * to sequence the transition: dismiss THIS sheet first, then present the
 * picker only after the sheet's native dismissal has completed (`onDismissed`,
 * forwarded from the underlying Modal's own onDismiss).
 *
 * The sheet owns NO money maths and writes NOTHING. It only reports the chosen
 * target (`LocalDate`, or `null` for "until payday") or a request to open the
 * date picker.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtLocal(d: LocalDate): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function TimeframeSheet({
  visible,
  asOf,
  paydayDate,
  onSelect,
  onChooseDate,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  /** As-of date, injected (never `Date.now()`). */
  asOf: Date;
  /** The next payday, if known — labels the "Until payday" default row. */
  paydayDate: LocalDate | null;
  /** Report the chosen timeframe: a target `LocalDate`, or `null` to reset to
   * the authoritative Available-Until-Payday view. */
  onSelect: (target: LocalDate | null) => void;
  /** Request the native date picker. The parent dismisses this sheet first,
   * then presents the picker once dismissal completes — never both at once. */
  onChooseDate: () => void;
  onClose: () => void;
  /** Forwarded from the sheet Modal's native onDismiss (iOS): fires once the
   * sheet has fully left the screen, so the parent can present the picker. */
  onDismissed?: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const asOfLocal = useMemo(() => {
    try {
      return localDateFromDate(startOfDay(asOf));
    } catch {
      return null;
    }
  }, [asOf]);

  const isLastDayOfMonth = asOfLocal ? asOfLocal.day === daysInLocalMonth(asOfLocal.year, asOfLocal.month) : false;
  const monthEndTarget = asOfLocal ? (isLastDayOfMonth ? endOfNextMonth(asOfLocal) : endOfMonth(asOfLocal)) : null;
  const monthEndLabel = isLastDayOfMonth ? 'End of next month' : 'End of this month';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        subhead: { ...typography.body, fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        label: { ...typography.body, fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
        sub: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        quiet: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismissed}
      title="Timeframe"
      isDirty={false}
      focusTitleOnShow
      footer={<Button label="Cancel" variant="secondary" onPress={onClose} />}
    >
      <View testID="timeframe-choice">
        <Text style={styles.subhead}>Choose how far ahead this card looks.</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => onSelect(null)}
          accessibilityRole="button"
          accessibilityLabel={paydayDate ? `Until payday, ${fmtLocal(paydayDate)}` : 'Until payday'}
          testID="timeframe-until-payday"
        >
          <View>
            <Text style={styles.label}>Until payday</Text>
            {paydayDate ? <Text style={styles.sub}>{fmtLocal(paydayDate)}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} importantForAccessibility="no" />
        </TouchableOpacity>

        {monthEndTarget ? (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onSelect(monthEndTarget)}
            accessibilityRole="button"
            accessibilityLabel={`${monthEndLabel}, ${fmtLocal(monthEndTarget)}`}
            testID="timeframe-month-end"
          >
            <View>
              <Text style={styles.label}>{monthEndLabel}</Text>
              <Text style={styles.sub}>{fmtLocal(monthEndTarget)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} importantForAccessibility="no" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.row}
          onPress={onChooseDate}
          accessibilityRole="button"
          accessibilityLabel="Choose a date"
          testID="timeframe-choose-date"
        >
          <Text style={styles.label}>Choose a date</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} importantForAccessibility="no" />
        </TouchableOpacity>

        <Text style={styles.quiet}>Nothing will be saved.</Text>
      </View>
    </KeyboardSheet>
  );
}
