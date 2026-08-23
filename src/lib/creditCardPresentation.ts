/**
 * Nolie Design 5.1 Wave 9a closure — the single shared source for every
 * customer-facing credit-card WORDING decision.
 *
 * Three compliance problems all had the same shape: the same claim was
 * written independently on more than one surface, so they drifted and each
 * had to be corrected separately.
 *
 *   A. "Add your card so Nolie can help you: Reduce interest / Improve
 *      credit utilisation / Create a payoff plan / Avoid missed payments"
 *      appeared in BOTH AddCreditCardModal and the Cards empty state, and
 *      promised outcomes a manual-recording app cannot deliver.
 *   B. Utilisation was labelled "Healthy" / "Getting high" — a health and
 *      trajectory claim about the customer, not a fact about the number.
 *   C. Interest illustrations did not distinguish an ASSUMED rate from a
 *      rate the customer actually recorded.
 *
 * This module is deliberately RN-free and pure so the legacy harness can
 * import it and assert on the real strings, not on mirrored copies.
 *
 * IT CONTAINS NO FINANCIAL FORMULA. Utilisation bands are DERIVED from the
 * protected engine (`utilisationStatus`) rather than restated, so a
 * threshold can never drift out of sync here. The interest amount itself
 * still comes from `computeCreditCardInterestEstimate`.
 */

import { brand } from './brand';
import { utilisationStatus, Tone } from './calculations/creditHealth';

// ---------------------------------------------------------------------------
// A. Factual card-details panel (replaces the outcome-promise panel)
// ---------------------------------------------------------------------------

/**
 * The one factual panel shown on every Add/Edit credit-card entry point and
 * on the Cards empty state. No benefit checkmarks, no promised outcome, and
 * no suggestion that Nolie moves money, contacts an issuer, or guarantees
 * that a reminder will arrive.
 */
export const CARD_DETAILS_PANEL = {
  title: 'Keep your card details together',
  body: `Record your balance, limit, due date, expected repayment and optional annual purchase rate. ${brand.name} uses what you record to show reminders and illustrative estimates.`,
} as const;

/** Words that assert an outcome rather than describe a recording. Exported
 * so a test can sweep the real card surfaces for them instead of hard-coding
 * the banned list in the test file. */
export const OUTCOME_PROMISE_TERMS: readonly string[] = [
  'reduce interest',
  'improve credit utilisation',
  'improve utilisation',
  'create a payoff plan',
  'create payoff plans',
  'payoff plan',
  'avoid missed payments',
  'can help you',
  'optimise',
  'optimize',
  'recommended',
  'best rate',
  'real payoff scenarios',
];

// ---------------------------------------------------------------------------
// B. Factual utilisation labels
// ---------------------------------------------------------------------------

export type UtilisationBand = 'low' | 'moderate' | 'high';

/**
 * Engine label -> customer-facing label. Keyed by the protected engine's own
 * output so the THRESHOLDS are never restated here: change the engine and
 * this mapping follows automatically, or fails loudly via the exhaustive
 * test rather than silently mislabelling a band.
 *
 * "Healthy" and "Getting high" were retired because both describe the
 * customer's standing (and imply a trajectory) rather than the recorded
 * number. Nolie has no access to a credit file and must never imply a
 * score, creditworthiness, approval likelihood or product recommendation.
 */
const ENGINE_LABEL_TO_BAND: Readonly<Record<string, UtilisationBand>> = {
  Healthy: 'low',
  'Getting high': 'moderate',
  'High utilisation': 'high',
};

export const UTILISATION_BAND_LABEL: Readonly<Record<UtilisationBand, string>> = {
  low: 'Low utilisation',
  moderate: 'Moderate utilisation',
  high: 'High utilisation',
};

/** The band for a utilisation ratio, derived from the protected engine. */
export function utilisationBand(utilisation: number): UtilisationBand {
  return ENGINE_LABEL_TO_BAND[utilisationStatus(utilisation).label] ?? 'high';
}

/**
 * The customer-facing utilisation status: the engine's own tone (unchanged)
 * with a factual label. The displayed PERCENTAGE is never computed here —
 * callers keep rendering it exactly as they already do.
 */
export function utilisationPresentation(utilisation: number): { tone: Tone; label: string; band: UtilisationBand } {
  const engine = utilisationStatus(utilisation);
  const band = utilisationBand(utilisation);
  return { tone: engine.tone, label: UTILISATION_BAND_LABEL[band], band };
}

// ---------------------------------------------------------------------------
// C. Assumed vs recorded interest rate
// ---------------------------------------------------------------------------

/**
 * Where the rate in an interest illustration came from.
 *
 * `recorded_rate` includes a recorded 0%. A 0% rate is a real, valid answer
 * — an interest-free or promotional-period card — and must never fall
 * through to the 19.5% assumption. Truthiness (`rate || ASSUMED`) and the
 * previous `rate > 0` test both got this wrong.
 */
export type InterestRateSource = 'assumed_rate' | 'recorded_rate' | 'unavailable';

export interface ResolvedInterestRate {
  source: InterestRateSource;
  /** The annual rate as a decimal fraction; NaN when unavailable. */
  rate: number;
}

/** True only for a rate a customer could genuinely have recorded. */
export function isRecordedRate(annualRate: number | undefined | null): annualRate is number {
  return typeof annualRate === 'number' && Number.isFinite(annualRate) && annualRate >= 0;
}

/**
 * Resolve the rate and its provenance. `assumedRate` is supplied by the
 * caller (always `ASSUMED_CREDIT_CARD_APR`) so this module states no rate
 * of its own.
 */
