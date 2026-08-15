import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { RefObject } from 'react';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * the exact "Payment recorded." confirmation copy, previously duplicated
 * identically inside both LoanRepaymentSheet.tsx and
 * CreditCardRepaymentSheet.tsx; now a single shared content component for
 * the `loan_recorded`/`card_recorded` lifecycle states. Purely factual —
 * never implies the lender/card provider's entire obligation is paid.
 *
 * Reminder focus/announcements task — `focusRef` (optional) is where the
 * host (ReminderDetailSheet) moves accessibility focus once this content
 * becomes the presented state; that focus move is itself what announces
 * "Payment recorded." to VoiceOver/TalkBack, so the previous
 * accessibilityLiveRegion="polite" (Android-only, and redundant once focus
 * genuinely lands here) is removed to avoid a duplicate announcement.
 */
export function PaymentRecordedContent({ focusRef }: { focusRef?: RefObject<any> }) {
  const { colors, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        successText: { ...typography.body, fontSize: 15, color: colors.textPrimary, fontWeight: '700', textAlign: 'center', marginVertical: spacing.lg },
      }),
    [colors, spacing, typography]
  );
  return (
    <Text ref={focusRef} style={styles.successText}>
      Payment recorded.
    </Text>
  );
}
