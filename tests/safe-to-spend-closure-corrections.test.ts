// Pass 1 closure — focused corrections, 2026-08-11 (independent review round).
//
// CLASSIFICATION: Real import (Class A) throughout for every calculation
// assertion — computeSafeToSpend, computeMoneyAvailableBalances,
// computeMoneyBalanceStatus, selectSafeToSpendHeroState are all imported
// and executed directly, the actual shipped functions. Section 8's
// SelectBalancesSheet check is Structural (a regex/string match against
// source text, per tests/README.md's own definition) — SelectBalancesSheet.tsx
// transitively imports react-native and cannot be imported/executed by tsx
// (confirmed empirically, matching every other .tsx file in this repo).
// This file does NOT claim rendered-component proof for SafeToSpendHero.tsx
// itself; selectSafeToSpendHeroState is a pure function EXTRACTED FROM and
// now CALLED BY that component (confirmed by reading the component's own
// source, section 8 below), so this is real proof of the state-selection
// logic the shipped component uses, not a parallel mirror — but the actual
// JSX text/style output still requires physical-device evidence, same as
// every other visual claim in this codebase.
//
// Run with: npx tsx tests/safe-to-spend-closure-corrections.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { computeSafeToSpend, selectSafeToSpendHeroState } from '../src/lib/calculations/safeToSpend';
import { computeMoneyAvailableBalances, computeMoneyBalanceStatus } from '../src/lib/calculations/liquidAssets';
import { buildBriefing } from '../src/lib/calculations/greeting';
import type { AppData, Asset } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  d.user.monthlyIncome = 4000;
  d.user.payFrequency = 'weekly';
  d.user.nextPayday = new Date(2026, 7, 14).toISOString();
  return d;
}
const today = new Date(2026, 7, 11);

console.log('=== Section 2: invalid-balance eligibility matrix (real functions) ===');
{
  const cash = (v: number, id = 'a'): Asset => ({ id, type: 'cash', label: 'Cash', currentValue: v });

  assert(
    '(a) invalid PARTICIPATING eligible cash -> invalid_data',
    computeMoneyBalanceStatus([cash(NaN)]) === 'invalid_data'
  );
  assert(
    '(b) invalid eligible-type savings, explicitly excluded (includeInMoneyCalculations:false) -> no_eligible_balance, never invalid_data',
    computeMoneyBalanceStatus([{ id: 'a', type: 'savings', label: 'Savings', currentValue: NaN, includeInMoneyCalculations: false }]) === 'no_eligible_balance'
  );
  assert(
    '(b2) invalid savings at its own default (savings defaults OFF, never opted in) -> no_eligible_balance',
    computeMoneyBalanceStatus([{ id: 'a', type: 'savings', label: 'Savings', currentValue: NaN }]) === 'no_eligible_balance'
  );
  assert(
    '(c) invalid non-liquid property -> no_eligible_balance, never invalid_data',
    computeMoneyBalanceStatus([{ id: 'a', type: 'property', label: 'House', currentValue: NaN }]) === 'no_eligible_balance'
  );
  assert(
    '(c2) invalid non-liquid shares -> no_eligible_balance',
    computeMoneyBalanceStatus([{ id: 'a', type: 'shares', label: 'Shares', currentValue: Infinity }]) === 'no_eligible_balance'
  );
  assert(
    '(d) invalid everyday account explicitly excluded (everyday defaults ON, excluded here) -> no_eligible_balance — the Asset model has no separate archived/deleted field (confirmed by reading models.ts); explicit exclusion is the closest real equivalent',
    computeMoneyBalanceStatus([{ id: 'a', type: 'everyday', label: 'Everyday', currentValue: NaN, includeInMoneyCalculations: false }]) === 'no_eligible_balance'
  );
  assert(
    '(e) invalid participating record mixed with a valid participating record -> invalid_data',
    computeMoneyBalanceStatus([cash(500, 'a'), { id: 'b', type: 'everyday', label: 'Everyday', currentValue: NaN }]) === 'invalid_data'
  );
  assert(
    '(e2) invalid participating mixed with a valid NON-participating record -> still invalid_data (from the participating one)',
    computeMoneyBalanceStatus([
      cash(NaN, 'a'),
      { id: 'b', type: 'savings', label: 'Savings (opted out)', currentValue: 900, includeInMoneyCalculations: false },
    ]) === 'invalid_data'
  );
  assert(
    '(e3) invalid NON-participating mixed with a valid participating record -> stays valid — the invalid one never participates',
    computeMoneyBalanceStatus([
      cash(500, 'a'),
      { id: 'b', type: 'savings', label: 'Savings (opted out)', currentValue: NaN, includeInMoneyCalculations: false },
    ]) === 'valid'
  );
  assert(
    '(e4) invalid non-liquid mixed with a valid participating record -> stays valid — property never participates',
    computeMoneyBalanceStatus([cash(500, 'a'), { id: 'b', type: 'property', label: 'House', currentValue: NaN }]) === 'valid'
  );
  assert('(f) valid zero -> valid', computeMoneyBalanceStatus([cash(0)]) === 'valid');
  assert('(g) valid negative -> valid', computeMoneyBalanceStatus([cash(-50)]) === 'valid');
  assert('(h) no eligible balance, empty -> no_eligible_balance', computeMoneyBalanceStatus([]) === 'no_eligible_balance');
  assert(
    '(h2) no eligible balance, only non-liquid types present -> no_eligible_balance',
    computeMoneyBalanceStatus([{ id: 'a', type: 'property', label: 'House', currentValue: 500000 }]) === 'no_eligible_balance'
  );
}

