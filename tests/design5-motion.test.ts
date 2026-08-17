// Nolie Design 5.1 Wave 1A — motion token completeness.
//
// Motion tokens ship in Wave 1A by product-owner decision so Waves 2-10
// consume NAMED tokens from their first commit. Nothing is wired to a
// component yet; this test proves the constants are complete and correct,
// not that anything animates.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): imports and executes src/theme/motion.ts, which
//   is pure and RN-free.
// - NOT proven here: any actual animation, frame rate, or Reduced Motion
//   behaviour on device. Those are Wave 10 and physical-device evidence.
//
// Run with: ./node_modules/.bin/tsx tests/design5-motion.test.ts

import {
  MOTION_CURVES,
  STANDARD_BEZIER,
  MOTION_MS,
  MOTION_TOKEN_NAMES,
  MOTION_TRAVEL_PT,
  MOTION_HARD_RULES,
  REDUCED_MOTION_MS,
  REDUCED_MOTION_PRESERVED,
  REDUCED_MOTION_FOCUS_BORDER_MS,
  FIGURE_COUNT_MIN_DELTA_DOLLARS,
  PRESS_SCALE,
  HAPTICS,
  HAPTICS_FORBIDDEN,
  MOTION_DEFERRED,
  resolveDuration,
  resolveCurve,
} from '../src/theme/motion';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. Two curves only ===');
{
  assert('1a. standard is the published cubic-bezier', MOTION_CURVES.standard === 'cubic-bezier(0.2,0.9,0.25,1)');
  assert('1b. exits use ease-in', MOTION_CURVES.exit === 'ease-in');
  assert('1c. bezier control points match the string form', STANDARD_BEZIER.join(',') === '0.2,0.9,0.25,1');
  assert('1d. enter resolves to standard', resolveCurve('enter') === MOTION_CURVES.standard);
  assert('1e. exit resolves to ease-in', resolveCurve('exit') === MOTION_CURVES.exit);
  assert('1f. pure opacity resolves to linear', resolveCurve('opacity') === 'linear');
}

console.log('\n=== 2. Every published duration constant is present and correct ===');
{
  const expected: Record<string, number> = {
    press: 150, select: 140, deselect: 100, tabIndicator: 180, fabMorph: 180,
    trayOpen: 220, trayClose: 165, workspaceIn: 320, workspaceOut: 240,
    stepOut: 200, stepIn: 160, stepStagger: 40, inputBlock: 260,
    screenReveal: 360, revealStagger: 60, ambientSettle: 560,
    checkDraw: 260, rowPlace: 420, rowTintHold: 3000,
    figureCrossfade: 240, figureCountMin: 450, figureCountMax: 700,
    progressFill: 380, cardExpand: 240, focusScroll: 320, focusTint: 1200,
    toastIn: 260, toastOut: 200, toastLife: 3400, celebration: 360,
    dockShowHide: 160, sheetInfoIn: 280, sheetInfoOut: 200, themeSwitch: 0,
  };
  assert(`2a. all ${Object.keys(expected).length} tokens are defined`, MOTION_TOKEN_NAMES.length === Object.keys(expected).length);
  let wrong = 0;
  const wrongNames: string[] = [];
  for (const [name, ms] of Object.entries(expected)) {
    if (MOTION_MS[name as keyof typeof MOTION_MS] !== ms) {
      wrong++;
      wrongNames.push(name);
    }
  }
  assert('2b. every duration matches the published value', wrong === 0);
  if (wrong > 0) console.log('    wrong:', wrongNames.join(', '));
  assert('2c. no token is missing from the name list', Object.keys(expected).every((n) => MOTION_TOKEN_NAMES.includes(n as never)));
}

console.log('\n=== 3. "Fast in, calm out" holds ===');
{
  assert('3a. entrances are <= 360ms', MOTION_MS.workspaceIn <= 360 && MOTION_MS.screenReveal <= 360 && MOTION_MS.trayOpen <= 360);
  assert('3b. exits are <= 240ms', MOTION_MS.workspaceOut <= 240 && MOTION_MS.trayClose <= 240 && MOTION_MS.toastOut <= 240);
  assert('3c. each exit is faster than its matching entrance', MOTION_MS.trayClose < MOTION_MS.trayOpen && MOTION_MS.workspaceOut < MOTION_MS.workspaceIn && MOTION_MS.sheetInfoOut < MOTION_MS.sheetInfoIn);
  assert('3d. theme switch is instant (no scene crossfade)', MOTION_MS.themeSwitch === 0);
}

