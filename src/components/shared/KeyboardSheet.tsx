import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

/**
 * Bottom-sheet modal that stays usable when the keyboard is open: the sheet
 * rides up above the keyboard (KeyboardAvoidingView), the field area scrolls
 * independently, and the action buttons (`footer`) are pinned outside the
 * scroll area so Save/Cancel never gets pushed off-screen. Also swipe-down
 * and tap-outside to dismiss (PRD ask: "same behaviour as Talk to Lulu" —
 * mirrors AskLuluSheet's gesture pattern), gated behind a "Discard changes?"
 * confirmation whenever `isDirty` is true.
 */
export function KeyboardSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  isDirty = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** True once the user has changed something from where the sheet opened —
   * gates swipe/tap-outside dismissal behind a confirmation. */
  isDirty?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors, radius, spacing, typography } = useTheme();
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

  function requestClose() {
    confirmDiscardIfDirty(isDirty, dismiss);
  }

  function springBack() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          if (isDirty) {
            springBack();
            requestClose();
          } else {
            dismiss();
          }
        } else {
          springBack();
        }
      },
      // If responder ownership is revoked mid-drag (e.g. the ScrollView
      // reclaims it during a rapid direction change) rather than released
      // cleanly, onPanResponderRelease never fires — without this, translateY
      // stays wherever onPanResponderMove last left it, stranding the sheet
      // (and its footer, since both are inside the same transformed view)
      // below its intended position (regression-protection review: rapid
      // up/down swiping reported leaving Cancel/Save unreachable).
      onPanResponderTerminate: () => springBack(),
    })
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(10,12,20,0.45)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          maxHeight: '85%',
        },
        grabber: {
          alignSelf: 'center',
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          marginBottom: spacing.md,
        },
        title: {
          ...typography.heading,
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        scrollArea: {
          flexGrow: 0,
        },
        footer: {
          flexDirection: 'row',
          gap: spacing.md,
          paddingTop: spacing.md,
        },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={requestClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={requestClose} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scrollArea}>
            {children}
          </ScrollView>
          <View style={styles.footer}>{footer}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
