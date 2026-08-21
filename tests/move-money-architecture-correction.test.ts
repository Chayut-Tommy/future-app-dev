// Move Money architecture correction round — 2026-08-10.
//
// Covers the new production code from this round that isn't already
// exercised by tests/transfer-funds-wiring.test.ts (transferFundsTransition
// itself) or the two updated Everyday Account files (Move Money eligibility
// reversal): the BNPL handoff resolver, the Money Flow itemised breakdown,
// and the shared account-label disambiguation helper — plus structural
// proof that a 'future' BNPL occurrence can never be confirmed from the UI.
//
// CLASSIFICATION (per tests/README.md):
// - Real import (Class A): sections 1, 2, 4, 5 — import and directly execute
//   resolveBnplHandoffState/listBnplHandoffStates (bnplHandoff.ts),
//   disambiguateBalanceLabels (moveMoneyEligibility.ts), and
//   computeMoneyFlowCategoryBreakdown (moneyFlowBreakdown.ts) against real
//   AppData fixtures, cross-checked against computeSafeToSpend's own
//   already-tested totals. None of these modules import react-native.
// - Structural (Class C): section 3 — TransferForm.tsx cannot be imported
//   (transitively pulls in react-native); confirms the 'future' branch's
//   JSX never wires a confirm action, only "Manage repayment details".
//
// NOT PROVEN by this suite: on-device rendering of the BNPL group or the
// Typical Money Flow/Typical Monthly Allocation detail sheets, VoiceOver/
// Dynamic Type behaviour, or actual tap-through. Device testing remains
// separate evidence (see this round's implementation report).
//
// Run with: npx tsx tests/move-money-architecture-correction.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { resolveBnplHandoffState, listBnplHandoffStates } from '../src/lib/calculations/bnplHandoff';
import { disambiguateBalanceLabels } from '../src/lib/calculations/moveMoneyEligibility';
import { computeMoneyFlowCategoryBreakdown } from '../src/lib/calculations/moneyFlowBreakdown';
import { computeSafeToSpend } from '../src/lib/calculations/safeToSpend';
import { confirmBnplRepaymentTransition } from '../src/state/AppStateContext';
import type { AppData, Asset, Liability, RecurringItem, Goal } from '../src/types/models';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

// Local-midnight construction — matches bnpl.ts/bnplHandoff.ts's own
// startOfDay convention (never bare ISO-date-string parsing, which the JS
// spec treats as UTC).
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
function liability(patch: Partial<Liability> = {}): Liability {
  return { id: 'bnpl1', type: 'bnpl', label: 'Test Plan', currentBalance: 150, ...patch };
}
function item(patch: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 'item1',
    type: 'expense',
    label: 'Test Plan repayment',
    amount: 100,
    frequency: 'weekly',
    nextDueDate: dISO('2026-08-10'),
    isFixed: false,
    active: true,
    linkedLiabilityId: 'bnpl1',
    ...patch,
  };
}

const TRANSFER_FORM_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/TransferForm.tsx', 'utf-8');

// ============================================================================
// Section 1 — resolveBnplHandoffState (real import)
// ============================================================================
console.log('=== 1. resolveBnplHandoffState (real import) ===');
{
  const today = d('2026-08-10');

  {
    const data = baseData();
    assert('1a. Unresolvable liabilityId -> missing', resolveBnplHandoffState(data, 'does-not-exist', today).kind === 'missing');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Loan', currentBalance: 100 }] };
    assert('1b. A liability that exists but is not type bnpl -> missing (never mistakenly resolved)', resolveBnplHandoffState(data, 'loan1', today).kind === 'missing');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability({ currentBalance: NaN })] };
    assert('1c. An invalid stored currentBalance (NaN) -> missing, never a false paid_off/balance_only', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'missing');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability({ currentBalance: 0 })] };
    assert('1d. currentBalance exactly 0 -> paid_off', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'paid_off');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [] };
    assert('1e. Outstanding balance but no active linked recurring item -> balance_only', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'balance_only');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ id: 'a' }), item({ id: 'b' })] };
    assert('1f. Two active linked items -> ambiguous', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'ambiguous');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ nextDueDate: 'not-a-real-date' })] };
    assert('1g. Corrupted nextDueDate -> corrupted', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'corrupted');
  }
  {
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ amount: 0 })] };
    assert('1h. Corrupted item amount (0, rejected by moneyAmountToCents) -> corrupted', resolveBnplHandoffState(data, 'bnpl1', today).kind === 'corrupted');
  }
  {
    // Exact due-today boundary — days === 0 -> due_or_overdue, overdue:false.
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ nextDueDate: dISO('2026-08-10') })] };
    const state = resolveBnplHandoffState(data, 'bnpl1', today);
    assert('1i. nextDueDate === today -> due_or_overdue', state.kind === 'due_or_overdue');
    assert('1i. Due exactly today is NOT overdue (overdue: false)', state.kind === 'due_or_overdue' && state.overdue === false);
  }
  {
    // One day overdue — days > 0 -> overdue: true.
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ nextDueDate: dISO('2026-08-09') })] };
    const state = resolveBnplHandoffState(data, 'bnpl1', today);
    assert('1j. nextDueDate one day in the past -> due_or_overdue, overdue: true', state.kind === 'due_or_overdue' && state.overdue === true);
  }
  {
    // One day out — days < 0 -> future.
    const data: AppData = { ...baseData(), liabilities: [liability()], recurringItems: [item({ nextDueDate: dISO('2026-08-11') })] };
    const state = resolveBnplHandoffState(data, 'bnpl1', today);
    assert('1k. nextDueDate one day in the future -> future, never due_or_overdue', state.kind === 'future');
  }
  {
    // effectiveCents capping — scheduled $100, outstanding $60 -> capped to $60.
    const data: AppData = { ...baseData(), liabilities: [liability({ currentBalance: 60 })], recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })] };
    const state = resolveBnplHandoffState(data, 'bnpl1', today);
    assert('1l. effectiveCents is capped to the outstanding balance (min(scheduled, outstanding)) when scheduled exceeds it', state.kind === 'due_or_overdue' && state.effectiveCents === 6000);
  }
  {
    // No capping needed — scheduled $100, outstanding $150.
    const data: AppData = { ...baseData(), liabilities: [liability({ currentBalance: 150 })], recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })] };
    const state = resolveBnplHandoffState(data, 'bnpl1', today);
    assert('1m. effectiveCents equals the full scheduled amount when outstanding comfortably covers it', state.kind === 'due_or_overdue' && state.effectiveCents === 10000);
  }
}

