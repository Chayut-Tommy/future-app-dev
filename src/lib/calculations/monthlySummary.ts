import { AppData } from '../../types/models';
import { toMonthlyAmount } from './incomeEngine';
import { moneyAmountToCents } from './money';
import {
  resolveTransactionCashflowAmount,
  resolveTransactionAggregateSpendingAmount,
  resolveTransactionAggregateSpendingCents,
} from './repaymentAccounting';
import { brand } from '../brand';

// Correction round, 2026-08-10 — the single local-calendar month-to-date
// window (first local day of the current month through today, inclusive
// both ends) that both computeMonthToDateActivity and the newer
// computeThisMonthRecordedSummary use. Extracted so there is exactly ONE
// date-boundary implementation in this file, never two independently
// maintained ones (PRD ask: "Do not introduce a second date filter").
function monthToDateWindowStart(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), 1);
}
function isWithinMonthToDate(dateISO: string, monthStart: Date, today: Date): boolean {
  const d = new Date(dateISO);
  return d >= monthStart && d <= today;
}

export interface MonthlySummary {
  income: number;
  expenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  netCashflow: number;
  savingsRate: number;
}


export function computeMonthlySummary(data: AppData, today: Date = new Date()): MonthlySummary {
  return computeSummaryForMonth(data, today.getFullYear(), today.getMonth());
}

