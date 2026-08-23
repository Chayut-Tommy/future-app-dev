// Nolie Design 5.1 Wave 4 — the single-workspace Add consolidation.
//
// CLASSIFICATION (per tests/README.md):
// - Class C (structural): every assertion reads the real form sources. They
//   prove that the preliminary chooser pages are GONE, that each removed
//   page's choice is embedded in the form that needed it, and — the part
//   that actually matters — that nothing financial was traded away to get
//   there.
// - NOT proven here: how the consolidated forms feel on a device. That is
//   the Wave 4 device script.
//
// The four removed pages:
//   QuickAddModal            "What's this for?"
//   AddRecurringItemModal    "What's this bill for?"
//   AddIncomeModal           the income-source page
//   AddWealthItemModal       "What are you adding?"
//
// Run with: npx tsx tests/design5-add-journey-consolidation.test.ts

import * as fs from 'fs';
import * as path from 'path';

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
const BILL = read('components/money/AddRecurringItemModal.tsx');
const INCOME = read('components/income/AddIncomeModal.tsx');
const WEALTH = read('components/wealth/AddWealthItemModal.tsx');
const CREDIT = read('components/credit/AddCreditCardModal.tsx');
const GOAL = read('components/goals/AddGoalModal.tsx');
const TRANSFER = read('components/wealth/TransferForm.tsx');
const ALL_SEVEN: [string, string][] = [
  ['QuickAddModal', QUICK_ADD],
  ['AddRecurringItemModal', BILL],
  ['AddIncomeModal', INCOME],
  ['AddWealthItemModal', WEALTH],
  ['AddCreditCardModal', CREDIT],
  ['AddGoalModal', GOAL],
  ['TransferForm', TRANSFER],
];

console.log('=== 1. Every preliminary chooser PAGE is gone ===');
{
  assert('1a. no form still asks "What\'s this for?" as a page title', !/title="What's this for\?"/.test(QUICK_ADD));
  assert('1b. no form still asks "What\'s this bill for?" as a page title', !/title="📅 What's this bill for\?"/.test(BILL));
  assert('1c. no form still opens on "What are you adding?"', !/title="💎 What are you adding\?"/.test(WEALTH));
  assert('1d. QuickAddModal has no step machine left at all', !/formStep/.test(stripComments(QUICK_ADD)));
  assert('1e. AddRecurringItemModal has no step machine left at all', !/formStep/.test(stripComments(BILL)));
  assert('1f. AddWealthItemModal has no step machine left at all', !/formStep/.test(stripComments(WEALTH)));
  assert("1g. AddIncomeModal's step machine survives ONLY for 'midCycle', which is a real follow-up question about a payment that already happened — not a chooser", /useState<'details' \| 'midCycle'>\('details'\)/.test(INCOME) && !/'category'/.test(stripComments(INCOME)));
}

