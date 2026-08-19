// Nolie Design 5.1 — semantic colour, spacing, radius and elevation system.
//
// WAVE 1A: ADDITIVE ONLY. This module sits ALONGSIDE the existing
// tokens.ts/palettes.ts public API. Nothing here replaces, renames or
// deletes a legacy token, and no feature component is migrated onto it in
// this wave. Feature-file colour migration, legacy-token deletion and
// contrastOverrides.ts retirement are Wave 1B (see
// docs/Nolie_Design_5_1_Owner_Decisions_2026-08-17.md §5).
//
// Values are transcribed from the verified Design 5.1 export
// Nolie_Design_5_Tokens.json (meta.version 5.1.0). No value is invented.
//
// DERIVATION NOTE (owner decision 3, blocker C-3): Design B p.6 and the
// implementation handoff both state that "Tokens.json §components lists,
// per component: variants x states x 6 themes with resolved values". The
// shipped Tokens.json contains only `componentThemeMatrix`, which lists
// semantic ROLE NAMES per component and no resolved values. The resolved
// six-theme component catalogue below is therefore DERIVED LOCALLY, by
// construction, from color.shared[scheme] + color.styleScoped[style][scheme]
// — which is exactly how Tokens.json's own note says a component must
// resolve its roles. If Claude Design later supplies an authoritative
// matrix it must be reconciled against this derivation.
//
// Pure and RN-free on purpose: the repository's legacy tsx test harness
// cannot import anything that reaches react-native (see tests/README.md),
// so keeping this module dependency-free is what makes the six-theme and
// contrast assertions real-import proof rather than mirrored copies.

export type DesignScheme = 'light' | 'dark';

/** Design 5.1 names the default style "ocean"; the repository's existing,
 * customer-preference-backed enum (NaviloColorStyle in palettes.ts, stored
 * on data.user.luluCardTheme) calls the same style 'blue'. Both names are
 * kept — the stored preference is NOT renamed in Wave 1A (that would be a
 * persistence change) — and bridged by toDesignColorStyle() below. */
export type DesignColorStyle = 'ocean' | 'purple' | 'sunrise';

export const DESIGN_SCHEMES: readonly DesignScheme[] = ['light', 'dark'] as const;
export const DESIGN_COLOR_STYLES: readonly DesignColorStyle[] = ['ocean', 'purple', 'sunrise'] as const;

/** All six shipping combinations, in a stable order, so tests and future
 * visual-regression catalogues iterate the same matrix. */
export const DESIGN_THEME_MATRIX: readonly { style: DesignColorStyle; scheme: DesignScheme }[] =
  DESIGN_COLOR_STYLES.flatMap((style) => DESIGN_SCHEMES.map((scheme) => ({ style, scheme })));

/**
 * Roles that are IDENTICAL in all three colour styles within one scheme.
 * Design 5.1 rule (Tokens.json color.rules, doc B p.1): "Style may never
 * touch: interactive, status roles, text roles, borders, movement colours,
 * chart semantic series." Only the styleScoped roles retint.
 */
export interface SharedColorRoles {
  bgCanvas: string;
  bgSurface: string;
  bgRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textTitle: string;
  textFigure: string;
  interactive: string;
  interactivePressed: string;
  interactiveTint: string;
  onInteractive: string;
  success: string;
  successTint: string;
  successBorder: string;
  warning: string;
  warningAccent: string;
  warningTint: string;
  warningBorder: string;
  urgent: string;
  urgentText: string;
  urgentTint: string;
  info: string;
  infoText: string;
  infoTint: string;
  infoBorder: string;
  movementPositive: string;
  movementNegative: string;
  scrim: string;
  toastBg: string;
  toastAction: string;
}

/** The only roles a colour style is permitted to retint. */
export interface StyleScopedColorRoles {
  /** Full-bleed ambient field behind header + hero; fades to canvas by
   * 220 pt. Ordered stops, light-to-canvas. One per screen. */
  ambient: readonly string[];
  /** Featured gradient: FAB, onboarding CTA, journey/celebration accents. */
  featured: readonly string[];
  /** The one Premium Expressive card surface per screen. */
  heroSurface: readonly string[];
  heroBorder: string;
}

