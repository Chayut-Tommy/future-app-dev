import { AppData } from '../../types/models';
import { toMonthlyAmount } from './incomeEngine';

/** The one AssetType that represents long-term retirement savings — kept
 * as a single internal type (super/401(k)/IRA/pension all map to this),
 * with the specific account kind living in the asset's own free-text
 * label (e.g. "My 401(k)") rather than a new enum value per region (PRD
 * ask: avoid "Super" as the universal name, but don't over-engineer a
 * region/subtype schema this MVP doesn't need yet). */
export const RETIREMENT_ASSET_TYPE = 'super';
export const RETIREMENT_LABEL = 'Retirement Savings';

/**
 * Retirement Savings — the sum of retirement-account assets. Deliberately
 * its own function (not folded into "other assets") so every screen that
 * needs "is this accessible today" can exclude it consistently (PRD ask:
 * retirement savings must never be treated as accessible cash).
 */
export function computeRetirementSavings(data: AppData): number {
  return data.assets.filter((a) => a.type === RETIREMENT_ASSET_TYPE).reduce((sum, a) => sum + a.currentValue, 0);
}

/**
 * Accessible Net Worth — every accessible asset (cash, savings, personal
 * investments, property, other) minus all liabilities. Excludes Retirement
 * Savings entirely (PRD ask: a $1M net worth that's actually $950k
 * inaccessible retirement savings reads very differently to a user than
 * $1M they could act on today).
 */
export function computeAccessibleNetWorth(data: AppData): number {
  const accessibleAssets = data.assets
    .filter((a) => a.type !== RETIREMENT_ASSET_TYPE)
    .reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  return accessibleAssets - totalLiabilities;
}

/** Total Wealth — Accessible Net Worth + Retirement Savings. The "big
 * picture" number; Accessible Net Worth is the "what can I act on today"
 * number. Never used interchangeably (PRD ask). */
export function computeTotalWealth(data: AppData): number {
  return computeAccessibleNetWorth(data) + computeRetirementSavings(data);
}

/** Essential monthly expenses — fixed recurring bills plus credit card
 * minimums. Same figure Safe to Spend, Money Flow, and Lulu Score all use
 * for "what MUST go out every month" (re-exported from safeToSpend.ts,
 * which owns the calculation, so there's only ever one implementation). */
export { computeFixedCosts as computeEssentialExpenses } from './safeToSpend';

/**
 * Monthly-equivalent required debt repayments — mortgage/car/personal loan
 * repayments (via their linked recurring bill) plus credit card minimum
 * payments. Deliberately narrower than "essential expenses": rent and
 * utilities are essential but aren't debt repayments, so Debt Health's
 * Repayment Pressure factor needs this, not computeEssentialExpenses.
 *
 * Deliberately reads `minimumPayment`, NOT the Expected Monthly Repayment
 * resolver (PRD ask, regression-protection review): Repayment Pressure
 * measures debt-servicing burden relative to income, and a higher value
 * here makes the score WORSE (see luluScore.ts's repaymentFraction — ratio
 * <=0 scores best, higher ratio scores worse). Expected Monthly Repayment
 * is a user-editable *intention*, not a contractual obligation or observed
 * behaviour — routing it here would let a user raise or lower their own
 * score by editing an unfulfilled plan (understate it to look
 * lower-pressure, or an unrealistic overstatement would wrongly worsen the
 * score even though nothing about their real financial position changed).
 * `minimumPayment` is comparatively harder to game this way: it's no
 * longer collected by the Add/Edit Credit Card form as a "your normal
 * plan" figure at all — it specifically represents the contractual minimum
 * the provider requires, a fact about the card, not the user's stated
 * intent.
 */
export function computeDebtRepaymentsMonthly(data: AppData): number {
  const linkedBillRepayments = data.recurringItems
    .filter((r) => r.type === 'expense' && r.active && !!r.linkedLiabilityId)
    .reduce((sum, r) => sum + toMonthlyAmount(r.amount, r.frequency), 0);
  const creditCardMinimums = data.creditCards.reduce((sum, c) => sum + c.minimumPayment, 0);
  return linkedBillRepayments + creditCardMinimums;
}
