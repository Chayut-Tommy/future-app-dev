// Move Money atomic transfer — wiring guard only.
//
// transferFunds (AppStateContext.tsx) is NOT a standalone exported
// function like upsertLinkedRecurringItem/updateLinkedRepaymentOnlyTransition
// are — its logic lives inline inside a useCallback closure bound to the
// AppStateContext provider component's own `data`/`persist`. Confirmed by
// reading its body directly. Invoking it for real would require mounting
// the actual React provider (a React renderer this repo does not have
// installed; installing one is a dependency decision outside this pass's
// authority).
//
// Per instruction, this file does NOT contain a copied/reimplemented
// version of transferFunds' arithmetic — that would misrepresent a copy
// as proof of the shipped function. It only confirms, by direct source
// match, that the exact three-line debit/credit/floor logic described in
// the checkpoint report is still present, unchanged, in the real file —
// a wiring guard, not behavioural proof.
//
// THE ACTUAL RUNTIME EVIDENCE for the required financial regression
// scenario (source $1,000.00, destination $500.00, transfer $10.01 ->
// source $989.99 / destination $510.01 / combined $1,500.00 / net wealth
// unchanged; Back/Cancel/dismissal-without-confirmation leaves both
// balances untouched; rapid repeated confirmation applies exactly once)
// is the physical-device acceptance already obtained for the Move Money
// journey across Rounds 4-7 of this session, not this file. See the
// checkpoint report for exactly what was and was not device-verified.
//
// Run with: npx tsx tests/transfer-funds-wiring.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const APP_STATE_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/state/AppStateContext.tsx', 'utf-8');

console.log('=== transferFunds — structural wiring guard only (not behavioural proof) ===');
{
  assert(
    'the source asset is debited by exactly `amount`, unconditionally',
    /assets = data\.assets\.map\(\(a\) => \(a\.id === fromAssetId \? \{ \.\.\.a, currentValue: a\.currentValue - amount \} : a\)\);/.test(APP_STATE_SRC)
  );
  assert(
    'an asset destination is credited by exactly `amount`, unconditionally (mirrors the debit, so a transfer between two assets is a zero-sum move — combined value is preserved)',
    /assets = assets\.map\(\(a\) => \(a\.id === to\.assetId \? \{ \.\.\.a, currentValue: a\.currentValue \+ amount \} : a\)\);/.test(APP_STATE_SRC)
  );
  assert(
    'a liability destination is reduced by exactly `amount`, floored at 0 via Math.max(0, ...) — a paydown can never drive a liability negative',
    /l\.id === to\.liabilityId \? \{ \.\.\.l, currentBalance: Math\.max\(0, l\.currentBalance - amount\) \} : l/.test(APP_STATE_SRC)
  );
  assert(
    'the combined mutation is persisted as one atomic write (single persist() call, not two separate writes that could partially apply)',
    /persist\(upsertNetWorthHistory\(\{ \.\.\.data, assets, liabilities \}\)\);\s*\n\s*\},\s*\n\s*\[data, persist\]\s*\n\s*\);/.test(APP_STATE_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
