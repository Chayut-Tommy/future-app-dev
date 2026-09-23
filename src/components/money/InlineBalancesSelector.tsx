import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { IncludedBalancesSummary } from '../../lib/calculations/moneyComposition';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import { fontFamilyForWeight } from '../../theme/typography';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** The one line that says what changing this does NOT do. Load-bearing: the most
 * common misreading of an inclusion toggle is that it changes what you own. */
export const BALANCES_USED_LABEL = 'Balances used';

/**
 * Pass D.5 — the compact balances control that lives directly beneath the card's
 * left-hand amount, in BOTH modes, replacing the separate "Balances used" card.
 *
 * It describes and opens; it never computes. The label, the count and the included
 * total are composed by the pure `summariseIncludedBalances` owner from the engine's
 * own `includedMoneyBalanceAccounts`, and pressing it opens the EXISTING selection
 * journey — no second selection model, no local total.
 */
export function InlineBalancesSelector({
  summary,
  onPress,
  controlRef,
  testID = 'money-inline-balances',
}: {
  summary: IncludedBalancesSummary;
  onPress: () => void;
  /** So the sheet can return assistive focus here once it has finished dismissing. */
  controlRef?: React.Ref<View>;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginTop: designSpacing.sm },
        label: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        pill: {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: designSpacing.xs,
          marginTop: designSpacing.xs,
          paddingVertical: designSpacing.xs,
          paddingHorizontal: designSpacing.sm,
          borderRadius: designRadius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          backgroundColor: semantic.bgSurface,
          minHeight: designLayout.touchTargetMin,
          minWidth: designLayout.touchTargetMin,
          // Long account names wrap rather than clipping or pushing the daily-guide
          // column; the pill grows downward with its text.
          flexShrink: 1,
          maxWidth: '100%',
        },
        // The money keeps its tabular figures; the name keeps prose metrics.
        text: { ...typeStyle('meta', locale), fontWeight: '600', fontFamily: fontFamilyForWeight(600, locale), fontVariant: ['tabular-nums'], color: semantic.textPrimary, flexShrink: 1 },
      }),
    [semantic, locale]
  );

  return (
    <View style={styles.block} testID={`${testID}-block`}>
      <Text style={styles.label} maxFontSizeMultiplier={2} importantForAccessibility="no">
        {BALANCES_USED_LABEL}
      </Text>
      <TouchableOpacity
        ref={controlRef}
        style={styles.pill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={summary.selectorSpoken}
        accessibilityHint="Choose which account balances your money estimates use"
        testID={testID}
      >
        <Ionicons name="wallet-outline" size={14} color={semantic.interactive} importantForAccessibility="no" />
        <Text style={styles.text} maxFontSizeMultiplier={2} importantForAccessibility="no">
          {summary.selectorLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={semantic.textTertiary} importantForAccessibility="no" />
      </TouchableOpacity>
    </View>
  );
}
