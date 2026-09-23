/**
 * Pass C.1 — pure presentation adapter that turns already-computed
 * authoritative data into the pay-cycle timeline's event markers. It owns NO
 * financial logic of its own: it neither enumerates recurrences, selects
 * repayments, matches amounts to dates, nor sums a projection. It only
 * READS:
 *   - Available-Until-Payday mode  ← `SafeToSpendResult.datedDeductions`
 *     (AUP's own provenance for the exact commitments it subtracted) plus
 *     its `cycleStart`/`cycleEnd` span. No income marker ever appears here,
 *     because AUP adds no future income to the amount it shows.
 *   - Selected-date (scenario) mode ← the canonical A3 `ProjectedEvent[]`
 *     (the identical stream Pass B folds into its estimate) plus the Pass B
 *     `LookAheadResult` for the first-shortfall marker.
 *
 * Positions are integer calendar-day offsets divided by the integer span
 * (A2 `daysBetween`) — never millisecond division, never `toISOString`, never
 * UTC parsing. Same-kind events on the same local day are aggregated into one
 * marker (count + summed cents) without discarding any; different kinds on the
 * same day stay distinct markers (a diamond and a circle are not the same
 * glyph), so the rail is never colour-only.
 */
import { LookAheadResult } from './lookAheadProjection';
import { ProjectedEvent } from './projectedEvents';
import { AupDatedDeduction, SafeToSpendResult } from './safeToSpend';
import { LocalDate, addCalendarDays, compareLocalDates, daysBetween, localDateFromDate, localDatesEqual, toISODate } from './localCalendar';

/**
 * `income` — assumed income the selected-date estimate INCLUDES (scenario).
 * `expected_income` (Pass C.3) — scheduled income before the payday that AUP
 *   deliberately does NOT add (the amount shown never changes because of it);
 *   surfaced on Pay cycle progress only so a dated expected payment the
 *   customer can see in What happens next is also discoverable on the rail.
 */
export type RailMarkerKind = 'income' | 'expected_income' | 'bill' | 'payday_endpoint' | 'shortfall';

/** Pass C.3 — the accessible meaning of an expected-income marker on the pay
 * cycle rail, stated every time so it is never mistaken for money AUP added. */
export const EXPECTED_INCOME_NOT_INCLUDED = 'Expected income — not included in Available until payday';

/** Pass D.3 — one canonical event behind a pay-cycle marker, carried so a tap can
 * show it. Identity is the SAME occurrence id AUP / A3 already assigned; nothing is
 * re-enumerated or matched by amount or date. */
export interface RailMarkerEvent {
  occurrenceId: string;
  sourceId: string;
  sourceKind: ProjectedEvent['sourceKind'];
  date: LocalDate;
  label: string;
  signedCents: number;
  typeLabel: string;
  /** True when AUP subtracted it; false for expected income and the payday. */
  included: boolean;
}

export interface RailMarker {
  /** Stable, deterministic key (kind + iso date) for React and dedup. */
  key: string;
  kind: RailMarkerKind;
  /** 0..1 position along the rail, clamped. */
  position: number;
  date: LocalDate;
  /** Number of underlying occurrences aggregated into this marker (≥1). */
  count: number;
  /** Signed dollars for the aggregated occurrences (income +, outflow −).
   * Absent for the payday endpoint and the shortfall marker. */
  signedAmount?: number;
  /** Whether this event is part of the amount the card currently shows. The
   * payday endpoint and the shortfall marker are deliberately NOT included. */
  included: boolean;
  label: string;
  /** Pass D.3 — the canonical events this marker stands for (pay-cycle rail). A
   * marker with none is decorative and never interactive. */
  events?: RailMarkerEvent[];
}

export interface TimelineRail {
  mode: 'aup' | 'scenario';
  startDate: LocalDate;
  endDate: LocalDate;
  /** Inclusive integer day span (≥1) used as the positioning denominator. */
  spanDays: number;
  markers: RailMarker[];
  /** One composed screen-reader sentence describing the whole rail. */
  spoken: string;
}

