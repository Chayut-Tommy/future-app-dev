// Navigation Transitions, Option B — premium fixed-workspace correction.
//
// Pure, RN-free geometry math for the Add Anything workspace's outer sheet
// height and its keyboard-adjusted variant. Deliberately separate from
// AddAnythingSheet.tsx/KeyboardSheet.tsx (both .tsx, unimportable under the
// repo's `tsx` test harness — the same, already-documented Flow-syntax
// limitation every other .tsx file in this codebase has) so every decision
// here is real-import tested, not structural or mirrored. Only `spacing`
// is imported, from `../../theme/tokens` — a genuinely pure module itself
// (zero imports, confirmed before relying on it here), so this file stays
// RN-free end to end.
//
// Deliberately does NOT take or derive anything from title/grabber/footer
// content height: the outer sheet's height is fixed independently of every
// destination's content, by design (that independence is the entire point
// of this correction) — Yoga's own flex:1 layout of the clipped viewport
// (inside the fixed-height sheet) is what actually apportions the
// remaining space to the scrollable body at render time, using the REAL
// measured heights of the grabber/title/footer, not an estimate computed
// here. Estimating title line-height for this file's own arithmetic was
// explicitly rejected per the correction's instruction not to include an
// approximate value in height-critical arithmetic.

import { spacing } from '../../theme/tokens';

/** Gap between the fixed sheet's own top edge and the top safe-area inset
 * — reuses the largest existing named spacing token (32) rather than
 * inventing a new constant, giving a generous, already-established amount
 * of visible backdrop above the sheet. */
export const TOP_CLEARANCE = spacing.xxl;

/** A generous, named floor for the fixed sheet's TOTAL height (not derived
 * bottom-up from individual chrome-element heights, precisely so this
 * calculation never needs to estimate the title's line height). Chosen as
 * 10x the largest spacing token — comfortably larger than any plausible
 * sum of drag handle + title row + footer + top/bottom padding using this
 * app's own existing tokens (grabber ~16pt, footer ~56pt, sheet's own
 * top/bottom padding ~24-50pt, even a generous multi-line title well under
 * 100pt — all comfortably under this floor's ~320pt with real body room to
 * spare), while remaining a single, auditable, token-derived number rather
 * than a hand-picked pixel guess. */
export const MIN_SHEET_HEIGHT = spacing.xxl * 10;

/** Ceiling as a fraction of the window's own height — protects against an
 * unnecessarily oversized sheet on very tall phones or tablets. Lowered
 * from 0.92 to 0.82 (physical-device correction): 0.92 read as an
 * under-filled full-screen modal, with excessive empty space below the
 * chooser tiles, below short Property/Investment/Retirement forms, and
 * below Move Money's Amount field. 0.82 still comfortably clears
 * MIN_SHEET_HEIGHT (320) on every supported device — this only binds on
 * unusually short top insets or larger screens, exactly as before. */
export const MAX_HEIGHT_FRACTION = 0.82;

/** The floor `computeKeyboardAdjustedHeight` will never shrink the sheet
 * below, however large the keyboard's overlap — protects against collapse
 * toward zero under an unusually tall keyboard (predictive-text bar,
 * floating/external keyboard). Same reasoning and same value as
 * MIN_SHEET_HEIGHT: a generous, token-derived, auditable floor, not a
 * per-element estimate. */
export const MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN = spacing.xxl * 6;

export interface AddWorkspaceGeometryInput {
  /** The window's current height in points — pass `useWindowDimensions().height`
   * (reactive; recomputed on rotation/resize), never a captured-once
   * `Dimensions.get()` snapshot. */
  windowHeight: number;
  /** The device's current top safe-area inset in points — pass
   * `useSafeAreaInsets().top` (reactive). */
  topInset: number;
}

