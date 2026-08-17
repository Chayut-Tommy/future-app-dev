// Nolie Design 5.1 Wave 1B — ZERO raw colour outside src/theme (final gate).
//
// This replaces the Wave 1A debt-budget ratchet
// (tests/design5-raw-colour-budget.test.ts), which allowed a baseline of 76
// while Wave 1A was forbidden from touching feature files. Wave 1B migrated
// that debt, so the gate is now absolute: any hex or rgb/rgba literal
// applied outside src/theme fails the build.
//
// CLASSIFICATION (per tests/README.md):
// - Structural (Class C): a source-text scan. It proves a repository
//   property — that colour has exactly one home — not a runtime one.
// - It edits no existing test and asserts nothing about any existing
//   expectation.
//
// TWO DETECTION CORRECTIONS MADE IN WAVE 1B, both of which the Wave 1A
// scanner got wrong and which any future edit to this file must preserve:
//
//   1. HEX LENGTH. `#[0-9A-Fa-f]{3,8}` matches things that are not colours.
//      It matched the GitHub issue references `#12755` and `#39514` in a
//      MainTabNavigator comment, which inflated the Wave 1A count to 76
//      across 17 files when the real figure was 74 across 16. A CSS/RN hex
//      colour is exactly 3, 4, 6 or 8 digits — never 5 or 7 — so the
//      alternation below is ordered longest-first and anchored with \b.
//
//   2. COMMENTS. A colour named in prose is documentation, not styling.
//      KeyboardSheet.tsx carried one such reference. Comments are stripped
//      before scanning so the gate measures what is APPLIED.
//
// Run with: ./node_modules/.bin/tsx tests/design5-no-raw-colour.test.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

/** src/theme is where colour literals are SUPPOSED to live. */
const EXCLUDED_DIR = path.join('src', 'theme');

/** Exactly 3, 4, 6 or 8 hex digits — the only valid CSS/RN colour lengths. */
const HEX = String.raw`#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b`;
const FUNCTIONAL = String.raw`rgba?\([^)]*\)`;
const COLOUR_PATTERN = new RegExp(`${HEX}|${FUNCTIONAL}`, 'g');

/** Remove block and line comments so prose references are not counted. The
 * `[^:]` guard keeps `https://` inside a string from being treated as a
 * comment start. */
export function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks.replace(/(^|[^:])\/\/.*$/gm, (_m, lead: string) => lead);
}

const repoRoot = path.resolve(__dirname, '..');

function isExcluded(absolutePath: string): boolean {
  const rel = path.normalize(path.relative(repoRoot, absolutePath));
  return rel === EXCLUDED_DIR || rel.startsWith(EXCLUDED_DIR + path.sep);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isExcluded(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = walk(path.join(repoRoot, 'src')).map((f) => path.relative(repoRoot, f));

const offenders: { file: string; literals: string[] }[] = [];
let count = 0;
for (const file of files) {
  const source = stripComments(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  const matches = source.match(COLOUR_PATTERN);
  if (matches && matches.length) {
    offenders.push({ file, literals: matches });
    count += matches.length;
  }
}

console.log('=== 1. Zero applied colour literals outside src/theme ===');
console.log(`Scanned ${files.length} files outside ${EXCLUDED_DIR}.`);
if (offenders.length) {
  for (const o of offenders) console.log(`  ${String(o.literals.length).padStart(3)}  ${o.file}  ->  ${o.literals.join(', ')}`);
}
assert(`1a. zero raw colour literals outside src/theme (found ${count})`, count === 0);
assert('1b. zero offending files', offenders.length === 0);

console.log('\n=== 2. The scanner still detects a real colour (guards against a vacuous pass) ===');
{
  // A gate that cannot fail is worthless. Prove the pattern still fires.
  const probe = (text: string) => (stripComments(text).match(COLOUR_PATTERN) || []).length;
  assert('2a. detects a 6-digit hex', probe("color: '#8FE0B8'") === 1);
  assert('2b. detects a 3-digit hex', probe("color: '#fff'") === 1);
  assert('2c. detects an 8-digit hex', probe("color: '#8FE0B8FF'") === 1);
  assert('2d. detects rgba()', probe("color: 'rgba(255,255,255,0.85)'") === 1);
  assert('2e. detects rgb()', probe("color: 'rgb(1,2,3)'") === 1);
  assert('2f. detects several on one line', probe("a: '#fff', b: 'rgba(0,0,0,0.5)'") === 2);
}

console.log('\n=== 3. The scanner does NOT fire on the two known false-positive classes ===');
{
  const probe = (text: string) => (stripComments(text).match(COLOUR_PATTERN) || []).length;
  // 5-digit GitHub issue references, as in MainTabNavigator.tsx.
  assert('3a. ignores a 5-digit issue reference (#12755)', probe('const a = 1; // see #12755') === 0);
  assert('3b. ignores #39514 even in code position', probe('const issue = "#39514";') === 0);
  assert('3c. ignores a 7-digit token', probe('const x = "#1234567";') === 0);
  // Colours named in prose.
  assert('3d. ignores a colour inside a line comment', probe("// renders rgba(10,12,20,0.45) as before") === 0);
  assert('3e. ignores a colour inside a block comment', probe('/* was #8FE0B8 */') === 0);
  assert('3f. still catches a colour on a line that also has a comment', probe("color: '#fff', // was white") === 1);
  assert('3g. does not treat https:// as a comment', probe("const u = 'https://x/#abcdef';") === 1);
}

console.log('\n=== 4. src/theme is exempt, and genuinely holds the colour ===');
{
  const themeDir = path.join(repoRoot, EXCLUDED_DIR);
  const themeFiles = fs.readdirSync(themeDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  assert('4a. theme directory exists and was excluded', themeFiles.length > 0);
  assert('4b. no scanned file lives under src/theme', files.every((f) => !path.normalize(f).startsWith(EXCLUDED_DIR)));

  let themeColours = 0;
  for (const f of themeFiles) {
    const src = stripComments(fs.readFileSync(path.join(themeDir, f), 'utf8'));
    themeColours += (src.match(COLOUR_PATTERN) || []).length;
  }
  // If this ever hit zero the colour did not move to the theme — it vanished.
  assert(`4c. src/theme still defines the colour (${themeColours} literals)`, themeColours > 100);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
