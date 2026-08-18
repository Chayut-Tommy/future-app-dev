// Nolie Design 5.1 Wave 3 Pass A — six-action tray + canonical catalogue.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): quickActions.ts is pure and RN-free, so every
//   tray assertion executes the real production functions.
// - Structural (Class C): AddAnythingSheet.tsx and QuickActionsTray.tsx
//   transitively import react-native and cannot be executed by this harness,
//   so the catalogue inventory and tray geometry are matched against the real
//   shipped source. Rendered behaviour is covered by the RNTL suites.
//
// Run with: ./node_modules/.bin/tsx tests/design5-add-architecture.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { QUICK_ACTION_ORDER, buildQuickActionTiles, resolveQuickAction } from '../src/components/navigation/quickActions';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, (_m, l: string) => l);
const SHEET = read('src/components/navigation/AddAnythingSheet.tsx');
const SHEET_CODE = stripComments(SHEET);
const TRAY_CODE = stripComments(read('src/components/navigation/QuickActionsTray.tsx'));

console.log('=== 1. The tray is exactly six tiles, in the design order ===');
{
  assert('1a. exactly six quick actions', QUICK_ACTION_ORDER.length === 6);
  assert('1b. no duplicate keys', new Set(QUICK_ACTION_ORDER).size === 6);
  assert(
    '1c. order is record_spending, income_received, add_bill, move_money, add_goal, more',
    QUICK_ACTION_ORDER.join(',') === 'record_spending,income_received,add_bill,move_money,add_goal,more'
  );
  const tiles = buildQuickActionTiles();
  assert('1d. six tiles are built, in that same order', tiles.length === 6 && tiles.every((t, i) => t.key === QUICK_ACTION_ORDER[i]));
  assert(
    '1e. labels match Design 5.1 exactly',
    tiles.map((t) => t.label).join('|') === 'Record spending|Income received|Add bill|Move money|Add goal|More'
  );
  assert('1f. every tile has an icon', tiles.every((t) => typeof t.icon === 'string' && t.icon.length > 0));
}

console.log('\n=== 2. Every tile resolves to the correct canonical destination ===');
{
  const expected: Record<string, string | undefined> = {
    record_spending: 'expense',
    income_received: 'income_received',
    add_bill: 'bill',
    move_money: 'transfer',
    add_goal: 'goal',
    more: undefined,
  };
  for (const [key, kind] of Object.entries(expected)) {
    assert(`2. ${key} -> ${kind ?? 'catalogue (no initialKind)'}`, resolveQuickAction(key as never).sheet?.initialKind === kind);
  }
  assert('2g. More is the ONLY tile that opens the catalogue', QUICK_ACTION_ORDER.filter((k) => resolveQuickAction(k).opensCatalogue).join(',') === 'more');
  assert('2h. no tile resolves to a duplicate destination', (() => {
    const kinds = QUICK_ACTION_ORDER.map((k) => resolveQuickAction(k).sheet?.initialKind).filter(Boolean);
    return new Set(kinds).size === kinds.length;
  })());
  assert('2i. no generic "Add asset" or "Add account" umbrella action survives', !QUICK_ACTION_ORDER.some((k) => /asset|account|anything|debt/i.test(k)));
}

console.log('\n=== 3. Ask Nolie is unreachable from the tray ===');
{
  const src = read('src/components/navigation/quickActions.ts');
  assert('3a. quickActions.ts no longer imports the Ask Nolie capability', !/askNolie/i.test(stripComments(src)));
  assert('3b. the tray no longer imports it either', !/askNolie/i.test(TRAY_CODE));
  assert('3c. no tile key or label mentions Ask', buildQuickActionTiles().every((t) => !/ask/i.test(t.key) && !/ask/i.test(t.label)));
  assert('3d. the catalogue has no Ask row', !/ask\s*nolie|askLulu/i.test(SHEET_CODE));
  // The module itself is retained for future use — only unwired.
  assert('3e. the Ask Nolie module is preserved on disk (deferred, not deleted)', fs.existsSync(path.join(root, 'src/lib/askNolie.ts')));
}

