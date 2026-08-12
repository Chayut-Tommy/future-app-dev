import { ColorTokens } from './tokens';

/**
 * Pass 2B correction — the Today Briefing (and every other Navilo-accent
 * surface it shares tokens with) previously read the hero gradient
 * directly off `colors.aiGradientBlue`, hard-coded regardless of the
 * user's selected Lulu/Navilo colour preference — so choosing Purple in
 * Settings changed the AI check-in banner but left the Briefing hero
 * Ocean Blue, producing two competing colour systems on one screen. This
 * module is the single central mapping every colour-aware Today surface
 * now reads from instead: one semantic palette per style, per scheme,
 * covering every token those surfaces need. No component below computes
 * or hard-codes a raw hex value of its own for these surfaces — they all
 * read `naviloPalette.<field>` from ThemeContext.
 *
 * `NaviloColorStyle` reuses the existing three-way value set the app
 * already models on `data.user.luluCardTheme` ('blue' | 'purple' |
 * 'sunrise') — this pass extends that preference from two options to
 * three and widens its effect from "the AI check-in card only" to every
 * surface listed in ThemeContext's own `naviloPalette`/`aiAccentColor`
 * exposure, but does not rename the underlying field (an internal
 * identifier, not customer-facing — see SettingsScreen.tsx for the
 * renamed customer-facing label/options).
 */
export type NaviloColorStyle = 'blue' | 'purple' | 'sunrise';

export interface NaviloPalette {
  heroGradientStart: string;
  heroGradientEnd: string;
  /** Primary on-gradient text colour (title, primary tile value). */
  heroForeground: string;
  /** Translucent tile background sitting directly on the hero gradient —
   * the "lightweight translucent or softly tinted tile" construction that
   * replaces the old large white inner card. Deliberately the same
   * translucency across all three styles (a glass/tonal-separation
   * technique, not a brand hue) — style identity lives in the gradient
   * and accent tokens instead. */
  tileSurface: string;
  tileBorder: string;
  /** Icon/accent colour for ordinary (non-attention) tile content — AUP,
   * upcoming-event, and reminder tiles when not in the attention state. */
  primaryAccent: string;
  /** Pass 2B correction (icon-contrast fix) — the Briefing tile icon's own
   * colour, deliberately SEPARATE from primaryAccent. A tile icon sits
   * directly on the hero gradient (through the translucent tileSurface
   * overlay); primaryAccent is drawn from the same style-family hue as
   * that gradient (e.g. Sunrise's own amber), so an icon painted in
   * primaryAccent reads as barely-there orange-on-orange — the confirmed
   * physical-device defect. tileIconForeground is a soft/warm white per
   * style instead: high contrast against every hero gradient, still
   * visually calm/subordinate to the primary value beneath it (not full-
   * opacity harsh white, and never the app's attention/success colours
   * merely for visibility). primaryAccent itself is intentionally left
   * untouched — Journey's snapshot card (secondaryAccent) and its progress
   * bar (progressAccent) both still read primaryAccent's own value and
   * live on an ordinary SectionCard, not the gradient hero, so they were
   * never part of this defect and must not change. */
  tileIconForeground: string;
  /** Journey's own accent (icon, progress bar) — reads from the same
   * style family as primaryAccent; the two never appear in the same card
   * (Journey is a separate card below the hero), so sharing one value is
   * sufficient distinction without inventing a second hue per style. */
  secondaryAccent: string;
  /** The AI insight banner's own gradient — deliberately a MUTED,
   * lower-saturation pair in the same hue family as the hero gradient
   * (never the vivid hero gradient itself), so the banner reads as
   * subordinate rather than a second competing focal point (correction
   * §8). */
  aiInsightSurfaceStart: string;
  aiInsightSurfaceEnd: string;
  aiInsightForeground: string;
  /** Reserved for genuinely attention-worthy tiles (an overdue/action-
   * needed reminder) — always the app's existing danger/urgent red family,
   * never tinted toward the selected style. This is deliberate: Sunrise's
   * own ambient tone is itself warm amber, so an amber "attention" colour
   * would blend into the ambient background exactly where standing out
   * matters most (correction §6) — red remains clearly distinct against
   * every one of the three styles. */
  attentionAccent: string;
  /** Journey's progress-bar fill — same value as secondaryAccent (one
   * consistent progress treatment, per correction §3's "one calm, legible
   * progress treatment"). */
  progressAccent: string;
}