export interface SemanticColors extends SharedColorRoles, StyleScopedColorRoles {
  style: DesignColorStyle;
  scheme: DesignScheme;
}

// ---------------------------------------------------------------------------
// Shared roles (Tokens.json color.shared)
// ---------------------------------------------------------------------------

export const SHARED_COLORS: Readonly<Record<DesignScheme, SharedColorRoles>> = {
  light: {
    bgCanvas: '#F6F8F9',
    bgSurface: '#FFFFFF',
    bgRaised: '#EDF1F4',
    border: '#E3E9EE',
    textPrimary: '#1C2B3A',
    textSecondary: '#3E5266',
    textTertiary: '#5C7186',
    textTitle: '#14335C',
    textFigure: '#1B4177',
    interactive: '#2C67B4',
    interactivePressed: '#23539A',
    interactiveTint: '#E3EDF9',
    onInteractive: '#FFFFFF',
    success: '#1E7A55',
    successTint: '#F1F8F4',
    successBorder: '#DCEDE3',
    warning: '#8A5E14',
    warningAccent: '#C9902E',
    warningTint: '#FAF3E4',
    warningBorder: '#EAD9B0',
    urgent: '#8C4A3B',
    urgentText: '#7A3A2C',
    urgentTint: '#F7ECE8',
    info: '#4C63B6',
    infoText: '#33478C',
    infoTint: '#F3F5FE',
    infoBorder: '#DFE4F6',
    movementPositive: '#1E7A55',
    // Slate, never red: an outgoing amount is not an error (doc B p.1).
    movementNegative: '#3E5266',
    scrim: 'rgba(16,25,34,0.42)',
    toastBg: '#1E2E38',
    toastAction: '#7FC7A4',
  },
  dark: {
    bgCanvas: '#0F1722',
    bgSurface: '#16202C',
    bgRaised: '#1D2936',
    border: '#24313F',
    textPrimary: '#EAF1F7',
    textSecondary: '#A9BACB',
    textTertiary: '#7E8FA0',
    textTitle: '#DCE9F8',
    textFigure: '#BFD7F2',
    interactive: '#5E96D8',
    interactivePressed: '#7FACE0',
    interactiveTint: 'rgba(94,150,216,0.16)',
    onInteractive: '#0F1722',
    success: '#7FC7A4',
    successTint: 'rgba(94,197,146,0.14)',
    successBorder: '#2A4A3C',
    warning: '#E3B877',
    warningAccent: '#E3B877',
    warningTint: 'rgba(224,177,115,0.14)',
    warningBorder: '#4A3D22',
    urgent: '#D98B77',
    urgentText: '#D98B77',
    urgentTint: 'rgba(217,139,119,0.14)',
    info: '#A9B6E8',
    infoText: '#A9B6E8',
    infoTint: 'rgba(147,163,224,0.14)',
    infoBorder: '#2F3652',
    movementPositive: '#7FC7A4',
    movementNegative: '#A9BACB',
    scrim: 'rgba(0,0,0,0.5)',
    toastBg: '#1E2E38',
    toastAction: '#7FC7A4',
  },
};

// ---------------------------------------------------------------------------
// Style-scoped roles (Tokens.json color.styleScoped)
// ---------------------------------------------------------------------------

export const STYLE_SCOPED_COLORS: Readonly<
  Record<DesignColorStyle, Readonly<Record<DesignScheme, StyleScopedColorRoles>>>
