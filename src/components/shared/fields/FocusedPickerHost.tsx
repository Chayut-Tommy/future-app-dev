/**
 * Nolie Design 5.1 Wave 4 closure — ONE focused picker surface for every
 * date, day-of-month and month/year choice in the Add journey.
 *
 * The device defect this replaces: the bill form expanded its calendar
 * INLINE, beneath whatever the customer was looking at, while the numeric
 * keyboard could still be up — so the calendar landed off-screen and had to
 * be hunted for by scrolling. Recurring income, by contrast, already opened
 * a focused surface with the keyboard gone and the picker fully visible.
 * That is the experience the owner approved, so it becomes canonical.
 *
 * Architecture, and why it is this and not something simpler:
 *
 * - It is NOT a second native `<Modal>`. The Add workspace already owns one,
 *   and a second is the documented app-freeze defect
 *   (`MOTION_HARD_RULES` rule 2). This renders as an absolutely-positioned
 *   overlay INSIDE the sheet that is already presented.
 * - It is NOT `scrollTo` on the underlying form. Scrolling the form to chase
 *   an inline panel is exactly the behaviour being removed: it depends on
 *   layout that may not have settled, it moves content under the customer,
 *   and it cannot guarantee the Done/Cancel row is reachable.
 * - Because the overlay fills the sheet, the picker, its heading and its
 *   actions are visible by construction, from any trigger, at any scroll
 *   position, on any device size — no measurement, no coordinates, no
 *   guessing.
 *
 * A host is mounted once, by `KeyboardSheet`, so every form inside every
 * sheet gets the same surface without wiring anything. Triggers call
 * `useFocusedPicker().open(...)`; the trigger keeps ownership of its own
 * value and of the keyboard sequence, and this owns only presentation,
 * focus and the Done/Cancel contract.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Keyboard, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { Button } from '../Button';
import { MOTION_MS, MOTION_TRAVEL_PT, STANDARD_BEZIER } from '../../../theme/motion';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { resolvePickerEntranceDuration } from './pickerTriggerBehaviour';

export interface FocusedPickerRequest {
  /** The field's own label — becomes the panel heading and the first thing
   * a screen reader hears when the panel opens. */
  title: string;
  /** The picker body. Rendered inside a scrollable area so a 320pt device or
   * 200% Dynamic Type scrolls the PICKER, never the form behind it. */
  render: () => React.ReactNode;
  /** Commit. Called exactly once, only from Done. */
  onDone: () => void;
  /** Restore. Called exactly once, only from Cancel or a backdrop press. */
  onCancel: () => void;
  /** Disable Done while the current draft is not a usable value. */
  doneDisabled?: boolean;
  /** Wave 4 closure — true while the shell is mounted but the keyboard is
   * still leaving. The surface is present (so gestures are suspended and the
   * form is out of the accessibility tree) but not yet interactive, which is
   * what removes the visible gap between the two surfaces. */
  activating?: boolean;
  testID?: string;
}

interface FocusedPickerContextValue {
  open: (request: FocusedPickerRequest) => void;
  close: () => void;
  /** True from the MOMENT of activation — not from full reveal — so the
   * sheet suspends its own drag-to-dismiss for the entire handoff. */
  isOpen: boolean;
  /** Hand the keyboard's own animation duration to the surface, so its
   * entrance runs WITH the keyboard rather than after it. */
  coordinateWithKeyboard: (durationMs?: number) => void;
}

const FocusedPickerContext = createContext<FocusedPickerContextValue | null>(null);

/**
 * Available to any descendant of a `KeyboardSheet`. Returns `null` outside
 * one, which lets a field fall back to rendering nothing rather than
 * crashing a screen that never opted in.
 */
export function useFocusedPicker(): FocusedPickerContextValue | null {
  return useContext(FocusedPickerContext);
}

