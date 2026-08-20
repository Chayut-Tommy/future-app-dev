// Nolie Design 5.1 Wave 5 — the Briefing's priority rows.
//
// Design 5.1 p.7 replaces the three small Briefing tiles with at most two
// full-width financial rows. A tile could only ever carry a category word
// ("Bill due") because a third of a phone's width has no room for a
// customer's own bill name, an exact date and an amount at once. A
// full-width row does, and the brief asks for all three.
//
// This module adds NO selection, ordering, eligibility or capping of its
// own. It takes the tiles selectBriefingTiles already produced — which
// already inherit the engine's priority order and the three-item budget —
// drops the AUP tile (now the hero's own headline, not a row) and ENRICHES
// each remaining tile with the exact date and amount that the tile shape
// had no room for. Those two values are recovered by joining against the
// SAME timeline events and the SAME reminder the Briefing was already
// given; nothing is recomputed and no engine is touched.
//
// Because the rows are derived from the tiles, priority order and the cap
// are correct by construction rather than by a second rule that could
// drift from the first.

import { Ionicons } from '@expo/vector-icons';
import { BriefingTile } from './briefingTiles';
import { TodayBriefingEventRow } from './todayBriefing';
import { eventOccurrenceIdentity, reminderOccurrenceIdentity, sameOccurrence } from './todayBriefing';
import { TimelineEvent } from './moneyTimeline';
import { SmartReminder } from './reminders';

/**
 * The row's semantic status marker. Deliberately four values, not the
 * tile's two, because Design 5.1 draws a distinction the tile never had to:
 * amber is for due-soon caution, and the urgent role is reserved for money
 * that is genuinely already late. Conflating them would put the loudest
 * colour on the screen in front of a customer whose bill is simply due
 * today — which reminders.ts's own header comment is explicit about not
 * doing ("overdue" would be inaccurate for a due-today bill).
 */
export type PriorityRowMarker = 'urgent' | 'caution' | 'positive' | 'neutral';

export interface BriefingPriorityRow {
  /** The originating tile's key — so tapping a row reaches exactly the
   * destination the tile already reached, via the caller's existing
   * handler. This module introduces no navigation of its own. */
  key: string;
  kind: 'reminder' | 'event';
  icon: keyof typeof Ionicons.glyphMap;
  /** The primary human label, verbatim from the engine that produced it —
   * an event's own buildAttentionEventTitle string ("Rent due in 3 days",
   * "Income expected tomorrow") or a reminder's own title. Never rebuilt
   * here, so every protected wording rule ("due today" and never "due
   * soon" for today; "Credit card" and never "Card") holds automatically. */
  label: string;
  /** The exact calendar date this item falls on — "Fri 22 Aug" — or null
   * when the underlying record genuinely has no date to show. Never
   * guessed from a day count. */
  dateLabel: string | null;
  /** Already formatted, sign-carrying where the sign is meaningful. Null
   * when no amount is recorded — never "$0" as a stand-in. */
  amountLabel: string | null;
  marker: PriorityRowMarker;
  accessibilityLabel: string;
}

/** Design 5.1 p.7 — the Briefing shows at most two priority rows beneath
 * its headline figure. The upstream budget already yields at most two
 * non-AUP tiles; this constant makes the page's own rule explicit and
 * independently testable rather than implied by another module's
 * arithmetic. */
export const MAX_PRIORITY_ROWS = 2;

/** "Fri 22 Aug" — the same weekday/day/month convention
 * formatBriefingDateContext already uses for the Briefing's own header, so
 * the hero and its rows read as one surface. */
export function formatPriorityRowDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Whole dollars, with an explicit positive sign for money coming in — the
 * established convention already used by MonthSnapshotCard's own income
 * figure. Outflows carry no minus sign: the row's own label already says
 * the money is due, and a minus would read as a correction. */
export function formatPriorityRowAmount(amount: number, isIncome: boolean): string | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  const magnitude = Math.round(Math.abs(amount));
  return `${isIncome ? '+' : ''}$${magnitude.toLocaleString()}`;
}

/**
 * urgent is reserved for money that is genuinely already late; a bill due
 * today is caution, not urgent. Income is never either — it is money
 * arriving, and the only colour it may carry is the positive one.
 */
export function resolvePriorityRowMarker(kind: string, daysUntil: number | null): PriorityRowMarker {
  if (kind === 'income') return 'positive';
  if (daysUntil === null) return 'neutral';
  if (daysUntil < 0) return 'urgent';
  if (daysUntil <= 2) return 'caution';
  return 'neutral';
}

