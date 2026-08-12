import { Ionicons } from '@expo/vector-icons';
import {
  TimelineEvent,
  TimelineEventKind,
  selectUrgentOutflowEvents,
  selectNearTermIncomeEvents,
  buildAttentionEventTitle,
  attentionEventTone,
} from './moneyTimeline';
import { SmartReminder } from './reminders';

/** Local-calendar day key ("YYYY-MM-DD"), never UTC-shifted — the same
 * getFullYear/getMonth/getDate field convention this repo's existing
 * occurrence-identity rule already uses (see
 * AppStateContext.hasRecurringItemOccurrenceRecorded, which defines "same
 * occurrence" as (recurringItemId, local calendar day)). Exported so it can
 * be tested directly as a real function, and reused by
 * formatBriefingDateContext below for the Briefing's own date header. */
export function occurrenceDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Correction pass — occurrence identity now carries THREE parts, not two:
 * source type, source record id, and the occurrence's own local-calendar
 * date key. A source id alone is not a full occurrence identity: a
 * recurring bill recurs every cycle under the SAME recurringItemId, so an
 * overdue reminder about one specific past due date must never be treated
 * as "the same occurrence" as a future, still-eligible due date for that
 * same bill — only sourceType + sourceId + occurrenceDateKey together
 * identify one specific occurrence. sourceType always paired with sourceId
 * so a raw id string from one source type (e.g. a RecurringItem) can never
 * be mistaken for the same id belonging to a different source type (e.g. a
 * CreditCard) — never a substring/parse of any composite display id; the
 * date component is sourced directly from each side's own existing date
 * field (TimelineEvent.date / SmartReminder.occurrenceDate), never parsed
 * out of a composite id either. */
export interface OccurrenceIdentity {
  sourceType: 'recurring_item' | 'credit_card' | 'bnpl_liability';
  sourceId: string;
  occurrenceDateKey: string;
}

/** A single, stable, comparable string for a full OccurrenceIdentity — used
 * for both the candidate-to-candidate dedup Set key and the final
 * deterministic sort tie-break, so both use the exact same identity
 * definition rather than two independently-derived comparisons. */
function occurrenceIdentityKey(identity: OccurrenceIdentity | null): string | null {
  return identity ? `${identity.sourceType}:${identity.sourceId}:${identity.occurrenceDateKey}` : null;
}

function eventOccurrenceIdentity(e: Pick<TimelineEvent, 'recurringItemId' | 'creditCardId' | 'bnplLiabilityId' | 'date'>): OccurrenceIdentity | null {
  // recurringItemId is checked first deliberately: a bnpl_repayment_due
  // event/reminder carries BOTH recurringItemId and bnplLiabilityId (the
  // recurring occurrence that represents the BNPL repayment, and the
  // liability it reduces) — recurringItemId is the field both the
  // TimelineEvent and the SmartReminder populate identically for that case,
  // so checking it first is what makes the two sides agree without any
  // special BNPL branch here.
  if (e.recurringItemId) return { sourceType: 'recurring_item', sourceId: e.recurringItemId, occurrenceDateKey: occurrenceDateKey(e.date) };
  if (e.creditCardId) return { sourceType: 'credit_card', sourceId: e.creditCardId, occurrenceDateKey: occurrenceDateKey(e.date) };
  if (e.bnplLiabilityId) return { sourceType: 'bnpl_liability', sourceId: e.bnplLiabilityId, occurrenceDateKey: occurrenceDateKey(e.date) };
  return null;
}

/** Requires BOTH a source id and reminder.occurrenceDate to resolve a real
 * identity — a reminder with a source but no known occurrence date (should
 * not arise from computeTopReminder, which now populates it on every
 * branch, but defensively guarded here) intentionally resolves to null
 * rather than falling back to source-only matching, which would silently
 * regress to the old, too-broad "any occurrence of this source" dedup this
 * correction pass exists to fix. */
function reminderOccurrenceIdentity(reminder: SmartReminder): OccurrenceIdentity | null {
  if (!reminder.occurrenceDate) return null;
  const key = occurrenceDateKey(new Date(reminder.occurrenceDate));
  if (reminder.recurringItemId) return { sourceType: 'recurring_item', sourceId: reminder.recurringItemId, occurrenceDateKey: key };
  if (reminder.creditCardId) return { sourceType: 'credit_card', sourceId: reminder.creditCardId, occurrenceDateKey: key };
  if (reminder.liabilityId) return { sourceType: 'bnpl_liability', sourceId: reminder.liabilityId, occurrenceDateKey: key };
  return null;
}

function sameOccurrence(a: OccurrenceIdentity | null, b: OccurrenceIdentity | null): boolean {
  return !!a && !!b && a.sourceType === b.sourceType && a.sourceId === b.sourceId && a.occurrenceDateKey === b.occurrenceDateKey;
}

export interface TodayBriefingEventRow {
  /** The source TimelineEvent's own composite id — already unique per
   * occurrence (embeds the occurrence's own date/timestamp), so separate
   * occurrences of the same recurring source never collide. Used as the
   * React key; the deterministic sort tie-break below uses the full
   * OccurrenceIdentity instead (see selectTodayBriefingEventRows). */
  key: string;
  kind: TimelineEventKind;
  title: string;
  tone: 'warning' | 'neutral';
  icon: keyof typeof Ionicons.glyphMap;
  /** Pass 2B correction — carried through from the source TimelineEvent so
   * the compact Briefing tile (briefingTiles.ts) can derive a short
   * relative-day supporting line ("Today"/"Tomorrow"/"In N days") using the
   * exact same day-count `title` above was already built from
   * (buildAttentionEventTitle), never a separately recomputed value. Purely
   * additive — no existing consumer of this interface read this field
   * before, so this cannot change any prior selection/rendering behaviour. */
  daysUntil: number;
}

