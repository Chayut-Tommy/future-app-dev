import React, { useMemo } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export function SectionCard({ style, children, ...rest }: ViewProps) {
  const { colors, radius, spacing, cardShadow } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.lg,
          marginBottom: spacing.md,
          ...cardShadow,
        },
      }),
    [colors, radius, spacing, cardShadow]
  );

  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}
