import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MOTION_MS, SHEET_OFFSCREEN_TRAVEL_PT } from '../../theme/motion';
import { sheetChromeStyles } from './sheetChrome';

export interface SheetOption {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  destructive?: boolean;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;
// RN Modal's onDismiss (fires once native dismissal has actually finished)
// is iOS-only — this approximates the same wait on Android, which never
// fires it. See MediumCelebrationSheet.tsx for the matching pattern.
const ANDROID_DISMISS_FALLBACK_MS = 300;

/**
 * Lulu-styled replacement for ActionSheetIOS (PRD ask: "avoid grey/black
 * default sheets" — every quick-choice popup should look and feel like
 * Lulu, not a bare system menu).
 *
 * This *is* a real native `<Modal>` (imported from react-native, backed by
 * a native UIViewController on iOS) — an earlier version of this comment
 * claimed otherwise ("a plain JS-rendered Modal, so there's no native
 * view-controller race to hit"), and that wrong assumption is exactly what
 * let `choose()` call `onSelect` (which opens the *next* Modal — an income,
 * bill, or asset editor) in the same tick as this Modal's own `onClose`,
 * colliding two native Modal transitions in one commit — the same iOS race
 * documented on KeyboardSheet and the celebration components (PRD bug
 * report: "Add your essential bills" from the checklist froze the app).
 * `onSelect` now only fires from `onDismiss`, once this Modal's native
 * dismissal has actually completed.
 */
export function OptionsSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  onSelect,
  onClosed,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: SheetOption[];
  onSelect: (key: string) => void;
  /** OPTIONAL authoritative completion signal, fired exactly once AFTER native
   * dismissal has actually finished (the same boundary `onSelect` is deferred
   * to), carrying the selected option key or `null` when the sheet was
   * dismissed WITHOUT a selection (cancel / backdrop / swipe / back). Lets a
   * parent run a deterministic post-dismissal state machine — e.g. commit a
   * pending action on a real choice, or restore its draft on a choice-less
   * dismissal — without racing `onClose` (which fires BEFORE this). Existing
   * consumers that do not pass it are unaffected; `onSelect` timing is
   * unchanged. */
  onClosed?: (selectedKey: string | null) => void;
}) {
  const { colors, semantic, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const pendingSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  // The single native-dismissal-completion boundary. Fires the deferred
  // selection (only when a row was actually chosen), then always reports the
  // outcome to `onClosed` — the selected key, or null for a choice-less
  // dismissal — so a parent can finalise its own state deterministically.
  function runCompletion() {
    const key = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    if (key !== null) onSelect(key);
    onClosed?.(key);
  }

  // Wave 10 — the slide-out now runs on the named sheet-exit token, and
  // Reduced Motion commits the SAME final state immediately with zero
  // travel (doc C RM build). `finish` is one shared completion: the
  // deferred-onSelect lifecycle (the documented modal-freeze guard,
  // including its Android fallback) is byte-identical on both paths —
  // nothing here depends on the animation having run.
  function finishDismiss() {
    translateY.setValue(0);
    onClose();
    if (Platform.OS === 'android') {
      setTimeout(runCompletion, ANDROID_DISMISS_FALLBACK_MS);
    }
  }

  function dismiss() {
    if (reduceMotion) {
      finishDismiss();
      return;
    }
    Animated.timing(translateY, { toValue: SHEET_OFFSCREEN_TRAVEL_PT, duration: MOTION_MS.sheetInfoOut, useNativeDriver: true }).start(finishDismiss);
  }

  function choose(key: string) {
    pendingSelectionRef.current = key;
    dismiss();
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          dismiss();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Design 5.1 Wave 4 — chrome from the one shared definition. The
        // dismissal lifecycle above (deferring onSelect to onDismiss, with
        // the Android fallback) is the documented modal-freeze guard and is
        // deliberately NOT part of the consolidation.
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
        title: { ...typography.heading, fontSize: 16, color: colors.textPrimary, textAlign: 'center', marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        iconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
        iconBadgeDestructive: { backgroundColor: colors.dangerSoft },
        textBlock: { flex: 1 },
        rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        rowLabelDestructive: { color: colors.danger },
        rowDescription: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
        cancelButton: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
        cancelText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, semantic, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
      onDismiss={Platform.OS === 'ios' ? runCompletion : undefined}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {options.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => choose(o.key)}
              accessibilityRole="button"
              accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
            >
              <View style={[styles.iconBadge, o.destructive ? styles.iconBadgeDestructive : null]}>
                <Ionicons name={o.icon} size={17} color={o.destructive ? colors.danger : colors.accentStrong} />
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.rowLabel, o.destructive ? styles.rowLabelDestructive : null]}>{o.label}</Text>
                {o.description ? <Text style={styles.rowDescription}>{o.description}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
