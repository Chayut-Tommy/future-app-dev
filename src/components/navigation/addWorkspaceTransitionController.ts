// Navigation Transitions — Add Anything, full-workspace extension.
//
// Generalises the two-route pilot in addAssetTransitionController.ts (which
// only ever knew about 'chooser' and 'addAsset') to every Add Anything
// destination, so a single pure reducer — not one independent
// Animated.Value/transition-function pair per destination — governs the
// whole workspace. The shape (a settled "current" route plus a fading
// "outgoing" one, first-tap-wins, interrupted-transition rejection,
// stale-completion rejection via TRANSITION_COMPLETE, a deterministic
// RESET) is unchanged from the pilot; only the step-id type widens from a
// 2-value union to the full route union, and a `direction` field is added
// (needed once a single shared progress Animated.Value drives every
// transition, so the host knows whether progress is animating 0->1 or
// 1->0 without re-deriving it from current/outgoing on every render).
//
// Pure, RN-free — no React, no timers, no randomness — so every scenario
// below is real-import tested, not structural or mirrored.
//
// Reduced motion: exactly as the pilot — the host dispatches FORWARD (or
// BACK) immediately followed by TRANSITION_COMPLETE in the same
// synchronous call, with no animation in between. The reducer has no
// notion of time or motion, so this naturally satisfies "replace the
// animated movement with an immediate content change" without any
// special-cased branch here.

/** Every destination Add Anything can host inside its own persistent
 * workspace, plus the chooser itself. 'asset' covers Cash/Savings/
 * Investment/Property/Retirement Savings (they already share one preset-
 * driven form, AddWealthItemModal with kind="asset" — see
 * addAssetTransitionController.ts's own decideAssetTileSelection for that
 * preset-switching decision, which is unrelated to and unaffected by this
 * route-transition reducer). */
export type AddWorkspaceRoute =
  | 'chooser'
  | 'transfer'
  | 'asset'
  | 'expense'
  | 'incomeSource'
  | 'incomeReceived'
  | 'bill'
  | 'liability'
  | 'creditCard'
  | 'goal';

export interface AddWorkspaceTransitionState {
  /** The route this transition is settled on, or moving toward. */
  current: AddWorkspaceRoute;
  /** The route fading out during an active transition; null when idle. */
  outgoing: AddWorkspaceRoute | null;
  /** 'idle' — nothing in flight, FORWARD/BACK accepted. 'transitioning' —
   * an animation (or, in reduced-motion mode, the synchronous instant
   * swap) is in progress; new FORWARD/BACK requests are ignored until
   * TRANSITION_COMPLETE. */
  status: 'idle' | 'transitioning';
  /** Which way the shared progress value is moving during the current
   * transition — 'forward' (chooser -> destination, progress 0->1) or
   * 'back' (destination -> chooser, progress 1->0). Null when idle. Lets
   * the host drive its one shared Animated.Value correctly without
   * re-deriving direction from current/outgoing (which alone can't
   * distinguish "just-completed forward" from "just-completed back" once
   * outgoing is cleared). */
  direction: 'forward' | 'back' | null;
  /** Discard-orchestration correction (nested-handoff amendment) — the
   * FULL stack of routes BACK will pop through, in order: returnStack[0]
   * is where BACK from `current` goes next; the remainder is preserved
   * UNCHANGED for the Back after that. Empty only when `current` is
   * 'chooser' itself. A route entered directly from the chooser has
   * returnStack ['chooser'] (depth 1). A cross-destination handoff pushes
   * the handing-off route onto ITS OWN stack, rather than overwriting a
   * single scalar field — this is what lets a nested chain (chooser ->
   * bill -> liability -> creditCard) Back correctly through
   * creditCard -> liability -> bill -> chooser, each Back popping exactly
   * one level and leaving every remaining ancestor level intact. A single
   * overwritten "return to this one route" field cannot represent this:
   * entering creditCard from liability would have nowhere to remember
   * that liability itself must still Back to bill, not straight to
   * chooser. */
  returnStack: AddWorkspaceRoute[];
}

export const initialAddWorkspaceTransitionState: AddWorkspaceTransitionState = {
  current: 'chooser',
  outgoing: null,
  status: 'idle',
  direction: null,
  returnStack: [],
};

export type AddWorkspaceTransitionAction =
  /** Enter `route` from a settled chooser. `route` must not be 'chooser'
   * — that would be a no-op the host should never dispatch (there is
   * nothing to navigate to). `returnStack`, when supplied, becomes the
   * new route's own full return stack (a cross-destination handoff
   * computes this as [leavingRoute, ...leavingRoute's own returnStack]
   * before forcing the intermediate bounce through chooser — see
   * AddAnythingSheet.tsx's handoffToRoute); omitted (every ordinary tile
   * entry) defaults to ['chooser']. */
  | { type: 'FORWARD'; route: AddWorkspaceRoute; returnStack?: AddWorkspaceRoute[] }
  | { type: 'BACK' }
  /** Host-only orchestration primitive for a cross-destination handoff's
   * own intermediate step — unconditionally returns to chooser regardless
   * of what state.returnStack currently holds. Never dispatched in
   * response to a user-facing Back tap (which always uses the ordinary,
   * returnStack-aware BACK action instead); the host captures
   * state.current/state.returnStack itself BEFORE dispatching this, and
   * threads them through as the next FORWARD's own explicit returnStack
   * override, so no ancestor level is ever lost. */
  | { type: 'FORCE_TO_CHOOSER' }
  | { type: 'TRANSITION_COMPLETE' }
  | { type: 'RESET' };

