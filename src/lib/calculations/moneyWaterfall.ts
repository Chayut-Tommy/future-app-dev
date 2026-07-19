/**
 * Pure presentation-layer rounding helper — not a financial calculation.
 * Rounds an income figure and a set of deductions to whole dollars
 * independently (matching formatMoney's own Math.round), then derives the
 * net as a "balancing plug" from those already-rounded values rather than
 * independently rounding a raw net. Guarantees the numbers actually shown
 * on screen always sum exactly (PRD bug report: independently rounding
 * every row could disagree by $1 whenever any input had a fractional-dollar
 * value — verified in ~21% of realistic weekly/fortnightly Typical Money
 * Flow conversions, and possible in Typical Monthly Allocation whenever
 * Savings and/or Goals land on a fractional dollar). Shared by Typical
 * Money Flow (income, [bills, savingsAndGoals]) and Typical Monthly
 * Allocation (income, [bills, savings, goals]) so both cards can never
 * drift onto different rounding behaviour.
 */
export interface DisplayedWaterfall {
  displayedIncome: number;
  /** Same order as the `deductions` argument. */
  displayedDeductions: number[];
  /** displayedIncome minus the sum of displayedDeductions — the exact
   * number the final row (Remainder/Unallocated or Shortfall) must show.
   * `< 0` is the shortfall condition — callers check this directly rather
   * than through a separate boolean, so there's only one place the
   * shortfall condition is ever expressed. */
  displayedNet: number;
}

export function deriveDisplayedWaterfall(income: number, deductions: number[]): DisplayedWaterfall {
  const displayedIncome = Math.round(income);
  const displayedDeductions = deductions.map((d) => Math.round(d));
  const displayedNet = displayedDeductions.reduce((net, d) => net - d, displayedIncome);
  return { displayedIncome, displayedDeductions, displayedNet };
}
