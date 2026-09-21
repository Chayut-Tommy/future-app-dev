import React, { useMemo } from 'react';
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
import { TimeframeSelection, resolveTimeframeSelection } from '../../lib/calculations/timeframeFlow';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

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
 * Pass C.2 correction — the ACTIVE choice is immediately apparent when the
 * sheet reopens: the current row carries a selected treatment (Ocean Blue
 * border + check glyph), `accessibilityState.selected`, and — for a custom
 * date — that date beneath "Choose a date". Purely derived from the
 * `currentTarget` the parent already owns; Cancel changes nothing.
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
  currentTarget = null,
  currentMode = null,
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
  /** The timeframe the card is CURRENTLY showing (`null` = until payday), so
   * the matching row reads as selected. Display only. */
  currentTarget?: LocalDate | null;
  /** Pass C.2 closure — HOW the current target was chosen, so a custom date
   * that equals month end (or payday) still highlights the row actually used. */
  currentMode?: TimeframeSelection | null;
  /** Report the chosen timeframe: a target `LocalDate`, or `null` to reset to
   * the authoritative Available-Until-Payday view, plus WHICH row chose it. */
  onSelect: (target: LocalDate | null, mode: TimeframeSelection) => void;
  /** Request the native date picker. The parent dismisses this sheet first,
   * then presents the picker once dismissal completes — never both at once. */
  onChooseDate: () => void;
  onClose: () => void;
  /** Forwarded from the sheet Modal's native onDismiss (iOS): fires once the
   * sheet has fully left the screen, so the parent can present the picker. */
  onDismissed?: () => void;
}) {
  const { colors, spacing, radius, semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
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
  const selection = resolveTimeframeSelection(currentTarget, monthEndTarget, currentMode);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Pass C.2 closure — Design 5.1 roles + semantic ink (support / titleCard / meta).
        subhead: { ...typeStyle('support', locale), color: semantic.textSecondary, marginBottom: spacing.md },
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
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'transparent',
        },
        // Selected treatment: Ocean Blue border + tint, paired with a check
        // glyph and the selected accessibility state — never colour alone.
        rowSelected: { borderWidth: 1.5, borderColor: semantic.interactive, backgroundColor: semantic.interactiveTint },
        label: { ...typeStyle('titleCard', locale), color: semantic.textPrimary },
        sub: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
        quiet: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: spacing.sm, textAlign: 'center' },
      }),
    [colors, radius, spacing, semantic, locale]
  );

  const trailing = (selected: boolean, testID: string) =>
    selected ? (
      <Ionicons name="checkmark-circle" size={20} color={semantic.interactive} importantForAccessibility="no" testID={testID} />
    ) : (
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} importantForAccessibility="no" />
    );

  const paydaySelected = selection === 'payday';
  const monthEndSelected = selection === 'month_end';
  const customSelected = selection === 'custom';

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
          style={[styles.row, paydaySelected ? styles.rowSelected : null]}
          onPress={() => onSelect(null, 'payday')}
          accessibilityRole="button"
          accessibilityState={{ selected: paydaySelected }}
          accessibilityLabel={`${paydayDate ? `Until payday, ${fmtLocal(paydayDate)}` : 'Until payday'}${paydaySelected ? ', currently selected' : ''}`}
          testID="timeframe-until-payday"
        >
          <View>
            <Text style={styles.label}>Until payday</Text>
            {paydayDate ? <Text style={styles.sub}>{fmtLocal(paydayDate)}</Text> : null}
          </View>
          {trailing(paydaySelected, 'timeframe-selected-payday')}
        </TouchableOpacity>

        {monthEndTarget ? (
          <TouchableOpacity
            style={[styles.row, monthEndSelected ? styles.rowSelected : null]}
            onPress={() => onSelect(monthEndTarget, 'month_end')}
            accessibilityRole="button"
            accessibilityState={{ selected: monthEndSelected }}
            accessibilityLabel={`${monthEndLabel}, ${fmtLocal(monthEndTarget)}${monthEndSelected ? ', currently selected' : ''}`}
            testID="timeframe-month-end"
          >
            <View>
              <Text style={styles.label}>{monthEndLabel}</Text>
              <Text style={styles.sub}>{fmtLocal(monthEndTarget)}</Text>
            </View>
            {trailing(monthEndSelected, 'timeframe-selected-month-end')}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.row, customSelected ? styles.rowSelected : null]}
          onPress={onChooseDate}
          accessibilityRole="button"
          accessibilityState={{ selected: customSelected }}
          accessibilityLabel={customSelected && currentTarget ? `Choose a date, currently ${fmtLocal(currentTarget)}, currently selected` : 'Choose a date'}
          testID="timeframe-choose-date"
        >
          <View>
            <Text style={styles.label}>Choose a date</Text>
            {customSelected && currentTarget ? (
              <Text style={styles.sub} testID="timeframe-custom-date">
                {fmtLocal(currentTarget)}
              </Text>
            ) : null}
          </View>
          {trailing(customSelected, 'timeframe-selected-custom')}
        </TouchableOpacity>

        <Text style={styles.quiet} maxFontSizeMultiplier={2}>
          Nothing will be saved.
        </Text>
      </View>
    </KeyboardSheet>
  );
}