function eventForKey(key: string, events: TimelineEvent[]): TimelineEvent | null {
  // selectTodayBriefingEventRows sets each row's key to the originating
  // event's own stable id, so this join is exact rather than heuristic.
  return events.find((e) => e.id === key) ?? null;
}

function eventForReminder(reminder: SmartReminder, events: TimelineEvent[]): TimelineEvent | null {
  // The engine's own occurrence-identity comparison — the same one
  // selectTodayBriefingEventRows already uses to deduplicate a reminder
  // against the event list. If it says they are the same occurrence, they
  // are, and that event carries the date the reminder itself does not.
  const identity = reminderOccurrenceIdentity(reminder);
  if (!identity) return null;
  return events.find((e) => sameOccurrence(eventOccurrenceIdentity(e), identity)) ?? null;
}

function composeAccessibilityLabel(label: string, dateLabel: string | null, amountLabel: string | null): string {
  // One sentence per row: what it is, when, how much. A screen-reader user
  // gets the same three facts a sighted customer reads across the row.
  return [label, dateLabel, amountLabel].filter(Boolean).join(', ');
}

/**
 * Enrich the Briefing's non-AUP tiles into full-width priority rows.
 *
 * `tiles` must be the exact array selectBriefingTiles returned, in order.
 * The AUP tile is dropped (it becomes the hero's headline figure), and the
 * remainder are enriched in place — so order and count follow the engine,
 * never a rule invented here. The explicit slice is a belt-and-braces
 * guard on Design 5.1's own two-row rule, not a second cap: the upstream
 * budget already guarantees it.
 */
export function selectBriefingPriorityRows(
  tiles: BriefingTile[],
  eventRows: TodayBriefingEventRow[],
  timelineEvents: TimelineEvent[],
  topReminder: SmartReminder | null
): BriefingPriorityRow[] {
  const rows: BriefingPriorityRow[] = [];

  for (const tile of tiles) {
    if (tile.kind === 'aup') continue;

    if (tile.kind === 'reminder') {
      if (!topReminder) continue;
      const event = eventForReminder(topReminder, timelineEvents);
      const daysUntil = event ? event.daysUntil : null;
      const amount = topReminder.amount ?? (event ? Math.abs(event.amount) : null);
      const isIncome = topReminder.kind === 'salary_check';
      const amountLabel = amount === null ? null : formatPriorityRowAmount(amount, isIncome);
      const dateLabel = event ? formatPriorityRowDate(event.date) : null;
      rows.push({
        key: tile.key,
        kind: 'reminder',
        icon: tile.icon,
        label: topReminder.title,
        dateLabel,
        amountLabel,
        marker: resolvePriorityRowMarker(isIncome ? 'income' : 'bill', daysUntil),
        accessibilityLabel: composeAccessibilityLabel(topReminder.title, dateLabel, amountLabel),
      });
      continue;
    }

    const rowKey = tile.key.replace(/^event-/, '');
    const eventRow = eventRows.find((r) => r.key === rowKey);
    if (!eventRow) continue;
    const event = eventForKey(rowKey, timelineEvents);
    const isIncome = eventRow.kind === 'income';
    const amountLabel = event ? formatPriorityRowAmount(event.amount, isIncome) : null;
    const dateLabel = event ? formatPriorityRowDate(event.date) : null;
    rows.push({
      key: tile.key,
      kind: 'event',
      icon: tile.icon,
      label: eventRow.title,
      dateLabel,
      amountLabel,
      marker: resolvePriorityRowMarker(eventRow.kind, eventRow.daysUntil),
      accessibilityLabel: composeAccessibilityLabel(eventRow.title, dateLabel, amountLabel),
    });
  }

  return rows.slice(0, MAX_PRIORITY_ROWS);
}

// ---------------------------------------------------------------------------
// The hero's timeframe line
// ---------------------------------------------------------------------------

/**
 * "11 days to Fri 28 Aug · about $120 a day" — the supporting line beneath
 * the headline figure. Every number in it is read straight off the
 * Safe-to-Spend result the hero is already showing; nothing is recomputed,
 * and the line is omitted entirely rather than guessed at when the cycle
 * is not genuinely known.
 */
export function formatHeroTimeframe(
  daysRemaining: number,
  cycleEnd: Date,
  dailyAllowance: number,
  hasKnownPayday: boolean
): string | null {
  if (!hasKnownPayday) return null;
  if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) return null;
  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  const head = `${daysRemaining} ${dayWord} to ${formatPriorityRowDate(cycleEnd)}`;
  if (!Number.isFinite(dailyAllowance) || dailyAllowance <= 0) return head;
  // "about" is load-bearing: this is a division, not a budget the customer
  // set, and it must never read as an instruction.
  return `${head} · about $${Math.round(dailyAllowance).toLocaleString()} a day`;
}
