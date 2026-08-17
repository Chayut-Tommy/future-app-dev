// Nolie Design 5.1 — locale-aware typography.
//
// WAVE 1A: ADDITIVE. This defines the type system and its resolver. It does
// NOT change any existing font size and does NOT touch screen styles — the
// legacy `typography` export in tokens.ts stays exactly as it is and keeps
// all of its consumers. Migrating components onto these roles is Wave 1B
// and later screen waves.
//
// Values transcribed from the verified Design 5.1 export
// Nolie_Design_5_Tokens.json (typography.roles / typography.money /
// typography.locales) and doc B pp. 2 and 7.
//
// THE CENTRAL CONSTRAINT (doc B p.7, handoff §8.1):
//   Figtree carries NO Thai glyphs. It must never be applied to Thai text.
//   Latin digits are Figtree tabular in BOTH locales, because a financial
//   figure must render with identical numeral metrics regardless of UI
//   language.
// Those two facts together mean a single `fontFamily` token cannot serve a
// mixed Thai-label/Latin-figure string. Hence: per-weight family names, a
// role-aware resolver, and resolveFinancialSegments() below, which states
// what a mixed string decomposes into. Actually splitting components into
// separate <Text> spans is deferred to the wave that owns each component.
//
// Pure and RN-free so the legacy tsx harness can import it for real.

export type AppLocale = 'en' | 'th';
export type FontWeightValue = 400 | 500 | 600 | 700;

export const APP_LOCALES: readonly AppLocale[] = ['en', 'th'] as const;
export const FONT_WEIGHTS: readonly FontWeightValue[] = [400, 500, 600, 700] as const;

/**
 * Font family names exactly as they are registered with expo-font in
 * fonts.ts. React Native selects a face by family NAME, not by a
 * family + numeric weight pair, so each weight is its own family — this is
 * why a single family token per locale would silently collapse 500/600/700
 * onto one face.
 */
export const FIGTREE_FAMILY: Readonly<Record<FontWeightValue, string>> = {
  400: 'Figtree_400Regular',
  500: 'Figtree_500Medium',
  600: 'Figtree_600SemiBold',
  700: 'Figtree_700Bold',
};

export const NOTO_SANS_THAI_FAMILY: Readonly<Record<FontWeightValue, string>> = {
  400: 'NotoSansThai_400Regular',
  500: 'NotoSansThai_500Medium',
  600: 'NotoSansThai_600SemiBold',
  700: 'NotoSansThai_700Bold',
};

/** Platform fallbacks. Layouts must not assume Figtree-only widths. */
export const FONT_FALLBACKS = { ios: 'SF Pro', android: 'Roboto' } as const;

export const FIGTREE_LICENSE = 'SIL OFL 1.1';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type TypeRoleName =
  | 'figureHero'
  | 'figureLarge'
  | 'figureRow'
  | 'titleScreen'
  | 'titleSection'
  | 'titleCard'
  | 'body'
  | 'support'
  | 'meta'
  | 'eyebrow'
  | 'labelButton'
  | 'labelTab';

export interface TypeRole {
  size: number;
  /** English line height, as published. Thai is derived — see THAI_METRICS. */
  line: number;
  weight: FontWeightValue;
  tracking?: number;
  /** True for money/numeric roles: always Figtree, always tabular. */
  figure?: boolean;
  /** Uppercased in English only; Thai has no case, so the transform is
   * suppressed there (doc B p.7). */
  uppercase?: boolean;
  /** Dynamic Type cap. Body-class roles are uncapped and reflow. */
  maxScale?: number;
  /** labelTab carries two weights rather than one. */
  weightActive?: FontWeightValue;
}

