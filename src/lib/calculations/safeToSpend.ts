import { AppData, PayFrequency } from '../../types/models';
import { computeGoalAllocation, GoalAllocationResult } from './goalAllocation';
import { toMonthlyAmount } from './incomeEngine';
import { computeMoneyAvailableBalances, listMoneyAvailableAccounts, resolveIncludeInMoneyCalculations } from './liquidAssets';
import { computeAdHocIncome } from './monthlySummary';
import { recurringOccurrencesInRange } from './recurringSchedule';
import { daysUntilDue, resolveExpectedMonthlyRepayment } from './creditHealth';
import { resolveSavingsAllocationMonthly } from './savingsAllocation';

export interface SafeToSpendResult {
  discretionaryPool: number;
  remainingPool: number;
  daysRemaining: number;
  dailyAllowance: number;
  cycleStart: Date;
  cycleEnd: Date;
  fixedExpensesMonthly: number;
  goalContributionsMonthly: number;
  /** The user's own chosen savings allocation, resolved via
   * resolveSavingsAllocationMonthly — $0 unless the user has explicitly
   * turned it on (PRD ask: no automatic percentage). A forecasting input
   * only; never read by Lulu Score's Recorded Cashflow, Emergency Buffer,
   * or Wealth Assets Recorded factors, which use actual recorded activity
   * or balances instead. */
  savingsAllocationMonthly: number;
  /** Per-goal breakdown of what's funded vs. requested, in priority order
   * (PRD ask: never silently ignore a goal, and multi-goal math must be
   * transparent). */
  goalAllocation: GoalAllocationResult;
  /** Expenses logged with today's date — what's driving today's plan vs.
   * actual (PRD ask: Safe to Spend should react to spending as it happens). */
  todaysSpend: number;
  /** What today's allowance would have been without today's spend — the
   * "before" figure the reactive messaging compares against. */
  plannedDailyAllowance: number;
  /** Total expense transactions logged so far this cycle — a named field
   * for the "how Lulu calculated this" breakdown, rather than making
   * callers reverse-engineer it from discretionaryPool - remainingPool.
   * Includes every payment source (cash, credit card, loan, other) — a
   * measure of total spending activity regardless of what it was funded
   * from, used by Lulu Score's Spending Control factor. NOT scoped to what
   * actually reduced `includedMoneyBalance` — see `cashVariableSpendSoFar`
   * below for that. */
  spendSoFarThisCycle: number;
  /** The subset of `spendSoFarThisCycle` that actually reduced the balance
   * represented in `includedMoneyBalance` — i.e. expenses with
   * `paymentSource` unset or `'cash'`, and only counted at all if the
   * single Cash asset those expenses move (`applyTransactionEffect` in
   * AppStateContext, `data.assets.find(a => a.type === 'cash')`) both
   * exists and is itself currently included in Money calculations. Credit
   * card, loan, and 'other'-sourced expenses never reduce
   * `includedMoneyBalance` (they grow a separate liability, or nothing),
   * so they're excluded here even though they're part of
   * `spendSoFarThisCycle`. Data-model limitation: a Transaction doesn't
   * record which specific asset it affected — this is inferred
   * structurally from `paymentSource` plus "is there an included Cash
   * asset," the most precise scope the current model supports. Exists so
   * Available Until Payday's hero can reconstruct "the cash position
   * before this cycle's recorded spending" without over-crediting spend
   * that never touched the cash it's measuring (PRD bug report: a
   * commitments-only shortfall with $250 of credit-card spending was
   * misclassified as a recorded-spending overrun, because
   * `spendSoFarThisCycle` counted the credit-card spend even though it
   * never reduced `includedMoneyBalance`). Never used for
   * `spendSoFarThisCycle`, Spending Tracker, Monthly Snapshot, or Navilo
   * Score — those intentionally keep reading total activity regardless of
   * funding source. */
  cashVariableSpendSoFar: number;
  /** True only when the user has an actual confirmed next-payday date.
   * Everything else (irregular income, or a regular income with no date
   * yet entered) must never present a daily figure as if a real payday
   * cycle backs it (PRD ask, §4: "do not invent one"). */
  hasKnownPayday: boolean;

