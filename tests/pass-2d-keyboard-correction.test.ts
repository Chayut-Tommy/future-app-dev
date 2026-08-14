// Pass 2D — final focused device-test correction: mortgage-repayment
// keyboard, sheet-dismissal and interaction-integrity fix.
//
// Root cause (confirmed via direct component-tree inspection, not inferred
// from the recording alone): LoanRepaymentSheet.tsx and
// CreditCardRepaymentSheet.tsx never used the already-correct, established
// KeyboardSheet shared primitive — each was a bespoke raw Modal + plain View
// with no KeyboardAvoidingView, no ScrollView, no PanResponder swipe
// handling, no header Close control, and no keyboard "Done" mechanism. This
// was an ISOLATED two-component defect, not a shared-abstraction defect —
// KeyboardSheet.tsx itself needed only one small additive prop (headerRight)
// to support a persistently visible Close button.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): confirmLoanRepaymentTransition,
//   reverseLoanRepaymentTransaction, confirmCreditCardRepaymentTransition
//   (src/state/AppStateContext.tsx) — proves the exact $950-Cash /
//   $1,258-payment device-recording scenario is rejected with zero mutation,
//   that a sufficiently funded Everyday account then succeeds exactly once,
//   and that rapid re-confirmation cannot duplicate a payment.
// - Structural (regex/string match against source text): LoanRepaymentSheet.tsx,
//   CreditCardRepaymentSheet.tsx, and KeyboardSheet.tsx are React Native TSX,
//   not real-importable without a rendered-component test harness (none
//   exists in this repo — see the explicit device-test-only limitation
//   note at the bottom of this file). These structural checks prove the
//   REQUIRED CODE SHAPE exists (KeyboardSheet usage, header Close button,
//   InputAccessoryView Done bar, isDirty wiring, factual error copy) but
//   cannot themselves prove native keyboard/gesture behaviour.
//
// Run with: npx tsx tests/pass-2d-keyboard-correction.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import {
  confirmLoanRepaymentTransition,
  reverseLoanRepaymentTransaction,
  confirmCreditCardRepaymentTransition,
  ConfirmLoanRepaymentInput,
  ConfirmCreditCardRepaymentInput,
} from '../src/state/AppStateContext';
import type { AppData } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function dISO(iso: string): string {
  return d(iso).toISOString();
}

function baseData(): AppData {
  return createEmptyAppData();
}