/**
 * The Today Briefing's independent event rows (Pass 2A, corrected).
 *
 * Deliberately does NOT call computeAttentionItems: that function owns
 * Money's "Needs your attention" list, which is capped and shortfall-first
 * by design — reusing it here would mean either accepting an arbitrary
 * intermediate cap before this function's own dedup/sort/cap pipeline runs,
 * or re-deriving its shortfall-exclusion logic. Instead this calls the
 * extracted, uncapped eligibility selectors (selectUrgentOutflowEvents /
 * selectNearTermIncomeEvents — the PLURAL, uncapped income selector, not
 * computeAttentionItems' own single-nearest one; see selectNearTermIncomeEvents'
 * own doc comment in moneyTimeline.ts for why a single preselection there
 * would silently discard a later, independent income occurrence once the
 * nearest one gets excluded by reminder dedup below) that computeAttentionItems
 * itself also draws its own eligibility rule from — the exact same
 * eligibility rule, single-sourced, with no shortfall entry ever present in
 * this data path to begin with (the AUP leading area is the sole owner of
 * shortfall presentation; selectUrgentOutflowEvents/selectNearTermIncomeEvents
 * only ever draw from real TimelineEvent kinds, and computeAttentionItems'
 * synthetic 'shortfall' entry is never a TimelineEvent, so it can never
 * reach this candidate list).
 *
 * Full pipeline, in order (correction pass):
 *   1. generate all eligible accepted candidates (uncapped)
 *   2. remove primary-row-owned shortfall content (structurally satisfied —
 *      see above; no synthetic shortfall row can ever reach step 1's input)
 *   3. deduplicate against the selected reminder occurrence (full
 *      OccurrenceIdentity — source type + source id + occurrence date, so
 *      only the ONE specific occurrence the reminder is about is excluded,
 *      never every occurrence of that recurring source)
 *   4. deduplicate candidate-to-candidate (by the same full OccurrenceIdentity)
 *   5. sort deterministically (daysUntil ascending, then the full
 *      OccurrenceIdentity as the final tie-break)
 *   6. select the contextual rows / 7. enforce the overall three-row maximum
 *      — both done in one step via maxRows, which itself defaults to a
 *      budget derived from topReminder's presence, not a flat 2: the
 *      required outcome is "no more than three actionable rows overall"
 *      across the Briefing's AUP row (always 1) + the top reminder (0 or 1)
 *      + these event rows, never "up to two event rows" unconditionally
 *      (which could total 4 when a reminder is also showing).
 */
export function selectTodayBriefingEventRows(
  events: TimelineEvent[],
  topReminder: SmartReminder | null,
  maxRows: number = topReminder ? 1 : 2
): TodayBriefingEventRow[] {
  // 1. generate all eligible accepted candidates (uncapped)
  const candidates: TimelineEvent[] = [...selectUrgentOutflowEvents(events), ...selectNearTermIncomeEvents(events)];

  // 3. deduplicate against the selected reminder occurrence
  const reminderIdentity = topReminder ? reminderOccurrenceIdentity(topReminder) : null;
  const afterReminderDedup = candidates.filter((e) => !sameOccurrence(eventOccurrenceIdentity(e), reminderIdentity));

  // 4. deduplicate candidate-to-candidate — keeps the first occurrence of
  // each distinct identity encountered (candidates are not yet sorted at
  // this point, so "first" here just means first in gather order; final
  // presentation order is entirely decided by the sort in step 5, which
  // runs on the deduplicated set).
  const seenIdentities = new Set<string>();
  const deduped: TimelineEvent[] = [];
  for (const e of afterReminderDedup) {
    const key = occurrenceIdentityKey(eventOccurrenceIdentity(e)) ?? e.id;
    if (seenIdentities.has(key)) continue;
    seenIdentities.add(key);
    deduped.push(e);
  }

  // 5. sort deterministically — daysUntil first, then the full occurrence
  // identity as the final tie-break (falls back to the event's own stable
  // id only in the structurally-unreachable case where no identity could
  // be resolved at all).
  const sorted = [...deduped].sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    const aKey = occurrenceIdentityKey(eventOccurrenceIdentity(a)) ?? a.id;
    const bKey = occurrenceIdentityKey(eventOccurrenceIdentity(b)) ?? b.id;
    return aKey.localeCompare(bKey);
  });

  // 6/7. select the contextual rows, enforcing the overall three-row budget.
  return sorted.slice(0, maxRows).map((e) => ({
    key: e.id,
    kind: e.kind,
    title: buildAttentionEventTitle(e),
    tone: attentionEventTone(e),
    icon: e.kind === 'income' ? 'cash' : e.icon,
    daysUntil: e.daysUntil,
  }));
}

/** The Today Briefing's date/context header text — "Tuesday, 11 August" —
 * using the same local-calendar Date already threaded through every other
 * Briefing calculation (TodayScreen's useCurrentLocalDate-sourced
 * `currentDate`), never a separately-captured `new Date()`. Locale-aware
 * (toLocaleDateString), matching the weekday/day/month format convention
 * already used elsewhere in this app (AddWealthItemModal.tsx,
 * AddIncomeModal.tsx, AddRecurringItemModal.tsx). */
export function formatBriefingDateContext(today: Date): string {
  return today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export { eventOccurrenceIdentity, reminderOccurrenceIdentity, sameOccurrence, occurrenceIdentityKey };
