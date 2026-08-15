/**
 * Pass 2E contrast correction round — focused coverage for this round's
 * two new contrast-fix mechanisms only (see tests/README.md for the
 * real-import / mirrored / structural taxonomy):
 *
 *  1. WARNING_TEXT_LIGHT_OVERRIDE (src/theme/contrastOverrides.ts) — the
 *     darkened light-mode replacement for colors.warning used as TEXT at
 *     three sites (SmartReminderCard.errorText, MonthSnapshotCard.netColor,
 *     FinancialStateCard.eyebrow).
 *  2. HERO_SCRIM_OPACITY (same file) — the per-style/scheme minimum black
 *     scrim opacity MoneyOpportunitiesHero.tsx applies under its white text
 *     so it clears 4.5:1 against aiCardGradient's lighter stop.
 *
 * Both constants are imported for real (they live in a plain .ts module
 * with no react-native import) and checked against the actual WCAG 2.2
 * relative-luminance/contrast-ratio formula, mirroring the same math this
 * repo's own precedent test (pass-2b-icon-contrast-and-creditcard-save)
 * already established. This proves the shipped numbers are mathematically
 * correct; it does not replace physical-device visual confirmation.
 */
import { WARNING_TEXT_LIGHT_OVERRIDE, HERO_SCRIM_OPACITY } from '../src/theme/contrastOverrides';
import { lightColors, darkColors } from '../src/theme/tokens';
import { NaviloColorStyle } from '../src/theme/palettes';

let total = 0;
let failures = 0;
function assert(label: string, condition: boolean) {
  total++;
  if (!condition) {
    failures++;
    console.log(`FAIL — ${label}`);
  } else {
    console.log(`PASS — ${label}`);
  }
}

function parseColor(c: string): { r: number; g: number; b: number; a: number } {
  c = c.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  throw new Error('cannot parse color: ' + c);
}

function compositeOver(fg: string, bg: string): { r: number; g: number; b: number } {
  const fgc = parseColor(fg);
  const bgc = parseColor(bg);
  const a = fgc.a;
  return { r: fgc.r * a + bgc.r * (1 - a), g: fgc.g * a + bgc.g * (1 - a), b: fgc.b * a + bgc.b * (1 - a) };
}

