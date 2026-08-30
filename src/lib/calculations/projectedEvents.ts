/**
 * A3 — the ONE canonical projected-event stream.
 *
 * There is a SINGLE resolved result. What Happens Next (the money timeline) and
 * the later Look Ahead forecast both consume it: A1 occurrence resolution,
 * inclusion/exclusion, partial-payment and blocking rules are applied EXACTLY
 * ONCE here. The money timeline is a presentation-only adapter over the
 * canonical INCLUDED events — it maps canonical fields into its existing shape,
 * labels, icons, due-state and one-day display grace, and it NEVER independently
 * decides whether an income/bill/card/BNPL/loan occurrence remains eligible.
 *
 * Reuses the existing recurrence, BNPL, card, A1 identity/resolver and A2
 * local-calendar owners — it invents no second enumerator, resolver, repayment
 * calculator, recurrence engine or occurrence identity. Pure and read-only:
 * zero AppData writes, no persistence. The B engine consumes `events` and the
 * typed `issues` and can fail closed without re-enumerating source data.
 *
 * Savings/goal timeline rows are NOT part of this stream: under Option B they
 * are informational and are not A3 occurrence families; the money timeline keeps
 * computing them and the forecast sources them from A2's allocator.
 */

import { Ionicons } from '@expo/vector-icons';
import { AppData, CreditCard, LiabilityType, RecurringItem } from '../../types/models';
import { recurringOccurrencesInRange, isValidScheduleAnchorDay } from './recurringSchedule';
import { projectBnplOccurrences } from './bnpl';
import { daysUntilDue, resolveExpectedMonthlyRepayment } from './creditHealth';
import { isCardOccurrenceHandled } from './reminders';
import { moneyAmountToCents } from './money';
import {
  expectedRepaymentCentsForCard,
  expectedRepaymentCentsForItem,
  occurrenceIdForCard,
  occurrenceIdForRecurringItem,
  sourceInfoForRecurringItem,
} from './occurrenceSources';
import { OccurrenceSourceKind, OccurrenceId } from './occurrenceIdentity';
import { LocalDate, addCalendarDays, compareLocalDates, localDateFromDate, parseLocalDate, toISODate } from './localCalendar';
import { OccurrenceBlockingIssue, OccurrenceDescriptor, OccurrenceState, resolveOccurrence } from './occurrenceResolution';
import type { TimelineEvent, TimelineEventKind } from './moneyTimeline';

const MS_PER_DAY = 86400000;
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function calendarOrdinal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY;
}
function daysBetween(from: Date, to: Date): number {
  return calendarOrdinal(to) - calendarOrdinal(from);
}
function localToJsDate(d: LocalDate): Date {
  return new Date(d.year, d.month - 1, d.day);
}

// --- canonical event schema -----------------------------------------------

export type ProjectedEventAssumption = 'assumed' | 'scheduled';
export type ProjectedEventInclusion = 'included' | 'excluded';
export type ProjectedEventExclusionReason = 'already_satisfied' | 'card_occurrence_handled' | 'blocking_issue';

export interface ProjectedEditDestination {
  kind: 'recurring_item' | 'credit_card';
  id: string;
}

/** Presentation carry-through for the money timeline adapter (formatting only —
 * never eligibility). */
export interface ProjectedEventPresentation {
  timelineId: string;
  timelineKind: TimelineEventKind;
  icon: keyof typeof Ionicons.glyphMap;
  sublabel?: string;
  jsDate: Date;
  recurringItemId?: string;
  creditCardId?: string;
  bnplLiabilityId?: string;
}

export interface ProjectedEvent {
  occurrenceId: OccurrenceId;
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  liabilitySubtype?: LiabilityType;
  date: LocalDate;
  /** Positive income / negative outflow, resolution-adjusted (a partially
   * satisfied repayment carries only the remaining cents). */
  signedCents: number;
  resolutionState: OccurrenceState;
  assumption: ProjectedEventAssumption;
  inclusion: ProjectedEventInclusion;
  exclusionReason?: ProjectedEventExclusionReason;
  blockingIssue?: OccurrenceBlockingIssue;
  label: string;
  editDestination: ProjectedEditDestination;
  orderingKey: string;
  presentation: ProjectedEventPresentation;
}

export type ProjectedIssueCode =
  | 'invalid_date'
  | 'invalid_amount'
  | 'unsafe_amount'
  | 'unresolved'
  | 'conflict'
  | 'unknown_resolution_version'
  | 'invalid_occurrence'
  | 'undated_income';

