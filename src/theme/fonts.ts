// Nolie Design 5.1 — font bootstrap wiring.
//
// WAVE 1A. Loads exactly the eight static faces the type system needs
// (Figtree and Noto Sans Thai at 400/500/600/700) and releases the native
// splash once loading has genuinely settled.
//
// Only the 400/500/600/700 weights are imported, via each package's
// per-weight subpath, rather than the package index — the index would pull
// in nine weights plus every italic, tripling the bundled font payload for
// faces the design never uses.
//
// Figtree carries no Thai glyphs, so both families ship together; which one
// a given piece of text uses is decided by typography.ts's resolver, not
// here. This module only makes the faces available.
//
// All decision logic lives in the pure fontBootState.ts so it is genuinely
// testable; this file is the thin expo-font / expo-splash-screen edge.

import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { NotoSansThai_400Regular } from '@expo-google-fonts/noto-sans-thai/400Regular';
import { NotoSansThai_500Medium } from '@expo-google-fonts/noto-sans-thai/500Medium';
import { NotoSansThai_600SemiBold } from '@expo-google-fonts/noto-sans-thai/600SemiBold';
import { NotoSansThai_700Bold } from '@expo-google-fonts/noto-sans-thai/700Bold';

import { FontBootState, FONT_LOAD_FAILURE_MESSAGE, resolveFontBootState } from './fontBootState';

/**
 * The face map handed to expo-font. Keys are the family names
 * typography.ts resolves to — the two must stay in step, which
 * tests/design5-typography.test.ts asserts by comparing against the same
 * constants rather than string literals.
 */
export const FONT_ASSETS = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  NotoSansThai_400Regular,
  NotoSansThai_500Medium,
  NotoSansThai_600SemiBold,
  NotoSansThai_700Bold,
} as const;

export const FONT_ASSET_NAMES = Object.keys(FONT_ASSETS);

// Hold the native splash while fonts load. Rejections are swallowed
// deliberately: preventAutoHideAsync throws if the splash has already gone
// (fast reload, or a second call in development), and a launch must never
// fail because of that.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash already hidden — not an error worth surfacing */
});

/**
 * Load the bundled families and release the splash when loading settles.
 *
 * Returns the boot state so the root can hold rendering while genuinely
 * pending. On failure the app renders on platform defaults; it is never
 * blocked, and the failure is logged exactly once.
 */
export function useFontBootstrap(): FontBootState {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const state = resolveFontBootState({ fontsLoaded, fontError: fontError ?? null });

  const hasLoggedFailure = useRef(false);
  const hasReleasedSplash = useRef(false);

  useEffect(() => {
    if (state.status === 'error' && !hasLoggedFailure.current) {
      hasLoggedFailure.current = true;
      console.warn(FONT_LOAD_FAILURE_MESSAGE, fontError);
    }
  }, [state.status, fontError]);

  useEffect(() => {
    if (!state.shouldReleaseSplash || hasReleasedSplash.current) return;
    hasReleasedSplash.current = true;
    // Same reasoning as preventAutoHideAsync: a rejected hide must not take
    // the app down with it.
    SplashScreen.hideAsync().catch(() => {
      /* splash already hidden */
    });
  }, [state.shouldReleaseSplash]);

  return state;
}
