import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { Liability, RecurringItem } from '../types/models';
import { moneyAmountToCents, parseMoneyInputAllowZero } from '../lib/calculations/money';
import { resolveEligibleBillPaymentSources, BillPaymentSourceOption } from '../lib/calculations/billPaymentSources';
import { RepaymentResult, ReminderOccurrenceKey } from '../lib/calculations/reminderInteractionLifecycle';

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Final Pass 2D device-test correction (native-Modal-lifecycle round) —
 * the mortgage/personal-loan/car-loan repayment form's ENTIRE state and
 * validation/mutation logic, extracted verbatim from the former
 * LoanRepaymentSheet.tsx (which owned its own native Modal via KeyboardSheet
 * — the confirmed stacked-native-Modal risk this round's report addresses).
 * Every validation rule, every error-copy branch, and the confirmLoanRepayment
 * call itself are byte-for-byte unchanged from the accepted prior round —
 * only the OWNERSHIP of this state moved, from a Modal-owning component to
 * this hook, called directly by ReminderDetailSheet (the new single native
 * Modal owner) so the same content can be rendered without a nested Modal.
 *
 * `active` mirrors the old component's own `reset()` (previously called
 * from handleClose()) — draft fields clear whenever this form is not the
 * currently-displayed lifecycle state, so reopening always starts clean
 * (required invariant: reopening begins with clean local interaction
 * state).
 *
 * `onResult` reports the form's outcome as a structured RepaymentResult —
 * never a boolean — carrying the caller-supplied occurrenceKey and (only on
 * success) the REAL transactionId confirmLoanRepayment's own call just
 * generated (see AppStateContext.tsx's own extended return value this round
 * — never a synthetic id).
 */
export function useLoanRepaymentForm({
  liability,
  recurringItem,
  active,
  occurrenceKey,
  onResult,
}: {
  liability: Liability | null;
  recurringItem: RecurringItem | null;
  active: boolean;
  occurrenceKey: ReminderOccurrenceKey | null;
  onResult: (result: RepaymentResult) => void;
}) {
  const { data, confirmLoanRepayment } = useAppState();
  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState<BillPaymentSourceOption | null>(null);
  const [updateBalance, setUpdateBalance] = useState(false);
  const [newBalanceText, setNewBalanceText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (active) return;
    setAmountText('');
    setSource(null);
    setUpdateBalance(false);
    setNewBalanceText('');
    setIsSubmitting(false);
    setErrorText(null);
  }, [active]);

  const eligibleSources = useMemo(
    () => resolveEligibleBillPaymentSources(data.assets, []).filter((o) => o.kind === 'asset'),
    [data.assets]
  );

  const validatedAmount = moneyAmountToCents(parseFloat(amountText) || 0);
  const validatedNewBalance = updateBalance ? parseMoneyInputAllowZero(newBalanceText) : null;
  const derivedPrincipal =
    liability && updateBalance && validatedNewBalance?.valid
      ? Math.round((liability.currentBalance - validatedNewBalance.amount) * 100) / 100
      : undefined;
  const principalWithinBounds =
    derivedPrincipal !== undefined && derivedPrincipal >= 0 && (!validatedAmount.valid || derivedPrincipal <= validatedAmount.cents / 100);
  const balanceStepValid = !updateBalance || (validatedNewBalance?.valid && principalWithinBounds);
  const canConfirm = validatedAmount.valid && !!source && balanceStepValid && !isSubmitting;

  // Interaction-integrity correction (unchanged this round) — an untouched
  // form dismisses instantly; a form with entered data prompts before
  // discarding.
  const isDirty = amountText !== '' || !!source || updateBalance || newBalanceText !== '';

  function handleConfirm() {
    if (!liability || !recurringItem || !occurrenceKey || !validatedAmount.valid || !source) return;
    if (updateBalance && (!validatedNewBalance?.valid || !principalWithinBounds)) return;
    const newBalanceAmount = updateBalance && validatedNewBalance?.valid ? validatedNewBalance.amount : undefined;
    setErrorText(null);
    setIsSubmitting(true);
    const { transition, transactionId } = confirmLoanRepayment({
      recurringItemId: recurringItem.id,
      liabilityId: liability.id,
      expectedNextDueDate: recurringItem.nextDueDate,
      amount: validatedAmount.cents / 100,
      paymentSource: source.assetType!,
      targetAssetId: source.assetType === 'everyday' ? source.id : undefined,
      updateBalance,
      newBalance: newBalanceAmount,
      expectedCurrentBalance: liability.currentBalance,
    });
    if (transition.applied) {
      setIsSubmitting(false);
      onResult({ kind: 'completed', occurrenceKey, transactionId });
      return;
    }
    setIsSubmitting(false);
    switch (transition.reason) {
      case 'stale':
      case 'stale_balance':
        setErrorText('This loan changed since you opened this screen. Close and try again.');
        break;
      case 'already_confirmed':
        setErrorText('This repayment looks like it was already recorded.');
        break;
      case 'insufficient_source_balance': {
        const liveAsset = data.assets.find((a) => a.id === source.id);
        const liveBalance = liveAsset ? liveAsset.currentValue : source.currentValue;
        setErrorText(
          `The recorded balance for ${source.label.split(' (')[0]} is ${formatMoney(liveBalance)}. Choose another account or enter ${formatMoney(
            liveBalance
          )} or less.`
        );
        break;
      }
      case 'invalid_amount':
        setErrorText('Enter an amount greater than $0, with at most 2 decimal places.');
        break;
      case 'invalid_balance':
        setErrorText("Enter a loan balance that isn't negative and isn't higher than the current recorded balance.");
        break;
      case 'invalid_principal':
        setErrorText("The principal reduction can't be more than the amount you paid.");
        break;
      default:
        setErrorText("We couldn't record that payment yet. Please try again.");
    }
  }

  function handleCancel() {
    if (!occurrenceKey) return;
    onResult({ kind: 'cancelled', occurrenceKey });
  }

  return {
    amountText,
    setAmountText,
    source,
    setSource,
    updateBalance,
    setUpdateBalance,
    newBalanceText,
    setNewBalanceText,
    isSubmitting,
    errorText,
    eligibleSources,
    validatedAmount,
    validatedNewBalance,
    derivedPrincipal,
    canConfirm,
    isDirty,
    handleConfirm,
    handleCancel,
  };
}

export type LoanRepaymentFormBundle = ReturnType<typeof useLoanRepaymentForm>;
