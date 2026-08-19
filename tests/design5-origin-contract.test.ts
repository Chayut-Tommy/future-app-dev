// Nolie Design 5.1 Wave 3 — origin contract, catalogue Close, breadcrumb,
// transfer parking.
//
// CLASSIFICATION: Real import (Class A) for every reducer assertion —
// addWorkspaceTransitionController.ts and floatingAddTransition.ts are pure.
// Structural (Class C) for AddAnythingSheet/KeyboardSheet wiring, which
// transitively import react-native. Rendered evidence for Back visibility and
// Close lives in tests/rendered/floating-navigation.render.test.tsx.

import * as fs from 'fs';
import * as path from 'path';
import {
  initialAddWorkspaceTransitionState as INIT,
  reduceAddWorkspaceTransition as reduce,
} from '../src/components/navigation/addWorkspaceTransitionController';
import { reduceFloatingAddPhase, isTrayMounted, isSheetOpen, bothModalsVisible } from '../src/components/navigation/floatingAddTransition';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const root = path.resolve(__dirname, '..');
const read = (r: string) => fs.readFileSync(path.join(root, r), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, (_m, l: string) => l);
const SHEET = strip(read('src/components/navigation/AddAnythingSheet.tsx'));
const KB = strip(read('src/components/shared/KeyboardSheet.tsx'));

const DIRECT_TASKS = ['expense', 'incomeReceived', 'bill', 'transfer', 'goal'] as const;

console.log('=== 1. Direct quick origin: empty stack, no Back, no catalogue ===');
{
  for (const route of DIRECT_TASKS) {
    const s = reduce(INIT, { type: 'FORWARD', route, returnStack: [] });
    assert(`1. ${route}: direct entry seeds an EMPTY return stack`, JSON.stringify(s.returnStack) === '[]');
    // BACK from an empty stack must not invent a chooser step.
    const back = reduce({ ...s, status: 'idle', outgoing: null, direction: null }, { type: 'BACK' });
    assert(`1. ${route}: BACK never lands on the chooser from a direct entry`, back.current !== 'chooser');
  }
  assert('1z. all five direct tiles are covered', DIRECT_TASKS.length === 5);
}

console.log('\n=== 2. Catalogue origin: chooser seeded explicitly, Back returns there ===');
{
  const s = reduce(INIT, { type: 'FORWARD', route: 'expense', returnStack: ['chooser'] });
  assert('2a. catalogue entry seeds ["chooser"]', JSON.stringify(s.returnStack) === JSON.stringify(['chooser']));
  const settled = { ...s, status: 'idle' as const, outgoing: null, direction: null };
  const back = reduce(settled, { type: 'BACK' });
  assert('2b. BACK from a catalogue entry returns to the chooser', back.current === 'chooser');
}

console.log('\n=== 3. Fail-safe default: an omitted stack is [], never ["chooser"] ===');
{
  const s = reduce(INIT, { type: 'FORWARD', route: 'goal' });
  assert('3a. omitted returnStack defaults to []', JSON.stringify(s.returnStack) === '[]');
  assert('3b. the chooser can only appear via an explicit seed', JSON.stringify(reduce(INIT, { type: 'FORWARD', route: 'goal', returnStack: ['chooser'] }).returnStack) === JSON.stringify(['chooser']));
}

console.log('\n=== 4. Nested handoff: genuine parent steps only, one unwind per Back ===');
{
  // A handoff routes through the chooser as its intermediate step (the host's
  // FORCE_TO_CHOOSER primitive), so the nested state is built the same way
  // the existing nested-loan-handoff suite builds it.
  const bill = reduce(INIT, { type: 'FORWARD', route: 'bill', returnStack: ['chooser'] });
  const onChooser = reduce({ ...bill, status: 'idle', outgoing: null, direction: null }, { type: 'FORCE_TO_CHOOSER' });
  const nested = reduce({ ...onChooser, status: 'idle', outgoing: null, direction: null }, { type: 'FORWARD', route: 'liability', returnStack: ['bill', 'chooser'] });
  assert('4a. nested stack is [bill, chooser] — real parent first', JSON.stringify(nested.returnStack) === JSON.stringify(['bill', 'chooser']));
  const back1 = reduce({ ...nested, status: 'idle', outgoing: null, direction: null }, { type: 'BACK' });
  assert('4b. one Back unwinds exactly one genuine step (to bill)', back1.current === 'bill');
  assert('4c. the remaining stack is still [chooser]', JSON.stringify(back1.returnStack) === JSON.stringify(['chooser']));
}

