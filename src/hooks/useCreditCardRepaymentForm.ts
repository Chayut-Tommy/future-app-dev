import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { CreditCard } from '../types/models';
import { daysUntilDue } from '../lib/calculations/creditHealth';
import { moneyAmountToCents } from '../lib/calculations/money';
import { resolveEligibleBillPaymentSources, BillPaymentSourceOption } from '../lib/calculations/billPaymentSources';
import { RepaymentResult, ReminderOccurrenceKey } from '../lib/calculations/reminderInteractionLifecycle';

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * the credit-card repayment form's ENTIRE state and validation/mutation
 * logic, extracted verbatim from the former CreditCardRepaymentSheet.tsx —
 * see useLoanRepaymentForm.ts's own doc comment for the full rationale
 * (identical sibling extraction). Every validation rule — including the
 * `exceedsBalance` overpayment cap and the `needsBelowMinimumAck` warning
 * gate, both explicitly required to remain unchanged this round — is
 * byte-for-byte unchanged from the accepted prior round.
 */
export function useCreditCardRepaymentForm({
  card,
  reminderOccurrenceDate,
  active,
  occurrenceKey,
  onResult,
}: {
  card: CreditCard | null;
  reminderOccurrenceDate?: string;
  active: boolean;
  occurrenceKey: ReminderOccurrenceKey | null;
  onResult: (result: RepaymentResult) => void;
}) {
  const { data, confirmCreditCardRepayment } = useAppState();
  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState<BillPaymentSourceOption | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [belowMinimumAcknowledged, setBelowMinimumAcknowledged] = useState(false);

  useEffect(() => {
    if (active) return;
    setAmountText('');
    setSource(null);
    setIsSubmitting(false);
    setErrorText(null);
    setBelowMinimumAcknowledged(false);
  }, [active]);

  const eligibleSources = useMemo(
    () => resolveEligibleBillPaymentSources(data.assets, []).filter((o) => o.kind === 'asset'),
    [data.assets]
  );

  const daysUntil = card ? daysUntilDue(card.dueDay) : 0;
  const dueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + daysUntil);
    return d;
  }, [daysUntil]);

  const validatedAmount = moneyAmountToCents(parseFloat(amountText) || 0);
  const exceedsBalance = !!card && validatedAmount.valid && validatedAmount.cents / 100 > card.currentBalance;
  const isBelowMinimum = !!card && validatedAmount.valid && card.minimumPayment > 0 && validatedAmount.cents / 100 < card.minimumPayment;
  const needsBelowMinimumAck = isBelowMinimum && !belowMinimumAcknowledged;
  const isDirty = amountText !== '' || !!source || belowMinimumAcknowledged;
  const canConfirm = validatedAmount.valid && !!source && !isSubmitting && !exceedsBalance;

  function handleConfirm() {
    if (!card || !validatedAmount.valid || !source || exceedsBalance || !occurrenceKey) return;
    if (needsBelowMinimumAck) {
      setBelowMinimumAcknowledged(true);
      return;
    }
    setErrorText(null);
    setIsSubmitting(true);
    const { transition, transactionId } = confirmCreditCardRepayment({
      creditCardId: card.id,
      amount: validatedAmount.cents / 100,
      paymentSource: source.assetType!,
      targetAssetId: source.assetType === 'everyday' ? source.id : undefined,
      expectedCardBalance: card.currentBalance,
      reminderOccurrenceDate,
    });
    if (transition.applied) {
      setIsSubmitting(false);
      onResult({ kind: 'completed', occurrenceKey, transactionId });
      return;
    }
    setIsSubmitting(false);
    if (transition.reason === 'stale') {
      setErrorText("This card's balance changed since you opened this screen. Close and try again.");
    } else if (transition.reason === 'exceeds_balance') {
      setErrorText("That's more than the current recorded balance. Enter an amount up to " + formatMoney(card.currentBalance) + '.');
    } else if (transition.reason === 'insufficient_source_balance') {
      const liveAsset = data.assets.find((a) => a.id === source.id);
      const liveBalance = liveAsset ? liveAsset.currentValue : source.currentValue;
      setErrorText(
        `The recorded balance for ${source.label.split(' (')[0]} is ${formatMoney(liveBalance)}. Choose another account or enter ${formatMoney(
          liveBalance
        )} or less.`
      );
    } else if (transition.reason === 'invalid_amount') {
      setErrorText('Enter an amount greater than $0, with at most 2 decimal places.');
    } else {
      setErrorText("We couldn't record that payment yet. Please try again.");
    }
  }

  function handleCancel() {
    if (!occurrenceKey) return;
    onResult({ kind: 'cancelled', occurrenceKey });
  }

  return {
    amountText,
    setAmountText: (text: string) => {
      setAmountText(text);
      setBelowMinimumAcknowledged(false);
    },
    source,
    setSource,
    isSubmitting,
    errorText,
    eligibleSources,
    dueDate,
    validatedAmount,
    exceedsBalance,
    needsBelowMinimumAck,
    canConfirm,
    isDirty,
    handleConfirm,
    handleCancel,
  };
}

export type CreditCardRepaymentFormBundle = ReturnType<typeof useCreditCardRepaymentForm>;
