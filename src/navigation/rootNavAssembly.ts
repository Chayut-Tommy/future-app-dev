// Nolie Design 5.1 Wave 6, Correction A — one visibility projection for the
// whole navigation assembly.
//
// The dock and the detached "+" are one assembly, so they must reach the
// same conclusion from the same inputs. Before this they did not even ask
// the same question: the "+" consulted isDockVisibleForRouteName at root,
// while the dock was mounted inside the tab navigator and simply ceased to
// exist on any pushed route — which is how a route classified VISIBLE ended
// up showing a "+" with no dock beside it.
//
// Pure and RN-free.

import { DockOverlayState, isDockVisibleForRouteName } from './dockVisibility';
import { INITIAL_TAB, TabName, resolveOwnerTab, tabIndex } from './tabDefinitions';

export interface RootNavAssemblyInput {
  /** The visible root-stack route. `undefined` before the first state
   * event, which is treated as the initial `Main`. */
  rootRoute: string | undefined;
  /** The selected tab inside `Main`, when `Main` is the visible route. */
  nestedTab: string | undefined;
  keyboardVisible: boolean;
  overlay: DockOverlayState;
}

export interface RootNavAssembly {
  /** Whether the WHOLE assembly — dock and "+" together — is visible. */
  visible: boolean;
  /** The tab whose pill is lit, or null when none should be. */
  activeTab: TabName | null;
  /** Position of that pill in canonical order, or -1. */
  activeIndex: number;
}

/**
 * Resolve the assembly for the current navigation state.
 *
 * The route decision is delegated wholesale to dockVisibility.ts — this
 * function adds no route rule of its own, so the exhaustive matrix that
 * module already owns remains the single authority, including its
 * fail-closed treatment of unknown routes.
 *
 * `Main` is resolved through the SELECTED TAB rather than the literal route
 * name, so a tab root's own classification applies. Every tab root is a
 * visible DockRoute, so this cannot change an accepted outcome; it means an
 * unrecognised nested tab fails closed like any other unknown route.
 */
export function resolveRootNavAssembly(input: RootNavAssemblyInput): RootNavAssembly {
  const { rootRoute = 'Main', nestedTab, keyboardVisible, overlay } = input;
  // Before the first state event there is no nested-tab information, and
  // the navigator's own initial route is genuinely selected — so this is
  // accurate rather than a fallback, and it means the dock never renders a
  // frame with no tab lit.
  const tab = rootRoute === 'Main' ? nestedTab ?? INITIAL_TAB : nestedTab;
  const routeForVisibility = rootRoute === 'Main' ? tab ?? INITIAL_TAB : rootRoute;
  const visible = isDockVisibleForRouteName(routeForVisibility, keyboardVisible, overlay);
  const activeTab = resolveOwnerTab(rootRoute, tab);
  return { visible, activeTab, activeIndex: tabIndex(activeTab) };
}

export type TabPressOutcome =
  /** Already on this tab's root — scroll it to top, navigate nowhere. */
  | { kind: 'scrollToTop'; tab: TabName }
  /** On one of this tab's detail routes — return to its root. */
  | { kind: 'returnToRoot'; tab: TabName }
  /** A different tab — reveal its root. */
  | { kind: 'navigate'; tab: TabName };

/**
 * What a press on `tab` must do, given where we are.
 *
 * Deliberately three outcomes rather than two: returning from a detail
 * route to its owner's root is NOT a repeat tap, and must not try to scroll
 * a root screen that is currently covered. Distinguishing them here is what
 * keeps the accepted repeat-tap scroll-to-top behaviour exact.
 */
export function resolveTabPress(tab: TabName, rootRoute: string | undefined, nestedTab: string | undefined): TabPressOutcome {
  const onMain = (rootRoute ?? 'Main') === 'Main';
  if (onMain && (nestedTab ?? INITIAL_TAB) === tab) return { kind: 'scrollToTop', tab };
  if (!onMain && resolveOwnerTab(rootRoute, nestedTab) === tab) return { kind: 'returnToRoot', tab };
  return { kind: 'navigate', tab };
}
