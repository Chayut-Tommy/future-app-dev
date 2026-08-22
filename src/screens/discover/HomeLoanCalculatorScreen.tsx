import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/shared/Screen';
import { CurrencyField } from '../../components/shared/fields/CurrencyField';
import { TextField } from '../../components/shared/fields/TextField';
import { FieldShell } from '../../components/shared/fields/FieldShell';
import {
  CalculatorBreakdownRow,
  CalculatorDisclaimer,
  CalculatorGuidance,
  CalculatorIntro,
  CalculatorResult,
  CalculatorSection,
  FrequencyChips,
  useBlurFieldMessage,
} from '../../components/discover/calculator/CalculatorSurfaces';
import { computeHomeLoanRepayment, RepaymentFrequency } from '../../lib/calculations/homeLoanCalculator';
import {
  calculatorGuidance,
  classifyMoneyInput,
  classifyNumberInput,
  combineCalculatorFields,
  describeNumberInput,
} from '../../lib/calculations/calculatorInputPresentation';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const FREQUENCIES: { value: RepaymentFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

const PERIOD_WORD: Record<RepaymentFrequency, string> = { monthly: 'month', fortnightly: 'fortnight', weekly: 'week' };

/**
 * Home loan repayments — Design 5.1 Wave 9a.
 *
 * The customer-facing name is "Home loan repayments" (approved change 20 —
 * the old "Can I buy a home?" implied an eligibility answer the app cannot
 * give; the Grow entry label already changed in Wave 8). This calculator
 * estimates repayments ONLY: nothing here speaks about affordability,
 * borrowing capacity, lender approval or eligibility.
 *
 * The engine (computeHomeLoanRepayment) is untouched: frequency, term,
 * rate, principal handling and display rounding are exactly as before.
 * Presentation changed: inputs lead, and the one result surface exists
 * only while every input is genuinely readable — the old
 * `parseFloat(x) || 0` fabricated results out of malformed input (a
 * 0-year term even presented the whole principal as one "repayment").
 */
export function HomeLoanCalculatorScreen() {
  const navigation = useNavigation<any>();

  const [loanAmount, setLoanAmount] = useState('600000');
  const [ratePct, setRatePct] = useState('6');
  const [years, setYears] = useState('30');
  const [frequency, setFrequency] = useState<RepaymentFrequency>('monthly');

  // Structured classification — a loan needs a positive amount and a
  // positive term; a genuinely 0% rate is a real scenario the engine
  // supports explicitly.
  const loanState = classifyMoneyInput(loanAmount);
  const rateState = classifyNumberInput(ratePct, { allowZero: true });
  const yearsState = classifyNumberInput(years);
  const readiness = combineCalculatorFields([loanState, rateState, yearsState]);
  const guidance = calculatorGuidance(readiness);

  const rateMessage = useBlurFieldMessage(() => describeNumberInput({ raw: ratePct, allowZero: true, required: true, unit: 'rate' }));
  const yearsMessage = useBlurFieldMessage(() => describeNumberInput({ raw: years, required: true, unit: 'number of years' }));

  const result = useMemo(
    () =>
      loanState.status === 'valid' && rateState.status === 'valid' && yearsState.status === 'valid'
        ? computeHomeLoanRepayment({
            loanAmount: loanState.value,
            annualRatePct: rateState.value,
            years: yearsState.value,
            frequency,
          })
        : null,
    // Raw strings are the honest inputs — every field state derives from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loanAmount, ratePct, years, frequency]
  );

  return (
    <Screen title="Home loan repayments" onBack={() => navigation.goBack()}>
      <CalculatorIntro text="Estimate repayments on a loan amount, rate and term you enter yourself." />

      <CalculatorSection title="Your numbers">
        <CurrencyField label="Loan amount" value={loanAmount} onChangeText={setLoanAmount} required accessibilityLabel="Loan amount in dollars" />
        <TextField
          label="Interest rate (%)"
          value={ratePct}
          onChangeText={(next) => {
            setRatePct(next);
            rateMessage.onChangeClear();
          }}
          onBlur={rateMessage.onBlur}
          figures
          keyboardType="decimal-pad"
          message={rateMessage.message}
          accessibilityLabel="Interest rate in percent per year"
        />
        <TextField
          label="Loan term (years)"
          value={years}
          onChangeText={(next) => {
            setYears(next);
            yearsMessage.onChangeClear();
          }}
          onBlur={yearsMessage.onBlur}
          figures
          keyboardType="decimal-pad"
          returnKeyType="done"
          message={yearsMessage.message}
          accessibilityLabel="Loan term in years"
        />
        <FieldShell label="Repayment frequency">
          <FrequencyChips options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        </FieldShell>
      </CalculatorSection>

      {result ? (
        <CalculatorResult
          eyebrow="Estimated repayment"
          figure={`${formatMoney(result.repaymentPerPeriod)} / ${PERIOD_WORD[frequency]}`}
          caption={`over ${yearsState.status === 'valid' ? yearsState.value : ''} years`}
          accessibilityLabel={`Estimated repayment ${formatMoney(result.repaymentPerPeriod)} per ${PERIOD_WORD[frequency]}, over ${yearsState.status === 'valid' ? yearsState.value : ''} years`}
          testID="homeloan-result"
        >
          <CalculatorBreakdownRow label="Estimated interest" value={formatMoney(result.totalInterest)} testID="homeloan-interest" />
          <CalculatorBreakdownRow label="Estimated total cost" value={formatMoney(result.totalCost)} testID="homeloan-total" />
        </CalculatorResult>
      ) : guidance ? (
        <CalculatorGuidance text={guidance} testID="homeloan-guidance" />
      ) : null}

      <CalculatorDisclaimer text="Educational only — plug in your own numbers, not a lending offer or advice." />
    </Screen>
  );
}