console.log('\n=== Section 3: repair-path — SelectBalancesSheet independence from listMoneyAvailableAccounts (Structural) ===');
{
  const SELECT_BALANCES_SRC = readFileSync('src/components/money/SelectBalancesSheet.tsx', 'utf8');
  assert(
    'SelectBalancesSheet.tsx builds its own balance list directly from data.assets, not from listMoneyAvailableAccounts/computeMoneyAvailableBalances/computeMoneyBalanceStatus',
    /data\.assets\.filter/.test(SELECT_BALANCES_SRC) &&
      !/listMoneyAvailableAccounts/.test(SELECT_BALANCES_SRC) &&
      !/computeMoneyAvailableBalances/.test(SELECT_BALANCES_SRC) &&
      !/computeMoneyBalanceStatus/.test(SELECT_BALANCES_SRC)
  );
  assert(
    'SelectBalancesSheet.tsx filters by type only (cash/savings/everyday), the same eligible-type set resolveIncludeInMoneyCalculations uses — an invalid-value record is never excluded from this list by value',
    /a\.type === 'cash' \|\| a\.type === 'savings' \|\| a\.type === 'everyday'/.test(SELECT_BALANCES_SRC)
  );
  // Conclusion, proven by the two assertions above: listMoneyAvailableAccounts
  // excluding non-finite entries (Pass 1's own change) has NO effect on this
  // screen — the two data sources are architecturally independent — so a
  // corrupted balance record remains visible and editable here regardless
  // of what SafeToSpendHero's own breakdown list shows. No source change
  // was required for this section.
}

console.log('\n=== Section 4: consumer audit — greeting.ts buildBriefing (previously unguarded, now fixed) ===');
{
  const invalidResult = computeSafeToSpend(
    (() => {
      const d = baseData();
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }];
      return d;
    })(),
    today
  );
  const summary = { income: 0, expenses: 0, savingsRate: 0 } as any;
  assert(
    'buildBriefing (greeting.ts) returns the neutral unavailable message for invalid_data, never a $-prefixed amount built from the valid-only partial sum',
    buildBriefing(invalidResult, summary, null) === 'Available amount unavailable. Review your recorded balances.'
  );
  const validResult = computeSafeToSpend(
    (() => {
      const d = baseData();
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 500 }];
      return d;
    })(),
    today
  );
  assert(
    'buildBriefing still returns its normal sentence for valid data, unchanged behaviour',
    buildBriefing(validResult, summary, null).startsWith('You have $500 available until payday')
  );
  const zeroDayResult = computeSafeToSpend(
    (() => {
      const d = baseData();
      d.user.nextPayday = new Date(2026, 7, 11).toISOString();
      d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 500 }];
      return d;
    })(),
    today
  );
  assert(
    'buildBriefing omits the "in N days" clause entirely when daysRemaining is 0, rather than saying "in 0 days"',
    buildBriefing(zeroDayResult, summary, null) === 'You have $500 available until payday.'
  );
}

