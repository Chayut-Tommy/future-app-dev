// Nolie Design 5.1 Wave 1A — semantic token foundation.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): every assertion below imports and executes the
//   actual production module src/theme/semanticTokens.ts. It is pure and
//   RN-free precisely so this can be genuine behavioural proof rather than
//   a mirrored copy or a structural regex.
// - NOT proven here: that any component renders these values, or that they
//   look correct on a physical device in each of the six themes. Wave 1A
//   deliberately migrates no component; device evidence is separate.
//
// Run with: ./node_modules/.bin/tsx tests/design5-semantic-tokens.test.ts

import {
  DESIGN_COLOR_STYLES,
  DESIGN_SCHEMES,
  DESIGN_THEME_MATRIX,
  DESIGN_SPACING_SCALE,
  PROTECTED_ROLE_NAMES,
  STYLE_SCOPED_ROLE_NAMES,
  SHARED_COLORS,
  STYLE_SCOPED_COLORS,
  COLOR_SCOPE_RULES,
  COMPONENT_ROLE_CATALOGUE,
  DISABLED_OPACITY,
  designSpacing,
  designRadius,
  designElevation,
  designLayout,
  resolveSemanticColors,
  resolveComponentRoles,
  buildComponentThemeMatrix,
  toDesignColorStyle,
} from '../src/theme/semanticTokens';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. The matrix is exactly six combinations ===');
{
  assert('1a. three colour styles', DESIGN_COLOR_STYLES.length === 3);
  assert('1b. two schemes', DESIGN_SCHEMES.length === 2);
  assert('1c. six combinations in the matrix', DESIGN_THEME_MATRIX.length === 6);
  const keys = DESIGN_THEME_MATRIX.map((t) => `${t.style}/${t.scheme}`);
  assert('1d. no duplicate combination', new Set(keys).size === 6);
  assert(
    '1e. matrix covers ocean/purple/sunrise x light/dark',
    keys.sort().join(',') ===
      ['ocean/light', 'ocean/dark', 'purple/light', 'purple/dark', 'sunrise/light', 'sunrise/dark'].sort().join(',')
  );
}

console.log('\n=== 2. Every role resolves to a real value in all six themes ===');
{
  let missing = 0;
  let resolvedCount = 0;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    for (const role of PROTECTED_ROLE_NAMES) {
      resolvedCount++;
      const v = c[role];
      if (typeof v !== 'string' || v.length === 0) missing++;
    }
    for (const role of STYLE_SCOPED_ROLE_NAMES) {
      resolvedCount++;
      const v = c[role];
      const ok = role === 'heroBorder' ? typeof v === 'string' && v.length > 0 : Array.isArray(v) && v.length > 0;
      if (!ok) missing++;
    }
  }
  assert(`2a. all ${resolvedCount} role resolutions produced a value (0 missing)`, missing === 0);
  assert('2b. resolved object reports its own style and scheme', resolveSemanticColors('sunrise', 'dark').style === 'sunrise' && resolveSemanticColors('sunrise', 'dark').scheme === 'dark');
}

console.log('\n=== 3. Protected roles are IDENTICAL across the three styles (the core scope rule) ===');
{
  // "Style may never touch: interactive, status roles, text roles, borders,
  // movement colours, chart semantic series." — Tokens.json color.rules
  let drift = 0;
  const driftDetail: string[] = [];
  for (const scheme of DESIGN_SCHEMES) {
    const ocean = resolveSemanticColors('ocean', scheme);
    for (const style of DESIGN_COLOR_STYLES) {
      const other = resolveSemanticColors(style, scheme);
      for (const role of PROTECTED_ROLE_NAMES) {
        if (ocean[role] !== other[role]) {
          drift++;
          driftDetail.push(`${scheme}/${style}.${role}`);
        }
      }
    }
  }
  assert(
    `3a. zero protected-role drift across styles (${PROTECTED_ROLE_NAMES.length} roles x 3 styles x 2 schemes)`,
    drift === 0
  );
  if (drift > 0) console.log('    drifted:', driftDetail.slice(0, 10).join(', '));

  // Named spot-checks, so a future refactor that accidentally style-scopes
  // one of these fails loudly on the specific role rather than a count.
  const oceanLight = resolveSemanticColors('ocean', 'light');
  const purpleLight = resolveSemanticColors('purple', 'light');
  const sunriseLight = resolveSemanticColors('sunrise', 'light');
  assert('3b. interactive is Ocean Blue in all three styles (light)', oceanLight.interactive === '#2C67B4' && purpleLight.interactive === '#2C67B4' && sunriseLight.interactive === '#2C67B4');
  assert('3c. success identical in all three styles (light)', oceanLight.success === purpleLight.success && purpleLight.success === sunriseLight.success);
  assert('3d. urgent identical in all three styles (light)', oceanLight.urgent === purpleLight.urgent && purpleLight.urgent === sunriseLight.urgent);
  assert('3e. warning identical in all three styles (light) — Sunrise must not bleed into status', oceanLight.warning === sunriseLight.warning);
  assert('3f. textPrimary identical in all three styles (dark)', resolveSemanticColors('ocean', 'dark').textPrimary === resolveSemanticColors('sunrise', 'dark').textPrimary);
}