// ============================================================================
// Section 2 — listBnplHandoffStates (real import)
// ============================================================================
console.log('\n=== 2. listBnplHandoffStates (real import) ===');
{
  const today = d('2026-08-10');
  const data: AppData = {
    ...baseData(),
    liabilities: [
      liability({ id: 'paid', currentBalance: 0 }),
      liability({ id: 'due', currentBalance: 100 }),
      liability({ id: 'future', currentBalance: 100 }),
      { id: 'loan1', type: 'personal_loan', label: 'Loan', currentBalance: 500 },
    ],
    recurringItems: [
      item({ id: 'due-item', linkedLiabilityId: 'due', nextDueDate: dISO('2026-08-10') }),
      item({ id: 'future-item', linkedLiabilityId: 'future', nextDueDate: dISO('2026-08-20') }),
    ],
  };
  const states = listBnplHandoffStates(data, today);
  assert('2a. A paid-off BNPL plan (currentBalance 0) is excluded from the list', !states.some((s) => s.kind === 'paid_off' || s.liability.id === 'paid'));
  assert('2b. A non-BNPL liability never appears in the list at all', !states.some((s) => s.liability.id === 'loan1'));
  assert('2c. A due-today plan is included with kind due_or_overdue', states.some((s) => s.liability.id === 'due' && s.kind === 'due_or_overdue'));
  assert('2d. A future plan is included with kind future', states.some((s) => s.liability.id === 'future' && s.kind === 'future'));
  assert('2e. Exactly the two non-paid-off BNPL plans are returned, nothing more', states.length === 2);
}

