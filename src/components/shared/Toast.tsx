/**
 * Nolie Design 5.1 Wave 4 — the general confirmation toast.
 *
 * The non-blocking "it saved" acknowledgement that every completed Add task
 * ends with (doc A p.12). Deliberately SEPARATE from
 * `components/celebrations/SmallCelebrationToast`, which is the celebration
 * tier and owns its own haptic and sparkle treatment — this one is the
 * plain, unemotional confirmation and fires no haptic at all.
 *
 * Motion rule 5 (`MOTION_HARD_RULES`): nothing here depends on the animation
 * having run. `onDismiss` is driven by a state timer over `toastLife`, and
 * the announcement is made on mount, so a toast still announces and still
 * dismisses under Reduced Motion where the travel is removed entirely.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { MOTION_MS, MOTION_TRAVEL_PT, resolveDuration } from '../../theme/motion';

export type ToastTone = 'success' | 'info' | 'warning';

export function Toast({
  message,
  tone = 'success',
  actionLabel,
  onAction,
  onDismiss,
  testID,
}: {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  testID?: string;
}) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // The announcement is unconditional and happens on mount — never gated on
  // the animation, per motion hard rule 5.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  // Presentation only. The dismissal below is a separate state timer that
  // runs whether or not this animation is allowed to travel.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: resolveDuration('toastIn', reduceMotion),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  useEffect(() => {
    const life = MOTION_MS.toastLife; // preserved under Reduced Motion by design
    const timer = setTimeout(onDismiss, life);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        toast: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          ...cardShadow,
        },
        icon: { marginRight: spacing.md },
        message: { ...typography.body, color: colors.textPrimary, flex: 1 },
        action: { ...typography.body, fontWeight: '600', color: colors.accent, marginLeft: spacing.md },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  const iconName = tone === 'success' ? 'checkmark-circle' : tone === 'warning' ? 'alert-circle' : 'information-circle';
  const iconColor = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.secondary;

  return (
    <Animated.View
      testID={testID}
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [MOTION_TRAVEL_PT.toastRise, 0],
            }),
          },
        ],
      }}
    >
      <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Ionicons name={iconName} size={20} color={iconColor} style={styles.icon} />
        <Text style={styles.message}>{message}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}
