/**
 * Nolie Design 5.1 Wave 4 closure — the shared trigger row that opens the
 * one focused picker surface.
 *
 * Every date, day-of-month and month/year field in the Add journey renders
 * this exact row and follows this exact sequence, so the bill, the recurring
 * income, the transaction, the loan repayment, the credit-card due day and
 * the goal target all behave identically:
 *
 *   1. tapped while a keyboard is up  -> dismiss it, defer the reveal;
 *   2. reveal on the real keyboardDidHide event, never on a timer;
 *   3. tapped with no keyboard up     -> reveal in the same commit;
 *   4. the picker opens as a focused surface over the whole sheet, so it is
 *      fully visible without the customer scrolling the form;
 *   5. Cancel restores the value the picker opened with;
 *   6. Done commits exactly once;
 *   7. focus moves to the picker heading and returns here on close.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { FieldShell } from './FieldShell';
import { AddIcon } from '../AddIcon';
import { iconSpec } from '../../../lib/addIcons';
import { useFocusedPicker } from './FocusedPickerHost';
import { decidePickerReveal, PickerRevealPhase, shouldConsumeKeyboardEvent } from './pickerTriggerBehaviour';

/** Minimum height of a picker trigger row. */
export const PICKER_TRIGGER_MIN_HEIGHT = 52;

export function FocusedPickerTrigger<T>({
  label,
  /** What the collapsed row shows on its first line. */
  primary,
  /** The optional clarifying second line. */
  secondary,
  /** True when nothing has been chosen yet — greys the primary line. */
  unset = false,
  /** The value the picker starts from, and restores to on Cancel. */
  value,
  onCommit,
  /** Renders the picker body, given the live draft and a setter. */
  renderPicker,
  isDoneDisabled,
  message,
  required = false,
  containerStyle,
  testID,
}: {
  label: string;
  primary: string;
  secondary?: string | null;
  unset?: boolean;
  value: T;
  onCommit: (next: T) => void;
  renderPicker: (draft: T, setDraft: (next: T) => void) => React.ReactNode;
  isDoneDisabled?: (draft: T) => boolean;
  message?: string | null;
  required?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const picker = useFocusedPicker();
  /**
   * Wave 4 closure — three phases, not a boolean. `activating` is the new
   * one: the overlay shell is already mounted and the sheet's gestures are
   * already suspended while the keyboard is still leaving, so there is never
   * a frame in which the keyboard has gone and nothing has replaced it.
   */
  const [phase, setPhaseState] = useState<PickerRevealPhase>('idle');
  const phaseRef = useRef<PickerRevealPhase>('idle');
  /**
   * The ref is written SYNCHRONOUSLY, not during render. A keyboard event can
   * arrive in the same tick as the tap that dismissed the keyboard — before
   * React has committed the state update — and the event handler must see the
   * phase the trigger is actually in, or the reveal is silently dropped.
   */
  const setPhase = useCallback((next: PickerRevealPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const open = phase === 'open';
  /** The live draft while the picker is up. Real state, so choosing an
   * option re-renders the surface with the new selection and re-evaluates
   * whether Done should be enabled. */
  const [draft, setDraft] = useState<T>(value);

  // While the picker is open, keep the surface in step with the draft. This
  // is one effect with honest dependencies — the surface is re-described
  // whenever anything it displays changes, and never otherwise.
  useEffect(() => {
    if (phase === 'idle' || !picker) return;
    picker.open({
      // While activating, the shell is mounted but the body is not yet
      // interactive — the host renders it collapsed and expands it in step
      // with the keyboard.
      activating: phase === 'activating',
      title: label,
      testID,
      render: () => renderPicker(draft, setDraft),
      doneDisabled: isDoneDisabled ? isDoneDisabled(draft) : false,
      onDone: () => {
        setPhase('idle');
        onCommit(draft);
      },
      onCancel: () => {
        setPhase('idle');
        // Opening and cancelling can never change the value: the draft is
        // simply reset to whatever the field already held.
        setDraft(value);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draft, label, testID, value]);

  const reveal = useCallback(() => {
    if (!picker) return;
    // Seed the draft from the current value every time, so a previous
    // cancelled session can never leak into a new one.
    setDraft(value);
    setPhase('open');
  }, [picker, value]);

  /**
   * Completion of a pending reveal, driven by the keyboard's OWN events.
   *
   * iOS emits `keyboardWillHide` (carrying the animation duration) and then
   * `keyboardDidHide`; Android emits only the latter. Both are subscribed:
   * the first to arrive completes the reveal, and `shouldConsumeKeyboardEvent`
   * makes the second a no-op, so the picker can never mount, focus or
   * animate twice. There is no timer anywhere in this component.
   */
  useEffect(() => {
    function complete(event?: { duration?: number }) {
      if (!shouldConsumeKeyboardEvent(phaseRef.current)) return;
      // Hand the keyboard's own duration to the host so the picker expands
      // WITH it rather than after it — one coordinated transition.
      picker?.coordinateWithKeyboard(event?.duration);
      reveal();
    }
    const willSub = Keyboard.addListener('keyboardWillHide', complete);
    const didSub = Keyboard.addListener('keyboardDidHide', complete);
    return () => {
      willSub.remove();
      didSub.remove();
    };
  }, [reveal, picker]);

  function handleActivate() {
    const decision = decidePickerReveal({ keyboardVisible: Keyboard.isVisible(), phase: phaseRef.current });
    if (decision === 'close') {
      setPhase('idle');
      picker?.close();
      return;
    }
    if (decision === 'activate-then-coordinate') {
      // Step 1, synchronously on the tap: seed the draft and mount the shell
      // BEFORE dismissing the keyboard. This is the whole correction — the
      // customer never sees a settled, keyboard-less form in between.
      setDraft(value);
      setPhase('activating');
      Keyboard.dismiss();
      return;
    }
    reveal();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        trigger: {
          minHeight: PICKER_TRIGGER_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        icon: { marginRight: spacing.md },
        body: { flex: 1 },
        primary: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
        primaryUnset: { fontWeight: '400', color: colors.textMuted },
        secondary: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
        change: { ...typography.caption, fontWeight: '600', color: colors.accentStrong, marginRight: spacing.sm },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <FieldShell label={label} message={message} required={required} style={containerStyle}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={handleActivate}
        activeOpacity={0.75}
        testID={testID}
        accessibilityRole="button"
        // One announcement: the field, its current value, and what tapping
        // does. Never three separate stops.
        accessibilityLabel={`${label}, ${primary}${secondary ? `, ${secondary}` : ''}`}
        accessibilityHint="Opens the picker"
        accessibilityState={{ expanded: open }}
      >
        <AddIcon icon={iconSpec('calendar-outline', 'amber')} style={styles.icon} />
        <View style={styles.body}>
          <Text style={[styles.primary, unset && styles.primaryUnset]}>{primary}</Text>
          {secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}
        </View>
        <Text style={styles.change}>Change</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </FieldShell>
  );
}
