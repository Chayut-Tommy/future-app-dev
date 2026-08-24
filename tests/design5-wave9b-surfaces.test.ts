// Nolie Design 5.1 Wave 9b — Settings, Goals and Transactions presentation.
//
// THE GAP. These seven surfaces had never been migrated to the Design 5.1
// type system: 55 call sites still spread `tokens.typography.*`, which
// carries NO `fontFamily` at all, so every one of them rendered in the
// platform font rather than Figtree/Noto Sans Thai. This is the same trap
// Wave 8 found on `ScoreRadialGauge` — invisible to a grep for a colour or
// a token name, because the token exists and simply omits the family.
//
// Settings additionally had no canonical order (Appearance led, Profile sat
// fourth) and its section titles carried no heading semantics, so VoiceOver
// had no navigable structure.
//
// CLASSIFICATION (per tests/README.md):
// - Class C (structural): the whole file reads the real sources. It proves
//   the type system and ordering are wired; it does NOT prove the rendered
//   font — the rendered suites' own font-offender sweep does that.
//
// Paths resolve from this worktree. Run with:
//   ./node_modules/.bin/tsx tests/design5-wave9b-surfaces.test.ts

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

/** Every surface Wave 9b touched. */
const SURFACES: readonly string[] = [
  'src/screens/settings/SettingsScreen.tsx',
  'src/screens/settings/LanguageScreen.tsx',
  'src/screens/settings/ResetLuluScreen.tsx',
  'src/components/settings/EditProfileModal.tsx',
  'src/screens/goals/GoalsScreen.tsx',
  'src/components/goals/GoalDetailSheet.tsx',
  'src/screens/transactions/TransactionsScreen.tsx',
];

