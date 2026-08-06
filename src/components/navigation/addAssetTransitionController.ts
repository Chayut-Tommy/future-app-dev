// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// Pure, typed step-stage controller — the entire first-tap-wins /
// interrupted-transition / rapid-repeat-ignored contract for the chooser
// <-> Add Asset progressive journey lives here, decoupled from React/RN so
// it can be imported and exercised directly (no renderer required). This is
// deliberately NOT wired into the existing chooser<->Transfer mechanism in
// AddAnythingSheet.tsx (screen/transitionPhase, chooserAnim/transferAnim,
// generationRef) — that mechanism stays completely untouched. This module
// mirrors its shape (a settled "current" step plus a fading "outgoing" one)
// as an explicit, reusable, testable state machine, proving the same
// pattern can be reused by a second journey without touching the first
// journey's own accepted implementation.
//
// Reduced motion: the host dispatches FORWARD immediately followed by
// TRANSITION_COMPLETE in the same synchronous call (no animation in
// between) — the reducer itself has no notion of time or motion, so this
// naturally satisfies "replace the animated movement with an immediate
// content change" without any special-cased branch here.

export type AddAssetStepId = 'chooser' | 'addAsset';

export interface AddAssetTransitionState {
  /** The step this transition is settled on, or moving toward. */
  current: AddAssetStepId;
  /** The step fading out during an active transition; null when idle. */
  outgoing: AddAssetStepId | null;
  /** 'idle' — nothing in flight, Forward/Back accepted. 'transitioning' —
   * an animation (or, in reduced-motion mode, the synchronous instant swap)
   * is in progress; new Forward/Back requests are ignored until
   * TRANSITION_COMPLETE. */
  status: 'idle' | 'transitioning';
}

export const initialAddAssetTransitionState: AddAssetTransitionState = {
  current: 'chooser',
  outgoing: null,
  status: 'idle',
};

export type AddAssetTransitionAction = { type: 'FORWARD' } | { type: 'BACK' } | { type: 'TRANSITION_COMPLETE' } | { type: 'RESET' };

/**
 * Pure reducer. No React, no RN, no timers — every decision (accept/ignore
 * an action, what the next state is) is a plain function of the current
 * state and the action, so every scenario below is exercised by a real
 * import test, not a structural or mirrored one.
 */
export function reduceAddAssetTransition(state: AddAssetTransitionState, action: AddAssetTransitionAction): AddAssetTransitionState {
  switch (action.type) {
    case 'FORWARD':
      // Only accepted from a settled chooser. Ignored while already
      // transitioning (rapid repeated Forward, or a Forward arriving mid
      // Back-transition) or already on addAsset — the first accepted
      // Forward wins; every other concurrent Forward is a no-op.
      if (state.status === 'transitioning' || state.current !== 'chooser') return state;
      return { current: 'addAsset', outgoing: 'chooser', status: 'transitioning' };
    case 'BACK':
      // Only accepted from a settled addAsset. Ignored while already
      // transitioning (rapid repeated Back, or a Back arriving mid Forward-
      // transition) or already on chooser.
      if (state.status === 'transitioning' || state.current !== 'addAsset') return state;
      return { current: 'chooser', outgoing: 'addAsset', status: 'transitioning' };
    case 'TRANSITION_COMPLETE':
      // A no-op when nothing is in flight (e.g. a stale/duplicate
      // completion callback firing after an interruption already resolved
      // things) — one rejected or interrupted transition must never leave
      // the host permanently locked, and this guard is what prevents a
      // late completion from corrupting a state a later action already
      // moved past.
      if (state.status !== 'transitioning') return state;
      return { current: state.current, outgoing: null, status: 'idle' };
    case 'RESET':
      return initialAddAssetTransitionState;
    default:
      return state;
  }
}

// Correction pass (§3) — asset-TYPE selection. A second, independent pure
// decision extracted the same way as the transition reducer above, so the
// host's chooseAssetTile can call it directly rather than re-implementing
// the same branching inline (avoiding a mirrored/duplicated copy) — real
// import tested, not structural.

/** What selecting a tile should actually do, given the current draft
 * state — never a React/RN concern, just a pure decision. */
export type AssetTileSelectionOutcome =
  /** No prior draft this session (or the tapped tile matches whatever is
   * already open/preserved) — proceed straight into (or back into) that
   * exact asset type. Never resets valid fields, never saves anything. */
  | { action: 'proceed' }
  /** A different type than whatever is currently open, and the current
   * draft has no genuine changes to lose — safe to silently re-initialise
   * with the newly selected type. */
  | { action: 'switchClean' }
  /** A different type than whatever is currently open, and the current
   * draft IS dirty — must not silently discard it; the host must show the
   * "Switch asset type?" confirmation before doing anything else. */
  | { action: 'confirmSwitch' };

export function decideAssetTileSelection(params: {
  /** Has an Add Asset session ever been entered yet this Add Anything
   * open? False only before the very first Forward. */
  everEntered: boolean;
  /** The asset type the currently open/preserved draft belongs to. Ignored
   * when `everEntered` is false. */
  currentPresetType: string;
  /** The asset type of the tile the user just tapped. */
  selectedPresetType: string;
  /** Whether the currently open/preserved draft has genuine, unsaved
   * changes. Ignored when `everEntered` is false or the types match. */
  isDirty: boolean;
}): AssetTileSelectionOutcome {
  if (!params.everEntered) return { action: 'proceed' };
  if (params.selectedPresetType === params.currentPresetType) return { action: 'proceed' };
  if (!params.isDirty) return { action: 'switchClean' };
  return { action: 'confirmSwitch' };
}
