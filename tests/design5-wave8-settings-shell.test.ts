// Nolie Design 5.1 Wave 8 correction E — the one global Settings action.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): dockVisibility.ts and rootNavAssembly.ts are pure
//   and RN-free, so the whole route x keyboard x overlay matrix runs the
//   REAL production authority — the same one the dock and the "+" read.
// - Class C (structural): that exactly one trigger is mounted, that Today's
//   duplicate is gone, and that no second selected-tab writer was added.
//
// Run with: npx tsx tests/design5-wave8-settings-shell.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_DOCK_ROUTES,
  ALL_DOCK_OVERLAY_STATES,
  DOCK_VISIBLE_ROUTES,
  DOCK_HIDDEN_ROUTES,
  DockRoute,
  isDockVisible,
} from '../src/navigation/dockVisibility';
import { resolveRootNavAssembly } from '../src/navigation/rootNavAssembly';
import { SETTINGS_ACTION_SIZE, SETTINGS_TOP_OFFSET, SETTINGS_HEADER_INSET } from '../src/navigation/globalSettingsGeometry';

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

const ROOT_NAV = strip(read('src/navigation/RootNavigator.tsx'));
const BUTTON = strip(read('src/components/navigation/GlobalSettingsButton.tsx'));
const TODAY = strip(read('src/screens/today/TodayScreen.tsx'));

/** The control's own visibility IS the assembly's — this is the contract
 * under test, expressed once so every case below reads the same authority. */
function settingsVisible(route: DockRoute, keyboardVisible: boolean, overlay: (typeof ALL_DOCK_OVERLAY_STATES)[number]): boolean {
  return resolveRootNavAssembly({ rootRoute: route, nestedTab: undefined, keyboardVisible, overlay }).visible;
}

console.log('=== 1. Exactly ONE trigger exists in the app (Class C) ===');
{
  assert('1a. it is mounted at the root, beside the dock and the "+"', /<GlobalSettingsButton/.test(ROOT_NAV));
  assert('1b. exactly once', (ROOT_NAV.match(/<GlobalSettingsButton/g) || []).length === 1);
  assert('1c. Today no longer owns a duplicate', !/floatingSettings|SETTINGS_CONTROL_SIZE/.test(TODAY) && !/navigate\('Settings'\)/.test(TODAY));
  assert('1d. and no screen anywhere else does either', (() => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.tsx') && /navigate\('Settings'\)/.test(read(rel))) hits.push(rel);
      }
    };
    walk('src');
    return hits.length === 1 && hits[0].includes('RootNavigator');
  })());
  assert('1e. it meets the 44pt floor exactly', SETTINGS_ACTION_SIZE === 44 && /width: SETTINGS_ACTION_SIZE/.test(BUTTON) && /height: SETTINGS_ACTION_SIZE/.test(BUTTON));
  assert('1f. is labelled "Settings" with a real hint', /accessibilityLabel="Settings"/.test(BUTTON) && /accessibilityHint="Opens appearance, language and account settings\."/.test(BUTTON));
  assert('1g. and its icon is silent to assistive tech', /accessibilityElementsHidden importantForAccessibility="no"/.test(BUTTON));
}

