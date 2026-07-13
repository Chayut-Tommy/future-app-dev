import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { ScoreVisualTone } from '../../lib/calculations/luluScore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The Lulu Score as a fuel-gauge-style ring (PRD ask: "Apple Fitness
 * rings," not a wordy paragraph). Fills from 0 on mount/score-change —
 * strokeDashoffset isn't eligible for the native driver in react-native-svg,
 * so this animation runs on the JS thread (fine for a single ring, once per
 * screen focus, not a scroll-driven animation).
 */
export function CircularScore({
  score,
  locked,
  tone,
  size = 116,
  strokeWidth = 10,
  trackColor,
  textColor,
}: {
  score: number;
  locked: boolean;
  tone: ScoreVisualTone;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  textColor?: string;
}) {
  const { colors, glow } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: locked ? 0 : score,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score, locked, animatedValue]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        !locked && tone === 'gold' ? glow(colors.gold) : null,
      ]}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? colors.surfaceMuted} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={locked ? (trackColor ?? colors.surfaceMuted) : colors[tone]}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Animated.Text style={{ fontSize: size * 0.26, fontWeight: '800', color: textColor ?? colors.textPrimary }}>
          {locked ? '—' : score}
        </Animated.Text>
        <Animated.Text style={{ fontSize: size * 0.1, color: textColor ?? colors.textSecondary, opacity: 0.85 }}>/ 100</Animated.Text>
      </View>
    </View>
  );
}
