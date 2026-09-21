/**
 * Pass B — Look Ahead presentation selector (Pass C.2 wording).
 *
 * Converts a `LookAheadResult` into calm, approved customer wording and a typed
 * state. It formats dates and currency and chooses copy ONLY — it never
 * recalculates money, and it never surfaces a raw negative as the dominant
 * headline (a final deficit is expressed as a positive gap). No React, no side
 * effects.
 *
 * C.2 (Specification v1.3 §5.4/§6): the headline is "Estimated balance by
 * [date]"; the lowest position is a SUBORDINATE cash-flow status ("Cash flow
 * stays above $0 · Lowest scheduled balance $X on D Mon") and a shortfall reads
 * "Possible shortfall of $X on D Mon". `selectDailyGuidePresentation` renders
 * the guarded About-per-day result. Forbidden anywhere: safe to spend, you can
 * safely spend, guaranteed, recommended spending, your daily spend, advice.
 */

import { LocalDate, addCalendarDays } from './localCalendar';
import { LookAheadIssue, LookAheadResult } from './lookAheadProjection';
import { DailyGuideResult } from './dailyGuide';
import { formatCentsCentsAware } from './money';
import { forTheNextDaysLabel } from './moneyComposition';

export type LookAheadPresentationState =
  | 'positive_no_shortfall'
  | 'positive_after_shortfall'
  | 'below_zero'
  | 'no_eligible_balance'
  | 'unavailable';

export type CashFlowTone = 'neutral' | 'caution';

