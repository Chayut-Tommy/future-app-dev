import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CelebrationEvent } from '../../lib/celebrations';
import { Button } from '../shared/Button';

// RN's Modal onDismiss (native dismissal has actually finished) is iOS-only
// — Android never fires it, so this approximates the same "wait for the
// dismiss animation" contract there instead of never calling onDismissed.
const ANDROID_DISMISS_FALLBACK_MS = 300;

/**
 * Medium tier — a bottom sheet with a bouncing badge, for meaningful but
 * routine wins (a goal milestone, a bigger habit). One step up from the
 * small toast, one step below the full-screen "big" celebration.
 *
 * `visible` is local state, not a hardcoded `true` — CelebrationContext's
 * queue must only advance (which can immediately present the *next*
 * queued Modal) once this Modal has actually finished its native
 * dismissal, never the instant "Keep going" is tapped. Presenting a new
 * Modal while this one's native dismiss animation is still running is the
 * exact iOS two-Modals-in-one-tick race this app has hit twice already
 * (PRD bug report) — `onDismiss` (fired by RN after the native teardown
 * completes) is what actually calls `onDismissed`, not the button press.
 */
export function MediumCelebrationSheet({ event, onDismissed }: { event: CelebrationEvent; onDismissed: () => void }) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const insets = useSafeAreaInsets();
  const bounce = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    bounce.setValue(0);
    Animated.spring(bounce, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }).start();
  }, [event.id, bounce]);

  function requestDismiss() {
    setVisible(false);
    if (Platform.OS === 'android') {
      setTimeout(onDismissed, ANDROID_DISMISS_FALLBACK_MS);
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.5)', justifyContent: 'flex-end' },
        sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: spacing.xl, alignItems: 'center', ...glow(colors.gold) },
        iconBadge: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.lg,
        },
        title: { ...typography.title, fontSize: 20, color: '#fff', textAlign: 'center', marginBottom: spacing.xs },
        subtitle: { ...typography.body, fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 },
        button: { alignSelf: 'stretch' },
      }),
    [colors, radius, spacing, typography, glow]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={requestDismiss}
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
    >
      <View style={styles.backdrop}>
        <LinearGradient
          colors={colors.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <Animated.View
            style={[
              styles.iconBadge,
              {
                transform: [
                  {
                    scale: bounce.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 1.15, 1] }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name={event.icon} size={32} color="#fff" />
          </Animated.View>
          <Text style={styles.title}>{event.title}</Text>
          {event.body ? <Text style={styles.subtitle}>{event.body}</Text> : null}
          <Button label="Keep going" variant="secondary" onPress={requestDismiss} style={styles.button} />
        </LinearGradient>
      </View>
    </Modal>
  );
}