/** A typed problem the forecast can fail closed on without re-scanning source
 * data. `blocking: false` marks a conservative, non-error exclusion (e.g.
 * undated positive income). */
export interface ProjectedIssue {
  code: ProjectedIssueCode;
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  reason: string;
  blocking: boolean;
  editDestination?: ProjectedEditDestination;
  occurrenceId?: OccurrenceId;
}

export interface ProjectedEventsResult {
  events: ProjectedEvent[];
  excluded: ProjectedEvent[];
  issues: ProjectedIssue[];
}

// Defined source-type rank — compatible with the accepted money-timeline
// hierarchy (income, then bills/loans, then BNPL, then cards). Same-date order
// is presentation-only; the forecast folds one end-of-day net batch.
const EVENT_TYPE_ORDER: Record<OccurrenceSourceKind, number> = {
  income: 0,
  bill: 1,
  loan: 1,
  bnpl: 2,
  card: 3,
};

// --- source validation (before recurrence expansion) ----------------------

interface ValidatedSources {
  incomeItems: RecurringItem[];
  billItems: RecurringItem[];
  bnplItems: { item: RecurringItem; liability: AppData['liabilities'][number] }[];
  cards: CreditCard[];
  issues: ProjectedIssue[];
}

function validRecurringDate(item: RecurringItem): boolean {
  if (item.nextDueDateUnknown) return false;
  const d = new Date(item.nextDueDate);
  return !Number.isNaN(d.getTime());
}
function itemCents(item: RecurringItem): number | null {
  const v = moneyAmountToCents(item.amount);
  return v.valid ? v.cents : null;
}

function validateSources(data: AppData): ValidatedSources {
  const issues: ProjectedIssue[] = [];
  const incomeItems: RecurringItem[] = [];
  const billItems: RecurringItem[] = [];
  const bnplItems: ValidatedSources['bnplItems'] = [];
  const cards: CreditCard[] = [];

  // BNPL liability ↔ single active expense link (none/ambiguous → not shown).
  const bnplLiabilityByItemId = new Map<string, (typeof data.liabilities)[number]>();
  for (const liability of data.liabilities) {
    if (liability.type !== 'bnpl') continue;
    const links = data.recurringItems.filter((r) => r.active && r.linkedLiabilityId === liability.id && r.type === 'expense');
    if (links.length === 1) bnplLiabilityByItemId.set(links[0].id, liability);
  }

  for (const item of data.recurringItems) {
    if (!item.active) continue; // inactive sources are ignored
    if (item.type === 'income') {
      // Undated / invalid-date positive income is conservatively excluded with a
      // NON-blocking reason (the spec permits it); an invalid amount likewise.
      if (!validRecurringDate(item)) {
        issues.push({ code: 'undated_income', sourceKind: 'income', sourceId: item.id, reason: 'income source has no known/valid next date', blocking: false, editDestination: { kind: 'recurring_item', id: item.id } });
        continue;
      }
      if (itemCents(item) === null) {
        issues.push({ code: 'undated_income', sourceKind: 'income', sourceId: item.id, reason: 'income source has an invalid amount', blocking: false, editDestination: { kind: 'recurring_item', id: item.id } });
        continue;
      }
      incomeItems.push(item);
      continue;
    }
    // expense — bill / loan / BNPL. An active material commitment with a missing
    // or invalid required date or amount is a typed BLOCKING issue (never a
    // silent omission, never coerced to zero).
    const info = sourceInfoForRecurringItem(data, item);
    const sourceKind: OccurrenceSourceKind = bnplLiabilityByItemId.has(item.id) ? 'bnpl' : info?.sourceKind ?? 'bill';
    const edit: ProjectedEditDestination = { kind: 'recurring_item', id: item.id };
    if (!validRecurringDate(item)) {
      issues.push({ code: 'invalid_date', sourceKind, sourceId: item.id, reason: 'required recurrence date is missing or invalid', blocking: true, editDestination: edit });
      continue;
    }
    if (itemCents(item) === null) {
      issues.push({ code: 'invalid_amount', sourceKind, sourceId: item.id, reason: 'commitment amount is not a valid positive money value', blocking: true, editDestination: edit });
      continue;
    }
    if (bnplLiabilityByItemId.has(item.id)) bnplItems.push({ item, liability: bnplLiabilityByItemId.get(item.id)! });
    else billItems.push(item);
  }

  for (const card of data.creditCards) {
    const expected = resolveExpectedMonthlyRepayment(card);
    if (expected <= 0) continue; // no planned repayment → not a material commitment
    const edit: ProjectedEditDestination = { kind: 'credit_card', id: card.id };
    if (!isValidScheduleAnchorDay(card.dueDay)) {
      issues.push({ code: 'invalid_date', sourceKind: 'card', sourceId: card.id, reason: 'credit card has an invalid due day', blocking: true, editDestination: edit });
      continue;
    }
    if (expectedRepaymentCentsForCard(card) === undefined) {
      issues.push({ code: 'invalid_amount', sourceKind: 'card', sourceId: card.id, reason: 'card expected repayment is not a valid positive money value', blocking: true, editDestination: edit });
      continue;
    }
    cards.push(card);
  }

  return { incomeItems, billItems, bnplItems, cards, issues };
}

