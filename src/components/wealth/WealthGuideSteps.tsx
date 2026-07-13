import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';

interface Step {
  label: string;
  done: boolean;
  onPress: () => void;
}

const NODE_SIZE = 32;

/**
 * First-time guidance for the Wealth Map — an empty dashboard is confusing,
 * so walk new users through the 4 inputs that make it come alive instead of
 * just showing a blank chart.
 */
export function WealthGuideSteps({ steps, title = 'Build your Wealth Map' }: { steps: Step[]; title?: string }) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.md },
        row: { flexDirection: 'row' },
        rail: { width: NODE_SIZE, alignItems: 'center' },
        node: {
          width: NODE_SIZE,
          height: NODE_SIZE,
          borderRadius: NODE_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        connector: { width: 2, flex: 1, minHeight: spacing.md },
        textBlock: { flex: 1, paddingLeft: spacing.md, paddingBottom: spacing.lg, justifyContent: 'center' },
        stepLabel: { ...typography.body, fontSize: 14 },
        stepNumber: { ...typography.micro, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <TouchableOpacity key={step.label} activeOpacity={0.7} onPress={step.onPress} disabled={step.done}>
            <View style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.node, { backgroundColor: step.done ? colors.accent : colors.surfaceMuted }]}>
                  {step.done ? (
                    <Ionicons name="checkmark" size={16} color={colors.onAccent} />
                  ) : (
                    <Text style={[styles.stepNumber, { color: colors.textSecondary }]}>{i + 1}</Text>
                  )}
                </View>
                {!isLast ? <View style={[styles.connector, { backgroundColor: step.done ? colors.accent : colors.border }]} /> : null}
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.stepLabel, { color: step.done ? colors.textMuted : colors.textPrimary, textDecorationLine: step.done ? 'line-through' : 'none' }]}>
                  {step.label}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
