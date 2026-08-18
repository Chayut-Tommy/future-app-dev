// Nolie Design 5.1 Wave 2 — repeat-tap scroll-to-top, as pure logic.
//
// Extracted from MainTabNavigator.tsx so the contract can be proven
// behaviourally. MainTabNavigator imports react-native and therefore cannot
// be executed by the repository's tsx harness (tests/README.md), and neither
// can tabScrollRefs.ts, which value-imports ScrollView. Taking the ref map as
// a parameter keeps this module dependency-free.
//
// The behaviour itself is unchanged: press the already-focused tab and its
// list scrolls to top; press any other tab and it navigates normally.

/** The only thing this needs from a ScrollView. */
export interface TabScrollTarget {
  scrollTo(options: { y: number; animated?: boolean }): void;
}

export type TabScrollRefMap<TTab extends string> = Record<TTab, { current: TabScrollTarget | null }>;

export interface TabPressListeners {
  tabPress: () => void;
}

/**
 * Build the `listeners` object for one tab.
 *
 * `isFocused()` is what distinguishes "select this tab" from "I am already
 * here" — only the second scrolls. A missing ref is a safe no-op so a tab
 * whose screen has not mounted its list yet still navigates normally.
 */
export function createRepeatTapScrollListener<TTab extends string>(
  tab: TTab,
  refs: TabScrollRefMap<TTab>
): (args: { navigation: { isFocused: () => boolean } }) => TabPressListeners {
  return ({ navigation }) => ({
    tabPress: () => {
      if (!navigation.isFocused()) return;
      refs[tab].current?.scrollTo({ y: 0, animated: true });
    },
  });
}
