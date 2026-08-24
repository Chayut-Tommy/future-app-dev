import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { LiabilityType } from '../../types/models';
import { brand } from '../../lib/brand';

const REMINDER_AFTER_DAYS = 90;

const LOAN_COPY: Partial<Record<LiabilityType, { emoji: string; label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  mortgage: { emoji: '🏠', label: 'mortgage', icon: 'home' },
  car_loan: { emoji: '🚗', label: 'car loan', icon: 'car' },
  personal_loan: { emoji: '💳', label: 'personal loan', icon: 'document-text' },
};

/**
 * A loan balance drifts from the recurring repayment amount alone
 * (interest, extra payments) — a gentle nudge a few months in keeps
 * Lulu's wealth picture accurate, never a blocking modal (PRD ask).
 * Covers every loan type the smart-add flow supports, not just mortgages.
 */
export function LoanBalanceReminderCard() {
  const { data, updateLiability } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  // Wave 9b closure — tokens.typography carries no fontFamily, so every
  // reminder string rendered in the platform font. Resolve the shipped role.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [modalVisible, setModalVisible] = useState(false);

  const loan = data.liabilities.find(
    (l) =>
      l.type in LOAN_COPY &&
      l.createdAt &&
      !l.balanceReminderDismissed &&
      (Date.now() - new Date(l.createdAt).getTime()) / 86400000 >= REMINDER_AFTER_DAYS
  );
  const copy = loan ? LOAN_COPY[loan.type] : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.navySoft,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        iconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typeStyle('titleCard', locale), fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
        body: { ...typeStyle('meta', locale), fontSize: 12, color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.sm },
        button: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
        buttonText: { ...typeStyle('labelTab', locale), fontSize: 11, color: colors.textPrimary, fontWeight: '700' },
        dismissButton: { padding: 4 },
      }),
    [colors, radius, spacing, typography, locale]
  );

  if (!loan || !copy) return null;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name={copy.icon} size={18} color={colors.textPrimary} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {copy.emoji} You've been paying your {copy.label} for a few months
          </Text>
          <Text style={styles.body}>Want to update your remaining loan balance so {brand.name}'s wealth picture stays accurate?</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setModalVisible(true)}
            hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Update balance"
          >
            <Text style={styles.buttonText}>Update balance</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => updateLiability(loan.id, { balanceReminderDismissed: true })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss loan balance reminder"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} importantForAccessibility="no" />
        </TouchableOpacity>
      </View>
      <AddWealthItemModal
        visible={modalVisible}
        kind="liability"
        editLiability={loan}
        onClose={() => {
          setModalVisible(false);
          updateLiability(loan.id, { balanceReminderDismissed: true });
        }}
      />
    </>
  );
}
