import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { InfoSheet } from './InfoSheet';
import { brand } from '../../lib/brand';

const FULL_EXPLANATION = `${brand.name} provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.`;

/**
 * A concise, consistent disclosure line wherever the app discusses
 * investing, debt repayment, credit cards, retirement, property, future
 * projections, or product comparisons — never a large disclaimer block
 * under every ordinary message (PRD ask, §6C). Tapping the info icon
 * expands to the fuller explanation, reusing the same wording as the
 * onboarding disclosure and Settings → About and legal, so this is one
 * disclosure, said the same way everywhere, not a dozen slightly different
 * ones.
 */
export function EducationalNote({ text = 'Educational scenario only — not personal financial advice.' }: { text?: string }) {
  const { colors, spacing, typography } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
        text: { ...typography.micro, fontSize: 10, color: colors.textMuted, flex: 1, lineHeight: 14 },
      }),
    [colors, spacing, typography]
  );

  return (
    <>
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setExpanded(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
        <Text style={styles.text}>{text}</Text>
      </TouchableOpacity>
      <InfoSheet visible={expanded} onClose={() => setExpanded(false)} title="Educational information only">
        <Text style={{ ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 21 }}>{FULL_EXPLANATION}</Text>
      </InfoSheet>
    </>
  );
}