console.log('\n=== 2. Each removed page\'s choice is embedded in the form that needed it ===');
{
  assert('2a. transaction category — in-form, over the same data.categories filtered by type', /<InlineSelect\n\s+label="Category"/.test(QUICK_ADD) && /const categories = data\.categories\.filter\(\(c\) => c\.type === type\);/.test(QUICK_ADD));
  assert('2b. transaction type (expense/income) — an in-form segmented control, not a page', /<Segmented\n\s+accessibilityLabel="Transaction type"/.test(QUICK_ADD));
  assert('2c. switching type still clears the category, because the two lists are disjoint', /setType\(next\);\s*\n\s*setCategoryId\(null\);/.test(QUICK_ADD));
  assert('2d. bill type — in-form, over the same full BILL_PRESETS list', /<InlineSelect\n\s+label="What's this bill for\?"/.test(BILL) && /const billTypeOptions = BILL_PRESETS\.map\(/.test(BILL));
  assert('2e. income source — in-form, over the same INCOME_SOURCE_IDS list, with the page\'s helper copy preserved', /<InlineSelect\n\s+label="Where does this income come from\?"/.test(INCOME) && /INCOME_SOURCE_IDS\.map\(/.test(INCOME) && /Tell \{brand\.name\} where your income comes from\./.test(INCOME));
  assert('2f. asset type — in-form, over the same ASSET_CARD_GROUPS list including its descriptions', /<InlineSelect\n\s+label="What are you adding\?"/.test(WEALTH) && /ASSET_CARD_GROUPS\)\.map\(/.test(WEALTH) && /supporting: g\.description/.test(WEALTH));
}

console.log('\n=== 3. NOTHING financial was traded away for the consolidation ===');
{
  // The single most important section. Every one of these guards existed
  // before Wave 4 and must be byte-for-byte intact after it.
  assert('3a. a transaction still cannot be saved without a category', /!!categoryId &&/.test(QUICK_ADD) && /if \(!canSave \|\| !categoryId\) return;/.test(QUICK_ADD));
  assert('3b. the bill validator is unchanged — name, a valid parsed amount, and a real due day or date', /const canSave =\s*\n\s*label\.trim\(\)\.length > 0 &&\s*\n\s*parsedAmount\.valid &&\s*\n\s*\(usesDayOfMonth \? dayValue >= 1 && dayValue <= 31 : !!nextDueDate\);/.test(BILL));
  assert('3c. the income validator is unchanged — name, a valid parsed amount, and a real next date unless the income is irregular or unknown', /const canSave = label\.trim\(\)\.length > 0 && parsedIncome\.valid && \(isIrregular \|\| unknownDate \|\| !!nextDueDate\);/.test(INCOME));
  assert("3d. income Save is still unreachable from the mid-cycle step — the guard that stops a stray tap minting an unused midCycleRecurringItemId", /onCanSaveChange\?\.\(canSave && formStep === 'details'\);/.test(INCOME) && /if \(!canSave \|\| !parsedIncome\.valid \|\| formStep !== 'details'\) return;/.test(INCOME));
  assert('3e. the money grammar is still the shared one — no form parses money itself', ALL_SEVEN.every(([, src]) => !/parseFloat\(amount\.replace|Number\(amount\)/.test(stripComments(src))));
  assert('3f. onlyLiquidCategories still restricts what can be created, now on the in-form selector', /const restrictToLiquid = isLiquidPresetJourney \|\| !!onlyLiquidCategories;/.test(WEALTH));
  assert('3g. choosing an asset type still re-seeds includeInMoney and still clears a stale provider', /function chooseAssetCategory\(type: AssetType\) \{[\s\S]*?setIncludeInMoney\(forcedIncludeInMoneyDefault \?\? resolveIncludeInMoneyCalculations\([\s\S]*?setProvider\(''\);/.test(WEALTH));
  assert("3h. a BNPL repayment transaction is still view-only — no amount/date/source field is reachable for it", /if \(isEditingBnplRepayment && editTransaction\) \{/.test(QUICK_ADD));
  assert('3i. a transfer still cannot be sourced from anything but the one From control', (TRANSFER.match(/sourceAssets\.map\(/g) || []).length === 1);
  assert('3j. BNPL repayment is still gated on a source that supports it', /if \(!fromAsset \|\| !fromSupportsRepayment\) return;/.test(TRANSFER));
}

console.log('\n=== 4. Genuine nested linked-object steps are PRESERVED — they are not chooser pages ===');
{
  assert('4a. Bill -> loan handoff survives, still reached through chooseBillType', /if \(p\.handoffLoanType\) \{/.test(BILL) && /if \(preset\) chooseBillType\(preset\);/.test(BILL));
  assert('4b. and it still defers across the native dismissal rather than firing in the same tick', /onSelectLoan/.test(BILL) && /LOAN_HANDOFF_DEFER_MS/.test(BILL));
  assert('4c. Liability -> credit card handoff survives, with its own race guard', /if \(ccHandoffInProgressRef\.current\) return;/.test(WEALTH) && /CREDIT_CARD_HANDOFF_DEFER_MS/.test(WEALTH));
  assert('4d. the "select an existing liability or create a new one" step survives — it chooses an OBJECT, not an attribute', /if \(kind === 'liability' && showLiabilitySelector\) \{/.test(WEALTH));
  assert('4e. income mid-cycle survives with all three of its own completion paths', /chooseMidCycleNoOccurrence|midCyclePayload/.test(INCOME) && (INCOME.match(/if \(embedded\) onSaveSuccess\?\.\(\);\s*\n\s*else onClose\(\);/g) || []).length === 4);
}

console.log('\n=== 5. The body-vs-container contract holds: a body never owns its own chrome when embedded ===');
{
  for (const [name, src] of ALL_SEVEN) {
    // Two valid shapes, and every form must be one of them: either it
    // branches to bare content when embedded, or it renders no chrome at
    // all and is always a body (TransferForm). What is NOT allowed is a
    // body that wraps itself in its own KeyboardSheet while embedded.
    const bare = (src.match(/if \(embedded\) \{?\s*\n?\s*return \w+;/g) || []).length;
    const alwaysABody = !/<KeyboardSheet/.test(src);
    assert(`5a. ${name}: never owns its own chrome when embedded`, bare >= 1 || alwaysABody);
  }
  assert('5b. TransferForm is a pure body — it renders no KeyboardSheet of its own at all', !/<KeyboardSheet/.test(TRANSFER));
}

console.log('\n=== 6. The forms now share the field system instead of hand-rolling inputs ===');
{
  // A form still holding its own bare TextInput means a field escaped the
  // migration, and with it the reserved error row and the 44pt target.
  for (const [name, src] of ALL_SEVEN) {
    assert(`6a. ${name}: no bare <TextInput> survives`, !/<TextInput\b/.test(stripComments(src)));
  }
  assert('6b. all seven forms take their money through CurrencyField', ALL_SEVEN.filter(([, s]) => /CurrencyField/.test(s)).length === 7);
  // RECONCILED — Wave 9a closure, Correction C.
  // OLD CLAUSE: matched the literal label `Interest rate / APR % (optional)`.
  // SUPERSEDED BECAUSE that field was renamed to `Purchase interest rate
  // p.a. % (optional)` — inspection confirmed the stored `CreditCard.apr`
  // feeds only the purchase-balance illustration, so the old name implied a
  // wider contract than it models. PRESERVED INTENT: the rate must still be
  // a TextField, never a CurrencyField — a percentage must never be run
  // through the money grammar. That is now asserted directly rather than
  // via a copy string that compliance work is expected to change.
  assert('6c. APR is deliberately NOT a CurrencyField — a percentage must never be run through the money grammar', /<TextField\n\s+label=\{PURCHASE_RATE_FIELD\.label\}/.test(CREDIT));
  assert('6c-i. and the rate field is not wrapped in CurrencyField', !/CurrencyField[^\n]*PURCHASE_RATE_FIELD/.test(CREDIT));
  // Wave 4 closure — the goal form's fields moved into the shared
  // GoalFormFields, so its adapter now passes the message down as
  // `amountMessage` rather than straight onto CurrencyField. The guarantee
  // is unchanged: the CALLER's wording wins, and the field never derives its
  // own. Asserted at both ends for the goal case.
  assert('6d. a caller-owned validation message always wins over the field\'s own wording', (() => {
    const fields = read('components/goals/GoalFormFields.tsx');
    const goalPassesDown = /amountMessage=\{amountState === 'invalid' \?/.test(GOAL);
    const fieldHonoursIt = /message=\{amountMessage \?\? null\}/.test(fields);
    return /message=\{incomeAmountError \?/.test(INCOME) && /message=\{amountError \?/.test(BILL) && /message=\{saveError\}/.test(TRANSFER) && goalPassesDown && fieldHonoursIt;
  })());
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
