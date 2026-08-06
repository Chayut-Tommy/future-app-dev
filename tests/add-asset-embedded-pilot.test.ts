// Navigation Transitions, Option B pilot (Add Anything -> Add Asset).
//
// Structural-only (Class C) wiring guard proving the embedded pilot is
// isolated to exactly one call site, always paired with kind="asset" —
// i.e. liability and credit-card sessions are never unintentionally
// embedded or transitioned. Real behavioural coverage of the state machine
// itself lives in tests/add-asset-transition-controller.test.ts (real
// import); this file only confirms source-level wiring, not runtime
// behaviour.
//
// Run with: ./node_modules/.bin/tsx tests/add-asset-embedded-pilot.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const ADD_WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferModal.tsx', 'utf-8');
const FLOATING_ADD_BUTTON_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/FloatingAddButton.tsx', 'utf-8');
const WEALTH_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/wealth/WealthScreen.tsx', 'utf-8');
const DISCOVER_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/discover/DiscoverScreen.tsx', 'utf-8');
const TODAY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/today/TodayScreen.tsx', 'utf-8');
const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');
const CONTROLLER_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/addAssetTransitionController.ts', 'utf-8');
const GEOMETRY_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/addWorkspaceGeometry.ts', 'utf-8');

console.log('=== 1. embedded is passed to AddWealthItemModal at exactly one call site — the real, ref-holding, interactive instance — never with kind="liability" (Class C) ===');
{
  // Premium-transition correction — the height-measurement probe (a SECOND
  // <AddWealthItemModal embedded> instance, added in an earlier correction
  // round specifically to pre-measure a natural height) has been retired
  // along with the whole natural-height-measurement mechanism it existed to
  // serve: the workspace's height is now content-independent
  // (addWorkspaceGeometry.ts), so there is nothing left to probe. Back to
  // exactly one real, always-mounted-once-entered instance.
  // \s (not [\s\S]) immediately after the tag name — excludes the
  // unrelated `useRef<AddWealthItemModalHandle>(...)` type-generic
  // occurrence earlier in the file, which is not a JSX tag at all but
  // would otherwise false-match as an enormous, wrong span up to the next
  // unrelated "/>" anywhere later in the file.
  const embeddedBlocks = ADD_ANYTHING_SRC.match(/<AddWealthItemModal\s[\s\S]*?\/>/g) ?? [];
  assert('1a. AddAnythingSheet.tsx renders exactly one AddWealthItemModal instance (the probe is retired)', embeddedBlocks.length === 1);
  const realBlock = embeddedBlocks[0] ?? '';
  assert('1b. the one instance holds the ref (addAssetModalRef) — the real, Save/Close-reachable one', /ref=\{addAssetModalRef\}/.test(realBlock));
  assert('1c. the real instance passes embedded and kind="asset" — never "liability"', /\bembedded\b/.test(realBlock) && /kind="asset"/.test(realBlock) && !/kind="liability"/.test(realBlock));
  assert('1d. the real instance never passes onSelectCreditCard (credit-card handoff is a liability-only concern, unreachable for kind="asset")', !/onSelectCreditCard/.test(realBlock));
  assert(
    '1e. the probe\'s own retired markers (addAssetProbed state, its inert no-op onClose/onSaveSuccess/onConfirmedClose block, its opacity:0 wrapper) no longer exist anywhere in the file',
    !/addAssetProbed/.test(ADD_ANYTHING_SRC) &&
      !/presetAssetType="cash"\s*\n\s*onClose=\{\(\) => \{\}\}/.test(ADD_ANYTHING_SRC) &&
      !/style=\{\{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 \}\}/.test(ADD_ANYTHING_SRC)
  );
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

console.log('\n=== 3. AddWealthItemModal.tsx: embedded mode cannot reach the category-step or liability-selector-step branches (Class C) ===');
{
  // Both early-return branches keep their EXACT existing guard conditions,
  // unmodified by this pilot — the category step requires no presetAssetType
  // AND no editAsset (this pilot's one caller always supplies a
  // presetAssetType), and the liability-selector step requires
  // kind==='liability' (this pilot's one caller always supplies
  // kind="asset") — so neither branch is reachable when embedded, by
  // construction, without either branch needing to know `embedded` exists.
  assert('3a. the category-step branch still gates on kind/formStep unchanged', /if \(kind === 'asset' && formStep === 'category'\)/.test(ADD_WEALTH_SRC));
  assert('3b. the liability-selector-step branch still gates on kind/showLiabilitySelector unchanged', /if \(kind === 'liability' && showLiabilitySelector\)/.test(ADD_WEALTH_SRC));
}

console.log('\n=== 4. AddWealthItemModal.tsx: embedded only ever skips the KeyboardSheet wrapper, never the save/validation logic (Class C) ===');
{
  assert('4a. the embedded branch returns the same `content` every standalone render also uses — not a second, separate render path', /if \(embedded\) \{\s*\n\s*return content;\s*\n\s*\}/.test(ADD_WEALTH_SRC));
  assert('4b. performSave still branches embedded vs standalone only for HOW it closes (onSaveSuccess vs onClose), never for whether addAsset/updateAsset is called', /if \(embedded\) \{\s*\n\s*onSaveSuccess\?\.\(\);\s*\n\s*\} else \{\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_WEALTH_SRC));
  assert('4c. requestEmbeddedClose never bypasses the discard-confirmation gate for any reason except the never-discards "back"', /function requestEmbeddedClose\(reason: AddWealthItemCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\?\.\(reason\)\);/.test(ADD_WEALTH_SRC));
}

console.log('\n=== 5. Move Money (Transfer) files show zero trace of this pilot — proves no cross-contamination (Class C) ===');
{
  // Deliberately pilot-specific markers, not the bare "AddWealthItemModal"
  // component name — TransferForm.tsx already legitimately references that
  // name in a pre-existing, accepted comment (its own submittingRef pattern
  // credits AddWealthItemModal's established convention), which would
  // false-positive against a bare-name check despite being unrelated to
  // this pilot.
  assert('5a. TransferForm.tsx has no Add-Asset-pilot marker', !/addAssetTransitionController|addAssetModalRef|Navigation Transitions, Option B pilot/.test(TRANSFER_FORM_SRC));
  assert('5b. TransferModal.tsx has no Add-Asset-pilot marker', !/addAssetTransitionController|addAssetModalRef|Navigation Transitions, Option B pilot/.test(TRANSFER_MODAL_SRC));
  // AMENDMENT — premium-transition correction. 5c previously claimed
  // enterTransfer/backToChooser were BYTE-IDENTICAL to the accepted
  // checkpoint (same chooserAnim/transferAnim/generationRef reads). That
  // claim is now legitimately stale: the correction's own explicitly
  // authorized scope expanded to migrate Move Money's own transition to the
  // same opaque push contract as Add Asset, so these two functions'
  // internal ANIMATION technique has genuinely changed (chooserAnim/
  // transferAnim's opacity+24px cross-fade -> chooserTransferProgress's
  // single-value translateX push). What's still true, and still worth
  // protecting, is narrower: (1) their own first-tap-wins/re-entrancy guard
  // lines are byte-identical, proving that invariant survived the
  // animation-technique change; (2) neither function, nor TransferForm.tsx/
  // TransferModal.tsx (5a/5b above), gained any reference to Add-Asset-pilot
  // machinery — the two transitions share a RENDER MECHANISM, never
  // decision state; (3) TransferForm's own financial transferFunds logic is
  // untouched (proven by 5a's marker check on the file that actually
  // contains it — this correction never touched TransferForm.tsx at all).
  assert(
    "5c. enterTransfer/backToChooser still open with their original, unchanged first-tap-wins/re-entrancy guard lines",
    /function enterTransfer\(\) \{\s*\n\s*if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with choose\(\)/.test(ADD_ANYTHING_SRC) &&
      /function backToChooser\(\) \{\s*\n\s*if \(returningToChooserRef\.current\) return; \/\/ synchronous re-entrancy guard for Back itself/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '5d. enterTransfer/backToChooser now animate via chooserTransferProgress (the shared push-progress value), not the retired chooserAnim/transferAnim opacity pair — confirming the animation-technique migration actually happened, not just went undetected (the retired names may still appear in the explanatory retirement comment, which is fine — this checks for their DECLARATIONS, not the bare words)',
    /chooserTransferProgress\.setValue\(0\);\s*\n\s*Animated\.timing\(chooserTransferProgress, \{ toValue: 1, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true \}\)\.start/.test(ADD_ANYTHING_SRC) &&
      /chooserTransferProgress\.setValue\(1\);\s*\n\s*Animated\.timing\(chooserTransferProgress, \{ toValue: 0, duration: PUSH_TRANSITION_DURATION_MS, useNativeDriver: true \}\)\.start/.test(ADD_ANYTHING_SRC) &&
      !/const chooserAnim =|const transferAnim =/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "5e. TransferForm's actual financial save logic (transferFunds) is untouched — proven by the complete absence of any Add-Asset-pilot or premium-transition-correction marker in TransferForm.tsx itself (5a), which is the only file that contains it; this correction's authorized scope was always the render/animation technique in AddAnythingSheet.tsx, never TransferForm.tsx's own calculation code",
    !/premium-transition|PUSH_TRANSITION_DURATION_MS|chooserTransferProgress/.test(TRANSFER_FORM_SRC)
  );
}

console.log('\n=== 6. The transition controller module is genuinely pure — no React/RN import (Class C, supports the real-import test\'s own claim) ===');
{
  assert('6a. addAssetTransitionController.ts imports nothing from "react"', !/from ['"]react['"]/.test(CONTROLLER_SRC));
  assert('6b. addAssetTransitionController.ts imports nothing from "react-native"', !/from ['"]react-native['"]/.test(CONTROLLER_SRC));
}

console.log('\n=== 7. Correction pass (§2) — accessibility focus lifecycle wiring (Class C; the ACTUAL decision — whether a request is stale — is real-import tested via the reducer\'s generation-adjacent semantics in add-asset-transition-controller.test.ts; this only confirms the wiring exists) ===');
{
  assert(
    "7a. focusElement uses AccessibilityInfo.setAccessibilityFocus on iOS and AccessibilityInfo.sendAccessibilityEvent(..., 'focus') on Android — and accessibilityLiveRegion is never used as an actual JSX prop anywhere (only mentioned in an explanatory comment, which is fine and is why this checks for the '=' that would indicate real prop usage, not the bare word)",
    /if \(Platform\.OS === 'ios'\) \{\s*\n\s*const tag = findNodeHandle\(node as never\);\s*\n\s*if \(tag != null\) AccessibilityInfo\.setAccessibilityFocus\(tag\);\s*\n\s*\} else \{\s*\n\s*AccessibilityInfo\.sendAccessibilityEvent\(node as never, 'focus'\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC) &&
      !/accessibilityLiveRegion=/.test(ADD_ANYTHING_SRC)
  );
  assert('7b. beginAddAssetTransitionAnimation schedules a pendingFocusRef request (target addAsset) in BOTH the reduced-motion branch and the real animation\'s completion callback — never skipped in either path', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function beginAddAssetTransitionAnimation()');
    const end = ADD_ANYTHING_SRC.indexOf('\n  function ', start + 1);
    const body = ADD_ANYTHING_SRC.slice(start, end);
    const scheduleCount = (body.match(/pendingFocusRef\.current = \{ generation: myGeneration, target: 'addAsset' \};/g) || []).length;
    return scheduleCount === 2;
  })());
  assert('7c. backToChooserFromAddAsset schedules a pendingFocusRef request (target chooser) in BOTH branches', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function backToChooserFromAddAsset()');
    const end = ADD_ANYTHING_SRC.indexOf('\n  function ', start + 1);
    const body = ADD_ANYTHING_SRC.slice(start, end);
    const scheduleCount = (body.match(/pendingFocusRef\.current = \{ generation: myGeneration, target: 'chooser' \};/g) || []).length;
    return scheduleCount === 2;
  })());
  assert(
    '7d. the focus-consuming effect only acts once addAssetTransition.status is idle (never on a still-hidden element) AND only when the request\'s own recorded generation still matches the current addAssetGenerationRef (stale requests from Back/dismissal/a newer transition/Save are silently dropped)',
    /if \(addAssetTransition\.status !== 'idle'\) return;\s*\n\s*pendingFocusRef\.current = null;\s*\n\s*if \(pending\.generation !== addAssetGenerationRef\.current\) return;/.test(ADD_ANYTHING_SRC)
  );
  assert('7e. exactly one announceForAccessibility call exists, gated behind the same single consumption of a pending addAsset-target request (never a second, redundant announcement source)', (ADD_ANYTHING_SRC.match(/AccessibilityInfo\.announceForAccessibility\(/g) || []).length === 1);
  assert(
    '7f. a successful Save (handleAddAssetSaveSuccess) independently bumps addAssetGenerationRef and clears pendingFocusRef before closing — invalidates stale focus work on Save, not just on Back/dismissal/RESET/a newer transition',
    /function handleAddAssetSaveSuccess\(\) \{\s*\n\s*addAssetGenerationRef\.current\+\+;\s*\n\s*pendingFocusRef\.current = null;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC) &&
      /onSaveSuccess=\{handleAddAssetSaveSuccess\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '7g. the fresh-open reset effect (RESET) also clears pendingFocusRef and the origin-tile ref — the two other invalidation points explicitly required alongside Save/Back/a newer transition',
    /pendingFocusRef\.current = null;\s*\n\s*addAssetOriginTileKeyRef\.current = null;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "7h. the Add Asset heading (focus target for Forward) is a real, ref-held, accessibilityRole=\"header\" element rendered inside the addAsset layer — not the outer KeyboardSheet's own separate title text",
    /<Text ref=\{addAssetHeadingRef\} style=\{styles\.body\} accessibilityRole="header">/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '7i. Back\'s focus target is looked up via assetTileRefs keyed by addAssetOriginTileKeyRef.current — the exact tile that opened the draft, not a generic/first tile',
    /const tileKey = addAssetOriginTileKeyRef\.current;\s*\n\s*focusElement\(tileKey \? assetTileRefs\.current\[tileKey\] \?\? null : null\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '7j. every one of the five asset tiles registers itself into assetTileRefs via a ref callback keyed by its own o.key — the actual per-tile ref map Back\'s focus restoration reads from',
    /ref=\{\(el\) => \{[\s\S]{0,400}?assetTileRefs\.current\[o\.key\] = el;/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 8. Correction pass (§3) — asset-type switching wiring (Class C; the actual A/B/C/D branching decision is real-import tested via decideAssetTileSelection) ===');
{
  assert(
    '8a. chooseAssetTile computes its outcome via the real, imported decideAssetTileSelection — not a re-implemented inline copy of the same branching',
    /const outcome = decideAssetTileSelection\(\{\s*\n\s*everEntered: addAssetEverEnteredRef\.current,\s*\n\s*currentPresetType: addAssetPresetType,\s*\n\s*selectedPresetType: presetType,\s*\n\s*isDirty: addAssetIsDirty,\s*\n\s*\}\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "8b. 'proceed' and 'switchClean' both call proceedIntoAddAsset with the newly tapped tile/preset — 'proceed' never bumps the instance key (restores exactly), 'switchClean' always does (fresh form, nothing stale)",
    /case 'proceed':\s*\n\s*proceedIntoAddAsset\(tileKey, presetType, false\);\s*\n\s*return;\s*\n\s*case 'switchClean':\s*\n\s*proceedIntoAddAsset\(tileKey, presetType, true\);\s*\n\s*return;/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "8c. 'confirmSwitch' shows confirmSwitchAssetType before doing anything else — Discard-and-switch proceeds with the NEW tile/preset (fresh instance); Continue-editing proceeds with the EXISTING preset/origin tile (no fresh instance) — never persists anything itself",
    /confirmSwitchAssetType\(\s*\n\s*\(\) => proceedIntoAddAsset\(tileKey, presetType, true\),\s*\n\s*\(\) => proceedIntoAddAsset\(currentOriginTileKey, currentPresetType, false\)\s*\n\s*\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '8d. confirmSwitchAssetType uses the exact required wording ("Switch asset type?" / "Your current asset details will be discarded." / "Continue editing" / "Discard and switch")',
    /Alert\.alert\('Switch asset type\?', 'Your current asset details will be discarded\.', \[\s*\n\s*\{ text: 'Continue editing', style: 'cancel', onPress: onContinueEditing \},\s*\n\s*\{ text: 'Discard and switch', style: 'destructive', onPress: onDiscardAndSwitch \},/.test(
      ADD_ANYTHING_SRC
    )
  );
  assert(
    '8e. proceedIntoAddAsset only bumps addAssetInstanceKey (forcing a fresh AddWealthItemModal remount) when explicitly told to — never on a same-type restore',
    /function proceedIntoAddAsset\(tileKey: AddAnythingKind, presetType: AssetType, freshInstance: boolean\) \{\s*\n\s*if \(selectionLockRef\.current\) return;[\s\S]{0,200}?if \(freshInstance\) \{\s*\n\s*setAddAssetInstanceKey\(\(k\) => k \+ 1\);\s*\n\s*\}/.test(
      ADD_ANYTHING_SRC
    )
  );
  assert(
    '8f. the embedded AddWealthItemModal is actually keyed on addAssetInstanceKey — the mechanism that forces React to fully remount (and therefore reset) it on a confirmed/clean type switch',
    /<AddWealthItemModal\s*\n\s*key=\{addAssetInstanceKey\}\s*\n\s*ref=\{addAssetModalRef\}/.test(ADD_ANYTHING_SRC)
  );
  assert('8g. no path in chooseAssetTile/proceedIntoAddAsset/confirmSwitchAssetType calls addAsset/updateAsset or any AddWealthItemModal save method directly — persistence only ever happens through the unchanged Save button -> addAssetModalRef.current.requestSave() path', (() => {
    const start = ADD_ANYTHING_SRC.indexOf('function chooseAssetTile(tileKey: AddAnythingKind)');
    const end = ADD_ANYTHING_SRC.indexOf('\n  // Back never discards', start);
    const body = ADD_ANYTHING_SRC.slice(start, end) + ADD_ANYTHING_SRC.slice(ADD_ANYTHING_SRC.indexOf('function proceedIntoAddAsset'), ADD_ANYTHING_SRC.indexOf('\n  // Correction pass (§3) — the chooser'));
    return !/requestSave|addAsset\(|updateAsset\(/.test(body);
  })());
}

console.log('\n=== 9. Premium-transition correction — the height-measurement probe (§4\'s old fix) is superseded by a content-independent fixed workspace height (Class C) ===');
{
  // The probe (§4, an earlier correction round) existed only to serve the
  // natural-height-measurement mechanism that has now been retired wholesale
  // — the workspace's own outer height no longer depends on ANY step's
  // content, so there is nothing left for a probe to pre-measure. This
  // section now protects the RETIREMENT, and the new mechanism that made it
  // unnecessary, instead of the probe's own old behaviour.
  assert(
    "9a. every one of the probe's own former markers (addAssetProbed, addAssetNaturalHeight, the cash-preset probe render block) no longer exists as a declaration (the names may still appear in the explanatory retirement comment at the top of the file, which is fine)",
    !/addAssetProbed/.test(ADD_ANYTHING_SRC) &&
      !/const \[addAssetNaturalHeight/.test(ADD_ANYTHING_SRC) &&
      !/setAddAssetNaturalHeight/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "9b. the workspace's fixed height is computed once per render from computeAddWorkspaceGeometry, independent of chooser/Transfer/Add Asset content — the direct replacement for the probe's old job of pre-learning a content-derived height",
    /const \{ fixedSheetHeight \} = computeAddWorkspaceGeometry\(/.test(ADD_ANYTHING_SRC)
  );
  assert(
    "9c. addWorkspaceGeometry.ts itself imports nothing from react/react-native/AddWealthItemModal/TransferForm — it is genuinely content-independent by construction, not just by convention (its own behaviour is separately real-import tested in tests/add-workspace-geometry.test.ts; this only confirms it has no way to read any step's content in the first place)",
    !/from ['"]react['"]/.test(GEOMETRY_SRC) &&
      !/from ['"]react-native['"]/.test(GEOMETRY_SRC) &&
      !/AddWealthItemModal|TransferForm/.test(GEOMETRY_SRC)
  );
  assert(
    '9d. no new guessed/fixed pixel height constant was introduced for Add Asset in AddAnythingSheet.tsx itself — the only remaining literal-pixel height in the file is the pre-existing, unrelated 44px iconBadge (re-confirmed here since §3a in the sibling white-gap-and-dismissal test already covers this file-wide)',
    (() => {
      const matches = ADD_ANYTHING_SRC.match(/\b(min)?[Hh]eight:\s*\d+/g) || [];
      return matches.length === 1 && matches[0] === 'height: 44';
    })()
  );
  assert(
    '9e. the retired probe never affected, and its retirement never touches, the standalone AddWealthItemModal.tsx — no probe-related marker was ever, or is now, referenced from that file',
    !/addAssetProbed/.test(ADD_WEALTH_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