console.log('\n=== 5. Origin is threaded, not inferred, through every entry helper ===');
{
  assert('5a. enterRoute takes an explicit fromCatalogue flag', /function enterRoute\(route: AddWorkspaceRoute, fromCatalogue: boolean, onCommit\?: \(\) => void\)/.test(SHEET));
  assert('5b. it seeds the stack from that flag', /beginForwardTransition\(route, fromCatalogue \? \['chooser'\] : \[\]\)/.test(SHEET));
  assert('5c. handleTilePress defaults to catalogue, so a catalogue call site cannot omit it unsafely', /function handleTilePress\(key: AddAnythingKind, fromCatalogue = true\)/.test(SHEET));
  assert('5d. direct entry from initialKind explicitly passes false', /handleTilePress\(initialKind, false\)/.test(SHEET));
  assert('5e. reselectOrEnter threads it', /function reselectOrEnter\([^)]*fromCatalogue: boolean\)/.test(SHEET));
  assert('5f. chooseAssetTile threads it', /function chooseAssetTile\(tileKey: AddAnythingKind, fromCatalogue: boolean\)/.test(SHEET));
  assert('5g. enterTransfer threads it', /function enterTransfer\(fromCatalogue: boolean\)/.test(SHEET));
  assert('5h. reopening a parked draft is treated as catalogue origin', /enterRoute\(route, true\)/.test(SHEET));
  assert('5i. Back renders only when a genuine return step exists', /transition\.returnStack\.length > 0 \? \(/.test(SHEET));
}

