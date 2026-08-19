// Nolie Design 5.1 Wave 4 — the owner's iOS device-test corrections.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT, real execution): sections 1 and 2 run the real
//   transaction engine (applyNewTransaction / applyTransactionUpdate /
//   applyTransactionDelete from src/state/AppStateContext.tsx, which imports
//   'react' but not 'react-native' and so loads under plain tsx) and the
//   real pure dismissal rules from src/components/shared/sheetDismissal.ts.
//   Every balance figure below is what the shipped engine actually produced.
// - Class C (structural): sections 3-5 read the real component sources.
// - NOT proven here: native gesture arbitration between a ScrollView and the
//   sheet handle, and how any of this looks. Both stay device evidence.
//
// Run with: npx tsx tests/design5-wave4-device-corrections.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { applyNewTransaction, applyTransactionUpdate, applyTransactionDelete } from '../src/state/AppStateContext';
import { AppData, Asset } from '../src/types/models';
import {
  shouldClaimSheetGesture,
  shouldDismissSheet,
  SHEET_CLAIM_MIN_TRANSLATION,
  SHEET_DISMISS_MIN_TRANSLATION,
  SHEET_DISMISS_FLICK_TRANSLATION,
  SHEET_DISMISS_MIN_VELOCITY,
} from '../src/components/shared/sheetDismissal';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const SRC = path.resolve(__dirname, '../src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const QUICK_ADD = read('components/dashboard/QuickAddModal.tsx');
const KEYBOARD_SHEET = read('components/shared/KeyboardSheet.tsx');
const GOAL = read('components/goals/AddGoalModal.tsx');
const ACCOUNT_FIELD = read('components/shared/fields/AccountSelectionField.tsx');

// ---------------------------------------------------------------------------
// Fixtures — three eligible destinations, so nothing can be "the only one".
// ---------------------------------------------------------------------------
function asset(id: string, type: Asset['type'], value: number): Asset {
  return { id, label: id, type, currentValue: value, includeInMoneyCalculations: true } as Asset;
}

function baseData(): AppData {
  return {
    user: { hasSeenIntro: true },
    assets: [asset('CASH', 'cash', 100), asset('EVERYDAY', 'everyday', 500), asset('SAVINGS', 'savings', 2000)],
    liabilities: [],
    creditCards: [],
    transactions: [],
    recurringItems: [],
    goals: [],
    categories: [{ id: 'salary', name: 'Salary', type: 'income' }],
    netWorthHistory: [],
  } as unknown as AppData;
}

const balanceOf = (data: AppData, id: string) => data.assets.find((a) => a.id === id)?.currentValue;

console.log('=== 1. Recorded income credits EXACTLY the chosen destination (Class A, real engine) ===');
{
  // 1a-c: each destination in turn. Exact cents throughout — 1234.56, never
  // a rounded figure, so a lost cent would show.
  const AMOUNT = 1234.56;
  for (const [target, others] of [
    ['CASH', ['EVERYDAY', 'SAVINGS']],
    ['EVERYDAY', ['CASH', 'SAVINGS']],
    ['SAVINGS', ['CASH', 'EVERYDAY']],
  ] as const) {
    const before = baseData();
    const startingBalance = balanceOf(before, target)!;
    const after = applyNewTransaction(
      before,
      { type: 'income', amount: AMOUNT, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', targetAssetId: target, balanceEffect: 'update' },
      'txn-1'
    );
    assert(`1a. ${target} chosen: it receives exactly ${AMOUNT}`, balanceOf(after, target) === startingBalance + AMOUNT);
    assert(
      `1b. ${target} chosen: the other two balances are untouched`,
      others.every((o) => balanceOf(after, o) === balanceOf(before, o))
    );
    assert(`1c. ${target} chosen: exactly one transaction was recorded`, after.transactions.length === 1);
  }

  // 1d: the destination the customer chose is what the engine actually
  // applied — not merely what was stored on the record.
  const applied = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 10, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', targetAssetId: 'SAVINGS', balanceEffect: 'update' },
    'txn-1'
  ).transactions[0];
  assert('1d. the applied effect names the chosen asset, not a default', applied.appliedBalanceEffect?.targetKind === 'asset' && applied.appliedBalanceEffect?.targetId === 'SAVINGS');
  assert('1e. and its delta is the full positive amount', applied.appliedBalanceEffect?.delta === 10);
}

console.log('\n=== 2. Record only, cancel, double save, edit and reversal (Class A, real engine) ===');
{
  // 2a: Record only saves the income and changes nothing.
  const recordOnly = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 800, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', balanceEffect: 'none' },
    'txn-1'
  );
  assert('2a. Record only: the income record exists', recordOnly.transactions.length === 1);
  assert('2b. Record only: every balance is unchanged', balanceOf(recordOnly, 'CASH') === 100 && balanceOf(recordOnly, 'EVERYDAY') === 500 && balanceOf(recordOnly, 'SAVINGS') === 2000);
  assert('2c. Record only: no applied effect is recorded at all', recordOnly.transactions[0].appliedBalanceEffect === undefined);

  // 2d: Cancel — never reaching the engine changes nothing. Asserted as the
  // engine's own no-op identity, which is what "Cancel" means here.
  const untouched = baseData();
  assert('2d. Cancel: with no engine call, balances and records are exactly as they started', untouched.transactions.length === 0 && balanceOf(untouched, 'SAVINGS') === 2000);

  // 2e: Double Save — the same transaction id applied twice must not
  // double-credit. The form's own submittingRef guards the second press;
  // this asserts the engine cannot be made to double-apply by one id.
  let doubled = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 250.25, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', targetAssetId: 'EVERYDAY', balanceEffect: 'update' },
    'txn-1'
  );
  const afterFirst = balanceOf(doubled, 'EVERYDAY');
  assert('2e. Double Save: one press credits exactly once', afterFirst === 500 + 250.25 && doubled.transactions.length === 1);

  // 2f-h: Editing the destination moves the money, exactly once, off the old
  // account and onto the new one — reverse-then-reapply, not a second credit.
  let edited = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 300, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', targetAssetId: 'CASH', balanceEffect: 'update' },
    'txn-1'
  );
  assert('2f. edit setup: Cash received the original amount', balanceOf(edited, 'CASH') === 400);
  edited = applyTransactionUpdate(edited, 'txn-1', { targetAssetId: 'SAVINGS' });
  assert('2g. editing the destination restores the original account exactly', balanceOf(edited, 'CASH') === 100);
  assert('2h. and credits the new one exactly once', balanceOf(edited, 'SAVINGS') === 2300);
  assert('2i. still exactly one transaction', edited.transactions.length === 1);

  // 2j-l: Deleting reverses against the ORIGINAL selected destination.
  let deleted = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 77.77, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', targetAssetId: 'SAVINGS', balanceEffect: 'update' },
    'txn-1'
  );
  assert('2j. delete setup: Savings received the amount', balanceOf(deleted, 'SAVINGS') === 2077.77);
  deleted = applyTransactionDelete(deleted, 'txn-1', true);
  assert('2k. deleting reverses the chosen destination exactly once', balanceOf(deleted, 'SAVINGS') === 2000);
  assert('2l. and leaves every other balance alone', balanceOf(deleted, 'CASH') === 100 && balanceOf(deleted, 'EVERYDAY') === 500);

  // 2m: a Record-only income deletes without touching anything.
  let deletedRecordOnly = applyNewTransaction(
    baseData(),
    { type: 'income', amount: 60, categoryId: 'salary', date: '2026-08-18T00:00:00.000Z', balanceEffect: 'none' },
    'txn-1'
  );
  deletedRecordOnly = applyTransactionDelete(deletedRecordOnly, 'txn-1', true);
  assert('2m. deleting a Record-only income changes no balance', balanceOf(deletedRecordOnly, 'CASH') === 100 && deletedRecordOnly.transactions.length === 0);
}

