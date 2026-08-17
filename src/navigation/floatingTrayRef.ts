/**
 * A single cross-tree "close the quick-actions tray" signal, mirroring
 * tabScrollRefs.ts's own established pattern (a plain module-level ref,
 * not context/redux) for the same structural reason: MainTabNavigator's
 * per-tab `tabPress` listeners live inside the tab navigator, while the
 * tray they need to close is owned by FloatingAddButton, a persistent
 * singleton mounted at RootNavigator level (reachable from every screen,
 * not just the tab screens) — see FloatingAddButton.tsx's own doc comment
 * for why the two are deliberately separate components.
 */
export const floatingTrayCloseRef: { current: (() => void) | null } = { current: null };