export const TYPE_ROLES: Readonly<Record<TypeRoleName, TypeRole>> = {
  figureHero: { size: 46, line: 52, weight: 600, tracking: -1.5, figure: true, maxScale: 1.6 },
  figureLarge: { size: 28, line: 34, weight: 600, figure: true, maxScale: 1.6 },
  figureRow: { size: 17, line: 24, weight: 600, figure: true, maxScale: 1.6 },
  titleScreen: { size: 29, line: 34, weight: 600, tracking: -0.6, maxScale: 1.8 },
  titleSection: { size: 20, line: 26, weight: 600, maxScale: 1.8 },
  titleCard: { size: 17, line: 23, weight: 600 },
  body: { size: 16, line: 23, weight: 400 },
  support: { size: 14, line: 20, weight: 400 },
  meta: { size: 13, line: 18, weight: 400 },
  eyebrow: { size: 12.5, line: 16, weight: 600, uppercase: true, tracking: 1 },
  labelButton: { size: 16, line: 20, weight: 600 },
  labelTab: { size: 11, line: 14, weight: 500, weightActive: 600 },
};

export const TYPE_ROLE_NAMES = Object.keys(TYPE_ROLES) as TypeRoleName[];

/** Roles that render money or other Latin numerals. */
export const FIGURE_ROLE_NAMES: readonly TypeRoleName[] = TYPE_ROLE_NAMES.filter(
  (name) => TYPE_ROLES[name].figure === true
);

/** Roles that render prose and therefore follow the locale. */
export const TEXTUAL_ROLE_NAMES: readonly TypeRoleName[] = TYPE_ROLE_NAMES.filter(
  (name) => TYPE_ROLES[name].figure !== true
);

// ---------------------------------------------------------------------------
// Money grammar
// ---------------------------------------------------------------------------

export const MONEY_TYPOGRAPHY = {
  fontVariant: ['tabular-nums'] as const,
  /** Cents render at 55% of the dollars size, in textSecondary. */
  centsScale: 0.55,
  centsColorRole: 'textSecondary',
  symbolColorRole: 'textSecondary',
  /** Deltas always carry an explicit + or -. */
  signExplicit: true,
  neverTruncate: ['amount', 'date', 'disambiguating label'],
} as const;

// ---------------------------------------------------------------------------
// Locale metrics
// ---------------------------------------------------------------------------

/**
 * Thai metrics, doc B p.7 and Tokens.json typography.locales.th.metrics.
 * Thai ascender/descender marks stack above and below the baseline, so the
 * line box must grow; and because Thai has no uppercase, the eyebrow
 * transform is suppressed rather than applied to a script that would
 * ignore it inconsistently across platforms.
 */
export const THAI_METRICS = {
  lineHeightMultiplier: 1.42,
  fieldHeightPt: 60,
  buttonVerticalPaddingDeltaPt: 2,
  chipHeightPt: 28,
  uppercaseTransforms: false,
  buttonWrapBeforeShrink: true,
} as const;

/** English control baseline, doc B p.4 ("56 pt height" fields, 26 pt chips).
 * Held here so the Thai deltas have an explicit thing to be a delta from. */
export const ENGLISH_METRICS = {
  lineHeightMultiplier: 1.3,
  fieldHeightPt: 56,
  buttonVerticalPaddingDeltaPt: 0,
  chipHeightPt: 26,
  uppercaseTransforms: true,
  buttonWrapBeforeShrink: true,
} as const;

/** Buttons wrap to two lines rather than shrink below this size. */
export const MIN_BUTTON_FONT_SIZE = 11;

export interface ControlMetrics {
  fieldHeightPt: number;
  buttonVerticalPaddingDeltaPt: number;
  chipHeightPt: number;
  uppercaseTransforms: boolean;
  buttonWrapBeforeShrink: boolean;
  /** Baselines align via fixed control heights, never via font metrics —
   * the two families do not share a baseline. */
  alignBaselinesViaFixedHeights: true;
}

