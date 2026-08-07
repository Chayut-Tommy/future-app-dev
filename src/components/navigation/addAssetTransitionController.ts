// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// AMENDMENT — full-workspace extension. This file's own transition reducer
// (formerly `reduceAddAssetTransition`/`AddAssetTransitionState`/
// `AddAssetStepId`/`initialAddAssetTransitionState`, a 2-route chooser<->
// addAsset pilot) has been retired and superseded by the generalised,
// N-route `reduceAddWorkspaceTransition` in the new
// addWorkspaceTransitionController.ts — AddAnythingSheet.tsx now drives
// EVERY destination (including asset) through that one shared reducer
// instead of a dedicated per-journey one. This file now keeps only the
// asset-TYPE selection decision below, which is unrelated to and
// unaffected by which transition reducer drives the route itself.

// Correction pass (§3) — asset-TYPE selection. A pure decision, independent
// of the (now-generalised) transition reducer, so the host's
// chooseAssetTile can call it directly rather than re-implementing the
// same branching inline (avoiding a mirrored/duplicated copy) — real
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