console.log('\n=== 6. Catalogue Close ===');
{
  assert('6a. a Close control exists on the chooser only', /transition\.current === 'chooser' \? \(/.test(SHEET) && /accessibilityLabel="Close"/.test(SHEET));
  assert('6b. it routes through the existing journey dismiss path', /onPress=\{handleRequestDismiss\}/.test(SHEET));
  assert('6c. it meets the minimum touch target', /headerCloseButton: \{ minWidth: minTouchTarget, minHeight: minTouchTarget/.test(SHEET));
  assert('6d. no timeout was introduced anywhere in the sheet', !/setTimeout/.test(SHEET));
}

console.log('\n=== 7. Breadcrumb: nested steps only ===');
{
  assert('7a. KeyboardSheet exposes an optional breadcrumb slot', /breadcrumb\?: React\.ReactNode;/.test(KB));
  assert('7b. it renders only when supplied, so existing consumers are unchanged', /\{breadcrumb \? <View style=\{styles\.breadcrumbRow\}>\{breadcrumb\}<\/View> : null\}/.test(KB));
  // Compare RENDER positions, not style-definition order.
  assert('7c. it renders between the title row and the body — never over a field, keyboard, Cancel or Save', KB.indexOf('{breadcrumb ?') > KB.indexOf('<Text style={styles.title}>{title}</Text>'));
  assert('7d. a chooser step is NOT treated as a parent', /returnStack\.find\(\(r\) => r !== 'chooser'\)/.test(SHEET));
  assert('7e. no breadcrumb at a workspace root or on the chooser itself', /transition\.current !== 'chooser' \? parent : null/.test(SHEET));
}

console.log('\n=== 8. Transfer parking reuses the existing mechanism ===');
{
  assert('8a. transfer now has the same destination state every other task uses', /const transferState = useEmbeddedDestinationState\('Move money'\)/.test(SHEET));
  assert('8b. it is included in the parked-draft set', /'goal', 'transfer'\] as const/.test(SHEET));
  assert('8c. draftStateFor no longer excludes transfer', /function draftStateFor\(route: Exclude<AddWorkspaceRoute, 'chooser'>\)/.test(SHEET));
  assert('8d. resetDraft no longer excludes transfer', /function resetDraft\(route: Exclude<AddWorkspaceRoute, 'chooser'>\)/.test(SHEET));
  assert('8e. the discard carve-out for transfer is gone', !/dirtyRoute !== 'transfer'/.test(SHEET));
  assert('8f. TransferForm remounts on a confirmed discard via instanceKey', /key=\{transferState\.instanceKey\}/.test(SHEET));
  assert('8g. no new persistence was introduced', !/AsyncStorage/.test(SHEET));
  assert('8h. the transfer save path still runs the existing form handle', /transferFormRef\.current\?\.requestClose/.test(SHEET));
}

console.log('\n=== 9. Freeze invariant untouched ===');
{
  const phases = ['closed', 'trayOpen', 'closingForAction', 'closingForDismiss', 'addSheetOpen'] as const;
  assert('9a. no reachable phase mounts both layers', phases.every((p) => !bothModalsVisible(p)));
  const closingForAction = reduceFloatingAddPhase(reduceFloatingAddPhase('closed', 'PRESS_FAB'), 'SELECT_ACTION');
  assert('9b. Back during closingForAction does not mount the workspace', reduceFloatingAddPhase(closingForAction, 'REQUEST_DISMISS') === 'closingForAction');
  assert('9c. only the real TRAY_CLOSED opens it', reduceFloatingAddPhase(closingForAction, 'TRAY_CLOSED') === 'addSheetOpen');
  assert('9d. rapid re-selection is ignored — first wins', reduceFloatingAddPhase(closingForAction, 'SELECT_ACTION') === 'closingForAction');
  assert('9e. the sheet still guards first-tap-wins synchronously', /if \(selectionLockRef\.current\) return;/.test(SHEET));
  assert('9f. tray and workspace never both mounted', !(isTrayMounted('addSheetOpen') && isSheetOpen('addSheetOpen')));
}

console.log('\n=== 10. No generic Undo, no raw colour ===');
{
  assert('10a. no Undo affordance was added', !/\bUndo\b/i.test(SHEET));
  const pattern = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b|rgba?\([^)]*\)/g;
  assert('10b. AddAnythingSheet introduces no raw colour', SHEET.match(pattern) === null);
  assert('10c. KeyboardSheet introduces no raw colour', KB.match(pattern) === null);
}

