// Nolie Design 5.1 Wave 1A — locale-aware typography.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): imports and executes src/theme/typography.ts,
//   which is pure and RN-free. Every family/weight/metric assertion below
//   runs the real resolver.
// - Mirrored (Class B): none.
// - NOT proven here: that any glyph actually renders, that Noto Sans Thai
//   covers a given string on device, or that a Thai layout does not clip.
//   The app currently has 26 translated Thai keys across 3 screens (owner
//   decision 4), so Thai LAYOUT verification is explicitly out of scope for
//   this wave and is not claimed anywhere below.
//
// Run with: ./node_modules/.bin/tsx tests/design5-typography.test.ts

import {
  APP_LOCALES,
  FONT_WEIGHTS,
  FIGTREE_FAMILY,
  NOTO_SANS_THAI_FAMILY,
  TYPE_ROLES,
  TYPE_ROLE_NAMES,
  FIGURE_ROLE_NAMES,
  TEXTUAL_ROLE_NAMES,
  MONEY_TYPOGRAPHY,
  THAI_METRICS,
  ENGLISH_METRICS,
  MIN_BUTTON_FONT_SIZE,
  DYNAMIC_TYPE,
  resolveFontFamily,
  resolveTextStyle,
  resolveControlMetrics,
  resolveFinancialSegments,
  requiresSegmentedRendering,
} from '../src/theme/typography';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. Every weight is its own family name (a single token cannot carry four weights) ===');
{
  assert('1a. four weights modelled', FONT_WEIGHTS.join(',') === '400,500,600,700');
  assert('1b. Figtree has a distinct family per weight', new Set(Object.values(FIGTREE_FAMILY)).size === 4);
  assert('1c. Noto Sans Thai has a distinct family per weight', new Set(Object.values(NOTO_SANS_THAI_FAMILY)).size === 4);
  assert('1d. Figtree names match the expo-google-fonts export names', FIGTREE_FAMILY[400] === 'Figtree_400Regular' && FIGTREE_FAMILY[500] === 'Figtree_500Medium' && FIGTREE_FAMILY[600] === 'Figtree_600SemiBold' && FIGTREE_FAMILY[700] === 'Figtree_700Bold');
  assert('1e. Noto names match the expo-google-fonts export names', NOTO_SANS_THAI_FAMILY[400] === 'NotoSansThai_400Regular' && NOTO_SANS_THAI_FAMILY[700] === 'NotoSansThai_700Bold');
  assert('1f. the two families never share a name', Object.values(FIGTREE_FAMILY).every((f) => !Object.values(NOTO_SANS_THAI_FAMILY).includes(f)));
}

console.log('\n=== 2. THE CRITICAL RULE: Figtree is never applied to Thai text ===');
{
  // Figtree carries no Thai glyphs. Applying it to Thai renders tofu.
  let violations = 0;
  const violating: string[] = [];
  for (const role of TEXTUAL_ROLE_NAMES) {
    for (const weight of FONT_WEIGHTS) {
      const family = resolveFontFamily(role, 'th', weight);
      if (!Object.values(NOTO_SANS_THAI_FAMILY).includes(family)) {
        violations++;
        violating.push(`${role}@${weight}`);
      }
    }
  }
  assert(`2a. all ${TEXTUAL_ROLE_NAMES.length} textual roles x 4 weights resolve to Noto Sans Thai in Thai`, violations === 0);
  if (violations > 0) console.log('    violating:', violating.join(', '));

  let enViolations = 0;
  for (const role of TEXTUAL_ROLE_NAMES) {
    for (const weight of FONT_WEIGHTS) {
      if (!Object.values(FIGTREE_FAMILY).includes(resolveFontFamily(role, 'en', weight))) enViolations++;
    }
  }
  assert('2b. all textual roles resolve to Figtree in English', enViolations === 0);
}