console.log('=== 1. No legacy type token, and no raw colour, survives ===');
{
  for (const rel of SURFACES) {
    const c = code(read(rel));
    const name = rel.split('/').pop();
    assert(`1a. ${name} spreads no tokens.typography.*`, !/\.\.\.typography\./.test(c));
    assert(`1b. ${name} resolves type through the shipped role resolver`, /typeStyle\('/.test(c));
    assert(`1c. ${name} binds a real locale for that resolver`, /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(c));
    assert(`1d. ${name} carries no raw hex or rgba`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(c));
  }
}

console.log('\n=== 2. Every role used is a real shipped role ===');
{
  const ROLES = new Set(['figureHero', 'figureLarge', 'figureRow', 'titleScreen', 'titleSection', 'titleCard', 'body', 'support', 'meta', 'eyebrow', 'labelButton', 'labelTab']);
  const TYPES = read('src/theme/typography.ts');
  for (const rel of SURFACES) {
    const used = [...code(read(rel)).matchAll(/typeStyle\('([a-zA-Z]+)'/g)].map((m) => m[1]);
    const name = rel.split('/').pop();
    assert(`2a. ${name} uses only known roles (${[...new Set(used)].join(', ')})`, used.length > 0 && used.every((r) => ROLES.has(r)));
    assert(`2b. …and each is declared in TYPE_ROLES`, [...new Set(used)].every((r) => new RegExp(`\\b${r}:\\s*\\{`).test(TYPES)));
  }
}

console.log('\n=== 3. The locale is a live dependency of the memoised styles ===');
{
  // Without this, switching to Thai would keep the previously resolved
  // font family until the component happened to re-mount.
  for (const rel of SURFACES) {
    const c = code(read(rel));
    const name = rel.split('/').pop();
    const deps = [...c.matchAll(/\[\s*colors[^\]]*\]/g)].map((m) => m[0]);
    assert(`3a. ${name} lists locale in its style dependencies`, deps.length === 0 || deps.some((d) => d.includes('locale')));
  }
}

console.log('\n=== 4. Settings follows the canonical order ===');
{
  const S = read('src/screens/settings/SettingsScreen.tsx');
  const at = (needle: string) => S.indexOf(needle);
  const profile = at("{t('settings.profile')}");
  const appearance = at("{t('settings.appearance')}");
  const language = at("{t('settings.preferences')}");
  const about = at('About and legal');
  const reset = at('styles.dangerRow');

  assert('4a. Profile leads', profile > 0 && profile < appearance);
  assert('4b. Appearance follows Profile', appearance < language);
  assert('4c. Language follows Appearance', language < about);
  assert('4d. About and existing disclosures come next', about < reset);
  assert('4e. Reset Nolie is last', reset > about);

  // -------------------------------------------------------------------
  // RECONCILED — Wave 9b, income-description retirement.
  //
  // SUPERSEDED: 4f required "How would you describe your income?" to
  // survive, and 4g required seven titled sections.
  //
  // WHY: that questionnaire tailored Money's hero WORDING from an
  // employment identity (Employee / Freelancer / Retiree / Investor /
  // Business owner). Inspection proved it drives copy only —
  // `moneyPersona.ts` contains zero arithmetic and returns two strings —
  // and that the same wording is already derivable from the RECORDED pay
  // cadence via `resolveMoneyPersona`. Asking the customer to self-identify
  // in order to pick an adjective is stereotyping, so the question is
  // retired; the stored field is preserved untouched.
  //
  // PRESERVED INTENT: the reorder must still drop nothing that the customer
  // relies on. Account and Security are still asserted, and the count is
  // now asserted exactly rather than loosened.
  // -------------------------------------------------------------------
  for (const kept of ["{t('settings.account')}", "{t('settings.security')}"]) {
    assert(`4f. preserved section: ${kept}`, S.includes(kept));
  }
  assert('4f-i. the income-identity questionnaire is retired', !S.includes('How would you describe your income?'));
  assert('4f-ii. …and its options no longer render', !/MONEY_PERSONA_OPTIONS|MONEY_PERSONA_LABEL/.test(S));
  assert('4f-iii. the stored field is preserved in the model', /moneyPersona\?: /.test(read('src/types/models.ts')));
  assert('4f-iv. the wording resolver still derives from recorded cadence', read('src/lib/calculations/moneyPersona.ts').includes("user.payFrequency === 'irregular' ? 'freelancer' : 'employee'"));
  assert('4g. exactly six titled sections remain', (S.match(/styles\.sectionTitle\} accessibilityRole="header"/g) ?? []).length === 6);
}

console.log('\n=== 4b. The Goals row is backed by the real goal collection ===');
{
  const S = read('src/screens/settings/SettingsScreen.tsx');
  const C = code(S);
  // The retired enums are gone from BOTH the row and the editor.
  const E = code(read('src/components/settings/EditProfileModal.tsx'));
  assert('4h. Settings no longer shows "Main money goal"', !C.includes('Main money goal'));
  assert('4i. Settings no longer shows "Money confidence"', !C.includes('Money confidence'));
  assert('4j. the editor offers no money-goal control', !/MONEY_GOALS/.test(E));
  assert('4k. the editor offers no confidence control', !/CONFIDENCE_LEVELS/.test(E));
  assert('4l. the editor no longer writes moneyGoal', !/\bmoneyGoal\b/.test(E));
  assert('4m. the editor no longer writes confidenceLevel', !/\bconfidenceLevel\b/.test(E));

  // The new row reads the ONE authoritative collection.
  assert('4n. the row exists', C.includes('testID="settings-goals-row"'));
  assert('4o. it reads data.goals, not the profile enum', /data\.goals\.filter\(\(g\) => g\.status === 'active'\)/.test(C));
  assert('4p. it uses the app\'s existing canonical focus concept', /g\.priority === 'high'/.test(C));
  assert('4q. it never infers a primary goal from array order', !/goals\[0\]/.test(C));
  assert('4r. it navigates into the existing Goals journey', C.includes("navigation.navigate('Goals')"));
  assert('4s. it speaks one complete sentence', /accessibilityLabel=\{`Goals\. \$\{goalsRowValue\}`\}/.test(C));
  assert('4t. it states a calm empty state', C.includes("'No active goals yet'"));
  assert('4u. …and an active count when there is no focus', C.includes('${activeGoals.length} active'));
  assert('4v. nothing auto-creates a Goal from the retired answer', !/addGoal\(|createGoal\(/.test(C));

  // Legacy fields survive in storage, unmigrated.
  const M = read('src/types/models.ts');
  assert('4w. moneyGoal is still on the model', /moneyGoal\?: MoneyGoal;/.test(M));
  assert('4x. confidenceLevel is still on the model', /confidenceLevel\?: ConfidenceLevel;/.test(M));
  assert('4y. storage performs no profile migration', !/moneyGoal|confidenceLevel|moneyPersona/.test(read('src/lib/storage.ts')));
  assert('4z. no second goal model was introduced', !/interface .*Goal2|PrimaryGoal\b/.test(M));
}

console.log('\n=== 5. Reset Nolie keeps its guard and its customer-facing name ===');
{
  const R = read('src/screens/settings/ResetLuluScreen.tsx');
  const S = read('src/screens/settings/SettingsScreen.tsx');
  assert('5a. the route name stays internally ResetLulu', S.includes("navigation.navigate('ResetLulu')"));
  assert('5b. customer-facing copy says Reset Nolie, never Reset Lulu', !/Reset Lulu/.test(code(R)) && !/Reset Lulu/.test(code(S)));
  // The guard: a destructive wipe is never one tap.
  assert('5c. the wipe is behind a confirmation', /Alert\.alert|confirm|Confirm/.test(R));
  assert('5d. a cancel path exists', /Cancel|cancel/.test(R));
  assert('5e. the reset action itself is unchanged', /resetAll|resetApp|clearAll/i.test(R));
  assert('5f. no persistence or migration was introduced here', !/AsyncStorage|migrat/i.test(code(R)));
}

console.log('\n=== 6. Appearance still delegates to the theme source of truth ===');
{
  const S = code(read('src/screens/settings/SettingsScreen.tsx'));
  assert('6a. the scheme control reads the shared preference', /setPreference|preference/.test(S));
  assert('6b. Settings does not re-implement theme resolution', !/prefers-color-scheme|useColorScheme\(\)/.test(S));
  assert('6c. selection is exposed structurally, not by colour alone', /active \? styles\.optionActive : null/.test(S));
  assert('6d. and the selected option is also marked by icon tint AND weight', /optionLabelActive/.test(S));
}

console.log('\n=== 7. The profile nudge stays unwired, with no empty node ===');
{
  for (const rel of ['src/screens/today/TodayScreen.tsx', ...SURFACES]) {
    assert(`7a. ${rel.split('/').pop()} does not mount ProfileNudgeCard`, !/ProfileNudgeCard/.test(code(read(rel))));
  }
}

console.log('\n=== 8. BNPL: the corrected category is in the shipped path ===');
{
  const CTX = code(read('src/state/AppStateContext.tsx'));
  const fn = CTX.slice(CTX.indexOf('export function confirmBnplRepaymentTransition'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert('8a. the BNPL transaction is stamped cat-debt', body.includes("categoryId: 'cat-debt'"));
  assert('8b. and no longer cat-other-expense', !body.includes("categoryId: 'cat-other-expense'"));
  assert('8c. the specialised liability reduction is untouched', body.includes("targetKind: 'liability'"));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
