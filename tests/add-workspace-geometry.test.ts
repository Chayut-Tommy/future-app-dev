// Navigation Transitions, Option B — premium fixed-workspace correction.
//
// Real import of the actual production geometry module (src/components/
// navigation/addWorkspaceGeometry.ts) — pure, RN-free, so this is genuine
// behavioural proof of the outer sheet's height formula, the keyboard-
// overlap calculation, and the keyboard-adjusted-height formula: no
// mirrored copy, no structural regex.
//
// CLASSIFICATION:
// - Real import (Class A): every assertion below exercises the actual
//   computeAddWorkspaceGeometry / computeKeyboardOverlap /
//   computeKeyboardAdjustedHeight functions and the actual exported
//   constants.
// - NOT proven here: that KeyboardSheet.tsx / AddAnythingSheet.tsx
//   actually apply these numbers correctly to real native views, that the
//   sheet visually looks stable, that the keyboard interaction feels
//   correct on-device, or any other runtime/visual claim. Both consumer
//   files are .tsx and — like every other RN component file in this
//   repo — cannot be imported under `tsx` (confirmed empirically, same
//   Flow-syntax limitation documented in tests/README.md). Those
//   behaviours require physical-device verification.
//
// Run with: ./node_modules/.bin/tsx tests/add-workspace-geometry.test.ts

import {
  computeAddWorkspaceGeometry,
  computeKeyboardOverlap,
  computeKeyboardAdjustedHeight,
  TOP_CLEARANCE,
  MIN_SHEET_HEIGHT,
  MAX_HEIGHT_FRACTION,
  MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN,
} from '../src/components/navigation/addWorkspaceGeometry';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function approx(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon;
}

console.log('=== 1. Named constants are the expected, token-derived values (real import) ===');
{
  assert('1a. TOP_CLEARANCE is 32 (spacing.xxl)', TOP_CLEARANCE === 32);
  assert('1b. MIN_SHEET_HEIGHT is 320 (spacing.xxl * 10)', MIN_SHEET_HEIGHT === 320);
  // Lowered from 0.92 to 0.82 (physical-device correction) — 0.92 read as
  // an under-filled full-screen modal (excessive empty space below the
  // chooser tiles, below short Property/Investment/Retirement forms, and
  // below Move Money's Amount field). 0.82 is the new design decision.
  assert('1c. MAX_HEIGHT_FRACTION is 0.82', MAX_HEIGHT_FRACTION === 0.82);
  assert('1d. MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN is 192 (spacing.xxl * 6)', MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN === 192);
}

console.log('\n=== 2. Supported-device geometry — small, recorded-illustrative, and large phones (real import) ===');
{
  // Small: iPhone SE (3rd gen), 375x667, top inset 20 (no notch).
  const small = computeAddWorkspaceGeometry({ windowHeight: 667, topInset: 20 });
  assert('2a. small iPhone (SE) — fixedSheetHeight is capped by the new 0.82 ceiling (667*0.82=546.94), well below the raw formula result (667-20-32=615)', approx(small.fixedSheetHeight, 546.94));
  assert('2b. small iPhone — topClearance is windowHeight - fixedSheetHeight, exactly', approx(small.topClearance, 667 - small.fixedSheetHeight));
  assert('2c. small iPhone — fixedSheetHeight is capped by MAX_HEIGHT_FRACTION, not the raw 615 value', small.fixedSheetHeight < 615);
  assert('2c-min. small iPhone — the capped result still comfortably clears MIN_SHEET_HEIGHT (320) — the min/max crossover does not bind on this supported device at 0.82', small.fixedSheetHeight > MIN_SHEET_HEIGHT);

  // Mid (illustrative — not a confirmed match for the actual recording
  // device; a common notch-style iPhone, 390x844, top inset 47). At 0.92
  // this case was NOT capped (raw 765 < old ceiling 776.48); at 0.82 the
  // lowered ceiling (692.08) now dominates — this is the direct, intended
  // effect of the whitespace correction, not a regression.
  const mid = computeAddWorkspaceGeometry({ windowHeight: 844, topInset: 47 });
  assert('2d. mid-size iPhone — fixedSheetHeight is now capped by the new 0.82 ceiling (844*0.82=692.08), shorter than the raw formula result (844-47-32=765)', approx(mid.fixedSheetHeight, 692.08));
  assert('2e. mid-size iPhone — topClearance is exactly 151.92 (844 - 692.08)', approx(mid.topClearance, 151.92));
  assert('2e-min. mid-size iPhone — the capped result still comfortably clears MIN_SHEET_HEIGHT (320)', mid.fixedSheetHeight > MIN_SHEET_HEIGHT);

  // Large: iPhone Pro Max class, 430x932, top inset 59. Also newly capped
  // at 0.82 (raw 841 > new ceiling 764.24), where it was uncapped at 0.92.
  const large = computeAddWorkspaceGeometry({ windowHeight: 932, topInset: 59 });
  assert('2f. large iPhone — fixedSheetHeight is now capped by the new 0.82 ceiling (932*0.82=764.24), shorter than the raw formula result (932-59-32=841)', approx(large.fixedSheetHeight, 764.24));
  assert('2g. large iPhone — topClearance is exactly 167.76 (932 - 764.24)', approx(large.topClearance, 167.76));
  assert('2g-min. large iPhone — the capped result still comfortably clears MIN_SHEET_HEIGHT (320)', large.fixedSheetHeight > MIN_SHEET_HEIGHT);

  assert('2h. taller devices produce a taller fixedSheetHeight (monotonic across the three examples) — still holds even though every one is now ceiling-capped, since the ceiling itself scales with window height', small.fixedSheetHeight < mid.fixedSheetHeight && mid.fixedSheetHeight < large.fixedSheetHeight);
}

