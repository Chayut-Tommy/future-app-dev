import { AppData, Transaction } from '../../types/models';
import { toBalanceCentsAllowingZero } from './bnpl';

/**
 * 2D-NARROW correction (final three-measure accounting pass) — shared
 * resolvers for THREE genuinely different concepts that must never be
 * conflated:
 *
 * 1. "Recorded cashflow" (`resolveTransactionCashflowAmount`) — real money
 *    that left a real account this transaction. Feeds ONLY Financial
 *    State's Recorded Cashflow (`computeRecordedMonthlyCashflow`) and any
 *    Navilo Score input that intentionally inherits it. May conservatively
 *    count an amount Navilo cannot otherwise classify (the unknown-split
 *    loan-repayment case), because real cash genuinely left the account and
 *    Financial State must never understate that.
 *
 * 2. "Aggregate spending" (`resolveTransactionAggregateSpendingAmount`) —
 *    the amount safe to present to the customer AS SPENDING: This Month
 *    "Spent", This Month's net calculation, the spending-source breakdown,
 *    Transaction History's monthly header, and any other total presented as
 *    spending/expenses. Identical to (1) for every type EXCEPT an
 *    unknown-split loan repayment: real cash left the account (so (1) still
 *    counts it), but Navilo cannot identify any of it as interest or an
 *    expense, so it must never be PRESENTED as spending — this resolves to
 *    $0 for that one case.
 *
 * 3. "Eligible category-coaching spending"
 *    (`resolveTransactionCategoryCoachingAmount`) — the STRICTLY NARROWEST
 *    amount safe to feed into category-based coaching
 *    (`computeCategoryDeltas`, `computeSpendingInsights`, and goal-impact,
 *    which reuses `computeCategoryDeltas`). Always $0 for every loan
 *    repayment (known-split, interest-only, AND unknown-split alike) — see
 *    that function's own doc comment for exactly why.
 *
 * All three are IDENTICAL for an ordinary bill, a credit-card repayment, and
 * a BNPL repayment. They diverge only for loan repayments, and only in the
 * ways enumerated above — see each function's own per-type contract.
 *
 * History this round: the user's own correction established that "an
 * unknown-split loan repayment represents a real recorded cash outflow, so
 * Financial State/recorded cashflow may conservatively use the full amount.
 * However, Navilo cannot identify any portion as interest or expense, so it
 * must not present the full amount as This Month 'Spent', category
 * spending, or coaching input. Do not treat aggregate spending and recorded
 * cashflow as the same measure for the unknown-split case." Prior to this
 * round, `resolveTransactionCashflowAmount` was reused directly by every
 * "This Month"/spending-source/Transaction-History-header consumer,
 * conflating (1) and (2) — this module now keeps them structurally distinct.
 */

/** A BNPL repayment is deliberately excluded from all three measures,
 * mirroring credit-card repayment's own treatment — preserving BNPL's
 * already-accepted accounting exactly as it stood before this round (BNPL's
 * own split/interest treatment is outside this round's authorised scope of
 * "ordinary bills, card repayments and loan repayments"; see this round's
 * own report for the explicit boundary). Not identified via
 * `recurringItemId` alone (every ordinary confirmed bill also carries
 * that) — only via its linked liability's own type, mirroring
 * QuickAddModal.tsx's isBnplRepaymentTransaction and reminders.ts's
 * bnplLinkedItemIds, which use the identical lookup for the identical
 * reason. */
function isBnplLinkedTransaction(data: AppData, t: Transaction): boolean {
  if (!t.recurringItemId) return false;
  const item = data.recurringItems.find((r) => r.id === t.recurringItemId);
  if (!item || !item.linkedLiabilityId) return false;
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  return liability?.type === 'bnpl';
}

/** Real money that left a real account this transaction — feeds ONLY
 * Financial State's Recorded Cashflow and any Navilo Score input that
 * intentionally inherits it. Never used for "This Month"/spending-source/
 * Transaction-History-header presentation — see
 * resolveTransactionAggregateSpendingAmount for that.
 * - Credit-card repayment (`isRepayment`): $0 — an asset/liability
 *   transfer (cash down, card balance up by the same amount), never a net
 *   cash outflow.
 * - BNPL repayment: $0 — see isBnplLinkedTransaction's own comment.
 * - Loan repayment (`isLoanRepayment`) with a known principal split: only
 *   the known interest/fees portion (`amount - principalAmount`) — the
 *   principal portion is an asset/liability transfer exactly like a
 *   credit-card repayment (cash down, recorded loan balance down by the
 *   same amount), never a net cash outflow. An interest-only repayment
 *   (`principalAmount === 0`) resolves to the full amount here, correctly —
 *   every dollar of it is known interest/fees.
 * - Loan repayment with an unknown split (`principalAmount` absent): the
 *   FULL amount — real money left the account and no safe split exists to
 *   carve out a transfer-only portion, so recorded cashflow must never
 *   understate it. This is the ONE case where this resolver and
 *   resolveTransactionAggregateSpendingAmount below deliberately diverge.
 * - Everything else (ordinary bills, income, ad-hoc transactions): the
 *   transaction's own full amount, unchanged. */
export function resolveTransactionCashflowAmount(data: AppData, t: Transaction): number {
  if (t.isRepayment) return 0;
  if (isBnplLinkedTransaction(data, t)) return 0;
  if (t.isLoanRepayment) {
    return t.principalAmount !== undefined ? Math.max(0, t.amount - t.principalAmount) : t.amount;
  }
  return t.amount;
}

