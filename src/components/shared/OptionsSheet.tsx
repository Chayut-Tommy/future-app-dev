import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

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
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: SheetOption[];
  onSelect: (key: string) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const pendingSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  function runPendingSelection() {
    const key = pendingSelectionRef.current;
    if (key === null) return;
    pendingSelectionRef.current = null;
    onSelect(key);
  }

  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
      translateY.setValue(0);
      onClose();
      if (Platform.OS === 'android') {
        setTimeout(runPendingSelection, ANDROID_DISMISS_FALLBACK_MS);
      }
    });
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
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
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
    [colors, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
      onDismiss={Platform.OS === 'ios' ? runPendingSelection : undefined}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {options.map((o) => (
            <TouchableOpacity key={o.key} style={styles.row} activeOpacity={0.7} onPress={() => choose(o.key)}>
              <View style={[styles.iconBadge, o.destructive ? styles.iconBadgeDestructive : null]}>
                <Ionicons name={o.icon} size={17} color={o.destructive ? colors.danger : colors.accentStrong} />
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.rowLabel, o.destructive ? styles.rowLabelDestructive : null]}>{o.label}</Text>
                {o.description ? <Text style={styles.rowDescription}>{o.description}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={dismiss}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