console.log('\n=== 3. Financial/numeric roles are Figtree in BOTH locales ===');
{
  // Latin digits must have identical metrics regardless of UI language.
  assert('3a. three figure roles identified', FIGURE_ROLE_NAMES.join(',') === 'figureHero,figureLarge,figureRow');
  let wrong = 0;
  for (const role of FIGURE_ROLE_NAMES) {
    for (const locale of APP_LOCALES) {
      for (const weight of FONT_WEIGHTS) {
        if (resolveFontFamily(role, locale, weight) !== FIGTREE_FAMILY[weight]) wrong++;
      }
    }
  }
  assert('3b. every figure role is Figtree in en AND th, at every weight', wrong === 0);
  assert('3c. figureHero in Thai is still Figtree', resolveTextStyle('figureHero', 'th').fontFamily === 'Figtree_600SemiBold');
  assert('3d. figure roles carry tabular-nums in English', resolveTextStyle('figureRow', 'en').fontVariant?.[0] === 'tabular-nums');
  assert('3e. figure roles carry tabular-nums in Thai', resolveTextStyle('figureRow', 'th').fontVariant?.[0] === 'tabular-nums');
  assert('3f. non-figure roles do NOT carry tabular-nums', resolveTextStyle('body', 'en').fontVariant === undefined);
}

console.log('\n=== 4. Role metrics match the published Design 5.1 scale ===');
{
  assert('4a. twelve roles defined', TYPE_ROLE_NAMES.length === 12);
  assert('4b. figureHero 46/52/600 tracking -1.5', TYPE_ROLES.figureHero.size === 46 && TYPE_ROLES.figureHero.line === 52 && TYPE_ROLES.figureHero.weight === 600 && TYPE_ROLES.figureHero.tracking === -1.5);
  assert('4c. titleScreen 29/34/600 tracking -0.6', TYPE_ROLES.titleScreen.size === 29 && TYPE_ROLES.titleScreen.line === 34 && TYPE_ROLES.titleScreen.tracking === -0.6);
  assert('4d. body 16/23/400', TYPE_ROLES.body.size === 16 && TYPE_ROLES.body.line === 23 && TYPE_ROLES.body.weight === 400);
  assert('4e. meta 13/18/400', TYPE_ROLES.meta.size === 13 && TYPE_ROLES.meta.line === 18);
  assert('4f. eyebrow 12.5/16/600 uppercase tracking +1', TYPE_ROLES.eyebrow.size === 12.5 && TYPE_ROLES.eyebrow.uppercase === true && TYPE_ROLES.eyebrow.tracking === 1);
  assert('4g. labelTab carries both inactive 500 and active 600', TYPE_ROLES.labelTab.weight === 500 && TYPE_ROLES.labelTab.weightActive === 600);
  assert('4h. labelTab resolves the active weight when selected', resolveTextStyle('labelTab', 'en', { active: true }).fontFamily === 'Figtree_600SemiBold');
  assert('4i. labelTab resolves the inactive weight by default', resolveTextStyle('labelTab', 'en').fontFamily === 'Figtree_500Medium');
}

console.log('\n=== 5. Thai line boxes grow; English uses the published line height ===');
{
  assert('5a. Thai multiplier is 1.42', THAI_METRICS.lineHeightMultiplier === 1.42);
  assert('5b. English baseline multiplier is 1.30', ENGLISH_METRICS.lineHeightMultiplier === 1.3);
  const enBody = resolveTextStyle('body', 'en');
  const thBody = resolveTextStyle('body', 'th');
  assert('5c. English body line height is the published 23', enBody.lineHeight === 23);
  assert('5d. Thai body line height is 16 * 1.42 = 23 (rounded)', thBody.lineHeight === Math.round(16 * 1.42));
  const enTitle = resolveTextStyle('titleScreen', 'en');
  const thTitle = resolveTextStyle('titleScreen', 'th');
  assert('5e. Thai titleScreen line box is taller than English', thTitle.lineHeight > enTitle.lineHeight);
  assert('5f. font size itself never changes between locales', enTitle.fontSize === thTitle.fontSize);
}

console.log('\n=== 6. Thai suppresses uppercase (Thai script has no case) ===');
{
  assert('6a. English eyebrow uppercases', resolveTextStyle('eyebrow', 'en').textTransform === 'uppercase');
  assert('6b. Thai eyebrow does NOT uppercase', resolveTextStyle('eyebrow', 'th').textTransform === 'none');
  assert('6c. Thai metrics record uppercaseTransforms false', THAI_METRICS.uppercaseTransforms === false);
  assert('6d. English metrics record uppercaseTransforms true', ENGLISH_METRICS.uppercaseTransforms === true);
}