function positionFor(start: LocalDate, span: number, date: LocalDate): number {
  if (span <= 0) return 0;
  const offset = daysBetween(start, date);
  return Math.min(1, Math.max(0, offset / span));
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Aggregate same-kind, same-day entries into one marker without losing any. */
function aggregate(
  entries: { kind: RailMarkerKind; date: LocalDate; signedAmount: number; included: boolean; label: string; event?: RailMarkerEvent }[],
  start: LocalDate,
  span: number
): RailMarker[] {
  const byKey = new Map<string, RailMarker>();
  for (const e of entries) {
    const key = `${e.kind}:${toISODate(e.date)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.signedAmount = (existing.signedAmount ?? 0) + e.signedAmount;
      existing.label = `${existing.count} payments on ${toISODate(e.date)} — ${money(existing.signedAmount ?? 0)}${e.kind === 'expected_income' ? ` · ${EXPECTED_INCOME_NOT_INCLUDED}` : ''}`;
      if (e.event) existing.events = [...(existing.events ?? []), e.event];
    } else {
      byKey.set(key, {
        key,
        kind: e.kind,
        position: positionFor(start, span, e.date),
        date: e.date,
        count: 1,
        signedAmount: e.signedAmount,
        included: e.included,
        label: e.label,
        ...(e.event ? { events: [e.event] } : {}),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => compareLocalDates(a.date, b.date) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/**
 * Available-Until-Payday rail: elapsed-time span from the (estimated) cycle
 * start to the next payday, marked with the exact commitments AUP subtracted
 * and the payday endpoint (explicitly NOT included in the amount). Returns
 * null when there is no known payday — AUP shows no rail in that state, and
 * this adapter never invents one.
 */
export function buildAupRail(safeToSpend: SafeToSpendResult, asOf: LocalDate, expectedIncome: ProjectedEvent[] = []): TimelineRail | null {
  if (!safeToSpend.hasKnownPayday) return null;
  const startDate = localDateFromDate(safeToSpend.cycleStart);
  const endDate = localDateFromDate(safeToSpend.cycleEnd);
  const spanDays = Math.max(1, daysBetween(startDate, endDate));

  const billEntries = safeToSpend.datedDeductions.map((d: AupDatedDeduction) => {
    const date = localDateFromDate(d.date);
    const signedCents = -Math.round(Math.abs(d.amount) * 100);
    return {
      kind: 'bill' as const,
      date,
      signedAmount: -Math.abs(d.amount),
      included: true,
      label: `${d.label} — ${money(-Math.abs(d.amount))}`,
      // Pass D.3 — the SAME occurrence AUP deducted, by its own identity; a
      // BNPL occurrence without a linked schedule gets a deterministic stand-in.
      event: {
        occurrenceId: d.occurrenceId ?? `aup:${d.kind}:${d.sourceId}:${toISODate(date)}`,
        sourceId: d.sourceId,
        sourceKind: d.kind,
        date,
        label: d.label,
        signedCents,
        typeLabel: d.kind === 'card' ? 'Scheduled card repayment' : d.kind === 'bnpl' ? 'Scheduled BNPL repayment' : 'Scheduled bill',
        included: true,
      } satisfies RailMarkerEvent,
    };
  });

  // Pass C.3 — expected income BEFORE the payday, read from the SAME canonical
  // A3 occurrence stream What happens next lists (never re-enumerated here).
  // Marked, never added: `included` is false and the label says so. Income
  // ON the payday date is the payday endpoint below (also not included), so
  // it is not duplicated as a second marker.
  const incomeEvent = (e: ProjectedEvent): RailMarkerEvent => ({
    occurrenceId: e.occurrenceId,
    sourceId: e.sourceId,
    sourceKind: e.sourceKind,
    date: e.date,
    label: e.label,
    signedCents: e.signedCents,
    typeLabel: 'Expected income',
    included: false,
  });
  const eligibleIncome = expectedIncome.filter((e) => e.sourceKind === 'income' && e.inclusion === 'included' && e.signedCents > 0);
  const expectedEntries = eligibleIncome
    .filter((e) => compareLocalDates(e.date, asOf) >= 0 && compareLocalDates(e.date, endDate) < 0)
    .map((e) => ({
      kind: 'expected_income' as const,
      date: e.date,
      signedAmount: e.signedCents / 100,
      included: false,
      label: `${e.label} — ${money(e.signedCents / 100)} · ${EXPECTED_INCOME_NOT_INCLUDED}`,
      event: incomeEvent(e),
    }));
  // Pass D.3 — income landing ON the payday is the payday itself: the endpoint carries
  // those canonical events (so a tap can explain the exclusion) but stays decorative
  // when no such event exists.
  const paydayEvents = eligibleIncome.filter((e) => compareLocalDates(e.date, endDate) === 0).map(incomeEvent);

  const markers = aggregate([...billEntries, ...expectedEntries], startDate, spanDays);
  // Payday endpoint — pinned to the right edge, disclosed as not included.
  markers.push({
    key: `payday_endpoint:${toISODate(endDate)}`,
    kind: 'payday_endpoint',
    position: 1,
    date: endDate,
    count: 1,
    included: false,
    label: 'Expected payday — not included in this amount',
    ...(paydayEvents.length > 0 ? { events: paydayEvents } : {}),
  });

  const billCount = billEntries.length;
  const expectedCount = expectedEntries.length;
  const expectedPart =
    expectedCount === 0
      ? ''
      : ` ${expectedCount} expected income ${expectedCount === 1 ? 'payment' : 'payments'} before then ${expectedCount === 1 ? 'is' : 'are'} shown but not included in this amount.`;
  const spoken =
    billCount === 0
      ? `No bills are scheduled before your next payday on ${toISODate(endDate)}, which is not included in this amount.${expectedPart}`
      : `${billCount} scheduled ${billCount === 1 ? 'bill' : 'bills'} before your next payday on ${toISODate(endDate)}. Your payday is not included in this amount.${expectedPart}`;

  return { mode: 'aup', startDate, endDate, spanDays, markers, spoken };
}

/**
 * Selected-date (scenario) rail: from as-of through the selected target day,
 * marked with the canonical A3 included events (green assumed income, amber
 * scheduled outflows) and the first potential shortfall from the Pass B
 * result. `events` MUST be the same `computeProjectedEvents(data, asOf,
 * target, { windowStart: asOf })` stream Pass B consumed, so a marker can
 * never disagree with the estimate.
 */
export function buildScenarioRail(events: ProjectedEvent[], result: Extract<LookAheadResult, { available: true }>): TimelineRail {
  const startDate = result.asOf;
  const endDate = result.target;
  const spanDays = Math.max(1, daysBetween(startDate, endDate));

  const entries = events
    .filter((e) => e.inclusion === 'included' && e.signedCents !== 0)
    .map((e) => ({
      kind: (e.sourceKind === 'income' ? 'income' : 'bill') as RailMarkerKind,
      date: e.date,
      signedAmount: e.signedCents / 100,
      included: true,
      label: `${e.label} — ${money(e.signedCents / 100)}`,
    }));

  const markers = aggregate(entries, startDate, spanDays);

  if (result.firstShortfall) {
    const sd = result.firstShortfall.date;
    markers.push({
      key: `shortfall:${toISODate(sd)}`,
      kind: 'shortfall',
      position: positionFor(startDate, spanDays, sd),
      date: sd,
      count: 1,
      included: false,
      label: `First potential shortfall on ${toISODate(sd)} — ${money(-result.firstShortfall.shortfallCents / 100)}`,
    });
    markers.sort((a, b) => compareLocalDates(a.date, b.date) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  }

  const incomeCount = entries.filter((e) => e.kind === 'income').length;
  const billCount = entries.filter((e) => e.kind === 'bill').length;
  const shortfallPart = result.firstShortfall
    ? ` A potential shortfall is estimated on ${toISODate(result.firstShortfall.date)}.`
    : ' No shortfall is expected before this date.';
  const spoken = `Timeline to ${toISODate(endDate)}: ${incomeCount} assumed income ${incomeCount === 1 ? 'payment' : 'payments'} and ${billCount} scheduled ${billCount === 1 ? 'bill' : 'bills'}.${shortfallPart}`;

  return { mode: 'scenario', startDate, endDate, spanDays, markers, spoken };
}

/** True when the given local dates land on the same civil day. Exposed so
 * consumers can test endpoint coincidence without re-deriving day math. */
export function railDatesEqual(a: LocalDate, b: LocalDate): boolean {
  return localDatesEqual(a, b);
}

// ---------------------------------------------------------------------------
// Pass C.2 closure — density-aware presentation of long horizons
// ---------------------------------------------------------------------------

/** Above this many days the rail groups markers by week (presentation only). */
export const RAIL_WEEKLY_THRESHOLD_DAYS = 35;

export interface RailBin {
  key: string;
  startDate: LocalDate;
  endDate: LocalDate;
  /** 0..1 position of the bin's centre (weekly) or the exact date (exact). */
  position: number;
  incomeCount: number;
  /** Pass C.3 — expected (not included) income payments on the AUP rail. */
  expectedIncomeCount: number;
  billCount: number;
  shortfallCount: number;
  paydayEndpointCount: number;
  incomeAmount: number;
  expectedIncomeAmount: number;
  billAmount: number;
  /** The kinds present, in the fixed glyph order, each once. */
  kinds: RailMarkerKind[];
  /** The underlying markers — nothing is dropped, only grouped. */
  markers: RailMarker[];
  /** Screen-reader sentence: exact counts, date range and categories. */
  label: string;
}

export interface RailDensity {
  mode: 'exact' | 'weekly';
  bins: RailBin[];
  /** Customer-facing note when grouping is in effect, else null. */
  disclosure: string | null;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIND_ORDER_DENSITY: Record<RailMarkerKind, number> = { income: 0, expected_income: 0, bill: 1, shortfall: 2, payday_endpoint: 3 };
const dayLong = (d: LocalDate) => `${d.day} ${MONTHS_LONG[d.month - 1]}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const KIND_PHRASE: Record<RailMarkerKind, string> = {
  income: 'assumed income',
  expected_income: 'expected income, not included',
  bill: 'bills or repayments',
  shortfall: 'a potential shortfall',
  payday_endpoint: 'your payday, not included',
};

function binLabel(bin: Omit<RailBin, 'label'>, weekly: boolean): string {
  // Exact (per-date) mode keeps the accepted C1-01 phrasing — date + kinds
  // ("10 September: assumed income and bills or repayments"); the detailed
  // counts/amounts are what a grouped WEEK needs to stay understandable.
  if (!weekly) {
    const parts = bin.kinds.map((k) => KIND_PHRASE[k]);
    const list = parts.length <= 1 ? parts[0] ?? 'no events' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `${dayLong(bin.startDate)}: ${list}`;
  }
  const when = weekly
    ? localDatesEqual(bin.startDate, bin.endDate)
      ? dayLong(bin.startDate)
      : `${dayLong(bin.startDate)} to ${dayLong(bin.endDate)}`
    : dayLong(bin.startDate);
  const parts: string[] = [];
  if (bin.incomeCount > 0) parts.push(`${plural(bin.incomeCount, 'assumed income payment', 'assumed income payments')} totalling ${money(bin.incomeAmount)}`);
  if (bin.expectedIncomeCount > 0) parts.push(`${plural(bin.expectedIncomeCount, 'expected income payment', 'expected income payments')} totalling ${money(bin.expectedIncomeAmount)}, not included`);
  if (bin.billCount > 0) parts.push(`${plural(bin.billCount, 'bill or repayment', 'bills or repayments')} totalling ${money(bin.billAmount)}`);
  if (bin.shortfallCount > 0) parts.push('a potential shortfall');
  if (bin.paydayEndpointCount > 0) parts.push('your payday, not included');
  const list = parts.length <= 1 ? parts[0] ?? 'no events' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${when}: ${list}`;
}

function makeBin(key: string, startDate: LocalDate, endDate: LocalDate, position: number, markers: RailMarker[], weekly: boolean): RailBin {
  const sorted = [...markers].sort((a, b) => compareLocalDates(a.date, b.date) || KIND_ORDER_DENSITY[a.kind] - KIND_ORDER_DENSITY[b.kind]);
  const count = (k: RailMarkerKind) => sorted.filter((m) => m.kind === k).reduce((n, m) => n + m.count, 0);
  const amount = (k: RailMarkerKind) => sorted.filter((m) => m.kind === k).reduce((n, m) => n + (m.signedAmount ?? 0), 0);
  const kinds = [...new Set(sorted.map((m) => m.kind))].sort((a, b) => KIND_ORDER_DENSITY[a] - KIND_ORDER_DENSITY[b]);
  const partial = {
    key,
    startDate,
    endDate,
    position,
    incomeCount: count('income'),
    expectedIncomeCount: count('expected_income'),
    billCount: count('bill'),
    shortfallCount: count('shortfall'),
    paydayEndpointCount: count('payday_endpoint'),
    incomeAmount: amount('income'),
    expectedIncomeAmount: amount('expected_income'),
    billAmount: amount('bill'),
    kinds,
    markers: sorted,
  };
  return { ...partial, label: binLabel(partial, weekly) };
}

/**
 * Decide how densely a rail is drawn. Short horizons keep one bin per local
 * date (exact, C1-01 clusters). Long horizons (> RAIL_WEEKLY_THRESHOLD_DAYS)
 * group markers into 7-day bins from the rail start, each bin centred on its
 * midpoint and disclosed as "Events grouped by week". Canonical events and
 * the underlying markers are untouched; nothing is dropped from any
 * calculation — this is presentation only. Deterministic and pure.
 */
export function resolveRailDensity(rail: TimelineRail, thresholdDays: number = RAIL_WEEKLY_THRESHOLD_DAYS): RailDensity {
  const weekly = rail.spanDays > thresholdDays;
  if (!weekly) {
    const byDate = new Map<string, RailMarker[]>();
    for (const m of rail.markers) {
      const iso = toISODate(m.date);
      (byDate.get(iso) ?? byDate.set(iso, []).get(iso)!).push(m);
    }
    const bins = [...byDate.entries()].map(([iso, markers]) => makeBin(iso, markers[0].date, markers[0].date, markers[0].position, markers, false));
    bins.sort((a, b) => compareLocalDates(a.startDate, b.startDate));
    return { mode: 'exact', bins, disclosure: null };
  }
  const byWeek = new Map<number, RailMarker[]>();
  for (const m of rail.markers) {
    const offset = Math.max(0, daysBetween(rail.startDate, m.date));
    const w = Math.floor(offset / 7);
    (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(m);
  }
  const bins = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, markers]) => {
      const startOffset = w * 7;
      const endOffset = Math.min(rail.spanDays, startOffset + 6);
      const start = addDaysLocal(rail.startDate, startOffset);
      const end = addDaysLocal(rail.startDate, endOffset);
      const position = Math.min(1, Math.max(0, (startOffset + endOffset) / 2 / rail.spanDays));
      return makeBin(`week-${w}`, start, end, position, markers, true);
    });
  return { mode: 'weekly', bins, disclosure: 'Events grouped by week' };
}

function addDaysLocal(d: LocalDate, n: number): LocalDate {
  return addCalendarDays(d, n);
}
