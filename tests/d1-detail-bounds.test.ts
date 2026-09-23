// Pass D.1 — pure proofs for the timeline event detail's dock-aware bounds. The space
// comes from ONE authority (`screenBottomClearance`, the same value the shared Screen
// pads its content with) — never a device-specific number. Rendered proofs:
// tests/rendered/d1-detail-clearance.render.test.tsx.
// Run with: npx tsx tests/d1-detail-bounds.test.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { BALANCE_PATH_MIN_TARGET, DETAIL_MIN_HEIGHT, DETAIL_VIEWPORT_GAP, resolveDetailMaxHeight, resolveDetailReveal } from '../src/lib/calculations/balancePathInteraction';
import { DOCK_BOTTOM_SPACING, DOCK_HEIGHT, screenBottomClearance } from '../src/navigation/floatingNavGeometry';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }

// Real device classes: [name, window height, top inset, bottom inset].
const DEVICES: [string, number, number, number][] = [
  ['iPhone SE (320pt class)', 568, 20, 0],
  ['iPhone 13 mini', 812, 50, 34],
  ['iPhone 15 Pro', 852, 59, 34],
  ['iPhone 15 Pro Max (the recording)', 932, 59, 34],
];
const viewport = (h: number, top: number, bottom: number) => ({ windowHeight: h, topInset: top, bottomClearance: screenBottomClearance(bottom) });

assert('the clearance is the shared dock authority: inset + spacing + dock + spacing', screenBottomClearance(34) === 34 + DOCK_BOTTOM_SPACING + DOCK_HEIGHT + DOCK_BOTTOM_SPACING && screenBottomClearance(0) === DOCK_HEIGHT + DOCK_BOTTOM_SPACING * 2);
for (const [name, h, top, bottom] of DEVICES) {
  const v = viewport(h, top, bottom);
  const max = resolveDetailMaxHeight(v);
  const clear = h - top - v.bottomClearance;
  assert(`${name}: marker band + gaps + the tallest detail fit between the safe area and the dock (${max}pt of ${clear}pt)`, max + BALANCE_PATH_MIN_TARGET + DETAIL_VIEWPORT_GAP * 2 <= clear && max >= DETAIL_MIN_HEIGHT);
  // A detail at its maximum height, opened with its marker band at the very bottom of the screen.
  const frameY = h - 40;
  const y = resolveDetailReveal({ ...v, frameY, frameHeight: max, scrollY: 300 });
  const restingBottom = frameY + max - (y! - 300);
  const restingTop = frameY - (y! - 300);
  assert(`${name}: after the reveal the detail rests above the dock and its marker band is still below the top safe area`, y !== null && restingBottom <= h - v.bottomClearance - DETAIL_VIEWPORT_GAP + 0.5 && restingTop - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP >= top - 0.5);
}
const v = viewport(932, 59, 34);
assert('the recording: a 420pt detail opened at y=690 moves the page by exactly its overflow', resolveDetailReveal({ ...v, frameY: 690, frameHeight: 420, scrollY: 0 }) === 690 + 420 - (932 - 114 - DETAIL_VIEWPORT_GAP));
assert('a detail already clear of the dock moves nothing', resolveDetailReveal({ ...v, frameY: 300, frameHeight: 200, scrollY: 80 }) === null);
assert('a detail exactly on the clear line moves nothing (no sub-point jitter)', resolveDetailReveal({ ...v, frameY: 932 - 114 - DETAIL_VIEWPORT_GAP - 200, frameHeight: 200, scrollY: 80 }) === null && resolveDetailReveal({ ...v, frameY: 932 - 114 - DETAIL_VIEWPORT_GAP - 200 + 0.4, frameHeight: 200, scrollY: 80 }) === null);
assert('the page only ever moves DOWN the content, from the current offset', (resolveDetailReveal({ ...v, frameY: 700, frameHeight: 300, scrollY: 1234 }) ?? 0) > 1234);
assert('the marker band is never pushed above the top safe area, even for an oversized frame', (() => { const y = resolveDetailReveal({ ...v, frameY: 200, frameHeight: 5000, scrollY: 0 }); return y === 200 - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP - 59; })());
assert('short details get no extra space: the bound is a MAXIMUM, never a height', resolveDetailMaxHeight(v) > 600 && resolveDetailReveal({ ...v, frameY: 400, frameHeight: 120, scrollY: 0 }) === null);
assert('degenerate viewports fall back to the minimum; invalid frames do nothing', resolveDetailMaxHeight({ windowHeight: 200, topInset: 0, bottomClearance: 80 }) === DETAIL_MIN_HEIGHT && resolveDetailMaxHeight({ windowHeight: NaN, topInset: 0, bottomClearance: 80 }) === DETAIL_MIN_HEIGHT && resolveDetailReveal({ ...v, frameY: NaN, frameHeight: 100, scrollY: 0 }) === null && resolveDetailReveal({ ...v, frameY: 900, frameHeight: 0, scrollY: 0 }) === null);
assert('negative insets are treated as zero', resolveDetailMaxHeight({ windowHeight: 800, topInset: -10, bottomClearance: 100 }) === resolveDetailMaxHeight({ windowHeight: 800, topInset: 0, bottomClearance: 100 }));

