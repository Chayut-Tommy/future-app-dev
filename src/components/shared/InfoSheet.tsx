import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { sheetChromeStyles } from './sheetChrome';

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
  const { colors, semantic, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Design 5.1 Wave 4 — backdrop/sheet/grabber now come from the one
        // shared definition in sheetChrome.ts. This sheet's own additions
        // (a scroll cap, and its own bottom padding supplied by the close
        // row below rather than the sheet) are layered on top.
        ...sheetChromeStyles({
          surface: colors.surface,
          scrim: semantic.scrim,
          grabber: colors.borderStrong,
          radiusCard: radius.card,
          spacingSm: spacing.sm,
          spacingMd: spacing.md,
          spacingLg: spacing.lg,
          insetBottom: 0,
        }),
        sheetCap: { maxHeight: '80%', paddingBottom: 0 },
        title: { ...typography.heading, fontSize: 18, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg },
        // Wave 6 correction E — an explicit 44pt activation area rather
        // than one that happened to fall out of padding plus line height,
        // and the interactive role rather than muted secondary ink: Close
        // is a real, findable action, not a caption. Deliberately still
        // text-only — no heavy button chrome on a dismissal.
        closeButton: {
          alignSelf: 'center',
          minHeight: 44,
          justifyContent: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          marginBottom: Math.max(insets.bottom, spacing.md),
        },
        closeText: { color: semantic.interactive, fontWeight: '600' },
      }),
    [colors, semantic, radius, spacing, typography, insets.bottom]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, styles.sheetCap]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