console.log('\n=== Section 5: structural finite backstop — SUPERSEDED, now fixed (final Pass 1 closure, 2026-08-11) ===');
{
  // The prior closure pass stopped here and reported that a NaN recurring
  // bill or same-day transaction could force moneyBalanceStatus to
  // 'invalid_data' even though the balances themselves were fine — exactly
  // the misattribution the independent review flagged as blocking
  // acceptance. This section now proves the FIX: moneyBalanceStatus is
  // computed once from data.assets and never reassigned; a new
  // `availability` field carries the overall unavailable signal, correctly
  // attributed to 'unavailable_balance_data' or 'unavailable_other_data'.
  function reach(patch: (d: AppData) => void) {
    const d = baseData();
    d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }];
    patch(d);
    return computeSafeToSpend(d, today);
  }

  const billResult = reach((d) => {
    d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: NaN, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }];
  });
  assert(
    'FIXED: a NaN recurring bill amount no longer touches moneyBalanceStatus (stays valid, matching computeMoneyBalanceStatus(data.assets) directly) — attributed instead to availability=unavailable_other_data',
    billResult.moneyBalanceStatus === 'valid' &&
      billResult.availability === 'unavailable_other_data' &&
      computeMoneyBalanceStatus([{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }]) === 'valid'
  );
  assert('every numeric field stays finite in this case', [billResult.cycleRemainingPool, billResult.dailyAllowance, billResult.plannedDailyAllowance].every(Number.isFinite));
  // Pass 2A-0 regression guard: the new unconditional no_eligible_balance
  // check in selectSafeToSpendHeroState only fires when
  // moneyBalanceStatus==='no_eligible_balance' — billResult's balance is
  // real and valid (only the bill is corrupted), so this state must remain
  // exactly 'unavailable_other_data', unaffected by the Pass 2A-0 edit.
  assert(
    'Pass 2A-0: selectSafeToSpendHeroState(billResult) still returns unavailable_other_data unchanged (moneyBalanceStatus is valid here, not no_eligible_balance, so the new guard never fires)',
    selectSafeToSpendHeroState(billResult) === 'unavailable_other_data'
  );

  const txnResult = reach((d) => {
    d.transactions = [{ id: 't1', type: 'expense', category: 'other', amount: NaN, date: today.toISOString(), paymentSource: 'cash' } as any];
  });
  assert(
    'FIXED: a NaN same-day transaction amount also no longer touches moneyBalanceStatus, correctly attributed to availability=unavailable_other_data instead',
    txnResult.moneyBalanceStatus === 'valid' && txnResult.availability === 'unavailable_other_data'
  );

  const balanceResult = reach((d) => {
    d.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: NaN }];
  });
  assert(
    'a genuinely invalid participating balance is still correctly attributed to unavailable_balance_data, not unavailable_other_data',
    balanceResult.moneyBalanceStatus === 'invalid_data' && balanceResult.availability === 'unavailable_balance_data'
  );
  // Pass 2A-0 regression guard: moneyBalanceStatus is 'invalid_data' here,
  // not 'no_eligible_balance' — the new guard's condition is false, so
  // precedence stays exactly as before (unavailable_balance_data is still
  // checked first, via the availability branch above the new guard).
  assert(
    'Pass 2A-0: selectSafeToSpendHeroState(balanceResult) still returns unavailable_balance_data unchanged',
    selectSafeToSpendHeroState(balanceResult) === 'unavailable_balance_data'
  );

  const cardResult = reach((d) => {
    d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: NaN, dueDay: today.getDate(), minimumPayment: 25 }];
  });
  assert(
    'a NaN credit-card currentBalance still does not reach either unavailable path (creditHealth.ts\'s own sanitizeBalance already floors it) — confirms the reachable set is narrow, not universal',
    cardResult.moneyBalanceStatus === 'valid' && cardResult.availability === 'available'
  );

  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): the finding below (a NaN
  // goal targetAmount not reaching either unavailable path) was true when
  // this section was first written, but was itself a real, separate defect
  // — requiredMonthlyForGoal's `!goal.targetAmount` check silently treats a
  // corrupted NaN identically to "no target set," zeroing the goal's real
  // funding requirement and inflating cycleRemainingPool. Fixed this pass
  // via an explicit hasInvalidGoalData check in safeToSpend.ts. Both
  // directions (targetAmount and currentAmount) are proven below.
  const goalResult = reach((d) => {
    d.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: NaN, currentAmount: 0, targetDate: null, priority: 'high', status: 'active' }];
  });
  assert(
    'FIXED: a NaN goal targetAmount now correctly reaches unavailable_other_data (previously silently coerced to a $0 funding requirement)',
    goalResult.moneyBalanceStatus === 'valid' && goalResult.availability === 'unavailable_other_data'
  );

  const goalCurrentAmountResult = reach((d) => {
    d.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: 500, currentAmount: NaN, targetDate: null, priority: 'high', status: 'active' }];
  });
  assert(
    'FIXED (other direction): a NaN goal currentAmount also now reaches unavailable_other_data (previously silently dropped the goal entirely — computeGoalAllocation\'s targetAmount > currentAmount candidate filter is false for any NaN comparison)',
    goalCurrentAmountResult.moneyBalanceStatus === 'valid' && goalCurrentAmountResult.availability === 'unavailable_other_data'
  );

  const goalNoTargetResult = reach((d) => {
    d.goals = [{ id: 'g1', name: 'Trip', lifeGoalType: 'holiday', targetAmount: null, currentAmount: 0, targetDate: null, priority: 'high', status: 'active' } as any];
  });
  assert(
    'a goal with no target set yet (targetAmount: null) is deliberately NOT flagged as invalid — a legitimate, common state, distinct from a corrupted NaN',
    goalNoTargetResult.moneyBalanceStatus === 'valid' && goalNoTargetResult.availability === 'available'
  );
}

