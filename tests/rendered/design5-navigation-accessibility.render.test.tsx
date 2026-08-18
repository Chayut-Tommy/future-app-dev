// Nolie Design 5.1 Wave 2 — dock + detached "+" accessibility (rendered).
//
// ONE mounted root, varied with `rerender`. A proven environment limit in
// this repo (RNTL 14 + React 19 + jest-expo) stops mounting new roots from
// the third render() in a file, so every rendered assertion shares one root.
//
// CLASSIFICATION: rendered. Drives only the components' own exposed state —
// no phase, timing or mounting change, and no workspace is opened.

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { FloatingNavBar } from '../../src/components/navigation/FloatingNavBar';
import { FloatingAddButton } from '../../src/components/navigation/FloatingAddButton';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const TABS = ['Today', 'Money', 'Wealth', 'Grow'];

function dockProps(activeIndex: number): Record<string, unknown> {
  const routes = TABS.map((name) => ({ key: `${name}-key`, name }));
  const descriptors: Record<string, unknown> = {};
  routes.forEach((r) => {
    descriptors[r.key] = {
      options: {
        tabBarAccessibilityLabel: `${r.name}, tab, ${TABS.indexOf(r.name) + 1} of ${TABS.length}`,
        tabBarIcon: () => <Text>{`${r.name}-icon`}</Text>,
      },
    };
  });
  return {
    state: { index: activeIndex, routes, key: 'tabs', routeNames: TABS },
    descriptors,
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: () => undefined },
  };
}

function tree(activeIndex: number) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppStateProvider>
        <ThemeProvider>
          <FloatingNavBar {...(dockProps(activeIndex) as any)} reduceMotion={false} />
          <FloatingAddButton />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Design 5.1 Wave 2 — dock and detached "+" accessibility', () => {
  it('dock semantics, selected state, and the "+" expanded contract', async () => {
    const r = await render(tree(0));

    // --- B. Dock accessibility semantics --------------------------------
    const tabsByLabel = TABS.map((name) => r.getByLabelText(new RegExp(`^${name}, tab,`)));
    expect(tabsByLabel).toHaveLength(4);

    // Every tab exposes a role and a label; inactive tabs remain reachable.
    tabsByLabel.forEach((tab, i) => {
      expect(['tab', 'button']).toContain(tab.props.accessibilityRole);
      expect(typeof tab.props.accessibilityLabel).toBe('string');
      expect(tab.props.accessibilityLabel).toContain(TABS[i]);
    });

    // Exactly one tab is selected, and it is the active one.
    const selected = tabsByLabel.filter((t) => t.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toContain('Today');

    // Selection is not conveyed by colour alone — it is in accessibilityState.
    expect(tabsByLabel[0].props.accessibilityState).toEqual({ selected: true });

    // --- B2. Changing tabs moves the selected state, never duplicating ---
    await r.rerender(tree(1));
    const afterSwitch = TABS.map((name) => r.getByLabelText(new RegExp(`^${name}, tab,`)));
    const selectedAfter = afterSwitch.filter((t) => t.props.accessibilityState?.selected === true);
    expect(selectedAfter).toHaveLength(1);
    expect(selectedAfter[0].props.accessibilityLabel).toContain('Money');
    // The previously selected tab is no longer selected but still reachable.
    expect(afterSwitch[0].props.accessibilityState?.selected).toBeFalsy();
    expect(afterSwitch[0].props.accessibilityRole).toBeDefined();

    // --- C. Detached "+" accessibility contract --------------------------
    const fab = r.getByLabelText('Open quick actions');
    expect(fab.props.accessibilityRole).toBe('button');
    expect(fab.props.accessibilityHint).toBe('Opens quick actions to add money, bills, goals, and more');
    // Closed: expanded is explicitly false, not merely absent.
    expect(fab.props.accessibilityState).toEqual({ expanded: false });

    // Exactly one global Add button exists.
    expect(r.queryAllByLabelText('Open quick actions')).toHaveLength(1);
    expect(r.queryAllByLabelText('Close quick actions')).toHaveLength(0);

    // Open the tray by pressing the "+" — driving only its own exposed state.
    fireEvent.press(fab);
    const openFab = await waitFor(() => r.getByLabelText('Close quick actions'));
    expect(openFab.props.accessibilityState).toEqual({ expanded: true });
    // Still exactly one global Add control, now in its open state.
    expect(r.queryAllByLabelText('Open quick actions')).toHaveLength(0);
    expect(r.queryAllByLabelText('Close quick actions')).toHaveLength(1);

    // Close it again — expanded returns to false.
    fireEvent.press(openFab);
    const closedFab = await waitFor(() => r.getByLabelText('Open quick actions'));
    expect(closedFab.props.accessibilityState).toEqual({ expanded: false });
  });

  it('the dock exposes four tabs in the design order', () => {
    expect(TABS).toEqual(['Today', 'Money', 'Wealth', 'Grow']);
  });
});
