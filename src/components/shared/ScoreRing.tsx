import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

export function ScoreRing({ score, size = 96, color }: { score: number; size?: number; color?: string }) {
  const { colors } = useTheme();
  const ringColor = color ?? colors.accent;
  const strokeWidth = Math.max(6, Math.round(size * 0.075));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scoreText: {
          fontWeight: '700',
          color: colors.textPrimary,
        },
        maxText: {
          fontSize: 11,
          color: colors.textSecondary,
          marginTop: -2,
        },
      }),
    [colors]
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceMuted}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
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
          <Text style={[styles.scoreText, { fontSize: size * 0.24 }]}>{Math.round(score)}</Text>
          <Text style={styles.maxText}>/ 100</Text>
        </View>
      </View>
    </View>
  );
}
