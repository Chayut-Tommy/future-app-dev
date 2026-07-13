import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Generic bottom-sheet for short "here's how this works" explanations —
 * reused anywhere Lulu needs to be transparent about a calculation without
 * building a bespoke modal each time (net worth history, projection
 * assumptions, etc).
 */
export function InfoSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
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
          maxHeight: '80%',
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
        title: { ...typography.heading, fontSize: 18, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg },
        closeButton: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: Math.max(insets.bottom, spacing.md) },
        closeText: { color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
