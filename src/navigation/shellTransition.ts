/**
 * Nolie Design 5.1 Wave 8 closure — the global shell's transition-aware
 * route projection.
 *
 * ROOT CAUSE it fixes. `RootNavigator`'s `screenListeners.state` publishes
 * the root route when React Navigation COMMITS a state change. For a push
 * that is the start of the transition, but for a MODAL dismissal it is the
 * end: React Navigation removes the route from state only once the native
 * dismissal has finished. The shell therefore learned that Settings had
 * gone roughly half a second after the customer could already see the page
 * underneath — which is the 0.5–0.9s gap where a fully visible root sat
 * without its dock.
 *
 * `transitionStart` with `e.data.closing === true` fires at the START of
 * that dismissal. Feeding it here lets the shell resolve the route it is
 * about to be on, so the page and its dock are restored as one transition.
 *
 * This is NOT a second route list and NOT a second authority: the output is
 * a route name that goes straight into the SAME `resolveRootNavAssembly`
 * the dock, the "+" and the Settings action already share. It adds no
 * timer, no debounce and no delayed callback.
 *
 * Pure and RN-free, so the whole matrix is testable without a mount.
 */

export interface ShellRouteInput {
  /** The route React Navigation has committed. */
  committed: string | undefined;
  /** The root route before `committed` — what a dismissal reveals. */
  previous: string | undefined;
  /** The route whose CLOSING transition has begun, if any. */
  closing: string | undefined;
}

/**
 * The route the shell should present for.
 *
 * While the committed route is closing, the shell projects for the route
 * beneath it — so the dock, the "+" and the Settings action are already
 * correct on the first frame in which the page beneath becomes visible.
 * Everywhere else this is the identity function, so no ordinary navigation
 * behaves differently.
 */
export function resolveEffectiveRootRoute(input: ShellRouteInput): string | undefined {
  if (input.closing && input.closing === input.committed) return input.previous;
  return input.committed;
}

/**
 * Whether a closing signal is still relevant.
 *
 * A `transitionStart(closing)` for a route that is no longer committed is
 * stale — the state event has already landed and superseded it. Clearing it
 * on that basis, rather than on a timer, is what keeps this free of any
 * arbitrary window.
 */
export function isClosingSignalStale(closing: string | undefined, committed: string | undefined): boolean {
  return !!closing && closing !== committed;
}