export interface LookAheadPresentation {
  state: LookAheadPresentationState;
  headline: string;
  /** The dominant amount, already framed non-negative (a deficit is a gap). */
  headlineAmount?: string;
  /** The subordinate cash-flow status line (healthy or possible shortfall). */
  cashFlowLine?: string;
  /** Neutral (Ocean Blue / no colour emphasis) when healthy; caution (yellow)
   * for a shortfall. Never green merely for being healthy; never red here. */
  cashFlowTone?: CashFlowTone;
  /** Final-deficit explanation (only when the target itself is below zero). */
  deficitLine?: string;
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
/** Short "7 Sep" for the compact status line. */
export function fmtShortDate(d: LocalDate): string {
  return `${d.day} ${MONTHS[d.month - 1]}`;
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

/** Pass C.3 — the approved cautious status wording (never "stays above $0"). */
export const NO_SHORTFALL_DETECTED = 'No scheduled shortfall detected';
/** Pass C.3 — the provenance line every future-date surface repeats. */
export const LOOK_AHEAD_PROVENANCE = "Based on what you've recorded and scheduled";

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
  const headline = `Estimated balance by ${dateStr}`;
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
  const subtext = LOOK_AHEAD_PROVENANCE;
  const lowestLine = `Lowest estimated end-of-day cash position: ${fmtCents(result.lowest.cents)} on ${fmtDate(result.lowest.date)}`;

  if (result.targetCents < 0) {
    // Final deficit — never a negative dominant headline; express as a positive gap.
    // The path is below zero at the target, so a first shortfall always exists.
    const first = result.firstShortfall ?? { date: result.target, shortfallCents: -result.targetCents };
    return {
      state: 'below_zero',
      headline,
      headlineAmount: fmtGap(result.targetCents),
      cashFlowLine: `Possible shortfall of ${formatCentsCentsAware(first.shortfallCents)} on ${fmtShortDate(first.date)}`,
      cashFlowTone: 'caution',
      deficitLine: `Your scheduled commitments may be about ${fmtGap(result.targetCents)} more than your cash by ${dateStr}`,
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
      headline,
      headlineAmount: fmtCents(result.targetCents),
      cashFlowLine: `Possible shortfall of ${formatCentsCentsAware(result.firstShortfall.shortfallCents)} on ${fmtShortDate(result.firstShortfall.date)}`,
      cashFlowTone: 'caution',
      lowestLine,
      assumedLine,
      savingsLine,
      protectedLine,
      subtext,
    };
  }

  // Healthy — the lowest scheduled balance is exactly the path's minimum. When
  // the lowest point IS the estimate itself (a flat or rising path), repeating
  // the same amount adds nothing (Pass C.2 correction, P3) — say that instead.
  //
  // Pass C.3 — cautious wording. Future income is ASSUMED and everything here is
  // manually recorded, so the status never makes the categorical claim "your
  // balance stays above $0"; it reports that no scheduled shortfall was
  // DETECTED. The minimum is named precisely as an END-OF-DAY balance, because
  // the approved contract (Specification v1.3 §7, Plan v1.1 §B) nets every
  // event on one local date into a single end-of-day checkpoint and never
  // invents an intraday ordering.
  const lowestPart =
    result.lowest.cents === result.targetCents
      ? `No dip below your estimated balance before ${fmtShortDate(result.target)}`
      : `Lowest scheduled end-of-day balance ${formatCentsCentsAware(result.lowest.cents)} on ${fmtShortDate(result.lowest.date)}`;
  return {
    state: 'positive_no_shortfall',
    headline,
    headlineAmount: fmtCents(result.targetCents),
    cashFlowLine: `${NO_SHORTFALL_DETECTED} · ${lowestPart}`,
    cashFlowTone: 'neutral',
    lowestLine,
    assumedLine,
    savingsLine,
    protectedLine,
    subtext,
  };
}

// --- About per day (Pass C.2) --------------------------------------------

/** The approved accessible explanation of what the guide is (§6, §10). */
export const DAILY_GUIDE_ACCESSIBLE_EXPLANATION =
  'A planning guide based on your included balances and scheduled cash flow. Actual income, bills and spending may differ.';

/** The approved plain-language explanation for Why this amount? (§18). */
export const DAILY_GUIDE_EXPLANATION =
  'This guide spreads an equal amount across the days before your selected date while keeping enough for the scheduled commitments Nolie knows about through your next payday.';

export interface DailyGuidePresentation {
  status: DailyGuideResult['status'];
  label: 'ABOUT PER DAY';
  /** "$2,425" (rounded DOWN), "$0", or "—" when no guide can be shown. */
  value: string;
  caption: string;
  tone: 'default' | 'warning' | 'muted';
  /** The single spoken label for the region: amount, period, and that it is an estimate. */
  accessibilityLabel: string;
  /** Plain reason / explanation for Why this amount?. */
  explanation: string;
  /** "For the next N days" — also exposed for the sheet. */
  periodLine: string;
  /** Pass C.2 correction — which local dates the guide covers, explicitly:
   * "This guide covers 14 Sep, before your 15 Sep target." (one day) or
   * "This guide covers 14 Sep to 23 Sep, before your 24 Sep target." */
  coverageLine: string;
  /** What is protected through the guard payday, in one line — or why no
   * guard could be applied. Null when the estimate itself is unavailable. */
  protectedLine: string | null;
  /** Pass C.3 — the ACTUAL binding reason, read from the engine's limiting
   * metadata: which day limits the guide, the scheduled position that day
   * (before everyday spending) and how many days of spending are counted by
   * then, so the customer can see position ÷ days = guide. Never a
   * target-balance ÷ days formula. Null unless the guide is available/zero. */
  limitingLine: string | null;
}

function limitingLineFor(guide: DailyGuideResult): string | null {
  if (guide.limitingDate === null || guide.limitingPositionCents === null || guide.limitingAllocationDays === null || guide.exactCents === null) return null;
  const date = fmtShortDate(guide.limitingDate);
  const position = formatCentsCentsAware(guide.limitingPositionCents);
  const k = guide.limitingAllocationDays;
  const days = k === 1 ? '1 day of spending is counted' : `${k} days of spending are counted`;
  if (guide.status === 'zero') {
    return `Tightest day: ${date}. Everything scheduled by then uses up the money available, so there’s no daily room.`;
  }
  const value = formatCentsCentsAware(guide.displayCents ?? 0);
  const rounded = guide.exactCents % 100 !== 0 || guide.limitingPositionCents % k !== 0;
  return `Tightest day: ${date}. About ${position} is scheduled to be left by then before everyday spending, and ${days} by then, so ${position} ÷ ${k} = ${value} a day${rounded ? ', rounded down' : ''}.`;
}

function coverageLineFor(guide: DailyGuideResult): string {
  const n = guide.allocationDays;
  const first = fmtShortDate(guide.asOf);
  const last = fmtShortDate(addCalendarDays(guide.target, -1));
  const range = n === 1 ? first : `${first} to ${last}`;
  return `This guide covers ${range}, before your ${fmtShortDate(guide.target)} target.`;
}

function protectedLineFor(guide: DailyGuideResult): string | null {
  if (!guide.guardPayday) return null;
  const g = fmtShortDate(guide.guardPayday);
  if (guide.obligationsAfterTargetCents > 0) {
    return `Keeps ${formatCentsCentsAware(guide.obligationsAfterTargetCents)} for commitments due after ${fmtShortDate(guide.target)} through your ${g} payday.`;
  }
  return `Nothing else is scheduled between ${fmtShortDate(guide.target)} and your ${g} payday.`;
}

export function selectDailyGuidePresentation(guide: DailyGuideResult): DailyGuidePresentation {
  const n = guide.allocationDays;
  const periodLine = forTheNextDaysLabel(n);
  const label = 'ABOUT PER DAY' as const;
  const coverageLine = coverageLineFor(guide);
  const protectedLine = protectedLineFor(guide);
  const limitingLine = limitingLineFor(guide);
  switch (guide.status) {
    case 'available': {
      const value = formatCentsCentsAware(guide.displayCents ?? 0);
      return {
        status: guide.status,
        label,
        value,
        caption: periodLine,
        tone: 'default',
        accessibilityLabel: `About per day: ${value}. ${periodLine}. An estimate. ${DAILY_GUIDE_ACCESSIBLE_EXPLANATION}`,
        explanation: DAILY_GUIDE_EXPLANATION,
        periodLine,
        coverageLine,
        protectedLine,
        limitingLine,
      };
    }
    case 'zero':
      return {
        status: guide.status,
        label,
        value: '$0',
        caption: 'No additional daily room found',
        tone: 'muted',
        accessibilityLabel: `About per day: $0. No additional daily room found. ${periodLine}. An estimate. ${DAILY_GUIDE_ACCESSIBLE_EXPLANATION}`,
        explanation: guide.reason,
        periodLine,
        coverageLine,
        protectedLine,
        limitingLine,
      };
    case 'existing_shortfall':
      return {
        status: guide.status,
        label,
        value: '—',
        caption: 'Unavailable while a shortfall is expected',
        tone: 'muted',
        accessibilityLabel: 'About per day: unavailable while a shortfall is expected. See the cash-flow status for the date and amount.',
        explanation: guide.reason,
        periodLine,
        coverageLine,
        protectedLine,
        limitingLine: null,
      };
    case 'missing_guard_payday':
      return {
        status: guide.status,
        label,
        value: '—',
        caption: 'Daily guide unavailable',
        tone: 'muted',
        accessibilityLabel: `About per day: daily guide unavailable. ${guide.reason}`,
        explanation: guide.reason,
        periodLine,
        coverageLine,
        protectedLine: null,
        limitingLine: null,
      };
    case 'invalid_material_input':
    case 'unavailable':
    default:
      return {
        status: guide.status,
        label,
        value: '—',
        caption: 'Daily guide unavailable',
        tone: 'muted',
        accessibilityLabel: `About per day: daily guide unavailable. ${guide.reason}`,
        explanation: guide.reason,
        periodLine,
        coverageLine,
        protectedLine: null,
        limitingLine: null,
      };
  }
}
