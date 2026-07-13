import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { FutureYouPreview } from '../../lib/calculations/futureYouPreview';

function formatMoney(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * "Future You 🔮" — an emotional reframe of the Compound Calculator (PRD
 * ask: "make users imagine outcomes," not present a generic finance tool).
 * Uses the user's own real monthly surplus when Lulu has it; otherwise a
 * clearly-labelled illustrative scenario.
 */
export function FutureYouCard({ preview, onAdjust }: { preview: FutureYouPreview; onAdjust: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
        row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        block: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, alignItems: 'center' },
        blockLabel: { ...typography.micro, color: colors.textSecondary, marginBottom: 2 },
        blockValue: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        button: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md },
        buttonText: { ...typography.caption, fontSize: 13, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <SectionCard>
      <Text style={styles.title}>Future You 🔮</Text>
      <Text style={styles.subtitle}>
        {preview.isIllustrative
          ? `If you invested $${preview.monthlyContribution}/month (illustrative):`
          : `If you keep investing your real monthly surplus, $${Math.round(preview.monthlyContribution).toLocaleString()}/month:`}
      </Text>
      <View style={styles.row}>
        {preview.points.map((p) => (
          <View key={p.yearsAhead} style={styles.block}>
            <Text style={styles.blockLabel}>{p.age ? `Age ${p.age}` : `In ${p.yearsAhead} yrs`}</Text>
            <Text style={styles.blockValue}>{formatMoney(p.futureValue)}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={onAdjust}>
        <Text style={styles.buttonText}>Adjust your future →</Text>
      </TouchableOpacity>
    </SectionCard>
  );
}
