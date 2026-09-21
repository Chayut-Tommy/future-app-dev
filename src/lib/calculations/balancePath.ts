/**
 * Pass C.3 → C.5 — the pure presentation mapper behind the future-date
 * "Timeline to [date]" rail and its read-only event inspection.
 *
 * C.5 retired the monetary graph (y-axis, stepped/rounded balance line, shaded
 * area, endpoint bubble). What remains is graph-INDEPENDENT: the canonical
 * occurrences grouped by local date (or by week on long horizons), their
 * exact-cent totals, and the Pass B end-of-day position for each group — placed
 * on a CALENDAR-TIME rail that runs from the authoritative current pay-cycle
 * start, through Today, to the selected inclusive target date.
 *
 * It owns NO financial logic. It reads the authoritative Pass B projection
 * (`computeLookAheadProjection`'s available result — checkpoints, opening,
 * target, earliest lowest position, first shortfall) and the SAME canonical A3
 * event stream Pass B folded. It never enumerates recurrence, never sums or
 * re-derives a balance, never moves an event to another date, never deducts
 * the daily guide and never orders events within a day. Positions are integer
 * local-calendar day distances (A2), never milliseconds. Pure, read-only, no
 * React, no persistence. Pass B's daily cash path is untouched and still owns
 * the lowest position and the shortfall — it is simply no longer plotted.
 */

import { LookAheadResult } from './lookAheadProjection';
import { ProjectedEvent } from './projectedEvents';
import { LocalDate, addCalendarDays, compareLocalDates, daysBetween, localDatesEqual, toISODate } from './localCalendar';
import { RAIL_WEEKLY_THRESHOLD_DAYS } from './timelineMarkers';
import { formatCentsCentsAware } from './money';

export type LookAheadAvailable = Extract<LookAheadResult, { available: true }>;

/** Above this many horizon days the markers are grouped by week. */
export const BALANCE_PATH_WEEKLY_THRESHOLD_DAYS = RAIL_WEEKLY_THRESHOLD_DAYS;

export interface BalancePathPoint {
  /** Integer civil-day offset from the as-of date (0 = today). */
  dayIndex: number;
  date: LocalDate;
  /** Exact end-of-day cents from the engine checkpoint. */
  cents: number;
}

export type BalancePathMarkerKind = 'income' | 'outgoing' | 'shortfall';

/** One canonical A3 occurrence inside a marker group, carried through verbatim
 * (identity, source, date, exact signed cents). Nothing here is inferred from a
 * label, an amount or a date: `occurrenceId` and `sourceId` are the canonical
 * identities the projection itself folded. */
export interface BalancePathGroupEvent {
  occurrenceId: string;
  sourceId: string;
  sourceKind: ProjectedEvent['sourceKind'];
  liabilitySubtype?: ProjectedEvent['liabilitySubtype'];
  date: LocalDate;
  label: string;
  signedCents: number;
  /** "Assumed income, not received" / "Scheduled bill" / "Scheduled card
   * repayment" / "Scheduled BNPL repayment" / "Scheduled mortgage repayment" /
   * "Scheduled loan repayment". */
  typeLabel: string;
}

export interface BalancePathMarkerGroup {
  key: string;
  /** 0..1 position on the rail (rail start → target) by local-calendar day
   * distance: the exact date, or the midpoint of a weekly bucket. */
  x: number;
  /** The date whose end-of-day position the group reports (the date itself,
   * or the last date of the week). */
  anchorDate: LocalDate;
  startDate: LocalDate;
  endDate: LocalDate;
  incomeCount: number;
  incomeCents: number;
  outgoingCount: number;
  outgoingCents: number; // negative
  hasShortfall: boolean;
  /** The canonical occurrences in this group, in the canonical stream's own
   * deterministic order (never re-sorted into an intraday order). */
  events: BalancePathGroupEvent[];
  /** Exact net effect of the group's events, integer cents. */
  netCents: number;
  /** The Pass B scheduled position on `anchorDate` (end of day / end of week). */
  positionCents: number;
  /** True when this group is a weekly bucket rather than one local date. */
  weekly: boolean;
  /** The kinds present, each once, in a fixed order (income, outgoing, shortfall). */
  kinds: BalancePathMarkerKind[];
  /** Screen-reader sentence: exact counts, amounts, date (range) and position. */
  label: string;
}

