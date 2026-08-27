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
import * as path from 'path';

// TEST-INFRASTRUCTURE CORRECTION (Wave 9a verification pass) — this file's
// structural reads were pinned to an absolute path naming one specific
// checkout on one machine. Run from any other worktree that silently reads
// a DIFFERENT
// repository, so a structural assertion could pass against code that is not
// the code under test. Paths now resolve from this file's own location,
// matching the convention design5-add-architecture.test.ts and others
// already use. No product assertion, expected value or production file is
// changed by this correction.
const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const BILL_SRC = readFileSync(srcPath('src/components/money/AddRecurringItemModal.tsx'), 'utf-8');
const INCOME_SRC = readFileSync(srcPath('src/components/income/AddIncomeModal.tsx'), 'utf-8');
const QUICK_ADD_SRC = readFileSync(srcPath('src/components/dashboard/QuickAddModal.tsx'), 'utf-8');
const ADD_WEALTH_SRC = readFileSync(srcPath('src/components/wealth/AddWealthItemModal.tsx'), 'utf-8');
const CREDIT_CARD_SRC = readFileSync(srcPath('src/components/credit/AddCreditCardModal.tsx'), 'utf-8');
const GOAL_SRC = readFileSync(srcPath('src/components/goals/AddGoalModal.tsx'), 'utf-8');

console.log('=== 1. Bill (AddRecurringItemModal.tsx) — embedded wiring (Class C) ===');
{
  assert('1a. forwardRef with AddRecurringItemModalHandle = EmbeddedStepHandle', /export type AddRecurringItemModalHandle = EmbeddedStepHandle;/.test(BILL_SRC) && /export const AddRecurringItemModal = forwardRef</.test(BILL_SRC));
  assert('1b. onRequestLoan (embedded handoff) is distinct from onSelectLoan (standalone) — both present', /onSelectLoan\?: \(type: LiabilityType\) => void;/.test(BILL_SRC) && /onRequestLoan\?: \(type: LiabilityType\) => void;/.test(BILL_SRC));
  assert('1c. chooseBillType branches embedded (onRequestLoan, synchronous) vs standalone (the original defer/timer dance, byte-unchanged)', /if \(embedded\) \{\s*\n\s*onRequestLoan\?\.\(p\.handoffLoanType\);\s*\n\s*return;\s*\n\s*\}/.test(BILL_SRC));
  assert('1d. handleRequestClose never discards on \'back\', confirms on every other reason', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*confirmDiscardIfDirty\(isDirty, \(\) => onConfirmedClose\?\.\(reason\), 'Discard this bill\?', 'Your new bill details will be lost\.'\);/.test(BILL_SRC));
  assert('1e. handleSave success path branches embedded (onSaveSuccess) vs standalone (onClose), never a discard prompt on success', /if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/.test(BILL_SRC));
  assert('1f. the single remaining render step returns bare content when embedded, before falling through to the unchanged standalone KeyboardSheet wrap', (BILL_SRC.match(/if \(embedded\) return content;/g) || []).length === 1);
  assert('1f-i. no category render branch survives (Design 5.1 Wave 4 — the bill-type choice is in-form)', !/categoryContent/.test(BILL_SRC));
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
  // SUPERSEDED by Design 5.1 Wave 4: the 'category' step is removed (its
  // choice is embedded in the form). 'midCycle' is NOT a chooser and is
  // deliberately preserved, so the invariant that still matters — every
  // remaining internal step stays inside this ONE embedded route and is
  // never exposed to the host as a separate route — is asserted below.
  assert(
    "2d. onTitleChange reports a distinct title per remaining internal step (midCycle/details), both still inside this one embedded route",
    /onTitleChange\?\.\(formStep === 'midCycle' \? 'One more thing' : isEditing \? 'Edit income source' : 'Add income source'\);/.test(INCOME_SRC)
  );
  assert("2d-i. no 'category' step survives in the CODE (comments explaining its removal are expected)", (() => {
    const code = INCOME_SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return !/'category'/.test(code);
  })());
  assert(
    "2d-ii. the income source is now chosen in-form, and the removed page's helper copy is preserved",
    /<InlineSelect\n\s+label="Where does this income come from\?"/.test(INCOME_SRC) &&
      /Tell \{brand\.name\} where your income comes from\./.test(INCOME_SRC)
  );
  assert('2e. handleRequestClose never discards on \'back\'', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}/.test(INCOME_SRC));
  assert(
    '2f. all three mid-cycle option handlers (chooseMidCycleNoOccurrence/AlreadyIncluded/AddToBalance) branch embedded (onSaveSuccess) vs standalone (onClose) on their own successful-completion path — not just the ordinary handleSave',
    (INCOME_SRC.match(/if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/g) || []).length === 4
  );
  assert('2g. both remaining render steps (midCycle, details) return bare content when embedded', (INCOME_SRC.match(/if \(embedded\) return (midCycleContent|content);/g) || []).length === 2);
  assert('2g-i. no category render branch survives', !/categoryContent/.test(INCOME_SRC));
}