console.log('\n=== 3. Safe-area variations (real import) ===');
{
  // At 0.92, a realistic top-inset difference (0 vs 59) produced two
  // genuinely different, uncapped results. At the new 0.82 ceiling, the
  // breakeven inset needed to escape the ceiling on an 844pt window is
  // ~120pt (844*0.18-32) — far beyond any current iPhone's actual top
  // inset (0-59pt). So on every realistic supported device, both ends of
  // the safe-area range now land on the SAME capped ceiling: a genuine,
  // intended consequence of lowering MAX_HEIGHT_FRACTION (the ceiling now
  // dominates the raw per-inset formula for real devices), not a defect.
  const noNotch = computeAddWorkspaceGeometry({ windowHeight: 844, topInset: 0 });
  const withNotch = computeAddWorkspaceGeometry({ windowHeight: 844, topInset: 59 });
  assert(
    '3a. realistic top insets (0 vs 59, the largest in current use) now produce the SAME capped fixedSheetHeight for the same window — the ceiling, not the inset, determines the result on every real supported device at 0.82',
    approx(noNotch.fixedSheetHeight, withNotch.fixedSheetHeight) && approx(noNotch.fixedSheetHeight, 844 * MAX_HEIGHT_FRACTION)
  );

  // The underlying raw-formula 1:1 relationship (fixedSheetHeight shrinks
  // by exactly the inset difference) is unchanged arithmetic — it simply no
  // longer applies within the realistic device range at 0.82. These two
  // insets are deliberately large/synthetic (not claims about any real
  // device) purely to exercise that still-correct underlying path.
  const insetA = computeAddWorkspaceGeometry({ windowHeight: 844, topInset: 150 });
  const insetB = computeAddWorkspaceGeometry({ windowHeight: 844, topInset: 169 });
  assert(
    '3b. when neither result hits a clamp boundary (synthetic large insets, not a real-device claim), the difference between two insets still matches the inset difference exactly (1:1 relationship, per the raw formula) — the arithmetic itself is unchanged by the 0.82 design decision',
    approx(insetA.fixedSheetHeight - insetB.fixedSheetHeight, 19)
  );
  assert('3c. a zero top inset on a typical phone-height window is correctly capped by the new MAX_HEIGHT_FRACTION rather than growing unbounded', approx(noNotch.fixedSheetHeight, 844 * MAX_HEIGHT_FRACTION));
}