/** The calendar-time rail the groups sit on. */
export interface BalancePathRail {
  /** Left endpoint: the authoritative current pay-cycle start when one is
   * known and not after today; otherwise today itself. */
  startDate: LocalDate;
  /** Whether `startDate` is the pay-cycle start (false → it is today). */
  startIsCycleStart: boolean;
  /** Right endpoint: the selected inclusive target date. */
  endDate: LocalDate;
  /** Integer local-calendar days from rail start to target (≥ 1). */
  spanDays: number;
  /** 0..1 position of Today — also the elapsed (deep blue) fraction. */
  todayX: number;
}

export interface BalancePath {
  asOf: LocalDate;
  target: LocalDate;
  horizonDays: number;
  openingCents: number;
  targetCents: number;
  lowest: { date: LocalDate; cents: number };
  firstShortfall: { date: LocalDate; shortfallCents: number } | null;
  /** The ungrouped canonical daily path (one point per Pass B checkpoint). */
  points: BalancePathPoint[];
  rail: BalancePathRail;
  /** "Timeline to 30 Oct". */
  title: string;
  markers: BalancePathMarkerGroup[];
  density: 'exact' | 'weekly';
  /** Customer-facing note when weekly grouping is in effect, else null. */
  disclosure: string | null;
  eventCounts: { income: number; outgoing: number };
  /** One composed screen-reader summary for the whole timeline. */
  summary: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortDate = (d: LocalDate) => `${d.day} ${MONTHS[d.month - 1]}`;
const longDate = (d: LocalDate) => `${d.day} ${MONTHS_LONG[d.month - 1]}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Bucket {
  key: string;
  startDate: LocalDate;
  endDate: LocalDate;
  anchorDate: LocalDate;
  incomeCount: number;
  incomeCents: number;
  outgoingCount: number;
  outgoingCents: number;
  hasShortfall: boolean;
  events: BalancePathGroupEvent[];
}

/** Customer wording for one canonical occurrence's type, from the canonical
 * source kind (and liability subtype) only. */
export function eventTypeLabel(e: Pick<ProjectedEvent, 'sourceKind' | 'liabilitySubtype' | 'signedCents'>): string {
  switch (e.sourceKind) {
    case 'income':
      return 'Assumed income, not received';
    case 'card':
      return 'Scheduled card repayment';
    case 'bnpl':
      return 'Scheduled BNPL repayment';
    case 'loan':
      return e.liabilitySubtype === 'mortgage' ? 'Scheduled mortgage repayment' : 'Scheduled loan repayment';
    case 'bill':
    default:
      return e.signedCents > 0 ? 'Assumed income, not received' : 'Scheduled bill';
  }
}

function groupLabel(b: Bucket, weekly: boolean, positionCents: number): string {
  const when = weekly && !localDatesEqual(b.startDate, b.endDate) ? `${longDate(b.startDate)} to ${longDate(b.endDate)}` : longDate(b.startDate);
  const parts: string[] = [];
  if (b.incomeCount > 0) parts.push(`${plural(b.incomeCount, 'assumed income payment', 'assumed income payments')} totalling ${formatCentsCentsAware(b.incomeCents)}`);
  if (b.outgoingCount > 0) parts.push(`${plural(b.outgoingCount, 'bill or repayment', 'bills or repayments')} totalling ${formatCentsCentsAware(b.outgoingCents)}`);
  if (b.hasShortfall) parts.push('a possible shortfall');
  const list = parts.length === 0 ? 'no events' : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const positionWord = weekly ? 'end-of-week' : 'end-of-day';
  return `${when}: ${list}. Scheduled ${positionWord} balance ${formatCentsCentsAware(positionCents)}.`;
}

/** The rail from the authoritative cycle start (when known and not in the
 * future) through today to the target. Integer civil days only. */
export function resolveRail(asOf: LocalDate, target: LocalDate, cycleStart: LocalDate | null | undefined): BalancePathRail {
  const usable = !!cycleStart && compareLocalDates(cycleStart, asOf) <= 0;
  const startDate = usable ? (cycleStart as LocalDate) : asOf;
  const spanDays = Math.max(1, daysBetween(startDate, target));
  const todayX = Math.min(1, Math.max(0, daysBetween(startDate, asOf) / spanDays));
  return { startDate, startIsCycleStart: usable && !localDatesEqual(startDate, asOf), endDate: target, spanDays, todayX };
}

/** 0..1 rail position of a local date, by calendar-day distance. */
export function railPosition(rail: BalancePathRail, date: LocalDate): number {
  return Math.min(1, Math.max(0, daysBetween(rail.startDate, date) / rail.spanDays));
}

/**
 * Build the timeline description. `events` MUST be the identical
 * `computeProjectedEvents(data, asOf, target, { windowStart: asOf })` stream
 * Pass B consumed, so a marker can never disagree with the estimate.
 * `cycleStart` is AUP's own `cycleStart` (the one authoritative owner); pass
 * null when no payday is known and the rail starts at today.
 */
export function buildBalancePath(result: LookAheadAvailable, events: ProjectedEvent[], options: { cycleStart?: LocalDate | null } = {}): BalancePath {
  const { asOf, target, checkpoints } = result;
  const horizonDays = Math.max(1, daysBetween(asOf, target));
  const openingCents = result.breakdown.openingCents;
  const rail = resolveRail(asOf, target, options.cycleStart ?? null);

  const points: BalancePathPoint[] = checkpoints.map((c) => ({ dayIndex: daysBetween(asOf, c.date), date: c.date, cents: c.endOfDayCents }));
  const byDay = new Map<number, BalancePathPoint>();
  for (const p of points) byDay.set(p.dayIndex, p);

  // Marker grouping — presentation only; the canonical events are untouched.
  // Only FUTURE canonical occurrences (as-of through the inclusive target) are
  // marked; the elapsed part of the rail is never decorated with history.
  const included = events.filter((e) => e.inclusion === 'included' && e.signedCents !== 0 && compareLocalDates(e.date, asOf) >= 0 && compareLocalDates(e.date, target) <= 0);
  const weekly = horizonDays > BALANCE_PATH_WEEKLY_THRESHOLD_DAYS;
  const buckets = new Map<string, Bucket>();
  const bucketFor = (date: LocalDate): Bucket => {
    const offset = daysBetween(asOf, date);
    const empty = { incomeCount: 0, incomeCents: 0, outgoingCount: 0, outgoingCents: 0, hasShortfall: false, events: [] as BalancePathGroupEvent[] };
    if (!weekly) {
      const key = toISODate(date);
      const existing = buckets.get(key);
      if (existing) return existing;
      const b: Bucket = { key, startDate: date, endDate: date, anchorDate: date, ...empty };
      buckets.set(key, b);
      return b;
    }
    const w = Math.floor(offset / 7);
    const key = `week-${w}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const startOffset = w * 7;
    const endOffset = Math.min(horizonDays, startOffset + 6);
    const b: Bucket = { key, startDate: addCalendarDays(asOf, startOffset), endDate: addCalendarDays(asOf, endOffset), anchorDate: addCalendarDays(asOf, endOffset), ...empty };
    buckets.set(key, b);
    return b;
  };
  let incomeTotal = 0;
  let outgoingTotal = 0;
  for (const e of included) {
    const b = bucketFor(e.date);
    b.events.push({ occurrenceId: e.occurrenceId, sourceId: e.sourceId, sourceKind: e.sourceKind, liabilitySubtype: e.liabilitySubtype, date: e.date, label: e.label, signedCents: e.signedCents, typeLabel: eventTypeLabel(e) });
    if (e.signedCents > 0) {
      b.incomeCount += 1;
      b.incomeCents += e.signedCents;
      incomeTotal += 1;
    } else {
      b.outgoingCount += 1;
      b.outgoingCents += e.signedCents;
      outgoingTotal += 1;
    }
  }
  if (result.firstShortfall) bucketFor(result.firstShortfall.date).hasShortfall = true;

  const markers: BalancePathMarkerGroup[] = [...buckets.values()]
    .sort((a, b) => compareLocalDates(a.startDate, b.startDate))
    .map((b) => {
      const anchor = byDay.get(daysBetween(asOf, b.anchorDate));
      const positionCents = anchor ? anchor.cents : openingCents;
      const kinds: BalancePathMarkerKind[] = [];
      if (b.incomeCount > 0) kinds.push('income');
      if (b.outgoingCount > 0) kinds.push('outgoing');
      if (b.hasShortfall) kinds.push('shortfall');
      // Exact date → that date; weekly bucket → the midpoint of its own range.
      const midOffset = (daysBetween(rail.startDate, b.startDate) + daysBetween(rail.startDate, b.endDate)) / 2;
      return {
        key: b.key,
        x: Math.min(1, Math.max(0, midOffset / rail.spanDays)),
        anchorDate: b.anchorDate,
        startDate: b.startDate,
        endDate: b.endDate,
        incomeCount: b.incomeCount,
        incomeCents: b.incomeCents,
        outgoingCount: b.outgoingCount,
        outgoingCents: b.outgoingCents,
        hasShortfall: b.hasShortfall,
        events: b.events,
        netCents: b.incomeCents + b.outgoingCents,
        positionCents,
        weekly,
        kinds,
        label: groupLabel(b, weekly, positionCents),
      };
    });

  const shortfallPart = result.firstShortfall
    ? `Possible shortfall of ${formatCentsCentsAware(result.firstShortfall.shortfallCents)} on ${shortDate(result.firstShortfall.date)}.`
    : 'No scheduled shortfall detected.';
  // Same rule as the presentation selector: when the (earliest) minimum IS the
  // estimate itself, repeating the amount adds nothing.
  const lowestPart = result.lowest.cents === result.targetCents
    ? `No dip below the estimated balance before ${shortDate(target)}.`
    : `Lowest scheduled end-of-day balance ${formatCentsCentsAware(result.lowest.cents)} on ${shortDate(result.lowest.date)}.`;
  const startPart = rail.startIsCycleStart ? `from your pay-cycle start on ${shortDate(rail.startDate)}, through today, ${shortDate(asOf)},` : `from today, ${shortDate(asOf)},`;
  const summary =
    `Timeline ${startPart} to your selected date, ${shortDate(target)}, ${plural(horizonDays, 'day', 'days')} away. ` +
    `${plural(incomeTotal, 'assumed income payment', 'assumed income payments')} and ${plural(outgoingTotal, 'bill or repayment', 'bills or repayments')} are scheduled. ` +
    `Estimated balance ${formatCentsCentsAware(result.targetCents)} on ${shortDate(target)}. ${lowestPart} ${shortfallPart}`;

  return {
    asOf,
    target,
    horizonDays,
    openingCents,
    targetCents: result.targetCents,
    lowest: result.lowest,
    firstShortfall: result.firstShortfall,
    points,
    rail,
    title: `Timeline to ${shortDate(target)}`,
    markers,
    density: weekly ? 'weekly' : 'exact',
    disclosure: weekly ? 'Events grouped by week' : null,
    eventCounts: { income: incomeTotal, outgoing: outgoingTotal },
    summary,
  };
}
