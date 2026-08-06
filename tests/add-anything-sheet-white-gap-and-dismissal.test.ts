// Stream D — Round 7 (three-defect correction pass, physical-device
// retest #3). Fixes three defects reported from a 56-second device
// recording, on top of the ACCEPTED Round 6 persistent-host Transfer
// direction (unchanged this round):
//
// 1. Add chooser white gap — position:'absolute' chooser/Transfer layers
//    never contributed to their `contentArea` parent's own Yoga-computed
//    height, so contentArea was pinned to a guessed 400px constant
//    (ADD_FLOW_CONTENT_MIN_HEIGHT) shorter than the chooser's real content
//    (13 tiles/3 groups), while the outer sheet was independently pinned to
//    an unrelated guessed 560px floor (ADD_FLOW_MIN_HEIGHT) — clipping tiles
//    past 400px AND leaving a blank gap below them, from one root cause.
//    Fixed by retiring both guessed constants and instead measuring the
//    chooser's own real content height via onLayout whenever it is the
//    sole, settled, normally-positioned screen (chooserIsSoloAndSettled),
//    then reusing that real measurement (chooserNaturalHeight) as both the
//    explicit contentArea height and the sheet's own minSheetHeight for
//    every other state (Transfer active, or transitioning).
// 2. Wrong form flashes after saving an asset — AddWealthItemModal read the
//    `kind` prop directly at every one of ~25 sites; FloatingAddButton
//    clears that prop (setWealthModal(null)) in the same synchronous tick
//    as a successful save, while RN's Modal (iOS) keeps rendering the OLD
//    content until the REAL native dismissal completes — so the outgoing
//    Add Asset form re-rendered mid-dismissal with whatever the prop had
//    just become (observed: Personal Loan). Fixed by renaming the prop to
//    `kindProp` and shadowing it with local state `kind`, synced from
//    `kindProp` ONLY inside the existing reset-on-open effect (already
//    gated on `if (!visible) return`) — so `kind` (and everything derived
//    from it) is frozen at whatever it was for the entire time the sheet
//    can still be visible, and only updates once a fresh open is genuinely
//    starting. No timeout is used anywhere in this fix.
// 3. Talk to Navilo exit remains laggy — AskLuluSheet owns its own raw
//    Modal (not KeyboardSheet-based) and had the exact same premature-
//    translateY-reset bug Round 6 fixed in KeyboardSheet, PLUS no onDismiss
//    wiring at all. Fixed with the identical local pattern: dismiss()'s JS-
//    animation-complete callback no longer resets translateY, a new
//    handleNativeDismissComplete function (wired to the Modal's onDismiss)
//    does that reset instead, at the real native-completion boundary.
//
// DURABLE LOCATION — relocated from the session scratchpad into this
// tracked `tests/` directory during checkpoint preparation, so this
// coverage survives across sessions. Content unchanged from its proven,
// passing form; only this note and the "Run with" line below were
// updated. All three fixes described below were subsequently accepted on
// physical-device retest (see the checkpoint report for the exact
// evidence) — this file remains structural-only and must not be read as
// re-proving that acceptance itself.
//
// CLASSIFICATION:
// - Structural (static/source-structure) only: every assertion below.
// - No component/runtime test exists in this repo (no test framework).
// - NOT proven here: that the white gap is visually gone, that no flash is
//   visible, that Talk to Navilo's exit is visually smooth, animation
//   timing/smoothness, or any other visual/runtime claim. Do NOT describe
//   these assertions as proof of visual behaviour — physical-device
//   evidence (already obtained and accepted) is the actual proof.
//
// Run with: npx tsx tests/add-anything-sheet-white-gap-and-dismissal.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const KEYBOARD_SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/shared/KeyboardSheet.tsx', 'utf-8');
const ASK_LULU_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AskLuluSheet.tsx', 'utf-8');
const ADD_WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');
const TRANSFER_MODAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferModal.tsx', 'utf-8');
const GOAL_DETAIL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/goals/GoalDetailSheet.tsx', 'utf-8');
const ADD_RECURRING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/AddRecurringItemModal.tsx', 'utf-8');

