import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import {
  CalculatorBreakdownRow,
  CalculatorDisclaimer,
  CalculatorIntro,
  CalculatorResult,
  CalculatorSection,
  useCalculatorLocale,
} from '../../components/discover/calculator/CalculatorSurfaces';
import { computeEmergencyFund } from '../../lib/calculations/emergencyFund';
import { computeMonthlySummary, describeCashflowMessage } from '../../lib/calculations/monthlySummary';
import { brand } from '../../lib/brand';
import { designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Emergency Fund — Design 5.1 Wave 9a.
 *
 * The engine (computeEmergencyFund) is untouched: same inputs, same
 * calculation, same rounding, same monthly-expense source, same
 * valid-zero and floored-at-zero behaviour. Presentation changed:
 * "Recommended (3-6 months)" is replaced by the approved factual wording
 * "A common guideline is 3–6 months" (approved change 22) — the screen
 * never states the customer personally should hold a particular amount —
 * and the surface speaks the semantic type and colour roles. Missing data
 * still shows guidance, never a fabricated "0 months" or "$0".
 */
export function EmergencyFundScreen() {
  const navigation = useNavigation<any>();
  const { data } = useAppState();
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const result = useMemo(() => computeEmergencyFund(data), [data]);
  const summary = useMemo(() => computeMonthlySummary(data), [data]);
  const cashflowMessage = useMemo(() => describeCashflowMessage(summary), [summary]);
  const hasExpenseData = result.monthlyExpenses > 0;
  const monthsIsZero = hasExpenseData && (result.monthsCovered === null || result.monthsCovered < 0.05);
  const monthsFigure = monthsIsZero ? '0' : result.monthsCovered !== null ? result.monthsCovered.toFixed(1) : '0';
  const monthsCaption = monthsIsZero ? 'covered so far' : 'of expenses covered by your current cash';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        emptyBox: { alignItems: 'center', paddingVertical: designSpacing.xxxl },
        emptyText: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.sm, textAlign: 'center' },
        insightText: { ...typeStyle('body', locale), color: semantic.textPrimary },
      }),
    [semantic, locale]
  );

  return (
    <Screen title="Emergency Fund" onBack={() => navigation.goBack()}>
      <CalculatorIntro text="How many months of expenses your current cash could cover, from your own logged income, bills and cash." />

      {hasExpenseData ? (
        <CalculatorResult
          eyebrow="Months covered"
          figure={`${monthsFigure} months`}
          caption={monthsCaption}
          accessibilityLabel={`${monthsFigure} months ${monthsCaption}`}
          testID="emergency-result"
        >
          <CalculatorBreakdownRow label="Monthly expenses" value={formatMoney(result.monthlyExpenses)} testID="emergency-expenses" />
          <CalculatorBreakdownRow label="Current cash" value={formatMoney(result.currentCash)} testID="emergency-cash" />
          <CalculatorBreakdownRow
            label="A common guideline is 3–6 months"
            value={`${formatMoney(result.recommendedMin)} - ${formatMoney(result.recommendedMax)}`}
            testID="emergency-guideline"
          />
        </CalculatorResult>
      ) : (
        <CalculatorSection>
          <View style={styles.emptyBox} testID="emergency-empty">
            <Ionicons name="shield-outline" size={22} color={semantic.textTertiary} importantForAccessibility="no" />
            <Text style={styles.emptyText}>Add your income and a few bills or expenses, and {brand.name} will calculate your safety net here.</Text>
          </View>
        </CalculatorSection>
      )}

      {monthsIsZero ? (
        <CalculatorSection>
          <Text style={styles.insightText}>
            Your current cash buffer isn't enough yet. Add cash savings to start building your emergency fund — {brand.name} will
            track your progress here.
          </Text>
        </CalculatorSection>
      ) : null}

      {cashflowMessage ? (
        <CalculatorSection title="Savings Rate">
          <Text style={styles.insightText}>{cashflowMessage}</Text>
        </CalculatorSection>
      ) : null}

      <CalculatorDisclaimer text="Based on your own logged income, bills, and cash — a common guideline, not financial advice." />
    </Screen>
  );
}
