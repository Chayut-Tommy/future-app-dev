import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { MonthToDateActivity } from '../../lib/calculations/monthlySummary';
import {
  MonthMeasure,
  measureColumnWidth,
  resolveMonthMeasureFigureSize,
  resolveMonthMeasureLayout,
  selectMonthMeasures,
  todayScreenMargin,
} from '../../lib/calculations/todayComposition';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * The current-month card — Design 5.1 p.7's three labelled recorded
 * measures in one calm surface.
 *
 * Previously this was two shadowed mini-tiles side by side plus a third
 * boxed "net" strip beneath them: three nested cards inside a card, which
 * Design 5.1's density rules forbid outright. It is now one flat bordered
 * surface with three measures across it, dropping to two-plus-one and then
 * to a plain vertical list as width or text size demands — decided by
 * resolveMonthMeasureLayout, so the rule is testable at every width rather
 * than only at whichever one a rendered test happens to mount.
 *
 * The component performs NO arithmetic. computeMonthToDateActivity (the
 * canonical, unmodified selector) supplies income and spending, and
 * selectMonthMeasures turns those into labelled, formatted, toned view
 * models. The third measure's variance from Design 5.1's preferred "Moved
 * to savings" is documented in full on selectMonthMeasures itself — in
 * short, no canonical selector for it exists and inventing one would be an
 * engine change. The values displayed are unchanged from before this pass.
 *
 * The header's month label is rendered by TodayScreen as an external
 * section header from the customer's own live local date, exactly as
 * before; this component is the card content plus its trailing action.
 *
 * Wave 5 closure — this card no longer owns an EMPTY state. Today used to
 * render the heading and this card unconditionally, so an incomplete
 * customer saw the money-picture checklist and then a second setup prompt
 * here saying the same thing in different words. Eligibility now lives in
 * one place (isMonthSectionEligible) and gates the heading and the card
 * together, so when there is nothing recorded the section is simply not
 * there — no unlock copy, no empty card, no orphaned heading, no spacer.
 *
 * Consequently `activity` is supplied by the caller rather than computed
 * here: the screen must consult the same figures to decide whether to
 * render the section at all, and calling the canonical selector twice
 * would be two chances to disagree. The selector itself
 * (computeMonthToDateActivity) is unchanged and still the only source.
 *
 * Money's own This Month card is a different component (ThisMonthCard) and
 * is untouched — its empty state and its Add transaction action remain.
 */
export function MonthSnapshotCard({ activity }: { activity: MonthToDateActivity }) {
  const navigation = useNavigation<any>();
  const { semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const measures = useMemo(() => selectMonthMeasures(activity.income, activity.spend), [activity.income, activity.spend]);

  const margin = todayScreenMargin(width);
  // The layout decision is made from the ACTUAL formatted values, so three
  // columns are only chosen when every amount fits on one line. A currency
  // value is never split to resolve overflow — the layout gives up a
  // column instead.
  const values = useMemo(() => measures.map((m) => m.value), [measures]);
  const layout = resolveMonthMeasureLayout(width, fontScale, margin, values);
  // The figure's point size is a discrete, tested step chosen from the real
  // column width — the largest rung at which every value fits on one line.
  // Not automatic shrink-to-fit, and never below the figureRow floor.
  const columns = layout === 'threeColumn' ? 3 : layout === 'twoPlusOne' ? 2 : 1;
  const figureSize = resolveMonthMeasureFigureSize(measureColumnWidth(width, margin, columns) / fontScale, values);

  const toneInk = (tone: MonthMeasure['tone']) =>
    tone === 'positive' ? semantic.success : tone === 'caution' ? semantic.warning : semantic.textPrimary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        grid: {
          flexDirection: layout === 'stacked' ? 'column' : 'row',
          flexWrap: layout === 'twoPlusOne' ? 'wrap' : 'nowrap',
          gap: designSpacing.md,
        },
        measure: {
          flexGrow: 1,
          flexShrink: 1,
          // twoPlusOne: two per line, then the third fills its own line.
          flexBasis: layout === 'twoPlusOne' ? '45%' : layout === 'threeColumn' ? 0 : 'auto',
          minWidth: layout === 'stacked' ? undefined : 0,
        },
        stackedMeasure: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: designSpacing.md,
        },
        // Labels sit ABOVE their figures and may wrap; a currency value
        // never may — `numberOfLines={1}` below is the hard guarantee that
        // no amount can split at the sign, whatever the estimate said.
        label: { ...typeStyle('meta', locale), color: semantic.textSecondary, flexShrink: 1 },
        // figureLarge supplies the family, weight and tabular numerals; only
        // the point size steps down the ladder so three columns can hold
        // their values on one line at phone widths.
        value: { ...typeStyle('figureLarge', locale), fontSize: figureSize, lineHeight: Math.round(figureSize * 1.2), marginTop: 2, flexShrink: 0 },
        stackedValue: { ...typeStyle('figureRow', locale), flexShrink: 0 },
      }),
    [semantic, locale, layout, figureSize]
  );

  // One accessible statement per measure, with each sign spoken as a WORD
  // — never a stop on a bare "plus", and never a symbol a screen reader
  // may skip.
  const spoken = measures.map((m) => m.spoken).join(', ');

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('Transactions')}
      accessibilityRole="button"
      accessibilityLabel={`${spoken}. View transaction history`}
      testID="today-month-card"
    >
      <View style={styles.grid} importantForAccessibility="no-hide-descendants">
        {measures.map((m) =>
          layout === 'stacked' ? (
            <View key={m.key} style={styles.stackedMeasure} testID={`month-measure-${m.key}`}>
              <Text style={styles.label}>{m.label}</Text>
              <Text style={[styles.stackedValue, { color: toneInk(m.tone) }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
                {m.value}
              </Text>
            </View>
          ) : (
            <View key={m.key} style={styles.measure} testID={`month-measure-${m.key}`}>
              <Text style={styles.label}>{m.label}</Text>
              <Text style={[styles.value, { color: toneInk(m.tone) }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
                {m.value}
              </Text>
            </View>
          )
        )}
      </View>
    </TouchableOpacity>
  );
}
