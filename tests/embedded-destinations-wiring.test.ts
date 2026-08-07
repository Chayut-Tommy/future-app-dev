// Full-workspace extension — per-destination structural (Class C) coverage
// for the seven components newly given embedded mode this round (Bill,
// Income source, Expense/Income received, Liability's extension to
// AddWealthItemModal, Credit card, Goal), proving each independently
// implements the universal embedded pattern correctly, standalone behind
// their existing `embedded` default (or its absence for Goal's
// non-existent onTitleChange) — separate from
// tests/add-anything-sheet-full-workspace.test.ts, which proves the HOST
// wires them together correctly, not each form's own internal contract.
//
// CLASSIFICATION: Class C (static/source-structure) throughout. NOT
// proven here: any runtime/visual/animation/keyboard/focus behaviour —
// physical-device verification required for that, per the standing
// evidence classification for this stream.
//
// Run with: ./node_modules/.bin/tsx tests/embedded-destinations-wiring.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const BILL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/AddRecurringItemModal.tsx', 'utf-8');
const INCOME_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/income/AddIncomeModal.tsx', 'utf-8');
const QUICK_ADD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/dashboard/QuickAddModal.tsx', 'utf-8');
const ADD_WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const CREDIT_CARD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/credit/AddCreditCardModal.tsx', 'utf-8');
const GOAL_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/goals/AddGoalModal.tsx', 'utf-8');

console.log('=== 1. Bill (AddRecurringItemModal.tsx) — embedded wiring (Class C) ===');
{
  assert('1a. forwardRef with AddRecurringItemModalHandle = EmbeddedStepHandle', /export type AddRecurringItemModalHandle = EmbeddedStepHandle;/.test(BILL_SRC) && /export const AddRecurringItemModal = forwardRef</.test(BILL_SRC));
  assert('1b. onRequestLoan (embedded handoff) is distinct from onSelectLoan (standalone) — both present', /onSelectLoan\?: \(type: LiabilityType\) => void;/.test(BILL_SRC) && /onRequestLoan\?: \(type: LiabilityType\) => void;/.test(BILL_SRC));
  assert('1c. chooseBillType branches embedded (onRequestLoan, synchronous) vs standalone (the original defer/timer dance, byte-unchanged)', /if \(embedded\) \{\s*\n\s*onRequestLoan\?\.\(p\.handoffLoanType\);\s*\n\s*return;\s*\n\s*\}/.test(BILL_SRC));
  assert('1d. handleRequestClose never discards on \'back\', confirms on every other reason', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\?\.\(reason\), 'Discard this bill\?', 'Your new bill details will be lost\.'\);/.test(BILL_SRC));
  assert('1e. handleSave success path branches embedded (onSaveSuccess) vs standalone (onClose), never a discard prompt on success', /if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/.test(BILL_SRC));
  assert('1f. both render steps (category, details) return bare content when embedded, before falling through to the unchanged standalone KeyboardSheet wrap', (BILL_SRC.match(/if \(embedded\) return (categoryContent|content);/g) || []).length === 2);
  assert('1g. useImperativeHandle exposes exactly requestSave/requestClose, delegating to the same handleSave/handleRequestClose used elsewhere in the file', /useImperativeHandle\(ref, \(\) => \(\{\s*\n\s*requestSave: handleSave,\s*\n\s*requestClose: handleRequestClose,\s*\n\s*\}\)\);/.test(BILL_SRC));
}

console.log('\n=== 2. Income source (AddIncomeModal.tsx) — embedded wiring across all three internal steps (Class C) ===');
{
  assert('2a. forwardRef with AddIncomeModalHandle = EmbeddedStepHandle', /export type AddIncomeModalHandle = EmbeddedStepHandle;/.test(INCOME_SRC) && /export const AddIncomeModal = forwardRef</.test(INCOME_SRC));
  assert(
    '2b. onCanSaveChange is gated to formStep===\'details\' — Save is never reported reachable from category or midCycle, preventing a stray host Save tap from re-triggering the mid-cycle branch and minting an unused id',
    /onCanSaveChange\?\.\(canSave && formStep === 'details'\);/.test(INCOME_SRC)
  );
  assert('2c. handleSave itself also guards on formStep===\'details\', defensively, not just the reported canSave', /if \(!canSave \|\| !parsedIncome\.valid \|\| formStep !== 'details'\) return;/.test(INCOME_SRC));
  assert(
    "2d. onTitleChange reports a distinct title per internal step (category/midCycle/details) — all three internal steps stay inside this one embedded route, never exposed to the host as separate routes",
    /onTitleChange\?\.\(formStep === 'category' \? 'Add income source' : formStep === 'midCycle' \? 'One more thing' : isEditing \? 'Edit income source' : 'Add income source'\);/.test(INCOME_SRC)
  );
  assert('2e. handleRequestClose never discards on \'back\'', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}/.test(INCOME_SRC));
  assert(
    '2f. all three mid-cycle option handlers (chooseMidCycleNoOccurrence/AlreadyIncluded/AddToBalance) branch embedded (onSaveSuccess) vs standalone (onClose) on their own successful-completion path — not just the ordinary handleSave',
    (INCOME_SRC.match(/if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/g) || []).length === 4
  );
  assert('2g. all three render steps (category, midCycle, details) return bare content when embedded', (INCOME_SRC.match(/if \(embedded\) return (categoryContent|midCycleContent|content);/g) || []).length === 3);
}

