import React, { useMemo } from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Liability, LiabilityType, RecurringItem } from '../../types/models';
import { LoanRepaymentFormBundle } from '../../hooks/useLoanRepaymentForm';

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const LIABILITY_TYPE_LABEL: Record<LiabilityType, string> = {
  mortgage: 'Mortgage',
  car_loan: 'Car loan',
  personal_loan: 'Personal loan',
  other: 'Loan',
  credit_card: 'Credit card',
  bnpl: 'Buy Now, Pay Later',
};

/** Shared-by-reference iOS keyboard accessory bar nativeID — see
 * useLoanRepaymentForm.ts's own sibling doc comment (unchanged this round,
 * relocated verbatim from the former LoanRepaymentSheet.tsx). */
const DONE_ACCESSORY_ID = 'loanRepaymentDoneAccessory';

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * pure presentational content, the exact scrollable body the former
 * LoanRepaymentSheet.tsx rendered inside its own KeyboardSheet, now rendered
 * as ReminderDetailSheet's own children for the `loan_form` lifecycle
 * state. Deliberately owns no Modal, no KeyboardSheet, no footer — those
 * are the single native-Modal owner's (ReminderDetailSheet) responsibility,
 * per this round's Option A structure. Every field, validation display, and
 * disclosure line is byte-for-byte the same copy/layout as before.
 */
export function LoanRepaymentFormFields({
  liability,
  recurringItem,
  form,
}: {
  liability: Liability;
  recurringItem: RecurringItem;
  form: LoanRepaymentFormBundle;
}) {
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
        toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
        toggleLabel: { ...typography.body, fontSize: 13, color: colors.textPrimary, fontWeight: '600', flex: 1, marginRight: spacing.sm },
        summaryBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        summaryLine: { ...typography.caption, fontSize: 12, color: colors.textPrimary, marginBottom: 4 },
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
      }),
    [colors, radius, spacing, typography]
  );

  const dueDateLabel = new Date(recurringItem.nextDueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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
      <Text style={styles.subtitle}>
        {liability.label} · {LIABILITY_TYPE_LABEL[liability.type]}
      </Text>

      <View style={styles.factRow}>
        <Text style={styles.factLabel}>Due date</Text>
        <Text style={styles.factValue}>{dueDateLabel}</Text>
      </View>
      <View style={styles.factRow}>
        <Text style={styles.factLabel}>Your recorded expected repayment</Text>
        <Text style={styles.factValue}>{formatMoney(recurringItem.amount)}</Text>
      </View>
      <View style={styles.factRow}>
        <Text style={styles.factLabel}>Current recorded balance</Text>
        <Text style={styles.factValue}>{formatMoney(liability.currentBalance)}</Text>
      </View>

      <View style={styles.divider} />

      <Text style={styles.label}>How much did you pay in total?</Text>
      <TextInput
        style={styles.input}
        value={form.amountText}
        onChangeText={form.setAmountText}
        placeholder="$0.00"
        keyboardType="decimal-pad"
        editable={!form.isSubmitting}
        inputAccessoryViewID={Platform.OS === 'ios' ? DONE_ACCESSORY_ID : undefined}
      />

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

      <View style={styles.divider} />

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Update my recorded loan balance</Text>
        <Switch value={form.updateBalance} onValueChange={form.setUpdateBalance} disabled={form.isSubmitting} />
      </View>

      {form.updateBalance ? (
        <>
          <Text style={styles.label}>Loan balance after this payment</Text>
          <TextInput
            style={styles.input}
            value={form.newBalanceText}
            onChangeText={form.setNewBalanceText}
            placeholder="$0.00"
            keyboardType="decimal-pad"
            editable={!form.isSubmitting}
            inputAccessoryViewID={Platform.OS === 'ios' ? DONE_ACCESSORY_ID : undefined}
          />
          {form.validatedNewBalance?.valid && form.derivedPrincipal !== undefined ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLine}>{`${form.source ? form.source.label.split(' (')[0] : 'Selected account'}: -${
                form.validatedAmount.valid ? formatMoney(form.validatedAmount.cents / 100) : '$0.00'
              }`}</Text>
              <Text style={styles.summaryLine}>{`Recorded ${liability.type === 'mortgage' ? 'mortgage' : 'loan'} balance: ${formatMoney(
                liability.currentBalance
              )} → ${formatMoney(form.validatedNewBalance.amount)}`}</Text>
              <Text style={styles.summaryLine}>{`Principal reduction based on your entries: ${formatMoney(Math.max(0, form.derivedPrincipal))}`}</Text>
              {form.validatedAmount.valid ? (
                <Text style={styles.summaryLine}>{`Remaining payment treated as interest/fees: ${formatMoney(
                  Math.max(0, form.validatedAmount.cents / 100 - form.derivedPrincipal)
                )}`}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.disclosure}>Navilo records the amounts you enter. Your lender may allocate repayments differently.</Text>
        </>
      ) : (
        <Text style={styles.disclosure}>
          {`Your payment will be recorded, but your recorded balance will stay at ${formatMoney(liability.currentBalance)} until you update it.`}
        </Text>
      )}

      {form.validatedAmount.valid && form.source ? (
        <Text style={styles.disclosure}>
          {`Confirming will record ${formatMoney(form.validatedAmount.cents / 100)} as a repayment and reduce ${
            form.source.label.split(' (')[0]
          }. This updates Navilo only — it does not move money in your bank.`}
        </Text>
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
