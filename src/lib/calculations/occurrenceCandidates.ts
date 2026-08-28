/**
 * A1 — candidate discovery / legacy-ambiguity adapter (pure).
 *
 * Derives the compatible scheduled-occurrence CHOICES a GENERIC manual
 * transaction may be linked to, over the EXISTING authoritative recurrence
 * enumerator (`recurringOccurrencesInRange`) — it never invents a second
 * recurrence engine. Discovery is kept strictly separate from identity
 * resolution: it orders/explains choices only, and NEVER turns date proximity
 * (or any label/amount similarity) into an automatic link. The customer always
 * chooses the exact occurrence.
 *
 * CRITICAL ACCOUNTING BOUNDARY (financial integrity):
 * A generic manual record applies a ONE-SIDED funding-account effect via
 * `applyNewTransaction`. It may therefore only ever be offered a source whose
 * accounting is ALSO one-sided:
 *   - a generic manual INCOME may link only to an income occurrence;
 *   - a generic manual EXPENSE may link only to an ordinary bill / recurring
 *     expense occurrence (no linked liability).
 * Card, BNPL, mortgage, car-loan, personal-loan and supported other-loan
 * repayments are TWO-SIDED (funding account + liability/card balance) and are
 * NEVER surfaced here — they can only be recorded through their dedicated
 * repayment flows, which stamp the canonical relationship themselves. Offering
 * a repayment occurrence as a generic candidate would let a one-sided write
 * mark a liability cycle "satisfied" without ever reducing the liability.
 *
 * A source with invalid/unenumerable authoritative data simply produces no
 * occurrence (or is reported as a non-blocking informational issue) — it is
 * never guessed at and never prevents an otherwise valid manual record.
 */

import type { AppData, RecurringItem } from '../../types/models';
import { recurringOccurrencesInRange } from './recurringSchedule';
import { LinkCandidate, orderLinkCandidates } from './occurrenceResolution';
import { occurrenceIdForRecurringItem, sourceInfoForRecurringItem } from './occurrenceSources';
import { isCanonicalExpenseCategoryId } from './billCategory';

export interface CandidateIssue {
  /** `invalid_transaction` is the only kind that should block recording (the
   * manual transaction itself is unusable). `ineligible_source` /
   * `invalid_source` are INFORMATIONAL: a scheduled source was skipped, never
   * offered and never auto-linked, but recording proceeds regardless. */
  kind: 'invalid_transaction' | 'ineligible_source' | 'invalid_source';
  sourceId: string;
  reason: string;
}

export interface CandidateResult {
  candidates: LinkCandidate[];
  /** Problems encountered. Only a `kind: 'invalid_transaction'` issue should
   * block Save; source-level issues never prevent recording (§6). */
  issues: CandidateIssue[];
}

/**
 * The authoritative candidate window: an occurrence is a plausible match for a
 * manual record only when it falls within this many LOCAL calendar days either
 * side of the transaction date — i.e. the payment was recorded around the
 * scheduled date. Kept deliberately tight so routine expenses far from any due
 * date do not trigger the classification sheet; a genuine on-time (or slightly
 * early/late) payment still surfaces its occurrence, and anything outside the
 * window can still be linked afterwards in the editor. This narrows, it never
 * widens: it uses the existing enumerator and never a second recurrence engine.
 */
export const CANDIDATE_WINDOW_DAYS = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function formatOccurrenceDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Display-only amount label for a bill's own scheduled amount, or undefined
 * when the source does not supply a valid positive amount. Never used to prove
 * identity — the customer still chooses explicitly. */
function formatAmountLabel(amount: number): string | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Number.isInteger(amount) ? `$${amount.toLocaleString()}` : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param windowDays half-width of the local-calendar window centred on the
 *   transaction date (defaults to the authoritative `CANDIDATE_WINDOW_DAYS`).
 *   Bounded and deterministic — the authoritative occurrence window, not a
 *   fuzzy match.
 */
export function deriveOccurrenceCandidates(
  data: AppData,
  txn: { type: 'income' | 'expense'; date: string; amount: number; categoryId?: string },
  windowDays = CANDIDATE_WINDOW_DAYS
): CandidateResult {
  const issues: CandidateIssue[] = [];
  const candidates: LinkCandidate[] = [];

  const txnDate = new Date(txn.date);
  if (Number.isNaN(txnDate.getTime())) {
    return { candidates: [], issues: [{ kind: 'invalid_transaction', sourceId: 'transaction', reason: 'transaction date is invalid' }] };
  }
  const anchor = startOfDay(txnDate);
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - windowDays);
  const to = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + windowDays);

  // Only sources whose accounting matches a generic one-sided record: income
  // occurrences for an income txn; ORDINARY bills (no linked liability) for an
  // expense txn. Every repayment source (card / BNPL / loan) is excluded — it
  // is recorded only through its dedicated two-sided flow.
  const compatibleItems: RecurringItem[] = data.recurringItems.filter((i) => i.active && i.type === txn.type);
  for (const occ of recurringOccurrencesInRange(compatibleItems, from, to)) {
    const info = sourceInfoForRecurringItem(data, occ.item);
    if (!info) {
      // A repayment-family item with a dangling/unsupported liability. Not a
      // generic candidate; informational only, never blocks recording.
      issues.push({ kind: 'ineligible_source', sourceId: occ.item.id, reason: 'scheduled item is a repayment or has an invalid linked liability' });
      continue;
    }
    if (info.isRepayment) {
      // A valid repayment source — belongs to its dedicated flow, not here.
      // Silently skipped (this is expected, not a problem).
      continue;
    }
    // CATEGORY RELEVANCE (expense only). A generic expense may be offered a bill
    // ONLY when their authoritative category ids match — proximity alone is not
    // enough (the device-test defect: a Groceries expense was offered a Gym bill
    // just because both were nearby expenses). A bill with NO authoritative
    // category (a legacy bill, or one never assigned a purpose) is never used to
    // interrupt Save; the transaction saves independently and can still be
    // linked later in the editor. Identity is NEVER inferred from the display
    // name — only the stable category id is compared.
    if (txn.type === 'expense') {
      if (!isCanonicalExpenseCategoryId(occ.item.categoryId)) continue; // no authoritative category → do not interrupt
      if (occ.item.categoryId !== txn.categoryId) continue; // incompatible category → not relevant
    }
    const occurrenceId = occurrenceIdForRecurringItem(data, occ.item, occ.date);
    if (!occurrenceId) {
      issues.push({ kind: 'invalid_source', sourceId: occ.item.id, reason: 'could not build a canonical occurrence id' });
      continue;
    }
    // Non-repayment → no expected-cents contract; a generic link never carries
    // repayment metadata. Display fields are for consequence-based copy only.
    const dateLabel = formatOccurrenceDate(occ.date);
    candidates.push({
      occurrenceId,
      occurrenceDate: occ.date,
      expectedCents: undefined,
      label: `${occ.item.label} — ${dateLabel}`,
      isRepayment: false,
      sourceName: occ.item.label,
      dateLabel,
      dueToday: sameLocalDay(occ.date, anchor),
      amountLabel: formatAmountLabel(occ.item.amount),
    });
  }

  // De-duplicate by occurrence id (defensive), then order by closeness. Ordering
  // NEVER establishes the link — it only presents choices.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => (seen.has(c.occurrenceId) ? false : (seen.add(c.occurrenceId), true)));
  return { candidates: orderLinkCandidates(unique, txn), issues };
}
