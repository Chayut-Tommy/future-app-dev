/**
 * Pass 2C physical-device correction #2 — the explicit validity contract
 * for the radial Score gauge (ScoreRadialGauge.tsx), extracted into its
 * own pure, RN-free module (matching scoreChipPresentation.ts's own
 * shape) specifically so it can be exercised with a real, direct runtime
 * test — this file has no react/react-native import, unlike the .tsx
 * component it feeds.
 *
 * This is NOT a second Score-state engine: it computes nothing about the
 * score itself (no formula, no weights, no bands). It only classifies an
 * already-computed score/authoritative pair as safe to display or not, at
 * the exact boundary where a number is about to be drawn on screen. The
 * previous version of this logic lived inline in ScoreRadialGauge.tsx and
 * CLAMPED an out-of-range/non-finite score into [0,100] whenever
 * `authoritative` was true — turning e.g. 9999 into a fabricated "100/100"
 * and -5 into a fabricated "0/100". Clamping is not a safe unavailable-
 * state treatment; only an explicit validity check is, which is what this
 * function is.
 */
export type ScoreGaugePresentation = { state: 'available'; value: number } | { state: 'unavailable' };

/**
 * `authoritative` is the caller's existing scoreChipPresentation.state ===
 * 'available' check (unchanged, upstream); `score` is
 * scoreChipPresentation.scoreValue. Even though selectScoreChipPresentation
 * already guarantees a finite, in-range value whenever state is
 * 'available', this function does not trust that upstream guarantee
 * blindly — it re-checks explicitly, so a future regression upstream fails
 * safe (renders "—") instead of failing open (renders a fabricated or
 * out-of-range number). A genuine authoritative score of exactly 0 is
 * preserved as valid — this function never treats 0 as falsy/missing.
 */
export function toScoreGaugePresentation(authoritative: boolean, score: number | null | undefined): ScoreGaugePresentation {
  const isValidAuthoritativeScore = authoritative && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
  return isValidAuthoritativeScore ? { state: 'available', value: score as number } : { state: 'unavailable' };
}
