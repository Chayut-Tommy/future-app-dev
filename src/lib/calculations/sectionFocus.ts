/**
 * Pass 2B correction — the pure decision core of Grow's section-focus
 * mechanism (DiscoverScreen.tsx). Extracted so the pending/fulfil contract
 * is genuinely unit-testable with real function calls, not just structural
 * source-text matching: DiscoverScreen owns the actual refs, ScrollView,
 * and Modal state, but every decision about whether a request can be
 * fulfilled right now — and whether fulfilling it should also open the
 * Score sheet — is made here, with no React Native dependency.
 *
 * Contract: a focus request is received (parseSectionFocusRequest), retained
 * as pending by the caller, and re-attempted (computeSectionFocusFulfillment)
 * whenever either a new request arrives or a target section reports layout.
 * A request that cannot yet be fulfilled (its target isn't measurable yet)
 * is reported as not-fulfilled and the caller MUST keep it pending — this
 * module never times out or gives up on a request itself; only a genuinely
 * newer request (a fresh parseSectionFocusRequest result) is allowed to
 * replace an unfulfilled one.
 */

export type SectionFocusTarget = 'financial-learning' | 'score' | 'journey';

export interface SectionFocusRequest {
  target: SectionFocusTarget;
  requestId: number;
}

/** The latest known y-offset for every focusable section, or null when that
 * section hasn't reported layout yet — the same null-sentinel "not yet
 * measured" convention this repository already uses (MoneyScreen.tsx). */
export interface SectionFocusMeasurements {
  'financial-learning': number | null;
  score: number | null;
  journey: number | null;
}

export interface SectionFocusFulfillment {
  fulfilled: boolean;
  /** Present only when fulfilled — the exact measured y to scroll to. */
  scrollY: number | null;
  /** True only when fulfilling a 'score' request whose score is genuinely
   * authoritative (see the caller's scoreAuthoritative argument) — never
   * true for 'financial-learning'/'journey', and never true for a locked
   * or otherwise non-authoritative Score, where ScoreExplanationSheet has
   * no meaningful content to show (see luluScore.ts's LOCKED_RESULT —
   * categories is `[]` while locked). */
  shouldOpenScoreSheet: boolean;
  /** True only when fulfilling a 'journey' request — Grow's one-tap Journey
   * destination correction: JourneyTimeline should already show every
   * milestone, not its own collapsed "View full journey" gate a second
   * time. Never true for 'score'/'financial-learning'. An ordinary,
   * non-Today-driven visit to Grow's Journey section never sets this (no
   * pending request exists at all in that case), so JourneyTimeline still
   * starts collapsed there — unchanged, ordinary behaviour. */
  shouldExpandJourney: boolean;
}

const NO_FULFILLMENT: SectionFocusFulfillment = { fulfilled: false, scrollY: null, shouldOpenScoreSheet: false, shouldExpandJourney: false };

/**
 * Validates raw route params into a typed request, or null when there is no
 * genuine targeted request to act on. Requires both a recognised target AND
 * a numeric requestId — a target without a requestId is never treated as
 * a request (TodayScreen always stamps one; its absence means these params
 * aren't a real focus request at all, e.g. after being cleared to
 * `undefined`).
 */
export function parseSectionFocusRequest(scrollTo: unknown, requestId: unknown): SectionFocusRequest | null {
  if (scrollTo !== 'financial-learning' && scrollTo !== 'score' && scrollTo !== 'journey') return null;
  if (typeof requestId !== 'number') return null;
  return { target: scrollTo, requestId };
}

/**
 * The pure fulfillment decision. Given the current pending request (or
 * null) and the latest known measurements, decides whether it can be
 * fulfilled right now. Deliberately stateless and side-effect free: it does
 * not scroll, does not open anything, and does not clear the pending
 * request — the caller does all of that, using this result.
 */
export function computeSectionFocusFulfillment(
  pending: SectionFocusRequest | null,
  measurements: SectionFocusMeasurements,
  scoreAuthoritative: boolean
): SectionFocusFulfillment {
  if (!pending) return NO_FULFILLMENT;
  const y = measurements[pending.target];
  if (y === null) return NO_FULFILLMENT; // not yet measurable — caller must keep this request pending
  return {
    fulfilled: true,
    scrollY: y,
    shouldOpenScoreSheet: pending.target === 'score' && scoreAuthoritative,
    shouldExpandJourney: pending.target === 'journey',
  };
}
