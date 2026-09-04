/**
 * Pass B — Look Ahead presentation selector.
 *
 * Converts a `LookAheadResult` into calm, approved customer wording and a typed
 * state. It formats dates and currency and chooses copy ONLY — it never
 * recalculates money, and it never surfaces a raw negative as the dominant
 * headline (a final deficit is expressed as a positive gap). No React, no side
 * effects.
 */

import { LocalDate } from './localCalendar';
import { LookAheadIssue, LookAheadResult } from './lookAheadProjection';

export type LookAheadPresentationState =
  | 'positive_no_shortfall'
  | 'positive_after_shortfall'
  | 'below_zero'
  | 'no_eligible_balance'
  | 'unavailable';

export interface LookAheadPresentation {
  state: LookAheadPresentationState;
  headline: string;
  /** The dominant amount, already framed non-negative (a deficit is a gap). */
  headlineAmount?: string;
  cashFlowLine?: string;
  lowestLine?: string;
  assumedLine?: string;
  savingsLine?: string;
  protectedLine?: string;
  subtext?: string;
  issues?: LookAheadIssue[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: LocalDate): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}
/** Cents → "$1,234.56" (negative as "-$1,234.56"). */
function fmtCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars.toLocaleString()}.${rem}`;
}
/** Positive-magnitude money (for gaps/shortfalls): always "$X.XX". */
function fmtGap(cents: number): string {
  return fmtCents(Math.abs(cents)).replace('-', '');
}

export function selectLookAheadPresentation(result: LookAheadResult): LookAheadPresentation {
  if (!result.available) {
    const noBalance = result.issues.some((i) => i.code === 'no_eligible_balance');
    return {
      state: noBalance ? 'no_eligible_balance' : 'unavailable',
      headline: noBalance ? 'Add a spendable account to look ahead' : "Look ahead isn't available right now",
      subtext: noBalance ? 'Opt an everyday or savings account into your available money to see this.' : 'Some scheduled information needs your attention before this can be estimated.',
      issues: result.issues,
    };
  }

  const dateStr = fmtDate(result.target);
  const assumedLine = result.assumptions.count > 0
    ? (result.assumptions.targetIsPayday ? `Includes scheduled income on ${dateStr}` : `Includes ${result.assumptions.count} assumed income ${result.assumptions.count === 1 ? 'payment' : 'payments'}`)
    : undefined;
  const savingsLine = result.informationalPlan.combinedCents !== null && result.informationalPlan.combinedCents > 0
    ? `You also plan to set aside about ${fmtGap(result.informationalPlan.combinedCents)} for savings and goals — not subtracted here`
    : undefined;
  // Truthful, claim-free heading for the excluded-savings disclosure: it makes
  // no assertion that Nolie invented, moved, locked or reserved anything, nor
  // that the customer explicitly chose this — the accounts are simply savings
  // balances not opted into spendable money. The body (with the account count
  // and the opening amount) is composed by the sheet from the authoritative
  // `protectedSavings.accounts`.
  const protectedLine = result.protectedSavings.cents > 0 ? 'Savings not included in this estimate' : undefined;
  const subtext = "Based on what you've recorded and scheduled";
  const lowestLine = `Lowest estimated cash position: ${fmtCents(result.lowest.cents)} on ${fmtDate(result.lowest.date)}`;

  if (result.targetCents < 0) {
    // Final deficit — never a negative dominant headline; express as a positive gap.
    return {
      state: 'below_zero',
      headline: `Estimated position by ${dateStr}`,
      headlineAmount: fmtGap(result.targetCents),
      cashFlowLine: `Your scheduled commitments may be about ${fmtGap(result.targetCents)} more than your cash by ${dateStr}`,
      lowestLine,
      assumedLine,
      savingsLine,
      protectedLine,
      subtext,
    };
  }

  if (result.firstShortfall) {
    return {
      state: 'positive_after_shortfall',
      headline: `Estimated position by ${dateStr}`,
      headlineAmount: fmtCents(result.targetCents),
      cashFlowLine: `You may be short by about ${fmtGap(result.firstShortfall.shortfallCents)} on ${fmtDate(result.firstShortfall.date)}`,
      lowestLine,
      assumedLine,
      savingsLine,
      protectedLine,
      subtext,
    };
  }

  return {
    state: 'positive_no_shortfall',
    headline: `Estimated position by ${dateStr}`,
    headlineAmount: fmtCents(result.targetCents),
    cashFlowLine: 'No shortfall found in this estimate',
    lowestLine,
    assumedLine,
    savingsLine,
    protectedLine,
    subtext,
  };
}