export function FocusedPickerProvider({
  children,
  onActiveChange,
}: {
  children: React.ReactNode;
  /** Lets the host sheet suspend its own gestures while a picker is up. */
  onActiveChange?: (active: boolean) => void;
}) {
  const { colors, radius, semantic, spacing, typography } = useTheme();
  const [request, setRequest] = useState<FocusedPickerRequest | null>(null);
  const reduceMotion = useReduceMotion();
  /** Drives the coordinated entrance. 0 = fully out, 1 = settled. */
  const entrance = useRef(new Animated.Value(0)).current;
  const keyboardDurationRef = useRef<number | undefined>(undefined);
  const headingRef = useRef<Text>(null);
  /** Whoever was focused when the picker opened, so focus can go back. */
  const returnFocusRef = useRef<number | null>(null);

  const open = useCallback((next: FocusedPickerRequest) => {
    returnFocusRef.current = null;
    setRequest(next);
  }, []);

  const close = useCallback(() => setRequest(null), []);

  const coordinateWithKeyboard = useCallback((durationMs?: number) => {
    keyboardDurationRef.current = durationMs;
    // iOS exposes the keyboard's own layout animation; matching it is what
    // makes the two surfaces read as ONE transition. A platform without it
    // simply falls through to the token-driven entrance below.
    if (Platform.OS !== 'ios' || !durationMs || reduceMotion) return;
    if (typeof Keyboard.scheduleLayoutAnimation !== 'function') return;
    try {
      Keyboard.scheduleLayoutAnimation({ duration: durationMs, easing: 'keyboard', endCoordinates: undefined } as never);
    } catch {
      // Purely an entrance nicety. If the platform rejects the event shape
      // it must never stop the picker from opening — the reveal below is
      // state-driven and does not depend on this having run.
    }
  }, [reduceMotion]);

  useEffect(() => {
    onActiveChange?.(request !== null);
  }, [request, onActiveChange]);

  // Accessibility focus lands on the heading once the picker is genuinely
  // interactive — not while it is still activating behind a leaving
  // keyboard. State-driven, never gated on an animation having run (motion
  // hard rule 5), and announced exactly once per opening.
  const announcedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || request.activating) return;
    const node = findNodeHandle(headingRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
    if (announcedForRef.current === request.title) return;
    announcedForRef.current = request.title;
    AccessibilityInfo.announceForAccessibility(`${request.title} opened`);
  }, [request]);

  useEffect(() => {
    if (!request) {
      entrance.setValue(0);
      keyboardDurationRef.current = undefined;
      announcedForRef.current = null;
      return;
    }
    const duration = resolvePickerEntranceDuration({
      keyboardDurationMs: keyboardDurationRef.current,
      fallbackMs: MOTION_MS.sheetInfoIn,
      reduceMotion,
    });
    // Reduced Motion is an immediate state change — no animation to wait on.
    if (duration === 0) {
      entrance.setValue(request.activating ? 0 : 1);
      return;
    }
    Animated.timing(entrance, {
      toValue: request.activating ? 0 : 1,
      duration,
      // The Design 5.1 standard curve — not an invented easing.
      easing: Easing.bezier(...STANDARD_BEZIER),
      useNativeDriver: true,
    }).start();
  }, [request, entrance, reduceMotion]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: semantic.scrim,
          justifyContent: 'flex-end',
        },
        panel: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.lg,
          maxHeight: '90%',
        },
        heading: { ...typography.heading, fontSize: 17, color: colors.textPrimary, marginBottom: spacing.md },
        body: { flexGrow: 0 },
        actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
        action: { flex: 1 },
      }),
    [colors, radius, semantic, spacing, typography]
  );

  const value = useMemo<FocusedPickerContextValue>(
    () => ({ open, close, isOpen: request !== null, coordinateWithKeyboard }),
    [open, close, request, coordinateWithKeyboard]
  );

  function finish(commit: boolean) {
    const active = request;
    setRequest(null);
    if (!active) return;
    // Exactly one of the two, exactly once.
    if (commit) active.onDone();
    else active.onCancel();
    const node = returnFocusRef.current;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }

  return (
    <FocusedPickerContext.Provider value={value}>
      {children}
      {request ? (
        <Animated.View
          style={[styles.overlay, { opacity: entrance }]}
          testID={request.testID ? `${request.testID}-surface` : 'focused-picker-surface'}
          // The overlay owns the screen from the MOMENT of activation:
          // nothing behind it is reachable, so the form cannot scroll or be
          // dismissed at any point during the handoff.
          accessibilityViewIsModal
          // Inert while the keyboard is still leaving — the shell holds the
          // space so there is no visible gap, but a stray touch landing
          // mid-transition can never hit Done or Cancel.
          pointerEvents={request.activating ? 'none' : 'auto'}
        >
          <Animated.View
            style={[
              styles.panel,
              {
                transform: [
                  {
                    translateY: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [MOTION_TRAVEL_PT.trayRise, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text ref={headingRef} style={styles.heading} accessibilityRole="header">
              {request.title}
            </Text>
            {/* The PICKER scrolls if it must — never the form behind it. */}
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {request.render()}
            </ScrollView>
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => finish(false)}
                style={styles.action}
                testID={request.testID ? `${request.testID}-cancel` : undefined}
              />
              <Button
                label="Done"
                onPress={() => finish(true)}
                disabled={request.doneDisabled}
                style={styles.action}
                testID={request.testID ? `${request.testID}-done` : undefined}
              />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </FocusedPickerContext.Provider>
  );
}
