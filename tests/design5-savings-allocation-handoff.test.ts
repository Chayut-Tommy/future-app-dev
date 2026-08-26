// Pre-Wave-10 correction — Money's "Set up savings allocation" CTA now
// reliably opens the existing canonical Savings Allocation editor.
//
// VERIFIED ROOT CAUSE (source inspection matching the recording): the
// Typical-money-flow category detail sheet is a native-Modal
// KeyboardSheet, and every one of its four CTAs set a SIBLING modal
// visible while the summary was still presented — e.g.
// `onCta: () => setEditSavingsAllocationVisible(true)`. iOS silently
// refuses to present a second modal over an already-presented one, so the
// button absorbed repeated taps with no transition, while the identical
// editor worked from Wealth (no competing modal). The fix is the
// repository's established pending-handoff pattern (AddWealthItemModal's
// credit-card handoff / OptionsSheet's deferred onSelect): one pending
// intent, summary dismissal first, intent delivered from the native
// onDismiss (iOS) or the post-commit effect (Android). No timers.
//
// CLASSIFICATION: §1–§4 Class C structural over the real sources
// (comment-stripped); §5 Class A against the real validation and engine.
// The rendered suite drives the REAL Money path.
// Run with: ./node_modules/.bin/tsx tests/design5-savings-allocation-handoff.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { resolveSavingsAllocationMonthly } from '../src/lib/calculations/savingsAllocation';

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

const MONEY = code(read('src/screens/money/MoneyScreen.tsx'));
const SHEET = code(read('src/components/money/MoneyFlowCategoryDetailSheet.tsx'));
const KEYBOARD = code(read('src/components/shared/KeyboardSheet.tsx'));
const EDITOR = code(read('src/components/wealth/EditSavingsAllocationModal.tsx'));