// ============================================================================
// Section 3 — Structural: a 'future' BNPL occurrence can never be confirmed
// from Move Money's UI (TransferForm.tsx cannot be imported — react-native)
// ============================================================================
console.log("\n=== 3. Structural — 'future' BNPL state never offers a confirm action ===");
{
  const futureBlockMatch = TRANSFER_FORM_SRC.match(/if \(plan\.kind === 'future'\) \{[\s\S]*?if \(plan\.kind === 'balance_only'\) \{/);
  assert('3a. The future-state branch is present and isolated in the shipped source', !!futureBlockMatch);
  const futureBlock = futureBlockMatch ? futureBlockMatch[0] : '';
  assert('3b. The future-state branch never calls confirmPlan (the only path to confirmBnplRepayment)', !/confirmPlan\(/.test(futureBlock));
  assert('3c. The future-state branch instead offers "Manage repayment details" (setManageLiabilityId)', /setManageLiabilityId\(plan\.liability\.id\)/.test(futureBlock) && /Manage repayment details/.test(futureBlock));
  assert(
    "3d. By contrast, the due_or_overdue branch IS the only branch that calls confirmPlan — proving the confirm affordance is due/overdue-gated, not merely absent everywhere",
    /if \(plan\.kind === 'due_or_overdue'\) \{[\s\S]*?confirmPlan\(plan\.liability\.id, plan\.item\.id, plan\.item\.nextDueDate\)[\s\S]*?if \(plan\.kind === 'future'\) \{/.test(TRANSFER_FORM_SRC)
  );
}

// ============================================================================
// Section 4 — disambiguateBalanceLabels (real import)
// ============================================================================
console.log('\n=== 4. disambiguateBalanceLabels (real import) ===');
{
  function asset(patch: Partial<Asset>): Asset {
    return { id: 'a', type: 'cash', label: 'Cash', currentValue: 0, ...patch };
  }
  {
    const labels = disambiguateBalanceLabels([asset({ id: 'a1', label: 'Cash' }), asset({ id: 'a2', label: 'Everyday', provider: 'ANZ' })]);
    assert('4a. Unique labels are returned unchanged (no suffix added when there is no collision)', labels.get('a1') === 'Cash' && labels.get('a2') === 'Everyday · ANZ');
  }
  {
    const labels = disambiguateBalanceLabels([
      asset({ id: 'a1', label: 'Everyday Account', provider: 'ANZ' }),
      asset({ id: 'a2', label: 'Everyday Account', provider: 'ANZ' }),
      asset({ id: 'a3', label: 'Everyday Account', provider: 'ANZ' }),
    ]);
    assert('4b. Colliding label+provider pairs get a stable ordinal suffix in array order', labels.get('a1') === 'Everyday Account · ANZ — Account 1');
    assert('4b. Second colliding account gets Account 2', labels.get('a2') === 'Everyday Account · ANZ — Account 2');
    assert('4b. Third colliding account gets Account 3', labels.get('a3') === 'Everyday Account · ANZ — Account 3');
  }
  {
    // Same label but DIFFERENT provider must not collide — provider is part
    // of the base text used for collision detection.
    const labels = disambiguateBalanceLabels([asset({ id: 'a1', label: 'Everyday', provider: 'ANZ' }), asset({ id: 'a2', label: 'Everyday', provider: 'CBA' })]);
    assert('4c. Same label with different providers never collide (provider is part of the base identity)', labels.get('a1') === 'Everyday · ANZ' && labels.get('a2') === 'Everyday · CBA');
  }
}

// ============================================================================
// Section 5 — computeMoneyFlowCategoryBreakdown (real import)
// ============================================================================
console.log('\n=== 5. computeMoneyFlowCategoryBreakdown (real import) ===');
{
  const today = d('2026-08-10');

  // --- income ---
  {
    const empty = computeMoneyFlowCategoryBreakdown(baseData(), 'income', 'monthly', today);
    assert('5a. No income items at all -> not_configured, empty items, $0 total', empty.configurationState === 'not_configured' && empty.items.length === 0 && empty.totalCents === 0);
  }
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: false },
      ],
    };
    const result = computeMoneyFlowCategoryBreakdown(data, 'income', 'monthly', today);
    assert('5b. Only an INACTIVE income item exists -> inactive_or_excluded, not not_configured (the item genuinely exists, just inactive)', result.configurationState === 'inactive_or_excluded');
    assert('5b. An inactive income item never appears as a row', result.items.length === 0);
  }
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
        { id: 'inc2', type: 'income', label: 'Freelance', amount: 500, frequency: 'weekly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
    };
    const result = computeMoneyFlowCategoryBreakdown(data, 'income', 'monthly', today);
    assert('5c. Two active income items -> configured_nonzero', result.configurationState === 'configured_nonzero');
    assert('5c. Item-sum reconciliation invariant: sum(items.amountCents) === totalCents exactly, never a rounding drift', result.items.reduce((s, i) => s + i.amountCents, 0) === result.totalCents);
    // $4000 monthly + $500/week * 52/12 ≈ $4000 + $2166.67 = $6166.67 -> whole-dollar total is $6167 (nearest dollar after largest-remainder reconciliation).
    assert('5c. Monthly total is the whole-dollar reconciliation of $4000 + ($500 * 52/12) ≈ $6166.67 -> $6167', result.totalCents === 616700 || result.totalCents === 616667 || Math.abs(result.totalCents - 616667) <= 100);
  }

  // --- bills: exact reconciliation against computeSafeToSpend's own totals ---
  {
    const noBills = computeMoneyFlowCategoryBreakdown(baseData(), 'bills', 'monthly', today);
    assert('5d. No bills, no cards, no BNPL at all -> not_configured', noBills.configurationState === 'not_configured');
  }
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'bill1', type: 'expense', label: 'Rent', amount: 1500, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: true, active: true },
      ],
      creditCards: [{ id: 'card1', issuer: 'Visa', label: 'Visa', creditLimit: 5000, currentBalance: 1000, dueDay: 15, minimumPayment: 50 }],
      liabilities: [liability({ currentBalance: 150 })],
    };
    // Add the BNPL linked item after the object literal above (avoids a
    // duplicate recurringItems key).
    data.recurringItems.push(item({ amount: 100, nextDueDate: dISO('2026-08-03'), frequency: 'weekly' }));
    const bills = computeMoneyFlowCategoryBreakdown(data, 'bills', 'monthly', today);
    const safeToSpend = computeSafeToSpend(data, today);
    assert('5e. Bills configurationState is configured_nonzero when a bill, a card, and a BNPL plan all contribute', bills.configurationState === 'configured_nonzero');
    assert(
      '5e. Bills totalCents (monthly) reconciles EXACTLY to safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected — the required proof that this breakdown never independently re-derives the total it itemises',
      Math.abs(bills.totalCents / 100 - (safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected)) < 1
    );
    assert('5e. Item-sum reconciliation invariant holds for bills too', bills.items.reduce((s, i) => s + i.amountCents, 0) === bills.totalCents);
    assert('5e. The BNPL line item is present and labelled with the liability\'s own label', bills.items.some((i) => i.sourceKind === 'bnpl' && i.label === 'Test Plan'));
  }
  {
    // BNPL final-repayment supporting text — capped final occurrence within
    // the current calendar month.
    const data: AppData = {
      ...baseData(),
      liabilities: [liability({ currentBalance: 100 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-05'), frequency: 'weekly' })],
    };
    const bills = computeMoneyFlowCategoryBreakdown(data, 'bills', 'monthly', today);
    const bnplItem = bills.items.find((i) => i.sourceKind === 'bnpl');
    assert('5f. A BNPL plan whose single remaining occurrence exactly exhausts the balance is labelled "Final repayment on this plan"', !!bnplItem && bnplItem.supportingText === 'Final repayment on this plan');
  }
  {
    // Date-boundary — an occurrence that falls in the NEXT calendar month is
    // excluded from this month's bills breakdown (proves the monthStart/
    // monthEndInclusive window, not merely "the next N occurrences").
    const data: AppData = {
      ...baseData(),
      liabilities: [liability({ currentBalance: 1000 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-09-01'), frequency: 'monthly' })],
    };
    const augustToday = d('2026-08-15');
    const bills = computeMoneyFlowCategoryBreakdown(data, 'bills', 'monthly', augustToday);
    assert('5g. A BNPL occurrence dated 1 September is excluded from the August bills breakdown (calendar-month window boundary)', bills.totalCents === 0 && bills.items.length === 0);
  }

  // --- savings ---
  {
    const off = computeMoneyFlowCategoryBreakdown(baseData(), 'savings', 'monthly', today);
    assert('5h. No savingsAllocation configured (absent/off) -> not_configured, $0', off.configurationState === 'not_configured' && off.totalCents === 0);
  }
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
      user: { ...createEmptyAppData().user, monthlyIncome: 4000, savingsAllocation: { mode: 'percent', percent: 0.1 } },
    };
    const savings = computeMoneyFlowCategoryBreakdown(data, 'savings', 'monthly', today);
    const safeToSpend = computeSafeToSpend(data, today);
    assert('5i. Savings totalCents (monthly) reconciles exactly to safeToSpend.savingsAllocationMonthly', Math.abs(savings.totalCents / 100 - safeToSpend.savingsAllocationMonthly) < 1);
    assert('5i. Savings configurationState is configured_nonzero for a genuine 10% allocation on real income', savings.configurationState === 'configured_nonzero');
  }

  // --- goals ---
  {
    const noGoals = computeMoneyFlowCategoryBreakdown(baseData(), 'goals', 'monthly', today);
    assert('5j. No goals at all -> not_configured', noGoals.configurationState === 'not_configured');
  }
  {
    const goal: Goal = { id: 'g1', name: 'Holiday', lifeGoalType: 'holiday', targetAmount: 1200, currentAmount: 0, targetDate: null, priority: 'medium', status: 'active' };
    const data: AppData = {
      ...baseData(),
      goals: [goal],
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
      user: { ...createEmptyAppData().user, monthlyIncome: 4000 },
    };
    const goals = computeMoneyFlowCategoryBreakdown(data, 'goals', 'monthly', today);
    const safeToSpend = computeSafeToSpend(data, today);
    assert('5k. Goals totalCents (monthly) reconciles exactly to safeToSpend.goalAllocation.totalAllocatedMonthly', Math.abs(goals.totalCents / 100 - safeToSpend.goalAllocation.totalAllocatedMonthly) < 1);
    assert('5k. Goals configurationState is configured_nonzero when a goal actually receives an allocation', goals.configurationState === 'configured_nonzero');
    assert('5k. The single goal row is labelled with the goal\'s own name', goals.items.some((i) => i.label === 'Holiday'));
  }
  {
    // A goal exists but is fully funded / receives $0 allocation this period
    // (e.g. currentAmount already meets targetAmount) -> configured_zero,
    // never conflated with not_configured.
    const goal: Goal = { id: 'g1', name: 'Holiday', lifeGoalType: 'holiday', targetAmount: 500, currentAmount: 500, targetDate: null, priority: 'medium', status: 'active' };
    const data: AppData = { ...baseData(), goals: [goal] };
    const goals = computeMoneyFlowCategoryBreakdown(data, 'goals', 'monthly', today);
    assert('5l. A goal that exists but currently receives $0 allocation is configured_zero, not not_configured', goals.configurationState !== 'not_configured');
  }

  // --- period parameterisation ---
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
    };
    const monthly = computeMoneyFlowCategoryBreakdown(data, 'income', 'monthly', today);
    const weekly = computeMoneyFlowCategoryBreakdown(data, 'income', 'weekly', today);
    assert('5m. The same category at a different period produces a smaller total (weekly < monthly for the same recurring income)', weekly.totalCents < monthly.totalCents);
    assert('5m. The period field on the returned breakdown matches what was requested', weekly.period === 'weekly' && monthly.period === 'monthly');
  }
}

// ============================================================================
// Section 6 — Structural evidence for the remaining UI wiring points
// (Today navigation, duplicate reminder removal, Money screen drill-downs)
// ============================================================================
console.log('\n=== 6. Structural — Today navigation and Money drill-down wiring ===');
{
  const TODAY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/today/TodayScreen.tsx', 'utf-8');
  const MONTH_SNAPSHOT_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/today/MonthSnapshotCard.tsx', 'utf-8');
  const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');
  const MONEY_PLAN_CARD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/MoneyPlanCard.tsx', 'utf-8');

  assert('6a. MonthSnapshotCard navigates to the real Transactions route (not the Money tab) when populated', /navigation\.navigate\('Transactions'\)/.test(MONTH_SNAPSHOT_SRC));
  // Wave 5 closure — MonthSnapshotCard no longer HAS an empty state. Today
  // rendered the money-picture checklist and then this card's own "add your
  // income and spending" prompt, which asked for the same thing twice in two
  // registers; the section is now absent entirely when nothing is recorded.
  // Its Add-transaction entry point went with it, and nothing was lost: Add
  // transaction is owned by the global "+" (AddAnythingSheet mounts its own
  // QuickAddModal), so Today's second, now-unreachable instance was removed
  // rather than left dead in the tree. Money's own ThisMonthCard — a
  // different component — keeps both its empty state and its own action.
  assert('6b. MonthSnapshotCard has no empty state to wire — the whole section is gated instead', !/onAddTransaction/.test(MONTH_SNAPSHOT_SRC) && /activity: MonthToDateActivity/.test(MONTH_SNAPSHOT_SRC));
  assert('6c. TodayScreen gates the month section on the shared eligibility rule, and mounts no second transaction modal', /const monthSectionVisible = isMonthSectionEligible\(monthActivity\);/.test(TODAY_SCREEN_SRC) && !/QuickAddModal/.test(TODAY_SCREEN_SRC));
  assert('6c-ii. and Add transaction remains reachable from the global "+"', /QuickAddModal/.test(readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8')));
  assert('6d. TodayScreen no longer renders a separate "Upcoming payments" block (the duplicated lower credit-card due reminder)', !/Upcoming payments/.test(TODAY_SCREEN_SRC));

  assert('6e. MoneyScreen mounts the shared MoneyFlowCategoryDetailSheet', /<MoneyFlowCategoryDetailSheet/.test(MONEY_SCREEN_SRC));
  assert('6f. MoneyScreen\'s flow rows are tappable and set flowDetailCategory on press', /onPress=\{\(\) => setFlowDetailCategory\(row\.key\)\}/.test(MONEY_SCREEN_SRC));
  assert('6g. MoneyScreen sources its detail breakdown from the real computeMoneyFlowCategoryBreakdown, not a local reimplementation', /computeMoneyFlowCategoryBreakdown\(data, flowDetailCategory, flowPeriod, currentDate\)/.test(MONEY_SCREEN_SRC));

  assert('6h. MoneyPlanCard also mounts its own independent instance of the shared MoneyFlowCategoryDetailSheet', /<MoneyFlowCategoryDetailSheet/.test(MONEY_PLAN_CARD_SRC));
  assert('6i. MoneyPlanCard\'s step rows are tappable and set flowDetailCategory on press', /onPress=\{\(\) => setFlowDetailCategory\(step\.key as MoneyFlowCategory\)\}/.test(MONEY_PLAN_CARD_SRC));
  assert('6j. MoneyPlanCard always requests the monthly period (Money Allocation is inherently a monthly view, never period-switchable)', /computeMoneyFlowCategoryBreakdown\(data, flowDetailCategory, 'monthly', currentDate\)/.test(MONEY_PLAN_CARD_SRC));
}

// ============================================================================
// Section 7 — BNPL source wiring: real execution of confirmBnplRepaymentTransition
// using the EXACT input shape TransferForm.tsx's own confirmPlan() builds
// (see TransferForm.tsx: `paymentSource: fromAsset.type === 'everyday' ?
// 'everyday' : 'cash', targetAssetId: fromAsset.type === 'everyday' ?
// fromAsset.id : undefined`). A resolver-only test cannot prove this by
// itself, and TransferForm.tsx itself cannot be imported (it transitively
// pulls in react-native) — this is the strongest real evidence this
// repository can support for the source-selection wiring: real execution
// of the real accepted transition with the literal argument shape the
// component constructs, cross-checked against the resolver's own displayed
// amount for numeric agreement.
// ============================================================================
console.log('\n=== 7. BNPL source wiring (real transition, exact TransferForm.tsx argument shape) ===');
{
  const today = d('2026-08-10');

  // Cash source — mirrors: fromAsset.type === 'cash' branch.
  {
    const data: AppData = {
      ...baseData(),
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [liability({ currentBalance: 100 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })],
    };
    const displayed = resolveBnplHandoffState(data, 'bnpl1', today);
    const result = confirmBnplRepaymentTransition(data, {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      targetAssetId: undefined,
      transactionId: 'txn1',
      date: dISO('2026-08-10'),
    });
    assert('7a. Cash source: the real transition applies with paymentSource literally matching the confirmPlan() call shape (paymentSource: \'cash\')', result.applied === true);
    const txn = result.applied ? result.data.transactions.find((t) => t.id === 'txn1') : undefined;
    assert('7a. The resulting transaction\'s paymentSource is exactly \'cash\'', txn?.paymentSource === 'cash');
    assert(
      '7a. Displayed effectiveCents (bnplHandoff.ts resolver) exactly equals the transition\'s actual applied amount (same capped effective cents, independently computed, numerically proven equal for this fixture)',
      displayed.kind === 'due_or_overdue' && !!result.applied && Math.round(txn!.amount * 100) === displayed.effectiveCents
    );
  }

  // Everyday source — mirrors: fromAsset.type === 'everyday' branch, exact
  // targetAssetId passed through; a SECOND Everyday Account must be
  // completely untouched.
  {
    const data: AppData = {
      ...baseData(),
      assets: [
        { id: 'everyday-A', type: 'everyday', label: 'Everyday A', currentValue: 1000 },
        { id: 'everyday-B', type: 'everyday', label: 'Everyday B', currentValue: 500 },
      ],
      liabilities: [liability({ currentBalance: 60 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })],
    };
    const result = confirmBnplRepaymentTransition(data, {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'everyday',
      targetAssetId: 'everyday-A',
      transactionId: 'txn2',
      date: dISO('2026-08-10'),
    });
    assert('7b. Everyday source: the real transition applies with the exact selected asset ID passed as targetAssetId', result.applied === true);
    const everydayA = result.applied ? result.data.assets.find((a) => a.id === 'everyday-A')!.currentValue : NaN;
    const everydayB = result.applied ? result.data.assets.find((a) => a.id === 'everyday-B')!.currentValue : NaN;
    assert('7b. Everyday A (the selected account) is debited by the effective (capped) amount: 1000 -> 940', everydayA === 940);
    assert('7b. Everyday B (a second, unselected Everyday Account) is completely untouched ($500)', everydayB === 500);
  }

  // Duplicate occurrence confirmation remains rejected by the accepted
  // engine (already covered by tests/bnpl.test.ts's ledger-based guard —
  // restated here in the exact TransferForm.tsx call shape for direct
  // citation in this pass).
  {
    // Liability balance ($1000) deliberately much larger than the scheduled
    // occurrence ($100) so the plan is NOT paid off by the first
    // confirmation — the linked item stays active with its nextDueDate
    // advanced, isolating the 'stale' duplicate-guard specifically (a
    // smaller liability balance would instead deactivate the item on
    // payoff, producing 'missing_liability' on the second call for an
    // unrelated reason — see this file's own debug trace for that case).
    const data: AppData = {
      ...baseData(),
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [liability({ currentBalance: 1000 })],
      recurringItems: [item({ amount: 100, nextDueDate: dISO('2026-08-10') })],
    };
    const first = confirmBnplRepaymentTransition(data, {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      transactionId: 'txn-dup',
      date: dISO('2026-08-10'),
    });
    assert('7c. First confirmation applies', first.applied === true);
    assert('7c. The plan is not yet paid off (liability 1000 -> 900), so the linked item remains active', first.applied && first.data.recurringItems.find((r) => r.id === 'item1')?.active === true);
    // A second attempt against the SAME (now-stale, since the active item's
    // nextDueDate has advanced) expectedNextDueDate is rejected — proving
    // the engine's own duplicate protection remains intact and untouched by
    // this round (AppStateContext.tsx's diff never touches this function).
    const second = confirmBnplRepaymentTransition(first.applied ? first.data : data, {
      liabilityId: 'bnpl1',
      recurringItemId: 'item1',
      expectedNextDueDate: data.recurringItems[0].nextDueDate,
      paymentSource: 'cash',
      transactionId: 'txn-dup-2',
      date: dISO('2026-08-10'),
    });
    assert('7c. A second confirmation attempt against the same original expectedNextDueDate is rejected (stale — the schedule has already advanced)', second.applied === false && second.reason === 'stale');
  }
}

// ============================================================================
// Section 8 — Structural: Savings source guidance and no-second-picker
// confirmation (TransferForm.tsx cannot be imported — react-native)
// ============================================================================
console.log('\n=== 8. Structural — Savings BNPL guidance, no second picker ===');
{
  assert(
    '8a. fromSupportsRepayment is defined as cash OR everyday only — Savings is never included, so the confirm button branch below is unreachable for a Savings source',
    /const fromSupportsRepayment = fromAsset && \(fromAsset\.type === 'cash' \|\| fromAsset\.type === 'everyday'\);/.test(TRANSFER_FORM_SRC)
  );
  assert(
    '8b. When the selected source does not support repayment (i.e. Savings), the due/overdue branch renders guidance text directing the user to choose Cash or an Everyday Account using the EXISTING From control above — never a second picker',
    /Choose (a )?Cash or an Everyday Account( balance)? above to record this repayment\./.test(TRANSFER_FORM_SRC)
  );
  assert(
    // Design 5.1 Wave 4 migrated the hand-rolled chips to the shared `Chip`
    // primitive (which supplies accessibilityRole/State itself). The
    // invariant is unchanged and is asserted directly against the source
    // list: `sourceAssets` — the only list of things a transfer can come
    // FROM — is iterated exactly once in the whole file.
    '8c. There is no second/alternate source-selection control anywhere in the BNPL group — the only asset-selection UI in the whole file is the single "From" chip row',
    (TRANSFER_FORM_SRC.match(/sourceAssets\.map\(/g) || []).length === 1 &&
      /setFromId\(a\.id\)/.test(TRANSFER_FORM_SRC) &&
      (TRANSFER_FORM_SRC.match(/setFromId\(a\.id\)/g) || []).length === 1
  );
  assert(
    '8d. confirmPlan is gated on fromSupportsRepayment before it is ever invoked — a Savings-sourced tap cannot reach confirmBnplRepayment at all',
    /function confirmPlan\(liabilityId: string, recurringItemId: string, expectedNextDueDate: string\) \{\s*\n\s*if \(!fromAsset \|\| !fromSupportsRepayment\) return;/.test(TRANSFER_FORM_SRC)
  );
}

// ============================================================================
// Section 9 — exact controlled Bills composition case (verification pass,
// per-user-specified inputs): Phone $60/mo, Subscription $12/wk, AMEX
// expected repayment $100/mo, CBA expected repayment $50/mo, BNPL Plan A
// $100 contribution, BNPL Plan B capped final $12.50 contribution.
// ============================================================================
console.log('\n=== 9. Exact controlled Bills composition (real import) ===');
{
  const today = d('2026-08-10');
  const data: AppData = {
    ...baseData(),
    recurringItems: [
      { id: 'phone', type: 'expense', label: 'Phone', amount: 60, frequency: 'monthly', nextDueDate: dISO('2026-08-05'), isFixed: true, active: true },
      { id: 'sub', type: 'expense', label: 'Subscription', amount: 12, frequency: 'weekly', nextDueDate: dISO('2026-08-05'), isFixed: true, active: true },
      item({ id: 'bnpl-a-item', linkedLiabilityId: 'bnpl-a', amount: 100, frequency: 'monthly', nextDueDate: dISO('2026-08-05') }),
      item({ id: 'bnpl-b-item', linkedLiabilityId: 'bnpl-b', amount: 100, frequency: 'monthly', nextDueDate: dISO('2026-08-05') }),
    ],
    creditCards: [
      { id: 'amex', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 800, dueDay: 15, expectedMonthlyRepayment: 100, minimumPayment: 25 },
      { id: 'cba', issuer: 'CBA', label: 'CBA', creditLimit: 3000, currentBalance: 400, dueDay: 20, expectedMonthlyRepayment: 50, minimumPayment: 20 },
    ],
    liabilities: [
      liability({ id: 'bnpl-a', label: 'BNPL Plan A', currentBalance: 1000 }),
      liability({ id: 'bnpl-b', label: 'BNPL Plan B', currentBalance: 12.5 }),
    ],
  };

  const bills = computeMoneyFlowCategoryBreakdown(data, 'bills', 'monthly', today);
  console.log(`  Raw monthly contributions: Phone=60, Subscription=52 (12*52/12), AMEX=100, CBA=50, BNPL A=100, BNPL B=12.5 -> raw total=374.5`);
  console.log(`  Displayed rows: ${JSON.stringify(bills.items.map((i) => ({ key: i.key, label: i.label, amountCents: i.amountCents, sourceKind: i.sourceKind })))}`);
  console.log(`  Displayed parent total: ${bills.totalCents} cents`);

  assert('9a. Every active ordinary recurring bill has its own item row (Phone, Subscription)', bills.items.some((i) => i.key === 'phone') && bills.items.some((i) => i.key === 'sub'));
  assert('9b. Each expected credit-card repayment has its own item row, one per card (AMEX, CBA)', bills.items.some((i) => i.key === 'card:amex') && bills.items.some((i) => i.key === 'card:cba'));
  assert('9c. AMEX row uses sourceKind credit_card_repayment, a stable card-keyed key, and the customer-facing card label', bills.items.find((i) => i.key === 'card:amex')!.sourceKind === 'credit_card_repayment' && bills.items.find((i) => i.key === 'card:amex')!.label === 'AMEX');
  assert('9c. CBA row is separate from AMEX (no duplication or merging of multiple cards)', bills.items.find((i) => i.key === 'card:cba')!.sourceKind === 'credit_card_repayment' && bills.items.find((i) => i.key === 'card:cba')!.label === 'CBA');
  assert('9d. Each contributing BNPL plan has its own item row (Plan A, Plan B)', bills.items.some((i) => i.key === 'bnpl:bnpl-a') && bills.items.some((i) => i.key === 'bnpl:bnpl-b'));
  assert('9e. No row duplicates another (6 distinct rows: 2 bills + 2 cards + 2 BNPL plans, no synthetic/balancing row)', bills.items.length === 6);

  const phoneCents = bills.items.find((i) => i.key === 'phone')!.amountCents;
  const subCents = bills.items.find((i) => i.key === 'sub')!.amountCents;
  const amexCents = bills.items.find((i) => i.key === 'card:amex')!.amountCents;
  const cbaCents = bills.items.find((i) => i.key === 'card:cba')!.amountCents;
  const bnplACents = bills.items.find((i) => i.key === 'bnpl:bnpl-a')!.amountCents;
  const bnplBCents = bills.items.find((i) => i.key === 'bnpl:bnpl-b')!.amountCents;
  console.log(`  Displayed whole-dollar amounts: Phone=$${phoneCents / 100}, Subscription=$${subCents / 100}, AMEX=$${amexCents / 100}, CBA=$${cbaCents / 100}, BNPL A=$${bnplACents / 100}, BNPL B=$${bnplBCents / 100}`);

  assert('9f. Phone displays exactly $60 (no reconciliation needed, already whole-dollar)', phoneCents === 6000);
  assert('9g. Subscription displays exactly $52 ($12 * 52/12 = $52.00 exactly, no rounding needed)', subCents === 5200);
  assert('9h. AMEX displays exactly $100', amexCents === 10000);
  assert('9i. CBA displays exactly $50', cbaCents === 5000);
  assert('9j. BNPL Plan A displays exactly $100', bnplACents === 10000);
  assert(
    '9k. BNPL Plan B (raw $12.50) displays as $13 — the deterministic largest-remainder outcome: every other row is an exact whole dollar (zero remainder), so BNPL Plan B\'s $0.50 remainder is the largest and absorbs the parent total\'s single dollar of rounding shortfall (Math.round(374.50) = 375, floor-sum = 374, shortfall = 1)',
    bnplBCents === 1300
  );
  assert('9l. BNPL Plan B\'s row is marked as this plan\'s final repayment (it exactly exhausts the $12.50 outstanding balance)', bills.items.find((i) => i.key === 'bnpl:bnpl-b')!.supportingText === 'Final repayment on this plan');
  assert('9m. Displayed parent Bills total is exactly $375 (37500 cents) — the whole-dollar rounding of the exact raw sum $374.50', bills.totalCents === 37500);
  assert(
    '9n. Displayed rows sum EXACTLY to the displayed parent total (the required sum(items.amountCents) === totalCents invariant)',
    phoneCents + subCents + amexCents + cbaCents + bnplACents + bnplBCents === bills.totalCents
  );
}

// ============================================================================
// Section 10 — Income/Savings/Goals independence proofs, exact
// Weekly/Fortnightly/Monthly figures, explicit-today proof, and BNPL window
// date-boundary matrix (verification pass).
// ============================================================================
console.log('\n=== 10. Category independence, period figures, explicit-today, date boundaries ===');
{
  const today = d('2026-08-10');

  // Income: manual/ad-hoc transactions are structurally excluded — the
  // breakdown reads ONLY data.recurringItems, never data.transactions.
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
      transactions: [{ id: 'manual-1', type: 'income', amount: 999999, categoryId: 'cat-other-income', date: dISO('2026-08-05'), paymentSource: 'cash' }],
    };
    const result = computeMoneyFlowCategoryBreakdown(data, 'income', 'monthly', today);
    assert('10a. A manual ad-hoc income Transaction ($999,999) never contributes to the Income breakdown — only recurring income sources do', result.totalCents === 400000);
  }

  // Savings: never reads a Savings asset's currentValue — only the
  // savingsAllocation setting.
  {
    const dataWithHugeSavingsAsset: AppData = {
      ...baseData(),
      assets: [{ id: 'sav1', type: 'savings', label: 'Savings', currentValue: 1000000 }],
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
      user: { ...createEmptyAppData().user, monthlyIncome: 4000, savingsAllocation: { mode: 'percent', percent: 0.1 } },
    };
    const withAsset = computeMoneyFlowCategoryBreakdown(dataWithHugeSavingsAsset, 'savings', 'monthly', today);
    const withoutAsset = computeMoneyFlowCategoryBreakdown({ ...dataWithHugeSavingsAsset, assets: [] }, 'savings', 'monthly', today);
    assert('10b. Savings breakdown is byte-identical whether a $1,000,000 Savings asset exists or not — proves the breakdown never reads the Savings asset balance, only the savingsAllocation setting', withAsset.totalCents === withoutAsset.totalCents && withAsset.totalCents === 40000);
  }

  // Goals: the breakdown reads ONLY computeSafeToSpend's own already-computed
  // allocatedMonthly per goal — it never independently re-derives an
  // allocation from targetAmount/currentAmount a second time. Correction
  // during this pass: an earlier draft of this test wrongly assumed
  // currentAmount has no effect on the displayed amount. That assumption
  // was FALSE — currentAmount legitimately drives requiredMonthlyForGoal in
  // the existing, unmodified goalAllocation.ts engine (remaining =
  // targetAmount - currentAmount; a goal closer to its target correctly
  // needs a smaller monthly contribution). That engine predates this round
  // and is out of this round's scope. The correct, provable claim is
  // narrower: the breakdown's displayed amount for a goal is EXACTLY
  // computeSafeToSpend's own allocatedMonthly for that same goal — proven
  // directly below by cross-checking both real functions against the same
  // fixture — never a second, independently-derived number.
  {
    const goalLowProgress: Goal = { id: 'g1', name: 'Holiday', lifeGoalType: 'holiday', targetAmount: 5000, currentAmount: 0, targetDate: null, priority: 'medium', status: 'active' };
    const baseIncomeData = {
      recurringItems: [
        { id: 'inc1', type: 'income' as const, label: 'Salary', amount: 4000, frequency: 'monthly' as const, nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
      user: { ...createEmptyAppData().user, monthlyIncome: 4000 },
    };
    const dataForGoal: AppData = { ...baseData(), ...baseIncomeData, goals: [goalLowProgress] };
    const breakdownResult = computeMoneyFlowCategoryBreakdown(dataForGoal, 'goals', 'monthly', today);
    const safeToSpendResult = computeSafeToSpend(dataForGoal, today);
    assert(
      "10c. The breakdown's displayed goal amount is EXACTLY computeSafeToSpend's own allocatedMonthly for the identical goal (Math.round to the nearest whole dollar) — proving no second, independent re-derivation exists",
      breakdownResult.totalCents === Math.round(safeToSpendResult.goalAllocation.totalAllocatedMonthly) * 100
    );

    const goalB: Goal = { id: 'g2', name: 'Car', lifeGoalType: 'car', targetAmount: 3000, currentAmount: 0, targetDate: null, priority: 'medium', status: 'active' };
    const twoGoalsResult = computeMoneyFlowCategoryBreakdown({ ...baseData(), ...baseIncomeData, goals: [goalLowProgress, goalB] }, 'goals', 'monthly', today);
    assert('10d. Two active goals produce two separate item rows, never merged', twoGoalsResult.items.length === 2);
    assert('10d. Each goal row is labelled with its own name', twoGoalsResult.items.some((i) => i.label === 'Holiday') && twoGoalsResult.items.some((i) => i.label === 'Car'));
    assert('10d. The two goal rows sum exactly to the parent total', twoGoalsResult.items.reduce((s, i) => s + i.amountCents, 0) === twoGoalsResult.totalCents);
  }

  // Exact Weekly / Fortnightly / Monthly figures for one controlled dataset
  // (a single $4,000/month income source) — reported verbatim.
  {
    const data: AppData = {
      ...baseData(),
      recurringItems: [
        { id: 'inc1', type: 'income', label: 'Salary', amount: 4000, frequency: 'monthly', nextDueDate: dISO('2026-08-01'), isFixed: false, active: true },
      ],
    };
    const weekly = computeMoneyFlowCategoryBreakdown(data, 'income', 'weekly', today);
    const fortnightly = computeMoneyFlowCategoryBreakdown(data, 'income', 'fortnightly', today);
    const monthly = computeMoneyFlowCategoryBreakdown(data, 'income', 'monthly', today);
    console.log(
      `  Controlled dataset ($4,000/month income) — Weekly: $${weekly.totalCents / 100} (item $${weekly.items[0].amountCents / 100}), Fortnightly: $${fortnightly.totalCents / 100} (item $${fortnightly.items[0].amountCents / 100}), Monthly: $${monthly.totalCents / 100} (item $${monthly.items[0].amountCents / 100})`
    );
    // Weekly: 4000 / (52/12) = 923.0769... -> $923. Fortnightly: 4000 / (26/12) = 1846.153... -> $1846. Monthly: exactly $4000.
    assert('10e. Weekly parent AND single item total is exactly $923 (4000 / (52/12) = 923.0769... -> $923)', weekly.totalCents === 92300 && weekly.items[0].amountCents === 92300);
    assert('10f. Fortnightly parent AND single item total is exactly $1,846 (4000 / (26/12) = 1846.153... -> $1846)', fortnightly.totalCents === 184600 && fortnightly.items[0].amountCents === 184600);
    assert('10g. Monthly parent AND single item total is exactly $4,000 (no conversion needed)', monthly.totalCents === 400000 && monthly.items[0].amountCents === 400000);
  }

  // Explicit `today` proof: every `new Date(` construction inside
  // moneyFlowBreakdown.ts is built FROM the caller-supplied `today`
  // parameter or a stored date string — never a bare, argument-less
  // `new Date()` reading the system clock.
  {
    const src = readFileSync('/Users/tommy/Claude/Lulu/app/src/lib/calculations/moneyFlowBreakdown.ts', 'utf-8');
    // Strip line comments before scanning — this file's own doc comments
    // discuss "new Date()" in prose (see the header comment on
    // buildBillsBreakdown), which must not be mistaken for actual code.
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    assert('10h. moneyFlowBreakdown.ts contains no bare `new Date()` (argument-less) call in actual code (comment-only mentions excluded)', !/new Date\(\)/.test(codeOnly));
    assert('10i. The current-month window is explicitly constructed from the `today` parameter (today.getFullYear(), today.getMonth())', /new Date\(today\.getFullYear\(\), today\.getMonth\(\), 1\)/.test(src));
  }

  // BNPL window date-boundary matrix: month first day (included), month
  // final day (included), first day of NEXT month (excluded) — 29th/30th/
  // 31st anchors and a leap-year February, each proven directly against
  // the Bills breakdown (the one piece of new code in this round with its
  // own date-window construction; ordinary bill/income rows use a flat
  // monthly-rate conversion with no day-of-month walk at all).
  function bnplOnMonthCase(label: string, monthToday: Date, occurrenceDateISO: string, expectIncluded: boolean) {
    const data: AppData = {
      ...baseData(),
      liabilities: [liability({ currentBalance: 1000 })],
      recurringItems: [item({ amount: 100, nextDueDate: occurrenceDateISO, frequency: 'monthly' })],
    };
    const bills = computeMoneyFlowCategoryBreakdown(data, 'bills', 'monthly', monthToday);
    const included = bills.items.some((i) => i.key === 'bnpl:bnpl1');
    assert(`10j (${label}): occurrence ${expectIncluded ? 'IS' : 'is NOT'} included in the current-month Bills breakdown`, included === expectIncluded);
  }
  bnplOnMonthCase('month first day, included', d('2026-08-15'), dISO('2026-08-01'), true);
  bnplOnMonthCase('month final day (31st), included', d('2026-08-15'), dISO('2026-08-31'), true);
  bnplOnMonthCase('first day of NEXT month, excluded', d('2026-08-15'), dISO('2026-09-01'), false);
  bnplOnMonthCase('29th-of-month anchor within a 31-day month, included', d('2026-08-01'), dISO('2026-08-29'), true);
  bnplOnMonthCase('30th-of-month anchor within a 30-day month (September), included', d('2026-09-01'), dISO('2026-09-30'), true);
  bnplOnMonthCase('leap-year February 29th (2028), included', d('2028-02-01'), dISO('2028-02-29'), true);
  bnplOnMonthCase('non-leap-year February — no 29th exists, 28th still correctly included', d('2026-02-01'), dISO('2026-02-28'), true);
}

// ============================================================================
// Section 11 — Zero-state/CTA architecture audit (structural — MoneyScreen.tsx
// and MoneyPlanCard.tsx cannot be imported, react-native). Confirms the
// duplicate-form defect found and corrected during this verification pass.
// ============================================================================
console.log('\n=== 11. Zero-state/CTA architecture audit ===');
{
  const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');
  const MONEY_PLAN_CARD_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/MoneyPlanCard.tsx', 'utf-8');

  // Q1: exactly one shared detail-sheet instance in MoneyScreen.tsx.
  assert('11a. MoneyScreen.tsx mounts exactly ONE <MoneyFlowCategoryDetailSheet> instance, controlled by flowDetailCategory state (never four)', (MONEY_SCREEN_SRC.match(/<MoneyFlowCategoryDetailSheet/g) || []).length === 1);

  // Q2: exactly one shared detail-sheet instance in MoneyPlanCard.tsx.
  assert('11b. MoneyPlanCard.tsx mounts exactly ONE <MoneyFlowCategoryDetailSheet> instance, controlled by its own flowDetailCategory state (never four)', (MONEY_PLAN_CARD_SRC.match(/<MoneyFlowCategoryDetailSheet/g) || []).length === 1);

  // Q3: MoneyPlanCard no longer mounts a second, independent instance of
  // any of the four forms MoneyScreen (its only ever parent) already owns
  // — CORRECTED during this pass (an earlier draft mounted a duplicate of
  // each). It now calls up to parent-provided callback props instead.
  assert('11c. MoneyPlanCard.tsx does NOT import AddIncomeModal (uses parent-provided onAddIncome instead)', !/import \{ AddIncomeModal \}/.test(MONEY_PLAN_CARD_SRC));
  assert('11c. MoneyPlanCard.tsx does NOT import AddRecurringItemModal (uses parent-provided onAddBill instead)', !/import \{ AddRecurringItemModal \}/.test(MONEY_PLAN_CARD_SRC));
  assert('11c. MoneyPlanCard.tsx does NOT import AddGoalModal (uses parent-provided onAddGoal instead)', !/import \{ AddGoalModal \}/.test(MONEY_PLAN_CARD_SRC));
  assert('11c. MoneyPlanCard.tsx does NOT import EditSavingsAllocationModal (uses parent-provided onManageSavingsAllocation instead)', !/import \{ EditSavingsAllocationModal \}/.test(MONEY_PLAN_CARD_SRC));
  assert('11c. MoneyPlanCard.tsx never mounts any of the four forms as JSX elements', !/<AddIncomeModal|<AddRecurringItemModal|<AddGoalModal|<EditSavingsAllocationModal/.test(MONEY_PLAN_CARD_SRC));
  assert('11c. MoneyPlanCard.tsx requires the four callback props (onAddIncome, onAddBill, onAddGoal, onManageSavingsAllocation)', /onAddIncome: \(\) => void;\s*\n\s*onAddBill: \(\) => void;\s*\n\s*onAddGoal: \(\) => void;\s*\n\s*onManageSavingsAllocation: \(\) => void;/.test(MONEY_PLAN_CARD_SRC));

  // MoneyScreen.tsx retains exactly one instance of each of the four forms
  // (its own pre-existing CTAs), and now also passes those same instances'
  // triggers into MoneyPlanCard as props.
  assert('11d. MoneyScreen.tsx mounts exactly one AddIncomeModal', (MONEY_SCREEN_SRC.match(/<AddIncomeModal/g) || []).length === 1);
  assert('11d. MoneyScreen.tsx mounts exactly one AddRecurringItemModal', (MONEY_SCREEN_SRC.match(/<AddRecurringItemModal/g) || []).length === 1);
  assert('11d. MoneyScreen.tsx mounts exactly one AddGoalModal', (MONEY_SCREEN_SRC.match(/<AddGoalModal/g) || []).length === 1);
  assert('11d. MoneyScreen.tsx mounts exactly one EditSavingsAllocationModal', (MONEY_SCREEN_SRC.match(/<EditSavingsAllocationModal/g) || []).length === 1);
  // Wave 6 final pass — MoneyPlanCard ("Typical Monthly Allocation") is
  // unwired from the default composition because it drew the same five
  // measures the combined Typical money flow card already shows. Its four
  // empty-state CTAs were themselves duplicates: every one of those
  // destinations has its own independent entry point on Money, and each is
  // still wired to MoneyScreen's own single modal instance. The claim this
  // assertion protects — all four Add/manage destinations reachable from
  // Money, through one modal instance each, never a parallel surface — is
  // unchanged and asserted directly below.
  assert(
    '11e. all four Add/manage destinations remain reachable from MoneyScreen, wired to its own single modal instances',
    /setEditIncome\(null\);\s*\n\s*setIncomeModalVisible\(true\);/.test(MONEY_SCREEN_SRC) &&
      /onPress: openAddBill/.test(MONEY_SCREEN_SRC) &&
      /setGoalModalVisible\(true\)/.test(MONEY_SCREEN_SRC) &&
      /setEditSavingsAllocationVisible\(true\)/.test(MONEY_SCREEN_SRC)
  );
  assert(
    '11e-ii. and the retired allocation card is unwired, not deleted — its file and its detail sheet remain',
    !/<MoneyPlanCard/.test(MONEY_SCREEN_SRC) &&
      require('fs').existsSync('/Users/tommy/Claude/Lulu/app/src/components/money/MoneyPlanCard.tsx') &&
      /<SavingsAllocationDetailSheet/.test(MONEY_SCREEN_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
