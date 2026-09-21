/**
 * Pass C.4 / C.5 — pure presentation helpers for read-only event inspection on
 * the future-date timeline rail: deterministic 44-point hit targets and the
 * inspection description for a selected target. (C.5 retired the graph and its
 * corner-rounding geometry; this module is now graph-independent.)
 *
 * Owns NO financial logic. Every amount, date, identity and position is read
 * from the `BalancePath` DTO, which itself reads only the Pass B projection and
 * the canonical A3 occurrences. All arithmetic on money is integer cents that
 * the mapper already produced; nothing is re-enumerated, re-ordered into an
 * intraday sequence, or inferred from a label, an amount or a date. Pure, no
 * React, no persistence.
 */

import { BalancePath, BalancePathGroupEvent, BalancePathMarkerGroup } from './balancePath';
import { LocalDate, localDatesEqual } from './localCalendar';
import { formatCentsCentsAware } from './money';

// ---------------------------------------------------------------------------
// 1. Rail positions
// ---------------------------------------------------------------------------
// Pass C.5 retired the monetary graph, and with it every graph-specific
// coordinate helper this module used to hold (the bounded corner-rounding
// geometry, its sampler and the area path). What remains is independent of how
// the horizon is drawn.

/** Normalised rail position (0..1) → track pixels. */
export function plotX(x: number, trackWidth: number): number {
  return Math.min(1, Math.max(0, x)) * Math.max(0, trackWidth);
}

// ---------------------------------------------------------------------------
// 2. Hit targets (C.4B) — one ≥44pt, non-overlapping target per slot
// ---------------------------------------------------------------------------

export const BALANCE_PATH_MIN_TARGET = 44;

export interface BalancePathHitTarget {
  /** Stable key: the keys of the groups it holds, joined. */
  key: string;
  /** Left edge and width in plot pixels; never overlaps another target. */
  left: number;
  width: number;
  /** Marker groups in chronological order (one, or a collision group). */
  groups: BalancePathMarkerGroup[];
}

/**
 * Partition the plot into equal slots at least `minSize` wide and give every
 * slot that contains a marker group ONE press target covering the whole slot
 * (the interaction band is `minSize` tall, so each target is ≥ 44 × 44). Groups
 * whose glyphs sit too close to separate land in the same slot and are
 * inspected together — a deliberate collision group, never two overlapping
 * targets with an ambiguous result. Deterministic and chronological.
 */
export function resolveHitTargets(path: BalancePath, plotWidth: number, minSize: number = BALANCE_PATH_MIN_TARGET): BalancePathHitTarget[] {
  if (!(plotWidth > 0) || path.markers.length === 0) return [];
  const slots = Math.max(1, Math.floor(plotWidth / minSize));
  const slotWidth = plotWidth / slots;
  const bySlot = new Map<number, BalancePathMarkerGroup[]>();
  for (const g of path.markers) {
    if (g.events.length === 0 && !g.hasShortfall) continue;
    const px = plotX(g.x, plotWidth);
    const index = Math.min(slots - 1, Math.max(0, Math.floor(px / slotWidth)));
    (bySlot.get(index) ?? bySlot.set(index, []).get(index)!).push(g);
  }
  return [...bySlot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, groups]) => ({ key: groups.map((g) => g.key).join('+'), left: index * slotWidth, width: slotWidth, groups }));
}

