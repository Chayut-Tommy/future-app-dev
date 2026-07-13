import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { InfoSheet } from '../shared/InfoSheet';
import { LearningCard } from '../../lib/learningCards';

/**
 * Cards create curiosity, detail appears on tap (PRD ask: Duolingo
 * simplicity, not a bank education website). The collapsed state is one
 * title + one short hook line; the full explanation only renders once
 * tapped.
 */
export function LearningCardItem({ card, onOpen }: { card: LearningCard; onOpen?: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const [visible, setVisible] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        hook: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        body: { ...typography.body, fontSize: 14, color: colors.textPrimary, lineHeight: 21, marginBottom: spacing.sm },
        readTime: { ...typography.micro, color: colors.textMuted },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          setVisible(true);
          onOpen?.();
        }}
      >
        <SectionCard>
          <View style={styles.row}>
            <View style={styles.textBlock}>
              <Text style={styles.title}>{card.title}</Text>
              <Text style={styles.hook}>{card.hook}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </SectionCard>
      </TouchableOpacity>
      <InfoSheet visible={visible} onClose={() => setVisible(false)} title={card.title}>
        <Text style={styles.body}>{card.body}</Text>
        <Text style={styles.readTime}>{card.readMinutes} min read</Text>
      </InfoSheet>
    </>
  );
}