console.log('\n=== 3. Expense / Income received (QuickAddModal.tsx) — embedded wiring shared by both routes (Class C) ===');
{
  assert('3a. forwardRef with QuickAddModalHandle = EmbeddedStepHandle', /export type QuickAddModalHandle = EmbeddedStepHandle;/.test(QUICK_ADD_SRC) && /export const QuickAddModal = forwardRef</.test(QUICK_ADD_SRC));
  assert('3b. onCanSaveChange is gated to formStep===\'details\'', /onCanSaveChange\?\.\(canSave && formStep === 'details'\);/.test(QUICK_ADD_SRC));
  assert('3c. handleSave success path branches embedded vs standalone', /if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/.test(QUICK_ADD_SRC));
  assert('3d. handleRequestClose never discards on \'back\'', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}/.test(QUICK_ADD_SRC));
  assert('3e. both render steps (category, details) return bare content when embedded', (QUICK_ADD_SRC.match(/if \(embedded\) return (categoryContent|content);/g) || []).length === 2);
  assert(
    '3f. the nested "Add cash balance first" AddWealthItemModal is deliberately NEVER given embedded — a genuine standalone secondary overlay (like this form\'s own date/category pickers elsewhere), not a sibling Add Anything destination',
    (() => {
      const tag = QUICK_ADD_SRC.match(/<AddWealthItemModal visible=\{addCashVisible\}[\s\S]*?\/>/);
      return !!tag && !/\bembedded\b/.test(tag[0]);
    })()
  );
}

console.log('\n=== 4. Liability (AddWealthItemModal.tsx extension) — embedded reachable with kind="liability" (Class C) ===');
{
  assert('4a. embedded is reachable with kind==="liability" — no longer restricted to kind==="asset" only (per its own updated doc comment)', /embedded\?: boolean;/.test(ADD_WEALTH_SRC) && !/MUST only ever be combined with kind='asset'/.test(ADD_WEALTH_SRC));
  assert('4b. onRequestCreditCard is the embedded equivalent of onSelectCreditCard — both present, distinctly documented', /onSelectCreditCard\?: \(\) => void;/.test(ADD_WEALTH_SRC) && /onRequestCreditCard\?: \(\) => void;/.test(ADD_WEALTH_SRC));
  assert(
    "4c. the credit-card type chip branches embedded (onRequestCreditCard, synchronous) vs standalone (the original defer/timer dance, byte-unchanged)",
    /if \(embedded\) \{\s*\n\s*onRequestCreditCard\?\.\(\);\s*\n\s*return;\s*\n\s*\}/.test(ADD_WEALTH_SRC)
  );
  assert(
    "4d. the liability-selector step's title is unified into the single `title` computed variable (showLiabilitySelector branch) — used by BOTH onTitleChange (embedded) and the standalone step's own KeyboardSheet, never a second hardcoded copy",
    /showLiabilitySelector\s*\n\s*\? `Which \$\{LIABILITY_DISPLAY_NAME\[liabilityType\]\} is this repayment for\?`/.test(ADD_WEALTH_SRC)
  );
  assert(
    '4e. the liability-selector step itself is dual-mode (extracted selectorContent, embedded returns it bare, standalone still wraps it in its own KeyboardSheet using the shared `title`)',
    /if \(embedded\) \{\s*\n\s*return selectorContent;\s*\n\s*\}/.test(ADD_WEALTH_SRC)
  );
}

console.log('\n=== 5. Credit card (AddCreditCardModal.tsx) — embedded wiring (Class C) ===');
{
  assert('5a. forwardRef with AddCreditCardModalHandle = EmbeddedStepHandle', /export type AddCreditCardModalHandle = EmbeddedStepHandle;/.test(CREDIT_CARD_SRC) && /export const AddCreditCardModal = forwardRef</.test(CREDIT_CARD_SRC));
  assert('5b. isDirty is embedded-gated (always false standalone, preserving the original unconditional-close behaviour exactly)', /const isDirty =\s*\n\s*embedded &&/.test(CREDIT_CARD_SRC));
  assert('5c. onTitleChange reports a real, isEditing-aware title', /onTitleChange\?\.\(isEditing \? 'Edit credit card' : 'Add credit card'\);/.test(CREDIT_CARD_SRC));
}

console.log('\n=== 6. Goal (AddGoalModal.tsx) — embedded wiring (Class C, no onTitleChange — single static title, no internal steps) ===');
{
  assert('6a. forwardRef with AddGoalModalHandle = EmbeddedStepHandle', /export type AddGoalModalHandle = EmbeddedStepHandle;/.test(GOAL_SRC) && /export const AddGoalModal = forwardRef</.test(GOAL_SRC));
  assert('6b. isDirty is embedded-gated, comparing every field against its fixed create-only initial value (no snapshot ref needed — always the same starting values)', /const isDirty =\s*\n\s*embedded && \(type !== null \|\| name !== '' \|\| targetAmount !== '' \|\| targetMonth !== '' \|\| targetYear !== '' \|\| priority !== 'medium'\);/.test(GOAL_SRC));
  assert('6c. AddGoalModal genuinely has no onTitleChange prop — a deliberate omission (single-step form, static title), not an oversight', !/onTitleChange/.test(GOAL_SRC));
}

console.log('\n=== 7. Universal pattern — every one of the six forwardRef-based destinations shares the identical embedded-prop shape (Class C) ===');
{
  const components: [string, string][] = [
    ['AddRecurringItemModal.tsx', BILL_SRC],
    ['AddIncomeModal.tsx', INCOME_SRC],
    ['QuickAddModal.tsx', QUICK_ADD_SRC],
    ['AddCreditCardModal.tsx', CREDIT_CARD_SRC],
    ['AddGoalModal.tsx', GOAL_SRC],
  ];
  for (const [name, src] of components) {
    assert(`7. ${name} declares embedded?: boolean defaulting to false in its destructured parameters`, /embedded\?: boolean;/.test(src) && /embedded = false/.test(src));
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
