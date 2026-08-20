import { LuluScoreResult } from './luluScore';
import { brand } from '../brand';

/**
 * Pass 2B — the compact Navilo Score chip's presentation contract, shared
 * so the Briefing's chip and any other compact consumer read one single
 * source rather than re-deriving wording. Wraps the existing, unmodified
 * computeLuluScore result (LuluScoreResult) — never recomputes the score,
 * never re-derives its formula, weights, or qualification rules.
 *
 * States:
 * - 'locked': the existing, unmodified LuluScoreResult.locked === true —
 *   the same "no income entered yet" gate computeLuluScore has always used.
 *   No number is ever shown for this state.
 * - 'unavailable': a defensive guard only — computeLuluScore's own clamp(0,100)
 *   already guarantees a finite in-range score whenever locked is false, so
 *   this branch should be structurally unreachable in practice, but this
 *   presentation layer never trusts an out-of-range/non-finite value as
 *   authoritative regardless (same defensive posture as
 *   safeToSpendPresentation.ts's toAuthoritativeCents from Pass 2A). Covers
 *   "incomplete"/"unavailable"/"legacy or invalid" data concerns from a
 *   single, safe fallback — no number is ever shown here either.
 * - 'available': the normal case — an authoritative, already-clamped score.
 *
 * This app has no separate "guest" user/auth state (single local data
 * model) — the closest equivalent is the same 'locked' state above (no
 * income recorded yet), so a hypothetical "guest" concern collapses into
 * the existing locked handling rather than a new state.
 *
 * Never invents an improvement/decline claim: this selector does not read
 * or derive any trend from data.luluScoreHistory — only the current,
 * already-computed score and factual, recorded-information wording (PRD
 * ask: "must not invent improvement or decline without an established
 * trend"). A future pass may add a trend line once explicitly authorised;
 * this one deliberately does not.
 */
export type ScoreChipState = 'locked' | 'unavailable' | 'available';

export interface ScoreChipPresentation {
  state: ScoreChipState;
  /** Always present — the chip's label text. "Navilo Score 88" when
   * available; just "Navilo Score" for locked/unavailable, since no number
   * exists to show. */
  label: string;
  /** The chip's secondary/supporting text — factual, tied to recorded
   * information, never a claim like "doing incredibly well." */
  supportingText: string;
  /** The authoritative score value, or null when not available to show.
   * Never 0 as a stand-in for "missing" — a missing score is represented
   * by this being null, exactly like amountCents in
   * safeToSpendPresentation.ts. */
  scoreValue: number | null;
  tone: 'normal' | 'muted';
}

export function selectScoreChipPresentation(luluScore: LuluScoreResult): ScoreChipPresentation {
  // Design 5.1 Wave 5 — Score containment. An incomplete or invalid result
  // is stated as such and NEVER clamped into a visible number or a
  // fabricated zero (invariant 16). The wording is deliberately identical
  // for both non-valid states: from the customer's point of view "locked"
  // and "unavailable" are the same fact — Nolie does not have enough yet.
  if (luluScore.locked) {
    return {
      state: 'locked',
      label: brand.scoreName,
      supportingText: 'Not enough recorded yet',
      scoreValue: null,
      tone: 'muted',
    };
  }
  if (!Number.isFinite(luluScore.score) || luluScore.score < 0 || luluScore.score > 100) {
    return {
      state: 'unavailable',
      label: brand.scoreName,
      supportingText: 'Not enough recorded yet',
      scoreValue: null,
      tone: 'muted',
    };
  }
  // A valid result carries the full containment: interim, sourced from what
  // the customer recorded, and explicitly not a credit score. It is never
  // described as factual, predictive, an eligibility signal, a wellbeing
  // measure, a recommendation or advice.
  return {
    state: 'available',
    label: `${brand.scoreName} ${luluScore.score}`,
    supportingText: 'Interim · Based on what you’ve recorded · Not a credit score',
    scoreValue: luluScore.score,
    tone: 'normal',
  };
}
