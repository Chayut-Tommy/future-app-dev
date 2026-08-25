// Nolie pre-Wave-10 premium toast — visual-elevation pass on the
// functionally-approved renderer.
//
// ROOT CAUSE HISTORY. The original toast was a green-tinted pill in the
// platform font with a bouncing entrance and an animation-driven queue
// advance. The approved Phase B rebuild fixed all of that but remained
// predominantly white — one 0.5-opacity wash over `bgSurface` — so on
// device it blended into the checklist beneath, the 44pt tile read small,
// MILESTONE was faint free text, the title used the body role, every
// event carried identical intensity, and the preserved 2,200ms hold felt
// hurried. This pass elevates PRESENTATION ONLY: queue, event model,
// timers, cleanup, seen-state and copy are byte-preserved.
//
// CLASSIFICATION: Class C structural over the real sources
// (comment-stripped); queue/copy/runtime-font proof lives in the rendered
// suite. Run with: ./node_modules/.bin/tsx tests/design5-toast-polish.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';

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

const TOAST = code(read('src/components/celebrations/SmallCelebrationToast.tsx'));
const CTX = code(read('src/state/CelebrationContext.tsx'));
const EVENTS = read('src/lib/celebrations.ts');
const TODAY = code(read('src/screens/today/TodayScreen.tsx'));

console.log('=== 1. The shared celebration architecture is byte-preserved ===');
{
  assert('1a. ONE queue, appended per event', /setQueue\(\(prev\) => \[\.\.\.prev, event\]\);/.test(CTX));
  assert('1b. exactly one active event renders at a time', /const active = queue\[0\] \?\? null;/.test(CTX) && /active\?\.tier === 'small' \? <SmallCelebrationToast/.test(CTX));
  assert('1c. advancing is a deterministic FIFO slice', /setQueue\(\(prev\) => prev\.slice\(1\)\);/.test(CTX));
  assert('1d. each event remounts the renderer by its own id', /key=\{active\.id\} event=\{active\} onDone=\{advance\}/.test(CTX));
  assert('1e. the modal-tier guard is untouched', /isModalCelebrationActive: active\?\.tier === 'medium' \|\| active\?\.tier === 'big'/.test(CTX));
  assert('1f. no second toast framework — the plain shared/Toast confirmation surface stays separate by design', /plain, unemotional confirmation/.test(read('src/components/shared/Toast.tsx')));
}

console.log('\n=== 2. The elevated composition — semantic tokens only ===');
{
  assert('2a. opaque elevated base + hero radius + card shadow + the tinted-surface border token', /backgroundColor: semantic\.bgSurface,/.test(TOAST) && /borderRadius: designRadius\.hero,/.test(TOAST) && /\.\.\.cardShadow,/.test(TOAST) && /borderColor: semantic\.heroBorder,/.test(TOAST));
  assert('2b. the card surface is the full-strength three-stop style gradient', /semantic\.interactiveTint, semantic\.bgSurface, semantic\.ambient\[0\]/.test(TOAST) && /locations=\{\[0, 0\.45, 1\]/.test(TOAST));
  assert('2c. decoration is clipped to the radius while the shadow stays on the card', /clip: \{ \.\.\.StyleSheet\.absoluteFillObject, borderRadius: designRadius\.hero, overflow: 'hidden' \}/.test(TOAST));
  assert('2d. a thin featured top accent edge reveals with the card', /topAccent: \{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 \}/.test(TOAST) && /semantic\.featured\[0\], semantic\.featured\[1\]/.test(TOAST));
  assert('2e. a soft ambient bloom sits clipped behind the icon, one entrance fade', /semantic\.featured\[0\], semantic\.interactiveTint/.test(TOAST) && /Animated\.multiply\(progress, 0\.3\)/.test(TOAST));
  assert('2f. safe-area top placement at the canonical screen margin', /left: designLayout\.screenMargin,/.test(TOAST) && /top: insets\.top \+ designSpacing\.sm,/.test(TOAST));
  assert('2g. no raw colour, no emoji, no platform-font token, no new dependency', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(TOAST) && !/\.\.\.typography\./.test(TOAST) && !/from '(expo-blur|lottie-react-native|moti|react-native-reanimated)'/.test(TOAST));
}

console.log('\n=== 3. The 48pt medallion and the structured context capsule ===');
{
  assert('3a. a 48pt halo around a 36pt elevated inner tile', /width: 48,\s*\n\s*height: 48,/.test(TOAST) && /width: 36,\s*\n\s*height: 36,/.test(TOAST) && /backgroundColor: semantic\.interactiveTint,/.test(TOAST));
  assert('3b. the STRUCTURED event icon, never derived from title text', /name=\{event\.icon\}/.test(TOAST) && !/title\.includes|\.toLowerCase\(\)/.test(TOAST));
  assert('3c. the medallion reveal is 0.94→1 with the existing entrance value — no loop, no pulse, no spin', /outputRange: \[0\.94, 1\]/.test(TOAST) && !/Animated\.loop|iterations|pulse|rotate/.test(TOAST));
  assert('3d. the reveal is removed under Reduced Motion', /const medallionScale = reduceMotion \? 1 : progress\.interpolate/.test(TOAST));
  assert('3e. halo and bloom are hidden from accessibility', (TOAST.match(/accessibilityElementsHidden/g) ?? []).length >= 3);
  assert('3f. the context capsule renders ONLY from the structured field — no blank spacer without it', /event\.context \? \(\s*\n\s*<View style=\{styles\.contextCapsule\}>/.test(TOAST) && /\) : null\}/.test(TOAST));
  assert('3g. the capsule: tinted pill + vector sparkle + the established label role', /backgroundColor: semantic\.interactiveTint,\s*\n\s*borderRadius: designRadius\.pill,/.test(TOAST) && /name="sparkles" size=\{10\}/.test(TOAST) && /typeStyle\('eyebrow', locale\), color: semantic\.interactive/.test(TOAST));
}