> = {
  ocean: {
    light: {
      ambient: ['#DCE9F8', '#E7F2F5', '#F6F8F9'],
      featured: ['#3D79C6', '#23539A'],
      heroSurface: ['#FFFFFF', '#F3F8FD', '#E7F0FA'],
      heroBorder: '#D9E5F2',
    },
    dark: {
      ambient: ['#16243A', '#131C2B', '#0F1722'],
      featured: ['#2C67B4', '#1B4177'],
      heroSurface: ['#1B2A3E', '#16202C'],
      heroBorder: '#2A3B50',
    },
  },
  purple: {
    light: {
      ambient: ['#E9E5F9', '#F0EDFA', '#F7F6FA'],
      featured: ['#8B7BD8', '#54459F'],
      heroSurface: ['#FFFFFF', '#F5F3FC', '#ECE8F8'],
      heroBorder: '#DFDAF2',
    },
    dark: {
      ambient: ['#221D3B', '#181430', '#121022'],
      featured: ['#6D5BC7', '#54459F'],
      heroSurface: ['#241F3C', '#181430'],
      heroBorder: '#37305A',
    },
  },
  sunrise: {
    light: {
      ambient: ['#FBE9DC', '#FCF1E6', '#FBF7F1'],
      featured: ['#E2926B', '#C0642F'],
      heroSurface: ['#FFFFFF', '#FCF4EC', '#F8EADC'],
      heroBorder: '#EEDCC9',
    },
    dark: {
      ambient: ['#2A1F16', '#1F1710', '#151009'],
      featured: ['#C0642F', '#8F4A22'],
      heroSurface: ['#2A211A', '#1F1710'],
      heroBorder: '#463527',
    },
  },
};

/** The scoping rules verbatim from Tokens.json color.rules — kept in code
 * so the constraint travels with the tokens rather than living only in a
 * document. Asserted by tests/design5-semantic-tokens.test.ts. */
export const COLOR_SCOPE_RULES: readonly string[] = [
  'Style may retint: ambient, featured, heroSurface, journey/celebration accents, onboarding backdrop, tray tile tints.',
  'Style may never touch: interactive, status roles, text roles, borders, movement colours, chart semantic series.',
  'Sunrise ambient barred from status components; warnings always pair warning text + icon + word.',
  'Green only for success/positive movement. Urgent only for overdue, destructive confirmation, persistence failure.',
  'movementNegative is slate with explicit minus, never red.',
  'Text on featured gradients sits on a scrim stop of at least rgba(0,0,0,0.13).',
];

/** Roles a colour style must NEVER alter. Used as the protected set by the
 * style-independence test. */
export const PROTECTED_ROLE_NAMES: readonly (keyof SharedColorRoles)[] = [
  'bgCanvas', 'bgSurface', 'bgRaised', 'border',
  'textPrimary', 'textSecondary', 'textTertiary', 'textTitle', 'textFigure',
  'interactive', 'interactivePressed', 'interactiveTint', 'onInteractive',
  'success', 'successTint', 'successBorder',
  'warning', 'warningAccent', 'warningTint', 'warningBorder',
  'urgent', 'urgentText', 'urgentTint',
  'info', 'infoText', 'infoTint', 'infoBorder',
  'movementPositive', 'movementNegative',
  'scrim', 'toastBg', 'toastAction',
];

/** Roles a colour style MAY retint. */
export const STYLE_SCOPED_ROLE_NAMES: readonly (keyof StyleScopedColorRoles)[] = [
  'ambient', 'featured', 'heroSurface', 'heroBorder',
];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Bridges the stored customer preference ('blue') to the Design 5.1 name
 * ('ocean'). The stored value is deliberately NOT migrated in Wave 1A —
 * renaming it would be a persistence change, which this wave forbids. */
export function toDesignColorStyle(naviloStyle: 'blue' | 'purple' | 'sunrise'): DesignColorStyle {
  return naviloStyle === 'blue' ? 'ocean' : naviloStyle;
}

/** Resolve one of the six theme combinations into a flat role set. This is
 * the single entry point every future component uses — a component never
 * reads SHARED_COLORS or STYLE_SCOPED_COLORS directly. */
export function resolveSemanticColors(style: DesignColorStyle, scheme: DesignScheme): SemanticColors {
  return { ...SHARED_COLORS[scheme], ...STYLE_SCOPED_COLORS[style][scheme], style, scheme };
}

