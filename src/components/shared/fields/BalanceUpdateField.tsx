/**
 * Nolie Design 5.1 Wave 4 device correction — one coherent "Balance update"
 * section.
 *
 * What it replaces: a section headed "Tracked balance" (internal wording a
 * customer has no reason to know), two small radio lines whose labels did
 * not say which account they meant, a separate hint paragraph that
 * re-explained the same choice, and — when a source had no usable balance —
 * a second card repeating the same offer with its own duplicate "Add cash
 * balance" button. Technically understandable, but repetitive and hard to
 * scan.
 *
 * This renders exactly one of two states:
 *
 *   - a usable tracked balance exists: two large rows naming the actual
 *     account and saying plainly what will happen;
 *   - it does not: ONE informational card with one "Add ..." action and one
 *     "Record only" action.
 *
 * Presentation only. It owns no eligibility and no balance effect: the
 * caller decides whether a usable target exists and what each option means,
 * and the default selection is whatever the caller already had.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { AddIcon } from '../AddIcon';
import { iconSpec } from '../../../lib/addIcons';

/** Minimum height of a balance-choice row. */
export const BALANCE_ROW_MIN_HEIGHT = 52;

export type BalanceUpdateChoice = 'update' | 'none';

export function BalanceUpdateField({
  mode,
  accountName,
  value,
  onChange,
  missingTitle,
  missingBody,
  addBalanceLabel,
  onAddBalance,
  containerStyle,
  testID,
}: {
  mode: 'expense' | 'income';
  /** The account whose balance would change, already resolved by the
   * caller. `null` means no usable tracked balance exists for the current
   * selection — the missing state below. */
  accountName: string | null;
  value: BalanceUpdateChoice;
  onChange: (next: BalanceUpdateChoice) => void;
  missingTitle?: string;
  missingBody?: string;
  addBalanceLabel?: string;
  onAddBalance?: () => void;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        heading: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
        row: {
          minHeight: BALANCE_ROW_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
        },
        // Selected state carries a border weight, a fill AND a filled tick —
        // never colour alone.
        rowSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 },
        rowIcon: { marginRight: spacing.md },
        body: { flex: 1 },
        title: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        titleSelected: { color: colors.accentStrong },
        supporting: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        card: {
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        cardTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        cardBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
        cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
        cardAction: { minHeight: minTouchTarget, justifyContent: 'center' },
        cardActionText: { ...typography.body, fontWeight: '600', color: colors.accentStrong },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  function renderChoice(choice: BalanceUpdateChoice, title: string, supporting: string) {
    const selected = value === choice;
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => onChange(choice)}
        activeOpacity={0.75}
        testID={testID ? `${testID}-${choice}` : undefined}
        accessibilityRole="radio"
        accessibilityLabel={`${title}. ${supporting}`}
        accessibilityState={{ checked: selected, selected }}
      >
        <AddIcon
          icon={iconSpec(selected ? 'checkmark-circle' : 'ellipse-outline')}
          emphasis={selected ? 'selected' : 'muted'}
          style={styles.rowIcon}
        />
        <View style={styles.body}>
          <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
          <Text style={styles.supporting}>{supporting}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const recordOnlySupporting =
    mode === 'income' ? 'Save the income without changing a balance.' : 'Save the transaction without changing a balance.';

  return (
    <View style={containerStyle} testID={testID}>
      <Text style={styles.heading} accessibilityRole="header">
        Balance update
      </Text>

      {accountName === null ? (
        // Exactly ONE informational card. Never a second warning paragraph
        // and never a duplicate "Add ..." button elsewhere in the form.
        <View style={styles.card} testID={testID ? `${testID}-missing` : undefined}>
          <Text style={styles.cardTitle}>{missingTitle ?? "This balance isn't set up"}</Text>
          <Text style={styles.cardBody}>{missingBody ?? 'Add a balance to update it, or record this transaction without changing a balance.'}</Text>
          <View style={styles.cardActions}>
            {addBalanceLabel && onAddBalance ? (
              <TouchableOpacity
                style={styles.cardAction}
                onPress={onAddBalance}
                accessibilityRole="button"
                accessibilityLabel={addBalanceLabel}
                testID={testID ? `${testID}-add-balance` : undefined}
              >
                <Text style={styles.cardActionText}>{addBalanceLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.cardAction}
              onPress={() => onChange('none')}
              accessibilityRole="button"
              accessibilityLabel="Record only"
              testID={testID ? `${testID}-record-only` : undefined}
            >
              <Text style={styles.cardActionText}>Record only</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {renderChoice(
            'update',
            `Update ${accountName} balance`,
            mode === 'income' ? 'Add this amount when the income is saved.' : 'Subtract this amount when the transaction is saved.'
          )}
          {renderChoice('none', 'Record only', recordOnlySupporting)}
        </>
      )}
    </View>
  );
}
