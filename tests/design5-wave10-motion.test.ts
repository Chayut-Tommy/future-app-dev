// Nolie Design 5.1 Wave 10 — motion tokens, ONE Reduced-Motion authority,
// the four-event haptic matrix, celebration tiers and figure-change guards.
//
// The doc-C token table, curves, Reduced-Motion parallel-build rules and
// hard rules were already codified and pinned (theme/motion.ts +
// tests/design5-motion.test.ts). Wave 10's work is CONSOLIDATION:
// migrate the remaining raw visual-motion literals onto named constants,
// collapse the three Reduce-Motion patterns onto hooks/useReduceMotion,
// centralise haptics into exactly the four authorised semantic events,
// and prove the guards — with zero behaviour depending on an animation
// having run.
//
// CLASSIFICATION: Class C structural over the real sources
// (comment-stripped) plus Class A over the RN-free helpers; runtime
// parity proof lives in the rendered suites (OptionsSheet RM parity,
// briefing-motion retention, use of the real components).
// Run with: ./node_modules/.bin/tsx tests/design5-wave10-motion.test.ts

import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { HAPTICS, MOTION_MS, REDUCED_MOTION_MS, SHEET_CONTENT_ENTRANCE_MS, SHEET_OFFSCREEN_TRAVEL_PT, TOAST_LIFE_MILESTONE_MS, TOAST_LIFE_PLAIN_MS, resolveDuration } from '../src/theme/motion';
import {
  AddWorkspaceRoute,
  initialAddWorkspaceTransitionState,
  isRouteSettledFront,
  reduceAddWorkspaceTransition,
} from '../src/components/navigation/addWorkspaceTransitionController';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

/** Recursively list every production source file. */
function allSrcFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...allSrcFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const ALL_SRC = allSrcFiles();

console.log('=== 1. Named constants — no raw visual-motion milliseconds in the migrated scope ===');
{
  assert('1a. the consolidated constants exist with the approved values', TOAST_LIFE_PLAIN_MS === 3200 && TOAST_LIFE_MILESTONE_MS === 3600 && SHEET_CONTENT_ENTRANCE_MS === 200 && SHEET_OFFSCREEN_TRAVEL_PT === 800);
  const MIGRATED = [
    'src/components/shared/OptionsSheet.tsx',
    'src/components/navigation/AskLuluSheet.tsx',
    'src/components/shared/KeyboardSheet.tsx',
    'src/components/celebrations/SmallCelebrationToast.tsx',
    'src/components/celebrations/MediumCelebrationSheet.tsx',
    'src/components/celebrations/BigCelebrationOverlay.tsx',
    'src/components/shared/Toast.tsx',
  ];
  for (const rel of MIGRATED) {
    const c = code(read(rel));
    // duration: 0 is "no animation", a state commit — not a motion feel.
    assert(`1b. ${rel.split('/').pop()} carries no raw non-zero duration literal`, !/duration: [1-9]\d*\s*[,}]/.test(c));
  }
  assert('1c. OptionsSheet and AskLuluSheet slide out on the named token and travel', /MOTION_MS\.sheetInfoOut/.test(code(read('src/components/shared/OptionsSheet.tsx'))) && /SHEET_OFFSCREEN_TRAVEL_PT/.test(code(read('src/components/shared/OptionsSheet.tsx'))) && /MOTION_MS\.sheetInfoOut/.test(code(read('src/components/navigation/AskLuluSheet.tsx'))));
  assert('1d. KeyboardSheet\'s content entrance runs on the named constant', (code(read('src/components/shared/KeyboardSheet.tsx')).match(/SHEET_CONTENT_ENTRANCE_MS/g) ?? []).length >= 3);
  assert('1e. the toast dwell pair now lives in theme/motion.ts, re-exported unchanged', /export const PLAIN_VISIBLE_MS = TOAST_LIFE_PLAIN_MS;/.test(read('src/components/celebrations/SmallCelebrationToast.tsx')) && /export const MILESTONE_VISIBLE_MS = TOAST_LIFE_MILESTONE_MS;/.test(read('src/components/celebrations/SmallCelebrationToast.tsx')));
  assert('1f. AddAnythingSheet\'s push duration is a named constant (shipped 220)', /const PUSH_TRANSITION_DURATION_MS = 220;/.test(read('src/components/navigation/AddAnythingSheet.tsx')));
  assert('1g. Reduced-Motion durations still resolve through the one resolver', resolveDuration('sheetInfoOut', false) === 200 && resolveDuration('sheetInfoOut', true) === (REDUCED_MOTION_MS.sheetInfoOut ?? 200));
}