console.log('=== SECTION 1: exact device-recording scenario (Cash $950 / Everyday $1,950 & $2,560 / payment $1,258) ===');
{
  // Reproduces the user's exact recorded balances: Cash $950; two Everyday
  // accounts at $1,950 and $2,560; entered payment $1,258.
  let data = baseData();
  data = {
    ...data,
    assets: [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 950 },
      { id: 'ed1', type: 'everyday', label: 'Everyday 1', currentValue: 1950, includeInMoneyCalculations: true },
      { id: 'ed2', type: 'everyday', label: 'Everyday 2', currentValue: 2560, includeInMoneyCalculations: true },
    ],
    liabilities: [{ id: 'mortgage1', type: 'mortgage', label: 'Mortgage', currentBalance: 400000 }],
    recurringItems: [
      {
        id: 'mr1',
        type: 'expense',
        label: 'Mortgage repayment',
        amount: 1258,
        frequency: 'monthly',
        nextDueDate: dISO('2026-08-13'),
        isFixed: true,
        active: true,
        linkedLiabilityId: 'mortgage1',
      },
    ],
  };
  const before = JSON.stringify(data);

  // 1a. Selecting Cash ($950) and entering $1,258 is rejected atomically —
  // no transaction, no balance change, no Reminder occurrence completed.
  const cashInput: ConfirmLoanRepaymentInput = {
    recurringItemId: 'mr1',
    liabilityId: 'mortgage1',
    expectedNextDueDate: dISO('2026-08-13'),
    amount: 1258,
    paymentSource: 'cash',
    updateBalance: false,
    expectedCurrentBalance: 400000,
    transactionId: 'attempt-cash',
    date: dISO('2026-08-13'),
  };
  const cashResult = confirmLoanRepaymentTransition(data, cashInput);
  assert('1a. $1,258 from $950 Cash is rejected', cashResult.applied === false);
  assert(
    "1a-i. rejection reason is 'insufficient_source_balance'",
    !cashResult.applied && cashResult.reason === 'insufficient_source_balance'
  );
  assert('1a-ii. nothing in AppData changed (no transaction, no balance mutation, no Reminder completion)', JSON.stringify(data) === before);

  // 1b. The customer can then choose the $1,950 Everyday account and record
  // exactly $1,258 successfully — proving the escape from the validation
  // error leads to a genuine, working alternate path (not just a dead end).
  const everydayInput: ConfirmLoanRepaymentInput = {
    ...cashInput,
    paymentSource: 'everyday',
    targetAssetId: 'ed1',
    transactionId: 'attempt-everyday',
  };
  const everydayResult = confirmLoanRepaymentTransition(data, everydayInput);
  assert('1b. the same $1,258 payment from the $1,950 Everyday account succeeds', everydayResult.applied);
  if (everydayResult.applied) {
    const ed1After = everydayResult.data.assets.find((a) => a.id === 'ed1')!;
    assert('1b-i. the Everyday account is reduced by exactly $1,258', ed1After.currentValue === 1950 - 1258);
    const cashAfter = everydayResult.data.assets.find((a) => a.id === 'cash1')!;
    assert('1b-ii. Cash is untouched', cashAfter.currentValue === 950);
    const txn = everydayResult.data.transactions.find((t) => t.id === 'attempt-everyday');
    assert('1b-iii. exactly one transaction was created for this payment', !!txn && txn.amount === 1258);
    const item = everydayResult.data.recurringItems.find((r) => r.id === 'mr1')!;
    assert('1b-iv. the originating Reminder occurrence advanced past 2026-08-13', item.nextDueDate !== dISO('2026-08-13'));

    // 1c. Rapid re-confirmation (double-tap) with the same originally
    // captured input cannot create a duplicate payment — the occurrence has
    // already advanced, so the second call's expectedNextDueDate is stale.
    const duplicateAttempt = confirmLoanRepaymentTransition(everydayResult.data, { ...everydayInput, transactionId: 'attempt-everyday-2' });
    assert(
      '1c. a rapid second confirmation with the same (now-stale) occurrence is rejected, never creating a duplicate payment',
      duplicateAttempt.applied === false && (!duplicateAttempt.applied ? duplicateAttempt.reason === 'stale' : true)
    );
    const duplicateTxn = duplicateAttempt.applied ? null : everydayResult.data.transactions.filter((t) => t.recurringItemId === 'mr1');
    assert('1c-i. exactly one mortgage-repayment transaction exists after the duplicate attempt', duplicateTxn !== null && duplicateTxn.length === 1);

    // 1d. Reversing the successful payment restores the Everyday balance and
    // the Reminder occurrence, matching accepted reversal behaviour — the
    // interaction-integrity fix must not have disturbed this.
    const reversed = reverseLoanRepaymentTransaction(everydayResult.data, 'attempt-everyday');
    assert('1d. reversal of the successful payment applies', reversed.applied);
    if (reversed.applied) {
      const ed1Restored = reversed.data.assets.find((a) => a.id === 'ed1')!;
      assert('1d-i. reversal restores the Everyday balance to $1,950', ed1Restored.currentValue === 1950);
      const itemRestored = reversed.data.recurringItems.find((r) => r.id === 'mr1')!;
      assert('1d-ii. reversal restores the Reminder occurrence to 2026-08-13', itemRestored.nextDueDate === dISO('2026-08-13'));
    }
  }

  // 1e. The second Everyday account ($2,560) is an equally valid alternate
  // source — proves the fix isn't narrowly tied to one specific account.
  const secondEverydayInput: ConfirmLoanRepaymentInput = {
    ...cashInput,
    paymentSource: 'everyday',
    targetAssetId: 'ed2',
    transactionId: 'attempt-everyday-ed2',
  };
  const secondEverydayResult = confirmLoanRepaymentTransition(data, secondEverydayInput);
  assert('1e. the same $1,258 payment from the $2,560 Everyday account also succeeds', secondEverydayResult.applied);
  if (secondEverydayResult.applied) {
    const ed2After = secondEverydayResult.data.assets.find((a) => a.id === 'ed2')!;
    assert('1e-i. the second Everyday account is reduced by exactly $1,258', ed2After.currentValue === 2560 - 1258);
  }

  // 1f. Exact-cent boundary — $950.00 is accepted from a $950.00 balance
  // (proves the validation is a strict "greater than", not an
  // over-conservative rejection of the exact recorded amount).
  const exactCentInput: ConfirmLoanRepaymentInput = { ...cashInput, amount: 950, transactionId: 'attempt-exact' };
  const exactCentResult = confirmLoanRepaymentTransition(data, exactCentInput);
  assert('1f. a payment exactly equal to the recorded Cash balance ($950.00) is accepted', exactCentResult.applied);

  // 1g. One cent over the exact balance is still rejected — proves the
  // validation is exact-cent, not floating-point-loose.
  const oneCentOverInput: ConfirmLoanRepaymentInput = { ...cashInput, amount: 950.01, transactionId: 'attempt-over' };
  const oneCentOverResult = confirmLoanRepaymentTransition(data, oneCentOverInput);
  assert(
    '1g. $950.01 from a $950.00 Cash balance is still rejected (exact-cent validation, not floating-point-loose)',
    oneCentOverResult.applied === false && (!oneCentOverResult.applied ? oneCentOverResult.reason === 'insufficient_source_balance' : true)
  );
}