function relLum({ r, g, b }: { r: number; g: number; b: number }): number {
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg: string, bg: string): number {
  const fgc = parseColor(fg);
  const effFg = fgc.a < 1 ? compositeOver(fg, bg) : fgc;
  const effBg = parseColor(bg);
  const L1 = relLum(effFg);
  const L2 = relLum(effBg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

console.log('=== Section 1: WARNING_TEXT_LIGHT_OVERRIDE clears 4.5:1 on every real background it is used as text on (Real import) ===');
{
  // The three actual light-mode backgrounds this override is composed
  // against in production: colors.surface (SmartReminderCard.errorText),
  // colors.surfaceMuted (MonthSnapshotCard.netColor's tile), and
  // colors.warningSoft (FinancialStateCard.eyebrow's card).
  const backgrounds: Array<[string, string]> = [
    ['surface', lightColors.surface],
    ['surfaceMuted', lightColors.surfaceMuted],
    ['warningSoft', lightColors.warningSoft],
  ];
  for (const [label, bg] of backgrounds) {
    const ratio = contrast(WARNING_TEXT_LIGHT_OVERRIDE, bg);
    assert(`WARNING_TEXT_LIGHT_OVERRIDE (${WARNING_TEXT_LIGHT_OVERRIDE}) on colors.${label} (${bg}) clears 4.5:1 — actual ${ratio.toFixed(2)}:1`, ratio >= 4.5);
  }
  const originalRatioSurface = contrast(lightColors.warning, lightColors.surface);
  assert(
    `the ORIGINAL colors.warning (${lightColors.warning}) genuinely fails 4.5:1 on colors.surface (actual ${originalRatioSurface.toFixed(2)}:1) — confirms the override fixes a real defect, not a false positive`,
    originalRatioSurface < 4.5
  );
}

console.log('\n=== Section 2: dark-mode colors.warning is untouched and already passes 4.5:1 as text (Real import) ===');
{
  // The override is light-mode only — dark mode keeps reading colors.warning
  // directly (SmartReminderCard.tsx/MonthSnapshotCard.tsx/
  // FinancialStateCard.tsx all branch on `scheme === 'light'`). This proves
  // that's safe: dark mode's colors.warning already clears 4.5:1 on all
  // three real backgrounds, so leaving it unchanged there is not a residual
  // failure.
  const backgrounds: Array<[string, string]> = [
    ['surface', darkColors.surface],
    ['surfaceMuted', darkColors.surfaceMuted],
    ['warningSoft', darkColors.warningSoft],
  ];
  for (const [label, bg] of backgrounds) {
    const ratio = contrast(darkColors.warning, bg);
    assert(`dark-mode colors.warning (${darkColors.warning}) on colors.${label} (${bg}) already clears 4.5:1 — actual ${ratio.toFixed(2)}:1`, ratio >= 4.5);
  }
}

console.log('\n=== Section 3: HERO_SCRIM_OPACITY makes every text weight on MoneyOpportunitiesHero clear 4.5:1 for all 6 style/scheme combinations (Real import) ===');
{
  // The gradient's lighter stop (index 1) is the harder case for a dark
  // scrim to overcome — a diagonal gradient's darker start stop only gets
  // easier to pass as the scrim darkens further, so checking the lighter
  // stop is the worst-case check, consistent with the task's "never test
  // only a convenient gradient endpoint" contrast rule (the convenient
  // endpoint here would be the darker stop, which this deliberately avoids).
  const gradients: Record<NaviloColorStyle, Record<'light' | 'dark', [string, string]>> = {
    blue: { light: lightColors.aiGradientBlue, dark: darkColors.aiGradientBlue },
    purple: { light: lightColors.aiGradient, dark: darkColors.aiGradient },
    sunrise: { light: lightColors.sunriseGradient, dark: darkColors.sunriseGradient },
  };
  // The four distinct text opacities actually rendered on this card
  // (title/itemTitle/itemAction/exploreButtonText are full #fff; the rest
  // are progressively more translucent whites) — itemNumber at 0.6 is the
  // most translucent, and therefore the hardest of the four to pass.
  const textWeights = ['#FFFFFF', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.6)'];

  const styles: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  for (const style of styles) {
    for (const scheme of ['light', 'dark'] as const) {
      const lighterStop = gradients[style][scheme][1];
      const scrimAlpha = HERO_SCRIM_OPACITY[style][scheme];
      const effectiveBg = compositeOver(`rgba(0,0,0,${scrimAlpha})`, lighterStop);
      const effectiveBgStr = `rgb(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b})`;
      for (const fg of textWeights) {
        const ratio = contrast(fg, effectiveBgStr);
        assert(
          `${style}/${scheme}: text ${fg} over rgba(0,0,0,${scrimAlpha}) scrim on gradient's lighter stop (${lighterStop}) clears 4.5:1 — actual ${ratio.toFixed(2)}:1`,
          ratio >= 4.5
        );
      }
      // Confirm the scrim opacity is genuinely necessary, not just safely
      // over-applied — the same worst-case text weight without any scrim
      // must actually fail, otherwise this style/scheme wouldn't need one.
      const unscrimmedRatio = contrast(textWeights[3], lighterStop);
      assert(
        `${style}/${scheme}: WITHOUT the scrim, the hardest text weight (${textWeights[3]}) genuinely fails on the raw gradient stop (actual ${unscrimmedRatio.toFixed(2)}:1) — confirms the scrim isn't solving a non-problem`,
        unscrimmedRatio < 4.5
      );
    }
  }
}

console.log('\n=== Section 4: HERO_SCRIM_OPACITY only darkens as much as each combination actually needs (Real import) ===');
{
  // One opacity step lower than the shipped value should fail for at least
  // one of the four text weights — proving each value is the minimum
  // necessary, not an arbitrarily large safety margin (per the task's
  // "smallest correction" instruction).
  const gradients: Record<NaviloColorStyle, Record<'light' | 'dark', [string, string]>> = {
    blue: { light: lightColors.aiGradientBlue, dark: darkColors.aiGradientBlue },
    purple: { light: lightColors.aiGradient, dark: darkColors.aiGradient },
    sunrise: { light: lightColors.sunriseGradient, dark: darkColors.sunriseGradient },
  };
  const textWeights = ['#FFFFFF', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.6)'];
  const styles: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  for (const style of styles) {
    for (const scheme of ['light', 'dark'] as const) {
      const lighterStop = gradients[style][scheme][1];
      const scrimAlpha = HERO_SCRIM_OPACITY[style][scheme];
      const oneStepLower = Math.max(0, scrimAlpha - 0.01);
      const effectiveBg = compositeOver(`rgba(0,0,0,${oneStepLower})`, lighterStop);
      const effectiveBgStr = `rgb(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b})`;
      const worstRatio = Math.min(...textWeights.map((fg) => contrast(fg, effectiveBgStr)));
      assert(
        `${style}/${scheme}: one percentage point BELOW the shipped ${scrimAlpha} scrim, the worst text weight fails 4.5:1 (actual ${worstRatio.toFixed(2)}:1) — confirms ${scrimAlpha} is the minimum, not an oversized margin`,
        worstRatio < 4.5
      );
    }
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
