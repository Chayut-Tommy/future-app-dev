import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { CelebrationEvent } from '../../lib/celebrations';
import { Button } from '../shared/Button';
import { ON_FEATURED, onFeaturedAlpha, scrimAt } from '../../theme/semanticTokens';

/** Pre-existing Android dismissal fallback (RN's Modal fires no onDismiss
 * there) — protected queue coordination, untouched by Wave 10. */
const ANDROID_DISMISS_FALLBACK_MS = 350;

// Wave 10 — the confetti field is REMOVED. Doc C's celebration rules are
// explicit: no confetti, no decorative continuous motion, no rotation for
// decoration, and no randomised motion. The full overlay keeps its scrim,
// icon reveal, copy and single softSuccess haptic; the falling pieces
// (24 randomly-timed spinning rectangles) were a pre-Design-5.1 artefact.

/**
 * The biggest celebration tier — reserved for genuinely big moments (a
 * first investment, an emergency fund milestone). Confetti is plain
 * Animated views (no new native dependency), each falling and spinning on
 * its own randomized timeline for an organic look.
 *
 * `visible` is local state — see MediumCelebrationSheet.tsx's comment for
 * why the queue must only advance after the native Modal's `onDismiss`,
 * never on button press directly.
 */
export function BigCelebrationOverlay({ event, onDismissed }: { event: CelebrationEvent; onDismissed: () => void }) {
  const { colors, scheme, radius, spacing, typography, glow } = useTheme();
  const insets = useSafeAreaInsets();
  const trophyBounce = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Wave 10 closure — haptically SILENT: the action's single shared
    // softSuccess is dispatched at the celebration queue's enqueue
    // boundary, never per-renderer.
    // Reduced Motion presents the settled icon immediately — the reveal is
    // presentation only and nothing waits on it (motion hard rule 5).
    if (reduceMotionRef.current) {
      trophyBounce.setValue(1);
      return;
    }
    trophyBounce.setValue(0);
    Animated.spring(trophyBounce, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80, delay: 150 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  function requestDismiss() {
    setVisible(false);
    if (Platform.OS === 'android') {
      setTimeout(onDismissed, ANDROID_DISMISS_FALLBACK_MS);
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: scrimAt(scheme, 0.85) },
        content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
        iconBadge: {
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: onFeaturedAlpha(0.16),
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
          ...glow(colors.gold),
        },
        eyebrow: { ...typography.micro, color: onFeaturedAlpha(0.75), fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
        title: { ...typography.title, fontSize: 26, color: ON_FEATURED, textAlign: 'center', marginBottom: spacing.sm },
        body: { ...typography.body, fontSize: 15, color: onFeaturedAlpha(0.9), textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl },
        // Deliberately `alignSelf: 'center'` with a minWidth, not `stretch`
        // + `maxWidth` — stretch clamped by maxWidth still anchors to the
        // container's start edge instead of centering the leftover space,
        // which read as a left-aligned button (PRD bug report).
        button: { alignSelf: 'center', minWidth: 200, paddingHorizontal: spacing.xl },
      }),
    [colors, scheme, radius, spacing, typography, glow]
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={requestDismiss}
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.iconBadge,
              { transform: [{ scale: trophyBounce.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.2, 1] }) }] },
            ]}
          >
            <Ionicons name={event.icon} size={44} color={colors.gold} />
          </Animated.View>
          <Text style={styles.eyebrow}>MILESTONE UNLOCKED</Text>
          <Text style={styles.title}>{event.title}</Text>
          {event.body ? <Text style={styles.body}>{event.body}</Text> : null}
          <Button label="Continue" onPress={requestDismiss} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}
