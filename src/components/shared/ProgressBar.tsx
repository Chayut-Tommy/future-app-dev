import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function ProgressBar({ progress, color, height = 6 }: { progress: number; color?: string; height?: number }) {
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
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor, height }]} />
    </View>
  );
}
