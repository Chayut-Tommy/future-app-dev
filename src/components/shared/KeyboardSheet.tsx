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
  discardTitle,
  discardMessage,
  gesturesEnabled = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** True once the user has changed something from where the sheet opened —
   * gates swipe/tap-outside dismissal behind a confirmation. */
  isDirty?: boolean;
  /** Optional form-specific "Discard ___?" wording — omit to keep the
   * existing generic "Discard changes?" copy every other caller already
   * uses. */
  discardTitle?: string;
  discardMessage?: string;
  /** False while a child overlay (e.g. DatePickerModal) owns the screen —
   * disables this sheet's own swipe-to-dismiss so a gesture intended for
   * that overlay can never be read as "close the whole form" underneath it
   * (defense-in-depth: a top-level Modal already isolates its own touches
   * from whatever's rendered behind it, but this makes the same guarantee
   * explicit and independently verifiable at this layer too). */
  gesturesEnabled?: boolean;
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
    confirmDiscardIfDirty(isDirty, dismiss, discardTitle, discardMessage);
  }

  function springBack() {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  }

  // PanResponder.create is only ever invoked once, on the first render (its
  // argument is re-evaluated every render, but useRef discards every value
  // after the first) — so every handler closure below is permanently bound
  // to whichever isDirty/discardTitle/discardMessage/gesturesEnabled values
  // happened to be in scope on THAT render, never updated again for the
  // lifetime of this component instance. Reading through refs instead is
  // what makes the gesture always see the current values (regression-
  // protection review: this pre-existing gap already meant AddWealthItemModal's
  // dynamically-computed isDirty could never actually gate its own swipe-to-
  // dismiss correctly; fixed here since it's the exact mechanism this
  // round's draft-protection correction depends on — dismiss/springBack
  // themselves stay safe to call from a stale closure, since they only ever
  // reach a stable Animated.Value ref and the parent's always-stable
  // setState-backed onClose). isDirtyRef.current is read (not the isDirty
  // prop directly) so this stays correct however many times isDirty changes
  // after mount.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const discardTitleRef = useRef(discardTitle);
  discardTitleRef.current = discardTitle;
  const discardMessageRef = useRef(discardMessage);
  discardMessageRef.current = discardMessage;
  const gesturesEnabledRef = useRef(gesturesEnabled);
  gesturesEnabledRef.current = gesturesEnabled;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesturesEnabledRef.current && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          if (isDirtyRef.current) {
            springBack();
            confirmDiscardIfDirty(true, dismiss, discardTitleRef.current, discardMessageRef.current);
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
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={requestClose} disabled={!gesturesEnabled} />
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