// ---------------------------------------------------------------------------
// Layout: spacing, radius, elevation (Tokens.json layout / radius / elevation)
// ---------------------------------------------------------------------------
//
// Deliberately named `design*` rather than reusing `spacing`/`radius` from
// tokens.ts: the legacy scale has different values (e.g. radius.card is 20
// there, 16 here) and dozens of live consumers. Wave 1A must not shift any
// existing layout, so the two scales coexist until Wave 1B migrates
// consumers.

export const designSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** The raw Design 5.1 spacing ramp, in order, exactly as specified. */
export const DESIGN_SPACING_SCALE: readonly number[] = [4, 8, 12, 16, 20, 24, 32, 48];

export const designLayout = {
  screenMargin: 20,
  screenMarginCompact: 16,
  cardPadding: 16,
  heroPadding: 20,
  sectionGap: 24,
  cardGap: 12,
  inCardStack: 8,
  contentMaxWidthTablet: 560,
  touchTargetMin: 44,
  breakpoints: { compactMax: 360, defaultMax: 500, tabletMin: 768 },
  dock: {
    capsuleHeight: 64,
    capsuleHeightAccessibility: 68,
    fabSize: 64,
    sideMargin: 16,
    gap: 8,
    /** Expressed as a formula in the export: safeArea + 8. */
    bottomOffsetAboveSafeArea: 8,
    maxWidthTablet: 500,
  },
  /** Export states "64 + safeArea + 24"; the safe-area part is supplied at
   * runtime by the existing floatingNavGeometry contract, untouched here. */
  contentBottomClearanceExcludingSafeArea: 64 + 24,
} as const;

export const designRadius = {
  control: 12,
  card: 16,
  hero: 20,
  sheetTop: 24,
  tile: 12,
  pill: 999,
  trayPanel: 20,
} as const;

/** Elevation is expressed per platform. Light uses shadows; dark halves
 * shadow opacity and leans on surface step + border; Android uses its own
 * elevation integers. Only hero, dock, fab, tray, sheets and toast float —
 * ordinary cards sit flat with a hairline border. */
export const designElevation = {
  light: {
    e1: { offsetY: 1, blur: 2, color: 'rgba(16,29,44,0.06)' },
    e2: { offsetY: 6, blur: 16, color: 'rgba(16,29,44,0.10)' },
    e3: { offsetY: -8, blur: 26, color: 'rgba(16,29,44,0.16)' },
  },
  /** Dark rule from the export: halve shadow opacity; depth is carried by
   * the surface step plus the border. */
  darkShadowOpacityMultiplier: 0.5,
  android: { e1: 2, e2: 6, e3: 12 },
  floats: ['hero', 'dock', 'fab', 'tray', 'sheets', 'toast'],
  blur: {
    dockCapsule: { opacity: 0.92, radiusPt: 12, fallback: 'solid surface on low-end Android' },
  },
} as const;

/** Minimum scrim stop required behind white text on a featured gradient
 * (Tokens.json color.rules). */
export const FEATURED_TEXT_SCRIM_MIN = 'rgba(0,0,0,0.13)';

// ---------------------------------------------------------------------------
// Wave 1B — ink and surfaces that sit ON a featured gradient
// ---------------------------------------------------------------------------
//
// WHY THESE ROLES EXIST. A featured gradient is dark in BOTH schemes (see
// STYLE_SCOPED_COLORS.*.featured), so text on it is white in both. The
// existing `onInteractive` role cannot serve here: it is #FFFFFF in light
// but #0F1722 in dark, which would turn every hero headline near-black on a
// dark gradient. Design 5.1 states the correct value directly — doc B p.1,
// "featured.* per style … Text on featured: #FFFFFF over a ≥#00000022
// scrim stop" — so these are transcriptions, not new design decisions.

/** Solid ink on a featured gradient. Doc B p.1. Scheme-invariant. */
export const ON_FEATURED = '#FFFFFF';