/**
 * Pure reducer — the entire first-tap-wins / interrupted-transition /
 * rapid-repeat-ignored / stale-completion contract for every Add Anything
 * destination lives here, decoupled from React/RN so it can be imported
 * and exercised directly (no renderer required).
 */
export function reduceAddWorkspaceTransition(
  state: AddWorkspaceTransitionState,
  action: AddWorkspaceTransitionAction
): AddWorkspaceTransitionState {
  switch (action.type) {
    case 'FORWARD':
      // Only accepted from a settled chooser, and only into a genuine
      // destination (never 'chooser' itself — a same-route Forward is
      // rejected exactly like every other invalid request, not silently
      // treated as a no-op success). Ignored while already transitioning
      // (rapid repeated Forward, or a Forward arriving mid Back-
      // transition) or already on a non-chooser route — the first
      // accepted Forward wins; every other concurrent Forward is a no-op.
      if (state.status === 'transitioning' || state.current !== 'chooser' || action.route === 'chooser') return state;
      return { current: action.route, outgoing: 'chooser', status: 'transitioning', direction: 'forward', returnStack: action.returnStack ?? ['chooser'] };
    case 'BACK': {
      // Only accepted from a settled non-chooser route. Ignored while
      // already transitioning (rapid repeated Back, or a Back arriving
      // mid Forward-transition) or already on chooser. Pops the FIRST
      // entry off state.returnStack as the new current — 'chooser' for an
      // ordinary entry, or the originating route for a cross-destination
      // handoff — never hardcoded. The new state's own returnStack is the
      // REMAINDER of the popped stack, preserving every deeper ancestor
      // level for the NEXT Back, rather than resetting to a fixed value.
      if (state.status === 'transitioning' || state.current === 'chooser') return state;
      const [nextCurrent, ...restStack] = state.returnStack;
      return { current: nextCurrent, outgoing: state.current, status: 'transitioning', direction: 'back', returnStack: restStack };
    }
    case 'FORCE_TO_CHOOSER':
      // Same shape as an ordinary BACK's state transition, but always to
      // 'chooser' specifically, regardless of state.returnStack — see the
      // action's own doc comment for why this exists as a separate,
      // host-only primitive rather than reusing BACK.
      if (state.status === 'transitioning' || state.current === 'chooser') return state;
      return { current: 'chooser', outgoing: state.current, status: 'transitioning', direction: 'back', returnStack: [] };
    case 'TRANSITION_COMPLETE':
      // A no-op when nothing is in flight (e.g. a stale/duplicate
      // completion callback firing after an interruption already
      // resolved things) — one rejected or interrupted transition must
      // never leave the host permanently locked, and this guard is what
      // prevents a late completion from corrupting a state a later
      // action already moved past.
      if (state.status !== 'transitioning') return state;
      return { current: state.current, outgoing: null, status: 'idle', direction: null, returnStack: state.returnStack };
    case 'RESET':
      return initialAddWorkspaceTransitionState;
    default:
      return state;
  }
}

/**
 * Whether `route` is currently the transition's "active side" — either the
 * settled/entering current route, or the exiting outgoing route. Both
 * cases use the identical progress-driven interpolation on the host side
 * (see AddAnythingSheet.tsx's own layer-positioning comment for why one
 * formula covers both current-and-entering and outgoing-and-exiting), so
 * this single helper is what the host calls per layer instead of
 * duplicating the current/outgoing comparison at every call site.
 */
export function isRouteActiveInTransition(state: AddWorkspaceTransitionState, route: AddWorkspaceRoute): boolean {
  return state.current === route || state.outgoing === route;
}

/** Whether `route` is genuinely the settled (not mid-transition) front
 * step — the one and only state in which a layer should be interactive
 * and visible to assistive technology. */
export function isRouteSettledFront(state: AddWorkspaceTransitionState, route: AddWorkspaceRoute): boolean {
  return state.current === route && state.status === 'idle';
}

// ---- Shared embedded-form contract ----
//
// Every embedded destination form exposes exactly this shape — the same
// {requestSave, requestClose} imperative handle TransferForm's own
// TransferFormHandle and AddWealthItemModal's own AddWealthItemModalHandle
// already independently converged on (confirmed identical before adding
// this: both declare `'cancel' | 'back' | 'backdrop' | 'swipe' |
// 'androidBack'` as their own local close-reason union). This file exports
// the same shape once, named generically, for the newly-embedded
// destinations (Bill, Liability's own type-selector step, Income Source,
// Income Received, Credit Card, Goal) to reuse — TransferForm.tsx and
// AddWealthItemModal.tsx keep their own existing local type aliases
// unchanged (renaming an already-accepted, already-shipped type for pure
// consistency is exactly the kind of incidental, unrequired touch to
// working code this correction avoids).

/** Why an embedded destination is being asked to close — passed through to
 * confirmDiscardIfDirty-style gating exactly as the two existing embedded
 * forms already do. */
export type EmbeddedCloseReason = 'cancel' | 'back' | 'backdrop' | 'swipe' | 'androidBack';

/** The one imperative surface the host (AddAnythingSheet) needs from any
 * embedded destination form — nothing else. `requestSave` triggers the
 * form's own existing save/update path (never re-implemented by the
 * host); `requestClose` triggers the form's own existing discard-
 * confirmation-then-close path for the given reason. */
export interface EmbeddedStepHandle {
  requestSave(): void;
  requestClose(reason: EmbeddedCloseReason): void;
}
