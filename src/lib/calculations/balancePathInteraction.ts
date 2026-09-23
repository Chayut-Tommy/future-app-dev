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
import type { RailMarkerKind, TimelineRail } from './timelineMarkers';
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

/** Pass D.3 — the least a marker group must carry to become a press target. Both the
 * selected-date groups (BalancePathMarkerGroup) and the pay-cycle groups (AupRailGroup)
 * satisfy it, so ONE slot/target rule serves both rails. */
export interface RailHitGroup {
  key: string;
  /** 0..1 position on the rail. */
  x: number;
  events: readonly unknown[];
  hasShortfall: boolean;
}

export interface BalancePathHitTarget<G extends RailHitGroup = BalancePathMarkerGroup> {
  /** Stable key: the keys of the groups it holds, joined. */
  key: string;
  /** Left edge and width in plot pixels; never overlaps another target. */
  left: number;
  width: number;
  /** Marker groups in chronological order (one, or a collision group). */
  groups: G[];
}

/**
 * Partition the plot into equal slots at least `minSize` wide and give every
 * slot that contains a marker group ONE press target covering the whole slot
 * (the interaction band is `minSize` tall, so each target is ≥ 44 × 44). Groups
 * whose glyphs sit too close to separate land in the same slot and are
 * inspected together — a deliberate collision group, never two overlapping
 * targets with an ambiguous result. Deterministic and chronological.
 */