// --- raw occurrence enumeration (validated sources only) ------------------

interface RawOccurrence {
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  liabilitySubtype?: LiabilityType;
  jsDate: Date;
  localDate: LocalDate;
  occurrenceId: OccurrenceId | undefined;
  isRepayment: boolean;
  expectedCents?: number;
  scheduledSignedCents: number;
  legacyKey?: string;
  cardHandled: boolean;
  presentation: ProjectedEventPresentation;
  editDestination: ProjectedEditDestination;
  label: string;
}

function legacyKeyFor(item: RecurringItem, occDate: Date): string | undefined {
  const cursor = new Date(item.nextDueDate);
  if (Number.isNaN(cursor.getTime())) return undefined;
  return cursor.getFullYear() === occDate.getFullYear() && cursor.getMonth() === occDate.getMonth() && cursor.getDate() === occDate.getDate()
    ? `${item.id}:${item.nextDueDate}`
    : undefined;
}

function enumerateRawOccurrences(data: AppData, valid: ValidatedSources, asOf: Date, from: Date, to: Date): RawOccurrence[] {
  const rows: RawOccurrence[] = [];

  for (const { item, date } of recurringOccurrencesInRange(valid.incomeItems, from, to)) {
    const cents = itemCents(item)!;
    rows.push({
      sourceKind: 'income', sourceId: item.id, jsDate: date, localDate: localDateFromDate(date),
      occurrenceId: occurrenceIdForRecurringItem(data, item, date), isRepayment: false,
      scheduledSignedCents: cents, legacyKey: legacyKeyFor(item, date), cardHandled: false,
      label: item.label, editDestination: { kind: 'recurring_item', id: item.id },
      presentation: { timelineId: `income-${item.id}-${date.getTime()}`, timelineKind: 'income', icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? 'cash', jsDate: date, recurringItemId: item.id },
    });
  }

  for (const { item, date } of recurringOccurrencesInRange(valid.billItems, from, to)) {
    const info = sourceInfoForRecurringItem(data, item);
    const liability = item.linkedLiabilityId ? data.liabilities.find((l) => l.id === item.linkedLiabilityId) : undefined;
    const isMortgage = liability?.type === 'mortgage';
    const cents = itemCents(item)!;
    rows.push({
      sourceKind: info?.sourceKind ?? 'bill', sourceId: item.id, liabilitySubtype: info?.liabilitySubtype,
      jsDate: date, localDate: localDateFromDate(date),
      occurrenceId: occurrenceIdForRecurringItem(data, item, date), isRepayment: info?.isRepayment ?? false,
      expectedCents: info?.isRepayment ? expectedRepaymentCentsForItem(item) : undefined,
      scheduledSignedCents: -cents, legacyKey: legacyKeyFor(item, date), cardHandled: false,
      label: item.label, editDestination: { kind: 'recurring_item', id: item.id },
      presentation: { timelineId: `bill-${item.id}-${date.getTime()}`, timelineKind: isMortgage ? 'mortgage' : 'bill', icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? (isMortgage ? 'home' : 'calendar-outline'), jsDate: date, recurringItemId: item.id },
    });
  }

  for (const { item, liability } of valid.bnplItems) {
    for (const occ of projectBnplOccurrences(item, liability, from, to)) {
      rows.push({
        sourceKind: 'bnpl', sourceId: item.id, liabilitySubtype: 'bnpl', jsDate: occ.date, localDate: localDateFromDate(occ.date),
        occurrenceId: occurrenceIdForRecurringItem(data, item, occ.date), isRepayment: true, expectedCents: occ.amountCents,
        scheduledSignedCents: -occ.amountCents, legacyKey: legacyKeyFor(item, occ.date), cardHandled: false,
        label: item.label, editDestination: { kind: 'recurring_item', id: item.id },
        presentation: { timelineId: occ.id, timelineKind: 'bnpl', icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? 'bag-handle-outline', jsDate: occ.date, recurringItemId: item.id, bnplLiabilityId: liability.id },
      });
    }
  }

  for (const card of valid.cards) {
    const daysUntil = daysUntilDue(card.dueDay, asOf);
    const dueDate = new Date(asOf.getTime() + daysUntil * MS_PER_DAY);
    if (dueDate.getTime() < from.getTime() || dueDate.getTime() > to.getTime()) continue;
    rows.push({
      sourceKind: 'card', sourceId: card.id, jsDate: dueDate, localDate: localDateFromDate(dueDate),
      occurrenceId: occurrenceIdForCard(card, dueDate), isRepayment: true, expectedCents: expectedRepaymentCentsForCard(card),
      scheduledSignedCents: -(expectedRepaymentCentsForCard(card) as number), cardHandled: isCardOccurrenceHandled(card, dueDate),
      label: `${card.label} credit card repayment`, editDestination: { kind: 'credit_card', id: card.id },
      presentation: { timelineId: `card-${card.id}`, timelineKind: 'credit_card', icon: 'card', sublabel: 'Based on what you expect to repay', jsDate: dueDate, creditCardId: card.id },
    });
  }

  return rows;
}