console.log('\n=== Section 6: zero-day and missing-data field table (real function calls) ===');
{
  function report(patch: (d: AppData) => void, at: Date = today) {
    const d = baseData();
    d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
    patch(d);
    return computeSafeToSpend(d, at);
  }

  const r1 = report((d) => { d.user.nextPayday = new Date(2026, 7, 11).toISOString(); });
  assert('today equals payday: daysRemaining=0', r1.daysRemaining === 0);
  assert('today equals payday: dailyAllowance=0, NOT the full pool (no manufactured one-day denominator)', r1.dailyAllowance === 0);
  assert('today equals payday: plannedDailyAllowance=0', r1.plannedDailyAllowance === 0);
  assert('today equals payday: cycleRemainingPool is still the real $1000 figure, unaffected', r1.cycleRemainingPool === 1000);
  assert('today equals payday: moneyBalanceStatus=valid', r1.moneyBalanceStatus === 'valid');

  const r2 = report((d) => { d.user.nextPayday = new Date(2026, 7, 12).toISOString(); });
  assert('payday tomorrow: daysRemaining=1, dailyAllowance=1000 (real one-day rate, not manufactured)', r2.daysRemaining === 1 && r2.dailyAllowance === 1000);

  const r3 = report((d) => { d.user.nextPayday = null; });
  assert('missing payday: hasKnownPayday=false, daysRemaining falls back to the 7-day rolling window, all fields finite', !r3.hasKnownPayday && r3.daysRemaining === 7 && Number.isFinite(r3.dailyAllowance));
  // Pass 2A-0 regression guard: the new no_eligible_balance guard is placed
  // AFTER the existing !hasKnownPayday check in selectSafeToSpendHeroState,
  // specifically so it never interferes with no_known_payday's own,
  // already-correct handling of its own no-balance-selected sub-case.
  assert('Pass 2A-0: no known payday still resolves to no_known_payday, precedence unchanged', selectSafeToSpendHeroState(r3) === 'no_known_payday');

  const r4 = report((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: NaN }]; });
  assert('invalid balance data: daysRemaining still correctly 3 (date logic unaffected by balance validity), cycleRemainingPool/dailyAllowance/plannedDailyAllowance all floored to 0, status=invalid_data', r4.daysRemaining === 3 && r4.cycleRemainingPool === 0 && r4.dailyAllowance === 0 && r4.plannedDailyAllowance === 0 && r4.moneyBalanceStatus === 'invalid_data');

  const r5 = report((d) => { d.assets = []; });
  assert('no eligible balance: cycleRemainingPool=0, status=no_eligible_balance (distinct from invalid_data and from a legitimate $0)', r5.cycleRemainingPool === 0 && r5.moneyBalanceStatus === 'no_eligible_balance');
  // Pass 2A-0 CENTRAL FIX PROOF: r5 has a known payday, moneyBalanceStatus
  // 'no_eligible_balance', and a cycleRemainingPool that happens to be
  // exactly 0 (no bills/savings/goals due). Before this pass,
  // selectSafeToSpendHeroState fell through to 'normal' here (hasNegativeCycle
  // was false, so the balance-eligibility problem was silently presented as
  // a genuine $0 result). It must now resolve to 'missing_balance'.
  assert(
    'Pass 2A-0 FIX: known payday + no eligible balance + exactly-zero cycle -> missing_balance (previously fell through to normal, silently presenting the placeholder $0 pool as a genuine result)',
    selectSafeToSpendHeroState(r5) === 'missing_balance'
  );

  const r5negative = report((d) => {
    d.assets = [];
    d.recurringItems = [{ id: 'b1', type: 'expense', label: 'Rent', amount: 500, frequency: 'weekly', nextDueDate: today.toISOString(), isFixed: true, active: true }];
  });
  assert('no eligible balance + a bill due this cycle -> cycleRemainingPool is genuinely negative', r5negative.cycleRemainingPool < 0 && r5negative.moneyBalanceStatus === 'no_eligible_balance');
  assert(
    'Pass 2A-0: known payday + no eligible balance + negative cycle -> missing_balance (already correct pre-fix via the existing hasNegativeCycle-gated check, confirmed still correct post-fix)',
    selectSafeToSpendHeroState(r5negative) === 'missing_balance'
  );

  // Pass 2A-0: a genuinely positive cycleRemainingPool combined with
  // no_eligible_balance is mathematically unreachable via computeSafeToSpend's
  // real arithmetic — includedMoneyBalance is exactly 0 in this state, and
  // cycleRemainingPool = includedMoneyBalance - cycleBillsExpected -
  // cycleSavingsReserved - cycleGoalsReserved, where every subtracted term is
  // non-negative by construction, so the result can only ever be <= 0. This
  // is therefore a direct, isolated test of selectSafeToSpendHeroState's own
  // unconditional precedence (built by overriding one field on a real,
  // computed r5 result), not a claim that computeSafeToSpend itself can
  // produce this combination — labelled per this repo's real-vs-mirrored
  // evidence convention (tests/README.md).
  const r5positiveOverride = { ...r5, cycleRemainingPool: 250 };
  assert(
    'Pass 2A-0: no_eligible_balance forces missing_balance regardless of cycleRemainingPool sign, even a hypothetical positive value (selector-only proof; this exact combination cannot arise from real computeSafeToSpend arithmetic — see comment above) — never normal',
    selectSafeToSpendHeroState(r5positiveOverride) === 'missing_balance'
  );

  const r5genuineZero = report((d) => { d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 0 }]; });
  assert('a genuinely eligible cash balance recorded as $0 is moneyBalanceStatus=valid, not no_eligible_balance', r5genuineZero.moneyBalanceStatus === 'valid' && r5genuineZero.cycleRemainingPool === 0);
  assert(
    'Pass 2A-0 regression guard: a genuine, valid recorded $0 balance still resolves to normal, unaffected by the new guard (moneyBalanceStatus is valid here, not no_eligible_balance)',
    selectSafeToSpendHeroState(r5genuineZero) === 'normal'
  );

  const r6 = report((d) => {
    d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 50 }];
    d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: today.getDate(), minimumPayment: 25, expectedMonthlyRepayment: 300 }];
  });
  assert('negative availability: cycleRemainingPool < 0, dailyAllowance < 0 (a real negative rate, not suppressed — only daysRemaining<=0 suppresses to 0), status=valid', r6.cycleRemainingPool < 0 && r6.dailyAllowance < 0 && r6.moneyBalanceStatus === 'valid');
}