/** The amount safe to PRESENT to the customer as spending — This Month
 * "Spent" and its net calculation, the spending-source breakdown,
 * Transaction History's monthly header, and any other total presented as
 * spending/expenses. Identical to resolveTransactionCashflowAmount for
 * every type EXCEPT an unknown-split loan repayment.
 *
 * - Credit-card/BNPL repayment: $0, same as cashflow.
 * - Loan repayment, known split: known interest/fees only, same as
 *   cashflow — a real, identified cost belongs in "Spent".
 * - Loan repayment, interest-only: the full amount, same as cashflow —
 *   every dollar is known interest.
 * - Loan repayment, UNKNOWN split: $0 — this is the deliberate divergence
 *   from cashflow. Real cash left the account (so
 *   resolveTransactionCashflowAmount still counts it, for Financial
 *   State), but Navilo cannot identify any portion of it as interest or an
 *   expense, so it must never be presented to the customer as "Spent" —
 *   doing so would imply a spending claim Navilo has no basis for. The
 *   full amount instead stays visible as its own individual Transaction
 *   History row, labelled "Balance not updated — split unknown"
 *   (TransactionsScreen.tsx's repaymentBadge).
 * - Everything else (ordinary bills, income, ad-hoc transactions): the
 *   transaction's own full amount — this is the behaviour the original
 *   device test proved correct for an ordinary confirmed bill. */
export function resolveTransactionAggregateSpendingAmount(data: AppData, t: Transaction): number {
  if (t.isRepayment) return 0;
  if (isBnplLinkedTransaction(data, t)) return 0;
  if (t.isLoanRepayment) {
    return t.principalAmount !== undefined ? Math.max(0, t.amount - t.principalAmount) : 0;
  }
  return t.amount;
}

/** The amount safe to feed into CATEGORY-BASED coaching — computeCategoryDeltas,
 * computeSpendingInsights, and goal-impact (which reuses
 * computeCategoryDeltas). The strictest of the three measures.
 *
 * Investigation (prior round, on request): every loan-repayment transaction
 * this codebase creates (`confirmLoanRepaymentTransition`,
 * AppStateContext.tsx) is stamped `categoryId: 'cat-debt'` — the SAME
 * category id a confirmed credit-card repayment also carries. 'cat-debt'
 * resolves (defaultCategories.ts) to `{ name: 'Debt repayments', type:
 * 'expense', icon: 'credit-card' }`: an established, pre-existing category
 * (present in the protected baseline, not created by this round) that is
 * also freely customer-selectable for an ordinary ad-hoc expense entry —
 * but it is a GENERIC debt-repayment bucket, not a category specific to
 * interest/fees. It never distinguishes interest from principal, and
 * because a credit-card repayment shares the identical id, "Debt
 * repayments" cannot be read as an honest proxy for "money that was a real
 * cost" either. No dedicated debt-interest category ("Interest & fees",
 * "Loan interest", or similar) exists anywhere in defaultCategories.ts.
 *
 * This function is deliberately keyed on the transaction's own repayment
 * METADATA (`isRepayment`/the BNPL-liability lookup/`isLoanRepayment`) —
 * NEVER on `categoryId === 'cat-debt'`. A manual, non-repayment expense the
 * customer happens to file under "Debt repayments" carries none of that
 * metadata, so it falls through to the final `return t.amount` branch and
 * participates in category coaching completely normally, exactly like any
 * other category (see the real regression test proving this).
 *
 * Absent a genuine debt-interest category, a loan repayment's interest/fees
 * must stay OUT of category totals entirely rather than being fabricated
 * into 'cat-debt' — so this resolves to $0 for EVERY loan repayment,
 * regardless of known-split, interest-only, or unknown-split. This is
 * intentionally a STRICTLY WIDER exclusion than
 * resolveTransactionAggregateSpendingAmount's own loan-repayment branch
 * above (which still counts a known-split's interest/fees, and an
 * interest-only repayment's full amount, toward aggregate spending) — the
 * two resolvers are expected to diverge here, not mirror each other. */
export function resolveTransactionCategoryCoachingAmount(data: AppData, t: Transaction): number {
  if (t.isRepayment) return 0;
  if (isBnplLinkedTransaction(data, t)) return 0;
  if (t.isLoanRepayment) return 0;
  return t.amount;
}

/** Cents-based wrapper over resolveTransactionCashflowAmount, using the
 * same zero-allowing strict conversion `toBalanceCentsAllowingZero` already
 * uses for a legitimately-$0 balance — a repayment transaction's resolved
 * cashflow amount is routinely and validly $0 (credit-card/BNPL repayment,
 * or a fully-interest-free loan principal payment), which the ordinary
 * strict `moneyAmountToCents` would incorrectly reject as invalid. Callers
 * that also need to detect a genuinely corrupt stored `t.amount` should
 * validate that separately — this only converts the already-resolved
 * output value. */
export function resolveTransactionCashflowCents(data: AppData, t: Transaction): number | undefined {
  return toBalanceCentsAllowingZero(resolveTransactionCashflowAmount(data, t));
}

/** Cents-based wrapper over resolveTransactionAggregateSpendingAmount — see
 * resolveTransactionCashflowCents's own comment for the zero-allowing
 * rationale, identical here. Used by computeThisMonthRecordedSummary
 * (monthlySummary.ts), the one aggregate-spending consumer that needs
 * exact-cent precision rather than a plain dollar amount. */
export function resolveTransactionAggregateSpendingCents(data: AppData, t: Transaction): number | undefined {
  return toBalanceCentsAllowingZero(resolveTransactionAggregateSpendingAmount(data, t));
}
