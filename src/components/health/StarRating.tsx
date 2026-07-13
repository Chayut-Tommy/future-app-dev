import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

export function StarRating({ score, max }: { score: number; max: number }) {
  const { colors } = useTheme();
  const filled = Math.round((score / max) * 5);

  const styles = useMemo(() => StyleSheet.create({ row: { flexDirection: 'row', gap: 2 } }), []);

  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < filled ? 'star' : 'star-outline'} size={14} color={colors.gold} />
      ))}
    </View>
  );
}
