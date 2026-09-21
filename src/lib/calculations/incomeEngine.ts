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

// ---------------------------------------------------------------------------
// Pass C.2 closure — the EXPLICIT Main payday authority (founder decision)
// ---------------------------------------------------------------------------

/**
 * Which income source anchors Available Until Payday and the Look Ahead
 * guard. Replaces the inferred "soonest date" heuristic above as the
 * financial authority (that heuristic let a $1,000 weekly side income silently
 * take over from a $5,000 fortnightly salary after a confirmation).
 *
 *  - `none`       — no active income source: no payday can be known.
 *  - `single`     — exactly one active source: it is authoritative
 *                   automatically (no choice needed, nothing persisted).
 *  - `selected`   — several sources and `mainPaydayIncomeId` names one of
 *                   them (matched by stable id only — never by label, amount,
 *                   date or position).
 *  - `unselected` — several sources and no id recorded: FAIL CLOSED and ask
 *                   the customer to choose. Never the largest, earliest, most
 *                   recently confirmed or first-created source.
 *  - `invalid`    — several sources and the recorded id no longer names an
 *                   active income (deleted/deactivated/corrupt): fail closed
 *                   exactly like `unselected`; replacing it needs a new
 *                   explicit choice.
 *
 * Pure and read-only: it never persists a guess.
 */
export type MainPaydayResolution =
  | { status: 'none'; source: null; candidates: RecurringItem[] }
  | { status: 'single'; source: RecurringItem; candidates: RecurringItem[] }
  | { status: 'selected'; source: RecurringItem; candidates: RecurringItem[] }
  | { status: 'unselected'; source: null; candidates: RecurringItem[] }
  | { status: 'invalid'; source: null; candidates: RecurringItem[] };

export type MainPaydayStatus = MainPaydayResolution['status'];

export function resolveMainPayday(recurringItems: RecurringItem[], mainPaydayIncomeId: string | null | undefined): MainPaydayResolution {
  const candidates = recurringItems.filter((r) => r.type === 'income' && r.active);
  if (candidates.length === 0) return { status: 'none', source: null, candidates };
  if (candidates.length === 1) return { status: 'single', source: candidates[0], candidates };
  if (typeof mainPaydayIncomeId !== 'string' || mainPaydayIncomeId.length === 0) return { status: 'unselected', source: null, candidates };
  const chosen = candidates.find((r) => r.id === mainPaydayIncomeId);
  if (!chosen) return { status: 'invalid', source: null, candidates };
  return { status: 'selected', source: chosen, candidates };
}

/** True when the customer must choose before a payday can be asserted. */
export function mainPaydayNeedsChoice(status: MainPaydayStatus): boolean {
  return status === 'unselected' || status === 'invalid';
}

/**
 * Pass C.4 — whether an income source can BE the Main payday: it must be an
 * active income on a predictable cadence with a known, valid next expected
 * payment, because the Main payday's only job is to give Available until
 * payday a real pay-cycle date. Irregular, inactive, undated or invalid
 * sources cannot produce one. Identity is never part of this check — the
 * authority stays `user.mainPaydayIncomeId`; no per-income flag exists.
 */
export function isEligibleMainPaydaySource(item: Pick<RecurringItem, 'type' | 'active' | 'frequency' | 'nextDueDate' | 'nextDueDateUnknown'>): boolean {
  if (item.type !== 'income' || !item.active) return false;
  if (item.frequency === 'irregular') return false;
  if (item.nextDueDateUnknown) return false;
  if (!item.nextDueDate) return false;
  return Number.isFinite(new Date(item.nextDueDate).getTime());
}

/**
 * Pass C.5 — the ONE list every Main-payday entry point offers (the Money
 * chooser, the Wealth income-sources chooser and the income editor all read
 * `isEligibleMainPaydaySource`). Active incomes are split into the sources a
 * customer CAN choose and the ones they cannot, each with the same
 * plain-language reason the editor shows, so no surface can offer a source
 * another refuses.
 */
export function listMainPaydayChoices(recurringItems: RecurringItem[]): { eligible: RecurringItem[]; ineligible: { item: RecurringItem; reason: string }[] } {
  const active = recurringItems.filter((r) => r.type === 'income' && r.active);
  const eligible = active.filter((r) => isEligibleMainPaydaySource(r));
  const ineligible = active.filter((r) => !isEligibleMainPaydaySource(r)).map((item) => ({ item, reason: mainPaydayIneligibleReason(item) ?? '' }));
  return { eligible, ineligible };
}

/** The chooser's supporting line, naming any source that cannot be chosen. */
/** Pass C.5.1 — what choosing a Main payday actually does, in the income editor.
 * The Main payday anchors Available until payday AND the guard payday behind
 * the Look Ahead daily guide (device-observed: the 24 Oct estimate stayed
 * $18,350 while the guide moved $467 → $539 a day). No calculation reads this. */
export const MAIN_PAYDAY_EFFECT_COPY =
  'Sets the payday used for Available until payday and your daily-spend guide. Other income is still included in Look Ahead.';

export function mainPaydayChooserSubtitle(recurringItems: RecurringItem[]): string {
  // Pass C.5.2 — ONE copy authority: both choosers say exactly what the income
  // editor says (the Main payday also anchors the daily-spend guide).
  const base = MAIN_PAYDAY_EFFECT_COPY;
  const { eligible, ineligible } = listMainPaydayChoices(recurringItems);
  if (ineligible.length === 0) return base;
  const names = ineligible.map((i) => i.item.label).join(', ');
  const why = `${names} can’t be chosen: a main payday needs a regular schedule and a next expected payment date.`;
  return eligible.length === 0 ? why : `${base} ${why}`;
}

/** Plain-language reason a source cannot be chosen (null when it can). */
export function mainPaydayIneligibleReason(item: Pick<RecurringItem, 'type' | 'active' | 'frequency' | 'nextDueDate' | 'nextDueDateUnknown'>): string | null {
  if (isEligibleMainPaydaySource(item)) return null;
  if (!item.active) return 'This income is inactive, so it can’t set your pay-cycle date.';
  if (item.frequency === 'irregular') return 'Irregular income doesn’t have a predictable payday, so it can’t set your pay-cycle date.';
  return 'Add a next expected payment date to use this income as your main payday.';
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
