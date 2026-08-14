import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * the exact "Payment recorded." confirmation copy, previously duplicated
 * identically inside both LoanRepaymentSheet.tsx and
 * CreditCardRepaymentSheet.tsx; now a single shared content component for
 * the `loan_recorded`/`card_recorded` lifecycle states. Purely factual —
 * never implies the lender/card provider's entire obligation is paid.
 */
export function PaymentRecordedContent() {
  const { colors, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        successText: { ...typography.body, fontSize: 15, color: colors.textPrimary, fontWeight: '700', textAlign: 'center', marginVertical: spacing.lg },
      }),
    [colors, spacing, typography]
  );
  return (
    <Text style={styles.successText} accessibilityLiveRegion="polite">
      Payment recorded.
    </Text>
  );
}