// ---------------------------------------------------------------------------
// 3. Inspection description (C.4B)
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortDate = (d: LocalDate) => `${d.day} ${MONTHS[d.month - 1]}`;
const longDate = (d: LocalDate) => `${d.day} ${MONTHS_LONG[d.month - 1]}`;
const rangeShort = (a: LocalDate, b: LocalDate) => (localDatesEqual(a, b) ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
const rangeLong = (a: LocalDate, b: LocalDate) => (localDatesEqual(a, b) ? longDate(a) : `${longDate(a)} to ${longDate(b)}`);
const eventsWord = (n: number) => `${n} scheduled ${n === 1 ? 'event' : 'events'}`;

/** "+$1,000" / "-$3,000" / "$0" — exact cents, sign always explicit for income. */
export function formatSignedCents(cents: number): string {
  const text = formatCentsCentsAware(cents);
  return cents > 0 ? `+${text}` : text;
}
const spokenSigned = (cents: number) => (cents > 0 ? `plus ${formatCentsCentsAware(cents)}` : cents < 0 ? `minus ${formatCentsCentsAware(-cents)}` : formatCentsCentsAware(0));

export interface InspectionRow {
  key: string;
  /** "Dividends" or, inside a weekly bucket, "27 Sep · Dividends". */
  label: string;
  amount: string;
  typeLabel: string;
  occurrenceId: string;
  sourceId: string;
}

export interface InspectionSection {
  key: string;
  /** "20 Sep · 2 scheduled events" or "21 Sep – 27 Sep · 5 scheduled events". */
  heading: string;
  weekly: boolean;
  rows: InspectionRow[];
  /** Weekly buckets only — exact totals. */
  incomeTotal: string | null;
  outgoingTotal: string | null;
  /** "Same-day net: -$2,000" (exact date, 2+ events) or "Net effect: …" (weekly). */
  netLine: string | null;
  /** "End-of-day balance: $8,650" / "End-of-week balance: …". */
  balanceLine: string;
  shortfallLine: string | null;
}

export interface BalancePathInspection {
  key: string;
  title: string;
  sections: InspectionSection[];
  /** Rows beyond the visible cap, routed to View upcoming events. */
  hiddenRowCount: number;
  moreLine: string | null;
  /** The accessible label of the press target (date, source, type, amount, status). */
  targetLabel: string;
  /** Spoken when the callout opens. */
  announcement: string;
}

/** Visible rows per callout before routing the remainder to the full list. */
export const INSPECTION_ROW_CAP = 8;

function rowFor(e: BalancePathGroupEvent, withDate: boolean): InspectionRow {
  return {
    key: e.occurrenceId,
    label: withDate ? `${shortDate(e.date)} · ${e.label}` : e.label,
    amount: formatSignedCents(e.signedCents),
    typeLabel: e.typeLabel,
    occurrenceId: e.occurrenceId,
    sourceId: e.sourceId,
  };
}

function sectionFor(g: BalancePathMarkerGroup, path: BalancePath): InspectionSection {
  const n = g.events.length;
  const heading = `${rangeShort(g.startDate, g.endDate)} · ${eventsWord(n)}`;
  const shortfallLine =
    g.hasShortfall && path.firstShortfall ? `Possible shortfall of ${formatCentsCentsAware(path.firstShortfall.shortfallCents)} on ${shortDate(path.firstShortfall.date)}` : null;
  if (g.weekly) {
    return {
      key: g.key,
      heading,
      weekly: true,
      rows: g.events.map((e) => rowFor(e, true)),
      incomeTotal: `Assumed income (${g.incomeCount}): ${formatSignedCents(g.incomeCents)}`,
      outgoingTotal: `Outgoing commitments (${g.outgoingCount}): ${formatSignedCents(g.outgoingCents)}`,
      netLine: `Net effect: ${formatSignedCents(g.netCents)}`,
      balanceLine: `End-of-week balance: ${formatCentsCentsAware(g.positionCents)}`,
      shortfallLine,
    };
  }
  return {
    key: g.key,
    heading,
    weekly: false,
    rows: g.events.map((e) => rowFor(e, false)),
    incomeTotal: null,
    outgoingTotal: null,
    // One end-of-day batch per local date — never an order of events.
    netLine: n > 1 ? `Same-day net: ${formatSignedCents(g.netCents)}` : null,
    balanceLine: `End-of-day balance: ${formatCentsCentsAware(g.positionCents)}`,
    shortfallLine,
  };
}

function spokenSection(g: BalancePathMarkerGroup): string {
  const when = rangeLong(g.startDate, g.endDate);
  if (g.weekly) {
    return `${when}: ${eventsWord(g.events.length)}. Assumed income ${spokenSigned(g.incomeCents)}. Outgoing commitments ${spokenSigned(g.outgoingCents)}. Net effect ${spokenSigned(g.netCents)}. End-of-week balance ${formatCentsCentsAware(g.positionCents)}.`;
  }
  const parts = g.events.map((e) => `${e.label}, ${e.typeLabel.toLowerCase()}, ${spokenSigned(e.signedCents)}`);
  const net = g.events.length > 1 ? ` Same-day net ${spokenSigned(g.netCents)}.` : '';
  return `${when}: ${parts.join('. ')}.${net} End-of-day balance ${formatCentsCentsAware(g.positionCents)}.`;
}

/** Describe one press target for the callout and for assistive technology. */
export function describeHitTarget(target: BalancePathHitTarget, path: BalancePath): BalancePathInspection {
  const sections = target.groups.map((g) => sectionFor(g, path));
  const totalEvents = target.groups.reduce((n, g) => n + g.events.length, 0);
  const first = target.groups[0];
  const last = target.groups[target.groups.length - 1];
  const title = `${rangeShort(first.startDate, last.endDate)} · ${eventsWord(totalEvents)}`;
  // Cap the visible rows across the whole callout; the rest stay one tap away.
  let remaining = INSPECTION_ROW_CAP;
  let hidden = 0;
  for (const s of sections) {
    const keep = Math.max(0, Math.min(s.rows.length, remaining));
    hidden += s.rows.length - keep;
    s.rows = s.rows.slice(0, keep);
    remaining -= keep;
  }
  const spoken = target.groups.map(spokenSection).join(' ');
  return {
    key: target.key,
    title,
    sections,
    hiddenRowCount: hidden,
    moreLine: hidden > 0 ? `${hidden} more in View upcoming events` : null,
    targetLabel: spoken,
    announcement: `Showing ${title}. ${spoken}`,
  };
}

/** Anchored (caret under the marker) when it fits; otherwise a full-width
 * inline card. Both sit in normal flow directly below the plot, so neither can
 * clip or cover a required control. */
export function resolveCalloutMode(input: { plotWidth: number; fontScale: number; rowCount: number }): 'anchored' | 'inline' {
  if (input.fontScale >= 1.3) return 'inline';
  if (input.plotWidth < 240) return 'inline';
  if (input.rowCount > 4) return 'inline';
  return 'anchored';
}