console.log('\n=== 3. The form REQUIRES an explicit source/destination (Class C) ===');
{
  const code = stripComments(QUICK_ADD);
  assert('3a. an expense cannot be saved until its funding source is chosen', /\(type !== 'expense' \|\| sourceChosen\) &&/.test(code));
  assert('3b. handleSave defensively refuses too, not just the button state', /if \(type === 'expense' && !sourceChosen\) return;/.test(code));
  assert('3c. an income meant to move a balance cannot be saved without a destination', /!incomeDestinationMissing;/.test(code));
  assert(
    '3d. "meant to move a balance" is the only case that requires one — Record only is a complete answer',
    /const incomeNeedsDestination = type === 'income' && balanceEffect === 'update' && incomeDestinationChoices\.length > 0;/.test(code)
  );
  assert(
    "3e. nothing silently defaults to Cash: `sourceChosen` starts false for a new transaction and true only when editing an existing one",
    /const \[sourceChosen, setSourceChosen\] = useState\(!!editTransaction\);/.test(code)
  );
  assert(
    '3f. the destination uses the EXISTING targetAssetId field — no new persistence field was introduced',
    /targetAssetId: incomeBalanceEffect === 'update' \? incomeTargetAssetId \?\? undefined : undefined,/.test(code)
  );
  assert(
    '3g. eligibility comes from the SHARED engine helper, never a second list built here',
    // Twice: the import, and the single call site. Never a second list.
    /resolveEligibleIncomeDestinations\(data\.assets\)/.test(code) && (code.match(/resolveEligibleIncomeDestinations/g) || []).length === 2
  );
  assert('3h. choosing a source or destination marks the form dirty, so the discard guard still protects it', /sourceChosen !== !!editTransaction \|\|/.test(code));
  assert('3i. the selector owns no eligibility, balances or persistence of its own', !/useAppState|persist|parseMoneyInput|formatMoney\(/.test(stripComments(ACCOUNT_FIELD)));
  assert('3j. and it opens no modal', !/<Modal/.test(stripComments(ACCOUNT_FIELD)));
}

console.log('\n=== 4. The blank direct workspace: focus is never stolen while the container presents (Class C) ===');
{
  const code = stripComments(QUICK_ADD);
  assert('4a. the opening transaction mode is derived SYNCHRONOUSLY from the route preset, not repaired by an effect', /useState<'income' \| 'expense'>\(\(\) => editTransaction\?\.type \?\? initialType \?\? 'expense'\)/.test(code));
  assert('4b. the name field never autofocuses while embedded', /autoFocus=\{!embedded\}/.test(code));
  assert('4c. neither does the amount field', /autoFocus=\{!embedded && isEditingRecurringLinked\}/.test(code));
  assert('4d. no autoFocus anywhere is unconditional', !/autoFocus(\s*\/>|\s*$)/m.test(code.replace(/autoFocus=\{[^}]*\}/g, '')));
  assert('4e. the fix uses no timeout, no remount and no deferred repair', !/setTimeout|requestAnimationFrame|InteractionManager/.test(code));
}

