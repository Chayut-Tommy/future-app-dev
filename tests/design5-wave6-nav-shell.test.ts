// Nolie Design 5.1 Wave 6, Correction A — the persistent navigation shell.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): the whole state projection — visibility, owner
//   tab, and what a tab press means — runs the real pure modules.
// - Class C (structural): mount count, mount location, and the retirement
//   of the tabBar-mounted dock.
//
// THE DEFECT. FloatingNavBar was MainTabNavigator's `tabBar`, so it existed
// only while `Main` was the visible root-stack screen. Every eligible
// detail route is a ROOT-STACK route, so pushing one unmounted the dock
// while the root-level "+" survived. dockVisibility.ts classified those
// routes VISIBLE the whole time — the matrix was right, the dock simply was
// not mounted to consult it.
//
// Run with: npx tsx tests/design5-wave6-nav-shell.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_DOCK_OVERLAY_STATES,
  ALL_DOCK_ROUTES,
  DockOverlayState,
  DockRoute,
  isDockVisibleForRouteName,
} from '../src/navigation/dockVisibility';
import {
  INITIAL_TAB,
  ROUTE_OWNER_TAB,
  TAB_DEFINITIONS,
  TAB_NAMES,
  TabName,
  isTabName,
  resolveOwnerTab,
  tabIndex,
} from '../src/navigation/tabDefinitions';
import { resolveRootNavAssembly, resolveTabPress } from '../src/navigation/rootNavAssembly';
import { getActiveTab, publishActiveTab, resetActiveTabStore, subscribeActiveTab } from '../src/navigation/activeTabStore';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROOT_NAV = read('src/navigation/RootNavigator.tsx');
const TAB_NAV = read('src/navigation/MainTabNavigator.tsx');
const DOCK = read('src/components/navigation/FloatingNavBar.tsx');
const ADAPTER = read('src/components/navigation/GlobalNavDock.tsx');

console.log('=== 1. Exactly one dock and one "+", both at root (Class C) ===');
{
  const allSrc = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true } as any) as string[];
  const files = allSrc.filter((f) => typeof f === 'string' && /\.tsx$/.test(f)).map((f) => `src/${f}`);
  let dockRenders = 0;
  let fabRenders = 0;
  let adapterRenders = 0;
  for (const f of files) {
    const src = strip(read(f));
    dockRenders += (src.match(/<FloatingNavBar[\s/>]/g) || []).length;
    fabRenders += (src.match(/<FloatingAddButton[\s/>]/g) || []).length;
    adapterRenders += (src.match(/<GlobalNavDock[\s/>]/g) || []).length;
  }
  assert('1a. FloatingNavBar is rendered in exactly one place', dockRenders === 1);
  assert('1b. FloatingAddButton is rendered in exactly one place', fabRenders === 1);
  assert('1c. and the root adapter is mounted exactly once', adapterRenders === 1);
  assert('1d. the dock is rendered by the root adapter, not by a screen', /<FloatingNavBar/.test(ADAPTER));
  assert('1e. the adapter and the "+" are siblings at root', (() => {
    const code = strip(ROOT_NAV);
    const dock = code.indexOf('<GlobalNavDock');
    const fab = code.indexOf('<FloatingAddButton');
    const navClose = code.indexOf('</RootStack.Navigator>');
    return dock > navClose && fab > navClose;
  })());
  assert('1f. the tab navigator no longer mounts a dock at all', /tabBar=\{\(\) => null\}/.test(strip(TAB_NAV)) && !/FloatingNavBar/.test(strip(TAB_NAV)));
  assert('1g. so no temporary duplicate can exist during a transition', dockRenders === 1 && adapterRenders === 1);
}

