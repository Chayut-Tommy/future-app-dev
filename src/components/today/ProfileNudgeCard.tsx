import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { EditProfileModal } from '../settings/EditProfileModal';
import { brand } from '../../lib/brand';

/**
 * Gentle, permanently-dismissible nudge — never a blocking modal (PRD ask:
 * avoid aggressive signup, "the more Lulu knows, the better Lulu can
 * help"). Only shown once the user has actually engaged (added a goal,
 * income, or an asset) and their profile is still missing the fields that
 * would let Lulu personalise further.
 */
export function ProfileNudgeCard() {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography, aiAccentColor, aiAccentSoft } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const hasEngaged = data.goals.length > 0 || data.user.monthlyIncome > 0 || data.assets.length > 0;
  const profileIncomplete = !data.user.age || !data.user.moneyGoal;
  const shouldShow = hasEngaged && profileIncomplete && !data.user.profileNudgeDismissed;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: aiAccentSoft,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        iconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 13, color: aiAccentColor, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.sm },
        button: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
        buttonText: { ...typography.micro, fontSize: 11, color: aiAccentColor, fontWeight: '700' },
        dismissButton: { padding: 4 },
      }),
    [colors, radius, spacing, typography, aiAccentColor, aiAccentSoft]
  );

  if (!shouldShow) return null;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name="sparkles" size={18} color={aiAccentColor} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Enjoying {brand.name}? ✨</Text>
          <Text style={styles.body}>Complete your profile so {brand.name} can give you smarter money insights.</Text>
          <TouchableOpacity style={styles.button} onPress={() => setModalVisible(true)}>
            <Text style={styles.buttonText}>Complete profile</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.dismissButton} onPress={() => updateUser({ profileNudgeDismissed: true })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <EditProfileModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}
