/**
 * Nolie Design 5.1 Wave 4 — choose one option, without leaving the form.
 *
 * This is the component that replaces the removed preliminary chooser pages
 * ("What's this for?", "What's this bill for?", the income-kind and
 * asset-type pages). It is a `PickerTrigger` that reveals its options
 * INLINE, directly beneath itself.
 *
 * Inline is not a style preference — it is the modal-freeze invariant
 * (`MOTION_HARD_RULES` rule 2: "Single native modal at a time"). A form body
 * already renders inside either a `KeyboardSheet` Modal or the Add
 * workspace; opening a second native `<Modal>` to pick a category is exactly
 * the collision that froze the app before. This component opens no modal at
 * all.
 *
 * Selecting an option closes the list. The list is a `radiogroup` of
 * `SelectableRow`s, so a screen reader announces the set and the current
 * choice rather than a run of unrelated buttons.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { PickerTrigger } from './PickerTrigger';
import { SelectableRow } from '../rows/SelectableRow';
import { AddIconSpec } from '../../../lib/addIcons';

export interface InlineSelectOption<T extends string> {
  value: T;
  label: string;
  supporting?: string;
  /** Wave 4 device correction — a designed Ionicons glyph name, never an
   * emoji. Decorative; the row's own label carries the meaning. */
  icon?: AddIconSpec;
}

export function InlineSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select',
  message,
  tone = 'error',
  required = false,
  disabled = false,
  containerStyle,
  testID,
}: {
  label?: string;
  options: readonly InlineSelectOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
  placeholder?: string;
  message?: string | null;
  tone?: 'error' | 'hint';
  required?: boolean;
  disabled?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        list: {
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingVertical: spacing.xs,
          marginBottom: spacing.md,
        },
      }),
    [colors, radius, spacing]
  );

  return (
    <View style={containerStyle}>
      <PickerTrigger
        label={label}
        value={selected?.label ?? null}
        icon={selected?.icon ?? null}
        placeholder={placeholder}
        message={message}
        tone={tone}
        required={required}
        disabled={disabled}
        onPress={() => setOpen((prev) => !prev)}
        testID={testID}
      />
      {open && !disabled ? (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {options.map((o) => (
            <SelectableRow
              key={o.value}
              title={o.label}
              supporting={o.supporting ?? null}
              icon={o.icon ?? null}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              testID={testID ? `${testID}-option-${o.value}` : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