console.log('=== 1. The defect pattern is gone; the handoff is the established one ===');
{
  assert('1a. no CTA opens a sibling modal while the summary is still presented', !/onCta: \(\) => setEditSavingsAllocationVisible\(true\)/.test(MONEY) && !/onCta: \(\) => \{ setEditIncome\(null\); setIncomeModalVisible\(true\); \} \}/.test(MONEY) && !/onCta: openAddBill \}/.test(MONEY) && !/onCta: \(\) => setGoalModalVisible\(true\) \}/.test(MONEY));
  assert('1b. all four category CTAs route through the ONE pending handoff', (MONEY.match(/requestFlowDetailAction\(/g) ?? []).length >= 7);
  assert('1c. the tap records ONE intent and starts the summary dismissal immediately', /pendingFlowDetailActionRef\.current = action;\s*\n\s*setFlowDetailCategory\(null\);/.test(MONEY));
  assert('1d. first tap wins — a second tap cannot queue a second intent', /if \(pendingFlowDetailActionRef\.current\) return;/.test(MONEY));
  assert('1e. the intent drains exactly once', /const action = pendingFlowDetailActionRef\.current;\s*\n\s*if \(!action\) return;\s*\n\s*pendingFlowDetailActionRef\.current = null;\s*\n\s*action\(\);/.test(MONEY));
  assert('1f. iOS delivery is the NATIVE onDismiss — the real dismissal-complete signal', /onDismiss=\{Platform\.OS === 'ios' \? runPendingFlowDetailAction : undefined\}/.test(MONEY));
  assert('1g. Android delivery is the post-commit effect, never a timer', /if \(Platform\.OS === 'android' && flowDetailCategory === null\) runPendingFlowDetailAction\(\);/.test(MONEY));
  const handoffBlock = MONEY.slice(MONEY.indexOf('pendingFlowDetailActionRef'), MONEY.indexOf('const flowDetailBreakdown'));
  assert('1h. no setTimeout, sleep or debounce anywhere in the handoff', !/setTimeout|debounce|sleep|delay\(/i.test(handoffBlock));
  assert('1i. an ordinary Close with nothing pending is a safe no-op (drain guard above)', /if \(!action\) return;/.test(MONEY));
}

console.log('\n=== 2. The summary sheet forwards the native signal; the CTA announces itself ===');
{
  assert('2a. the detail sheet forwards onDismiss to its KeyboardSheet', /onDismiss=\{onDismiss\}/.test(SHEET) && /onDismiss\?: \(\) => void;/.test(read('src/components/money/MoneyFlowCategoryDetailSheet.tsx')));
  assert('2b. KeyboardSheet still fires the caller onDismiss from the REAL native completion', /function handleNativeDismissComplete\(\) \{\s*\n\s*translateY\.setValue\(0\);\s*\n\s*onDismiss\?\.\(\);/.test(KEYBOARD));
  assert('2c. the CTA carries the spoken destination hint', MONEY.includes("ctaHint: 'Opens Savings Allocation settings',") && /accessibilityHint=\{ctaHint \?\? undefined\}/.test(SHEET));
  assert('2d. the CTA remains a real 44pt Button (shared component minTouchTarget)', /<Button label=\{ctaLabel\} onPress=\{onCta\}/.test(SHEET));
  assert('2e. the sheet stays read-only — no persistence or engine call was added', !/useAppState|persist|updateUser|compute/.test(SHEET.replace(/computeMoneyFlowCategoryBreakdown/g, '')));
}

console.log('\n=== 3. Exactly one canonical editor, reused — never a duplicate ===');
{
  assert('3a. Money mounts the SAME EditSavingsAllocationModal Wealth uses', /import \{ EditSavingsAllocationModal \} from '\.\.\/\.\.\/components\/wealth\/EditSavingsAllocationModal';/.test(read('src/screens/money/MoneyScreen.tsx')) && (MONEY.match(/<EditSavingsAllocationModal/g) ?? []).length === 1);
  assert('3b. the Wealth entry is untouched', /EditSavingsAllocationModal/.test(code(read('src/components/wealth/MoneyEngineCard.tsx'))) || /EditSavingsAllocationModal/.test(code(read('src/screens/wealth/WealthScreen.tsx'))));
  assert('3c. the editor still renders the ONE shared picker body and validity rule', /SavingsAllocationPickerBody/.test(EDITOR) && /isValidSetting/.test(EDITOR));
  assert('3d. no second allocation form, contract or route exists', !/MoneySavingsAllocation|SavingsAllocationForm2|AllocationEditor/.test(MONEY));
  assert('3e. the editor writes through the same canonical field, once', /savingsAllocation: draft/.test(EDITOR) || /savingsAllocation:/.test(EDITOR));
}

console.log('\n=== 4. Focus and modal ownership ===');
{
  assert('4a. KeyboardSheet gained an OPT-IN native-onShow title focus', /onShow=\{focusTitleOnShow \? \(\) => focusElement\(titleFocusRef\.current\) : undefined\}/.test(KEYBOARD) && /focusTitleOnShow = false,/.test(KEYBOARD));
  assert('4b. …through the ESTABLISHED focus utility, not a new one', /import \{ focusElement \} from '\.\.\/\.\.\/lib\/a11yFocus';/.test(read('src/components/shared/KeyboardSheet.tsx')));
  assert('4c. the Savings Allocation editor opts in, so focus lands on its heading', /focusTitleOnShow/.test(EDITOR));
  assert('4d. no other sheet behaviour changed — the default is off', (KEYBOARD.match(/focusTitleOnShow/g) ?? []).length >= 3);
}

console.log('\n=== 5. Allocation rules (pinned) and the REAL engine (Class A) ===');
{
  // isValidSetting lives in a component file (react-native import chain the
  // tsx runner cannot transform), so its three rules are pinned byte-level;
  // the rendered suite exercises them through the real editor.
  const BODY = code(read('src/components/wealth/SavingsAllocationPickerBody.tsx'));
  assert('5a. off is always valid; nothing is fabricated', BODY.includes("if (value.mode === 'off') return true;"));
  assert('5b. percent requires recurring income and 0 < p <= 100%', BODY.includes('return hasRecurringIncome && p > 0 && p <= MAX_PERCENT;'));
  assert('5c. fixed requires a positive amount — never silently zero', BODY.includes("if (value.mode === 'fixed') return (value.amount ?? 0) > 0;"));
  assert('5d. the REAL engine resolves 10% of $5,417 income', Math.abs(resolveSavingsAllocationMonthly({ savingsAllocation: { mode: 'percent', percent: 0.1 }, monthlyIncome: 5417 } as never) - 541.7) < 1e-9);
  assert('5e. a fixed amount passes through at exact value', resolveSavingsAllocationMonthly({ savingsAllocation: { mode: 'fixed', amount: 300.25 }, monthlyIncome: 5417 } as never) === 300.25);
  assert('5f. no allocation resolves $0', resolveSavingsAllocationMonthly({ savingsAllocation: { mode: 'off' }, monthlyIncome: 5417 } as never) === 0 && resolveSavingsAllocationMonthly({ savingsAllocation: undefined, monthlyIncome: 5417 } as never) === 0);
  assert('5g. no formula was recreated in a screen component', !/percent \* monthlyIncome|monthlyIncome \*/.test(MONEY) && !/percent \*/.test(SHEET));
  // RECONCILED — Wave 10 moved the approved dwell pair into
  // theme/motion.ts (named-constant consolidation); the toast re-exports
  // them with identical values, which is what this freeze pin protects.
  assert('5h. the premium toast is frozen — its approved dwell pair unchanged (now via theme/motion.ts)', /PLAIN_VISIBLE_MS = TOAST_LIFE_PLAIN_MS/.test(read('src/components/celebrations/SmallCelebrationToast.tsx')) && /TOAST_LIFE_PLAIN_MS = 3200/.test(read('src/theme/motion.ts')) && /TOAST_LIFE_MILESTONE_MS = 3600/.test(read('src/theme/motion.ts')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