console.log('\n=== 2. It reads the EXISTING visibility authority (Class A + C) ===');
{
  assert('2a. the root passes the SAME assembly the dock and "+" read', /visible=\{assembly\.visible\}/.test(ROOT_NAV));
  assert('2b. so it can never disagree with them about whether the shell exists', (ROOT_NAV.match(/resolveRootNavAssembly\(/g) || []).length === 1);
  assert('2c. no competing route list was introduced', !/SETTINGS_VISIBLE_ROUTES|settingsRoutes/.test(ROOT_NAV + BUTTON));
  assert('2d. no navigation container ref was added — it reuses the existing screen-supplied ref', /rootNavigationRef\.current\?\.navigate\('Settings'\)/.test(ROOT_NAV) && !/useNavigationContainerRef|createNavigationContainerRef/.test(ROOT_NAV));
  assert('2e. and no second writer for selected-tab state', !/publishActiveTab/.test(ROOT_NAV + BUTTON));
  assert('2f. the control holds no navigation state of its own', !/useState|useNavigation|useRoute/.test(BUTTON));
}

console.log('\n=== 3. The full route x keyboard x overlay matrix (Class A) ===');
{
  const combos = ALL_DOCK_ROUTES.length * 2 * ALL_DOCK_OVERLAY_STATES.length;
  let evaluated = 0;
  let visibleCount = 0;
  let disagreements = 0;
  for (const route of ALL_DOCK_ROUTES) {
    for (const keyboardVisible of [false, true]) {
      for (const overlay of ALL_DOCK_OVERLAY_STATES) {
        const settings = settingsVisible(route, keyboardVisible, overlay);
        const dock = isDockVisible({ route, keyboardVisible, overlay });
        evaluated++;
        if (settings) visibleCount++;
        if (settings !== dock) disagreements++;
      }
    }
  }
  assert(`3a. all ${combos} combinations evaluated`, evaluated === combos);
  assert('3b. the Settings action and the dock agree in EVERY one', disagreements === 0);
  // RECONCILED — Wave 8 closure: EmergencyFund moved to the hidden set,
  // so the shell is visible on 9 routes, not 10.
  assert('3c. visible in exactly 9 combinations — the 9 dock-visible routes, keyboard down, no overlay', visibleCount === 9);

  for (const r of ['Today', 'Money', 'Wealth', 'Grow'] as DockRoute[]) {
    assert(`3d. visible on the ${r} root`, settingsVisible(r, false, 'none'));
  }
  for (const r of ['MoneyDetail', 'GrowDetail', 'Goals', 'Cards', 'Transactions'] as DockRoute[]) {
    assert(`3e. visible on ${r} — a pushed destination already eligible for the shell`, settingsVisible(r, false, 'none'));
  }
  assert('3f. HIDDEN on Settings itself', !settingsVisible('Settings', false, 'none'));
  for (const r of ['Language', 'ResetLulu'] as DockRoute[]) {
    assert(`3g. hidden on ${r}`, !settingsVisible(r, false, 'none'));
  }
  for (const r of ['CompoundCalculator', 'HomeLoanCalculator', 'SavingsComparison', 'EmergencyFund'] as DockRoute[]) {
    assert(`3h. hidden on the ${r} calculator`, !settingsVisible(r, false, 'none'));
  }
  assert('3i. hidden before consent, on Onboarding', !settingsVisible('Onboarding', false, 'none'));
  assert('3j. the keyboard hides it on every route', ALL_DOCK_ROUTES.every((r) => !settingsVisible(r, true, 'none')));
  for (const o of ['taskWorkspace', 'picker', 'alert', 'infoSheet', 'blocking'] as const) {
    assert(`3k. a ${o} overlay hides it, even on a visible root`, !settingsVisible('Today', false, o));
  }
  assert('3l. every hidden route stays hidden in all overlay and keyboard states', DOCK_HIDDEN_ROUTES.every((r) => ALL_DOCK_OVERLAY_STATES.every((o) => [false, true].every((k) => !settingsVisible(r, k, o)))));
  assert('3m. and the visible set is exactly the dock-visible set', DOCK_VISIBLE_ROUTES.every((r) => settingsVisible(r, false, 'none')));
}

console.log('\n=== 4. It never covers content (Class A + C) ===');
{
  assert('4a. it sits BELOW the safe-area inset, clear of the status bar and notch', /top: insets\.top \+ SETTINGS_TOP_OFFSET/.test(BUTTON) && SETTINGS_TOP_OFFSET >= 0);
  assert('4b. pinned, not scrolled — it is absolutely positioned at the root, outside every screen\'s scroll view', /position: 'absolute'/.test(BUTTON) && !/ScrollView/.test(BUTTON));
  assert('4c. above the dock in stacking order, so nothing overlaps it', /zIndex: 20/.test(BUTTON));
  // RECONCILED — Wave 8 closure: the layer now gates its own pointer
  // events, because it stays MOUNTED while hidden. Intent preserved and
  // strengthened: it blocks nothing beneath when shown, and takes NO
  // touches at all when hidden.
  assert('4d. its layer passes touches through when shown, and takes none when hidden', /pointerEvents=\{visible \? 'box-none' : 'none'\}/.test(BUTTON));
  assert('4d-i. and leaves the accessibility tree while hidden', /accessibilityElementsHidden=\{!visible\}/.test(BUTTON));
  assert('4e. it is opaque with its own edge — never a bare glyph over content', /backgroundColor: colors\.surface/.test(BUTTON) && /borderWidth: StyleSheet\.hairlineWidth/.test(BUTTON));
  assert('4f. Screen RESERVES matching width, so a title can never run under it', /paddingRight: SETTINGS_HEADER_INSET/.test(strip(read('src/components/shared/Screen.tsx'))));
  assert('4g. and Today reserves it from the SAME shared constant, not a second hardcoded number', /paddingRight: SETTINGS_HEADER_INSET/.test(TODAY));
  assert('4h. the reserve is wider than the control, so they cannot touch', SETTINGS_HEADER_INSET > SETTINGS_ACTION_SIZE);
  assert('4i. no raw colour or fixed-height text container', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(BUTTON));
}

console.log('\n=== 5. The rest of the global assembly is untouched (Class C) ===');
{
  assert('5a. exactly one GlobalNavDock', (ROOT_NAV.match(/<GlobalNavDock/g) || []).length === 1);
  assert('5b. exactly one FloatingAddButton', (ROOT_NAV.match(/<FloatingAddButton/g) || []).length === 1);
  assert('5c. one FloatingNavBar, still owned by the dock adapter', (strip(read('src/components/navigation/GlobalNavDock.tsx')).match(/<FloatingNavBar/g) || []).length === 1);
  assert('5d. the dock visibility matrix itself is unchanged', !/Settings/.test(strip(read('src/navigation/dockVisibility.ts')).replace(/'Settings'/g, '')) || /DOCK_HIDDEN_ROUTES/.test(read('src/navigation/dockVisibility.ts')));
  assert('5e. scroll-to-top and owner-tab return still route through resolveTabPress', /resolveTabPress\(/.test(ROOT_NAV));
  assert('5f. and the active-tab store keeps its single subscriber', (ROOT_NAV.match(/subscribeActiveTab\(/g) || []).length === 1);
}

console.log('\n=== 6. Closure — no full-width mask, and one continuous Score body ===');
{
  const SHEET = strip(read('src/components/health/ScoreExplanationSheet.tsx'));

  // A. The grey seam.
  assert('6a. the full-width gradient/mask is GONE, not merely faded', !/LinearGradient/.test(BUTTON) && !/bandFill|SETTINGS_BAND_FADE/.test(BUTTON));
  assert('6b. and its geometry constant left with it', !/SETTINGS_BAND_FADE/.test(read('src/navigation/globalSettingsGeometry.ts')));
  assert('6c. the control is a self-contained chip, not a full-width layer', !/left: 0/.test(BUTTON) && /right: HORIZONTAL_MARGIN/.test(BUTTON));
  assert('6d. opaque, so nothing beneath it is legible', /backgroundColor: colors\.surface/.test(BUTTON));
  assert('6e. lifted by a semantic elevation rather than a painted band', /\.\.\.cardShadow/.test(BUTTON));
  assert('6f. still 44pt and still one control', /width: SETTINGS_ACTION_SIZE/.test(BUTTON) && (ROOT_NAV.match(/<GlobalSettingsButton/g) || []).length === 1);
  assert('6g. every root still reserves title space, so no heading starts under it', /paddingRight: SETTINGS_HEADER_INSET/.test(strip(read('src/components/shared/Screen.tsx'))) && /paddingRight: SETTINGS_HEADER_INSET/.test(TODAY));
  assert('6h. and no raw colour was introduced', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(BUTTON));

  // The preserved timing correction.
  assert('6i. the transition-aware closing projection survives', /resolveEffectiveRootRoute\(/.test(ROOT_NAV));
  assert('6j. the shell is still always mounted and gates visually', /hidden=\{!assembly\.visible\}/.test(strip(read('src/components/navigation/GlobalNavDock.tsx'))) && !/if \(!visible\) return null;/.test(BUTTON));
  assert('6k. and still no timer, debounce or delayed callback', !/setTimeout|setInterval|requestAnimationFrame|debounce\(/.test(ROOT_NAV + BUTTON));

  // B. The Score sheet.
  assert('6l. exactly ONE vertical scroll owner in the sheet', (SHEET.match(/<ScrollView/g) || []).length === 1);
  assert('6m. no factor-list maxHeight remains', !/factorList|maxHeight: \d/.test(SHEET));
  assert('6n. the only maxHeight is the sheet\'s own', (SHEET.match(/maxHeight/g) || []).length === 1 && /maxHeight: '88%'/.test(SHEET));
  assert('6o. the score summary is INSIDE the scroll owner', SHEET.indexOf('testID="score-sheet-scroll"') < SHEET.indexOf('styles.totalValue'));
  assert('6p. so are the insight panels and every category', SHEET.indexOf('testID="score-sheet-scroll"') < SHEET.indexOf('result.categories.map'));
  assert('6q. and the disclaimer', SHEET.indexOf('testID="score-sheet-scroll"') < SHEET.indexOf('styles.disclosure') && SHEET.indexOf('styles.disclosure') < SHEET.indexOf('</ScrollView>'));
  assert('6r. the fixed footer is gone', !/closeButton|closeText/.test(SHEET));
  assert('6s. replaced by exactly one Close, in the compact header, at 44pt', (SHEET.match(/accessibilityLabel="Close"/g) || []).length === 1 && /headerClose: \{ width: 44, height: 44/.test(SHEET));
  assert('6t. the title stays in that compact header, above the scrolling body', SHEET.indexOf('styles.sheetHeader') < SHEET.indexOf('testID="score-sheet-scroll"'));
  assert('6u. no nested vertical scrolling was introduced', (SHEET.match(/<ScrollView|<FlatList|<SectionList/g) || []).length === 1);
  assert('6v. and no Score value is recomputed in presentation', !/computeLuluScore|Math\.max\(0, Math\.min\(100/.test(SHEET) && /result\.score/.test(SHEET));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
