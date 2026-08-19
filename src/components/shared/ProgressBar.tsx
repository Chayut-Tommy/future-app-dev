import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function ProgressBar({
  progress,
  color,
  height = 6,
  accessibilityLabel,
  tone,
}: {
  progress: number;
  color?: string;
  height?: number;
  /** Design 5.1 Wave 4 — ADDITIVE semantic alternative to `color`. An
   * explicit `color` still wins, so every pre-existing caller's fill colour
   * is unchanged. */
  tone?: 'accent' | 'positive' | 'warning' | 'negative';
  /** Pass 2E — omitted by every pre-existing caller (unchanged, byte-
   * identical behaviour: a plain, non-accessible decorative View, since its
   * value is already conveyed by adjacent sibling/parent text). When
   * supplied, this bar becomes its own real accessibilityRole="progressbar"
   * element with a matching accessibilityValue — for the sites where the
   * numeric progress has no other textual representation on screen. */
  accessibilityLabel?: string;
}) {
  const { colors, radius } = useTheme();
  const toneColor =
    tone === 'positive' ? colors.success : tone === 'warning' ? colors.warning : tone === 'negative' ? colors.danger : colors.accent;
  const fillColor = color ?? toneColor;
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