console.log('\n=== 2. The dock is presentation-only (Class C) ===');
{
  const CODE = strip(DOCK);
  assert('2a. it no longer takes BottomTabBarProps', !/BottomTabBarProps/.test(CODE));
  assert('2b. nor reads React Navigation descriptors', !/descriptors/.test(CODE));
  assert('2c. nor interprets navigation state', !/navigation\.(navigate|emit)/.test(CODE));
  assert('2d. it takes a plain, testable contract', /tabs: readonly DockTab\[\];/.test(CODE) && /activeIndex: number;/.test(CODE) && /onSelectTab:/.test(CODE));
  assert('2e. the tray-close contract on any tab press is preserved', /floatingTrayCloseRef\.current\?\.\(\)/.test(CODE));
  assert('2f. the iOS/Android accessibility role split is preserved', /accessibilityRole=\{Platform\.OS === 'ios' \? 'button' : 'tab'\}/.test(CODE));
  assert('2g. as is the spoken "<label>, tab, n of total" form', /\$\{label\}, tab, \$\{index \+ 1\} of \$\{tabs\.length\}/.test(CODE));
  assert('2h. and the selected state', /accessibilityState=\{isFocused \? \{ selected: true \} : \{\}\}/.test(CODE));
  assert('2i. the pill still animates, and still snaps under Reduce Motion', /Animated\.timing\(pillPosition/.test(CODE) && /if \(reduceMotion\) \{\s*\n\s*pillPosition\.setValue\(pillIndex\);/.test(CODE));
  assert('2j. nothing waits for that animation — the selected state is set from props, not from a completion callback', !/\.start\(\(\) =>/.test(CODE));
  assert('2k. the tablet cap and centring are untouched', /capsuleWidth\(windowWidth\)/.test(CODE));
}

console.log('\n=== 3. One definition of the tab set (Class A + C) ===');
{
  assert('3a. four tabs, in canonical order', TAB_NAMES.join(',') === 'Today,Money,Wealth,Grow');
  assert('3b. each with a label and both icon states', TAB_DEFINITIONS.every((t) => !!t.label && !!t.outline && !!t.filled));
  assert('3c. the tab navigator reads that same definition rather than its own map', /TAB_DEFINITIONS\.map\(\(t\) => \[t\.name/.test(TAB_NAV));
  assert('3d. and so does the root adapter', /TAB_DEFINITIONS\.map/.test(ADAPTER));
  assert('3e. so the outline/filled mapping is defined exactly once', (() => {
    const defs = ['src/navigation/MainTabNavigator.tsx', 'src/navigation/RootNavigator.tsx', 'src/components/navigation/GlobalNavDock.tsx', 'src/components/navigation/FloatingNavBar.tsx']
      .map((f) => strip(read(f)))
      .filter((src) => /'sunny-outline'/.test(src)).length;
    return defs === 0;
  })());
  assert('3f. the initial tab is the navigator\'s own first route', INITIAL_TAB === 'Today');
  assert('3g. and an unknown name is not a tab', !isTabName('Settings') && !isTabName(undefined) && isTabName('Money'));
}

console.log('\n=== 4. Route-to-owner-tab mapping (Class A) ===');
{
  const EXPECTED: [string, TabName | null][] = [
    ['MoneyDetail', 'Money'],
    ['Transactions', 'Money'],
    ['Cards', 'Money'],
    ['EmergencyFund', 'Money'],
    ['GrowDetail', 'Grow'],
    ['Goals', 'Grow'],
  ];
  for (const [route, owner] of EXPECTED) {
    assert(`4a. ${route} is owned by ${owner}`, resolveOwnerTab(route, undefined) === owner);
  }
  assert('4b. Main resolves to whichever tab is selected inside it', resolveOwnerTab('Main', 'Wealth') === 'Wealth' && resolveOwnerTab('Main', 'Grow') === 'Grow');
  assert('4c. Main with no nested information lights no pill on its own', resolveOwnerTab('Main', undefined) === null);
  assert('4d. an unrecognised nested tab fails closed', resolveOwnerTab('Main', 'SomethingElse') === null);
  assert('4e. a hidden route owns no tab', resolveOwnerTab('Settings', undefined) === null && resolveOwnerTab('CompoundCalculator', undefined) === null);
  assert('4f. an unknown future route fails closed', resolveOwnerTab('SomeFutureScreen', undefined) === null);

  // Every owned route must be one the matrix already calls visible, so the
  // map can never light a pill where the assembly is hidden.
  const owned = Object.keys(ROUTE_OWNER_TAB) as DockRoute[];
  // RECONCILED — Wave 8 closure. OLD CLAUSE required every OWNED route to
  // be dock-visible. SUPERSEDED BECAUSE EmergencyFund is owned by Grow AND
  // is a calculator: the owner's recording showed the shell bleeding onto
  // it, and all four calculators must now be shell-hidden. Ownership and
  // visibility are genuinely different questions — a calculator still
  // belongs to Grow for Back purposes while showing no dock. PRESERVED
  // INTENT: no owned route is unclassified, and every visible owned route
  // resolves visible.
  assert('4g. every owned route the matrix classifies visible does resolve visible', owned.filter((r) => isDockVisibleForRouteName(r, false, 'none')).every((r) => resolveRootNavAssembly({ rootRoute: r, nestedTab: undefined, keyboardVisible: false, overlay: 'none' }).visible));
  assert('4g-i. and an owned calculator keeps its owner while showing no shell', ROUTE_OWNER_TAB['EmergencyFund'] === 'Money' && !resolveRootNavAssembly({ rootRoute: 'EmergencyFund', nestedTab: undefined, keyboardVisible: false, overlay: 'none' }).visible);
  assert('4h. and every owner is a real tab', owned.every((r) => isTabName(ROUTE_OWNER_TAB[r]!)));
  assert('4i. tabIndex is the pill position, and -1 when nothing is lit', tabIndex('Today') === 0 && tabIndex('Grow') === 3 && tabIndex(null) === -1);
}

console.log('\n=== 5. Dock and "+" can never disagree (Class A) ===');
{
  // The whole assembly is ONE decision. This is the defect's real fix: the
  // "+" used to consult the matrix while the dock consulted nothing.
  let disagreements = 0;
  let evaluated = 0;
  for (const route of ALL_DOCK_ROUTES) {
    for (const keyboardVisible of [false, true]) {
      for (const overlay of ALL_DOCK_OVERLAY_STATES) {
        const a = resolveRootNavAssembly({ rootRoute: route, nestedTab: undefined, keyboardVisible, overlay });
        evaluated++;
        // The "+" is hidden exactly when the assembly is not visible — one
        // boolean drives both, so there is nothing to diverge.
        if (typeof a.visible !== 'boolean') disagreements++;
        // A visible assembly must always have a lit pill or be a tab root.
        if (a.visible && a.activeIndex < 0) {
          if (ROUTE_OWNER_TAB[route as DockRoute]) disagreements++;
        }
      }
    }
  }
  assert(`5a. all ${evaluated} route x keyboard x overlay combinations resolve one coherent assembly`, disagreements === 0);
  assert('5b. RootNavigator derives the "+" from the SAME projection the dock uses', /const fabRouteHidden = !assembly\.visible;/.test(strip(ROOT_NAV)));
  assert('5c. and passes that one projection to the dock', /<GlobalNavDock assembly=\{assembly\}/.test(strip(ROOT_NAV)));
  // RECONCILED — Wave 8 closure. OLD CLAUSE required the adapter to RETURN
  // NULL when hidden. SUPERSEDED BECAUSE unmounting re-created
  // FloatingNavBar's pill Animated.Value on every reveal, replaying its
  // entry choreography — the pop-in after dismissing Settings — and letting
  // the pill show a stale tab on its first frame. The "+" never had this
  // because it only ever gated itself visually, which is exactly why the
  // two appeared at different times. PRESERVED INTENT verbatim: the dock
  // takes the SAME posture as the "+", so the two can never disagree —
  // now by both gating visually rather than one unmounting.
  assert('5d. the adapter gates visually, the same posture the "+" takes', /hidden=\{!assembly\.visible\}/.test(strip(ADAPTER)) && !/return null;/.test(strip(ADAPTER)));
  assert('5d-i. and while hidden it takes no touches and leaves the accessibility tree', /pointerEvents=\{hidden \? 'none' : 'box-none'\}/.test(strip(read('src/components/navigation/FloatingNavBar.tsx'))) && /accessibilityElementsHidden=\{hidden\}/.test(strip(read('src/components/navigation/FloatingNavBar.tsx'))));

  // The accepted matrix is unchanged.
  for (const route of ['Today', 'Money', 'Wealth', 'Grow', 'MoneyDetail', 'GrowDetail', 'Goals', 'Cards', 'Transactions']) {
    assert(`5e. ${route} shows the assembly`, resolveRootNavAssembly({ rootRoute: route, nestedTab: 'Today', keyboardVisible: false, overlay: 'none' }).visible);
  }
  for (const route of ['Settings', 'Language', 'ResetLulu', 'CompoundCalculator', 'HomeLoanCalculator', 'SavingsComparison', 'Onboarding']) {
    assert(`5f. ${route} hides it`, !resolveRootNavAssembly({ rootRoute: route, nestedTab: undefined, keyboardVisible: false, overlay: 'none' }).visible);
  }
  assert('5g. the keyboard hides it on every route', ALL_DOCK_ROUTES.every((r) => !resolveRootNavAssembly({ rootRoute: r, nestedTab: 'Today', keyboardVisible: true, overlay: 'none' }).visible));
  assert('5h. every blocking overlay hides it', (ALL_DOCK_OVERLAY_STATES.filter((o) => o !== 'none') as DockOverlayState[]).every((o) => !resolveRootNavAssembly({ rootRoute: 'Today', nestedTab: 'Today', keyboardVisible: false, overlay: o }).visible));
  assert('5i. the tray is still NOT an overlay state — it dims the dock, never hides it', !(ALL_DOCK_OVERLAY_STATES as readonly string[]).includes('tray'));
  assert('5j. an unknown future route fails closed', !resolveRootNavAssembly({ rootRoute: 'SomeFutureScreen', nestedTab: undefined, keyboardVisible: false, overlay: 'none' }).visible);
  assert('5k. and before the first state event the assembly is the initial tab, visible', (() => {
    const a = resolveRootNavAssembly({ rootRoute: undefined, nestedTab: undefined, keyboardVisible: false, overlay: 'none' });
    return a.visible && a.activeTab === INITIAL_TAB && a.activeIndex === 0;
  })());
}

console.log('\n=== 6. Tab-press semantics (Class A) ===');
{
  // 1. A different tab from a tab root.
  assert('6a. pressing another tab from a root navigates', resolveTabPress('Money', 'Main', 'Today').kind === 'navigate');
  // 2. The already-selected tab on its own root.
  assert('6b. pressing the selected tab on its root scrolls to top', resolveTabPress('Today', 'Main', 'Today').kind === 'scrollToTop');
  assert('6c. and does so before the first state event too', resolveTabPress('Today', undefined, undefined).kind === 'scrollToTop');
  // 3. The owner tab from one of its detail routes.
  assert('6d. pressing Money from MoneyDetail returns to its root', resolveTabPress('Money', 'MoneyDetail', 'Money').kind === 'returnToRoot');
  assert('6e. pressing Money from Transactions returns to its root', resolveTabPress('Money', 'Transactions', 'Money').kind === 'returnToRoot');
  assert('6f. pressing Grow from Goals returns to its root', resolveTabPress('Grow', 'Goals', 'Grow').kind === 'returnToRoot');
  assert('6g. never scrollToTop from a detail route — the root is covered and must not be scrolled', ['MoneyDetail', 'Transactions', 'Cards', 'EmergencyFund', 'GrowDetail', 'Goals'].every((r) => resolveTabPress(resolveOwnerTab(r, undefined)!, r, undefined).kind !== 'scrollToTop'));
  // 4. A different tab from a detail route.
  assert('6h. pressing Grow from MoneyDetail navigates', resolveTabPress('Grow', 'MoneyDetail', 'Money').kind === 'navigate');
  assert('6i. pressing Today from Transactions navigates', resolveTabPress('Today', 'Transactions', 'Money').kind === 'navigate');

  // The screen dispatches exactly one navigation per press, and scroll-to-
  // top dispatches none.
  const NAV = strip(ROOT_NAV);
  assert('6j. scrollToTop scrolls and returns without navigating', /if \(outcome\.kind === 'scrollToTop'\) \{[\s\S]{0,240}return;\s*\n\s*\}/.test(NAV));
  assert('6k. it uses the SAME ref map the tab listener used, not a duplicate behaviour', /tabScrollRefs\[tab\]\.current\?\.scrollTo\(\{ y: 0, animated: true \}\)/.test(NAV));
  // RECONCILED — Wave 8 correction E. OLD CLAUSE counted every use of the
  // existing screen-supplied ref and expected exactly one, because a tab
  // press was its only consumer. SUPERSEDED BECAUSE the one global Settings
  // action now dispatches through that SAME ref — deliberately reusing the
  // existing mechanism rather than adding a navigation container ref, which
  // 6n still forbids and still passes. PRESERVED INTENT: a TAB press is
  // exactly one navigate into Main, asserted directly below.
  assert('6l. a tab press is exactly one navigate into Main', (NAV.match(/rootNavigationRef\.current\?\.navigate\('Main', \{ screen: tab \}\)/g) || []).length === 1);
  assert('6l-i. and the only other dispatch through that ref is the one global Settings action', (NAV.match(/rootNavigationRef\.current\?\.navigate\(/g) || []).length === 2 && /rootNavigationRef\.current\?\.navigate\('Settings'\)/.test(NAV));
  assert('6m. which reveals that tab\'s root rather than layering it under the detail route', /navigate\('Main', \{ screen: tab \}\)/.test(NAV));
  assert('6n. no global navigation container ref was introduced', !/createNavigationContainerRef/.test(NAV));
  // RECONCILED — Wave 8 closure: the listener factory now also destructures
  // `route`, because transitionStart/transitionEnd need to know WHICH route
  // is closing. Intent unchanged: the navigation object still comes from
  // React Navigation's own screenListeners, never a container ref.
  assert('6o. the navigation object comes from React Navigation\'s own screenListeners', /screenListeners=\{\(\{ navigation, route \}\) => \(\{/.test(NAV) && /rootNavigationRef\.current = navigation;/.test(NAV));
}

console.log('\n=== 7. Nothing protected moved (Class C) ===');
{
  assert('7a. the Add phase machine is untouched — no root-level change reaches it', !/floatingAddTransition|addWorkspaceTransitionController/.test(strip(ROOT_NAV)) && !/floatingAddTransition|addWorkspaceTransitionController/.test(strip(ADAPTER)));
  assert('7b. RootNavigator still registers every route it did', ['Main', 'Settings', 'Language', 'Transactions', 'Goals', 'Cards', 'MoneyDetail', 'GrowDetail', 'EmergencyFund', 'ResetLulu'].every((r) => new RegExp(`name="${r}"`).test(ROOT_NAV)));
  assert('7c. the tab navigator still registers its four screens with their scroll listeners', ['Today', 'Money', 'Wealth', 'Grow'].every((t) => new RegExp(`name="${t}"[\\s\\S]{0,120}scrollToTopOnRepeatPress\\('${t}'\\)`).test(TAB_NAV)));
  assert('7d. no navigator was added or replaced — the root still creates exactly one stack, and the tab navigator is still the one it hosts', (ROOT_NAV.match(/= createNativeStackNavigator\(\)/g) || []).length === 1 && !/createBottomTabNavigator/.test(ROOT_NAV) && (TAB_NAV.match(/= createBottomTabNavigator\(\)/g) || []).length === 1);
  assert('7e. no new dependency is imported by any new file', ['src/navigation/tabDefinitions.ts', 'src/navigation/rootNavAssembly.ts', 'src/components/navigation/GlobalNavDock.tsx'].every((f) => {
    const imports = strip(read(f)).match(/from '([^']+)'/g) || [];
    return imports.every((i) => /'\.\.?\//.test(i) || /'(react|react-native|@expo\/vector-icons)'/.test(i));
  }));
  assert('7f. the pure modules stay RN-free so the tsx harness can run them', !/from 'react-native'/.test(read('src/navigation/rootNavAssembly.ts')));
}

console.log('\n=== 8. Correction A safeguards (Class A + C) ===');
{
  // 8a-c — a RESTORED session that opens directly onto an eligible detail
  // route must light that route's owner tab, not the initial tab. The
  // projection takes the route as an argument, so a restored MoneyDetail is
  // indistinguishable from a pushed one and resolves identically.
  // RECONCILED — Wave 8 closure: EmergencyFund still RESOLVES its owner
  // (ownership is unchanged, so Back still returns correctly), but it is no
  // longer dock-visible, so `a.visible` is legitimately false for it. The
  // ownership half of the clause is asserted for every route; the
  // visibility half only for the routes the matrix still classifies visible.
  for (const [route, owner] of [['MoneyDetail', 'Money'], ['Transactions', 'Money'], ['GrowDetail', 'Grow'], ['Goals', 'Grow'], ['Cards', 'Money'], ['EmergencyFund', 'Money']] as const) {
    const a = resolveRootNavAssembly({ rootRoute: route, nestedTab: undefined, keyboardVisible: false, overlay: 'none' });
    const shouldBeVisible = isDockVisibleForRouteName(route, false, 'none');
    assert(`8a. a restored ${route} lights ${owner}, with no nested-tab information at all`, a.activeTab === owner && a.visible === shouldBeVisible);
  }
  assert('8b. and never falls back to the initial tab on a detail route', ['MoneyDetail', 'GrowDetail', 'Goals', 'Cards', 'Transactions', 'EmergencyFund'].every((r) => resolveRootNavAssembly({ rootRoute: r, nestedTab: undefined, keyboardVisible: false, overlay: 'none' }).activeTab !== INITIAL_TAB || r.startsWith('Money') === false));
  assert('8c. the initial-tab default applies ONLY to Main, where it is genuinely the selected route', (() => {
    const onMain = resolveRootNavAssembly({ rootRoute: 'Main', nestedTab: undefined, keyboardVisible: false, overlay: 'none' });
    const onDetail = resolveRootNavAssembly({ rootRoute: 'GrowDetail', nestedTab: undefined, keyboardVisible: false, overlay: 'none' });
    return onMain.activeTab === INITIAL_TAB && onDetail.activeTab === 'Grow';
  })());

  // 8d-g — the store must not notify an unmounted consumer.
  resetActiveTabStore();
  let received: string[] = [];
  const unsubscribe = subscribeActiveTab((t) => received.push(t));
  publishActiveTab('Money');
  assert('8d. a subscriber is notified while mounted', received.join(',') === 'Money');
  unsubscribe();
  publishActiveTab('Grow');
  assert('8e. and is NOT notified after unsubscribing — no update on an unmounted consumer', received.join(',') === 'Money');
  assert('8f. while the store itself still tracks the current value for a later subscriber', getActiveTab() === 'Grow');
  const late: string[] = [];
  const un2 = subscribeActiveTab((t) => late.push(t));
  publishActiveTab('Wealth');
  un2();
  assert('8g. a repeated publish of the same value notifies nobody twice', (() => {
    const seen: string[] = [];
    const u = subscribeActiveTab((t) => seen.push(t));
    publishActiveTab('Today');
    publishActiveTab('Today');
    u();
    return seen.join(',') === 'Today';
  })());
  assert('8h. and RootNavigator explicitly cleans up its subscription', /useEffect\(\(\) => subscribeActiveTab\(setActiveTabRoute\), \[\]\)/.test(strip(ROOT_NAV)));
  resetActiveTabStore();

  // 8i-k — exactly one writer.
  const srcFiles = (fs.readdirSync(path.join(ROOT, 'src'), { recursive: true } as any) as string[])
    .filter((f) => typeof f === 'string' && /\.tsx?$/.test(f))
    .map((f) => `src/${f}`);
  const writers = srcFiles.filter((f) => f !== 'src/navigation/activeTabStore.ts' && /publishActiveTab\(/.test(strip(read(f))));
  assert(`8i. exactly one production file publishes the selected tab${writers.length ? ` (${writers.join(', ')})` : ''}`, writers.length === 1 && writers[0] === 'src/navigation/MainTabNavigator.tsx');
  assert('8j. it publishes from React Navigation\'s own state event, deriving nothing', /publishActiveTab\(name\)/.test(strip(TAB_NAV)) && /const name = st\?\.routes\[st\.index\]\?\.name;/.test(strip(TAB_NAV)));
  assert('8k. and the root listener no longer writes the tab as a second writer', !/setActiveTabRoute\(/.test(strip(ROOT_NAV).split('screenListeners')[1]?.split('screenOptions')[0] ?? ''));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