console.log('\n=== 3. Expense / Income received (QuickAddModal.tsx) — embedded wiring shared by both routes (Class C) ===');
{
  assert('3a. forwardRef with QuickAddModalHandle = EmbeddedStepHandle', /export type QuickAddModalHandle = EmbeddedStepHandle;/.test(QUICK_ADD_SRC) && /export const QuickAddModal = forwardRef</.test(QUICK_ADD_SRC));
  // SUPERSEDED by Design 5.1 Wave 4 (owner-authorised single-workspace Add
  // consolidation): the preliminary "What's this for?" page is removed, so
  // there is no longer a step to gate on. The GUARANTEE the old assertion
  // protected — that the host's embedded footer can never offer Save before
  // a category exists — is unchanged and is now asserted directly against
  // `canSave`'s own `!!categoryId` term, which was already there and was
  // NOT weakened to accommodate the removal.
  assert('3b. onCanSaveChange reports canSave directly (no step gate remains)', /onCanSaveChange\?\.\(canSave\);/.test(QUICK_ADD_SRC) && !/formStep/.test(QUICK_ADD_SRC));
  assert('3b-i. canSave still requires a chosen category, so Save is unreachable without one', /const canSave =[\s\S]*?!!categoryId &&/.test(QUICK_ADD_SRC));
  assert('3b-ii. handleSave still refuses without a categoryId', /if \(!canSave \|\| !categoryId\) return;/.test(QUICK_ADD_SRC));
  assert('3b-iii. the category is chosen in-form, never on a page of its own', /<InlineSelect\s+label="Category"/.test(QUICK_ADD_SRC));
  // RECONCILED (post-Wave-10 B9 closure): the successful-Save path now
  // also routes through the canonical confirmSaveSuccess boundary (and the
  // wealth form reports its ACTUAL saved type), so the pinned shape gained
  // that call — the close/branch contract itself is unchanged.
  assert('3c. handleSave success path branches embedded vs standalone', /if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else \{\s*\n\s*confirmSaveSuccess\([\s\S]{0,240}?onClose\(\);\s*\n\s*\}/.test(QUICK_ADD_SRC));
  assert('3d. handleRequestClose never discards on \'back\'', /function handleRequestClose\(reason: EmbeddedCloseReason\) \{\s*\n\s*if \(reason === 'back'\) \{\s*\n\s*onConfirmedClose\?\.\(reason\);\s*\n\s*return;\s*\n\s*\}/.test(QUICK_ADD_SRC));
  // SUPERSEDED for the same reason: with the category page removed there is
  // one fewer render branch to check. The invariant that MATTERS — an
  // embedded body returns bare content and never wraps itself in its own
  // KeyboardSheet — is asserted for every branch that remains.
  assert('3e. every embedded render branch returns bare content', (() => {
    const bare = (QUICK_ADD_SRC.match(/if \(embedded\) return \w+;/g) || []).length;
    // Real JSX openings only — the file also mentions `<KeyboardSheet
    // isDirty={isDirty}>` inside a doc comment, which is not a render.
    const sheets = (QUICK_ADD_SRC.match(/<KeyboardSheet\n/g) || []).length;
    // Two remaining branches: the BNPL-locked view and the normal form.
    return bare === 2 && sheets === 2;
  })());
  assert('3e-i. no category render branch survives', !/categoryContent/.test(QUICK_ADD_SRC));
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