console.log('\n=== 4. Style-scoped roles DO differ per style (otherwise the styles are cosmetic no-ops) ===');
{
  for (const scheme of DESIGN_SCHEMES) {
    const o = resolveSemanticColors('ocean', scheme);
    const p = resolveSemanticColors('purple', scheme);
    const s = resolveSemanticColors('sunrise', scheme);
    assert(`4a.${scheme} ambient differs across all three styles`, o.ambient[0] !== p.ambient[0] && p.ambient[0] !== s.ambient[0] && o.ambient[0] !== s.ambient[0]);
    assert(`4b.${scheme} featured differs across all three styles`, o.featured[0] !== p.featured[0] && p.featured[0] !== s.featured[0] && o.featured[0] !== s.featured[0]);
    assert(`4c.${scheme} heroBorder differs across all three styles`, o.heroBorder !== p.heroBorder && p.heroBorder !== s.heroBorder && o.heroBorder !== s.heroBorder);
  }
}

console.log('\n=== 5. movementNegative is slate, never red (explicit design rule) ===');
{
  // "movementNegative is slate with explicit minus, never red." An outgoing
  // amount is not an error state.
  const light = resolveSemanticColors('ocean', 'light');
  const dark = resolveSemanticColors('ocean', 'dark');
  assert('5a. light movementNegative is the slate textSecondary value', light.movementNegative === '#3E5266' && light.movementNegative === light.textSecondary);
  assert('5b. dark movementNegative is the slate textSecondary value', dark.movementNegative === '#A9BACB' && dark.movementNegative === dark.textSecondary);
  assert('5c. movementNegative is never the urgent colour', light.movementNegative !== light.urgent && dark.movementNegative !== dark.urgent);
  assert('5d. movementPositive is the success colour', light.movementPositive === light.success && dark.movementPositive === dark.success);
}

console.log('\n=== 6. Scope rules travel with the tokens ===');
{
  assert('6a. six scope rules are recorded in code', COLOR_SCOPE_RULES.length === 6);
  assert('6b. the never-touch rule is present verbatim', COLOR_SCOPE_RULES.some((r) => r.startsWith('Style may never touch:')));
  assert('6c. protected and style-scoped role sets do not overlap', PROTECTED_ROLE_NAMES.every((r) => !(STYLE_SCOPED_ROLE_NAMES as readonly string[]).includes(r)));
  assert('6d. protected set covers every shared role actually defined', PROTECTED_ROLE_NAMES.length === Object.keys(SHARED_COLORS.light).length);
  assert('6e. style-scoped set covers every scoped role actually defined', STYLE_SCOPED_ROLE_NAMES.length === Object.keys(STYLE_SCOPED_COLORS.ocean.light).length);
}

