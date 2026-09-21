/**
 * Pass C.2 — the ONE shared payday-boundary selector, evaluated from a FUTURE
 * reference date.
 *
 * Available Until Payday's boundary is the user's single primary pay cycle:
 * `user.nextPayday` stepped at `cycleLengthDays(user.payFrequency)` — the
 * exact cadence AUP derives its cycle from and the money timeline already
 * repeats primary-cycle events at (moneyTimeline.ts). AUP itself only ever
 * needs the NEXT boundary, so it cannot answer "the first payday strictly
 * after date X"; rather than let the daily guide grow a second payday rule,
 * this helper narrowly extends the same selection: start at `nextPayday` and
 * step by the same `cycleLengthDays` until the boundary is strictly after
 * `after`. It never looks at individual recurring income items, so a small
 * secondary or ad-hoc income can never be mistaken for a payday.
 *
 * Lives in its own module (not safeToSpend.ts) so the accepted AUP owner stays
 * byte-for-byte unchanged and keeps its A2-gated import boundary; the cadence
 * itself is still read from AUP's `cycleLengthDays`, never re-declared. Pure
 * A2 calendar-day arithmetic (no ms division); no AppData writes.
 *
 * 'irregular' income has no assertable cadence (AUP's 30-day fallback is a
 * documented MVP limitation for the CURRENT cycle only), so only the recorded
 * next payday itself is accepted; anything beyond it fails closed.
 */

import { AppData } from '../../types/models';
import { LocalDate, addCalendarDays, compareLocalDates, localDateFromDate } from './localCalendar';
import { cycleLengthDays } from './safeToSpend';

export type PaydayBoundaryAfter =
  | { kind: 'known'; date: LocalDate; stepsFromNext: number; source: 'next_payday' | 'projected_cycle' }
  | { kind: 'no_payday' }
  | { kind: 'invalid_payday' }
  | { kind: 'irregular_beyond_next'; nextPayday: LocalDate };

export function paydayBoundaryAfter(
  user: Pick<AppData['user'], 'nextPayday' | 'payFrequency'>,
  after: LocalDate
): PaydayBoundaryAfter {
  if (!user.nextPayday) return { kind: 'no_payday' };
  let candidate: LocalDate;
  try {
    candidate = localDateFromDate(new Date(user.nextPayday));
  } catch {
    return { kind: 'invalid_payday' };
  }
  const cycleDays = cycleLengthDays(user.payFrequency);
  let steps = 0;
  // A 90-day horizon needs at most ~13 weekly steps; 400 is a hard safety cap
  // against a pathological (very old) next-payday value — fail closed, never loop.
  while (compareLocalDates(candidate, after) <= 0) {
    if (user.payFrequency === 'irregular') return { kind: 'irregular_beyond_next', nextPayday: candidate };
    if (steps >= 400) return { kind: 'invalid_payday' };
    candidate = addCalendarDays(candidate, cycleDays);
    steps++;
  }
  return { kind: 'known', date: candidate, stepsFromNext: steps, source: steps === 0 ? 'next_payday' : 'projected_cycle' };
}