  // --- Available Until Payday: the real dated cash-flow view (PRD ask,
  // §1). Everything above stays a monthly-rate figure — Money Flow, Money
  // Plan/End of Month Outlook, and Lulu Score's surplus-ratio checks are
  // genuinely monthly-scoped and must keep reconciling with each other
  // exactly as before. These fields are the ones "Available Until Payday"
  // and its breakdown sheet should actually read. ---
  /** Only the cash/savings balances the user has confirmed (or defaulted,
   * per `resolveIncludeInMoneyCalculations`) as available for everyday
   * spending (`computeMoneyAvailableBalances`) — the actual starting point
   * "Available Until Payday" counts down from. Deliberately NOT the same
   * as `computeLiquidCash`'s total wealth reading: a savings balance can
   * be real, recorded wealth (Net Wealth, Wealth Map, Emergency Fund
   * coverage) without being available for bills (PRD bug report: a house
   * deposit or reserved savings balance was being silently treated as
   * spendable). Every income/expense transaction the user has ever logged
   * against an included account already moved this balance in real time
   * (AppStateContext's `applyTransactionEffect` auto-syncs the Cash asset
   * on every transaction), so it already reflects all income received and
   * spending recorded to date. `cycleRemainingPool` below must never
   * separately add income or subtract spend on top of this figure, or the
   * same dollar gets counted twice. */
  includedMoneyBalance: number;
  /** Per-account breakdown backing `includedMoneyBalance`, so the
   * breakdown sheet can show which accounts make up the total (PRD ask). */
  includedMoneyBalanceAccounts: { id: string; label: string; value: number }[];
  /** Recurring income actually due between now and the next payday (real
   * scheduled occurrences, not a monthly-equivalent rate) plus any ad-hoc
   * income already logged this cycle. A *budget rate* figure — used only to
   * compute `cycleDiscretionaryPool` for Lulu Score's Spending Control
   * factor below, never for "Available Until Payday" itself (PRD bug
   * report: this used to feed the "Available Until Payday" total directly,
   * which double-counted a salary transaction dated on the next payday as
   * both "already available" and, correctly, as a future event on What
   * Happens Next — and separately excluded ad-hoc income already reflected
   * in `includedMoneyBalance`, which would have double-counted it the
   * other way once that fix landed). */
  cycleIncomeExpected: number;
  /** The ad-hoc portion of cycleIncomeExpected — exposed for
   * `cycleDiscretionaryPool`'s budget math only, not for display (it's
   * already inside `includedMoneyBalance`). */
  cycleAdHocIncome: number;
  /** Recurring bills and credit-card payments actually due between now and
   * the next payday — real scheduled occurrences, counted as many times as
   * they actually fall in the window (a weekly bill in a fortnightly cycle
   * counts twice), not a monthly-equivalent rate. Forward-looking (not yet
   * reflected in `includedMoneyBalance`), so this is subtracted from it. */
  cycleBillsExpected: number;
  /** This cycle's share of the savings target, prorated by cycle length
   * against a 30-day month. Forward-looking, same reasoning as bills. */
  cycleSavingsReserved: number;
  /** This cycle's share of goal contributions, prorated the same way.
   * Forward-looking, same reasoning as bills. */
  cycleGoalsReserved: number;
  /** A *budget* baseline — expected income minus bills/savings/goals, all
   * rate-based — used only by Lulu Score's Spending Control factor to ask
   * "is the user spending in line with what they planned for this point in
   * the cycle." Deliberately not cash-balance-based, unlike
   * `cycleRemainingPool`: Spending Control is asking a different question
   * (spending pace vs. plan) than "Available Until Payday" is (actual cash
   * remaining), and must not silently share one formula (PRD ask). */
  cycleDiscretionaryPool: number;
  /** `includedMoneyBalance` minus bills/savings/goals still due before the
   * next payday — the number "Available Until Payday" actually shows.
   * Never adds `cycleIncomeExpected` or subtracts spend-so-far on top of
   * `includedMoneyBalance`; both are already inside it. */
  cycleRemainingPool: number;
}

