// Nolie Design 5.1 Wave 1A — font bootstrap state machine.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): imports and executes the actual production
//   resolver src/theme/fontBootState.ts. It was deliberately split out of
//   fonts.ts (which imports expo-font and expo-splash-screen, and therefore
//   reaches react-native) precisely so the pending / loaded / error
//   branches could be proven here for real rather than by regex.
// - NOT proven here: that expo-font actually invokes the resolver with
//   these inputs, or that the native splash truly disappears. The wiring is
//   covered by tests/rendered/design5-font-bootstrap.render.test.tsx under
//   jest-expo, and the real splash behaviour is device evidence.
//
// A NOTE ON "AIRPLANE MODE": airplane mode verifies that the bundled font
// assets are local and need no network. It is NOT a way to simulate a load
// failure. The failure branch is therefore proven here deterministically.
//
// Run with: ./node_modules/.bin/tsx tests/design5-font-boot-state.test.ts

import {
  resolveFontBootState,
  FONT_LOAD_FAILURE_MESSAGE,
} from '../src/theme/fontBootState';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== 1. PENDING — loading genuinely in flight ===');
{
  const s = resolveFontBootState({ fontsLoaded: false, fontError: null });
  assert('1a. status is pending', s.status === 'pending');
  assert('1b. the app tree does NOT mount yet', s.shouldRenderApp === false);
  assert('1c. the splash is HELD', s.shouldReleaseSplash === false);
  assert('1d. not flagged as using fallbacks', s.usingFallbackFonts === false);
}

console.log('\n=== 2. LOADED — the happy path ===');
{
  const s = resolveFontBootState({ fontsLoaded: true, fontError: null });
  assert('2a. status is loaded', s.status === 'loaded');
  assert('2b. the app tree mounts', s.shouldRenderApp === true);
  assert('2c. the splash is RELEASED', s.shouldReleaseSplash === true);
  assert('2d. not using fallbacks', s.usingFallbackFonts === false);
}

console.log('\n=== 3. ERROR — a font failure must never block launch ===');
{
  const s = resolveFontBootState({ fontsLoaded: false, fontError: new Error('asset missing') });
  assert('3a. status is error', s.status === 'error');
  assert('3b. the app tree STILL mounts', s.shouldRenderApp === true);
  assert('3c. the splash is STILL released — no hang', s.shouldReleaseSplash === true);
  assert('3d. flagged as rendering on platform fallbacks', s.usingFallbackFonts === true);
}

console.log('\n=== 4. ERROR takes precedence over a partial load ===');
{
  // expo-font can report loaded alongside an error; in that case we must
  // take the fallback path rather than claim success.
  const s = resolveFontBootState({ fontsLoaded: true, fontError: new Error('partial') });
  assert('4a. status is error, not loaded', s.status === 'error');
  assert('4b. still renders', s.shouldRenderApp === true);
  assert('4c. still releases the splash', s.shouldReleaseSplash === true);
  assert('4d. correctly flagged as using fallbacks', s.usingFallbackFonts === true);
}

console.log('\n=== 5. The splash is released on BOTH terminal outcomes ===');
{
  const loaded = resolveFontBootState({ fontsLoaded: true, fontError: null });
  const errored = resolveFontBootState({ fontsLoaded: false, fontError: new Error('x') });
  const pending = resolveFontBootState({ fontsLoaded: false, fontError: null });
  assert('5a. released when loaded', loaded.shouldReleaseSplash === true);
  assert('5b. released when errored', errored.shouldReleaseSplash === true);
  assert('5c. held ONLY while pending', pending.shouldReleaseSplash === false);
  assert('5d. render and splash-release agree in every state', [loaded, errored, pending].every((s) => s.shouldRenderApp === s.shouldReleaseSplash));
}

console.log('\n=== 6. The resolver is pure and total ===');
{
  // No timing branch exists by design: a timeout fallback would make launch
  // behaviour depend on device speed.
  const a = resolveFontBootState({ fontsLoaded: false, fontError: null });
  const b = resolveFontBootState({ fontsLoaded: false, fontError: null });
  assert('6a. identical inputs give identical outputs', JSON.stringify(a) === JSON.stringify(b));

  const inputs = [
    { fontsLoaded: false, fontError: null },
    { fontsLoaded: true, fontError: null },
    { fontsLoaded: false, fontError: new Error('e') },
    { fontsLoaded: true, fontError: new Error('e') },
  ];
  const statuses = inputs.map((i) => resolveFontBootState(i).status);
  assert('6b. all four input combinations resolve to a status', statuses.every((s) => ['pending', 'loaded', 'error'].includes(s)));
  assert('6c. the four combinations map to pending/loaded/error/error', statuses.join(',') === 'pending,loaded,error,error');
  assert('6d. exactly one state withholds rendering', inputs.filter((i) => !resolveFontBootState(i).shouldRenderApp).length === 1);
}

console.log('\n=== 7. The failure is logged with an actionable, single message ===');
{
  assert('7a. a failure message exists', typeof FONT_LOAD_FAILURE_MESSAGE === 'string' && FONT_LOAD_FAILURE_MESSAGE.length > 0);
  assert('7b. it names the product', FONT_LOAD_FAILURE_MESSAGE.includes('Nolie'));
  assert('7c. it states the actual consequence (platform default fonts)', FONT_LOAD_FAILURE_MESSAGE.includes('platform default'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
