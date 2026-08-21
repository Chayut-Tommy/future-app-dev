// Nolie Design 5.1 Wave 6, Correction A — where the selected tab is
// published from.
//
// The root-level dock needs to know which tab is selected inside `Main`.
// The root stack's own `state` listener reports the ROOT's routes; a change
// confined to the nested tab navigator does not re-emit it, so observing
// only at root leaves the pill stale after a cross-tab move made from a
// pushed route.
//
// This is NOT a second source of truth. React Navigation remains the only
// authority: MainTabNavigator publishes what its own `state` listener
// reports, and RootNavigator subscribes. Nothing derives or guesses a tab
// here. It mirrors the established floatingTrayRef.ts pattern rather than
// introducing a new mechanism.

type Listener = (tab: string) => void;

let current: string | undefined;
const listeners = new Set<Listener>();

/** Called by MainTabNavigator from React Navigation's own state event. */
export function publishActiveTab(tab: string): void {
  if (current === tab) return;
  current = tab;
  for (const l of listeners) l(tab);
}

export function getActiveTab(): string | undefined {
  return current;
}

export function subscribeActiveTab(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset so one suite's navigation cannot leak into the next. */
export function resetActiveTabStore(): void {
  current = undefined;
  listeners.clear();
}
