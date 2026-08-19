import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { MOTION_MS } from '../../theme/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Nolie Design 5.1 Wave 4 closure — the goal ring, now with purposeful
 * motion.
 *
 * Recording progress used to snap the ring to its new value, which read as
 * abrupt for what is one of the few genuinely rewarding moments in the app.
 * The ring now travels from the previous percentage to the new one.
 *
 * Three rules the motion obeys, because motion here is feedback and never
 * control (`MOTION_HARD_RULES` rule 5):
 *
 *  - the DISPLAYED percentage, the accessible label and every action are
 *    state-driven and correct from the first frame; nothing waits on an
 *    animation callback;
 *  - the animation runs only for a genuine change in this session — a
 *    re-render from scrolling, a theme change, an unrelated metadata edit
 *    or reopening an unchanged goal moves nothing;
 *  - Reduced Motion resolves it to zero duration, so the final state simply
 *    appears.
 */
export function GoalProgressRing({
  progress,
  size = 96,
  /** A completion crossing gets a slightly longer travel than an ordinary
   * update, because it is a bigger moment. Presentation only. */
  isCompletion = false,
}: {
  progress: number;
  size?: number;
  isCompletion?: boolean;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const strokeWidth = Math.max(6, Math.round(size * 0.08));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  /** Starts AT the first value it is given, so a goal opened from history
   * renders its stable final state without animating up from zero. */
  const animated = useRef(new Animated.Value(clamped)).current;
  const previousRef = useRef(clamped);
  /** The percentage shown as text. Kept in state rather than read from the
   * Animated value so it is always exact and always announced correctly,
   * whatever the animation is doing. */
  const [displayed, setDisplayed] = useState(clamped);

  useEffect(() => {
    if (previousRef.current === clamped) return; // no genuine delta — do nothing
    previousRef.current = clamped;
    // The label is correct immediately, before any frame is drawn.
    setDisplayed(clamped);
    if (reduceMotion) {
      animated.setValue(clamped);
      return;
    }
    Animated.timing(animated, {
      toValue: clamped,
      duration: isCompletion ? MOTION_MS.celebration + MOTION_MS.progressFill : MOTION_MS.progressFill + MOTION_MS.figureCrossfade,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is not a native-driver prop.
      useNativeDriver: false,
    }).start();
  }, [clamped, reduceMotion, isCompletion, animated]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        text: { fontWeight: '700', color: colors.textPrimary },
      }),
    [colors]
  );

  const dashOffset = animated.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* The ring is decorative: the percentage and amounts are announced by
          the summary that owns them, so an interpolating stroke never
          becomes a repeatedly-changing accessibility element. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceMuted} strokeWidth={strokeWidth} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.center}>
            <Text style={[styles.text, { fontSize: size * 0.22 }]}>{Math.round(displayed * 100)}%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