console.log('=== SECTION 2: credit-card repayment sibling — same insufficient-balance contract ===');
{
  // CreditCardRepaymentSheet.tsx received the identical KeyboardSheet-based
  // fix and the identical factual insufficient-balance wording correction.
  // confirmCreditCardRepaymentTransition's own validation logic was NOT
  // touched this round (only the sheet's presentation/interaction shell
  // changed) — this proves that pre-existing, accepted behaviour still
  // holds unchanged.
  let data = baseData();
  data = {
    ...data,
    assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 950 }],
    creditCards: [{ id: 'card1', issuer: 'Test', label: 'Test Card', creditLimit: 5000, currentBalance: 1258, dueDay: 15, minimumPayment: 25 }],
  };
  const before = JSON.stringify(data);
  const cardInput: ConfirmCreditCardRepaymentInput = {
    creditCardId: 'card1',
    amount: 1258,
    paymentSource: 'cash',
    expectedCardBalance: 1258,
    transactionId: 'card-attempt',
    date: dISO('2026-08-13'),
  } as ConfirmCreditCardRepaymentInput;
  const result = confirmCreditCardRepaymentTransition(data, cardInput);
  assert('2a. $1,258 from $950 Cash is rejected for a credit-card repayment too', result.applied === false);
  assert("2a-i. rejection reason is 'insufficient_source_balance'", !result.applied && result.reason === 'insufficient_source_balance');
  assert('2a-ii. nothing in AppData changed', JSON.stringify(data) === before);
}

