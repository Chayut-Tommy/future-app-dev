import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function ProgressBar({
  progress,
  color,
  height = 6,
  accessibilityLabel,
}: {
  progress: number;
  color?: string;
  height?: number;
  /** Pass 2E — omitted by every pre-existing caller (unchanged, byte-
   * identical behaviour: a plain, non-accessible decorative View, since its
   * value is already conveyed by adjacent sibling/parent text). When
   * supplied, this bar becomes its own real accessibilityRole="progressbar"
   * element with a matching accessibilityValue — for the sites where the
   * numeric progress has no other textual representation on screen. */
  accessibilityLabel?: string;
}) {
  const { colors, radius } = useTheme();
  const fillColor = color ?? colors.accent;
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        track: {
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        },
        fill: {
          borderRadius: radius.pill,
        },
      }),
    [colors, radius]
  );

  return (
    <View
      style={[styles.track, { height }]}
      {...(accessibilityLabel
        ? {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel,
            accessibilityValue: { min: 0, max: 100, now: Math.round(pct) },
          }
        : null)}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor, height }]} />
    </View>
  );
}
