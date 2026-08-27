// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// Structural-only (Class C) wiring guard for the Add Asset embedding
// itself and its host wiring. Real behavioural coverage of the state
// machine lives in tests/add-asset-transition-controller.test.ts (real
// import, decideAssetTileSelection) and tests/add-workspace-transition-
// controller.test.ts (real import, the shared reducer). Generalized
// full-workspace coverage (all thirteen destinations, the shared reducer/
// progress-value wiring, cross-destination handoffs) lives in
// tests/add-anything-sheet-full-workspace.test.ts — not duplicated here.
//
// AMENDMENT — full-workspace extension. AddAnythingSheet.tsx now renders
// TWO AddWealthItemModal instances (kind="asset", the Option B pilot this
// file protects, AND kind="liability", the newly-embedded Liability
// destination) instead of one — section 1 below is updated to find and
// separately verify each, rather than asserting there is exactly one.
// Sections 7/8 of this file's prior form (accessibility focus lifecycle,
// asset-type-switching host wiring) tested function/ref names
// (beginAddAssetTransitionAnimation, addAssetGenerationRef,
// addAssetInstanceKey, backToChooserFromAddAsset) that no longer exist —
// not because anything regressed, but because AddAnythingSheet.tsx's
// entire transition mechanism was authorizedly generalized onto ONE
// shared reducer this round. That coverage is superseded by
// add-anything-sheet-full-workspace.test.ts's own section 14 (Asset
// behaviour genuinely unchanged, just replumbed) and section 5
// (stale-completion protection, now generic across every destination) —
// removed from here rather than updated in place, to avoid duplicate
// coverage under two different names for the same guarantee.
//
// Run with: ./node_modules/.bin/tsx tests/add-asset-embedded-pilot.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';