// ── structure ──
const strip = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const money = strip('screens/money/MoneyScreen.tsx');
assert('Money derives the bound from the shared dock geometry and real insets — no device number', /screenBottomClearance\(insets\.bottom\)/.test(money) && /useSafeAreaInsets\(\)/.test(money) && /useWindowDimensions\(\)/.test(money) && /resolveDetailMaxHeight\(detailViewport\)/.test(money));
const reveal = money.slice(money.indexOf('const revealDetail'), money.indexOf('const resolveRailReview'));
assert('the reveal is presentation only: one scrollTo, Reduce Motion aware, no state owner, storage or mutation', /scrollTo\(\{ y, animated: !reduceMotion \}\)/.test(reveal) && !/persist|AsyncStorage|updateUser|set[A-Z]\w*\(/.test(reveal));
const rail = strip('components/money/FutureTimelineRail.tsx') + strip('components/money/TimelineEventDetail.tsx') + strip('components/money/TimelineHitTargets.tsx');
assert('the fix is not a stacking trick: the rail sets no zIndex, elevation, absolute detail or hidden overflow', !/zIndex|elevation/.test(rail) && !/detail\w*: \{[^}]*(position: 'absolute'|overflow: 'hidden')/.test(rail));
assert('no text was shrunk and no target reduced to make it fit', !/adjustsFontSizeToFit|minimumFontScale/.test(rail) && !/numberOfLines|ellipsizeMode/.test(rail.slice(rail.indexOf('{inspection ? ('))) && rail.indexOf('{inspection ? (') > 0 && /minHeight: designLayout\.touchTargetMin/.test(rail));
const body = strip('components/money/TimelineDetailBody.tsx');
assert('the detail body scrolls vertically only, never bounces the page, and holds no state owner', /nestedScrollEnabled/.test(body) && /bounces=\{false\}/.test(body) && !/horizontal|pagingEnabled|useAppState|AsyncStorage|Animated/.test(body));
const screenShell = strip('components/shared/Screen.tsx');
assert('the shared Screen is unchanged for every other consumer: a scroll listener exists only on request', /largeTitle \|\| onScrollY \? \{ onScroll, scrollEventThrottle: 16 \} : \{\}/.test(screenShell) && /if \(!largeTitle\) return;/.test(screenShell));

// Pass D.3 (F5) — the reveal is anchored to the MARKER BAND's own window top.
assert('with the band measured, the page never moves so far that the band leaves the top safe area', (() => { const v2 = viewport(932, 59, 34); const y = resolveDetailReveal({ ...v2, frameY: 300, frameHeight: 5000, scrollY: 0, anchorY: 190 }); return y === 190 - DETAIL_VIEWPORT_GAP - 59; })());
assert('the recording (12–15 Oct): a max-height detail whose band sits 110pt above it moves by the overflow, and the band stays on screen', (() => { const v2 = viewport(932, 59, 34); const between = 110 - BALANCE_PATH_MIN_TARGET; const height = resolveDetailMaxHeight(v2) - between; /* the rail subtracts the rows between band and detail from the host bound */ const frameY = 760; const y = resolveDetailReveal({ ...v2, frameY, frameHeight: height, scrollY: 0, anchorY: frameY - 110 }); if (y === null) return false; return frameY - 110 - y >= 59 + DETAIL_VIEWPORT_GAP - 0.5 && frameY + height - y <= 932 - 114 - DETAIL_VIEWPORT_GAP + 0.5; })());
assert('a band already at the top: an overflowing detail moves nothing rather than pushing the band off screen', resolveDetailReveal({ ...v, frameY: 200, frameHeight: 900, scrollY: 0, anchorY: 59 + DETAIL_VIEWPORT_GAP }) === null);
assert('without a band measurement the D.1 estimate (one target height above the detail) still applies', resolveDetailReveal({ ...v, frameY: 200, frameHeight: 5000, scrollY: 0 }) === 200 - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP - 59);

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