console.log('=== SECTION 3: structural proof of the interaction-integrity fix (component shape) ===');
// ORIGINAL PROTECTION (this section, prior round): LoanRepaymentSheet.tsx/
// CreditCardRepaymentSheet.tsx each owned their own KeyboardSheet-driven
// native Modal; these assertions read those two files directly to prove the
// keyboard/header-Close/isDirty/footer contract on THAT Modal.
// WHY STALE: the final Pass 2D device-test correction (native-Modal-
// lifecycle round) deleted both files entirely. Their state/validation
// logic moved verbatim into useLoanRepaymentForm.ts/
// useCreditCardRepaymentForm.ts; their scrollable JSX body moved verbatim
// into LoanRepaymentFormFields.tsx/CreditCardRepaymentFormFields.tsx — pure
// content components that own no Modal/KeyboardSheet of their own. The ONE
// KeyboardSheet for the entire Reminder/loan/card lifecycle is now owned
// exclusively by ReminderDetailSheet.tsx, which builds the
// title/headerRight/footer/isDirty/gesturesEnabled contract itself, per
// lifecycle state (see this round's final report §2-§4).
// REPLACEMENT: every check below is re-pointed at the file that now
// actually owns the property being verified — never re-asserted against a
// deleted file's source text.
{
  const reminderSheetSrc = fs.readFileSync(path.join(__dirname, '../src/components/today/ReminderDetailSheet.tsx'), 'utf8');
  const loanFieldsSrc = fs.readFileSync(path.join(__dirname, '../src/components/credit/LoanRepaymentFormFields.tsx'), 'utf8');
  const cardFieldsSrc = fs.readFileSync(path.join(__dirname, '../src/components/credit/CreditCardRepaymentFormFields.tsx'), 'utf8');
  const loanHookSrc = fs.readFileSync(path.join(__dirname, '../src/hooks/useLoanRepaymentForm.ts'), 'utf8');
  const cardHookSrc = fs.readFileSync(path.join(__dirname, '../src/hooks/useCreditCardRepaymentForm.ts'), 'utf8');
  const keyboardSheetSrc = fs.readFileSync(path.join(__dirname, '../src/components/shared/KeyboardSheet.tsx'), 'utf8');

  // 3a. There is now exactly ONE <KeyboardSheet> for the whole Reminder/
  // loan/card lifecycle, owned by ReminderDetailSheet.tsx — never a second
  // one in either form-fields component (the structural elimination of the
  // stacked-native-Modal risk this round's report addresses).
  assert('3a. ReminderDetailSheet.tsx renders the single owning <KeyboardSheet', /<KeyboardSheet\b/.test(reminderSheetSrc));
  assert('3a-i. LoanRepaymentFormFields.tsx renders no Modal/KeyboardSheet of its own', !/<KeyboardSheet\b/.test(loanFieldsSrc) && !/<Modal\b/.test(loanFieldsSrc));
  assert('3a-ii. CreditCardRepaymentFormFields.tsx renders no Modal/KeyboardSheet of its own', !/<KeyboardSheet\b/.test(cardFieldsSrc) && !/<Modal\b/.test(cardFieldsSrc));

  // 3b. ReminderDetailSheet.tsx supplies a permanently reachable header
  // Close button (min 44x44pt, accessibilityRole="button", explicit label)
  // for BOTH the loan_form and card_form lifecycle states, via headerRight
  // — rendered outside the scrollable content, so it never scrolls away.
  assert(
    '3b. ReminderDetailSheet.tsx passes a headerRight Close button with accessibilityLabel "Close record payment" for loan_form/card_form',
    (reminderSheetSrc.match(/accessibilityLabel="Close record payment"/g) ?? []).length === 2 &&
      (reminderSheetSrc.match(/accessibilityRole="button"/g) ?? []).length >= 2
  );
  assert(
    '3b-i. the header Close button meets the 44x44pt minimum touch target',
    /headerCloseButton:\s*\{[^}]*minWidth:\s*44[^}]*minHeight:\s*44/.test(reminderSheetSrc) ||
      /headerCloseButton:\s*\{[^}]*minHeight:\s*44[^}]*minWidth:\s*44/.test(reminderSheetSrc)
  );

  // 3c. Both form-fields components still provide an iOS InputAccessoryView
  // "Done" bar, shared across every TextInput via a single, distinct
  // nativeID — unchanged from the deleted sheets, relocated verbatim.
  assert('3c. LoanRepaymentFormFields.tsx defines its own distinct DONE_ACCESSORY_ID', /DONE_ACCESSORY_ID\s*=\s*'loanRepaymentDoneAccessory'/.test(loanFieldsSrc));
  assert('3c-i. CreditCardRepaymentFormFields.tsx defines its own distinct DONE_ACCESSORY_ID', /DONE_ACCESSORY_ID\s*=\s*'creditCardRepaymentDoneAccessory'/.test(cardFieldsSrc));
  assert(
    '3c-ii. the two components use DIFFERENT nativeIDs (no collision — both can be mounted, one at a time, inside the same owning Modal)',
    /'loanRepaymentDoneAccessory'/.test(loanFieldsSrc) && /'creditCardRepaymentDoneAccessory'/.test(cardFieldsSrc)
  );
  assert('3c-iii. LoanRepaymentFormFields.tsx renders <InputAccessoryView nativeID={DONE_ACCESSORY_ID}>', /<InputAccessoryView nativeID=\{DONE_ACCESSORY_ID\}>/.test(loanFieldsSrc));
  assert('3c-iv. CreditCardRepaymentFormFields.tsx renders <InputAccessoryView nativeID={DONE_ACCESSORY_ID}>', /<InputAccessoryView nativeID=\{DONE_ACCESSORY_ID\}>/.test(cardFieldsSrc));
  assert(
    '3c-v. LoanRepaymentFormFields.tsx wires inputAccessoryViewID on its amount TextInput',
    /inputAccessoryViewID=\{Platform\.OS === 'ios' \? DONE_ACCESSORY_ID : undefined\}/.test(loanFieldsSrc)
  );
  assert(
    '3c-vi. CreditCardRepaymentFormFields.tsx wires inputAccessoryViewID on its amount TextInput',
    /inputAccessoryViewID=\{Platform\.OS === 'ios' \? DONE_ACCESSORY_ID : undefined\}/.test(cardFieldsSrc)
  );
  // Keyboard Done only dismisses — it never calls a submit/confirm handler.
  assert(
    '3c-vii. LoanRepaymentFormFields.tsx keyboard Done button calls ONLY Keyboard.dismiss() (never a confirm handler)',
    /onPress=\{\(\) => Keyboard\.dismiss\(\)\}/.test(loanFieldsSrc)
  );
  assert(
    '3c-viii. CreditCardRepaymentFormFields.tsx keyboard Done button calls ONLY Keyboard.dismiss() (never a confirm handler)',
    /onPress=\{\(\) => Keyboard\.dismiss\(\)\}/.test(cardFieldsSrc)
  );

  // 3d. Both hooks compute isDirty and return it; ReminderDetailSheet.tsx
  // reads it (loanForm.isDirty / cardForm.isDirty) and passes it to the one
  // KeyboardSheet — gating swipe/backdrop discard confirmation exactly as
  // before, just relocated to the new single owner.
  assert('3d. useLoanRepaymentForm.ts computes and returns isDirty', /const isDirty =/.test(loanHookSrc) && /\bisDirty,/.test(loanHookSrc));
  assert('3d-i. useCreditCardRepaymentForm.ts computes and returns isDirty', /const isDirty =/.test(cardHookSrc) && /\bisDirty,/.test(cardHookSrc));
  assert(
    '3d-ii. ReminderDetailSheet.tsx reads isDirty from the active form and passes it to KeyboardSheet',
    /isDirty = loanForm\.isDirty/.test(reminderSheetSrc) && /isDirty = cardForm\.isDirty/.test(reminderSheetSrc) && /isDirty=\{isDirty\}/.test(reminderSheetSrc)
  );

  // 3e. ReminderDetailSheet.tsx's header Close button for loan_form/
  // card_form calls the active form's own handleCancel — the same safe
  // close path as the footer's own Cancel button. handleCancel only
  // dispatches a `cancelled` RepaymentResult (never a mutation), so closing
  // via the header can never create a transaction, change a balance, or
  // complete a Reminder occurrence.
  assert(
    '3e. ReminderDetailSheet.tsx header Close button (loan_form) calls loanForm.handleCancel',
    /onPress=\{loanForm\.handleCancel\}[\s\S]{0,300}accessibilityLabel="Close record payment"/.test(reminderSheetSrc)
  );
  assert(
    '3e-i. ReminderDetailSheet.tsx header Close button (card_form) calls cardForm.handleCancel',
    /onPress=\{cardForm\.handleCancel\}[\s\S]{0,300}accessibilityLabel="Close record payment"/.test(reminderSheetSrc)
  );
  assert(
    '3e-ii. useLoanRepaymentForm.ts handleCancel only reports a cancelled result, never touches confirmLoanRepayment',
    /function handleCancel\(\) \{\s*if \(!occurrenceKey\) return;\s*onResult\(\{ kind: 'cancelled', occurrenceKey \}\);\s*\}/.test(loanHookSrc)
  );
  assert(
    '3e-iii. useCreditCardRepaymentForm.ts handleCancel only reports a cancelled result, never touches confirmCreditCardRepayment',
    /function handleCancel\(\) \{\s*if \(!occurrenceKey\) return;\s*onResult\(\{ kind: 'cancelled', occurrenceKey \}\);\s*\}/.test(cardHookSrc)
  );

  // 3f. The insufficient-balance error still re-reads the LIVE balance from
  // data.assets rather than trusting a possibly stale snapshot, and still
  // uses the exact required factual wording template — byte-for-byte
  // unchanged, now inside the two hooks instead of the two deleted sheets.
  assert(
    '3f. useLoanRepaymentForm.ts insufficient-balance copy re-reads the live balance from data.assets',
    /data\.assets\.find\(\(a\) => a\.id === source\.id\)/.test(loanHookSrc)
  );
  assert(
    '3f-i. useLoanRepaymentForm.ts insufficient-balance copy matches the required factual template',
    /The recorded balance for \$\{[^}]+\} is \$\{formatMoney\([^)]*\)\}\. Choose another account or enter \$\{formatMoney\([^)]*\)\} or less\./.test(loanHookSrc)
  );
  assert(
    '3f-ii. useCreditCardRepaymentForm.ts insufficient-balance copy re-reads the live balance from data.assets',
    /data\.assets\.find\(\(a\) => a\.id === source\.id\)/.test(cardHookSrc)
  );
  assert(
    '3f-iii. useCreditCardRepaymentForm.ts insufficient-balance copy matches the required factual template',
    /The recorded balance for \$\{[^}]+\} is \$\{formatMoney\([^)]*\)\}\. Choose another account or enter \$\{formatMoney\([^)]*\)\} or less\./.test(cardHookSrc)
  );

  // 3g. Superseded (twice over) by the final Pass 2D device-test
  // correction. This assertion originally verified `succeeded` was inline
  // content inside ONE Modal per repayment sheet — correct for that
  // round's fix, but that Modal was itself still stacked underneath
  // ReminderDetailSheet's own, which the device recording then proved was
  // still unsafe (see this round's final report §1/§2). The replacement
  // below proves the STRONGER, now-required invariant directly: across the
  // entire Reminder/loan/card lifecycle there is only ONE `<Modal` in the
  // whole call tree (KeyboardSheet's own, owned solely by
  // ReminderDetailSheet.tsx) — `loan_recorded`/`card_recorded` (the
  // former "succeeded" states) render PaymentRecordedContent as plain
  // content inside that SAME Modal, never a second one.
  assert(
    // WHY STALE: Reminder queue correction round's blank-shell fix reads
    // presentedState (not state) for content derivation so the last real
    // content survives the native closing-animation window — same single
    // KeyboardSheet, same plain-content (no second Modal) rendering.
    '3g. ReminderDetailSheet.tsx is the sole Modal owner — loan_recorded/card_recorded render PaymentRecordedContent as plain content, not a second Modal',
    (reminderSheetSrc.match(/<KeyboardSheet\b/g) ?? []).length === 1 &&
      !/<Modal\b/.test(reminderSheetSrc) &&
      /presentedState\.kind === 'loan_recorded' \? <PaymentRecordedContent \/> : null/.test(reminderSheetSrc) &&
      /presentedState\.kind === 'card_recorded' \? <PaymentRecordedContent \/> : null/.test(reminderSheetSrc)
  );
  assert(
    '3g-i. PaymentRecordedContent.tsx itself renders no Modal — a plain confirmation Text node only',
    !/<Modal\b/.test(fs.readFileSync(path.join(__dirname, '../src/components/credit/PaymentRecordedContent.tsx'), 'utf8'))
  );

  // 3h. KeyboardSheet.tsx's own headerRight prop (added for the prior
  // round's keyboard fix) is untouched this round; every one of its other
  // established mechanisms (KeyboardAvoidingView, ScrollView with
  // keyboardShouldPersistTaps "handled", PanResponder swipe-to-dismiss)
  // remains present and untouched.
  assert('3h. KeyboardSheet.tsx declares an optional headerRight prop', /headerRight\?:\s*React\.ReactNode/.test(keyboardSheetSrc));
  assert('3h-i. KeyboardSheet.tsx renders headerRight alongside the title, outside the ScrollView', /<View style=\{styles\.titleRow\}>[\s\S]{0,120}\{headerRight\}/.test(keyboardSheetSrc));
  assert('3h-ii. KeyboardSheet.tsx still wraps its content in KeyboardAvoidingView', /KeyboardAvoidingView/.test(keyboardSheetSrc));
  assert('3h-iii. KeyboardSheet.tsx still uses keyboardShouldPersistTaps="handled" (taps not swallowed while a field is focused)', /keyboardShouldPersistTaps="handled"/.test(keyboardSheetSrc));
  assert('3h-iv. KeyboardSheet.tsx still uses PanResponder for genuine swipe-to-dismiss', /PanResponder/.test(keyboardSheetSrc));

  // 3i. Footer (Cancel / Record payment, and Done for the *_recorded
  // states) is built by ReminderDetailSheet.tsx itself per lifecycle state
  // and rendered outside the scrollable content via KeyboardSheet's own
  // footer prop — reachable even when the keyboard is open and content has
  // scrolled.
  assert(
    '3i. ReminderDetailSheet.tsx builds a Cancel footer button for both loan_form and card_form',
    (reminderSheetSrc.match(/label="Cancel"/g) ?? []).length === 2
  );
  assert(
    '3i-0. loan_form\'s footer button reads "Record payment"; card_form\'s reads "Record payment" or, while below the recorded minimum and not yet acknowledged, "Continue anyway" — never a bare literal that ignores that gate',
    /label="Record payment"/.test(reminderSheetSrc) &&
      /label=\{cardForm\.needsBelowMinimumAck \? 'Continue anyway' : 'Record payment'\}/.test(reminderSheetSrc)
  );
  assert('3i-i. ReminderDetailSheet.tsx builds a Done footer button for loan_recorded/card_recorded', (reminderSheetSrc.match(/label="Done"/g) ?? []).length === 2);
  assert('3i-ii. ReminderDetailSheet.tsx passes its computed footer to the one KeyboardSheet via the footer prop', /footer=\{footer\}/.test(reminderSheetSrc));
}

console.log(`\n${total - failures}/${total} assertions passed.`);
if (failures > 0) {
  console.log(
    '\nNOTE — automation limitation (explicit, per this round\'s own §10 requirement): this repository has no rendered-component or ' +
      'touch/keyboard-simulation test harness (no jest, no @testing-library/react-native, no react-test-renderer). The structural ' +
      'assertions above prove the required CODE SHAPE exists; they cannot themselves prove native iOS keyboard dismissal, swipe-gesture ' +
      'behaviour, VoiceOver reachability, Dynamic Type layout, or app-background/resume state. Those remain mandatory physical-device tests.'
  );
  process.exit(1);
} else {
  console.log(
    "\nAutomation limitation (stated regardless of pass/fail, per this round's own §10 requirement): native iOS keyboard dismissal, " +
      'swipe-to-dismiss while the keyboard is open, VoiceOver reachability, Dynamic Type layout, and app-background/resume behaviour ' +
      'cannot be proven by this harness — those remain mandatory physical-device tests, not covered by any assertion in this file.'
  );
}