export interface AddWorkspaceGeometryResult {
  /** The outer sheet's total fixed height, in points — pass directly as
   * KeyboardSheet's `fixedSheetHeight` prop. Independent of every
   * destination's own content by construction: this function never reads
   * anything about the chooser, Cash, Savings, Investment, Retirement
   * Savings, Property, or Transfer. */
  fixedSheetHeight: number;
  /** windowHeight - fixedSheetHeight — the visible backdrop strip above
   * the sheet. Exact (no estimation involved): both inputs to this
   * subtraction are already known exactly. Informational/test-facing only;
   * not consumed by the render itself. */
  topClearance: number;
}

function toFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Clamps `value` into [min, max]. If the bounds have crossed (min > max —
 * only possible from a pathological/extreme input, e.g. an unrealistically
 * short window height), prioritises never exceeding the safe ceiling over
 * respecting the comfort floor: returns `max`, which itself is separately
 * floored at 0 by the caller. A sheet shorter than the ideal minimum is a
 * lesser defect than a sheet taller than the window it's rendered in. */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return max;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * The Add workspace's outer sheet height — content-independent by
 * construction. Finite and non-negative for every input, including
 * negative/zero/non-finite window dimensions or insets (defensively
 * substituted with 0 before the formula runs) — portrait iPhones remain
 * the primary product target, but this must not throw or return NaN/
 * negative values for any numeric input.
 */
export function computeAddWorkspaceGeometry(input: AddWorkspaceGeometryInput): AddWorkspaceGeometryResult {
  const windowHeight = toFiniteNumber(input.windowHeight, 0);
  const topInset = toFiniteNumber(input.topInset, 0);

  const raw = windowHeight - topInset - TOP_CLEARANCE;
  const max = Math.max(windowHeight * MAX_HEIGHT_FRACTION, 0);
  const fixedSheetHeight = Math.max(clamp(raw, MIN_SHEET_HEIGHT, max), 0);

  return {
    fixedSheetHeight,
    topClearance: windowHeight - fixedSheetHeight,
  };
}

/**
 * How much of the keyboard actually overlaps the current window, computed
 * from the keyboard event's own screen coordinates rather than assuming
 * the event's reported height always equals the needed displacement (per
 * the correction's explicit instruction) — `keyboardScreenY` is the
 * keyboard frame's own top edge (RN's `event.endCoordinates.screenY`);
 * overlap is the distance from that Y to the bottom of the window. Never
 * negative (a keyboard whose reported top edge is below the window's own
 * bottom — e.g. a keyboard that has just finished hiding — contributes no
 * overlap, not a negative one).
 */
export function computeKeyboardOverlap(windowHeight: number, keyboardScreenY: number): number {
  const safeWindowHeight = toFiniteNumber(windowHeight, 0);
  const safeScreenY = toFiniteNumber(keyboardScreenY, safeWindowHeight);
  return Math.max(safeWindowHeight - safeScreenY, 0);
}

/**
 * The sheet's actual rendered height once keyboard overlap is accounted
 * for — shrinks `fixedSheetHeight` by exactly `keyboardOverlap`, floored at
 * `minVisibleHeight` so the sheet can never collapse toward zero under an
 * unusually tall keyboard. This is the ONE mechanism that keeps the top
 * edge stationary while the keyboard is open (see KeyboardSheet.tsx's own
 * wiring): shrinking height by the same amount the sheet's bottom-anchor
 * point rises (via the existing KeyboardAvoidingView padding) means the
 * top edge's position is unchanged — `newTop = (oldBottom - overlap) -
 * (fixedSheetHeight - overlap) = oldBottom - fixedSheetHeight = oldTop`.
 */
export function computeKeyboardAdjustedHeight(fixedSheetHeight: number, keyboardOverlap: number, minVisibleHeight: number): number {
  const safeHeight = toFiniteNumber(fixedSheetHeight, 0);
  const overlap = Math.max(toFiniteNumber(keyboardOverlap, 0), 0);
  const floor = Math.max(toFiniteNumber(minVisibleHeight, 0), 0);
  return Math.max(safeHeight - overlap, floor);
}