console.log('\n=== Section 6b: hero state selection at the zero-day boundary stays correct for a negative pool ===');
{
  // moneyBalanceStatus here is 'valid' (a real $50 cash asset is present),
  // not 'no_eligible_balance' — the Pass 2A-0 guard's condition is false, so
  // this fixture also doubles as the required "known payday + valid negative
  // cycle -> existing commitments_exceed_cash behaviour unchanged" proof.
  const d = baseData();
  d.user.nextPayday = new Date(2026, 7, 11).toISOString(); // today == payday
  d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 50 }];
  d.creditCards = [{ id: 'c1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: today.getDate(), minimumPayment: 25, expectedMonthlyRepayment: 300 }];
  const r = computeSafeToSpend(d, today);
  assert('today==payday with a genuinely negative pool: daysRemaining=0 and dailyAllowance=0 (suppressed)', r.daysRemaining === 0 && r.dailyAllowance === 0);
  assert('cycleRemainingPool is still negative (the real figure)', r.cycleRemainingPool < 0);
  assert('moneyBalanceStatus is valid, not no_eligible_balance, here — confirms the Pass 2A-0 guard is inapplicable to this fixture', r.moneyBalanceStatus === 'valid');
  assert(
    'Pass 2A-0 regression guard: selectSafeToSpendHeroState still correctly reports a negative-cycle state here (commitments_exceed_cash), unchanged — proves the hasNegativeCycle signal now derives from cycleRemainingPool, not the suppressed dailyAllowance, so the warning is never silently hidden on the exact payday boundary',
    selectSafeToSpendHeroState(r) === 'commitments_exceed_cash'
  );
}

console.log('\n=== Section 7: persisted-timezone results (real function, 4 timezones) ===');
{
  console.log('--- Case 1: same INTENDED local date, independently constructed fresh under each timezone ---');
  for (const tz of ['Australia/Melbourne', 'UTC', 'Australia/Perth', 'Pacific/Honolulu']) {
    process.env.TZ = tz;
    const d = baseData();
    d.user.nextPayday = new Date(2026, 7, 14).toISOString();
    d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
    const r = computeSafeToSpend(d, new Date(2026, 7, 11));
    assert(`TZ=${tz}: same intended local date (Aug 11 -> Aug 14) -> daysRemaining=3`, r.daysRemaining === 3);
  }

  console.log('--- Case 2: same SERIALIZED ISO instant, written on a Melbourne device, read after the device timezone changes ---');
  process.env.TZ = 'Australia/Melbourne';
  const writtenOnMelbourne = new Date(2026, 7, 14).toISOString();
  const expectedDaysByTz: Record<string, number> = {
    'Australia/Melbourne': 3, // read on the SAME timezone it was written on -> correct
    UTC: 2, // same instant resolves to a different local calendar date -> off by one
    'Australia/Perth': 2,
    'Pacific/Honolulu': 2,
  };
  for (const [tz, expected] of Object.entries(expectedDaysByTz)) {
    process.env.TZ = tz;
    const d = baseData();
    d.user.nextPayday = writtenOnMelbourne; // the literal same stored string, never changed
    d.assets = [{ id: 'a', type: 'cash', label: 'Cash', currentValue: 1000 }];
    const r = computeSafeToSpend(d, new Date(2026, 7, 11));
    assert(`TZ=${tz}: same serialized ISO (written on Melbourne) -> daysRemaining=${expected}`, r.daysRemaining === expected);
  }
  process.env.TZ = 'Australia/Melbourne';
  // CONCLUSION: Case 1 (fresh local construction) is robust under every
  // tested timezone. Case 2 (the same stored instant reread after a device
  // timezone change) reproducibly shifts by one full day. This is NOT only
  // a legacy-data limitation — AddIncomeModal.tsx's unset-date fallback
  // (`new Date().toISOString()`) and AddRecurringItemModal.tsx's
  // nextOccurrence() (local midnight -> toISOString()) both still write
  // this same full-ISO-instant shape today, for every newly created record,
  // confirmed by source read. Smallest future correction: store the payday
  // as a portable local calendar-date string (no time-of-day, no timezone
  // component) instead of a full ISO instant, or persist the authoring
  // timezone offset alongside it. Not implemented this pass — requires a
  // data migration, explicitly out of scope for this closure.
}

console.log('\n=== Section 8: selectSafeToSpendHeroState — real, used-by-the-shipped-component evidence ===');
// Pass 2A update, 2026-08-11: SafeToSpendHero.tsx no longer calls
// selectSafeToSpendHeroState directly — it now goes through the new shared
// selectSafeToSpendPresentation(safeToSpend, heroCopy) (safeToSpendPresentation.ts),
// which itself wraps selectSafeToSpendHeroState unchanged (confirmed by
// reading that file — see safeToSpendPresentation.ts's own header comment
// and Section 9 below) so both Money and the new Today Briefing read one
// shared, single-sourced presentation. The two assertions below are updated
// to match this real one-hop-further wiring; every state-precedence
// assertion later in this section still passes against the current source
// unmodified, since heroState (now presentation.heroState) still gates the
// same 8 branches in the same order.
{
  const SAFE_TO_SPEND_HERO_SRC = readFileSync('src/components/money/SafeToSpendHero.tsx', 'utf8');
  const SAFE_TO_SPEND_PRESENTATION_SRC = readFileSync('src/lib/calculations/safeToSpendPresentation.ts', 'utf8');
  assert(
    'SafeToSpendHero.tsx imports the shared selectSafeToSpendPresentation selector (not a re-derived local copy), and that shared selector itself imports selectSafeToSpendHeroState from safeToSpend.ts unchanged',
    /import \{ selectSafeToSpendPresentation, formatSafeToSpendAmount as formatMoney \} from '\.\.\/\.\.\/lib\/calculations\/safeToSpendPresentation'/.test(
      SAFE_TO_SPEND_HERO_SRC
    ) && /import \{ SafeToSpendResult, SafeToSpendHeroState, selectSafeToSpendHeroState \} from '\.\/safeToSpend'/.test(SAFE_TO_SPEND_PRESENTATION_SRC)
  );
  assert(
    'SafeToSpendHero.tsx calls selectSafeToSpendPresentation exactly once and stores the result as presentation/heroState; the shared selector itself calls selectSafeToSpendHeroState exactly once',
    (SAFE_TO_SPEND_HERO_SRC.match(/const presentation = selectSafeToSpendPresentation\(safeToSpend, heroCopy\);/g) || []).length === 1 &&
      (SAFE_TO_SPEND_HERO_SRC.match(/const heroState = presentation\.heroState;/g) || []).length === 1 &&
      (SAFE_TO_SPEND_PRESENTATION_SRC.match(/const heroState = selectSafeToSpendHeroState\(safeToSpend\);/g) || []).length === 1
  );
  assert(
    // Wave 4 closure, P1 — `goals_underfunded` deliberately no longer has a
    // branch of its own. It was the ONLY state whose branch suppressed the
    // Available Until Payday amount for a reason that is not an AUP
    // condition, which is what produced the "-$6,802" substitution; it now
    // falls through to the ordinary card. The guarantee this assertion
    // exists to protect — every branch that DOES exist gates on the shared
    // heroState rather than a locally re-derived boolean — is unchanged.
    'every remaining card-state branch gates on heroState, not a locally re-derived boolean',
    [
      "'unavailable_balance_data'",
      "'unavailable_other_data'",
      "'no_known_payday'",
      "'missing_balance'",
      "'recorded_overspend'",
      "'commitments_exceed_cash'",
    ].every((state) => SAFE_TO_SPEND_HERO_SRC.includes(`heroState === ${state}`)) &&
      !/heroState === 'goals_underfunded'/.test(SAFE_TO_SPEND_HERO_SRC)
  );
  assert(
    'and goals_underfunded now presents the SAME canonical cycle amount as the normal state, so the card and its breakdown cannot disagree',
    /case 'goals_underfunded':[\s\S]*?\.\.\.resolveAmount\(Math\.max\(0, safeToSpend\.cycleRemainingPool\)\),/.test(SAFE_TO_SPEND_PRESENTATION_SRC)
  );
  // RECONCILED — Wave 9b closure, Correction A. The clause matched
  // `primaryCopy: heroCopy.amountLabel`. That label was persona-derived:
  // Today showed "BUSINESS CASH POSITION" while Money showed "Available
  // until payday" for the same figure, because a persisted legacy
  // `moneyPersona` still overrode the cadence fallback. The primary line is
  // now the persona-free canonical constant.
  //
  // PRESERVED INTENT — the goal statement is SUPPORTING copy, never the
  // primary amount line, and never quotes the monthly cash-flow figure — is
  // unchanged, and the primary line is still asserted to be the amount label.
  assert(
    'and its goal statement is supporting copy, never the primary amount line, and never quotes the monthly cash-flow figure',
    /case 'goals_underfunded':[\s\S]*?primaryCopy: AVAILABLE_UNTIL_PAYDAY_AMOUNT_LABEL,/.test(SAFE_TO_SPEND_PRESENTATION_SRC) &&
      !/availableForGoals\s*\n?\s*\)\} is currently available/.test(SAFE_TO_SPEND_PRESENTATION_SRC)
  );
  assert(
    'and that primary line is now persona-free, so Today and Money cannot name the same figure differently',
    /export const AVAILABLE_UNTIL_PAYDAY_AMOUNT_LABEL = 'Estimated amount remaining';/.test(SAFE_TO_SPEND_PRESENTATION_SRC) &&
      // Executable code only: the doc comment beside the fix names the
      // retired field in order to explain what was corrected and why.
      !/eyebrowScheduled/.test(SAFE_TO_SPEND_PRESENTATION_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'))
  );
  assert(
    'the unavailable_balance_data branch renders neither $0 nor any numeric formatMoney call, does not render the "≈ .../day" daily-rate line, and renders whatever primaryCopy/supportingCopy the shared selector returns (Pass 2A correction: statusLines was replaced by these two explicit fields; the literal balance-specific wording itself now lives once in safeToSpendPresentation.ts, checked separately below, not duplicated here)',
    (() => {
      const start = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'unavailable_balance_data')");
      const end = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'unavailable_other_data')");
      const block = SAFE_TO_SPEND_HERO_SRC.slice(start, end);
      return block.includes('presentation.primaryCopy') && block.includes('presentation.supportingCopy') && !block.includes('formatMoney') && !block.includes('/day');
    })()
  );
  assert(
    "Pass 2A: the shared selector's unavailable_balance_data case carries the exact balance-specific wording SafeToSpendHero.tsx used to author locally, unchanged, and unavailable_other_data carries the distinct money-details wording — the single source both this card and the Today Briefing now read",
    (() => {
      const start = SAFE_TO_SPEND_PRESENTATION_SRC.indexOf("case 'unavailable_balance_data':");
      const end = SAFE_TO_SPEND_PRESENTATION_SRC.indexOf("case 'unavailable_other_data':");
      const block = SAFE_TO_SPEND_PRESENTATION_SRC.slice(start, end);
      return block.includes('Available amount unavailable') && block.includes('Review your recorded balances.');
    })()
  );
  // SUPERSEDED, 2026-08-11 (final Pass 1 closure): the finding below was
  // true when this section was first written, but Manage Balances/
  // SelectBalancesSheet was itself proven to be a misleading action — it
  // only toggles a balance's inclusion and has no field to edit or remove
  // a corrupted currentValue. Fixed this pass: the unavailable_balance_data
  // branch now renders "Review in Wealth" (onReviewInWealth) instead,
  // navigating to the real repair surface — proven structurally below, and
  // via the full navigation-target/persistence trace in
  // tests/safe-to-spend-final-closure.test.ts Section 5 (SelectBalancesSheet
  // limitation confirmed, AddWealthItemModal/WealthScreen repair path
  // confirmed via source inspection).
  assert(
    'FIXED: the unavailable_balance_data branch no longer CALLS renderManageBalancesButton(...) at all — it renders onReviewInWealth (Review in Wealth) instead, the smallest existing path to a surface that can actually repair the value. (Checks the call syntax renderManageBalancesButton( specifically, not a bare substring match, since the block also contains a trailing explanatory comment that mentions the function by name without calling it.)',
    (() => {
      const start = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'unavailable_balance_data')");
      const end = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'unavailable_other_data')");
      const block = SAFE_TO_SPEND_HERO_SRC.slice(start, end);
      return !block.includes('renderManageBalancesButton(') && block.includes('onReviewInWealth') && block.includes('Review in Wealth');
    })()
  );
  assert(
    'the unavailable_other_data branch renders whatever primaryCopy/supportingCopy the shared selector returns and does NOT render renderManageBalancesButton at all — a bill/transaction problem must never show a balance-specific action (Pass 2A correction: statusLines was replaced by these two explicit fields; the literal money-details wording itself is checked in the shared-selector assertion above)',
    (() => {
      const start = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'unavailable_other_data')");
      const end = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'no_known_payday')");
      const block = SAFE_TO_SPEND_HERO_SRC.slice(start, end);
      return block.includes('presentation.primaryCopy') && block.includes('presentation.supportingCopy') && !block.includes('renderManageBalancesButton');
    })()
  );
  assert(
    "Pass 2A: the shared selector's unavailable_other_data case carries the distinct money-details wording, never the balance-specific wording",
    (() => {
      const start = SAFE_TO_SPEND_PRESENTATION_SRC.indexOf("case 'unavailable_other_data':");
      const end = SAFE_TO_SPEND_PRESENTATION_SRC.indexOf("case 'no_known_payday':");
      const block = SAFE_TO_SPEND_PRESENTATION_SRC.slice(start, end);
      return block.includes('Available amount unavailable') && block.includes('Review your recorded money details.') && !block.includes('Review your recorded balances.');
    })()
  );
  assert(
    'renderManageBalancesButton wires onPress to the exact same onSelectBalances callback every other state uses — confirmed once, applies to every call site including unavailable_balance_data',
    /onPress=\{onSelectBalances\}/.test(SAFE_TO_SPEND_HERO_SRC)
  );
  assert(
    'unavailable_balance_data and unavailable_other_data are the FIRST two branches checked (before no_known_payday, before every negative-cycle state) — precedence proven by source order, matching selectSafeToSpendHeroState\'s own real-tested precedence above',
    SAFE_TO_SPEND_HERO_SRC.indexOf("heroState === 'unavailable_balance_data'") < SAFE_TO_SPEND_HERO_SRC.indexOf("heroState === 'unavailable_other_data'") &&
      SAFE_TO_SPEND_HERO_SRC.indexOf("heroState === 'unavailable_other_data'") < SAFE_TO_SPEND_HERO_SRC.indexOf("heroState === 'no_known_payday'")
  );
  assert(
    'Pass 2A-0: the missing_balance branch never renders a formatMoney(...) call or exposes cycleRemainingPool as a numeric amount — the no_eligible_balance/missing-information state must never present an authoritative dollar figure',
    (() => {
      const start = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'missing_balance')");
      const end = SAFE_TO_SPEND_HERO_SRC.indexOf("if (heroState === 'recorded_overspend')");
      const block = SAFE_TO_SPEND_HERO_SRC.slice(start, end);
      return start !== -1 && end !== -1 && !block.includes('formatMoney(') && !block.includes('cycleRemainingPool');
    })()
  );

  // Honest scope limitation, stated per this repo's own tests/README.md
  // convention: SafeToSpendHero.tsx transitively imports react-native and
  // cannot be imported/executed by tsx (confirmed empirically, matching
  // every other .tsx file in this repository). No jest/@testing-library/
  // react-test-renderer is installed, and this closure explicitly
  // prohibits adding dependencies. The assertions above are the strongest
  // available real evidence under that constraint: selectSafeToSpendHeroState
  // itself is proven by direct execution (Sections 2 and 6b), and the
  // assertions here prove the shipped component actually calls that same
  // function and branches on its result — not a parallel mirror. What
  // remains unverified here specifically: the literal on-screen pixel
  // rendering, style application, and touch-handler firing. That remains
  // physical-device evidence, exactly as for every other visual claim in
  // this codebase.
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
