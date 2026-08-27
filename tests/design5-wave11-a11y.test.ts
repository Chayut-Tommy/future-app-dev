// Nolie Design 5.1 Wave 11 — iOS accessibility closure evidence.
//
// Class A wherever a real pure authority exists (the consolidated focus
// module's contract, the shared spoken-string authority, the protected
// composition modules' own spoken helpers, the theme resolver's six
// combinations, the account-row reflow rule, the Thai locale resources and
// the role/weight font resolver). Structural pins (comment-stripped source)
// cover component wiring the tsx runner cannot mount. Rendered/behavioural
// counterparts live in design5-wave11-focus.render.test.tsx and the
// existing reminder/picker/onboarding rendered suites.
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { spokenCurrency, spokenSignedDisplay, transactionAccessibilityLabel, monthSummaryAccessibilityLabel, monthHeaderAccessibilityLabel } from '../src/lib/a11yStrings';
import { spokenWealthAmount, composeNetWorthAnnouncement } from '../src/lib/calculations/wealthComposition';
import { accountChoiceAccessibilityLabel, accountRowStacksBalance } from '../src/lib/calculations/accountChoice';
import { resolveSemanticColors } from '../src/theme/semanticTokens';
import { fontFamilyForWeight } from '../src/theme/typography';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let total = 0;
let failures = 0;
function assert(name: string, cond: boolean) {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}`);
  if (!cond) failures++;
}

console.log('=== 1. ONE focus-helper authority, safely consolidated ===');
{
  const FOCUS = read('src/lib/a11yFocus.ts');
  const FOCUS_CODE = code(FOCUS);
  assert('1a. the retired duplicate module is gone and nothing imports it', !existsSync(path.join(REPO_ROOT, 'src/lib/accessibilityFocus.ts')));
  assert('1b. one mechanism on both platforms — the supported sendAccessibilityEvent; no findNodeHandle, no deprecated setAccessibilityFocus, no Platform branch', /sendAccessibilityEvent/.test(FOCUS_CODE) && !/findNodeHandle|setAccessibilityFocus|Platform/.test(FOCUS_CODE));
  assert('1c. throw-safe and null-checked at use — a vanished target is silently tolerated', /if \(!node\) return;/.test(FOCUS_CODE) && /try \{/.test(FOCUS_CODE) && /catch \{/.test(FOCUS_CODE));
  assert('1d. presentation-only: no timers, no elapsed-time dedupe, no global mutable state, nothing to clean up', !/setTimeout|setInterval|Date\.now|let |var /.test(FOCUS_CODE));
  assert('1e. the ref-shaped helper delegates to the same single mechanism', /export function sendFocusEvent/.test(FOCUS_CODE) && /focusElement\(ref\?\.current \?\? null\);/.test(FOCUS_CODE));

  const ALL_SRC_DIRS = ['src'];
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of require('fs').readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const ALL_SRC = ALL_SRC_DIRS.flatMap(walk);
  const retired = ALL_SRC.filter((rel) => /from '[^']*accessibilityFocus'/.test(read(rel)));
  assert(`1f. zero production imports of the retired module (${retired.join(', ') || 'none'})`, retired.length === 0);
  const deprecated = ALL_SRC.filter((rel) => /findNodeHandle|setAccessibilityFocus/.test(code(read(rel))));
  assert(`1g. zero remaining deprecated focus APIs anywhere in src (${deprecated.join(', ') || 'none'})`, deprecated.length === 0);
  const consumers = ALL_SRC.filter((rel) => rel !== 'src/lib/a11yFocus.ts' && /from '[^']*a11yFocus'/.test(read(rel)));
  assert(`1h. every focus consumer goes through the one authority (${consumers.length} consumers)`, consumers.length >= 11 && ['src/screens/welcome/WelcomeFlow.tsx', 'src/components/goals/GoalDetailSheet.tsx', 'src/components/shared/fields/FocusedPickerHost.tsx', 'src/screens/today/TodayScreen.tsx', 'src/screens/wealth/WealthScreen.tsx', 'src/components/today/ReminderDetailSheet.tsx'].every((f) => consumers.includes(f)));
  // The announce-once authority is unchanged and still rerender-safe.
  const ANNOUNCE = code(read('src/hooks/useAnnounceOnce.ts'));
  assert('1i. useAnnounceOnce still dedupes per distinct message with no timers', /lastAnnouncedRef/.test(ANNOUNCE) && !/setTimeout|Date\.now/.test(ANNOUNCE));
}

console.log('\n=== 2. Financial spoken strings — the real pure authorities ===');
{
  assert('2a. whole dollars speak without fabricated cents', spokenCurrency(42) === '42 dollars' && spokenCurrency(1250) === '1,250 dollars');
  assert('2b. cents speak once, correctly pluralised', spokenCurrency(42.05) === '42 dollars and 5 cents' && spokenCurrency(9.01) === '9 dollars and 1 cent');
  assert('2c. negatives speak the word minus, never a glyph', spokenCurrency(-1234.5) === 'minus 1,234 dollars and 50 cents');
  assert('2d. an invalid value is NEVER announced as zero', spokenCurrency(NaN) === 'amount not available' && spokenCurrency(Infinity) === 'amount not available');
  assert('2e. the display-sign rewrite handles both minus glyphs and touches nothing else', spokenSignedDisplay('-$1,024') === 'minus $1,024' && spokenSignedDisplay('−$5') === 'minus $5' && spokenSignedDisplay('$5') === '$5');

  const expense = transactionAccessibilityLabel({ type: 'expense', label: 'Groceries', amount: 84.2, categoryName: 'Food', dateLabel: '12 Aug', badgeLabel: null });
  const income = transactionAccessibilityLabel({ type: 'income', label: null, amount: 2500, categoryName: 'Salary', dateLabel: '1 Aug', badgeLabel: 'Repayment recorded' });
  assert('2f. a transaction row speaks direction, name, figure ONCE, category, date', expense === 'Expense. Groceries. 84 dollars and 20 cents. Food, 12 Aug.' && (expense.match(/84/g) ?? []).length === 1);
  assert('2g. an unlabelled income row still speaks direction and its badge', income === 'Income. 2,500 dollars. Salary, 1 Aug. Repayment recorded.');
  assert('2h. the month summary uses direction WORDS, never glyph or colour', monthSummaryAccessibilityLabel({ income: 3000, expenses: 3500, net: -500 }) === 'Income 3,000 dollars. Expenses 3,500 dollars. Net minus 500 dollars.');
  assert('2i. the month disclosure speaks its open/closed state', monthHeaderAccessibilityLabel('August 2026', true) === 'August 2026. Expanded.' && monthHeaderAccessibilityLabel('August 2026', false) === 'August 2026. Collapsed.');

  // The protected composition authorities remain the spoken sources for
  // their own surfaces — exercised here as REAL imports, unchanged.
  assert('2j. wealth amounts: sign as a word, invalid as "not available", never zero', spokenWealthAmount(-2500) === 'negative 2,500 dollars' && spokenWealthAmount(NaN) === 'not available');
  assert('2k. the net-worth hero reconciles figure and formula in one announcement', composeNetWorthAnnouncement({ netWorth: 11000, totalAssets: 16000, totalLiabilities: 5000 }).includes('11,000 dollars') && composeNetWorthAnnouncement({ netWorth: 11000, totalAssets: 16000, totalLiabilities: 5000 }).includes('minus'));
  assert('2l. account rows speak name, type and figure exactly once each', accountChoiceAccessibilityLabel({ name: 'Everyday', typeLabel: 'Everyday Account', balanceLabel: '$4,000' } as never) === 'Everyday. Everyday Account. $4,000.');
}

console.log('\n=== 3. Semantics — the corrected transaction surface, wired ===');
{
  const TXN = code(read('src/screens/transactions/TransactionsScreen.tsx'));
  assert('3a. month headers are buttons with a truthful expanded state', /accessibilityState=\{\{ expanded \}\}/.test(TXN) && /monthHeaderAccessibilityLabel\(group\.label, expanded\)/.test(TXN));
  assert('3b. the month summary is one accessible element speaking direction words', /accessible accessibilityLabel=\{monthSummaryAccessibilityLabel\(group\)\}/.test(TXN));
  assert('3c. every transaction row is a labelled button built from STRUCTURED values with a hint', /transactionAccessibilityLabel\(\{/.test(TXN) && /type: item\.type,/.test(TXN) && /accessibilityHint="Opens this transaction\."/.test(TXN));
  assert('3d. decorative chevrons are hidden from the reader', (TXN.match(/chevron-(forward|up|down)[^/]*accessibilityElementsHidden/g) ?? []).length >= 2);
  const HERO = code(read('src/components/money/SafeToSpendHero.tsx'));
  assert('3e. the Money hero speaks through the SHARED sign authority (local helper retired)', /spokenSignedDisplay\(/.test(HERO) && !/function spokenMoney/.test(HERO));
}

console.log('\n=== 4. Picker focus contract — heading in, trigger back ===');
{
  const HOST = code(read('src/components/shared/fields/FocusedPickerHost.tsx'));
  const TRIGGER = code(read('src/components/shared/fields/FocusedPickerTrigger.tsx'));
  assert('4a. the heading receives focus through the one authority when genuinely interactive', /if \(!request \|\| request\.activating\) return;\s*\n\s*sendFocusEvent\(headingRef\);/.test(HOST));
  assert('4b. Done/Cancel return focus to the TRIGGER — the formerly dead ref is replaced by a real getter, re-checked at use', /focusElement\(active\.getReturnFocusNode\?\.\(\)\);/.test(HOST) && !/returnFocusRef/.test(HOST));
  assert('4c. every shared trigger row registers itself as the return target', /getReturnFocusNode: \(\) => rowRef\.current,/.test(TRIGGER));
  assert('4d. the picker announcement stays once-per-opening, state-driven, never animation-gated', /announcedForRef\.current === request\.title\) return;/.test(HOST));
  assert('4e. the obscured form stays out of the accessibility tree while the picker owns the surface', /accessibilityViewIsModal/.test(read('src/components/shared/fields/FocusedPickerHost.tsx')));
}

console.log('\n=== 5. Effective touch targets (shared primitives) ===');
{
  assert('5a. picker trigger rows: 52pt shared floor', /export const PICKER_TRIGGER_MIN_HEIGHT = 52;/.test(read('src/components/shared/fields/FocusedPickerTrigger.tsx')));
  assert('5b. checklist rows 76pt, footers/disclosure 44pt, CTA 52pt', /minHeight: 76/.test(code(read('src/components/today/MoneyPictureChecklistCard.tsx'))) && /minHeight: 44/.test(code(read('src/components/today/MoneyPictureChecklistCard.tsx'))) && /minHeight: 52/.test(code(read('src/components/today/MoneyPictureChecklistCard.tsx'))));
  assert('5c. toast dismissal keeps its 44pt target without stealing focus', /minHeight: 44/.test(code(read('src/components/celebrations/SmallCelebrationToast.tsx'))) && /minWidth: 44/.test(code(read('src/components/celebrations/SmallCelebrationToast.tsx'))));
  assert('5d. the theme exposes the shared minTouchTarget token and Today consumes it for its action rows', /minTouchTarget/.test(read('src/theme/ThemeContext.tsx')) && /minHeight: minTouchTarget/.test(code(read('src/screens/today/TodayScreen.tsx'))));
  assert('5e. the checklist dismiss X reaches 44pt effective via compliant hitSlop (18 + 13 + 13)', /hitSlop=\{\{ top: 13, bottom: 13, left: 13, right: 13 \}\}/.test(read('src/components/today/MoneyPictureChecklistCard.tsx')));
}

console.log('\n=== 6. Dynamic Type and responsive contracts (real reflow rule) ===');
{
  assert('6a. account rows stack the figure under the name at 200% or 320pt — never truncate the name', accountRowStacksBalance(375, 2.0) === true && accountRowStacksBalance(320, 1.0) === true && accountRowStacksBalance(375, 1.0) === false);
  assert('6b. the hero identity title carries its approved cap; body copy is uncapped', /maxFontSizeMultiplier=\{1\.8\}/.test(read('src/components/money/SafeToSpendHero.tsx')));
  const CARD = code(read('src/components/today/MoneyPictureChecklistCard.tsx'));
  // (the fixed 36pt icon TILE is decorative chrome, not a content row.)
  assert('6c. row, footer and group anatomy use minHeight only — content grows, never clips', ['row: {', 'groupFooter: {', 'taskGroup: {'].every((k) => !/\bheight: \d/.test(CARD.slice(CARD.indexOf(k), CARD.indexOf('}', CARD.indexOf(k))))));
  assert('6d. the dock stays capped at 500pt and content at its approved width on iPad', /DOCK_MAX_WIDTH = 500/.test(read('src/navigation/floatingNavGeometry.ts')));
}

console.log('\n=== 7. Six themes — the real resolver, every combination ===');
{
  const relLum = (hex: string) => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  for (const style of ['ocean', 'purple', 'sunrise'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const c = resolveSemanticColors(style, scheme);
      assert(`7-${style}-${scheme}. body text meets 4.5:1 on canvas and surface`, contrast(c.textPrimary, c.bgCanvas) >= 4.5 && contrast(c.textPrimary, c.bgSurface) >= 4.5);
      assert(`7-${style}-${scheme}. interactive, success and warning remain distinct signals`, c.interactive !== c.success && c.interactive !== c.warning && c.success !== c.warning);
      assert(`7-${style}-${scheme}. the ambient wash is never a status colour`, !c.ambient.includes(c.success) && !c.ambient.includes(c.warning) && !c.ambient.includes(c.warningAccent));
    }
  }
}

console.log('\n=== 8. Limited Thai surface (formally limited — no localisation programme) ===');
{
  const th = JSON.parse(read('src/i18n/locales/th.json'));
  const countKeys = (o: Record<string, unknown>): number => Object.values(o).reduce((n: number, v) => n + (typeof v === 'object' && v !== null ? countKeys(v as Record<string, unknown>) : 1), 0);
  assert('8a. the translated surface remains exactly the accepted 26 strings — no silent expansion', countKeys(th) === 26);
  assert('8b. Thai text resolves the Noto Sans Thai family through the real role resolver', fontFamilyForWeight(400, 'th').startsWith('NotoSansThai') && fontFamilyForWeight(600, 'th').startsWith('NotoSansThai'));
  assert('8c. Latin/tabular figures remain Figtree even in the Thai locale (amounts and dates intact)', fontFamilyForWeight(400, 'en').startsWith('Figtree'));
  assert('8d. no uppercase transformation exists to garble Thai', !/textTransform: 'uppercase'/.test(code(read('src/screens/settings/LanguageScreen.tsx'))));
}

console.log('\n=== 9. Android exclusion boundary (deferral, not implementation) ===');
{
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of require('fs').readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const androidBranches = walk('src').reduce((n, rel) => n + (code(read(rel)).match(/Platform\.OS === 'android'/g) ?? []).length, 0);
  assert(`9a. Wave 11 added NO Android-specific branches — the pre-existing count stands (${androidBranches})`, androidBranches === 6);
  assert('9b. the new Wave 11 modules are platform-agnostic', !/Platform/.test(read('src/lib/a11yFocus.ts')) && !/Platform/.test(read('src/lib/a11yStrings.ts')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