// Computes a summary bounded to one specific calendar month (used for
// "vs. last month" comparisons) rather than "month-to-date from today".
export function computeSummaryForMonth(data: AppData, year: number, month: number): MonthlySummary {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  // Excludes transactions auto-created by confirming a recurring bill
  // (recurringItemId set) — that bill's cost is already counted below via
  // fixedExpensesMonthly's recurring rate, so including the confirmation
  // transaction too would count the same bill twice (mirrors
  // computeAdHocIncome's identical exclusion on the income side). Also
  // excludes a confirmed credit-card repayment (isRepayment set) — a
  // repayment moves money from an asset to a card liability; it is never
  // new consumer spending and must not inflate This Month's recorded
  // expenses (a repayment has no RecurringItem to carry recurringItemId,
  // and this function's own fixedExpensesMonthly below has no
  // credit-card-repayment term to "already count" it via, unlike
  // safeToSpend.ts's computeFixedCosts — so unlike the recurringItemId
  // exclusion above, this one is not offsetting a rate counted elsewhere
  // in THIS function; it simply keeps repayments out of "spending"
  // entirely, per product decision).
  const loggedExpenses = data.transactions
    .filter(
      (t) => t.type === 'expense' && !t.recurringItemId && !t.isRepayment && new Date(t.date) >= monthStart && new Date(t.date) < monthEnd
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const fixedExpensesMonthly = data.recurringItems
    .filter((item) => item.type === 'expense' && item.isFixed && item.active)
    .reduce((sum, item) => sum + toMonthlyAmount(item.amount, item.frequency), 0);

  const income = data.user.monthlyIncome;
  const expenses = loggedExpenses + fixedExpensesMonthly;
  const netCashflow = income - expenses;
  const savingsRate = income > 0 ? netCashflow / income : 0;

  return { income, expenses, fixedExpenses: fixedExpensesMonthly, variableExpenses: loggedExpenses, netCashflow, savingsRate };
}

/**
 * One-off income the user has actually logged in a date range — a bonus,
 * gift, tax refund, sale of shares — deliberately excluding transactions
 * auto-created by confirming a recurring income source arrived (PRD ask,
 * §5: recurring income and one-off income transactions must stay
 * completely separate, never double-counted). This is real cash that has
 * already landed, so it's added directly to "what's available right now"
 * views (Available Until Payday, Money Flow, Money Breakdown) — but never
 * folded into `monthlyIncome` itself, which stays a measure of ongoing,
 * sustainable income for Lulu Score and month-to-month comparisons.
 */
export function computeAdHocIncome(transactions: AppData['transactions'], from: Date, to: Date): number {
  return transactions
    .filter((t) => t.type === 'income' && !t.recurringItemId && new Date(t.date) >= from && new Date(t.date) <= to)
    .reduce((sum, t) => sum + t.amount, 0);
}

export interface MonthToDateActivity {
  income: number;
  spend: number;
  /** Expense transactions dated this calendar month whose paymentSource is
   * 'cash', unset (unset already treated as cash by applyTransactionEffect
   * in AppStateContext — mirrored here, not re-derived), or 'everyday'
   * (Everyday Account correction, 2026-08-08 — an Everyday Account is a
   * money balance exactly like Cash, and folding it into this same field
   * keeps `cashSpend + creditCardSpend + otherSpend` an exhaustive partition
   * of `spend` rather than silently dropping a whole payment source from
   * every consumer's total; see ThisMonthCard's derived "Spending recorded"
   * headline, which sums exactly these three fields). Additive fields
   * (PRD ask, This Month card, Finding #40) — income/spend keep their exact
   * existing meaning for every current consumer (Lulu Score, Monthly
   * Snapshot, Spending Tracker); cashSpend/creditCardSpend/otherSpend are
   * new, computed once from the same filtered expense list, never a second,
   * parallel monthly-activity calculation. */
  cashSpend: number;
  /** paymentSource === 'credit_card'. */
  creditCardSpend: number;
  /** paymentSource === 'loan' or 'other' — deliberately never folded into
   * cashSpend or creditCardSpend (PRD ask: a loan/debt-funded or
   * other-funded expense must not silently inflate either of those rows). */
  otherSpend: number;
}

/**
 * A literal "what's actually happened since the 1st" pulse check — every
 * logged transaction this calendar month, recurring-confirmed or ad-hoc
 * alike (PRD ask: Today's live month snapshot). Deliberately not the same
 * as MonthlySummary above: that one blends a monthly income *rate* with
 * logged expenses for budgeting math; this one is pure recorded activity,
 * so it naturally reads lower than the rate mid-month and matches Money
 * tab's Spending Tracker totals exactly.
 */
export function computeMonthToDateActivity(data: AppData, today: Date = new Date()): MonthToDateActivity {
  const monthStart = monthToDateWindowStart(today);
  const income = data.transactions
    .filter((t) => t.type === 'income' && isWithinMonthToDate(t.date, monthStart, today))
    .reduce((sum, t) => sum + t.amount, 0);
  // Final three-measure accounting correction — this function is the
  // AGGREGATE-SPENDING consumer (This Month "Spent" and its breakdown
  // buckets), never the recorded-cashflow one; it uses
  // resolveTransactionAggregateSpendingAmount, NOT
  // resolveTransactionCashflowAmount (see computeRecordedMonthlyCashflow
  // below, which independently uses the cashflow resolver instead of
  // reusing this function's own `spend` — the two measures are now
  // structurally distinct, not merely aliased). A confirmed ordinary bill
  // counts here in full (the device test's own proof: a confirmed $50 bill
  // correctly increased recorded spending by $50); a confirmed credit-card/
  // BNPL repayment counts as $0 (an asset/liability transfer, not new
  // consumer spending); a confirmed loan repayment counts only its known
  // interest/fees portion (or the full amount when interest-only); and an
  // UNKNOWN-split loan repayment counts as $0 here specifically — real cash
  // left the account (so recorded cashflow below still counts it), but
  // Navilo cannot identify any of it as interest or an expense, so it must
  // never be presented as "Spent". See resolveTransactionAggregateSpendingAmount's
  // own doc comment for the complete per-type contract.
  const monthExpenses = data.transactions.filter((t) => t.type === 'expense' && isWithinMonthToDate(t.date, monthStart, today));
  const spend = monthExpenses.reduce((sum, t) => sum + resolveTransactionAggregateSpendingAmount(data, t), 0);
  const cashSpend = monthExpenses
    .filter((t) => t.paymentSource === 'cash' || t.paymentSource === undefined || t.paymentSource === 'everyday')
    .reduce((sum, t) => sum + resolveTransactionAggregateSpendingAmount(data, t), 0);
  const creditCardSpend = monthExpenses
    .filter((t) => t.paymentSource === 'credit_card')
    .reduce((sum, t) => sum + resolveTransactionAggregateSpendingAmount(data, t), 0);
  const otherSpend = monthExpenses
    .filter((t) => t.paymentSource === 'loan' || t.paymentSource === 'other')
    .reduce((sum, t) => sum + resolveTransactionAggregateSpendingAmount(data, t), 0);
  return { income, spend, cashSpend, creditCardSpend, otherSpend };
}

/**
 * The single authoritative "recorded cashflow this month" figure — every
 * logged income transaction this calendar month minus every logged expense
 * transaction's RECORDED-CASHFLOW amount (resolveTransactionCashflowAmount
 * — deliberately NOT `computeMonthToDateActivity`'s own `spend`, which is
 * the separate AGGREGATE-SPENDING measure; see repaymentAccounting.ts's
 * module header for why the two diverge for an unknown-split loan
 * repayment). This is *recorded* activity, distinct from
 * `computeMonthlySummary`'s `netCashflow`, which blends the recurring
 * monthly income *rate* with logged expenses for budgeting/Lulu-Score math
 * — the two answer different questions and must not be swapped (PRD bug
 * report: Financial State copy said "recorded cashflow" while actually
 * reading the recurring-rate figure, so a user with a one-off $50,000
 * income transaction still saw "this month's cashflow is also tight," even
 * though July So Far, Available Until Payday, and Estimated Wealth Change —
 * all of which already use this same recorded-activity source — showed a
 * strongly positive month).
 *
 * Any copy that says "recorded cashflow" (Financial State's Cashflow Focus
 * / Financial Rebuild variants) must use this function, not
 * `computeMonthlySummary`.
 */
export function computeRecordedMonthlyCashflow(data: AppData, today: Date = new Date()): number {
  const monthStart = monthToDateWindowStart(today);
  const income = data.transactions
    .filter((t) => t.type === 'income' && isWithinMonthToDate(t.date, monthStart, today))
    .reduce((sum, t) => sum + t.amount, 0);
  const spend = data.transactions
    .filter((t) => t.type === 'expense' && isWithinMonthToDate(t.date, monthStart, today))
    .reduce((sum, t) => sum + resolveTransactionCashflowAmount(data, t), 0);
  return income - spend;
}

/**
 * Plain-language cashflow coaching (PRD ask: never show a raw extreme
 * percentage like "-937%" — that reads as broken, not helpful). Framed as
 * "you're spending more than you earn," a real gap in dollars, and a
 * supportive next step — never a shaming number.
 */
export function describeCashflowMessage(summary: MonthlySummary): string | null {
  if (summary.income <= 0) return null;
  if (summary.netCashflow < 0) {
    const gap = Math.round(Math.abs(summary.netCashflow)).toLocaleString();
    return `${brand.name} noticed your spending is higher than your income this month. Your current gap is about $${gap}. Reducing expenses or increasing income may help how much you can safely spend.`;
  }
  if (summary.savingsRate >= 0.01) {
    return `${brand.name} noticed you're saving about ${Math.round(summary.savingsRate * 100)}% of your income this month${
      summary.savingsRate >= 0.2 ? ' — a strong rate.' : '.'
    }`;
  }
  return "You're breaking even this month — every extra dollar saved helps.";
}

/** One ranked, individually-identified funding source behind This Month's
 * "Spending recorded" total — correction round, 2026-08-10. `key` is a
 * stable identity (never a label) so multiple same-type/same-labelled
 * accounts or cards never merge: `everyday:<assetId>`, `creditCard:<id>`,
 * `loan:<liabilityId>`, or one of the three fixed keys 'cash' / 'other' /
 * 'unavailable'. `percentage` is an integer, largest-remainder-allocated so
 * a full, untruncated list's percentages always sum to exactly 100 (never
 * computed when spendingCents is 0). */
export interface ThisMonthSpendingSource {
  key: string;
  kind: 'cash' | 'everyday' | 'credit_card' | 'loan' | 'other' | 'unavailable';
  label: string;
  amountCents: number;
  percentage: number;
}

/** The single exact-cent result BOTH faces of This Month must read from —
 * never independently rounded broad buckets on the front and cents on the
 * back (PRD ask: "the redesigned front and back consume the same new
 * shared result"). `sum(spendingSources[].amountCents) === spendingCents`
 * always holds exactly, because both are derived from one pass over one
 * shared-filtered, individually-validated transaction list — see
 * computeThisMonthRecordedSummary's own doc comment for the exact
 * invalid-amount contract. */
export interface ThisMonthRecordedSummary {
  incomeCents: number;
  spendingCents: number;
  netCents: number;
  spendingSources: ThisMonthSpendingSource[];
  hasInvalidRecordedAmounts: boolean;
}

/**
 * The exact-cent, per-source-attributed sibling to computeMonthToDateActivity
 * above — same shared isWithinMonthToDate/monthToDateWindowStart date window,
 * same underlying transaction set, but (a) integer cents throughout via the
 * established strict moneyAmountToCents validator, never floating point, and
 * (b) expense rows individually attributed by stable source identity
 * (targetAssetId / creditCardId / liabilityId), not just the three coarse
 * cash/credit-card/other buckets computeMonthToDateActivity itself returns.
 * computeMonthToDateActivity's own return shape, arithmetic, and every
 * existing consumer (Monthly Snapshot on Today, Spending Tracker, Navilo
 * Score) are completely unmodified by this function's existence.
 *
 * Invalid-amount handling (PRD ask, "Strict invalid-amount handling"): each
 * qualifying transaction is independently run through moneyAmountToCents.
 * A transaction that fails validation (NaN/Infinity, non-positive, more
 * than 2 decimal places of precision, unsafe-integer overflow) is excluded
 * from every total AND every source bucket — not folded into Cash, Other
 * funding, or Source unavailable, since those are for VALID amounts with an
 * unresolved or explicit identity, a different failure mode entirely.
 * `hasInvalidRecordedAmounts` is set true so the UI can show one neutral
 * disclosure line, never technical parser language. Every other, valid
 * transaction is completely unaffected by one invalid neighbour.
 *
 * Source attribution hierarchy (PRD ask, "Source attribution"):
 *  - paymentSource 'everyday' + a targetAssetId that resolves to a real,
 *    still-existing Everyday Account -> keyed by that asset's id.
 *  - paymentSource 'credit_card' + a creditCardId that resolves -> keyed by
 *    that card's id.
 *  - paymentSource 'loan' + a liabilityId that resolves -> keyed by that
 *    liability's id.
 *  - paymentSource 'other' -> the fixed 'other' key ("Other funding" — an
 *    explicit customer choice, never a data gap).
 *  - paymentSource 'cash', OR paymentSource undefined (the documented
 *    legacy convention already established in computeBalanceEffect's own
 *    `const source = t.paymentSource ?? 'cash'` and in this same file's
 *    computeMonthToDateActivity cashSpend filter) -> the fixed 'cash' key.
 *  - Any of the three id-based cases above whose referenced id no longer
 *    resolves (the source was deleted after the transaction was recorded)
 *    -> the fixed 'unavailable' key ("Source unavailable" — a real, valid
 *    amount whose original identity is gone; multiple such transactions
 *    aggregate into this one row for the MVP, per PRD ask, with no cent
 *    lost). Savings is deliberately not a case here — PaymentSource has no
 *    'savings' value in this round (PRD ask: deferred scope only).
 */
export function computeThisMonthRecordedSummary(data: AppData, today: Date = new Date()): ThisMonthRecordedSummary {
  const monthStart = monthToDateWindowStart(today);
  let hasInvalidRecordedAmounts = false;

  let incomeCents = 0;
  for (const t of data.transactions) {
    if (t.type !== 'income' || !isWithinMonthToDate(t.date, monthStart, today)) continue;
    const validated = moneyAmountToCents(t.amount);
    if (!validated.valid) {
      hasInvalidRecordedAmounts = true;
      continue;
    }
    incomeCents += validated.cents;
  }

  // entityId (correction round, 2026-08-10): the underlying Asset/CreditCard/
  // Liability id for the three per-entity kinds, carried alongside the
  // customer-facing label so duplicate-label disambiguation below can order
  // by stable entity identity — never by which transaction happened to be
  // seen first, and never by this month's spent amount.
  type Bucket = { kind: ThisMonthSpendingSource['kind']; label: string; amountCents: number; entityId?: string };
  const buckets = new Map<string, Bucket>();
  function addToBucket(key: string, kind: ThisMonthSpendingSource['kind'], label: string, cents: number, entityId?: string) {
    const existing = buckets.get(key);
    if (existing) existing.amountCents += cents;
    else buckets.set(key, { kind, label, amountCents: cents, entityId });
  }

  let spendingCents = 0;
  for (const t of data.transactions) {
    if (t.type !== 'expense' || !isWithinMonthToDate(t.date, monthStart, today)) continue;
    // Final three-measure accounting correction — this is the
    // AGGREGATE-SPENDING breakdown (This Month's spending-source list), so
    // it uses resolveTransactionAggregateSpendingCents, the SAME resolver
    // computeMonthToDateActivity's `spend`/bucket fields above use — never
    // resolveTransactionCashflowCents, which is reserved for
    // computeRecordedMonthlyCashflow alone. The two diverge only for an
    // unknown-split loan repayment (full cashflow, $0 aggregate spending —
    // see repaymentAccounting.ts's module header for the full contract).
    // resolveTransactionAggregateSpendingCents also catches a genuinely
    // corrupt stored `t.amount` (non-finite, negative, fractional-cent),
    // since a corrupt input can never resolve to a valid cents value either.
    const resolvedCents = resolveTransactionAggregateSpendingCents(data, t);
    if (resolvedCents === undefined) {
      hasInvalidRecordedAmounts = true;
      continue;
    }
    // A repayment (or interest-free loan principal payment) resolving to
    // exactly $0 has nothing to attribute to a spending-source bucket —
    // skipped here rather than added as a zero-amount row, which would
    // clutter the breakdown with nothing to show.
    if (resolvedCents === 0) continue;
    spendingCents += resolvedCents;

    if (t.paymentSource === 'everyday' && t.targetAssetId) {
      const asset = data.assets.find((a) => a.id === t.targetAssetId && a.type === 'everyday');
      if (asset) addToBucket(`everyday:${asset.id}`, 'everyday', asset.label, resolvedCents, asset.id);
      else addToBucket('unavailable', 'unavailable', 'Source unavailable', resolvedCents);
    } else if (t.paymentSource === 'credit_card' && t.creditCardId) {
      const card = data.creditCards.find((c) => c.id === t.creditCardId);
      if (card) addToBucket(`creditCard:${card.id}`, 'credit_card', card.label, resolvedCents, card.id);
      else addToBucket('unavailable', 'unavailable', 'Source unavailable', resolvedCents);
    } else if (t.paymentSource === 'loan' && t.liabilityId) {
      const liability = data.liabilities.find((l) => l.id === t.liabilityId);
      if (liability) addToBucket(`loan:${liability.id}`, 'loan', liability.label, resolvedCents, liability.id);
      else addToBucket('unavailable', 'unavailable', 'Source unavailable', resolvedCents);
    } else if (t.paymentSource === 'other') {
      addToBucket('other', 'other', 'Other funding', resolvedCents);
    } else if (t.paymentSource === 'cash' || t.paymentSource === undefined) {
      addToBucket('cash', 'cash', 'Cash', resolvedCents);
    } else {
      // Defensive only — an 'everyday'/'credit_card'/'loan' paymentSource
      // missing its required id, which the rest of this codebase never
      // produces (QuickAddModal always pairs them), still resolves to a
      // real, visible row rather than silently vanishing.
      addToBucket('unavailable', 'unavailable', 'Source unavailable', resolvedCents);
    }
  }

  const netCents = incomeCents - spendingCents;

  // Duplicate customer-facing label disambiguation (correction round,
  // 2026-08-10, PRD ask "Make identical customer-facing source names
  // distinguishable"). Stable IDs already prevent two same-named accounts
  // from merging in the calculation — this makes them tell apart on
  // screen too. Ordering the "— Account N" / "— Card N" / "— Loan N"
  // suffix is based on each entity's position in its OWN canonical array
  // (data.assets / data.creditCards / data.liabilities) — a stable
  // identity ordering that a transaction being added, edited, or deleted
  // (this month's or any other month's) can never change, and that has
  // nothing to do with this month's spent amount. Mirrors the established
  // "Account N" convention already used by QuickAddModal.tsx's
  // disambiguateEverydayAccountLabels and incomeDestinations.ts's
  // resolveEligibleIncomeDestinations — reimplemented locally here (not
  // imported) because both of those live outside this round's authorised
  // file boundary and the QuickAddModal helper is private.
  const DISAMBIGUATION_SUFFIX: Partial<Record<ThisMonthSpendingSource['kind'], string>> = {
    everyday: 'Account',
    credit_card: 'Card',
    loan: 'Loan',
  };
  const canonicalIndex: Partial<Record<ThisMonthSpendingSource['kind'], Map<string, number>>> = {
    everyday: new Map(data.assets.map((a, i) => [a.id, i])),
    credit_card: new Map(data.creditCards.map((c, i) => [c.id, i])),
    loan: new Map(data.liabilities.map((l, i) => [l.id, i])),
  };
  const labelGroups = new Map<string, { key: string; kind: ThisMonthSpendingSource['kind']; entityId: string }[]>();
  for (const [key, b] of buckets.entries()) {
    if (b.entityId === undefined || !DISAMBIGUATION_SUFFIX[b.kind]) continue;
    const groupKey = `${b.kind}::${b.label}`;
    const group = labelGroups.get(groupKey) ?? [];
    group.push({ key, kind: b.kind, entityId: b.entityId });
    labelGroups.set(groupKey, group);
  }
  for (const group of labelGroups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const indexMap = canonicalIndex[a.kind];
      const ai = indexMap?.get(a.entityId) ?? Number.MAX_SAFE_INTEGER;
      const bi = indexMap?.get(b.entityId) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi || a.key.localeCompare(b.key);
    });
    group.forEach((entry, i) => {
      const bucket = buckets.get(entry.key)!;
      bucket.label = `${bucket.label} — ${DISAMBIGUATION_SUFFIX[entry.kind]} ${i + 1}`;
    });
  }

  // Deterministic order (PRD ask): amount descending, then customer-facing
  // (already-disambiguated) label, then the stable key as the final
  // tie-breaker — never transaction-array order, Map insertion order, or a
  // generated per-run index.
  const spendingSources: ThisMonthSpendingSource[] = Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    kind: b.kind,
    label: b.label,
    amountCents: b.amountCents,
    percentage: 0,
  }));
  spendingSources.sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));

  // Largest-remainder (Hamilton) integer percentage allocation, so a full
  // list's displayed percentages always sum to exactly 100 — never
  // computed at all when there's nothing to divide (PRD ask). Remainder
  // ties are broken by the SAME amount/label/key order the rows themselves
  // use (correction round, 2026-08-10: fraction desc, then label, then the
  // stable source key as the final tie-breaker) — never by position in a
  // JS array, transaction order, or a generated per-run index, so the rule
  // reads the same regardless of how spendingSources was built.
  if (spendingCents > 0) {
    const rawShares = spendingSources.map((s) => (s.amountCents / spendingCents) * 100);
    const floors = rawShares.map((r) => Math.floor(r));
    const allocated = floors.reduce((sum, f) => sum + f, 0);
    let remaining = 100 - allocated;
    const remainderOrder = spendingSources
      .map((s, i) => ({ i, label: s.label, key: s.key, frac: rawShares[i] - floors[i] }))
      .sort((a, b) => b.frac - a.frac || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
    for (let k = 0; k < remaining && k < remainderOrder.length; k++) {
      floors[remainderOrder[k].i] += 1;
    }
    spendingSources.forEach((s, i) => {
      s.percentage = floors[i];
    });
  }

  return { incomeCents, spendingCents, netCents, spendingSources, hasInvalidRecordedAmounts };
}
