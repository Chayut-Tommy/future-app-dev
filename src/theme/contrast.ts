// Nolie Design 5.1 — WCAG contrast computation.
//
// WAVE 1A: ADDITIVE. Owner decision 3 (blocker C-4): Design doc A p.14
// quotes five key contrast pairs and states "Full table in Tokens.json",
// but the shipped Tokens.json contains no contrast table at all. Rather
// than block on another Claude Design response, the ratios are COMPUTED
// LOCALLY here and asserted against the doc A p.14 floors by
// tests/design5-contrast.test.ts.
//
// This module does NOT modify or replace src/theme/contrastOverrides.ts,
// which stays exactly as it is until Wave 1B.
//
// Pure and RN-free so the legacy tsx harness can import it for real.

/** Design 5.1 / WCAG 2.1 AA floors, doc A p.14. */
export const CONTRAST_FLOORS = {
  /** Body text on its own surface, including ambient tops and gradient scrims. */
  body: 4.5,
  /** Large financial figures. Doc A notes all shipped pairs actually clear 4.5. */
  largeFigure: 3.0,
  /** Icons and chrome. */
  iconChrome: 3.0,
} as const;

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0..1; 1 when the source colour was opaque. */
  a: number;
}

/**
 * Parse `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)` or `rgba(...)`.
 * Throws on anything else — silently returning black would turn a typo
 * into a passing contrast assertion, which is exactly the failure mode
 * this module exists to prevent.
 */
export function parseColor(input: string): Rgb {
  const value = input.trim();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    throw new Error(`Unparseable hex colour: ${input}`);
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      throw new Error(`Unparseable rgb/rgba colour: ${input}`);
    }
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  throw new Error(`Unparseable colour: ${input}`);
}

/** Composite a possibly-translucent foreground over an opaque background. */
export function compositeOver(foreground: string, background: string): Rgb {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function channelLuminance(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === 'string' ? parseColor(color) : color;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * WCAG 2.1 contrast ratio, 1..21. Translucent inputs are composited over
 * `background` first — a ratio computed against an uncomposited alpha
 * colour is meaningless.
 */
export function contrastRatio(foreground: string, background: string): number {
  const fg = compositeOver(foreground, background);
  const bg = parseColor(background);
  if (bg.a < 1) {
    throw new Error(`Background must be opaque to compute a meaningful ratio: ${background}`);
  }
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Round to 2dp for stable reporting without hiding a near-miss. */
export function ratio2dp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function meetsFloor(foreground: string, background: string, floor: number): boolean {
  return contrastRatio(foreground, background) >= floor;
}

/**
 * The five key pairs quoted verbatim in Design doc A p.14. These are the
 * design's own published numbers; the test asserts our computation agrees
 * with them, which validates the maths against an independent source
 * rather than only against itself.
 */
export const DOC_A_QUOTED_PAIRS: readonly {
  foreground: string;
  background: string;
  quotedRatio: number;
  label: string;
}[] = [
  { foreground: '#1B4177', background: '#DCE9F8', quotedRatio: 8.1, label: 'textFigure on ocean ambient (light)' },
  { foreground: '#6E4B14', background: '#FAF3E4', quotedRatio: 6.9, label: 'warning ink on warningTint (light)' },
  { foreground: '#14533B', background: '#F1F8F4', quotedRatio: 8.3, label: 'success ink on successTint (light)' },
  { foreground: '#BFD7F2', background: '#16243A', quotedRatio: 9.6, label: 'textFigure on ocean ambient (dark)' },
  { foreground: '#E3B877', background: '#1F1710', quotedRatio: 7.2, label: 'warning on sunrise ambient (dark)' },
];
