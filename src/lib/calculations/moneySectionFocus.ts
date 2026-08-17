/**
 * Final Pass 2D device-test correction, §9 — Money's own measured,
 * pending/requestId focus-request module, adapted from the exact same
 * proven contract sectionFocus.ts already established for Grow
 * (DiscoverScreen.tsx): a focus request is received (parseMoneySectionFocusRequest),
 * retained as pending by the caller, and re-attempted
 * (computeMoneySectionFocusFulfillment) whenever either a new request
 * arrives or a target section reports layout. A request that cannot yet be
 * fulfilled (its target isn't measurable yet) is reported as not-fulfilled
 * and the caller MUST keep it pending — this module never times out or
 * gives up on a request itself; only a genuinely newer request (a fresh
 * parseMoneySectionFocusRequest result) is allowed to replace an
 * unfulfilled one.
 *
 * A distinct module rather than extending sectionFocus.ts — Money's own
 * targets ('aup' | 'timeline' | 'this_month') are a different domain from
 * Grow's, and sectionFocus.ts's SectionFocusMeasurements/SectionFocusFulfillment
 * types are already a closed, specific shape for Grow's own seven targets;
 * adding an unrelated screen's targets there would blur what that module is
 * for. The PATTERN is reused byte-for-byte; the types are not force-shared.
 *
 * 'this_month' added for Worth Knowing (Today, replacing Cashflow Focus) —
 * its payment-source-concentration insight (WK-04) needs a real, existing
 * destination rather than a new screen; this scrolls to Money's existing
 * This Month section (the same one the exact figure it references already
 * lives in), never auto-opens ThisMonthCard's own sources sheet (that
 * remains local, unconnected component state — scrolling there is the least-
 * invasive genuine destination, matching Worth Knowing's own "reuse existing
 * navigation, don't add a new screen" requirement).
 *
 * Confirmed root cause this replaces (§9 of this round's final report):
 * MoneyScreen.tsx's previous scrollTo effect used a finite
 * requestAnimationFrame retry budget (30 frames) with no requestId at all —
 * a request that couldn't measure its target within that budget was
 * silently discarded, and a second identical tap on the same Briefing tile
 * navigated with byte-identical params, which React Navigation treats as no
 * change, so the effect never even re-fired for a repeat tap. This module
 * fixes both: no frame budget (a request stays pending until its target
 * section genuinely reports layout, however long that takes), and every
 * request carries a distinct requestId (stamped by the caller, e.g.
 * TodayScreen.tsx's own focusRequestIdRef), so a repeat tap on the same
 * target is always a genuine, detectable change.
 */
export type MoneySectionFocusTarget = 'aup' | 'timeline' | 'this_month';

export interface MoneySectionFocusRequest {
  target: MoneySectionFocusTarget;
  requestId: number;
  /** Correction round — Worth Knowing's WK-01/WK-02 own inner-timeline
   * destination target (see timelineFocus.ts). Optional and independent of
   * the target/requestId fields above: present only when target is
   * 'timeline' AND the caller supplied one (the pre-existing AUP/event-row/
   * this_month callers never do, and are completely unaffected — this
   * mechanism resolves MoneyTimelineCard's own inner scroll separately from,
   * and in addition to, this module's existing page-level positioning). */
  targetDateKey?: string;
  targetOccurrenceKeys?: string[];
}

/** The latest known y-offset for every focusable Money section, or null
 * when that section hasn't reported layout yet — the same null-sentinel
 * "not yet measured" convention sectionFocus.ts's own
 * SectionFocusMeasurements already uses. */
export interface MoneySectionFocusMeasurements {
  aup: number | null;
  timeline: number | null;
  this_month: number | null;
}

export interface MoneySectionFocusFulfillment {
  fulfilled: boolean;
  /** Present only when fulfilled — the exact measured y to scroll to. */
  scrollY: number | null;
}

const NO_FULFILLMENT: MoneySectionFocusFulfillment = { fulfilled: false, scrollY: null };

/**
 * Validates raw route params into a typed request, or null when there is no
 * genuine targeted request to act on. Requires both a recognised target AND
 * a numeric requestId — a target without a requestId is never treated as a
 * request (an ordinary manual tap on the Money bottom tab carries neither,
 * so it is correctly never mistaken for a targeted focus request — the
 * customer's existing Money scroll position is left exactly where it was,
 * per this round's explicit required distinction).
 */
export function parseMoneySectionFocusRequest(
  scrollTo: unknown,
  requestId: unknown,
  targetDateKey?: unknown,
  targetOccurrenceKeys?: unknown
): MoneySectionFocusRequest | null {
  const VALID_TARGETS: MoneySectionFocusTarget[] = ['aup', 'timeline', 'this_month'];
  if (typeof scrollTo !== 'string' || !(VALID_TARGETS as string[]).includes(scrollTo)) return null;
  if (typeof requestId !== 'number') return null;
  const result: MoneySectionFocusRequest = { target: scrollTo as MoneySectionFocusTarget, requestId };
  // Both optional fields are validated independently and only ever set when
  // genuinely present and well-typed — malformed/absent target metadata
  // never invalidates the whole request (the pre-existing aup/this_month
  // callers, and any future one that doesn't supply a target, are
  // completely unaffected).
  if (typeof targetDateKey === 'string') result.targetDateKey = targetDateKey;
  if (Array.isArray(targetOccurrenceKeys) && targetOccurrenceKeys.every((k) => typeof k === 'string')) {
    result.targetOccurrenceKeys = targetOccurrenceKeys as string[];
  }
  return result;
}

/**
 * The pure fulfillment decision. Given the current pending request (or
 * null) and the latest known measurements, decides whether it can be
 * fulfilled right now. Deliberately stateless and side-effect free: it does
 * not scroll and does not clear the pending request — the caller does that,
 * using this result, and only when `fulfilled` is true.
 */
export function computeMoneySectionFocusFulfillment(
  pending: MoneySectionFocusRequest | null,
  measurements: MoneySectionFocusMeasurements
): MoneySectionFocusFulfillment {
  if (!pending) return NO_FULFILLMENT;
  const y = measurements[pending.target];
  if (y === null) return NO_FULFILLMENT; // not yet measurable — caller must keep this request pending
  return { fulfilled: true, scrollY: y };
}
