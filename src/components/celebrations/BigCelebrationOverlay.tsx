import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CelebrationEvent } from '../../lib/celebrations';
import { Button } from '../shared/Button';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COUNT = 24;

function ConfettiPiece({ index, colors }: { index: number; colors: string[] }) {
  const progress = useRef(new Animated.Value(0)).current;
  const left = useMemo(() => Math.random() * SCREEN_WIDTH, []);
  const size = useMemo(() => 6 + Math.random() * 6, []);
  const color = colors[index % colors.length];
  const spin = useMemo(() => (Math.random() > 0.5 ? '540deg' : '-540deg'), []);
  const delay = useMemo(() => Math.random() * 350, []);
  const duration = useMemo(() => 1800 + Math.random() * 900, []);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration, delay, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-20, SCREEN_HEIGHT * 0.85] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', spin] });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top: 0,
        width: size,
        height: size * 1.6,
        backgroundColor: color,
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { rotate }],
      }}
    />
  );
}

// See MediumCelebrationSheet.tsx for why this fallback exists (RN Modal's
// onDismiss is iOS-only).
const ANDROID_DISMISS_FALLBACK_MS = 350;

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
  const { colors, radius, spacing, typography, glow } = useTheme();
  const insets = useSafeAreaInsets();
  const trophyBounce = useRef(new Animated.Value(0)).current;
  const confettiColors = [colors.gold, colors.accent, colors.purple, colors.market, colors.successBright];
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
        backdrop: { flex: 1, backgroundColor: 'rgba(6,10,8,0.85)' },
        content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
        iconBadge: {
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: 'rgba(255,255,255,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
          ...glow(colors.gold),
        },
        eyebrow: { ...typography.micro, color: 'rgba(255,255,255,0.75)', fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
        title: { ...typography.title, fontSize: 26, color: '#fff', textAlign: 'center', marginBottom: spacing.sm },
        body: { ...typography.body, fontSize: 15, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl },
        // Deliberately `alignSelf: 'center'` with a minWidth, not `stretch`
        // + `maxWidth` — stretch clamped by maxWidth still anchors to the
        // container's start edge instead of centering the leftover space,
        // which read as a left-aligned button (PRD bug report).
        button: { alignSelf: 'center', minWidth: 200, paddingHorizontal: spacing.xl },
      }),
    [colors, radius, spacing, typography, glow]
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
        {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
          <ConfettiPiece key={i} index={i} colors={confettiColors} />
        ))}
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
