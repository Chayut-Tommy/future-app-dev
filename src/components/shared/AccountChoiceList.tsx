import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  AccountChoiceRow,
  AccountChoiceKind,
  groupAccountChoices,
  accountChoiceAccessibilityLabel,
  accountRowStacksBalance,
  ACCOUNT_ROW_MIN_HEIGHT,
} from '../../lib/calculations/accountChoice';

/**
 * Nolie Design 5.1 Wave 6 final — the one account chooser.
 *
 * PRESENTATION ONLY. It renders rows and reports which one was tapped. It
 * holds no selection state, performs no mutation and knows nothing about
 * eligibility — the caller owns all three, because eligibility legitimately
 * differs between journeys and selection must be separable from
 * confirmation.
 *
 * Selecting is NOT confirming. The previous chip pickers fired the caller's
 * mutation straight out of `onPress`, so a customer discovered they had
 * paid a bill by having already paid it. This control only ever marks a
 * row selected; a separate primary button performs the financial action.
 */

const ICON: Record<AccountChoiceKind, keyof typeof Ionicons.glyphMap> = {
  cash: 'wallet-outline',
  everyday: 'card-outline',
  savings: 'archive-outline',
  credit_card: 'card',
};

export function AccountChoiceList({
  rows,
  selectedId,
  onSelect,
  disabled,
  testID,
}: {
  rows: AccountChoiceRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors, radius, spacing, typography, semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = accountRowStacksBalance(width, fontScale);
  const groups = useMemo(() => groupAccountChoices(rows), [rows]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        group: { marginBottom: spacing.sm },
        groupTitle: { ...typography.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.xs },
        groupNote: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: spacing.sm },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: ACCOUNT_ROW_MIN_HEIGHT,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          marginBottom: spacing.sm,
        },
        // Selection is carried by border weight, tint AND the check glyph —
        // never by colour alone.
        rowSelected: { borderWidth: 2, borderColor: semantic.interactive, backgroundColor: semantic.interactiveTint },
        iconTile: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
        iconTileMoney: { backgroundColor: semantic.interactiveTint },
        iconTileCard: { backgroundColor: semantic.warningTint },
        // The three text slots. `body` grows, the balance column does not,
        // so a long account name shortens nothing but itself.
        body: { flex: 1, minWidth: 0 },
        name: { ...typography.body, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
        type: { ...typography.caption, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
        balanceInline: { ...typography.caption, fontSize: 13, fontWeight: '600', color: colors.textPrimary, textAlign: 'right' },
        balanceStacked: { ...typography.caption, fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
        balanceOwed: { color: semantic.warningAccent },
        check: { width: 22, alignItems: 'center' },
      }),
    [colors, radius, spacing, typography, semantic]
  );

  return (
    <View testID={testID}>
      {groups.map((group) => (
        <View key={group.title ?? 'accounts'} style={styles.group}>
          {group.title ? <Text style={styles.groupTitle}>{group.title}</Text> : null}
          {group.note ? <Text style={styles.groupNote}>{group.note}</Text> : null}
          {group.rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <TouchableOpacity
                key={row.id}
                style={[styles.row, selected ? styles.rowSelected : null]}
                onPress={() => onSelect(row.id)}
                disabled={disabled}
                accessibilityRole="radio"
                // One spoken string: name, type and figure once each. The
                // visual balance column is hidden from the reader so it is
                // not announced a second time.
                accessibilityLabel={accountChoiceAccessibilityLabel(row)}
                accessibilityState={{ selected, disabled: !!disabled }}
                testID={`account-choice-${row.id}`}
              >
                <View style={[styles.iconTile, row.kind === 'credit_card' ? styles.iconTileCard : styles.iconTileMoney]}>
                  <Ionicons
                    name={ICON[row.kind]}
                    size={17}
                    color={row.kind === 'credit_card' ? semantic.warningAccent : semantic.interactive}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={2}>{row.name}</Text>
                  <Text style={styles.type}>{row.typeLabel}</Text>
                  {/* At narrow widths or large type the figure moves BELOW
                      the name rather than competing with it for the same
                      line — truncating an account name is how a customer
                      picks the wrong account. */}
                  {stacked ? (
                    <Text style={[styles.balanceStacked, row.owed ? styles.balanceOwed : null]} accessibilityElementsHidden importantForAccessibility="no">
                      {row.balanceLabel}
                    </Text>
                  ) : null}
                </View>
                {stacked ? null : (
                  <Text style={[styles.balanceInline, row.owed ? styles.balanceOwed : null]} accessibilityElementsHidden importantForAccessibility="no">
                    {row.balanceLabel}
                  </Text>
                )}
                <View style={styles.check}>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selected ? semantic.interactive : colors.border}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