console.log('\n=== 4. Typography, dismissal and layout resilience ===');
{
  assert('4a. the title steps up to titleCard with tabular numerals', /title: \{ \.\.\.typeStyle\('titleCard', locale\), color: semantic\.textPrimary, fontVariant: \['tabular-nums'\] \}/.test(TOAST));
  assert('4b. support copy keeps its quieter role; live locale binds everything', /typeStyle\('support', locale\)/.test(TOAST) && /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(TOAST) && /\[semantic, cardShadow, insets\.top, locale\]/.test(TOAST));
  assert('4c. no truncation and no fixed card height — Dynamic Type grows vertically', !/numberOfLines/.test(TOAST) && !/height: \d+,\s*\n\s*width: '100%'/.test(TOAST));
  assert('4d. the quiet 44pt Dismiss sits consistently top-right', /dismiss: \{\s*\n\s*position: 'absolute',\s*\n\s*top: 0,\s*\n\s*right: 0,\s*\n\s*minWidth: 44,\s*\n\s*minHeight: 44,/.test(TOAST) && /size=\{14\} color=\{semantic\.textTertiary\}/.test(TOAST));
  assert('4e. the title row reserves the dismiss corner so they never collide', /paddingRight: 44 \+ designSpacing\.xs,/.test(TOAST));
  assert('4f. ONLY the dismiss target intercepts touches — the box-none chain is preserved', (TOAST.match(/pointerEvents="box-none"/g) ?? []).length >= 3 && /pointerEvents="none"/.test(TOAST));
}

console.log('\n=== 5. Motion, structured duration and rule-5 timers ===');
{
  assert('5a. enter uses the toastIn token with the 10pt settle; exit the toastOut token', /resolveDuration\('toastIn', reduceMotion\)/.test(TOAST) && /MOTION_TRAVEL_PT\.toastRise/.test(TOAST) && /resolveDuration\('toastOut', reduceMotionRef\.current\)/.test(TOAST));
  assert('5b. no bounce, shimmer, confetti, particles, sound or overlay', !/Animated\.spring|friction|tension|confetti|shimmer|Sound|Modal/.test(TOAST));
  assert('5c. Reduced Motion removes the translation too', /reduceMotion\s*\n?\s*\? 0\s*\n?\s*:/.test(TOAST));
  // -------------------------------------------------------------------
  // RECONCILED — visual-elevation pass. SUPERSEDED: the previous clause
  // pinned the flat 2,200ms hold ("the established hold is preserved").
  // WHY: the owner's device round found it hurried; the locked design
  // replaces it with STRUCTURED presentation timing. PRESERVED INTENT:
  // the hold is still a named constant pair, still state-timer driven,
  // still keyed by event identity, still manually dismissable.
  // -------------------------------------------------------------------
  assert('5d. structured holds: plain 3,200ms, milestone 3,600ms', /export const PLAIN_VISIBLE_MS = 3200;/.test(TOAST) && /export const MILESTONE_VISIBLE_MS = 3600;/.test(TOAST));
  assert('5e. the hold is selected by the STRUCTURED context field only', /const holdMs = event\.context \? MILESTONE_VISIBLE_MS : PLAIN_VISIBLE_MS;/.test(TOAST));
  assert('5f. the lifetime is a state timer keyed on the event — never an animation callback', /setTimeout\(\(\) => dismissRef\.current\(\), MOTION_MS\.toastIn \+ holdMs\);/.test(TOAST) && !/\.start\(\(\{ finished/.test(TOAST));
  assert('5g. a parent rerender cannot reset it, and it clears on unmount', /return \(\) => clearTimeout\(timer\);/.test(TOAST) && /\}, \[event\.id\]\);/.test(TOAST));
  assert('5h. the exit-advance timer is cleared on unmount', /clearTimeout\(exitTimerRef\.current\);/.test(TOAST));
  assert('5i. dismissal is idempotent — the queue can never advance twice', /if \(doneRef\.current\) return;\s*\n\s*doneRef\.current = true;/.test(TOAST));
  assert('5j. the dead-world guard stands', /if \(!Animated \|\| !Animated\.timing\) return;/.test(TOAST));
}

console.log('\n=== 6. Accessibility and the haptic boundary ===');
{
  assert('6a. context, title and support are announced exactly once, context first', /const spoken = \[event\.context, event\.title, event\.body\]\.filter\(Boolean\)\.join\('\. '\);/.test(TOAST) && /announceForAccessibility\(spoken\);/.test(TOAST));
  assert('6b. focus is never stolen', !/setAccessibilityFocus/.test(TOAST));
  assert('6c. haptics use the ESTABLISHED helper, milestone-only, once per event', /if \(event\.context\) Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)/.test(TOAST) && (TOAST.match(/impactAsync/g) ?? []).length === 1);
  assert('6d. the Dismiss control keeps its label and reachability', /accessibilityLabel="Dismiss"/.test(TOAST) && /testID="celebration-toast-dismiss"/.test(TOAST));
}

console.log('\n=== 7. Event integrity, copy and financial isolation — unchanged ===');
{
  assert('7a. the context field is additive and optional on the event', /context\?: string;/.test(EVENTS));
  assert('7b. achievements carry MILESTONE from structured identity; the everyday copy stays plain', /\.\.\.\(firstAssetCopy \? \{\} : \{ context: 'MILESTONE' \}\),/.test(TODAY));
  assert('7c. event id, tier and seen-tracking are byte-identical', /id: newlyUnlocked\.id,/.test(TODAY) && /tier: isBig \? 'big' : 'small',/.test(TODAY) && /markAchievementsSeen\(\[newlyUnlocked\.id\]\);/.test(TODAY));
  assert('7d. the approved everyday copy is untouched', EVENTS.includes("title: 'Everyday account added',") && EVENTS.includes("body: `${brand.name} can now use this account in your money picture.`,"));
  assert('7e. unlock rules are byte-identical in the engine', read('src/lib/calculations/achievements.ts').includes("unlocked: data.assets.length > 0 },") && read('src/lib/calculations/achievements.ts').includes("unlocked: data.goals.length > 0 },"));
  assert('7f. the toast writes NOTHING — no persistence, state or Score call', !/useAppState|persist|updateUser|AsyncStorage|markAchievements/.test(TOAST));
  assert('7g. no unrelated gold/green/urgency tier colouring was invented', !/semantic\.success|semantic\.warning|semantic\.urgent|colors\.gold|colors\.accent\b/.test(TOAST));
  assert('7h. Diversified Portfolio remains untouched (Wave 10 copy review)', /Diversified/.test(read('src/lib/calculations/achievements.ts')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