/**
 * Positive-movement ink on a featured or otherwise dark surface.
 *
 * SOURCE: Tokens.json pairs toastBg '#1E2E38' with toastAction '#7FC7A4' and
 * declares both scheme-invariant — i.e. #7FC7A4 is the design's own
 * positive/success ink for a dark surface. The colour rules also reserve
 * green for "success/positive movement" only. The scheme-scoped
 * movementPositive cannot be used on a gradient: its light value (#1E7A55)
 * is a dark green that would be illegible on navy.
 */
export const ON_FEATURED_POSITIVE = '#7FC7A4';

/**
 * White ink or translucent white surface on a featured gradient, at a given
 * opacity.
 *
 * The opacity TIERS are not specified by Design 5.1 — the design describes
 * one hero composition, not a scale of on-gradient inks. Wave 1B therefore
 * preserves each surface's existing opacity exactly rather than snapping
 * values to an invented scale, which would be an unreviewed visual change.
 * The COLOUR is centralised here; the weight stays with the surface until
 * the hero restyles in Waves 5-9 replace these compositions outright.
 */
export function onFeaturedAlpha(alpha: number): string {
  return `rgba(255,255,255,${alpha})`;
}

/**
 * The scrim hue for a given scheme, at a specified weight.
 *
 * `SHARED_COLORS[scheme].scrim` is the canonical scrim and should be used
 * directly wherever a standard scrim is wanted. This helper exists only for
 * the two celebration surfaces that historically use a heavier veil (0.5
 * and 0.85): it keeps them on the design's own scrim hue while preserving
 * their existing weight, instead of either inventing a `scrimStrong` value
 * or silently lightening a full-screen overlay.
 */
export function scrimAt(scheme: DesignScheme, alpha: number): string {
  // Base hues taken from SHARED_COLORS[scheme].scrim.
  return scheme === 'dark' ? `rgba(0,0,0,${alpha})` : `rgba(16,25,34,${alpha})`;
}

/**
 * The black scrim stop that sits between a featured gradient and white text
 * (Tokens.json color.rules: "Text on featured gradients sits on a scrim
 * stop of at least rgba(0,0,0,0.13)"). Distinct from the surface scrim
 * above, which veils a whole screen behind a sheet.
 */
export function featuredScrimAt(alpha: number): string {
  return `rgba(0,0,0,${alpha})`;
}

// ---------------------------------------------------------------------------
// Derived component role catalogue (blocker C-3 — derived, not supplied)
// ---------------------------------------------------------------------------

export type ComponentRoleRef =
  | { kind: 'shared'; role: keyof SharedColorRoles; note?: string }
  | { kind: 'styleScoped'; role: keyof StyleScopedColorRoles; note?: string }
  | { kind: 'literal'; value: string; note?: string }
  | { kind: 'platform'; note: string };

/** One entry per component named in Tokens.json componentThemeMatrix,
 * re-expressed as structured role references so the values can actually be
 * resolved. The source file lists these as free-text strings such as
 * "bgSurface(blur .92)" and "#8A9BAD(series2)", which cannot be resolved
 * programmatically; the parenthetical qualifiers are preserved as notes. */