// --- resolution (applied exactly once) ------------------------------------

function buildEvent(data: AppData, r: RawOccurrence): { event: ProjectedEvent; issue?: ProjectedIssue } {
  const assumption: ProjectedEventAssumption = r.sourceKind === 'income' ? 'assumed' : 'scheduled';
  const base = {
    occurrenceId: r.occurrenceId as OccurrenceId,
    sourceKind: r.sourceKind,
    sourceId: r.sourceId,
    liabilitySubtype: r.liabilitySubtype,
    date: r.localDate,
    assumption,
    label: r.label,
    editDestination: r.editDestination,
    orderingKey: `${toISODate(r.localDate)}|${EVENT_TYPE_ORDER[r.sourceKind]}|${r.sourceId}|${r.occurrenceId ?? ''}`,
    presentation: r.presentation,
  };

  if (r.cardHandled) {
    return { event: { ...base, signedCents: 0, resolutionState: 'satisfied', inclusion: 'excluded', exclusionReason: 'card_occurrence_handled' } };
  }

  const descriptor: OccurrenceDescriptor = {
    id: r.occurrenceId, sourceKind: r.sourceKind, sourceId: r.sourceId,
    isRepayment: r.isRepayment, expectedCents: r.expectedCents, legacyKey: r.legacyKey,
  };
  const res = resolveOccurrence(descriptor, data.transactions);

  const blockingIssue = (issue: OccurrenceBlockingIssue, code: ProjectedIssueCode): { event: ProjectedEvent; issue: ProjectedIssue } => ({
    event: { ...base, signedCents: 0, resolutionState: res.state, inclusion: 'excluded', exclusionReason: 'blocking_issue', blockingIssue: issue },
    issue: { code, sourceKind: r.sourceKind, sourceId: r.sourceId, reason: issue.reason, blocking: true, editDestination: r.editDestination, occurrenceId: r.occurrenceId },
  });

  switch (res.state) {
    case 'eligible':
      return { event: { ...base, signedCents: r.scheduledSignedCents, resolutionState: 'eligible', inclusion: 'included' } };
    case 'partially_satisfied':
      return { event: { ...base, signedCents: -(res.remainingCents ?? 0), resolutionState: 'partially_satisfied', inclusion: 'included' } };
    case 'satisfied':
      return { event: { ...base, signedCents: 0, resolutionState: 'satisfied', inclusion: 'excluded', exclusionReason: 'already_satisfied' } };
    case 'unresolved':
      return blockingIssue(res.blockingIssue ?? { kind: 'invalid_occurrence', reason: 'unresolved' }, res.blockingIssue?.kind === 'unknown_resolution_version' ? 'unknown_resolution_version' : 'unresolved');
    case 'conflict':
      return blockingIssue(res.blockingIssue ?? { kind: 'conflict', reason: 'conflict', transactionIds: [] }, 'conflict');
    case 'invalid':
      return blockingIssue(res.blockingIssue ?? { kind: 'invalid_occurrence', reason: 'invalid occurrence' }, 'invalid_occurrence');
    default:
      return blockingIssue({ kind: 'invalid_occurrence', reason: `unexpected occurrence state ${res.state}` }, 'invalid_occurrence');
  }
}

