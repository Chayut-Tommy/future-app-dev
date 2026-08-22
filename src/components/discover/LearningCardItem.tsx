import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
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
  const { colors, radius, spacing, typography, semantic } = useTheme();
  // Wave 8 correction — the shipped semantic role resolver, so Grow's
  // sections stop being the last surfaces on the legacy scale.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [visible, setVisible] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        textBlock: { flex: 1 },
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 2 },
        hook: { ...typeStyle('support', locale), color: colors.textSecondary },
        body: { ...typeStyle('body', locale), color: colors.textPrimary, lineHeight: 21, marginBottom: spacing.sm },
        readTime: { ...typeStyle('meta', locale), color: colors.textSecondary },
      }),
    [colors, radius, spacing, typography, semantic, locale]
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
