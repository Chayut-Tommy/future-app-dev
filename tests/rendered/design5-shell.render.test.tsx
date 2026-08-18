// Nolie Design 5.1 Wave 2 — Screen shell + dock restyle (rendered).
//
// CLASSIFICATION: rendered (RNTL/jest-expo). Mounts the real Screen shell.
// NOT proven here: real blur rendering, real device scroll physics, or how
// the capsule looks — those stay device evidence.

import React from 'react';
import { Platform, Text, View } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, LARGE_TITLE_COLLAPSE_THRESHOLD, COLLAPSED_TITLE_BAR_HEIGHT } from '../../src/components/shared/Screen';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function wrap(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppStateProvider>
        <ThemeProvider>{ui}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const scrollTo = (y: number) => ({ nativeEvent: { contentOffset: { y }, contentSize: { height: 2000, width: 390 }, layoutMeasurement: { height: 844, width: 390 } } });


const ROOT = require('path').resolve(__dirname, '../..');
const read = (rel: string) => require('fs').readFileSync(require('path').join(ROOT, rel), 'utf8');
const readCode = (rel: string) => read(rel).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const { screenBottomClearance } = require('../../src/navigation/floatingNavGeometry');

describe('Design 5.1 Wave 2 — Screen shell', () => {
  // ONE mounted root for every rendered assertion, varied with `rerender`.
  //
  // PROVEN ENVIRONMENT LIMIT (probe, this repo, RNTL 14 + React 19 +
  // jest-expo, real timers): from the THIRD `render()` in a single Jest file
  // no tree mounts at all — effects never fire and even synchronous queries
  // miss — and the file stays poisoned for every later render. It reproduces
  // with a bare <Text> and no providers, so it is neither AppStateProvider,
  // AsyncStorage nor this shell. `rerender` reuses the existing root, so it
  // is unaffected. Every assertion below is retained; only the number of
  // roots changed.
  it('shell: legacy compatibility, ambient, large-title collapse, clearance and FlatList variant', async () => {
    // --- 1. Legacy consumer: no opt-in props, behaviour unchanged ---------
    const r = await render(wrap(<Screen title="Money"><Text>shell-body</Text></Screen>));
    expect(r.getByText('shell-body')).toBeOnTheScreen();
    expect(r.getAllByText('Money', { includeHiddenElements: true })).toHaveLength(1);
    expect(r.queryByTestId('screen-collapsed-title')).toBeNull();
    expect(r.queryByTestId('ambient')).toBeNull();

    // --- 2. Bottom clearance keeps content above the dock and "+" ---------
    const sv = r.getByTestId('screen-scroll');
    const padding = ([] as any[]).concat(sv.props.contentContainerStyle).filter(Boolean);
    expect(padding.some((st) => st && st.paddingBottom === screenBottomClearance(METRICS.insets.bottom))).toBe(true);
    // 34pt home indicator + 8 offset + 64 dock + 8 cushion.
    expect(screenBottomClearance(METRICS.insets.bottom)).toBe(114);

    // --- 3. Ambient slot present, then absent again -----------------------
    await r.rerender(wrap(<Screen title="Money" ambient={<View testID="ambient" />}><Text>shell-body</Text></Screen>));
    expect(r.getByTestId('ambient')).toBeOnTheScreen();
    // Decorative only — it must never intercept touches.
    expect(r.getByTestId('ambient').parent?.props.pointerEvents).toBe('none');
    await r.rerender(wrap(<Screen title="Money"><Text>shell-body</Text></Screen>));
    expect(r.queryByTestId('ambient')).toBeNull();

    // --- 4. Large title, expanded: no pinned bar, title announced once ----
    await r.rerender(wrap(<Screen title="Wealth" largeTitle><Text>shell-body</Text></Screen>));
    expect(r.queryByTestId('screen-collapsed-title')).toBeNull();
    expect(r.getAllByText('Wealth', { includeHiddenElements: true })).toHaveLength(1);

    // --- 5. Below the 56pt threshold: still expanded ----------------------
    const lsv = r.getByTestId('screen-scroll');
    fireEvent.scroll(lsv, scrollTo(LARGE_TITLE_COLLAPSE_THRESHOLD - 1));
    await waitFor(() => expect(r.queryByTestId('screen-collapsed-title')).toBeNull());

    // --- 6. At the threshold: bar mounts, exposed to AT immediately -------
    fireEvent.scroll(lsv, scrollTo(LARGE_TITLE_COLLAPSE_THRESHOLD));
    const bar = await waitFor(() => r.getByTestId('screen-collapsed-title'));
    expect(bar).toBeOnTheScreen();
    // Reduced Motion parity by construction: no animation gates this, so the
    // bar is a real AT target on the same frame as the state change.
    expect(r.getAllByText('Wealth', { includeHiddenElements: false }).length).toBeGreaterThanOrEqual(2);
    const barStyle = ([] as any[]).concat(bar.props.style).filter(Boolean);
    expect(barStyle.some((st) => st && st.height === COLLAPSED_TITLE_BAR_HEIGHT)).toBe(true);
    // Absolutely positioned => the large title never leaves the flow, so
    // nothing reflows at the threshold.
    expect(barStyle.some((st) => st && st.position === 'absolute')).toBe(true);

    // --- 7. Back to the top: unmounts, single announcement restored -------
    fireEvent.scroll(lsv, scrollTo(0));
    await waitFor(() => expect(r.queryByTestId('screen-collapsed-title')).toBeNull());
    expect(r.getAllByText('Wealth', { includeHiddenElements: true })).toHaveLength(1);

    // --- 8. FlatList variant: virtualised, header + clearance shared ------
    await r.rerender(
      wrap(
        <Screen
          title="Transactions"
          list={{ data: ['a', 'b', 'c'], keyExtractor: (i: string) => i, renderItem: ({ item }: { item: string }) => <Text>{`row-${item}`}</Text> }}
        >
          <Text>ignored</Text>
        </Screen>
      )
    );
    const list = r.getByTestId('screen-list');
    expect(list).toBeOnTheScreen();
    // A real FlatList: it virtualises rather than rendering children.
    expect(list.props.getItem).toBeDefined();
    expect(r.getByText('Transactions')).toBeOnTheScreen();
    expect(r.getByText('row-a')).toBeOnTheScreen();
    expect(r.queryByText('ignored')).toBeNull();
    const listPadding = ([] as any[]).concat(list.props.contentContainerStyle).filter(Boolean);
    expect(listPadding.some((st) => st && st.paddingBottom === screenBottomClearance(METRICS.insets.bottom))).toBe(true);
  });

  it('documented thresholds match the design', () => {
    expect(LARGE_TITLE_COLLAPSE_THRESHOLD).toBe(56);
    expect(COLLAPSED_TITLE_BAR_HEIGHT).toBe(44);
  });

  it('Reduced Motion is identical by construction — no animation gates the collapsed state', () => {
    const code = readCode('src/components/shared/Screen.tsx');
    expect(code).toContain('setCollapsed(next)');
    expect(code).not.toContain('Animated.timing');
    expect(code).not.toContain('barOpacity');
  });

  it('scroll never drives dock visibility (structural)', () => {
    expect(/scroll|offsetY|velocity/i.test(readCode('src/navigation/dockVisibility.ts'))).toBe(false);
  });

  it('the dock uses blur on iOS only, with a non-experimental Android fallback', () => {
    const src = read('src/components/navigation/FloatingNavBar.tsx');
    const code = readCode('src/components/navigation/FloatingNavBar.tsx');
    expect(src).toContain("Platform.OS === 'ios' ?");
    expect(src).toContain('<BlurView');
    expect(/overflow: 'hidden'/.test(src)).toBe(true);
    expect(src).toContain('capsuleVeil');
    expect(code).not.toContain('dimezisBlurView');
    expect(code).not.toContain('experimentalBlurMethod');
  });

  it('only the dock capsule uses blur — no glass cards or sheets', () => {
    const { execSync } = require('child_process');
    const hits = execSync("grep -rl 'expo-blur' src --include='*.tsx' || true", { cwd: ROOT }).toString().trim();
    expect(hits).toBe('src/components/navigation/FloatingNavBar.tsx');
  });

  it('zero tab-scene animation remains (structural)', () => {
    expect(/animation:\s*'(fade|shift|slide)/.test(readCode('src/navigation/MainTabNavigator.tsx'))).toBe(false);
  });

  it('introduces no raw colour in the touched shell/dock files', () => {
    const pattern = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b|rgba?\([^)]*\)/g;
    for (const rel of [
      'src/components/shared/Screen.tsx',
      'src/components/navigation/FloatingNavBar.tsx',
      'src/components/navigation/FloatingAddButton.tsx',
    ]) {
      expect(readCode(rel).match(pattern)).toBeNull();
    }
  });

  it('introduces no new legacy colour token or platform-default font consumer', () => {
    const shell = readCode('src/components/shared/Screen.tsx');
    // New text in the shell uses the Design 5.1 locale-aware resolver.
    expect(shell).toContain('resolveTextStyle(');
    // The collapsed bar's own surface/border/ink are semantic roles.
    expect(shell).toContain('semantic.bgSurface');
    expect(shell).toContain('semantic.textTitle');
    const dock = readCode('src/components/navigation/FloatingNavBar.tsx');
    expect(dock).toContain('semantic.interactive');
    expect(dock).toContain('semantic.textTertiary');
  });
});