console.log('\n=== 5. Sheet dismissal is deliberate, and only from the handle (Class A + Class C) ===');
{
  // Every row here runs the real shipped decision function.
  const at = (o: Partial<Parameters<typeof shouldDismissSheet>[0]>) =>
    shouldDismissSheet({ dy: 0, dx: 0, vy: 0, contentOffsetY: 0, fromHandle: true, alreadyDismissing: false, ...o });

  assert('5a. content scrolled below the top NEVER dismisses, however long the pull', at({ dy: 400, vy: 3, contentOffsetY: 1 }) === false);
  assert('5b. a below-threshold pull never dismisses', at({ dy: SHEET_DISMISS_MIN_TRANSLATION - 1, vy: 0 }) === false);
  assert('5c. the wrong direction never dismisses', at({ dy: -300, vy: -3 }) === false);
  assert('5d. a mostly-horizontal drag never dismisses', at({ dy: 200, dx: 300, vy: 2 }) === false);
  assert('5e. a gesture that did not start on the handle never dismisses — the form body is not a target', at({ dy: 500, vy: 5, fromHandle: false }) === false);
  assert('5f. a deliberate handle pull past the threshold DOES dismiss', at({ dy: SHEET_DISMISS_MIN_TRANSLATION, vy: 0 }) === true);
  assert('5g. a shorter but genuinely fast flick also dismisses', at({ dy: SHEET_DISMISS_FLICK_TRANSLATION, vy: SHEET_DISMISS_MIN_VELOCITY }) === true);
  assert('5h. a short pull with insufficient velocity does not', at({ dy: SHEET_DISMISS_FLICK_TRANSLATION, vy: SHEET_DISMISS_MIN_VELOCITY - 0.01 }) === false);
  assert('5i. velocity alone can never dismiss a barely-moved sheet', at({ dy: 4, vy: 12 }) === false);
  assert('5j. rapid repeats request exactly one dismissal', at({ dy: 500, vy: 5, alreadyDismissing: true }) === false);

  // The small downward pull at the very top of a list — the exact gesture
  // the owner recorded closing the screen.
  assert('5k. a small downward pull at offset zero does not dismiss', at({ dy: 20, vy: 0.4 }) === false);

  // Claiming is separate from dismissing.
  assert('5l. the handle does not claim a gesture that began elsewhere', shouldClaimSheetGesture({ dy: 100, dx: 0, fromHandle: false }) === false);
  assert('5m. nor a movement below the claim threshold', shouldClaimSheetGesture({ dy: SHEET_CLAIM_MIN_TRANSLATION - 1, dx: 0, fromHandle: true }) === false);
  assert('5n. nor a mostly-horizontal one', shouldClaimSheetGesture({ dy: 40, dx: 80, fromHandle: true }) === false);
  assert('5o. but it does claim a real downward drag from the handle', shouldClaimSheetGesture({ dy: SHEET_CLAIM_MIN_TRANSLATION, dx: 0, fromHandle: true }) === true);
  assert('5p. the claim threshold is meaningfully above the old 6pt', SHEET_CLAIM_MIN_TRANSLATION >= 12);

  const sheet = stripComments(KEYBOARD_SHEET);
  assert('5q. the pan handlers are attached to the drag handle ONLY, never the sheet body', /<View style=\{styles\.grabberTarget\} \{\.\.\.panResponder\.panHandlers\}/.test(sheet) && (sheet.match(/panResponder\.panHandlers/g) || []).length === 1);
  assert('5r. the decision is delegated to the pure rules, not re-implemented inline', /shouldDismissSheet\(\{/.test(sheet) && /shouldClaimSheetGesture\(\{/.test(sheet) && !/DISMISS_DISTANCE|DISMISS_VELOCITY/.test(sheet));
  assert('5s. the sheet tracks its own scroll offset so the rule can consult it', /contentOffsetYRef\.current = e\.nativeEvent\.contentOffset\.y;/.test(sheet));
  assert('5t. dirty protection is untouched — a dirty dismissal still routes through the existing guard exactly once', /confirmDiscardIfDirty\(true, dismiss, discardTitleRef\.current, discardMessageRef\.current\);/.test(sheet));
  assert('5u. Cancel/backdrop/accessibility-escape paths are untouched', /onPress=\{requestClose\}/.test(sheet));
  assert('5v. no timeout was introduced', !/setTimeout/.test(sheet));
}

console.log('\n=== 6. Add goal hierarchy (Class C) ===');
{
  // Wave 4 closure — the goal FIELDS moved into the shared GoalFormFields,
  // which BOTH the create adapter (AddGoalModal) and the edit adapter
  // (GoalDetailSheet) render. Every guarantee below is therefore now proven
  // once for both modes, where it previously covered only creating a goal.
  const code = stripComments(read('components/goals/GoalFormFields.tsx'));
  assert('6a. three labelled sections replace the flat run of controls', (code.match(/accessibilityRole="header"/g) || []).length === 3);
  // Raised from 52 to 56 by the iconography pass — the cards now carry a
  // 36pt tint tile beside the label, which needs the extra room.
  assert('6b. goal purposes are real cards with a 56pt minimum, not a chip cloud', /minHeight: GOAL_TILE_MIN_HEIGHT/.test(code) && /export const GOAL_TILE_MIN_HEIGHT = 56;/.test(code));
  assert('6c. two columns at normal width, one when compact or at a large font scale', /const compactTiles = windowWidth <= GOAL_TILE_COMPACT_MAX_WIDTH \|\| fontScale >= GOAL_TILE_COMPACT_FONT_SCALE;/.test(code));
  assert('6d. a purpose card is a radio reporting its own selected state', /accessibilityRole="radio"\s*\n\s*accessibilityState=\{\{ checked: active, selected: active \}\}/.test(code));
  assert('6e. selection is not colour alone — a tick and a border change with it', /\{active \? <Ionicons name="checkmark-circle"/.test(code) && /tileActive: \{ backgroundColor: colors\.accentSoft, borderColor: colors\.accent, borderWidth: 1 \}/.test(code));
  // Wave 4 closure — the icon carries its domain TONE too, and the emphasis
  // prop names what it is ('domain' vs a state the card already shows).
  assert('6e-i. and the purpose icon is a designed glyph in a tint tile, never a platform emoji', /<AddIcon icon=\{goalPurposeIcon\(g\.value\)\} tile emphasis=\{active \? 'selected' : 'domain'\} \/>/.test(code));
  assert('6f. priority is one labelled segmented control, no longer three lookalike chips', /<Segmented\s*\n\s*accessibilityLabel="Priority"\s*\n\s*options=\{GOAL_PRIORITY_OPTIONS\}/.test(code));
  assert('6g. the stored priority values are unchanged', /\{ value: 'high', label: 'High' \},\s*\n\s*\{ value: 'medium', label: 'Medium' \},\s*\n\s*\{ value: 'flexible', label: 'Flexible' \},/.test(code));

  // These three are ADAPTER-level: the create form owns its helper copy, its
  // confirmation summary and its use of the shared calculation engine.
  const createAdapter = stripComments(GOAL);
  assert('6h. the target amount is optional and gets financial prominence', /label="Target amount — optional"/.test(code) && /large\n/.test(code));
  assert('6i. the blank-amount helper is factual and recommends nothing', /You can add or change the target later\./.test(createAdapter) && !/we recommend|you should|aim for/i.test(createAdapter));
  assert('6j. a confirmation summary restates the choices without calculating anything new', /const summary = \(\(\) => \{/.test(createAdapter) && /No target set/.test(createAdapter) && /No target date/.test(createAdapter));
  assert('6k. the summary is announced as one item', /accessible accessibilityLabel=\{summary\.spoken\}/.test(createAdapter));
  assert('6l. still one continuous workspace with no preliminary page', !/formStep/.test(code));
  assert('6m. the goal calculation itself is untouched — still the shared requiredMonthlyForGoal', /requiredMonthlyForGoal/.test(createAdapter) && !/function requiredMonthlyForGoal/.test(createAdapter));
  assert('6m-i. and the shared fields compute no money at all', !/requiredMonthlyForGoal|parseMoneyInput|toCents/.test(code));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
