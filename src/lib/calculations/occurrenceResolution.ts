/**
 * A1 — canonical occurrence resolver (pure).
 *
 * The SOLE authority for "what is the status of this scheduled occurrence, given
 * the live transaction ledger". Every consumer (manual-transaction linking, the
 * correction journey, and later A3's projected-event stream) calls this rather
 * than re-deriving status. It is a pure function of its inputs — no clock, no
 * persistence, no ordering assumptions.
 *
 * It also owns `classifyTransaction` (the per-transaction view: linked /
 * independent / unresolved / unclassified) and the write-time guard
 * `linkWouldConflict`, so the identity rules live in exactly one place.
 *
 * Key contracts (Gate 0 architecture closure §F, spec v1.2 §11.2):
 *  - Identity is compared as the complete OccurrenceId string; never parsed.
 *  - A linked transaction suppresses ONLY its explicit occurrence.
 *  - An independent transaction suppresses NOTHING.
 *  - Multiple linked repayments are ADDITIVE (partial → satisfied); a
 *    non-repayment (income/bill) occurrence admits at most one link (≥2 =
 *    conflict) and a conflict is NEVER resolved by picking first/newest.
 *  - Missing/invalid authoritative expected cents never silently "satisfies" a
 *    repayment occurrence — it fails closed as unresolved/invalid.
 *  - Legacy `recurringOccurrenceKey` links are adapted at the boundary (read
 *    only, never rewritten) when the caller supplies the occurrence's legacyKey.
 *  - Unknown resolution versions fail closed with a typed issue.
 */

import type { Transaction } from '../../types/models';
import { OccurrenceId, OccurrenceSourceKind, isOccurrenceId } from './occurrenceIdentity';

export type OccurrenceState =
  | 'eligible'
  | 'satisfied'
  | 'partially_satisfied'
  | 'independent'
  | 'unresolved'
  | 'conflict'
  | 'invalid';

export type OccurrenceBlockingIssue =
  | { kind: 'invalid_occurrence'; reason: string }
  | { kind: 'invalid_amount'; reason: string; transactionIds: string[] }
  | { kind: 'missing_expected_amount'; reason: string }
  | { kind: 'conflict'; reason: string; transactionIds: string[] }
  | { kind: 'unresolved_ambiguity'; reason: string; transactionIds: string[] }
  | { kind: 'unknown_resolution_version'; reason: string; transactionIds: string[] };

export interface OccurrenceResolutionResult {
  occurrenceId?: OccurrenceId;
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  dateKey?: string;
  state: OccurrenceState;
  /** Repayment occurrences only — the authoritative expected cycle cents. */
  expectedCents?: number;
  satisfiedCents: number;
  remainingCents?: number;
  linkedTransactionIds: string[];
  /** Plain non-customer-facing rationale for the state (copy is chosen by the
   * presentation layer, never here). */
  reason: string;
  blockingIssue?: OccurrenceBlockingIssue;
}

export interface OccurrenceDescriptor {
  /** `undefined` (or a non-oid1 string) makes the occurrence `invalid`. */
  id: OccurrenceId | undefined;
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  dateKey?: string;
  /** Whether partial/satisfied cents logic applies (card/BNPL/loan cycles). */
  isRepayment: boolean;
  /** Authoritative expected cycle cents for a repayment occurrence, ALREADY
   * validated by the caller as a source-supplied figure. Omit when the product
   * model does not authoritatively supply one (then satisfaction cannot be
   * asserted and the occurrence fails closed). Never a minimum/percentage/
   * balance-derived guess. */
  expectedCents?: number;
  /** `${recurringItemId}:${nextDueDateISO}` legacy key, so a pre-A1 repayment
   * linked via `recurringOccurrenceKey` is adapted (read-only) at the boundary. */
  legacyKey?: string;
  /** Ids of unclassified manual transactions that materially collide with this
   * occurrence — supplied by the caller's ambiguity check (which enumerates
   * in-window occurrences; that enumeration lives in the projection layer, not
   * A1). When present, an otherwise-eligible occurrence resolves `unresolved`
   * until the customer classifies those records. Never derived here from
   * amount/label/date. */
  unresolvedCandidateTxnIds?: string[];
}

