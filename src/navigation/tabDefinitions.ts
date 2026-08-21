// Nolie Design 5.1 Wave 6, Correction A — the tab set, as one definition.
//
// Extracted so MainTabNavigator, RootNavigator and the dock cannot drift.
// Before this, the icon map lived in MainTabNavigator and reached the dock
// only through React Navigation's `descriptors` — which is precisely why
// the dock could not be mounted anywhere except inside the tab navigator.
//
// Pure and RN-free apart from the Ionicons glyph type, so the whole set can
// be exercised by the tsx harness.

import { Ionicons } from '@expo/vector-icons';
import { DockRoute, toDockRoute } from './dockVisibility';

export type TabName = 'Today' | 'Money' | 'Wealth' | 'Grow';

export interface TabDefinition {
  name: TabName;
  label: string;
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
}

/** Canonical order — the order the capsule renders and the order the
 * selected pill translates through. Unchanged from MainTabNavigator's own
 * Tab.Screen order. */
export const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { name: 'Today', label: 'Today', outline: 'sunny-outline', filled: 'sunny' },
  { name: 'Money', label: 'Money', outline: 'wallet-outline', filled: 'wallet' },
  { name: 'Wealth', label: 'Wealth', outline: 'trending-up-outline', filled: 'trending-up' },
  { name: 'Grow', label: 'Grow', outline: 'compass-outline', filled: 'compass' },
];

export const TAB_NAMES: readonly TabName[] = TAB_DEFINITIONS.map((t) => t.name);

/** The tab navigator's own initial route. Before React Navigation reports
 * its first state event the root has no nested-tab information, and this is
 * genuinely which tab is selected — not a guess or a fallback. */
export const INITIAL_TAB: TabName = TAB_DEFINITIONS[0].name;

export function isTabName(value: string | undefined): value is TabName {
  return !!value && (TAB_NAMES as readonly string[]).includes(value);
}

/**
 * Which tab OWNS a pushed detail route — the tab whose pill stays lit while
 * that route is on screen, and the root a press on that pill returns to.
 *
 * Derived from the routes' existing semantics, not invented here:
 *   - MoneyDetail is MoneyScreen pushed; Transactions, Cards and Emergency
 *     Fund are all reached from Money and are money-account surfaces.
 *   - GrowDetail is DiscoverScreen pushed; Goals is Grow's own "Your goals"
 *     destination (DiscoverScreen owns the canonical goal list).
 *
 * Every entry is a DockRoute that dockVisibility.ts already classifies
 * visible, so this map can never light a pill on a route where the
 * assembly is hidden.
 */
export const ROUTE_OWNER_TAB: Readonly<Partial<Record<DockRoute, TabName>>> = {
  Today: 'Today',
  Money: 'Money',
  MoneyDetail: 'Money',
  Transactions: 'Money',
  Cards: 'Money',
  EmergencyFund: 'Money',
  Wealth: 'Wealth',
  Grow: 'Grow',
  GrowDetail: 'Grow',
  Goals: 'Grow',
};

/**
 * The owner tab for a root-stack route name.
 *
 * `Main` is the tab navigator itself: its owner is whichever tab is
 * currently selected inside it, which the caller supplies. Anything this
 * does not know about resolves to `null` and lights no pill — the same
 * fail-closed posture toDockRoute already takes.
 */
export function resolveOwnerTab(rootRouteName: string | undefined, nestedTabName: string | undefined): TabName | null {
  if (rootRouteName === 'Main') return isTabName(nestedTabName) ? nestedTabName : null;
  const route = toDockRoute(rootRouteName);
  if (route === null) return null;
  return ROUTE_OWNER_TAB[route] ?? null;
}

/** Index of a tab in canonical order, or -1. Used only for the selected
 * pill's position. */
export function tabIndex(tab: TabName | null): number {
  if (tab === null) return -1;
  return TAB_NAMES.indexOf(tab);
}