/** Muted alternative to the vivid brand gradient, used only by the AI
 * insight banner — same hue family as the hero, lower saturation/contrast
 * so it reads as subordinate. Not reused by the hero itself, which keeps
 * the full-intensity aiGradientBlue/aiGradient/sunriseGradient pair. */
const MUTED_INSIGHT_GRADIENT: Record<NaviloColorStyle, Record<'light' | 'dark', [string, string]>> = {
  blue: {
    light: ['#1C3A52', '#2E5870'],
    dark: ['#16283A', '#25455C'],
  },
  purple: {
    light: ['#3A3050', '#4E4468'],
    dark: ['#241C36', '#392C52'],
  },
  sunrise: {
    light: ['#5C4530', '#78614A'],
    dark: ['#3A2C1E', '#544230'],
  },
};

/** Translucent tile chrome — one shared value per scheme, not per style
 * (see NaviloPalette.tileSurface's own doc comment for why). */
const TILE_CHROME: Record<'light' | 'dark', { surface: string; border: string }> = {
  light: { surface: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.26)' },
  dark: { surface: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.18)' },
};

/** Icon-contrast correction — see NaviloPalette.tileIconForeground's own
 * doc comment for the defect this fixes. Ocean Blue/Purple use a soft
 * (not harsh-pure) cool-neutral white, since their hero gradients are
 * blue/violet and any warm tint would look muddy against them. Sunrise
 * uses a warm champagne-white instead — still unmistakably a light,
 * high-contrast icon against the amber/terracotta gradient, but avoids
 * the "torch-white on a warm surface" look the plain white would produce,
 * which is the more premium result the correction explicitly asks for.
 * Dark scheme gets a touch more opacity/warmth than light per style,
 * since the hero gradient itself darkens in dark mode. */
const TILE_ICON_FOREGROUND: Record<NaviloColorStyle, Record<'light' | 'dark', string>> = {
  blue: { light: 'rgba(255,255,255,0.92)', dark: 'rgba(255,255,255,0.95)' },
  purple: { light: 'rgba(255,255,255,0.92)', dark: 'rgba(255,255,255,0.95)' },
  sunrise: { light: '#FFF4E6', dark: '#FFEFDC' },
};

export function selectNaviloPalette(style: NaviloColorStyle, scheme: 'light' | 'dark', colors: ColorTokens): NaviloPalette {
  const heroGradient = style === 'blue' ? colors.aiGradientBlue : style === 'purple' ? colors.aiGradient : colors.sunriseGradient;
  const accent = style === 'blue' ? colors.aiBlue : style === 'purple' ? colors.purple : colors.sunrise;
  const insight = MUTED_INSIGHT_GRADIENT[style][scheme];
  const chrome = TILE_CHROME[scheme];
  const tileIconForeground = TILE_ICON_FOREGROUND[style][scheme];

  return {
    heroGradientStart: heroGradient[0],
    heroGradientEnd: heroGradient[1],
    heroForeground: '#FFFFFF',
    tileSurface: chrome.surface,
    tileBorder: chrome.border,
    primaryAccent: accent,
    tileIconForeground,
    secondaryAccent: accent,
    aiInsightSurfaceStart: insight[0],
    aiInsightSurfaceEnd: insight[1],
    aiInsightForeground: '#FFFFFF',
    attentionAccent: colors.danger,
    progressAccent: accent,
  };
}