export type TransactionClassification = 'linked' | 'independent' | 'unresolved' | 'unclassified';

export interface TransactionClassificationResult {
  classification: TransactionClassification;
  occurrenceId?: OccurrenceId;
  /** True when the persisted resolution carries an unrecognised version — the
   * caller must fail closed rather than treat the record as anything trusted. */
  unknownVersion: boolean;
}

function safeCents(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return undefined;
  return cents;
}

/**
 * Per-transaction classification from the canonical resolution field only.
 * Absent field → `unclassified` (legacy / not yet chosen — deliberately NOT
 * `unresolved`, so old data is never globally flagged). An unrecognised version
 * fails closed to `unresolved` with `unknownVersion: true`.
 */
export function classifyTransaction(txn: Pick<Transaction, 'occurrenceResolution'>): TransactionClassificationResult {
  const res = txn.occurrenceResolution;
  if (!res) return { classification: 'unclassified', unknownVersion: false };
  if ((res as { version?: number }).version !== 1) {
    return { classification: 'unresolved', unknownVersion: true };
  }
  if (res.state === 'linked') return { classification: 'linked', occurrenceId: res.occurrenceId, unknownVersion: false };
  if (res.state === 'independent') return { classification: 'independent', unknownVersion: false };
  if (res.state === 'unresolved') return { classification: 'unresolved', unknownVersion: false };
  // Recognised version but unrecognised state — fail closed.
  return { classification: 'unresolved', unknownVersion: true };
}

/** The live transactions that explicitly link to `occ` — canonical first,
 * legacy `recurringOccurrenceKey` adapted only when the caller passed a
 * `legacyKey` and the transaction has no canonical resolution. */
function linkedTransactionsFor(occ: OccurrenceDescriptor, txns: Transaction[]): Transaction[] {
  return txns.filter((t) => {
    const res = t.occurrenceResolution;
    if (res) {
      if ((res as { version?: number }).version !== 1) return false; // untrusted — handled separately
      return res.state === 'linked' && res.occurrenceId === occ.id;
    }
    return !!occ.legacyKey && t.recurringOccurrenceKey === occ.legacyKey;
  });
}

/**
 * The single occurrence-status state machine.
 */
