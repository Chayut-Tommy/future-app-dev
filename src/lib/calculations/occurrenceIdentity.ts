/**
 * A1 — Canonical occurrence identity.
 *
 * ONE opaque, versioned identity for a single scheduled occurrence, shared by
 * every consumer (manual-transaction linking, the occurrence resolver, and
 * later A3's projected-event stream). Consumers compare the COMPLETE id string
 * and never parse it for business logic (the field accessors here exist only
 * for constructing an id, never for re-deriving meaning from an existing one).
 *
 * Design contract (Gate 0 architecture closure, §B/§F):
 *  - Format: `oid1:<sourceKind>:<sourceId>:<cycleKey>`. `oid1` is the explicit
 *    identity namespace/version — bump only on a breaking id-format change so
 *    old persisted ids remain recognisably a different version and fail closed
 *    rather than silently colliding with a new format.
 *  - Identity NEVER contains a label, an amount, or a mutable "currently
 *    displayed" due day. It is derived only from the source kind, the stable
 *    source id, and a stable cycle key.
 *  - Monthly-cadence sources (monthly bills/income, credit cards, monthly
 *    BNPL/loans) use a billing/pay-MONTH cycle key `YYYY-MM`, so moving a
 *    monthly due day WITHIN the same month keeps the same occurrence; the
 *    actual due date stays occurrence DATA, never identity.
 *  - Sub-monthly sources (weekly/fortnightly) use the occurrence's own local
 *    calendar DATE `YYYY-MM-DD`. That date is a fixed point once the occurrence
 *    exists — a manual transaction linked to it keeps the same id even if the
 *    source's FUTURE schedule settings later change (historical ids are never
 *    rewritten). It is deliberately NOT the mutable `nextDueDate` cursor.
 *  - Deterministic across app restart and timezone/DST: the cycle key is built
 *    from the occurrence date's LOCAL calendar components (the same locally-
 *    constructed dates recurringSchedule produces), so a Y-M-D triple is stable
 *    regardless of the device's UTC offset or a DST transition.
 */

export const OCCURRENCE_ID_NAMESPACE = 'oid1';

/** The authoritative source kinds an occurrence can belong to. There is ONE
 * canonical loan family kind (`loan`) covering every supported loan subtype
 * (mortgage / car loan / personal loan / supported other loan): the subtype is
 * occurrence METADATA on the liability, never part of identity, so it can never
 * become a competing identity system and a subtype change never forks the id.
 * Different loans never collide because the stable `sourceId` (the loan's own
 * RecurringItem id) disambiguates them within the `loan` kind. */
export type OccurrenceSourceKind =
  | 'income'
  | 'bill'
  | 'card'
  | 'bnpl'
  | 'loan';

const SOURCE_KINDS: ReadonlySet<string> = new Set<OccurrenceSourceKind>([
  'income',
  'bill',
  'card',
  'bnpl',
  'loan',
]);

/** How the cycle key is granularised. `monthly` → YYYY-MM (billing/pay month);
 * `sub_monthly` → YYYY-MM-DD (the occurrence's own local calendar date). */
export type OccurrenceCadence = 'monthly' | 'sub_monthly';

/** Opaque branded string. Never construct one by hand — always via
 * `buildOccurrenceId` — and never destructure it for meaning. */
export type OccurrenceId = string & { readonly __occurrenceId: 'oid1' };

export interface OccurrenceIdInput {
  sourceKind: OccurrenceSourceKind;
  /** RecurringItem.id (income/bill/bnpl/loan) or CreditCard.id (card). Must not
   * itself contain the ':' delimiter or the namespace — those would make the
   * id ambiguous. A malformed source id fails closed (see `tryBuildOccurrenceId`). */
  sourceId: string;
  /** The occurrence's own local calendar date, as recurringSchedule produces it
   * (a locally-constructed Date). Used only to derive the cycle key. */
  occurrenceDate: Date;
  cadence: OccurrenceCadence;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar YYYY-MM (billing/pay month) — DST/timezone-stable. */
export function occurrenceMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** Local calendar YYYY-MM-DD — DST/timezone-stable as a fixed Y-M-D triple. */
export function occurrenceDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Map a RecurringItem/CreditCard cadence to the identity granularity. Weekly
 * and fortnightly are date-anchored; everything else (monthly, and irregular
 * which repeats monthly for projection) is month-anchored. Cards have no
 * RecurringItem frequency — they are always monthly (dueDay). */
export function cadenceForFrequency(frequency: string): OccurrenceCadence {
  return frequency === 'weekly' || frequency === 'fortnightly' ? 'sub_monthly' : 'monthly';
}

function isValidSourceId(sourceId: unknown): sourceId is string {
  return typeof sourceId === 'string' && sourceId.length > 0 && !sourceId.includes(':') && !sourceId.includes('|');
}

function isFiniteDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Build the canonical id, or return `undefined` (fail closed) for any invalid
 * input — an unknown source kind, a malformed source id, or a non-finite date.
 * Callers that must never proceed on a bad id use this and treat `undefined`
 * as an `invalid` occurrence rather than fabricating a partial id.
 */
export function tryBuildOccurrenceId(input: OccurrenceIdInput): OccurrenceId | undefined {
  if (!SOURCE_KINDS.has(input.sourceKind)) return undefined;
  if (!isValidSourceId(input.sourceId)) return undefined;
  if (!isFiniteDate(input.occurrenceDate)) return undefined;
  if (input.cadence !== 'monthly' && input.cadence !== 'sub_monthly') return undefined;
  const cycleKey = input.cadence === 'monthly' ? occurrenceMonthKey(input.occurrenceDate) : occurrenceDateKey(input.occurrenceDate);
  return `${OCCURRENCE_ID_NAMESPACE}:${input.sourceKind}:${input.sourceId}:${cycleKey}` as OccurrenceId;
}

/**
 * Strict build — throws on invalid input. Use only where the inputs are already
 * validated and a bad id genuinely indicates a programming error; prefer
 * `tryBuildOccurrenceId` on any path that handles customer/persisted data.
 */
export function buildOccurrenceId(input: OccurrenceIdInput): OccurrenceId {
  const id = tryBuildOccurrenceId(input);
  if (id === undefined) {
    throw new Error('buildOccurrenceId: invalid occurrence identity input');
  }
  return id;
}

/** True only for a string this module could have produced. Consumers use this
 * to fail closed on an unknown/older id namespace rather than trusting it. */
export function isOccurrenceId(value: unknown): value is OccurrenceId {
  return typeof value === 'string' && value.startsWith(`${OCCURRENCE_ID_NAMESPACE}:`) && value.split(':').length >= 4;
}