console.log('\n=== 7. Derived component-role catalogue (stands in for the absent Tokens.json §components) ===');
{
  const componentNames = Object.keys(COMPONENT_ROLE_CATALOGUE);
  assert('7a. catalogue covers the componentThemeMatrix components', componentNames.length === 13);
  for (const expected of ['screenShell', 'dock', 'fab', 'tray', 'workspace', 'infoSheet', 'picker', 'fields', 'rows', 'hero', 'charts', 'progress', 'statusChips']) {
    assert(`7b. catalogue includes ${expected}`, componentNames.includes(expected));
  }

  const matrix = buildComponentThemeMatrix();
  assert('7c. derived matrix has an entry per component', Object.keys(matrix).length === componentNames.length);
  let cells = 0;
  let unresolved = 0;
  for (const component of componentNames) {
    const perTheme = matrix[component];
    if (Object.keys(perTheme).length !== 6) unresolved++;
    for (const themeKey of Object.keys(perTheme)) {
      for (const entry of perTheme[themeKey]) {
        cells++;
        const v = entry.value;
        const ok = typeof v === 'string' ? v.length > 0 : Array.isArray(v) && v.length > 0;
        if (!ok) unresolved++;
      }
    }
  }
  assert('7d. every component resolves in all six themes', unresolved === 0);
  assert(`7e. derived matrix produced ${cells} resolved role cells`, cells > 0);

  // The derivation must actually track the theme, not return constants.
  const heroOceanLight = resolveComponentRoles('hero', 'ocean', 'light');
  const heroSunriseLight = resolveComponentRoles('hero', 'sunrise', 'light');
  const oceanBorder = heroOceanLight.find((r) => r.role === 'heroBorder')?.value;
  const sunriseBorder = heroSunriseLight.find((r) => r.role === 'heroBorder')?.value;
  assert('7f. hero heroBorder retints by style', oceanBorder === '#D9E5F2' && sunriseBorder === '#EEDCC9');

  const dockOceanLight = resolveComponentRoles('dock', 'ocean', 'light');
  const dockSunriseLight = resolveComponentRoles('dock', 'sunrise', 'light');
  const oceanInteractive = dockOceanLight.find((r) => r.role === 'interactive')?.value;
  const sunriseInteractive = dockSunriseLight.find((r) => r.role === 'interactive')?.value;
  assert('7g. dock interactive does NOT retint by style', oceanInteractive === sunriseInteractive);

  assert('7h. picker is marked platform-native rather than given a colour', resolveComponentRoles('picker', 'ocean', 'light')[0].role === 'platform');
  assert('7i. disabled is an opacity, not a colour swap', DISABLED_OPACITY === 0.45);
}

console.log('\n=== 8. Layout, radius and elevation carry the published values ===');
{
  assert('8a. spacing ramp is 4/8/12/16/20/24/32/48', DESIGN_SPACING_SCALE.join(',') === '4,8,12,16,20,24,32,48');
  assert('8b. named spacing matches the ramp', [designSpacing.xs, designSpacing.sm, designSpacing.md, designSpacing.lg, designSpacing.xl, designSpacing.xxl, designSpacing.xxxl, designSpacing.huge].join(',') === DESIGN_SPACING_SCALE.join(','));
  assert('8c. radius consolidates to control 12 / card 16 / hero 20 / sheetTop 24', designRadius.control === 12 && designRadius.card === 16 && designRadius.hero === 20 && designRadius.sheetTop === 24);
  assert('8d. pill radius is 999', designRadius.pill === 999);
  assert('8e. screen margins are 20 default / 16 compact', designLayout.screenMargin === 20 && designLayout.screenMarginCompact === 16);
  assert('8f. breakpoints are 360 / 500 / 768', designLayout.breakpoints.compactMax === 360 && designLayout.breakpoints.defaultMax === 500 && designLayout.breakpoints.tabletMin === 768);
  assert('8g. tablet content max width is 560', designLayout.contentMaxWidthTablet === 560);
  assert('8h. dock geometry is 64 capsule / 64 fab / 16 margin / 8 gap', designLayout.dock.capsuleHeight === 64 && designLayout.dock.fabSize === 64 && designLayout.dock.sideMargin === 16 && designLayout.dock.gap === 8);
  assert('8i. dock grows to 68 at accessibility sizes', designLayout.dock.capsuleHeightAccessibility === 68);
  assert('8j. tablet dock max width is 500', designLayout.dock.maxWidthTablet === 500);
  assert('8k. minimum touch target is 44', designLayout.touchTargetMin === 44);
  assert('8l. android elevation is 2/6/12', designElevation.android.e1 === 2 && designElevation.android.e2 === 6 && designElevation.android.e3 === 12);
  assert('8m. dark halves shadow opacity', designElevation.darkShadowOpacityMultiplier === 0.5);
  assert('8n. only six surfaces float', designElevation.floats.length === 6);
  assert('8o. dock blur is 0.92 at 12pt with a solid fallback', designElevation.blur.dockCapsule.opacity === 0.92 && designElevation.blur.dockCapsule.radiusPt === 12);
}

console.log('\n=== 9. Stored preference bridges to the Design 5.1 style name without being renamed ===');
{
  assert("9a. 'blue' maps to 'ocean'", toDesignColorStyle('blue') === 'ocean');
  assert("9b. 'purple' is unchanged", toDesignColorStyle('purple') === 'purple');
  assert("9c. 'sunrise' is unchanged", toDesignColorStyle('sunrise') === 'sunrise');
}