export function resolveOccurrence(occ: OccurrenceDescriptor, txns: Transaction[]): OccurrenceResolutionResult {
  const base = {
    occurrenceId: occ.id,
    sourceKind: occ.sourceKind,
    sourceId: occ.sourceId,
    dateKey: occ.dateKey,
    satisfiedCents: 0,
    linkedTransactionIds: [] as string[],
  };

  // 1. Invalid identity fails closed.
  if (!occ.id || !isOccurrenceId(occ.id)) {
    return { ...base, state: 'invalid', reason: 'occurrence has no valid canonical identity', blockingIssue: { kind: 'invalid_occurrence', reason: 'missing or non-oid1 occurrence id' } };
  }

  // 2. Any transaction claiming THIS occurrence with an unrecognised version
  //    fails the whole occurrence closed (we cannot trust its shape).
  const unknownVersionClaims = txns.filter(
    (t) => t.occurrenceResolution && (t.occurrenceResolution as { version?: number }).version !== 1 && (t.occurrenceResolution as { occurrenceId?: string }).occurrenceId === occ.id
  );
  if (unknownVersionClaims.length > 0) {
    return { ...base, state: 'unresolved', reason: 'a linked transaction carries an unknown resolution version', blockingIssue: { kind: 'unknown_resolution_version', reason: 'unrecognised occurrenceResolution.version', transactionIds: unknownVersionClaims.map((t) => t.id) } };
  }

  const linked = linkedTransactionsFor(occ, txns);
  const linkedTransactionIds = linked.map((t) => t.id);

  // 3. Repayment occurrence — additive cents against an authoritative expected.
  if (occ.isRepayment) {
    // Validate a supplied expected amount.
    if (occ.expectedCents !== undefined && (!Number.isSafeInteger(occ.expectedCents) || occ.expectedCents <= 0)) {
      return { ...base, linkedTransactionIds, state: 'invalid', expectedCents: occ.expectedCents, reason: 'expected cycle amount is not a valid positive integer cents', blockingIssue: { kind: 'invalid_amount', reason: 'expectedCents not a safe positive integer', transactionIds: linkedTransactionIds } };
    }
    // Sum linked repayment cents, failing closed on any invalid amount.
    let satisfiedCents = 0;
    for (const t of linked) {
      const cents = safeCents(t.amount);
      if (cents === undefined) {
        return { ...base, linkedTransactionIds, state: 'invalid', expectedCents: occ.expectedCents, reason: 'a linked repayment has a non-finite/unsafe amount', blockingIssue: { kind: 'invalid_amount', reason: 'linked repayment amount not safe integer cents', transactionIds: [t.id] } };
      }
      satisfiedCents += cents;
    }
    if (satisfiedCents === 0) {
      return { ...base, linkedTransactionIds, state: 'eligible', expectedCents: occ.expectedCents, satisfiedCents: 0, remainingCents: occ.expectedCents, reason: 'no linked repayment yet' };
    }
    if (occ.expectedCents === undefined) {
      return { ...base, linkedTransactionIds, state: 'unresolved', satisfiedCents, reason: 'linked repayment(s) exist but no authoritative expected amount to measure against', blockingIssue: { kind: 'missing_expected_amount', reason: 'expectedCents absent for a repayment with live links' } };
    }
    const remainingCents = Math.max(0, occ.expectedCents - satisfiedCents);
    if (satisfiedCents < occ.expectedCents) {
      return { ...base, linkedTransactionIds, state: 'partially_satisfied', expectedCents: occ.expectedCents, satisfiedCents, remainingCents, reason: 'linked repayments cover part of the expected amount' };
    }
    return { ...base, linkedTransactionIds, state: 'satisfied', expectedCents: occ.expectedCents, satisfiedCents, remainingCents: 0, reason: 'linked repayments cover the expected amount' };
  }

  // 4. Non-repayment (income/bill) occurrence — satisfied by at most one link.
  if (linked.length >= 2) {
    return { ...base, linkedTransactionIds, state: 'conflict', reason: 'more than one live transaction links to a single-satisfaction occurrence', blockingIssue: { kind: 'conflict', reason: 'multiple live links to one income/bill occurrence', transactionIds: linkedTransactionIds } };
  }
  if (linked.length === 1) {
    return { ...base, linkedTransactionIds, state: 'satisfied', satisfiedCents: 0, reason: 'explicitly linked to a recorded transaction' };
  }
  // No live link — eligible, unless a material unclassified collision exists.
  const collide = occ.unresolvedCandidateTxnIds ?? [];
  if (collide.length > 0) {
    return { ...base, state: 'unresolved', reason: 'an unclassified manual record may already cover this occurrence', blockingIssue: { kind: 'unresolved_ambiguity', reason: 'material unclassified manual transaction collides with this occurrence', transactionIds: collide } };
  }
  return { ...base, state: 'eligible', reason: 'no live link and no material ambiguity' };
}

/**
 * Write-time guard for the link transition. Linking `txnId` to a NON-repayment
 * occurrence that already has a different live link is a conflict and must be
 * rejected (never silently overwrite). Repayment occurrences are additive and
 * never conflict on multiplicity.
 */
export function linkWouldConflict(occ: OccurrenceDescriptor, txnId: string, txns: Transaction[]): boolean {
  if (occ.isRepayment) return false;
  const others = linkedTransactionsFor(occ, txns).filter((t) => t.id !== txnId);
  return others.length > 0;
}

/**
 * Candidate ORDERING for the classification UI — closeness by date then amount.
 * This may only ORDER/explain choices; it NEVER establishes identity (the
 * customer still selects an exact occurrence). Returns a new ordered array.
 */
