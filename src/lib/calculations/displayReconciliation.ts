/**
 * Pure presentation-layer rounding helper — not a financial calculation,
 * and not a variant of the underlying goal-allocation engine (Stream A
 * final correction pass §2). Solves the same class of problem
 * `deriveDisplayedWaterfall` (moneyWaterfall.ts) already solves for Typical
 * Money Flow/Typical Monthly Allocation's fixed named rows, extended to an
 * arbitrary-length list of same-occurrence goal-contribution rows in "What
 * Happens Next": independently rounding each row (`Math.round` per row) can
 * disagree by a dollar or more with rounding their combined total, purely
 * because per-row fractional cents round in different directions (PRD bug
 * report: three goal rows summed to $2,305 while the combined goal
 * allocation for the same occurrence displayed $2,306).
 *
 * Uses the largest-remainder method (Hamilton's apportionment): floor every
 * magnitude to whole dollars, then hand the shortfall — the gap between the
 * floor sum and the rounded combined total, itself derived from the exact
 * same raw magnitudes passed in, never a separately-imported total whose
 * time horizon might differ — to whichever rows have the largest fractional
 * remainder, ties broken by ascending id. Deterministic and stable: the same
 * set of {id, amount} pairs always produces the same {id, displayAmount}
 * mapping regardless of array order.
 *
 * SIGN CONTRACT (Stream A follow-up §2): this helper apportions absolute
 * magnitudes and reapplies each input event's own sign afterward. It has
 * only ever been validated against — and is only intended for — a group
 * where every raw amount shares the same sign, which is the current, only
 * approved goal-contribution model (`allocatedMonthly` and `cycleFraction`
 * are both provably non-negative in goalAllocation.ts/safeToSpend.ts, so a
 * goal-contribution event is always <= 0). Passing a genuinely mixed-sign
 * group will not throw, but the result has no defined financial meaning —
 * a real mixed-sign apportionment would need a separately designed
 * gross-vs-net rule, which is explicitly out of scope here. Do not extend
 * this helper to arbitrary mixed-sign groups without that separate design.
 */

/** Two fractional remainders within this many dollars of each other are
 * treated as an intentional tie rather than a genuine financial difference
 * (Stream A follow-up §1). Unit: dollars (the same unit as every amount
 * this helper receives). Sized to comfortably absorb ordinary
 * floating-point noise from the arithmetic that produces these amounts —
 * division by a month count, multiplication by a cycle fraction like 7/30
 * or 14/30 — which in practice lands at roughly 1e-13 to 1e-10 for amounts
 * in the range this app deals with (observed: two remainders that are
 * mathematically identical at exactly 0.3 came out as 0.30000000000001 and
 * 0.30000000000020, a difference of ~1.9e-13). At 1e-9 this tolerance is
 * still four orders of magnitude larger than that observed noise (so it
 * reliably absorbs it) while remaining seven orders of magnitude smaller
 * than the smallest real financial distinction this app ever displays (one
 * cent, 0.01) — it can never mask a genuine remainder difference.
 */
const REMAINDER_TIE_TOLERANCE_DOLLARS = 1e-9;

export interface DisplayReconcileInput {
  /** A stable, immutable identifier — used only to break ties between equal
   * (within REMAINDER_TIE_TOLERANCE_DOLLARS) fractional remainders,
   * ascending. Never used to pick a "favoured" row. */
  id: string;
  /** The raw, unrounded, signed amount for this row. Every amount in one
   * call must share the same sign — see the SIGN CONTRACT note above. */
  amount: number;
}

export interface DisplayReconcileResult {
  id: string;
  /** Whole-dollar, sign-preserved, reconciled for display only — never
   * written back to any stored or calculated value. */
  displayAmount: number;
}

export function reconcileDisplayedAmounts(events: DisplayReconcileInput[]): DisplayReconcileResult[] {
  if (events.length === 0) return [];

  const magnitudes = events.map((e) => Math.abs(e.amount));
  const rawSum = magnitudes.reduce((sum, m) => sum + m, 0);
  const displayedTotal = Math.round(rawSum);

  const floors = magnitudes.map((m) => Math.floor(m));
  const floorSum = floors.reduce((sum, f) => sum + f, 0);
  const shortfall = Math.max(0, displayedTotal - floorSum);

  // Remainders within REMAINDER_TIE_TOLERANCE_DOLLARS of each other are
  // treated as exactly equal — ties resolved purely by ascending id, never
  // by which one happens to carry a slightly larger float-noise residue.
  // (Scope note: this epsilon comparison is not guaranteed transitive
  // across a long chain of near-equal values — acceptable for the small,
  // bounded goal-event groups this helper is ever called with; not
  // intended as a general-purpose epsilon-sort utility.)
  const remainders = events
    .map((e, index) => ({ index, id: e.id, remainder: magnitudes[index] - floors[index] }))
    .sort((a, b) => {
      const diff = b.remainder - a.remainder;
      if (Math.abs(diff) > REMAINDER_TIE_TOLERANCE_DOLLARS) return diff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const bumpedIndices = new Set(remainders.slice(0, shortfall).map((r) => r.index));

  return events.map((e, index) => {
    const magnitude = floors[index] + (bumpedIndices.has(index) ? 1 : 0);
    const sign = e.amount < 0 ? -1 : 1;
    return { id: e.id, displayAmount: sign * magnitude };
  });
}
