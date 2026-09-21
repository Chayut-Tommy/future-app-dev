import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { sheetChromeStyles } from './sheetChrome';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Generic bottom-sheet for short "here's how this works" explanations —
 * reused anywhere Lulu needs to be transparent about a calculation without
 * building a bespoke modal each time (net worth history, projection
 * assumptions, etc).
 *
 * Pass C.2 closure — typography now resolves through the Design 5.1 role
 * authority (`typeStyle` → bundled Figtree/Noto faces at supported weights)
 * and semantic ink tokens, matching the refreshed Money hero and Why sheet.
 * Previously the title/subtitle/close used the pre-5.1 `typography.*` legacy
 * roles with ad-hoc sizes and a synthetic fontWeight — the "old typography"
 * the 17 September recordings show on "How this was calculated". Every
 * InfoSheet consumer inherits this correction (shared primitive, not a
 * screen-local restyle). Native controls keep the platform font.
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
  const { colors, semantic, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

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
        title: { ...typeStyle('titleSection', locale), color: semantic.textPrimary, marginBottom: 2 },
        subtitle: { ...typeStyle('support', locale), color: semantic.textSecondary, marginBottom: spacing.lg },
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
        closeText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
      }),
    [colors, semantic, radius, spacing, insets.bottom, locale]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, styles.sheetCap]}>
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.8}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} maxFontSizeMultiplier={2}>
              {subtitle}
            </Text>
          ) : null}
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
