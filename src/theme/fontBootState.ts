// Nolie Design 5.1 — font bootstrap state machine (pure).
//
// WAVE 1A. Deliberately split out of fonts.ts and kept free of every
// react-native / expo import so the legacy tsx harness can execute it for
// real (see tests/README.md: anything reaching react-native cannot be
// imported there). fonts.ts holds the expo-font + expo-splash-screen
// wiring; ALL of the decision logic lives here, so the pending / loaded /
// error branches are proven behaviourally rather than by regex.
//
// The product rule this encodes (Tokens.json typography.locales.loadFailure,
// handoff §8.1): a font failure must NEVER block launch. On error the app
// renders immediately using platform defaults and logs once.

export type FontBootStatus = 'pending' | 'loaded' | 'error';

export interface FontBootState {
  status: FontBootStatus;
  /** Whether the app tree may mount. False only while genuinely pending. */
  shouldRenderApp: boolean;
  /** Whether the native splash may be dismissed. */
  shouldReleaseSplash: boolean;
  /** True when we are rendering on platform fallbacks rather than the
   * bundled families — the app still works, it just is not Figtree. */
  usingFallbackFonts: boolean;
}

export interface FontBootInput {
  fontsLoaded: boolean;
  fontError: Error | null;
}

/**
 * Resolve the boot state.
 *
 * An error takes precedence over `fontsLoaded`: expo-font can report a
 * partial load alongside an error, and in that situation we must still
 * take the fallback path rather than claim success.
 *
 * There is deliberately NO timeout branch. A timing-based fallback would
 * make launch behaviour depend on how fast the device happens to be, which
 * is exactly the class of non-determinism the Design 5.1 motion rules
 * forbid ("no behaviour may depend on an animation having run"; the same
 * reasoning applies to load races).
 */
export function resolveFontBootState({ fontsLoaded, fontError }: FontBootInput): FontBootState {
  if (fontError) {
    return {
      status: 'error',
      shouldRenderApp: true,
      shouldReleaseSplash: true,
      usingFallbackFonts: true,
    };
  }
  if (fontsLoaded) {
    return {
      status: 'loaded',
      shouldRenderApp: true,
      shouldReleaseSplash: true,
      usingFallbackFonts: false,
    };
  }
  return {
    status: 'pending',
    shouldRenderApp: false,
    shouldReleaseSplash: false,
    usingFallbackFonts: false,
  };
}

/** The single log line emitted on the failure path, once. */
export const FONT_LOAD_FAILURE_MESSAGE =
  '[Nolie] Bundled fonts failed to load; rendering with platform default fonts.';
