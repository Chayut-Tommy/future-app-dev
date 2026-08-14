import { Ionicons } from '@expo/vector-icons';
import { SafeToSpendPresentation } from './safeToSpendPresentation';
import { SmartReminder, SmartReminderKind } from './reminders';
import { TodayBriefingEventRow } from './todayBriefing';
import { creditCardDueTileValue } from './creditHealth';

/**
 * Pass 2B correction §2/§3 — the Today Briefing's compact tile
 * presentation. Replaces the old vertically-stacked white inner card
 * (AUP row + embedded reminder detail + event rows) with up to three
 * short summary tiles. This module does zero eligibility/selection work
 * of its own — it only reformats whatever the existing Briefing pipeline
 * already decided (selectSafeToSpendPresentation for AUP,
 * computeTopReminder for the reminder, selectTodayBriefingEventRows for
 * events) into short tile view-models. Tile count, order, and the
 * maximum-three-financial-item budget are therefore inherited exactly as
 * before — this file cannot change eligibility, priority, or the cap.
 *
 * Crucially, the reminder tile never carries the reminder's full
 * question/body or its account-choice controls — those stay exclusively
 * inside SmartReminderCard, now reachable only via the tile's tap-through
 * (ReminderDetailSheet), never rendered inline in a one-third-width tile.
 * This is the fix for the confirmed overflow: the unbounded row of
 * account-choice pills is no longer laid out inside the hero at all.
 */

export type BriefingTileKind = 'aup' | 'reminder' | 'event';
export type BriefingTileTone = 'normal' | 'attention';

export interface BriefingTile {
  key: string;
  kind: BriefingTileKind;
  icon: keyof typeof Ionicons.glyphMap;
  /** Short eyebrow label — e.g. the AUP presentation's own existing
   * heading, or a short category word for reminder/event tiles. Never the
   * reminder's full question or an event's full "<label> due in N days"
   * sentence (both can be arbitrarily long — a customer's own bill/account
   * name — which is exactly what previously overflowed). */
  label: string;
  /** The primary value or concise status — the AUP's formatted dollar
   * amount, or a short reminder/event category status. Never truncated:
   * a dollar amount is always shown in full (the component applies bounded
   * font auto-shrink, never mid-digit truncation); reminder/event values
   * are short, fixed category words derived from an existing enum, never a
   * customer-entered name. */
  value: string;
  /** At most one short supporting line — e.g. "Until payday", "Action
   * needed", "Tomorrow". Never a second sentence, never confirmation copy. */
  supportingLine: string | null;
  tone: BriefingTileTone;
  accessibilityLabel: string;
}

const REMINDER_ICON: Record<SmartReminderKind, keyof typeof Ionicons.glyphMap> = {
  salary_check: 'cash-outline',
  bill_overdue: 'calendar-outline',
  bill_due_soon: 'calendar-outline',
  card_due_soon: 'card-outline',
  bnpl_repayment_due: 'bag-handle-outline',
  loan_repayment_due: 'home-outline',
};

/** A short, fixed category word per reminder kind — never "overdue"
 * specifically for bill_overdue, since that kind also covers a bill due
 * exactly today (reminders.ts's own dueTodayBill branch deliberately
 * reuses kind: 'bill_overdue' but with "It's due today." body text, never
 * "late" wording — see that file's own comment on why "overdue" would be
 * inaccurate there). "due" is accurate for both.
 *
 * Reminder/credit-card wording correction round, Defect D — card_due_soon
 * no longer returns a static "Card due soon" regardless of day count; it
 * reads the reminder's own `creditCardDue` field (computed once by
 * reminders.ts's cardDue branch, where `today` is already in scope) and
 * formats it via creditHealth.ts's single shared, day-count-aware
 * presentation helper — the same source of truth used by the Reminder
 * detail's own heading, so the two surfaces can never disagree. Falls back
 * to the previous static wording only in the defensive case where
 * `creditCardDue` is absent (never expected from the current selector, but
 * this keeps the function total rather than throwing). */
function reminderTileStatus(reminder: SmartReminder): string {
  switch (reminder.kind) {
    case 'salary_check':
      return 'Income check';
    case 'bill_overdue':
      return 'Bill due';
    case 'bill_due_soon':
      return 'Bill due soon';
    case 'card_due_soon':
      return reminder.creditCardDue ? creditCardDueTileValue(reminder.creditCardDue) : 'Card due soon';
    case 'bnpl_repayment_due':
      return 'Repayment due';
    case 'loan_repayment_due':
      return 'Repayment due';
  }
}

