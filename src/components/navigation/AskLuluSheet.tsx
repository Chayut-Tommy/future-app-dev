import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { brand } from '../../lib/brand';

const SAMPLE_QUESTIONS = [
  'What can I improve?',
  'Can I afford a holiday?',
  `Why did my ${brand.scoreName} drop?`,
  'How can I save $500/month?',
  'Review my spending.',
  'Help me become financially free.',
];

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

/**
 * Native-feeling bottom sheet: drag down to dismiss, or tap the backdrop
 * (PRD ask — most users expect swipe-down behaviour, Close shouldn't be the
 * only way out).
 */
export function AskLuluSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radius, spacing, typography, aiAccentColor, aiAccentSoft } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
      translateY.setValue(0);
      onClose();
    });
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
        iconBadge: {
          alignSelf: 'center',
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: aiAccentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        },
        title: { ...typography.heading, fontSize: 17, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: spacing.lg },
        chipList: { gap: spacing.sm, marginBottom: spacing.lg },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, flex: 1 },
        badge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'center',
          backgroundColor: aiAccentSoft,
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          borderRadius: radius.pill,
          marginBottom: spacing.md,
        },
        badgeText: { color: aiAccentColor, fontWeight: '700', fontSize: 12 },
        closeButton: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
        closeText: { color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, insets.bottom, aiAccentColor, aiAccentSoft]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          <View style={styles.iconBadge}>
            <Ionicons name="sparkles" size={26} color={aiAccentColor} />
          </View>
          <Text style={styles.title}>Ask {brand.name} anything about your money</Text>
          <Text style={styles.body}>
            Your future self will appreciate this — {brand.name} answers real questions grounded in your actual numbers, not
            generic advice.
          </Text>
          <View style={styles.chipList}>
            {SAMPLE_QUESTIONS.map((q) => (
              <View key={q} style={styles.chip}>
                <Ionicons name="sparkles-outline" size={14} color={aiAccentColor} />
                <Text style={styles.chipText}>{q}</Text>
              </View>
            ))}
          </View>
          <View style={styles.badge}>
            <Ionicons name="lock-closed" size={12} color={aiAccentColor} />
            <Text style={styles.badgeText}>Coming with Premium</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={dismiss}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
