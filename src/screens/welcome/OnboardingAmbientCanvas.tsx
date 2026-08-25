import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';

/**
 * Wave 9c visual correction — the "Light Ocean Aurora": the ONE onboarding
 * shell every one of the seven states renders inside.
 *
 * WHY THE RETUNE. The first shell painted with `colors.accentSoft`
 * (#E1F5EA — pale MINT, from the legacy green accent family) and drifted
 * at 24-32s. On device it read as a near-white/mint page with no
 * perceptible motion — structurally present, experientially absent.
 *
 * THE TOKEN SOURCE. Design 5.1's own style-scoped roles are built for
 * exactly this: `semantic.ambient` is the theme's ordered pastel triple
 * (Ocean light: sky blue #DCE9F8 → aqua #E7F2F5 → off-white canvas), and
 * the scope rules in semanticTokens.ts explicitly list "onboarding
 * backdrop" among what style may retint. `semantic.featured` carries the
 * strong style pair (Ocean: real blues) and `semantic.info` the
 * periwinkle accent. Purple and Sunrise retint automatically — no raw
 * colour literal exists here, and nothing green stands in for Ocean.
 *
 * THE COMPOSITION. The ambient triple paints the full-screen base;
 * three broad aurora fields lie over it — each a full-bleed LinearGradient
 * rotated a few degrees and oversized far past every edge, so the ONLY
 * visible transitions are gradient interpolation: no rectangle, pill or
 * placeholder shape can exist.
 *
 * MOTION. Only the welcome state passes `animated`: 14/17/20-second
 * linear native-driver loops with ~180-220pt of horizontal travel —
 * perceptible within a couple of seconds of ordinary viewing, still far
 * from attention-grabbing. Every other state renders the SAME composition
 * statically, and under Reduced Motion no loop is ever created. Loops stop
 * and reset on unmount or prop change. No video, Lottie, raster asset,
 * timer or new dependency.
 *
 * The decorative layer is pointerEvents:none and hidden from
 * accessibility; it can never intercept a touch or enter VoiceOver order.
 */
export function OnboardingAmbientCanvas({ animated = false, children }: { animated?: boolean; children: React.ReactNode }) {
  const { semantic } = useTheme();
  const reduceMotion = useReduceMotion();
  const drifts = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    if (!animated || reduceMotion) return;
    const durations = [14000, 17000, 20000];
    const loops = drifts.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: durations[i], easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: durations[i], easing: Easing.linear, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      drifts.forEach((v) => v.setValue(0));
    };
  }, [animated, reduceMotion, drifts]);

  // Each aurora field pairs one strong style colour with a pastel ambient
  // stop, so the band resolves INTO the base rather than sitting on it.
  // Travel stays well inside the overflow margin, so an edge can never
  // enter the viewport mid-loop.
  const fieldSpecs = [
    { colors: [semantic.featured[0], semantic.ambient[1]] as const, rotate: '-11deg', opacity: 0.22, range: [-110, 100] },
    { colors: [semantic.info, semantic.ambient[0]] as const, rotate: '7deg', opacity: 0.16, range: [90, -120] },
    { colors: [semantic.featured[1], semantic.ambient[2]] as const, rotate: '-5deg', opacity: 0.12, range: [-80, 110] },
  ] as const;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[semantic.ambient[0], semantic.ambient[1], semantic.ambient[2]] as const}
        locations={[0, 0.45, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="onboarding-ambient-canvas"
      >
        {fieldSpecs.map((spec, i) => (
          <Animated.View
            key={i}
            style={[
              styles.field,
              {
                opacity: spec.opacity,
                transform: [
                  { translateX: drifts[i].interpolate({ inputRange: [0, 1], outputRange: [spec.range[0], spec.range[1]] }) },
                  { rotate: spec.rotate },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={spec.colors as unknown as readonly [string, string]}
              start={{ x: 0, y: 0.2 + i * 0.2 }}
              end={{ x: 1, y: 0.55 + i * 0.12 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Oversized far past every edge: rotation and drift can never bring a
  // boundary into view, so the field has no visible outline by construction.
  field: { position: 'absolute', top: '-25%', left: '-45%', width: '190%', height: '150%' },
});