/** The two kinds that represent a payment already due (today or earlier) —
 * the only reminder kinds genuinely in the "attention" tone. Mirrors the
 * same distinction reminders.ts's own computeTopReminder priority order
 * already draws (overdue/due-today checked ahead of the soon/upcoming
 * kinds) — not a new urgency rule, a short label for an existing one. */
function reminderTileTone(kind: SmartReminderKind): BriefingTileTone {
  return kind === 'bill_overdue' || kind === 'bnpl_repayment_due' || kind === 'loan_repayment_due' ? 'attention' : 'normal';
}

// Reminder/credit-card wording correction round, Defect C — the independent
// Next-event tile (distinct from the Reminder tile above) previously showed
// the ambiguous generic "Card" for a credit-card repayment event ("a debit
// card cannot be due"). Now says "Credit card" — this is the ONLY entry
// changed; every other event kind's label, and every other legitimate use
// of the word "card" elsewhere in the app (Navilo Cards, Review card,
// customer card names), is untouched. Accessibility copy (eventTile, below)
// derives from this same `value`, so it follows automatically.
const EVENT_KIND_LABEL: Record<TodayBriefingEventRow['kind'], string> = {
  income: 'Income',
  bill: 'Bill',
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
  savings: 'Savings',
  goal: 'Goal',
  bnpl: 'Repayment',
};

/** Mirrors the exact phrasing fragments moneyTimeline.ts's own
 * buildAttentionEventTitle already uses ("today"/"tomorrow"/"in N days") —
 * not new wording, a short-form reuse of the same established pattern. */
function relativeDayLabel(daysUntil: number): string {
  return daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
}

function aupTile(presentation: SafeToSpendPresentation): BriefingTile {
  // Final Pass 2D device-test correction — falls back to the short,
  // state-specific compactSummary (a few words, same register as the
  // Reminder/Next tiles' own fixed category words), never the full
  // primaryCopy sentence, which is what previously rendered at
  // near-illegible auto-shrunk size in this same slot (the confirmed
  // device-test defect). primaryCopy itself is unchanged and still used
  // verbatim by SafeToSpendHero.tsx's own full-size card.
  const value = presentation.amountVisible && presentation.displayAmount ? presentation.displayAmount : presentation.compactSummary;
  return {
    key: 'aup',
    kind: 'aup',
    icon: 'wallet-outline',
    label: presentation.heading,
    value,
    supportingLine: null,
    tone: presentation.tone === 'warning' ? 'attention' : 'normal',
    accessibilityLabel: `${presentation.heading}, ${value}`,
  };
}

function reminderTile(reminder: SmartReminder): BriefingTile {
  const tone = reminderTileTone(reminder.kind);
  const supportingLine = tone === 'attention' ? 'Action needed' : 'Tap to review';
  const status = reminderTileStatus(reminder);
  return {
    key: `reminder-${reminder.id}`,
    kind: 'reminder',
    icon: REMINDER_ICON[reminder.kind],
    label: 'Reminder',
    value: status,
    supportingLine,
    tone,
    accessibilityLabel: `Reminder, ${status}, ${supportingLine}`,
  };
}

function eventTile(row: TodayBriefingEventRow): BriefingTile {
  const value = EVENT_KIND_LABEL[row.kind];
  const supportingLine = relativeDayLabel(row.daysUntil);
  return {
    key: `event-${row.key}`,
    kind: 'event',
    icon: row.icon,
    label: 'Next',
    value,
    supportingLine,
    tone: row.tone === 'warning' ? 'attention' : 'normal',
    accessibilityLabel: `Next, ${value}, ${supportingLine}`,
  };
}

/**
 * Assembles the Briefing's tile list in the established canonical order —
 * AUP always first, the top reminder next when eligible, then independent
 * event rows — exactly the same order/composition Pass 2A/2B already
 * established. Total tile count is bounded by the same upstream budget
 * selectTodayBriefingEventRows already enforces (AUP always 1 + reminder
 * 0-1 + events sized so the total never exceeds 3) — this function adds no
 * additional capping of its own.
 */
export function selectBriefingTiles(presentation: SafeToSpendPresentation, topReminder: SmartReminder | null, eventRows: TodayBriefingEventRow[]): BriefingTile[] {
  const tiles: BriefingTile[] = [aupTile(presentation)];
  if (topReminder) tiles.push(reminderTile(topReminder));
  for (const row of eventRows) tiles.push(eventTile(row));
  return tiles;
}