console.log('=== 1. Add chooser white gap: guessed-height constants retired (Class C) ===');
{
  assert('1a. no `const ADD_FLOW_MIN_HEIGHT` declaration remains (name may still appear in the explanatory root-cause comment, which is fine)', !/const ADD_FLOW_MIN_HEIGHT/.test(ADD_ANYTHING_SRC));
  assert('1b. no `const ADD_FLOW_CONTENT_MIN_HEIGHT` declaration remains (name may still appear in the explanatory root-cause comment, which is fine)', !/const ADD_FLOW_CONTENT_MIN_HEIGHT/.test(ADD_ANYTHING_SRC));
  assert('1c. styles.contentArea (static minHeight guess) no longer exists in the styles object', !/contentArea:\s*\{/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 2. Add chooser white gap: real measurement replaces the guesses (Class C) ===');
{
  assert(
    '2a. chooserNaturalHeight state exists, typed number|null, defaulting to null (no guess)',
    /const \[chooserNaturalHeight, setChooserNaturalHeight\] = useState<number \| null>\(null\);/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2b. chooserIsSoloAndSettled is derived from screen===\'chooser\' && transitionPhase===\'idle\' — the only state where the chooser is the sole, non-cross-fading layer',
    /const chooserIsSoloAndSettled = screen === 'chooser' && transitionPhase === 'idle';/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2c. the sheet\'s minSheetHeight prop now uses chooserNaturalHeight (with undefined fallback before first measurement), not a fixed guess',
    /minSheetHeight=\{chooserNaturalHeight \?\? undefined\}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2d. the content wrapper View\'s style is computed conditionally: no explicit height while chooserIsSoloAndSettled (lets Yoga size it naturally), else an explicit height of the real measurement once known',
    /chooserIsSoloAndSettled \? null : chooserNaturalHeight !== null \? \{ height: chooserNaturalHeight \} : null/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2e. the chooser Animated.View conditionally drops styles.screenLayer (position:absolute) while solo+settled, so Yoga can measure its true content height in normal flow',
    /chooserIsSoloAndSettled \? null : styles\.screenLayer,/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2f. the chooser Animated.View has an onLayout handler, active only while chooserIsSoloAndSettled, that captures the real measured height',
    /onLayout=\{\s*\n\s*chooserIsSoloAndSettled\s*\n\s*\? \(e\) => \{\s*\n\s*const measured = e\.nativeEvent\.layout\.height;\s*\n\s*setChooserNaturalHeight/.test(ADD_ANYTHING_SRC)
  );
  assert(
    '2g. the Transfer Animated.View still always uses styles.screenLayer (position:absolute) unconditionally — it must stay absolutely positioned to overlap the chooser during the cross-fade and to sit inside the explicit-height container once Transfer is active',
    /\{showTransfer \? \(\s*\n\s*<Animated\.View\s*\n\s*style=\{\[\s*\n\s*styles\.screenLayer,/.test(ADD_ANYTHING_SRC)
  );
}

console.log('\n=== 3. Add chooser white gap: no arbitrary padding/height hacks introduced (Class C) ===');
{
  assert(
    '3a. no new fixed pixel height/padding constant was introduced as a substitute for the retired guesses (the only remaining literal-pixel `height:`/`minHeight:` style in the file is the pre-existing, unrelated 44px iconBadge)',
    (() => {
      const matches = ADD_ANYTHING_SRC.match(/\b(min)?[Hh]eight:\s*\d+/g) || [];
      return matches.length === 1 && matches[0] === 'height: 44';
    })()
  );
  assert('3b. screenLayer style itself is unchanged (still just absolute positioning, no height guess baked into it)', /screenLayer: \{ position: 'absolute', top: 0, left: 0, right: 0 \},/.test(ADD_ANYTHING_SRC));
}

console.log('\n=== 4. Personal Loan flash: kind prop renamed and shadowed by frozen local state (Class C) ===');
{
  assert('4a. the destructured prop is now kindProp, not kind directly', /kind: kindProp,/.test(ADD_WEALTH_SRC));
  assert(
    '4b. a local `kind` state exists, initialised from kindProp, typed \'asset\' | \'liability\' | null',
    /const \[kind, setKind\] = useState<'asset' \| 'liability' \| null>\(kindProp\);/.test(ADD_WEALTH_SRC)
  );
  assert(
    '4c. kind is synced from kindProp exactly once, inside the reset-on-open effect (reachable only past its `if (!visible) return` guard)',
    (() => {
      const effectStart = ADD_WEALTH_SRC.indexOf('useEffect(() => {\n    if (!visible) return;');
      if (effectStart === -1) return false;
      const effectEnd = ADD_WEALTH_SRC.indexOf('[visible, kindProp, editAsset, editLiability, presetAssetType, presetLiabilityType, liabilityFlowIntent]', effectStart);
      if (effectEnd === -1) return false;
      const body = ADD_WEALTH_SRC.slice(effectStart, effectEnd);
      return body.includes('setKind(kindProp);') && (body.match(/setKind\(/g) || []).length === 1;
    })()
  );
  assert('4d. no timeout is used anywhere to conceal or delay the kind reset', !/setTimeout[\s\S]{0,80}kind/i.test(ADD_WEALTH_SRC.split('\n').filter((l) => l.includes('setTimeout')).join('\n')));
  assert(
    '4e. the branch that decides showLiabilitySelector/targetLiabilityId/editingLoanDetails inside that same effect reads the live kindProp, not the not-yet-updated local kind (avoids reading the previous session\'s frozen value within the same synchronous callback)',
    /const matching = kindProp === 'liability'/.test(ADD_WEALTH_SRC) &&
      /const shouldOfferSelector = kindProp === 'liability'/.test(ADD_WEALTH_SRC)
  );
  assert('4f. formStep is computed from kindProp (the live prop) inside the same effect, consistent with the rest of that effect', /setFormStep\(kindProp === 'asset' && !editAsset && !presetAssetType \? 'category' : 'details'\);/.test(ADD_WEALTH_SRC));
}

console.log('\n=== 5. Personal Loan flash: every other read site now uses the frozen local `kind` automatically (Class C) ===');
{
  assert('5a. no other bare reference to the removed `kind` prop remains outside the rename/effect-sync sites (i.e. no `kind: kindProp` duplicate, no second destructure of `kind` directly)', (ADD_WEALTH_SRC.match(/\bkind: kindProp\b/g) || []).length === 1);
  assert('5b. the component still compiles as a single kind identifier used throughout (useState declaration present exactly once)', (ADD_WEALTH_SRC.match(/const \[kind, setKind\]/g) || []).length === 1);
}

console.log('\n=== 6. Talk to Navilo exit lag: local dismissal-lifecycle fix mirrors KeyboardSheet\'s Round 6 fix (Class C) ===');
{
  assert(
    '6a. dismiss()\'s JS-animation-complete callback no longer resets translateY — only calls onClose()',
    /function dismiss\(\) \{\s*\n\s*Animated\.timing\(translateY, \{ toValue: 800, duration: 200, useNativeDriver: true \}\)\.start\(\(\) => \{\s*\n\s*onClose\(\);\s*\n\s*\}\);\s*\n\s*\}/.test(ASK_LULU_SRC)
  );
  assert(
    '6b. a dedicated handleNativeDismissComplete function exists and resets translateY to 0',
    /function handleNativeDismissComplete\(\) \{\s*\n\s*translateY\.setValue\(0\);\s*\n\s*\}/.test(ASK_LULU_SRC)
  );
  assert(
    '6c. the Modal now has an onDismiss prop wired to handleNativeDismissComplete (previously had none)',
    /<Modal visible=\{visible\} animationType="slide" transparent onRequestClose=\{dismiss\} onDismiss=\{handleNativeDismissComplete\}>/.test(ASK_LULU_SRC)
  );
  assert('6d. no leftover synchronous translateY.setValue(0) call remains inside dismiss() itself', !/function dismiss\(\) \{[\s\S]*?translateY\.setValue\(0\)[\s\S]*?onClose\(\);/.test(ASK_LULU_SRC));
  assert('6e. the public {visible, onClose} API is unchanged — same signature callers already use', /export function AskLuluSheet\(\{ visible, onClose \}: \{ visible: boolean; onClose: \(\) => void \}\)/.test(ASK_LULU_SRC));
  assert(
    '6f. AskLuluSheet is NOT routed through KeyboardSheet — no import of it, and it keeps its own independent <Modal>/PanResponder, per explicit instruction not to make it part of the Add persistent host (the word may still appear in an explanatory comment, which is fine)',
    !/from '..\/shared\/KeyboardSheet'/.test(ASK_LULU_SRC) && !/<KeyboardSheet/.test(ASK_LULU_SRC) && /<Modal /.test(ASK_LULU_SRC)
  );
}

console.log('\n=== 7. KeyboardSheet unchanged this round (Class C) ===');
{
  assert('7a. KeyboardSheet.tsx has no Round-7 marker — file untouched this round', !/Round 7/.test(KEYBOARD_SHEET_SRC));
  assert(
    '7b. KeyboardSheet\'s own Round-6 handleNativeDismissComplete fix is still present, unmodified',
    /function handleNativeDismissComplete\(\) \{\s*\n\s*translateY\.setValue\(0\);\s*\n\s*onDismiss\?\.\(\);\s*\n\s*\}/.test(KEYBOARD_SHEET_SRC)
  );
  assert('7c. minSheetHeight prop still applied as { minHeight: minSheetHeight } on the sheet Animated.View, unchanged from Round 4', /minSheetHeight \? \{ minHeight: minSheetHeight \} : null,/.test(KEYBOARD_SHEET_SRC));
}

console.log('\n=== 8. Accepted Round 6/Round 5/Round 4 Transfer proof-of-pattern behaviour carried over unchanged (Class C) ===');
{
  assert('8a. selectionLockRef is still the first, synchronous check in both choose() and enterTransfer()', /if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with enterTransfer\(\)/.test(ADD_ANYTHING_SRC) && /if \(selectionLockRef\.current\) return; \/\/ synchronous first-tap-wins — shared with choose\(\)/.test(ADD_ANYTHING_SRC));
  assert('8b. handleRequestClose still bumps generationRef then calls the real top-level onClose', /function handleRequestClose\(\) \{\s*\n\s*generationRef\.current\+\+;\s*\n\s*onClose\(\);\s*\n\s*\}/.test(ADD_ANYTHING_SRC));
  assert('8c. onSelect is still called from exactly one place (runPendingSelection), gated on kind !== null', (ADD_ANYTHING_SRC.match(/\bonSelect\(kind\)/g) || []).length === 1);
  assert('8d. embedded Transfer wiring (embedded prop, onDirtyChange, onSaveSuccess, onConfirmedClose) is structurally unchanged', /<TransferForm\s*\n\s*ref=\{transferFormRef\}\s*\n\s*embedded\s*\n\s*onCanSaveChange=\{setTransferCanSave\}\s*\n\s*onDirtyChange=\{setTransferIsDirty\}\s*\n\s*onSaveSuccess=\{onClose\}/.test(ADD_ANYTHING_SRC));
  assert('8e. TransferForm.tsx has no Round-7 marker — file untouched this round', !/Round 7/.test(TRANSFER_FORM_SRC));
  assert('8f. TransferModal.tsx has no Round-7 marker — file untouched this round', !/Round 7/.test(TRANSFER_MODAL_SRC));
}

console.log('\n=== 9. Untouched protected files (Class C) ===');
{
  assert('9a. GoalDetailSheet.tsx has no Round-7 marker', !/Round 7/.test(GOAL_DETAIL_SRC));
  assert('9b. AddRecurringItemModal.tsx has no Round-7 marker', !/Round 7/.test(ADD_RECURRING_SRC));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
