// Nolie Design 5.1 Wave 1A — font bootstrap wiring (rendered).
//
// CLASSIFICATION (per tests/README.md):
// - Rendered (RNTL/jest-expo): really mounts a component that calls the
//   real useFontBootstrap hook from src/theme/fonts.ts, with expo-font and
//   expo-splash-screen mocked so the pending / loaded / error branches are
//   deterministic.
// - The decision logic itself is proven separately and purely in
//   tests/design5-font-boot-state.test.ts. This file proves the WIRING: that
//   the hook actually calls SplashScreen.hideAsync on each terminal
//   outcome, logs the failure exactly once, and never leaves the splash up.
// - NOT proven here: that the native splash truly disappears on a device,
//   or that the .ttf assets parse. Those are device evidence.
//
// "Airplane mode" is deliberately NOT simulated here: it verifies that the
// bundled assets are local (no network), which is a device check, not an
// error branch.

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

// The mock factories must CREATE the jest.fn()s themselves. ES imports are
// hoisted above const declarations, and fonts.ts calls
// preventAutoHideAsync at module scope — so a factory closing over an
// outer const would run before that const was initialised.
jest.mock('expo-font', () => ({
  useFonts: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useFontBootstrap, FONT_ASSETS, FONT_ASSET_NAMES } from '../../src/theme/fonts';

const mockUseFonts = Font.useFonts as unknown as jest.Mock;
const mockHideAsync = SplashScreen.hideAsync as unknown as jest.Mock;
const mockPreventAutoHideAsync = SplashScreen.preventAutoHideAsync as unknown as jest.Mock;

function Probe() {
  const state = useFontBootstrap();
  return <Text testID="state">{`${state.status}|${state.shouldRenderApp}|${state.usingFallbackFonts}`}</Text>;
}

describe('Design 5.1 Wave 1A — font bootstrap wiring', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockUseFonts.mockReset();
    mockHideAsync.mockClear();
    mockPreventAutoHideAsync.mockClear();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('loads exactly the eight faces the type system needs, and no italics', () => {
    expect(FONT_ASSET_NAMES).toHaveLength(8);
    expect(FONT_ASSET_NAMES.filter((n) => n.startsWith('Figtree_'))).toHaveLength(4);
    expect(FONT_ASSET_NAMES.filter((n) => n.startsWith('NotoSansThai_'))).toHaveLength(4);
    // Only 400/500/600/700 — the package index would bring nine weights
    // plus every italic.
    for (const weight of ['400', '500', '600', '700']) {
      expect(FONT_ASSET_NAMES.some((n) => n.startsWith(`Figtree_${weight}`))).toBe(true);
      expect(FONT_ASSET_NAMES.some((n) => n.startsWith(`NotoSansThai_${weight}`))).toBe(true);
    }
    expect(FONT_ASSET_NAMES.some((n) => n.toLowerCase().includes('italic'))).toBe(false);
    expect(Object.keys(FONT_ASSETS)).toEqual(FONT_ASSET_NAMES);
  });

  it('holds the splash while loading is pending, and does not render the app', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    await render(<Probe />);
    expect(screen.getByTestId('state').props.children).toBe('pending|false|false');
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it('releases the splash and renders once fonts load', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    await render(<Probe />);
    expect(screen.getByTestId('state').props.children).toBe('loaded|true|false');
    await waitFor(() => expect(mockHideAsync).toHaveBeenCalledTimes(1));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('on a font error still releases the splash, still renders, and logs once', async () => {
    mockUseFonts.mockReturnValue([false, new Error('font asset missing')]);
    await render(<Probe />);
    // The app is NOT blocked by a font failure.
    expect(screen.getByTestId('state').props.children).toBe('error|true|true');
    await waitFor(() => expect(mockHideAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(String(warnSpy.mock.calls[0][0])).toContain('platform default');
  });

  it('logs the failure only once across re-renders', async () => {
    mockUseFonts.mockReturnValue([false, new Error('font asset missing')]);
    await render(<Probe />);
    await screen.rerender(<Probe />);
    await screen.rerender(<Probe />);
    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
  });

  it('hides the splash only once even across re-renders', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    await render(<Probe />);
    await screen.rerender(<Probe />);
    await screen.rerender(<Probe />);
    await waitFor(() => expect(mockHideAsync).toHaveBeenCalledTimes(1));
  });

  it('survives a rejected hideAsync without throwing', async () => {
    mockHideAsync.mockImplementationOnce(() => Promise.reject(new Error('already hidden')));
    mockUseFonts.mockReturnValue([true, null]);
    await expect(render(<Probe />)).resolves.toBeDefined();
    await waitFor(() => expect(mockHideAsync).toHaveBeenCalledTimes(1));
  });
});