console.log('\n=== 7. Control metrics: documented Thai deltas ===');
{
  const en = resolveControlMetrics('en');
  const th = resolveControlMetrics('th');
  assert('7a. field height 56 -> 60', en.fieldHeightPt === 56 && th.fieldHeightPt === 60);
  assert('7b. button vertical padding +2 in Thai', en.buttonVerticalPaddingDeltaPt === 0 && th.buttonVerticalPaddingDeltaPt === 2);
  assert('7c. chip height 26 -> 28', en.chipHeightPt === 26 && th.chipHeightPt === 28);
  assert('7d. buttons wrap before shrinking, in both locales', en.buttonWrapBeforeShrink === true && th.buttonWrapBeforeShrink === true);
  assert('7e. minimum button font size is 11', MIN_BUTTON_FONT_SIZE === 11);
  assert('7f. baselines align via fixed control heights, not font metrics', en.alignBaselinesViaFixedHeights === true && th.alignBaselinesViaFixedHeights === true);
}

console.log('\n=== 8. Mixed-language financial strings: the resolver contract ===');
{
  // Wave 1A defines the API only; component decomposition into separate
  // spans belongs to the wave that owns each component.
  const segments = resolveFinancialSegments(
    [{ kind: 'label', text: 'ใช้ได้จนถึงวันเงินเดือน' }, { kind: 'figure', text: '$1,326.40' }],
    'th'
  );
  assert('8a. a mixed string yields two segments', segments.length === 2);
  assert('8b. the Thai label segment uses Noto Sans Thai', segments[0].fontFamily.startsWith('NotoSansThai_'));
  assert('8c. the figure segment uses Figtree even in Thai', segments[1].fontFamily.startsWith('Figtree_'));
  assert('8d. the figure segment carries tabular-nums', segments[1].fontVariant?.[0] === 'tabular-nums');
  assert('8e. the label segment does not carry tabular-nums', segments[0].fontVariant === undefined);

  const enSegments = resolveFinancialSegments(
    [{ kind: 'label', text: 'Available until payday' }, { kind: 'figure', text: '$1,326.40' }],
    'en'
  );
  assert('8f. in English both segments are Figtree', enSegments.every((s) => s.fontFamily.startsWith('Figtree_')));

  assert('8g. Thai text with Latin digits is flagged as needing segmentation', requiresSegmentedRendering('ยอด 1,326.40', 'th') === true);
  assert('8h. Thai text without digits does not need segmentation', requiresSegmentedRendering('ยอดคงเหลือ', 'th') === false);
  assert('8i. English never needs segmentation', requiresSegmentedRendering('Balance 1,326.40', 'en') === false);
}

console.log('\n=== 9. Money grammar and Dynamic Type policy ===');
{
  assert('9a. tabular-nums is the money font variant', MONEY_TYPOGRAPHY.fontVariant[0] === 'tabular-nums');
  assert('9b. cents render at 55%', MONEY_TYPOGRAPHY.centsScale === 0.55);
  assert('9c. deltas always carry an explicit sign', MONEY_TYPOGRAPHY.signExplicit === true);
  assert('9d. amounts, dates and disambiguating labels never truncate', MONEY_TYPOGRAPHY.neverTruncate.length === 3 && MONEY_TYPOGRAPHY.neverTruncate.includes('amount'));
  assert('9e. figures cap at 1.6x', DYNAMIC_TYPE.figureMaxScale === 1.6 && TYPE_ROLES.figureHero.maxScale === 1.6);
  assert('9f. titles cap at 1.8x', DYNAMIC_TYPE.titleMaxScale === 1.8 && TYPE_ROLES.titleScreen.maxScale === 1.8);
  assert('9g. body is uncapped and reflows', DYNAMIC_TYPE.bodyUncapped === true && TYPE_ROLES.body.maxScale === undefined);
}

console.log('\n=== 10. Wave 1A is additive — legacy typography is untouched ===');
{
  const legacy = require('../src/theme/tokens');
  assert('10a. legacy typography.title is still 24/700', legacy.typography.title.fontSize === 24 && legacy.typography.title.fontWeight === '700');
  assert('10b. legacy typography.body is still 15', legacy.typography.body.fontSize === 15);
  assert('10c. new body role (16) deliberately differs from legacy body (15) and does not overwrite it', TYPE_ROLES.body.size === 16 && legacy.typography.body.fontSize === 15);
  assert('10d. legacy typography declares no fontFamily — Wave 1A adds none to it', legacy.typography.body.fontFamily === undefined);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
