import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CelebrationEvent } from '../../lib/celebrations';

const VISIBLE_MS = 2200;

/**
 * The lightest celebration tier — a sparkle toast + a light haptic tap, for
 * things that happen often (a goal contribution, a small debt payment).
 * Non-blocking: sits above content, dismisses itself, no button to tap.
 */
export function SmallCelebrationToast({ event, onDone }: { event: CelebrationEvent; onDone: () => void }) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.delay(VISIBLE_MS),
      Animated.timing(progress, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: insets.top + spacing.sm, zIndex: 50 },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          ...cardShadow,
        },
        iconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.caption, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
        body: { ...typography.micro, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
      }),
    [colors, radius, spacing, typography, cardShadow, insets.top]
  );

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.iconBadge}>
          <Ionicons name={event.icon} size={16} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{event.title}</Text>
          {event.body ? <Text style={styles.body}>{event.body}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}
