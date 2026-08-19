/**
 * Nolie Design 5.1 Wave 4 device correction — when a downward drag on a
 * bottom sheet is a dismissal, and when it is just scrolling.
 *
 * The defect this replaces: `KeyboardSheet` spread its PanResponder over the
 * ENTIRE sheet, so every pixel of every form was a dismissal target. That
 * responder competed with the form's own ScrollView for the gesture, and its
 * claim threshold was 6pt of downward movement. An ordinary scroll — most
 * easily a small downward pull near the top of a list, or a direction change
 * during momentum — could be claimed by the sheet instead of the ScrollView
 * and then satisfy the old 120pt / 0.6 velocity release test, closing the
 * screen (and, on a dirty form, raising a discard alert nobody asked for).
 *
 * The rules here are deliberately pure and RN-free so the whole decision
 * matrix is testable without a gesture system. They do NOT reproduce native
 * gesture arbitration — physical iOS verification is still required, because
 * whether the ScrollView or the handle wins a given touch is decided by the
 * platform, not by this file.
 */

/** How far a deliberate pull must travel before it dismisses. Nearly double
 * the old 120pt, because the gesture now starts from a dedicated handle
 * where a long pull is easy and an accidental one is very unlikely. */
export const SHEET_DISMISS_MIN_TRANSLATION = 96;

/** A shorter pull still dismisses if it is genuinely a flick. Both must
 * hold — velocity alone can never dismiss. */
export const SHEET_DISMISS_FLICK_TRANSLATION = 48;
export const SHEET_DISMISS_MIN_VELOCITY = 1.2;

/** Downward movement required before the handle claims a gesture at all.
 * Above the noise of a tap, below anything a customer would call a drag. */
export const SHEET_CLAIM_MIN_TRANSLATION = 12;

export interface SheetGesture {
  /** Downward is positive, matching PanResponder. */
  dy: number;
  dx: number;
  /** Vertical velocity, downward positive. */
  vy: number;
}

export interface SheetDismissalInput extends SheetGesture {
  /** The form's own scroll offset. Anything above zero means the customer
   * is reading their content, never dismissing. */
  contentOffsetY: number;
  /** True only for a gesture that began on the sheet's drag handle. A
   * gesture that began on the form body is never a dismissal — that is the
   * whole correction. */
  fromHandle: boolean;
  /** Set once a dismissal has already been requested for this gesture
   * sequence, so a rapid repeat cannot request a second one. */
  alreadyDismissing: boolean;
}

/**
 * Should the handle claim this gesture from whatever else might want it?
 *
 * Claiming is separate from dismissing: a claimed gesture follows the
 * finger, and only the release decides. A gesture is claimed only when it
 * starts on the handle, travels downward past the noise threshold, and is
 * more vertical than horizontal.
 */
export function shouldClaimSheetGesture(input: Pick<SheetDismissalInput, 'dy' | 'dx' | 'fromHandle'>): boolean {
  if (!input.fromHandle) return false;
  if (input.dy < SHEET_CLAIM_MIN_TRANSLATION) return false;
  return Math.abs(input.dy) > Math.abs(input.dx);
}

/**
 * Should releasing this gesture dismiss the sheet?
 *
 * Every rejection below is deliberate and independently testable:
 *   - not from the handle  -> the form body is not a dismissal target;
 *   - content scrolled     -> the customer is reading, not dismissing;
 *   - upward or sideways   -> wrong direction;
 *   - short and slow       -> below the deliberateness threshold;
 *   - already dismissing   -> exactly one request per sequence.
 */
export function shouldDismissSheet(input: SheetDismissalInput): boolean {
  if (input.alreadyDismissing) return false;
  if (!input.fromHandle) return false;
  if (input.contentOffsetY > 0) return false;
  if (input.dy <= 0) return false;
  if (Math.abs(input.dx) > Math.abs(input.dy)) return false;
  if (input.dy >= SHEET_DISMISS_MIN_TRANSLATION) return true;
  return input.dy >= SHEET_DISMISS_FLICK_TRANSLATION && input.vy >= SHEET_DISMISS_MIN_VELOCITY;
}
