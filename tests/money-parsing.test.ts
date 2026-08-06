// REAL IMPORT — src/lib/calculations/money.ts has zero imports of its own,
// so it loads cleanly under plain `npx tsx` and this test calls the actual
// shipped `parseMoneyInput`, not a copy. This is the strict money grammar
// the Goal Target Amount correction's resolveTargetAmountDraft wraps, and
// that AddRecurringItemModal.tsx already used pre-Stream-D for bill
// amounts (confirmed via `git diff` showing zero changes to that usage).
//
// Run with: npx tsx tests/money-parsing.test.ts

import { parseMoneyInput } from '../src/lib/calculations/money';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

console.log('=== parseMoneyInput — real import, real execution ===');
{
  assert('valid whole number: "1200" -> valid, amount 1200, cents 120000', (() => {
    const r = parseMoneyInput('1200');
    return r.valid && r.amount === 1200 && r.cents === 120000;
  })());
  assert('valid two-decimal: "1200.00" -> same amount as "1200" (equivalent formatting)', (() => {
    const a = parseMoneyInput('1200');
    const b = parseMoneyInput('1200.00');
    return a.valid && b.valid && a.amount === b.amount && a.cents === b.cents;
  })());
  assert('valid two-decimal: "10.01" -> amount 10.01, cents 1001 (the transfer-scenario amount)', (() => {
    const r = parseMoneyInput('10.01');
    return r.valid && r.amount === 10.01 && r.cents === 1001;
  })());
  assert('valid: ".50" (no leading digit) -> amount 0.5', (() => {
    const r = parseMoneyInput('.50');
    return r.valid && r.amount === 0.5;
  })());
  assert('invalid: "0" (cents <= 0 rejected)', parseMoneyInput('0').valid === false);
  assert('invalid: "0.00"', parseMoneyInput('0.00').valid === false);
  assert('invalid: "-100" (no sign in the grammar)', parseMoneyInput('-100').valid === false);
  assert('invalid: "1200.123" (more than two decimals, never silently truncated)', parseMoneyInput('1200.123').valid === false);
  assert('invalid: "1200abc" (malformed/trailing garbage)', parseMoneyInput('1200abc').valid === false);
  assert('invalid: "1,200" (comma-formatted paste, no permissive parseFloat prefix-matching)', parseMoneyInput('1,200').valid === false);
  assert('invalid: "1.2.3" (multiple decimal points)', parseMoneyInput('1.2.3').valid === false);
  assert('invalid: "" (empty)', parseMoneyInput('').valid === false);
  assert('invalid: "   " (whitespace only)', parseMoneyInput('   ').valid === false);
  assert('valid with surrounding whitespace: " 500 " trims correctly', (() => {
    const r = parseMoneyInput(' 500 ');
    return r.valid && r.amount === 500;
  })());
  assert('large but safe value: "999999.99" is valid', parseMoneyInput('999999.99').valid === true);
  assert('absurdly large value overflowing safe-integer cents is rejected, not silently accepted', (() => {
    const r = parseMoneyInput('99999999999999');
    return r.valid === false;
  })());
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
