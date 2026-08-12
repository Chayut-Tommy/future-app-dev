import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { SmartReminder } from '../../lib/calculations/reminders';
import { SmartReminderCard } from './SmartReminderCard';

/**
 * Pass 2B correction §1/§2 — the reminder's full detailed experience,
 * reached by tapping the Briefing's compact Reminder tile. Hosts the
 * existing SmartReminderCard exactly as-is (its own SectionCard chrome,
 * unmodified confirm/dismiss/error/persistence behaviour, unmodified
 * account-choice controls) — this file adds no reminder logic of its own,
 * only the Modal presentation around it. This is the "existing detailed
 * reminder experience" the compact tile's tap-through must reach: the
 * account-choice pills that previously overflowed the narrow hero now have
 * this sheet's full width/height to lay out in (plus SmartReminderCard's
 * own flexWrap correction — see that file), never a one-third-width tile.
 */
export function ReminderDetailSheet({ visible, topReminder, onClose }: { visible: boolean; topReminder: SmartReminder | null; onClose: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(insets.bottom, spacing.md),
          maxHeight: '85%',
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
        title: { ...typography.heading, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md },
        closeButton: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
        closeText: { color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Reminder</Text>
          {topReminder ? <SmartReminderCard topReminder={topReminder} /> : null}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
