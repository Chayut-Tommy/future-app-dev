import React, { useMemo } from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { CreditCard } from '../../types/models';
import { CreditCardRepaymentFormBundle } from '../../hooks/useCreditCardRepaymentForm';

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Distinct nativeID from the loan form's own — see
 * useCreditCardRepaymentForm.ts's own sibling doc comment (unchanged this
 * round, relocated verbatim from the former CreditCardRepaymentSheet.tsx). */
const DONE_ACCESSORY_ID = 'creditCardRepaymentDoneAccessory';

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * pure presentational content, the exact scrollable body the former
 * CreditCardRepaymentSheet.tsx rendered inside its own KeyboardSheet, now
 * rendered as ReminderDetailSheet's own children for the `card_form`
 * lifecycle state. See LoanRepaymentFormFields.tsx's own doc comment for
 * the identical sibling rationale.
 */
export function CreditCardRepaymentFormFields({ card, form }: { card: CreditCard; form: CreditCardRepaymentFormBundle }) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
        factRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
        factLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        factValue: { ...typography.body, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: spacing.md },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        input: {
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          fontSize: 16,
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        sourceChip: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        sourceChipActive: { backgroundColor: colors.accent },
        sourceChipText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
        sourceChipTextActive: { color: colors.onAccent },
        disclosure: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.md },
        errorText: { ...typography.caption, fontSize: 12, color: colors.warning, marginBottom: spacing.md },
        accessoryBar: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.surfaceMuted,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderStrong,
        },
        accessoryDoneButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
        accessoryDoneText: { ...typography.body, fontSize: 15, color: colors.accent, fontWeight: '700' },
        warningBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        warningText: { ...typography.caption, fontSize: 12, color: colors.warning, lineHeight: 16 },
      }),
    [colors, radius, spacing, typography]
  );

  const doneAccessory =
    Platform.OS === 'ios' ? (
      <InputAccessoryView nativeID={DONE_ACCESSORY_ID}>
        <View style={styles.accessoryBar}>
          <TouchableOpacity style={styles.accessoryDoneButton} onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.accessoryDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </InputAccessoryView>
    ) : null;

  return (
    <>
      <Text style={styles.subtitle}>{card.label}</Text>

      <View style={styles.factRow}>
        <Text style={styles.factLabel}>Current recorded balance</Text>
        <Text style={styles.factValue}>{formatMoney(card.currentBalance)}</Text>
      </View>
      <View style={styles.factRow}>
        <Text style={styles.factLabel}>Due date</Text>
        <Text style={styles.factValue}>{form.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
      </View>
      {card.minimumPayment > 0 ? (
        <View style={styles.factRow}>
          <Text style={styles.factLabel}>Recorded minimum payment</Text>
          <Text style={styles.factValue}>{formatMoney(card.minimumPayment)}</Text>
        </View>
      ) : null}
      {card.expectedMonthlyRepayment ? (
        <View style={styles.factRow}>
          <Text style={styles.factLabel}>Your expected monthly payment</Text>
          <Text style={styles.factValue}>{formatMoney(card.expectedMonthlyRepayment)}</Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.label}>How much did you pay?</Text>
      <TextInput
        style={styles.input}
        value={form.amountText}
        onChangeText={form.setAmountText}
        placeholder="$0.00"
        keyboardType="decimal-pad"
        editable={!form.isSubmitting}
        inputAccessoryViewID={Platform.OS === 'ios' ? DONE_ACCESSORY_ID : undefined}
      />
      {form.exceedsBalance ? (
        <Text style={styles.errorText}>{`That's more than the current recorded balance (${formatMoney(card.currentBalance)}).`}</Text>
      ) : null}

      <Text style={styles.label}>Which account did you pay from?</Text>
      {form.eligibleSources.length === 0 ? (
        <Text style={styles.disclosure}>Add a Cash or Everyday balance in Navilo first to record a payment.</Text>
      ) : (
        <View style={styles.sourceRow}>
          {form.eligibleSources.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sourceChip, form.source?.id === s.id ? styles.sourceChipActive : null]}
              onPress={() => form.setSource(s)}
              disabled={form.isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ selected: form.source?.id === s.id }}
            >
              <Text style={[styles.sourceChipText, form.source?.id === s.id ? styles.sourceChipTextActive : null]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {form.validatedAmount.valid && form.source && !form.exceedsBalance ? (
        <Text style={styles.disclosure}>
          {`Confirming will record ${formatMoney(form.validatedAmount.cents / 100)} as a repayment, reduce ${
            form.source.label
          }, and reduce what you owe on ${card.label} by the same amount. This updates Navilo only — it does not move money in your bank.`}
        </Text>
      ) : null}

      {form.needsBelowMinimumAck ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            This is below the minimum payment recorded in Navilo. Recording it does not confirm that you have met your card provider's
            requirements.
          </Text>
        </View>
      ) : null}

      {form.errorText ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {form.errorText}
        </Text>
      ) : null}

      {doneAccessory}
    </>
  );
}
