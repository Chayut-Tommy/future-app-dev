import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

export function GoalProgressRing({ progress, size = 96 }: { progress: number; size?: number }) {
  const { colors } = useTheme();
  const strokeWidth = Math.max(6, Math.round(size * 0.08));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        text: { fontWeight: '700', color: colors.textPrimary },
      }),
    [colors]
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceMuted} strokeWidth={strokeWidth} fill="none" />
        <Circle
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
          <Text style={[styles.text, { fontSize: size * 0.22 }]}>{Math.round(clamped * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}