export const COMPONENT_ROLE_CATALOGUE: Readonly<Record<string, readonly ComponentRoleRef[]>> = {
  screenShell: [
    { kind: 'shared', role: 'bgCanvas' },
    { kind: 'styleScoped', role: 'ambient' },
    { kind: 'shared', role: 'textTitle' },
    { kind: 'shared', role: 'textSecondary' },
    { kind: 'shared', role: 'border' },
  ],
  dock: [
    { kind: 'shared', role: 'bgSurface', note: 'blur 0.92' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'interactive' },
    { kind: 'shared', role: 'interactiveTint' },
    { kind: 'shared', role: 'textTertiary' },
  ],
  fab: [
    { kind: 'styleScoped', role: 'featured' },
    { kind: 'shared', role: 'onInteractive' },
  ],
  tray: [
    { kind: 'shared', role: 'bgSurface' },
    { kind: 'shared', role: 'scrim' },
    { kind: 'shared', role: 'interactiveTint', note: 'tiles' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'textPrimary' },
  ],
  workspace: [
    { kind: 'shared', role: 'bgSurface' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'interactive' },
    { kind: 'shared', role: 'infoTint', note: 'consequence preview' },
    { kind: 'shared', role: 'warningTint', note: 'error' },
    { kind: 'styleScoped', role: 'featured', note: 'save button' },
  ],
  infoSheet: [
    { kind: 'shared', role: 'bgSurface' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'textPrimary' },
    { kind: 'shared', role: 'textSecondary' },
  ],
  picker: [{ kind: 'platform', note: 'platform native, follows scheme' }],
  fields: [
    { kind: 'shared', role: 'bgSurface' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'interactive', note: 'focus' },
    { kind: 'shared', role: 'warning', note: 'error' },
    { kind: 'shared', role: 'textPrimary' },
    { kind: 'shared', role: 'textTertiary', note: 'placeholder' },
  ],
  rows: [
    { kind: 'shared', role: 'bgSurface' },
    { kind: 'shared', role: 'bgRaised', note: 'pressed' },
    { kind: 'shared', role: 'border' },
    { kind: 'shared', role: 'textPrimary' },
    { kind: 'shared', role: 'textSecondary' },
    { kind: 'shared', role: 'movementPositive' },
  ],
  hero: [
    { kind: 'styleScoped', role: 'heroSurface' },
    { kind: 'styleScoped', role: 'heroBorder' },
    { kind: 'shared', role: 'textFigure' },
    { kind: 'shared', role: 'textSecondary' },
  ],
  charts: [
    { kind: 'shared', role: 'interactive', note: 'series 1' },
    { kind: 'literal', value: '#8A9BAD', note: 'series 2 (slate; specified as a literal in the export)' },
  ],
  progress: [
    { kind: 'shared', role: 'bgRaised', note: 'track' },
    { kind: 'shared', role: 'success', note: 'fill: goal' },
    { kind: 'shared', role: 'interactive', note: 'fill: generic' },
    { kind: 'shared', role: 'warningAccent', note: 'fill: tight stretch' },
  ],
  statusChips: [
    { kind: 'shared', role: 'successTint' },
    { kind: 'shared', role: 'successBorder' },
    { kind: 'shared', role: 'success' },
    { kind: 'shared', role: 'warningTint' },
    { kind: 'shared', role: 'warningBorder' },
    { kind: 'shared', role: 'warning' },
    { kind: 'shared', role: 'urgentTint' },
    { kind: 'shared', role: 'urgent' },
    { kind: 'shared', role: 'infoTint' },
    { kind: 'shared', role: 'infoBorder' },
    { kind: 'shared', role: 'infoText' },
  ],
};

/** Disabled treatment is opacity-based and shape-stable, never a colour
 * swap — so it is a constant, not a role reference. */
export const DISABLED_OPACITY = 0.45;

export interface ResolvedComponentRole {
  role: string;
  value: string | readonly string[];
  note?: string;
}

/** Produce the resolved value for every role a component consumes, in one
 * theme. This is the derivation that stands in for the absent
 * Tokens.json §components matrix. */
export function resolveComponentRoles(
  component: keyof typeof COMPONENT_ROLE_CATALOGUE,
  style: DesignColorStyle,
  scheme: DesignScheme
): ResolvedComponentRole[] {
  const colors = resolveSemanticColors(style, scheme);
  return COMPONENT_ROLE_CATALOGUE[component].map((ref) => {
    switch (ref.kind) {
      case 'shared':
        return { role: ref.role, value: colors[ref.role], note: ref.note };
      case 'styleScoped':
        return { role: ref.role, value: colors[ref.role], note: ref.note };
      case 'literal':
        return { role: 'literal', value: ref.value, note: ref.note };
      case 'platform':
        return { role: 'platform', value: ref.note, note: ref.note };
    }
  });
}

