// Nolie Design 5.1 Wave 1A — computed contrast against the doc A p.14 floors.
//
// WHY THIS TEST COMPUTES RATHER THAN READS:
// Design doc A p.14 quotes five contrast pairs and states "Full table in
// Tokens.json". The shipped Nolie_Design_5_Tokens.json contains no contrast
// table (verified against the full 30-file design corpus). Per product-owner
// decision 3, the ratios are computed locally instead of blocking on another
// Claude Design response.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): imports and executes src/theme/contrast.ts and
//   src/theme/semanticTokens.ts, both pure and RN-free. The WCAG maths is
//   independently cross-checked in section 1 against the five ratios Design
//   5.1 published itself, so this is not merely self-consistent.
// - NOT proven here: perceived legibility on a physical device, gradient
//   rendering, or contrast of any surface a component actually composes.
//
// Run with: ./node_modules/.bin/tsx tests/design5-contrast.test.ts

import {
  CONTRAST_FLOORS,
  DOC_A_QUOTED_PAIRS,
  contrastRatio,
  parseColor,
  compositeOver,
  ratio2dp,
} from '../src/theme/contrast';
import { DESIGN_THEME_MATRIX, resolveSemanticColors } from '../src/theme/semanticTokens';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function check(label: string, fg: string, bg: string, floor: number) {
  const r = contrastRatio(fg, bg);
  assert(`${label} — ${ratio2dp(r)}:1 (floor ${floor}:1)`, r >= floor);
  return r;
}

console.log('=== 1. Cross-validation against the five ratios Design 5.1 published ===');
{
  // Two properties are checked, for different reasons.
  //
  // (a) SAFETY — every computed ratio must be at least the published one.
  //     If a token pair were ever WORSE than the design claims, that is a
  //     real accessibility regression and must fail the build.
  //
  // (b) CORRECTNESS OF THE MATHS — at least two pairs must land within
  //     0.15 of the published figure. A broken implementation (wrong
  //     luminance curve, swapped channels) would not coincidentally match
  //     the design's own numbers on multiple independent pairs.
  //
  // FINDING, recorded rather than silently absorbed: three of doc A p.14's
  // five published ratios are UNDERSTATED — most notably "#E3B877 on
  // #1F1710 = 7.2:1", which computes to 9.58:1. No sunrise-dark ambient
  // stop produces 7.2:1 (they are 8.72 / 9.58 / 10.26), so the published
  // figure cannot be explained by a different stop choice. Every deviation
  // is in the safe direction — the shipped tokens are MORE legible than
  // documented — so this is a design-document inaccuracy, not an
  // implementation defect. Raised for Claude Design; it blocks nothing.
  let closeMatches = 0;
  for (const pair of DOC_A_QUOTED_PAIRS) {
    const computed = contrastRatio(pair.foreground, pair.background);
    const delta = computed - pair.quotedRatio;
    if (Math.abs(delta) <= 0.15) closeMatches++;
    assert(
      `1. ${pair.label}: computed ${ratio2dp(computed)}:1, doc A ${pair.quotedRatio}:1, delta ${delta >= 0 ? '+' : ''}${ratio2dp(delta)} — never worse than published`,
      computed >= pair.quotedRatio - 0.05
    );
  }
  assert(
    `1z. maths validated: ${closeMatches}/5 pairs land within 0.15 of the design's own published figure`,
    closeMatches >= 2
  );
}

console.log('\n=== 2. Colour parsing handles every format the tokens actually use ===');
{
  assert('2a. 6-digit hex', parseColor('#2C67B4').r === 0x2c);
  assert('2b. 3-digit hex expands', parseColor('#FFF').r === 255);
  assert('2c. rgba alpha parsed', Math.abs(parseColor('rgba(94,150,216,0.16)').a - 0.16) < 1e-9);
  assert('2d. translucent composites over its background', compositeOver('rgba(0,0,0,0.5)', '#FFFFFF').r === 127.5);
  let threw = false;
  try {
    parseColor('not-a-colour');
  } catch {
    threw = true;
  }
  assert('2e. an unparseable colour throws rather than silently reading as black', threw);
}

console.log('\n=== 3. Body text clears 4.5:1 on its own surface, in all six themes ===');
{
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    check(`3. ${t} textPrimary on bgSurface`, c.textPrimary, c.bgSurface, CONTRAST_FLOORS.body);
    check(`3. ${t} textPrimary on bgCanvas`, c.textPrimary, c.bgCanvas, CONTRAST_FLOORS.body);
    check(`3. ${t} textPrimary on bgRaised`, c.textPrimary, c.bgRaised, CONTRAST_FLOORS.body);
    check(`3. ${t} textSecondary on bgSurface`, c.textSecondary, c.bgSurface, CONTRAST_FLOORS.body);
    check(`3. ${t} textTitle on bgCanvas`, c.textTitle, c.bgCanvas, CONTRAST_FLOORS.body);
  }
}