export function resolveHitTargets<G extends RailHitGroup = BalancePathMarkerGroup>(path: { markers: G[] }, plotWidth: number, minSize: number = BALANCE_PATH_MIN_TARGET): BalancePathHitTarget<G>[] {
  if (!(plotWidth > 0) || path.markers.length === 0) return [];
  const slots = Math.max(1, Math.floor(plotWidth / minSize));
  const slotWidth = plotWidth / slots;
  const bySlot = new Map<number, G[]>();
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
  /** Pass D — the canonical source kind, so a row can be routed by stable identity. */
  sourceKind: BalancePathGroupEvent['sourceKind'];
  /** "28 Sep" — for the review action's accessible name. */
  dateLabel: string;
  /** Pass D.3 — pay-cycle rows only: whether this event is inside the amount the
   * card shows, said in words ("Included in Available until payday" / "Expected
   * income — not included in Available until payday"). Absent on selected-date rows,
   * where every listed event is included by construction. */
  statusLabel?: string;
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
  /** "End-of-day balance: $8,650" / "End-of-week balance: …". Null on the pay-cycle
   * rail, which has NO running balance, lowest point or shortfall path (Pass D.3 —
   * nothing is invented for visual parity). */
  balanceLine: string | null;
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
    sourceKind: e.sourceKind,
    dateLabel: shortDate(e.date),
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

// ---------------------------------------------------------------------------
// 3b. Pay-cycle (Available until payday) inspection — Pass D.3
// ---------------------------------------------------------------------------

/** One canonical pay-cycle event, exactly as the rail marker carries it. */
export interface AupRailEvent {
  occurrenceId: string;
  sourceId: string;
  sourceKind: BalancePathGroupEvent['sourceKind'];
  date: LocalDate;
  label: string;
  signedCents: number;
  typeLabel: string;
  /** True when AUP subtracted it; false for expected income and the payday. */
  included: boolean;
}

/** A pay-cycle marker as a press-target group: ONE rail marker (one kind, one date). */
export interface AupRailGroup extends RailHitGroup {
  key: string;
  x: number;
  date: LocalDate;
  kind: RailMarkerKind;
  events: AupRailEvent[];
  hasShortfall: false;
  netCents: number;
}

export const AUP_INCLUDED_STATUS = 'Included in Available until payday';
export const AUP_EXPECTED_INCOME_STATUS = 'Expected income — not included in Available until payday';
export const AUP_PAYDAY_STATUS = 'Expected payday — not included in this amount';

/** The pay-cycle rail's markers as groups. Only markers that carry a real canonical
 * event become targets; a decorative endpoint with no event is never interactive. */
export function buildAupRailGroups(rail: Pick<TimelineRail, 'markers'>): AupRailGroup[] {
  return rail.markers
    .filter((m) => (m.events?.length ?? 0) > 0)
    .map((m) => ({
      key: m.key,
      x: m.position,
      date: m.date,
      kind: m.kind,
      events: (m.events ?? []).map((e) => ({ ...e })),
      hasShortfall: false as const,
      netCents: (m.events ?? []).reduce((n, e) => n + e.signedCents, 0),
    }));
}

function aupStatus(kind: RailMarkerKind): string {
  if (kind === 'payday_endpoint') return AUP_PAYDAY_STATUS;
  if (kind === 'expected_income' || kind === 'income') return AUP_EXPECTED_INCOME_STATUS;
  return AUP_INCLUDED_STATUS;
}

function aupSectionFor(g: AupRailGroup): InspectionSection {
  const n = g.events.length;
  const status = aupStatus(g.kind);
  return {
    key: g.key,
    heading: `${shortDate(g.date)} · ${eventsWord(n)}`,
    weekly: false,
    rows: g.events.map((e) => ({
      key: e.occurrenceId,
      label: e.label,
      amount: formatSignedCents(e.signedCents),
      typeLabel: e.typeLabel,
      occurrenceId: e.occurrenceId,
      sourceId: e.sourceId,
      sourceKind: e.sourceKind,
      dateLabel: shortDate(e.date),
      statusLabel: status,
    })),
    incomeTotal: null,
    outgoingTotal: null,
    netLine: n > 1 ? `Same-day total: ${formatSignedCents(g.netCents)}` : null,
    balanceLine: null,
    shortfallLine: null,
  };
}

function spokenAupSection(g: AupRailGroup): string {
  const status = aupStatus(g.kind);
  const parts = g.events.map((e) => `${e.label}, ${e.typeLabel.toLowerCase()}, ${spokenSigned(e.signedCents)}`);
  return `${longDate(g.date)}: ${parts.join('. ')}. ${status}.`;
}

/** Describe one pay-cycle press target. Reuses the selected-date inspection SHAPE so
 * the same detail surface renders both rails, but carries no balance line: Available
 * until payday has no daily path, and none is invented. */
export function describeAupHitTarget(target: BalancePathHitTarget<AupRailGroup>): BalancePathInspection {
  const sections = target.groups.map(aupSectionFor);
  const totalEvents = target.groups.reduce((n, g) => n + g.events.length, 0);
  const first = target.groups[0];
  const last = target.groups[target.groups.length - 1];
  const title = `${rangeShort(first.date, last.date)} · ${eventsWord(totalEvents)}`;
  let remaining = INSPECTION_ROW_CAP;
  let hidden = 0;
  for (const s of sections) {
    const keep = Math.max(0, Math.min(s.rows.length, remaining));
    hidden += s.rows.length - keep;
    s.rows = s.rows.slice(0, keep);
    remaining -= keep;
  }
  const spoken = target.groups.map(spokenAupSection).join(' ');
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

/** Pass D.1 — breathing room kept between the marker band, the detail and the dock. */
export const DETAIL_VIEWPORT_GAP = 12;
/** Never bound the detail below its heading plus three 44pt rows. */
export const DETAIL_MIN_HEIGHT = BALANCE_PATH_MIN_TARGET * 4;

export interface DetailViewport {
  /** Window height in points. */
  windowHeight: number;
  /** Top safe-area inset (status bar / Dynamic Island). */
  topInset: number;
  /** Space the floating dock/FAB assembly occupies from the literal bottom of the
   * screen, INCLUDING the bottom safe area — the shared `screenBottomClearance`. */
  bottomClearance: number;
}

/** The tallest the detail may be so that it — and the marker band it belongs to —
 * can rest entirely between the top safe area and the dock. */
export function resolveDetailMaxHeight(v: DetailViewport): number {
  const clear = v.windowHeight - Math.max(v.topInset, 0) - Math.max(v.bottomClearance, 0);
  if (!Number.isFinite(clear)) return DETAIL_MIN_HEIGHT;
  return Math.max(Math.floor(clear - BALANCE_PATH_MIN_TARGET - DETAIL_VIEWPORT_GAP * 2), DETAIL_MIN_HEIGHT);
}

/** Where the page must scroll so an opened detail rests clear of the dock, or null
 * when it already does. `frameY`/`frameHeight` are the detail's measured window frame.
 * The page only ever moves DOWN the content, and never so far that the marker band
 * the detail is attached to leaves the top of the screen. */
export function resolveDetailReveal(input: DetailViewport & { frameY: number; frameHeight: number; scrollY: number; anchorY?: number }): number | null {
  const values = [input.frameY, input.frameHeight, input.scrollY, input.windowHeight];
  if (!values.every((n) => Number.isFinite(n)) || input.frameHeight <= 0) return null;
  const clearBottom = input.windowHeight - Math.max(input.bottomClearance, 0) - DETAIL_VIEWPORT_GAP;
  const overflow = input.frameY + input.frameHeight - clearBottom;
  if (overflow <= 0.5) return null;
  // Pass D.3 (F5) — the page may move only as far as keeps the MARKER BAND on screen:
  // `anchorY` is the band's measured window top. Without a measurement the band is
  // assumed to sit one target-height directly above the detail (the D.1 estimate).
  const anchorTop = input.anchorY !== undefined && Number.isFinite(input.anchorY) ? input.anchorY : input.frameY - BALANCE_PATH_MIN_TARGET;
  const headroom = anchorTop - DETAIL_VIEWPORT_GAP - Math.max(input.topInset, 0);
  const delta = Math.min(overflow, Math.max(headroom, 0));
  return delta > 0.5 ? Math.round(Math.max(input.scrollY, 0) + delta) : null;
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
