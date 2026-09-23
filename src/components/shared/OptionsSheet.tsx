import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MOTION_MS, SHEET_OFFSCREEN_TRAVEL_PT } from '../../theme/motion';
import { sheetChromeStyles } from './sheetChrome';
import { EditorCompletionStatus } from './EditorCompletionStatus';
import { sendFocusEvent } from '../../lib/a11yFocus';
import type { EditorPendingKind } from '../../lib/editorCompletion';
import { typeStyle } from '../../theme/textStyle';
import { fontFamilyForWeight } from '../../theme/typography';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

export interface SheetOption {
  /** Pass D0.1 — report the selection immediately and keep the sheet presented. */
  inPlace?: boolean;
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
  busy = false,
  pendingKind = null,
  errorText = null,
  cancelLabel = 'Cancel',
  onCancel,
  viewKey,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: SheetOption[];
  onSelect: (key: string) => void;
  /**
   * Pass D0.1 — ONE native host, several internal views. All optional; a caller
   * that passes none gets the original behaviour exactly.
   * - an option marked `inPlace` reports its selection IMMEDIATELY and leaves
   *   the sheet presented, so the host can swap this sheet's own content (a
   *   second view, or a durable action with a pending state) without the
   *   close-then-reopen choreography that briefly exposed the screen behind;
   * - `busy` disables every row and REFUSES dismissal (Cancel, backdrop, swipe,
   *   hardware Back) while a durable write is unresolved;
   * - `pendingKind` / `errorText` show the shared Saving… / failure line;
   * - `cancelLabel` + `onCancel` turn the footer into an internal Back;
   * - `viewKey` names the current view: when it changes while presented, focus
   *   moves to the new heading once.
   */
  busy?: boolean;
  pendingKind?: EditorPendingKind | null;
  errorText?: string | null;
  cancelLabel?: string;
  onCancel?: () => void;
  viewKey?: string;
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
  const { colors, semantic, radius, spacing } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  // Pass D.3 (F3) — the scrim fades WITH the sheet's slide-out, and once that
  // exit has run the native Modal hides without a second animation of its own.
  // Before: the JS slide-out finished, then the native `slide` dismissal replayed
  // the whole (already off-screen) content — a lingering scrim and a second,
  // laggy exit. One exit now: sheet and scrim leave together, then the host
  // drops the Modal instantly. Entrance is unchanged (the native slide).
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  // A ref, not state: it is read by the render the host's own close triggers, so the
  // exit adds no state update of its own (and no act() work for the host's tests).
  const exitingRef = useRef(false);
  const reduceMotion = useReduceMotion();
  const pendingSelectionRef = useRef<string | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const titleRef = useRef<Text>(null);
  const lastViewKeyRef = useRef(viewKey);
  useEffect(() => {
    if (!visible) {
      lastViewKeyRef.current = viewKey;
      return;
    }
    if (lastViewKeyRef.current !== viewKey) {
      lastViewKeyRef.current = viewKey;
      sendFocusEvent(titleRef); // an internal view change: focus its heading once
    }
  }, [viewKey, visible]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      backdropOpacity.setValue(1);
      exitingRef.current = false;
    }
  }, [visible, translateY, backdropOpacity]);

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
    // The sheet's position is NOT reset here: it is off-screen (or wherever the
    // swipe left it) until the host hides the Modal in this same commit, and the
    // fresh-open effect above resets it. `exiting` switches the Modal's own
    // dismissal to instant, so the exit the customer saw is the only one.
    exitingRef.current = true;
    onClose();
    if (Platform.OS === 'android') {
      setTimeout(runCompletion, ANDROID_DISMISS_FALLBACK_MS);
    }
  }

  function dismiss() {
    if (busyRef.current) return; // never an ambiguous dismissal mid-write
    if (reduceMotion) {
      finishDismiss();
      return;
    }
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_OFFSCREEN_TRAVEL_PT, duration: MOTION_MS.sheetInfoOut, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: MOTION_MS.sheetInfoOut, useNativeDriver: true }),
    ]).start(finishDismiss);
  }

  function choose(key: string) {
    if (busyRef.current) return;
    if (options.find((o) => o.key === key)?.inPlace) {
      onSelect(key); // in place: the sheet stays presented
      return;
    }
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
        if (!busyRef.current && (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY)) {
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
        // Pass D.3 (F3) — Design 5.1 roles (Figtree), never the legacy tokens, which
        // carry no family and therefore rendered the platform font.
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, textAlign: 'center', marginBottom: 2 },
        subtitle: { ...typeStyle('meta', locale), color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
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
        rowLabel: { ...typeStyle('support', locale), fontWeight: '600', fontFamily: fontFamilyForWeight(600, locale), color: colors.textPrimary },
        rowLabelDestructive: { color: colors.danger },
        rowDescription: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 1 },
        cancelButton: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs, minHeight: 44, justifyContent: 'center' },
        cancelText: { ...typeStyle('support', locale), fontWeight: '600', fontFamily: fontFamilyForWeight(600, locale), color: colors.textSecondary },
      }),
    [colors, semantic, radius, spacing, locale, insets.bottom]
  );

  return (
    <Modal
      visible={visible}
      // `!visible` guards the re-open render, which runs before the reset effect above.
      animationType={reduceMotion || (exitingRef.current && !visible) ? 'none' : 'slide'}
      transparent
      onRequestClose={dismiss}
      onDismiss={Platform.OS === 'ios' ? runCompletion : undefined}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} testID="options-sheet-backdrop">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} accessible={false} importantForAccessibility="no" />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          {title ? (
            <Text ref={titleRef} style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {options.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => choose(o.key)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
              accessibilityState={{ disabled: busy, busy }}
              testID={`options-sheet-row-${o.key}`}
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
          <EditorCompletionStatus pending={pendingKind} errorText={errorText} testID="options-sheet-status" />
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => (busyRef.current ? undefined : onCancel ? onCancel() : dismiss())}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            accessibilityState={{ disabled: busy }}
            testID="options-sheet-cancel"
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
