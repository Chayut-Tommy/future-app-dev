import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
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
  selectDailyGuideCalculation,
  selectDailyGuidePresentation,
  selectLookAheadPresentation,
} from '../../lib/calculations/lookAheadPresentation';
import { WHY_THIS_AMOUNT_TITLE } from '../../lib/calculations/moneyComposition';
import {
  EXPLANATION_PROVENANCE,
  ExplanationNote,
  ExplanationNotice,
  ExplanationProvenance,
  ExplanationRow,
  ExplanationSection,
  ExplanationStatement,
  ExplanationSubtitle,
  ExplanationSummary,
} from './ExplanationSheetSections';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { typeStyle } from '../../theme/textStyle';
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
  timelineCycleStart = null,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  data: AppData;
  /** As-of date, injected as a LocalDate (never `Date.now()` in the maths). */
  asOf: LocalDate | null;
  /** The selected target date the card is currently showing. */
  target: LocalDate | null;
  /** Pass D.2 — the timeline's left end when it is the (estimated) pay-cycle start.
   * Display only: it explains the endpoint; it never enters any calculation. */
  timelineCycleStart?: LocalDate | null;
  onClose: () => void;
  /** Pass D.5 — fired ONCE after dismissal completes, so the opener can return
   * assistive focus to the "Why this amount?" action that invoked it. */
  onDismissed?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const result: LookAheadResult | null = useMemo(
    () => (asOf && target ? computeLookAheadProjection(data, asOf, target) : null),
    [data, asOf, target]
  );
  const presentation = useMemo(() => (result ? selectLookAheadPresentation(result) : null), [result]);
  const guide = useMemo(() => (asOf && target && result && result.available ? computeDailyGuide(data, asOf, target, result) : null), [data, asOf, target, result]);
  const guidePresentation = useMemo(() => (guide ? selectDailyGuidePresentation(guide) : null), [guide]);
  // Pass D.4 — the guide's own limiting arithmetic, structured by the accepted owner.
  const guideCalculation = useMemo(() => (guide ? selectDailyGuideCalculation(guide) : null), [guide]);
  const subtitle = presentation?.targetDateLabel ? `By ${presentation.targetDateLabel}` : 'Selected date';

  // Pass D.4 — the sheet's own remaining styles: the shared explanation primitives
  // (ExplanationSheetSections) now own every other role in this sheet.

  // RN calls the native Modal's onDismiss on iOS only; on every other platform the
  // hide IS the completion. The opener's focus-return callback is idempotent, so this
  // can never move focus twice. No timer is involved.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    if (Platform.OS !== 'ios') onDismissed?.();
  }, [visible, onDismissed]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        unavailableTitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: spacing.xs },
        unavailableBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        issueRow: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2 },
      }),
    [colors, spacing, locale]
  );

  const footer = <Button label="Close" variant="secondary" onPress={onClose} />;

  /** Pass D.4 — the balance ledger, visible by default (no accordion). */
  const renderBreakdown = (r: Extract<LookAheadResult, { available: true }>) => {
    const b = r.breakdown;
    // The frame of the calculation is always shown. A commitment CATEGORY is omitted
    // only when the authoritative breakdown reports it as exactly zero — which an
    // available result guarantees is a genuine zero, never missing or invalid data
    // (an invalid input makes the whole result unavailable, with no ledger at all).
    const rows: [string, number][] = [
      ['Starting included money', b.openingCents],
      ['Assumed income through your selected date', b.assumedIncomeCents],
      ...([
        ['Bills and commitments', b.billsCents],
        ['Credit-card repayments', b.cardCents],
        ['BNPL repayments', b.bnplCents],
        ['Mortgage repayments', b.mortgageCents],
        ['Other loan repayments', b.otherLoanCents],
      ] as [string, number][]).filter(([, cents]) => cents !== 0),
    ];
    return (
      <ExplanationSection title="Balance breakdown" testID="look-ahead-breakdown">
        {rows.map(([label, cents]) => (
          <ExplanationRow key={label} label={label} value={fmtCents(cents)} />
        ))}
        <ExplanationRow total label="Estimated balance" value={fmtCents(b.targetCents)} testID="look-ahead-breakdown-total" />
        <ExplanationNote text="Future everyday spending isn’t deducted yet — this is the balance before it." testID="look-ahead-not-yet-deducted" />
        {presentation?.assumedLine ? <ExplanationNote text={`${presentation.assumedLine}. Future income is assumed, not received, and timing may vary.`} testID="look-ahead-assumed" /> : null}
      </ExplanationSection>
    );
  };

  /** The guide's ACTUAL binding arithmetic — never the target balance ÷ the horizon. */
  const renderDailyGuide = () => {
    if (!guide || !guidePresentation) return null;
    const concise = guide.status === 'available' || guide.status === 'zero';
    return (
      <ExplanationSection title="Your daily guide" testID="look-ahead-daily-guide">
        {guideCalculation ? (
          <>
            <ExplanationNote text={`Tightest spending point · ${guideCalculation.limitingDateLabel}`} testID="look-ahead-daily-limiting-date" />
            <ExplanationStatement text={guideCalculation.equation} testID="look-ahead-daily-limiting" />
            {guideCalculation.roundingNote ? <ExplanationNote text={guideCalculation.roundingNote} testID="look-ahead-daily-rounding" /> : null}
          </>
        ) : (
          <ExplanationStatement text={guidePresentation.caption} testID="look-ahead-daily-unavailable" />
        )}
        {concise ? (
          <>
            {guidePresentation.protectedLine ? <ExplanationNote text={guidePresentation.protectedLine} testID="look-ahead-daily-protected" /> : null}
            <ExplanationNote text={guidePresentation.coverageLine} testID="look-ahead-daily-coverage" />
          </>
        ) : (
          <ExplanationNote text={guidePresentation.explanation} testID="look-ahead-daily-explanation" />
        )}
      </ExplanationSection>
    );
  };

  /** Excluded savings and the informational plan — kept distinct, amounts only when authoritative. */
  const renderOutside = (r: Extract<LookAheadResult, { available: true }>) => {
    const accts = r.protectedSavings.accounts;
    const summedCents = accts.reduce((sum, a) => sum + Math.round(a.value * 100), 0);
    // §5 — the excluded amount is shown only when it reconciles EXACTLY to the
    // current balances of identifiable excluded savings accounts. It is omitted
    // from the opening amount exactly once, never subtracted from the projection.
    const traceable = accts.length > 0 && summedCents === r.protectedSavings.cents;
    const hasExcluded = r.protectedSavings.cents > 0;
    const plannedCents = r.informationalPlan.combinedCents;
    const hasPlanned = plannedCents !== null && plannedCents > 0;
    // Pass D.5 — when the plan cannot be computed at all we still say that planned
    // savings and goals sit outside this estimate (the user may have one we cannot
    // see). When it computes to nothing, there is nothing to disclose.
    const plannedUnknown = plannedCents === null;
    if (!hasExcluded && !hasPlanned && !plannedUnknown) return null;
    return (
      <ExplanationSection title="Outside this estimate" testID="look-ahead-protected">
        {hasExcluded ? (
          traceable ? (
            <>
              <ExplanationRow label="Excluded savings" value={formatCentsCentsAware(r.protectedSavings.cents)} testID="look-ahead-excluded-amount" />
              {accts.map((a) => (
                <ExplanationRow key={a.id} indent label={a.label} value={formatCentsCentsAware(Math.round(a.value * 100))} testID={`look-ahead-excluded-account-${a.id}`} />
              ))}
              <ExplanationNote
                testID="look-ahead-excluded-savings"
                text={`${formatCentsCentsAware(r.protectedSavings.cents)} across ${accts.length} savings account${accts.length === 1 ? '' : 's'} isn’t counted in the ${formatCentsCentsAware(r.breakdown.openingCents)} starting amount.`}
              />
              <ExplanationNote text="Only balances included in your spendable money are used, and this money is never deducted again." />
            </>
          ) : (
            <ExplanationNote text="Some savings balances aren’t counted in this estimate." testID="look-ahead-excluded-savings-untraceable" />
          )
        ) : null}
        {plannedUnknown ? (
          <ExplanationNote
            testID="look-ahead-savings"
            text="Planned savings and goals are shown for information only — they may not have moved yet, and they are not subtracted from this estimated balance."
          />
        ) : null}
        {hasPlanned ? (
          <>
            <ExplanationRow label="Planned savings & goals" value={formatCentsCentsAware(plannedCents as number)} testID="look-ahead-planned" />
            {/* Pass D.5 — the ONE savings/goals statement, beside the amount it describes
                (it used to be repeated as an assumption bullet as well). */}
            <ExplanationNote
              testID="look-ahead-savings"
              text={`That plan is shown for information only — the money may not have moved yet, and it is not subtracted from this estimated balance.`}
            />
          </>
        ) : null}
      </ExplanationSection>
    );
  };

  /** Every material assumption, visible in the same scroll (no collapsed section). */
  const renderAssumptions = (r: Extract<LookAheadResult, { available: true }>) => {
    // Pass D.5 — every line here is something NO other section of this sheet already
    // states. The guide's own method, the assumed-income caveat, the informational
    // plan, the excluded savings and the estimate disclaimer each now have exactly one
    // home (the daily-guide section, the ledger note, "Outside this estimate" and the
    // closing provenance), so they are no longer repeated as bullets.
    const lines: { key: string; text: string }[] = [];
    let n = 0;
    const push = (text: string, key?: string) => lines.push({ key: key ?? `look-ahead-daily-disclosure-${n++}`, text });
    if (guide && guidePresentation && (guide.status === 'available' || guide.status === 'zero')) {
      push(DAILY_GUIDE_ACCESSIBLE_EXPLANATION);
    }
    if (guide?.guardPayday) {
      push(`Income on your ${fmtShortDate(guide.guardPayday)} payday isn’t counted in the guide.`);
    } else if (guide && guide.status === 'missing_guard_payday') {
      push(guide.reason);
    }
    if (timelineCycleStart) {
      push(`The timeline starts at your estimated cycle start, ${fmtShortDate(timelineCycleStart)} — worked back from your main payday, not a recorded date.`, 'look-ahead-cycle-start');
    }
    push('Following the guide changes your estimated balance — it’s spending, not extra money.');
    // Pass C.3 — the approved same-day contract (one end-of-day net batch per
    // local date; no intraday ordering is invented), stated precisely.
    push('Events on the same day are counted together at the end of that day, so the lowest balance shown is an end-of-day balance.');
    push('The timeline and its markers show dated events only; planned savings and goals aren’t shown on it.');
    return (
      <ExplanationSection title="What this means" testID="look-ahead-assumptions">
        <View testID="look-ahead-assumptions-body">
          {r.informationalPlan.notice ? <ExplanationNote text={r.informationalPlan.notice} /> : null}
          {lines.map((line) => (
            <ExplanationNote key={line.key} bullet text={line.text} testID={line.key} />
          ))}
        </View>
      </ExplanationSection>
    );
  };

  const renderBody = () => {
    if (!result || !presentation) return null;
    if (!result.available) {
      // Fail closed: no summary figure, no $0 standing in for an unknown amount.
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
          <ExplanationProvenance text={EXPLANATION_PROVENANCE} testID="look-ahead-provenance" />
        </View>
      );
    }
    const caution = presentation.cashFlowStatus?.tone === 'caution';
    return (
      <View testID="look-ahead-result">
        <ExplanationSummary
          left={{
            label: 'Estimated balance',
            value: presentation.headlineAmount ?? '',
            spokenValue: presentation.headlineAmountSpoken,
            tone: presentation.state === 'below_zero' ? 'warning' : 'default',
            testID: 'look-ahead-amount',
            figureTestID: 'look-ahead-amount-figure',
          }}
          right={
            guidePresentation
              ? {
                  label: 'About per day',
                  value: guidePresentation.value,
                  caption: guidePresentation.caption,
                  tone: guidePresentation.tone === 'muted' ? 'muted' : 'default',
                  testID: 'look-ahead-daily-amount',
                  captionTestID: 'look-ahead-daily-caption',
                }
              : null
          }
          caption="Before everyday spending."
          testID="look-ahead-summary"
        />
        {/* The active warning stays beside the result — never moved into a footer. */}
        {caution && presentation.cashFlowStatus ? (
          <ExplanationNotice text={presentation.cashFlowStatus.title} detail={presentation.cashFlowStatus.detail} testID="look-ahead-cashflow" detailTestID={presentation.cashFlowStatus.detailIsDeficit ? 'look-ahead-deficit' : undefined} />
        ) : presentation.cashFlowLine ? (
          <ExplanationNote text={presentation.cashFlowLine} testID="look-ahead-cashflow" />
        ) : null}
        {presentation.deficitLine && !presentation.cashFlowStatus?.detailIsDeficit ? <ExplanationNote text={presentation.deficitLine} testID="look-ahead-deficit" /> : null}
        {renderBreakdown(result)}
        {renderDailyGuide()}
        {/* The lowest scheduled point is a DIFFERENT fact from the guide's binding day. */}
        <ExplanationSection title="Lowest end-of-day balance" testID="look-ahead-lowest">
          <ExplanationRow label={`On ${fmtShortDate(result.lowest.date)}`} value={formatCentsCentsAware(result.lowest.cents)} testID="look-ahead-lowest-row" />
        </ExplanationSection>
        {renderOutside(result)}
        {renderAssumptions(result)}
        <ExplanationProvenance text={EXPLANATION_PROVENANCE} testID="look-ahead-provenance" />
      </View>
    );
  };

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismissed}
      title={WHY_THIS_AMOUNT_TITLE}
      breadcrumb={<ExplanationSubtitle text={subtitle} testID="look-ahead-subtitle" />}
      isDirty={false}
      focusTitleOnShow
      footer={footer}
    >
      {renderBody()}
    </KeyboardSheet>
  );
}
