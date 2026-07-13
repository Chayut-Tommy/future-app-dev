import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Achievement } from '../../lib/calculations/achievements';
import { Button } from '../shared/Button';

/**
 * Celebrates a newly unlocked "Your Journey" milestone the moment it
 * happens, instead of leaving it as a passive checkmark in a list (PRD ask:
 * Lulu should feel alive — "You did it. First $10k saved 🎉"). Shown once
 * per achievement (TodayScreen tracks `seenAchievementIds`).
 */
export function AchievementCelebrationSheet({ achievement, onClose }: { achievement: Achievement | null; onClose: () => void }) {
  const { colors, radius, spacing, typography, glow } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
        card: {
          width: '100%',
          borderRadius: radius.card,
          padding: spacing.xl,
          alignItems: 'center',
          ...glow(colors.gold),
        },
        iconBadge: {
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.lg,
        },
        eyebrow: { ...typography.micro, color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginBottom: spacing.xs, letterSpacing: 1 },
        title: { ...typography.title, fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: spacing.xs },
        subtitle: { ...typography.body, fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 },
        button: { alignSelf: 'stretch' },
      }),
    [colors, radius, spacing, glow, typography, insets.bottom]
  );

  return (
    <Modal visible={!!achievement} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {achievement ? (
          <LinearGradient colors={colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.iconBadge}>
              <Ionicons name={achievement.icon} size={36} color="#fff" />
            </View>
            <Text style={styles.eyebrow}>YOU DID IT</Text>
            <Text style={styles.title}>{achievement.title}</Text>
            <Text style={styles.subtitle}>{achievement.subtitle}</Text>
            <Button label="Keep going" variant="secondary" onPress={onClose} style={styles.button} />
          </LinearGradient>
        ) : null}
      </View>
    </Modal>
  );
}
