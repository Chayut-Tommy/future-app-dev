/**
 * Nolie Design 5.1 Wave 4 device correction — the prominent account chooser.
 *
 * Replaces the small, low-prominence chip rows the owner could neither read
 * nor reliably hit when choosing where money came FROM (an expense's "Paid
 * from") or went INTO (an income's "Received into").
 *
 * PRESENTATION ONLY, and deliberately so. This component owns no
 * eligibility, no balances, no calculation and no persistence. The caller
 * hands it an already-eligible, already-formatted list derived from the
 * existing financial rules, and receives back the `id` of whatever the
 * customer chose. It cannot widen what the product considers a valid source
 * or destination, and it never formats a money value itself.
 *
 * It opens NO modal. The Add workspace already lives inside one native
 * modal, and a second is the documented freeze defect (`MOTION_HARD_RULES`
 * rule 2), so the rows expand inline in the same tree.
 *
 * Disclosure rule: with nothing chosen the eligible rows are expanded and
 * immediately visible — a customer must be able to see what they are
 * choosing between without hunting for a control. Once a choice is made the
 * list collapses to that one prominent row plus a `Change` action, so the
 * decision stays visible rather than being hidden behind a summary.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { FieldShell } from './FieldShell';
import { AddIcon } from '../AddIcon';
import { AddIconSpec, iconSpec } from '../../../lib/addIcons';

/** Minimum height of an account row. Taller than the 44pt touch minimum
 * because the row carries three lines of information and must read as a
 * primary decision, not a chip. */
export const ACCOUNT_ROW_MIN_HEIGHT = 52;

export interface AccountChoice {
  /** Stable identity the caller routes by. Never a label. */
  id: string;
  /** The account's own name, as the customer named it. */
  name: string;
  /** What kind of thing it is — "Cash", "Everyday account", "Credit card". */
  typeLabel: string;
  /** Wave 4 device correction — a designed Ionicons glyph name from
   * `lib/addIcons.ts`. Decorative; `rowLabel` below is the announcement. */
  icon: AddIconSpec;
  /** Already formatted by the caller (e.g. `formatMoney(a.currentValue)`).
   * Omitted where the product genuinely has no balance to show. */
  balanceLabel?: string;
  /** A short factual note shown under the row — e.g. why it cannot be used. */
  note?: string;
  disabled?: boolean;
}

export function AccountSelectionField({
  label,
  helper,
  choices,
  selectedId,
  onSelect,
  message,
  required = false,
  emptyBody,
  emptyActionLabel,
  onEmptyAction,
  containerStyle,
  testID,
}: {
  label: string;
  helper?: string;
  choices: readonly AccountChoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  message?: string | null;
  required?: boolean;
  /** Shown instead of the list when the caller has no eligible choices. */
  emptyBody?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, minTouchTarget, radius, spacing, typography } = useTheme();
  const selected = useMemo(() => choices.find((c) => c.id === selectedId) ?? null, [choices, selectedId]);
  // Expanded whenever nothing is chosen; a `Change` press reopens it.
  const [expanded, setExpanded] = useState(false);
  const showList = expanded || selected === null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        helper: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
        row: {
          minHeight: ACCOUNT_ROW_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        rowSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 },
        rowDisabled: { opacity: 0.5 },
        iconBadge: { marginRight: spacing.md },
        body: { flex: 1 },
        name: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        note: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
        balance: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        changeButton: {
          minHeight: minTouchTarget,
          justifyContent: 'center',
          paddingHorizontal: spacing.sm,
          marginLeft: spacing.sm,
        },
        changeText: { ...typography.caption, fontWeight: '600', color: colors.accentStrong },
        emptyBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
        emptyAction: { minHeight: minTouchTarget, justifyContent: 'center' },
        emptyActionText: { ...typography.body, fontWeight: '600', color: colors.accentStrong },
      }),
    [colors, minTouchTarget, radius, spacing, typography]
  );

  /** One announcement per row: name, kind, balance, and whether it is the
   * current choice. Never selection-by-colour alone. */
  function rowLabel(choice: AccountChoice, isSelected: boolean): string {
    const parts = [choice.name, choice.typeLabel];
    if (choice.balanceLabel) parts.push(choice.balanceLabel);
    if (choice.note) parts.push(choice.note);
    if (isSelected) parts.push('selected');
    return parts.join(', ');
  }

  function renderRow(choice: AccountChoice, isSelected: boolean, onPress: () => void) {
    return (
      <TouchableOpacity
        key={choice.id}
        style={[styles.row, isSelected && styles.rowSelected, choice.disabled && styles.rowDisabled]}
        onPress={onPress}
        disabled={choice.disabled}
        activeOpacity={0.75}
        testID={testID ? `${testID}-choice-${choice.id}` : undefined}
        accessibilityRole="radio"
        accessibilityLabel={rowLabel(choice, isSelected)}
        accessibilityState={{ checked: isSelected, selected: isSelected, disabled: !!choice.disabled }}
      >
        <AddIcon icon={choice.icon} tile emphasis={isSelected ? 'selected' : 'domain'} style={styles.iconBadge} />
        <View style={styles.body}>
          <Text style={styles.name}>{choice.name}</Text>
          <Text style={styles.meta}>{choice.typeLabel}</Text>
          {choice.note ? <Text style={styles.note}>{choice.note}</Text> : null}
        </View>
        {choice.balanceLabel ? <Text style={styles.balance}>{choice.balanceLabel}</Text> : null}
        {isSelected ? <AddIcon icon={iconSpec('checkmark-circle')} emphasis="selected" /> : null}
      </TouchableOpacity>
    );
  }

  return (
    <FieldShell label={label} message={message} required={required} style={containerStyle}>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}

      {choices.length === 0 ? (
        <View>
          {emptyBody ? <Text style={styles.emptyBody}>{emptyBody}</Text> : null}
          {emptyActionLabel && onEmptyAction ? (
            <TouchableOpacity style={styles.emptyAction} onPress={onEmptyAction} accessibilityRole="button" accessibilityLabel={emptyActionLabel}>
              <Text style={styles.emptyActionText}>{emptyActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : showList ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID ? `${testID}-list` : undefined}>
          {choices.map((c) =>
            renderRow(c, c.id === selectedId, () => {
              onSelect(c.id);
              setExpanded(false);
            })
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>{renderRow(selected as AccountChoice, true, () => setExpanded(true))}</View>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel={`Change ${label}`}
            testID={testID ? `${testID}-change` : undefined}
          >
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}
    </FieldShell>
  );
}