// One pay cycle's length in days, used to derive a cycle start when we only
// know the next payday. Irregular income falls back to a rolling 30-day
// window per the PRD's documented MVP limitation. Exported so
// moneyTimeline.ts can repeat cycle-boundary events (Savings Allocation,
// goal contributions) at the same cadence as this file's own cycle math,
// without duplicating the frequency→days mapping in two places.
export function cycleLengthDays(frequency: PayFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 7;
    case 'fortnightly':
      return 14;
    case 'monthly':
      return 30;
    case 'irregular':
    default:
      return 30;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeFixedCosts(data: AppData): number {
  const fixedExpensesMonthly = data.recurringItems
    .filter((item) => item.type === 'expense' && item.isFixed && item.active)
    .reduce((sum, item) => sum + toMonthlyAmount(item.amount, item.frequency), 0);
  // Each card's resolved expected repayment (PRD ask, Finding #41) — not
  // the raw minimumPayment field — so a user who plans to repay more than
  // the contractual minimum sees that larger, more realistic commitment
  // reflected in their fixed costs, exactly like any other bill.
  const creditCardRepayments = data.creditCards.reduce((sum, card) => sum + resolveExpectedMonthlyRepayment(card), 0);
  return fixedExpensesMonthly + creditCardRepayments;
}

export function computeSafeToSpend(data: AppData, today: Date = new Date()): SafeToSpendResult {
  const { user } = data;
  const cycleDays = cycleLengthDays(user.payFrequency);

  // With a known payday, the cycle is the cycleDays leading up to it. With
  // no known payday, we don't know the real cycle boundaries — the safest
  // assumption is "a fresh cycle started today," anchored at midnight so a
  // transaction logged today is never accidentally excluded (a transaction
  // dated "today" is stored at midnight, not the current time of day).
  let cycleStart: Date;
  let cycleEnd: Date;
  if (user.nextPayday) {
    cycleEnd = new Date(user.nextPayday);
    cycleStart = new Date(cycleEnd.getTime() - cycleDays * 86400000);
  } else {
    cycleStart = startOfDay(today);
    cycleEnd = new Date(cycleStart.getTime() + cycleDays * 86400000);
  }

  const fixedCosts = computeFixedCosts(data);
  const availableForGoals = user.monthlyIncome - fixedCosts;
  const goalAllocation = computeGoalAllocation(data, availableForGoals);
  const goalContributionsMonthly = goalAllocation.totalAllocatedMonthly;

  // The user's own chosen Savings allocation — $0 unless they've explicitly
  // turned it on (PRD ask: no automatic percentage of income). This is the
  // one savings figure Safe to Spend, Money Flow, and Money Allocation all
  // read from, so they can never contradict each other.
  const savingsAllocationMonthly = resolveSavingsAllocationMonthly(user);

  const discretionaryPool = Math.max(
    0,
    user.monthlyIncome - fixedCosts - goalContributionsMonthly - savingsAllocationMonthly
  );

  // Transactions the user logs are treated as variable/discretionary spend —
  // fixed expenses are already accounted for via recurring items above.
  const variableSpendSoFar = data.transactions
    .filter(
      (t) => t.type === 'expense' && new Date(t.date) >= cycleStart && new Date(t.date) <= today
    )
    .reduce((sum, t) => sum + t.amount, 0);

  // The subset that actually reduced includedMoneyBalance — see the
  // SafeToSpendResult doc comment for why this can't just be "every
  // paymentSource==='cash' expense": a cash-paid expense only really
  // touches the balance this file measures if the single Cash asset it
  // moves (applyTransactionEffect's `data.assets.find(a => a.type ===
  // 'cash')`) both exists and is itself included in Money calculations.
  const cashAsset = data.assets.find((a) => a.type === 'cash');
  const cashAssetIsIncluded = !!cashAsset && resolveIncludeInMoneyCalculations(cashAsset);
  const cashVariableSpendSoFar = cashAssetIsIncluded
    ? data.transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            (t.paymentSource === 'cash' || t.paymentSource === undefined) &&
            new Date(t.date) >= cycleStart &&
            new Date(t.date) <= today
        )
        .reduce((sum, t) => sum + t.amount, 0)
    : 0;

  const remainingPool = discretionaryPool - variableSpendSoFar;

  const daysRemaining = Math.max(
    1,
    Math.ceil((cycleEnd.getTime() - today.getTime()) / 86400000)
  );

  // Real dated cash-flow window for "Available Until Payday" (PRD bug
  // report: it was showing full monthly-equivalent income and bills
  // instead of only what's actually due before the next payday). Bills
  // that are overdue by up to a day still count — same tolerance the Money
  // Timeline already uses — since an unconfirmed bill hasn't been resolved
  // yet, not necessarily already paid.
  const windowFrom = new Date(Math.max(cycleStart.getTime(), startOfDay(today).getTime() - 86400000));
  const incomeOccurrences = recurringOccurrencesInRange(
    data.recurringItems.filter((r) => r.type === 'income'),
    windowFrom,
    cycleEnd
  );
  const cycleRecurringIncome = incomeOccurrences.reduce((sum, o) => sum + o.item.amount, 0);
  const cycleAdHocIncome = computeAdHocIncome(data.transactions, cycleStart, today);
  const cycleIncomeExpected = cycleRecurringIncome + cycleAdHocIncome;

  const billOccurrences = recurringOccurrencesInRange(
    data.recurringItems.filter((r) => r.type === 'expense' && r.isFixed),
    windowFrom,
    cycleEnd
  );
  const cycleRecurringBills = billOccurrences.reduce((sum, o) => sum + o.item.amount, 0);
  // Each card's resolved expected repayment (PRD ask, Finding #41), counted
  // only when its due date actually falls within this cycle — same
  // resolver used everywhere else a credit card's repayment commitment
  // feeds a calculation, so Available Until Payday can never disagree with
  // Typical Money Flow/Allocation about what a card "costs" this cycle.
  const cycleCreditCardRepayments = data.creditCards.reduce((sum, card) => {
    const daysUntil = daysUntilDue(card.dueDay, today);
    const dueDate = new Date(startOfDay(today).getTime() + daysUntil * 86400000);
    return dueDate.getTime() <= cycleEnd.getTime() ? sum + resolveExpectedMonthlyRepayment(card) : sum;
  }, 0);
  const cycleBillsExpected = cycleRecurringBills + cycleCreditCardRepayments;

  // Savings/goal targets are a monthly policy, not a dated event of their
  // own — this cycle's fair share is the monthly figure prorated by how
  // much of a 30-day month this cycle actually covers. Applies the same
  // way whether the user chose a percentage or a fixed monthly amount.
  const cycleFraction = cycleDays / 30;
  const cycleSavingsReserved = savingsAllocationMonthly * cycleFraction;
  const cycleGoalsReserved = goalContributionsMonthly * cycleFraction;

  // Budget baseline for Lulu Score's Spending Control factor only — see the
  // interface doc comment above. Never used for "Available Until Payday"
  // itself.
  const cycleDiscretionaryPool = Math.max(
    0,
    cycleIncomeExpected - cycleBillsExpected - cycleSavingsReserved - cycleGoalsReserved
  );

  // "Available Until Payday" itself: only the balances the user has
  // confirmed (or defaulted) as available for everyday spending, minus
  // what's still due before the next payday. Deliberately does not add
  // cycleIncomeExpected or subtract spend-so-far — both are already
  // reflected in includedMoneyBalance in real time (PRD bug report: the
  // previous version added the next payday's own salary transaction to
  // this total, and separately excluded any ad-hoc income already sitting
  // in the cash balance — either way, the same dollar was at risk of being
  // counted once too many or too few times). And deliberately does NOT use
  // `computeLiquidCash` — that includes every cash/savings asset
  // regardless of what the user has earmarked it for (PRD bug report: a
  // house deposit or reserved savings balance was silently treated as
  // spendable).
  const includedMoneyBalance = computeMoneyAvailableBalances(data.assets);
  const includedMoneyBalanceAccounts = listMoneyAvailableAccounts(data.assets);
  const cycleRemainingPool = includedMoneyBalance - cycleBillsExpected - cycleSavingsReserved - cycleGoalsReserved;

  const dailyAllowance = cycleRemainingPool / daysRemaining;

  // Today's spend, isolated, so Safe to Spend can react to it directly
  // rather than only moving the number tomorrow (PRD ask: "Lulu should
  // feel alive"). Comparing against the allowance with today's spend
  // added back gives a fair "before vs. after" for the day.
  const todaysSpend = data.transactions
    .filter((t) => t.type === 'expense' && startOfDay(new Date(t.date)).getTime() === startOfDay(today).getTime())
    .reduce((sum, t) => sum + t.amount, 0);
  const plannedDailyAllowance = (cycleRemainingPool + todaysSpend) / daysRemaining;

  const hasKnownPayday = !!user.nextPayday;

  return {
    discretionaryPool,
    remainingPool,
    daysRemaining,
    dailyAllowance,
    cycleStart,
    cycleEnd,
    fixedExpensesMonthly: fixedCosts,
    goalContributionsMonthly,
    savingsAllocationMonthly,
    goalAllocation,
    todaysSpend,
    plannedDailyAllowance,
    spendSoFarThisCycle: variableSpendSoFar,
    cashVariableSpendSoFar,
    hasKnownPayday,
    includedMoneyBalance,
    includedMoneyBalanceAccounts,
    cycleIncomeExpected,
    cycleAdHocIncome,
    cycleBillsExpected,
    cycleSavingsReserved,
    cycleGoalsReserved,
    cycleDiscretionaryPool,
    cycleRemainingPool,
  };
}
