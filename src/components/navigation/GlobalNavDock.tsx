import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DockTab, FloatingNavBar } from './FloatingNavBar';
import { TAB_DEFINITIONS, TabName } from '../../navigation/tabDefinitions';
import { RootNavAssembly, TabPressOutcome } from '../../navigation/rootNavAssembly';
import { useReduceMotion } from '../../hooks/useReduceMotion';

/**
 * Nolie Design 5.1 Wave 6, Correction A — the root-level dock adapter.
 *
 * The ONLY place the tab set becomes React elements. It takes an
 * already-resolved assembly (rootNavAssembly.ts decided visibility and the
 * active tab) and a press handler, so no navigation-state interpretation
 * happens inside a tab button.
 *
 * Icons come from tabDefinitions.ts — the same single definition
 * MainTabNavigator uses — so the outline/filled mapping is not duplicated
 * now that the dock no longer reaches it through React Navigation's
 * `descriptors`.
 */
export function GlobalNavDock({
  assembly,
  onTabPress,
}: {
  assembly: RootNavAssembly;
  onTabPress: (tab: TabName) => void;
}) {
  const reduceMotion = useReduceMotion();

  const tabs = useMemo<DockTab[]>(
    () =>
      TAB_DEFINITIONS.map((def) => ({
        name: def.name,
        label: def.label,
        icon: ({ focused, color, size }) => (
          <Ionicons name={focused ? def.filled : def.outline} size={size} color={color} />
        ),
      })),
    []
  );

  /* Wave 8 closure — the dock stays MOUNTED and hides visually.
   *
   * Returning null unmounted it, so every reveal re-created
   * FloatingNavBar's `pillPosition` Animated.Value and replayed its entry
   * choreography — the pop-in the owner saw after dismissing Settings, and
   * the reason the pill could show a stale tab on its first frame. The "+"
   * never had this problem because it only ever gated itself visually
   * (`hideDock`), which is exactly why the two appeared at different times.
   * Both now take the same posture, so they reveal in one commit. */
  return (
    <FloatingNavBar
      hidden={!assembly.visible}
      tabs={tabs}
      activeIndex={assembly.activeIndex}
      onSelectTab={(tab) => onTabPress(tab.name as TabName)}
      reduceMotion={reduceMotion}
    />
  );
}

export type { TabPressOutcome };
