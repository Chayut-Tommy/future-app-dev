// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// AMENDMENT — full-workspace extension. This file's own transition reducer
// (formerly reduceAddAssetTransition/AddAssetTransitionState — sections
// 1-14 of this file's prior form) has been retired and superseded by the
// generalised, N-route reduceAddWorkspaceTransition, now covered by its
// own tests/add-workspace-transition-controller.test.ts. This file keeps
// only its remaining, still-shipped export: decideAssetTileSelection — the
// asset-TYPE selection decision, unrelated to and unaffected by which
// transition reducer drives the route itself.
//
// Real import of the actual production function (src/components/
// navigation/addAssetTransitionController.ts) — pure, RN-free, so this is
// genuine behavioural proof, not a mirrored copy or structural regex.
//
// CLASSIFICATION:
// - Real import (Class A): every assertion below exercises the actual
//   decideAssetTileSelection function.
// - NOT proven here: the React integration in AddAnythingSheet.tsx
//   (mounting/hiding the embedded AddWealthItemModal, the "Switch asset
//   type?" Alert's actual on-device appearance, draft preservation across
//   Back). AddAnythingSheet.tsx is a .tsx file and — like every other RN
//   component file in this repo — cannot be imported under `tsx` (confirmed
//   empirically, same Flow-syntax limitation documented in tests/README.md).
//   Those behaviours require physical-device verification.
//
// Run with: ./node_modules/.bin/tsx tests/add-asset-transition-controller.test.ts

import { decideAssetTileSelection } from '../src/components/navigation/addAssetTransitionController';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. Correction pass (§3) — decideAssetTileSelection, real import ===');
{
  assert(
    '1a. never entered this session -> proceed (plain first entry), regardless of dirty/type values',
    decideAssetTileSelection({ everEntered: false, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: true }).action === 'proceed'
  );
  assert(
    '1b. same asset type already open -> proceed (restore exactly), even while dirty',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'cash', isDirty: true }).action === 'proceed'
  );
  assert(
    '1c. same asset type already open -> proceed, while clean too',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'cash', isDirty: false }).action === 'proceed'
  );
  assert(
    '1d. different type, current draft clean -> switchClean (silently re-initialise, nothing lost)',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: false }).action === 'switchClean'
  );
  assert(
    '1e. different type, current draft dirty -> confirmSwitch (must not silently discard)',
    decideAssetTileSelection({ everEntered: true, currentPresetType: 'cash', selectedPresetType: 'property', isDirty: true }).action === 'confirmSwitch'
  );
  assert(
    '1f. every one of the five real asset-type pairs used by the actual ASSET_PRESET_MAP produces confirmSwitch when dirty and switchClean when clean — not just the cash/property example',
    (['cash', 'savings', 'etf', 'property', 'super'] as const).every((from) =>
      (['cash', 'savings', 'etf', 'property', 'super'] as const)
        .filter((to) => to !== from)
        .every(
          (to) =>
            decideAssetTileSelection({ everEntered: true, currentPresetType: from, selectedPresetType: to, isDirty: true }).action === 'confirmSwitch' &&
            decideAssetTileSelection({ everEntered: true, currentPresetType: from, selectedPresetType: to, isDirty: false }).action === 'switchClean'
        )
    )
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