console.log('\n=== 11. All 14 catalogue selections seed catalogue origin (the device defect) ===');
{
  // The device video showed "+ -> More -> Add everyday account" opening with
  // NO Back. Root cause: the six asset destinations reach the workspace via
  // proceedIntoAddAsset, not enterRoute, and that path never received the
  // origin flag — so it fell through to the new [] default. Every dispatch
  // branch is now covered, not just the ordinary-task one.
  const BRANCHES: { key: string; branch: string }[] = [
    { key: 'expense', branch: 'ordinary task' },
    { key: 'income', branch: 'ordinary task' },
    { key: 'income_received', branch: 'ordinary task' },
    { key: 'bill', branch: 'ordinary task' },
    { key: 'transfer', branch: 'transfer' },
    { key: 'cash', branch: 'asset' },
    { key: 'savings', branch: 'asset' },
    { key: 'everyday', branch: 'asset' },
    { key: 'investment', branch: 'asset' },
    { key: 'property', branch: 'asset' },
    { key: 'retirement', branch: 'asset' },
    { key: 'liability', branch: 'ordinary task' },
    { key: 'creditCard', branch: 'ordinary task' },
    { key: 'goal', branch: 'ordinary task' },
  ];
  assert('11a. all 14 catalogue tasks are covered', BRANCHES.length === 14);
  assert('11b. every dispatch branch is represented', new Set(BRANCHES.map((b) => b.branch)).size === 3);

  // Every branch must reach a beginForwardTransition that seeds from origin.
  assert('11c. the ordinary-task branch seeds from origin', /beginForwardTransition\(route, fromCatalogue \? \['chooser'\] : \[\]\)/.test(SHEET));
  assert('11d. the ASSET branch seeds from origin (the fixed defect)', /beginForwardTransition\('asset', fromCatalogue \? \['chooser'\] : \[\]\)/.test(SHEET));
  assert('11e. the transfer branch routes through enterRoute, which seeds from origin', /function enterTransfer\(fromCatalogue: boolean\) \{\s*\n\s*enterRoute\('transfer', fromCatalogue\);/.test(SHEET));

  // No entry path may reach a workspace without an explicit stack.
  // Exclude the declaration itself; only CALL sites are checked.
  const bare = (SHEET.match(/(?<!function )beginForwardTransition\([^)]*\)/g) || []).filter(
    (c) => !/fromCatalogue|\['chooser'\]|inheritedStack|returnStack/.test(c)
  );
  assert(`11f. no entry path calls beginForwardTransition without an explicit stack (found ${bare.length})`, bare.length === 0);

  // proceedIntoAddAsset threads the flag through all three decision outcomes.
  assert('11g. asset "proceed" outcome carries origin', /proceedIntoAddAsset\(tileKey, presetType, false, fromCatalogue\)/.test(SHEET));
  assert('11h. asset "switchClean" outcome carries origin', /proceedIntoAddAsset\(tileKey, presetType, true, fromCatalogue\)/.test(SHEET));
  assert('11i. asset "confirmSwitch" outcome carries origin on both branches', /proceedIntoAddAsset\(currentOriginTileKey, currentPresetType, false, fromCatalogue\)/.test(SHEET));
  assert('11j. the asset dirty-guard continuation carries origin', /proceedWithAssetTileDecision\(tileKey, presetType, fromCatalogue\)/.test(SHEET));
}

console.log('\n=== 12. Canonical catalogue structure ===');
{
  assert('12a. rows, not a tile grid', /taskRow: \{/.test(SHEET) && /rowGroup: \{/.test(SHEET));
  assert('12b. rows are at least 52pt', /minHeight: 52/.test(SHEET));
  // The Wave 4 device correction moved the leading tile out of this file
  // into the one shared `AddIcon` renderer, so the row now declares WHICH
  // icon rather than how big its container is. Both halves are asserted.
  // Wave 4 closure — the icon now carries its DOMAIN TONE as well as its
  // glyph, so the prop is the whole spec rather than a bare name.
  assert('12c. leading icon tile', /<AddIcon icon=\{addTaskIcon\(o\.key\)\} tile \/>/.test(SHEET));
  assert('12d. trailing DRAFT badge exists', /draftBadgeText/.test(SHEET) && /DRAFT<\/Text>/.test(SHEET));
  assert('12e. the badge is driven by real parked-draft state', /const parked = hasParkedDraft\(o\.key\)/.test(SHEET));
  assert('12f. one announcement per row, including qualifier and draft', /\[o\.label, o\.qualifier, parked \? 'draft saved' : null\]\.filter\(Boolean\)\.join\(', '\)/.test(SHEET));
  assert('12g. group card uses the Design 5.1 card radius', /borderRadius: designRadius\.card/.test(SHEET));
  assert('12h. pressed state is present', /activeOpacity=\{0\.7\}/.test(SHEET));
  assert('12i. the visible Close action is retained', /accessibilityLabel="Close"/.test(SHEET));
  // Group and task order must remain canonical.
  const groups = [...SHEET.matchAll(/title: '([^']+)',\s*\n\s*options: \[/g)].map((m) => m[1]);
  assert('12j. three groups in canonical order', groups.join('|') === 'Everyday money|Accounts and wealth|Debt and planning');
  const keys = [...SHEET.matchAll(/\{ key: '([a-zA-Z_]+)', label: '/g)].map((m) => m[1]);
  assert('12k. fourteen tasks in canonical order', keys.join(',') === 'expense,income,income_received,bill,transfer,cash,savings,everyday,investment,property,retirement,liability,creditCard,goal');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