export function resolveInterestRate(annualRate: number | undefined | null, assumedRate: number): ResolvedInterestRate {
  if (isRecordedRate(annualRate)) return { source: 'recorded_rate', rate: annualRate };
  // A recorded-but-nonsensical value (negative, NaN, Infinity) is NOT
  // silently replaced by the assumption — that would present a fabricated
  // estimate as though it rested on something.
  if (annualRate !== undefined && annualRate !== null) return { source: 'unavailable', rate: NaN };
  if (!Number.isFinite(assumedRate)) return { source: 'unavailable', rate: NaN };
  return { source: 'assumed_rate', rate: assumedRate };
}

/** "19.5%" / "20%" / "0%" — trailing zeros trimmed, never "20.0%". */
export function formatAnnualRate(rate: number): string {
  if (!Number.isFinite(rate)) return '';
  const pct = rate * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** The qualification that must be VISIBLE — never hidden behind an info
 * control — wherever an interest illustration is shown in detail. */
export const ISSUER_TERMS_QUALIFICATION =
  'Your card issuer may calculate interest differently. Interest-free periods, fees, cash-advance rates, compounding and other card terms are not included. Check your statement or card terms.';

/** The short form, for compact rows where the full qualification cannot fit. */
export const ISSUER_TERMS_SHORT = 'issuer terms may differ';

export interface InterestIllustrationInput {
  /** Already computed by the protected engine — never recomputed here. */
  amount: number;
  resolved: ResolvedInterestRate;
  cycleDays: number;
  /** e.g. "Due in 2 days" — the caller's existing due-date presentation. */
  dueLabel?: string;
}

export interface CompactInterestIllustration {
  /** Line 1: what the number is. */
  amountLine: string;
  /** Line 2: where the rate came from, plus the short qualification. */
  sourceLine: string;
}

/**
 * The two-line compact form used on Wealth liability rows and card rows.
 * Never calls the amount a penalty, a charge, a forecast, or an amount the
 * issuer will actually bill.
 */
export function compactInterestIllustration(input: InterestIllustrationInput): CompactInterestIllustration | null {
  if (input.resolved.source === 'unavailable' || !Number.isFinite(input.amount)) return null;
  const amount = `~$${Math.round(input.amount).toLocaleString()}`;
  const prefix = input.dueLabel ? `${input.dueLabel} · ` : '';
  const amountLine = `${prefix}estimated ${amount} interest over ${input.cycleDays} days if the recorded balance stayed unpaid`;
  const rate = formatAnnualRate(input.resolved.rate);
  const sourceLine =
    input.resolved.source === 'assumed_rate'
      ? `Using an assumed ${rate} p.a. · ${ISSUER_TERMS_SHORT}`
      : `Using your recorded ${rate} p.a. · ${ISSUER_TERMS_SHORT}`;
  return { amountLine, sourceLine };
}

export interface DetailedInterestIllustration {
  heading: string;
  amountText: string;
  sourceText: string;
  qualification: string;
  /** One composed string for assistive technology. The rate source and the
   * issuer qualification are BOTH included — a material assumption must
   * never be reachable only by a sighted customer opening an info control. */
  accessibilityLabel: string;
}

/** The detailed form used in the reminder sheet. */
export function detailedInterestIllustration(input: InterestIllustrationInput): DetailedInterestIllustration | null {
  if (input.resolved.source === 'unavailable' || !Number.isFinite(input.amount)) return null;
  const heading = `Illustrative interest over ${input.cycleDays} days if the recorded balance stayed unpaid`;
  const amountText = `~$${Math.round(input.amount).toLocaleString()}`;
  const rate = formatAnnualRate(input.resolved.rate);
  const sourceText =
    input.resolved.source === 'assumed_rate'
      ? `Uses an assumed annual rate of ${rate} because no rate is recorded.`
      : `Uses the ${rate} p.a. rate you recorded.`;
  return {
    heading,
    amountText,
    sourceText,
    qualification: ISSUER_TERMS_QUALIFICATION,
    accessibilityLabel: `${heading}. ${amountText}. ${sourceText} ${ISSUER_TERMS_QUALIFICATION}`,
  };
}

// ---------------------------------------------------------------------------
// C (cont.) — the rate field's own label and helper
// ---------------------------------------------------------------------------

/**
 * Inspection confirmed this single stored field (`CreditCard.apr`) feeds one
 * thing only: the purchase-balance interest illustration
 * (`computeCreditCardInterestEstimate` -> daily rate on the recorded
 * balance) plus the payoff-acceleration string. It does not model
 * cash-advance rates, promotional rates, or any wider contract, so naming it
 * for what it actually drives is accurate rather than a narrowing.
 */
export const PURCHASE_RATE_FIELD = {
  label: 'Purchase interest rate p.a. % (optional)',
  helper: 'Use the annual purchase rate shown on your card statement. Other rates and card terms may differ.',
} as const;

/** Helper shown when the field is left blank. States the assumption plainly
 * and promises nothing about accuracy improving an outcome. */
export function purchaseRateBlankHelper(assumedRate: number): string {
  return `Leave blank and ${brand.name} will use an assumed ${formatAnnualRate(assumedRate)} p.a. for illustrative estimates.`;
}

// ---------------------------------------------------------------------------
// B (cont.) — debt-overview scenario copy
// ---------------------------------------------------------------------------

/** Replaces "…can show real payoff scenarios here." — an illustration is not
 * a plan, and "real" overstated what the recorded inputs support. */
export const DEBT_SCENARIO_PROMPT =
  'Add an annual rate and expected repayment to view an illustrative scenario based on what you recorded.';
