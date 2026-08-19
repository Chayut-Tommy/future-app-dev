/**
 * Nolie Design 5.1 Wave 4 closure — the ONE activation sequence every picker
 * trigger follows, extracted so it is testable without a gesture system, a
 * real keyboard or an animation.
 *
 * Pure and RN-free by design. Neither this nor its React binding contains a
 * timer: the handoff is driven entirely by the platform's own keyboard
 * events.
 *
 * WHAT CHANGED, and why. The previous rule mounted the picker only on
 * `keyboardDidHide`. That is functionally correct but reads as two
 * consecutive animations: the keyboard slides away, the form reflows and
 * settles for a frame, and only then does the picker appear — roughly
 * 0.4–0.5s of visible sequence in the owner's recording. The corrected rule
 * splits activation into two distinct moments:
 *
 *   1. ACTIVATE, synchronously, on the tap: the overlay shell mounts, sheet
 *      gestures suspend and the form leaves the accessibility tree. There is
 *      now no interval in which the keyboard is going and nothing has taken
 *      its place.
 *   2. REVEAL, coordinated with the keyboard's own animation via
 *      `keyboardWillHide` on iOS, so the picker expands as the keyboard
 *      leaves rather than after it.
 *
 * `keyboardDidHide` remains as the fallback for Android and any environment
 * that never emits the pre-hide event.
 */

export type PickerRevealPhase =
  /** Nothing mounted. */
  | 'idle'
  /** Shell mounted, gestures suspended, waiting for the keyboard to start
   * leaving. Never a visible gap. */
  | 'activating'
  /** Fully revealed and interactive. */
  | 'open';

export type PickerRevealDecision =
  /** Nothing is in the way: activate and reveal in the same interaction. */
  | 'reveal-now'
  /** A keyboard is up: activate the shell immediately, dismiss the keyboard,
   * and coordinate the reveal with the keyboard's own animation. */
  | 'activate-then-coordinate'
  /** Already open or activating: a second activation closes it rather than
   * stacking a second picker. */
  | 'close';

export interface PickerActivationInput {
  keyboardVisible: boolean;
  phase: PickerRevealPhase;
}

export function decidePickerReveal(input: PickerActivationInput): PickerRevealDecision {
  // Anything already on screen — including a shell mid-activation — closes.
  // Repeated taps can therefore never stack pickers.
  if (input.phase !== 'idle') return 'close';
  return input.keyboardVisible ? 'activate-then-coordinate' : 'reveal-now';
}

/**
 * Whether a keyboard event should complete a pending reveal.
 *
 * Only while genuinely activating, and only once: iOS emits BOTH
 * `keyboardWillHide` and then `keyboardDidHide`, so the second must be a
 * no-op or the picker would mount twice, focus twice and re-run its entry.
 */
export function shouldConsumeKeyboardEvent(phase: PickerRevealPhase): boolean {
  return phase === 'activating';
}

/**
 * Back-compat name for the same rule, kept so no call site or test has to
 * describe the phase machine twice.
 */
export function shouldConsumeKeyboardHide(revealPending: boolean): boolean {
  return revealPending;
}

/**
 * The duration the picker entrance should use, given the keyboard's own
 * reported animation duration.
 *
 * Matching the keyboard is what makes the two read as ONE transition rather
 * than two. A platform that reports nothing usable falls back to the Design
 * 5.1 token the caller passes in, and Reduced Motion collapses to zero — an
 * immediate state change that depends on no animation completing.
 */
export function resolvePickerEntranceDuration(input: {
  keyboardDurationMs: number | undefined;
  fallbackMs: number;
  reduceMotion: boolean;
}): number {
  if (input.reduceMotion) return 0;
  const reported = input.keyboardDurationMs;
  if (typeof reported === 'number' && reported > 0) return reported;
  return input.fallbackMs;
}