const bySourceKindRank = (k: OccurrenceSourceKind) => EVENT_TYPE_ORDER[k];
function sortEvents(a: ProjectedEvent, b: ProjectedEvent): number {
  return a.orderingKey < b.orderingKey ? -1 : a.orderingKey > b.orderingKey ? 1 : 0;
}
function sortIssues(a: ProjectedIssue, b: ProjectedIssue): number {
  const ka = `${bySourceKindRank(a.sourceKind)}|${a.sourceId}|${a.code}`;
  const kb = `${bySourceKindRank(b.sourceKind)}|${b.sourceId}|${b.code}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * THE canonical A3 stream over the inclusive window [windowStart ?? asOf,
 * requestedEnd]. `asOf` anchors card due dates; `windowStart` (default asOf)
 * lets the timeline adapter open a one-day display grace WITHOUT bypassing
 * resolution. Deterministically ordered; pure and read-only.
 */
export function computeProjectedEvents(
  data: AppData,
  asOf: LocalDate,
  requestedEnd: LocalDate,
  options: { windowStart?: LocalDate } = {}
): ProjectedEventsResult {
  const windowStart = options.windowStart ?? asOf;
  if (compareLocalDates(windowStart, requestedEnd) > 0) {
    return { events: [], excluded: [], issues: [] };
  }
  const valid = validateSources(data);
  const asOfDate = localToJsDate(asOf);
  const fromDate = localToJsDate(windowStart);
  const toDate = localToJsDate(requestedEnd);
  const rows = enumerateRawOccurrences(data, valid, asOfDate, fromDate, toDate);

  const events: ProjectedEvent[] = [];
  const excluded: ProjectedEvent[] = [];
  const issues: ProjectedIssue[] = [...valid.issues];
  for (const r of rows) {
    if (compareLocalDates(r.localDate, windowStart) < 0 || compareLocalDates(r.localDate, requestedEnd) > 0) continue;
    const { event, issue } = buildEvent(data, r);
    if (event.inclusion === 'included') events.push(event);
    else excluded.push(event);
    if (issue) issues.push(issue);
  }
  events.sort(sortEvents);
  excluded.sort(sortEvents);
  issues.sort(sortIssues);
  return { events, excluded, issues };
}

/** Convenience: the canonical stream from ISO `YYYY-MM-DD` bounds. */
export function computeProjectedEventsFromISO(data: AppData, asOfISO: string, requestedEndISO: string): ProjectedEventsResult {
  return computeProjectedEvents(data, parseLocalDate(asOfISO), parseLocalDate(requestedEndISO));
}

// --- money-timeline presentation adapter (formatting only) ----------------

/**
 * The occurrence-family rows for What Happens Next, derived from the ONE
 * canonical INCLUDED event set. This is presentation only: it maps canonical
 * fields into the timeline's existing shape, preserves the one-day outflow
 * display grace and the income display window, and NEVER re-decides eligibility
 * (linked/satisfied/partial/blocked already resolved canonically). Cards are
 * anchored to `today`; the grace opens the window one day earlier so an overdue
 * bill still flows through canonical resolution rather than a separate path.
 */
export function projectTimelineOccurrences(data: AppData, today: Date = new Date(), horizonDays: number = 30): TimelineEvent[] {
  const asOf = localDateFromDate(startOfDay(today));
  const windowStart = addCalendarDays(asOf, -1);
  const requestedEnd = addCalendarDays(asOf, horizonDays);
  const { events } = computeProjectedEvents(data, asOf, requestedEnd, { windowStart });

  const out: TimelineEvent[] = [];
  for (const ev of events) {
    const p = ev.presentation;
    const daysUntil = daysBetween(today, p.jsDate);
    // Display window (presentation only): income from today; outflows keep the
    // established one-day grace; cards are anchored to today so are never < 0.
    if (ev.sourceKind === 'income') {
      if (daysUntil < 0) continue;
    } else if (ev.sourceKind !== 'card') {
      if (daysUntil < -1) continue;
    }
    out.push({
      id: p.timelineId,
      date: p.jsDate,
      daysUntil,
      kind: p.timelineKind,
      icon: p.icon,
      label: ev.label,
      sublabel: p.sublabel,
      amount: ev.signedCents / 100,
      recurringItemId: p.recurringItemId,
      creditCardId: p.creditCardId,
      bnplLiabilityId: p.bnplLiabilityId,
    });
  }
  return out;
}
