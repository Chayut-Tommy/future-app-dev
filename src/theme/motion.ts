// Nolie Design 5.1 — named motion constants.
//
// WAVE 1A: ADDITIVE ONLY, BY OWNER DECISION. Nothing in this file is wired
// to a component yet. No existing animation changes, no Add-transition
// changes, no raw-duration migration. It ships now purely so Waves 2-10
// consume NAMED tokens from their first commit instead of retrofitting them
// after the fact (see docs/Nolie_Design_5_1_Owner_Decisions_2026-08-17.md).
//
// Values transcribed from the verified exports
// Nolie_Design_5_Motion_Accessibility.md and Nolie_Design_5_Tokens.json
// (motion.ms / motion.curves / motion.hardRules).
//
// Pure and RN-free so the legacy tsx harness can import it for real.

/** Two curves only. Entrances use `standard`; exits use `exit`. */
export const MOTION_CURVES = {
  standard: 'cubic-bezier(0.2,0.9,0.25,1)',
  exit: 'ease-in',
  /** Pure opacity changes are linear. */
  linear: 'linear',
} as const;

/** The cubic-bezier control points, for consumers that need numbers rather
 * than the CSS-style string (React Native's Easing.bezier takes four). */
export const STANDARD_BEZIER: readonly [number, number, number, number] = [0.2, 0.9, 0.25, 1];

export type MotionToken =
  | 'press' | 'select' | 'deselect'
  | 'tabIndicator' | 'fabMorph'
  | 'trayOpen' | 'trayClose'
  | 'workspaceIn' | 'workspaceOut'
  | 'stepOut' | 'stepIn' | 'stepStagger' | 'inputBlock'
  | 'screenReveal' | 'revealStagger'
  | 'ambientSettle'
  | 'checkDraw' | 'rowPlace' | 'rowTintHold'
  | 'figureCrossfade' | 'figureCountMin' | 'figureCountMax'
  | 'progressFill' | 'cardExpand'
  | 'focusScroll' | 'focusTint'
  | 'toastIn' | 'toastOut' | 'toastLife'
  | 'celebration'
  | 'dockShowHide'
  | 'sheetInfoIn' | 'sheetInfoOut'
  | 'themeSwitch';

/** All durations in milliseconds. These are starting targets pending
 * physical-device verification in Wave 10 — tune globally here, never per
 * screen. */
export const MOTION_MS: Readonly<Record<MotionToken, number>> = {
  press: 150,
  select: 140,
  deselect: 100,
  tabIndicator: 180,
  fabMorph: 180,
  trayOpen: 220,
  trayClose: 165,
  workspaceIn: 320,
  workspaceOut: 240,
  stepOut: 200,
  stepIn: 160,
  stepStagger: 40,
  inputBlock: 260,
  screenReveal: 360,
  revealStagger: 60,
  ambientSettle: 560,
  checkDraw: 260,
  rowPlace: 420,
  rowTintHold: 3000,
  figureCrossfade: 240,
  figureCountMin: 450,
  figureCountMax: 700,
  progressFill: 380,
  cardExpand: 240,
  focusScroll: 320,
  focusTint: 1200,
  toastIn: 260,
  toastOut: 200,
  toastLife: 3400,
  celebration: 360,
  dockShowHide: 160,
  sheetInfoIn: 280,
  sheetInfoOut: 200,
  themeSwitch: 0,
};

export const MOTION_TOKEN_NAMES = Object.keys(MOTION_MS) as MotionToken[];

/** Figures only count up for deltas above this amount; smaller changes
 * crossfade. Never counts from zero on a revisit. */
export const FIGURE_COUNT_MIN_DELTA_DOLLARS = 500;

/** Press scales to this, and no further. */
export const PRESS_SCALE = 0.97;

/** Travel distances (pt). Opacity/transform only — height is animated only
 * for keyboard-following and cardExpand. */
export const MOTION_TRAVEL_PT = {
  trayRise: 12,
  stepTravelX: 24,
  screenRevealRise: 10,
  rowPlaceRise: 8,
  figureCrossfadeRise: 8,
  toastRise: 10,
  dockDrop: 8,
  iconLift: 2,
  /** A dirty draft arrests a swipe-down at this fraction of travel and
   * raises the discard confirm inside the sheet. */
  dirtySwipeArrestFraction: 0.3,
} as const;

// ---------------------------------------------------------------------------
// Reduced Motion
// ---------------------------------------------------------------------------

/**
 * Reduced Motion is a PARALLEL BUILD, not shorter durations. The construction
 * rule (doc C p.3) is absolute: no behaviour may depend on an animation
 * having run — guards, locks, focus moves and announcements are all
 * state-driven, so RM is the same product minus the motion layer.
 */
