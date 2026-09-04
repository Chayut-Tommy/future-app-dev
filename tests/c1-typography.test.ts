// Pass C.1 presentation — "Why this amount?" typography migration (§6/§8).
// The LookAheadSheet must resolve every text role through the Design 5.1
// typography authority (typeStyle/textStyle → fontFamilyForWeight), never raw
// legacy roles or a synthetic fontWeight on a family-only font.
//
// Run with: npx tsx tests/c1-typography.test.ts

import { readFileSync } from 'fs';
import { join } from 'path';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const CODE = readFileSync(join(process.cwd(), 'src/components/money/LookAheadSheet.tsx'), 'utf8');
// Strip comments so prose mentioning a banned token never trips a check.
const SRC = CODE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

assert('uses the Design 5.1 typography authority (typeStyle/textStyle)', /\btypeStyle\(/.test(SRC) && /\btextStyle\(/.test(SRC));
assert('no raw legacy role from the theme typography object (heading/body/caption)', !/typography\.(heading|body|caption|title|micro)\b/.test(SRC));
assert('no synthetic fontWeight override anywhere in the component', !/fontWeight\s*:/.test(SRC));
assert('no hard-coded fontFamily override (family comes from the role authority)', !/fontFamily\s*:/.test(SRC));
assert('the dominant amount uses a figure role', /textStyle\('figure(Large|Hero)'/.test(SRC));
assert('section headings use a title role', /typeStyle\('title(Card|Section)'/.test(SRC));
assert('monetary values use the figureRow (tabular money) role', /typeStyle\('figureRow'/.test(SRC));
assert('secondary/supporting copy uses support/meta roles', /typeStyle\('support'/.test(SRC) && /typeStyle\('meta'/.test(SRC));
// Only roles from the approved set may be referenced.
const roles = [...SRC.matchAll(/type(?:Style|)\('([a-zA-Z]+)'/g), ...SRC.matchAll(/textStyle\('([a-zA-Z]+)'/g)].map((m) => m[1]);
const VALID = new Set(['figureHero', 'figureLarge', 'figureRow', 'titleScreen', 'titleSection', 'titleCard', 'body', 'support', 'meta', 'eyebrow', 'labelButton', 'labelTab']);
assert(`every referenced role is an approved Design 5.1 role (${[...new Set(roles)].join(', ')})`, roles.every((r) => VALID.has(r)));
// The sheet title itself is owned by KeyboardSheet, which already resolves its
// family through the authority — so the whole sheet is consistent.
const KS = readFileSync(join(process.cwd(), 'src/components/shared/KeyboardSheet.tsx'), 'utf8');
assert('the host sheet title resolves its family through fontFamilyForWeight', /fontFamilyForWeight\(/.test(KS));

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