// TEST-INFRASTRUCTURE CORRECTION (Wave 9a verification pass) — this file's
// structural reads were pinned to an absolute path naming one specific
// checkout on one machine. Run from any other worktree that silently reads
// a DIFFERENT
// repository, so a structural assertion could pass against code that is not
// the code under test. Paths now resolve from this file's own location,
// matching the convention design5-add-architecture.test.ts and others
// already use. No product assertion, expected value or production file is
// changed by this correction.
const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync(srcPath('src/components/navigation/AddAnythingSheet.tsx'), 'utf-8');
const ADD_WEALTH_SRC = readFileSync(srcPath('src/components/wealth/AddWealthItemModal.tsx'), 'utf-8');
const TRANSFER_FORM_SRC = readFileSync(srcPath('src/components/wealth/TransferForm.tsx'), 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync(srcPath('src/components/wealth/TransferModal.tsx'), 'utf-8');
const FLOATING_ADD_BUTTON_SRC = readFileSync(srcPath('src/components/navigation/FloatingAddButton.tsx'), 'utf-8');
const WEALTH_SCREEN_SRC = readFileSync(srcPath('src/screens/wealth/WealthScreen.tsx'), 'utf-8');
const DISCOVER_SCREEN_SRC = readFileSync(srcPath('src/screens/discover/DiscoverScreen.tsx'), 'utf-8');
const TODAY_SCREEN_SRC = readFileSync(srcPath('src/screens/today/TodayScreen.tsx'), 'utf-8');
const MONEY_SCREEN_SRC = readFileSync(srcPath('src/screens/money/MoneyScreen.tsx'), 'utf-8');
const CONTROLLER_SRC = readFileSync(srcPath('src/components/navigation/addAssetTransitionController.ts'), 'utf-8');
const GEOMETRY_SRC = readFileSync(srcPath('src/components/navigation/addWorkspaceGeometry.ts'), 'utf-8');
// Floating navigation design pass — focusElement was extracted out of
// AddAnythingSheet.tsx into this shared module so QuickActionsTray.tsx
// could reuse the exact same iOS/Android focus-movement logic rather than
// duplicating it; its own logic is unchanged, just relocated.
const A11Y_FOCUS_SRC = readFileSync(srcPath('src/lib/a11yFocus.ts'), 'utf-8');

console.log('=== 1. Exactly two AddWealthItemModal instances in AddAnythingSheet.tsx — asset and liability, each correctly scoped (Class C) ===');
{
  // \s (not [\s\S]) immediately after the tag name — excludes the
  // unrelated `useRef<AddWealthItemModalHandle>(...)` type-generic
  // occurrences, which are not JSX tags at all.
  const embeddedBlocks = ADD_ANYTHING_SRC.match(/<AddWealthItemModal\s[\s\S]*?\/>/g) ?? [];
  assert('1a. AddAnythingSheet.tsx renders exactly two AddWealthItemModal instances (asset + liability — the full-workspace extension\'s newly-embedded Liability destination)', embeddedBlocks.length === 2);
  const assetBlock = embeddedBlocks.find((b) => /kind="asset"/.test(b)) ?? '';
  const liabilityBlock = embeddedBlocks.find((b) => /kind="liability"/.test(b)) ?? '';
  assert('1b. the asset instance holds assetModalRef and passes embedded, kind="asset" — never "liability"', /ref=\{assetModalRef\}/.test(assetBlock) && /\bembedded\b/.test(assetBlock) && !/kind="liability"/.test(assetBlock));
  assert('1c. the asset instance never passes onRequestCreditCard (a liability-only concern, unreachable for kind="asset")', !/onRequestCreditCard/.test(assetBlock));
  assert('1d. the liability instance holds liabilityModalRef and passes embedded, kind="liability" — never "asset"', /ref=\{liabilityModalRef\}/.test(liabilityBlock) && /\bembedded\b/.test(liabilityBlock) && !/kind="asset"/.test(liabilityBlock));
  assert('1e. the liability instance passes onRequestCreditCard (the Liability -> Credit card handoff)', /onRequestCreditCard=\{handleRequestCreditCardFromLiability\}/.test(liabilityBlock));
}

console.log('\n=== 2. No other production caller ever passes embedded to AddWealthItemModal (Class C) ===');
{
  const callers = [
    ['FloatingAddButton.tsx', FLOATING_ADD_BUTTON_SRC],
    ['WealthScreen.tsx', WEALTH_SCREEN_SRC],
    ['DiscoverScreen.tsx', DISCOVER_SCREEN_SRC],
    ['TodayScreen.tsx', TODAY_SCREEN_SRC],
    ['MoneyScreen.tsx', MONEY_SCREEN_SRC],
  ] as const;
  for (const [name, src] of callers) {
    assert(`2. ${name} never passes embedded to any AddWealthItemModal instance (100% standalone, unchanged)`, !/<AddWealthItemModal[\s\S]{0,400}?\bembedded\b/.test(src));
  }
}

console.log('\n=== 3. AddWealthItemModal.tsx: embedded mode cannot bypass the category-step or liability-selector-step branches\' own gating (Class C) ===');
{
  // SUPERSEDED by Design 5.1 Wave 4 (owner-authorised): the asset category
  // STEP is removed and its choice is embedded in the form. The concern this
  // section names — "embedded mode cannot bypass a step's own gating" — is
  // asserted for the step that remains (3b), plus the two guarantees the
  // removed step used to provide: the restricted list is still restricted,
  // and the type choice still runs the same seed/reset handler.
  assert('3a. no category step survives to be bypassed', !/formStep/.test(ADD_WEALTH_SRC));
  assert(
    '3a-i. the asset-type choice is in-form and still routes through chooseAssetCategory, so the include-in-money seed and the provider reset both still run',
    /onChange=\{chooseAssetCategory\}/.test(ADD_WEALTH_SRC) &&
      /function chooseAssetCategory\(type: AssetType\) \{[\s\S]*?setIncludeInMoney\([\s\S]*?setProvider\(''\);/.test(ADD_WEALTH_SRC)
  );
  assert('3b. the liability-selector-step branch still gates on kind/showLiabilitySelector unchanged', /if \(kind === 'liability' && showLiabilitySelector\)/.test(ADD_WEALTH_SRC));
}

console.log('\n=== 4. AddWealthItemModal.tsx: embedded only ever skips the KeyboardSheet wrapper, never the save/validation logic (Class C) ===');
{
  assert('4a. the embedded branch returns the same `content` every standalone render also uses — not a second, separate render path', /if \(embedded\) \{\s*\n\s*return content;\s*\n\s*\}/.test(ADD_WEALTH_SRC));
  // RECONCILED (post-Wave-10 B9 closure): the successful-Save path now
  // also routes through the canonical confirmSaveSuccess boundary (and the
  // wealth form reports its ACTUAL saved type), so the pinned shape gained
  // that call — the close/branch contract itself is unchanged.
  assert('4b. performSave still branches embedded vs standalone only for HOW it closes and confirms, never for whether addAsset/updateAsset is called', /if \(embedded\) \{\s*\n\s*onSaveSuccess\?\.\(kind === 'asset' \? assetType : liabilityType\);\s*\n\s*\} else \{[\s\S]{0,900}?onClose\(\);\s*\n\s*\}/.test(ADD_WEALTH_SRC));
  assert(
    '4c. requestEmbeddedClose never bypasses the discard-confirmation gate for any reason except the never-discards "back" — nested-handoff correction: \'back\' may now first take an internal step back to this form\'s own picker (never a discard, just internal navigation) before it forwards to onConfirmedClose, but the confirmDiscardIfDirty tail for every OTHER reason is untouched',
    /function requestEmbeddedClose\(reason: AddWealthItemCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{[\s\S]*?onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\?\.\(reason\)\);/.test(ADD_WEALTH_SRC)
  );
  assert(
    "4d. nested-handoff correction — the internal picker-back only ever flips showLiabilitySelector back to true, never calls confirmDiscardIfDirty/onClose/resetDraft-equivalent logic — a genuinely non-discarding internal navigation step, not a disguised close",
    /if \(kind === 'liability' && selectorEverShownRef\.current && !showLiabilitySelector\) \{\s*\n\s*setShowLiabilitySelector\(true\);\s*\n\s*return;\s*\n\s*\}/.test(ADD_WEALTH_SRC)
  );
}

console.log('\n=== 5. Move Money (Transfer) files show zero trace of this pilot — proves no cross-contamination (Class C) ===');
{
  assert('5a. TransferForm.tsx has no Add-Asset-pilot marker', !/addAssetTransitionController|addAssetModalRef|Navigation Transitions, Option B pilot/.test(TRANSFER_FORM_SRC));
  assert('5b. TransferModal.tsx has no Add-Asset-pilot marker', !/addAssetTransitionController|addAssetModalRef|Navigation Transitions, Option B pilot/.test(TRANSFER_MODAL_SRC));
  assert(
    "5c. TransferForm's actual financial save logic (transferFunds) is untouched — proven by the complete absence of any Add-Asset-pilot or full-workspace-extension marker in TransferForm.tsx itself (5a), which is the only file that contains it",
    !/premium-transition|PUSH_TRANSITION_DURATION_MS|reduceAddWorkspaceTransition/.test(TRANSFER_FORM_SRC)
  );
}

console.log('\n=== 6. The asset-type transition controller module is genuinely pure — no React/RN import (Class C, supports the real-import test\'s own claim) ===');
{
  assert('6a. addAssetTransitionController.ts imports nothing from "react"', !/from ['"]react['"]/.test(CONTROLLER_SRC));
  assert('6b. addAssetTransitionController.ts imports nothing from "react-native"', !/from ['"]react-native['"]/.test(CONTROLLER_SRC));
}

console.log('\n=== 7. Correction pass (§2) — accessibility focus wiring for the Add Asset heading and per-tile refs (Class C) ===');
{
  assert(
    "7a. focusElement (now in the shared src/lib/a11yFocus.ts module, floating navigation design pass — see that file's own doc comment) uses AccessibilityInfo.setAccessibilityFocus on iOS and AccessibilityInfo.sendAccessibilityEvent(..., 'focus') on Android — and accessibilityLiveRegion is never used as an actual JSX prop anywhere in AddAnythingSheet.tsx (only mentioned in an explanatory comment, which is fine)",
    /if \(Platform\.OS === 'ios'\) \{\s*\n\s*const tag = findNodeHandle\(node as never\);\s*\n\s*if \(tag != null\) AccessibilityInfo\.setAccessibilityFocus\(tag\);\s*\n\s*\} else \{\s*\n\s*AccessibilityInfo\.sendAccessibilityEvent\(node as never, 'focus'\);\s*\n\s*\}/.test(A11Y_FOCUS_SRC) &&
      !/accessibilityLiveRegion=/.test(ADD_ANYTHING_SRC)
  );
  assert('7b. exactly one announceForAccessibility call exists, gated behind the single shared focus-consumption effect (never a second, redundant announcement source)', (ADD_ANYTHING_SRC.match(/AccessibilityInfo\.announceForAccessibility\(/g) || []).length === 1);
  assert(
    "7c. Back's focus target for Asset specifically is looked up via assetTileRefs keyed by assetOriginTileKeyRef.current — the exact tile that opened the draft, not a generic/first tile",
    /const tileKey = fromRoute === 'asset' \? assetOriginTileKeyRef\.current : fromRoute \? ROUTE_TILE_KEY\[fromRoute\] \?\? null : null;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '7d. every one of the five asset tiles registers itself into assetTileRefs via a ref callback keyed by its own o.key — the actual per-tile ref map Back\'s focus restoration reads from',
    /ref=\{\(el\) => \{[\s\S]{0,400}?assetTileRefs\.current\[o\.key\] = el;/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 8. Premium-transition correction — the height-measurement probe (§4\'s old fix) is superseded by a content-independent fixed workspace height (Class C) ===');
{
  // The probe (§4, an earlier correction round) existed only to serve the
  // natural-height-measurement mechanism that has now been retired
  // wholesale — the workspace's own outer height no longer depends on ANY
  // step's content, so there is nothing left for a probe to pre-measure.
  assert(
    "8a. every one of the probe's own former markers (addAssetProbed, addAssetNaturalHeight, the cash-preset probe render block) no longer exists as a declaration (the names may still appear in an explanatory retirement comment, which is fine)",
    !/addAssetProbed/.test(ADD_ANYTHING_SRC) &&
      !/const \[addAssetNaturalHeight/.test(ADD_ANYTHING_SRC) &&
      !/setAddAssetNaturalHeight/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "8b. the workspace's fixed height is computed once per render from computeAddWorkspaceGeometry, independent of any step's content — the direct replacement for the probe's old job of pre-learning a content-derived height",
    /const \{ fixedSheetHeight \} = computeAddWorkspaceGeometry\(/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "8c. addWorkspaceGeometry.ts itself imports nothing from react/react-native/AddWealthItemModal/TransferForm — it is genuinely content-independent by construction (its own behaviour is separately real-import tested in tests/add-workspace-geometry.test.ts)",
    !/from ['"]react['"]/.test(GEOMETRY_SRC) &&
      !/from ['"]react-native['"]/.test(GEOMETRY_SRC) &&
      !/AddWealthItemModal|TransferForm/.test(GEOMETRY_SRC)
  );
  assert(
    // The intent here is that no GUESSED sheet/workspace height is
    // reintroduced (the pilot removed those). This is now STRICTER than it
    // was: the Wave 4 device correction moved every icon dimension out of
    // this file into the one shared `AddIcon` renderer, so the former 44pt
    // iconBadge and 28pt row-icon literals are gone entirely. The only
    // literal left is the DOCUMENTED 52pt catalogue task row (doc A p.5).
    '8d. no guessed/fixed pixel height constant exists anywhere in AddAnythingSheet.tsx — only the documented Design 5.1 52pt catalogue row',
    (() => {
      const allowed: string[] = ['minHeight: 52'];
      const matches: string[] = ADD_ANYTHING_SRC.match(/\b(min)?[Hh]eight:\s*\d+/g) ?? [];
      return matches.every((m) => allowed.includes(m)) && matches.includes('minHeight: 52');
    })()
  );
  assert(
    '8d-i. and the icon dimensions it used to hard-code now come from AddIcon\'s own named constants',
    (() => {
      const icon = require('fs').readFileSync(require('path').resolve(__dirname, '../src/components/shared/AddIcon.tsx'), 'utf8');
      return /export const ADD_ICON_SIZE = 20;/.test(icon) && /export const ADD_ICON_TILE_SIZE = 36;/.test(icon);
    })()
  );
  assert(
    '8e. the retired probe never affected, and its retirement never touches, the standalone AddWealthItemModal.tsx — no probe-related marker was ever, or is now, referenced from that file',
    !/addAssetProbed/.test(ADD_WEALTH_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
