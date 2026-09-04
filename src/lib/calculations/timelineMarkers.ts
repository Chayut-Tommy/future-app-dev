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
import { LocalDate, compareLocalDates, daysBetween, localDateFromDate, localDatesEqual, toISODate } from './localCalendar';

export type RailMarkerKind = 'income' | 'bill' | 'payday_endpoint' | 'shortfall';

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
  entries: { kind: RailMarkerKind; date: LocalDate; signedAmount: number; included: boolean; label: string }[],
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
      existing.label = `${existing.count} payments on ${toISODate(e.date)} — ${money(existing.signedAmount ?? 0)}`;
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
export function buildAupRail(safeToSpend: SafeToSpendResult, asOf: LocalDate): TimelineRail | null {
  if (!safeToSpend.hasKnownPayday) return null;
  const startDate = localDateFromDate(safeToSpend.cycleStart);
  const endDate = localDateFromDate(safeToSpend.cycleEnd);
  const spanDays = Math.max(1, daysBetween(startDate, endDate));

  const billEntries = safeToSpend.datedDeductions.map((d: AupDatedDeduction) => ({
    kind: 'bill' as const,
    date: localDateFromDate(d.date),
    signedAmount: -Math.abs(d.amount),
    included: true,
    label: `${d.label} — ${money(-Math.abs(d.amount))}`,
  }));

  const markers = aggregate(billEntries, startDate, spanDays);
  // Payday endpoint — pinned to the right edge, disclosed as not included.
  markers.push({
    key: `payday_endpoint:${toISODate(endDate)}`,
    kind: 'payday_endpoint',
    position: 1,
    date: endDate,
    count: 1,
    included: false,
    label: 'Expected payday — not included in this amount',
  });

  const billCount = billEntries.length;
  const spoken =
    billCount === 0
      ? `No bills are scheduled before your next payday on ${toISODate(endDate)}, which is not included in this amount.`
      : `${billCount} scheduled ${billCount === 1 ? 'bill' : 'bills'} before your next payday on ${toISODate(endDate)}. Your payday is not included in this amount.`;

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
