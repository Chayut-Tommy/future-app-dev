import React, { useEffect, useMemo } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';
import { sheetChromeStyles } from './sheetChrome';

/**
 * A dedicated modal surface for date selection, isolated from any parent
 * KeyboardSheet's swipe-to-dismiss gesture (device defect: an inline
 * DateTimePicker rendered directly inside a KeyboardSheet's shared
 * scroll/pan-responder surface let a vertical scroll or swipe *within the
 * calendar itself* get captured as a sheet-dismiss gesture, silently
 * discarding whatever the user had already typed — UX correction).
 *
 * Rendering this as its own top-level `Modal` (iOS only — see below) means
 * every touch inside it is owned entirely by this modal's own native layer;
 * it structurally cannot be intercepted by whatever `PanResponder` the
 * parent sheet underneath it happens to have attached, regardless of any
 * flag on that parent. Also dismisses the keyboard the moment it opens (a
 * `TouchableOpacity` date-field trigger does not do this automatically —
 * the field it replaces the keyboard with needs its own real viewport), and
 * applies Navilo's own active theme (`scheme`, from ThemeContext — never
 * the raw OS appearance) to the native calendar via `themeVariant`, so dark
 * mode text stays legible instead of silently falling back to the
 * platform's own default styling.
 *
 * Android's `display="default"` is already its own dedicated native dialog
 * (never embedded/scrollable inline), so it never had the gesture-conflict
 * or viewport-sizing problem this component exists to fix — wrapping it in
 * another Modal here would just be a redundant second overlay. It renders
 * unwrapped, exactly as it already did before this fix, with only the
 * keyboard-dismiss behaviour applied (harmless, and correct there too).
 */
export function DatePickerModal({
  visible,
  value,
  minimumDate,
  onChange,
  onClose,
}: {
  visible: boolean;
  /** The date to open the calendar on — the currently selected date, or a
   * sensible fallback (e.g. `new Date()`) when nothing is selected yet. */
  value: Date;
  minimumDate?: Date;
  /** Fired on every date the user taps — the caller's own state is the
   * single source of truth for what's currently selected; this component
   * never buffers a separate "pending" value of its own. */
  onChange: (date: Date) => void;
  onClose: () => void;
}) {
  const { colors, semantic, radius, spacing, typography, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Design 5.1 Wave 4 — chrome from the one shared definition. The
        // iOS-only Modal wrapping and the gesture-isolation boundary below
        // are behaviour, not chrome, and are unchanged.
        ...sheetChromeStyles({
          surface: colors.surface,
          scrim: semantic.scrim,
          grabber: colors.borderStrong,
          radiusCard: radius.card,
          spacingSm: spacing.sm,
          spacingMd: spacing.md,
          spacingLg: spacing.lg,
          insetBottom: insets.bottom,
        }),
        title: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
        footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.md },
        doneButton: { paddingHorizontal: spacing.xl, flex: 0 },
      }),
    [colors, semantic, radius, spacing, typography, insets.bottom]
  );

  if (Platform.OS !== 'ios') {
    // Android's own date dialog is already a separate, correctly-sized,
    // gesture-safe overlay — no wrapping Modal needed.
    return visible ? (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        onChange={(event, date) => {
          onClose();
          if (event.type === 'dismissed') return;
          if (date) onChange(date);
        }}
      />
    ) : null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        {/* Swallow the tap so it doesn't bubble to the backdrop's onPress —
            the calendar itself owns every gesture inside this boundary,
            never the sheet behind or underneath it. */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Choose a date</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            themeVariant={scheme}
            accentColor={colors.accent}
            onChange={(event, date) => {
              if (date) onChange(date);
            }}
          />
          <View style={styles.footer}>
            <Button label="Done" onPress={onClose} style={styles.doneButton} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
