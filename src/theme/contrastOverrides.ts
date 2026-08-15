import { NaviloColorStyle } from './palettes';

/**
 * Pass 2E contrast correction — local, component-scoped colour overrides
 * that fix confirmed WCAG 2.2 AA failures without redefining any shared
 * ColorTokens entry (which would require auditing every other production
 * use of that token). Pulled into their own pure module — rather than left
 * as inline literals in each component — so (a) the three
 * `colors.warning`-as-text sites share one value instead of three
 * hand-copied hexes that could drift, and (b) this module has no
 * react-native import, so the focused test suite (tests/README.md's "Real
 * import" class) can assert the actual contrast math on the actual
 * shipped values, not a mirrored copy.
 */

/**
 * colors.warning's light-mode hex (#B5750B, tokens.ts) fails 4.5:1 as text
 * against every background it's used as text on (surface 3.81:1,
 * surfaceMuted 3.41:1, warningSoft 3.38:1). This is the same hue/saturation,
 * darkened just enough to clear 4.5:1 against all three (4.56:1-5.14:1).
 * Dark mode's colors.warning already passes (6.90:1-7.72:1) and is untouched
 * — only light-mode TEXT uses of colors.warning should read this instead.
 * colors.warning's icon/background uses (SafeToSpendHero's pill, various
 * information/alert icons) already clear the lower 3:1 non-text threshold
 * and are deliberately left reading the original shared token.
 */
export const WARNING_TEXT_LIGHT_OVERRIDE = '#986209';

/**
 * MoneyOpportunitiesHero draws white/rgba-white text directly over
 * aiCardGradient (colors.aiGradientBlue/aiGradient/sunriseGradient) with no
 * backing surface. Even fully-opaque white fails 4.5:1 against the
 * gradient's lighter stop in 4 of 6 style/scheme combinations (as low as
 * 1.86:1). A single fixed foreground colour (light or dark) can't fix this
 * — the gradient sweeps from a dark start stop to a light end stop within
 * one card, so a colour that passes one end fails the other. A dark scrim
 * under the text is the only fix that's robust regardless of exactly where
 * the text lands on the gradient; each value below is the minimum opacity
 * (found by a pass/fail search against the gradient's lightest stop, the
 * harder case) that clears 4.5:1 for every text element on that card,
 * including the itemNumber row index at its lowest opacity (0.6) — kept
 * per style/scheme rather than one uniform value so combinations that need
 * less darkening (purple/dark: 14%) aren't darkened as heavily as the ones
 * that need more (blue/dark: 59%).
 */
export const HERO_SCRIM_OPACITY: Record<NaviloColorStyle, Record<'light' | 'dark', number>> = {
  blue: { light: 0.55, dark: 0.59 },
  purple: { light: 0.3, dark: 0.14 },
  sunrise: { light: 0.58, dark: 0.49 },
};
