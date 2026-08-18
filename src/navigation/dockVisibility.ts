// Nolie Design 5.1 Wave 2 — floating dock + detached "+" visibility matrix.
//
// Doc A p.4 and handoff §3. The decision is driven by ROUTE, KEYBOARD and
// OVERLAY state — never by scrolling. Scroll-driven hiding was explicitly
// rejected: it makes the global add affordance feel unreliable and it
// fights the "nothing moves unless the money did" motion principle.
//
// Pure and RN-free so the whole matrix is exhaustively testable before it
// is wired into navigation, per the wave's own requirement.

/** Every destination the dock must make a decision about. Names match the
 * real navigator route names exactly — `ResetLulu` stays engineering-
 * internal (customer-facing string is "Reset Nolie"), and Onboarding is
 * the root-conditional WelcomeFlow rather than a stack route. */
export type DockRoute =
  // Tab roots
  | 'Today'
  | 'Money'
  | 'Wealth'
  | 'Grow'
  // Passive, read-only reviews
  | 'MoneyDetail'
  | 'GrowDetail'
  | 'Goals'
  | 'Cards'
  | 'Transactions'
  | 'EmergencyFund'
  // Administrative
  | 'Settings'
  | 'Language'
  | 'ResetLulu'
  // Input-focused utilities
  | 'CompoundCalculator'
  | 'HomeLoanCalculator'
  | 'SavingsComparison'
  // Pre-consent / recovery
  | 'Onboarding';

/**
 * Whatever is layered above the current screen.
 *
 * `tray` is deliberately absent: the quick tray is the dock's OWN overlay.
 * It dims the dock rather than hiding it, and the "+" morphs to "x" in
 * place — so the tray never changes this decision.
 */
export type DockOverlayState =
  | 'none'
  | 'taskWorkspace'
  | 'picker'
  | 'alert'
  | 'infoSheet'
  | 'blocking';

export interface DockVisibilityInput {
  route: DockRoute;
  keyboardVisible: boolean;
  overlay: DockOverlayState;
}

/** Routes where the assembly is visible when nothing is layered above and
 * no keyboard is up. Everything not listed here is hidden. */
export const DOCK_VISIBLE_ROUTES: readonly DockRoute[] = [
  'Today',
  'Money',
  'Wealth',
  'Grow',
  'MoneyDetail',
  'GrowDetail',
  'Goals',
  'Cards',
  'Transactions',
  'EmergencyFund',
];

export const DOCK_HIDDEN_ROUTES: readonly DockRoute[] = [
  'Settings',
  'Language',
  'ResetLulu',
  'CompoundCalculator',
  'HomeLoanCalculator',
  'SavingsComparison',
  'Onboarding',
];

export const ALL_DOCK_ROUTES: readonly DockRoute[] = [...DOCK_VISIBLE_ROUTES, ...DOCK_HIDDEN_ROUTES];

export const ALL_DOCK_OVERLAY_STATES: readonly DockOverlayState[] = [
  'none',
  'taskWorkspace',
  'picker',
  'alert',
  'infoSheet',
  'blocking',
];

/** Why the dock resolved the way it did — surfaced so a failing device
 * observation can be traced to a rule rather than guessed at. */
export type DockVisibilityReason =
  | 'visible-root-or-passive-detail'
  | 'hidden-overlay'
  | 'hidden-keyboard'
  | 'hidden-route';

export interface DockVisibilityResult {
  visible: boolean;
  reason: DockVisibilityReason;
}

/**
 * Resolve dock + "+" visibility.
 *
 * Precedence is deliberate and ordered most-blocking first:
 *   1. An overlay owns the screen — nothing may compete with an atomic
 *      choice, an irreversible act, or blocked persistence.
 *   2. The keyboard is up — the footer belongs to the field and its Save.
 *   3. The route itself is administrative or input-focused.
 * Only then is the assembly visible.
 */
export function resolveDockVisibility(input: DockVisibilityInput): DockVisibilityResult {
  if (input.overlay !== 'none') return { visible: false, reason: 'hidden-overlay' };
  if (input.keyboardVisible) return { visible: false, reason: 'hidden-keyboard' };
  if (!DOCK_VISIBLE_ROUTES.includes(input.route)) return { visible: false, reason: 'hidden-route' };
  return { visible: true, reason: 'visible-root-or-passive-detail' };
}

/** Convenience boolean for call sites that do not need the reason. */
export function isDockVisible(input: DockVisibilityInput): boolean {
  return resolveDockVisibility(input).visible;
}

/** Map an arbitrary navigator route name onto a DockRoute. Unknown names
 * resolve to `null`, and callers treat that as HIDDEN — a route nobody has
 * classified must not silently gain a global add affordance. */
export function toDockRoute(routeName: string | undefined): DockRoute | null {
  if (!routeName) return null;
  return (ALL_DOCK_ROUTES as readonly string[]).includes(routeName) ? (routeName as DockRoute) : null;
}

/** Safe entry point for navigation code: unknown route => hidden. */
export function isDockVisibleForRouteName(
  routeName: string | undefined,
  keyboardVisible: boolean,
  overlay: DockOverlayState
): boolean {
  const route = toDockRoute(routeName);
  if (route === null) return false;
  return isDockVisible({ route, keyboardVisible, overlay });
}
