/**
 * Floating navigation design pass — pure geometry shared by every piece of
 * the new dock/FAB/tray assembly (FloatingNavBar's capsule, FloatingAddButton's
 * FAB, QuickActionsTray's anchor, and Screen.tsx's bottom content padding).
 *
 * A pre-existing gap this closes: before this pass, the tab bar's own
 * height (MainTabNavigator.tsx) and the floating "+" button's own bottom
 * clearance (FloatingAddButton.tsx) were two independently hardcoded
 * numbers that had to agree by convention, not by shared reference. Every
 * consumer below reads the SAME constants, so the capsule and the FAB
 * always align into one visually seamless assembly without needing to be
 * the same React tree — see FloatingNavBar.tsx/FloatingAddButton.tsx's own
 * doc comments for why they are deliberately two separate components
 * (one is React Navigation's own tabBar customisation point and only ever
 * mounts inside the tab navigator; the other is a persistent, root-level
 * singleton reachable from every screen, exactly like the FAB it replaces).
 */

/** Visual height of both the capsule and the FAB (PRD ask: ~64pt). */
export const DOCK_HEIGHT = 64;
/** Horizontal screen margin on both sides (PRD ask: ~16pt). */
export const HORIZONTAL_MARGIN = 16;
/** Gap between the four-tab capsule and the circular FAB (PRD ask: ~8pt). */
export const DOCK_FAB_GAP = 8;
/** The FAB is a circle the same height as the capsule, so the whole
 * assembly reads as one rounded shape at a glance. */
export const FAB_SIZE = DOCK_HEIGHT;
/** Clearance between the dock/FAB assembly and the device's bottom safe
 * area (home indicator) — independent of `insets.bottom`, which is added
 * on top of this by `dockBottomOffset`. */
export const DOCK_BOTTOM_SPACING = 8;
/** Vertical gap between the tray panel's bottom edge and the top of the
 * dock/FAB assembly (PRD ask: ~8pt above the navigation assembly). */
export const TRAY_DOCK_GAP = 8;

/** How far the whole assembly's bottom edge sits above the literal bottom
 * of the screen, given the device's real bottom safe-area inset. Used as
 * `bottom` for both the capsule and the FAB so they share one baseline. */
export function dockBottomOffset(insetBottom: number): number {
  return Math.max(insetBottom, 0) + DOCK_BOTTOM_SPACING;
}

/** Total vertical space the assembly occupies from the literal bottom of
 * the screen, including its own height — the minimum bottom padding any
 * scrollable screen content needs to stay fully reachable (PRD ask:
 * "sufficient bottom padding and remains reachable"). A small extra
 * cushion is added so content doesn't end flush against the dock. */
export function screenBottomClearance(insetBottom: number): number {
  return dockBottomOffset(insetBottom) + DOCK_HEIGHT + DOCK_BOTTOM_SPACING;
}

/** The capsule's own width: full available width minus both margins, minus
 * the FAB's own footprint and its gap — so `capsule | gap | FAB` exactly
 * fills the space between the two horizontal margins. */
export function capsuleWidth(windowWidth: number): number {
  return Math.max(windowWidth - HORIZONTAL_MARGIN * 2 - FAB_SIZE - DOCK_FAB_GAP, 0);
}

/** The combined footprint (capsule + gap + FAB) the tray should align its
 * own width to, per the PRD ask that the tray "align with the combined
 * dock/FAB width". */
export function combinedAssemblyWidth(windowWidth: number): number {
  return Math.max(windowWidth - HORIZONTAL_MARGIN * 2, 0);
}

/** The tray panel's own `bottom` offset — anchored `TRAY_DOCK_GAP` above the
 * assembly's top edge. */
export function trayBottomOffset(insetBottom: number): number {
  return dockBottomOffset(insetBottom) + DOCK_HEIGHT + TRAY_DOCK_GAP;
}
