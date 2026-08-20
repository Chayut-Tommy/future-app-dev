import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { RefObject } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { BriefingPriorityRow as PriorityRowModel, PriorityRowMarker } from '../../lib/calculations/briefingPriorityRows';
import { PRIORITY_ROW_MIN_HEIGHT, ROW_ICON_TILE_SIZE, priorityRowAmountFitsInline } from '../../lib/calculations/todayComposition';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Design 5.1 Wave 5 — one full-width priority row inside the Briefing hero.
 *
 * Replaces the third-of-a-width tile, which could only ever carry a
 * category word. The row shows what a customer actually needs: the item's
 * own name and timing, the exact date it falls on, and the amount.
 *
 * The status marker is a semantic colour, and the four markers are not
 * interchangeable — `urgent` is reserved for money genuinely already late,
 * `caution` for due-soon, `positive` only for money arriving or recorded.
 * A due-today bill is caution, never urgent: reminders.ts is explicit that
 * "overdue" would be inaccurate for it.
 */
function markerColors(marker: PriorityRowMarker, semantic: ReturnType<typeof useTheme>['semantic']) {
  switch (marker) {
    case 'urgent':
      return { ink: semantic.urgentText, tint: semantic.urgentTint };
    case 'caution':
      return { ink: semantic.warning, tint: semantic.warningTint };
    case 'positive':
      return { ink: semantic.success, tint: semantic.successTint };
    case 'neutral':
      return { ink: semantic.textSecondary, tint: semantic.bgRaised };
  }
}

export function BriefingPriorityRow({
  row,
  onPress,
  focusRef,
  isLast,
}: {
  row: PriorityRowModel;
  onPress: () => void;
  /** Reminder focus/announcements task — attached only to the reminder
   * row, exactly as the tile it replaces was, so focus still returns here
   * when the Reminder sheet closes and this row still exists. */
  focusRef?: RefObject<any>;
  isLast: boolean;
}) {
  const { semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const inlineAmount = priorityRowAmountFitsInline(width, fontScale);
  const { ink, tint } = markerColors(row.marker, semantic);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          minHeight: Math.max(PRIORITY_ROW_MIN_HEIGHT, designLayout.touchTargetMin),
          paddingVertical: designSpacing.sm,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: semantic.border,
        },
        iconTile: {
          width: ROW_ICON_TILE_SIZE,
          height: ROW_ICON_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint,
        },
        body: { flex: 1 },
        label: { ...typeStyle('body', locale), color: semantic.textPrimary, fontWeight: '600' },
        // Amounts and dates never truncate — the row grows instead
        // (DYNAMIC_TYPE.neverTruncate).
        meta: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
        stackedAmount: { ...typeStyle('figureRow', locale), color: ink, marginTop: 2 },
        trailing: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.sm },
        trailingAmount: { ...typeStyle('figureRow', locale), color: ink },
      }),
    [semantic, locale, tint, ink, isLast]
  );

  return (
    <TouchableOpacity
      ref={focusRef}
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint="Opens details"
      testID={`briefing-priority-row-${row.key}`}
    >
      <View style={styles.iconTile} importantForAccessibility="no-hide-descendants">
        <Ionicons name={row.icon} size={15} color={ink} />
      </View>
      <View style={styles.body} importantForAccessibility="no-hide-descendants">
        <Text style={styles.label}>{row.label}</Text>
        {row.dateLabel ? <Text style={styles.meta}>{row.dateLabel}</Text> : null}
        {!inlineAmount && row.amountLabel ? <Text style={styles.stackedAmount}>{row.amountLabel}</Text> : null}
      </View>
      <View style={styles.trailing} importantForAccessibility="no-hide-descendants">
        {inlineAmount && row.amountLabel ? <Text style={styles.trailingAmount}>{row.amountLabel}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}