console.log('\n=== 4. Reduced Motion is a parallel build, not shorter durations ===');
{
  assert('4a. press/select are KEPT under RM (state, not motion)', resolveDuration('press', true) === MOTION_MS.press && resolveDuration('select', true) === MOTION_MS.select);
  assert('4b. tray fades at 120ms with zero travel under RM', resolveDuration('trayOpen', true) === 120 && resolveDuration('trayClose', true) === 120);
  assert('4c. sheets fade at 120ms under RM', resolveDuration('workspaceIn', true) === 120 && resolveDuration('workspaceOut', true) === 120);
  assert('4d. reveals and settles are instant under RM', resolveDuration('screenReveal', true) === 0 && resolveDuration('ambientSettle', true) === 0);
  assert('4e. steps switch instantly under RM', resolveDuration('stepIn', true) === 0 && resolveDuration('stepOut', true) === 0);
  assert('4f. figures swap instantly under RM', resolveDuration('figureCrossfade', true) === 0);
  assert('4g. tab indicator jumps under RM', resolveDuration('tabIndicator', true) === 0);

  // The important one: behavioural guards must NOT be shortened, because
  // shortening them would change what the product does.
  assert('4h. inputBlock is preserved under RM (a guard, not decoration)', resolveDuration('inputBlock', true) === MOTION_MS.inputBlock);
  assert('4i. rowTintHold is preserved under RM (colour carries newness)', resolveDuration('rowTintHold', true) === MOTION_MS.rowTintHold);
  assert('4j. toastLife is preserved under RM', resolveDuration('toastLife', true) === MOTION_MS.toastLife);
  assert('4k. focusTint is preserved under RM', resolveDuration('focusTint', true) === MOTION_MS.focusTint);
  assert('4l. exactly four durations are RM-preserved', REDUCED_MOTION_PRESERVED.length === 4);
  assert('4m. RM focus-reveal substitutes a 4s static border', REDUCED_MOTION_FOCUS_BORDER_MS === 4000);
  assert('4n. no RM override exceeds its normal duration', Object.entries(REDUCED_MOTION_MS).every(([k, v]) => (v as number) <= MOTION_MS[k as keyof typeof MOTION_MS]));
  assert('4o. resolveDuration without RM always returns the base value', MOTION_TOKEN_NAMES.every((t) => resolveDuration(t, false) === MOTION_MS[t]));
}

console.log('\n=== 5. Hard rules travel with the constants ===');
{
  assert('5a. five hard rules recorded', MOTION_HARD_RULES.length === 5);
  assert('5b. the tab-scene regression gate is recorded', MOTION_HARD_RULES.some((r) => r.startsWith('No tab-scene animation')));
  assert('5c. the single-native-modal invariant is recorded', MOTION_HARD_RULES.some((r) => r.includes('workspace mounts only on tray onClosed') && r.includes('never timeout')));
  assert('5d. the state-driven construction rule is recorded', MOTION_HARD_RULES.some((r) => r.startsWith('No behaviour may depend on an animation having run')));
  assert('5e. figures never count from zero on a visit', MOTION_HARD_RULES.some((r) => r.includes('never count from zero on visit')));
}

console.log('\n=== 6. Travel distances and thresholds ===');
{
  assert('6a. press scales to 0.97', PRESS_SCALE === 0.97);
  assert('6b. tray rises 12pt', MOTION_TRAVEL_PT.trayRise === 12);
  assert('6c. steps travel +/-24pt on X', MOTION_TRAVEL_PT.stepTravelX === 24);
  assert('6d. dock drops 8pt when hiding', MOTION_TRAVEL_PT.dockDrop === 8);
  assert('6e. a dirty swipe is arrested at 30% travel', MOTION_TRAVEL_PT.dirtySwipeArrestFraction === 0.3);
  assert('6f. figures only count up above a $500 delta', FIGURE_COUNT_MIN_DELTA_DOLLARS === 500);
}

console.log('\n=== 7. Four haptic events, and only four ===');
{
  assert('7a. exactly four haptic events', Object.keys(HAPTICS).length === 4);
  assert('7b. the four are light/softSuccess/warning/rigid', ['light', 'softSuccess', 'warning', 'rigid'].every((k) => k in HAPTICS));
  assert('7c. soft success fires once and is shared with any celebration', HAPTICS.softSuccess.includes('once') && HAPTICS.softSuccess.includes('shared'));
  assert('7d. five forbidden haptic contexts recorded', HAPTICS_FORBIDDEN.length === 5);
  assert('7e. scroll and tab taps are explicitly forbidden', HAPTICS_FORBIDDEN.includes('scroll') && HAPTICS_FORBIDDEN.includes('tab taps'));
}

console.log('\n=== 8. Generic Undo is recorded as deferred, not implemented ===');
{
  // Design 5.0 specified an 8-second Undo window; 5.1 removed it entirely.
  // The constant exists so nobody reintroduces it by accident.
  assert('8a. genericUndo is marked removed from scope', MOTION_DEFERRED.genericUndo.includes('Removed from implementation scope'));
  assert('8b. no undo-window duration exists anywhere in the motion tokens', !MOTION_TOKEN_NAMES.some((t) => t.toLowerCase().includes('undo')));
  assert('8c. no 8000ms constant exists (the retired 5.0 Undo window)', !Object.values(MOTION_MS).includes(8000));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
