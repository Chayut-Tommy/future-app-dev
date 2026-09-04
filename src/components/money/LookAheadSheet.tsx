import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { AppData } from '../../types/models';
import { LocalDate } from '../../lib/calculations/localCalendar';
import { computeLookAheadProjection, LookAheadResult } from '../../lib/calculations/lookAheadProjection';
import { selectLookAheadPresentation } from '../../lib/calculations/lookAheadPresentation';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { typeStyle, textStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass C.1 — the "Why this amount?" detail sheet.
 *
 * A read-only, write-free drill-down for the selected-date (scenario) card.
 * It is CONTROLLED: the parent owns the selected `target`; this sheet only
 * explains it. It composes no financial maths of its own — every number comes
 * from the Pass B engine (`computeLookAheadProjection`) and every customer
 * string from the Pass B presentation selector (`selectLookAheadPresentation`).
 * The date-choice mechanism it previously carried moved to `TimeframeSheet`;
 * the calm result now renders inline on the card. Opening, expanding the
 * breakdown and dismissing perform zero AppData/persistence writes.
 */

function fmtCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString()}.${String(abs % 100).padStart(2, '0')}`;
}

export function LookAheadSheet({
  visible,
  data,
  asOf,
  target,
  onClose,
}: {
  visible: boolean;
  data: AppData;
  /** As-of date, injected as a LocalDate (never `Date.now()` in the maths). */
  asOf: LocalDate | null;
  /** The selected target date the card is currently showing. */
  target: LocalDate | null;
  onClose: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const result: LookAheadResult | null = useMemo(
    () => (asOf && target ? computeLookAheadProjection(data, asOf, target) : null),
    [data, asOf, target]
  );
  const presentation = useMemo(() => (result ? selectLookAheadPresentation(result) : null), [result]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // §6 — every role now resolves through the Design 5.1 typography
        // authority (typeStyle/textStyle → fontFamilyForWeight), so bold weights
        // come from the real bundled faces, never a synthetic fontWeight on a
        // family-only font. This is the same authority the Money/scenario cards
        // use, so "Why this amount?" visibly belongs to the same product.
        resultLabel: { ...typeStyle('support', locale), color: colors.textSecondary },
        resultAmount: { ...textStyle('figureLarge', locale).style, color: colors.textPrimary, marginTop: 2, marginBottom: spacing.xs },
        cashFlow: { ...typeStyle('support', locale), color: colors.textPrimary, marginBottom: spacing.xs },
        lowest: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.md },
        sectionCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.sm },
        disclosureHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        disclosureTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm, gap: spacing.md },
        breakdownLabel: { ...typeStyle('support', locale), color: colors.textSecondary, flex: 1 },
        breakdownValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, flexShrink: 0 },
        // The total row's label is emphasised via a bold ROLE (real bundled
        // face), never a synthetic fontWeight; its value already uses the bold
        // figureRow role above.
        breakdownTotalLabel: { ...typeStyle('titleCard', locale), color: colors.textPrimary, flex: 1 },
        breakdownTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
        info: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.xs },
        assumed: { ...typeStyle('meta', locale), color: colors.textMuted, marginTop: spacing.sm },
        unavailableTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: spacing.xs },
        unavailableBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        issueRow: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, radius, spacing, locale]
  );

  const footer = <Button label="Close" variant="secondary" onPress={onClose} />;

  const renderBreakdown = (b: NonNullable<Extract<LookAheadResult, { available: true }>>['breakdown']) => {
    const rows: [string, number][] = [
      ['Starting spendable money', b.openingCents],
      ['Assumed income', b.assumedIncomeCents],
      ['Bills and commitments', b.billsCents],
      ['Credit-card repayments', b.cardCents],
      ['BNPL repayments', b.bnplCents],
      ['Mortgage repayments', b.mortgageCents],
      ['Other loan repayments', b.otherLoanCents],
    ];
    return (
      <View style={styles.sectionCard} testID="look-ahead-breakdown">
        <TouchableOpacity
          style={styles.disclosureHeader}
          onPress={() => setBreakdownOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: breakdownOpen }}
          accessibilityLabel="How this was estimated"
          testID="look-ahead-breakdown-toggle"
        >
          <Text style={styles.disclosureTitle}>How this was estimated</Text>
          <Ionicons name={breakdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        {breakdownOpen ? (
          <View>
            {rows.map(([label, cents]) => (
              <View key={label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownValue}>{fmtCents(cents)}</Text>
              </View>
            ))}
            <View style={styles.breakdownTotalRow}>
              <Text style={styles.breakdownTotalLabel}>Estimated position</Text>
              <Text style={styles.breakdownValue}>{fmtCents(b.targetCents)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderBody = () => {
    if (!result || !presentation) return null;
    if (!result.available) {
      return (
        <View testID="look-ahead-unavailable">
          <Text style={styles.unavailableTitle} accessibilityRole="header">
            {presentation.headline}
          </Text>
          {presentation.subtext ? <Text style={styles.unavailableBody}>{presentation.subtext}</Text> : null}
          {result.issues.map((iss, i) => (
            <Text key={i} style={styles.issueRow} testID={`look-ahead-issue-${iss.code}`}>
              {iss.reason}
            </Text>
          ))}
        </View>
      );
    }
    return (
      <View testID="look-ahead-result">
        <View>
          <Text style={styles.resultLabel}>{presentation.headline}</Text>
          <Text style={styles.resultAmount} testID="look-ahead-amount">
            {presentation.headlineAmount}
          </Text>
        </View>
        {presentation.cashFlowLine ? (
          <Text style={styles.cashFlow} testID="look-ahead-cashflow">
            {presentation.cashFlowLine}
          </Text>
        ) : null}
        {presentation.lowestLine && result.firstShortfall === null ? <Text style={styles.lowest}>{presentation.lowestLine}</Text> : null}
        {renderBreakdown(result.breakdown)}
        {presentation.savingsLine ? (
          <Text style={styles.info} testID="look-ahead-savings">
            {presentation.savingsLine}
          </Text>
        ) : null}
        {result.informationalPlan.notice && !presentation.savingsLine ? <Text style={styles.info}>{result.informationalPlan.notice}</Text> : null}
        {presentation.protectedLine
          ? (() => {
              // §5 — the excluded amount is only shown when it reconciles
              // EXACTLY to the current balances of identifiable excluded
              // savings accounts (savings-type, not opted into spendable
              // money). It is omitted from the opening amount exactly once,
              // never subtracted from the projection. If it cannot be traced
              // to those account balances, we fail closed and show no figure.
              const accts = result.protectedSavings.accounts;
              const summedCents = accts.reduce((sum, a) => sum + Math.round(a.value * 100), 0);
              const traceable = accts.length > 0 && summedCents === result.protectedSavings.cents;
              const n = accts.length;
              return (
                <View style={styles.sectionCard} testID="look-ahead-protected">
                  <Text style={styles.disclosureTitle}>{presentation.protectedLine}</Text>
                  {traceable ? (
                    <>
                      <Text style={styles.info} testID="look-ahead-excluded-savings">
                        {formatCentsCentsAware(result.protectedSavings.cents)} across {n} savings account{n === 1 ? '' : 's'} isn’t counted in the{' '}
                        {formatCentsCentsAware(result.breakdown.openingCents)} starting amount.
                      </Text>
                      <Text style={styles.info}>Only balances included in your spendable money are used.</Text>
                      {accts.map((a) => (
                        <Text key={a.id} style={styles.assumed} testID={`look-ahead-excluded-account-${a.id}`}>
                          • {a.label}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.info} testID="look-ahead-excluded-savings-untraceable">
                      Some savings balances aren’t counted in this estimate.
                    </Text>
                  )}
                </View>
              );
            })()
          : null}
        {presentation.assumedLine ? (
          <Text style={styles.assumed} testID="look-ahead-assumed">
            {presentation.assumedLine}
          </Text>
        ) : null}
        {presentation.subtext ? <Text style={styles.assumed}>{presentation.subtext}</Text> : null}
      </View>
    );
  };

  return (
    <KeyboardSheet visible={visible} onClose={onClose} title="Why this amount?" isDirty={false} focusTitleOnShow footer={footer}>
      {renderBody()}
    </KeyboardSheet>
  );
}