console.log('\n=== 2. ONE Reduced-Motion authority ===');
{
  const offenders = ALL_SRC.filter((rel) => rel !== 'src/hooks/useReduceMotion.ts' && /isReduceMotionEnabled/.test(code(read(rel))));
  assert(`2a. no direct isReduceMotionEnabled call survives outside the hook (${offenders.join(', ') || 'none'})`, offenders.length === 0);
  const HOOK = read('src/hooks/useReduceMotion.ts');
  assert('2b. the hook resolves the initial system value safely (conservative true default)', /useState\(true\)/.test(HOOK));
  assert('2c. runtime setting changes update consumers, and cleanup is correct', /addEventListener\('reduceMotionChanged', setReduceMotionEnabled\)/.test(HOOK) && /sub\.remove\(\);/.test(HOOK) && /mounted = false;/.test(HOOK));
  assert('2d. OptionsSheet consumes the shared authority with full parity', /useReduceMotion\(\)/.test(code(read('src/components/shared/OptionsSheet.tsx'))) && /if \(reduceMotion\) \{\s*\n\s*finishDismiss\(\);\s*\n\s*return;/.test(code(read('src/components/shared/OptionsSheet.tsx'))));
  assert('2e. AskLuluSheet consumes it identically', /useReduceMotion\(\)/.test(code(read('src/components/navigation/AskLuluSheet.tsx'))));
  assert('2f. shared/Toast\'s local listener is gone, hook in its place', /useReduceMotion\(\)/.test(code(read('src/components/shared/Toast.tsx'))));
  assert('2g. AddAnythingSheet\'s local listener is gone, hook in its place — the RM branch still commits the identical final state', /const reduceMotionEnabled = useReduceMotion\(\);/.test(code(read('src/components/navigation/AddAnythingSheet.tsx'))) && /workspaceProgress\.setValue\(toValue\);\s*\n\s*onSettled\(\);/.test(code(read('src/components/navigation/AddAnythingSheet.tsx'))));

  // Dispositions, proven rather than assumed.
  const importers = ALL_SRC.filter((rel) => !rel.endsWith('CircularScore.tsx') && /from '[^']*CircularScore'/.test(read(rel)));
  assert('2h. CircularScore is UNUSED (zero importers) — left as-is, not resurrected', importers.length === 0);
  const THIS_MONTH = read('src/components/money/ThisMonthCard.tsx');
  assert('2i. ThisMonthCard\'s flip and its local AccessibilityInfo pattern are already retired', /Retired with the flip/.test(THIS_MONTH) && !/isReduceMotionEnabled|rotateY|Animated\.timing/.test(code(THIS_MONTH)));
  assert('2j. flip removal is COMPLETE — no rotateY animation anywhere in production', ALL_SRC.filter((rel) => /rotateY/.test(code(read(rel)))).length === 0);
}

console.log('\n=== 3. Exactly four haptic events, one dispatch module ===');
{
  const H = read('src/lib/haptics.ts');
  const HC = code(H);
  assert('3a. the matrix in motion.ts is doc C verbatim', HAPTICS.light.includes('selection') && HAPTICS.softSuccess.includes('engine-confirmed save') && HAPTICS.warning.includes('blocked action') && HAPTICS.rigid.includes('confirmed deletion or reset'));
  assert('3b. the module exports exactly four dispatchers', (HC.match(/export function haptic/g) ?? []).length === 4 && /hapticLight/.test(HC) && /hapticSoftSuccess/.test(HC) && /hapticWarning/.test(HC) && /hapticRigid/.test(HC));
  assert('3c. every dispatch fails quietly on unsupported devices', (HC.match(/\.catch\(\(\) => \{\}\)/g) ?? []).length === 4);
  const outside = ALL_SRC.filter((rel) => rel !== 'src/lib/haptics.ts' && /expo-haptics/.test(code(read(rel))));
  assert(`3d. nothing outside the module touches expo-haptics (${outside.join(', ') || 'none'})`, outside.length === 0);

  // Wave 10 CLOSURE RECONCILIATION (twice). 3e/3f/3j first pinned
  // renderer-mount dispatch — the confirmed double-haptic defect (one Save
  // queuing two events got two keyed mounts). The first correction gated
  // the haptic on celebrate() enqueueing into an EMPTY queue — but queue
  // state is not Save identity: a second Save landing while an earlier
  // Save's toasts were still visible was silenced (the confirmed follow-up
  // defect). Ownership now lives at the ACTION-scoped boundary:
  // confirmSaveSuccess fires exactly one softSuccess per successfully
  // persisted Save, celebrate() is haptically silent, and the calm factual
  // confirmation rides the same queue unless a richer celebration from the
  // same save claims it. Counts are behavioural, in the rendered
  // design5-wave10-haptics* suites.
  const CTX_HAPTIC = code(read('src/state/CelebrationContext.tsx'));
  assert('3e. every celebration renderer is haptically SILENT — no dispatch, no dispatcher import', ['SmallCelebrationToast', 'MediumCelebrationSheet', 'BigCelebrationOverlay'].every((n) => !/haptic/i.test(code(read(`src/components/celebrations/${n}.tsx`)))));
  assert('3f. the ONE softSuccess dispatcher is the action-scoped confirmSaveSuccess boundary — celebrate() is silent', (CTX_HAPTIC.match(/hapticSoftSuccess\(\);/g) ?? []).length === 1 && /const confirmSaveSuccess = useCallback/.test(CTX_HAPTIC) && !/hapticSoftSuccess/.test(CTX_HAPTIC.slice(CTX_HAPTIC.indexOf('const celebrate'), CTX_HAPTIC.indexOf('const confirmSaveSuccess'))) && !/haptic/i.test(code(read('src/components/shared/Toast.tsx'))));
  const SHEET_HAPTIC = code(read('src/components/navigation/AddAnythingSheet.tsx'));
  assert('3f2. every Add task funnels through the ONE shared save-success authority (handleSaveSuccessClose)', /function handleSaveSuccessClose\(savedType\?: AssetType \| LiabilityType\) \{\s*\n[\s\S]{0,1200}?confirmSaveSuccess\(/.test(SHEET_HAPTIC) && (SHEET_HAPTIC.match(/onSaveSuccess=\{handleSaveSuccessClose\}/g) ?? []).length === 9 && (SHEET_HAPTIC.match(/confirmSaveSuccess\(/g) ?? []).length === 1);
  assert('3g. save failure dispatches warning (onboarding completion catch)', /hapticWarning\(\);/.test(code(read('src/screens/welcome/WelcomeFlow.tsx'))));
  assert('3h. a confirmed reset dispatches rigid', /hapticRigid\(\);\s*\n\s*resetAllData\(\);/.test(code(read('src/screens/settings/ResetLuluScreen.tsx'))));
  // Forbidden surfaces carry no haptic at all.
  for (const rel of ['src/navigation/MainTabNavigator.tsx', 'src/components/navigation/GlobalNavDock.tsx', 'src/components/shared/ScoreRadialGauge.tsx', 'src/components/today/TodayJourneySnapshotCard.tsx']) {
    assert(`3i. no haptic on ${rel.split('/').pop()} (tabs/dock/score/rows)`, !/haptic|Haptics/i.test(code(read(rel))));
  }
  assert('3j. the factual-confirmation handshake is lifecycle-scoped — celebrate() claims the pending toast, the flush effect enqueues it, and no timers, windows or module flags exist', /pendingConfirmationRef\.current = null;\s*\n\s*setQueue\(\(prev\) => \[\.\.\.prev, event\]\);/.test(CTX_HAPTIC) && /\}, \[pendingFlushSerial\]\);/.test(CTX_HAPTIC) && !/setTimeout|Date\.now/.test(CTX_HAPTIC));
  // Warning covers doc C's "destructive confirm shown" half — dispatched
  // exactly at each confirmation's presentation, never in typing paths.
  assert('3o. showing a destructive confirmation fires warning at each canonical site (delete flows + the Reset confirmation screen)', /hapticWarning\(\);\s*\n(?:[^\n]*\n){0,10}?[^\n]*Alert\.alert\(/.test(code(read('src/components/goals/GoalDetailSheet.tsx'))) && (code(read('src/components/wealth/AddWealthItemModal.tsx')).match(/hapticWarning\(\);/g) ?? []).length === 2 && /hapticWarning\(\);/.test(code(read('src/components/dashboard/QuickAddModal.tsx'))) && /useEffect\(\(\) => \{\s*\n\s*hapticWarning\(\);\s*\n\s*\}, \[\]\);/.test(code(read('src/screens/settings/ResetLuluScreen.tsx'))));
  assert('3p. the calm factual confirmation derives from the canonical display-name authority and carries no MILESTONE label and no Undo', /buildSaveConfirmation\(\s*\n\s*routeDisplayName\(/.test(SHEET_HAPTIC) && !/context/.test(code(read('src/lib/celebrations.ts')).split('export function buildSaveConfirmation')[1].split('}')[0] ?? 'context') && !/undo|restore/i.test(code(read('src/lib/celebrations.ts'))));
  // Rigid covers doc C's OTHER half — confirmed deletion — dispatched at
  // the post-confirmation destructive boundary only (a shown or cancelled
  // confirm fires nothing; guards and reversal semantics untouched).
  const QAM = code(read('src/components/dashboard/QuickAddModal.tsx'));
  assert('3k. QuickAddModal funnels ALL confirmed transaction deletions through ONE rigid boundary', (QAM.match(/hapticRigid\(\);/g) ?? []).length === 1 && (QAM.match(/confirmedDeleteTransaction\(/g) ?? []).length === 11 && !/onPress: \(\) => \{ deleteTransaction\(/.test(QAM));
  assert('3l. goal deletion fires rigid ONLY inside the confirmed destructive press', /hapticRigid\(\);\s*\n\s*deleteGoal\(/.test(code(read('src/components/goals/GoalDetailSheet.tsx'))));
  const AWM = code(read('src/components/wealth/AddWealthItemModal.tsx'));
  assert('3m. both confirmed wealth removals (Everyday asset, BNPL plan) fire rigid post-confirmation', /hapticRigid\(\);\s*\n\s*deleteAsset\(/.test(AWM) && /hapticRigid\(\);\s*\n\s*deleteLiability\(/.test(AWM) && (AWM.match(/hapticRigid\(\);/g) ?? []).length === 2);
  const lightSites = ALL_SRC.filter((rel) => rel !== 'src/lib/haptics.ts' && /hapticLight\(\)/.test(code(read(rel))));
  assert('3n. hapticLight is AUTHORISED BUT UNUSED — zero call sites, so light is NOT device-testable yet', lightSites.length === 0);
}

console.log('\n=== 4. Celebration tiers, no Undo, distinct confirmation surface ===');
{
  const CTX = code(read('src/state/CelebrationContext.tsx'));
  assert('4a. tier routing is intact: small toast, medium sheet, big overlay', /tier === 'small'/.test(CTX) && /tier === 'medium'/.test(CTX) && /tier === 'big'/.test(CTX));
  assert('4b. one FIFO queue, one visible, deterministic slice', /queue\[0\] \?\? null/.test(CTX) && /prev\.slice\(1\)/.test(CTX));
  const surfaces = ['src/components/celebrations/SmallCelebrationToast.tsx', 'src/components/shared/Toast.tsx', 'src/lib/celebrations.ts'];
  assert('4c. no Undo or restore language anywhere in the feedback surfaces', surfaces.every((rel) => !/undo|restore/i.test(code(read(rel)))));
  assert('4d. shared/Toast stays the deliberately separate plain confirmation', /plain, unemotional confirmation/.test(read('src/components/shared/Toast.tsx')));
  assert('4e. no confetti, shimmer or looping decoration in any celebration renderer', ['SmallCelebrationToast', 'MediumCelebrationSheet', 'BigCelebrationOverlay'].every((n) => !/confetti|shimmer|Animated\.loop/.test(code(read(`src/components/celebrations/${n}.tsx`)))));
}

console.log('\n=== 5. Figure-change guards and rule 5 ===');
{
  const RING = code(read('src/components/goals/GoalProgressRing.tsx'));
  assert('5a. the animated goal ring moves ONLY on a genuine numeric delta', /if \(previousRef\.current === clamped\) return;/.test(RING));
  assert('5b. …compared on the raw structured value, never a formatted string', /previousRef\.current = clamped;/.test(RING) && !/toLocaleString|formatMoney/.test(RING.slice(RING.indexOf('previousRef'), RING.indexOf('previousRef') + 400)));
  assert('5c. …and Reduced Motion presents the final value immediately', /useReduceMotion/.test(RING));
  // Rule 5: no navigation/modal/save logic hangs off an animation callback
  // in the migrated scope (completion callbacks may only reset presentation
  // or fire the pre-existing accepted deferral).
  const OPTIONS = code(read('src/components/shared/OptionsSheet.tsx'));
  assert('5d. OptionsSheet completes the SAME way with or without the animation (shared finishDismiss)', /function finishDismiss\(\)/.test(OPTIONS) && /\.start\(finishDismiss\)/.test(OPTIONS));
  assert('5e. no new setTimeout entered the migrated components this wave', !/setTimeout/.test(code(read('src/components/navigation/AskLuluSheet.tsx'))));
  assert('5f. the toast\'s presentation timers remain named, keyed and cleaned', /MOTION_MS\.toastIn \+ holdMs/.test(code(read('src/components/celebrations/SmallCelebrationToast.tsx'))) && /clearTimeout\(exitTimerRef\.current\);/.test(code(read('src/components/celebrations/SmallCelebrationToast.tsx'))));
}

console.log('\n=== 6. Reduced Motion 14-task matrix — the real pure authority ===');
{
  // The exhaustive matrix drives the REAL reducer (imported, never
  // mirrored) once per canonical AddAnythingKind, with each kind's route
  // resolved from AddAnythingSheet's own module-private maps, parsed from
  // source (the component itself cannot load outside the RN runtime).
  // Under Reduced Motion the host dispatches FORWARD (or BACK)
  // immediately followed by TRANSITION_COMPLETE in the same synchronous
  // call — exactly the pairs driven here — so a settled forward AND a
  // settled back for every kind proves each destination stays reachable,
  // settles Save-eligible (front, idle, nothing outgoing), and returns
  // cleanly, with zero animation callbacks involved (rule 5).
  const SHEET_CODE = code(read('src/components/navigation/AddAnythingSheet.tsx'));
  const parseMap = (name: string): Record<string, string> => {
    const m = SHEET_CODE.match(new RegExp(`const ${name}[^=]*= \\{([\\s\\S]*?)\\};`));
    const out: Record<string, string> = {};
    for (const [, k, v] of (m ? m[1] : '').matchAll(/(\w+): '(\w+)'/g)) out[k] = v;
    return out;
  };
  const tileToRoute = parseMap('TILE_TO_ROUTE');
  const assetPreset = parseMap('ASSET_PRESET_MAP');
  const kindUnion = ((SHEET_CODE.match(/export type AddAnythingKind =([\s\S]*?);/) ?? ['', ''])[1].match(/'(\w+)'/g) ?? []).map((q) => q.replace(/'/g, ''));
  const CANONICAL = kindUnion.filter((k) => k !== 'vehicle');
  assert('6a. the catalogue is exactly the 14 canonical kinds (vehicle stays direct-entry-only, 15th)', CANONICAL.length === 14 && kindUnion.length === 15);
  const routeFor = (kind: string): AddWorkspaceRoute | null =>
    kind === 'transfer' ? 'transfer' : (tileToRoute[kind] as AddWorkspaceRoute | undefined) ?? (assetPreset[kind] ? 'asset' : null);
  assert('6b. every canonical kind resolves to exactly ONE workspace route through the sheet\'s own maps', CANONICAL.every((k) => typeof routeFor(k) === 'string'));

  for (const kind of CANONICAL) {
    const route = routeFor(kind)!;
    let st = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'FORWARD', route, returnStack: ['chooser'] });
    const forwardAccepted = st.status === 'transitioning' && st.current === route && st.direction === 'forward';
    st = reduceAddWorkspaceTransition(st, { type: 'TRANSITION_COMPLETE' });
    const settledFront = st.status === 'idle' && st.current === route && st.outgoing === null && isRouteSettledFront(st, route);
    const repeatIgnored = reduceAddWorkspaceTransition(st, { type: 'FORWARD', route }) === st;
    st = reduceAddWorkspaceTransition(st, { type: 'BACK' });
    const backAccepted = st.status === 'transitioning' && st.current === 'chooser' && st.direction === 'back';
    st = reduceAddWorkspaceTransition(st, { type: 'TRANSITION_COMPLETE' });
    const home = st.status === 'idle' && st.current === 'chooser' && st.outgoing === null && st.returnStack.length === 0;
    assert(`6c. ${kind} -> ${route}: RM forward settles front, repeat ignored, Back returns, nothing in flight`, forwardAccepted && settledFront && repeatIgnored && backAccepted && home);
  }

  const idle = reduceAddWorkspaceTransition(initialAddWorkspaceTransitionState, { type: 'TRANSITION_COMPLETE' });
  assert('6d. a stale completion is a no-op on a settled state — success never depends on an animation callback', idle === initialAddWorkspaceTransitionState);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
