import { PayFrequency, RecurringItem } from '../../types/models';

const WEEKS_PER_MONTH = 52 / 12;
const FORTNIGHTS_PER_MONTH = 26 / 12;

/**
 * One shared income calculation engine (PRD ask) — every feature (Money
 * Engine, Safe to Spend, bills, goals, Lulu Score, recommendations) must
 * normalize a frequency-based amount to its true monthly equivalent the
 * same way. Previously each caller re-implemented this inline, and the
 * income entry flow didn't convert at all — "$1,000 weekly" was stored and
 * treated as "$1,000/month" everywhere (PRD bug report).
 */
export function toMonthlyAmount(amount: number, frequency: PayFrequency | string): number {
  switch (frequency) {
    case 'weekly':
      return amount * WEEKS_PER_MONTH;
    case 'fortnightly':
      return amount * FORTNIGHTS_PER_MONTH;
    default:
      return amount; // monthly, or irregular — already a monthly-scale figure
  }
}

/**
 * Multiple income sources (PRD ask, §3) — each source is a `RecurringItem`
 * of type 'income', reusing the exact same CRUD and per-instance amount/
 * frequency shape bills already use, rather than a second parallel model.
 * The rest of the app (Money Engine, Safe to Spend, Lulu Score, Money Plan,
 * timeline, reminders — every one of `user.monthlyIncome`'s ~25 existing
 * readers) keeps reading a single aggregate figure; only how that figure
 * gets produced changes, in AppStateContext's persist pipeline.
 */
export function computeTotalMonthlyIncome(recurringItems: RecurringItem[]): number {
  return recurringItems
    .filter((r) => r.type === 'income' && r.active)
    .reduce((sum, r) => sum + toMonthlyAmount(r.amount, r.frequency), 0);
}

/**
 * The income source that anchors Safe to Spend's cycle boundary and the
 * app-wide "next payday" — whichever active source has the soonest known
 * date. Sources with no known date (irregular, "I don't know when") are
 * only used as a fallback so a user with exclusively unpredictable income
 * still has *something* to show, never invented as if it were known.
 *
 * Phase 1 limitation: this is a *derived* heuristic, not a stable,
 * user-selected concept — there is no `isPrimary` field on `RecurringItem`.
 * For a user with a single income source this is unambiguous; for someone
 * with multiple sources, "primary" can shift silently (e.g. adding a
 * nearer-dated one-off recurring item can temporarily outrank an
 * established salary). Savings Allocation's cycle math and the primary-cycle
 * concept generally are built on this same heuristic (PRD ask, "Phase 1
 * Product Rule": one primary pay cycle, not per-income-source). A Phase 2
 * candidate is an explicit, user-selected primary pay cycle for people with
 * multiple income sources, rather than continuing to infer it here.
 */
export function findPrimaryIncomeItem(recurringItems: RecurringItem[]): RecurringItem | null {
  const active = recurringItems.filter((r) => r.type === 'income' && r.active);
  const withKnownDate = active
    .filter((r) => !r.nextDueDateUnknown)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  if (withKnownDate.length > 0) return withKnownDate[0];
  return active[0] ?? null;
}

export function frequencyAdverb(frequency: PayFrequency): string {
  switch (frequency) {
    case 'weekly':
      return 'weekly';
    case 'fortnightly':
      return 'fortnightly';
    case 'monthly':
      return 'monthly';
    case 'irregular':
    default:
      return 'irregularly';
  }
}

/** The planning periods Money Flow can be viewed in — deliberately just
 * these three, matching Australian pay cycles (PRD ask: "not everyone
 * plans monthly"). */
export type FlowPeriod = 'weekly' | 'fortnightly' | 'monthly';

/** Inverse of toMonthlyAmount — scales a normalized monthly figure down to
 * a given planning period so Money Flow can be viewed weekly/fortnightly
 * without re-deriving every underlying calculation. */
export function fromMonthlyAmount(monthlyAmount: number, period: FlowPeriod): number {
  switch (period) {
    case 'weekly':
      return monthlyAmount / WEEKS_PER_MONTH;
    case 'fortnightly':
      return monthlyAmount / FORTNIGHTS_PER_MONTH;
    default:
      return monthlyAmount;
  }
}

export function flowPeriodNoun(period: FlowPeriod): string {
  switch (period) {
    case 'weekly':
      return 'week';
    case 'fortnightly':
      return 'fortnight';
    default:
      return 'month';
  }
}
