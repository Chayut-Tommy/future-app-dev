/**
 * Nolie Design 5.1 Wave 6 — which reminder occurrences are currently
 * suppressed, and why.
 *
 * WHY THIS IS ITS OWN MODULE. reminders.ts already accepts an `isExcluded`
 * predicate (`computeRankedReminder(data, today, isExcluded)`), which is
 * precisely the seam this needs — so Snooze and Dismiss are expressed as a
 * predicate the existing ranker consults, and reminders.ts itself is never
 * edited. That matters beyond tidiness: the ranker is a financial-adjacent
 * engine, and its tier ordering, day-count boundaries and eligibility gates
 * stay byte-identical.
 *
 * Nothing here computes, moves or reclassifies money. Suppression decides
 * whether a QUESTION is asked, never what the answer did to a balance. A
 * snoozed bill is still an upcoming commitment everywhere it always was —
 * Available Until Payday, the money timeline, the monthly summary and the
 * What Happens Next list all read their own sources and never consult this
 * module.
 *
 * Pure and RN-free, so the whole matrix is testable without a mount.
 */

import { AppData } from '../../types/models';
import { SmartReminder } from './reminders';
import { occurrenceKeyOf } from './reminderInteractionLifecycle';

/** A local calendar day, `YYYY-MM-DD`. Deliberately NOT an instant: a
 * customer who snoozes until tomorrow means their tomorrow, wherever they
 * are, and a UTC instant would surface the reminder a few hours early or
 * late either side of the date line. */
export type LocalDateString = string;

/**
 * The local calendar day for a Date, formatted from its LOCAL parts.
 *
 * `toISOString().slice(0, 10)` — the format used elsewhere in this repo for
 * date KEYS derived from already-normalised dates — would be wrong here: it
 * converts to UTC first, so for a customer east of UTC late in the evening
 * it yields tomorrow's key, and west of UTC early in the morning it yields
 * yesterday's. Snooze is the one place where the customer's own midnight is
 * the whole point.
 */
export function toLocalDateString(d: Date): LocalDateString {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** `n` whole local days after `from`. Uses setDate, so month, year and DST
 * boundaries are handled by the platform's own calendar arithmetic rather
 * than by adding milliseconds — a spring-forward day is 23 hours long, and
 * "tomorrow" must still be tomorrow. */
export function addLocalDays(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** True once `today` has reached the snooze's return day. Compared as
 * `YYYY-MM-DD` strings, which sort lexicographically in calendar order, so
 * no Date is reconstructed and no timezone can re-enter. */
export function isSnoozeElapsed(returnOn: LocalDateString, today: Date): boolean {
  return toLocalDateString(today) >= returnOn;
}

export const SNOOZE_PRESETS: readonly { id: 'tomorrow' | 'in3days'; label: string; days: number }[] = [
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'in3days', label: 'In 3 days', days: 3 },
];

/** Reading accessors that tolerate the field being absent — every customer
 * who saved data before Wave 6 has neither key, and `loadAppData` merges
 * defaults in, but a directly-constructed AppData in a test or an older
 * in-memory object may still lack them. */
export function snoozedOccurrences(data: AppData): Record<string, LocalDateString> {
  return data.snoozedReminderOccurrences ?? {};
}

export function dismissedOccurrences(data: AppData): readonly string[] {
  return data.dismissedReminderOccurrences ?? [];
}

export type SuppressionReason = 'dismissed' | 'snoozed' | null;

/**
 * Why this specific occurrence is suppressed right now, or null.
 *
 * Dismissal is checked first and is unconditional. A snooze is checked
 * against the CURRENT local date every time this runs — there is no timer
 * and no scheduled job, so an app that was backgrounded over midnight
 * simply computes a different answer on its next render.
 */
export function suppressionReasonFor(data: AppData, reminder: SmartReminder, today: Date): SuppressionReason {
  const key = occurrenceKeyOf(reminder);
  if (dismissedOccurrences(data).includes(key)) return 'dismissed';
  const returnOn = snoozedOccurrences(data)[key];
  if (typeof returnOn === 'string' && returnOn.length > 0 && !isSnoozeElapsed(returnOn, today)) return 'snoozed';
  return null;
}

/**
 * The predicate `computeRankedReminder` already takes. Compose it with any
 * caller-local exclusion (the sheet's own session set) rather than
 * replacing it — the two answer different questions: this one is what the
 * customer persisted, that one is what they did in this sitting.
 */
export function createSuppressionPredicate(data: AppData, today: Date): (reminder: SmartReminder) => boolean {
  return (reminder) => suppressionReasonFor(data, reminder, today) !== null;
}

/**
 * Retention. An occurrence key encodes a specific dated occurrence, so
 * every entry here is inherently finite and self-expiring — but only if
 * something actually removes it, and nothing in this app runs on a
 * schedule.
 *
 * The cleanup is therefore folded into the write path (see
 * AppStateContext's snooze/dismiss actions): each time the customer
 * suppresses something, entries whose day has passed by more than the
 * retention window are dropped. An elapsed snooze is already eligible
 * again, so dropping it changes no behaviour; it just stops the map
 * growing forever. Dismissals are kept against `today` the same way, using
 * the occurrence date embedded in the key when one is present, and are
 * otherwise retained — a key we cannot date is never guessed at and never
 * silently discarded.
 */
export const SUPPRESSION_RETENTION_DAYS = 400;

/** The `YYYY-MM-DD` an occurrence key refers to, when the key carries one.
 * Keys are built from an occurrence's own ISO date, so this reads the date
 * out rather than reconstructing it. Null when the key has no dated part. */
export function occurrenceKeyDate(key: string): LocalDateString | null {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(key);
  return match ? match[1] : null;
}

function isBeyondRetention(day: LocalDateString | null, today: Date): boolean {
  if (!day) return false; // undatable key — retained, never guessed at
  return day < toLocalDateString(addLocalDays(today, -SUPPRESSION_RETENTION_DAYS));
}

/** Drops snooze entries whose return day is long past. Returns the SAME
 * object when nothing changed, so a caller can skip a pointless write. */
export function pruneSnoozes(
  snoozes: Record<string, LocalDateString>,
  today: Date
): Record<string, LocalDateString> {
  const kept: Record<string, LocalDateString> = {};
  let dropped = 0;
  for (const [key, day] of Object.entries(snoozes)) {
    if (isBeyondRetention(day, today)) {
      dropped++;
      continue;
    }
    kept[key] = day;
  }
  return dropped === 0 ? snoozes : kept;
}

/** Drops dismissal keys whose own occurrence date is long past. */
export function pruneDismissals(keys: readonly string[], today: Date): readonly string[] {
  const kept = keys.filter((key) => !isBeyondRetention(occurrenceKeyDate(key), today));
  return kept.length === keys.length ? keys : kept;
}