console.log('\n=== 4. Body text clears 4.5:1 on the ambient field (the style-scoped risk) ===');
{
  // Ambient is the one full-bleed surface a colour style may retint, so it
  // is where a style change could quietly break legibility.
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    for (let i = 0; i < c.ambient.length; i++) {
      check(`4. ${t} textPrimary on ambient stop ${i}`, c.textPrimary, c.ambient[i], CONTRAST_FLOORS.body);
    }
    check(`4. ${t} textTitle on ambient stop 0`, c.textTitle, c.ambient[0], CONTRAST_FLOORS.body);
  }
}

console.log('\n=== 5. Financial figures on hero surfaces ===');
{
  // Floor is 3:1 for large figures; doc A p.14 asserts every shipped pair
  // actually clears 4.5, so both are checked and any regression to
  // "technically legal but worse than designed" is visible.
  let allClearBodyFloor = true;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    for (let i = 0; i < c.heroSurface.length; i++) {
      const r = check(`5. ${t} textFigure on heroSurface stop ${i}`, c.textFigure, c.heroSurface[i], CONTRAST_FLOORS.largeFigure);
      if (r < CONTRAST_FLOORS.body) allClearBodyFloor = false;
    }
  }
  assert('5z. every textFigure/heroSurface pair also clears the stricter 4.5:1, as doc A p.14 claims', allClearBodyFloor);
}

console.log('\n=== 6. Status roles on their own tints ===');
{
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    // Tints are translucent in dark mode, so composite over the surface first.
    const successTint = scheme === 'dark' ? compositeOver(c.successTint, c.bgSurface) : parseColor(c.successTint);
    const warningTint = scheme === 'dark' ? compositeOver(c.warningTint, c.bgSurface) : parseColor(c.warningTint);
    const urgentTint = scheme === 'dark' ? compositeOver(c.urgentTint, c.bgSurface) : parseColor(c.urgentTint);
    const infoTint = scheme === 'dark' ? compositeOver(c.infoTint, c.bgSurface) : parseColor(c.infoTint);
    const toHex = (x: { r: number; g: number; b: number }) =>
      '#' + [x.r, x.g, x.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

    check(`6. ${t} success on successTint`, c.success, toHex(successTint), CONTRAST_FLOORS.body);
    check(`6. ${t} warning on warningTint`, c.warning, toHex(warningTint), CONTRAST_FLOORS.body);
    check(`6. ${t} urgentText on urgentTint`, c.urgentText, toHex(urgentTint), CONTRAST_FLOORS.body);
    check(`6. ${t} infoText on infoTint`, c.infoText, toHex(infoTint), CONTRAST_FLOORS.body);
  }
}

console.log('\n=== 7. Interactive colour: text-on-fill and fill-as-chrome ===');
{
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    check(`7. ${t} onInteractive on interactive (button label)`, c.onInteractive, c.interactive, CONTRAST_FLOORS.body);
    check(`7. ${t} interactive as icon/chrome on bgSurface`, c.interactive, c.bgSurface, CONTRAST_FLOORS.iconChrome);
    check(`7. ${t} interactive as link text on bgSurface`, c.interactive, c.bgSurface, CONTRAST_FLOORS.body);
  }
}

console.log('\n=== 8. Movement colours are legible and semantically distinct ===');
{
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    check(`8. ${t} movementPositive on bgSurface`, c.movementPositive, c.bgSurface, CONTRAST_FLOORS.body);
    check(`8. ${t} movementNegative on bgSurface`, c.movementNegative, c.bgSurface, CONTRAST_FLOORS.body);
  }
}

console.log('\n=== 9. White text on featured gradients, over the mandated scrim ===');
{
  // "Text on featured gradients sits on a scrim stop of at least
  // rgba(0,0,0,0.13)" — so the correct test composites that scrim over the
  // gradient's LIGHTEST stop (the worst case) before measuring.
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    const t = `${style}/${scheme}`;
    const lightestStop = c.featured[0];
    const scrimmed = compositeOver('rgba(0,0,0,0.13)', lightestStop);
    const hex = '#' + [scrimmed.r, scrimmed.g, scrimmed.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
    check(`9. ${t} #FFFFFF on scrimmed featured lightest stop`, '#FFFFFF', hex, CONTRAST_FLOORS.iconChrome);
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
