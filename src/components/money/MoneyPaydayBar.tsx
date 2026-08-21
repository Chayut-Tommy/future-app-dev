import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { ProgressBar } from '../shared/ProgressBar';
import { PaydayProgress } from '../../lib/calculations/moneyComposition';
import { designLayout, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Design 5.1 Wave 6 — payday progress, directly attached to the Available
 * Until Payday hero.
 *
 * Every value comes from `progress`, which resolvePaydayProgress derived
 * from the SafeToSpendResult the hero is already showing. This component
 * performs NO date arithmetic and infers no payday: when none is recorded
 * it says so and shows no bar rather than filling an invented cycle.
 *
 * The bar is decorative — one composed sentence on the wrapper carries the
 * dates, the day count and the estimate caveat, so a screen reader gets
 * the whole state in one stop instead of three fragments. Nothing here
 * depends on an animation having run.
 */
export function MoneyPaydayBar({ progress }: { progress: PaydayProgress }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginTop: designSpacing.md },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm },
        titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: designSpacing.sm },
        title: { ...typeStyle('support', locale), color: semantic.textPrimary, fontWeight: '600', flexShrink: 1 },
        daysLeft: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 0 },
        endpoint: { ...typeStyle('meta', locale), color: semantic.textSecondary, flexShrink: 1 },
        barWrap: { marginTop: designSpacing.sm, marginBottom: designSpacing.xs },
        caption: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.xs },
        unknown: { ...typeStyle('support', locale), color: semantic.textSecondary, minHeight: designLayout.touchTargetMin, paddingTop: designSpacing.sm },
      }),
    [semantic, locale]
  );

  if (progress.unknown) {
    return (
      <View style={styles.block} accessible accessibilityLabel={progress.spoken} testID="money-payday-bar-unknown">
        <Text style={styles.unknown} importantForAccessibility="no">
          Next payday not recorded yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.block} accessible accessibilityLabel={progress.spoken} testID="money-payday-bar">
      {/* Wave 6 Correction C — the rail is now NAMED. A nearly-full bar
          with only two dates beside it reads as "money used"; it measures
          elapsed pay-cycle time. The title says so, and the day count moves
          up here so "N days" is stated once rather than twice. */}
      <View style={styles.titleRow} importantForAccessibility="no-hide-descendants">
        <Text style={styles.title}>Pay cycle progress</Text>
        <Text style={styles.daysLeft}>
          {progress.daysRemaining} {progress.daysRemaining === 1 ? 'day' : 'days'} left
        </Text>
      </View>
      <View style={styles.barWrap} importantForAccessibility="no-hide-descendants">
        <ProgressBar progress={progress.fraction} color={semantic.interactive} height={6} />
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <Text style={styles.endpoint}>{progress.startLabel}</Text>
        <Text style={styles.endpoint}>{progress.endLabel}</Text>
      </View>
      {/* Estimated cycle start is stated in words, never implied by the
          bar's shape alone — and stated once, adjacent to the dates. */}
      <Text style={styles.caption} importantForAccessibility="no">
        Cycle start estimated
      </Text>
    </View>
  );
}