export function resolveControlMetrics(locale: AppLocale): ControlMetrics {
  const m = locale === 'th' ? THAI_METRICS : ENGLISH_METRICS;
  return {
    fieldHeightPt: m.fieldHeightPt,
    buttonVerticalPaddingDeltaPt: m.buttonVerticalPaddingDeltaPt,
    chipHeightPt: m.chipHeightPt,
    uppercaseTransforms: m.uppercaseTransforms,
    buttonWrapBeforeShrink: m.buttonWrapBeforeShrink,
    alignBaselinesViaFixedHeights: true,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Which family a given role uses in a given locale. Figure roles are
 * Figtree everywhere; textual roles follow the locale. */
export function resolveFontFamily(
  role: TypeRoleName,
  locale: AppLocale,
  weight: FontWeightValue
): string {
  if (TYPE_ROLES[role].figure) return FIGTREE_FAMILY[weight];
  return locale === 'th' ? NOTO_SANS_THAI_FAMILY[weight] : FIGTREE_FAMILY[weight];
}

export interface ResolvedTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'none';
  fontVariant?: readonly ['tabular-nums'];
  maxScale?: number;
}

export interface ResolveTextStyleOptions {
  /** labelTab's selected state; ignored by every other role. */
  active?: boolean;
}

/**
 * The single entry point components will use from Wave 1B onward. Returns a
 * plain object intentionally shaped like a React Native TextStyle, but this
 * module stays RN-free so it remains testable in the legacy harness.
 */
export function resolveTextStyle(
  role: TypeRoleName,
  locale: AppLocale,
  options: ResolveTextStyleOptions = {}
): ResolvedTextStyle {
  const spec = TYPE_ROLES[role];
  const weight = options.active && spec.weightActive ? spec.weightActive : spec.weight;
  const isThai = locale === 'th';

  // Thai grows the line box; English uses the published line height.
  const lineHeight = isThai
    ? Math.round(spec.size * THAI_METRICS.lineHeightMultiplier)
    : spec.line;

  const style: ResolvedTextStyle = {
    fontFamily: resolveFontFamily(role, locale, weight),
    fontSize: spec.size,
    lineHeight,
  };

  if (spec.tracking !== undefined) style.letterSpacing = spec.tracking;
  if (spec.uppercase) style.textTransform = isThai ? 'none' : 'uppercase';
  if (spec.figure) style.fontVariant = MONEY_TYPOGRAPHY.fontVariant;
  if (spec.maxScale !== undefined) style.maxScale = spec.maxScale;

  return style;
}

// ---------------------------------------------------------------------------
// Mixed-language financial strings
// ---------------------------------------------------------------------------

export type FinancialSegmentKind = 'label' | 'figure';

export interface FinancialSegment {
  kind: FinancialSegmentKind;
  text: string;
  /** Resolved family for this segment specifically. */
  fontFamily: string;
  fontVariant?: readonly ['tabular-nums'];
}

/**
 * Resolver ONLY — Wave 1A defines the contract; components are decomposed
 * into separate spans in the wave that owns each component.
 *
 * Why this exists: in Thai, "ใช้ได้จนถึงวันเงินเดือน $1,326.40" is one visual
 * string but two typographic systems. The label needs Noto Sans Thai (no
 * Thai glyphs exist in Figtree) while the amount needs Figtree tabular (so
 * digit widths match every other figure in the app). One fontFamily cannot
 * express that, so the string must eventually render as two spans.
 *
 * Returns the segments and their resolved families; it does not render.
 */
export function resolveFinancialSegments(
  parts: { kind: FinancialSegmentKind; text: string }[],
  locale: AppLocale,
  options: { labelRole?: TypeRoleName; figureRole?: TypeRoleName } = {}
): FinancialSegment[] {
  const labelRole = options.labelRole ?? 'body';
  const figureRole = options.figureRole ?? 'figureRow';
  return parts.map((part) => {
    if (part.kind === 'figure') {
      const spec = TYPE_ROLES[figureRole];
      return {
        kind: part.kind,
        text: part.text,
        fontFamily: FIGTREE_FAMILY[spec.weight],
        fontVariant: MONEY_TYPOGRAPHY.fontVariant,
      };
    }
    const spec = TYPE_ROLES[labelRole];
    return {
      kind: part.kind,
      text: part.text,
      fontFamily: resolveFontFamily(labelRole, locale, spec.weight),
    };
  });
}

/** True when a string mixes Thai script with Latin digits and therefore
 * cannot be rendered by a single family. */
export function requiresSegmentedRendering(text: string, locale: AppLocale): boolean {
  if (locale !== 'th') return false;
  const hasThai = /[฀-๿]/.test(text);
  const hasLatinDigit = /[0-9]/.test(text);
  return hasThai && hasLatinDigit;
}

// ---------------------------------------------------------------------------
// Dynamic Type
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wave 1B — global font-consumer migration
// ---------------------------------------------------------------------------
//
// 91 files consume the LEGACY `typography` object (549 `...typography.<role>`
// spreads). Rather than edit 549 call sites, the legacy roles are given a
// resolved fontFamily centrally and handed to every consumer through
// ThemeContext. That migrates the whole app's text onto the bundled families
// with no feature-file churn and no change to any existing size.
//
// SIZES ARE DELIBERATELY NOT CHANGED HERE. The Design 5.1 scale differs from
// the legacy one (body 16 vs 15, titleScreen 29 vs title 24). Applying it
// globally would reflow every screen — a geometry change that belongs to the
// component and screen waves, and which this wave's own boundary explicitly
// excludes. Wave 1B migrates FAMILY and WEIGHT only.

/** The legacy role names in tokens.ts `typography`. */
export type LegacyTypeRoleName = 'title' | 'heading' | 'body' | 'caption' | 'micro';

/** Legacy role -> the weight it declares, and therefore the family asset it
 * must resolve to. Mirrors tokens.ts exactly; asserted by tests. */
export const LEGACY_ROLE_WEIGHT: Readonly<Record<LegacyTypeRoleName, FontWeightValue>> = {
  title: 700,
  heading: 600,
  body: 400,
  caption: 400,
  micro: 500,
};

export interface ResolvedLegacyRole {
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  fontFamily: string;
}

/**
 * Resolve the legacy typography object for a locale, adding the correct
 * per-weight family to each role while preserving its existing size and
 * weight verbatim.
 *
 * `fontWeight` is retained alongside `fontFamily` on purpose: it is what the
 * platform falls back to if a family fails to load, and it keeps the object
 * shape identical for the 549 existing spreads.
 */
export function resolveLegacyTypography(
  legacy: Readonly<Record<LegacyTypeRoleName, { fontSize: number; fontWeight: string }>>,
  locale: AppLocale
): Record<LegacyTypeRoleName, ResolvedLegacyRole> {
  const out = {} as Record<LegacyTypeRoleName, ResolvedLegacyRole>;
  for (const role of Object.keys(LEGACY_ROLE_WEIGHT) as LegacyTypeRoleName[]) {
    const weight = LEGACY_ROLE_WEIGHT[role];
    out[role] = {
      fontSize: legacy[role].fontSize,
      fontWeight: legacy[role].fontWeight as ResolvedLegacyRole['fontWeight'],
      // Legacy roles are prose roles, so they follow the locale. Money is
      // resolved separately via moneyFontFamily below.
      fontFamily: locale === 'th' ? NOTO_SANS_THAI_FAMILY[weight] : FIGTREE_FAMILY[weight],
    };
  }
  return out;
}

/**
 * The family a locally-overridden weight must use.
 *
 * A style that spreads a role and then overrides `fontWeight` would otherwise
 * ask the platform to synthesise a heavier face from a fixed-weight family —
 * which iOS largely ignores and Android fakes. Call sites that override a
 * weight therefore declare the matching family instead.
 */
export function fontFamilyForWeight(weight: FontWeightValue, locale: AppLocale): string {
  return locale === 'th' ? NOTO_SANS_THAI_FAMILY[weight] : FIGTREE_FAMILY[weight];
}

/**
 * The family for money and other Latin numerals — Figtree in BOTH locales,
 * so digit metrics never change with the UI language.
 */
export function moneyFontFamily(weight: FontWeightValue = 600): string {
  return FIGTREE_FAMILY[weight];
}

export const DYNAMIC_TYPE = {
  figureMaxScale: 1.6,
  titleMaxScale: 1.8,
  /** Body and below scale without a cap and reflow instead. */
  bodyUncapped: true,
  /** Amounts, dates and money-disambiguating labels never truncate — rows
   * grow instead. */
  neverTruncate: MONEY_TYPOGRAPHY.neverTruncate,
} as const;