console.log('\n=== 10. Wave 1A is additive — the legacy token API is untouched ===');
{
  // Imported lazily so a failure here reads as "legacy tokens changed",
  // not as an unrelated import error above.
  const legacy = require('../src/theme/tokens');
  assert('10a. legacy lightColors still exported', typeof legacy.lightColors === 'object');
  assert('10b. legacy darkColors still exported', typeof legacy.darkColors === 'object');
  assert('10c. legacy spacing scale unchanged (xl is still 24, not the new 20)', legacy.spacing.xl === 24);
  assert('10d. legacy radius.card unchanged (still 20, not the new 16)', legacy.radius.card === 20);
  assert('10e. legacy typography roles still present', typeof legacy.typography.title === 'object' && legacy.typography.title.fontSize === 24);
  assert('10f. legacy accent (green) still present — not deleted in Wave 1A', typeof legacy.lightColors.accent === 'string');
  assert('10g. legacy minTouchTarget unchanged', legacy.minTouchTarget === 44);
}

console.log('\n=== 11. Wave 1B — on-featured ink and scrim roles ===');
{
  const {
    ON_FEATURED,
    ON_FEATURED_POSITIVE,
    FEATURED_TEXT_SCRIM_MIN,
    onFeaturedAlpha,
    scrimAt,
    featuredScrimAt,
  } = require('../src/theme/semanticTokens');

  // Doc B p.1: "Text on featured: #FFFFFF over a >=#00000022 scrim stop."
  assert('11a. on-featured ink is #FFFFFF', ON_FEATURED === '#FFFFFF');
  assert('11b. on-featured ink is scheme-invariant by construction (a plain constant)', typeof ON_FEATURED === 'string');

  // The reason this role exists at all: onInteractive cannot serve here.
  const darkOnInteractive = resolveSemanticColors('ocean', 'dark').onInteractive;
  assert('11c. onInteractive is near-black in dark, so it could NOT be used on a dark gradient', darkOnInteractive === '#0F1722');
  assert('11d. on-featured ink therefore differs from dark onInteractive', ON_FEATURED !== darkOnInteractive);

  // Positive movement on a dark surface.
  assert('11e. on-featured positive is the design\'s dark-surface green', ON_FEATURED_POSITIVE === '#7FC7A4');
  assert('11f. it matches the scheme-invariant toastAction in both schemes', ON_FEATURED_POSITIVE === resolveSemanticColors('ocean', 'light').toastAction && ON_FEATURED_POSITIVE === resolveSemanticColors('ocean', 'dark').toastAction);
  assert('11g. it is NOT the light movementPositive (which would be illegible on a gradient)', ON_FEATURED_POSITIVE !== resolveSemanticColors('ocean', 'light').movementPositive);

  // Alpha resolver preserves the requested weight exactly.
  assert('11h. onFeaturedAlpha preserves the exact opacity', onFeaturedAlpha(0.85) === 'rgba(255,255,255,0.85)');
  assert('11i. onFeaturedAlpha(1) is fully opaque white', onFeaturedAlpha(1) === 'rgba(255,255,255,1)');

  // Scrim helper uses the design's own scrim hue per scheme.
  assert('11j. scrimAt(light) uses the light scrim hue', scrimAt('light', 0.42) === 'rgba(16,25,34,0.42)');
  assert('11k. scrimAt(light, 0.42) reproduces the canonical light scrim exactly', scrimAt('light', 0.42) === resolveSemanticColors('ocean', 'light').scrim);
  assert('11l. scrimAt(dark, 0.5) reproduces the canonical dark scrim exactly', scrimAt('dark', 0.5) === resolveSemanticColors('ocean', 'dark').scrim);
  assert('11m. scrimAt preserves a heavier weight for the full-screen celebration', scrimAt('dark', 0.85) === 'rgba(0,0,0,0.85)');

  // Featured-gradient text scrim is black-based and distinct from the
  // surface scrim.
  assert('11n. featuredScrimAt is black-based', featuredScrimAt(0.2) === 'rgba(0,0,0,0.2)');
  assert('11o. the documented minimum stop is recorded', FEATURED_TEXT_SCRIM_MIN === 'rgba(0,0,0,0.13)');
  assert('11p. featuredScrimAt differs from the light surface scrim', featuredScrimAt(0.42) !== resolveSemanticColors('ocean', 'light').scrim);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