/** The full derived six-theme catalogue: every component, every theme. */
export function buildComponentThemeMatrix(): Record<
  string,
  Record<string, ResolvedComponentRole[]>
> {
  const out: Record<string, Record<string, ResolvedComponentRole[]>> = {};
  for (const component of Object.keys(COMPONENT_ROLE_CATALOGUE)) {
    out[component] = {};
    for (const { style, scheme } of DESIGN_THEME_MATRIX) {
      out[component][`${style}/${scheme}`] = resolveComponentRoles(component, style, scheme);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Add-icon decorative tones (Design 5.1 Wave 4 closure)
// ---------------------------------------------------------------------------

/**
 * The owner's second recording showed the new Ionicons system reading as
 * structurally correct but uniformly grey/pale — every domain the same
 * weight, so nothing was scannable. These are the six restrained tone
 * families that give the Add journey quiet category differentiation.
 *
 * They are IDENTITY accents, never financial status:
 *
 * - `coral` is deliberately NOT the destructive/error red. Debt is a normal
 *   part of a money picture, not an error, and reusing the error role would
 *   say otherwise every time a customer opened the catalogue. It is a muted,
 *   desaturated warm tone that shares no value with `danger`.
 * - `mint` must not be read as "success". Income and savings get a green
 *   family because that is the conventional colour for money coming in, not
 *   because anything succeeded, so it is deliberately softer and cooler than
 *   the `success` role.
 *
 * Selection state continues to be carried by border, fill and tick. These
 * tones never carry it, and nothing here is the sole indicator of anything.
 */
export type AddIconToneName = 'ocean' | 'teal' | 'mint' | 'amber' | 'violet' | 'coral';

export interface AddIconTonePair {
  /** The glyph colour — the stronger member of the family. */
  fg: string;
  /** The tile behind it — the softly tinted member. */
  bg: string;
}

export const ADD_ICON_TONE_NAMES: readonly AddIconToneName[] = ['ocean', 'teal', 'mint', 'amber', 'violet', 'coral'];

/**
 * Scheme-scoped rather than style-scoped, deliberately: these are a fixed
 * taxonomy of domains, not brand accents, so an item keeps the same tone
 * whichever of the three colour styles the customer has chosen. All six
 * themes (3 styles x 2 schemes) therefore resolve every family.
 *
 * Light values are low-saturation on a near-white tile; dark values lift the
 * glyph and drop the tile to a translucent wash so it never glows.
 */
export const ADD_ICON_TONES: Readonly<Record<DesignScheme, Readonly<Record<AddIconToneName, AddIconTonePair>>>> = {
  light: {
    ocean: { fg: '#2C5F92', bg: '#E7EFF7' },
    teal: { fg: '#1F6B6E', bg: '#E3F0F0' },
    mint: { fg: '#2A6B4F', bg: '#E6F1EB' },
    amber: { fg: '#8A6316', bg: '#F6EEDF' },
    violet: { fg: '#5A4A8C', bg: '#EDEAF6' },
    coral: { fg: '#96524B', bg: '#F6E9E7' },
  },
  dark: {
    ocean: { fg: '#8FB6DC', bg: 'rgba(143,182,220,0.16)' },
    teal: { fg: '#7FC2C4', bg: 'rgba(127,194,196,0.16)' },
    mint: { fg: '#8CC3A6', bg: 'rgba(140,195,166,0.16)' },
    amber: { fg: '#D8B473', bg: 'rgba(216,180,115,0.16)' },
    violet: { fg: '#AEA2D9', bg: 'rgba(174,162,217,0.16)' },
    coral: { fg: '#D2A09A', bg: 'rgba(210,160,154,0.16)' },
  },
};

/** The tone pair for a scheme, never throwing on an unknown name. */
export function resolveAddIconTone(scheme: DesignScheme, tone: AddIconToneName): AddIconTonePair {
  return ADD_ICON_TONES[scheme][tone] ?? ADD_ICON_TONES[scheme].ocean;
}
