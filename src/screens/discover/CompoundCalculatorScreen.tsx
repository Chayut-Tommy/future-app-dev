import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import { computeCompoundGrowth, ContributionFrequency } from '../../lib/calculations/compoundCalculator';
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

const FREQUENCIES: { value: ContributionFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Compound growth — Design 5.1 Wave 9a.
 *
 * The engine (computeCompoundGrowth) is untouched: same formula, same
 * results, same display rounding. What changed is presentation only:
 * inputs lead, the ONE result surface exists only while every input is
 * genuinely readable (the old `parseFloat(x) || 0` fabricated a $0
 * projection out of malformed input), contributions are distinguished from
 * estimated growth, and the screen speaks the semantic type and colour
 * roles. Cadence selection and the Saving Facts "Try calculator" prefill
 * (route params) are preserved exactly.
 */
export function CompoundCalculatorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params ?? {};

  const [initial, setInitial] = useState(params.initial ? String(params.initial) : '0');
  const [contribution, setContribution] = useState(params.contribution ? String(params.contribution) : '10');
  const [frequency, setFrequency] = useState<ContributionFrequency>(params.frequency ?? 'weekly');
  const [ratePct, setRatePct] = useState(params.annualRatePct ? String(params.annualRatePct) : '5');
  const [years, setYears] = useState(params.years ? String(params.years) : '10');

  // Structured classification — never parseFloat, never a fabricated zero.
  // A zero starting amount or contribution is a genuinely valid scenario;
  // a 0% assumed return is one the engine supports explicitly; a 0-year
  // term has nothing meaningful to estimate, so years must be positive.
  const initialState = classifyMoneyInput(initial, { allowZero: true });
  const contributionState = classifyMoneyInput(contribution, { allowZero: true });
  const rateState = classifyNumberInput(ratePct, { allowZero: true });
  const yearsState = classifyNumberInput(years);
  const readiness = combineCalculatorFields([initialState, contributionState, rateState, yearsState]);
  const guidance = calculatorGuidance(readiness);

  const rateMessage = useBlurFieldMessage(() => describeNumberInput({ raw: ratePct, allowZero: true, required: true, unit: 'rate' }));
  const yearsMessage = useBlurFieldMessage(() => describeNumberInput({ raw: years, required: true, unit: 'number of years' }));

  const result = useMemo(
    () =>
      initialState.status === 'valid' && contributionState.status === 'valid' && rateState.status === 'valid' && yearsState.status === 'valid'
        ? computeCompoundGrowth({
            initial: initialState.value,
            contribution: contributionState.value,
            frequency,
            annualRatePct: rateState.value,
            years: yearsState.value,
          })
        : null,
    // Raw strings are the honest inputs — every field state derives from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, contribution, frequency, ratePct, years]
  );

  return (
    <Screen title="Compound growth" onBack={() => navigation.goBack()}>
      <CalculatorIntro text="See how regular contributions could grow over time, using a rate and timeframe you choose." />

      <CalculatorSection title="Your numbers">
        <CurrencyField label="Starting amount" value={initial} onChangeText={setInitial} allowZero required accessibilityLabel="Starting amount in dollars" />
        <CurrencyField label="Contribution amount" value={contribution} onChangeText={setContribution} allowZero required accessibilityLabel="Contribution amount in dollars" />
        <FieldShell label="How often">
          <FrequencyChips options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        </FieldShell>
        <TextField
          label="Assumed annual return (%)"
          value={ratePct}
          onChangeText={(next) => {
            setRatePct(next);
            rateMessage.onChangeClear();
          }}
          onBlur={rateMessage.onBlur}
          figures
          keyboardType="decimal-pad"
          message={rateMessage.message}
          accessibilityLabel="Assumed annual return in percent per year"
        />
        <TextField
          label="Years"
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
          accessibilityLabel="Number of years"
        />
      </CalculatorSection>

      {result ? (
        <CalculatorResult
          eyebrow="Estimated value"
          figure={formatMoney(result.futureValue)}
          caption={`in ${yearsState.status === 'valid' ? yearsState.value : ''} year${yearsState.status === 'valid' && yearsState.value === 1 ? '' : 's'}`}
          accessibilityLabel={`Estimated value ${formatMoney(result.futureValue)} in ${yearsState.status === 'valid' ? yearsState.value : ''} years`}
          testID="compound-result"
        >
          <CalculatorBreakdownRow label="Your contributions" value={formatMoney(result.totalContributed)} testID="compound-contributions" />
          <CalculatorBreakdownRow label="Estimated growth" value={formatMoney(result.totalGrowth)} testID="compound-growth" />
        </CalculatorResult>
      ) : guidance ? (
        <CalculatorGuidance text={guidance} testID="compound-guidance" />
      ) : null}

      <CalculatorDisclaimer text="Illustrative only — plug in your own numbers, not a guarantee of real returns." />
    </Screen>
  );
}
