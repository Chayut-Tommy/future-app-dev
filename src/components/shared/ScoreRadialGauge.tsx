import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { ScoreGaugePresentation } from '../../lib/calculations/scoreGaugePresentation';

/**
 * Pass 2C correction — a small, reusable, purely presentational radial
 * gauge for the authoritative 0-100 Navilo Score. Restores the circular
 * `81/100` visual anchor the physical-device review asked for, without
 * duplicating any score calculation: every prop here is a value the
 * caller already computed from the existing computeLuluScore /
 * selectScoreChipPresentation contract — this component only draws it.
 *
 * Deliberately static (no Animated.Value, no useEffect, no mount
 * animation) — this round's instruction is explicit that Score motion
 * belongs to a later pass, not this correction. `CircularScore.tsx`
 * (the older, animated ring) and `ScoreRing.tsx` (no locked/unavailable
 * handling) were both considered and rejected for this reason — this is a
 * new component specifically because neither existing one fit both
 * constraints (no animation, safe unavailable state) at once.
 *
 * Pass 2C physical-device correction #2 — a follow-up review correctly
 * flagged that the original version of this component CLAMPED an
 * out-of-range/non-finite score into [0,100] whenever `authoritative` was
 * true, which would have silently turned e.g. 9999 into a fabricated
 * "100/100" and -5 into a fabricated "0/100" — real, plausible-looking
 * financial progress the customer never actually reached. Clamping is not
 * a safe unavailable-state treatment; only an explicit validity check is.
 *
 * `toScoreGaugePresentation` is the one place that validity check lives —
 * a small, pure, presentation-boundary guard (NOT a second score engine:
 * it computes nothing about the score itself, it only classifies an
 * already-computed value as safe-to-display or not). A value only ever
 * reaches the 'available' branch when it is a genuine, real, in-range
 * score; every other case (including a merely-non-authoritative locked/
 * unavailable score, and now also an authoritative-but-invalid one) maps
 * to the exact same 'unavailable' branch — never clamped, never rendered
 * as a number.
 *
 * Hidden from assistive technology entirely (both the ring and the score
 * text) — the caller supplies one combined, logical VoiceOver label (e.g.
 * "Navilo Score 81 out of 100, based on what you've recorded") on the
 * tappable container this gauge sits inside, so a screen reader never
 * announces the numeral a second time on its own. That label is itself
 * derived from the same `toScoreGaugePresentation` result the gauge
 * renders from, so the announced number and the drawn number can never
 * diverge.
 */
export function ScoreRadialGauge({
  presentation,
  ringColor,
  trackColor,
  size = 92,
  strokeWidth = 9,
}: {
  presentation: ScoreGaugePresentation;
  /** The selected central colour style's accent — never a raw hex literal
   * passed in by a caller; see palettes.ts's naviloPalette. */
  ringColor: string;
  /** A restrained neutral track — colors.surfaceMuted by convention. */
  trackColor: string;
  size?: number;
  strokeWidth?: number;
}) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // No clamping anywhere below — presentation.value is only ever reached
  // through toScoreGaugePresentation's explicit finite/in-range check, so
  // it is already guaranteed safe to draw and round as-is.
  const dashOffset = presentation.state === 'available' ? circumference * (1 - presentation.value / 100) : circumference;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        valueRow: { position: 'absolute', alignItems: 'center' },
        value: { fontSize: size * 0.28, fontWeight: '800', color: colors.textPrimary },
        max: { fontSize: size * 0.11, color: colors.textSecondary, marginTop: -2 },
      }),
    [colors, size]
  );

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {presentation.state === 'available' ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
      </Svg>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{presentation.state === 'available' ? Math.round(presentation.value) : '—'}</Text>
        <Text style={styles.max}>/ 100</Text>
      </View>
    </View>
  );
}
