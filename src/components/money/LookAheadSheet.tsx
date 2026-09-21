import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { AppData } from '../../types/models';
import { LocalDate } from '../../lib/calculations/localCalendar';
import { computeLookAheadProjection, LookAheadResult } from '../../lib/calculations/lookAheadProjection';
import { computeDailyGuide } from '../../lib/calculations/dailyGuide';
import {
  DAILY_GUIDE_ACCESSIBLE_EXPLANATION,
  fmtShortDate,
  selectDailyGuidePresentation,
  selectLookAheadPresentation,
} from '../../lib/calculations/lookAheadPresentation';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { typeStyle, textStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass C.1 / C.2 — the "Why this amount?" detail sheet.
 *
 * A read-only, write-free drill-down for the selected-date ("Look ahead")
 * card. It is CONTROLLED: the parent owns the selected `target`; this sheet
 * only explains it. It composes no financial maths of its own — every number
 * comes from the Pass B engine (`computeLookAheadProjection`), the C.2 pure
 * guide (`computeDailyGuide`) and the presentation selectors.
 *
 * Pass C.2 correction (progressive disclosure). The default view answers, in
 * this order and without a wall of text:
 *   1. the concise result summary (estimated balance + cash-flow status);
 *   2. an EXPANDABLE "Estimated balance" calculation (collapsed by default);
 *   3. a concise "About per day" summary — the guide, how many days it
 *      covers (with the explicit local date range) and what is protected
 *      through the next payday;
 *   4. a separate, COLLAPSED "Assumptions and limits" section holding every
 *      detailed caveat (guard payday and excluded payday income, assumed-
 *      income timing, planned savings/goals not subtracted, excluded savings,
 *      same-day handling, timeline-marker limits, estimate-not-guarantee).
 * The excluded-savings provenance stays visible (trust-critical, one line).
 * No disclosure is deleted. Opening, expanding and dismissing perform zero
 * AppData/persistence writes.
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
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const result: LookAheadResult | null = useMemo(
    () => (asOf && target ? computeLookAheadProjection(data, asOf, target) : null),
    [data, asOf, target]
  );
  const presentation = useMemo(() => (result ? selectLookAheadPresentation(result) : null), [result]);
  const guide = useMemo(() => (asOf && target && result && result.available ? computeDailyGuide(data, asOf, target, result) : null), [data, asOf, target, result]);
  const guidePresentation = useMemo(() => (guide ? selectDailyGuidePresentation(guide) : null), [guide]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // §6 — every role resolves through the Design 5.1 typography authority
        // (typeStyle/textStyle → fontFamilyForWeight), so bold weights come
        // from the real bundled faces, never a synthetic fontWeight.
        resultLabel: { ...typeStyle('support', locale), color: colors.textSecondary },
        resultAmount: { ...textStyle('figureLarge', locale).style, color: colors.textPrimary, marginTop: 2, marginBottom: spacing.xs },
        cashFlow: { ...typeStyle('support', locale), color: colors.textPrimary, marginBottom: spacing.xs },
        deficit: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.md },
        sectionCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.sm },
        disclosureHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
        disclosureTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary, flexShrink: 1 },
        breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm, gap: spacing.md },
        breakdownLabel: { ...typeStyle('support', locale), color: colors.textSecondary, flex: 1 },
        breakdownValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, flexShrink: 0 },
        breakdownTotalLabel: { ...typeStyle('titleCard', locale), color: colors.textPrimary, flex: 1 },
        breakdownTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
        info: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.xs },
        assumed: { ...typeStyle('meta', locale), color: colors.textMuted, marginTop: spacing.sm },
        guideRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md, marginTop: spacing.sm },
        guideValue: { ...typeStyle('figureRow', locale), color: colors.textPrimary, flexShrink: 0 },
        guideCaption: { ...typeStyle('support', locale), color: colors.textSecondary, flex: 1 },
        guideLine: { ...typeStyle('support', locale), color: colors.textPrimary, marginTop: spacing.sm },
        guideReason: { ...typeStyle('support', locale), color: colors.textSecondary, marginTop: spacing.sm },
        disclosure: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: spacing.xs },
        unavailableTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: spacing.xs },
        unavailableBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        issueRow: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, radius, spacing, locale]
  );

  const footer = <Button label="Close" variant="secondary" onPress={onClose} />;

  /** Shared accordion header — 44pt, expanded state exposed, same pattern for both sections. */
  const renderHeader = (title: string, open: boolean, onToggle: () => void, label: string, testID: string) => (
    <TouchableOpacity style={styles.disclosureHeader} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={label} testID={testID}>
      <Text style={styles.disclosureTitle} maxFontSizeMultiplier={2}>
        {title}
      </Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} importantForAccessibility="no" />
    </TouchableOpacity>
  );

  const renderBreakdown = (r: Extract<LookAheadResult, { available: true }>) => {
    const b = r.breakdown;
    const rows: [string, number][] = [
      ['Starting included money', b.openingCents],
      ['Assumed income through your selected date', b.assumedIncomeCents],
      ['Bills and commitments', b.billsCents],
      ['Credit-card repayments', b.cardCents],
      ['BNPL repayments', b.bnplCents],
      ['Mortgage repayments', b.mortgageCents],
      ['Other loan repayments', b.otherLoanCents],
    ];
    return (
      <View style={styles.sectionCard} testID="look-ahead-breakdown">
        {renderHeader('Estimated balance', breakdownOpen, () => setBreakdownOpen((v) => !v), 'Estimated balance — how this was estimated', 'look-ahead-breakdown-toggle')}
        {breakdownOpen ? (
          <View>
            {rows.map(([label, cents]) => (
              <View key={label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel} maxFontSizeMultiplier={2}>
                  {label}
                </Text>
                <Text style={styles.breakdownValue} maxFontSizeMultiplier={2}>
                  {fmtCents(cents)}
                </Text>
              </View>
            ))}
            <View style={styles.breakdownTotalRow}>
              <Text style={styles.breakdownTotalLabel} maxFontSizeMultiplier={2}>
                Estimated balance
              </Text>
              <Text style={styles.breakdownValue} maxFontSizeMultiplier={2}>
                {fmtCents(b.targetCents)}
              </Text>
            </View>
            <Text style={styles.assumed} testID="look-ahead-not-yet-deducted">
              Future everyday spending isn’t deducted yet — this is the balance before it.
            </Text>
            {presentation?.assumedLine ? (
              <Text style={styles.assumed} testID="look-ahead-assumed">
                {presentation.assumedLine}. Future income is assumed, not received.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderDailyGuide = () => {
    if (!guide || !guidePresentation) return null;
    const concise = guide.status === 'available' || guide.status === 'zero';
    return (
      <View style={styles.sectionCard} testID="look-ahead-daily-guide">
        <Text style={styles.disclosureTitle} accessibilityRole="header" maxFontSizeMultiplier={2}>
          About per day
        </Text>
        <View style={styles.guideRow}>
          <Text style={styles.guideCaption} testID="look-ahead-daily-caption" maxFontSizeMultiplier={2}>
            {guidePresentation.caption}
          </Text>
          <Text style={styles.guideValue} testID="look-ahead-daily-amount" accessibilityLabel={guidePresentation.accessibilityLabel} maxFontSizeMultiplier={2}>
            {guidePresentation.value}
          </Text>
        </View>
        {concise ? (
          <>
            <Text style={styles.guideLine} testID="look-ahead-daily-coverage" maxFontSizeMultiplier={2}>
              {guidePresentation.coverageLine}
            </Text>
            {guidePresentation.protectedLine ? (
              <Text style={styles.guideLine} testID="look-ahead-daily-protected" maxFontSizeMultiplier={2}>
                {guidePresentation.protectedLine}
              </Text>
            ) : null}
            {/* Pass C.3 — the ACTUAL binding reason, from the engine's limiting
                metadata (position ÷ days counted), never target ÷ days. */}
            {guidePresentation.limitingLine ? (
              <Text style={styles.guideLine} testID="look-ahead-daily-limiting" maxFontSizeMultiplier={2}>
                {guidePresentation.limitingLine}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.guideReason} testID="look-ahead-daily-explanation" maxFontSizeMultiplier={2}>
            {guidePresentation.explanation}
          </Text>
        )}
      </View>
    );
  };

  const renderAssumptions = (r: Extract<LookAheadResult, { available: true }>) => {
    const lines: { key: string; text: string }[] = [];
    let n = 0;
    const push = (text: string, key?: string) => lines.push({ key: key ?? `look-ahead-daily-disclosure-${n++}`, text });
    if (guide && guidePresentation && (guide.status === 'available' || guide.status === 'zero')) {
      push(guidePresentation.explanation);
      push(DAILY_GUIDE_ACCESSIBLE_EXPLANATION);
    }
    if (guide?.guardPayday) {
      push(`Your next payday after ${fmtShortDate(guide.target)} is assumed to be ${fmtShortDate(guide.guardPayday)}. Income on that payday isn’t counted in the guide.`);
    } else if (guide && guide.status === 'missing_guard_payday') {
      push(guide.reason);
    }
    push('Scheduled income before your selected date is assumed, not received, and timing may vary.');
    // Pass C.3 — ONE concise savings/goals statement: the plan is informational,
    // that money has not necessarily moved, and it is not subtracted from the
    // estimated balance. Stated once, never repeated.
    push(
      r.informationalPlan.combinedCents !== null && r.informationalPlan.combinedCents > 0
        ? `You also plan to set aside about ${formatCentsCentsAware(r.informationalPlan.combinedCents)} for savings and goals. That plan is shown for information only — the money may not have moved yet, and it is not subtracted from this estimated balance.`
        : 'Planned savings and goals are shown for information only — they may not have moved yet, and they are not subtracted from this estimated balance.',
      'look-ahead-savings'
    );
    push('Savings not included in your spendable money stay outside the starting amount.');
    push('Following the guide changes your estimated balance — it’s spending, not extra money.');
    // Pass C.3 — the approved same-day contract (one end-of-day net batch per
    // local date; no intraday ordering is invented), stated precisely.
    push('Events on the same day are counted together at the end of that day, so the lowest balance shown is an end-of-day balance.');
    push('The Estimated balance path and its markers show dated events only; planned savings and goals aren’t shown on it.');
    push('This is a planning estimate, not a guarantee.');
    if (presentation?.subtext) push(`${presentation.subtext}.`);
    return (
      <View style={styles.sectionCard} testID="look-ahead-assumptions">
        {renderHeader('Assumptions and limits', assumptionsOpen, () => setAssumptionsOpen((v) => !v), 'Assumptions and limits', 'look-ahead-assumptions-toggle')}
        {assumptionsOpen ? (
          <View testID="look-ahead-assumptions-body">
            {r.informationalPlan.notice ? <Text style={styles.info}>{r.informationalPlan.notice}</Text> : null}
            {lines.map((line) => (
              <Text key={line.key} style={styles.disclosure} testID={line.key} maxFontSizeMultiplier={2}>
                • {line.text}
              </Text>
            ))}
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
          <Text style={styles.resultLabel} maxFontSizeMultiplier={2}>
            {presentation.headline}
          </Text>
          <Text style={styles.resultAmount} testID="look-ahead-amount">
            {presentation.headlineAmount}
          </Text>
        </View>
        {presentation.cashFlowLine ? (
          <Text style={styles.cashFlow} testID="look-ahead-cashflow" maxFontSizeMultiplier={2}>
            {presentation.cashFlowLine}
          </Text>
        ) : null}
        {presentation.deficitLine ? (
          <Text style={styles.deficit} testID="look-ahead-deficit" maxFontSizeMultiplier={2}>
            {presentation.deficitLine}
          </Text>
        ) : null}
        {renderBreakdown(result)}
        {renderDailyGuide()}
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
                  <Text style={styles.disclosureTitle} maxFontSizeMultiplier={2}>
                    {presentation.protectedLine}
                  </Text>
                  {traceable ? (
                    <>
                      <Text style={styles.info} testID="look-ahead-excluded-savings" maxFontSizeMultiplier={2}>
                        {formatCentsCentsAware(result.protectedSavings.cents)} across {n} savings account{n === 1 ? '' : 's'} isn’t counted in the{' '}
                        {formatCentsCentsAware(result.breakdown.openingCents)} starting amount.
                      </Text>
                      <Text style={styles.info} maxFontSizeMultiplier={2}>
                        Only balances included in your spendable money are used.
                      </Text>
                      {/* Pass C.2 closure — a meaningful, accessible account row (name
                          and balance), not a bare "• Savings" stub. */}
                      {accts.map((a) => (
                        <View key={a.id} style={styles.breakdownRow} accessible accessibilityLabel={`${a.label}, ${formatCentsCentsAware(Math.round(a.value * 100))}, not included`} testID={`look-ahead-excluded-account-${a.id}`}>
                          <Text style={styles.breakdownLabel} maxFontSizeMultiplier={2} importantForAccessibility="no">
                            {a.label}
                          </Text>
                          <Text style={styles.breakdownValue} maxFontSizeMultiplier={2} importantForAccessibility="no">
                            {formatCentsCentsAware(Math.round(a.value * 100))}
                          </Text>
                        </View>
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
        {renderAssumptions(result)}
      </View>
    );
  };

  return (
    <KeyboardSheet visible={visible} onClose={onClose} title="Why this amount?" isDirty={false} focusTitleOnShow footer={footer}>
      {renderBody()}
    </KeyboardSheet>
  );
}