console.log('\n=== 4. The catalogue is exactly 14 tasks in three groups ===');
{
  const keys = [...SHEET_CODE.matchAll(/\{ key: '([a-zA-Z_]+)', label: '/g)].map((m) => m[1]);
  assert(`4a. exactly 14 catalogue tasks (found ${keys.length})`, keys.length === 14);
  assert('4b. no duplicate task ids', new Set(keys).size === keys.length);
  const expected = ['expense', 'income', 'income_received', 'bill', 'transfer', 'cash', 'savings', 'everyday', 'investment', 'property', 'retirement', 'liability', 'creditCard', 'goal'];
  assert('4c. the 14 tasks are exactly the canonical AddAnythingKind set, in design order', keys.join(',') === expected.join(','));

  const groups = [...SHEET_CODE.matchAll(/title: '([^']+)',\s*\n\s*options: \[/g)].map((m) => m[1]);
  assert('4d. exactly three groups', groups.length === 3);
  assert('4e. groups are Everyday money / Accounts and wealth / Debt and planning', groups.join('|') === 'Everyday money|Accounts and wealth|Debt and planning');
}

console.log('\n=== 5. Catalogue labels and qualifiers match Design 5.1 ===');
{
  for (const [key, label] of [
    ['expense', 'Record spending'],
    ['income', 'Add income source'],
    ['income_received', 'Record income received'],
    ['bill', 'Add bill'],
    ['transfer', 'Move money'],
    ['cash', 'Add cash'],
    ['savings', 'Add savings'],
    ['everyday', 'Add everyday account'],
    ['investment', 'Add investment'],
    ['property', 'Add property'],
    ['retirement', 'Add retirement savings'],
    ['liability', 'Add debt'],
    ['creditCard', 'Add credit card'],
    ['goal', 'Add goal'],
  ] as const) {
    assert(`5. ${key} is labelled "${label}"`, new RegExp(`\\{ key: '${key}', label: '${label}'`).test(SHEET_CODE));
  }
  assert('5o. income source is qualified "recurring"', /key: 'income', label: 'Add income source', qualifier: 'recurring'/.test(SHEET_CODE));
  assert('5p. income received is qualified "one-off"', /key: 'income_received'[^}]*qualifier: 'one-off'/.test(SHEET_CODE));
  assert('5q. retirement savings is qualified "super"', /key: 'retirement'[^}]*qualifier: 'super'/.test(SHEET_CODE));
  assert('5r. debt is qualified "loan / BNPL"', /key: 'liability'[^}]*qualifier: 'loan \/ BNPL'/.test(SHEET_CODE));
  assert('5s. no generic "Add asset" or "Add liability" label remains', !/label: 'Add asset'|label: 'Add liability'/.test(SHEET_CODE));
  assert('5t. no generic "Add expense" or "Transfer money" label remains', !/label: 'Add expense'|label: 'Transfer money'/.test(SHEET_CODE));
}

console.log('\n=== 6. Catalogue header copy ===');
{
  assert('6a. title is "Add to Nolie" (built from the brand constant)', /Add to \$\{brand\.name\}/.test(SHEET_CODE));
  assert('6b. subtitle is the Design 5.1 standing line', SHEET_CODE.includes('Everything you can record, in one place.'));
  assert('6c. scoped balance choosers keep their own narrower prompt', SHEET_CODE.includes('Which kind of balance would you like to add?'));
}

console.log('\n=== 7. Tray geometry: 3x2 standard, 2x3 compact/accessibility ===');
{
  assert('7a. the row split is computed from a column count, not a hardcoded 3x3 slice', /const columns = compactLayout \? 2 : 3;/.test(TRAY_CODE));
  assert('7b. rows are chunked by that column count', /i \+= columns/.test(TRAY_CODE));
  assert('7c. no 3x3 slice survives', !/slice\(6, 9\)/.test(TRAY_CODE));
  assert('7d. compact is driven by the Design 5.1 breakpoint and font scale', /designLayout\.breakpoints\.compactMax/.test(TRAY_CODE) && /fontScale/.test(TRAY_CODE));
  assert('7e. labels wrap to two lines rather than truncating', /numberOfLines=\{2\}/.test(TRAY_CODE));
  assert('7f. every tile keeps menuitem semantics and an accessible label', /accessibilityRole="menuitem"/.test(TRAY_CODE) && /accessibilityLabel=\{tile\.label\}/.test(TRAY_CODE));
  assert('7g. the tray keeps menu semantics', /accessibilityRole="menu"/.test(TRAY_CODE));
  assert('7h. More is styled distinctly, not disabled (no disabled prop or opacity dimming)', /tile\.isMore && styles\.tileMore/.test(TRAY_CODE) && !/disabled=\{true\}/.test(TRAY_CODE));
}

console.log('\n=== 8. Ratchet: no raw colour, no new legacy token, in touched files ===');
{
  const pattern = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b|rgba?\([^)]*\)/g;
  for (const rel of ['src/components/navigation/quickActions.ts', 'src/components/navigation/QuickActionsTray.tsx', 'src/components/navigation/AddAnythingSheet.tsx']) {
    assert(`8. ${rel} introduces no raw colour`, stripComments(read(rel)).match(pattern) === null);
  }
  assert('8d. the tray reads Design 5.1 semantic roles for its new treatment', /semantic\.(border|bgRaised|textSecondary|textPrimary)/.test(TRAY_CODE));
  assert('8e. the catalogue qualifier uses a semantic ink role', /tileQualifier[\s\S]{0,120}semantic\.textTertiary/.test(SHEET_CODE));
}

console.log('\n=== 9. The phase-machine contract is untouched by Pass A ===');
{
  const fab = stripComments(read('src/components/navigation/FloatingAddButton.tsx'));
  assert('9a. tile selection still dispatches SELECT_ACTION, never mounting a sheet directly', /dispatch\('SELECT_ACTION'\)/.test(fab));
  assert('9b. no timeout coordinates the tray/workspace handoff', !/setTimeout/.test(fab));
  assert('9c. the workspace still opens only from the real onClosed path', /TRAY_CLOSED/.test(stripComments(read('src/components/navigation/floatingAddTransition.ts'))));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