export interface LinkCandidate {
  occurrenceId: OccurrenceId;
  occurrenceDate: Date;
  expectedCents?: number;
  label: string;
  /** True for card/BNPL/loan cycles (partial/satisfied cents apply). */
  isRepayment: boolean;
  /** Display-only fields for consequence-based sheet copy (never identity).
   * `sourceName` is the bill/income name; `dateLabel` the formatted occurrence
   * date; `dueToday` true when the occurrence falls on the transaction's own
   * day; `amountLabel` the formatted expected amount when the source supplies a
   * valid one. All optional so hand-built candidates (tests) still type-check. */
  sourceName?: string;
  dateLabel?: string;
  dueToday?: boolean;
  amountLabel?: string;
}
export function orderLinkCandidates(candidates: LinkCandidate[], txn: Pick<Transaction, 'date' | 'amount'>): LinkCandidate[] {
  const txnTime = new Date(txn.date).getTime();
  const txnCents = safeCents(txn.amount);
  return [...candidates].sort((a, b) => {
    const da = Math.abs(a.occurrenceDate.getTime() - txnTime);
    const db = Math.abs(b.occurrenceDate.getTime() - txnTime);
    if (da !== db) return da - db;
    if (txnCents !== undefined && a.expectedCents !== undefined && b.expectedCents !== undefined) {
      return Math.abs(a.expectedCents - txnCents) - Math.abs(b.expectedCents - txnCents);
    }
    return 0;
  });
}

/**
 * The explicit-choice list for the classification/correction UI. There is
 * deliberately NO preselected/default option: every candidate is rendered as
 * its own "This is …" choice, followed by a single "Keep separate" choice. The
 * customer must tap one — candidate ordering (above) only orders/explains, it
 * never establishes identity. Kept pure (no React Native) so the choice mapping
 * is unit-testable; the sheet component maps these to its Design 5.1 rows.
 */
export interface ClassificationOption {
  key: string;
  label: string;
  description?: string;
  kind: 'link' | 'independent';
  occurrenceId?: OccurrenceId;
  isRepayment?: boolean;
}

export type ClassificationChoice =
  | { kind: 'link'; occurrenceId: OccurrenceId; isRepayment: boolean }
  | { kind: 'independent' };

export const CLASSIFICATION_INDEPENDENT_KEY = 'occ-independent';

export function buildClassificationOptions(orderedCandidates: LinkCandidate[], variant?: 'income' | 'expense'): ClassificationOption[] {
  const links: ClassificationOption[] = orderedCandidates.map((c) => {
    const dueText = c.dueToday ? 'Due today' : c.dateLabel ? `Due ${c.dateLabel}` : undefined;
    if (variant === 'expense' && c.sourceName) {
      // Consequence-based expense copy: bill name as the row, then amount (where
      // valid) and the due date / "Due today". Amount/date are shown for context
      // and deterministic ordering only — never to prove identity.
      const description = [c.amountLabel, dueText].filter(Boolean).join(' · ') || undefined;
      return { key: `occ-link:${c.occurrenceId}`, label: c.sourceName, description, kind: 'link' as const, occurrenceId: c.occurrenceId, isRepayment: c.isRepayment };
    }
    if (variant === 'income' && c.sourceName) {
      const description = [c.amountLabel, c.dateLabel].filter(Boolean).join(' · ') || undefined;
      return { key: `occ-link:${c.occurrenceId}`, label: `This is ${c.sourceName}`, description, kind: 'link' as const, occurrenceId: c.occurrenceId, isRepayment: c.isRepayment };
    }
    // Back-compatible default (no variant / hand-built candidate).
    return { key: `occ-link:${c.occurrenceId}`, label: `This is ${c.label}`, kind: 'link' as const, occurrenceId: c.occurrenceId, isRepayment: c.isRepayment };
  });
  const independent: ClassificationOption =
    variant === 'expense'
      ? { key: CLASSIFICATION_INDEPENDENT_KEY, label: 'No, save separately', description: 'Record this expense without linking it to a bill.', kind: 'independent' }
      : { key: CLASSIFICATION_INDEPENDENT_KEY, label: 'Keep separate', description: 'Not part of a scheduled item', kind: 'independent' };
  return [...links, independent];
}

/** Map a tapped option key back to the customer's choice. Unknown key → undefined
 * (no write). */
export function interpretClassificationSelection(key: string, options: ClassificationOption[]): ClassificationChoice | undefined {
  const opt = options.find((o) => o.key === key);
  if (!opt) return undefined;
  if (opt.kind === 'independent') return { kind: 'independent' };
  if (opt.occurrenceId) return { kind: 'link', occurrenceId: opt.occurrenceId, isRepayment: !!opt.isRepayment };
  return undefined;
}
