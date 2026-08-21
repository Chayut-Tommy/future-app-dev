import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  IncludedBalancesSummary,
  MONEY_ROW_ICON_TILE_SIZE,
  isAccessibilityText,
} from '../../lib/calculations/moneyComposition';

/** Shorter than the generic measure definition, because this row's own
 * title already says what the balances ARE. What it must still say — and
 * the single most common misreading of an inclusion toggle — is that
 * changing them does not change what the customer owns. */
const SUPPORT_LINE = 'Used only for this estimate — your Wealth total is unchanged.';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** Taller than an ordinary row: it carries a title, a total and a
 * definition line. Comfortably above the 44pt activation minimum. */
export const INCLUDED_BALANCES_ROW_MIN_HEIGHT = 56;

/**
 * Design 5.1 Wave 6 — which balances feed Available Until Payday.
 *
 * One whole-row press target opening the EXISTING SelectBalancesSheet; its
 * selection defaults, persistence, Cancel/Save and dismissal behaviour are
 * untouched. This row only describes what the engine already decided.
 *
 * The definition line is load-bearing rather than decorative: the single
 * most common misreading of an inclusion toggle is that it changes what
 * the customer owns. It says, in words, that it does not.
 */
export function IncludedBalancesRow({
  summary,
  onManage,
}: {
  summary: IncludedBalancesSummary;
  onManage: () => void;
}) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const stackAction = isAccessibilityText(fontScale);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          paddingVertical: designSpacing.md,
          paddingHorizontal: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: INCLUDED_BALANCES_ROW_MIN_HEIGHT,
        },
        iconTile: {
          width: MONEY_ROW_ICON_TILE_SIZE,
          height: MONEY_ROW_ICON_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        body: { flex: 1 },
        title: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        primary: { ...typeStyle('figureRow', locale), color: semantic.textPrimary, marginTop: 2, flexShrink: 1 },
        // The explanation now has the row's full content width, so it reads
        // as one or two comfortable lines instead of three narrow ones.
        definition: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.xs },
      }),
    [semantic, locale]
  );

  // Wave 6 correction B — one primary summary sentence, not a count on one
  // line and a total on another. "$40,000 across 2 accounts" is how a
  // customer would say it aloud, and it keeps the amount and its context in
  // one coherent value that cannot be split.
  const accountWord = summary.count === 1 ? 'account' : 'accounts';
  const primary = summary.empty
    ? 'None selected yet'
    : summary.totalLabel
      ? `${summary.totalLabel} across ${summary.count} ${accountWord}`
      : `${summary.count} ${accountWord}`;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={onManage}
      accessibilityRole="button"
      // The action is spoken, not spelled out in a wide right-hand column
      // that would squeeze the explanation into three narrow lines.
      accessibilityLabel={`Balances used, ${primary}. Manage balances.`}
      accessibilityHint="Opens the balances included in your Available Until Payday estimate"
      testID="money-included-balances-row"
    >
      <View style={styles.iconTile} importantForAccessibility="no-hide-descendants">
        <Ionicons name="wallet-outline" size={15} color={semantic.interactive} />
      </View>
      <View style={styles.body} importantForAccessibility="no-hide-descendants">
        <Text style={styles.title}>Balances used</Text>
        {/* One coherent value — the amount and its account context never
            split across lines. */}
        <Text style={styles.primary} numberOfLines={stackAction ? 2 : 1}>{primary}</Text>
        <Text style={styles.definition}>{SUPPORT_LINE}</Text>
      </View>
      {/* A chevron, never a literal ">" character, and it takes only its
          own width rather than a column of content. */}
      <Ionicons name="chevron-forward" size={18} color={semantic.textTertiary} importantForAccessibility="no" />
    </TouchableOpacity>
  );
}