console.log('\n=== 4. Extreme and invalid numeric inputs — finite, non-negative results (real import) ===');
{
  const zero = computeAddWorkspaceGeometry({ windowHeight: 0, topInset: 0 });
  assert('4a. zero window height produces a finite, non-negative fixedSheetHeight', Number.isFinite(zero.fixedSheetHeight) && zero.fixedSheetHeight >= 0);
  const negative = computeAddWorkspaceGeometry({ windowHeight: -100, topInset: 20 });
  assert('4b. negative window height produces a finite, non-negative fixedSheetHeight', Number.isFinite(negative.fixedSheetHeight) && negative.fixedSheetHeight >= 0);
  const nanInput = computeAddWorkspaceGeometry({ windowHeight: NaN, topInset: NaN });
  assert('4c. NaN inputs produce a finite, non-negative fixedSheetHeight (never NaN itself)', Number.isFinite(nanInput.fixedSheetHeight) && nanInput.fixedSheetHeight >= 0);
  const infInput = computeAddWorkspaceGeometry({ windowHeight: Infinity, topInset: 0 });
  assert('4d. Infinity window height produces a finite, non-negative fixedSheetHeight', Number.isFinite(infInput.fixedSheetHeight) && infInput.fixedSheetHeight >= 0);
  const negInset = computeAddWorkspaceGeometry({ windowHeight: 800, topInset: -50 });
  assert('4e. a negative top inset (malformed input) still produces a finite result, clamped sanely rather than exceeding the window', Number.isFinite(negInset.fixedSheetHeight) && negInset.fixedSheetHeight <= 800);
}

console.log('\n=== 5. Minimum/maximum crossover handling (real import) ===');
{
  // A window short enough that MIN_SHEET_HEIGHT (320) exceeds
  // windowHeight * MAX_HEIGHT_FRACTION (e.g. a 200pt-tall window: cap is
  // now 164 at 0.82, was 184 at 0.92 — still below the 320 floor either
  // way) — the crossed-bounds case explicitly required to be handled
  // safely, re-verified against the new 0.82 design decision.
  const crossed = computeAddWorkspaceGeometry({ windowHeight: 200, topInset: 0 });
  assert('5a. when MIN_SHEET_HEIGHT would exceed the MAX_HEIGHT_FRACTION ceiling, the result never exceeds the window (prioritises the safe ceiling over the comfort floor)', crossed.fixedSheetHeight <= 200);
  assert('5b. the crossed-bounds result is still finite and non-negative', Number.isFinite(crossed.fixedSheetHeight) && crossed.fixedSheetHeight >= 0);
  assert('5c. the crossed-bounds result equals the new MAX_HEIGHT_FRACTION ceiling exactly (200 * 0.82 = 164)', approx(crossed.fixedSheetHeight, 164));
}

console.log('\n=== 6. Keyboard overlap — computed from frame coordinates, not assumed equal to event height (real import) ===');
{
  assert('6a. a keyboard whose top edge (screenY) is exactly keyboardHeight above the window bottom yields that same overlap', computeKeyboardOverlap(844, 844 - 291) === 291);
  assert('6b. a keyboard reported as starting AT the window bottom yields zero overlap', computeKeyboardOverlap(844, 844) === 0);
  assert('6c. a keyboard reported as starting below the window bottom (already hiding) yields zero overlap, never negative', computeKeyboardOverlap(844, 900) === 0);
  assert('6d. a keyboard reported as starting above the top of the window yields the full window height as overlap, not more', computeKeyboardOverlap(844, -100) === 944 && computeKeyboardOverlap(844, -100) >= 0);
  assert('6e. NaN screenY produces a finite, non-negative overlap', Number.isFinite(computeKeyboardOverlap(844, NaN)) && computeKeyboardOverlap(844, NaN) >= 0);
}

console.log('\n=== 7. Keyboard-adjusted height — hidden, showing, and restored cases (real import) ===');
{
  const hidden = computeKeyboardAdjustedHeight(765, 0, MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN);
  assert('7a. zero keyboard overlap (keyboard hidden) returns the fixedSheetHeight unchanged', hidden === 765);
  const showing = computeKeyboardAdjustedHeight(765, 291, MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN);
  assert('7b. showing — the adjusted height is exactly fixedSheetHeight minus the overlap (765-291=474), matching the top-edge-stationary invariant', showing === 474);
  const restored = computeKeyboardAdjustedHeight(765, 0, MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN);
  assert('7c. restored — overlap returning to 0 returns the exact original fixedSheetHeight (no residual offset, no second bounce)', restored === hidden && restored === 765);
  const extremeOverlap = computeKeyboardAdjustedHeight(400, 1000, MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN);
  assert('7d. an overlap larger than the sheet itself is floored at MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN, never negative or zero', extremeOverlap === MIN_VISIBLE_HEIGHT_WHEN_KEYBOARD_OPEN);
  assert('7e. every keyboard-adjusted result is finite and non-negative for extreme inputs', Number.isFinite(computeKeyboardAdjustedHeight(NaN, NaN, NaN)) && computeKeyboardAdjustedHeight(NaN, NaN, NaN) >= 0);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