export interface BriefingLayoutDecision {
  columns: 1 | 2 | 3;
  /** Exact pixel width for each tile — populated ONLY for the columns===3
   * case (see this function's own doc comment for why); null for columns
   * 1/2, which keep rendering via the original, still-correct percentage-
   * basis + flexGrow mechanism unchanged since Pass 2B. */
  tileWidth: number | null;
}

const LARGE_TEXT_THRESHOLD = 1.3;

/**
 * Pass 2B, third correction round — the width-aware responsive layout
 * rule. Previously (computeBriefingTileColumns) this function decided only
 * a PREFERRED column count from item count + font scale, and left ALL
 * width handling to percentage flexBasis + native flexWrap. That was the
 * root cause of the confirmed regression: percentage flexBasis (31% per
 * tile for 3 columns) is resolved against the row's full width, but the
 * fixed-pixel `gap` between tiles is added on TOP of that — on a real
 * device width narrow enough that 3×31% + 2×gap exceeds the row's actual
 * pixel width by even a few pixels, Yoga wraps the third tile onto its own
 * line. Because that tile still carried flexGrow: 1 (intended only for the
 * genuine 1-/2-column fallback cases, where a lone leftover tile SHOULD
 * stretch to fill its row), the wrapped third tile then grew to fill 100%
 * of the row — producing exactly the reported "[Available] [Reminder]" /
 * "[Next — full width]" two-plus-one appearance despite 3 columns having
 * been the intended, selected outcome the whole time.
 *
 * The fix: for the 3-column case only, this function now takes the row's
 * REAL measured available width (from the caller's own onLayout — never a
 * guessed/hard-coded device width) and computes the exact tile width in
 * pixels itself, subtracting both inter-tile gaps first:
 *   tileWidth = (availableWidth - 2 * gap) / 3
 * If that pixel width is still >= minTileWidth, 3 columns are genuinely
 * safe and BriefingTileRow renders each tile at that exact fixed pixel
 * width with flexGrow/flexShrink disabled — nothing can wrap or stretch
 * unexpectedly, because the numbers are now guaranteed to sum to <=
 * availableWidth by construction, not by a percentage approximation. If
 * the measured width can't fit 3 tiles at minTileWidth (a genuinely narrow
 * device) — or availableWidth hasn't been measured yet (0, the one-frame
 * window before the row's first onLayout fires) — this falls back to the
 * existing, unchanged 1-/2-column percentage/flexGrow behaviour, exactly
 * as before this correction. The 1- and 2-column paths are otherwise
 * completely untouched: this is a narrow fix to the 3-column case only.
 *
 *   - 0/1 items -> 1 column (one wider featured tile)
 *   - 2 items, ordinary text -> 2 balanced columns (percentage, unchanged)
 *   - 2 items, materially larger text -> 1 column (unchanged)
 *   - 3 items, ordinary text, measured width fits 3×minTileWidth+2×gap ->
 *     3 equal columns at an exact computed pixel width
 *   - 3 items, ordinary text, width not yet measured or too narrow ->
 *     safe two-plus-one fallback (unchanged percentage/flexGrow mechanism)
 *   - 3 items, materially larger text -> 2 columns, same safe fallback
 */
export function computeBriefingLayout(itemCount: number, availableWidth: number, fontScale: number, gap: number = 8, minTileWidth: number = 92): BriefingLayoutDecision {
  const count = Math.min(itemCount, 3);
  if (count <= 1) return { columns: 1, tileWidth: null };
  // Not yet measured (the single frame before the row's own onLayout has
  // fired) — the safest possible interim render, never wraps/overflows,
  // and self-corrects to the real answer the moment layout is measured.
  if (!availableWidth || availableWidth <= 0) return { columns: 1, tileWidth: null };
  const materiallyLarger = fontScale > LARGE_TEXT_THRESHOLD;
  if (count === 2) return { columns: materiallyLarger ? 1 : 2, tileWidth: null };
  // count === 3
  if (!materiallyLarger) {
    const threeColumnWidth = (availableWidth - 2 * gap) / 3;
    if (threeColumnWidth >= minTileWidth) return { columns: 3, tileWidth: threeColumnWidth };
  }
  return { columns: 2, tileWidth: null };
}