export const REDUCED_MOTION_MS: Readonly<Partial<Record<MotionToken, number>>> = {
  // Kept: press/select are state changes, not motion.
  press: MOTION_MS.press,
  select: MOTION_MS.select,
  deselect: MOTION_MS.deselect,
  // Sheets and tray: a short fade with zero travel. Sequencing is identical.
  trayOpen: 120,
  trayClose: 120,
  workspaceIn: 120,
  workspaceOut: 120,
  sheetInfoIn: 120,
  sheetInfoOut: 120,
  // Everything else renders its final state immediately.
  tabIndicator: 0,
  fabMorph: 0,
  stepOut: 0,
  stepIn: 0,
  stepStagger: 0,
  screenReveal: 0,
  revealStagger: 0,
  ambientSettle: 0,
  checkDraw: 0,
  rowPlace: 0,
  figureCrossfade: 0,
  progressFill: 0,
  cardExpand: 0,
  focusScroll: 0,
  celebration: 0,
  dockShowHide: 0,
  themeSwitch: 0,
  toastIn: 0,
  toastOut: 0,
};

/** RM replaces the focus-reveal tint bloom with a longer static border. */
export const REDUCED_MOTION_FOCUS_BORDER_MS = 4000;

/**
 * Input-blocking and hold durations are NOT reduced: they are behavioural
 * guards, not decoration. Shortening them under RM would change what the
 * product does, which the construction rule forbids.
 */
export const REDUCED_MOTION_PRESERVED: readonly MotionToken[] = [
  'inputBlock',
  'rowTintHold',
  'toastLife',
  'focusTint',
];

/** Resolve a duration for the current Reduced Motion preference. */
export function resolveDuration(token: MotionToken, reduceMotion: boolean): number {
  if (!reduceMotion) return MOTION_MS[token];
  if (REDUCED_MOTION_PRESERVED.includes(token)) return MOTION_MS[token];
  const override = REDUCED_MOTION_MS[token];
  return override === undefined ? MOTION_MS[token] : override;
}

export function resolveCurve(kind: 'enter' | 'exit' | 'opacity'): string {
  if (kind === 'exit') return MOTION_CURVES.exit;
  if (kind === 'opacity') return MOTION_CURVES.linear;
  return MOTION_CURVES.standard;
}

// ---------------------------------------------------------------------------
// Hard rules
// ---------------------------------------------------------------------------

/**
 * Verbatim from Tokens.json motion.hardRules plus doc C's fifth rule. Kept
 * in code so the constraints travel with the constants. Rule 1 is a
 * REGRESSION GATE, not taste: animated tab scenes previously caused blank
 * scenes on device. Rule 2 is the modal-freeze invariant.
 */
export const MOTION_HARD_RULES: readonly string[] = [
  'No tab-scene animation; indicator + in-destination reveals only',
  'Single native modal at a time; workspace mounts only on tray onClosed (state, never timeout)',
  'Figures animate only on changed engine results; never count from zero on visit',
  'Opacity/transform only for travel; height animation only for keyboard-following and cardExpand',
  'No behaviour may depend on an animation having run (guards, locks, focus and announcements are state-driven)',
];

// ---------------------------------------------------------------------------
// Wave 10 — consolidated presentation constants
// ---------------------------------------------------------------------------

/** The owner-approved celebration-toast dwell pair (post-Wave-9c device
 * round): a plain confirmation holds 3,200ms, a structured milestone
 * 3,600ms. Supersedes the doc-C `toastLife` (3,400) for the CELEBRATION
 * tier only — the plain shared/Toast keeps `toastLife`. Named here so no
 * component carries a raw dwell literal. */
export const TOAST_LIFE_PLAIN_MS = 3200;
export const TOAST_LIFE_MILESTONE_MS = 3600;

/** KeyboardSheet's shipped content-entrance duration (device-tuned in the
 * reminder work, transcribed from the implementation — not a doc-C token).
 * Applies to the opt-in `animateContentEntrance` fade/settle only. */
export const SHEET_CONTENT_ENTRANCE_MS = 200;

/** Slide-a-sheet-fully-off-screen travel used by the self-animated bottom
 * sheets (OptionsSheet, AskLuluSheet). Geometry, not feel — named so the
 * literal lives in exactly one place. */
export const SHEET_OFFSCREEN_TRAVEL_PT = 800;

/** Four haptic events exist. Nothing else, ever. */
export const HAPTICS = {
  light: 'selection (tile/chip/date/option)',
  softSuccess: 'engine-confirmed save (once; shared with any celebration)',
  warning: 'blocked action / destructive confirm shown / save failure',
  rigid: 'confirmed deletion or reset',
} as const;

export const HAPTICS_FORBIDDEN: readonly string[] = [
  'scroll',
  'tab taps',
  'number changes',
  'score movement',
  'toast echo',
];

/** Generic Undo is out of scope in 5.1 and requires its own persistence and
 * reversal specification before it can return. */
export const MOTION_DEFERRED = {
  genericUndo:
    'Removed from implementation scope in 5.1; requires separate persistence/reversal specification',
} as const;
